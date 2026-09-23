"""Breaks: start / end (optional KSS, consented research only). A >= 10 min break resets the clock."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime
from sentinel.store.models import BreakLogRow
from sentinel.sync import outbox


def _enqueue(s: Any, row: BreakLogRow) -> None:
    outbox.enqueue(s, "break", {"shift_id": row.shift_id, "operator_id": row.operator_id,
                                "started_at": row.started_at, "ended_at": row.ended_at, "kss": row.kss}, outbox.P_SHIFT)


router = APIRouter(tags=["breaks"])


class BreakEnd(BaseModel):
    kss: int | None = Field(default=None, ge=1, le=9)


def _open_break(s: Any, shift_id: str | None) -> BreakLogRow | None:
    return s.scalars(select(BreakLogRow).where(BreakLogRow.shift_id == (shift_id or ""),
                                               BreakLogRow.ended_at.is_(None))
                     .order_by(BreakLogRow.started_at.desc())).first()


@router.post("/breaks/start")
def start_break(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    shift_id = rt.context.get("shift_id")
    if shift_id is None:
        raise HTTPException(409, "no current shift")
    now = rt.now_ts()
    with rt.db.session() as s:
        row = _open_break(s, shift_id)
        if row is None:
            row = BreakLogRow(shift_id=shift_id, operator_id=rt.context.get("operator_id") or "unknown", started_at=now)
            s.add(row)
            s.flush()
            _enqueue(s, row)
        break_id, started = row.id, row.started_at
    rt.tracker.start_break(started)
    rt.alerts.on_break_start(now)
    return {"ok": True, "break_id": break_id, "started_at": started}


@router.post("/breaks/end")
def end_break(body: BreakEnd | None = Body(default=None), rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    now = rt.now_ts()
    with rt.db.session() as s:
        row = _open_break(s, rt.context.get("shift_id"))
        if row is None:
            raise HTTPException(409, "no break in progress")
        row.ended_at, row.kss = now, body.kss if body else None
        started, break_id = row.started_at, row.id
        _enqueue(s, row)
    rt.tracker.break_started_ts = started
    reset = rt.tracker.end_break(now)
    rt.save_state()
    return {"ok": True, "break_id": break_id, "duration_min": round((now - started) / 60, 1),
            "continuous_operation_reset": reset,
            "continuous_operation_min": round(rt.tracker.continuous_operation_min(now), 1)}
