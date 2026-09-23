/**
 * Typed clients for the edge (:8000) and cloud (:8100) APIs (docs/implementation-plan.md).
 *
 * Mock fallback: every call names a fixture. If the origin is unreachable (network error or
 * timeout) or the route is not implemented yet (404/405/501/502/503/504), the fixture is
 * returned and the endpoint is registered in mockStatus → the global "MOCK DATA" indicator.
 * Business responses (400/403/409/423/…) are NOT masked: they throw ApiError so the UI can
 * show the real rule (e.g. 409 "checklist incomplete", 423 "machine moving").
 * After a network failure the origin is skipped for a few seconds to keep the UI snappy.
 */
import * as edgeMock from '../mocks/edge';
import * as cloudMock from '../mocks/cloud';
import * as practiceMock from '../mocks/practice';
import * as valueMock from '../mocks/value';
import * as cohortMock from '../mocks/cohort';
import type { Archetype } from '../mocks/practice';
import { isForcedMock, markLive, markMock, setOrigin, type Origin } from './mockStatus';
import { personaStore } from './persona';
import * as N from './normalize';
import * as E from './normalizeEdge';
import { normCohort } from './normalizeCohort';
import type {
  Alert,
  AlertRates,
  Booking,
  BookingRequest,
  ChecklistItem,
  ChecklistResult,
  ChecklistSubmitResponse,
  CohortSim,
  CompetencyState,
  Conditions,
  ContentReviewItem,
  CopilotAnswer,
  CrewSummary,
  DemoInjectKind,
  DriftReport,
  Escalation,
  EtaPreviewRequest,
  Health,
  IdleSummary,
  Incident,
  Instructor,
  InstructorOperatorRow,
  InstructorSlot,
  LiveSnapshot,
  MachineIssue,
  ModelCard,
  OperatorProfile,
  PracticeExercise,
  PracticeGenerateResponse,
  PracticeReport,
  PracticeSample,
  PracticeSession,
  Quiz,
  QuizAttemptResponse,
  Reassessment,
  Recommendation,
  SentinelEvent,
  ShiftCurrent,
  ShiftReview,
  SyncStatus,
  Task,
  TaskEstimate,
  TrainingModule,
  ValueAssumption,
  ValueEstimate,
  ValueEstimateRequest,
  ValueLeverMap,
  ValueLeverResult,
  ValueGainsHeadline,
  ValuePitch,
  ValueToday,
  ValueUnitCosts,
} from './types';

export const EDGE_URL = (import.meta.env.VITE_EDGE_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
export const CLOUD_URL = (import.meta.env.VITE_CLOUD_URL ?? 'http://127.0.0.1:8100/api/v1').replace(/\/$/, '');
export const MQTT_URL = import.meta.env.VITE_MQTT_URL ?? 'ws://127.0.0.1:9001';

const toWs = (http: string) => http.replace(/^http/, 'ws');
export const EDGE_WS_URL = import.meta.env.VITE_EDGE_WS ?? `${toWs(EDGE_URL)}/ws/live`;
export const practiceLiveWsUrl = (sessionId: string) => `${toWs(CLOUD_URL)}/practice/sessions/${encodeURIComponent(sessionId)}/live`;

const BASE: Record<Origin, string> = { edge: EDGE_URL, cloud: CLOUD_URL };
const TIMEOUT_MS = 3000;
const BACKOFF_MS = 5000;
const FALLBACK_STATUSES = new Set([404, 405, 501, 502, 503, 504]);
const downUntil: Record<Origin, number> = { edge: 0, cloud: 0 };

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
  get detail(): string {
    const b = this.body as { detail?: unknown } | null;
    if (b && typeof b.detail === 'string') return b.detail;
    if (b && b.detail) return JSON.stringify(b.detail);
    return this.message;
  }
}

interface ReqOpts<T> {
  origin: Origin;
  name: string; // stable endpoint template, e.g. "GET /tasks/{id}/eta"
  method?: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: unknown;
  mock: () => T;
  /** Reject a 200 response whose shape is unusable (falls back to the fixture). */
  valid?: (x: unknown) => boolean;
  /** Cloud MOCK auth role (X-Role header); defaults to the persona switcher's role. */
  role?: string;
  /** Map the service's response shape onto the UI type (throw → fixture). */
  map?: (raw: unknown) => T;
  /** Per-request timeout (simulations and Monte Carlo take longer than plain reads). */
  timeoutMs?: number;
}

/** X-Role for the cloud role guard: operator|trainee|instructor|supervisor (judge browses as operator). */
export function headerRole(): string {
  const r = personaStore.get();
  return r === 'judge' ? 'operator' : r;
}

async function request<T>(o: ReqOpts<T>): Promise<T> {
  const key = `${o.origin}: ${o.name}`;
  const useMock = (reason: string): T => {
    markMock(key, reason);
    return o.mock();
  };
  if (isForcedMock()) return useMock('forced');
  if (Date.now() < downUntil[o.origin]) return useMock(`${o.origin} unreachable`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE[o.origin]}${o.path}`, {
      method: o.method ?? 'GET',
      headers: {
        ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(o.origin === 'cloud' ? { 'X-Role': o.role ?? headerRole() } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    if (ctrl.signal.aborted) return useMock('timeout'); // slow, not down: keep the origin online
    downUntil[o.origin] = Date.now() + BACKOFF_MS;
    setOrigin(o.origin, 'offline');
    return useMock(`${o.origin} unreachable`);
  } finally {
    clearTimeout(timer);
  }
  setOrigin(o.origin, 'online');
  const isGet = (o.method ?? 'GET') === 'GET';
  // Never show an empty page: reads fall back on any failure; writes only on "not available" statuses
  // (business rules such as 403/409/422/423 still reach the UI).
  if (FALLBACK_STATUSES.has(res.status) || res.status >= 500 || (isGet && !res.ok)) return useMock(`HTTP ${res.status}`);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new ApiError(res.status, json, `${o.method ?? 'GET'} ${o.path} → ${res.status}`);
  if (o.valid && !o.valid(json)) return useMock('unexpected response shape');
  if (o.map) {
    try {
      const mapped = o.map(json);
      markLive(key);
      return mapped;
    } catch (e) {
      return useMock(e instanceof N.NotTrained ? 'HTTP 503 not trained yet' : 'unexpected response shape');
    }
  }
  markLive(key);
  return json as T;
}

/** Lists may come back bare or wrapped ({items:[…]}, {tasks:[…]} …). */
function list<T>(x: unknown, ...keys: string[]): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x && typeof x === 'object') {
    for (const k of [...keys, 'items', 'data', 'results']) {
      const v = (x as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

const q = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

const enc = encodeURIComponent;
const has = (x: unknown, k: string) => !!x && typeof x === 'object' && k in (x as Record<string, unknown>);
const ok = { ok: true };

// ================================================================== EDGE (:8000)
export const edge = {
  health: () => request<Health>({ origin: 'edge', name: 'GET /health', path: '/health', mock: edgeMock.mockHealth }),

  shiftCurrent: () => request<ShiftCurrent>({ origin: 'edge', name: 'GET /shift/current', path: '/shift/current', mock: edgeMock.mockShiftCurrent, valid: (x) => has(x, 'shift') && has(x, 'operator'), map: E.normShift }),
  privacyAck: (shiftId: string) =>
    request<{ ok: boolean }>({ origin: 'edge', name: 'POST /shift/{id}/privacy-ack', method: 'POST', path: `/shift/${enc(shiftId)}/privacy-ack`, body: {}, mock: edgeMock.mockPrivacyAck }),
  checklistItems: () =>
    request<ChecklistItem[]>({ origin: 'edge', name: 'GET /checklist/items', path: '/checklist/items', mock: () => edgeMock.CHECKLIST_ITEMS, map: N.normChecklistItems }),
  submitChecklist: (shiftId: string, results: ChecklistResult[]) =>
    request<ChecklistSubmitResponse>({ origin: 'edge', name: 'POST /shift/{id}/checklist', method: 'POST', path: `/shift/${enc(shiftId)}/checklist`, body: { results }, mock: () => edgeMock.mockSubmitChecklist(results) }),
  startShift: (shiftId: string) =>
    request<{ ok?: boolean }>({
      origin: 'edge', name: 'POST /shift/{id}/start', method: 'POST', path: `/shift/${enc(shiftId)}/start`, body: {},
      mock: () => {
        const r = edgeMock.mockStartShift();
        if (!r.ok) throw new ApiError(r.status, { detail: r.detail }, r.detail ?? 'conflict');
        return ok;
      },
    }),
  endShift: (shiftId: string) =>
    request<{ ok?: boolean }>({ origin: 'edge', name: 'POST /shift/{id}/end', method: 'POST', path: `/shift/${enc(shiftId)}/end`, body: {}, mock: edgeMock.mockEndShift }),

  tasks: () => request<Task[]>({ origin: 'edge', name: 'GET /tasks', path: '/tasks', mock: edgeMock.mockTasks, map: E.normTasks }),
  patchTask: (id: string, patch: Partial<Task>) =>
    request<Task>({ origin: 'edge', name: 'PATCH /tasks/{id}', method: 'PATCH', path: `/tasks/${enc(id)}`, body: patch, mock: () => edgeMock.mockPatchTask(id, patch) }),
  taskEta: (id: string) => request<TaskEstimate>({ origin: 'edge', name: 'GET /tasks/{id}/eta', path: `/tasks/${enc(id)}/eta`, mock: () => edgeMock.estimateFor(id), map: (x) => E.normEstimate(x) ?? edgeMock.estimateFor(id) }),
  etaPreview: (req: EtaPreviewRequest) =>
    request<TaskEstimate>({ origin: 'edge', name: 'POST /eta/preview', method: 'POST', path: '/eta/preview', body: req, mock: () => edgeMock.mockEtaPreview(req), map: (x) => E.normEstimate(x) ?? edgeMock.mockEtaPreview(req) }),
  taskState: (waiting_for_truck: boolean) =>
    request<{ ok?: boolean }>({ origin: 'edge', name: 'POST /context/task-state', method: 'POST', path: '/context/task-state', body: { waiting_for_truck }, mock: () => ok }),

  alerts: (activeOnly = false) =>
    request<Alert[]>({ origin: 'edge', name: 'GET /alerts', path: `/alerts${activeOnly ? '?active=1' : ''}`, mock: () => edgeMock.mockAlerts(activeOnly), map: E.normAlerts }),
  /** Acknowledge an alert, or snooze a T3 break recommendation ({action:"snooze"}, allowed once; the edge escalates later). */
  ackAlert: (id: string, action?: 'snooze') =>
    request<Alert | { ok: boolean }>({ origin: 'edge', name: 'POST /alerts/{id}/ack', method: 'POST', path: `/alerts/${enc(id)}/ack`, body: action ? { action } : {}, mock: () => ok }),
  alertFeedback: (id: string, useful: boolean, reason: string) =>
    request<{ ok?: boolean }>({ origin: 'edge', name: 'POST /alerts/{id}/feedback', method: 'POST', path: `/alerts/${enc(id)}/feedback`, body: { useful, reason }, mock: () => ok }),

  incidents: (filters: Record<string, string | undefined> = {}) =>
    request<Incident[]>({ origin: 'edge', name: 'GET /incidents', path: `/incidents${q(filters)}`, mock: () => edgeMock.mockIncidents(filters), map: N.normIncidents }),
  incident: (id: string) =>
    request<Incident>({
      origin: 'edge', name: 'GET /incidents/{id}', path: `/incidents/${enc(id)}`,
      mock: () => edgeMock.mockIncident(id) ?? edgeMock.mockIncidents()[0],
      map: N.normIncident,
    }),
  createIncident: (body: Partial<Incident>) =>
    request<Incident>({ origin: 'edge', name: 'POST /incidents', method: 'POST', path: '/incidents', body, mock: () => edgeMock.mockCreateIncident(body) }),
  patchIncident: (id: string, patch: Partial<Pick<Incident, 'status' | 'operator_note' | 'dispute_status'>>) =>
    request<Incident>({ origin: 'edge', name: 'PATCH /incidents/{id}', method: 'PATCH', path: `/incidents/${enc(id)}`, body: patch, mock: () => edgeMock.mockPatchIncident(id, patch)! }),

  breakStart: () => request<{ ok?: boolean; started_at?: number }>({ origin: 'edge', name: 'POST /breaks/start', method: 'POST', path: '/breaks/start', body: {}, mock: edgeMock.mockBreakStart }),
  breakEnd: (kss?: number | null) =>
    request<{ ok?: boolean }>({ origin: 'edge', name: 'POST /breaks/end', method: 'POST', path: '/breaks/end', body: kss ? { kss } : {}, mock: edgeMock.mockBreakEnd }),

  conditions: () => request<Conditions>({ origin: 'edge', name: 'GET /conditions', path: '/conditions', mock: edgeMock.mockConditions }),
  shiftReview: (shiftId: string) =>
    request<ShiftReview>({ origin: 'edge', name: 'GET /review/shift/{id}', path: `/review/shift/${enc(shiftId)}`, mock: edgeMock.mockShiftReview, valid: (x) => has(x, 'totals'), map: E.normReview }),
  liveSnapshot: () => request<LiveSnapshot>({ origin: 'edge', name: 'GET /live/snapshot', path: '/live/snapshot', mock: edgeMock.mockLiveSnapshot, valid: (x) => has(x, 'proximity'), map: E.normSnapshot }),
  syncStatus: () => request<SyncStatus>({ origin: 'edge', name: 'GET /sync/status', path: '/sync/status', mock: edgeMock.mockSyncStatus }),
  syncFlush: () => request<{ ok?: boolean }>({ origin: 'edge', name: 'POST /sync/flush', method: 'POST', path: '/sync/flush', body: {}, mock: () => ok }),

  // DEMO_MODE only. The mock returns {mock:true} so the caller can drive the in-browser simulator instead.
  demoInject: (kind: DemoInjectKind) =>
    request<{ ok?: boolean; mock?: boolean }>({ origin: 'edge', name: 'POST /demo/inject', method: 'POST', path: '/demo/inject', body: { kind }, mock: () => ({ ok: true, mock: true }) }),
  demoWan: (up: boolean) =>
    request<{ ok?: boolean; mock?: boolean }>({ origin: 'edge', name: 'POST /demo/wan', method: 'POST', path: '/demo/wan', body: { up }, mock: () => ({ ok: true, mock: true }) }),
  demoFastForward: (minutes: number) =>
    request<{ ok?: boolean; mock?: boolean }>({ origin: 'edge', name: 'POST /demo/fast-forward-operation', method: 'POST', path: '/demo/fast-forward-operation', body: { minutes }, mock: () => ({ ok: true, mock: true }) }),
  demoScenario: (name: string, speed: number) =>
    request<{ ok?: boolean; mock?: boolean }>({ origin: 'edge', name: 'POST /demo/scenario', method: 'POST', path: '/demo/scenario', body: { name, speed }, mock: () => ({ ok: true, mock: true }) }),
};

// ================================================================== CLOUD (:8100)
export const cloud = {
  health: () => request<Record<string, unknown>>({ origin: 'cloud', name: 'GET /health (cloud)', path: '/health', mock: () => ({ status: 'ok', mock: true }) }),
  profile: (operatorId: string) =>
    request<OperatorProfile>({ origin: 'cloud', name: 'GET /operators/{id}/profile', path: `/operators/${enc(operatorId)}/profile`, mock: () => cloudMock.mockProfile(operatorId), map: N.normProfile }),
  evaluateCompetency: (operator_id: string, shift_id: string) =>
    request<{ gaps: unknown[] }>({ origin: 'cloud', name: 'POST /competency/evaluate', method: 'POST', path: '/competency/evaluate', body: { operator_id, shift_id }, mock: cloudMock.mockEvaluate }),
  patchCompetency: (operatorId: string, competencyId: string, body: { state: CompetencyState; actor_role: string; assessment_id?: string }) =>
    request<{ ok?: boolean }>({
      origin: 'cloud', name: 'PATCH /competency/{op}/{comp}', method: 'PATCH', path: `/competency/${enc(operatorId)}/${enc(competencyId)}`,
      body: { ...body, actor_role: body.actor_role === 'judge' ? 'instructor' : body.actor_role },
      role: body.actor_role === 'judge' ? 'instructor' : body.actor_role,
      mock: () => {
        const r = cloudMock.mockPatchCompetency(operatorId, competencyId, body.state, body.actor_role === 'judge' ? 'instructor' : body.actor_role);
        if (!r.ok) throw new ApiError(r.status, { detail: r.detail }, r.detail ?? 'forbidden');
        return ok;
      },
    }),

  recommendations: (operatorId: string) =>
    request<Recommendation[]>({ origin: 'cloud', name: 'GET /training/recommendations', path: `/training/recommendations${q({ operator_id: operatorId })}`, mock: cloudMock.mockRecommendations, map: N.normRecommendations }),
  modules: () => request<TrainingModule[]>({ origin: 'cloud', name: 'GET /training/modules', path: '/training/modules', mock: cloudMock.mockModules, map: N.normModules }),
  module: (id: string) =>
    request<TrainingModule>({
      origin: 'cloud', name: 'GET /training/modules/{id}', path: `/training/modules/${enc(id)}`,
      mock: () => cloudMock.mockModule(id) ?? cloudMock.mockModules()[0],
      valid: (x) => has(x, 'title'),
      map: N.normModule,
    }),
  completeModule: (id: string, operator_id: string) =>
    request<{ ok?: boolean }>({ origin: 'cloud', name: 'POST /training/modules/{id}/complete', method: 'POST', path: `/training/modules/${enc(id)}/complete`, body: { operator_id }, mock: () => ok }),
  quiz: (moduleId: string) => request<Quiz>({ origin: 'cloud', name: 'GET /training/quiz/{id}', path: `/training/quiz/${enc(moduleId)}`, mock: () => cloudMock.mockQuiz(moduleId), map: N.normQuiz }),
  quizAttempt: (moduleId: string, operator_id: string, answers: Array<{ question_id: string; option_id: string }>) =>
    request<QuizAttemptResponse>({
      origin: 'cloud', name: 'POST /training/quiz/{id}/attempts', method: 'POST', path: `/training/quiz/${enc(moduleId)}/attempts`,
      body: { operator_id, answers: answers.map((x) => ({ question_id: x.question_id, choice: /^\d+$/.test(x.option_id) ? Number(x.option_id) : x.option_id })) },
      mock: () => cloudMock.mockQuizAttempt(moduleId, answers), map: N.normQuizAttempt,
    }),

  instructors: async () => list<Instructor>(await request<unknown>({ origin: 'cloud', name: 'GET /instructors', path: '/instructors', mock: cloudMock.mockInstructors }), 'instructors'),
  slots: () => request<InstructorSlot[]>({ origin: 'cloud', name: 'GET /instructors/slots', path: '/instructors/slots', mock: cloudMock.mockSlots, map: N.normSlots }),
  book: (req: BookingRequest) => request<Booking>({ origin: 'cloud', name: 'POST /bookings', method: 'POST', path: '/bookings', body: req, mock: () => cloudMock.mockBooking(req) }),

  copilotAsk: (question: string, operator_id?: string) =>
    request<CopilotAnswer>({ origin: 'cloud', name: 'POST /copilot/ask', method: 'POST', path: '/copilot/ask', body: { question, operator_id }, mock: () => cloudMock.mockCopilot(question) }),
  reassessment: (operatorId: string, competencyId: string) =>
    request<Reassessment>({ origin: 'cloud', name: 'GET /reassessment', path: `/reassessment${q({ operator_id: operatorId, competency_id: competencyId })}`, mock: cloudMock.mockReassessment }),

  crewSummary: () => request<CrewSummary>({ origin: 'cloud', name: 'GET /supervisor/crew-summary', path: '/supervisor/crew-summary', mock: cloudMock.mockCrewSummary, valid: (x) => has(x, 'kpis'), map: N.normCrew }),
  escalations: () => request<Escalation[]>({ origin: 'cloud', name: 'GET /supervisor/escalations', path: '/supervisor/escalations', mock: cloudMock.mockEscalations, map: N.normEscalations }),
  resolveEscalation: (id: string, note: string) =>
    request<Escalation | { ok: boolean }>({ origin: 'cloud', name: 'POST /supervisor/escalations/{id}/resolve', method: 'POST', path: `/supervisor/escalations/${enc(id)}/resolve`, body: { note }, role: personaStore.get() === 'judge' ? 'supervisor' : undefined, mock: () => cloudMock.mockResolveEscalation(id, note) ?? ok }),
  machineIssues: () => request<MachineIssue[]>({ origin: 'cloud', name: 'GET /supervisor/machine-issues', path: '/supervisor/machine-issues', mock: cloudMock.mockMachineIssues, map: N.normMachineIssues }),

  idleSummary: (date: string) => request<IdleSummary>({ origin: 'cloud', name: 'GET /idle/summary', path: `/idle/summary${q({ date })}`, mock: () => cloudMock.mockIdleSummary(date), map: N.normIdle }),
  behaviourEvents: async (params: Record<string, string | undefined> = {}) =>
    list<SentinelEvent>(await request<unknown>({ origin: 'cloud', name: 'GET /behaviour/events', path: `/behaviour/events${q(params)}`, mock: cloudMock.mockBehaviourEvents }), 'events'),

  instructorOperators: () =>
    request<InstructorOperatorRow[]>({ origin: 'cloud', name: 'GET /instructor/operators', path: '/instructor/operators', mock: cloudMock.mockInstructorOperators, map: N.normInstructorOperators }),
  contentReview: () => request<ContentReviewItem[]>({ origin: 'cloud', name: 'GET /instructor/content-review', path: '/instructor/content-review', mock: cloudMock.mockContentReview, map: N.normContentReview }),
  approveContent: (id: string) =>
    request<ContentReviewItem | { ok: boolean }>({ origin: 'cloud', name: 'POST /instructor/content-review/{id}/approve', method: 'POST', path: `/instructor/content-review/${enc(id)}/approve`, body: {}, role: personaStore.get() === 'judge' ? 'instructor' : undefined, mock: () => cloudMock.mockApproveContent(id) ?? ok }),

  alertRates: () => request<AlertRates>({ origin: 'cloud', name: 'GET /monitoring/alert-rates', path: '/monitoring/alert-rates', mock: cloudMock.mockAlertRates, map: (x) => N.normAlertRates(x, cloudMock.mockAlertRates()) }),
  drift: () => request<DriftReport>({ origin: 'cloud', name: 'GET /monitoring/drift', path: '/monitoring/drift', mock: cloudMock.mockDrift, map: N.normDrift }),
  models: () => request<ModelCard[]>({ origin: 'cloud', name: 'GET /models', path: '/models', mock: cloudMock.mockModels, map: N.normModels }),
};

// ================================================================== PRACTICE (cloud /practice router, agent D)
export const practice = {
  exercises: async () =>
    list<PracticeExercise>(await request<unknown>({ origin: 'cloud', name: 'GET /practice/exercises', path: '/practice/exercises', mock: practiceMock.mockPracticeExercises }), 'exercises'),
  sessions: (traineeId?: string) =>
    request<PracticeSession[]>({ origin: 'cloud', name: 'GET /practice/sessions', path: `/practice/sessions${q({ trainee_id: traineeId })}`, mock: () => practiceMock.mockPracticeSessions(traineeId), map: N.normPracticeSessions }),
  create: (trainee_id: string, exercise: string) =>
    request<PracticeSession>({ origin: 'cloud', name: 'POST /practice/sessions', method: 'POST', path: '/practice/sessions', body: { trainee_id, exercise }, mock: () => practiceMock.mockPracticeCreate(trainee_id, exercise) }),
  samples: (id: string, samples: PracticeSample[]) =>
    request<{ accepted: number; live?: unknown }>({ origin: 'cloud', name: 'POST /practice/sessions/{id}/samples', method: 'POST', path: `/practice/sessions/${enc(id)}/samples`, body: { samples }, mock: () => ({ accepted: samples.length }) }),
  finish: (id: string) =>
    request<PracticeReport>({ origin: 'cloud', name: 'POST /practice/sessions/{id}/finish', method: 'POST', path: `/practice/sessions/${enc(id)}/finish`, body: {}, mock: () => practiceMock.mockPracticeFinish(id), valid: (x) => has(x, 'overall_score'), timeoutMs: 45000 }),
  report: (id: string) =>
    /^ps_(hist|mock|live)_/.test(id)
      ? Promise.resolve(practiceMock.mockPracticeReport(id) ?? practiceMock.mockPracticeReportFor(id))
      : request<PracticeReport>({
      origin: 'cloud', name: 'GET /practice/sessions/{id}/report', path: `/practice/sessions/${enc(id)}/report`,
      mock: () => practiceMock.mockPracticeReport(id) ?? practiceMock.mockPracticeReportFor(id),
      valid: (x) => has(x, 'overall_score') && has(x, 'cycles'),
    }),
  cohortSim: (n = 20, sessions = 12, effect = 1.4) =>
    request<CohortSim>({
      origin: 'cloud', name: 'GET /practice/cohort-sim', path: `/practice/cohort-sim${q({ n, sessions, effect })}`,
      mock: () => cohortMock.mockCohortSim(n, sessions, effect), map: normCohort, timeoutMs: 30000,
    }),
  /** DEMO: simulate + analyse a trainee session. The analyser returns {session:{session_id…}, report, replay_ws}. */
  demoGenerate: async (archetype: Archetype, n_cycles: number, exercise: string, trainee_id: string): Promise<PracticeGenerateResponse> => {
    const r = await request<PracticeGenerateResponse & { session?: { session_id: string }; replay_ws?: string }>({
      origin: 'cloud', name: 'POST /practice/demo/generate', method: 'POST', path: '/practice/demo/generate', body: { archetype, n_cycles, exercise, trainee_id },
      mock: () => practiceMock.mockPracticeGenerate(archetype, n_cycles, exercise, trainee_id),
      valid: (x) => has(x, 'session_id') || has(x, 'session'),
      timeoutMs: 45000,
    });
    return { ...r, session_id: r.session_id ?? r.session?.session_id ?? '' };
  },
};

// ================================================================== VALUE (cloud /value, ESTIMATE)
const num = (...xs: unknown[]): number | undefined => {
  for (const x of xs) if (typeof x === 'number' && Number.isFinite(x)) return x;
  return undefined;
};
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

/** UI input names → value-model assumption names (sentinel/value, config/value_model.yaml). */
export const VALUE_INPUT_KEYS: Record<string, string> = {
  hours_per_year: 'operating_hours_per_year',
  fuel_usd_per_l: 'fuel_price_per_l',
  operator_wage_usd_per_h: 'operator_wage_loaded_per_h',
  machine_usd_per_h: 'machine_ownership_cost_per_h',
};

const humanise = (k: string) => k.replace(/_/g, ' ').replace(/\b(usd|l|h|m3|pct|frac)\b/gi, (w) => ({ usd: '$', l: 'L', h: 'h', m3: 'm³', pct: '%', frac: 'share' } as Record<string, string>)[w.toLowerCase()] ?? w).replace(/^./, (c) => c.toUpperCase());

/** Accepts the value model's nested response (usd.per_machine …) and the flat fixture shape. */
function normaliseValue(raw: unknown, req: ValueEstimateRequest): ValueEstimate {
  const r = obj(raw);
  const usd = obj(r.usd);
  if (usd.per_machine) {
    const per = obj(usd.per_machine);
    const fleet = obj(usd.fleet);
    const fleetSize = num(fleet.fleet_size, req.fleet_size) ?? req.fleet_size;
    const sub = num(per.subscription_usd) ?? 0;
    const leversObj = obj(r.levers);
    const perLever = obj(per.levers);
    const levers: ValueLeverResult[] = Object.keys(Object.keys(leversObj).length ? leversObj : perLever).map((k) => {
      const l = obj(leversObj[k]);
      return { lever: k, label: valueMock.LEVER_LABEL[k] ?? humanise(k), annual_usd_per_machine: num(l.usd, perLever[k]) ?? 0, formula: l.basis as string | undefined, kpi: l.evidence as string | undefined, provenance: ['ESTIMATE'] };
    });
    const unc = obj(r.uncertainty);
    const gainsObj = obj(obj(r.gains).per_machine_per_year);
    return {
      scenario: (r.scenario as ValueEstimate['scenario']) ?? req.scenario,
      fleet_size: fleetSize,
      annual_value_usd_per_machine: num(per.gross_usd) ?? 0,
      annual_value_usd_fleet: num(fleet.gross_usd) ?? (num(per.gross_usd) ?? 0) * fleetSize,
      annual_cost_usd_per_machine: sub,
      one_off_cost_usd_per_machine: num(fleet.one_off_usd) !== undefined ? (num(fleet.one_off_usd) as number) / fleetSize : undefined,
      payback_months: num(usd.payback_months, fleet.payback_months) ?? null,
      levers,
      sensitivity: Array.isArray(r.sensitivity)
        ? (r.sensitivity as Array<Record<string, unknown>>)
            .filter((x) => !String(x.name).startsWith('subscription') && !String(x.name).startsWith('one_off'))
            .map((x) => ({ key: String(x.name), label: humanise(String(x.name)), low_input: x.low as number, high_input: x.high as number, low_usd: (num(x.net_usd_at_low) ?? 0) + sub, high_usd: (num(x.net_usd_at_high) ?? 0) + sub }))
        : undefined,
      label: (r.label as string) ?? 'ESTIMATE',
      notes: r.notes as string[] | undefined,
      inputs: r.assumptions_used as Record<string, number> | undefined,
      gains_per_machine: Object.fromEntries(Object.entries(gainsObj).filter(([, v]) => typeof v === 'number')) as Record<string, number>,
      range_usd_per_machine: unc.per_machine_gross_usd as ValueEstimate['range_usd_per_machine'],
      payback_range_months: unc.payback_months as ValueEstimate['payback_range_months'],
    };
  }
  // flat fixture shape
  return {
    scenario: (r.scenario as ValueEstimate['scenario']) ?? req.scenario,
    fleet_size: num(r.fleet_size) ?? req.fleet_size,
    annual_value_usd_per_machine: num(r.annual_value_usd_per_machine) ?? 0,
    annual_value_usd_fleet: num(r.annual_value_usd_fleet) ?? 0,
    annual_cost_usd_per_machine: num(r.annual_cost_usd_per_machine),
    one_off_cost_usd_per_machine: num(r.one_off_cost_usd_per_machine),
    payback_months: num(r.payback_months) ?? null,
    levers: (r.levers as ValueLeverResult[]) ?? [],
    sensitivity: r.sensitivity as ValueEstimate['sensitivity'],
    label: (r.label as string) ?? 'ESTIMATE',
    notes: r.notes as string[] | undefined,
    inputs: r.inputs as Record<string, number> | undefined,
    gains_per_machine: r.gains_per_machine as Record<string, number> | undefined,
    range_usd_per_machine: r.range_usd_per_machine as ValueEstimate['range_usd_per_machine'],
    payback_range_months: r.payback_range_months as ValueEstimate['payback_range_months'],
  };
}

const TAG_KIND: Record<string, ValueAssumption['kind']> = { INPUT: 'customer', ASSUMPTION: 'assumption', SIMULATED: 'simulated', ESTABLISHED: 'published', VENDOR_CLAIM: 'published' };

function normaliseAssumptions(raw: unknown): ValueAssumption[] {
  const r = obj(raw);
  const a = r.assumptions ?? raw;
  if (Array.isArray(a)) return a as ValueAssumption[];
  return Object.entries(obj(a)).map(([key, v]) => {
    const x = obj(v);
    const src = String(x.source ?? '');
    const tag = String(x.tag ?? 'ASSUMPTION');
    return {
      key, label: humanise(key), value: num(x.base, x.value) ?? 0, unit: String(x.unit ?? ''), low: num(x.low), high: num(x.high),
      kind: TAG_KIND[tag.split(' ')[0]] ?? 'assumption', source: src.startsWith('http') ? `${tag} — source` : `${tag}${src ? ` — ${src}` : ''}`,
      source_url: src.startsWith('http') ? src : null, note: x.note as string | undefined,
    };
  });
}

const REQ_ROUTE: Record<string, string> = { R1: '/cab/home', R2: '/incidents', R3: '/training/practice', R4: '/anomaly', R5: '/tasks' };

function normaliseLevers(raw: unknown): ValueLeverMap[] {
  const r = obj(raw);
  const f = r.features ?? r.levers ?? raw;
  if (!Array.isArray(f)) return [];
  return (f as Array<Record<string, unknown>>).map((x) =>
    'how_measured' in x
      ? (x as unknown as ValueLeverMap)
      : {
          feature: `${x.requirement ? `${x.requirement} · ` : ''}${x.feature}`,
          lever: (Array.isArray(x.levers) ? (x.levers as string[]) : [String(x.lever ?? '')]).map((l) => valueMock.LEVER_LABEL[l] ?? l).join(' + '),
          kpi: `${x.kpi ?? ''}${x.gain_units ? ` (${x.gain_units})` : ''}`,
          how_measured: String(x.measure ?? x.how_measured ?? ''),
          route: REQ_ROUTE[String(x.requirement)] ?? undefined,
          provenance: ['ESTIMATE'],
        },
  );
}

function normalisePitch(raw: unknown): ValuePitch {
  const r = obj(raw);
  if (Array.isArray(r.headlines)) return r as unknown as ValuePitch;
  const nums = Array.isArray(r.numbers) ? (r.numbers as Array<Record<string, unknown>>) : [];
  return {
    label: r.label as string | undefined,
    caveat: r.status as string | undefined,
    headlines: nums.map((n) => {
      const unit = String(n.unit ?? '');
      return { key: String(n.key), label: String(n.label), unit, value: num(n.base, n.value) ?? 0, low: num(n.low), high: num(n.high), kind: unit.includes('USD') || unit === 'months' ? 'money' : 'gain' };
    }),
  };
}

function normaliseToday(raw: unknown): ValueToday {
  const r = obj(raw);
  if (Array.isArray(r.line_items)) return r as unknown as ValueToday;
  const gains = Array.isArray(r.gains) ? (r.gains as Array<Record<string, unknown>>) : [];
  return {
    total_usd: num(obj(r.usd).total_usd),
    label: r.label as string | undefined,
    note: r.simulated ? 'Gains from a SIMULATED shift and editable assumptions — not measured savings.' : 'Gains estimated from editable assumptions — not measured savings.',
    line_items: gains.map((g) => ({ key: String(g.key), label: String(g.label), value: num(g.value) ?? 0, unit: String(g.unit ?? ''), detail: g.basis as string | undefined, provenance: ['ESTIMATE'] })),
  };
}

function normaliseGains(raw: unknown): ValueGainsHeadline {
  const r = obj(raw);
  const g = Array.isArray(r.gains) ? (r.gains as Array<Record<string, unknown>>) : [];
  return {
    label: r.label as string | undefined,
    status: (g[0]?.status as string) ?? (r.status as string | undefined),
    gains: g.map((x) => ({ key: String(x.key), label: String(x.label), unit: String(x.unit ?? ''), value: num(x.base, x.value) ?? 0, low: num(x.low), high: num(x.high), headline: x.headline as string | undefined, basis: x.basis as string | undefined, evidence: x.evidence as ValueGainsHeadline['gains'][number]['evidence'] })),
  };
}

export const value = {
  estimate: async (req: ValueEstimateRequest) => {
    const overrides = Object.fromEntries(Object.entries(req.overrides ?? {}).map(([k, v]) => [VALUE_INPUT_KEYS[k] ?? k, v]));
    const body = { ...req, overrides };
    return normaliseValue(await request<unknown>({ origin: 'cloud', name: 'POST /value/estimate', method: 'POST', path: '/value/estimate', body, mock: () => valueMock.mockValueEstimate(body), timeoutMs: 15000 }), req);
  },
  assumptions: async () => normaliseAssumptions(await request<unknown>({ origin: 'cloud', name: 'GET /value/assumptions', path: '/value/assumptions', mock: valueMock.mockValueAssumptionsRaw })),
  levers: async () => normaliseLevers(await request<unknown>({ origin: 'cloud', name: 'GET /value/levers', path: '/value/levers', mock: valueMock.mockValueLeversRaw })),
  unitCosts: async () => {
    // L/h and $/L come from the assumption set; /value/unit-costs is USD-per-outcome (Business Value page).
    const a = await value.assumptions();
    const get = (k: string, d: number) => a.find((x) => x.key === k)?.value ?? d;
    return { ...valueMock.mockUnitCosts(), idle_fuel_l_per_h: get('idle_fuel_l_per_h', 3.8), fuel_usd_per_l: get('fuel_price_per_l', get('fuel_usd_per_l', 1)) } as ValueUnitCosts;
  },
  unitCostsRaw: () => request<unknown>({ origin: 'cloud', name: 'GET /value/unit-costs', path: '/value/unit-costs', mock: valueMock.mockUnitCostsRaw }),
  today: async (body: Record<string, unknown> = {}) =>
    normaliseToday(await request<unknown>({ origin: 'cloud', name: 'POST /value/today', method: 'POST', path: '/value/today', body, mock: valueMock.mockValueTodayRaw })),
  pitch: async () => normalisePitch(await request<unknown>({ origin: 'cloud', name: 'GET /value/pitch', path: '/value/pitch', mock: valueMock.mockValuePitchRaw, timeoutMs: 15000 })),
  gainsHeadline: async () => normaliseGains(await request<unknown>({ origin: 'cloud', name: 'GET /value/gains-headline', path: '/value/gains-headline', mock: valueMock.mockGainsHeadlineRaw, timeoutMs: 15000 })),
};
