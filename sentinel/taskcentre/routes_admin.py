"""Task Centre admin router: site-wide views and ticket review decisions.

Every route here is admin-only; the guard is a dependency, so the 403 comes from the API and not
from a hidden button. Two honesty rules shape the payloads:

* **Nothing is claimed to be live because a row exists.** Machines, cameras and people all carry the
  timestamp they were last heard from plus ``age_s`` and ``stale``. A camera with no recent frame is
  reported ``unavailable``, never as a live stream, and a machine whose signals are old reads
  ``no_recent_data`` rather than ``ok``.
* **Location is an indication of presence, never proof** (see the ``disclaimer`` field). A fix that is
  missing or too coarse is ``unverified``, never ``outside``.

A review decision appends a ``tc_review_decision`` row and only ever moves the ticket's ``status``;
the original ticket text, severity, evidence and timestamps are left exactly as they were recorded.
All times are UTC seconds with a ``<field>_gmt`` ISO twin, labelled GMT in the UI.
"""
from __future__ import annotations

import time
from typing import Any, Iterable, Sequence

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import (CameraRow, GeofenceRow, PunchRow, ReviewDecisionRow,
                                              TcIncidentRow, TicketRow, UserRow)
from sentinel.taskcentre.auth import require_role
from sentinel.taskcentre.foresight import CAVEATS as FORESIGHT_CAVEATS
from sentinel.taskcentre.foresight import HONESTY_NOTE as FORESIGHT_NOTE
from sentinel.taskcentre.foresight import site_foresight
from sentinel.taskcentre.geo import classify
from sentinel.taskcentre.service import (gmt_iso, latest_location, location_public, notify, open_ticket,
                                         settings, user_public)

router = APIRouter(prefix="/tc/admin", tags=["task-centre-admin"])

#: Freshness limits in seconds, and the config/taskcentre.yaml key that overrides each one.
STALE_DEFAULTS: dict[str, float] = {"location_s": 600.0, "camera_s": 300.0, "machine_s": 900.0}
STALE_KEYS: dict[str, str] = {"location_s": "stale_location_s", "camera_s": "stale_camera_s",
                              "machine_s": "stale_machine_s"}

LOCATION_DISCLAIMER = ("Location is an indication of presence reported by a person's device, not proof "
                       "of where they are. A stale or unverified fix says nothing about their current "
                       "position and must not be used as evidence.")
FRESHNESS_DISCLAIMER = ("Nothing here is live telemetry. Each row reports when it was last heard from; "
                        "treat anything marked stale as unknown, not as online.")

#: Decisions a reviewer may record, and the ticket status each one moves the ticket to.
DECISIONS: tuple[str, ...] = ("confirmed", "dismissed", "resolved", "more_info", "acknowledged")
DECISION_STATUS: dict[str, str] = {"confirmed": "confirmed", "dismissed": "dismissed", "resolved": "resolved"}
OPEN_STATUS = "open"


class DecisionIn(BaseModel):
    """An admin's review of a ticket. The ticket's own record is never rewritten."""
    decision: str = Field(description="confirmed | dismissed | resolved | more_info | acknowledged")
    comment: str = Field(default="", max_length=2000)


# ---------------------------------------------------------------- small helpers
def staleness() -> dict[str, float]:
    """Freshness limits for locations, camera frames and machine signals (``stale_*_s`` in the config).

    ``stale_location_s`` is deliberately the same value the dispatcher uses for ``max_age_s``: a fix
    too old to dispatch on is too old to draw as somebody's current position.
    """
    configured = settings()
    return {key: float(configured.get(STALE_KEYS[key], default))
            for key, default in STALE_DEFAULTS.items()}


def _stamps(**values: float | None) -> dict[str, Any]:
    """``{"ts": 1.0, "ts_gmt": "...Z"}`` for each keyword: raw UTC seconds plus its GMT ISO string."""
    out: dict[str, Any] = {}
    for key, value in values.items():
        out[key] = value
        out[f"{key}_gmt"] = gmt_iso(value)
    return out


def _age_s(now: float, ts: float | None) -> float | None:
    """Seconds since `ts`, or ``None`` when there is no such timestamp (never a negative age)."""
    return None if ts is None else round(max(0.0, now - ts), 1)


def _is_stale(age_s: float | None, limit_s: float) -> bool:
    """Missing data is stale: absence of a signal is never treated as a fresh one."""
    return age_s is None or age_s > limit_s


def _brief(user: UserRow | None) -> dict[str, Any] | None:
    """Just enough to label a person in a list (``None`` when the id resolves to nobody)."""
    if user is None:
        return None
    return {"user_id": user.user_id, "name": user.name, "username": user.username, "role": user.role}


def _users_by_id(s: Session) -> dict[str, UserRow]:
    return {u.user_id: u for u in s.execute(select(UserRow).order_by(UserRow.name)).scalars()}


def _fences_by_site(s: Session) -> dict[str, GeofenceRow]:
    """Active fence per site, so a whole-site view classifies positions without a query per person."""
    fences: dict[str, GeofenceRow] = {}
    stmt = select(GeofenceRow).where(GeofenceRow.active.is_(True)).order_by(GeofenceRow.geofence_id)
    for fence in s.execute(stmt).scalars():
        fences.setdefault(fence.site_id, fence)
    return fences


def _latest_punch(s: Session, user_id: str) -> PunchRow | None:
    stmt = select(PunchRow).where(PunchRow.user_id == user_id).order_by(PunchRow.ts.desc()).limit(1)
    return s.execute(stmt).scalars().first()


def _bump(bucket: dict[str, dict[str, int]], key: str, *, closed: bool) -> None:
    """Count one ticket into ``bucket[key]`` as open or closed."""
    slot = bucket.setdefault(key or "unknown", {"open": 0, "closed": 0})
    slot["closed" if closed else "open"] += 1


def _ticket_counts(tickets: Iterable[TicketRow]) -> dict[str, Any]:
    """Open/closed totals for a set of tickets, broken down by kind and by severity."""
    by_kind: dict[str, dict[str, int]] = {}
    by_severity: dict[str, dict[str, int]] = {}
    total = {"open": 0, "closed": 0}
    for ticket in tickets:
        closed = ticket.status != OPEN_STATUS
        total["closed" if closed else "open"] += 1
        _bump(by_kind, ticket.kind, closed=closed)
        _bump(by_severity, ticket.severity, closed=closed)
    return {"open": total["open"], "closed": total["closed"], "total": total["open"] + total["closed"],
            "by_kind": by_kind, "by_severity": by_severity}


# ---------------------------------------------------------------- payload builders
def _person_payload(s: Session, user: UserRow, *, now: float, stale_after_s: float,
                    fence: GeofenceRow | None, users: dict[str, UserRow]) -> dict[str, Any]:
    """One person's row for ``/people``: identity, freshest position and their last punch."""
    row = latest_location(s, user.user_id)
    location = location_public(row, now=now)
    if location is not None:
        status, distance_m = classify(row.lat, row.lon, row.accuracy_m, fence)
        location["stale"] = _is_stale(location["age_s"], stale_after_s)
        location["distance_m"] = None if distance_m is None else round(distance_m, 1)
        location["geofence_recheck"] = status          # same fix re-checked against today's active fence
        location["geofence_id"] = None if fence is None else fence.geofence_id
    punch = _latest_punch(s, user.user_id)
    payload = user_public(user)
    payload.update({
        "supervisor": _brief(users.get(user.supervisor_id or "")),
        "location": location,
        "presence": _presence(location),
        "last_punch": None if punch is None else {
            "punch_id": punch.punch_id, "kind": punch.kind, "geofence_status": punch.geofence_status,
            "distance_m": punch.distance_m, "ticket_id": punch.ticket_id,
            "age_s": _age_s(now, punch.ts), **_stamps(ts=punch.ts)},
    })
    return payload


def _presence(location: dict[str, Any] | None) -> str:
    """``on_site|off_site|unverified|stale|never_reported`` -- stale is its own answer, not 'on site'."""
    if location is None:
        return "never_reported"
    if location["stale"]:
        return "stale"
    return {"inside": "on_site", "outside": "off_site"}.get(location["geofence_status"], "unverified")


def _camera_payload(camera: CameraRow, *, now: float, stale_after_s: float) -> dict[str, Any]:
    """One camera, with an ``unavailable`` state whenever its last frame is missing or old."""
    age_s = _age_s(now, camera.last_frame_ts)
    stale = _is_stale(age_s, stale_after_s)
    if camera.stream_kind == "unavailable":
        state, reason = "unavailable", "reported_unavailable"
    elif camera.last_frame_ts is None:
        state, reason = "unavailable", "no_frame_received"
    elif stale:
        state, reason = "unavailable", "last_frame_older_than_threshold"
    else:
        state, reason = camera.stream_kind, None
    return {"camera_id": camera.camera_id, "site_id": camera.site_id, "machine_id": camera.machine_id,
            "label": camera.label, "reported_stream_kind": camera.stream_kind, "state": state,
            "available": state != "unavailable", "unavailable_reason": reason, "age_s": age_s,
            "stale": stale, "stale_after_s": stale_after_s, "meta": camera.meta or {},
            **_stamps(last_frame_ts=camera.last_frame_ts)}


def _decision_payload(row: ReviewDecisionRow, users: dict[str, UserRow]) -> dict[str, Any]:
    reviewer = users.get(row.reviewer_id)
    return {"id": row.id, "ticket_id": row.ticket_id, "reviewer_id": row.reviewer_id,
            "reviewer_name": None if reviewer is None else reviewer.name,
            "reviewer_role": row.reviewer_role, "decision": row.decision, "comment": row.comment,
            "data": row.data or {}, **_stamps(ts=row.ts)}


def _ticket_payload(ticket: TicketRow, decisions: Sequence[ReviewDecisionRow], users: dict[str, UserRow],
                    *, now: float) -> dict[str, Any]:
    """A ticket plus its full review history, oldest decision first, so the audit trail is visible."""
    return {"ticket_id": ticket.ticket_id, "site_id": ticket.site_id, "kind": ticket.kind,
            "severity": ticket.severity, "status": ticket.status, "open": ticket.status == OPEN_STATUS,
            "title": ticket.title, "detail": ticket.detail, "source": ticket.source,
            "evidence": ticket.evidence or {}, "task_id": ticket.task_id, "machine_id": ticket.machine_id,
            "incident_id": ticket.incident_id, "owner_role": ticket.owner_role,
            "owner_user_id": ticket.owner_user_id, "subject_user_id": ticket.subject_user_id,
            "owner_user": _brief(users.get(ticket.owner_user_id or "")),
            "subject_user": _brief(users.get(ticket.subject_user_id or "")),
            "age_s": _age_s(now, ticket.created_at), "decision_count": len(decisions),
            "decisions": [_decision_payload(d, users) for d in decisions],
            **_stamps(created_at=ticket.created_at)}


def _decisions_by_ticket(s: Session, ticket_ids: Sequence[str]) -> dict[str, list[ReviewDecisionRow]]:
    """Review history for these tickets, oldest first (append-only: nothing is ever replaced)."""
    out: dict[str, list[ReviewDecisionRow]] = {ticket_id: [] for ticket_id in ticket_ids}
    if not ticket_ids:
        return out
    stmt = select(ReviewDecisionRow).where(ReviewDecisionRow.ticket_id.in_(list(ticket_ids))) \
        .order_by(ReviewDecisionRow.ts.asc(), ReviewDecisionRow.id.asc())
    for row in s.execute(stmt).scalars():
        out.setdefault(row.ticket_id, []).append(row)
    return out


# ---------------------------------------------------------------- routes
@router.get("/overview")
def get_overview(s: Session = Depends(get_session),
                 _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Site-wide picture: machines with cameras, ticket/incident counts and explicit staleness.

    A machine's ``status`` is derived from its open incidents and tickets; when the newest signal is
    older than the machine threshold it reads ``no_recent_data`` instead of ``ok``. ``people.on_site``
    counts only people whose *fresh* fix places them inside the fence.
    """
    now = time.time()
    limits = staleness()
    users = _users_by_id(s)
    machines = {m.machine_id: m for m in s.execute(select(MachineRow).order_by(MachineRow.machine_id)).scalars()}
    cameras = list(s.execute(select(CameraRow).order_by(CameraRow.camera_id)).scalars())
    tickets = list(s.execute(select(TicketRow)).scalars())
    incidents = list(s.execute(select(TcIncidentRow)).scalars())

    machine_ids = sorted({*machines, *(c.machine_id for c in cameras if c.machine_id),
                          *(t.machine_id for t in tickets if t.machine_id),
                          *(i.machine_id for i in incidents if i.machine_id)})
    rows: list[dict[str, Any]] = []
    for machine_id in machine_ids:
        machine = machines.get(machine_id)
        machine_cameras = [c for c in cameras if c.machine_id == machine_id]
        camera_payloads = [_camera_payload(c, now=now, stale_after_s=limits["camera_s"]) for c in machine_cameras]
        machine_tickets = [t for t in tickets if t.machine_id == machine_id]
        machine_incidents = [i for i in incidents if i.machine_id == machine_id]
        open_incidents = [i for i in machine_incidents if i.acknowledged_at is None]
        frame_times = [c.last_frame_ts for c in machine_cameras if c.last_frame_ts is not None]
        signal_times = [*frame_times, *(i.ts for i in machine_incidents)]
        last_seen_ts = max(signal_times) if signal_times else None
        last_seen_source = None
        if last_seen_ts is not None:
            last_seen_source = "camera_frame" if last_seen_ts in frame_times else "incident"
        age_s = _age_s(now, last_seen_ts)
        stale = _is_stale(age_s, limits["machine_s"])
        counts = _ticket_counts(machine_tickets)
        status = _machine_status(counts, open_incidents, stale=stale)
        rows.append({
            "machine_id": machine_id, "registered": machine is not None,
            "model": None if machine is None else machine.model,
            "machine_type": None if machine is None else machine.machine_type,
            "site_id": None if machine is None else machine.site_id,
            "status": status, "stale": stale, "age_s": age_s, "last_seen_source": last_seen_source,
            "stale_after_s": limits["machine_s"],
            "camera_count": len(machine_cameras),
            "cameras_available": sum(1 for c in camera_payloads if c["available"]),
            "cameras_stale": sum(1 for c in camera_payloads if c["stale"]),
            "cameras": camera_payloads,
            "tickets": counts,
            "incidents": {"total": len(machine_incidents), "open": len(open_incidents),
                          "no_eligible_operator": sum(1 for i in machine_incidents
                                                      if i.dispatch_status == "no_eligible_operator")},
            "assigned_user_ids": sorted(u.user_id for u in users.values() if u.machine_id == machine_id),
            **_stamps(last_seen_ts=last_seen_ts),
        })

    people = _people_counts(s, users, now=now, stale_after_s=limits["location_s"])
    camera_payloads = [_camera_payload(c, now=now, stale_after_s=limits["camera_s"]) for c in cameras]
    return {
        "machines": rows,
        "totals": {
            "machines": len(machine_ids),
            "cameras": len(cameras),
            "cameras_available": sum(1 for c in camera_payloads if c["available"]),
            "cameras_stale": sum(1 for c in camera_payloads if c["stale"]),
            "tickets": _ticket_counts(tickets),
            "incidents": {"total": len(incidents),
                          "open": sum(1 for i in incidents if i.acknowledged_at is None),
                          "acknowledged": sum(1 for i in incidents if i.acknowledged_at is not None),
                          "no_eligible_operator": sum(1 for i in incidents
                                                      if i.dispatch_status == "no_eligible_operator")},
            "people": people,
        },
        "staleness_s": limits,
        "disclaimer": FRESHNESS_DISCLAIMER,
        **_stamps(now_ts=now),
    }


def _machine_status(counts: dict[str, Any], open_incidents: Sequence[TcIncidentRow], *, stale: bool) -> str:
    """``incident|attention|flagged|no_recent_data|ok`` -- never ``ok`` while the signals are stale."""
    if open_incidents:
        return "incident"
    severities = counts["by_severity"]
    if any(severities.get(level, {}).get("open", 0) for level in ("critical", "high")):
        return "attention"
    if counts["open"]:
        return "flagged"
    return "no_recent_data" if stale else "ok"


def _people_counts(s: Session, users: dict[str, UserRow], *, now: float,
                   stale_after_s: float) -> dict[str, int]:
    """Headcount by presence. ``on_site`` requires a fresh fix inside the fence, nothing weaker."""
    counts = {"total": len(users), "active": 0, "on_site": 0, "off_site": 0, "unverified": 0,
              "stale": 0, "never_reported": 0}
    for user in users.values():
        if user.active:
            counts["active"] += 1
        row = latest_location(s, user.user_id)
        location = location_public(row, now=now)
        if location is not None:
            location["stale"] = _is_stale(location["age_s"], stale_after_s)
        counts[_presence(location)] += 1
    return counts


@router.get("/people")
def get_people(stale_after_s: float | None = Query(default=None, gt=0,
                                            description="freshness limit for a position (default 600 s)"),
               role: str | None = Query(default=None, description="filter by admin|supervisor|operator"),
               s: Session = Depends(get_session),
               _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Everyone on site with their freshest position, geofence status, age, staleness and last punch.

    The position is what a device reported, not proof of presence: read ``disclaimer`` before acting
    on it. ``geofence_status`` is the status recorded with the fix; ``geofence_recheck`` re-runs the
    same fix against the site's current active fence.
    """
    now = time.time()
    limit_s = staleness()["location_s"] if stale_after_s is None else float(stale_after_s)
    users = _users_by_id(s)
    fences = _fences_by_site(s)
    people = [_person_payload(s, user, now=now, stale_after_s=limit_s, fence=fences.get(user.site_id),
                              users=users)
              for user in users.values() if role is None or user.role == role]
    return {"people": people, "count": len(people), "stale_after_s": limit_s,
            "filters": {"role": role}, "disclaimer": LOCATION_DISCLAIMER, **_stamps(now_ts=now)}


@router.get("/tickets")
def get_tickets(status: str | None = Query(default=None, description="open|confirmed|dismissed|resolved"),
                kind: str | None = Query(default=None),
                user: str | None = Query(default=None, description="user id; subject or owner"),
                machine: str | None = Query(default=None, description="machine id"),
                s: Session = Depends(get_session),
                _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Site-wide tickets, newest first, each with its full review history (oldest decision first)."""
    now = time.time()
    stmt = select(TicketRow)
    if status:
        stmt = stmt.where(TicketRow.status == status)
    if kind:
        stmt = stmt.where(TicketRow.kind == kind)
    if machine:
        stmt = stmt.where(TicketRow.machine_id == machine)
    if user:
        stmt = stmt.where((TicketRow.subject_user_id == user) | (TicketRow.owner_user_id == user))
    tickets = list(s.execute(stmt.order_by(TicketRow.created_at.desc())).scalars())
    users = _users_by_id(s)
    history = _decisions_by_ticket(s, [t.ticket_id for t in tickets])
    return {"tickets": [_ticket_payload(t, history.get(t.ticket_id, []), users, now=now) for t in tickets],
            "count": len(tickets), "counts": _ticket_counts(tickets),
            "filters": {"status": status, "kind": kind, "user": user, "machine": machine},
            **_stamps(now_ts=now)}


@router.post("/tickets/{ticket_id}/decision")
def post_decision(ticket_id: str, body: DecisionIn, s: Session = Depends(get_session),
                  admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Record an admin's review of a ticket and tell the people it concerns.

    The decision is **appended** to the ticket's history; the original ticket text, severity, evidence
    and creation time are never rewritten. ``confirmed``/``dismissed``/``resolved`` move the ticket's
    status, while ``more_info`` and ``acknowledged`` leave it open. 404 for an unknown ticket.
    """
    now = time.time()
    ticket = s.get(TicketRow, ticket_id)
    if ticket is None:
        raise HTTPException(404, f"ticket {ticket_id!r} not found")
    if body.decision not in DECISIONS:
        raise HTTPException(400, f"decision {body.decision!r} not allowed; use one of {list(DECISIONS)}")

    previous_status = ticket.status
    decision = ReviewDecisionRow(ticket_id=ticket.ticket_id, reviewer_id=admin.user_id,
                                 reviewer_role=admin.role, decision=body.decision, comment=body.comment,
                                 ts=now, data={"previous_status": previous_status})
    s.add(decision)
    ticket.status = DECISION_STATUS.get(body.decision, previous_status)
    s.flush()

    notified = _notify_ticket_parties(s, ticket, admin, decision=body.decision, comment=body.comment)
    users = _users_by_id(s)
    history = _decisions_by_ticket(s, [ticket.ticket_id])[ticket.ticket_id]
    return {"ticket": _ticket_payload(ticket, history, users, now=now),
            "decision": _decision_payload(decision, users),
            "previous_status": previous_status, "status": ticket.status,
            "notified_user_ids": notified, "notified_users": [_brief(users.get(uid)) for uid in notified],
            **_stamps(now_ts=now)}


def _notify_ticket_parties(s: Session, ticket: TicketRow, admin: UserRow, *, decision: str,
                           comment: str) -> list[str]:
    """Notify the ticket's subject and owner (once each, never the reviewer themselves)."""
    recipients: list[str] = []
    for user_id in (ticket.subject_user_id, ticket.owner_user_id):
        if user_id and user_id != admin.user_id and user_id not in recipients:
            recipients.append(user_id)
    severity = ticket.severity if decision == "confirmed" else "info"
    body = f"{admin.name} recorded '{decision}' on: {ticket.title}."
    for user_id in recipients:
        notify(s, user_id, kind="ticket", title=f"Ticket {decision} by admin",
               body=f"{body} {comment}".strip(), severity=severity, ticket_id=ticket.ticket_id)
    return recipients


@router.get("/cameras")
def get_cameras(s: Session = Depends(get_session),
                _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Every camera with its machine and frame freshness; no recent frame reports ``unavailable``."""
    now = time.time()
    limit_s = staleness()["camera_s"]
    machines = {m.machine_id: m for m in s.execute(select(MachineRow)).scalars()}
    cameras = list(s.execute(select(CameraRow).order_by(CameraRow.camera_id)).scalars())
    rows = []
    for camera in cameras:
        payload = _camera_payload(camera, now=now, stale_after_s=limit_s)
        machine = machines.get(camera.machine_id or "")
        payload["machine"] = None if machine is None else {"machine_id": machine.machine_id,
                                                           "model": machine.model,
                                                           "machine_type": machine.machine_type,
                                                           "site_id": machine.site_id}
        rows.append(payload)
    return {"cameras": rows, "count": len(rows), "stale_after_s": limit_s,
            "available": sum(1 for c in rows if c["available"]),
            "unavailable": sum(1 for c in rows if not c["available"]),
            "disclaimer": FRESHNESS_DISCLAIMER, **_stamps(now_ts=now)}


@router.get("/incidents")
def get_incidents(s: Session = Depends(get_session),
                  _admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Every incident with its nearest-operator result, dispatch status and who was notified.

    ``dispatch_status == "no_eligible_operator"`` means nobody qualified: no operator is invented for
    the sake of a filled field, and ``nearest_user`` is then ``null``.
    """
    now = time.time()
    users = _users_by_id(s)
    incidents = list(s.execute(select(TcIncidentRow).order_by(TcIncidentRow.ts.desc())).scalars())
    rows = []
    for incident in incidents:
        notified_ids = list(incident.notified_user_ids or [])
        rows.append({
            "incident_id": incident.incident_id, "site_id": incident.site_id,
            "machine_id": incident.machine_id, "kind": incident.kind, "severity": incident.severity,
            "lat": incident.lat, "lon": incident.lon, "detail": incident.detail,
            "source": incident.source, "dispatch_status": incident.dispatch_status,
            "nearest_user_id": incident.nearest_user_id,
            "nearest_user": _brief(users.get(incident.nearest_user_id or "")),
            "nearest_distance_m": incident.nearest_distance_m,
            "acknowledged": incident.acknowledged_at is not None,
            "acknowledged_by": incident.acknowledged_by,
            "acknowledged_by_user": _brief(users.get(incident.acknowledged_by or "")),
            "notified_user_ids": notified_ids,
            "notified_users": [_brief(users.get(uid)) or {"user_id": uid, "name": None, "username": None,
                                                          "role": None} for uid in notified_ids],
            "age_s": _age_s(now, incident.ts), "dedupe_key": incident.dedupe_key,
            "data": incident.data or {},
            **_stamps(ts=incident.ts, acknowledged_at=incident.acknowledged_at),
        })
    return {"incidents": rows, "count": len(rows),
            "open": sum(1 for r in rows if not r["acknowledged"]),
            "no_eligible_operator": sum(1 for r in rows
                                        if r["dispatch_status"] == "no_eligible_operator"),
            **_stamps(now_ts=now)}


# ---------------------------------------------------------------- risk foresight
#: Ticket severity per foresight likelihood band. `critical` is deliberately never used: a rule
#: reading recorded facts must not outrank a real critical incident in the same queue.
FORESIGHT_SEVERITY: dict[str, str] = {"high": "high", "elevated": "medium", "moderate": "medium",
                                      "low": "low"}

FORESIGHT_ACTED = "acted"


class ForesightActIn(BaseModel):
    """Which suggested action the admin is routing, and anything they want on the record with it."""
    action: str = Field(min_length=1, description="an `action` from the item's recommended_actions")
    comment: str = Field(default="", max_length=2000)


@router.get("/foresight")
def get_foresight(site_id: str | None = Query(default=None, description="defaults to the admin's site"),
                  s: Session = Depends(get_session),
                  admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """The site's risk register: what the recorded facts could lead to, and who should act.

    **Rule-based, never predictive.** Each item names the facts it fired on (`basis`), carries
    `source: "RULE"` with a limitation `note`, and reports a `likelihood` that is the band of the rule
    that fired - not a probability. An empty `items` list means no rule fired, not that the site is
    safe. See `sentinel/taskcentre/foresight.py` and the `foresight` block in `config/taskcentre.yaml`.
    """
    return site_foresight(s, site_id or admin.site_id)


def _foresight_recipients(item: dict[str, Any], action: dict[str, Any], s: Session,
                          site_id: str) -> list[str]:
    """Who this routing tells: the action's named owners, the item's, else the site's supervisors."""
    out: list[str] = []
    for user_id in [*action.get("owner_user_ids", []), *item.get("notify_user_ids", [])]:
        if user_id and user_id not in out:
            out.append(user_id)
    if out:
        return out
    stmt = select(UserRow).where(UserRow.role == "supervisor", UserRow.active.is_(True),
                                 UserRow.site_id == site_id).order_by(UserRow.user_id)
    return [u.user_id for u in s.execute(stmt).scalars()]


@router.post("/foresight/{risk_id}/act")
def post_foresight_act(risk_id: str, body: ForesightActIn, s: Session = Depends(get_session),
                       admin: UserRow = Depends(require_role("admin"))) -> dict[str, Any]:
    """Route one of a foresight item's suggested actions, and record what was done.

    This **notifies and records only**. It tells the supervisors the item names, opens (or reuses) a
    ticket carrying the item's basis so the suggestion is reviewable, and appends a
    ``tc_review_decision`` row saying which admin routed which action and when. It never changes a
    machine, a task, an incident or the evidence any item was built from - ``controls_machinery`` is
    ``false`` in the response for exactly that reason.

    404 for an unknown ``risk_id`` (the register is recomputed from live facts, so an item that no
    longer fires is genuinely gone); 400 for an action the item did not recommend.
    """
    now = time.time()
    register = site_foresight(s, admin.site_id, now=now)
    item = next((i for i in register["items"] if i["risk_id"] == risk_id), None)
    if item is None:
        raise HTTPException(404, f"risk {risk_id!r} is not in the current register; it may no longer "
                                 f"fire on the recorded facts")
    actions = {a["action"]: a for a in item["recommended_actions"]}
    action = actions.get(body.action)
    if action is None:
        raise HTTPException(400, f"action {body.action!r} is not recommended for {risk_id!r}; use one "
                                 f"of {sorted(actions)}")

    recipients = _foresight_recipients(item, action, s, admin.site_id)
    ticket = s.get(TicketRow, item["ticket_id"]) if item.get("ticket_id") else None
    reused = ticket is not None
    if ticket is None:
        ticket = open_ticket(
            s, site_id=admin.site_id, kind=f"foresight_{item['kind']}",
            severity=FORESIGHT_SEVERITY.get(item["likelihood"], "medium"),
            owner_role=action["owner_role"], owner_user_id=recipients[0] if recipients else None,
            subject_user_id=(item["affected"]["operators"][0]["user_id"]
                             if item["affected"]["operators"] else None),
            source="RULE", machine_id=(item["affected"]["machines"] or [None])[0],
            incident_id=item.get("incident_id"),
            title=f"Foresight action: {action['label']}",
            detail=f"{item['title']} — {item['what_could_happen']} {item['note']}",
            evidence={"risk_id": risk_id, "rule_id": item["rule_id"], "kind": item["kind"],
                      "likelihood": item["likelihood"], "basis": item["basis"],
                      "what_could_happen": item["what_could_happen"],
                      "thresholds": item["thresholds"], "source": "RULE",
                      "method": register["method"], "note": item["note"],
                      "confidence": item["confidence"], "caveats": list(FORESIGHT_CAVEATS),
                      "routed_by": admin.user_id, "routed_action": body.action,
                      "controls_machinery": False})

    decision = ReviewDecisionRow(
        ticket_id=ticket.ticket_id, reviewer_id=admin.user_id, reviewer_role=admin.role,
        decision=FORESIGHT_ACTED, comment=body.comment, ts=now,
        data={"risk_id": risk_id, "rule_id": item["rule_id"], "action": body.action,
              "action_label": action["label"], "likelihood": item["likelihood"],
              "owner_role": action["owner_role"], "notified_user_ids": recipients,
              "reused_existing_ticket": reused, "source": "RULE", "controls_machinery": False})
    s.add(decision)
    s.flush()

    body_text = (f"{admin.name} routed a foresight suggestion: {action['label']}. "
                 f"Why now: {item['title']} — {item['what_could_happen']} {item['note']}")
    for user_id in recipients:
        notify(s, user_id, kind="foresight", severity=FORESIGHT_SEVERITY.get(item["likelihood"], "info"),
               title=f"Suggested action: {action['label']}",
               body=f"{body_text} {body.comment}".strip(), link="/tc/sup", ticket_id=ticket.ticket_id)

    users = _users_by_id(s)
    history = _decisions_by_ticket(s, [ticket.ticket_id])[ticket.ticket_id]
    return {"ok": True, "risk_id": risk_id, "action": body.action, "action_label": action["label"],
            "item": item,
            "ticket": _ticket_payload(ticket, history, users, now=now),
            "ticket_created": not reused,
            "decision": _decision_payload(decision, users),
            "notified_user_ids": recipients,
            "notified_users": [_brief(users.get(uid)) for uid in recipients],
            "controls_machinery": False,
            "note": FORESIGHT_NOTE,
            "caveats": list(FORESIGHT_CAVEATS),
            **_stamps(now_ts=now)}
