"""Phase segmentation, cycle detection, envelopes, DTW and metric directions (SIMULATED fixtures)."""
from __future__ import annotations

import numpy as np
import pytest

from sentinel.practice.envelope import dtw_distance, resample
from sentinel.practice.metrics import (
    count_reversals, envelope_details, kinematic_metrics, safety_flags, summarise,
)
from sentinel.practice.phases import (
    DIG, DUMP, SWING_EMPTY, SWING_LOADED, detect_cycles, enforce_min_duration, phase_accuracy, window_features,
)
from sentinel.practice.settings import ENVELOPE_CHANNELS, N_POINTS, WORK_PHASES
from sentinel.practice.signals import IDLE, to_arrays


# ---------------------------------------------------------------- phases
@pytest.mark.parametrize("archetype,floor", [("expert", 0.95), ("intermediate", 0.9), ("novice", 0.9),
                                             ("novice_improving", 0.9)])
def test_phase_accuracy_held_out(emm, make_session, archetype, floor):
    """Unseen operator persona and seed; the model was trained on expert labels only."""
    arrays = to_arrays(make_session(archetype, 6, seed=77, operator="HELD-OUT"))
    pred = emm.phase_model.predict(arrays)
    assert phase_accuracy(pred, arrays.gt_phase) >= floor
    assert len(detect_cycles(pred)) == len(detect_cycles(arrays.gt_phase)) == 6


def test_cycle_detection_ignores_pause_inside_dig():
    lab = np.array([IDLE] * 3 + [DIG] * 5 + [IDLE] * 3 + [DIG] * 4 + [SWING_LOADED] * 5 + [DUMP] * 3
                   + [SWING_EMPTY] * 4 + [DIG] * 5 + [SWING_LOADED] * 5 + [DUMP] * 3 + [SWING_EMPTY] * 4 + [IDLE] * 3)
    cycles = detect_cycles(lab)
    assert len(cycles) == 2
    assert [ph for ph, _, _ in cycles[0].segments] == [DIG, IDLE, DIG, SWING_LOADED, DUMP, SWING_EMPTY]
    assert cycles[1].segments[-1][0] == SWING_EMPTY           # trailing idle dropped


def test_incomplete_cycle_is_dropped():
    assert detect_cycles(np.array([DIG] * 5 + [SWING_LOADED] * 5 + [IDLE] * 3)) == []


def test_min_duration_merges_blips():
    lab = np.array([DIG] * 6 + [DUMP] + [DIG] * 6)
    proba = np.full((len(lab), 5), 0.1)
    proba[:, DIG] = 0.6
    assert (enforce_min_duration(lab, proba, 2) == DIG).all()


def test_live_features_equal_offline(make_session):
    arrays = to_arrays(make_session("novice", 2, seed=3))
    x, ts = arrays.matrix(), arrays.ts
    offline = window_features(x, ts)
    for i in (5, 40, 200):
        lo = max(0, i - 11)
        np.testing.assert_allclose(window_features(x[lo:i + 1], ts[lo:i + 1])[-1], offline[i])


# ---------------------------------------------------------------- envelopes and DTW
def test_envelope_shapes(emm):
    envs = emm.exercises["truck_loading_basic"].envelopes
    assert set(envs) == set(WORK_PHASES)
    for env in envs.values():
        for ch in ENVELOPE_CHANNELS:
            band = env.bands[ch]
            assert all(len(band[k]) == N_POINTS for k in ("p10", "p50", "p90", "mean", "std"))
            assert (band["p10"] <= band["p50"] + 1e-9).all() and (band["p50"] <= band["p90"] + 1e-9).all()
        assert env.n_experts == 4 and env.n_cycles >= 50
        assert env.dtw_ref["p50"] <= env.dtw_ref["p90"]


def test_dtw_properties():
    t = np.linspace(0, 1, N_POINTS)
    a = np.sin(2 * np.pi * t)
    shifted = np.sin(2 * np.pi * np.clip(t - 0.05, 0, 1))
    assert dtw_distance(a, a) == pytest.approx(0.0)
    assert dtw_distance(a, shifted) == pytest.approx(dtw_distance(shifted, a))
    assert dtw_distance(a, shifted) < np.mean(np.abs(a - shifted))      # warping absorbs the time shift
    assert dtw_distance(a, -a) > dtw_distance(a, shifted)
    assert len(resample(np.arange(7.0))) == N_POINTS


def test_trainee_leaves_envelope_more_than_expert(emm, make_session):
    envs = emm.exercises["truck_loading_basic"].envelopes

    def exit_frac(arch):
        arrays = to_arrays(make_session(arch, 4, seed=21, operator="ENV"))
        return np.mean([envelope_details(arrays, c, envs)[0] for c in detect_cycles(arrays.gt_phase)])
    assert exit_frac("novice") > exit_frac("expert") + 0.2


# ---------------------------------------------------------------- metrics
def _summary(make_session, arch):
    arrays = to_arrays(make_session(arch, 6, seed=11, operator="MET"))
    return summarise([kinematic_metrics(arrays, c) for c in detect_cycles(arrays.gt_phase)])


def test_metric_directions(make_session):
    """Expert is on the 'better' side of every directional metric."""
    exp, nov = _summary(make_session, "expert"), _summary(make_session, "novice")
    assert exp["swing_near_truck_dps"] < nov["swing_near_truck_dps"]          # lower is safer
    assert exp["swing_overshoot_deg"] < nov["swing_overshoot_deg"]
    assert exp["boom_swing_overlap"] > nov["boom_swing_overlap"] + 0.2       # experts overlap
    assert exp["dig_stick_reversals"] < nov["dig_stick_reversals"]
    assert exp["swing_lever_reversals"] < nov["swing_lever_reversals"]
    assert exp["idle_gap_s"] < nov["idle_gap_s"]
    assert exp["bucket_fill_t"] > nov["bucket_fill_t"]
    assert exp["swing_smoothness"] > nov["swing_smoothness"]                 # higher LDLJ = smoother
    assert exp["cycle_time_s"] < nov["cycle_time_s"]


def test_count_reversals_hysteresis():
    assert count_reversals(np.sin(np.linspace(0, np.pi, 50))) == 1           # one smooth bell
    assert count_reversals(0.05 * np.sin(np.linspace(0, 20, 200))) == 0      # below hysteresis
    assert count_reversals(0.5 * np.sin(np.linspace(0, 6 * np.pi, 300))) == 6   # 3 periods: 6 turns


def test_safety_flags_and_no_truck():
    unsafe = {"swing_near_truck_dps": 48.0, "swing_overshoot_deg": 22.0}
    assert safety_flags(unsafe) == ["fast_swing_near_truck", "overshoot_past_truck"]
    assert safety_flags({"swing_near_truck_dps": 20.0, "swing_overshoot_deg": 2.0}) == []
    assert safety_flags(unsafe, truck_present=False) == []                   # e.g. trench to spoil pile
