"""Train the task-time model (R5): LightGBM quantile P10/P50/P90 + CQR on SIMULATED history.

    .venv\\Scripts\\python -m ml.train_tasktime [--n 1500] [--seed 42] [--version 1.0.0]

Split in time order (09 §6): oldest 60 % train → next 20 % calibration (CQR) → latest 20 % test.
Target y = log(duration_min / qty); quantiles are equivariant, so P_q(duration) = qty·exp(P_q(y)).
Writes models/tasktime/<version>/ (boosters, meta, model_card.json). All metrics are SIMULATED.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from sentinel.eta.features import CATEGORIES, FEATURES, encode_many
from sentinel.eta.history import generate_history
from sentinel.eta.model import (NOMINAL_COVERAGE, QUANTILES, BaselineStats, ModelBundle, fit_cqr, log_rate,
                                models_root, non_crossing)

log = logging.getLogger("ml.train_tasktime")

VERSION = "1.0.0"
MAE_IMPROVEMENT_TARGET = 0.15      # AC5.3: ship the model only if P50 MAE beats the median baseline by 15 %
PARAMS = {"learning_rate": 0.05, "num_leaves": 7, "min_data_in_leaf": 40, "feature_fraction": 0.9,
          "bagging_fraction": 0.9, "bagging_freq": 1, "lambda_l2": 1.0, "seed": 42, "deterministic": True,
          "force_row_wise": True, "verbose": -1}
NUM_ROUNDS = 200


def load_history(n: int, seed: int) -> list[dict[str, Any]]:
    """Seeded task_history rows from the edge DB when present, otherwise generated in memory."""
    try:
        from sentinel.store.db import Database
        from sentinel.store.models import TaskHistoryRow

        with Database.edge().session() as s:
            rows = s.query(TaskHistoryRow).order_by(TaskHistoryRow.completed_at).all()
            if len(rows) >= 200:
                return [{"task_type": r.task_type, "features": r.features, "duration_min": r.duration_min,
                         "completed_at": r.completed_at} for r in rows]
    except Exception:                                       # no DB yet → same generator the seed uses
        log.info("edge DB task_history unavailable; generating history in memory")
    return generate_history(n=n, seed=seed)


def time_split(records: list[dict[str, Any]]) -> tuple[list, list, list]:
    records = sorted(records, key=lambda r: r["completed_at"])
    a, b = int(len(records) * 0.6), int(len(records) * 0.8)
    return records[:a], records[a:b], records[b:]


def _xy(records: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray, list[str], np.ndarray]:
    feats = [r["features"] for r in records]
    y = np.asarray([log_rate(r["duration_min"], r["features"]["qty"]) for r in records])
    qty = np.asarray([r["features"]["qty"] for r in records], dtype=float)
    return encode_many(feats), y, [r["task_type"] for r in records], qty


def fit_boosters(X: np.ndarray, y: np.ndarray) -> dict[str, lgb.Booster]:
    cat_idx = [FEATURES.index(c) for c in CATEGORIES]
    boosters = {}
    for key, alpha in QUANTILES.items():
        ds = lgb.Dataset(X, y, feature_name=FEATURES, categorical_feature=cat_idx, free_raw_data=False)
        params = {**PARAMS, "objective": "quantile", "alpha": alpha}
        boosters[key] = lgb.train(params, ds, num_boost_round=NUM_ROUNDS)
    return boosters


def pinball(y: np.ndarray, q: np.ndarray, alpha: float) -> float:
    d = y - q
    return float(np.mean(np.maximum(alpha * d, (alpha - 1) * d)))


def _interval_metrics(y_min: np.ndarray, lo: np.ndarray, mid: np.ndarray, hi: np.ndarray) -> dict[str, float]:
    return {"coverage": round(float(np.mean((y_min >= lo) & (y_min <= hi))), 3),
            "mean_width_min": round(float(np.mean(hi - lo)), 1),
            "mean_rel_width": round(float(np.mean((hi - lo) / mid)), 3), "n": int(len(y_min))}


def evaluate(bundle: ModelBundle, baseline: BaselineStats, test: list[dict[str, Any]]) -> dict[str, Any]:
    """Coverage/width per type, pinball loss, P50 MAE vs the per-type median baseline (M11, AC5.2–5.3)."""
    X, y, types, qty = _xy(test)
    raw = non_crossing(np.column_stack([bundle.boosters[k].predict(X) for k in QUANTILES]))
    cal = bundle.predict_log(X, types)
    y_min = qty * np.exp(y)
    m_lo, m_mid, m_hi = (qty * np.exp(cal[:, i]) for i in range(3))
    stats = [baseline.per_type[t] for t in types]
    b_mid = qty * np.exp([s["median_lr"] for s in stats])
    b_lo = qty * np.exp([s["p10_lr"] for s in stats])
    b_hi = qty * np.exp([s["p90_lr"] for s in stats])
    types_arr = np.asarray(types)

    def block(mask: np.ndarray) -> dict[str, Any]:
        mae_m = float(np.mean(np.abs(m_mid[mask] - y_min[mask])))
        mae_b = float(np.mean(np.abs(b_mid[mask] - y_min[mask])))
        return {
            **_interval_metrics(y_min[mask], m_lo[mask], m_mid[mask], m_hi[mask]),
            "coverage_before_cqr": round(float(np.mean((y[mask] >= raw[mask, 0]) & (y[mask] <= raw[mask, 2]))), 3),
            "mae_p50_min": round(mae_m, 1), "mae_baseline_min": round(mae_b, 1),
            "mae_improvement": round(1.0 - mae_m / mae_b, 3),
            "baseline_interval": _interval_metrics(y_min[mask], b_lo[mask], b_mid[mask], b_hi[mask]),
        }

    overall = block(np.ones(len(y), dtype=bool))
    overall["pinball_log"] = {k: round(pinball(y, cal[:, i], a), 4) for i, (k, a) in enumerate(QUANTILES.items())}
    return {"overall": overall, "per_type": {t: block(types_arr == t) for t in sorted(set(types))}}


def _sha256(path: str) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _model_card(bundle: ModelBundle, metrics: dict, counts: dict, files: dict[str, str], seed: int) -> dict:
    return {
        "kind": "tasktime", "version": bundle.version, "model_version": bundle.model_version,
        "label": "SIMULATED",
        "training_data": f"SIMULATED task history, sentinel.eta.history.generate_history(seed={seed}); "
                         "not Caterpillar data",
        "target": "log(duration_min / qty); P_q(duration) = qty * exp(P_q(target))",
        "method": "LightGBM objective=quantile at alpha 0.1/0.5/0.9, rows sorted (non-crossing), "
                  "CQR offset from a later-in-time calibration split (Mondrian per type if >= 50 tasks)",
        "features": FEATURES, "categories": CATEGORIES,
        "split": "time-ordered 60/20/20: train -> calibration -> test", "counts": counts,
        "nominal_coverage": NOMINAL_COVERAGE, "cqr": bundle.cqr, "metrics": metrics,
        "use_model": bundle.use_model,
        "acceptance": {"AC5.2_coverage_0.75_0.85": 0.75 <= metrics["overall"]["coverage"] <= 0.85,
                       "AC5.3_mae_improvement_ge_0.15": metrics["overall"]["mae_improvement"] >= MAE_IMPROVEMENT_TARGET},
        "fallbacks": {"low_data": "< 30 similar tasks (same type + material, qty within x/÷2): "
                                  "median rate by type x qty, empirical P10-P90 widened 1.5x",
                      "no_history": "cycles = qty / (1.2 m3 x 0.85) x 20 s (+35 % truck waits), band +/-50 %"},
        "limits": ["Trained only on SIMULATED history; effect sizes are generator hypotheses",
                   "CQR coverage is marginal, not conditional on operator or task",
                   "No truck-dispatch feature: waiting is folded into noise",
                   "No monotone constraints: LightGBM does not support them with the quantile objective",
                   "Remaining-time update uses a Normal-Normal pace model, not a trained model"],
        "sha256": {name: _sha256(path) for name, path in files.items()},
        "created_at": time.time(),
    }


def _register(bundle: ModelBundle, directory: Path, card: dict) -> None:
    """Record the bundle in the edge model_registry (best effort)."""
    try:
        from sentinel.store.db import Database
        from sentinel.store.models import ModelRegistryRow

        with Database.edge().session() as s:
            s.merge(ModelRegistryRow(model_id=bundle.model_version, kind="tasktime", context_key=None,
                                     version=bundle.version, sha256=card["sha256"]["model.q50.txt"],
                                     path=str(directory), card=card, active=True))
    except Exception:
        log.warning("could not register the task-time model in the edge DB", exc_info=True)


def train(n: int = 1500, seed: int = 42, version: str = VERSION, out_root: Path | None = None,
          records: list[dict[str, Any]] | None = None, register: bool = True) -> dict[str, Any]:
    """Train, calibrate, evaluate and save; returns the model card."""
    records = records if records is not None else load_history(n, seed)
    train_rows, cal_rows, test_rows = time_split(records)
    X_tr, y_tr, _, _ = _xy(train_rows)
    boosters = fit_boosters(X_tr, y_tr)
    X_cal, y_cal, t_cal, _ = _xy(cal_rows)
    raw_cal = non_crossing(np.column_stack([boosters[k].predict(X_cal) for k in QUANTILES]))
    cqr = fit_cqr(raw_cal, y_cal, t_cal)
    baseline = BaselineStats.from_records(train_rows)
    bundle = ModelBundle(version=version, boosters=boosters, cqr=cqr, baseline=baseline,
                         meta={"features": FEATURES, "categories": CATEGORIES, "quantiles": QUANTILES})
    metrics = evaluate(bundle, baseline, test_rows)
    bundle.use_model = metrics["overall"]["mae_improvement"] >= MAE_IMPROVEMENT_TARGET
    bundle.baseline = BaselineStats.from_records(records)     # similar-task index + fallback over all history
    directory = (out_root or models_root()) / version
    files = bundle.save(directory)
    card = _model_card(bundle, metrics, {"train": len(train_rows), "calibration": len(cal_rows),
                                         "test": len(test_rows)}, files, seed)
    (directory / "model_card.json").write_text(json.dumps(card, indent=1), encoding="utf-8")
    if register:
        _register(bundle, directory, card)
    return card


def robustness(seeds: range, n: int) -> dict[str, Any]:
    """Test coverage / MAE gain when the whole pipeline is re-run on other SIMULATED histories."""
    import tempfile

    cov, gain = [], []
    for seed in seeds:
        card = train(n=n, seed=seed, out_root=Path(tempfile.mkdtemp()), records=generate_history(n, seed),
                     register=False)
        cov.append(card["metrics"]["overall"]["coverage"])
        gain.append(card["metrics"]["overall"]["mae_improvement"])
    return {"seeds": list(seeds), "coverage_mean": round(float(np.mean(cov)), 3),
            "coverage_sd": round(float(np.std(cov)), 3), "coverage_min": min(cov), "coverage_max": max(cov),
            "mae_improvement_mean": round(float(np.mean(gain)), 3), "label": "SIMULATED"}


def _print_summary(card: dict) -> None:
    o = card["metrics"]["overall"]
    print(f"[SIMULATED] task-time {card['model_version']}  -> {'model' if card['use_model'] else 'BASELINE'}")
    print(f"  test coverage {o['coverage']:.3f} (nominal {NOMINAL_COVERAGE}, before CQR {o['coverage_before_cqr']:.3f}), "
          f"rel width {o['mean_rel_width']:.2f}; P50 MAE {o['mae_p50_min']} min vs baseline "
          f"{o['mae_baseline_min']} min ({o['mae_improvement']:+.0%})")
    for t, m in card["metrics"]["per_type"].items():
        print(f"  {t:14s} n={m['n']:3d} coverage {m['coverage']:.3f} rel width {m['mean_rel_width']:.2f} "
              f"MAE {m['mae_p50_min']} vs {m['mae_baseline_min']} ({m['mae_improvement']:+.0%})")


def main() -> None:
    """Entry point used by ml.train_all."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--version", default=VERSION)
    args, _ = ap.parse_known_args()
    card = train(n=args.n, seed=args.seed, version=args.version)
    card["robustness"] = robustness(range(1, 6), args.n)
    path = models_root() / args.version / "model_card.json"
    path.write_text(json.dumps(card, indent=1), encoding="utf-8")
    _print_summary(card)
    r = card["robustness"]
    print(f"  robustness over seeds {r['seeds']}: coverage {r['coverage_mean']:.3f} ± {r['coverage_sd']:.3f} "
          f"(min {r['coverage_min']:.3f}, max {r['coverage_max']:.3f}), MAE gain {r['mae_improvement_mean']:+.0%}")


if __name__ == "__main__":
    main()
