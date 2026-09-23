import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertBanner } from '../../components/AlertBanner';
import { RangeBar } from '../../components/EtaRangeBar';
import { ProximityZoneDiagram, type ProximityMode } from '../../components/ProximityZoneDiagram';
import { SignalIcon } from '../../components/SignalWordChip';
import { Button, Icon, Modal, ProgressBar, cx, toast } from '../../components/ui';
import { ApiError, edge } from '../../lib/api';
import { fmtClock, fmtDur } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { acknowledge, liveNow, setWaitingForTruck, snooze, useBannerAlert, useLive } from '../../lib/live';
import { useShift } from '../../lib/shift';
import type { Alert } from '../../lib/types';

const REASONS = ['Truck reversed early', 'I was not near the truck', 'Spotter directed the swing', 'Other'];

/**
 * Screen 4 — OPERATE (no scrolling at 1280×800). Only: the alert slot, current task with progress
 * and ETA, the proximity diagram, seatbelt / idle / operating time, the Waiting-for-truck toggle and
 * the three bottom actions (from the cab frame). Alert states 5a–5f are driven by live data.
 */
export default function Operate() {
  useNow(1000);
  const nav = useNavigate();
  const live = useLive();
  const { data: shift } = useShift();
  const { current, queued, supervisorNotified } = useBannerAlert();
  const [feedbackFor, setFeedbackFor] = useState<Alert | null>(null);
  const [snoozeUsed, setSnoozeUsed] = useState(false);
  const snap = live.snapshot;
  const task = snap?.task ?? null;
  const eta = snap?.eta ?? live.lastEta ?? shift?.tasks.find((t) => t.status === 'in_progress')?.estimate ?? null;
  const now = liveNow();
  const contMin = snap?.continuous_operation_min ?? shift?.continuous_operation_min ?? 0;

  const proxFault = snap?.proximity.status === 'fault' || (live.protection.state === 'degraded' && /proximity/i.test(live.protection.reason ?? ''));
  const mode: ProximityMode = snap && !snap.proximity.fitted ? 'not_fitted' : proxFault || (live.protection.state === 'degraded' && !live.heartbeat.lastAt) ? 'no_signal' : 'active';
  const waiting = live.waitingForTruck;
  const seatbeltOk = snap?.seatbelt !== false;

  const r10 = eta ? now + (eta.remaining_p10_min ?? eta.p10_min) * 60 : 0;
  const r50 = eta ? now + (eta.remaining_p50_min ?? eta.p50_min) * 60 : 0;
  const r90 = eta ? now + (eta.remaining_p90_min ?? eta.p90_min) * 60 : 0;

  const sendFeedback = async (reason: string) => {
    if (!feedbackFor) return;
    try {
      await edge.alertFeedback(feedbackFor.alert_id, false, reason);
      toast('Thanks — feedback saved for review');
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) toast('Saved — you can add detail when the machine is stopped', 'info');
      else toast('Feedback saved', 'info');
    }
    await acknowledge(feedbackFor);
    setFeedbackFor(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4">
      <AlertBanner
        alert={current}
        queued={queued}
        actions={{
          onAck: (a) => void acknowledge(a),
          onNotCorrect: setFeedbackFor,
          onStartBreak: async (a) => {
            await acknowledge(a);
            nav('/cab/break');
          },
          onSnooze: (a) => {
            setSnoozeUsed(true);
            void snooze(a, 10, `Supervisor will be notified at ${fmtDur(contMin + 15)}`);
          },
          snoozeUsed,
        }}
      />
      {(live.escalationNotice || supervisorNotified) && (
        <div className="flex items-center gap-2 self-start bg-escalation/15 px-3 py-2 font-display text-label-lg uppercase text-escalation-text">
          <SignalIcon word="SUPERVISOR NOTIFIED" size={22} ink="currentColor" />
          {live.escalationNotice ?? `Supervisor notified — ${supervisorNotified?.what}`}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        {/* CURRENT TASK */}
        <section className="panel flex min-h-0 flex-col justify-between p-6">
          <div>
            <div className="font-display text-headline-sm uppercase text-on-surface-muted">{task?.name ?? 'No active task'}</div>
            <div className="mt-4 flex items-baseline justify-between">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-[72px] font-bold leading-none tnum">{Math.round(task?.volume_done_m3 ?? task?.done_qty ?? 0)}</span>
                <span className="font-display text-headline-lg text-on-surface-muted">
                  / {Math.round(task?.volume_planned_m3 ?? task?.planned_qty ?? 0) || '—'} {task?.volume_planned_m3 != null ? 'm³' : (task?.unit ?? 'm³').replace('m3', 'm³')}
                </span>
              </div>
              <span className="font-display text-headline-lg tnum">{Math.round(task?.progress_pct ?? 0)}%</span>
            </div>
            <ProgressBar pct={task?.progress_pct ?? 0} height="h-4" className="mt-4 border-0 p-0" />
            {task?.volume_planned_m3 != null && (
              <div className="mt-2 text-body-md text-on-surface-muted tnum">
                {Math.round(task.done_qty)} / {task.planned_qty} m of trench
              </div>
            )}
          </div>
          {eta && (
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="font-display text-headline-md">Finish {fmtClock(r50)}</span>
                <span className="text-body-lg text-on-surface-muted">
                  likely {fmtClock(r10)}–{fmtClock(r90)}
                </span>
              </div>
              <RangeBar p10={r10} p50={r50} p90={r90} now={now} min={now - (r90 - r10) * 0.15} max={r90 + (r90 - r10) * 0.2} labels={false} />
            </div>
          )}
        </section>

        {/* PROXIMITY + STATUS */}
        <section className="panel flex min-h-0 flex-col gap-4 p-6">
          <ProximityZoneDiagram
            sectors={snap?.proximity.sectors}
            truckM={snap ? snap.proximity.truck_m : null}
            truckSector={snap?.proximity.truck_sector ?? 'left'}
            truckId={snap?.proximity.truck_id ?? null}
            personM={snap?.proximity.person_m}
            personSector={snap?.proximity.person_sector}
            mode={mode}
            lastGoodTs={snap?.proximity.last_good_ts ?? live.protection.lastGoodTs}
            height={230}
            showLegend={false}
          />
          <div className="grid flex-1 grid-cols-12 items-center gap-4">
            <ul className="col-span-7 space-y-3 font-display text-headline-sm uppercase">
              <li className={cx('flex items-center gap-3', !seatbeltOk && 'text-danger-text')}>
                <Icon name={seatbeltOk ? 'check_circle' : 'cancel'} size={28} className={seatbeltOk ? 'text-success-text' : ''} />
                Seatbelt {seatbeltOk ? 'fastened' : 'unfastened'}
              </li>
              <li className="flex items-center gap-3">
                <Icon name="timer_pause" size={28} className="text-on-surface-muted" /> Idle {fmtDur(snap?.idle.today_min ?? 0)}
              </li>
              <li className="flex items-center gap-3">
                <Icon name="timelapse" size={28} className="text-on-surface-muted" /> Since break {fmtDur(contMin)}
              </li>
            </ul>
            <button
              type="button"
              onClick={() => void setWaitingForTruck(!waiting)}
              aria-pressed={waiting}
              className={cx('col-span-5 flex min-h-[88px] flex-col items-center justify-center gap-1 border-2 px-3 transition-colors', waiting ? 'border-notice bg-notice text-white' : 'border-outline-strong hover:border-notice-dark')}
            >
              <span className="flex items-center gap-2 font-display text-headline-sm uppercase">
                <Icon name="local_shipping" size={26} /> {waiting ? 'Waiting' : 'Waiting for truck'}
              </span>
              {waiting && <span className="font-display text-label-md uppercase">Idle not flagged</span>}
            </button>
          </div>
          {live.suppressedIdle && <div className="font-display text-label-md uppercase text-on-surface-muted">{live.suppressedIdle}</div>}
        </section>
      </div>

      <Modal open={!!feedbackFor} onClose={() => setFeedbackFor(null)} title="Not correct?" width="max-w-[640px]">
        <div className="grid grid-cols-2 gap-4">
          {REASONS.map((r) => (
            <Button key={r} variant="secondary" size="cab" onClick={() => void sendFeedback(r)}>
              {r}
            </Button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
