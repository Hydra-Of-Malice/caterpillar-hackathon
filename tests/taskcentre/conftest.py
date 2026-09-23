"""Fixtures for the supervisor and chat API tests: a temp DB, two teams and real bearer tokens.

Sessions are issued through ``sentinel.taskcentre.auth`` so the tests exercise the real guards
rather than a stubbed dependency. Times are UTC seconds; ``day_start`` is the current UTC day.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from sentinel.cloud.api.main import create_app
from sentinel.store.db import Database
from sentinel.store.taskcentre_models import CameraRow, GeofenceRow, SiteRow, TcTaskRow, UserRow
from sentinel.taskcentre.auth import create_session, hash_password

SITE = "north-quarry"
DAY_S = 86_400.0

#: username -> (user_id, role, supervisor_id, machine_id)
PEOPLE = {
    "admin": ("u_admin", "admin", None, None),
    "sup1": ("u_sup1", "supervisor", None, None),
    "sup2": ("u_sup2", "supervisor", None, None),
    "op1": ("u_op1", "operator", "u_sup1", "EX-07"),
    "op2": ("u_op2", "operator", "u_sup1", None),
    "op3": ("u_op3", "operator", "u_sup2", "EX-09"),
}


class World:
    """The seeded fixture: a client, the user ids and a bearer token per person."""

    def __init__(self, client: TestClient, db: Database, ids: dict[str, str], tokens: dict[str, str]) -> None:
        self.client = client
        self.db = db
        self.ids = ids
        self.tokens = tokens

    def h(self, who: str) -> dict[str, str]:
        """Authorization header for one of the seeded people."""
        return {"Authorization": f"Bearer {self.tokens[who]}"}

    def get(self, who: str, path: str, **kwargs: Any):
        return self.client.get(f"/api/v1{path}", headers=self.h(who), **kwargs)

    def post(self, who: str, path: str, **kwargs: Any):
        return self.client.post(f"/api/v1{path}", headers=self.h(who), **kwargs)

    def patch(self, who: str, path: str, **kwargs: Any):
        return self.client.patch(f"/api/v1{path}", headers=self.h(who), **kwargs)


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    return Database(f"sqlite:///{(tmp_path / 'tc.db').as_posix()}")


@pytest.fixture()
def world(db: Database) -> World:
    """Two supervisors (op1/op2 under sup1, op3 under sup2), one admin, a fence and two cameras."""
    ids = {name: spec[0] for name, spec in PEOPLE.items()}
    tokens: dict[str, str] = {}
    password = hash_password("demo1234")
    with db.session() as s:
        s.add(SiteRow(site_id=SITE, name="North Quarry"))
        s.add(GeofenceRow(geofence_id="gf1", site_id=SITE, name="Quarry", center_lat=1.0, center_lon=1.0,
                          radius_m=500.0))
        s.add(CameraRow(camera_id="cam-ex07", site_id=SITE, machine_id="EX-07", label="EX-07 cab",
                        stream_kind="simulated"))
        s.add(CameraRow(camera_id="cam-ex09", site_id=SITE, machine_id="EX-09", label="EX-09 cab",
                        stream_kind="simulated"))
        for username, (user_id, role, supervisor_id, machine_id) in PEOPLE.items():
            s.add(UserRow(user_id=user_id, username=username, password_hash=password, role=role,
                          name=username.upper(), site_id=SITE, supervisor_id=supervisor_id,
                          machine_id=machine_id, active=True))
        s.flush()
        for username, (user_id, *_rest) in PEOPLE.items():
            tokens[username] = create_session(s, s.get(UserRow, user_id)).token

    app = create_app(db, seed=False)          # mounts the Task Centre routers under /api/v1
    with TestClient(app) as client:
        yield World(client, db, ids, tokens)


@pytest.fixture()
def day_start() -> float:
    """Start of the current UTC day, so task fixtures land inside 'today' whatever the clock says."""
    return (time.time() // DAY_S) * DAY_S


def add_task(db: Database, *, task_id: str, operator_id: str, supervisor_id: str, status: str,
             start_ts: float, expected_finish_ts: float, title: str = "Task") -> str:
    """Insert a task straight into the DB, for states the API cannot reach (completed, overdue)."""
    with db.session() as s:
        s.add(TcTaskRow(task_id=task_id, site_id=SITE, operator_id=operator_id, supervisor_id=supervisor_id,
                        title=title, instructions="", location="Pit 3", machine_id=None, priority="normal",
                        status=status, start_ts=start_ts, expected_finish_ts=expected_finish_ts,
                        created_at=start_ts))
    return task_id
