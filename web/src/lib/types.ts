/**
 * TypeScript mirror of sentinel/shared/schemas.py (SCHEMA_VERSION 1) plus the HTTP response
 * shapes from docs/implementation-plan.md. Field names match the Python models exactly.
 * Shapes the contract leaves open (dict[str, Any]) are typed here as the UI expects them;
 * every such field is optional so partial backend responses still render.
 */

// ------------------------------------------------------------------ enums
export type Source = 'SIM' | 'REPLAY' | 'REAL';
export type TaskType = 'truck_loading' | 'trenching' | 'stockpile' | 'grading';
export type Phase = 'dig' | 'swing_loaded' | 'dump' | 'swing_empty' | 'idle' | 'travel';
export type Tier = 'T_CRIT' | 'T3' | 'T2' | 'T1' | 'T0' | 'T4';
export type SignalWord = 'DANGER' | 'WARNING' | 'CAUTION' | 'NOTICE' | 'SUPERVISOR NOTIFIED';

export const SIGNAL_WORD: Record<Tier, SignalWord> = {
  T_CRIT: 'DANGER',
  T3: 'WARNING',
  T2: 'WARNING',
  T1: 'CAUTION',
  T0: 'NOTICE',
  T4: 'SUPERVISOR NOTIFIED',
};

/** Banner priority: higher wins the single alert slot. */
export const TIER_PRIORITY: Record<Tier, number> = { T_CRIT: 50, T3: 40, T2: 30, T1: 20, T4: 10, T0: 0 };

export type RiskCategory =
  | 'normal'
  | 'unusual_harmless'
  | 'procedural'
  | 'emerging_degradation'
  | 'dangerous_condition'
  | 'immediate_critical';
export type Provenance = 'RULE' | 'ML' | 'SIMULATED' | 'MOCK' | 'MANUAL';
export type Attribution = 'operator' | 'machine' | 'environment' | 'unknown';
export type CompetencyState = 'unassessed' | 'observed_gap' | 'in_training' | 'improving' | 'demonstrated';
export type AlertState = 'raised' | 'acknowledged' | 'cleared' | 'suppressed' | 'queued_post_shift' | 'escalated';

// ------------------------------------------------------------------ features / events / alerts
export interface FeatureContribution {
  feature: string;
  label: string;
  value: number;
  baseline_mean: number;
  baseline_std: number;
  z: number;
  unit: string;
  direction: 'high' | 'low';
}

export interface SentinelEvent {
  event_id: string;
  ts: number;
  site_id: string;
  machine_id: string;
  operator_id: string;
  shift_id?: string | null;
  task_id?: string | null;
  type: string;
  category: RiskCategory;
  tier?: Tier | null;
  provenance: Provenance[];
  rule_id?: string | null;
  rule_version?: string | null;
  model_version?: string | null;
  risk_score?: number | null;
  attribution: Attribution;
  context: Record<string, unknown>;
  explanation: FeatureContribution[];
  evidence: Record<string, unknown>;
  competency_ids: string[];
  simulated: boolean;
}

export interface Alert {
  alert_id: string;
  event_id: string;
  ts: number;
  machine_id: string;
  operator_id: string;
  tier: Tier;
  signal_word: string;
  what: string;
  why: string;
  do: string;
  provenance: Provenance[];
  state: AlertState;
  requires_ack: boolean;
  dismissible: boolean;
  suppressed_reason?: string | null;
  acked_at?: number | null;
  cleared_at?: number | null;
  escalated_to?: string | null;
  explanation: FeatureContribution[];
  simulated: boolean;
  /** UI-only: where the alert arrived from. */
  _via?: 'edge' | 'mqtt' | 'mock';
  /** UI-only: occurrence count today ("3rd time today"), if the edge provides it in why. */
  _queued?: number;
}

export interface SafetyAlertMsg {
  alert_id: string;
  rule_id: string;
  rule_version: string;
  state: 'raised' | 'cleared';
  ts: number;
  machine_id: string;
  operator_id: string;
  what: string;
  why: string;
  do: string;
  evidence: Record<string, unknown>;
  t_pub_ns?: number | null;
  sample_t_pub_ns?: number | null;
}

export type SensorHealth = 'ok' | 'not_fitted' | 'fault' | 'stale';

export interface SafetyHeartbeat {
  ts: number;
  machine_id: string;
  rule_version: string;
  sensor_health: Record<string, SensorHealth>;
  active_alerts: string[];
}

export interface Incident {
  incident_id: string;
  ts: number;
  site_id: string;
  machine_id: string;
  operator_id: string;
  shift_id?: string | null;
  source: 'auto' | 'manual';
  type: string;
  severity: 'low' | 'medium' | 'high';
  signal_word?: string | null;
  event_ids: string[];
  context: Record<string, unknown>;
  snapshot: Array<Record<string, unknown>>;
  note?: string | null;
  operator_note?: string | null;
  dispute_status: 'none' | 'disputed' | 'resolved';
  status: 'open' | 'reviewed' | 'closed';
  simulated: boolean;
  /** Optional enrichments the UI renders when present. */
  provenance?: Provenance[];
  explanation?: FeatureContribution[];
  competency_ids?: string[];
  attachments?: Array<{ kind: 'voice' | 'photo'; label: string; mock?: boolean }>;
}

// ------------------------------------------------------------------ tasks / ETA
export interface EtaDriver {
  factor: string;
  delta_min: number;
  label?: string;
}

export interface TaskEstimate {
  task_id: string;
  p10_min: number;
  p50_min: number;
  p90_min: number;
  nominal_coverage: number;
  remaining_p50_min?: number | null;
  remaining_p10_min?: number | null;
  remaining_p90_min?: number | null;
  drivers: EtaDriver[];
  n_similar?: number | null;
  low_data: boolean;
  model_version: string;
  provenance: Provenance[];
}

export type TaskStatus = 'queued' | 'in_progress' | 'done' | 'paused';

export interface Task {
  task_id: string;
  shift_id?: string;
  priority: number;
  type: TaskType;
  name: string;
  location?: string;
  zone?: string | null;
  planned_qty: number;
  unit: string;
  done_qty?: number;
  progress_pct: number;
  status: TaskStatus;
  material?: string;
  started_at?: number | null;
  done_at?: number | null;
  first_on_site?: boolean;
  required_module?: string | null;
  required_module_title?: string | null;
  spotter_assigned?: boolean | null;
  planned_duration_min?: number | null;
  estimate?: TaskEstimate | null;
  note?: string | null;
}

// ------------------------------------------------------------------ practice analyser
export interface PracticeSample {
  ts: number;
  joy_swing: number;
  joy_boom: number;
  joy_stick: number;
  joy_bucket: number;
  travel_cmd?: number;
  swing_dps?: number;
  swing_angle_deg?: number;
  boom_angle_deg?: number;
  stick_angle_deg?: number;
  bucket_angle_deg?: number;
  hyd_pressure_bar?: number;
  payload_t?: number;
  bucket_to_truck_m?: number | null;
  gt?: Record<string, unknown> | null;
}

export type MetricStatus = 'expert_like' | 'near' | 'needs_work';

export interface CycleMetric {
  name: string;
  label: string;
  value: number;
  unit: string;
  expert_p10: number;
  expert_p50: number;
  expert_p90: number;
  percentile_vs_expert: number;
  better: 'higher' | 'lower' | 'band';
  status: MetricStatus;
}

export interface CoachingTip {
  tip_id: string;
  phase: Phase | null;
  metric: string;
  severity: 'info' | 'improve' | 'priority';
  title: string;
  detail: string;
  competency_id?: string | null;
  evidence: Record<string, unknown>;
}

export interface PhaseSpan {
  phase: Phase | string;
  t_start: number;
  t_end: number;
  duration_s: number;
}

export interface PracticeCycleReport {
  cycle_index: number;
  t_start: number;
  t_end: number;
  phases: PhaseSpan[];
  metrics: CycleMetric[];
  expert_likeness: number;
  safety_flags: string[];
}

export type ScoreBand = 'beginner' | 'developing' | 'proficient' | 'expert_like';

/**
 * trajectory_overlay is dict[str, Any] in the schema. The UI reads (in order of preference):
 *   { [phase]: { [channel]: { t: number[], expert_p10: number[], expert_p50: number[], expert_p90: number[], trainee: number[] } } }
 * plus optional top-level "expert_phase_durations_s": { [phase]: number }.
 */
export interface TrajectoryChannel {
  t: number[];
  expert_p10: number[];
  expert_p50: number[];
  expert_p90: number[];
  trainee: number[];
  unit?: string;
}

export interface PracticeReport {
  session_id: string;
  trainee_id: string;
  exercise: string;
  n_cycles: number;
  overall_score: number;
  score_band: ScoreBand;
  cycles: PracticeCycleReport[];
  summary_metrics: CycleMetric[];
  tips: CoachingTip[];
  trajectory_overlay: Record<string, unknown>;
  /** Productivity gap vs expert, e.g. {trainee_cycle_s, expert_cycle_s, trainee_m3_per_h, expert_m3_per_h, gap_pct, fuel_l_per_m3_*}. */
  productivity?: PracticeProductivity | null;
  /** Money view from sentinel.value (ESTIMATE), e.g. {annual_value_usd, m3_per_shift_gain, assumptions{...}}. */
  value_estimate?: PracticeValueEstimate | null;
  model_version: string;
  provenance: Provenance[];
}

export interface PracticeProductivity {
  trainee_cycle_s?: number;
  expert_cycle_s?: number;
  trainee_m3_per_h?: number;
  expert_m3_per_h?: number;
  gap_pct?: number;
  fuel_l_per_m3_trainee?: number;
  fuel_l_per_m3_expert?: number;
  productive_h_per_shift?: number;
  bucket_m3?: number;
  [k: string]: unknown;
}

export interface PracticeValueEstimate {
  annual_value_usd?: number;
  annual_value_usd_per_operator?: number;
  m3_per_shift_gain?: number;
  label?: string;
  basis?: string;
  assumptions?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface PracticeSession {
  session_id: string;
  trainee_id: string;
  exercise: string;
  status?: 'live' | 'finished' | string;
  created_ts?: number;
  finished_ts?: number | null;
  n_cycles?: number | null;
  overall_score?: number | null;
  score_band?: ScoreBand | null;
  archetype?: string | null;
  simulated?: boolean;
}

export interface PracticeExercise {
  exercise_id: string;
  /** The analyser uses `title`; `label` is accepted too. */
  title?: string;
  label?: string;
  description?: string;
  task_type?: TaskType;
}

/** Frame from WS /practice/sessions/{id}/live (and PracticeAnalyser.live_step). */
export interface PracticeLiveFrame {
  phase: Phase | string;
  deviation: Record<string, number>;
  hint: string | null;
  ts?: number;
  cycle?: number;
  sample?: Partial<PracticeSample>;
  expert_band?: Record<string, { p10: number; p50: number; p90: number }>;
}

export interface PracticeGenerateResponse {
  session_id: string;
  trainee_id?: string;
  archetype?: string;
  report?: PracticeReport;
  samples?: PracticeSample[];
}

// ------------------------------------------------------------------ edge API shapes
export interface Health {
  status: string;
  safety_heartbeat_age_s: number | null;
  protection: 'active' | 'degraded';
  broker: string;
  cloud: 'online' | 'offline';
  outbox_backlog: number;
  versions: { rules?: string; models?: Record<string, string> | string };
  rule_latency_ms?: { p50: number; p99: number };
  sensor_health?: Record<string, SensorHealth>;
  protection_reasons?: string[];
}

export interface Operator {
  operator_id: string;
  name: string;
  role?: string;
  experience_months?: number;
  experience_years?: number;
  operating_hours?: number;
  level?: string;
}

export interface Machine {
  machine_id: string;
  model: string;
  machine_type: string;
  site_id: string;
  prox_fitted: boolean;
}

export interface Conditions {
  temp_c: number;
  dust: string;
  rain_from?: string | null;
  forecast?: string;
  visibility?: string;
  lighting?: string;
  updated_ts: number;
  stale_s?: number;
  provenance?: Provenance[];
}

export interface Shift {
  shift_id: string;
  date: string;
  planned_start_ts: number;
  planned_end_ts: number;
  started_at?: number | null;
  ended_at?: number | null;
  status: 'planned' | 'checklist' | 'active' | 'ended';
  site_id: string;
  location?: string;
  privacy_ack?: boolean;
}

export interface ChecklistStatus {
  completed: boolean;
  passed: boolean;
  total: number;
  passed_count: number;
  failed_count?: number;
  signed_at?: number | null;
  signed_by?: string | null;
}

export interface ShiftCurrent {
  shift: Shift;
  operator: Operator;
  machine: Machine;
  tasks: Task[];
  conditions: Conditions;
  checklist_status: ChecklistStatus;
  continuous_operation_min: number;
  last_break_ts: number | null;
}

export interface ChecklistItem {
  id: string;
  group: string;
  label: string;
  hint: string;
  critical: boolean;
  live_signal?: string | null;
}

export type ChecklistResultValue = 'pass' | 'fail' | 'na';

export interface ChecklistResult {
  item_id: string;
  result: ChecklistResultValue;
  note?: string;
}

export interface ChecklistSubmitResponse {
  passed: boolean;
  failed_critical: string[];
  incident_ids: string[];
}

export interface EtaPreviewRequest {
  task_type: TaskType;
  qty: number;
  material: string;
  operator_id: string;
  machine_id: string;
  planned_start: string;
  location?: string;
}

export type SectorState = 'clear' | 'warning' | 'danger';
export type ProximitySector = 'front' | 'right' | 'rear' | 'left';

export interface LiveSnapshot {
  ts: number;
  machine_id: string;
  zone?: string | null;
  seatbelt: boolean;
  proximity: {
    fitted: boolean;
    status?: 'active' | 'not_fitted' | 'fault' | 'stale';
    sectors: Partial<Record<ProximitySector, SectorState>>;
    truck_m: number | null;
    truck_id?: string | null;
    truck_sector?: ProximitySector | null;
    person_m: number | null;
    person_sector?: ProximitySector | null;
    last_good_ts?: number | null;
  };
  travel_kmh: number;
  idle: { today_min: number; waiting_min: number; current_min?: number };
  task?: {
    task_id: string;
    name: string;
    type?: TaskType;
    done_qty: number;
    planned_qty: number;
    unit: string;
    progress_pct: number;
    cycles?: number;
    avg_cycle_s?: number;
  } | null;
  eta?: TaskEstimate | null;
  waiting_for_truck?: boolean;
  continuous_operation_min?: number;
  moving?: boolean;
  swing_dps?: number;
}

export interface ShiftReviewTimelineItem {
  kind: 'task' | 'break' | 'idle' | 'alert';
  t_start: number;
  t_end?: number;
  label: string;
  task_type?: TaskType;
  alert?: Alert;
}

export interface ShiftReview {
  shift_id: string;
  date?: string;
  totals: {
    operating_min: number;
    tasks_done: number;
    tasks_total: number;
    material_m3: number;
    idle_min: number;
  };
  idle_breakdown: { waiting_min: number; warmup_min: number; unexplained_min: number };
  alerts_by_signal_word: Record<string, number>;
  well_done: string[];
  focus?: {
    competency_id: string;
    title: string;
    detail: string;
    evidence_line: string;
    module_id?: string;
    module_title?: string;
    provenance?: Provenance[];
    per_cycle?: Array<{ cycle: number; value: number; flagged: boolean }>;
    band?: { lo: number; hi: number; unit: string; label: string };
  } | null;
  timeline: ShiftReviewTimelineItem[];
}

export interface SyncStatus {
  online: boolean;
  backlog: number;
  last_sync_ts: number | null;
}

export type LiveFrame =
  | { type: 'snapshot'; data: LiveSnapshot }
  | { type: 'alert'; data: Alert }
  | { type: 'alert_cleared'; data: { alert_id: string; ts?: number } | Alert }
  | { type: 'eta'; data: TaskEstimate }
  | { type: 'task'; data: Task }
  | { type: 'health'; data: Health }
  | { type: 'window'; data: Record<string, unknown> };

export type DemoInjectKind = 'seatbelt_open' | 'person_rear' | 'person_warning' | 'fast_swing' | 'hyd_fault' | 'idle' | 'truck_wait' | 'prox_sensor_fault';

// ------------------------------------------------------------------ cloud API shapes
export interface CompetencyEntry {
  id: string;
  label: string;
  state: CompetencyState;
  evidence?: string | null;
  verified_by?: string | null;
  safety_critical?: boolean;
  source?: Provenance[];
}

export interface OperatorProfile {
  operator: Operator;
  competencies: CompetencyEntry[];
  exposure?: { operating_h?: number; loading_cycles?: number; shifts?: number };
  training_history?: Array<{ module_id: string; title: string; completed_ts: number; score?: string }>;
}

export interface Citation {
  chunk_id?: string;
  doc_id: string;
  section: string;
  version: string;
  text?: string;
  title?: string;
}

export interface Recommendation {
  module_id: string;
  title: string;
  duration_min: number;
  why: string;
  evidence?: string;
  competency_id: string;
  status: 'not_started' | 'in_training' | 'completed' | string;
  version?: string;
  approved_by?: string;
  approved_at?: string;
  format?: string;
}

export interface TrainingModule {
  module_id: string;
  title: string;
  competency_id: string;
  duration_min: number;
  format: 'video' | 'micro_lesson' | 'scenario_quiz' | 'simulator' | string;
  version: string;
  approved_by?: string;
  approved_at?: string;
  machine_types?: string[];
  summary?: string;
  steps?: string[];
  key_points: Array<{ text: string; citations: Citation[] }>;
  why_for_you?: string | null;
  status?: string;
  safety_critical?: boolean;
}

export interface QuizQuestion {
  question_id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id?: string;
  explanation?: string;
  citation?: Citation;
}

export interface Quiz {
  module_id: string;
  title?: string;
  pass_mark?: number;
  questions: QuizQuestion[];
}

export interface QuizAttemptResponse {
  attempt_id?: string;
  score: number;
  total: number;
  passed: boolean;
  results?: Array<{ question_id: string; correct: boolean; correct_option_id?: string; explanation?: string }>;
  next?: string;
}

export interface Instructor {
  instructor_id: string;
  name: string;
  specialties: string[];
  formats: string[];
  initials?: string;
}

export interface InstructorSlot {
  slot_id: string;
  instructor_id: string;
  start_ts: number;
  end_ts: number;
  format: 'on_machine' | 'simulator' | 'video_call' | string;
  location?: string;
  available?: boolean;
}

export interface BookingRequest {
  operator_id: string;
  slot_id: string;
  competency_id?: string;
  module_id?: string;
  evidence?: string;
}

export interface Booking {
  booking_id: string;
  slot_id: string;
  operator_id: string;
  status: string;
  provenance?: Provenance[];
}

export interface CopilotAnswer {
  answer: string;
  citations: Citation[];
  mode: 'generative' | 'extractive' | 'refused';
}

export interface RateBlock {
  events: number;
  opportunities: number;
  rate: number;
}

export interface Reassessment {
  operator_id?: string;
  competency_id?: string;
  pre: RateBlock;
  post: RateBlock;
  rr: number;
  ci95: [number, number];
  verdict: string;
  label: 'SIMULATED' | string;
  per_shift?: Array<{ shift: string; events: number; opportunities: number; rate: number; lo: number; hi: number }>;
  training_completed?: string;
  competency_state?: CompetencyState;
}

export interface CrewMachineRow {
  machine_id: string;
  model: string;
  operator_id: string;
  operator_name: string;
  task: string;
  task_detail?: string;
  progress_pct: number;
  progress_label: string;
  estimate?: { p10_ts: number; p50_ts: number; p90_ts: number } | null;
  protection: 'active' | 'degraded' | 'not_fitted';
  protection_note?: string;
  alerts_by_signal_word: Record<string, number>;
  continuous_operation_min: number;
  last_sync_ts: number;
  idle_min?: number;
  idle_fuel_l?: number;
}

export interface CrewSummary {
  site: string;
  shift_label: string;
  kpis: {
    machines_active: number;
    machines_total: number;
    protection_degraded: number;
    open_escalations: number;
    idle_today_min: number;
    idle_waiting_pct: number;
    tasks_on_track: number;
    tasks_total: number;
    /** Unexplained idle fuel today (litres) and its cost (ESTIMATE), when the cloud provides them. */
    idle_fuel_l?: number;
    idle_fuel_usd?: number;
  };
  machines: CrewMachineRow[];
}

export interface Escalation {
  escalation_id: string;
  machine_id: string;
  operator_id: string;
  operator_name?: string;
  what: string;
  detail?: string;
  ts: number;
  status: 'open' | 'resolved';
  note?: string | null;
}

export interface MachineIssue {
  machine_id: string;
  issue: string;
  attribution: Attribution;
  since_ts: number;
  dtc?: string[];
  operators_affected?: number;
}

export interface IdleSummary {
  date: string;
  machines: Array<{
    machine_id: string;
    days: Array<{ date: string; waiting_min: number; warmup_min: number; unexplained_min: number }>;
  }>;
  longest_unexplained: Array<{ machine_id: string; operator_id: string; start_ts: number; duration_min: number; context: string }>;
  fuel_unexplained_l: number;
  fuel_unexplained_usd?: number;
  fuel_usd_per_l?: number;
  provenance?: Provenance[];
}

export interface InstructorOperatorRow {
  operator_id: string;
  name: string;
  level?: string;
  competencies: Array<{ id: string; state: CompetencyState }>;
}

export interface ContentReviewItem {
  review_id: string;
  module_id: string;
  title: string;
  version: string;
  change_summary: string;
  sources_cited: number;
  citation_check: 'PASS' | 'FAIL';
  status: 'draft' | 'in_review' | 'approved' | 'changes_requested';
  diff?: Array<{ op: 'same' | 'add' | 'del'; text: string; citation?: string }>;
}

export interface AlertRates {
  per_operating_hour: number;
  budget: number;
  by_tier?: Record<string, number>;
  feedback_not_correct?: Array<{ type: string; count: number; total: number }>;
  latency_ms?: { rule_p50: number; rule_p99: number; ml_p50: number; ml_p99: number };
  edge_cpu_pct?: number;
  queue_depth?: number;
  last_sync_ts?: number;
}

export interface DriftReport {
  features: Array<{ feature: string; psi: number; series: number[]; status?: string }>;
  window?: string;
}

export interface ModelCard {
  kind: string;
  name?: string;
  version: string;
  training_data: string;
  features?: number | string[];
  metrics?: Record<string, number | string>;
  limits?: string[];
  sha256?: string;
  threshold?: string;
  provenance?: Provenance[];
}

export interface CompetencyCatalogEntry {
  id: string;
  label: string;
  safety_critical: boolean;
}

// ------------------------------------------------------------------ business value (cloud /value, ESTIMATE)
export type ValueScenario = 'low' | 'base' | 'high';

export interface ValueEstimateRequest {
  fleet_size: number;
  overrides: Record<string, number>;
  scenario: ValueScenario;
}

export interface ValueLeverResult {
  lever: string;
  label: string;
  annual_usd_per_machine: number;
  kpi?: string;
  formula?: string;
  provenance?: string[];
}

export interface ValueSensitivityRow {
  key: string;
  label: string;
  low_usd: number;
  high_usd: number;
  low_input?: number | string;
  high_input?: number | string;
}

export interface ValueEstimate {
  scenario: ValueScenario;
  fleet_size: number;
  annual_value_usd_per_machine: number;
  annual_value_usd_fleet: number;
  annual_cost_usd_per_machine?: number;
  one_off_cost_usd_per_machine?: number;
  payback_months: number | null;
  levers: ValueLeverResult[];
  sensitivity?: ValueSensitivityRow[];
  label?: string;
  notes?: string[];
  inputs?: Record<string, number>;
  /** Operational gains per machine-year behind the money (from the value model). */
  gains_per_machine?: Record<string, number>;
  /** Monte Carlo P10/P50/P90 of gross value per machine (the headline range). */
  range_usd_per_machine?: { p10: number; p50: number; p90: number };
  payback_range_months?: { p10: number; p50: number; p90: number };
}

export interface ValueAssumption {
  key: string;
  label: string;
  value: number;
  unit: string;
  low?: number;
  high?: number;
  lever?: string;
  kind?: 'published' | 'assumption' | 'simulated' | 'customer';
  source?: string;
  source_url?: string | null;
  note?: string;
}

export interface ValueLeverMap {
  feature: string;
  lever: string;
  kpi: string;
  how_measured: string;
  route?: string;
  provenance?: string[];
}

/** GET /value/unit-costs — prices used to put an ESTIMATE $ figure next to outcomes. */
export interface ValueUnitCosts {
  currency?: string;
  fuel_usd_per_l: number;
  idle_fuel_l_per_h: number;
  operator_usd_per_h: number;
  machine_usd_per_h: number;
  truck_wait_usd_per_min: number;
  crew_wait_usd_per_min: number;
  value_per_m3_usd: number;
  /** Expected cost of one event of this signal word (frequency × severity × cost; expected value, not measured). */
  incident_expected_cost_usd: Record<string, number>;
  label?: string;
}

/** A gain in operational units (m³, L, h, min, count). `usd` is only used on the Business Value page. */
export interface ValueLineItem {
  key: string;
  label: string;
  value: number;
  unit: string;
  detail?: string;
  usd?: number;
  provenance?: string[];
}

/** POST /value/today — "value today (estimate)" for a site/shift. */
export interface ValueToday {
  date?: string;
  total_usd?: number;
  line_items: ValueLineItem[];
  label?: string;
  note?: string;
}

export interface ValueHeadline {
  key: string;
  /** "gain" = operational units (hero on landing/tour); "money" = $ (Business Value page only). */
  kind?: 'gain' | 'money';
  label: string;
  value: number;
  unit: string;
  low?: number;
  high?: number;
  note?: string;
}

/** GET /value/pitch — headline numbers for the landing / tour hero. */
export interface ValuePitch {
  headlines: ValueHeadline[];
  label?: string;
  scenario?: string;
  fleet_size?: number;
  caveat?: string;
}

// ------------------------------------------------------------------ cohort simulation (cloud /practice/cohort-sim, SIMULATED)
export interface CohortCurvePoint {
  session: number;
  p05: number;
  p50: number;
  p95: number;
  mean?: number;
}

export interface CohortArm {
  label: string;
  curve: CohortCurvePoint[];
  /** Per simulated trainee: first session in the proficient band (null = not reached). */
  sessions_to_proficient: Array<number | null>;
  median_sessions_to_proficient: number | null;
  share_proficient_by_session_8?: number;
  output_m3_per_h_first?: number;
  output_m3_per_h_last?: number;
  fast_swing_share_first?: number;
  fast_swing_share_last?: number;
}

export interface CohortSim {
  n: number;
  sessions: number;
  effect: number;
  bands: { proficient: number; expert_like: number };
  arms: { coached: CohortArm; control: CohortArm };
  label?: string;
  caveat?: string;
  model_version?: string;
}

/** GET /value/gains-headline — headline gains in operational units for the landing hero. */
export interface ValueGain {
  key: string;
  label: string;
  unit: string;
  value: number;
  low?: number;
  high?: number;
  headline?: string;
  basis?: string;
  evidence?: Array<{ claim: string; source: string; tag: string }>;
}

export interface ValueGainsHeadline {
  gains: ValueGain[];
  label?: string;
  status?: string;
}
