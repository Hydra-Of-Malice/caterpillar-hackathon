"""ShiftSimulator: contract, determinism, value ranges, shift structure."""
from __future__ import annotations

import itertools

import pytest

from sentinel.shared.schemas import TelemetrySample
from sentinel.sim.generator import ShiftSimulator, load_scenario
from tests.sim.simutil import loading_scenario


@pytest.fixture(scope="module")
def demo_rows():
    return list(ShiftSimulator(load_scenario("demo_short"), seed=42).rows())


def test_samples_validate_and_fill_fields():
    sim = ShiftSimulator(load_scenario("demo_short"), seed=1)
    samples = list(itertools.islice(sim.samples(), 900))
    assert all(isinstance(s, TelemetrySample) for s in samples)
    s = samples[-1]
    assert s.source.value == "SIM" and s.site_id == "north-quarry" and s.machine_id == "EX-07"
    assert s.operator_id == "OP-1042" and s.shift_id == "SH-20260923-OP1042"
    assert s.task_id == "T-1" and s.task_type.value == "truck_loading" and s.zone == "TL-1"
    assert set(s.gt) >= {"phase", "cycle", "archetype", "activity"}
    assert [x.seq for x in samples] == list(range(900))
    assert all(abs((b.ts - a.ts) - 0.1) < 1e-6 for a, b in zip(samples, samples[1:]))


def test_deterministic_with_seed():
    sc = load_scenario("demo_short")
    a = list(itertools.islice(ShiftSimulator(sc, seed=7).rows(), 3000))
    b = list(itertools.islice(ShiftSimulator(sc, seed=7).rows(), 3000))
    c = list(itertools.islice(ShiftSimulator(sc, seed=8).rows(), 3000))
    assert a == b
    assert a != c


def test_value_ranges(demo_rows):
    r = demo_rows
    def rng(k):
        vals = [x[k] for x in r if x[k] is not None]
        return min(vals), max(vals)
    assert rng("swing_dps")[1] <= 68 and rng("swing_dps")[0] >= -68
    assert -15 <= rng("boom_angle_deg")[0] and rng("boom_angle_deg")[1] <= 65
    assert 0 <= rng("hyd_pressure_bar")[0] and rng("hyd_pressure_bar")[1] <= 395
    assert 0 <= rng("rpm")[0] and rng("rpm")[1] <= 1800
    assert 0 <= rng("fuel_rate_lph")[0] and rng("fuel_rate_lph")[1] <= 30
    assert 0 <= rng("payload_t")[0] and rng("payload_t")[1] <= 2.5
    assert 0 <= rng("prox_truck_m")[0] and rng("bucket_to_truck_m")[0] >= 0
    for k in ("joy_swing", "joy_boom", "joy_stick", "joy_bucket", "travel_cmd"):
        assert -1 <= rng(k)[0] and rng(k)[1] <= 1
    assert {x["gear"] for x in r} <= {0, 1, 2}


def test_joysticks_drive_kinematics(demo_rows):
    """Swing rate follows the swing command (machine response), not an independent signal."""
    moving = [x for x in demo_rows if abs(x["swing_dps"]) > 20]
    assert moving and sum(1 for x in moving if x["joy_swing"] * x["swing_dps"] > 0) / len(moving) > 0.9


def test_proximity_noise_never_bit_identical(demo_rows):
    """Parked-truck distances carry sensor noise so clean data never trips the stuck-at check (>2 s)."""
    for key in ("prox_truck_m", "bucket_to_truck_m"):
        run = best = 0
        prev = object()
        for x in demo_rows:
            if x[key] is not None and x[key] == prev and not (x["gt"] or {}).get("inject"):
                run += 1
                best = max(best, run)
            else:
                run = 0
            prev = x[key]
        assert best < 20, key


def test_truck_loading_structure():
    rows = list(ShiftSimulator(loading_scenario(minutes=10), seed=3).rows())
    phases = {x["gt"]["phase"] for x in rows}
    assert phases >= {"dig", "swing_loaded", "dump", "swing_empty", "idle"}
    waits = [x for x in rows if x["gt"].get("wait_truck")]
    assert waits, "Poisson truck arrivals produce waiting_for_truck periods"
    assert all(x["gt"]["activity"] == "wait_truck" for x in waits)
    loaded = [x for x in rows if x["gt"]["phase"] == "swing_loaded"]
    assert all(x["bucket_to_truck_m"] is not None for x in loaded), "every loaded swing has a truck to swing to"
    cycles = {x["gt"]["cycle"] for x in rows if x["gt"]["cycle"] is not None}
    assert len(cycles) >= 12


def test_tier_a_snapshot():
    sim = ShiftSimulator(load_scenario("demo_short"), seed=1)
    list(itertools.islice(sim.rows(), 1200))
    snap = sim.tier_a()
    assert snap.machine_id == "EX-07" and snap.smu_h > 6414.1 and snap.fuel_l > 391530.0
    assert 0 < snap.idle_h < snap.smu_h
