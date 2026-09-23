"""Operator archetypes as parameter sets, plus the joystick "hand" model. SIMULATED.

Parameter values are [HYPOTHESIS] (09-dataset §4.3), tuned so archetypes differ measurably in
phase durations, swing peak and swing speed near the truck, joystick jerk and reversals,
boom–swing overlap, idle gaps, bucket fill and swing overshoot at the dump point.

- expert: smooth, overlapping multi-function control, consistent timing, slows the swing near
  the truck, zero safety violations.
- intermediate: in between.
- novice: jerky, frequent reversals, sequential control, fast swing near the truck, long and
  variable cycles, occasional seatbelt lapses (only when low-probability events are enabled).
- novice_improving: novice at skill 0, blending linearly toward intermediate at skill 1.
- late_shift_degradation: intermediate that becomes more variable after 5 h of operation.

Each operator instance gets a seeded ±15 % jitter on every parameter (seed = crc32(operator_id)).
"""
from __future__ import annotations

import math
import zlib
from dataclasses import asdict, dataclass, fields, replace

import numpy as np

from sentinel.sim.kinematics import DT, Noise, clip

ARCHETYPES = ("expert", "intermediate", "novice", "novice_improving", "late_shift_degradation")
JITTER = 0.15
JITTER_OVERRIDES = {"zone_m": 0.05}   # the perceived near-truck zone is a trained habit, kept tight
LATE_SHIFT_ONSET_H = 5.0


@dataclass(frozen=True)
class OperatorParams:
    """Control-style parameters of one operator (all [HYPOTHESIS])."""
    dig_s: float              # mean dig duration
    dig_cv: float             # dig duration coefficient of variation
    dump_s: float
    dump_cv: float
    swing_peak_frac: float    # peak swing command in open air (fraction of max swing speed)
    brake_lead_deg: float     # how far before the target the swing starts to slow
    near_truck_dps: float     # swing speed the operator allows with the bucket near the truck
    near_truck_sd: float      # cycle-to-cycle spread of that speed
    zone_m: float             # bucket-to-truck distance at which the operator starts treating the truck as near
    zone_decel_dps2: float    # deceleration used to get down to near_truck_dps before the zone
    overshoot_p: float        # probability of a late brake (overshoot + correction) per loaded swing
    hesitation_p: float       # probability of a mid-swing hesitation
    overlap: float            # share of boom raise / lower done during the swing (multi-function)
    reversal_pm: float        # harsh joystick reversals per minute of work
    cmd_tau_s: float          # joystick smoothing time constant (low = jerky)
    tremor: float             # joystick noise std on active axes
    gap_s: float              # mean idle gap between phases
    fill_mu: float            # mean bucket fill fraction
    fill_sd: float
    react_s: float            # reaction delay once a truck is in position
    belt_off_p: float         # seatbelt-lapse probability per shift (low-probability events only)
    idle_high_rpm_p: float    # probability that an idle is spent at working rpm (auto-idle off)
    hyd_lock_wait_p: float    # probability of engaging hydraulic lockout while waiting


BASE: dict[str, OperatorParams] = {
    "expert": OperatorParams(
        dig_s=7.6, dig_cv=0.06, dump_s=2.8, dump_cv=0.07, swing_peak_frac=0.78, brake_lead_deg=46.0,
        near_truck_dps=17.0, near_truck_sd=1.5, zone_m=5.45, zone_decel_dps2=105.0,
        overshoot_p=0.01, hesitation_p=0.0, overlap=0.78, reversal_pm=0.03, cmd_tau_s=0.2, tremor=0.008,
        gap_s=0.05, fill_mu=0.95, fill_sd=0.025, react_s=3.0, belt_off_p=0.0, idle_high_rpm_p=0.02,
        hyd_lock_wait_p=0.9),
    "intermediate": OperatorParams(
        dig_s=8.6, dig_cv=0.13, dump_s=3.4, dump_cv=0.15, swing_peak_frac=0.82, brake_lead_deg=33.0,
        near_truck_dps=25.0, near_truck_sd=3.5, zone_m=5.35, zone_decel_dps2=90.0,
        overshoot_p=0.08, hesitation_p=0.12, overlap=0.45, reversal_pm=0.6, cmd_tau_s=0.2, tremor=0.03,
        gap_s=0.45, fill_mu=0.88, fill_sd=0.06, react_s=5.0, belt_off_p=0.05, idle_high_rpm_p=0.15,
        hyd_lock_wait_p=0.5),
    "novice": OperatorParams(
        dig_s=10.5, dig_cv=0.25, dump_s=4.4, dump_cv=0.25, swing_peak_frac=0.86, brake_lead_deg=23.0,
        near_truck_dps=33.0, near_truck_sd=9.0, zone_m=4.6, zone_decel_dps2=100.0,
        overshoot_p=0.3, hesitation_p=0.4, overlap=0.12, reversal_pm=2.2, cmd_tau_s=0.08, tremor=0.06,
        gap_s=1.2, fill_mu=0.78, fill_sd=0.12, react_s=8.0, belt_off_p=0.3, idle_high_rpm_p=0.4,
        hyd_lock_wait_p=0.15),
}

# clamps applied after blending and jitter
_BOUNDS: dict[str, tuple[float, float]] = {
    "swing_peak_frac": (0.5, 0.97), "overlap": (0.0, 0.95), "overshoot_p": (0.0, 0.6),
    "hesitation_p": (0.0, 0.8), "belt_off_p": (0.0, 1.0), "idle_high_rpm_p": (0.0, 1.0),
    "hyd_lock_wait_p": (0.0, 1.0), "fill_mu": (0.4, 1.0), "cmd_tau_s": (0.05, 0.6),
    "brake_lead_deg": (6.0, 60.0), "near_truck_dps": (8.0, 60.0), "zone_m": (2.0, 8.0),
    "zone_decel_dps2": (20.0, 140.0),
}


def _blend(a: OperatorParams, b: OperatorParams, w: float) -> OperatorParams:
    da, db = asdict(a), asdict(b)
    return OperatorParams(**{k: da[k] + w * (db[k] - da[k]) for k in da})


def _clamped(p: OperatorParams) -> OperatorParams:
    d = asdict(p)
    for k, (lo, hi) in _BOUNDS.items():
        d[k] = clip(d[k], lo, hi)
    return OperatorParams(**d)


def jitter_factors(operator_id: str) -> dict[str, float]:
    """Seeded ±15 % multiplicative jitter per parameter (±5 % on zone_m); stable per operator id."""
    rng = np.random.default_rng(zlib.crc32(operator_id.encode()))
    out = {}
    for f in fields(OperatorParams):
        j = JITTER_OVERRIDES.get(f.name, JITTER)
        out[f.name] = float(rng.uniform(1 - j, 1 + j))
    return out


@dataclass(frozen=True)
class OperatorProfile:
    """An operator instance: archetype + skill + per-instance jitter."""
    operator_id: str
    archetype: str
    skill: float = 0.0
    jitter: dict[str, float] | None = None
    overrides: dict[str, float] | None = None     # absolute values applied after jitter (scenario habits)

    def params_at(self, hours_on: float = 0.0, skill: float | None = None) -> OperatorParams:
        """Effective parameters after `hours_on` hours of operation this shift."""
        s = clip(self.skill if skill is None else skill, 0.0, 1.0)
        if self.archetype == "novice_improving":
            p = _blend(BASE["novice"], BASE["intermediate"], s)
        elif self.archetype == "late_shift_degradation":
            p = BASE["intermediate"]
        else:
            p = BASE[self.archetype]
        if self.jitter:
            d = asdict(p)
            p = OperatorParams(**{k: v * self.jitter.get(k, 1.0) for k, v in d.items()})
        if self.overrides:
            p = replace(p, **self.overrides)
        if self.archetype == "late_shift_degradation" and hours_on > LATE_SHIFT_ONSET_H:
            p = degrade(p, hours_on - LATE_SHIFT_ONSET_H)
        return _clamped(p)


def degrade(p: OperatorParams, d_h: float) -> OperatorParams:
    """Late-shift degradation d_h hours past onset: more variable, later braking, more reversals.
    Behavioural drift only — NOT a fatigue model."""
    return replace(
        p,
        dig_s=p.dig_s * (1 + 0.04 * d_h), dig_cv=p.dig_cv * (1 + 0.35 * d_h), dump_cv=p.dump_cv * (1 + 0.35 * d_h),
        brake_lead_deg=p.brake_lead_deg * max(0.6, 1 - 0.08 * d_h),
        near_truck_dps=p.near_truck_dps * (1 + 0.06 * d_h), zone_m=p.zone_m * max(0.7, 1 - 0.05 * d_h),
        overshoot_p=min(0.5, p.overshoot_p * (1 + 0.4 * d_h)), hesitation_p=min(0.6, p.hesitation_p * (1 + 0.3 * d_h)),
        reversal_pm=p.reversal_pm * (1 + 0.3 * d_h), tremor=p.tremor * (1 + 0.3 * d_h), gap_s=p.gap_s * (1 + 0.3 * d_h),
    )


def make_operator(archetype: str, operator_id: str, skill: float = 0.0, jitter: bool = True,
                  overrides: dict[str, float] | None = None) -> OperatorProfile:
    """Build an operator instance. archetype ∈ ARCHETYPES; overrides pin named OperatorParams fields."""
    if archetype not in ARCHETYPES:
        raise ValueError(f"unknown archetype {archetype!r}; expected one of {ARCHETYPES}")
    unknown = set(overrides or {}) - {f.name for f in fields(OperatorParams)}
    if unknown:
        raise ValueError(f"unknown operator override(s) {sorted(unknown)}")
    return OperatorProfile(operator_id, archetype, skill, jitter_factors(operator_id) if jitter else None,
                           dict(overrides) if overrides else None)


class Hand:
    """Turns intended lever positions into joystick commands with the operator's style:
    smoothing (cmd_tau_s), tremor on active axes, random harsh reversals and injected bursts."""

    def __init__(self, noise: Noise, rng: np.random.Generator) -> None:
        self.noise = noise
        self.rng = rng
        self.out = [0.0, 0.0, 0.0, 0.0]            # smoothed lever positions (swing, boom, stick, bucket)
        self._trem = [0.0, 0.0, 0.0, 0.0]
        self._pulse_axis = -1
        self._pulse_ticks = 0
        self._pulse_amp = 0.0
        self.burst: tuple[float, float] | None = None   # (amplitude, freq_hz) square-wave overlay (U2)
        self._t = 0.0

    def shape(self, target: tuple[float, float, float, float], p: OperatorParams, working: bool) -> list[float]:
        """One tick: returns [joy_swing, joy_boom, joy_stick, joy_bucket] in -1..1."""
        self._t += DT
        a = DT / (p.cmd_tau_s + DT)
        n = self.noise
        if working and self._pulse_ticks == 0 and self.rng.random() < p.reversal_pm / 60.0 * DT:
            self._pulse_axis = int(self.rng.integers(0, 3))            # swing, boom or stick
            self._pulse_ticks = 4                                       # 0.2 s one way, 0.2 s the other
            self._pulse_amp = float(self.rng.uniform(0.7, 0.95)) * (1 if self.rng.random() < 0.5 else -1)
        burst = self.burst if working else None
        emit = [0.0, 0.0, 0.0, 0.0]
        for i in range(4):
            tgt = target[i]
            pulsing = self._pulse_ticks > 0 and i == self._pulse_axis
            if pulsing:
                tgt = self._pulse_amp if self._pulse_ticks > 2 else -self._pulse_amp
            if burst is not None and i in (0, 2):
                tgt += burst[0] * (1.0 if math.sin(2 * math.pi * burst[1] * self._t) >= 0 else -1.0)
            v = tgt if pulsing else self.out[i] + (tgt - self.out[i]) * a
            self.out[i] = v
            if abs(tgt) > 0.05 or abs(v) > 0.05:            # AR(1) tremor, std ≈ p.tremor, clipped at 2.5σ
                self._trem[i] = clip(0.6 * self._trem[i] + 0.8 * p.tremor * n.n(), -2.5 * p.tremor, 2.5 * p.tremor)
            else:
                self._trem[i] = 0.0
            c = clip(v + self._trem[i], -1.0, 1.0)
            emit[i] = 0.0 if abs(c) < 0.02 else c
        if self._pulse_ticks:
            self._pulse_ticks -= 1
        return emit
