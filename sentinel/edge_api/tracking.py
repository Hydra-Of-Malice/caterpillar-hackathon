"""Telemetry-derived shift state on the sample clock: operation/breaks/idle and task progress."""
from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any

from sentinel.eta.estimator import DEFAULT_TRENCH_DEPTH_M, TRENCH_WIDTH_M
from sentinel.shared.schemas import TelemetrySample

JOY_CHANNELS = ("joy_swing", "joy_boom", "joy_stick", "joy_bucket", "travel_cmd")
DENSITY_T_PER_M3 = {"clay_gravel": 1.9, "sand": 1.6, "topsoil": 1.3, "rock": 2.4}   # loose, [HYPOTHESIS]


def is_moving(s: TelemetrySample) -> bool:
    """07 IMM-2: travel, swing or implement motion with hydraulics unlocked — not travel only."""
    controls = max(abs(getattr(s, c)) for c in JOY_CHANNELS)
    return s.travel_kmh > 0.5 or abs(s.swing_dps) > 3.0 or (not s.hyd_lockout and controls > 0.1)


def is_idle(s: TelemetrySample) -> bool:
    """Engine on with no control input and no motion."""
    controls = max(abs(getattr(s, c)) for c in JOY_CHANNELS)
    return s.engine_on and controls < 0.05 and s.travel_kmh < 0.2 and abs(s.swing_dps) < 1.0


@dataclass
class OperationTracker:
    """Continuous operation since the last qualifying break, breaks, idle time and motion."""
    min_break_s: float = 600.0
    max_dt_s: float = 1.0                       # gaps longer than this are not counted as time
    op_start_ts: float | None = None
    last_break_ts: float | None = None
    on_break: bool = False
    break_started_ts: float | None = None
    inactive_since: float | None = None
    idle_total_s: float = 0.0
    idle_waiting_s: float = 0.0
    idle_current_s: float = 0.0
    operating_s: float = 0.0
    operating_by_type: dict[str, float] = field(default_factory=dict)
    last_ts: float | None = None
    moving: bool = False

    def start_shift(self, ts: float) -> None:
        """Reset counters; the shift start counts as the last break (screen 2 "last break 06:00")."""
        fresh = OperationTracker(min_break_s=self.min_break_s, max_dt_s=self.max_dt_s)
        self.__dict__.update(fresh.__dict__)
        self.op_start_ts = self.last_break_ts = ts

    def update(self, s: TelemetrySample, waiting_for_truck: bool, task_type: str | None) -> None:
        if self.last_ts is not None and s.ts - self.last_ts >= self.min_break_s:
            self.op_start_ts = self.last_break_ts = s.ts             # telemetry gap ≥ a break: machine was parked
        dt = 0.0 if self.last_ts is None else min(max(s.ts - self.last_ts, 0.0), self.max_dt_s)
        self.last_ts = s.ts
        self.moving = is_moving(s)
        resting = (not s.engine_on) or s.hyd_lockout
        if resting:
            self.inactive_since = self.inactive_since if self.inactive_since is not None else s.ts
        else:
            if self.inactive_since is not None and s.ts - self.inactive_since >= self.min_break_s:
                self.op_start_ts = self.last_break_ts = s.ts         # inferred break (engine off / locked out)
            self.inactive_since = None
            if self.op_start_ts is None:
                self.op_start_ts = s.ts
            self.operating_s += dt
            if task_type:
                self.operating_by_type[task_type] = self.operating_by_type.get(task_type, 0.0) + dt
        if is_idle(s):
            self.idle_total_s += dt
            self.idle_current_s += dt
            if waiting_for_truck:
                self.idle_waiting_s += dt
        else:
            self.idle_current_s = 0.0

    def continuous_operation_min(self, now: float) -> float:
        if self.on_break or self.op_start_ts is None or self.last_ts is None:
            return 0.0
        if now - self.last_ts >= self.min_break_s:                   # no telemetry for a break length
            return 0.0
        if self.inactive_since is not None and now - self.inactive_since >= self.min_break_s:
            return 0.0
        return max(0.0, (now - self.op_start_ts) / 60.0)

    def start_break(self, ts: float) -> None:
        self.on_break, self.break_started_ts = True, ts

    def end_break(self, ts: float) -> bool:
        """End a break; True if it was long enough to reset continuous operation."""
        started = self.break_started_ts if self.break_started_ts is not None else ts
        self.on_break, self.break_started_ts = False, None
        if ts - started >= self.min_break_s:
            self.op_start_ts = self.last_break_ts = ts
            return True
        return False

    def fast_forward(self, minutes: float, now: float) -> None:
        """DEMO: pretend the machine has already operated ``minutes`` without a break."""
        self.on_break, self.inactive_since = False, None
        self.op_start_ts = now - minutes * 60.0
        self.last_ts = max(self.last_ts or now, now)

    def idle_summary(self) -> dict[str, float]:
        unexplained = max(0.0, self.idle_total_s - self.idle_waiting_s)
        return {"today_min": round(self.idle_total_s / 60, 1), "waiting_min": round(self.idle_waiting_s / 60, 1),
                "unexplained_min": round(unexplained / 60, 1), "current_min": round(self.idle_current_s / 60, 1)}

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OperationTracker":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class ProgressTracker:
    """Task progress per bucket cycle from the payload drop at dump (payload_t peak / material
    density = m³). Simulator ground truth (sample.gt) is never read."""
    peak_payload_t: float = 0.0
    cycles: int = 0
    source: str | None = None
    exposure: dict[str, dict[str, int]] = field(default_factory=dict)
    dump_ts: deque = field(default_factory=lambda: deque(maxlen=11))

    def update(self, s: TelemetrySample, task_type: str, material: str | None, depth_m: float | None) -> float:
        """Returns the quantity completed by this sample, in the task's unit (m³, or m of trench)."""
        m3 = self._payload_dump(s, material or "clay_gravel")
        if m3 <= 0:
            return 0.0
        self.cycles += 1
        self.dump_ts.append(s.ts)
        exp = self.exposure.setdefault(task_type, {"cycles": 0, "truck_approach_cycles": 0})
        exp["cycles"] += 1
        if s.prox_truck_m is not None and s.prox_truck_m < 10.0:
            exp["truck_approach_cycles"] += 1
        if task_type == "trenching":
            return m3 / (TRENCH_WIDTH_M * (depth_m or DEFAULT_TRENCH_DEPTH_M))
        return m3

    def avg_cycle_s(self) -> float | None:
        ts = list(self.dump_ts)
        return round((ts[-1] - ts[0]) / (len(ts) - 1), 1) if len(ts) >= 2 else None

    def _payload_dump(self, s: TelemetrySample, material: str) -> float:
        if s.payload_t >= 0.3:
            self.peak_payload_t = max(self.peak_payload_t, s.payload_t)
            return 0.0
        if self.peak_payload_t >= 0.3 and s.payload_t < 0.1:
            peak, self.peak_payload_t = self.peak_payload_t, 0.0
            self.source = "payload"
            return peak / DENSITY_T_PER_M3.get(material, 1.9)
        return 0.0

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["dump_ts"] = list(self.dump_ts)
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ProgressTracker":
        obj = cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__ and k != "dump_ts"})
        obj.dump_ts.extend(d.get("dump_ts", []))
        return obj
