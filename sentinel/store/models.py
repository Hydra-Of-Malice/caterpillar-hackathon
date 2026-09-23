"""SQLAlchemy 2.0 ORM models shared by edge (data/edge.db) and cloud (data/cloud.db).

Both databases create all tables (simple for a prototype); each service only writes the
tables it owns (see docs/implementation-plan.md). JSON columns hold pydantic dumps.
"""
from __future__ import annotations

import time

from sqlalchemy import JSON, Boolean, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _now() -> float:
    return time.time()


# ------------------------------------------------------------ reference data
class OperatorRow(Base):
    __tablename__ = "operator"
    operator_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="operator")      # operator|trainee|instructor|supervisor
    experience_months: Mapped[int] = mapped_column(Integer, default=0)
    operating_hours: Mapped[float] = mapped_column(Float, default=0.0)
    archetype: Mapped[str | None] = mapped_column(String, nullable=True)  # SIMULATED persona label
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class MachineRow(Base):
    __tablename__ = "machine"
    machine_id: Mapped[str] = mapped_column(String, primary_key=True)
    model: Mapped[str] = mapped_column(String)          # "Cat 320 (simulated)"
    machine_type: Mapped[str] = mapped_column(String)   # "EX-20t"
    site_id: Mapped[str] = mapped_column(String)
    prox_fitted: Mapped[bool] = mapped_column(Boolean, default=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


# ------------------------------------------------------------ shift & tasks (R1, R5)
class ShiftRow(Base):
    __tablename__ = "shift"
    shift_id: Mapped[str] = mapped_column(String, primary_key=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str] = mapped_column(String, index=True)
    site_id: Mapped[str] = mapped_column(String)
    planned_start: Mapped[float] = mapped_column(Float)
    planned_end: Mapped[float] = mapped_column(Float)
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="planned")   # planned|checklist|active|ended
    privacy_ack: Mapped[bool] = mapped_column(Boolean, default=False)
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)     # weather snapshot (MOCK)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class TaskRow(Base):
    __tablename__ = "task"
    task_id: Mapped[str] = mapped_column(String, primary_key=True)
    shift_id: Mapped[str] = mapped_column(String, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)            # TaskType
    location: Mapped[str] = mapped_column(String, default="")
    material: Mapped[str] = mapped_column(String, default="clay_gravel")
    planned_qty: Mapped[float] = mapped_column(Float)
    qty_unit: Mapped[str] = mapped_column(String, default="m3")
    done_qty: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|in_progress|done
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    done_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    first_on_site: Mapped[bool] = mapped_column(Boolean, default=False)
    required_module_id: Mapped[str | None] = mapped_column(String, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class TaskHistoryRow(Base):
    """Completed historical tasks — training data for the task-time model (SIMULATED)."""
    __tablename__ = "task_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_type: Mapped[str] = mapped_column(String)
    features: Mapped[dict] = mapped_column(JSON)
    duration_min: Mapped[float] = mapped_column(Float)
    completed_at: Mapped[float] = mapped_column(Float)


class ChecklistResultRow(Base):
    __tablename__ = "checklist_result"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shift_id: Mapped[str] = mapped_column(String, index=True)
    item_id: Mapped[str] = mapped_column(String)
    result: Mapped[str] = mapped_column(String)          # pass|fail|na
    critical: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    ts: Mapped[float] = mapped_column(Float, default=_now)


# ------------------------------------------------------------ safety & behaviour (R2, R4)
class EventRow(Base):
    __tablename__ = "event"
    event_id: Mapped[str] = mapped_column(String, primary_key=True)
    ts: Mapped[float] = mapped_column(Float, index=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str] = mapped_column(String, index=True)
    shift_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    type: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String)
    tier: Mapped[str | None] = mapped_column(String, nullable=True)
    attribution: Mapped[str] = mapped_column(String, default="unknown")
    data: Mapped[dict] = mapped_column(JSON)             # full Event dump


class AlertRow(Base):
    __tablename__ = "alert"
    alert_id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(String, index=True)
    ts: Mapped[float] = mapped_column(Float, index=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str] = mapped_column(String)
    tier: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String)
    t_render_ns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[dict] = mapped_column(JSON)             # full Alert dump


class IncidentRow(Base):
    __tablename__ = "incident"
    incident_id: Mapped[str] = mapped_column(String, primary_key=True)
    ts: Mapped[float] = mapped_column(Float, index=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    machine_id: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")
    data: Mapped[dict] = mapped_column(JSON)             # full Incident dump


class FeatureWindowRow(Base):
    __tablename__ = "feature_window"
    window_id: Mapped[str] = mapped_column(String, primary_key=True)
    t_end: Mapped[float] = mapped_column(Float, index=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    shift_id: Mapped[str | None] = mapped_column(String, nullable=True)
    context_key: Mapped[str] = mapped_column(String)
    percentile: Mapped[float | None] = mapped_column(Float, nullable=True)
    data: Mapped[dict] = mapped_column(JSON)


class ExposureRow(Base):
    """Operating time / opportunities per operator × shift × task type (denominators for rates)."""
    __tablename__ = "exposure"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    shift_id: Mapped[str] = mapped_column(String, index=True)
    task_type: Mapped[str] = mapped_column(String)
    operating_h: Mapped[float] = mapped_column(Float, default=0.0)
    cycles: Mapped[int] = mapped_column(Integer, default=0)
    truck_approach_cycles: Mapped[int] = mapped_column(Integer, default=0)


class BreakLogRow(Base):
    __tablename__ = "break_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shift_id: Mapped[str] = mapped_column(String, index=True)
    operator_id: Mapped[str] = mapped_column(String)
    started_at: Mapped[float] = mapped_column(Float)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    kss: Mapped[int | None] = mapped_column(Integer, nullable=True)   # optional, consented research only


class FeedbackLabelRow(Base):
    __tablename__ = "feedback_label"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[str] = mapped_column(String, index=True)
    useful: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_role: Mapped[str] = mapped_column(String, default="operator")
    ts: Mapped[float] = mapped_column(Float, default=_now)


class OutboxRow(Base):
    """Edge store-and-forward queue to cloud."""
    __tablename__ = "outbox"
    uuid: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String)            # event|alert|incident|exposure|shift|feature_window
    payload: Mapped[dict] = mapped_column(JSON)
    priority: Mapped[int] = mapped_column(Integer, default=5)   # 0 = highest (T-CRIT incidents)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=_now)
    synced_at: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)


# ------------------------------------------------------------ competency & training (R3)
class OperatorCompetencyRow(Base):
    __tablename__ = "operator_competency"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    competency_id: Mapped[str] = mapped_column(String, index=True)
    state: Mapped[str] = mapped_column(String, default="unassessed")
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    verified_by: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[float] = mapped_column(Float, default=_now)


class TrainingRecordRow(Base):
    __tablename__ = "training_record"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    module_id: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)             # module_completed|quiz_attempt|practice_session|booking
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    ts: Mapped[float] = mapped_column(Float, default=_now)


class BookingRow(Base):
    __tablename__ = "booking"
    booking_id: Mapped[str] = mapped_column(String, primary_key=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    instructor_id: Mapped[str] = mapped_column(String)
    slot_start: Mapped[float] = mapped_column(Float)
    slot_end: Mapped[float] = mapped_column(Float)
    format: Mapped[str] = mapped_column(String)           # on_machine|simulator|video
    competency_id: Mapped[str | None] = mapped_column(String, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="confirmed")   # MOCK integration


class PracticeSessionRow(Base):
    __tablename__ = "practice_session"
    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    trainee_id: Mapped[str] = mapped_column(String, index=True)
    exercise: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")   # open|analysed
    started_at: Mapped[float] = mapped_column(Float, default=_now)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    n_samples: Mapped[int] = mapped_column(Integer, default=0)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # PracticeReport dump
    samples_path: Mapped[str | None] = mapped_column(String, nullable=True)   # parquet/jsonl of raw inputs


class ReassessmentRow(Base):
    __tablename__ = "reassessment"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_id: Mapped[str] = mapped_column(String, index=True)
    competency_id: Mapped[str] = mapped_column(String)
    data: Mapped[dict] = mapped_column(JSON)              # pre/post counts, RR, CI, label SIMULATED
    ts: Mapped[float] = mapped_column(Float, default=_now)


class AuditLogRow(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    target: Mapped[str] = mapped_column(String)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    ts: Mapped[float] = mapped_column(Float, default=_now)


class ModelRegistryRow(Base):
    __tablename__ = "model_registry"
    model_id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String)             # iforest|tasktime|expert_motion
    context_key: Mapped[str | None] = mapped_column(String, nullable=True)
    version: Mapped[str] = mapped_column(String)
    sha256: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    card: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
