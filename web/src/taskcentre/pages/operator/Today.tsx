/**
 * `/tc/op` — what the operator has to do today, polled every `POLL.operator`.
 *
 * One column, big targets, no dashboards: the ongoing task first, then the rest, the Start Work
 * punch and the day's recorded your local time. `?view=messages` and `?view=alerts` open the chat and
 * the alert list on the same route.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi, errorText, opApi, requestPosition } from '../../api';
import { GEO_TIMEOUT_MS, POLL, PRESENCE_NOTE, TIME_NOTE } from '../../constants';
import { GeofenceBadge, LocalTime, TcEmpty, TcError, TcLoading } from '../../components';
import { Button, Icon, cx } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { fmtDate, nowTs } from '../../time';
import type { OpToday, Punch, TcTask } from '../../types';
import { ChatPanel } from './Chat';
import { FlagResponsePanel } from './FlagResponse';
import { NotificationsPanel } from './Notifications';
import { useTaskClock } from './TaskTimer';
import { Note, OfflineNote, OpPage, Stat, TOUCH, TOUCH_BIG, useOnline } from './common';
import { GEOFENCE_TEXT, NO_FIX_NOTE, sortTasks, useTaskStart } from './model';
import { TaskRow } from './TaskRow';
import { WaitingControl } from './Waiting';

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
              Start Work recorded <LocalTime ts={punch.ts} gmt={punch.ts_gmt} />
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
  const ordered = ongoing ? [ongoing, ...rest] : rest;
  const numberOf = (task: TcTask) => ordered.indexOf(task) + 1;
  const unread = today?.unread_messages ?? 0;
  const supervisorId = today?.supervisor?.user_id ?? today?.operator?.supervisor_id ?? today?.user?.supervisor_id;

  return (
    <OpPage
      title={view === 'messages' ? 'Messages' : view === 'alerts' ? 'Alerts' : 'Today'}
      sub={`${fmtDate(today?.ts ?? nowTs())} · ${TIME_NOTE}`}
    >
      {!online && <OfflineNote />}
      <Tabs view={view} unread={unread} />

      {r.loading && !today && <TcLoading label="Loading your day" />}
      {r.error && !today && <TcError error={r.error} what="Your day" onRetry={r.reload} />}

      {view === 'alerts' && <FlagResponsePanel />}
      {view === 'alerts' && <NotificationsPanel />}

      {view === 'messages' && today && (
        <ChatPanel supervisorId={supervisorId} supervisorName={today.supervisor?.name} meId={today.operator?.user_id ?? today.user?.user_id ?? ''} />
      )}

      {!view && today && (
        <>
          <section className="panel space-y-4 p-4" aria-label="Your day">
            <StartWork punch={today.start_work} onPunched={r.reload} />
            <div className="grid grid-cols-2 gap-4 border-t border-outline pt-4">
              <Stat label="Logged in (GMT)">{today.login ? <LocalTime ts={today.login.ts} gmt={today.login.ts_gmt} /> : '—'}</Stat>
              <Stat label="Start Work (GMT)">{today.start_work ? <LocalTime ts={today.start_work.ts} gmt={today.start_work.ts_gmt} /> : 'Not yet'}</Stat>
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
                  <ul className="space-y-2">
                    <TaskRow
                      task={ongoing}
                      index={numberOf(ongoing)}
                      now={now}
                      onStart={(t) => void start.start(t)}
                      busy={start.busy}
                    />
                  </ul>
                </section>
              )}
              {rest.length > 0 && (
                <section aria-label="Other tasks today" className="space-y-2">
                  <h2 className="font-display text-label-lg uppercase text-on-surface-muted">{ongoing ? 'Also today' : 'Today'}</h2>
                  <ul className="space-y-2">
                    {rest.map((t) => (
                      <TaskRow
                        key={t.task_id}
                        task={t}
                        index={numberOf(t)}
                        now={now}
                        onStart={(task) => void start.start(task)}
                        busy={start.busy}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </OpPage>
  );
}
