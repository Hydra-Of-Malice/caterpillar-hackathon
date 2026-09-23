"""Context keys, task-state gating and the excessive-idle rule (04 §3, §5.3).

context_key = f"{machine_type}|{task_type}". The `waiting_for_truck` task state (from
dispatch, an operator tap or inference; supplied via RuntimeContext) gates idle-related
features and suppresses the excessive-idle rule. Suppressed idle is still returned as an
Event carrying `context.suppressed_reason` so the alert manager can log it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sentinel.shared.schemas import (
    Attribution, Event, Provenance, RiskCategory, Source, TelemetrySample, Tier,
)

UNKNOWN_TASK = "unknown"


def machine_type_for(machine_id: str, cfg: dict[str, Any]) -> str:
    """Machine type for a machine id (config map, then the configured default)."""
    return str(cfg.get("machines", {}).get(machine_id, cfg.get("default_machine_type", "unknown")))


def context_key(machine_type: str, task_type: str | None) -> str:
    """Context key used to pick models and baselines, e.g. "EX-20t|truck_loading"."""
    return f"{machine_type}|{task_type or UNKNOWN_TASK}"


def active_task_states(waiting_for_truck: bool) -> list[str]:
    """Task states active for gating (only waiting_for_truck is modelled in the MVP)."""
    return ["waiting_for_truck"] if waiting_for_truck else []


def gated_features(waiting_for_truck: bool, cfg: dict[str, Any]) -> frozenset[str]:
    """Features whose deviations are zeroed under the active task states (04 §5.3 gating)."""
    gates: dict[str, list[str]] = cfg["fusion"].get("gates", {})
    return frozenset(f for state in active_task_states(waiting_for_truck) for f in gates.get(state, []))


def provenance_for(source: Source | str, *kinds: Provenance) -> list[Provenance]:
    """Provenance list; anything not from a real machine adapter is tagged SIMULATED."""
    real = getattr(source, "value", source) == Source.REAL.value
    return [*kinds] if real else [*kinds, Provenance.SIMULATED]


def is_idle_sample(s: TelemetrySample, fcfg: dict[str, Any]) -> bool:
    """Engine on, no travel or implement command, and no motion."""
    db = fcfg["cmd_deadband"]
    return (bool(s.engine_on)
            and s.travel_kmh < fcfg["idle_travel_kmh"]
            and abs(s.swing_dps) < fcfg["idle_swing_dps"]
            and abs(s.travel_cmd) < db
            and max(abs(s.joy_swing), abs(s.joy_boom), abs(s.joy_stick), abs(s.joy_bucket)) < db)


@dataclass
class _IdleEpisode:
    start_ts: float
    last_ts: float
    operator_id: str
    ungated_s: float = 0.0
    gated_s: float = 0.0
    fired: bool = False
    suppressed_logged: bool = False
    gate_reason: str | None = None


class IdleTracker:
    """Per-machine excessive-idle rule with the waiting_for_truck context gate.

    Idle time accumulates per episode, split into gated and ungated seconds. Gates:
    waiting_for_truck (RuntimeContext) and warm-up (the first `warmup_s` of a shift on a
    machine). Ungated idle > T_idle fires one T1 event per episode; an episode that
    reaches T_idle while mostly gated yields one suppressed-with-reason event.
    """

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.icfg = cfg["idle"]
        self.fcfg = cfg["features"]
        self.t_idle = float(self.icfg["t_idle_s"])
        self.max_dt = float(self.icfg["max_dt_s"])
        self.warmup = float(self.icfg["warmup_s"])
        self._episodes: dict[str, _IdleEpisode] = {}
        self._shift_start: dict[str, tuple[str | None, float]] = {}

    def _gate(self, s: TelemetrySample, waiting_for_truck: bool) -> str | None:
        """Reason the current idle is explained by context, if any."""
        shift, start = self._shift_start.get(s.machine_id, (None, None))
        if start is None or shift != s.shift_id:
            self._shift_start[s.machine_id] = (s.shift_id, s.ts)
            start = s.ts
        if waiting_for_truck:
            return "waiting_for_truck"
        return "warm_up" if s.ts - start < self.warmup else None

    def update(self, s: TelemetrySample, waiting_for_truck: bool, task_type: str | None) -> Event | None:
        """Advance the idle state with one sample; return an idle Event when one is due."""
        gate = self._gate(s, waiting_for_truck)
        ep = self._episodes.get(s.machine_id)
        if not is_idle_sample(s, self.fcfg):
            self._episodes.pop(s.machine_id, None)
            return None
        if ep is None or ep.operator_id != s.operator_id or s.ts - ep.last_ts > self.max_dt:
            ep = _IdleEpisode(s.ts, s.ts, s.operator_id)
            self._episodes[s.machine_id] = ep
            return None
        dt = min(s.ts - ep.last_ts, self.max_dt)
        ep.last_ts = s.ts
        if gate is not None:
            ep.gated_s += dt
            ep.gate_reason = gate
        else:
            ep.ungated_s += dt
        if ep.fired:
            return None
        if ep.ungated_s >= self.t_idle:
            ep.fired = True
            return self._event(s, ep, task_type, suppressed=False, waiting=waiting_for_truck)
        if not ep.suppressed_logged and ep.gated_s >= ep.ungated_s and ep.gated_s + ep.ungated_s >= self.t_idle:
            ep.suppressed_logged = True
            return self._event(s, ep, task_type, suppressed=True, waiting=waiting_for_truck)
        return None

    def _event(self, s: TelemetrySample, ep: _IdleEpisode, task_type: str | None,
               suppressed: bool, waiting: bool) -> Event:
        idle_s = ep.gated_s + ep.ungated_s
        context: dict[str, Any] = {
            "task_type": task_type, "task_id": s.task_id, "zone": s.zone,
            "waiting_for_truck": waiting, "idle_s": round(idle_s, 1),
            "ungated_idle_s": round(ep.ungated_s, 1), "gated_idle_s": round(ep.gated_s, 1),
            "t_idle_s": self.t_idle, "rpm": s.rpm, "travel_kmh": s.travel_kmh,
        }
        if suppressed:
            context["suppressed_reason"] = ep.gate_reason
        return Event(
            ts=s.ts, site_id=s.site_id, machine_id=s.machine_id, operator_id=s.operator_id,
            shift_id=s.shift_id, task_id=s.task_id, type=self.icfg["rule_id"],
            category=RiskCategory.unusual_harmless if suppressed else RiskCategory.procedural,
            tier=Tier(self.icfg["tier"]),
            provenance=provenance_for(s.source, Provenance.RULE),
            rule_id=self.icfg["rule_id"], rule_version=self.icfg["version"],
            attribution=Attribution.environment if suppressed else Attribution.operator,
            context=context,
            evidence={"idle_start_ts": ep.start_ts, "idle_s": round(idle_s, 1), "threshold_s": self.t_idle},
            simulated=getattr(s.source, "value", s.source) != Source.REAL.value,
        )
