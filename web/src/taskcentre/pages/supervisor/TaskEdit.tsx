/**
 * Edit or cancel one of an operator's tasks (`PATCH /tc/sup/tasks/{task_id}`).
 *
 * An operator usually has more than one task, so the modal opens on a picker and then edits the one
 * chosen. Two things the server enforces and this form states rather than hides:
 *
 *  - **a completed task is frozen** (the API answers 409), so it is listed but not editable. Work
 *    the operator has already finished is a record, not a draft;
 *  - **cancelling is not deleting.** The task keeps its history and the operator is told; nothing is
 *    removed from the audit trail. The button says so, and asks once before it acts.
 */
import { useEffect, useMemo, useState } from 'react';
import { sup } from '../../api';
import { TcError } from '../../components';
import { fmtDateTime } from '../../time';
import type { Priority, SupOperatorRow, TcTask } from '../../types';
import { Button, Modal } from '../../../components/ui';
import { Chip, Field, Icon, TaskStatusChip, cx, operatorName } from './common';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

/** `<input type="datetime-local">` and this screen both speak the reader's zone; the API stores UTC. */
function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string): number => new Date(v).getTime() / 1000;

interface Props {
  open: boolean;
  onClose: () => void;
  operator?: SupOperatorRow;
  tasks: TcTask[];
  now: number;
  onSaved: () => void;
}

export function TaskEdit({ open, onClose, operator, tasks, now, onSaved }: Props) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const mine = useMemo(
    () => tasks.filter((t) => t.operator_id === operator?.user_id).sort((a, b) => a.expected_finish_ts - b.expected_finish_ts),
    [tasks, operator],
  );
  const task = mine.find((t) => t.task_id === taskId) ?? null;

  // A fresh open starts at the picker; landing straight in a form for a task nobody chose is how a
  // supervisor edits the wrong one.
  useEffect(() => {
    if (open) setTaskId(mine.length === 1 ? mine[0].task_id : null);
  }, [open, mine.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-[720px]"
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{task ? 'Edit task' : 'Edit a task'}</span>
          {operator && <span className="text-body-md font-normal text-on-surface-muted">{operatorName(operator)}</span>}
        </span>
      }
    >
      {mine.length === 0 ? (
        <p className="py-6 text-body-md text-on-surface-muted">
          {operator ? operatorName(operator) : 'This operator'} has no tasks today, so there is nothing to edit. Use{' '}
          <strong className="text-on-surface">Add task</strong> to give them their first one.
        </p>
      ) : task ? (
        <EditForm
          task={task}
          now={now}
          onBack={mine.length > 1 ? () => setTaskId(null) : undefined}
          onDone={() => {
            onSaved();
            onClose();
          }}
        />
      ) : (
        <Picker tasks={mine} now={now} onPick={setTaskId} />
      )}
    </Modal>
  );
}

function Picker({ tasks, now, onPick }: { tasks: TcTask[]; now: number; onPick: (id: string) => void }) {
  return (
    <>
      <p className="mb-3 text-body-md text-on-surface-muted">Choose the task to edit. A completed task cannot be changed.</p>
      <ul className="divide-y divide-outline border-y border-outline">
        {tasks.map((t) => {
          const frozen = t.status === 'completed';
          return (
            <li key={t.task_id}>
              <button
                type="button"
                disabled={frozen}
                onClick={() => onPick(t.task_id)}
                className={cx(
                  'flex w-full items-center gap-3 px-1 py-3 text-left',
                  frozen ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-container-high',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-md text-on-surface">{t.title}</span>
                  <span className="block text-body-sm text-on-surface-muted">
                    Expected finish {fmtDateTime(t.expected_finish_ts)}
                    {frozen ? ' · completed, frozen' : ''}
                  </span>
                </span>
                <TaskStatusChip task={t} now={now} />
                {!frozen && <Icon name="chevron_right" size={20} className="shrink-0 text-on-surface-muted" />}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function EditForm({ task, now, onBack, onDone }: { task: TcTask; now: number; onBack?: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [instructions, setInstructions] = useState(task.instructions ?? '');
  const [location, setLocation] = useState(task.location ?? '');
  const [machine, setMachine] = useState(task.machine_id ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [startInput, setStartInput] = useState(() => toLocalInput(task.start_ts));
  const [finishInput, setFinishInput] = useState(() => toLocalInput(task.expected_finish_ts));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState<'save' | 'cancel' | null>(null);

  const startTs = fromLocalInput(startInput);
  const finishTs = fromLocalInput(finishInput);
  const badWindow = !Number.isFinite(startTs) || !Number.isFinite(finishTs) || finishTs <= startTs;
  const noTitle = title.trim().length === 0;

  const save = async () => {
    if (badWindow || noTitle) return;
    setBusy('save');
    setError(undefined);
    try {
      await sup.updateTask(task.task_id, {
        title: title.trim(),
        instructions: instructions.trim(),
        location: location.trim(),
        machine_id: machine.trim(),
        priority,
        start_ts: startTs,
        expected_finish_ts: finishTs,
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const cancelTask = async () => {
    setBusy('cancel');
    setError(undefined);
    try {
      await sup.updateTask(task.task_id, { status: 'cancelled' });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-body-sm text-notice-dark hover:underline">
          <Icon name="arrow_back" size={18} /> All tasks
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusChip task={task} now={now} />
        {task.status === 'ongoing' && <Chip tone="blue" icon="play_circle">Started — the operator is on this now</Chip>}
      </div>

      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {noTitle && <p className="text-body-sm text-danger-text">A task needs a title.</p>}

      <Field label="Instructions" hint="What the operator should actually do.">
        <textarea className="input h-24 py-2" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location">
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Machine">
          <input className="input" value={machine} onChange={(e) => setMachine(e.target.value)} />
        </Field>
        <Field label="Start" hint={Number.isFinite(startTs) ? fmtDateTime(startTs) : undefined}>
          <input type="datetime-local" className="input" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
        </Field>
        <Field label="Expected finish" hint={Number.isFinite(finishTs) ? fmtDateTime(finishTs) : undefined}>
          <input type="datetime-local" className="input" value={finishInput} onChange={(e) => setFinishInput(e.target.value)} />
        </Field>
      </div>
      {badWindow && <p className="text-body-sm text-danger-text">The expected finish must be after the start.</p>}

      <Field label="Priority">
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cx(
                'h-10 border px-3 text-body-md capitalize',
                priority === p ? 'border-cat bg-cat/15 text-on-surface' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>

      {error !== undefined && <TcError error={error} what="The change" />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-4">
        {confirmCancel ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-on-surface">
              Cancel this task? It keeps its history and {task.operator_name ?? 'the operator'} is told.
            </span>
            <Button size="sm" variant="danger" icon="block" disabled={busy !== null} onClick={cancelTask}>
              {busy === 'cancel' ? 'Cancelling…' : 'Yes, cancel it'}
            </Button>
            <Button size="sm" disabled={busy !== null} onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button size="sm" icon="block" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
            Cancel task
          </Button>
        )}
        <Button variant="primary" icon="save" disabled={busy !== null || badWindow || noTitle} onClick={save}>
          {busy === 'save' ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
      <p className="text-body-sm text-on-surface-muted">
        Cancelling does not delete anything: the task and its progress stay in the record, marked cancelled.
      </p>
    </div>
  );
}

export default TaskEdit;
