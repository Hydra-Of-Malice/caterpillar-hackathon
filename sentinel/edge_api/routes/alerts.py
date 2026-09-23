"""Alerts: list / active, acknowledge (or snooze a break reminder), relevance feedback (423 while moving)."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime
from sentinel.shared.schemas import Alert, Event, Provenance, RiskCategory, Tier
from sentinel.store.models import AlertRow, FeedbackLabelRow

router = APIRouter(tags=["alerts"])


class AckBody(BaseModel):
    action: Literal["ack", "snooze"] = "ack"


class Feedback(BaseModel):
    useful: bool
    reason: str | None = None
    reviewer_role: str = "operator"


@router.get("/alerts")
def list_alerts(active: int = 0, operator_id: str | None = None, state: str | None = None, limit: int = 200,
                rt: EdgeRuntime = Depends(get_rt)) -> list[dict[str, Any]]:
    """``active=1``: what the cab shows now (priority order). Otherwise the stored alert log, newest first."""
    if active:
        return [a.model_dump(mode="json") for a in rt.alerts.active()]
    with rt.db.session() as s:
        q = select(AlertRow).order_by(AlertRow.ts.desc()).limit(limit)
        if operator_id:
            q = q.where(AlertRow.operator_id == operator_id)
        if state:
            q = q.where(AlertRow.state == state)
        return [r.data for r in s.scalars(q)]


@router.post("/alerts/{alert_id}/ack")
def ack_alert(alert_id: str, body: AckBody | None = Body(default=None),
              rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """ACKNOWLEDGE, or ``{"action": "snooze"}`` = "Remind me in 10 min" on a break recommendation (once)."""
    try:
        if body is not None and body.action == "snooze":
            return rt.alerts.snooze(alert_id, rt.now_ts()).model_dump(mode="json")
        return rt.alerts.ack(alert_id, rt.now_ts()).model_dump(mode="json")
    except KeyError:
        raise HTTPException(404, f"alert {alert_id} not found") from None
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None


@router.post("/alerts/{alert_id}/feedback")
def alert_feedback(alert_id: str, body: Feedback, rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """"This alert was wrong" — only while stopped (no interaction while moving, 07 §5.1)."""
    if rt.moving():
        raise HTTPException(423, "Feedback is available when the machine is stopped")
    with rt.db.session() as s:
        row = s.get(AlertRow, alert_id)
        if row is None:
            raise HTTPException(404, f"alert {alert_id} not found")
        alert = Alert.model_validate(row.data)
        s.add(FeedbackLabelRow(alert_id=alert_id, useful=body.useful, reason=body.reason,
                               reviewer_role=body.reviewer_role, ts=rt.now_ts()))
    work_order = alert.tier == Tier.T_CRIT and not body.useful      # never mutes the rule: sensor check instead
    rt.alerts.record_event(Event(
        ts=rt.now_ts(), site_id=rt.site_id, machine_id=alert.machine_id, operator_id=alert.operator_id,
        shift_id=rt.context.get("shift_id"), type="alert_feedback", category=RiskCategory.normal,
        provenance=[Provenance.MANUAL], context={"alert_id": alert_id, "alert_tier": alert.tier.value,
                                                 "alert_what": alert.what, "useful": body.useful, "reason": body.reason,
                                                 "reviewer_role": body.reviewer_role,
                                                 "sensor_check_work_order": work_order}))
    return {"ok": True, "alert_id": alert_id, "useful": body.useful, "sensor_check_work_order": work_order}
