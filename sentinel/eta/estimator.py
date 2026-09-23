"""TaskTimeEstimator — P10/P50/P90 task duration with remaining-time updates (R5, 09 §7).

Order of methods:
1. Model: LightGBM quantile boosters on log(min/unit) + CQR offset (needs >= 30 similar tasks).
2. Low data (< 30 similar tasks): median rate by type × quantity with a widened empirical band.
3. No history for the type: cycles = qty ÷ (bucket × 0.85 fill) × 20 s (+ waits), band ±50 %.
If no trained model exists, method 2's median-by-type baseline is used for every task.
Every estimate is labelled SIMULATED: the history it is fitted on is generated.
"""
from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any

import numpy as np

from sentinel.eta.features import CATEGORIES, FEATURES, build_features, driver_label, encode
from sentinel.eta.history import generate_history
from sentinel.eta.model import (LOW_DATA_MIN_SIMILAR, LOW_DATA_WIDEN, NOMINAL_COVERAGE, Z90, BaselineStats,
                                ModelBundle, latest_version_dir)
from sentinel.shared.schemas import Provenance, TaskEstimate

log = logging.getLogger("sentinel.eta")

BASELINE_VERSION = "tasktime-baseline-median@1.0.0"
BUCKET_M3 = 1.2
FILL_FACTOR = 0.85
CYCLE_S = 20.0
TRENCH_WIDTH_M = 1.0
DEFAULT_TRENCH_DEPTH_M = 1.5
CYCLE_LOG_SD = 0.35          # per-cycle log-time spread incl. truck waits (in-progress update)
PACE_DRIFT_SD = 0.12         # log-scale drift of the pace over the rest of a task (waits are correlated)
MAX_DRIVERS = 4
MIN_DRIVER_MIN = 0.5


def expected_cycles(task_type: str, qty: float, depth_m: float | None = None) -> float:
    """Bucket cycles needed for the task quantity (m³, or trench metres × cross-section)."""
    per_cycle_m3 = BUCKET_M3 * FILL_FACTOR
    if task_type == "trenching":
        return max(1.0, qty * TRENCH_WIDTH_M * (depth_m or DEFAULT_TRENCH_DEPTH_M) / per_cycle_m3)
    return max(1.0, qty / per_cycle_m3)


def remaining_minutes(p10: float, p50: float, p90: float, progress_frac: float,
                      elapsed_min: float | None = None, n_cycles: float | None = None) -> tuple[float, float, float]:
    """Remaining-time quantiles after ``progress_frac`` of the task (09 §7 in-progress update).

    Without elapsed time the pre-task quantiles scale by (1 − progress). With elapsed time, a
    Normal–Normal update on the log total duration combines the pre-task prior (from the
    conformalised band) with the observed pace; the band narrows as cycles accumulate.
    """
    p = min(max(progress_frac, 0.0), 1.0)
    if p >= 1.0:
        return 0.0, 0.0, 0.0
    if elapsed_min is None or elapsed_min <= 0 or p < 0.02:
        return (1 - p) * p10, (1 - p) * p50, (1 - p) * p90
    n = max(n_cycles or 50.0, 1.0)
    mu0 = math.log(p50)
    var0 = max((math.log(p90) - math.log(p10)) / (2 * Z90), 0.05) ** 2
    var_obs = CYCLE_LOG_SD ** 2 / max(p * n, 1.0)
    post_var = 1.0 / (1.0 / var0 + 1.0 / var_obs)
    post_mu = post_var * (mu0 / var0 + math.log(elapsed_min / p) / var_obs)
    sd = math.sqrt(post_var + CYCLE_LOG_SD ** 2 / max((1 - p) * n, 1.0) + PACE_DRIFT_SD ** 2 * (1 - p))
    base = (1 - p) * math.exp(post_mu)
    return base * math.exp(-Z90 * sd), base, base * math.exp(Z90 * sd)


class TaskTimeEstimator:
    """Estimate task duration quantiles; see module docstring for the method order."""

    def __init__(self, bundle: ModelBundle | None, baseline: BaselineStats) -> None:
        self._bundle = bundle
        self._baseline = baseline

    @classmethod
    def load(cls, models_dir: Path | None = None,
             history: list[dict[str, Any]] | None = None) -> "TaskTimeEstimator":
        """Latest bundle from models/tasktime/, else baseline mode: per-type quantiles of ``history``
        (the seeded task_history rows; generated SIMULATED history when none are given)."""
        directory = latest_version_dir(models_dir)
        if directory is not None:
            try:
                bundle = ModelBundle.load(directory)
                return cls(bundle, bundle.baseline)
            except Exception:                                   # corrupt bundle → keep working on baseline
                log.exception("failed to load task-time model from %s; using baseline", directory)
        else:
            log.warning("no trained task-time model found; using the median-by-type baseline")
        return cls(None, BaselineStats.from_records(history or generate_history()))

    @property
    def baseline_mode(self) -> bool:
        return self._bundle is None or not self._bundle.use_model

    @property
    def model_version(self) -> str:
        if self._bundle is not None and self._bundle.use_model:
            return self._bundle.model_version
        return BASELINE_VERSION

    def estimate(self, task: dict, operator: dict, conditions: dict, progress_frac: float = 0.0) -> TaskEstimate:
        """P10/P50/P90 minutes for the whole task plus remaining time at ``progress_frac``.

        ``task`` uses TaskRow field names (type, planned_qty, material, first_on_site, started_at,
        meta.planned_start, machine_id) and may carry ``elapsed_min`` for the in-progress update.
        """
        task_type = str(task.get("type") or task.get("task_type") or "")
        qty = max(float(task.get("planned_qty") or task.get("qty") or 1.0), 1e-3)
        material = task.get("material") or "clay_gravel"
        n_similar = self._baseline.n_similar(task_type, material, qty)
        guess = self._baseline_minutes(task_type, qty, task)[1]
        feats = build_features(task, operator, conditions, guess)
        drivers: list[dict[str, Any]] = []
        low_data = n_similar < LOW_DATA_MIN_SIMILAR
        if self._model_applies(task_type) and not low_data:
            (p10, p50, p90), drivers = self._model_estimate(feats, task, operator, conditions)
            version, provenance = self.model_version, [Provenance.ML, Provenance.SIMULATED]
        else:
            p10, p50, p90 = self._baseline_minutes(task_type, qty, task, widen=low_data)
            version, provenance = BASELINE_VERSION, [Provenance.RULE, Provenance.SIMULATED]
            if task_type not in self._baseline.per_type:
                low_data, n_similar = True, 0
        r10, r50, r90 = remaining_minutes(
            p10, p50, p90, progress_frac, _elapsed_min(task, conditions),
            expected_cycles(task_type, qty, (task.get("meta") or {}).get("depth_m")))
        return TaskEstimate(
            task_id=str(task.get("task_id") or "preview"),
            p10_min=round(p10, 1), p50_min=round(p50, 1), p90_min=round(p90, 1),
            nominal_coverage=NOMINAL_COVERAGE,
            remaining_p10_min=round(r10, 1), remaining_p50_min=round(r50, 1), remaining_p90_min=round(r90, 1),
            drivers=drivers, n_similar=n_similar, low_data=low_data, model_version=version, provenance=provenance)

    # ------------------------------------------------------------------ internals
    def _model_applies(self, task_type: str) -> bool:
        return (self._bundle is not None and self._bundle.use_model
                and task_type in CATEGORIES["task_type"])

    def _model_estimate(self, feats: dict[str, Any], task: dict, operator: dict,
                        conditions: dict) -> tuple[tuple[float, float, float], list[dict[str, Any]]]:
        assert self._bundle is not None
        qty = feats["qty"]
        X = np.asarray([encode(feats)])
        q = self._bundle.predict_log(X, [feats["task_type"]])[0]
        if conditions.get("rain_from_ts") is not None:            # rain overlap depends on duration: refine once
            feats = build_features(task, operator, conditions, qty * math.exp(q[1]))
            X = np.asarray([encode(feats)])
            q = self._bundle.predict_log(X, [feats["task_type"]])[0]
        minutes = tuple(float(qty * math.exp(v)) for v in q)
        return minutes, self._drivers(X, feats, minutes[1])

    def _drivers(self, X: np.ndarray, feats: dict[str, Any], p50_min: float) -> list[dict[str, Any]]:
        """Top factor contributions of the P50 model, converted from log space to minutes."""
        assert self._bundle is not None
        contrib = self._bundle.p50_contributions(X)[0]
        out = []
        for i, name in enumerate(FEATURES):
            if name == "task_type":
                continue
            delta = p50_min * (1.0 - math.exp(-float(contrib[i])))
            if abs(delta) >= MIN_DRIVER_MIN:
                factor, label = driver_label(name, feats)
                out.append({"factor": factor, "label": label, "delta_min": round(delta, 1)})
        out.sort(key=lambda d: abs(d["delta_min"]), reverse=True)
        return out[:MAX_DRIVERS]

    def _baseline_minutes(self, task_type: str, qty: float, task: dict,
                          widen: bool = False) -> tuple[float, float, float]:
        stats = self._baseline.per_type.get(task_type)
        if stats is None:                                          # no history at all: cycle rule, ±50 %
            cycles = expected_cycles(task_type, qty, (task.get("meta") or {}).get("depth_m"))
            p50 = cycles * CYCLE_S / 60.0 * (1.35 if task_type == "truck_loading" else 1.0)
            return 0.5 * p50, p50, 1.5 * p50
        med, lo, hi = stats["median_lr"], stats["p10_lr"], stats["p90_lr"]
        if widen:
            lo, hi = med - LOW_DATA_WIDEN * (med - lo), med + LOW_DATA_WIDEN * (hi - med)
        return qty * math.exp(lo), qty * math.exp(med), qty * math.exp(hi)


def _elapsed_min(task: dict, conditions: dict) -> float | None:
    if task.get("elapsed_min") is not None:
        return float(task["elapsed_min"])
    now = task.get("now_ts") or conditions.get("now_ts")
    if task.get("started_at") and now:
        return max(0.0, (float(now) - float(task["started_at"])) / 60.0)
    return None
