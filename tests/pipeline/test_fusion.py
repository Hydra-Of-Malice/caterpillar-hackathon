"""Fusion formula, decision table and the in-cab gate (04 §5.3)."""
from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given
from hypothesis import strategies as st

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.pipeline.fusion import FusionEngine, RecurrenceCounter, exposure
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import Provenance, RiskCategory, Tier
from tests.pipeline.synth import loading_cycles

CFG = load_yaml("fusion")
IN_CAB = (Tier.T1, Tier.T2, Tier.T3, Tier.T4, Tier.T_CRIT)


def test_formula_matches_04():
    f = FusionEngine(CFG)
    assert f.risk(s_proc=2.0, ml_term=2.5, m_e=1.5, k=3) == pytest.approx(2.5 * 1.5 + 0.5)
    assert f.risk(s_proc=2.0, ml_term=1.0, m_e=1.0, k=2) == pytest.approx(2.0)


def test_decision_table():
    f = FusionEngine(CFG)
    assert [f.tier_for(r) for r in (1.99, 2.0, 2.99, 3.0, 5.0)] == [None, Tier.T1, Tier.T1, Tier.T2, Tier.T2]


def test_severity_is_in_threshold_units():
    f = FusionEngine(CFG, tau1=4.0, tau2=5.0)
    assert (f.severity_value("T1"), f.severity_value("T2"), f.severity_value(None)) == (4.0, 5.0, 0.0)
    assert f.decide_rule("T1", d=0, q=0.0, m_e=1.0, k=1).tier == Tier.T1


def test_rule_alone_is_procedural_and_ml_corroboration_escalates():
    f = FusionEngine(CFG)
    alone = f.decide_rule("T1", d=0, q=0.0, m_e=1.0, k=1)
    assert (alone.tier, alone.category, alone.in_cab) == (Tier.T1, RiskCategory.procedural, True)
    both = f.decide_rule("T1", d=1, q=3.2, m_e=1.0, k=1)
    assert (both.tier, both.category, both.ml_corroborates) == (Tier.T2, RiskCategory.dangerous_condition, True)
    open_area = f.decide_rule("T1", d=0, q=0.0, m_e=0.5, k=1)
    assert open_area.tier is None and not open_area.in_cab


def test_recurrence_bonus_escalates_third_event():
    f = FusionEngine(CFG)
    assert f.decide_rule("T1", d=1, q=2.6, m_e=1.0, k=2).tier == Tier.T1   # r = 2.6
    assert f.decide_rule("T1", d=1, q=2.6, m_e=1.0, k=3).tier == Tier.T2   # r = 2.6 + 0.5


@given(d=st.integers(0, 1), q=st.floats(0, 10), m_e=st.sampled_from([0.5, 1.0, 1.5]), k=st.integers(1, 20))
def test_ml_alone_never_in_cab(d, q, m_e, k):
    dec = FusionEngine(CFG).decide_ml(d, q, m_e, k)
    assert dec is None or (dec.tier in (Tier.T0, None) and not dec.in_cab)


def test_ml_only_events_never_in_cab_in_pipeline(model_dir):
    pipe = Pipeline(model_dir)
    samples = loading_cycles(30, seed=11)
    rng = np.random.default_rng(0)
    for i in range(0, len(samples), 3):                  # jittery, anomalous but below every rule threshold
        s = samples[i]
        samples[i] = s.model_copy(update={"joy_boom": float(np.clip(s.joy_boom + rng.normal(0, 0.3), -1, 1)),
                                          "throttle_pct": float(rng.uniform(40, 100))})
    events = [e for s in samples for e in pipe.process(s, RuntimeContext(task_type="truck_loading"))]
    ml_only = [e for e in events if Provenance.ML in e.provenance and Provenance.RULE not in e.provenance]
    assert ml_only, "the jittery stream should produce ML-only anomalies"
    assert all(e.tier in (Tier.T0, None) for e in ml_only)
    assert all(Provenance.RULE in e.provenance for e in events if e.tier in IN_CAB)


def test_recurrence_counter_is_per_operator_and_shift():
    rc = RecurrenceCounter()
    assert [rc.add("OP-1", "S1", "fast_swing") for _ in range(3)] == [1, 2, 3]
    assert rc.peek("OP-2", "S1", "fast_swing") == 1
    assert rc.peek("OP-1", "S2", "fast_swing") == 1                    # new shift resets K
    assert rc.peek("OP-1", "S2", "other") == 1


def test_exposure_multiplier():
    assert exposure({"person_near_frac": 0.2}, None, None, CFG).m_e == 1.5
    assert exposure({"min_truck_m": 2.0}, "TL-1", "truck_loading", CFG).m_e == 1.5
    assert exposure({"reverse_travel_frac": 0.5}, None, None, CFG).m_e == 1.5
    assert exposure({"min_truck_m": 6.0}, "TL-1", "truck_loading", CFG).m_e == 1.0
    assert exposure({}, "LANE-2", "trenching", CFG).m_e == 1.0
    assert exposure({}, "T-4", "trenching", CFG).reasons == ("open_area",)
