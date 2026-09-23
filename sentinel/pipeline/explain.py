"""Robust-z explanations against the context baseline (04 §7).

z_j = (x_j - median_c,j) / scale_c,j, where scale is 1.4826·MAD. For sparse count
features whose MAD is 0, the scale falls back to 1.2533·mean absolute deviation, then to
a small floor, so a rare non-zero value still ranks as a strong deviation.

The same z vector drives the fusion direction indicator d (04 §5.3): d = 1 when
risk-direction features carry at least half of the deviation mass.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np

from sentinel.pipeline.features import FEATURE_SPECS
from sentinel.shared.schemas import FeatureContribution

SCALE_FLOOR = 1e-3
RISK_Z_MIN = 1.0      # a risk-direction deviation ranks first only beyond 1 robust SD


@dataclass(frozen=True)
class Baseline:
    """Per-feature median and robust scale for one context × variant."""
    median: dict[str, float]
    scale: dict[str, float]
    n: int

    def to_dict(self) -> dict[str, Any]:
        return {"median": self.median, "scale": self.scale, "n": self.n}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Baseline":
        return cls(dict(d["median"]), dict(d["scale"]), int(d["n"]))


def default_baseline(cfg: dict[str, Any]) -> Baseline | None:
    """Hand-set fallback baseline from config (`default_baseline`), used without a model."""
    section = cfg.get("default_baseline")
    if not section:
        return None
    feats = section["features"]
    return Baseline({f: float(v[0]) for f, v in feats.items()},
                    {f: max(float(v[1]), SCALE_FLOOR) for f, v in feats.items()}, 0)


def fit_baseline(X: np.ndarray, names: list[str]) -> Baseline:
    """Median / robust-scale baseline from training windows (rows) of the named features."""
    med = np.median(X, axis=0)
    mad = 1.4826 * np.median(np.abs(X - med), axis=0)
    mean_ad = 1.2533 * np.mean(np.abs(X - med), axis=0)
    scale = np.where(mad > SCALE_FLOOR, mad, np.maximum(mean_ad, SCALE_FLOOR))
    return Baseline({n: float(m) for n, m in zip(names, med)},
                    {n: float(s) for n, s in zip(names, scale)}, int(X.shape[0]))


def robust_z(features: dict[str, float], baseline: Baseline) -> dict[str, float]:
    """Robust z-scores for every feature that has a baseline."""
    return {f: (features[f] - baseline.median[f]) / baseline.scale[f]
            for f in baseline.median if f in features}


def risk_oriented(feature: str, z: float) -> float:
    """z in the feature's risk direction (positive = riskier); 0 for context features."""
    risk = FEATURE_SPECS[feature].risk
    return z if risk == "high" else -z if risk == "low" else 0.0


def direction_indicator(z: dict[str, float], gated: Iterable[str], cfg: dict[str, Any]) -> tuple[int, float]:
    """(d, risk share): d = 1 if risk-direction deviation mass >= risk_mass_min of the total."""
    excess, clip = float(cfg["z_excess"]), float(cfg["z_clip"])
    gated = set(gated)
    total = risk = 0.0
    for f, zf in z.items():
        if f in gated:
            continue
        mass = min(max(abs(zf) - excess, 0.0), clip)
        total += mass
        if risk_oriented(f, zf) > 0:
            risk += mass
    share = risk / total if total > 0 else 0.0
    return int(total > 0 and share >= float(cfg["risk_mass_min"])), share


def top_contributions(features: dict[str, float], baseline: Baseline, k: int = 3,
                      gated: Iterable[str] = (), prefer: Iterable[str] = ()) -> list[FeatureContribution]:
    """Top-k deviations: `prefer` features (e.g. a rule's signature) with oriented z ≥ 1,
    then other risk-direction features (oriented z ≥ 1), then the rest by |z|.

    FeatureContribution.baseline_mean carries the baseline median and baseline_std the
    robust scale (schema field names).
    """
    z = robust_z(features, baseline)
    gated, prefer = set(gated), set(prefer)

    def rank(f: str) -> tuple[int, float]:
        oriented = risk_oriented(f, z[f])
        if oriented >= RISK_Z_MIN:
            return (2 if f in prefer else 1, oriented)
        return (0, abs(z[f]))

    ranked = sorted((f for f in z if f not in gated), key=rank, reverse=True)
    out: list[FeatureContribution] = []
    for f in ranked[:k]:
        spec = FEATURE_SPECS[f]
        out.append(FeatureContribution(
            feature=f, label=spec.label, value=round(features[f], 4),
            baseline_mean=round(baseline.median[f], 4), baseline_std=round(baseline.scale[f], 4),
            z=round(z[f], 3), unit=spec.unit, direction="high" if z[f] >= 0 else "low",
        ))
    return out


def signature_of(contributions: list[FeatureContribution]) -> str | None:
    """Signature feature of an explanation: the top risk-direction feature, if any."""
    for c in contributions:
        if risk_oriented(c.feature, c.z) >= RISK_Z_MIN:
            return c.feature
    return None
