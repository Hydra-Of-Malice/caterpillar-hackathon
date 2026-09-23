/** Display formatting. Times are unix seconds, rendered in the browser's local timezone. */

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtClock(ts: number | null | undefined, withSeconds = false): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts)) return '--:--';
  const d = new Date(ts * 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${withSeconds ? ':' + pad(d.getSeconds()) : ''}`;
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '';
  return `${fmtDate(ts)} ${fmtClock(ts)}`;
}

/** 112 → "1 h 52 m", 40 → "40 m". */
export function fmtDur(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} m`;
  return r === 0 ? `${h} h` : `${h} h ${pad(r)} m`;
}

/** Seconds → "09:12". */
export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function fmtAgo(ts: number | null | undefined, now: number): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round(now - ts));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const TYPE_LABEL: Record<string, string> = {
  seatbelt_unfastened_moving: 'Seatbelt',
  person_in_danger_zone: 'Proximity',
  fast_swing_near_truck: 'Speed near truck',
  excessive_idle: 'Idle',
  near_miss: 'Near-miss',
  machine_fault: 'Machine fault',
  hydraulic_pressure_spikes: 'Machine fault',
  checklist_defect: 'Checklist defect',
  person_too_close: 'Person too close',
  ground_slope: 'Ground/slope issue',
  damage: 'Damage',
  other: 'Other',
  unusual_cycle_rhythm: 'Unusual cycle rhythm',
  jerky_multi_function: 'Jerky multi-function control',
  bucket_over_cab_path: 'Bucket path near cab',
};

export function typeLabel(t: string): string {
  return TYPE_LABEL[t] ?? titleCase(t);
}

export const PHASE_LABEL: Record<string, string> = {
  dig: 'DIG',
  swing_loaded: 'SWING LOADED',
  dump: 'DUMP',
  swing_empty: 'SWING EMPTY',
  idle: 'IDLE',
  travel: 'TRAVEL',
};

export const CHANNEL_LABEL: Record<string, string> = {
  joy_swing: 'Swing',
  joy_boom: 'Boom',
  joy_stick: 'Stick',
  joy_bucket: 'Bucket',
};
