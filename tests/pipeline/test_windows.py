"""Window timing: 20 s windows every 5 s, per machine, reset on gaps and operator change."""
from __future__ import annotations

import numpy as np

from sentinel.pipeline.features import FeatureExtractor
from tests.pipeline.synth import DT, T0, idle_samples, loading_cycles


def closing_indices(ext: FeatureExtractor, samples) -> list[int]:
    return [i for i, s in enumerate(samples) if ext.push(s) is not None]


def test_first_window_after_20s_then_every_5s(cfg):
    samples = loading_cycles(5)
    ext = FeatureExtractor(cfg)
    closes = closing_indices(ext, samples)
    assert closes[0] == 200
    assert set(np.diff(closes)) == {50}


def test_window_spans_last_20s(cfg):
    ext = FeatureExtractor(cfg)
    window = None
    for s in idle_samples(21.0, T0):
        window = ext.push(s) or window
    assert window is not None
    ts = window.col("ts")
    assert len(ts) == 200
    assert ts[-1] == window.t_end
    assert window.t_end - window.t_start == 20.0
    assert ts[0] > window.t_start


def test_gap_resets_buffer(cfg):
    first = idle_samples(25.0, T0)
    second = idle_samples(30.0, first[-1].ts + 5.0)
    ext = FeatureExtractor(cfg)
    closing_indices(ext, first)
    closes = closing_indices(ext, second)
    assert closes[0] == 200                                  # a full 20 s of new data is needed


def test_machines_are_buffered_independently(cfg):
    a = idle_samples(30.0, T0, machine_id="EX-07")
    b = idle_samples(30.0, T0 + DT / 2, machine_id="EX-09")
    ext = FeatureExtractor(cfg)
    windows = [w for pair in zip(a, b) for s in pair if (w := ext.push(s)) is not None]
    assert {w.meta.machine_id for w in windows} == {"EX-07", "EX-09"}
    assert sum(w.meta.machine_id == "EX-07" for w in windows) == 2          # windows at 20 s and 25 s


def test_operator_change_resets_buffer(cfg):
    a = idle_samples(25.0, T0, operator_id="OP-A")
    b = idle_samples(25.0, a[-1].ts + DT, operator_id="OP-B")
    ext = FeatureExtractor(cfg)
    closing_indices(ext, a)
    assert closing_indices(ext, b)[0] == 200


def test_proximity_not_fitted_gives_b_variant(cfg):
    ext = FeatureExtractor(cfg)
    windows = [w for s in idle_samples(21.0, T0, prox_fitted=False) if (w := ext.push(s)) is not None]
    assert windows[0].variant == "B"
    assert np.isnan(windows[0].col("bucket_to_truck_m")).all()
