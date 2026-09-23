"""Physics-lite 10 Hz excavator model (EX-20t, 320-class). SIMULATED — not Caterpillar data.

Joystick commands (-1..1) drive first-order-lag joint responses with rate and acceleration
limits. Hydraulic pressure, engine speed, fuel rate and temperatures are derived from the
commands, the load in the bucket and the digging resistance. All constants are
[HYPOTHESIS] magnitudes for a 20 t class excavator, chosen to look plausible, not spec values.

Sign conventions: a positive command drives its joint angle up — boom up, stick out
(opens the boom–stick angle), bucket curl, swing toward +angle (the truck / dump side).
Swing angle 0 is the dig face.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

HZ = 10
DT = 1.0 / HZ

SWING_MAX_DPS = 67.5            # ~11 rpm swing speed [HYPOTHESIS]
SWING_ACCEL_DPS2 = 90.0         # command-driven acceleration limit (loaded: -20 %)
SWING_BRAKE_DPS2 = 100.0        # deceleration with the lever released (swing brake valve)
SWING_PLUG_DPS2 = 140.0         # deceleration with a counter-command ("plugging")
SWING_TAU_S = 0.2
JOINT_TAU_S = 0.12
BOOM_MAX_DPS = 22.0
STICK_MAX_DPS = 32.0
BUCKET_MAX_DPS = 60.0
JOINT_LIMITS = {"boom": (-15.0, 65.0), "stick": (35.0, 158.0), "bucket": (-45.0, 112.0)}

L_BOOM, L_STICK, L_BUCKET = 5.7, 2.9, 1.5       # m
BOOM_PIVOT_X, BOOM_PIVOT_Z = 0.1, 2.0            # m, machine frame
TAIL_RADIUS_M = 2.8                              # house tail-swing radius

TRAVEL_MAX_KMH = {0: 0.0, 1: 3.4, 2: 5.6}        # gear: 0 park, 1 low (tortoise), 2 high (rabbit)
RPM_WORK = 1700.0
RPM_AUTO_IDLE = 1050.0
RPM_LOW_IDLE = 900.0
AUTO_IDLE_DELAY_S = 4.0
SWING_BRAKE_DELAY_S = 5.0

STANDBY_BAR = 32.0
RELIEF_BAR = 343.0
PILOT_BAR = 38.0
PRESSURE_LAG = 0.6                # per-tick blend toward the pressure target
BUCKET_CAPACITY_M3 = 1.1

# material: (density t/m3, dig resistance, dig-time factor)
MATERIALS: dict[str, tuple[float, float, float]] = {
    "sand": (1.6, 0.8, 0.9),
    "clay_gravel": (1.9, 1.0, 1.0),
    "clay": (1.8, 1.05, 1.0),
    "blasted_rock": (2.0, 1.3, 1.3),
}

TRUCK_BODY_RADIUS_M = 1.6
TRUCK_RIM_Z_M = 3.3
TRUCK_HALF_WIDTH_M = 1.3


def clip(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def tip_position(boom: float, stick: float, bucket: float, swing: float) -> tuple[float, float, float]:
    """Bucket tip (x, y, z) in the machine frame (m) for joint angles in degrees."""
    a1 = math.radians(boom)
    a2 = a1 - math.radians(180.0 - stick)
    a3 = a2 + math.radians(bucket - 60.0)
    r = BOOM_PIVOT_X + L_BOOM * math.cos(a1) + L_STICK * math.cos(a2) + L_BUCKET * math.cos(a3)
    z = BOOM_PIVOT_Z + L_BOOM * math.sin(a1) + L_STICK * math.sin(a2) + L_BUCKET * math.sin(a3)
    th = math.radians(swing)
    return r * math.cos(th), r * math.sin(th), z


def bucket_to_body(tip: tuple[float, float, float], truck_angle_deg: float, truck_dist_m: float) -> float:
    """Distance (m) from the bucket tip to a truck body centred at (dist, angle), rim at TRUCK_RIM_Z_M."""
    th = math.radians(truck_angle_deg)
    dx = tip[0] - truck_dist_m * math.cos(th)
    dy = tip[1] - truck_dist_m * math.sin(th)
    h = math.hypot(dx, dy) - TRUCK_BODY_RADIUS_M
    v = tip[2] - TRUCK_RIM_Z_M
    if h > 0:
        return math.hypot(h, v) if v > 0 else h
    return v if v > 0 else 0.0


class Noise:
    """Buffered standard-normal source (fast scalar draws from a seeded Generator)."""

    def __init__(self, rng: np.random.Generator, block: int = 8192) -> None:
        self._rng = rng
        self._block = block
        self._buf: list[float] = []
        self._i = 0

    def n(self) -> float:
        if self._i >= len(self._buf):
            self._buf = self._rng.standard_normal(self._block).tolist()
            self._i = 0
        v = self._buf[self._i]
        self._i += 1
        return v


@dataclass(slots=True)
class MachineState:
    """Instantaneous machine state. Angles in degrees, rates in deg/s."""
    swing_angle_deg: float = 0.0
    swing_dps: float = 0.0
    boom_angle_deg: float = 30.0
    stick_angle_deg: float = 60.0
    bucket_angle_deg: float = 100.0
    boom_rate: float = 0.0
    stick_rate: float = 0.0
    bucket_rate: float = 0.0
    travel_kmh: float = 0.0
    gear: int = 0
    park_brake: bool = True
    service_brake: bool = False
    swing_brake: bool = True
    hyd_lockout: bool = True
    engine_on: bool = False
    rpm: float = 0.0
    throttle_pct: float = 0.0
    fuel_rate_lph: float = 0.0
    hyd_pressure_bar: float = 0.0
    hyd_pilot_bar: float = 0.0
    payload_t: float = 0.0
    coolant_c: float = 40.0
    hyd_oil_temp_c: float = 35.0
    load_ema: float = 0.0          # slow average of hydraulic load fraction (temperatures)
    input_idle_s: float = 0.0      # time since any joystick / travel input
    swing_idle_s: float = 0.0
    end_stop: bool = False         # a cylinder is at its end stop while commanded (pressure to relief)
    smu_h: float = 0.0             # cumulative engine hours
    idle_h: float = 0.0            # cumulative engine-on, no-input hours (telematics idle)
    fuel_l: float = 0.0            # cumulative fuel


class ExcavatorKinematics:
    """Steps a MachineState at 10 Hz from joystick commands."""

    def __init__(self, noise: Noise, material: str = "clay_gravel", ambient_c: float = 31.0,
                 smu_h: float = 0.0, fuel_l: float = 0.0) -> None:
        self.s = MachineState(smu_h=smu_h, fuel_l=fuel_l, coolant_c=ambient_c + 8, hyd_oil_temp_c=ambient_c + 4)
        self.noise = noise
        self.ambient_c = ambient_c
        self.dial_rpm = RPM_WORK
        self.auto_idle = True
        self.response_gain = 1.0       # machine-side hydraulic health (faults lower it; never the commands)
        self.travel_boost = 1.0        # >1 only for injected over-speed (downhill / high range)
        self.set_material(material)

    # ------------------------------------------------------------ operator-side switches
    def set_material(self, material: str) -> None:
        density, resist, _ = MATERIALS.get(material, MATERIALS["clay_gravel"])
        self.bucket_cap_t = BUCKET_CAPACITY_M3 * density
        self.dig_resist = resist

    def start_engine(self) -> None:
        self.s.engine_on = True
        self.dial_rpm = RPM_LOW_IDLE

    def stop_engine(self) -> None:
        self.s.engine_on = False
        self.s.hyd_lockout = True

    # ------------------------------------------------------------ geometry
    def bucket_tip(self) -> tuple[float, float, float]:
        """Bucket tip (x, y, z) in the machine frame (m); z relative to track ground."""
        s = self.s
        return tip_position(s.boom_angle_deg, s.stick_angle_deg, s.bucket_angle_deg, s.swing_angle_deg)

    def bucket_to_truck(self, truck_angle_deg: float, truck_dist_m: float) -> float:
        """Current bucket-tip distance to a truck body (m)."""
        return bucket_to_body(self.bucket_tip(), truck_angle_deg, truck_dist_m)

    # ------------------------------------------------------------ dynamics
    def _flow(self) -> float:
        s = self.s
        if not s.engine_on or s.hyd_lockout:
            return 0.0
        return clip((s.rpm - 700.0) / 900.0, 0.35, 1.0) * self.response_gain

    def _joint(self, angle: float, rate: float, cmd: float, max_rate: float, flow: float,
               limits: tuple[float, float], load_factor: float = 1.0) -> tuple[float, float, bool]:
        target = cmd * max_rate * flow * load_factor
        rate += (target - rate) * (DT / (JOINT_TAU_S + DT))
        angle += rate * DT
        stop = False
        if angle <= limits[0]:
            angle, stop = limits[0], cmd < -0.05
            rate = max(rate, 0.0)
        elif angle >= limits[1]:
            angle, stop = limits[1], cmd > 0.05
            rate = min(rate, 0.0)
        return angle, rate, stop

    def step(self, js: float, jb: float, jk: float, jc: float, tc: float = 0.0, dig_load: float = 0.0) -> None:
        """Advance one tick. js/jb/jk/jc = swing/boom/stick/bucket commands, tc = travel command,
        dig_load = 0..1 digging resistance from the bucket-in-ground phase."""
        s, n = self.s, self.noise
        flow = self._flow()
        payload_frac = s.payload_t / self.bucket_cap_t if self.bucket_cap_t else 0.0

        # swing
        w = s.swing_dps
        w_cmd = js * SWING_MAX_DPS * flow
        dw = w_cmd - w
        if w * dw < 0:
            lim = SWING_PLUG_DPS2 if js * w < 0 else SWING_BRAKE_DPS2
        else:
            lim = SWING_ACCEL_DPS2 * (1.0 - 0.2 * payload_frac)
        dw_step = clip(dw * DT / SWING_TAU_S, -lim * DT, lim * DT)
        w_new = w + dw_step
        if abs(js) < 0.02 and abs(w_new) < 0.4:
            w_new = 0.0
        if s.swing_brake and abs(js) < 0.02:
            w_new = 0.0
        s.swing_dps = w_new
        s.swing_angle_deg += w_new * DT
        s.swing_idle_s = s.swing_idle_s + DT if (abs(js) < 0.02 and w_new == 0.0) else 0.0
        s.swing_brake = s.hyd_lockout or s.swing_idle_s > SWING_BRAKE_DELAY_S

        # front linkage
        lift_factor = 1.0 - 0.25 * payload_frac if jb > 0 else 1.0
        s.boom_angle_deg, s.boom_rate, st1 = self._joint(s.boom_angle_deg, s.boom_rate, jb, BOOM_MAX_DPS, flow,
                                                          JOINT_LIMITS["boom"], lift_factor)
        s.stick_angle_deg, s.stick_rate, st2 = self._joint(s.stick_angle_deg, s.stick_rate, jk, STICK_MAX_DPS,
                                                            flow, JOINT_LIMITS["stick"], 1.0 - 0.3 * dig_load)
        s.bucket_angle_deg, s.bucket_rate, st3 = self._joint(s.bucket_angle_deg, s.bucket_rate, jc, BUCKET_MAX_DPS,
                                                              flow, JOINT_LIMITS["bucket"], 1.0 - 0.3 * dig_load)
        s.end_stop = (st1 or st2 or st3) and flow > 0

        # travel
        if s.gear == 0 or flow == 0.0:
            v_target = 0.0
        else:
            v_target = abs(tc) * TRAVEL_MAX_KMH[s.gear] * self.travel_boost * min(1.0, flow / 0.85)
        s.travel_kmh += (v_target - s.travel_kmh) * (DT / 0.8)
        if s.travel_kmh < 0.02:
            s.travel_kmh = 0.0
        s.service_brake = s.travel_kmh > 0.15 and abs(tc) < 0.05
        s.park_brake = s.travel_kmh < 0.05 and abs(tc) < 0.05

        # hydraulics
        active = abs(js) > 0.05 or abs(jb) > 0.05 or abs(jk) > 0.05 or abs(jc) > 0.05 or abs(tc) > 0.05
        s.input_idle_s = 0.0 if active else s.input_idle_s + DT
        if not s.engine_on:
            p_target = 0.0
        elif flow == 0.0:
            p_target = STANDBY_BAR * 0.6
        else:
            p_target = (STANDBY_BAR + 60 * abs(jb) + 50 * abs(jk) + 45 * abs(jc) + 40 * abs(js) + 70 * abs(tc)
                        + s.payload_t * (28.0 if jb > 0.05 else 8.0)
                        + abs(dw_step) / DT * 0.5
                        + dig_load * 230.0 * self.dig_resist
                        + (180.0 if s.end_stop else 0.0))
        p = s.hyd_pressure_bar + (min(RELIEF_BAR, p_target) - s.hyd_pressure_bar) * PRESSURE_LAG
        s.hyd_pressure_bar = max(0.0, p + (3.0 * n.n() if s.engine_on else 0.0))
        s.hyd_pilot_bar = (PILOT_BAR + 0.3 * n.n()) if (s.engine_on and not s.hyd_lockout) else 0.0

        # engine
        if s.engine_on:
            auto = self.auto_idle and s.input_idle_s > AUTO_IDLE_DELAY_S
            rpm_target = RPM_AUTO_IDLE if auto and self.dial_rpm > RPM_AUTO_IDLE else self.dial_rpm
            rpm_target -= 0.35 * max(0.0, s.hyd_pressure_bar - 220.0)
            s.rpm += (rpm_target - s.rpm) * (DT / 0.5) + 4.0 * n.n()
            s.throttle_pct = 25.0 if (auto and self.dial_rpm > RPM_AUTO_IDLE) else clip((self.dial_rpm - 800) / 10.0, 0, 100)
            load_frac = clip((s.hyd_pressure_bar - STANDBY_BAR) / (RELIEF_BAR - STANDBY_BAR), 0.0, 1.0)
            s.fuel_rate_lph = max(0.0, 2.6 + 3.2 * max(0.0, s.rpm - RPM_LOW_IDLE) / 800.0
                                  + 15.0 * load_frac * s.rpm / RPM_WORK + 6.0 * abs(tc) + 0.15 * n.n())
            s.load_ema += (load_frac - s.load_ema) * (DT / 300.0)
            s.coolant_c += (88.0 + 3.0 * s.load_ema - s.coolant_c) * (DT / 700.0)
            s.hyd_oil_temp_c += (50.0 + 16.0 * s.load_ema + 0.25 * (self.ambient_c - 25) - s.hyd_oil_temp_c) * (DT / 1500.0)
            s.smu_h += DT / 3600.0
            s.fuel_l += s.fuel_rate_lph * DT / 3600.0
            if not active and s.travel_kmh == 0.0:
                s.idle_h += DT / 3600.0
        else:
            s.rpm += (0.0 - s.rpm) * (DT / 0.6)
            if s.rpm < 5:
                s.rpm = 0.0
            s.throttle_pct = 0.0
            s.fuel_rate_lph = 0.0
            s.coolant_c += (self.ambient_c - s.coolant_c) * (DT / 2400.0)
            s.hyd_oil_temp_c += (self.ambient_c - s.hyd_oil_temp_c) * (DT / 3000.0)
