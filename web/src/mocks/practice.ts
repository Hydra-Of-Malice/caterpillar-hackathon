/**
 * Practice Analyser fixtures: a small stand-in for the Expert Motion Model (SIMULATED).
 * It produces PracticeReport objects with exactly the schema shape (sentinel/shared/schemas.py),
 * so the report UI can be built and demoed before agent D's analyser is available.
 */
import type {
  CoachingTip,
  CycleMetric,
  MetricStatus,
  Phase,
  PracticeCycleReport,
  PracticeExercise,
  PracticeGenerateResponse,
  PracticeReport,
  PracticeSession,
  ScoreBand,
} from '../lib/types';
import { COMPETENCY_MODULE, at } from './world';

export const PRACTICE_PHASES: Phase[] = ['dig', 'swing_loaded', 'dump', 'swing_empty'];
export const PRACTICE_CHANNELS = ['joy_swing', 'joy_boom', 'joy_stick', 'joy_bucket'] as const;
export type PracticeChannel = (typeof PRACTICE_CHANNELS)[number];

export const ARCHETYPES = ['novice', 'intermediate', 'novice_improving', 'expert'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const EXERCISES: PracticeExercise[] = [
  { exercise_id: 'truck_loading_basic', title: 'Truck loading — basic', label: 'Truck loading — basic', description: 'Load a haul truck from a bench: dig, swing loaded, dump, return.', task_type: 'truck_loading' },
  { exercise_id: 'trench_basic', title: 'Trench — basic', label: 'Trench — basic', description: 'Dig a 1.5 m trench to grade, cast spoil to the side.', task_type: 'trenching' },
];

const EXPERT_DURATIONS: Record<string, Record<string, number>> = {
  truck_loading_basic: { dig: 6.5, swing_loaded: 4.5, dump: 2.4, swing_empty: 4.1 },
  trench_basic: { dig: 7.5, swing_loaded: 3.5, dump: 2.0, swing_empty: 3.2 },
};
const SLOWDOWN: Record<string, number> = { dig: 0.5, swing_loaded: 0.55, dump: 0.7, swing_empty: 0.5 };

// ------------------------------------------------------------------ seeded helpers
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const bell = (u: number, c: number, w: number) => Math.exp(-(((u - c) / w) ** 2));
const trapezoid = (u: number, a: number, b: number, c: number, d: number) =>
  u <= a || u >= d ? 0 : u < b ? (u - a) / (b - a) : u <= c ? 1 : (d - u) / (d - c);
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Expert median control profile for a phase at normalised time u (0..1). */
export function expertProfile(phase: string, ch: PracticeChannel, u: number): number {
  switch (phase) {
    case 'dig':
      return { joy_swing: 0, joy_boom: -0.4 * bell(u, 0.15, 0.15) + 0.6 * bell(u, 0.88, 0.16), joy_stick: 0.75 * bell(u, 0.45, 0.24), joy_bucket: 0.8 * bell(u, 0.7, 0.18) }[ch];
    case 'swing_loaded':
      return { joy_swing: 0.82 * trapezoid(u, 0.02, 0.25, 0.6, 0.95), joy_boom: 0.7 * bell(u, 0.3, 0.24), joy_stick: -0.15 * bell(u, 0.62, 0.28), joy_bucket: 0.1 * bell(u, 0.5, 0.3) }[ch];
    case 'dump':
      return { joy_swing: 0, joy_boom: 0.12 * bell(u, 0.2, 0.2), joy_stick: -0.6 * bell(u, 0.42, 0.24), joy_bucket: -0.9 * bell(u, 0.55, 0.22) }[ch];
    case 'swing_empty':
      return { joy_swing: -0.82 * trapezoid(u, 0.02, 0.22, 0.62, 0.95), joy_boom: -0.6 * bell(u, 0.55, 0.25), joy_stick: 0.35 * bell(u, 0.72, 0.2), joy_bucket: 0.1 * bell(u, 0.82, 0.14) }[ch];
    default:
      return 0;
  }
}

function bandHalfWidth(p50: number): number {
  return 0.07 + 0.12 * Math.abs(p50);
}

/** Trainee control profile: expert shape distorted by skill gap s (0 = expert, 1 = novice). */
export function traineeProfile(phase: string, ch: PracticeChannel, u: number, s: number, wobble = 0): number {
  const jitter = s * 0.13 * Math.sin(u * 23 + wobble) + s * 0.07 * Math.sin(u * 41 + wobble * 1.7);
  switch (phase) {
    case 'dig': {
      if (ch === 'joy_stick') return clamp(0.75 * (bell(u, 0.35, 0.16) + 0.8 * s * bell(u, 0.68, 0.12)) * (1 - 0.25 * s) + jitter);
      if (ch === 'joy_bucket') return clamp(0.8 * bell(u, 0.7 + 0.15 * s, 0.18 - 0.06 * s) + jitter);
      return clamp(expertProfile(phase, ch, u) + jitter);
    }
    case 'swing_loaded': {
      // Novices raise the boom first and swing afterwards, then brake late near the truck.
      if (ch === 'joy_swing') return clamp(0.82 * (1 + 0.28 * s) * trapezoid(u, 0.02 + 0.3 * s, 0.25 + 0.3 * s, 0.72, 0.99) + jitter);
      if (ch === 'joy_boom') return clamp(0.78 * bell(u, 0.3 - 0.14 * s, 0.24 - 0.1 * s) + jitter);
      return clamp(expertProfile(phase, ch, u) + jitter);
    }
    case 'dump': {
      if (ch === 'joy_bucket') return clamp(-0.9 * ((1 - s) * bell(u, 0.55, 0.22) + s * 0.75 * (bell(u, 0.35, 0.12) + bell(u, 0.75, 0.12))) + jitter);
      if (ch === 'joy_stick') return clamp(-0.6 * bell(u, 0.42 + 0.2 * s, 0.24) + jitter);
      return clamp(expertProfile(phase, ch, u) + jitter);
    }
    case 'swing_empty': {
      if (ch === 'joy_boom') return clamp(-0.6 * bell(u, 0.55 + 0.25 * s, 0.25 - 0.08 * s) + jitter);
      return clamp(expertProfile(phase, ch, u) * (1 + 0.15 * s) + jitter);
    }
    default:
      return 0;
  }
}

export function expertBand(phase: string, ch: PracticeChannel, u: number): { p10: number; p50: number; p90: number } {
  const p50 = expertProfile(phase, ch, u);
  const w = bandHalfWidth(p50);
  return { p10: +(p50 - w).toFixed(3), p50: +p50.toFixed(3), p90: +(p50 + w).toFixed(3) };
}

// ------------------------------------------------------------------ metrics
interface MetricSpec {
  name: string;
  label: string;
  unit: string;
  p10: number;
  p50: number;
  p90: number;
  better: CycleMetric['better'];
  value: (s: number, r: number) => number;
  phase: Phase | null;
  competency: string;
  safety?: boolean;
  tip: (v: string, m: MetricSpec) => { title: string; detail: string };
}

const fmtBand = (m: MetricSpec) => `${m.p10}–${m.p90}${m.unit ? ' ' + m.unit : ''}`;

const COMMON: MetricSpec[] = [
  {
    name: 'boom_swing_overlap_pct', label: 'Boom–swing overlap', unit: '%', p10: 55, p50: 68, p90: 80, better: 'higher', phase: 'swing_loaded', competency: 'C09',
    value: (s, r) => 68 - 55 * s + 4 * (r - 0.5),
    tip: (v, m) => ({ title: 'Start the swing earlier while raising the boom', detail: `You raise the boom first and then swing. Experts start swinging when the boom is about half-way up, so both move together. Your overlap: ${v}% (expert ${fmtBand(m)}).` }),
  },
  {
    name: 'swing_jerk_index', label: 'Swing smoothness (jerk)', unit: '', p10: 0.8, p50: 1.1, p90: 1.5, better: 'lower', phase: 'swing_empty', competency: 'C09',
    value: (s, r) => 1.1 + 2.1 * s + 0.2 * (r - 0.5),
    tip: (v, m) => ({ title: 'Move the swing lever in one smooth stroke', detail: `Small back-and-forth corrections make the swing jerky (index ${v}, expert ${fmtBand(m)}). Push the lever steadily to a set position and hold it through the swing.` }),
  },
  {
    name: 'bucket_fill_pct', label: 'Bucket fill', unit: '%', p10: 86, p50: 93, p90: 98, better: 'higher', phase: 'dig', competency: 'C09',
    value: (s, r) => 93 - 19 * s + 3 * (r - 0.5),
    tip: (v, m) => ({ title: 'Curl the bucket as the stick comes in', detail: `Your bucket fill averages ${v}% (expert ${fmtBand(m)}). Blend the bucket curl into the end of the stick stroke so the bucket fills in one pass.` }),
  },
  {
    name: 'dump_time_s', label: 'Dump time', unit: 's', p10: 1.9, p50: 2.4, p90: 3.0, better: 'lower', phase: 'dump', competency: 'C09',
    value: (s, r) => 2.4 * (1 + 0.75 * s) + 0.2 * (r - 0.5),
    tip: (v, m) => ({ title: 'Dump in one steady stroke', detail: `Your dump takes ${v} s (expert ${fmtBand(m)}), often in two separate bucket movements. Open the bucket and move the stick out together.` }),
  },
  {
    name: 'lever_reversals_per_cycle', label: 'Lever reversals per cycle', unit: '', p10: 2, p50: 3, p90: 5, better: 'lower', phase: 'dig', competency: 'C09',
    value: (s, r) => 3 + 7 * s + (r - 0.5),
    tip: (v, m) => ({ title: 'Plan the dig to avoid stop-start corrections', detail: `You reverse a lever about ${v} times per cycle (expert ${fmtBand(m)}). Set the bucket angle before you start the stick stroke so fewer corrections are needed.` }),
  },
];

const TRUCK_ONLY: MetricSpec[] = [
  {
    name: 'swing_peak_near_truck_dps', label: 'Peak swing near truck', unit: '°/s', p10: 18, p50: 24, p90: 30, better: 'band', phase: 'swing_loaded', competency: 'C04', safety: true,
    value: (s, r) => 24 + 12 * s + 2 * (r - 0.5),
    tip: (v, m) => ({ title: 'Ease off the swing before the truck', detail: `Your swing peaks at ${v} °/s as the bucket reaches the truck (expert ${fmtBand(m)}). Start slowing about a bucket-width earlier so you arrive with the swing almost stopped. Faster is not better here.` }),
  },
  {
    name: 'side_board_clearance_m', label: 'Clearance over side boards', unit: 'm', p10: 0.4, p50: 0.7, p90: 1.1, better: 'band', phase: 'swing_loaded', competency: 'C04', safety: true,
    value: (s, r) => 0.7 - 0.45 * s + 0.06 * (r - 0.5),
    tip: (v, m) => ({ title: 'Keep the bucket higher over the side boards', detail: `Clearance over the truck side boards averaged ${v} m (expert ${fmtBand(m)}). Finish raising the boom before the bucket reaches the truck.` }),
  },
  {
    name: 'cycle_time_s', label: 'Cycle time', unit: 's', p10: 15.8, p50: 17.5, p90: 19.6, better: 'lower', phase: null, competency: 'C09',
    value: (s, r) => 17.5 * (1 + 0.55 * s) + 0.6 * (r - 0.5),
    tip: (v) => ({ title: 'Speed comes from overlap, not harder lever pushes', detail: `Your cycle is ${v} s (expert about 17.5 s). Most of the gap is in swing-loaded and dump. Overlapping the motions closes it without swinging faster.` }),
  },
];

const TRENCH_ONLY: MetricSpec[] = [
  {
    name: 'grade_error_cm', label: 'Trench grade error', unit: 'cm', p10: -4, p50: 0, p90: 4, better: 'band', phase: 'dig', competency: 'C07', safety: true,
    value: (s, r) => 10 * s + 1.5 * (r - 0.5),
    tip: (v, m) => ({ title: 'Watch the depth as you finish each pass', detail: `You over-dig by about ${v} cm (expert ${fmtBand(m)}). Flatten the bucket and slow the stick for the last half-metre of each pass.` }),
  },
  {
    name: 'swing_peak_dps', label: 'Peak swing to spoil', unit: '°/s', p10: 20, p50: 27, p90: 33, better: 'band', phase: 'swing_loaded', competency: 'C09',
    value: (s, r) => 27 + 10 * s + 2 * (r - 0.5),
    tip: (v, m) => ({ title: 'Swing to the spoil pile at a steady rate', detail: `Peak swing ${v} °/s (expert ${fmtBand(m)}). A steady swing keeps spoil in the bucket and away from the trench edge.` }),
  },
  {
    name: 'cycle_time_s', label: 'Cycle time', unit: 's', p10: 14.6, p50: 16.2, p90: 18.4, better: 'lower', phase: null, competency: 'C09',
    value: (s, r) => 16.2 * (1 + 0.55 * s) + 0.6 * (r - 0.5),
    tip: (v) => ({ title: 'Speed comes from overlap, not harder lever pushes', detail: `Your cycle is ${v} s (expert about 16 s). Overlap boom-up with the swing to close the gap.` }),
  },
];

function specsFor(exercise: string): MetricSpec[] {
  return exercise === 'trench_basic' ? [...TRENCH_ONLY.slice(0, 2), ...COMMON, TRENCH_ONLY[2]] : [...TRUCK_ONLY.slice(0, 2), ...COMMON, TRUCK_ONLY[2]];
}

function distanceOutside(m: MetricSpec, v: number): number {
  const width = m.p90 - m.p10;
  if (m.better === 'higher') return v >= m.p10 ? 0 : (m.p10 - v) / width;
  if (m.better === 'lower') return v <= m.p90 ? 0 : (v - m.p90) / width;
  return v < m.p10 ? (m.p10 - v) / width : v > m.p90 ? (v - m.p90) / width : 0;
}

function statusFor(d: number): MetricStatus {
  return d === 0 ? 'expert_like' : d <= 0.5 ? 'near' : 'needs_work';
}

function percentileVsExpert(m: MetricSpec, v: number): number {
  const pts: Array<[number, number]> = [[m.p10, 0.1], [m.p50, 0.5], [m.p90, 0.9]];
  if (v <= m.p10) return Math.max(0.01, 0.1 - (0.09 * (m.p10 - v)) / (m.p50 - m.p10 || 1));
  if (v >= m.p90) return Math.min(0.99, 0.9 + (0.09 * (v - m.p90)) / (m.p90 - m.p50 || 1));
  const [a, b] = v <= m.p50 ? [pts[0], pts[1]] : [pts[1], pts[2]];
  return a[1] + ((v - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
}

function metric(m: MetricSpec, v: number): CycleMetric {
  const value = +v.toFixed(m.unit === 'm' ? 2 : 1);
  return {
    name: m.name, label: m.label, value, unit: m.unit,
    expert_p10: m.p10, expert_p50: m.p50, expert_p90: m.p90,
    percentile_vs_expert: +percentileVsExpert(m, value).toFixed(2),
    better: m.better, status: statusFor(distanceOutside(m, value)),
  };
}

export function scoreBand(score: number): ScoreBand {
  return score >= 85 ? 'expert_like' : score >= 65 ? 'proficient' : score >= 40 ? 'developing' : 'beginner';
}

const ARCH_S: Record<Archetype, [number, number]> = {
  expert: [0.05, 0.05],
  intermediate: [0.55, 0.5],
  novice: [0.92, 0.88],
  novice_improving: [0.95, 0.5],
};

// ------------------------------------------------------------------ report generator
export interface GenerateOpts {
  sessionId: string;
  traineeId: string;
  exercise: string;
  archetype: Archetype;
  nCycles: number;
  seed: number;
  startTs: number;
  sRange?: [number, number];
}

export function generatePracticeReport(o: GenerateOpts): PracticeReport {
  const r = rng(o.seed);
  const [s0, s1] = o.sRange ?? ARCH_S[o.archetype];
  const specs = specsFor(o.exercise);
  const expertDur = EXPERT_DURATIONS[o.exercise] ?? EXPERT_DURATIONS.truck_loading_basic;
  const cycles: PracticeCycleReport[] = [];
  let t = o.startTs;
  const sPerCycle: number[] = [];
  for (let i = 0; i < o.nCycles; i++) {
    const frac = o.nCycles > 1 ? i / (o.nCycles - 1) : 0;
    const s = Math.max(0, Math.min(1, s0 + (s1 - s0) * frac + 0.06 * (r() - 0.5)));
    sPerCycle.push(s);
    const phases = PRACTICE_PHASES.map((p) => {
      const d = expertDur[p] * (1 + SLOWDOWN[p] * s) * (1 + 0.08 * (r() - 0.5));
      const span = { phase: p, t_start: +t.toFixed(2), t_end: +(t + d).toFixed(2), duration_s: +d.toFixed(2) };
      t += d;
      return span;
    });
    const metrics = specs.map((m) => metric(m, m.value(s, r())));
    const flags: string[] = [];
    const swing = metrics.find((m) => m.name === 'swing_peak_near_truck_dps');
    if (swing && swing.value > 33) flags.push('fast_swing_near_truck');
    const clear = metrics.find((m) => m.name === 'side_board_clearance_m');
    if (clear && clear.value < 0.3) flags.push('low_side_board_clearance');
    cycles.push({
      cycle_index: i,
      t_start: phases[0].t_start,
      t_end: phases[phases.length - 1].t_end,
      phases,
      metrics,
      expert_likeness: +Math.max(3, Math.min(99, 100 - 70 * s - 3 * r())).toFixed(1),
      safety_flags: flags,
    });
  }
  const meanS = sPerCycle.reduce((a, b) => a + b, 0) / sPerCycle.length;
  const summary = specs.map((m) => {
    const vals = cycles.map((c) => c.metrics.find((x) => x.name === m.name)!.value);
    return metric(m, vals.reduce((a, b) => a + b, 0) / vals.length);
  });
  const overall = +(cycles.reduce((a, c) => a + c.expert_likeness, 0) / cycles.length).toFixed(1);

  const ranked = specs
    .map((m, i) => ({ m, cm: summary[i], d: distanceOutside(m, summary[i].value) * (m.safety ? 1.3 : 1) }))
    .filter((x) => x.cm.status !== 'expert_like')
    .sort((a, b) => b.d - a.d)
    .slice(0, 5);
  const traineeCycleS = cycles.reduce((a, c) => a + (c.t_end - c.t_start), 0) / cycles.length;
  const expertCycleS = PRACTICE_PHASES.reduce((a, p) => a + expertDur[p], 0);
  const secondsSaved = (name: string, v: number, m: MetricSpec): number | null => {
    if (name === 'cycle_time_s' || name === 'dump_time_s') return Math.max(0, v - m.p50);
    if (name === 'boom_swing_overlap_pct') return Math.max(0, ((m.p50 - v) / 100) * expertDur.swing_loaded * 1.2);
    if (name === 'lever_reversals_per_cycle') return Math.max(0, (v - m.p50) * 0.35);
    return null; // swing speed near the truck: slowing down is a safety fix, not a time saving
  };
  const tips: CoachingTip[] = ranked.map((x, idx) => {
    const tpl = x.m.tip(String(x.cm.value), x.m);
    const saved = secondsSaved(x.m.name, x.cm.value, x.m);
    return {
      tip_id: `tip_${o.sessionId}_${idx + 1}`,
      phase: x.m.phase,
      metric: x.m.name,
      severity: x.m.safety && x.cm.status === 'needs_work' ? 'priority' : x.cm.status === 'needs_work' ? (idx === 0 ? 'priority' : 'improve') : 'info',
      title: tpl.title,
      detail: tpl.detail,
      competency_id: x.m.competency,
      evidence: {
        value: x.cm.value, unit: x.m.unit, expert_p10: x.m.p10, expert_p50: x.m.p50, expert_p90: x.m.p90,
        cycles_outside_band: cycles.filter((c) => c.metrics.find((q) => q.name === x.m.name)?.status !== 'expert_like').length,
        n_cycles: o.nCycles, module_id: COMPETENCY_MODULE[x.m.competency] ?? null, expert_reference: 'SIMULATED expert operators (mock)',
        ...(saved !== null && saved > 0.05 ? { seconds_saved_per_cycle: +saved.toFixed(2) } : {}),
      },
    };
  });
  if (tips.length === 0) {
    tips.push({ tip_id: `tip_${o.sessionId}_1`, phase: null, metric: 'overall', severity: 'info', title: 'Keep this technique', detail: 'All measured movements are within the SIMULATED expert band. Keep the same smooth, controlled approach to the truck.', competency_id: null, evidence: { module_id: null } });
  }

  // Overlay in the analyser's shape (sentinel/practice/analyser.py::_overlay): phases → channels,
  // 101 points on normalised phase time 0..1, trainee = mean of the trainee's cycles.
  const N = 101;
  const grid = Array.from({ length: N }, (_, i) => i / (N - 1));
  const phases: Record<string, unknown> = {};
  let worst: { phase: string; channel: string; exit_frac: number } | null = null;
  for (const p of PRACTICE_PHASES) {
    const channels: Record<string, unknown> = {};
    for (const ch of [...PRACTICE_CHANNELS, 'swing_dps'] as const) {
      const isRate = ch === 'swing_dps';
      const base = (isRate ? 'joy_swing' : ch) as PracticeChannel;
      const k = isRate ? 42 : 1;
      const bands = grid.map((u) => expertBand(p, base, u));
      const trainee = grid.map((u) => +(k * traineeProfile(p, base, Math.max(0, u - (isRate ? 0.04 : 0)), meanS, o.seed % 7)).toFixed(3));
      const p10 = bands.map((b) => +(k * b.p10).toFixed(3));
      const p90 = bands.map((b) => +(k * b.p90).toFixed(3));
      const exit = trainee.filter((v, i) => v < p10[i] || v > p90[i]).length / N;
      channels[ch] = {
        label: isRate ? 'swing speed' : `${base.replace('joy_', '')} lever`,
        unit: isRate ? 'deg/s' : '-1..1',
        expert_p10: p10,
        expert_p50: bands.map((b) => +(k * b.p50).toFixed(3)),
        expert_p90: p90,
        trainee_mean: trainee,
        exit_frac: +exit.toFixed(3),
      };
      if (!worst || exit > worst.exit_frac) worst = { phase: p, channel: ch, exit_frac: +exit.toFixed(3) };
    }
    const d = expertDur[p];
    phases[p] = { channels, n_trainee_cycles: o.nCycles, n_expert_cycles: 240, expert_duration_s: { p10: +(d * 0.9).toFixed(2), p50: d, p90: +(d * 1.12).toFixed(2) } };
  }
  const overlay: Record<string, unknown> = {
    time_axis: 'normalised phase time 0..1',
    n_points: N,
    expert_reference: 'SIMULATED expert operators (mock fixture)',
    reference_exercise: o.exercise,
    label: 'Expert band = P10-P90 of SIMULATED, safety-filtered expert cycles; trainee = mean of your cycles',
    phases,
    worst,
  };

  // Productivity gap vs expert and the money view (ESTIMATE; assumptions listed).
  const bucketM3 = o.exercise === 'trench_basic' ? 0.9 : 1.1;
  const fill = (summary.find((m) => m.name === 'bucket_fill_pct')?.value ?? 90) / 100;
  const traineeRate = (3600 / traineeCycleS) * bucketM3 * fill;
  const expertRate = (3600 / expertCycleS) * bucketM3 * 0.93;
  const fuelLph = 17;
  const productiveH = 5.2; // productive hours per shift (value model demo shift)
  const closure = 0.25; // practice_gap_closure_frac, value model base case
  const extraM3H = Math.max(0, expertRate - traineeRate) * closure;
  const productivity = {
    trainee_cycle_s: +traineeCycleS.toFixed(1),
    expert_cycle_s: +expertCycleS.toFixed(1),
    bucket_m3: bucketM3,
    trainee_m3_per_h: +traineeRate.toFixed(0),
    expert_m3_per_h: +expertRate.toFixed(0),
    gap_pct: +(100 * (1 - traineeRate / expertRate)).toFixed(1),
    fuel_l_per_m3_trainee: +(fuelLph / traineeRate).toFixed(3),
    fuel_l_per_m3_expert: +(fuelLph / expertRate).toFixed(3),
  };
  // Same shape as sentinel.value.model.practice_value (gains only are shown in the UI).
  const value_estimate = {
    label: 'ESTIMATE — assumptions editable; prototype metrics SIMULATED',
    trainee_m3_per_h: productivity.trainee_m3_per_h,
    expert_m3_per_h: productivity.expert_m3_per_h,
    gains: {
      gap_to_expert_pct: +((100 * Math.max(0, expertRate - traineeRate)) / expertRate).toFixed(2),
      output_uplift_pct: +((100 * extraM3H) / traineeRate).toFixed(2),
      extra_m3_per_shift: +(extraM3H * productiveH).toFixed(2),
      extra_m3_per_year: +(extraM3H * productiveH * 230).toFixed(0),
      productive_hours_freed_per_year: +((extraM3H * productiveH * 230) / expertRate).toFixed(1),
      cycle_s_saved: +(Math.max(0, traineeCycleS - expertCycleS) * closure).toFixed(2),
      fuel_l_saved_per_year: +(traineeRate * 1500 * 0.65 * Math.max(0, fuelLph / traineeRate - fuelLph / expertRate) * closure).toFixed(0),
    },
    assumptions: {
      practice_gap_closure_frac: { value: closure, unit: 'fraction of trainee gap closed', source: 'assumption', tag: 'ASSUMPTION' },
      productive_hours_per_shift: { value: productiveH, unit: 'h / shift', source: 'value model demo shift', tag: 'ASSUMPTION' },
    },
  };

  return {
    session_id: o.sessionId,
    trainee_id: o.traineeId,
    exercise: o.exercise,
    n_cycles: o.nCycles,
    overall_score: overall,
    score_band: scoreBand(overall),
    cycles,
    summary_metrics: summary,
    tips,
    trajectory_overlay: overlay,
    productivity,
    value_estimate,
    model_version: 'expert-motion-0.1.0 (mock)',
    provenance: ['ML', 'SIMULATED'],
  };
}

// ------------------------------------------------------------------ session store
const reports = new Map<string, PracticeReport>();
let sessions: PracticeSession[] = [];

function seedHistory(): void {
  const hist: Array<[number, number, [number, number], string]> = [
    [-14, 1, [0.97, 0.9], 'truck_loading_basic'],
    [-12, 2, [0.92, 0.86], 'truck_loading_basic'],
    [-9, 3, [0.86, 0.78], 'truck_loading_basic'],
    [-7, 4, [0.8, 0.72], 'truck_loading_basic'],
    [-5, 5, [0.74, 0.66], 'truck_loading_basic'],
    [-2, 6, [0.7, 0.6], 'truck_loading_basic'],
    [-1, 7, [0.9, 0.84], 'trench_basic'],
  ];
  sessions = hist.map(([day, n, sr, ex]) => {
    const id = `ps_hist_${n}`;
    const rep = generatePracticeReport({ sessionId: id, traineeId: 'OP-1042', exercise: ex, archetype: 'novice_improving', nCycles: 8, seed: 100 + n, startTs: at(15, 10, 0, day), sRange: sr });
    reports.set(id, rep);
    return { session_id: id, trainee_id: 'OP-1042', exercise: ex, status: 'finished', created_ts: at(15, 10, 0, day), finished_ts: at(15, 14, 0, day), n_cycles: 8, overall_score: rep.overall_score, score_band: rep.score_band, archetype: 'novice_improving', simulated: true };
  });
}
seedHistory();

export function mockPracticeExercises(): PracticeExercise[] {
  return EXERCISES;
}

export function mockPracticeSessions(traineeId?: string): PracticeSession[] {
  return sessions.filter((s) => !traineeId || s.trainee_id === traineeId).sort((a, b) => (a.created_ts ?? 0) - (b.created_ts ?? 0));
}

export function mockPracticeReport(sessionId: string): PracticeReport | undefined {
  return reports.get(sessionId);
}

/** Deterministic fixture for a session id the fixtures have never seen (e.g. analyser not trained yet). */
export function mockPracticeReportFor(sessionId: string): PracticeReport {
  let h = 0;
  for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rep = generatePracticeReport({ sessionId, traineeId: 'OP-1042', exercise: 'truck_loading_basic', archetype: 'novice_improving', nCycles: 8, seed: h % 10000, startTs: Date.now() / 1000 - 300 });
  reports.set(sessionId, rep);
  return rep;
}

let counter = 0;
export function mockPracticeGenerate(archetype: Archetype, nCycles: number, exercise = 'truck_loading_basic', traineeId = 'OP-1042'): PracticeGenerateResponse {
  counter += 1;
  const sessionId = `ps_mock_${Date.now().toString(36)}${counter}`;
  const created = Date.now() / 1000;
  const report = generatePracticeReport({ sessionId, traineeId, exercise, archetype, nCycles, seed: Math.floor(Math.random() * 10000), startTs: created });
  reports.set(sessionId, report);
  sessions.push({ session_id: sessionId, trainee_id: traineeId, exercise, status: 'finished', created_ts: created, finished_ts: created + 180, n_cycles: nCycles, overall_score: report.overall_score, score_band: report.score_band, archetype, simulated: true });
  return { session_id: sessionId, trainee_id: traineeId, archetype, report };
}

export function mockPracticeCreate(traineeId: string, exercise: string): PracticeSession {
  counter += 1;
  const s: PracticeSession = { session_id: `ps_live_${Date.now().toString(36)}${counter}`, trainee_id: traineeId, exercise, status: 'live', created_ts: Date.now() / 1000, simulated: true };
  sessions.push(s);
  return s;
}

export function mockPracticeFinish(sessionId: string): PracticeReport {
  const s = sessions.find((x) => x.session_id === sessionId);
  const report = generatePracticeReport({ sessionId, traineeId: s?.trainee_id ?? 'OP-1042', exercise: s?.exercise ?? 'truck_loading_basic', archetype: 'novice_improving', nCycles: 6, seed: 7, startTs: s?.created_ts ?? Date.now() / 1000 });
  reports.set(sessionId, report);
  sessions = sessions.map((x) => (x.session_id === sessionId ? { ...x, status: 'finished', overall_score: report.overall_score, score_band: report.score_band, n_cycles: 6 } : x));
  return report;
}
