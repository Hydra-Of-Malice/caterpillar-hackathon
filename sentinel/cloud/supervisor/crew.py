"""Crew summary (screen 14): one row per machine, ordered by machine id. Aggregates only, no ranking."""
from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.supervisor.idle import idle_by_machine
from sentinel.shared.config import load_yaml
from sentinel.store.models import (AlertRow, BreakLogRow, EventRow, ExposureRow, MachineRow, OperatorRow, ShiftRow,
                                   TaskRow)

SIGNAL_WORDS = ("DANGER", "WARNING", "CAUTION", "NOTICE", "SUPERVISOR NOTIFIED")


def _protection(machine: MachineRow | None, stale_s: float) -> dict[str, Any]:
    health = ((machine.meta or {}).get("health") if machine else None) or {}
    if not health:
        return {"status": "unknown", "stale": True, "age_s": None, "heartbeat_age_s": None}
    age = time.time() - float(health.get("received_at", 0.0))
    return {"status": health.get("protection", "unknown"), "stale": age > stale_s, "age_s": round(age, 1),
            "heartbeat_age_s": health.get("safety_heartbeat_age_s"), "simulated": bool(health.get("simulated"))}


def _task_view(task: TaskRow) -> dict[str, Any]:
    pct = round(100.0 * task.done_qty / task.planned_qty, 1) if task.planned_qty else None
    return {"task_id": task.task_id, "name": task.name, "type": task.type, "status": task.status,
            "done_qty": task.done_qty, "planned_qty": task.planned_qty, "qty_unit": task.qty_unit,
            "progress_pct": pct, "estimate": (task.meta or {}).get("estimate")}


def _continuous_min(s: Session, shift: ShiftRow, health: dict[str, Any], last_activity: float | None) -> float | None:
    if health.get("continuous_operation_min") is not None:
        return float(health["continuous_operation_min"])
    if shift.started_at is None or last_activity is None:
        return None
    breaks = [b.ended_at for b in s.scalars(select(BreakLogRow).where(BreakLogRow.shift_id == shift.shift_id))
              if b.ended_at]
    since = max([shift.started_at, *breaks])
    return round(max(0.0, last_activity - since) / 60.0, 1)


def crew_summary(s: Session) -> dict[str, Any]:
    """Per machine/operator rows plus KPI tiles and the raw quantities the value model needs."""
    cfg = load_yaml("cloud")["supervisor"]
    open_states = set(cfg["open_alert_states"])
    fuel_lph = float(cfg["idle_fuel_lph"])
    machines = {m.machine_id: m for m in s.scalars(select(MachineRow))}
    latest: dict[str, ShiftRow] = {}
    for sh in s.scalars(select(ShiftRow).order_by(ShiftRow.planned_start)):
        current = latest.get(sh.machine_id)
        if current is None or current.status != "active" or sh.status == "active":
            latest[sh.machine_id] = sh          # the active shift wins, else the latest planned
    rows, kpi_tasks = [], {"done": 0, "in_progress": 0, "queued": 0}
    open_escalations = 0
    for machine_id in sorted(set(machines) | set(latest)):
        sh = latest.get(machine_id)
        machine = machines.get(machine_id)
        protection = _protection(machine, float(cfg["health_stale_s"]))
        if sh is None:
            rows.append({"machine_id": machine_id, "operator": None, "shift": None, "current_task": None,
                         "protection": protection, "open_alerts": {w: 0 for w in SIGNAL_WORDS},
                         "continuous_operation_min": None, "value_inputs": None})
            continue
        op = s.get(OperatorRow, sh.operator_id)
        tasks = sorted(s.scalars(select(TaskRow).where(TaskRow.shift_id == sh.shift_id)), key=lambda t: t.priority)
        for t in tasks:
            kpi_tasks[t.status] = kpi_tasks.get(t.status, 0) + 1
        current = next((t for t in tasks if t.status == "in_progress"), None) or \
            next((t for t in tasks if t.status == "queued"), None)
        alerts = [a for a in s.scalars(select(AlertRow).where(AlertRow.machine_id == machine_id,
                                                               AlertRow.operator_id == sh.operator_id))
                  if sh.planned_start - 3600 <= a.ts <= (sh.ended_at or sh.planned_end) + 3600]
        counts = {w: 0 for w in SIGNAL_WORDS}
        for a in alerts:
            if a.state in open_states and "resolution" not in (a.data or {}):
                word = (a.data or {}).get("signal_word", "NOTICE")
                counts[word] = counts.get(word, 0) + 1
                open_escalations += a.tier == "T4"
        events = list(s.scalars(select(EventRow).where(EventRow.shift_id == sh.shift_id)))
        last_activity = max([e.ts for e in events] + [a.ts for a in alerts], default=None)
        health = ((machine.meta or {}).get("health") if machine else None) or {}
        exposure_h = sum(x.operating_h for x in s.scalars(select(ExposureRow).where(ExposureRow.shift_id == sh.shift_id)))
        idle = idle_by_machine(events, fuel_lph).get(machine_id, {})
        m3 = sum(t.done_qty for t in tasks if t.qty_unit == "m3")
        rows.append({
            "machine_id": machine_id,
            "machine_model": machine.model if machine else None,
            "operator": {"operator_id": sh.operator_id, "name": op.name if op else None},
            "shift": {"shift_id": sh.shift_id, "status": sh.status, "planned_start": sh.planned_start,
                      "planned_end": sh.planned_end},
            "current_task": _task_view(current) if current else None,
            "tasks": [_task_view(t) for t in tasks],
            "protection": protection,
            "open_alerts": counts,
            "continuous_operation_min": _continuous_min(s, sh, health, last_activity),
            "last_activity_ts": last_activity,
            "value_inputs": {
                "operating_h": round(exposure_h, 2),
                "idle_min_by_reason": {k: idle.get(k + "_min", 0.0)
                                       for k in ("waiting_for_truck", "unexplained")},
                "idle_fuel_l_estimate": idle.get("fuel_l_total", 0.0),
                "idle_fuel_l_unexplained": idle.get("fuel_l_unexplained", 0.0),
                "m3_moved": round(m3, 1) if any(t.qty_unit == "m3" for t in tasks) else None,
                "label": "SIMULATED",
            },
        })
    idle_total = sum(sum(r["value_inputs"]["idle_min_by_reason"].values()) for r in rows if r["value_inputs"])
    idle_wait = sum(r["value_inputs"]["idle_min_by_reason"]["waiting_for_truck"] for r in rows if r["value_inputs"])
    return {
        "kpis": {
            "machines_active": sum(1 for r in rows if r["shift"] and r["shift"]["status"] == "active"),
            "machines_total": len(rows),
            "protection_degraded": sum(1 for r in rows if r["protection"]["status"] == "degraded"),
            "open_escalations": open_escalations,
            "idle_today_min": round(idle_total, 1),
            "idle_waiting_for_truck_pct": round(100 * idle_wait / idle_total, 1) if idle_total else None,
            "tasks": kpi_tasks,
        },
        "rows": rows,
        "ordering": "machine_id (no operator ranking)",
        "note": "No operator ranking. Individual coaching data is visible to the operator and their instructor.",
        "label": "SIMULATED",
    }
