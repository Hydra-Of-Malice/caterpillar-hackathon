"""Feature drift: population stability index (PSI) per context and feature from feature_window rows.

Reference = the earliest `reference_fraction` of windows in a context; current = the rest. Bins are
reference deciles. PSI < 0.10 stable, 0.10–0.25 moderate, > 0.25 significant (conventional cut-offs).
"""
from __future__ import annotations

from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared.config import load_yaml
from sentinel.store.models import FeatureWindowRow

EPS = 1e-4


def psi(reference: np.ndarray, current: np.ndarray, bins: int) -> float:
    """PSI of `current` against `reference` using reference quantile bins."""
    edges = np.unique(np.quantile(reference, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    ref = np.histogram(reference, edges)[0] / len(reference)
    cur = np.histogram(current, edges)[0] / len(current)
    ref, cur = np.clip(ref, EPS, None), np.clip(cur, EPS, None)
    return float(np.sum((cur - ref) * np.log(cur / ref)))


def _status(value: float, cfg: dict[str, Any]) -> str:
    if value > cfg["significant"]:
        return "significant"
    return "moderate" if value > cfg["moderate"] else "stable"


def drift_report(s: Session, context_key: str | None = None) -> dict[str, Any]:
    cfg = load_yaml("cloud")["monitoring"]["psi"]
    rows = s.scalars(select(FeatureWindowRow).order_by(FeatureWindowRow.t_end))
    by_context: dict[str, list[FeatureWindowRow]] = {}
    for r in rows:
        if context_key is None or r.context_key == context_key:
            by_context.setdefault(r.context_key, []).append(r)
    contexts = []
    for key, windows in sorted(by_context.items()):
        split = int(len(windows) * float(cfg["reference_fraction"]))
        ref, cur = windows[:split], windows[split:]
        if min(len(ref), len(cur)) < int(cfg["min_windows"]):
            contexts.append({"context_key": key, "n_reference": len(ref), "n_current": len(cur),
                             "status": "insufficient_data", "features": []})
            continue
        names = sorted({f for w in windows for f in ((w.data or {}).get("features") or {})})
        feats = []
        for name in names:
            a = np.array([w.data["features"][name] for w in ref if name in (w.data.get("features") or {})])
            b = np.array([w.data["features"][name] for w in cur if name in (w.data.get("features") or {})])
            if len(a) and len(b):
                value = psi(a, b, int(cfg["bins"]))
                feats.append({"feature": name, "psi": round(value, 4), "status": _status(value, cfg),
                              "reference_mean": round(float(a.mean()), 4), "current_mean": round(float(b.mean()), 4)})
        worst = max((f["psi"] for f in feats), default=0.0)
        contexts.append({"context_key": key, "n_reference": len(ref), "n_current": len(cur),
                         "reference_until": ref[-1].t_end, "max_psi": round(worst, 4), "status": _status(worst, cfg),
                         "features": sorted(feats, key=lambda f: -f["psi"])})
    return {"contexts": contexts, "thresholds": {"moderate": cfg["moderate"], "significant": cfg["significant"]},
            "method": "PSI, reference-decile bins", "version": load_yaml("cloud")["monitoring"]["version"],
            "label": "SIMULATED"}
