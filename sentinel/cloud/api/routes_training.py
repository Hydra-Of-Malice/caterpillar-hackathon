"""Training hub, MOCK bookings, RAG copilot and re-assessment."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_actor, get_role, get_session
from sentinel.cloud.audit import write_audit
from sentinel.cloud.competency.catalog import get_catalog
from sentinel.cloud.competency.demo_fixture import DEMO_OPERATOR, ensure_post_training_shift
from sentinel.cloud.competency.service import on_module_completed
from sentinel.cloud.demo import seed_demo
from sentinel.cloud.rag.answer import Copilot, default_copilot
from sentinel.cloud.rag.retriever import default_retriever
from sentinel.cloud.reassess.service import NoGapEvidence, reassess
from sentinel.cloud.roles import Role
from sentinel.cloud.training import bookings
from sentinel.cloud.training.modules import module_detail, module_store, module_summary
from sentinel.cloud.training.quiz import public_quiz, score_attempt
from sentinel.cloud.training.recommend import recommendations
from sentinel.shared import config
from sentinel.shared.schemas import new_id
from sentinel.store.models import TrainingRecordRow

router = APIRouter(tags=["training, copilot & re-assessment"])


class CompleteBody(BaseModel):
    operator_id: str
    dwell_s: float | None = None


class AnswerItem(BaseModel):
    question_id: str
    choice: int


class AttemptBody(BaseModel):
    operator_id: str
    answers: dict[str, int] | list[AnswerItem]


class BookingBody(BaseModel):
    operator_id: str
    instructor_id: str
    slot_start: float | None = None
    slot_id: str | None = None
    format: str = "simulator"
    competency_id: str | None = None


class AskBody(BaseModel):
    question: str
    operator_id: str | None = None


def _approved(s: Session, module_id: str):
    mv = module_store(s).latest_approved(module_id)
    if mv is None:
        raise HTTPException(404, f"no approved module {module_id!r}")
    return mv


@router.get("/training/recommendations")
def get_recommendations(operator_id: str = Query(...), s: Session = Depends(get_session)) -> dict[str, Any]:
    """Modules for open gaps and today's tasks, each with a `why` (evidence first)."""
    return recommendations(s, operator_id, module_store(s), get_catalog())


@router.get("/training/modules")
def list_modules(s: Session = Depends(get_session)) -> dict[str, Any]:
    store = module_store(s)
    return {"modules": [module_summary(mv, store) for mv in store.approved_modules()], "label": "SAMPLE content"}


@router.get("/training/modules/{module_id}")
def get_module(module_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Latest approved version, with key points and citations (doc_id, section, version)."""
    store = module_store(s)
    return module_detail(_approved(s, module_id), store, default_retriever())


@router.post("/training/modules/{module_id}/complete")
def complete_module(module_id: str, body: CompleteBody, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Record completion; observed_gap → in_training for the module's competencies."""
    mv = _approved(s, module_id)
    record = TrainingRecordRow(operator_id=body.operator_id, module_id=module_id, kind="module_completed",
                               data={"module_version": mv.version, "dwell_s": body.dwell_s,
                                     "competency_ids": mv.data.get("competency_ids", [])})
    s.add(record)
    s.flush()
    changes = on_module_completed(s, body.operator_id, mv.data.get("competency_ids", []))
    return {"ok": True, "record_id": record.id, "module_id": module_id, "module_version": mv.version,
            "transitions": changes}


@router.get("/training/quiz/{module_id}")
def get_quiz(module_id: str, s: Session = Depends(get_session)) -> dict[str, Any]:
    return public_quiz(_approved(s, module_id))


@router.post("/training/quiz/{module_id}/attempts")
def quiz_attempt(module_id: str, body: AttemptBody, s: Session = Depends(get_session)) -> dict[str, Any]:
    """Score and store an attempt. A pass returns an assessment_id (usable for knowledge-type competencies)."""
    mv = _approved(s, module_id)
    answers = body.answers if isinstance(body.answers, dict) else {a.question_id: a.choice for a in body.answers}
    result = score_attempt(mv, answers)
    attempt_id = new_id("qa")
    s.add(TrainingRecordRow(operator_id=body.operator_id, module_id=module_id, kind="quiz_attempt",
                            score=result["score"], passed=result["passed"],
                            data={"assessment_id": attempt_id, "module_version": mv.version, "answers": answers,
                                  "competency_ids": mv.data.get("competency_ids", [])}))
    catalog = get_catalog()
    can_demo = [c for c in mv.data.get("competency_ids", [])
                if c in catalog.competencies and catalog.competencies[c].assessment_can_demonstrate]
    return {**result, "attempt_id": attempt_id, "assessment_id": attempt_id if result["passed"] else None,
            "can_set_demonstrated_for": can_demo if result["passed"] else [],
            "next": "Your behaviour on the targeted skill is checked automatically over the next shifts."}


@router.get("/instructors")
def list_instructors() -> dict[str, Any]:
    return {"instructors": bookings.instructors(), "label": "MOCK"}


@router.get("/instructors/slots")
def list_slots(instructor_id: str | None = None, from_date: date | None = None,
               s: Session = Depends(get_session)) -> dict[str, Any]:
    start = from_date or datetime.now(timezone.utc).date()
    return {"slots": bookings.slots(s, start, instructor_id), "label": "MOCK"}


@router.post("/bookings")
def create_booking(body: BookingBody, s: Session = Depends(get_session)) -> dict[str, Any]:
    """MOCK booking with the competency evidence attached. 409 if the slot is taken or does not exist."""
    slot_start = body.slot_start
    if slot_start is None and body.slot_id:
        stamp = body.slot_id.rsplit("-", 1)[-1]
        try:
            slot_start = datetime.strptime(stamp, "%Y%m%d%H").replace(tzinfo=timezone.utc).timestamp()
        except ValueError as exc:
            raise HTTPException(422, f"bad slot_id {body.slot_id!r}") from exc
    if slot_start is None:
        raise HTTPException(422, "slot_start or slot_id is required")
    try:
        return bookings.create_booking(s, body.operator_id, body.instructor_id, slot_start, body.format,
                                       body.competency_id)
    except bookings.SlotUnavailable as exc:
        raise HTTPException(409, str(exc)) from exc


def _copilot(request: Request) -> Copilot:
    return request.app.state.copilot or default_copilot()


@router.post("/copilot/ask")
def ask(body: AskBody, request: Request, s: Session = Depends(get_session), role: Role = Depends(get_role),
        actor: str = Depends(get_actor)) -> dict[str, Any]:
    """Answer from approved documents only, with [chunk_id] citations; refusals go to the content-gap queue."""
    out = _copilot(request).ask(body.question)
    if out["mode"] == "refused":
        write_audit(s, actor=body.operator_id or actor, role=role.value, action="copilot_refused", target="corpus",
                    data={"question": body.question})
    return {**out, "label": "SAMPLE corpus — not official Caterpillar content"}


@router.get("/reassessment")
def get_reassessment(operator_id: str = Query(...), competency_id: str = Query(...),
                     s: Session = Depends(get_session)) -> dict[str, Any]:
    """Pre/post rates over exposure-matched opportunities, RR with 95 % CI, verdict, label SIMULATED.

    In DEMO_MODE the demo operator falls back to the SIMULATED Shift 0–2 fixtures when nothing has synced.
    """
    fixture: list[str] = []
    demo = config.DEMO_MODE and operator_id == DEMO_OPERATOR
    try:
        if demo:
            seeded = seed_demo(s)
            fixture += seeded.get("fixture_loaded", [])
        result = reassess(s, operator_id, competency_id)
        if demo and result["post"] is None:
            fixture += ensure_post_training_shift(s, operator_id)
            result = reassess(s, operator_id, competency_id)
    except KeyError as exc:
        raise HTTPException(404, f"unknown competency {competency_id!r}") from exc
    except NoGapEvidence as exc:
        raise HTTPException(404, str(exc)) from exc
    return {**result, "fixture_loaded": fixture}
