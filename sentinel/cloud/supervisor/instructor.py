"""Instructor workspace (screen 18): competency heatmap (states, never scores) and content review."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.audit import audit_rows, write_audit
from sentinel.cloud.competency.catalog import get_catalog
from sentinel.cloud.rag.retriever import HybridRetriever
from sentinel.cloud.training.modules import APPROVE_ACTION, ModuleStore, check_citations
from sentinel.store.models import OperatorCompetencyRow, OperatorRow


class ReviewError(ValueError):
    """Content review item missing (404) or not approvable (409)."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


def heatmap(s: Session) -> dict[str, Any]:
    catalog = get_catalog()
    states: dict[str, dict[str, str]] = {}
    for r in s.scalars(select(OperatorCompetencyRow)):
        states.setdefault(r.operator_id, {})[r.competency_id] = r.state
    ops = {o.operator_id: o for o in s.scalars(select(OperatorRow).where(OperatorRow.role.in_(["operator", "trainee"])))}
    operators = []
    for op_id in sorted(set(ops) | set(states)):
        op = ops.get(op_id)
        operators.append({"operator_id": op_id, "name": op.name if op else None,
                          "experience_months": op.experience_months if op else None,
                          "cells": {c.id: states.get(op_id, {}).get(c.id, "unassessed") for c in catalog.ordered()}})
    return {"competencies": [{"id": c.id, "label": c.label, "safety_critical": c.safety_critical}
                             for c in catalog.ordered()],
            "operators": operators,
            "legend": ["unassessed", "observed_gap", "in_training", "improving", "demonstrated"],
            "note": "Cells show states only, never scores. Only an instructor or a passed assessment can mark demonstrated.",
            "label": "SIMULATED"}


def _diff(mv_points: list[dict], prev_points: list[dict]) -> dict[str, list[str]]:
    now = {p["id"]: p["text"] for p in mv_points}
    before = {p["id"]: p["text"] for p in prev_points}
    return {"added": [now[k] for k in now if k not in before],
            "removed": [before[k] for k in before if k not in now],
            "changed": [now[k] for k in now if k in before and now[k] != before[k]]}


def content_review(s: Session, store: ModuleStore, retriever: HybridRetriever) -> dict[str, Any]:
    """Every module version with citation check, status and diff vs the previous approved version."""
    items = []
    for mv in sorted(store.versions, key=lambda m: (m.module_id, m.version)):
        prev = store.previous_approved(mv)
        check = check_citations(mv, retriever)
        status = store.status(mv)
        if status == "approved" and check["status"] == "FAIL":
            status = "needs_re_review"
        items.append({"id": mv.review_id, "module_id": mv.module_id, "version": mv.version,
                      "title": mv.data["title"], "change_summary": mv.data.get("change_summary"),
                      "sources_cited": check["n_sources"], "citation_check": check["status"],
                      "citation_failures": check["failures"], "status": status,
                      "approved": store.approval(mv) if store.status(mv) == "approved" else None,
                      "diff_vs": prev.version if prev else None,
                      "diff": _diff(mv.data.get("key_points", []), prev.data.get("key_points", []) if prev else [])})
    gaps = [{"question": r.data.get("question"), "ts": r.ts, "actor": r.actor}
            for r in audit_rows(s, "copilot_refused")][-20:]
    return {"items": items, "content_gaps": gaps,
            "queue": [i["id"] for i in items if i["status"] != "approved"], "label": "SAMPLE content"}


def approve(s: Session, store: ModuleStore, retriever: HybridRetriever, review_id: str, actor: str) -> dict[str, Any]:
    """Approve a module version (instructor only; enforced by the route). Citation check must PASS."""
    module_id, _, version = review_id.partition("@")
    mv = store.get(module_id, version)
    if mv is None:
        raise ReviewError(f"no module version {review_id!r}", 404)
    check = check_citations(mv, retriever)
    if check["status"] != "PASS":
        raise ReviewError(f"citation check failed: {check['failures']}", 409)
    if store.status(mv) == "approved":
        return {"id": review_id, "status": "approved", "already": True}
    write_audit(s, actor=actor, role="instructor", action=APPROVE_ACTION, target=review_id,
                data={"citation_check": check})
    return {"id": review_id, "status": "approved", "approved_by": actor, "already": False}
