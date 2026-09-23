"""MOCK instructor and simulator booking (no real LMS/calendar integration)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.competency.state import get_row
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import new_id
from sentinel.store.models import BookingRow, TrainingRecordRow

SLOT_S = 3600.0


class SlotUnavailable(ValueError):
    """The requested slot does not exist or is already booked."""


def _settings() -> dict[str, Any]:
    return load_yaml("cloud")["bookings"]


def instructors() -> list[dict[str, Any]]:
    return [{**i, "mock": True} for i in _settings()["instructors"]]


def _weekdays(start: date, n: int) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def slots(s: Session, from_date: date, instructor_id: str | None = None) -> list[dict[str, Any]]:
    """Generated one-hour slots on the next working days, with booked ones marked unavailable."""
    cfg = _settings()
    booked = {(b.instructor_id, b.slot_start) for b in s.scalars(
        select(BookingRow).where(BookingRow.status == "confirmed"))}
    out = []
    for ins in cfg["instructors"]:
        if instructor_id and ins["instructor_id"] != instructor_id:
            continue
        for day in _weekdays(from_date, int(cfg["days_ahead"])):
            for hour in ins["slot_hours_utc"]:
                start = datetime(day.year, day.month, day.day, hour, tzinfo=timezone.utc)
                ts = start.timestamp()
                out.append({"slot_id": f"{ins['instructor_id']}-{start:%Y%m%d%H}",
                            "instructor_id": ins["instructor_id"], "instructor_name": ins["name"],
                            "slot_start": ts, "slot_end": ts + SLOT_S, "start_iso": start.isoformat(),
                            "formats": ins["formats"], "location": ins["location"],
                            "available": (ins["instructor_id"], ts) not in booked, "mock": True})
    return out


def create_booking(s: Session, operator_id: str, instructor_id: str, slot_start: float, fmt: str,
                   competency_id: str | None) -> dict[str, Any]:
    """Book a slot (MOCK). Attaches the competency's gap evidence so the instructor sees why."""
    ins = next((i for i in _settings()["instructors"] if i["instructor_id"] == instructor_id), None)
    if ins is None:
        raise SlotUnavailable(f"unknown instructor {instructor_id!r}")
    if fmt not in ins["formats"]:
        raise SlotUnavailable(f"{instructor_id} does not offer format {fmt!r}")
    slot_day = datetime.fromtimestamp(slot_start, tz=timezone.utc)
    if slot_day.hour not in ins["slot_hours_utc"] or slot_day.minute or slot_day.weekday() >= 5:
        raise SlotUnavailable("no such slot")
    taken = s.scalars(select(BookingRow).where(BookingRow.instructor_id == instructor_id,
                                               BookingRow.slot_start == slot_start,
                                               BookingRow.status == "confirmed")).first()
    if taken is not None:
        raise SlotUnavailable("slot already booked")
    evidence: dict[str, Any] = {}
    if competency_id:
        row = get_row(s, operator_id, competency_id, create=False)
        gap = ((row.evidence or {}).get("gap") or {}) if row else {}
        evidence = {k: gap.get(k) for k in ("why", "n_events", "n_shifts", "opportunities", "posterior_p")
                    if k in gap}
    booking = BookingRow(booking_id=new_id("bkg"), operator_id=operator_id, instructor_id=instructor_id,
                         slot_start=slot_start, slot_end=slot_start + SLOT_S, format=fmt,
                         competency_id=competency_id, evidence=evidence, status="confirmed")
    s.add(booking)
    s.add(TrainingRecordRow(operator_id=operator_id, module_id=competency_id or "", kind="booking",
                            data={"booking_id": booking.booking_id, "instructor_id": instructor_id, "mock": True}))
    return {"booking_id": booking.booking_id, "operator_id": operator_id, "instructor_id": instructor_id,
            "instructor_name": ins["name"], "slot_start": slot_start, "slot_end": booking.slot_end, "format": fmt,
            "location": ins["location"], "competency_id": competency_id, "evidence": evidence,
            "status": "confirmed", "mock": True, "message": "Booked (MOCK). Added to your shift calendar."}
