/**
 * GMT (UTC) formatting for the Task Centre. Operational times are stored and compared as UTC
 * seconds server-side; the UI always renders and labels them GMT so a reader never has to guess
 * which clock a time came from. Nothing here reads the browser's timezone.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A timestamp value as the API sends it: UTC seconds, or nothing. */
export type Ts = number | null | undefined;

export function isTs(ts: Ts): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0;
}

/** Current time as UTC seconds (browser clock — display only, never sent as a stored value). */
export function nowTs(): number {
  return Date.now() / 1000;
}

/** "14:32 GMT" (add seconds with `withSeconds`). */
export function fmtGmt(ts: Ts, withSeconds = false): string {
  if (!isTs(ts)) return '—';
  const d = new Date(ts * 1000);
  const s = withSeconds ? `:${pad(d.getUTCSeconds())}` : '';
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${s} GMT`;
}

/** "24 Sep" */
export function fmtGmtDate(ts: Ts): string {
  if (!isTs(ts)) return '—';
  const d = new Date(ts * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "24 Sep 14:32 GMT" */
export function fmtGmtDateTime(ts: Ts): string {
  if (!isTs(ts)) return '—';
  return `${fmtGmtDate(ts)} ${fmtGmt(ts)}`;
}

/** Full ISO-8601 UTC string, used for `title` tooltips and `<time dateTime>`. */
export function gmtIso(ts: Ts): string {
  if (!isTs(ts)) return '';
  return new Date(ts * 1000).toISOString().replace('.000', '');
}

/** Same calendar day in UTC as `ref` (default: now). */
export function isSameGmtDay(ts: Ts, ref: number = nowTs()): boolean {
  if (!isTs(ts)) return false;
  const a = new Date(ts * 1000);
  const b = new Date(ref * 1000);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

/** "14:32 GMT" today, "24 Sep 14:32 GMT" otherwise. */
export function fmtGmtSmart(ts: Ts, ref: number = nowTs()): string {
  if (!isTs(ts)) return '—';
  return isSameGmtDay(ts, ref) ? fmtGmt(ts) : fmtGmtDateTime(ts);
}

/** Age in whole seconds, or null when there is no timestamp. */
export function ageS(ts: Ts, ref: number = nowTs()): number | null {
  if (!isTs(ts)) return null;
  return Math.max(0, Math.round(ref - ts));
}

/** "just now" · "4 min ago" · "2 h ago" · "3 d ago". */
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
 * Prefer the server's pre-rendered GMT string when the API sends one, otherwise format the
 * numeric UTC timestamp. Use this everywhere a `*_gmt` companion field exists.
 */
export function useGmt(ts: Ts, gmt?: string | null, opts?: { smart?: boolean; withDate?: boolean }): string {
  if (gmt) return gmt;
  if (opts?.withDate) return fmtGmtDateTime(ts);
  if (opts?.smart) return fmtGmtSmart(ts);
  return fmtGmt(ts);
}
