"""Tests for the admin risk-foresight register: each rule fires from seeded facts, and stays silent.

Two things are being protected here. The first is the logic: every rule must fire from facts that
were actually recorded and must produce nothing when those facts are absent - a register that invents
items is worse than no register. The second is the **wording**: every item has to carry its `basis`,
`source: "RULE"` and a limitation note, and the response has to keep saying it is rules over recorded
facts rather than a prediction. Those assertions are deliberate, not decoration.

`site_foresight` takes a `Session`, so most of this is direct; the HTTP tests cover the admin guard
and the `act` routing.
"""
from __future__ import annotations

import time

from sqlalchemy import select

from sentinel.store.db import Database
from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import (CameraRow, NotificationRow, PunchRow, ReviewDecisionRow,
                                              SimEventRow, TcIncidentRow, TcTaskRow, TicketRow)
from sentinel.taskcentre import foresight
from sentinel.taskcentre.foresight import LIKELIHOODS, site_foresight
from sentinel.taskcentre.service import open_ticket
from tests.taskcentre.conftest import SITE, World, add_task

DAY_S = 86_400.0
HOUR_S = 3600.0


def midday() -> float:
    """Noon GMT today: a fixed instant inside the current UTC day and outside the night window.

    Anchoring the clock matters - the fatigue rule reads punches for *today*, so a test that ran at
    00:30 GMT would otherwise seed a shift that started yesterday.
    """
    return (time.time() // DAY_S) * DAY_S + 12 * HOUR_S


def ids_of(register: dict) -> list[str]:
    return [item["risk_id"] for item in register["items"]]


def item_for(register: dict, risk_id: str) -> dict | None:
    return next((i for i in register["items"] if i["risk_id"] == risk_id), None)


def fresh_frames(db: Database, ts: float) -> None:
    """Give every camera a recent frame, so the protection rule is not what fired."""
    with db.session() as s:
        for camera in s.execute(select(CameraRow)).scalars():
            camera.last_frame_ts = ts


def punch_in(db: Database, user_id: str, ts: float) -> None:
    with db.session() as s:
        s.add(PunchRow(punch_id=f"p_{user_id}_{int(ts)}", user_id=user_id, kind="start_work", ts=ts))


def proximity_incident(db: Database, *, incident_id: str, machine_id: str, ts: float,
                       kind: str = "person_in_zone") -> None:
    with db.session() as s:
        s.add(TcIncidentRow(incident_id=incident_id, site_id=SITE, machine_id=machine_id, kind=kind,
                            severity="critical", ts=ts, detail="Person detected in the swing radius.",
                            source="SIMULATED", dispatch_status="dispatched", notified_user_ids=[],
                            dedupe_key=f"{machine_id}|{kind}"))


def sensor_event(db: Database, *, event_id: str, machine_id: str, ts: float,
                 kind: str = "hydraulic_pressure_loss") -> None:
    with db.session() as s:
        s.add(SimEventRow(event_id=event_id, ts=ts, kind="machine_sensor", source="SIMULATED",
                          machine_id=machine_id, payload={"kind": kind, "machine_id": machine_id}))


# ---------------------------------------------------------------- silence, and the shape of an item
def test_a_site_with_no_recorded_facts_produces_an_empty_register(world: World) -> None:
    """No punches, tasks, tickets, incidents or sensor events - so no rule may invent anything."""
    now = midday()
    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    assert register["items"] == []
    assert register["counts"] == {"total": 0,
                                  "by_likelihood": {level: 0 for level in LIKELIHOODS},
                                  "by_kind": {}}
    assert register["method"] == "deterministic rules over recorded facts"
    assert register["source"] == "RULE"
    assert register["controls_machinery"] is False
    assert register["site_id"] == SITE
    assert register["generated_at_gmt"].endswith("Z")
    # Every rule ran and reported that it found nothing; silence is recorded, not implied.
    assert len(register["rules"]) == 7
    assert all(rule["fired"] == 0 for rule in register["rules"])


def test_every_item_carries_its_basis_source_and_limitation(world: World, db: Database) -> None:
    """The honesty contract, asserted on whatever fires: facts in, provenance and caveats out."""
    now = midday()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 120.0)
    proximity_incident(db, incident_id="inc_p2", machine_id="EX-07", ts=now - 60.0)
    add_task(db, task_id="t_late", operator_id=world.ids["op2"], supervisor_id=world.ids["sup1"],
             status="ongoing", start_ts=now - 4 * HOUR_S, expected_finish_ts=now - 600.0)
    sensor_event(db, event_id="sev_1", machine_id="EX-09", ts=now - HOUR_S)
    sensor_event(db, event_id="sev_2", machine_id="EX-09", ts=now - 600.0)

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    assert register["items"], "expected the seeded facts to fire at least one rule"
    assert register["caveats"] and all(isinstance(c, str) for c in register["caveats"])
    assert any("not a trained" in c for c in register["caveats"])
    assert "not a prediction" in register["note"]
    for item in register["items"]:
        assert item["source"] == "RULE"
        assert item["likelihood"] in LIKELIHOODS
        assert item["basis"], f"{item['risk_id']} fired with no facts behind it"
        for fact in item["basis"]:
            assert set(fact) >= {"fact", "value", "observed_at", "observed_at_gmt"}
        assert "not a forecast" in item["note"]
        assert "no probability" in item["confidence"]
        assert item["what_could_happen"] and item["recommended_actions"]
        for action in item["recommended_actions"]:
            assert action["owner_role"] in ("admin", "supervisor", "operator")
            assert action["endpoint_hint"] == f"POST /tc/admin/foresight/{item['risk_id']}/act"


def test_items_are_ranked_by_likelihood_then_recency(world: World, db: Database) -> None:
    """Strongest band first; inside a band, the most recently observed facts come first."""
    now = midday()
    fresh_frames(db, now)
    for n in range(3):                                   # 3 proximity events -> high
        proximity_incident(db, incident_id=f"inc_h{n}", machine_id="EX-07", ts=now - 60.0 * (n + 1))
    for n in range(3):                                   # a moderate backlog for one supervisor
        with db.session() as s:
            open_ticket(s, site_id=SITE, kind="ai_idle", title=f"Flag {n}", severity="low",
                        owner_role="supervisor", owner_user_id=world.ids["sup1"])

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    order = [item["likelihood"] for item in register["items"]]
    ranks = [LIKELIHOODS.index(level) for level in order]
    assert ranks == sorted(ranks, reverse=True)
    assert register["items"][0]["risk_id"] == "repeated_proximity.EX-07"


# ---------------------------------------------------------------- rule 1: operator fatigue risk
def test_fatigue_rule_fires_when_a_task_runs_through_a_high_schedule_risk(world: World,
                                                                         db: Database) -> None:
    """3 h of continuous work with a task under way: the supervisor is told to schedule a break."""
    now = midday()
    fresh_frames(db, now)
    punch_in(db, world.ids["op1"], now - 3 * HOUR_S)
    add_task(db, task_id="t_ongoing", operator_id=world.ids["op1"], supervisor_id=world.ids["sup1"],
             status="ongoing", start_ts=now - 3 * HOUR_S, expected_finish_ts=now + 4 * HOUR_S)

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    item = item_for(register, f"operator_fatigue_risk.{world.ids['op1']}")
    assert item is not None
    assert item["likelihood"] == "high"
    assert item["affected"]["operators"][0]["user_id"] == world.ids["op1"]
    assert "Reaction time may be reduced" in item["what_could_happen"]
    assert "schedule_break_now" in [a["action"] for a in item["recommended_actions"]]
    assert item["notify_user_ids"] == [world.ids["sup1"]]
    # The factors that scored are the facts on the record, and the note refuses the fatigue claim.
    assert any("Continuous work without a punched break" in f["fact"] for f in item["basis"])
    assert "not them" in item["note"] and "diagnoses fatigue" in item["note"]


def test_fatigue_rule_is_silent_without_a_task_under_way(world: World, db: Database) -> None:
    """The same shift with no task running is not a foresight item - it is just a long shift."""
    now = midday()
    fresh_frames(db, now)
    punch_in(db, world.ids["op1"], now - 3 * HOUR_S)

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    assert f"operator_fatigue_risk.{world.ids['op1']}" not in ids_of(register)


# ---------------------------------------------------------------- rule 2: repeated proximity events
def test_proximity_rule_fires_on_repeated_events_and_escalates(world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 120.0)
    proximity_incident(db, incident_id="inc_p2", machine_id="EX-07", ts=now - 60.0)

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)
    item = item_for(register, "repeated_proximity.EX-07")
    assert item is not None and item["likelihood"] == "elevated"
    assert "Struck-by risk in the loading zone" in item["what_could_happen"]
    assert [a["action"] for a in item["recommended_actions"]] == ["post_spotter", "set_exclusion_zone",
                                                                 "stop_loading"]
    assert item["affected"]["machines"] == ["EX-07"]
    assert item["affected"]["operators"][0]["user_id"] == world.ids["op1"]   # EX-07 is op1's machine
    assert sum(1 for f in item["basis"] if "Proximity event recorded" in f["fact"]) == 2

    proximity_incident(db, incident_id="inc_p3", machine_id="EX-07", ts=now - 30.0)
    with world.db.session() as s:
        assert item_for(site_foresight(s, SITE, now=now), "repeated_proximity.EX-07")["likelihood"] == "high"


def test_proximity_rule_is_silent_below_the_threshold_and_outside_the_window(world: World,
                                                                            db: Database) -> None:
    """One event is not a pattern, and an event from yesterday is not evidence about this shift."""
    now = midday()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 60.0)
    proximity_incident(db, incident_id="inc_old", machine_id="EX-07", ts=now - 5 * HOUR_S)

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    assert "repeated_proximity.EX-07" not in ids_of(register)


# ---------------------------------------------------------------- rule 3: degraded protection
def test_protection_rule_fires_on_a_stale_heartbeat_while_the_machine_is_worked(world: World,
                                                                               db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    with db.session() as s:
        s.get(CameraRow, "cam-ex07").last_frame_ts = now - 2 * HOUR_S
    add_task(db, task_id="t_ex07", operator_id=world.ids["op1"], supervisor_id=world.ids["sup1"],
             status="ongoing", start_ts=now - HOUR_S, expected_finish_ts=now + 4 * HOUR_S)
    with db.session() as s:
        s.get(TcTaskRow, "t_ex07").machine_id = "EX-07"

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    item = item_for(register, "protection_degraded.EX-07")
    assert item is not None and item["likelihood"] == "elevated"
    assert "Safety advisories are not running" in item["what_could_happen"]
    assert any("Newest safety-camera frame" in f["fact"] for f in item["basis"])
    assert any("Task under way on this machine" in f["fact"] for f in item["basis"])
    assert "not the same as the machine being unsafe" in item["note"]


def test_protection_rule_reads_high_when_the_recorded_state_is_degraded(world: World,
                                                                       db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    punch_in(db, world.ids["op1"], now - HOUR_S)
    with db.session() as s:
        s.add(MachineRow(machine_id="EX-07", model="Cat 320 (simulated)", machine_type="EX-20t",
                         site_id=SITE, meta={"protection_state": "degraded"}))

    with world.db.session() as s:
        item = item_for(site_foresight(s, SITE, now=now), "protection_degraded.EX-07")

    assert item is not None and item["likelihood"] == "high"
    assert any(f["value"] == "degraded" for f in item["basis"])


def test_protection_rule_is_silent_when_nothing_is_being_worked(world: World, db: Database) -> None:
    """A stale camera on an idle machine is a camera problem, not a live safety risk."""
    now = midday()
    with db.session() as s:
        s.get(CameraRow, "cam-ex07").last_frame_ts = now - 4 * HOUR_S
        s.add(MachineRow(machine_id="EX-07", model="Cat 320 (simulated)", machine_type="EX-20t",
                         site_id=SITE, meta={"protection_state": "degraded"}))

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    assert "protection_degraded.EX-07" not in ids_of(register)


# ---------------------------------------------------------------- rule 4: unacknowledged incident
def test_unacknowledged_incident_rule_fires_and_escalates(world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    with db.session() as s:
        s.add(TcIncidentRow(incident_id="inc_crit", site_id=SITE, machine_id="EX-09",
                            kind="rollover_risk", severity="critical", ts=now - 600.0,
                            detail="Sustained tilt beyond the stability envelope.", source="SIMULATED",
                            dispatch_status="dispatched", notified_user_ids=[world.ids["op3"]],
                            dedupe_key="EX-09|rollover_risk"))

    with world.db.session() as s:
        item = item_for(site_foresight(s, SITE, now=now), "unacknowledged_incident.inc_crit")
    assert item is not None and item["likelihood"] == "elevated"
    assert "Nobody has taken the critical alert" in item["what_could_happen"]
    assert item["incident_id"] == "inc_crit"
    assert any(f["fact"] == "Acknowledgement recorded" and f["value"] == "none" for f in item["basis"])
    assert "may already be attending" in item["note"]

    with world.db.session() as s:
        older = site_foresight(s, SITE, now=now + 600.0)
    assert item_for(older, "unacknowledged_incident.inc_crit")["likelihood"] == "high"


def test_unacknowledged_incident_rule_is_silent_before_the_threshold_and_once_acknowledged(
        world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    with db.session() as s:
        s.add(TcIncidentRow(incident_id="inc_fresh", site_id=SITE, machine_id="EX-09",
                            kind="rollover_risk", severity="critical", ts=now - 30.0, detail="",
                            source="SIMULATED", dispatch_status="dispatched", notified_user_ids=[],
                            dedupe_key="EX-09|rollover_risk"))

    with world.db.session() as s:
        assert "unacknowledged_incident.inc_fresh" not in ids_of(site_foresight(s, SITE, now=now))

    with db.session() as s:
        row = s.get(TcIncidentRow, "inc_fresh")
        row.acknowledged_by, row.acknowledged_at = world.ids["op3"], now
    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now + 2 * HOUR_S)
    assert "unacknowledged_incident.inc_fresh" not in ids_of(register)


# ---------------------------------------------------------------- rule 5: review backlog
def test_review_backlog_rule_fires_per_supervisor(world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    with db.session() as s:
        for n in range(3):
            open_ticket(s, site_id=SITE, kind="ai_idle", title=f"Idle flag {n}", severity="low",
                        owner_role="supervisor", owner_user_id=world.ids["sup1"])
        open_ticket(s, site_id=SITE, kind="ai_idle", title="Only one", severity="low",
                    owner_role="supervisor", owner_user_id=world.ids["sup2"])

    with world.db.session() as s:
        register = site_foresight(s, SITE, now=now)

    item = item_for(register, f"review_backlog.{world.ids['sup1']}")
    assert item is not None and item["likelihood"] == "moderate"
    assert "Issues may be missed" in item["what_could_happen"]
    assert item["notify_user_ids"] == [world.ids["sup1"]]
    assert sum(1 for f in item["basis"] if "Open flag awaiting review" in f["fact"]) == 3
    assert f"review_backlog.{world.ids['sup2']}" not in ids_of(register)   # one flag is not a backlog


def test_review_backlog_rule_ignores_flags_that_were_reviewed(world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    with db.session() as s:
        for n in range(3):
            ticket = open_ticket(s, site_id=SITE, kind="ai_idle", title=f"Idle flag {n}", severity="low",
                                 owner_role="supervisor", owner_user_id=world.ids["sup1"])
            ticket.status = "dismissed"

    with world.db.session() as s:
        assert f"review_backlog.{world.ids['sup1']}" not in ids_of(site_foresight(s, SITE, now=now))


# ---------------------------------------------------------------- rule 6: tasks vs expected finish
def test_task_rule_fires_for_overdue_and_at_risk_work(world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    add_task(db, task_id="t_over", operator_id=world.ids["op2"], supervisor_id=world.ids["sup1"],
             status="ongoing", start_ts=now - 4 * HOUR_S, expected_finish_ts=now - 900.0)
    add_task(db, task_id="t_soon", operator_id=world.ids["op2"], supervisor_id=world.ids["sup1"],
             status="pending", start_ts=now, expected_finish_ts=now + 600.0)

    with world.db.session() as s:
        item = item_for(site_foresight(s, SITE, now=now), f"task_schedule.{world.ids['op2']}")

    assert item is not None and item["likelihood"] == "elevated"      # at least one is overdue
    assert "Work will not finish this shift" in item["what_could_happen"]
    assert len([f for f in item["basis"] if "against its expected finish" in f["fact"]]) == 2
    assert "replan_work" in [a["action"] for a in item["recommended_actions"]]


def test_task_rule_is_silent_for_work_that_is_still_on_time(world: World, db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    add_task(db, task_id="t_fine", operator_id=world.ids["op2"], supervisor_id=world.ids["sup1"],
             status="ongoing", start_ts=now - HOUR_S, expected_finish_ts=now + 6 * HOUR_S)

    with world.db.session() as s:
        assert f"task_schedule.{world.ids['op2']}" not in ids_of(site_foresight(s, SITE, now=now))


# ---------------------------------------------------------------- rule 7: machine health
def test_machine_health_rule_fires_on_repeated_sensor_events_and_fault_codes(world: World,
                                                                            db: Database) -> None:
    now = midday()
    fresh_frames(db, now)
    sensor_event(db, event_id="sev_1", machine_id="EX-09", ts=now - 2 * HOUR_S)
    sensor_event(db, event_id="sev_2", machine_id="EX-09", ts=now - HOUR_S)

    with world.db.session() as s:
        item = item_for(site_foresight(s, SITE, now=now), "machine_health.EX-09")
    assert item is not None and item["likelihood"] == "moderate"
    assert "Unplanned downtime is likely" in item["what_could_happen"]
    assert "raise_maintenance" in [a["action"] for a in item["recommended_actions"]]
    assert "does not diagnose the machine" in item["note"]

    with db.session() as s:
        s.add(MachineRow(machine_id="EX-09", model="Cat 320 (simulated)", machine_type="EX-20t",
                         site_id=SITE, meta={"fault_codes": ["E-1234"]}))
    with world.db.session() as s:
        item = item_for(site_foresight(s, SITE, now=now), "machine_health.EX-09")
    assert item["likelihood"] == "elevated"
    assert any(f["value"] == "E-1234" for f in item["basis"])


def test_machine_health_rule_ignores_proximity_events_and_a_single_report(world: World,
                                                                         db: Database) -> None:
    """Proximity belongs to the struck-by rule; one fault report is not a downtime pattern."""
    now = midday()
    fresh_frames(db, now)
    sensor_event(db, event_id="sev_1", machine_id="EX-09", ts=now - HOUR_S)
    sensor_event(db, event_id="sev_p1", machine_id="EX-09", ts=now - 600.0, kind="person_in_zone")
    sensor_event(db, event_id="sev_p2", machine_id="EX-09", ts=now - 300.0, kind="person_in_zone")

    with world.db.session() as s:
        assert "machine_health.EX-09" not in ids_of(site_foresight(s, SITE, now=now))


# ---------------------------------------------------------------- the API
def test_foresight_endpoint_is_admin_only(world: World) -> None:
    assert world.get("admin", "/tc/admin/foresight").status_code == 200
    assert world.get("sup1", "/tc/admin/foresight").status_code == 403
    assert world.get("op1", "/tc/admin/foresight").status_code == 403


def test_foresight_endpoint_returns_the_register_with_its_caveats(world: World, db: Database) -> None:
    now = time.time()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 120.0)
    proximity_incident(db, incident_id="inc_p2", machine_id="EX-07", ts=now - 60.0)

    body = world.get("admin", "/tc/admin/foresight").json()

    assert body["site_id"] == SITE
    assert body["method"] == "deterministic rules over recorded facts"
    assert body["caveats"] and "not a prediction" in body["note"]
    assert "repeated_proximity.EX-07" in [i["risk_id"] for i in body["items"]]


def test_act_notifies_records_and_never_touches_the_recorded_facts(world: World, db: Database) -> None:
    """Routing a suggestion opens a ticket, appends a decision and tells the supervisor - nothing else."""
    now = time.time()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 120.0)
    proximity_incident(db, incident_id="inc_p2", machine_id="EX-07", ts=now - 60.0)
    with world.db.session() as s:
        before = {i.incident_id: (i.kind, i.ts, i.detail, i.severity, i.acknowledged_at,
                                  i.dispatch_status)
                  for i in s.execute(select(TcIncidentRow)).scalars()}

    response = world.post("admin", "/tc/admin/foresight/repeated_proximity.EX-07/act",
                          json={"action": "post_spotter", "comment": "Spotter briefed at the gate."})
    assert response.status_code == 200
    body = response.json()

    assert body["ok"] is True and body["controls_machinery"] is False
    assert body["ticket_created"] is True
    assert body["ticket"]["kind"] == "foresight_repeated_proximity"
    assert body["ticket"]["source"] == "RULE"
    assert body["decision"]["decision"] == "acted"
    assert body["notified_user_ids"] == [world.ids["sup1"]]
    assert "not a prediction" in body["note"]

    with world.db.session() as s:
        after = {i.incident_id: (i.kind, i.ts, i.detail, i.severity, i.acknowledged_at,
                                 i.dispatch_status)
                 for i in s.execute(select(TcIncidentRow)).scalars()}
        assert after == before                         # the facts the item was built from are untouched

        ticket = s.get(TicketRow, body["ticket"]["ticket_id"])
        assert ticket.evidence["risk_id"] == "repeated_proximity.EX-07"
        assert ticket.evidence["basis"] and ticket.evidence["controls_machinery"] is False

        decisions = list(s.execute(select(ReviewDecisionRow)
                                   .where(ReviewDecisionRow.ticket_id == ticket.ticket_id)).scalars())
        assert len(decisions) == 1
        assert decisions[0].reviewer_role == "admin"
        assert decisions[0].comment == "Spotter briefed at the gate."
        assert decisions[0].data["action"] == "post_spotter"

        notes = list(s.execute(select(NotificationRow)
                               .where(NotificationRow.user_id == world.ids["sup1"])).scalars())
        assert len(notes) == 1 and notes[0].kind == "foresight"
        assert notes[0].ticket_id == ticket.ticket_id
        assert "Post a spotter" in notes[0].title


def test_act_rejects_an_unknown_risk_or_an_action_the_rule_did_not_recommend(world: World,
                                                                            db: Database) -> None:
    now = time.time()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 120.0)
    proximity_incident(db, incident_id="inc_p2", machine_id="EX-07", ts=now - 60.0)

    missing = world.post("admin", "/tc/admin/foresight/repeated_proximity.EX-99/act",
                         json={"action": "post_spotter"})
    assert missing.status_code == 404

    wrong = world.post("admin", "/tc/admin/foresight/repeated_proximity.EX-07/act",
                       json={"action": "stop_the_machine"})
    assert wrong.status_code == 400
    assert "not recommended" in wrong.json()["detail"]


def test_act_is_admin_only(world: World, db: Database) -> None:
    now = time.time()
    fresh_frames(db, now)
    proximity_incident(db, incident_id="inc_p1", machine_id="EX-07", ts=now - 120.0)
    proximity_incident(db, incident_id="inc_p2", machine_id="EX-07", ts=now - 60.0)

    for who in ("sup1", "op1"):
        response = world.post(who, "/tc/admin/foresight/repeated_proximity.EX-07/act",
                              json={"action": "post_spotter"})
        assert response.status_code == 403


def test_thresholds_come_from_the_config_file(world: World) -> None:
    """The register echoes the thresholds it measured against, so a flag can always be checked."""
    with world.db.session() as s:
        register = site_foresight(s, SITE)
    assert register["thresholds"]["proximity"] == foresight.config()["proximity"]
    assert register["thresholds"]["unacknowledged_incident"]["after_s"] > 0
