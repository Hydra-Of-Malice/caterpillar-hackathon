"""SIMULATED shift telemetry generator (10 Hz TelemetrySample). Not Caterpillar data.

    sim = ShiftSimulator(load_scenario("ravi_shift1"), seed=42)
    for sample in sim.samples():          # sample.ts is simulated time (unix s)
        ...
    sim.inject("seatbelt_open")           # thread-safe; takes effect on the next tick

A scenario lists shifts; each shift follows its schedule (warm-up → tasks → breaks → cooldown).
Truck loading waits for Poisson-arriving trucks (waiting_for_truck), then loads
`passes_per_truck` cycles; trenching and stockpile tidy repeat cycles with short repositions.
Scripted cues and live `inject()` calls start injectors (see injectors.py). Ground truth goes
to sample.gt = {"phase", "cycle", "archetype", "activity", "wait_truck"?, "inject"?, ...} and
must never be read by production logic.
"""
from __future__ import annotations

import zlib
from collections import deque
from collections.abc import Iterator
from datetime import datetime
from typing import Any

import numpy as np

from sentinel.shared.schemas import TaskType, TelemetrySample, TierASnapshot
from sentinel.sim.cycles import GEOMETRY, TRAVEL_POSE, Intent, Pose, Rig, work_cycle
from sentinel.sim.injectors import APPLY_ORDER, INJECTORS, Injection, canonical_kind, make_injection, needs_engine
from sentinel.sim.kinematics import (DT, MATERIALS, RPM_LOW_IDLE, RPM_WORK, TAIL_RADIUS_M, TRAVEL_MAX_KMH,
                                     TRUCK_HALF_WIDTH_M, ExcavatorKinematics, Noise)
from sentinel.sim.operators import make_operator
from sentinel.sim.scenario import Scenario, Segment, ShiftSpec, load_scenario_file

PROX_NOISE_M = 0.03          # proximity range noise (keeps clean data off the stuck-at check)


def load_scenario(name: str) -> Scenario:
    """Load config/scenarios/<name>.yaml."""
    return load_scenario_file(name)


def _crc(s: str) -> int:
    return zlib.crc32(s.encode())


class Truck:
    """Haul truck at the loading point: absent → arriving → positioned → departing → absent."""
    FAR_M, ARRIVE_S, DEPART_S = 30.0, 15.0, 12.0

    def __init__(self) -> None:
        self.state = "absent"
        self.angle = 90.0
        self.spot_m = 7.4             # body-centre distance when positioned
        self.dist = self.FAR_M
        self._t = 0.0

    @property
    def present(self) -> bool:
        return self.state != "absent"

    def arrive(self, t: float, angle: float, spot_m: float) -> None:
        self.state, self._t, self.angle, self.spot_m, self.dist = "arriving", t, angle, spot_m, self.FAR_M

    def depart(self, t: float) -> None:
        if self.present:
            self.state, self._t = "departing", t

    def update(self, t: float) -> None:
        if self.state == "arriving":
            f = min(1.0, (t - self._t) / self.ARRIVE_S)
            self.dist = self.FAR_M + (self.spot_m - self.FAR_M) * (1 - (1 - f) ** 2)
            if f >= 1.0:
                self.state = "positioned"
        elif self.state == "departing":
            f = min(1.0, (t - self._t) / self.DEPART_S)
            self.dist = self.spot_m + (self.FAR_M + 5 - self.spot_m) * f * f
            if f >= 1.0:
                self.state = "absent"

    def prox_m(self) -> float:
        return max(0.3, self.dist - TRUCK_HALF_WIDTH_M - TAIL_RADIUS_M)


class ShiftRun:
    """Runs one ShiftSpec tick by tick (an activity stack driven by the schedule and injections)."""

    def __init__(self, sim: ShiftSimulator, spec: ShiftSpec) -> None:
        sc = sim.scenario
        self.sim, self.spec, self.sc = sim, spec, sc
        self.schedule = sc.schedule_of(spec)
        ss = np.random.SeedSequence([sim.seed, _crc(sc.name), _crc(spec.shift_id)])
        r_ops, self.rng_env, self.rng_inj, r_noise, r_hand = (np.random.default_rng(s) for s in ss.spawn(5))
        self.noise = Noise(r_noise)
        mspec = sc.machines[spec.machine_id]
        self.prox_fitted = mspec.prox_fitted
        c = sim.counters.setdefault(spec.machine_id, {"smu_h": mspec.smu_h, "idle_h": 0.35 * mspec.smu_h,
                                                      "fuel_l": mspec.fuel_l})
        self.kin = ExcavatorKinematics(self.noise, ambient_c=spec.conditions.ambient_c, smu_h=c["smu_h"],
                                       fuel_l=c["fuel_l"])
        self.kin.s.idle_h = c["idle_h"]
        self.rig = Rig(self.kin, make_operator(spec.archetype, spec.operator_id, spec.skill,
                                              overrides=spec.operator_overrides), r_ops, Noise(r_hand))
        self.t0 = spec.start.timestamp()
        self.tick = 0
        self.t = self.t0
        self.stack: list[tuple[Iterator[Intent], Injection | None]] = []
        self.injections: list[Injection] = []
        self.pending_truck_wait: Injection | None = None
        self.seatbelt = True
        self.truck = Truck()
        self.seg: Segment | None = None
        self.task_id: str | None = None
        self.seg_end = self.t0
        self.op_hours = 0.0
        self._material_factor = 1.0
        rain = spec.conditions.rain_from
        self._rain_ts = (datetime.combine(spec.start.date(), rain, tzinfo=spec.start.tzinfo).timestamp()
                         if rain else None)
        self._cues = self._build_cues()
        self._cue_i = 0
        self._belt_lapse_break = self._draw_belt_lapse()
        self.last_dtc: list[str] = []

    # ------------------------------------------------------------ setup
    def _build_cues(self) -> list[tuple[float, str, dict[str, Any], float | None]]:
        cues = [(c.offset_s, c.kind, dict(c.params), c.speed) for c in self.spec.cues]
        end = self.sc.end_of(self.spec)
        for f in self.sc.machines[self.spec.machine_id].faults:
            lo, hi = max(f.start, self.spec.start), min(f.end, end)
            if hi > lo:
                cues.append(((lo - self.spec.start).total_seconds(), f.kind,
                             {**f.params, "duration_s": (hi - lo).total_seconds()}, None))
        return sorted(cues, key=lambda c: c[0])

    def _draw_belt_lapse(self) -> int | None:
        """Low-probability events: maybe forget the seatbelt after one of the breaks."""
        breaks = [i for i, s in enumerate(self.schedule) if s.kind == "break"]
        if not (self.spec.low_prob_events and breaks):
            return None
        if self.rng_inj.random() >= self.rig.params.belt_off_p:
            return None
        return int(self.rng_inj.choice(breaks))

    # ------------------------------------------------------------ public helpers for injectors
    def push(self, gen: Iterator[Intent], inj: Injection | None) -> None:
        self.stack.append((gen, inj))

    def in_truck_loading(self) -> bool:
        return self.seg is not None and self.seg.task_type == TaskType.truck_loading

    def idle_activity(self, seconds: float, high_rpm: bool, hyd_lock: bool, activity: str) -> Iterator[Intent]:
        """Engine on, levers released; high_rpm keeps working rpm (auto-idle off)."""
        kin = self.kin
        prev_auto, prev_dial = kin.auto_idle, kin.dial_rpm
        kin.auto_idle = not high_rpm
        kin.dial_rpm = RPM_WORK
        n = int(seconds / DT)
        it = Intent(phase="idle", activity=activity)
        for i in range(n):
            if hyd_lock and i == 20:
                kin.s.hyd_lockout = True
            if hyd_lock and i == n - 10:
                kin.s.hyd_lockout = False
            yield it
        kin.auto_idle, kin.dial_rpm = prev_auto, prev_dial

    def travel_activity(self, seconds: float, speed_kmh: float, gear: int = 1, boom_deg: float | None = None,
                        activity: str = "travel") -> Iterator[Intent]:
        """Raise the implement to travel pose, travel at speed_kmh, stop."""
        rig, s, kin = self.rig, self.kin.s, self.kin
        prev_lock, prev_dial = s.hyd_lockout, kin.dial_rpm
        s.hyd_lockout, kin.dial_rpm = False, RPM_WORK          # the operator unlocks and throttles up to tram
        pose = TRAVEL_POSE if boom_deg is None else Pose(boom_deg, 70, 100)
        for _ in range(30):
            if rig.at_pose(pose, tol=5.0):
                break
            b, k, c = rig.pose_cmd(pose)
            yield Intent(0.0, b, k, c, phase="travel", activity=activity)
        vmax = TRAVEL_MAX_KMH[gear]
        s.gear = gear
        self.kin.travel_boost = max(1.0, speed_kmh / vmax)
        tc = min(1.0, speed_kmh / vmax)
        for _ in range(int(seconds / DT)):
            b, k, c = rig.pose_cmd(pose, cap=0.3)
            yield Intent(0.0, b, k, c, travel=tc, phase="travel", activity=activity)
        stop = Intent(phase="travel", activity=activity)
        for _ in range(20):
            yield stop
        s.gear = 0
        kin.travel_boost = 1.0
        s.hyd_lockout, kin.dial_rpm = prev_lock, prev_dial

    # ------------------------------------------------------------ segment activities
    def _refresh(self) -> None:
        rain = self.spec.conditions.rain_cycle_mult if self._rain_ts is not None and self.t >= self._rain_ts else 1.0
        self.rig.refresh(self.op_hours)
        self.rig.dig_time_factor = self._material_factor * rain

    def _hold(self, activity: str, until: float) -> Iterator[Intent]:
        it = Intent(phase="idle", activity=activity)
        while self.t < until:
            yield it

    def _warmup(self) -> Iterator[Intent]:
        kin, s = self.kin, self.kin.s
        s.hyd_lockout, self.seatbelt = True, True
        yield from self._hold("warmup", self.t + 2.0)
        kin.start_engine()
        yield from self._hold("warmup", self.seg_end - 20.0)
        kin.dial_rpm, s.hyd_lockout = RPM_WORK, False
        yield from self._hold("warmup", self.seg_end)

    def _break(self, index: int) -> Iterator[Intent]:
        kin, s = self.kin, self.kin.s
        s.hyd_lockout = True
        kin.dial_rpm = RPM_LOW_IDLE
        yield from self._hold("break", self.t + 30.0)
        kin.stop_engine()
        yield from self._hold("break", self.t + 10.0)
        self.seatbelt = False                                   # operator leaves the cab
        yield from self._hold("break", self.seg_end - 90.0)
        self.seatbelt = True
        yield from self._hold("break", self.t + 5.0)
        kin.start_engine()
        yield from self._hold("break", self.seg_end - 10.0)
        kin.dial_rpm, s.hyd_lockout = RPM_WORK, False
        if index == self._belt_lapse_break:                     # natural lapse (low-probability events)
            self.sim.inject("seatbelt_open", natural=True, duration_s=float(self.rng_inj.uniform(40, 120)))
        yield from self._hold("break", self.seg_end)

    def _cooldown(self) -> Iterator[Intent]:
        kin, s = self.kin, self.kin.s
        s.hyd_lockout = True
        kin.dial_rpm = RPM_LOW_IDLE
        yield from self._hold("cooldown", self.seg_end - 10.0)
        kin.stop_engine()
        yield from self._hold("cooldown", self.seg_end - 3.0)
        self.seatbelt = False
        yield from self._hold("cooldown", self.seg_end)

    def _wait_for_truck(self, seconds: float, seg: Segment, high_rpm: bool | None = None) -> Iterator[Intent]:
        """Idle (waiting_for_truck) for about `seconds`; the next truck arrives in the last 15 s once the
        previous one has left, and the wait ends when it is positioned."""
        p, rng, kin = self.rig.params, self.rng_env, self.kin
        lock = rng.random() < p.hyd_lock_wait_p
        high = rng.random() < p.idle_high_rpm_p if high_rpm is None else high_rpm
        prev_auto = kin.auto_idle
        kin.auto_idle = not high
        n = max(1, int(seconds / DT))
        n_arrive = max(0, n - int(Truck.ARRIVE_S / DT))
        it = Intent(phase="idle", activity="wait_truck")
        i = 0
        while i < n or self.truck.state != "positioned":
            if i >= n_arrive and self.truck.state == "absent":
                self.truck.arrive(self.t, seg.truck_angle_deg + float(rng.normal(0, 4)), float(rng.uniform(7.1, 7.7)))
            if lock and i == 20 and n > 60:
                kin.s.hyd_lockout = True
            if lock and i == n - 15:
                kin.s.hyd_lockout = False
            yield it
            i += 1
        kin.s.hyd_lockout = False
        kin.auto_idle = prev_auto

    def _truck_loading(self, seg: Segment) -> Iterator[Intent]:
        geo, rng = GEOMETRY["truck_loading"], self.rng_env
        if seg.truck_present and not self.truck.present:
            self.truck.arrive(self.t - Truck.ARRIVE_S, seg.truck_angle_deg, 7.4)
            self.truck.update(self.t)
        while self.t < self.seg_end:
            if self.truck.state != "positioned":
                inj, self.pending_truck_wait = self.pending_truck_wait, None
                if inj is not None:
                    yield from self._wait_for_truck(float(inj.p["duration_s"]), seg, bool(inj.p["high_rpm"]))
                    inj.finish(self)
                else:
                    yield from self._wait_for_truck(max(20.0, float(rng.exponential(seg.truck_gap_s))), seg)
            react = Intent(phase="idle", activity="work")
            for _ in range(int(self.rig.params.react_s * float(rng.uniform(0.7, 1.3)) / DT)):
                yield react
            for _ in range(seg.passes_per_truck):
                self._refresh()
                self.rig.truck = (self.truck.angle, self.truck.spot_m)
                yield from work_cycle(self.rig, geo, self.truck.angle + float(rng.normal(0, 1.5)))
                if self.pending_truck_wait is not None or self.t >= self.seg_end:
                    break
            self.rig.truck = None
            self.truck.depart(self.t)

    def _repeat_cycles(self, seg: Segment, every: int, move_s: float, move_kmh: float) -> Iterator[Intent]:
        geo, rng = GEOMETRY[seg.task_type.value], self.rng_env
        k = 0
        while self.t < self.seg_end:
            self._refresh()
            if seg.task_type == TaskType.stockpile:
                dump = (45.0 if k % 2 == 0 else -40.0) + float(rng.normal(0, 4))
            else:
                dump = geo.dump_angle + float(rng.normal(0, 3))
            yield from work_cycle(self.rig, geo, dump)
            k += 1
            if k % every == 0:
                yield from self.travel_activity(move_s, move_kmh, activity="work")

    def _segment(self, index: int, seg: Segment) -> Iterator[Intent]:
        if seg.kind == "warmup":
            return self._warmup()
        if seg.kind == "break":
            return self._break(index)
        if seg.kind == "cooldown":
            return self._cooldown()
        if seg.kind == "travel":
            return self.travel_activity(max(5.0, seg.minutes * 60.0 - 6.0), seg.speed_kmh)
        self.kin.set_material(seg.material)
        self._material_factor = MATERIALS.get(seg.material, MATERIALS["clay_gravel"])[2]
        if seg.task_type == TaskType.truck_loading:
            return self._truck_loading(seg)
        if seg.task_type == TaskType.trenching:
            return self._repeat_cycles(seg, every=6, move_s=4.0, move_kmh=1.3)
        return self._repeat_cycles(seg, every=5, move_s=6.0, move_kmh=2.0)

    # ------------------------------------------------------------ tick loop
    def _events(self) -> None:
        while self._cue_i < len(self._cues) and self._cues[self._cue_i][0] <= self.t - self.t0 + 1e-6:
            _, kind, params, speed = self._cues[self._cue_i]
            self.sim.inject(kind, speed=speed, **params)
            self._cue_i += 1
        q, deferred, changed = self.sim.queue, [], False
        while q:
            kind, params, speed = q.popleft()
            if needs_engine(kind) and not self.kin.s.engine_on:
                deferred.append((kind, params, speed))
                continue
            inj = make_injection(kind, self.sim.next_iid(), params, self.t)
            inj.speed_hint = speed
            self.injections.append(inj)
            inj.start(self)
            changed = True
        q.extend(deferred)
        for inj in self.injections:
            if not inj.finished and inj.expired(self.t):
                inj.finish(self)
        if changed or any(i.finished for i in self.injections):
            self.injections = sorted((i for i in self.injections if not i.finished), key=lambda i: APPLY_ORDER[i.actor])
        hints = [i.speed_hint for i in self.injections if i.speed_hint]
        self.sim.speed_hint = max(hints) if hints else None

    def rows(self) -> Iterator[dict[str, Any]]:
        """Yield one dict per 10 Hz tick (TelemetrySample fields)."""
        planned = self.t0
        for index, seg in enumerate(self.schedule):
            planned += seg.minutes * 60.0
            self.seg, self.seg_end = seg, planned
            self.task_id = seg.task_id.format(shift=self.spec.shift_id) if seg.kind == "task" and seg.task_id else None
            self.stack = [(self._segment(index, seg), None)]
            while self.stack:
                self._events()
                gen, inj = self.stack[-1]
                try:
                    it = next(gen)
                except StopIteration:
                    self.stack.pop()
                    if inj is not None:
                        inj.finish(self)
                    continue
                yield self._step(it)
        c = self.sim.counters[self.spec.machine_id]
        c["smu_h"], c["idle_h"], c["fuel_l"] = self.kin.s.smu_h, self.kin.s.idle_h, self.kin.s.fuel_l

    def _step(self, it: Intent) -> dict[str, Any]:
        rig, kin, s = self.rig, self.kin, self.kin.s
        joy = rig.actuate(it)
        if s.engine_on:
            self.op_hours += DT / 3600.0
        self.truck.update(self.t)
        row = self._row(it, joy)
        for inj in self.injections:
            inj.apply(self, row)
        self.last_dtc = row["dtc"]
        labels = [i for i in self.injections if i.labelled(self)]
        if labels:
            row["gt"].update(labels[-1].label())
            if len(labels) > 1:
                row["gt"]["injects"] = sorted({i.kind for i in labels})
        self.tick += 1
        self.t = self.t0 + self.tick * DT
        self.sim.seq += 1
        return row

    def _row(self, it: Intent, joy: list[float]) -> dict[str, Any]:
        s, seg, spec, n = self.kin.s, self.seg, self.spec, self.noise
        truck_m = b2t = None
        if self.prox_fitted and self.truck.present:
            truck_m = round(abs(self.truck.prox_m() + PROX_NOISE_M * n.n()), 2)
            d = self.kin.bucket_to_truck(self.truck.angle, self.truck.dist)
            b2t = round(abs(d + PROX_NOISE_M * n.n()), 2)
        gt: dict[str, Any] = {"phase": it.phase, "cycle": self.rig.cycle if it.activity == "work" and self.rig.cycle >= 0
                              else None, "archetype": spec.archetype, "activity": it.activity}
        if it.activity == "wait_truck":
            gt["wait_truck"] = True
        return {
            "ts": round(self.t, 2), "seq": self.sim.seq, "source": "SIM",
            "site_id": self.sc.site_id, "machine_id": spec.machine_id, "operator_id": spec.operator_id,
            "shift_id": spec.shift_id,
            "task_id": self.task_id,
            "task_type": seg.task_type.value if seg.kind == "task" else None,
            "zone": seg.zone,
            "engine_on": s.engine_on, "rpm": round(max(0.0, s.rpm), 1), "throttle_pct": round(s.throttle_pct, 1),
            "fuel_rate_lph": round(s.fuel_rate_lph, 2), "coolant_c": round(s.coolant_c, 1),
            "travel_kmh": round(s.travel_kmh, 2), "gear": s.gear, "park_brake": s.park_brake,
            "service_brake": s.service_brake, "swing_brake": s.swing_brake, "hyd_lockout": s.hyd_lockout,
            "joy_swing": round(joy[0], 3), "joy_boom": round(joy[1], 3), "joy_stick": round(joy[2], 3),
            "joy_bucket": round(joy[3], 3), "travel_cmd": round(it.travel, 3),
            "swing_dps": round(s.swing_dps, 2), "swing_angle_deg": round(s.swing_angle_deg, 2),
            "boom_angle_deg": round(s.boom_angle_deg, 2), "stick_angle_deg": round(s.stick_angle_deg, 2),
            "bucket_angle_deg": round(s.bucket_angle_deg, 2), "hyd_pressure_bar": round(s.hyd_pressure_bar, 1),
            "hyd_pilot_bar": round(s.hyd_pilot_bar, 1), "hyd_oil_temp_c": round(s.hyd_oil_temp_c, 1),
            "payload_t": round(s.payload_t, 3),
            "seatbelt": self.seatbelt, "prox_fitted": self.prox_fitted,
            "prox_person_m": None, "prox_person_sector": None, "prox_truck_m": truck_m, "bucket_to_truck_m": b2t,
            "dtc": [], "gt": gt,
        }


class ShiftSimulator:
    """Seeded, deterministic shift simulator over a Scenario (one or more shifts, in start order)."""

    def __init__(self, scenario: Scenario, seed: int = 42) -> None:
        self.scenario = scenario
        self.seed = seed
        self.queue: deque[tuple[str, dict[str, Any], float | None]] = deque()
        self.seq = 0
        self.iid = 0
        self.counters: dict[str, dict[str, float]] = {}
        self.run: ShiftRun | None = None
        self.speed_hint: float | None = None      # pacing hint from an active cue (used by sim.run)

    def next_iid(self) -> int:
        self.iid += 1
        return self.iid

    def inject(self, kind: str, **params: Any) -> None:
        """Queue an injection (kinds: see injectors.INJECTORS). Thread-safe; applied on the next tick.
        Optional `speed` is a pacing hint for the runner while the injection is active."""
        kind = canonical_kind(kind)
        speed = params.pop("speed", None)
        unknown = set(params) - set(INJECTORS[kind].defaults) - {"natural"}
        if unknown:
            raise ValueError(f"{kind}: unknown params {sorted(unknown)}")
        self.queue.append((kind, params, speed))

    def rows(self) -> Iterator[dict[str, Any]]:
        """Fast path: plain dicts with TelemetrySample fields (used for datasets)."""
        for spec in sorted(self.scenario.shifts, key=lambda s: (s.start, s.machine_id)):
            self.run = ShiftRun(self, spec)
            yield from self.run.rows()

    def samples(self) -> Iterator[TelemetrySample]:
        """10 Hz TelemetrySample stream; sample.ts is simulated time."""
        for row in self.rows():
            yield TelemetrySample.model_validate(row)

    def tier_a(self) -> TierASnapshot | None:
        """Telematics-style cumulative snapshot for the machine currently simulated."""
        if self.run is None:
            return None
        s = self.run.kin.s
        return TierASnapshot(ts=round(self.run.t, 2), machine_id=self.run.spec.machine_id, smu_h=round(s.smu_h, 3),
                             idle_h=round(s.idle_h, 3), fuel_l=round(s.fuel_l, 2), dtc=list(self.run.last_dtc))
