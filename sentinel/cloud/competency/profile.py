"""Operator Profile view (05 §5.4): operator, competencies with evidence, exposure, training history."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.competency.catalog import Catalog, get_catalog
from sentinel.cloud.competency.history import load_history
from sentinel.cloud.competency.service import competency_view
from sentinel.store.models import (BookingRow, MachineRow, OperatorCompetencyRow, OperatorRow,
                                   TrainingRecordRow)


def experience_band(hours: float, bands: dict[str, float]) -> str:
    """novice / intermediate / experienced from operating hours (05 §5.4 bands, config-driven)."""
    if hours < bands.get("novice", 500):
        return "novice"
    return "intermediate" if hours < bands.get("intermediate", 4000) else "experienced"


def build_profile(s: Session, operator_id: str, catalog: Catalog | None = None) -> dict[str, Any] | None:
    """The profile, or None when the operator is unknown to the cloud."""
    catalog = catalog or get_catalog()
    op = s.get(OperatorRow, operator_id)
    history = load_history(s, operator_id)
    rows = {r.competency_id: r for r in s.scalars(
        select(OperatorCompetencyRow).where(OperatorCompetencyRow.operator_id == operator_id))}
    if op is None and not history.shifts and not rows:
        return None
    machine_types = {m.machine_id: m.machine_type for m in s.scalars(select(MachineRow))}
    shift_machine = {sh.shift_id: sh.machine_id for sh in history.shifts}
    by_context: dict[str, dict[str, float]] = {}
    for x in history.exposure:
        key = f"{machine_types.get(shift_machine.get(x.shift_id) or '', 'EX-20t')}|{x.task_type}"
        agg = by_context.setdefault(key, {"operating_h": 0.0, "cycles": 0, "truck_approach_cycles": 0})
        agg["operating_h"] = round(agg["operating_h"] + x.operating_h, 3)
        agg["cycles"] += x.cycles
        agg["truck_approach_cycles"] += x.truck_approach_cycles
    training = [{"kind": r.kind, "module_id": r.module_id, "score": r.score, "passed": r.passed,
                 "ts": r.ts, "data": r.data}
                for r in s.scalars(select(TrainingRecordRow).where(TrainingRecordRow.operator_id == operator_id)
                                   .order_by(TrainingRecordRow.ts))]
    bookings = [{"booking_id": b.booking_id, "instructor_id": b.instructor_id, "slot_start": b.slot_start,
                 "slot_end": b.slot_end, "format": b.format, "competency_id": b.competency_id,
                 "status": b.status, "mock": True}
                for b in s.scalars(select(BookingRow).where(BookingRow.operator_id == operator_id))]
    hours = op.operating_hours if op else 0.0
    return {
        "operator": {
            "operator_id": operator_id,
            "name": op.name if op else None,
            "role": op.role if op else "operator",
            "experience_months": op.experience_months if op else None,
            "operating_hours": hours,
            "experience_band": experience_band(hours, catalog.experience_bands_h),
            "archetype": op.archetype if op else None,
        },
        "competencies": [competency_view(rows.get(c.id), c) for c in catalog.ordered()],
        "exposure": {
            "by_context": by_context,
            "total_operating_h": round(sum(x.operating_h for x in history.exposure), 3),
            "n_shifts": len(history.shifts),
        },
        "training_history": training,
        "bookings": bookings,
        "versions": {"catalog": catalog.version},
        "note": "Inferred states guide coaching only; they are never used for pay, discipline or authorisation.",
        "label": "SIMULATED",
    }
