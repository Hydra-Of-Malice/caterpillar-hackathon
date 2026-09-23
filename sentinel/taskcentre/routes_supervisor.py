"""Task Centre supervisor API: own team, task assignment, dashboard, flag review and cameras.

Every read and write is scoped server-side to the caller's own operators (admins see the site).
Scope failures are 403; a resource that exists but belongs to somebody else is 404 where the
contract asks for it. Times are UTC seconds and echoed with a ``*_gmt`` ISO string; "today" means
the current UTC day. Review decisions are appended, never overwritten: a dismissed flag stays in
the history, clearly marked dismissed, and confirming an idle or performance flag records the
decision only — it never applies a penalty.
"""
from __future__ import annotations

import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import (
    CameraRow,
    ChatMessageRow,
    CheckpointRow,
    LocationReportRow,
    PunchRow,
    ReviewDecisionRow,
    TaskProgressRow,
    TcTaskRow,
    TicketRow,
    UserRow,
)
from sentinel.taskcentre import efficiency, fatigue, training
from sentinel.taskcentre.auth import assert_can_view_operator, current_user, require_roles
from sentinel.taskcentre.service import gmt_iso, latest_location, location_public, notify, user_public
from sentinel.taskcentre.routes_chat import post_message, thread_key

router = APIRouter(prefix="/tc/sup", tags=["task-centre-supervisor"],
                   dependencies=[Depends(require_roles("admin", "supervisor"))])

DAY_S = 86_400.0
STALE_LOCATION_S = 600.0
PROGRESS_LIMIT = 30
PUNCH_LIMIT = 10
OPEN_STATUSES = ("pending", "ongoing")
REVIEW_KINDS = ("ai_idle", "geofence_punch", "task_overrun", "fatigue", "checklist_fail")
SIMULATED_FEED_NOTE = "SIMULATED feed - placeholder frames, not live video"


# ---------------------------------------------------------------- request bodies
class CheckpointIn(BaseModel):
    """A checkbox (target 1) or a counted target such as 0/3."""
    label: str = Field(min_length=1, max_length=200)
    kind: Literal["checkbox", "counted"] = "checkbox"
    target: int = 1
    required: bool = True


class TaskCreate(BaseModel):
    operator_id: str
    title: str = Field(min_length=1, max_length=200)
    instructions: str = ""
    location: str = ""
    machine_id: str | None = None
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    start_ts: float
    expected_finish_ts: float
    checkpoints: list[CheckpointIn] = Field(default_factory=list)


class TaskPatch(BaseModel):
    """Every field optional; only the ones sent are changed. ``status`` cancels or re-opens."""
    title: str | None = None
    instructions: str | None = None
    location: str | None = None
    machine_id: str | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    start_ts: float | None = None
    expected_finish_ts: float | None = None
    status: Literal["pending", "cancelled"] | None = None


class ReviewIn(BaseModel):
    decision: Literal["confirmed", "dismissed", "more_info"]
    comment: str = ""
    message_to_operator: str | None = None


class ExceptionIn(BaseModel):
    comment: str = ""


class TrainingAssignIn(BaseModel):
    """Why this item is being put on the operator's list; it travels with the notification."""
    note: str | None = Field(default=None, max_length=500)


# ---------------------------------------------------------------- helpers
def _day_start(now: float) -> float:
    """Start of the current UTC day."""
    return (now // DAY_S) * DAY_S


def _team(s: Session, user: UserRow) -> list[UserRow]:
    """The caller's operators: their own for a supervisor, every operator for an admin."""
    q = select(UserRow).where(UserRow.role == "operator")
    if user.role != "admin":
        q = q.where(UserRow.supervisor_id == user.user_id)
    return list(s.scalars(q.order_by(UserRow.name)))


def _team_operator(s: Session, user: UserRow, operator_id: str) -> UserRow:
    """The operator row, after the shared scope guard (404 unknown, 403 outside the caller's team)."""
    operator = assert_can_view_operator(user, operator_id, s)
    if operator.role != "operator":
        raise HTTPException(404, f"operator {operator_id!r} not found")
    return operator


def _owned_task(s: Session, user: UserRow, task_id: str) -> TcTaskRow:
    """A task this caller may change; 404 when it does not exist or belongs to another supervisor."""
    task = s.get(TcTaskRow, task_id)
    if task is None or (user.role != "admin" and task.supervisor_id != user.user_id):
        raise HTTPException(404, f"task {task_id!r} not found")
    return task


def _checkpoints(s: Session, task_ids: list[str]) -> dict[str, list[CheckpointRow]]:
    """Checkpoints per task id, in display order."""
    out: dict[str, list[CheckpointRow]] = {tid: [] for tid in task_ids}
    if not task_ids:
        return out
    rows = s.scalars(select(CheckpointRow).where(CheckpointRow.task_id.in_(task_ids))
                     .order_by(CheckpointRow.order_index, CheckpointRow.checkpoint_id))
    for row in rows:
        out.setdefault(row.task_id, []).append(row)
    return out


def _exception_resolved_ids(s: Session, task_ids: list[str]) -> set[str]:
    """Task ids a supervisor has authorised to finish despite unmet required checkpoints."""
    if not task_ids:
        return set()
    return set(s.scalars(select(TaskProgressRow.task_id).where(
        TaskProgressRow.task_id.in_(task_ids), TaskProgressRow.kind == "exception_resolved")))


def _checkpoint_dict(row: CheckpointRow) -> dict[str, Any]:
    return {"checkpoint_id": row.checkpoint_id, "task_id": row.task_id, "order_index": row.order_index,
            "label": row.label, "kind": row.kind, "target": row.target, "done": row.done,
            "required": bool(row.required), "complete": row.done >= row.target,
            "updated_at": row.updated_at, "updated_at_gmt": gmt_iso(row.updated_at)}


def _is_overdue(task: TcTaskRow, now: float) -> bool:
    """Not completed (nor cancelled) and past its expected finish."""
    return task.status not in ("completed", "cancelled") and now > task.expected_finish_ts


def _task_dict(task: TcTaskRow, checkpoints: list[CheckpointRow], now: float,
               *, exception_resolved: bool = False) -> dict[str, Any]:
    """Wire form of a task with its checkpoints and derived overdue / outstanding flags."""
    cps = [_checkpoint_dict(c) for c in checkpoints]
    return {"task_id": task.task_id, "site_id": task.site_id, "operator_id": task.operator_id,
            "supervisor_id": task.supervisor_id, "title": task.title, "instructions": task.instructions,
            "location": task.location, "machine_id": task.machine_id, "priority": task.priority,
            "status": task.status, "start_ts": task.start_ts, "start_gmt": gmt_iso(task.start_ts),
            "expected_finish_ts": task.expected_finish_ts, "expected_finish_gmt": gmt_iso(task.expected_finish_ts),
            "started_at": task.started_at, "started_at_gmt": gmt_iso(task.started_at),
            "finished_at": task.finished_at, "finished_at_gmt": gmt_iso(task.finished_at),
            "overdue": _is_overdue(task, now), "overrun_ticket_id": task.overrun_ticket_id,
            "created_at": task.created_at, "created_at_gmt": gmt_iso(task.created_at),
            "checkpoints": cps, "checkpoint_count": len(cps),
            "required_outstanding": sum(1 for c in cps if c["required"] and not c["complete"]),
            "exception_resolved": exception_resolved}


def _task_dicts(s: Session, tasks: list[TcTaskRow], now: float) -> list[dict[str, Any]]:
    """Wire form of several tasks, loading checkpoints and exception flags in two queries."""
    ids = [t.task_id for t in tasks]
    cps = _checkpoints(s, ids)
    resolved = _exception_resolved_ids(s, ids)
    return [_task_dict(t, cps.get(t.task_id, []), now, exception_resolved=t.task_id in resolved) for t in tasks]


def _today_tasks(s: Session, operator_ids: list[str], now: float, *, scope: str = "today") -> list[TcTaskRow]:
    """Tasks for these operators. ``today`` keeps this UTC day's tasks plus anything still open."""
    if not operator_ids:
        return []
    q = select(TcTaskRow).where(TcTaskRow.operator_id.in_(operator_ids))
    if scope == "today":
        q = q.where(TcTaskRow.status != "cancelled")
        q = q.where((TcTaskRow.start_ts >= _day_start(now)) | TcTaskRow.status.in_(OPEN_STATUSES))
    return list(s.scalars(q.order_by(TcTaskRow.start_ts)))


def _counts(tasks: list[TcTaskRow], now: float) -> dict[str, int]:
    """Bucket counts. ``overdue`` overlays pending/ongoing — it is not a separate status."""
    out = {"pending": 0, "ongoing": 0, "completed": 0, "cancelled": 0, "overdue": 0, "total": len(tasks)}
    for task in tasks:
        out[task.status] = out.get(task.status, 0) + 1
        if _is_overdue(task, now):
            out["overdue"] += 1
    return out


def _location_dict(row: LocationReportRow | None, now: float) -> dict[str, Any] | None:
    """Last known position with an explicit ``stale`` flag: an indication of presence, never proof."""
    out = location_public(row, now=now)
    return None if out is None else {**out, "stale": out["age_s"] > STALE_LOCATION_S}


def _unread_counts(s: Session, viewer_id: str, operator_ids: list[str]) -> dict[str, int]:
    """Unread messages sent to the viewer, per operator."""
    out = {oid: 0 for oid in operator_ids}
    if not operator_ids:
        return out
    rows = s.scalars(select(ChatMessageRow).where(
        ChatMessageRow.to_user_id == viewer_id, ChatMessageRow.read_at.is_(None),
        ChatMessageRow.from_user_id.in_(operator_ids)))
    for row in rows:
        out[row.from_user_id] = out.get(row.from_user_id, 0) + 1
    return out


# ---------------------------------------------------------------- team
@router.get("/operators")
def list_operators(s: Session = Depends(get_session), user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """The caller's operators with today's task counts, last known location and unread messages."""
    now = time.time()
    operators = _team(s, user)
    ids = [o.user_id for o in operators]
    tasks = _today_tasks(s, ids, now)
    unread = _unread_counts(s, user.user_id, ids)
    by_operator: dict[str, list[TcTaskRow]] = {oid: [] for oid in ids}
    for task in tasks:
        by_operator.setdefault(task.operator_id, []).append(task)
    return {"generated_at": now, "generated_at_gmt": gmt_iso(now), "day_start_ts": _day_start(now),
            "stale_after_s": STALE_LOCATION_S,
            "operators": [{**user_public(o),
                           "tasks": _counts(by_operator.get(o.user_id, []), now),
                           "location": _location_dict(latest_location(s, o.user_id), now),
                           "unread_messages": unread.get(o.user_id, 0)} for o in operators]}


@router.get("/operators/{operator_id}")
def operator_detail(operator_id: str, s: Session = Depends(get_session),
                    user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """One operator: profile, today's tasks with checkpoints, recent progress and recent punches."""
    now = time.time()
    operator = _team_operator(s, user, operator_id)
    tasks = _today_tasks(s, [operator_id], now)
    task_titles = {t.task_id: t.title for t in tasks}
    progress = list(s.scalars(select(TaskProgressRow).where(TaskProgressRow.task_id.in_(list(task_titles)))
                              .order_by(TaskProgressRow.ts.desc()).limit(PROGRESS_LIMIT))) if task_titles else []
    punches = list(s.scalars(select(PunchRow).where(PunchRow.user_id == operator_id)
                             .order_by(PunchRow.ts.desc()).limit(PUNCH_LIMIT)))
    return {"generated_at": now, "generated_at_gmt": gmt_iso(now),
            "operator": user_public(operator),
            "location": _location_dict(latest_location(s, operator_id), now),
            "tasks": _task_dicts(s, tasks, now),
            "counts": _counts(tasks, now),
            "unread_messages": _unread_counts(s, user.user_id, [operator_id])[operator_id],
            "thread_key": thread_key(operator.supervisor_id or user.user_id, operator_id),
            "progress": [{"id": p.id, "task_id": p.task_id, "task_title": task_titles.get(p.task_id, ""),
                          "user_id": p.user_id, "ts": p.ts, "ts_gmt": gmt_iso(p.ts), "kind": p.kind,
                          "text": p.text, "data": p.data} for p in progress],
            "punches": [{"punch_id": p.punch_id, "kind": p.kind, "ts": p.ts, "ts_gmt": gmt_iso(p.ts),
                         "geofence_status": p.geofence_status, "distance_m": p.distance_m,
                         "accuracy_m": p.accuracy_m, "ticket_id": p.ticket_id} for p in punches]}


# ---------------------------------------------------------------- tasks
@router.post("/tasks")
def create_task(body: TaskCreate, s: Session = Depends(get_session),
                user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Assign a task with its checkpoints to one of the caller's operators and notify them."""
    now = time.time()
    operator = _team_operator(s, user, body.operator_id)
    if body.expected_finish_ts <= body.start_ts:
        raise HTTPException(400, "expected_finish_ts must be after start_ts")
    for cp in body.checkpoints:
        if cp.kind == "counted" and cp.target < 1:
            raise HTTPException(400, f"counted checkpoint {cp.label!r} needs target >= 1")
    supervisor_id = operator.supervisor_id or user.user_id
    task = TcTaskRow(task_id=new_id("tctask"), site_id=operator.site_id, operator_id=operator.user_id,
                     supervisor_id=supervisor_id, title=body.title.strip(), instructions=body.instructions,
                     location=body.location, machine_id=body.machine_id or operator.machine_id,
                     priority=body.priority, status="pending", start_ts=body.start_ts,
                     expected_finish_ts=body.expected_finish_ts, created_at=now)
    s.add(task)
    checkpoints = [CheckpointRow(checkpoint_id=new_id("tccp"), task_id=task.task_id, order_index=i,
                                 label=cp.label, kind=cp.kind,
                                 target=1 if cp.kind == "checkbox" else cp.target,
                                 done=0, required=cp.required)
                   for i, cp in enumerate(body.checkpoints)]
    s.add_all(checkpoints)
    s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="status", text="assigned",
                          data={"status": "pending", "by": user.user_id}))
    notify(s, operator.user_id, kind="task", title=f"New task: {task.title}",
           body=f"Starts {gmt_iso(task.start_ts)} GMT, due {gmt_iso(task.expected_finish_ts)} GMT",
           severity="info", link=f"/tc/op/task/{task.task_id}")
    s.flush()
    return _task_dict(task, checkpoints, now)


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, body: TaskPatch, s: Session = Depends(get_session),
               user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Edit or cancel a task the caller owns. A completed task is frozen (409)."""
    now = time.time()
    task = _owned_task(s, user, task_id)
    if task.status == "completed":
        raise HTTPException(409, "a completed task cannot be edited")
    fields = body.model_dump(exclude_unset=True)
    start_ts = fields.get("start_ts", task.start_ts)
    finish_ts = fields.get("expected_finish_ts", task.expected_finish_ts)
    if finish_ts <= start_ts:
        raise HTTPException(400, "expected_finish_ts must be after start_ts")
    status = fields.pop("status", None)
    for name, value in fields.items():
        setattr(task, name, value)
    if status is not None and status != task.status:
        task.status = status
        s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="status", text=status,
                              data={"status": status, "by": user.user_id}))
        notify(s, task.operator_id, kind="task",
               title=f"Task {status}: {task.title}", severity="info", link=f"/tc/op/task/{task.task_id}")
    elif fields:
        s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="status", text="edited",
                              data={"fields": sorted(fields), "by": user.user_id}))
        notify(s, task.operator_id, kind="task", title=f"Task updated: {task.title}", severity="info",
               link=f"/tc/op/task/{task.task_id}")
    s.flush()
    return _task_dicts(s, [task], now)[0]


@router.get("/tasks")
def list_tasks(operator_id: str | None = Query(None), status: str | None = Query(None),
               s: Session = Depends(get_session), user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Every task for the caller's team, optionally filtered by operator and status."""
    now = time.time()
    if operator_id is not None:
        _team_operator(s, user, operator_id)
        ids = [operator_id]
    else:
        ids = [o.user_id for o in _team(s, user)]
    tasks = _today_tasks(s, ids, now, scope="all")
    if status is not None:
        tasks = [t for t in tasks if (_is_overdue(t, now) if status == "overdue" else t.status == status)]
    return {"generated_at": now, "generated_at_gmt": gmt_iso(now), "count": len(tasks),
            "tasks": _task_dicts(s, tasks, now)}


@router.get("/dashboard")
def dashboard(scope: Literal["today", "all"] = Query("today"), s: Session = Depends(get_session),
              user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Team task counts plus the task list behind every bucket, so the chart can drill in.

    ``overdue`` overlaps ``pending`` and ``ongoing``: it is a condition (not completed and past
    ``expected_finish_ts``), not a fourth status.
    """
    now = time.time()
    operators = _team(s, user)
    ids = [o.user_id for o in operators]
    tasks = _today_tasks(s, ids, now, scope=scope)
    dicts = _task_dicts(s, tasks, now)
    buckets: dict[str, list[dict[str, Any]]] = {"pending": [], "ongoing": [], "completed": [],
                                                "cancelled": [], "overdue": []}
    for item in dicts:
        buckets.setdefault(item["status"], []).append(item)
        if item["overdue"]:
            buckets["overdue"].append(item)
    per_operator = {oid: [t for t in tasks if t.operator_id == oid] for oid in ids}
    return {"generated_at": now, "generated_at_gmt": gmt_iso(now), "scope": scope,
            "day_start_ts": _day_start(now),
            "counts": _counts(tasks, now),
            "overdue_overlaps": ["pending", "ongoing"],
            "buckets": buckets,
            "operators": [{"operator_id": o.user_id, "name": o.name,
                           "counts": _counts(per_operator[o.user_id], now)} for o in operators]}


@router.post("/tasks/{task_id}/resolve-exception")
def resolve_exception(task_id: str, body: ExceptionIn, s: Session = Depends(get_session),
                      user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Authorise finishing a task whose required checkpoints are unmet (the operator's finish reads this)."""
    now = time.time()
    task = _owned_task(s, user, task_id)
    s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="exception_resolved",
                          text=body.comment, data={"by": user.user_id, "role": user.role}))
    notify(s, task.operator_id, kind="task", title=f"Completion authorised: {task.title}",
           body=body.comment, severity="info", link=f"/tc/op/task/{task.task_id}")
    s.flush()
    return {"task_id": task.task_id, "exception_resolved": True, "comment": body.comment,
            "ts": now, "ts_gmt": gmt_iso(now), "task": _task_dicts(s, [task], now)[0]}


# ---------------------------------------------------------------- review
def _decision_dict(row: ReviewDecisionRow) -> dict[str, Any]:
    return {"id": row.id, "ticket_id": row.ticket_id, "reviewer_id": row.reviewer_id,
            "reviewer_role": row.reviewer_role, "decision": row.decision, "comment": row.comment,
            "ts": row.ts, "ts_gmt": gmt_iso(row.ts), "data": row.data,
            "dismissed": row.decision == "dismissed"}


def _timeline(ticket: TicketRow, decisions: list[ReviewDecisionRow]) -> list[dict[str, Any]]:
    """Raised-at, whatever the detector recorded in ``evidence["timeline"]``, then every decision."""
    out = [{"ts": ticket.created_at, "ts_gmt": gmt_iso(ticket.created_at), "kind": "raised",
            "text": ticket.title, "actor": ticket.source}]
    for item in ticket.evidence.get("timeline", []) if isinstance(ticket.evidence, dict) else []:
        ts = item.get("ts") if isinstance(item, dict) else None
        out.append({"ts": ts, "ts_gmt": gmt_iso(ts), "kind": (item.get("kind") if isinstance(item, dict) else "note"),
                    "text": (item.get("text", "") if isinstance(item, dict) else str(item)),
                    "actor": ticket.source})
    for d in decisions:
        out.append({"ts": d.ts, "ts_gmt": gmt_iso(d.ts), "kind": f"decision:{d.decision}",
                    "text": d.comment, "actor": d.reviewer_id})
    return out


def _ticket_dict(s: Session, ticket: TicketRow, decisions: list[ReviewDecisionRow]) -> dict[str, Any]:
    """Ticket with its untouched evidence, timeline and every prior decision."""
    subject = s.get(UserRow, ticket.subject_user_id) if ticket.subject_user_id else None
    task = s.get(TcTaskRow, ticket.task_id) if ticket.task_id else None
    return {"ticket_id": ticket.ticket_id, "site_id": ticket.site_id, "kind": ticket.kind,
            "severity": ticket.severity, "status": ticket.status, "title": ticket.title,
            "detail": ticket.detail, "source": ticket.source, "simulated": ticket.source == "SIMULATED",
            "created_at": ticket.created_at, "created_at_gmt": gmt_iso(ticket.created_at),
            "owner_role": ticket.owner_role, "owner_user_id": ticket.owner_user_id,
            "subject_user": ({"user_id": subject.user_id, "name": subject.name} if subject else None),
            "task": ({"task_id": task.task_id, "title": task.title, "status": task.status,
                      "expected_finish_ts": task.expected_finish_ts,
                      "expected_finish_gmt": gmt_iso(task.expected_finish_ts)} if task else None),
            "machine_id": ticket.machine_id, "incident_id": ticket.incident_id,
            "evidence": ticket.evidence, "timeline": _timeline(ticket, decisions),
            "decisions": [_decision_dict(d) for d in decisions],
            "dismissed": ticket.status == "dismissed"}


def _decisions_for(s: Session, ticket_ids: list[str]) -> dict[str, list[ReviewDecisionRow]]:
    out: dict[str, list[ReviewDecisionRow]] = {tid: [] for tid in ticket_ids}
    if not ticket_ids:
        return out
    for row in s.scalars(select(ReviewDecisionRow).where(ReviewDecisionRow.ticket_id.in_(ticket_ids))
                         .order_by(ReviewDecisionRow.ts, ReviewDecisionRow.id)):
        out.setdefault(row.ticket_id, []).append(row)
    return out


@router.get("/review")
def review_queue(status: str = Query("open", description="a ticket status, or 'all' for the full history"),
                 kind: str | None = Query(None), s: Session = Depends(get_session),
                 user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Flags this supervisor owns, with evidence, timeline and any prior decisions."""
    now = time.time()
    q = select(TicketRow)
    if user.role == "admin":
        q = q.where(TicketRow.owner_role == "supervisor")
    else:
        q = q.where(TicketRow.owner_user_id == user.user_id)
    if status != "all":
        q = q.where(TicketRow.status == status)
    if kind is not None:
        q = q.where(TicketRow.kind == kind)
    tickets = list(s.scalars(q.order_by(TicketRow.created_at.desc())))
    decisions = _decisions_for(s, [t.ticket_id for t in tickets])
    return {"generated_at": now, "generated_at_gmt": gmt_iso(now), "status": status,
            "kinds": list(REVIEW_KINDS), "count": len(tickets),
            "tickets": [_ticket_dict(s, t, decisions.get(t.ticket_id, [])) for t in tickets]}


@router.post("/review/{ticket_id}")
def review_decide(ticket_id: str, body: ReviewIn, s: Session = Depends(get_session),
                  user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Record a decision on a flag.

    The decision is appended to the ticket's history; the original event, its evidence and its
    detail are never rewritten, so a dismissed flag stays visible and marked dismissed. Confirming
    an idle or performance flag records the judgement only — no penalty is applied — and may carry
    a constructive message, which is delivered as a system chat message to the operator.
    """
    now = time.time()
    ticket = s.get(TicketRow, ticket_id)
    if ticket is None:
        raise HTTPException(404, f"ticket {ticket_id!r} not found")
    if user.role != "admin" and ticket.owner_user_id != user.user_id:
        raise HTTPException(403, "this flag belongs to another reviewer")
    message_sent = False
    if body.message_to_operator:
        if not ticket.subject_user_id:
            raise HTTPException(400, "this flag has no subject operator to message")
        operator = _team_operator(s, user, ticket.subject_user_id)
        post_message(s, supervisor_id=operator.supervisor_id or user.user_id, operator_id=operator.user_id,
                     from_user_id=user.user_id, to_user_id=operator.user_id,
                     text=body.message_to_operator, system=True)
        message_sent = True
    s.add(ReviewDecisionRow(ticket_id=ticket.ticket_id, reviewer_id=user.user_id, reviewer_role=user.role,
                            decision=body.decision, comment=body.comment, ts=now,
                            data={"previous_status": ticket.status, "message_sent": message_sent,
                                  "penalty_applied": False}))
    ticket.status = {"confirmed": "confirmed", "dismissed": "dismissed", "more_info": "open"}[body.decision]
    s.flush()
    decisions = _decisions_for(s, [ticket.ticket_id])[ticket.ticket_id]
    return {"ticket": _ticket_dict(s, ticket, decisions), "decision": body.decision,
            "message_sent": message_sent, "penalty_applied": False}


# ---------------------------------------------------------------- cameras
@router.get("/cameras")
def cameras(s: Session = Depends(get_session), user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Cameras on machines assigned to the caller's team. Simulated feeds are labelled as such."""
    now = time.time()
    if user.role == "admin":
        rows = list(s.scalars(select(CameraRow).order_by(CameraRow.camera_id)))
    else:
        operators = _team(s, user)
        machine_ids = {o.machine_id for o in operators if o.machine_id}
        machine_ids |= {t.machine_id for t in _today_tasks(s, [o.user_id for o in operators], now, scope="all")
                        if t.machine_id}
        if user.machine_id:
            machine_ids.add(user.machine_id)
        rows = (list(s.scalars(select(CameraRow).where(CameraRow.machine_id.in_(sorted(machine_ids)))
                               .order_by(CameraRow.camera_id))) if machine_ids else [])
    return {"generated_at": now, "generated_at_gmt": gmt_iso(now), "count": len(rows),
            "cameras": [{"camera_id": c.camera_id, "site_id": c.site_id, "machine_id": c.machine_id,
                         "label": c.label, "stream_kind": c.stream_kind,
                         "simulated": c.stream_kind != "live",
                         "note": SIMULATED_FEED_NOTE if c.stream_kind != "live" else "",
                         "last_frame_ts": c.last_frame_ts, "last_frame_gmt": gmt_iso(c.last_frame_ts),
                         "age_s": (None if c.last_frame_ts is None else now - c.last_frame_ts)}
                        for c in rows]}


# ---------------------------------------------------------------- training profiles
@router.get("/operators/{operator_id}/training")
def operator_training(operator_id: str, s: Session = Depends(get_session),
                      user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """One operator's training profile: every item with their status, totals and per-category counts.

    Scoped like every other per-person view (404 unknown, 403 outside the caller's team). What this
    shows is content covered, not competency demonstrated — the payload carries that wording in
    ``note`` and the UI must keep it.
    """
    operator = _team_operator(s, user, operator_id)
    return training.profile(s, operator.user_id)


@router.post("/operators/{operator_id}/training/{video_id}/assign")
def assign_training(operator_id: str, video_id: str, body: TrainingAssignIn | None = None,
                    s: Session = Depends(get_session),
                    user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """Put a training item on one of the caller's operators' lists and notify them.

    The assignment records who asked for it and when, next to whatever progress the person already
    has: it never resets their progress and never marks anything complete on their behalf.
    """
    operator = _team_operator(s, user, operator_id)
    note = body.note if body is not None else None
    try:
        out = training.assign(s, user.user_id, operator.user_id, video_id, note=note)
    except KeyError:
        raise HTTPException(404, f"training item {video_id!r} not found")
    return {**out, "profile": training.profile(s, operator.user_id)}


# ---------------------------------------------------------------- efficiency
@router.get("/operators/{operator_id}/efficiency")
def operator_efficiency(operator_id: str, days: int = Query(efficiency.DEFAULT_DAYS, ge=1, le=90),
                        s: Session = Depends(get_session),
                        user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """How one operator's recorded work adds up over the last ``days`` days — facts, not a score.

    Declared waiting time is subtracted from working time and reported separately; AI flags are
    split into confirmed, dismissed and still-unreviewed, and a dismissed flag never counts against
    anybody. ``composite_score`` is ``None`` by design and ``caveats`` names what these numbers
    cannot tell you.
    """
    operator = _team_operator(s, user, operator_id)
    now = time.time()
    return efficiency.operator_efficiency(s, operator.user_id, since_ts=now - days * DAY_S,
                                          until_ts=now)


@router.get("/efficiency")
def team_efficiency(days: int = Query(efficiency.DEFAULT_DAYS, ge=1, le=90),
                    s: Session = Depends(get_session),
                    user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """The same facts for every operator in the caller's scope, **ordered by name and never ranked**.

    No leaderboard, no team score, no best-to-worst sort: ``ordering`` says so in the payload. An
    admin sees every operator on the site; a supervisor sees their own.
    """
    now = time.time()
    return efficiency.team_efficiency(s, user.user_id, since_ts=now - days * DAY_S, until_ts=now,
                                      operator_ids=[o.user_id for o in _team(s, user)])


# ---------------------------------------------------------------- work-schedule fatigue risk
@router.get("/operators/{operator_id}/fatigue-risk")
def operator_fatigue_risk(operator_id: str, s: Session = Depends(get_session),
                          user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """One operator's work-schedule fatigue-**risk** estimate (supervisor: own team; admin: anyone).

    Not a fatigue detector and not a measurement of the person — an exposure estimate built only
    from recorded facts (punches, declared waits, completed tasks), with every factor, weight and
    threshold in the payload. The operator can read the same estimate about themselves at
    ``GET /tc/op/fatigue-risk``, so nobody is assessed behind their back. See
    ``sentinel/taskcentre/fatigue.py`` and ``docs/sections/06-fatigue.md``.
    """
    operator = _team_operator(s, user, operator_id)
    return fatigue.fatigue_risk(s, operator.user_id)


@router.get("/fatigue-risk")
def team_fatigue_risk(s: Session = Depends(get_session),
                      user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """The same estimate for every operator in the caller's team, **ordered by name, never ranked**.

    An admin sees every active operator. The per-level counts are for triage — who might need break
    cover — not for comparing people against each other.
    """
    return fatigue.team_fatigue_risk(s, None if user.role == "admin" else user.user_id)
