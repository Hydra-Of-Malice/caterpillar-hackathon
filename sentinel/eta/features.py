"""Pre-task feature building and encoding for the task-time model (09 §7, leakage rule 6)."""
from __future__ import annotations

import math
from datetime import datetime
from typing import Any

import numpy as np

from sentinel.shared import config

FEATURES = ["task_type", "material", "machine_id", "log_qty", "log_exp_h",
            "first_on_site", "hour", "temp_c", "rain_frac"]
CATEGORIES: dict[str, list[str]] = {
    "task_type": ["truck_loading", "trenching", "stockpile"],
    "material": ["clay_gravel", "sand", "topsoil", "rock"],
    "machine_id": ["EX-07", "EX-09"],
}
MATERIAL_LABEL = {"clay_gravel": "Clay-gravel", "sand": "Sand", "topsoil": "Topsoil", "rock": "Rock"}
DEFAULT_MATERIAL = "clay_gravel"


def encode(f: dict[str, Any]) -> list[float]:
    """Raw feature dict (history schema) → model row. Unknown categories become NaN (missing)."""
    row: list[float] = []
    for name in FEATURES:
        if name in CATEGORIES:
            cats = CATEGORIES[name]
            row.append(float(cats.index(f[name])) if f.get(name) in cats else math.nan)
        elif name == "log_qty":
            row.append(math.log(max(float(f["qty"]), 1e-3)))
        elif name == "log_exp_h":
            row.append(math.log1p(max(float(f["exp_h"]), 0.0)))
        else:
            row.append(float(f[name]))
    return row


def encode_many(feature_dicts: list[dict[str, Any]]) -> np.ndarray:
    return np.asarray([encode(f) for f in feature_dicts], dtype=float)


def _local_hour(ts: float | None) -> int:
    return datetime.fromtimestamp(ts).hour if ts else 8


def rain_overlap(start_ts: float | None, duration_min: float, conditions: dict[str, Any]) -> float:
    """Share of the planned task window [start, start + duration] that falls in the rain window."""
    if "rain_frac" in conditions:
        return float(conditions["rain_frac"])
    rain_from = conditions.get("rain_from_ts")
    if rain_from is None or start_ts is None or duration_min <= 0:
        return 1.0 if conditions.get("raining") else 0.0
    rain_until = conditions.get("rain_until_ts") or math.inf
    end = start_ts + duration_min * 60.0
    overlap = max(0.0, min(end, rain_until) - max(start_ts, float(rain_from)))
    return round(min(1.0, overlap / (duration_min * 60.0)), 3)


def task_start_ts(task: dict[str, Any]) -> float | None:
    """Planned (or actual) start: task.started_at, task.planned_start, or task.meta.planned_start."""
    meta = task.get("meta") or {}
    for value in (task.get("started_at"), task.get("planned_start"), meta.get("planned_start")):
        if value is not None:
            return float(value)
    return None


def build_features(task: dict[str, Any], operator: dict[str, Any], conditions: dict[str, Any],
                   duration_guess_min: float) -> dict[str, Any]:
    """Assemble the history-schema feature dict from API-level task / operator / conditions dicts."""
    start = task_start_ts(task) or conditions.get("now_ts")
    return {
        "task_type": task.get("type") or task.get("task_type"),
        "material": task.get("material") or DEFAULT_MATERIAL,
        "machine_id": task.get("machine_id") or conditions.get("machine_id") or config.MACHINE_ID,
        "qty": float(task.get("planned_qty") or task.get("qty") or 1.0),
        "qty_unit": task.get("qty_unit") or task.get("unit") or "m3",
        "exp_h": float(operator.get("operating_hours") or operator.get("exp_h") or 0.0),
        "first_on_site": bool(task.get("first_on_site", False)),
        "hour": _local_hour(start),
        "temp_c": float(conditions.get("temp_c", 20.0)),
        "rain_frac": rain_overlap(start, duration_guess_min, conditions),
    }


def driver_label(name: str, f: dict[str, Any]) -> tuple[str, str]:
    """(factor key, human label) for one model feature, phrased from the task's actual value."""
    if name == "material":
        return "material", f"{MATERIAL_LABEL.get(f['material'], f['material'])} material"
    if name == "machine_id":
        return "machine", f"Machine {f['machine_id']}"
    if name == "log_qty":
        return "quantity", f"Quantity {f['qty']:g} {f.get('qty_unit', '')}".strip()
    if name == "log_exp_h":
        return "operator_experience", f"Operator experience {f['exp_h']:.0f} h"
    if name == "first_on_site":
        return "first_on_site", "First time on this site" if f["first_on_site"] else "Worked this site before"
    if name == "hour":
        return "start_time", f"Start time {int(f['hour']):02d}:00"
    if name == "temp_c":
        return "temperature", f"Temperature {f['temp_c']:.0f} °C"
    if name == "rain_frac":
        return "rain", "Rain during task" if f["rain_frac"] > 0 else "No rain expected during task"
    return name, name
