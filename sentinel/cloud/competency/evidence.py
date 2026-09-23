"""Gamma–Poisson gap evidence (05 §5.7, 08 §8.3 steps 4–7).

The operator's rate λ (events per exposure unit) has a Gamma(α, β) prior at the parent level.
With k weighted events over exposure E the posterior is Gamma(α + k, β + E), and the gap evidence is
P(λ > r_ref). Events and exposure both decay with a 14-day half-life, so old evidence fades.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from scipy import stats

from sentinel.cloud.competency.catalog import Catalog, Competency
from sentinel.cloud.competency.exposure import UNIT_LABELS, exposure_by_shift
from sentinel.cloud.competency.history import EventRecord, OperatorHistory
from sentinel.cloud.competency.mapping import map_event

DAY_S = 86_400.0


@dataclass(frozen=True)
class Prior:
    alpha: float
    beta: float
    mode: str          # "fixed" (config) or "empirical" (method of moments)


def posterior_exceedance(k: float, exposure: float, prior: Prior, reference_rate: float) -> float:
    """P(λ > reference_rate) under the Gamma(α + k, β + E) posterior."""
    return float(stats.gamma.sf(reference_rate, prior.alpha + k, scale=1.0 / (prior.beta + exposure)))


def decay_weight(age_s: float, half_life_days: float) -> float:
    """Exponential forgetting weight in (0, 1]; events in the future of the reference get weight 1."""
    return 0.5 ** (max(age_s, 0.0) / (half_life_days * DAY_S))


def method_of_moments_prior(counts: list[float], exposures: list[float]) -> Prior | None:
    """Fit Gamma(α, β) to operator rates k_i/E_i by method of moments (Poisson noise removed).

    Returns None when the between-operator variance is not identifiable (≤ 0) or there is no data.
    """
    pairs = [(k, e) for k, e in zip(counts, exposures) if e > 0]
    if len(pairs) < 2:
        return None
    rates = [k / e for k, e in pairs]
    mean = sum(rates) / len(rates)
    var = sum((r - mean) ** 2 for r in rates) / (len(rates) - 1)
    between = var - mean * sum(1.0 / e for _, e in pairs) / len(pairs)
    if mean <= 0 or between <= 0:
        return None
    return Prior(alpha=mean * mean / between, beta=mean / between, mode="empirical")


def confidence_label(p: float, unknown_share: float, catalog: Catalog) -> str:
    """high ≥ 0.95, medium ≥ threshold, else low; 'unknown'-heavy evidence is always low."""
    rule = catalog.gap_rule
    if unknown_share > rule.unknown_low_confidence_share:
        return "low"
    if p >= rule.confidence_high:
        return "high"
    return "medium" if p >= rule.posterior_threshold else "low"


def _why(comp: Competency, values: dict[str, Any]) -> str:
    try:
        return comp.why_template.format(**values)
    except (KeyError, IndexError, ValueError):
        return f"{values['n_events']} events across {values['n_shifts']} shifts"


def counted_events(history: OperatorHistory, comp: Competency, shift_ids: set[str],
                   catalog: Catalog) -> tuple[list[tuple[EventRecord, float]], dict[str, int]]:
    """Events that count toward this competency, with mapping weight, plus exclusion counts.

    Excluded: disputed events (until resolved) and attributions outside `counted_attributions`
    (machine and environment never count toward an operator's gap).
    """
    counted: list[tuple[EventRecord, float]] = []
    excluded = {"machine": 0, "environment": 0, "disputed": 0}
    for ev in history.events_in(shift_ids):
        weights, _ = map_event(ev.type, ev.context, ev.competency_ids, catalog)
        w = weights.get(comp.id, 0.0)
        if w <= 0:
            continue
        if ev.event_id in history.disputed_event_ids:
            excluded["disputed"] += 1
        elif ev.attribution not in catalog.gap_rule.counted_attributions:
            excluded[ev.attribution] = excluded.get(ev.attribution, 0) + 1
        else:
            counted.append((ev, w))
    return counted, excluded


def gap_evidence(history: OperatorHistory, comp: Competency, catalog: Catalog,
                 window_shift_ids: list[str], ref_ts: float, prior: Prior | None = None) -> dict[str, Any]:
    """Evaluate the gap rule for one competency over a window of shifts.

    Gap = weighted events ≥ floor AND distinct shifts ≥ min_shifts AND exposure ≥ min_exposure AND
    P(λ > r_ref) ≥ threshold. Returns the evidence dict stored on the competency row.
    """
    rule = catalog.gap_rule
    prior = prior or Prior(comp.prior_alpha, comp.prior_beta, "fixed")
    window = set(window_shift_ids)
    counted, excluded = counted_events(history, comp, window, catalog)
    half_life = rule.decay_half_life_days
    shift_start = {sh.shift_id: sh.start for sh in history.shifts}

    if comp.count_mode == "shifts_with_event":
        per_shift: dict[str, tuple[float, float]] = {}
        for ev, w in counted:
            sid = ev.shift_id or ""
            prev_w, prev_ts = per_shift.get(sid, (0.0, 0.0))
            per_shift[sid] = (max(prev_w, w), max(prev_ts, ev.ts))
        n_events = len(per_shift)
        k_weighted = sum(w for w, _ in per_shift.values())
        k_effective = sum(w * decay_weight(ref_ts - ts, half_life) for w, ts in per_shift.values())
    else:
        n_events = len(counted)
        k_weighted = sum(w for _, w in counted)
        k_effective = sum(w * decay_weight(ref_ts - ev.ts, half_life) for ev, w in counted)

    exposure = exposure_by_shift(comp, window_shift_ids, history.exposure_in(window))
    opportunities = sum(exposure.values())
    opp_effective = sum(
        value * (decay_weight(ref_ts - shift_start[sid], half_life) if shift_start.get(sid) else 1.0)
        for sid, value in exposure.items())
    p = posterior_exceedance(k_effective, opp_effective, prior, comp.reference_rate)
    counted_shifts = sorted({ev.shift_id for ev, _ in counted if ev.shift_id},
                            key=lambda sid: window_shift_ids.index(sid))
    n_unknown = sum(1 for ev, _ in counted if ev.attribution == "unknown")
    unknown_share = n_unknown / len(counted) if counted else 0.0

    failed = []
    if k_weighted < comp.floor:
        failed.append("recurrence_floor")
    if len(counted_shifts) < comp.min_shifts:
        failed.append("min_shifts")
    if opportunities < comp.min_exposure:
        failed.append("min_exposure")
    if p < rule.posterior_threshold:
        failed.append("posterior")
    values = {"n_events": n_events, "n_shifts": len(counted_shifts),
              "opportunities": _fmt_number(opportunities), "unit": UNIT_LABELS[comp.exposure_unit]}
    return {
        "competency_id": comp.id,
        "label": comp.label,
        "gap": not failed,
        "failed_checks": failed,
        "n_events": n_events,
        "k_weighted": round(k_weighted, 3),
        "k_effective": round(k_effective, 3),
        "n_shifts": len(counted_shifts),
        "shift_ids": counted_shifts,
        "window_shift_ids": list(window_shift_ids),
        "event_ids": [ev.event_id for ev, _ in counted],
        "opportunities": _fmt_number(opportunities),
        "opportunities_effective": round(opp_effective, 3),
        "exposure_unit": comp.exposure_unit,
        "rate": round(n_events / opportunities, 4) if opportunities > 0 else None,
        "reference_rate": comp.reference_rate,
        "posterior_p": round(p, 3),
        "prior": {"alpha": round(prior.alpha, 4), "beta": round(prior.beta, 4), "mode": prior.mode},
        "confidence": confidence_label(p, unknown_share, catalog) if counted else None,
        "floor": comp.floor,
        "min_shifts": comp.min_shifts,
        "min_exposure": comp.min_exposure,
        "n_unknown": n_unknown,
        "excluded": excluded,
        "ref_ts": ref_ts,
        "why": _why(comp, values),
        "versions": {"catalog": catalog.version, "gap_rule": rule.version},
        "data_provenance": "SIMULATED" if any(ev.simulated for ev, _ in counted) else "OBSERVED",
    }


def _fmt_number(x: float) -> float | int:
    """Whole numbers as int (81, not 81.0) for display."""
    return int(x) if math.isclose(x, round(x)) else round(x, 3)
