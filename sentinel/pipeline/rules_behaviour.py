"""Procedural behaviour rules evaluated per window (config/fusion.yaml `rules`, versioned).

These are behaviour rules for the fusion layer (04 §3 "Procedural violations"). They are
distinct from, and never replace, the independent deterministic safety engine
(sentinel/safety), which owns T-CRIT protections.

Each rule keeps a per-machine `since_ts`: after a hit, samples up to the window end plus
the rule's cooldown are not re-evaluated, so overlapping windows do not duplicate a hit.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from sentinel.pipeline.features import AXES, Window, fast_reversal_onsets, true_runs


@dataclass(frozen=True)
class RuleHit:
    """A procedural rule firing inside a window."""
    rule_id: str
    rule_version: str
    severity: str              # severity level name, e.g. "T1" (mapped to S_proc in fusion)
    t_first: float
    value: float
    threshold: float
    unit: str
    signature: tuple[str, ...]
    evidence: dict[str, Any] = field(default_factory=dict)


def _first_long_run(mask: np.ndarray, min_len: int) -> tuple[int, int] | None:
    for start, stop in true_runs(mask):
        if stop - start >= min_len:
            return start, stop
    return None


class BehaviourRules:
    """Stateful evaluator for fast_swing_near_truck, harsh_reversal_burst and
    travel_with_bucket_raised."""

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.rcfg: dict[str, Any] = cfg["rules"]
        self.fcfg: dict[str, Any] = cfg["features"]
        self.version: str = self.rcfg["version"]
        self._since: dict[tuple[str, str], float] = {}

    def evaluate(self, w: Window) -> list[RuleHit]:
        """Return new rule hits in this window and arm each hit rule's cooldown."""
        hits: list[RuleHit] = []
        checks = (
            ("fast_swing_near_truck", self._fast_swing_near_truck),
            ("harsh_reversal_burst", self._harsh_reversal_burst),
            ("travel_with_bucket_raised", self._travel_with_bucket_raised),
        )
        for rule_id, check in checks:
            rc = self.rcfg.get(rule_id, {})
            if not rc.get("enabled", True):
                continue
            key = (w.meta.machine_id, rule_id)
            fresh = w.col("ts") > self._since.get(key, -np.inf)
            hit = check(w, rc, fresh)
            if hit is not None:
                hits.append(hit)
                self._since[key] = w.t_end + float(rc["cooldown_s"])
        return hits

    def _hit(self, rule_id: str, rc: dict[str, Any], t_first: float, value: float,
             threshold: float, unit: str, **evidence: Any) -> RuleHit:
        return RuleHit(rule_id, self.version, rc["severity"], t_first, round(value, 3),
                       threshold, unit, tuple(rc.get("signature", ())), evidence)

    def _fast_swing_near_truck(self, w: Window, rc: dict[str, Any], fresh: np.ndarray) -> RuleHit | None:
        if w.variant != "BC":
            return None                      # needs Tier C bucket-to-truck distance
        swing = np.abs(w.col("swing_dps"))
        with np.errstate(invalid="ignore"):
            mask = fresh & (w.col("bucket_to_truck_m") < rc["near_truck_m"]) & (swing > rc["swing_dps"])
        run = _first_long_run(mask, max(1, int(round(rc["min_duration_s"] / w.dt))))
        if run is None:
            return None
        peak = float(swing[mask].max())
        return self._hit("fast_swing_near_truck", rc, float(w.col("ts")[run[0]]), peak,
                         float(rc["swing_dps"]), "°/s", near_truck_m=rc["near_truck_m"],
                         min_bucket_to_truck_m=round(float(np.nanmin(w.col("bucket_to_truck_m")[mask])), 2))

    def _harsh_reversal_burst(self, w: Window, rc: dict[str, Any], fresh: np.ndarray) -> RuleHit | None:
        ts = w.col("ts")
        onsets: list[float] = []
        per_axis: dict[str, int] = {}
        for axis in AXES:
            idx = fast_reversal_onsets(w.col(axis), w.dt, self.fcfg["fast_reversal_delta"],
                                       self.fcfg["fast_reversal_leg_s"])
            idx = idx[fresh[idx]] if len(idx) else idx
            per_axis[axis] = int(len(idx))
            onsets.extend(ts[idx].tolist())
        if len(onsets) < rc["min_count"]:
            return None
        return self._hit("harsh_reversal_burst", rc, float(min(onsets)), float(len(onsets)),
                         float(rc["min_count"]), "fast reversals / 20 s", per_axis=per_axis)

    def _travel_with_bucket_raised(self, w: Window, rc: dict[str, Any], fresh: np.ndarray) -> RuleHit | None:
        mask = fresh & (w.col("travel_kmh") > rc["travel_kmh"]) & (w.col("boom_angle_deg") > rc["boom_deg"])
        run = _first_long_run(mask, max(1, int(round(rc["min_duration_s"] / w.dt))))
        if run is None:
            return None
        start, stop = run
        return self._hit("travel_with_bucket_raised", rc, float(w.col("ts")[start]),
                         float(w.col("boom_angle_deg")[start:stop].max()), float(rc["boom_deg"]), "°",
                         duration_s=round((stop - start) * w.dt, 1),
                         travel_kmh_max=round(float(w.col("travel_kmh")[start:stop].max()), 2))
