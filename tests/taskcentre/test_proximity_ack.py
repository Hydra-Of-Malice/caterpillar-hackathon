"""Tests for the operator's acknowledge/dispute step on a proximity flag, and the critical path.

A person-near-machine flag is a statement about somebody's work, made by a detector that cannot see
why anybody was there. So these tests assert three things that are easy to get wrong:

* the operator is *asked* - a proximity event raises a prompt aimed at them, not only an alert about
  them;
* both answers are **appended**, never destructive - after a dispute the incident, the ticket
  evidence and the ticket status are byte-for-byte what they were;
* a dispute is not a veto and not a shrug - the supervisor is notified either way, and the operator's
  words travel with the notification.

The last test covers the existing critical path end to end: incident recorded, supervisor told, and
the incident visible in the admin list.
"""
from __future__ import annotations

import time

from sqlalchemy import select

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import (LocationReportRow, NotificationRow, ReviewDecisionRow,
                                              TcIncidentRow, TicketRow)
from sentinel.taskcentre import brain
from sentinel.taskcentre.adapters import SimulatedMachineSensorSource
from sentinel.taskcentre.brain import KIND_PROXIMITY_FLAG, BrainConfig
from tests.taskcentre.conftest import SITE, World

CENTRE_LAT, CENTRE_LON = 1.0, 1.0
METRES_PER_DEGREE = 111_320.0
PROXIMITY_KIND = "person_in_zone"


def north_of_centre(metres: float) -> tuple[float, float]:
    return CENTRE_LAT + metres / METRES_PER_DEGREE, CENTRE_LON


def put(db: Database, user_id: str, *, metres: float, ts: float) -> None:
    """Report a position for somebody, so nearest-operator dispatch has something to work with."""
    lat, lon = north_of_centre(metres)
    with db.session() as s:
        s.add(LocationReportRow(user_id=user_id, ts=ts, lat=lat, lon=lon, accuracy_m=10.0,
                                geofence_status="inside", source="simulated"))


def event(*, machine_id: str = "EX-07", kind: str = PROXIMITY_KIND, metres: float = 0.0,
          ts: float | None = None):
    lat, lon = north_of_centre(metres)
    return SimulatedMachineSensorSource().emit(machine_id=machine_id, kind=kind, lat=lat, lon=lon,
                                               site_id=SITE, ts=time.time() if ts is None else ts,
                                               detail="Person detected inside the swing radius.")


def raise_proximity(db: Database, **kwargs) -> tuple[str, str]:
    """Run one proximity event through the brain; returns ``(incident_id, flag_ticket_id)``."""
    with db.session() as s:
        incident = brain.handle_machine_sensor(s, event(**kwargs), BrainConfig.load())
        ticket = s.execute(select(TicketRow).where(TicketRow.kind == KIND_PROXIMITY_FLAG,
                                                   TicketRow.incident_id == incident.incident_id)
                           ).scalars().one()
        return incident.incident_id, ticket.ticket_id


def notifications(db: Database, user_id: str) -> list[NotificationRow]:
    with db.session() as s:
        return list(s.execute(select(NotificationRow).where(NotificationRow.user_id == user_id)
                              .order_by(NotificationRow.ts, NotificationRow.notification_id)).scalars())


def decisions(db: Database, ticket_id: str) -> list[ReviewDecisionRow]:
    with db.session() as s:
        return list(s.execute(select(ReviewDecisionRow).where(ReviewDecisionRow.ticket_id == ticket_id)
                              .order_by(ReviewDecisionRow.id)).scalars())


# ---------------------------------------------------------------- the prompt
def test_a_proximity_event_asks_the_operator_to_confirm_or_dispute(world: World) -> None:
    """The alert path still runs, and on top of it the operator on the machine is asked what happened."""
    now = time.time()
    put(world.db, world.ids["op1"], metres=50.0, ts=now)

    incident_id, ticket_id = raise_proximity(world.db)

    with world.db.session() as s:
        ticket = s.get(TicketRow, ticket_id)
        assert ticket.subject_user_id == world.ids["op1"]        # EX-07 is op1's machine
        assert ticket.owner_role == "supervisor" and ticket.owner_user_id == world.ids["sup1"]
        assert ticket.status == "open"
        assert ticket.evidence["incident_id"] == incident_id
        assert ticket.evidence["response_options"] == ["acknowledged", "disputed"]
        assert "not a veto" in ticket.evidence["dispute_policy"]

    prompts = [n for n in notifications(world.db, world.ids["op1"]) if n.kind == KIND_PROXIMITY_FLAG]
    assert len(prompts) == 1
    assert prompts[0].ticket_id == ticket_id and prompts[0].incident_id == incident_id
    assert "confirm" in prompts[0].body and "dispute" in prompts[0].body


def test_a_non_proximity_event_raises_no_operator_prompt(world: World) -> None:
    """A hydraulic fault is not an accusation about anybody, so nobody is asked to answer for it."""
    now = time.time()
    put(world.db, world.ids["op1"], metres=50.0, ts=now)
    with world.db.session() as s:
        brain.handle_machine_sensor(s, event(kind="hydraulic_pressure_loss"), BrainConfig.load())
        assert s.execute(select(TicketRow).where(TicketRow.kind == KIND_PROXIMITY_FLAG)
                         ).scalars().all() == []


def test_the_prompt_is_raised_even_when_nobody_was_eligible_for_dispatch(world: World) -> None:
    """Nobody reported a position, so no operator was dispatched - the person at the controls is still
    the one who can say what happened, and they are still asked."""
    incident_id, ticket_id = raise_proximity(world.db)
    with world.db.session() as s:
        assert s.get(TcIncidentRow, incident_id).dispatch_status == "no_eligible_operator"
        assert s.get(TicketRow, ticket_id).subject_user_id == world.ids["op1"]


def test_no_prompt_is_invented_when_no_operator_is_on_the_machine(world: World) -> None:
    """EX-11 is nobody's machine. No person is picked to answer for an event they had no part in."""
    with world.db.session() as s:
        brain.handle_machine_sensor(s, event(machine_id="EX-11"), BrainConfig.load())
        assert s.execute(select(TicketRow).where(TicketRow.kind == KIND_PROXIMITY_FLAG)
                         ).scalars().all() == []


# ---------------------------------------------------------------- GET /tc/op/flags
def test_flags_endpoint_lists_what_is_awaiting_this_operator(world: World) -> None:
    _incident_id, ticket_id = raise_proximity(world.db)

    body = world.get("op1", "/tc/op/flags").json()
    assert body["operator_id"] == world.ids["op1"]
    assert body["awaiting"] == 1 and body["count"] == 1
    flag = body["flags"][0]
    assert flag["ticket_id"] == ticket_id
    assert flag["awaiting_response"] is True and flag["your_response"] is None
    assert flag["incident"]["kind"] == PROXIMITY_KIND
    assert [o["response"] for o in flag["response_options"]] == ["acknowledged", "disputed"]
    assert flag["evidence"]["machine_id"] == "EX-07"
    assert "not a veto" in flag["note"]

    # Another operator's list is their own, and it is empty.
    assert world.get("op3", "/tc/op/flags").json()["flags"] == []


def test_answered_flags_leave_the_awaiting_list_but_stay_on_the_record(world: World) -> None:
    _incident_id, ticket_id = raise_proximity(world.db)
    world.post("op1", f"/tc/op/flags/{ticket_id}/respond", json={"response": "acknowledged"})

    assert world.get("op1", "/tc/op/flags").json()["awaiting"] == 0
    full = world.get("op1", "/tc/op/flags?include_answered=true").json()
    assert full["total"] == 1 and full["count"] == 1
    assert full["flags"][0]["your_response"] == "acknowledged"


# ---------------------------------------------------------------- POST .../respond
def test_acknowledging_appends_a_decision_and_tells_the_supervisor(world: World) -> None:
    _incident_id, ticket_id = raise_proximity(world.db)

    response = world.post("op1", f"/tc/op/flags/{ticket_id}/respond",
                          json={"response": "acknowledged", "comment": "Yes, the banksman stepped in."})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True and body["response"] == "acknowledged"
    assert body["evidence_unchanged"] is True and body["status_unchanged"] == "open"
    assert body["notified_user_ids"] == [world.ids["sup1"]]
    assert body["notification"]["unacknowledged"] is False        # the prompt is marked handled

    recorded = decisions(world.db, ticket_id)
    assert len(recorded) == 1
    assert recorded[0].reviewer_id == world.ids["op1"] and recorded[0].reviewer_role == "operator"
    assert recorded[0].decision == "acknowledged"
    assert recorded[0].comment == "Yes, the banksman stepped in."

    supervisor_notes = [n for n in notifications(world.db, world.ids["sup1"])
                        if n.kind == KIND_PROXIMITY_FLAG]
    assert len(supervisor_notes) == 1
    assert "confirmed the proximity flag" in supervisor_notes[0].title
    assert supervisor_notes[0].ticket_id == ticket_id


def test_a_dispute_is_preserved_verbatim_and_changes_nothing_it_was_built_from(world: World) -> None:
    """The operator's account is added to the record. The evidence and the event are not edited."""
    incident_id, ticket_id = raise_proximity(world.db)
    account = "That was the fuel bowser on the haul road, 20 m away, not a person in the zone."
    with world.db.session() as s:
        incident = s.get(TcIncidentRow, incident_id)
        ticket = s.get(TicketRow, ticket_id)
        before_incident = (incident.kind, incident.ts, incident.detail, incident.severity,
                           incident.dispatch_status, dict(incident.data or {}))
        before_ticket = (ticket.title, ticket.detail, ticket.severity, ticket.status, ticket.created_at,
                         dict(ticket.evidence or {}))

    body = world.post("op1", f"/tc/op/flags/{ticket_id}/respond",
                      json={"response": "disputed", "comment": account}).json()

    assert body["response"] == "disputed"
    assert body["flag"]["your_comment"] == account                 # verbatim, not summarised
    assert body["flag"]["status"] == "open"                        # a dispute is not a veto

    with world.db.session() as s:
        incident = s.get(TcIncidentRow, incident_id)
        ticket = s.get(TicketRow, ticket_id)
        assert (incident.kind, incident.ts, incident.detail, incident.severity,
                incident.dispatch_status, dict(incident.data or {})) == before_incident
        assert (ticket.title, ticket.detail, ticket.severity, ticket.status, ticket.created_at,
                dict(ticket.evidence or {})) == before_ticket

    recorded = decisions(world.db, ticket_id)
    assert len(recorded) == 1 and recorded[0].decision == "disputed"
    assert recorded[0].comment == account and recorded[0].data["verbatim"] is True

    # The supervisor gets the dispute with the operator's own words in it, not a bare status change.
    supervisor_notes = [n for n in notifications(world.db, world.ids["sup1"])
                        if n.kind == KIND_PROXIMITY_FLAG]
    assert len(supervisor_notes) == 1
    assert "disputes the proximity flag" in supervisor_notes[0].title
    assert account in supervisor_notes[0].body
    assert "unchanged" in supervisor_notes[0].body


def test_a_dispute_needs_the_operators_account(world: World) -> None:
    """"This is wrong" with nothing behind it cannot be reviewed, so it is refused - like a checklist FAIL."""
    _incident_id, ticket_id = raise_proximity(world.db)
    response = world.post("op1", f"/tc/op/flags/{ticket_id}/respond", json={"response": "disputed"})
    assert response.status_code == 400
    assert "verbatim" in response.json()["detail"]
    assert decisions(world.db, ticket_id) == []


def test_a_second_answer_is_appended_rather_than_overwriting_the_first(world: World) -> None:
    """Somebody who taps the wrong button is never stuck with it, and the first answer still stands."""
    _incident_id, ticket_id = raise_proximity(world.db)
    world.post("op1", f"/tc/op/flags/{ticket_id}/respond", json={"response": "acknowledged"})
    world.post("op1", f"/tc/op/flags/{ticket_id}/respond",
               json={"response": "disputed", "comment": "Sorry - wrong button, it was a light vehicle."})

    recorded = decisions(world.db, ticket_id)
    assert [d.decision for d in recorded] == ["acknowledged", "disputed"]
    flag = world.get("op1", "/tc/op/flags?include_answered=true").json()["flags"][0]
    assert flag["your_response"] == "disputed" and len(flag["responses"]) == 2


def test_an_operator_cannot_answer_a_flag_that_is_not_theirs(world: World) -> None:
    _incident_id, ticket_id = raise_proximity(world.db)
    response = world.post("op3", f"/tc/op/flags/{ticket_id}/respond", json={"response": "acknowledged"})
    assert response.status_code == 404
    assert decisions(world.db, ticket_id) == []


def test_an_unknown_flag_id_is_404(world: World) -> None:
    assert world.post("op1", "/tc/op/flags/tkt_nope/respond",
                      json={"response": "acknowledged"}).status_code == 404


# ---------------------------------------------------------------- the existing critical path
def test_a_critical_incident_notifies_the_supervisor_and_reaches_the_admin_list(world: World) -> None:
    """End to end over HTTP: sensor event in, operator alarmed, supervisor told, incident on the record."""
    now = time.time()
    put(world.db, world.ids["op1"], metres=40.0, ts=now)

    posted = world.post("admin", "/tc/sim/machine-sensor",
                        json={"machine_id": "EX-07", "kind": "rollover_risk", "severity": "critical",
                              "lat": north_of_centre(0.0)[0], "lon": north_of_centre(0.0)[1],
                              "site_id": SITE, "detail": "Sustained tilt beyond the envelope."})
    assert posted.status_code == 200
    incident_id = posted.json()["incident"]["incident_id"]
    assert posted.json()["incident"]["dispatch_status"] == "dispatched"

    # The nearest operator is alarmed; the supervisor and the admin are notified without an alarm.
    operator_alarms = [n for n in notifications(world.db, world.ids["op1"]) if n.alarm]
    assert len(operator_alarms) == 1 and operator_alarms[0].incident_id == incident_id

    supervisor_notes = [n for n in notifications(world.db, world.ids["sup1"])
                        if n.incident_id == incident_id]
    assert len(supervisor_notes) == 1
    assert supervisor_notes[0].severity == "critical" and supervisor_notes[0].alarm is False

    admin_notes = [n for n in notifications(world.db, world.ids["admin"])
                   if n.incident_id == incident_id]
    assert len(admin_notes) == 1

    # And the incident is on the admin's list, with who was notified recorded against it.
    listed = world.get("admin", "/tc/admin/incidents").json()
    row = next(r for r in listed["incidents"] if r["incident_id"] == incident_id)
    assert row["machine_id"] == "EX-07" and row["kind"] == "rollover_risk"
    assert row["acknowledged"] is False and listed["open"] >= 1
    assert world.ids["sup1"] in row["notified_user_ids"]
    assert row["nearest_user"]["user_id"] == world.ids["op1"]
    assert row["ts_gmt"].endswith("Z")
