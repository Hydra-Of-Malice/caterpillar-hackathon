"""Procedural behaviour rules (fast swing near truck, harsh reversal burst, travel raised)."""
from __future__ import annotations

import numpy as np

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.pipeline.rules_behaviour import BehaviourRules
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import Provenance, RiskCategory, Tier
from tests.pipeline.synth import DT, loading_cycles, window_from

T = np.arange(200) * DT


def run(samples, models_dir):
    pipe = Pipeline(models_dir)
    return [e for s in samples for e in pipe.process(s, RuntimeContext(task_type="truck_loading"))]


def test_fast_swing_near_truck_fires(no_model_dir):
    events = [e for e in run(loading_cycles(4, swing_scale=2.4), no_model_dir) if e.type == "fast_swing_near_truck"]
    assert events
    e = events[0]
    assert e.tier == Tier.T1 and e.category == RiskCategory.procedural
    assert e.provenance[0] == Provenance.RULE and e.rule_version
    assert e.evidence["value"] > e.evidence["threshold"] == load_yaml("fusion")["rules"]["fast_swing_near_truck"]["swing_dps"]
    assert e.context["zone"] == "TL-1" and e.context["m_E"] == 1.0
    assert e.competency_ids == []


def test_normal_swing_does_not_fire(no_model_dir):
    assert not [e for e in run(loading_cycles(10), no_model_dir) if e.type == "fast_swing_near_truck"]


def test_fast_swing_rule_needs_proximity(no_model_dir):
    samples = loading_cycles(4, swing_scale=2.4, prox_fitted=False)
    assert not [e for e in run(samples, no_model_dir) if e.type == "fast_swing_near_truck"]


def test_one_event_per_fast_swing_despite_overlapping_windows(no_model_dir):
    normal = loading_cycles(3, seed=1)
    fast = loading_cycles(1, seed=2, swing_scale=2.4, t0=normal[-1].ts + DT)
    after = loading_cycles(3, seed=3, t0=fast[-1].ts + DT)
    events = [e for e in run(normal + fast + after, no_model_dir) if e.type == "fast_swing_near_truck"]
    assert len(events) == 1


def test_harsh_reversal_burst(cfg):
    flips = np.where((T // 0.3) % 2 == 0, 0.5, -0.5)     # ±0.5 lever square wave (~1.7 Hz)
    hits = BehaviourRules(cfg).evaluate(window_from({"joy_swing": flips}))
    assert [h.rule_id for h in hits] == ["harsh_reversal_burst"]
    assert hits[0].value >= cfg["rules"]["harsh_reversal_burst"]["min_count"]
    slow = BehaviourRules(cfg).evaluate(window_from({"joy_swing": np.where((T // 5.0) % 2 == 0, 0.5, -0.5)}))
    assert slow == []


def test_travel_with_bucket_raised(cfg):
    travel = {"travel_kmh": np.where(T < 5, 3.0, 0.0), "travel_cmd": np.where(T < 5, 0.6, 0.0)}
    raised = BehaviourRules(cfg).evaluate(window_from({**travel, "boom_angle_deg": 55.0}))
    lowered = BehaviourRules(cfg).evaluate(window_from({**travel, "boom_angle_deg": 20.0}))
    assert [h.rule_id for h in raised] == ["travel_with_bucket_raised"]
    assert raised[0].evidence["duration_s"] >= 2.0
    assert lowered == []


def test_rule_cooldown_blocks_same_samples(cfg):
    rules = BehaviourRules(cfg)
    w = window_from({"joy_swing": np.where((T // 0.3) % 2 == 0, 0.5, -0.5)})
    assert rules.evaluate(w)
    assert rules.evaluate(w) == []
