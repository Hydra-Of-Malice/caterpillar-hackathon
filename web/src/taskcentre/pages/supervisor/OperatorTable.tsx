/**
 * The team, one row each: who, which machine, where they last reported from, how their work stands,
 * unread messages, and the two things a supervisor does about it — add a task, edit one.
 *
 * Two layouts, because six columns and a phone cannot both be honoured:
 *
 *  - **`sm` and up** a table sized to its container, with no horizontal scroll. The fit comes from
 *    the compact location cell (status and age, not the full fix) and icon-only action buttons;
 *    shrinking the type alone would not have bought it.
 *  - **below `sm`** one card per operator. A six-column table at 375px is unreadable at any font
 *    size, and a card keeps every field with its own label instead of a header row scrolled off.
 *
 * "Task update" expands in place rather than navigating away, because the question it answers
 * ("what is Ravi actually doing?") is asked while reading the row above it. The expansion shows the
 * tasks split by state **and whatever the operator themselves wrote** — their progress notes are the
 * only account of the work that comes from the person doing it, and they belong next to the counts
 * rather than two clicks away.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GmtTime, PriorityChip } from '../../components';
import type { SupOperatorRow, TaskProgress, TcTask } from '../../types';
import { Button, Icon } from '../../../components/ui';
import { BUCKET, BUCKETS, CheckpointProgress, Chip, LocationLine, TaskStatusChip, cx, exclusiveBucket, operatorName, type Bucket } from './common';

interface Props {
  operators: SupOperatorRow[];
  tasks: TcTask[];
  now: number;
  onAddTask: (op: SupOperatorRow) => void;
  onEditTask: (op: SupOperatorRow) => void;
}

type Counts = Record<Bucket, number>;

const countsFor = (tasks: TcTask[], now: number): Counts =>
  BUCKETS.reduce<Counts>(
    (acc, b) => ({ ...acc, [b]: tasks.filter((t) => exclusiveBucket(t, now) === b).length }),
    { completed: 0, ongoing: 0, pending: 0, overdue: 0 },
  );

const total = (c: Counts) => BUCKETS.reduce((n, b) => n + c[b], 0);

export function OperatorTable({ operators, tasks, now, onAddTask, onEditTask }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const forOp = (op: SupOperatorRow) => tasks.filter((t) => t.operator_id === op.user_id);

  return (
    <>
      {/* ------------------------------------------------ phones: one card each */}
      <ul className="space-y-3 sm:hidden">
        {operators.map((op) => (
          <OperatorCard
            key={op.user_id}
            op={op}
            tasks={forOp(op)}
            now={now}
            open={openId === op.user_id}
            onToggle={() => setOpenId(openId === op.user_id ? null : op.user_id)}
            onAddTask={() => onAddTask(op)}
            onEditTask={() => onEditTask(op)}
          />
        ))}
      </ul>

      {/* ------------------------------------------------ sm and up: a table that fits */}
      <table className="hidden w-full table-fixed border-collapse text-left sm:table">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[10%]" />
          <col className="w-[22%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-outline">
            {['Operator', 'Machine', 'Location', 'Task update', 'Messages', ''].map((h, i) => (
              <th key={h || i} className="px-2 py-2.5 font-body text-body-sm font-semibold text-on-surface-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {operators.map((op) => (
            <Row
              key={op.user_id}
              op={op}
              tasks={forOp(op)}
              now={now}
              open={openId === op.user_id}
              onToggle={() => setOpenId(openId === op.user_id ? null : op.user_id)}
              onAddTask={() => onAddTask(op)}
              onEditTask={() => onEditTask(op)}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The task-state dots the "Task update" control shows before it is expanded. */
function CountDots({ counts, open }: { counts: Counts; open: boolean }) {
  return total(counts) === 0 ? (
    <span className="text-on-surface-muted">None today</span>
  ) : (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {BUCKETS.filter((b) => counts[b] > 0).map((b) => (
        <span key={b} className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BUCKET[b].color }} aria-hidden />
          <span className="tnum text-on-surface">{counts[b]}</span>
          <span className="sr-only">{BUCKET[b].label}</span>
        </span>
      ))}
      <Icon name={open ? 'expand_less' : 'expand_more'} size={16} className="text-on-surface-muted" />
    </span>
  );
}

function MessagesLink({ op }: { op: SupOperatorRow }) {
  const unread = op.unread_messages ?? 0;
  return (
    <Link
      to={`operator/${op.user_id}`}
      className={cx(
        'inline-flex items-center gap-1.5 text-body-sm',
        unread > 0 ? 'font-semibold text-notice-dark hover:underline' : 'text-on-surface-muted hover:underline',
      )}
    >
      <Icon name={unread > 0 ? 'mark_chat_unread' : 'chat_bubble'} size={18} />
      {unread > 0 ? `${unread} unread` : 'Message'}
    </Link>
  );
}

function Row({
  op,
  tasks,
  now,
  open,
  onToggle,
  onAddTask,
  onEditTask,
}: {
  op: SupOperatorRow;
  tasks: TcTask[];
  now: number;
  open: boolean;
  onToggle: () => void;
  onAddTask: () => void;
  onEditTask: () => void;
}) {
  const machine = op.machine_id ?? op.user?.machine_id;
  const counts = countsFor(tasks, now);

  return (
    <>
      <tr className={cx('border-b border-outline align-top', open && 'bg-surface-container-high')}>
        <td className="px-2 py-3">
          <Link to={`operator/${op.user_id}`} className="block truncate text-body-md font-semibold text-on-surface hover:underline">
            {operatorName(op)}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 text-body-sm text-on-surface-muted">
            <span className="truncate">{op.username ?? op.user?.username ?? op.user_id}</span>
            {op.active_alarm && (
              <Chip tone="red" icon="emergency_home">
                Alarm
              </Chip>
            )}
          </div>
        </td>

        <td className="truncate px-2 py-3 text-body-sm">
          {machine ? <span className="text-on-surface">{machine}</span> : <span className="text-on-surface-muted">&mdash;</span>}
        </td>

        <td className="px-2 py-3">
          <LocationLine location={op.location} now={now} fallbackStatus={op.geofence_status} stale={op.stale} compact />
        </td>

        <td className="px-2 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex w-full items-center rounded border border-outline-variant px-2 py-1.5 text-left text-body-sm text-on-surface-variant hover:bg-surface-container-high"
          >
            <CountDots counts={counts} open={open} />
          </button>
        </td>

        <td className="px-2 py-3">
          <MessagesLink op={op} />
        </td>

        <td className="px-2 py-3">
          {/* Icon-only here: a labelled pair needs ~190px, and this column is ~90px at the width the
              table actually gets. Both carry a title and an aria-label naming the operator, and the
              phone layout below keeps the words. */}
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              icon="add"
              onClick={onAddTask}
              title={`Add a task for ${operatorName(op)}`}
              aria-label={`Add a task for ${operatorName(op)}`}
              className="!px-2"
            />
            <Button
              size="sm"
              icon="edit"
              onClick={onEditTask}
              disabled={tasks.length === 0}
              title={tasks.length === 0 ? `${operatorName(op)} has no tasks to edit` : `Edit a task for ${operatorName(op)}`}
              aria-label={`Edit a task for ${operatorName(op)}`}
              className="!px-2"
            />
          </div>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-outline bg-surface-container-low">
          <td colSpan={6} className="px-2 py-4">
            <TaskUpdate tasks={tasks} now={now} who={operatorName(op)} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The phone layout: every field keeps its own label instead of a header row scrolled out of view. */
function OperatorCard({
  op,
  tasks,
  now,
  open,
  onToggle,
  onAddTask,
  onEditTask,
}: {
  op: SupOperatorRow;
  tasks: TcTask[];
  now: number;
  open: boolean;
  onToggle: () => void;
  onAddTask: () => void;
  onEditTask: () => void;
}) {
  const machine = op.machine_id ?? op.user?.machine_id;
  const counts = countsFor(tasks, now);

  return (
    <li className="border border-outline bg-surface-container-low p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`operator/${op.user_id}`} className="block truncate text-body-lg font-semibold text-on-surface hover:underline">
            {operatorName(op)}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 text-body-sm text-on-surface-muted">
            <span>{op.username ?? op.user?.username ?? op.user_id}</span>
            {machine && <span>· {machine}</span>}
            {op.active_alarm && (
              <Chip tone="red" icon="emergency_home">
                Alarm
              </Chip>
            )}
          </div>
        </div>
        <MessagesLink op={op} />
      </div>

      <div className="mt-2.5">
        <LocationLine location={op.location} now={now} fallbackStatus={op.geofence_status} stale={op.stale} compact />
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mt-2.5 flex w-full items-center justify-between gap-2 rounded border border-outline-variant px-2.5 py-2 text-left text-body-sm text-on-surface-variant hover:bg-surface-container-high"
      >
        <span className="text-on-surface-muted">Task update</span>
        <CountDots counts={counts} open={open} />
      </button>

      {open && (
        <div className="mt-3 border-t border-outline pt-3">
          <TaskUpdate tasks={tasks} now={now} who={operatorName(op)} />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" icon="add" onClick={onAddTask} className="flex-1">
          Add task
        </Button>
        <Button size="sm" icon="edit" onClick={onEditTask} disabled={tasks.length === 0} className="flex-1">
          Edit task
        </Button>
      </div>
    </li>
  );
}

/** The expansion: this operator's work by state, then what they wrote about it. */
function TaskUpdate({ tasks, now, who }: { tasks: TcTask[]; now: number; who: string }) {
  if (tasks.length === 0) {
    return <p className="text-body-md text-on-surface-muted">No tasks have been assigned to {who} today.</p>;
  }

  const notes = tasks
    .flatMap((t) => (t.progress ?? []).map((p) => ({ ...p, task_title: t.title })))
    .filter((p) => p.kind === 'note' || p.kind === 'delay')
    .sort((a, b) => b.ts - a.ts);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {BUCKETS.map((b) => {
          const mine = tasks.filter((t) => exclusiveBucket(t, now) === b);
          if (mine.length === 0) return null;
          return (
            <div key={b}>
              <h4 className="mb-1.5 flex items-center gap-2 text-body-sm font-semibold text-on-surface-variant">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BUCKET[b].color }} aria-hidden />
                {BUCKET[b].label}
                <span className="tnum font-normal text-on-surface-muted">{mine.length}</span>
              </h4>
              <ul className="divide-y divide-outline border-t border-outline">
                {mine.map((t) => (
                  <li key={t.task_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-md text-on-surface">{t.title}</span>
                      <span className="block text-body-sm text-on-surface-muted">
                        {t.location || 'No location given'}
                        {t.machine_id ? ` · ${t.machine_id}` : ''} · finish by{' '}
                        <GmtTime ts={t.expected_finish_ts} gmt={t.expected_finish_gmt} mode="smart" />
                      </span>
                    </span>
                    <CheckpointProgress list={t.checkpoints} />
                    <PriorityChip priority={t.priority} />
                    <TaskStatusChip task={t} now={now} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div>
        <h4 className="mb-1.5 text-body-sm font-semibold text-on-surface-variant">What {who} reported</h4>
        {notes.length === 0 ? (
          <p className="text-body-sm text-on-surface-muted">
            No notes from {who} today. Silence is not a finding — ask before reading anything into it.
          </p>
        ) : (
          <ul className="space-y-2.5 border-t border-outline pt-2.5">
            {notes.slice(0, 8).map((n: TaskProgress & { task_title: string }, i) => (
              <li key={n.id ?? `${n.task_id}-${n.ts}-${i}`}>
                <p className="text-body-sm text-on-surface">{n.text}</p>
                <p className="text-body-sm text-on-surface-muted">
                  {n.task_title} · <GmtTime ts={n.ts} gmt={n.ts_gmt} mode="smart" />
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default OperatorTable;
