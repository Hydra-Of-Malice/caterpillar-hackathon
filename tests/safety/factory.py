"""Sample and stream builders for the safety tests."""
from __future__ import annotations

import math
from typing import Any

from sentinel.shared.schemas import SafetyAlertMsg, TelemetrySample

from sentinel.safety.rules import RuleEngine

T0 = 1_758_600_000.0          # realistic unix-seconds magnitude, so float error in timestamps is exercised
DT = 0.1                      # 10 Hz
IDENTITY = {"site_id": "north-quarry", "machine_id": "EX-07", "operator_id": "OP-1042"}

# Stationary, belted, hydraulics locked, engine on, proximity fitted and clear.
BASELINE: dict[str, Any] = {
    "seatbelt": True, "park_brake": True, "hyd_lockout": True, "engine_on": True,
    "travel_kmh": 0.0, "swing_dps": 0.0, "gear": 0,
    "joy_swing": 0.0, "joy_boom": 0.0, "joy_stick": 0.0, "joy_bucket": 0.0, "travel_cmd": 0.0,
    "prox_fitted": True, "prox_person_m": None, "prox_person_sector": None, "prox_truck_m": None, "zone": None,
}
ACTIVE = {"park_brake": False}                       # simplest "machine active" condition
UNBELTED_ACTIVE = {"seatbelt": False, "park_brake": False}
JITTER = 1e-6                 # odd samples read 1 µm closer: never crosses a boundary, never "stuck"


def sample(ts: float, seq: int = 0, t_pub_ns: int | None = None, **signals: Any) -> TelemetrySample:
    """One TelemetrySample: BASELINE overridden by ``signals``."""
    return TelemetrySample(ts=ts, seq=seq, t_pub_ns=t_pub_ns, **IDENTITY, **{**BASELINE, **signals})


def person(d: float | None, sector: str | None = "rear") -> dict[str, Any]:
    return {"prox_person_m": d, "prox_person_sector": sector if d is not None else None}


class Stream:
    """Feeds constant-signal segments at 10 Hz into one engine and records every transition.

    ``hold(duration_s, **signals)`` emits ``round(duration_s / dt)`` samples starting at the
    current time, so the last sample of a 0.6 s hold is 0.5 s after its first.
    """

    def __init__(self, engine: RuleEngine | None = None, t0: float = T0, dt: float = DT,
                 jitter: bool = True) -> None:
        self.engine = engine if engine is not None else RuleEngine()
        self.t0, self.dt, self.jitter = t0, dt, jitter
        self.i = 0
        self.transitions: list[SafetyAlertMsg] = []
        self._open: dict[str, str] = {}              # alert_id -> rule_id

    @property
    def now(self) -> float:
        """Timestamp the next sample will carry."""
        return self.t0 + self.i * self.dt

    @property
    def last_ts(self) -> float:
        return self.t0 + (self.i - 1) * self.dt

    def step(self, **signals: Any) -> list[SafetyAlertMsg]:
        s = {**signals}
        if self.jitter and self.i % 2:
            for ch in ("prox_person_m", "prox_truck_m"):
                v = s.get(ch)
                if isinstance(v, float) and math.isfinite(v) and v > JITTER:
                    s[ch] = v - JITTER
        out = self.engine.evaluate(sample(self.now, seq=self.i, t_pub_ns=1_000 + self.i, **s))
        self.i += 1
        for m in out:
            if m.state == "raised":
                self._open[m.alert_id] = m.rule_id
            else:
                self._open.pop(m.alert_id, None)
        self.transitions.extend(out)
        return out

    def hold(self, duration_s: float, **signals: Any) -> list[SafetyAlertMsg]:
        out: list[SafetyAlertMsg] = []
        for _ in range(round(duration_s / self.dt)):
            out.extend(self.step(**signals))
        return out

    def active_rules(self) -> set[str]:
        return set(self._open.values())

    def raised(self, rule_id: str | None = None) -> list[SafetyAlertMsg]:
        return [m for m in self.transitions if m.state == "raised" and rule_id in (None, m.rule_id)]

    def cleared(self, rule_id: str | None = None) -> list[SafetyAlertMsg]:
        return [m for m in self.transitions if m.state == "cleared" and rule_id in (None, m.rule_id)]
