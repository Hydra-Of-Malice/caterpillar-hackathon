"""Conversion of PracticeSample lists into column arrays used by every analyser stage."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from sentinel.practice.settings import ALL_PHASES, BASE_CHANNELS, MISSING_TRUCK_M, SAMPLE_HZ
from sentinel.shared.schemas import PracticeSample

PHASE_INDEX: dict[str, int] = {p: i for i, p in enumerate(ALL_PHASES)}
IDLE = PHASE_INDEX["idle"]


@dataclass
class SessionArrays:
    """Column view of one practice session.

    ``truck_m`` keeps NaN where no truck distance was reported; ``channels["bucket_to_truck_m"]``
    holds the feature-filled version. ``gt_phase`` holds simulator labels (training and
    evaluation only; never used when analysing a trainee).
    """
    ts: np.ndarray
    channels: dict[str, np.ndarray]
    truck_m: np.ndarray
    gt_phase: np.ndarray | None = None

    @property
    def n(self) -> int:
        return len(self.ts)

    @property
    def truck_present(self) -> bool:
        """True when any sample reported a bucket-to-truck distance."""
        return bool(np.isfinite(self.truck_m).any())

    @property
    def dt(self) -> float:
        """Median sample interval in seconds."""
        if self.n < 2:
            return 1.0 / SAMPLE_HZ
        return float(np.median(np.diff(self.ts)))

    def matrix(self, names: tuple[str, ...] = BASE_CHANNELS) -> np.ndarray:
        """Stack channels into an (n, len(names)) float matrix."""
        return np.column_stack([self.channels[c] for c in names])


def _gt_phase(sample: PracticeSample) -> int:
    phase = (sample.gt or {}).get("phase")
    return PHASE_INDEX.get(str(phase), IDLE) if phase is not None else IDLE


def to_arrays(samples: list[PracticeSample]) -> SessionArrays:
    """Convert samples (sorted by ts) to arrays. Ground truth is kept only if every sample has it."""
    if not samples:
        raise ValueError("no samples")
    samples = sorted(samples, key=lambda s: s.ts)
    ts = np.array([s.ts for s in samples], dtype=float)
    truck = np.array([np.nan if s.bucket_to_truck_m is None else s.bucket_to_truck_m for s in samples])
    channels = {c: np.array([getattr(s, c) for s in samples], dtype=float)
                for c in BASE_CHANNELS if c != "bucket_to_truck_m"}
    channels["bucket_to_truck_m"] = np.where(np.isnan(truck), MISSING_TRUCK_M, truck)
    has_gt = all(s.gt and "phase" in s.gt for s in samples)
    gt_phase = np.array([_gt_phase(s) for s in samples]) if has_gt else None
    return SessionArrays(ts=ts, channels=channels, truck_m=truck, gt_phase=gt_phase)
