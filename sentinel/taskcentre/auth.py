"""Task Centre authentication and permission guards.

Demo auth, but honest about it: passwords are salted PBKDF2-HMAC-SHA256 (never plaintext), and login
issues an opaque bearer token stored in ``tc_session`` with a 12 h expiry (``session_hours`` in
``config/taskcentre.yaml``). There are no refresh tokens and no password reset flow.

Permissions are enforced here, in the API -- hiding a UI control is not enough. Role failures are
**403**; a missing, unknown or expired token is **401**; a person who does not exist is **404**.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from typing import Callable

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.store.taskcentre_models import SessionRow, UserRow
from sentinel.taskcentre.service import session_seconds

PBKDF2_ITERATIONS = 120_000
SALT_BYTES = 16
TOKEN_BYTES = 32
ROLES = ("admin", "supervisor", "operator")

#: The cloud app's per-request session (see ``sentinel/cloud/api/deps.py``); re-exported so Task Centre
#: routers depend on one name.
get_tc_session = get_session


# ---------------------------------------------------------------- passwords
def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS, salt: bytes | None = None) -> str:
    """Hash a password as ``pbkdf2$<iterations>$<salt_hex>$<hash_hex>`` with a fresh random salt."""
    salt = secrets.token_bytes(SALT_BYTES) if salt is None else salt
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of a password against a stored hash; ``False`` for any malformed hash."""
    try:
        scheme, iterations, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        expected = bytes.fromhex(hash_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex),
                                     int(iterations))
    except (AttributeError, TypeError, ValueError):
        return False
    return hmac.compare_digest(digest, expected)


# ---------------------------------------------------------------- sessions
def authenticate(s: Session, username: str, password: str) -> UserRow | None:
    """The active user for these credentials, or ``None`` (the caller must not say which part failed)."""
    user = s.query(UserRow).filter(UserRow.username == (username or "").strip()).one_or_none()
    if user is None or not user.active:
        return None
    return user if verify_password(password or "", user.password_hash) else None


def create_session(s: Session, user: UserRow, *, lat: float | None = None, lon: float | None = None,
                   accuracy_m: float | None = None, geofence_status: str = "unverified",
                   now: float | None = None) -> SessionRow:
    """Issue a bearer token for this user, recording the geofence status of the login fix."""
    now = time.time() if now is None else now
    row = SessionRow(token=secrets.token_urlsafe(TOKEN_BYTES), user_id=user.user_id, created_at=now,
                     expires_at=now + session_seconds(), login_lat=lat, login_lon=lon,
                     login_accuracy_m=accuracy_m, login_geofence=geofence_status)
    s.add(row)
    s.flush()
    return row


def end_session(s: Session, token: str) -> bool:
    """Delete a session token. ``True`` when a session was actually removed."""
    row = s.get(SessionRow, token)
    if row is None:
        return False
    s.delete(row)
    s.flush()
    return True


def bearer_token(authorization: str | None) -> str:
    """The token from an ``Authorization: Bearer <token>`` header; 401 when it is missing or malformed."""
    if not authorization:
        raise HTTPException(401, "missing Authorization header; use 'Bearer <token>'")
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(401, "malformed Authorization header; use 'Bearer <token>'")
    return parts[1].strip()


def resolve_session(s: Session, token: str, *, now: float | None = None) -> SessionRow:
    """The live session for a token; 401 when unknown or expired (an expired row is dropped)."""
    now = time.time() if now is None else now
    row = s.get(SessionRow, token)
    if row is None:
        raise HTTPException(401, "invalid token")
    if row.expires_at <= now:
        s.delete(row)
        s.flush()
        raise HTTPException(401, "token expired; sign in again")
    return row


# ---------------------------------------------------------------- dependencies
def current_session(authorization: str | None = Header(default=None),
                    s: Session = Depends(get_tc_session)) -> SessionRow:
    """FastAPI dependency: the caller's live session row (401 otherwise)."""
    return resolve_session(s, bearer_token(authorization))


def current_user(authorization: str | None = Header(default=None),
                 s: Session = Depends(get_tc_session)) -> UserRow:
    """FastAPI dependency: the signed-in user. 401 when the token is missing, invalid or expired."""
    session_row = resolve_session(s, bearer_token(authorization))
    user = s.get(UserRow, session_row.user_id)
    if user is None or not user.active:
        raise HTTPException(401, "account is no longer active")
    return user


def require_role(*roles: str) -> Callable[..., UserRow]:
    """Dependency factory: the signed-in user, or 403 unless their role is one of ``roles``."""
    allowed = tuple(roles)

    def check(user: UserRow = Depends(current_user)) -> UserRow:
        if user.role not in allowed:
            raise HTTPException(403, f"role {user.role!r} not allowed; requires one of {list(allowed)}")
        return user

    return check


#: The contract spells this dependency factory both ways; they are the same function.
require_roles = require_role


def assert_can_view_operator(user: UserRow, operator_id: str, s: Session) -> UserRow:
    """Guard a per-person view and return the target row.

    admin: anyone. supervisor: their own operators (and themselves). operator: only themselves.
    404 when nobody has that id, 403 when they exist but are out of the caller's scope.
    """
    target = s.get(UserRow, operator_id)
    if target is None:
        raise HTTPException(404, f"user {operator_id!r} not found")
    if user.role == "admin" or user.user_id == target.user_id:
        return target
    if user.role == "supervisor" and target.supervisor_id == user.user_id:
        return target
    raise HTTPException(403, "not permitted to view this person's data")
