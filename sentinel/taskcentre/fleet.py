"""Fleet management: utilisation, downtime and maintenance for every machine on the site.

Everything here is derived from two tables:

* ``tc_machine_state`` - intervals of a machine's *scheduled* time, each ``operating``, ``idle``,
  ``down`` (unplanned) or ``maintenance`` (planned). A gap between intervals is unscheduled time
  (parked, off shift) and counts toward neither uptime nor downtime.
* ``tc_maintenance`` - work orders (service, inspection, repair) with an append-only history.

The figures follow the usual fleet definitions, so a reader can check them by hand:

* **availability** = (operating + idle) / scheduled - the share of scheduled time it could work;
* **utilisation** = operating / scheduled - the share it actually worked;
* **MTBF** = operating hours / breakdowns, **MTTR** = mean length of a finished breakdown;
* the **service meter** (engine hours) = a known reading plus engine-on time (operating + idle) since.

Nothing is stored pre-computed, and the demo history is SIMULATED (``source`` on every row says so).
All times are UTC seconds.
"""
from __future__ import annotations

import random
import time
import zlib
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared.schemas import new_id
from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import MachineStateRow, MaintenanceRow, UserRow
from sentinel.taskcentre.service import gmt_iso, settings

HOUR = 3600.0
DAY = 86_400.0

STATES: tuple[str, ...] = ("operating", "idle", "down", "maintenance")
ENGINE_ON: frozenset[str] = frozenset({"operating", "idle"})
KINDS: tuple[str, ...] = ("service", "inspection", "repair")
STATUSES: tuple[str, ...] = ("scheduled", "in_progress", "completed", "cancelled")
OPEN_STATUSES: frozenset[str] = frozenset({"scheduled", "in_progress"})

METHOD = ("availability = (operating + idle) / scheduled; utilisation = operating / scheduled; "
          "MTBF = operating hours / breakdowns; MTTR = mean length of a finished breakdown. Unscheduled "
          "time (parked, off shift) is excluded from every ratio.")


@dataclass(frozen=True)
class FleetConfig:
    service_interval_h: float
    due_soon_h: float
    window_days: int
    max_window_days: int

    @classmethod
    def load(cls) -> "FleetConfig":
        raw = settings().get("fleet") or {}
        return cls(service_interval_h=float(raw.get("service_interval_h", 500)),
                   due_soon_h=float(raw.get("due_soon_h", 50)),
                   window_days=int(raw.get("window_days", 7)),
                   max_window_days=int(raw.get("max_window_days", 90)))


class FleetError(ValueError):
    """A work-order change that is not allowed from the record's current status (maps to 409)."""


# ---------------------------------------------------------------- reads
def state_rows(s: Session, machine_id: str, *, since: float | None = None) -> list[MachineStateRow]:
    """A machine's state intervals, oldest first; with ``since``, only those still running after it."""
    stmt = select(MachineStateRow).where(MachineStateRow.machine_id == machine_id)
    if since is not None:
        stmt = stmt.where((MachineStateRow.ended_at.is_(None)) | (MachineStateRow.ended_at > since))
    return list(s.execute(stmt.order_by(MachineStateRow.started_at, MachineStateRow.id)).scalars())


def maintenance_rows(s: Session, machine_id: str) -> list[MaintenanceRow]:
    """A machine's work orders, newest activity first."""
    stmt = select(MaintenanceRow).where(MaintenanceRow.machine_id == machine_id)
    rows = list(s.execute(stmt).scalars())
    return sorted(rows, key=lambda r: r.completed_at or r.started_at or r.scheduled_for or r.created_at,
                  reverse=True)


def _overlap(row: MachineStateRow, start: float, end: float, now: float) -> float:
    """Seconds of ``row`` inside [start, end]; an open interval runs until ``now``."""
    row_end = now if row.ended_at is None else row.ended_at
    return max(0.0, min(row_end, end) - max(row.started_at, start))


def _hours(seconds: float) -> float:
    return round(seconds / HOUR, 2)


def _pct(part: float, whole: float) -> float | None:
    return None if whole <= 0 else round(100.0 * part / whole, 1)


def window_stats(rows: Sequence[MachineStateRow], *, start: float, end: float, now: float) -> dict[str, Any]:
    """Hours per state in [start, end] plus availability, utilisation, MTBF and MTTR."""
    seconds = {state: 0.0 for state in STATES}
    for row in rows:
        if row.state in seconds:
            seconds[row.state] += _overlap(row, start, end, now)
    scheduled = sum(seconds.values())
    engine = seconds["operating"] + seconds["idle"]
    downtime = seconds["down"] + seconds["maintenance"]
    breakdowns = [r for r in rows if r.state == "down" and start <= r.started_at <= end]
    repaired = [r for r in rows if r.state == "down" and r.ended_at is not None and start <= r.ended_at <= end]
    days = max((end - start) / DAY, 1e-9)
    return {
        "hours": {state: _hours(value) for state, value in seconds.items()},
        "scheduled_h": _hours(scheduled),
        "uptime_h": _hours(engine),
        "downtime_h": _hours(downtime),
        "planned_downtime_h": _hours(seconds["maintenance"]),
        "unplanned_downtime_h": _hours(seconds["down"]),
        "availability_pct": _pct(engine, scheduled),
        "utilisation_pct": _pct(seconds["operating"], scheduled),
        "idle_pct": _pct(seconds["idle"], scheduled),
        "downtime_pct": _pct(downtime, scheduled),
        "breakdowns": len(breakdowns),
        "mtbf_h": None if not breakdowns else _hours(seconds["operating"] / len(breakdowns)),
        "mttr_h": None if not repaired else _hours(sum(r.ended_at - r.started_at for r in repaired) / len(repaired)),
        "engine_h_per_day": round(engine / HOUR / days, 2),
    }


def current_state(rows: Sequence[MachineStateRow], now: float) -> dict[str, Any]:
    """The open interval if there is one; otherwise ``available`` (parked) since the last one ended."""
    if not rows:
        return {"state": "no_data", "since_ts": None, "since_ts_gmt": None, "age_s": None, "reason": "",
                "source": None, "maintenance_id": None}
    open_rows = [r for r in rows if r.ended_at is None]
    if open_rows:
        row = max(open_rows, key=lambda r: r.started_at)
        state, since, reason, source, mid = row.state, row.started_at, row.reason, row.source, row.maintenance_id
    else:
        last = max(rows, key=lambda r: r.ended_at or 0.0)
        state, since, reason, source, mid = "available", last.ended_at, "Parked, not scheduled", last.source, None
    return {"state": state, "since_ts": since, "since_ts_gmt": gmt_iso(since),
            "age_s": None if since is None else round(max(0.0, now - since), 1),
            "reason": reason, "source": source, "maintenance_id": mid}


def hour_meter(machine: MachineRow | None, rows: Sequence[MachineStateRow], at: float, now: float) -> float | None:
    """Service-meter reading at ``at``: the known base reading plus engine-on hours since it.

    ``None`` when the machine has no known base reading - the meter is never guessed.
    """
    meta = (machine.meta or {}) if machine is not None else {}
    base_h, base_ts = meta.get("smu_base_h"), meta.get("smu_base_ts")
    if base_h is None or base_ts is None:
        return None
    engine = sum(_overlap(r, float(base_ts), at, now) for r in rows if r.state in ENGINE_ON)
    return round(float(base_h) + engine / HOUR, 1)


def service_interval(machine: MachineRow | None, cfg: FleetConfig) -> float:
    meta = (machine.meta or {}) if machine is not None else {}
    return float(meta.get("service_interval_h") or cfg.service_interval_h)


def service_status(machine: MachineRow | None, rows: Sequence[MachineStateRow],
                   records: Sequence[MaintenanceRow], *, now: float, cfg: FleetConfig) -> dict[str, Any]:
    """When the machine was last serviced and when the next service falls due on the meter.

    ``status`` is ``overdue | due_soon | ok | unknown``; ``unknown`` whenever the meter or the last
    service reading is missing, rather than assuming a due date.
    """
    interval = service_interval(machine, cfg)
    meter = hour_meter(machine, rows, now, now)
    services = [r for r in records if r.kind == "service" and r.status == "completed" and r.completed_at]
    last = max(services, key=lambda r: r.completed_at) if services else None
    completed = [r for r in records if r.status == "completed" and r.completed_at]
    last_any = max(completed, key=lambda r: r.completed_at) if completed else None
    upcoming = sorted((r for r in records if r.kind == "service" and r.status in OPEN_STATUSES),
                      key=lambda r: r.scheduled_for or r.created_at)
    rate = window_stats(rows, start=now - 14 * DAY, end=now, now=now)["engine_h_per_day"]
    out: dict[str, Any] = {
        "interval_h": interval, "hour_meter_h": meter, "engine_h_per_day": rate,
        "last_service": None if last is None else maintenance_brief(last),
        "last_maintained": None if last_any is None else maintenance_brief(last_any),
        "next_scheduled": None if not upcoming else maintenance_brief(upcoming[0]),
        "due_at_h": None, "remaining_h": None, "est_due_ts": None, "est_due_ts_gmt": None,
        "status": "unknown",
    }
    if last is None or last.hour_meter_h is None or meter is None:
        return out
    due_at = last.hour_meter_h + interval
    remaining = round(due_at - meter, 1)
    est = now + remaining / rate * DAY if remaining > 0 and rate > 0 else None
    out.update({"due_at_h": round(due_at, 1), "remaining_h": remaining, "est_due_ts": est,
                "est_due_ts_gmt": gmt_iso(est),
                "status": "overdue" if remaining < 0 else "due_soon" if remaining <= cfg.due_soon_h else "ok"})
    return out


def maintenance_brief(rec: MaintenanceRow) -> dict[str, Any]:
    return {"maintenance_id": rec.maintenance_id, "kind": rec.kind, "title": rec.title, "status": rec.status,
            "hour_meter_h": rec.hour_meter_h,
            "scheduled_for": rec.scheduled_for, "scheduled_for_gmt": gmt_iso(rec.scheduled_for),
            "completed_at": rec.completed_at, "completed_at_gmt": gmt_iso(rec.completed_at)}


def maintenance_public(rec: MaintenanceRow, rows: Sequence[MachineStateRow], users: dict[str, UserRow],
                       *, now: float) -> dict[str, Any]:
    """A work order with the downtime it actually caused (its linked state intervals)."""
    linked = [r for r in rows if r.maintenance_id == rec.maintenance_id]
    downtime_s = sum(((now if r.ended_at is None else r.ended_at) - r.started_at) for r in linked)
    creator = users.get(rec.created_by or "")
    end = rec.completed_at or (now if rec.status == "in_progress" else None)
    return {
        "maintenance_id": rec.maintenance_id, "machine_id": rec.machine_id, "kind": rec.kind,
        "title": rec.title, "detail": rec.detail, "status": rec.status, "open": rec.status in OPEN_STATUSES,
        "hour_meter_h": rec.hour_meter_h, "performed_by": rec.performed_by, "notes": rec.notes,
        "source": rec.source, "created_by": rec.created_by,
        "created_by_name": None if creator is None else creator.name,
        "duration_h": None if rec.started_at is None or end is None else _hours(end - rec.started_at),
        "downtime_h": _hours(downtime_s) if linked else None,
        "overdue": rec.status == "scheduled" and rec.scheduled_for is not None and rec.scheduled_for < now,
        "history": list(rec.history or []),
        "scheduled_for": rec.scheduled_for, "scheduled_for_gmt": gmt_iso(rec.scheduled_for),
        "started_at": rec.started_at, "started_at_gmt": gmt_iso(rec.started_at),
        "completed_at": rec.completed_at, "completed_at_gmt": gmt_iso(rec.completed_at),
        "created_at": rec.created_at, "created_at_gmt": gmt_iso(rec.created_at),
    }


def interval_public(row: MachineStateRow, *, start: float, now: float,
                    users: dict[str, UserRow]) -> dict[str, Any]:
    """One state interval clipped to the window start (``clipped`` says so); open ones end at ``now``."""
    begin = max(row.started_at, start)
    end = now if row.ended_at is None else row.ended_at
    operator = users.get(row.operator_id or "")
    return {"id": row.id, "state": row.state, "start_ts": begin, "start_ts_gmt": gmt_iso(begin),
            "end_ts": end, "end_ts_gmt": gmt_iso(end), "open": row.ended_at is None,
            "clipped": begin > row.started_at, "duration_h": _hours(end - begin), "reason": row.reason,
            "source": row.source, "maintenance_id": row.maintenance_id, "operator_id": row.operator_id,
            "operator_name": None if operator is None else operator.name}


# ---------------------------------------------------------------- work-order lifecycle
def _log(rec: MaintenanceRow, actor: UserRow | None, action: str, now: float, note: str = "",
         **data: Any) -> None:
    """Append to the record's history. A new list is assigned so the JSON column is marked dirty."""
    entry = {"ts": now, "ts_gmt": gmt_iso(now), "action": action,
             "by": None if actor is None else actor.user_id, "by_name": None if actor is None else actor.name}
    if note:
        entry["note"] = note
    if data:
        entry["data"] = data
    rec.history = [*(rec.history or []), entry]


def _close_open_state(s: Session, machine_id: str, now: float) -> None:
    for row in s.execute(select(MachineStateRow).where(MachineStateRow.machine_id == machine_id,
                                                       MachineStateRow.ended_at.is_(None))).scalars():
        row.ended_at = max(now, row.started_at)


def create_record(s: Session, machine_id: str, actor: UserRow | None, *, kind: str, title: str,
                  detail: str = "", scheduled_for: float | None = None, start_now: bool = False,
                  completed_at: float | None = None, hour_meter_h: float | None = None,
                  performed_by: str = "", notes: str = "", now: float | None = None,
                  source: str = "MANUAL") -> MaintenanceRow:
    """Open a work order: scheduled, started immediately, or logged after the fact as completed."""
    now = time.time() if now is None else now
    if kind not in KINDS:
        raise FleetError(f"kind must be one of {list(KINDS)}")
    rec = MaintenanceRow(maintenance_id=new_id("mnt"), machine_id=machine_id, kind=kind, title=title.strip(),
                         detail=detail, status="scheduled", scheduled_for=scheduled_for, performed_by=performed_by,
                         notes=notes, source=source, created_by=None if actor is None else actor.user_id,
                         created_at=now, history=[])
    s.add(rec)
    _log(rec, actor, "created", now)
    if completed_at is not None:
        # Past work entered after the fact: recorded as done, with no downtime interval invented for it.
        rec.status, rec.completed_at, rec.hour_meter_h = "completed", completed_at, hour_meter_h
        _log(rec, actor, "logged_completed", now)
    elif start_now:
        start_record(s, rec, actor, now=now)
    s.flush()
    return rec


def start_record(s: Session, rec: MaintenanceRow, actor: UserRow | None, *, now: float | None = None) -> None:
    """Begin the work: the machine leaves service (``down`` for a repair, ``maintenance`` otherwise)."""
    now = time.time() if now is None else now
    if rec.status != "scheduled":
        raise FleetError(f"only a scheduled work order can be started (this one is {rec.status})")
    _close_open_state(s, rec.machine_id, now)
    s.add(MachineStateRow(machine_id=rec.machine_id, state="down" if rec.kind == "repair" else "maintenance",
                          started_at=now, reason=rec.title, source="MANUAL", maintenance_id=rec.maintenance_id))
    rec.status, rec.started_at = "in_progress", now
    _log(rec, actor, "started", now)


def complete_record(s: Session, rec: MaintenanceRow, actor: UserRow | None, *, hour_meter_h: float | None = None,
                    performed_by: str | None = None, notes: str | None = None,
                    now: float | None = None) -> None:
    """Finish the work and return the machine to service. The meter defaults to the computed reading."""
    now = time.time() if now is None else now
    if rec.status not in OPEN_STATUSES:
        raise FleetError(f"only an open work order can be completed (this one is {rec.status})")
    if rec.status == "in_progress":
        for row in s.execute(select(MachineStateRow).where(MachineStateRow.maintenance_id == rec.maintenance_id,
                                                           MachineStateRow.ended_at.is_(None))).scalars():
            row.ended_at = max(now, row.started_at)
        s.flush()
    if hour_meter_h is None:
        hour_meter_h = hour_meter(s.get(MachineRow, rec.machine_id), state_rows(s, rec.machine_id), now, now)
    rec.status, rec.completed_at, rec.hour_meter_h = "completed", now, hour_meter_h
    if performed_by is not None:
        rec.performed_by = performed_by
    if notes is not None:
        rec.notes = notes
    _log(rec, actor, "completed", now, hour_meter_h=hour_meter_h)


def cancel_record(s: Session, rec: MaintenanceRow, actor: UserRow | None, *, reason: str = "",
                  now: float | None = None) -> None:
    now = time.time() if now is None else now
    if rec.status not in OPEN_STATUSES:
        raise FleetError(f"only an open work order can be cancelled (this one is {rec.status})")
    for row in s.execute(select(MachineStateRow).where(MachineStateRow.maintenance_id == rec.maintenance_id,
                                                       MachineStateRow.ended_at.is_(None))).scalars():
        row.ended_at = max(now, row.started_at)
    rec.status = "cancelled"
    _log(rec, actor, "cancelled", now, note=reason)


EDITABLE: tuple[str, ...] = ("title", "detail", "scheduled_for", "performed_by", "notes", "hour_meter_h")


def edit_record(rec: MaintenanceRow, actor: UserRow | None, changes: dict[str, Any], *,
                now: float | None = None) -> list[str]:
    """Change descriptive fields; every change is written to the history with its old value."""
    now = time.time() if now is None else now
    changed: dict[str, Any] = {}
    for field in EDITABLE:
        if field in changes and getattr(rec, field) != changes[field]:
            changed[field] = {"from": getattr(rec, field), "to": changes[field]}
            setattr(rec, field, changes[field])
    if changed:
        _log(rec, actor, "edited", now, **changed)
    return sorted(changed)


# ---------------------------------------------------------------- SIMULATED demo history
SHIFT_START_UTC_H = 0.5      # 06:00 IST: the demo quarry works one 12 h day shift
SHIFT_LEN_H = 12.0
REST_WEEKDAY = 6             # Sunday off

BREAKDOWN_REASONS = ("Hydraulic hose leak on boom cylinder", "Track tension lost, left side",
                     "Engine coolant over-temperature", "Electrical fault: swing brake solenoid",
                     "Bucket tooth adaptor cracked", "Pilot pressure low, joystick response lag",
                     "Fuel filter blocked, engine derate")
REPAIR_FITTERS = ("Site fitter (simulated)", "Cat dealer field tech (simulated)")

#: Per machine: meter reading at the start of the history, share of engine time spent working,
#: breakdown chance per shift, meter hours left to the next service today, and a forced current state.
PROFILES: dict[str, dict[str, Any]] = {
    "EX-07": {"smu_start": 4_210.0, "work_share": 0.84, "breakdown_p": 0.03, "remaining_h": 312.0},
    "EX-09": {"smu_start": 6_875.0, "work_share": 0.76, "breakdown_p": 0.07, "remaining_h": 138.0},
    "EX-11": {"smu_start": 2_940.0, "work_share": 0.70, "breakdown_p": 0.10, "remaining_h": 22.0,
              "scheduled_service_in_d": 1.5},
    "EX-04": {"smu_start": 9_630.0, "work_share": 0.62, "breakdown_p": 0.14, "remaining_h": -36.0,
              "down_now": ("Main hydraulic pump: whine and pressure loss, pump on order", 5.0 * HOUR)},
}
DEFAULT_PROFILE: dict[str, Any] = {"smu_start": 3_000.0, "work_share": 0.75, "breakdown_p": 0.06,
                                   "remaining_h": 200.0}


def _shift_windows(start: float, end: float) -> list[tuple[float, float]]:
    """Every scheduled shift (clipped to [start, end]) between two times."""
    out = []
    day0 = (start // DAY) * DAY
    day = day0
    while day < end:
        weekday = int(((day / DAY) + 3) % 7)          # 1970-01-01 was a Thursday (weekday 3)
        a, b = day + SHIFT_START_UTC_H * HOUR, day + (SHIFT_START_UTC_H + SHIFT_LEN_H) * HOUR
        if weekday != REST_WEEKDAY and b > start and a < end:
            out.append((max(a, start), min(b, end)))
        day += DAY
    return out


Block = list  # [state, start, end, reason, maintenance_key]


def _generate_blocks(rng: random.Random, start: float, end: float, profile: dict[str, Any],
                     *, breakdowns: bool) -> list[Block]:
    """Operating / idle blocks through every shift, with the odd breakdown. Ends at ``end``."""
    blocks: list[Block] = []
    for a, b in _shift_windows(start, end):
        broke_at = a + rng.uniform(1.0, SHIFT_LEN_H - 2.0) * HOUR if breakdowns and rng.random() < profile["breakdown_p"] else None
        t = a
        while t < b:
            if broke_at is not None and t >= broke_at:
                length = rng.uniform(1.0, 5.0) * HOUR
                blocks.append(["down", t, min(t + length, b), rng.choice(BREAKDOWN_REASONS), None])
                t, broke_at = t + length, None
                continue
            work = rng.uniform(35, 110) * 60 * profile["work_share"] / 0.8
            blocks.append(["operating", t, min(t + work, b), "", None])
            t += work
            if t < b:
                idle = rng.uniform(5, 30) * 60 * (1.0 - profile["work_share"]) / 0.2
                blocks.append(["idle", t, min(t + idle, b), rng.choice(("Waiting for truck", "Repositioning",
                                                                         "Operator break", "")), None])
                t += idle
    return blocks


def _carve(blocks: list[Block], a: float, b: float, state: str, reason: str, key: str) -> list[Block]:
    """Replace whatever the blocks say about [a, b] with one block of ``state``."""
    out: list[Block] = []
    for blk in blocks:
        if blk[2] <= a or blk[1] >= b:
            out.append(blk)
            continue
        if blk[1] < a:
            out.append([blk[0], blk[1], a, blk[3], blk[4]])
        if blk[2] > b:
            out.append([blk[0], b, blk[2], blk[3], blk[4]])
    out.append([state, a, b, reason, key])
    return sorted(out, key=lambda x: x[1])


def _engine_back(blocks: list[Block], until: float, hours: float) -> float | None:
    """The time at which ``hours`` of engine-on time remain before ``until``; ``None`` if history runs out."""
    need = hours * HOUR
    for blk in sorted(blocks, key=lambda x: x[1], reverse=True):
        if blk[0] not in ENGINE_ON or blk[1] >= until:
            continue
        span = min(blk[2], until) - blk[1]
        if span >= need:
            return min(blk[2], until) - need
        need -= span
    return None


def _engine_between(blocks: list[Block], a: float, b: float) -> float:
    return sum(max(0.0, min(blk[2], b) - max(blk[1], a)) for blk in blocks if blk[0] in ENGINE_ON) / HOUR


def _seed_machine(s: Session, machine: MachineRow, operator_id: str | None, *, now: float,
                  days: int) -> dict[str, Any]:
    """Thirty days of SIMULATED history for one machine, shaped by its profile."""
    profile = PROFILES.get(machine.machine_id, DEFAULT_PROFILE)
    rng = random.Random(zlib.crc32(machine.machine_id.encode()))
    cfg = FleetConfig.load()
    interval = service_interval(machine, cfg)
    start = now - days * DAY
    down_now = profile.get("down_now")
    gen_end = now - down_now[1] if down_now else now
    blocks = _generate_blocks(rng, start, gen_end, profile, breakdowns=True)

    # Weekly inspection at the start of the first shift of each week (45 min, planned).
    inspections: dict[str, float] = {}
    for a, _b in _shift_windows(start, gen_end):
        weekday = int(((a // DAY) + 3) % 7)
        if weekday == 0 and a + 0.75 * HOUR < gen_end:
            key = f"insp-{int(a)}"
            blocks = _carve(blocks, a, a + 0.75 * HOUR, "maintenance", "Weekly walk-around and undercarriage inspection", key)
            inspections[key] = a

    # Planned services, walked back from today so the meter lands where the profile says.
    services: list[tuple[str, float, float]] = []
    anchor, target = gen_end, interval - profile["remaining_h"]
    while True:
        at = _engine_back(blocks, anchor, target)
        if at is None:
            break
        key = f"svc-{int(at)}"
        blocks = _carve(blocks, at - 3.5 * HOUR, at, "maintenance", f"{int(interval)} h planned service", key)
        services.append((key, at - 3.5 * HOUR, at))
        anchor, target = at - 3.5 * HOUR, interval
    engine_rate = max(_engine_between(blocks, start, gen_end) / max((gen_end - start) / DAY, 1.0), 1.0)

    # Before the window: the service that precedes the first one we drew, so "last serviced" is never blank.
    already = _engine_between(blocks, start, anchor)
    before_h = target - already
    pre_service = (start - before_h / engine_rate * DAY, profile["smu_start"] - before_h)

    if down_now:
        blocks.append(["down", gen_end, None, down_now[0], "repair-now"])

    # Write the machine's meter base, the intervals and the work orders.
    machine.meta = {**(machine.meta or {}), "smu_base_h": profile["smu_start"], "smu_base_ts": start,
                    "service_interval_h": interval, "fleet_history": "SIMULATED"}
    records: dict[str, MaintenanceRow] = {}

    def smu_at(t: float) -> float:
        return round(profile["smu_start"] + _engine_between([b for b in blocks if b[2] is not None], start, t), 1)

    for key, a, b in services:
        records[key] = MaintenanceRow(
            maintenance_id=new_id("mnt"), machine_id=machine.machine_id, kind="service",
            title=f"{int(interval)} h planned service", detail="Engine oil and filters, fuel filters, hydraulic "
            "return filter, grease points, S-O-S fluid sample.", status="completed", scheduled_for=a,
            started_at=a, completed_at=b, hour_meter_h=smu_at(b), performed_by="Cat dealer PM team (simulated)",
            notes="No findings.", source="SIMULATED", created_at=a - 3 * DAY, history=[])
    for key, a in inspections.items():
        records[key] = MaintenanceRow(
            maintenance_id=new_id("mnt"), machine_id=machine.machine_id, kind="inspection",
            title="Weekly walk-around and undercarriage inspection", detail="Tracks, rollers, idlers, GET, "
            "hoses and guards.", status="completed", scheduled_for=a, started_at=a, completed_at=a + 0.75 * HOUR,
            hour_meter_h=smu_at(a + 0.75 * HOUR), performed_by="Site fitter (simulated)",
            notes=rng.choice(("All within limits.", "Track sag at upper limit; re-tension at next service.",
                              "Two bucket teeth at 60 % wear.")), source="SIMULATED", created_at=a - DAY, history=[])
    for blk in blocks:
        if blk[0] == "down" and blk[4] is None:
            key = f"rep-{int(blk[1])}"
            blk[4] = key
            records[key] = MaintenanceRow(
                maintenance_id=new_id("mnt"), machine_id=machine.machine_id, kind="repair", title=blk[3],
                detail="Breakdown during shift; machine stopped until repaired.", status="completed",
                started_at=blk[1], completed_at=blk[2], hour_meter_h=smu_at(blk[2]),
                performed_by=rng.choice(REPAIR_FITTERS), notes="Returned to service after test run.",
                source="SIMULATED", created_at=blk[1], history=[])
    records["pre"] = MaintenanceRow(
        maintenance_id=new_id("mnt"), machine_id=machine.machine_id, kind="service",
        title=f"{int(interval)} h planned service", detail="Engine oil and filters, fuel filters, grease points.",
        status="completed", scheduled_for=pre_service[0], started_at=pre_service[0] - 3.5 * HOUR,
        completed_at=pre_service[0], hour_meter_h=round(pre_service[1], 1),
        performed_by="Cat dealer PM team (simulated)", notes="No findings.", source="SIMULATED",
        created_at=pre_service[0] - 3 * DAY, history=[])
    if down_now:
        records["repair-now"] = MaintenanceRow(
            maintenance_id=new_id("mnt"), machine_id=machine.machine_id, kind="repair", title=down_now[0],
            detail="Operator reported pump whine and slow boom; pressure test confirmed loss. Machine tagged out.",
            status="in_progress", started_at=gen_end, performed_by="Cat dealer field tech (simulated)",
            source="SIMULATED", created_at=gen_end, history=[])
    if profile.get("scheduled_service_in_d") or down_now:
        when = now + float(profile.get("scheduled_service_in_d", 1.0)) * DAY
        records["next"] = MaintenanceRow(
            maintenance_id=new_id("mnt"), machine_id=machine.machine_id, kind="service",
            title=f"{int(interval)} h planned service", detail="Book with the dealer PM team.", status="scheduled",
            scheduled_for=when, source="SIMULATED", created_at=now - DAY, history=[])
    for rec in records.values():
        rec.history = [{"ts": rec.created_at, "ts_gmt": gmt_iso(rec.created_at), "action": "created",
                        "by": None, "by_name": "Simulated history"}]
        s.add(rec)

    for state, a, b, reason, key in blocks:
        if b is not None and b - a < 30:
            continue
        s.add(MachineStateRow(machine_id=machine.machine_id, state=state, started_at=a,
                              ended_at=None if b is not None and b >= now else b, reason=reason,
                              source="SIMULATED", maintenance_id=records[key].maintenance_id if key in records else None,
                              operator_id=operator_id if state in ENGINE_ON else None))
    return {"intervals": len(blocks), "work_orders": len(records)}


def _top_up(s: Session, machine: MachineRow, operator_id: str | None, rows: list[MachineStateRow],
            *, now: float) -> int:
    """Extend a SIMULATED log to ``now`` (operating/idle only), so the demo history keeps moving.

    Cheap to call on every read: it does nothing while the current interval is still plausibly
    running (under 2 h) or the log is less than 15 min behind, and never touches a machine that a
    work order is holding.
    """
    last = max(rows, key=lambda r: r.started_at)
    if last.ended_at is None:
        if last.source != "SIMULATED" or last.maintenance_id or now - last.started_at < 2 * HOUR:
            return 0
        rng = random.Random(zlib.crc32(f"{machine.machine_id}-{int(last.started_at)}".encode()))
        last.ended_at = min(now, last.started_at + rng.uniform(0.5, 1.5) * HOUR)
    begin = max(r.ended_at or 0.0 for r in rows)
    if now - begin < 15 * 60:
        return 0
    profile = PROFILES.get(machine.machine_id, DEFAULT_PROFILE)
    rng = random.Random(zlib.crc32(f"{machine.machine_id}-{int(begin)}".encode()))
    blocks = _generate_blocks(rng, begin, now, profile, breakdowns=False)
    for state, a, b, reason, _key in blocks:
        s.add(MachineStateRow(machine_id=machine.machine_id, state=state, started_at=a,
                              ended_at=None if b >= now else b, reason=reason, source="SIMULATED",
                              operator_id=operator_id if state in ENGINE_ON else None))
    return len(blocks)


def _operators_by_machine(s: Session) -> dict[str, str]:
    out: dict[str, str] = {}
    for user in s.execute(select(UserRow).where(UserRow.machine_id.is_not(None), UserRow.role == "operator")
                          .order_by(UserRow.user_id)).scalars():
        out.setdefault(user.machine_id, user.user_id)
    return out


def advance_simulation(s: Session, *, now: float | None = None) -> dict[str, int]:
    """Top up the SIMULATED log of every machine whose history is simulated (never a real feed)."""
    now = time.time() if now is None else now
    operators = _operators_by_machine(s)
    out: dict[str, int] = {}
    for machine in s.execute(select(MachineRow).order_by(MachineRow.machine_id)).scalars():
        if (machine.meta or {}).get("fleet_history") != "SIMULATED":
            continue
        rows = state_rows(s, machine.machine_id)
        if rows and (added := _top_up(s, machine, operators.get(machine.machine_id), rows, now=now)):
            out[machine.machine_id] = added
    if out:
        s.flush()
    return out


def seed_fleet_history(s: Session, *, now: float | None = None, days: int = 30) -> dict[str, Any]:
    """Idempotent: give every machine without a state log 30 days of SIMULATED history, and top up the rest."""
    now = time.time() if now is None else now
    operators = _operators_by_machine(s)
    created: dict[str, Any] = {}
    for machine in s.execute(select(MachineRow).order_by(MachineRow.machine_id)).scalars():
        if not state_rows(s, machine.machine_id):
            created[machine.machine_id] = _seed_machine(s, machine, operators.get(machine.machine_id),
                                                        now=now, days=days)
    s.flush()
    return {"created": created, "topped_up": advance_simulation(s, now=now), "label": "SIMULATED"}


def machines_by_id(s: Session) -> dict[str, MachineRow]:
    return {m.machine_id: m for m in s.execute(select(MachineRow).order_by(MachineRow.machine_id)).scalars()}


def all_state_rows(s: Session, machine_ids: Iterable[str]) -> dict[str, list[MachineStateRow]]:
    """Every machine's state log in one query (the meter needs history back to its base reading)."""
    out: dict[str, list[MachineStateRow]] = {m: [] for m in machine_ids}
    for row in s.execute(select(MachineStateRow).order_by(MachineStateRow.started_at, MachineStateRow.id)).scalars():
        out.setdefault(row.machine_id, []).append(row)
    return out
