"""Ring buffer of recent abridged telemetry samples, the source of incident ±10 s snapshots."""
from __future__ import annotations

import threading
from collections import deque
from typing import Any

from sentinel.shared.schemas import TelemetrySample

ABRIDGED_FIELDS = (
    "ts", "seq", "task_id", "zone", "engine_on", "rpm", "throttle_pct", "travel_kmh", "gear", "park_brake",
    "hyd_lockout", "joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps", "hyd_pressure_bar",
    "payload_t", "seatbelt", "prox_fitted", "prox_person_m", "prox_person_sector", "prox_truck_m",
    "bucket_to_truck_m", "dtc",
)


def abridge(sample: TelemetrySample | dict[str, Any]) -> dict[str, Any]:
    """Keep the signals an incident reviewer needs (no simulator ground truth)."""
    data = sample.model_dump(mode="json") if isinstance(sample, TelemetrySample) else sample
    return {k: data.get(k) for k in ABRIDGED_FIELDS}


class SampleRing:
    """Thread-safe buffer holding the last ``seconds`` of samples (by sample time)."""

    def __init__(self, seconds: float = 20.0) -> None:
        self.seconds = seconds
        self._buf: deque[dict[str, Any]] = deque()
        self._lock = threading.Lock()

    def add(self, sample: TelemetrySample | dict[str, Any]) -> dict[str, Any]:
        row = abridge(sample)
        with self._lock:
            self._buf.append(row)
            cutoff = row["ts"] - self.seconds
            while self._buf and self._buf[0]["ts"] < cutoff:
                self._buf.popleft()
        return row

    def window(self, t0: float, t1: float) -> list[dict[str, Any]]:
        with self._lock:
            return [r for r in self._buf if t0 <= r["ts"] <= t1]

    def latest(self) -> dict[str, Any] | None:
        with self._lock:
            return self._buf[-1] if self._buf else None

    def all(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._buf)
