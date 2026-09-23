"""Task Centre auth, position reporting, work punches and user administration (`/api/v1/tc`).

Every operational timestamp in a response is the **server's** UTC clock plus a ``*_gmt`` string; the
browser clock is never stored. A punch that is outside the site fence -- or that cannot be verified --
is recorded as such and raised as a ticket for a human, never auto-judged.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.taskcentre_models import PunchRow, SessionRow, UserRow
from sentinel.taskcentre.auth import (ROLES, authenticate, bearer_token, create_session, current_session,
                                      current_user, end_session, get_tc_session, hash_password)
from sentinel.taskcentre.geo import INSIDE, OUTSIDE, classify
from sentinel.taskcentre.service import (active_geofence, gmt_iso, latest_location, location_public, new_id,
                                         notify, open_ticket, record_location, user_public)

router = APIRouter(prefix="/tc", tags=["task-centre"])

PUNCH_KINDS = ("start_work", "finish_work")
GEO_NOTE = "Geolocation indicates presence; it is not proof of attendance."
MIN_PASSWORD_LEN = 4


# ---------------------------------------------------------------- request bodies
class LoginBody(BaseModel):
    username: str
    password: str
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None


class LocationBody(BaseModel):
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None
    source: str = "browser"


class PunchBody(BaseModel):
    kind: str = Field(description="start_work | finish_work")
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None


class CreateUserBody(BaseModel):
    username: str
    password: str
    name: str
    role: str
    site_id: str | None = None
    supervisor_id: str | None = None
    machine_id: str | None = None


class PatchUserBody(BaseModel):
    name: str | None = None
    password: str | None = None
    active: bool | None = None
    role: str | None = None
    supervisor_id: str | None = None
    machine_id: str | None = None


# ---------------------------------------------------------------- helpers
def _fix(s: Session, user: UserRow, lat: float | None, lon: float | None,
         accuracy_m: float | None) -> tuple[str, float | None, str | None]:
    """Classify a reported fix against the user's site fence -> (status, distance_m, geofence_id)."""
    fence = active_geofence(s, user.site_id)
    status, distance_m = classify(lat, lon, accuracy_m, fence)
    return status, distance_m, (fence.geofence_id if fence is not None else None)


def _fix_payload(status: str, distance_m: float | None, geofence_id: str | None,
                 accuracy_m: float | None) -> dict[str, Any]:
    """The geofence block shared by the login, location and punch responses."""
    return {"geofence_status": status, "geofence_id": geofence_id, "accuracy_m": accuracy_m,
            "distance_m": None if distance_m is None else round(distance_m, 1), "note": GEO_NOTE}


def _ticket_owner(user: UserRow) -> tuple[str, str | None]:
    """Who reviews a flag about this person: an operator's supervisor, otherwise an admin."""
    if user.role == "operator" and user.supervisor_id:
        return "supervisor", user.supervisor_id
    return "admin", None


def _visible_users(s: Session, user: UserRow) -> list[UserRow]:
    """Everyone the caller may list: admin -> their site, supervisor -> own team + self, operator -> self."""
    if user.role == "admin":
        stmt = select(UserRow).where(UserRow.site_id == user.site_id)
    elif user.role == "supervisor":
        stmt = select(UserRow).where((UserRow.supervisor_id == user.user_id) |
                                     (UserRow.user_id == user.user_id))
    else:
        stmt = select(UserRow).where(UserRow.user_id == user.user_id)
    return list(s.execute(stmt.order_by(UserRow.role, UserRow.name)).scalars())


# ---------------------------------------------------------------- auth
@router.post("/auth/login")
def login(body: LoginBody, s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Sign in, issue a 12 h bearer token and record the login position (a location report, not a punch)."""
    user = authenticate(s, body.username, body.password)
    if user is None:
        raise HTTPException(401, "invalid username or password")
    now = time.time()
    status, distance_m, geofence_id = _fix(s, user, body.lat, body.lon, body.accuracy_m)
    record_location(s, user.user_id, ts=now, lat=body.lat, lon=body.lon, accuracy_m=body.accuracy_m,
                    geofence_status=status, source="browser")
    session_row = create_session(s, user, lat=body.lat, lon=body.lon, accuracy_m=body.accuracy_m,
                                 geofence_status=status, now=now)
    return {"token": session_row.token, "user": user_public(user),
            "login": {"ts": now, "ts_gmt": gmt_iso(now), "expires_at": session_row.expires_at,
                      "expires_at_gmt": gmt_iso(session_row.expires_at),
                      **_fix_payload(status, distance_m, geofence_id, body.accuracy_m)}}


@router.post("/auth/logout")
def logout(authorization: str | None = Header(default=None),
           s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Invalidate the caller's token. Idempotent: an unknown token simply reports ``ended`` false."""
    return {"ok": True, "ended": end_session(s, bearer_token(authorization))}


@router.get("/auth/me")
def me(user: UserRow = Depends(current_user), session_row: SessionRow = Depends(current_session),
       s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """The signed-in user, their login fix, their latest reported position and the server clock (GMT)."""
    now = time.time()
    return {"user": user_public(user), "server_ts": now, "server_ts_gmt": gmt_iso(now),
            "login": {"ts": session_row.created_at, "ts_gmt": gmt_iso(session_row.created_at),
                      "expires_at": session_row.expires_at,
                      "expires_at_gmt": gmt_iso(session_row.expires_at),
                      "geofence_status": session_row.login_geofence, "lat": session_row.login_lat,
                      "lon": session_row.login_lon, "accuracy_m": session_row.login_accuracy_m,
                      "note": GEO_NOTE},
            "latest_location": location_public(latest_location(s, user.user_id), now=now)}


# ---------------------------------------------------------------- location & punches
@router.post("/location")
def report_location(body: LocationBody, user: UserRow = Depends(current_user),
                    s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Record where the caller is now (server timestamp). Poor or missing fixes stay ``unverified``."""
    now = time.time()
    status, distance_m, geofence_id = _fix(s, user, body.lat, body.lon, body.accuracy_m)
    record_location(s, user.user_id, ts=now, lat=body.lat, lon=body.lon, accuracy_m=body.accuracy_m,
                    geofence_status=status, source=body.source or "browser")
    return {"ts": now, "ts_gmt": gmt_iso(now),
            **_fix_payload(status, distance_m, geofence_id, body.accuracy_m)}


@router.post("/punch")
def punch(body: PunchBody, user: UserRow = Depends(current_user),
          s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Start/Finish Work punch, stamped with the **server** clock and the fix used for the decision.

    A punch that is ``outside`` the fence, or that cannot be verified, is still recorded and then raised
    as a ticket for review: an operator's goes to their supervisor, anyone else's goes to an admin.
    """
    if body.kind not in PUNCH_KINDS:
        raise HTTPException(400, f"kind must be one of {list(PUNCH_KINDS)}")
    now = time.time()
    status, distance_m, geofence_id = _fix(s, user, body.lat, body.lon, body.accuracy_m)
    record_location(s, user.user_id, ts=now, lat=body.lat, lon=body.lon, accuracy_m=body.accuracy_m,
                    geofence_status=status, source="browser")
    row = PunchRow(punch_id=new_id("pnc"), user_id=user.user_id, kind=body.kind, ts=now, lat=body.lat,
                   lon=body.lon, accuracy_m=body.accuracy_m, geofence_status=status,
                   geofence_id=geofence_id, distance_m=distance_m)
    s.add(row)

    ticket_id = None
    if status != INSIDE:
        ticket_id = _raise_punch_ticket(s, user, body, now=now, status=status, distance_m=distance_m,
                                        geofence_id=geofence_id)
        row.ticket_id = ticket_id
    s.flush()
    return {"punch_id": row.punch_id, "kind": row.kind, "ts": now, "ts_gmt": gmt_iso(now),
            "flagged": ticket_id is not None, "ticket_id": ticket_id,
            **_fix_payload(status, distance_m, geofence_id, body.accuracy_m)}


def _raise_punch_ticket(s: Session, user: UserRow, body: PunchBody, *, now: float, status: str,
                        distance_m: float | None, geofence_id: str | None) -> str:
    """Open the review ticket for an outside/unverified punch and notify the reviewer and the person."""
    owner_role, owner_user_id = _ticket_owner(user)
    kind_label = body.kind.replace("_", " ")
    where = "outside the site geofence" if status == OUTSIDE else "at an unverified location"
    reason = ("reported position is beyond the fence radius" if status == OUTSIDE
              else "no position, or a fix less accurate than the fence allows")
    ticket = open_ticket(
        s, site_id=user.site_id, kind="geofence_punch",
        severity="high" if status == OUTSIDE else "medium",
        title=f"{user.name}: {kind_label} {where}", owner_role=owner_role, owner_user_id=owner_user_id,
        subject_user_id=user.user_id, source="RULE", machine_id=user.machine_id,
        detail=f"{kind_label} punch recorded at {gmt_iso(now)} GMT was {status}. {GEO_NOTE}",
        evidence={"punch_kind": body.kind, "ts": now, "ts_gmt": gmt_iso(now), "geofence_status": status,
                  "geofence_id": geofence_id, "lat": body.lat, "lon": body.lon,
                  "accuracy_m": body.accuracy_m,
                  "distance_m": None if distance_m is None else round(distance_m, 1),
                  "reason": reason, "subject_role": user.role})
    if owner_user_id:
        notify(s, owner_user_id, kind="ticket", title=f"Punch to review: {user.name}", body=ticket.detail,
               severity=ticket.severity, link=f"/tc/sup/operator/{user.user_id}", ticket_id=ticket.ticket_id)
    notify(s, user.user_id, kind="ticket", title=f"Your {kind_label} punch needs review",
           body=f"Recorded at {gmt_iso(now)} GMT as {status}; a reviewer will confirm it.",
           severity="info", ticket_id=ticket.ticket_id)
    return ticket.ticket_id


# ---------------------------------------------------------------- users
@router.get("/users")
def list_users(role: str | None = None, supervisor_id: str | None = None,
               user: UserRow = Depends(current_user),
               s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """People the caller may see: admin -> the whole site, supervisor -> own team + self, operator -> self."""
    rows = _visible_users(s, user)
    if role:
        rows = [r for r in rows if r.role == role]
    if supervisor_id:
        rows = [r for r in rows if r.supervisor_id == supervisor_id]
    return {"users": [user_public(r) for r in rows], "count": len(rows)}


@router.post("/users", status_code=201)
def create_user(body: CreateUserBody, user: UserRow = Depends(current_user),
                s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Create an account. Admin: anyone on their site. Supervisor: only operators on their own team."""
    if user.role not in ("admin", "supervisor"):
        raise HTTPException(403, "only an admin or a supervisor may create accounts")
    if body.role not in ROLES:
        raise HTTPException(400, f"role must be one of {list(ROLES)}")
    if len(body.password or "") < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"password must be at least {MIN_PASSWORD_LEN} characters")
    username = (body.username or "").strip()
    if not username:
        raise HTTPException(400, "username is required")
    if s.query(UserRow).filter(UserRow.username == username).one_or_none() is not None:
        raise HTTPException(409, f"username {username!r} is already taken")

    site_id = body.site_id or user.site_id
    supervisor_id = body.supervisor_id
    if user.role == "supervisor":
        if body.role != "operator":
            raise HTTPException(403, "a supervisor may only create operators")
        if supervisor_id not in (None, user.user_id):
            raise HTTPException(403, "a supervisor may only add operators to their own team")
        supervisor_id, site_id = user.user_id, user.site_id
    if body.role != "operator":
        supervisor_id = None
    elif supervisor_id is not None:
        sup = s.get(UserRow, supervisor_id)
        if sup is None or sup.role != "supervisor":
            raise HTTPException(400, f"supervisor {supervisor_id!r} not found")

    row = UserRow(user_id=new_id("usr"), username=username, password_hash=hash_password(body.password),
                  role=body.role, name=body.name or username, site_id=site_id, supervisor_id=supervisor_id,
                  machine_id=body.machine_id, active=True, created_at=time.time(),
                  meta={"created_by": user.user_id})
    s.add(row)
    s.flush()
    return user_public(row)


@router.patch("/users/{user_id}")
def patch_user(user_id: str, body: PatchUserBody, user: UserRow = Depends(current_user),
               s: Session = Depends(get_tc_session)) -> dict[str, Any]:
    """Update an account. Admin: any field. Supervisor: own operators. Operator: their own name/password."""
    target = s.get(UserRow, user_id)
    if target is None:
        raise HTTPException(404, f"user {user_id!r} not found")
    if user.role == "admin":
        allowed = {"name", "password", "active", "role", "supervisor_id", "machine_id"}
    elif user.role == "supervisor" and target.supervisor_id == user.user_id:
        allowed = {"name", "password", "active", "machine_id"}
    elif user.user_id == target.user_id:
        allowed = {"name", "password"}
    else:
        raise HTTPException(403, "not permitted to edit this account")

    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    refused = sorted(set(changes) - allowed)
    if refused:
        raise HTTPException(403, f"role {user.role!r} may not change {refused} on this account")
    if "role" in changes and changes["role"] not in ROLES:
        raise HTTPException(400, f"role must be one of {list(ROLES)}")
    if "password" in changes and len(changes["password"]) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"password must be at least {MIN_PASSWORD_LEN} characters")
    if changes.get("supervisor_id"):
        sup = s.get(UserRow, changes["supervisor_id"])
        if sup is None or sup.role != "supervisor":
            raise HTTPException(400, f"supervisor {changes['supervisor_id']!r} not found")

    for field, value in changes.items():
        if field == "password":
            target.password_hash = hash_password(value)
        else:
            setattr(target, field, value)
    s.flush()
    return user_public(target)
