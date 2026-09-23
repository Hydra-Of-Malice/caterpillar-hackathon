"""Labelled event injectors (13-evaluation §5 catalogue). SIMULATED.

Every injected tick carries gt={"inject": kind, "inject_id": n, "actor": ..., ...}. Operator
issues change the *commands*; machine faults change the command→response mapping and add
signals no command explains (09-dataset §4.5); data faults corrupt sensor values only.

| kind              | 13 §5 | actor       | signature                                                          |
|-------------------|-------|-------------|--------------------------------------------------------------------|
| seatbelt_open     | C1    | operator    | seatbelt=False while working, with a short reposition travel       |
| person_rear       | C2    | environment | person walks into the rear sector down to ~2.5 m                   |
| person_warning    | C2    | environment | person approaches to ~5.5 m (inside the 7 m warning zone)          |
| fast_swing        | U1    | operator    | late braking: swing near the truck ×m faster, overshoot + reversal |
| reversal_burst    | U2    | operator    | 2 Hz square-wave oscillation on swing/stick commands               |
| boom_raised_travel| U4    | operator    | travel with the boom high                                          |
| hyd_fault         | U5    | machine     | pressure spikes with no matching joystick input, gain ×0.85, DTC   |
| idle              | U7    | operator    | engine on, no input, working rpm, no truck context                 |
| truck_wait        | U7-neg| environment | same idle while no truck is present (waiting_for_truck)           |
| over_speed        | C3    | operator    | travel in high range at ~5.5 km/h                                  |
| prox_sensor_fault | N2    | data        | proximity values stuck (bit-identical) or NaN, plus a sensor DTC   |
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sentinel.sim.kinematics import DT

if TYPE_CHECKING:                                   # pragma: no cover
    from sentinel.sim.generator import ShiftRun

HYD_FAULT_DTC = "SIM-HYD-0421"       # simulated main-pump pressure fault code (not a real Cat code)
PROX_FAULT_DTC = "SIM-PROX-0107"     # simulated proximity-sensor fault code (not a real Cat code)


@dataclass(frozen=True)
class InjectorSpec:
    kind: str
    catalogue: str
    actor: str
    defaults: dict[str, Any]
    description: str


INJECTORS: dict[str, InjectorSpec] = {s.kind: s for s in (
    InjectorSpec("seatbelt_open", "C1", "operator", {"duration_s": 30.0, "travel": True, "travel_s": 10.0,
                                                     "speed_kmh": 2.5},
                 "Seatbelt unfastened while working; the operator also trams a few metres."),
    InjectorSpec("person_rear", "C2", "environment", {"min_m": 2.5, "sector": "rear", "start_m": 12.0,
                                                      "walk_mps": 1.2, "dwell_s": 8.0},
                 "A person walks into the rear zone (inside 3 m)."),
    InjectorSpec("person_warning", "C2", "environment", {"min_m": 5.5, "sector": "left", "start_m": 14.0,
                                                         "walk_mps": 1.2, "dwell_s": 8.0},
                 "A person approaches inside the 7 m warning zone but stays outside 3 m."),
    InjectorSpec("fast_swing", "U1", "operator", {"m": 1.5, "cycles": 1},
                 "Late braking into the truck: near-truck swing speed scaled by about m."),
    InjectorSpec("reversal_burst", "U2", "operator", {"duration_s": 20.0, "amp": 0.5, "freq_hz": 2.0},
                 "Joystick reversal burst (square-wave oscillation on swing and stick)."),
    InjectorSpec("boom_raised_travel", "U4", "operator", {"duration_s": 15.0, "speed_kmh": 2.5, "boom_deg": 58.0},
                 "Travelling with the implement raised."),
    InjectorSpec("hyd_fault", "U5", "machine", {"duration_s": 600.0, "gain": 0.85, "spikes_pm": 8.0,
                                                "spike_bar": (110.0, 170.0), "dtc_delay_s": 20.0},
                 "Machine-side hydraulic fault: spikes without matching input, slower response, DTC."),
    InjectorSpec("idle", "U7", "operator", {"duration_s": 420.0, "high_rpm": True, "hyd_lock": False},
                 "Excessive idle unrelated to trucks: engine on, no input, working rpm."),
    InjectorSpec("truck_wait", "U7-neg", "environment", {"duration_s": 360.0, "high_rpm": True, "hyd_lock": False},
                 "Long wait for a truck (no truck present): the negative control for the idle rule."),
    InjectorSpec("over_speed", "C3", "operator", {"duration_s": 20.0, "speed_kmh": 5.5},
                 "Travel in high range above the site speed limit."),
    InjectorSpec("prox_sensor_fault", "N2", "data", {"duration_s": 60.0, "mode": "stuck", "dtc_delay_s": 2.0},
                 "Proximity sensor stuck (bit-identical values) or dropout (NaN), with a sensor DTC."),
)}

ALIASES = {"person_inner": "person_rear", "fast_swing_near_truck": "fast_swing", "excessive_idle": "idle",
           "overspeed": "over_speed", "seatbelt": "seatbelt_open", "sensor_fault": "prox_sensor_fault"}


def canonical_kind(kind: str) -> str:
    kind = ALIASES.get(kind, kind)
    if kind not in INJECTORS:
        raise ValueError(f"unknown injection {kind!r}; expected one of {sorted(INJECTORS)}")
    return kind


class Injection:
    """One active injection. Subclasses override start / apply / labelled."""
    needs_engine = False       # deferred while the engine is off

    def __init__(self, kind: str, iid: int, params: dict[str, Any], t: float) -> None:
        spec = INJECTORS[kind]
        self.kind, self.iid, self.actor = kind, iid, spec.actor
        self.p = {**spec.defaults, **params}
        self.t_start = t
        self.t_end: float | None = t + float(self.p["duration_s"]) if "duration_s" in self.p else None
        self.finished = False
        self.speed_hint: float | None = None

    def start(self, run: ShiftRun) -> None:
        """Called once when the injection begins."""

    def apply(self, run: ShiftRun, row: dict[str, Any]) -> None:
        """Called every tick after the machine step; may modify the output row."""

    def finish(self, run: ShiftRun) -> None:
        self.finished = True

    def labelled(self, run: ShiftRun) -> bool:
        """True while ticks should carry this injection's gt label."""
        return not self.finished

    def label(self) -> dict[str, Any]:
        out: dict[str, Any] = {"inject": self.kind, "inject_id": self.iid, "actor": self.actor}
        if "m" in self.p:
            out["m"] = self.p["m"]
        if self.p.get("natural"):
            out["natural"] = True
        return out

    def expired(self, t: float) -> bool:
        return self.t_end is not None and t >= self.t_end


class SeatbeltOpen(Injection):
    needs_engine = True

    def start(self, run: ShiftRun) -> None:
        if self.p["travel"]:
            run.push(run.travel_activity(float(self.p["travel_s"]), float(self.p["speed_kmh"])), None)

    def apply(self, run: ShiftRun, row: dict[str, Any]) -> None:
        row["seatbelt"] = False


class PersonNear(Injection):
    """Person track: walk in to min_m, dwell, walk out; ends when out of range."""

    def __init__(self, kind: str, iid: int, params: dict[str, Any], t: float) -> None:
        super().__init__(kind, iid, params, t)
        p = self.p
        self._t_in = (p["start_m"] - p["min_m"]) / p["walk_mps"]
        self._t_out = self._t_in + p["dwell_s"]
        self.t_end = t + self._t_out + (16.0 - p["min_m"]) / p["walk_mps"]

    def apply(self, run: ShiftRun, row: dict[str, Any]) -> None:
        if not row["prox_fitted"]:
            return
        p, dt = self.p, run.t - self.t_start
        if dt < self._t_in:
            d = p["start_m"] - p["walk_mps"] * dt
        elif dt < self._t_out:
            d = p["min_m"] + 0.15 * math.sin(dt)
        else:
            d = p["min_m"] + p["walk_mps"] * (dt - self._t_out)
        if d > 15.0:
            return
        near = row["prox_person_m"]
        if near is None or d < near:
            row["prox_person_m"] = round(max(0.1, d + 0.03 * run.noise.n()), 2)
            row["prox_person_sector"] = p["sector"]


class FastSwing(Injection):
    """Queues late-braking overrides for the next `cycles` loaded swings into a truck."""

    def __init__(self, kind: str, iid: int, params: dict[str, Any], t: float) -> None:
        super().__init__(kind, iid, params, t)
        self._seen = False
        self._done = False

    def start(self, run: ShiftRun) -> None:
        for _ in range(int(self.p["cycles"])):
            run.rig.pending_fast.append({"m": float(self.p["m"]), "inj": self})

    def labelled(self, run: ShiftRun) -> bool:
        fl = run.rig.fast_label
        return fl is not None and fl["inj"] is self

    def apply(self, run: ShiftRun, row: dict[str, Any]) -> None:
        if self.labelled(run):
            self._seen = True
        elif self._seen and not any(e["inj"] is self for e in run.rig.pending_fast):
            self._done = True

    def expired(self, t: float) -> bool:
        return self._done


class ReversalBurst(Injection):
    def start(self, run: ShiftRun) -> None:
        run.rig.hand.burst = (float(self.p["amp"]), float(self.p["freq_hz"]))

    def finish(self, run: ShiftRun) -> None:
        run.rig.hand.burst = None
        super().finish(run)


class BoomRaisedTravel(Injection):
    needs_engine = True

    def start(self, run: ShiftRun) -> None:
        run.push(run.travel_activity(float(self.p["duration_s"]), float(self.p["speed_kmh"]),
                                     boom_deg=float(self.p["boom_deg"])), self)
        self.t_end = None                              # ends with its activity


class HydFault(Injection):
    """Machine-side: response gain drops, pressure spikes regardless of commands, DTC after a delay."""

    def __init__(self, kind: str, iid: int, params: dict[str, Any], t: float) -> None:
        super().__init__(kind, iid, params, t)
        self._spike_ticks, self._spike_amp = 0, 0.0

    def start(self, run: ShiftRun) -> None:
        run.kin.response_gain = float(self.p["gain"])

    def apply(self, run: ShiftRun, row: dict[str, Any]) -> None:
        if not row["engine_on"]:
            return
        rng = run.rng_inj
        if self._spike_ticks == 0 and rng.random() < float(self.p["spikes_pm"]) / 60.0 * DT:
            lo, hi = self.p["spike_bar"]
            self._spike_ticks, self._spike_amp = int(rng.integers(3, 7)), float(rng.uniform(lo, hi))
        if self._spike_ticks:
            row["hyd_pressure_bar"] = round(min(395.0, row["hyd_pressure_bar"] + self._spike_amp), 1)
            self._spike_ticks -= 1
        if run.t - self.t_start >= float(self.p["dtc_delay_s"]) and HYD_FAULT_DTC not in row["dtc"]:
            row["dtc"].append(HYD_FAULT_DTC)

    def finish(self, run: ShiftRun) -> None:
        run.kin.response_gain = 1.0
        super().finish(run)


class Idle(Injection):
    needs_engine = True

    def start(self, run: ShiftRun) -> None:
        run.push(run.idle_activity(float(self.p["duration_s"]), bool(self.p["high_rpm"]), bool(self.p["hyd_lock"]),
                                   activity="idle"), self)
        self.t_end = None


class TruckWait(Injection):
    needs_engine = True

    def start(self, run: ShiftRun) -> None:
        self.t_end = None
        if run.in_truck_loading():
            run.pending_truck_wait = self              # the loading loop sends the truck away at the next pass
        else:
            run.push(run.idle_activity(float(self.p["duration_s"]), bool(self.p["high_rpm"]),
                                       bool(self.p["hyd_lock"]), activity="wait_truck"), self)

    def labelled(self, run: ShiftRun) -> bool:
        return not self.finished and run.pending_truck_wait is not self


class OverSpeed(Injection):
    needs_engine = True

    def start(self, run: ShiftRun) -> None:
        run.push(run.travel_activity(float(self.p["duration_s"]), float(self.p["speed_kmh"]), gear=2), self)
        self.t_end = None


class ProxSensorFault(Injection):
    """Data fault: freezes (stuck) or NaNs (dropout) every proximity distance, plus a sensor DTC."""
    _FIELDS = ("prox_person_m", "prox_truck_m", "bucket_to_truck_m")

    def __init__(self, kind: str, iid: int, params: dict[str, Any], t: float) -> None:
        super().__init__(kind, iid, params, t)
        self._frozen: dict[str, Any] | None = None

    def apply(self, run: ShiftRun, row: dict[str, Any]) -> None:
        if not row["prox_fitted"]:
            return
        if self.p["mode"] == "dropout":
            for f in self._FIELDS:
                row[f] = math.nan
        else:
            if self._frozen is None:
                self._frozen = {f: row[f] for f in self._FIELDS + ("prox_person_sector",)}
                if self._frozen["prox_truck_m"] is None:            # a stuck sensor reports a value
                    self._frozen["prox_truck_m"] = 3.37
            row.update(self._frozen)
        if run.t - self.t_start >= float(self.p["dtc_delay_s"]) and PROX_FAULT_DTC not in row["dtc"]:
            row["dtc"].append(PROX_FAULT_DTC)


_CLASSES: dict[str, type[Injection]] = {
    "seatbelt_open": SeatbeltOpen, "person_rear": PersonNear, "person_warning": PersonNear,
    "fast_swing": FastSwing, "reversal_burst": ReversalBurst, "boom_raised_travel": BoomRaisedTravel,
    "hyd_fault": HydFault, "idle": Idle, "truck_wait": TruckWait, "over_speed": OverSpeed,
    "prox_sensor_fault": ProxSensorFault,
}

# overlays are applied in this order so data faults corrupt what the environment produced
APPLY_ORDER = {"environment": 0, "operator": 1, "machine": 2, "data": 3}


def needs_engine(kind: str) -> bool:
    """True if the injection is deferred while the engine is off (it needs the operator working)."""
    return _CLASSES[canonical_kind(kind)].needs_engine


def make_injection(kind: str, iid: int, params: dict[str, Any], t: float) -> Injection:
    kind = canonical_kind(kind)
    return _CLASSES[kind](kind, iid, params, t)
