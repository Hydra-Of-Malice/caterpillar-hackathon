import type { FeatureContribution } from '../lib/types';
import { cx } from './ui';

/**
 * "Why?" explanation: each feature's value (dot/line) against the operator's own normal band
 * (baseline mean ± 1.5 std, shaded). Compared with the same-task baseline, never with other operators.
 */
export function ExplanationBars({ items, compact = false, bandLabel = 'your usual band' }: { items: FeatureContribution[]; compact?: boolean; bandLabel?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cx(compact ? 'space-y-2' : 'space-y-3')}>
      {items.map((f) => {
        const lo = f.baseline_mean - 1.5 * f.baseline_std;
        const hi = f.baseline_mean + 1.5 * f.baseline_std;
        const min = Math.min(lo, f.value) - f.baseline_std;
        const max = Math.max(hi, f.value) + f.baseline_std;
        const pos = (v: number) => ((v - min) / (max - min || 1)) * 100;
        const outside = f.value < lo || f.value > hi;
        return (
          <li key={f.feature}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className={cx('font-display uppercase', compact ? 'text-label-sm' : 'text-label-md')}>{f.label}</span>
              <span className={cx('font-display tnum', compact ? 'text-label-sm' : 'text-label-md', outside ? 'text-warning-text' : 'text-on-surface-variant')}>
                {fmt(f.value)} {f.unit} <span className="text-on-surface-muted">vs {fmt(lo)}–{fmt(hi)}</span>
              </span>
            </div>
            <div className={cx('relative bg-surface-container-high', compact ? 'h-3' : 'h-4')}>
              <div className="absolute bottom-0 top-0 bg-on-surface/15" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} title={bandLabel} />
              <div className={cx('absolute -bottom-1 -top-1 w-1', outside ? 'bg-warning' : 'bg-prov-ml')} style={{ left: `calc(${pos(f.value)}% - 2px)` }} />
            </div>
          </li>
        );
      })}
      {!compact && <li className="font-display text-label-sm uppercase text-on-surface-muted">Shaded = {bandLabel} for this task</li>}
    </ul>
  );
}

function fmt(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
}
