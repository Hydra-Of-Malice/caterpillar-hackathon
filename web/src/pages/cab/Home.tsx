import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EtaDrivers } from '../../components/EtaRangeBar';
import { SignalWordChip } from '../../components/SignalWordChip';
import { TaskCard } from '../../components/TaskCard';
import { Button, Icon, Loading, Modal, ProgressBar } from '../../components/ui';
import { edge } from '../../lib/api';
import { fmtClock, fmtDate, fmtDur } from '../../lib/format';
import { useNow, useResource } from '../../lib/hooks';
import { liveNow, useLive } from '../../lib/live';
import { useShift } from '../../lib/shift';
import type { Task } from '../../lib/types';

const BREAK_LIMIT_MIN = 120;

/** Screen 2 — Operator Home: today's tasks with estimates, one primary action (Go to operate). */
export default function CabHome() {
  useNow(5000);
  const nav = useNavigate();
  const live = useLive();
  const { data: shift } = useShift();
  const { data: tasks, loading } = useResource(() => edge.tasks(), [], 30_000);
  const { data: history } = useResource(() => edge.alerts(false), []);
  const [why, setWhy] = useState<Task | null>(null);
  const now = liveNow();

  const start = shift?.shift.planned_start_ts ?? now - 6600;
  const end = shift?.shift.planned_end_ts ?? now + 24000;
  const elapsedPct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  const contMin = live.snapshot?.continuous_operation_min ?? shift?.continuous_operation_min ?? 0;
  const snapTask = live.snapshot?.task;
  const list = (tasks ?? shift?.tasks ?? []).map((t) =>
    snapTask && snapTask.task_id === t.task_id ? { ...t, done_qty: snapTask.done_qty, progress_pct: snapTask.progress_pct, estimate: live.lastEta?.task_id === t.task_id ? live.lastEta : t.estimate } : t,
  );
  const recent = [...live.alerts, ...(history ?? [])]
    .filter((a, i, arr) => arr.findIndex((b) => b.alert_id === a.alert_id) === i && a.tier !== 'T0')
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 3);
  const cl = shift?.checklist_status;
  const toBreak = Math.max(0, Math.round(BREAK_LIMIT_MIN - contMin));

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-end justify-between gap-8">
        <h1 className="font-display text-headline-lg">
          {fmtDate(now)} · {fmtClock(start)}–{fmtClock(end)}
        </h1>
        <div className="w-80">
          <ProgressBar pct={elapsedPct} height="h-2" className="border-0 p-0" />
          <div className="mt-1 text-right text-body-md text-on-surface-muted">{Math.round(elapsedPct)}% of shift</div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-8 space-y-4">
          {loading && !list.length ? <Loading label="Loading tasks" /> : list.map((t) => <TaskCard key={t.task_id} task={t} nowTs={now} onWhy={setWhy} />)}
        </section>

        <aside className="col-span-4 space-y-4">
          <Button variant="primary" size="xl" block icon="play_arrow" className="h-24 text-headline-lg" onClick={() => nav('/cab/operate')}>
            Go to operate
          </Button>

          <div className="panel divide-y divide-outline">
            <Link to="/cab/checklist" className="flex items-center justify-between px-5 py-4 text-body-lg">
              <span className="flex items-center gap-3">
                <Icon name={cl?.passed === false ? 'cancel' : 'check_circle'} className={cl?.passed === false ? 'text-danger-text' : 'text-success-text'} />
                Pre-shift check
              </span>
              <span className="tnum text-on-surface-muted">{cl ? `${cl.passed_count}/${cl.total}` : '—'}</span>
            </Link>
            <div className="px-5 py-4 text-body-lg">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <Icon name="coffee" className="text-on-surface-muted" /> Break
                </span>
                <span className={contMin >= BREAK_LIMIT_MIN ? 'text-warning-text' : 'text-on-surface-muted'}>{contMin >= BREAK_LIMIT_MIN ? 'Due now' : `in ${fmtDur(toBreak)}`}</span>
              </div>
              <ProgressBar pct={(contMin / BREAK_LIMIT_MIN) * 100} tone={contMin >= BREAK_LIMIT_MIN ? 'orange' : 'yellow'} className="mt-3 border-0 p-0" height="h-1.5" />
            </div>
          </div>

          <div className="panel px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-headline-sm">Recent alerts</span>
              <Link to="/incidents?operator_id=OP-1042" className="font-display text-label-md uppercase text-notice-dark hover:underline">
                Log
              </Link>
            </div>
            <ul className="space-y-3">
              {recent.map((a) => (
                <li key={a.alert_id} className="flex items-center gap-3 text-body-md">
                  <SignalWordChip word={a.signal_word} tier={a.tier} size="sm" />
                  <span className="tnum text-on-surface-muted">{fmtClock(a.ts)}</span>
                  <span className="truncate">{(a.what ?? '').charAt(0) + (a.what ?? '').slice(1).toLowerCase()}</span>
                </li>
              ))}
              {!recent.length && <li className="text-body-md text-on-surface-muted">No alerts this shift.</li>}
            </ul>
          </div>

          <Link to="/cab/review" className="flex items-center justify-between px-1 text-body-lg text-notice-dark hover:underline">
            <span>3 coaching tips saved for after your shift</span>
            <Icon name="arrow_forward" />
          </Link>
        </aside>
      </div>

      <Modal open={!!why} onClose={() => setWhy(null)} title={`Why this estimate? · ${why?.name ?? ''}`} width="max-w-[720px]">
        {why?.estimate && (
          <div className="space-y-5">
            <div className="font-display text-headline-md">
              {fmtDur(why.estimate.p50_min)} likely <span className="text-on-surface-muted">({fmtDur(why.estimate.p10_min)} – {fmtDur(why.estimate.p90_min)})</span>
            </div>
            <p className="text-body-md text-on-surface-variant">8 in 10 similar tasks finished inside this range{why.estimate.n_similar ? ` (${why.estimate.n_similar} similar tasks)` : ''}.</p>
            {why.estimate.drivers.length > 0 && <EtaDrivers drivers={why.estimate.drivers} />}
            {why.estimate.low_data && <p className="text-body-md text-warning-text">Few similar tasks — wider range.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
