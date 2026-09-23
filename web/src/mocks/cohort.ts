/**
 * Cohort simulation fixture (cloud GET /practice/cohort-sim): coached (ML coaching from the Expert
 * Motion Model) vs control (practice without feedback). SIMULATED — the learning effect is an
 * assumption to be validated in a pilot.
 */
import type { CohortArm, CohortSim } from '../lib/types';

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

function gauss(r: () => number): number {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const PROFICIENT = 65;
const EXPERT = 85;

function simulateArm(n: number, sessions: number, rate: number, seed: number): { scores: number[][]; fast: number[][]; output: number[][] } {
  const r = rng(seed);
  const scores: number[][] = [];
  const fast: number[][] = [];
  const output: number[][] = [];
  for (let i = 0; i < n; i++) {
    const start = 28 + 6 * gauss(r);
    const ceiling = 90 + 3 * gauss(r);
    const k = rate * (0.8 + 0.4 * r());
    const s: number[] = [];
    const f: number[] = [];
    const o: number[] = [];
    for (let j = 1; j <= sessions; j++) {
      const v = ceiling - (ceiling - start) * Math.exp(-k * (j - 1)) + 3.5 * gauss(r);
      const score = Math.max(5, Math.min(99, v));
      s.push(score);
      f.push(Math.max(0, 0.3 * Math.pow(Math.max(0, 1 - score / 92), 1.5) + 0.004 * gauss(r))); // share of cycles with fast swing near truck
      o.push(40 + 2.0 * score + 4 * gauss(r)); // m³/h (expert ≈ 210)
    }
    scores.push(s);
    fast.push(f);
    output.push(o);
  }
  return { scores, fast, output };
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};

function arm(label: string, sim: ReturnType<typeof simulateArm>, sessions: number): CohortArm {
  const curve = Array.from({ length: sessions }, (_, j) => {
    const col = sim.scores.map((s) => s[j]);
    return { session: j + 1, p05: +q(col, 0.05).toFixed(1), p50: +q(col, 0.5).toFixed(1), p95: +q(col, 0.95).toFixed(1), mean: +(col.reduce((a, b) => a + b, 0) / col.length).toFixed(1) };
  });
  const toProf = sim.scores.map((s) => {
    const idx = s.findIndex((v, j) => v >= PROFICIENT && (s[j + 1] ?? v) >= PROFICIENT - 3);
    return idx >= 0 ? idx + 1 : null;
  });
  const reached = toProf.filter((x): x is number => x !== null);
  const last = sessions - 1;
  return {
    label,
    curve,
    sessions_to_proficient: toProf,
    median_sessions_to_proficient: reached.length ? q(reached, 0.5) : null,
    share_proficient_by_session_8: toProf.filter((x) => x !== null && x <= 8).length / toProf.length,
    output_m3_per_h_first: +(sim.output.reduce((a, o) => a + o[0], 0) / sim.output.length).toFixed(0),
    output_m3_per_h_last: +(sim.output.reduce((a, o) => a + o[last], 0) / sim.output.length).toFixed(0),
    fast_swing_share_first: +(sim.fast.reduce((a, f) => a + f[0], 0) / sim.fast.length).toFixed(3),
    fast_swing_share_last: +(sim.fast.reduce((a, f) => a + f[last], 0) / sim.fast.length).toFixed(3),
  };
}

export function mockCohortSim(n = 20, sessions = 12, effect = 1.4): CohortSim {
  const control = arm('Control — practice without feedback', simulateArm(n, sessions, 0.114, 11), sessions);
  const coached = arm('Coached — Expert Motion Model tips', simulateArm(n, sessions, 0.114 * effect, 29), sessions);
  return {
    n,
    sessions,
    effect,
    bands: { proficient: PROFICIENT, expert_like: EXPERT },
    arms: { coached, control },
    label: 'SIMULATED',
    caveat: 'SIMULATED cohort — learning effect is an assumption to be validated in a pilot',
    model_version: 'cohort-sim-0.1 (fixture)',
  };
}
