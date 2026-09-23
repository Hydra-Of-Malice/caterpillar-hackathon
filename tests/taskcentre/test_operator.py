"""Operator API (`/tc/op`) tests: empty day, task lifecycle, checkpoint rules, overrun ticket,
self-scoping and the critical alarm.

The real auth stack is exercised (bearer tokens issued by ``sentinel.taskcentre.auth``) rather than a
dependency override, so the 403/404 scoping assertions mean what they say.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import (
    CheckpointRow,
    NotificationRow,
    SiteRow,
    TaskChecklistResultRow,
    TaskProgressRow,
    TcIncidentRow,
    TcTaskRow,
    TicketRow,
    TrainingVideoRow,
    UserRow,
)
from sentinel.taskcentre.checklist import checklist_items
from sentinel.taskcentre import routes_operator
from sentinel.taskcentre.auth import create_session, hash_password

SITE = "north-quarry"
PREFIX = "/api/v1"


# ---------------------------------------------------------------- fixtures
@pytest.fixture()
def db(tmp_path: Path) -> Database:
    return Database(f"sqlite:///{(tmp_path / 'tc.db').as_posix()}")


@pytest.fixture()
def people(db: Database) -> dict[str, str]:
    """One admin, two supervisors and three operators; op3 belongs to the *other* supervisor."""
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
        for user_id, username, role, name, supervisor_id in rows:
            s.add(UserRow(user_id=user_id, username=username, password_hash=hash_password("pw"),
                          role=role, name=name, site_id=SITE, supervisor_id=supervisor_id))
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
    """A live bearer token per person."""
    out: dict[str, str] = {}
    with db.session() as s:
        for user_id in people:
            user = s.get(UserRow, user_id)
            out[user_id] = create_session(s, user, geofence_status="inside").token
    return out


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- builders
def make_task(db: Database, task_id: str, *, operator_id: str = "op1", supervisor_id: str = "sup1",
              start_offset_s: float = -1800.0, finish_offset_s: float = 3600.0,
              checkpoints: list[dict[str, Any]] | None = None, status: str = "pending",
              checklist: str | None = "pass") -> str:
    """Insert a task whose window is relative to now, plus its checkpoints.

    The pre-start inspection gates `start`, so by default every item is answered PASS. Pass
    ``checklist=None`` to leave it unanswered and exercise the gate itself.
    """
    now = time.time()
    with db.session() as s:
        s.add(TcTaskRow(task_id=task_id, site_id=SITE, operator_id=operator_id,
                        supervisor_id=supervisor_id, title=f"Task {task_id}",
                        instructions="Do the thing", location="Bench 3", machine_id="EX-07",
                        priority="normal", status=status, start_ts=now + start_offset_s,
                        expected_finish_ts=now + finish_offset_s))
        for i, cp in enumerate(checkpoints or []):
            s.add(CheckpointRow(checkpoint_id=f"{task_id}-cp{i}", task_id=task_id, order_index=i,
                                label=cp.get("label", f"Step {i}"), kind=cp.get("kind", "checkbox"),
                                target=cp.get("target", 1), done=cp.get("done", 0),
                                required=cp.get("required", True)))
        if checklist is not None:
            for item in checklist_items():
                s.add(TaskChecklistResultRow(task_id=task_id, item_id=item["id"], user_id=operator_id,
                                             result=checklist, critical=bool(item.get("critical")),
                                             note=None, ts=now))
    return task_id


def has_gmt(block: dict[str, Any], key: str) -> bool:
    """Every timestamp is returned as a raw float plus a `*_gmt` ISO string."""
    return key in block and f"{key}_gmt" in block


# ---------------------------------------------------------------- today
def test_today_with_no_tasks_returns_an_explicit_empty_list(client: TestClient, tokens: dict[str, str]) -> None:
    body = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()
    assert body["tasks"] == []
    assert body["empty"] is True
    assert body["empty_message"] == "No tasks assigned yet"
    assert body["ongoing_task"] is None and body["ongoing_task_id"] is None
    assert body["counts"]["total"] == 0
    assert body["alarm"] is None


def test_today_reports_login_time_and_geofence_in_gmt(client: TestClient, tokens: dict[str, str]) -> None:
    body = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()
    assert has_gmt(body, "server_ts") and body["server_ts_gmt"].endswith("Z")
    assert has_gmt(body["login"], "ts") and body["login"]["geofence_status"] == "inside"
    assert body["start_work"] is None                      # no punch yet, not a fabricated one
    assert body["geofence"]["status"] == "unverified"      # no position report yet
    assert body["geofence"]["stale"] is True


def test_today_lists_the_ongoing_task_with_progress(client: TestClient, db: Database,
                                                    tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"kind": "counted", "target": 4, "done": 1}])
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    body = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()
    assert body["empty"] is False and len(body["tasks"]) == 1
    assert body["ongoing_task_id"] == "T1"
    assert body["tasks"][0]["progress_pct"] == 25
    assert has_gmt(body["tasks"][0], "started_at")
    assert body["counts"]["ongoing"] == 1


# ---------------------------------------------------------------- lifecycle
def test_start_then_finish_completes_the_task(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"kind": "checkbox"}])
    started = client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    assert started.status_code == 200
    assert started.json()["task"]["status"] == "ongoing"
    assert started.json()["task"]["started_at"] is not None

    client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                json={"checkpoint_id": "T1-cp0", "done": 1})
    finished = client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"]))
    assert finished.status_code == 200
    task = finished.json()["task"]
    assert task["status"] == "completed" and task["finished_at"] is not None
    assert task["progress_pct"] == 100
    assert finished.json()["overrun"] is None


def test_only_one_task_can_be_ongoing(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    make_task(db, "T2")
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    clash = client.post(f"{PREFIX}/tc/op/tasks/T2/start", headers=auth(tokens["op1"]))
    assert clash.status_code == 409
    assert clash.json()["detail"]["error"] == "another_task_ongoing"
    assert clash.json()["detail"]["ongoing_task_id"] == "T1"


def test_starting_a_completed_task_is_409(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"]))
    again = client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    assert again.status_code == 409 and again.json()["detail"]["error"] == "task_completed"


def test_restarting_an_ongoing_task_is_a_no_op(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    first = client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"])).json()
    second = client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"])).json()
    assert first["started"] is True and second["started"] is False
    assert second["task"]["started_at"] == first["task"]["started_at"]


# ---------------------------------------------------------------- checkpoints
def test_counted_checkpoint_is_clamped_to_its_target(client: TestClient, db: Database,
                                                     tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"kind": "counted", "target": 3}])
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))

    high = client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                       json={"checkpoint_id": "T1-cp0", "done": 9}).json()
    assert high["checkpoint"]["done"] == 3 and high["clamped"] is True
    assert high["task"]["progress_pct"] == 100

    low = client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                      json={"checkpoint_id": "T1-cp0", "done": -2}).json()
    assert low["checkpoint"]["done"] == 0 and low["clamped"] is True


def test_checkbox_checkpoint_accepts_bool_and_stays_binary(client: TestClient, db: Database,
                                                           tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"kind": "checkbox"}])
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    ticked = client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                         json={"checkpoint_id": "T1-cp0", "done": True}).json()
    assert ticked["checkpoint"]["done"] == 1 and ticked["checkpoint"]["complete"] is True
    unticked = client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                           json={"checkpoint_id": "T1-cp0", "done": 0}).json()
    assert unticked["checkpoint"]["done"] == 0


def test_checkpoint_writes_an_audit_row(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"kind": "counted", "target": 2}])
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                json={"checkpoint_id": "T1-cp0", "done": 2})
    with db.session() as s:
        rows = s.query(TaskProgressRow).filter_by(task_id="T1", kind="checkpoint").all()
    assert len(rows) == 1 and rows[0].data["done"] == 2 and rows[0].user_id == "op1"


def test_checkpoint_on_another_operators_task_is_404(client: TestClient, db: Database,
                                                     tokens: dict[str, str]) -> None:
    make_task(db, "T9", operator_id="op2", checkpoints=[{"kind": "checkbox"}])
    r = client.post(f"{PREFIX}/tc/op/tasks/T9/checkpoint", headers=auth(tokens["op1"]),
                    json={"checkpoint_id": "T9-cp0", "done": 1})
    assert r.status_code == 404


# ---------------------------------------------------------------- finish rules
def test_finish_is_blocked_by_unmet_required_checkpoints(client: TestClient, db: Database,
                                                         tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"label": "Chock wheels", "kind": "checkbox"},
                                     {"label": "Log 3 loads", "kind": "counted", "target": 3},
                                     {"label": "Optional photo", "kind": "checkbox", "required": False}])
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    client.post(f"{PREFIX}/tc/op/tasks/T1/checkpoint", headers=auth(tokens["op1"]),
                json={"checkpoint_id": "T1-cp1", "done": 1})

    blocked = client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"]))
    assert blocked.status_code == 409
    detail = blocked.json()["detail"]
    assert detail["error"] == "required_checkpoints_incomplete"
    assert detail["exception_resolved"] is False
    labels = {cp["label"]: cp for cp in detail["unmet_checkpoints"]}
    assert set(labels) == {"Chock wheels", "Log 3 loads"}          # the optional one is not listed
    assert labels["Log 3 loads"]["remaining"] == 2

    with db.session() as s:
        assert s.get(TcTaskRow, "T1").status == "ongoing"


def test_finish_is_allowed_once_the_supervisor_resolves_the_exception(client: TestClient, db: Database,
                                                                     tokens: dict[str, str]) -> None:
    make_task(db, "T1", checkpoints=[{"label": "Chock wheels", "kind": "checkbox"}])
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    assert client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"])).status_code == 409

    with db.session() as s:                                        # what agent C's endpoint writes
        s.add(TaskProgressRow(task_id="T1", user_id="sup1", ts=time.time(), kind="exception_resolved",
                              text="Wheel chocks unavailable; verified on site", data={"decision": "resolved"}))

    ok = client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"]))
    assert ok.status_code == 200
    assert ok.json()["exception_resolved"] is True
    assert ok.json()["task"]["status"] == "completed"


def test_finishing_a_task_that_was_never_started_is_409(client: TestClient, db: Database,
                                                        tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    r = client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"]))
    assert r.status_code == 409 and r.json()["detail"]["error"] == "task_not_started"


# ---------------------------------------------------------------- overrun
def test_finishing_late_opens_a_supervisor_overrun_ticket(client: TestClient, db: Database,
                                                          tokens: dict[str, str]) -> None:
    make_task(db, "T1", start_offset_s=-3600.0, finish_offset_s=-600.0)     # planned finish 10 min ago
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    body = client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"])).json()

    overrun = body["overrun"]
    assert overrun is not None
    assert overrun["minutes_over"] == pytest.approx(10.0, abs=0.2)
    assert overrun["review_status"] == "awaiting_supervisor_review"
    assert body["task"]["overrun_ticket_id"] == overrun["ticket_id"]

    with db.session() as s:
        ticket = s.get(TicketRow, overrun["ticket_id"])
        alerts = s.query(NotificationRow).filter_by(user_id="sup1").all()
    assert ticket.kind == "task_overrun" and ticket.status == "open"
    assert ticket.owner_role == "supervisor" and ticket.owner_user_id == "sup1"
    assert ticket.subject_user_id == "op1" and ticket.task_id == "T1"
    assert ticket.evidence["minutes_over"] == pytest.approx(10.0, abs=0.2)
    assert ticket.evidence["planned_minutes"] == pytest.approx(50.0, abs=0.2)
    assert ticket.evidence["expected_finish_ts_gmt"].endswith("Z")
    assert [n.ticket_id for n in alerts] == [ticket.ticket_id]   # supervisor decides, operator waits


def test_finishing_on_time_opens_no_ticket(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1", finish_offset_s=3600.0)
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    body = client.post(f"{PREFIX}/tc/op/tasks/T1/finish", headers=auth(tokens["op1"])).json()
    assert body["overrun"] is None and body["task"]["overrun_ticket_id"] is None
    with db.session() as s:
        assert s.query(TicketRow).count() == 0


# ---------------------------------------------------------------- progress notes
def test_a_delay_note_notifies_the_supervisor(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    body = client.post(f"{PREFIX}/tc/op/tasks/T1/progress", headers=auth(tokens["op1"]),
                       json={"kind": "delay", "text": "Waiting for the haul truck"}).json()
    assert body["supervisor_notified"] is True
    assert body["entry"]["kind"] == "delay" and body["entry"]["ts_gmt"].endswith("Z")
    with db.session() as s:
        alerts = s.query(NotificationRow).filter_by(user_id="sup1").all()
    assert len(alerts) == 1 and "Waiting for the haul truck" in alerts[0].body


def test_a_plain_note_does_not_notify(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    client.post(f"{PREFIX}/tc/op/tasks/T1/start", headers=auth(tokens["op1"]))
    body = client.post(f"{PREFIX}/tc/op/tasks/T1/progress", headers=auth(tokens["op1"]),
                       json={"kind": "note", "text": "Bench cleared"}).json()
    assert body["supervisor_notified"] is False
    with db.session() as s:
        assert s.query(NotificationRow).filter_by(user_id="sup1").count() == 0


def test_an_unknown_progress_kind_is_rejected(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    r = client.post(f"{PREFIX}/tc/op/tasks/T1/progress", headers=auth(tokens["op1"]),
                    json={"kind": "excuse", "text": "nope"})
    assert r.status_code == 422


# ---------------------------------------------------------------- scoping
def test_an_operator_cannot_read_another_operators_day(client: TestClient, tokens: dict[str, str]) -> None:
    r = client.get(f"{PREFIX}/tc/op/today", params={"operator_id": "op2"}, headers=auth(tokens["op1"]))
    assert r.status_code == 403


def test_a_supervisor_reads_their_own_operator_but_not_another_teams(client: TestClient, db: Database,
                                                                     tokens: dict[str, str]) -> None:
    make_task(db, "T1")
    mine = client.get(f"{PREFIX}/tc/op/today", params={"operator_id": "op1"}, headers=auth(tokens["sup1"]))
    assert mine.status_code == 200
    assert mine.json()["operator"]["user_id"] == "op1" and mine.json()["viewer"]["self"] is False
    assert len(mine.json()["tasks"]) == 1

    theirs = client.get(f"{PREFIX}/tc/op/today", params={"operator_id": "op3"}, headers=auth(tokens["sup1"]))
    assert theirs.status_code == 403


def test_an_admin_reads_any_operator(client: TestClient, tokens: dict[str, str]) -> None:
    r = client.get(f"{PREFIX}/tc/op/today", params={"operator_id": "op3"}, headers=auth(tokens["adm1"]))
    assert r.status_code == 200 and r.json()["operator"]["user_id"] == "op3"


def test_writes_are_always_self_scoped(client: TestClient, db: Database, tokens: dict[str, str]) -> None:
    make_task(db, "T9", operator_id="op2")
    for token in (tokens["op1"], tokens["sup1"], tokens["adm1"]):
        assert client.post(f"{PREFIX}/tc/op/tasks/T9/start", headers=auth(token)).status_code == 404


def test_no_token_is_401(client: TestClient) -> None:
    assert client.get(f"{PREFIX}/tc/op/today").status_code == 401


# ---------------------------------------------------------------- training
def test_training_is_grouped_by_category_in_order(client: TestClient, db: Database,
                                                  tokens: dict[str, str]) -> None:
    with db.session() as s:
        s.add(TrainingVideoRow(video_id="v2", title="Blind spots", category="safety", order_index=1))
        s.add(TrainingVideoRow(video_id="v1", title="Daily walkaround", category="safety", order_index=0))
        s.add(TrainingVideoRow(video_id="v3", title="Smooth grading", category="operation",
                               order_index=2, url="https://example.invalid/clip.mp4"))
    body = client.get(f"{PREFIX}/tc/op/training", headers=auth(tokens["op1"])).json()
    assert [v["video_id"] for v in body["videos"]] == ["v1", "v2", "v3"]
    assert [g["category"] for g in body["categories"]] == ["safety", "operation"]
    assert body["videos"][0]["url"] is None and body["videos"][0]["player"] == "placeholder"
    assert body["videos"][2]["player"] == "url"
    assert "DEMO" in body["videos"][0]["label"]


def test_training_is_empty_not_invented(client: TestClient, tokens: dict[str, str]) -> None:
    body = client.get(f"{PREFIX}/tc/op/training", headers=auth(tokens["op1"])).json()
    assert body["videos"] == [] and body["categories"] == [] and body["empty"] is True


# ---------------------------------------------------------------- notifications & alarm
def add_alarm(db: Database, *, user_id: str = "op1", incident_id: str | None = None) -> str:
    with db.session() as s:
        if incident_id:
            s.add(TcIncidentRow(incident_id=incident_id, site_id=SITE, machine_id="EX-07",
                                kind="hydraulic_pressure", ts=time.time(), nearest_user_id=user_id))
        s.add(NotificationRow(notification_id="ntf-alarm", user_id=user_id, ts=time.time(),
                              kind="critical_incident", severity="critical", alarm=True,
                              title="Critical: EX-07 hydraulic pressure",
                              body="Attend the machine", incident_id=incident_id))
    return "ntf-alarm"


def test_an_active_alarm_surfaces_in_today_and_clears_after_ack(client: TestClient, db: Database,
                                                                tokens: dict[str, str]) -> None:
    add_alarm(db, incident_id="inc-1")
    before = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()
    assert before["alarm"]["notification_id"] == "ntf-alarm"
    assert before["alarm"]["alarm"] is True and before["alarm"]["unacknowledged"] is True
    assert before["unacknowledged_notifications"] == 1

    acked = client.post(f"{PREFIX}/tc/op/notifications/ntf-alarm/ack", headers=auth(tokens["op1"]))
    assert acked.status_code == 200
    assert acked.json()["alarm_cleared"] is True and acked.json()["alarm"] is None
    assert acked.json()["incident"]["acknowledged_by"] == "op1"
    assert acked.json()["notification"]["acknowledged_at_gmt"].endswith("Z")

    after = client.get(f"{PREFIX}/tc/op/today", headers=auth(tokens["op1"])).json()
    assert after["alarm"] is None and after["unacknowledged_notifications"] == 0


def test_acknowledging_twice_keeps_the_first_responder(client: TestClient, db: Database,
                                                       tokens: dict[str, str]) -> None:
    add_alarm(db, incident_id="inc-1")
    first = client.post(f"{PREFIX}/tc/op/notifications/ntf-alarm/ack", headers=auth(tokens["op1"])).json()
    second = client.post(f"{PREFIX}/tc/op/notifications/ntf-alarm/ack", headers=auth(tokens["op1"])).json()
    assert first["already_acknowledged"] is False and second["already_acknowledged"] is True
    assert second["notification"]["acknowledged_at"] == first["notification"]["acknowledged_at"]
    with db.session() as s:
        assert s.get(TcIncidentRow, "inc-1").acknowledged_at == first["incident"]["acknowledged_at"]


def test_notifications_are_newest_first_with_flags(client: TestClient, db: Database,
                                                   tokens: dict[str, str]) -> None:
    now = time.time()
    with db.session() as s:
        for i, offset in enumerate((-300.0, -100.0)):
            s.add(NotificationRow(notification_id=f"n{i}", user_id="op1", ts=now + offset,
                                  kind="task", severity="info", title=f"Note {i}"))
    body = client.get(f"{PREFIX}/tc/op/notifications", headers=auth(tokens["op1"])).json()
    assert [n["notification_id"] for n in body["notifications"]] == ["n1", "n0"]
    assert body["unread"] == 2 and all(n["unread"] for n in body["notifications"])
    assert body["alarm"] is None

    marked = client.get(f"{PREFIX}/tc/op/notifications", params={"mark_read": True},
                        headers=auth(tokens["op1"])).json()
    assert marked["unread"] == 0
    assert client.get(f"{PREFIX}/tc/op/notifications", headers=auth(tokens["op1"])).json()["unread"] == 0


def test_acking_someone_elses_notification_is_404(client: TestClient, db: Database,
                                                  tokens: dict[str, str]) -> None:
    add_alarm(db, user_id="op2")
    r = client.post(f"{PREFIX}/tc/op/notifications/ntf-alarm/ack", headers=auth(tokens["op1"]))
    assert r.status_code == 404
