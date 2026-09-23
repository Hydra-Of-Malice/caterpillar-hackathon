/**
 * `/tc/sup` — the supervisor's team.
 *
 * The operator list (machine, today's task counts, last position with its geofence status and age,
 * unread messages), a completed / ongoing / pending / overdue chart whose bars and tiles reveal the
 * tasks behind them, and a summary of the review queue. Polls every `POLL.supervisor`.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { sup } from '../../api';
import { GmtTime, PriorityChip, SeverityChip, SimulatedChip, kindLabel } from '../../components';
import { POLL, PRESENCE_NOTE } from '../../constants';
import { nowTs } from '../../time';
import type { SupOperatorRow, TcTask, Ticket } from '../../types';
import { Button, PageTitle } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { AddOperator } from './AddOperator';
import { TaskCreate } from './TaskCreate';
import {
  BUCKET,
  BUCKETS,
  Card,
  Caveat,
  Chip,
  CheckpointProgress,
  EmptyState,
  Icon,
  LocationLine,
  Stat,
  TABLE,
  TableWrap,
  TaskStatusChip,
  bucketCounts,
  cx,
  gate,
  inBucket,
  operatorName,
  type Bucket,
} from './common';

export default function Dashboard() {
  const now = useNow(5_000) / 1000;
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const team = useResource(() => sup.operators(), [], POLL.supervisor);
  const dash = useResource(() => sup.dashboard(), [], POLL.supervisor);
  const review = useResource(() => sup.review(), [], POLL.supervisor);

  const operators = team.data ?? [];
  const tasks = useMemo(() => dash.data?.tasks ?? [], [dash.data]);
  const counts = useMemo(() => bucketCounts(dash.data?.counts, tasks, now), [dash.data, tasks, now]);
  const rows = BUCKETS.map((b) => ({ key: b, label: BUCKET[b].label, color: BUCKET[b].color, value: counts[b] }));
  const shown = bucket ? tasks.filter((t) => inBucket(t, bucket, now)) : [];

  const openTickets = (review.data ?? []).filter((t) => t.status === 'open');
  const nameOf = (id?: string | null) => {
    const row = operators.find((o) => o.user_id === id);
    return row ? operatorName(row) : (id ?? 'Unknown');
  };

  const refreshAll = () => {
    team.reload();
    dash.reload();
  };

  return (
    <div className="space-y-8">
      <PageTitle
        title="My team"
        sub="Your operators, the work assigned to them today, and anything waiting for your review. Every operational time on this screen is GMT."
        right={
          <>
            <span className="text-body-sm text-on-surface-muted">
              Refreshes every {POLL.supervisor / 1000} s · now <GmtTime ts={nowTs()} />
            </span>
            <Button icon="assignment_add" onClick={() => setTaskOpen(true)} disabled={operators.length === 0}>
              Assign task
            </Button>
            <Button variant="primary" icon="person_add" onClick={() => setAddOpen(true)}>
              Add operator
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------ four numbers, clickable */}
      <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
        {BUCKETS.map((b) => (
          <Stat
            key={b}
            label={BUCKET[b].label}
            value={counts[b]}
            sub={BUCKET[b].hint}
            tone={b === 'overdue' && counts[b] > 0 ? 'red' : b === 'completed' ? 'green' : b === 'ongoing' ? 'blue' : 'neutral'}
            active={bucket === b}
            onClick={() => setBucket((cur) => (cur === b ? null : b))}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_360px]">
        {/* ------------------------------------------------ chart + reveal */}
        <Card title="Tasks across the team" sub="Select a bar, or one of the four numbers above, to see the tasks behind it.">
          {gate(dash, 'The team dashboard', 'Loading team tasks') ?? (
            <>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={92} />
                    <Tooltip cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                    <RBar dataKey="value" name="Tasks" barSize={26} isAnimationActive={false} cursor="pointer" onClick={(d: unknown) => setBucket(barKey(d))}>
                      {rows.map((r) => (
                        <Cell key={r.key} fill={r.color} fillOpacity={bucket && bucket !== r.key ? 0.3 : 1} />
                      ))}
                      <LabelList dataKey="value" position="right" className="recharts-label" />
                    </RBar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-body-sm text-on-surface-muted">
                Overdue counts tasks past their expected finish (GMT), so an ongoing task can appear in two bars.
              </p>

              {bucket && (
                <div className="mt-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-headline-sm text-on-surface">
                      {BUCKET[bucket].label} tasks{' '}
                      <span className="text-on-surface-muted tnum">
                        ({shown.length}
                        {shown.length !== counts[bucket] ? ` of ${counts[bucket]} counted` : ''})
                      </span>
                    </h3>
                    <Button size="sm" icon="close" onClick={() => setBucket(null)}>
                      Clear
                    </Button>
                  </div>
                  {shown.length === 0 ? (
                    <EmptyState icon="assignment" title={`No ${BUCKET[bucket].label.toLowerCase()} tasks`}>
                      {tasks.length === 0
                        ? 'No tasks have been assigned to your team yet. Use Assign task to create the first one.'
                        : 'The dashboard counted some, but the task list it returned holds none.'}
                    </EmptyState>
                  ) : (
                    <TaskTable tasks={shown} now={now} nameOf={nameOf} />
                  )}
                </div>
              )}
            </>
          )}
        </Card>

        {/* ------------------------------------------------ review queue summary */}
        <Card
          title="Review queue"
          sub="AI, location and task overrun flags waiting for you"
          right={
            <Link to="review" className="text-body-sm font-semibold text-notice-dark hover:underline">
              Open queue
            </Link>
          }
        >
          {gate(review, 'The review queue', 'Loading review queue') ?? (
            <>
              <div className="flex items-baseline gap-2">
                <span className={cx('font-display text-headline-lg leading-none tnum', openTickets.length > 0 ? 'text-escalation-text' : 'text-on-surface')}>
                  {openTickets.length}
                </span>
                <span className="text-body-md text-on-surface-muted">open flag{openTickets.length === 1 ? '' : 's'}</span>
              </div>
              {openTickets.length === 0 ? (
                <p className="mt-3 text-body-sm text-on-surface-muted">Nothing waiting. Confirmed and dismissed flags stay in the queue history.</p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['critical', 'high', 'medium', 'low'] as const).map((s) => {
                      const n = openTickets.filter((t) => t.severity === s).length;
                      return n > 0 ? (
                        <span key={s} className="inline-flex items-center gap-1">
                          <SeverityChip severity={s} />
                          <span className="text-body-sm text-on-surface-variant tnum">{n}</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                  <ul className="mt-4 divide-y divide-outline">
                    {openTickets.slice(0, 4).map((t: Ticket) => (
                      <li key={t.ticket_id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-md text-on-surface">{t.title}</span>
                          <SimulatedChip source={t.source} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-body-sm text-on-surface-muted">
                          <span>{kindLabel(t.kind)}</span>
                          <span>· {t.subject_name ?? nameOf(t.subject_user_id)} ·</span>
                          <GmtTime ts={t.created_at} gmt={t.created_at_gmt} mode="smart" />
                        </div>
                      </li>
                    ))}
                  </ul>
                  {openTickets.length > 4 && <p className="mt-2 text-body-sm text-on-surface-muted">and {openTickets.length - 4} more.</p>}
                </>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="review">
                  <Button size="sm" icon="rule">
                    Review queue
                  </Button>
                </Link>
                <Link to="cameras">
                  <Button size="sm" icon="videocam">
                    Cameras
                  </Button>
                </Link>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------ operators */}
      <Card title="Operators" sub={operators.length ? `${operators.length} in your team` : undefined}>
        {gate(team, 'Your team', 'Loading your team') ??
          (operators.length === 0 ? (
            <EmptyState icon="groups" title="No operators in your team yet">
              Add an operator to give them a sign-in, then assign their first task. Nothing is pre-filled: the operator app stays empty until you assign work.
            </EmptyState>
          ) : (
            <TableWrap>
              <table className={cx(TABLE, 'min-w-[880px]')}>
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Machine</th>
                    <th className="min-w-[210px]">Today&rsquo;s tasks</th>
                    <th className="min-w-[250px]">Last position (GMT)</th>
                    <th>Messages</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {operators.map((o) => (
                    <OperatorRow key={o.user_id} op={o} now={now} />
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ))}
      </Card>

      <Caveat icon="location_on">
        {PRESENCE_NOTE} A fix worse than the geofence accuracy limit is shown as unverified, never as outside.
      </Caveat>

      <AddOperator open={addOpen} onClose={() => setAddOpen(false)} onAdded={refreshAll} />
      <TaskCreate open={taskOpen} onClose={() => setTaskOpen(false)} operators={operators} onCreated={refreshAll} />
    </div>
  );
}

/** Recharts hands the bar's datum back either spread or under `payload`. */
function barKey(d: unknown): Bucket | null {
  const o = d as { key?: string; payload?: { key?: string } } | null;
  const k = o?.payload?.key ?? o?.key;
  return k && (BUCKETS as string[]).includes(k) ? (k as Bucket) : null;
}

function OperatorRow({ op, now }: { op: SupOperatorRow; now: number }) {
  const c = op.tasks;
  const unread = op.unread_messages ?? 0;
  return (
    <tr>
      <td>
        <Link to={`operator/${op.user_id}`} className="font-display text-body-lg font-bold text-on-surface hover:underline">
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
      <td className="whitespace-nowrap">
        {op.machine_id ?? op.user?.machine_id ? (
          <span className="font-display text-body-md text-on-surface">{op.machine_id ?? op.user?.machine_id}</span>
        ) : (
          <span className="text-on-surface-muted">Not assigned</span>
        )}
      </td>
      <td>
        {c === undefined ? (
          <span className="text-body-sm text-on-surface-muted">Counts not returned</span>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {BUCKETS.map((b) => (
              <span key={b} className="whitespace-nowrap text-body-sm">
                <span className="text-on-surface-muted">{BUCKET[b].label}</span>{' '}
                <span className={cx('tnum font-semibold', b === 'overdue' && (c[b] ?? 0) > 0 ? 'text-danger-text' : 'text-on-surface')}>{c[b] ?? 0}</span>
              </span>
            ))}
          </div>
        )}
      </td>
      <td>
        <LocationLine location={op.location} now={now} fallbackStatus={op.geofence_status} stale={op.stale} />
      </td>
      <td className="whitespace-nowrap">
        {unread > 0 ? (
          <Chip tone="blue" icon="mark_chat_unread">
            {unread} unread
          </Chip>
        ) : (
          <span className="text-body-sm text-on-surface-muted">None</span>
        )}
      </td>
      <td className="whitespace-nowrap text-right">
        <Link to={`operator/${op.user_id}`} className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          Open <Icon name="chevron_right" size={18} />
        </Link>
      </td>
    </tr>
  );
}

/** The task list revealed by a bar or a tile. */
export function TaskTable({ tasks, now, nameOf }: { tasks: TcTask[]; now: number; nameOf: (id?: string | null) => string }) {
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
