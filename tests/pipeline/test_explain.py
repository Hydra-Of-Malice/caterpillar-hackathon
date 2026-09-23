"""Robust-z explanations: top-k ranking, labels/units, gating, direction indicator."""
from __future__ import annotations

import numpy as np

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.pipeline.explain import Baseline, direction_indicator, fit_baseline, robust_z, top_contributions
from sentinel.pipeline.features import FEATURE_SPECS
from sentinel.shared.schemas import Provenance
from tests.pipeline.synth import loading_cycles

NAMES = ["swing_speed_near_truck", "min_ttc_s", "idle_ratio", "throttle_var", "joy_reversals"]
UNIT = Baseline({n: 0.0 for n in NAMES}, {n: 1.0 for n in NAMES}, 100)


def test_top3_ranks_risk_direction_first_with_labels_and_units():
    feats = {"swing_speed_near_truck": 5.0, "min_ttc_s": -4.0, "idle_ratio": 8.0, "throttle_var": -6.0, "joy_reversals": 0.5}
    top = top_contributions(feats, UNIT, k=3)
    assert [c.feature for c in top] == ["swing_speed_near_truck", "min_ttc_s", "idle_ratio"]
    assert top[0].label == FEATURE_SPECS["swing_speed_near_truck"].label and top[0].unit == "°/s"
    assert top[1].direction == "low" and top[1].z == -4.0
    assert (top[0].value, top[0].baseline_mean, top[0].baseline_std) == (5.0, 0.0, 1.0)


def test_gated_features_are_excluded():
    feats = {"idle_ratio": 9.0, "joy_reversals": 2.0}
    assert [c.feature for c in top_contributions(feats, UNIT, k=3, gated={"idle_ratio"})] == ["joy_reversals"]


def test_direction_indicator_counts_risk_mass():
    cfg = {"z_excess": 1.0, "z_clip": 10.0, "risk_mass_min": 0.5}
    assert direction_indicator({"swing_speed_near_truck": 5.0, "throttle_var": -3.0}, (), cfg)[0] == 1
    assert direction_indicator({"swing_speed_near_truck": -5.0, "idle_ratio": 4.0}, (), cfg)[0] == 0
    assert direction_indicator({"swing_speed_near_truck": 0.5}, (), cfg) == (0, 0.0)
    assert direction_indicator({"swing_speed_near_truck": 3.0, "idle_ratio": 9.0}, {"idle_ratio"}, cfg)[0] == 1


def test_baseline_scale_fallback_for_sparse_counts():
    X = np.zeros((100, 1))
    X[:5, 0] = 1.0                                       # MAD = 0; mean-AD fallback keeps z finite
    b = fit_baseline(X, ["hyd_spike_count"])
    assert b.median["hyd_spike_count"] == 0.0 and b.scale["hyd_spike_count"] > 0
    assert robust_z({"hyd_spike_count": 3.0}, b)["hyd_spike_count"] > 3.0


def test_ml_events_carry_top3_explanations(model_dir):
    pipe = Pipeline(model_dir)
    events = [e for s in loading_cycles(12, seed=9, swing_scale=2.4)
              for e in pipe.process(s, RuntimeContext(task_type="truck_loading"))]
    ml = [e for e in events if Provenance.ML in e.provenance]
    assert events and all(1 <= len(e.explanation) <= 3 for e in events)
    for e in ml:
        assert e.model_version and all(c.label and c.unit for c in e.explanation)
