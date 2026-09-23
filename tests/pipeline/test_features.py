"""Feature correctness on hand-built signals (04 §4)."""
from __future__ import annotations

import math

import numpy as np
import pytest

from sentinel.pipeline.features import FEATURE_SPECS, FeatureExtractor, compute_features, model_features
from tests.pipeline.synth import DT, loading_cycles, window_from

T = np.arange(200) * DT


def feats(cols: dict, cfg: dict, variant: str = "BC", **kw) -> dict[str, float]:
    return compute_features(window_from(cols, variant=variant, **kw), cfg["features"])


def test_joystick_jerk_matches_analytic_sinusoid(cfg):
    amp, freq = 0.5, 0.5
    f = feats({"joy_swing": amp * np.sin(2 * np.pi * freq * T)}, cfg)
    expected = amp * (2 * np.pi * freq) ** 2 / math.sqrt(2)
    assert f["joy_jerk_swing"] == pytest.approx(expected, rel=0.02)
    assert f["joy_jerk_boom"] == pytest.approx(0.0)
    assert f["joy_jerk_rms"] == pytest.approx(max(f[f"joy_jerk_{a}"] for a in ("swing", "boom", "stick", "bucket")))


def test_reversal_count_on_triangle_wave(cfg):
    tri = 0.8 * (2 * np.abs(((T / 2.0) % 2) - 1) - 1)     # ±0.8, slope 0.8/s, legs of 2 s
    f = feats({"joy_stick": tri}, cfg)
    assert f["joy_reversals"] == 9                        # 10 legs in 20 s → 9 turning points


def test_harsh_reversal_needs_fast_sign_flip(cfg):
    flip = np.where(T < 10, 0.8, -0.8)
    slow = 0.8 * np.cos(np.pi * T / 20)
    assert feats({"joy_swing": flip}, cfg)["harsh_reversals"] == 1
    assert feats({"joy_swing": slow}, cfg)["harsh_reversals"] == 0


def test_swing_peak_p95_and_near_truck(cfg):
    near = (T >= 5) & (T < 7)
    swing = np.where(near, 10.0, 40.0)
    btt = np.where(near, 3.0, 12.0)
    f = feats({"swing_dps": swing, "bucket_to_truck_m": btt}, cfg)
    assert f["swing_speed_p95"] == pytest.approx(40.0)
    assert f["swing_speed_peak"] == pytest.approx(40.0)
    assert f["swing_speed_near_truck"] == pytest.approx(10.0)
    assert f["near_truck_frac"] == pytest.approx(0.1)


def test_approach_speed_and_time_to_contact(cfg):
    dist = np.maximum(0.9, 9.9 - 2.0 * T)                 # closes at 2 m/s, then stops at 0.9 m
    f = feats({"bucket_to_truck_m": dist}, cfg)
    assert f["approach_speed_to_truck"] == pytest.approx(2.0, abs=0.01)
    assert 0.4 <= f["min_ttc_s"] <= 0.7


def test_pressure_spikes_without_lever_input_are_uncommanded(cfg):
    p = np.full(200, 35.0)
    p[[40, 100, 160]] = 185.0
    quiet = feats({"hyd_pressure_bar": p}, cfg)
    assert quiet["hyd_spike_count"] == 3
    assert quiet["hyd_uncmd_spike_count"] == 3
    stick = np.zeros(200)
    for i in (40, 100, 160):
        stick[i - 2:i + 5] = 0.6                          # lever step just before each spike
    commanded = feats({"hyd_pressure_bar": p, "joy_stick": stick}, cfg)
    assert commanded["hyd_spike_count"] == 3
    assert commanded["hyd_uncmd_spike_count"] == 0


def test_pressure_without_command_ratio(cfg):
    assert feats({"hyd_pressure_bar": 200.0}, cfg)["hyd_press_no_cmd_ratio"] == pytest.approx(1.0)
    assert feats({"hyd_pressure_bar": 35.0}, cfg)["hyd_press_no_cmd_ratio"] == pytest.approx(0.0)


def test_idle_ratio_overlap_saturation(cfg):
    active = T >= 10
    f = feats({"joy_swing": np.where(active, 0.95, 0.0), "joy_boom": np.where(T >= 15, 0.5, 0.0),
               "swing_dps": np.where(active, 30.0, 0.0)}, cfg)
    assert f["idle_ratio"] == pytest.approx(0.5)
    assert f["boom_swing_overlap"] == pytest.approx(0.5)
    assert f["joy_saturation_frac"] == pytest.approx(0.5)


def test_travel_reverse_raised_and_throttle(cfg):
    moving = T < 10
    f = feats({"travel_kmh": np.where(moving, 4.0, 0.0), "travel_cmd": np.where(moving, -0.5, 0.0),
               "boom_angle_deg": 55.0, "throttle_pct": np.where(T < 10, 60.0, 90.0)}, cfg)
    assert f["travel_speed_p95"] == pytest.approx(4.0)
    assert f["reverse_travel_frac"] == pytest.approx(1.0)
    assert f["travel_implement_raised_frac"] == pytest.approx(0.5)
    assert f["throttle_var"] == pytest.approx(225.0)
    assert f["throttle_steps"] == 1


def test_b_variant_has_no_proximity_features(cfg):
    f = feats({}, cfg, variant="B")
    prox = {n for n, s in FEATURE_SPECS.items() if s.proximity}
    assert not prox & set(f)
    assert not prox & set(model_features("B"))
    assert {"swing_speed_near_truck", "approach_speed_to_truck", "min_ttc_s", "person_near_frac",
            "min_truck_m"} <= set(model_features("BC"))


def test_cycle_time_and_payload_from_swing_direction(cfg):
    ext = FeatureExtractor(cfg)
    windows = [w for s in loading_cycles(8, seed=3) if (w := ext.push(s)) is not None]
    f = compute_features(windows[-1], cfg["features"])
    assert 15.0 <= f["cycle_time_s"] <= 23.0
    assert f["cycle_time_cv"] < 0.2
    assert f["payload_per_cycle_t"] == pytest.approx(2.0, abs=0.05)


def test_every_feature_has_label_unit_and_direction(cfg):
    f = compute_features(window_from({}), cfg["features"])
    for name in f:
        spec = FEATURE_SPECS[name]
        assert spec.label and spec.unit and spec.risk in ("high", "low", "ctx")
