"""DEMO_MODE seeding: make every cloud view meaningful before the edge has synced (SIMULATED)."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from sentinel.cloud.competency.demo_fixture import (DEMO_OPERATOR, FIXTURE_SHIFTS, ensure_demo_history,
                                                    ensure_reference_data)
from sentinel.cloud.competency.service import evaluate_shift
from sentinel.cloud.competency.state import get_row
from sentinel.cloud.roles import Role


def seed_demo(s: Session) -> dict[str, Any]:
    """If Ravi has no C04 gap evidence yet, load Shift 0 + Shift 1 (SIMULATED) and evaluate Shift 1.

    Idempotent: does nothing once a C04 gap has been flagged (from fixtures or from synced data).
    """
    ensure_reference_data(s)
    row = get_row(s, DEMO_OPERATOR, "C04", create=False)
    if row is not None and (row.evidence or {}).get("gap"):
        return {"seeded": False, "reason": "C04 gap evidence already present"}
    shift_id = FIXTURE_SHIFTS["shift1"].default_shift_id
    loaded = ensure_demo_history(s, DEMO_OPERATOR, shift_id)
    result = evaluate_shift(s, DEMO_OPERATOR, shift_id, requested_by=Role.system)
    return {"seeded": True, "fixture_loaded": loaded, "gaps": [g["competency_id"] for g in result["gaps"]],
            "label": "SIMULATED"}
