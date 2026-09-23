/**
 * Normalisers from the running services' response shapes (sentinel/cloud, sentinel/edge_api,
 * sentinel/practice) onto the UI types in ./types. Each one is tolerant: fields already in the UI
 * shape pass through. Throwing NotTrained makes the api layer serve the fixture and flag it as
 * "DEMO FIXTURE — model trains tomorrow".
 */
import type {
  AlertRates,
  ChecklistItem,
  CompetencyEntry,
  ContentReviewItem,
  CrewSummary,
  DriftReport,
  Escalation,
  IdleSummary,
  InstructorOperatorRow,
  InstructorSlot,
  MachineIssue,
  ModelCard,
  OperatorProfile,
  PracticeSession,
  Quiz,
  QuizAttemptResponse,
  Recommendation,
  TrainingModule,
} from './types';

export class NotTrained extends Error {}

type J = Record<string, unknown>;
const o = (x: unknown): J => (x && typeof x === 'object' && !Array.isArray(x) ? (x as J) : {});
const a = (x: unknown): J[] => (Array.isArray(x) ? (x as J[]) : []);
const n = (...xs: unknown[]): number | undefined => {
  for (const x of xs) if (typeof x === 'number' && Number.isFinite(x)) return x;
  return undefined;
};
const s = (...xs: unknown[]): string | undefined => {
  for (const x of xs) if (typeof x === 'string' && x) return x;
  return undefined;
};
const listOf = (raw: unknown, ...keys: string[]): J[] => {
  if (Array.isArray(raw)) return raw as J[];
  for (const k of [...keys, 'items', 'data', 'results']) if (Array.isArray(o(raw)[k])) return o(raw)[k] as J[];
  return [];
};
const ver = (v: unknown) => {
  const t = s(v, typeof v === 'number' ? String(v) : undefined) ?? '';
  return t && !t.startsWith('v') ? `v${t}` : t;
};
const sect = (v: unknown) => {
  const t = s(v) ?? '';
  return t && !t.startsWith('§') ? `§${t}` : t;
};

/** Evidence objects become one plain line — never probabilities/confidence (operator-facing). */
function evidenceLine(e: unknown): string | null {
  if (typeof e === 'string') return e;
  const x = o(e);
  if (s(x.text)) return s(x.text)!;
  const ev = n(x.n_events);
  const sh = n(x.n_shifts);
  if (ev !== undefined) return `${ev} event${ev === 1 ? '' : 's'}${sh !== undefined ? ` across ${sh} shift${sh === 1 ? '' : 's'}` : ''}`;
  return null;
}

// ------------------------------------------------------------------ training
function citation(c: unknown) {
  const x = o(c);
  return { chunk_id: s(x.chunk_id), doc_id: s(x.doc_id) ?? 'SOP', section: sect(x.section), version: ver(x.version), text: s(x.text), title: s(x.doc_title, x.heading, x.title) };
}

export function normModule(raw: unknown): TrainingModule {
  const m = o(raw);
  const appr = o(m.instructor_approved);
  const kps = a(m.key_points).map((k) => ({ text: s(k.text) ?? '', citations: [...a(k.citations).map(citation), ...(k.citation ? [citation(k.citation)] : [])] }));
  return {
    module_id: s(m.module_id, m.id) ?? '',
    title: s(m.title) ?? '',
    competency_id: s(m.competency_id, a(m.competency_ids)[0] as unknown) ?? (Array.isArray(m.competency_ids) ? String((m.competency_ids as unknown[])[0] ?? '') : ''),
    duration_min: n(m.duration_min) ?? 0,
    format: s(m.format) ?? 'micro_lesson',
    version: ver(m.version),
    approved_by: s(m.approved_by, appr.by)?.replace(/^INS-\d+\s*/, ''),
    approved_at: s(m.approved_at, appr.date),
    machine_types: m.machine_types as string[] | undefined,
    summary: s(m.summary),
    steps: (m.steps as string[] | undefined) ?? ['Expert demonstration', 'Key points', 'Scenario quiz'],
    key_points: kps,
    why_for_you: s(m.why_for_you) ?? null,
    status: s(m.status),
    safety_critical: m.safety_critical as boolean | undefined,
  };
}

export function normModules(raw: unknown): TrainingModule[] {
  return listOf(raw, 'modules').map(normModule);
}

export function normRecommendations(raw: unknown): Recommendation[] {
  return listOf(raw, 'recommendations').map((r) => {
    if (!r.module) return r as unknown as Recommendation;
    const m = normModule(r.module);
    const whys = Array.isArray(r.why) ? (r.why as J[]) : [o(r.why)];
    const w = whys[0] ?? {};
    const state = s(w.state);
    return {
      module_id: m.module_id,
      title: m.title,
      duration_min: m.duration_min,
      why: s(w.text, w.reason_text) ?? (s(w.reason) === 'competency_gap' ? `Gap observed: ${s(w.competency_label) ?? ''}` : s(w.reason) ?? 'Recommended for you'),
      evidence: evidenceLine(w) ?? undefined,
      competency_id: s(w.competency_id) ?? m.competency_id,
      status: state === 'in_training' ? 'in_training' : state === 'demonstrated' ? 'completed' : 'not_started',
      version: m.version,
      approved_by: m.approved_by,
      approved_at: m.approved_at,
      format: m.format,
    };
  });
}

export function normQuiz(raw: unknown): Quiz {
  const q = o(raw);
  const qs = a(q.questions).map((x) => ({
    question_id: s(x.question_id, x.id) ?? '',
    prompt: s(x.prompt) ?? '',
    options: a(x.options).length ? a(x.options).map((op, i) => ({ id: s(op.id) ?? String(i), text: s(op.text) ?? '' })) : ((x.options as unknown[]) ?? []).map((t, i) => ({ id: String(i), text: String(t) })),
    correct_option_id: x.correct_option_id as string | undefined,
    explanation: s(x.explanation),
    citation: x.citation ? citation(x.citation) : undefined,
  }));
  const pm = n(q.pass_mark);
  return { module_id: s(q.module_id) ?? '', title: s(q.title), pass_mark: pm !== undefined && pm <= 1 ? Math.ceil(pm * qs.length) : pm, questions: qs };
}

export function normQuizAttempt(raw: unknown): QuizAttemptResponse {
  const r = o(raw);
  const correct = n(r.correct);
  return {
    attempt_id: s(r.attempt_id),
    score: correct ?? n(r.score) ?? 0,
    total: n(r.total) ?? 0,
    passed: !!r.passed,
    results: a(r.results).map((x) => ({ question_id: s(x.question_id) ?? '', correct: !!x.correct, correct_option_id: x.answer !== undefined ? String(x.answer) : (x.correct_option_id as string | undefined), explanation: s(x.explanation) })),
    next: s(r.next),
  };
}

export function normSlots(raw: unknown): InstructorSlot[] {
  return listOf(raw, 'slots').map((x) => ({
    slot_id: s(x.slot_id) ?? '',
    instructor_id: s(x.instructor_id) ?? '',
    start_ts: n(x.start_ts, x.slot_start) ?? 0,
    end_ts: n(x.end_ts, x.slot_end) ?? 0,
    format: s(x.format, a(x.formats)[0] as unknown) ?? (Array.isArray(x.formats) ? String((x.formats as unknown[])[0] ?? 'simulator') : 'simulator'),
    location: s(x.location),
    available: x.available !== false,
  }));
}

export function normProfile(raw: unknown): OperatorProfile {
  const p = o(raw);
  const comps: CompetencyEntry[] = a(p.competencies).map((c) => ({
    id: s(c.id) ?? '',
    label: s(c.label) ?? '',
    state: (s(c.state) ?? 'unassessed') as CompetencyEntry['state'],
    evidence: evidenceLine(c.evidence ?? c.latest_evidence),
    verified_by: s(c.verified_by, o(c.verified_by).initials, o(c.verified_by).by) ?? null,
    safety_critical: c.safety_critical as boolean | undefined,
  }));
  return { ...(p as unknown as OperatorProfile), competencies: comps };
}

export function normInstructorOperators(raw: unknown): InstructorOperatorRow[] {
  return listOf(raw, 'operators').map((r) => ({
    operator_id: s(r.operator_id) ?? '',
    name: s(r.name) ?? '',
    level: s(r.level, r.experience_band),
    competencies: Array.isArray(r.competencies)
      ? (r.competencies as InstructorOperatorRow['competencies'])
      : Object.entries(o(r.cells)).map(([id, st]) => ({ id, state: (typeof st === 'string' ? st : s(o(st).state) ?? 'unassessed') as InstructorOperatorRow['competencies'][number]['state'] })),
  }));
}

export function normContentReview(raw: unknown): ContentReviewItem[] {
  return listOf(raw, 'items').map((r) => {
    const d = r.diff;
    const diff = Array.isArray(d)
      ? (d as ContentReviewItem['diff'])
      : [
          ...((o(d).removed as unknown[] | undefined) ?? []).map((t) => ({ op: 'del' as const, text: String(t) })),
          ...((o(d).added as unknown[] | undefined) ?? []).map((t) => ({ op: 'add' as const, text: String(t) })),
        ];
    return {
      review_id: s(r.review_id, r.id) ?? '',
      module_id: s(r.module_id) ?? '',
      title: s(r.title) ?? '',
      version: ver(r.version),
      change_summary: s(r.change_summary) ?? '',
      sources_cited: n(r.sources_cited) ?? 0,
      citation_check: (s(r.citation_check) ?? 'PASS') as ContentReviewItem['citation_check'],
      status: (s(r.status) ?? 'in_review') as ContentReviewItem['status'],
      diff: diff?.filter((x, i, arr) => arr.findIndex((y) => y.op === x.op && y.text === x.text) === i),
    };
  });
}

// ------------------------------------------------------------------ supervisor / behaviour
export function normCrew(raw: unknown): CrewSummary {
  const r = o(raw);
  if (Array.isArray(r.machines)) return r as unknown as CrewSummary;
  const k = o(r.kpis);
  const tasks = o(k.tasks);
  const rows = a(r.rows);
  const total = (n(tasks.done) ?? 0) + (n(tasks.in_progress) ?? 0) + (n(tasks.queued) ?? 0);
  return {
    site: s(r.site, r.site_name) ?? 'North Quarry',
    shift_label: s(r.shift_label) ?? 'Day shift',
    kpis: {
      machines_active: n(k.machines_active) ?? rows.length,
      machines_total: n(k.machines_total) ?? rows.length,
      protection_degraded: n(k.protection_degraded) ?? 0,
      open_escalations: n(k.open_escalations) ?? 0,
      idle_today_min: n(k.idle_today_min) ?? 0,
      idle_waiting_pct: n(k.idle_waiting_pct, k.idle_waiting_for_truck_pct) ?? 0,
      tasks_on_track: n(k.tasks_on_track) ?? (n(tasks.done) ?? 0) + (n(tasks.in_progress) ?? 0),
      tasks_total: n(k.tasks_total) ?? total,
      idle_fuel_l: n(k.idle_fuel_l, o(r.value_inputs).idle_fuel_l),
    },
    machines: rows.map((m) => {
      const op = o(m.operator);
      const t = o(m.current_task);
      const est = o(t.estimate);
      const prot = o(m.protection);
      const now = Date.now() / 1000;
      const rem = (k2: string) => n(est[`remaining_${k2}_min`], est[`${k2}_min`]);
      return {
        machine_id: s(m.machine_id) ?? '',
        model: s(m.model, m.machine_model) ?? '',
        operator_id: s(m.operator_id, op.operator_id) ?? '',
        operator_name: s(m.operator_name, op.name) ?? '',
        task: s(m.task, t.name) ?? 'No active task',
        task_detail: s(m.task_detail, t.location),
        progress_pct: n(m.progress_pct, t.progress_pct) ?? 0,
        progress_label: s(m.progress_label) ?? (t.planned_qty ? `${Math.round(n(t.done_qty) ?? 0)} / ${n(t.planned_qty)} ${s(t.unit, t.qty_unit) ?? ''}` : '—'),
        estimate: rem('p50') !== undefined ? { p10_ts: now + (rem('p10') ?? 0) * 60, p50_ts: now + (rem('p50') ?? 0) * 60, p90_ts: now + (rem('p90') ?? 0) * 60 } : null,
        protection: (s(m.protection) ?? (s(prot.status) === 'active' ? 'active' : s(prot.status) === 'not_fitted' ? 'not_fitted' : 'degraded')) as 'active' | 'degraded' | 'not_fitted',
        protection_note: s(prot.reason, prot.note),
        alerts_by_signal_word: Object.fromEntries(Object.entries(o(m.alerts_by_signal_word ?? m.open_alerts)).filter(([w, v]) => typeof v === 'number' && v > 0 && w !== 'SUPERVISOR NOTIFIED')) as Record<string, number>,
        continuous_operation_min: n(m.continuous_operation_min) ?? 0,
        last_sync_ts: n(m.last_sync_ts, m.last_activity_ts) ?? now,
        idle_min: n(o(m.value_inputs).idle_min),
        idle_fuel_l: n(o(m.value_inputs).idle_fuel_l),
      };
    }),
  };
}

export function normEscalations(raw: unknown): Escalation[] {
  return listOf(raw, 'escalations', 'items').map((e) => ({
    escalation_id: s(e.escalation_id, e.alert_id, e.id) ?? '',
    machine_id: s(e.machine_id) ?? '',
    operator_id: s(e.operator_id) ?? '',
    operator_name: s(e.operator_name),
    what: s(e.what) ?? '',
    detail: s(e.detail, e.why),
    ts: n(e.ts) ?? 0,
    status: s(e.status) === 'resolved' || s(e.state) === 'resolved' || e.resolution ? 'resolved' : 'open',
    note: s(o(e.resolution).note, e.note) ?? null,
  }));
}

export function normMachineIssues(raw: unknown): MachineIssue[] {
  return listOf(raw, 'issues', 'items').map((m) => ({
    machine_id: s(m.machine_id) ?? '',
    issue: s(m.issue) ?? `${String(s(m.signature) ?? 'issue').replace(/_/g, ' ')} ×${n(m.count) ?? 1}${s(m.verdict) ? ` — ${s(m.verdict)}` : ''}${s(m.action) ? `. ${s(m.action)}` : ''}`,
    attribution: (s(m.attribution) ?? 'machine') as MachineIssue['attribution'],
    since_ts: n(m.since_ts, m.first_ts) ?? 0,
    dtc: m.dtc as string[] | undefined,
    operators_affected: n(m.operators_affected, m.n_operators),
  }));
}

export function normIdle(raw: unknown): IdleSummary {
  const r = o(raw);
  const ms = a(r.machines);
  if (ms.length && Array.isArray(ms[0].days)) return r as unknown as IdleSummary;
  const date = s(r.date) ?? '';
  const totals = o(r.totals);
  return {
    date,
    machines: ms.map((m) => ({ machine_id: s(m.machine_id) ?? '', days: [{ date: date.slice(5) || 'today', waiting_min: n(m.waiting_for_truck_min) ?? 0, warmup_min: n(m.warmup_cooldown_min) ?? 0, unexplained_min: n(m.unexplained_min) ?? 0 }] })),
    longest_unexplained: a(r.longest_unexplained).map((l) => {
      const c = o(l.context);
      return {
        machine_id: s(l.machine_id) ?? '',
        operator_id: s(l.operator_id) ?? '',
        start_ts: n(l.start_ts, l.ts) ?? 0,
        duration_min: n(l.duration_min, l.minutes) ?? 0,
        context: typeof l.context === 'string' ? l.context : Object.entries(c).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · '),
      };
    }),
    fuel_unexplained_l: n(r.fuel_unexplained_l, totals.fuel_l_unexplained) ?? 0,
    fuel_unexplained_usd: n(r.fuel_unexplained_usd),
    provenance: (r.provenance as IdleSummary['provenance']) ?? ['RULE', 'SIMULATED'],
  };
}

// ------------------------------------------------------------------ monitoring
export function normAlertRates(raw: unknown, fallback: AlertRates): AlertRates {
  const r = o(raw);
  if (n(r.per_operating_hour) !== undefined) return r as unknown as AlertRates;
  const tiers = a(r.tiers);
  const inCab = tiers.filter((t) => ['T_CRIT', 'T1', 'T2', 'T3'].includes(String(t.tier)));
  const by: Record<string, number> = {};
  tiers.forEach((t) => (by[String(t.tier)] = n(t.rate_per_h) ?? 0));
  return {
    ...fallback,
    per_operating_hour: +inCab.reduce((acc, t) => acc + (n(t.rate_per_h) ?? 0), 0).toFixed(2),
    budget: n(r.budget_per_h) ?? tiers.reduce((acc, t) => acc + (n(t.budget_per_h) ?? 0), 0) ?? fallback.budget,
    by_tier: by,
    feedback_not_correct: Array.isArray(r.feedback) ? (r.feedback as AlertRates['feedback_not_correct']) : fallback.feedback_not_correct,
  };
}

export function normDrift(raw: unknown): DriftReport {
  const r = o(raw);
  if (Array.isArray(r.features)) return r as unknown as DriftReport;
  const ctx = a(r.contexts);
  const map = new Map<string, { psi: number[]; status?: string }>();
  ctx.forEach((c) => a(c.features).forEach((f) => {
    const k = s(f.feature) ?? '';
    const e = map.get(k) ?? { psi: [] };
    e.psi.push(n(f.psi) ?? 0);
    e.status = s(f.status) ?? e.status;
    map.set(k, e);
  }));
  return { window: ctx.map((c) => s(c.context_key)).filter(Boolean).join(', '), features: [...map.entries()].map(([feature, v]) => ({ feature, psi: Math.max(...v.psi), series: v.psi.length > 1 ? v.psi : [v.psi[0] * 0.6, v.psi[0]], status: v.status })) };
}

export function normModels(raw: unknown): ModelCard[] {
  const ms = listOf(raw, 'models');
  if (!ms.length || ms.some((m) => s(m.status) === 'not_trained' || (m.card === null && !m.training_data))) throw new NotTrained('models not trained yet');
  return ms.map((m) => {
    const c = o(m.card);
    return { kind: s(m.kind) ?? '', name: s(m.title, c.name), version: s(m.version, c.version) ?? '', training_data: s(c.training_data, m.training_data) ?? 'SIMULATED', features: (c.features ?? m.features) as ModelCard['features'], metrics: (c.metrics ?? m.metrics) as ModelCard['metrics'], limits: (c.limits ?? m.limits) as string[] | undefined, sha256: s(c.sha256, m.sha256), threshold: s(c.threshold), provenance: ['ML', 'SIMULATED'] };
  });
}

// ------------------------------------------------------------------ practice / edge
export function normPracticeSessions(raw: unknown): PracticeSession[] {
  const list = listOf(raw, 'sessions');
  if (!list.length) throw new NotTrained('no analysed practice sessions yet');
  return list.map((x) => ({ ...(x as unknown as PracticeSession), created_ts: n(x.created_ts, x.started_at), finished_ts: n(x.finished_ts, x.ended_at) ?? null }));
}

export function normChecklistItems(raw: unknown): ChecklistItem[] {
  return listOf(raw, 'items').map((i) => ({ ...(i as unknown as ChecklistItem), group: s(i.group_label, i.group) ?? '' }));
}

/** Live incidents: raw ±10 s telemetry samples → {t (s from event), swing_dps, travel_kmh, prox_m}. */
export function normIncident(raw: unknown): import('./types').Incident {
  const i = o(raw) as J & { ts?: number };
  const ts = n(i.ts) ?? 0;
  const ctx = o(i.context);
  const snapshot = a(i.snapshot).map((x) => ('t' in x ? x : { ...x, t: +((n(x.ts) ?? ts) - ts).toFixed(1), prox_m: n(x.prox_person_m, x.prox_truck_m, x.bucket_to_truck_m) ?? null }));
  const prov = (i.provenance as string[] | undefined) ?? (i.source === 'manual' ? ['MANUAL'] : [ctx.rule_id ? 'RULE' : null, ctx.model_version ? 'ML' : null, 'SIMULATED'].filter(Boolean) as string[]);
  return { ...(i as unknown as import('./types').Incident), snapshot, provenance: prov as import('./types').Provenance[] };
}

export function normIncidents(raw: unknown): import('./types').Incident[] {
  return listOf(raw, 'incidents').map(normIncident);
}
