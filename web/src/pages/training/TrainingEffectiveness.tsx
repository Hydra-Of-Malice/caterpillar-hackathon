/**
 * Training effectiveness (/training/effectiveness): SIMULATED cohort of trainees coached by the
 * Expert Motion Model (phase-level tips) vs the same practice without feedback.
 * Data: cloud GET /practice/cohort-sim (fixture fallback in src/mocks/cohort.ts).
 * Gains are shown in operational units only (sessions, m³/h, share of cycles) — never dollars.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { practice } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import type { CohortArm, CohortSim } from '../../lib/types';
import { DataSourceChip } from '../../components/DataSourceChip';
import { GainChip, signed } from '../../components/GainChip';
import { KpiTile } from '../../components/KpiTile';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { Button, ErrorNote, Icon, Label, Loading, Panel, PageTitle, PanelHeader, Segmented, cx } from '../../components/ui';

// ------------------------------------------------------------------ constants
const SESSIONS = 12;
const DEFAULT_EFFECT = 1.4;
const C_COLOR = '#1AC69E'; // coached (ML)
const K_COLOR = '#909090'; // control (baseline, recessive)
const GRID = 'var(--chart-grid)';
const AXIS_STROKE = 'var(--chart-axis)';
const TICK = { fill: 'var(--chart-tick)', fontSize: 12 };
const TIP_STYLE = { background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)', borderRadius: 4 };
const C_NAME = 'Coached — ML coaching tips';
const K_NAME = 'Control — practice without feedback';
const DEFAULT_CAVEAT = 'SIMULATED cohort — learning effect is an assumption to be validated in a pilot';

type CohortSize = '10' | '20' | '50';

// ------------------------------------------------------------------ derived numbers
interface Gains {
  cMed: number | null;
  kMed: number | null;
  outC?: number;
  outK?: number;
  outPct: number | null;
  fsC?: number;
  fsK?: number;
  fsPct: number | null;
  shC: number;
  shK: number;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = (s.length - 1) / 2;
  return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2;
}

function medianToProficient(a: CohortArm): number | null {
  if (typeof a.median_sessions_to_proficient === 'number') return a.median_sessions_to_proficient;
  return median((a.sessions_to_proficient ?? []).filter((x): x is number => typeof x === 'number'));
}

function shareBy8(a: CohortArm): number {
  if (typeof a.share_proficient_by_session_8 === 'number') return a.share_proficient_by_session_8;
  const xs = a.sessions_to_proficient ?? [];
  return xs.length ? xs.filter((x) => typeof x === 'number' && x <= 8).length / xs.length : 0;
}

const pctChange = (a?: number, b?: number): number | null => (typeof a === 'number' && typeof b === 'number' && b !== 0 ? (a / b - 1) * 100 : null);
const round = (v: number | null): number | null => (v === null ? null : Math.round(v));
const pct = (share?: number): string => (typeof share === 'number' ? `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%` : '—');

function gains(d: CohortSim): Gains {
  const c = d.arms.coached;
  const k = d.arms.control;
  return {
    cMed: round(medianToProficient(c)),
    kMed: round(medianToProficient(k)),
    outC: c.output_m3_per_h_last,
    outK: k.output_m3_per_h_last,
    outPct: pctChange(c.output_m3_per_h_last, k.output_m3_per_h_last),
    fsC: c.fast_swing_share_last,
    fsK: k.fast_swing_share_last,
    fsPct: pctChange(c.fast_swing_share_last, k.fast_swing_share_last),
    shC: shareBy8(c),
    shK: shareBy8(k),
  };
}

interface CurveRow {
  session: number;
  c_p50?: number;
  c_band?: [number, number];
  k_p50?: number;
  k_band?: [number, number];
}

function curveRows(d: CohortSim): CurveRow[] {
  const rows = new Map<number, CurveRow>();
  const get = (s: number) => {
    let r = rows.get(s);
    if (!r) {
      r = { session: s };
      rows.set(s, r);
    }
    return r;
  };
  for (const p of d.arms.coached.curve ?? []) Object.assign(get(p.session), { c_p50: p.p50, c_band: [p.p05, p.p95] });
  for (const p of d.arms.control.curve ?? []) Object.assign(get(p.session), { k_p50: p.p50, k_band: [p.p05, p.p95] });
  return [...rows.values()].sort((a, b) => a.session - b.session);
}

interface HistRow {
  bin: string;
  coached: number;
  control: number;
}

function histRows(d: CohortSim, nSessions: number): HistRow[] {
  const bins: HistRow[] = Array.from({ length: nSessions }, (_, i) => ({ bin: String(i + 1), coached: 0, control: 0 }));
  const notReached: HistRow = { bin: 'Not reached', coached: 0, control: 0 };
  const add = (xs: Array<number | null>, key: 'coached' | 'control') => {
    for (const v of xs ?? []) {
      const s = typeof v === 'number' ? Math.round(v) : null;
      if (s === null || s < 1 || s > nSessions) notReached[key] += 1;
      else bins[s - 1][key] += 1;
    }
  };
  add(d.arms.coached.sessions_to_proficient, 'coached');
  add(d.arms.control.sessions_to_proficient, 'control');
  return [...bins, notReached];
}

// ------------------------------------------------------------------ small pieces
function LineSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return <span className="inline-block w-6 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />;
}

function BandSwatch({ color }: { color: string }) {
  return <span className="inline-block h-3 w-6 border" style={{ background: `${color}33`, borderColor: `${color}66` }} />;
}

function BarSwatch({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3" style={{ background: color }} />;
}

function SeriesLegend({ kind }: { kind: 'curve' | 'bars' }) {
  const item = (swatch: ReactNode, text: string) => (
    <span className="inline-flex items-center gap-2 font-display text-label-sm uppercase text-on-surface-variant">
      {swatch}
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3">
      {kind === 'curve' ? (
        <>
          {item(<LineSwatch color={C_COLOR} />, C_NAME)}
          {item(<LineSwatch color={K_COLOR} dashed />, K_NAME)}
          {item(
            <span className="inline-flex gap-1">
              <BandSwatch color={C_COLOR} />
              <BandSwatch color={K_COLOR} />
            </span>,
            'Shaded = middle 90% of simulated trainees',
          )}
        </>
      ) : (
        <>
          {item(<BarSwatch color={C_COLOR} />, C_NAME)}
          {item(<BarSwatch color={K_COLOR} />, K_NAME)}
          {item(<span className="inline-block h-3 w-0 border-l-2 border-dashed border-on-surface-muted" />, 'Dashed = arm median')}
        </>
      )}
    </div>
  );
}

function TipLine({ color, dashed, label, p50, band }: { color: string; dashed?: boolean; label: string; p50?: number; band?: [number, number] }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <LineSwatch color={color} dashed={dashed} />
      <span className="w-16 font-display text-label-sm uppercase text-on-surface-variant">{label}</span>
      <span className="tnum font-display text-label-md text-on-surface">{typeof p50 === 'number' ? p50.toFixed(0) : '—'}</span>
      {band && (
        <span className="tnum text-footnote text-on-surface-muted">
          ({band[0].toFixed(0)}–{band[1].toFixed(0)})
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ learning curve
function LearningCurve({ d, g }: { d: CohortSim; g: Gains }) {
  const rows = useMemo(() => curveRows(d), [d]);
  const n = rows.length ? rows[rows.length - 1].session : d.sessions;
  const lastIdx = rows.length - 1;
  const last = rows[lastIdx];
  const close = last && typeof last.c_p50 === 'number' && typeof last.k_p50 === 'number' && Math.abs(last.c_p50 - last.k_p50) < 6;
  const ticks = Array.from({ length: n }, (_, i) => i + 1);
  const prof = d.bands?.proficient ?? 65;
  const expert = d.bands?.expert_like ?? 85;
  const clampX = (v: number | null) => (v === null ? null : Math.max(1, Math.min(n, v)));
  const cDot = clampX(g.cMed);
  const kDot = clampX(g.kMed);

  const endLabel = (p: { x?: number | string; y?: number | string; index?: number }, text: string, value: number | undefined, dy: number) => {
    if (p.index !== lastIdx || typeof value !== 'number') return null;
    const x = Number(p.x ?? 0);
    const y = Number(p.y ?? 0);
    return (
      <text x={x + 10} y={y + 4 + dy} fill="var(--svg-text)" fontSize={12} fontWeight={700} fontFamily="'Roboto Condensed', sans-serif" letterSpacing="0.06em">
        {text} {value.toFixed(0)}
      </text>
    );
  };

  return (
    <div className="h-[380px] w-full px-2 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 104, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <ReferenceArea y1={prof} y2={expert} fill="var(--svg-text)" fillOpacity={0.025} ifOverflow="hidden" />
          <ReferenceArea y1={expert} y2={100} fill="var(--svg-text)" fillOpacity={0.055} ifOverflow="hidden" />
          <XAxis
            dataKey="session"
            type="number"
            domain={[1, n]}
            ticks={ticks}
            allowDecimals={false}
            stroke={AXIS_STROKE}
            tick={TICK}
            tickLine={false}
            label={{ value: 'Practice session', position: 'insideBottom', offset: -14, fill: 'var(--chart-tick)', fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            stroke={AXIS_STROKE}
            tick={TICK}
            tickLine={false}
            width={56}
            label={{ value: 'Expert-likeness score (0–100)', angle: -90, position: 'insideLeft', offset: 4, fill: 'var(--chart-tick)', fontSize: 12, style: { textAnchor: 'middle' } }}
          />
          <ReferenceLine
            y={prof}
            stroke="var(--svg-text)"
            strokeOpacity={0.55}
            strokeDasharray="3 4"
            label={{ value: `PROFICIENT ≥ ${prof}`, position: 'insideTopLeft', fill: 'var(--svg-text)', fontSize: 11, fontWeight: 700 }}
          />
          <ReferenceLine
            y={expert}
            stroke="var(--svg-text)"
            strokeOpacity={0.55}
            strokeDasharray="3 4"
            label={{ value: `EXPERT-LIKE ≥ ${expert}`, position: 'insideTopLeft', fill: 'var(--svg-text)', fontSize: 11, fontWeight: 700 }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-tip-border)', strokeWidth: 1 }}
            contentStyle={TIP_STYLE}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as CurveRow;
              return (
                <div style={TIP_STYLE} className="px-3 py-2">
                  <div className="mb-1 font-display text-label-sm uppercase text-on-surface-muted">Session {r.session}</div>
                  <TipLine color={C_COLOR} label="Coached" p50={r.c_p50} band={r.c_band} />
                  <TipLine color={K_COLOR} dashed label="Control" p50={r.k_p50} band={r.k_band} />
                  <div className="mt-1 text-footnote text-on-surface-muted">Median (middle 90% of simulated trainees)</div>
                </div>
              );
            }}
          />
          <Area dataKey="k_band" type="monotone" stroke="none" fill={K_COLOR} fillOpacity={0.14} legendType="none" activeDot={false} animationDuration={350} />
          <Area dataKey="c_band" type="monotone" stroke="none" fill={C_COLOR} fillOpacity={0.18} legendType="none" activeDot={false} animationDuration={350} />
          <Line
            dataKey="k_p50"
            name={K_NAME}
            type="monotone"
            stroke={K_COLOR}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5, stroke: '#1E1E1E', strokeWidth: 2, fill: K_COLOR }}
            animationDuration={350}
          >
            <LabelList dataKey="k_p50" content={(p) => endLabel(p, 'CONTROL', last?.k_p50, close ? 8 : 0)} />
          </Line>
          <Line
            dataKey="c_p50"
            name={C_NAME}
            type="monotone"
            stroke={C_COLOR}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, stroke: '#1E1E1E', strokeWidth: 2, fill: C_COLOR }}
            animationDuration={350}
          >
            <LabelList dataKey="c_p50" content={(p) => endLabel(p, 'COACHED', last?.c_p50, close ? -8 : 0)} />
          </Line>
          {kDot !== null && <ReferenceDot x={kDot} y={prof} r={6} fill={K_COLOR} stroke="#1E1E1E" strokeWidth={2} ifOverflow="visible" />}
          {cDot !== null && <ReferenceDot x={cDot} y={prof} r={6} fill={C_COLOR} stroke="#1E1E1E" strokeWidth={2} ifOverflow="visible" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ sessions-to-proficiency histogram
function ProficiencyHistogram({ d, g }: { d: CohortSim; g: Gains }) {
  const n = d.arms.coached.curve?.length || d.sessions || SESSIONS;
  const rows = useMemo(() => histRows(d, n), [d, n]);
  const inRange = (v: number | null) => v !== null && v >= 1 && v <= n;
  return (
    <div className="h-[300px] w-full px-2 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 16, right: 16, bottom: 24, left: 8 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="bin"
            stroke={AXIS_STROKE}
            tick={TICK}
            tickLine={false}
            interval={0}
            tickFormatter={(v: string) => (v === 'Not reached' ? 'NOT REACHED' : v)}
            label={{ value: 'First session held in the proficient band', position: 'insideBottom', offset: -14, fill: 'var(--chart-tick)', fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            stroke={AXIS_STROKE}
            tick={TICK}
            tickLine={false}
            width={56}
            label={{ value: 'Simulated trainees', angle: -90, position: 'insideLeft', offset: 4, fill: 'var(--chart-tick)', fontSize: 12, style: { textAnchor: 'middle' } }}
          />
          <Tooltip
            cursor={{ fill: 'var(--svg-text)', fillOpacity: 0.04 }}
            contentStyle={TIP_STYLE}
            labelStyle={{ color: 'var(--chart-tick)', fontFamily: "'Roboto Condensed', sans-serif", textTransform: 'uppercase', fontSize: 12 }}
            itemStyle={{ color: 'var(--svg-text)', fontSize: 12 }}
            labelFormatter={(b: string) => (b === 'Not reached' ? `Not proficient within ${n} sessions` : `Proficient from session ${b}`)}
            formatter={(v: number | string, name: string) => [`${v} trainee${Number(v) === 1 ? '' : 's'}`, name]}
          />
          <Bar dataKey="coached" name={C_NAME} fill={C_COLOR} radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={350} />
          <Bar dataKey="control" name={K_NAME} fill={K_COLOR} radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={350} />
          {inRange(g.kMed) && <ReferenceLine x={String(g.kMed)} stroke={K_COLOR} strokeWidth={2} strokeDasharray="4 3" />}
          {inRange(g.cMed) && <ReferenceLine x={String(g.cMed)} stroke={C_COLOR} strokeWidth={2} strokeDasharray="4 3" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ first vs last session (table view)
function FirstLastTable({ d, g }: { d: CohortSim; g: Gains }) {
  const c = d.arms.coached;
  const k = d.arms.control;
  const n = c.curve?.length || d.sessions || SESSIONS;
  const first = (a: CohortArm) => a.curve?.[0]?.p50;
  const lastP = (a: CohortArm) => a.curve?.[a.curve.length - 1]?.p50;
  const notReached = (a: CohortArm) => (a.sessions_to_proficient ?? []).filter((x) => typeof x !== 'number' || x > n).length;
  const num = (v?: number, digits = 0) => (typeof v === 'number' ? v.toFixed(digits) : '—');
  const arrow = (a: string, b: string) => (
    <span className="tnum whitespace-nowrap">
      <span className="text-on-surface-muted">{a}</span>
      <span className="px-1.5 text-on-surface-muted">→</span>
      <span className="font-semibold text-on-surface">{b}</span>
    </span>
  );
  const rows: Array<{ label: string; unit?: string; c: ReactNode; k: ReactNode }> = [
    { label: 'Expert-likeness score', unit: 'median, 0–100', c: arrow(num(first(c)), num(lastP(c))), k: arrow(num(first(k)), num(lastP(k))) },
    { label: 'Output', unit: 'm³/h, cohort mean', c: arrow(num(c.output_m3_per_h_first), num(c.output_m3_per_h_last)), k: arrow(num(k.output_m3_per_h_first), num(k.output_m3_per_h_last)) },
    { label: 'Fast swings near truck', unit: 'share of cycles', c: arrow(pct(c.fast_swing_share_first), pct(c.fast_swing_share_last)), k: arrow(pct(k.fast_swing_share_first), pct(k.fast_swing_share_last)) },
    { label: 'Sessions to proficient', unit: 'median', c: <span className="tnum font-semibold">{g.cMed ?? '—'}</span>, k: <span className="tnum font-semibold">{g.kMed ?? '—'}</span> },
    { label: 'Proficient by session 8', unit: 'share of trainees', c: <span className="tnum font-semibold">{pct(g.shC)}</span>, k: <span className="tnum font-semibold">{pct(g.shK)}</span> },
    { label: `Not proficient in ${n}`, unit: 'trainees', c: <span className="tnum font-semibold">{notReached(c)} of {c.sessions_to_proficient?.length ?? d.n}</span>, k: <span className="tnum font-semibold">{notReached(k)} of {k.sessions_to_proficient?.length ?? d.n}</span> },
  ];
  return (
    <table className="w-full text-body-sm">
      <thead>
        <tr className="border-b border-outline">
          <th className="px-4 py-2 text-left font-display text-label-sm uppercase text-on-surface-muted">Metric</th>
          <th className="px-4 py-2 text-left font-display text-label-sm uppercase text-on-surface-muted">
            <span className="inline-flex items-center gap-2">
              <BarSwatch color={C_COLOR} /> Coached
            </span>
          </th>
          <th className="px-4 py-2 text-left font-display text-label-sm uppercase text-on-surface-muted">
            <span className="inline-flex items-center gap-2">
              <BarSwatch color={K_COLOR} /> Control
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-outline last:border-b-0">
            <td className="px-4 py-2.5">
              <div className="text-on-surface">{r.label}</div>
              {r.unit && <div className="text-footnote text-on-surface-muted">{r.unit}</div>}
            </td>
            <td className="px-4 py-2.5 text-on-surface">{r.c}</td>
            <td className="px-4 py-2.5 text-on-surface-variant">{r.k}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ assumptions (effect slider + cohort size)
function Assumptions({
  effect, setEffect, n, setN, d, busy,
}: { effect: number; setEffect: (v: number) => void; n: CohortSize; setN: (v: CohortSize) => void; d: CohortSim; busy: boolean }) {
  const e = effect.toFixed(1);
  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader icon="tune" title="Simulation assumptions" right={<ProvenanceBadge kind="SIMULATED" />} />
      <div className="flex flex-1 flex-col gap-5 px-4 py-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Label>Coaching effect (learning-rate multiplier)</Label>
            <span className="tnum font-display text-headline-lg text-on-surface">×{e}</span>
          </div>
          <input
            type="range"
            min={1}
            max={1.8}
            step={0.1}
            value={effect}
            onChange={(ev) => setEffect(Math.round(Number(ev.target.value) * 10) / 10)}
            aria-label="Coaching effect multiplier"
            className="mt-2 h-2 w-full cursor-pointer"
            style={{ accentColor: '#FFCD11', colorScheme: 'light' }}
          />
          <div className="mt-1 flex justify-between font-display text-label-sm text-on-surface-muted tnum">
            {['1.0', '1.2', '1.4', '1.6', '1.8'].map((t) => (
              <span key={t}>×{t}</span>
            ))}
          </div>
          <p className="mt-3 border-l-4 border-prov-sim bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">
            {effect <= 1.0 ? (
              <>
                <span className="tnum font-semibold text-on-surface">effect ×1.0</span> = no coaching benefit: both arms learn at the same rate (null check — remaining gaps are simulation noise).
              </>
            ) : (
              <>
                <span className="tnum font-semibold text-on-surface">effect ×{e}</span> = coached trainees learn {e}× faster per session <span className="text-on-surface-muted">(assumption)</span>.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>Simulated trainees per arm</Label>
          <Segmented<CohortSize>
            value={n}
            onChange={setN}
            options={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
            ]}
          />
        </div>

        <dl className="space-y-3 border-t border-outline pt-4 text-body-sm">
          <div className="flex gap-3">
            <dt className="pt-2">
              <LineSwatch color={C_COLOR} />
            </dt>
            <dd>
              <div className="font-display text-label-md uppercase text-on-surface">{C_NAME}</div>
              <div className="text-on-surface-muted">Phase-level tips from the Expert Motion Model after every practice session.</div>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="pt-2">
              <LineSwatch color={K_COLOR} dashed />
            </dt>
            <dd>
              <div className="font-display text-label-md uppercase text-on-surface">{K_NAME}</div>
              <div className="text-on-surface-muted">Same exercises and number of sessions, no tips.</div>
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-outline pt-3 text-footnote text-on-surface-muted">
          <span className="tnum">
            {d.n} trainees per arm · {d.sessions} sessions · effect ×{Number(d.effect).toFixed(1)}
          </span>
          <span className="flex items-center gap-2">
            {busy && (
              <span className="flex items-center gap-1.5 font-display text-label-sm uppercase text-on-surface-variant">
                <span className="h-1.5 w-1.5 animate-pulse bg-cat" /> Re-simulating
              </span>
            )}
            {d.model_version && <span className="font-mono">{d.model_version}</span>}
            {effect !== DEFAULT_EFFECT && (
              <button type="button" onClick={() => setEffect(DEFAULT_EFFECT)} className="font-display text-label-sm uppercase text-notice-dark hover:underline">
                Reset ×{DEFAULT_EFFECT.toFixed(1)}
              </button>
            )}
          </span>
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ how it works
const STEPS: Array<{ icon: string; title: string; detail: string; badges?: string[]; link?: { to: string; label: string } }> = [
  { icon: 'joystick', title: 'Trainee control input', detail: 'Joystick samples streamed from a practice session.', link: { to: '/training/practice', label: 'Open a live session' } },
  { icon: 'model_training', title: 'Expert Motion Model', detail: 'Trained on SIMULATED, safety-filtered expert operators; compares every cycle to the expert band.', badges: ['ML', 'SIMULATED'] },
  { icon: 'tips_and_updates', title: 'Phase-level coaching tips', detail: 'Dig · swing loaded · dump · swing empty — one clear fix per phase.' },
  { icon: 'event_repeat', title: 'Next practice session', detail: 'The trainee practises again with the tips in hand.' },
  { icon: 'trending_up', title: 'Improvement measured', detail: 'Expert-likeness score trend across sessions.', link: { to: '/training/practice/progress', label: 'See progress' } },
];

function HowItWorks() {
  return (
    <Panel>
      <PanelHeader icon="account_tree" title="How the ML coaching loop works" sub="The coached arm above repeats this loop after every session; the control arm skips steps 2–3." />
      <ol className="flex flex-col items-stretch gap-2 p-4 xl:flex-row">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 flex-col items-stretch gap-2 xl:flex-row">
            <div className={cx('flex flex-1 flex-col gap-2 border bg-surface-container-low p-4', s.badges ? 'border-prov-ml' : 'border-outline')}>
              <div className="flex items-center justify-between gap-2">
                <span className="tnum font-display text-label-sm uppercase text-on-surface-muted">Step {String(i + 1).padStart(2, '0')}</span>
                <Icon name={s.icon} size={26} className={s.badges ? 'text-prov-ml' : 'text-on-surface'} />
              </div>
              <div className="font-display text-label-lg uppercase text-on-surface">{s.title}</div>
              <p className="text-body-sm text-on-surface-variant">{s.detail}</p>
              {s.badges && (
                <div className="flex gap-1">
                  {s.badges.map((b) => (
                    <ProvenanceBadge key={b} kind={b} />
                  ))}
                </div>
              )}
              {s.link && (
                <Link to={s.link.to} className="mt-auto inline-flex items-center gap-1 pt-1 font-display text-label-sm uppercase text-notice-dark hover:underline">
                  {s.link.label}
                  <Icon name="arrow_forward" size={16} />
                </Link>
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex items-center justify-center text-on-surface-muted" aria-hidden>
                <Icon name="arrow_forward" size={22} className="rotate-90 xl:rotate-0" />
              </div>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

// ------------------------------------------------------------------ KPI row
function GainsRow({ d, g }: { d: CohortSim; g: Gains }) {
  const n = d.arms.coached.curve?.length || d.sessions || SESSIONS;
  const perArm = d.arms.coached.sessions_to_proficient?.length || d.n;
  const sessDiff = g.cMed !== null && g.kMed !== null ? g.cMed - g.kMed : null;
  const shareDiffPts = (g.shC - g.shK) * 100;
  const extraTrainees = Math.round(g.shC * perArm) - Math.round(g.shK * perArm);
  const outDiff = typeof g.outC === 'number' && typeof g.outK === 'number' ? g.outC - g.outK : null;
  const fsDiffPts = typeof g.fsC === 'number' && typeof g.fsK === 'number' ? (g.fsC - g.fsK) * 100 : null;
  const chipTitle = 'Gain in the SIMULATED cohort — assumption to validate in a pilot';
  const tone = (good: boolean | null) => (good === null ? 'neutral' : good ? 'green' : 'neutral');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        label="Reaches proficiency in"
        icon="school"
        tone={tone(sessDiff === null ? null : sessDiff < 0)}
        value={g.cMed ?? '—'}
        unit={g.cMed !== null ? (g.cMed === 1 ? 'session' : 'sessions') : undefined}
        provenance={['SIMULATED']}
        sub={
          <div className="flex flex-wrap items-center gap-2">
            <span>vs {g.kMed !== null ? `${g.kMed} without feedback` : `not reached in ${n} without feedback`} (median)</span>
            {sessDiff !== null && sessDiff !== 0 && (
              <GainChip size="sm" to={null} title={chipTitle}>
                {signed(sessDiff)} sessions
              </GainChip>
            )}
          </div>
        }
      />
      <KpiTile
        label={`Output at session ${n}`}
        icon="speed"
        tone={tone(g.outPct === null ? null : g.outPct > 0)}
        value={g.outPct !== null ? signed(g.outPct) : '—'}
        unit={g.outPct !== null ? '%' : undefined}
        provenance={['SIMULATED']}
        sub={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum">
              {typeof g.outC === 'number' ? g.outC.toFixed(0) : '—'} vs {typeof g.outK === 'number' ? g.outK.toFixed(0) : '—'} m³/h, coached vs control
            </span>
            {outDiff !== null && Math.round(outDiff) !== 0 && (
              <GainChip size="sm" to={null} title={chipTitle}>
                {signed(outDiff)} m³/h
              </GainChip>
            )}
          </div>
        }
      />
      <KpiTile
        label="Fast swings near truck"
        icon="health_and_safety"
        tone={tone(g.fsPct === null ? null : g.fsPct < 0)}
        value={g.fsPct !== null ? signed(g.fsPct) : '—'}
        unit={g.fsPct !== null ? '%' : undefined}
        provenance={['SIMULATED']}
        sub={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum">
              {pct(g.fsC)} vs {pct(g.fsK)} of cycles at session {n}
            </span>
            {fsDiffPts !== null && Math.abs(fsDiffPts) >= 0.5 && (
              <GainChip size="sm" to={null} title={chipTitle}>
                {signed(fsDiffPts, 1)} pts
              </GainChip>
            )}
          </div>
        }
      />
      <KpiTile
        label="Proficient by session 8"
        icon="groups"
        tone={tone(shareDiffPts > 0)}
        value={(g.shC * 100).toFixed(0)}
        unit="%"
        bar={g.shC * 100}
        provenance={['SIMULATED']}
        sub={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum">vs {pct(g.shK)} without feedback</span>
            {extraTrainees !== 0 && (
              <GainChip size="sm" to={null} title={chipTitle}>
                {signed(extraTrainees)} of {perArm} trainees
              </GainChip>
            )}
          </div>
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function TrainingEffectiveness() {
  const navigate = useNavigate();
  const [effect, setEffect] = useState(DEFAULT_EFFECT);
  const [effectQ, setEffectQ] = useState(DEFAULT_EFFECT);
  const [n, setN] = useState<CohortSize>('20');

  useEffect(() => {
    const id = setTimeout(() => setEffectQ(effect), 250);
    return () => clearTimeout(id);
  }, [effect]);

  const res = useResource(() => practice.cohortSim(Number(n), SESSIONS, effectQ), [n, effectQ]);
  const d = res.data;
  const g = useMemo(() => (d ? gains(d) : null), [d]);
  const caveat = d?.caveat || DEFAULT_CAVEAT;
  const sooner = g && g.cMed !== null && g.kMed !== null ? g.kMed - g.cMed : null;

  return (
    <div className="space-y-6">
      <TrainingTabs />
      <PageTitle
        kicker="Practice Analyser · Expert Motion Model"
        title="Training effectiveness"
        sub="What phase-level ML coaching does to a trainee's learning curve: a simulated cohort coached by the Expert Motion Model vs the same practice without feedback."
        right={
          <>
            <ProvenanceBadge kind="ML" />
            <ProvenanceBadge kind="SIMULATED" />
            <DataSourceChip endpoints={['/practice/cohort-sim']} modelBacked />
          </>
        }
      />

      <div className="stripes-sim flex flex-wrap items-center gap-3 border-2 border-prov-sim px-4 py-3" role="note">
        <Icon name="science" size={24} className="text-prov-sim-text" />
        <span className="flex-1 font-display text-label-lg uppercase text-on-surface">{caveat}</span>
        {d && (
          <span className="tnum bg-surface-container-lowest/70 px-2 py-1 font-display text-label-sm uppercase text-prov-sim-text">
            {d.n} simulated trainees per arm · {d.sessions} sessions
          </span>
        )}
      </div>

      {!d || !g ? (
        res.error && !res.loading ? (
          <div className="space-y-3">
            <ErrorNote error={res.error} />
            <Button icon="refresh" onClick={res.reload}>
              Retry simulation
            </Button>
          </div>
        ) : (
          <Panel>
            <Loading label="Simulating cohort" />
          </Panel>
        )
      ) : (
        <>
          <GainsRow d={d} g={g} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <Panel className="xl:col-span-8">
              <PanelHeader
                icon="show_chart"
                title={sooner !== null && sooner > 0 ? `Coached trainees reach proficient ${sooner} session${sooner === 1 ? '' : 's'} sooner` : 'Learning curve — coached vs control'}
                sub="Median expert-likeness score per session; dots mark each arm's median session to proficient."
                right={<ProvenanceBadge kind="SIMULATED" />}
              />
              <SeriesLegend kind="curve" />
              <LearningCurve d={d} g={g} />
            </Panel>
            <div className="xl:col-span-4">
              <Assumptions effect={effect} setEffect={setEffect} n={n} setN={setN} d={d} busy={res.loading || effect !== effectQ} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <Panel className="xl:col-span-7">
              <PanelHeader
                icon="bar_chart"
                title="Sessions to proficiency"
                sub={`Simulated trainees per arm by the first session they hold ≥ ${d.bands?.proficient ?? 65}.`}
                right={<ProvenanceBadge kind="SIMULATED" />}
              />
              <SeriesLegend kind="bars" />
              <ProficiencyHistogram d={d} g={g} />
            </Panel>
            <Panel className="xl:col-span-5">
              <PanelHeader icon="table_chart" title={`Session 1 → session ${d.arms.coached.curve?.length || d.sessions}`} sub="Same numbers as the charts, as a table." right={<ProvenanceBadge kind="SIMULATED" />} />
              <FirstLastTable d={d} g={g} />
            </Panel>
          </div>
        </>
      )}

      <HowItWorks />

      <Panel accent="yellow" className="flex flex-wrap items-center justify-between gap-4 py-5 pl-6 pr-5">
        <div>
          <div className="font-display text-headline-sm uppercase text-on-surface">See the coaching on one trainee</div>
          <p className="text-body-sm text-on-surface-variant">Run a demo trainee through the Practice Analyser and read the phase-level report the coached arm receives.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon="play_arrow" onClick={() => navigate('/training/practice')}>
            Run a demo trainee
          </Button>
          <Button variant="secondary" icon="description" onClick={() => navigate('/training/practice')}>
            See a report
          </Button>
          <Button variant="ghost" iconRight="arrow_forward" onClick={() => navigate('/value')}>
            Business value
          </Button>
        </div>
      </Panel>

      <p className="flex items-start gap-2 border-t border-outline pt-4 text-footnote text-on-surface-muted">
        <Icon name="info" size={16} className="mt-px" />
        <span>
          The cohort is simulated from a learning-curve model (start score, ceiling and per-session learning rate vary per trainee, plus session noise). The control arm is the same practice without
          feedback; the coached arm&apos;s learning rate is multiplied by the effect assumption above. Output and fast-swing figures are derived from the simulated score, not measured on machines. The real
          effect is to be validated in a pilot with an instructor.
        </span>
      </p>
    </div>
  );
}
