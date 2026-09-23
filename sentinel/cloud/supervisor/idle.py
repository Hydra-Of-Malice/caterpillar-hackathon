"""Idle breakdown (screen 16): waiting_for_truck / unexplained, with a fuel estimate."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared.config import load_yaml
from sentinel.store.models import EventRow

REASONS = ("waiting_for_truck", "unexplained")


def idle_minutes(data: dict[str, Any]) -> float:
    """Idle duration of an idle event from its context/evidence (minutes)."""
    ctx, evd = data.get("context") or {}, data.get("evidence") or {}
    for src in (ctx, evd):
        if src.get("idle_min") is not None:
            return float(src["idle_min"])
        for key in ("idle_s", "duration_s"):
            if src.get(key) is not None:
                return float(src[key]) / 60.0
    return 0.0


def classify_idle(row: EventRow) -> tuple[str, float] | None:
    """(reason, minutes) for an idle event, else None."""
    if "idle" not in row.type:
        return None
    data = row.data or {}
    ctx = data.get("context") or {}
    reason = "waiting_for_truck" if ctx.get("waiting_for_truck") else "unexplained"
    return reason, idle_minutes(data)


def _day(ts: float) -> date:
    return datetime.fromtimestamp(ts, tz=timezone.utc).date()


def idle_by_machine(rows: list[EventRow], fuel_lph: float) -> dict[str, dict[str, Any]]:
    """Per-machine idle minutes by reason and estimated fuel (litres)."""
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        hit = classify_idle(row)
        if hit is None:
            continue
        reason, minutes = hit
        agg = out.setdefault(row.machine_id, {r + "_min": 0.0 for r in REASONS})
        agg[reason + "_min"] = round(agg[reason + "_min"] + minutes, 2)
    for agg in out.values():
        agg["total_min"] = round(sum(agg[r + "_min"] for r in REASONS), 2)
        agg["fuel_l_unexplained"] = round(agg["unexplained_min"] / 60.0 * fuel_lph, 2)
        agg["fuel_l_total"] = round(agg["total_min"] / 60.0 * fuel_lph, 2)
    return out


def idle_summary(s: Session, day: date | None = None) -> dict[str, Any]:
    """Idle breakdown per machine for one UTC day (default: the latest day with idle events)."""
    fuel_lph = float(load_yaml("cloud")["supervisor"]["idle_fuel_lph"])
    rows = [r for r in s.scalars(select(EventRow).order_by(EventRow.ts)) if "idle" in r.type]
    if day is None and rows:
        day = _day(rows[-1].ts)
    rows = [r for r in rows if day is not None and _day(r.ts) == day]
    machines = idle_by_machine(rows, fuel_lph)
    longest = sorted(
        ({"event_id": r.event_id, "ts": r.ts, "machine_id": r.machine_id, "operator_id": r.operator_id,
          "minutes": hit[1], "context": {k: v for k, v in ((r.data or {}).get("context") or {}).items()
                                          if k in ("task_type", "zone", "task_id", "waiting_for_truck")}}
         for r in rows if (hit := classify_idle(r)) and hit[0] == "unexplained"),
        key=lambda x: -x["minutes"])[:10]
    totals = {r + "_min": round(sum(m[r + "_min"] for m in machines.values()), 2) for r in REASONS}
    totals["total_min"] = round(sum(totals.values()), 2)
    totals["fuel_l_unexplained"] = round(totals["unexplained_min"] / 60.0 * fuel_lph, 2)
    totals["fuel_l_total"] = round(totals["total_min"] / 60.0 * fuel_lph, 2)
    return {"date": day.isoformat() if day else None,
            "machines": [{"machine_id": k, **v} for k, v in sorted(machines.items())],
            "totals": totals, "longest_unexplained": longest, "fuel_rate_lph": fuel_lph,
            "fuel_note": f"Estimated fuel = idle minutes × {fuel_lph} L/h SAMPLE planning figure (RULE).",
            "provenance": ["RULE", "SIMULATED"], "label": "SIMULATED"}
