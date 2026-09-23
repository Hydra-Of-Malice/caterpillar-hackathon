"""The Task Centre "AI brain": typed observation in, incident / ticket / notification out.

Honest by construction. There is no model in here and no detection: every input arrives from
:mod:`sentinel.taskcentre.adapters` already labelled ``SIMULATED``, and every row this module writes
carries that label through to the UI. What it *does* contribute is the decision layer a real system
still needs once a detector exists - who is nearest, what is worth a human review, what is noise -
and the rules for that are deterministic, configured in ``config/taskcentre.yaml`` and unit-tested.

Three principles show up repeatedly below:

* **Never invent a person.** If nobody qualifies as the nearest operator, the incident says
  ``no_eligible_operator`` and the supervisors and admins are told, in those words.
* **Safety and productivity stay apart.** A camera idle flag is a productivity ticket for a
  supervisor to look at. It never alarms anybody and is never a safety alert.
* **Explain, then flag.** A pause with a reported explanation is suppressed and logged, not
  escalated; every flag carries the observation, the threshold it crossed and plain-language wording.

No FastAPI in this module - it takes a ``Session`` and returns rows, so it is straightforward to
unit test (``tests/taskcentre/test_brain.py``). ``sentinel/taskcentre/routes_sim.py`` is the only
HTTP wrapper.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared import config
from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import (CameraRow, SimEventRow, TcIncidentRow, TicketRow, UserRow)
from sentinel.taskcentre.adapters import (CameraObservation, EXPLAINED_CONTEXTS, FatigueIndication,
                                          MachineSensorEvent, clip_placeholder, mark_sim_event,
                                          observation_timeline, record_sim_event)
from sentinel.taskcentre.geo import haversine_m
from sentinel.taskcentre.service import gmt_iso, latest_location, notify, open_ticket, settings
from sentinel.taskcentre.waiting import overlaps_wait, reason_phrase

#: Every row written here carries this provenance until a real detector replaces the adapter.
SIMULATED = "SIMULATED"

#: Tickets this module opens.
KIND_IDLE = "ai_idle"
KIND_FATIGUE = "fatigue"
KIND_PROXIMITY_FLAG = "proximity_flag"

#: Substrings that mark a machine sensor event as "somebody was near the machine". Matched against
#: ``MachineSensorEvent.kind`` so a real detector only has to name its event sensibly
#: (``person_in_zone``, ``proximity_intrusion``, ``person_near_machine``, ...) to get the operator
#: acknowledge/dispute prompt for free.
PROXIMITY_KIND_HINTS: tuple[str, ...] = ("proximity", "person", "pedestrian", "struck_by")

#: One line appended wherever a person reads what the brain produced. Not decoration - the demo is
#: judged on being honest about what is real, and this is the sentence that says it.
SIMULATED_NOTE = ("SIMULATED demo detector - not validated detection, and not a substitute for site "
                  "safety procedure.")


# ---------------------------------------------------------------- configuration
@dataclass(frozen=True)
class NearestOperatorConfig:
    """When a location report still counts as evidence of where somebody is."""
    max_age_s: float = 600.0
    max_distance_m: float = 2000.0


@dataclass(frozen=True)
class IdleConfig:
    """When stillness becomes a productivity flag, and how often the same pair may be flagged."""
    threshold_s: float = 900.0
    cooldown_s: float = 600.0


@dataclass(frozen=True)
class BrainConfig:
    """Typed view of ``config/taskcentre.yaml`` (see that file for what each key means)."""
    version: str = "taskcentre-0.1.0"
    nearest_operator: NearestOperatorConfig = field(default_factory=NearestOperatorConfig)
    idle: IdleConfig = field(default_factory=IdleConfig)
    incident_dedupe_s: float = 300.0
    session_hours: float = 12.0
    stale_location_s: float = 600.0

    @classmethod
    def load(cls, data: dict[str, Any] | None = None) -> "BrainConfig":
        """Build from ``service.settings()`` (one loader for the whole Task Centre) or a literal dict."""
        raw = settings() if data is None else data
        nearest = dict(raw.get("nearest_operator") or {})
        idle = dict(raw.get("idle") or {})
        return cls(
            version=str(raw.get("version", cls.version)),
            nearest_operator=NearestOperatorConfig(
                max_age_s=float(nearest.get("max_age_s", NearestOperatorConfig.max_age_s)),
                max_distance_m=float(nearest.get("max_distance_m", NearestOperatorConfig.max_distance_m))),
            idle=IdleConfig(threshold_s=float(idle.get("threshold_s", IdleConfig.threshold_s)),
                            cooldown_s=float(idle.get("cooldown_s", IdleConfig.cooldown_s))),
            incident_dedupe_s=float(raw.get("incident_dedupe_s", cls.incident_dedupe_s)),
            session_hours=float(raw.get("session_hours", cls.session_hours)),
            stale_location_s=float(raw.get("stale_location_s", cls.stale_location_s)),
        )

    def public(self) -> dict[str, Any]:
        """The thresholds, for an API response - a flag should always show what it was measured against."""
        return {"version": self.version,
                "nearest_operator": {"max_age_s": self.nearest_operator.max_age_s,
                                     "max_distance_m": self.nearest_operator.max_distance_m},
                "idle": {"threshold_s": self.idle.threshold_s, "cooldown_s": self.idle.cooldown_s},
                "incident_dedupe_s": self.incident_dedupe_s,
                "stale_location_s": self.stale_location_s}


# ---------------------------------------------------------------- nearest-operator selection
@dataclass(frozen=True)
class Candidate:
    """One operator weighed for dispatch, with the reason they were or were not eligible."""
    user_id: str
    name: str
    eligible: bool
    reason: str
    distance_m: float | None = None
    age_s: float | None = None

    def public(self) -> dict[str, Any]:
        return {"user_id": self.user_id, "name": self.name, "eligible": self.eligible,
                "reason": self.reason,
                "distance_m": None if self.distance_m is None else round(self.distance_m, 1),
                "age_s": None if self.age_s is None else round(self.age_s, 1)}


def rank_candidates(s: Session, *, site_id: str, lat: float | None, lon: float | None, now: float,
                    cfg: BrainConfig) -> list[Candidate]:
    """Every active operator at the site, eligible ones first and nearest first within those.

    Eligible means all of: a location report exists, it has usable coordinates, it is younger than
    ``nearest_operator.max_age_s``, and it is within ``nearest_operator.max_distance_m`` of the
    incident. ``geofence_status == "unverified"`` is *not* disqualifying - a fix too coarse to place
    somebody inside the fence can still be good enough to say who is closest - but missing
    coordinates are, because there is then nothing to measure.

    The per-candidate ``reason`` is kept and stored on the incident so a supervisor can see why the
    system chose whom it chose, or why it chose nobody.
    """
    max_age, max_distance = cfg.nearest_operator.max_age_s, cfg.nearest_operator.max_distance_m
    stmt = select(UserRow).where(UserRow.role == "operator", UserRow.active.is_(True),
                                 UserRow.site_id == site_id).order_by(UserRow.user_id)
    out: list[Candidate] = []
    for user in s.execute(stmt).scalars().all():
        loc = latest_location(s, user.user_id)
        if loc is None:
            out.append(Candidate(user.user_id, user.name, False, "no location ever reported"))
            continue
        age = max(0.0, now - loc.ts)
        if loc.lat is None or loc.lon is None:
            out.append(Candidate(user.user_id, user.name, False, "last report has no coordinates",
                                 age_s=age))
            continue
        if age > max_age:
            out.append(Candidate(user.user_id, user.name, False,
                                 f"position is {age / 60.0:.0f} min old (limit {max_age / 60.0:.0f} min)",
                                 age_s=age))
            continue
        if lat is None or lon is None:
            out.append(Candidate(user.user_id, user.name, False,
                                 "incident has no coordinates, so distance cannot be measured",
                                 age_s=age))
            continue
        distance = haversine_m(loc.lat, loc.lon, lat, lon)
        if distance > max_distance:
            out.append(Candidate(user.user_id, user.name, False,
                                 f"{distance:.0f} m away (limit {max_distance:.0f} m)",
                                 distance_m=distance, age_s=age))
            continue
        out.append(Candidate(user.user_id, user.name, True, "nearby with a recent position",
                             distance_m=distance, age_s=age))
    # Eligible first, then nearest; user_id last so equal distances resolve the same way every run.
    out.sort(key=lambda c: (not c.eligible, c.distance_m if c.distance_m is not None else float("inf"),
                            c.user_id))
    return out


# ---------------------------------------------------------------- machine sensor -> incident
def dedupe_key(machine_id: str, kind: str) -> str:
    """Two sensor events are "the same situation" when the machine and the condition match."""
    return f"{machine_id}|{kind}"


def _recent_duplicate(s: Session, key: str, now: float, cfg: BrainConfig) -> TcIncidentRow | None:
    """The live incident this event is a repeat of, if there is one inside the dedupe window.

    ``data["dedupe_retired_at"]`` is a demo-only escape hatch: a scenario re-run retires its own
    previous incident so the demo can be shown twice. Nothing outside the scenarios sets it.
    """
    stmt = select(TcIncidentRow).where(TcIncidentRow.dedupe_key == key,
                                       TcIncidentRow.ts >= now - cfg.incident_dedupe_s) \
        .order_by(TcIncidentRow.ts.desc())
    for row in s.execute(stmt).scalars().all():
        if not (row.data or {}).get("dedupe_retired_at"):
            return row
    return None


def _site_for_machine(s: Session, event: MachineSensorEvent) -> str:
    """The site a machine belongs to: the event, else a camera on it, else the configured site."""
    if event.site_id:
        return event.site_id
    camera = s.execute(select(CameraRow).where(CameraRow.machine_id == event.machine_id)
                       .order_by(CameraRow.camera_id)).scalars().first()
    if camera is not None:
        return camera.site_id
    user = s.execute(select(UserRow).where(UserRow.machine_id == event.machine_id)
                     .order_by(UserRow.user_id)).scalars().first()
    return user.site_id if user is not None else config.SITE_ID


def _admins(s: Session, site_id: str) -> list[UserRow]:
    """Active admins for the site, falling back to all active admins so an alert never goes nowhere."""
    stmt = select(UserRow).where(UserRow.role == "admin", UserRow.active.is_(True)) \
        .order_by(UserRow.user_id)
    rows = s.execute(stmt).scalars().all()
    same_site = [u for u in rows if u.site_id == site_id]
    return same_site or list(rows)


def _supervisors(s: Session, site_id: str) -> list[UserRow]:
    """Active supervisors at the site (used when there is no single operator to route through)."""
    stmt = select(UserRow).where(UserRow.role == "supervisor", UserRow.active.is_(True),
                                 UserRow.site_id == site_id).order_by(UserRow.user_id)
    return list(s.execute(stmt).scalars().all())


def handle_machine_sensor(s: Session, event: MachineSensorEvent, cfg: BrainConfig | None = None, *,
                          sim_event: SimEventRow | None = None) -> TcIncidentRow:
    """Turn a critical machine sensor event into an incident and dispatch the nearest operator.

    Order of business:

    1. **Dedupe.** A second identical event (same machine, same condition) inside
       ``incident_dedupe_s`` returns the existing incident and alarms nobody again. A chattering
       sensor must not turn into an alert flood - that is how people learn to ignore alarms.
    2. **Rank.** :func:`rank_candidates` weighs every active operator at the site.
    3. **Dispatch or admit defeat.** The nearest eligible operator is alarmed and their supervisor
       plus the admins are told. If nobody qualifies, ``dispatch_status`` is
       ``"no_eligible_operator"``, the supervisors and admins are told in exactly those words, and no
       operator is picked - a wrong name here sends somebody to the wrong place in an emergency.

    Returns the incident row (existing one when deduped). The event itself is always persisted.
    """
    cfg = cfg or BrainConfig.load()
    now = event.ts
    sim_event = sim_event or record_sim_event(s, event)
    key = dedupe_key(event.machine_id, event.kind)

    duplicate = _recent_duplicate(s, key, now, cfg)
    if duplicate is not None:
        mark_sim_event(sim_event, incident_id=duplicate.incident_id, outcome="deduped",
                       suppressed_reason=(f"duplicate of incident {duplicate.incident_id} inside the "
                                          f"{cfg.incident_dedupe_s:.0f} s dedupe window; nobody re-alarmed"))
        return duplicate

    site_id = _site_for_machine(s, event)
    candidates = rank_candidates(s, site_id=site_id, lat=event.lat, lon=event.lon, now=now, cfg=cfg)
    nearest = next((c for c in candidates if c.eligible), None)
    headline = f"{_humanise(event.kind)} on {event.machine_id}"

    incident = TcIncidentRow(
        incident_id=new_id("inc"), site_id=site_id, machine_id=event.machine_id, kind=event.kind,
        severity=event.severity, ts=now, lat=event.lat, lon=event.lon,
        detail=event.detail or headline, source=event.source or SIMULATED,
        nearest_user_id=nearest.user_id if nearest else None,
        nearest_distance_m=nearest.distance_m if nearest else None,
        dispatch_status="dispatched" if nearest else "no_eligible_operator",
        notified_user_ids=[], dedupe_key=key,
        data={"candidates": [c.public() for c in candidates],
              "considered": len(candidates),
              "eligible": sum(1 for c in candidates if c.eligible),
              "config": cfg.public()["nearest_operator"],
              "note": SIMULATED_NOTE})
    s.add(incident)
    s.flush()

    notified: list[str] = []
    if nearest is not None:
        operator = s.get(UserRow, nearest.user_id)
        notify(s, nearest.user_id, kind="critical_incident", severity="critical", alarm=True,
               title=f"CRITICAL: {headline}",
               body=(f"You are the nearest available operator ({nearest.distance_m:.0f} m away; your "
                     f"position was reported {(nearest.age_s or 0.0) / 60.0:.0f} min ago). "
                     f"{incident.detail} Follow site procedure - this system does not control the "
                     f"machine. {SIMULATED_NOTE}"),
               link="/tc/op", incident_id=incident.incident_id)
        notified.append(nearest.user_id)
        watchers = list(_admins(s, site_id))
        if operator is not None and operator.supervisor_id:
            supervisor = s.get(UserRow, operator.supervisor_id)
            if supervisor is not None and supervisor.active:
                watchers.insert(0, supervisor)
        body = (f"{incident.detail} Nearest available operator {nearest.name} was alarmed "
                f"({nearest.distance_m:.0f} m away). {SIMULATED_NOTE}")
        for watcher in _unique(watchers):
            if watcher.user_id in notified:
                continue
            notify(s, watcher.user_id, kind="critical_incident", severity="critical",
                   title=f"CRITICAL: {headline}", body=body, link="/tc/admin",
                   incident_id=incident.incident_id)
            notified.append(watcher.user_id)
    else:
        body = (f"No eligible nearby operator identified. {incident.detail} "
                f"Nobody at this site has a position report newer than "
                f"{cfg.nearest_operator.max_age_s / 60.0:.0f} min within "
                f"{cfg.nearest_operator.max_distance_m:.0f} m of the machine, so nobody was "
                f"dispatched. Assign somebody manually. {SIMULATED_NOTE}")
        for watcher in _unique([*_supervisors(s, site_id), *_admins(s, site_id)]):
            notify(s, watcher.user_id, kind="critical_incident", severity="critical",
                   title=f"CRITICAL (no operator dispatched): {headline}", body=body, link="/tc/admin",
                   incident_id=incident.incident_id)
            notified.append(watcher.user_id)

    incident.notified_user_ids = notified
    s.flush()
    if is_proximity_kind(event.kind):
        raise_proximity_prompt(s, incident, event)
    mark_sim_event(sim_event, incident_id=incident.incident_id, outcome=incident.dispatch_status)
    return incident


# ---------------------------------------------------------------- proximity -> operator prompt
def is_proximity_kind(kind: str | None) -> bool:
    """Is this sensor condition "somebody was close to the machine"? See :data:`PROXIMITY_KIND_HINTS`."""
    lowered = (kind or "").lower()
    return any(hint in lowered for hint in PROXIMITY_KIND_HINTS)


def _prompt_operator(s: Session, incident: TcIncidentRow) -> UserRow | None:
    """Who is asked to confirm or dispute: the person at the controls, else whoever was dispatched.

    The machine's assigned operator is preferred because they are the one who can say what actually
    happened. If nobody is assigned and nobody was dispatched, no prompt is raised - we do not pick a
    person to answer for an event they may have had nothing to do with.
    """
    assigned = s.execute(select(UserRow).where(UserRow.machine_id == incident.machine_id,
                                               UserRow.role == "operator", UserRow.active.is_(True))
                         .order_by(UserRow.user_id)).scalars().first()
    if assigned is not None:
        return assigned
    return s.get(UserRow, incident.nearest_user_id) if incident.nearest_user_id else None


def raise_proximity_prompt(s: Session, incident: TcIncidentRow,
                           event: MachineSensorEvent) -> TicketRow | None:
    """Ask the operator to confirm or dispute a person-near-machine flag, on top of the alert path.

    A proximity flag is a statement about a person's work, made by a detector that cannot see why
    somebody was there. So the operator gets the first word: a ticket is opened for their supervisor
    with the recorded evidence, and a notification asks the operator to **acknowledge or dispute** it
    (``GET /tc/op/flags``, ``POST /tc/op/flags/{ticket_id}/respond``).

    Their answer is appended as a review decision - the incident and the evidence are never rewritten,
    and a dispute is kept verbatim and shown to the supervisor beside the evidence. It is the
    operator's account, not a veto: the flag stays open for the supervisor either way.

    Returns the ticket, or ``None`` when there is nobody to ask.
    """
    operator = _prompt_operator(s, incident)
    if operator is None:
        return None

    headline = f"{_humanise(incident.kind)} on {incident.machine_id}"
    explanation = (
        f"A SIMULATED proximity source reported {_humanise(incident.kind)} on {incident.machine_id} at "
        f"{gmt_iso(incident.ts)} GMT. {incident.detail} You are recorded as the operator on this "
        f"machine, so you are asked first: confirm it if somebody was close, or dispute it if the "
        f"detector got it wrong. Either answer is recorded and sent to your supervisor - a dispute is "
        f"kept in your own words next to the evidence, and nothing you say is overwritten.")

    ticket = open_ticket(
        s, site_id=incident.site_id, kind=KIND_PROXIMITY_FLAG, severity=incident.severity,
        owner_role="supervisor", owner_user_id=operator.supervisor_id,
        subject_user_id=operator.user_id, source=event.source or SIMULATED,
        machine_id=incident.machine_id, incident_id=incident.incident_id,
        title=f"Proximity flag awaiting the operator's response: {headline}",
        detail=f"{explanation} {SIMULATED_NOTE}",
        evidence={"incident_id": incident.incident_id, "machine_id": incident.machine_id,
                  "kind": incident.kind, "severity": incident.severity, "observed_at": incident.ts,
                  "observed_at_gmt": gmt_iso(incident.ts), "lat": incident.lat, "lon": incident.lon,
                  "detail": incident.detail, "source": event.source or SIMULATED,
                  "category": "safety", "is_safety_alert": True,
                  "response_options": ["acknowledged", "disputed"],
                  "explanation": explanation,
                  "dispute_policy": ("A dispute is recorded verbatim and shown to the supervisor beside "
                                     "the evidence. It is the operator's account of what happened, not "
                                     "a veto, and it is never deleted or summarised away."),
                  "note": SIMULATED_NOTE})

    notify(s, operator.user_id, kind=KIND_PROXIMITY_FLAG, severity="warning",
           title=f"Confirm or dispute: {headline}",
           body=(f"{explanation} {SIMULATED_NOTE}"),
           link="/tc/op", incident_id=incident.incident_id, ticket_id=ticket.ticket_id)
    return ticket


# ---------------------------------------------------------------- camera -> idle ticket
def _idle_cooldown_ticket(s: Session, obs: CameraObservation, cfg: BrainConfig) -> TicketRow | None:
    """A flag already raised for this (camera, operator) inside ``idle.cooldown_s``, if any.

    ``evidence["cooldown_retired_at"]`` is the demo-only escape hatch (see :func:`_recent_duplicate`).
    """
    stmt = select(TicketRow).where(TicketRow.kind == KIND_IDLE,
                                   TicketRow.subject_user_id == obs.operator_id,
                                   TicketRow.created_at >= obs.ts - cfg.idle.cooldown_s) \
        .order_by(TicketRow.created_at.desc())
    for row in s.execute(stmt).scalars().all():
        evidence = row.evidence or {}
        if evidence.get("camera_id") == obs.camera_id and not evidence.get("cooldown_retired_at"):
            return row
    return None


def handle_camera_observation(s: Session, obs: CameraObservation, cfg: BrainConfig | None = None, *,
                              sim_event: SimEventRow | None = None) -> TicketRow | None:
    """Decide whether a camera observation is worth a supervisor's attention. Usually it is not.

    A flag is *not* raised when:

    * the observation carries a context that explains the pause (``waiting_for_truck``,
      ``machine_paused``, ``expected_delay``) - the event is stored with a ``suppressed_reason`` and
      nobody is disturbed. Waiting for a haul truck is the job, not idling, and a system that cannot
      tell the difference trains supervisors to ignore it;
    * **the operator already declared a wait** covering this observation window (they tapped
      "Waiting for truck"; see :mod:`sentinel.taskcentre.waiting`). The detector may know nothing
      about the truck, but the person in the cab said why they are standing still before anybody
      looked - that explanation is honoured, recorded on the event, and no flag is raised;
    * the pause is shorter than ``idle.threshold_s``;
    * the same (camera, operator) pair was already flagged inside ``idle.cooldown_s``.

    Otherwise an ``ai_idle`` ticket is opened for the operator's supervisor, carrying the camera id,
    a clip placeholder, the observation timeline and a plain-language explanation of what crossed
    which threshold. It is a **productivity flag for human review**: severity stays low/medium, no
    alarm is raised, and the operator is not notified - a person hears about it from their supervisor,
    not from a camera. Returns the ticket, or ``None`` when nothing was flagged.
    """
    cfg = cfg or BrainConfig.load()
    sim_event = sim_event or record_sim_event(s, obs)
    minutes, threshold_min = obs.idle_seconds / 60.0, cfg.idle.threshold_s / 60.0

    if obs.context in EXPLAINED_CONTEXTS:
        reason = (f"context '{obs.context}' explains the pause ({minutes:.0f} min); this is expected "
                  f"work, not idle time, so no flag was raised")
        mark_sim_event(sim_event, suppressed_reason=reason, outcome="suppressed_explained")
        return None

    declared = overlaps_wait(s, obs.operator_id, obs.ts - obs.idle_seconds, obs.ts)
    if declared is not None:
        reason = (f"operator_declared_{declared.reason}: the operator reported "
                  f"{reason_phrase(declared.reason)} from {gmt_iso(declared.started_at)} GMT "
                  f"(declared wait {declared.wait_id}), which covers this {minutes:.0f} min pause. "
                  f"Explained waiting is not idle time, so no flag was raised")
        mark_sim_event(sim_event, suppressed_reason=reason, outcome="suppressed_operator_declared")
        return None

    if obs.idle_seconds < cfg.idle.threshold_s:
        reason = (f"{minutes:.0f} min is below the {threshold_min:.0f} min threshold; short pauses "
                  f"are normal and are not flagged")
        mark_sim_event(sim_event, suppressed_reason=reason, outcome="below_threshold")
        return None

    existing = _idle_cooldown_ticket(s, obs, cfg)
    if existing is not None:
        reason = (f"{obs.camera_id} already flagged this operator within the last "
                  f"{cfg.idle.cooldown_s / 60.0:.0f} min (ticket {existing.ticket_id}); one long pause "
                  f"is one flag, not many")
        mark_sim_event(sim_event, ticket_id=existing.ticket_id, suppressed_reason=reason,
                       outcome="cooldown")
        return None

    operator = s.get(UserRow, obs.operator_id)
    camera = s.get(CameraRow, obs.camera_id)
    site_id = (operator.site_id if operator is not None
               else camera.site_id if camera is not None else config.SITE_ID)
    who = operator.name if operator is not None else obs.operator_id
    severity = "low" if obs.idle_seconds < 2 * cfg.idle.threshold_s else "medium"
    explanation = (
        f"Camera {obs.camera_id} reported the machine stationary for {minutes:.0f} min with no "
        f"context explaining it. The flag threshold is {threshold_min:.0f} min. This is a "
        f"productivity observation for you to check, not a safety alert and not proof of anything: "
        f"there may be a good reason the camera could not see. Ask before you act on it.")

    ticket = open_ticket(
        s, site_id=site_id, kind=KIND_IDLE, severity=severity, owner_role="supervisor",
        owner_user_id=operator.supervisor_id if operator is not None else None,
        subject_user_id=obs.operator_id, source=obs.source or SIMULATED,
        machine_id=camera.machine_id if camera is not None else None,
        title=f"Possible idle time: {who}, {minutes:.0f} min",
        detail=f"{explanation} {SIMULATED_NOTE}",
        evidence={
            "camera_id": obs.camera_id,
            "camera_label": camera.label if camera is not None else obs.camera_id,
            "clip_ref": obs.clip_ref or clip_placeholder(obs.camera_id, obs.ts),
            "clip_available": False,
            "clip_note": "No footage is stored in this prototype; the player shows a placeholder.",
            "idle_seconds": obs.idle_seconds,
            "threshold_s": cfg.idle.threshold_s,
            "context_reported": obs.context,
            "observed_at": obs.ts,
            "timeline": observation_timeline(obs),
            "explanation": explanation,
            "category": "productivity",
            "is_safety_alert": False,
            "note": SIMULATED_NOTE,
        })

    if ticket.owner_user_id:
        notify(s, ticket.owner_user_id, kind="ticket", severity="info",
               title=f"Idle flag to review: {who}",
               body=(f"{minutes:.0f} min stationary on {obs.camera_id}, no context reported. "
                     f"Productivity flag for review - not a safety alert. {SIMULATED_NOTE}"),
               link="/tc/sup", ticket_id=ticket.ticket_id)
    mark_sim_event(sim_event, ticket_id=ticket.ticket_id, outcome="flagged")
    return ticket


# ---------------------------------------------------------------- fatigue -> prompt + ticket
def handle_fatigue(s: Session, ind: FatigueIndication, cfg: BrainConfig | None = None, *,
                   sim_event: SimEventRow | None = None) -> TicketRow:
    """Turn a fatigue *indication* into a break prompt for the person and a note for their supervisor.

    Deliberately worded as a prompt, never a finding: this prototype cannot detect fatigue, and
    telling somebody a machine decided they are too tired to work - or telling their supervisor that
    - would be both wrong and unfair. The operator gets a suggestion to take a break; the supervisor
    gets a ticket saying an indication was raised by a simulated source, with the wording to match.
    No alarm is raised: a break prompt is not an emergency.
    """
    cfg = cfg or BrainConfig.load()
    sim_event = sim_event or record_sim_event(s, ind)
    operator = s.get(UserRow, ind.operator_id)
    site_id = operator.site_id if operator is not None else config.SITE_ID
    who = operator.name if operator is not None else ind.operator_id
    indicator = _humanise(ind.indicator)
    explanation = (
        f"A SIMULATED alertness source raised an indication ({indicator}) for {who}. This is a "
        f"prompt to check in, not a diagnosis, not a medical assessment and not validated fatigue "
        f"detection. Talk to them before drawing any conclusion.")

    ticket = open_ticket(
        s, site_id=site_id, kind=KIND_FATIGUE, severity="medium", owner_role="supervisor",
        owner_user_id=operator.supervisor_id if operator is not None else None,
        subject_user_id=ind.operator_id, source=ind.source or SIMULATED,
        title=f"Fatigue indication (SIMULATED): {who}",
        detail=f"{explanation} {SIMULATED_NOTE}",
        evidence={"indicator": ind.indicator, "confidence": ind.confidence, "observed_at": ind.ts,
                  "note_from_source": ind.note, "category": "wellbeing",
                  "is_diagnosis": False, "is_safety_alert": False,
                  "explanation": explanation, "note": SIMULATED_NOTE})

    notify(s, ind.operator_id, kind="fatigue", severity="warning",
           title="Safety prompt: consider a short break",
           body=(f"A SIMULATED alertness indication ({indicator}) was raised for you. It is a prompt, "
                 f"not an assessment of you - take a break if you need one and tell your supervisor "
                 f"if something is wrong. {SIMULATED_NOTE}"),
           link="/tc/op", ticket_id=ticket.ticket_id)
    if ticket.owner_user_id:
        notify(s, ticket.owner_user_id, kind="fatigue", severity="info",
               title=f"Fatigue indication (SIMULATED): {who}",
               body=(f"{who} was prompted to take a break after a simulated alertness indication "
                     f"({indicator}). Check in with them. {SIMULATED_NOTE}"),
               link="/tc/sup", ticket_id=ticket.ticket_id)
    mark_sim_event(sim_event, ticket_id=ticket.ticket_id, outcome="prompted")
    return ticket


# ---------------------------------------------------------------- small helpers
def _humanise(kind: str) -> str:
    """``hydraulic_pressure_loss`` -> ``hydraulic pressure loss`` for titles and bodies."""
    return kind.replace("_", " ")


def _unique(users: list[UserRow]) -> list[UserRow]:
    """Drop repeats, keep order (a supervisor who is also an admin is notified once)."""
    seen: set[str] = set()
    out: list[UserRow] = []
    for user in users:
        if user.user_id not in seen:
            seen.add(user.user_id)
            out.append(user)
    return out
