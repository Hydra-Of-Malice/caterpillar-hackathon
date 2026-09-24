/**
 * Assign a task to an operator (POST /tc/sup/tasks). Opened as a modal from the team dashboard and
 * from an operator's page — it is not a route of its own.
 *
 * The two datetime fields are typed in the browser's timezone, converted to UTC seconds, and echoed
 * back as the exact UTC value that will be stored. Checkpoints are built row by row: each row is a
 * checkbox or a counted target (0/3) with a required toggle, and rows can be added, removed and
 * reordered.
 */
import { useEffect, useMemo, useState } from 'react';
import { sup } from '../../api';
import { TcError } from '../../components';
import { fmtDateTime } from '../../time';
import type { Priority, SupOperatorRow, TaskCreate as TaskCreateBody, TcTask } from '../../types';
import { Button, Modal, Toggle } from '../../../components/ui';
import { Chip, Field, Icon, cx, operatorName } from './common';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];
const MAX_TITLE = 120;
const MAX_TARGET = 99;

// ---------------------------------------------------------------- local time <-> UTC seconds
const pad = (n: number) => String(n).padStart(2, '0');

/** UTC seconds -> the value of a `datetime-local` input, in the browser's timezone. */
function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value (browser timezone) -> UTC seconds, or null when unparseable. */
function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 1000) : null;
}

/** "UTC+05:30" — the browser's own offset, so the supervisor can read what they typed. */
function browserOffsetLabel(): string {
  const mins = -new Date().getTimezoneOffset();
  const sign = mins < 0 ? '-' : '+';
  const a = Math.abs(mins);
  return `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

const defaultStart = (): number => Math.ceil(Date.now() / 1000 / 300) * 300;

function durationLabel(seconds: number): string {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${pad(r)} min`;
}

// ---------------------------------------------------------------- checkpoint rows
interface Row {
  key: string;
  label: string;
  kind: 'checkbox' | 'counted';
  target: number;
  required: boolean;
}

let rowSeq = 0;
function newRow(kind: Row['kind'] = 'checkbox'): Row {
  rowSeq += 1;
  return { key: `cp-${rowSeq}`, label: '', kind, target: kind === 'counted' ? 3 : 1, required: true };
}

interface Errors {
  operator?: string;
  title?: string;
  location?: string;
  start?: string;
  finish?: string;
  checkpoints?: string;
}

export interface TaskCreateProps {
  open: boolean;
  onClose: () => void;
  /** The supervisor's own operators. The task is assigned to exactly one of them. */
  operators: SupOperatorRow[];
  defaultOperatorId?: string;
  onCreated: (task?: TcTask) => void;
}

export function TaskCreate({ open, onClose, operators, defaultOperatorId, onCreated }: TaskCreateProps) {
  const [operatorId, setOperatorId] = useState(defaultOperatorId ?? '');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [location, setLocation] = useState('');
  const [machine, setMachine] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [startInput, setStartInput] = useState(() => toLocalInput(defaultStart()));
  const [finishInput, setFinishInput] = useState(() => toLocalInput(defaultStart() + 2 * 3600));
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && defaultOperatorId) setOperatorId((cur) => cur || defaultOperatorId);
  }, [open, defaultOperatorId]);

  const operator = operators.find((o) => o.user_id === operatorId);
  useEffect(() => {
    const m = operator?.machine_id ?? operator?.user?.machine_id;
    if (m) setMachine((cur) => cur || m);
  }, [operator]);

  const startTs = fromLocalInput(startInput);
  const finishTs = fromLocalInput(finishInput);
  const plannedWindow = startTs !== null && finishTs !== null && finishTs > startTs ? finishTs - startTs : null;
  const requiredCount = useMemo(() => rows.filter((r) => r.required && r.label.trim()).length, [rows]);

  const reset = () => {
    setOperatorId(defaultOperatorId ?? '');
    setTitle('');
    setInstructions('');
    setLocation('');
    setMachine('');
    setPriority('normal');
    setStartInput(toLocalInput(defaultStart()));
    setFinishInput(toLocalInput(defaultStart() + 2 * 3600));
    setRows([newRow()]);
    setErrors({});
    setServerError(undefined);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const moveRow = (key: string, delta: -1 | 1) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const validate = (): Errors => {
    const e: Errors = {};
    if (!operatorId) e.operator = 'Choose the operator this task is for.';
    if (!title.trim()) e.title = 'Give the task a title.';
    else if (title.trim().length > MAX_TITLE) e.title = `Keep the title under ${MAX_TITLE} characters.`;
    if (!location.trim()) e.location = 'Say where on site this happens.';
    if (startTs === null) e.start = 'Enter a start time.';
    if (finishTs === null) e.finish = 'Enter an expected finish time.';
    else if (startTs !== null && finishTs <= startTs) e.finish = 'The expected finish must be after the start.';
    const filled = rows.filter((r) => r.label.trim());
    if (filled.length !== rows.length) e.checkpoints = 'Every checkpoint needs a label, or remove the empty row.';
    else if (filled.some((r) => r.kind === 'counted' && (!Number.isFinite(r.target) || r.target < 1 || r.target > MAX_TARGET)))
      e.checkpoints = `A counted target must be between 1 and ${MAX_TARGET}.`;
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    setServerError(undefined);
    if (Object.keys(e).length > 0 || startTs === null || finishTs === null) return;
    const body: TaskCreateBody = {
      operator_id: operatorId,
      title: title.trim(),
      instructions: instructions.trim(),
      location: location.trim(),
      machine_id: machine.trim() || null,
      priority,
      start_ts: startTs,
      expected_finish_ts: finishTs,
      checkpoints: rows
        .filter((r) => r.label.trim())
        .map((r) => ({ label: r.label.trim(), kind: r.kind, target: r.kind === 'counted' ? Math.round(r.target) : 1, required: r.required })),
    };
    setBusy(true);
    try {
      const created = await sup.createTask(body);
      reset();
      onCreated(created);
      onClose();
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Assign a task"
      width="max-w-[840px]"
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="assignment_add" onClick={submit} disabled={busy}>
            {busy ? 'Assigning…' : 'Assign task'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Operator" error={errors.operator} hint="Only your own team can be assigned work.">
            <select className="select" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
              <option value="">Select an operator…</option>
              {operators.map((o) => (
                <option key={o.user_id} value={o.user_id}>
                  {operatorName(o)}
                  {o.machine_id ? ` — ${o.machine_id}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Title" error={errors.title} hint={`${title.length}/${MAX_TITLE} characters.`}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} placeholder="Clear the north bench access road" />
        </Field>

        <Field label="Instructions" hint="What good looks like, and anything the operator must watch for.">
          <textarea
            className="input h-28 py-2 leading-6"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Keep the haul road clear for the water truck. Stop and call if the bench edge looks soft."
          />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Location" error={errors.location} hint="Where on site — bench, pit, stockpile, workshop.">
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="North bench, level 3" />
          </Field>
          <Field label="Machine (optional)" hint="Leave blank if the task does not need a machine.">
            <input className="input" value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="EX-07" />
          </Field>
        </div>

        {/* ------------------------------------------------ timing */}
        <section className="border border-outline bg-surface-container-low p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-headline-sm text-on-surface">Timing</h3>
            <span className="text-body-sm text-on-surface-muted">You type in your own timezone ({browserOffsetLabel()}); the task is stored and compared in UTC.</span>
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <Field label="Start time" error={errors.start}>
              <input className="input" type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
              <StoredAs ts={startTs} />
            </Field>
            <Field label="Expected finish time" error={errors.finish}>
              <input className="input" type="datetime-local" value={finishInput} onChange={(e) => setFinishInput(e.target.value)} />
              <StoredAs ts={finishTs} />
            </Field>
          </div>
          <p className="mt-3 text-body-sm text-on-surface-muted">
            {plannedWindow ? (
              <>
                Planned window <span className="text-on-surface tnum">{durationLabel(plannedWindow)}</span>. Finishing after the expected finish opens a task
                overrun review flag for you — a prompt to look, not a penalty.
              </>
            ) : (
              'Set a start and an expected finish to see the planned window.'
            )}
          </p>
        </section>

        {/* ------------------------------------------------ checkpoints */}
        <section className="border border-outline bg-surface-container-low p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-headline-sm text-on-surface">Checkpoints</h3>
            <span className="text-body-sm text-on-surface-muted">
              {rows.length === 0 ? 'No checkpoints' : `${rows.length} row${rows.length === 1 ? '' : 's'} · ${requiredCount} required`}
            </span>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-muted">
            A checkbox is done or not done. A counted target is a number the operator counts up to, such as 0/3. The operator cannot finish the task while a
            required checkpoint is unmet, unless you resolve the exception.
          </p>

          {rows.length === 0 ? (
            <p className="mt-4 text-body-sm text-on-surface-muted">No checkpoints — the operator simply marks the task finished.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rows.map((r, i) => (
                <li key={r.key} className="border border-outline bg-surface-container-lowest p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="mb-3 font-display text-label-sm uppercase text-on-surface-muted tnum">{i + 1}</span>
                    <label className="min-w-[200px] flex-1">
                      <span className="font-display text-label-sm uppercase text-on-surface-muted">Label</span>
                      <input
                        className="input mt-1"
                        value={r.label}
                        onChange={(e) => setRow(r.key, { label: e.target.value })}
                        placeholder={r.kind === 'counted' ? 'Loads hauled to the crusher' : 'Walk-around check done'}
                      />
                    </label>
                    <label>
                      <span className="font-display text-label-sm uppercase text-on-surface-muted">Type</span>
                      <select
                        className="select mt-1 w-[160px]"
                        value={r.kind}
                        onChange={(e) => {
                          const kind = e.target.value as Row['kind'];
                          setRow(r.key, { kind, target: kind === 'counted' ? Math.max(2, r.target) : 1 });
                        }}
                      >
                        <option value="checkbox">Checkbox</option>
                        <option value="counted">Counted target</option>
                      </select>
                    </label>
                    {r.kind === 'counted' && (
                      <label>
                        <span className="font-display text-label-sm uppercase text-on-surface-muted">Target</span>
                        <input
                          className="input mt-1 w-[96px] tnum"
                          type="number"
                          min={1}
                          max={MAX_TARGET}
                          value={r.target}
                          onChange={(e) => setRow(r.key, { target: Number(e.target.value) })}
                        />
                      </label>
                    )}
                    <div className="flex items-center gap-1 pb-1">
                      <IconBtn icon="arrow_upward" label={`Move checkpoint ${i + 1} up`} disabled={i === 0} onClick={() => moveRow(r.key, -1)} />
                      <IconBtn icon="arrow_downward" label={`Move checkpoint ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => moveRow(r.key, 1)} />
                      <IconBtn icon="delete" label={`Remove checkpoint ${i + 1}`} onClick={() => removeRow(r.key)} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Toggle on={r.required} onChange={(v) => setRow(r.key, { required: v })} label="Required to finish the task" />
                    <Chip tone="neutral">{r.kind === 'counted' ? `0 / ${Math.max(1, Math.round(r.target) || 1)}` : 'Checkbox'}</Chip>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon="add" onClick={() => setRows((rs) => [...rs, newRow('checkbox')])}>
              Add checkbox
            </Button>
            <Button size="sm" icon="add" onClick={() => setRows((rs) => [...rs, newRow('counted')])}>
              Add counted target
            </Button>
          </div>
          {errors.checkpoints && <p className="mt-2 text-body-sm text-danger-text">{errors.checkpoints}</p>}
        </section>

        {serverError !== undefined && <TcError error={serverError} what="The task" />}
      </div>
    </Modal>
  );
}

/** The exact UTC seconds that will be stored for a datetime input, with the local reading. */
function StoredAs({ ts }: { ts: number | null }) {
  return (
    <span className="mt-1 block text-body-sm text-on-surface-muted tnum">
      {ts === null ? (
        'Stored as —'
      ) : (
        <>
          Stored as <span className="text-on-surface">{fmtDateTime(ts)}</span> · {ts} s UTC
        </>
      )}
    </span>
  );
}

function IconBtn({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cx(
        'flex h-11 w-11 items-center justify-center border border-outline text-on-surface-variant transition-colors',
        'hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

export default TaskCreate;
