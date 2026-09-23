"""Deterministic SIMULATED demo history so every cloud view has data before the edge syncs.

Shift 0 (seeded prior shift): 2 over-envelope loading cycles of 39.
Shift 1 (today):              5 of 42, plus machine-attributed hydraulic spikes (excluded from
                              competency counts; the same signature also appears with a second operator),
                              2 seatbelt events in one shift (below the recurrence floor), idle events
                              for the idle breakdown, alerts incl. one T4 escalation, tasks, health and
                              feature windows. A second machine (EX-09, Anita) fills the crew view.
Shift 2 (after training):     2 of 45 — a generator parameter change, not evidence of efficacy.

Evaluating Shift 1 gives the C04 gap: 7 events, 2 shifts, 81 loading cycles, P(rate > 0.05) ≈ 0.90.
Every row carries simulated=True and evidence.fixture so it is never mistaken for observed data.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.competency.history import load_history
from sentinel.cloud.competency.state import get_row
from sentinel.shared import config
from sentinel.shared.schemas import (SIGNAL_WORD, Alert, AlertState, Attribution, CompetencyState, Event,
                                     FeatureContribution, FeatureWindow, Provenance, RiskCategory, Tier)
from sentinel.store.models import (AlertRow, EventRow, ExposureRow, FeatureWindowRow, MachineRow, OperatorRow,
                                   ShiftRow, TaskRow)

DEMO_OPERATOR = "OP-1042"
DEMO_MACHINE = "EX-07"
ANCHOR_TS = datetime(2026, 9, 23, 6, 0, tzinfo=timezone.utc).timestamp()   # Shift 1 start (SIMULATED)
DAY_S = 86_400.0
SHIFT_LEN_S = 8.5 * 3600
FIXTURE_TAG = "demo_fixture-0.1"
CONTEXT_KEY = "EX-20t|truck_loading"
WINDOW_FEATURES = {"swing_dps_peak": (24.0, 4.0), "approach_speed_mps": (1.1, 0.25), "joy_jerk": (0.8, 0.2),
                   "hyd_pressure_mean_bar": (210.0, 18.0), "idle_frac": (0.12, 0.05)}

# (operator_id, name, role, experience_months, operating_hours, archetype) — fictional demo world
OPERATORS = [
    ("OP-1042", "Ravi Kumar", "operator", 3, 212.0, "novice_improving"),
    ("OP-1007", "Anita Rao", "operator", 108, 14500.0, "expert"),
    ("OP-1019", "Joe Mendes", "operator", 30, 2400.0, "intermediate"),
    ("OP-1033", "Lena Ortiz", "operator", 26, 2100.0, "late_shift_degradation"),
    ("SUP-01", "Priya Nair", "supervisor", 0, 0.0, None),
    ("INS-01", "Marcus Lee", "instructor", 0, 0.0, None),
]
MACHINES = [("EX-07", "Cat 320 (simulated)", "EX-20t"), ("EX-09", "Cat 320 (simulated)", "EX-20t")]


@dataclass(frozen=True)
class FixtureShift:
    key: str
    default_shift_id: str
    day_offset: int
    loading_cycles: int
    over_envelope: int
    extras: bool          # machine/seatbelt/idle/alert/task/window rows (Shift 1 only)


FIXTURE_SHIFTS = {
    "shift0": FixtureShift("shift0", "SH-OP1042-S0", -1, 39, 2, False),
    "shift1": FixtureShift("shift1", "SH-OP1042-S1", 0, 42, 5, True),
    "shift2": FixtureShift("shift2", "SH-OP1042-S2", 1, 45, 2, False),
}


def ensure_reference_data(s: Session) -> None:
    """Insert the fictional operators and machines if they are missing (never overwrites)."""
    for op_id, name, role, months, hours, archetype in OPERATORS:
        if s.get(OperatorRow, op_id) is None:
            s.add(OperatorRow(operator_id=op_id, name=name, role=role, experience_months=months,
                              operating_hours=hours, archetype=archetype, meta={"simulated": True}))
    for machine_id, model, machine_type in MACHINES:
        if s.get(MachineRow, machine_id) is None:
            s.add(MachineRow(machine_id=machine_id, model=model, machine_type=machine_type,
                             site_id=config.SITE_ID, prox_fitted=True, meta={"simulated": True}))
    s.flush()


def _event(shift_id: str, operator_id: str, idx: str, ts: float, type_: str, category: RiskCategory,
           tier: Tier | None, attribution: Attribution, context: dict[str, Any], provenance: list[Provenance],
           key: str, evidence: dict[str, Any] | None = None, explanation: list[FeatureContribution] | None = None,
           competency_ids: list[str] | None = None, machine_id: str = DEMO_MACHINE) -> Event:
    return Event(event_id=f"evt_fx_{shift_id}_{idx}", ts=ts, site_id=config.SITE_ID, machine_id=machine_id,
                 operator_id=operator_id, shift_id=shift_id, task_id=context.get("task_id"), type=type_,
                 category=category, tier=tier, provenance=provenance, rule_version=FIXTURE_TAG,
                 attribution=attribution, context=context, explanation=explanation or [],
                 evidence={"fixture": FIXTURE_TAG, "fixture_shift": key, **(evidence or {})},
                 competency_ids=competency_ids or [], simulated=True)


def _swing_events(spec: FixtureShift, shift_id: str, operator_id: str, start: float) -> list[Event]:
    events = []
    span = 4.0 * 3600
    for i in range(spec.over_envelope):
        ts = start + 1800 + (i + 0.5) * span / spec.over_envelope
        peak = 36.0 + 1.5 * i
        z = round((peak - 24.0) / 4.0, 2)
        events.append(_event(
            shift_id, operator_id, f"swing_{i:02d}", ts, "fast_swing_near_truck", RiskCategory.dangerous_condition,
            Tier.T2 if i % 2 else Tier.T1, Attribution.operator,
            {"task_type": "truck_loading", "task_id": "T-1", "zone": "TL-1", "truck_m": 4.6,
             "waiting_for_truck": False, "cycle_phase": "swing_loaded"},
            [Provenance.RULE, Provenance.ML, Provenance.SIMULATED], spec.key,
            evidence={"peak_swing_dps": peak, "expert_p90_dps": 30.0},
            explanation=[FeatureContribution(feature="swing_dps_peak_near_truck", label="Swing rate near truck",
                                             value=peak, baseline_mean=24.0, baseline_std=4.0, z=z, unit="deg/s")],
            competency_ids=["C04"]))
    return events


def _shift1_extras(shift_id: str, operator_id: str, start: float) -> list[Event]:
    ctx = {"task_type": "truck_loading", "task_id": "T-1", "zone": "TL-1"}
    dtc = ["HYD-P-201 (simulated)"]
    out = [
        _event(shift_id, operator_id, f"hyd_{i}", start + 2.5 * 3600 + i * 900, "hyd_pressure_spike",
               RiskCategory.emerging_degradation, Tier.T1, Attribution.machine, {**ctx, "dtc": dtc},
               [Provenance.ML, Provenance.SIMULATED], "shift1", evidence={"dtc": dtc, "spikes_per_min": 7},
               explanation=[FeatureContribution(feature="hyd_spike_rate", label="Hydraulic pressure spikes",
                                                value=7.0, baseline_mean=1.5, baseline_std=1.0, z=5.5, unit="/min")])
        for i in range(2)]
    out += [
        _event(shift_id, operator_id, f"belt_{i}", start + (0.3 + 3.9 * i) * 3600, "seatbelt_unfastened_moving",
               RiskCategory.immediate_critical, Tier.T_CRIT, Attribution.operator, {**ctx, "travel_kmh": 1.2},
               [Provenance.RULE, Provenance.SIMULATED], "shift1")
        for i in range(2)]
    idle = [("idle_wait", 24.0, {"waiting_for_truck": True}, Attribution.environment),
            ("idle_warm", 9.0, {"idle_reason": "warmup"}, Attribution.environment),
            ("idle_unexpl", 5.0, {"waiting_for_truck": False}, Attribution.operator)]
    for i, (idx, minutes, extra, attribution) in enumerate(idle):
        type_ = "warmup_idle" if idx == "idle_warm" else "excessive_idle"
        out.append(_event(shift_id, operator_id, idx, start + 600 + i * 7200, type_, RiskCategory.procedural,
                          Tier.T1 if attribution is Attribution.operator else None, attribution,
                          {**ctx, "idle_min": minutes, **extra}, [Provenance.RULE, Provenance.SIMULATED], "shift1",
                          evidence={"idle_min": minutes}))
    return out


def _alert_row(al: Alert) -> AlertRow:
    return AlertRow(alert_id=al.alert_id, event_id=al.event_id, ts=al.ts, operator_id=al.operator_id,
                    machine_id=al.machine_id, tier=al.tier.value, state=al.state.value,
                    data=al.model_dump(mode="json"))


def _alerts(events: list[Event], start: float) -> list[Alert]:
    words = {"fast_swing_near_truck": ("Swing speed high near truck", "Faster than typical for truck loading",
                                       "Ease the swing before dumping"),
             "seatbelt_unfastened_moving": ("Seatbelt unfastened while moving", "Seatbelt switch open, travelling",
                                            "Stop and fasten seatbelt"),
             "hyd_pressure_spike": ("Hydraulic pressure spikes", "Spike rate high with active fault code",
                                    "Report to maintenance after the cycle")}
    alerts = []
    for ev in events:
        if ev.type not in words or ev.tier is None:
            continue
        what, why, do = words[ev.type]
        alerts.append(Alert(alert_id=f"alt_fx_{ev.event_id}", event_id=ev.event_id, ts=ev.ts,
                            machine_id=ev.machine_id, operator_id=ev.operator_id, tier=ev.tier,
                            signal_word=SIGNAL_WORD[ev.tier], what=what, why=why, do=do,
                            provenance=ev.provenance, state=AlertState.cleared, requires_ack=ev.tier is Tier.T2,
                            dismissible=ev.tier is not Tier.T_CRIT, cleared_at=ev.ts + 20, simulated=True))
    shift_id, operator_id = events[0].shift_id, events[0].operator_id
    alerts.append(Alert(alert_id=f"alt_fx_{shift_id}_t4", event_id=f"evt_fx_{shift_id}_break",
                        ts=start + 7.2 * 3600, machine_id=DEMO_MACHINE, operator_id=operator_id, tier=Tier.T4,
                        signal_word=SIGNAL_WORD[Tier.T4], what="Break recommendation snoozed",
                        why="2 h 45 m continuous operation", do="Supervisor to check in by radio",
                        provenance=[Provenance.RULE, Provenance.SIMULATED], state=AlertState.escalated,
                        escalated_to="SUP-01", simulated=True))
    return alerts


def _upsert_event(s: Session, ev: Event) -> None:
    s.merge(EventRow(event_id=ev.event_id, ts=ev.ts, operator_id=ev.operator_id, machine_id=ev.machine_id,
                     shift_id=ev.shift_id, type=ev.type, category=ev.category.value,
                     tier=ev.tier.value if ev.tier else None, attribution=ev.attribution.value,
                     data=ev.model_dump(mode="json")))


def _upsert_exposure(s: Session, operator_id: str, shift_id: str, task_type: str, hours: float,
                     cycles: int, truck_cycles: int) -> None:
    row = s.scalars(select(ExposureRow).where(ExposureRow.operator_id == operator_id,
                                              ExposureRow.shift_id == shift_id,
                                              ExposureRow.task_type == task_type)).first()
    if row is None:
        row = ExposureRow(operator_id=operator_id, shift_id=shift_id, task_type=task_type)
        s.add(row)
    row.operating_h, row.cycles, row.truck_approach_cycles = hours, cycles, truck_cycles


def _ensure_shift(s: Session, shift_id: str, operator_id: str, machine_id: str, start: float,
                  status: str = "ended") -> None:
    if s.get(ShiftRow, shift_id) is None:
        s.add(ShiftRow(shift_id=shift_id, operator_id=operator_id, machine_id=machine_id, site_id=config.SITE_ID,
                       planned_start=start, planned_end=start + SHIFT_LEN_S, started_at=start,
                       ended_at=None if status == "active" else start + SHIFT_LEN_S, status=status,
                       privacy_ack=True, conditions={"temp_c": 31, "dust": "moderate", "provenance": "MOCK"},
                       simulated=True))


def _tasks(s: Session, shift_id: str) -> None:
    """Today's plan (SIMULATED): T-1 truck loading, T-2 first trench on site, T-3 stockpile tidy."""
    estimate = {"remaining_p10_min": 95.0, "remaining_p50_min": 118.0, "remaining_p90_min": 150.0,
                "model_version": "fixture (task-time model trains tomorrow)", "provenance": ["SIMULATED"]}
    specs = [("T-1", 1, "Truck Loading, Bench 3", "truck_loading", "Bench 3 / TL-1", 420.0, "m3", 180.0,
              "in_progress", False, None, {"estimate": estimate}),
             ("T-2", 2, "Trench Excavation T-4", "trenching", "Trench T-4", 60.0, "m", 0.0, "queued", True,
              "MOD-TRENCH-EDGES", {"width_m": 1.5}),
             ("T-3", 3, "Stockpile Tidy", "stockpile", "Stockpile A", 40.0, "min", 0.0, "queued", False, None, {})]
    for task_id, prio, name, type_, loc, qty, unit, done, status, first, module, meta in specs:
        if s.get(TaskRow, task_id) is None:
            s.add(TaskRow(task_id=task_id, shift_id=shift_id, priority=prio, name=name, type=type_, location=loc,
                          material="clay_gravel", planned_qty=qty, qty_unit=unit, done_qty=done, status=status,
                          first_on_site=first, required_module_id=module, meta={"simulated": True, **meta}))


def _windows(s: Session, shift_id: str, operator_id: str, machine_id: str, start: float, shift: float,
             seed: int) -> None:
    """120 SIMULATED 20 s feature windows; `shift` moves the swing-rate mean to show drift."""
    rng = np.random.default_rng(seed)
    for i in range(120):
        t_end = start + 1800 + i * 120.0
        feats = {name: float(round(rng.normal(mu + (shift if name == "swing_dps_peak" else 0.0), sd), 4))
                 for name, (mu, sd) in WINDOW_FEATURES.items()}
        fw = FeatureWindow(window_id=f"win_fx_{shift_id}_{i:03d}", t_start=t_end - 20, t_end=t_end,
                           machine_id=machine_id, operator_id=operator_id, shift_id=shift_id, task_id="T-1",
                           context_key=CONTEXT_KEY, features=feats, score=float(round(rng.uniform(0, 1), 4)),
                           percentile=float(round(rng.uniform(0, 1), 4)), model_version=FIXTURE_TAG)
        s.merge(FeatureWindowRow(window_id=fw.window_id, t_end=fw.t_end, operator_id=operator_id, shift_id=shift_id,
                                 context_key=fw.context_key, percentile=fw.percentile,
                                 data={**fw.model_dump(mode="json"), "simulated": True}))


def _crew_extras(s: Session, start: float) -> None:
    """EX-09 with Anita (active), health for both machines, and Joe's earlier shift on EX-07."""
    _ensure_shift(s, "SH-OP1007-S1", "OP-1007", "EX-09", start, status="active")
    _upsert_exposure(s, "OP-1007", "SH-OP1007-S1", "truck_loading", 5.1, 58, 58)
    anita = _event("SH-OP1007-S1", "OP-1007", "idle_wait", start + 3 * 3600, "excessive_idle",
                   RiskCategory.procedural, None, Attribution.environment,
                   {"task_type": "truck_loading", "idle_min": 18.0, "waiting_for_truck": True},
                   [Provenance.RULE, Provenance.SIMULATED], "shift1", evidence={"idle_min": 18.0}, machine_id="EX-09")
    _upsert_event(s, anita)
    s.merge(_alert_row(Alert(alert_id="alt_fx_SH-OP1007-S1_t1", event_id=anita.event_id, ts=anita.ts + 5,
                             machine_id="EX-09", operator_id="OP-1007", tier=Tier.T1, signal_word=SIGNAL_WORD[Tier.T1],
                             what="Truck approaching on the blind side", why="Truck detected 9 m, rear right",
                             do="Check mirrors before swinging", provenance=[Provenance.RULE, Provenance.SIMULATED],
                             state=AlertState.raised, simulated=True)))
    health = {"EX-07": {"protection": "active", "safety_heartbeat_age_s": 0.4, "continuous_operation_min": 165},
              "EX-09": {"protection": "degraded", "safety_heartbeat_age_s": 4.2, "continuous_operation_min": 70}}
    for machine_id, h in health.items():
        row = s.get(MachineRow, machine_id)
        if row is not None and "health" not in (row.meta or {}):
            row.meta = {**(row.meta or {}), "health": {**h, "machine_id": machine_id, "simulated": True,
                                                       "received_at": time.time()}}
    joe_shift = "SH-OP1019-S1"
    _ensure_shift(s, joe_shift, "OP-1019", DEMO_MACHINE, start - 0.6 * DAY_S)
    dtc = ["HYD-P-201 (simulated)"]
    _upsert_event(s, _event(joe_shift, "OP-1019", "hyd_0", start - 0.5 * DAY_S, "hyd_pressure_spike",
                            RiskCategory.emerging_degradation, Tier.T1, Attribution.machine,
                            {"task_type": "trenching", "task_id": "T-9", "dtc": dtc},
                            [Provenance.ML, Provenance.SIMULATED], "shift1", evidence={"dtc": dtc, "spikes_per_min": 6}))


def load_shift(s: Session, key: str, shift_id: str | None = None, anchor_ts: float | None = None,
               operator_id: str = DEMO_OPERATOR) -> dict[str, Any]:
    """Upsert one fixture shift (idempotent). `anchor_ts` is the Shift 1 start the day offsets refer to."""
    spec = FIXTURE_SHIFTS[key]
    shift_id = shift_id or spec.default_shift_id
    ensure_reference_data(s)
    existing = s.get(ShiftRow, shift_id)
    if existing is not None:
        start = existing.started_at if existing.started_at is not None else existing.planned_start
    else:
        start = (anchor_ts if anchor_ts is not None else ANCHOR_TS) + spec.day_offset * DAY_S
    _ensure_shift(s, shift_id, operator_id, DEMO_MACHINE, start, status="active" if spec.extras else "ended")
    events = _swing_events(spec, shift_id, operator_id, start)
    if spec.extras:
        events += _shift1_extras(shift_id, operator_id, start)
    for ev in events:
        _upsert_event(s, ev)
    _upsert_exposure(s, operator_id, shift_id, "truck_loading", 4.2, spec.loading_cycles, spec.loading_cycles)
    _upsert_exposure(s, operator_id, shift_id, "trenching", 2.1, 60, 0)
    _upsert_exposure(s, operator_id, shift_id, "stockpile", 0.7, 20, 0)
    if key != "shift2":
        _windows(s, shift_id, operator_id, DEMO_MACHINE, start, 3.0 if spec.extras else 0.0,
                 seed=7 if spec.extras else 3)
    if spec.extras:
        for al in _alerts(events, start):
            s.merge(_alert_row(al))
        _tasks(s, shift_id)
        _crew_extras(s, start)
    s.flush()
    return {"key": key, "shift_id": shift_id, "start": start, "events": len(events),
            "loading_cycles": spec.loading_cycles, "over_envelope": spec.over_envelope, "label": "SIMULATED"}


def load_all(s: Session) -> list[dict[str, Any]]:
    """Load Shift 0, 1 and 2 under their default ids (for resets and tests)."""
    return [load_shift(s, key) for key in ("shift0", "shift1", "shift2")]


def loaded_keys(s: Session, operator_id: str) -> set[str]:
    """Fixture shift keys already present for the operator."""
    rows = s.scalars(select(EventRow).where(EventRow.operator_id == operator_id, EventRow.event_id.like("evt_fx_%")))
    return {((r.data or {}).get("evidence") or {}).get("fixture_shift") for r in rows} - {None}


def ensure_demo_history(s: Session, operator_id: str, shift_id: str) -> list[str]:
    """In DEMO_MODE, fill in SIMULATED history for Ravi when the edge has not synced real events.

    - No other shift with events → load Shift 0 one day before the evaluated shift.
    - Evaluated shift has no events or exposure → load Shift 1 into it (gap evaluation), or Shift 2
      when C04 is already in training (post-training evaluation). Each fixture shift loads once.
    Returns the fixture keys loaded ([] when nothing was needed).
    """
    if not config.DEMO_MODE or operator_id != DEMO_OPERATOR:
        return []
    history = load_history(s, operator_id)
    target = history.shift(shift_id)
    keys = loaded_keys(s, operator_id)
    others = {e.shift_id for e in history.events if e.shift_id and e.shift_id != shift_id}
    target_empty = (not any(e.shift_id == shift_id for e in history.events)
                    and not any(x.shift_id == shift_id for x in history.exposure))
    anchor = target.start if target and target.start is not None else None
    loaded = []
    if not others and "shift0" not in keys:
        load_shift(s, "shift0", anchor_ts=anchor, operator_id=operator_id)
        loaded.append("shift0")
    if target_empty:
        c04 = get_row(s, operator_id, "C04", create=False)
        in_training = c04 is not None and c04.state in (CompetencyState.in_training.value,
                                                        CompetencyState.improving.value)
        if in_training and "shift2" not in keys:
            load_shift(s, "shift2", shift_id=shift_id, anchor_ts=None if anchor is None else anchor - DAY_S,
                       operator_id=operator_id)
            loaded.append("shift2")
        elif not in_training and "shift1" not in keys:
            load_shift(s, "shift1", shift_id=shift_id, anchor_ts=anchor, operator_id=operator_id)
            loaded.append("shift1")
    return loaded


def ensure_post_training_shift(s: Session, operator_id: str) -> list[str]:
    """DEMO_MODE fallback for re-assessment: load Shift 2 if no post-training shift exists yet."""
    if not config.DEMO_MODE or operator_id != DEMO_OPERATOR or "shift2" in loaded_keys(s, operator_id):
        return []
    starts = [sh.start for sh in load_history(s, operator_id).shifts if sh.start is not None]
    load_shift(s, "shift2", operator_id=operator_id, anchor_ts=max(starts) if starts else None)
    return ["shift2"]
