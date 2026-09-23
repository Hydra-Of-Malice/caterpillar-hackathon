import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { titleCase } from '../../lib/format';
import type { Reassessment } from '../../lib/types';
import { cx } from '../ui';

export const BEFORE_COLOR = '#0066FF';
export const AFTER_COLOR = '#1AC69E';

export interface ShiftRateRow {
  shift: string;
  events: number;
  opportunities: number;
  rate: number;
  lo: number;
  hi: number;
  phase: 'before' | 'after';
  pct: number;
  err: [number, number];
}

/** Wilson 95% interval for k events out of n (fallback when the API omits per-shift bounds). */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const rateOf = (b: { events: number; opportunities: number; rate?: number } | undefined) =>
  !b ? 0 : Number.isFinite(b.rate) ? (b.rate as number) : b.opportunities ? b.events / b.opportunities : 0;

/** Per-shift rows, tagged before/after training (shifts are "before" until pre.opportunities is used up). */
export function shiftRows(r: Reassessment): ShiftRateRow[] {
  const raw =
    r.per_shift && r.per_shift.length
      ? r.per_shift
      : [
          { shift: 'Before', events: r.pre?.events ?? 0, opportunities: r.pre?.opportunities ?? 0, rate: rateOf(r.pre), lo: NaN, hi: NaN },
          { shift: 'After', events: r.post?.events ?? 0, opportunities: r.post?.opportunities ?? 0, rate: rateOf(r.post), lo: NaN, hi: NaN },
        ];
  const preOpp = r.pre?.opportunities ?? 0;
  let acc = 0;
  return raw.map((s, i) => {
    const phase: 'before' | 'after' = r.per_shift?.length ? (acc < preOpp ? 'before' : 'after') : i === 0 ? 'before' : 'after';
    acc += s.opportunities;
    const rate = Number.isFinite(s.rate) ? s.rate : s.opportunities ? s.events / s.opportunities : 0;
    const [wl, wh] = wilson(s.events, s.opportunities);
    const lo = Number.isFinite(s.lo) ? s.lo : wl;
    const hi = Number.isFinite(s.hi) ? s.hi : wh;
    return {
      ...s,
      rate,
      lo,
      hi,
      phase,
      pct: +(rate * 100).toFixed(2),
      err: [Math.max(0, (rate - lo) * 100), Math.max(0, (hi - rate) * 100)],
    };
  });
}

export function verdictText(verdict: string | undefined, ci?: [number, number]): string {
  const map: Record<string, string> = {
    trending_better_not_conclusive: 'Trending better, not yet conclusive',
    trending_worse_not_conclusive: 'Trending worse, not yet conclusive',
    better: 'Better — interval excludes no change',
    improved: 'Better — interval excludes no change',
    worse: 'Worse — review with an instructor',
    no_change: 'No clear change',
    insufficient_data: 'Not enough data yet',
  };
  if (verdict && map[verdict]) return map[verdict];
  if (verdict) return titleCase(verdict);
  if (ci && ci[0] <= 1 && ci[1] >= 1) return 'Not yet conclusive';
  return 'No verdict yet';
}

const pctTick = (v: number) => `${v}%`;

/** Share of loading cycles with a fast swing near the truck, per shift, with 95% whiskers and a "training completed" line. */
export function ShiftRateChart({ data, height = 300, compact = false }: { data: Reassessment; height?: number; compact?: boolean }) {
  const rows = shiftRows(data);
  const firstAfter = rows.find((r) => r.phase === 'after');
  const maxHi = Math.max(0.05, ...rows.map((r) => r.hi)) * 100;
  const yMax = Math.ceil((maxHi + 2) / 5) * 5;
  const label = `Training completed${data.training_completed ? ` ${data.training_completed}` : ''}`;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: compact ? 18 : 24, right: 16, bottom: compact ? 4 : 20, left: compact ? 0 : 12 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="shift"
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
            label={compact ? undefined : { value: 'Truck-loading shift', position: 'insideBottom', offset: -12, fill: 'var(--chart-tick)', fontSize: 12 }}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
            tickFormatter={pctTick}
            domain={[0, yMax]}
            width={compact ? 40 : 56}
            label={
              compact
                ? undefined
                : { value: 'Cycles with fast swing near truck (%)', angle: -90, position: 'insideLeft', offset: 0, fill: 'var(--chart-tick)', fontSize: 12, style: { textAnchor: 'middle' } }
            }
          />
          <Tooltip
            cursor={{ fill: 'var(--svg-text)', fillOpacity: 0.04 }}
            contentStyle={{ background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as ShiftRateRow;
              return (
                <div className="rounded border border-outline-variant bg-surface-container px-3 py-2 text-body-sm shadow-sm">
                  <div className="font-semibold text-on-surface">
                    {r.shift} · {r.phase === 'before' ? 'before training' : 'after training'}
                  </div>
                  <div className="tnum text-on-surface-variant">
                    {r.events} of {r.opportunities} cycles ({(r.rate * 100).toFixed(1)}%)
                  </div>
                  <div className="tnum text-on-surface-muted">
                    95% interval {(r.lo * 100).toFixed(1)}–{(r.hi * 100).toFixed(1)}%
                  </div>
                </div>
              );
            }}
          />
          {firstAfter && (
            <ReferenceLine
              x={firstAfter.shift}
              position="start"
              stroke="var(--svg-text)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={(p: { viewBox?: { x?: number; y?: number } }) => (
                <text x={(p.viewBox?.x ?? 0) + 6} y={(p.viewBox?.y ?? 0) + (compact ? -6 : -8)} fill="var(--svg-text)" fontSize={12} fontFamily="Roboto Condensed, sans-serif" fontWeight={700}>
                  {label.toUpperCase()}
                </text>
              )}
            />
          )}
          <Bar dataKey="pct" isAnimationActive={false} maxBarSize={compact ? 36 : 72} name="Share of cycles">
            {rows.map((r) => (
              <Cell key={r.shift} fill={r.phase === 'before' ? BEFORE_COLOR : AFTER_COLOR} />
            ))}
            <ErrorBar dataKey="err" width={compact ? 8 : 14} strokeWidth={2} stroke="var(--svg-text)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShiftRateLegend({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm text-on-surface-muted', className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3" style={{ background: BEFORE_COLOR }} /> Before training
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3" style={{ background: AFTER_COLOR }} /> After training
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="relative h-3 w-3">
          <span className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-on-surface" />
          <span className="absolute left-0 right-0 top-0 h-0.5 bg-on-surface" />
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-on-surface" />
        </span>
        95% interval
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0 border-l-2 border-dashed border-on-surface" /> Training completed
      </span>
    </div>
  );
}

/** Rate ratio with its 95% interval on a log axis, crossing a "no change = 1.0" line. */
export function RateRatioBar({ rr, lo, hi, className }: { rr: number; lo: number; hi: number; className?: string }) {
  const safe = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0.01);
  const l = safe(lo);
  const h = safe(hi);
  const r = safe(rr);
  const dMin = Math.min(l, r, 0.1) / 1.6;
  const dMax = Math.max(h, r, 2) * 1.6;
  const pos = (v: number) => ((Math.log(safe(v)) - Math.log(dMin)) / (Math.log(dMax) - Math.log(dMin))) * 100;
  const ticks = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8].filter((t) => t >= dMin && t <= dMax);
  const fmt = (v: number) => (v >= 1 ? v.toFixed(1) : v.toFixed(2));
  return (
    <div className={cx('w-full', className)} role="img" aria-label={`Rate ratio ${fmt(r)}, 95% interval ${fmt(l)} to ${fmt(h)}; 1.0 means no change`}>
      <div className="relative mb-1 h-4 text-footnote font-semibold text-on-surface">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(1)}%` }}>
          No change = 1.0
        </span>
      </div>
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-3 h-2 rounded-full bg-surface-container-high" />
        <div className="absolute top-3 h-2 border-x-2 border-series-blue-light bg-series-blue/50" style={{ left: `${pos(l)}%`, width: `${pos(h) - pos(l)}%` }} title={`95% interval ${fmt(l)}–${fmt(h)}`} />
        <div className="absolute bottom-0 top-0 border-l-2 border-dashed border-on-surface" style={{ left: `${pos(1)}%` }} />
        <div className="absolute top-[7px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-surface bg-on-surface" style={{ left: `${pos(r)}%` }} title={`Rate ratio ${fmt(r)}`} />
      </div>
      <div className="relative mt-1 h-4 text-footnote text-on-surface-muted">
        {ticks.map((t) => (
          <span key={t} className="tnum absolute -translate-x-1/2" style={{ left: `${pos(t)}%` }}>
            {t}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-footnote text-on-surface-muted">
        <span>← Fewer fast swings</span>
        <span>More fast swings →</span>
      </div>
    </div>
  );
}
