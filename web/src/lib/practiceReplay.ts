/**
 * Playback for the Practice Session Live screen when the analyser's WS replay is not available:
 * walks the analysed session cycle by cycle (trainee phase durations from report.cycles) and reads
 * the trainee curve and expert P10–P90 envelope from report.trajectory_overlay.
 * For fixture reports (model not trained yet) the per-cycle trainee curve comes from the fixture
 * generator so cycles differ; for real reports it is the analyser's mean trainee curve per phase.
 */
import { traineeProfile, type PracticeChannel } from '../mocks/practice';
import { parseOverlay } from './practiceView';
import type { PracticeReport } from './types';

export const LIVE_CHANNELS: PracticeChannel[] = ['joy_swing', 'joy_boom', 'joy_stick', 'joy_bucket'];
const Z_P90 = 1.2816; // P10–P90 = ±1.28 σ

export interface LivePoint {
  t: number;
  phase: string;
  cycle: number;
  tau: number;
  values: Record<string, number>;
  band: Record<string, [number, number]>;
  deviation: Record<string, number>;
}

export function buildReplay(report: PracticeReport, hz = 10): LivePoint[] {
  const ov = parseOverlay(report);
  const fixture = report.model_version.includes('mock');
  const out: LivePoint[] = [];
  let t = 0;
  for (const c of report.cycles) {
    const s = Math.max(0, Math.min(1, (100 - c.expert_likeness) / 70));
    for (const span of c.phases) {
      const ph = ov.phases.find((p) => p.phase === span.phase);
      if (!ph) {
        t += span.duration_s;
        continue;
      }
      const steps = Math.max(2, Math.round(span.duration_s * hz));
      for (let i = 0; i < steps; i++) {
        const u = i / (steps - 1);
        const values: Record<string, number> = {};
        const band: Record<string, [number, number]> = {};
        const deviation: Record<string, number> = {};
        for (const key of LIVE_CHANNELS) {
          const ch = ph.channels.find((x) => x.key === key);
          if (!ch) continue;
          const idx = Math.round(u * (ch.p50.length - 1));
          const v = fixture ? traineeProfile(span.phase, key, u, s, c.cycle_index) : ch.trainee[idx];
          const lo = ch.p10[idx];
          const hi = ch.p90[idx];
          values[key] = v;
          band[key] = [lo, hi];
          const sigma = Math.max(0.05, (hi - lo) / (2 * Z_P90));
          deviation[key] = (v - ch.p50[idx]) / sigma;
        }
        out.push({ t: +(t + u * span.duration_s).toFixed(2), phase: span.phase, cycle: c.cycle_index, tau: u, values, band, deviation });
      }
      t += span.duration_s;
    }
  }
  return out;
}

/** One-line live hint: the ranked tip for the current phase when the trainee drifts outside the band. */
export function hintFor(report: PracticeReport, phase: string, deviation: Record<string, number>): string | null {
  const worst = Object.values(deviation).reduce((a, z) => Math.max(a, Math.abs(z)), 0);
  if (worst < Z_P90) return null;
  const tip = report.tips.find((x) => x.phase === phase) ?? null;
  return tip?.title ?? null;
}

export const Z_BAND = Z_P90;
