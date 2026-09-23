/**
 * `/tc/sup` — the supervisor's team.
 *
 * Laid out as two columns, the left one wider because it carries the work and the right one the
 * flags waiting on a decision:
 *
 *   ┌──────────────────────────┬────────────┐
 *   │ today's work, per person │            │
 *   ├──────────────────────────┤   flags    │
 *   │ the team, row per person │            │
 *   └──────────────────────────┴────────────┘
 *
 * Assign-task and add-operator live where they are used — on an operator's own row and above the
 * team table — rather than in the page header, where they sat next to a title that has nothing to
 * do with either. Polls every `POLL.supervisor`.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sup } from '../../api';
import { GmtTime } from '../../components';
import { POLL, PRESENCE_NOTE } from '../../constants';
import { nowTs } from '../../time';
import type { SupOperatorRow } from '../../types';
import { Button, Drawer, Icon, PageTitle, cx } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { AddOperator } from './AddOperator';
import { TeamEfficiencyTable } from './Efficiency';
import { FlagsPanel, openFlags, worstFlag } from './FlagsPanel';
import { OperatorTable } from './OperatorTable';
import { TaskCreate } from './TaskCreate';
import { TaskEdit } from './TaskEdit';
import { TeamChart, chartRows } from './TeamChart';
import { BUCKET, Card, Caveat, EmptyState, exclusiveBucket, gate, operatorName, type Bucket } from './common';
import { TaskTable } from './TaskTable';

export default function Dashboard() {
  const now = useNow(5_000) / 1000;
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [taskFor, setTaskFor] = useState<SupOperatorRow | null>(null);
  const [editFor, setEditFor] = useState<SupOperatorRow | null>(null);
  const [flagsOpen, setFlagsOpen] = useState(false);

  const team = useResource(() => sup.operators(), [], POLL.supervisor);
  const dash = useResource(() => sup.dashboard(), [], POLL.supervisor);
  const review = useResource(() => sup.review(), [], POLL.supervisor);

  const operators = team.data ?? [];
  const tasks = useMemo(() => dash.data?.tasks ?? [], [dash.data]);
  const rows = useMemo(() => chartRows(operators, tasks, now), [operators, tasks, now]);

  // The chart stacks each task once, so the reveal below it must use the same reading — otherwise
  // selecting "Overdue" would list tasks the bar never drew there.
  const shown = bucket ? tasks.filter((t) => exclusiveBucket(t, now) === bucket) : [];

  const nameOf = (id?: string | null) => {
    const row = operators.find((o) => o.user_id === id);
    return row ? operatorName(row) : (id ?? 'Unknown');
  };

  const reviewBlocked = gate(review, 'The review queue', 'Loading review queue');
  const waiting = openFlags(review.data ?? []);
  const worst = worstFlag(review.data ?? []);

  const refreshAll = () => {
    team.reload();
    dash.reload();
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title="My team"
        sub="Your operators, the work assigned to them today, and anything waiting for your review. Every operational time on this screen is GMT."
        right={
          <span className="text-body-sm text-on-surface-muted">
            Refreshes every {POLL.supervisor / 1000} s · now <GmtTime ts={nowTs()} />
          </span>
        }
      />

      <button
        type="button"
        onClick={() => setFlagsOpen(true)}
        className="panel flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-container-high xl:hidden"
      >
        <Icon name={worst?.icon ?? 'check_circle'} size={22} className={cx('shrink-0', worst?.text ?? 'text-success-text')} />
        <span className="min-w-0 flex-1">
          <span className="block text-body-md font-semibold text-on-surface">Flags for review</span>
          <span className="block text-body-sm text-on-surface-muted">
            {waiting.length === 0
              ? 'Nothing waiting for you.'
              : `${waiting.length} waiting · worst is ${worst?.label.toLowerCase()}`}
          </span>
        </span>
        <span className="tnum text-headline-sm font-bold text-on-surface">{waiting.length}</span>
        <Icon name="chevron_right" size={20} className="shrink-0 text-on-surface-muted" />
      </button>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        {/* -------------------------------------------- left column: work */}
        <div className="min-w-0 space-y-6">
          {/* chart */}
          <Card
            title="Today's work, per operator"
            sub="Each bar is that operator's tasks today. Select a colour to list the tasks behind it."
          >
            {gate(dash, 'The team dashboard', 'Loading team tasks') ??
              (operators.length === 0 ? (
                <EmptyState icon="groups" title="No operators in your team yet">
                  Add an operator below to give them a sign-in, then assign their first task.
                </EmptyState>
              ) : (
                <>
                  <TeamChart rows={rows} bucket={bucket} onBucket={setBucket} />
                  {bucket && (
                    <div className="mt-5 border-t border-outline pt-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-body-lg font-bold text-on-surface">
                          {BUCKET[bucket].label} tasks <span className="tnum font-normal text-on-surface-muted">({shown.length})</span>
                        </h3>
                        <Button size="sm" icon="close" onClick={() => setBucket(null)}>
                          Clear
                        </Button>
                      </div>
                      {shown.length === 0 ? (
                        <EmptyState icon="assignment" title={`No ${BUCKET[bucket].label.toLowerCase()} tasks`}>
                          Nothing is in this state right now.
                        </EmptyState>
                      ) : (
                        <TaskTable tasks={shown} now={now} nameOf={nameOf} />
                      )}
                    </div>
                  )}
                </>
              ))}
          </Card>

          {/* the team */}
          <Card
            title="Operators"
            sub={operators.length ? `${operators.length} in your team` : undefined}
            right={
              <Button size="sm" variant="primary" icon="person_add" onClick={() => setAddOpen(true)}>
                Add new operator
              </Button>
            }
          >
            {gate(team, 'Your team', 'Loading your team') ??
              (operators.length === 0 ? (
                <EmptyState icon="groups" title="No operators in your team yet">
                  Add an operator to give them a sign-in, then assign their first task. Nothing is pre-filled: the operator app
                  stays empty until you assign work.
                </EmptyState>
              ) : (
                <OperatorTable operators={operators} tasks={tasks} now={now} onAddTask={setTaskFor} onEditTask={setEditFor} />
              ))}
          </Card>
        </div>

        {/* -------------------------------------------- right column: flags (drawer below xl) */}
        <div className="hidden min-w-0 xl:sticky xl:top-[92px] xl:block">
          <FlagsPanel tickets={review.data ?? []} nameOf={nameOf} blocked={reviewBlocked} />
        </div>
      </div>

      {/* ------------------------------------------------ training & efficiency */}
      <Card
        title="Training &amp; efficiency"
        sub="What the system recorded for each operator over the last 7 days."
        right={
          <Link to="efficiency" className="text-body-sm font-semibold text-notice-dark hover:underline">
            Full view
          </Link>
        }
      >
        <TeamEfficiencyTable days={7} compact />
        <p className="mt-3 text-body-sm text-on-surface-muted">
          Open an operator to see their training profile, their progress through each module, and the evidence behind these numbers.
        </p>
      </Card>

      <Caveat icon="location_on">
        {PRESENCE_NOTE} A fix worse than the geofence accuracy limit is shown as unverified, never as outside.
      </Caveat>

      <Drawer
        open={flagsOpen}
        onClose={() => setFlagsOpen(false)}
        width="w-[440px]"
        title={
          <div>
            <h2 className="font-body text-body-lg font-bold text-on-surface">Flags for review</h2>
            <p className="text-body-sm text-on-surface-muted">Raised by the detectors, location and task times. You decide.</p>
          </div>
        }
      >
        <FlagsPanel tickets={review.data ?? []} nameOf={nameOf} blocked={reviewBlocked} embedded />
      </Drawer>

      <AddOperator open={addOpen} onClose={() => setAddOpen(false)} onAdded={refreshAll} />
      <TaskCreate
        key={`create-${taskFor?.user_id ?? "none"}`}
        open={taskFor !== null}
        onClose={() => setTaskFor(null)}
        operators={operators}
        defaultOperatorId={taskFor?.user_id}
        onCreated={refreshAll}
      />
      <TaskEdit
        key={`edit-${editFor?.user_id ?? "none"}`}
        open={editFor !== null}
        onClose={() => setEditFor(null)}
        operator={editFor ?? undefined}
        tasks={tasks}
        now={now}
        onSaved={refreshAll}
      />
    </div>
  );
}
