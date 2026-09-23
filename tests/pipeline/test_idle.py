"""Excessive-idle rule and the waiting_for_truck context gate (13 U7, AC4.3)."""
from __future__ import annotations

import pytest

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.pipeline.context import IdleTracker
from sentinel.shared.schemas import Attribution, Provenance, RiskCategory, Tier
from tests.pipeline.synth import T0, idle_samples, loading_cycles, shift_started


def idle_events(samples, cfg, waiting=lambda s: False):
    tracker = IdleTracker(cfg)
    stream = [shift_started(samples[0].ts)] + samples
    return [e for s in stream if (e := tracker.update(s, waiting(s), "truck_loading")) is not None]


def test_idle_fires_once_after_t_idle(no_model_dir):
    pipe = Pipeline(no_model_dir)
    events = [e for s in [shift_started(T0)] + idle_samples(400.0, T0) for e in pipe.process(s, RuntimeContext())]
    idle = [e for e in events if e.type == "excessive_idle"]
    assert len(idle) == 1
    e = idle[0]
    assert e.tier == Tier.T1 and e.category == RiskCategory.procedural
    assert e.attribution == Attribution.operator
    assert Provenance.RULE in e.provenance and Provenance.SIMULATED in e.provenance
    assert "suppressed_reason" not in e.context
    assert e.ts - T0 == pytest.approx(300.1, abs=0.2)
    assert e.rule_id == "excessive_idle" and e.rule_version


def test_idle_suppressed_while_waiting_for_truck(cfg):
    events = idle_events(idle_samples(400.0, T0), cfg, waiting=lambda s: True)
    assert len(events) == 1
    e = events[0]
    assert e.context["suppressed_reason"] == "waiting_for_truck"
    assert e.category == RiskCategory.unusual_harmless
    assert e.attribution == Attribution.environment


def test_idle_below_threshold_is_silent(cfg):
    assert idle_events(idle_samples(290.0, T0), cfg) == []


def test_motion_resets_idle(cfg):
    first = idle_samples(200.0, T0)
    moving = loading_cycles(1, t0=first[-1].ts + 0.1)
    second = idle_samples(200.0, moving[-1].ts + 0.1)
    assert idle_events(first + moving + second, cfg) == []


def test_ungated_idle_after_waiting_ends_still_fires(cfg):
    samples = idle_samples(520.0, T0)
    events = idle_events(samples, cfg, waiting=lambda s: s.ts < T0 + 200.0)
    assert [bool(e.context.get("suppressed_reason")) for e in events] == [True, False]
    assert events[1].ts - T0 == pytest.approx(500.0, abs=0.5)
    assert events[1].context["ungated_idle_s"] >= 300.0


def test_brief_gate_does_not_log_a_duplicate_suppression(cfg):
    events = idle_events(idle_samples(400.0, T0), cfg, waiting=lambda s: s.ts < T0 + 5.0)
    assert [bool(e.context.get("suppressed_reason")) for e in events] == [False]
