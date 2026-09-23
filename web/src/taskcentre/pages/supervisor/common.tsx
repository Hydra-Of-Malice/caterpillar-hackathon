/**
 * Pieces shared by the supervisor screens: the four task buckets, checkpoint readouts, the
 * location line and the load/error gate. Everything else comes from the shared Task Centre
 * components (`../../components`) and GMT helpers (`../../time`).
 */
import type { ReactNode } from 'react';
import { personName } from '../../api';
import { GeofenceBadge, GmtTime, StaleBadge, TcError, TcLoading } from '../../components';
import { STALE } from '../../constants';
import { fmtMetres } from '../../time';
import type { Checkpoint, LocationReport, SupOperatorRow, TaskCounts, TcTask } from '../../types';
import { Bar, Card, Caveat, Details, Stat, TABLE, TableWrap } from '../../../components/ops/layout';
import { Chip, EmptyState, Icon, cx } from '../../../components/ui';

export { Bar, Card, Caveat, Details, Stat, TABLE, TableWrap, EmptyState, Icon, Chip, cx };

/** Display name for a team row, whichever way the API nests the user. */
export const operatorName = (row: SupOperatorRow): string => personName(row);

/** The four numbers on the supervisor dashboard. `overdue` overlaps the status buckets. */
export type Bucket = 'completed' | 'ongoing' | 'pending' | 'overdue';

export const BUCKETS: Bucket[] = ['completed', 'ongoing', 'pending', 'overdue'];

export const BUCKET: Record<Bucket, { label: string; color: string; hint: string; tone: 'green' | 'blue' | 'neutral' | 'red' }> = {
  completed: { label: 'Completed', color: '#197527', hint: 'Finished by the operator', tone: 'green' },
  ongoing: { label: 'Ongoing', color: '#0066FF', hint: 'Started, not finished', tone: 'blue' },
  pending: { label: 'Pending', color: '#909090', hint: 'Assigned, not started', tone: 'neutral' },
  overdue: { label: 'Overdue', color: '#C52320', hint: 'Past its expected finish (GMT)', tone: 'red' },
};

/** Past the expected finish. Prefers the server's flag; otherwise compares against the GMT clock. */
export function isOverdue(t: TcTask, now: number): boolean {
  if (typeof t.overdue === 'boolean') return t.overdue;
  if (t.status === 'cancelled') return false;
  if (t.status === 'completed') return (t.finished_at ?? 0) > t.expected_finish_ts;
  return now > t.expected_finish_ts;
}

/** `overdue` overlaps the status buckets on purpose: an ongoing task can also be overdue. */
export function inBucket(t: TcTask, b: Bucket, now: number): boolean {
  return b === 'overdue' ? isOverdue(t, now) : t.status === b;
}

/**
 * The single bucket a task belongs to, for the stacked chart where a bar's height must equal the
 * number of tasks assigned.
 *
 * `inBucket` deliberately lets `overdue` overlap `ongoing` and `pending`, because in a flat count
 * both readings are useful. A stack cannot show one task twice, so here each task is counted once:
 * a completed task stays completed, anything unfinished and past its expected finish is overdue,
 * and the rest fall to their status. Cancelled tasks belong to no bucket and are not drawn.
 */
export function exclusiveBucket(t: TcTask, now: number): Bucket | null {
  if (t.status === 'cancelled') return null;
  if (t.status === 'completed') return 'completed';
  if (isOverdue(t, now)) return 'overdue';
  return t.status === 'ongoing' ? 'ongoing' : 'pending';
}

/** :func:`exclusiveBucket` totalled over a task list. The four numbers sum to the tasks drawn. */
export function exclusiveCounts(tasks: TcTask[], now: number): Record<Bucket, number> {
  const out: Record<Bucket, number> = { completed: 0, ongoing: 0, pending: 0, overdue: 0 };
  for (const t of tasks) {
    const b = exclusiveBucket(t, now);
    if (b) out[b] += 1;
  }
  return out;
}

/** Server counts, or the same four numbers derived from the task list when the API omits them. */
export function bucketCounts(counts: TaskCounts | undefined, tasks: TcTask[], now: number): Record<Bucket, number> {
  if (counts) {
    return {
      completed: counts.completed ?? 0,
      ongoing: counts.ongoing ?? 0,
      pending: counts.pending ?? 0,
      overdue: counts.overdue ?? 0,
    };
  }
  return {
    completed: tasks.filter((t) => inBucket(t, 'completed', now)).length,
    ongoing: tasks.filter((t) => inBucket(t, 'ongoing', now)).length,
    pending: tasks.filter((t) => inBucket(t, 'pending', now)).length,
    overdue: tasks.filter((t) => inBucket(t, 'overdue', now)).length,
  };
}

// ---------------------------------------------------------------- states
/**
 * Loading / error (including permission denied, which `TcError` words for us) for a polled
 * resource. Returns `null` once data has arrived, so a caller renders `{gate(r, 'X') ?? <Body/>}`.
 */
export function gate(r: { loading: boolean; error?: Error; data?: unknown; reload?: () => void }, what: string, label = 'Loading'): ReactNode | null {
  if (r.data !== undefined) return null;
  if (r.error) return <TcError error={r.error} what={what} onRetry={r.reload} />;
  if (r.loading) return <TcLoading label={label} />;
  return null;
}

// ---------------------------------------------------------------- task vocabulary
const STATUS_TONE: Record<string, 'green' | 'blue' | 'neutral'> = {
  completed: 'green',
  ongoing: 'blue',
  pending: 'neutral',
  cancelled: 'neutral',
};

/** Task status, plus an explicit overrun chip when it is past its expected finish. */
export function TaskStatusChip({ task, now }: { task: TcTask; now: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Chip tone={STATUS_TONE[task.status] ?? 'neutral'}>{task.status}</Chip>
      {isOverdue(task, now) && (
        <Chip tone="red" icon="schedule">
          Overrun
        </Chip>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- location
/**
 * Last known position of an operator: geofence status, the GMT time of the fix and an explicit
 * stale badge. Presence, never proof.
 */
export function LocationLine({
  location,
  now,
  fallbackStatus,
  stale,
}: {
  location?: LocationReport | null;
  now: number;
  fallbackStatus?: string | null;
  stale?: boolean;
}) {
  if (!location) {
    return (
      <div className="space-y-1">
        <GeofenceBadge status={fallbackStatus ?? 'unverified'} />
        <p className="text-body-sm text-on-surface-muted">No position reported.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <GeofenceBadge status={location.geofence_status ?? fallbackStatus} distanceM={location.distance_m} accuracyM={location.accuracy_m} />
      <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
        <GmtTime ts={location.ts} gmt={location.ts_gmt} mode="smart" />
        <StaleBadge ts={location.ts} now={now} thresholdS={STALE.location_s} label="position" showFresh={false} />
        {stale === true && location.stale !== true && <Chip tone="orange" icon="history">Stale</Chip>}
        {typeof location.accuracy_m === 'number' && <span className="tnum">±{Math.round(location.accuracy_m)} m</span>}
        {typeof location.distance_m === 'number' && <span className="tnum">{fmtMetres(location.distance_m)} from centre</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- checkpoints
const span = (c: Checkpoint) => Math.max(1, c.target || 1);

export function checkpointTotals(list: Checkpoint[] | undefined): { done: number; total: number; requiredLeft: number } {
  if (!list || list.length === 0) return { done: 0, total: 0, requiredLeft: 0 };
  let done = 0;
  let total = 0;
  let requiredLeft = 0;
  for (const c of list) {
    const t = span(c);
    const d = Math.min(Math.max(0, c.done ?? 0), t);
    done += d;
    total += t;
    if (c.required && d < t) requiredLeft += 1;
  }
  return { done, total, requiredLeft };
}

/** One-line checkpoint progress for a task row. */
export function CheckpointProgress({ list }: { list?: Checkpoint[] }) {
  if (!list || list.length === 0) return <span className="text-body-sm text-on-surface-muted">No checkpoints</span>;
  const { done, total, requiredLeft } = checkpointTotals(list);
  return (
    <div className="min-w-[140px]">
      <div className="flex items-baseline justify-between gap-3 text-body-sm">
        <span className="text-on-surface-variant">
          {list.length} checkpoint{list.length === 1 ? '' : 's'}
        </span>
        <span className="text-on-surface tnum">
          {done}/{total}
        </span>
      </div>
      <Bar className="mt-1.5" pct={total ? (done / total) * 100 : 0} tone={requiredLeft === 0 ? 'green' : 'neutral'} />
      {requiredLeft > 0 && (
        <div className="mt-1 text-body-sm text-on-surface-muted">
          {requiredLeft} required checkpoint{requiredLeft === 1 ? '' : 's'} still open
        </div>
      )}
    </div>
  );
}

/** Full read-only checkpoint list for the operator detail page. */
export function CheckpointList({ list }: { list?: Checkpoint[] }) {
  if (!list || list.length === 0) return <p className="text-body-sm text-on-surface-muted">This task has no checkpoints.</p>;
  const ordered = [...list].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  return (
    <ul className="divide-y divide-outline">
      {ordered.map((c) => {
        const t = span(c);
        const d = Math.min(Math.max(0, c.done ?? 0), t);
        const complete = d >= t;
        return (
          <li key={c.checkpoint_id} className="flex items-start gap-3 py-2.5">
            <Icon
              name={complete ? 'check_circle' : c.kind === 'counted' ? 'pin' : 'radio_button_unchecked'}
              size={20}
              className={cx('mt-0.5', complete ? 'text-success-text' : 'text-on-surface-muted')}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx('text-body-md', complete ? 'text-on-surface-variant line-through' : 'text-on-surface')}>{c.label}</span>
                {c.required ? <Chip tone="yellow">Required</Chip> : <Chip tone="neutral">Optional</Chip>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted tnum">
                <span>{c.kind === 'counted' ? `${d} / ${t}` : complete ? 'Done' : 'Not done'}</span>
                {c.updated_at ? (
                  <span>
                    updated <GmtTime ts={c.updated_at} gmt={c.updated_at_gmt} mode="smart" />
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- forms
/** Labelled form field with a hint that becomes the validation message when one is present. */
export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="font-display text-label-sm uppercase text-on-surface-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span className="mt-1 block text-body-sm text-danger-text">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-body-sm text-on-surface-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** One fact in a definition grid. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="font-display text-label-sm uppercase text-on-surface-muted">{label}</dt>
      <dd className="mt-1 text-body-md text-on-surface">{children}</dd>
    </div>
  );
}
