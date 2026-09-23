"""Ingest, operator profile, competency evaluation and guarded state changes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_actor, get_role, get_session
from sentinel.cloud.audit import write_audit
from sentinel.cloud.competency.demo_fixture import ensure_demo_history
from sentinel.cloud.competency.profile import build_profile
from sentinel.cloud.competency.service import UnknownShift, evaluate_shift, set_state
from sentinel.cloud.competency.state import TransitionError
from sentinel.cloud.ingest import ingest_batch
from sentinel.cloud.roles import VERIFIER_ROLES, Role, parse_role
from sentinel.shared.schemas import CompetencyState

router = APIRouter(tags=["ingest & competency"])


class IngestItem(BaseModel):
    uuid: str | None = None
    kind: str | None = None
    payload: dict[str, Any] | None = None


class IngestBatch(BaseModel):
    items: list[IngestItem] = Field(default_factory=list)


class EvaluateBody(BaseModel):
    operator_id: str
    shift_id: str


class StateBody(BaseModel):
    state: CompetencyState
    actor_role: str | None = None
    assessment_id: str | None = None
    actor_id: str | None = None
    note: str | None = None


@router.post("/ingest/batch")
def ingest(body: IngestBatch, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Idempotent upsert of edge outbox items (event, alert, incident, exposure, shift, feature_window, ...)."""
    return ingest_batch(s, [i.model_dump() for i in body.items])


@router.get("/operators/{operator_id}/profile")
def profile(operator_id: str, s: Session = Depends(get_session),
            role: Role = Depends(get_role), actor: str = Depends(get_actor)) -> dict[str, Any]:
    """Operator Profile. Verifier views (supervisor/instructor) are audit-logged."""
    out = build_profile(s, operator_id)
    if out is None:
        raise HTTPException(404, f"operator {operator_id!r} not found")
    if role in VERIFIER_ROLES:
        write_audit(s, actor=actor, role=role.value, action="profile_view", target=operator_id)
    return out


@router.post("/competency/evaluate")
def evaluate(body: EvaluateBody, s: Session = Depends(get_session),
             role: Role = Depends(get_role)) -> dict[str, Any]:
    """Event→competency mapping + gap rule for a shift (Gamma–Poisson P ≥ 0.8 and recurrence floor)."""
    loaded = ensure_demo_history(s, body.operator_id, body.shift_id)
    try:
        result = evaluate_shift(s, body.operator_id, body.shift_id, requested_by=role)
    except UnknownShift as exc:
        raise HTTPException(404, str(exc)) from exc
    return {**result, "fixture_loaded": loaded}


def _resolve_role(header: str | None, body_role: str | None) -> Role:
    if header is not None and body_role is not None and header.strip().lower() != body_role.strip().lower():
        raise HTTPException(403, "X-Role header and actor_role disagree")
    role = parse_role(header if header is not None else body_role)
    if role is None:
        raise HTTPException(403, f"unknown role {header or body_role!r}")
    return role


@router.patch("/competency/{operator_id}/{competency_id}")
@router.patch("/competency/{operator_id}/{competency_id}/state", include_in_schema=False)
def patch_state(operator_id: str, competency_id: str, body: StateBody, s: Session = Depends(get_session),
                x_role: str | None = Header(default=None, alias="X-Role"),
                x_actor: str | None = Header(default=None, alias="X-Actor")) -> dict[str, Any]:
    """Guarded state change. `demonstrated` → 403 unless instructor or a passing assessment; ml_service always 403."""
    role = _resolve_role(x_role, body.actor_role)
    actor = body.actor_id or x_actor or role.value
    try:
        return set_state(s, operator_id, competency_id, body.state, role=role, actor=actor,
                         assessment_id=body.assessment_id, note=body.note)
    except KeyError as exc:
        raise HTTPException(404, f"unknown competency {competency_id!r}") from exc
    except TransitionError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

