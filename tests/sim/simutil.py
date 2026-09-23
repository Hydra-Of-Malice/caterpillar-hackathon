"""Helpers for simulator tests: short scenarios and row filters."""
from __future__ import annotations

import itertools
from typing import Any

from sentinel.sim.generator import ShiftSimulator
from sentinel.sim.scenario import Scenario

RAVI = {"near_truck_dps": 20.0, "near_truck_sd": 2.5, "zone_m": 5.45}


def loading_scenario(minutes: float = 12.0, archetype: str = "novice_improving", skill: float = 0.1,
                     overrides: dict[str, float] | None = None, cues: list[dict[str, Any]] | None = None) -> Scenario:
    """A short truck-loading shift with a truck already positioned (engine starts at t≈2 s)."""
    return Scenario.model_validate({
        "version": "test", "name": "test_loading", "machines": {"EX-07": {"smu_h": 6400.0}},
        "shifts": [{
            "shift_id": "SH-TEST", "operator_id": "OP-1042", "machine_id": "EX-07", "archetype": archetype,
            "skill": skill, "start": "2026-09-23T07:00:00+05:30",
            "operator_overrides": RAVI if overrides is None else overrides,
            "schedule": [{"kind": "warmup", "minutes": 0.25, "zone": "TL-1"},
                         {"kind": "task", "minutes": minutes, "task_id": "T-1", "task_type": "truck_loading",
                          "zone": "TL-1", "truck_gap_s": 40, "passes_per_truck": 5, "truck_present": True}],
            "cues": cues or [],
        }],
    })


def run_rows(sim: ShiftSimulator, n: int, inject_at: dict[int, tuple[str, dict[str, Any]]] | None = None
             ) -> list[dict[str, Any]]:
    """Collect n rows, calling sim.inject(kind, **params) at the given row indices."""
    rows = []
    inject_at = inject_at or {}
    for i, row in enumerate(itertools.islice(sim.rows(), n)):
        rows.append(row)
        if i in inject_at:
            kind, params = inject_at[i]
            sim.inject(kind, **params)
    return rows


def labelled(rows: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [r for r in rows if (r["gt"] or {}).get("inject") == kind or kind in (r["gt"] or {}).get("injects", [])]
