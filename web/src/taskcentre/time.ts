/**
 * Time formatting for the Task Centre.
 *
 * **Stored in UTC, shown in the reader's own clock.** The server records and compares every
 * operational time as UTC seconds — that is the record, and it is what two people in different
 * places can agree on. But a supervisor in Chennai reading "14:32 GMT" has to do the arithmetic
 * before they know whether that is before or after lunch, and arithmetic under pressure is how
 * people misread a shift. So the UI renders the browser's local time and labels it with the local
 * zone, while the exact UTC instant stays one hover away in every `<time>` tooltip.
 *
 * The zone suffix is never dropped. It is the same three characters "GMT" used to occupy, and
 * without it a screenshot of this screen means nothing to whoever it is sent to.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A timestamp value as the API sends it: UTC seconds, or nothing. */
export type Ts = number | null | undefined;

/** The short zone name as one locale renders it, or "" when that locale has no answer. */
function shortZoneIn(locale: string | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** The viewer's timezone, short: "IST", "CEST", "GMT+5:30" where no abbreviation exists. */
function readZone(): string {
  // Ask a few English locales and take the first that answers with a real abbreviation. Whether a
  // zone has one depends on the locale's data, not on the zone: `en-US` renders Asia/Kolkata as
  // "GMT+5:30" while `en-IN` renders the same zone as "IST". An abbreviation is what a reader
  // recognises; the offset form is the honest fallback where none exists, and it is still better
  // than nothing because the tooltip always carries the exact UTC instant.
  const candidates = [undefined, 'en-IN', 'en-GB', 'en-US'];
  let offsetForm = '';
  for (const locale of candidates) {
    const z = shortZoneIn(locale);
    if (/^[A-Za-z]{2,5}$/.test(z)) return z;
    if (z && !offsetForm) offsetForm = z;
  }
  return offsetForm || 'local';
}

export const ZONE = readZone();

/** The full IANA name ("Asia/Kolkata") for the one place a screen explains itself. */
export function zoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ZONE;
  } catch {
    return ZONE;
  }
}

export function isTs(ts: Ts): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0;
}

/** Current time as UTC seconds (browser clock — display only, never sent as a stored value). */
export function nowTs(): number {
  return Date.now() / 1000;
}

/** "14:32 IST" (add seconds with `withSeconds`). 24-hour, so a dense table never needs am/pm. */
export function fmtTime(ts: Ts, withSeconds = false): string {
  if (!isTs(ts)) return '—';
  const d = new Date(ts * 1000);
  const s = withSeconds ? `:${pad(d.getSeconds())}` : '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${s} ${ZONE}`;
}

/** "24 Sep", in the reader's own zone. */
export function fmtDate(ts: Ts): string {
  if (!isTs(ts)) return '—';
  const d = new Date(ts * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "24 Sep 14:32 IST" */
export function fmtDateTime(ts: Ts): string {
  if (!isTs(ts)) return '—';
  return `${fmtDate(ts)} ${fmtTime(ts)}`;
}

/**
 * Full ISO-8601 **UTC** string, for `title` tooltips and `<time dateTime>`.
 *
 * This is the stored value, unchanged by what zone the reader is in. It is what to quote in a
 * dispute, and what makes a local-time display safe to show at all.
 */
export function utcIso(ts: Ts): string {
  if (!isTs(ts)) return '';
  return new Date(ts * 1000).toISOString().replace('.000', '');
}

/**
 * Same calendar day as `ref` **in the reader's zone**.
 *
 * Deliberately local, not UTC: "today" on this screen has to mean the day the reader is having. In
 * IST the UTC day rolls over at 05:30, so a UTC comparison would call 01:00 IST "yesterday" to
 * somebody who is plainly still in the middle of tonight.
 */
export function isSameDay(ts: Ts, ref: number = nowTs()): boolean {
  if (!isTs(ts)) return false;
  const a = new Date(ts * 1000);
  const b = new Date(ref * 1000);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "14:32 IST" today, "24 Sep 14:32 IST" otherwise. */
export function fmtSmart(ts: Ts, ref: number = nowTs()): string {
  if (!isTs(ts)) return '—';
  return isSameDay(ts, ref) ? fmtTime(ts) : fmtDateTime(ts);
}

/** Age in whole seconds, or null when there is no timestamp. */
export function ageS(ts: Ts, ref: number = nowTs()): number | null {
  if (!isTs(ts)) return null;
  return Math.max(0, Math.round(ref - ts));
}

/** "just now" · "4 min ago" · "2 h ago" · "3 d ago". Zone-independent by construction. */
export function fmtAge(ts: Ts, ref: number = nowTs()): string {
  const s = ageS(ts, ref);
  if (s === null) return 'never';
  if (s < 15) return 'just now';
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Signed distance to a deadline: "in 25 min" / "12 min late". */
export function fmtDelta(ts: Ts, ref: number = nowTs()): string {
  if (!isTs(ts)) return '—';
  const d = Math.round(ts - ref);
  const mag = Math.abs(d);
  const unit = mag < 5400 ? `${Math.max(1, Math.round(mag / 60))} min` : `${Math.round(mag / 3600)} h`;
  return d >= 0 ? `in ${unit}` : `${unit} late`;
}

/** Metres as "120 m" / "1.4 km"; null-safe. */
export function fmtMetres(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Format a timestamp for display, in the reader's zone.
 *
 * The API's `*_gmt` companion field is **not** used for the visible text: it is a full UTC ISO
 * string, which is the right thing to store and the wrong thing to read. It is the fallback when
 * there is no usable numeric timestamp, and it is what the tooltip shows.
 */
export function useLocalTime(ts: Ts, gmt?: string | null, opts?: { smart?: boolean; withDate?: boolean }): string {
  if (!isTs(ts)) return gmt || '—';
  if (opts?.withDate) return fmtDateTime(ts);
  if (opts?.smart) return fmtSmart(ts);
  return fmtTime(ts);
}
