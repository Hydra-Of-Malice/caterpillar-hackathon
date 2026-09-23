/**
 * `/tc/sup/operator/:id` — one operator in this supervisor's team.
 *
 * Profile and last known position, the tasks assigned for today (genuinely empty until the
 * supervisor assigns one — no placeholder work is ever shown), each task's checkpoints, progress
 * and expected finish in GMT, the recent progress events, the start/finish work punches, the flags
 * raised about them, and the two-way chat for this pair with optimistic sending and rollback.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { chat, sup } from '../../api';
import { GeofenceBadge, GmtTime, PriorityChip, TcError, TicketCard } from '../../components';
import { POLL, PRESENCE_NOTE } from '../../constants';
import { fmtDelta, isSameGmtDay, nowTs } from '../../time';
import type { ChatMessage, Punch, TaskProgress, TcTask } from '../../types';
import { Button, PageTitle } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { OperatorEfficiency } from './Efficiency';
import FatigueRisk from './FatigueRisk';
import { TaskCreate } from './TaskCreate';
import TrainingProfile from './TrainingProfile';
import {
  Card,
  Caveat,
  CheckpointList,
  CheckpointProgress,
  Chip,
  Details,
  EmptyState,
  Fact,
  Icon,
  LocationLine,
  TaskStatusChip,
  cx,
  gate,
} from './common';

const PROGRESS_LABEL: Record<string, string> = {
  note: 'Progress note',
  delay: 'Delay explained',
  status: 'Status change',
  checkpoint: 'Checkpoint updated',
  exception_resolved: 'Exception resolved by supervisor',
};

const PUNCH_LABEL: Record<string, string> = {
  start_work: 'Start work',
  finish_work: 'Finish work',
};

/** A progress event carrying the task it belongs to, so the feed reads on its own. */
interface FeedEvent extends TaskProgress {
  task_title?: string;
}

export default function OperatorDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const now = useNow(5_000) / 1000;
  const [taskOpen, setTaskOpen] = useState(false);

  const detail = useResource(() => sup.operator(id), [id], POLL.supervisor);
  const taskRes = useResource(() => sup.tasks({ operator_id: id }), [id], POLL.supervisor);

  const d = detail.data;
  const operator = d?.operator;
  const tasks: TcTask[] = taskRes.data ?? d?.tasks ?? [];
  const tickets = d?.tickets ?? [];
  const punches: Punch[] = d?.punches ?? [];

  const today = useMemo(
    () => tasks.filter((t) => isSameGmtDay(t.start_ts, now) || (t.status !== 'completed' && t.status !== 'cancelled')).sort((a, b) => a.start_ts - b.start_ts),
    [tasks, now],
  );
  const earlier = useMemo(() => tasks.filter((t) => !today.includes(t)).sort((a, b) => b.start_ts - a.start_ts), [tasks, today]);

  /** The API carries progress on each task; flatten it into one recent-activity feed. */
  const feed: FeedEvent[] = useMemo(() => {
    const out: FeedEvent[] = [];
    for (const t of tasks) for (const ev of t.progress ?? []) out.push({ ...ev, task_title: t.title });
    return out.sort((a, b) => b.ts - a.ts).slice(0, 25);
  }, [tasks]);
  const progressReturned = tasks.some((t) => t.progress !== undefined);

  const refresh = () => {
    detail.reload();
    taskRes.reload();
  };

  const blocked = gate(detail, 'This operator', 'Loading operator');

  return (
    <div className="space-y-8">
      <div>
        <Link to="/tc/sup" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          <Icon name="arrow_back" size={18} /> My team
        </Link>
      </div>

      {blocked ?? (
        <>
          <PageTitle
            kicker="Operator"
            title={operator?.name ?? id}
            sub="Their work for today, what they have reported, and your chat with them. Every operational time is GMT."
            right={
              <Button variant="primary" icon="assignment_add" onClick={() => setTaskOpen(true)}>
                Assign task
              </Button>
            }
          />

          <Card title="Profile">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Username">{operator?.username ?? id}</Fact>
              <Fact label="Machine">{operator?.machine_id || 'Not assigned'}</Fact>
              <Fact label="Account">{operator?.active === false ? <Chip tone="red">Inactive</Chip> : <Chip tone="green">Active</Chip>}</Fact>
              <Fact label="Site">{operator?.site_id ?? '—'}</Fact>
              <div className="sm:col-span-2 xl:col-span-4">
                <dt className="font-display text-label-sm uppercase text-on-surface-muted">Last known position</dt>
                <dd className="mt-1.5">
                  <LocationLine location={d?.location} now={now} />
                </dd>
              </div>
            </dl>
          </Card>

          <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_400px]">
            <div className="space-y-8">
              {/* ------------------------------------------------ tasks for today */}
              <Card title="Tasks for today" sub={`GMT day · ${today.length} task${today.length === 1 ? '' : 's'}`}>
                {gate(taskRes, 'These tasks', 'Loading tasks') ??
                  (today.length === 0 ? (
                    <EmptyState icon="assignment" title="No tasks assigned for today">
                      Nothing has been assigned to {operator?.name ?? 'this operator'} for today. Their app shows the same empty state — no example or
                      placeholder work is created. Use Assign task to give them their first one.
                    </EmptyState>
                  ) : (
                    <ul className="space-y-5">
                      {today.map((t) => (
                        <TaskBlock key={t.task_id} task={t} now={now} />
                      ))}
                    </ul>
                  ))}
                {earlier.length > 0 && (
                  <Details className="mt-6" label={`Earlier tasks (${earlier.length})`}>
                    <ul className="space-y-5">
                      {earlier.map((t) => (
                        <TaskBlock key={t.task_id} task={t} now={now} />
                      ))}
                    </ul>
                  </Details>
                )}
              </Card>

              {/* ------------------------------------------------ efficiency */}
              <OperatorEfficiency operatorId={id} operatorName={operator?.name ?? 'this operator'} />

              {/* ------------------------------------------------ work-schedule fatigue risk (not a fatigue detector) */}
              <FatigueRisk operatorId={id} operatorName={operator?.name ?? 'this operator'} />

              {/* ------------------------------------------------ training */}
              <TrainingProfile operatorId={id} operatorName={operator?.name ?? 'this operator'} />

              {/* ------------------------------------------------ progress */}
              <Card title="Recent progress" sub="Notes, delays, status and checkpoint changes — append-only">
                {feed.length === 0 ? (
                  <p className="text-body-sm text-on-surface-muted">
                    {progressReturned
                      ? 'No progress has been reported yet.'
                      : 'Progress events were not included in this response, so none are shown. Nothing is inferred.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-outline">
                    {feed.map((ev, i) => (
                      <li key={ev.id ?? `${ev.task_id}-${ev.ts}-${i}`} className="py-2.5">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-label-sm uppercase text-on-surface-muted">{PROGRESS_LABEL[ev.kind] ?? ev.kind}</span>
                          <GmtTime ts={ev.ts} gmt={ev.ts_gmt} mode="smart" className="text-body-sm text-on-surface-muted" />
                          {ev.task_title && <span className="text-body-sm text-on-surface-variant">· {ev.task_title}</span>}
                        </div>
                        {ev.text && <p className="mt-0.5 whitespace-pre-line text-body-md text-on-surface">{ev.text}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ------------------------------------------------ punches */}
              <Card title="Punches" sub="Start and finish work, server-timestamped, with the position used for the decision">
                {punches.length === 0 ? (
                  <p className="text-body-sm text-on-surface-muted">No punches recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-outline">
                    {[...punches]
                      .sort((a, b) => b.ts - a.ts)
                      .slice(0, 20)
                      .map((p) => (
                        <li key={p.punch_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <Icon name={p.kind === 'finish_work' ? 'logout' : 'login'} size={20} className="text-on-surface-muted" />
                            <span className="text-body-md text-on-surface">{PUNCH_LABEL[p.kind] ?? p.kind}</span>
                            <GmtTime ts={p.ts} gmt={p.ts_gmt} mode="smart" className="text-body-sm text-on-surface-muted" />
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <GeofenceBadge status={p.geofence_status} distanceM={p.distance_m} accuracyM={p.accuracy_m} />
                            {p.ticket_id && (
                              <Chip tone="purple" icon="flag">
                                Review flag raised
                              </Chip>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>

              {/* ------------------------------------------------ flags */}
              {tickets.length > 0 && (
                <Card title="Review flags about this operator" sub="Decide them in the review queue">
                  <ul className="space-y-3">
                    {tickets.map((t) => (
                      <li key={t.ticket_id}>
                        <TicketCard ticket={t} compact now={now} />
                      </li>
                    ))}
                  </ul>
                  <Link to="/tc/sup/review" className="mt-4 inline-block text-body-sm font-semibold text-notice-dark hover:underline">
                    Open the review queue
                  </Link>
                </Card>
              )}
            </div>

            <ChatPanel operatorId={id} operatorName={operator?.name ?? 'this operator'} />
          </div>

          <Caveat icon="visibility_lock">
            {PRESENCE_NOTE} A poor fix is shown as unverified, never as outside, and nothing on this screen controls a machine.
          </Caveat>

          <TaskCreate
            open={taskOpen}
            onClose={() => setTaskOpen(false)}
            operators={operator ? [{ user_id: operator.user_id, user: operator, machine_id: operator.machine_id }] : []}
            defaultOperatorId={id}
            onCreated={refresh}
          />
        </>
      )}
    </div>
  );
}

function TaskBlock({ task, now }: { task: TcTask; now: number }) {
  return (
    <li className="border border-outline bg-surface-container-low p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-headline-sm text-on-surface">{task.title}</h3>
          <p className="text-body-sm text-on-surface-muted">
            {task.location || 'No location given'}
            {task.machine_id ? ` · ${task.machine_id}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityChip priority={task.priority} />
          <TaskStatusChip task={task} now={now} />
        </div>
      </div>

      {task.instructions && <p className="mt-3 whitespace-pre-line text-body-md text-on-surface-variant">{task.instructions}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Fact label="Start (GMT)">
          <GmtTime ts={task.start_ts} gmt={task.start_gmt} mode="datetime" />
        </Fact>
        <Fact label="Expected finish (GMT)">
          <GmtTime ts={task.expected_finish_ts} gmt={task.expected_finish_gmt} mode="datetime" />
          {task.status === 'ongoing' && <span className="block text-body-sm text-on-surface-muted">{fmtDelta(task.expected_finish_ts, now)}</span>}
        </Fact>
        <Fact label="Started (GMT)">
          <GmtTime ts={task.started_at} gmt={task.started_at_gmt} mode="datetime" missing="Not started" />
        </Fact>
        <Fact label="Finished (GMT)">
          <GmtTime ts={task.finished_at} gmt={task.finished_at_gmt} mode="datetime" missing="Not finished" />
        </Fact>
      </dl>

      <div className="mt-4">
        <CheckpointProgress list={task.checkpoints} />
      </div>
      <Details className="mt-3" label="Checkpoints">
        <CheckpointList list={task.checkpoints} />
      </Details>
      {task.overrun_ticket_id && (
        <p className="mt-3 text-body-sm text-warning-text">This task ran past its expected finish, so a task overrun review flag was opened.</p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- chat
let localSeq = 0;

/** A message still being sent, or one that failed and is waiting for retry or rollback. */
interface Outgoing extends ChatMessage {
  pending: boolean;
  failed: boolean;
}

function ChatPanel({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  const thread = useResource(() => chat.thread(operatorId), [operatorId], POLL.chat);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<unknown>();
  const endRef = useRef<HTMLDivElement>(null);

  const server = thread.data?.messages ?? [];
  const messages = useMemo(() => [...server, ...outgoing].sort((a, b) => a.ts - b.ts), [server, outgoing]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const deliver = async (body: string, tempId: string) => {
    try {
      const sent = await chat.send(operatorId, body);
      setOutgoing((os) => os.filter((x) => x.message_id !== tempId));
      if (sent?.message_id) thread.setData({ ...(thread.data ?? { messages: [] }), messages: [...server, sent] });
      thread.reload();
      setSendError(undefined);
    } catch (e) {
      // Rollback: the message stays on screen marked "not sent" rather than disappearing silently.
      setOutgoing((os) => os.map((x) => (x.message_id === tempId ? { ...x, pending: false, failed: true } : x)));
      setSendError(e);
    }
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    localSeq += 1;
    const tempId = `local-${localSeq}`;
    setOutgoing((os) => [
      ...os,
      { message_id: tempId, thread_key: '', from_user_id: 'me', to_user_id: operatorId, ts: nowTs(), text: body, pending: true, failed: false },
    ]);
    setText('');
    setSendError(undefined);
    void deliver(body, tempId);
  };

  const retry = (m: Outgoing) => {
    setOutgoing((os) => os.map((x) => (x.message_id === m.message_id ? { ...x, pending: true, failed: false } : x)));
    void deliver(m.text, m.message_id);
  };

  /** Full rollback: drop the failed message and put its text back in the box. */
  const discard = (m: Outgoing) => {
    setOutgoing((os) => os.filter((x) => x.message_id !== m.message_id));
    setText((t) => t || m.text);
    setSendError(undefined);
  };

  return (
    <Card title="Chat" sub={`With ${operatorName} · refreshes every ${POLL.chat / 1000} s`} className="flex max-h-[760px] flex-col">
      {gate(thread, 'This conversation', 'Loading messages') ?? (
        <>
          <div className="min-h-[220px] flex-1 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <EmptyState icon="forum" title="No messages yet">
                Anything you send reaches {operatorName} in their app. Keep it short and specific.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <MessageBubble key={m.message_id} m={m} operatorId={operatorId} onRetry={retry} onDiscard={discard} />
                ))}
              </ul>
            )}
            <div ref={endRef} />
          </div>

          <div className="mt-4 border-t border-outline pt-4">
            {sendError !== undefined && <TcError error={sendError} what="Your message" />}
            <label className="mt-2 block">
              <span className="sr-only">Message to {operatorName}</span>
              <textarea
                className="input h-20 py-2 leading-6"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={`Message ${operatorName}…`}
              />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-body-sm text-on-surface-muted">Ctrl + Enter sends.</span>
              <Button variant="primary" icon="send" onClick={send} disabled={!text.trim()}>
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function MessageBubble({
  m,
  operatorId,
  onRetry,
  onDiscard,
}: {
  m: ChatMessage | Outgoing;
  operatorId: string;
  onRetry: (m: Outgoing) => void;
  onDiscard: (m: Outgoing) => void;
}) {
  const fromOperator = m.from_user_id === operatorId;
  const out = m as Outgoing;
  return (
    <li className={cx('flex', fromOperator ? 'justify-start' : 'justify-end')}>
      <div
        className={cx(
          'max-w-[85%] border px-3 py-2',
          fromOperator ? 'border-outline bg-surface-container-low' : 'border-cat-border bg-cat/10',
          out.failed && 'border-danger bg-danger/10',
        )}
      >
        <p className="whitespace-pre-line text-body-md text-on-surface">{m.text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
          <span>{fromOperator ? (m.from_name ?? 'Operator') : 'You'}</span>
          <GmtTime ts={m.ts} gmt={m.ts_gmt} mode="smart" />
          {m.system && <Chip tone="neutral">System</Chip>}
          {out.pending && <span>Sending…</span>}
          {out.failed && <span className="text-danger-text">Not sent</span>}
        </div>
        {out.failed && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" icon="refresh" onClick={() => onRetry(out)}>
              Retry
            </Button>
            <Button size="sm" icon="undo" onClick={() => onDiscard(out)}>
              Discard
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
