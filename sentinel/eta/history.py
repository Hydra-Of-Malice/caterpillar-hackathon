"""SIMULATED completed-task history — training data for the task-time model (09 §7).

Every record is synthetic: a seeded generative model of per-unit work rate with realistic
drivers (task type, quantity, material, rain, temperature, operator experience, machine,
first time on site, time of day) plus heteroscedastic noise and occasional delays. Effect
sizes are [HYPOTHESIS] values chosen to be plausible, not measured Caterpillar data.
"""
from __future__ import annotations

import math
from datetime import datetime, time, timedelta
from typing import Any

import numpy as np

QTY_UNIT = {"truck_loading": "m3", "trenching": "m", "stockpile": "m3"}
TYPE_SHARE = {"truck_loading": 0.5, "trenching": 0.3, "stockpile": 0.2}
QTY_RANGE = {"truck_loading": (80.0, 650.0), "trenching": (15.0, 110.0), "stockpile": (30.0, 250.0)}
REF_QTY = {"truck_loading": 300.0, "trenching": 50.0, "stockpile": 100.0}
BASE_MIN_PER_UNIT = {"truck_loading": 0.30, "trenching": 1.20, "stockpile": 0.30}
MATERIAL_SHARE = {"clay_gravel": 0.45, "sand": 0.20, "topsoil": 0.15, "rock": 0.20}
MATERIAL_EFFECT = {"clay_gravel": 0.0, "sand": -0.10, "topsoil": -0.06, "rock": 0.28}
RAIN_EFFECT = {"truck_loading": 0.08, "trenching": 0.15, "stockpile": 0.06}
NOISE_SD = {"truck_loading": 0.16, "trenching": 0.13, "stockpile": 0.18}
MACHINES = ("EX-07", "EX-09")
MACHINE_EFFECT = {"EX-07": 0.0, "EX-09": 0.04}


def log_rate_mean(f: dict[str, Any]) -> float:
    """Expected log(minutes per unit) for one task's pre-task features (the SIMULATED ground truth)."""
    tt = f["task_type"]
    lr = math.log(BASE_MIN_PER_UNIT[tt])
    lr += MATERIAL_EFFECT[f["material"]]
    lr += RAIN_EFFECT[tt] * f["rain_frac"]
    lr += 0.012 * max(0.0, f["temp_c"] - 28.0) + 0.01 * max(0.0, 5.0 - f["temp_c"])
    lr += 0.45 * math.exp(-f["exp_h"] / 1500.0)                 # learning curve: novices are slower
    lr += MACHINE_EFFECT.get(f["machine_id"], 0.0)
    if f["first_on_site"]:
        lr += 0.15 if tt == "trenching" else 0.12
    hour = f["hour"]
    if hour >= 20 or hour < 5:
        lr += 0.07
    elif hour >= 14:
        lr += 0.03
    lr += -0.08 * math.log(f["qty"] / REF_QTY[tt])              # set-up overhead: small jobs are slower per unit
    return lr


def _operator_pool(rng: np.random.Generator, n: int = 40) -> np.ndarray:
    """Experience hours at the start of the history window, log-uniform 50 h .. 20 000 h."""
    return np.exp(rng.uniform(math.log(50.0), math.log(20000.0), size=n))


def generate_history(n: int = 1500, seed: int = 42, end: datetime | None = None,
                     days: int = 365) -> list[dict[str, Any]]:
    """Generate ``n`` SIMULATED completed tasks, sorted by ``completed_at`` (unix seconds).

    Returns dicts ``{"task_type", "features", "duration_min", "completed_at", "simulated"}`` where
    ``features`` holds only pre-task fields (09 §6 leakage rule 6).
    """
    rng = np.random.default_rng(seed)
    end = end or datetime(2026, 9, 22, 18, 0)
    start = end - timedelta(days=days)
    pool = _operator_pool(rng)
    types = list(TYPE_SHARE)
    materials = list(MATERIAL_SHARE)
    day_offsets = np.sort(rng.uniform(0.0, days, size=n))
    records: list[dict[str, Any]] = []
    for day in day_offsets:
        tt = str(rng.choice(types, p=list(TYPE_SHARE.values())))
        lo, hi = QTY_RANGE[tt]
        qty = float(round(math.exp(rng.uniform(math.log(lo), math.log(hi))), 0))
        op = int(rng.integers(len(pool)))
        exp_h = float(pool[op] + day * 6.0)                        # experience grows ~6 h per day
        late = rng.random() < 0.3
        hour = int(rng.integers(14, 22) if late else rng.integers(6, 14))
        season = 18.0 + 10.0 * math.sin(2 * math.pi * (day / 365.0 - 0.25))
        temp_c = float(round(season + rng.normal(0.0, 3.0), 1))
        rain_frac = float(round(rng.uniform(0.1, 1.0), 2)) if rng.random() < 0.25 else 0.0
        first = bool(rng.random() < (0.20 if tt == "trenching" else 0.10))
        feats = {
            "task_type": tt, "material": str(rng.choice(materials, p=list(MATERIAL_SHARE.values()))),
            "machine_id": str(rng.choice(MACHINES)), "qty": qty, "qty_unit": QTY_UNIT[tt],
            "exp_h": round(exp_h, 1), "first_on_site": first, "hour": hour,
            "temp_c": temp_c, "rain_frac": rain_frac,
        }
        sd = NOISE_SD[tt] * (1.3 if exp_h < 1000 else 1.0)
        lr = log_rate_mean(feats) + rng.normal(0.0, sd)
        if rng.random() < 0.06:                                    # breakdown / truck shortage delay
            lr += rng.uniform(0.15, 0.45)
        duration = qty * math.exp(lr)
        started = datetime.combine((start + timedelta(days=float(day))).date(), time(hour)) \
            + timedelta(minutes=float(rng.uniform(0, 45)))
        records.append({
            "task_type": tt, "features": feats, "duration_min": round(duration, 2),
            "completed_at": (started + timedelta(minutes=duration)).timestamp(), "simulated": True,
        })
    records.sort(key=lambda r: r["completed_at"])
    return records
