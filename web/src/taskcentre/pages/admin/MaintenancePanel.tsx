/**
 * One machine's work orders: the list, and the dialogs that manage them.
 *
 * A work order is scheduled, started (the machine leaves service: `down` for a repair,
 * `maintenance` otherwise), completed (the machine returns; the meter reading is kept) or
 * cancelled. Past work can be logged as already done. Every change is appended to the record's
 * history by the API, and the history is shown here, so nothing is silently rewritten.
 */
import { useMemo, useState } from 'react';
import { Card, Caveat } from '../../../components/ops/layout';
import { Button, Chip, Icon, Modal, Segmented, cx, toast } from '../../../components/ui';
import { adminApi } from '../../api';
import { LocalTime } from '../../components/LocalTime';
import { TcEmpty, TcError } from '../../components/States';
import { SimulatedChip } from '../../components/Badges';
import type { MaintenanceCreate, MaintenanceKind, MaintenanceRecord } from '../../types';
import { Field } from '../supervisor/common';
import { KIND_META, KindLabel, WorkOrderStatusChip, fmtHours, fmtMeter } from './fleetParts';

type Filter = 'open' | 'all' | 'service' | 'repair' | 'inspection';

// ---------------------------------------------------------------- datetime-local helpers
const pad = (n: number) => String(n).padStart(2, '0');

/** UTC seconds -> the value a `datetime-local` input wants, in the reader's own zone. */
export function toLocalInput(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value (reader's zone) -> UTC seconds, or null when empty. */
export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms / 1000 : null;
}

const numOrNull = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------------------------------------------------------------- panel
export function MaintenancePanel({
  machineId,
  records,
  meterNow,
  onChanged,
  onCreate,
}: {
  machineId: string;
  records: MaintenanceRecord[];
  meterNow: number | null;
  onChanged: () => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const [acting, setActing] = useState<{ rec: MaintenanceRecord; mode: 'complete' | 'cancel' | 'edit' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(undefined);

  const shown = useMemo(() => {
    const list = records.filter((r) => (filter === 'open' ? r.open : filter === 'all' ? true : r.kind === filter));
    // Open work first (in progress, then soonest scheduled), then the most recent history.
    return [...list].sort((a, b) => {
      const rank = (r: MaintenanceRecord) => (r.status === 'in_progress' ? 0 : r.status === 'scheduled' ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (rank(a) === 1) return (a.scheduled_for ?? a.created_at) - (b.scheduled_for ?? b.created_at);
      return (b.completed_at ?? b.started_at ?? b.created_at) - (a.completed_at ?? a.started_at ?? a.created_at);
    });
  }, [records, filter]);

  const openCount = records.filter((r) => r.open).length;

  const start = async (rec: MaintenanceRecord) => {
    setBusyId(rec.maintenance_id);
    setError(undefined);
    try {
      await adminApi.maintenanceAction(rec.maintenance_id, 'start');
      toast(`${rec.title}: started — ${machineId} is out of service`, 'ok');
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card
      title="Maintenance"
      sub={`${records.length} work orders · ${openCount} open`}
      right={
        <Button variant="primary" size="sm" icon="add" onClick={onCreate}>
          New work order
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Open (${openCount})` },
            { value: 'all', label: 'All' },
            { value: 'service', label: 'Services' },
            { value: 'repair', label: 'Repairs' },
            { value: 'inspection', label: 'Inspections' },
          ]}
        />
      </div>
      {error !== undefined && <TcError error={error} what="The work order" className="mb-4" />}
      {shown.length === 0 ? (
        <TcEmpty icon="handyman" title={filter === 'open' ? 'No open work orders' : 'No work orders here'}>
          {filter === 'open' ? 'Nothing is scheduled or in progress for this machine. Use “New work order” to plan a service or record a repair.' : 'No records match this filter.'}
        </TcEmpty>
      ) : (
        <ul className="divide-y divide-outline">
          {shown.map((r) => (
            <WorkOrderRow
              key={r.maintenance_id}
              rec={r}
              busy={busyId === r.maintenance_id}
              onStart={() => start(r)}
              onComplete={() => setActing({ rec: r, mode: 'complete' })}
              onCancel={() => setActing({ rec: r, mode: 'cancel' })}
              onEdit={() => setActing({ rec: r, mode: 'edit' })}
            />
          ))}
        </ul>
      )}
      {acting && (
        <WorkOrderActionModal
          rec={acting.rec}
          mode={acting.mode}
          meterNow={meterNow}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function WorkOrderRow({ rec, busy, onStart, onComplete, onCancel, onEdit }: { rec: MaintenanceRecord; busy: boolean; onStart: () => void; onComplete: () => void; onCancel: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <WorkOrderStatusChip status={rec.status} />
            <KindLabel kind={rec.kind} />
            {rec.overdue && (
              <Chip tone="red" icon="warning">
                Past its date
              </Chip>
            )}
            {rec.source === 'SIMULATED' && <SimulatedChip />}
          </div>
          <p className="mt-1.5 font-semibold text-on-surface">{rec.title}</p>
          {rec.detail && <p className="text-body-sm text-on-surface-muted">{rec.detail}</p>}
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
            {rec.status === 'scheduled' && (
              <Meta label="Scheduled">
                <LocalTime ts={rec.scheduled_for} gmt={rec.scheduled_for_gmt} mode="datetime" missing="no date set" />
              </Meta>
            )}
            {rec.started_at && (
              <Meta label="Started">
                <LocalTime ts={rec.started_at} gmt={rec.started_at_gmt} mode="datetime" />
              </Meta>
            )}
            {rec.completed_at && (
              <Meta label="Completed">
                <LocalTime ts={rec.completed_at} gmt={rec.completed_at_gmt} mode="datetime" />
              </Meta>
            )}
            {rec.duration_h !== null && <Meta label={rec.status === 'in_progress' ? 'Running for' : 'Took'}>{fmtHours(rec.duration_h)}</Meta>}
            {rec.downtime_h !== null && <Meta label="Machine downtime">{fmtHours(rec.downtime_h)}</Meta>}
            {rec.hour_meter_h !== null && <Meta label="Meter">{fmtMeter(rec.hour_meter_h)}</Meta>}
            {rec.performed_by && <Meta label="By">{rec.performed_by}</Meta>}
          </dl>
          {rec.notes && <p className="mt-2 text-body-sm text-on-surface-variant">“{rec.notes}”</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {rec.status === 'scheduled' && (
            <Button size="sm" icon="play_arrow" onClick={onStart} disabled={busy}>
              {busy ? 'Starting…' : 'Start'}
            </Button>
          )}
          {rec.open && (
            <Button size="sm" variant="primary" icon="task_alt" onClick={onComplete} disabled={busy}>
              Complete
            </Button>
          )}
          <Button size="sm" variant="ghost" icon="edit" onClick={onEdit} disabled={busy} aria-label="Edit">
            Edit
          </Button>
          {rec.open && (
            <Button size="sm" variant="ghost" icon="close" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      {rec.history.length > 0 && (
        <div className="mt-2">
          <button type="button" className="inline-flex items-center gap-1 text-body-sm text-notice-dark hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
            History ({rec.history.length})
          </button>
          {open && (
            <ol className="mt-2 space-y-1 border-l border-outline pl-4 text-body-sm text-on-surface-muted">
              {rec.history.map((h, i) => (
                <li key={i}>
                  <LocalTime ts={h.ts} gmt={h.ts_gmt} mode="datetime" /> · <span className="text-on-surface-variant">{h.action.replace(/_/g, ' ')}</span>
                  {h.by_name ? ` by ${h.by_name}` : ''}
                  {h.note ? ` — “${h.note}”` : ''}
                  {h.data && h.action === 'edited' ? ` (${Object.keys(h.data).join(', ')})` : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-on-surface-muted">{label}</dt>
      <dd className="text-on-surface tnum">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- create
type CreateMode = 'schedule' | 'start' | 'log';

export function NewWorkOrderModal({
  machineId,
  open,
  preset,
  meterNow,
  onClose,
  onCreated,
}: {
  machineId: string;
  open: boolean;
  /** Opens the dialog pre-filled, e.g. "Report breakdown" = a repair started now. */
  preset?: { kind: MaintenanceKind; mode: CreateMode; title?: string } | null;
  meterNow: number | null;
  onClose: () => void;
  onCreated: (rec: MaintenanceRecord) => void;
}) {
  return open ? <NewWorkOrderForm key={`${preset?.kind}-${preset?.mode}`} machineId={machineId} preset={preset} meterNow={meterNow} onClose={onClose} onCreated={onCreated} /> : null;
}

function NewWorkOrderForm({ machineId, preset, meterNow, onClose, onCreated }: { machineId: string; preset?: { kind: MaintenanceKind; mode: CreateMode; title?: string } | null; meterNow: number | null; onClose: () => void; onCreated: (rec: MaintenanceRecord) => void }) {
  const [kind, setKind] = useState<MaintenanceKind>(preset?.kind ?? 'service');
  const [mode, setMode] = useState<CreateMode>(preset?.mode ?? 'schedule');
  const [title, setTitle] = useState(preset?.title ?? '');
  const [detail, setDetail] = useState('');
  const [when, setWhen] = useState(toLocalInput(Date.now() / 1000 + 86_400));
  const [doneAt, setDoneAt] = useState(toLocalInput(Date.now() / 1000));
  const [meter, setMeter] = useState('');
  const [by, setBy] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [titleError, setTitleError] = useState<string | undefined>();

  const submit = async () => {
    if (!title.trim()) {
      setTitleError('Say what the work is, e.g. “500 h service” or “Boom hose leak”.');
      return;
    }
    setTitleError(undefined);
    const body: MaintenanceCreate = { kind, title: title.trim(), detail: detail.trim() };
    if (mode === 'schedule') body.scheduled_for = fromLocalInput(when);
    if (mode === 'start') body.start_now = true;
    if (mode === 'log') {
      body.completed_at = fromLocalInput(doneAt) ?? Date.now() / 1000;
      body.hour_meter_h = numOrNull(meter);
      body.performed_by = by.trim();
      body.notes = notes.trim();
    }
    setBusy(true);
    setError(undefined);
    try {
      const rec = await adminApi.createMaintenance(machineId, body);
      toast(mode === 'start' ? `${machineId} taken out of service: ${rec.title}` : `Work order saved: ${rec.title}`, 'ok');
      onCreated(rec);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const outOfService = mode === 'start';
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`New work order — ${machineId}`}
      width="max-w-[600px]"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={outOfService ? 'build' : 'save'} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : outOfService ? 'Start now' : mode === 'log' ? 'Log as done' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Type">
          <Segmented<MaintenanceKind> value={kind} onChange={setKind} options={(Object.keys(KIND_META) as MaintenanceKind[]).map((k) => ({ value: k, label: KIND_META[k].label }))} />
        </Field>
        <Field label="What" error={titleError}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={kind === 'repair' ? 'Boom cylinder hose leak' : kind === 'inspection' ? 'Undercarriage inspection' : '500 h planned service'} />
        </Field>
        <Field label="Detail (optional)">
          <textarea className="input h-20 py-2" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={4000} />
        </Field>
        <Field label="When">
          <Segmented<CreateMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'schedule', label: 'Schedule' },
              { value: 'start', label: 'Start now' },
              { value: 'log', label: 'Already done' },
            ]}
          />
        </Field>
        {mode === 'schedule' && (
          <Field label="Scheduled for" hint="Your local time. The machine stays in service until the work is started.">
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
        {mode === 'start' && (
          <Caveat icon="build_circle">
            {kind === 'repair'
              ? `${machineId} goes Down now (unplanned downtime) until this repair is completed.`
              : `${machineId} goes into Maintenance now (planned downtime) until this work is completed.`}
          </Caveat>
        )}
        {mode === 'log' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Completed at">
              <input className="input" type="datetime-local" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />
            </Field>
            <Field label="Meter reading (h)" hint={meterNow !== null ? `Now reads about ${fmtMeter(meterNow)}` : undefined}>
              <input className="input" inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder="e.g. 4512" />
            </Field>
            <Field label="Done by">
              <input className="input" value={by} onChange={(e) => setBy(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
            </Field>
            <Caveat className="sm:col-span-2">Logged work adds no downtime to the machine’s history: only work started here is timed.</Caveat>
          </div>
        )}
        {error !== undefined && <TcError error={error} what="The work order" />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- complete / cancel / edit
function WorkOrderActionModal({ rec, mode, meterNow, onClose, onDone }: { rec: MaintenanceRecord; mode: 'complete' | 'cancel' | 'edit'; meterNow: number | null; onClose: () => void; onDone: () => void }) {
  // Blank on completion means "use the computed reading"; an edit starts from the recorded one.
  const [meter, setMeter] = useState(mode === 'edit' && rec.hour_meter_h !== null ? String(rec.hour_meter_h) : '');
  const [by, setBy] = useState(rec.performed_by);
  const [notes, setNotes] = useState(rec.notes);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState(rec.title);
  const [detail, setDetail] = useState(rec.detail);
  const [when, setWhen] = useState(toLocalInput(rec.scheduled_for));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'complete') {
        await adminApi.maintenanceAction(rec.maintenance_id, 'complete', { hour_meter_h: numOrNull(meter), performed_by: by.trim(), notes: notes.trim() });
        toast(`${rec.title}: completed — ${rec.machine_id} back in service`, 'ok');
      } else if (mode === 'cancel') {
        await adminApi.maintenanceAction(rec.maintenance_id, 'cancel', { reason: reason.trim() });
        toast(`${rec.title}: cancelled`, 'ok');
      } else {
        await adminApi.editMaintenance(rec.maintenance_id, {
          title: title.trim() || rec.title,
          detail,
          performed_by: by,
          notes,
          ...(rec.status === 'scheduled' ? { scheduled_for: fromLocalInput(when) } : {}),
          ...(rec.status === 'completed' ? { hour_meter_h: numOrNull(meter) } : {}),
        });
        toast('Work order updated', 'ok');
      }
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const heading = mode === 'complete' ? 'Complete work order' : mode === 'cancel' ? 'Cancel work order' : 'Edit work order';
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`${heading} — ${rec.title}`}
      width="max-w-[560px]"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button variant={mode === 'cancel' ? 'secondary' : 'primary'} icon={mode === 'complete' ? 'task_alt' : mode === 'cancel' ? 'close' : 'save'} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : mode === 'complete' ? 'Mark completed' : mode === 'cancel' ? 'Cancel work order' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mode === 'complete' && (
          <>
            {rec.status === 'in_progress' && <Caveat icon="task_alt">{`${rec.machine_id} returns to service and the downtime interval closes now.`}</Caveat>}
            <Field label="Meter reading at completion (h)" hint={meterNow !== null ? `Computed from the state log: ${fmtMeter(meterNow)}. Leave blank to use it.` : 'Leave blank to use the computed reading.'}>
              <input className="input" inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder={meterNow !== null ? String(Math.round(meterNow)) : ''} />
            </Field>
            <Field label="Done by">
              <input className="input" value={by} onChange={(e) => setBy(e.target.value)} maxLength={200} placeholder="Technician or dealer" />
            </Field>
            <Field label="Notes">
              <textarea className="input h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="Parts used, findings, follow-ups" />
            </Field>
          </>
        )}
        {mode === 'cancel' && (
          <>
            {rec.status === 'in_progress' && <Caveat icon="info">{`The downtime interval closes now; ${rec.machine_id} is shown parked until it next works.`}</Caveat>}
            <Field label="Why (kept in the history)">
              <textarea className="input h-20 py-2" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
            </Field>
          </>
        )}
        {mode === 'edit' && (
          <>
            <Field label="What">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Detail">
              <textarea className="input h-20 py-2" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={4000} />
            </Field>
            {rec.status === 'scheduled' && (
              <Field label="Scheduled for">
                <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </Field>
            )}
            <div className={cx('grid gap-5', rec.status === 'completed' && 'sm:grid-cols-2')}>
              <Field label="Done by">
                <input className="input" value={by} onChange={(e) => setBy(e.target.value)} maxLength={200} />
              </Field>
              {rec.status === 'completed' && (
                <Field label="Meter reading (h)">
                  <input className="input" inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} />
                </Field>
              )}
            </div>
            <Field label="Notes">
              <textarea className="input h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
            </Field>
            <Caveat>Each change is kept in the record’s history with its old value.</Caveat>
          </>
        )}
        {error !== undefined && <TcError error={error} what="The work order" />}
      </div>
    </Modal>
  );
}
