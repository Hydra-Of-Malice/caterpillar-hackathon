"""Task-time estimation: baseline mode (today), non-crossing, low-data, remaining time, coverage (SIMULATED).

The LightGBM training tests are deferred with model training (run with SENTINEL_TRAIN_TESTS=1).
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from sentinel.eta.estimator import TaskTimeEstimator, remaining_minutes
from sentinel.eta.history import generate_history
from sentinel.eta.model import BaselineStats, apply_cqr, log_rate, non_crossing

OPERATOR = {"operating_hours": 212.0}
CONDITIONS = {"temp_c": 31.0, "now_ts": 1_790_000_000.0}


@pytest.fixture(scope="module")
def history():
    return generate_history(n=1500, seed=42)


@pytest.fixture(scope="module")
def baseline_estimator(history, tmp_path_factory) -> TaskTimeEstimator:
    empty_models = tmp_path_factory.mktemp("no_models")                     # no bundle → baseline mode
    return TaskTimeEstimator.load(empty_models, history=history)


def task(**kw):
    base = {"task_id": "T-1", "type": "truck_loading", "planned_qty": 420.0, "material": "clay_gravel",
            "meta": {"planned_start": 1_790_000_000.0}}
    return {**base, **kw}


def test_history_is_deterministic_and_simulated(history):
    again = generate_history(n=1500, seed=42)
    assert [r["duration_min"] for r in again[:20]] == [r["duration_min"] for r in history[:20]]
    assert all(r["simulated"] for r in history)
    assert [r["completed_at"] for r in history] == sorted(r["completed_at"] for r in history)


def test_history_has_realistic_drivers(history):
    rate = lambda pred: np.median([log_rate(r["duration_min"], r["features"]["qty"])  # noqa: E731
                                   for r in history if r["task_type"] == "trenching" and pred(r["features"])])
    assert rate(lambda f: f["material"] == "rock") > rate(lambda f: f["material"] == "sand")
    assert rate(lambda f: f["exp_h"] < 1000) > rate(lambda f: f["exp_h"] > 5000)


def test_baseline_mode_estimate(baseline_estimator):
    est = baseline_estimator.estimate(task(), OPERATOR, CONDITIONS)
    assert baseline_estimator.baseline_mode and est.model_version.startswith("tasktime-baseline")
    assert est.p10_min < est.p50_min < est.p90_min and est.nominal_coverage == 0.8
    assert est.n_similar >= 30 and not est.low_data
    assert est.remaining_p50_min == est.p50_min


def test_low_data_and_no_history_fallbacks(baseline_estimator):
    rare = baseline_estimator.estimate(task(type="trenching", planned_qty=2000.0, material="rock"), OPERATOR,
                                       CONDITIONS)
    common = baseline_estimator.estimate(task(type="trenching", planned_qty=60.0, material="rock"), OPERATOR,
                                         CONDITIONS)
    assert rare.low_data and rare.n_similar < 30
    rel = lambda e: (e.p90_min - e.p10_min) / e.p50_min                     # noqa: E731
    assert rel(rare) > rel(common)                                          # wider range when data is scarce
    grading = baseline_estimator.estimate(task(type="grading", planned_qty=200.0), OPERATOR, CONDITIONS)
    assert grading.low_data and grading.n_similar == 0
    assert grading.p10_min == pytest.approx(0.5 * grading.p50_min, rel=0.01)  # cycle rule, ±50 %


@settings(max_examples=60, deadline=None)
@given(task_type=st.sampled_from(["truck_loading", "trenching", "stockpile", "grading"]),
       qty=st.floats(1.0, 3000.0), material=st.sampled_from(["clay_gravel", "sand", "topsoil", "rock", "silt"]),
       exp_h=st.floats(0.0, 30000.0), progress=st.floats(0.0, 1.0), elapsed=st.one_of(st.none(), st.floats(1, 900)))
def test_quantiles_never_cross(baseline_estimator, task_type, qty, material, exp_h, progress, elapsed):
    t = task(type=task_type, planned_qty=qty, material=material, elapsed_min=elapsed)
    e = baseline_estimator.estimate(t, {"operating_hours": exp_h}, CONDITIONS, progress_frac=progress)
    assert 0 < e.p10_min <= e.p50_min <= e.p90_min
    assert 0 <= e.remaining_p10_min <= e.remaining_p50_min <= e.remaining_p90_min


def test_cqr_output_is_non_crossing():
    rng = np.random.default_rng(0)
    q = rng.normal(size=(500, 3))
    out = apply_cqr(non_crossing(q), ["truck_loading"] * 500, {"global": -0.8, "per_type": {}})
    assert np.all(out[:, 0] <= out[:, 1]) and np.all(out[:, 1] <= out[:, 2])


def test_remaining_time_updates_with_progress():
    p10, p50, p90 = 150.0, 200.0, 260.0
    assert remaining_minutes(p10, p50, p90, 0.0) == (p10, p50, p90)
    early = remaining_minutes(p10, p50, p90, 0.2, elapsed_min=40, n_cycles=400)
    late = remaining_minutes(p10, p50, p90, 0.8, elapsed_min=160, n_cycles=400)
    assert late[1] < early[1] < p50
    assert (late[2] - late[0]) < (early[2] - early[0])                      # the band narrows
    slow = remaining_minutes(p10, p50, p90, 0.5, elapsed_min=150, n_cycles=400)
    assert slow[1] > 0.5 * p50                                              # observed slow pace pushes the ETA out
    assert remaining_minutes(p10, p50, p90, 1.0, elapsed_min=210) == (0.0, 0.0, 0.0)


def test_baseline_coverage_on_time_later_split(history):
    """Per-type empirical P10–P90 from the older 60 %, evaluated on the latest 20 % (SIMULATED)."""
    train, test = history[:900], history[1200:]
    stats = BaselineStats.from_records(train).per_type
    y = np.array([log_rate(r["duration_min"], r["features"]["qty"]) for r in test])
    lo = np.array([stats[r["task_type"]]["p10_lr"] for r in test])
    hi = np.array([stats[r["task_type"]]["p90_lr"] for r in test])
    assert 0.75 <= float(np.mean((y >= lo) & (y <= hi))) <= 0.85


@pytest.mark.skipif(os.getenv("SENTINEL_TRAIN_TESTS") != "1",
                    reason="model training deferred today; run with SENTINEL_TRAIN_TESTS=1")
def test_trained_model_non_crossing_and_coverage(history, tmp_path: Path):
    from ml.train_tasktime import train

    card = train(out_root=tmp_path, records=history, register=False)
    overall = card["metrics"]["overall"]
    assert 0.75 <= overall["coverage"] <= 0.85 and card["label"] == "SIMULATED"
    assert overall["mae_improvement"] >= 0.15 and card["use_model"]
    est = TaskTimeEstimator.load(tmp_path)
    assert not est.baseline_mode
    e = est.estimate(task(type="trenching", planned_qty=60.0, first_on_site=True), OPERATOR, CONDITIONS)
    assert e.p10_min <= e.p50_min <= e.p90_min and e.drivers and "ML" in [p.value for p in e.provenance]
    assert all(math.isfinite(d["delta_min"]) for d in e.drivers)
