"""Idempotent batch ingest from the edge outbox: `{items: [{uuid, kind, payload}]}`.

Each item upserts by its natural id (event_id, alert_id, ...) or, when the payload has none, by the
outbox uuid, so re-sending a batch never duplicates rows. Exposure upserts by
(operator, shift, task type). Items are validated first; invalid items are rejected individually
and the rest of the batch is still written.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared import config
from sentinel.shared.schemas import Alert, Event, FeatureWindow, Incident
from sentinel.store.models import (AlertRow, BreakLogRow, EventRow, ExposureRow, FeatureWindowRow, IncidentRow,
                                   MachineRow, OperatorRow, ShiftRow, TaskRow)

SHIFT_LEN_S = 8.5 * 3600


class ItemRejected(ValueError):
    """Payload failed boundary validation."""


@dataclass(frozen=True)
class Parsed:
    uuid: str
    kind: str
    data: Any


def _model(cls: type[BaseModel], id_field: str) -> Callable[[str, dict[str, Any]], BaseModel]:
    def parse(uuid: str, payload: dict[str, Any]) -> BaseModel:
        return cls.model_validate({id_field: uuid, **payload})
    return parse


def _require(payload: dict[str, Any], *keys: str) -> None:
    missing = [k for k in keys if payload.get(k) in (None, "")]
    if missing:
        raise ItemRejected(f"missing required fields: {missing}")


def _parse_exposure(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    _require(p, "operator_id", "shift_id", "task_type")
    return {"operator_id": p["operator_id"], "shift_id": p["shift_id"], "task_type": p["task_type"],
            "operating_h": float(p.get("operating_h", 0.0)), "cycles": int(p.get("cycles", 0)),
            "truck_approach_cycles": int(p.get("truck_approach_cycles", 0))}


def _parse_shift(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    _require(p, "operator_id", "machine_id")
    start = p.get("planned_start", p.get("started_at"))
    if start is None:
        raise ItemRejected("shift needs planned_start or started_at")
    return {"shift_id": p.get("shift_id") or uuid, "site_id": p.get("site_id") or config.SITE_ID,
            "planned_start": float(start), "planned_end": float(p.get("planned_end") or float(start) + SHIFT_LEN_S),
            **{k: p[k] for k in ("operator_id", "machine_id", "started_at", "ended_at", "status",
                                 "privacy_ack", "conditions", "simulated") if k in p}}


def _parse_task(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    _require(p, "shift_id", "name", "type", "planned_qty")
    return {"task_id": p.get("task_id") or uuid, **p}


def _parse_break(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    _require(p, "shift_id", "operator_id", "started_at")
    return {k: p.get(k) for k in ("shift_id", "operator_id", "started_at", "ended_at", "kss")}


def _parse_health(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    return {"machine_id": p.get("machine_id") or config.MACHINE_ID, "health": dict(p)}


def _parse_operator(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    _require(p, "name")
    return {"operator_id": p.get("operator_id") or uuid, **p}


def _parse_machine(uuid: str, p: dict[str, Any]) -> dict[str, Any]:
    _require(p, "model", "machine_type")
    return {"machine_id": p.get("machine_id") or uuid, "site_id": p.get("site_id") or config.SITE_ID, **p}


PARSERS: dict[str, Callable[[str, dict[str, Any]], Any]] = {
    "event": _model(Event, "event_id"),
    "alert": _model(Alert, "alert_id"),
    "incident": _model(Incident, "incident_id"),
    "feature_window": _model(FeatureWindow, "window_id"),
    "exposure": _parse_exposure,
    "shift": _parse_shift,
    "task": _parse_task,
    "break": _parse_break,
    "health": _parse_health,
    "operator": _parse_operator,
    "machine": _parse_machine,
}


def _merge_columns(s: Session, model: type, pk: str, values: dict[str, Any]) -> str:
    """Insert or update a row from a dict; unknown keys go to `meta` when the model has one."""
    columns = {c.key for c in model.__table__.columns}
    known = {k: v for k, v in values.items() if k in columns}
    extra = {k: v for k, v in values.items() if k not in columns}
    row = s.get(model, values[pk])
    outcome = "updated" if row is not None else "inserted"
    if row is None:
        row = model(**known)
        s.add(row)
    else:
        for k, v in known.items():
            setattr(row, k, v)
    if extra and "meta" in columns:
        row.meta = {**(row.meta or {}), **extra}
    return outcome


def _write_event(s: Session, ev: Event) -> str:
    outcome = "updated" if s.get(EventRow, ev.event_id) else "inserted"
    s.merge(EventRow(event_id=ev.event_id, ts=ev.ts, operator_id=ev.operator_id, machine_id=ev.machine_id,
                     shift_id=ev.shift_id, type=ev.type, category=ev.category.value,
                     tier=ev.tier.value if ev.tier else None, attribution=ev.attribution.value,
                     data=ev.model_dump(mode="json")))
    return outcome


def _write_alert(s: Session, al: Alert, raw: dict[str, Any]) -> str:
    existing = s.get(AlertRow, al.alert_id)
    data = al.model_dump(mode="json")
    if existing is not None and "resolution" in (existing.data or {}):
        data["resolution"] = existing.data["resolution"]      # cloud-side supervisor resolution survives re-sync
    s.merge(AlertRow(alert_id=al.alert_id, event_id=al.event_id, ts=al.ts, operator_id=al.operator_id,
                     machine_id=al.machine_id, tier=al.tier.value, state=al.state.value,
                     t_render_ns=raw.get("t_render_ns"), data=data))
    return "updated" if existing is not None else "inserted"


def _write_incident(s: Session, inc: Incident) -> str:
    outcome = "updated" if s.get(IncidentRow, inc.incident_id) else "inserted"
    s.merge(IncidentRow(incident_id=inc.incident_id, ts=inc.ts, operator_id=inc.operator_id,
                        machine_id=inc.machine_id, source=inc.source, type=inc.type, severity=inc.severity,
                        status=inc.status, data=inc.model_dump(mode="json")))
    return outcome


def _write_window(s: Session, fw: FeatureWindow) -> str:
    outcome = "updated" if s.get(FeatureWindowRow, fw.window_id) else "inserted"
    s.merge(FeatureWindowRow(window_id=fw.window_id, t_end=fw.t_end, operator_id=fw.operator_id,
                             shift_id=fw.shift_id, context_key=fw.context_key, percentile=fw.percentile,
                             data=fw.model_dump(mode="json")))
    return outcome


def _write_exposure(s: Session, v: dict[str, Any]) -> str:
    row = s.scalars(select(ExposureRow).where(ExposureRow.operator_id == v["operator_id"],
                                              ExposureRow.shift_id == v["shift_id"],
                                              ExposureRow.task_type == v["task_type"])).first()
    outcome = "updated" if row is not None else "inserted"
    if row is None:
        row = ExposureRow(operator_id=v["operator_id"], shift_id=v["shift_id"], task_type=v["task_type"])
        s.add(row)
    row.operating_h, row.cycles, row.truck_approach_cycles = v["operating_h"], v["cycles"], v["truck_approach_cycles"]
    return outcome


def _write_break(s: Session, v: dict[str, Any]) -> str:
    row = s.scalars(select(BreakLogRow).where(BreakLogRow.shift_id == v["shift_id"],
                                              BreakLogRow.started_at == v["started_at"])).first()
    outcome = "updated" if row is not None else "inserted"
    if row is None:
        row = BreakLogRow(shift_id=v["shift_id"], operator_id=v["operator_id"], started_at=v["started_at"])
        s.add(row)
    row.ended_at, row.kss = v["ended_at"], v["kss"]
    return outcome


def _write_health(s: Session, v: dict[str, Any]) -> str:
    row = s.get(MachineRow, v["machine_id"])
    outcome = "updated" if row is not None else "inserted"
    if row is None:
        row = MachineRow(machine_id=v["machine_id"], model="unknown", machine_type="EX-20t",
                         site_id=config.SITE_ID, meta={})
        s.add(row)
    row.meta = {**(row.meta or {}), "health": {**v["health"], "received_at": time.time()}}
    return outcome


def _write(s: Session, item: Parsed, raw: dict[str, Any]) -> str:
    kind, data = item.kind, item.data
    if kind == "event":
        return _write_event(s, data)
    if kind == "alert":
        return _write_alert(s, data, raw)
    if kind == "incident":
        return _write_incident(s, data)
    if kind == "feature_window":
        return _write_window(s, data)
    if kind == "exposure":
        return _write_exposure(s, data)
    if kind == "break":
        return _write_break(s, data)
    if kind == "health":
        return _write_health(s, data)
    model, pk = {"shift": (ShiftRow, "shift_id"), "task": (TaskRow, "task_id"),
                 "operator": (OperatorRow, "operator_id"), "machine": (MachineRow, "machine_id")}[kind]
    return _merge_columns(s, model, pk, data)


def ingest_batch(s: Session, items: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate every item, then upsert the valid ones. Returns counts and per-item rejections."""
    parsed: list[tuple[Parsed, dict[str, Any]]] = []
    rejected: list[dict[str, Any]] = []
    for item in items:
        uuid, kind, payload = item.get("uuid"), item.get("kind"), item.get("payload")
        try:
            if not uuid or not isinstance(payload, dict):
                raise ItemRejected("item needs a uuid and an object payload")
            if kind not in PARSERS:
                raise ItemRejected(f"unknown kind {kind!r}; accepted: {sorted(PARSERS)}")
            parsed.append((Parsed(uuid, kind, PARSERS[kind](uuid, payload)), payload))
        except (ItemRejected, ValidationError, TypeError, ValueError) as exc:
            rejected.append({"uuid": uuid, "kind": kind, "error": str(exc)[:500]})
    counts = {"inserted": 0, "updated": 0}
    for item, raw in parsed:
        counts[_write(s, item, raw)] += 1
        s.flush()
    return {"received": len(items), "accepted": len(parsed), **counts, "rejected": rejected,
            "accepted_uuids": [p.uuid for p, _ in parsed]}
