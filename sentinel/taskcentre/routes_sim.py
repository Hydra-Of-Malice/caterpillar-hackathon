"""Simulated-detector ingest and the demo scenario panel (``/tc/sim``).

Two things live here:

* **Ingest** - ``POST /machine-sensor``, ``/camera-observation``, ``/fatigue`` take one typed event
  from :mod:`sentinel.taskcentre.adapters`, persist it as a ``tc_sim_event`` row and hand it to
  :mod:`sentinel.taskcentre.brain`. This is the seam a real detector posts to: same payload, same
  route, different ``source``.
* **Scenarios** - ``GET /scenarios`` and ``POST /scenario/{name}`` stage a worksite situation and run
  it end to end, returning what happened plus the ids created so the demo panel can link straight
  into the admin, supervisor and operator screens.

**Permissions:** every ``POST`` here requires **admin or supervisor** - firing a simulated critical
incident alarms a real person's screen, so an operator may not trigger one. ``GET /scenarios`` is
readable by any signed-in user so the panel can render before a role is chosen.

**Repeatability:** a scenario may be run as many times as the demo needs. Where a brain rule would
otherwise swallow the second run (incident dedupe, idle cooldown) the scenario *retires its own
previous artefact* first, by stamping ``dedupe_retired_at`` / ``cooldown_retired_at`` on the row it
created. Nothing is deleted, no timestamp is rewritten, and no production path sets those keys.
"""
from __future__ import annotations

import time
from math import cos, radians
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import (CameraRow, PunchRow, SimEventRow, TcIncidentRow, TcTaskRow,
                                              TicketRow, UserRow)
from sentinel.taskcentre import brain
from sentinel.taskcentre.adapters import (CameraObservation, FatigueIndication, MachineSensorEvent,
                                          SimulatedCameraSource, SimulatedFatigueSource,
                                          SimulatedMachineSensorSource, record_sim_event)
from sentinel.taskcentre.auth import current_user, require_roles
from sentinel.taskcentre.brain import BrainConfig
from sentinel.taskcentre.geo import classify
from sentinel.taskcentre.service import active_geofence, gmt_iso, notify, open_ticket, record_location

router = APIRouter(prefix="/tc/sim", tags=["task-centre-sim"])

#: Anyone who may fire a simulated event or scenario.
TRIGGER_ROLES = ("admin", "supervisor")

#: Ticket kinds the scenarios raise directly (the real paths live in routes_auth / routes_operator).
KIND_GEOFENCE_PUNCH = "geofence_punch"
KIND_TASK_OVERRUN = "task_overrun"

_METRES_PER_DEGREE = 111_320.0
_SEED_HINT = "run `.venv\\Scripts\\python.exe -m sentinel.taskcentre.seed` first"


# ---------------------------------------------------------------- serialisers
def _incident_public(row: TcIncidentRow) -> dict[str, Any]:
    """An incident for the demo panel, including why each operator was or was not chosen."""
    return {"incident_id": row.incident_id, "site_id": row.site_id, "machine_id": row.machine_id,
            "kind": row.kind, "severity": row.severity, "ts": row.ts, "ts_gmt": gmt_iso(row.ts),
            "lat": row.lat, "lon": row.lon, "detail": row.detail, "source": row.source,
            "nearest_user_id": row.nearest_user_id,
            "nearest_distance_m": (None if row.nearest_distance_m is None
                                   else round(row.nearest_distance_m, 1)),
            "dispatch_status": row.dispatch_status, "notified_user_ids": list(row.notified_user_ids or []),
            "candidates": (row.data or {}).get("candidates", []), "data": row.data or {}}


def _ticket_public(row: TicketRow | None) -> dict[str, Any] | None:
    """A ticket for the demo panel (evidence included - the point is that it is inspectable)."""
    if row is None:
        return None
    return {"ticket_id": row.ticket_id, "site_id": row.site_id, "kind": row.kind,
            "severity": row.severity, "status": row.status, "subject_user_id": row.subject_user_id,
            "owner_role": row.owner_role, "owner_user_id": row.owner_user_id, "title": row.title,
            "detail": row.detail, "source": row.source, "evidence": row.evidence or {},
            "created_at": row.created_at, "created_at_gmt": gmt_iso(row.created_at),
            "task_id": row.task_id, "machine_id": row.machine_id, "incident_id": row.incident_id}


def _sim_event_public(row: SimEventRow) -> dict[str, Any]:
    """The raw observation row, so a reviewer can always see what the decision was made from."""
    return {"event_id": row.event_id, "ts": row.ts, "ts_gmt": gmt_iso(row.ts), "kind": row.kind,
            "source": row.source, "payload": row.payload or {},
            "produced_ticket_id": row.produced_ticket_id,
            "produced_incident_id": row.produced_incident_id,
            "outcome": (row.payload or {}).get("outcome"),
            "suppressed_reason": (row.payload or {}).get("suppressed_reason")}


# ---------------------------------------------------------------- ingest
@router.post("/machine-sensor")
def post_machine_sensor(event: MachineSensorEvent, s: Session = Depends(get_session),
                        _actor: UserRow = Depends(require_roles(*TRIGGER_ROLES))) -> dict[str, Any]:
    """Ingest a machine sensor event: record it, raise the incident, dispatch the nearest operator.

    A repeat of a live incident (same machine + condition inside ``incident_dedupe_s``) returns that
    incident with ``deduped: true`` and alarms nobody again.
    """
    sim_event = record_sim_event(s, event)
    incident = brain.handle_machine_sensor(s, event, BrainConfig.load(), sim_event=sim_event)
    return {"sim_event": _sim_event_public(sim_event), "incident": _incident_public(incident),
            "deduped": (sim_event.payload or {}).get("outcome") == "deduped"}


@router.post("/camera-observation")
def post_camera_observation(obs: CameraObservation, s: Session = Depends(get_session),
                            _actor: UserRow = Depends(require_roles(*TRIGGER_ROLES))) -> dict[str, Any]:
    """Ingest a camera observation. Most are suppressed; ``ticket`` is null unless one was flagged."""
    sim_event = record_sim_event(s, obs)
    ticket = brain.handle_camera_observation(s, obs, BrainConfig.load(), sim_event=sim_event)
    payload = sim_event.payload or {}
    return {"sim_event": _sim_event_public(sim_event), "ticket": _ticket_public(ticket),
            "flagged": ticket is not None, "outcome": payload.get("outcome"),
            "suppressed_reason": payload.get("suppressed_reason")}


@router.post("/fatigue")
def post_fatigue(ind: FatigueIndication, s: Session = Depends(get_session),
                 _actor: UserRow = Depends(require_roles(*TRIGGER_ROLES))) -> dict[str, Any]:
    """Ingest a fatigue indication: break prompt for the person, ticket for their supervisor."""
    sim_event = record_sim_event(s, ind)
    ticket = brain.handle_fatigue(s, ind, BrainConfig.load(), sim_event=sim_event)
    return {"sim_event": _sim_event_public(sim_event), "ticket": _ticket_public(ticket)}


# ---------------------------------------------------------------- scenario catalogue
SCENARIOS: tuple[dict[str, str], ...] = (
    {"id": "critical_incident",
     "title": "Critical machine incident, operator dispatched",
     "description": "A machine reports a critical condition. Operators are placed at known distances "
                    "and the nearest one with a recent position is alarmed.",
     "demonstrates": "Nearest-eligible-operator dispatch: the genuinely closest operator is alarmed, "
                     "their supervisor and the admins are notified, and the incident records why each "
                     "candidate was or was not chosen."},
    {"id": "critical_incident_no_operator",
     "title": "Critical incident with nobody eligible",
     "description": "The same critical condition, but on a machine far outside the worksite, so no "
                    "operator has a recent position within range.",
     "demonstrates": "The system says 'No eligible nearby operator identified' and alerts the "
                     "supervisors and admins instead of inventing a name."},
    {"id": "waiting_for_truck",
     "title": "Idle time with a reason - suppressed",
     "description": "A camera reports a long pause, with the context that the haul truck has not "
                    "arrived.",
     "demonstrates": "An explained pause is logged with a suppression reason and raises no ticket. "
                     "Waiting for a truck is the job, not idling."},
    {"id": "true_idle",
     "title": "Unexplained idle time - flagged for review",
     "description": "A camera reports a long pause with no context explaining it.",
     "demonstrates": "An ai_idle ticket for the supervisor with the camera id, a clip placeholder, "
                     "the observation timeline and plain-language wording. A productivity flag, "
                     "never a safety alert."},
    {"id": "false_idle",
     "title": "Short pause - not flagged",
     "description": "A camera reports a few minutes of stillness with no context.",
     "demonstrates": "Ordinary short pauses stay below the threshold and never reach a supervisor, "
                     "so the flags that do arrive are worth reading."},
    {"id": "fatigue",
     "title": "Fatigue indication (SIMULATED)",
     "description": "A simulated alertness source raises an indication for an operator.",
     "demonstrates": "A break prompt for the operator and a ticket for the supervisor, both worded as "
                     "an indication and labelled SIMULATED - never a diagnosis."},
    {"id": "outside_geofence_punch",
     "title": "Start-work punch outside the geofence",
     "description": "An operator punches in from well outside the site boundary with a good GPS fix.",
     "demonstrates": "The punch is recorded with the server timestamp and the distance, and a ticket "
                     "goes to their supervisor. Location is an indication of presence, never proof - "
                     "a poor fix would read 'unverified', never 'outside'."},
    {"id": "task_overrun",
     "title": "Task running past its expected finish",
     "description": "A demo task is staged with an expected finish time already in the past.",
     "demonstrates": "An overrun ticket for the supervisor with the planned and actual times, so the "
                     "conversation starts from facts rather than an accusation."},
)

_BY_ID = {sc["id"]: sc for sc in SCENARIOS}


@router.get("/scenarios")
def get_scenarios(_actor: UserRow = Depends(current_user)) -> dict[str, Any]:
    """The demo catalogue: what each scenario sets up and what it is meant to show."""
    cfg = BrainConfig.load()
    return {"scenarios": [dict(sc) for sc in SCENARIOS], "config": cfg.public(),
            "trigger_roles": list(TRIGGER_ROLES), "source": brain.SIMULATED,
            "note": ("Every scenario writes SIMULATED rows into the live demo database and may be run "
                     "repeatedly. Nothing here is real detection.")}


# ---------------------------------------------------------------- scenario plumbing
def _offset(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """A point ``north_m``/``east_m`` from (lat, lon). Flat-earth approximation; fine over a worksite."""
    d_lat = north_m / _METRES_PER_DEGREE
    d_lon = east_m / (_METRES_PER_DEGREE * max(0.01, cos(radians(lat))))
    return lat + d_lat, lon + d_lon


def _operators(s: Session, actor: UserRow) -> list[UserRow]:
    """The operators a scenario may stage, in a stable order so it picks the same people each run.

    An admin may use anybody at the site; a supervisor is limited to their own team, so a demo never
    files a ticket against somebody else's operator. (The brain still considers *every* operator when
    it looks for the nearest one - in an emergency the closest person is the closest person.)
    """
    stmt = select(UserRow).where(UserRow.role == "operator", UserRow.active.is_(True),
                                 UserRow.site_id == actor.site_id).order_by(UserRow.username)
    rows = list(s.execute(stmt).scalars().all())
    if actor.role == "supervisor":
        rows = [u for u in rows if u.supervisor_id == actor.user_id]
        if not rows:
            raise HTTPException(409, "you have no active operators to run a scenario against")
    if not rows:
        raise HTTPException(409, f"no active operators at site {actor.site_id!r}; {_SEED_HINT}")
    return rows


def _fence(s: Session, site_id: str):
    """The site's active geofence, which every scenario uses as its origin."""
    fence = active_geofence(s, site_id)
    if fence is None:
        raise HTTPException(409, f"site {site_id!r} has no active geofence; {_SEED_HINT}")
    return fence


def _demo_machine(s: Session, site_id: str, operator: UserRow) -> str:
    """A machine id for the scenario: the operator's, else any camera's, else the configured default."""
    if operator.machine_id:
        return operator.machine_id
    camera = s.execute(select(CameraRow).where(CameraRow.site_id == site_id,
                                               CameraRow.machine_id.is_not(None))
                       .order_by(CameraRow.camera_id)).scalars().first()
    return camera.machine_id if camera is not None else "EX-07"


def _demo_camera(s: Session, site_id: str, operator: UserRow) -> str:
    """A camera watching this operator's machine, else any camera at the site, else a placeholder id."""
    stmt = select(CameraRow).where(CameraRow.site_id == site_id).order_by(CameraRow.camera_id)
    cameras = list(s.execute(stmt).scalars().all())
    for camera in cameras:
        if operator.machine_id and camera.machine_id == operator.machine_id:
            return camera.camera_id
    return cameras[0].camera_id if cameras else "CAM-DEMO-1"


def _stage_position(s: Session, user: UserRow, fence, *, north_m: float, east_m: float, now: float,
                    accuracy_m: float = 12.0) -> tuple[float, float]:
    """Report a position for somebody, classified against the fence exactly as a real report is."""
    lat, lon = _offset(fence.center_lat, fence.center_lon, north_m, east_m)
    status, _distance = classify(lat, lon, accuracy_m, fence)
    record_location(s, user.user_id, ts=now, lat=lat, lon=lon, accuracy_m=accuracy_m,
                    geofence_status=status, source="simulated")
    return lat, lon


def _retire_incident_dedupe(s: Session, key: str, now: float, cfg: BrainConfig) -> int:
    """Let this scenario run again: mark its own live incident as retired for dedupe purposes.

    The row is kept exactly as it was recorded - only a demo flag is added to ``data``.
    """
    stmt = select(TcIncidentRow).where(TcIncidentRow.dedupe_key == key,
                                       TcIncidentRow.ts >= now - cfg.incident_dedupe_s)
    retired = 0
    for row in s.execute(stmt).scalars().all():
        data = dict(row.data or {})
        if not data.get("dedupe_retired_at"):
            data["dedupe_retired_at"] = now
            data["dedupe_retired_note"] = "demo scenario re-run; the original incident is unchanged"
            row.data = data
            retired += 1
    s.flush()
    return retired


def _retire_idle_cooldown(s: Session, camera_id: str, operator_id: str, now: float,
                          cfg: BrainConfig) -> int:
    """Let the idle scenario run again: retire the cooldown on its own previous flag (see above)."""
    stmt = select(TicketRow).where(TicketRow.kind == brain.KIND_IDLE,
                                   TicketRow.subject_user_id == operator_id,
                                   TicketRow.created_at >= now - cfg.idle.cooldown_s)
    retired = 0
    for row in s.execute(stmt).scalars().all():
        evidence = dict(row.evidence or {})
        if evidence.get("camera_id") == camera_id and not evidence.get("cooldown_retired_at"):
            evidence["cooldown_retired_at"] = now
            evidence["cooldown_retired_note"] = "demo scenario re-run; the original flag is unchanged"
            row.evidence = evidence
            retired += 1
    s.flush()
    return retired


def _result(name: str, *, summary: str, ids: dict[str, Any], detail: dict[str, Any],
            links: list[dict[str, str]], now: float) -> dict[str, Any]:
    """The shape every scenario returns, so the demo panel can render any of them the same way."""
    meta = _BY_ID[name]
    return {"scenario": name, "title": meta["title"], "description": meta["description"],
            "demonstrates": meta["demonstrates"], "summary": summary, "ids": ids, "detail": detail,
            "links": links, "ran_at": now, "ran_at_gmt": gmt_iso(now), "source": brain.SIMULATED}


# ---------------------------------------------------------------- scenarios
def _scenario_critical_incident(s: Session, actor: UserRow, cfg: BrainConfig, now: float,
                                *, far: bool) -> dict[str, Any]:
    """Shared body of the two incident scenarios; ``far`` puts the machine out of everybody's reach."""
    name = "critical_incident_no_operator" if far else "critical_incident"
    fence = _fence(s, actor.site_id)
    operators = _operators(s, actor)

    # Stage the crew: the first operator close to the machine, the rest progressively further out,
    # spaced so several stay eligible - the incident then shows a real ranking, not a single choice.
    staged = []
    for index, operator in enumerate(operators):
        north = 120.0 + index * 900.0
        lat, lon = _stage_position(s, operator, fence, north_m=north, east_m=0.0, now=now)
        staged.append({"user_id": operator.user_id, "name": operator.name, "lat": lat, "lon": lon,
                       "north_of_centre_m": north})

    machine_id = _demo_machine(s, actor.site_id, operators[0])
    machine_north = 50_000.0 if far else 100.0
    machine_lat, machine_lon = _offset(fence.center_lat, fence.center_lon, machine_north, 0.0)
    kind = "hydraulic_pressure_loss"

    retired = _retire_incident_dedupe(s, brain.dedupe_key(machine_id, kind), now, cfg)
    event = SimulatedMachineSensorSource().emit(machine_id=machine_id, kind=kind, lat=machine_lat,
                                                lon=machine_lon, site_id=actor.site_id, ts=now)
    sim_event = record_sim_event(s, event)
    incident = brain.handle_machine_sensor(s, event, cfg, sim_event=sim_event)

    if incident.dispatch_status == "dispatched":
        summary = (f"{incident.detail} {incident.nearest_user_id} was alarmed as the nearest eligible "
                   f"operator ({incident.nearest_distance_m:.0f} m away); "
                   f"{len(incident.notified_user_ids or []) - 1} supervisor/admin watchers notified.")
    else:
        summary = ("No eligible nearby operator identified - the machine is "
                   f"{machine_north / 1000.0:.0f} km from the worksite, so every operator was rejected "
                   f"on distance. {len(incident.notified_user_ids or [])} supervisors/admins alerted "
                   f"and no operator was invented.")

    return _result(name, summary=summary, now=now,
                   ids={"incident_id": incident.incident_id, "sim_event_id": sim_event.event_id,
                        "machine_id": machine_id, "nearest_user_id": incident.nearest_user_id,
                        "notified_user_ids": list(incident.notified_user_ids or [])},
                   detail={"incident": _incident_public(incident), "staged_positions": staged,
                           "dedupe_retired": retired, "config": cfg.public()["nearest_operator"]},
                   links=[{"label": "Admin incidents", "href": "/tc/admin"},
                          {"label": "Operator alarm", "href": "/tc/op"}])


def _scenario_camera(s: Session, actor: UserRow, cfg: BrainConfig, now: float, *, name: str,
                     idle_seconds: float, context: str) -> dict[str, Any]:
    """Shared body of the three camera scenarios (suppressed, flagged, below threshold)."""
    operator = _operators(s, actor)[0]
    camera_id = _demo_camera(s, actor.site_id, operator)
    retired = _retire_idle_cooldown(s, camera_id, operator.user_id, now, cfg) if name == "true_idle" else 0

    obs = SimulatedCameraSource().observe(camera_id=camera_id, operator_id=operator.user_id,
                                          idle_seconds=idle_seconds, context=context, ts=now)
    sim_event = record_sim_event(s, obs)
    ticket = brain.handle_camera_observation(s, obs, cfg, sim_event=sim_event)
    payload = sim_event.payload or {}

    if ticket is not None:
        summary = (f"{idle_seconds / 60.0:.0f} min unexplained on {camera_id} crossed the "
                   f"{cfg.idle.threshold_s / 60.0:.0f} min threshold: ticket {ticket.ticket_id} "
                   f"({ticket.severity}) opened for {operator.name}'s supervisor. No alarm, no safety "
                   f"alert, operator not notified.")
    else:
        summary = f"No ticket raised for {operator.name}. Reason: {payload.get('suppressed_reason')}"

    return _result(name, summary=summary, now=now,
                   ids={"sim_event_id": sim_event.event_id,
                        "ticket_id": ticket.ticket_id if ticket is not None else None,
                        "camera_id": camera_id, "operator_id": operator.user_id,
                        "supervisor_id": operator.supervisor_id},
                   detail={"observation": payload, "ticket": _ticket_public(ticket),
                           "outcome": payload.get("outcome"),
                           "suppressed_reason": payload.get("suppressed_reason"),
                           "cooldown_retired": retired, "config": cfg.public()["idle"]},
                   links=[{"label": "Supervisor review queue", "href": "/tc/sup"}])


def _scenario_fatigue(s: Session, actor: UserRow, cfg: BrainConfig, now: float) -> dict[str, Any]:
    """A simulated alertness indication: prompt the operator, tell the supervisor, never diagnose."""
    operator = _operators(s, actor)[0]
    ind = SimulatedFatigueSource().indicate(operator_id=operator.user_id,
                                            indicator="reduced_alertness_indication", confidence=0.61,
                                            note="Simulated demo source; no measurement was taken.",
                                            ts=now)
    sim_event = record_sim_event(s, ind)
    ticket = brain.handle_fatigue(s, ind, cfg, sim_event=sim_event)
    return _result("fatigue", now=now,
                   summary=(f"{operator.name} was prompted to consider a break and ticket "
                            f"{ticket.ticket_id} was opened for their supervisor. Both are labelled "
                            f"SIMULATED and worded as an indication, not a diagnosis."),
                   ids={"sim_event_id": sim_event.event_id, "ticket_id": ticket.ticket_id,
                        "operator_id": operator.user_id, "supervisor_id": operator.supervisor_id},
                   detail={"ticket": _ticket_public(ticket), "indication": sim_event.payload or {}},
                   links=[{"label": "Operator app", "href": "/tc/op"},
                          {"label": "Supervisor review queue", "href": "/tc/sup"}])


def _scenario_outside_geofence_punch(s: Session, actor: UserRow, cfg: BrainConfig,
                                     now: float) -> dict[str, Any]:
    """A start-work punch from well outside the fence, with a fix good enough to be believed.

    The punch is written the way ``POST /tc/punch`` writes one (server timestamp, classified
    position, ticket to the supervisor); the scenario stages it directly so the demo does not need a
    second sign-in. The last operator in the roster is used, leaving the incident scenarios' crew
    positions alone.
    """
    fence = _fence(s, actor.site_id)
    operator = _operators(s, actor)[-1]
    lat, lon = _offset(fence.center_lat, fence.center_lon, fence.radius_m + 800.0, 0.0)
    accuracy_m = 15.0
    status, distance = classify(lat, lon, accuracy_m, fence)
    record_location(s, operator.user_id, ts=now, lat=lat, lon=lon, accuracy_m=accuracy_m,
                    geofence_status=status, source="simulated")

    ticket = open_ticket(
        s, site_id=operator.site_id, kind=KIND_GEOFENCE_PUNCH, severity="medium",
        owner_role="supervisor", owner_user_id=operator.supervisor_id,
        subject_user_id=operator.user_id, source="RULE",
        title=f"Start-work punch outside the site: {operator.name}",
        detail=(f"{operator.name} punched start_work about {distance:.0f} m from the centre of "
                f"{fence.name}, outside the {fence.radius_m:.0f} m boundary, with a reported accuracy "
                f"of {accuracy_m:.0f} m. Location is an indication of presence, never proof - check "
                f"before drawing a conclusion."),
        evidence={"punch_kind": "start_work", "ts": now, "ts_gmt": gmt_iso(now), "lat": lat, "lon": lon,
                  "accuracy_m": accuracy_m, "geofence_status": status, "geofence_id": fence.geofence_id,
                  "fence_radius_m": fence.radius_m, "distance_m": distance,
                  "category": "attendance", "is_safety_alert": False,
                  "note": "A fix too coarse to trust reads 'unverified' and is never reported as "
                          "'outside'."})
    punch = PunchRow(punch_id=new_id("pun"), user_id=operator.user_id, kind="start_work", ts=now,
                     lat=lat, lon=lon, accuracy_m=accuracy_m, geofence_status=status,
                     geofence_id=fence.geofence_id, distance_m=distance, ticket_id=ticket.ticket_id)
    s.add(punch)
    s.flush()
    if operator.supervisor_id:
        notify(s, operator.supervisor_id, kind="ticket", severity="warning",
               title=f"Punch outside the site: {operator.name}",
               body=(f"start_work recorded {distance:.0f} m from the centre of {fence.name} "
                     f"({status}). Check before acting - a position is an indication, not proof."),
               link="/tc/sup", ticket_id=ticket.ticket_id)

    return _result("outside_geofence_punch", now=now,
                   summary=(f"{operator.name} punched start_work {distance:.0f} m out ({status}); "
                            f"punch {punch.punch_id} recorded with the server timestamp and ticket "
                            f"{ticket.ticket_id} sent to their supervisor."),
                   ids={"punch_id": punch.punch_id, "ticket_id": ticket.ticket_id,
                        "operator_id": operator.user_id, "supervisor_id": operator.supervisor_id},
                   detail={"ticket": _ticket_public(ticket), "geofence_status": status,
                           "distance_m": round(distance, 1) if distance is not None else None,
                           "fence": {"geofence_id": fence.geofence_id, "name": fence.name,
                                     "radius_m": fence.radius_m,
                                     "max_accuracy_m": fence.max_accuracy_m}},
                   links=[{"label": "Supervisor review queue", "href": "/tc/sup"},
                          {"label": "Admin people view", "href": "/tc/admin"}])


def _scenario_task_overrun(s: Session, actor: UserRow, cfg: BrainConfig, now: float) -> dict[str, Any]:
    """A task whose expected finish has already passed, with the overrun ticket that follows.

    Uses one dedicated demo task per operator (a fixed id, rewritten on each run) so repeated demos
    do not pile up tasks or move the goalposts on a task a supervisor actually created.
    """
    operator = _operators(s, actor)[0]
    task_id = f"tsk_demo_overrun_{operator.user_id}"
    start_ts, expected_finish_ts = now - 3 * 3600.0, now - 1800.0
    task = s.get(TcTaskRow, task_id)
    if task is None:
        task = TcTaskRow(task_id=task_id, site_id=operator.site_id, operator_id=operator.user_id,
                         supervisor_id=operator.supervisor_id or actor.user_id,
                         title="DEMO: clear the haul road shoulder", created_at=now)
        s.add(task)
    task.instructions = ("Demo task staged by the scenario panel to show an overrun. "
                         "Not a real work order.")
    task.location = "Haul road, section B"
    task.machine_id = operator.machine_id
    task.priority = "normal"
    task.status = "ongoing"
    task.start_ts = start_ts
    task.expected_finish_ts = expected_finish_ts
    task.started_at = start_ts
    task.finished_at = None
    task.meta = {"demo": True, "scenario": "task_overrun",
                 "note": "Created by POST /tc/sim/scenario/task_overrun; rewritten on each run."}
    s.flush()

    overrun_min = (now - expected_finish_ts) / 60.0
    ticket = open_ticket(
        s, site_id=task.site_id, kind=KIND_TASK_OVERRUN, severity="medium", owner_role="supervisor",
        owner_user_id=task.supervisor_id, subject_user_id=operator.user_id, source="RULE",
        task_id=task.task_id, machine_id=task.machine_id,
        title=f"Task running late: {task.title}",
        detail=(f"{task.title} was expected to finish at {gmt_iso(expected_finish_ts)} GMT and is "
                f"still ongoing {overrun_min:.0f} min later. An overrun is a fact, not a fault - ask "
                f"what got in the way."),
        evidence={"task_id": task.task_id, "title": task.title, "start_ts": start_ts,
                  "start_gmt": gmt_iso(start_ts), "expected_finish_ts": expected_finish_ts,
                  "expected_finish_gmt": gmt_iso(expected_finish_ts), "as_of_ts": now,
                  "as_of_gmt": gmt_iso(now), "overrun_minutes": round(overrun_min, 1),
                  "category": "schedule", "is_safety_alert": False})
    task.overrun_ticket_id = ticket.ticket_id
    s.flush()
    if task.supervisor_id:
        notify(s, task.supervisor_id, kind="ticket", severity="info",
               title=f"Task running late: {task.title}",
               body=(f"{operator.name} is {overrun_min:.0f} min past the expected finish "
                     f"({gmt_iso(expected_finish_ts)} GMT)."),
               link=f"/tc/sup/operator/{operator.user_id}", ticket_id=ticket.ticket_id)

    return _result("task_overrun", now=now,
                   summary=(f"Demo task {task.task_id} is {overrun_min:.0f} min past its expected "
                            f"finish; ticket {ticket.ticket_id} opened for the supervisor with the "
                            f"planned and actual times in GMT."),
                   ids={"task_id": task.task_id, "ticket_id": ticket.ticket_id,
                        "operator_id": operator.user_id, "supervisor_id": task.supervisor_id},
                   detail={"ticket": _ticket_public(ticket), "overrun_minutes": round(overrun_min, 1),
                           "expected_finish_gmt": gmt_iso(expected_finish_ts)},
                   links=[{"label": "Supervisor dashboard", "href": "/tc/sup"},
                          {"label": "Operator task", "href": f"/tc/op/task/{task.task_id}"}])


_RUNNERS: dict[str, Callable[[Session, UserRow, BrainConfig, float], dict[str, Any]]] = {
    "critical_incident": lambda s, a, c, n: _scenario_critical_incident(s, a, c, n, far=False),
    "critical_incident_no_operator": lambda s, a, c, n: _scenario_critical_incident(s, a, c, n, far=True),
    "waiting_for_truck": lambda s, a, c, n: _scenario_camera(s, a, c, n, name="waiting_for_truck",
                                                             idle_seconds=1200.0,
                                                             context="waiting_for_truck"),
    "true_idle": lambda s, a, c, n: _scenario_camera(s, a, c, n, name="true_idle", idle_seconds=1800.0,
                                                     context="unknown"),
    "false_idle": lambda s, a, c, n: _scenario_camera(s, a, c, n, name="false_idle", idle_seconds=240.0,
                                                      context="unknown"),
    "fatigue": _scenario_fatigue,
    "outside_geofence_punch": _scenario_outside_geofence_punch,
    "task_overrun": _scenario_task_overrun,
}


@router.post("/scenario/{name}")
def post_scenario(name: str, s: Session = Depends(get_session),
                  actor: UserRow = Depends(require_roles(*TRIGGER_ROLES))) -> dict[str, Any]:
    """Run one demo scenario against the caller's site and report what it produced.

    Admin or supervisor only. Safe to run repeatedly: nothing is deleted and no timestamp is
    rewritten - where a dedupe or cooldown rule would swallow the repeat, the scenario retires its
    own previous artefact first and says so in ``detail``. 404 for an unknown scenario, 409 when the
    site has not been seeded.
    """
    if name not in _RUNNERS:
        raise HTTPException(404, f"unknown scenario {name!r}; GET /tc/sim/scenarios lists them")
    return _RUNNERS[name](s, actor, BrainConfig.load(), time.time())
