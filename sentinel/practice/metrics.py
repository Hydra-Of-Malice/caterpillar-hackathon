"""Per-cycle skill metrics, expert metric distributions and safety flags."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
from scipy.signal import savgol_filter

from sentinel.practice.envelope import Curves, PhaseEnvelope, phase_curves
from sentinel.practice.phases import DIG, DUMP, SWING_EMPTY, SWING_LOADED, Cycle
from sentinel.practice.settings import (
    ALL_PHASES, JOY_ACTIVE, NEAR_TRUCK_M, NEAR_TRUCK_SUSTAIN_S, REVERSAL_HYSTERESIS, SAFETY_CAPS, SAFETY_FLAGS,
    SIGMA_PER_P10_P90, WORK_PHASES,
)
from sentinel.practice.signals import IDLE, PHASE_INDEX, SessionArrays
from sentinel.shared.schemas import CycleMetric

Better = Literal["higher", "lower", "band"]


@dataclass(frozen=True)
class MetricSpec:
    """Metric definition. ``floor`` is the minimum band width used for distances."""
    name: str
    label: str
    unit: str
    better: Better
    floor: float


METRIC_SPECS: tuple[MetricSpec, ...] = (
    MetricSpec("cycle_time_s", "Cycle time", "s", "band", 0.5),
    MetricSpec("dig_s", "Dig duration", "s", "band", 0.3),
    MetricSpec("swing_loaded_s", "Loaded swing duration", "s", "band", 0.3),
    MetricSpec("dump_s", "Dump duration", "s", "band", 0.3),
    MetricSpec("swing_empty_s", "Return swing duration", "s", "band", 0.3),
    MetricSpec("swing_peak_dps", "Peak loaded swing speed", "deg/s", "band", 2.0),
    MetricSpec("swing_near_truck_dps", "Swing speed within 5 m of the truck", "deg/s", "lower", 2.0),
    MetricSpec("swing_smoothness", "Swing smoothness (log dimensionless jerk, higher = smoother)", "", "higher", 0.3),
    MetricSpec("dig_stick_reversals", "Stick direction changes during the dig", "count", "lower", 1.0),
    MetricSpec("swing_lever_reversals", "Swing lever direction changes", "count", "lower", 1.0),
    MetricSpec("boom_swing_overlap", "Boom raised while swinging", "ratio", "higher", 0.05),
    MetricSpec("idle_gap_s", "Pauses between phases", "s", "lower", 0.3),
    MetricSpec("bucket_fill_t", "Bucket fill", "t", "higher", 0.05),
    MetricSpec("swing_overshoot_deg", "Swing overshoot past the dump point", "deg", "lower", 1.0),
    MetricSpec("envelope_exit_frac", "Time outside the expert envelope", "ratio", "lower", 0.02),
)
SPECS: dict[str, MetricSpec] = {s.name: s for s in METRIC_SPECS}
METRIC_NAMES: tuple[str, ...] = tuple(SPECS)


# ---------------------------------------------------------------- signal helpers
def count_reversals(x: np.ndarray, hysteresis: float = REVERSAL_HYSTERESIS) -> int:
    """Direction changes of a lever signal that travel more than ``hysteresis`` (stop-start corrections)."""
    if len(x) == 0:
        return 0
    ref, direction, count = float(x[0]), 0, 0
    for v in x[1:]:
        if direction == 0:
            if abs(v - ref) > hysteresis:
                direction, ref = (1 if v > ref else -1), v
        elif (v - ref) * direction > 0:
            ref = v
        elif abs(v - ref) > hysteresis:
            count, direction, ref = count + 1, -direction, v
    return count


def log_dimensionless_jerk(speed: np.ndarray, dt: float) -> float:
    """LDLJ of a speed profile (Hogan & Sternad 2009 style): higher (less negative) is smoother."""
    v = np.abs(speed)
    if len(v) < 5 or v.max() < 1e-6:
        return float("nan")
    jerk = savgol_filter(v, window_length=5, polyorder=2, deriv=2, delta=dt)
    duration = len(v) * dt
    dlj = (duration ** 3 / v.max() ** 2) * float(np.sum(jerk ** 2)) * dt
    return -math.log(max(dlj, 1e-12))


def sustained_peak(arrays: SessionArrays, idx: np.ndarray, n: int) -> float:
    """Highest |swing speed| held for ``n`` consecutive samples within ``idx`` (plain peak if too short)."""
    speed = np.zeros(arrays.n)
    speed[idx] = np.abs(arrays.channels["swing_dps"][idx])
    span = speed[idx.min(): idx.max() + 1]
    if len(span) < n:
        return float(span.max())
    return float(np.lib.stride_tricks.sliding_window_view(span, n).min(axis=1).max())


# ---------------------------------------------------------------- per-cycle metrics
def kinematic_metrics(arrays: SessionArrays, cycle: Cycle) -> dict[str, float]:
    """All per-cycle metrics except the envelope-exit fraction. Undefined metrics are omitted."""
    ch, dt = arrays.channels, arrays.dt
    dig, loaded, dump, empty = (cycle.phase_idx(p) for p in (DIG, SWING_LOADED, DUMP, SWING_EMPTY))
    m: dict[str, float] = {
        "cycle_time_s": float(arrays.ts[cycle.i1 - 1] - arrays.ts[cycle.i0] + dt),
        "dig_s": len(dig) * dt, "swing_loaded_s": len(loaded) * dt,
        "dump_s": len(dump) * dt, "swing_empty_s": len(empty) * dt,
        "swing_peak_dps": float(np.max(np.abs(ch["swing_dps"][loaded]))),
        "dig_stick_reversals": float(count_reversals(ch["joy_stick"][dig])),
        "swing_lever_reversals": float(count_reversals(ch["joy_swing"][loaded]) + count_reversals(ch["joy_swing"][empty])),
        "idle_gap_s": len(cycle.phase_idx(IDLE)) * dt,
        "bucket_fill_t": float(np.median(ch["payload_t"][loaded])),
    }
    smooth = log_dimensionless_jerk(ch["swing_dps"][loaded], dt)
    if not math.isnan(smooth):
        m["swing_smoothness"] = smooth
    swinging = np.abs(ch["joy_swing"][loaded]) > JOY_ACTIVE
    boom_up = ch["joy_boom"][loaded] > JOY_ACTIVE
    m["boom_swing_overlap"] = float((swinging & boom_up).sum() / max(swinging.sum(), 1))
    approach = np.concatenate([loaded, dump])
    near = approach[arrays.truck_m[approach] < NEAR_TRUCK_M]
    if len(near):
        m["swing_near_truck_dps"] = sustained_peak(arrays, near, int(round(NEAR_TRUCK_SUSTAIN_S / dt)) + 1)
    dump_angle = float(np.median(ch["swing_angle_deg"][dump]))
    m["swing_overshoot_deg"] = max(0.0, float(np.max(ch["swing_angle_deg"][approach])) - dump_angle)
    return m


def envelope_details(arrays: SessionArrays, cycle: Cycle,
                     envelopes: dict[str, PhaseEnvelope]) -> tuple[float, dict[str, dict[str, Any]]]:
    """Envelope-exit fraction over all phases x channels, plus per-phase curves, exits and DTW."""
    details: dict[str, dict[str, Any]] = {}
    exits: list[float] = []
    for phase in WORK_PHASES:
        idx = cycle.phase_idx(PHASE_INDEX[phase])
        env = envelopes.get(phase)
        if env is None or len(idx) == 0:
            continue
        curves: Curves = phase_curves(arrays, idx)
        exit_by_ch = env.exit_fraction(curves)
        exits.extend(exit_by_ch.values())
        details[phase] = {"curves": curves, "exit": exit_by_ch, "dtw": env.dtw_to_median(curves)}
    return (float(np.mean(exits)) if exits else 0.0), details


def safety_flags(metrics: dict[str, float], truck_present: bool = True) -> list[str]:
    """Site safety-cap violations for one cycle (fixed caps, never learned from data).

    Both caps concern the haul truck, so an exercise without a truck (e.g. trench to spoil)
    raises no flag.
    """
    if not truck_present:
        return []
    return [SAFETY_FLAGS[k] for k, cap in SAFETY_CAPS.items() if metrics.get(k, 0.0) > cap]


def phase_table(arrays: SessionArrays, cycle: Cycle) -> list[dict[str, Any]]:
    """Phase runs of a cycle for the report: phase, t_start, t_end, duration_s."""
    dt = arrays.dt
    return [{"phase": ALL_PHASES[ph], "t_start": round(float(arrays.ts[s]), 3),
             "t_end": round(float(arrays.ts[e - 1] + dt), 3), "duration_s": round((e - s) * dt, 2)}
            for ph, s, e in cycle.segments]


# ---------------------------------------------------------------- expert distributions
@dataclass
class MetricDistribution:
    """Expert distribution of one metric (SIMULATED experts, safety-filtered cycles)."""
    spec: MetricSpec
    values: np.ndarray
    p10: float = field(init=False)
    p50: float = field(init=False)
    p90: float = field(init=False)
    spread: float = field(init=False)

    def __post_init__(self) -> None:
        self.p10, self.p50, self.p90 = (float(v) for v in np.percentile(self.values, [10, 50, 90]))
        # band width P90 - P10, floored per metric and relative to the median
        self.spread = max(self.p90 - self.p10, self.spec.floor, 0.05 * abs(self.p50))

    def percentile(self, value: float) -> float:
        """Mid-rank ECDF of the expert values at ``value`` (0..1)."""
        lo = np.searchsorted(self.values, value, side="left")
        hi = np.searchsorted(self.values, value, side="right")
        return float((lo + hi) / (2 * len(self.values)))

    def distance(self, value: float) -> float:
        """How far outside the expert band (in band widths) the value sits in the worse direction."""
        above, below = max(0.0, value - self.p90), max(0.0, self.p10 - value)
        gap = {"lower": above, "higher": below, "band": max(above, below)}[self.spec.better]
        return gap / self.spread

    def status(self, value: float) -> Literal["expert_like", "near", "needs_work"]:
        d = self.distance(value)
        return "expert_like" if d == 0 else "near" if d <= 0.5 else "needs_work"

    def band_edge_value(self, band_widths: float) -> float:
        """The value ``band_widths`` band-widths outside the expert band on the worse side."""
        if self.spec.better == "higher":
            return self.p10 - band_widths * self.spread
        return self.p90 + band_widths * self.spread

    def scorer_z(self, value: float) -> float:
        """Robust z vs the expert median; being better than the median is never penalised."""
        z = (value - self.p50) / (self.spread / SIGMA_PER_P10_P90)
        return {"lower": max(z, 0.0), "higher": min(z, 0.0), "band": z}[self.spec.better]

    def cycle_metric(self, value: float) -> CycleMetric:
        return CycleMetric(
            name=self.spec.name, label=self.spec.label, value=round(float(value), 4), unit=self.spec.unit,
            expert_p10=round(self.p10, 4), expert_p50=round(self.p50, 4), expert_p90=round(self.p90, 4),
            percentile_vs_expert=round(self.percentile(value), 4), better=self.spec.better,
            status=self.status(value),
        )

    def to_json(self) -> dict[str, Any]:
        return {"label": self.spec.label, "unit": self.spec.unit, "better": self.spec.better,
                "p10": round(self.p10, 4), "p50": round(self.p50, 4), "p90": round(self.p90, 4),
                "n": len(self.values)}


def summarise(cycle_metrics: list[dict[str, float]]) -> dict[str, float]:
    """Session value per metric: the median across cycles where the metric is defined."""
    return {name: float(np.median([m[name] for m in cycle_metrics if name in m]))
            for name in METRIC_NAMES if any(name in m for m in cycle_metrics)}


def fit_distributions(rows: list[dict[str, float]], min_n: int = 5) -> dict[str, MetricDistribution]:
    """Expert distributions for every metric with at least ``min_n`` observed values."""
    out: dict[str, MetricDistribution] = {}
    for spec in METRIC_SPECS:
        vals = np.sort(np.array([r[spec.name] for r in rows if spec.name in r], dtype=float))
        if len(vals) >= min_n:
            out[spec.name] = MetricDistribution(spec=spec, values=vals)
    return out
