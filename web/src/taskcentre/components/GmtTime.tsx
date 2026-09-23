/**
 * Operational times, always in GMT. Renders "14:32 GMT" (or with the date) and carries the full
 * ISO-8601 UTC string in the tooltip and in `<time dateTime>` so the exact value is one hover away.
 */
import { fmtAge, fmtGmt, fmtGmtDateTime, fmtGmtSmart, gmtIso, isTs, type Ts } from '../time';
import { cx } from '../../components/ui';

export type GmtMode = 'time' | 'datetime' | 'smart';

export function GmtTime({
  ts,
  gmt,
  mode = 'time',
  className,
  prefix,
  missing = '—',
}: {
  ts: Ts;
  /** Server-rendered GMT string, preferred when present. */
  gmt?: string | null;
  mode?: GmtMode;
  className?: string;
  prefix?: string;
  missing?: string;
}) {
  if (!isTs(ts) && !gmt) return <span className={cx('text-on-surface-muted', className)}>{missing}</span>;
  const text = gmt ?? (mode === 'datetime' ? fmtGmtDateTime(ts) : mode === 'smart' ? fmtGmtSmart(ts) : fmtGmt(ts));
  const iso = gmtIso(ts);
  return (
    <time dateTime={iso || undefined} title={iso ? `${iso} (UTC)` : 'Time supplied by the server in GMT'} className={cx('tnum whitespace-nowrap', className)}>
      {prefix ? `${prefix} ` : ''}
      {text}
    </time>
  );
}

/** "4 min ago" with the GMT time in the tooltip. Pair with <StaleBadge> when freshness matters. */
export function GmtAgo({ ts, className, now }: { ts: Ts; className?: string; now?: number }) {
  if (!isTs(ts)) return <span className={cx('text-on-surface-muted', className)}>never</span>;
  return (
    <time dateTime={gmtIso(ts)} title={`${gmtIso(ts)} (UTC) · ${fmtGmt(ts)}`} className={cx('tnum whitespace-nowrap', className)}>
      {fmtAge(ts, now)}
    </time>
  );
}

/** Small inline "GMT" hint for column headers and field labels. */
export function GmtHint({ className }: { className?: string }) {
  return (
    <span className={cx('font-display text-label-sm uppercase text-on-surface-muted', className)} title="All operational times are shown in GMT (UTC), as recorded by the server clock.">
      GMT
    </span>
  );
}
