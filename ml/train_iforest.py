"""Train per-context Isolation Forests on clean SIMULATED fleet windows (04 §3, §6, §8).

Steps:
1. Replay data/sim/fleet_baseline.parquet through the pipeline's own FeatureExtractor
   (20 s / 5 s windows). Ground truth is stripped; the only harness-side input is the
   waiting_for_truck task state (the dispatch / operator-tap stand-in).
2. Time-ordered 60/20/20 split into train / calibration / test, purging windows that
   straddle a boundary plus one window length on each side (13 §3–4).
3. Fit an IF (100 trees, max_samples 256) per context × variant when a context has
   ≥ 2,000 windows from ≥ 3 operators and ≥ 2 machines; always fit the broader
   machine-type model as the fallback (04 §8). `contamination` plays no role.
4. Calibrate per-context ECDFs on the calibration split (parent ECDF below 500 windows).
5. Set τ₁ / τ₂ by alert budget: replay calibration windows through the ML event logic
   (direction gate, exposure, cooldown merging, recurrence bonus) and pick the lowest τ
   whose block-bootstrap upper 95 % bound is ≤ 1.0 / 0.2 events per operating hour.
6. Evaluate on the held-out test split with injected anomalies (ml/eval/injected_eval.py).
7. Write models/iforest/<version>/{model.joblib, model_card.json, eval_report.json}.

All metrics are SIMULATED. Run: .venv\\Scripts\\python -m ml.train_iforest
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterator

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from sentinel.pipeline.anomaly import (
    CARD_FILE, DEFAULT_ROOT, LATEST_FILE, MODEL_FILE, AnomalyDetector, CompiledForest,
)
from sentinel.pipeline.context import context_key, gated_features, machine_type_for
from sentinel.pipeline.explain import direction_indicator, fit_baseline, risk_oriented, robust_z, signature_of, top_contributions
from sentinel.pipeline.features import (
    FEATURE_SPECS, SIGNALS, FeatureExtractor, WindowMeta, compute_features, model_features,
)
from sentinel.pipeline.fusion import FusionEngine, exposure, rule_feature_map, signature_key
from sentinel.shared.config import DATA_DIR, load_yaml
from sentinel.shared.schemas import TelemetrySample

log = logging.getLogger("ml.train_iforest")

SIM_DIR = DATA_DIR / "sim"
BASELINE_FILE = SIM_DIR / "fleet_baseline.parquet"
META_COLS = ("site_id", "machine_id", "operator_id", "shift_id", "task_id", "task_type", "zone", "source")
VARIANTS = ("BC", "B")


# ------------------------------------------------------------------ data loading
def ensure_dataset(path: Path = BASELINE_FILE) -> bool:
    """True if the dataset exists, trying `python -m sentinel.sim.datasets` once if not."""
    if path.is_file():
        return True
    log.info("%s missing; trying `python -m sentinel.sim.datasets`", path)
    try:
        subprocess.run([sys.executable, "-m", "sentinel.sim.datasets"], check=True, timeout=3600)
    except (subprocess.SubprocessError, OSError) as exc:
        log.warning("Could not generate simulator datasets: %s", exc)
    return path.is_file()


def load_frame(path: Path) -> pd.DataFrame:
    """Read a telemetry parquet, sorted by machine then time."""
    df = pd.read_parquet(path)
    return df.sort_values(["machine_id", "ts"], kind="stable").reset_index(drop=True)


def _gt_values(df: pd.DataFrame, key: str) -> pd.Series | None:
    """A ground-truth field (dict/JSON `gt` column or flattened gt_<key> / gt.<key>)."""
    for col in (f"gt_{key}", f"gt.{key}"):
        if col in df.columns:
            return df[col]
    if "gt" not in df.columns:
        return None

    def get(v: Any) -> Any:
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError:
                return None
        return v.get(key) if isinstance(v, dict) else None

    return df["gt"].map(get)


def waiting_flags(df: pd.DataFrame) -> np.ndarray:
    """waiting_for_truck per row: a task-state column if present, else the harness label.

    The pipeline never reads ground truth; in replay the harness plays the role of the
    dispatch / operator tap that supplies RuntimeContext.waiting_for_truck.
    """
    if "waiting_for_truck" in df.columns:
        return df["waiting_for_truck"].fillna(False).astype(bool).to_numpy()
    for col in ("task_state",):
        if col in df.columns:
            return (df[col] == "waiting_for_truck").to_numpy()
    for key in ("task_state", "waiting_for_truck", "activity"):
        vals = _gt_values(df, key)
        if vals is not None:
            return vals.map(lambda v: v is True or v in ("waiting_for_truck", "wait_truck")).to_numpy(dtype=bool)
    return np.zeros(len(df), dtype=bool)


def gt_inject_labels(df: pd.DataFrame) -> np.ndarray:
    """Injected-event label per row (None where clean). Evaluation only."""
    vals = _gt_values(df, "inject")
    return np.full(len(df), None, dtype=object) if vals is None else vals.to_numpy(dtype=object)


def signal_matrix(df: pd.DataFrame) -> np.ndarray:
    """(n, len(SIGNALS)) numeric matrix matching features.sample_row (gt excluded)."""
    defaults = {f: v.default for f, v in TelemetrySample.model_fields.items()}
    n = len(df)

    def col(name: str) -> np.ndarray:
        if name in df.columns:
            return pd.to_numeric(df[name], errors="coerce").to_numpy(dtype=float)
        default = defaults.get(name)
        return np.full(n, np.nan if default is None else float(default))

    fitted = col("prox_fitted") > 0.5
    cols = {name: col(name) for name in SIGNALS if name not in ("n_dtc",)}
    for name in ("prox_person_m", "prox_truck_m", "bucket_to_truck_m"):
        cols[name] = np.where(fitted, cols[name], np.nan)
    cols["n_dtc"] = (df["dtc"].map(lambda v: 0 if v is None else len(v)).to_numpy(dtype=float)
                     if "dtc" in df.columns else np.zeros(n))
    return np.column_stack([cols[name] for name in SIGNALS])


def _meta_rows(df: pd.DataFrame) -> Iterator[WindowMeta]:
    """WindowMeta per row, reusing one object while the metadata is unchanged."""
    cols = [df[c].astype(object).where(df[c].notna(), None).to_numpy() if c in df.columns
            else np.full(len(df), "SIM" if c == "source" else None, dtype=object) for c in META_COLS]
    last: tuple | None = None
    meta: WindowMeta | None = None
    for values in zip(*cols):
        if values != last:
            vals = [getattr(v, "value", v) for v in values]
            meta = WindowMeta(*[None if v is None else str(v) for v in vals])  # type: ignore[arg-type]
            last = values
        yield meta  # type: ignore[misc]


def samples_from_frame(df: pd.DataFrame) -> Iterator[TelemetrySample]:
    """TelemetrySamples for Pipeline replay, with ground truth stripped."""
    fields = [c for c in df.columns if c in TelemetrySample.model_fields and c != "gt"]
    for rec in df[fields].to_dict("records"):
        if "dtc" in rec:
            rec["dtc"] = [] if rec["dtc"] is None else list(rec["dtc"])
        for k in ("prox_person_m", "prox_truck_m", "bucket_to_truck_m", "shift_id", "task_id", "task_type",
                  "zone", "prox_person_sector", "t_pub_ns"):
            if k in rec and isinstance(rec[k], float) and np.isnan(rec[k]):
                rec[k] = None
        yield TelemetrySample.model_construct(**rec)


# ------------------------------------------------------------------ windows
def extract_windows(df: pd.DataFrame, cfg: dict[str, Any]) -> pd.DataFrame:
    """One row per closed window: metadata + all features (same code path as the edge)."""
    extractor = FeatureExtractor(cfg)
    rows = signal_matrix(df).tolist()
    waiting = waiting_flags(df)
    out: list[dict[str, Any]] = []
    for i, meta in enumerate(_meta_rows(df)):
        w = extractor.push_row(rows[i], meta)
        if w is None:
            continue
        feats = compute_features(w, cfg["features"])
        ckey = context_key(machine_type_for(meta.machine_id, cfg), meta.task_type)
        out.append({"t_start": w.t_start, "t_end": w.t_end, "machine_id": meta.machine_id,
                    "operator_id": meta.operator_id, "shift_id": meta.shift_id, "task_type": meta.task_type,
                    "zone": meta.zone, "variant": w.variant, "waiting": bool(waiting[i]),
                    "context_key": ckey, **feats})
    return pd.DataFrame(out)


def time_split(win: pd.DataFrame, fractions: dict[str, float], purge_s: float) -> tuple[dict[str, pd.DataFrame], dict[str, float]]:
    """Time-ordered train / calibration / test split with purge gaps at each boundary."""
    t = win["t_end"].to_numpy()
    b1 = float(np.quantile(t, fractions["train"]))
    b2 = float(np.quantile(t, fractions["train"] + fractions["calibration"]))
    ts, te = win["t_start"].to_numpy(), win["t_end"].to_numpy()

    def clear(b: float) -> np.ndarray:
        return (te < b - purge_s) | (ts > b + purge_s)

    keep = clear(b1) & clear(b2)
    parts = {"train": win[keep & (te < b1)], "calibration": win[keep & (ts > b1) & (te < b2)],
             "test": win[keep & (ts > b2)]}
    return {k: v.reset_index(drop=True) for k, v in parts.items()}, {"train_end": b1, "test_start": b2}


# ------------------------------------------------------------------ fitting
def _eligible(win: pd.DataFrame, acfg: dict[str, Any]) -> bool:
    return (len(win) >= acfg["min_context_windows"] and win["operator_id"].nunique() >= acfg["min_context_operators"]
            and win["machine_id"].nunique() >= acfg["min_context_machines"])


def _variant_rows(win: pd.DataFrame, variant: str) -> pd.DataFrame:
    """Windows usable for a variant: B uses every window (B features ⊂ BC features)."""
    return win[win["variant"] == "BC"] if variant == "BC" else win


def _scoreable(win: pd.DataFrame, acfg: dict[str, Any]) -> pd.DataFrame:
    return win[win["engine_on_frac"] >= acfg["min_engine_on_frac"]]


def _fit_forest(X: np.ndarray, acfg: dict[str, Any]) -> IsolationForest:
    return IsolationForest(n_estimators=acfg["n_estimators"], max_samples=min(acfg["max_samples"], len(X)),
                           random_state=acfg["random_state"]).fit(X)


def fit_bundle(train: pd.DataFrame, cal: pd.DataFrame, cfg: dict[str, Any], version: str) -> dict[str, Any]:
    """Fit context and machine-type IFs, ECDFs, baselines and routes (thresholds nominal)."""
    acfg = cfg["anomaly"]
    train, cal = _scoreable(train, acfg), _scoreable(cal, acfg)
    bundle: dict[str, Any] = {"version": version, "feature_version": cfg["features"]["version"], "models": {},
                              "ecdf": {}, "baselines": {}, "routes": {}, "fallback_routes": {},
                              "thresholds": {"tau1": cfg["fusion"]["tau1"], "tau2": cfg["fusion"]["tau2"]}}
    for variant in VARIANTS:
        feats = model_features(variant)  # type: ignore[arg-type]
        tr, ca = _variant_rows(train, variant), _variant_rows(cal, variant)
        tr = tr.assign(machine_type=tr["context_key"].str.split("|").str[0])
        for mtype, tr_m in tr.groupby("machine_type"):
            parent = f"{mtype}|*::{variant}"
            _add_model(bundle, parent, tr_m, feats, acfg, "machine_type_fallback")
            ca_m = ca[ca["context_key"].str.startswith(f"{mtype}|")]
            bundle["ecdf"][parent] = _cal_scores(bundle, parent, ca_m, tr_m)
            bundle["fallback_routes"][f"{mtype}::{variant}"] = {"model": parent, "ecdf": parent, "baseline": parent}
            for ckey, tr_c in tr_m.groupby("context_key"):
                ca_c = ca[ca["context_key"] == ckey]
                route = {"model": parent, "ecdf": parent, "baseline": parent}
                if len(tr_c) >= acfg["min_ecdf_windows"]:
                    bkey = f"{ckey}::{variant}"
                    bundle["baselines"][bkey] = fit_baseline(tr_c[feats].to_numpy(float), feats).to_dict()
                    route["baseline"] = bkey
                model_key = f"{ckey}::{variant}"
                if _eligible(tr_c, acfg) and len(ca_c) >= acfg["min_ecdf_windows"]:
                    _add_model(bundle, model_key, tr_c, feats, acfg, "context")
                    bundle["ecdf"][model_key] = _cal_scores(bundle, model_key, ca_c, tr_c)
                    route.update(model=model_key, ecdf=model_key)
                elif len(ca_c) >= acfg["min_ecdf_windows"]:
                    ecdf_key = f"{ckey}::{variant}@parent"
                    bundle["ecdf"][ecdf_key] = _cal_scores(bundle, parent, ca_c, tr_c)
                    route["ecdf"] = ecdf_key
                bundle["routes"][f"{ckey}::{variant}"] = route
    return bundle


def _add_model(bundle: dict[str, Any], key: str, tr: pd.DataFrame, feats: list[str], acfg: dict[str, Any], kind: str) -> None:
    X = tr[feats].to_numpy(float)
    bundle["models"][key] = {"features": feats, "forest": _fit_forest(X, acfg), "kind": kind, "n_train": len(tr),
                             "operators": int(tr["operator_id"].nunique()), "machines": int(tr["machine_id"].nunique())}
    if key.split("::")[0].endswith("|*"):
        bundle["baselines"][key] = fit_baseline(X, feats).to_dict()


def _cal_scores(bundle: dict[str, Any], model_key: str, cal: pd.DataFrame, train: pd.DataFrame) -> np.ndarray:
    """Sorted calibration scores; falls back to training scores if the split is empty."""
    m = bundle["models"][model_key]
    src = cal if len(cal) else train
    return np.sort(CompiledForest(m["forest"]).score(src[m["features"]].to_numpy(float)))


# ------------------------------------------------------------------ alert-budget thresholds
def window_signals(det: AnomalyDetector, win: pd.DataFrame, cfg: dict[str, Any]) -> pd.DataFrame:
    """Per-window q, d, m_E, signature key and robust-z max (the fusion inputs)."""
    rule_map = rule_feature_map(cfg)
    feature_cols = [c for c in win.columns if c in FEATURE_SPECS]
    out = []
    for rec in win.to_dict("records"):
        feats = {k: float(rec[k]) for k in feature_cols if pd.notna(rec[k])}
        res = det.score(feats, rec["context_key"], rec["variant"])
        base = det.baseline(rec["context_key"], rec["variant"])
        if res is None or base is None:
            continue
        gated = gated_features(bool(rec["waiting"]), cfg)
        z = robust_z(feats, base)
        d, _ = direction_indicator(z, gated, cfg["fusion"]["direction"])
        top = signature_of(top_contributions(feats, base, 3, gated))
        zmax = max((risk_oriented(f, v) for f, v in z.items()
                    if f not in gated and FEATURE_SPECS[f].model_input), default=0.0)
        out.append({"t_end": rec["t_end"], "t_start": rec["t_start"], "machine_id": rec["machine_id"],
                    "operator_id": rec["operator_id"], "shift_id": rec["shift_id"], "q": res.q, "d": d,
                    "m_e": exposure(feats, rec["zone"], rec["task_type"], cfg).m_e,
                    "key": signature_key(top, rule_map), "zmax": zmax, "percentile": res.percentile})
    return pd.DataFrame(out).sort_values(["machine_id", "t_end"], kind="stable").reset_index(drop=True)


def simulate_events(sig: pd.DataFrame, values: np.ndarray, tau: float, cooldown_s: float,
                    fusion: FusionEngine | None = None) -> np.ndarray:
    """Event flags per window for a threshold, with the pipeline's cooldown merging and
    (when `fusion` is given) the recurrence bonus per operator × shift × signature."""
    flags = np.zeros(len(sig), dtype=bool)
    until: dict[tuple[str, str], float] = {}
    counts: dict[tuple[Any, ...], int] = {}
    cols = zip(sig["machine_id"], sig["operator_id"], sig["shift_id"], sig["key"], sig["t_end"], values)
    for i, (mach, op, shift, key, t, v) in enumerate(cols):
        if t < until.get((mach, key), -np.inf):
            continue
        ck = (op, shift, key)
        if fusion is not None and v > 0:
            v = v + (fusion.bonus if counts.get(ck, 0) + 1 >= fusion.k_min else 0.0)
        if v >= tau:
            flags[i] = True
            until[(mach, key)] = t + cooldown_s
            counts[ck] = counts.get(ck, 0) + 1
    return flags


def hour_blocks(sig: pd.DataFrame, block_h: float, stride_s: float) -> tuple[np.ndarray, np.ndarray]:
    """Block index per window and operating hours per block (windows × stride)."""
    t0 = sig["t_end"].min()
    labels = sig["machine_id"].astype(str) + ":" + ((sig["t_end"] - t0) // (block_h * 3600)).astype(int).astype(str)
    codes, uniques = pd.factorize(labels)
    hours = np.bincount(codes, minlength=len(uniques)) * stride_s / 3600.0
    return codes, hours


def block_rate_ci(events: np.ndarray, hours: np.ndarray, reps: int, seed: int = 0) -> dict[str, float]:
    """Events per operating hour from per-block counts, with a block-bootstrap 95 % CI."""
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(hours), size=(reps, len(hours)))
    boot = events[idx].sum(axis=1) / np.maximum(hours[idx].sum(axis=1), 1e-9)
    total_h = float(hours.sum())
    return {"rate_per_h": float(events.sum() / max(total_h, 1e-9)), "ci95_lo": float(np.percentile(boot, 2.5)),
            "ci95_hi": float(np.percentile(boot, 97.5)), "events": int(events.sum()), "hours": round(total_h, 3)}


def budget_threshold(sig: pd.DataFrame, values: np.ndarray, budget: float, grid: np.ndarray,
                     cfg: dict[str, Any], fusion: FusionEngine | None, floor: float | None = None) -> tuple[float, dict[str, float]]:
    """Lowest τ on the grid (above `floor`) whose bootstrap upper 95 % bound ≤ budget."""
    acfg = cfg["anomaly"]
    codes, hours = hour_blocks(sig, acfg["bootstrap_block_h"], cfg["window"]["stride_s"])
    stats: dict[str, float] = {}
    for tau in grid:
        if floor is not None and tau <= floor:
            continue
        flags = simulate_events(sig, values, float(tau), cfg["fusion"]["ml_cooldown_s"], fusion)
        counts = np.bincount(codes, weights=flags.astype(float), minlength=len(hours))
        stats = block_rate_ci(counts, hours, acfg["bootstrap_reps"])
        if stats["ci95_hi"] <= budget:
            return float(tau), stats
    return float(grid[-1]), stats


def set_thresholds(bundle: dict[str, Any], cal: pd.DataFrame, cfg: dict[str, Any]) -> pd.DataFrame:
    """Replace nominal τ₁/τ₂ with alert-budget thresholds; return calibration signals."""
    acfg = cfg["anomaly"]
    det = AnomalyDetector(bundle)
    sig = window_signals(det, _scoreable(cal, acfg), cfg)
    g = acfg["tau_grid"]
    grid = np.round(np.arange(g["start"], g["stop"] + 1e-9, g["step"]), 4)
    nominal = FusionEngine(cfg)
    ml_term = (sig["d"] * sig["q"] * sig["m_e"]).to_numpy()
    tau1, s1 = budget_threshold(sig, ml_term, acfg["budget_t1_per_h"], grid, cfg, nominal)
    tau2, s2 = budget_threshold(sig, ml_term, acfg["budget_t2_per_h"], grid, cfg, nominal, floor=tau1)
    z_thr, sz = budget_threshold(sig, sig["zmax"].to_numpy(), acfg["budget_t1_per_h"], np.round(np.arange(1.0, 40.0, 0.1), 3), cfg, None)
    bundle["thresholds"] = {"tau1": tau1, "tau2": tau2, "method": "alert_budget",
                            "budget_t1_per_h": acfg["budget_t1_per_h"], "budget_t2_per_h": acfg["budget_t2_per_h"],
                            "calibration_t1": s1, "calibration_t2": s2,
                            "robust_z_baseline": {"z_threshold": z_thr, "calibration": sz}}
    return sig


# ------------------------------------------------------------------ artifacts
def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def model_card(bundle: dict[str, Any], parts: dict[str, pd.DataFrame], bounds: dict[str, float],
               data_path: Path, data_sha: str, n_samples: int, cfg: dict[str, Any]) -> dict[str, Any]:
    """Model card (training data and every metric labelled SIMULATED)."""
    train = parts["train"]
    return {
        "kind": "iforest", "version": bundle["version"], "label": "SIMULATED",
        "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "intended_use": "Decision support only: context percentile of behaviour windows for risk fusion. "
                        "ML alone never raises an in-cab alert.",
        "training_data": {"source": "SIMULATED", "file": data_path.name, "sha256": data_sha, "n_samples": n_samples,
                          "n_windows": {k: len(v) for k, v in parts.items()},
                          "operators": sorted(train["operator_id"].dropna().unique().tolist()),
                          "machines": sorted(train["machine_id"].dropna().unique().tolist()),
                          "contexts": sorted(train["context_key"].unique().tolist())},
        "split": {"method": "time-ordered 60/20/20 with purge + embargo of one window length", **bounds},
        "features": {v: model_features(v) for v in VARIANTS}, "feature_version": cfg["features"]["version"],
        "window": cfg["window"], "fusion_version": cfg["version"],
        "hyperparameters": {k: cfg["anomaly"][k] for k in ("n_estimators", "max_samples", "random_state")},
        "contamination": "not used; thresholds come from the alert budget",
        "models": {k: {kk: vv for kk, vv in m.items() if kk != "forest"} for k, m in bundle["models"].items()},
        "routes": bundle["routes"], "fallback_routes": bundle["fallback_routes"],
        "ecdf_sizes": {k: int(len(v)) for k, v in bundle["ecdf"].items()},
        "thresholds": bundle["thresholds"],
        "limits": [
            "Trained and evaluated on SIMULATED telemetry only; no claim about real unsafe behaviour.",
            "Percentiles are approximate: overlapping windows are autocorrelated.",
            "Contexts below the minimum-data rule use the machine-type model (fallback).",
            "Not a probability of incident; relevance calibration needs reviewer labels.",
        ],
    }


def write_artifacts(bundle: dict[str, Any], card: dict[str, Any], root: Path) -> Path:
    """Write model.joblib + model_card.json under root/<version>/ and point LATEST at it."""
    out = root / bundle["version"]
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, out / MODEL_FILE)
    card["sha256"] = {MODEL_FILE: sha256_of(out / MODEL_FILE)}
    (out / CARD_FILE).write_text(json.dumps(card, indent=2, default=str), encoding="utf-8")
    (root / LATEST_FILE).write_text(bundle["version"], encoding="utf-8")
    return out


def train(data_path: Path, out_root: Path, cfg: dict[str, Any] | None = None) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    """Full training run on one parquet file; returns (version dir, card, split info)."""
    cfg = cfg or load_yaml("fusion")
    df = load_frame(data_path)
    data_sha = sha256_of(data_path)
    version = f"{cfg['anomaly']['version_prefix']}-{data_sha[:8]}"
    t = time.perf_counter()
    win = extract_windows(df, cfg)
    log.info("Extracted %d windows from %d samples in %.1f s", len(win), len(df), time.perf_counter() - t)
    parts, bounds = time_split(win, cfg["anomaly"]["split"], cfg["window"]["length_s"])
    bundle = fit_bundle(parts["train"], parts["calibration"], cfg, version)
    set_thresholds(bundle, parts["calibration"], cfg)
    log.info("Thresholds: tau1=%.2f tau2=%.2f", bundle["thresholds"]["tau1"], bundle["thresholds"]["tau2"])
    card = model_card(bundle, parts, bounds, data_path, data_sha, len(df), cfg)
    out = write_artifacts(bundle, card, out_root)
    return out, card, {"bounds": bounds, "parts": parts}


def main(argv: list[str] | None = None) -> Path | None:
    """Train, calibrate and evaluate; returns the model version dir, or None if data is pending."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", type=Path, default=BASELINE_FILE)
    ap.add_argument("--out", type=Path, default=DEFAULT_ROOT)
    ap.add_argument("--no-eval", action="store_true")
    ap.add_argument("--eval-hours", type=float, default=6.0, help="machine-hours of test data per replay")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if not ensure_dataset(args.data):
        log.warning("Training pending: %s not available (run `python -m sentinel.sim.datasets`)", args.data)
        return None
    out, card, split = train(args.data, args.out)
    if not args.no_eval:
        from ml.eval.injected_eval import evaluate
        report = evaluate(out, args.data, split["bounds"], max_hours=args.eval_hours)
        card["metrics"] = report["summary"]
        (out / CARD_FILE).write_text(json.dumps(card, indent=2, default=str), encoding="utf-8")
    log.info("Model written to %s", out)
    return out


if __name__ == "__main__":
    main()
