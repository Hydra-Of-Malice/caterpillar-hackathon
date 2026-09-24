"""Helpers every Task Centre router reuses: settings, GMT strings, notifications, tickets, locations.

Signatures here are part of the build contract (``docs/taskcentre-contract.md``); other agents import
them. Rows are added and flushed but never committed: the request-scoped session commits (see
``sentinel.cloud.api.deps.get_session``).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared import config
from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import (GeofenceRow, LocationReportRow, NotificationRow, TicketRow,
                                              UserRow)

__all__ = ["new_id", "gmt_iso", "settings", "session_seconds", "notify", "open_ticket", "latest_location",
           "active_geofence", "record_location", "user_public", "location_public"]

DEFAULT_SETTINGS: dict[str, Any] = {
    "session_hours": 12,
    "nearest_operator": {"max_age_s": 600, "max_distance_m": 2000},
    "idle": {"threshold_s": 900, "cooldown_s": 600},
    "incident_dedupe_s": 300,
    "fleet": {"service_interval_h": 500, "due_soon_h": 50, "window_days": 7, "max_window_days": 90},
}


def settings() -> dict[str, Any]:
    """``config/taskcentre.yaml`` merged over :data:`DEFAULT_SETTINGS` (the file is optional)."""
    try:
        loaded = config.load_yaml("taskcentre") or {}
    except FileNotFoundError:
        loaded = {}
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in DEFAULT_SETTINGS.items()}
    for key, value in loaded.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key].update(value)
        else:
            out[key] = value
    return out


def session_seconds() -> float:
    """Bearer-token lifetime in seconds (``session_hours``, 12 h by default)."""
    return float(settings()["session_hours"]) * 3600.0


def gmt_iso(ts: float | None) -> str | None:
    """UTC ISO-8601 for API responses, e.g. ``2026-09-24T06:12:03Z``; ``None`` passes through."""
    if ts is None:
        return None
    return datetime.fromtimestamp(float(ts), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def notify(s: Session, user_id: str, *, kind: str, title: str, body: str = "", severity: str = "info",
           alarm: bool = False, link: str | None = None, incident_id: str | None = None,
           ticket_id: str | None = None) -> NotificationRow:
    """Queue one notification for a person. ``alarm=True`` drives the operator's critical alarm banner."""
    row = NotificationRow(notification_id=new_id("ntf"), user_id=user_id, ts=time.time(), kind=kind,
                          severity=severity, title=title, body=body, alarm=alarm, link=link,
                          incident_id=incident_id, ticket_id=ticket_id)
    s.add(row)
    s.flush()
    return row


def open_ticket(s: Session, *, site_id: str, kind: str, title: str, severity: str, owner_role: str,
                owner_user_id: str | None = None, subject_user_id: str | None = None, detail: str = "",
                evidence: dict[str, Any] | None = None, source: str = "SIMULATED",
                task_id: str | None = None, machine_id: str | None = None,
                incident_id: str | None = None) -> TicketRow:
    """Open a review ticket. ``owner_role``/``owner_user_id`` decide whose queue it lands in."""
    row = TicketRow(ticket_id=new_id("tkt"), site_id=site_id, kind=kind, severity=severity, status="open",
                    subject_user_id=subject_user_id, owner_role=owner_role, owner_user_id=owner_user_id,
                    title=title, detail=detail, source=source, evidence=evidence or {},
                    created_at=time.time(), task_id=task_id, machine_id=machine_id, incident_id=incident_id)
    s.add(row)
    s.flush()
    return row


def latest_location(s: Session, user_id: str) -> LocationReportRow | None:
    """The freshest position reported for a person, or ``None`` when they have never reported one."""
    # Tie-break on insertion order: the system clock is coarse enough that two reports written in the
    # same request (e.g. the login report and a punch) can share a ts, and the newer one must win.
    stmt = select(LocationReportRow).where(LocationReportRow.user_id == user_id) \
        .order_by(LocationReportRow.ts.desc(), LocationReportRow.id.desc()).limit(1)
    return s.execute(stmt).scalars().first()


def active_geofence(s: Session, site_id: str) -> GeofenceRow | None:
    """The site's active fence (the first one, if a site ever has several)."""
    stmt = select(GeofenceRow).where(GeofenceRow.site_id == site_id, GeofenceRow.active.is_(True)) \
        .order_by(GeofenceRow.geofence_id)
    return s.execute(stmt).scalars().first()


def record_location(s: Session, user_id: str, *, ts: float, lat: float | None, lon: float | None,
                    accuracy_m: float | None, geofence_status: str,
                    source: str = "browser") -> LocationReportRow:
    """Append a position report (append-only history; ``latest_location`` reads the newest)."""
    row = LocationReportRow(user_id=user_id, ts=ts, lat=lat, lon=lon, accuracy_m=accuracy_m,
                            geofence_status=geofence_status, source=source)
    s.add(row)
    s.flush()
    return row


def user_public(user: UserRow) -> dict[str, Any]:
    """The user shape every Task Centre response uses (never includes the password hash)."""
    return {"user_id": user.user_id, "username": user.username, "name": user.name, "role": user.role,
            "site_id": user.site_id, "supervisor_id": user.supervisor_id, "machine_id": user.machine_id,
            "active": bool(user.active)}


def location_public(row: LocationReportRow | None, *, now: float | None = None) -> dict[str, Any] | None:
    """A position report for the API: coordinates, geofence status and how old the fix is."""
    if row is None:
        return None
    now = time.time() if now is None else now
    return {"ts": row.ts, "ts_gmt": gmt_iso(row.ts), "age_s": round(max(0.0, now - row.ts), 1),
            "lat": row.lat, "lon": row.lon, "accuracy_m": row.accuracy_m,
            "geofence_status": row.geofence_status, "source": row.source}
