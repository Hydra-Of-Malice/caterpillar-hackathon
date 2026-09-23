"""Isolation Forest scoring, ECDF calibration, fallbacks and graceful rules-only mode."""
from __future__ import annotations

import numpy as np
import pytest
from sklearn.ensemble import IsolationForest

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.pipeline.anomaly import LATEST_FILE, MODEL_FILE, AnomalyDetector, CompiledForest, ecdf_pvalue, resolve_model_dir
from tests.pipeline.synth import loading_cycles


def test_compiled_forest_matches_sklearn():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(3000, 12))
    forest = IsolationForest(n_estimators=50, max_samples=256, random_state=1).fit(X)
    probe = np.vstack([X[:200], rng.normal(0, 4, size=(50, 12))])
    assert np.allclose(CompiledForest(forest).score(probe), -forest.score_samples(probe))


def test_ecdf_pvalue():
    cal = np.arange(1.0, 100.0)                           # 99 calibration scores
    assert ecdf_pvalue(cal, 1000.0) == pytest.approx(1 / 100)
    assert ecdf_pvalue(cal, 0.0) == pytest.approx(1.0)
    assert ecdf_pvalue(cal, 50.0) == pytest.approx(51 / 100)


def test_missing_model_runs_rules_only(no_model_dir):
    assert AnomalyDetector.load(no_model_dir) is None
    pipe = Pipeline(no_model_dir)
    assert pipe.mode == "rules_only"
    events = [e for s in loading_cycles(4, swing_scale=2.4) for e in pipe.process(s, RuntimeContext())]
    assert any(e.type == "fast_swing_near_truck" for e in events)
    assert pipe.last_window().percentile is None


def test_corrupt_model_runs_rules_only(tmp_path):
    (tmp_path / MODEL_FILE).write_bytes(b"not a model")
    assert AnomalyDetector.load(tmp_path) is None


def test_latest_pointer_and_version_dir(model_dir):
    root = model_dir.parent
    assert (root / LATEST_FILE).read_text(encoding="utf-8") == model_dir.name
    assert resolve_model_dir(root) == model_dir
    assert resolve_model_dir(model_dir) == model_dir


def test_routes_fall_back_to_broader_models(model_dir):
    det = AnomalyDetector.load(model_dir)
    feats = {f: 0.0 for f in det.feature_lists["EX-20t|*::BC"]}
    known = det.score(feats, "EX-20t|truck_loading", "BC")
    unseen = det.score(feats, "EX-20t|stockpile", "BC")
    assert known is not None and not known.unfamiliar
    assert known.fallback                                 # small data → machine-type model (04 §8)
    assert unseen is not None and unseen.unfamiliar and unseen.model_key == "EX-20t|*::BC"
    assert det.score(feats, "WL-15t|truck_loading", "BC") is None
    assert 0.0 < known.pvalue <= 1.0 and known.q == pytest.approx(-np.log10(known.pvalue))


def test_scored_windows_carry_percentile_and_version(model_dir):
    pipe = Pipeline(model_dir)
    assert pipe.mode == "fusion"
    for s in loading_cycles(3):
        pipe.process(s, RuntimeContext(task_type="truck_loading"))
    w = pipe.last_window()
    assert w.context_key == "EX-20t|truck_loading" and w.variant == "BC"
    assert 0.0 < w.percentile < 1.0 and w.model_version == model_dir.name
