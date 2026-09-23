/**
 * Screen 16 — Unusual Behaviour & Idle (R4). Three tabs, each one chart or table plus one panel:
 *  IDLE: idle split per machine per day, longest unexplained periods, litres of fuel (RULE).
 *  UNUSUAL OPERATION: flagged windows by category + "what caused it?" (machine signals vs operating pattern).
 *  MACHINE HEALTH: fault codes and sensor drift.
 * Operational units only — no money on this page.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { cloud } from '../../lib/api';
import { fmtClock, fmtDate, fmtDateTime, fmtDur, titleCase, typeLabel } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import type { FeatureContribution, IdleSummary, MachineIssue, RiskCategory, SentinelEvent } from '../../lib/types';
import { OPERATORS, competencyLabel } from '../../mocks/world';
import { ExplanationBars } from '../../components/ExplanationBars';
import { SourceNote } from '../../components/ProvenanceBadge';
import { SupervisorTabs } from '../../components/office/TrainingTabs';
import { AXIS, AXIS_LABEL, GRID, SERIES, TOOLTIP } from '../../components/ops/chartTheme';
import { Card, Caveat, Details, InlineTabs, Stat, TABLE, TableWrap } from '../../components/ops/layout';
import { Chip, EmptyState, ErrorNote, Icon, Loading, PageTitle, cx } from '../../components/ui';

type Tab = 'idle' | 'unusual' | 'health';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'idle', label: 'Idle' },
  { value: 'unusual', label: 'Unusual operation' },
  { value: 'health', label: 'Machine health' },
];

const IDLE_DATE = '2026-09-23';
const IDLE_FUEL_LPH = 3.0;        // planning figure when the cloud does not send one (SIMULATED)
const IDLE_COLORS = { waiting: SERIES.blue, unexplained: SERIES.orange };

const opName = (id: string) => OPERATORS[id]?.name ?? id;

export default function Anomaly() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'unusual' || raw === 'health' ? raw : 'idle';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'idle') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-8">
      <SupervisorTabs />
      <PageTitle title="Behaviour & idle" sub="Machine problems vs operating habits, and explained vs unexplained idle." />

      <InlineTabs label="Behaviour and idle views" value={tab} onChange={setTab} options={TABS} />

      {tab === 'idle' && <IdleTab />}
      {tab === 'unusual' && <UnusualTab />}
      {tab === 'health' && <HealthTab />}

      <Caveat icon="balance">Unusual is not the same as unsafe. Events are reviewed in context before any coaching.</Caveat>
    </div>
  );
}

// ================================================================== IDLE
function IdleTab() {
  const { data, loading, error } = useResource(() => cloud.idleSummary(IDLE_DATE), []);

  if (loading && !data) return <Loading label="Loading idle summary" />;
  if (!data) return error ? <ErrorNote error={error} /> : <EmptyState icon="hourglass_empty" title="No idle data yet" />;
  const lph = IDLE_FUEL_LPH;
  return <IdleBody data={data} idleLph={lph} litres={(m) => (m / 60) * lph} />;
}

type IdleDay = IdleSummary['machines'][number]['days'][number];

function IdleBody({ data, idleLph, litres }: { data: IdleSummary; idleLph: number; litres: (min: number) => number }) {
  const machines = (data.machines ?? []).map((m) => ({ ...m, days: m.days ?? [] }));
  const [unit, setUnit] = useState<string>('all');
  const totals = machines.reduce(
    (a, m) => {
      const d = m.days[m.days.length - 1];
      if (!d) return a;
      return { waiting: a.waiting + d.waiting_min, unexplained: a.unexplained + d.unexplained_min };
    },
    { waiting: 0, unexplained: 0 },
  );
  const fuelL = typeof data.fuel_unexplained_l === 'number' ? data.fuel_unexplained_l : litres(totals.unexplained);
  const total = totals.waiting + totals.unexplained;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  // One chart: all machines summed per day, or one machine.
  const chartData = useMemo<IdleDay[]>(() => {
    if (unit !== 'all') return machines.find((m) => m.machine_id === unit)?.days ?? [];
    const byDate = new Map<string, IdleDay>();
    machines.forEach((m) =>
      m.days.forEach((d) => {
        const cur = byDate.get(d.date) ?? { date: d.date, waiting_min: 0, unexplained_min: 0 };
        byDate.set(d.date, { date: d.date, waiting_min: cur.waiting_min + d.waiting_min, unexplained_min: cur.unexplained_min + d.unexplained_min });
      }),
    );
    return Array.from(byDate.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, unit]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
        <Stat label={<Swatch color={IDLE_COLORS.waiting}>Waiting for truck</Swatch>} value={fmtDur(totals.waiting)} sub={`${pct(totals.waiting)}% · explained`} />
        <Stat label={<Swatch color={IDLE_COLORS.unexplained}>Unexplained</Swatch>} tone="orange" value={fmtDur(totals.unexplained)} sub={`${pct(totals.unexplained)}% · reviewed in context`} />
        <Stat
          label="Fuel in unexplained idle"
          value={`~${Math.round(fuelL)}`}
          unit="L today"
          sub={`at ${idleLph} L/h idle burn`}
        />
      </div>

      <Card
        title="Idle per day"
        sub="Minutes of engine idle by reason · last 7 days"
        right={
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Machine">
            {['all', ...machines.map((m) => m.machine_id)].map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={unit === id}
                onClick={() => setUnit(id)}
                className={cx('rounded px-3 py-1.5 text-body-sm transition-colors duration-quick', unit === id ? 'bg-surface-container-high font-semibold text-on-surface' : 'text-on-surface-muted hover:text-on-surface')}
              >
                {id === 'all' ? 'All machines' : id}
              </button>
            ))}
          </div>
        }
      >
        {machines.length === 0 ? (
          <EmptyState icon="hourglass_empty" title="No machines reported idle" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: -8 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="date" {...AXIS} tickFormatter={(v: string) => v.split(' ')[0]} />
                <YAxis {...AXIS} width={44} label={{ value: 'min', angle: -90, position: 'insideLeft', offset: 16, ...AXIS_LABEL }} />
                <Tooltip {...TOOLTIP} formatter={(v, name) => [`${v} min`, name]} />
                <RBar dataKey="waiting_min" name="Waiting for truck" stackId="idle" fill={IDLE_COLORS.waiting} isAnimationActive={false} />
                <RBar dataKey="unexplained_min" name="Unexplained" stackId="idle" fill={IDLE_COLORS.unexplained} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm text-on-surface-variant">
              <Swatch color={IDLE_COLORS.waiting}>Waiting for truck</Swatch>
              <Swatch color={IDLE_COLORS.unexplained}>Unexplained</Swatch>
            </div>
          </>
        )}
      </Card>

      <Card title="Longest unexplained idle" sub="Engine running, no truck waiting">
        {(data.longest_unexplained ?? []).length === 0 ? (
          <p className="text-body-md text-on-surface-muted">No unexplained idle periods.</p>
        ) : (
          <TableWrap>
            <table className={cx(TABLE, 'min-w-[720px]')}>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Operator</th>
                  <th>Started</th>
                  <th className="text-right">Duration</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {[...data.longest_unexplained]
                  .sort((a, b) => b.duration_min - a.duration_min)
                  .map((r) => (
                    <tr key={`${r.machine_id}-${r.start_ts}`}>
                      <td className="font-semibold">{r.machine_id}</td>
                      <td className="whitespace-nowrap">{opName(r.operator_id)}</td>
                      <td className="whitespace-nowrap tnum">{fmtDateTime(r.start_ts)}</td>
                      <td className="whitespace-nowrap text-right tnum">
                        {fmtDur(r.duration_min)} <span className="text-body-sm text-on-surface-muted">· {litres(r.duration_min).toFixed(1)} L</span>
                      </td>
                      <td className="text-on-surface-variant">{r.context}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <SourceNote kinds={['RULE', ...(data.provenance ?? []), 'SIMULATED']}>Fuel at {idleLph} L/h idle burn</SourceNote>
      </Card>
    </div>
  );
}

function Swatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

// ================================================================== UNUSUAL OPERATION
const CATEGORY: Record<string, { label: string; color: string; lane: number; tone: 'neutral' | 'purple' | 'orange' | 'red' }> = {
  normal: { label: 'Normal', color: '#909090', lane: 1, tone: 'neutral' },
  unusual_harmless: { label: 'Unusual but harmless', color: '#909090', lane: 1, tone: 'neutral' },
  procedural: { label: 'Procedural', color: SERIES.purple, lane: 2, tone: 'purple' },
  emerging_degradation: { label: 'Possible skill gap', color: SERIES.orange, lane: 3, tone: 'orange' },
  dangerous_condition: { label: 'Dangerous condition', color: '#C52320', lane: 4, tone: 'red' },
  immediate_critical: { label: 'Dangerous condition', color: '#C52320', lane: 4, tone: 'red' },
};
const LANES = ['', 'Unusual but harmless', 'Procedural', 'Possible skill gap', 'Dangerous condition'];
const catOf = (c: RiskCategory | string) => CATEGORY[c] ?? CATEGORY.unusual_harmless;

interface Point {
  id: string;
  x: number;
  y: number;
  z: number;
  ev: SentinelEvent;
}

function UnusualTab() {
  const events = useResource(() => cloud.behaviourEvents(), []);
  const issues = useResource(() => cloud.machineIssues(), []);
  const [selId, setSelId] = useState<string | null>(null);

  const list = useMemo(() => [...(events.data ?? [])].sort((a, b) => a.ts - b.ts), [events.data]);
  const sel = list.find((e) => e.event_id === selId) ?? list.find((e) => e.category === 'dangerous_condition') ?? list[0];

  if (events.loading && !events.data) return <Loading label="Loading flagged windows" />;
  if (!list.length)
    return events.error ? (
      <ErrorNote error={events.error} />
    ) : (
      <EmptyState icon="troubleshoot" title="No unusual windows flagged">
        The detector compares each window with the same task's baseline. Nothing stood out.
      </EmptyState>
    );

  const points: Point[] = list.map((e) => ({ id: e.event_id, x: e.ts, y: catOf(e.category).lane, z: 1, ev: e }));
  const minTs = Math.min(...points.map((p) => p.x));
  const maxTs = Math.max(...points.map((p) => p.x));
  const pad = Math.max(900, (maxTs - minTs) * 0.05);
  const hourTicks: number[] = [];
  for (let t = Math.ceil((minTs - pad) / 1800) * 1800; t <= maxTs + pad; t += 1800) hourTicks.push(t);

  const renderPoint = (p: unknown) => {
    const { cx: x, cy: y, payload } = p as { cx?: number; cy?: number; payload?: Point };
    if (x === undefined || y === undefined || !payload) return <g />;
    const on = payload.id === sel?.event_id;
    const color = catOf(payload.ev.category).color;
    const r = on ? 9 : 7;
    const machine = payload.ev.attribution === 'machine';
    return (
      <g style={{ cursor: 'pointer' }} onClick={() => setSelId(payload.id)}>
        {on && <circle cx={x} cy={y} r={r + 5} fill="none" stroke="var(--svg-text)" strokeWidth={1.5} />}
        {machine ? (
          <polygon points={`${x},${y - r - 2} ${x + r + 2},${y} ${x},${y + r + 2} ${x - r - 2},${y}`} fill={color} stroke="var(--chart-tip-bg)" strokeWidth={1.5} />
        ) : (
          <circle cx={x} cy={y} r={r} fill={color} stroke="var(--chart-tip-bg)" strokeWidth={1.5} />
        )}
      </g>
    );
  };

  return (
    <div className="space-y-8">
      <Card title="Flagged windows today" sub="Each dot is a time window that was unusual for its task. Select one to see what caused it.">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid {...GRID} vertical={false} />
            <XAxis type="number" dataKey="x" domain={[minTs - pad, maxTs + pad]} ticks={hourTicks} tickFormatter={(v: number) => fmtClock(v)} {...AXIS} height={30} />
            <YAxis type="number" dataKey="y" domain={[0.5, 4.5]} ticks={[1, 2, 3, 4]} tickFormatter={(v: number) => LANES[v] ?? ''} {...AXIS} width={150} />
            <ZAxis type="number" dataKey="z" range={[80, 80]} />
            <Tooltip {...TOOLTIP} cursor={{ strokeDasharray: '3 3', stroke: 'var(--chart-axis)' }} content={<EventTip />} />
            <Scatter data={points} shape={renderPoint} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-on-surface-variant sm:pl-[158px]">
          {['unusual_harmless', 'procedural', 'emerging_degradation', 'dangerous_condition'].map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY[c].color }} />
              {CATEGORY[c].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rotate-45 bg-on-surface-muted" /> Machine-attributed
          </span>
        </div>
        <SourceNote kinds={['ML', 'RULE', 'SIMULATED']} />
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[300px_1fr]">
          <div>
            <h2 className="font-display text-headline-sm text-on-surface">Windows</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-muted">{list.length} flagged · oldest first</p>
            <ul className="-mx-3 mt-4 max-h-[560px] overflow-y-auto">
              {list.map((e) => {
                const c = catOf(e.category);
                const on = e.event_id === sel?.event_id;
                return (
                  <li key={e.event_id}>
                    <button
                      type="button"
                      onClick={() => setSelId(e.event_id)}
                      aria-pressed={on}
                      className={cx('flex w-full items-start gap-3 rounded px-3 py-2.5 text-left transition-colors duration-quick hover:bg-surface-container-low', on && 'bg-surface-container-low shadow-[inset_3px_0_0_#FFCD11]')}
                    >
                      <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0', e.attribution === 'machine' ? 'rotate-45' : 'rounded-full')} style={{ background: c.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-body-md text-on-surface">{typeLabel(e.type)}</span>
                          <span className="text-body-sm tnum text-on-surface-muted">{fmtClock(e.ts)}</span>
                        </span>
                        <span className="block truncate text-body-sm text-on-surface-muted">
                          {e.machine_id} · {opName(e.operator_id)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {sel && <CauseDetail ev={sel} issues={issues.data ?? []} />}
        </div>
      </Card>
    </div>
  );
}

function EventTip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Point }> }) {
  const p = active && payload?.length ? payload[0].payload : undefined;
  if (!p) return null;
  const c = catOf(p.ev.category);
  return (
    <div className="rounded border border-outline bg-surface-container px-3 py-2 text-body-sm shadow-sm">
      <div className="font-semibold text-on-surface">{typeLabel(p.ev.type)}</div>
      <div className="text-on-surface-variant">
        {fmtClock(p.ev.ts)} · {p.ev.machine_id} · {opName(p.ev.operator_id)}
      </div>
      <div className="mt-1 text-on-surface-muted">{p.ev.attribution === 'machine' ? 'Machine-attributed' : c.label}</div>
    </div>
  );
}

// ------------------------------------------------------------------ what caused it?
type Finding = { kind: 'ok' | 'flag' | 'info'; text: string };

const fmtV = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));
const isMachineFeature = (f: FeatureContribution) => /^(hyd|engine|coolant|oil|pump|sensor)/.test(f.feature);
const outside = (f: FeatureContribution) => {
  const lo = f.baseline_mean - 1.5 * f.baseline_std;
  const hi = f.baseline_mean + 1.5 * f.baseline_std;
  return f.value < lo || f.value > hi;
};
const band = (f: FeatureContribution) => `${fmtV(f.baseline_mean - 1.5 * f.baseline_std)}–${fmtV(f.baseline_mean + 1.5 * f.baseline_std)}`;

function machineFindings(ev: SentinelEvent, issue: MachineIssue | undefined): Finding[] {
  const feats = (ev.explanation ?? []).filter(isMachineFeature);
  if (ev.attribution === 'machine') {
    const out: Finding[] = feats.map((f) => ({ kind: outside(f) ? 'flag' : 'ok', text: `${f.label}: ${fmtV(f.value)} ${f.unit} (usual ${band(f)})` }));
    if (!out.length) out.push({ kind: 'flag', text: 'Machine signals outside their usual range' });
    out.push(issue?.dtc?.length ? { kind: 'flag', text: `Fault code ${issue.dtc.join(', ')} active since ${fmtDate(issue.since_ts)}` } : { kind: 'info', text: 'No fault code yet — maintenance check requested' });
    if (issue?.operators_affected && issue.operators_affected > 1) out.push({ kind: 'flag', text: `Seen with ${issue.operators_affected} different operators on this machine` });
    return out;
  }
  const out: Finding[] = [{ kind: 'ok', text: feats.length && feats.some(outside) ? 'Hydraulic pressure slightly off — within tolerance' : 'Hydraulic pressure normal' }];
  out.push(issue?.dtc?.length ? { kind: 'info', text: `Open issue ${issue.dtc.join(', ')} on this machine — not active in this window` } : { kind: 'ok', text: 'No fault codes' });
  out.push({ kind: 'ok', text: 'All sensors reporting' });
  return out;
}

function patternFindings(ev: SentinelEvent): Finding[] {
  const feats = (ev.explanation ?? []).filter((f) => !isMachineFeature(f));
  const out: Finding[] = feats.map((f) =>
    outside(f)
      ? { kind: 'flag', text: `${f.label} ${f.direction === 'low' ? 'low' : 'high'}: ${fmtV(f.value)} ${f.unit} (usual ${band(f)})` }
      : { kind: 'ok', text: `${f.label} within usual range (${fmtV(f.value)} ${f.unit})` },
  );
  const ctx = ev.context ?? {};
  if (typeof ctx.task_type === 'string') out.push({ kind: 'info', text: `Task: ${titleCase(ctx.task_type)}${typeof ctx.zone === 'string' ? ` · zone ${ctx.zone}` : ''}` });
  if (ctx.waiting_for_truck === true) out.push({ kind: 'info', text: 'Operator marked “waiting for truck”' });
  if (!out.length) out.push({ kind: 'info', text: 'No operating features recorded for this window' });
  return out;
}

function verdict(ev: SentinelEvent): { text: string; icon: string; cls: string } {
  switch (ev.attribution) {
    case 'machine':
      return { text: 'Likely machine issue — routed to maintenance, not counted for coaching', icon: 'build', cls: 'text-notice-dark' };
    case 'operator':
      return { text: 'Likely operating pattern, not a machine fault', icon: 'sports_motorsports', cls: 'text-warning-text' };
    case 'environment':
      return { text: 'Likely site condition — not counted for coaching', icon: 'landscape', cls: 'text-on-surface-variant' };
    default:
      return { text: 'Cause unclear — reviewed in context before any coaching', icon: 'help', cls: 'text-on-surface-variant' };
  }
}

function FindingList({ items }: { items: Finding[] }) {
  return (
    <ul className="space-y-2">
      {items.map((f, i) => (
        <li key={i} className="flex items-start gap-2 text-body-sm">
          <Icon
            name={f.kind === 'ok' ? 'check_circle' : f.kind === 'flag' ? 'error' : 'info'}
            size={18}
            fill={f.kind !== 'info'}
            className={cx('mt-0.5', f.kind === 'ok' ? 'text-success-text' : f.kind === 'flag' ? 'text-warning-text' : 'text-on-surface-muted')}
          />
          <span className={f.kind === 'flag' ? 'text-on-surface' : 'text-on-surface-variant'}>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

function CauseDetail({ ev, issues }: { ev: SentinelEvent; issues: MachineIssue[] }) {
  const issue = issues.find((m) => m.machine_id === ev.machine_id);
  const c = catOf(ev.category);
  const v = verdict(ev);
  const machine = machineFindings(ev, issue);
  const pattern = patternFindings(ev);
  const comps = ev.attribution === 'operator' ? (ev.competency_ids ?? []) : [];

  return (
    <div className="min-w-0 space-y-6 xl:border-l xl:border-outline xl:pl-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-headline-sm text-on-surface">What caused it?</h2>
          <p className="mt-0.5 text-body-sm text-on-surface-muted">
            {typeLabel(ev.type)} · {fmtClock(ev.ts)} · {ev.machine_id} · {opName(ev.operator_id)}
          </p>
        </div>
        <Chip tone={c.tone}>{ev.attribution === 'machine' ? 'Machine-attributed' : c.label}</Chip>
      </div>

      <p className={cx('flex items-start gap-2 text-body-md font-semibold', v.cls)}>
        <Icon name={v.icon} size={22} />
        {v.text}
      </p>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-body-md font-semibold text-on-surface">Machine signals</h3>
          <FindingList items={machine} />
        </div>
        <div>
          <h3 className="mb-3 text-body-md font-semibold text-on-surface">Operating pattern</h3>
          <FindingList items={pattern} />
        </div>
      </div>

      <Details label="Compare with the same-task baseline">
        <p className="mb-3 text-body-sm text-on-surface-muted">This operator's own baseline for this task — not compared with other operators.</p>
        {ev.explanation?.length ? <ExplanationBars items={ev.explanation} bandLabel="same-task baseline" /> : <p className="text-body-sm text-on-surface-muted">No feature breakdown for this window.</p>}
      </Details>

      <p className="text-body-sm text-on-surface-muted">
        {ev.attribution === 'machine'
          ? 'Sent to maintenance. Not shown to the operator as coaching.'
          : comps.length
            ? `Instructor reviews before any coaching · linked competency: ${comps.map(competencyLabel).join(', ')}.`
            : 'Instructor reviews in context before any coaching.'}{' '}
        {ev.attribution === 'machine' ? (
          <Link to="/anomaly?tab=health" className="font-semibold text-notice-dark hover:underline">
            Machine health
          </Link>
        ) : ev.category === 'dangerous_condition' ? (
          <Link to={`/incidents?machine_id=${encodeURIComponent(ev.machine_id)}`} className="font-semibold text-notice-dark hover:underline">
            Open incident log
          </Link>
        ) : null}
      </p>

      <SourceNote kinds={['ML', 'RULE', ...(ev.simulated ? ['SIMULATED'] : [])]}>Per-task anomaly model; context gates: waiting for truck, travel</SourceNote>
    </div>
  );
}

// ================================================================== MACHINE HEALTH
const DRIFT_LABEL: Record<string, string> = {
  swing_dps_p95: 'Swing rate (P95)',
  hyd_pressure_bar_mean: 'Hydraulic pressure (mean)',
  idle_fraction: 'Idle share',
  joy_boom_jerk: 'Boom lever jerk',
};

function HealthTab() {
  const issues = useResource(() => cloud.machineIssues(), []);
  const drift = useResource(() => cloud.drift(), []);
  const list = issues.data ?? [];
  const feats = drift.data?.features ?? [];
  const isWatch = (f: (typeof feats)[number]) => f.status === 'watch' || f.status === 'alert' || f.psi >= 0.1;
  const watch = feats.filter(isWatch);

  return (
    <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_360px]">
      <Card title="Fault codes & machine issues" sub="Routed to maintenance — never counted for operator coaching">
        {issues.loading && !issues.data ? (
          <Loading label="Loading machine issues" />
        ) : list.length === 0 ? (
          <p className="text-body-md text-on-surface-muted">No open machine issues.</p>
        ) : (
          <TableWrap>
            <table className={cx(TABLE, 'min-w-[640px]')}>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Issue</th>
                  <th>Fault codes</th>
                  <th>Since</th>
                  <th className="text-right">Operators</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={`${m.machine_id}-${m.issue}`}>
                    <td className="font-semibold">{m.machine_id}</td>
                    <td className="text-on-surface">{m.issue}</td>
                    <td className="font-mono text-body-sm text-on-surface-variant">{(m.dtc ?? []).length ? (m.dtc ?? []).join(', ') : '—'}</td>
                    <td className="whitespace-nowrap tnum">{fmtDateTime(m.since_ts)}</td>
                    <td className="text-right tnum">{m.operators_affected ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-5 text-body-sm text-on-surface-muted">An issue seen with more than one operator on the same machine is treated as a machine problem first.</p>
      </Card>

      <Card title="Sensor drift" sub={drift.data?.window ?? 'Recent shifts'}>
        {drift.loading && !drift.data ? (
          <Loading label="Loading drift" />
        ) : (
          <div className="space-y-5">
            {watch.length > 0 ? (
              <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                <Icon name="error" size={18} fill className="mt-0.5 text-warning-text" />
                <span>
                  {watch.map((f) => DRIFT_LABEL[f.feature] ?? titleCase(f.feature)).join(', ')} shifted. Check sensor calibration at the next service — baselines using this signal are held so drift is not read as an operator change.
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
                <Icon name="check_circle" size={18} fill className="mt-0.5 text-success-text" />
                No sensor drift beyond the watch level.
              </p>
            )}
            <ul className="divide-y divide-outline">
              {feats.map((f) => {
                const w = isWatch(f);
                return (
                  <li key={f.feature} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <span className="text-body-md text-on-surface">{DRIFT_LABEL[f.feature] ?? titleCase(f.feature)}</span>
                    <span className={cx('inline-flex items-center gap-2 text-body-sm', w ? 'text-warning-text' : 'text-success-text')} title={`Stability index ${f.psi.toFixed(2)} (above 0.10 is watched)`}>
                      <span className={cx('h-2 w-2 rounded-full', w ? 'bg-warning' : 'bg-success')} aria-hidden />
                      {w ? 'Watch' : 'Stable'}
                      <span className="text-on-surface-muted tnum">{f.psi.toFixed(2)}</span>
                    </span>
                  </li>
                );
              })}
              {!feats.length && <li className="text-body-sm text-on-surface-muted">No drift report yet.</li>}
            </ul>
            <p className="text-body-sm text-on-surface-muted">The number is a stability index; above 0.10 is watched.</p>
            <SourceNote kinds={['SIMULATED']} />
          </div>
        )}
      </Card>
    </div>
  );
}
