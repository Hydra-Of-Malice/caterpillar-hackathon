/**
 * `/tc/op` — what the operator has to do today, polled every `POLL.operator`.
 *
 * One column, big targets, no dashboards: the ongoing task first, then the rest, the Start Work
 * punch and the day's recorded times in GMT. `?view=messages` and `?view=alerts` open the chat and
 * the alert list on the same route.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi, errorText, opApi, requestPosition } from '../../api';
import { GEO_TIMEOUT_MS, POLL, PRESENCE_NOTE } from '../../constants';
import { GeofenceBadge, GmtTime, TcEmpty, TcError, TcLoading } from '../../components';
import { Button, Chip, Icon, ProgressBar, cx } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { fmtGmtDate, nowTs } from '../../time';
import type { OpToday, Punch, TcTask } from '../../types';
import { ChatPanel } from './Chat';
import { FlagResponsePanel } from './FlagResponse';
import { NotificationsPanel } from './Notifications';
import { TaskTimer, useTaskClock } from './TaskTimer';
import { Note, OfflineNote, OpPage, Stat, TOUCH, TOUCH_BIG, useOnline } from './common';
import { GEOFENCE_TEXT, NO_FIX_NOTE, STATUS_LABEL, checklistChip, sortTasks, statusChip, taskProgress, useTaskStart } from './model';
import { WaitingControl } from './Waiting';

function TaskCardLink({ task, now, prominent = false }: { task: TcTask; now: number; prominent?: boolean }) {
  const p = taskProgress(task);
  const chip = statusChip(task.status);
  const cl = checklistChip(task.checklist);
  const open = task.status === 'pending' || task.status === 'ongoing';
  const late = open && (task.overdue ?? now > task.expected_finish_ts);
  return (
    <Link
      to={`/tc/op/task/${task.task_id}`}
      className={cx(
        'panel block p-4 transition-colors hover:bg-surface-container-high',
        TOUCH_BIG,
        prominent && 'border-l-4 border-l-cat',
        task.status === 'completed' && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={cx('min-w-0 font-display text-on-surface', prominent ? 'text-headline-md' : 'text-headline-sm')}>{task.title}</h3>
        <Icon name="chevron_right" size={28} className="shrink-0 text-on-surface-muted" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Chip icon={chip.icon} tone={chip.tone}>
          {STATUS_LABEL[task.status] ?? task.status}
        </Chip>
        {late && (
          <Chip icon="warning" tone="orange">
            Past finish time
          </Chip>
        )}
        {task.priority === 'urgent' && (
          <Chip icon="priority_high" tone="red">
            Urgent
          </Chip>
        )}
      </div>

      <dl className="mt-3 space-y-1 text-body-lg text-on-surface-variant">
        <div className="flex items-center gap-2">
          <Icon name="location_on" size={22} className="text-on-surface-muted" />
          <dt className="sr-only">Where</dt>
          <dd>{task.location || 'Location not given'}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="precision_manufacturing" size={22} className="text-on-surface-muted" />
          <dt className="sr-only">Machine</dt>
          <dd>{task.machine_id ?? 'No machine assigned'}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={22} className="text-on-surface-muted" />
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

      {task.status !== 'completed' && task.status !== 'cancelled' && (
        <div className="mt-3 flex items-center gap-2 border-t border-outline pt-3 text-body-md text-on-surface-variant">
          <Icon name={cl.icon} size={22} className="text-on-surface-muted" />
          <span>{cl.text}</span>
        </div>
      )}
    </Link>
  );
}

/**
 * A task card plus its Start task action.
 *
 * The button is a sibling of the card link, never inside it: a control nested in a link cannot be
 * operated reliably by keyboard or screen reader.
 */
function TaskCard({
  task,
  now,
  prominent = false,
  onStart,
  busy = false,
}: {
  task: TcTask;
  now: number;
  prominent?: boolean;
  onStart?: (task: TcTask) => void;
  busy?: boolean;
}) {
  const done = task.checklist?.completed === true;
  const blocked = task.checklist?.blocked === true;
  if (task.status !== 'pending' || !onStart) return <TaskCardLink task={task} now={now} prominent={prominent} />;
  return (
    <div className="space-y-2">
      <TaskCardLink task={task} now={now} prominent={prominent} />
      <Button
        variant={blocked ? 'secondary' : 'primary'}
        size="lg"
        icon={blocked ? 'block' : done ? 'play_arrow' : 'fact_check'}
        block
        className={cx('h-16', TOUCH_BIG)}
        disabled={busy}
        onClick={() => onStart(task)}
      >
        {busy ? 'Starting…' : blocked ? 'Pre-start check blocked' : done ? 'Start task' : 'Start task — pre-start check'}
      </Button>
    </div>
  );
}

/**
 * Start Work punch. The browser is asked for a position; if it refuses or times out the punch is
 * still sent without coordinates and the server's own verdict is shown — no coordinates are ever
 * invented here.
 */
function StartWork({ punch, onPunched }: { punch: Punch | null | undefined; onPunched: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [noFix, setNoFix] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setFailed(null);
    const fix = await requestPosition(GEO_TIMEOUT_MS);
    setNoFix(fix === null);
    try {
      await authApi.punch('start_work', fix);
      setSent(true);
      onPunched();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (punch) {
    const inside = punch.geofence_status === 'inside';
    return (
      <div className="space-y-3">
        <Note
          tone={inside ? 'ok' : 'warn'}
          icon={inside ? 'where_to_vote' : 'not_listed_location'}
          title={
            <>
              Start Work recorded <GmtTime ts={punch.ts} gmt={punch.ts_gmt} />
            </>
          }
        >
          <span className="flex flex-wrap items-center gap-2">
            <GeofenceBadge status={punch.geofence_status} distanceM={punch.distance_m} accuracyM={punch.accuracy_m} />
            <span>{GEOFENCE_TEXT[punch.geofence_status] ?? GEOFENCE_TEXT.unverified}</span>
          </span>
          {noFix && punch.geofence_status === 'unverified' && <span className="mt-2 block">{NO_FIX_NOTE}</span>}
        </Note>
        {punch.ticket_id && (
          <Note tone="info" icon="supervisor_account" title="Sent for review">
            Your supervisor will look at this punch and decide. There is nothing for you to do now.
          </Note>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="primary" size="xl" icon="play_arrow" block className="h-20" disabled={busy} onClick={() => void start()}>
        {busy ? 'Recording…' : 'Start Work'}
      </Button>
      <p className="text-body-md text-on-surface-muted">
        Your device is asked for its position so the punch can be matched to the worksite. If it will not share one, the punch
        is still recorded — as unverified. {PRESENCE_NOTE}
      </p>
      {sent && !failed && (
        <Note tone="info" icon="hourglass_top" title="Sending…">
          Waiting for the server to confirm the time it recorded.
        </Note>
      )}
      {failed && (
        <Note tone="danger" title="Punch not recorded" role="alert">
          {failed}
        </Note>
      )}
    </div>
  );
}

const TABS: Array<{ to: string; label: string; icon: string; view: string | null }> = [
  { to: '/tc/op', label: 'Tasks', icon: 'assignment', view: null },
  { to: '/tc/op?view=messages', label: 'Messages', icon: 'forum', view: 'messages' },
  { to: '/tc/op?view=alerts', label: 'Alerts', icon: 'notifications', view: 'alerts' },
];

function Tabs({ view, unread }: { view: string | null; unread: number }) {
  return (
    <nav className="grid grid-cols-3 gap-2" aria-label="Operator sections">
      {TABS.map((t) => {
        const active = t.view === view;
        return (
          <Link
            key={t.label}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center justify-center gap-1 border-2 px-2 py-2 font-display text-label-md uppercase',
              TOUCH_BIG,
              active ? 'border-cat bg-cat/10 text-cat-text' : 'border-outline text-on-surface-variant',
            )}
          >
            <Icon name={t.icon} size={26} fill={active} />
            <span className="flex items-center gap-1">
              {t.label}
              {t.view === 'messages' && unread > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-label-sm text-white">{unread > 9 ? '9+' : unread}</span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Today() {
  const [params] = useSearchParams();
  const view = params.get('view');
  const online = useOnline();
  const now = useNow(15_000) / 1000;
  const r = useResource<OpToday>(() => opApi.today(), [], POLL.operator);
  /** Start task: to the pre-start check when it is not done, straight to the API when it is. */
  const start = useTaskStart(() => r.reload());

  const today = r.data;
  useTaskClock(today?.ts); // keep every task timer on the server's clock, not this device's
  const tasks = sortTasks(today?.tasks ?? []);
  const ongoingId = today?.ongoing_task?.task_id;
  const ongoing = tasks.find((t) => (ongoingId ? t.task_id === ongoingId : t.status === 'ongoing'));
  const rest = tasks.filter((t) => t !== ongoing);
  const unread = today?.unread_messages ?? 0;
  const supervisorId = today?.supervisor?.user_id ?? today?.user?.supervisor_id;

  return (
    <OpPage
      title={view === 'messages' ? 'Messages' : view === 'alerts' ? 'Alerts' : 'Today'}
      sub={`${fmtGmtDate(today?.ts ?? nowTs())} · all times GMT`}
    >
      {!online && <OfflineNote />}
      <Tabs view={view} unread={unread} />

      {r.loading && !today && <TcLoading label="Loading your day" />}
      {r.error && !today && <TcError error={r.error} what="Your day" onRetry={r.reload} />}

      {view === 'alerts' && <FlagResponsePanel />}
      {view === 'alerts' && <NotificationsPanel />}

      {view === 'messages' && today && (
        <ChatPanel supervisorId={supervisorId} supervisorName={today.supervisor?.name} meId={today.user?.user_id ?? ''} />
      )}

      {!view && today && (
        <>
          <section className="panel space-y-4 p-4" aria-label="Your day">
            <StartWork punch={today.start_work} onPunched={r.reload} />
            <div className="grid grid-cols-2 gap-4 border-t border-outline pt-4">
              <Stat label="Logged in (GMT)">{today.login ? <GmtTime ts={today.login.ts} gmt={today.login.ts_gmt} /> : '—'}</Stat>
              <Stat label="Start Work (GMT)">{today.start_work ? <GmtTime ts={today.start_work.ts} gmt={today.start_work.ts_gmt} /> : 'Not yet'}</Stat>
              <div className="col-span-2">
                <div className="font-display text-label-sm uppercase text-on-surface-muted">Worksite check</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <GeofenceBadge status={today.start_work?.geofence_status ?? today.geofence_status ?? today.login?.geofence_status} />
                  <span className="text-body-md text-on-surface-muted">{PRESENCE_NOTE}</span>
                </div>
              </div>
            </div>
          </section>

          <WaitingControl waiting={today.waiting} taskId={ongoing?.task_id ?? null} onChanged={r.reload} />

          {unread > 0 && (
            <Link to="/tc/op?view=messages" className={cx('block', TOUCH)}>
              <Note tone="info" icon="mark_chat_unread" title={`${unread} new message${unread === 1 ? '' : 's'} from your supervisor`}>
                Tap to read and reply.
              </Note>
            </Link>
          )}

          {tasks.length === 0 ? (
            <div className="panel">
              <TcEmpty icon="assignment_turned_in" title="No tasks assigned yet">
                Nothing has been sent to you for today. This screen updates by itself — keep it open and a new task will appear
                here. Message your supervisor if you are waiting.
              </TcEmpty>
            </div>
          ) : (
            <>
              {start.error && (
                <Note tone="danger" icon="error" title="The task did not start" role="alert">
                  {start.error}
                </Note>
              )}
              {ongoing && (
                <section aria-label="Task in progress" className="space-y-2">
                  <h2 className="font-display text-label-lg uppercase text-on-surface-muted">Doing now</h2>
                  <TaskCard task={ongoing} now={now} prominent onStart={(t) => void start.start(t)} busy={start.busy} />
                </section>
              )}
              {rest.length > 0 && (
                <section aria-label="Other tasks today" className="space-y-2">
                  <h2 className="font-display text-label-lg uppercase text-on-surface-muted">{ongoing ? 'Also today' : 'Today'}</h2>
                  <div className="space-y-3">
                    {rest.map((t) => (
                      <TaskCard key={t.task_id} task={t} now={now} onStart={(task) => void start.start(task)} busy={start.busy} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </OpPage>
  );
}
