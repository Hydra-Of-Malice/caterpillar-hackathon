"""Shift lifecycle: current shift, privacy ack, checklist, start/end, conditions, post-shift review."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from sentinel.edge_api import review, services
from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime
from sentinel.shared.schemas import Incident
from sentinel.store.models import (BreakLogRow, ChecklistResultRow, ExposureRow, IncidentRow, MachineRow, OperatorRow,
                                   ShiftRow, TaskRow)
from sentinel.sync import outbox

router = APIRouter(tags=["shift"])


class ChecklistEntry(BaseModel):
    item_id: str
    result: Literal["pass", "fail", "na"]
    note: str | None = None


class ChecklistSubmit(BaseModel):
    results: list[ChecklistEntry] = Field(default_factory=list)


def _shift_or_404(s: Any, shift_id: str) -> ShiftRow:
    shift = s.get(ShiftRow, shift_id)
    if shift is None:
        raise HTTPException(404, f"shift {shift_id} not found")
    return shift


def _checklist_incidents(rt: EdgeRuntime, shift: ShiftRow, failed: list[str], notes: dict[str, str | None]) -> list[str]:
    """One incident per failed critical item per shift (AC1.3); existing ones are reused."""
    items = {i["id"]: i for i in services.checklist_items()}
    with rt.db.session() as s:
        rows = s.scalars(select(IncidentRow).where(IncidentRow.type == "checklist_critical_fail",
                                                   IncidentRow.operator_id == shift.operator_id)).all()
        existing = {r.data["context"].get("item_id"): r.incident_id for r in rows
                    if r.data.get("shift_id") == shift.shift_id}
    ids = []
    for item_id in failed:
        if item_id in existing:
            ids.append(existing[item_id])
            continue
        item = items[item_id]
        incident = Incident(ts=rt.now_ts(), site_id=shift.site_id, machine_id=shift.machine_id,
                            operator_id=shift.operator_id, shift_id=shift.shift_id, source="auto",
                            type="checklist_critical_fail", severity="high", signal_word="WARNING",
                            context={"item_id": item_id, "label": item["label"], "group": item["group"],
                                     "defect_note": notes.get(item_id), "checklist_version": services.checklist_version(),
                                     "routed_to": ["maintenance", "supervisor"], "blocks_shift_start": True},
                            note=f"Pre-shift check failed: {item['label']}", simulated=True)
        rt.alerts.log_incident(incident)
        ids.append(incident.incident_id)
    return ids


@router.get("/shift/current")
def current_shift(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Shift, operator, machine, tasks (with estimates), conditions, checklist status, break state."""
    with rt.db.session() as s:
        shift = services.current_shift(s, rt.machine_id)
        if shift is None:
            raise HTTPException(404, "no shift planned for this machine — run python -m sentinel.seed")
        operator_row = s.get(OperatorRow, shift.operator_id)
        operator = services.operator_dict(operator_row)
        conditions = rt.conditions(shift)
        tasks = s.scalars(select(TaskRow).where(TaskRow.shift_id == shift.shift_id).order_by(TaskRow.priority)).all()
        task_list = [services.task_dict(t, rt.estimate_task(t, shift, operator, conditions)) for t in tasks]
        payload = {"shift": services.shift_dict(shift), "operator": operator,
                   "machine": services.machine_dict(s.get(MachineRow, shift.machine_id)), "tasks": task_list,
                   "conditions": conditions,
                   "checklist_status": services.checklist_status(s, shift.shift_id, operator.get("short_name"))}
    now = rt.now_ts()
    payload.update(continuous_operation_min=round(rt.tracker.continuous_operation_min(now), 1),
                   last_break_ts=rt.tracker.last_break_ts, on_break=rt.tracker.on_break,
                   waiting_for_truck=rt.waiting_for_truck, eta_mode="baseline" if rt.estimator.baseline_mode else "model",
                   simulated=True)
    return payload


@router.post("/shift/{shift_id}/privacy-ack")
def privacy_ack(shift_id: str, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    with rt.db.session() as s:
        _shift_or_404(s, shift_id).privacy_ack = True
    return {"ok": True}


@router.get("/checklist/items")
def checklist_items(rt: EdgeRuntime = Depends(get_rt)) -> list[dict[str, Any]]:
    """Items from config/checklist.yaml, with the current live value for items that have one."""
    snap = rt.latest
    prot = rt.protection()["status"]
    live = {"seatbelt": None if snap is None else ("FASTENED" if snap.seatbelt else "UNFASTENED"),
            "proximity": None if snap is None else ("ACTIVE" if snap.prox_fitted else "NOT FITTED"),
            "protection": "PASSED" if prot == "active" else "DEGRADED"}
    return [{**item, "live_value": live.get(item["live_signal"]) if item.get("live_signal") else None}
            for item in services.checklist_items()]


@router.post("/shift/{shift_id}/checklist")
def submit_checklist(shift_id: str, body: ChecklistSubmit, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Store answers (last answer per item wins). A failed critical item opens an incident."""
    items = {i["id"]: i for i in services.checklist_items()}
    unknown = [r.item_id for r in body.results if r.item_id not in items]
    if unknown:
        raise HTTPException(422, {"reason": "unknown_items", "item_ids": unknown})
    now = rt.now_ts()
    with rt.db.session() as s:
        shift = _shift_or_404(s, shift_id)
        if shift.status == "ended":
            raise HTTPException(409, "shift already ended")
        for r in body.results:
            s.add(ChecklistResultRow(shift_id=shift_id, item_id=r.item_id, result=r.result,
                                     critical=bool(items[r.item_id]["critical"]), note=r.note, ts=now))
        if shift.status == "planned":
            shift.status = "checklist"
    with rt.db.session() as s:
        operator = services.operator_dict(s.get(OperatorRow, shift.operator_id))
        status = services.checklist_status(s, shift_id, operator.get("short_name"))
    failed_now = [r.item_id for r in body.results if r.result == "fail" and items[r.item_id]["critical"]]
    notes = {r.item_id: r.note for r in body.results}
    incident_ids = _checklist_incidents(rt, shift, [i for i in status["failed_critical"] if i in failed_now], notes)
    rt.refresh_context()
    return {"passed": status["passed"], "failed_critical": status["failed_critical"], "incident_ids": incident_ids,
            "checklist_status": status}


@router.post("/shift/{shift_id}/start")
def start_shift(shift_id: str, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """409 while the checklist is incomplete or a critical item failed (that failure opens an incident)."""
    with rt.db.session() as s:
        shift = _shift_or_404(s, shift_id)
        if shift.status == "ended":
            raise HTTPException(409, {"reason": "shift_ended"})
        status = services.checklist_status(s, shift_id, None)
        notes = {i: r.note for i, r in services.latest_results(s, shift_id).items()}
    if shift.status == "active":
        return {"ok": True, "already_active": True, "shift": services.shift_dict(shift)}
    if not status["completed"]:
        raise HTTPException(409, {"reason": "checklist_incomplete", "missing": status["missing"]})
    if status["failed_critical"]:
        ids = _checklist_incidents(rt, shift, status["failed_critical"], notes)
        raise HTTPException(409, {"reason": "critical_item_failed", "failed_critical": status["failed_critical"],
                                  "incident_ids": ids})
    now = rt.now_ts()
    with rt.db.session() as s:
        shift = s.get(ShiftRow, shift_id)
        shift.status, shift.started_at = "active", now
        first = s.scalars(select(TaskRow).where(TaskRow.shift_id == shift_id, TaskRow.status != "done")
                          .order_by(TaskRow.priority)).first()
        if first is not None and first.status == "queued":
            first.status, first.started_at = "in_progress", now
        out = services.shift_dict(shift)
        outbox.enqueue(s, "shift", out, outbox.P_SHIFT)
    rt.reset_shift_state(now)
    rt.refresh_context()
    if first is not None:
        rt.push_task(first.task_id)
    return {"ok": True, "shift": out}


@router.post("/shift/{shift_id}/end")
def end_shift(shift_id: str, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """End the shift, write exposure, then ask the cloud for competency evaluation (queued if offline)."""
    now = rt.now_ts()
    with rt.db.session() as s:
        shift = _shift_or_404(s, shift_id)
        if shift.status != "active":
            raise HTTPException(409, {"reason": "shift_not_active", "status": shift.status})
        stats = rt.close_shift_stats(shift_id)
        for b in s.scalars(select(BreakLogRow).where(BreakLogRow.shift_id == shift_id, BreakLogRow.ended_at.is_(None))):
            b.ended_at = now
        shift.status, shift.ended_at = "ended", now
        for task_type, hours in stats["operating_by_type_h"].items():
            exp = stats["exposure"].get(task_type, {})
            row = ExposureRow(operator_id=shift.operator_id, shift_id=shift_id, task_type=task_type, operating_h=hours,
                              cycles=exp.get("cycles", 0), truck_approach_cycles=exp.get("truck_approach_cycles", 0))
            s.add(row)
            outbox.enqueue(s, "exposure", {"operator_id": row.operator_id, "shift_id": shift_id, "task_type": task_type,
                                           "operating_h": hours, "cycles": row.cycles,
                                           "truck_approach_cycles": row.truck_approach_cycles}, outbox.P_SHIFT)
        out = services.shift_dict(shift)
        outbox.enqueue(s, "shift", {**out, "stats": stats}, outbox.P_SHIFT)
        operator_id = shift.operator_id
    body = {"operator_id": operator_id, "shift_id": shift_id}
    result = None
    if rt.sync.wan_up and rt.sync.flush(max_batches=20)["backlog"] == 0:
        result = rt.sync.request("POST", "/competency/evaluate", json=body)
    if result is not None:
        rt.evaluations[shift_id] = result
        competency = {"status": "evaluated", "result": result}
    else:
        with rt.db.session() as s:
            outbox.enqueue_rpc(s, "POST", "/competency/evaluate", body)
        competency = {"status": "queued", "result": None, "note": "cloud unreachable — evaluation queued in the outbox"}
    rt.save_state()
    rt.refresh_context()
    return {"ok": True, "shift": out, "stats": stats, "competency": competency}


@router.get("/conditions")
def conditions(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Weather (MOCK feed) plus staleness; stale while the WAN is down."""
    return rt.conditions()


@router.get("/review/shift/{shift_id}")
def shift_review(shift_id: str, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    result = review.compose(rt, shift_id)
    if result is None:
        raise HTTPException(404, f"shift {shift_id} not found")
    return result
