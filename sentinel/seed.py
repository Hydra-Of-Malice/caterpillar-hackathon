"""Seed the fictional demo world (SIMULATED) into BOTH data/edge.db and data/cloud.db.

    .venv\\Scripts\\python -m sentinel.seed [--reset] [--date YYYY-MM-DD]

Idempotent: reference rows (operators, machines) are upserted; shifts and tasks are inserted once
and only refreshed to the seed date while still "planned"; task history is rewritten only when
its size differs. ``--reset`` first wipes all demo rows (not the model registry) and the edge
runtime state, so the demo restarts from Beat 1.

Also seeds a SIMULATED history so every screen has data: Ravi's completed Shift 0 (yesterday) with
every alert tier, auto + manual incidents across signal words, breaks, idle periods by reason, a
break-rule T4 escalation and 2 C04 fast-swing events (so the ">= 3 events across >= 2 shifts" gap
rule can fire honestly after Shift 1, 05/12); Ravi's Shift 1 checklist 13/14 answered; and EX-09
(cloud only) — Joe's ended Shift 0 with a recurrence T4 escalation and a machine-attributed
hydraulic issue, and Anita's active shift sharing that hydraulic signature.
"""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import delete, func, select

from sentinel.edge_api.settings import edge_state_path
from sentinel.eta.history import generate_history
from sentinel.shared import config
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import (Alert, Attribution, Event, FeatureContribution, Incident, Provenance, RiskCategory,
                                     Tier)
from sentinel.store.db import Database
from sentinel.store.models import (AlertRow, Base, BreakLogRow, ChecklistResultRow, EventRow, ExposureRow, IncidentRow,
                                   MachineRow, ModelRegistryRow, OperatorRow, ShiftRow, TaskHistoryRow, TaskRow)

log = logging.getLogger("sentinel.seed")

SITE = config.SITE_ID
EDGE_MACHINE = "EX-07"              # the edge DB holds this machine's data only (other operators stay in the cloud)
HISTORY_N, HISTORY_SEED = 1500, 42

OPERATORS: list[dict[str, Any]] = [
    {"operator_id": "OP-1042", "name": "Ravi Kumar", "role": "operator", "experience_months": 3,
     "operating_hours": 212.0, "archetype": "novice_improving", "meta": {"short_name": "Ravi K.", "level": "novice"}},
    {"operator_id": "OP-1007", "name": "Anita Rao", "role": "operator", "experience_months": 108,
     "operating_hours": 15400.0, "archetype": "expert", "meta": {"short_name": "Anita R.", "level": "expert"}},
    {"operator_id": "OP-1019", "name": "Joe Mendes", "role": "operator", "experience_months": 36,
     "operating_hours": 5200.0, "archetype": "intermediate", "meta": {"short_name": "Joe M.", "level": "intermediate"}},
    {"operator_id": "OP-1033", "name": "Lena Ortiz", "role": "operator", "experience_months": 48,
     "operating_hours": 6800.0, "archetype": "degraded_late_shift",
     "meta": {"short_name": "Lena O.", "level": "intermediate"}},
    {"operator_id": "TR-2001", "name": "Sam Patel", "role": "trainee", "experience_months": 0,
     "operating_hours": 12.0, "archetype": "novice", "meta": {"short_name": "Sam P.", "level": "trainee"}},
    {"operator_id": "TR-2002", "name": "Mei Chen", "role": "trainee", "experience_months": 1,
     "operating_hours": 40.0, "archetype": "novice_improving", "meta": {"short_name": "Mei C.", "level": "trainee"}},
    {"operator_id": "SUP-01", "name": "Priya Nair", "role": "supervisor", "experience_months": 180,
     "operating_hours": 0.0, "archetype": None, "meta": {"short_name": "Priya N."}},
    {"operator_id": "INS-01", "name": "Marcus Lee", "role": "instructor", "experience_months": 204,
     "operating_hours": 0.0, "archetype": None, "meta": {"short_name": "Marcus L.", "specialties": ["Excavator", "Simulator"]}},
    {"operator_id": "INS-02", "name": "Dana Okafor", "role": "instructor", "experience_months": 150,
     "operating_hours": 0.0, "archetype": None, "meta": {"short_name": "Dana O.", "specialties": ["Excavator", "Trenching"]}},
]

MACHINES: list[dict[str, Any]] = [
    {"machine_id": "EX-07", "model": "Cat 320 (simulated)", "machine_type": "EX-20t", "site_id": SITE,
     "prox_fitted": True, "meta": {"smu_h": 8421.5, "fuel_pct": 72, "bucket_m3": 1.2}},
    {"machine_id": "EX-09", "model": "Cat 320 (simulated)", "machine_type": "EX-20t", "site_id": SITE,
     "prox_fitted": True, "meta": {"smu_h": 11890.0, "fuel_pct": 64, "bucket_m3": 1.2}},
]


def _at(day: date, hh: int, mm: int = 0) -> float:
    return datetime.combine(day, time(hh, mm)).timestamp()


def conditions_for(day: date, now_ts: float) -> dict[str, Any]:
    """MOCK weather feed for North Quarry: 31 °C, moderate dust, light rain from 13:00."""
    return {"temp_c": 31.0, "dust": "moderate", "forecast": "Light rain from 13:00", "rain": "light",
            "rain_from": "13:00", "rain_from_ts": _at(day, 13), "rain_until_ts": _at(day, 18),
            "visibility": "good (dust moderate)", "visibility_m": 400, "lighting": "daylight", "wind_kmh": 12,
            "humidity_pct": 38, "source": "MOCK", "provider": "mock-weather-v1", "updated_ts": now_ts,
            "provenance": ["MOCK"]}


def shifts_for(day: date) -> list[dict[str, Any]]:
    """Today's shifts: Ravi and Anita on day shift, Joe and Lena on the late shift."""
    day_shift, late = (_at(day, 6), _at(day, 14, 30)), (_at(day, 14, 30), _at(day, 23))
    return [
        {"shift_id": "SH-1042-S1", "operator_id": "OP-1042", "machine_id": "EX-07", "window": day_shift},
        {"shift_id": "SH-1007-S1", "operator_id": "OP-1007", "machine_id": "EX-09", "window": day_shift},
        {"shift_id": "SH-1019-S1", "operator_id": "OP-1019", "machine_id": "EX-09", "window": late},
        {"shift_id": "SH-1033-S1", "operator_id": "OP-1033", "machine_id": "EX-07", "window": late},
    ]


def tasks_for(day: date) -> list[dict[str, Any]]:
    """Ravi's T-1..T-3 from the plan plus tasks on the other shifts (>= 5 visible for AC1.1)."""
    return [
        {"task_id": "T-1", "shift_id": "SH-1042-S1", "priority": 1, "name": "Truck Loading, Bench 3",
         "type": "truck_loading", "location": "Bench 3", "material": "clay_gravel", "planned_qty": 420.0,
         "qty_unit": "m3", "meta": {"zone": "TL-1", "planned_start": _at(day, 6, 15), "trucks": "HT-12, HT-15"}},
        {"task_id": "T-2", "shift_id": "SH-1042-S1", "priority": 2, "name": "Trench Excavation T-4",
         "type": "trenching", "location": "Trench T-4", "material": "clay_gravel", "planned_qty": 60.0,
         "qty_unit": "m", "first_on_site": True, "required_module_id": "MOD-TRENCH-EDGES",
         "meta": {"zone": "TR-4", "planned_start": _at(day, 10), "depth_m": 1.5, "length_m": 60,
                  "required_module_title": "Trenching near edges", "spotter_assigned": True, "spotter_source": "MOCK"}},
        {"task_id": "T-3", "shift_id": "SH-1042-S1", "priority": 3, "name": "Stockpile Tidy",
         "type": "stockpile", "location": "Stockpile A", "material": "clay_gravel", "planned_qty": 90.0,
         "qty_unit": "m3", "meta": {"zone": "SP-A", "planned_start": _at(day, 12, 30), "planned_duration_min": 40}},
        {"task_id": "T-4", "shift_id": "SH-1007-S1", "priority": 1, "name": "Truck Loading, Bench 5",
         "type": "truck_loading", "location": "Bench 5", "material": "rock", "planned_qty": 520.0,
         "qty_unit": "m3", "meta": {"zone": "TL-2", "planned_start": _at(day, 6, 15)}},
        {"task_id": "T-5", "shift_id": "SH-1007-S1", "priority": 2, "name": "Trench Excavation T-6",
         "type": "trenching", "location": "Trench T-6", "material": "clay_gravel", "planned_qty": 45.0,
         "qty_unit": "m", "meta": {"zone": "TR-6", "planned_start": _at(day, 11), "depth_m": 1.5}},
        {"task_id": "T-6", "shift_id": "SH-1019-S1", "priority": 1, "name": "Stockpile Build, Area C",
         "type": "stockpile", "location": "Area C", "material": "sand", "planned_qty": 150.0,
         "qty_unit": "m3", "meta": {"zone": "SP-C", "planned_start": _at(day, 14, 45)}},
        {"task_id": "T-7", "shift_id": "SH-1033-S1", "priority": 1, "name": "Truck Loading, Bench 3 (cont.)",
         "type": "truck_loading", "location": "Bench 3", "material": "clay_gravel", "planned_qty": 300.0,
         "qty_unit": "m3", "meta": {"zone": "TL-1", "planned_start": _at(day, 14, 45)}},
        {"task_id": "T-8", "shift_id": "SH-1033-S1", "priority": 2, "name": "Stockpile Tidy, Bench 3",
         "type": "stockpile", "location": "Bench 3", "material": "clay_gravel", "planned_qty": 80.0,
         "qty_unit": "m3", "meta": {"zone": "SP-A", "planned_start": _at(day, 19)}},
    ]


# ------------------------------------------------------------------ SIMULATED history ("world")
ABRIDGED_KEYS = ("ts", "seq", "task_id", "zone", "engine_on", "rpm", "throttle_pct", "travel_kmh", "gear",
                 "park_brake", "hyd_lockout", "joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps",
                 "hyd_pressure_bar", "payload_t", "seatbelt", "prox_fitted", "prox_person_m", "prox_person_sector",
                 "prox_truck_m", "bucket_to_truck_m", "dtc")
TEXT = {  # (what, why, do) — each <= 12 words
    "seatbelt_unfastened_moving": ("FASTEN SEATBELT — MACHINE ACTIVE", "Seatbelt open while swinging",
                                   "Stop and fasten your seatbelt"),
    "fast_swing_near_truck": ("FAST SWING NEAR TRUCK", "Swing {v:.0f}°/s, usual 24°/s near truck",
                              "Slow the swing near the truck"),
    "person_in_warning_zone": ("PERSON NEAR MACHINE (right)", "Person 6.8 m away while machine active",
                               "Slow down and keep the person in view"),
    "excessive_idle": ("ENGINE IDLING {v:.0f} MIN", "No truck waiting reported",
                       "Consider shutting down if the wait continues"),
    "break_checkin": ("BREAK CHECK-IN", "2 h 0 min without a break", "Take a break at the next stop"),
    "break_recommended": ("BREAK RECOMMENDED", "2 h 30 min continuous operation (site limit 2 h)",
                          "Park safely and take a 10-minute break"),
    "escalation_break_not_taken": ("SUPERVISOR NOTIFIED", "No break after 2 h 45 min operation",
                                   "Park safely and take your break"),
    "travel_overspeed": ("SLOW DOWN — TRAVEL SPEED", "Travel {v:.1f} km/h, site limit 8.0 km/h here",
                         "Reduce travel speed below the limit"),
    "escalation_recurrence": ("SUPERVISOR NOTIFIED", "Same warning 3 times this shift",
                              "Continue carefully; your supervisor will follow up"),
    "hyd_pressure_anomaly": ("MACHINE CHECK NEEDED", "Hydraulic pressure spikes unusual; likely a machine issue",
                             "Report to maintenance at next stop"),
    "harsh_reversal": ("JERKY CONTROL INPUTS", "Frequent sharp lever reversals this window",
                       "Use smooth, steady lever movements"),
    "high_idle_rpm": ("HIGH IDLE ENGINE SPEED", "Idling above 1 200 rpm while waiting",
                      "Use auto-idle while waiting"),
}
SIGNAL = {"T_CRIT": "DANGER", "T3": "WARNING", "T2": "WARNING", "T1": "CAUTION", "T0": "NOTICE",
          "T4": "SUPERVISOR NOTIFIED"}


def _snapshot(ts: float, kind: str, zone: str) -> list[dict[str, Any]]:
    """SIMULATED ±10 s abridged signals around a seeded incident (2 Hz)."""
    rows = []
    for i in range(-20, 21):
        near = abs(i) <= 4
        swing = 38.0 if (kind == "fast_swing_near_truck" and near) else 18.0 * (1 if i % 8 < 4 else -1)
        row = dict.fromkeys(ABRIDGED_KEYS)
        row.update({
            "ts": ts + i * 0.5, "seq": 1000 + i, "zone": zone, "engine_on": True, "rpm": 1750.0,
            "throttle_pct": 70.0, "travel_kmh": 9.6 if (kind == "travel_overspeed" and near) else 0.0, "gear": 1,
            "park_brake": False, "hyd_lockout": False, "joy_swing": round(swing / 60, 2), "joy_boom": 0.3,
            "joy_stick": -0.2, "joy_bucket": 0.0, "swing_dps": swing, "hyd_pressure_bar": 245.0,
            "payload_t": 1.9 if i < 0 else 0.2,
            "seatbelt": not (kind == "seatbelt_unfastened_moving" and -2 <= i <= 6), "prox_fitted": True,
            "prox_person_m": 6.8 if kind == "person_in_warning_zone" else None,
            "prox_person_sector": "right" if kind == "person_in_warning_zone" else None,
            "prox_truck_m": 4.6 if zone.startswith("TL") else None,
            "bucket_to_truck_m": 1.2 if kind == "fast_swing_near_truck" and near else None, "dtc": []})
        rows.append(row)
    return rows


class _World:
    """Collects the SIMULATED history rows; each item remembers its machine (edge DB gets EX-07 only)."""

    def __init__(self) -> None:
        self.items: list[tuple[str, Any]] = []

    def add(self, machine_id: str, row: Any) -> Any:
        self.items.append((machine_id, row))
        return row

    def shift(self, shift: tuple[str, str, str], start: float, end: float, status: str,
              started: float | None, ended: float | None, conditions: dict[str, Any]) -> None:
        shift_id, operator_id, machine_id = shift
        self.add(machine_id, ShiftRow(shift_id=shift_id, operator_id=operator_id, machine_id=machine_id, site_id=SITE,
                                      planned_start=start, planned_end=end, started_at=started, ended_at=ended,
                                      status=status, privacy_ack=True, conditions=conditions, simulated=True))

    def event(self, shift: tuple[str, str, str], key: str, ts: float, etype: str, tier: str | None, *,
              category: RiskCategory = RiskCategory.dangerous_condition,
              provenance: tuple[str, ...] = ("RULE", "SIMULATED"), attribution: Attribution = Attribution.operator,
              context: dict[str, Any] | None = None, explanation: list[FeatureContribution] | None = None,
              competency: str | None = None, rule_id: str | None = None,
              evidence: dict[str, Any] | None = None) -> Event:
        shift_id, operator_id, machine_id = shift
        ev = Event(event_id=f"evt_seed_{key}", ts=ts, site_id=SITE, machine_id=machine_id, operator_id=operator_id,
                   shift_id=shift_id, task_id=(context or {}).get("task_id"), type=etype, category=category,
                   tier=Tier(tier) if tier else None, provenance=[Provenance(p) for p in provenance],
                   rule_id=rule_id, rule_version="rules-0.1.0" if rule_id else None,
                   model_version="seed-simulated" if "ML" in provenance else None, attribution=attribution,
                   context={"seeded": True, **(context or {})}, explanation=explanation or [],
                   evidence=evidence or {}, competency_ids=[competency] if competency else [], simulated=True)
        self.add(machine_id, EventRow(event_id=ev.event_id, ts=ev.ts, operator_id=operator_id, machine_id=machine_id,
                                      shift_id=shift_id, type=etype, category=ev.category.value, tier=tier,
                                      attribution=ev.attribution.value, data=ev.model_dump(mode="json")))
        return ev

    def alert(self, ev: Event, text_key: str, state: str, *, v: float = 0.0, acked: float | None = None,
              cleared: float | None = None, suppressed: str | None = None, escalated_to: str | None = None) -> Alert:
        tier = ev.tier.value
        what, why, do = (t.format(v=v) for t in TEXT[text_key])
        al = Alert(alert_id=f"alt_seed_{ev.event_id.removeprefix('evt_seed_')}", event_id=ev.event_id, ts=ev.ts,
                   machine_id=ev.machine_id, operator_id=ev.operator_id, tier=ev.tier, signal_word=SIGNAL[tier],
                   what=what, why=why, do=do, provenance=ev.provenance, state=state,
                   requires_ack=tier in ("T2", "T3"), dismissible=tier != "T_CRIT", suppressed_reason=suppressed,
                   acked_at=acked, cleared_at=cleared, escalated_to=escalated_to, explanation=ev.explanation,
                   simulated=True)
        self.add(ev.machine_id, AlertRow(alert_id=al.alert_id, event_id=al.event_id, ts=al.ts,
                                         operator_id=al.operator_id, machine_id=al.machine_id, tier=tier,
                                         state=state, data=al.model_dump(mode="json")))
        return al

    def incident(self, key: str, ts: float, shift: tuple[str, str, str], source: str, itype: str, severity: str,
                 signal_word: str, *, ev: Event | None = None, al: Alert | None = None, note: str | None = None,
                 operator_note: str | None = None, dispute: str = "none", status: str = "open",
                 context: dict[str, Any] | None = None) -> None:
        shift_id, operator_id, machine_id = shift
        zone = (context or {}).get("zone") or (ev.context.get("zone") if ev else None) or "TL-1"
        ctx: dict[str, Any] = {"seeded": True, **(context or {})}
        if ev is not None and al is not None:
            ctx.update(ev.context)
            ctx.update(alert_id=al.alert_id, tier=al.tier.value, what=al.what, why=al.why, do=al.do,
                       rule_id=ev.rule_id, rule_version=ev.rule_version, model_version=ev.model_version,
                       attribution=ev.attribution.value,
                       explanation=[c.model_dump(mode="json") for c in ev.explanation],
                       snapshot_window_s=[-10, 10], snapshot_complete=True, zone=zone)
        inc = Incident(incident_id=f"inc_seed_{key}", ts=ts, site_id=SITE, machine_id=machine_id,
                       operator_id=operator_id, shift_id=shift_id, source=source, type=itype, severity=severity,
                       signal_word=signal_word, event_ids=[ev.event_id] if ev else [], context=ctx,
                       snapshot=_snapshot(ts, itype, zone), note=note, operator_note=operator_note,
                       dispute_status=dispute, status=status, simulated=True)
        self.add(machine_id, IncidentRow(incident_id=inc.incident_id, ts=ts, operator_id=operator_id,
                                         machine_id=machine_id, source=source, type=itype, severity=severity,
                                         status=status, data=inc.model_dump(mode="json")))

    def idle(self, shift: tuple[str, str, str], key: str, start: float, minutes: float, reason: str,
             zone: str) -> None:
        self.event(shift, key, start, "idle_period", None, category=RiskCategory.normal,
                   rule_id="EDGE-IDLE-PERIOD", context={"reason": reason, "duration_min": minutes,
                                                         "start_ts": start, "end_ts": start + minutes * 60,
                                                         "zone": zone})

    def checklist(self, shift: tuple[str, str, str], ts: float, skip: tuple[str, ...] = ()) -> None:
        for item in load_yaml("checklist")["items"]:
            if item["id"] not in skip:
                self.add(shift[2], ChecklistResultRow(shift_id=shift[0], item_id=item["id"], result="pass",
                                                      critical=bool(item["critical"]), note=None, ts=ts))


def _swing(value: float) -> list[FeatureContribution]:
    return [FeatureContribution(feature="swing_speed_near_truck", label="Swing rate near truck", value=value,
                                baseline_mean=24.0, baseline_std=4.0, z=round((value - 24.0) / 4.0, 2), unit="°/s"),
            FeatureContribution(feature="approach_speed_to_truck", label="Approach speed", value=1.8,
                                baseline_mean=1.1, baseline_std=0.33, z=2.1, unit="m/s")]


def _hyd() -> list[FeatureContribution]:
    return [FeatureContribution(feature="hyd_pressure_spikes", label="Hydraulic pressure spikes", value=7.0,
                                baseline_mean=1.0, baseline_std=1.2, z=5.0, unit="/min")]


def _ravi_shift0(w: _World, prev: date) -> None:
    """Ravi's completed Shift 0 on EX-07: every alert tier, incidents, breaks, idle by reason, T4 escalation."""
    def a(hh: int, mm: int, ss: float = 0) -> float:
        return _at(prev, hh, mm) + ss

    sh = ("SH-1042-S0", "OP-1042", "EX-07")
    w.shift(sh, _at(prev, 6), _at(prev, 14, 30), "ended", a(6, 4), a(14, 26),
            {**conditions_for(prev, a(5, 50)), "rain_from_ts": None, "rain_until_ts": None, "forecast": "Dry",
             "rain": "none"})
    w.add("EX-07", TaskRow(task_id="T-S0-1", shift_id=sh[0], priority=1, name="Truck Loading, Bench 3",
                           type="truck_loading", location="Bench 3", material="clay_gravel", planned_qty=360.0,
                           qty_unit="m3", done_qty=360.0, status="done", started_at=a(6, 10), done_at=a(10, 40),
                           meta={"zone": "TL-1"}))
    w.add("EX-07", TaskRow(task_id="T-S0-2", shift_id=sh[0], priority=2, name="Stockpile Tidy", type="stockpile",
                           location="Stockpile A", material="clay_gravel", planned_qty=60.0, qty_unit="m3",
                           done_qty=60.0, status="done", started_at=a(12, 0), done_at=a(12, 45),
                           meta={"zone": "SP-A"}))
    w.add("EX-07", TaskRow(task_id="T-S0-3", shift_id=sh[0], priority=3, name="Trench Prep T-3", type="trenching",
                           location="Trench T-3", material="clay_gravel", planned_qty=20.0, qty_unit="m",
                           done_qty=6.0, status="queued", meta={"zone": "TR-3", "depth_m": 1.5}))
    w.checklist(sh, a(5, 52))
    w.add("EX-07", BreakLogRow(shift_id=sh[0], operator_id="OP-1042", started_at=a(8, 30), ended_at=a(8, 45)))
    w.add("EX-07", BreakLogRow(shift_id=sh[0], operator_id="OP-1042", started_at=a(11, 38), ended_at=a(11, 53),
                               kss=4))
    tl = {"task_type": "truck_loading", "zone": "TL-1", "task_id": "T-S0-1"}
    ev = w.event(sh, "s0_belt", a(6, 12), "seatbelt_unfastened_moving", "T_CRIT",
                 category=RiskCategory.immediate_critical, rule_id="R-SEAT-01", competency="C02", context=tl)
    al = w.alert(ev, "seatbelt_unfastened_moving", "cleared", cleared=a(6, 12, 4))
    w.incident("s0_belt", ev.ts, sh, "auto", ev.type, "high", "DANGER", ev=ev, al=al, status="reviewed")
    ev = w.event(sh, "s0_swing_t1", a(6, 31), "fast_swing_near_truck", "T1", provenance=("ML", "SIMULATED"),
                 explanation=_swing(31.0), competency="C04", context=tl)
    w.alert(ev, "fast_swing_near_truck", "cleared", v=31.0, cleared=a(6, 31, 8))
    w.incident("s0_nearmiss", a(7, 14), sh, "manual", "near_miss", "medium", "CAUTION",
               note="Truck driver reversed early while I was swinging", operator_note="Truck driver reversed early",
               dispute="disputed", context={"zone": "TL-1", "task_id": "T-S0-1",
                                            "attachments": [{"kind": "voice", "label": "Voice note 0:12",
                                                             "mock": True}]})
    w.idle(sh, "s0_idle_unexpl", a(6, 4), 9.0, "unexplained", "TL-1")
    w.idle(sh, "s0_idle_w1", a(7, 40), 8.0, "waiting_for_truck", "TL-1")
    ev = w.event(sh, "s0_swing_1", a(8, 42), "fast_swing_near_truck", "T2", provenance=("RULE", "ML", "SIMULATED"),
                 explanation=_swing(36.5), competency="C04", context={**tl, "truck_m": 4.6})
    al = w.alert(ev, "fast_swing_near_truck", "acknowledged", v=36.5, acked=a(8, 42, 6))
    w.incident("s0_swing_1", ev.ts, sh, "auto", ev.type, "medium", "WARNING", ev=ev, al=al)
    w.idle(sh, "s0_idle_w2", a(9, 10), 9.0, "waiting_for_truck", "TL-1")
    ev = w.event(sh, "s0_idle_sup", a(9, 16), "excessive_idle", "T1", category=RiskCategory.procedural,
                 rule_id="IDLE-01", competency="C10", context={**tl, "idle_min": 6.0, "waiting_for_truck": True})
    w.alert(ev, "excessive_idle", "suppressed", v=6.0, suppressed="waiting_for_truck")
    ev = w.event(sh, "s0_person", a(10, 5), "person_in_warning_zone", "T2", rule_id="R-PROX-WARN",
                 attribution=Attribution.environment, context=tl)
    al = w.alert(ev, "person_in_warning_zone", "cleared", acked=a(10, 5, 3), cleared=a(10, 5, 20))
    w.incident("s0_person", ev.ts, sh, "auto", ev.type, "medium", "WARNING", ev=ev, al=al)
    w.idle(sh, "s0_idle_u", a(10, 15), 5.0, "unexplained", "TL-1")
    ev = w.event(sh, "s0_idle", a(10, 20), "excessive_idle", "T1", category=RiskCategory.procedural,
                 rule_id="IDLE-01", competency="C10", context={**tl, "idle_min": 5.0})
    w.alert(ev, "excessive_idle", "cleared", v=5.0, cleared=a(10, 20, 8))
    w.idle(sh, "s0_idle_w3", a(10, 24), 7.0, "waiting_for_truck", "TL-1")
    ev = w.event(sh, "s0_brk_t1", a(10, 45), "break_checkin", "T1", category=RiskCategory.emerging_degradation,
                 rule_id="ALERT-POLICY/break_checkin")
    w.alert(ev, "break_checkin", "cleared", cleared=a(10, 45, 8))
    ev = w.event(sh, "s0_brk_t3", a(11, 15), "break_recommended", "T3", category=RiskCategory.emerging_degradation,
                 rule_id="ALERT-POLICY/break_recommended", context={"snoozed": True})
    w.alert(ev, "break_recommended", "acknowledged", acked=a(11, 15, 20))
    ev = w.event(sh, "s0_swing_2", a(11, 17), "fast_swing_near_truck", "T2", provenance=("RULE", "ML", "SIMULATED"),
                 explanation=_swing(38.2), competency="C04", context={**tl, "truck_m": 4.9})
    al = w.alert(ev, "fast_swing_near_truck", "acknowledged", v=38.2, acked=a(11, 17, 5))
    w.incident("s0_swing_2", ev.ts, sh, "auto", ev.type, "medium", "WARNING", ev=ev, al=al)
    ev = w.event(sh, "s0_brk_t4", a(11, 30), "escalation_break_not_taken", "T4", category=RiskCategory.procedural,
                 rule_id="ALERT-POLICY/escalation_break_not_taken", competency="C13",
                 context={"continuous_operation_min": 165, "snoozed": True})
    w.alert(ev, "escalation_break_not_taken", "escalated", escalated_to="SUP-01")
    for key, etype, comp, hh, mm in (("s0_t0_rev", "harsh_reversal", "C09", 7, 55),
                                     ("s0_t0_rpm", "high_idle_rpm", "C10", 9, 12),
                                     ("s0_t0_rev2", "harsh_reversal", "C09", 12, 20)):
        ev = w.event(sh, key, a(hh, mm), etype, "T0", category=RiskCategory.unusual_harmless,
                     provenance=("ML", "SIMULATED"), competency=comp, context=tl)
        w.alert(ev, etype, "queued_post_shift", suppressed="coaching_post_shift")
    w.incident("s0_ground", a(12, 20), sh, "manual", "ground_issue", "low", "NOTICE",
               note="Soft ground near trench edge, section T2", context={"zone": "TR-3", "task_id": "T-S0-3"})
    w.add("EX-07", ExposureRow(operator_id="OP-1042", shift_id=sh[0], task_type="truck_loading", operating_h=6.2,
                               cycles=39, truck_approach_cycles=39))
    w.add("EX-07", ExposureRow(operator_id="OP-1042", shift_id=sh[0], task_type="stockpile", operating_h=1.47,
                               cycles=12, truck_approach_cycles=0))


def _fleet(w: _World, day: date, prev: date) -> None:
    """EX-09 (cloud only): Joe's ended late Shift 0 and Anita's active shift today — supervisor view data."""
    def a(d: date, hh: int, mm: int, ss: float = 0) -> float:
        return _at(d, hh, mm) + ss

    joe = ("SH-1019-S0", "OP-1019", "EX-09")
    w.shift(joe, _at(prev, 14, 30), _at(prev, 23), "ended", a(prev, 14, 34), a(prev, 22, 55),
            {**conditions_for(prev, a(prev, 14, 20)), "forecast": "Dry", "rain": "none"})
    w.add("EX-09", TaskRow(task_id="T-S0-J1", shift_id=joe[0], priority=1, name="Stockpile Build, Area C",
                           type="stockpile", location="Area C", material="sand", planned_qty=150.0, qty_unit="m3",
                           done_qty=150.0, status="done", started_at=a(prev, 14, 45), done_at=a(prev, 21, 50),
                           meta={"zone": "SP-C"}))
    w.checklist(joe, a(prev, 14, 22))
    w.add("EX-09", BreakLogRow(shift_id=joe[0], operator_id="OP-1019", started_at=a(prev, 18, 0),
                               ended_at=a(prev, 18, 20)))
    ctx = {"task_type": "stockpile", "zone": "HR-2", "task_id": "T-S0-J1"}
    for i, (hh, mm, v) in enumerate(((15, 40, 9.4), (17, 5, 10.1), (19, 30, 9.8)), start=1):
        ev = w.event(joe, f"j0_speed_{i}", a(prev, hh, mm), "travel_overspeed", "T2", rule_id="R-SPEED-01",
                     competency="C11", context=ctx, evidence={"travel_kmh": v, "limit_kmh": 8.0})
        al = w.alert(ev, "travel_overspeed", "acknowledged", v=v, acked=a(prev, hh, mm, 4),
                     escalated_to="SUP-01" if i == 3 else None)
        w.incident(f"j0_speed_{i}", ev.ts, joe, "auto", ev.type, "medium", "WARNING", ev=ev, al=al)
    ev = w.event(joe, "j0_esc", a(prev, 19, 30, 1), "escalation_recurrence", "T4", category=RiskCategory.procedural,
                 rule_id="ALERT-POLICY/escalation_recurrence",
                 context={"count": 3, "source_type": "travel_overspeed"})
    w.alert(ev, "escalation_recurrence", "escalated", escalated_to="SUP-01")
    ev = w.event(joe, "j0_hyd", a(prev, 18, 10), "hyd_pressure_anomaly", "T1", provenance=("ML", "SIMULATED"),
                 attribution=Attribution.machine, explanation=_hyd(), context={**ctx, "dtc": ["SPN 1762 FMI 18"]},
                 evidence={"dtc": ["SPN 1762 FMI 18"]})
    w.alert(ev, "hyd_pressure_anomaly", "cleared", cleared=a(prev, 18, 10, 8))
    w.idle(joe, "j0_idle_w", a(prev, 16, 10), 20.0, "waiting_for_truck", "SP-C")
    w.idle(joe, "j0_idle_u", a(prev, 20, 40), 12.0, "unexplained", "SP-C")
    w.add("EX-09", ExposureRow(operator_id="OP-1019", shift_id=joe[0], task_type="stockpile", operating_h=7.4,
                               cycles=210, truck_approach_cycles=0))

    anita = ("SH-1007-S1", "OP-1007", "EX-09")
    w.shift(anita, _at(day, 6), _at(day, 14, 30), "active", a(day, 6, 4), None, conditions_for(day, a(day, 5, 50)))
    w.add("EX-09", TaskRow(task_id="T-4", shift_id=anita[0], priority=1, name="Truck Loading, Bench 5",
                           type="truck_loading", location="Bench 5", material="rock", planned_qty=520.0,
                           qty_unit="m3", done_qty=234.0, status="in_progress", started_at=a(day, 6, 15),
                           meta={"zone": "TL-2", "planned_start": a(day, 6, 15)}))
    w.checklist(anita, a(day, 5, 50))
    w.add("EX-09", BreakLogRow(shift_id=anita[0], operator_id="OP-1007", started_at=a(day, 9, 0),
                               ended_at=a(day, 9, 12)))
    tl2 = {"task_type": "truck_loading", "zone": "TL-2", "task_id": "T-4"}
    ev = w.event(anita, "a1_hyd", a(day, 7, 50), "hyd_pressure_anomaly", "T1", provenance=("ML", "SIMULATED"),
                 attribution=Attribution.machine, explanation=_hyd(), context={**tl2, "dtc": ["SPN 1762 FMI 18"]},
                 evidence={"dtc": ["SPN 1762 FMI 18"], "cross_operator": True})
    w.alert(ev, "hyd_pressure_anomaly", "cleared", cleared=a(day, 7, 50, 8))
    ev = w.event(anita, "a1_idle_sup", a(day, 8, 5), "excessive_idle", "T1", category=RiskCategory.procedural,
                 rule_id="IDLE-01", context={**tl2, "idle_min": 7.0, "waiting_for_truck": True})
    w.alert(ev, "excessive_idle", "suppressed", v=7.0, suppressed="waiting_for_truck")
    w.idle(anita, "a1_idle_w", a(day, 8, 0), 11.0, "waiting_for_truck", "TL-2")


def demo_world(day: date) -> _World:
    """All SIMULATED history rows for the demo date (Shift 0 = the day before)."""
    w = _World()
    prev = day - timedelta(days=1)
    _ravi_shift0(w, prev)
    _fleet(w, day, prev)
    return w


def _seed_world(s: Any, world: _World, machines: set[str] | None) -> None:
    """Idempotent write: rows with natural ids are merged; autoincrement rows of these shifts are replaced."""
    rows = [r for m, r in world.items if machines is None or m in machines]
    shift_ids = {r.shift_id for r in rows if isinstance(r, ShiftRow)}
    for model in (ChecklistResultRow, BreakLogRow, ExposureRow):
        s.execute(delete(model).where(model.shift_id.in_(shift_ids)))
    for r in rows:
        if isinstance(r, (ChecklistResultRow, BreakLogRow, ExposureRow)):
            s.add(r)
        else:
            s.merge(r)


def _seed_today_checklist(s: Any, day: date) -> None:
    """Ravi's Shift 1: 13 of 14 checks answered (SC-01 left open so the start gating can be shown)."""
    shift = s.get(ShiftRow, "SH-1042-S1")
    if shift is None or s.scalar(select(func.count()).select_from(ChecklistResultRow)
                                 .where(ChecklistResultRow.shift_id == "SH-1042-S1")):
        return
    for item in load_yaml("checklist")["items"]:
        if item["id"] != "SC-01":
            s.add(ChecklistResultRow(shift_id="SH-1042-S1", item_id=item["id"], result="pass",
                                     critical=bool(item["critical"]), note=None, ts=_at(day, 5, 52)))
    if shift.status == "planned":
        shift.status = "checklist"


def _wipe(db: Database, keep: tuple[type, ...] = (ModelRegistryRow,)) -> None:
    keep_tables = {m.__table__ for m in keep}
    with db.session() as s:
        for table in reversed(Base.metadata.sorted_tables):
            if table not in keep_tables:
                s.execute(delete(table))


def _seed_reference(s: Any) -> None:
    for op in OPERATORS:
        s.merge(OperatorRow(**{**op, "meta": {**op["meta"], "simulated": True}}))
    for m in MACHINES:
        s.merge(MachineRow(**{**m, "meta": {**m["meta"], "simulated": True}}))


def _seed_shifts(s: Any, day: date, now_ts: float, machines: set[str] | None) -> None:
    """Today's plan. Shifts not yet started are refreshed to the seed date; started ones are left alone."""
    cond = conditions_for(day, now_ts)
    planned = [sh for sh in shifts_for(day) if machines is None or sh["machine_id"] in machines]
    for sh in planned:
        row = s.get(ShiftRow, sh["shift_id"])
        start, end = sh["window"]
        if row is None:
            s.add(ShiftRow(shift_id=sh["shift_id"], operator_id=sh["operator_id"], machine_id=sh["machine_id"],
                           site_id=SITE, planned_start=start, planned_end=end, status="planned",
                           conditions=cond, simulated=True))
        elif row.started_at is None:
            row.planned_start, row.planned_end, row.conditions = start, end, cond
    shift_ids = {sh["shift_id"] for sh in planned}
    for t in tasks_for(day):
        if t["shift_id"] not in shift_ids:
            continue
        row = s.get(TaskRow, t["task_id"])
        if row is None:
            s.add(TaskRow(**t))
        elif s.get(ShiftRow, t["shift_id"]).started_at is None:
            row.meta = t["meta"]


def _seed_history(s: Any, records: list[dict[str, Any]]) -> None:
    count = s.scalar(select(func.count()).select_from(TaskHistoryRow))
    if count == len(records):
        return
    s.execute(delete(TaskHistoryRow))
    s.add_all(TaskHistoryRow(task_type=r["task_type"], features=r["features"], duration_min=r["duration_min"],
                             completed_at=r["completed_at"]) for r in records)


def seed(edge: Database, cloud: Database, reset: bool = False, day: date | None = None) -> dict[str, Any]:
    """Seed both databases; returns row counts per database."""
    day = day or date.today()
    now_ts = datetime.now().timestamp()
    history = generate_history(n=HISTORY_N, seed=HISTORY_SEED)
    summary: dict[str, Any] = {"date": day.isoformat(), "simulated": True}
    for name, db, machines in (("edge", edge, {EDGE_MACHINE}), ("cloud", cloud, None)):
        if reset:
            _wipe(db)
        with db.session() as s:
            _seed_reference(s)
            _seed_shifts(s, day, now_ts, machines)
            _seed_world(s, demo_world(day), machines)          # fresh ORM rows per database
            _seed_today_checklist(s, day)
            _seed_history(s, history)
        with db.session() as s:
            summary[name] = {m.__tablename__: s.scalar(select(func.count()).select_from(m))
                             for m in (OperatorRow, MachineRow, ShiftRow, TaskRow, TaskHistoryRow, EventRow,
                                       AlertRow, IncidentRow, BreakLogRow, ChecklistResultRow, ExposureRow)}
    if reset:
        edge_state_path(edge.url).unlink(missing_ok=True)
    return summary


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="Seed the CAT Sentinel demo world (SIMULATED)")
    ap.add_argument("--reset", action="store_true", help="wipe demo rows and edge runtime state first")
    ap.add_argument("--date", type=date.fromisoformat, default=None, help="shift date (default today)")
    args = ap.parse_args()
    summary = seed(Database.edge(), Database.cloud(), reset=args.reset, day=args.date)
    print(f"[SIMULATED] seeded demo world for {summary['date']}")
    for name in ("edge", "cloud"):
        print(f"  {name}: " + ", ".join(f"{k}={v}" for k, v in summary[name].items()))


if __name__ == "__main__":
    main()
