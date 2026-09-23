"""Built-in SIMULATED practice-session generator (fallback when sentinel.sim is unavailable).

Mirrors the contract of ``sentinel.sim.practice.generate_practice_session`` closely enough to
unit-test the analyser and to calibrate the cohort simulation. Skill ``s`` in 0..1 drives every
habit: experts (s~0.95) blend boom and swing, brake the swing early before the truck and dig in
one smooth pass; novices (s~0.1) swing fast into the truck, overshoot and correct, dig with
stop-start stick corrections and pause between phases. All output is SIMULATED.
"""
from __future__ import annotations

import zlib

import numpy as np

from sentinel.shared.schemas import PracticeSample

DT = 0.1
TRUCK_DEG = 90.0
SKILL = {"expert": 0.95, "intermediate": 0.65, "novice": 0.1}


def _lerp(novice: float, expert: float, s: float) -> float:
    return novice + (expert - novice) * s


def _bump(tau: np.ndarray, a: float, b: float) -> np.ndarray:
    """Half-sine bump on [a, b] of normalised phase time, zero elsewhere."""
    inside = (tau >= a) & (tau <= b)
    return np.where(inside, np.sin(np.pi * np.clip((tau - a) / max(b - a, 1e-6), 0, 1)), 0.0)


def _swing_velocity(n: int, delta: float, s: float, overshoot: float, t_corr: int) -> np.ndarray:
    """Signed swing speed (deg/s) covering ``delta`` + overshoot, then a corrective swing back.

    Experts brake early and creep the last part of the way to the truck; novices hold the lever
    and stop hard at the end. The approach habit is learnt early (skill ** 0.5).
    """
    a = s ** 0.5
    u = np.linspace(0, 1, n - t_corr)
    sig = lambda x: 1 / (1 + np.exp(-x))  # noqa: E731
    creep = _lerp(0.0, 0.35, a)
    shape = sig((u - _lerp(0.06, 0.10, a)) / _lerp(0.02, 0.05, a)) * (
        (1 - creep) * sig((_lerp(0.92, 0.40, a) - u) / _lerp(0.015, 0.08, a)) + creep * sig((0.95 - u) / 0.025))
    v = np.sign(delta) * (abs(delta) + overshoot) * shape / shape.sum() / DT
    if t_corr:
        back = np.sin(np.pi * np.linspace(0, 1, t_corr))
        v = np.concatenate([v, -np.sign(delta) * overshoot * back / back.sum() / DT])
    return v


class _Machine:
    """Integrates lever commands into kinematic channels and records labelled samples."""

    def __init__(self, rng: np.random.Generator, t0: float, archetype: str) -> None:
        self.rng, self.t, self.archetype = rng, t0, archetype
        self.swing, self.boom, self.stick, self.bucket, self.payload = 0.0, 35.0, 60.0, 40.0, 0.0
        self.samples: list[PracticeSample] = []

    def emit(self, phase: str, cycle: int, joy: dict[str, np.ndarray], swing_v: np.ndarray,
             payload: np.ndarray, pressure: np.ndarray) -> None:
        rng = self.rng
        for i in range(len(swing_v)):
            j = {k: float(np.clip(v[i] + rng.normal(0, 0.015), -1, 1)) for k, v in joy.items()}
            self.swing += swing_v[i] * DT
            self.boom += j["joy_boom"] * 25 * DT
            self.stick += j["joy_stick"] * 30 * DT
            self.bucket += j["joy_bucket"] * 40 * DT
            self.payload = float(payload[i])
            truck_m = 0.4 + 12.0 * np.radians(abs(TRUCK_DEG - self.swing))
            self.samples.append(PracticeSample(
                ts=round(self.t, 3), swing_dps=float(swing_v[i] + rng.normal(0, 0.3)),
                swing_angle_deg=self.swing, boom_angle_deg=self.boom, stick_angle_deg=self.stick,
                bucket_angle_deg=self.bucket, hyd_pressure_bar=float(pressure[i] + rng.normal(0, 5)),
                payload_t=max(0.0, self.payload + rng.normal(0, 0.01)), bucket_to_truck_m=float(truck_m),
                gt={"phase": phase, "cycle": cycle, "archetype": self.archetype}, **j))
            self.t += DT

    def idle(self, seconds: float, cycle: int) -> None:
        n = int(round(seconds / DT))
        if n:
            zeros = np.zeros(n)
            self.emit("idle", cycle, {k: zeros for k in ("joy_swing", "joy_boom", "joy_stick", "joy_bucket")},
                      zeros, np.full(n, self.payload), np.full(n, 40.0))


def _cycle(m: _Machine, k: int, s: float, tempo: float, fill_bias: float) -> None:
    rng = m.rng
    jit = lambda: rng.uniform(0.93, 1.07)  # noqa: E731
    gap = lambda: _lerp(1.4, 0.05, s) * rng.uniform(0.5, 1.5)  # noqa: E731
    fill = _lerp(1.05, 1.6, s) + fill_bias + rng.normal(0, 0.04)
    overshoot = _lerp(20.0, 1.0, s) * rng.uniform(0.7, 1.3)

    n = int(_lerp(8.0, 4.5, s) * tempo * jit() / DT)                         # dig
    tau, t = np.linspace(0, 1, n), np.arange(n) * DT
    phase0 = rng.uniform(0, 2 * np.pi)
    joy = {"joy_stick": 0.7 * np.sin(np.pi * tau) + (1 - s) * 0.35 * np.sin(2 * np.pi * 0.6 * t + phase0),
           "joy_bucket": 0.7 * tau ** 1.5 * (1 - tau ** 8),
           "joy_boom": -0.3 * _bump(tau, 0.0, 0.4) + (1 - s) * 0.7 * _bump(tau, 0.75, 1.0),
           "joy_swing": np.zeros(n)}
    m.emit("dig", k, joy, np.zeros(n), fill * (3 * tau ** 2 - 2 * tau ** 3), 60 + 230 * np.sin(np.pi * tau) ** 0.5)
    m.idle(gap(), k)

    t_corr = 12 if overshoot > 3.0 else 0                                   # loaded swing
    n = int(_lerp(2.4, 4.4, s ** 0.5) * tempo * jit() / DT) + t_corr
    v = _swing_velocity(n, TRUCK_DEG - m.swing, s, overshoot, t_corr)
    tau, t = np.linspace(0, 1, n), np.arange(n) * DT
    v = v + (1 - s) ** 2 * 30 * np.sin(2 * np.pi * 1.1 * t) * np.sin(np.pi * tau)
    joy = {"joy_swing": np.clip(v / 60, -1, 1), "joy_boom": 0.7 * _bump(tau, 0.02, _lerp(0.12, 0.5, s)),
           "joy_stick": np.zeros(n), "joy_bucket": np.zeros(n)}
    m.emit("swing_loaded", k, joy, v, np.full(n, fill), 150 + 60 * np.abs(joy["joy_swing"]))
    m.idle(gap(), k)

    n = int(_lerp(3.0, 1.8, s) * tempo * jit() / DT)                         # dump
    tau = np.linspace(0, 1, n)
    joy = {"joy_bucket": -0.8 * np.sin(np.pi * tau), "joy_stick": -0.3 * np.sin(np.pi * tau),
           "joy_swing": np.zeros(n), "joy_boom": np.zeros(n)}
    m.emit("dump", k, joy, np.zeros(n), fill * (1 - (3 * tau ** 2 - 2 * tau ** 3)), np.full(n, 120.0))
    m.idle(gap(), k)

    back_over = _lerp(8.0, 0.5, s)                                          # return swing
    t_corr = int(_lerp(1.0, 0.0, s) / DT)
    n = int(_lerp(3.4, 3.5, s) * tempo * jit() / DT) + t_corr
    v = _swing_velocity(n, -m.swing, s, back_over, t_corr)
    tau = np.linspace(0, 1, n)
    joy = {"joy_swing": np.clip(v / 60, -1, 1), "joy_boom": -0.5 * _bump(tau, 0.1, _lerp(0.5, 0.9, s)),
           "joy_stick": -0.4 * _bump(tau, 0.3, 0.9), "joy_bucket": 0.3 * _bump(tau, 0.2, 0.8)}
    m.emit("swing_empty", k, joy, v, np.zeros(n), 100 + 40 * np.abs(joy["joy_swing"]))
    m.idle(gap(), k)


def generate_synthetic_session(archetype: str, n_cycles: int = 8, seed: int = 0, operator: str = "OP",
                               unsafe_cycles: tuple[int, ...] = ()) -> list[PracticeSample]:
    """SIMULATED truck-loading session. ``novice_improving`` ramps skill 0.1 -> 0.65 across cycles.

    ``unsafe_cycles`` forces novice-like swings into the truck on those cycles (used to test that
    unsafe expert cycles are excluded from training).
    """
    rng = np.random.default_rng(seed)
    persona = np.random.default_rng(zlib.crc32(operator.encode()))
    tempo, fill_bias = persona.uniform(0.94, 1.06), persona.normal(0, 0.03)
    m = _Machine(rng, 1_790_000_000.0 + seed * 10_000, archetype)
    m.idle(1.5, -1)
    for k in range(n_cycles):
        if archetype == "novice_improving":
            s = _lerp(0.1, 0.65, k / max(n_cycles - 1, 1))
        else:
            s = SKILL[archetype]
        _cycle(m, k, 0.1 if k in unsafe_cycles else s, tempo, fill_bias)
    m.idle(1.0, -1)
    return m.samples
