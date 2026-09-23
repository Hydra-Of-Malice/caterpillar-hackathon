"""Work punches: server timestamps, honest geofence status, and who has to review a flagged punch."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import LocationReportRow, NotificationRow, PunchRow, TicketRow, UserRow
from sentinel.taskcentre.auth import hash_password
from sentinel.taskcentre.routes_auth import router
from sentinel.taskcentre.seed import CENTER_LAT, CENTER_LON, seed_task_centre

API = "/api/v1/tc"
PASSWORDS = {"admin": "admin123", "super1": "super123", "op1": "op123"}
INSIDE_FIX = {"lat": CENTER_LAT, "lon": CENTER_LON, "accuracy_m": 8.0}
FAR_FIX = {"lat": CENTER_LAT + 0.05, "lon": CENTER_LON, "accuracy_m": 10.0}          # ~5.6 km north
POOR_FIX = {"lat": CENTER_LAT, "lon": CENTER_LON, "accuracy_m": 2500.0}              # worse than 100 m


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    database = Database(f"sqlite:///{(tmp_path / 'tc.db').as_posix()}")
    with database.session() as s:
        seed_task_centre(s)
    return database


@pytest.fixture()
def client(db: Database) -> Iterator[TestClient]:
    app = FastAPI()
    app.state.db = db
    app.state.db_factory = Database.cloud      # never called: state.db is already set
    app.include_router(router, prefix="/api/v1")
    with TestClient(app) as c:
        yield c


def token_for(client: TestClient, username: str, password: str | None = None) -> str:
    body = {"username": username, "password": password or PASSWORDS[username]}
    response = client.post(f"{API}/auth/login", json=body)
    assert response.status_code == 200, response.text
    return response.json()["token"]


def punch(client: TestClient, token: str, kind: str = "start_work", **fix: Any) -> dict[str, Any]:
    response = client.post(f"{API}/punch", json={"kind": kind, **fix},
                           headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text
    return response.json()


def ticket_for(db: Database, ticket_id: str) -> TicketRow:
    with db.session() as s:
        return s.get(TicketRow, ticket_id)


def test_punch_inside_the_fence_raises_no_ticket(client: TestClient, db: Database) -> None:
    payload = punch(client, token_for(client, "op1"), **INSIDE_FIX)
    assert payload["geofence_status"] == "inside"
    assert payload["flagged"] is False and payload["ticket_id"] is None
    assert payload["distance_m"] == pytest.approx(0.0, abs=1.0)
    with db.session() as s:
        assert s.execute(select(TicketRow)).scalars().all() == []


def test_punch_uses_the_server_clock_and_stores_the_fix(client: TestClient, db: Database) -> None:
    before = time.time()
    payload = punch(client, token_for(client, "op1"), kind="finish_work", ts=0.0, **INSIDE_FIX)
    assert before <= payload["ts"] <= time.time()          # a client-sent ts is ignored
    assert payload["ts_gmt"].endswith("Z")
    with db.session() as s:
        row = s.get(PunchRow, payload["punch_id"])
        assert (row.user_id, row.kind, row.geofence_status) == ("u_op1", "finish_work", "inside")
        assert row.ts == pytest.approx(payload["ts"])
        assert row.geofence_id == "fence-north-quarry"
        assert row.lat == pytest.approx(CENTER_LAT) and row.accuracy_m == 8.0


def test_punch_also_reports_the_position(client: TestClient, db: Database) -> None:
    punch(client, token_for(client, "op1"), **INSIDE_FIX)
    with db.session() as s:
        rows = s.execute(select(LocationReportRow).where(LocationReportRow.user_id == "u_op1")).scalars().all()
    assert len(rows) >= 2                                   # one from the seed / login, one from the punch
    assert rows[-1].geofence_status == "inside"


def test_outside_punch_opens_a_ticket_for_the_operators_supervisor(client: TestClient, db: Database) -> None:
    payload = punch(client, token_for(client, "op1"), **FAR_FIX)
    assert payload["geofence_status"] == "outside" and payload["flagged"] is True
    assert payload["distance_m"] == pytest.approx(5560.0, rel=0.05)

    ticket = ticket_for(db, payload["ticket_id"])
    assert (ticket.kind, ticket.severity, ticket.status) == ("geofence_punch", "high", "open")
    assert (ticket.owner_role, ticket.owner_user_id) == ("supervisor", "u_super1")
    assert ticket.subject_user_id == "u_op1" and ticket.source == "RULE"
    assert ticket.evidence["distance_m"] == payload["distance_m"]
    assert ticket.evidence["lat"] == pytest.approx(FAR_FIX["lat"])
    assert ticket.evidence["lon"] == pytest.approx(FAR_FIX["lon"])
    assert ticket.evidence["accuracy_m"] == FAR_FIX["accuracy_m"]
    assert ticket.evidence["geofence_status"] == "outside"

    with db.session() as s:
        punch_row = s.get(PunchRow, payload["punch_id"])
        notified = s.execute(select(NotificationRow).where(
            NotificationRow.ticket_id == ticket.ticket_id)).scalars().all()
    assert punch_row.ticket_id == ticket.ticket_id
    assert {n.user_id for n in notified} == {"u_super1", "u_op1"}


def test_unverified_punch_is_flagged_but_never_called_outside(client: TestClient, db: Database) -> None:
    payload = punch(client, token_for(client, "op1"), **POOR_FIX)
    assert payload["geofence_status"] == "unverified"
    assert payload["distance_m"] is None and payload["flagged"] is True

    ticket = ticket_for(db, payload["ticket_id"])
    assert ticket.severity == "medium" and ticket.owner_user_id == "u_super1"
    assert ticket.evidence["distance_m"] is None
    assert "less accurate" in ticket.evidence["reason"]


def test_punch_without_any_fix_is_unverified(client: TestClient, db: Database) -> None:
    payload = punch(client, token_for(client, "op1"))
    assert payload["geofence_status"] == "unverified" and payload["flagged"] is True
    assert ticket_for(db, payload["ticket_id"]).owner_role == "supervisor"


def test_supervisor_punch_goes_to_an_admin(client: TestClient, db: Database) -> None:
    payload = punch(client, token_for(client, "super1"), **FAR_FIX)
    ticket = ticket_for(db, payload["ticket_id"])
    assert (ticket.owner_role, ticket.owner_user_id) == ("admin", None)
    assert ticket.subject_user_id == "u_super1"
    with db.session() as s:
        notified = s.execute(select(NotificationRow).where(
            NotificationRow.ticket_id == ticket.ticket_id)).scalars().all()
    assert {n.user_id for n in notified} == {"u_super1"}     # the subject only; admins read the queue


def test_operator_without_a_supervisor_falls_back_to_admin(client: TestClient, db: Database) -> None:
    with db.session() as s:
        s.add(UserRow(user_id="u_lone", username="lone", password_hash=hash_password("lone123"),
                      role="operator", name="Solo Operator", site_id="north-quarry", supervisor_id=None,
                      machine_id=None, active=True, created_at=time.time(), meta={}))
    payload = punch(client, token_for(client, "lone", "lone123"), **FAR_FIX)
    assert ticket_for(db, payload["ticket_id"]).owner_role == "admin"


def test_admin_punch_goes_to_the_admin_queue(client: TestClient, db: Database) -> None:
    payload = punch(client, token_for(client, "admin"), **FAR_FIX)
    assert ticket_for(db, payload["ticket_id"]).owner_role == "admin"


def test_bad_kind_and_missing_token_are_rejected(client: TestClient) -> None:
    token = token_for(client, "op1")
    bad = client.post(f"{API}/punch", json={"kind": "lunch", **INSIDE_FIX},
                      headers={"Authorization": f"Bearer {token}"})
    assert bad.status_code == 400
    assert client.post(f"{API}/punch", json={"kind": "start_work"}).status_code == 401


def test_location_endpoint_records_a_report(client: TestClient, db: Database) -> None:
    token = token_for(client, "op1")
    payload = client.post(f"{API}/location", json=FAR_FIX,
                          headers={"Authorization": f"Bearer {token}"}).json()
    assert payload["geofence_status"] == "outside" and payload["ts_gmt"].endswith("Z")
    with db.session() as s:
        latest = s.execute(select(LocationReportRow).where(LocationReportRow.user_id == "u_op1")
                           .order_by(LocationReportRow.ts.desc())).scalars().first()
    assert latest.geofence_status == "outside"
    with db.session() as s:
        assert s.execute(select(TicketRow)).scalars().all() == []    # reporting a position is not a punch
