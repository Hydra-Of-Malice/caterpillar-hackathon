"""Exposure normalisation: opportunities per shift in the competency's own unit (08 §8.3 step 4)."""
from __future__ import annotations

from sentinel.cloud.competency.catalog import Competency
from sentinel.cloud.competency.history import ExposureRecord

UNIT_LABELS = {
    "truck_approach_cycles": "loading cycles",
    "cycles": "work cycles",
    "operating_h": "operating hours",
    "shifts": "shifts",
}


def record_value(comp: Competency, rec: ExposureRecord) -> float:
    """Opportunities contributed by one exposure record (0 if its task type does not apply)."""
    if comp.task_types and rec.task_type not in comp.task_types:
        return 0.0
    if comp.exposure_unit == "truck_approach_cycles":
        return float(rec.truck_approach_cycles)
    if comp.exposure_unit == "cycles":
        return float(rec.cycles)
    if comp.exposure_unit == "operating_h":
        return float(rec.operating_h)
    raise ValueError(f"record_value does not apply to unit {comp.exposure_unit!r}")


def exposure_by_shift(comp: Competency, shift_ids: list[str],
                      records: list[ExposureRecord]) -> dict[str, float]:
    """Opportunities per shift. The 'shifts' unit counts each shift in the window once."""
    if comp.exposure_unit == "shifts":
        return {sid: 1.0 for sid in shift_ids}
    out = {sid: 0.0 for sid in shift_ids}
    for rec in records:
        if rec.shift_id in out:
            out[rec.shift_id] += record_value(comp, rec)
    return out


def exposure_by_stratum(comp: Competency, shift_ids: set[str],
                        records: list[ExposureRecord]) -> dict[str, float]:
    """Opportunities per context stratum (task type) over a set of shifts."""
    if comp.exposure_unit == "shifts":
        return {"all": float(len(shift_ids))}
    out: dict[str, float] = {}
    for rec in records:
        if rec.shift_id not in shift_ids:
            continue
        value = record_value(comp, rec)
        if value > 0:
            key = rec.task_type if comp.task_types else "all"
            out[key] = out.get(key, 0.0) + value
    return out
