/**
 * The task list revealed by selecting a colour in the team chart or one of the four numbers above it.
 *
 * One row per task with the operator, the priority, the planned window in GMT, how far the
 * checkpoints have got and the task's state — the facts a supervisor needs before starting a
 * conversation about a task, rather than after it.
 */
import { Link } from 'react-router-dom';
import { GmtTime, PriorityChip } from '../../components';
import type { TcTask } from '../../types';
import { CheckpointProgress, TABLE, TableWrap, TaskStatusChip, cx } from './common';

export function TaskTable({
  tasks,
  now,
  nameOf,
}: {
  tasks: TcTask[];
  now: number;
  nameOf: (id?: string | null) => string;
}) {
  const sorted = [...tasks].sort((a, b) => a.expected_finish_ts - b.expected_finish_ts);
  return (
    <TableWrap>
      <table className={cx(TABLE, 'min-w-[860px]')}>
        <thead>
          <tr>
            <th className="min-w-[220px]">Task</th>
            <th>Operator</th>
            <th>Priority</th>
            <th>Start (GMT)</th>
            <th>Expected finish (GMT)</th>
            <th className="min-w-[160px]">Checkpoints</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.task_id}>
              <td>
                <div className="text-body-md text-on-surface">{t.title}</div>
                <div className="text-body-sm text-on-surface-muted">
                  {t.location || 'No location given'}
                  {t.machine_id ? ` · ${t.machine_id}` : ''}
                </div>
              </td>
              <td className="whitespace-nowrap">
                <Link to={`operator/${t.operator_id}`} className="text-notice-dark hover:underline">
                  {t.operator_name ?? nameOf(t.operator_id)}
                </Link>
              </td>
              <td>
                <PriorityChip priority={t.priority} />
              </td>
              <td className="whitespace-nowrap">
                <GmtTime ts={t.start_ts} gmt={t.start_gmt} mode="smart" />
              </td>
              <td className="whitespace-nowrap">
                <GmtTime ts={t.expected_finish_ts} gmt={t.expected_finish_gmt} mode="smart" />
              </td>
              <td>
                <CheckpointProgress list={t.checkpoints} />
              </td>
              <td>
                <TaskStatusChip task={t} now={now} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export default TaskTable;
