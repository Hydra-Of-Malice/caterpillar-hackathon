"""Rate ratio (post/pre) with a 95 % CI.

- One context stratum: exact conditional binomial. Given n = x_pre + x_post events, x_post ~ Bin(n, π)
  with π = RR·E_post / (E_pre + RR·E_post). A Clopper–Pearson interval on π maps to RR through
  RR = π/(1−π) · E_pre/E_post. Exact, so it stays honest at demo-sized counts.
- Several strata: Poisson GLM (statsmodels) with offset log(exposure), a period term and stratum fixed
  effects; Wald CI on the period coefficient (08 §8.6).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import stats


@dataclass(frozen=True)
class RateRatio:
    rr: float | None
    lo: float | None
    hi: float | None
    method: str


def poisson_rate_ci(x: int, exposure: float, level: float = 0.95) -> tuple[float, float]:
    """Exact (Garwood) CI for a Poisson rate x / exposure."""
    a = 1.0 - level
    lo = stats.chi2.ppf(a / 2, 2 * x) / 2 / exposure if x > 0 else 0.0
    hi = stats.chi2.ppf(1 - a / 2, 2 * (x + 1)) / 2 / exposure
    return float(lo), float(hi)


def exact_conditional_rr(x_pre: int, e_pre: float, x_post: int, e_post: float,
                         level: float = 0.95) -> RateRatio:
    """RR = (x_post/e_post)/(x_pre/e_pre) with the exact conditional (Clopper–Pearson) CI."""
    method = "exact conditional binomial (Clopper–Pearson)"
    n = x_pre + x_post
    if n == 0 or e_pre <= 0 or e_post <= 0:
        return RateRatio(None, None, None, method)
    a = 1.0 - level
    scale = e_pre / e_post
    p_lo = stats.beta.ppf(a / 2, x_post, n - x_post + 1) if x_post > 0 else 0.0
    p_hi = stats.beta.ppf(1 - a / 2, x_post + 1, n - x_post) if x_post < n else 1.0
    lo = float(p_lo / (1 - p_lo) * scale)
    hi = math.inf if p_hi >= 1.0 else float(p_hi / (1 - p_hi) * scale)
    rr = math.inf if x_pre == 0 else (x_post / e_post) / (x_pre / e_pre)
    return RateRatio(float(rr), lo, hi, method)


def poisson_glm_rr(rows: list[tuple[str, str, int, float]], level: float = 0.95) -> RateRatio:
    """RR from a Poisson GLM. rows = [(period 'pre'|'post', stratum, count, exposure)].

    Falls back to the exact conditional method on pooled counts when a period has zero events
    (the GLM coefficient is not identifiable then).
    """
    import statsmodels.api as sm

    x_pre = sum(c for p, _, c, _ in rows if p == "pre")
    x_post = sum(c for p, _, c, _ in rows if p == "post")
    if x_pre == 0 or x_post == 0:
        pooled = exact_conditional_rr(x_pre, sum(e for p, _, _, e in rows if p == "pre"),
                                      x_post, sum(e for p, _, _, e in rows if p == "post"), level)
        return RateRatio(pooled.rr, pooled.lo, pooled.hi, pooled.method + " on pooled strata")
    strata = sorted({s for _, s, _, _ in rows})
    y = np.array([c for _, _, c, _ in rows], dtype=float)
    offset = np.log(np.array([e for _, _, _, e in rows], dtype=float))
    cols = [np.ones(len(rows)), np.array([1.0 if p == "post" else 0.0 for p, _, _, _ in rows])]
    cols += [np.array([1.0 if s == name else 0.0 for _, s, _, _ in rows]) for name in strata[1:]]
    fit = sm.GLM(y, np.column_stack(cols), family=sm.families.Poisson(), offset=offset).fit()
    beta, se = float(fit.params[1]), float(fit.bse[1])
    z = stats.norm.ppf(1 - (1 - level) / 2)
    return RateRatio(math.exp(beta), math.exp(beta - z * se), math.exp(beta + z * se),
                     "Poisson GLM, offset log(exposure), stratum fixed effects (Wald CI)")
