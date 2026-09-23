"""Scenario files: the required demo events and the fleet baseline layout."""
from __future__ import annotations

from collections import defaultdict

import pytest

from sentinel.sim.generator import load_scenario
from tests.sim.simutil import labelled

T0 = 1790123400.0     # 2026-09-23 06:00 +05:30


@pytest.mark.parametrize("name", ["ravi_shift0", "ravi_shift1", "ravi_shift2", "baseline_fleet", "demo_short"])
def test_scenarios_load(name):
    sc = load_scenario(name)
    assert sc.simulated and sc.version and sc.site_id == "north-quarry"


def _events(rows, kind):
    return {r["gt"]["inject_id"]: r["ts"] for r in reversed(labelled(rows, kind))}


def test_ravi_shift1_required_events(ravi_shift1_t1):
    rows = ravi_shift1_t1
    t0 = rows[0]["ts"]
    assert t0 == T0
    fast = _events(rows, "fast_swing")
    assert len(fast) >= 5
    for iid in fast:                                    # each is near the truck and breaks the 35 °/s rule
        ev = [r for r in rows if r["gt"].get("inject_id") == iid]
        assert any(r["bucket_to_truck_m"] is not None and r["bucket_to_truck_m"] < 5 and abs(r["swing_dps"]) > 35
                   for r in ev)
    belt = _events(rows, "seatbelt_open")
    assert len(belt) == 1 and abs((min(belt.values()) - t0) / 60 - 12) < 1.5
    belt_rows = labelled(rows, "seatbelt_open")
    assert any(r["travel_kmh"] > 0.5 for r in belt_rows), "seatbelt open while moving"
    idle = labelled(rows, "idle")
    assert len(idle) / 10 > 300 and not any(r["gt"].get("wait_truck") for r in idle)
    assert all(r["prox_truck_m"] is not None for r in idle), "idle with the truck parked: not truck-related"
    waits = [r for r in rows if r["gt"].get("wait_truck")]
    assert len(labelled(rows, "truck_wait")) / 10 > 300 and len(waits) > len(labelled(rows, "truck_wait"))
    assert {r["task_id"] for r in rows if r["task_id"]} == {"T-1"}


def test_ravi_shift1_no_unscripted_rule_hits(ravi_shift1_t1):
    run = 0
    for r in ravi_shift1_t1:
        hot = r["bucket_to_truck_m"] is not None and r["bucket_to_truck_m"] < 5 and abs(r["swing_dps"]) > 35
        run = run + 1 if hot else 0
        assert run < 3 or r["gt"].get("inject") == "fast_swing"


def test_shift0_and_shift2_fast_swing_counts():
    s0, s1, s2 = (load_scenario(f"ravi_shift{k}").shifts[0] for k in range(3))
    count = lambda sh: sum(c.kind == "fast_swing" for c in sh.cues)   # noqa: E731
    assert count(s0) == 2 and count(s1) >= 5 and count(s2) == 3
    assert s1.skill == 0.1 and s2.skill == 0.6
    assert all(c.kind == "fast_swing" for c in s0.cues + s2.cues)


def test_baseline_fleet_layout():
    sc = load_scenario("baseline_fleet")
    pairs = defaultdict(int)
    for sh in sc.shifts:
        pairs[(sh.operator_id, sh.machine_id)] += 1
        assert not sh.cues, "no scripted injections in the baseline"
    assert {op for op, _ in pairs} == {"OP-1042", "OP-1007", "OP-1019", "OP-1033"}
    assert {m for _, m in pairs} == {"EX-07", "EX-09"} and min(pairs.values()) >= 2
    fault = sc.machines["EX-09"].faults[0]
    ops = {sh.operator_id for sh in sc.shifts if sh.machine_id == "EX-09"
           and sh.start < fault.end and sc.end_of(sh) > fault.start}
    assert fault.kind == "hyd_fault" and len(ops) >= 2
    assert {sh.archetype for sh in sc.shifts} == {"novice_improving", "expert", "intermediate",
                                                  "late_shift_degradation"}


def test_demo_short_cue_list():
    sh = load_scenario("demo_short").shifts[0]
    kinds = [c.kind for c in sh.cues]
    assert {"seatbelt_open", "fast_swing", "person_rear", "truck_wait", "idle", "hyd_fault"} <= set(kinds)
    assert max(c.offset_s for c in sh.cues) < load_scenario("demo_short").duration_s(sh)
