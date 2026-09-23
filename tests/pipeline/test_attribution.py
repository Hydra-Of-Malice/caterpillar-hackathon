"""Operator vs machine vs environment attribution (04 §5.4, AC4.4)."""
from __future__ import annotations

import numpy as np

from sentinel.pipeline import Pipeline, RuntimeContext
from sentinel.pipeline.features import compute_features
from sentinel.pipeline.machine_health import MachineCues, MachineHealth
from sentinel.shared.schemas import Attribution, RiskCategory, Tier
from tests.pipeline.synth import T0, idle_samples, window_from

NO_CUES = MachineCues(0, 0, 0.0)


def test_hyd_spikes_without_command_attributed_to_machine(no_model_dir):
    samples = idle_samples(40.0, T0)
    for i in range(20, len(samples), 15):                     # a pressure spike every 1.5 s, no lever input
        samples[i] = samples[i].model_copy(update={"hyd_pressure_bar": 190.0})
    pipe = Pipeline(no_model_dir)
    events = [e for s in samples for e in pipe.process(s, RuntimeContext())]
    hyd = [e for e in events if e.type == "hyd_uncommanded_pressure"]
    assert len(hyd) == 1                                       # cooldown merges overlapping windows
    e = hyd[0]
    assert e.attribution == Attribution.machine
    assert e.category == RiskCategory.emerging_degradation and e.tier == Tier.T0
    assert e.competency_ids == []
    assert e.evidence["uncommanded_spikes"] >= 2


def test_commanded_spikes_are_not_machine_cues(cfg):
    p = np.full(200, 35.0)
    stick = np.zeros(200)
    for i in (40, 100, 160):
        p[i] = 185.0
        stick[i - 2:i + 5] = 0.6
    cues = MachineHealth.cues(compute_features(window_from({"hyd_pressure_bar": p, "joy_stick": stick}), cfg["features"]))
    mh = MachineHealth(cfg)
    assert not mh.hydraulic_suspect(cues)
    att = mh.attribute("behaviour_anomaly", ("hyd_spike_count",), "hyd_spike_count", "EX-07", "OP-1", cues)
    assert att.attribution == Attribution.operator


def test_uncommanded_hydraulic_signature_is_machine(cfg):
    att = MachineHealth(cfg).attribute("behaviour_anomaly", ("hyd_spike_count",), "hyd_spike_count",
                                       "EX-07", "OP-1", MachineCues(0, 3, 0.0))
    assert att.attribution == Attribution.machine


def test_dtc_attributes_plausible_fault_types_to_machine(cfg):
    mh = MachineHealth(cfg)
    dtc = MachineCues(1, 0, 0.0)
    assert mh.attribute("behaviour_anomaly", ("joy_jerk_rms",), "joy_jerk_rms", "EX-07", "OP-1", dtc).attribution == Attribution.machine
    assert mh.attribute("fast_swing_near_truck", ("swing_speed_near_truck",), None, "EX-07", "OP-1", dtc).attribution == Attribution.operator


def test_same_signature_on_two_operators_is_machine(cfg):
    mh = MachineHealth(cfg)
    mh.record("EX-07", ("hyd_spike_count",), "OP-A")
    same_machine = mh.attribute("behaviour_anomaly", ("hyd_spike_count",), "hyd_spike_count", "EX-07", "OP-B", NO_CUES)
    other_machine = mh.attribute("behaviour_anomaly", ("hyd_spike_count",), "hyd_spike_count", "EX-09", "OP-B", NO_CUES)
    assert same_machine.attribution == Attribution.machine
    assert other_machine.attribution == Attribution.operator


def test_operator_signatures_do_not_become_machine_across_operators(cfg):
    mh = MachineHealth(cfg)
    mh.record("EX-07", ("swing_speed_near_truck",), "OP-A")
    att = mh.attribute("fast_swing_near_truck", ("swing_speed_near_truck",), "swing_speed_near_truck", "EX-07", "OP-B", NO_CUES)
    assert att.attribution == Attribution.operator


def test_environment_attribution(cfg):
    mh = MachineHealth(cfg)
    assert mh.attribute("behaviour_anomaly", (), None, "EX-07", "OP-1", NO_CUES, gated=True).attribution == Attribution.environment
    assert mh.attribute("behaviour_anomaly", ("person_near_frac",), "person_near_frac", "EX-07", "OP-1",
                        NO_CUES).attribution == Attribution.environment
