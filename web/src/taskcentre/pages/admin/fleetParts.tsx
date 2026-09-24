/**
 * Small shared pieces for the fleet screens: how a machine state, a service status and a work order
 * are named and coloured, and how hours and percentages are printed. Colour never carries meaning on
 * its own: every chip has an icon and a word, and every chart has a legend and a table view.
 */
import { Chip, Icon, cx } from '../../../components/ui';
import { SERIES } from '../../../components/ops/chartTheme';
import type { MachineState, MaintenanceKind, MaintenanceStatus, ServiceStatus } from '../../types';

/** State colours reuse the ops chart series, so a state looks the same on every chart in the app. */
export const STATE_META: Record<MachineState, { label: string; icon: string; tone: 'green' | 'neutral' | 'red' | 'blue' | 'orange'; color: string; hint: string }> = {
  operating: { label: 'Operating', icon: 'play_circle', tone: 'green', color: SERIES.green, hint: 'Working: engine on and doing productive work.' },
  idle: { label: 'Idle', icon: 'pause_circle', tone: 'neutral', color: SERIES.grey, hint: 'Engine on, not working (waiting for a truck, repositioning, a break).' },
  down: { label: 'Down', icon: 'build_circle', tone: 'orange', color: SERIES.orange, hint: 'Unplanned downtime: broken down or waiting for repair.' },
  maintenance: { label: 'Maintenance', icon: 'handyman', tone: 'blue', color: SERIES.blue, hint: 'Planned downtime: service or inspection.' },
  available: { label: 'Available', icon: 'local_parking', tone: 'neutral', color: SERIES.grey, hint: 'In service but not working right now (off shift or parked). Counts toward neither uptime nor downtime.' },
  no_data: { label: 'No data', icon: 'help', tone: 'neutral', color: SERIES.grey, hint: 'No state has ever been recorded for this machine.' },
};

/** The four states that make up scheduled time, in stacking order (bottom to top). */
export const TIME_STATES = ['operating', 'idle', 'maintenance', 'down'] as const;

export function StateChip({ state, className }: { state: MachineState | string; className?: string }) {
  const m = STATE_META[state as MachineState] ?? STATE_META.no_data;
  return (
    <Chip tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Chip>
  );
}

export const SERVICE_META: Record<ServiceStatus, { label: string; icon: string; tone: 'red' | 'orange' | 'green' | 'neutral' }> = {
  overdue: { label: 'Service overdue', icon: 'warning', tone: 'red' },
  due_soon: { label: 'Service due soon', icon: 'schedule', tone: 'orange' },
  ok: { label: 'Service OK', icon: 'check_circle', tone: 'green' },
  unknown: { label: 'Service unknown', icon: 'help', tone: 'neutral' },
};

export function ServiceChip({ status, className }: { status: ServiceStatus; className?: string }) {
  const m = SERVICE_META[status] ?? SERVICE_META.unknown;
  return (
    <Chip tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Chip>
  );
}

export const KIND_META: Record<MaintenanceKind, { label: string; icon: string }> = {
  service: { label: 'Service', icon: 'oil_barrel' },
  inspection: { label: 'Inspection', icon: 'fact_check' },
  repair: { label: 'Repair', icon: 'build' },
};

export const STATUS_META: Record<MaintenanceStatus, { label: string; tone: 'blue' | 'orange' | 'green' | 'neutral' }> = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function WorkOrderStatusChip({ status }: { status: MaintenanceStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.scheduled;
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

export function KindLabel({ kind, className }: { kind: MaintenanceKind; className?: string }) {
  const m = KIND_META[kind] ?? KIND_META.service;
  return (
    <span className={cx('inline-flex items-center gap-1 text-body-sm text-on-surface-variant', className)}>
      <Icon name={m.icon} size={16} />
      {m.label}
    </span>
  );
}

/** "12.4 h" / "35 min"; "—" for a missing value (never a made-up zero). */
export function fmtHours(h: number | null | undefined, digits = 1): string {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—';
  if (h === 0) return '0 h';
  if (Math.abs(h) < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(digits)} h`;
}

export function fmtPct(p: number | null | undefined): string {
  return p === null || p === undefined || !Number.isFinite(p) ? '—' : `${p.toFixed(1)} %`;
}

/** Service-meter reading: "4,512 h". */
export function fmtMeter(h: number | null | undefined): string {
  return h === null || h === undefined || !Number.isFinite(h) ? '—' : `${Math.round(h).toLocaleString()} h`;
}

/** "3 h 20 min" for a duration in seconds (current state, "since"). */
export function fmtSpan(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Share bar: one thin segmented bar of operating / idle / maintenance / down hours. */
export function StateShareBar({ hours, className }: { hours: Record<(typeof TIME_STATES)[number], number>; className?: string }) {
  const total = TIME_STATES.reduce((a, s) => a + (hours[s] ?? 0), 0);
  if (total <= 0) return <div className={cx('h-2 w-full rounded-full bg-surface-container-high', className)} />;
  return (
    <div className={cx('flex h-2 w-full gap-[2px] overflow-hidden rounded-full', className)} role="img" aria-label={TIME_STATES.map((s) => `${STATE_META[s].label} ${fmtHours(hours[s])}`).join(', ')}>
      {TIME_STATES.filter((s) => hours[s] > 0).map((s) => (
        <div key={s} style={{ width: `${(100 * hours[s]) / total}%`, background: STATE_META[s].color }} title={`${STATE_META[s].label}: ${fmtHours(hours[s])}`} />
      ))}
    </div>
  );
}

export function StateLegend({ className }: { className?: string }) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant', className)}>
      {TIME_STATES.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5" title={STATE_META[s].hint}>
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATE_META[s].color }} />
          {STATE_META[s].label}
        </li>
      ))}
    </ul>
  );
}

export const WINDOW_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
] as const;
