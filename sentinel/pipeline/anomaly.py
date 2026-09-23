"""Isolation Forest anomaly scoring per context × sensor variant (04 §3, §6, §8).

Artifacts live in models/iforest/<version>/ (model.joblib + model_card.json); an optional
models/iforest/LATEST file names the active version. The bundle holds:

- models:    Isolation Forests keyed "<context_key>::<variant>" (context model) or
             "<machine_type>|*::<variant>" (broader machine-type fallback).
- ecdf:      sorted held-out calibration scores per context (or the parent ECDF).
- baselines: per-feature median / robust scale for explanations.
- routes:    context × variant -> which model, ECDF and baseline serve it.
- thresholds: tau1 / tau2 set by the alert budget, not by `contamination`.

A missing or unreadable model yields `None` from `AnomalyDetector.load`, and the
pipeline runs in rules-only mode.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from sentinel.pipeline.explain import Baseline
from sentinel.shared.config import MODELS_DIR

log = logging.getLogger(__name__)

MODEL_FILE = "model.joblib"
CARD_FILE = "model_card.json"
LATEST_FILE = "LATEST"
DEFAULT_ROOT = MODELS_DIR / "iforest"


def average_path_length(n: np.ndarray) -> np.ndarray:
    """Expected path length c(n) of an unsuccessful BST search (Liu et al. 2008)."""
    n = np.asarray(n, dtype=float)
    out = np.zeros_like(n)
    out[n == 2] = 1.0
    big = n > 2
    out[big] = 2.0 * (np.log(n[big] - 1.0) + np.euler_gamma) - 2.0 * (n[big] - 1.0) / n[big]
    return out


class CompiledForest:
    """Flat-array Isolation Forest scorer; matches `IsolationForest.score_samples`.

    scikit-learn scores a single row in ~10 ms; this vectorised traversal takes well under
    1 ms, which keeps per-window latency inside the 50 ms budget (13 M16).
    """

    def __init__(self, forest: IsolationForest) -> None:
        trees = [est.tree_ for est in forest.estimators_]
        n_nodes = max(t.node_count for t in trees)
        n_trees = len(trees)
        self.left = np.zeros((n_trees, n_nodes), dtype=np.int64)
        self.right = np.zeros((n_trees, n_nodes), dtype=np.int64)
        self.feature = np.zeros((n_trees, n_nodes), dtype=np.int64)
        self.threshold = np.full((n_trees, n_nodes), np.inf)
        self.leaf_value = np.zeros((n_trees, n_nodes))
        self.depth = 0
        for i, t in enumerate(trees):
            self._compile(i, t)
        self.norm = n_trees * float(average_path_length(np.array([forest.max_samples_]))[0])
        self._rows = np.arange(n_trees)

    def _compile(self, i: int, t: Any) -> None:
        n = t.node_count
        left, right = t.children_left, t.children_right
        is_leaf = left == -1
        idx = np.arange(n)
        self.left[i, :n] = np.where(is_leaf, idx, left)
        self.right[i, :n] = np.where(is_leaf, idx, right)
        self.feature[i, :n] = np.where(is_leaf, 0, t.feature)
        self.threshold[i, :n] = np.where(is_leaf, np.inf, t.threshold)
        depth = np.zeros(n, dtype=float)
        for node in range(n):                      # parents precede children in sklearn trees
            if not is_leaf[node]:
                depth[left[node]] = depth[right[node]] = depth[node] + 1
        self.leaf_value[i, :n] = np.where(is_leaf, depth + average_path_length(t.n_node_samples), 0.0)
        self.depth = max(self.depth, int(depth.max()))

    def score(self, X: np.ndarray) -> np.ndarray:
        """Anomaly score s = -score_samples(X): higher is more anomalous, in (-1, -0.5]…(0.5, 1)."""
        X = np.asarray(X, dtype=np.float32).astype(np.float64)
        n = X.shape[0]
        node = np.zeros((n, len(self._rows)), dtype=np.int64)
        rows = self._rows[None, :]
        samples = np.arange(n)[:, None]
        for _ in range(self.depth + 1):
            feat = self.feature[rows, node]
            go_left = X[samples, feat] <= self.threshold[rows, node]
            node = np.where(go_left, self.left[rows, node], self.right[rows, node])
        depths = self.leaf_value[rows, node].sum(axis=1)
        return 2.0 ** (-depths / self.norm)


@dataclass(frozen=True)
class AnomalyResult:
    """Calibrated anomaly result for one window."""
    score: float           # raw IF score (higher = more anomalous)
    pvalue: float          # (1 + #{s_cal >= s}) / (n + 1)
    percentile: float      # 1 - pvalue
    q: float               # surprise -log10(pvalue)
    model_key: str
    ecdf_key: str
    fallback: bool         # served by the broader machine-type model
    unfamiliar: bool       # context not seen in training (route from machine-type fallback)
    model_version: str


def ecdf_pvalue(sorted_scores: np.ndarray, s: float) -> float:
    """Conformal-style p-value of score s against sorted calibration scores."""
    n = len(sorted_scores)
    n_ge = n - int(np.searchsorted(sorted_scores, s, side="left"))
    return (1.0 + n_ge) / (n + 1.0)


def resolve_model_dir(models_dir: Path | None) -> Path | None:
    """Find a version directory: the dir itself, LATEST, or the newest versioned subdir."""
    root = Path(models_dir) if models_dir is not None else DEFAULT_ROOT
    if (root / MODEL_FILE).is_file():
        return root
    latest = root / LATEST_FILE
    if latest.is_file():
        cand = root / latest.read_text(encoding="utf-8").strip()
        if (cand / MODEL_FILE).is_file():
            return cand
    if root.is_dir():
        versions = sorted(p for p in root.iterdir() if (p / MODEL_FILE).is_file())
        if versions:
            return versions[-1]
    return None


class AnomalyDetector:
    """Serves calibrated Isolation Forest scores with context → machine-type fallback."""

    def __init__(self, bundle: dict[str, Any], path: Path | None = None) -> None:
        self.bundle = bundle
        self.path = path
        self.version: str = bundle["version"]
        self.thresholds: dict[str, float] = {k: float(v) for k, v in bundle["thresholds"].items()
                                             if k in ("tau1", "tau2")}
        self.feature_lists: dict[str, list[str]] = {k: m["features"] for k, m in bundle["models"].items()}
        self._compiled = {k: CompiledForest(m["forest"]) for k, m in bundle["models"].items()}
        self._baselines = {k: Baseline.from_dict(b) for k, b in bundle["baselines"].items()}

    @classmethod
    def load(cls, models_dir: Path | None = None) -> "AnomalyDetector | None":
        """Load the active model; return None (rules-only mode) if none is usable."""
        path = resolve_model_dir(models_dir)
        if path is None:
            log.warning("No Isolation Forest model under %s: running in rules-only mode",
                        models_dir or DEFAULT_ROOT)
            return None
        try:
            return cls(joblib.load(path / MODEL_FILE), path)
        except Exception:  # noqa: BLE001 — any unreadable artifact degrades to rules-only
            log.exception("Failed to load Isolation Forest model from %s: rules-only mode", path)
            return None

    def route(self, context_key: str, variant: str) -> tuple[dict[str, str], bool] | None:
        """(route, unfamiliar) for a context and variant, backing off B+C → B if needed."""
        machine_type = context_key.split("|", 1)[0]
        for v in ([variant, "B"] if variant == "BC" else [variant]):
            route = self.bundle["routes"].get(f"{context_key}::{v}")
            if route is not None:
                return route, False
            route = self.bundle["fallback_routes"].get(f"{machine_type}::{v}")
            if route is not None:
                return route, True
        return None

    def baseline(self, context_key: str, variant: str) -> Baseline | None:
        """Explanation baseline serving this context and variant, if any."""
        found = self.route(context_key, variant)
        return self._baselines[found[0]["baseline"]] if found else None

    def score(self, features: dict[str, float], context_key: str, variant: str) -> AnomalyResult | None:
        """Score one window's features; None if no model serves this context."""
        found = self.route(context_key, variant)
        if found is None:
            return None
        route, unfamiliar = found
        key = route["model"]
        x = np.array([[features.get(f, 0.0) for f in self.feature_lists[key]]])
        s = float(self._compiled[key].score(x)[0])
        p = ecdf_pvalue(self.bundle["ecdf"][route["ecdf"]], s)
        return AnomalyResult(
            score=s, pvalue=p, percentile=1.0 - p, q=-math.log10(p), model_key=key,
            ecdf_key=route["ecdf"], fallback=key.split("::")[0].endswith("|*"),
            unfamiliar=unfamiliar, model_version=self.version,
        )
