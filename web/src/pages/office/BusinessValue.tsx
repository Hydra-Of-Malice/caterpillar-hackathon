/**
 * /value — Business Value (the ONLY page where dollar figures appear).
 * Everything here is an ESTIMATE from an editable lever model: customer inputs, published
 * reference prices (example values), team assumptions and SIMULATED prototype metrics.
 * Layout: inputs → headline numbers → value by lever → sensitivity; assumptions and the
 * feature → lever map sit in tabs below.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { value, VALUE_INPUT_KEYS } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { fmtNum, titleCase } from '../../lib/format';
import type { ValueAssumption, ValueEstimate, ValueHeadline, ValueScenario, ValueSensitivityRow } from '../../lib/types';
import { GainChip } from '../../components/GainChip';
import { SourceNote } from '../../components/ProvenanceBadge';
import { Button, EmptyState, ErrorNote, Icon, Loading, PageTitle, Panel, Segmented, cx } from '../../components/ui';

// ------------------------------------------------------------------ formatting
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function usd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return USD.format(Math.round(v));
}

/** Compact dollars: $148k, $1.48M, $940. */
function usdK(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

const sgn = (v: number, digits = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), digits)}`;
const digitsFor = (v: number) => (Number.isInteger(v) ? 0 : 1);

/** Assumption value in its unit: share → %, $/h → $35/h, weeks → 4 weeks. */
function fmtInput(v: number | string | undefined, unit: string | undefined): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'string') return v;
  const u = unit ?? '';
  if (u === 'share') return `${fmtNum(v * 100, v * 100 < 10 && !Number.isInteger(v * 100) ? 1 : 0)}%`;
  if (u === '$') return usd(v);
  if (u.startsWith('$')) return `$${fmtNum(v, Math.abs(v) < 10 && !Number.isInteger(v) ? 2 : 0)}${u.slice(1)}`;
  return `${fmtNum(v, Number.isInteger(v) ? 0 : 2)} ${u}`.trim();
}

/** Range without repeating long units: "1,200 – 2,000", "10% – 24%", "$0.90 – $1.20/L". */
function fmtRange(a: ValueAssumption): string {
  if (a.low === undefined && a.high === undefined) return '—';
  const u = a.unit ?? '';
  const short = u === 'share' || u.startsWith('$');
  const f = (v: number | undefined) => (v === undefined ? '—' : short ? fmtInput(v, u) : fmtNum(v, Number.isInteger(v) ? 0 : 2));
  return `${f(a.low)} – ${f(a.high)}`;
}

function fmtGain(h: ValueHeadline): string {
  const pct = h.unit === '%';
  const u = pct ? '%' : ` ${h.unit}`;
  const main = `${sgn(h.value, digitsFor(h.value))}${u}`;
  if (h.low === undefined || h.high === undefined) return main;
  const neg = h.low < 0 || h.high < 0;
  const range = neg ? `${sgn(h.low, digitsFor(h.low))} to ${sgn(h.high, digitsFor(h.high))}${pct ? '%' : ''}` : `${fmtNum(h.low, digitsFor(h.low))}–${fmtNum(h.high, digitsFor(h.high))}${pct ? '%' : ''}`;
  return `${main} (${range})`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

// ------------------------------------------------------------------ lever model metadata
const SCENARIOS: ValueScenario[] = ['low', 'base', 'high'];
const LEVER_COLOR: Record<string, string> = {
  productivity: '#0066FF',
  idle_fuel: '#1AC69E',
  training: '#FB5A00',
  safety: '#6852BE',
  wear: '#F3C206',
  planning: '#4D94FF',
};
const PALETTE = ['#0066FF', '#1AC69E', '#FB5A00', '#6852BE', '#F3C206', '#4D94FF', '#909090'];
const colorFor = (lever: string, i: number) => LEVER_COLOR[lever] ?? PALETTE[i % PALETTE.length];

const GROUP_TITLE: Record<string, string> = {
  all: 'Customer inputs (all levers)',
  productivity: 'Productivity (training & practice)',
  idle_fuel: 'Idle fuel savings',
  training: 'Training cost / time to proficiency',
  safety: 'Safety (expected value only)',
  wear: 'Wear & maintenance',
  planning: 'Planning (task-time estimates)',
  cost: 'Cost of the solution',
};
const GROUP_ORDER = ['all', 'productivity', 'idle_fuel', 'training', 'safety', 'wear', 'planning', 'cost'];

const KIND_WORD: Record<NonNullable<ValueAssumption['kind']>, string> = {
  published: 'Published reference',
  simulated: 'Simulated prototype metric',
  customer: 'Customer input',
  assumption: 'Team assumption',
};

const INPUT_KEYS = ['hours_per_year', 'fuel_usd_per_l', 'operator_wage_usd_per_h', 'machine_usd_per_h'] as const;
type InputKey = (typeof INPUT_KEYS)[number];
const INPUT_META: Record<InputKey, { label: string; fallback: number; step: number }> = {
  hours_per_year: { label: 'Hours / machine / yr', fallback: 2000, step: 100 },
  fuel_usd_per_l: { label: 'Diesel ($/L)', fallback: 1.0, step: 0.05 },
  operator_wage_usd_per_h: { label: 'Operator cost ($/h)', fallback: 35, step: 1 },
  machine_usd_per_h: { label: 'Machine cost ($/h)', fallback: 90, step: 5 },
};

const stepFor = (a: ValueAssumption) => (a.unit === 'share' ? 0.01 : Math.abs(a.value) < 5 ? 0.1 : Math.abs(a.value) < 200 ? 1 : 100);

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

// ------------------------------------------------------------------ small pieces
function NumInput({ value: v, onChange, step, min = 0, ariaLabel, edited, className, id }: { value: number; onChange: (n: number) => void; step?: number; min?: number; ariaLabel: string; edited?: boolean; className?: string; id?: string }) {
  const [text, setText] = useState(String(v));
  useEffect(() => setText(String(v)), [v]);
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step ?? 'any'}
      min={min}
      value={text}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n >= min) onChange(n);
      }}
      className={cx(
        'h-10 rounded border bg-surface-container-lowest px-3 text-right text-body-md text-on-surface tnum focus:border-cat focus:outline-none',
        edited ? 'border-series-blue-light' : 'border-outline-variant',
        className ?? 'w-28',
      )}
    />
  );
}

function SectionHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-headline-sm text-on-surface">{title}</h2>
        {sub && <p className="mt-1 text-body-sm text-on-surface-muted">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
    </div>
  );
}

function Stat({ label, value: v, unit, caption }: { label: ReactNode; value: ReactNode; unit?: string; caption?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-body-sm text-on-surface-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-headline-lg text-on-surface tnum">{v}</span>
        {unit && <span className="text-body-md text-on-surface-muted">{unit}</span>}
      </div>
      {caption && <div className="mt-1 text-body-sm text-on-surface-muted tnum">{caption}</div>}
    </div>
  );
}

function ResetBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex h-10 w-8 items-center justify-center text-on-surface-muted hover:text-on-surface" title="Reset to default" aria-label={`Reset ${label}`}>
      <Icon name="undo" size={18} />
    </button>
  );
}

function Tabs<T extends string>({ value: v, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div role="tablist" className="flex gap-8 border-b border-outline px-6">
      {options.map((o) => {
        const on = o.value === v;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx('-mb-px border-b-2 py-4 font-display text-body-md font-bold transition-colors duration-quick', on ? 'border-cat text-on-surface' : 'border-transparent text-on-surface-muted hover:text-on-surface')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ tornado (sensitivity)
function niceTicks(a: number, b: number, n = 5): number[] {
  const raw = (b - a) / n;
  if (!(raw > 0)) return [a];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(v);
  return out;
}

const LOW_COLOR = '#FB5A00';
const HIGH_COLOR = '#0066FF';

function Tornado({ rows, base, units }: { rows: ValueSensitivityRow[]; base: number; units: Record<string, string> }) {
  const sorted = [...rows].sort((a, b) => Math.abs(b.high_usd - b.low_usd) - Math.abs(a.high_usd - a.low_usd));
  const vals = sorted.flatMap((r) => [r.low_usd, r.high_usd]).concat(base);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || Math.max(1, Math.abs(base) * 0.1);
  const lo = min - span * 0.22;
  const hi = max + span * 0.22;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks = niceTicks(lo, hi, 5);

  const seg = (v: number, color: string, input: string) => {
    const a = Math.min(v, base);
    const b = Math.max(v, base);
    const leftSide = v < base;
    return (
      <>
        <div className="absolute bottom-2 top-2" style={{ left: `${pct(a)}%`, width: `${Math.max(0.4, pct(b) - pct(a))}%`, background: color }} />
        <span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-footnote text-on-surface-muted tnum"
          style={leftSide ? { right: `calc(${100 - pct(a)}% + 6px)` } : { left: `calc(${pct(b)}% + 6px)` }}
        >
          {input}
        </span>
      </>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-[minmax(160px,260px)_1fr_80px] items-center">
        <span className="pb-2 text-body-sm text-on-surface-muted">Assumption</span>
        <span className="pb-2 text-center text-body-sm text-on-surface-muted">Value per machine / yr, input low ↔ high</span>
        <span className="pb-2 text-right text-body-sm text-on-surface-muted">Swing</span>
        {sorted.map((r) => {
          const u = units[r.key];
          const lowIn = fmtInput(r.low_input, u);
          const highIn = fmtInput(r.high_input, u);
          return (
            <div key={r.key} className="contents" title={`${r.label}\nLow input ${lowIn} → ${usd(r.low_usd)}\nHigh input ${highIn} → ${usd(r.high_usd)}`}>
              <div className="min-w-0 border-t border-outline py-2 pr-4">
                <div className="truncate text-body-sm text-on-surface">{r.label}</div>
              </div>
              <div className="relative h-11 border-t border-outline">
                {ticks.map((t) => (
                  <span key={t} className="absolute bottom-0 top-0 w-px bg-surface-container-high" style={{ left: `${pct(t)}%` }} />
                ))}
                {seg(r.low_usd, LOW_COLOR, lowIn)}
                {seg(r.high_usd, HIGH_COLOR, highIn)}
                <span className="absolute bottom-0 top-0 w-0.5 bg-on-surface" style={{ left: `${pct(base)}%` }} />
              </div>
              <div className="border-t border-outline py-2 text-right text-body-sm text-on-surface tnum">{usdK(Math.abs(r.high_usd - r.low_usd))}</div>
            </div>
          );
        })}
        {/* axis */}
        <div />
        <div className="relative h-8 border-t border-outline">
          {ticks.map((t) => (
            <span key={t} className="absolute top-1.5 -translate-x-1/2 text-footnote text-on-surface-muted tnum" style={{ left: `${pct(t)}%` }}>
              {usdK(t)}
            </span>
          ))}
        </div>
        <div />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-6 text-body-sm text-on-surface-variant">
        <span className="flex items-center gap-2">
          <span className="h-3 w-5" style={{ background: LOW_COLOR }} /> Input at low end
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-5" style={{ background: HIGH_COLOR }} /> Input at high end
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-0.5 bg-on-surface" /> Current {usd(base)} per machine / yr
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page
type DetailTab = 'assumptions' | 'levers';

export default function BusinessValue() {
  const [fleet, setFleet] = useState(10);
  const [scenario, setScenario] = useState<ValueScenario>('base');
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [chartBasis, setChartBasis] = useState<'machine' | 'fleet'>('machine');
  const [tab, setTab] = useState<DetailTab>('assumptions');

  const assumptions = useResource(() => value.assumptions(), []);
  const levers = useResource(() => value.levers(), []);
  const pitch = useResource(() => value.pitch(), []);

  const amap = useMemo(() => {
    const m: Record<string, ValueAssumption> = {};
    for (const a of assumptions.data ?? []) m[a.key] = a;
    return m;
  }, [assumptions.data]);

  /** The top-row inputs edit the same key as the assumptions table, so both stay in sync. */
  const inputKey = (k: InputKey): string => (amap[k] ? k : amap[VALUE_INPUT_KEYS[k]] ? VALUE_INPUT_KEYS[k] : k);
  const inputVal = (k: InputKey) => edits[inputKey(k)] ?? edits[k] ?? amap[inputKey(k)]?.value ?? INPUT_META[k].fallback;

  const overrides = useMemo(() => {
    const o: Record<string, number> = {};
    for (const k of INPUT_KEYS) o[k] = edits[k] ?? (amap[k] ?? amap[VALUE_INPUT_KEYS[k]])?.value ?? INPUT_META[k].fallback;
    for (const [k, v] of Object.entries(edits)) if (Number.isFinite(v)) o[k] = v;
    return o;
  }, [edits, amap]);

  const fleetSize = Math.max(1, Math.round(fleet || 1));
  const reqKey = useDebounced(JSON.stringify({ fleet_size: fleetSize, overrides, scenario }), 300);
  const allKey = useMemo(() => {
    const r = JSON.parse(reqKey) as { fleet_size: number; overrides: Record<string, number> };
    return JSON.stringify({ fleet_size: r.fleet_size, overrides: r.overrides });
  }, [reqKey]);

  const est = useResource(() => value.estimate(JSON.parse(reqKey)), [reqKey]);
  const all = useResource(() => {
    const r = JSON.parse(allKey) as { fleet_size: number; overrides: Record<string, number> };
    return Promise.all(SCENARIOS.map((s) => value.estimate({ ...r, scenario: s })));
  }, [allKey]);

  const cur: ValueEstimate | undefined = est.data ?? all.data?.[SCENARIOS.indexOf(scenario)];
  const byScenario = all.data;
  const range = (f: (e: ValueEstimate) => number | null | undefined) => {
    if (!byScenario) return null;
    const xs = byScenario.map(f).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (!xs.length) return null;
    return [Math.min(...xs), Math.max(...xs)] as const;
  };

  const setEdit = (k: string, v: number) => setEdits((e) => ({ ...e, [k]: v }));
  const resetEdit = (k: string) =>
    setEdits((e) => {
      const n = { ...e };
      delete n[k];
      return n;
    });
  const editedCount = Object.entries(edits).filter(([k, v]) => amap[k] === undefined || amap[k].value !== v).length;

  // stacked bar data
  const leverKeys = useMemo(() => {
    const seen: string[] = [];
    for (const e of byScenario ?? (cur ? [cur] : [])) for (const l of e.levers) if (!seen.includes(l.lever)) seen.push(l.lever);
    return seen;
  }, [byScenario, cur]);
  const leverLabel = (k: string) => cur?.levers.find((l) => l.lever === k)?.label ?? byScenario?.[1]?.levers.find((l) => l.lever === k)?.label ?? GROUP_TITLE[k] ?? titleCase(k);
  const mult = chartBasis === 'fleet' ? fleetSize : 1;
  const barRows = (byScenario ?? []).map((e, i) => {
    const row: Record<string, number | string> = { name: titleCase(SCENARIOS[i]), scenario: SCENARIOS[i], total: e.annual_value_usd_per_machine * mult };
    for (const l of e.levers) row[l.lever] = l.annual_usd_per_machine * mult;
    return row;
  });

  const unitMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of assumptions.data ?? []) m[a.key] = a.unit;
    return m;
  }, [assumptions.data]);

  // assumptions grouped by lever
  const groups = useMemo(() => {
    const g = new Map<string, ValueAssumption[]>();
    for (const a of assumptions.data ?? []) {
      const k = a.lever ?? 'other';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(a);
    }
    return Array.from(g.entries()).sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a[0]);
      const ib = GROUP_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [assumptions.data]);

  const gains = (pitch.data?.headlines ?? []).filter((h) => (h.kind ?? 'gain') === 'gain');

  const valueRange = range((e) => e.annual_value_usd_per_machine);
  const fleetRange = range((e) => e.annual_value_usd_fleet);
  const paybackRange = range((e) => e.payback_months);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PageTitle title="Business value" sub="What CAT Sentinel could be worth per machine and per fleet." />
        <p className="flex items-center gap-2 text-body-sm text-on-surface-muted">
          <Icon name="info" size={18} />
          Estimate — assumptions are editable; prototype metrics are simulated; ROI to be proven in a pilot.
        </p>
      </div>

      {/* ---------------------------------------------------- inputs (compact row) */}
      <Panel className="p-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          <div>
            <div className="mb-2 text-body-sm text-on-surface-variant">Scenario</div>
            <Segmented<ValueScenario>
              value={scenario}
              onChange={setScenario}
              options={[
                { value: 'low', label: 'Low', tone: 'neutral' },
                { value: 'base', label: 'Base', tone: 'neutral' },
                { value: 'high', label: 'High', tone: 'neutral' },
              ]}
            />
          </div>
          <div>
            <label htmlFor="fleet" className="mb-2 block text-body-sm text-on-surface-variant">
              Fleet size
            </label>
            <input
              id="fleet"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={fleet}
              onChange={(e) => setFleet(Math.min(1000, Math.max(0, parseInt(e.target.value || '0', 10) || 0)))}
              className="h-10 w-24 rounded border border-outline-variant bg-surface-container-lowest px-3 text-right text-body-md text-on-surface tnum focus:border-cat focus:outline-none"
            />
          </div>
          {INPUT_KEYS.map((k) => {
            const m = INPUT_META[k];
            const key = inputKey(k);
            const a = amap[key];
            const cur = edits[key] ?? edits[k];
            const edited = cur !== undefined && (!a || cur !== a.value);
            const tip = a ? `${a.label}${a.low !== undefined || a.high !== undefined ? ` · range ${fmtInput(a.low, a.unit)} – ${fmtInput(a.high, a.unit)}` : ''}` : m.label;
            return (
              <div key={k} title={tip}>
                <label htmlFor={`in-${k}`} className="mb-2 block text-body-sm text-on-surface-variant">
                  {m.label}
                </label>
                <div className="flex items-center">
                  <NumInput
                    id={`in-${k}`}
                    value={inputVal(k)}
                    onChange={(n) =>
                      setEdits((e) => {
                        const next = { ...e, [key]: n };
                        if (key !== k) delete next[k];
                        return next;
                      })
                    }
                    step={m.step}
                    ariaLabel={m.label}
                    edited={edited}
                  />
                  {edited && (
                    <ResetBtn
                      label={m.label}
                      onClick={() => {
                        resetEdit(key);
                        if (key !== k) resetEdit(k);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-3">
            {editedCount > 0 && <span className="text-body-sm text-on-surface-muted">{editedCount} changed</span>}
            <Button size="sm" variant="ghost" icon="restart_alt" onClick={() => setEdits({})} disabled={!Object.keys(edits).length}>
              Reset all
            </Button>
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------- headline numbers + gains strip */}
      <Panel className="p-6">
        {est.error && (
          <div className="mb-6">
            <ErrorNote error={est.error} />
          </div>
        )}
        {!cur ? (
          <Loading label="Calculating estimate" />
        ) : (
          <>
            <div className="grid gap-8 md:grid-cols-3">
              <Stat
                label="Annual value per machine"
                value={usd(cur.annual_value_usd_per_machine)}
                caption={valueRange ? `Range ${usdK(valueRange[0])} – ${usdK(valueRange[1])} · before solution cost` : 'Before solution cost'}
              />
              <Stat label={`Annual value, fleet of ${cur.fleet_size}`} value={usdK(cur.annual_value_usd_fleet)} caption={fleetRange ? `Range ${usdK(fleetRange[0])} – ${usdK(fleetRange[1])}` : usd(cur.annual_value_usd_fleet)} />
              <Stat
                label="Payback"
                value={cur.payback_months === null ? 'Not reached' : fmtNum(cur.payback_months, 1)}
                unit={cur.payback_months === null ? undefined : 'months'}
                caption={cur.payback_months === null ? 'Value does not cover the annual solution cost' : paybackRange ? `Range ${fmtNum(paybackRange[0], 1)} – ${fmtNum(paybackRange[1], 1)} months` : undefined}
              />
            </div>
            <p className="mt-6 text-body-sm text-on-surface-muted tnum">
              Net {usd(cur.annual_value_usd_per_machine - (cur.annual_cost_usd_per_machine ?? 0))} per machine / yr after the {usd(cur.annual_cost_usd_per_machine)} annual solution cost
              {cur.one_off_cost_usd_per_machine !== undefined ? ` (plus ${usd(cur.one_off_cost_usd_per_machine)} one-off, placeholder price)` : ' (placeholder price)'}.
              {est.loading && <span className="ml-2">Recalculating…</span>}
            </p>
          </>
        )}

        {gains.length > 0 && (
          <div className="mt-6 border-t border-outline pt-6">
            <div className="mb-3 text-body-sm text-on-surface-muted">Gains behind the money — operational units first, dollars are derived from these</div>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              {gains.map((h) => (
                <div key={h.key} title={h.note} className="min-w-0">
                  <GainChip to={null}>{fmtGain(h)}</GainChip>
                  <div className="mt-0.5 text-body-sm text-on-surface-variant">{h.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <SourceNote kinds={['ESTIMATE', 'SIMULATED']} />
      </Panel>

      {/* ---------------------------------------------------- stacked bar by lever */}
      <Panel className="p-6">
        <SectionHead
          title="Value by lever"
          sub={`USD per ${chartBasis === 'fleet' ? `fleet of ${fleetSize}` : 'machine'} per year, by scenario · selected scenario highlighted`}
          right={
            <Segmented<'machine' | 'fleet'>
              value={chartBasis}
              onChange={setChartBasis}
              options={[
                { value: 'machine', label: 'Per machine', tone: 'neutral' },
                { value: 'fleet', label: 'Per fleet', tone: 'neutral' },
              ]}
            />
          }
        />
        {!byScenario ? (
          all.error ? <ErrorNote error={all.error} /> : <Loading label="Calculating scenarios" />
        ) : (
          <>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barRows} layout="vertical" margin={{ top: 4, right: 24, bottom: 22, left: 8 }} barCategoryGap={16}>
                  <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
                    tickFormatter={(v: number) => usdK(v)}
                    label={{ value: `USD per ${chartBasis === 'fleet' ? 'fleet' : 'machine'} per year`, position: 'insideBottom', offset: -14, fill: 'var(--chart-tick)', fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--chart-axis)"
                    width={96}
                    tick={(p: { x: number; y: number; payload: { value: string; index: number } }) => {
                      const row = barRows.find((r) => r.name === p.payload.value);
                      const on = row?.scenario === scenario;
                      return (
                        <g transform={`translate(${p.x},${p.y})`}>
                          <text x={-8} y={-3} textAnchor="end" fill={on ? 'var(--svg-text)' : 'var(--chart-tick)'} fontSize={13} fontWeight={on ? 700 : 400} fontFamily="Roboto Condensed">
                            {p.payload.value}
                          </text>
                          <text x={-8} y={12} textAnchor="end" fill={on ? 'var(--svg-text)' : 'var(--chart-tick)'} fontSize={12} fontFamily="Roboto Condensed">
                            {usdK(Number(row?.total ?? 0))}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--chart-grid)', fillOpacity: 0.6 }}
                    contentStyle={{ background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)' }}
                    labelStyle={{ color: 'var(--svg-text)', fontFamily: 'Roboto Condensed' }}
                    itemStyle={{ color: 'var(--svg-text)' }}
                    formatter={(v, name) => [usd(Number(v)), String(name)]}
                  />
                  {leverKeys.map((k, i) => (
                    <Bar key={k} dataKey={k} name={leverLabel(k)} stackId="v" fill={colorFor(k, i)} isAnimationActive={false}>
                      {barRows.map((r) => (
                        <Cell key={String(r.scenario)} fillOpacity={r.scenario === scenario ? 1 : 0.35} />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* legend: $ and share per lever for the selected scenario (hover for the formula) */}
            <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {leverKeys.map((k, i) => {
                const l = cur?.levers.find((x) => x.lever === k);
                const share = cur && cur.annual_value_usd_per_machine ? ((l?.annual_usd_per_machine ?? 0) / cur.annual_value_usd_per_machine) * 100 : 0;
                return (
                  <li key={k} className="flex items-center gap-2 text-body-sm" title={l?.formula}>
                    <span className="h-3 w-3 shrink-0" style={{ background: colorFor(k, i) }} />
                    <span className="min-w-0 flex-1 truncate text-on-surface-variant">{leverLabel(k)}</span>
                    <span className="text-on-surface tnum">{usd((l?.annual_usd_per_machine ?? 0) * mult)}</span>
                    <span className="w-10 text-right text-on-surface-muted tnum">{fmtNum(share, 0)}%</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-body-sm text-on-surface-muted">Safety is an expected value (baseline expected incident cost × assumed reduction), not prevented accidents.</p>
          </>
        )}
        <SourceNote kinds={['ESTIMATE']} />
      </Panel>

      {/* ---------------------------------------------------- tornado */}
      <Panel className="p-6">
        <SectionHead title="What moves the number" sub="Each bar moves one assumption from the low to the high end of its range; everything else stays at current values." />
        {!cur ? (
          <Loading label="Calculating sensitivity" />
        ) : cur.sensitivity?.length ? (
          <Tornado rows={cur.sensitivity} base={cur.annual_value_usd_per_machine} units={unitMap} />
        ) : (
          <EmptyState icon="swap_horiz" title="No sensitivity data">
            The value service did not return a sensitivity table for this estimate.
          </EmptyState>
        )}
        <SourceNote kinds={['ESTIMATE']} />
      </Panel>

      {/* ---------------------------------------------------- details: assumptions + lever map */}
      <Panel>
        <Tabs<DetailTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'assumptions', label: 'Assumptions & sources' },
            { value: 'levers', label: 'Feature → lever → KPI' },
          ]}
        />
        {tab === 'assumptions' ? (
          <div className="p-6">
            <p className="mb-6 text-body-sm text-on-surface-muted">
              Edit any value — it overrides the estimate above. Low / High scenarios move only the effect-size assumptions; customer inputs and costs stay fixed.
            </p>
            {assumptions.loading && !assumptions.data ? (
              <Loading label="Loading assumptions" />
            ) : !groups.length ? (
              <EmptyState icon="fact_check" title="No assumptions returned" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-dense w-full min-w-[760px]">
                  <thead>
                    <tr>
                      <th className="w-[42%]">Assumption</th>
                      <th className="text-right">Value</th>
                      <th>Range</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([lever, rows]) => (
                      <GroupRows key={lever} lever={lever} rows={rows} edits={edits} onEdit={setEdit} onReset={resetEdit} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6">
            <p className="mb-6 text-body-sm text-on-surface-muted">How each lever would be measured in a pilot, and where to see the feature.</p>
            {levers.loading && !levers.data ? (
              <Loading label="Loading lever map" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-dense w-full min-w-[760px]">
                  <thead>
                    <tr>
                      <th className="w-[28%]">Feature</th>
                      <th className="w-[20%]">Lever</th>
                      <th>KPI and how it is measured</th>
                      <th className="text-right">See it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(levers.data ?? []).map((l) => (
                      <tr key={`${l.feature}-${l.lever}`} className="align-top">
                        <td className="!align-top text-on-surface">{l.feature}</td>
                        <td className="!align-top text-on-surface-variant">{l.lever}</td>
                        <td className="!align-top">
                          <div className="text-on-surface-variant">{l.kpi}</div>
                          {l.how_measured && <div className="mt-0.5 text-on-surface-muted">{l.how_measured}</div>}
                        </td>
                        <td className="!align-top whitespace-nowrap text-right">
                          {l.route ? (
                            <Link to={l.route} className="inline-flex items-center gap-1 text-notice-dark hover:underline">
                              Open <Icon name="arrow_forward" size={16} />
                            </Link>
                          ) : (
                            <span className="text-on-surface-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <SourceNote kinds={Array.from(new Set((levers.data ?? []).flatMap((l) => l.provenance ?? [])))} />
          </div>
        )}
      </Panel>
    </div>
  );
}

function GroupRows({ lever, rows, edits, onEdit, onReset }: { lever: string; rows: ValueAssumption[]; edits: Record<string, number>; onEdit: (k: string, v: number) => void; onReset: (k: string) => void }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="!pb-2 !pt-6">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3" style={{ background: LEVER_COLOR[lever] ?? '#909090' }} />
            <span className="font-display text-body-md font-bold text-on-surface">{GROUP_TITLE[lever] ?? titleCase(lever)}</span>
          </span>
        </td>
      </tr>
      {rows.map((a) => {
        const v = edits[a.key] ?? a.value;
        const edited = edits[a.key] !== undefined && edits[a.key] !== a.value;
        const src = (a.source ?? '').replace(/^[A-Z_]+(?: [A-Z_]+)* — /, '').trim();
        const showSrc = src && !['assumption', 'source'].includes(src.toLowerCase());
        return (
          <tr key={a.key} className={cx('align-top', edited && 'bg-series-blue/5')}>
            <td className="!align-top">
              <div className="text-on-surface">{a.label}</div>
              {a.note && <div className="mt-0.5 text-on-surface-muted">{a.note}</div>}
            </td>
            <td className="!align-top text-right">
              <div className="flex items-center justify-end">
                {edited && <ResetBtn label={a.label} onClick={() => onReset(a.key)} />}
                <NumInput value={v} onChange={(n) => onEdit(a.key, n)} step={stepFor(a)} ariaLabel={a.label} edited={edited} />
              </div>
              <div className="mt-1 text-on-surface-muted tnum">{a.unit === 'share' ? `= ${fmtInput(v, 'share')}` : a.unit}</div>
            </td>
            <td className="!align-top whitespace-nowrap pt-4 text-on-surface-variant tnum">{fmtRange(a)}</td>
            <td className="!align-top">
              <div className="text-on-surface-variant">
                {a.source_url ? (
                  <a href={a.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-notice-dark hover:underline">
                    {hostOf(a.source_url)} <Icon name="open_in_new" size={14} />
                  </a>
                ) : showSrc ? (
                  src
                ) : null}
              </div>
              <div className="text-on-surface-muted">{KIND_WORD[a.kind ?? 'assumption']}</div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
