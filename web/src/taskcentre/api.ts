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
  Camera,
  ChatMessage,
  ChatThread,
  CheckpointUpdate,
  DecisionBody,
  GeoFix,
  LoginResponse,
  Notification,
  OpToday,
  PersonRow,
  ProgressCreate,
  PunchKind,
  Role,
  SimScenario,
  SimScenarioResult,
  SupDashboard,
  SupOperatorDetail,
  SupOperatorRow,
  TaskCreate,
  TaskProgress,
  TcIncident,
  TcTask,
  Ticket,
  TicketFilters,
  TrainingVideo,
  User,
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
};

// ---------------------------------------------------------------- supervisor
export const supApi = {
  operators: async (): Promise<SupOperatorRow[]> => asList<SupOperatorRow>(await request('GET', '/sup/operators'), 'operators', 'items'),

  operator: (userId: string): Promise<SupOperatorDetail> => request<SupOperatorDetail>('GET', `/sup/operators/${enc(userId)}`),

  dashboard: (): Promise<SupDashboard> => request<SupDashboard>('GET', '/sup/dashboard'),

  tasks: async (params: { operator_id?: string; status?: string } = {}): Promise<TcTask[]> => asList<TcTask>(await request('GET', `/sup/tasks${qs(params)}`), 'tasks', 'items'),

  createTask: (body: TaskCreate): Promise<TcTask> => request<TcTask>('POST', '/sup/tasks', body),

  updateTask: (taskId: string, patch: Partial<TaskCreate> & { status?: string }): Promise<TcTask> => request<TcTask>('PATCH', `/sup/tasks/${enc(taskId)}`, patch),

  review: async (): Promise<Ticket[]> => asList<Ticket>(await request('GET', '/sup/review'), 'tickets', 'items'),

  decide: (ticketId: string, body: DecisionBody): Promise<Ticket> => request<Ticket>('POST', `/sup/review/${enc(ticketId)}`, body),

  cameras: async (): Promise<Camera[]> => asList<Camera>(await request('GET', '/sup/cameras'), 'cameras', 'items'),
};

// ---------------------------------------------------------------- operator
export const opApi = {
  today: (): Promise<OpToday> => request<OpToday>('GET', '/op/today'),

  startTask: (taskId: string): Promise<TcTask> => request<TcTask>('POST', `/op/tasks/${enc(taskId)}/start`),

  checkpoint: (taskId: string, body: CheckpointUpdate): Promise<TcTask> => request<TcTask>('POST', `/op/tasks/${enc(taskId)}/checkpoint`, body),

  progress: (taskId: string, body: ProgressCreate): Promise<TaskProgress> => request<TaskProgress>('POST', `/op/tasks/${enc(taskId)}/progress`, body),

  /** 409 when a required checkpoint is unmet — surface the server's message, do not retry. */
  finish: (taskId: string): Promise<TcTask> => request<TcTask>('POST', `/op/tasks/${enc(taskId)}/finish`),

  training: async (): Promise<TrainingVideo[]> => asList<TrainingVideo>(await request('GET', '/op/training'), 'videos', 'items', 'training'),

  notifications: async (opts: { quiet?: boolean } = {}): Promise<Notification[]> =>
    asList<Notification>(await request('GET', '/op/notifications', undefined, { quiet: opts.quiet }), 'notifications', 'items'),

  ack: (notificationId: string): Promise<Notification> => request<Notification>('POST', `/op/notifications/${enc(notificationId)}/ack`),
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
export function personName(p: { user?: { name?: string; username?: string }; name?: string; username?: string; user_id?: string }): string {
  return p.user?.name ?? p.name ?? p.user?.username ?? p.username ?? p.user_id ?? 'Unknown';
}

/** Turn any thrown value into a message worth showing a user. */
export function errorText(e: unknown): string {
  if (e instanceof TcApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}
