"""Expert-likeness scoring: a one-class Gaussian mixture over standardised cycle metrics.

The log-likelihood of a cycle under the expert mixture is calibrated against the ECDF of
(SIMULATED, safety-filtered) expert cycles: above the expert median the score follows the ECDF
(median -> 90, best -> 100). Below it, the score decays as 90 * exp(-a * gap ** b), with a and
b fixed by two anchors: the expert P10 maps to 78, and a virtual cycle sitting ANCHOR_BAND_WIDTHS
band-widths outside the expert P10-P90 band on every metric maps to 40. The second anchor keeps
the scale meaningful however tight the expert group is. Safety flags are gates: a flagged cycle
never scores above SAFETY_SCORE_CAP, however fast it is.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from sklearn.mixture import GaussianMixture

from sentinel.practice.metrics import MetricDistribution
from sentinel.practice.settings import (
    ANCHOR_BAND_WIDTHS, ANCHOR_SCORE, EXPERT_MEDIAN_SCORE, EXPERT_P10_SCORE, SAFETY_SCORE_CAP, SCORE_BANDS,
    SESSION_FLAGGED_CAP, SESSION_MANY_FLAGS_FRAC,
)

Z_KNEE = 2.0          # |z| beyond which deviations are log-compressed


@dataclass
class ExpertScorer:
    """Gaussian mixture of expert metric vectors + two-anchor ECDF calibration to 0..100."""
    names: list[str]
    dists: dict[str, MetricDistribution]
    gmm: GaussianMixture
    ll_sorted: np.ndarray
    alpha: float
    beta: float
    ll_p50: float

    @classmethod
    def fit(cls, rows: list[dict[str, float]], dists: dict[str, MetricDistribution], seed: int = 0) -> "ExpertScorer":
        """Fit on expert cycle metric rows; the mixture size (1 or 2) is chosen by BIC."""
        names = sorted(dists)
        x = np.vstack([_vector(r, names, dists) for r in rows])
        fits = [GaussianMixture(n_components=k, covariance_type="diag", reg_covar=0.5, random_state=seed).fit(x)
                for k in (1, 2) if len(x) >= 10 * k]
        gmm = min(fits, key=lambda g: g.bic(x))
        ll = np.sort(gmm.score_samples(x))
        anchor = {n: dists[n].band_edge_value(ANCHOR_BAND_WIDTHS) for n in names}
        gap10 = max(float(np.percentile(ll, 50) - np.percentile(ll, 10)), 1e-3)
        gap_anchor = max(float(np.percentile(ll, 50)) - float(gmm.score_samples(_vector(anchor, names, dists)[None])[0]),
                         1.5 * gap10)
        k10, k_anchor = (math.log(EXPERT_MEDIAN_SCORE / s) for s in (EXPERT_P10_SCORE, ANCHOR_SCORE))
        beta = math.log(k_anchor / k10) / math.log(gap_anchor / gap10)
        return cls(names=names, dists=dists, gmm=gmm, ll_sorted=ll, alpha=k10 / gap10 ** beta, beta=beta,
                   ll_p50=float(np.percentile(ll, 50)))

    def calibrate(self, ll: float) -> float:
        """Map a log-likelihood to 0..100 (expert median -> 90, expert P10 -> 78, anchor -> 40)."""
        p50 = self.ll_p50
        if ll >= p50:
            ecdf = np.searchsorted(self.ll_sorted, ll, side="right") / len(self.ll_sorted)
            return float(EXPERT_MEDIAN_SCORE + (100.0 - EXPERT_MEDIAN_SCORE) * (ecdf - 0.5) / 0.5)
        return float(EXPERT_MEDIAN_SCORE * math.exp(-self.alpha * (p50 - ll) ** self.beta))

    def cycle_score(self, metrics: dict[str, float], flags: list[str]) -> float:
        """Expert-likeness 0..100 for one cycle, capped at SAFETY_SCORE_CAP when any safety flag is set."""
        return self.cycle_scores([metrics], [flags])[0]

    def cycle_scores(self, metrics: list[dict[str, float]], flags: list[list[str]]) -> list[float]:
        """Vectorised ``cycle_score`` over many cycles."""
        lls = self.gmm.score_samples(np.vstack([_vector(m, self.names, self.dists) for m in metrics]))
        return [min(self.calibrate(float(ll)), SAFETY_SCORE_CAP) if f else self.calibrate(float(ll))
                for ll, f in zip(lls, flags)]


def _vector(metrics: dict[str, float], names: list[str], dists: dict[str, MetricDistribution]) -> np.ndarray:
    """Direction-clipped, log-compressed robust z vector; a missing metric counts as the expert median.

    Compression (linear near the band, logarithmic far from it) stops one extreme metric from
    dominating the score, so beginners still spread out instead of all collapsing to zero.
    """
    z = np.array([dists[n].scorer_z(metrics[n]) if n in metrics else 0.0 for n in names])
    return np.sign(z) * Z_KNEE * np.log1p(np.abs(z) / Z_KNEE)


def session_score(cycle_scores: list[float], cycle_flags: list[list[str]]) -> float:
    """Mean cycle score. Any flagged cycle keeps the session below expert_like; many flags cap it at 60."""
    score = float(np.mean(cycle_scores))
    flagged = float(np.mean([bool(f) for f in cycle_flags]))
    if flagged >= SESSION_MANY_FLAGS_FRAC:
        return min(score, SAFETY_SCORE_CAP)
    return min(score, SESSION_FLAGGED_CAP) if flagged > 0 else score


def score_band(score: float) -> str:
    """beginner < 40 <= developing < 65 <= proficient < 85 <= expert_like."""
    return next(band for threshold, band in SCORE_BANDS if score >= threshold)
