/**
 * One task as a compact row that opens in place.
 *
 * The operator app is used on a phone, one-handed, often in a cab. A full card per task meant three
 * tasks filled the screen and the answer to "what am I on next?" needed a scroll. Collapsed, a row
 * is a number, the title and the one thing that matters about it — its state, or the button that
 * starts it. Tapping opens the rest underneath.
 *
 * `T1`, `T2`, `T3` number the tasks in the order they are listed, so an operator and their
 * supervisor can say "T2" on the radio and mean the same task. The number is positional, not an id:
 * it is a label for this screen today, and the row carries the real title beside it.
 *
 * The task in progress opens by default and keeps a yellow edge — it is the one being worked on, and
 * it should not have to be found.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Chip, Icon, ProgressBar, cx } from '../../../components/ui';
import { GmtTime } from '../../components';
import type { TcTask } from '../../types';
import { TOUCH } from './common';
import { STATUS_LABEL, checklistChip, statusChip, taskProgress } from './model';
import { TaskTimer } from './TaskTimer';

export function TaskRow({
  task,
  index,
  now,
  onStart,
  busy = false,
}: {
  task: TcTask;
  /** 1-based position in the list; rendered as T1, T2, T3. */
  index: number;
  now: number;
  onStart?: (task: TcTask) => void;
  busy?: boolean;
}) {
  const ongoing = task.status === 'ongoing';
  const [open, setOpen] = useState(ongoing);

  // If a task becomes the one in progress while this screen is open, open it.
  useEffect(() => {
    if (ongoing) setOpen(true);
  }, [ongoing]);

  const p = taskProgress(task);
  const chip = statusChip(task.status);
  const cl = checklistChip(task.checklist);
  const live = task.status === 'pending' || task.status === 'ongoing';
  const late = live && (task.overdue ?? now > task.expected_finish_ts);
  const canStart = task.status === 'pending' && !!onStart;
  const blocked = task.checklist?.blocked === true;
  const checkedOff = task.checklist?.completed === true;

  return (
    <li
      className={cx(
        'panel overflow-hidden',
        ongoing && 'border-l-4 border-l-cat',
        (task.status === 'completed' || task.status === 'cancelled') && 'opacity-70',
      )}
    >
      {/* ---------------------------------------------------- the row itself */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx('flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-container-high', TOUCH)}
      >
        <span
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center font-display text-label-lg tabular-nums',
            ongoing ? 'bg-cat text-black' : 'border border-outline-variant text-on-surface-variant',
          )}
          aria-hidden
        >
          T{index}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-body-lg text-on-surface">
            <span className="sr-only">Task {index}: </span>
            {task.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Chip icon={chip.icon} tone={chip.tone}>
              {STATUS_LABEL[task.status] ?? task.status}
            </Chip>
            {late && (
              <Chip icon="warning" tone="orange">
                Past finish
              </Chip>
            )}
            {task.priority === 'urgent' && (
              <Chip icon="priority_high" tone="red">
                Urgent
              </Chip>
            )}
          </span>
        </span>

        <Icon name={open ? 'expand_less' : 'expand_more'} size={26} className="shrink-0 text-on-surface-muted" />
      </button>

      {/* ---------------------------------------------------- the rest of it */}
      {open && (
        <div className="border-t border-outline px-3 pb-3 pt-3">
          <dl className="space-y-1.5 text-body-md text-on-surface-variant">
            <div className="flex items-center gap-2">
              <Icon name="location_on" size={20} className="shrink-0 text-on-surface-muted" />
              <dt className="sr-only">Where</dt>
              <dd className="min-w-0 truncate">{task.location || 'Location not given'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="precision_manufacturing" size={20} className="shrink-0 text-on-surface-muted" />
              <dt className="sr-only">Machine</dt>
              <dd>{task.machine_id ?? 'No machine assigned'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Icon name="schedule" size={20} className="shrink-0 text-on-surface-muted" />
              <dt className="sr-only">Finish by</dt>
              <dd>
                Finish by <GmtTime ts={task.expected_finish_ts} gmt={task.expected_finish_gmt} />
              </dd>
            </div>
          </dl>

          <TaskTimer task={task} />

          {p.total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between font-display text-label-md uppercase text-on-surface-muted">
                <span>Checkpoints</span>
                <span className="tnum text-on-surface">
                  {p.done}/{p.total}
                </span>
              </div>
              <ProgressBar pct={(p.done / p.total) * 100} tone={p.done === p.total ? 'green' : 'yellow'} className="mt-1" />
            </div>
          )}

          {live && (
            <div className="mt-3 flex items-center gap-2 text-body-md text-on-surface-variant">
              <Icon name={cl.icon} size={20} className="shrink-0 text-on-surface-muted" />
              <span>{cl.text}</span>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {canStart && (
              <Button
                variant={blocked ? 'secondary' : 'primary'}
                size="lg"
                icon={blocked ? 'block' : checkedOff ? 'play_arrow' : 'fact_check'}
                block
                disabled={busy}
                onClick={() => onStart?.(task)}
              >
                {busy ? 'Starting…' : blocked ? 'Pre-start check blocked' : checkedOff ? 'Start task' : 'Start task — pre-start check'}
              </Button>
            )}
            <Link to={`/tc/op/task/${task.task_id}`} className="block">
              <Button size="lg" icon="open_in_new" iconRight="chevron_right" block>
                {ongoing ? 'Open — checkpoints and finish' : 'Open task'}
              </Button>
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

export default TaskRow;
