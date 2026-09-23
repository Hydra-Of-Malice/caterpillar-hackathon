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
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from sentinel.taskcentre.auth import assert_can_view_operator, current_user, get_tc_session
from sentinel.taskcentre.service import gmt_iso, latest_location, location_public, notify, open_ticket, user_public
from sentinel.store.taskcentre_models import (
    ChatMessageRow,
    CheckpointRow,
    NotificationRow,
    PunchRow,
    SessionRow,
    TaskProgressRow,
    TcIncidentRow,
    TcTaskRow,
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
               *, now: float, exception_resolved: bool) -> dict[str, Any]:
    """One task with its checkpoints, progress trail and objective timing facts."""
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
    resolved = {tid for tid in ids
                if any(p.kind == "exception_resolved" for p in progress.get(tid, []))}
    return [_task_dict(t, checkpoints.get(t.task_id, []), progress.get(t.task_id, []),
                       now=now, exception_resolved=t.task_id in resolved) for t in tasks]


def _one_task_payload(s: Session, task: TcTaskRow, now: float) -> dict[str, Any]:
    checkpoints = _checkpoints_by_task(s, [task.task_id]).get(task.task_id, [])
    progress = _progress_by_task(s, [task.task_id]).get(task.task_id, [])
    return _task_dict(task, checkpoints, progress, now=now,
                      exception_resolved=_has_exception_resolved(s, task.task_id))


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


# ---------------------------------------------------------------- routes
@router.get("/today")
def get_today(operator_id: str | None = Query(default=None, description="admin/supervisor read of one operator"),
              user: UserRow = Depends(current_user),
              s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """The operator home payload: today's tasks, the ongoing one, sign-in / Start Work / geofence
    state, unread chat, notification counts and any active critical alarm.

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
        "unread_messages": unread_messages,
        "unread_notifications": unread_notifications,
        "unacknowledged_notifications": unacknowledged,
        "alarm": _notification_dict(alarm) if alarm is not None else None,
    }
    _stamp(out, "server_ts", now)
    _stamp(out, "day_start_ts", day_start)
    return _stamp(out, "day_end_ts", day_end)


@router.post("/tasks/{task_id}/start")
def post_start(task_id: str, user: UserRow = Depends(current_user),
               s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Begin a task: status `ongoing` + server `started_at`, recorded in the progress trail.

    409 when the task is already completed, or when another task is ongoing — an operator runs one
    task at a time. Starting an already-ongoing task is a no-op, so a double tap is harmless.
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

    task.status = "ongoing"
    task.started_at = now
    s.add(TaskProgressRow(task_id=task.task_id, user_id=user.user_id, ts=now, kind="status",
                          text="Task started", data={"status": "ongoing", "started_at": now,
                                                     "started_at_gmt": _gmt(now)}))
    s.flush()
    return {"ok": True, "started": True, "task": _one_task_payload(s, task, now),
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


@router.get("/training")
def get_training(user: UserRow = Depends(current_user), s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Training library ordered by `order_index` and grouped by category.

    Every entry carries its DEMO `label`; a null `url` means the UI shows its placeholder player
    rather than pretending a video exists.
    """
    rows = (s.query(TrainingVideoRow)
            .order_by(TrainingVideoRow.order_index, TrainingVideoRow.title).all())
    videos = [_video_dict(v) for v in rows]
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
        "placeholder_note": "DEMO placeholder content - not official Caterpillar training material",
    }
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
