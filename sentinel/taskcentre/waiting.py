"""Operator-declared waiting periods: idle time the operator explains *before* it is flagged.

Waiting for a haul truck is the job, not idling. The camera can only report that a machine has been
still; it cannot know why. So the operator gets a button - "Waiting for truck" - and the moment they
tap it the reason is recorded with the **server** clock. From then until they tap it again the time
is reported as explained waiting, and any camera observation overlapping that period is suppressed
by :func:`sentinel.taskcentre.brain.handle_camera_observation` instead of becoming an ``ai_idle``
ticket. The operator is not accused of idling for a truck that never arrived.

Two independent paths reach the same suppression, and both must keep working:

* the **observation** carries an explaining context (``waiting_for_truck``, ``machine_paused``,
  ``expected_delay``) - a detector that knows why the machine stopped says so;
* the **operator** declared a wait that overlaps the observation window - this module.

Nothing here hides time. A declared wait is stored as its own row (``tc_wait_period``), counted and
shown to the operator and their supervisor as *explained* idle with the reason attached, so the
minutes are auditable and a person can see who declared what, when. Rows are added and flushed but
never committed - the request-scoped session commits.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import WaitPeriodRow
from sentinel.taskcentre.service import gmt_iso

__all__ = ["REASONS", "REASON_LABELS", "DEFAULT_REASON", "reason_label", "reason_phrase",
           "reason_options", "start_wait", "stop_wait", "active_wait", "overlaps_wait",
           "wait_summary", "wait_public"]

#: The reasons an operator may declare. Deliberately the same three strings as
#: ``adapters.EXPLAINED_CONTEXTS``, so a declared wait and a detector-reported context mean exactly
#: the same thing to the brain, the tickets and the UI.
REASONS: tuple[str, ...] = ("waiting_for_truck", "machine_paused", "expected_delay")

#: Button / chip wording. The UI renders these, never the raw enum value.
REASON_LABELS: dict[str, str] = {
    "waiting_for_truck": "Waiting for a truck",
    "machine_paused": "Machine paused",
    "expected_delay": "Expected delay",
}

#: Sentence fragments, for "the operator reported ..." wording in a suppression explanation.
REASON_PHRASES: dict[str, str] = {
    "waiting_for_truck": "waiting for a truck",
    "machine_paused": "the machine was paused",
    "expected_delay": "an expected delay",
}

#: What the one-tap button declares when the operator does not pick a reason.
DEFAULT_REASON = "waiting_for_truck"


# ---------------------------------------------------------------- wording
def reason_label(reason: str) -> str:
    """Human label for a reason (``waiting_for_truck`` -> ``Waiting for a truck``).

    An unknown reason is humanised rather than dropped: a row that somehow carries one must still be
    readable in the UI, never rendered as a blank.
    """
    return REASON_LABELS.get(reason) or reason.replace("_", " ").capitalize()


def reason_phrase(reason: str) -> str:
    """Mid-sentence wording, e.g. ``the operator reported <phrase>``."""
    return REASON_PHRASES.get(reason) or reason.replace("_", " ")


def reason_options() -> list[dict[str, str]]:
    """``[{value, label}]`` for the operator's reason picker, in declaration order."""
    return [{"value": r, "label": reason_label(r)} for r in REASONS]


# ---------------------------------------------------------------- small helpers
def _now() -> float:
    """Server UTC seconds. A declared wait is timed by this clock, never the browser's.

    Deliberately the same call as ``routes_operator._now`` rather than ``time.time()``: on Windows
    the two differ by up to a timer tick, which is enough for a wait declared one request ago to look
    like it starts *after* the window that is reporting it.
    """
    return datetime.now(tz=timezone.utc).timestamp()


def _minutes(seconds: float) -> float:
    """Seconds -> minutes, one decimal, matching the rest of the Task Centre API."""
    return round(max(0.0, seconds) / 60.0, 1)


def _elapsed_s(row: WaitPeriodRow, now: float) -> float:
    """How long a period has run: to its end, or to ``now`` while it is still open."""
    end = row.ended_at if row.ended_at is not None else now
    return max(0.0, end - row.started_at)


# ---------------------------------------------------------------- serialisation
def wait_public(row: WaitPeriodRow, *, now: float | None = None) -> dict[str, Any]:
    """One wait period for the API: what was declared, by whom, when, and how long it has run."""
    now = _now() if now is None else now
    return {
        "wait_id": row.wait_id,
        "user_id": row.user_id,
        "task_id": row.task_id,
        "reason": row.reason,
        "reason_label": reason_label(row.reason),
        "note": row.note,
        "source": row.source,
        "active": row.ended_at is None,
        "minutes": _minutes(_elapsed_s(row, now)),
        "started_at": row.started_at,
        "started_at_gmt": gmt_iso(row.started_at),
        "ended_at": row.ended_at,
        "ended_at_gmt": gmt_iso(row.ended_at),
    }


# ---------------------------------------------------------------- lifecycle
def active_wait(s: Session, user_id: str) -> WaitPeriodRow | None:
    """This person's open wait period (``ended_at is None``), or ``None``.

    Newest first, so even if an older period were somehow left open the current declaration wins.
    """
    stmt = (select(WaitPeriodRow)
            .where(WaitPeriodRow.user_id == user_id, WaitPeriodRow.ended_at.is_(None))
            .order_by(WaitPeriodRow.started_at.desc(), WaitPeriodRow.wait_id.desc()).limit(1))
    return s.execute(stmt).scalars().first()


def start_wait(s: Session, user_id: str, *, reason: str = DEFAULT_REASON, task_id: str | None = None,
               note: str | None = None, source: str = "operator") -> WaitPeriodRow:
    """Declare a wait, timed from the server clock. Returns the period that is now open.

    **Idempotent**: when a period is already open for this person it is returned unchanged and no
    second one is started. A double tap on a phone, a retried request or two browser tabs must never
    fragment one wait into several - and must never let overlapping periods double-count the minutes.
    To change the reason, stop the wait and start a new one; the first period keeps its own reason.
    """
    if reason not in REASONS:
        raise ValueError(f"unknown wait reason {reason!r}; expected one of {', '.join(REASONS)}")
    open_period = active_wait(s, user_id)
    if open_period is not None:
        return open_period
    row = WaitPeriodRow(wait_id=new_id("wai"), user_id=user_id, task_id=task_id, reason=reason,
                        started_at=_now(), ended_at=None, note=note, source=source)
    s.add(row)
    s.flush()
    return row


def stop_wait(s: Session, user_id: str) -> WaitPeriodRow | None:
    """Close this person's open wait with the server clock, and return it.

    ``None`` when nothing was open - stopping a wait that never started is a no-op, not an error, so
    a stale UI or a repeated tap cannot wedge the operator.
    """
    row = active_wait(s, user_id)
    if row is None:
        return None
    row.ended_at = _now()
    s.flush()
    return row


# ---------------------------------------------------------------- the brain's question
def overlaps_wait(s: Session, user_id: str, start_ts: float, end_ts: float) -> WaitPeriodRow | None:
    """The declared wait covering any part of ``[start_ts, end_ts]``, or ``None``.

    This is what :func:`sentinel.taskcentre.brain.handle_camera_observation` asks before it flags a
    pause: *did this person already tell us why?* An open period is treated as running to now, so a
    wait declared before an observation still explains it while the truck has not arrived. Touching
    the window at all is enough - a 20 min stillness that includes a 5 min declared wait is not
    silently split into "explained" and "unexplained" halves by a machine; a supervisor can look at
    the periods and decide. The most recent overlapping period is returned, because that is the
    declaration the operator made about this moment.
    """
    if end_ts < start_ts:
        start_ts, end_ts = end_ts, start_ts
    stmt = (select(WaitPeriodRow)
            .where(WaitPeriodRow.user_id == user_id,
                   WaitPeriodRow.started_at <= end_ts,
                   or_(WaitPeriodRow.ended_at.is_(None), WaitPeriodRow.ended_at >= start_ts))
            .order_by(WaitPeriodRow.started_at.desc(), WaitPeriodRow.wait_id.desc()).limit(1))
    return s.execute(stmt).scalars().first()


# ---------------------------------------------------------------- reporting
def wait_summary(s: Session, user_id: str, *, since_ts: float,
                 until_ts: float | None = None) -> dict[str, Any]:
    """Explained idle for one person over ``[since_ts, until_ts or now]``.

    Every period overlapping the window is clipped to it, so a wait that started yesterday evening
    contributes only today's minutes and a still-open one counts up to now - the number on the
    operator's screen is time actually spent waiting inside the window, never a projection.

    ``{total_minutes, by_reason, periods, active, count, since_ts, until_ts}``: ``by_reason`` holds
    only the reasons actually declared in the window (nothing is invented to fill a chart), each
    period carries its own full ``minutes`` plus its ``minutes_in_window`` contribution, and
    ``active`` is the open period with ``minutes_now``, or ``None``.
    """
    now = _now()
    until = now if until_ts is None else until_ts
    stmt = (select(WaitPeriodRow)
            .where(WaitPeriodRow.user_id == user_id,
                   WaitPeriodRow.started_at <= until,
                   or_(WaitPeriodRow.ended_at.is_(None), WaitPeriodRow.ended_at >= since_ts))
            .order_by(WaitPeriodRow.started_at, WaitPeriodRow.wait_id))

    periods: list[dict[str, Any]] = []
    seconds_by_reason: dict[str, float] = {}
    total_s = 0.0
    for row in s.execute(stmt).scalars().all():
        row_end = row.ended_at if row.ended_at is not None else now
        seconds = max(0.0, min(row_end, until) - max(row.started_at, since_ts))
        total_s += seconds
        seconds_by_reason[row.reason] = seconds_by_reason.get(row.reason, 0.0) + seconds
        periods.append({**wait_public(row, now=now), "minutes_in_window": _minutes(seconds)})

    open_period = active_wait(s, user_id)
    active = None if open_period is None else {
        **wait_public(open_period, now=now),
        "minutes_now": _minutes(max(0.0, now - open_period.started_at)),
    }
    return {
        "total_minutes": _minutes(total_s),
        "by_reason": {reason: _minutes(sec) for reason, sec in seconds_by_reason.items()},
        "periods": periods,
        "active": active,
        "count": len(periods),
        "since_ts": since_ts,
        "since_ts_gmt": gmt_iso(since_ts),
        "until_ts": until,
        "until_ts_gmt": gmt_iso(until),
    }
