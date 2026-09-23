"""Canonical data contracts for CAT Sentinel.

Every module (sim, safety, pipeline, practice, alerts, APIs, UI) exchanges these models.
Do not change a field without updating docs/implementation-plan.md.

Data assumption (project decision): inputs are clean — well-formed, time-synchronised,
correct units. Validate shape at boundaries only; no imputation pipelines.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = 1


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


# ---------------------------------------------------------------- enums
class Source(str, Enum):
    SIM = "SIM"          # live simulator
    REPLAY = "REPLAY"    # recorded JSONL replay
    REAL = "REAL"        # real machine adapter (future)


class TaskType(str, Enum):
    truck_loading = "truck_loading"
    trenching = "trenching"
    stockpile = "stockpile"


class Phase(str, Enum):
    """Excavator work-cycle phase (also used by the practice analyser)."""
    dig = "dig"
    swing_loaded = "swing_loaded"
    dump = "dump"
    swing_empty = "swing_empty"
    idle = "idle"
    travel = "travel"


class Tier(str, Enum):
    T_CRIT = "T_CRIT"   # deterministic immediate (DANGER)
    T3 = "T3"           # recommended safe stop / break (WARNING)
    T2 = "T2"           # elevated risk, ack required (WARNING)
    T1 = "T1"           # advisory (CAUTION)
    T0 = "T0"           # coaching, post-shift only (NOTICE)
    T4 = "T4"           # supervisor escalation (SUPERVISOR NOTIFIED)


SIGNAL_WORD = {
    Tier.T_CRIT: "DANGER", Tier.T3: "WARNING", Tier.T2: "WARNING",
    Tier.T1: "CAUTION", Tier.T0: "NOTICE", Tier.T4: "SUPERVISOR NOTIFIED",
}


class RiskCategory(str, Enum):
    """04-ml-approaches risk taxonomy."""
    normal = "normal"
    unusual_harmless = "unusual_harmless"
    procedural = "procedural"
    emerging_degradation = "emerging_degradation"
    dangerous_condition = "dangerous_condition"
    immediate_critical = "immediate_critical"


class Provenance(str, Enum):
    RULE = "RULE"
    ML = "ML"
    SIMULATED = "SIMULATED"
    MOCK = "MOCK"
    MANUAL = "MANUAL"


class Attribution(str, Enum):
    operator = "operator"
    machine = "machine"
    environment = "environment"
    unknown = "unknown"


class CompetencyState(str, Enum):
    unassessed = "unassessed"
    observed_gap = "observed_gap"
    in_training = "in_training"
    improving = "improving"
    demonstrated = "demonstrated"   # only instructor or passed assessment may set


# ---------------------------------------------------------------- telemetry
class TelemetrySample(BaseModel):
    """One 10 Hz machine sample (Tier B CAN-style signals + optional Tier C proximity)."""
    # keep NaN as NaN on the wire so the safety engine can detect a faulty sensor
    model_config = ConfigDict(ser_json_inf_nan="constants")

    schema_version: int = SCHEMA_VERSION
    ts: float                                  # unix seconds (UTC)
    seq: int
    source: Source = Source.SIM
    t_pub_ns: int | None = None                # publish time for latency measurement
    site_id: str
    machine_id: str
    operator_id: str
    shift_id: str | None = None
    task_id: str | None = None
    task_type: TaskType | None = None
    zone: str | None = None                    # geofence name, e.g. "TL-1" (truck loading)
    # engine / drivetrain
    engine_on: bool = True
    rpm: float = 0.0
    throttle_pct: float = 0.0                  # 0..100
    fuel_rate_lph: float = 0.0
    coolant_c: float = 85.0
    travel_kmh: float = 0.0                    # absolute ground speed
    gear: int = 0                              # travel speed range: 0 = neutral/park, 1 = low (tortoise), 2 = high (rabbit)
    park_brake: bool = True                    # True = applied
    service_brake: bool = False                # travel brake pedal applied
    swing_brake: bool = False                  # swing parking brake engaged
    hyd_lockout: bool = False                  # True = hydraulics locked (lever down)
    # operator controls, -1..1 (pilot joystick commands)
    joy_swing: float = 0.0
    joy_boom: float = 0.0
    joy_stick: float = 0.0
    joy_bucket: float = 0.0
    travel_cmd: float = 0.0
    # kinematics
    swing_dps: float = 0.0                     # signed swing rate deg/s
    swing_angle_deg: float = 0.0               # 0 = dig face, +ve toward truck
    boom_angle_deg: float = 0.0
    stick_angle_deg: float = 0.0
    bucket_angle_deg: float = 0.0
    hyd_pressure_bar: float = 0.0              # main pump pressure
    hyd_pilot_bar: float = 35.0                # pilot circuit pressure
    hyd_oil_temp_c: float = 55.0
    payload_t: float = 0.0                     # material in bucket
    # safety signals
    seatbelt: bool = True                      # True = fastened
    prox_fitted: bool = True                   # Tier C hardware present
    prox_person_m: float | None = None         # nearest person distance (None = none detected)
    prox_person_sector: Literal["front", "right", "rear", "left"] | None = None
    prox_truck_m: float | None = None          # nearest haul truck distance
    bucket_to_truck_m: float | None = None     # bucket tip to truck body
    dtc: list[str] = Field(default_factory=list)   # active diagnostic trouble codes
    # simulator ground truth — NEVER read by production logic (evaluation/training labels only)
    gt: dict[str, Any] | None = None           # e.g. {"phase": "dig", "inject": "fast_swing", "archetype": "novice"}


class TierASnapshot(BaseModel):
    """Telematics-style (ISO 15143-3 / AEMP 2.0-like) cumulative snapshot, ~1/min."""
    ts: float
    machine_id: str
    smu_h: float
    idle_h: float
    fuel_l: float
    dtc: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- features / events
class FeatureWindow(BaseModel):
    window_id: str = Field(default_factory=lambda: new_id("win"))
    t_start: float
    t_end: float
    machine_id: str
    operator_id: str
    shift_id: str | None = None
    task_id: str | None = None
    context_key: str                           # e.g. "EX-20t|truck_loading"
    variant: Literal["B", "BC"] = "BC"         # B-only or B + proximity model variant
    features: dict[str, float]
    score: float | None = None                 # raw anomaly score
    percentile: float | None = None            # calibrated within context (0..1)
    model_version: str | None = None


class FeatureContribution(BaseModel):
    feature: str
    label: str                                 # human label, e.g. "Swing rate near truck"
    value: float
    baseline_mean: float
    baseline_std: float
    z: float
    unit: str = ""
    direction: Literal["high", "low"] = "high"


class Event(BaseModel):
    """Anything worth recording: rule hit, ML anomaly, fused risk, manual report."""
    event_id: str = Field(default_factory=lambda: new_id("evt"))
    ts: float
    site_id: str
    machine_id: str
    operator_id: str
    shift_id: str | None = None
    task_id: str | None = None
    type: str                                  # e.g. "seatbelt_unfastened_moving", "fast_swing_near_truck", "excessive_idle"
    category: RiskCategory
    tier: Tier | None = None                   # proposed tier (alert manager finalises)
    provenance: list[Provenance]
    rule_id: str | None = None
    rule_version: str | None = None
    model_version: str | None = None
    risk_score: float | None = None            # fused r (04 §5)
    attribution: Attribution = Attribution.unknown
    context: dict[str, Any] = Field(default_factory=dict)   # task, zone, speeds, waiting_for_truck...
    explanation: list[FeatureContribution] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    competency_ids: list[str] = Field(default_factory=list)
    simulated: bool = True


class AlertState(str, Enum):
    raised = "raised"
    acknowledged = "acknowledged"
    cleared = "cleared"
    suppressed = "suppressed"
    queued_post_shift = "queued_post_shift"
    escalated = "escalated"


class Alert(BaseModel):
    alert_id: str = Field(default_factory=lambda: new_id("alt"))
    event_id: str
    ts: float
    machine_id: str
    operator_id: str
    tier: Tier
    signal_word: str
    what: str                                  # ≤ 12 words
    why: str                                   # ≤ 12 words
    do: str                                    # ≤ 12 words
    provenance: list[Provenance]
    state: AlertState = AlertState.raised
    requires_ack: bool = False
    dismissible: bool = True
    suppressed_reason: str | None = None
    acked_at: float | None = None
    cleared_at: float | None = None
    escalated_to: str | None = None
    explanation: list[FeatureContribution] = Field(default_factory=list)
    simulated: bool = True


class SafetyAlertMsg(BaseModel):
    """Published by the independent safety process on safety/alert."""
    alert_id: str
    rule_id: str
    rule_version: str
    state: Literal["raised", "cleared"]
    ts: float
    machine_id: str
    operator_id: str
    what: str
    why: str
    do: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    t_pub_ns: int | None = None
    sample_t_pub_ns: int | None = None


class SafetyHeartbeat(BaseModel):
    ts: float
    machine_id: str
    rule_version: str
    sensor_health: dict[str, Literal["ok", "not_fitted", "fault", "stale"]]
    active_alerts: list[str] = Field(default_factory=list)


class Incident(BaseModel):
    incident_id: str = Field(default_factory=lambda: new_id("inc"))
    ts: float
    site_id: str
    machine_id: str
    operator_id: str
    shift_id: str | None = None
    source: Literal["auto", "manual"]
    type: str
    severity: Literal["low", "medium", "high"]
    signal_word: str | None = None
    event_ids: list[str] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    snapshot: list[dict[str, Any]] = Field(default_factory=list)   # ±10 s of samples (abridged)
    note: str | None = None
    operator_note: str | None = None
    dispute_status: Literal["none", "disputed", "resolved"] = "none"
    status: Literal["open", "reviewed", "closed"] = "open"
    simulated: bool = True


# ---------------------------------------------------------------- tasks / ETA
class TaskEstimate(BaseModel):
    task_id: str
    p10_min: float
    p50_min: float
    p90_min: float
    nominal_coverage: float = 0.8
    remaining_p50_min: float | None = None
    remaining_p10_min: float | None = None
    remaining_p90_min: float | None = None
    drivers: list[dict[str, Any]] = Field(default_factory=list)  # [{"factor": "rain", "delta_min": +8}]
    n_similar: int | None = None
    low_data: bool = False
    model_version: str
    provenance: list[Provenance] = Field(default_factory=lambda: [Provenance.ML, Provenance.SIMULATED])


# ---------------------------------------------------------------- practice analyser (trainee vs expert)
class PracticeSample(BaseModel):
    """Trainee control input sample (subset of TelemetrySample) — from simulator, practice machine or upload."""
    ts: float
    joy_swing: float
    joy_boom: float
    joy_stick: float
    joy_bucket: float
    travel_cmd: float = 0.0
    swing_dps: float = 0.0
    swing_angle_deg: float = 0.0
    boom_angle_deg: float = 0.0
    stick_angle_deg: float = 0.0
    bucket_angle_deg: float = 0.0
    hyd_pressure_bar: float = 0.0
    payload_t: float = 0.0
    bucket_to_truck_m: float | None = None
    gt: dict[str, Any] | None = None


class CycleMetric(BaseModel):
    name: str                  # e.g. "swing_smoothness"
    label: str                 # "Swing smoothness"
    value: float
    unit: str
    expert_p10: float
    expert_p50: float
    expert_p90: float
    percentile_vs_expert: float     # where the trainee sits in the expert distribution (0..1)
    better: Literal["higher", "lower", "band"]
    status: Literal["expert_like", "near", "needs_work"]


class CoachingTip(BaseModel):
    tip_id: str
    phase: Phase | None
    metric: str
    severity: Literal["info", "improve", "priority"]
    title: str                 # "Start the swing earlier while raising the boom"
    detail: str                # plain-language why + how
    competency_id: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class PracticeCycleReport(BaseModel):
    cycle_index: int
    t_start: float
    t_end: float
    phases: list[dict[str, Any]]          # [{"phase": "dig", "t_start":..., "t_end":..., "duration_s":...}]
    metrics: list[CycleMetric]
    expert_likeness: float                # 0..100 calibrated score
    safety_flags: list[str] = Field(default_factory=list)


class PracticeReport(BaseModel):
    session_id: str
    trainee_id: str
    exercise: str                          # e.g. "truck_loading_basic"
    n_cycles: int
    overall_score: float                   # 0..100
    score_band: Literal["beginner", "developing", "proficient", "expert_like"]
    cycles: list[PracticeCycleReport]
    summary_metrics: list[CycleMetric]
    tips: list[CoachingTip]                # ranked, max ~5
    trajectory_overlay: dict[str, Any]     # per phase/channel: expert band + trainee curve (normalised time)
    # productivity gap vs expert, e.g. {"trainee_cycle_s": 31.0, "expert_cycle_s": 23.0, "trainee_m3_per_h": 180,
    #   "expert_m3_per_h": 245, "gap_pct": 26.5, "fuel_l_per_m3_trainee": .., "fuel_l_per_m3_expert": ..}
    productivity: dict[str, Any] | None = None
    # money view from sentinel.value (ESTIMATE, assumptions listed), e.g. {"annual_value_usd": .., "assumptions": {...}}
    value_estimate: dict[str, Any] | None = None
    model_version: str
    provenance: list[Provenance] = Field(default_factory=lambda: [Provenance.ML, Provenance.SIMULATED])
