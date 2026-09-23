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
  stream_kind: StreamKind;
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
  meta?: Record<string, unknown>;
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

export interface SupDashboard {
  counts?: TaskCounts;
  tasks?: TcTask[];
  operators?: SupOperatorRow[];
  open_tickets?: number;
  ts?: number;
  ts_gmt?: string | null;
}

// ---------------------------------------------------------------- operator responses
export interface OpToday {
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
  supervisor?: User | null;
  active_alarm?: Notification | null;
  notifications?: Notification[];
}

export interface CheckpointUpdate {
  checkpoint_id: string;
  done: number | boolean;
}

export interface ProgressCreate {
  kind: ProgressKind;
  text: string;
}
