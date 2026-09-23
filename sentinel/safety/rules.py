"""Deterministic critical-safety advisory rules (independent of ML).

``RuleEngine`` consumes 10 Hz ``TelemetrySample``s and returns only raised/cleared transitions as
``SafetyAlertMsg``. Thresholds, debounce and latch settings live in ``config/rules.yaml``.
All timing uses ``sample.ts`` (never the wall clock). Use one engine per machine.

Non-claim: this is the highest-priority *advisory* layer. It mirrors, and never replaces, OEM
interlocks and certified detection systems; it is not an ISO 19014 safety function.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable

from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import Provenance, SafetyAlertMsg, Source, TelemetrySample, new_id

from sentinel.safety.health import HealthState, ProxFault, ProximityMonitor, SeatbeltMonitor
from sentinel.safety.latch import EPS_S, Latch, Transition

SEAT, PROX_CRIT, PROX_WARN, SPEED, LOCK, SENSOR = (
    "R-SEAT-01", "R-PROX-CRIT", "R-PROX-WARN", "R-SPEED-01", "R-LOCK-01", "R-SENSOR-01")
RULE_IDS = (SEAT, PROX_CRIT, PROX_WARN, SPEED, LOCK, SENSOR)
CORE_SIGNALS = ("seatbelt", "park_brake", "travel_kmh", "swing_dps", "hyd_lockout", "engine_on", "prox_fitted")
_TEXT_KEYS = ("what", "why", "do")


@dataclass(frozen=True, slots=True)
class Activity:
    """Whether the machine is "active" (07 IMM-2) and which inputs made it so."""
    active: bool
    reasons: tuple[str, ...]


@dataclass(slots=True)
class _Open:
    """A raised (latched) activation: its stable id and the texts announced at raise time."""
    alert_id: str
    raised_ts: float
    what: str
    why: str
    do: str


@dataclass(slots=True)
class _Slot:
    """One rule activation channel: rule id, subject key (sensor name for R-SENSOR-01) and its latch."""
    rule_id: str
    key: str
    latch: Latch
    cfg: dict[str, Any]
    texts: dict[str, str]
    open: _Open | None = None


Evidence = Callable[[TelemetrySample, Activity], dict[str, Any]]


class _Fields(dict):
    def __missing__(self, key: str) -> str:
        return "?"


def _num(x: float | None) -> float | str | None:
    """JSON-safe rounded number; non-finite values become strings ("nan", "inf")."""
    if x is None:
        return None
    return round(x, 3) if math.isfinite(x) else str(x)


def _text(v: Any) -> str:
    if v is None:
        return "unknown"
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, float):
        return f"{v:.2f}".rstrip("0").rstrip(".")
    return str(v)


class RuleEngine:
    """Independent deterministic safety rules. Pure: no I/O, no wall clock, < 0.2 ms per sample."""

    def __init__(self, rules: dict | None = None) -> None:
        cfg = rules if rules is not None else load_yaml("rules")
        self.rule_version = str(cfg["rule_version"])
        act = cfg["activity"]
        self._travel_gt = float(act["travel_kmh_gt"])
        self._swing_gt = float(act["swing_dps_abs_gt"])
        self._joy_gt = float(act["joystick_abs_gt"])
        self._joy_channels = tuple(act["joystick_channels"])
        self._reason_text: dict[str, str] = dict(act["reason_text"])
        self._stale_s = float(cfg["health"]["telemetry_stale_s"])

        rc = {rid: cfg["rules"][rid] for rid in RULE_IDS}          # KeyError names a missing rule
        self._danger_m = float(rc[PROX_CRIT]["danger_m"])
        self._warn_min_m = float(rc[PROX_WARN]["warn_min_m"])
        self._warn_max_m = float(rc[PROX_WARN]["warn_max_m"])
        self._warn_needs_active = bool(rc[PROX_WARN].get("requires_active", True))
        self._speed_default = float(rc[SPEED]["default_limit_kmh"])
        self._zone_limits = tuple(sorted(((str(p), float(v)) for p, v in rc[SPEED]["zone_limits_kmh"].items()),
                                         key=lambda kv: -len(kv[0])))   # longest prefix wins
        self._speed_margin = float(rc[SPEED]["clear_margin_kmh"])

        belt_cfg, prox_cfg = rc[SENSOR]["seatbelt"], rc[SENSOR]["proximity"]
        self._belt_mon = SeatbeltMonitor(belt_cfg["flap_window_s"], belt_cfg["flap_max_transitions"])
        self._prox_mon = ProximityMonitor(prox_cfg["channels"], prox_cfg["invalid_s"], prox_cfg["stuck_s"])
        self._prox_channels = self._prox_mon.channels
        self._prox_fault: ProxFault | None = None

        def slot(rid: str, key: str = "", sub: dict[str, Any] | None = None) -> _Slot:
            own = sub if sub is not None else rc[rid]
            return _Slot(rid, key, Latch(rc[rid]["debounce_s"], own["clear_hold_s"]), rc[rid], own["texts"])

        self._belt_sensor = slot(SENSOR, "seatbelt", belt_cfg)
        self._prox_sensor = slot(SENSOR, "proximity", prox_cfg)
        self._seat, self._crit, self._warn = slot(SEAT), slot(PROX_CRIT), slot(PROX_WARN)
        self._speed, self._lock = slot(SPEED), slot(LOCK)
        self._slots = (self._belt_sensor, self._prox_sensor, self._seat, self._crit, self._warn,
                       self._speed, self._lock)
        by_id = {s.rule_id: s for s in self._slots if not s.key}
        self._warn_inhibitors = tuple(by_id[r] for r in rc[PROX_WARN].get("inhibited_by", ()))

        self._last_ts: float | None = None
        self._prox_fitted: bool | None = None

    # ------------------------------------------------------------------ public API
    def evaluate(self, sample: TelemetrySample) -> list[SafetyAlertMsg]:
        """Advance all rules by one sample; return only raised/cleared transitions.

        Order: sensor validation first (a faulty sensor freezes the rules that depend on it, holding
        any latched alert), then seatbelt, danger zone, warning zone, over-speed, hydraulic lockout.
        """
        ts = sample.ts
        if self._last_ts is not None and ts < self._last_ts:
            self._rebase(ts)
        self._last_ts, self._prox_fitted = ts, sample.prox_fitted
        act = self._activity(sample)
        out: list[SafetyAlertMsg] = []

        self._step(out, self._belt_sensor, self._belt_mon.update(ts, sample.seatbelt), sample, act,
                   self._ev_belt_sensor)
        if sample.prox_fitted:
            self._prox_fault = self._prox_mon.update(sample)
        else:
            self._prox_mon.reset()
            self._prox_fault = None
        self._step(out, self._prox_sensor, self._prox_fault is not None, sample, act, self._ev_prox_sensor)
        belt_bad = self._belt_sensor.latch.raised
        prox_bad = not sample.prox_fitted or self._prox_sensor.latch.raised

        self._step(out, self._seat, (not sample.seatbelt) and act.active, sample, act, self._ev_seat,
                   frozen=belt_bad)
        d = sample.prox_person_m
        self._step(out, self._crit, self._cond_danger(d), sample, act, self._ev_danger, frozen=prox_bad)
        inhibit = any(s.latch.raised for s in self._warn_inhibitors)
        self._step(out, self._warn, self._cond_warning(d, act), sample, act, self._ev_warning,
                   frozen=prox_bad, inhibit=inhibit)
        self._step(out, self._speed, self._cond_speed(sample), sample, act, self._ev_speed)
        lock = (not sample.seatbelt) and (not sample.hyd_lockout) and sample.engine_on and not act.active
        self._step(out, self._lock, lock, sample, act, self._ev_lock, frozen=belt_bad)
        return out

    def sensor_health(self, now_ts: float) -> dict[str, HealthState]:
        """Health of the safety inputs at ``now_ts`` (sample-clock seconds).

        telemetry: ok | stale (no sample for > telemetry_stale_s, or none yet);
        seatbelt: ok | fault | stale; proximity: ok | not_fitted | fault | stale.
        """
        stale = self._last_ts is None or now_ts - self._last_ts > self._stale_s + EPS_S
        belt: HealthState = "stale" if stale else ("fault" if self._belt_sensor.latch.raised else "ok")
        prox: HealthState
        if self._prox_fitted is False:
            prox = "not_fitted"
        elif stale:
            prox = "stale"
        else:
            prox = "fault" if self._prox_sensor.latch.raised else "ok"
        return {"seatbelt": belt, "proximity": prox, "telemetry": "stale" if stale else "ok"}

    def active_alert_ids(self) -> list[str]:
        """Ids of currently latched activations, oldest first."""
        opened = sorted((s.open for s in self._slots if s.open is not None), key=lambda o: o.raised_ts)
        return [o.alert_id for o in opened]

    def required_signals(self, prox_fitted: bool = True) -> tuple[str, ...]:
        """Payload keys the rules read; a payload missing any of them must not be trusted."""
        prox = self._prox_channels if prox_fitted else ()
        return CORE_SIGNALS + self._joy_channels + prox

    @property
    def last_ts(self) -> float | None:
        """``ts`` of the most recent sample evaluated."""
        return self._last_ts

    # ------------------------------------------------------------------ conditions
    def _activity(self, s: TelemetrySample) -> Activity:
        reasons: list[str] = []
        if not s.park_brake:
            reasons.append("park_brake_released")
        v, w = s.travel_kmh, s.swing_dps
        invalid = not (math.isfinite(v) and math.isfinite(w))
        if v > self._travel_gt:
            reasons.append("travel")
        if abs(w) > self._swing_gt:
            reasons.append("swing")
        if not s.hyd_lockout:
            for c in self._joy_channels:
                j = getattr(s, c)
                if not math.isfinite(j):
                    invalid = True
                elif abs(j) > self._joy_gt:
                    reasons.append("controls")
                    break
        if invalid:
            reasons.append("signal_invalid")       # unknown motion is treated as motion
        return Activity(bool(reasons), tuple(reasons))

    def _cond_danger(self, d: float | None) -> bool | None:
        if d is None:
            return False
        if not math.isfinite(d) or d < 0.0:
            return None
        return d <= self._danger_m

    def _cond_warning(self, d: float | None, act: Activity) -> bool | None:
        if d is None:
            return False
        if not math.isfinite(d) or d < 0.0:
            return None
        return self._warn_min_m < d <= self._warn_max_m and (act.active or not self._warn_needs_active)

    def _speed_limit(self, zone: str | None) -> float:
        if zone:
            for prefix, limit in self._zone_limits:
                if zone.startswith(prefix):
                    return limit
        return self._speed_default

    def _cond_speed(self, s: TelemetrySample) -> bool | None:
        v = s.travel_kmh
        if not math.isfinite(v):
            return None
        limit = self._speed_limit(s.zone)
        if v > limit:
            return True
        return False if v <= limit - self._speed_margin else None

    # ------------------------------------------------------------------ evidence
    def _ev_seat(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        return {"seatbelt": s.seatbelt, "park_brake": s.park_brake, "hyd_lockout": s.hyd_lockout,
                "travel_kmh": _num(s.travel_kmh), "swing_dps": _num(s.swing_dps),
                "max_abs_joystick": _num(max(abs(getattr(s, c)) for c in self._joy_channels)),
                "active": act.active, "active_reasons": list(act.reasons)}

    def _ev_danger(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        return {"distance_m": _num(s.prox_person_m), "sector": s.prox_person_sector,
                "danger_m": self._danger_m, "active": act.active, "active_reasons": list(act.reasons)}

    def _ev_warning(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        return {**self._ev_danger(s, act), "warn_min_m": self._warn_min_m, "warn_max_m": self._warn_max_m}

    def _ev_speed(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        limit = self._speed_limit(s.zone)
        return {"travel_kmh": _num(s.travel_kmh), "limit_kmh": limit,
                "clear_at_kmh": limit - self._speed_margin, "gear": s.gear}

    def _ev_lock(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        return {"seatbelt": s.seatbelt, "hyd_lockout": s.hyd_lockout, "engine_on": s.engine_on,
                "park_brake": s.park_brake, "travel_kmh": _num(s.travel_kmh), "swing_dps": _num(s.swing_dps),
                "active": act.active}

    def _ev_belt_sensor(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        mon = self._belt_mon
        n = mon.transitions_in_window
        return {"sensor": "seatbelt", "fault": "flapping" if n > mon.max_transitions else None,
                "transitions": n, "window_s": mon.window_s, "max_transitions": mon.max_transitions,
                "seatbelt": s.seatbelt}

    def _ev_prox_sensor(self, s: TelemetrySample, act: Activity) -> dict[str, Any]:
        f = self._prox_fault
        ev: dict[str, Any] = {"sensor": "proximity", "prox_fitted": s.prox_fitted,
                              "fault": f.kind if f else None}
        if f:
            ev.update(channel=f.channel, value=_num(f.value), duration_s=_num(f.duration_s), limit_s=f.limit_s)
        return ev

    # ------------------------------------------------------------------ transitions
    def _step(self, out: list[SafetyAlertMsg], slot: _Slot, cond: bool | None, sample: TelemetrySample,
              act: Activity, evidence: Evidence, *, frozen: bool = False, inhibit: bool = False) -> None:
        tr = slot.latch.step(cond, sample.ts, frozen=frozen, inhibit_raise=inhibit)
        if tr is not None:
            out.append(self._message(slot, tr, sample, evidence(sample, act)))

    def _message(self, slot: _Slot, tr: Transition, sample: TelemetrySample,
                 evidence: dict[str, Any]) -> SafetyAlertMsg:
        cfg = slot.cfg
        ev: dict[str, Any] = {
            "tier": cfg["tier"], "category": cfg["category"], "attribution": cfg["attribution"],
            "event_type": cfg["event_type"], "provenance": self._provenance(sample),
            "seq": sample.seq, "zone": sample.zone, **evidence}
        if tr == "raised":
            what, why, do = self._render(slot.texts, ev)
            slot.open = _Open(new_id("sfa"), sample.ts, what, why, do)
            ev.update(onset_ts=slot.latch.onset_ts, debounce_s=slot.latch.debounce_s)
            opened = slot.open
        else:
            opened, slot.open = slot.open, None
            assert opened is not None, "latch cleared without an open activation"
            ev.update(raised_ts=opened.raised_ts, active_s=round(sample.ts - opened.raised_ts, 3),
                      clear_hold_s=slot.latch.clear_hold_s)
        return SafetyAlertMsg(
            alert_id=opened.alert_id, rule_id=slot.rule_id, rule_version=self.rule_version, state=tr,
            ts=sample.ts, machine_id=sample.machine_id, operator_id=sample.operator_id,
            what=opened.what, why=opened.why, do=opened.do, evidence=ev, sample_t_pub_ns=sample.t_pub_ns)

    def _render(self, texts: dict[str, str], ev: dict[str, Any]) -> tuple[str, str, str]:
        fields = _Fields({k: _text(v) for k, v in ev.items()})
        reasons = ev.get("active_reasons") or ()
        fields["active_reason"] = self._reason_text.get(reasons[0], reasons[0]) if reasons else "machine active"
        what, why, do = (texts[k].format_map(fields) for k in _TEXT_KEYS)
        return what, why, do

    @staticmethod
    def _provenance(sample: TelemetrySample) -> list[str]:
        if sample.source == Source.REAL:
            return [Provenance.RULE.value]
        return [Provenance.RULE.value, Provenance.SIMULATED.value]

    def _rebase(self, ts: float) -> None:
        """The sample clock went backwards (scenario restart): restart running timers conservatively."""
        for s in self._slots:
            s.latch.rebase(ts)
        self._belt_mon.rebase(ts)
        self._prox_mon.rebase(ts)
