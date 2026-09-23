"""Streaming window buffer and windowed behaviour features (04 §4).

A `FeatureExtractor` keeps one ring buffer per machine over 10 Hz `TelemetrySample`s and
emits a `Window` every `stride_s` covering the last `length_s` seconds (20 s / 5 s by
default). `compute_features` turns a window into the feature dict used by the anomaly
model, the behaviour rules and the explainer.

Two sensor variants (04 §4): "B" (CAN-style signals only) and "BC" (plus Tier C proximity).
Proximity features are only present in BC windows.

Ground truth (`sample.gt`) is never read here; `sample_row` lists every field used.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np

from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import TelemetrySample

Variant = Literal["B", "BC"]
Risk = Literal["high", "low", "ctx"]

# Columns extracted from each sample, in order. `gt` is deliberately absent.
SIGNALS: tuple[str, ...] = (
    "ts", "engine_on", "rpm", "throttle_pct", "travel_kmh", "travel_cmd", "service_brake",
    "joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps", "boom_angle_deg",
    "hyd_pressure_bar", "payload_t", "prox_fitted", "prox_person_m", "prox_truck_m",
    "bucket_to_truck_m", "n_dtc",
)
COL: dict[str, int] = {name: i for i, name in enumerate(SIGNALS)}
AXES: tuple[str, ...] = ("joy_swing", "joy_boom", "joy_stick", "joy_bucket")


@dataclass(frozen=True)
class FeatureSpec:
    """Metadata for one windowed feature: human label, unit and risk direction."""
    name: str
    label: str
    unit: str
    risk: Risk                 # "high" = higher is riskier, "low" = lower is riskier, "ctx" = context only
    proximity: bool = False    # needs Tier C (BC variant only)
    model_input: bool = True   # used as an Isolation Forest input


FEATURE_SPECS: dict[str, FeatureSpec] = {s.name: s for s in (
    FeatureSpec("joy_jerk_rms", "Joystick jerk (worst axis)", "1/s²", "high"),
    FeatureSpec("joy_jerk_swing", "Swing lever jerk", "1/s²", "high"),
    FeatureSpec("joy_jerk_boom", "Boom lever jerk", "1/s²", "high"),
    FeatureSpec("joy_jerk_stick", "Stick lever jerk", "1/s²", "high"),
    FeatureSpec("joy_jerk_bucket", "Bucket lever jerk", "1/s²", "high"),
    FeatureSpec("joy_reversals", "Joystick direction reversals", "per window", "high"),
    FeatureSpec("harsh_reversals", "Harsh joystick reversals", "per window", "high"),
    FeatureSpec("fast_reversals", "Fast lever reversals", "per window", "high"),
    FeatureSpec("joy_saturation_frac", "Time at full lever deflection", "fraction", "high"),
    FeatureSpec("multi_function_frac", "Time with 3+ functions active", "fraction", "ctx"),
    FeatureSpec("boom_swing_overlap", "Boom-swing overlap", "fraction", "ctx"),
    FeatureSpec("swing_speed_p95", "Swing speed (p95)", "°/s", "high"),
    FeatureSpec("swing_speed_peak", "Peak swing speed", "°/s", "high"),
    FeatureSpec("swing_decel_peak", "Peak swing deceleration", "°/s²", "high"),
    FeatureSpec("travel_speed_p95", "Travel speed (p95)", "km/h", "high"),
    FeatureSpec("reverse_travel_frac", "Share of travel in reverse", "fraction", "high"),
    FeatureSpec("travel_implement_raised_frac", "Travel with boom raised", "fraction", "high"),
    FeatureSpec("throttle_var", "Throttle variance", "%²", "high"),
    FeatureSpec("throttle_steps", "Throttle steps > 20 % in 1 s", "per window", "high"),
    FeatureSpec("hyd_spike_count", "Hydraulic pressure spikes", "per window", "high"),
    FeatureSpec("hyd_relief_frac", "Time at relief pressure", "fraction", "high"),
    FeatureSpec("hyd_uncmd_spike_count", "Pressure spikes without lever input", "per window", "high"),
    FeatureSpec("hyd_press_no_cmd_ratio", "Pressure without lever input", "fraction", "high"),
    FeatureSpec("brake_hard_count", "Hard brake applications", "per window", "high"),
    FeatureSpec("idle_ratio", "Idle share", "fraction", "ctx"),
    FeatureSpec("cycle_time_s", "Cycle time", "s", "ctx"),
    FeatureSpec("cycle_time_cv", "Cycle-time variability", "CV", "high"),
    FeatureSpec("payload_per_cycle_t", "Payload per cycle", "t", "ctx"),
    FeatureSpec("swing_speed_near_truck", "Swing speed near truck", "°/s", "high", proximity=True),
    FeatureSpec("approach_speed_to_truck", "Bucket approach speed to truck", "m/s", "high", proximity=True),
    FeatureSpec("min_ttc_s", "Minimum time to contact (truck)", "s", "low", proximity=True),
    FeatureSpec("min_truck_m", "Minimum truck distance", "m", "low", proximity=True),
    FeatureSpec("person_near_frac", "Person in warning zone", "fraction", "high", proximity=True),
    # rule / attribution / context only — never Isolation Forest inputs (04 §4)
    FeatureSpec("dtc_active_count", "Active fault codes", "count", "ctx", model_input=False),
    FeatureSpec("engine_on_frac", "Engine-on share", "fraction", "ctx", model_input=False),
    FeatureSpec("moving_frac", "Travelling share", "fraction", "ctx", model_input=False),
    FeatureSpec("near_truck_frac", "Bucket-near-truck share", "fraction", "ctx", proximity=True, model_input=False),
)}


def model_features(variant: Variant) -> list[str]:
    """Isolation Forest input features for a sensor variant (B excludes Tier C features)."""
    return [s.name for s in FEATURE_SPECS.values()
            if s.model_input and (variant == "BC" or not s.proximity)]


def _num(x: float | None) -> float:
    return math.nan if x is None else float(x)


def sample_row(s: TelemetrySample) -> tuple[float, ...]:
    """Numeric row for one sample, ordered as SIGNALS. Proximity is NaN when not fitted."""
    fitted = bool(s.prox_fitted)
    return (
        s.ts, float(s.engine_on), s.rpm, s.throttle_pct, s.travel_kmh, s.travel_cmd,
        float(s.service_brake), s.joy_swing, s.joy_boom, s.joy_stick, s.joy_bucket,
        s.swing_dps, s.boom_angle_deg, s.hyd_pressure_bar, s.payload_t, float(fitted),
        _num(s.prox_person_m) if fitted else math.nan,
        _num(s.prox_truck_m) if fitted else math.nan,
        _num(s.bucket_to_truck_m) if fitted else math.nan,
        float(len(s.dtc)),
    )


@dataclass
class WindowMeta:
    """Identity and context of a window, taken from its last sample."""
    site_id: str
    machine_id: str
    operator_id: str
    shift_id: str | None
    task_id: str | None
    task_type: str | None
    zone: str | None
    source: str


def sample_meta(s: TelemetrySample) -> WindowMeta:
    """Window identity/context fields of a sample (enum values as plain strings)."""
    task_type = getattr(s.task_type, "value", s.task_type)
    return WindowMeta(s.site_id, s.machine_id, s.operator_id, s.shift_id, s.task_id,
                      task_type, s.zone, getattr(s.source, "value", str(s.source)))


@dataclass
class Window:
    """One closed window: raw arrays plus the stateful cycle summary at close time."""
    t_start: float
    t_end: float
    meta: WindowMeta
    data: np.ndarray                       # (n_samples, len(SIGNALS))
    cycle: dict[str, float]
    variant: Variant

    def col(self, name: str) -> np.ndarray:
        return self.data[:, COL[name]]

    @property
    def dt(self) -> float:
        ts = self.col("ts")
        return float(np.median(np.diff(ts))) if len(ts) > 1 else 0.1


class CycleTracker:
    """Detects work cycles from swing-direction episodes (hysteresis on swing rate).

    A cycle starts at each loaded swing toward the truck (+ve swing rate by the schema's
    convention). Cycle time is the gap between successive cycle starts (gaps beyond
    max_cycle_s are pauses, not cycles); payload per cycle is the peak payload during the
    loaded swing. No ground-truth phase labels are used.
    """

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.on = float(cfg["swing_on_dps"])
        self.off = float(cfg["swing_off_dps"])
        self.min_episode = float(cfg["min_episode_s"])
        self.min_cycle = float(cfg["min_cycle_s"])
        self.max_cycle = float(cfg["max_cycle_s"])
        self.history = int(cfg["history"])
        self.state = 0
        self.episode_start = 0.0
        self.episode_payload = 0.0
        self.last_cycle_start: float | None = None
        self.cycle_times: deque[float] = deque(maxlen=self.history)
        self.payloads: deque[float] = deque(maxlen=self.history)

    def update(self, ts: float, swing_dps: float, payload_t: float) -> None:
        if self.state == 0:
            if swing_dps > self.on or swing_dps < -self.on:
                self.state = 1 if swing_dps > 0 else -1
                self.episode_start, self.episode_payload = ts, payload_t
            return
        if self.state == 1:
            self.episode_payload = max(self.episode_payload, payload_t)
        if (self.state == 1 and swing_dps < self.off) or (self.state == -1 and swing_dps > -self.off):
            self._close_episode(ts)

    def _close_episode(self, ts: float) -> None:
        if self.state == 1 and ts - self.episode_start >= self.min_episode:
            start = self.episode_start
            if self.last_cycle_start is None or start - self.last_cycle_start >= self.min_cycle:
                if self.last_cycle_start is not None and start - self.last_cycle_start <= self.max_cycle:
                    self.cycle_times.append(start - self.last_cycle_start)
                self.last_cycle_start = start
                self.payloads.append(self.episode_payload)
        self.state = 0

    def snapshot(self) -> dict[str, float]:
        times = np.asarray(self.cycle_times, dtype=float)
        cv = float(times.std() / times.mean()) if len(times) >= 3 and times.mean() > 0 else 0.0
        return {
            "cycle_time_s": float(times[-1]) if len(times) else 0.0,
            "cycle_time_cv": cv,
            "payload_per_cycle_t": float(np.mean(self.payloads)) if self.payloads else 0.0,
        }


@dataclass
class _Stream:
    operator_id: str
    next_end: float
    last_ts: float
    cycle: CycleTracker
    rows: deque = field(default_factory=deque)


class FeatureExtractor:
    """Per-machine streaming window buffer (20 s windows, 5 s stride by default)."""

    def __init__(self, cfg: dict[str, Any] | None = None) -> None:
        cfg = cfg or load_yaml("fusion")
        w = cfg["window"]
        self.length = float(w["length_s"])
        self.stride = float(w["stride_s"])
        self.max_gap = float(w["max_gap_s"])
        self.min_samples = int(w["min_coverage"] * w["length_s"] * w["sample_hz"])
        self.fcfg: dict[str, Any] = cfg["features"]
        self._streams: dict[str, _Stream] = {}

    def push(self, sample: TelemetrySample) -> Window | None:
        """Add one sample; return a Window when one closes on this sample, else None."""
        return self.push_row(sample_row(sample), sample_meta(sample))

    def push_row(self, row: tuple[float, ...], meta: WindowMeta) -> Window | None:
        """Same as push() for a pre-extracted row (fast path for offline replay)."""
        ts = row[0]
        st = self._streams.get(meta.machine_id)
        if st is None or st.operator_id != meta.operator_id or ts - st.last_ts > self.max_gap or ts < st.last_ts:
            st = _Stream(meta.operator_id, ts + self.length, ts, CycleTracker(self.fcfg["cycle"]))
            self._streams[meta.machine_id] = st
        st.rows.append(row)
        st.last_ts = ts
        st.cycle.update(ts, row[COL["swing_dps"]], row[COL["payload_t"]])
        if ts < st.next_end - 1e-6:
            return None
        st.next_end += self.stride
        if st.next_end <= ts:
            st.next_end = ts + self.stride
        t_start = ts - self.length
        while st.rows and st.rows[0][0] <= t_start + 1e-6:
            st.rows.popleft()
        if len(st.rows) < self.min_samples:
            return None
        data = np.asarray(st.rows, dtype=float)
        variant: Variant = "BC" if bool(np.all(data[:, COL["prox_fitted"]] > 0.5)) else "B"
        return Window(t_start, ts, meta, data, st.cycle.snapshot(), variant)


# ------------------------------------------------------------------ feature helpers
def true_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """(start, stop) index pairs of contiguous True runs (stop exclusive)."""
    if not mask.any():
        return []
    padded = np.concatenate(([False], mask, [False])).astype(np.int8)
    edges = np.diff(padded)
    return list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))


def _rising_edges(mask: np.ndarray) -> int:
    return len(true_runs(mask))


def _p95(x: np.ndarray) -> float:
    return float(np.percentile(x, 95)) if len(x) else 0.0


def jerk_rms(cmd: np.ndarray, dt: float) -> float:
    """RMS of the second derivative of a command signal (1/s²)."""
    if len(cmd) < 3:
        return 0.0
    d2 = np.diff(cmd, 2) / (dt * dt)
    return float(np.sqrt(np.mean(d2 * d2)))


def reversal_count(cmd: np.ndarray, dt: float, rate_deadband: float) -> int:
    """Sign changes of the command derivative, ignoring rates below the deadband."""
    rate = np.diff(cmd) / dt
    signs = np.sign(rate[np.abs(rate) > rate_deadband])
    return int(np.count_nonzero(np.diff(signs))) if len(signs) > 1 else 0


def harsh_reversal_onsets(cmd: np.ndarray, dt: float, delta: float, window_s: float) -> np.ndarray:
    """Onset indices of harsh reversals: a sign flip with |Δ| > delta within window_s."""
    n = len(cmd)
    lags = max(1, int(round(window_s / dt)))
    mask = np.zeros(n, dtype=bool)
    for k in range(1, min(lags, n - 1) + 1):
        a, b = cmd[:-k], cmd[k:]
        mask[:-k] |= (a * b < 0) & (np.abs(b - a) > delta)
    return np.asarray([start for start, _ in true_runs(mask)], dtype=int)


def zigzag_turns(cmd: np.ndarray, delta: float) -> list[int]:
    """Indices of confirmed turning points: the signal moved back by >= delta from them."""
    turns: list[int] = []
    hi = lo = 0
    trend = 0
    for i in range(1, len(cmd)):
        if trend >= 0 and cmd[i] > cmd[hi]:
            hi = i
        if trend <= 0 and cmd[i] < cmd[lo]:
            lo = i
        if trend >= 0 and cmd[hi] - cmd[i] >= delta:
            turns.append(hi)
            trend, lo = -1, i
        elif trend <= 0 and cmd[i] - cmd[lo] >= delta:
            turns.append(lo)
            trend, hi = 1, i
    return turns


def fast_reversal_onsets(cmd: np.ndarray, dt: float, delta: float, max_leg_s: float) -> np.ndarray:
    """Turning points reached within max_leg_s of the previous one after a >= delta leg
    (lever oscillation / reversal bursts, 13 U2)."""
    turns = zigzag_turns(cmd, delta)
    max_leg = max_leg_s / dt
    return np.asarray([b for a, b in zip(turns, turns[1:]) if b - a <= max_leg], dtype=int)


def closing_speed(dist: np.ndarray, dt: float, lag_s: float) -> np.ndarray:
    """Closing speed (m/s, positive when approaching) over a lag; NaN where undefined."""
    lag = max(1, int(round(lag_s / dt)))
    out = np.full(len(dist), np.nan)
    if len(dist) > lag:
        out[lag:] = (dist[:-lag] - dist[lag:]) / (lag * dt)
    return out


def _uncommanded_spikes(w: Window, spike_onsets: np.ndarray, cfg: dict[str, Any]) -> int:
    lookback = max(1, int(round(cfg["hyd_cmd_lookback_s"] / w.dt)))
    cmds = np.column_stack([w.col(a) for a in AXES] + [w.col("travel_cmd")])
    count = 0
    for i in spike_onsets:
        seg = cmds[max(0, i - lookback): i + 2]
        if float(np.max(seg.max(axis=0) - seg.min(axis=0))) < cfg["hyd_cmd_step"]:
            count += 1
    return count


# ------------------------------------------------------------------ feature groups
def _joystick_features(w: Window, cfg: dict[str, Any]) -> dict[str, float]:
    dt = w.dt
    cmds = {a: w.col(a) for a in AXES}
    jerks = {a: jerk_rms(c, dt) for a, c in cmds.items()}
    mag = np.abs(np.column_stack(list(cmds.values())))
    active = mag > cfg["cmd_active"]
    swing_on, boom_on = active[:, 0], active[:, 1]
    harsh = sum(len(harsh_reversal_onsets(c, dt, cfg["harsh_reversal_delta"], cfg["harsh_reversal_window_s"]))
                for c in cmds.values())
    fast = sum(len(fast_reversal_onsets(c, dt, cfg["fast_reversal_delta"], cfg["fast_reversal_leg_s"]))
               for c in cmds.values())
    return {
        "joy_jerk_rms": max(jerks.values()),
        **{f"joy_jerk_{a.removeprefix('joy_')}": v for a, v in jerks.items()},
        "joy_reversals": float(sum(reversal_count(c, dt, cfg["reversal_rate_deadband"]) for c in cmds.values())),
        "harsh_reversals": float(harsh),
        "fast_reversals": float(fast),
        "joy_saturation_frac": float(np.mean(mag.max(axis=1) > cfg["saturation"])),
        "multi_function_frac": float(np.mean(active.sum(axis=1) >= 3)),
        "boom_swing_overlap": float(np.mean(boom_on[swing_on])) if swing_on.any() else 0.0,
    }


def _swing_travel_features(w: Window, cfg: dict[str, Any]) -> dict[str, float]:
    dt = w.dt
    swing = np.abs(w.col("swing_dps"))
    smooth = np.convolve(swing, np.ones(3) / 3, mode="valid") if len(swing) >= 3 else swing
    decel = -np.diff(smooth) / dt if len(smooth) > 1 else np.zeros(1)
    travel = w.col("travel_kmh")
    moving = travel > cfg["travel_moving_kmh"]
    reverse = moving & (w.col("travel_cmd") < cfg["reverse_cmd"])
    raised = moving & (w.col("boom_angle_deg") > cfg["boom_raised_deg"])
    brake_on = w.col("service_brake") > 0.5
    hard_brakes = sum(1 for start, _ in true_runs(brake_on) if travel[start] > cfg["brake_hard_kmh"])
    return {
        "swing_speed_p95": _p95(swing),
        "swing_speed_peak": float(swing.max()),
        "swing_decel_peak": float(max(0.0, decel.max())),
        "travel_speed_p95": _p95(travel),
        "reverse_travel_frac": float(reverse.sum() / moving.sum()) if moving.any() else 0.0,
        "travel_implement_raised_frac": float(np.mean(raised)),
        "brake_hard_count": float(hard_brakes),
        "moving_frac": float(np.mean(moving)),
    }


def _engine_hydraulic_features(w: Window, cfg: dict[str, Any]) -> dict[str, float]:
    dt = w.dt
    thr = w.col("throttle_pct")
    lag = max(1, int(round(1.0 / dt)))
    steps = np.abs(thr[lag:] - thr[:-lag]) > cfg["throttle_step_pct"] if len(thr) > lag else np.zeros(0, bool)
    p = w.col("hyd_pressure_bar")
    spikes = np.diff(p) / dt > cfg["hyd_spike_bar_per_s"]
    onsets = np.asarray([start for start, _ in true_runs(spikes)], dtype=int)
    cmds = np.abs(np.column_stack([w.col(a) for a in AXES] + [w.col("travel_cmd")]))
    no_cmd = cmds.max(axis=1) < cfg["cmd_deadband"]
    min_no_cmd = int(round(cfg["hyd_no_cmd_min_s"] / dt))
    press_no_cmd = (float(np.mean(p[no_cmd] > cfg["hyd_no_cmd_pressure_bar"]))
                    if no_cmd.sum() >= min_no_cmd else 0.0)
    engine_on = w.col("engine_on") > 0.5
    idle = (engine_on & no_cmd & (w.col("travel_kmh") < cfg["idle_travel_kmh"])
            & (np.abs(w.col("swing_dps")) < cfg["idle_swing_dps"]))
    return {
        "throttle_var": float(np.var(thr)),
        "throttle_steps": float(_rising_edges(steps)),
        "hyd_spike_count": float(len(onsets)),
        "hyd_relief_frac": float(np.mean(p >= cfg["hyd_relief_frac"] * cfg["hyd_relief_bar"])),
        "hyd_uncmd_spike_count": float(_uncommanded_spikes(w, onsets, cfg)),
        "hyd_press_no_cmd_ratio": press_no_cmd,
        "idle_ratio": float(np.mean(idle)),
        "engine_on_frac": float(np.mean(engine_on)),
        "dtc_active_count": float(w.col("n_dtc").max()),
    }


def _proximity_features(w: Window, cfg: dict[str, Any]) -> dict[str, float]:
    dt = w.dt
    swing = np.abs(w.col("swing_dps"))
    btt = w.col("bucket_to_truck_m")
    dist = btt if np.isfinite(btt).any() else w.col("prox_truck_m")
    with np.errstate(invalid="ignore"):
        near = btt < cfg["near_truck_m"]
        closing = closing_speed(dist, dt, cfg["approach_lag_s"])
        in_zone = np.isfinite(closing) & (dist < cfg["approach_zone_m"])
        approaching = in_zone & (closing > cfg["ttc_min_closing_mps"])
        ttc = dist[approaching] / closing[approaching]
        person = w.col("prox_person_m") < cfg["person_warning_m"]
    truck = w.col("prox_truck_m")
    return {
        "swing_speed_near_truck": _p95(swing[near]),
        "near_truck_frac": float(np.mean(near)),
        "approach_speed_to_truck": float(max(0.0, np.max(closing[in_zone]))) if in_zone.any() else 0.0,
        "min_ttc_s": float(min(cfg["ttc_cap_s"], ttc.min())) if len(ttc) else float(cfg["ttc_cap_s"]),
        "min_truck_m": (float(min(cfg["truck_distance_cap_m"], np.nanmin(truck)))
                        if np.isfinite(truck).any() else float(cfg["truck_distance_cap_m"])),
        "person_near_frac": float(np.mean(person)),
    }


def compute_features(w: Window, cfg: dict[str, Any] | None = None) -> dict[str, float]:
    """All windowed features for a window (proximity features only for the BC variant)."""
    fcfg = cfg if cfg is not None else load_yaml("fusion")["features"]
    feats: dict[str, float] = {}
    feats.update(_joystick_features(w, fcfg))
    feats.update(_swing_travel_features(w, fcfg))
    feats.update(_engine_hydraulic_features(w, fcfg))
    feats.update(w.cycle)
    if w.variant == "BC":
        feats.update(_proximity_features(w, fcfg))
    return feats
