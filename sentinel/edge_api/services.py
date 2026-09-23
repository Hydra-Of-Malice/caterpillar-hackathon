"""Edge DB queries and response shaping shared by the routes and the runtime."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import TaskEstimate
from sentinel.store.models import ChecklistResultRow, MachineRow, OperatorRow, ShiftRow, TaskRow

CHECKLIST_CONFIG = "checklist"


def row_dict(row: Any) -> dict[str, Any]:
    return {c.key: getattr(row, c.key) for c in row.__table__.columns}


# ------------------------------------------------------------------ shifts
def current_shift(s: Session, machine_id: str) -> ShiftRow | None:
    """Active shift on this machine; else the earliest not-ended shift of the latest planned day; else the last."""
    rows = s.scalars(select(ShiftRow).where(ShiftRow.machine_id == machine_id)
                     .order_by(ShiftRow.planned_start)).all()
    active = [r for r in rows if r.status == "active"]
    if active:
        return active[-1]
    open_rows = [r for r in rows if r.status != "ended"]
    if open_rows:
        latest_day = max(datetime.fromtimestamp(r.planned_start).date() for r in open_rows)
        return next(r for r in open_rows if datetime.fromtimestamp(r.planned_start).date() == latest_day)
    return rows[-1] if rows else None


def shift_dict(row: ShiftRow) -> dict[str, Any]:
    d = row_dict(row)
    d.update(planned_start_ts=row.planned_start, planned_end_ts=row.planned_end,
             date=datetime.fromtimestamp(row.planned_start).date().isoformat(), location="North Quarry")
    return d


def operator_dict(row: OperatorRow | None) -> dict[str, Any]:
    if row is None:
        return {}
    d = row_dict(row)
    d.update(experience_years=round(row.experience_months / 12, 1), level=(row.meta or {}).get("level"),
             short_name=(row.meta or {}).get("short_name"))
    return d


def machine_dict(row: MachineRow | None) -> dict[str, Any]:
    return row_dict(row) if row is not None else {}


def shifts_on_day(s: Session, day: str) -> list[ShiftRow]:
    rows = s.scalars(select(ShiftRow).order_by(ShiftRow.planned_start)).all()
    return [r for r in rows if datetime.fromtimestamp(r.planned_start).date().isoformat() == day]


# ------------------------------------------------------------------ tasks
def progress_frac(row: TaskRow) -> float:
    return min(1.0, row.done_qty / row.planned_qty) if row.planned_qty else 0.0


def task_dict(row: TaskRow, estimate: TaskEstimate | None) -> dict[str, Any]:
    """TaskRow plus the UI fields (unit, zone, progress_pct, required_module, embedded estimate)."""
    d = row_dict(row)
    meta = row.meta or {}
    d.update(unit=row.qty_unit, zone=meta.get("zone"), progress_pct=round(100 * progress_frac(row), 1),
             required_module=row.required_module_id, required_module_title=meta.get("required_module_title"),
             spotter_assigned=meta.get("spotter_assigned"), planned_duration_min=meta.get("planned_duration_min"),
             planned_start=meta.get("planned_start"),
             estimate=estimate.model_dump(mode="json") if estimate else None, simulated=True)
    return d


def task_inputs(task: TaskRow, shift: ShiftRow, now_ts: float) -> dict[str, Any]:
    """Estimator task dict: TaskRow fields + machine + elapsed time for in-progress updates."""
    d = row_dict(task)
    d["machine_id"] = shift.machine_id
    if task.started_at is not None and task.status == "in_progress":
        d["elapsed_min"] = max(0.0, (now_ts - task.started_at) / 60.0)
    return d


# ------------------------------------------------------------------ checklist
def checklist_items() -> list[dict[str, Any]]:
    cfg = load_yaml(CHECKLIST_CONFIG)
    groups = {g["id"]: g["label"] for g in cfg["groups"]}
    return [{**item, "group_label": groups.get(item["group"], item["group"]),
             "live_signal": item.get("live_signal")} for item in cfg["items"]]


def checklist_version() -> str:
    return load_yaml(CHECKLIST_CONFIG)["version"]


def latest_results(s: Session, shift_id: str) -> dict[str, ChecklistResultRow]:
    rows = s.scalars(select(ChecklistResultRow).where(ChecklistResultRow.shift_id == shift_id)
                     .order_by(ChecklistResultRow.ts, ChecklistResultRow.id)).all()
    return {r.item_id: r for r in rows}                       # the last answer per item wins


def checklist_status(s: Session, shift_id: str, signed_by: str | None) -> dict[str, Any]:
    items = checklist_items()
    results = latest_results(s, shift_id)
    answered = [i for i in items if i["id"] in results]
    failed = [i["id"] for i in answered if results[i["id"]].result == "fail"]
    failed_critical = [i["id"] for i in answered if i["critical"] and results[i["id"]].result == "fail"]
    completed = len(answered) == len(items)
    return {
        "completed": completed, "passed": completed and not failed_critical, "total": len(items),
        "answered": len(answered), "passed_count": sum(1 for i in answered if results[i["id"]].result == "pass"),
        "failed_count": len(failed), "failed": failed, "failed_critical": failed_critical,
        "missing": [i["id"] for i in items if i["id"] not in results],
        "signed_at": max((r.ts for r in results.values()), default=None) if completed else None,
        "signed_by": signed_by if completed else None, "version": checklist_version(),
    }
