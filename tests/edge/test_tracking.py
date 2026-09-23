"""Telemetry trackers: payload-based task progress (never sample.gt), idle by reason, continuous operation."""
from __future__ import annotations

import pytest

from sentinel.edge_api.tracking import OperationTracker, ProgressTracker
from tests.edge.conftest import T0, sample


def test_progress_from_payload_drop_ignores_ground_truth():
    p = ProgressTracker()
    gt = {"cycle": 99, "phase": "dump"}
    done = 0.0
    for i, payload in enumerate([0.0, 0.8, 1.9, 1.9, 0.9, 0.05, 0.0] * 2):
        done += p.update(sample(T0 + i, prox_truck_m=4.0, payload_t=payload, gt=gt), "truck_loading", "clay_gravel", None)
    assert p.cycles == 2 and done == pytest.approx(2 * 1.9 / 1.9) and p.source == "payload"
    assert p.exposure["truck_loading"] == {"cycles": 2, "truck_approach_cycles": 2}
    no_payload = ProgressTracker()
    assert no_payload.update(sample(T0, payload_t=0.0, gt=gt), "truck_loading", None, None) == 0.0


def test_trench_progress_in_metres():
    p = ProgressTracker()
    metres = sum(p.update(sample(T0 + i, payload_t=v), "trenching", "clay_gravel", 1.5) for i, v in
                 enumerate([2.85, 0.0]))
    assert metres == pytest.approx(2.85 / 1.9 / 1.5)


def test_idle_by_reason_and_continuous_operation():
    t = OperationTracker()
    t.start_shift(T0)
    idle = dict(swing_dps=0.0, joy_swing=0.0, travel_kmh=0.0)
    for i in range(61):
        t.update(sample(T0 + i, **idle), waiting_for_truck=True, task_type="truck_loading")
    for i in range(61, 122):
        t.update(sample(T0 + i, coolant_c=60.0, **idle), waiting_for_truck=False, task_type="truck_loading")
    s = t.idle_summary()
    assert s["waiting_min"] == pytest.approx(1.0) and s["warmup_min"] == pytest.approx(1.0)
    assert t.continuous_operation_min(T0 + 121) == pytest.approx(121 / 60)
    t.start_break(T0 + 130)
    assert t.continuous_operation_min(T0 + 200) == 0.0
    assert t.end_break(T0 + 130 + 600) is True                          # >= 10 min resets
    assert t.continuous_operation_min(T0 + 730) == 0.0


def test_telemetry_gap_counts_as_break():
    t = OperationTracker()
    t.update(sample(T0), False, None)
    assert t.continuous_operation_min(T0 + 700) == 0.0                   # no telemetry for a break length
    t.update(sample(T0 + 700), False, None)
    assert t.op_start_ts == T0 + 700
