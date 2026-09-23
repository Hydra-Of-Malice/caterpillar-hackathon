/**
 * GET /practice/cohort-sim (sentinel.practice cohort simulation) → CohortSim.
 * The service returns per-session mean/p05/p95 and the cumulative % proficient by session; the
 * per-trainee "sessions to proficient" list for the histogram is rebuilt from that cumulative curve.
 */
import type { CohortArm, CohortSim } from './types';

type J = Record<string, unknown>;
const o = (x: unknown): J => (x && typeof x === 'object' && !Array.isArray(x) ? (x as J) : {});
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.map(Number) : []);
const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

function arm(raw: unknown, label: string): CohortArm {
  const r = o(raw);
  const sessions = nums(r.sessions);
  const score = o(r.score);
  const mean = nums(score.mean);
  const p05 = nums(score.p05);
  const p95 = nums(score.p95);
  const n = num(r.n_trainees) ?? 20;
  const pct = nums(r.pct_proficient_by_session);
  const toProf: Array<number | null> = [];
  let prev = 0;
  pct.forEach((p, i) => {
    const k = Math.round(((p - prev) / 100) * n);
    for (let j = 0; j < k; j++) toProf.push(sessions[i] ?? i + 1);
    prev = Math.max(prev, p);
  });
  while (toProf.length < n) toProf.push(null);
  const stp = o(r.sessions_to_proficient);
  const m3 = o(r.m3_per_h);
  const fast = o(r.fast_swing_near_truck_rate);
  const last = (xs: number[]) => xs[xs.length - 1];
  return {
    label,
    curve: sessions.map((s, i) => ({ session: s, p05: p05[i], p50: mean[i], p95: p95[i], mean: mean[i] })),
    sessions_to_proficient: toProf,
    median_sessions_to_proficient: (num(stp.reached_pct) ?? 0) >= 50 ? num(stp.median) ?? null : null,
    share_proficient_by_session_8: pct.length >= 8 ? pct[7] / 100 : undefined,
    output_m3_per_h_first: nums(m3.mean)[0],
    output_m3_per_h_last: last(nums(m3.mean)),
    fast_swing_share_first: nums(fast.mean)[0],
    fast_swing_share_last: last(nums(fast.mean)),
  };
}

export function normCohort(raw: unknown): CohortSim {
  const r = o(raw);
  if (r.arms) return r as unknown as CohortSim;
  if (!r.coached || !r.control) throw new Error('unexpected cohort-sim shape');
  const coached = arm(r.coached, 'Coached — Expert Motion Model tips');
  const a = o(r.assumptions);
  return {
    n: num(o(r.coached).n_trainees) ?? coached.sessions_to_proficient.length,
    sessions: coached.curve.length,
    effect: num(a.lr_multiplier) ?? 1.4,
    bands: { proficient: 65, expert_like: 85 },
    arms: { coached, control: arm(r.control, 'Control — practice without feedback') },
    label: 'SIMULATED',
    caveat: `SIMULATED cohort — learning effect is an assumption to be validated in a pilot. ${typeof o(r.gains).summary === 'string' ? o(r.gains).summary : ''}`.trim(),
    model_version: typeof r.scorer === 'string' ? r.scorer : undefined,
  };
}
