/**
 * Live task timer for the operator screens.
 *
 * Everything shown here is derived from the timestamps the server put on the task
 * (`start_ts`, `expected_finish_ts`, `started_at`, `finished_at`) — nothing is guessed. If a
 * timestamp is missing the timer says so instead of inventing an elapsed time.
 *
 * The clock ticks once a second in the browser but is anchored to the server: every poll of
 * `GET /tc/op/today` carries the server's own `ts`, and each one re-measures the offset between
 * the two clocks. A device with a wrong clock, or a tab that was suspended, therefore still shows
 * the same elapsed time the server would record, and the display cannot drift away from it.
 *
 * Self-contained on purpose: Today and the task detail each render it with a single line.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { GmtHint, GmtTime } from '../../components';
import { Icon, ProgressBar, cx } from '../../../components/ui';
import { isTs } from '../../time';
import type { TcTask } from '../../types';
import { Note, Stat } from './common';

// ---------------------------------------------------------------- the task fields the timer reads
/** Only the timing fields are required, so a partial task (or a card row) can be timed too. */
export type TimerTask = Pick<TcTask, 'status'> &
  Partial<
    Pick<
      TcTask,
      | 'start_ts'
      | 'start_gmt'
      | 'expected_finish_ts'
      | 'expected_finish_gmt'
      | 'started_at'
      | 'started_at_gmt'
      | 'finished_at'
      | 'finished_at_gmt'
      | 'overrun_ticket_id'
    >
  >;

// ---------------------------------------------------------------- server-anchored clock
/**
 * The last timestamp the server sent and the browser time it arrived at. There is one server and
 * one device, so there is one offset — it is held here rather than drilled through every card.
 */
let anchor: { serverTs: number; at: number } | null = null;

/** Record the server's own timestamp from a poll. Ignores anything that is not a real timestamp. */
export function setServerAnchor(serverTs?: number | null): void {
  if (!isTs(serverTs)) return;
  anchor = { serverTs, at: Date.now() };
}

/**
 * Now, in UTC seconds, on the server's clock: the last value it sent, advanced locally since.
 * With nothing from the server yet this is the device's own clock — the honest fallback.
 */
export function serverNow(): number {
  if (!anchor) return Date.now() / 1000;
  return anchor.serverTs + (Date.now() - anchor.at) / 1000;
}

/**
 * Anchor the shared clock from a screen that polls an endpoint carrying the server time
 * (`GET /tc/op/today` sends `ts`). Every timer on the page then counts on the server's clock, so
 * a device whose own clock is wrong — or a tab that was suspended — cannot drift away from it.
 */
export function useTaskClock(serverTs?: number | null): void {
  useEffect(() => {
    setServerAnchor(serverTs);
  }, [serverTs]);
}

/**
 * Re-render once a second while `ticking`, and read the server-anchored clock on every render —
 * so a poll that moves the anchor is reflected at once, not a second later.
 */
function useTickingNow(ticking: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  return serverNow();
}

// ---------------------------------------------------------------- duration formatting
const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds → "07:12" / "1:04:09" — a running clock, seconds included. */
export function clockDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Seconds → "14 min" / "1 h 04 min" — a span where the seconds do not matter. */
export function coarseDur(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${pad(m % 60)} min` : `${m} min`;
}

// ---------------------------------------------------------------- derived timing
export type TimerPhase =
  /** Not started yet: only the planned window is known. */
  | 'planned'
  /** Running and still inside the planned window. */
  | 'running'
  /** Running past the expected finish time. */
  | 'overrun'
  /** Closed, with a recorded finish time. */
  | 'finished'
  /** Marked in progress, but the server recorded no start time. */
  | 'no_start'
  /** Cancelled — there is no time to show. */
  | 'cancelled'
  /** Closed or open without the timestamps needed to say anything. */
  | 'unknown';

export interface Timing {
  phase: TimerPhase;
  plannedStart: number | null;
  plannedFinish: number | null;
  /** Planned duration in seconds (`start_ts` → `expected_finish_ts`). */
  plannedS: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Time on the clock: since it was started, or how long it actually took. */
  elapsedS: number | null;
  /** Seconds left before the expected finish, while still inside the window. */
  remainingS: number | null;
  /** Seconds past the expected finish — live while running, or by how much it finished late. */
  overS: number | null;
  /** Elapsed as a share of the time allowed, 0–100+; null when there is nothing to compare with. */
  pct: number | null;
  /** Finished on or before the expected finish. Null when it cannot be judged. */
  onTime: boolean | null;
}

/** Read the task's timestamps into everything the timer displays. Pure — `now` comes from the caller. */
export function taskTiming(task: TimerTask, now: number): Timing {
  const plannedStart = isTs(task.start_ts) ? task.start_ts : null;
  const plannedFinish = isTs(task.expected_finish_ts) ? task.expected_finish_ts : null;
  const startedAt = isTs(task.started_at) ? task.started_at : null;
  const finishedAt = isTs(task.finished_at) ? task.finished_at : null;
  const plannedS = plannedStart !== null && plannedFinish !== null && plannedFinish > plannedStart ? plannedFinish - plannedStart : null;

  /** The time actually allowed once it started; falls back to the planned duration. */
  const allowedS = startedAt !== null && plannedFinish !== null && plannedFinish > startedAt ? plannedFinish - startedAt : plannedS;
  const share = (elapsed: number) => (allowedS && allowedS > 0 ? (elapsed / allowedS) * 100 : null);

  const base: Timing = {
    phase: 'unknown',
    plannedStart,
    plannedFinish,
    plannedS,
    startedAt,
    finishedAt,
    elapsedS: null,
    remainingS: null,
    overS: null,
    pct: null,
    onTime: null,
  };

  if (task.status === 'cancelled') return { ...base, phase: 'cancelled' };

  if (task.status === 'completed') {
    if (finishedAt === null) return base; // closed, but the server recorded no finish time
    const elapsedS = startedAt !== null ? Math.max(0, finishedAt - startedAt) : null;
    const over = plannedFinish !== null ? finishedAt - plannedFinish : null;
    return {
      ...base,
      phase: 'finished',
      elapsedS,
      overS: over !== null && over > 0 ? over : null,
      onTime: over === null ? null : over <= 0,
      pct: elapsedS === null ? null : share(elapsedS),
    };
  }

  if (task.status === 'ongoing') {
    if (startedAt === null) return { ...base, phase: 'no_start' };
    const elapsedS = Math.max(0, now - startedAt);
    if (plannedFinish !== null && now > plannedFinish) {
      return { ...base, phase: 'overrun', elapsedS, overS: now - plannedFinish, pct: share(elapsedS) };
    }
    return {
      ...base,
      phase: 'running',
      elapsedS,
      remainingS: plannedFinish !== null ? Math.max(0, plannedFinish - now) : null,
      pct: share(elapsedS),
    };
  }

  // pending, or any other status the API adds later: only the plan is known
  return { ...base, phase: 'planned' };
}

// ---------------------------------------------------------------- presentation
interface Look {
  icon: string;
  iconClass: string;
  /** The headline value. */
  value: ReactNode;
  /** What the headline value is. */
  label: string;
  /** The supporting line. */
  detail: ReactNode;
  valueClass: string;
  bar: 'yellow' | 'orange' | 'red' | 'green' | null;
  /** Spoken summary — coarse on purpose, so a screen reader is not read a new number every second. */
  aria: string;
}

function look(t: Timing, task: TimerTask): Look {
  const expected = <GmtTime ts={t.plannedFinish} gmt={task.expected_finish_gmt} />;

  switch (t.phase) {
    case 'running':
      return {
        icon: 'timer',
        iconClass: 'text-cat-text',
        value: clockDur(t.elapsedS ?? 0),
        valueClass: 'font-display tnum text-on-surface',
        label: 'Elapsed',
        detail:
          t.remainingS === null ? (
            <>No expected finish time on this task — nothing to count down to.</>
          ) : (
            <>
              {coarseDur(t.remainingS)} left · finish by {expected}
            </>
          ),
        bar: 'yellow',
        aria:
          t.remainingS === null
            ? `Running for ${coarseDur(t.elapsedS ?? 0)}. No expected finish time.`
            : `Running for ${coarseDur(t.elapsedS ?? 0)}, about ${coarseDur(t.remainingS)} left.`,
      };

    case 'overrun':
      return {
        icon: 'running_with_errors',
        iconClass: 'text-warning-text',
        value: `${coarseDur(t.overS ?? 0)} over`,
        valueClass: 'font-display tnum text-warning-text',
        label: 'Past the expected finish',
        detail: (
          <>
            Expected {expected} · running {clockDur(t.elapsedS ?? 0)}
          </>
        ),
        bar: 'red',
        aria: `Past the expected finish time by ${coarseDur(t.overS ?? 0)}. Running for ${coarseDur(t.elapsedS ?? 0)}.`,
      };

    case 'planned':
      return {
        icon: 'schedule',
        iconClass: 'text-on-surface-muted',
        value: (
          <>
            <GmtTime ts={t.plannedStart} gmt={task.start_gmt} missing="—" /> <span className="text-on-surface-muted">to</span> {expected}
          </>
        ),
        valueClass: 'font-display text-on-surface',
        label: 'Planned window',
        detail: t.plannedS === null ? <>Not started. No planned duration on this task.</> : <>{coarseDur(t.plannedS)} planned · not started yet</>,
        bar: null,
        aria: t.plannedS === null ? 'Not started yet.' : `Not started yet. ${coarseDur(t.plannedS)} planned.`,
      };

    case 'finished': {
      const late = t.onTime === false;
      return {
        icon: late ? 'warning' : 'check_circle',
        iconClass: late ? 'text-warning-text' : 'text-success-text',
        value: t.elapsedS === null ? 'Finished' : coarseDur(t.elapsedS),
        valueClass: cx('font-display tnum', late ? 'text-warning-text' : 'text-on-surface'),
        label: t.elapsedS === null ? 'No start time recorded' : 'Actual duration',
        detail: (
          <>
            Finished <GmtTime ts={t.finishedAt} gmt={task.finished_at_gmt} />
            {t.onTime === null ? null : late ? <> · {coarseDur(t.overS ?? 0)} late</> : <> · on time</>}
          </>
        ),
        bar: late ? 'orange' : 'green',
        aria: `${t.elapsedS === null ? 'Finished' : `Took ${coarseDur(t.elapsedS)}`}${
          t.onTime === null ? '' : late ? `, ${coarseDur(t.overS ?? 0)} late` : ', on time'
        }.`,
      };
    }

    case 'no_start':
      return {
        icon: 'timer_off',
        iconClass: 'text-on-surface-muted',
        value: 'Not started',
        valueClass: 'font-display text-on-surface-variant',
        label: 'No start time recorded',
        detail: <>This task is marked in progress but the server has no start time for it, so there is no elapsed time to show.</>,
        bar: null,
        aria: 'Marked in progress, but no start time was recorded.',
      };

    default:
      return {
        icon: 'help',
        iconClass: 'text-on-surface-muted',
        value: 'No times recorded',
        valueClass: 'font-display text-on-surface-variant',
        label: 'Nothing to time',
        detail: <>The server has not recorded the timestamps this needs.</>,
        bar: null,
        aria: 'No times were recorded for this task.',
      };
  }
}

// ---------------------------------------------------------------- component
/**
 * `compact` — one strip for a task card on Today. `full` — a panel for the task detail.
 *
 * The clock comes from the shared server anchor; call `useTaskClock(today?.ts)` once on the screen
 * that polls. `serverTs` is an optional shortcut for a caller that already has the value to hand.
 */
export function TaskTimer({
  task,
  serverTs,
  variant = 'compact',
  className,
}: {
  task: TimerTask;
  serverTs?: number | null;
  variant?: 'compact' | 'full';
  className?: string;
}) {
  useTaskClock(serverTs);
  const ticking = task.status === 'ongoing' && isTs(task.started_at);
  const now = useTickingNow(ticking);
  const t = taskTiming(task, now);

  if (t.phase === 'cancelled') return null;
  const d = look(t, task);

  if (variant === 'compact') {
    return (
      <div className={cx('mt-3 flex items-start gap-2 border-t border-outline pt-2', className)} role="timer" aria-label={d.aria}>
        <Icon name={d.icon} size={22} className={cx('mt-0.5', d.iconClass)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cx('text-headline-sm', d.valueClass)}>{d.value}</span>
            <span className="font-display text-label-sm uppercase text-on-surface-muted">{d.label}</span>
          </div>
          <div className="mt-0.5 text-body-md text-on-surface-muted">{d.detail}</div>
          {d.bar && t.pct !== null && <ProgressBar pct={t.pct} tone={d.bar} height="h-2" className="mt-2" />}
        </div>
      </div>
    );
  }

  const finishedOrRunning = t.phase === 'running' || t.phase === 'overrun' || t.phase === 'finished';

  return (
    <section className={cx('panel space-y-3 p-4', className)} aria-label="Task timer">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-label-lg uppercase text-on-surface-muted">
          <Icon name="timer" size={22} />
          Timer
        </h2>
        <GmtHint />
      </div>

      <div className="flex items-start gap-3" role="timer" aria-label={d.aria}>
        <Icon name={d.icon} size={34} className={cx('mt-1', d.iconClass)} />
        <div className="min-w-0 flex-1">
          <div className={cx('text-headline-lg leading-tight', d.valueClass)}>{d.value}</div>
          <div className="font-display text-label-md uppercase text-on-surface-muted">{d.label}</div>
          <p className="mt-1 text-body-lg text-on-surface-variant">{d.detail}</p>
        </div>
      </div>

      {d.bar && t.pct !== null && <ProgressBar pct={t.pct} tone={d.bar} />}

      <div className="grid grid-cols-2 gap-3 border-t border-outline pt-3">
        <Stat label="Started (GMT)">
          {t.startedAt !== null ? <GmtTime ts={t.startedAt} gmt={task.started_at_gmt} /> : <span className="text-on-surface-muted">Not started</span>}
        </Stat>
        <Stat label="Expected finish (GMT)">
          <GmtTime ts={t.plannedFinish} gmt={task.expected_finish_gmt} missing="Not set" />
        </Stat>
        {t.phase === 'running' && (
          <Stat label="Time remaining">{t.remainingS === null ? <span className="text-on-surface-muted">—</span> : coarseDur(t.remainingS)}</Stat>
        )}
        {t.phase === 'overrun' && <Stat label="Over by">{coarseDur(t.overS ?? 0)}</Stat>}
        {t.phase === 'finished' && (
          <>
            <Stat label="Finished (GMT)">
              <GmtTime ts={t.finishedAt} gmt={task.finished_at_gmt} missing="Not recorded" />
            </Stat>
            <Stat label="Actual duration">
              {t.elapsedS === null ? <span className="text-on-surface-muted">No start time recorded</span> : coarseDur(t.elapsedS)}
            </Stat>
          </>
        )}
        {finishedOrRunning && t.plannedS !== null && <Stat label="Planned duration">{coarseDur(t.plannedS)}</Stat>}
      </div>

      {t.phase === 'overrun' && (
        <Note tone="warn" icon="running_with_errors" title={`${coarseDur(t.overS ?? 0)} past the expected finish`} role="alert">
          This task is still open after <GmtTime ts={t.plannedFinish} gmt={task.expected_finish_gmt} />. Send your supervisor the reason using
          “Explain a delay” below — they see it on the task straight away.
        </Note>
      )}

      {t.phase === 'finished' && t.onTime === false && (
        <Note tone="warn" icon="history" title={`Finished ${coarseDur(t.overS ?? 0)} after the expected time`}>
          {task.overrun_ticket_id
            ? 'An overrun was sent to your supervisor for review. You will see what they decide in your alerts.'
            : 'The recorded times are what your supervisor sees. Nothing else is needed from you here.'}
        </Note>
      )}
    </section>
  );
}

export default TaskTimer;
