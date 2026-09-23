"""Operator training profiles: what each person has actually opened, watched and finished.

Progress is **recorded, never inferred**. A row in ``tc_training_progress`` exists only because the
operator opened an item or a supervisor assigned it; nothing here guesses that somebody "probably
knows this". Watching a video is observed behaviour, not verified competency (docs/sections
/05-digital-twin.md §"Verified competency" is Tier D and is created by instructors and assessments
only) — so this module reports completion of *content*, and never a skill level.

Three entry points, all used by the routers:

* :func:`profile` — the whole library for one person, every seeded item present, defaulting to
  ``not_started`` where there is no progress row (an empty library is empty, never padded);
* :func:`record_progress` — the operator's own upsert: clamped to 0-100 and monotonic, so a seek
  backwards, a replay or a flaky mobile tap can never take credit away from somebody;
* :func:`assign` — a supervisor putting an item on somebody's list, which notifies that person.

Rows are added and flushed, never committed: the request-scoped session commits.
"""
from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.taskcentre_models import TrainingProgressRow, TrainingVideoRow, UserRow
from sentinel.taskcentre.service import gmt_iso, notify, user_public

__all__ = ["profile", "record_progress", "assign", "progress_by_video", "item_dict", "summarise",
           "get_video", "COMPLETE_PERCENT", "STATUSES"]

#: Percent at which an item counts as finished. 100 means 100 — "nearly" is not "done".
COMPLETE_PERCENT = 100.0

STATUSES = ("not_started", "in_progress", "completed")

#: Wording carried into the payload so a UI cannot quietly present this as a competency check.
PROFILE_NOTE = ("Training progress is recorded from what the operator actually opened and watched. "
                "It shows content covered, not competency demonstrated.")


def _now() -> float:
    return time.time()


def _stamp(out: dict[str, Any], key: str, ts: float | None) -> dict[str, Any]:
    """Write ``key`` and ``key_gmt`` together so no timestamp is returned without its GMT string."""
    out[key] = ts
    out[f"{key}_gmt"] = gmt_iso(ts)
    return out


def _clamp(percent: float) -> float:
    """0-100. Out-of-range input is clamped, never rejected: the player is not a trusted clock."""
    try:
        value = float(percent)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, value))


def _status(row: TrainingProgressRow | None) -> str:
    """``completed`` once finished, ``in_progress`` once opened, otherwise ``not_started``.

    An item a supervisor assigned but nobody has opened stays ``not_started`` — assigning work is
    not doing it, and the profile must not imply otherwise.
    """
    if row is None or row.started_at is None:
        return "not_started"
    return "completed" if row.completed_at is not None else "in_progress"


# ---------------------------------------------------------------- queries
def get_video(s: Session, video_id: str) -> TrainingVideoRow | None:
    """One training item, or ``None`` (the caller turns that into a 404)."""
    return s.get(TrainingVideoRow, video_id)


def _videos(s: Session) -> list[TrainingVideoRow]:
    return list(s.scalars(select(TrainingVideoRow)
                          .order_by(TrainingVideoRow.order_index, TrainingVideoRow.title)))


def progress_by_video(s: Session, user_id: str) -> dict[str, TrainingProgressRow]:
    """This person's progress rows keyed by ``video_id`` (one row per item; the newest id wins)."""
    rows = s.scalars(select(TrainingProgressRow).where(TrainingProgressRow.user_id == user_id)
                     .order_by(TrainingProgressRow.id))
    return {row.video_id: row for row in rows}


def _row_for(s: Session, user_id: str, video_id: str) -> TrainingProgressRow | None:
    """The single progress row for (person, item), re-read inside this request's transaction."""
    return s.scalars(select(TrainingProgressRow).where(
        TrainingProgressRow.user_id == user_id,
        TrainingProgressRow.video_id == video_id).order_by(TrainingProgressRow.id)).first()


# ---------------------------------------------------------------- serialisation
def item_dict(video: TrainingVideoRow, row: TrainingProgressRow | None) -> dict[str, Any]:
    """One library item merged with this person's progress.

    ``label`` carries the DEMO wording and must be rendered, not hidden; ``url is None`` means the
    UI shows its placeholder player rather than pretending a video exists.
    """
    status = _status(row)
    out: dict[str, Any] = {
        "video_id": video.video_id,
        "title": video.title,
        "category": video.category,
        "duration_min": video.duration_min,
        "label": video.label,
        "url": video.url,
        "player": "placeholder" if video.url is None else "url",
        "description": video.description,
        "order_index": video.order_index,
        "status": status,
        "percent": round(float(row.percent), 1) if row is not None else 0.0,
        "assigned": bool(row is not None and row.assigned_by),
        "assigned_by": row.assigned_by if row is not None else None,
        "note": row.note if row is not None else None,
        "minutes_completed": float(video.duration_min) if status == "completed" else 0.0,
    }
    _stamp(out, "started_at", row.started_at if row is not None else None)
    _stamp(out, "completed_at", row.completed_at if row is not None else None)
    _stamp(out, "last_seen_at", row.last_seen_at if row is not None else None)
    return _stamp(out, "assigned_at", row.assigned_at if row is not None else None)


def summarise(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Counts across a person's library. ``percent_complete`` counts finished items, not watch time."""
    total = len(items)
    completed = sum(1 for i in items if i["status"] == "completed")
    in_progress = sum(1 for i in items if i["status"] == "in_progress")
    stamps = [i[key] for i in items for key in ("last_seen_at", "completed_at", "started_at")
              if i[key] is not None]
    out: dict[str, Any] = {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "not_started": total - completed - in_progress,
        "percent_complete": round(100.0 * completed / total, 1) if total else 0.0,
        "minutes_completed": round(sum(i["minutes_completed"] for i in items), 1),
        "minutes_total": round(sum(float(i["duration_min"]) for i in items), 1),
        "assigned": sum(1 for i in items if i["assigned"]),
        "assigned_outstanding": sum(1 for i in items if i["assigned"] and i["status"] != "completed"),
    }
    return _stamp(out, "last_activity_ts", max(stamps) if stamps else None)


def _by_category(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for item in items:
        group = out.setdefault(item["category"], {"total": 0, "completed": 0, "in_progress": 0,
                                                  "percent_complete": 0.0})
        group["total"] += 1
        if item["status"] == "completed":
            group["completed"] += 1
        elif item["status"] == "in_progress":
            group["in_progress"] += 1
    for group in out.values():
        group["percent_complete"] = round(100.0 * group["completed"] / group["total"], 1)
    return out


# ---------------------------------------------------------------- profile
def profile(s: Session, user_id: str) -> dict[str, Any]:
    """One operator's training profile: every seeded item, their progress, and the totals.

    Every item in the library appears, whether or not the person has touched it — an item with no
    progress row reads ``not_started`` with ``percent`` 0. Nothing is invented to fill the screen:
    with no training content seeded, ``items`` is an empty list and ``empty`` is true.
    """
    user = s.get(UserRow, user_id)
    rows = progress_by_video(s, user_id)
    items = [item_dict(video, rows.get(video.video_id)) for video in _videos(s)]
    out: dict[str, Any] = {
        "user": user_public(user) if user is not None else {"user_id": user_id},
        "items": items,
        "summary": summarise(items),
        "by_category": _by_category(items),
        "empty": not items,
        "empty_message": "No training content available yet" if not items else None,
        "note": PROFILE_NOTE,
        "placeholder_note": "DEMO placeholder content - not official Caterpillar training material",
    }
    return _stamp(out, "server_ts", _now())


# ---------------------------------------------------------------- writes
def record_progress(s: Session, user_id: str, video_id: str, *, percent: float,
                    completed: bool | None = None) -> dict[str, Any]:
    """Upsert one person's progress through one item. Raises ``KeyError`` for an unknown item.

    The rules exist to keep the record honest in both directions:

    * ``percent`` is clamped to 0-100 (``clamped`` says whether it was);
    * progress never goes backwards — re-watching, seeking back or a stale tap keeps the best value
      already recorded (``regressed`` says the request asked for less than was already stored);
    * ``started_at`` is set the first time the item is touched and never rewritten;
    * ``completed_at`` is set when the item reaches the end (``percent`` 100, or ``completed=True``,
      which also forces the bar to 100) and the first completion wins, so a replay cannot restamp it.
    """
    video = s.get(TrainingVideoRow, video_id)
    if video is None:
        raise KeyError(video_id)

    now = _now()
    requested = _clamp(percent)
    clamped = float(percent) != requested if isinstance(percent, (int, float)) else True
    if completed:
        requested = COMPLETE_PERCENT

    row = _row_for(s, user_id, video_id)
    if row is None:
        row = TrainingProgressRow(user_id=user_id, video_id=video_id, status="not_started", percent=0.0)
        s.add(row)

    previous = float(row.percent or 0.0)
    regressed = requested < previous
    row.percent = max(previous, requested)
    if row.started_at is None:
        row.started_at = now
    row.last_seen_at = now

    finished = bool(completed) or row.percent >= COMPLETE_PERCENT
    completed_now = finished and row.completed_at is None
    if completed_now:
        row.completed_at = now
    row.status = _status(row)
    s.flush()

    return {
        "item": item_dict(video, row),
        "clamped": clamped,
        "regressed": regressed,
        "completed_now": completed_now,
        "previous_percent": round(previous, 1),
    }


def assign(s: Session, supervisor_id: str, operator_id: str, video_id: str,
           note: str | None = None) -> dict[str, Any]:
    """Put a training item on an operator's list and tell them. Raises ``KeyError`` when unknown.

    Assigning records *who* asked for it and *when*, alongside any progress already made — it never
    resets or erases what the person has already watched, and it never marks anything complete.
    """
    video = s.get(TrainingVideoRow, video_id)
    if video is None:
        raise KeyError(video_id)

    now = _now()
    row = _row_for(s, operator_id, video_id)
    if row is None:
        row = TrainingProgressRow(user_id=operator_id, video_id=video_id, status="not_started",
                                  percent=0.0)
        s.add(row)
    row.assigned_by = supervisor_id
    row.assigned_at = now
    if note is not None:
        row.note = note
    row.status = _status(row)
    s.flush()

    supervisor = s.get(UserRow, supervisor_id)
    who = supervisor.name if supervisor is not None else supervisor_id
    body = f"{who} assigned this on {gmt_iso(now)} GMT."
    notification = notify(s, operator_id, kind="info", severity="info",
                          title=f"Training assigned: {video.title}",
                          body=f"{body} {note}".strip() if note else body,
                          link="/tc/op/training")
    out: dict[str, Any] = {
        "item": item_dict(video, row),
        "assigned": True,
        "assigned_by": supervisor_id,
        "operator_id": operator_id,
        "note": note,
        "notification_id": notification.notification_id,
        "operator_notified": True,
    }
    return _stamp(out, "assigned_at", now)
