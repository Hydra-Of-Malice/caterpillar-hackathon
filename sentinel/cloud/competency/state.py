"""Competency state machine with role enforcement and audit (05 §5.3, §5.5).

unassessed -> observed_gap -> in_training -> improving -> demonstrated.
`demonstrated` is set only by an instructor, or with a passing assessment (knowledge-type
competencies only for quiz passes). The ML service account can never set it.
"""
from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.audit import write_audit
from sentinel.cloud.competency.catalog import Competency
from sentinel.cloud.roles import LEARNER_ROLES, Role
from sentinel.shared.schemas import CompetencyState as CS
from sentinel.store.models import OperatorCompetencyRow, TrainingRecordRow

ALLOWED: dict[CS, frozenset[CS]] = {
    CS.unassessed: frozenset({CS.observed_gap, CS.demonstrated}),
    CS.observed_gap: frozenset({CS.in_training}),
    CS.in_training: frozenset({CS.improving, CS.demonstrated}),
    CS.improving: frozenset({CS.demonstrated, CS.in_training, CS.observed_gap}),
    CS.demonstrated: frozenset({CS.observed_gap}),
}
SYSTEM_TARGETS = frozenset({CS.observed_gap, CS.in_training, CS.improving})
ASSESSMENT_KINDS = frozenset({"assessment", "quiz_attempt"})


class TransitionError(Exception):
    """Base error; `status_code` is the HTTP status the API returns."""
    status_code = 400


class PermissionDenied(TransitionError):
    status_code = 403


class InvalidTransition(TransitionError):
    status_code = 409


def get_row(s: Session, operator_id: str, competency_id: str, create: bool = True) -> OperatorCompetencyRow | None:
    """The operator × competency row (created as `unassessed` when missing and create=True)."""
    row = s.scalars(select(OperatorCompetencyRow).where(
        OperatorCompetencyRow.operator_id == operator_id,
        OperatorCompetencyRow.competency_id == competency_id)).first()
    if row is None and create:
        row = OperatorCompetencyRow(operator_id=operator_id, competency_id=competency_id,
                                    state=CS.unassessed.value, evidence={}, updated_at=time.time())
        s.add(row)
        s.flush()
    return row


def find_passing_assessment(s: Session, operator_id: str, comp: Competency, assessment_id: str) -> str | None:
    """None if `assessment_id` is a passing assessment for this operator and competency, else the reason."""
    rows = s.scalars(select(TrainingRecordRow).where(TrainingRecordRow.operator_id == operator_id))
    record = next((r for r in rows if (r.data or {}).get("assessment_id") == assessment_id), None)
    if record is None or record.kind not in ASSESSMENT_KINDS:
        return "assessment not found for this operator"
    if not record.passed:
        return "assessment was not passed"
    if comp.id not in ((record.data or {}).get("competency_ids") or []):
        return f"assessment does not cover {comp.id}"
    if record.kind == "quiz_attempt" and not comp.assessment_can_demonstrate:
        return f"{comp.id} is a skill competency: a quiz pass cannot set demonstrated; instructor sign-off required"
    return None


def check_permission(s: Session, role: Role, operator_id: str, comp: Competency, to_state: CS,
                     assessment_id: str | None) -> None:
    """Raise PermissionDenied unless `role` may move this competency to `to_state`."""
    if role is Role.supervisor:
        raise PermissionDenied("supervisors see crew aggregates only and cannot change competency states")
    if to_state is CS.demonstrated:
        if role is Role.instructor:
            return
        if role in (Role.ml_service, Role.system):
            raise PermissionDenied("the ML/system account has no write permission on 'demonstrated'")
        if assessment_id is None:
            raise PermissionDenied("'demonstrated' requires the instructor role or a passing assessment_id")
        reason = find_passing_assessment(s, operator_id, comp, assessment_id)
        if reason:
            raise PermissionDenied(reason)
        return
    if role is Role.instructor:
        return
    if role in (Role.ml_service, Role.system) and to_state in SYSTEM_TARGETS:
        return
    if role in LEARNER_ROLES and to_state is CS.in_training:
        return
    raise PermissionDenied(f"role {role.value!r} may not set {to_state.value!r}")


def transition(s: Session, row: OperatorCompetencyRow, comp: Competency, to_state: CS, *, role: Role,
               actor: str, reason: str, assessment_id: str | None = None,
               evidence_update: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Apply a guarded state change and write an audit row. Returns the change, or None if unchanged.

    Raises PermissionDenied (403) or InvalidTransition (409).
    """
    current = CS(row.state)
    check_permission(s, role, row.operator_id, comp, to_state, assessment_id)
    if to_state == current:
        return None
    if to_state not in ALLOWED[current]:
        raise InvalidTransition(f"{current.value} -> {to_state.value} is not an allowed transition")
    evidence = dict(row.evidence or {})
    evidence.update(evidence_update or {})
    row.state = to_state.value
    row.evidence = evidence
    row.updated_at = time.time()
    if to_state is CS.demonstrated:
        row.verified_by = actor if role is Role.instructor else f"assessment:{assessment_id}"
    change = {"operator_id": row.operator_id, "competency_id": comp.id, "from": current.value,
              "to": to_state.value, "actor": actor, "role": role.value, "reason": reason,
              "assessment_id": assessment_id}
    write_audit(s, actor=actor, role=role.value, action="competency_state_change",
                target=f"{row.operator_id}/{comp.id}", data=change)
    return change
