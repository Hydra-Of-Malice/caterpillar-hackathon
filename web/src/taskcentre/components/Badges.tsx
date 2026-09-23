/**
 * Task Centre status badges. Every one carries an icon **and** words — colour is never the only
 * signal, so they stay readable in monochrome and for colour-blind readers.
 */
import type { ReactNode } from 'react';
import { Chip, Icon, cx } from '../../components/ui';
import { PRESENCE_NOTE, ROLE_ICON, ROLE_LABEL, SIMULATED_NOTE, STALE } from '../constants';
import { ageS, fmtAge, fmtMetres, isTs, type Ts } from '../time';
import type { EvidenceSource, GeofenceStatus, Priority, Role, Severity, TicketStatus } from '../types';

/** `Chip` has no title prop; wrap it so every badge can explain itself on hover. */
function Titled({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex', className)} title={title}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- geofence
const GEOFENCE: Record<GeofenceStatus, { icon: string; label: string; tone: 'green' | 'red' | 'neutral'; note: string }> = {
  inside: { icon: 'where_to_vote', label: 'Inside fence', tone: 'green', note: `Last fix was inside the site boundary. ${PRESENCE_NOTE}` },
  outside: { icon: 'wrong_location', label: 'Outside fence', tone: 'red', note: `Last fix was outside the site boundary. ${PRESENCE_NOTE}` },
  unverified: {
    icon: 'location_off',
    label: 'Unverified',
    tone: 'neutral',
    note: `No usable fix — denied, unavailable or too imprecise. Never read as "outside". ${PRESENCE_NOTE}`,
  },
};

export function GeofenceBadge({
  status,
  distanceM,
  accuracyM,
  className,
  showDistance = true,
}: {
  status: GeofenceStatus | string | null | undefined;
  distanceM?: number | null;
  accuracyM?: number | null;
  className?: string;
  showDistance?: boolean;
}) {
  const key: GeofenceStatus = status === 'inside' || status === 'outside' ? status : 'unverified';
  const g = GEOFENCE[key];
  const bits = [g.note];
  if (typeof distanceM === 'number') bits.push(`Distance: ${fmtMetres(distanceM)}.`);
  if (typeof accuracyM === 'number') bits.push(`Fix accuracy: ±${Math.round(accuracyM)} m.`);
  return (
    <Titled title={bits.join(' ')} className={className}>
      <Chip tone={g.tone} icon={g.icon}>
        {g.label}
        {showDistance && typeof distanceM === 'number' && <span className="ml-1 font-normal normal-case tnum">· {fmtMetres(distanceM)}</span>}
      </Chip>
    </Titled>
  );
}

// ---------------------------------------------------------------- staleness
/**
 * Freshness of a reading. Older than `thresholdS` (default: the location threshold) → STALE;
 * no timestamp at all → NO DATA. A stale reading means unknown, never current.
 */
export function StaleBadge({
  ts,
  thresholdS = STALE.location_s,
  now,
  className,
  label = 'reading',
  showFresh = true,
}: {
  ts: Ts;
  thresholdS?: number;
  now?: number;
  className?: string;
  label?: string;
  showFresh?: boolean;
}) {
  if (!isTs(ts)) {
    return (
      <Titled title={`No ${label} has been received.`} className={className}>
        <Chip tone="neutral" icon="help">
          No data
        </Chip>
      </Titled>
    );
  }
  const age = ageS(ts, now) ?? 0;
  const stale = age > thresholdS;
  if (!stale && !showFresh) return null;
  const title = stale
    ? `Older than ${Math.round(thresholdS / 60)} min — treat this ${label} as unknown, not as current.`
    : `Last ${label} ${fmtAge(ts, now)}.`;
  return (
    <Titled title={title} className={className}>
      <Chip tone={stale ? 'orange' : 'neutral'} icon={stale ? 'history' : 'schedule'}>
        {stale ? `Stale · ${fmtAge(ts, now)}` : fmtAge(ts, now)}
      </Chip>
    </Titled>
  );
}

/** True when a timestamp is older than the threshold (or missing). */
export function isStale(ts: Ts, thresholdS: number = STALE.location_s, now?: number): boolean {
  const age = ageS(ts, now);
  return age === null || age > thresholdS;
}

// ---------------------------------------------------------------- role
export function RoleBadge({ role, className }: { role: Role | string; className?: string }) {
  const key: Role = role === 'admin' || role === 'supervisor' ? role : 'operator';
  const tone = key === 'admin' ? 'purple' : key === 'supervisor' ? 'blue' : 'neutral';
  return (
    <Chip tone={tone} icon={ROLE_ICON[key]} className={className}>
      {ROLE_LABEL[key]}
    </Chip>
  );
}

// ---------------------------------------------------------------- simulated / provenance
/** Marks output that came from a simulated detector rather than a validated sensor. */
export function SimulatedChip({ source = 'SIMULATED', className, children }: { source?: EvidenceSource | string; className?: string; children?: ReactNode }) {
  const sim = source === 'SIMULATED';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 font-display text-label-sm uppercase',
        sim ? 'border-dashed border-prov-sim text-prov-sim-text' : 'border-outline-variant text-on-surface-variant',
        className,
      )}
      title={sim ? SIMULATED_NOTE : `Source: ${source}`}
    >
      <Icon name={sim ? 'science' : source === 'RULE' ? 'rule' : 'person'} size={14} />
      {children ?? source}
    </span>
  );
}

// ---------------------------------------------------------------- severity / status / priority
const SEVERITY: Record<string, { tone: 'red' | 'orange' | 'yellow' | 'neutral'; icon: string }> = {
  critical: { tone: 'red', icon: 'emergency_home' },
  high: { tone: 'orange', icon: 'priority_high' },
  medium: { tone: 'yellow', icon: 'warning' },
  low: { tone: 'neutral', icon: 'info' },
};

export function SeverityChip({ severity, className }: { severity: Severity | string; className?: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.low;
  return (
    <Chip tone={s.tone} icon={s.icon} className={className}>
      {severity}
    </Chip>
  );
}

const TICKET_STATUS: Record<string, { tone: 'orange' | 'red' | 'neutral' | 'green'; icon: string }> = {
  open: { tone: 'orange', icon: 'pending' },
  confirmed: { tone: 'red', icon: 'check_circle' },
  dismissed: { tone: 'neutral', icon: 'cancel' },
  resolved: { tone: 'green', icon: 'task_alt' },
};

export function TicketStatusChip({ status, className }: { status: TicketStatus | string; className?: string }) {
  const s = TICKET_STATUS[status] ?? TICKET_STATUS.open;
  return (
    <Chip tone={s.tone} icon={s.icon} className={className}>
      {status}
    </Chip>
  );
}

const PRIORITY: Record<string, { tone: 'red' | 'orange' | 'neutral' | 'blue'; icon: string }> = {
  urgent: { tone: 'red', icon: 'bolt' },
  high: { tone: 'orange', icon: 'arrow_upward' },
  normal: { tone: 'neutral', icon: 'remove' },
  low: { tone: 'blue', icon: 'arrow_downward' },
};

export function PriorityChip({ priority, className }: { priority: Priority | string; className?: string }) {
  const p = PRIORITY[priority] ?? PRIORITY.normal;
  return (
    <Chip tone={p.tone} icon={p.icon} className={className}>
      {priority}
    </Chip>
  );
}

/** Human label for a `tc_ticket.kind` / incident kind. */
const KIND_LABEL: Record<string, string> = {
  geofence_punch: 'Punch outside geofence',
  ai_idle: 'AI idle flag',
  fatigue: 'Fatigue prompt',
  task_overrun: 'Task overrun',
  critical_incident: 'Critical incident',
  no_eligible_operator: 'No eligible operator',
  hydraulic_pressure: 'Hydraulic pressure',
  engine_overheat: 'Engine overheat',
};

export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return 'Unknown';
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
