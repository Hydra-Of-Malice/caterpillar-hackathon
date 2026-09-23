"""Sensor validation for the safety layer: invalid / stuck-at proximity and a flapping seatbelt switch.

These detectors feed rule R-SENSOR-01. They never assume the safe state: a faulty sensor makes the
dependent rules hold their latched state and marks protection "degraded".
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import Iterable, Literal

from sentinel.shared.schemas import TelemetrySample

from sentinel.safety.latch import EPS_S

HealthState = Literal["ok", "not_fitted", "fault", "stale"]


@dataclass(frozen=True, slots=True)
class ProxFault:
    """Details of a detected proximity fault."""
    kind: Literal["invalid", "stuck"]
    channel: str
    value: float
    duration_s: float
    limit_s: float


class _Channel:
    __slots__ = ("last", "same_since", "invalid_since")

    def __init__(self) -> None:
        self.last: float | None = None          # last valid reading (None = nothing to compare)
        self.same_since = 0.0                   # when ``last`` was first seen (valid while last is set)
        self.invalid_since: float | None = None


class ProximityMonitor:
    """Flags a proximity channel that is invalid (NaN/inf/negative) or bit-identical for too long.

    ``None`` (nothing detected) is a valid reading. A real range sensor never repeats a float exactly
    for ~20 frames, so an exact repeat for longer than ``stuck_s`` is treated as stuck-at.
    """

    def __init__(self, channels: Iterable[str], invalid_s: float, stuck_s: float) -> None:
        self.channels = tuple(channels)
        self.invalid_s = float(invalid_s)
        self.stuck_s = float(stuck_s)
        self._state = {c: _Channel() for c in self.channels}

    def update(self, sample: TelemetrySample) -> ProxFault | None:
        """Consume one sample; return the first channel fault currently exceeding its time limit."""
        ts, fault = sample.ts, None
        for name, st in self._state.items():
            v = getattr(sample, name)
            if v is None:
                st.last = st.invalid_since = None
            elif not math.isfinite(v) or v < 0.0:
                st.last = None
                if st.invalid_since is None:
                    st.invalid_since = ts
                if fault is None and ts - st.invalid_since > self.invalid_s + EPS_S:
                    fault = ProxFault("invalid", name, v, ts - st.invalid_since, self.invalid_s)
            else:
                st.invalid_since = None
                if st.last is None or v != st.last:
                    st.last, st.same_since = v, ts
                elif fault is None and ts - st.same_since > self.stuck_s + EPS_S:
                    fault = ProxFault("stuck", name, v, ts - st.same_since, self.stuck_s)
        return fault

    def reset(self) -> None:
        """Forget history (sensor not fitted)."""
        self._state = {c: _Channel() for c in self.channels}

    def rebase(self, ts: float) -> None:
        """Restart running timers at ``ts`` after a backwards clock jump."""
        for st in self._state.values():
            if st.last is not None:
                st.same_since = ts
            if st.invalid_since is not None:
                st.invalid_since = ts


class SeatbeltMonitor:
    """Detects a flapping seatbelt switch: more than ``max_transitions`` changes within ``window_s``."""

    def __init__(self, window_s: float, max_transitions: int) -> None:
        self.window_s = float(window_s)
        self.max_transitions = int(max_transitions)
        self._last: bool | None = None
        self._changes: deque[float] = deque()

    def update(self, ts: float, fastened: bool) -> bool | None:
        """Return True while flapping, False once stable for a full window, None in between."""
        if self._last is not None and fastened != self._last:
            self._changes.append(ts)
        self._last = fastened
        changes = self._changes
        while changes and ts - changes[0] > self.window_s + EPS_S:
            changes.popleft()
        n = len(changes)
        if n > self.max_transitions:
            return True
        return False if n == 0 else None

    @property
    def transitions_in_window(self) -> int:
        return len(self._changes)

    def rebase(self, ts: float) -> None:
        """Move change history onto the new timeline at ``ts`` (keeps the count; it ages out normally)."""
        self._changes = deque(ts for _ in self._changes)


def protection_state(sensor_health: dict[str, str]) -> Literal["active", "degraded"]:
    """Return "degraded" if any safety input is faulty or stale; "not_fitted" is shown separately."""
    return "degraded" if any(v in ("fault", "stale") for v in sensor_health.values()) else "active"
