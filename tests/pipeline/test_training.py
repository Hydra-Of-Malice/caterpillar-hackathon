"""Training: artifacts and model card, time split, alert-budget thresholds, eval harness."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import ml.train_iforest as trainer
from ml.eval.injected_eval import evaluate, inject, match
from sentinel.pipeline.anomaly import CARD_FILE, MODEL_FILE


def test_artifacts_and_model_card(trained):
    out, card, _ = trained
    assert (out / MODEL_FILE).is_file()
    saved = json.loads((out / CARD_FILE).read_text(encoding="utf-8"))
    assert saved["label"] == "SIMULATED" and saved["training_data"]["source"] == "SIMULATED"
    assert saved["sha256"][MODEL_FILE] == trainer.sha256_of(out / MODEL_FILE)
    th = saved["thresholds"]
    assert th["method"] == "alert_budget" and th["tau2"] > th["tau1"]
    assert "contamination" in saved and "not used" in saved["contamination"]
    assert set(saved["features"]) == {"B", "BC"}


def test_time_split_orders_and_purges():
    t = np.arange(0.0, 10_000.0, 5.0)
    win = pd.DataFrame({"t_start": t - 20.0, "t_end": t})
    parts, bounds = trainer.time_split(win, {"train": 0.6, "calibration": 0.2, "test": 0.2}, purge_s=20.0)
    assert parts["train"]["t_end"].max() < bounds["train_end"] - 20.0
    assert parts["calibration"]["t_start"].min() > bounds["train_end"] + 20.0
    assert parts["calibration"]["t_end"].max() < bounds["test_start"] - 20.0
    assert parts["test"]["t_start"].min() > bounds["test_start"] + 20.0


def test_budget_threshold_is_lowest_passing_tau(cfg):
    rng = np.random.default_rng(0)
    n = 7200                                              # 10 operating hours of 5 s windows
    sig = pd.DataFrame({"machine_id": "EX-07", "operator_id": "OP-1", "shift_id": "S1",
                        "key": [f"k{i % 7}" for i in range(n)], "t_end": np.arange(n) * 5.0})
    values = -np.log10(rng.uniform(size=n))               # null surprise q
    grid = np.round(np.arange(1.0, 6.0, 0.05), 3)
    tau, stats = trainer.budget_threshold(sig, values, 1.0, grid, cfg, None)
    assert stats["ci95_hi"] <= 1.0
    codes, hours = trainer.hour_blocks(sig, cfg["anomaly"]["bootstrap_block_h"], cfg["window"]["stride_s"])
    below = trainer.simulate_events(sig, values, tau - 0.05, cfg["fusion"]["ml_cooldown_s"])
    counts = np.bincount(codes, weights=below.astype(float), minlength=len(hours))
    assert trainer.block_rate_ci(counts, hours, cfg["anomaly"]["bootstrap_reps"])["ci95_hi"] > 1.0


def test_training_pending_without_data(tmp_path, monkeypatch):
    def fail(*_a, **_k):
        raise OSError("simulator not available")
    monkeypatch.setattr(trainer.subprocess, "run", fail)
    assert trainer.main(["--data", str(tmp_path / "missing.parquet"), "--out", str(tmp_path / "m")]) is None


def test_injection_and_matching_helpers(fleet_parquet):
    df = trainer.load_frame(fleet_parquet)
    injected, inj = inject(df, "U1_fast_swing", 2.0)
    assert inj and (injected["swing_dps"].abs().max() > df["swing_dps"].abs().max() * 1.5)
    first = inj[0]
    assert match([first], [(first.machine_id, first.t0 + 1, first.t0 + 21)])["recall"] == 1.0
    assert match([first], [(first.machine_id, first.t1 + 60, first.t1 + 80)])["precision"] == 0.0


def test_evaluation_report_is_simulated(trained, fleet_parquet):
    out, _, split = trained
    report = evaluate(out, fleet_parquet, split["bounds"], max_hours=0.5)
    s = report["summary"]
    assert s["label"] == "SIMULATED"
    assert {"ml", "rules", "pipeline", "robust_z"} <= set(s["injected_u1_u3_at_ge_1.5x"])
    assert {"in_cab", "ml", "robust_z"} <= set(s["false_alerts_per_h_clean_test"])
    assert (out / "eval_report.json").is_file()
