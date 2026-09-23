/**
 * Screen 17 — Tasks & Estimates (R5). Plan a task on the left, read its time range on the right
 * (most likely time, the likely range and what moves it). Below: today's plan and how past estimates held up.
 * Gains are in minutes (no money here).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { edge } from '../../lib/api';
import { fmtClock, fmtDate, fmtDur } from '../../lib/format';
import { useNow, useResource } from '../../lib/hooks';
import { liveNow } from '../../lib/live';
import type { EtaPreviewRequest, Task, TaskEstimate, TaskType } from '../../lib/types';
import { OPERATORS, at } from '../../mocks/world';
import { EtaDrivers, RangeBar } from '../../components/EtaRangeBar';
import { GainChip } from '../../components/GainChip';
import { SourceNote } from '../../components/ProvenanceBadge';
import { SupervisorTabs } from '../../components/office/TrainingTabs';
import { Bar, Card, FieldLabel, InlineTabs, TABLE, TableWrap } from '../../components/ops/layout';
import { Button, EmptyState, ErrorNote, Icon, Loading, PageTitle, cx, toast } from '../../components/ui';

// ------------------------------------------------------------------ vocabularies
const TASK_TYPES: Array<{ value: TaskType; label: string; unit: string; defaultQty: number; qtyLabel: string }> = [
  { value: 'truck_loading', label: 'Truck loading', unit: 'm³', defaultQty: 420, qtyLabel: 'Volume' },
  { value: 'trenching', label: 'Trenching', unit: 'm', defaultQty: 60, qtyLabel: 'Trench length' },
  { value: 'stockpile', label: 'Stockpile', unit: 'm³', defaultQty: 300, qtyLabel: 'Volume' },
  { value: 'grading', label: 'Grading', unit: 'm²', defaultQty: 150, qtyLabel: 'Area' },
];
const MATERIALS = ['clay-gravel', 'rock', 'topsoil'];
const MACHINE_OPTIONS = [
  { value: 'EX-07', label: 'EX-07 · Cat 320' },
  { value: 'EX-09', label: 'EX-09 · Cat 320' },
];

const STATUS: Record<string, { dot: string; label: string }> = {
  in_progress: { dot: 'bg-notice', label: 'In progress' },
  queued: { dot: 'bg-on-surface-muted', label: 'Queued' },
  done: { dot: 'bg-success', label: 'Done' },
  paused: { dot: 'bg-warning', label: 'Paused' },
};

/** Calibration of the task-time model on the last 30 finished tasks (SIMULATED history). */
const CALIBRATION = { n: 30, inside: 24 };

// ------------------------------------------------------------------ recent tasks (SIMULATED, local to this page)
interface RecentTask {
  id: string;
  ts: number;
  name: string;
  type: TaskType;
  unit: string;
  p10: number;
  p50: number;
  p90: number;
  actual: number;
}

const RECENT: RecentTask[] = [
  { id: 'R-01', ts: at(14, 10, 0, -1), name: 'Truck Loading, Bench 3', type: 'truck_loading', unit: 'EX-07', p10: 160, p50: 190, p90: 235, actual: 176 },
  { id: 'R-02', ts: at(12, 40, 0, -1), name: 'Trench Excavation T-3', type: 'trenching', unit: 'EX-04', p10: 95, p50: 118, p90: 160, actual: 131 },
  { id: 'R-03', ts: at(10, 5, 0, -1), name: 'Stockpile Tidy, Pad 4', type: 'stockpile', unit: 'EX-07', p10: 30, p50: 40, p90: 55, actual: 36 },
  { id: 'R-04', ts: at(9, 30, 0, -1), name: 'Truck Loading, Bench 2', type: 'truck_loading', unit: 'EX-09', p10: 150, p50: 178, p90: 220, actual: 158 },
  { id: 'R-05', ts: at(13, 55, 0, -2), name: 'Grading, Pad 2', type: 'grading', unit: 'EX-11', p10: 60, p50: 85, p90: 130, actual: 141 },
  { id: 'R-06', ts: at(11, 20, 0, -2), name: 'Trench, Services corridor', type: 'trenching', unit: 'EX-11', p10: 110, p50: 135, p90: 175, actual: 128 },
  { id: 'R-07', ts: at(9, 45, 0, -2), name: 'Truck Loading, Bench 3', type: 'truck_loading', unit: 'EX-07', p10: 165, p50: 196, p90: 240, actual: 214 },
  { id: 'R-08', ts: at(14, 0, 0, -3), name: 'Stockpile Tidy, Pad 4', type: 'stockpile', unit: 'EX-09', p10: 35, p50: 45, p90: 62, actual: 31 },
  { id: 'R-09', ts: at(11, 35, 0, -3), name: 'Truck Loading, Bench 2', type: 'truck_loading', unit: 'EX-09', p10: 148, p50: 175, p90: 215, actual: 169 },
  { id: 'R-10', ts: at(9, 10, 0, -3), name: 'Trench Excavation T-2', type: 'trenching', unit: 'EX-04', p10: 100, p50: 125, p90: 170, actual: 119 },
];

// ------------------------------------------------------------------ helpers
function ymd(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startTs(dayTs: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  const d = new Date(dayTs * 1000);
  d.setHours(Number.isFinite(h) ? h : 10, Number.isFinite(m) ? m : 0, 0, 0);
  return d.getTime() / 1000;
}

const typeMeta = (t: TaskType) => TASK_TYPES.find((x) => x.value === t) ?? TASK_TYPES[0];

// ------------------------------------------------------------------ page
interface FormState {
  task_type: TaskType;
  qty: number;
  material: string;
  location: string;
  machine_id: string;
  operator_id: string;
  planned_start: string; // HH:MM
}

type ListTab = 'plan' | 'recent';

export default function Tasks() {
  useNow(15_000);
  const nowTs = liveNow();

  const [form, setForm] = useState<FormState>({
    task_type: 'trenching',
    qty: 60,
    material: 'clay-gravel',
    location: 'Drainage line T-4',
    machine_id: 'EX-07',
    operator_id: 'OP-1042',
    planned_start: '10:00',
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const meta = typeMeta(form.task_type);

  const conditions = useResource(() => edge.conditions(), []);
  const tasks = useResource(() => edge.tasks(), []);
  const [added, setAdded] = useState<Task[]>([]);
  const [listTab, setListTab] = useState<ListTab>('plan');

  // ------------------------------------------------ debounced estimate preview
  const day = ymd(nowTs);
  const req: EtaPreviewRequest = {
    task_type: form.task_type,
    qty: form.qty,
    material: form.material,
    operator_id: form.operator_id,
    machine_id: form.machine_id,
    planned_start: `${day}T${form.planned_start || '10:00'}:00`,
    location: form.location || undefined,
  };
  const reqKey = JSON.stringify(req);
  const [est, setEst] = useState<TaskEstimate | null>(null);
  const [estLoading, setEstLoading] = useState(true);
  const [estErr, setEstErr] = useState<unknown>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!(form.qty > 0)) {
      setEstLoading(false);
      return;
    }
    const my = ++seq.current;
    setEstLoading(true);
    const id = setTimeout(() => {
      edge
        .etaPreview(JSON.parse(reqKey) as EtaPreviewRequest)
        .then((e) => {
          if (seq.current !== my) return;
          setEst(e);
          setEstErr(null);
        })
        .catch((e: unknown) => seq.current === my && setEstErr(e))
        .finally(() => seq.current === my && setEstLoading(false));
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const start = startTs(nowTs, form.planned_start || '10:00');

  function addToPlan() {
    if (!est) return;
    const t: Task = {
      task_id: `NEW-${added.length + 1}`,
      priority: (tasks.data?.length ?? 0) + added.length + 1,
      type: form.task_type,
      name: `${meta.label}, ${form.location || 'unassigned'}`,
      location: form.location,
      planned_qty: form.qty,
      unit: meta.unit,
      done_qty: 0,
      progress_pct: 0,
      status: 'queued',
      material: form.material,
      estimate: { ...est, task_id: `NEW-${added.length + 1}` },
      note: `Planned start ${form.planned_start} · ${form.machine_id} · ${OPERATORS[form.operator_id]?.name ?? form.operator_id}`,
    };
    setAdded((a) => [...a, t]);
    setListTab('plan');
    toast("Added to today's plan · dispatch sync is a placeholder", 'info');
  }

  const today = [...(tasks.data ?? []), ...added];
  const weather = conditions.data;

  return (
    <div className="space-y-8">
      <SupervisorTabs />
      <PageTitle title="Tasks & estimates" sub="Every estimate is a range, with the most likely time marked." />

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[400px_1fr]">
        {/* ---------------------------------------------- new task form */}
        <Card title="New task" sub="The estimate updates as you type">
          <div className="space-y-5">
            <Field label="Task type">
              <select
                className="select rounded"
                value={form.task_type}
                onChange={(e) => {
                  const t = e.target.value as TaskType;
                  setForm((f) => ({ ...f, task_type: t, qty: typeMeta(t).defaultQty }));
                }}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={`${meta.qtyLabel} (${meta.unit})`}>
                <div className="relative">
                  <input className="input rounded pr-12 tnum" type="number" min={1} step={1} value={Number.isFinite(form.qty) ? form.qty : ''} onChange={(e) => set('qty', e.target.value === '' ? NaN : Number(e.target.value))} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-on-surface-muted">{meta.unit}</span>
                </div>
              </Field>
              <Field label="Material">
                <select className="select rounded" value={form.material} onChange={(e) => set('material', e.target.value)}>
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Location / bench">
              <input className="input rounded" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Bench 3" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Machine">
                <select className="select rounded" value={form.machine_id} onChange={(e) => set('machine_id', e.target.value)}>
                  {MACHINE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Planned start">
                <input className="input rounded tnum" type="time" value={form.planned_start} onChange={(e) => set('planned_start', e.target.value)} />
              </Field>
            </div>
            <Field label="Operator">
              <select className="select rounded" value={form.operator_id} onChange={(e) => set('operator_id', e.target.value)}>
                {Object.values(OPERATORS).map((o) => (
                  <option key={o.operator_id} value={o.operator_id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="flex items-center gap-2 text-body-sm text-on-surface-muted">
              <Icon name="rainy" size={18} />
              Weather: {weather ? `${weather.temp_c} °C${weather.rain_from ? `, rain from ${weather.rain_from}` : ''}` : conditions.loading ? 'loading…' : 'not available'} (auto-filled)
            </p>
            <Button variant="primary" block icon="playlist_add" disabled={!est || estLoading || !(form.qty > 0)} onClick={addToPlan}>
              Add to today's plan
            </Button>
            <SourceNote kinds={weather?.provenance?.length ? weather.provenance : ['MOCK']}>Weather feed is a placeholder integration</SourceNote>
          </div>
        </Card>

        {/* ---------------------------------------------- estimate */}
        <Card
          title="Estimate"
          sub={`${meta.label} · ${Number.isFinite(form.qty) ? form.qty : '—'} ${meta.unit} · ${form.material} · start ${form.planned_start || '--:--'}`}
          right={estLoading && est ? <span className="text-body-sm text-on-surface-muted">Updating…</span> : undefined}
        >
          {estErr !== null && <ErrorNote error={estErr} />}
          {!(form.qty > 0) ? (
            <EmptyState icon="edit" title="Enter a quantity">
              The estimate needs a quantity greater than zero.
            </EmptyState>
          ) : !est ? (
            <Loading label="Estimating" />
          ) : (
            <EstimateBody est={est} start={start} />
          )}
        </Card>
      </div>

      {/* ---------------------------------------------- today's plan / recent tasks */}
      <Card>
        <InlineTabs
          label="Task lists"
          value={listTab}
          onChange={setListTab}
          options={[
            { value: 'plan', label: `Today's plan (${today.length})` },
            { value: 'recent', label: 'Recent — estimate vs actual' },
          ]}
        />
        <div className="mt-6">{listTab === 'plan' ? <TodayPlan loading={tasks.loading && !tasks.data} today={today} nowTs={nowTs} /> : <RecentTasks />}</div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ estimate body
function EstimateBody({ est, start }: { est: TaskEstimate; start: number }) {
  const coverage = Math.round((est.nominal_coverage || 0.8) * 100);
  const drivers = [...(est.drivers ?? [])].sort((a, b) => Math.abs(b.delta_min) - Math.abs(a.delta_min));
  return (
    <div className="space-y-8">
      <div>
        <div className="text-body-sm text-on-surface-variant">Most likely duration</div>
        <div className="mt-1 font-display text-display text-on-surface tnum">{fmtDur(est.p50_min)}</div>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Finish around <span className="font-semibold text-on-surface tnum">{fmtClock(start + est.p50_min * 60)}</span> · {coverage}% likely between{' '}
          <span className="tnum">
            {fmtDur(est.p10_min)} and {fmtDur(est.p90_min)}
          </span>{' '}
          <span className="text-on-surface-muted tnum">
            ({fmtClock(start + est.p10_min * 60)}–{fmtClock(start + est.p90_min * 60)})
          </span>
        </p>
        <div className="mt-5 max-w-xl">
          <RangeBar p10={est.p10_min} p50={est.p50_min} p90={est.p90_min} height="h-2.5" />
        </div>
        <p className="mt-4 text-body-sm text-on-surface-muted">
          {est.n_similar !== null && est.n_similar !== undefined ? `Based on ${est.n_similar} similar past ${est.n_similar === 1 ? 'task' : 'tasks'}` : 'Based on similar past tasks'}
          {est.low_data && <span className="text-warning-text"> · Few similar tasks, so the range is wider</span>}
        </p>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-headline-sm text-on-surface">What moves this estimate</h3>
          <span className="text-body-sm text-on-surface-muted">minutes vs typical</span>
        </div>
        {drivers.length ? <EtaDrivers drivers={drivers} /> : <p className="text-body-sm text-on-surface-muted">No adjustments — typical time for this task type.</p>}
      </div>

      <div>
        <p className="text-body-sm text-on-surface-muted">
          Track record: {Math.round((CALIBRATION.inside / CALIBRATION.n) * 100)}% of the last {CALIBRATION.n} tasks finished inside their range (target {coverage}%). Decision support only.
        </p>
        <SourceNote kinds={[...(est.provenance ?? []), 'ML', 'SIMULATED']} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ today's plan
function TodayPlan({ loading, today, nowTs }: { loading: boolean; today: Task[]; nowTs: number }) {
  if (loading) return <Loading label="Loading tasks" />;
  if (!today.length) return <EmptyState icon="event_busy" title="No tasks planned today" />;
  return (
    <>
      <TableWrap>
        <table className={cx(TABLE, 'min-w-[720px]')}>
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th className="w-[200px]">Progress</th>
              <th>Likely finish</th>
            </tr>
          </thead>
          <tbody>
            {today.map((t) => {
              const st = STATUS[t.status] ?? STATUS.queued;
              const e = t.estimate;
              const r10 = e ? (e.remaining_p10_min ?? e.p10_min) : 0;
              const r50 = e ? (e.remaining_p50_min ?? e.p50_min) : 0;
              const r90 = e ? (e.remaining_p90_min ?? e.p90_min) : 0;
              return (
                <tr key={t.task_id}>
                  <td>
                    <div className="font-semibold text-on-surface">{t.name}</div>
                    <div className="text-body-sm text-on-surface-muted">
                      {[t.location, t.material, t.note].filter(Boolean).join(' · ')}
                      {t.first_on_site && <span className="text-warning-text"> · first on this site</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className={cx('h-2 w-2 rounded-full', st.dot)} aria-hidden />
                      {st.label}
                    </span>
                  </td>
                  <td>
                    <div className="mb-1 flex justify-between text-body-sm text-on-surface-muted tnum">
                      <span>
                        {t.done_qty ?? 0} / {t.planned_qty} {t.unit}
                      </span>
                      <span className="text-on-surface">{Math.round(t.progress_pct)}%</span>
                    </div>
                    <Bar pct={t.progress_pct} tone={t.status === 'done' ? 'green' : 'neutral'} />
                  </td>
                  <td className="whitespace-nowrap tnum">
                    {t.status === 'done' ? (
                      <span className="text-on-surface-muted">Finished {t.done_at ? fmtClock(t.done_at) : ''}</span>
                    ) : e ? (
                      <>
                        ~{fmtClock(nowTs + r50 * 60)} <span className="text-body-sm text-on-surface-muted">({fmtClock(nowTs + r10 * 60)}–{fmtClock(nowTs + r90 * 60)})</span>
                        {e.low_data && <div className="text-body-sm text-warning-text">Few similar tasks · wider range</div>}
                      </>
                    ) : (
                      <span className="text-on-surface-muted">No estimate yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <SourceNote kinds={['ML', 'SIMULATED']}>New tasks are added locally; dispatch sync is a placeholder</SourceNote>
    </>
  );
}

// ------------------------------------------------------------------ recent tasks: estimate vs actual
function RecentTasks() {
  const rows = RECENT;
  const stats = useMemo(() => {
    let inside = 0;
    let truckWait = 0;
    let earlier = 0;
    for (const r of rows) {
      if (r.actual >= r.p10 && r.actual <= r.p90) inside += 1;
      const d = r.p50 - r.actual;
      if (d > 0 && r.type === 'truck_loading') truckWait += d;
      else if (d > 0) earlier += d;
    }
    return { inside, truckWait, earlier };
  }, [rows]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <span className="text-body-md text-on-surface">
          <span className="font-semibold tnum">
            {stats.inside} of {rows.length}
          </span>{' '}
          finished inside their range
        </span>
        {stats.truckWait > 0 && <GainChip size="sm">truck waiting −{stats.truckWait} min</GainChip>}
        {stats.earlier > 0 && <GainChip size="sm">{stats.earlier} min earlier than plan</GainChip>}
      </div>
      <TableWrap>
        <table className={cx(TABLE, 'min-w-[720px]')}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Task</th>
              <th>Estimate (likely range)</th>
              <th>Actual</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inside = r.actual >= r.p10 && r.actual <= r.p90;
              const diff = r.p50 - r.actual; // > 0 = earlier than plan
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-on-surface-variant">{fmtDate(r.ts)}</td>
                  <td className="whitespace-nowrap" title={r.unit}>
                    {r.name}
                  </td>
                  <td className="whitespace-nowrap tnum">
                    {fmtDur(r.p50)}{' '}
                    <span className="text-body-sm text-on-surface-muted">
                      ({fmtDur(r.p10)}–{fmtDur(r.p90)})
                    </span>
                  </td>
                  <td className="whitespace-nowrap font-semibold tnum">{fmtDur(r.actual)}</td>
                  <td className="whitespace-nowrap">
                    <span className={cx('inline-flex items-center gap-1', inside ? 'text-success-text' : 'text-warning-text')}>
                      <Icon name={inside ? 'check' : 'close'} size={18} />
                      {inside ? 'Inside' : 'Outside'}
                    </span>
                    <span className="ml-2 text-body-sm text-on-surface-muted">{diff > 0 ? `${diff} min early` : diff < 0 ? `${-diff} min late` : 'on plan'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <SourceNote kinds={['ML', 'SIMULATED', 'ESTIMATE']}>Past rows are simulated history. Gains: trucks dispatched to the likely finish wait less when loading ends early</SourceNote>
    </>
  );
}

// ------------------------------------------------------------------ form field
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}
