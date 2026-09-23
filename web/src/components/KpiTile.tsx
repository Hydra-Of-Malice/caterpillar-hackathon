import type { ReactNode } from 'react';
import { ProvenanceBadges } from './ProvenanceBadge';
import { Icon, cx } from './ui';

/** KPI tile (Stitch supervisor style): label + icon, big tabular number, sub line, optional bar. */
export function KpiTile({
  label, value, unit, sub, icon, tone = 'neutral', bar, provenance, className, chip,
}: {
  label: string; value: ReactNode; unit?: string; sub?: ReactNode; icon?: string; tone?: 'neutral' | 'red' | 'purple' | 'orange' | 'green' | 'blue' | 'yellow';
  bar?: number; provenance?: string[]; className?: string; chip?: ReactNode;
}) {
  const color = { neutral: 'text-on-surface', red: 'text-danger-text', purple: 'text-escalation-text', orange: 'text-warning-text', green: 'text-success-text', blue: 'text-notice-dark', yellow: 'text-cat-text' }[tone];
  const barColor = { neutral: 'bg-on-surface-muted', red: 'bg-danger', purple: 'bg-escalation', orange: 'bg-warning', green: 'bg-series-green', blue: 'bg-series-blue', yellow: 'bg-cat' }[tone];
  return (
    <div className={cx('flex flex-col justify-between gap-2 border border-outline bg-surface-container p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-label-md uppercase text-on-surface-variant">{label}</span>
        {icon && <Icon name={icon} size={22} className={color} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cx('font-display text-headline-xl leading-none', color)}>{value}</span>
        {unit && <span className="font-display text-headline-sm text-on-surface-muted">{unit}</span>}
        {chip}
      </div>
      {sub && <div className="text-body-sm text-on-surface-variant">{sub}</div>}
      {bar !== undefined && (
        <div className="h-1.5 w-full bg-surface-container-lowest">
          <div className={cx('h-full', barColor)} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
      {provenance && <ProvenanceBadges kinds={provenance} />}
    </div>
  );
}
