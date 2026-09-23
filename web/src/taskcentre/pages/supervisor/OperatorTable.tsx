/**
 * The team, one row each: who, which machine, where they last reported from, how their work stands,
 * unread messages, and the two things a supervisor does about it — add a task, edit one.
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

export function OperatorTable({ operators, tasks, now, onAddTask, onEditTask }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-left">
        <thead>
          <tr className="border-b border-outline">
            {['Operator', 'Machine', 'Location', 'Task update', 'Messages', ''].map((h, i) => (
              <th
                key={h || i}
                className="whitespace-nowrap px-3 py-2.5 font-body text-body-sm font-semibold text-on-surface-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {operators.map((op) => {
            const mine = tasks.filter((t) => t.operator_id === op.user_id);
            const open = openId === op.user_id;
            return (
              <Row
                key={op.user_id}
                op={op}
                tasks={mine}
                now={now}
                open={open}
                onToggle={() => setOpenId(open ? null : op.user_id)}
                onAddTask={() => onAddTask(op)}
                onEditTask={() => onEditTask(op)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
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
  const unread = op.unread_messages ?? 0;
  const counts = BUCKETS.reduce<Record<Bucket, number>>(
    (acc, b) => ({ ...acc, [b]: tasks.filter((t) => exclusiveBucket(t, now) === b).length }),
    { completed: 0, ongoing: 0, pending: 0, overdue: 0 },
  );
  const total = BUCKETS.reduce((n, b) => n + counts[b], 0);

  return (
    <>
      <tr className={cx('border-b border-outline align-middle', open && 'bg-surface-container-high')}>
        <td className="px-3 py-3">
          <Link to={`operator/${op.user_id}`} className="text-body-md font-semibold text-on-surface hover:underline">
            {operatorName(op)}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
            <span>{op.username ?? op.user?.username ?? op.user_id}</span>
            {op.active_alarm && (
              <Chip tone="red" icon="emergency_home">
                Alarm
              </Chip>
            )}
          </div>
        </td>

        <td className="whitespace-nowrap px-3 py-3 text-body-md">
          {machine ? <span className="text-on-surface">{machine}</span> : <span className="text-on-surface-muted">Not assigned</span>}
        </td>

        <td className="min-w-[230px] px-3 py-3">
          <LocationLine location={op.location} now={now} fallbackStatus={op.geofence_status} stale={op.stale} />
        </td>

        <td className="px-3 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-2 rounded border border-outline-variant px-2.5 py-1.5 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
          >
            {total === 0 ? (
              <span className="text-on-surface-muted">No tasks today</span>
            ) : (
              <span className="flex items-center gap-1.5">
                {BUCKETS.filter((b) => counts[b] > 0).map((b) => (
                  <span key={b} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: BUCKET[b].color }} aria-hidden />
                    <span className="tnum text-on-surface">{counts[b]}</span>
                    <span className="sr-only">{BUCKET[b].label}</span>
                  </span>
                ))}
              </span>
            )}
            <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="text-on-surface-muted" />
          </button>
        </td>

        <td className="whitespace-nowrap px-3 py-3">
          <Link
            to={`operator/${op.user_id}`}
            className={cx('inline-flex items-center gap-1.5 text-body-sm', unread > 0 ? 'font-semibold text-notice-dark hover:underline' : 'text-on-surface-muted hover:underline')}
          >
            <Icon name={unread > 0 ? 'mark_chat_unread' : 'chat_bubble'} size={18} />
            {unread > 0 ? `${unread} unread` : 'Message'}
          </Link>
        </td>

        <td className="whitespace-nowrap px-3 py-3 text-right">
          <div className="inline-flex gap-2">
            <Button size="sm" icon="add" onClick={onAddTask}>
              Add task
            </Button>
            <Button size="sm" icon="edit" onClick={onEditTask} disabled={tasks.length === 0}>
              Edit task
            </Button>
          </div>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-outline bg-surface-container-low">
          <td colSpan={6} className="px-3 py-4">
            <TaskUpdate tasks={tasks} now={now} who={operatorName(op)} />
          </td>
        </tr>
      )}
    </>
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
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
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
