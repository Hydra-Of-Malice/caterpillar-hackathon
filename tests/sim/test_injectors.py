"""Each injector produces its signature, and labels its ticks with gt["inject"]."""
from __future__ import annotations

import math

import pytest

from sentinel.sim.generator import ShiftSimulator
from sentinel.sim.injectors import HYD_FAULT_DTC, INJECTORS, PROX_FAULT_DTC
from tests.sim.simutil import labelled, loading_scenario, run_rows

START = 300          # inject 30 s in (engine running, truck positioned)


def _run(kind: str, n: int = 2400, **params):
    sim = ShiftSimulator(loading_scenario(minutes=8), seed=5)
    rows = run_rows(sim, n, {START: (kind, params)})
    lab = labelled(rows, kind)
    assert lab, f"{kind}: no labelled ticks"
    assert all(r["gt"]["actor"] == INJECTORS[kind].actor for r in lab)
    return rows, lab


def test_seatbelt_open_while_moving():
    rows, lab = _run("seatbelt_open", duration_s=30)
    assert all(r["seatbelt"] is False for r in lab)
    assert 29 <= len(lab) / 10 <= 31
    assert max(r["travel_kmh"] for r in lab) > 1.5, "the operator trams while unbuckled"
    assert all(r["seatbelt"] for r in rows[START + 400:])


@pytest.mark.parametrize("kind, lo, hi, sector", [("person_rear", 0.0, 3.0, "rear"),
                                                    ("person_warning", 3.0, 7.0, "left")])
def test_person_approach(kind, lo, hi, sector):
    rows, lab = _run(kind)
    d = [r["prox_person_m"] for r in lab if r["prox_person_m"] is not None]
    assert lo < min(d) < hi
    assert {r["prox_person_sector"] for r in lab if r["prox_person_m"] is not None} == {sector}
    assert all(r["prox_person_m"] is None for r in rows[:START])


def test_fast_swing_near_truck():
    rows, lab = _run("fast_swing", m=1.8)
    assert {r["gt"]["phase"] for r in lab} >= {"swing_loaded"}
    run = best = 0
    for r in lab:
        hot = r["bucket_to_truck_m"] is not None and r["bucket_to_truck_m"] < 5 and abs(r["swing_dps"]) > 35
        run = run + 1 if hot else 0
        best = max(best, run)
    assert best >= 5, "above 35 °/s inside 5 m of the truck for >= 0.5 s"
    base = [abs(r["swing_dps"]) for r in rows if not (r["gt"] or {}).get("inject")
            and r["bucket_to_truck_m"] is not None and r["bucket_to_truck_m"] < 5]
    assert max(base) < 35, "Ravi's baseline stays under the rule outside injections"


def test_hyd_fault_is_machine_side():
    rows, lab = _run("hyd_fault", n=2000, duration_s=120, dtc_delay_s=5)
    assert all(HYD_FAULT_DTC in r["dtc"] for r in lab[60:])
    # spikes with no matching joystick input: a pressure jump while every lever is at rest
    spikes = [b for a, b in zip(lab, lab[1:]) if b["hyd_pressure_bar"] - a["hyd_pressure_bar"] > 80
              and max(abs(b[k]) for k in ("joy_swing", "joy_boom", "joy_stick", "joy_bucket")) < 0.05]
    assert spikes
    assert not any(r["dtc"] for r in rows[:START])


def test_idle_not_truck_related():
    rows, lab = _run("idle", n=3300, duration_s=240)
    assert abs(len(lab) / 10 - 240) < 1
    assert all(r["engine_on"] and r["travel_kmh"] == 0 and r["joy_swing"] == 0 and r["joy_boom"] == 0 for r in lab)
    assert min(r["rpm"] for r in lab[50:]) > 1500, "working rpm, auto-idle off"
    assert all(r["prox_truck_m"] is not None for r in lab), "a truck is parked: not waiting for one"
    assert not any(r["gt"].get("wait_truck") for r in lab)


def test_truck_wait_negative_control():
    rows, lab = _run("truck_wait", n=3600, duration_s=180)
    assert 179 <= len(lab) / 10 <= 181
    assert all(r["gt"].get("wait_truck") and r["gt"]["phase"] == "idle" for r in lab)
    assert sum(r["prox_truck_m"] is None for r in lab) / len(lab) > 0.8, "no truck at the loading point"
    assert all(r["joy_swing"] == 0 and r["travel_kmh"] == 0 for r in lab[10:])     # levers settle in < 1 s


def test_over_speed():
    rows, lab = _run("over_speed", speed_kmh=5.5, duration_s=20)
    assert max(r["travel_kmh"] for r in lab) >= 5.0
    assert {r["gear"] for r in lab if r["travel_kmh"] > 4} == {2}


@pytest.mark.parametrize("mode", ["stuck", "dropout"])
def test_prox_sensor_fault(mode):
    rows, lab = _run("prox_sensor_fault", mode=mode, duration_s=30)
    vals = [r["prox_truck_m"] for r in lab]
    if mode == "stuck":
        assert len(set(vals)) == 1 and vals[0] is not None
    else:
        assert all(math.isnan(v) for v in vals)
    assert all(PROX_FAULT_DTC in r["dtc"] for r in lab[30:])


def test_reversal_burst_and_boom_raised_travel():
    _, lab = _run("reversal_burst", duration_s=10)
    edges = sum(1 for a, b in zip(lab, lab[1:]) if abs(a["joy_stick"] - b["joy_stick"]) > 0.4)
    assert edges >= 15, "2 Hz square-wave oscillation on the stick command"
    _, lab = _run("boom_raised_travel", duration_s=10)
    assert any(r["boom_angle_deg"] > 50 and r["travel_kmh"] > 1.0 for r in lab)


def test_unknown_kind_and_params_rejected():
    sim = ShiftSimulator(loading_scenario(), seed=1)
    with pytest.raises(ValueError):
        sim.inject("not_a_kind")
    with pytest.raises(ValueError):
        sim.inject("idle", bogus=1)
    sim.inject("person_inner")                       # alias of person_rear
    assert sim.queue[-1][0] == "person_rear"
