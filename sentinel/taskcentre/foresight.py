"""Rule-based RISK FORESIGHT for the admin: what the recorded facts could plausibly lead to.

**There is no model in here and nothing is predicted.** Every item this module returns is produced by
a deterministic rule reading rows the Task Centre already wrote - punches, declared waits, tasks,
tickets, incidents, camera frames, simulated sensor events - and each one carries:

* ``basis`` - the exact facts it fired on, with the time each was observed,
* ``source: "RULE"`` and a ``note`` saying what the rule can and cannot know,
* ``likelihood`` - the **band of the rule that fired**, never a measured or calibrated probability,
* ``recommended_actions`` - who should do what next, and through which endpoint.

The wording matters as much as the logic. A register like this is easy to over-sell ("the AI predicts
an accident"), and over-selling it is exactly how people stop trusting it. So the response repeats
:data:`HONESTY_NOTE` and :data:`CAVEATS` verbatim, ``method`` says
``"deterministic rules over recorded facts"``, and no item ever claims to foresee anything. Acting on
an item notifies people and writes a record - it never touches a machine.

Thresholds live in ``config/taskcentre.yaml`` under ``foresight`` (each one commented there); this
module's :data:`DEFAULTS` exist only so a missing config degrades instead of crashing.

No FastAPI here: :func:`site_foresight` takes a ``Session`` and returns a dict, so it is unit-tested
directly (``tests/taskcentre/test_foresight.py``). ``routes_admin.py`` is the HTTP wrapper.
"""
from __future__ import annotations

import time
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import (CameraRow, PunchRow, SimEventRow, TcIncidentRow, TcTaskRow,
                                              TicketRow, UserRow)
from sentinel.taskcentre.brain import is_proximity_kind
from sentinel.taskcentre.service import gmt_iso, settings

try:  # sentinel/taskcentre/fatigue.py is owned by another agent; foresight must not block on it.
    from sentinel.taskcentre.fatigue import fatigue_risk as _fatigue_risk
except ImportError:  # pragma: no cover - only reachable when fatigue.py has not landed yet
    _fatigue_risk = None

__all__ = ["site_foresight", "config", "HONESTY_NOTE", "CAVEATS", "LIKELIHOODS", "METHOD", "SOURCE"]

#: Provenance stamped on every item. Not "SIMULATED": the *rule* is real and deterministic, even
#: though the detectors feeding it are simulated (which the caveats say, in those words).
SOURCE = "RULE"

#: Returned as ``method``. The frontend prints it next to the heading.
METHOD = "deterministic rules over recorded facts"

METHOD_VERSION = "foresight-0.1.0"

#: Ordered weakest to strongest. Ranking uses this order, then recency.
LIKELIHOODS: tuple[str, ...] = ("low", "moderate", "elevated", "high")

#: The one sentence that must travel with this view wherever it is shown.
HONESTY_NOTE = (
    "Rule-based foresight, not a prediction and not a trained model. Each item restates facts this "
    "system already recorded, says what could plausibly follow if nothing changes, and suggests who "
    "should act. It does not know what will happen, the likelihood is a rule band and not a "
    "probability, and acting on an item only notifies people and writes a record - it never controls "
    "a machine.")

#: Repeated verbatim in every response and shown next to the list.
CAVEATS: tuple[str, ...] = (
    "Deterministic rules over facts that were already recorded - not a trained, tested or validated "
    "predictive model.",
    "'Likelihood' is the band of the rule that fired. It is not a measured probability and no "
    "probability is claimed.",
    "The detectors feeding these facts are SIMULATED in this prototype, so the facts are demo data.",
    "An empty register means no rule fired on the recorded facts, not that the site is safe.",
    "Nothing here replaces site safety procedure, a risk assessment, or the judgement of the people "
    "on site.",
)

#: Per-item limitation line, appended after the rule's own explanation.
ITEM_LIMITATION = ("This is a rule firing on recorded facts, not a forecast: it says what these facts "
                   "could lead to, not what will happen.")

#: Per-item confidence field. A sentence, deliberately, so no UI can render it as a percentage.
ITEM_CONFIDENCE = "Rule fired on recorded facts; no probability or confidence score is claimed."

#: Fallbacks for ``config/taskcentre.yaml`` -> ``foresight``. The file is the source of truth.
DEFAULTS: dict[str, Any] = {
    "method_version": METHOD_VERSION,
    "max_items": 50,
    "fatigue": {"elevated_likelihood": "elevated", "high_likelihood": "high"},
    "proximity": {"window_s": 3600, "min_events": 2, "high_events": 3},
    "protection": {"heartbeat_stale_s": 900,
                   "degraded_states": ["degraded", "off", "fault", "disabled"]},
    "unacknowledged_incident": {"after_s": 300, "high_after_s": 900},
    "review_backlog": {"min_open": 3, "high_open": 6, "stale_after_s": 86400},
    "tasks": {"at_risk_margin_s": 1800, "overdue_grace_s": 0},
    "machine_faults": {"window_s": 21600, "min_events": 2, "high_events": 4},
}


def config() -> dict[str, Any]:
    """The ``foresight`` block from ``config/taskcentre.yaml``, merged one level deep over DEFAULTS."""
    loaded = settings().get("foresight") or {}
    out: dict[str, Any] = {"method_version": loaded.get("method_version", DEFAULTS["method_version"]),
                           "max_items": int(loaded.get("max_items", DEFAULTS["max_items"]))}
    for key, spec in DEFAULTS.items():
        if isinstance(spec, dict):
            out[key] = {**spec, **(loaded.get(key) or {})}
    return out


# ---------------------------------------------------------------- small helpers
def _now_s(now: float | None) -> float:
    return time.time() if now is None else float(now)


def _fact(fact: str, value: Any, observed_at: float | None) -> dict[str, Any]:
    """One line of evidence: what was recorded, its value, and when it was observed (raw + GMT)."""
    return {"fact": fact, "value": value, "observed_at": observed_at,
            "observed_at_gmt": gmt_iso(observed_at)}


def _person(user: UserRow | None) -> dict[str, Any] | None:
    """Just enough to name somebody in the register (never a password hash, never a judgement)."""
    if user is None:
        return None
    return {"user_id": user.user_id, "name": user.name, "role": user.role,
            "supervisor_id": user.supervisor_id, "machine_id": user.machine_id}


def _action(action: str, label: str, owner_role: str, risk_id: str, *,
            owner_user_ids: Sequence[str] = (), detail: str = "") -> dict[str, Any]:
    """One suggested next step. ``endpoint_hint`` is the endpoint that performs the routing."""
    return {"action": action, "label": label, "owner_role": owner_role,
            "owner_user_ids": list(owner_user_ids), "detail": detail,
            "endpoint_hint": f"POST /tc/admin/foresight/{risk_id}/act"}


def _item(*, risk_id: str, kind: str, rule_id: str, title: str, what_could_happen: str,
          likelihood: str, basis: list[dict[str, Any]], operators: list[dict[str, Any]],
          machines: list[str], recommended_actions: list[dict[str, Any]], explanation: str,
          thresholds: dict[str, Any], observed_at: float | None,
          notify_user_ids: Sequence[str] = (), ticket_id: str | None = None,
          incident_id: str | None = None) -> dict[str, Any]:
    """Assemble one register entry in the shape the admin view renders verbatim."""
    return {
        "risk_id": risk_id, "kind": kind, "rule_id": rule_id, "title": title,
        "what_could_happen": what_could_happen, "likelihood": likelihood,
        "basis": basis, "basis_count": len(basis),
        "affected": {"operators": operators, "machines": machines},
        "recommended_actions": recommended_actions,
        "source": SOURCE, "method": METHOD,
        "note": f"{explanation} {ITEM_LIMITATION}",
        "confidence": ITEM_CONFIDENCE,
        "thresholds": thresholds,
        "observed_at": observed_at, "observed_at_gmt": gmt_iso(observed_at),
        "notify_user_ids": list(notify_user_ids),
        "ticket_id": ticket_id, "incident_id": incident_id,
    }


def _site_users(s: Session, site_id: str) -> list[UserRow]:
    stmt = select(UserRow).where(UserRow.site_id == site_id, UserRow.active.is_(True)) \
        .order_by(UserRow.user_id)
    return list(s.execute(stmt).scalars())


def _supervisor_ids(users: Iterable[UserRow]) -> list[str]:
    return [u.user_id for u in users if u.role == "supervisor"]


def _routing(user: UserRow | None, users_by_id: dict[str, UserRow], fallback: Sequence[str]) -> list[str]:
    """Who to tell about an operator: their own supervisor, else the site's supervisors."""
    if user is not None and user.supervisor_id and user.supervisor_id in users_by_id:
        return [user.supervisor_id]
    return list(fallback)


def _recipients_for(operators: Sequence[UserRow], users_by_id: dict[str, UserRow],
                    fallback: Sequence[str]) -> list[str]:
    """The supervisors behind a set of operators, in order and without repeats."""
    out: list[str] = []
    for operator in operators:
        for user_id in _routing(operator, users_by_id, fallback):
            if user_id not in out:
                out.append(user_id)
    return out or list(fallback)


def _site_machine_ids(s: Session, site_id: str, users: Sequence[UserRow]) -> list[str]:
    """Every machine id this site has a record of - registered, camera-covered, assigned or flagged."""
    ids: set[str] = set()
    for machine in s.execute(select(MachineRow).where(MachineRow.site_id == site_id)).scalars():
        ids.add(machine.machine_id)
    for camera in s.execute(select(CameraRow).where(CameraRow.site_id == site_id)).scalars():
        if camera.machine_id:
            ids.add(camera.machine_id)
    for incident in s.execute(select(TcIncidentRow).where(TcIncidentRow.site_id == site_id)).scalars():
        if incident.machine_id:
            ids.add(incident.machine_id)
    for task in s.execute(select(TcTaskRow).where(TcTaskRow.site_id == site_id)).scalars():
        if task.machine_id:
            ids.add(task.machine_id)
    for user in users:
        if user.machine_id:
            ids.add(user.machine_id)
    return sorted(ids)


def _ongoing_tasks(s: Session, site_id: str) -> list[TcTaskRow]:
    stmt = select(TcTaskRow).where(TcTaskRow.site_id == site_id, TcTaskRow.status == "ongoing") \
        .order_by(TcTaskRow.task_id)
    return list(s.execute(stmt).scalars())


def _punched_in(s: Session, user_id: str) -> PunchRow | None:
    """The person's newest punch when it is a ``start_work`` (i.e. they are on shift), else ``None``."""
    stmt = select(PunchRow).where(PunchRow.user_id == user_id).order_by(PunchRow.ts.desc()).limit(1)
    punch = s.execute(stmt).scalars().first()
    return punch if punch is not None and punch.kind == "start_work" else None


# ---------------------------------------------------------------- rule 1: operator fatigue risk
def _rule_fatigue(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                  cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Elevated/high work-schedule fatigue RISK while that person has a task under way.

    The fatigue input is ``sentinel.taskcentre.fatigue.fatigue_risk`` - a **work-schedule** risk
    indicator built from punches and declared waits. It is not a fatigue detector and this rule never
    says anybody is tired; it says the schedule is one a real fatigue-risk management system would act
    on, and that a task is running at the same time.
    """
    if _fatigue_risk is None:  # pragma: no cover - only when fatigue.py is absent
        return []
    spec = cfg["fatigue"]
    users_by_id = {u.user_id: u for u in users}
    fallback = _supervisor_ids(users)
    ongoing = {t.operator_id: t for t in _ongoing_tasks(s, site_id)}
    out: list[dict[str, Any]] = []
    for user in users:
        if user.role != "operator" or user.user_id not in ongoing:
            continue
        risk = _fatigue_risk(s, user.user_id, now=now)
        level = risk.get("level")
        if level not in ("elevated", "high"):
            continue
        task = ongoing[user.user_id]
        observed_at = float(risk.get("generated_at") or now)
        basis = [_fact(f["label"], f.get("value_text", f.get("value")), observed_at)
                 for f in risk.get("factors", []) if float(f.get("contribution") or 0.0) > 0.0]
        basis.append(_fact("Task under way while that schedule risk stands",
                           f"{task.title} ({task.task_id})", task.started_at or task.start_ts))
        basis.append(_fact("Work-schedule fatigue-risk level", f"{level} (score {risk.get('score')})",
                           observed_at))
        risk_id = f"operator_fatigue_risk.{user.user_id}"
        recipients = _recipients_for([user], users_by_id, fallback)
        out.append(_item(
            risk_id=risk_id, kind="operator_fatigue_risk", rule_id="fatigue_risk_with_ongoing_task",
            title=f"{user.name} is on a {level} work-schedule fatigue risk with a task under way",
            what_could_happen=("Reaction time may be reduced, which raises the chance of a contact "
                               "with a person or object, or of overrunning a movement."),
            likelihood=str(spec["high_likelihood"] if level == "high" else spec["elevated_likelihood"]),
            basis=basis, operators=[_person(user)],
            machines=[m for m in (task.machine_id or user.machine_id,) if m],
            recommended_actions=[
                _action("schedule_break_now", "Ask the supervisor to schedule a break now", "supervisor",
                        risk_id, owner_user_ids=recipients,
                        detail=str(risk.get("recommendation") or "")),
                _action("check_in_with_operator",
                        "Supervisor checks in with the operator before the next movement", "supervisor",
                        risk_id, owner_user_ids=recipients)],
            explanation=("Built from this person's own punch and declared-wait records, which measure "
                         "their work schedule and not them: nothing here observes, measures or "
                         "diagnoses fatigue in a person."),
            thresholds={"levels": risk.get("level_thresholds"), "break_policy": risk.get("break_policy"),
                        "fatigue_method_version": risk.get("method_version")},
            observed_at=observed_at, notify_user_ids=recipients))
    return out


# ---------------------------------------------------------------- rule 2: repeated proximity events
def _rule_proximity(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                    cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Several person-near-machine events recorded on one machine inside the window."""
    spec = cfg["proximity"]
    window_s, min_events, high_events = (float(spec["window_s"]), int(spec["min_events"]),
                                         int(spec["high_events"]))
    users_by_id = {u.user_id: u for u in users}
    fallback = _supervisor_ids(users)
    stmt = select(TcIncidentRow).where(TcIncidentRow.site_id == site_id,
                                       TcIncidentRow.ts >= now - window_s).order_by(TcIncidentRow.ts)
    by_machine: dict[str, list[TcIncidentRow]] = {}
    for incident in s.execute(stmt).scalars():
        if is_proximity_kind(incident.kind):
            by_machine.setdefault(incident.machine_id, []).append(incident)

    out: list[dict[str, Any]] = []
    for machine_id, events in sorted(by_machine.items()):
        if len(events) < min_events:
            continue
        operators = [u for u in users if u.role == "operator" and u.machine_id == machine_id]
        latest = events[-1]
        basis = [_fact(f"Proximity event recorded on {machine_id}",
                       f"{e.kind} ({e.detail or 'no detail recorded'})", e.ts) for e in events]
        basis.append(_fact("Events inside the window",
                           f"{len(events)} in {window_s / 60.0:.0f} min (threshold {min_events})",
                           latest.ts))
        risk_id = f"repeated_proximity.{machine_id}"
        recipients = _recipients_for(operators, users_by_id, fallback)
        out.append(_item(
            risk_id=risk_id, kind="repeated_proximity", rule_id="repeated_proximity_events_on_machine",
            title=f"{len(events)} proximity events on {machine_id} in the last "
                  f"{window_s / 60.0:.0f} min",
            what_could_happen=("Struck-by risk in the loading zone: people are repeatedly ending up "
                               "close to a machine that is working."),
            likelihood="high" if len(events) >= high_events else "elevated",
            basis=basis, operators=[_person(u) for u in operators], machines=[machine_id],
            recommended_actions=[
                _action("post_spotter", f"Post a spotter for {machine_id}", "supervisor", risk_id,
                        owner_user_ids=recipients),
                _action("set_exclusion_zone", "Set an exclusion zone around the working radius",
                        "supervisor", risk_id, owner_user_ids=recipients),
                _action("stop_loading", "Stop loading until the zone is clear and briefed", "supervisor",
                        risk_id, owner_user_ids=recipients)],
            explanation=(f"Built from {len(events)} recorded proximity incidents on this machine. The "
                         "rule counts events; it does not know who was near the machine, why, or "
                         "whether anybody was ever actually at risk."),
            thresholds={"window_s": window_s, "min_events": min_events, "high_events": high_events},
            observed_at=latest.ts, notify_user_ids=recipients, incident_id=latest.incident_id))
    return out


# ---------------------------------------------------------------- rule 3: degraded protection
def _machine_active(machine_id: str, ongoing: Sequence[TcTaskRow],
                    punched_in: dict[str, PunchRow]) -> dict[str, Any] | None:
    """The recorded fact saying this machine is being worked right now, or ``None`` if none does."""
    for task in ongoing:
        if task.machine_id == machine_id:
            return _fact("Task under way on this machine", f"{task.title} ({task.task_id})",
                         task.started_at or task.start_ts)
    for user_id, punch in sorted(punched_in.items()):
        return _fact("Operator assigned to this machine is punched in", f"{user_id} started work",
                     punch.ts)
    return None


def _rule_protection(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                     cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Protection recorded as degraded, or no recent safety heartbeat, while the machine is worked.

    The only safety heartbeat this prototype records is the camera's ``last_frame_ts`` - the frame
    that would feed a proximity advisory. No frame inside ``heartbeat_stale_s`` means the advisory is
    not running; it does not mean the machine is unsafe, and the wording says so.
    """
    spec = cfg["protection"]
    stale_s = float(spec["heartbeat_stale_s"])
    degraded_states = {str(x).lower() for x in spec["degraded_states"]}
    users_by_id = {u.user_id: u for u in users}
    fallback = _supervisor_ids(users)
    ongoing = _ongoing_tasks(s, site_id)
    machines = {m.machine_id: m for m in
                s.execute(select(MachineRow).where(MachineRow.site_id == site_id)).scalars()}
    cameras: dict[str, list[CameraRow]] = {}
    for camera in s.execute(select(CameraRow).where(CameraRow.site_id == site_id)).scalars():
        if camera.machine_id:
            cameras.setdefault(camera.machine_id, []).append(camera)

    out: list[dict[str, Any]] = []
    for machine_id in _site_machine_ids(s, site_id, users):
        operators = [u for u in users if u.role == "operator" and u.machine_id == machine_id]
        punched = {u.user_id: p for u in operators if (p := _punched_in(s, u.user_id)) is not None}
        active_fact = _machine_active(machine_id, ongoing, punched)
        if active_fact is None:
            continue

        machine = machines.get(machine_id)
        state = str(((machine.meta or {}).get("protection_state") if machine else "") or "").lower()
        degraded = state in degraded_states
        machine_cameras = cameras.get(machine_id, [])
        frames = [c.last_frame_ts for c in machine_cameras if c.last_frame_ts is not None]
        newest_frame = max(frames) if frames else None
        heartbeat_stale = bool(machine_cameras) and (newest_frame is None
                                                     or now - newest_frame > stale_s)
        if not degraded and not heartbeat_stale:
            continue

        basis = [active_fact]
        if degraded:
            basis.append(_fact(f"Protection state recorded for {machine_id}", state, now))
        if heartbeat_stale:
            basis.append(_fact(
                f"Newest safety-camera frame recorded for {machine_id}",
                "none ever recorded" if newest_frame is None
                else f"{(now - newest_frame) / 60.0:.0f} min old (stale after {stale_s / 60.0:.0f} min)",
                newest_frame))
        risk_id = f"protection_degraded.{machine_id}"
        recipients = _recipients_for(operators, users_by_id, fallback)
        out.append(_item(
            risk_id=risk_id, kind="protection_degraded",
            rule_id="protection_degraded_or_stale_heartbeat_while_active",
            title=f"Safety advisories may not be running on {machine_id}, which is being worked",
            what_could_happen=("Safety advisories are not running on this machine, so somebody "
                               "entering the working radius may never be flagged to anybody."),
            likelihood="high" if degraded else "elevated",
            basis=basis, operators=[_person(u) for u in operators], machines=[machine_id],
            recommended_actions=[
                _action("check_edge_service",
                        "Check the edge service on this machine before work continues", "supervisor",
                        risk_id, owner_user_ids=recipients),
                _action("work_with_spotter",
                        "Work to the degraded-protection procedure (spotter) until it is restored",
                        "supervisor", risk_id, owner_user_ids=recipients)],
            explanation=("Built from the machine's recorded protection state and the timestamp of the "
                         "newest camera frame we hold. A missing heartbeat means we have not heard "
                         "from the service, which is not the same as the machine being unsafe."),
            thresholds={"heartbeat_stale_s": stale_s, "degraded_states": sorted(degraded_states)},
            observed_at=newest_frame if newest_frame is not None else now,
            notify_user_ids=recipients))
    return out


# ---------------------------------------------------------------- rule 4: unacknowledged incident
def _rule_unacknowledged(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                         cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """A critical incident nobody has acknowledged after the configured wait."""
    spec = cfg["unacknowledged_incident"]
    after_s, high_after_s = float(spec["after_s"]), float(spec["high_after_s"])
    fallback = _supervisor_ids(users)
    stmt = select(TcIncidentRow).where(TcIncidentRow.site_id == site_id,
                                       TcIncidentRow.acknowledged_at.is_(None)) \
        .order_by(TcIncidentRow.ts.desc())
    out: list[dict[str, Any]] = []
    for incident in s.execute(stmt).scalars():
        if incident.severity not in ("critical", "high"):
            continue
        age = now - incident.ts
        if age < after_s:
            continue
        notified = list(incident.notified_user_ids or [])
        basis = [
            _fact(f"{incident.severity} incident recorded on {incident.machine_id}",
                  f"{incident.kind}: {incident.detail or 'no detail recorded'}", incident.ts),
            _fact("Acknowledgement recorded", "none", incident.ts),
            _fact("Time since the alert was raised",
                  f"{age / 60.0:.0f} min (escalate after {after_s / 60.0:.0f} min)", incident.ts),
            _fact("Dispatch result", incident.dispatch_status, incident.ts),
            _fact("People notified", f"{len(notified)} notified: {', '.join(notified) or 'nobody'}",
                  incident.ts)]
        risk_id = f"unacknowledged_incident.{incident.incident_id}"
        out.append(_item(
            risk_id=risk_id, kind="unacknowledged_incident",
            rule_id="critical_incident_unacknowledged_past_threshold",
            title=f"No acknowledgement on the {incident.kind} alert for {incident.machine_id} after "
                  f"{age / 60.0:.0f} min",
            what_could_happen=("Nobody has taken the critical alert, so the situation may be running "
                               "with no one attending it."),
            likelihood="high" if age >= high_after_s else "elevated",
            basis=basis, operators=[], machines=[incident.machine_id],
            recommended_actions=[
                _action("escalate_to_supervisor", "Escalate to the site supervisors now", "supervisor",
                        risk_id, owner_user_ids=fallback),
                _action("assign_manually", "Assign somebody to the incident manually", "admin", risk_id,
                        owner_user_ids=fallback)],
            explanation=("Built from the incident row and its acknowledgement field. The rule only "
                         "knows that nobody pressed acknowledge - somebody may already be attending it "
                         "without having done so."),
            thresholds={"after_s": after_s, "high_after_s": high_after_s},
            observed_at=incident.ts, notify_user_ids=list(fallback),
            incident_id=incident.incident_id))
    return out


# ---------------------------------------------------------------- rule 5: review backlog
def _rule_review_backlog(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                         cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Open flags piling up in one supervisor's review queue."""
    spec = cfg["review_backlog"]
    min_open, high_open = int(spec["min_open"]), int(spec["high_open"])
    stale_after_s = float(spec["stale_after_s"])
    users_by_id = {u.user_id: u for u in users}
    stmt = select(TicketRow).where(TicketRow.site_id == site_id, TicketRow.status == "open",
                                   TicketRow.owner_role == "supervisor").order_by(TicketRow.created_at)
    by_owner: dict[str, list[TicketRow]] = {}
    for ticket in s.execute(stmt).scalars():
        by_owner.setdefault(ticket.owner_user_id or "", []).append(ticket)

    out: list[dict[str, Any]] = []
    for owner_id, tickets in sorted(by_owner.items()):
        if len(tickets) < min_open:
            continue
        supervisor = users_by_id.get(owner_id)
        oldest, newest = tickets[0], tickets[-1]
        stale = (now - oldest.created_at) > stale_after_s
        who = supervisor.name if supervisor is not None else "an unassigned queue"
        basis = [_fact(f"Open flag awaiting review ({t.kind})", t.title, t.created_at) for t in tickets]
        basis.append(_fact("Open flags in this queue", f"{len(tickets)} (threshold {min_open})",
                           newest.created_at))
        basis.append(_fact("Age of the oldest open flag",
                           f"{(now - oldest.created_at) / 3600.0:.1f} h "
                           f"(stale after {stale_after_s / 3600.0:.0f} h)", oldest.created_at))
        risk_id = f"review_backlog.{owner_id or 'unassigned'}"
        recipients = [uid for uid in ([owner_id] if owner_id else _supervisor_ids(users)) if uid]
        out.append(_item(
            risk_id=risk_id, kind="review_backlog", rule_id="unreviewed_flag_backlog_per_supervisor",
            title=f"{len(tickets)} flags are waiting for review by {who}",
            what_could_happen=("Issues may be missed: flags nobody reads cannot lead to anything being "
                               "fixed, and the next one is easier to ignore."),
            likelihood="elevated" if (len(tickets) >= high_open or stale) else "moderate",
            basis=basis, operators=[_person(supervisor)] if supervisor is not None else [],
            machines=sorted({t.machine_id for t in tickets if t.machine_id}),
            recommended_actions=[
                _action("clear_review_queue", "Clear the review queue at /tc/sup/review", "supervisor",
                        risk_id, owner_user_ids=recipients),
                _action("reassign_queue", "Reassign the queue if this supervisor is unavailable",
                        "admin", risk_id, owner_user_ids=recipients)],
            explanation=("Built from the open tickets in this queue and their creation times. A "
                         "backlog says flags are unread; it says nothing about whether any of them "
                         "turn out to matter."),
            thresholds={"min_open": min_open, "high_open": high_open, "stale_after_s": stale_after_s},
            observed_at=newest.created_at, notify_user_ids=recipients, ticket_id=oldest.ticket_id))
    return out


# ---------------------------------------------------------------- rule 6: tasks vs expected finish
def _rule_tasks(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Open work that has passed, or is about to pass, its expected finish time."""
    spec = cfg["tasks"]
    margin_s, grace_s = float(spec["at_risk_margin_s"]), float(spec["overdue_grace_s"])
    users_by_id = {u.user_id: u for u in users}
    fallback = _supervisor_ids(users)
    stmt = select(TcTaskRow).where(TcTaskRow.site_id == site_id,
                                   TcTaskRow.status.in_(("pending", "ongoing"))) \
        .order_by(TcTaskRow.expected_finish_ts)
    by_operator: dict[str, list[tuple[TcTaskRow, str]]] = {}
    for task in s.execute(stmt).scalars():
        remaining = task.expected_finish_ts - now
        if remaining < -grace_s:
            state = "overdue"
        elif remaining <= margin_s:
            state = "at_risk"
        else:
            continue
        by_operator.setdefault(task.operator_id, []).append((task, state))

    out: list[dict[str, Any]] = []
    for operator_id, rows in sorted(by_operator.items()):
        operator = users_by_id.get(operator_id)
        overdue = [t for t, state in rows if state == "overdue"]
        basis = [_fact(f"Task {state.replace('_', ' ')} against its expected finish",
                       f"{t.title} ({t.task_id}), expected {gmt_iso(t.expected_finish_ts)} GMT, "
                       f"status {t.status}", t.expected_finish_ts) for t, state in rows]
        basis.append(_fact("Open tasks past or near their expected finish",
                           f"{len(overdue)} overdue, {len(rows) - len(overdue)} within "
                           f"{margin_s / 60.0:.0f} min", now))
        who = operator.name if operator is not None else operator_id
        risk_id = f"task_schedule.{operator_id}"
        recipients = _recipients_for([operator] if operator is not None else [], users_by_id, fallback)
        out.append(_item(
            risk_id=risk_id, kind="task_schedule", rule_id="tasks_overdue_or_at_risk_vs_expected_finish",
            title=f"{len(rows)} of {who}'s tasks will not finish as planned",
            what_could_happen=("Work will not finish this shift, so it carries over or gets rushed at "
                               "the end of the shift."),
            likelihood="elevated" if overdue else "moderate",
            basis=basis, operators=[_person(operator)] if operator is not None else [],
            machines=sorted({t.machine_id for t, _ in rows if t.machine_id}),
            recommended_actions=[
                _action("replan_work", "Re-plan the remaining work or move the expected finish",
                        "supervisor", risk_id, owner_user_ids=recipients),
                _action("add_resource", "Add a second operator or machine to the remaining work",
                        "supervisor", risk_id, owner_user_ids=recipients)],
            explanation=("Built from each task's recorded expected finish time and current status. The "
                         "rule compares two timestamps; it has no estimate of how much work is "
                         "actually left."),
            thresholds={"at_risk_margin_s": margin_s, "overdue_grace_s": grace_s},
            observed_at=min(t.expected_finish_ts for t, _ in rows), notify_user_ids=recipients))
    return out


# ---------------------------------------------------------------- rule 7: machine health
def _rule_machine_faults(s: Session, site_id: str, users: Sequence[UserRow], *, now: float,
                         cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Fault codes recorded against a machine, or repeated non-proximity sensor events."""
    spec = cfg["machine_faults"]
    window_s, min_events, high_events = (float(spec["window_s"]), int(spec["min_events"]),
                                         int(spec["high_events"]))
    fallback = _supervisor_ids(users)
    machine_ids = set(_site_machine_ids(s, site_id, users))
    machines = {m.machine_id: m for m in
                s.execute(select(MachineRow).where(MachineRow.site_id == site_id)).scalars()}

    stmt = select(SimEventRow).where(SimEventRow.kind == "machine_sensor",
                                     SimEventRow.ts >= now - window_s).order_by(SimEventRow.ts)
    by_machine: dict[str, list[SimEventRow]] = {}
    for event in s.execute(stmt).scalars():
        payload_kind = str((event.payload or {}).get("kind") or "")
        if event.machine_id in machine_ids and not is_proximity_kind(payload_kind):
            by_machine.setdefault(event.machine_id, []).append(event)

    out: list[dict[str, Any]] = []
    for machine_id in sorted(machine_ids):
        events = by_machine.get(machine_id, [])
        machine = machines.get(machine_id)
        faults = list((machine.meta or {}).get("fault_codes") or []) if machine is not None else []
        if len(events) < min_events and not faults:
            continue
        basis = [_fact(f"Sensor event recorded on {machine_id}",
                       str((e.payload or {}).get("kind") or "machine_sensor"), e.ts) for e in events]
        if faults:
            basis.append(_fact(f"Fault codes recorded against {machine_id}",
                               ", ".join(map(str, faults)), now))
        if events:
            basis.append(_fact("Sensor events inside the window",
                               f"{len(events)} in {window_s / 3600.0:.0f} h (threshold {min_events})",
                               events[-1].ts))
        risk_id = f"machine_health.{machine_id}"
        out.append(_item(
            risk_id=risk_id, kind="machine_health", rule_id="fault_codes_or_repeated_sensor_events",
            title=f"{machine_id} keeps reporting problems",
            what_could_happen=("Unplanned downtime is likely, and work planned on this machine may "
                               "stop mid-shift."),
            likelihood="elevated" if (len(events) >= high_events or faults) else "moderate",
            basis=basis,
            operators=[_person(u) for u in users
                       if u.role == "operator" and u.machine_id == machine_id],
            machines=[machine_id],
            recommended_actions=[
                _action("raise_maintenance", "Raise a maintenance check on this machine", "supervisor",
                        risk_id, owner_user_ids=fallback),
                _action("replan_around_machine", "Re-plan work that depends on this machine",
                        "supervisor", risk_id, owner_user_ids=fallback)],
            explanation=("Built from the machine's recorded fault codes and its recent sensor events. "
                         "The rule counts what was reported; it does not diagnose the machine."),
            thresholds={"window_s": window_s, "min_events": min_events, "high_events": high_events},
            observed_at=events[-1].ts if events else now, notify_user_ids=list(fallback)))
    return out


#: Every rule, in evaluation order. Ranking happens afterwards, so the order here is cosmetic.
RULES: tuple[Any, ...] = (_rule_fatigue, _rule_proximity, _rule_protection, _rule_unacknowledged,
                          _rule_review_backlog, _rule_tasks, _rule_machine_faults)


# ---------------------------------------------------------------- the register
def _rank_key(item: dict[str, Any]) -> tuple[int, float, str]:
    """Strongest likelihood first, then most recently observed, then risk_id for a stable order."""
    likelihood = item.get("likelihood", "low")
    index = LIKELIHOODS.index(likelihood) if likelihood in LIKELIHOODS else 0
    return (-index, -float(item.get("observed_at") or 0.0), item["risk_id"])


def site_foresight(s: Session, site_id: str, *, now: float | None = None) -> dict[str, Any]:
    """The ranked risk register for one site, built only from facts already recorded.

    Each rule reads rows this system wrote and, when its configured threshold is crossed, produces one
    item naming the facts it fired on, what could plausibly follow, and who should act. A rule that
    finds nothing produces nothing - silence here means no rule fired, never that the site is safe.

    Returns ``{generated_at, generated_at_gmt, site_id, items, counts, method, caveats, ...}``. See
    :data:`HONESTY_NOTE` for the sentence that must be shown wherever this is rendered.
    """
    now = _now_s(now)
    cfg = config()
    users = _site_users(s, site_id)

    items: list[dict[str, Any]] = []
    rules_ran: list[dict[str, Any]] = []
    for rule in RULES:
        produced = rule(s, site_id, users, now=now, cfg=cfg)
        items.extend(produced)
        rules_ran.append({"rule": rule.__name__.removeprefix("_rule_"), "fired": len(produced),
                          "description": (rule.__doc__ or "").strip().splitlines()[0]})

    items.sort(key=_rank_key)
    items = items[:int(cfg["max_items"])]

    by_likelihood = {level: 0 for level in LIKELIHOODS}
    by_kind: dict[str, int] = {}
    for item in items:
        by_likelihood[item["likelihood"]] = by_likelihood.get(item["likelihood"], 0) + 1
        by_kind[item["kind"]] = by_kind.get(item["kind"], 0) + 1

    return {
        "generated_at": now, "generated_at_gmt": gmt_iso(now),
        "site_id": site_id,
        "items": items,
        "counts": {"total": len(items), "by_likelihood": by_likelihood, "by_kind": by_kind},
        "method": METHOD,
        "method_version": cfg["method_version"],
        "source": SOURCE,
        "note": HONESTY_NOTE,
        "caveats": list(CAVEATS),
        "likelihood_order": list(LIKELIHOODS),
        "rules": rules_ran,
        "thresholds": {k: v for k, v in cfg.items() if isinstance(v, dict)},
        "act_endpoint": "POST /tc/admin/foresight/{risk_id}/act",
        "controls_machinery": False,
    }
