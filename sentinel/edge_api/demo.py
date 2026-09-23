"""DEMO_MODE controls: every live outcome can be triggered from the demo panel.

Each injection is published to ``sim/control`` so the simulator changes the telemetry and the
real safety process / pipeline react. In ``auto`` mode the edge also synthesises the outcome
directly when that path is not live (no fresh telemetry, no safety heartbeat, or the pipeline is a
no-op), so the UI flow can always be shown. Direct outcomes are labelled ``demo_direct`` and
SIMULATED; a direct T-CRIT exercises the mirror/incident path, not the safety rule itself.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from sentinel.shared import topics
from sentinel.shared.schemas import (Attribution, Event, FeatureContribution, Provenance, RiskCategory, SafetyAlertMsg,
                                     Tier, new_id)

SAFETY_KINDS: dict[str, dict[str, Any]] = {
    "seatbelt_open": {"rule_id": "R-SEAT-01", "tier": "T_CRIT", "category": "immediate_critical",
                      "attribution": "operator", "event_type": "seatbelt_unfastened_moving", "hold_s": 8,
                      "what": "FASTEN SEATBELT — MACHINE ACTIVE", "why": "Seatbelt open while swinging",
                      "do": "Stop and fasten your seatbelt"},
    "person_rear": {"rule_id": "R-PROX-CRIT", "tier": "T_CRIT", "category": "immediate_critical",
                    "attribution": "environment", "event_type": "person_in_danger_zone", "hold_s": 6,
                    "what": "STOP — PERSON IN DANGER ZONE (rear)", "why": "Person 3.2 m away, inside 4.0 m zone",
                    "do": "Stop all motion until the person is clear", "sector": "rear", "distance_m": 3.2},
    "person_warning": {"rule_id": "R-PROX-WARN", "tier": "T2", "category": "dangerous_condition",
                       "attribution": "environment", "event_type": "person_in_warning_zone", "hold_s": 20,
                       "what": "PERSON NEAR MACHINE (right)", "why": "Person 6.5 m away while machine active",
                       "do": "Slow down and keep the person in view", "sector": "right", "distance_m": 6.5},
}
PIPELINE_KINDS = ("fast_swing", "idle", "idle_waiting", "hyd_fault")
SIM_ONLY_KINDS = ("truck_wait",)
SPECIAL_KINDS = ("protection_degraded", "wan_offline", "wan_online")
ALL_KINDS = tuple(SAFETY_KINDS) + PIPELINE_KINDS + SIM_ONLY_KINDS + SPECIAL_KINDS
FRESH_S = 3.0


def _pipeline_event(rt: Any, kind: str) -> Event:
    ctx = rt.context
    task = ctx.get("task") or {}
    base = {"ts": rt.now_ts(), "site_id": rt.site_id, "machine_id": rt.machine_id,
            "operator_id": ctx.get("operator_id") or "unknown", "shift_id": ctx.get("shift_id"),
            "task_id": task.get("task_id"), "simulated": True}
    context = {"task_type": task.get("type", "truck_loading"), "zone": (task.get("meta") or {}).get("zone", "TL-1"),
               "demo_direct": True}
    if kind == "fast_swing":
        return Event(**base, type="fast_swing_near_truck", category=RiskCategory.dangerous_condition, tier=Tier.T2,
                     provenance=[Provenance.RULE, Provenance.ML, Provenance.SIMULATED], model_version="demo-direct",
                     risk_score=3.6, attribution=Attribution.operator, competency_ids=["C04"],
                     context={**context, "truck_m": 4.8},
                     explanation=[FeatureContribution(feature="swing_speed_near_truck", label="Swing rate near truck",
                                                      value=38.0, baseline_mean=24.0, baseline_std=4.5, z=3.1,
                                                      unit="°/s"),
                                  FeatureContribution(feature="approach_speed_to_truck", label="Approach speed",
                                                      value=1.9, baseline_mean=1.1, baseline_std=0.33, z=2.4,
                                                      unit="m/s")])
    if kind in ("idle", "idle_waiting"):
        return Event(**base, type="excessive_idle", category=RiskCategory.procedural, tier=Tier.T1,
                     provenance=[Provenance.RULE, Provenance.SIMULATED], rule_id="IDLE-01", rule_version="demo-direct",
                     attribution=Attribution.operator, competency_ids=["C10"],
                     context={**context, "idle_min": 9.0, "waiting_for_truck": kind == "idle_waiting"})
    return Event(**base, type="hyd_uncommanded_pressure", category=RiskCategory.dangerous_condition, tier=Tier.T1,
                 provenance=[Provenance.ML, Provenance.SIMULATED], model_version="demo-direct",
                 attribution=Attribution.machine, context={**context, "dtc": ["SPN 1762 FMI 18"]},
                 evidence={"dtc": ["SPN 1762 FMI 18"], "cross_operator": True},
                 explanation=[FeatureContribution(feature="hyd_pressure_spikes", label="Hydraulic pressure spikes",
                                                  value=7.0, baseline_mean=1.0, baseline_std=1.2, z=5.0, unit="/min")])


def _safety_msg(rt: Any, spec: dict[str, Any], state: str, alert_id: str) -> SafetyAlertMsg:
    ev = {"tier": spec["tier"], "category": spec["category"], "attribution": spec["attribution"],
          "event_type": spec["event_type"], "provenance": ["RULE", "SIMULATED"], "demo_direct": True,
          **{k: spec[k] for k in ("sector", "distance_m") if k in spec}}
    return SafetyAlertMsg(alert_id=alert_id, rule_id=spec["rule_id"], rule_version="demo-direct", state=state,
                          ts=rt.now_ts(), machine_id=rt.machine_id, operator_id=rt.context.get("operator_id") or "unknown",
                          what=spec["what"], why=spec["why"], do=spec["do"], evidence=ev, t_pub_ns=time.time_ns())


def _needs_direct(rt: Any, kind: str) -> bool:
    telemetry_live = (rt.telemetry_age_s() or 1e9) <= FRESH_S
    if kind in SAFETY_KINDS:
        hb = rt.protection()["heartbeat_age_s"]
        return not (telemetry_live and hb is not None and hb <= FRESH_S)
    if kind in PIPELINE_KINDS:
        return not (telemetry_live and rt.pipeline_status == "loaded")
    return False


def inject(rt: Any, kind: str, mode: str = "auto", params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Trigger one live outcome. ``mode``: auto (sim + direct fallback) | sim | direct."""
    params = params or {}
    result: dict[str, Any] = {"ok": True, "kind": kind, "mode": mode, "direct": False, "alerts": []}
    if kind not in SPECIAL_KINDS:
        cmd = {"action": "inject", "inject": kind, "kind": kind, "params": params, "ts": time.time()}
        result["bus"] = rt.publish(topics.sim_control(rt.site_id, rt.machine_id), cmd, qos=1)
        result["topic"] = topics.sim_control(rt.site_id, rt.machine_id)
    if kind == "wan_offline" or kind == "wan_online":
        rt.sync.set_wan(kind == "wan_online")
        result["wan_up"] = rt.sync.wan_up
        return result
    if kind == "protection_degraded":
        seconds = float(params.get("duration_s", 20))
        rt.demo_degraded = (time.monotonic() + seconds, "DEMO: proximity sensor not responding")
        rt.publish(topics.sim_control(rt.site_id, rt.machine_id),
                   {"action": "inject", "inject": "prox_fault", "kind": "prox_fault", "params": params}, qos=1)
        result.update(direct=True, duration_s=seconds)
        return result
    if mode == "sim" or (mode == "auto" and not _needs_direct(rt, kind)) or kind in SIM_ONLY_KINDS:
        return result
    result["direct"] = True
    if kind in SAFETY_KINDS:
        spec = SAFETY_KINDS[kind]
        alert_id = new_id("sfa")
        rt.alerts.on_safety_alert(_safety_msg(rt, spec, "raised", alert_id))
        _schedule(rt, float(params.get("hold_s", spec["hold_s"])),
                  lambda: rt.alerts.on_safety_alert(_safety_msg(rt, spec, "cleared", alert_id)))
        result["alerts"] = [alert_id]
        return result
    if kind == "idle_waiting":
        rt.set_waiting(True)
    alerts = rt.on_pipeline_event(_pipeline_event(rt, kind))
    result["alerts"] = [a.model_dump(mode="json") for a in alerts]
    return result


def _schedule(rt: Any, delay_s: float, fn: Any) -> None:
    loop: asyncio.AbstractEventLoop | None = rt._loop
    if loop is not None and not loop.is_closed():
        loop.call_soon_threadsafe(loop.call_later, delay_s, fn)


def fast_forward(rt: Any, minutes: float) -> dict[str, Any]:
    """Jump continuous operation to ``minutes`` so the break rule (T1 120 / T3 150 / T4 165) can be shown."""
    now = rt.now_ts()
    rt.tracker.fast_forward(minutes, now)
    changed = rt.alerts.tick(now, rt.tracker.continuous_operation_min(now))
    return {"ok": True, "continuous_operation_min": round(rt.tracker.continuous_operation_min(now), 1),
            "alerts": [a.model_dump(mode="json") for a in changed]}


def scenario(rt: Any, name: str, speed: float) -> dict[str, Any]:
    cmd = {"action": "scenario", "scenario": name, "name": name, "speed": speed, "ts": time.time()}
    return {"ok": True, "bus": rt.publish(topics.sim_control(rt.site_id, rt.machine_id), cmd, qos=1),
            "topic": topics.sim_control(rt.site_id, rt.machine_id)}
