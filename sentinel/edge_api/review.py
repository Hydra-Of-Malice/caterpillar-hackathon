"""Post-shift review (screen 8): edge DB facts + cloud gap evidence when the cloud is reachable."""
from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from sqlalchemy import select

from sentinel.edge_api import services
from sentinel.shared.schemas import Alert, AlertState, Tier
from sentinel.store.models import AlertRow, BreakLogRow, EventRow, ExposureRow, IncidentRow, ShiftRow, TaskRow

SHOWN_STATES = (AlertState.raised, AlertState.acknowledged, AlertState.cleared, AlertState.escalated)
SIGNAL_WORDS = ("DANGER", "WARNING", "CAUTION", "NOTICE", "SUPERVISOR NOTIFIED")
GAP_STATES = ("observed_gap", "in_training")


def _hhmm(ts: float | None) -> str:
    return datetime.fromtimestamp(ts).strftime("%H:%M") if ts else "--:--"


def _idle_from_events(events: list[EventRow]) -> dict[str, float]:
    by_reason: Counter = Counter()
    for e in events:
        if e.type == "idle_period":
            by_reason[e.data["context"].get("reason", "unexplained")] += e.data["context"].get("duration_min", 0.0)
    total = sum(by_reason.values())
    return {"today_min": round(total, 1), "waiting_min": round(by_reason["waiting_for_truck"], 1),
            "unexplained_min": round(by_reason["unexplained"], 1)}


def _cloud_focus(rt: Any, shift: ShiftRow) -> dict[str, Any] | None:
    """Focus item from the cloud's gap evidence: the shift's evaluation result, else the operator profile."""
    evaluation = rt.evaluations.get(shift.shift_id)
    gaps = evaluation.get("gaps") if isinstance(evaluation, dict) else None
    if not gaps:
        profile = rt.sync.request("GET", f"/operators/{shift.operator_id}/profile", skip_if_offline=True) or {}
        gaps = [c for c in profile.get("competencies", []) if c.get("state") in GAP_STATES]
    if not gaps:
        return None
    gap = gaps[0]
    cid = gap.get("competency_id") or gap.get("id")
    ev = next((e for e in (gap.get("evidence"), gap.get("latest_evidence"), gap) if isinstance(e, dict)
               and "n_events" in e), {})                                       # evaluate result or profile entry
    line = f"Based on {ev.get('n_events', '?')} events across {ev.get('n_shifts', '?')} shifts"
    if ev.get("opportunities") is not None:
        line += f" ({ev.get('n_events')} of {ev['opportunities']} opportunities)"
    recs = rt.sync.request("GET", "/training/recommendations", params={"operator_id": shift.operator_id},
                           skip_if_offline=True)
    recs = recs.get("recommendations", []) if isinstance(recs, dict) else (recs or [])
    module, why_text = None, None
    for rec in recs:
        mod = rec.get("module") or rec
        reasons = [w for w in rec.get("why") or [] if isinstance(w, dict) and w.get("competency_id") == cid]
        if reasons or cid in (mod.get("competency_ids") or [mod.get("competency_id")]):
            module, why_text = mod, reasons[0].get("text") if reasons else None
            break
    module_ids = gap.get("module_ids") or []
    return {"competency_id": cid, "title": gap.get("label") or gap.get("title") or cid,
            "detail": ev.get("why") or why_text or line, "evidence_line": why_text or line,
            "posterior_p": ev.get("posterior_p"),
            "module_id": (module or {}).get("id") or (module or {}).get("module_id") or (module_ids[0] if module_ids else None),
            "module_title": (module or {}).get("title"), "provenance": ["ML", "RULE", "SIMULATED"], "source": "cloud"}


def _edge_focus(events: list[EventRow]) -> dict[str, Any] | None:
    """Fallback while offline: the most frequent operator-attributed advisory type this shift."""
    counts = Counter(e.type for e in events if e.attribution == "operator" and e.tier in ("T1", "T2", "T0"))
    if not counts:
        return None
    etype, n = counts.most_common(1)[0]
    comp = next((e.data.get("competency_ids") or [None] for e in events if e.type == etype), [None])[0]
    label = etype.replace("_", " ").capitalize()
    return {"competency_id": comp, "title": label,
            "detail": f"{label} happened {n} time{'s' if n != 1 else ''} this shift.",
            "evidence_line": f"Based on {n} events this shift (cloud evidence pending sync)",
            "module_id": None, "module_title": None, "provenance": ["RULE", "ML"], "source": "edge"}


def compose(rt: Any, shift_id: str) -> dict[str, Any] | None:
    """Totals, idle breakdown, alerts by signal word, well-done list, focus item, coaching and timeline."""
    with rt.db.session() as s:
        shift = s.get(ShiftRow, shift_id)
        if shift is None:
            return None
        tasks = s.scalars(select(TaskRow).where(TaskRow.shift_id == shift_id).order_by(TaskRow.priority)).all()
        events = s.scalars(select(EventRow).where(EventRow.shift_id == shift_id).order_by(EventRow.ts)).all()
        alert_rows = s.scalars(select(AlertRow).where(AlertRow.event_id.in_([e.event_id for e in events]))
                               .order_by(AlertRow.ts)).all()
        breaks = s.scalars(select(BreakLogRow).where(BreakLogRow.shift_id == shift_id)).all()
        exposure = s.scalars(select(ExposureRow).where(ExposureRow.shift_id == shift_id)).all()
        n_incidents = len(s.scalars(select(IncidentRow.incident_id).where(IncidentRow.ts >= shift.planned_start - 3600,
                                                                          IncidentRow.operator_id == shift.operator_id,
                                                                          IncidentRow.ts <= (shift.ended_at or rt.now_ts()))).all())
        checklist = services.checklist_status(s, shift_id, None)
        shift_d = services.shift_dict(shift)
    alerts = [Alert.model_validate(r.data) for r in alert_rows]
    shown = [a for a in alerts if a.state in SHOWN_STATES]
    stats = rt.live_stats(shift_id) or {}
    idle = stats.get("idle") or _idle_from_events(events)
    operating_min = stats.get("operating_min") or round(sum(e.operating_h for e in exposure) * 60, 1)
    by_word = {w: sum(1 for a in shown if a.signal_word == w) for w in SIGNAL_WORDS}
    by_word["NOTICE"] = sum(1 for a in alerts if a.tier == Tier.T0)
    suppressed = Counter(a.suppressed_reason or "unknown" for a in alerts if a.state == AlertState.suppressed)
    done = [t for t in tasks if t.status == "done"]
    well_done = []
    if checklist["completed"] and checklist["passed"]:
        well_done.append(f"Pre-shift check complete ({checklist['passed_count']}/{checklist['total']} passed)")
    if not any(a.signal_word == "DANGER" for a in shown):
        well_done.append("No DANGER alerts this shift")
    if not any(e.type.startswith("seatbelt") for e in events):
        well_done.append("Seatbelt fastened whenever the machine was active")
    if idle.get("today_min") and idle.get("unexplained_min", 0) <= 0.2 * idle["today_min"]:
        well_done.append("Idle time mostly explained (waiting for truck, warm-up)")
    if breaks and not any(a.tier == Tier.T4 and "break" in (a.why or "").lower() for a in alerts):
        well_done.append("Breaks taken on time")
    well_done += [f"Completed: {t.name}" for t in done]
    coaching = Counter((a.what, a.why, a.do) for a in alerts if a.tier == Tier.T0)
    timeline: list[dict[str, Any]] = [
        {"kind": "task", "t_start": t.started_at, "t_end": t.done_at, "label": t.name, "task_type": t.type,
         "task_id": t.task_id, "status": t.status} for t in tasks if t.started_at]
    timeline += [{"kind": "break", "t_start": b.started_at, "t_end": b.ended_at,
                  "label": f"Break {_hhmm(b.started_at)}–{_hhmm(b.ended_at)}"} for b in breaks]
    timeline += [{"kind": "idle", "t_start": e.data["context"].get("start_ts", e.ts),
                  "t_end": e.data["context"].get("end_ts"),
                  "label": f"Idle {e.data['context'].get('duration_min', 0):.0f} min — "
                           f"{e.data['context'].get('reason', 'unexplained').replace('_', ' ')}"}
                 for e in events if e.type == "idle_period"]
    timeline += [{"kind": "alert", "t_start": a.ts, "t_end": a.cleared_at, "label": f"{a.signal_word} · {a.what}",
                  "alert": a.model_dump(mode="json")} for a in shown]
    timeline.sort(key=lambda x: x["t_start"] or 0)
    focus = _cloud_focus(rt, shift) or _edge_focus(events)
    return {
        "shift_id": shift_id, "date": shift_d["date"], "shift": shift_d, "operator_id": shift.operator_id,
        "totals": {"operating_min": operating_min, "tasks_done": len(done), "tasks_total": len(tasks),
                   "material_m3": round(sum(t.done_qty for t in tasks if t.qty_unit == "m3"), 1),
                   "idle_min": idle.get("today_min", 0.0), "alerts_shown": len(shown), "incidents": n_incidents},
        "idle_breakdown": {k: idle.get(k, 0.0) for k in ("waiting_min", "unexplained_min")},
        "alerts_by_signal_word": by_word,
        "suppressed": {"count": sum(suppressed.values()), "by_reason": dict(suppressed)},
        "well_done": well_done, "focus": focus,
        "coaching": [{"what": w, "why": y, "do": d, "count": n} for (w, y, d), n in coaching.most_common(
            rt.policy["tiers"]["T0"]["max_per_shift_report"])],
        "timeline": timeline, "cloud": "online" if rt.sync.cloud_online else "offline",
        "footer": "These notes are for your coaching. They are not used for pay or discipline.",
        "simulated": True,
    }
