"""Tasks with embedded estimates, ETA preview (screen 17) and the "waiting for truck" context tap."""
from __future__ import annotations

from datetime import datetime, time as dtime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from sentinel.edge_api import services
from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime
from sentinel.shared.schemas import TaskEstimate
from sentinel.store.models import OperatorRow, ShiftRow, TaskRow

router = APIRouter(tags=["tasks"])


class TaskPatch(BaseModel):
    status: Literal["queued", "in_progress", "done"] | None = None
    done_qty: float | None = Field(default=None, ge=0)
    priority: int | None = None
    name: str | None = None
    location: str | None = None
    material: str | None = None
    planned_qty: float | None = Field(default=None, gt=0)


class EtaPreview(BaseModel):
    task_type: str
    qty: float = Field(gt=0)
    material: str = "clay_gravel"
    operator_id: str
    machine_id: str | None = None
    planned_start: float | str | None = None
    location: str | None = None
    first_on_site: bool = False


class TaskState(BaseModel):
    waiting_for_truck: bool
    task_id: str | None = None


def _parse_start(value: float | str | None, fallback: float) -> float:
    """Unix seconds, ISO datetime (local if naive) or "HH:MM" today."""
    if value is None or value == "":
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except ValueError:
        pass
    if len(value) <= 5 and ":" in value:
        hh, mm = (int(p) for p in value.split(":"))
        return datetime.combine(datetime.fromtimestamp(fallback).date(), dtime(hh, mm)).timestamp()
    return datetime.fromisoformat(value).timestamp()


def _task_payload(rt: EdgeRuntime, s: Any, task: TaskRow) -> dict[str, Any]:
    shift = s.get(ShiftRow, task.shift_id)
    operator = services.operator_dict(s.get(OperatorRow, shift.operator_id))
    out = services.task_dict(task, rt.estimate_task(task, shift, operator))
    out.update(operator_id=shift.operator_id, machine_id=shift.machine_id)
    return out


@router.get("/tasks")
def list_tasks(shift_id: str | None = None, rt: EdgeRuntime = Depends(get_rt)) -> list[dict[str, Any]]:
    """Tasks of one shift, or of every shift on the current shift's day (AC1.1), each with an estimate."""
    with rt.db.session() as s:
        if shift_id:
            shift = s.get(ShiftRow, shift_id)
            if shift is None:
                raise HTTPException(404, f"shift {shift_id} not found")
            shifts = [shift]
        else:
            current = services.current_shift(s, rt.machine_id)
            shifts = services.shifts_on_day(s, services.shift_dict(current)["date"]) if current else []
        out = []
        for shift in shifts:
            operator = services.operator_dict(s.get(OperatorRow, shift.operator_id))
            conditions = rt.conditions(shift)
            for t in s.scalars(select(TaskRow).where(TaskRow.shift_id == shift.shift_id).order_by(TaskRow.priority)):
                d = services.task_dict(t, rt.estimate_task(t, shift, operator, conditions))
                d.update(operator_id=shift.operator_id, machine_id=shift.machine_id)
                out.append(d)
        return out


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, body: TaskPatch, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    now = rt.now_ts()
    with rt.db.session() as s:
        task = s.get(TaskRow, task_id)
        if task is None:
            raise HTTPException(404, f"task {task_id} not found")
        for field in ("priority", "name", "location", "material", "planned_qty"):
            if getattr(body, field) is not None:
                setattr(task, field, getattr(body, field))
        if body.done_qty is not None:
            task.done_qty = min(body.done_qty, task.planned_qty)
        if body.status == "in_progress" and task.status != "in_progress":
            for other in s.scalars(select(TaskRow).where(TaskRow.shift_id == task.shift_id,
                                                         TaskRow.status == "in_progress")):
                other.status = "queued"
            task.started_at = task.started_at or now
        if body.status:
            task.status = body.status
        if task.done_qty >= task.planned_qty and task.status != "done":
            task.status = "done"
        if task.status == "done":
            task.done_at = task.done_at or now
    rt.refresh_context()
    rt.push_task(task_id)
    with rt.db.session() as s:
        return _task_payload(rt, s, s.get(TaskRow, task_id))


@router.get("/tasks/{task_id}/eta", response_model=TaskEstimate)
def task_eta(task_id: str, rt: EdgeRuntime = Depends(get_rt)) -> TaskEstimate:
    with rt.db.session() as s:
        task = s.get(TaskRow, task_id)
        if task is None:
            raise HTTPException(404, f"task {task_id} not found")
        shift = s.get(ShiftRow, task.shift_id)
        return rt.estimate_task(task, shift, services.operator_dict(s.get(OperatorRow, shift.operator_id)))


@router.post("/eta/preview", response_model=TaskEstimate)
def eta_preview(body: EtaPreview, rt: EdgeRuntime = Depends(get_rt)) -> TaskEstimate:
    """Estimate for a planned task (screen 17), using the current MOCK weather."""
    now = rt.now_ts()
    try:
        start = _parse_start(body.planned_start, now)
    except ValueError as exc:
        raise HTTPException(422, f"planned_start: {exc}") from exc
    with rt.db.session() as s:
        operator = services.operator_dict(s.get(OperatorRow, body.operator_id))
    if not operator:
        raise HTTPException(404, f"operator {body.operator_id} not found")
    task = {"task_id": "preview", "type": body.task_type, "planned_qty": body.qty, "material": body.material,
            "machine_id": body.machine_id or rt.machine_id, "first_on_site": body.first_on_site,
            "meta": {"planned_start": start}}
    conditions = {**rt.conditions(), "now_ts": now, "machine_id": body.machine_id or rt.machine_id}
    return rt.estimator.estimate(task, operator, conditions)


@router.post("/context/task-state")
def task_state(body: TaskState, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Operator "WAITING FOR TRUCK" tap: idle advisories are suppressed (with a logged reason) while on."""
    rt.set_waiting(body.waiting_for_truck)
    return {"ok": True, "waiting_for_truck": rt.waiting_for_truck}
