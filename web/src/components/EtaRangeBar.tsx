import { fmtClock, fmtDur } from '../lib/format';
import type { TaskEstimate } from '../lib/types';
import { ProvenanceBadges } from './ProvenanceBadge';
import { cx } from './ui';

/**
 * Uncertainty range bar: P10–P90 thin track, P50 bold tick, optional "now" marker and actual dot.
 * Values are minutes from `origin` (or absolute times if `startTs` is given).
 */
export function RangeBar({
  p10, p50, p90, min, max, now, actual, labels = true, format = (v: number) => fmtDur(v), height = 'h-2.5', tone = 'yellow',
}: {
  p10: number; p50: number; p90: number; min?: number; max?: number; now?: number | null; actual?: number | null;
  labels?: boolean; format?: (v: number) => string; height?: string; tone?: 'yellow' | 'blue';
}) {
  const lo = min ?? Math.min(p10, now ?? p10, actual ?? p10) - (p90 - p10) * 0.25;
  const hi = max ?? Math.max(p90, actual ?? p90) + (p90 - p10) * 0.25;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const band = tone === 'yellow' ? 'bg-cat/30 border-cat/60' : 'bg-series-blue/30 border-series-blue/70';
  const tick = tone === 'yellow' ? 'bg-cat' : 'bg-series-blue-light';
  return (
    <div className="w-full">
      <div className={cx('relative w-full bg-surface-container-high', height)}>
        <div className={cx('absolute bottom-0 top-0 border-x', band)} style={{ left: pos(p10), width: `calc(${pos(p90)} - ${pos(p10)})` }} />
        <div className={cx('absolute -bottom-1.5 -top-1.5 w-1', tick)} style={{ left: `calc(${pos(p50)} - 2px)` }} title={`P50 ${format(p50)}`} />
        {now !== undefined && now !== null && (
          <div className="absolute -top-2 flex -translate-x-1/2 flex-col items-center" style={{ left: pos(now) }} title="now">
            <span className="h-3 w-3 rounded-full border-2 border-surface bg-series-blue-light" />
          </div>
        )}
        {actual !== undefined && actual !== null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-on-surface" style={{ left: pos(actual) }} title={`Actual ${format(actual)}`} />}
      </div>
      {labels && (
        <div className="relative mt-2 h-4 text-body-sm text-on-surface-muted">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(p10) }}>P10 · {format(p10)}</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap text-cat-text" style={{ left: pos(p50) }}>P50 · {format(p50)}</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(p90) }}>P90 · {format(p90)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Task estimate block: "Est. finish 10:05 (likely 09:35–10:50)" + range bar with a now marker.
 * Uses remaining_* when present (in-progress task), else full-duration quantiles.
 */
export function EtaRangeBar({ estimate, nowTs, compact = false, showWhy, className }: { estimate: TaskEstimate; nowTs: number; compact?: boolean; showWhy?: () => void; className?: string }) {
  const r10 = estimate.remaining_p10_min ?? estimate.p10_min;
  const r50 = estimate.remaining_p50_min ?? estimate.p50_min;
  const r90 = estimate.remaining_p90_min ?? estimate.p90_min;
  const t10 = nowTs + r10 * 60;
  const t50 = nowTs + r50 * 60;
  const t90 = nowTs + r90 * 60;
  const spread = t90 - t10;
  return (
    <div className={cx('w-full', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-lg text-on-surface">
          Finish {fmtClock(t50)} <span className="text-on-surface-muted">· likely {fmtClock(t10)}–{fmtClock(t90)}</span>
        </span>
        <span className="flex items-center gap-2">
          {estimate.low_data && <span className="text-body-sm text-warning-text">Low data · wider range</span>}
          {showWhy && (
            <button type="button" onClick={showWhy} className="font-display text-label-md uppercase text-notice-dark hover:underline">
              Why?
            </button>
          )}
          <ProvenanceBadges kinds={estimate.provenance} />
        </span>
      </div>
      <RangeBar p10={t10} p50={t50} p90={t90} now={nowTs} min={nowTs - spread * 0.15} max={t90 + spread * 0.2} format={(v) => fmtClock(v)} labels={!compact} />
    </div>
  );
}

/** Horizontal driver bars: "rain from 13:00 +8 m". */
export function EtaDrivers({ drivers }: { drivers: TaskEstimate['drivers'] }) {
  const max = Math.max(1, ...drivers.map((d) => Math.abs(d.delta_min)));
  return (
    <ul className="space-y-2">
      {drivers.map((d) => (
        <li key={d.factor} className="grid grid-cols-[1fr_180px_56px] items-center gap-3">
          <span className="truncate text-body-sm text-on-surface-variant">{d.label ?? d.factor}</span>
          <span className="relative h-3 bg-surface-container-lowest">
            <span className="absolute bottom-0 top-0 w-px bg-outline-strong" style={{ left: '50%' }} />
            <span className={cx('absolute bottom-0 top-0', d.delta_min >= 0 ? 'bg-series-orange' : 'bg-series-green')} style={d.delta_min >= 0 ? { left: '50%', width: `${(d.delta_min / max) * 50}%` } : { right: '50%', width: `${(-d.delta_min / max) * 50}%` }} />
          </span>
          <span className={cx('text-right font-display text-label-md', d.delta_min > 0 ? 'text-warning-text' : d.delta_min < 0 ? 'text-prov-ml' : 'text-on-surface-muted')}>
            {d.delta_min > 0 ? '+' : d.delta_min < 0 ? '−' : '±'}
            {Math.abs(d.delta_min)} m
          </span>
        </li>
      ))}
    </ul>
  );
}
