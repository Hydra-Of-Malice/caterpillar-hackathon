"""Motion replay for the training UI: an animated side view (boom, stick, bucket) and top view (swing)
of one simulated operator's work cycles. Replaces the "expert demonstration video" placeholder with the
same kind of data the Expert Motion Model learns from. SIMULATED — not footage of a real operator.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

from sentinel.sim.kinematics import BOOM_PIVOT_X, BOOM_PIVOT_Z, L_BOOM, L_BUCKET, L_STICK
from sentinel.sim.practice import EXERCISES, generate_practice_session


def _joints(boom: float, stick: float, bucket: float) -> list[tuple[float, float]]:
    """Side-view (reach r, height z) of boom pivot, boom tip, stick tip and bucket tip — same geometry as the sim."""
    a1 = math.radians(boom)
    a2 = a1 - math.radians(180.0 - stick)
    a3 = a2 + math.radians(bucket - 60.0)
    p0 = (BOOM_PIVOT_X, BOOM_PIVOT_Z)
    p1 = (p0[0] + L_BOOM * math.cos(a1), p0[1] + L_BOOM * math.sin(a1))
    p2 = (p1[0] + L_STICK * math.cos(a2), p1[1] + L_STICK * math.sin(a2))
    p3 = (p2[0] + L_BUCKET * math.cos(a3), p2[1] + L_BUCKET * math.sin(a3))
    return [tuple(round(v, 2) for v in p) for p in (p0, p1, p2, p3)]


@lru_cache(maxsize=16)
def motion_replay(archetype: str = "expert", exercise: str = "truck_loading_basic", cycles: int = 2,
                  seed: int = 7, hz: int = 10) -> dict[str, Any]:
    """Frames at `hz` (≤ 10) for `cycles` work cycles of a simulated operator of the given archetype."""
    samples = generate_practice_session(archetype, n_cycles=cycles, seed=seed, exercise=exercise)
    step = max(1, round(10 / max(1, min(hz, 10))))
    t0 = samples[0].ts
    frames = []
    for s in samples[::step]:
        gt = s.gt or {}
        frames.append({
            "t": round(s.ts - t0, 2),
            "phase": gt.get("phase"),
            "cycle": gt.get("cycle"),
            "joints": _joints(s.boom_angle_deg, s.stick_angle_deg, s.bucket_angle_deg),
            "swing_deg": round(s.swing_angle_deg, 1),
            "swing_dps": round(s.swing_dps, 1),
            "bucket_to_truck_m": s.bucket_to_truck_m,
            "payload_t": round(s.payload_t, 2),
        })
    truck = EXERCISES[exercise].get("truck")
    return {
        "archetype": archetype,
        "exercise": exercise,
        "hz": 10 // step,
        "duration_s": frames[-1]["t"] if frames else 0.0,
        "truck": {"angle_deg": truck["angle_deg"], "dist_m": truck["dist_m"], "rim_m": truck["rim_m"]} if truck else None,
        "near_truck_rule": {"swing_dps": 35.0, "within_m": 5.0},
        "frames": frames,
        "label": "SIMULATED operator motion — not footage of a real operator",
    }
