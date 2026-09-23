"""Task-time model artefacts: quantile boosters, CQR offsets, baseline statistics (09 §7).

Artefacts live in ``models/tasktime/<version>/``:
``model.q10.txt``, ``model.q50.txt``, ``model.q90.txt`` (LightGBM boosters, target log(min/unit)),
``model.meta.json`` (features, categories, CQR offsets, baseline, similar-task index) and
``model_card.json`` (SIMULATED training data, metrics, limits, sha256).
"""
from __future__ import annotations

import bisect
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from sentinel.shared import config

KIND = "tasktime"
QUANTILES = {"q10": 0.1, "q50": 0.5, "q90": 0.9}
NOMINAL_COVERAGE = 0.8
LOW_DATA_MIN_SIMILAR = 30           # 09 §7 cold start rule 1
MONDRIAN_MIN_CAL = 50               # per-type CQR only with >= 50 calibration tasks of that type
SIMILAR_QTY_RATIO = 2.0             # "similar" = same type + material, quantity within ×/÷ 2
LOW_DATA_WIDEN = 1.5                # low-data fallback widens the empirical log-rate band by 50 %
Z90 = 1.2816                        # standard-normal 90th percentile


def models_root() -> Path:
    return config.MODELS_DIR / KIND


def log_rate(duration_min: float, qty: float) -> float:
    return math.log(max(duration_min, 1e-6) / max(qty, 1e-6))


# ------------------------------------------------------------------ baseline + similar index
@dataclass
class BaselineStats:
    """Per-type empirical log-rate quantiles and a per (type, material) sorted-quantity index."""
    per_type: dict[str, dict[str, float]]
    similar: dict[str, list[float]] = field(default_factory=dict)

    @classmethod
    def from_records(cls, records: list[dict[str, Any]]) -> "BaselineStats":
        by_type: dict[str, list[float]] = {}
        similar: dict[str, list[float]] = {}
        for r in records:
            f = r["features"]
            by_type.setdefault(r["task_type"], []).append(log_rate(r["duration_min"], f["qty"]))
            similar.setdefault(f"{r['task_type']}|{f['material']}", []).append(float(f["qty"]))
        per_type = {
            t: {"median_lr": float(np.median(v)), "p10_lr": float(np.quantile(v, 0.1)),
                "p90_lr": float(np.quantile(v, 0.9)), "n": len(v)}
            for t, v in by_type.items()
        }
        return cls(per_type, {k: sorted(v) for k, v in similar.items()})

    def n_similar(self, task_type: str, material: str, qty: float) -> int:
        qtys = self.similar.get(f"{task_type}|{material}", [])
        lo = bisect.bisect_left(qtys, qty / SIMILAR_QTY_RATIO)
        hi = bisect.bisect_right(qtys, qty * SIMILAR_QTY_RATIO)
        return hi - lo

    def to_dict(self) -> dict[str, Any]:
        return {"per_type": self.per_type, "similar": self.similar}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "BaselineStats":
        return cls(d["per_type"], d.get("similar", {}))


# ------------------------------------------------------------------ quantiles + CQR
def non_crossing(q: np.ndarray) -> np.ndarray:
    """Sort each row's (q10, q50, q90) so the quantiles can never cross."""
    return np.sort(q, axis=1)


def cqr_offset(lo: np.ndarray, hi: np.ndarray, y: np.ndarray, coverage: float = NOMINAL_COVERAGE) -> float:
    """Split-conformal CQR offset Q̂ (Romano et al. 2019): the ⌈(n+1)·coverage⌉-th smallest E_i."""
    scores = np.sort(np.maximum(lo - y, y - hi))
    k = math.ceil((len(scores) + 1) * coverage)
    return float(scores[min(k, len(scores)) - 1])


def fit_cqr(q: np.ndarray, y: np.ndarray, types: list[str], coverage: float = NOMINAL_COVERAGE) -> dict[str, Any]:
    """Global offset plus Mondrian (per-type) offsets where the calibration split is large enough."""
    types_arr = np.asarray(types)
    out: dict[str, Any] = {"global": cqr_offset(q[:, 0], q[:, 2], y, coverage), "per_type": {}, "n_cal": {}}
    for t in sorted(set(types)):
        m = types_arr == t
        out["n_cal"][t] = int(m.sum())
        if m.sum() >= MONDRIAN_MIN_CAL:
            out["per_type"][t] = cqr_offset(q[m, 0], q[m, 2], y[m], coverage)
    return out


def apply_cqr(q: np.ndarray, types: list[str], cqr: dict[str, Any]) -> np.ndarray:
    """Widen [q10, q90] by the type's offset; P50 unchanged; bounds clamped so nothing crosses."""
    out = q.copy()
    for i, t in enumerate(types):
        off = cqr["per_type"].get(t, cqr["global"])
        out[i, 0] = min(q[i, 0] - off, q[i, 1])
        out[i, 2] = max(q[i, 2] + off, q[i, 1])
    return out


# ------------------------------------------------------------------ bundle
@dataclass
class ModelBundle:
    version: str
    boosters: dict[str, lgb.Booster]
    cqr: dict[str, Any]
    baseline: BaselineStats
    use_model: bool = True
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def model_version(self) -> str:
        return f"tasktime-lgbm-cqr@{self.version}"

    def predict_log(self, X: np.ndarray, types: list[str]) -> np.ndarray:
        """Calibrated, non-crossing (q10, q50, q90) of log(minutes per unit)."""
        raw = np.column_stack([self.boosters[k].predict(X) for k in QUANTILES])
        return apply_cqr(non_crossing(raw), types, self.cqr)

    def p50_contributions(self, X: np.ndarray) -> np.ndarray:
        """TreeSHAP contributions of the P50 booster, log space; last column is the bias."""
        return np.asarray(self.boosters["q50"].predict(X, pred_contrib=True))

    def save(self, directory: Path) -> dict[str, str]:
        """Write boosters + meta; returns {filename: path} of written files."""
        directory.mkdir(parents=True, exist_ok=True)
        written: dict[str, str] = {}
        for key, booster in self.boosters.items():
            path = directory / f"model.{key}.txt"
            booster.save_model(str(path))
            written[path.name] = str(path)
        meta = {**self.meta, "version": self.version, "model_version": self.model_version,
                "cqr": self.cqr, "baseline": self.baseline.to_dict(), "use_model": self.use_model}
        meta_path = directory / "model.meta.json"
        meta_path.write_text(json.dumps(meta, indent=1), encoding="utf-8")
        written[meta_path.name] = str(meta_path)
        return written

    @classmethod
    def load(cls, directory: Path) -> "ModelBundle":
        meta = json.loads((directory / "model.meta.json").read_text(encoding="utf-8"))
        boosters = {k: lgb.Booster(model_file=str(directory / f"model.{k}.txt")) for k in QUANTILES}
        return cls(version=meta["version"], boosters=boosters, cqr=meta["cqr"],
                   baseline=BaselineStats.from_dict(meta["baseline"]),
                   use_model=bool(meta.get("use_model", True)), meta=meta)


def _version_key(name: str) -> tuple[int, ...]:
    try:
        return tuple(int(p) for p in name.split("."))
    except ValueError:
        return (-1,)


def latest_version_dir(root: Path | None = None) -> Path | None:
    """Highest semantic-version directory under models/tasktime/ that holds a complete bundle."""
    root = root or models_root()
    if not root.exists():
        return None
    dirs = [d for d in root.iterdir() if d.is_dir() and (d / "model.meta.json").exists()]
    return max(dirs, key=lambda d: _version_key(d.name)) if dirs else None
