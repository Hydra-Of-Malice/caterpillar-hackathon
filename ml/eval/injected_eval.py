"""Injected-anomaly evaluation of the behaviour pipeline (13 §2 M2, M3, M5, M16; §5).

Every number is SIMULATED (E1 evidence only: the pipeline detects pattern types we
injected into simulated telemetry, at a stated alert budget).

- Injections (13 §5 catalogue) are applied to the held-out, time-later test split with a
  2 s onset ramp: U1 fast swing, U2 joystick reversal bursts, U3 fast approach to truck
  (B+C), N1 benign slow careful work (must not alert), U5 hydraulic spikes (attribution).
- Each injected stream is replayed through the full Pipeline (merging, cooldowns, gating).
- Event-level metrics: existence recall / precision, and a range-based recall
  (Tatbul 2018 style: α = 0.5 existence + 0.5 overlap × 1/fragments, flat bias). No
  point-adjust.
- Baseline: single-feature robust-z detector (max risk-oriented z), thresholded by the
  same alert budget on the calibration split (13 §4 "trivial-anomaly illusion").
- False alerts per operating hour on clean test hours, with block-bootstrap 95 % CI.

Run after training: .venv\\Scripts\\python -m ml.eval.injected_eval [--model DIR]
"""
from __future__ import annotations

import argparse
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
from scipy import stats

from ml.train_iforest import (
    BASELINE_FILE, SIM_DIR, block_rate_ci, gt_inject_labels, hour_blocks, load_frame, samples_from_frame,
    simulate_events, waiting_flags, window_signals,
)
from sentinel.pipeline.anomaly import CARD_FILE, AnomalyDetector, resolve_model_dir
from sentinel.pipeline.features import true_runs
from sentinel.pipeline.runner import Pipeline, RuntimeContext
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import Event, FeatureWindow, Provenance, Tier

log = logging.getLogger("ml.eval.injected_eval")

REPORT_FILE = "eval_report.json"
MAGNITUDES = (1.2, 1.5, 2.0)
TOLERANCE_S = 5.0
RAMP_S = 2.0
BEHAVIOUR_RULES = {"fast_swing_near_truck", "harsh_reversal_burst", "travel_with_bucket_raised"}


@dataclass(frozen=True)
class Injection:
    kind: str
    magnitude: float
    machine_id: str
    t0: float
    t1: float


@dataclass
class Replay:
    events: list[Event]
    windows: pd.DataFrame          # one row per FeatureWindow (+ waiting, zone, task_type)
    window_ms: list[float]         # per-window processing latency


# ------------------------------------------------------------------ injections
def _episodes(ts: np.ndarray, spacing_s: float, duration_s: float, warmup_s: float = 60.0) -> list[tuple[float, float]]:
    t, end, out = ts[0] + warmup_s, ts[-1] - duration_s - 5.0, []
    while t < end:
        out.append((float(t), float(t + duration_s)))
        t += spacing_s
    return out


def _ramp(ts: np.ndarray, t0: float) -> np.ndarray:
    return np.clip((ts - t0) / RAMP_S, 0.0, 1.0)


def _apply(df: pd.DataFrame, kind: str, m: float, spacing_s: float, duration_s: float,
           fn: Callable[[pd.DataFrame, np.ndarray, np.ndarray, float], None]) -> tuple[pd.DataFrame, list[Injection]]:
    """Apply `fn(df, index, ramp, m)` to each episode of each machine stream."""
    df = df.copy()
    injections: list[Injection] = []
    for mid, g in df.groupby("machine_id"):
        ts = g["ts"].to_numpy()
        for t0, t1 in _episodes(ts, spacing_s, duration_s):
            sel = (ts >= t0) & (ts <= t1)
            idx = g.index[sel]
            fn(df, idx, _ramp(ts[sel], t0), m)
            injections.append(Injection(kind, m, str(mid), t0, t1))
    return df, injections


def _fast_swing(df: pd.DataFrame, idx: pd.Index, ramp: np.ndarray, m: float) -> None:
    f = 1.0 + (m - 1.0) * ramp
    df.loc[idx, "swing_dps"] = df.loc[idx, "swing_dps"].to_numpy() * f
    df.loc[idx, "joy_swing"] = np.clip(df.loc[idx, "joy_swing"].to_numpy() * f, -1, 1)


def _reversal_burst(df: pd.DataFrame, idx: pd.Index, ramp: np.ndarray, m: float) -> None:
    ts = df.loc[idx, "ts"].to_numpy()
    freq = 1.0 + 2.0 * ((ts[0] * 7.31) % 1.0)          # 1–3 Hz, deterministic per episode
    amp = 0.2 * m * ramp
    wave = np.sin(2 * np.pi * freq * (ts - ts[0]))
    df.loc[idx, "joy_swing"] = np.clip(df.loc[idx, "joy_swing"].to_numpy() + amp * wave, -1, 1)
    df.loc[idx, "joy_stick"] = np.clip(df.loc[idx, "joy_stick"].to_numpy() + amp * np.sin(2 * np.pi * freq * (ts - ts[0]) + 1.3), -1, 1)
    df.loc[idx, "swing_dps"] = df.loc[idx, "swing_dps"].to_numpy() + 15.0 * amp * np.sin(2 * np.pi * freq * (ts - ts[0]) - 0.6)


def _fast_approach(df: pd.DataFrame, idx: pd.Index, ramp: np.ndarray, m: float) -> None:
    """Scale the bucket's closing speed toward the truck by m on each final approach."""
    if "bucket_to_truck_m" not in df.columns:
        return
    d = df.loc[idx, "bucket_to_truck_m"].to_numpy(dtype=float)
    closing = np.concatenate(([False], np.diff(d) < 0)) & (d < 10.0)
    out = d.copy()
    for start, stop in true_runs(closing):
        ref = d[max(start - 1, 0)]
        f = 1.0 + (m - 1.0) * ramp[start:stop]
        out[start:stop] = np.maximum(0.3, ref - f * (ref - d[start:stop]))
    df.loc[idx, "bucket_to_truck_m"] = out


def _slow_careful(df: pd.DataFrame, idx: pd.Index, ramp: np.ndarray, m: float) -> None:
    f = 1.0 - 0.4 * ramp
    for col in ("swing_dps", "joy_swing", "joy_boom", "joy_stick", "joy_bucket"):
        df.loc[idx, col] = df.loc[idx, col].to_numpy() * f


def _hyd_spikes(df: pd.DataFrame, idx: pd.Index, ramp: np.ndarray, m: float) -> None:
    pulse = np.array([0.3, 1.0, 0.6, 0.3, 0.1]) * 120.0 * m
    p = df.loc[idx, "hyd_pressure_bar"].to_numpy(dtype=float).copy()
    for start in range(3, len(p) - len(pulse), 15):
        p[start:start + len(pulse)] += pulse
    df.loc[idx, "hyd_pressure_bar"] = p


INJECTORS: dict[str, tuple[Callable[..., None], float, float]] = {
    # kind: (function, spacing_s, duration_s)
    "U1_fast_swing": (_fast_swing, 180.0, 40.0),
    "U2_reversal_burst": (_reversal_burst, 180.0, 15.0),
    "U3_fast_approach": (_fast_approach, 180.0, 40.0),
    "N1_slow_careful": (_slow_careful, 180.0, 60.0),
    "U5_hyd_spikes": (_hyd_spikes, 240.0, 30.0),
}


def inject(df: pd.DataFrame, kind: str, m: float) -> tuple[pd.DataFrame, list[Injection]]:
    """Inject one anomaly type at magnitude m into every machine stream of df."""
    fn, spacing, duration = INJECTORS[kind]
    return _apply(df, kind, m, spacing, duration, fn)


# ------------------------------------------------------------------ replay
def replay(model_dir: Path | None, df: pd.DataFrame) -> Replay:
    """Run df through a fresh Pipeline; collect events, windows and per-window latency."""
    pipe = Pipeline(model_dir)
    waiting = waiting_flags(df)
    zones = df["zone"].to_numpy(dtype=object) if "zone" in df.columns else np.full(len(df), None, dtype=object)
    events: list[Event] = []
    rows: list[dict[str, Any]] = []
    lat: list[float] = []
    last: FeatureWindow | None = None
    for i, sample in enumerate(samples_from_frame(df)):
        t = time.perf_counter()
        events.extend(pipe.process(sample, RuntimeContext(waiting_for_truck=bool(waiting[i]))))
        w = pipe.last_window()
        if w is not last and w is not None:
            lat.append((time.perf_counter() - t) * 1000.0)
            last = w
            rows.append({"t_start": w.t_start, "t_end": w.t_end, "machine_id": w.machine_id,
                         "operator_id": w.operator_id, "shift_id": w.shift_id, "context_key": w.context_key,
                         "task_type": w.context_key.split("|", 1)[1], "variant": w.variant,
                         "waiting": bool(waiting[i]), "zone": zones[i], "percentile": w.percentile,
                         **w.features})
    return Replay(events, pd.DataFrame(rows), lat)


# ------------------------------------------------------------------ detections & matching
def event_range(e: Event) -> tuple[str, float, float]:
    c = e.context
    if "t_start" in c:
        return e.machine_id, float(c["t_start"]), float(c["t_end"])
    return e.machine_id, float(e.evidence.get("idle_start_ts", e.ts)), float(e.ts)


DETECTORS: dict[str, Callable[[Event], bool]] = {
    "ml": lambda e: Provenance.ML in e.provenance and e.tier is not None,
    "rules": lambda e: e.type in BEHAVIOUR_RULES,
    "pipeline": lambda e: e.type in BEHAVIOUR_RULES or (Provenance.ML in e.provenance and e.tier is not None),
    "in_cab": lambda e: e.tier in (Tier.T1, Tier.T2) and e.type != "excessive_idle",
}


def detections(events: list[Event], detector: str) -> list[tuple[str, float, float]]:
    return [event_range(e) for e in events if DETECTORS[detector](e)]


def robust_z_detections(rep: Replay, det: AnomalyDetector, cfg: dict[str, Any], z_thr: float) -> list[tuple[str, float, float]]:
    """Single-feature robust-z baseline: max risk-oriented z ≥ threshold, same cooldown."""
    if rep.windows.empty:
        return []
    sig = window_signals(det, rep.windows, cfg)
    flags = simulate_events(sig, sig["zmax"].to_numpy(), z_thr, cfg["fusion"]["ml_cooldown_s"])
    return list(zip(sig["machine_id"][flags], sig["t_start"][flags], sig["t_end"][flags]))


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def match(injections: list[Injection], dets: list[tuple[str, float, float]], alpha: float = 0.5) -> dict[str, float]:
    """Event-level (existence) and range-based precision / recall."""
    tol = TOLERANCE_S
    hit, range_recall = 0, []
    for inj in injections:
        over = [(d0, d1) for m, d0, d1 in dets if m == inj.machine_id and _overlap(inj.t0 - tol, inj.t1 + tol, d0, d1) > 0]
        exists = bool(over)
        hit += exists
        cover = sum(_overlap(inj.t0, inj.t1, d0, d1) for d0, d1 in over) / max(inj.t1 - inj.t0, 1e-9)
        range_recall.append(alpha * exists + (1 - alpha) * min(cover, 1.0) * (1.0 / len(over) if over else 0.0))
    tp_det, range_prec = 0, []
    for m, d0, d1 in dets:
        over = [(i.t0, i.t1) for i in injections if i.machine_id == m and _overlap(i.t0 - tol, i.t1 + tol, d0, d1) > 0]
        tp_det += bool(over)
        range_prec.append(min(1.0, sum(_overlap(a - tol, b + tol, d0, d1) for a, b in over) / max(d1 - d0, 1e-9)))
    n_inj, n_det = len(injections), len(dets)
    return {"n_injections": n_inj, "n_detections": n_det,
            "recall": hit / n_inj if n_inj else float("nan"),
            "precision": tp_det / n_det if n_det else float("nan"),
            "range_recall": float(np.mean(range_recall)) if range_recall else float("nan"),
            "range_precision": float(np.mean(range_prec)) if range_prec else float("nan")}


def event_rate(dets: list[tuple[str, float, float]], windows: pd.DataFrame, cfg: dict[str, Any]) -> dict[str, float]:
    """Detections per operating hour on clean data, block-bootstrap 95 % CI."""
    block_s = cfg["anomaly"]["bootstrap_block_h"] * 3600.0
    t0 = windows["t_end"].min()
    codes, hours = hour_blocks(windows, cfg["anomaly"]["bootstrap_block_h"], cfg["window"]["stride_s"])
    labels = windows["machine_id"].astype(str) + ":" + ((windows["t_end"] - t0) // block_s).astype(int).astype(str)
    lookup = dict(zip(labels, codes))
    counts = np.zeros(len(hours))
    for m, _, d1 in dets:
        code = lookup.get(f"{m}:{int((d1 - t0) // block_s)}")
        if code is not None:
            counts[code] += 1
    return block_rate_ci(counts, hours, cfg["anomaly"]["bootstrap_reps"])


# ------------------------------------------------------------------ report
def test_frame(df: pd.DataFrame, bounds: dict[str, float], purge_s: float, max_hours: float) -> pd.DataFrame:
    """Held-out test rows (after the calibration boundary), capped in machine-hours."""
    test = df[df["ts"] > bounds["test_start"] + purge_s]
    per_machine_s = max_hours * 3600.0 / max(test["machine_id"].nunique(), 1)
    parts = [g[g["ts"] <= g["ts"].iloc[0] + per_machine_s] for _, g in test.groupby("machine_id")]
    return pd.concat(parts).sort_values(["machine_id", "ts"], kind="stable").reset_index(drop=True)


def _latency(ms: list[float]) -> dict[str, float]:
    a = np.asarray(ms) if ms else np.zeros(1)
    return {"p50_ms": float(np.percentile(a, 50)), "p99_ms": float(np.percentile(a, 99)), "n_windows": len(ms)}


def _attribution_share(events: list[Event], injections: list[Injection]) -> dict[str, float]:
    hyd = [e for e in events if e.type == "hyd_uncommanded_pressure"
           or (e.explanation and e.explanation[0].feature.startswith("hyd_") and Provenance.ML in e.provenance)]
    inside = [e for e in hyd if match(injections, [event_range(e)])["precision"] == 1.0]
    machine = sum(e.attribution.value == "machine" for e in inside)
    ops = {e.operator_id for e in inside}
    return {"hydraulic_events_in_injections": len(inside), "attributed_machine": machine,
            "machine_share": machine / len(inside) if inside else float("nan"), "operators": len(ops),
            "competency_ids_on_machine_events": sum(len(e.competency_ids) for e in inside if e.attribution.value == "machine")}


def _gt_injections(df: pd.DataFrame) -> list[Injection]:
    """Scripted injections recorded by the simulator in gt (evaluation only)."""
    labels = gt_inject_labels(df)
    out: list[Injection] = []
    for mid, g in df.assign(_lab=labels).groupby("machine_id"):
        lab, ts = g["_lab"].to_numpy(dtype=object), g["ts"].to_numpy()
        start = None
        for i in range(len(lab) + 1):
            cur = lab[i] if i < len(lab) else None
            prev = lab[i - 1] if i > 0 else None
            if cur != prev:
                if prev is not None and start is not None:
                    out.append(Injection(str(prev), 1.0, str(mid), float(ts[start]), float(ts[i - 1])))
                start = i if cur is not None else None
    return out


def evaluate_scenario(model_dir: Path, path: Path) -> dict[str, Any]:
    """Replay a scripted scenario (e.g. ravi_shift1) and summarise its events."""
    df = load_frame(path)
    rep = replay(model_dir, df)
    hours = len(rep.windows) * load_yaml("fusion")["window"]["stride_s"] / 3600.0
    by_type: dict[str, dict[str, int]] = {}
    for e in rep.events:
        tier = e.tier.value if e.tier else "log"
        key = e.type + (" (suppressed)" if e.context.get("suppressed_reason") else "")
        by_type.setdefault(key, {}).setdefault(tier, 0)
        by_type[key][tier] += 1
    injections = _gt_injections(df)
    recall = {}
    for kind in sorted({i.kind for i in injections}):
        inj = [i for i in injections if i.kind == kind]
        recall[kind] = {det: match(inj, detections(rep.events, det))["recall"] for det in ("rules", "ml", "pipeline")}
        recall[kind]["idle_rule"] = match(inj, [event_range(e) for e in rep.events if e.type == "excessive_idle"])["recall"]
    return {"label": "SIMULATED", "file": path.name, "operating_h": round(hours, 3), "events_by_type_tier": by_type,
            "gt_injection_recall": recall, "latency": _latency(rep.window_ms)}


def evaluate(model_dir: Path, data_path: Path, bounds: dict[str, float], max_hours: float = 6.0) -> dict[str, Any]:
    """Full SIMULATED evaluation; writes eval_report.json next to the model."""
    cfg = load_yaml("fusion")
    det = AnomalyDetector.load(model_dir)
    if det is None:
        raise FileNotFoundError(f"no model in {model_dir}")
    z_thr = det.bundle["thresholds"]["robust_z_baseline"]["z_threshold"]
    test = test_frame(load_frame(data_path), bounds, cfg["window"]["length_s"], max_hours)
    log.info("Test replay: %d samples, %d machines", len(test), test["machine_id"].nunique())

    clean = replay(model_dir, test)
    pct = clean.windows["percentile"].dropna().to_numpy()
    clean_dets = {d: detections(clean.events, d) for d in DETECTORS}
    clean_dets["robust_z"] = robust_z_detections(clean, det, cfg, z_thr)
    t2 = [event_range(e) for e in clean.events if Provenance.ML in e.provenance and (e.risk_score or 0) >= det.thresholds["tau2"]]
    false_alerts = {d: event_rate(v, clean.windows, cfg) for d, v in clean_dets.items()}
    false_alerts["ml_t2_level"] = event_rate(t2, clean.windows, cfg)

    injected: dict[str, Any] = {}
    for kind in ("U1_fast_swing", "U2_reversal_burst", "U3_fast_approach"):
        for m in MAGNITUDES:
            df_i, inj = inject(test, kind, m)
            rep = replay(model_dir, df_i)
            dets = {d: detections(rep.events, d) for d in ("ml", "rules", "pipeline")}
            dets["robust_z"] = robust_z_detections(rep, det, cfg, z_thr)
            injected[f"{kind}@{m}"] = {d: match(inj, v) for d, v in dets.items()}
            log.info("%s @%.1fx: %s", kind, m, {d: round(r["recall"], 2) for d, r in injected[f"{kind}@{m}"].items()})
    df_n, inj_n = inject(test, "N1_slow_careful", 1.0)
    rep_n = replay(model_dir, df_n)
    benign = {d: match(inj_n, v) for d, v in {**{k: detections(rep_n.events, k) for k in ("ml", "pipeline", "in_cab")},
                                              "robust_z": robust_z_detections(rep_n, det, cfg, z_thr)}.items()}
    df_h, inj_h = inject(test, "U5_hyd_spikes", 1.5)
    attribution = _attribution_share(replay(model_dir, df_h).events, inj_h)

    pooled: dict[str, dict[str, float]] = {}
    for d in ("ml", "rules", "pipeline", "robust_z"):
        rows = [v[d] for k, v in injected.items() if float(k.split("@")[1]) >= 1.5]
        n_inj = sum(r["n_injections"] for r in rows)
        n_det = sum(r["n_detections"] for r in rows)
        pooled[d] = {"recall": sum(r["recall"] * r["n_injections"] for r in rows) / max(n_inj, 1),
                     "precision": (sum(r["precision"] * r["n_detections"] for r in rows if r["n_detections"]) / n_det
                                   if n_det else float("nan")),
                     "n_injections": n_inj, "n_detections": n_det}

    scenarios = {p.stem: evaluate_scenario(model_dir, p) for p in (SIM_DIR / "ravi_shift1.parquet",) if p.is_file()}
    summary = {
        "label": "SIMULATED", "evidence_level": "E1 injected-anomaly evaluation on SIMULATED telemetry",
        "test_operating_h": round(len(clean.windows) * cfg["window"]["stride_s"] / 3600.0, 3),
        "thresholds": {"tau1": det.thresholds["tau1"], "tau2": det.thresholds["tau2"], "robust_z": z_thr},
        "false_alerts_per_h_clean_test": false_alerts,
        "null_calibration": {"share_p_ge_0.99": float(np.mean(pct >= 0.99)) if len(pct) else float("nan"),
                             "ks_uniform_pvalue_stat": float(stats.kstest(1 - pct, "uniform").statistic) if len(pct) else float("nan")},
        "injected_u1_u3_at_ge_1.5x": pooled,
        "benign_novelty_N1": benign,
        "u5_machine_attribution": attribution,
        "latency_per_window": _latency(clean.window_ms),
        "scenarios": {k: {kk: v[kk] for kk in ("operating_h", "gt_injection_recall")} for k, v in scenarios.items()},
    }
    report = {"summary": summary, "injected_by_kind_magnitude": injected, "scenarios": scenarios,
              "injections": {"catalogue": {k: {"spacing_s": v[1], "duration_s": v[2]} for k, v in INJECTORS.items()},
                             "ramp_s": RAMP_S, "tolerance_s": TOLERANCE_S}}
    (model_dir / REPORT_FILE).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> dict[str, Any]:
    ap = argparse.ArgumentParser(description="Injected-anomaly evaluation (SIMULATED)")
    ap.add_argument("--model", type=Path, default=None)
    ap.add_argument("--data", type=Path, default=BASELINE_FILE)
    ap.add_argument("--eval-hours", type=float, default=6.0)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    model_dir = resolve_model_dir(args.model)
    if model_dir is None:
        raise SystemExit("No trained model found; run `python -m ml.train_iforest` first")
    card = json.loads((model_dir / CARD_FILE).read_text(encoding="utf-8"))
    report = evaluate(model_dir, args.data, card["split"], max_hours=args.eval_hours)
    card["metrics"] = report["summary"]
    (model_dir / CARD_FILE).write_text(json.dumps(card, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2, default=str))
    return report


if __name__ == "__main__":
    main()
