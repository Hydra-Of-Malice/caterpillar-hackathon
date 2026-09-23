"""Operator efficiency from recorded facts: counts, timings and their evidence — never a score.

This module is the answer to "how are my operators working?" that we are willing to ship. Per-person
performance monitoring is the highest-risk feature in the product (docs/sections/14-critical-risks.md
§4: EU AI Act Annex III(4)(b) treats worker monitoring as high-risk; the ILO code says monitoring
data must not be the sole basis of a performance evaluation), so the design constraints are part of
the feature, not decoration:

* **Declared waiting is subtracted, not charged.** A haul truck that did not arrive is the site's
  problem. Every :class:`WaitPeriodRow` minute that overlaps a task is removed from that task's
  working time and reported separately in ``waiting``, with its reasons.
* **A dismissed AI flag never counts against anybody.** Confirmed, dismissed and still-unreviewed
  flags are counted separately and the unreviewed ones are labelled unreviewed. An observation a
  human has not looked at is not a finding.
* **Facts, not a ranking.** There is no composite score and no leaderboard: ``composite_score`` is
  deliberately ``None``, and :func:`team_efficiency` orders by name and says so in the payload.
* **Every number carries its raw counts** in ``evidence`` so a supervisor can open the tasks and
  tickets behind it, and ``caveats`` names the limits of what is on screen.

Read-only: nothing here writes a row.
"""
from __future__ import annotations

import statistics
import time
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.taskcentre_models import (
    CheckpointRow,
    TaskChecklistResultRow,
    TaskProgressRow,
    TcTaskRow,
    TicketRow,
    UserRow,
    WaitPeriodRow,
)
from sentinel.taskcentre.service import gmt_iso, user_public

__all__ = ["operator_efficiency", "team_efficiency", "DEFAULT_DAYS", "SMALL_SAMPLE"]

DAY_S = 86_400.0
DEFAULT_DAYS = 7
#: Below this many completed tasks, percentages are noise; the caveat says so out loud.
SMALL_SAMPLE = 5

KIND_IDLE = "ai_idle"
KIND_OVERRUN = "task_overrun"
KIND_GEOFENCE = "geofence_punch"

ORDERING = "name (no ranking)"
NO_SCORE_NOTE = ("No single efficiency score is produced. These are counts and timings with the "
                 "tasks and tickets behind them, for a conversation — not a ranking.")


def _now() -> float:
    return time.time()


def _stamp(out: dict[str, Any], key: str, ts: float | None) -> dict[str, Any]:
    out[key] = ts
    out[f"{key}_gmt"] = gmt_iso(ts)
    return out


def _minutes(seconds: float) -> float:
    return round(seconds / 60.0, 1)


def _overlap_s(a0: float, a1: float, b0: float, b1: float) -> float:
    """Seconds shared by two intervals (0 when they do not touch)."""
    return max(0.0, min(a1, b1) - max(a0, b0))


# ---------------------------------------------------------------- window
def _window(since_ts: float, until_ts: float | None) -> dict[str, Any]:
    until = _now() if until_ts is None else float(until_ts)
    out: dict[str, Any] = {"days": round(max(0.0, until - since_ts) / DAY_S, 2)}
    _stamp(out, "since_ts", float(since_ts))
    return _stamp(out, "until_ts", until)


# ---------------------------------------------------------------- tasks
def _tasks_in_window(s: Session, user_id: str, since: float, until: float) -> list[TcTaskRow]:
    """Tasks that were scheduled, started or finished inside the window.

    A task that spans the window edge is kept when any of its three timestamps lands inside it, so a
    long job is not silently dropped from both the week it started and the week it finished.
    """
    rows = s.scalars(select(TcTaskRow).where(TcTaskRow.operator_id == user_id)
                     .order_by(TcTaskRow.start_ts, TcTaskRow.task_id))
    keep: list[TcTaskRow] = []
    for task in rows:
        stamps = [task.start_ts, task.started_at, task.finished_at]
        if any(ts is not None and since <= ts < until for ts in stamps):
            keep.append(task)
    return keep


def _wait_periods(s: Session, user_id: str, since: float, until: float) -> list[WaitPeriodRow]:
    """Declared waiting that overlaps the window. An open period is measured up to ``until``."""
    rows = s.scalars(select(WaitPeriodRow).where(WaitPeriodRow.user_id == user_id)
                     .order_by(WaitPeriodRow.started_at, WaitPeriodRow.wait_id))
    return [w for w in rows
            if w.started_at < until and (w.ended_at is None or w.ended_at > since)]


def _wait_end(wait: WaitPeriodRow, until: float) -> float:
    """An open wait is still running: it is measured to the end of the window, never to zero."""
    return until if wait.ended_at is None else float(wait.ended_at)


def _waiting_block(waits: list[WaitPeriodRow], since: float, until: float) -> dict[str, Any]:
    """Declared waiting inside the window, total and by reason. Reported, never charged."""
    by_reason: dict[str, float] = {}
    total = 0.0
    for wait in waits:
        seconds = _overlap_s(wait.started_at, _wait_end(wait, until), since, until)
        total += seconds
        by_reason[wait.reason] = by_reason.get(wait.reason, 0.0) + seconds
    return {
        "declared_minutes": _minutes(total),
        "by_reason": {reason: _minutes(sec) for reason, sec in sorted(by_reason.items())},
        "periods": len(waits),
        "open_periods": sum(1 for w in waits if w.ended_at is None),
        "note": ("Operator-declared waiting (e.g. no truck on the face). Subtracted from working "
                 "time and never counted against the operator."),
    }


def _waiting_inside(waits: list[WaitPeriodRow], start: float, end: float, until: float) -> float:
    """Seconds of declared waiting that fall inside one task's actual run."""
    return sum(_overlap_s(w.started_at, _wait_end(w, until), start, end) for w in waits)


def _duration_block(tasks: list[TcTaskRow], waits: list[WaitPeriodRow],
                    until: float) -> tuple[dict[str, Any], float]:
    """Working time over the *completed* tasks, with declared waiting removed from every one.

    A task still running has no duration yet, so it contributes nothing here — that is stated in the
    caveats rather than guessed at. ``planned_vs_actual_minutes`` is actual minus planned: positive
    means the work took longer than the plan allowed for, which is a fact about the plan as much as
    about the operator.
    """
    per_task: list[float] = []
    planned_s = 0.0
    actual_s = 0.0
    excluded_s = 0.0
    for task in tasks:
        if task.status != "completed" or task.started_at is None or task.finished_at is None:
            continue
        gross = max(0.0, task.finished_at - task.started_at)
        waited = min(gross, _waiting_inside(waits, task.started_at, task.finished_at, until))
        excluded_s += waited
        net = gross - waited
        per_task.append(net)
        actual_s += net
        planned_s += max(0.0, task.expected_finish_ts - task.start_ts)

    out = {
        "median_minutes": _minutes(statistics.median(per_task)) if per_task else None,
        "planned_vs_actual_minutes": _minutes(actual_s - planned_s) if per_task else None,
        "total_working_minutes": _minutes(actual_s),
        "planned_minutes": _minutes(planned_s),
        "actual_minutes": _minutes(actual_s),
        "gross_minutes": _minutes(actual_s + excluded_s),
        "waiting_minutes_excluded": _minutes(excluded_s),
        "tasks_measured": len(per_task),
        "note": ("Working time = finish - start, minus declared waiting. Only completed tasks are "
                 "measured; a task still running has no duration yet."),
    }
    return out, excluded_s


# ---------------------------------------------------------------- checkpoints & checklist
def _checkpoint_block(s: Session, task_ids: list[str]) -> dict[str, Any]:
    """Required checkpoints met, and how many completions a supervisor had to authorise instead."""
    if not task_ids:
        return {"required_total": 0, "completed": 0, "exception_resolved": 0, "percent": None}
    rows = list(s.scalars(select(CheckpointRow).where(CheckpointRow.task_id.in_(task_ids))))
    required = [c for c in rows if c.required]
    done = sum(1 for c in required if c.done >= c.target)
    resolved = len(set(s.scalars(select(TaskProgressRow.task_id).where(
        TaskProgressRow.task_id.in_(task_ids), TaskProgressRow.kind == "exception_resolved"))))
    return {
        "required_total": len(required),
        "completed": done,
        "exception_resolved": resolved,
        "percent": round(100.0 * done / len(required), 1) if required else None,
    }


def _checklist_block(s: Session, task_ids: list[str]) -> dict[str, Any]:
    """Pre-start inspections answered, and critical FAILs — a FAIL is a machine fact, not a slight."""
    if not task_ids:
        return {"tasks_with_check": 0, "critical_fails": 0, "fails": 0, "answers": 0}
    rows = list(s.scalars(select(TaskChecklistResultRow)
                          .where(TaskChecklistResultRow.task_id.in_(task_ids))))
    fails = [r for r in rows if r.result == "fail"]
    return {
        "tasks_with_check": len({r.task_id for r in rows}),
        "critical_fails": sum(1 for r in fails if r.critical),
        "fails": len(fails),
        "answers": len(rows),
        "note": "A critical FAIL stops the task by design; it is a machine condition, not a mark against the operator.",
    }


# ---------------------------------------------------------------- flags
def _flag_block(s: Session, user_id: str, since: float, until: float) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """AI and rule flags raised about this person in the window, split by what a human decided.

    ``ai_idle_open`` is the count nobody has reviewed yet. It is labelled unreviewed and is never
    presented as a confirmed problem; ``ai_idle_dismissed`` is kept visible precisely so the record
    shows the flag was wrong.
    """
    rows = list(s.scalars(select(TicketRow).where(
        TicketRow.subject_user_id == user_id, TicketRow.created_at >= since,
        TicketRow.created_at < until).order_by(TicketRow.created_at)))
    idle = [t for t in rows if t.kind == KIND_IDLE]
    overruns = [t for t in rows if t.kind == KIND_OVERRUN]
    geofence = [t for t in rows if t.kind == KIND_GEOFENCE]
    open_idle = [t for t in idle if t.status == "open"]
    dismissed = [t for t in idle if t.status == "dismissed"]
    confirmed = [t for t in idle if t.status == "confirmed"]

    block = {
        "ai_idle_open": len(open_idle),
        "ai_idle_dismissed": len(dismissed),
        "ai_idle_confirmed": len(confirmed),
        "ai_idle_total": len(idle),
        "overruns": len(overruns),
        "overruns_dismissed": sum(1 for t in overruns if t.status == "dismissed"),
        "geofence": len(geofence),
        "geofence_dismissed": sum(1 for t in geofence if t.status == "dismissed"),
        "unreviewed": len(open_idle) + sum(1 for t in overruns + geofence if t.status == "open"),
        "unreviewed_label": "unreviewed - an observation nobody has checked yet, not a finding",
        "dismissed_note": "Dismissed flags are shown for the record and never count against the operator.",
    }
    evidence = {
        "ai_idle_open_ticket_ids": [t.ticket_id for t in open_idle],
        "ai_idle_dismissed_ticket_ids": [t.ticket_id for t in dismissed],
        "ai_idle_confirmed_ticket_ids": [t.ticket_id for t in confirmed],
        "overrun_ticket_ids": [t.ticket_id for t in overruns],
        "geofence_ticket_ids": [t.ticket_id for t in geofence],
    }
    return block, evidence


# ---------------------------------------------------------------- caveats
def _caveats(*, completed: int, waiting_minutes: float, unreviewed: int, dismissed: int,
             measured: int, ongoing: int) -> list[str]:
    """The limits of what is on the screen, in the payload so the UI cannot drop them silently."""
    out = [
        "Task mix differs between operators and between weeks; these counts are not like-for-like.",
        "Observed behaviour only. This is not a competency assessment and must not be read as one.",
    ]
    if completed < SMALL_SAMPLE:
        out.insert(0, f"Small sample: {completed} completed task(s) in this window; one task moves "
                      f"every percentage a long way.")
    if waiting_minutes > 0:
        out.append(f"{waiting_minutes:g} min of operator-declared waiting is excluded from working "
                   f"time and shown separately; it is not counted against the operator.")
    else:
        out.append("No waiting was declared in this window; declared waiting would be excluded from "
                   "working time.")
    if unreviewed:
        out.append(f"{unreviewed} flag(s) are unreviewed: nobody has checked them, so they are "
                   f"observations, not findings.")
    if dismissed:
        out.append(f"{dismissed} AI idle flag(s) were dismissed on review and do not count against "
                   f"the operator.")
    if ongoing:
        out.append(f"{ongoing} task(s) are still running and contribute no duration yet.")
    if not measured:
        out.append("No completed task had both a start and a finish time, so no duration could be "
                   "measured.")
    return out


# ---------------------------------------------------------------- one operator
def operator_efficiency(s: Session, user_id: str, *, since_ts: float,
                        until_ts: float | None = None) -> dict[str, Any]:
    """Objective work facts for one operator over a window, with the evidence behind every number.

    Nothing here is a judgement: ``tasks`` are counts, ``duration`` is clock arithmetic with declared
    waiting removed, ``flags`` are split by what a human decided about them, and ``composite_score``
    is ``None`` on purpose. Whether a number is good is the supervisor's call, made with the operator.
    """
    window = _window(since_ts, until_ts)
    since, until = window["since_ts"], window["until_ts"]
    user = s.get(UserRow, user_id)

    tasks = _tasks_in_window(s, user_id, since, until)
    live = [t for t in tasks if t.status != "cancelled"]
    completed = [t for t in live if t.status == "completed"]
    on_time = [t for t in completed if t.finished_at is not None and t.finished_at <= t.expected_finish_ts]
    late = [t for t in completed if t.finished_at is not None and t.finished_at > t.expected_finish_ts]
    ongoing = [t for t in live if t.status == "ongoing"]
    pending = [t for t in live if t.status == "pending"]

    waits = _wait_periods(s, user_id, since, until)
    waiting = _waiting_block(waits, since, until)
    duration, _excluded_s = _duration_block(live, waits, until)
    task_ids = [t.task_id for t in live]
    flags, flag_evidence = _flag_block(s, user_id, since, until)

    out: dict[str, Any] = {
        "operator": user_public(user) if user is not None else {"user_id": user_id},
        "window": window,
        "tasks": {
            "assigned": len(live),
            "completed": len(completed),
            "completed_on_time": len(on_time),
            "completed_late": len(late),
            "ongoing": len(ongoing),
            "pending": len(pending),
            "cancelled": len(tasks) - len(live),
        },
        "on_time_rate": round(len(on_time) / len(completed), 3) if completed else None,
        "on_time_rate_inputs": {"completed_on_time": len(on_time), "completed": len(completed)},
        "duration": duration,
        "waiting": waiting,
        "checkpoints": _checkpoint_block(s, task_ids),
        "checklist": _checklist_block(s, task_ids),
        "flags": flags,
        "evidence": {
            "task_ids": task_ids,
            "completed_task_ids": [t.task_id for t in completed],
            "on_time_task_ids": [t.task_id for t in on_time],
            "late_task_ids": [t.task_id for t in late],
            "ongoing_task_ids": [t.task_id for t in ongoing],
            "pending_task_ids": [t.task_id for t in pending],
            "wait_ids": [w.wait_id for w in waits],
            **flag_evidence,
        },
        "composite_score": None,
        "ranked": False,
        "note": NO_SCORE_NOTE,
        "caveats": _caveats(completed=len(completed), waiting_minutes=waiting["declared_minutes"],
                            unreviewed=flags["unreviewed"], dismissed=flags["ai_idle_dismissed"],
                            measured=duration["tasks_measured"], ongoing=len(ongoing)),
    }
    return _stamp(out, "generated_at", _now())


# ---------------------------------------------------------------- one team
def _team_ids(s: Session, supervisor_id: str, operator_ids: Iterable[str] | None) -> list[str]:
    """The operators in scope, name-ordered. ``operator_ids`` lets an admin pass a wider set."""
    q = select(UserRow).where(UserRow.role == "operator")
    q = (q.where(UserRow.user_id.in_(list(operator_ids))) if operator_ids is not None
         else q.where(UserRow.supervisor_id == supervisor_id))
    return [u.user_id for u in s.scalars(q.order_by(UserRow.name, UserRow.user_id))]


def team_efficiency(s: Session, supervisor_id: str, *, since_ts: float,
                    until_ts: float | None = None,
                    operator_ids: Iterable[str] | None = None) -> dict[str, Any]:
    """Every operator in the caller's scope over one window, **ordered by name — never ranked**.

    There is no best-to-worst sort, no rank column and no team score, because a leaderboard is the
    fastest way to turn this into the surveillance tool we said we would not build (14 §4). Rows
    carry the same facts and caveats as the single-operator view, so a supervisor always reads a
    number next to what it is made of.
    """
    window = _window(since_ts, until_ts)
    rows = [operator_efficiency(s, uid, since_ts=window["since_ts"], until_ts=window["until_ts"])
            for uid in _team_ids(s, supervisor_id, operator_ids)]

    totals = {
        "operators": len(rows),
        "assigned": sum(r["tasks"]["assigned"] for r in rows),
        "completed": sum(r["tasks"]["completed"] for r in rows),
        "completed_on_time": sum(r["tasks"]["completed_on_time"] for r in rows),
        "completed_late": sum(r["tasks"]["completed_late"] for r in rows),
        "ongoing": sum(r["tasks"]["ongoing"] for r in rows),
        "pending": sum(r["tasks"]["pending"] for r in rows),
        "working_minutes": round(sum(r["duration"]["total_working_minutes"] for r in rows), 1),
        "waiting_minutes_declared": round(sum(r["waiting"]["declared_minutes"] for r in rows), 1),
        "ai_idle_open": sum(r["flags"]["ai_idle_open"] for r in rows),
        "ai_idle_dismissed": sum(r["flags"]["ai_idle_dismissed"] for r in rows),
        "ai_idle_confirmed": sum(r["flags"]["ai_idle_confirmed"] for r in rows),
        "overruns": sum(r["flags"]["overruns"] for r in rows),
        "geofence": sum(r["flags"]["geofence"] for r in rows),
    }
    completed = totals["completed"]
    totals["on_time_rate"] = round(totals["completed_on_time"] / completed, 3) if completed else None

    by_reason: dict[str, float] = {}
    for row in rows:
        for reason, minutes in row["waiting"]["by_reason"].items():
            by_reason[reason] = round(by_reason.get(reason, 0.0) + minutes, 1)

    out: dict[str, Any] = {
        "supervisor_id": supervisor_id,
        "window": window,
        "ordering": ORDERING,
        "ranked": False,
        "composite_score": None,
        "operators": rows,
        "totals": totals,
        "waiting_by_reason": by_reason,
        "note": NO_SCORE_NOTE,
        "caveats": [
            "Rows are ordered by name. There is no ranking, no score and no leaderboard.",
            "Operators carry different task mixes, machines and shifts; the rows are not comparable "
            "like for like.",
            "Declared waiting time is excluded from working time and reported separately.",
            "Unreviewed AI flags are observations, not findings; dismissed flags never count against "
            "an operator.",
            "Observed behaviour only. This is not a competency assessment.",
        ],
    }
    return _stamp(out, "generated_at", _now())
