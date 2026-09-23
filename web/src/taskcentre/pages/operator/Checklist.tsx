/**
 * `/tc/op/task/:id/checklist` — the pre-start inspection an operator fills before a task starts.
 *
 * Same interaction as the cab checklist (screen 3), rebuilt for the phone: one column, 14 items in
 * 4 groups, PASS / FAIL / N-A on 56 px targets, and a FAIL that opens a required defect note.
 *
 * Two rules this screen keeps:
 * - **Nothing is lost.** Every answer is POSTed as it is given (notes debounced), so closing the
 *   screen mid-check keeps what was already answered.
 * - **The server decides.** Start task is enabled only when the API says `status.completed`, and a
 *   `409` is shown as what it is — the task did not start.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { errorText, opApi } from '../../api';
import { GmtTime, TcError, TcLoading } from '../../components';
import { Button, Chip, Icon, ProgressBar, cx } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import type {
  ChecklistAnswer,
  ChecklistItemView,
  ChecklistResult,
  ChecklistStatus,
  ChecklistView,
  OpToday,
  StartConflict,
} from '../../types';
import { Note, OfflineNote, OpPage, useOnline } from './common';
import { CHECKLIST_TITLE, startConflict, startErrorText } from './model';

/** How long a defect note rests before it is sent (typing should not fire a call per keystroke). */
const NOTE_DEBOUNCE_MS = 700;

const OPTIONS: Array<{ value: ChecklistResult; label: string; icon: string; on: string }> = [
  { value: 'pass', label: 'Pass', icon: 'check_circle', on: 'border-success bg-success text-white' },
  { value: 'fail', label: 'Fail', icon: 'cancel', on: 'border-danger bg-danger text-white' },
  { value: 'na', label: 'N/A', icon: 'do_not_disturb_on', on: 'border-on-surface-muted bg-surface-container-highest text-on-surface' },
];

/** Plain-language reading of a live telemetry signal named by an item. No value is invented here. */
const LIVE_SIGNAL_TEXT: Record<string, string> = {
  seatbelt: 'Buckle up and read the seatbelt value on the machine display before you answer.',
  proximity: 'Run the proximity self-test on the machine. Answer N/A if it is not fitted.',
  protection: 'Check the CAT Sentinel protection self-test on the machine display.',
};

interface Local {
  result: ChecklistResult | null;
  note: string;
}

// ---------------------------------------------------------------- one item
function ItemRow({
  item,
  value,
  note,
  saving,
  saved,
  error,
  flagged,
  onResult,
  onNote,
  onFlush,
  rowRef,
}: {
  item: ChecklistItemView;
  value: ChecklistResult | null;
  note: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  flagged: boolean;
  onResult: (r: ChecklistResult) => void;
  onNote: (text: string) => void;
  onFlush: () => void;
  rowRef: (el: HTMLLIElement | null) => void;
}) {
  const failed = value === 'fail';
  const needsNote = failed && !note.trim();
  return (
    <li
      ref={rowRef}
      className={cx(
        'panel p-4',
        failed && 'border-l-4 border-l-danger',
        value === 'pass' && 'border-l-4 border-l-success',
        flagged && !value && 'border-l-4 border-l-warning',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-display text-headline-sm text-on-surface">{item.label}</h3>
        {item.critical ? (
          <Chip icon="priority_high" tone="red">
            Critical
          </Chip>
        ) : (
          <Chip icon="check_indeterminate_small" tone="neutral">
            Not critical
          </Chip>
        )}
      </div>
      {item.hint && <p className="mt-1 text-body-md text-on-surface-muted">{item.hint}</p>}
      {item.live_signal && (
        <p className="mt-1 flex items-start gap-2 text-body-md text-on-surface-variant">
          <Icon name="sensors" size={20} className="mt-0.5 text-on-surface-muted" />
          <span>{LIVE_SIGNAL_TEXT[item.live_signal] ?? `Read the ${item.live_signal} value on the machine before you answer.`}</span>
        </p>
      )}

      <div role="radiogroup" aria-label={item.label} className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onResult(o.value)}
              className={cx(
                'flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-2 px-2 py-2 font-display text-label-lg uppercase',
                on ? o.on : 'border-outline-strong bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              <Icon name={o.icon} size={24} fill={on} />
              {o.label}
            </button>
          );
        })}
      </div>

      {failed && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`defect-${item.id}`} className="block font-display text-label-lg uppercase text-danger-text">
            Describe the defect <span aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </label>
          <textarea
            id={`defect-${item.id}`}
            rows={2}
            required
            aria-required="true"
            aria-invalid={needsNote}
            value={note}
            placeholder="What is wrong, and where?"
            onChange={(e) => onNote(e.target.value)}
            onBlur={onFlush}
            className="input h-auto min-h-[64px] w-full resize-none py-3 text-body-lg"
          />
          <p className="flex items-start gap-2 text-body-md text-danger-text">
            <Icon name="send" size={20} className="mt-0.5" />
            <span>
              This defect goes to your supervisor.
              {item.critical ? ' It is a critical item, so the task cannot start until it is cleared.' : ''}
            </span>
          </p>
          {needsNote && (
            <p className="flex items-start gap-2 text-body-md text-warning-text">
              <Icon name="edit_note" size={20} className="mt-0.5" />
              <span>Not saved yet — a failed item needs a description.</span>
            </p>
          )}
        </div>
      )}

      {(saving || saved || error) && (
        <p
          className={cx('mt-2 flex items-center gap-2 text-body-md', error ? 'text-danger-text' : 'text-on-surface-muted')}
          role={error ? 'alert' : 'status'}
        >
          <Icon name={error ? 'sync_problem' : saving ? 'sync' : 'cloud_done'} size={20} />
          {error ?? (saving ? 'Saving…' : 'Saved')}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- page
export default function Checklist() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const online = useOnline();
  const passed = (useLocation().state ?? null) as { conflict?: StartConflict } | null;

  const r = useResource<ChecklistView>(() => opApi.checklist(id), [id]);
  /** Only for the task's title — the checklist payload names the task by id alone. */
  const day = useResource<OpToday>(() => opApi.today(), [id]);

  const [local, setLocal] = useState<Record<string, Local>>({});
  const [status, setStatus] = useState<ChecklistStatus | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<StartConflict | null>(passed?.conflict ?? null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rows = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  const view = r.data;
  const items = useMemo(() => view?.items ?? [], [view]);
  const eff = status ?? view?.status ?? null;
  const task = (day.data?.tasks ?? []).find((t) => t.task_id === id);

  const answerOf = useCallback(
    (it: ChecklistItemView): Local => local[it.id] ?? { result: it.result, note: it.note ?? '' },
    [local],
  );

  const save = useCallback(
    async (answer: ChecklistAnswer) => {
      setSaving((s) => ({ ...s, [answer.item_id]: true }));
      setRowError((s) => ({ ...s, [answer.item_id]: '' }));
      try {
        const next = await opApi.saveChecklist(id, [answer]);
        if (next && typeof next === 'object') setStatus(next);
        setSavedIds((s) => ({ ...s, [answer.item_id]: true }));
      } catch (e) {
        setRowError((s) => ({ ...s, [answer.item_id]: errorText(e) }));
      } finally {
        setSaving((s) => {
          const n = { ...s };
          delete n[answer.item_id];
          return n;
        });
      }
    },
    [id],
  );

  const clearTimer = (itemId: string) => {
    const t = timers.current[itemId];
    if (t) {
      clearTimeout(t);
      delete timers.current[itemId];
    }
  };

  const setResult = (it: ChecklistItemView, result: ChecklistResult) => {
    const current = answerOf(it);
    const note = result === 'fail' ? current.note : '';
    clearTimer(it.id);
    setLocal((l) => ({ ...l, [it.id]: { result, note } }));
    setStartError(null);
    setConflict(null);
    // A fail is held back until it has a description — the API rejects one without a note (400).
    if (result === 'fail' && !note.trim()) {
      setSavedIds((s) => ({ ...s, [it.id]: false }));
      return;
    }
    void save(result === 'fail' ? { item_id: it.id, result, note: note.trim() } : { item_id: it.id, result });
  };

  const setNote = (it: ChecklistItemView, text: string) => {
    setLocal((l) => ({ ...l, [it.id]: { result: l[it.id]?.result ?? it.result, note: text } }));
    setSavedIds((s) => ({ ...s, [it.id]: false }));
    clearTimer(it.id);
    if (!text.trim()) return;
    timers.current[it.id] = setTimeout(() => {
      delete timers.current[it.id];
      void save({ item_id: it.id, result: 'fail', note: text.trim() });
    }, NOTE_DEBOUNCE_MS);
  };

  /** Send a pending note straight away (on blur) rather than waiting out the debounce. */
  const flushNote = (it: ChecklistItemView) => {
    const note = answerOf(it).note.trim();
    if (!timers.current[it.id] || !note) return;
    clearTimer(it.id);
    void save({ item_id: it.id, result: 'fail', note });
  };

  const answers = items.map(answerOf);
  const answered = answers.filter((a) => a.result).length;
  const total = items.length;
  const needsNote = items.filter((it) => {
    const a = answerOf(it);
    return a.result === 'fail' && !a.note.trim();
  });
  const failedItems = items.filter((it) => answerOf(it).result === 'fail');
  const criticalFails = failedItems.filter((it) => it.critical);
  const inFlight = Object.keys(saving).length > 0 || Object.keys(timers.current).length > 0;

  const missing = conflict?.missing ?? eff?.missing ?? [];
  const blocked = eff?.blocked === true || conflict?.error === 'checklist_critical_failed';
  const ticketId = conflict?.ticket_id ?? null;
  const blockedList = conflict?.failed_critical ?? eff?.failed_critical ?? [];

  const startTask = async () => {
    setStarting(true);
    setStartError(null);
    setConflict(null);
    try {
      await opApi.startTask(id);
      nav(`/tc/op/task/${id}`);
    } catch (e) {
      const c = startConflict(e);
      if (c) {
        setConflict(c);
        r.reload();
        const first = c.missing?.[0];
        if (first) rows.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setStartError(startErrorText(e));
      }
    } finally {
      setStarting(false);
    }
  };

  const groups = (view?.groups ?? []).map((g) => ({ ...g, items: items.filter((it) => it.group === g.id) }));
  const known = new Set((view?.groups ?? []).map((g) => g.id));
  const ungrouped = items.filter((it) => !known.has(it.group));
  if (ungrouped.length > 0) groups.push({ id: '__other', label: 'Other checks', items: ungrouped });

  const header = (children: ReactNode) => (
    <OpPage
      title={CHECKLIST_TITLE}
      sub={task ? `${task.title} · all times GMT` : 'Fill this before the task can start · all times GMT'}
      back={{ to: `/tc/op/task/${id}`, label: 'Task' }}
    >
      {!online && <OfflineNote />}
      {children}
    </OpPage>
  );

  if (r.loading && !view) return header(<TcLoading label="Loading the pre-start check" />);
  if (r.error && !view) return header(<TcError error={r.error} what="The pre-start check" onRetry={r.reload} />);
  if (!view) return header(<TcError error={r.error} what="The pre-start check" onRetry={r.reload} />);

  return header(
    <>
      <section className="panel space-y-2 p-4" aria-label="Progress">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-label-sm uppercase text-on-surface-muted">Answered</div>
            <div className="font-display text-headline-lg tnum text-on-surface" aria-live="polite">
              {answered} / {total} answered
            </div>
          </div>
          <div className="text-right font-display text-label-md uppercase text-on-surface-muted">
            {inFlight ? (
              <span className="flex items-center gap-1 text-on-surface-variant">
                <Icon name="sync" size={20} /> Saving
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Icon name="cloud_done" size={20} /> Saved as you go
              </span>
            )}
          </div>
        </div>
        <ProgressBar pct={total ? (answered / total) * 100 : 0} tone={criticalFails.length > 0 ? 'red' : answered === total ? 'green' : 'yellow'} />
        <div className="flex flex-wrap items-center gap-2">
          {failedItems.length > 0 && (
            <Chip icon="report" tone="red">
              {failedItems.length} defect{failedItems.length === 1 ? '' : 's'} flagged
            </Chip>
          )}
          {criticalFails.length > 0 && (
            <Chip icon="block" tone="red">
              {criticalFails.length} critical — start blocked
            </Chip>
          )}
          {needsNote.length > 0 && (
            <Chip icon="edit_note" tone="orange">
              {needsNote.length} defect{needsNote.length === 1 ? '' : 's'} need a description
            </Chip>
          )}
          {eff?.signed_at && (
            <Chip icon="draw" tone="green">
              Signed <GmtTime ts={eff.signed_at} gmt={eff.signed_at_gmt} />
              {eff.signed_by ? ` · ${eff.signed_by}` : ''}
            </Chip>
          )}
        </div>
        <p className="text-body-md text-on-surface-muted">
          Answer every item. Each answer is sent as you give it, so nothing is lost if you leave this screen.
        </p>
      </section>

      {r.error && view && (
        <Note tone="warn" icon="sync_problem" title="This list may be out of date">
          The last refresh failed: {errorText(r.error)}
        </Note>
      )}

      {conflict && (
        <Note
          tone={conflict.error === 'checklist_critical_failed' ? 'danger' : 'warn'}
          icon="block"
          title="The task did not start"
          role="alert"
        >
          {conflict.error === 'checklist_incomplete' ? (
            <p>
              The pre-start check is not finished
              {typeof conflict.answered === 'number' && typeof conflict.total === 'number'
                ? ` — ${conflict.answered} of ${conflict.total} answered.`
                : '.'}{' '}
              The items still to answer are marked below.
            </p>
          ) : conflict.error === 'checklist_critical_failed' ? (
            <p>A critical item failed this check, so this task cannot start.</p>
          ) : (
            <p>{conflict.message}</p>
          )}
        </Note>
      )}

      {startError && (
        <Note tone="danger" icon="error" title="Start task failed" role="alert">
          {startError}
        </Note>
      )}

      {groups.map((g, gi) => {
        const done = g.items.filter((it) => answerOf(it).result).length;
        return (
          <section key={g.id} aria-label={g.label} className="space-y-2">
            <div className="flex items-end justify-between gap-2 pt-2">
              <h2 className="font-display text-label-lg uppercase text-on-surface-muted">
                {gi + 1}. {g.label}
              </h2>
              <span className="font-display text-label-md tnum text-on-surface-variant">
                {done}/{g.items.length}
              </span>
            </div>
            <ul className="space-y-3">
              {g.items.map((it) => {
                const a = answerOf(it);
                return (
                  <ItemRow
                    key={it.id}
                    item={it}
                    value={a.result}
                    note={a.note}
                    saving={saving[it.id] === true}
                    saved={savedIds[it.id] === true && !saving[it.id]}
                    error={rowError[it.id] || null}
                    flagged={missing.includes(it.id)}
                    onResult={(v) => setResult(it, v)}
                    onNote={(t) => setNote(it, t)}
                    onFlush={() => flushNote(it)}
                    rowRef={(el) => {
                      rows.current[it.id] = el;
                    }}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {blocked ? (
        <Note tone="danger" icon="block" title="This task cannot start" role="alert">
          <p>
            A critical item failed the pre-start check. Starting the task is stopped here on purpose, and your supervisor has
            been notified — there is nothing else for you to do on this screen.
          </p>
          {blockedList.length > 0 && (
            <ul className="ml-5 mt-2 list-disc space-y-1">
              {blockedList.map((f) => (
                <li key={f.item_id}>
                  {f.label}
                  {f.note ? ` — ${f.note}` : ''}
                </li>
              ))}
            </ul>
          )}
          {ticketId && (
            <p className="mt-2 flex items-center gap-2">
              <Icon name="confirmation_number" size={20} />
              Supervisor review reference: <span className="font-display tnum">{ticketId}</span>
            </p>
          )}
          <div className="mt-3">
            <Button variant="secondary" size="cab" icon="forum" block onClick={() => nav(`/tc/op/task/${id}`)}>
              Back to the task
            </Button>
          </div>
        </Note>
      ) : (
        <>
          <Button
            variant="primary"
            size="xl"
            icon="play_arrow"
            block
            className="h-20"
            disabled={starting || !eff?.completed || inFlight || needsNote.length > 0}
            onClick={() => void startTask()}
          >
            {starting ? 'Starting…' : 'Start task'}
          </Button>
          <p className="text-body-md text-on-surface-muted" role="status">
            {needsNote.length > 0
              ? `Describe the defect on ${needsNote.length} item${needsNote.length === 1 ? '' : 's'} before you can start.`
              : inFlight
                ? 'Saving your last answer…'
                : eff?.completed
                  ? 'All items answered. Starting the task records the time in GMT.'
                  : `${total - answered} item${total - answered === 1 ? '' : 's'} still to answer before this task can start.`}
          </p>
        </>
      )}
    </>,
  );
}
