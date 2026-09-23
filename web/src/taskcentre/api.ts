/**
 * Typed client for the Task Centre API (`/api/v1/tc/*` on the cloud service).
 *
 * - Base URL from `VITE_CLOUD_URL` (default `http://127.0.0.1:8100/api/v1`), then `/tc`.
 * - Bearer token in `localStorage["tc.token"]`, attached to every call.
 * - `401` clears the token and sends the browser to the role's sign-in page.
 * - Every call either returns real data or throws `TcApiError`. There is **no mock fallback**:
 *   a screen that cannot reach the API says so instead of implying live data.
 *
 * Calls are grouped by area: `auth`, `admin`, `sup`, `op`, `chat`, `sim`.
 */
import { ALARM_MUTE_KEY, GEO_TIMEOUT_MS, REQUEST_TIMEOUT_MS, ROLE_KEY, TOKEN_KEY } from './constants';
import type {
  AdminOverview,
  AlertResult,
  Camera,
  ChatMessage,
  ChatThread,
  ChecklistAnswer,
  ChecklistStatus,
  ChecklistView,
  CheckpointUpdate,
  DecisionBody,
  FlagRespondResult,
  FlagResponseKind,
  ForesightActResult,
  ForesightResponse,
  GeoFix,
  LoginResponse,
  Notification,
  OpFlag,
  OpToday,
  OpTrainingProfile,
  PersonRow,
  ProgressCreate,
  PunchKind,
  Role,
  SimScenario,
  SimScenarioResult,
  SupDashboard,
  SupEfficiency,
  SupOperatorDetail,
  SupOperatorRow,
  SupTeamEfficiency,
  SupTrainingProfile,
  TaskCreate,
  TaskProgress,
  TcIncident,
  TcTask,
  Ticket,
  TicketFilters,
  TrainingItem,
  TrainingProgressUpdate,
  TrainingVideo,
  User,
  WaitingReason,
  WaitingStartResponse,
  WaitingStopResponse,
  WaitingSummary,
} from './types';

export * from './time';

// ---------------------------------------------------------------- base URL
export const CLOUD_URL = (import.meta.env.VITE_CLOUD_URL ?? 'http://127.0.0.1:8100/api/v1').replace(/\/$/, '');
export const TC_BASE = `${CLOUD_URL}/tc`;

// ---------------------------------------------------------------- errors
/** Any failed call. `status === 0` means the request never reached the API. */
export class TcApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly endpoint: string;

  constructor(status: number, detail: string, endpoint: string) {
    super(detail);
    this.name = 'TcApiError';
    this.status = status;
    this.detail = detail;
    this.endpoint = endpoint;
  }

  /** True when the API could not be reached at all (server down, CORS, timeout). */
  get offline(): boolean {
    return this.status === 0;
  }

  /** True when the route is not implemented yet — shown as "not available", never faked. */
  get missing(): boolean {
    return this.status === 404 || this.status === 405 || this.status === 501;
  }

  get forbidden(): boolean {
    return this.status === 403;
  }
}

// ---------------------------------------------------------------- token
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null, role?: Role | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (role) localStorage.setItem(ROLE_KEY, role);
    else if (token === null) localStorage.removeItem(ROLE_KEY);
  } catch {
    /* storage unavailable (private mode) — the session simply does not survive a reload */
  }
}

export function getLastRole(): Role | null {
  try {
    const r = localStorage.getItem(ROLE_KEY);
    return r === 'admin' || r === 'supervisor' || r === 'operator' ? r : null;
  } catch {
    return null;
  }
}

/** Listeners fired when the server rejects our token, so the auth context can clear its user. */
type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

function handleUnauthorized(): void {
  const role = getLastRole();
  setToken(null, null);
  try {
    localStorage.removeItem(ALARM_MUTE_KEY);
  } catch {
    /* ignore */
  }
  unauthorizedListeners.forEach((fn) => fn());
  const target = role ? `/tc/login/${role}` : '/tc';
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/tc/login')) {
    window.location.assign(target);
  }
}

// ---------------------------------------------------------------- request
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Options {
  /** Skip the Authorization header (login only). */
  anonymous?: boolean;
  /** Do not redirect on 401 (used by background pollers that just stop). */
  quiet?: boolean;
  timeoutMs?: number;
}

async function request<T>(method: Method, path: string, body?: unknown, opts: Options = {}): Promise<T> {
  const endpoint = `${method} /tc${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = opts.anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${TC_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new TcApiError(0, aborted ? `The Task Centre API did not answer within ${Math.round((opts.timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000)} s (${TC_BASE}).` : `Cannot reach the Task Centre API at ${TC_BASE}.`, endpoint);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    if (!opts.quiet && !opts.anonymous) handleUnauthorized();
    throw new TcApiError(401, 'Your session has expired. Sign in again.', endpoint);
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { detail?: unknown; message?: unknown };
      const d = data.detail ?? data.message;
      if (typeof d === 'string' && d.trim()) detail = d;
      else if (d) detail = JSON.stringify(d);
    } catch {
      /* body was not JSON — keep the status line */
    }
    throw new TcApiError(res.status, detail, endpoint);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TcApiError(res.status, 'The API returned a response this client could not read.', endpoint);
  }
}

/**
 * Accept either a bare array or `{ <key>: [...] }` — the routers are written by different agents,
 * so the client tolerates both envelope styles rather than crashing the page.
 */
function asList<T>(value: unknown, ...keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- geolocation
/**
 * Ask the browser for a position fix. Resolves to `null` when the user denies it, the device has
 * no fix, or it takes too long — the server then marks the punch "unverified".
 * Coordinates are never invented.
 */
export function requestPosition(timeoutMs: number = GEO_TIMEOUT_MS): Promise<GeoFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (fix: GeoFix | null) => {
      if (settled) return;
      settled = true;
      resolve(fix);
    };
    const guard = setTimeout(() => done(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(guard);
        const { latitude, longitude, accuracy } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return done(null);
        done({ lat: latitude, lon: longitude, accuracy_m: Number.isFinite(accuracy) ? accuracy : undefined });
      },
      () => {
        clearTimeout(guard);
        done(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

const withFix = (body: Record<string, unknown>, fix?: GeoFix | null): Record<string, unknown> =>
  fix ? { ...body, lat: fix.lat, lon: fix.lon, accuracy_m: fix.accuracy_m } : body;

// ---------------------------------------------------------------- auth & users
export const authApi = {
  /** Sign in. `fix` is omitted entirely when the browser gave us nothing. */
  login: (username: string, password: string, fix?: GeoFix | null): Promise<LoginResponse> =>
    request<LoginResponse>('POST', '/auth/login', withFix({ username, password }, fix), { anonymous: true }),

  logout: (): Promise<void> => request<void>('POST', '/auth/logout', {}, { quiet: true }),

  /** GET /auth/me returns an envelope ({user, login, server_ts}); callers want the user. */
  me: async (): Promise<User> => (await request<{ user: User }>('GET', '/auth/me')).user,

  /** Report the current position (operator app heartbeat). */
  location: (fix: GeoFix): Promise<{ geofence_status?: string; distance_m?: number | null }> =>
    request('POST', '/location', { lat: fix.lat, lon: fix.lon, accuracy_m: fix.accuracy_m }),

  /** Start/finish work. The server timestamps it; outside/unverified raises a ticket. */
  punch: (kind: PunchKind, fix?: GeoFix | null) => request<Record<string, unknown>>('POST', '/punch', withFix({ kind }, fix)),

  users: async (params: { role?: Role | string; supervisor_id?: string } = {}): Promise<User[]> =>
    asList<User>(await request('GET', `/users${qs(params)}`), 'users', 'items'),

  createUser: (body: Partial<User> & { username: string; password: string; role: Role; name: string }): Promise<User> => request<User>('POST', '/users', body),

  updateUser: (userId: string, patch: Partial<User> & { password?: string }): Promise<User> => request<User>('PATCH', `/users/${enc(userId)}`, patch),
};

// ---------------------------------------------------------------- admin
export const adminApi = {
  overview: (): Promise<AdminOverview> => request<AdminOverview>('GET', '/admin/overview'),

  people: async (): Promise<PersonRow[]> => asList<PersonRow>(await request('GET', '/admin/people'), 'people', 'items', 'users'),

  tickets: async (f: TicketFilters = {}): Promise<Ticket[]> =>
    asList<Ticket>(await request('GET', `/admin/tickets${qs({ status: f.status, kind: f.kind, user: f.user, machine: f.machine })}`), 'tickets', 'items'),

  decide: (ticketId: string, body: DecisionBody): Promise<Ticket> => request<Ticket>('POST', `/admin/tickets/${enc(ticketId)}/decision`, body),

  cameras: async (): Promise<Camera[]> => asList<Camera>(await request('GET', '/admin/cameras'), 'cameras', 'items'),

  incidents: async (): Promise<TcIncident[]> => asList<TcIncident>(await request('GET', '/admin/incidents'), 'incidents', 'items'),

  /**
   * What could happen next, derived by deterministic rules from facts already recorded. Not a
   * trained forecast: every item carries its `basis`, and `method`/`caveats` are shown verbatim.
   * A 404 means the rules are not running on this API — the screen says so rather than inventing.
   */
  foresight: (): Promise<ForesightResponse> => request<ForesightResponse>('GET', '/admin/foresight'),

  /**
   * Take one of an item's recommended actions: routes it to the person named (notifies the
   * supervisor, opens a ticket). Returns what it did so the screen can confirm it, rather than
   * claiming success on its own.
   */
  foresightAct: (riskId: string, action: string, comment?: string): Promise<ForesightActResult> =>
    request<ForesightActResult>('POST', `/admin/foresight/${enc(riskId)}/act`, comment && comment.trim() ? { action, comment: comment.trim() } : { action }),
};

// ---------------------------------------------------------------- supervisor
export const supApi = {
  operators: async (): Promise<SupOperatorRow[]> => asList<SupOperatorRow>(await request('GET', '/sup/operators'), 'operators', 'items'),

  operator: (userId: string): Promise<SupOperatorDetail> => request<SupOperatorDetail>('GET', `/sup/operators/${enc(userId)}`),

  /**
   * `/tc/sup/dashboard` returns `buckets` (bucket name -> tasks), not a flat `tasks` array, and a
   * task past its expected finish is listed twice: once under its status and again under `overdue`.
   * Callers want one list with each task once, so the buckets are flattened and de-duplicated here.
   */
  dashboard: async (): Promise<SupDashboard> => {
    const d = await request<SupDashboard>('GET', '/sup/dashboard');
    if (d.tasks?.length) return d;
    const seen = new Map<string, TcTask>();
    for (const list of Object.values(d.buckets ?? {})) {
      for (const t of list ?? []) if (!seen.has(t.task_id)) seen.set(t.task_id, t);
    }
    return { ...d, tasks: [...seen.values()] };
  },

  tasks: async (params: { operator_id?: string; status?: string } = {}): Promise<TcTask[]> => asList<TcTask>(await request('GET', `/sup/tasks${qs(params)}`), 'tasks', 'items'),

  createTask: (body: TaskCreate): Promise<TcTask> => request<TcTask>('POST', '/sup/tasks', body),

  updateTask: (taskId: string, patch: Partial<TaskCreate> & { status?: string }): Promise<TcTask> => request<TcTask>('PATCH', `/sup/tasks/${enc(taskId)}`, patch),

  review: async (): Promise<Ticket[]> => asList<Ticket>(await request('GET', '/sup/review'), 'tickets', 'items'),

  decide: (ticketId: string, body: DecisionBody): Promise<Ticket> => request<Ticket>('POST', `/sup/review/${enc(ticketId)}`, body),

  /** Sound an alert on the operator's own device about this flag. Marks the ticket confirmed. */
  alertOperator: (ticketId: string, message?: string): Promise<AlertResult> =>
    request<AlertResult>('POST', `/sup/review/${enc(ticketId)}/alert`,
      message && message.trim() ? { message: message.trim() } : {}),

  cameras: async (): Promise<Camera[]> => asList<Camera>(await request('GET', '/sup/cameras'), 'cameras', 'items'),

  /**
   * One operator's training profile: every item with its status, plus the roll-up and the
   * per-category breakdown. The content is DEMO material written for this prototype.
   */
  training: (userId: string): Promise<SupTrainingProfile> => request<SupTrainingProfile>('GET', `/sup/operators/${enc(userId)}/training`),

  /** Assign a training item to an operator. The optional note reaches them with it. */
  assignTraining: (userId: string, videoId: string, note?: string): Promise<unknown> =>
    request('POST', `/sup/operators/${enc(userId)}/training/${enc(videoId)}/assign`, note && note.trim() ? { note: note.trim() } : {}),

  /** Working facts for one operator over the last `days`, with the evidence behind each number. */
  efficiency: (userId: string, days = 7): Promise<SupEfficiency> =>
    request<SupEfficiency>('GET', `/sup/operators/${enc(userId)}/efficiency${qs({ days })}`),

  /** The same facts for the whole team, one row per operator. Ordered by name — never ranked. */
  teamEfficiency: (days = 7): Promise<SupTeamEfficiency> => request<SupTeamEfficiency>('GET', `/sup/efficiency${qs({ days })}`),
};

// ---------------------------------------------------------------- operator
export const opApi = {
  today: (): Promise<OpToday> => request<OpToday>('GET', '/op/today'),

  /**
   * 409 when the pre-start checklist is not complete, or a critical item failed. The body carries
   * `{error, missing, answered, total}` or `{error, failed_critical, ticket_id}` — read it with
   * `startConflict()` (pages/operator/model.ts) and send the operator to the checklist.
   */
  startTask: (taskId: string): Promise<TcTask> => request<TcTask>('POST', `/op/tasks/${enc(taskId)}/start`),

  /** The pre-start inspection for one task: the items, the answers already stored, and the verdict. */
  checklist: (taskId: string): Promise<ChecklistView> => request<ChecklistView>('GET', `/op/tasks/${enc(taskId)}/checklist`),

  /**
   * Save answers as they are given — partial sets are allowed, so nothing is lost if the screen
   * closes. A `fail` without a note is rejected (400); the screen holds it back until it has one.
   */
  saveChecklist: async (taskId: string, results: ChecklistAnswer[]): Promise<ChecklistStatus> => {
    const raw = await request<ChecklistStatus | { status: ChecklistStatus }>('POST', `/op/tasks/${enc(taskId)}/checklist`, { results });
    const wrapped = (raw as { status?: ChecklistStatus })?.status;
    return wrapped && typeof wrapped === 'object' ? wrapped : (raw as ChecklistStatus);
  },

  checkpoint: (taskId: string, body: CheckpointUpdate): Promise<TcTask> => request<TcTask>('POST', `/op/tasks/${enc(taskId)}/checkpoint`, body),

  progress: (taskId: string, body: ProgressCreate): Promise<TaskProgress> => request<TaskProgress>('POST', `/op/tasks/${enc(taskId)}/progress`, body),

  /** 409 when a required checkpoint is unmet — surface the server's message, do not retry. */
  finish: (taskId: string): Promise<TcTask> => request<TcTask>('POST', `/op/tasks/${enc(taskId)}/finish`),

  training: async (): Promise<TrainingVideo[]> => asList<TrainingVideo>(await request('GET', '/op/training'), 'videos', 'items', 'training'),

  /**
   * The operator's own training record — every item with its status and percent, the summary and
   * the per-category roll-up. A `404` means the endpoint is not running yet; the screen says so
   * rather than showing zero progress, which would be a claim it cannot make.
   */
  trainingProfile: (): Promise<OpTrainingProfile> => request<OpTrainingProfile>('GET', '/op/training/profile'),

  /**
   * Record what the operator actually watched. Sent as the player reports it, and once more with
   * `completed` when the clip ends. Returns the updated item when the server sends one back.
   */
  trainingProgress: async (videoId: string, body: TrainingProgressUpdate): Promise<TrainingItem | null> => {
    const raw = await request<TrainingItem | { item?: TrainingItem } | undefined>('POST', `/op/training/${enc(videoId)}/progress`, body);
    if (!raw || typeof raw !== 'object') return null;
    const item = (raw as { item?: TrainingItem }).item ?? (raw as TrainingItem);
    return typeof item?.video_id === 'string' ? item : null;
  },

  notifications: async (opts: { quiet?: boolean } = {}): Promise<Notification[]> =>
    asList<Notification>(await request('GET', '/op/notifications', undefined, { quiet: opts.quiet }), 'notifications', 'items'),

  ack: (notificationId: string): Promise<Notification> => request<Notification>('POST', `/op/notifications/${enc(notificationId)}/ack`),

  /**
   * Declare a pause the operator is not answerable for. `reason` defaults to `waiting_for_truck`
   * server-side; `task_id` attaches the wait to the task in progress when there is one.
   */
  startWaiting: (body: { reason?: WaitingReason; task_id?: string | null; note?: string } = {}): Promise<WaitingStartResponse> =>
    request<WaitingStartResponse>('POST', '/op/waiting/start', body),

  /** End the open wait. The server returns the minutes it recorded. */
  stopWaiting: (): Promise<WaitingStopResponse> => request<WaitingStopResponse>('POST', '/op/waiting/stop', {}),

  /** The day's waiting in full — totals, the breakdown by reason and every period. */
  waiting: (): Promise<WaitingSummary> => request<WaitingSummary>('GET', '/op/waiting'),

  /** Flags raised about this operator that are waiting for their own account of what happened. */
  flags: async (opts: { quiet?: boolean } = {}): Promise<OpFlag[]> =>
    asList<OpFlag>(await request('GET', '/op/flags', undefined, { quiet: opts.quiet }), 'flags', 'tickets', 'items'),

  /**
   * Record the operator's answer to a flag. It is **added** to the record beside the original
   * detection and sent to the supervisor with the evidence — it never deletes or overrides it.
   */
  respondFlag: (ticketId: string, response: FlagResponseKind, comment?: string): Promise<FlagRespondResult> =>
    request<FlagRespondResult>('POST', `/op/flags/${enc(ticketId)}/respond`, comment && comment.trim() ? { response, comment: comment.trim() } : { response }),
};

// ---------------------------------------------------------------- chat (both roles)
export const chatApi = {
  thread: async (otherUserId: string): Promise<ChatThread> => {
    const raw = await request<ChatThread | ChatMessage[]>('GET', `/chat/${enc(otherUserId)}`);
    const messages = asList<ChatMessage>(raw, 'messages', 'items');
    return Array.isArray(raw) ? { messages } : { ...(raw as ChatThread), messages };
  },

  send: (otherUserId: string, text: string, taskId?: string | null): Promise<ChatMessage> =>
    request<ChatMessage>('POST', `/chat/${enc(otherUserId)}`, taskId ? { text, task_id: taskId } : { text }),
};

// ---------------------------------------------------------------- simulation & demo
export const simApi = {
  scenarios: async (): Promise<SimScenario[]> => {
    const raw = await request<SimScenario[] | Record<string, unknown>>('GET', '/sim/scenarios');
    const list = asList<SimScenario | string>(raw, 'scenarios', 'items');
    return list.map((s) => (typeof s === 'string' ? { name: s } : s));
  },

  runScenario: (name: string): Promise<SimScenarioResult> => request<SimScenarioResult>('POST', `/sim/scenario/${enc(name)}`, {}, { timeoutMs: 20_000 }),

  machineSensor: (body: { machine_id: string; kind: string; severity?: string; lat?: number; lon?: number }): Promise<SimScenarioResult> => request('POST', '/sim/machine-sensor', body),

  cameraObservation: (body: { camera_id: string; operator_id: string; idle_seconds: number; context?: string }): Promise<SimScenarioResult> => request('POST', '/sim/camera-observation', body),

  fatigue: (body: { operator_id: string; indicator: string }): Promise<SimScenarioResult> => request('POST', '/sim/fatigue', body),
};

/** One object for consumers that prefer a single import. */
export const tc = { auth: authApi, admin: adminApi, sup: supApi, op: opApi, chat: chatApi, sim: simApi };

/** Short aliases — `sup.operators()` reads better in a page than `supApi.operators()`. */
export const auth = authApi;
export const admin = adminApi;
export const sup = supApi;
export const op = opApi;
export const chat = chatApi;
export const sim = simApi;

// ---------------------------------------------------------------- small helpers
/** A person row may nest the user or flatten it. Read it safely either way. */
interface PersonRef { name?: string; username?: string; user_id?: string }
type PersonLike = { user?: PersonRef; operator?: PersonRef; name?: string; username?: string;
                    user_id?: string };

export function personName(p: PersonLike): string {
  const u = p.user ?? p.operator;
  return u?.name ?? p.name ?? u?.username ?? p.username ?? personId(p) ?? 'Unknown';
}

/** The id for a person-shaped row, wherever this endpoint happens to put them. */
export function personId(p: PersonLike): string | undefined {
  return p.user_id ?? p.user?.user_id ?? p.operator?.user_id;
}

/**
 * Who a ticket is about, wherever the response happens to put them.
 *
 * `/tc/sup/review` and `/tc/admin/tickets` nest the person under `subject_user`; the flat
 * `subject_user_id` / `subject_name` are the shape some other responses use. Reading only the flat
 * pair is why the review queue used to say "Unknown" for every flag.
 */
export function ticketSubject(t: {
  subject_user?: { user_id?: string | null; name?: string | null } | null;
  subject_user_id?: string | null;
  subject_name?: string | null;
}): { id?: string; name?: string } {
  return {
    id: t.subject_user?.user_id ?? t.subject_user_id ?? undefined,
    name: t.subject_user?.name ?? t.subject_name ?? undefined,
  };
}

/** Turn any thrown value into a message worth showing a user. */
export function errorText(e: unknown): string {
  if (e instanceof TcApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}
