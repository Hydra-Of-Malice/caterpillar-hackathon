"""Supervisor, idle/behaviour analysis, instructor workspace, monitoring and DEMO fixture routes."""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import forbid_roles, get_actor, get_session, require_roles
from sentinel.cloud.competency.demo_fixture import DEMO_OPERATOR, FIXTURE_SHIFTS, load_shift
from sentinel.cloud.competency.service import UnknownShift, evaluate_shift
from sentinel.cloud.monitoring.alert_rates import alert_rates
from sentinel.cloud.monitoring.drift import drift_report
from sentinel.cloud.monitoring.registry import list_models
from sentinel.cloud.rag.retriever import default_retriever
from sentinel.cloud.roles import Role
from sentinel.cloud.supervisor import instructor
from sentinel.cloud.supervisor.crew import crew_summary
from sentinel.cloud.supervisor.idle import idle_summary
from sentinel.cloud.supervisor.issues import behaviour_events, escalations, machine_issues, resolve_escalation
from sentinel.cloud.training.modules import module_store
from sentinel.shared import config

router = APIRouter(tags=["supervisor, instructor & monitoring"])


class ResolveBody(BaseModel):
    note: str | None = None


class FixtureBody(BaseModel):
    shifts: list[str] = Field(default_factory=lambda: ["shift0", "shift1"])
    evaluate_shift_id: str | None = None


@router.get("/supervisor/crew-summary")
def get_crew_summary(s: Session = Depends(get_session)) -> dict[str, Any]:
    """Per machine/operator rows (no ranking) + raw value-model inputs (SIMULATED)."""
    return crew_summary(s)


@router.get("/supervisor/escalations")
def get_escalations(include_resolved: bool = False, s: Session = Depends(get_session)) -> dict[str, Any]:
    return escalations(s, include_resolved)


@router.post("/supervisor/escalations/{escalation_id}/resolve")
def post_resolve(escalation_id: str, body: ResolveBody, s: Session = Depends(get_session),
                 role: Role = Depends(require_roles(Role.supervisor, Role.instructor)),
                 actor: str = Depends(get_actor)) -> dict[str, Any]:
    out = resolve_escalation(s, escalation_id, actor, role.value, body.note)
    if out is None:
        raise HTTPException(404, f"escalation {escalation_id!r} not found")
    return out


@router.get("/supervisor/machine-issues")
def get_machine_issues(s: Session = Depends(get_session)) -> dict[str, Any]:
    return machine_issues(s)


@router.get("/idle/summary")
def get_idle_summary(date_: date | None = Query(default=None, alias="date"),
                     s: Session = Depends(get_session)) -> dict[str, Any]:
    """Idle minutes by reason per machine with estimated fuel (default: latest day with idle data)."""
    return idle_summary(s, date_)


@router.get("/behaviour/events")
def get_behaviour_events(operator_id: str | None = None, machine_id: str | None = None,
                         category: str | None = None, attribution: str | None = None,
                         type: str | None = None, since: float | None = None, until: float | None = None,
                         limit: int = Query(default=200, ge=1, le=1000),
                         s: Session = Depends(get_session)) -> dict[str, Any]:
    return behaviour_events(s, operator_id, machine_id, category, attribution, type, since, until, limit)


@router.get("/instructor/operators")
def get_heatmap(s: Session = Depends(get_session),
                _: Role = Depends(forbid_roles(Role.supervisor))) -> dict[str, Any]:
    """Competency heatmap: states only, never scores."""
    return instructor.heatmap(s)


@router.get("/instructor/content-review")
def get_content_review(s: Session = Depends(get_session)) -> dict[str, Any]:
    return instructor.content_review(s, module_store(s), default_retriever())


@router.post("/instructor/content-review/{review_id}/approve")
def post_approve(review_id: str, s: Session = Depends(get_session),
                 _: Role = Depends(require_roles(Role.instructor)), actor: str = Depends(get_actor)) -> dict[str, Any]:
    """Approve a module version (id `MODULE@VERSION`); instructor only; citation check must PASS."""
    try:
        return instructor.approve(s, module_store(s), default_retriever(), review_id, actor)
    except instructor.ReviewError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc


@router.get("/monitoring/alert-rates")
def get_alert_rates(s: Session = Depends(get_session)) -> dict[str, Any]:
    return alert_rates(s)


@router.get("/monitoring/drift")
def get_drift(context_key: str | None = None, s: Session = Depends(get_session)) -> dict[str, Any]:
    return drift_report(s, context_key)


@router.get("/models")
def get_models(s: Session = Depends(get_session)) -> dict[str, Any]:
    return list_models(s)


@router.post("/demo/fixture")
def post_fixture(body: FixtureBody, s: Session = Depends(get_session)) -> dict[str, Any]:
    """DEMO_MODE only: load SIMULATED fixture shifts (shift0|shift1|shift2), optionally evaluate one."""
    if not config.DEMO_MODE:
        raise HTTPException(404, "demo endpoints are disabled (DEMO_MODE=0)")
    unknown = [k for k in body.shifts if k not in FIXTURE_SHIFTS]
    if unknown:
        raise HTTPException(422, f"unknown fixture shifts {unknown}; use {sorted(FIXTURE_SHIFTS)}")
    loaded = [load_shift(s, key) for key in body.shifts]
    evaluation = None
    if body.evaluate_shift_id:
        try:
            evaluation = evaluate_shift(s, DEMO_OPERATOR, body.evaluate_shift_id, requested_by=Role.system)
        except UnknownShift as exc:
            raise HTTPException(404, str(exc)) from exc
    return {"loaded": loaded, "evaluation": evaluation, "label": "SIMULATED"}
