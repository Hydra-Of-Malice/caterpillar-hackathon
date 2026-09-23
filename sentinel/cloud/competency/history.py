"""Load an operator's shifts, events and exposure from the cloud DB into light records."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.models import EventRow, ExposureRow, IncidentRow, ShiftRow


@dataclass(frozen=True)
class ShiftInfo:
    shift_id: str
    start: float | None
    end: float | None
    machine_id: str | None


@dataclass(frozen=True)
class EventRecord:
    event_id: str
    ts: float
    shift_id: str | None
    machine_id: str
    type: str
    attribution: str
    context: dict[str, Any]
    competency_ids: list[str]
    simulated: bool


@dataclass(frozen=True)
class ExposureRecord:
    shift_id: str
    task_type: str
    operating_h: float
    cycles: int
    truck_approach_cycles: int


@dataclass
class OperatorHistory:
    operator_id: str
    shifts: list[ShiftInfo]                  # chronological; unknown start sorts last
    events: list[EventRecord]
    exposure: list[ExposureRecord]
    disputed_event_ids: set[str] = field(default_factory=set)

    def shift(self, shift_id: str) -> ShiftInfo | None:
        return next((sh for sh in self.shifts if sh.shift_id == shift_id), None)

    def events_in(self, shift_ids: set[str]) -> list[EventRecord]:
        return [e for e in self.events if e.shift_id in shift_ids]

    def exposure_in(self, shift_ids: set[str]) -> list[ExposureRecord]:
        return [x for x in self.exposure if x.shift_id in shift_ids]


def _event_record(row: EventRow) -> EventRecord:
    data = row.data or {}
    return EventRecord(
        event_id=row.event_id, ts=row.ts, shift_id=row.shift_id, machine_id=row.machine_id,
        type=row.type, attribution=row.attribution or "unknown",
        context=dict(data.get("context") or {}), competency_ids=list(data.get("competency_ids") or []),
        simulated=bool(data.get("simulated", True)),
    )


def load_history(s: Session, operator_id: str) -> OperatorHistory:
    """All shifts, events, exposure and disputed event ids for one operator.

    A shift is known if a shift row, an event or an exposure row names it. Shifts without a shift
    row take their start from their earliest event.
    """
    events = [_event_record(r) for r in s.scalars(
        select(EventRow).where(EventRow.operator_id == operator_id).order_by(EventRow.ts))]
    exposure = [ExposureRecord(x.shift_id, x.task_type, x.operating_h or 0.0, x.cycles or 0,
                               x.truck_approach_cycles or 0)
                for x in s.scalars(select(ExposureRow).where(ExposureRow.operator_id == operator_id))]
    shifts: dict[str, ShiftInfo] = {}
    for row in s.scalars(select(ShiftRow).where(ShiftRow.operator_id == operator_id)):
        start = row.started_at if row.started_at is not None else row.planned_start
        end = row.ended_at if row.ended_at is not None else row.planned_end
        shifts[row.shift_id] = ShiftInfo(row.shift_id, start, end, row.machine_id)
    first_ts: dict[str, float] = {}
    last_ts: dict[str, float] = {}
    machine: dict[str, str] = {}
    for e in events:
        if e.shift_id is None:
            continue
        first_ts[e.shift_id] = min(first_ts.get(e.shift_id, e.ts), e.ts)
        last_ts[e.shift_id] = max(last_ts.get(e.shift_id, e.ts), e.ts)
        machine.setdefault(e.shift_id, e.machine_id)
    for sid in set(first_ts) | {x.shift_id for x in exposure}:
        if sid not in shifts:
            shifts[sid] = ShiftInfo(sid, first_ts.get(sid), last_ts.get(sid), machine.get(sid))
    ordered = sorted(shifts.values(), key=lambda sh: (sh.start is None, sh.start or 0.0, sh.shift_id))
    disputed: set[str] = set()
    for inc in s.scalars(select(IncidentRow).where(IncidentRow.operator_id == operator_id)):
        if (inc.data or {}).get("dispute_status") == "disputed":
            disputed.update((inc.data or {}).get("event_ids") or [])
    return OperatorHistory(operator_id, ordered, events, exposure, disputed)
