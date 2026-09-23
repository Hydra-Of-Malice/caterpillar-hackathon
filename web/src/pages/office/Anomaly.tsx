/**
 * Screen 16 — Unusual Behaviour & Idle (R4). Three views:
 *  IDLE: idle split per machine per day, longest unexplained periods, litres of fuel (RULE).
 *  UNUSUAL OPERATION: flagged windows by category + "what caused it?" (machine signals vs operating pattern).
 *  MACHINE HEALTH: fault codes and sensor drift.
 * Operational units only — no money on this page.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { cloud } from '../../lib/api';
import { fmtClock, fmtDate, fmtDateTime, fmtDur, titleCase, typeLabel } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import type { FeatureContribution, IdleSummary, MachineIssue, RiskCategory, SentinelEvent } from '../../lib/types';
import { OPERATORS, competencyLabel } from '../../mocks/world';
import { DataSourceChip } from '../../components/DataSourceChip';
import { ExplanationBars } from '../../components/ExplanationBars';
import { GainChip, idleLitres, useUnitCosts } from '../../components/GainChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { AXIS, AXIS_LABEL, GRID, TOOLTIP } from '../../components/ops/chartTheme';
import { Chip, EmptyState, ErrorNote, Icon, Label, Loading, PageTitle, Panel, PanelHeader, cx } from '../../components/ui';

type Tab = 'idle' | 'unusual' | 'health';
const TABS: Array<{ value: Tab; label: string; icon: string }> = [
  { value: 'idle', label: 'Idle', icon: 'hourglass_empty' },
  { value: 'unusual', label: 'Unusual operation', icon: 'troubleshoot' },
  { value: 'health', label: 'Machine health', icon: 'build' },
];

const IDLE_DATE = '2026-09-23';
const IDLE_COLORS = { waiting: '#0066FF', warmup: '#1AC69E', unexplained: '#FB5A00' };

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
    <div className="space-y-6">
      <PageTitle
        kicker="R4 · Behaviour & idle"
        title="Unusual Behaviour & Idle"
        sub="Separates machine problems from operating habits, and explained idle from unexplained idle."
        right={<DataSourceChip endpoints={['/idle/summary', '/behaviour/events', '/supervisor/machine-issues']} modelBacked />}
      />

      <div className="flex border-b border-outline" role="tablist">
        {TABS.map((t) => {
          const on = t.value === tab;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.value)}
              className={cx(
                '-mb-px flex h-12 items-center gap-2 border-b-4 px-5 font-display text-label-md uppercase transition-colors duration-quick',
                on ? 'border-cat text-on-surface' : 'border-transparent text-on-surface-muted hover:text-on-surface',
              )}
            >
              <Icon name={t.icon} size={20} className={on ? 'text-cat-text' : undefined} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'idle' && <IdleTab />}
      {tab === 'unusual' && <UnusualTab />}
      {tab === 'health' && <HealthTab />}

      <div className="flex items-center gap-3 border border-outline bg-surface-container-low px-4 py-3">
        <Icon name="balance" size={22} className="text-cat-text" />
        <p className="text-body-md text-on-surface-variant">
          <span className="font-display uppercase text-on-surface">Unusual ≠ unsafe.</span> Events are reviewed in context before any coaching.
        </p>
      </div>
    </div>
  );
}

// ================================================================== IDLE
function IdleTab() {
  const { data, loading, error } = useResource(() => cloud.idleSummary(IDLE_DATE), []);
  const u = useUnitCosts();

  if (loading && !data) return <Loading label="Loading idle summary" />;
  if (!data) return error ? <ErrorNote error={error} /> : <EmptyState icon="hourglass_empty" title="No idle data yet" />;
  return <IdleBody data={data} idleLph={u.idle_fuel_l_per_h} litres={(m) => idleLitres(u, m)} />;
}

function IdleBody({ data, idleLph, litres }: { data: IdleSummary; idleLph: number; litres: (min: number) => number }) {
  const machines = (data.machines ?? []).map((m) => ({ ...m, days: m.days ?? [] }));
  const todayOf = (days: IdleSummary['machines'][number]['days']) => days[days.length - 1];
  const totals = machines.reduce(
    (a, m) => {
      const d = m.days.length ? todayOf(m.days) : undefined;
      if (!d) return a;
      return { waiting: a.waiting + d.waiting_min, warmup: a.warmup + d.warmup_min, unexplained: a.unexplained + d.unexplained_min };
    },
    { waiting: 0, warmup: 0, unexplained: 0 },
  );
  const fuelL = typeof data.fuel_unexplained_l === 'number' ? data.fuel_unexplained_l : litres(totals.unexplained);
  // Gains (ESTIMATE): assume half of the unexplained idle is avoidable; litres ↔ minutes at the idle burn rate.
  const savedL = fuelL * 0.5;
  const avoidMin = idleLph > 0 ? (savedL / idleLph) * 60 : 0;
  const prodH = avoidMin / 60;
  const total = totals.waiting + totals.warmup + totals.unexplained;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1fr_1.35fr]">
        <IdleStat color={IDLE_COLORS.waiting} label="Waiting for truck" min={totals.waiting} total={total} note="Explained — not flagged" />
        <IdleStat color={IDLE_COLORS.warmup} label="Warm-up / cool-down" min={totals.warmup} total={total} note="Explained — machine care" />
        <IdleStat color={IDLE_COLORS.unexplained} label="Unexplained" min={totals.unexplained} total={total} note="Reviewed in context" />
        <div className="flex flex-col justify-between gap-3 border border-outline border-l-4 border-l-series-orange bg-surface-container p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="font-display text-label-md uppercase text-on-surface-variant">Estimated fuel in unexplained idle</span>
            <ProvenanceBadges kinds={['RULE', ...(data.provenance ?? []).filter((p) => p !== 'RULE')]} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-headline-xl leading-none text-warning-text tnum">~{Math.round(fuelL)}</span>
            <span className="font-display text-headline-sm text-on-surface-muted">L today</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <GainChip size="sm">{Math.round(savedL)} L fuel saved today</GainChip>
            <GainChip size="sm">−{Math.round(avoidMin)} idle min</GainChip>
            <GainChip size="sm">+{prodH.toFixed(1)} productive h</GainChip>
          </div>
          <p className="text-footnote text-on-surface-muted">If half of the unexplained idle is avoided · {idleLph} L/h idle burn</p>
        </div>
      </div>

      <Panel>
        <PanelHeader
          icon="stacked_bar_chart"
          title="Idle per machine per day"
          sub="Minutes of engine idle, split by reason · last 7 days"
          right={
            <>
              <Legend />
              <DataSourceChip endpoints={['/idle/summary']} />
            </>
          }
        />
        {machines.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="hourglass_empty" title="No machines reported idle" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-px bg-outline lg:grid-cols-3">
            {machines.map((m) => {
              const t = m.days.length ? todayOf(m.days) : undefined;
              return (
                <div key={m.machine_id} className="bg-surface-container p-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-display text-headline-sm uppercase">{m.machine_id}</span>
                    {t && (
                      <span className="font-display text-label-sm uppercase text-on-surface-muted">
                        Today {fmtDur(t.waiting_min + t.warmup_min + t.unexplained_min)} · <span className="text-warning-text">{t.unexplained_min} m unexplained</span>
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={m.days} margin={{ top: 8, right: 4, bottom: 4, left: -8 }}>
                      <CartesianGrid {...GRID} vertical={false} />
                      <XAxis dataKey="date" {...AXIS} tickFormatter={(v: string) => v.split(' ')[0]} />
                      <YAxis {...AXIS} width={44} label={{ value: 'min', angle: -90, position: 'insideLeft', offset: 16, ...AXIS_LABEL }} />
                      <Tooltip {...TOOLTIP} formatter={(v, name) => [`${v} min`, name]} />
                      <Bar dataKey="waiting_min" name="Waiting for truck" stackId="idle" fill={IDLE_COLORS.waiting} isAnimationActive={false} />
                      <Bar dataKey="warmup_min" name="Warm-up / cool-down" stackId="idle" fill={IDLE_COLORS.warmup} isAnimationActive={false} />
                      <Bar dataKey="unexplained_min" name="Unexplained" stackId="idle" fill={IDLE_COLORS.unexplained} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader icon="timer_off" title="Longest unexplained idle periods" sub="Engine running, no truck waiting, no warm-up — with the context the edge attached" right={<ProvenanceBadges kinds={['RULE', 'SIMULATED']} />} />
        {(data.longest_unexplained ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState icon="check_circle" title="No unexplained idle periods" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Operator</th>
                  <th>Started</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Est. fuel</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {[...data.longest_unexplained]
                  .sort((a, b) => b.duration_min - a.duration_min)
                  .map((r) => (
                    <tr key={`${r.machine_id}-${r.start_ts}`}>
                      <td className="font-display text-label-md">{r.machine_id}</td>
                      <td className="whitespace-nowrap">
                        {opName(r.operator_id)} <span className="text-footnote text-on-surface-muted">{r.operator_id}</span>
                      </td>
                      <td className="whitespace-nowrap tnum">{fmtDateTime(r.start_ts)}</td>
                      <td className="text-right font-display text-label-md tnum">{fmtDur(r.duration_min)}</td>
                      <td className="text-right tnum text-on-surface-variant">{litres(r.duration_min).toFixed(1)} L</td>
                      <td className="text-on-surface-variant">{r.context}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function IdleStat({ color, label, min, total, note }: { color: string; label: string; min: number; total: number; note: string }) {
  const pct = total > 0 ? Math.round((min / total) * 100) : 0;
  return (
    <div className="flex flex-col justify-between gap-2 border border-outline bg-surface-container p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3" style={{ background: color }} />
        <span className="font-display text-label-md uppercase text-on-surface-variant">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-headline-xl leading-none tnum">{fmtDur(min)}</span>
        <span className="font-display text-label-md text-on-surface-muted tnum">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container-lowest">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-footnote text-on-surface-muted">Today, charted machines · {note}</span>
    </div>
  );
}

function Legend() {
  const items = [
    ['Waiting for truck', IDLE_COLORS.waiting],
    ['Warm-up / cool-down', IDLE_COLORS.warmup],
    ['Unexplained', IDLE_COLORS.unexplained],
  ];
  return (
    <span className="hidden items-center gap-3 md:flex">
      {items.map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5 font-display text-label-sm uppercase text-on-surface-variant">
          <span className="h-2.5 w-2.5" style={{ background: c }} />
          {l}
        </span>
      ))}
    </span>
  );
}

// ================================================================== UNUSUAL OPERATION
const CATEGORY: Record<string, { label: string; color: string; lane: number; tone: 'neutral' | 'yellow' | 'orange' | 'red' }> = {
  normal: { label: 'Normal', color: '#909090', lane: 1, tone: 'neutral' },
  unusual_harmless: { label: 'Unusual but harmless', color: '#909090', lane: 1, tone: 'neutral' },
  procedural: { label: 'Procedural', color: '#F3C206', lane: 2, tone: 'yellow' },
  emerging_degradation: { label: 'Possible skill gap', color: '#FB5A00', lane: 3, tone: 'orange' },
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
        {on && <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#FFCD11" strokeWidth={2} />}
        {machine ? (
          <polygon points={`${x},${y - r - 2} ${x + r + 2},${y} ${x},${y + r + 2} ${x - r - 2},${y}`} fill={color} stroke="#000" strokeWidth={1.5} />
        ) : (
          <circle cx={x} cy={y} r={r} fill={color} stroke="#000" strokeWidth={1.5} />
        )}
      </g>
    );
  };

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          icon="scatter_plot"
          title="Flagged windows today"
          sub="Each dot is a time window the detector found unusual for its task. Select one to see what caused it."
          right={
            <>
              <ProvenanceBadges kinds={['ML', 'RULE', 'SIMULATED']} />
              <DataSourceChip endpoints={['/behaviour/events']} modelBacked />
            </>
          }
        />
        <div className="px-4 pb-2 pt-4">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis
                type="number"
                dataKey="x"
                domain={[minTs - pad, maxTs + pad]}
                ticks={hourTicks}
                tickFormatter={(v: number) => fmtClock(v)}
                {...AXIS}
                label={{ value: 'Time of day', position: 'insideBottomRight', offset: -4, ...AXIS_LABEL }}
                height={40}
              />
              <YAxis type="number" dataKey="y" domain={[0.5, 4.5]} ticks={[1, 2, 3, 4]} tickFormatter={(v: number) => LANES[v] ?? ''} {...AXIS} width={150} />
              <ZAxis type="number" dataKey="z" range={[80, 80]} />
              <Tooltip {...TOOLTIP} cursor={{ strokeDasharray: '3 3', stroke: 'var(--chart-tip-border)' }} content={<EventTip />} />
              <Scatter data={points} shape={renderPoint} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap items-center gap-4 pb-2 pl-[150px] font-display text-label-sm uppercase text-on-surface-variant">
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
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <Panel>
          <PanelHeader icon="list" title="Windows" sub={`${list.length} flagged · oldest first`} />
          <ul className="max-h-[640px] divide-y divide-outline overflow-y-auto">
            {list.map((e) => {
              const c = catOf(e.category);
              const on = e.event_id === sel?.event_id;
              return (
                <li key={e.event_id}>
                  <button
                    type="button"
                    onClick={() => setSelId(e.event_id)}
                    className={cx('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-quick hover:bg-surface-container-high', on && 'bg-surface-container-high shadow-[inset_4px_0_0_#FFCD11]')}
                  >
                    <span className={cx('mt-1 h-3 w-3 shrink-0', e.attribution === 'machine' ? 'rotate-45' : 'rounded-full')} style={{ background: c.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-display text-label-md uppercase text-on-surface">{typeLabel(e.type)}</span>
                        <span className="font-display text-label-sm tnum text-on-surface-muted">{fmtClock(e.ts)}</span>
                      </span>
                      <span className="block truncate text-footnote text-on-surface-muted">
                        {e.machine_id} · {opName(e.operator_id)} · {e.attribution === 'machine' ? 'machine-attributed' : c.label.toLowerCase()}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {sel && <CausePanel ev={sel} issues={issues.data ?? []} />}
      </div>
    </div>
  );
}

function EventTip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Point }> }) {
  const p = active && payload?.length ? payload[0].payload : undefined;
  if (!p) return null;
  const c = catOf(p.ev.category);
  return (
    <div className="border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm">
      <div className="font-display text-label-md uppercase text-on-surface">{typeLabel(p.ev.type)}</div>
      <div className="text-on-surface-variant">
        {fmtClock(p.ev.ts)} · {p.ev.machine_id} · {opName(p.ev.operator_id)}
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-display text-label-sm uppercase" style={{ color: c.color }}>
        {p.ev.attribution === 'machine' ? 'Machine-attributed' : c.label}
      </div>
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
      return { text: 'Likely machine issue — routed to maintenance, not counted for coaching', icon: 'build', cls: 'border-notice-dark text-notice-dark bg-notice/10' };
    case 'operator':
      return { text: 'Likely operating pattern, not a machine fault', icon: 'sports_motorsports', cls: 'border-warning text-warning-text bg-warning/10' };
    case 'environment':
      return { text: 'Likely site condition — not counted for coaching', icon: 'landscape', cls: 'border-outline-strong text-on-surface-variant bg-surface-container-low' };
    default:
      return { text: 'Cause unclear — reviewed in context before any coaching', icon: 'help', cls: 'border-outline-strong text-on-surface-variant bg-surface-container-low' };
  }
}

function FindingList({ items }: { items: Finding[] }) {
  return (
    <ul className="space-y-2">
      {items.map((f, i) => (
        <li key={i} className="flex items-start gap-2 text-body-sm">
          <Icon
            name={f.kind === 'ok' ? 'check_circle' : f.kind === 'flag' ? 'error' : 'info'}
            size={20}
            fill={f.kind !== 'info'}
            className={f.kind === 'ok' ? 'text-success-text' : f.kind === 'flag' ? 'text-warning-text' : 'text-on-surface-muted'}
          />
          <span className={f.kind === 'flag' ? 'text-on-surface' : 'text-on-surface-variant'}>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

function CausePanel({ ev, issues }: { ev: SentinelEvent; issues: MachineIssue[] }) {
  const issue = issues.find((m) => m.machine_id === ev.machine_id);
  const c = catOf(ev.category);
  const v = verdict(ev);
  const machine = machineFindings(ev, issue);
  const pattern = patternFindings(ev);
  const machineFlag = machine.some((f) => f.kind === 'flag');
  const patternFlag = pattern.some((f) => f.kind === 'flag');
  const comps = ev.attribution === 'operator' ? ev.competency_ids ?? [] : [];

  return (
    <Panel>
      <PanelHeader
        icon="psychology_alt"
        title="What caused it?"
        sub={`${typeLabel(ev.type)} · ${fmtClock(ev.ts)} · ${ev.machine_id} · ${opName(ev.operator_id)}`}
        right={
          <>
            <Chip tone={c.tone}>{ev.attribution === 'machine' ? 'Machine-attributed' : c.label}</Chip>
            <DataSourceChip endpoints={['/behaviour/events']} modelBacked />
          </>
        }
      />
      <div className="space-y-5 p-4">
        <div className="grid grid-cols-1 gap-px bg-outline md:grid-cols-2">
          <div className={cx('bg-surface-container p-4', machineFlag ? 'shadow-[inset_0_4px_0_#E56C00]' : 'shadow-[inset_0_4px_0_#197527]')}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-label-lg uppercase">
                <Icon name="precision_manufacturing" size={20} className={machineFlag ? 'text-warning-text' : 'text-success-text'} />
                Machine signals
              </h3>
              <ProvenanceBadge kind="RULE" />
            </div>
            <FindingList items={machine} />
          </div>
          <div className={cx('bg-surface-container p-4', patternFlag ? 'shadow-[inset_0_4px_0_#E56C00]' : 'shadow-[inset_0_4px_0_#197527]')}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-label-lg uppercase">
                <Icon name="sports_motorsports" size={20} className={patternFlag ? 'text-warning-text' : 'text-success-text'} />
                Operating pattern
              </h3>
              <ProvenanceBadge kind="ML" />
            </div>
            <FindingList items={pattern} />
          </div>
        </div>

        <div className={cx('flex items-center gap-3 border-2 px-4 py-3 font-display text-label-lg uppercase', v.cls)}>
          <Icon name={v.icon} size={24} />
          {v.text}
        </div>

        <div className="border-t border-outline pt-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-label-lg uppercase">Compared with the same-task baseline</h3>
            <span className="text-footnote text-on-surface-muted">This operator's own baseline for this task — not compared with other operators</span>
          </div>
          {ev.explanation?.length ? <ExplanationBars items={ev.explanation} bandLabel="same-task baseline" /> : <p className="text-body-sm text-on-surface-muted">No feature breakdown for this window.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline pt-4 text-body-sm text-on-surface-variant">
          <span className="flex items-center gap-2">
            <ProvenanceBadge kind="ML" /> Isolation Forest, per task{ev.model_version ? ` · ${ev.model_version}` : ''}
          </span>
          <span className="flex items-center gap-2">
            <ProvenanceBadge kind="RULE" /> Context gates: waiting-for-truck, travel, warm-up
          </span>
          {ev.simulated && <ProvenanceBadge kind="SIMULATED" />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-low px-4 py-3">
          <span className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <Icon name="rule" size={20} className="text-on-surface-muted" />
            {ev.attribution === 'machine'
              ? 'Sent to maintenance. Not shown to the operator as coaching.'
              : comps.length
                ? `Instructor reviews before any coaching · linked competency: ${comps.map(competencyLabel).join(', ')}`
                : 'Instructor reviews in context before any coaching.'}
          </span>
          {ev.attribution === 'machine' ? (
            <Link to="/anomaly?tab=health" className="font-display text-label-sm uppercase text-cat-text underline underline-offset-2">
              Machine health
            </Link>
          ) : ev.category === 'dangerous_condition' ? (
            <Link to={`/incidents?machine_id=${encodeURIComponent(ev.machine_id)}`} className="font-display text-label-sm uppercase text-cat-text underline underline-offset-2">
              Open incident log
            </Link>
          ) : null}
        </div>
      </div>
    </Panel>
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
  const watch = feats.filter((f) => f.status === 'watch' || f.status === 'alert' || f.psi >= 0.1);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">
      <Panel>
        <PanelHeader icon="build" title="Fault codes & machine issues" sub="Attributed to the machine — routed to maintenance, never counted for operator coaching" right={<DataSourceChip endpoints={['/supervisor/machine-issues']} />} />
        {issues.loading && !issues.data ? (
          <Loading label="Loading machine issues" />
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="verified" title="No open machine issues" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense w-full min-w-[820px]">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Issue</th>
                  <th>Fault codes</th>
                  <th>Since</th>
                  <th className="text-right">Operators affected</th>
                  <th>Routed to</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={`${m.machine_id}-${m.issue}`}>
                    <td className="font-display text-label-md">{m.machine_id}</td>
                    <td>
                      <div className="text-on-surface">{m.issue}</div>
                      <div className="text-footnote text-on-surface-muted">Attributed to {m.attribution}</div>
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {(m.dtc ?? []).length ? (
                          (m.dtc ?? []).map((d) => (
                            <span key={d} className="border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-mono text-footnote text-on-surface">
                              {d}
                            </span>
                          ))
                        ) : (
                          <span className="text-on-surface-muted">—</span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap tnum">{fmtDateTime(m.since_ts)}</td>
                    <td className="text-right tnum">{m.operators_affected ?? '—'}</td>
                    <td>
                      <Chip tone="blue" icon="engineering">
                        Maintenance
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-outline px-4 py-3 text-footnote text-on-surface-muted">
          <Icon name="info" size={16} />
          An issue seen with more than one operator on the same machine is treated as a machine problem first.
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon="query_stats" title="Sensor drift" sub={drift.data?.window ?? 'Recent shifts'} right={<ProvenanceBadge kind="SIMULATED" />} />
        <div className="space-y-4 p-4">
          {drift.loading && !drift.data ? (
            <Loading label="Loading drift" />
          ) : (
            <>
              {watch.length > 0 ? (
                <div className="border-l-4 border-warning bg-warning/10 px-3 py-2 text-body-sm text-on-surface-variant">
                  <div className="mb-1 font-display text-label-md uppercase text-warning-text">Drift note</div>
                  {watch.map((f) => DRIFT_LABEL[f.feature] ?? titleCase(f.feature)).join(', ')} shifted over {drift.data?.window ?? 'recent shifts'}. Check sensor calibration at the next service. Baselines using
                  this signal are held until checked, so drift is not read as an operator change.
                </div>
              ) : (
                <div className="border-l-4 border-success bg-success/10 px-3 py-2 text-body-sm text-on-surface-variant">No sensor drift beyond the watch level.</div>
              )}
              <ul className="divide-y divide-outline border border-outline">
                {feats.map((f) => {
                  const w = f.status === 'watch' || f.status === 'alert' || f.psi >= 0.1;
                  return (
                    <li key={f.feature} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-body-sm text-on-surface">{DRIFT_LABEL[f.feature] ?? titleCase(f.feature)}</span>
                      <span className="flex items-center gap-2">
                        <Label className="tnum">PSI {f.psi.toFixed(2)}</Label>
                        <Chip tone={w ? 'orange' : 'green'}>{w ? 'Watch' : 'Stable'}</Chip>
                      </span>
                    </li>
                  );
                })}
                {!feats.length && <li className="px-3 py-2 text-body-sm text-on-surface-muted">No drift report yet.</li>}
              </ul>
              <p className="text-footnote text-on-surface-muted">PSI = population stability index (shift in the signal distribution); above 0.10 is watched.</p>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
