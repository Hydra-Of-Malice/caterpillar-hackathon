"""Task Centre fleet router: every machine's utilisation, downtime, history and maintenance.

Admin-only, like the rest of ``/tc/admin``. Reads:

* ``GET /tc/admin/fleet`` - one row per machine (current state, window stats, service due) + totals;
* ``GET /tc/admin/machines/{id}`` - one machine in full: state timeline, work orders, incidents,
  flags, tasks, cameras and the people assigned to it.

Writes manage work orders; each one appends to the record's ``history`` and moves the machine's
state log the way the work did (see :mod:`sentinel.taskcentre.fleet`). The figures are derived from
the state log on every request; in the demo that log is SIMULATED and every row says so.
"""
from __future__ import annotations

import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.shared import config
from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import (CameraRow, MachineStateRow, MaintenanceRow, TcIncidentRow,
                                              TcTaskRow, TicketRow, UserRow)
from sentinel.taskcentre import fleet
from sentinel.taskcentre.auth import require_role
from sentinel.taskcentre.routes_admin import _camera_payload, _users_by_id, staleness
from sentinel.taskcentre.service import gmt_iso

router = APIRouter(prefix="/tc/admin", tags=["task-centre-fleet"])

SIMULATED_NOTE = ("Machine states and the service meter come from a SIMULATED state log. The arithmetic "
                  "is the same on a real telematics feed; integrating one is future work.")


class MaintenanceIn(BaseModel):
    """A new work order. ``completed_at`` logs work already done; ``start_now`` begins it immediately."""
    kind: Literal["service", "inspection", "repair"] = "service"
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field(default="", max_length=4000)
    scheduled_for: float | None = None
    start_now: bool = False
    completed_at: float | None = None
    hour_meter_h: float | None = Field(default=None, ge=0)
    performed_by: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=4000)


class MaintenancePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    detail: str | None = Field(default=None, max_length=4000)
    scheduled_for: float | None = None
    performed_by: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)
    hour_meter_h: float | None = Field(default=None, ge=0)


class MaintenanceAction(BaseModel):
    """Body for start / complete / cancel. Only the fields that action uses are read."""
    hour_meter_h: float | None = Field(default=None, ge=0)
    performed_by: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)
    reason: str = Field(default="", max_length=2000)


# ---------------------------------------------------------------- helpers
def _window(days: int | None, cfg: fleet.FleetConfig, now: float) -> tuple[int, float]:
    days = cfg.window_days if days is None else min(days, cfg.max_window_days)
    return days, now - days * fleet.DAY


def _advance(s: Session, now: float) -> None:
    """In the demo, keep the SIMULATED state log current before reading it (a no-op on real data)."""
    if config.DEMO_MODE:
        fleet.advance_simulation(s, now=now)


def _brief(user: UserRow) -> dict[str, Any]:
    return {"user_id": user.user_id, "name": user.name, "username": user.username, "role": user.role}


def _machine_ids(s: Session, machines: dict[str, MachineRow]) -> list[str]:
    logged = s.execute(select(MachineStateRow.machine_id).distinct()).scalars()
    return sorted({*machines, *logged})


def _summary(machine_id: str, machine: MachineRow | None, rows: list[MachineStateRow],
             records: list[MaintenanceRow], *, tickets: list[TicketRow], incidents: list[TcIncidentRow],
             users: dict[str, UserRow], start: float, now: float, cfg: fleet.FleetConfig) -> dict[str, Any]:
    """One machine's row for the fleet table (and the head of its detail page)."""
    assigned = [u for u in users.values() if u.machine_id == machine_id]
    return {
        "machine_id": machine_id, "registered": machine is not None,
        "model": None if machine is None else machine.model,
        "machine_type": None if machine is None else machine.machine_type,
        "site_id": None if machine is None else machine.site_id,
        "simulated": (machine.meta or {}).get("fleet_history") == "SIMULATED" if machine else False,
        "current": fleet.current_state(rows, now),
        "stats": fleet.window_stats(rows, start=start, end=now, now=now),
        "service": fleet.service_status(machine, rows, records, now=now, cfg=cfg),
        "work_orders": {"open": sum(1 for r in records if r.status in fleet.OPEN_STATUSES),
                        "in_progress": sum(1 for r in records if r.status == "in_progress"),
                        "total": len(records)},
        "open_tickets": sum(1 for t in tickets if t.machine_id == machine_id and t.status == "open"),
        "open_incidents": sum(1 for i in incidents if i.machine_id == machine_id and i.acknowledged_at is None),
        "operators": [_brief(u) for u in assigned],
        "has_history": bool(rows),
    }


def _get_record(s: Session, maintenance_id: str) -> MaintenanceRow:
    rec = s.get(MaintenanceRow, maintenance_id)
    if rec is None:
        raise HTTPException(404, f"work order {maintenance_id!r} not found")
    return rec


def _record_out(s: Session, rec: MaintenanceRow) -> dict[str, Any]:
    now = time.time()
    return fleet.maintenance_public(rec, fleet.state_rows(s, rec.machine_id), _users_by_id(s), now=now)


# ---------------------------------------------------------------- reads
@router.get("/fleet")
def get_fleet(days: int | None = Query(default=None, ge=1, description="reporting window in days (default 7)"),
              s: Session = Depends(get_session),
              _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Every machine: current state, availability/utilisation/downtime over the window, service due."""
    now = time.time()
    _advance(s, now)
    cfg = fleet.FleetConfig.load()
    days, start = _window(days, cfg, now)
    machines = fleet.machines_by_id(s)
    ids = _machine_ids(s, machines)
    rows_by = fleet.all_state_rows(s, ids)
    records = list(s.execute(select(MaintenanceRow)).scalars())
    tickets = list(s.execute(select(TicketRow).where(TicketRow.status == "open")).scalars())
    incidents = list(s.execute(select(TcIncidentRow).where(TcIncidentRow.acknowledged_at.is_(None))).scalars())
    users = _users_by_id(s)
    out = [_summary(mid, machines.get(mid), rows_by.get(mid, []),
                    [r for r in records if r.machine_id == mid], tickets=tickets, incidents=incidents,
                    users=users, start=start, now=now, cfg=cfg) for mid in ids]

    def total(key: str) -> float:
        return round(sum(m["stats"][key] for m in out), 2)

    scheduled, uptime = total("scheduled_h"), total("uptime_h")
    operating = round(sum(m["stats"]["hours"]["operating"] for m in out), 2)
    states = [m["current"]["state"] for m in out]
    return {
        "machines": out,
        "totals": {
            "machines": len(out),
            "now": {state: states.count(state) for state in (*fleet.STATES, "available", "no_data")},
            "scheduled_h": scheduled, "uptime_h": uptime, "downtime_h": total("downtime_h"),
            "planned_downtime_h": total("planned_downtime_h"), "unplanned_downtime_h": total("unplanned_downtime_h"),
            "availability_pct": fleet._pct(uptime * fleet.HOUR, scheduled * fleet.HOUR),
            "utilisation_pct": fleet._pct(operating * fleet.HOUR, scheduled * fleet.HOUR),
            "breakdowns": int(total("breakdowns")),
            "service": {status: sum(1 for m in out if m["service"]["status"] == status)
                        for status in ("overdue", "due_soon", "ok", "unknown")},
            "open_work_orders": sum(m["work_orders"]["open"] for m in out),
        },
        "window": {"days": days, "start_ts": start, "start_ts_gmt": gmt_iso(start), "end_ts": now,
                   "end_ts_gmt": gmt_iso(now)},
        "config": {"service_interval_h": cfg.service_interval_h, "due_soon_h": cfg.due_soon_h,
                   "max_window_days": cfg.max_window_days},
        "method": fleet.METHOD,
        "disclaimer": SIMULATED_NOTE,
        "now_ts": now, "now_ts_gmt": gmt_iso(now),
    }


@router.get("/machines/{machine_id}")
def get_machine(machine_id: str,
                days: int | None = Query(default=None, ge=1, description="reporting window in days (default 7)"),
                s: Session = Depends(get_session),
                _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """One machine in full: the summary plus its state timeline, work orders and everything linked to it."""
    now = time.time()
    _advance(s, now)
    cfg = fleet.FleetConfig.load()
    days, start = _window(days, cfg, now)
    machine = s.get(MachineRow, machine_id)
    rows = fleet.state_rows(s, machine_id)
    if machine is None and not rows:
        raise HTTPException(404, f"machine {machine_id!r} not found")
    records = fleet.maintenance_rows(s, machine_id)
    tickets = list(s.execute(select(TicketRow).where(TicketRow.machine_id == machine_id)
                             .order_by(TicketRow.created_at.desc())).scalars())
    incidents = list(s.execute(select(TcIncidentRow).where(TcIncidentRow.machine_id == machine_id)
                               .order_by(TcIncidentRow.ts.desc())).scalars())
    tasks = list(s.execute(select(TcTaskRow).where(TcTaskRow.machine_id == machine_id)
                           .order_by(TcTaskRow.start_ts.desc()).limit(25)).scalars())
    cameras = list(s.execute(select(CameraRow).where(CameraRow.machine_id == machine_id)
                             .order_by(CameraRow.camera_id)).scalars())
    users = _users_by_id(s)
    summary = _summary(machine_id, machine, rows, records, tickets=tickets, incidents=incidents, users=users,
                       start=start, now=now, cfg=cfg)
    window_rows = [r for r in rows if (r.ended_at is None or r.ended_at > start)]
    limit = staleness()["camera_s"]
    summary.update({
        "lifetime": fleet.window_stats(rows, start=rows[0].started_at if rows else now, end=now, now=now),
        "timeline": [fleet.interval_public(r, start=start, now=now, users=users) for r in window_rows],
        "maintenance": [fleet.maintenance_public(r, rows, users, now=now) for r in records],
        "incidents": [{"incident_id": i.incident_id, "kind": i.kind, "severity": i.severity, "detail": i.detail,
                       "source": i.source, "dispatch_status": i.dispatch_status,
                       "acknowledged": i.acknowledged_at is not None, "ts": i.ts, "ts_gmt": gmt_iso(i.ts)}
                      for i in incidents[:25]],
        "tickets": [{"ticket_id": t.ticket_id, "kind": t.kind, "severity": t.severity, "status": t.status,
                     "title": t.title, "source": t.source, "created_at": t.created_at,
                     "created_at_gmt": gmt_iso(t.created_at)} for t in tickets[:25]],
        "tasks": [{"task_id": t.task_id, "title": t.title, "status": t.status, "priority": t.priority,
                   "operator_id": t.operator_id,
                   "operator_name": users[t.operator_id].name if t.operator_id in users else None,
                   "start_ts": t.start_ts, "start_ts_gmt": gmt_iso(t.start_ts),
                   "finished_at": t.finished_at, "finished_at_gmt": gmt_iso(t.finished_at)} for t in tasks],
        "cameras": [_camera_payload(c, now=now, stale_after_s=limit) for c in cameras],
        "window": {"days": days, "start_ts": start, "start_ts_gmt": gmt_iso(start), "end_ts": now,
                   "end_ts_gmt": gmt_iso(now)},
        "method": fleet.METHOD,
        "disclaimer": SIMULATED_NOTE,
        "now_ts": now, "now_ts_gmt": gmt_iso(now),
    })
    return summary


# ---------------------------------------------------------------- writes
@router.post("/machines/{machine_id}/maintenance", status_code=201)
def post_maintenance(machine_id: str, body: MaintenanceIn, s: Session = Depends(get_session),
                     admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Open a work order: scheduled, started now (machine leaves service), or logged as already done."""
    if s.get(MachineRow, machine_id) is None:
        raise HTTPException(404, f"machine {machine_id!r} not found")
    if body.completed_at is not None and body.start_now:
        raise HTTPException(422, "a work order is either logged as completed or started now, not both")
    try:
        rec = fleet.create_record(s, machine_id, admin, kind=body.kind, title=body.title, detail=body.detail,
                                  scheduled_for=body.scheduled_for, start_now=body.start_now,
                                  completed_at=body.completed_at, hour_meter_h=body.hour_meter_h,
                                  performed_by=body.performed_by, notes=body.notes)
    except fleet.FleetError as exc:
        raise HTTPException(409, str(exc)) from exc
    s.flush()
    return _record_out(s, rec)


@router.patch("/maintenance/{maintenance_id}")
def patch_maintenance(maintenance_id: str, body: MaintenancePatch, s: Session = Depends(get_session),
                      admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Edit a work order's descriptive fields; each change is kept in its history with the old value."""
    rec = _get_record(s, maintenance_id)
    fleet.edit_record(rec, admin, body.model_dump(exclude_unset=True))
    s.flush()
    return _record_out(s, rec)


@router.post("/maintenance/{maintenance_id}/{action}")
def post_maintenance_action(maintenance_id: str, action: Literal["start", "complete", "cancel"],
                            body: MaintenanceAction | None = None, s: Session = Depends(get_session),
                            admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Start, complete or cancel a work order. 409 when the record's status does not allow it."""
    rec = _get_record(s, maintenance_id)
    body = body or MaintenanceAction()
    try:
        if action == "start":
            fleet.start_record(s, rec, admin)
        elif action == "complete":
            fleet.complete_record(s, rec, admin, hour_meter_h=body.hour_meter_h, performed_by=body.performed_by,
                                  notes=body.notes)
        else:
            fleet.cancel_record(s, rec, admin, reason=body.reason)
    except fleet.FleetError as exc:
        raise HTTPException(409, str(exc)) from exc
    s.flush()
    return _record_out(s, rec)
