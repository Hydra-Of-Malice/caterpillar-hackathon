/**
 * Read-side helpers for PracticeReport. The trajectory overlay is parsed from the analyser's shape
 * (sentinel/practice/analyser.py::_overlay: {phases:{phase:{channels:{ch:{expert_p10…, trainee_mean}}}}},
 * normalised time 0..1) and, as a fallback, a flat {phase:{ch:{t, expert_p10…, trainee}}} shape.
 */
import type { CoachingTip, PracticeReport } from './types';

export const WORK_PHASES = ['dig', 'swing_loaded', 'dump', 'swing_empty'] as const;

export interface OverlayChannel {
  key: string;
  label: string;
  unit: string;
  t: number[]; // 0..100 %
  p10: number[];
  p50: number[];
  p90: number[];
  trainee: number[];
  exitFrac?: number;
}

export interface OverlayPhase {
  phase: string;
  channels: OverlayChannel[];
  expertDurationS?: number;
}

export interface ParsedOverlay {
  phases: OverlayPhase[];
  label?: string;
  worst?: { phase: string; channel: string; exit_frac: number } | null;
}

const arr = (x: unknown): number[] => (Array.isArray(x) ? x.map(Number) : []);
const CH_LABEL: Record<string, string> = { joy_swing: 'Swing lever', joy_boom: 'Boom lever', joy_stick: 'Stick lever', joy_bucket: 'Bucket lever', swing_dps: 'Swing speed', boom_angle_deg: 'Boom angle' };

function channel(key: string, c: Record<string, unknown>): OverlayChannel | null {
  const p50 = arr(c.expert_p50);
  const trainee = arr(c.trainee_mean ?? c.trainee);
  if (!p50.length) return null;
  const n = p50.length;
  const tRaw = arr(c.t);
  const t = tRaw.length === n ? (Math.max(...tRaw) <= 1.0001 ? tRaw.map((v) => v * 100) : tRaw) : Array.from({ length: n }, (_, i) => (i / (n - 1)) * 100);
  const label = typeof c.label === 'string' ? c.label.charAt(0).toUpperCase() + c.label.slice(1) : CH_LABEL[key] ?? key;
  return { key, label, unit: String(c.unit ?? ''), t, p10: arr(c.expert_p10), p50, p90: arr(c.expert_p90), trainee, exitFrac: typeof c.exit_frac === 'number' ? c.exit_frac : undefined };
}

export function parseOverlay(report: PracticeReport | undefined | null): ParsedOverlay {
  const ov = (report?.trajectory_overlay ?? {}) as Record<string, unknown>;
  const phasesObj = (ov.phases && typeof ov.phases === 'object' ? ov.phases : ov) as Record<string, unknown>;
  const flatDur = (ov.expert_phase_durations_s ?? {}) as Record<string, number>;
  const phases: OverlayPhase[] = [];
  for (const p of WORK_PHASES) {
    const ph = phasesObj[p] as Record<string, unknown> | undefined;
    if (!ph || typeof ph !== 'object') continue;
    const chObj = (ph.channels && typeof ph.channels === 'object' ? ph.channels : ph) as Record<string, unknown>;
    const channels = Object.entries(chObj)
      .map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? channel(k, v as Record<string, unknown>) : null))
      .filter((c): c is OverlayChannel => !!c);
    const d = ph.expert_duration_s as Record<string, number> | number | undefined;
    const expertDurationS = typeof d === 'number' ? d : d?.p50 ?? flatDur[p];
    if (channels.length) phases.push({ phase: p, channels, expertDurationS });
  }
  return { phases, label: typeof ov.label === 'string' ? ov.label : undefined, worst: (ov.worst as ParsedOverlay['worst']) ?? null };
}

/** Mean trainee duration per phase from the cycle reports. */
export function traineePhaseDurations(report: PracticeReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of WORK_PHASES) {
    const ds = report.cycles.map((c) => c.phases.find((x) => x.phase === p)?.duration_s).filter((x): x is number => typeof x === 'number');
    if (ds.length) out[p] = ds.reduce((a, b) => a + b, 0) / ds.length;
  }
  return out;
}

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Headline gains for "Value of closing the gap" — operational units only (no dollars). */
export function practiceGains(report: PracticeReport) {
  const p = report.productivity ?? {};
  const v = report.value_estimate ?? {};
  const g = (v.gains ?? {}) as Record<string, unknown>;
  const a = (v.assumptions ?? {}) as Record<string, unknown>;
  const aval = (k: string) => num((a[k] as Record<string, unknown> | undefined)?.value) ?? num(a[k]);
  const trainee = num(p.trainee_m3_per_h) ?? num(v.trainee_m3_per_h);
  const expert = num(p.expert_m3_per_h) ?? num(v.expert_m3_per_h);
  const tc = num(p.trainee_cycle_s);
  const ec = num(p.expert_cycle_s);
  const closure = aval('practice_gap_closure_frac') ?? aval('gap_closure') ?? 0.25;
  const shiftH = aval('productive_hours_per_shift') ?? num(p.productive_h_per_shift) ?? 5.2;
  const m3PerShift = num(g.extra_m3_per_shift) ?? num(v.m3_per_shift_gain) ?? (trainee && expert ? Math.max(0, expert - trainee) * closure * shiftH : undefined);
  const upliftPct = num(g.output_uplift_pct) ?? (trainee && expert ? (100 * Math.max(0, expert - trainee) * closure) / trainee : undefined);
  return {
    trainee,
    expert,
    traineeCycleS: tc,
    expertCycleS: ec,
    closure,
    gapPct: num(g.gap_to_expert_pct) ?? num(p.gap_pct),
    secondsPerCycle: num(g.cycle_s_saved) ?? (tc && ec ? (tc - ec) * closure : undefined),
    m3PerShift,
    m3PerYear: num(g.extra_m3_per_year),
    upliftPct,
    productiveHoursFreed: num(g.productive_hours_freed_per_year),
    fuelSavedL: num(g.fuel_l_saved_per_year),
    hoursFor420: trainee ? 420 / trainee : undefined,
    expertHoursFor420: expert ? 420 / expert : undefined,
    shiftH,
  };
}

/** "Fixing this ≈ +N m³/shift" when the tip evidence carries seconds saved per cycle. */
export function tipGainM3(report: PracticeReport, tip: CoachingTip): number | undefined {
  const e = tip.evidence ?? {};
  const direct = num(e.m3_per_shift_gain) ?? num(e.m3_per_shift);
  if (direct !== undefined) return direct;
  const s = num(e.seconds_saved_per_cycle) ?? num(e.seconds_saved);
  const g = practiceGains(report);
  if (!s || !g.trainee || !g.traineeCycleS || g.traineeCycleS <= s) return undefined;
  return ((g.trainee * s) / (g.traineeCycleS - s)) * g.shiftH;
}

export function tipSecondsSaved(tip: CoachingTip): number | undefined {
  const e = tip.evidence ?? {};
  return num(e.seconds_saved_per_cycle) ?? num(e.seconds_saved);
}

export function exerciseLabel(id: string): string {
  return id === 'truck_loading_basic' ? 'Truck loading — basic' : id === 'trench_basic' ? 'Trench — basic' : id.replace(/_/g, ' ');
}

export const BAND_LABEL: Record<string, string> = { beginner: 'BEGINNER', developing: 'DEVELOPING', proficient: 'PROFICIENT', expert_like: 'EXPERT-LIKE' };
