/**
 * `/tc/op/task/:id` — one task, readable at arm's length: instructions, checkpoints as large
 * tappable controls, a progress note, a delay explanation and Finish Task.
 *
 * The contract gives operators no single-task read, so the task comes from `GET /tc/op/today`
 * (polled every `POLL.operator`) and is matched on the route id.
 */
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { errorText, opApi } from '../../api';
import { POLL } from '../../constants';
import { GmtTime, TcError, TcLoading } from '../../components';
import { Button, Chip, Icon, ProgressBar, cx } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { fmtGmt } from '../../time';
import type { Checkpoint, OpToday, ProgressKind, TcTask } from '../../types';
import { ChatPanel } from './Chat';
import { Note, OfflineNote, OpPage, Stat, TOUCH_BIG, useOnline } from './common';
import { STATUS_LABEL, errStatus, sortTasks, statusChip, taskProgress, unmetRequired } from './model';

function CheckpointControl({ cp, disabled, onSet }: { cp: Checkpoint; disabled: boolean; onSet: (done: number) => void }) {
  const complete = cp.done >= cp.target;
  const meta = <span className="font-display text-label-sm uppercase text-on-surface-muted">{cp.required ? 'Required' : 'Optional'}</span>;

  if (cp.kind === 'counted') {
    return (
      <li className={cx('panel p-3', complete && 'border-l-4 border-l-success')}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-body-lg text-on-surface">{cp.label}</span>
          {meta}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="cab"
            icon="remove"
            aria-label={`One fewer for ${cp.label}`}
            disabled={disabled || cp.done <= 0}
            className="h-16 w-16 px-0"
            onClick={() => onSet(Math.max(0, cp.done - 1))}
          />
          <span className="font-display text-headline-lg tnum text-on-surface" aria-live="polite">
            {cp.done}/{cp.target}
          </span>
          <Button
            variant="primary"
            size="cab"
            icon="add"
            aria-label={`One more for ${cp.label}`}
            disabled={disabled || cp.done >= cp.target}
            className="h-16 w-16 px-0"
            onClick={() => onSet(Math.min(cp.target, cp.done + 1))}
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={complete}
        disabled={disabled}
        onClick={() => onSet(complete ? 0 : cp.target)}
        className={cx('panel flex w-full items-center gap-4 p-4 text-left disabled:opacity-60', TOUCH_BIG, complete && 'border-l-4 border-l-success')}
      >
        <span
          className={cx(
            'flex h-14 w-14 shrink-0 items-center justify-center border-2',
            complete ? 'border-success bg-success text-white' : 'border-outline-strong bg-surface-container-lowest',
          )}
        >
          {complete && <Icon name="check" size={34} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body-lg text-on-surface">{cp.label}</span>
          {meta}
        </span>
      </button>
    </li>
  );
}

function ProgressForm({
  kind,
  title,
  hint,
  placeholder,
  icon,
  onSend,
}: {
  kind: ProgressKind;
  title: string;
  hint: string;
  placeholder: string;
  icon: string;
  onSend: (kind: ProgressKind, text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSend(kind, t);
      setText('');
      setSent(true);
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel space-y-2 p-4">
      <h2 className="flex items-center gap-2 font-display text-headline-sm uppercase text-on-surface">
        <Icon name={icon} size={24} className="text-on-surface-muted" />
        {title}
      </h2>
      <p className="text-body-md text-on-surface-muted">{hint}</p>
      <label className="sr-only" htmlFor={`op-progress-${kind}`}>
        {title}
      </label>
      <textarea
        id={`op-progress-${kind}`}
        className="input h-auto min-h-[64px] resize-none py-3 text-body-lg"
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setSent(false);
        }}
      />
      <Button variant="secondary" size="cab" icon="send" block disabled={!text.trim() || busy} onClick={() => void submit()}>
        {busy ? 'Sending…' : 'Send to supervisor'}
      </Button>
      {sent && (
        <Note tone="ok" title="Sent">
          Your supervisor can see this on the task.
        </Note>
      )}
      {failed && (
        <Note tone="danger" title="Not sent" role="alert">
          {failed}
        </Note>
      )}
    </div>
  );
}

export default function TaskDetail() {
  const { id = '' } = useParams();
  const online = useOnline();
  const now = useNow(15_000) / 1000;
  const r = useResource<OpToday>(() => opApi.today(), [], POLL.operator);

  const [over, setOver] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; items: string[] } | null>(null);
  const [finished, setFinished] = useState<TcTask | null>(null);
  const [showChat, setShowChat] = useState(false);

  const today = r.data;
  const found = sortTasks(today?.tasks ?? []).find((t) => t.task_id === id);
  const checkpoints: Checkpoint[] = (found?.checkpoints ?? [])
    .map((c) => (over[c.checkpoint_id] === undefined ? c : { ...c, done: over[c.checkpoint_id] }))
    .sort((a, b) => a.order_index - b.order_index);

  /** Fold a task the API just returned back into the polled day, so the screen updates at once. */
  const applyTask = (updated: TcTask | undefined) => {
    const cur = r.data;
    if (!updated?.task_id || !cur?.tasks) return;
    r.setData({
      ...cur,
      tasks: cur.tasks.map((t) => (t.task_id === updated.task_id ? { ...t, ...updated, checkpoints: updated.checkpoints ?? t.checkpoints } : t)),
    });
  };

  const setCheckpoint = async (cp: Checkpoint, done: number) => {
    setActionError(null);
    setBlocked(null);
    setOver((p) => ({ ...p, [cp.checkpoint_id]: done }));
    try {
      const updated = await opApi.checkpoint(id, { checkpoint_id: cp.checkpoint_id, done });
      applyTask(updated);
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setOver((p) => {
        const next = { ...p };
        delete next[cp.checkpoint_id];
        return next;
      });
    }
  };

  const startTask = async () => {
    setBusy(true);
    setActionError(null);
    try {
      applyTask(await opApi.startTask(id));
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendProgress = async (kind: ProgressKind, text: string) => {
    await opApi.progress(id, { kind, text });
    r.reload();
  };

  const finish = async () => {
    setBusy(true);
    setActionError(null);
    setBlocked(null);
    try {
      const updated = await opApi.finish(id);
      applyTask(updated);
      setFinished(updated ?? found ?? null);
    } catch (e) {
      if (errStatus(e) === 409) {
        setBlocked({
          message: errorText(e),
          items: unmetRequired(checkpoints).map((c) => `${c.label} — ${c.done}/${c.target} done`),
        });
      } else {
        setActionError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const page = (children: ReactNode) => (
    <OpPage title={found?.title ?? 'Task'} back={{ to: '/tc/op', label: 'Today' }}>
      {!online && <OfflineNote />}
      {children}
    </OpPage>
  );

  if (r.loading && !today) return page(<TcLoading label="Loading task" />);
  if (r.error && !today) return page(<TcError error={r.error} what="This task" onRetry={r.reload} />);
  if (!found)
    return page(
      <Note tone="info" icon="search_off" title="Not on today's list">
        This task is not among today's tasks for you. Go back to Today to see what you have been given.
      </Note>,
    );

  const task = found;
  const p = taskProgress({ checkpoints });
  const outstanding = unmetRequired(checkpoints);
  const chip = statusChip(task.status);
  const open = task.status === 'pending' || task.status === 'ongoing';
  const late = open && (task.overdue ?? now > task.expected_finish_ts);
  const overran = finished ? finished.overrun_ticket_id != null || (finished.finished_at ?? now) > task.expected_finish_ts : false;

  return page(
    <>
      <section className="panel space-y-3 p-4" aria-label="Task details">
        <div className="flex flex-wrap items-center gap-2">
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
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Where">{task.location || '—'}</Stat>
          <Stat label="Machine">{task.machine_id ?? '—'}</Stat>
          <Stat label="Finish by (GMT)">
            <GmtTime ts={task.expected_finish_ts} gmt={task.expected_finish_gmt} />
          </Stat>
          <Stat label="Started (GMT)">
            {task.started_at ? <GmtTime ts={task.started_at} gmt={task.started_at_gmt} /> : 'Not started'}
          </Stat>
        </div>
        {task.instructions && (
          <div className="border-t border-outline pt-3">
            <h2 className="font-display text-label-lg uppercase text-on-surface-muted">Instructions</h2>
            <p className="mt-1 whitespace-pre-wrap text-body-lg text-on-surface">{task.instructions}</p>
          </div>
        )}
      </section>

      {task.status === 'pending' && (
        <Button variant="primary" size="xl" icon="play_arrow" block className="h-20" disabled={busy} onClick={() => void startTask()}>
          {busy ? 'Starting…' : 'Start Task'}
        </Button>
      )}

      {checkpoints.length > 0 && (
        <section aria-label="Checkpoints" className="space-y-2">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-label-lg uppercase text-on-surface-muted">Checkpoints</h2>
            <span className="font-display text-headline-sm tnum text-on-surface">
              {p.done}/{p.total}
            </span>
          </div>
          <ProgressBar pct={p.total ? (p.done / p.total) * 100 : 0} tone={p.done === p.total ? 'green' : 'yellow'} />
          <ul className="space-y-3">
            {checkpoints.map((cp) => (
              <CheckpointControl key={cp.checkpoint_id} cp={cp} disabled={!open || busy} onSet={(d) => void setCheckpoint(cp, d)} />
            ))}
          </ul>
        </section>
      )}

      {actionError && (
        <Note tone="danger" title="That did not save" role="alert">
          {actionError}
        </Note>
      )}

      <ProgressForm
        kind="note"
        icon="edit_note"
        title="Post progress"
        hint="A short line about where you are with this task."
        placeholder="e.g. Second trench section cleared"
        onSend={sendProgress}
      />
      <ProgressForm
        kind="delay"
        icon="hourglass_top"
        title="Explain a delay"
        hint="Tell your supervisor why this is taking longer, before it runs over."
        placeholder="e.g. Waiting for the haul truck"
        onSend={sendProgress}
      />

      {task.progress && task.progress.length > 0 && (
        <section className="panel p-4" aria-label="What you have already sent">
          <h2 className="font-display text-label-lg uppercase text-on-surface-muted">Already sent</h2>
          <ul className="mt-2 space-y-2">
            {[...task.progress]
              .sort((a, b) => b.ts - a.ts)
              .slice(0, 6)
              .map((entry, i) => (
                <li key={entry.id ?? `${entry.ts}-${i}`} className="text-body-md text-on-surface-variant">
                  <span className="font-display text-label-sm uppercase text-on-surface-muted">
                    <GmtTime ts={entry.ts} gmt={entry.ts_gmt} /> · {entry.kind}
                  </span>
                  <span className="block">{entry.text}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {open && (
        <>
          <Button variant="primary" size="xl" icon="task_alt" block className="h-20" disabled={busy} onClick={() => void finish()}>
            {busy ? 'Finishing…' : 'Finish Task'}
          </Button>
          {outstanding.length > 0 && (
            <p className="text-body-md text-on-surface-muted">
              {outstanding.length} required checkpoint{outstanding.length === 1 ? '' : 's'} still open.
            </p>
          )}
        </>
      )}

      {blocked && (
        <Note tone="warn" icon="block" title="Not finished — checkpoints still open" role="alert">
          <p>{blocked.message}</p>
          {blocked.items.length > 0 && (
            <ul className="ml-5 mt-1 list-disc space-y-1">
              {blocked.items.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <p className="mt-2">
            The task is still open. Finish these, or ask your supervisor to authorise an exception — they can allow it to be
            closed without them.
          </p>
        </Note>
      )}

      {finished && (
        <Note
          tone="ok"
          icon="task_alt"
          title={
            <>
              Task finished <GmtTime ts={finished.finished_at ?? now} gmt={finished.finished_at_gmt} />
            </>
          }
        >
          {overran ? (
            <>
              This finished after {fmtGmt(task.expected_finish_ts)}, so an overrun was sent to your supervisor for review. You
              will see what they decide here and in your alerts.
            </>
          ) : (
            <>Recorded on time. Nothing else to do for this task.</>
          )}
        </Note>
      )}

      <section className="space-y-2">
        <Button variant="secondary" size="cab" icon="forum" block aria-expanded={showChat} onClick={() => setShowChat((s) => !s)}>
          {showChat ? 'Hide messages' : 'Message supervisor'}
        </Button>
        {showChat && today && (
          <ChatPanel
            supervisorId={today.supervisor?.user_id ?? today.user?.supervisor_id ?? task.supervisor_id}
            supervisorName={today.supervisor?.name ?? task.supervisor_name}
            meId={today.user?.user_id ?? task.operator_id}
            taskId={task.task_id}
          />
        )}
      </section>
    </>,
  );
}
