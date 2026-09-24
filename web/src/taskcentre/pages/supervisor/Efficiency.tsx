/**
 * How an operator's work is going — the facts, with the evidence behind them.
 *
 * Deliberately *not* a score and *not* a leaderboard. Every number on this screen is something the
 * system actually recorded (tasks finished on time, checkpoints completed, pre-start checks,
 * flags a human has decided) and each one is shown next to what it was counted from. The team view
 * is a table ordered by name, never a ranking.
 *
 * Two rules the copy must keep:
 *  - waiting the operator declared is its own line and is excluded from working time (a truck that
 *    did not arrive is not counted against them);
 *  - a dismissed flag does not count against the operator, and an unreviewed one is not a finding.
 *
 * Exports: `OperatorEfficiency` (inside the operator page), `TeamEfficiencyTable` (dashboard strip)
 * and the default `/tc/sup/efficiency` page.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { personId, personName, sup } from '../../api';
import { LocalTime } from '../../components';
import { POLL } from '../../constants';
import { nowTs } from '../../time';
import type { SupEfficiency } from '../../types';
import { Button, PageTitle, Segmented } from '../../../components/ui';
import { fmtDur } from '../../../lib/format';
import { useResource } from '../../../lib/hooks';
import { Bar, Card, Caveat, Chip, Details, EmptyState, Icon, Stat, TABLE, TableWrap, cx, gate } from './common';

const DAY_OPTIONS = ['7', '14', '30'] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

/** Task outcome vocabulary: colour for the chart, icon + words everywhere else. */
const OUTCOME = {
  on_time: { label: 'Completed on time', short: 'On time', color: '#197527', icon: 'check_circle', tone: 'green' as const },
  late: { label: 'Completed late', short: 'Late', color: '#C52320', icon: 'schedule', tone: 'red' as const },
  ongoing: { label: 'Ongoing', short: 'Ongoing', color: '#0066FF', icon: 'play_circle', tone: 'blue' as const },
  pending: { label: 'Pending', short: 'Pending', color: '#909090', icon: 'pending', tone: 'neutral' as const },
};

/**
 * The backend may send a rate as a fraction (0–1) or as a percent (0–100). Anything at or below 1
 * is read as a fraction — 1 means "everything on time", which is far likelier than "1 %".
 */
export function asPercent(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const pct = v <= 1 ? v * 100 : v;
  return Math.max(0, Math.min(100, pct));
}

const minutes = (v: number | null | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? fmtDur(v) : 'Not recorded');

/** "12 min over plan" / "8 min under plan" / "on plan" — the sign is spelled out, not implied. */
function planDelta(v: number | null | undefined): { text: string; icon: string; tone: 'green' | 'orange' | 'neutral' } {
  if (typeof v !== 'number' || !Number.isFinite(v)) return { text: 'Not recorded', icon: 'help', tone: 'neutral' };
  if (Math.round(v) === 0) return { text: 'On plan', icon: 'target', tone: 'neutral' };
  return v > 0
    ? { text: `${fmtDur(v)} over plan`, icon: 'trending_up', tone: 'orange' }
    : { text: `${fmtDur(Math.abs(v))} under plan`, icon: 'trending_down', tone: 'green' };
}

const rowName = (r: SupEfficiency): string => personName(r);

// ---------------------------------------------------------------- one operator
export function OperatorEfficiency({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  const [days, setDays] = useState<DayOption>('7');
  const r = useResource(() => sup.efficiency(operatorId, Number(days)), [operatorId, days], POLL.supervisor);
  const e = r.data;

  const t = e?.tasks ?? {};
  const onTime = t.completed_on_time ?? 0;
  const late = t.completed_late ?? 0;
  const ongoing = t.ongoing ?? 0;
  const pending = t.pending ?? 0;
  const assigned = t.assigned ?? onTime + late + ongoing + pending;
  const rate = asPercent(e?.on_time_rate);
  const chart = [
    { key: 'on_time', label: OUTCOME.on_time.short, value: onTime, color: OUTCOME.on_time.color },
    { key: 'late', label: OUTCOME.late.short, value: late, color: OUTCOME.late.color },
    { key: 'ongoing', label: OUTCOME.ongoing.short, value: ongoing, color: OUTCOME.ongoing.color },
    { key: 'pending', label: OUTCOME.pending.short, value: pending, color: OUTCOME.pending.color },
  ];

  const waiting = e?.waiting ?? {};
  const waitReasons = Object.entries(waiting.by_reason ?? {}).sort((a, b) => b[1] - a[1]);
  const cp = e?.checkpoints ?? {};
  const cl = e?.checklist ?? {};
  const f = e?.flags ?? {};
  const delta = planDelta(e?.duration?.planned_vs_actual_minutes);

  return (
    <Card
      title="Efficiency"
      sub={`How ${operatorName}'s work is going over the last ${days} days. Facts and their evidence — there is no score and no ranking.`}
      right={
        <Segmented<DayOption>
          value={days}
          options={DAY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))}
          onChange={setDays}
          size="md"
        />
      }
    >
      {gate(r, 'The efficiency view', 'Loading efficiency') ??
        (assigned === 0 && !e?.duration && !e?.waiting ? (
          <EmptyState icon="query_stats" title="Nothing recorded in this window">
            No tasks, durations or checks were recorded for {operatorName} in the last {days} days. Nothing is estimated to fill the gap.
          </EmptyState>
        ) : (
          <>
            {/* ------------------------------------------------ task outcomes */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label={OUTCOME.on_time.label} value={onTime} tone="green" sub={`of ${assigned} assigned`} />
              <Stat label={OUTCOME.late.label} value={late} tone={late > 0 ? 'red' : 'neutral'} sub="Finished after the expected time" />
              <Stat label={OUTCOME.ongoing.label} value={ongoing} tone="blue" sub="Started, not finished" />
              <Stat label={OUTCOME.pending.label} value={pending} sub="Assigned, not started" />
            </div>

            <div className="mt-6 h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={80} />
                  <Tooltip cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                  <RBar dataKey="value" name="Tasks" barSize={22} isAnimationActive={false}>
                    {chart.map((c) => (
                      <Cell key={c.key} fill={c.color} />
                    ))}
                    <LabelList dataKey="value" position="right" className="recharts-label" />
                  </RBar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-body-sm text-on-surface-muted">Every bar is also written out above, so the chart is never the only way to read it.</p>

            {/* ------------------------------------------------ on-time rate */}
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="font-display text-label-sm uppercase text-on-surface-muted">On-time rate</span>
                <span className="text-body-md text-on-surface tnum">
                  {rate === null ? 'Not returned' : `${Math.round(rate)}% · ${onTime} of ${onTime + late} completed tasks`}
                </span>
              </div>
              {rate !== null && <Bar className="mt-2" pct={rate} tone={rate >= 80 ? 'green' : 'blue'} />}
              <p className="mt-1.5 text-body-sm text-on-surface-muted">
                Counted against the expected finish the supervisor set. A task with no expected finish is not counted either way.
              </p>
            </div>

            {/* ------------------------------------------------ duration */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FactBox icon="timer" label="Median task duration" value={minutes(e?.duration?.median_minutes)} note="Middle value, so one long task does not move it." />
              <FactBox icon={delta.icon} label="Planned vs actual" value={delta.text} tone={delta.tone} note="Actual time compared with the time planned for the task." />
              <FactBox icon="work_history" label="Total working time" value={minutes(e?.duration?.total_working_minutes)} note="Declared waiting is excluded from this figure." />
            </div>

            {/* ------------------------------------------------ waiting, on its own */}
            <div className="mt-6 border border-outline bg-surface-container-low p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-display text-label-sm uppercase text-on-surface-muted">
                  <Icon name="hourglass_empty" size={18} /> Waiting declared by the operator
                </span>
                <span className="text-body-lg text-on-surface tnum">{minutes(waiting.declared_minutes)}</span>
              </div>
              <p className="mt-2 text-body-md text-on-surface-variant">
                This is time {operatorName} declared and explained — a truck that did not arrive, a queue at the crusher, a machine held for someone
                else. It is <strong>excluded from working time and is not counted against them</strong>. Waiting is shown so you can fix the cause, not
                so you can judge the operator.
              </p>
              {waitReasons.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {waitReasons.map(([reason, mins]) => (
                    <li key={reason} className="flex flex-wrap items-baseline justify-between gap-3 text-body-sm">
                      <span className="text-on-surface">{reason}</span>
                      <span className="text-on-surface-variant tnum">{minutes(mins)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ------------------------------------------------ checks */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="border border-outline p-4">
                <h3 className="font-display text-label-sm uppercase text-on-surface-muted">Checkpoints</h3>
                <p className="mt-2 text-body-lg text-on-surface tnum">
                  {cp.completed ?? 0} of {cp.required_total ?? 0} required completed
                </p>
                <Bar className="mt-2" pct={cp.required_total ? ((cp.completed ?? 0) / cp.required_total) * 100 : 0} tone="green" />
                {(cp.exception_resolved ?? 0) > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-on-surface-muted">
                    <Icon name="handyman" size={18} />
                    {cp.exception_resolved} resolved by a supervisor as an exception — not an operator failure.
                  </p>
                )}
              </div>
              <div className="border border-outline p-4">
                <h3 className="font-display text-label-sm uppercase text-on-surface-muted">Pre-start checks</h3>
                <p className="mt-2 text-body-lg text-on-surface tnum">{cl.tasks_with_check ?? 0} tasks with a completed check</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant">
                  <Icon name={(cl.critical_fails ?? 0) > 0 ? 'report' : 'check_circle'} size={18} />
                  {(cl.critical_fails ?? 0) > 0
                    ? `${cl.critical_fails} critical item failed — reporting a fault is the correct action, not a mark against the operator.`
                    : 'No critical item failed in this window.'}
                </p>
              </div>
            </div>

            {/* ------------------------------------------------ flags, split by decision */}
            <div className="mt-6">
              <h3 className="font-display text-label-sm uppercase text-on-surface-muted">Flags in this window</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip tone="red" icon="verified">
                  {f.ai_idle_confirmed ?? 0} confirmed
                </Chip>
                <Chip tone="green" icon="do_not_disturb_on">
                  {f.ai_idle_dismissed ?? 0} dismissed
                </Chip>
                <Chip tone="yellow" icon="pending_actions">
                  {f.ai_idle_open ?? 0} not reviewed yet
                </Chip>
                <Chip tone="orange" icon="schedule">
                  {f.overruns ?? 0} task overrun
                </Chip>
                <Chip tone="purple" icon="location_off">
                  {f.geofence ?? 0} location
                </Chip>
              </div>
              <p className="mt-2 text-body-sm text-on-surface-muted">
                Only a confirmed flag is a finding. A <strong>dismissed flag does not count against the operator</strong> — you looked and said it was
                fine. An unreviewed flag is a question nobody has answered yet, so it is not held against them either.
              </p>
            </div>

            {/* ------------------------------------------------ evidence */}
            <Evidence evidence={e?.evidence} />

            {/* ------------------------------------------------ caveats, verbatim */}
            <CaveatsNote caveats={e?.caveats} />
          </>
        ))}
    </Card>
  );
}

function FactBox({ icon, label, value, note, tone = 'neutral' }: { icon: string; label: string; value: string; note?: string; tone?: 'green' | 'orange' | 'neutral' }) {
  const color = tone === 'green' ? 'text-success-text' : tone === 'orange' ? 'text-warning-text' : 'text-on-surface';
  return (
    <div className="border border-outline p-4">
      <span className="inline-flex items-center gap-1.5 font-display text-label-sm uppercase text-on-surface-muted">
        <Icon name={icon} size={18} /> {label}
      </span>
      <p className={cx('mt-2 font-display text-headline-sm tnum', color)}>{value}</p>
      {note && <p className="mt-1 text-body-sm text-on-surface-muted">{note}</p>}
    </div>
  );
}

/** Whatever the API sent as evidence, rendered as it came — never summarised into a verdict. */
function Evidence({ evidence }: { evidence?: Record<string, unknown> }) {
  const entries = Object.entries(evidence ?? {});
  if (entries.length === 0) return null;
  const show = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return v.length === 0 ? 'none' : v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  return (
    <Details className="mt-6" label={`Evidence behind these numbers (${entries.length})`}>
      <dl className="divide-y divide-outline">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-3 py-2">
            <dt className="text-body-sm text-on-surface-muted">{k.replace(/_/g, ' ')}</dt>
            <dd className="max-w-[60%] break-words text-right text-body-sm text-on-surface">{show(v)}</dd>
          </div>
        ))}
      </dl>
    </Details>
  );
}

/** The backend's caveats, verbatim and visible — not folded away behind a toggle. */
function CaveatsNote({ caveats }: { caveats?: string[] }) {
  const list = caveats ?? [];
  if (list.length === 0) return null;
  return (
    <div className="mt-6 border border-outline bg-surface-container-low p-4" role="note" aria-label="What these numbers do not cover">
      <span className="inline-flex items-center gap-2 font-display text-label-sm uppercase text-on-surface-muted">
        <Icon name="info" size={18} /> What these numbers do not cover
      </span>
      <ul className="mt-2 space-y-1.5">
        {list.map((c, i) => (
          <li key={`${i}-${c}`} className="flex items-start gap-2 text-body-sm text-on-surface-variant">
            <Icon name="chevron_right" size={18} className="mt-0.5 shrink-0" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- the team
/**
 * Every operator's figures side by side, ordered by name. This is not a ranking: there is no score
 * column, no position and no sort by result.
 */
export function TeamEfficiencyTable({ days = 7, compact = false }: { days?: number; compact?: boolean }) {
  const r = useResource(() => sup.teamEfficiency(days), [days], POLL.supervisor);
  const data = r.data;
  const rows = [...(data?.operators ?? data?.rows ?? [])].sort((a, b) => rowName(a).localeCompare(rowName(b)));
  const totals = data?.totals ?? data?.team;

  const blocked = gate(r, 'The team efficiency view', 'Loading team efficiency');
  if (blocked) return <>{blocked}</>;

  if (rows.length === 0) {
    return (
      <EmptyState icon="query_stats" title="No operator figures for this window">
        The API returned no rows for the last {days} days, so none are shown.
      </EmptyState>
    );
  }

  return (
    <>
      <TableWrap>
        <table className={cx(TABLE, compact ? 'min-w-[720px]' : 'min-w-[940px]')}>
          <thead>
            <tr>
              <th>Operator</th>
              <th>On time</th>
              <th>Late</th>
              {!compact && <th>Ongoing</th>}
              {!compact && <th>Pending</th>}
              <th className="min-w-[150px]">On-time rate</th>
              <th className="min-w-[160px]">Waiting declared</th>
              <th>Flags confirmed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = personId(row) ?? '';
              const t = row.tasks ?? {};
              const rate = asPercent(row.on_time_rate);
              return (
                <tr key={id || rowName(row)}>
                  <td>
                    {id ? (
                      <Link to={`/tc/sup/operator/${id}`} className="font-display text-body-lg font-bold text-on-surface hover:underline">
                        {rowName(row)}
                      </Link>
                    ) : (
                      <span className="font-display text-body-lg font-bold text-on-surface">{rowName(row)}</span>
                    )}
                  </td>
                  <td className="tnum">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={OUTCOME.on_time.icon} size={18} className="text-success-text" />
                      {t.completed_on_time ?? 0}
                    </span>
                  </td>
                  <td className="tnum">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={OUTCOME.late.icon} size={18} className={(t.completed_late ?? 0) > 0 ? 'text-danger-text' : 'text-on-surface-muted'} />
                      {t.completed_late ?? 0}
                    </span>
                  </td>
                  {!compact && <td className="tnum">{t.ongoing ?? 0}</td>}
                  {!compact && <td className="tnum">{t.pending ?? 0}</td>}
                  <td>
                    {rate === null ? (
                      <span className="text-body-sm text-on-surface-muted">Not returned</span>
                    ) : (
                      <div className="min-w-[120px]">
                        <span className="text-body-sm text-on-surface tnum">{Math.round(rate)}%</span>
                        <Bar className="mt-1" pct={rate} tone="blue" />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="text-body-sm text-on-surface tnum">{minutes(row.waiting?.declared_minutes)}</span>
                    <span className="block text-body-sm text-on-surface-muted">excluded from working time</span>
                  </td>
                  <td className="tnum">{row.flags?.ai_idle_confirmed ?? 0}</td>
                  <td className="whitespace-nowrap text-right">
                    {id && (
                      <Link to={`/tc/sup/operator/${id}`} className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
                        Open <Icon name="chevron_right" size={18} />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <p className="mt-3 flex items-start gap-2 text-body-sm text-on-surface-muted">
        <Icon name="sort_by_alpha" size={18} className="mt-0.5" />
        <span>
          Ordered by name{data?.ordering ? ` (${data.ordering})` : ''}. This is not a ranking and there is no overall score — read each operator&rsquo;s
          row next to their own conditions.
        </span>
      </p>

      {totals && (
        <p className="mt-2 text-body-sm text-on-surface-variant tnum">
          Team total: {totals.tasks?.completed_on_time ?? 0} on time · {totals.tasks?.completed_late ?? 0} late · {totals.tasks?.ongoing ?? 0} ongoing ·{' '}
          {totals.tasks?.pending ?? 0} pending · {minutes(totals.waiting?.declared_minutes)} declared waiting (excluded from working time).
        </p>
      )}

      <CaveatsNote caveats={data?.caveats ?? totals?.caveats} />
    </>
  );
}

// ---------------------------------------------------------------- page
export default function TeamEfficiency() {
  const [days, setDays] = useState<DayOption>('7');
  return (
    <div className="space-y-8">
      <div>
        <Link to="/tc/sup" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          <Icon name="arrow_back" size={18} /> My team
        </Link>
      </div>

      <PageTitle
        kicker="Supervisor"
        title="Efficiency across the team"
        sub="What the system recorded for each operator, ordered by name. Facts with their evidence — no score, no ranking. Every operational time is shown in your own timezone and stored in UTC."
        right={
          <>
            <span className="text-body-sm text-on-surface-muted">
              Refreshes every {POLL.supervisor / 1000} s · now <LocalTime ts={nowTs()} />
            </span>
            <Segmented<DayOption> value={days} options={DAY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))} onChange={setDays} size="md" />
          </>
        }
      />

      <Card title={`Last ${days} days`} sub="Open an operator to see their training profile and the evidence behind their numbers.">
        <TeamEfficiencyTable days={Number(days)} />
      </Card>

      <Caveat icon="balance">
        Declared waiting is excluded from working time: a truck that did not arrive is not counted against the operator. A dismissed flag does not count
        against them either, and an unreviewed flag is not a finding.
      </Caveat>

      <div>
        <Link to="/tc/sup">
          <Button icon="arrow_back">Back to my team</Button>
        </Link>
      </div>
    </div>
  );
}
