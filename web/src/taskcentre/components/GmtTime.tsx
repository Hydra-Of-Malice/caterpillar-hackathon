/**
 * Operational times, always in GMT. Renders "14:32 GMT" (or with the date) and carries the full
 * ISO-8601 UTC string in the tooltip and in `<time dateTime>` so the exact value is one hover away.
 *
 * `gmt` is the server's own rendering. It is the tooltip's value and the fallback when there is no
 * usable timestamp, but it is not the visible text: the server sends a full ISO string, and a table
 * cell that asked for the time should not print the date, the seconds and a Z.
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
  // Format from the timestamp and keep the server's ISO string for the tooltip. Preferring `gmt` for
  // the visible text made `mode` dead code wherever the API sends it (which is nearly everywhere),
  // and printed "2026-09-23T19:05:45Z" in table cells that asked for "19:05 GMT".
  const text = isTs(ts)
    ? mode === 'datetime'
      ? fmtGmtDateTime(ts)
      : mode === 'smart'
        ? fmtGmtSmart(ts)
        : fmtGmt(ts)
    : (gmt as string);
  const iso = gmtIso(ts) || gmt || '';
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
