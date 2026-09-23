"""Small synthetic excavator telemetry for pipeline tests (SIMULATED, test-only).

Truck-loading cycles: dig → loaded swing (+ve) → dump → empty swing (−ve), with swing
speed following a half-sine so the 90° swing ends slowly at the truck. `swing_scale`
speeds the swing up (a fast operator covers the arc faster, peaking higher near the truck).
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from sentinel.pipeline.features import COL, SIGNALS, Window, WindowMeta
from sentinel.shared.schemas import TelemetrySample

T0 = 1_760_000_000.0
DT = 0.1
META: dict[str, Any] = dict(site_id="north-quarry", machine_id="EX-07", operator_id="OP-1042",
                            shift_id="SH-1", task_id="T-1", task_type="truck_loading", zone="TL-1")
IDLE: dict[str, Any] = dict(rpm=1000.0, throttle_pct=20.0, hyd_pressure_bar=35.0, prox_truck_m=6.0,
                            bucket_to_truck_m=12.0, park_brake=True)


def make_sample(ts: float, seq: int = 0, **kw: Any) -> TelemetrySample:
    """A validated sample with demo-world defaults, overridden by kwargs."""
    return TelemetrySample(ts=ts, seq=seq, **{**META, **IDLE, **kw})


def _dist(angle: float) -> float:
    return 1.0 + 11.0 * max(0.0, 1.0 - angle / 90.0)


def loading_cycles(n_cycles: int, seed: int = 0, t0: float = T0, swing_scale: float = 1.0,
                   noise: float = 0.01, **meta: Any) -> list[TelemetrySample]:
    """n truck-loading cycles at 10 Hz (~19 s each at swing_scale = 1)."""
    rng = np.random.default_rng(seed)
    rows: list[dict[str, Any]] = []

    def add(n: int, fn: Any) -> None:
        for i in range(n):
            rows.append(fn(i / max(n - 1, 1), i))

    for _ in range(n_cycles):
        dig_n = int(rng.uniform(55, 65))
        swing_n = max(10, int(rng.uniform(45, 55) / swing_scale))
        dump_n, ret_n = int(rng.uniform(25, 35)), max(10, int(rng.uniform(45, 55) / swing_scale))
        peak = 90.0 * math.pi / (2 * swing_n * DT)
        add(dig_n, lambda u, i: dict(joy_stick=0.7, joy_bucket=0.6, joy_boom=-0.1, payload_t=2.0 * u,
                                     hyd_pressure_bar=200 + 60 * math.sin(math.pi * u), swing_dps=0.0,
                                     swing_angle_deg=0.0, bucket_to_truck_m=12.0, boom_angle_deg=20.0))
        add(swing_n, lambda u, i: dict(joy_swing=0.8 * math.sin(math.pi * u) + 0.05, joy_boom=0.5 if u < 0.5 else 0.0,
                                       swing_dps=peak * math.sin(math.pi * u), payload_t=2.0,
                                       swing_angle_deg=90 * (1 - math.cos(math.pi * u)) / 2,
                                       bucket_to_truck_m=_dist(90 * (1 - math.cos(math.pi * u)) / 2),
                                       hyd_pressure_bar=160.0, boom_angle_deg=30.0))
        add(dump_n, lambda u, i: dict(joy_bucket=-0.7, payload_t=2.0 * (1 - u), swing_dps=0.0,
                                      swing_angle_deg=90.0, bucket_to_truck_m=1.0, hyd_pressure_bar=110.0,
                                      boom_angle_deg=30.0))
        add(ret_n, lambda u, i: dict(joy_swing=-0.8 * math.sin(math.pi * u) - 0.05, swing_dps=-peak * math.sin(math.pi * u),
                                     payload_t=0.0, swing_angle_deg=90 * (1 + math.cos(math.pi * u)) / 2,
                                     bucket_to_truck_m=_dist(90 * (1 + math.cos(math.pi * u)) / 2),
                                     hyd_pressure_bar=140.0, boom_angle_deg=25.0))
    out = []
    for k, r in enumerate(rows):
        for axis in ("joy_swing", "joy_boom", "joy_stick", "joy_bucket"):
            r[axis] = float(np.clip(r.get(axis, 0.0) + rng.normal(0, noise), -1, 1))
        r["swing_dps"] += float(rng.normal(0, 0.3))
        r["hyd_pressure_bar"] += float(rng.normal(0, 2.0))
        out.append(make_sample(t0 + k * DT, k, rpm=1700.0 + rng.normal(0, 5), throttle_pct=80.0 + rng.normal(0, 0.5),
                               **{**r, **meta}))
    return out


def shift_started(t0: float, **kw: Any) -> TelemetrySample:
    """A working sample 700 s before t0 in the same shift, so t0 is past the idle warm-up gate."""
    return make_sample(t0 - 700.0, 0, joy_stick=0.5, **kw)


def idle_samples(duration_s: float, t0: float, seq0: int = 0, **kw: Any) -> list[TelemetrySample]:
    """Engine on, no command, no motion."""
    n = int(round(duration_s / DT))
    return [make_sample(t0 + i * DT, seq0 + i, **kw) for i in range(n)]


def window_from(cols: dict[str, Any], n: int = 200, variant: str = "BC",
                cycle: dict[str, float] | None = None, t0: float = T0) -> Window:
    """A Window built from hand-made column arrays (unspecified signals get idle defaults)."""
    defaults = {"engine_on": 1.0, "rpm": 1700.0, "throttle_pct": 80.0, "prox_fitted": 1.0 if variant == "BC" else 0.0,
                "prox_person_m": math.nan, "prox_truck_m": 6.0 if variant == "BC" else math.nan,
                "bucket_to_truck_m": 12.0 if variant == "BC" else math.nan, "hyd_pressure_bar": 35.0}
    data = np.zeros((n, len(SIGNALS)))
    data[:, COL["ts"]] = t0 + np.arange(n) * DT
    for name, value in {**defaults, **cols}.items():
        data[:, COL[name]] = value
    meta = WindowMeta(META["site_id"], META["machine_id"], META["operator_id"], META["shift_id"],
                      META["task_id"], META["task_type"], META["zone"], "SIM")
    return Window(float(data[0, 0] - DT), float(data[-1, 0]), meta, data,
                  cycle or {"cycle_time_s": 0.0, "cycle_time_cv": 0.0, "payload_per_cycle_t": 0.0}, variant)  # type: ignore[arg-type]


def fleet_frame(cycles_per_operator: int = 45, seed: int = 0) -> "pd.DataFrame":
    """Two machines × three operators each, consecutive in time, as a parquet-like frame."""
    import pandas as pd

    samples: list[TelemetrySample] = []
    for m_i, machine in enumerate(("EX-07", "EX-09")):
        t = T0
        for o_i in range(3):
            op = f"OP-{m_i}{o_i}"
            seg = loading_cycles(cycles_per_operator, seed=seed + 10 * m_i + o_i, t0=t,
                                 swing_scale=1.0 + 0.05 * o_i, machine_id=machine, operator_id=op,
                                 shift_id=f"SH-{machine}-{o_i}")
            samples.extend(seg)
            t = seg[-1].ts + DT
    return pd.DataFrame([s.model_dump(mode="json") for s in samples])
