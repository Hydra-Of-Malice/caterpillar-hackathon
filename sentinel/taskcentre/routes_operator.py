"""Operator API (`/tc/op`): today's work, task lifecycle, training and notifications.

Every route is **self-scoped**: an operator only ever reads or modifies their own rows. Read routes
accept `?operator_id=` so an admin (any operator) or a supervisor (only their own operators) can look
at an operator's day; write routes always act as the authenticated operator and never take that
parameter. Scope failures are 403 (role/permission) or 404 (the row exists but is out of this
caller's scope), matching the Task Centre contract.

All stored times are UTC seconds from the server clock; every one is returned twice — the raw float
and a ``*_gmt`` ISO string — because the UI labels operational times "GMT" and must never format a
server instant with the browser clock.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from sentinel.taskcentre import fatigue, training
from sentinel.taskcentre.auth import assert_can_view_operator, current_user, get_tc_session
from sentinel.taskcentre.brain import KIND_PROXIMITY_FLAG
from sentinel.taskcentre.checklist import (checklist_block, checklist_blocks, checklist_groups,
                                           checklist_items, checklist_status, latest_results,
                                           save_results)
from sentinel.taskcentre.service import gmt_iso, latest_location, location_public, notify, open_ticket, user_public
from sentinel.taskcentre.waiting import (DEFAULT_REASON, REASONS, active_wait, reason_options,
                                         start_wait, stop_wait, wait_public, wait_summary)
from sentinel.store.taskcentre_models import (
    ChatMessageRow,
    CheckpointRow,
    NotificationRow,
    PunchRow,
    ReviewDecisionRow,
    SessionRow,
    TaskProgressRow,
    TcIncidentRow,
    TcTaskRow,
    TicketRow,
    TrainingVideoRow,
    UserRow,
)

router = APIRouter(prefix="/tc/op", tags=["task-centre-operator"])

DAY_S = 86400.0
PROGRESS_LIMIT = 50          # newest entries kept per task in the today payload
OPEN_STATUSES = ("pending", "ongoing")
STALE_LOCATION_S = 600.0     # a fix older than this is flagged `stale`, never silently trusted


# ---------------------------------------------------------------- request bodies
class CheckpointBody(BaseModel):
    """`done` is 0/1 (or a bool) for a checkbox checkpoint, and an int clamped to 0..target for a
    counted one. Out-of-range values are clamped rather than rejected, so a flaky mobile tap or a
    stale counter can never wedge the operator."""
    checkpoint_id: str = Field(min_length=1)
    done: bool | int


class ProgressBody(BaseModel):
    """A free-text progress note, or a delay explanation that also notifies the supervisor."""
    kind: Literal["note", "delay"]
    text: str = Field(min_length=1, max_length=2000)


class ChecklistEntryBody(BaseModel):
    """One pre-start inspection answer.

    `result` is PASS / FAIL / N_A, accepted in any casing and normalised server-side to
    `pass` / `fail` / `na`. A FAIL must carry a `note` describing the defect (400 otherwise) — the
    same rule the in-cab copilot applies, because a defect nobody wrote down cannot be acted on.
    """
    item_id: str = Field(min_length=1, description="an id from config/checklist.yaml, e.g. WA-02")
    result: str = Field(min_length=1, description="PASS | FAIL | N_A")
    note: str | None = Field(default=None, max_length=2000)


class ChecklistBody(BaseModel):
    """A pre-start inspection submission. Partial bodies are allowed so the UI can save as it goes."""
    results: list[ChecklistEntryBody] = Field(default_factory=list)


class WaitStartBody(BaseModel):
    """What the operator declares when they tap the waiting button.

    Everything is optional: the one-tap case is an empty body, which declares `waiting_for_truck`.
    `task_id` (one of the caller's own tasks) puts the declaration in that task's audit trail.
    """
    reason: str = Field(default=DEFAULT_REASON, description=f"one of {', '.join(REASONS)}")
    task_id: str | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def _known_reason(cls, value: str) -> str:
        """Reject an unknown reason (422) rather than storing a wait nobody can interpret later."""
        if value not in REASONS:
            raise ValueError(f"reason must be one of {', '.join(REASONS)}")
        return value


class TrainingProgressBody(BaseModel):
    """How far through a training item the operator has got.

    `percent` is deliberately unconstrained here and clamped to 0-100 server-side: a player that
    reports 103 % or -1 % is a player bug, and rejecting the tap would lose real progress. `completed`
    finishes the item outright (and forces the bar to 100) for content with no meaningful percentage.
    """
    percent: float = 0.0
    completed: bool | None = None


# ---------------------------------------------------------------- time helpers
def _now() -> float:
    """Server UTC seconds. The only clock this module trusts."""
    return datetime.now(tz=timezone.utc).timestamp()


def _gmt(ts: float | None) -> str | None:
    """ISO-8601 GMT string for a UTC-seconds timestamp, or None."""
    return None if ts is None else gmt_iso(ts)


def _stamp(out: dict[str, Any], key: str, ts: float | None) -> dict[str, Any]:
    """Write `key` and `key_gmt` together so no timestamp can be returned without its GMT string."""
    out[key] = ts
    out[f"{key}_gmt"] = _gmt(ts)
    return out


def _day_bounds(now: float) -> tuple[float, float]:
    """[midnight GMT, next midnight GMT) for the UTC day containing `now`."""
    start = datetime.fromtimestamp(now, tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.timestamp(), start.timestamp() + DAY_S


# ---------------------------------------------------------------- scope helpers
def _scoped_operator(s: Session, user: UserRow, operator_id: str | None) -> UserRow:
    """The operator whose data this request is about, after the shared permission check.

    No `operator_id` means "me". Otherwise the shared guard decides (admin: anyone; supervisor: only
    their own operators; operator: only themselves) and a target that is not an operator is 404.
    """
    if not operator_id or operator_id == user.user_id:
        return user
    target = assert_can_view_operator(user, operator_id, s)
    if target.role != "operator":
        raise HTTPException(404, f"operator {operator_id!r} not found")
    return target


def _own_task(s: Session, task_id: str, user: UserRow) -> TcTaskRow:
    """A task the authenticated operator owns. 404 when it is missing *or* belongs to someone else,
    so a task id cannot be probed for existence across operators."""
    task = s.get(TcTaskRow, task_id)
    if task is None or task.operator_id != user.user_id:
        raise HTTPException(404, f"task {task_id!r} not found")
    return task


def _viewable_task(s: Session, task_id: str, user: UserRow) -> TcTaskRow:
    """A task the caller may *read*: their own, or — for an admin or the operator's own supervisor —
    one of that operator's. 404 when no such task exists, 403 when it belongs to someone outside the
    caller's scope, which is what a second operator reaching for this task gets."""
    task = s.get(TcTaskRow, task_id)
    if task is None:
        raise HTTPException(404, f"task {task_id!r} not found")
    if task.operator_id != user.user_id:
        assert_can_view_operator(user, task.operator_id, s)
    return task


# ---------------------------------------------------------------- serialisation
def _checkpoint_dict(cp: CheckpointRow) -> dict[str, Any]:
    out: dict[str, Any] = {
        "checkpoint_id": cp.checkpoint_id,
        "order_index": cp.order_index,
        "label": cp.label,
        "kind": cp.kind,
        "target": cp.target,
        "done": cp.done,
        "required": bool(cp.required),
        "complete": cp.done >= cp.target,
    }
    return _stamp(out, "updated_at", cp.updated_at)


def _progress_dict(row: TaskProgressRow) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row.id,
        "task_id": row.task_id,
        "user_id": row.user_id,
        "kind": row.kind,
        "text": row.text,
        "data": row.data or {},
    }
    return _stamp(out, "ts", row.ts)


def _progress_pct(checkpoints: list[CheckpointRow], status: str) -> int:
    """Checkpoint completion 0..100. A completed task always reads 100; a task with no checkpoints
    reads 0 until it is completed (there is nothing to measure, so nothing is invented)."""
    if status == "completed":
        return 100
    total = sum(max(cp.target, 1) for cp in checkpoints)
    if total <= 0:
        return 0
    done = sum(min(cp.done, max(cp.target, 1)) for cp in checkpoints)
    return int(round(100.0 * done / total))


def _task_dict(task: TcTaskRow, checkpoints: list[CheckpointRow], progress: list[TaskProgressRow],
               *, now: float, exception_resolved: bool, checklist: dict[str, Any]) -> dict[str, Any]:
    """One task with its checkpoints, progress trail, pre-start inspection state and timing facts.

    `checklist` is the compact block — `{completed, blocked, answered, total, failed_critical_count}`
    — so the UI knows before the operator taps whether Start will be allowed for this task.
    """
    reference = task.finished_at if task.finished_at is not None else now
    over_s = reference - task.expected_finish_ts
    overdue = task.status != "cancelled" and over_s > 0
    unmet = [_checkpoint_dict(cp) for cp in checkpoints if cp.required and cp.done < cp.target]
    out: dict[str, Any] = {
        "task_id": task.task_id,
        "site_id": task.site_id,
        "operator_id": task.operator_id,
        "supervisor_id": task.supervisor_id,
        "title": task.title,
        "instructions": task.instructions,
        "location": task.location,
        "machine_id": task.machine_id,
        "priority": task.priority,
        "status": task.status,
        "progress_pct": _progress_pct(checkpoints, task.status),
        "checkpoints_total": len(checkpoints),
        "checkpoints_complete": sum(1 for cp in checkpoints if cp.done >= cp.target),
        "checkpoints": [_checkpoint_dict(cp) for cp in checkpoints],
        "unmet_required_checkpoints": unmet,
        "checklist": checklist,
        "exception_resolved": exception_resolved,
        "overdue": overdue,
        "minutes_over": round(over_s / 60.0, 1) if overdue else None,
        "overrun_ticket_id": task.overrun_ticket_id,
        "progress": [_progress_dict(p) for p in progress],
    }
    for key, ts in (("start_ts", task.start_ts), ("expected_finish_ts", task.expected_finish_ts),
                    ("started_at", task.started_at), ("finished_at", task.finished_at),
                    ("created_at", task.created_at)):
        _stamp(out, key, ts)
    return out


def _notification_dict(n: NotificationRow) -> dict[str, Any]:
    out: dict[str, Any] = {
        "notification_id": n.notification_id,
        "user_id": n.user_id,
        "kind": n.kind,
        "severity": n.severity,
        "title": n.title,
        "body": n.body,
        "alarm": bool(n.alarm),
        "link": n.link,
        "incident_id": n.incident_id,
        "ticket_id": n.ticket_id,
        "unread": n.read_at is None,
        "unacknowledged": n.acknowledged_at is None,
    }
    for key, ts in (("ts", n.ts), ("read_at", n.read_at), ("acknowledged_at", n.acknowledged_at)):
        _stamp(out, key, ts)
    return out


def _video_dict(v: TrainingVideoRow) -> dict[str, Any]:
    """A training entry. `url is None` means the UI shows its placeholder player; `label` carries the
    DEMO wording and must be rendered, not hidden."""
    return {
        "video_id": v.video_id,
        "title": v.title,
        "category": v.category,
        "duration_min": v.duration_min,
        "url": v.url,
        "player": "placeholder" if v.url is None else "url",
        "description": v.description,
        "label": v.label,
        "order_index": v.order_index,
    }


#: The progress fields attached to every entry in the training list (the profile carries the rest).
TRAINING_PROGRESS_KEYS = ("status", "percent", "started_at", "started_at_gmt", "completed_at",
                          "completed_at_gmt", "last_seen_at", "last_seen_at_gmt", "assigned",
                          "assigned_by", "assigned_at", "assigned_at_gmt", "note")


def _training_progress(item: dict[str, Any]) -> dict[str, Any]:
    """The progress half of a `sentinel.taskcentre.training` item, for the library listing."""
    return {key: item[key] for key in TRAINING_PROGRESS_KEYS}


# ---------------------------------------------------------------- query helpers
def _checkpoints_by_task(s: Session, task_ids: Iterable[str]) -> dict[str, list[CheckpointRow]]:
    ids = list(task_ids)
    if not ids:
        return {}
    rows = (s.query(CheckpointRow).filter(CheckpointRow.task_id.in_(ids))
            .order_by(CheckpointRow.order_index, CheckpointRow.checkpoint_id).all())
    out: dict[str, list[CheckpointRow]] = {tid: [] for tid in ids}
    for cp in rows:
        out[cp.task_id].append(cp)
    return out


def _progress_by_task(s: Session, task_ids: Iterable[str]) -> dict[str, list[TaskProgressRow]]:
    ids = list(task_ids)
    if not ids:
        return {}
    rows = (s.query(TaskProgressRow).filter(TaskProgressRow.task_id.in_(ids))
            .order_by(TaskProgressRow.ts, TaskProgressRow.id).all())
    out: dict[str, list[TaskProgressRow]] = {tid: [] for tid in ids}
    for row in rows:
        out[row.task_id].append(row)
    return {tid: entries[-PROGRESS_LIMIT:] for tid, entries in out.items()}


def _has_exception_resolved(s: Session, task_id: str) -> bool:
    """True once a supervisor has resolved the unmet-checkpoint exception for this task."""
    return s.query(TaskProgressRow.id).filter(
        TaskProgressRow.task_id == task_id, TaskProgressRow.kind == "exception_resolved").first() is not None


def _active_alarm(s: Session, operator_id: str) -> NotificationRow | None:
    """The newest unacknowledged alarm notification — what drives the operator's critical banner."""
    return (s.query(NotificationRow)
            .filter(NotificationRow.user_id == operator_id, NotificationRow.alarm.is_(True),
                    NotificationRow.acknowledged_at.is_(None))
            .order_by(NotificationRow.ts.desc()).first())


def _today_tasks(s: Session, operator_id: str, day_start: float, day_end: float) -> list[TcTaskRow]:
    """Today's board: everything still open that was due to start by tonight (so yesterday's unfinished
    work does not silently disappear), plus anything scheduled or finished inside today."""
    rows = (s.query(TcTaskRow).filter(TcTaskRow.operator_id == operator_id, TcTaskRow.status != "cancelled")
            .order_by(TcTaskRow.start_ts, TcTaskRow.created_at).all())
    keep = []
    for t in rows:
        scheduled_today = day_start <= t.start_ts < day_end
        finished_today = t.finished_at is not None and day_start <= t.finished_at < day_end
        still_open = t.status in OPEN_STATUSES and t.start_ts < day_end
        if scheduled_today or finished_today or still_open:
            keep.append(t)
    return keep


def _task_payloads(s: Session, tasks: list[TcTaskRow], now: float) -> list[dict[str, Any]]:
    ids = [t.task_id for t in tasks]
    checkpoints = _checkpoints_by_task(s, ids)
    progress = _progress_by_task(s, ids)
    checklists = checklist_blocks(s, ids)          # one query for the whole board
    resolved = {tid for tid in ids
                if any(p.kind == "exception_resolved" for p in progress.get(tid, []))}
    return [_task_dict(t, checkpoints.get(t.task_id, []), progress.get(t.task_id, []),
                       now=now, exception_resolved=t.task_id in resolved,
                       checklist=checklists[t.task_id]) for t in tasks]


def _one_task_payload(s: Session, task: TcTaskRow, now: float,
                      checklist: dict[str, Any] | None = None) -> dict[str, Any]:
    checkpoints = _checkpoints_by_task(s, [task.task_id]).get(task.task_id, [])
    progress = _progress_by_task(s, [task.task_id]).get(task.task_id, [])
    if checklist is None:
        checklist = checklist_block(checklist_status(s, task.task_id))
    return _task_dict(task, checkpoints, progress, now=now,
                      exception_resolved=_has_exception_resolved(s, task.task_id),
                      checklist=checklist)


def _login_block(s: Session, operator_id: str) -> dict[str, Any] | None:
    """Most recent sign-in: server time and the geofence verdict recorded with it."""
    row = (s.query(SessionRow).filter(SessionRow.user_id == operator_id)
           .order_by(SessionRow.created_at.desc()).first())
    if row is None:
        return None
    out: dict[str, Any] = {
        "geofence_status": row.login_geofence,
        "lat": row.login_lat,
        "lon": row.login_lon,
        "accuracy_m": row.login_accuracy_m,
    }
    _stamp(out, "ts", row.created_at)
    return _stamp(out, "expires_at", row.expires_at)


def _punch_block(s: Session, operator_id: str, kind: str, day_start: float, day_end: float) -> dict[str, Any] | None:
    """Today's latest punch of one kind, with the location evidence used for the decision."""
    row = (s.query(PunchRow)
           .filter(PunchRow.user_id == operator_id, PunchRow.kind == kind,
                   PunchRow.ts >= day_start, PunchRow.ts < day_end)
           .order_by(PunchRow.ts.desc()).first())
    if row is None:
        return None
    out: dict[str, Any] = {
        "punch_id": row.punch_id,
        "kind": row.kind,
        "geofence_status": row.geofence_status,
        "geofence_id": row.geofence_id,
        "distance_m": row.distance_m,
        "accuracy_m": row.accuracy_m,
        "lat": row.lat,
        "lon": row.lon,
        "ticket_id": row.ticket_id,
    }
    return _stamp(out, "ts", row.ts)


def _geofence_block(s: Session, operator_id: str, now: float) -> dict[str, Any]:
    """Latest position report. An indication of presence, never proof; a stale fix says so."""
    row = latest_location(s, operator_id)
    fix = location_public(row, now=now)
    if fix is None:
        out: dict[str, Any] = {"status": "unverified", "age_s": None, "stale": True,
                               "accuracy_m": None, "source": None,
                               "note": "no position reported yet"}
        return _stamp(out, "ts", None)
    return {**fix, "status": fix["geofence_status"], "stale": fix["age_s"] > STALE_LOCATION_S,
            "note": "indication of presence, not proof"}


def _waiting_block(s: Session, operator_id: str, *, day_start: float, now: float) -> dict[str, Any]:
    """Declared waiting: the open period (if any) and today's accumulated explained idle time.

    `minutes_now` counts the *current* declaration up to the server clock, `today_total_minutes` is
    every declared period clipped to today. When nothing is declared the numbers are real zeros, not
    nulls, so the button and the counter always have something honest to render.
    """
    summary = wait_summary(s, operator_id, since_ts=day_start, until_ts=now)
    active = summary["active"]
    return {
        "active": active is not None,
        "wait_id": active["wait_id"] if active else None,
        "reason": active["reason"] if active else None,
        "reason_label": active["reason_label"] if active else None,
        "task_id": active["task_id"] if active else None,
        "note": active["note"] if active else None,
        "since_ts": active["started_at"] if active else None,
        "since_gmt": active["started_at_gmt"] if active else None,
        "minutes_now": active["minutes_now"] if active else 0.0,
        "today_total_minutes": summary["total_minutes"],
        "by_reason": summary["by_reason"],
        "periods_today": summary["count"],
        "note_label": "explained waiting time, not counted as operator idle time",
    }


# ---------------------------------------------------------------- routes
@router.get("/today")
def get_today(operator_id: str | None = Query(default=None, description="admin/supervisor read of one operator"),
              user: UserRow = Depends(current_user),
              s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """The operator home payload: today's tasks, the ongoing one, sign-in / Start Work / geofence
    state, declared waiting time, unread chat, notification counts and any active critical alarm.

    With no tasks assigned, `tasks` is an explicit empty list and `empty` is true — the UI shows
    "No tasks assigned yet". Nothing is ever fabricated to fill the screen.
    """
    target = _scoped_operator(s, user, operator_id)
    now = _now()
    day_start, day_end = _day_bounds(now)

    tasks = _today_tasks(s, target.user_id, day_start, day_end)
    payloads = _task_payloads(s, tasks, now)
    ongoing = next((p for p in payloads if p["status"] == "ongoing"), None)
    counts = {
        "total": len(payloads),
        "pending": sum(1 for p in payloads if p["status"] == "pending"),
        "ongoing": sum(1 for p in payloads if p["status"] == "ongoing"),
        "completed": sum(1 for p in payloads if p["status"] == "completed"),
        "overdue": sum(1 for p in payloads if p["overdue"] and p["status"] != "completed"),
    }

    unread_messages = s.query(ChatMessageRow.message_id).filter(
        ChatMessageRow.to_user_id == target.user_id, ChatMessageRow.read_at.is_(None)).count()
    unread_notifications = s.query(NotificationRow.notification_id).filter(
        NotificationRow.user_id == target.user_id, NotificationRow.read_at.is_(None)).count()
    unacknowledged = s.query(NotificationRow.notification_id).filter(
        NotificationRow.user_id == target.user_id, NotificationRow.acknowledged_at.is_(None)).count()
    alarm = _active_alarm(s, target.user_id)

    out: dict[str, Any] = {
        "operator": user_public(target),
        "viewer": {"user_id": user.user_id, "role": user.role, "self": target.user_id == user.user_id},
        "tasks": payloads,
        "empty": not payloads,
        "empty_message": "No tasks assigned yet" if not payloads else None,
        "ongoing_task": ongoing,
        "ongoing_task_id": ongoing["task_id"] if ongoing else None,
        "counts": counts,
        "login": _login_block(s, target.user_id),
        "start_work": _punch_block(s, target.user_id, "start_work", day_start, day_end),
        "finish_work": _punch_block(s, target.user_id, "finish_work", day_start, day_end),
        "geofence": _geofence_block(s, target.user_id, now),
        "waiting": _waiting_block(s, target.user_id, day_start=day_start, now=now),
        "unread_messages": unread_messages,
        "unread_notifications": unread_notifications,
        "unacknowledged_notifications": unacknowledged,
        "alarm": _notification_dict(alarm) if alarm is not None else None,
    }
    _stamp(out, "server_ts", now)
    _stamp(out, "day_start_ts", day_start)
    return _stamp(out, "day_end_ts", day_end)


@router.get("/tasks/{task_id}/checklist")
def get_task_checklist(task_id: str, user: UserRow = Depends(current_user),
                       s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """The pre-start inspection for one task: every item with the answer given so far, plus the verdict.

    The items are the shared `config/checklist.yaml` the in-cab copilot uses — 14 items in 4 groups,
    11 of them critical — never a second copy of the list. An item the operator has not reached yet
    has `result: null` rather than an invented PASS.
    """
    task = _viewable_task(s, task_id, user)
    now = _now()
    results = latest_results(s, task.task_id)
    items: list[dict[str, Any]] = []
    for item in checklist_items():
        row = results.get(item["id"])
        entry = {**item, "result": None if row is None else row.result,
                 "note": None if row is None else row.note, "answered": row is not None,
                 "answered_by": None if row is None else row.user_id}
        items.append(_stamp(entry, "ts", None if row is None else row.ts))
    out: dict[str, Any] = {
        "task_id": task.task_id,
        "task_title": task.title,
        "task_status": task.status,
        "operator_id": task.operator_id,
        "items": items,
        "groups": checklist_groups(),
        "status": checklist_status(s, task.task_id),
    }
    return _stamp(out, "server_ts", now)


@router.post("/tasks/{task_id}/checklist")
def post_task_checklist(task_id: str, body: ChecklistBody, user: UserRow = Depends(current_user),
                        s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Record pre-start inspection answers for a task and return the updated verdict.

    Partial submissions are allowed — the UI saves as the operator works down the list — and the
    latest answer per item wins. **400** for an item id that is not in the config, and for a FAIL with
    no note: a defect that is not described cannot be fixed. One `checklist` progress entry summarises
    the whole submission, so the audit trail is not flooded with one row per tick.
    """
    task = _own_task(s, task_id, user)
    if task.status in ("completed", "cancelled"):
        raise HTTPException(409, {"error": f"task_{task.status}", "task_id": task.task_id,
                                  "message": f"task is {task.status}; the pre-start inspection is closed"})

    now = _now()
    saved = save_results(s, task.task_id, user.user_id, body.results)
    status = checklist_status(s, task.task_id)
    s.add(TaskProgressRow(
        task_id=task.task_id, user_id=user.user_id, ts=now, kind="checklist",
        text=f"Pre-start inspection {status['answered']}/{status['total']} answered",
        data={"checklist_version": status["version"], "item_ids": [r.item_id for r in saved],
              "answered_now": len(saved), "answered": status["answered"], "total": status["total"],
              "passed": status["passed"], "failed": status["failed"], "na": status["na"],
              "failed_critical": [f["item_id"] for f in status["failed_critical"]],
              "completed": status["completed"], "blocked": status["blocked"]}))
    s.flush()
    return {"ok": True, "task_id": task.task_id, "saved": len(saved), "status": status,
            "task": _one_task_payload(s, task, now, checklist_block(status)),
            **_stamp({}, "server_ts", now)}


def _checklist_ticket(s: Session, task: TcTaskRow, status: dict[str, Any], *, user: UserRow,
                      now: float) -> TicketRow:
    """The supervisor's `checklist_fail` ticket for a task whose critical pre-start item failed.

    One ticket per task: a second start attempt reuses the open one instead of raising a duplicate
    (and does not re-notify), so a machine with a real defect produces one review item, not a queue
    of them. The evidence carries the failed items with the operator's own notes.
    """
    existing = (s.query(TicketRow)
                .filter(TicketRow.task_id == task.task_id, TicketRow.kind == "checklist_fail")
                .order_by(TicketRow.created_at).first())
    if existing is not None:
        return existing

    failed = status["failed_critical"]
    labels = ", ".join(f["label"] for f in failed)
    evidence: dict[str, Any] = {
        "checklist_version": status["version"],
        "failed_critical": failed,
        "answered": status["answered"],
        "total": status["total"],
        "passed": status["passed"],
        "failed": status["failed"],
        "na": status["na"],
        "operator_id": task.operator_id,
        "blocks_task_start": True,
        "note": "operator-reported pre-start inspection result; the machine was not started",
    }
    _stamp(evidence, "signed_at", status["signed_at"])
    _stamp(evidence, "blocked_at", now)

    ticket = open_ticket(
        s, site_id=task.site_id, kind="checklist_fail",
        title=f"Pre-start check failed: {labels}",
        severity="high", owner_role="supervisor", owner_user_id=task.supervisor_id,
        subject_user_id=task.operator_id,
        detail=(f"{user.name} could not start {task.title!r}: "
                + "; ".join(f"{f['label']} — {f['note']}" for f in failed)),
        evidence=evidence, source="RULE", task_id=task.task_id, machine_id=task.machine_id)

    if task.supervisor_id:
        notify(s, task.supervisor_id, kind="ticket", severity="critical",
               title=f"Pre-start check failed: {task.title}",
               body=f"{user.name} reported a critical defect at {_gmt(now)} GMT ({labels}). "
                    f"The task cannot start until it is dealt with.",
               ticket_id=ticket.ticket_id, link=f"/tc/sup/operator/{task.operator_id}")
    s.flush()
    return ticket


@router.post("/tasks/{task_id}/start")
def post_start(task_id: str, user: UserRow = Depends(current_user),
               s: Session = Depends(get_tc_session)) -> Any:
    """Begin a task: status `ongoing` + server `started_at`, recorded in the progress trail.

    The pre-start inspection gates this route — a task cannot go `ongoing` until every checklist item
    has been answered for it:

    * **409** `checklist_incomplete` while items are unanswered (with the `missing` ids), and
    * **409** `checklist_critical_failed` when a critical item was answered FAIL, which also opens the
      supervisor's `checklist_fail` ticket and notifies them.

    Also 409 when the task is already completed, or when another task is ongoing — an operator runs
    one task at a time. Starting an already-ongoing task is a no-op, so a double tap is harmless (and
    is *not* re-gated: the checklist decides whether work may begin, not whether it may continue).
    """
    task = _own_task(s, task_id, user)
    now = _now()
    if task.status == "completed":
        raise HTTPException(409, {"error": "task_completed", "task_id": task.task_id,
                                  "message": "task is already completed"})
    if task.status == "ongoing":
        return {"ok": True, "started": False, "task": _one_task_payload(s, task, now),
                **_stamp({}, "server_ts", now)}

    other = (s.query(TcTaskRow)
             .filter(TcTaskRow.operator_id == user.user_id, TcTaskRow.status == "ongoing",
                     TcTaskRow.task_id != task.task_id)
             .order_by(TcTaskRow.started_at).first())
    if other is not None:
        raise HTTPException(409, {"error": "another_task_ongoing", "task_id": task.task_id,
                                  "ongoing_task_id": other.task_id, "ongoing_task_title": other.title,
                                  "message": "finish the ongoing task before starting another"})

    status = checklist_status(s, task.task_id)
    if not status["completed"]:
        raise HTTPException(409, {"error": "checklist_incomplete", "task_id": task.task_id,
                                  "missing": status["missing"], "answered": status["answered"],
                                  "total": status["total"],
                                  "message": "complete the pre-start inspection before starting this task"})
    if status["blocked"]:
        # The ticket must survive this 409, and raising HTTPException rolls the request transaction
        # back — so the refusal is *returned* rather than raised, leaving the session to commit it.
        ticket = _checklist_ticket(s, task, status, user=user, now=now)
        return JSONResponse(status_code=409, content={"detail": {
            "error": "checklist_critical_failed", "task_id": task.task_id,
            "failed_critical": status["failed_critical"], "ticket_id": ticket.ticket_id,
            "message": "a critical pre-start item failed; your supervisor has been notified"}})

    task.status = "ongoing"
    task.started_at = now
    s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="status",
                          text="Task started", data={"status": "ongoing", "started_at": now,
                                                     "started_at_gmt": _gmt(now),
                                                     "checklist_version": status["version"],
                                                     "checklist_passed": status["passed"],
                                                     "checklist_na": status["na"],
                                                     "checklist_signed_at": status["signed_at"],
                                                     "checklist_signed_at_gmt": status["signed_at_gmt"]}))
    s.flush()
    return {"ok": True, "started": True, "task": _one_task_payload(s, task, now, checklist_block(status)),
            **_stamp({}, "server_ts", now)}


@router.post("/tasks/{task_id}/checkpoint")
def post_checkpoint(task_id: str, body: CheckpointBody, user: UserRow = Depends(current_user),
                    s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Tick a checkbox (0/1) or set a counted checkpoint (clamped to 0..target).

    The checkpoint row is re-read from the database inside this request's transaction, so two rapid
    updates serialise on the write lock instead of racing a value cached earlier in the session.
    """
    task = _own_task(s, task_id, user)
    if task.status in ("completed", "cancelled"):
        raise HTTPException(409, {"error": f"task_{task.status}", "task_id": task.task_id,
                                  "message": f"task is {task.status}; checkpoints are closed"})

    cp = (s.query(CheckpointRow).populate_existing()
          .filter(CheckpointRow.checkpoint_id == body.checkpoint_id,
                  CheckpointRow.task_id == task.task_id).one_or_none())
    if cp is None:
        raise HTTPException(404, f"checkpoint {body.checkpoint_id!r} not found on task {task_id!r}")

    now = _now()
    previous = cp.done
    requested = int(body.done)
    ceiling = 1 if cp.kind == "checkbox" else max(cp.target, 0)
    cp.done = max(0, min(requested, ceiling))
    cp.updated_at = now
    s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="checkpoint",
                          text=cp.label,
                          data={"checkpoint_id": cp.checkpoint_id, "kind": cp.kind, "label": cp.label,
                                "requested": requested, "done": cp.done, "previous": previous,
                                "target": cp.target, "clamped": cp.done != requested,
                                "complete": cp.done >= cp.target}))
    s.flush()
    return {"ok": True, "checkpoint": _checkpoint_dict(cp), "clamped": cp.done != requested,
            "task": _one_task_payload(s, task, now), **_stamp({}, "server_ts", now)}


@router.post("/tasks/{task_id}/progress")
def post_progress(task_id: str, body: ProgressBody, user: UserRow = Depends(current_user),
                  s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Add a progress note, or report a delay — a delay also notifies the supervisor."""
    task = _own_task(s, task_id, user)
    now = _now()
    entry = TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind=body.kind,
                            text=body.text, data={"task_title": task.title, "status": task.status})
    s.add(entry)
    s.flush()

    notified = False
    if body.kind == "delay" and task.supervisor_id:
        notify(s, task.supervisor_id, kind="task", severity="warning",
               title=f"Delay reported: {task.title}",
               body=f"{user.name} reported a delay at {_gmt(now)} GMT: {body.text}",
               link=f"/tc/sup/operator/{task.operator_id}")
        notified = True

    return {"ok": True, "entry": _progress_dict(entry), "supervisor_notified": notified,
            "task": _one_task_payload(s, task, now), **_stamp({}, "server_ts", now)}


@router.post("/tasks/{task_id}/finish")
def post_finish(task_id: str, user: UserRow = Depends(current_user),
                s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Complete a task.

    **409** listing the unmet required checkpoints unless a supervisor has already resolved the
    exception for this task (a `exception_resolved` progress row). Finishing later than
    `expected_finish_ts` opens a `task_overrun` ticket owned by the supervisor, carrying only the
    objective timings — planned vs actual and minutes over. Whether that was acceptable is the
    supervisor's call, recorded separately as a review decision; the operator sees the outcome then.
    """
    task = _own_task(s, task_id, user)
    now = _now()
    if task.status == "completed":
        raise HTTPException(409, {"error": "task_completed", "task_id": task.task_id,
                                  "message": "task is already completed"})
    if task.status != "ongoing":
        raise HTTPException(409, {"error": "task_not_started", "task_id": task.task_id,
                                  "status": task.status, "message": "start the task before finishing it"})

    checkpoints = _checkpoints_by_task(s, [task.task_id]).get(task.task_id, [])
    unmet = [cp for cp in checkpoints if cp.required and cp.done < cp.target]
    resolved = _has_exception_resolved(s, task.task_id)
    if unmet and not resolved:
        raise HTTPException(409, {
            "error": "required_checkpoints_incomplete",
            "task_id": task.task_id,
            "message": "complete the required checkpoints, or ask your supervisor to resolve the exception",
            "exception_resolved": False,
            "unmet_checkpoints": [{**_checkpoint_dict(cp), "remaining": cp.target - cp.done} for cp in unmet],
        })

    task.status = "completed"
    task.finished_at = now
    s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="status",
                          text="Task completed", data={
                              "status": "completed", "finished_at": now, "finished_at_gmt": _gmt(now),
                              "exception_resolved": resolved,
                              "unmet_required_checkpoint_ids": [cp.checkpoint_id for cp in unmet]}))

    overrun = _open_overrun(s, task, checkpoints, resolved=resolved, now=now) if now > task.expected_finish_ts else None
    s.flush()
    return {"ok": True, "task": _one_task_payload(s, task, now), "overrun": overrun,
            "exception_resolved": resolved, **_stamp({}, "server_ts", now)}


def _open_overrun(s: Session, task: TcTaskRow, checkpoints: list[CheckpointRow], *,
                  resolved: bool, now: float) -> dict[str, Any]:
    """Raise the supervisor's `task_overrun` ticket and notify them. Evidence is timing only."""
    minutes_over = round((now - task.expected_finish_ts) / 60.0, 1)
    planned_minutes = round((task.expected_finish_ts - task.start_ts) / 60.0, 1)
    actual_from = task.started_at if task.started_at is not None else task.start_ts
    actual_minutes = round((now - actual_from) / 60.0, 1)
    evidence: dict[str, Any] = {
        "planned_minutes": planned_minutes,
        "actual_minutes": actual_minutes,
        "minutes_over": minutes_over,
        "checkpoints_total": len(checkpoints),
        "checkpoints_complete": sum(1 for cp in checkpoints if cp.done >= cp.target),
        "exception_resolved": resolved,
        "measured_by": "server clock (UTC)",
        "note": "objective timing only; whether the overrun was justified is the supervisor's decision",
    }
    for key, ts in (("planned_start_ts", task.start_ts), ("expected_finish_ts", task.expected_finish_ts),
                    ("started_at", task.started_at), ("finished_at", now)):
        _stamp(evidence, key, ts)

    ticket = open_ticket(
        s, site_id=task.site_id, kind="task_overrun",
        title=f"Task overran by {minutes_over:g} min: {task.title}",
        severity="high" if minutes_over >= 60 else "medium",
        owner_role="supervisor", owner_user_id=task.supervisor_id,
        subject_user_id=task.operator_id,
        detail=(f"Planned finish {_gmt(task.expected_finish_ts)} GMT, actual finish {_gmt(now)} GMT "
                f"({minutes_over:g} min over; planned {planned_minutes:g} min, actual {actual_minutes:g} min)."),
        evidence=evidence, source="RULE", task_id=task.task_id, machine_id=task.machine_id)
    s.flush()
    task.overrun_ticket_id = ticket.ticket_id

    if task.supervisor_id:
        notify(s, task.supervisor_id, kind="ticket", severity="warning",
               title=f"Task overrun: {task.title}",
               body=f"Finished {minutes_over:g} min after the planned finish time "
                    f"({_gmt(task.expected_finish_ts)} GMT). Review the timings.",
               ticket_id=ticket.ticket_id, link=f"/tc/sup/operator/{task.operator_id}")

    out: dict[str, Any] = {
        "ticket_id": ticket.ticket_id,
        "minutes_over": minutes_over,
        "planned_minutes": planned_minutes,
        "actual_minutes": actual_minutes,
        "review_status": "awaiting_supervisor_review",
        "message": "Your supervisor has been notified and will review the timings.",
    }
    _stamp(out, "expected_finish_ts", task.expected_finish_ts)
    return _stamp(out, "finished_at", now)


# ---------------------------------------------------------------- declared waiting
def _wait_progress(s: Session, task_id: str | None, user_id: str, *, event: str, wait: dict[str, Any],
                   ts: float) -> None:
    """Record a `waiting` entry in a task's audit trail, when the declaration named a task.

    The operator's explanation for a pause belongs next to the work it happened on, so a supervisor
    reading the task sees "waiting for a truck, 12 min" instead of an unexplained gap.
    """
    if not task_id:
        return
    verb = "started" if event == "start" else "ended"
    text = (f"{wait['reason_label']} - {verb}" if event == "start"
            else f"{wait['reason_label']} - ended after {wait['minutes']:g} min")
    s.add(TaskProgressRow(task_id=task_id, user_id=user_id, ts=ts, kind="waiting", text=text,
                          data={"event": event, **wait}))


@router.post("/waiting/start")
def post_waiting_start(body: WaitStartBody | None = None, user: UserRow = Depends(current_user),
                       s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Declare a wait - "Waiting for truck" - so the pause is recorded as explained, not as idling.

    The period is timed by the **server** clock from this moment until `/waiting/stop`. While it is
    open, a camera observation overlapping it raises no idle flag (`brain.handle_camera_observation`)
    and the minutes are reported as explained waiting, with the reason attached.

    Idempotent: tapping twice returns the period already open (`already_active: true`) rather than
    starting a second one, so a double tap cannot double-count the time or fragment the declaration.
    A `task_id` must be one of the caller's own tasks (404 otherwise) and adds a `waiting` entry to
    that task's progress trail.
    """
    body = body or WaitStartBody()
    task = _own_task(s, body.task_id, user) if body.task_id else None
    already = active_wait(s, user.user_id) is not None
    wait_row = start_wait(s, user.user_id, reason=body.reason, task_id=task.task_id if task else None,
                          note=body.note, source="operator")
    now = _now()
    wait = wait_public(wait_row, now=now)
    if not already:
        _wait_progress(s, wait_row.task_id, user.user_id, event="start", wait=wait, ts=wait_row.started_at)
        s.flush()
    out: dict[str, Any] = {
        "ok": True,
        "wait": wait,
        "active": True,
        "already_active": already,
        "reason": wait["reason"],
        "reason_label": wait["reason_label"],
        "minutes_now": wait["minutes"],
        "message": f"{wait['reason_label']} recorded from {wait['started_at_gmt']} GMT. "
                   f"This time is reported as explained waiting, not as idle time.",
        "started_at": wait_row.started_at,
        "started_at_gmt": wait["started_at_gmt"],
    }
    return _stamp(out, "server_ts", now)


@router.post("/waiting/stop")
def post_waiting_stop(user: UserRow = Depends(current_user),
                      s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """End the open wait. Stopping when nothing is open is a no-op: `{active: false, wait: null}`.

    Never an error - a stale screen or a second tap must not leave the operator stuck looking at a
    button that refuses to work. The closed period keeps its own `minutes`, and a `waiting` entry is
    added to the task's trail when the declaration named one.
    """
    wait_row = stop_wait(s, user.user_id)
    now = _now()
    if wait_row is None:
        out: dict[str, Any] = {"ok": True, "stopped": False, "wait": None, "active": False,
                               "minutes": 0.0, "message": "No waiting period was open."}
        return _stamp(out, "server_ts", now)

    wait = wait_public(wait_row, now=now)
    _wait_progress(s, wait_row.task_id, user.user_id, event="stop", wait=wait, ts=wait_row.ended_at or now)
    s.flush()
    out = {
        "ok": True,
        "stopped": True,
        "wait": wait,
        "active": False,
        "minutes": wait["minutes"],
        "reason": wait["reason"],
        "reason_label": wait["reason_label"],
        "message": f"{wait['reason_label']} ended after {wait['minutes']:g} min "
                   f"({wait['started_at_gmt']} - {wait['ended_at_gmt']} GMT), recorded as explained waiting.",
    }
    return _stamp(out, "server_ts", now)


@router.get("/waiting")
def get_waiting(operator_id: str | None = Query(default=None, description="admin/supervisor read"),
                user: UserRow = Depends(current_user),
                s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Today's declared waiting: total minutes, the split by reason, every period and the open one.

    The numbers a supervisor sees are the same ones the operator sees, with the operator's own
    reason attached - this is explained idle time, shown, not hidden.
    """
    target = _scoped_operator(s, user, operator_id)
    now = _now()
    day_start, _day_end = _day_bounds(now)
    summary = wait_summary(s, target.user_id, since_ts=day_start, until_ts=now)
    out: dict[str, Any] = {
        "operator_id": target.user_id,
        "viewer": {"user_id": user.user_id, "role": user.role, "self": target.user_id == user.user_id},
        "reasons": reason_options(),
        "note": "explained waiting time, not counted as operator idle time",
        **summary,
    }
    return _stamp(out, "server_ts", now)


@router.get("/training")
def get_training(user: UserRow = Depends(current_user), s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Training library ordered by `order_index` and grouped by category, with this operator's progress.

    Every entry carries its DEMO `label`; a null `url` means the UI shows its placeholder player
    rather than pretending a video exists. Each entry also carries a `progress` block for the signed-in
    operator — `not_started` where they have never opened it, never a guess.
    """
    rows = (s.query(TrainingVideoRow)
            .order_by(TrainingVideoRow.order_index, TrainingVideoRow.title).all())
    progress_rows = training.progress_by_video(s, user.user_id)
    items = [training.item_dict(row, progress_rows.get(row.video_id)) for row in rows]
    videos = [{**_video_dict(row), "progress": _training_progress(item)}
              for row, item in zip(rows, items)]
    categories: list[dict[str, Any]] = []
    index: dict[str, dict[str, Any]] = {}
    for video in videos:
        group = index.get(video["category"])
        if group is None:
            group = {"category": video["category"], "videos": []}
            index[video["category"]] = group
            categories.append(group)
        group["videos"].append(video)
    out: dict[str, Any] = {
        "videos": videos,
        "categories": categories,
        "count": len(videos),
        "empty": not videos,
        "summary": training.summarise(items),
        "placeholder_note": "DEMO placeholder content - not official Caterpillar training material",
    }
    return _stamp(out, "server_ts", _now())


@router.get("/training/profile")
def get_training_profile(operator_id: str | None = Query(default=None,
                                                         description="admin/supervisor read of one operator"),
                         user: UserRow = Depends(current_user),
                         s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """This operator's training profile: every item with their status, plus totals by category.

    Self-scoped like the rest of `/tc/op`: no `operator_id` means "me", and reading somebody else's
    profile goes through the shared guard (admin: anyone; supervisor: their own operators).
    Completing content is not the same as being assessed on it, and the payload says so in `note`.
    """
    target = _scoped_operator(s, user, operator_id)
    out = training.profile(s, target.user_id)
    out["viewer"] = {"user_id": user.user_id, "role": user.role, "self": target.user_id == user.user_id}
    return out


@router.post("/training/{video_id}/progress")
def post_training_progress(video_id: str, body: TrainingProgressBody,
                           user: UserRow = Depends(current_user),
                           s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Record how far the signed-in operator has got through one training item.

    Always acts as the caller — an operator records their own progress and nobody else's. `percent`
    is clamped to 0-100 and never goes backwards, so replaying or seeking back cannot take away
    progress already earned; `completed: true` finishes the item outright. The response says whether
    the value was `clamped`, whether the request `regressed` below what was stored, and whether this
    call is what completed the item.
    """
    try:
        result = training.record_progress(s, user.user_id, video_id,
                                          percent=body.percent, completed=body.completed)
    except KeyError:
        raise HTTPException(404, f"training item {video_id!r} not found")
    out: dict[str, Any] = {"ok": True, **result, "summary": training.profile(s, user.user_id)["summary"]}
    return _stamp(out, "server_ts", _now())


@router.get("/notifications")
def get_notifications(operator_id: str | None = Query(default=None),
                      limit: int = Query(default=50, ge=1, le=200),
                      unread_only: bool = Query(default=False),
                      mark_read: bool = Query(default=False,
                                              description="mark the returned notifications read"),
                      user: UserRow = Depends(current_user),
                      s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """This operator's notifications, newest first, with unread / unacknowledged flags.

    Reading is not acknowledging: `mark_read` only clears the unread badge, while an alarm stays
    active until it is explicitly acknowledged. A supervisor or admin reading someone else's list
    never marks it read.
    """
    target = _scoped_operator(s, user, operator_id)
    now = _now()
    q = s.query(NotificationRow).filter(NotificationRow.user_id == target.user_id)
    if unread_only:
        q = q.filter(NotificationRow.read_at.is_(None))
    rows = q.order_by(NotificationRow.ts.desc(), NotificationRow.notification_id.desc()).limit(limit).all()

    if mark_read and target.user_id == user.user_id:
        for row in rows:
            if row.read_at is None:
                row.read_at = now
        s.flush()

    unread = s.query(NotificationRow.notification_id).filter(
        NotificationRow.user_id == target.user_id, NotificationRow.read_at.is_(None)).count()
    unacknowledged = s.query(NotificationRow.notification_id).filter(
        NotificationRow.user_id == target.user_id, NotificationRow.acknowledged_at.is_(None)).count()
    alarm = _active_alarm(s, target.user_id)
    out: dict[str, Any] = {
        "operator_id": target.user_id,
        "notifications": [_notification_dict(n) for n in rows],
        "count": len(rows),
        "unread": unread,
        "unacknowledged": unacknowledged,
        "alarm": _notification_dict(alarm) if alarm is not None else None,
    }
    return _stamp(out, "server_ts", now)


@router.post("/notifications/{notification_id}/ack")
def post_ack(notification_id: str, user: UserRow = Depends(current_user),
             s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Acknowledge a notification — this is what clears the operator's critical alarm banner.

    When the notification is an incident alarm the acknowledgement is also recorded on the incident
    (first acknowledgement wins, so a later tap never rewrites who responded).
    """
    n = s.get(NotificationRow, notification_id)
    if n is None or n.user_id != user.user_id:
        raise HTTPException(404, f"notification {notification_id!r} not found")

    now = _now()
    already = n.acknowledged_at is not None
    if not already:
        n.acknowledged_at = now
    if n.read_at is None:
        n.read_at = now

    incident_out: dict[str, Any] | None = None
    if n.incident_id:
        incident = s.get(TcIncidentRow, n.incident_id)
        if incident is not None:
            if incident.acknowledged_at is None:
                incident.acknowledged_by = user.user_id
                incident.acknowledged_at = now
            incident_out = {"incident_id": incident.incident_id, "machine_id": incident.machine_id,
                            "kind": incident.kind, "severity": incident.severity,
                            "acknowledged_by": incident.acknowledged_by}
            _stamp(incident_out, "acknowledged_at", incident.acknowledged_at)
    s.flush()

    alarm = _active_alarm(s, user.user_id)
    out: dict[str, Any] = {
        "ok": True,
        "already_acknowledged": already,
        "notification": _notification_dict(n),
        "incident": incident_out,
        "alarm": _notification_dict(alarm) if alarm is not None else None,
        "alarm_cleared": alarm is None,
    }
    return _stamp(out, "server_ts", now)


# ---------------------------------------------------------------- work-schedule fatigue risk
@router.get("/fatigue-risk")
def get_fatigue_risk(operator_id: str | None = Query(default=None,
                                                    description="admin/supervisor read of one operator"),
                     s: Session = Depends(get_tc_session),
                     user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """**Your own** work-schedule fatigue-risk estimate — the same payload the supervisor sees.

    Nobody is assessed behind their back: if an estimate about a person exists, that person can read
    it, with every input, weight and threshold that produced it and the caveats attached. It is an
    exposure estimate from recorded hours, breaks, shift timing and consecutive days — **not** a
    measurement or detection of anyone's fatigue (``docs/sections/06-fatigue.md``).

    `?operator_id=` follows the usual scope rule (admin: anyone, supervisor: their own operators,
    operator: only themselves), so a supervisor can open it from the operator's own view.
    """
    target = _scoped_operator(s, user, operator_id)
    return fatigue.fatigue_risk(s, target.user_id)


# ---------------------------------------------------------------- proximity flags: acknowledge / dispute
#: What an operator may answer to a proximity flag. Both are recorded; neither closes the flag.
FLAG_RESPONSES: tuple[str, ...] = ("acknowledged", "disputed")

FLAG_RECORD_NOTE = (
    "Your answer is appended to the flag's history and sent to your supervisor. It never overwrites "
    "the original event, the evidence or the times they were recorded. A dispute is kept in your own "
    "words and shown to your supervisor beside the evidence — it is your account of what happened, "
    "not a veto, and it is not ignored either.")


class FlagResponseBody(BaseModel):
    """The operator's answer to a proximity flag.

    A dispute must carry a `comment` (400 otherwise) — the same rule as a FAIL on the pre-start
    checklist. "That is wrong" with nothing behind it cannot be acted on by a supervisor, and the
    point of the dispute is that the operator's own account becomes part of the record.
    """
    response: Literal["acknowledged", "disputed"]
    comment: str = Field(default="", max_length=2000)


def _flag_tickets(s: Session, operator_id: str) -> list[TicketRow]:
    """Proximity flags raised against this operator, newest first."""
    return (s.query(TicketRow)
            .filter(TicketRow.kind == KIND_PROXIMITY_FLAG, TicketRow.subject_user_id == operator_id)
            .order_by(TicketRow.created_at.desc()).all())


def _flag_decisions(s: Session, ticket_ids: Iterable[str]) -> dict[str, list[ReviewDecisionRow]]:
    """Every recorded decision per flag, oldest first — the append-only history, never a latest-wins."""
    ids = list(ticket_ids)
    out: dict[str, list[ReviewDecisionRow]] = {ticket_id: [] for ticket_id in ids}
    if not ids:
        return out
    rows = (s.query(ReviewDecisionRow).filter(ReviewDecisionRow.ticket_id.in_(ids))
            .order_by(ReviewDecisionRow.ts, ReviewDecisionRow.id).all())
    for row in rows:
        out.setdefault(row.ticket_id, []).append(row)
    return out


def _decision_dict(row: ReviewDecisionRow) -> dict[str, Any]:
    """One recorded decision, with its reviewer and their comment exactly as it was written."""
    out: dict[str, Any] = {"id": row.id, "ticket_id": row.ticket_id, "reviewer_id": row.reviewer_id,
                           "reviewer_role": row.reviewer_role, "decision": row.decision,
                           "comment": row.comment, "data": row.data or {}}
    return _stamp(out, "ts", row.ts)


def _flag_notification(s: Session, operator_id: str, ticket_id: str) -> NotificationRow | None:
    """The prompt this operator was sent for this flag, if one was."""
    return (s.query(NotificationRow)
            .filter(NotificationRow.user_id == operator_id, NotificationRow.ticket_id == ticket_id)
            .order_by(NotificationRow.ts.desc()).first())


def _flag_dict(s: Session, ticket: TicketRow, decisions: list[ReviewDecisionRow],
               operator_id: str) -> dict[str, Any]:
    """One flag as the operator sees it: the evidence, their own answers, and what they may answer."""
    mine = [d for d in decisions if d.reviewer_id == operator_id and d.decision in FLAG_RESPONSES]
    notification = _flag_notification(s, operator_id, ticket.ticket_id)
    incident = s.get(TcIncidentRow, ticket.incident_id) if ticket.incident_id else None
    out: dict[str, Any] = {
        "ticket_id": ticket.ticket_id,
        "kind": ticket.kind,
        "severity": ticket.severity,
        "status": ticket.status,
        "title": ticket.title,
        "detail": ticket.detail,
        "source": ticket.source,
        "machine_id": ticket.machine_id,
        "incident_id": ticket.incident_id,
        "evidence": ticket.evidence or {},
        "awaiting_response": not mine,
        "your_response": mine[-1].decision if mine else None,
        "your_comment": mine[-1].comment if mine else None,
        "responses": [_decision_dict(d) for d in decisions],
        "response_options": [
            {"response": "acknowledged", "label": "Yes, somebody was close", "comment_required": False},
            {"response": "disputed", "label": "No, this is wrong", "comment_required": True},
        ],
        "notification_id": None if notification is None else notification.notification_id,
        "incident": None if incident is None else {
            "incident_id": incident.incident_id, "machine_id": incident.machine_id,
            "kind": incident.kind, "severity": incident.severity, "detail": incident.detail,
            "source": incident.source, "dispatch_status": incident.dispatch_status,
            "ts": incident.ts, "ts_gmt": _gmt(incident.ts)},
        "note": FLAG_RECORD_NOTE,
    }
    return _stamp(out, "created_at", ticket.created_at)


@router.get("/flags")
def get_flags(operator_id: str | None = Query(default=None, description="admin/supervisor read"),
              include_answered: bool = Query(default=False,
                                             description="also return flags already answered"),
              user: UserRow = Depends(current_user),
              s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Proximity flags waiting for this operator to confirm or dispute.

    A person-near-machine flag is a statement about somebody's work made by a detector that cannot see
    why anybody was there, so the operator gets the first word. By default only flags they have not
    answered are returned; `include_answered=true` returns all of them with the answer they gave.
    """
    now = _now()
    target = _scoped_operator(s, user, operator_id)
    tickets = _flag_tickets(s, target.user_id)
    decisions = _flag_decisions(s, [t.ticket_id for t in tickets])
    flags = [_flag_dict(s, t, decisions[t.ticket_id], target.user_id) for t in tickets]
    awaiting = [f for f in flags if f["awaiting_response"]]
    shown = flags if include_answered else awaiting
    out: dict[str, Any] = {
        "operator_id": target.user_id,
        "flags": shown,
        "count": len(shown),
        "awaiting": len(awaiting),
        "total": len(flags),
        "include_answered": include_answered,
        "note": FLAG_RECORD_NOTE,
    }
    return _stamp(out, "server_ts", now)


def _flag_watchers(s: Session, ticket: TicketRow, operator: UserRow) -> list[str]:
    """Who hears the answer: the flag's owner, else their supervisor, else the site's supervisors."""
    for user_id in (ticket.owner_user_id, operator.supervisor_id):
        if user_id and s.get(UserRow, user_id) is not None:
            return [user_id]
    rows = (s.query(UserRow).filter(UserRow.role == "supervisor", UserRow.active.is_(True),
                                    UserRow.site_id == operator.site_id)
            .order_by(UserRow.user_id).all())
    return [u.user_id for u in rows]


@router.post("/flags/{ticket_id}/respond")
def post_flag_response(ticket_id: str, body: FlagResponseBody, user: UserRow = Depends(current_user),
                       s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Record the operator's acknowledgement or dispute of a proximity flag, and tell the supervisor.

    The answer is **appended** as a `tc_review_decision` row with `reviewer_role="operator"`. The
    incident, the ticket's evidence, its severity and its timestamps are never rewritten, and the flag
    stays open for the supervisor either way: a dispute is the operator's account, not a veto, and an
    acknowledgement is not an admission of fault. The supervisor is notified on both answers, with a
    dispute quoted verbatim so it reaches them next to the evidence rather than as a status change.

    404 when the flag is not this operator's; 400 for a dispute with no comment.
    """
    now = _now()
    ticket = s.get(TicketRow, ticket_id)
    if ticket is None or ticket.kind != KIND_PROXIMITY_FLAG or ticket.subject_user_id != user.user_id:
        raise HTTPException(404, f"flag {ticket_id!r} not found")
    comment = (body.comment or "").strip()
    if body.response == "disputed" and not comment:
        raise HTTPException(400, "a dispute needs a comment saying what actually happened; it is kept "
                                 "verbatim and shown to your supervisor with the evidence")

    decision = ReviewDecisionRow(
        ticket_id=ticket.ticket_id, reviewer_id=user.user_id, reviewer_role="operator",
        decision=body.response, comment=comment, ts=now,
        data={"incident_id": ticket.incident_id, "machine_id": ticket.machine_id,
              "response": body.response, "verbatim": True,
              "ticket_status_unchanged": ticket.status, "note": FLAG_RECORD_NOTE})
    s.add(decision)

    notification = _flag_notification(s, user.user_id, ticket.ticket_id)
    if notification is not None:
        if notification.read_at is None:
            notification.read_at = now
        if notification.acknowledged_at is None:
            notification.acknowledged_at = now
    s.flush()

    watchers = _flag_watchers(s, ticket, user)
    headline = ("confirmed the proximity flag" if body.response == "acknowledged"
                else "disputes the proximity flag")
    quoted = f" They wrote, in their words: {comment}" if comment else ""
    for watcher_id in watchers:
        notify(s, watcher_id, kind=KIND_PROXIMITY_FLAG,
               severity="warning" if body.response == "disputed" else "info",
               title=f"{user.name} {headline}: {ticket.machine_id or 'machine'}",
               body=(f"{user.name} {headline} on {ticket.machine_id or 'the machine'}.{quoted} "
                     f"The original event and its evidence are unchanged and the flag is still open "
                     f"for your review. {FLAG_RECORD_NOTE}"),
               link="/tc/sup", ticket_id=ticket.ticket_id, incident_id=ticket.incident_id)

    decisions = _flag_decisions(s, [ticket.ticket_id])[ticket.ticket_id]
    out: dict[str, Any] = {
        "ok": True,
        "response": body.response,
        "flag": _flag_dict(s, ticket, decisions, user.user_id),
        "decision": _decision_dict(decision),
        "notified_user_ids": watchers,
        "notification": None if notification is None else _notification_dict(notification),
        "evidence_unchanged": True,
        "status_unchanged": ticket.status,
        "note": FLAG_RECORD_NOTE,
    }
    return _stamp(out, "server_ts", now)
