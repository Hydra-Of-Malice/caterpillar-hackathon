/**
 * "Waiting for truck" — the operator declares a pause that is not theirs to answer for.
 *
 * One tap records the usual case (a haul truck that has not arrived); a small secondary control
 * offers the other reasons. While a wait is open the control shows the reason and a counter that
 * ticks locally each second from `since_ts`, reconciled from the `waiting` block on every
 * `/op/today` poll so a second device or a reload agrees. The toggle is optimistic and rolls back
 * if the call fails.
 *
 * The wording is deliberate: this time is *recorded as waiting*, not held against the operator. A
 * wait can be declared with or without an ongoing task, so the control is never disabled for want
 * of one — `taskId` is passed only to attach the wait to the task in progress.
 */
import { useEffect, useState } from 'react';
import { errorText, opApi } from '../../api';
import { GmtTime } from '../../components';
import { Button, Icon, cx } from '../../../components/ui';
import { nowTs } from '../../time';
import type { OpWaiting, WaitingReason } from '../../types';
import { Note, TOUCH } from './common';

// ---------------------------------------------------------------- reasons
interface ReasonMeta {
  label: string;
  /** Shown on the active card — what the recorded time *is*, in the operator's words. */
  recordedAs: string;
  icon: string;
  /** Label of the button that ends this wait. */
  stop: string;
}

export const WAIT_REASONS: Record<WaitingReason, ReasonMeta> = {
  waiting_for_truck: {
    label: 'Waiting for truck',
    recordedAs: 'waiting for a truck',
    icon: 'local_shipping',
    stop: 'Truck arrived — resume',
  },
  machine_paused: {
    label: 'Machine paused',
    recordedAs: 'a machine pause',
    icon: 'pause_circle',
    stop: 'Machine running — resume',
  },
  expected_delay: {
    label: 'Expected delay',
    recordedAs: 'an expected delay',
    icon: 'hourglass_top',
    stop: 'Delay over — resume',
  },
};

const DEFAULT_REASON: WaitingReason = 'waiting_for_truck';
const OTHER_REASONS: WaitingReason[] = ['machine_paused', 'expected_delay'];

/** Server reasons we do not know about still get a readable card rather than a blank one. */
function meta(reason: string | null | undefined): ReasonMeta {
  const known = WAIT_REASONS[(reason ?? DEFAULT_REASON) as WaitingReason];
  if (known) return known;
  const label = String(reason).replace(/_/g, ' ');
  return { label: label.charAt(0).toUpperCase() + label.slice(1), recordedAs: label, icon: 'schedule', stop: 'Resume work' };
}

// ---------------------------------------------------------------- formatting
const pad = (n: number) => String(n).padStart(2, '0');

/** "4:07" under an hour, "1:04:07" beyond it. */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** "24 min", "1 h 12 min". */
export function fmtMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

/** Re-render once a second, but only while a wait is open. */
function useSecondTicker(on: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [on]);
}

interface Pending {
  active: boolean;
  reason: WaitingReason;
  since_ts: number;
}

// ---------------------------------------------------------------- control
export function WaitingControl({
  waiting,
  taskId,
  onChanged,
  className,
}: {
  /** The `waiting` block from `GET /op/today`; `undefined` until the first poll answers. */
  waiting?: OpWaiting | null;
  /** Attaches the wait to the task in progress. Omitted, the wait stands on its own. */
  taskId?: string | null;
  /** Ask the page to re-poll `/op/today` so every screen agrees. */
  onChanged?: () => void;
  className?: string;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [ended, setEnded] = useState<{ minutes: number | null; reason: string } | null>(null);
  const [pickOther, setPickOther] = useState(false);

  const serverActive = waiting?.active === true;
  const serverSince = waiting?.since_ts ?? null;

  // Reconcile: as soon as the poll agrees with the state we asked for, hand the screen back to it.
  useEffect(() => {
    setPending((p) => (p && p.active === serverActive ? null : p));
  }, [serverActive, serverSince]);

  const active = pending ? pending.active : serverActive;
  const reason = pending ? pending.reason : waiting?.reason ?? DEFAULT_REASON;
  const since = pending ? pending.since_ts : serverSince;
  const m = meta(reason);

  useSecondTicker(active);
  const elapsedS = active && since ? Math.max(0, nowTs() - since) : 0;

  const todayTotal = waiting?.today_total_minutes ?? 0;
  const byReason = Object.entries(waiting?.by_reason ?? {}).filter(([, mins]) => (mins ?? 0) > 0);

  const start = async (next: WaitingReason) => {
    if (busy) return;
    const rollback = pending;
    setBusy(true);
    setFailed(null);
    setEnded(null);
    setPickOther(false);
    setPending({ active: true, reason: next, since_ts: nowTs() });
    try {
      const res = await opApi.startWaiting({ reason: next, task_id: taskId ?? undefined });
      const startedAt = res?.started_at ?? res?.wait?.started_at ?? nowTs();
      setPending({ active: true, reason: (res?.wait?.reason as WaitingReason) ?? next, since_ts: startedAt });
      onChanged?.();
    } catch (e) {
      setPending(rollback);
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    const rollback = pending;
    const wasReason = m.recordedAs;
    const localMinutes = elapsedS / 60;
    setBusy(true);
    setFailed(null);
    setPending({ active: false, reason: (reason as WaitingReason) ?? DEFAULT_REASON, since_ts: 0 });
    try {
      const res = await opApi.stopWaiting();
      setEnded({ minutes: res?.minutes ?? res?.wait?.minutes ?? localMinutes, reason: wasReason });
      onChanged?.();
    } catch (e) {
      setPending(rollback);
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cx('panel space-y-3 p-4', className)} aria-label="Waiting time">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-label-lg uppercase text-on-surface-muted">
          <Icon name="hourglass_top" size={22} />
          Waiting time
        </h2>
        <span className="font-display text-label-lg uppercase text-on-surface">
          Waiting today <span className="tnum">{fmtMinutes(todayTotal)}</span>
        </span>
      </div>

      {active ? (
        <div className="space-y-3 border-2 border-notice bg-notice/10 p-3" role="status">
          <div className="flex items-center gap-2 font-display text-headline-sm uppercase text-on-surface">
            <Icon name={m.icon} size={28} />
            {m.label}
          </div>
          <div>
            <div className="font-display text-headline-xl tnum text-on-surface" role="timer" aria-live="off">
              {fmtClock(elapsedS)}
            </div>
            <div className="font-display text-label-md uppercase text-on-surface-muted">
              {elapsedS < 3600 ? 'minutes : seconds' : 'hours : minutes : seconds'}
              {since ? (
                <>
                  {' · since '}
                  <GmtTime ts={since} gmt={waiting?.since_gmt ?? undefined} />
                </>
              ) : null}
            </div>
          </div>
          <p className="text-body-md text-on-surface">
            This time is recorded as {m.recordedAs}, not as your idle time. Your supervisor sees the reason next to it.
          </p>
          <Button
            variant="primary"
            size="xl"
            icon="play_arrow"
            block
            className="h-20"
            aria-pressed
            disabled={busy}
            onClick={() => void stop()}
          >
            {busy ? 'Recording…' : m.stop}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            aria-pressed={false}
            disabled={busy}
            onClick={() => void start(DEFAULT_REASON)}
            className={cx(
              'flex min-h-[80px] w-full items-center justify-center gap-3 border-2 border-outline-strong bg-surface-container-lowest px-4',
              'font-display text-headline-sm uppercase text-on-surface transition-colors',
              'hover:border-notice-dark hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <Icon name={WAIT_REASONS.waiting_for_truck.icon} size={30} />
            {busy ? 'Recording…' : 'Waiting for truck'}
          </button>
          <p className="text-body-md text-on-surface-muted">
            Tap when you are held up. The time is recorded as waiting, not as your idle time. You can do this with or without
            a task in progress.
          </p>

          <button
            type="button"
            aria-expanded={pickOther}
            onClick={() => setPickOther((p) => !p)}
            className={cx(
              '-ml-2 inline-flex items-center gap-2 px-2 font-display text-label-lg uppercase text-on-surface-variant underline',
              TOUCH,
            )}
          >
            <Icon name={pickOther ? 'expand_less' : 'expand_more'} size={24} />
            Waiting for something else
          </button>
          {pickOther && (
            <div className="grid gap-2">
              {OTHER_REASONS.map((r) => (
                <Button
                  key={r}
                  variant="secondary"
                  size="cab"
                  icon={WAIT_REASONS[r].icon}
                  block
                  disabled={busy}
                  onClick={() => void start(r)}
                >
                  {WAIT_REASONS[r].label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {byReason.length > 1 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 border-t border-outline pt-3 text-body-md text-on-surface-variant">
          {byReason.map(([r, mins]) => (
            <div key={r} className="flex items-center gap-1.5">
              <Icon name={meta(r).icon} size={20} className="text-on-surface-muted" />
              <dt>{meta(r).label}</dt>
              <dd className="tnum text-on-surface">{fmtMinutes(mins ?? 0)}</dd>
            </div>
          ))}
        </dl>
      )}

      {ended && (
        <Note tone="ok" icon="check_circle" title="Waiting ended">
          {ended.minutes === null ? 'Recorded' : `${fmtMinutes(ended.minutes)} recorded`} as {ended.reason}. It is not counted
          as your idle time.
        </Note>
      )}

      {failed && (
        <Note tone="danger" icon="error" title="Not recorded" role="alert">
          {failed} Nothing was changed — try again when you have a signal.
        </Note>
      )}
    </section>
  );
}

export default WaitingControl;
