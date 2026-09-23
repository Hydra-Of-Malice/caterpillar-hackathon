"""FastAPI dependencies: database session and the MOCK role guard (`X-Role` header)."""
from __future__ import annotations

from typing import Callable, Iterator

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from sentinel.cloud.roles import Role, parse_role
from sentinel.store.db import Database


def get_database(request: Request) -> Database:
    """The app's Database (created on first use so importing the app has no side effects)."""
    state = request.app.state
    if state.db is None:
        state.db = state.db_factory()
    return state.db


def get_session(db: Database = Depends(get_database)) -> Iterator[Session]:
    """One transaction per request (commit on success, rollback on error)."""
    with db.session() as s:
        yield s


def get_role(x_role: str | None = Header(default=None, alias="X-Role")) -> Role:
    """MOCK auth: the caller's role from `X-Role` (operator when absent). 403 for an unknown role."""
    role = parse_role(x_role)
    if role is None:
        raise HTTPException(403, f"unknown role {x_role!r}; use operator|trainee|instructor|supervisor|ml_service")
    return role


def get_actor(role: Role = Depends(get_role), x_actor: str | None = Header(default=None, alias="X-Actor")) -> str:
    """Actor id for audit rows (`X-Actor`, e.g. INS-01), defaulting to the role name."""
    return x_actor or role.value


def require_roles(*allowed: Role) -> Callable[[Role], Role]:
    """Dependency factory: 403 unless the caller's role is one of `allowed`."""
    def check(role: Role = Depends(get_role)) -> Role:
        if role not in allowed:
            raise HTTPException(403, f"role {role.value!r} not allowed; requires one of {[r.value for r in allowed]}")
        return role
    return check


def forbid_roles(*denied: Role) -> Callable[[Role], Role]:
    """Dependency factory: 403 if the caller's role is one of `denied`."""
    def check(role: Role = Depends(get_role)) -> Role:
        if role in denied:
            raise HTTPException(403, f"role {role.value!r} may not access individual operator data")
        return role
    return check
