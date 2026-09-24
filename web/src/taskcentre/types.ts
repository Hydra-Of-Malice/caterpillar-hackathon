/**
 * TypeScript mirrors of the `/api/v1/tc/*` payloads (docs/taskcentre-contract.md,
 * sentinel/store/taskcentre_models.py).
 *
 * Time rule: every operational timestamp is **UTC seconds** (`*_ts` / `ts`) and the API may add a
 * pre-rendered GMT string (`*_gmt`). Never format a stored time with the browser's timezone —
 * use `taskcentre/time.ts`.
 *
 * Response envelopes are typed loosely where the contract does not pin them down (optional fields,
 * `by_*` maps): the client normalises list shapes, and pages render what is actually present rather
 * than inventing values.
 */

// ---------------------------------------------------------------- enums
export type Role = 'admin' | 'supervisor' | 'operator';
export type GeofenceStatus = 'inside' | 'outside' | 'unverified';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'confirmed' | 'dismissed' | 'resolved';
export type TicketDecision = 'confirmed' | 'dismissed' | 'more_info' | 'resolved' | 'acknowledged';
export type TaskStatus = 'pending' | 'ongoing' | 'completed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type PunchKind = 'start_work' | 'finish_work';
export type ProgressKind = 'note' | 'delay' | 'status' | 'checkpoint' | 'exception_resolved';
export type CheckpointKind = 'checkbox' | 'counted';
export type EvidenceSource = 'SIMULATED' | 'RULE' | 'MANUAL';
export type StreamKind = 'simulated' | 'unavailable' | 'live';
export type NotificationKind = 'critical_incident' | 'ticket' | 'chat' | 'task' | 'fatigue' | 'info' | string;
export type TicketKind = 'geofence_punch' | 'ai_idle' | 'fatigue' | 'task_overrun' | 'critical_incident' | string;
export type DispatchStatus = 'dispatched' | 'no_eligible_operator';

// ---------------------------------------------------------------- people & access
export interface User {
  user_id: string;
  username: string;
  role: Role;
  name: string;
  site_id: string;
  supervisor_id?: string | null;
  machine_id?: string | null;
  active?: boolean;
  created_at?: number;
  created_at_gmt?: string | null;
  meta?: Record<string, unknown>;
}

/** A position fix supplied by the browser. Absent fields mean "not known", never zero. */
export interface GeoFix {
  lat: number;
  lon: number;
  accuracy_m?: number;
}

/** The login punch recorded server-side (server clock, never the browser's). */
export interface LoginInfo {
  ts: number;
  ts_gmt?: string | null;
  geofence_status: GeofenceStatus;
  distance_m?: number | null;
  accuracy_m?: number | null;
  geofence_id?: string | null;
  punch_id?: string | null;
  ticket_id?: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
  login?: LoginInfo;
  expires_at?: number;
  expires_at_gmt?: string | null;
}

/** `tc_session` as the API exposes it (no password material). */
export interface Session {
  token: string;
  user_id: string;
  created_at: number;
  created_at_gmt?: string | null;
  expires_at: number;
  expires_at_gmt?: string | null;
  login_lat?: number | null;
  login_lon?: number | null;
  login_accuracy_m?: number | null;
  login_geofence?: GeofenceStatus;
}

export interface Site {
  site_id: string;
  name: string;
  meta?: Record<string, unknown>;
}

export interface Geofence {
  geofence_id: string;
  site_id: string;
  name: string;
  center_lat: number;
  center_lon: number;
  radius_m: number;
  max_accuracy_m?: number;
  active?: boolean;
}

// ---------------------------------------------------------------- location & punches
export interface LocationReport {
  id?: number;
  user_id: string;
  ts: number;
  ts_gmt?: string | null;
  lat?: number | null;
  lon?: number | null;
  accuracy_m?: number | null;
  geofence_status: GeofenceStatus;
  source?: 'browser' | 'simulated' | 'manual' | string;
  distance_m?: number | null;
  /** Server-computed age of the fix in seconds, when provided. */
  age_s?: number | null;
  stale?: boolean;
}

export interface Punch {
  punch_id: string;
  user_id: string;
  kind: PunchKind;
  ts: number;
  ts_gmt?: string | null;
  lat?: number | null;
  lon?: number | null;
  accuracy_m?: number | null;
  geofence_status: GeofenceStatus;
  geofence_id?: string | null;
  distance_m?: number | null;
  ticket_id?: string | null;
}

// ---------------------------------------------------------------- cameras & machines
export interface Camera {
  camera_id: string;
  site_id?: string;
  machine_id?: string | null;
  label: string;
  stream_kind?: StreamKind;
  /** `/tc/admin/cameras` sends these two instead of `stream_kind`. Read via `cameraKind`. */
  reported_stream_kind?: StreamKind;
  state?: string;
  available?: boolean;
  unavailable_reason?: string | null;
  /** A file staged at media/cameras/<camera_id>/still.* — served scoped, never a live feed. */
  still_available?: boolean;
  still_url?: string | null;
  still_kind?: string | null;
  clip_available?: boolean;
  clip_url?: string | null;
  clip_kind?: string | null;
  last_frame_ts?: number | null;
  last_frame_gmt?: string | null;
  age_s?: number | null;
  stale?: boolean;
  meta?: Record<string, unknown>;
}

export interface MachineStatus {
  machine_id: string;
  label?: string | null;
  status?: string | null; // active | idle | fault | offline | unknown
  operator_id?: string | null;
  operator_name?: string | null;
  last_seen_ts?: number | null;
  last_seen_gmt?: string | null;
  age_s?: number | null;
  stale?: boolean;
  open_tickets?: number;
  open_incidents?: number;
  detail?: string | null;
}

// ---------------------------------------------------------------- tasks
export interface Checkpoint {
  checkpoint_id: string;
  task_id: string;
  order_index: number;
  label: string;
  kind: CheckpointKind;
  target: number;
  done: number;
  required: boolean;
  updated_at?: number | null;
  updated_at_gmt?: string | null;
}

export interface TaskProgress {
  id?: number;
  task_id: string;
  user_id: string;
  user_name?: string | null;
  ts: number;
  ts_gmt?: string | null;
  kind: ProgressKind;
  text: string;
  data?: Record<string, unknown>;
}

export interface TcTask {
  task_id: string;
  site_id: string;
  operator_id: string;
  operator_name?: string | null;
  supervisor_id: string;
  supervisor_name?: string | null;
  title: string;
  instructions: string;
  location: string;
  machine_id?: string | null;
  priority: Priority;
  status: TaskStatus;
  start_ts: number;
  start_gmt?: string | null;
  expected_finish_ts: number;
  expected_finish_gmt?: string | null;
  started_at?: number | null;
  started_at_gmt?: string | null;
  finished_at?: number | null;
  finished_at_gmt?: string | null;
  overrun_ticket_id?: string | null;
  overdue?: boolean;
  created_at?: number;
  created_at_gmt?: string | null;
  checkpoints?: Checkpoint[];
  progress?: TaskProgress[];
  /** Pre-start inspection state, carried on every task in `GET /op/today`. */
  checklist?: TaskChecklistSummary | null;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------- pre-start checklist
/** One answer to one item. `na` never blocks; a `fail` must carry a note. */
export type ChecklistResult = 'pass' | 'fail' | 'na';

export interface ChecklistGroup {
  id: string;
  label: string;
}

/** An item as the operator sees it: the question, plus the answer already stored for this task. */
export interface ChecklistItemView {
  id: string;
  group: string;
  label: string;
  hint?: string | null;
  critical: boolean;
  /** Names a live telemetry value the operator should read on the machine before answering. */
  live_signal?: string | null;
  result: ChecklistResult | null;
  note: string | null;
}

export interface ChecklistFailedCritical {
  item_id: string;
  label: string;
  note?: string | null;
}

/** The server's verdict. `completed`/`blocked` are the only gate the UI trusts. */
export interface ChecklistStatus {
  version?: string;
  total: number;
  answered: number;
  passed: number;
  failed: number;
  na: number;
  missing: string[];
  failed_critical: ChecklistFailedCritical[];
  completed: boolean;
  blocked: boolean;
  signed_at?: number | null;
  signed_at_gmt?: string | null;
  signed_by?: string | null;
}

/** `GET /op/tasks/{id}/checklist`. */
export interface ChecklistView {
  task_id: string;
  groups: ChecklistGroup[];
  items: ChecklistItemView[];
  status: ChecklistStatus;
}

export interface ChecklistAnswer {
  item_id: string;
  result: ChecklistResult;
  note?: string;
}

/** Compact state on a task card — enough to label it without loading the whole checklist. */
export interface TaskChecklistSummary {
  completed: boolean;
  blocked: boolean;
  answered: number;
  total: number;
  failed_critical_count: number;
}

/** A `409` from `POST /op/tasks/{id}/start`, read back into something the screen can explain. */
export interface StartConflict {
  error: 'checklist_incomplete' | 'checklist_critical_failed' | string;
  /** The server's own words, always kept so nothing is invented. */
  message: string;
  missing?: string[];
  answered?: number;
  total?: number;
  failed_critical?: ChecklistFailedCritical[];
  ticket_id?: string | null;
}

/** Body for POST /sup/tasks (agent G). */
export interface TaskCreate {
  operator_id: string;
  title: string;
  instructions?: string;
  location?: string;
  machine_id?: string | null;
  priority?: Priority;
  start_ts: number;
  expected_finish_ts: number;
  checkpoints?: Array<{ label: string; kind?: CheckpointKind; target?: number; required?: boolean }>;
}

// ---------------------------------------------------------------- chat
export interface ChatMessage {
  message_id: string;
  thread_key: string;
  from_user_id: string;
  from_name?: string | null;
  to_user_id: string;
  ts: number;
  ts_gmt?: string | null;
  text: string;
  task_id?: string | null;
  read_at?: number | null;
  system?: boolean;
}

export interface ChatThread {
  thread_key?: string;
  other_user?: User | null;
  messages: ChatMessage[];
  unread?: number;
}

// ---------------------------------------------------------------- tickets & review
export interface ReviewDecision {
  id?: number;
  ticket_id: string;
  reviewer_id: string;
  reviewer_name?: string | null;
  reviewer_role: Role | string;
  decision: TicketDecision;
  comment: string;
  ts: number;
  ts_gmt?: string | null;
  data?: Record<string, unknown>;
}

export interface Ticket {
  ticket_id: string;
  site_id: string;
  kind: TicketKind;
  severity: Severity;
  status: TicketStatus;
  /** What the API actually sends: the person the flag is about, nested. */
  subject_user?: { user_id?: string | null; name?: string | null } | null;
  /** Flat forms some responses use instead. Read all three through `ticketSubject`. */
  subject_user_id?: string | null;
  subject_name?: string | null;
  owner_role: Role | string;
  owner_user_id?: string | null;
  owner_name?: string | null;
  title: string;
  detail: string;
  source: EvidenceSource;
  evidence?: Record<string, unknown>;
  created_at: number;
  created_at_gmt?: string | null;
  task_id?: string | null;
  machine_id?: string | null;
  incident_id?: string | null;
  /** Present on detail responses; the list endpoint may omit it. */
  decisions?: ReviewDecision[];
}

/** Body for POST /admin/tickets/{id}/decision and POST /sup/review/{id}. */
export interface DecisionBody {
  decision: TicketDecision;
  comment?: string;
  message_to_operator?: string;
}

// ---------------------------------------------------------------- incidents & notifications
export interface TcIncident {
  incident_id: string;
  site_id: string;
  machine_id: string;
  kind: string;
  severity: Severity;
  ts: number;
  ts_gmt?: string | null;
  lat?: number | null;
  lon?: number | null;
  detail: string;
  source: EvidenceSource;
  nearest_user_id?: string | null;
  nearest_user_name?: string | null;
  nearest_distance_m?: number | null;
  dispatch_status: DispatchStatus;
  acknowledged_by?: string | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: number | null;
  acknowledged_at_gmt?: string | null;
  notified_user_ids?: string[];
  notified_users?: Array<{ user_id: string; name?: string; role?: Role }>;
  dedupe_key?: string;
  data?: Record<string, unknown>;
}

export interface Notification {
  notification_id: string;
  user_id: string;
  ts: number;
  ts_gmt?: string | null;
  kind: NotificationKind;
  severity: Severity | 'info';
  title: string;
  body: string;
  alarm: boolean;
  link?: string | null;
  incident_id?: string | null;
  ticket_id?: string | null;
  read_at?: number | null;
  acknowledged_at?: number | null;
  /** Populated by the API for alarm notifications so the banner can show the incident. */
  incident?: TcIncident | null;
}

// ---------------------------------------------------------------- training & simulation
export interface TrainingVideo {
  video_id: string;
  title: string;
  category: string;
  duration_min: number;
  url?: string | null;
  description: string;
  label: string;
  order_index?: number;
}

export interface SimScenario {
  name: string;
  title?: string;
  /** What the scenario demonstrates, from GET /sim/scenarios. */
  description?: string;
  demonstrates?: string;
  expects?: string;
  role?: Role | string;
  link?: string | null;
}

/** POST /sim/scenario/{name} — what the run created, so the demo panel can link to it. */
export interface SimScenarioResult {
  name?: string;
  ok?: boolean;
  status?: string;
  message?: string;
  detail?: string;
  created?: Record<string, unknown>;
  incident_id?: string | null;
  ticket_id?: string | null;
  event_id?: string | null;
  notification_ids?: string[];
  task_id?: string | null;
  user_id?: string | null;
  dispatch_status?: DispatchStatus | string;
  links?: Array<{ label: string; to: string }>;
}

// ---------------------------------------------------------------- admin responses
export interface TicketCounts {
  open?: number;
  confirmed?: number;
  dismissed?: number;
  resolved?: number;
  total?: number;
  by_kind?: Record<string, number>;
  by_severity?: Record<string, number>;
}

export interface IncidentCounts {
  total?: number;
  open?: number;
  unacknowledged?: number;
  no_eligible_operator?: number;
}

export interface AdminOverview {
  /** The API stamps the clock as `now_ts`; `ts` is kept for older callers. */
  now_ts?: number;
  now_ts_gmt?: string | null;
  ts?: number;
  ts_gmt?: string | null;
  /** Counts are nested here by GET /admin/overview. */
  totals?: {
    machines?: number;
    cameras?: number;
    cameras_available?: number;
    cameras_stale?: number;
    tickets?: TicketCounts;
    incidents?: IncidentCounts;
    people?: { on_site?: number; off_site?: number; unverified?: number; stale?: number; never_reported?: number };
  };
  staleness_s?: number;
  disclaimer?: string;
  site?: Site | null;
  machines?: MachineStatus[];
  cameras?: Camera[];
  tickets?: TicketCounts;
  incidents?: IncidentCounts;
  people?: { total?: number; on_site?: number; stale?: number; unverified?: number };
  stale_after_s?: number;
}

/** One row of GET /admin/people. `user` may be nested or flattened — use `personOf()`. */
export interface PersonRow {
  user_id: string;
  user?: User;
  username?: string;
  name?: string;
  role?: Role;
  site_id?: string;
  supervisor_id?: string | null;
  /** `/tc/admin/people` nests the supervisor here; `supervisor_name` is the older flat shape. */
  supervisor?: User | null;
  supervisor_name?: string | null;
  machine_id?: string | null;
  active?: boolean;
  location?: LocationReport | null;
  geofence_status?: GeofenceStatus;
  distance_m?: number | null;
  accuracy_m?: number | null;
  last_seen_ts?: number | null;
  last_seen_gmt?: string | null;
  age_s?: number | null;
  stale?: boolean;
  last_punch?: Punch | null;
  on_shift?: boolean;
}

export interface TicketFilters {
  status?: TicketStatus | '';
  kind?: string;
  user?: string;
  machine?: string;
}

// ---------------------------------------------------------------- supervisor responses
export interface TaskCounts {
  pending?: number;
  ongoing?: number;
  completed?: number;
  overdue?: number;
  cancelled?: number;
  total?: number;
}

export interface SupOperatorRow {
  user_id: string;
  user?: User;
  name?: string;
  username?: string;
  machine_id?: string | null;
  tasks?: TaskCounts;
  location?: LocationReport | null;
  geofence_status?: GeofenceStatus;
  age_s?: number | null;
  stale?: boolean;
  unread_messages?: number;
  open_tickets?: number;
  active_alarm?: boolean;
}

export interface SupOperatorDetail {
  operator: User;
  tasks?: TcTask[];
  counts?: TaskCounts;
  location?: LocationReport | null;
  punches?: Punch[];
  tickets?: Ticket[];
  messages?: ChatMessage[];
}

/** `POST /tc/sup/review/{id}/alert` — what the supervisor sent and how long it will sound. */
export interface AlertResult {
  ticket?: Ticket;
  operator?: User;
  notification_id?: string;
  message?: string;
  alert_seconds?: number;
  controls_machinery?: boolean;
  note?: string;
  sent_at?: number;
  sent_at_gmt?: string | null;
}

export interface SupDashboard {
  counts?: TaskCounts;
  /** Flattened from `buckets` by the client when the API sends the buckets instead of a flat list. */
  tasks?: TcTask[];
  /** What `/tc/sup/dashboard` actually returns: bucket name -> tasks, with `overdue` overlapping. */
  buckets?: Record<string, TcTask[]>;
  operators?: SupOperatorRow[];
  open_tickets?: number;
  ts?: number;
  ts_gmt?: string | null;
}

// ---------------------------------------------------------------- waiting time
/**
 * A pause the operator declares and is not answerable for. `waiting_for_truck` is the default —
 * the one-tap case in the cab — and the others cover a stopped machine or a delay already known
 * about. The recorded time is reported as *waiting*, never as the operator's idle time.
 */
export type WaitingReason = 'waiting_for_truck' | 'machine_paused' | 'expected_delay';

/** One recorded stretch of waiting. Open while `ended_at` is null. */
export interface WaitingPeriod {
  /** The API field is `wait_id`; `id` is tolerated for older callers. */
  wait_id?: string;
  id?: string;
  reason?: WaitingReason | string;
  reason_label?: string;
  user_id?: string;
  source?: string;
  minutes_in_window?: number;
  minutes_now?: number;
  started_at?: number;
  started_at_gmt?: string | null;
  ended_at?: number | null;
  ended_at_gmt?: string | null;
  minutes?: number;
  task_id?: string | null;
  note?: string | null;
  active?: boolean;
}

/** `POST /op/waiting/start` */
export interface WaitingStartResponse {
  wait?: WaitingPeriod;
  active?: boolean;
  started_at?: number;
  started_at_gmt?: string | null;
}

/** `POST /op/waiting/stop` */
export interface WaitingStopResponse {
  wait?: WaitingPeriod;
  active?: boolean;
  minutes?: number;
}

/** `GET /op/waiting` — the day's waiting, with the open period if there is one. */
export interface WaitingSummary {
  total_minutes?: number;
  by_reason?: Record<string, number>;
  periods?: WaitingPeriod[];
  active?: WaitingPeriod | null;
}

/** The `waiting` block carried on `GET /op/today`, which the operator screens poll. */
export interface OpWaiting {
  active?: boolean;
  reason?: WaitingReason | string | null;
  since_ts?: number | null;
  since_gmt?: string | null;
  minutes_now?: number | null;
  today_total_minutes?: number;
  by_reason?: Record<string, number>;
}

// ---------------------------------------------------------------- operator responses
export interface OpToday {
  /** What `/tc/op/today` actually names the person; `user` is the older shape. Read both. */
  operator?: User;
  user?: User;
  ts?: number;
  ts_gmt?: string | null;
  tasks?: TcTask[];
  ongoing_task?: TcTask | null;
  login?: LoginInfo | null;
  start_work?: Punch | null;
  finish_work?: Punch | null;
  geofence_status?: GeofenceStatus;
  location?: LocationReport | null;
  counts?: TaskCounts;
  unread_messages?: number;
  /** The person this operator messages. `null` only when nobody is assigned. */
  supervisor?: User | null;
  active_alarm?: Notification | null;
  notifications?: Notification[];
  /** Declared waiting time — the open wait, if any, and the day's running totals. */
  waiting?: OpWaiting | null;
}

export interface CheckpointUpdate {
  checkpoint_id: string;
  done: number | boolean;
}

export interface ProgressCreate {
  kind: ProgressKind;
  text: string;
}

// ---------------------------------------------------------------- supervisor: training profile
/** Where an operator has got to on one training item. */
export type TrainingStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * One training item in an operator's profile, as `GET /sup/operators/{id}/training` returns it.
 * `label` is the DEMO marker carried by the backend — it is rendered on every item, because this
 * is placeholder training content written for the prototype, not official Caterpillar material.
 */
export interface TrainingItem {
  video_id: string;
  title: string;
  category: string;
  duration_min: number;
  label: string;
  status: TrainingStatus;
  /** 0–100 for an item in progress. */
  percent?: number | null;
  started_at?: number | null;
  started_at_gmt?: string | null;
  completed_at?: number | null;
  completed_at_gmt?: string | null;
  assigned_by?: string | null;
  assigned_at?: number | null;
  assigned_at_gmt?: string | null;
}

export interface TrainingSummary {
  total?: number;
  completed?: number;
  in_progress?: number;
  not_started?: number;
  /** 0–100. */
  percent_complete?: number | null;
  minutes_completed?: number | null;
  last_activity_ts?: number | null;
  last_activity_ts_gmt?: string | null;
}

export interface TrainingCategoryStat {
  total?: number;
  completed?: number;
}

export interface SupTrainingProfile {
  user?: User;
  items?: TrainingItem[];
  summary?: TrainingSummary;
  by_category?: Record<string, TrainingCategoryStat>;
}

// ---------------------------------------------------------------- operator: their own training
/**
 * `GET /tc/op/training/profile` — the operator's own record. It is the same record a supervisor
 * reads for them, read by its owner, so it carries the same shape: every item with its status and
 * percent, the summary, and the per-category roll-up.
 */
export type OpTrainingProfile = SupTrainingProfile;

/**
 * `POST /tc/op/training/{video_id}/progress` — what the operator actually watched. `percent` is
 * reported by the player, never assumed; `completed` closes the item.
 */
export interface TrainingProgressUpdate {
  /** 0–100. */
  percent: number;
  completed?: boolean;
}

// ---------------------------------------------------------------- supervisor: efficiency
export interface EfficiencyTasks {
  assigned?: number;
  completed?: number;
  completed_on_time?: number;
  completed_late?: number;
  ongoing?: number;
  pending?: number;
}

export interface EfficiencyDuration {
  median_minutes?: number | null;
  /** Actual minus planned, in minutes: negative is early, positive is over. */
  planned_vs_actual_minutes?: number | null;
  total_working_minutes?: number | null;
}

/** Waiting the operator declared and explained. Excluded from working time, never held against them. */
export interface EfficiencyWaiting {
  declared_minutes?: number | null;
  by_reason?: Record<string, number>;
}

export interface EfficiencyCheckpoints {
  required_total?: number;
  completed?: number;
  exception_resolved?: number;
}

export interface EfficiencyChecklist {
  tasks_with_check?: number;
  critical_fails?: number;
}

/** Flag counts split by what a human decided: open = nobody has reviewed it yet. */
export interface EfficiencyFlags {
  ai_idle_open?: number;
  ai_idle_dismissed?: number;
  ai_idle_confirmed?: number;
  overruns?: number;
  geofence?: number;
}

/** `GET /sup/operators/{id}/efficiency?days=` — facts with their evidence, never a hidden score. */
export interface SupEfficiency {
  /** `/tc/sup/efficiency` nests the person here; other endpoints use `user`. Both are read. */
  operator?: User;
  user?: User;
  user_id?: string;
  name?: string;
  username?: string;
  days?: number;
  tasks?: EfficiencyTasks;
  /** Fraction (0–1) or percent (0–100); the UI normalises both. */
  on_time_rate?: number | null;
  duration?: EfficiencyDuration;
  waiting?: EfficiencyWaiting;
  checkpoints?: EfficiencyCheckpoints;
  checklist?: EfficiencyChecklist;
  flags?: EfficiencyFlags;
  evidence?: Record<string, unknown>;
  /** Rendered verbatim — the backend says here what these numbers do not cover. */
  caveats?: string[];
}

/** `GET /sup/efficiency?days=` — one row per operator plus team totals. Ordered by name, not ranked. */
export interface SupTeamEfficiency {
  days?: number;
  operators?: SupEfficiency[];
  rows?: SupEfficiency[];
  totals?: SupEfficiency;
  team?: SupEfficiency;
  ordering?: string;
  caveats?: string[];
}

// ---------------------------------------------------------------- foresight (admin)
/**
 * `GET /admin/foresight` — deterministic rule output over facts already recorded, **not** a
 * trained forecast. Every item carries the facts it was built from so a reader can check it, and
 * `caveats` is rendered verbatim: nothing here decides anything or touches a machine.
 */
export type Likelihood = 'low' | 'moderate' | 'elevated' | 'high';

/** One recorded fact a risk item was derived from, with the time it was observed. */
export interface ForesightBasis {
  fact: string;
  value?: string | number | boolean | null;
  observed_at_gmt?: string | null;
  observed_at?: number | null;
}

/** A suggestion for a person to take or ignore. The UI never performs it automatically. */
export interface ForesightAction {
  action: string;
  owner_role?: Role | string | null;
  endpoint_hint?: string | null;
  label?: string | null;
  detail?: string | null;
}

export interface ForesightAffected {
  operators?: Array<string | { user_id?: string; name?: string }>;
  machines?: string[];
}

export interface ForesightItem {
  risk_id: string;
  kind: string;
  title: string;
  what_could_happen: string;
  likelihood: Likelihood | string;
  basis?: ForesightBasis[];
  affected?: ForesightAffected;
  recommended_actions?: ForesightAction[];
  /** `RULE` for rule output — shown with <SimulatedChip> so the provenance is on screen. */
  source?: EvidenceSource | string;
  note?: string | null;
  severity?: Severity | string | null;
}

export interface ForesightResponse {
  generated_at?: number | null;
  generated_at_gmt?: string | null;
  site_id?: string | null;
  items?: ForesightItem[];
  counts?: { by_likelihood?: Partial<Record<Likelihood, number>> & Record<string, number | undefined> };
  /** How the items were produced. Rendered verbatim. */
  method?: string | null;
  method_version?: string | null;
  /**
   * The backend's standing honesty sentence — it must travel with this view wherever it is shown.
   * Rendered verbatim and never paraphrased or softened.
   */
  note?: string | null;
  /** What this does not cover. Rendered verbatim, never paraphrased or softened. */
  caveats?: string[];
}

/** `POST /admin/foresight/{risk_id}/act` — what the routing actually did. */
export interface ForesightActResult {
  ok?: boolean;
  status?: string;
  message?: string;
  detail?: string;
  action?: string;
  risk_id?: string;
  notified_user_ids?: string[];
  notified_users?: Array<{ user_id: string; name?: string; role?: Role }>;
  ticket_id?: string | null;
  notification_ids?: string[];
  ts?: number | null;
  ts_gmt?: string | null;
}

// ---------------------------------------------------------------- operator flags
export type FlagResponseKind = 'acknowledged' | 'disputed';

/**
 * `GET /op/flags` — a flag raised about this operator that is waiting for their account of it.
 * Their answer is added to the record; it never replaces the original detection.
 */
export interface OpFlag {
  ticket_id: string;
  kind: TicketKind;
  severity: Severity | string;
  title: string;
  detail?: string;
  created_at?: number | null;
  created_at_gmt?: string | null;
  source?: EvidenceSource | string;
  machine_id?: string | null;
  task_id?: string | null;
  evidence?: Record<string, unknown>;
  /** Present once answered, so the screen can show what was recorded. */
  response?: FlagResponseKind | null;
  responded_at?: number | null;
  responded_at_gmt?: string | null;
  response_comment?: string | null;
  distance_m?: number | null;
  supervisor_name?: string | null;
}

/** `POST /op/flags/{ticket_id}/respond` — the operator's account, added to the record. */
export interface FlagRespondResult {
  ok?: boolean;
  status?: string;
  message?: string;
  detail?: string;
  ticket_id?: string;
  response?: FlagResponseKind;
  responded_at?: number | null;
  responded_at_gmt?: string | null;
  notified_user_ids?: string[];
  notified_users?: Array<{ user_id: string; name?: string; role?: Role }>;
}
