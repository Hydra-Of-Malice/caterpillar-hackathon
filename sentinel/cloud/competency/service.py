"""Competency workflows: post-shift evaluation, guarded state changes, module completion."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.competency.catalog import Catalog, Competency, get_catalog
from sentinel.cloud.competency.evidence import Prior, counted_events, gap_evidence, method_of_moments_prior
from sentinel.cloud.competency.exposure import exposure_by_shift
from sentinel.cloud.competency.history import OperatorHistory, load_history
from sentinel.cloud.competency.state import get_row, transition
from sentinel.cloud.reassess.service import NoGapEvidence, reassess
from sentinel.cloud.roles import Role
from sentinel.shared.schemas import CompetencyState as CS
from sentinel.store.models import ExposureRow, OperatorCompetencyRow, ReassessmentRow

DAY_S = 86_400.0
SYSTEM_ACTOR = "system:gap-rule"


class UnknownShift(LookupError):
    """The shift is not known for this operator (no shift row, event or exposure row)."""


def evaluation_window(history: OperatorHistory, shift_id: str, lookback_days: float) -> tuple[list[str], float]:
    """Shift ids in the look-back window ending at `shift_id` (inclusive) and the reference time."""
    target = history.shift(shift_id)
    if target is None:
        raise UnknownShift(f"shift {shift_id!r} not found for operator {history.operator_id!r}")
    order = [sh.shift_id for sh in history.shifts]
    upto = history.shifts[: order.index(shift_id) + 1]
    if target.start is not None:
        earliest = target.start - lookback_days * DAY_S
        upto = [sh for sh in upto if sh.start is not None and sh.start >= earliest]
    event_ts = [e.ts for e in history.events if e.shift_id == shift_id]
    ref_ts = target.end or (max(event_ts) if event_ts else None) or target.start or 0.0
    return [sh.shift_id for sh in upto], float(ref_ts)


def _empirical_priors(s: Session, catalog: Catalog) -> dict[str, Prior]:
    """Method-of-moments priors per competency across operators (only when prior_mode is empirical)."""
    if catalog.prior_mode != "empirical":
        return {}
    operator_ids = sorted(set(s.scalars(select(ExposureRow.operator_id))))
    if len(operator_ids) < catalog.empirical_min_operators:
        return {}
    histories = [load_history(s, op) for op in operator_ids]
    priors: dict[str, Prior] = {}
    for comp in catalog.ordered():
        counts, exposures = [], []
        for h in histories:
            ids = [sh.shift_id for sh in h.shifts]
            counted, _ = counted_events(h, comp, set(ids), catalog)
            counts.append(sum(w for _, w in counted))
            exposures.append(sum(exposure_by_shift(comp, ids, h.exposure).values()))
        prior = method_of_moments_prior(counts, exposures)
        if prior is not None:
            priors[comp.id] = prior
    return priors


def _set_evidence(row: OperatorCompetencyRow, **parts: Any) -> None:
    row.evidence = {**(row.evidence or {}), **parts}   # reassign so the JSON column is flushed


def evaluate_shift(s: Session, operator_id: str, shift_id: str, *, requested_by: Role,
                   catalog: Catalog | None = None) -> dict[str, Any]:
    """Run mapping + gap rule after a shift, update states, and re-assess competencies in training.

    State changes made here are system transitions (never `demonstrated`) and are audit-logged.
    """
    catalog = catalog or get_catalog()
    history = load_history(s, operator_id)
    window, ref_ts = evaluation_window(history, shift_id, catalog.gap_rule.lookback_days)
    priors = _empirical_priors(s, catalog)
    actor = f"{SYSTEM_ACTOR} (requested by {requested_by.value})"
    evaluated, transitions = [], []
    for comp in catalog.ordered():
        if comp.assessment_only:
            continue
        ev = gap_evidence(history, comp, catalog, window, ref_ts, priors.get(comp.id))
        evaluated.append(ev)
        row = get_row(s, operator_id, comp.id, create=ev["n_events"] > 0 or ev["gap"])
        if row is None:
            continue
        state = CS(row.state)
        if ev["gap"] and state in (CS.unassessed, CS.demonstrated):
            reason = "recurrence rule met" if state is CS.unassessed else "recurrence re-appeared after demonstrated"
            change = transition(s, row, comp, CS.observed_gap, role=Role.system, actor=actor,
                                reason=reason, evidence_update={"gap": ev, "latest": ev})
            transitions.append(change)
        elif ev["gap"] and state is CS.observed_gap:
            _set_evidence(row, gap=ev, latest=ev)
        else:
            _set_evidence(row, latest=ev)
    s.flush()
    reassessments = _reassess_in_training(s, operator_id, catalog, actor, transitions)
    states = {r.competency_id: r.state for r in s.scalars(
        select(OperatorCompetencyRow).where(OperatorCompetencyRow.operator_id == operator_id))}
    gaps = [{**ev, "state": states.get(ev["competency_id"], CS.unassessed.value),
             "module_ids": list(catalog.competencies[ev["competency_id"]].module_ids)}
            for ev in evaluated if ev["gap"]]
    return {"operator_id": operator_id, "shift_id": shift_id, "window_shift_ids": window, "ref_ts": ref_ts,
            "gaps": gaps, "evaluated": evaluated, "transitions": [t for t in transitions if t],
            "reassessments": reassessments,
            "versions": {"catalog": catalog.version, "gap_rule": catalog.gap_rule.version},
            "label": "SIMULATED" if any(ev["data_provenance"] == "SIMULATED" for ev in evaluated if ev["n_events"])
            else "OBSERVED"}


def _reassess_in_training(s: Session, operator_id: str, catalog: Catalog, actor: str,
                          transitions: list[dict[str, Any] | None]) -> list[dict[str, Any]]:
    """Re-assess competencies in training/improving; in_training -> improving when the trend improves."""
    out = []
    rows = s.scalars(select(OperatorCompetencyRow).where(
        OperatorCompetencyRow.operator_id == operator_id,
        OperatorCompetencyRow.state.in_([CS.in_training.value, CS.improving.value])))
    for row in list(rows):
        comp = catalog.competencies.get(row.competency_id)
        if comp is None:
            continue
        try:
            result = reassess(s, operator_id, comp.id, catalog)
        except NoGapEvidence:
            continue
        if result["post"] is None:
            continue
        s.add(ReassessmentRow(operator_id=operator_id, competency_id=comp.id, data=result))
        summary = {k: result[k] for k in ("rr", "ci95", "verdict", "behavior_trend", "label")}
        _set_evidence(row, reassessment=summary, behavior_trend=result["behavior_trend"])
        if CS(row.state) is CS.in_training and result["behavior_trend"] == "improving":
            transitions.append(transition(s, row, comp, CS.improving, role=Role.system, actor=actor,
                                          reason="post-training rate improved and within reference; assessment scheduled"))
        out.append(result)
    return out


def set_state(s: Session, operator_id: str, competency_id: str, to_state: CS, *, role: Role, actor: str,
              assessment_id: str | None, note: str | None, catalog: Catalog | None = None) -> dict[str, Any]:
    """Guarded manual state change (PATCH). Raises KeyError, PermissionDenied or InvalidTransition."""
    catalog = catalog or get_catalog()
    comp = catalog.competencies[competency_id]
    row = get_row(s, operator_id, competency_id)
    change = transition(s, row, comp, to_state, role=role, actor=actor, reason=note or "manual update",
                        assessment_id=assessment_id)
    return {"change": change, "competency": competency_view(row, comp)}


def on_module_completed(s: Session, operator_id: str, competency_ids: list[str],
                        catalog: Catalog | None = None) -> list[dict[str, Any]]:
    """observed_gap -> in_training for the module's competencies (system transition)."""
    catalog = catalog or get_catalog()
    changes = []
    for cid in competency_ids:
        comp = catalog.competencies.get(cid)
        row = get_row(s, operator_id, cid, create=False) if comp else None
        if row is not None and CS(row.state) is CS.observed_gap:
            changes.append(transition(s, row, comp, CS.in_training, role=Role.system,
                                      actor="system:training-hub", reason="module completed"))
    return [c for c in changes if c]


EVIDENCE_KEYS = ("gap", "n_events", "n_shifts", "opportunities", "exposure_unit", "rate", "reference_rate",
                 "posterior_p", "confidence", "why", "shift_ids", "event_ids", "excluded", "n_unknown",
                 "failed_checks", "prior", "versions", "data_provenance")


def _trim(ev: dict[str, Any] | None) -> dict[str, Any] | None:
    return {k: ev[k] for k in EVIDENCE_KEYS if k in ev} if ev else None


def competency_view(row: OperatorCompetencyRow | None, comp: Competency) -> dict[str, Any]:
    """Profile/heatmap view of one competency: state, evidence first, verification."""
    evidence = (row.evidence or {}) if row else {}
    shown = evidence.get("gap") or evidence.get("latest")
    return {
        "id": comp.id,
        "label": comp.label,
        "state": row.state if row else CS.unassessed.value,
        "safety_critical": comp.safety_critical,
        "assessment_only": comp.assessment_only,
        "evidence": _trim(shown),
        "latest_evidence": _trim(evidence.get("latest")) if evidence.get("gap") else None,
        "behavior_trend": evidence.get("behavior_trend", "insufficient_data"),
        "reassessment": evidence.get("reassessment"),
        "verified_by": row.verified_by if row else None,
        "module_ids": list(comp.module_ids),
        "updated_at": row.updated_at if row else None,
    }
