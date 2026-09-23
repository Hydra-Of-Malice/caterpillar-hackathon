/**
 * Screen 15 — Incident Log (R2). Filterable log of rule, model and manual entries. The table stays short
 * (time, unit, signal word, type, status); context, source and the operator's note live in the detail drawer
 * with the ±30 s sensor timeline and review actions. Operational units only (no money on this page).
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { edge } from '../../lib/api';
import { fmtClock, fmtDate, fmtDateTime, titleCase, typeLabel } from '../../lib/format';
import { useNow, useResource } from '../../lib/hooks';
import { liveNow } from '../../lib/live';
import type { Incident } from '../../lib/types';
import { COMPETENCY_MODULE, OPERATORS, competencyLabel } from '../../mocks/world';
import { ExplanationBars } from '../../components/ExplanationBars';
import { SourceNote } from '../../components/ProvenanceBadge';
import { SignalWordChip, normaliseSignalWord } from '../../components/SignalWordChip';
import { SupervisorTabs } from '../../components/office/TrainingTabs';
import { AXIS, GRID, TOOLTIP } from '../../components/ops/chartTheme';
import { Card, Caveat, Details, FieldLabel, Stat, TABLE, TableWrap } from '../../components/ops/layout';
import { Button, Drawer, EmptyState, ErrorNote, Icon, Loading, Modal, PageTitle, Segmented, Toggle, cx, toast } from '../../components/ui';

// ------------------------------------------------------------------ filter vocabularies
type DateRange = 'today' | 'yesterday' | '7d';

const DATE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
];

const SIGNAL_OPTIONS = ['DANGER', 'WARNING', 'CAUTION', 'NOTICE'];
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'RULE', label: 'Safety rule' },
  { value: 'ML', label: 'Model' },
  { value: 'MANUAL', label: 'Manual entry' },
];
const STATUS_OPTIONS: Array<{ value: Incident['status']; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'closed', label: 'Closed' },
];

/** Filter groups → raw incident types. */
const TYPE_GROUPS: Array<{ value: string; label: string; types: string[] }> = [
  { value: 'seatbelt', label: 'Seatbelt', types: ['seatbelt_unfastened_moving'] },
  { value: 'proximity', label: 'Proximity', types: ['person_in_danger_zone', 'person_too_close'] },
  { value: 'speed_near_truck', label: 'Speed near truck', types: ['fast_swing_near_truck'] },
  { value: 'idle', label: 'Idle', types: ['excessive_idle'] },
  { value: 'near_miss', label: 'Near-miss', types: ['near_miss'] },
  { value: 'machine_fault', label: 'Machine fault', types: ['machine_fault', 'hydraulic_pressure_spikes', 'checklist_defect'] },
];

const MANUAL_TYPES = ['near_miss', 'person_too_close', 'machine_fault', 'ground_slope', 'damage', 'other'];
const BASE_UNITS = ['EX-07', 'EX-09', 'EX-04', 'EX-11'];

const STATUS_DOT: Record<Incident['status'], string> = { open: 'bg-warning', reviewed: 'bg-notice', closed: 'bg-success' };
const STATUS_LABEL: Record<Incident['status'], string> = { open: 'Open', reviewed: 'Reviewed', closed: 'Closed' };

const CONTEXT_LABEL: Record<string, string> = {
  task: 'Task',
  zone: 'Zone',
  truck: 'Truck',
  travel_kmh: 'Travel speed (km/h)',
  idle_min: 'Idle (min)',
  person_m: 'Person distance (m)',
  sector: 'Sector',
  rule_id: 'Rule',
  rule_version: 'Rule version',
  dtc: 'Fault codes',
  attribution: 'Attributed to',
  machine_state: 'Machine state',
  waiting_for_truck: 'Waiting for truck',
};

// ------------------------------------------------------------------ helpers
const opName = (id: string) => OPERATORS[id]?.name ?? id;

function provenanceOf(i: Incident): string[] {
  if (i.provenance?.length) return i.provenance;
  return i.source === 'manual' ? ['MANUAL'] : ['RULE'];
}

function sourceLabel(i: Incident): string {
  if (i.source === 'manual') return 'Manual entry from the cab';
  const p = provenanceOf(i);
  return p.includes('ML') ? 'Model (decision support)' : 'Fixed safety rule';
}

function startOfDay(ts: number): number {
  const d = new Date(ts * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
}

function typeMatches(i: Incident, filter: string): boolean {
  if (!filter) return true;
  const g = TYPE_GROUPS.find((x) => x.value === filter);
  return g ? g.types.includes(i.type) : i.type === filter;
}

function sourceMatches(i: Incident, source: string): boolean {
  if (!source) return true;
  if (source === 'MANUAL') return i.source === 'manual';
  return provenanceOf(i).includes(source);
}

function fmtContextValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return null; // nested objects are not shown (no developer JSON on this page)
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: Incident[]): void {
  const head = ['incident_id', 'time', 'unit', 'operator_id', 'operator', 'signal_word', 'type', 'source', 'provenance', 'task', 'zone', 'operator_note', 'dispute_status', 'note', 'status', 'simulated'];
  const lines = rows.map((i) =>
    [
      i.incident_id,
      new Date(i.ts * 1000).toISOString(),
      i.machine_id,
      i.operator_id,
      opName(i.operator_id),
      normaliseSignalWord(i.signal_word),
      typeLabel(i.type),
      i.source,
      provenanceOf(i).join('+'),
      i.context?.task,
      i.context?.zone,
      i.operator_note,
      i.dispute_status,
      i.note,
      i.status,
      i.simulated ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(','),
  );
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incident-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ page
export default function Incidents() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  useNow(30_000);
  const nowTs = liveNow();

  const f = {
    date: ((['today', 'yesterday', '7d'] as string[]).includes(params.get('date') ?? '') ? params.get('date') : '7d') as DateRange,
    machine_id: params.get('machine_id') ?? params.get('unit') ?? '',
    operator_id: params.get('operator_id') ?? '',
    signal_word: (params.get('signal_word') ?? '').toUpperCase(),
    source: (params.get('source') ?? '').toUpperCase(),
    type: params.get('type') ?? '',
    status: (params.get('status') ?? '').toLowerCase(),
    disputed: params.get('disputed') === '1',
  };
  const selectedId = params.get('incident');
  const moreActive = !!(f.operator_id || f.source || f.type);
  const [moreOpen, setMoreOpen] = useState(moreActive);

  const setParam = (k: string, v: string | null) => setParams2({ [k]: v });
  const setParams2 = (patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    }, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (selectedId) next.set('incident', selectedId);
    setParams(next, { replace: true });
  };

  // Exact-match filters go to the edge; type groups and date are applied here (and re-applied defensively).
  const serverFilters: Record<string, string | undefined> = {
    operator_id: f.operator_id || undefined,
    machine_id: f.machine_id || undefined,
    signal_word: f.signal_word || undefined,
    source: f.source || undefined,
    status: f.status && f.status !== 'resolved' ? f.status : undefined,
  };
  const key = JSON.stringify(serverFilters);
  const { data, loading, error, setData, reload } = useResource(() => edge.incidents(serverFilters), [key]);

  // Keep every unit/operator we have seen as a filter option.
  const seen = useRef({ units: new Set<string>(BASE_UNITS), ops: new Set<string>(Object.keys(OPERATORS)) });
  (data ?? []).forEach((i) => {
    seen.current.units.add(i.machine_id);
    seen.current.ops.add(i.operator_id);
  });

  const dayStart = startOfDay(nowTs);
  const rows = useMemo(() => {
    const inRange = (ts: number) => (f.date === 'today' ? ts >= dayStart : f.date === 'yesterday' ? ts >= dayStart - 86400 && ts < dayStart : ts >= dayStart - 6 * 86400);
    return (data ?? [])
      .filter((i) => inRange(i.ts))
      .filter((i) => !f.machine_id || i.machine_id === f.machine_id)
      .filter((i) => !f.operator_id || i.operator_id === f.operator_id)
      .filter((i) => !f.signal_word || normaliseSignalWord(i.signal_word) === f.signal_word)
      .filter((i) => sourceMatches(i, f.source))
      .filter((i) => typeMatches(i, f.type))
      .filter((i) => !f.status || (f.status === 'resolved' ? i.status === 'reviewed' || i.status === 'closed' : i.status === f.status))
      .filter((i) => !f.disputed || i.dispute_status === 'disputed')
      .sort((a, b) => b.ts - a.ts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, key, f.date, f.type, f.status, f.disputed, dayStart]);

  const summary = {
    resolved: rows.filter((i) => i.status === 'reviewed' || i.status === 'closed').length,
    nearMiss: rows.filter((i) => i.source === 'manual' && i.type === 'near_miss').length,
    disputed: rows.filter((i) => i.dispute_status === 'disputed').length,
    open: rows.filter((i) => i.status === 'open').length,
  };

  const selected = selectedId ? (data ?? []).find((i) => i.incident_id === selectedId) : undefined;
  const [newOpen, setNewOpen] = useState(false);
  const activeFilters = Object.values(serverFilters).filter(Boolean).length + (f.type ? 1 : 0) + (f.date !== '7d' ? 1 : 0);

  const updateRow = (inc: Incident) => setData((data ?? []).map((i) => (i.incident_id === inc.incident_id ? inc : i)));

  return (
    <div className="space-y-8">
      <SupervisorTabs />
      <PageTitle
        title="Incident log"
        sub="Rule, model and manual entries. Reviewed before any coaching."
        right={
          <>
            <Button variant="ghost" icon="download" onClick={() => (rows.length ? exportCsv(rows) : toast('No rows to export', 'info'))}>
              Export CSV
            </Button>
            <Button variant="primary" icon="add" onClick={() => setNewOpen(true)}>
              New entry
            </Button>
          </>
        }
      />

      {/* key numbers — operational counts only */}
      <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
        <Stat
          label="Open for review" tone={summary.open > 0 ? 'orange' : 'neutral'} value={summary.open}
          active={f.status === 'open'} onClick={() => setParams2({ status: f.status === 'open' ? null : 'open', disputed: null })}
        />
        <Stat
          label="Reviewed or closed" value={summary.resolved}
          active={f.status === 'resolved'} onClick={() => setParams2({ status: f.status === 'resolved' ? null : 'resolved', disputed: null })}
        />
        <Stat
          label={summary.nearMiss === 1 ? 'Near-miss logged' : 'Near-misses logged'} value={summary.nearMiss}
          active={f.type === 'near_miss'} onClick={() => setParam('type', f.type === 'near_miss' ? null : 'near_miss')}
        />
        <Stat
          label="Disputed by operator" value={summary.disputed}
          active={f.disputed} onClick={() => setParams2({ disputed: f.disputed ? null : '1', status: null })}
        />
      </div>

      <Card>
        {/* filters: the common four visible, the rest behind "More filters" */}
        <div className="flex flex-wrap items-end gap-4">
          <FilterSelect label="Date" value={f.date} onChange={(v) => setParam('date', v === '7d' ? null : v)} options={DATE_OPTIONS} />
          <FilterSelect label="Unit" value={f.machine_id} onChange={(v) => setParam('machine_id', v)} options={[{ value: '', label: 'All units' }, ...Array.from(seen.current.units).sort().map((u) => ({ value: u, label: u }))]} />
          <FilterSelect label="Signal word" value={f.signal_word} onChange={(v) => setParam('signal_word', v)} options={[{ value: '', label: 'All' }, ...SIGNAL_OPTIONS.map((s) => ({ value: s, label: titleCase(s) }))]} />
          <FilterSelect label="Status" value={f.status} onChange={(v) => setParam('status', v)} options={[{ value: '', label: 'Any status' }, ...STATUS_OPTIONS]} />
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} className="inline-flex h-10 items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
            <Icon name={moreOpen ? 'expand_less' : 'tune'} size={18} />
            {moreOpen ? 'Fewer filters' : 'More filters'}
          </button>
        </div>
        {moreOpen && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <FilterSelect label="Operator" value={f.operator_id} onChange={(v) => setParam('operator_id', v)} options={[{ value: '', label: 'All operators' }, ...Array.from(seen.current.ops).sort().map((o) => ({ value: o, label: opName(o) }))]} />
            <FilterSelect label="Source" value={f.source} onChange={(v) => setParam('source', v)} options={[{ value: '', label: 'All sources' }, ...SOURCE_OPTIONS]} />
            <FilterSelect label="Type" value={f.type} onChange={(v) => setParam('type', v)} options={[{ value: '', label: 'All types' }, ...TYPE_GROUPS.map((t) => ({ value: t.value, label: t.label }))]} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-body-sm text-on-surface-muted">
          <span>
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters > 1 ? 's' : ''} on`}
          </span>
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className="font-semibold text-notice-dark hover:underline">
              Clear filters
            </button>
          )}
        </div>

        {/* table */}
        <div className="mt-6">
          {error && !data && <ErrorNote error={error} />}
          {loading && !data ? (
            <Loading label="Loading incident log" />
          ) : rows.length === 0 ? (
            <EmptyState icon="search_off" title="No entries match these filters">
              Try a wider date range or clear the filters.
            </EmptyState>
          ) : (
            <TableWrap>
              <table className={cx(TABLE, 'min-w-[640px]')}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Unit</th>
                    <th>Signal word</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const isSel = i.incident_id === selectedId;
                    const isToday = i.ts >= dayStart;
                    return (
                      <tr
                        key={i.incident_id}
                        tabIndex={0}
                        onClick={() => setParam('incident', i.incident_id)}
                        onKeyDown={(e) => e.key === 'Enter' && setParam('incident', i.incident_id)}
                        className={cx('cursor-pointer transition-colors duration-quick hover:bg-surface-container-low', isSel && 'bg-surface-container-low shadow-[inset_3px_0_0_#FFCD11]')}
                      >
                        <td className="whitespace-nowrap tnum">
                          {fmtClock(i.ts)} <span className="text-body-sm text-on-surface-muted">{isToday ? 'Today' : fmtDate(i.ts)}</span>
                        </td>
                        <td className="whitespace-nowrap font-semibold">{i.machine_id}</td>
                        <td>
                          <SignalWordChip word={i.signal_word} size="sm" />
                        </td>
                        <td className="whitespace-nowrap">{typeLabel(i.type)}</td>
                        <td className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <span className={cx('h-2 w-2 rounded-full', STATUS_DOT[i.status] ?? 'bg-on-surface-muted')} aria-hidden />
                            {STATUS_LABEL[i.status] ?? titleCase(i.status)}
                            {i.dispute_status === 'disputed' && <Icon name="flag" size={18} className="text-warning-text" title="Disputed by the operator" />}
                            {i.dispute_status === 'resolved' && <Icon name="handshake" size={18} className="text-success-text" title="Dispute resolved" />}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </div>
        <SourceNote kinds={['RULE', 'ML', 'MANUAL', 'SIMULATED']}>Demo entries</SourceNote>
      </Card>

      <Caveat>Select a row for the timeline, context and review actions. Operators see and can comment on every entry about them. Nothing here ranks operators.</Caveat>

      {selected && <IncidentDrawer incident={selected} onClose={() => setParam('incident', null)} onUpdated={updateRow} onTraining={(m) => navigate(`/training/module/${m}`)} />}

      <NewEntryModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={(inc) => {
          setNewOpen(false);
          toast('Saved to incident log · will sync when online');
          if (inc && data) setData([inc, ...data.filter((i) => i.incident_id !== inc.incident_id)]);
          else reload();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ pieces
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex min-w-[160px] flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <select className="select h-10 rounded text-body-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value || 'all'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-body-md font-semibold text-on-surface">{title}</h3>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ detail drawer
function IncidentDrawer({ incident: i, onClose, onUpdated, onTraining }: { incident: Incident; onClose: () => void; onUpdated: (i: Incident) => void; onTraining: (moduleId: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const competencies = i.competency_ids ?? [];
  const moduleId = competencies.map((c) => COMPETENCY_MODULE[c]).find(Boolean) ?? 'MOD-SWING-APPROACH';

  async function patch(p: Partial<Pick<Incident, 'status' | 'dispute_status'>>, done: string) {
    setBusy(Object.keys(p)[0] + (p.status ?? p.dispute_status ?? ''));
    setErr(null);
    try {
      const res = await edge.patchIncident(i.incident_id, p);
      onUpdated({ ...i, ...p, ...(res && typeof res === 'object' && 'incident_id' in res ? res : {}) });
      toast(done);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  }

  const ctxRows = [
    ['Operator', opName(i.operator_id)],
    ['Source', sourceLabel(i)],
    ['Severity', titleCase(i.severity)],
    ...(i.shift_id ? [['Shift', i.shift_id]] : []),
    ...Object.entries(i.context ?? {})
      .filter(([k]) => k !== 'rule_version')
      .map(([k, v]) => [CONTEXT_LABEL[k] ?? titleCase(k), fmtContextValue(v)] as const)
      .filter((r): r is readonly [string, string] => r[1] !== null),
  ] as Array<readonly [string, string]>;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <div className="space-y-2">
          <SignalWordChip word={i.signal_word} />
          <h2 className="font-display text-headline-sm text-on-surface">{typeLabel(i.type)}</h2>
          <p className="text-body-sm text-on-surface-muted">
            {fmtDateTime(i.ts)} · {i.machine_id} · {STATUS_LABEL[i.status] ?? titleCase(i.status)}
          </p>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" size="sm" icon="fact_check" disabled={i.status !== 'open' || !!busy} onClick={() => patch({ status: 'reviewed' }, 'Marked reviewed')}>
            Mark reviewed
          </Button>
          <Button variant="secondary" size="sm" icon="check_circle" disabled={i.status === 'closed' || !!busy} onClick={() => patch({ status: 'closed' }, 'Entry closed')}>
            Close
          </Button>
          <Button variant="ghost" size="sm" icon="school" onClick={() => onTraining(moduleId)}>
            Link to training
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        {err !== null && <ErrorNote error={err} />}

        <Section title="Timeline · 30 s either side">
          <SnapshotTimeline incident={i} />
        </Section>

        <Section title="Why flagged">
          {i.explanation?.length ? (
            <ExplanationBars items={i.explanation} compact bandLabel="this operator's usual band for the task" />
          ) : i.source === 'manual' ? (
            <p className="text-body-sm text-on-surface-variant">Logged by a person from the cab. No automatic check involved.</p>
          ) : (
            <p className="text-body-sm text-on-surface-variant">A fixed safety rule was met — a yes/no check, no model involved.</p>
          )}
        </Section>

        <Section title="Operator's note">
          {i.operator_note ? (
            <div className={cx('border-l-4 pl-3', i.dispute_status === 'disputed' ? 'border-warning' : 'border-outline-variant')}>
              <p className="text-body-md text-on-surface">“{i.operator_note}”</p>
              {i.dispute_status === 'disputed' && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-body-sm">
                  <span className="inline-flex items-center gap-1 text-warning-text">
                    <Icon name="flag" size={16} /> Disputed by operator
                  </span>
                  <button type="button" disabled={!!busy} onClick={() => patch({ dispute_status: 'resolved' }, 'Dispute marked resolved')} className="font-semibold text-notice-dark hover:underline disabled:opacity-50">
                    Mark dispute resolved
                  </button>
                </div>
              )}
              {i.dispute_status === 'resolved' && (
                <div className="mt-2 inline-flex items-center gap-1 text-body-sm text-success-text">
                  <Icon name="handshake" size={16} /> Dispute resolved
                </div>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-on-surface-muted">No note from the operator yet.</p>
          )}
          {i.note && <p className="text-body-sm text-on-surface-variant">Entry note: {i.note}</p>}
        </Section>

        <Section title="Context">
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-body-sm">
            {ctxRows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-on-surface-muted">{k}</dt>
                <dd className="text-on-surface">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Details label="Attachments and linked competency">
          <div className="space-y-6">
            <Section title="Attachments">
              {i.attachments?.length ? (
                <ul className="space-y-2">
                  {i.attachments.map((a, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-body-sm">
                        <Icon name={a.kind === 'voice' ? 'mic' : 'photo_camera'} size={20} className="text-on-surface-variant" />
                        {a.label}
                      </span>
                      <Button variant="ghost" size="sm" icon={a.kind === 'voice' ? 'play_arrow' : 'visibility'} onClick={() => toast('Attachment playback is a placeholder in the prototype', 'info')}>
                        {a.kind === 'voice' ? 'Play' : 'View'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-on-surface-muted">No attachments.</p>
              )}
            </Section>
            <Section title="Linked competency">
              {competencies.length ? (
                <ul className="space-y-1.5">
                  {competencies.map((c) => (
                    <li key={c} className="flex items-center gap-2 text-body-sm">
                      <Icon name="school" size={18} className="text-notice-dark" />
                      <span className="text-on-surface">{competencyLabel(c)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-on-surface-muted">No competency linked.</p>
              )}
            </Section>
          </div>
        </Details>

        <SourceNote kinds={[...provenanceOf(i), ...(i.simulated ? ['SIMULATED'] : []), ...(i.attachments?.some((a) => a.mock !== false) ? ['MOCK'] : [])]} />
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------ ±30 s timeline (small multiples, synced cursor)
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

interface Channel {
  key: 'swing' | 'travel' | 'prox';
  label: string;
  unit: string;
  color: string;
  threshold: number;
  thresholdLabel: string;
}

function channelsFor(type: string): { channels: Channel[]; primary: Channel['key'] } {
  const person = type === 'person_in_danger_zone' || type === 'person_too_close';
  const channels: Channel[] = [
    { key: 'swing', label: 'Swing rate', unit: '°/s', color: '#0066FF', threshold: 30, thresholdLabel: 'Rule limit near truck 30 °/s' },
    { key: 'travel', label: 'Travel speed', unit: 'km/h', color: '#1AC69E', threshold: 0.5, thresholdLabel: 'Moving > 0.5 km/h' },
    { key: 'prox', label: person ? 'Person distance' : 'Truck distance', unit: 'm', color: '#6852BE', threshold: person ? 5 : 3, thresholdLabel: person ? 'Danger zone 5 m' : 'Close to truck 3 m' },
  ];
  const primary: Channel['key'] = type === 'seatbelt_unfastened_moving' ? 'travel' : person ? 'prox' : 'swing';
  return { channels, primary };
}

function SnapshotTimeline({ incident }: { incident: Incident }) {
  const series = (incident.snapshot ?? [])
    .map((r) => ({ t: num(r.t), swing: num(r.swing_dps), travel: num(r.travel_kmh), prox: num(r.prox_m) }))
    .filter((r): r is { t: number; swing: number | null; travel: number | null; prox: number | null } => r.t !== null)
    .sort((a, b) => a.t - b.t);
  if (series.length < 2) {
    return <p className="text-body-sm text-on-surface-muted">No sensor snapshot attached. Manual entries and synced summaries may not carry the ±30 s window.</p>;
  }
  const { channels, primary } = channelsFor(incident.type);
  return (
    <div className="space-y-3">
      {channels.map((c, idx) => {
        const isPrimary = c.key === primary;
        const last = idx === channels.length - 1;
        const hasData = series.some((r) => r[c.key] !== null);
        return (
          <div key={c.key}>
            <div className="flex items-center justify-between text-body-sm">
              <span className={isPrimary ? 'font-semibold text-on-surface' : 'text-on-surface-muted'}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                {c.label} ({c.unit})
              </span>
              {isPrimary && <span className="text-on-surface-muted">{c.thresholdLabel}</span>}
            </div>
            {hasData ? (
              <ResponsiveContainer width="100%" height={last ? 96 : 76}>
                <LineChart data={series} syncId={`inc-${incident.incident_id}`} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid {...GRID} vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={[-30, -20, -10, 0, 10, 20, 30]} {...AXIS} hide={!last} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v} s`} height={last ? 22 : 0} />
                  <YAxis {...AXIS} width={40} tickCount={3} domain={[0, 'auto']} />
                  <Tooltip {...TOOLTIP} labelFormatter={(v) => `t ${Number(v) > 0 ? '+' : ''}${v} s`} formatter={(v) => [`${v} ${c.unit}`, c.label]} />
                  <ReferenceLine y={c.threshold} stroke={isPrimary ? '#E56C00' : 'var(--chart-axis)'} strokeDasharray="5 4" />
                  <ReferenceLine x={0} stroke="#C52320" strokeWidth={1.5} label={idx === 0 ? { value: 'Event', position: 'insideTopRight', fill: 'var(--svg-text)', fontSize: 11 } : undefined} />
                  <Line type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={isPrimary ? 2.5 : 1.5} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-2 text-body-sm text-on-surface-muted">Not recorded for this entry.</div>
            )}
          </div>
        );
      })}
      <p className="text-body-sm text-on-surface-muted">Red line = moment of the event. Dashed line = rule threshold.</p>
    </div>
  );
}

// ------------------------------------------------------------------ new manual entry
function NewEntryModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (inc: Incident | null) => void }) {
  const [type, setType] = useState('near_miss');
  const [severity, setSeverity] = useState<Incident['severity']>('medium');
  const [unit, setUnit] = useState('EX-07');
  const [operator, setOperator] = useState('OP-1042');
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const inc = await edge.createIncident({
        type,
        severity,
        source: 'manual',
        signal_word: severity === 'high' ? 'WARNING' : 'NOTICE',
        machine_id: unit,
        operator_id: operator,
        note: note.trim() || null,
        attachments: voice ? [{ kind: 'voice', label: 'Voice note 0:12', mock: true }] : undefined,
      });
      setNote('');
      setVoice(false);
      onSaved(inc && typeof inc === 'object' && 'incident_id' in inc ? inc : null);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New incident entry"
      width="max-w-[640px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="save" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save entry'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err !== null && <ErrorNote error={err} />}
        <div className="grid grid-cols-2 gap-5">
          <label className="flex flex-col gap-1">
            <FieldLabel>Type</FieldLabel>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {MANUAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <FieldLabel>Severity</FieldLabel>
            <Segmented
              value={severity}
              onChange={setSeverity}
              options={[
                { value: 'low', label: 'Low', tone: 'neutral' },
                { value: 'medium', label: 'Medium', tone: 'yellow' },
                { value: 'high', label: 'High', tone: 'orange' },
              ]}
            />
          </div>
          <label className="flex flex-col gap-1">
            <FieldLabel>Unit</FieldLabel>
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {BASE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <FieldLabel>Operator</FieldLabel>
            <select className="select" value={operator} onChange={(e) => setOperator(e.target.value)}>
              {Object.values(OPERATORS).map((o) => (
                <option key={o.operator_id} value={o.operator_id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <FieldLabel>What happened</FieldLabel>
          <textarea className="input h-28 resize-none py-2" maxLength={400} placeholder="e.g. Light vehicle entered the loading zone without a radio call" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Toggle on={voice} onChange={setVoice} label="Attach voice note" />
        <p className="text-body-sm text-on-surface-muted">Task, zone and machine state are attached automatically. The entry is stored on the machine first and synced when online.</p>
        <SourceNote kinds={['MANUAL', 'MOCK']}>Voice note is a placeholder</SourceNote>
      </div>
    </Modal>
  );
}
