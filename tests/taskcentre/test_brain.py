"""Unit tests for the Task Centre brain: dispatch, idle suppression, cooldown and fatigue wording.

No HTTP here - the brain takes a ``Session`` and returns rows. The ``world`` fixture supplies the
people, fence and cameras; each test writes the location reports it needs so eligibility is exact.
Thresholds come from the real ``config/taskcentre.yaml`` via :meth:`BrainConfig.load`.
"""
from __future__ import annotations

import time

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.taskcentre_models import (LocationReportRow, NotificationRow, SimEventRow,
                                              TicketRow)
from sentinel.taskcentre import brain
from sentinel.taskcentre.adapters import (SimulatedCameraSource, SimulatedFatigueSource,
                                          SimulatedMachineSensorSource)
from sentinel.taskcentre.brain import BrainConfig

CENTRE_LAT, CENTRE_LON = 1.0, 1.0
METRES_PER_DEGREE = 111_320.0
SITE = "north-quarry"


@pytest.fixture()
def cfg() -> BrainConfig:
    """The shipped configuration, so the tests fail if a threshold is changed without thought."""
    return BrainConfig.load()


def north_of_centre(metres: float) -> tuple[float, float]:
    """A point ``metres`` north of the fixture geofence centre."""
    return CENTRE_LAT + metres / METRES_PER_DEGREE, CENTRE_LON


def put(s: Session, user_id: str, *, metres: float | None, ts: float, accuracy_m: float = 10.0) -> None:
    """Report a position for somebody. ``metres=None`` reports a fix with no coordinates."""
    lat, lon = (None, None) if metres is None else north_of_centre(metres)
    s.add(LocationReportRow(user_id=user_id, ts=ts, lat=lat, lon=lon, accuracy_m=accuracy_m,
                            geofence_status="inside" if metres is not None else "unverified",
                            source="simulated"))
    s.flush()


def sensor(machine_id: str = "EX-07", *, metres: float = 0.0, ts: float, kind: str = "rollover_risk"):
    """A critical sensor event at ``metres`` north of the centre."""
    lat, lon = north_of_centre(metres)
    return SimulatedMachineSensorSource().emit(machine_id=machine_id, kind=kind, lat=lat, lon=lon,
                                               site_id=SITE, ts=ts)


def notifications(s: Session, user_id: str) -> list[NotificationRow]:
    return list(s.execute(select(NotificationRow).where(NotificationRow.user_id == user_id)
                          .order_by(NotificationRow.ts)).scalars().all())


def reason_for(incident, user_id: str) -> str:
    """The recorded reason a candidate was or was not chosen."""
    return next(c["reason"] for c in incident.data["candidates"] if c["user_id"] == user_id)


# ---------------------------------------------------------------- nearest-operator dispatch
def test_nearest_eligible_operator_is_the_one_alarmed(world, cfg: BrainConfig) -> None:
    """The genuinely closest operator is picked - not the first one found, not the machine's owner."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=400.0, ts=now)     # EX-07 is op1's machine, but op2 is closer
        put(s, "u_op2", metres=60.0, ts=now)
        put(s, "u_op3", metres=1500.0, ts=now)

        incident = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)

        assert incident.dispatch_status == "dispatched"
        assert incident.nearest_user_id == "u_op2"
        assert incident.nearest_distance_m == pytest.approx(60.0, rel=0.05)
        assert [c["user_id"] for c in incident.data["candidates"]] == ["u_op2", "u_op1", "u_op3"]
        assert incident.data["eligible"] == 3

        alarms = [n for n in notifications(s, "u_op2") if n.alarm]
        assert len(alarms) == 1 and alarms[0].severity == "critical"
        assert alarms[0].incident_id == incident.incident_id
        # The supervisor and the admin hear about it, but are not alarmed.
        for watcher in ("u_sup1", "u_admin"):
            watcher_notes = notifications(s, watcher)
            assert len(watcher_notes) == 1 and not watcher_notes[0].alarm
            assert "u_op2" in incident.notified_user_ids and watcher in incident.notified_user_ids
        assert notifications(s, "u_op1") == []   # the operators who were not dispatched stay quiet


def test_stale_location_is_not_evidence_of_where_somebody_is(world, cfg: BrainConfig) -> None:
    """A closer but stale position loses to a further, fresh one."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=50.0, ts=now - cfg.nearest_operator.max_age_s - 60.0)
        put(s, "u_op2", metres=800.0, ts=now)

        incident = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)

        assert incident.nearest_user_id == "u_op2"
        assert "min old" in reason_for(incident, "u_op1")


def test_operator_beyond_max_distance_is_not_eligible(world, cfg: BrainConfig) -> None:
    """Being the nearest person on site does not make somebody near enough to dispatch."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=cfg.nearest_operator.max_distance_m + 500.0, ts=now)
        put(s, "u_op2", metres=1200.0, ts=now)

        incident = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)

        assert incident.nearest_user_id == "u_op2"
        assert "limit 2000 m" in reason_for(incident, "u_op1")


def test_a_fix_without_coordinates_cannot_be_used(world, cfg: BrainConfig) -> None:
    """A report that carries no coordinates disqualifies, however recent it is."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=None, ts=now)
        put(s, "u_op2", metres=900.0, ts=now)

        incident = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)

        assert incident.nearest_user_id == "u_op2"
        assert reason_for(incident, "u_op1") == "last report has no coordinates"


def test_unverified_geofence_status_still_counts_for_dispatch(world, cfg: BrainConfig) -> None:
    """A fix too coarse to place somebody inside the fence can still say who is closest."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=80.0, ts=now)
        row = s.execute(select(LocationReportRow).where(LocationReportRow.user_id == "u_op1")).scalar_one()
        row.geofence_status = "unverified"
        s.flush()

        incident = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)

        assert incident.nearest_user_id == "u_op1"


def test_no_eligible_operator_never_invents_one(world, cfg: BrainConfig) -> None:
    """Nobody in range: the incident says so and the supervisors and admins are told, in words."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=0.0, ts=now - 7200.0)                                   # stale
        put(s, "u_op2", metres=cfg.nearest_operator.max_distance_m + 3000.0, ts=now)   # too far
        put(s, "u_op3", metres=None, ts=now)                                           # no coordinates

        incident = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)

        assert incident.dispatch_status == "no_eligible_operator"
        assert incident.nearest_user_id is None and incident.nearest_distance_m is None
        assert incident.data["eligible"] == 0
        for supervisor in ("u_sup1", "u_sup2", "u_admin"):
            rows = notifications(s, supervisor)
            assert len(rows) == 1
            assert "No eligible nearby operator identified" in rows[0].body
            assert not rows[0].alarm
        for operator in ("u_op1", "u_op2", "u_op3"):
            assert notifications(s, operator) == []


def test_an_incident_without_coordinates_admits_it_cannot_rank(world, cfg: BrainConfig) -> None:
    """No machine position means no honest notion of 'nearest', so nobody is dispatched."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=10.0, ts=now)
        event = SimulatedMachineSensorSource().emit(machine_id="EX-07", kind="engine_overheat",
                                                    site_id=SITE, ts=now)

        incident = brain.handle_machine_sensor(s, event, cfg)

        assert incident.dispatch_status == "no_eligible_operator"
        assert "distance cannot be measured" in reason_for(incident, "u_op1")


# ---------------------------------------------------------------- dedupe
def test_repeat_sensor_event_is_deduped_and_nobody_is_re_alarmed(world, cfg: BrainConfig) -> None:
    """A chattering sensor is one incident, not an alert flood."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=50.0, ts=now)

        first = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now), cfg)
        repeat = brain.handle_machine_sensor(
            s, sensor(metres=0.0, ts=now + cfg.incident_dedupe_s - 10.0), cfg)

        assert repeat.incident_id == first.incident_id
        assert len([n for n in notifications(s, "u_op1") if n.alarm]) == 1
        assert len(notifications(s, "u_sup1")) == 1


def test_dedupe_is_per_machine_and_condition(world, cfg: BrainConfig) -> None:
    """A different condition on the same machine is a different incident."""
    now = time.time()
    with world.db.session() as s:
        put(s, "u_op1", metres=50.0, ts=now)

        first = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now, kind="rollover_risk"), cfg)
        other = brain.handle_machine_sensor(s, sensor(metres=0.0, ts=now + 5.0,
                                                      kind="engine_overheat"), cfg)
        later = brain.handle_machine_sensor(
            s, sensor(metres=0.0, ts=now + cfg.incident_dedupe_s + 10.0, kind="rollover_risk"), cfg)

        assert len({first.incident_id, other.incident_id, later.incident_id}) == 3


# ---------------------------------------------------------------- camera idle
def observe(*, idle_seconds: float, context: str = "unknown", ts: float, camera_id: str = "cam-ex07",
            operator_id: str = "u_op1"):
    return SimulatedCameraSource().observe(camera_id=camera_id, operator_id=operator_id,
                                           idle_seconds=idle_seconds, context=context, ts=ts)


@pytest.mark.parametrize("context", ["waiting_for_truck", "machine_paused", "expected_delay"])
def test_an_explained_pause_is_suppressed_not_flagged(world, cfg: BrainConfig, context: str) -> None:
    """Waiting for a haul truck is the job. It is logged with a reason and nobody is disturbed."""
    now = time.time()
    with world.db.session() as s:
        ticket = brain.handle_camera_observation(s, observe(idle_seconds=1800.0, context=context,
                                                            ts=now), cfg)

        assert ticket is None
        assert s.execute(select(TicketRow)).scalars().all() == []
        assert notifications(s, "u_sup1") == [] and notifications(s, "u_op1") == []
        event = s.execute(select(SimEventRow)).scalars().one()
        assert context in event.payload["suppressed_reason"]
        assert event.payload["outcome"] == "suppressed_explained"


def test_a_short_pause_is_below_the_threshold(world, cfg: BrainConfig) -> None:
    """Ordinary short pauses never reach a supervisor."""
    now = time.time()
    with world.db.session() as s:
        assert brain.handle_camera_observation(s, observe(idle_seconds=240.0, ts=now), cfg) is None
        event = s.execute(select(SimEventRow)).scalars().one()
        assert event.payload["outcome"] == "below_threshold"
        assert "below the 15 min threshold" in event.payload["suppressed_reason"]


def test_unexplained_idle_raises_a_productivity_ticket_for_the_supervisor(world,
                                                                          cfg: BrainConfig) -> None:
    """A real flag carries the camera, a clip placeholder, the timeline and plain-language wording."""
    now = time.time()
    with world.db.session() as s:
        ticket = brain.handle_camera_observation(s, observe(idle_seconds=1800.0, ts=now), cfg)

        assert ticket is not None
        assert ticket.kind == "ai_idle" and ticket.status == "open" and ticket.source == "SIMULATED"
        assert ticket.owner_role == "supervisor" and ticket.owner_user_id == "u_sup1"
        assert ticket.subject_user_id == "u_op1"
        assert ticket.severity in ("low", "medium")
        evidence = ticket.evidence
        assert evidence["camera_id"] == "cam-ex07"
        assert evidence["clip_ref"].startswith("placeholder://clip/cam-ex07/")
        assert evidence["clip_available"] is False
        assert [point["note"] for point in evidence["timeline"]]
        assert evidence["explanation"] and evidence["threshold_s"] == cfg.idle.threshold_s
        # A productivity flag is never a safety alert and never alarms anybody.
        assert evidence["is_safety_alert"] is False and evidence["category"] == "productivity"
        supervisor_notes = notifications(s, "u_sup1")
        assert len(supervisor_notes) == 1 and not supervisor_notes[0].alarm
        assert notifications(s, "u_op1") == []   # the operator hears it from a person, not a camera


def test_idle_cooldown_makes_one_long_pause_one_flag(world, cfg: BrainConfig) -> None:
    """The same camera and operator are flagged once per cooldown window, then may be flagged again."""
    now = time.time()
    with world.db.session() as s:
        first = brain.handle_camera_observation(s, observe(idle_seconds=1800.0, ts=now), cfg)
        inside = brain.handle_camera_observation(
            s, observe(idle_seconds=2400.0, ts=now + cfg.idle.cooldown_s - 30.0), cfg)
        other_camera = brain.handle_camera_observation(
            s, observe(idle_seconds=1800.0, ts=now + 60.0, camera_id="cam-ex09"), cfg)
        after = brain.handle_camera_observation(
            s, observe(idle_seconds=1800.0, ts=now + cfg.idle.cooldown_s + 30.0), cfg)

        assert first is not None and inside is None and after is not None
        assert other_camera is not None       # a different camera is a different observation
        assert after.ticket_id != first.ticket_id
        cooldown_event = s.execute(
            select(SimEventRow).where(SimEventRow.ts == now + cfg.idle.cooldown_s - 30.0)
        ).scalars().one()
        assert cooldown_event.payload["outcome"] == "cooldown"
        assert first.ticket_id in cooldown_event.payload["suppressed_reason"]


# ---------------------------------------------------------------- fatigue
def test_fatigue_is_a_prompt_labelled_simulated_not_a_diagnosis(world, cfg: BrainConfig) -> None:
    """The operator is prompted, the supervisor is told, and nothing claims to have detected fatigue."""
    now = time.time()
    with world.db.session() as s:
        indication = SimulatedFatigueSource().indicate(operator_id="u_op1", confidence=0.6, ts=now)

        ticket = brain.handle_fatigue(s, indication, cfg)

        assert ticket.kind == "fatigue" and ticket.source == "SIMULATED"
        assert ticket.owner_user_id == "u_sup1" and ticket.subject_user_id == "u_op1"
        assert "SIMULATED" in ticket.title and "SIMULATED" in ticket.detail
        assert ticket.evidence["is_diagnosis"] is False
        assert "not a diagnosis" in ticket.evidence["explanation"]

        operator_notes = notifications(s, "u_op1")
        assert len(operator_notes) == 1
        assert not operator_notes[0].alarm          # a break prompt is not an emergency
        assert "break" in operator_notes[0].title.lower()
        assert "SIMULATED" in operator_notes[0].body
        assert len(notifications(s, "u_sup1")) == 1


# ---------------------------------------------------------------- configuration
def test_config_matches_the_shipped_yaml(cfg: BrainConfig) -> None:
    """The documented demo thresholds are the ones the brain actually uses."""
    assert cfg.nearest_operator.max_age_s == 600.0
    assert cfg.nearest_operator.max_distance_m == 2000.0
    assert cfg.idle.threshold_s == 900.0 and cfg.idle.cooldown_s == 600.0
    assert cfg.incident_dedupe_s == 300.0 and cfg.session_hours == 12.0
    assert cfg.stale_location_s == 600.0
    assert cfg.public()["version"] == cfg.version
