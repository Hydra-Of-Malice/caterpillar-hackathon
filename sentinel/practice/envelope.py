"""Expert envelopes: time-normalised P10/P50/P90 bands per phase x channel, plus DTW distance.

Envelopes are distributions over SIMULATED expert cycles, never a single trajectory to copy
(05 §5.6): they coach bounds and smoothness, not speed.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from sentinel.practice.settings import (
    CHANNEL_SIGMA_FLOOR, ENVELOPE_CHANNELS, ENVELOPE_EXIT_Z, N_POINTS, SIGMA_PER_P10_P90,
)
from sentinel.practice.signals import SessionArrays

Curves = dict[str, np.ndarray]     # channel -> N_POINTS resampled curve


def resample(x: np.ndarray, n: int = N_POINTS) -> np.ndarray:
    """Linearly resample a 1-D signal onto ``n`` points of normalised time 0..1."""
    if len(x) == 0:
        return np.zeros(n)
    if len(x) == 1:
        return np.full(n, float(x[0]))
    return np.interp(np.linspace(0.0, 1.0, n), np.linspace(0.0, 1.0, len(x)), x)


def phase_curves(arrays: SessionArrays, idx: np.ndarray) -> Curves:
    """Resampled envelope channels over the given sample indices of one phase."""
    return {ch: resample(arrays.channels[ch][idx]) for ch in ENVELOPE_CHANNELS}


def dtw_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Dynamic-time-warping distance between two (n x c) series, normalised by path length n + m.

    Row-wise vectorised DP: the horizontal dependency D[i, j-1] is solved as a running minimum
    over cumulative costs, so each row is O(m) numpy work.
    """
    a = np.asarray(a, dtype=float).reshape(len(a), -1)
    b = np.asarray(b, dtype=float).reshape(len(b), -1)
    cost = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).sum(axis=-1))
    prev = np.cumsum(cost[0])
    for i in range(1, len(a)):
        c = cost[i]
        tmp = np.empty_like(c)
        tmp[0] = prev[0] + c[0]
        tmp[1:] = c[1:] + np.minimum(prev[1:], prev[:-1])
        csum = np.cumsum(c)
        prev = csum + np.minimum.accumulate(tmp - csum)
    return float(prev[-1] / (len(a) + len(b)))


@dataclass
class PhaseEnvelope:
    """Expert band for one exercise x phase."""
    bands: dict[str, dict[str, np.ndarray]]    # channel -> {"p10","p50","p90","mean","std"}
    sigma: dict[str, np.ndarray]               # channel -> per-point band sigma (floored)
    scale: dict[str, float]                    # channel -> scalar used to standardise DTW inputs
    duration_s: dict[str, float]               # p10 / p50 / p90 phase duration
    dtw_ref: dict[str, float]                  # expert-vs-median DTW p50 / p90
    n_cycles: int
    n_experts: int

    def z(self, channel: str, curve: np.ndarray) -> np.ndarray:
        """Point-wise z of a resampled curve against the expert median band."""
        return (curve - self.bands[channel]["p50"]) / self.sigma[channel]

    def z_at(self, channel: str, value: float, tau: float) -> float:
        """z of a single value at normalised phase time ``tau`` (0..1)."""
        i = int(round(min(max(tau, 0.0), 1.0) * (N_POINTS - 1)))
        return float((value - self.bands[channel]["p50"][i]) / self.sigma[channel][i])

    def exit_fraction(self, curves: Curves) -> dict[str, float]:
        """Per channel: fraction of normalised time with |z| above ENVELOPE_EXIT_Z."""
        return {ch: float(np.mean(np.abs(self.z(ch, curves[ch])) > ENVELOPE_EXIT_Z)) for ch in self.bands}

    def standardised(self, curves: Curves) -> np.ndarray:
        """(N_POINTS x channels) matrix scaled per channel for multichannel DTW."""
        return np.column_stack([curves[ch] / self.scale[ch] for ch in self.bands])

    def dtw_to_median(self, curves: Curves) -> float:
        """Multichannel DTW distance of a curve set to the expert median."""
        median = {ch: b["p50"] for ch, b in self.bands.items()}
        return dtw_distance(self.standardised(curves), self.standardised(median))

    def to_json(self) -> dict[str, Any]:
        """JSON-serialisable form (rounded) for envelopes.json and the report overlay."""
        return {
            "n_cycles": self.n_cycles, "n_experts": self.n_experts,
            "duration_s": {k: round(v, 3) for k, v in self.duration_s.items()},
            "dtw_ref": {k: round(v, 4) for k, v in self.dtw_ref.items()},
            "channels": {ch: {k: np.round(v, 4).tolist() for k, v in b.items()}
                         for ch, b in self.bands.items()},
        }


def build_phase_envelope(curves: list[Curves], durations: list[float], operators: list[str]) -> PhaseEnvelope:
    """Aggregate expert phase curves (one per cycle) into a P10/P50/P90 envelope."""
    bands: dict[str, dict[str, np.ndarray]] = {}
    sigma: dict[str, np.ndarray] = {}
    for ch in ENVELOPE_CHANNELS:
        stack = np.vstack([c[ch] for c in curves])
        p10, p50, p90 = np.percentile(stack, [10, 50, 90], axis=0)
        bands[ch] = {"p10": p10, "p50": p50, "p90": p90, "mean": stack.mean(axis=0), "std": stack.std(axis=0)}
        sigma[ch] = np.maximum((p90 - p10) / SIGMA_PER_P10_P90, CHANNEL_SIGMA_FLOOR[ch])
    env = PhaseEnvelope(
        bands=bands, sigma=sigma, scale={ch: float(np.mean(s)) for ch, s in sigma.items()},
        duration_s=dict(zip(("p10", "p50", "p90"), map(float, np.percentile(durations, [10, 50, 90])))),
        dtw_ref={}, n_cycles=len(curves), n_experts=len(set(operators)),
    )
    ref = [env.dtw_to_median(c) for c in curves]
    env.dtw_ref = {"p50": float(np.percentile(ref, 50)), "p90": float(np.percentile(ref, 90))}
    return env
