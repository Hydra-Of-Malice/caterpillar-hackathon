"""Work-schedule fatigue-**risk** estimate for one operator, and for a supervisor's team.

**This is not a fatigue detector, and it must never be described as one.**

``docs/sections/06-fatigue.md`` records what our own evidence review found: there is *no published
validation* of machine-control telemetry as a fatigue indicator, the only defensible in-cab feature
for the MVP is time-on-task, and a fatigue *score* presented to a supervisor as a judgement of a
person is explicitly on the "never" list (§6). So this module deliberately does something else and
much smaller: it estimates **exposure risk from the recorded work schedule**, which is what real
fatigue-risk management systems (hours of work, breaks, time of day, consecutive days) do. Every
input is a fact somebody recorded - a Start/Finish Work punch, a declared waiting period, a task the
operator marked completed - and every input is returned alongside the score so a person can check it.

What that means in practice:

* nothing here observes the operator. No camera, no telemetry, no behaviour model.
* the score is a **visible weighted sum**. The weights, the ramps and the thresholds are in
  ``config/taskcentre.yaml`` under ``fatigue_risk``; the per-factor contribution is in the payload.
  There is no hidden model and no learned component.
* the break thresholds are the *same numbers* as the copilot's break rule in
  ``config/alert_policy.yaml`` (advisory 120 min, recommend 150, escalate 165, min break 10), so the
  two products never tell an operator different things about the same shift.
* a declared wait ("waiting for a truck") is **not** counted as rest - the operator is still in the
  cab - but it is counted and reported separately, so nobody reads it as a break.
* the operator can read their own estimate (``GET /tc/op/fatigue-risk``). Nobody is assessed behind
  their back.

Every payload carries :data:`LABEL` and :data:`CAVEATS` verbatim, and callers must render them.

All times are UTC seconds and "today" is the UTC (GMT) day, matching the rest of the Task Centre.
This module is pure: it takes a SQLAlchemy session and returns dicts, and it never writes a row.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from sentinel.store.taskcentre_models import PunchRow, TcTaskRow, UserRow, WaitPeriodRow
from sentinel.taskcentre.service import gmt_iso, settings
from sentinel.taskcentre.waiting import reason_label

__all__ = ["LABEL", "CAVEATS", "METHOD_VERSION", "LEVELS", "config", "fatigue_risk",
           "team_fatigue_risk"]

DAY_S = 86_400.0
LOOKBACK_DAYS = 60          # how far back `consecutive_work_days` will walk; a run older than this is not our business
SHIFT_WINDOW_S = 36 * 3600.0  # how far back a shift may have started. A night shift that began at 23:20
                              # is still the shift running at 02:00, so "today's punches" is the wrong
                              # question - the right one is "which shift is this person in".

#: The one sentence that must appear wherever this number appears. Wording is load-bearing.
LABEL = "Work-schedule risk estimate — not a measurement of this person's fatigue"

#: Ordered least to most exposure. The API returns one of these three strings.
LEVELS = ("low", "elevated", "high")

METHOD_VERSION = "fatigue-risk-0.1.0"

#: Fallbacks used when ``config/taskcentre.yaml`` has no ``fatigue_risk`` block (or is missing a key).
#: The file is the source of truth; these exist so an absent config degrades rather than crashes.
DEFAULTS: dict[str, Any] = {
    "method_version": METHOD_VERSION,
    "night_window": {"start_hour": 22, "end_hour": 6},
    "break_policy": {"advisory_min": 120, "recommend_min": 150, "escalate_min": 165,
                     "min_break_min": 10},
    "new_shift_gap_min": 360,
    "levels": {"elevated_score": 25, "high_score": 55},
    "factors": {
        "continuous_minutes_without_break": {"weight": 45, "ramp_from": 60, "ramp_to": 165},
        "hours_since_start_work": {"weight": 25, "ramp_from": 8, "ramp_to": 12},
        "night_work": {"weight": 18},
        "consecutive_work_days": {"weight": 12, "ramp_from": 5, "ramp_to": 7},
    },
}


def config() -> dict[str, Any]:
    """The ``fatigue_risk`` block from ``config/taskcentre.yaml``, merged over :data:`DEFAULTS`.

    Merged one level deep (and two for ``factors``) so a config that sets only one weight keeps the
    rest, rather than blanking the model.
    """
    loaded = settings().get("fatigue_risk") or {}
    out: dict[str, Any] = {
        "method_version": loaded.get("method_version", DEFAULTS["method_version"]),
        "new_shift_gap_min": loaded.get("new_shift_gap_min", DEFAULTS["new_shift_gap_min"]),
        "night_window": {**DEFAULTS["night_window"], **(loaded.get("night_window") or {})},
        "break_policy": {**DEFAULTS["break_policy"], **(loaded.get("break_policy") or {})},
        "levels": {**DEFAULTS["levels"], **(loaded.get("levels") or {})},
        "factors": {},
    }
    loaded_factors = loaded.get("factors") or {}
    for key, spec in DEFAULTS["factors"].items():
        out["factors"][key] = {**spec, **(loaded_factors.get(key) or {})}
    return out


def _caveats(cfg: dict[str, Any]) -> list[str]:
    """The caveats, rendered with the configured numbers. Callers show these verbatim."""
    policy = cfg["break_policy"]
    window = cfg["night_window"]
    return [
        "This estimates risk from the recorded work schedule. It does not measure, detect or "
        "diagnose this person's fatigue, and it says nothing about how alert they are.",
        "It uses recorded facts only: Start/Finish Work punches, declared waiting periods, tasks "
        "marked completed and the server clock. Sleep, health and life outside work are not known "
        "to this system and are not modelled.",
        f"A rest break is counted only when it was punched — Finish Work, then Start Work at least "
        f"{policy['min_break_min']} min later. A break that was not punched is invisible here, so "
        f"the estimate reads higher than reality rather than lower.",
        "Declared waiting time (waiting for a truck, a paused machine, an expected delay) is time "
        "in the cab, not rest, so it is never counted as a break. It is reported separately.",
        f"A shift is the run of punches since the last gap of {cfg['new_shift_gap_min']} min or "
        f"more, so a night shift that began before midnight is measured from when it actually "
        f"started rather than from midnight.",
        f"Night work means the shift clock falls inside {window['start_hour']:02d}:00–"
        f"{window['end_hour']:02d}:00 GMT. Shift timing is an established risk factor; it is not "
        "evidence about this individual.",
        f"Thresholds mirror the break policy in config/alert_policy.yaml (advisory "
        f"{policy['advisory_min']} min, recommend {policy['recommend_min']} min, escalate "
        f"{policy['escalate_min']} min) and are [PROPOSED] for this demo — they are not validated "
        "against worksite data.",
        "Must not be used as the sole basis for any decision about a person, and never for pay, "
        "rostering or discipline. Ask the operator before you act on it.",
    ]


#: The caveats with the default thresholds, for callers that want them without a config read.
CAVEATS: list[str] = _caveats(config())


# ---------------------------------------------------------------- small helpers
def _now_s(now: float | None) -> float:
    return time.time() if now is None else float(now)


def _day_start(ts: float) -> float:
    """Midnight GMT of the UTC day containing ``ts``."""
    day = datetime.fromtimestamp(ts, tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return day.timestamp()


def _minutes(seconds: float) -> float:
    return round(max(0.0, seconds) / 60.0, 1)


def _hm(minutes: float | None) -> str:
    """``160.0 -> '2 h 40 m'``; under an hour is plain minutes. Used in the recommendation text."""
    if minutes is None:
        return "no recorded time"
    total = int(round(max(0.0, minutes)))
    hours, mins = divmod(total, 60)
    if hours == 0:
        return f"{mins} min"
    return f"{hours} h {mins:02d} m"


def _ramp(value: float | None, weight: float, ramp_from: float, ramp_to: float) -> float:
    """Weight scaled linearly from 0 at ``ramp_from`` to the full weight at ``ramp_to``.

    ``None`` (the fact was never recorded) contributes exactly 0 — an unknown is never guessed
    upward or downward, it simply does not score.
    """
    if value is None or weight <= 0:
        return 0.0
    span = float(ramp_to) - float(ramp_from)
    if span <= 0:
        return float(weight) if value >= ramp_to else 0.0
    fraction = (float(value) - float(ramp_from)) / span
    return round(float(weight) * min(1.0, max(0.0, fraction)), 1)


def _in_night_window(ts: float, window: dict[str, Any]) -> bool:
    """Whether the GMT clock at ``ts`` falls in the configured night window (wrapping midnight)."""
    hour = datetime.fromtimestamp(ts, tz=timezone.utc).hour
    start, end = int(window["start_hour"]), int(window["end_hour"])
    if start == end:
        return False
    return hour >= start or hour < end if start > end else start <= hour < end


def _night_minutes(start_ts: float, end_ts: float, window: dict[str, Any]) -> float:
    """Minutes of ``[start_ts, end_ts]`` inside the night window, sampled at one-minute resolution.

    A loop rather than interval arithmetic: a shift is minutes-to-hours long, the cost is trivial,
    and the definition stays obvious enough to check by hand.
    """
    if end_ts <= start_ts:
        return 0.0
    count = 0
    steps = int((end_ts - start_ts) // 60) + 1
    for i in range(min(steps, 24 * 60 * 3)):     # hard cap: three days of minutes
        if _in_night_window(start_ts + i * 60.0, window):
            count += 1
    return float(count)


# ---------------------------------------------------------------- recorded facts
def _recent_punches(s: Session, user_id: str, until: float) -> list[PunchRow]:
    """Every punch in the last :data:`SHIFT_WINDOW_S`, oldest first."""
    stmt = (select(PunchRow)
            .where(PunchRow.user_id == user_id, PunchRow.ts >= until - SHIFT_WINDOW_S,
                   PunchRow.ts <= until)
            .order_by(PunchRow.ts, PunchRow.punch_id))
    return list(s.execute(stmt).scalars().all())


def _current_shift(punches: list[PunchRow], new_shift_gap_s: float,
                   now: float) -> list[PunchRow]:
    """The punches belonging to the shift this person is in (or has just finished), oldest first.

    A shift starts at a ``start_work`` punch that either opens the window or follows a gap of at
    least ``new_shift_gap_min`` since the previous punch of any kind. Anything shorter is a break
    *inside* the shift, which is exactly what the break policy is about; anything longer is a
    different shift, and yesterday's hours must not be charged against today.

    Empty when the last punch is a ``finish_work`` older than that same gap: the person is off
    shift, and there is nothing current to estimate. A night shift that began at 23:20 is still
    returned at 02:00 — "today's punches" would have wrongly reported nobody had started work.
    """
    if not punches:
        return []
    last = punches[-1]
    if last.kind == "finish_work" and (now - last.ts) >= new_shift_gap_s:
        return []
    start_index: int | None = None
    for i, row in enumerate(punches):
        if row.kind != "start_work":
            continue
        if i == 0 or (row.ts - punches[i - 1].ts) >= new_shift_gap_s:
            start_index = i
    if start_index is None:
        start_index = next((i for i, row in enumerate(punches) if row.kind == "start_work"), None)
    return [] if start_index is None else punches[start_index:]


def _rest_breaks(punches: list[PunchRow], min_break_s: float) -> list[dict[str, Any]]:
    """Punched rest gaps: a ``finish_work`` followed by a ``start_work`` at least ``min_break_s`` later.

    This is the **only** thing counted as rest. It is a pair of recorded facts, not an inference
    about what somebody was doing. A shorter gap is recorded but does not reset continuous operation,
    exactly as ``config/alert_policy.yaml`` ``break.min_break_min`` says.
    """
    out: list[dict[str, Any]] = []
    open_finish: float | None = None
    for row in punches:
        if row.kind == "finish_work":
            open_finish = row.ts
        elif row.kind == "start_work" and open_finish is not None:
            gap = row.ts - open_finish
            if gap >= min_break_s:
                out.append({"started_at": open_finish, "started_at_gmt": gmt_iso(open_finish),
                            "ended_at": row.ts, "ended_at_gmt": gmt_iso(row.ts),
                            "minutes": _minutes(gap)})
            open_finish = None
    return out


def _waiting(s: Session, user_id: str, start: float, end: float, now: float) -> dict[str, Any]:
    """Declared waiting inside ``[start, end]``: total minutes and a breakdown by reason.

    Mirrors :func:`sentinel.taskcentre.waiting.wait_summary` but clips against the caller's ``now``,
    so an injected clock is honoured exactly (that function reads the wall clock for open periods).
    Waiting is reported, never subtracted from continuous operation: the operator is in the cab.
    """
    stmt = (select(WaitPeriodRow)
            .where(WaitPeriodRow.user_id == user_id, WaitPeriodRow.started_at <= end,
                   or_(WaitPeriodRow.ended_at.is_(None), WaitPeriodRow.ended_at >= start))
            .order_by(WaitPeriodRow.started_at, WaitPeriodRow.wait_id))
    total = 0.0
    by_reason: dict[str, float] = {}
    count = 0
    for row in s.execute(stmt).scalars().all():
        row_end = now if row.ended_at is None else row.ended_at
        seconds = max(0.0, min(row_end, end) - max(row.started_at, start))
        if seconds <= 0:
            continue
        count += 1
        total += seconds
        by_reason[row.reason] = by_reason.get(row.reason, 0.0) + seconds
    return {"total_minutes": _minutes(total), "periods": count,
            "by_reason": {reason_label(r): _minutes(sec) for r, sec in sorted(by_reason.items())}}


def _consecutive_work_days(s: Session, user_id: str, now: float) -> tuple[int, bool]:
    """``(days, includes_today)`` — consecutive UTC days with a ``start_work`` punch, walking back.

    Counted from today when today has a punch, otherwise from yesterday, so the number is a true
    statement about the punch history either way and the caller is told which it is.
    """
    floor = _day_start(now) - LOOKBACK_DAYS * DAY_S
    stmt = (select(PunchRow.ts)
            .where(PunchRow.user_id == user_id, PunchRow.kind == "start_work", PunchRow.ts >= floor,
                   PunchRow.ts <= now))
    worked = {int(_day_start(ts) // DAY_S) for ts in s.execute(stmt).scalars().all()}
    today = int(_day_start(now) // DAY_S)
    includes_today = today in worked
    cursor = today if includes_today else today - 1
    days = 0
    while cursor in worked and days < LOOKBACK_DAYS:
        days += 1
        cursor -= 1
    return days, includes_today


def _tasks_completed_today(s: Session, user_id: str, day_start: float, until: float) -> int:
    stmt = (select(TcTaskRow)
            .where(TcTaskRow.operator_id == user_id, TcTaskRow.status == "completed",
                   TcTaskRow.finished_at.is_not(None), TcTaskRow.finished_at >= day_start,
                   TcTaskRow.finished_at <= until))
    return len(list(s.execute(stmt).scalars().all()))


# ---------------------------------------------------------------- the estimate
def _recommendation(inputs: dict[str, Any], cfg: dict[str, Any], level: str) -> str:
    """One operational, non-medical sentence. Never says a person is fatigued or tired."""
    policy = cfg["break_policy"]
    if not inputs["shift_recorded"]:
        return ("No open or recent Start Work punch is recorded, so there is no shift to estimate "
                "from. Nothing here is an assessment of this person.")
    continuous = inputs["continuous_minutes_without_break"]
    span = _hm(continuous)
    if not inputs["on_shift"]:
        return (f"Recorded shift finished at {inputs['shift_end_gmt']} GMT after "
                f"{_hm(inputs['shift_minutes'])}; the last stretch without a punched break was "
                f"{span}. Use it when planning the next shift, not as a judgement of the person.")
    if continuous is not None and continuous >= policy["escalate_min"]:
        return (f"{span} without a punched break — past the {policy['escalate_min']} min escalation "
                f"point in the break policy. Arrange cover so a break can be taken now.")
    if continuous is not None and continuous >= policy["recommend_min"]:
        return (f"{span} without a punched break — a break is recommended at the next safe stop, "
                f"and cover should be arranged if the work cannot pause.")
    if continuous is not None and continuous >= policy["advisory_min"]:
        return f"{span} without a punched break — suggest a break at the next safe stop."
    if inputs["night_work"]:
        return ("Working inside the night window, where shift-work risk is higher. Keep breaks to "
                "schedule and check in before the end of the shift.")
    hours = inputs["hours_since_start_work"]
    hours_from = cfg["factors"]["hours_since_start_work"]["ramp_from"]
    if hours is not None and hours >= hours_from:
        return (f"{hours:.1f} h since the Start Work punch, past the {hours_from} h point where "
                f"hours-of-work risk starts to build. Plan the next break and the shift end.")
    days_from = cfg["factors"]["consecutive_work_days"]["ramp_from"]
    if inputs["consecutive_work_days"] >= days_from:
        return (f"{inputs['consecutive_work_days']} consecutive working days are recorded. "
                f"Consider a rest day when the roster allows.")
    if level == "low":
        return ("Nothing in the recorded work schedule calls for extra break cover. The normal "
                "break schedule applies.")
    return "Review the recorded hours and breaks below with the operator before acting on them."


def fatigue_risk(s: Session, user_id: str, *, now: float | None = None) -> dict[str, Any]:
    """Work-schedule fatigue-**risk** estimate for one person, from recorded facts only.

    Returns ``{level, score, factors, inputs, recommendation, caveats, label, method_version, ...}``.

    ``level`` is the *worse* of two bands, and both are shown: the score band (from
    ``fatigue_risk.levels``) and the break-policy band, which maps the copilot's own thresholds
    straight across — ``>= recommend_min`` is high, ``>= advisory_min`` is elevated. That way the
    supervisor's indicator can never be calmer than the break prompt the operator is already seeing.

    Facts that were never recorded are returned as ``None`` and contribute exactly 0. An operator
    who has not punched in has no shift to estimate, and the payload says so instead of inventing a
    number.
    """
    cfg = config()
    now = _now_s(now)
    policy = cfg["break_policy"]
    window = cfg["night_window"]
    min_break_s = float(policy["min_break_min"]) * 60.0
    new_shift_gap_s = float(cfg["new_shift_gap_min"]) * 60.0
    day_start = _day_start(now)

    all_punches = _recent_punches(s, user_id, now)
    punches = _current_shift(all_punches, new_shift_gap_s, now)
    starts = [p for p in punches if p.kind == "start_work"]
    first_start = starts[0].ts if starts else None
    last_punch = punches[-1] if punches else None
    on_shift = bool(first_start is not None and last_punch is not None and last_punch.kind == "start_work")
    # Everything is measured to "now" while the shift is open, and to the Finish Work punch once it
    # is closed - a finished shift must not keep accruing hours against the person.
    shift_end = now if on_shift or first_start is None else float(last_punch.ts)
    punched_in_today = any(p.kind == "start_work" and p.ts >= day_start for p in all_punches)

    breaks = _rest_breaks(punches, min_break_s)
    last_break_end = breaks[-1]["ended_at"] if breaks else None

    if first_start is None:
        hours_since_start: float | None = None
        continuous: float | None = None
        since_last_break: float | None = None
        shift_minutes: float | None = None
        continuous_from = None
    else:
        hours_since_start = round(max(0.0, shift_end - first_start) / 3600.0, 2)
        shift_minutes = _minutes(shift_end - first_start)
        continuous_from = max(first_start, last_break_end or first_start)
        continuous = _minutes(shift_end - continuous_from)
        since_last_break = None if last_break_end is None else _minutes(shift_end - last_break_end)

    waiting = _waiting(s, user_id, first_start, shift_end, now) if first_start is not None else \
        {"total_minutes": 0.0, "periods": 0, "by_reason": {}}
    break_minutes = round(sum(b["minutes"] for b in breaks), 1)
    working_minutes = None if shift_minutes is None else \
        round(max(0.0, shift_minutes - break_minutes - waiting["total_minutes"]), 1)

    night_now = bool(on_shift and _in_night_window(now, window))
    night_minutes = 0.0 if first_start is None else _night_minutes(first_start, shift_end, window)
    days, days_include_today = _consecutive_work_days(s, user_id, now)
    completed = _tasks_completed_today(s, user_id, day_start, now)

    inputs: dict[str, Any] = {
        # `punched_in_today` is the strict fact (a start_work punch inside this GMT day);
        # `shift_recorded` is what the estimate actually runs on, and is also true for a night shift
        # that started before midnight. Both are published so neither can be quietly conflated.
        "punched_in_today": punched_in_today,
        "shift_recorded": first_start is not None,
        "on_shift": on_shift,
        "status": ("not_punched_in" if first_start is None else
                   "on_shift" if on_shift else "shift_finished"),
        "not_punched_in_note": (None if first_start is not None else
                                "No open or recent Start Work punch — no shift hours are assumed "
                                "and no number is invented."),
        "shift_window_hours": round(SHIFT_WINDOW_S / 3600.0, 1),
        "new_shift_gap_min": cfg["new_shift_gap_min"],
        "day_start_ts": day_start,
        "day_start_gmt": gmt_iso(day_start),
        "shift_start_ts": first_start,
        "shift_start_gmt": gmt_iso(first_start),
        "shift_end_ts": None if first_start is None else shift_end,
        "shift_end_gmt": None if first_start is None else gmt_iso(shift_end),
        "hours_since_start_work": hours_since_start,
        "shift_minutes": shift_minutes,
        "continuous_minutes_without_break": continuous,
        "continuous_since_ts": continuous_from,
        "continuous_since_gmt": gmt_iso(continuous_from),
        "breaks_taken": len(breaks),
        "break_minutes_total": break_minutes,
        "minutes_since_last_break": since_last_break,
        "breaks": breaks,
        "declared_waiting_minutes": waiting["total_minutes"],
        "declared_waiting_periods": waiting["periods"],
        "declared_waiting_by_reason": waiting["by_reason"],
        "declared_waiting_note": ("Declared waiting is time in the cab, not rest — it is counted "
                                  "here separately and never treated as a break."),
        "working_minutes": working_minutes,
        "working_minutes_note": "Shift span minus punched breaks and minus declared waiting time.",
        "night_work": night_now,
        "night_minutes_in_shift": night_minutes,
        "night_window_gmt": f"{int(window['start_hour']):02d}:00–{int(window['end_hour']):02d}:00",
        "consecutive_work_days": days,
        "consecutive_work_days_includes_today": days_include_today,
        "tasks_completed_today": completed,
        "generated_at": now,
        "generated_at_gmt": gmt_iso(now),
    }

    f = cfg["factors"]
    cont_spec, hours_spec = f["continuous_minutes_without_break"], f["hours_since_start_work"]
    night_spec, days_spec = f["night_work"], f["consecutive_work_days"]
    night_contribution = round(float(night_spec["weight"]), 1) if night_now else 0.0

    factors: list[dict[str, Any]] = [
        {"key": "continuous_minutes_without_break",
         "label": "Continuous work without a punched break",
         "value": continuous, "value_text": _hm(continuous) if continuous is not None else "Not punched in",
         "unit": "minutes", "weight": cont_spec["weight"],
         "contribution": _ramp(continuous, cont_spec["weight"], cont_spec["ramp_from"], cont_spec["ramp_to"]),
         "threshold": {"advisory_min": policy["advisory_min"], "recommend_min": policy["recommend_min"],
                       "escalate_min": policy["escalate_min"], "scores_from": cont_spec["ramp_from"],
                       "scores_full_at": cont_spec["ramp_to"]},
         "threshold_text": (f"advisory {policy['advisory_min']} min · recommend "
                            f"{policy['recommend_min']} min · escalate {policy['escalate_min']} min"),
         "note": ("Same thresholds as the copilot break rule in config/alert_policy.yaml. Declared "
                  "waiting time is inside this span, because waiting in the cab is not rest.")},
        {"key": "hours_since_start_work", "label": "Hours since the Start Work punch",
         "value": hours_since_start,
         "value_text": "Not punched in" if hours_since_start is None else f"{hours_since_start:.1f} h",
         "unit": "hours", "weight": hours_spec["weight"],
         "contribution": _ramp(hours_since_start, hours_spec["weight"], hours_spec["ramp_from"],
                               hours_spec["ramp_to"]),
         "threshold": {"scores_from": hours_spec["ramp_from"], "scores_full_at": hours_spec["ramp_to"]},
         "threshold_text": f"scores from {hours_spec['ramp_from']} h, full at {hours_spec['ramp_to']} h",
         "note": ("Hours-of-work exposure. Risk is established to rise after about the 8th hour "
                  "(Folkard & Tucker 2003); this is the schedule, not this person.")},
        {"key": "night_work", "label": "Work inside the night window",
         "value": night_now, "value_text": "Yes" if night_now else "No", "unit": "yes/no",
         "weight": night_spec["weight"], "contribution": night_contribution,
         "threshold": {"start_hour": window["start_hour"], "end_hour": window["end_hour"]},
         "threshold_text": (f"{int(window['start_hour']):02d}:00–{int(window['end_hour']):02d}:00 GMT"),
         "note": (f"{_hm(night_minutes)} of this shift falls inside the window. Shift timing is an "
                  "established risk factor; it is not evidence about the individual.")},
        {"key": "consecutive_work_days", "label": "Consecutive working days",
         "value": days, "value_text": f"{days} day{'' if days == 1 else 's'}", "unit": "days",
         "weight": days_spec["weight"],
         "contribution": _ramp(days, days_spec["weight"], days_spec["ramp_from"], days_spec["ramp_to"]),
         "threshold": {"scores_from": days_spec["ramp_from"], "scores_full_at": days_spec["ramp_to"]},
         "threshold_text": f"scores from {days_spec['ramp_from']} days, full at {days_spec['ramp_to']}",
         "note": ("Counted from Start Work punches" +
                  ("" if days_include_today else ", ending yesterday — today has no punch yet") + ".")},
        # Reported, never scored: these describe the day without turning output or waiting into risk.
        {"key": "breaks_taken", "label": "Punched breaks today", "value": len(breaks),
         "value_text": f"{len(breaks)} ({_hm(break_minutes)})", "unit": "breaks", "weight": 0,
         "contribution": 0.0,
         "threshold": {"min_break_min": policy["min_break_min"]},
         "threshold_text": f"a gap under {policy['min_break_min']} min does not reset continuous work",
         "note": "Reported, not scored. Only a punched Finish Work → Start Work gap counts as rest."},
        {"key": "declared_waiting_minutes", "label": "Declared waiting time (not rest)",
         "value": waiting["total_minutes"], "value_text": _hm(waiting["total_minutes"]),
         "unit": "minutes", "weight": 0, "contribution": 0.0, "threshold": None,
         "threshold_text": "not a threshold — waiting is never counted as a break",
         "note": ("The operator is in the cab waiting, so this is not rest and does not reset "
                  "continuous work. Shown so the shift can be read honestly.")},
        {"key": "tasks_completed_today", "label": "Tasks completed today", "value": completed,
         "value_text": str(completed), "unit": "tasks", "weight": 0, "contribution": 0.0,
         "threshold": None, "threshold_text": "not a threshold — context only",
         "note": "Reported, not scored. This is not a productivity measure and does not affect the score."},
    ]

    total_weight = sum(float(x["weight"]) for x in factors) or 1.0
    points = round(sum(float(x["contribution"]) for x in factors), 1)
    score = int(round(100.0 * points / total_weight))
    score = max(0, min(100, score))

    score_band = ("high" if score >= cfg["levels"]["high_score"] else
                  "elevated" if score >= cfg["levels"]["elevated_score"] else "low")
    if continuous is None:
        policy_band = "low"
    elif continuous >= policy["recommend_min"]:
        policy_band = "high"
    elif continuous >= policy["advisory_min"]:
        policy_band = "elevated"
    else:
        policy_band = "low"
    level = max(score_band, policy_band, key=LEVELS.index)

    return {
        "label": LABEL,
        "user_id": user_id,
        "level": level,
        "level_from": {"score_band": score_band, "break_policy_band": policy_band,
                       "rule": "the worse of the two is shown, so this is never calmer than the "
                               "operator's own break prompt"},
        "score": score,
        "score_points": points,
        "score_max_points": round(total_weight, 1),
        "score_formula": ("score = 100 x (sum of factor contributions) / (sum of factor weights); "
                          "every weight and contribution is listed in `factors`"),
        "level_thresholds": dict(cfg["levels"]),
        "break_policy": dict(policy),
        "factors": factors,
        "inputs": inputs,
        "recommendation": _recommendation(inputs, cfg, level),
        "caveats": _caveats(cfg),
        "method_version": cfg["method_version"],
        "generated_at": now,
        "generated_at_gmt": gmt_iso(now),
    }


def team_fatigue_risk(s: Session, supervisor_id: str | None, *, now: float | None = None) -> dict[str, Any]:
    """The same estimate for a supervisor's operators — **ordered by name, never ranked**.

    ``supervisor_id=None`` covers every active operator (the admin view). Rows come back sorted by
    name so the screen cannot be read as a league table: the point is to see who needs break cover,
    not who is "worst". The per-level counts are there so a supervisor can triage at a glance.
    """
    now = _now_s(now)
    q = select(UserRow).where(UserRow.role == "operator", UserRow.active.is_(True))
    if supervisor_id is not None:
        q = q.where(UserRow.supervisor_id == supervisor_id)
    operators = sorted(s.execute(q).scalars().all(), key=lambda u: ((u.name or "").lower(), u.user_id))

    rows: list[dict[str, Any]] = []
    counts = {level: 0 for level in LEVELS}
    for operator in operators:
        estimate = fatigue_risk(s, operator.user_id, now=now)
        counts[estimate["level"]] = counts.get(estimate["level"], 0) + 1
        rows.append({"user_id": operator.user_id, "name": operator.name, "username": operator.username,
                     "machine_id": operator.machine_id, **estimate})

    cfg = config()
    return {
        "label": LABEL,
        "supervisor_id": supervisor_id,
        "generated_at": now,
        "generated_at_gmt": gmt_iso(now),
        "count": len(rows),
        "counts": counts,
        "ordering": "operator name, A-Z",
        "ordering_note": "Ordered by name on purpose. This is not a ranking or a leaderboard.",
        "operators": rows,
        "caveats": _caveats(cfg),
        "method_version": cfg["method_version"],
    }
