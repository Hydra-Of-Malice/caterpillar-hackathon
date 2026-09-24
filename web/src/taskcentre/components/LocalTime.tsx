/**
 * An operational time, shown in the reader's own zone and labelled with it: "14:32 IST".
 *
 * The exact UTC instant the server stored is carried in the tooltip and in `<time dateTime>`, so the
 * record is always one hover away from the reading. That pairing is the point: local time is what a
 * person can act on, UTC is what two people in different places can agree on, and dropping either
 * one makes the other unsafe.
 *
 * `gmt` is the server's own ISO rendering. It is the fallback when there is no usable numeric
 * timestamp, never the visible text — a table cell that asked for the time should not print the
 * date, the seconds and a Z.
 */
import { ZONE, fmtAge, fmtTime, fmtDateTime, fmtSmart, isTs, utcIso, zoneName, type Ts } from '../time';
import { cx } from '../../components/ui';

export type TimeMode = 'time' | 'datetime' | 'smart';

export function LocalTime({
  ts,
  gmt,
  mode = 'time',
  className,
  prefix,
  missing = '—',
}: {
  ts: Ts;
  /** The server's ISO-8601 UTC string. Used for the tooltip and as a fallback, not as the text. */
  gmt?: string | null;
  mode?: TimeMode;
  className?: string;
  prefix?: string;
  missing?: string;
}) {
  if (!isTs(ts) && !gmt) return <span className={cx('text-on-surface-muted', className)}>{missing}</span>;
  // Format from the timestamp and keep the server's ISO string for the tooltip. Preferring `gmt` for
  // the visible text made `mode` dead code wherever the API sends it (which is nearly everywhere),
  // and printed "2026-09-23T19:05:45Z" in table cells that asked for "19:05".
  const text = isTs(ts)
    ? mode === 'datetime'
      ? fmtDateTime(ts)
      : mode === 'smart'
        ? fmtSmart(ts)
        : fmtTime(ts)
    : (gmt as string);
  const iso = utcIso(ts) || gmt || '';
  return (
    <time dateTime={iso || undefined} title={iso ? `${iso} — the exact time recorded, in UTC` : 'Time supplied by the server in UTC'} className={cx('tnum whitespace-nowrap', className)}>
      {prefix ? `${prefix} ` : ''}
      {text}
    </time>
  );
}

/** "4 min ago", with the exact UTC time in the tooltip. Pair with <StaleBadge> when freshness matters. */
export function TimeAgo({ ts, className, now }: { ts: Ts; className?: string; now?: number }) {
  if (!isTs(ts)) return <span className={cx('text-on-surface-muted', className)}>never</span>;
  return (
    <time dateTime={utcIso(ts)} title={`${utcIso(ts)} — the exact time recorded, in UTC · ${fmtTime(ts)}`} className={cx('tnum whitespace-nowrap', className)}>
      {fmtAge(ts, now)}
    </time>
  );
}

/** The reader's zone, inline, for column headers and field labels: "IST". */
export function ZoneHint({ className }: { className?: string }) {
  return (
    <span
      className={cx('font-display text-label-sm uppercase text-on-surface-muted', className)}
      title={`Times on this screen are shown in your own timezone (${zoneName()}). They are recorded by the server clock in UTC; hover any time to see the exact stored value.`}
    >
      {ZONE}
    </span>
  );
}
