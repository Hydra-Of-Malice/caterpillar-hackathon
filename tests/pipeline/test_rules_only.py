"""Rules-only mode (no trained model): every path yields well-formed Events for the alert manager."""
from __future__ import annotations

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.shared.schemas import Attribution, Event, Provenance, Tier
from tests.pipeline.synth import DT, idle_samples, loading_cycles, shift_started


def demo_stream():
    """Fast swings, a harsh-reversal burst, an uncommanded-pressure fault and a long idle."""
    fast = loading_cycles(3, seed=1, swing_scale=2.4)
    burst = loading_cycles(2, seed=2, t0=fast[-1].ts + DT)
    for i, s in enumerate(burst[:120]):                  # ~1.7 Hz lever square wave, like the simulator's U2
        burst[i] = s.model_copy(update={"joy_stick": 0.5 if (i // 3) % 2 == 0 else -0.5})
    idle = idle_samples(320.0, burst[-1].ts + DT)
    for i in range(20, 400, 15):
        idle[i] = idle[i].model_copy(update={"hyd_pressure_bar": 190.0})
    return [shift_started(fast[0].ts)] + fast + burst + idle


def run(no_model_dir, waiting: bool = False) -> list[Event]:
    pipe = Pipeline(no_model_dir)
    assert pipe.mode == "rules_only" and pipe.model_version is None
    ctx = RuntimeContext(waiting_for_truck=waiting, task_type="truck_loading", operator_experience_h=212.0)
    return [e for s in demo_stream() for e in pipe.process(s, ctx)]


def test_all_rule_paths_fire_without_a_model(no_model_dir):
    types = {e.type for e in run(no_model_dir)}
    assert {"fast_swing_near_truck", "harsh_reversal_burst", "hyd_uncommanded_pressure", "excessive_idle"} <= types


def test_events_are_well_formed_for_the_alert_manager(no_model_dir):
    for e in run(no_model_dir):
        assert Event.model_validate_json(e.model_dump_json()) == e
        assert e.provenance[0] == Provenance.RULE and Provenance.SIMULATED in e.provenance
        assert Provenance.ML not in e.provenance and e.model_version is None
        assert e.rule_id and e.rule_version and e.simulated
        assert e.tier in (Tier.T0, Tier.T1, Tier.T2, None)
        assert e.competency_ids == []
        assert e.attribution != Attribution.unknown
        assert {"task_type", "zone", "task_id", "waiting_for_truck"} <= set(e.context)


def test_window_events_explain_against_default_baseline(no_model_dir):
    window_events = [e for e in run(no_model_dir) if e.type != "excessive_idle"]
    assert window_events
    for e in window_events:
        assert e.context["baseline_source"] == "default" and e.context["baseline_version"]
        assert 1 <= len(e.explanation) <= 3
        assert all(c.label and c.unit and c.baseline_std > 0 for c in e.explanation)
        assert e.context["mode"] == "rules_only" and "percentile" not in e.context
    swing = next(e for e in window_events if e.type == "fast_swing_near_truck")
    assert swing.explanation[0].feature in ("swing_speed_near_truck", "swing_speed_peak", "swing_speed_p95",
                                            "approach_speed_to_truck")


def test_attribution_in_rules_only_mode(no_model_dir):
    events = run(no_model_dir)
    assert next(e for e in events if e.type == "hyd_uncommanded_pressure").attribution == Attribution.machine
    assert next(e for e in events if e.type == "fast_swing_near_truck").attribution == Attribution.operator


def test_waiting_for_truck_suppresses_idle_with_reason(no_model_dir):
    idle = [e for e in run(no_model_dir, waiting=True) if e.type == "excessive_idle"]
    assert len(idle) == 1 and idle[0].context["suppressed_reason"] == "waiting_for_truck"
    assert idle[0].attribution == Attribution.environment
