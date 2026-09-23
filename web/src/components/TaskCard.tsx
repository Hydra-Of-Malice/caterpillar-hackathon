import { Link } from 'react-router-dom';
import { fmtDur } from '../lib/format';
import type { Task } from '../lib/types';
import { EtaRangeBar } from './EtaRangeBar';
import { SignalIcon } from './SignalWordChip';
import { Button, ProgressBar, cx } from './ui';

const STATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'In progress', cls: 'text-cat-text' },
  queued: { label: 'Queued', cls: 'text-on-surface-muted' },
  done: { label: 'Done', cls: 'text-success-text' },
  paused: { label: 'Paused', cls: 'text-warning-text' },
};

/** Home task card: priority, name, progress and the P10–P90 estimate. Details sit behind "Why?". */
export function TaskCard({ task, nowTs, onWhy }: { task: Task; nowTs: number; onWhy?: (t: Task) => void }) {
  const st = STATUS[task.status] ?? STATUS.queued;
  const active = task.status === 'in_progress';
  const est = task.estimate;
  const unit = (task.unit ?? '').replace('m3', 'm³');
  const isTrench = task.volume_planned_m3 != null;
  const mainDone = isTrench ? task.volume_done_m3! : (task.done_qty ?? 0);
  const mainPlanned = isTrench ? task.volume_planned_m3! : task.planned_qty;
  const mainUnit = isTrench ? 'm³' : unit;
  return (
    <article className={cx('panel relative p-6', active && 'pl-7')}>
      {active && <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-cat" />}
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-headline-md">
          <span className="mr-3 text-on-surface-muted">{task.priority}</span>
          {task.name}
        </h3>
        <span className={cx('shrink-0 font-display text-label-lg uppercase', st.cls)}>{st.label}</span>
      </div>

      {task.type !== 'stockpile' && (
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-body-lg">
            <span className="tnum">
              {Math.round(mainDone)} / {Math.round(mainPlanned)} {mainUnit}
            </span>
            <span className="font-display tnum">{Math.round(task.progress_pct)}%</span>
          </div>
          <ProgressBar pct={task.progress_pct} className="border-0 p-0" height="h-2" />
          {isTrench && (
            <div className="mt-1 text-body-sm text-on-surface-muted tnum">
              {Math.round(task.done_qty ?? 0)} / {task.planned_qty} m of trench
            </div>
          )}
        </div>
      )}

      {est && (
        <div className="mt-5">
          {active ? (
            <EtaRangeBar estimate={est} nowTs={nowTs} compact showWhy={onWhy ? () => onWhy(task) : undefined} />
          ) : (
            <div className="flex items-center justify-between text-body-lg">
              <span>
                Est. {fmtDur(est.p50_min)} <span className="text-on-surface-muted">({fmtDur(est.p10_min)} – {fmtDur(est.p90_min)})</span>
              </span>
              {onWhy && (
                <button type="button" onClick={() => onWhy(task)} className="font-display text-label-md uppercase text-notice-dark hover:underline">
                  Why?
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {task.first_on_site && task.required_module && (
        <div className="mt-5 flex items-center gap-4 bg-caution px-4 py-3 text-black">
          <SignalIcon word="CAUTION" size={28} />
          <span className="flex-1 text-body-lg">First trench on this site — 4-min module “{task.required_module_title ?? 'Trenching near edges'}”</span>
          <Link to={`/training/module/${task.required_module}`}>
            <Button variant="secondary" size="lg" icon="play_circle" className="h-14 border-black bg-transparent text-black hover:bg-black/10">
              Start module
            </Button>
          </Link>
        </div>
      )}
    </article>
  );
}
