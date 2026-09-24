"""Task Centre tables: worksite users/roles, geofences, punches, assignable tasks, chat,
tickets with review decisions, incidents, notifications, training content and simulated events.

Kept in their own module (all `tc_` prefixed) so the existing copilot tables are untouched.
Importing this module registers the tables on the shared ``Base``; ``sentinel.store.db`` imports it
so ``Database(...)`` creates them. Role permissions are enforced in the API, never only in the UI.
All timestamps are UTC seconds (displayed as GMT).
"""
from __future__ import annotations

import time

from sqlalchemy import JSON, Boolean, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from sentinel.store.models import Base


def _now() -> float:
    return time.time()


# ---------------------------------------------------------------- people & access
class UserRow(Base):
    """A person who signs in. ``role`` is admin | supervisor | operator."""
    __tablename__ = "tc_user"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)        # PBKDF2-HMAC-SHA256, salted
    role: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    site_id: Mapped[str] = mapped_column(String, index=True)
    supervisor_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)   # operators only
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[float] = mapped_column(Float, default=_now)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class SessionRow(Base):
    """Opaque bearer token issued at login (demo auth: no refresh tokens)."""
    __tablename__ = "tc_session"
    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[float] = mapped_column(Float, default=_now)
    expires_at: Mapped[float] = mapped_column(Float)
    login_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    login_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    login_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    login_geofence: Mapped[str] = mapped_column(String, default="unverified")   # inside|outside|unverified


# ---------------------------------------------------------------- site, geofence, cameras
class SiteRow(Base):
    __tablename__ = "tc_site"
    site_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class GeofenceRow(Base):
    """Circular worksite boundary; a fix worse than ``max_accuracy_m`` is 'unverified', never 'outside'."""
    __tablename__ = "tc_geofence"
    geofence_id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    center_lat: Mapped[float] = mapped_column(Float)
    center_lon: Mapped[float] = mapped_column(Float)
    radius_m: Mapped[float] = mapped_column(Float)
    max_accuracy_m: Mapped[float] = mapped_column(Float, default=100.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CameraRow(Base):
    __tablename__ = "tc_camera"
    camera_id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    label: Mapped[str] = mapped_column(String)
    stream_kind: Mapped[str] = mapped_column(String, default="simulated")   # simulated|unavailable|live
    last_frame_ts: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------- location & punches
class LocationReportRow(Base):
    """Latest known position of a person. An indication of presence, never proof."""
    __tablename__ = "tc_location_report"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    ts: Mapped[float] = mapped_column(Float, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    geofence_status: Mapped[str] = mapped_column(String, default="unverified")
    source: Mapped[str] = mapped_column(String, default="browser")   # browser|simulated|manual


class PunchRow(Base):
    """Start/Finish Work punch with the server timestamp and the location used for the decision."""
    __tablename__ = "tc_punch"
    punch_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String)                   # start_work|finish_work
    ts: Mapped[float] = mapped_column(Float, index=True)        # server UTC
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    geofence_status: Mapped[str] = mapped_column(String, default="unverified")
    geofence_id: Mapped[str | None] = mapped_column(String, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    ticket_id: Mapped[str | None] = mapped_column(String, nullable=True)   # raised when outside/unverified


# ---------------------------------------------------------------- tasks
class TcTaskRow(Base):
    """Assignable worksite task (separate from the in-cab shift TaskRow)."""
    __tablename__ = "tc_task"
    task_id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(String, index=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    supervisor_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    instructions: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String, default="")
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    priority: Mapped[str] = mapped_column(String, default="normal")             # low|normal|high|urgent
    status: Mapped[str] = mapped_column(String, default="pending", index=True)  # pending|ongoing|completed|cancelled
    start_ts: Mapped[float] = mapped_column(Float)
    expected_finish_ts: Mapped[float] = mapped_column(Float)
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    finished_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    overrun_ticket_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=_now)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class CheckpointRow(Base):
    """Checkbox (target 1) or counted target such as 0/3 (target 3)."""
    __tablename__ = "tc_checkpoint"
    checkpoint_id: Mapped[str] = mapped_column(String, primary_key=True)
    task_id: Mapped[str] = mapped_column(String, index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="checkbox")   # checkbox|counted
    target: Mapped[int] = mapped_column(Integer, default=1)
    done: Mapped[int] = mapped_column(Integer, default=0)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class TaskProgressRow(Base):
    """Progress note, delay explanation, status or checkpoint change (append-only audit trail)."""
    __tablename__ = "tc_task_progress"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[str] = mapped_column(String)
    ts: Mapped[float] = mapped_column(Float, default=_now, index=True)
    kind: Mapped[str] = mapped_column(String)      # note|delay|status|checkpoint|exception_resolved
    text: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------- chat
class ChatMessageRow(Base):
    """Two-way supervisor <-> operator chat, scoped to that pair."""
    __tablename__ = "tc_chat_message"
    message_id: Mapped[str] = mapped_column(String, primary_key=True)
    thread_key: Mapped[str] = mapped_column(String, index=True)   # "<supervisor_id>:<operator_id>"
    from_user_id: Mapped[str] = mapped_column(String)
    to_user_id: Mapped[str] = mapped_column(String)
    ts: Mapped[float] = mapped_column(Float, default=_now, index=True)
    text: Mapped[str] = mapped_column(Text)
    task_id: Mapped[str | None] = mapped_column(String, nullable=True)
    read_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    system: Mapped[bool] = mapped_column(Boolean, default=False)   # generated, e.g. confirmed-flag coaching


# ---------------------------------------------------------------- tickets & review
class TicketRow(Base):
    """Flag needing human review: geofence punch, AI idle flag, fatigue, task overrun, incident."""
    __tablename__ = "tc_ticket"
    ticket_id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String, index=True)
    severity: Mapped[str] = mapped_column(String, default="medium")             # low|medium|high|critical
    status: Mapped[str] = mapped_column(String, default="open", index=True)     # open|confirmed|dismissed|resolved
    subject_user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    owner_role: Mapped[str] = mapped_column(String, default="supervisor")
    owner_user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    title: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String, default="SIMULATED")            # SIMULATED|RULE|MANUAL
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[float] = mapped_column(Float, default=_now, index=True)
    task_id: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    incident_id: Mapped[str | None] = mapped_column(String, nullable=True)


class ReviewDecisionRow(Base):
    """A reviewer's decision on a ticket. The original event row is never overwritten."""
    __tablename__ = "tc_review_decision"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(String, index=True)
    reviewer_id: Mapped[str] = mapped_column(String)
    reviewer_role: Mapped[str] = mapped_column(String)
    decision: Mapped[str] = mapped_column(String)   # confirmed|dismissed|more_info|resolved|acknowledged
    comment: Mapped[str] = mapped_column(Text, default="")
    ts: Mapped[float] = mapped_column(Float, default=_now)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------- incidents & notifications
class TcIncidentRow(Base):
    """Critical machine situation plus the nearest-operator dispatch result."""
    __tablename__ = "tc_incident"
    incident_id: Mapped[str] = mapped_column(String, primary_key=True)
    site_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String, default="critical")
    ts: Mapped[float] = mapped_column(Float, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String, default="SIMULATED")
    nearest_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    nearest_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    dispatch_status: Mapped[str] = mapped_column(String, default="dispatched")   # dispatched|no_eligible_operator
    acknowledged_by: Mapped[str | None] = mapped_column(String, nullable=True)
    acknowledged_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    notified_user_ids: Mapped[list] = mapped_column(JSON, default=list)
    dedupe_key: Mapped[str] = mapped_column(String, index=True, default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class NotificationRow(Base):
    """Per-user notification; ``alarm`` drives the operator's audible/visual critical alarm."""
    __tablename__ = "tc_notification"
    notification_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    ts: Mapped[float] = mapped_column(Float, default=_now, index=True)
    kind: Mapped[str] = mapped_column(String)      # critical_incident|ticket|chat|task|fatigue|info
    severity: Mapped[str] = mapped_column(String, default="info")
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(Text, default="")
    alarm: Mapped[bool] = mapped_column(Boolean, default=False)
    link: Mapped[str | None] = mapped_column(String, nullable=True)
    incident_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ticket_id: Mapped[str | None] = mapped_column(String, nullable=True)
    read_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    acknowledged_at: Mapped[float | None] = mapped_column(Float, nullable=True)


# ---------------------------------------------------------------- training & simulation
class TrainingVideoRow(Base):
    """Operator training content. DEMO entries are labelled; no real Caterpillar material is used."""
    __tablename__ = "tc_training_video"
    video_id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, default="safety")
    duration_min: Mapped[float] = mapped_column(Float, default=3.0)
    url: Mapped[str | None] = mapped_column(String, nullable=True)    # null -> placeholder player
    description: Mapped[str] = mapped_column(Text, default="")
    label: Mapped[str] = mapped_column(String, default="DEMO placeholder - not official Caterpillar material")
    order_index: Mapped[int] = mapped_column(Integer, default=0)


class SimEventRow(Base):
    """Raw simulated sensor/camera/fatigue observation, kept so a real detector can replace the source."""
    __tablename__ = "tc_sim_event"
    event_id: Mapped[str] = mapped_column(String, primary_key=True)
    ts: Mapped[float] = mapped_column(Float, default=_now, index=True)
    kind: Mapped[str] = mapped_column(String, index=True)   # machine_sensor|camera_observation|fatigue|location
    source: Mapped[str] = mapped_column(String, default="SIMULATED")
    machine_id: Mapped[str | None] = mapped_column(String, nullable=True)
    camera_id: Mapped[str | None] = mapped_column(String, nullable=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    produced_ticket_id: Mapped[str | None] = mapped_column(String, nullable=True)
    produced_incident_id: Mapped[str | None] = mapped_column(String, nullable=True)


class TaskChecklistResultRow(Base):
    """Pre-start inspection answer for one task, using the shared config/checklist.yaml items.

    Mirrors the copilot's shift checklist: PASS / FAIL / N_A, a FAIL on a critical item blocks the
    task from starting and raises a ticket, and N/A never blocks. One row per (task, item); the
    latest answer wins and is overwritten in place, with `ts` recording when it was given.
    """
    __tablename__ = "tc_task_checklist"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String, index=True)
    item_id: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[str] = mapped_column(String)
    result: Mapped[str] = mapped_column(String)          # pass|fail|na
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)   # required on a FAIL
    ts: Mapped[float] = mapped_column(Float, default=_now)


class WaitPeriodRow(Base):
    """An operator-declared pause: the machine is idle for a reason outside the operator's control.

    The operator taps "Waiting for truck" (or another reason) and the period is recorded with a
    server timestamp. Idle observations that overlap a declared wait are explained, not flagged:
    the brain suppresses the AI idle ticket and the time is reported as waiting, not as the
    operator's fault. An open period has ``ended_at`` null.
    """
    __tablename__ = "tc_wait_period"
    wait_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    task_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    reason: Mapped[str] = mapped_column(String, default="waiting_for_truck")  # waiting_for_truck|machine_paused|expected_delay
    started_at: Mapped[float] = mapped_column(Float, index=True)
    ended_at: Mapped[float | None] = mapped_column(Float, index=True, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String, default="operator")   # operator|supervisor|simulated


class TrainingProgressRow(Base):
    """One operator's progress through one training item.

    Progress is recorded from what the operator actually did (opened it, how far through, finished),
    never inferred. ``percent`` is 0-100 of the item watched/read; ``completed_at`` is set only when
    they reach the end.
    """
    __tablename__ = "tc_training_progress"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    video_id: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String, default="not_started")   # not_started|in_progress|completed
    percent: Mapped[float] = mapped_column(Float, default=0.0)
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    assigned_by: Mapped[str | None] = mapped_column(String, nullable=True)   # supervisor who assigned it, if any
    assigned_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------- fleet: machine state log & maintenance
class MachineStateRow(Base):
    """One interval of a machine's scheduled time: operating, idle, down (unplanned) or maintenance (planned).

    The log only covers time the machine was meant to be working. A gap between intervals is
    unscheduled (parked, off shift) and counts toward neither uptime nor downtime. An open interval
    has ``ended_at`` null and is the machine's current state. Utilisation and availability are derived
    from these rows, never stored, so the numbers can always be traced back to the intervals.
    """
    __tablename__ = "tc_machine_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(String, index=True)
    state: Mapped[str] = mapped_column(String, index=True)       # operating|idle|down|maintenance
    started_at: Mapped[float] = mapped_column(Float, index=True)
    ended_at: Mapped[float | None] = mapped_column(Float, index=True, nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String, default="SIMULATED")   # SIMULATED|MANUAL
    maintenance_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    operator_id: Mapped[str | None] = mapped_column(String, nullable=True)


class MaintenanceRow(Base):
    """A maintenance work order on one machine: scheduled service, inspection or repair.

    ``status`` moves scheduled -> in_progress -> completed (or cancelled). Starting a work order puts
    the machine into ``maintenance`` (planned) or ``down`` (a repair) in the state log, and finishing it
    closes that interval, so downtime is counted from the work actually done. ``hour_meter_h`` is the
    service-meter reading at completion; the next service falls due ``service_interval_h`` after the
    last completed service. ``history`` is an append-only list of what was done to the record and by whom.
    """
    __tablename__ = "tc_maintenance"
    maintenance_id: Mapped[str] = mapped_column(String, primary_key=True)
    machine_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String, default="service")          # service|inspection|repair
    title: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="scheduled", index=True)  # scheduled|in_progress|completed|cancelled
    scheduled_for: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_at: Mapped[float | None] = mapped_column(Float, index=True, nullable=True)
    hour_meter_h: Mapped[float | None] = mapped_column(Float, nullable=True)
    performed_by: Mapped[str] = mapped_column(String, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String, default="MANUAL")        # SIMULATED|MANUAL
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=_now)
    history: Mapped[list] = mapped_column(JSON, default=list)
