/**
 * Screen 17 — Tasks & Estimates (R5). Plan a task and get a P10–P90 time range from the task-time
 * model, see what moves it, and check how past estimates held up. Gains are in minutes (no money here).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { edge } from '../../lib/api';
import { fmtClock, fmtDate, fmtDur } from '../../lib/format';
import { useNow, useResource } from '../../lib/hooks';
import { liveNow } from '../../lib/live';
import type { EtaPreviewRequest, Task, TaskEstimate, TaskType } from '../../lib/types';
import { OPERATORS, at } from '../../mocks/world';
import { DataSourceChip } from '../../components/DataSourceChip';
import { EtaDrivers, EtaRangeBar, RangeBar } from '../../components/EtaRangeBar';
import { GainChip } from '../../components/GainChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { Button, Chip, EmptyState, ErrorNote, Icon, Label, Loading, PageTitle, Panel, PanelHeader, ProgressBar, cx, toast } from '../../components/ui';

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

const STATUS_CHIP: Record<string, { tone: 'green' | 'blue' | 'neutral' | 'orange'; label: string }> = {
  in_progress: { tone: 'blue', label: 'In progress' },
  queued: { tone: 'neutral', label: 'Queued' },
  done: { tone: 'green', label: 'Done' },
  paused: { tone: 'orange', label: 'Paused' },
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

const DOT_DOMAIN = 60; // ± minutes around P50 shown in the dot plot

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
    toast("Added to today's plan · dispatch sync is MOCK", 'info');
  }

  const today = [...(tasks.data ?? []), ...added];
  const weather = conditions.data;

  return (
    <div className="space-y-6">
      <PageTitle
        kicker="R5 · Planning"
        title="Tasks & Estimates"
        sub="Every estimate is a range: P10–P90 with the most likely time (P50) marked."
        right={<DataSourceChip endpoints={['/eta/preview', '/tasks']} modelBacked />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[440px_1fr]">
        {/* ---------------------------------------------- NEW TASK form */}
        <Panel accent="yellow">
          <PanelHeader icon="add_task" title="New task" sub="Estimate updates as you type" />
          <div className="space-y-4 p-4 pl-5">
            <Field label="Task type">
              <select
                className="select"
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
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${meta.qtyLabel} (${meta.unit})`}>
                <div className="relative">
                  <input className="input pr-12 tnum" type="number" min={1} step={1} value={Number.isFinite(form.qty) ? form.qty : ''} onChange={(e) => set('qty', e.target.value === '' ? NaN : Number(e.target.value))} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-display text-label-md text-on-surface-muted">{meta.unit}</span>
                </div>
              </Field>
              <Field label="Material">
                <select className="select" value={form.material} onChange={(e) => set('material', e.target.value)}>
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Location / bench">
              <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Bench 3" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Machine">
                <select className="select" value={form.machine_id} onChange={(e) => set('machine_id', e.target.value)}>
                  {MACHINE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Planned start">
                <input className="input tnum" type="time" value={form.planned_start} onChange={(e) => set('planned_start', e.target.value)} />
              </Field>
            </div>
            <Field label="Operator">
              <select className="select" value={form.operator_id} onChange={(e) => set('operator_id', e.target.value)}>
                {Object.values(OPERATORS).map((o) => (
                  <option key={o.operator_id} value={o.operator_id}>
                    {o.name} · {o.operator_id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weather (auto-filled)">
              <div className="flex h-12 items-center justify-between gap-2 border border-outline bg-surface-container-low px-3">
                <span className="flex min-w-0 items-center gap-2 text-body-md">
                  <Icon name="rainy" size={20} className="text-notice-dark" />
                  <span className="truncate">
                    {weather ? `${weather.temp_c} °C${weather.rain_from ? `, rain from ${weather.rain_from}` : ''}` : conditions.loading ? 'Loading…' : 'Not available'}
                  </span>
                </span>
                <ProvenanceBadges kinds={weather?.provenance?.length ? weather.provenance : ['MOCK']} />
              </div>
            </Field>
            <div className="flex items-center justify-between gap-3 border-t border-outline pt-4">
              <span className="text-footnote text-on-surface-muted">Weather feed is a placeholder integration.</span>
              <Button variant="primary" icon="playlist_add" disabled={!est || estLoading || !(form.qty > 0)} onClick={addToPlan}>
                Add to today's plan
              </Button>
            </div>
          </div>
        </Panel>

        {/* ---------------------------------------------- ESTIMATE panel */}
        <Panel>
          <PanelHeader
            icon="schedule"
            title="Estimate"
            sub={`${meta.label} · ${Number.isFinite(form.qty) ? form.qty : '—'} ${meta.unit} · ${form.material} · start ${form.planned_start || '--:--'}`}
            right={
              <>
                {estLoading && est && <span className="font-display text-label-sm uppercase text-on-surface-muted">Updating…</span>}
                <DataSourceChip endpoints={['/eta/preview']} modelBacked />
              </>
            }
          />
          <div className="space-y-5 p-5">
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
          </div>
        </Panel>
      </div>

      {/* ---------------------------------------------- today's tasks */}
      <Panel>
        <PanelHeader icon="view_list" title="Today's tasks" sub="Finish estimates from now, with the likely range" right={<DataSourceChip endpoints={['/tasks']} />} />
        {tasks.loading && !tasks.data ? (
          <Loading label="Loading tasks" />
        ) : today.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="event_busy" title="No tasks planned today" />
          </div>
        ) : (
          <ul className="divide-y divide-outline">
            {today.map((t) => {
              const st = STATUS_CHIP[t.status] ?? STATUS_CHIP.queued;
              return (
                <li key={t.task_id} className="grid grid-cols-1 items-center gap-4 px-4 py-4 lg:grid-cols-[minmax(260px,1fr)_220px_minmax(380px,1.4fr)]">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-outline-variant font-display text-label-md tnum text-on-surface-variant">{t.priority}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-display text-label-lg uppercase text-on-surface">{t.name}</span>
                        <Chip tone={st.tone}>{st.label}</Chip>
                        {t.task_id.startsWith('NEW-') && <ProvenanceBadge kind="MOCK" />}
                        {t.first_on_site && <Chip tone="orange">First on this site</Chip>}
                      </div>
                      <div className="truncate text-body-sm text-on-surface-muted">{[t.location, t.material, t.note].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between font-display text-label-sm uppercase text-on-surface-muted">
                      <span className="tnum">
                        {t.done_qty ?? 0} / {t.planned_qty} {t.unit}
                      </span>
                      <span className="tnum text-on-surface">{Math.round(t.progress_pct)}%</span>
                    </div>
                    <ProgressBar pct={t.progress_pct} height="h-2.5" tone={t.status === 'done' ? 'green' : 'yellow'} />
                  </div>
                  <div className="min-w-0">
                    {t.estimate ? (
                      <EtaRangeBar estimate={t.estimate} nowTs={nowTs} compact />
                    ) : t.status === 'done' ? (
                      <span className="text-body-sm text-on-surface-muted">Finished {t.done_at ? fmtClock(t.done_at) : ''}</span>
                    ) : (
                      <span className="text-body-sm text-on-surface-muted">No estimate yet</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ---------------------------------------------- recent tasks: estimate vs actual */}
      <RecentTasks />
    </div>
  );
}

// ------------------------------------------------------------------ estimate body
function EstimateBody({ est, start }: { est: TaskEstimate; start: number }) {
  const coverage = Math.round((est.nominal_coverage || 0.8) * 100);
  const drivers = [...(est.drivers ?? [])].sort((a, b) => Math.abs(b.delta_min) - Math.abs(a.delta_min));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>Most likely duration (P50)</Label>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-display text-on-surface tnum">{fmtDur(est.p50_min)}</span>
            <span className="font-display text-headline-sm uppercase text-cat-text">likely</span>
          </div>
          <div className="mt-1 text-body-md text-on-surface-variant">
            Finish around <span className="font-display tnum text-on-surface">{fmtClock(start + est.p50_min * 60)}</span>{' '}
            <span className="text-on-surface-muted">
              (between {fmtClock(start + est.p10_min * 60)} and {fmtClock(start + est.p90_min * 60)})
            </span>
          </div>
        </div>
        <div className="text-right">
          <Label>{coverage}% likely range (P10–P90)</Label>
          <div className="font-display text-headline-md tnum text-on-surface">
            {fmtDur(est.p10_min)} – {fmtDur(est.p90_min)}
          </div>
          <div className="mt-1 flex justify-end">
            <ProvenanceBadges kinds={est.provenance} />
          </div>
        </div>
      </div>

      <div className="px-1 pt-1">
        <RangeBar p10={est.p10_min} p50={est.p50_min} p90={est.p90_min} height="h-3" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <Icon name="history" size={20} className="text-on-surface-muted" />
          {est.n_similar !== null && est.n_similar !== undefined ? (
            <>
              Based on <span className="font-display tnum text-on-surface">{est.n_similar}</span> similar past {est.n_similar === 1 ? 'task' : 'tasks'}
            </>
          ) : (
            'Based on similar past tasks'
          )}
        </span>
      </div>

      {est.low_data && (
        <div className="flex items-start gap-3 border border-warning bg-warning/10 px-4 py-3">
          <Icon name="data_alert" size={22} className="text-warning-text" />
          <div>
            <div className="font-display text-label-md uppercase text-warning-text">Low data</div>
            <p className="text-body-sm text-on-surface-variant">Few similar tasks — showing typical time for this task type with a wider range.</p>
          </div>
        </div>
      )}

      <div className="border-t border-outline pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-label-lg uppercase text-on-surface">What moves this estimate</h3>
          <span className="font-display text-label-sm uppercase text-on-surface-muted">minutes vs typical</span>
        </div>
        {drivers.length ? <EtaDrivers drivers={drivers} /> : <p className="text-body-sm text-on-surface-muted">No adjustments — typical time for this task type.</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-4">
        <span className="inline-flex items-center gap-2 border border-prov-ml bg-prov-ml/10 px-3 py-1.5 text-body-sm text-on-surface">
          <Icon name="target" size={18} className="text-prov-ml" />
          Last {CALIBRATION.n} tasks: <span className="font-display tnum">{Math.round((CALIBRATION.inside / CALIBRATION.n) * 100)}%</span> finished inside the range (target {coverage}%)
          <ProvenanceBadge kind="ML" />
          <ProvenanceBadge kind="SIMULATED" />
        </span>
        <span className="text-footnote text-on-surface-muted">Model {est.model_version} · decision support only</span>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ recent tasks + dot plot
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

  const pos = (v: number) => `${((Math.max(-DOT_DOMAIN, Math.min(DOT_DOMAIN, v)) + DOT_DOMAIN) / (2 * DOT_DOMAIN)) * 100}%`;

  return (
    <Panel>
      <PanelHeader
        icon="fact_check"
        title="Recent tasks — estimate vs actual"
        sub={`${stats.inside} of ${rows.length} finished inside their P10–P90 range`}
        right={
          <>
            {stats.truckWait > 0 && <GainChip size="sm">truck waiting −{stats.truckWait} min</GainChip>}
            {stats.earlier > 0 && <GainChip size="sm">{stats.earlier} min earlier than plan</GainChip>}
            <ProvenanceBadges kinds={['ML', 'SIMULATED']} />
          </>
        }
      />
      <div className="overflow-x-auto">
        <table className="table-dense w-full min-w-[1100px]">
          <thead>
            <tr>
              <th>Date</th>
              <th>Task</th>
              <th>Unit</th>
              <th>Estimate P10–P90 (P50)</th>
              <th>Actual</th>
              <th className="w-[300px]">
                <div className="relative h-4">
                  {[-60, -30, 0, 30, 60].map((v) => (
                    <span key={v} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(v) }}>
                      {v === 0 ? 'P50' : `${v > 0 ? '+' : '−'}${Math.abs(v)}`}
                    </span>
                  ))}
                </div>
                <div className="mt-0.5 text-center normal-case tracking-normal text-on-surface-muted">actual vs range, min from P50</div>
              </th>
              <th>Result</th>
              <th>Gain vs plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inside = r.actual >= r.p10 && r.actual <= r.p90;
              const diff = r.p50 - r.actual; // > 0 = earlier than plan
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-on-surface-variant">{fmtDate(r.ts)}</td>
                  <td className="whitespace-nowrap">{r.name}</td>
                  <td className="whitespace-nowrap font-display text-label-md">{r.unit}</td>
                  <td className="whitespace-nowrap tnum">
                    {fmtDur(r.p10)} – {fmtDur(r.p90)} <span className="text-on-surface-muted">({fmtDur(r.p50)})</span>
                  </td>
                  <td className="whitespace-nowrap font-display text-label-md tnum">{fmtDur(r.actual)}</td>
                  <td>
                    <div className="relative h-5">
                      <span className="absolute left-0 right-0 top-1/2 h-px bg-outline" />
                      <span className="absolute top-1/2 h-3 -translate-y-1/2 border border-cat/60 bg-cat/25" style={{ left: pos(r.p10 - r.p50), width: `calc(${pos(r.p90 - r.p50)} - ${pos(r.p10 - r.p50)})` }} title={`P10–P90 ${fmtDur(r.p10)}–${fmtDur(r.p90)}`} />
                      <span className="absolute top-0 h-5 w-0.5 -translate-x-1/2 bg-cat" style={{ left: pos(0) }} />
                      <span
                        className={cx('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black', inside ? 'bg-series-green' : 'bg-series-orange')}
                        style={{ left: pos(r.actual - r.p50) }}
                        title={`Actual ${fmtDur(r.actual)}`}
                      />
                    </div>
                  </td>
                  <td>
                    {inside ? (
                      <Chip tone="green" icon="check">
                        Inside
                      </Chip>
                    ) : (
                      <Chip tone="orange" icon="close">
                        Outside
                      </Chip>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {diff > 0 ? (
                      <GainChip size="sm">{r.type === 'truck_loading' ? `truck waiting −${diff} min` : `finished ${diff} min earlier than plan`}</GainChip>
                    ) : diff < 0 ? (
                      <span className="text-body-sm text-on-surface-muted">{-diff} min later than plan</span>
                    ) : (
                      <span className="text-body-sm text-on-surface-muted">On plan</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-outline px-4 py-3 text-footnote text-on-surface-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 border border-cat/60 bg-cat/25" /> P10–P90 range
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-cat" /> P50
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-series-green" /> actual inside
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-series-orange" /> actual outside
        </span>
        <span>Gains: trucks dispatched to the P50 wait less when loading finishes early (ESTIMATE). Rows are SIMULATED history.</span>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ form field
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
