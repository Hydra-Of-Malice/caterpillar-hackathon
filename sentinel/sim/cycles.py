"""Human-like work-cycle controller (dig → swing_loaded → dump → swing_empty). SIMULATED.

Each phase is a generator that reads the machine state (closed loop) and yields an `Intent`
(intended lever positions + phase label) every 10 Hz tick. A `Rig` couples the operator's
style (`Hand`, `OperatorParams`) to the kinematics; `Rig.actuate` turns an intent into
joystick commands and steps the machine. Shared by the shift generator and practice sessions.
"""
from __future__ import annotations

import math
from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from sentinel.sim.kinematics import (BOOM_MAX_DPS, BUCKET_MAX_DPS, DT, MATERIALS, STICK_MAX_DPS, SWING_MAX_DPS,
                                     SWING_PLUG_DPS2, SWING_TAU_S, ExcavatorKinematics, Noise, bucket_to_body,
                                     clip, tip_position)
from sentinel.sim.operators import Hand, OperatorParams, OperatorProfile

WORK_PHASES = frozenset({"dig", "swing_loaded", "dump", "swing_empty"})
FAST_SWING_MAX_DPS = 57.0   # injected fast swings run ~40–60 °/s near the truck (plus lever tremor)
SWING_FEEDBACK = 0.5      # operators correct the swing lever on the speed they see (reduces drift / tremor)


@dataclass(frozen=True)
class Pose:
    boom: float
    stick: float
    bucket: float


@dataclass(frozen=True)
class CycleGeometry:
    """Where the operator digs and dumps for one task type (angles in degrees)."""
    task_type: str
    dig_angle: float
    dump_angle: float
    dig_entry: Pose
    dig_end: Pose
    carry: Pose
    dump_end: Pose
    to_truck: bool


GEOMETRY: dict[str, CycleGeometry] = {
    "truck_loading": CycleGeometry("truck_loading", 0.0, 90.0, Pose(8, 140, -10), Pose(12, 75, 95),
                                   Pose(45, 95, 100), Pose(47, 125, -35), True),
    "trenching": CycleGeometry("trenching", 0.0, 75.0, Pose(-5, 150, -15), Pose(-2, 70, 95),
                               Pose(32, 90, 100), Pose(30, 120, -30), False),
    "stockpile": CycleGeometry("stockpile", 0.0, 45.0, Pose(10, 130, 0), Pose(14, 90, 80),
                               Pose(28, 95, 90), Pose(26, 115, -20), False),
}
TRAVEL_POSE = Pose(30, 60, 100)


class Intent:
    """Intended lever positions for one tick, plus ground-truth labels (phase, activity)."""
    __slots__ = ("swing", "boom", "stick", "bucket", "travel", "phase", "dig_load", "activity")

    def __init__(self, swing: float = 0.0, boom: float = 0.0, stick: float = 0.0, bucket: float = 0.0,
                 travel: float = 0.0, phase: str = "idle", dig_load: float = 0.0, activity: str = "work") -> None:
        self.swing, self.boom, self.stick, self.bucket = swing, boom, stick, bucket
        self.travel, self.phase, self.dig_load, self.activity = travel, phase, dig_load, activity


IDLE = Intent()


def smoothstep(u: float) -> float:
    u = clip(u, 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def _track(cur: float, tgt: float, max_rate: float, settle_s: float = 0.5, cap: float = 1.0) -> float:
    return clip((tgt - cur) / (max_rate * settle_s), -cap, cap)


class Rig:
    """Operator + machine. Holds per-cycle state (cycle index, fast-swing override, truck position)."""

    def __init__(self, kin: ExcavatorKinematics, profile: OperatorProfile, rng: np.random.Generator,
                 noise: Noise, material: str = "clay_gravel") -> None:
        self.kin = kin
        self.profile = profile
        self.rng = rng
        self.hand = Hand(noise, rng)
        self.params: OperatorParams = profile.params_at(0.0)
        self.dig_time_factor = MATERIALS.get(material, MATERIALS["clay_gravel"])[2]
        self.cycle = -1
        self.pending_fast: list[dict] = []        # queued fast-swing overrides: {"m", "id"}
        self.fast_label: dict | None = None       # active fast-swing override (for gt labels)
        self.truck: tuple[float, float] | None = None   # (angle_deg, centre distance m) of a positioned truck
        self._cycle_cap = 0.0                     # near-truck swing speed chosen for the current cycle

    def refresh(self, hours_on: float, skill: float | None = None) -> None:
        self.params = self.profile.params_at(hours_on, skill)

    def lognormal(self, mean: float, cv: float) -> float:
        sigma = math.sqrt(math.log(1 + cv * cv))
        return float(mean * math.exp(self.rng.normal(-0.5 * sigma * sigma, sigma)))

    def actuate(self, it: Intent) -> list[float]:
        """Shape the intent through the operator's hand and step the machine one tick."""
        joy = self.hand.shape((it.swing, it.boom, it.stick, it.bucket), self.params, it.phase in WORK_PHASES)
        self.kin.step(joy[0], joy[1], joy[2], joy[3], it.travel, it.dig_load)
        return joy

    # ------------------------------------------------------------ helpers
    def pose_cmd(self, pose: Pose, cap: float = 1.0, settle_s: float = 0.5) -> tuple[float, float, float]:
        s = self.kin.s
        return (_track(s.boom_angle_deg, pose.boom, BOOM_MAX_DPS, settle_s, cap),
                _track(s.stick_angle_deg, pose.stick, STICK_MAX_DPS, settle_s, cap),
                _track(s.bucket_angle_deg, pose.bucket, BUCKET_MAX_DPS, settle_s, cap))

    def at_pose(self, pose: Pose, tol: float = 4.0) -> bool:
        s = self.kin.s
        return (abs(s.boom_angle_deg - pose.boom) < tol and abs(s.stick_angle_deg - pose.stick) < tol * 1.5
                and abs(s.bucket_angle_deg - pose.bucket) < tol * 2)

    def hold_swing(self, target: float) -> float:
        rem = target - self.kin.s.swing_angle_deg
        return 0.0 if abs(rem) < 1.0 else clip(rem / 15.0, -0.25, 0.25)

    def follow(self, start: Pose, end: Pose, u_prev: float, u: float, shapes: tuple) -> tuple[float, float, float]:
        """Feed-forward + feedback commands to follow a pose trajectory between normalised times."""
        s = self.kin.s
        out = []
        for a, b, cur, rate, shape in ((start.boom, end.boom, s.boom_angle_deg, BOOM_MAX_DPS, shapes[0]),
                                       (start.stick, end.stick, s.stick_angle_deg, STICK_MAX_DPS, shapes[1]),
                                       (start.bucket, end.bucket, s.bucket_angle_deg, BUCKET_MAX_DPS, shapes[2])):
            tgt = a + (b - a) * shape(u)
            ff = (b - a) * (shape(u) - shape(u_prev)) / DT / rate
            out.append(clip(ff + (tgt - cur) / (rate * 0.4), -1.0, 1.0))
        return out[0], out[1], out[2]


def _current_pose(rig: Rig) -> Pose:
    s = rig.kin.s
    return Pose(s.boom_angle_deg, s.stick_angle_deg, s.bucket_angle_deg)


def _late(u: float) -> float:
    return smoothstep((u - 0.25) / 0.75)


def _mid(u: float) -> float:
    return smoothstep((u - 0.1) / 0.8)


# ---------------------------------------------------------------- phases
def dig(rig: Rig, geo: CycleGeometry, dig_angle: float) -> Iterator[Intent]:
    """Position (sequential operators do it here), then penetrate, fill and curl."""
    p, s = rig.params, rig.kin.s
    for _ in range(int(4.0 / DT)):
        if rig.at_pose(geo.dig_entry):
            break
        b, k, c = rig.pose_cmd(geo.dig_entry, cap=0.9)
        yield Intent(rig.hold_swing(dig_angle), b, k, c, phase="dig")
    n = max(20, int(rig.lognormal(p.dig_s * rig.dig_time_factor, p.dig_cv) / DT))
    fill = clip(float(rig.rng.normal(p.fill_mu, p.fill_sd)), 0.35, 1.05)
    start, payload0, cap_t = _current_pose(rig), s.payload_t, rig.kin.bucket_cap_t
    raise_from = 1.0 - 0.2 * p.overlap
    for i in range(n):
        u0, u = i / n, (i + 1) / n
        b, k, c = rig.follow(start, geo.dig_end, u0, u, (smoothstep, smoothstep, _late))
        if u > raise_from:                      # multi-function: start the boom raise inside the dig
            b = max(b, 0.8 * p.overlap)
        load = math.sin(math.pi * clip((u - 0.1) / 0.8, 0.0, 1.0)) ** 0.8 * (0.7 + 0.3 * fill)
        s.payload_t = payload0 + (fill * cap_t - payload0) * _mid(u)
        yield Intent(rig.hold_swing(dig_angle), b, k, c, phase="dig", dig_load=load)


def _b2t(pose: Pose, truck: tuple[float, float], swing: float) -> float:
    """Bucket-to-truck distance for a linkage pose at a given swing angle."""
    return bucket_to_body(tip_position(pose.boom, pose.stick, pose.bucket, swing), truck[0], truck[1])


def swing_to(rig: Rig, target: float, loaded: bool, geo: CycleGeometry) -> Iterator[Intent]:
    """Swing to `target`. Loaded swings raise the boom (boom-first for sequential operators).

    Speed law: constant-deceleration braking toward the target (brake_lead_deg), capped at the
    operator's near-truck speed while the bucket is within their perceived zone of a truck. A
    look-ahead on the current pose starts braking (zone_decel_dps2) so that speed is reached at the
    zone edge; leaving the truck, the cap holds until the bucket is out of the zone. Late braking (overshoot_p)
    drops the anticipation and gives overshoot plus a reverse correction. An injected fast swing
    raises the near-truck speed by ~m, shrinks the perceived zone and brakes late.
    """
    p, s, rng = rig.params, rig.kin.s, rig.rng
    phase = "swing_loaded" if loaded else "swing_empty"
    peak = p.swing_peak_frac
    lead = p.brake_lead_deg if loaded else 0.75 * p.brake_lead_deg
    truck = rig.truck if geo.to_truck else None
    zone_m, zone_decel = p.zone_m, p.zone_decel_dps2
    zone_lag = SWING_TAU_S + p.cmd_tau_s            # near-truck braking anticipates machine + lever lag
    if loaded:
        rig._cycle_cap = clip(float(rng.normal(p.near_truck_dps, p.near_truck_sd)),
                              p.near_truck_dps - 2.5 * p.near_truck_sd, p.near_truck_dps + 2.5 * p.near_truck_sd)
    cap = rig._cycle_cap * (1.0 if loaded else 0.95)
    late = rng.random() < (p.overshoot_p if loaded else 0.5 * p.overshoot_p)
    if loaded and truck is not None and rig.pending_fast:
        rig.fast_label = rig.pending_fast.pop(0)
        m = float(rig.fast_label.get("m", 1.5))
        lead, peak = lead / (m * m), min(FAST_SWING_MAX_DPS / SWING_MAX_DPS, peak * math.sqrt(m))
        cap = clip(max(m * cap, 30.0 * m), 46.0, FAST_SWING_MAX_DPS)
        zone_m, zone_decel, late, zone_lag = 1.0, SWING_PLUG_DPS2, True, 0.0
    if late:
        lead *= 0.3
    hes_at = float(rng.uniform(0.25, 0.7)) if rng.random() < p.hesitation_p and rig.fast_label is None else None
    pose = geo.carry if loaded else geo.dig_entry
    if loaded:
        b0 = s.boom_angle_deg
        for _ in range(int(5.0 / DT)):
            if (s.boom_angle_deg - b0) >= (1.0 - p.overlap) * max(1.0, pose.boom - b0):
                break
            b, k, c = rig.pose_cmd(pose)
            yield Intent(0.0, max(b, 0.8), 0.5 * k, c, phase=phase)
    total = abs(target - s.swing_angle_deg) or 1.0
    v_peak = peak * SWING_MAX_DPS
    decel = v_peak * v_peak / (2.0 * lead)             # operator's braking deceleration for the stop
    anticip = 0.0 if late else SWING_TAU_S + p.cmd_tau_s  # skilled braking anticipates machine + lever lag
    hes_ticks = 0
    pose_gain = 1.0 if loaded else p.overlap
    for _ in range(int(15.0 / DT)):
        rem = target - s.swing_angle_deg
        if abs(rem) < 1.5 and abs(s.swing_dps) < 3.0:
            break
        w = abs(s.swing_dps)
        rem_eff = rem - s.swing_dps * anticip
        v_des = min(v_peak, math.sqrt(2.0 * decel * abs(rem_eff)), 2.5 * abs(rem_eff) + 4.0)
        near = False
        if truck is not None:
            near = _b2t(_current_pose(rig), truck, s.swing_angle_deg) < zone_m
            if near:
                v_des = min(v_des, cap)
            elif loaded:
                ahead = max(0.0, w * w - cap * cap) / (2.0 * zone_decel) + w * zone_lag + 2.0
                if _b2t(pose, truck, s.swing_angle_deg + math.copysign(ahead, s.swing_dps)) < zone_m:
                    v_des = min(v_des, max(cap, w - zone_decel * (DT + zone_lag)))
        r_des = math.copysign(v_des, rem_eff)
        u = clip((r_des + SWING_FEEDBACK * (r_des - s.swing_dps)) / SWING_MAX_DPS, -peak, peak)
        if hes_at is not None and 1.0 - abs(rem) / total >= hes_at:
            hes_ticks, hes_at = int(rng.integers(3, 7)), None
        if hes_ticks:
            u *= 0.25
            hes_ticks -= 1
        b, k, c = rig.pose_cmd(pose)
        if near and not loaded:
            b = max(b, 0.0)                         # keep the bucket high until clear of the body
        yield Intent(u, b * pose_gain, k * pose_gain, c * pose_gain, phase=phase)


def dump(rig: Rig, geo: CycleGeometry, dump_angle: float) -> Iterator[Intent]:
    """Stick out and open the bucket over the dump point; payload leaves the bucket."""
    p, s = rig.params, rig.kin.s
    n = max(10, int(rig.lognormal(p.dump_s, p.dump_cv) / DT))
    start, payload0 = _current_pose(rig), s.payload_t
    for i in range(n):
        u0, u = i / n, (i + 1) / n
        b, k, c = rig.follow(start, geo.dump_end, u0, u, (smoothstep, smoothstep, smoothstep))
        s.payload_t = payload0 * (1.0 - smoothstep((u - 0.2) / 0.6))
        yield Intent(rig.hold_swing(dump_angle), b, k, c, phase="dump")
    s.payload_t = 0.0


def gap(rig: Rig) -> Iterator[Intent]:
    """Idle hesitation between phases (levers released)."""
    for _ in range(int(float(rig.rng.exponential(rig.params.gap_s)) / DT)):
        yield IDLE


def work_cycle(rig: Rig, geo: CycleGeometry, dump_angle: float, dig_angle: float | None = None) -> Iterator[Intent]:
    """One full cycle. Increments rig.cycle at the start of the dig."""
    dig_angle = geo.dig_angle if dig_angle is None else dig_angle
    rig.cycle += 1
    yield from dig(rig, geo, dig_angle)
    yield from gap(rig)
    yield from swing_to(rig, dump_angle, True, geo)
    yield from gap(rig)
    yield from dump(rig, geo, dump_angle)
    rig.fast_label = None
    yield from gap(rig)
    yield from swing_to(rig, dig_angle, False, geo)
    yield from gap(rig)
