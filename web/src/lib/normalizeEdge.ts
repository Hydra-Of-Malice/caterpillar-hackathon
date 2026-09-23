/**
 * Defensive defaults for edge payloads (HTTP and WS frames): arrays default to [], strings to '',
 * and small naming differences (qty_unit, planned_start, meta.zone) are mapped onto the UI types.
 */
import type { Alert, ChecklistStatus, Conditions, LiveSnapshot, ProximitySector, Shift, ShiftCurrent, ShiftReview, ShiftReviewTimelineItem, Task, TaskEstimate } from './types';

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
const listOf = (raw: unknown, key: string): J[] => (Array.isArray(raw) ? (raw as J[]) : a(o(raw)[key] ?? o(raw).items));

export function normAlert(x: unknown): Alert {
  const r = o(x);
  return {
    ...(r as unknown as Alert),
    tier: (s(r.tier) ?? 'T1') as Alert['tier'],
    signal_word: s(r.signal_word) ?? '',
    what: s(r.what) ?? '',
    why: s(r.why) ?? '',
    do: s(r.do) ?? '',
    state: (s(r.state) ?? 'raised') as Alert['state'],
    provenance: Array.isArray(r.provenance) ? (r.provenance as Alert['provenance']) : [],
    explanation: Array.isArray(r.explanation) ? (r.explanation as Alert['explanation']) : [],
  };
}

export const normAlerts = (raw: unknown): Alert[] => listOf(raw, 'alerts').map(normAlert);

export function normEstimate(x: unknown): TaskEstimate | null {
  if (!x || typeof x !== 'object') return null;
  const r = o(x);
  return {
    ...(r as unknown as TaskEstimate),
    drivers: a(r.drivers) as unknown as TaskEstimate['drivers'],
    provenance: (Array.isArray(r.provenance) ? r.provenance : ['ML', 'SIMULATED']) as TaskEstimate['provenance'],
    low_data: !!r.low_data,
  };
}

export function normTask(x: unknown): Task {
  const r = o(x);
  return { ...(r as unknown as Task), unit: s(r.unit, r.qty_unit) ?? '', zone: s(r.zone, o(r.meta).zone) ?? null, progress_pct: n(r.progress_pct) ?? 0, estimate: normEstimate(r.estimate) };
}

export const normTasks = (raw: unknown): Task[] => listOf(raw, 'tasks').map(normTask);

export function normShift(raw: unknown): ShiftCurrent {
  const r = o(raw);
  const sh = o(r.shift);
  return {
    ...(r as unknown as ShiftCurrent),
    shift: { ...(sh as unknown as Shift), planned_start_ts: n(sh.planned_start_ts, sh.planned_start) ?? 0, planned_end_ts: n(sh.planned_end_ts, sh.planned_end) ?? 0 },
    tasks: normTasks(r.tasks),
    conditions: { ...(o(r.conditions ?? sh.conditions) as unknown as Conditions) },
    checklist_status: { completed: false, passed: false, total: 0, passed_count: 0, ...o(r.checklist_status) } as ChecklistStatus,
    continuous_operation_min: n(r.continuous_operation_min) ?? 0,
    last_break_ts: n(r.last_break_ts) ?? null,
  };
}

export function normReview(raw: unknown): ShiftReview {
  const r = o(raw);
  const f = r.focus ? o(r.focus) : null;
  const ev = o(f?.evidence);
  return {
    ...(r as unknown as ShiftReview),
    totals: { operating_min: 0, tasks_done: 0, tasks_total: 0, material_m3: 0, idle_min: 0, ...o(r.totals) } as ShiftReview['totals'],
    idle_breakdown: { waiting_min: 0, unexplained_min: 0, ...o(r.idle_breakdown) } as ShiftReview['idle_breakdown'],
    alerts_by_signal_word: Object.fromEntries(Object.entries(o(r.alerts_by_signal_word)).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number>,
    well_done: (Array.isArray(r.well_done) ? (r.well_done as unknown[]) : []).map((w) => (typeof w === 'string' ? w : s(o(w).text, o(w).title) ?? '')),
    focus: f
      ? {
          ...(f as unknown as NonNullable<ShiftReview['focus']>),
          title: s(f.title) ?? '',
          detail: s(f.detail) ?? '',
          evidence_line: s(f.evidence_line, ev.text) ?? (n(ev.n_events) !== undefined ? `Based on ${n(ev.n_events)} events across ${n(ev.n_shifts) ?? 1} shifts` : ''),
          per_cycle: Array.isArray(f.per_cycle) ? (f.per_cycle as NonNullable<ShiftReview['focus']>['per_cycle']) : undefined,
        }
      : null,
    timeline: a(r.timeline).map((t) => ({ ...(t as unknown as ShiftReviewTimelineItem), label: s(t.label) ?? '', t_start: n(t.t_start, t.ts) ?? 0, alert: t.alert ? normAlert(t.alert) : undefined })),
  };
}

export function normSnapshot(raw: unknown): LiveSnapshot {
  const r = o(raw);
  const p = o(r.proximity);
  return {
    ...(r as unknown as LiveSnapshot),
    seatbelt: r.seatbelt !== false,
    travel_kmh: n(r.travel_kmh) ?? 0,
    proximity: {
      fitted: p.fitted !== false,
      status: s(p.status) as LiveSnapshot['proximity']['status'],
      sectors: o(p.sectors) as LiveSnapshot['proximity']['sectors'],
      truck_m: n(p.truck_m) ?? null,
      truck_id: s(p.truck_id) ?? null,
      truck_sector: (s(p.truck_sector) ?? null) as ProximitySector | null,
      person_m: n(p.person_m) ?? null,
      person_sector: (s(p.person_sector) ?? null) as ProximitySector | null,
      last_good_ts: n(p.last_good_ts) ?? null,
    },
    idle: { today_min: 0, waiting_min: 0, ...o(r.idle) } as LiveSnapshot['idle'],
    task: r.task ? ({ ...o(r.task), unit: s(o(r.task).unit, o(r.task).qty_unit) ?? '' } as unknown as LiveSnapshot['task']) : null,
    eta: normEstimate(r.eta),
  };
}
