"""Practice sessions for the Practice Analyser (trainee vs Expert Motion Model). SIMULATED.

`generate_practice_session` drives the same kinematics and cycle controller as the shift
generator on a fixed practice exercise (no trucks arriving, no people, no shift structure)
and returns `PracticeSample`s with gt={"phase", "cycle", "archetype"}.

The "expert" archetype is the highly professional operator whose data trains the Expert
Motion Model: smooth, consistent and safety-compliant (slow swing near the truck, no harsh
reversals, full buckets). Archetypes differ measurably in phase durations, swing peak and
swing speed near the truck, joystick jerk and reversals, boom–swing overlap, idle gaps
between phases, bucket fill and swing overshoot at the dump point.
"""
from __future__ import annotations

import zlib
from typing import Any

import numpy as np

from sentinel.shared.schemas import PracticeSample
from sentinel.sim.cycles import GEOMETRY, IDLE, Intent, Rig, work_cycle
from sentinel.sim.kinematics import DT, RPM_WORK, ExcavatorKinematics, Noise
from sentinel.sim.operators import make_operator

PRACTICE_ARCHETYPES = ("expert", "intermediate", "novice", "novice_improving")
PRACTICE_T0 = 1_790_000_000.0          # fixed base timestamp for practice sessions (2026-09-21 UTC)
TRUCK_DIST_M = 7.4

EXERCISES: dict[str, dict[str, Any]] = {
    "truck_loading_basic": {
        "id": "truck_loading_basic",
        "title": "Truck loading — basic 90° cycle",
        "task_type": "truck_loading",
        "description": ("Dig from the face at 0°, swing loaded to a truck parked at about 90°, dump, and swing "
                        "back. Focus: raise the boom while swinging, slow the swing well before the truck, "
                        "stop over the body without overshoot, and fill the bucket."),
        "material": "clay_gravel",
        "dig_angle_deg": 0.0,
        "dump_angle_deg": 90.0,
        "truck": {"angle_deg": 90.0, "dist_m": TRUCK_DIST_M, "rim_m": 3.3},
        "phases": ["dig", "swing_loaded", "dump", "swing_empty"],
        "default_cycles": 8,
        "focus_metrics": ["phase_durations", "swing_peak_dps", "swing_near_truck_dps", "joystick_jerk",
                          "reversal_count", "boom_swing_overlap", "idle_gap_s", "bucket_fill", "dump_overshoot_deg"],
        "safety": ["Swing speed stays at or below 35 °/s while the bucket is within 5 m of the truck body "
                   "(fast_swing_near_truck rule); experts keep it near 15–22 °/s",
                   "No harsh joystick reversals while loaded"],
        "simulated": True,
    },
    "trench_basic": {
        "id": "trench_basic",
        "title": "Trench — basic dig and cast to spoil",
        "task_type": "trenching",
        "description": ("Dig a straight trench below the tracks, swing loaded to a spoil pile at about 75°, "
                        "dump and return. Focus: smooth stick-in with a steady bucket curl, consistent depth, "
                        "boom raise overlapped with the swing, clean stops at the spoil pile."),
        "material": "clay",
        "dig_angle_deg": 0.0,
        "dump_angle_deg": 75.0,
        "truck": None,
        "phases": ["dig", "swing_loaded", "dump", "swing_empty"],
        "default_cycles": 8,
        "focus_metrics": ["phase_durations", "swing_peak_dps", "joystick_jerk", "reversal_count",
                          "boom_swing_overlap", "idle_gap_s", "bucket_fill", "dump_overshoot_deg"],
        "safety": ["Keep the bucket inside the trench line", "No harsh joystick reversals while loaded"],
        "simulated": True,
    },
}


def _seed(*parts: object) -> np.random.SeedSequence:
    return np.random.SeedSequence([zlib.crc32(str(p).encode()) for p in parts])


def generate_practice_session(archetype: str, n_cycles: int = 8, seed: int = 0,
                              exercise: str = "truck_loading_basic", *, operator_id: str | None = None,
                              skill: float | None = None) -> list[PracticeSample]:
    """Simulate one practice session of `n_cycles` work cycles.

    archetype ∈ {expert, intermediate, novice, novice_improving}. `operator_id` fixes the
    operator's ±15 % jitter (default: derived from archetype and seed). For novice_improving,
    `skill` (0..1) fixes the skill level; if omitted it rises from 0.2 to 0.6 across the session.
    """
    if archetype not in PRACTICE_ARCHETYPES:
        raise ValueError(f"unknown archetype {archetype!r}; expected one of {PRACTICE_ARCHETYPES}")
    if exercise not in EXERCISES:
        raise ValueError(f"unknown exercise {exercise!r}; expected one of {tuple(EXERCISES)}")
    ex = EXERCISES[exercise]
    geo = GEOMETRY[ex["task_type"]]
    op_id = operator_id or f"TRAINEE-{archetype}-{seed}"
    ss = _seed("practice", archetype, exercise, op_id, seed)
    rng_ops, rng_env, rng_noise = (np.random.default_rng(s) for s in ss.spawn(3))

    kin = ExcavatorKinematics(Noise(rng_noise), material=ex["material"])
    kin.start_engine()
    kin.dial_rpm = kin.s.rpm = RPM_WORK
    kin.s.hyd_lockout = False
    kin.s.coolant_c, kin.s.hyd_oil_temp_c = 86.0, 55.0
    kin.s.boom_angle_deg, kin.s.stick_angle_deg, kin.s.bucket_angle_deg = (
        geo.dig_entry.boom, geo.dig_entry.stick, geo.dig_entry.bucket)
    kin.s.swing_angle_deg = ex["dig_angle_deg"]

    level = skill if skill is not None else 0.2
    rig = Rig(kin, make_operator(archetype, op_id, skill=level), rng_ops, Noise(rng_noise), ex["material"])
    truck = ex["truck"]
    truck_angle = float(truck["angle_deg"] + rng_env.normal(0.0, 2.0)) if truck else None
    dump_angle = truck_angle if truck_angle is not None else float(ex["dump_angle_deg"] + rng_env.normal(0.0, 3.0))
    rig.truck = (truck_angle, truck["dist_m"]) if truck_angle is not None else None

    out: list[PracticeSample] = []
    t = PRACTICE_T0

    def emit(it: Intent, cycle: int) -> None:
        nonlocal t
        joy = rig.actuate(it)
        s = kin.s
        b2t = None
        if truck_angle is not None:
            b2t = round(kin.bucket_to_truck(truck_angle, truck["dist_m"]), 2)
        out.append(PracticeSample(
            ts=round(t, 1), joy_swing=round(joy[0], 3), joy_boom=round(joy[1], 3), joy_stick=round(joy[2], 3),
            joy_bucket=round(joy[3], 3), travel_cmd=0.0, swing_dps=round(s.swing_dps, 2),
            swing_angle_deg=round(s.swing_angle_deg, 2), boom_angle_deg=round(s.boom_angle_deg, 2),
            stick_angle_deg=round(s.stick_angle_deg, 2), bucket_angle_deg=round(s.bucket_angle_deg, 2),
            hyd_pressure_bar=round(s.hyd_pressure_bar, 1), payload_t=round(s.payload_t, 3), bucket_to_truck_m=b2t,
            gt={"phase": it.phase, "cycle": cycle, "archetype": archetype},
        ))
        t += DT

    for _ in range(20):                                   # 2 s settle before the first cycle
        emit(IDLE, 0)
    for c in range(n_cycles):
        if archetype == "novice_improving" and skill is None:
            rig.refresh(0.0, skill=0.2 + 0.4 * c / max(1, n_cycles - 1))
        for it in work_cycle(rig, geo, dump_angle):
            emit(it, c)
    for _ in range(10):
        emit(IDLE, max(0, n_cycles - 1))
    return out
