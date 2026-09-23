"""Training recommendations with the evidence shown first (08 §8.4 assignment policy)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.competency.catalog import Catalog
from sentinel.cloud.training.modules import ModuleStore, module_summary
from sentinel.shared.schemas import CompetencyState as CS
from sentinel.store.models import OperatorCompetencyRow, ShiftRow, TaskRow, TrainingRecordRow

GAP_STATES = (CS.observed_gap.value, CS.in_training.value, CS.improving.value)
POLICY = "Delivered before or after the shift only, never in-cab while moving; at most one new module a day."


def recommendations(s: Session, operator_id: str, store: ModuleStore, catalog: Catalog) -> dict[str, Any]:
    """Modules for open competency gaps and for today's tasks, each with a `why`."""
    completed = {r.module_id for r in s.scalars(select(TrainingRecordRow).where(
        TrainingRecordRow.operator_id == operator_id, TrainingRecordRow.kind == "module_completed"))}
    recs: dict[str, dict[str, Any]] = {}

    def add(module_id: str, why: dict[str, Any]) -> None:
        mv = store.latest_approved(module_id)
        if mv is None:
            return
        rec = recs.setdefault(module_id, {"module": module_summary(mv, store), "why": [],
                                          "status": "completed" if module_id in completed else "not_started"})
        rec["why"].append(why)

    rows = s.scalars(select(OperatorCompetencyRow).where(OperatorCompetencyRow.operator_id == operator_id,
                                                         OperatorCompetencyRow.state.in_(GAP_STATES)))
    for row in rows:
        comp = catalog.competencies.get(row.competency_id)
        ev = (row.evidence or {}).get("gap") or {}
        if comp is None:
            continue
        for module_id in comp.module_ids:
            add(module_id, {"reason": "competency_gap", "competency_id": comp.id, "competency_label": comp.label,
                            "state": row.state, "text": ev.get("why"), "n_events": ev.get("n_events"),
                            "n_shifts": ev.get("n_shifts"), "opportunities": ev.get("opportunities"),
                            "posterior_p": ev.get("posterior_p"), "confidence": ev.get("confidence"),
                            "provenance": ["RULE", "ML", ev.get("data_provenance", "SIMULATED")]})
    latest_shift = s.scalars(select(ShiftRow).where(ShiftRow.operator_id == operator_id)
                             .order_by(ShiftRow.planned_start.desc())).first()
    if latest_shift is not None:
        for task in s.scalars(select(TaskRow).where(TaskRow.shift_id == latest_shift.shift_id)):
            if task.required_module_id and task.status != "done":
                text = (f"Before your first {task.type.replace('_', ' ')} task on this site today"
                        if task.first_on_site else f"Required for task {task.name}")
                add(task.required_module_id, {"reason": "required_for_task", "task_id": task.task_id,
                                              "text": text})
    ordered = sorted(recs.values(), key=lambda r: (r["status"] == "completed",
                                                   r["why"][0]["reason"] != "required_for_task"))
    return {"operator_id": operator_id, "recommendations": ordered, "policy": POLICY}
