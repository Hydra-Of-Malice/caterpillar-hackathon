"""The replaceable boundary between a detector and the Task Centre brain.

Nothing in this prototype detects anything. Every observation the brain reacts to arrives as one of
the typed events below, carrying ``source="SIMULATED"``, and is produced by a ``Simulated*`` source
that follows a fixed script - same input, same output, every time.

**That is the whole point of this module.** A real detector (a CAN-bus/telematics adapter, a vision
model on a site camera, a wearable or in-cab alertness monitor) is wired in by implementing the
matching ``Protocol`` and publishing *the same typed event* with a different ``source``. The brain,
the tickets, the notifications, the API and the UI do not change - only the class that produces the
event does. Until that happens, nothing here may be presented as validated detection.

Layout::

    MachineSensorEvent  <- MachineSensorSource  <- SimulatedMachineSensorSource   (real: telematics)
    CameraObservation   <- CameraSource         <- SimulatedCameraSource          (real: vision model)
    FatigueIndication   <- FatigueSource        <- SimulatedFatigueSource         (real: alertness monitor)
    LocationUpdate      <- reported by the person's browser (see routes_auth POST /tc/location)
"""
from __future__ import annotations

import time
from typing import Any, Protocol, Sequence, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from sentinel.shared.schemas import new_id
from sentinel.store.taskcentre_models import SimEventRow

#: Marks everything produced by a source in this module. A real detector publishes its own name
#: (e.g. "CAT-TELEMATICS", "VISION-v2") so a row's provenance is always visible in the UI.
SIMULATED = "SIMULATED"

#: Camera contexts that explain why a machine is standing still. See brain.handle_camera_observation.
EXPLAINED_CONTEXTS = ("waiting_for_truck", "machine_paused", "expected_delay")


# ---------------------------------------------------------------- typed events
class SimEvent(BaseModel):
    """Common shape: when it happened and who says so."""
    model_config = ConfigDict(extra="forbid")

    ts: float = Field(default_factory=time.time, description="UTC seconds (displayed as GMT)")
    source: str = Field(default=SIMULATED, description="SIMULATED, or a real detector name")


class MachineSensorEvent(SimEvent):
    """A machine reporting a critical condition (rollover risk, pressure loss, overheat, ...).

    ``lat``/``lon`` are the position of the machine. Without them the brain cannot work out who is
    nearest, and says so rather than guessing - see ``brain.handle_machine_sensor``.
    """
    machine_id: str
    kind: str = Field(description="sensor condition, e.g. hydraulic_pressure_loss")
    severity: str = "critical"
    lat: float | None = None
    lon: float | None = None
    detail: str = ""
    site_id: str | None = None


class CameraObservation(SimEvent):
    """A camera reporting how long a machine has been still, and any context it knows about.

    ``context`` is the honest half of this event: a detector that cannot explain a pause reports
    ``"unknown"``, and one that can (the haul truck has not arrived) reports why, so the brain can
    suppress the flag instead of accusing somebody of idling.
    """
    camera_id: str
    operator_id: str
    idle_seconds: float = Field(ge=0.0)
    context: str = Field(default="unknown", description="unknown, or one of EXPLAINED_CONTEXTS")
    clip_ref: str | None = Field(default=None, description="clip reference; None -> UI placeholder")
    timeline: list[dict[str, Any]] = Field(default_factory=list,
                                           description="[{ts, note}] observation trail")
    note: str = ""


class FatigueIndication(SimEvent):
    """An *indication* that somebody may be tired. Never a diagnosis, never a medical assessment."""
    operator_id: str
    indicator: str = Field(default="reduced_alertness_indication",
                           description="what was observed, e.g. long_shift_without_break")
    confidence: float | None = Field(default=None, ge=0.0, le=1.0,
                                     description="the confidence the source reports, if any")
    note: str = ""


class LocationUpdate(SimEvent):
    """A reported position. An indication of presence, never proof.

    In the running system these come from the browser via ``POST /tc/location``; the demo scenarios
    publish them with ``source="simulated"`` so a scenario can stage a worksite.
    """
    user_id: str
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None


AnySimEvent = MachineSensorEvent | CameraObservation | FatigueIndication | LocationUpdate

_EVENT_KIND: dict[type[SimEvent], str] = {
    MachineSensorEvent: "machine_sensor",
    CameraObservation: "camera_observation",
    FatigueIndication: "fatigue",
    LocationUpdate: "location",
}


def event_kind(event: AnySimEvent) -> str:
    """The ``SimEventRow.kind`` for a typed event."""
    return _EVENT_KIND[type(event)]


# ---------------------------------------------------------------- source protocols
@runtime_checkable
class MachineSensorSource(Protocol):
    """Publishes :class:`MachineSensorEvent`. Implement this to plug in real machine telemetry."""

    name: str

    def poll(self, now: float | None = None) -> Sequence[MachineSensorEvent]:
        """Events observed since the last poll (possibly empty). Never blocks."""


@runtime_checkable
class CameraSource(Protocol):
    """Publishes :class:`CameraObservation`. Implement this to plug in a real vision model."""

    name: str

    def poll(self, now: float | None = None) -> Sequence[CameraObservation]:
        """Observations since the last poll (possibly empty). Never blocks."""


@runtime_checkable
class FatigueSource(Protocol):
    """Publishes :class:`FatigueIndication`. Implement this to plug in a real alertness monitor."""

    name: str

    def poll(self, now: float | None = None) -> Sequence[FatigueIndication]:
        """Indications since the last poll (possibly empty). Never blocks."""


class _QueueSource:
    """Shared plumbing: a source whose ``poll`` drains a queue the demo filled explicitly."""

    name = SIMULATED

    def __init__(self) -> None:
        self._queue: list[Any] = []
        self._n = 0

    def queue(self, event: Any) -> Any:
        """Hold an event for the next :meth:`poll` (the scenarios publish directly instead)."""
        self._queue.append(event)
        return event

    def poll(self, now: float | None = None) -> list[Any]:
        """Drain and return everything queued so far."""
        drained, self._queue = self._queue, []
        return drained


# ---------------------------------------------------------------- simulated implementations
class SimulatedMachineSensorSource(_QueueSource):
    """Deterministic stand-in for machine telemetry.

    ``emit`` without a ``kind`` walks :data:`CATALOGUE` in order, so a demo run is reproducible and a
    test never depends on randomness. There is no model here and no signal processing: it returns
    what it was asked for, labelled SIMULATED.
    """

    #: (kind, reviewer-facing detail) - fictional conditions for a fictional demo fleet.
    CATALOGUE: tuple[tuple[str, str], ...] = (
        ("hydraulic_pressure_loss", "Hydraulic pressure dropped sharply; machine stopped itself."),
        ("engine_overheat", "Coolant temperature above the shutdown threshold."),
        ("rollover_risk", "Sustained tilt beyond the stability envelope."),
    )

    def emit(self, *, machine_id: str, kind: str | None = None, lat: float | None = None,
             lon: float | None = None, severity: str = "critical", detail: str | None = None,
             site_id: str | None = None, ts: float | None = None) -> MachineSensorEvent:
        """Build one event. ``kind=None`` takes the next entry from :data:`CATALOGUE`."""
        index = self._n % len(self.CATALOGUE)
        self._n += 1
        cat_kind, cat_detail = self.CATALOGUE[index]
        return MachineSensorEvent(ts=time.time() if ts is None else ts, source=SIMULATED,
                                  machine_id=machine_id, kind=kind or cat_kind, severity=severity,
                                  lat=lat, lon=lon, detail=detail if detail is not None else cat_detail,
                                  site_id=site_id)


class SimulatedCameraSource(_QueueSource):
    """Deterministic stand-in for camera idle analysis.

    It does not look at pixels. The caller states the idle duration and the context; this class only
    packages them with a reproducible observation timeline and a clip *placeholder* - there is no
    footage, and the UI must say so.
    """

    def observe(self, *, camera_id: str, operator_id: str, idle_seconds: float,
                context: str = "unknown", note: str = "", ts: float | None = None) -> CameraObservation:
        """Build one observation with a derived timeline and a placeholder clip reference."""
        ts = time.time() if ts is None else ts
        obs = CameraObservation(ts=ts, source=SIMULATED, camera_id=camera_id, operator_id=operator_id,
                                idle_seconds=float(idle_seconds), context=context, note=note,
                                clip_ref=clip_placeholder(camera_id, ts))
        return obs.model_copy(update={"timeline": observation_timeline(obs)})


class SimulatedFatigueSource(_QueueSource):
    """Deterministic stand-in for an alertness monitor.

    It measures nothing. It exists so the Task Centre can show what it *would* do with such a signal:
    prompt the person to take a break and tell their supervisor, both labelled SIMULATED.
    """

    def indicate(self, *, operator_id: str, indicator: str = "reduced_alertness_indication",
                 confidence: float | None = None, note: str = "",
                 ts: float | None = None) -> FatigueIndication:
        """Build one indication."""
        return FatigueIndication(ts=time.time() if ts is None else ts, source=SIMULATED,
                                 operator_id=operator_id, indicator=indicator, confidence=confidence,
                                 note=note)


# ---------------------------------------------------------------- evidence helpers
def clip_placeholder(camera_id: str, ts: float) -> str:
    """A reference to footage that does not exist. The UI renders it as a labelled placeholder."""
    return f"placeholder://clip/{camera_id}/{int(ts)}"


def observation_timeline(obs: CameraObservation) -> list[dict[str, Any]]:
    """A three-point ``[{ts, note}]`` trail behind an observation, so a reviewer sees its shape.

    Derived arithmetically from ``idle_seconds`` - it is a restatement of the observation, not extra
    evidence, and the wording says so.
    """
    if obs.timeline:
        return list(obs.timeline)
    start = obs.ts - obs.idle_seconds
    minutes = obs.idle_seconds / 60.0
    context = "no context reported" if obs.context == "unknown" else f"context reported: {obs.context}"
    return [
        {"ts": start, "note": "Machine last observed moving."},
        {"ts": start + obs.idle_seconds / 2.0, "note": f"Still stationary; {context}."},
        {"ts": obs.ts, "note": f"Stationary for {minutes:.0f} min at this observation."},
    ]


# ---------------------------------------------------------------- persistence
def record_sim_event(s: Session, event: AnySimEvent) -> SimEventRow:
    """Persist the raw typed event, before anything is decided about it.

    Kept whatever the brain then does, so a reviewer can always see the observation a ticket came
    from - and so swapping in a real detector changes only ``source`` and the payload provenance.
    """
    row = SimEventRow(event_id=new_id("sev"), ts=event.ts, kind=event_kind(event), source=event.source,
                      machine_id=getattr(event, "machine_id", None),
                      camera_id=getattr(event, "camera_id", None),
                      user_id=getattr(event, "operator_id", None) or getattr(event, "user_id", None),
                      payload=event.model_dump())
    s.add(row)
    s.flush()
    return row


def mark_sim_event(row: SimEventRow | None, *, ticket_id: str | None = None,
                   incident_id: str | None = None, suppressed_reason: str | None = None,
                   outcome: str | None = None) -> None:
    """Link what an event produced back onto its raw row (and why nothing was produced)."""
    if row is None:
        return
    if ticket_id is not None:
        row.produced_ticket_id = ticket_id
    if incident_id is not None:
        row.produced_incident_id = incident_id
    payload = dict(row.payload or {})
    if suppressed_reason is not None:
        payload["suppressed_reason"] = suppressed_reason
    if outcome is not None:
        payload["outcome"] = outcome
    row.payload = payload
