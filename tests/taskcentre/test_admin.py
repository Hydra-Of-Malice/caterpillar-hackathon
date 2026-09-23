"""Task Centre admin API: role enforcement, staleness honesty, filters and the ticket audit trail.

The tests sign in through the real auth stack (a `tc_session` token per role) rather than overriding
the dependency, so the 403s they assert are the ones a browser would get.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import (CameraRow, GeofenceRow, LocationReportRow, NotificationRow,
                                              PunchRow, ReviewDecisionRow, SiteRow, TcIncidentRow,
                                              TicketRow, UserRow)
from sentinel.store.db import Database
from sentinel.taskcentre import routes_admin
from sentinel.taskcentre.auth import create_session, hash_password

SITE = "north-quarry"
NOW = time.time()
FRESH = NOW - 30.0
OLD = NOW - 5_000.0
FENCE_LAT, FENCE_LON = 10.0, 20.0

GET_ROUTES = ("/api/v1/tc/admin/overview", "/api/v1/tc/admin/people", "/api/v1/tc/admin/tickets",
              "/api/v1/tc/admin/cameras", "/api/v1/tc/admin/incidents")


def _user(user_id: str, username: str, role: str, *, supervisor_id: str | None = None,
          machine_id: str | None = None) -> UserRow:
    return UserRow(user_id=user_id, username=username, password_hash=hash_password("pw", iterations=1),
                   role=role, name=username.upper(), site_id=SITE, supervisor_id=supervisor_id,
                   machine_id=machine_id, active=True, created_at=NOW - 86_400, meta={})


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    """A site with 5 people, 3 machines, 4 cameras, 3 tickets and 2 incidents."""
    database = Database(f"sqlite:///{(tmp_path / 'tc.db').as_posix()}")
    with database.session() as s:
        s.add(SiteRow(site_id=SITE, name="North Quarry", meta={}))
        s.add(GeofenceRow(geofence_id="gf-1", site_id=SITE, name="perimeter", center_lat=FENCE_LAT,
                          center_lon=FENCE_LON, radius_m=500.0, max_accuracy_m=100.0, active=True))
        s.add_all([_user("u-adm", "adm", "admin"), _user("u-sup", "sup", "supervisor"),
                   _user("u-op1", "op1", "operator", supervisor_id="u-sup", machine_id="EX-07"),
                   _user("u-op2", "op2", "operator", supervisor_id="u-sup", machine_id="EX-07"),
                   _user("u-op3", "op3", "operator", supervisor_id="u-sup")])
        s.add_all([MachineRow(machine_id="EX-07", model="Cat 320 (simulated)", machine_type="EX-20t",
                              site_id=SITE, meta={}),
                   MachineRow(machine_id="EX-09", model="Cat 336 (simulated)", machine_type="EX-36t",
                              site_id=SITE, meta={}),
                   MachineRow(machine_id="EX-11", model="Cat 950 (simulated)", machine_type="WL-20t",
                              site_id=SITE, meta={})])
        s.add_all([
            CameraRow(camera_id="cam-fresh", site_id=SITE, machine_id="EX-07", label="EX-07 cab",
                      stream_kind="simulated", last_frame_ts=FRESH, meta={}),
            CameraRow(camera_id="cam-stale", site_id=SITE, machine_id="EX-07", label="EX-07 rear",
                      stream_kind="simulated", last_frame_ts=OLD, meta={}),
            CameraRow(camera_id="cam-down", site_id=SITE, machine_id="EX-09", label="EX-09 cab",
                      stream_kind="unavailable", last_frame_ts=None, meta={}),
            CameraRow(camera_id="cam-silent", site_id=SITE, machine_id="EX-09", label="EX-09 rear",
                      stream_kind="simulated", last_frame_ts=None, meta={}),
        ])
        s.add_all([
            LocationReportRow(user_id="u-op1", ts=FRESH, lat=FENCE_LAT, lon=FENCE_LON, accuracy_m=10.0,
                              geofence_status="inside", source="browser"),
            LocationReportRow(user_id="u-op2", ts=OLD, lat=FENCE_LAT, lon=FENCE_LON, accuracy_m=10.0,
                              geofence_status="inside", source="browser"),
            LocationReportRow(user_id="u-op3", ts=FRESH, lat=FENCE_LAT + 0.05, lon=FENCE_LON,
                              accuracy_m=10.0, geofence_status="outside", source="browser"),
        ])
        s.add(PunchRow(punch_id="p-1", user_id="u-op1", kind="start_work", ts=FRESH, lat=FENCE_LAT,
                       lon=FENCE_LON, accuracy_m=10.0, geofence_status="inside", geofence_id="gf-1",
                       distance_m=0.0, ticket_id=None))
        s.add_all([
            TicketRow(ticket_id="tkt-geo", site_id=SITE, kind="geofence_punch", severity="medium",
                      status="open", subject_user_id="u-op1", owner_role="supervisor",
                      owner_user_id="u-sup", title="Punch outside the fence", detail="",
                      source="RULE", evidence={"distance_m": 900}, created_at=NOW - 600, machine_id=None),
            TicketRow(ticket_id="tkt-idle", site_id=SITE, kind="ai_idle", severity="low",
                      status="confirmed", subject_user_id="u-op2", owner_role="supervisor",
                      owner_user_id="u-sup", title="Idle flag", detail="", source="SIMULATED",
                      evidence={}, created_at=NOW - 500, machine_id="EX-07"),
            TicketRow(ticket_id="tkt-over", site_id=SITE, kind="task_overrun", severity="critical",
                      status="open", subject_user_id="u-op3", owner_role="supervisor",
                      owner_user_id="u-sup", title="Task overrun", detail="", source="RULE",
                      evidence={}, created_at=NOW - 400, machine_id="EX-09"),
        ])
        s.add_all([
            TcIncidentRow(incident_id="inc-ack", site_id=SITE, machine_id="EX-07", kind="hydraulic",
                          severity="critical", ts=FRESH, lat=FENCE_LAT, lon=FENCE_LON, detail="",
                          source="SIMULATED", nearest_user_id="u-op1", nearest_distance_m=42.0,
                          dispatch_status="dispatched", acknowledged_by="u-op1", acknowledged_at=NOW - 10,
                          notified_user_ids=["u-op1", "u-sup", "u-ghost"], dedupe_key="EX-07:hydraulic",
                          data={}),
            TcIncidentRow(incident_id="inc-open", site_id=SITE, machine_id="EX-09", kind="fire",
                          severity="critical", ts=NOW - 120, lat=None, lon=None, detail="",
                          source="SIMULATED", nearest_user_id=None, nearest_distance_m=None,
                          dispatch_status="no_eligible_operator", acknowledged_by=None,
                          acknowledged_at=None, notified_user_ids=["u-sup", "u-adm"],
                          dedupe_key="EX-09:fire", data={}),
        ])
    return database


@pytest.fixture()
def tokens(db: Database) -> dict[str, str]:
    """A live bearer token per role."""
    out: dict[str, str] = {}
    with db.session() as s:
        for role, user_id in (("admin", "u-adm"), ("supervisor", "u-sup"), ("operator", "u-op1")):
            out[role] = create_session(s, s.get(UserRow, user_id)).token
    return out


@pytest.fixture()
def client(db: Database) -> Iterator[TestClient]:
    app = FastAPI()
    app.state.db = db
    app.state.db_factory = lambda: db
    app.include_router(routes_admin.router, prefix="/api/v1")
    with TestClient(app) as c:
        yield c


def _get(client: TestClient, token: str, path: str, **params: Any) -> Any:
    response = client.get(path, headers={"Authorization": f"Bearer {token}"}, params=params)
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- permissions
@pytest.mark.parametrize("path", GET_ROUTES)
@pytest.mark.parametrize("role", ["operator", "supervisor"])
def test_non_admin_roles_are_forbidden(client: TestClient, tokens: dict[str, str], path: str,
                                       role: str) -> None:
    """Enforcement is server-side: an operator or supervisor token gets 403, not a filtered payload."""
    response = client.get(path, headers={"Authorization": f"Bearer {tokens[role]}"})
    assert response.status_code == 403


@pytest.mark.parametrize("path", GET_ROUTES)
def test_missing_token_is_unauthorised(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 401


def test_decision_requires_admin(client: TestClient, tokens: dict[str, str]) -> None:
    for role in ("operator", "supervisor"):
        response = client.post("/api/v1/tc/admin/tickets/tkt-geo/decision",
                               headers={"Authorization": f"Bearer {tokens[role]}"},
                               json={"decision": "confirmed", "comment": "no"})
        assert response.status_code == 403
    with client.app.state.db.session() as s:
        assert s.query(ReviewDecisionRow).count() == 0
        assert s.get(TicketRow, "tkt-geo").status == "open"


# ---------------------------------------------------------------- overview
def test_overview_counts_and_staleness(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/overview")
    machines = {m["machine_id"]: m for m in body["machines"]}
    assert set(machines) == {"EX-07", "EX-09", "EX-11"}

    ex07 = machines["EX-07"]
    assert ex07["camera_count"] == 2 and ex07["cameras_stale"] == 1
    assert ex07["stale"] is False and ex07["age_s"] < 600
    assert ex07["last_seen_ts_gmt"].endswith("Z")
    assert ex07["status"] == "ok"                      # fresh camera, acknowledged incident, no open ticket
    assert ex07["tickets"]["by_kind"]["ai_idle"] == {"open": 0, "closed": 1}
    assert sorted(ex07["assigned_user_ids"]) == ["u-op1", "u-op2"]

    ex09 = machines["EX-09"]
    assert ex09["status"] == "incident"                 # unacknowledged incident outranks everything
    assert ex09["tickets"]["by_severity"]["critical"] == {"open": 1, "closed": 0}
    assert ex09["incidents"] == {"total": 1, "open": 1, "no_eligible_operator": 1}

    quiet = machines["EX-11"]
    assert quiet["last_seen_ts"] is None and quiet["stale"] is True
    assert quiet["status"] == "no_recent_data"          # silence is never reported as "ok"

    totals = body["totals"]
    assert totals["tickets"]["open"] == 2 and totals["tickets"]["closed"] == 1
    assert totals["incidents"] == {"total": 2, "open": 1, "acknowledged": 1, "no_eligible_operator": 1}
    assert totals["cameras"] == 4 and totals["cameras_stale"] == 3
    assert totals["people"] == {"total": 5, "active": 5, "on_site": 1, "off_site": 1, "unverified": 0,
                                "stale": 1, "never_reported": 2}
    assert body["now_ts_gmt"].endswith("Z") and "staleness_s" in body


# ---------------------------------------------------------------- people
def test_people_location_freshness_and_disclaimer(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/people")
    assert "indication" in body["disclaimer"] and body["stale_after_s"] == 600.0
    people = {p["user_id"]: p for p in body["people"]}
    assert len(people) == 5

    op1 = people["u-op1"]
    assert op1["presence"] == "on_site" and op1["location"]["stale"] is False
    assert op1["location"]["geofence_status"] == "inside" and op1["location"]["distance_m"] == 0.0
    assert op1["location"]["geofence_recheck"] == "inside"
    assert op1["location"]["ts_gmt"].endswith("Z") and op1["location"]["age_s"] >= 0
    assert op1["role"] == "operator" and op1["supervisor"]["user_id"] == "u-sup"
    assert op1["last_punch"]["kind"] == "start_work" and op1["last_punch"]["ts_gmt"].endswith("Z")

    assert people["u-op2"]["presence"] == "stale" and people["u-op2"]["location"]["stale"] is True
    assert people["u-op3"]["presence"] == "off_site"
    assert people["u-op3"]["location"]["distance_m"] > 500
    assert people["u-sup"]["location"] is None and people["u-sup"]["presence"] == "never_reported"
    assert people["u-sup"]["last_punch"] is None
    assert "password_hash" not in op1


def test_people_stale_threshold_is_configurable(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/people", stale_after_s=1)
    people = {p["user_id"]: p for p in body["people"]}
    assert body["stale_after_s"] == 1.0
    assert people["u-op1"]["presence"] == "stale"       # a 30 s old fix is stale at a 1 s threshold


def test_people_role_filter(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/people", role="operator")
    assert {p["user_id"] for p in body["people"]} == {"u-op1", "u-op2", "u-op3"}


# ---------------------------------------------------------------- tickets
def test_ticket_filters(client: TestClient, tokens: dict[str, str]) -> None:
    def ids(**params: Any) -> set[str]:
        return {t["ticket_id"] for t in _get(client, tokens["admin"], "/api/v1/tc/admin/tickets",
                                             **params)["tickets"]}

    assert ids() == {"tkt-geo", "tkt-idle", "tkt-over"}
    assert ids(status="open") == {"tkt-geo", "tkt-over"}
    assert ids(kind="ai_idle") == {"tkt-idle"}
    assert ids(machine="EX-09") == {"tkt-over"}
    assert ids(user="u-op2") == {"tkt-idle"}                     # matches the subject
    assert ids(user="u-sup") == {"tkt-geo", "tkt-idle", "tkt-over"}   # matches the owner
    assert ids(status="open", machine="EX-09") == {"tkt-over"}
    assert ids(kind="nothing_like_this") == set()


def test_tickets_carry_names_and_history(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/tickets", status="open")
    ticket = next(t for t in body["tickets"] if t["ticket_id"] == "tkt-geo")
    assert ticket["subject_user"]["name"] == "OP1" and ticket["owner_user"]["name"] == "SUP"
    assert ticket["decisions"] == [] and ticket["decision_count"] == 0
    assert ticket["created_at_gmt"].endswith("Z") and ticket["open"] is True
    assert body["counts"]["open"] == 2


# ---------------------------------------------------------------- decisions
def test_decision_appends_history_without_rewriting_the_ticket(client: TestClient,
                                                               tokens: dict[str, str]) -> None:
    headers = {"Authorization": f"Bearer {tokens['admin']}"}
    with client.app.state.db.session() as s:
        before = s.get(TicketRow, "tkt-geo")
        original = (before.title, before.detail, before.severity, before.kind, before.created_at,
                    dict(before.evidence), before.subject_user_id, before.owner_user_id, before.source)

    first = client.post("/api/v1/tc/admin/tickets/tkt-geo/decision", headers=headers,
                        json={"decision": "more_info", "comment": "photo please"})
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "open"              # more_info leaves the ticket in the queue

    second = client.post("/api/v1/tc/admin/tickets/tkt-geo/decision", headers=headers,
                         json={"decision": "confirmed", "comment": "outside the fence"})
    assert second.status_code == 200, second.text
    payload = second.json()
    assert payload["previous_status"] == "open" and payload["status"] == "confirmed"
    assert payload["decision"]["reviewer_id"] == "u-adm" and payload["decision"]["reviewer_role"] == "admin"
    assert payload["decision"]["ts_gmt"].endswith("Z")
    assert sorted(payload["notified_user_ids"]) == ["u-op1", "u-sup"]

    history = payload["ticket"]["decisions"]
    assert [d["decision"] for d in history] == ["more_info", "confirmed"]          # oldest first
    assert history[0]["ts"] <= history[1]["ts"]

    with client.app.state.db.session() as s:
        after = s.get(TicketRow, "tkt-geo")
        assert (after.title, after.detail, after.severity, after.kind, after.created_at,
                dict(after.evidence), after.subject_user_id, after.owner_user_id,
                after.source) == original
        assert after.status == "confirmed"               # status is the only field a review moves
        assert s.query(ReviewDecisionRow).filter_by(ticket_id="tkt-geo").count() == 2
        notes = s.query(NotificationRow).filter_by(ticket_id="tkt-geo").all()
        assert {n.user_id for n in notes} == {"u-op1", "u-sup"}
        assert all(n.kind == "ticket" and not n.alarm for n in notes)


@pytest.mark.parametrize("decision,expected", [("confirmed", "confirmed"), ("dismissed", "dismissed"),
                                               ("resolved", "resolved"), ("acknowledged", "open")])
def test_decision_status_mapping(client: TestClient, tokens: dict[str, str], decision: str,
                                 expected: str) -> None:
    response = client.post("/api/v1/tc/admin/tickets/tkt-over/decision",
                           headers={"Authorization": f"Bearer {tokens['admin']}"},
                           json={"decision": decision, "comment": ""})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == expected


def test_decision_unknown_ticket_is_404(client: TestClient, tokens: dict[str, str]) -> None:
    response = client.post("/api/v1/tc/admin/tickets/tkt-nope/decision",
                           headers={"Authorization": f"Bearer {tokens['admin']}"},
                           json={"decision": "confirmed", "comment": ""})
    assert response.status_code == 404


def test_unknown_decision_is_rejected(client: TestClient, tokens: dict[str, str]) -> None:
    response = client.post("/api/v1/tc/admin/tickets/tkt-geo/decision",
                           headers={"Authorization": f"Bearer {tokens['admin']}"},
                           json={"decision": "deleted", "comment": ""})
    assert response.status_code == 400
    with client.app.state.db.session() as s:
        assert s.get(TicketRow, "tkt-geo").status == "open"
        assert s.query(ReviewDecisionRow).count() == 0


# ---------------------------------------------------------------- cameras
def test_cameras_report_unavailable_rather_than_live(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/cameras")
    cameras = {c["camera_id"]: c for c in body["cameras"]}
    assert body["count"] == 4 and body["available"] == 1 and body["unavailable"] == 3

    fresh = cameras["cam-fresh"]
    assert fresh["state"] == "simulated" and fresh["available"] is True and fresh["stale"] is False
    assert fresh["machine"]["model"] == "Cat 320 (simulated)"
    assert fresh["last_frame_ts_gmt"].endswith("Z")

    assert cameras["cam-stale"]["state"] == "unavailable"
    assert cameras["cam-stale"]["unavailable_reason"] == "last_frame_older_than_threshold"
    assert cameras["cam-stale"]["reported_stream_kind"] == "simulated"   # the raw row is preserved
    assert cameras["cam-down"]["unavailable_reason"] == "reported_unavailable"
    assert cameras["cam-silent"]["unavailable_reason"] == "no_frame_received"
    assert cameras["cam-silent"]["last_frame_ts"] is None and cameras["cam-silent"]["stale"] is True


# ---------------------------------------------------------------- incidents
def test_incidents_resolve_people_and_dispatch(client: TestClient, tokens: dict[str, str]) -> None:
    body = _get(client, tokens["admin"], "/api/v1/tc/admin/incidents")
    incidents = {i["incident_id"]: i for i in body["incidents"]}
    assert body["count"] == 2 and body["open"] == 1 and body["no_eligible_operator"] == 1

    acked = incidents["inc-ack"]
    assert acked["nearest_user"]["name"] == "OP1" and acked["nearest_distance_m"] == 42.0
    assert acked["dispatch_status"] == "dispatched" and acked["acknowledged"] is True
    assert acked["acknowledged_by_user"]["name"] == "OP1"
    assert acked["acknowledged_at_gmt"].endswith("Z") and acked["ts_gmt"].endswith("Z")
    names = {n["user_id"]: n["name"] for n in acked["notified_users"]}
    assert names == {"u-op1": "OP1", "u-sup": "SUP", "u-ghost": None}   # unknown ids are not invented

    unstaffed = incidents["inc-open"]
    assert unstaffed["dispatch_status"] == "no_eligible_operator"
    assert unstaffed["nearest_user"] is None and unstaffed["nearest_user_id"] is None
    assert unstaffed["acknowledged"] is False and unstaffed["acknowledged_at"] is None
    assert unstaffed["acknowledged_at_gmt"] is None
