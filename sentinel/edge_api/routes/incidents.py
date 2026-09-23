"""Incident log: auto (T-CRIT, T2, checklist) and manual entries; operator notes and disputes."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime
from sentinel.shared.schemas import Incident
from sentinel.store.models import IncidentRow

router = APIRouter(tags=["incidents"])

SEVERITY_SIGNAL_WORD = {"high": "WARNING", "medium": "CAUTION", "low": "NOTICE"}


class ManualIncident(BaseModel):
    type: str
    severity: Literal["low", "medium", "high"] = "medium"
    note: str | None = None
    operator_note: str | None = None
    signal_word: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class IncidentPatch(BaseModel):
    status: Literal["open", "reviewed", "closed"] | None = None
    operator_note: str | None = None
    dispute_status: Literal["none", "disputed", "resolved"] | None = None


@router.get("/incidents")
def list_incidents(signal_word: str | None = None, type: str | None = None, source: str | None = None,
                   status: str | None = None, operator_id: str | None = None, shift_id: str | None = None,
                   limit: int = 200, rt: EdgeRuntime = Depends(get_rt)) -> list[dict[str, Any]]:
    with rt.db.session() as s:
        rows = [r.data for r in s.scalars(select(IncidentRow).order_by(IncidentRow.ts.desc()))]
    filters = {"signal_word": signal_word, "type": type, "source": source, "status": status,
               "operator_id": operator_id, "shift_id": shift_id}
    out = [d for d in rows if all(v is None or d.get(k) == v for k, v in filters.items())]
    return out[:limit]


@router.get("/incidents/{incident_id}")
def get_incident(incident_id: str, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    with rt.db.session() as s:
        row = s.get(IncidentRow, incident_id)
        if row is None:
            raise HTTPException(404, f"incident {incident_id} not found")
        return row.data


@router.post("/incidents")
def create_incident(body: ManualIncident, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Manual entry; context and the last 20 s of machine signals are attached automatically."""
    s = rt.latest
    ctx = rt.context
    task = ctx.get("task") or {}
    auto = {"task_id": task.get("task_id"), "task_name": task.get("name"), "zone": s.zone if s else None,
            "machine_state": {"moving": rt.moving(), "travel_kmh": s.travel_kmh if s else None,
                              "swing_dps": s.swing_dps if s else None},
            "attachments": body.attachments, "signals_saved_s": rt.alerts.ring.seconds}
    incident = Incident(ts=rt.now_ts(), site_id=rt.site_id, machine_id=rt.machine_id,
                        operator_id=ctx.get("operator_id") or "unknown", shift_id=ctx.get("shift_id"),
                        source="manual", type=body.type, severity=body.severity,
                        signal_word=body.signal_word or SEVERITY_SIGNAL_WORD[body.severity],
                        context={**auto, **body.context}, snapshot=rt.alerts.ring.all(), note=body.note,
                        operator_note=body.operator_note, simulated=True)
    return rt.alerts.log_incident(incident).model_dump(mode="json")


@router.patch("/incidents/{incident_id}")
def patch_incident(incident_id: str, body: IncidentPatch, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    with rt.db.session() as s:
        row = s.get(IncidentRow, incident_id)
        if row is None:
            raise HTTPException(404, f"incident {incident_id} not found")
        incident = Incident.model_validate(row.data)
    changes = body.model_dump(exclude_none=True)
    if changes.get("operator_note") and "dispute_status" not in changes and incident.dispute_status == "none":
        changes["dispute_status"] = "disputed"                 # a note from the operator is a dispute annotation
    updated = incident.model_copy(update=changes)
    return rt.alerts.log_incident(updated).model_dump(mode="json")
