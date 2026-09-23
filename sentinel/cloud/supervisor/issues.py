"""Escalations (T4) with resolve, machine-attributed issues, and the behaviour event list (screens 14, 16)."""
from __future__ import annotations

import time
from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.audit import write_audit
from sentinel.cloud.competency.catalog import get_catalog
from sentinel.cloud.competency.mapping import map_event
from sentinel.store.models import AlertRow, EventRow, OperatorRow


def _escalation_view(s: Session, a: AlertRow) -> dict[str, Any]:
    d = a.data or {}
    op = s.get(OperatorRow, a.operator_id)
    return {"escalation_id": a.alert_id, "ts": a.ts, "machine_id": a.machine_id, "operator_id": a.operator_id,
            "operator_name": op.name if op else None, "tier": a.tier, "signal_word": d.get("signal_word"),
            "what": d.get("what"), "why": d.get("why"), "do": d.get("do"), "escalated_to": d.get("escalated_to"),
            "state": a.state, "resolution": d.get("resolution"), "simulated": d.get("simulated", True)}


def escalations(s: Session, include_resolved: bool = False) -> dict[str, Any]:
    rows = [a for a in s.scalars(select(AlertRow).order_by(AlertRow.ts.desc()))
            if a.tier == "T4" or a.state == "escalated"]
    items = [_escalation_view(s, a) for a in rows if include_resolved or "resolution" not in (a.data or {})]
    return {"items": items, "open": sum(1 for a in rows if "resolution" not in (a.data or {})), "label": "SIMULATED"}


def resolve_escalation(s: Session, escalation_id: str, actor: str, role: str, note: str | None) -> dict[str, Any] | None:
    """Mark an escalation resolved (kept on the alert; survives edge re-sync). None if not found."""
    a = s.get(AlertRow, escalation_id)
    if a is None or not (a.tier == "T4" or a.state == "escalated"):
        return None
    resolution = {"by": actor, "role": role, "note": note, "ts": time.time()}
    a.data = {**(a.data or {}), "resolution": resolution}
    write_audit(s, actor=actor, role=role, action="escalation_resolved", target=escalation_id, data=resolution)
    return _escalation_view(s, a)


def machine_issues(s: Session) -> dict[str, Any]:
    """Machine-attributed events grouped by machine × signature; excluded from operator competency."""
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for e in s.scalars(select(EventRow).where(EventRow.attribution == "machine").order_by(EventRow.ts)):
        d = e.data or {}
        dtc = sorted(set((d.get("context") or {}).get("dtc") or []) | set((d.get("evidence") or {}).get("dtc") or []))
        g = groups.setdefault((e.machine_id, e.type), {"machine_id": e.machine_id, "signature": e.type, "count": 0,
                                                       "operators": set(), "dtc": set(), "first_ts": e.ts,
                                                       "last_ts": e.ts, "event_ids": []})
        g["count"] += 1
        g["operators"].add(e.operator_id)
        g["dtc"].update(dtc)
        g["last_ts"] = e.ts
        g["event_ids"].append(e.event_id)
    items = []
    for g in groups.values():
        n_ops = len(g.pop("operators"))
        g["dtc"] = sorted(g["dtc"])
        g["n_operators"] = n_ops
        g["verdict"] = ("MACHINE — same signature with ≥2 operators" + (" + active DTC" if g["dtc"] else "")
                        if n_ops >= 2 else "MACHINE — active DTC" if g["dtc"] else "MACHINE — sensor/fault flag")
        g["action"] = "Maintenance ticket; excluded from operator competency counts"
        items.append(g)
    return {"items": sorted(items, key=lambda g: (g["machine_id"], g["signature"])), "label": "SIMULATED"}


def behaviour_events(s: Session, operator_id: str | None = None, machine_id: str | None = None,
                     category: str | None = None, attribution: str | None = None, type_: str | None = None,
                     since: float | None = None, until: float | None = None, limit: int = 200) -> dict[str, Any]:
    """Events with category, attribution and a machine-vs-operating-pattern breakdown."""
    q = select(EventRow).order_by(EventRow.ts.desc())
    for col, val in ((EventRow.operator_id, operator_id), (EventRow.machine_id, machine_id),
                     (EventRow.category, category), (EventRow.attribution, attribution), (EventRow.type, type_)):
        if val is not None:
            q = q.where(col == val)
    if since is not None:
        q = q.where(EventRow.ts >= since)
    if until is not None:
        q = q.where(EventRow.ts <= until)
    rows = list(s.scalars(q.limit(limit)))
    catalog = get_catalog()
    items = []
    for e in rows:
        d = e.data or {}
        ctx, evd = d.get("context") or {}, d.get("evidence") or {}
        dtc = ctx.get("dtc") or evd.get("dtc") or []
        weights, rule = map_event(e.type, ctx, d.get("competency_ids") or [], catalog)
        items.append({
            "event_id": e.event_id, "ts": e.ts, "machine_id": e.machine_id, "operator_id": e.operator_id,
            "shift_id": e.shift_id, "type": e.type, "category": e.category, "tier": e.tier,
            "attribution": e.attribution, "provenance": d.get("provenance", []),
            "cause": {
                "machine_signals": {"dtc": dtc, "status": "fault present" if dtc else "no fault codes"},
                "operating_pattern": [x.get("label") for x in d.get("explanation") or []],
                "verdict": {"machine": "Likely machine fault, not the operator",
                            "environment": "Explained by context (e.g. waiting for truck)",
                            "operator": "Likely operating pattern, not a machine fault",
                            "unknown": "Cause unclear — low confidence"}.get(e.attribution, e.attribution),
            },
            "explanation": (d.get("explanation") or [])[:3],
            "context": {k: ctx[k] for k in ("task_type", "zone", "waiting_for_truck", "truck_m") if k in ctx},
            "competency_map": {"rule_id": rule, "weights": weights,
                               "counts_toward_competency": e.attribution in catalog.gap_rule.counted_attributions},
            "simulated": d.get("simulated", True),
        })
    return {"items": items, "counts": {"by_category": dict(Counter(i["category"] for i in items)),
                                       "by_attribution": dict(Counter(i["attribution"] for i in items))},
            "note": "Unusual ≠ unsafe. Events are reviewed in context before any coaching.", "label": "SIMULATED"}
