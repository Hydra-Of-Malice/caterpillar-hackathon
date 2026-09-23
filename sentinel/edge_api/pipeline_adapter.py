"""Guarded integration of the behaviour pipeline (agent C). Missing or failing → no-op, logged."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from sentinel.shared.schemas import Event, FeatureWindow, TelemetrySample

log = logging.getLogger("sentinel.edge.pipeline")


@dataclass
class FallbackRuntimeContext:
    """Mirror of sentinel.pipeline.runner.RuntimeContext used when the pipeline is absent."""
    waiting_for_truck: bool = False
    task_type: str | None = None
    operator_experience_h: float = 0.0


class NoopPipeline:
    """Produces no events; keeps the edge running (rules and alerts still work) without the ML path."""
    version = "noop"

    def process(self, sample: TelemetrySample, ctx: Any) -> list[Event]:
        return []

    def last_window(self) -> FeatureWindow | None:
        return None


def load_pipeline() -> tuple[Any, type, str]:
    """(pipeline, RuntimeContext class, status) where status is "loaded" or "noop: <reason>".

    ``SENTINEL_PIPELINE=noop`` forces the no-op pipeline (isolated edge tests, ML-path outages)."""
    if os.getenv("SENTINEL_PIPELINE") == "noop":
        return NoopPipeline(), FallbackRuntimeContext, "noop: disabled by SENTINEL_PIPELINE"
    try:
        from sentinel.pipeline.runner import Pipeline, RuntimeContext
    except Exception as exc:                                  # ImportError or a broken module
        log.warning("sentinel.pipeline unavailable (%s) — using a no-op pipeline; ML advisories are off", exc)
        return NoopPipeline(), FallbackRuntimeContext, f"noop: {type(exc).__name__}"
    try:
        return Pipeline(), RuntimeContext, "loaded"
    except Exception as exc:
        log.exception("sentinel.pipeline failed to initialise — using a no-op pipeline")
        return NoopPipeline(), RuntimeContext, f"noop: {type(exc).__name__}"
