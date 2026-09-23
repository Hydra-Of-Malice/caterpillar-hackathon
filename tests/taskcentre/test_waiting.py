"""Operator-declared waiting ("Waiting for truck"): lifecycle, overlap, idle suppression, scoping.

Two halves. The API half drives the real `/tc/op/waiting*` routes through the real auth stack, so the
403/404 assertions mean what they say. The brain half calls `handle_camera_observation` directly with
a declared wait in the database, because that is the whole point of the feature: the same observation
must raise a ticket when nobody explained the pause and raise nothing when the operator did.
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from sentinel.shared.schemas import new_id
from sentinel.store.db import Database
from sentinel.store.taskcentre_models import (
    CameraRow,
    SimEventRow,
    SiteRow,
    TaskProgressRow,
    TcTaskRow,
    TicketRow,
    UserRow,
    WaitPeriodRow,
)
from sentinel.taskcentre import brain, routes_operator
from sentinel.taskcentre.adapters import SimulatedCameraSource
from sentinel.taskcentre.auth import create_session, hash_password
from sentinel.taskcentre.brain import BrainConfig
from sentinel.taskcentre.waiting import active_wait, overlaps_wait, start_wait, stop_wait, wait_summary

SITE = "north-quarry"
PREFIX = "/api/v1"
MINUTE = 60.0


# ---------------------------------------------------------------- fixtures
@pytest.fixture()
def db(tmp_path: Path) -> Database:
    return Database(f"sqlite:///{(tmp_path / 'tc.db').as_posix()}")


@pytest.fixture()
def people(db: Database) -> dict[str, str]:
    """One admin, two supervisors, three operators; op3 belongs to the *other* supervisor."""
    rows = [
        ("adm1", "admin1", "admin", "Ada Admin", None),
        ("sup1", "super1", "supervisor", "Sam Super", None),
        ("sup2", "super2", "supervisor", "Sara Super", None),
        ("op1", "op1", "operator", "Omar One", "sup1"),
        ("op2", "op2", "operator", "Olga Two", "sup1"),
        ("op3", "op3", "operator", "Otto Three", "sup2"),
    ]
    with db.session() as s:
        s.add(SiteRow(site_id=SITE, name="North Quarry"))
        s.add(CameraRow(camera_id="cam-ex07", site_id=SITE, machine_id="EX-07", label="EX-07 cab"))
        for user_id, username, role, name, supervisor_id in rows:
            s.add(UserRow(user_id=user_id, username=username, password_hash=hash_password("pw"),
                          role=role, name=name, site_id=SITE, supervisor_id=supervisor_id,
                          machine_id="EX-07" if user_id == "op1" else None))
    return {r[0]: r[0] for r in rows}


@pytest.fixture()
def app(db: Database, people: dict[str, str]) -> FastAPI:
    application = FastAPI()
    application.state.db = db
    application.state.db_factory = lambda: db
    application.include_router(routes_operator.router, prefix=PREFIX)
    return application


@pytest.fixture()
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def tokens(db: Database, people: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    with db.session() as s:
        for user_id in people:
            out[user_id] = create_session(s, s.get(UserRow, user_id), geofence_status="inside").token
    return out


@pytest.fixture()
def cfg() -> BrainConfig:
    """The shipped thresholds, so a config change that breaks suppression fails here."""
    return BrainConfig.load()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- builders
def declare(db: Database, user_id: str = "op1", *, reason: str = "waiting_for_truck",
            started_at: float, ended_at: float | None = None, task_id: str | None = None) -> str:
    """Insert a wait period directly, for exact durations the clock cannot be asked for."""
    wait_id = new_id("wai")
    with db.session() as s:
        s.add(WaitPeriodRow(wait_id=wait_id, user_id=user_id, task_id=task_id, reason=reason,
                            started_at=started_at, ended_at=ended_at, source="operator"))
    return wait_id


def make_task(db: Database, task_id: str = "T1", *, operator_id: str = "op1") -> str:
    now = time.time()
    with db.session() as s:
        s.add(TcTaskRow(task_id=task_id, site_id=SITE, operator_id=operator_id, supervisor_id="sup1",
                        title=f"Task {task_id}", instructions="", location="Bench 3", machine_id="EX-07",
                        status="ongoing", start_ts=now - 1800.0, expected_finish_ts=now + 3600.0))
    return task_id


def observation(operator_id: str = "op1", *, idle_seconds: float, ts: float):
    """A camera observation with no explaining context - the case the brain would normally flag."""
    return SimulatedCameraSource().observe(camera_id="cam-ex07", operator_id=operator_id,
                                           idle_seconds=idle_seconds, ts=ts)


# ---------------------------------------------------------------- lifecycle
def test_start_then_stop_records_one_period_with_server_times(client: TestClient, db: Database,
                                                              tokens: dict[str, str]) -> None:
    """One tap opens the period, the next closes it; both times come from the server clock."""
    started = client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"])).json()
    assert started["active"] is True and started["already_active"] is False
    assert started["wait"]["reason"] == "waiting_for_truck"
    assert started["wait"]["reason_label"] == "Waiting for a truck"
    assert started["wait"]["active"] is True and started["wait"]["ended_at"] is None
    assert started["started_at_gmt"].endswith("Z") and started["started_at"] == pytest.approx(time.time(), abs=5)

    stopped = client.post(f"{PREFIX}/tc/op/waiting/stop", headers=auth(tokens["op1"])).json()
    assert stopped["active"] is False and stopped["stopped"] is True
    assert stopped["wait"]["wait_id"] == started["wait"]["wait_id"]
    assert stopped["wait"]["ended_at"] is not None and stopped["minutes"] >= 0.0

    with db.session() as s:
        rows = s.execute(select(WaitPeriodRow)).scalars().all()
        assert len(rows) == 1 and rows[0].ended_at is not None
        assert active_wait(s, "op1") is None


def test_a_chosen_reason_and_note_are_kept(client: TestClient, tokens: dict[str, str]) -> None:
    body = {"reason": "machine_paused", "note": "hydraulic check"}
    started = client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]), json=body).json()
    assert started["wait"]["reason"] == "machine_paused"
    assert started["wait"]["reason_label"] == "Machine paused"
    assert started["wait"]["note"] == "hydraulic check"


def test_an_unknown_reason_is_rejected(client: TestClient, tokens: dict[str, str]) -> None:
    r = client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]),
                    json={"reason": "taking_a_nap"})
    assert r.status_code == 422


def test_starting_twice_returns_the_same_open_period(client: TestClient, db: Database,
                                                     tokens: dict[str, str]) -> None:
    """A double tap must not fragment one wait into two periods that double-count the minutes."""
    first = client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"])).json()
    second = client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]),
                         json={"reason": "expected_delay"}).json()
    assert second["already_active"] is True and second["active"] is True
    assert second["wait"]["wait_id"] == first["wait"]["wait_id"]
    assert second["wait"]["reason"] == "waiting_for_truck"      # the first declaration stands
    with db.session() as s:
        assert len(s.execute(select(WaitPeriodRow)).scalars().all()) == 1


def test_stopping_with_nothing_open_is_a_no_op(client: TestClient, tokens: dict[str, str]) -> None:
    r = client.post(f"{PREFIX}/tc/op/waiting/stop", headers=auth(tokens["op1"]))
    assert r.status_code == 200
    body = r.json()
    assert body["active"] is False and body["wait"] is None
    assert body["stopped"] is False and body["minutes"] == 0.0


def test_declaring_on_a_task_writes_the_audit_trail(client: TestClient, db: Database,
                                                    tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]), json={"task_id": "T1"})
    client.post(f"{PREFIX}/tc/op/waiting/stop", headers=auth(tokens["op1"]))
    with db.session() as s:
        rows = s.execute(select(TaskProgressRow).where(TaskProgressRow.kind == "waiting")
                         .order_by(TaskProgressRow.ts, TaskProgressRow.id)).scalars().all()
        assert [r.data["event"] for r in rows] == ["start", "stop"]
        assert all(r.task_id == "T1" and r.user_id == "op1" for r in rows)
        assert rows[0].data["reason"] == "waiting_for_truck"


def test_a_wait_cannot_be_attached_to_another_operators_task(client: TestClient, db: Database,
                                                             tokens: dict[str, str]) -> None:
    make_task(db, "T9", operator_id="op2")
    r = client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]), json={"task_id": "T9"})
    assert r.status_code == 404


# ---------------------------------------------------------------- overlap
def test_an_open_period_overlaps_an_observation_window(db: Database, people: dict[str, str]) -> None:
    now = time.time()
    declare(db, started_at=now - 20 * MINUTE)                       # still open
    with db.session() as s:
        assert overlaps_wait(s, "op1", now - 10 * MINUTE, now) is not None


def test_a_closed_period_covering_the_window_overlaps(db: Database, people: dict[str, str]) -> None:
    now = time.time()
    declare(db, started_at=now - 40 * MINUTE, ended_at=now - 10 * MINUTE)
    with db.session() as s:
        assert overlaps_wait(s, "op1", now - 30 * MINUTE, now - 20 * MINUTE) is not None
        assert overlaps_wait(s, "op1", now - 15 * MINUTE, now) is not None    # touches the tail


def test_a_period_outside_the_window_does_not_overlap(db: Database, people: dict[str, str]) -> None:
    now = time.time()
    declare(db, started_at=now - 300 * MINUTE, ended_at=now - 240 * MINUTE)
    with db.session() as s:
        assert overlaps_wait(s, "op1", now - 30 * MINUTE, now) is None
        assert overlaps_wait(s, "op2", now - 300 * MINUTE, now) is None       # another operator's day


def test_start_and_stop_helpers_are_idempotent(db: Database, people: dict[str, str]) -> None:
    with db.session() as s:
        first = start_wait(s, "op1", reason="waiting_for_truck")
        assert start_wait(s, "op1", reason="expected_delay").wait_id == first.wait_id
        assert stop_wait(s, "op1").wait_id == first.wait_id
        assert stop_wait(s, "op1") is None


# ---------------------------------------------------------------- idle suppression
def test_an_observation_during_a_declared_wait_raises_no_ticket(db: Database, people: dict[str, str],
                                                                cfg: BrainConfig) -> None:
    """The operator said why they are standing still, so the camera does not accuse them of idling."""
    now = time.time()
    declare(db, started_at=now - 40 * MINUTE)                       # open wait covering the window
    with db.session() as s:
        ticket = brain.handle_camera_observation(s, observation(idle_seconds=30 * MINUTE, ts=now), cfg)
        assert ticket is None
        assert s.execute(select(TicketRow)).scalars().all() == []

        event = s.execute(select(SimEventRow)).scalars().one()
        assert event.produced_ticket_id is None
        assert event.payload["outcome"] == "suppressed_operator_declared"
        assert event.payload["suppressed_reason"].startswith("operator_declared_waiting_for_truck:")
        assert "the operator reported waiting for a truck" in event.payload["suppressed_reason"]


def test_the_same_observation_without_a_declared_wait_is_flagged(db: Database, people: dict[str, str],
                                                                 cfg: BrainConfig) -> None:
    now = time.time()
    with db.session() as s:
        ticket = brain.handle_camera_observation(s, observation(idle_seconds=30 * MINUTE, ts=now), cfg)
        assert ticket is not None and ticket.kind == "ai_idle"
        assert ticket.subject_user_id == "op1" and ticket.owner_user_id == "sup1"
        assert s.execute(select(SimEventRow)).scalars().one().payload["outcome"] == "flagged"


def test_a_wait_that_ended_before_the_pause_does_not_suppress(db: Database, people: dict[str, str],
                                                              cfg: BrainConfig) -> None:
    """Suppression is not a blanket amnesty: a wait that ended two hours ago explains nothing now."""
    now = time.time()
    declare(db, started_at=now - 180 * MINUTE, ended_at=now - 120 * MINUTE)
    with db.session() as s:
        ticket = brain.handle_camera_observation(s, observation(idle_seconds=30 * MINUTE, ts=now), cfg)
        assert ticket is not None and ticket.kind == "ai_idle"


def test_the_observation_context_path_still_suppresses(db: Database, people: dict[str, str],
                                                       cfg: BrainConfig) -> None:
    """Either path suppresses: a detector-reported context works with no declaration at all."""
    now = time.time()
    obs = SimulatedCameraSource().observe(camera_id="cam-ex07", operator_id="op1",
                                          idle_seconds=30 * MINUTE, context="waiting_for_truck", ts=now)
    with db.session() as s:
        assert brain.handle_camera_observation(s, obs, cfg) is None
        assert s.execute(select(SimEventRow)).scalars().one().payload["outcome"] == "suppressed_explained"


# ---------------------------------------------------------------- reporting
def test_today_exposes_the_waiting_block_with_accumulated_minutes(client: TestClient, db: Database,
                                                                  tokens: dict[str, str]) -> None:
    now = time.time()
    declare(db, started_at=now - 90 * MINUTE, ended_at=now - 60 * MINUTE)                  # 30 min
    declare(db, started_at=now - 50 * MINUTE, ended_at=now - 40 * MINUTE,
            reason="machine_paused")                                                        # 10 min
    body = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()

    waiting = body["waiting"]
    assert waiting["active"] is False and waiting["minutes_now"] == 0.0
    assert waiting["since_ts"] is None and waiting["since_gmt"] is None
    assert waiting["today_total_minutes"] == pytest.approx(40.0, abs=0.2)
    assert waiting["by_reason"]["waiting_for_truck"] == pytest.approx(30.0, abs=0.2)
    assert waiting["by_reason"]["machine_paused"] == pytest.approx(10.0, abs=0.2)

    client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]))
    live = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()["waiting"]
    assert live["active"] is True and live["reason"] == "waiting_for_truck"
    assert live["reason_label"] == "Waiting for a truck"
    assert live["since_ts"] is not None and live["since_gmt"].endswith("Z")
    assert live["today_total_minutes"] >= 40.0


def test_the_waiting_summary_lists_every_period_and_the_open_one(client: TestClient, db: Database,
                                                                 tokens: dict[str, str]) -> None:
    now = time.time()
    declare(db, started_at=now - 90 * MINUTE, ended_at=now - 60 * MINUTE)
    client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["op1"]),
                json={"reason": "expected_delay"})
    body = client.get(f"{PREFIX}/tc/op/waiting", headers=auth(tokens["op1"])).json()

    assert body["operator_id"] == "op1" and body["count"] == 2
    assert [p["reason"] for p in body["periods"]] == ["waiting_for_truck", "expected_delay"]
    assert body["active"]["reason"] == "expected_delay" and body["active"]["minutes_now"] >= 0.0
    assert [r["value"] for r in body["reasons"]] == ["waiting_for_truck", "machine_paused",
                                                     "expected_delay"]
    assert body["server_ts_gmt"].endswith("Z")


def test_a_period_is_clipped_to_the_reporting_window(db: Database, people: dict[str, str]) -> None:
    """A wait that began before the window contributes only the minutes inside it."""
    now = time.time()
    declare(db, started_at=now - 60 * MINUTE, ended_at=now - 20 * MINUTE)
    with db.session() as s:
        summary = wait_summary(s, "op1", since_ts=now - 30 * MINUTE, until_ts=now)
        assert summary["total_minutes"] == pytest.approx(10.0, abs=0.2)
        assert summary["periods"][0]["minutes"] == pytest.approx(40.0, abs=0.2)
        assert summary["periods"][0]["minutes_in_window"] == pytest.approx(10.0, abs=0.2)


# ---------------------------------------------------------------- scoping
def test_an_operator_cannot_read_another_operators_waiting_time(client: TestClient,
                                                                tokens: dict[str, str]) -> None:
    r = client.get(f"{PREFIX}/tc/op/waiting", params={"operator_id": "op2"}, headers=auth(tokens["op1"]))
    assert r.status_code == 403


def test_a_supervisor_reads_their_own_operator_but_not_another_teams(client: TestClient, db: Database,
                                                                     tokens: dict[str, str]) -> None:
    declare(db, "op1", started_at=time.time() - 20 * MINUTE, ended_at=time.time() - 10 * MINUTE)
    mine = client.get(f"{PREFIX}/tc/op/waiting", params={"operator_id": "op1"}, headers=auth(tokens["sup1"]))
    assert mine.status_code == 200
    assert mine.json()["total_minutes"] == pytest.approx(10.0, abs=0.2)
    assert mine.json()["viewer"]["self"] is False

    theirs = client.get(f"{PREFIX}/tc/op/waiting", params={"operator_id": "op3"}, headers=auth(tokens["sup1"]))
    assert theirs.status_code == 403


def test_waiting_writes_are_always_self_scoped(client: TestClient, db: Database,
                                               tokens: dict[str, str]) -> None:
    """A supervisor cannot declare a wait on an operator's behalf - the write acts as the caller."""
    client.post(f"{PREFIX}/tc/op/waiting/start", headers=auth(tokens["sup1"]))
    with db.session() as s:
        assert active_wait(s, "op1") is None
        assert active_wait(s, "sup1") is not None


def test_no_token_is_401(client: TestClient) -> None:
    assert client.get(f"{PREFIX}/tc/op/waiting").status_code == 401
    assert client.post(f"{PREFIX}/tc/op/waiting/start").status_code == 401
