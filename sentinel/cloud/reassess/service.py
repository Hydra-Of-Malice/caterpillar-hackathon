"""Before/after re-assessment of the targeted behaviour for one operator × competency (08 §8.6, 13 §6).

Pre = the evaluation window frozen when the gap was flagged. Post = the operator's shifts after it.
Rates use exposure-matched opportunities per context stratum (task type); a stratum needs enough
opportunities in both windows, otherwise it is reported as insufficient_data.
"""
from __future__ import annotations

import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.competency.catalog import Catalog, Competency, get_catalog
from sentinel.cloud.competency.evidence import counted_events
from sentinel.cloud.competency.exposure import exposure_by_shift, exposure_by_stratum
from sentinel.cloud.competency.history import EventRecord, OperatorHistory, load_history
from sentinel.cloud.competency.state import get_row
from sentinel.cloud.reassess.rate_ratio import (RateRatio, exact_conditional_rr, poisson_glm_rr,
                                                poisson_rate_ci)
from sentinel.store.models import TrainingRecordRow

CAVEAT_CI = ("Too few opportunities to be sure: the interval includes no change (RR = 1). "
             "Next: assessment with an instructor, and more shifts of data.")
CAVEAT_RTM = ("Operators are flagged because of a high-event period, so rates can fall by chance "
              "(regression to the mean). Claim improvement only if the CI excludes 1 and a control shows no similar change.")
CAVEAT_SIM = "SIMULATED — generator parameter change; illustrates the pipeline, not evidence of training efficacy."


class NoGapEvidence(LookupError):
    """No frozen gap evidence exists for this operator × competency."""


def _stratum(comp: Competency, ev: EventRecord) -> str:
    if not comp.task_types or comp.exposure_unit == "shifts":
        return "all"
    task = ev.context.get("task_type")
    if task in comp.task_types:
        return task
    return comp.task_types[0] if len(comp.task_types) == 1 else "unknown"


def _counts_by_stratum(history: OperatorHistory, comp: Competency, shift_ids: set[str],
                       catalog: Catalog) -> tuple[dict[str, int], list[EventRecord]]:
    counted, _ = counted_events(history, comp, shift_ids, catalog)
    events = [ev for ev, _ in counted]
    out: dict[str, int] = {}
    if comp.count_mode == "shifts_with_event":
        out["all"] = len({ev.shift_id for ev in events})
        return out, events
    for ev in events:
        key = _stratum(comp, ev)
        out[key] = out.get(key, 0) + 1
    return out, events


def _round(x: float | None, nd: int = 3) -> float | None:
    """Round for JSON; an unbounded value (inf) becomes None."""
    return None if x is None or math.isinf(x) else round(x, nd)


def _verdict(rr: RateRatio) -> str:
    if rr.rr is None or rr.lo is None or rr.hi is None:
        return "insufficient data"
    if rr.lo > 1:
        return "worse — rate increased (CI excludes 1)"
    if rr.hi < 1:
        return "lower rate, CI excludes 1 — needs a control comparison before claiming an effect"
    if rr.rr < 1:
        return "trending better, not yet conclusive"
    return "no clear change"


def _series(history: OperatorHistory, comp: Competency, catalog: Catalog,
            pre: list[str], post: list[str]) -> list[dict[str, Any]]:
    rows = []
    for period, ids in (("pre", pre), ("post", post)):
        exposure = exposure_by_shift(comp, ids, history.exposure_in(set(ids)))
        for sid in ids:
            n, _ = _counts_by_stratum(history, comp, {sid}, catalog)
            x, e = sum(n.values()), exposure.get(sid, 0.0)
            lo, hi = poisson_rate_ci(x, e) if e > 0 else (None, None)
            rows.append({"shift_id": sid, "period": period, "events": x, "opportunities": e,
                         "rate": _round(x / e, 4) if e > 0 else None,
                         "ci95": [_round(lo, 4), _round(hi, 4)]})
    return rows


def _latest_training(s: Session, operator_id: str, comp: Competency) -> float | None:
    rows = s.scalars(select(TrainingRecordRow).where(
        TrainingRecordRow.operator_id == operator_id, TrainingRecordRow.kind == "module_completed"))
    ts = [r.ts for r in rows if r.module_id in comp.module_ids]
    return max(ts) if ts else None


def reassess(s: Session, operator_id: str, competency_id: str, catalog: Catalog | None = None) -> dict[str, Any]:
    """Pre/post rates, rate ratio with 95 % CI, verdict and behaviour trend. Read-only.

    Raises KeyError for an unknown competency and NoGapEvidence when no gap was ever flagged.
    """
    catalog = catalog or get_catalog()
    comp = catalog.competencies[competency_id]
    row = get_row(s, operator_id, competency_id, create=False)
    gap = (row.evidence or {}).get("gap") if row else None
    if not gap:
        raise NoGapEvidence(f"no observed gap for {operator_id}/{competency_id} to re-assess")
    history = load_history(s, operator_id)
    pre_ids = [sid for sid in gap["window_shift_ids"] if history.shift(sid)]
    order = [sh.shift_id for sh in history.shifts]
    last_pre = max((order.index(sid) for sid in pre_ids), default=-1)
    post_ids = [sid for sid in order[last_pre + 1:] if sid not in pre_ids]

    pre_counts, pre_events = _counts_by_stratum(history, comp, set(pre_ids), catalog)
    post_counts, post_events = _counts_by_stratum(history, comp, set(post_ids), catalog)
    pre_exp = exposure_by_stratum(comp, set(pre_ids), history.exposure)
    post_exp = exposure_by_stratum(comp, set(post_ids), history.exposure)
    min_opp = max(1.0, comp.reassess_min_opportunities)

    strata, valid = [], []
    for name in sorted(set(pre_exp) | set(post_exp) | set(pre_counts) | set(post_counts)):
        e_pre, e_post = pre_exp.get(name, 0.0), post_exp.get(name, 0.0)
        ok = e_pre >= min_opp and e_post >= min_opp
        strata.append({"stratum": name, "pre_events": pre_counts.get(name, 0), "pre_opportunities": e_pre,
                       "post_events": post_counts.get(name, 0), "post_opportunities": e_post,
                       "status": "ok" if ok else "insufficient_data"})
        if ok:
            valid.append(name)

    def window(counts: dict[str, int], exp: dict[str, float], ids: list[str]) -> dict[str, Any]:
        x = sum(counts.get(n, 0) for n in valid)
        e = sum(exp.get(n, 0.0) for n in valid)
        return {"events": x, "opportunities": e, "rate": _round(x / e, 4) if e > 0 else None, "shift_ids": ids}

    pre = window(pre_counts, pre_exp, pre_ids)
    post = window(post_counts, post_exp, post_ids) if post_ids else None
    if post is None or not valid:
        rr = RateRatio(None, None, None, "not computed")
    elif len(valid) == 1:
        rr = exact_conditional_rr(pre["events"], pre["opportunities"], post["events"], post["opportunities"])
    else:
        rows = [(p, n, counts.get(n, 0), exp[n]) for p, counts, exp in
                (("pre", pre_counts, pre_exp), ("post", post_counts, post_exp)) for n in valid]
        rr = poisson_glm_rr(rows)

    within_ref = post is not None and post["rate"] is not None and post["rate"] <= comp.reference_rate
    if rr.rr is None:
        trend = "insufficient_data"
    elif rr.lo is not None and rr.lo > 1:
        trend = "worsening"
    elif rr.rr < 1 and within_ref:
        trend = "improving"
    else:
        trend = "stable"
    simulated = any(ev.simulated for ev in pre_events + post_events)
    caveats = [CAVEAT_RTM]
    if rr.lo is not None and rr.hi is not None and rr.lo <= 1 <= rr.hi:
        caveats.insert(0, CAVEAT_CI)
    if simulated:
        caveats.append(CAVEAT_SIM)
    return {
        "operator_id": operator_id,
        "competency_id": competency_id,
        "competency_label": comp.label,
        "metric": comp.reassess_metric,
        "exposure_unit": comp.exposure_unit,
        "pre": pre,
        "post": post,
        "rr": _round(rr.rr),
        "ci95": [_round(rr.lo), _round(rr.hi)],
        "method": rr.method,
        "verdict": _verdict(rr) if post else "awaiting post-training shifts",
        "behavior_trend": trend,
        "reference_rate": comp.reference_rate,
        "within_reference": within_ref,
        "strata": strata,
        "series": _series(history, comp, catalog, pre_ids, post_ids),
        "training_completed_at": _latest_training(s, operator_id, comp),
        "caveats": caveats,
        "label": "SIMULATED" if simulated else "OBSERVED",
        "versions": {"catalog": catalog.version},
    }
