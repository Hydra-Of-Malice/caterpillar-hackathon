"""Per-window processing latency: p99 ≤ 50 ms (13 M16)."""
from __future__ import annotations

import time

import numpy as np

from sentinel.pipeline import Pipeline, RuntimeContext
from tests.pipeline.synth import loading_cycles


def test_window_latency_p99_under_50ms(model_dir):
    pipe = Pipeline(model_dir)
    ctx = RuntimeContext(task_type="truck_loading")
    samples = loading_cycles(40, seed=21, swing_scale=1.4)
    window_ms, sample_ms, last = [], [], None
    for s in samples:
        t = time.perf_counter()
        pipe.process(s, ctx)
        dt = (time.perf_counter() - t) * 1000.0
        w = pipe.last_window()
        if w is not last:
            window_ms.append(dt)
            last = w
        else:
            sample_ms.append(dt)
    assert len(window_ms) > 100
    assert pipe.mode == "fusion"
    assert np.percentile(window_ms[5:], 99) <= 50.0
    assert np.percentile(sample_ms, 99) <= 5.0
