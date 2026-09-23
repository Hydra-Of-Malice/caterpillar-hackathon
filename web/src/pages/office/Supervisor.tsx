/**
 * Screen 14 — Supervisor crew overview (R1). One job: see the crew's state and act on escalations.
 * Four key numbers, the machines table, escalations (resolve inline) and gains today in operational units.
 * Machine issues sit behind "Details". Decision support only — the app never controls a machine.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cloud, value } from '../../lib/api';
import { fmtClock, fmtDate, fmtDur, fmtNum } from '../../lib/format';
import { useNow, useResource } from '../../lib/hooks';
import { liveNow } from '../../lib/live';
import type { CrewMachineRow, Escalation, MachineIssue, SignalWord } from '../../lib/types';
import { SourceNote } from '../../components/ProvenanceBadge';
import { SIGNAL_STYLE, SignalIcon } from '../../components/SignalWordChip';
import { SupervisorTabs } from '../../components/office/TrainingTabs';
import { Bar, Card, Caveat, Details, Stat, TABLE, TableWrap } from '../../components/ops/layout';
import { Button, Chip, EmptyState, ErrorNote, Icon, Loading, PageTitle, cx, toast } from '../../components/ui';

const SIGNAL_ORDER: SignalWord[] = ['DANGER', 'WARNING', 'CAUTION', 'NOTICE'];
const CONTINUOUS_LIMIT_MIN = 150;

export default function Supervisor() {
  useNow(1000);
  const nowTs = liveNow();
  const crew = useResource(() => cloud.crewSummary(), [], 15_000);
  const esc = useResource(() => cloud.escalations(), []);
  const gains = useResource(() => value.today({ site_id: 'north-quarry' }), []);
  const issues = useResource(() => cloud.machineIssues(), []);

  const c = crew.data;
  const k = c?.kpis;
  const machines = c?.machines ?? [];
  const escalations = esc.data ?? [];
  const openEsc = escalations.filter((e) => e.status === 'open');
  const resolvedEsc = escalations.filter((e) => e.status !== 'open');
  const degraded = machines.filter((m) => m.protection === 'degraded');
  const openCount = esc.data ? openEsc.length : (k?.open_escalations ?? 0);

  const shiftName = ((c?.shift_label ?? '').match(/^\s*(\w+\s+shift)/i)?.[1] ?? 'Day shift').replace(/\b\w/g, (x) => x.toUpperCase());
  const shiftHours = (c?.shift_label ?? '').match(/\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/)?.[0] ?? '06:00–14:30';

  const updateEsc = (e: Escalation) => esc.setData(escalations.map((x) => (x.escalation_id === e.escalation_id ? e : x)));

  return (
    <div className="space-y-8">
      <SupervisorTabs />
      <PageTitle title={`Crew — ${c?.site ?? 'North Quarry'}`} sub={`${shiftName} ${shiftHours} · now ${fmtClock(nowTs)}`} />

      {crew.loading && !c ? (
        <Loading label="Loading crew summary" />
      ) : !c || !k ? (
        crew.error ? <ErrorNote error={crew.error} /> : <EmptyState icon="groups" title="No crew data for this shift" />
      ) : (
        <>
          {/* ------------------------------------------------ four key numbers */}
          <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
            <Stat label="Machines active" value={k.machines_active} unit={`/ ${k.machines_total}`} />
            <Stat
              label="Protection degraded"
              tone={k.protection_degraded > 0 ? 'red' : 'neutral'}
              value={k.protection_degraded}
              sub={degraded.length ? `Check ${degraded.map((m) => m.machine_id).join(', ')} now` : 'All fitted protection active'}
            />
            <Stat label="Open escalations" tone={openCount > 0 ? 'purple' : 'neutral'} value={openCount} sub={openCount > 0 ? 'Waiting for you' : 'Nothing waiting'} />
            <Stat label="Tasks on track" value={k.tasks_on_track} unit={`/ ${k.tasks_total}`} sub="Finishing inside the likely range" />
          </div>

          <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_360px]">
            {/* ------------------------------------------------ machines & operators */}
            <Card title="Machines & operators">
              {machines.length === 0 ? (
                <EmptyState icon="agriculture" title="No machines reporting" />
              ) : (
                <TableWrap>
                  <table className={cx(TABLE, 'min-w-[760px]')}>
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th className="min-w-[220px]">Task & finish</th>
                        <th>Protection</th>
                        <th>Open alerts</th>
                        <th>Continuous operation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machines.map((m) => (
                        <MachineRow key={m.machine_id} m={m} />
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              <Details className="mt-6" label={`Machine issues${issues.data?.length ? ` (${issues.data.length})` : ''}`}>
                <MachineIssues loading={issues.loading && !issues.data} list={issues.data ?? []} />
              </Details>
              <SourceNote kinds={['ML', 'SIMULATED']}>Finish times are the likely range from the task-time model</SourceNote>
            </Card>

            {/* ------------------------------------------------ right column */}
            <div className="space-y-8">
              <Card title="Escalations" sub={openEsc.length ? `${openEsc.length} open` : undefined}>
                {esc.loading && !esc.data ? (
                  <Loading label="Loading escalations" />
                ) : openEsc.length === 0 ? (
                  <p className="text-body-md text-on-surface-muted">No open escalations. Break, protection and repeated-alert escalations appear here.</p>
                ) : (
                  <ul className="divide-y divide-outline">
                    {openEsc.map((e) => (
                      <EscalationItem key={e.escalation_id} e={e} nowTs={nowTs} onResolved={updateEsc} />
                    ))}
                  </ul>
                )}
                {resolvedEsc.length > 0 && (
                  <Details className="mt-5" label={`Resolved this shift (${resolvedEsc.length})`}>
                    <ul className="space-y-3">
                      {resolvedEsc.map((e) => (
                        <li key={e.escalation_id} className="flex items-start gap-2 text-body-sm">
                          <Icon name="check_circle" size={18} className="mt-0.5 text-success-text" />
                          <span className="min-w-0">
                            <span className="font-semibold text-on-surface">{e.machine_id}</span> <span className="text-on-surface-variant">· {e.what}</span>
                            {e.note && <span className="block truncate text-on-surface-muted">“{e.note}”</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Details>
                )}
              </Card>

              {/* ------------------------------------------------ gains today (operational units only) */}
              <Card
                title="Gains today"
                sub="Estimate"
                right={
                  <Link to="/value" className="text-body-sm font-semibold text-notice-dark hover:underline">
                    Assumptions
                  </Link>
                }
              >
                {gains.loading && !gains.data ? (
                  <Loading label="Estimating" />
                ) : !gains.data?.line_items?.length ? (
                  <p className="text-body-md text-on-surface-muted">No estimate yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {gains.data.line_items.map((li) => (
                      <li key={li.key} className="flex items-baseline justify-between gap-3" title={li.detail}>
                        <span className="min-w-0 text-body-md text-on-surface-variant">{li.label}</span>
                        <span className="shrink-0 whitespace-nowrap font-display text-body-lg font-bold text-on-surface tnum">
                          {fmtNum(li.value, Number.isInteger(li.value) ? 0 : 1)} <span className="text-body-sm font-normal text-on-surface-muted">{li.unit}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-5 border-t border-outline pt-4 text-body-sm text-on-surface-variant">
                  Idle today <span className="font-semibold text-on-surface tnum">{fmtDur(k.idle_today_min)}</span> · {Math.round(k.idle_waiting_pct)}% waiting for truck
                  {typeof k.idle_fuel_l === 'number' && <> · ~{fmtNum(k.idle_fuel_l)} L fuel in unexplained idle</>}.{' '}
                  <Link to="/anomaly" className="font-semibold text-notice-dark hover:underline">
                    See idle
                  </Link>
                </p>
                <p className="mt-2 text-body-sm text-on-surface-muted">{gains.data?.note ?? 'Estimated from editable assumptions; not measured savings.'}</p>
                <SourceNote kinds={['ESTIMATE', 'RULE', 'SIMULATED']} />
              </Card>
            </div>
          </div>
        </>
      )}

      <Caveat icon="visibility_lock">No operator ranking. Individual coaching data is visible to the operator and their instructor.</Caveat>
    </div>
  );
}

// ------------------------------------------------------------------ table row
function MachineRow({ m }: { m: CrewMachineRow }) {
  const e = m.estimate;
  const long = m.continuous_operation_min > CONTINUOUS_LIMIT_MIN;
  const counts = SIGNAL_ORDER.map((w) => [w, m.alerts_by_signal_word?.[w] ?? 0] as const).filter(([, n]) => n > 0);
  return (
    <tr className={cx(m.protection === 'degraded' && 'shadow-[inset_3px_0_0_#C52320]')}>
      <td className="whitespace-nowrap" title={m.model}>
        <div className="font-display text-body-lg font-bold text-on-surface">{m.machine_id}</div>
        <div className="text-body-sm text-on-surface-muted">{m.operator_name}</div>
      </td>
      <td>
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-on-surface" title={m.task_detail}>
            {m.task}
          </span>
          <span className="shrink-0 text-body-sm text-on-surface-muted tnum">{Math.round(m.progress_pct)}%</span>
        </div>
        <Bar className="mt-1.5" pct={m.progress_pct} tone={m.progress_pct >= 80 ? 'green' : 'neutral'} />
        <div className="mt-1.5 text-body-sm text-on-surface-muted tnum">
          {e ? (
            <>
              Finish ~<span className="text-on-surface">{fmtClock(e.p50_ts)}</span> ({fmtClock(e.p10_ts)}–{fmtClock(e.p90_ts)})
            </>
          ) : (
            'No finish estimate'
          )}
        </div>
      </td>
      <td className="whitespace-nowrap">
        {m.protection === 'active' ? (
          <span className="inline-flex items-center gap-1.5 text-body-sm text-success-text">
            <Icon name="verified_user" size={18} />
            Active
          </span>
        ) : m.protection === 'degraded' ? (
          <div title={m.protection_note}>
            <Chip tone="red" icon="warning">
              Degraded
            </Chip>
            {m.protection_note && <div className="mt-1 max-w-[180px] whitespace-normal text-body-sm text-on-surface-muted">{m.protection_note}</div>}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-muted">
            <Icon name="sensors_off" size={18} />
            Not fitted
          </span>
        )}
      </td>
      <td className="whitespace-nowrap">
        {counts.length ? (
          <Link to={`/incidents?machine_id=${encodeURIComponent(m.machine_id)}&date=today`} className="inline-flex items-center gap-1" title="Open in incident log">
            {counts.map(([w, n]) => (
              <span key={w} title={`${n} ${w}`} className={cx('inline-flex h-6 items-center gap-1 rounded px-1.5 font-display text-label-sm tnum', SIGNAL_STYLE[w].bg, SIGNAL_STYLE[w].text)}>
                <SignalIcon word={w} size={13} fill={w === 'DANGER' ? '#C52320' : undefined} />
                {n}
              </span>
            ))}
          </Link>
        ) : (
          <span className="text-body-sm text-on-surface-muted">None</span>
        )}
      </td>
      <td className="whitespace-nowrap">
        {long ? (
          <Chip tone="orange" icon="timer">
            {fmtDur(m.continuous_operation_min)} · break due
          </Chip>
        ) : (
          <span className="text-on-surface tnum">{fmtDur(m.continuous_operation_min)}</span>
        )}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ machine issues (behind Details)
function MachineIssues({ loading, list }: { loading: boolean; list: MachineIssue[] }) {
  if (loading) return <Loading label="Loading" />;
  if (!list.length) return <p className="text-body-md text-on-surface-muted">No open machine issues.</p>;
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {list.map((i) => (
          <li key={`${i.machine_id}-${i.issue}`} className="text-body-md">
            <span className="font-semibold text-on-surface">{i.machine_id}</span> <span className="text-on-surface-variant">· {i.issue}</span>
            {(i.dtc ?? []).length > 0 && <span className="ml-2 font-mono text-body-sm text-on-surface-muted">{(i.dtc ?? []).join(', ')}</span>}
            <div className="text-body-sm text-on-surface-muted">Since {fmtDate(i.since_ts)} {fmtClock(i.since_ts)} · routed to maintenance, not counted for coaching</div>
          </li>
        ))}
      </ul>
      <Link to="/anomaly?tab=health" className="inline-block text-body-sm font-semibold text-notice-dark hover:underline">
        Open machine health
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ escalation item (resolve inline)
function EscalationItem({ e, nowTs, onResolved }: { e: Escalation; nowTs: number; onResolved: (e: Escalation) => void }) {
  const [note, setNote] = useState(e.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function resolve() {
    setBusy(true);
    setErr(null);
    try {
      const res = await cloud.resolveEscalation(e.escalation_id, note.trim());
      const merged: Escalation = { ...e, status: 'resolved', note: note.trim() || null, ...(res && typeof res === 'object' && 'escalation_id' in res ? res : {}) };
      onResolved(merged);
      toast(`${e.machine_id} escalation marked resolved`);
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-escalation" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold text-on-surface">
            {e.machine_id} · {e.operator_name ?? e.operator_id}
          </div>
          <div className="text-body-md text-on-surface-variant">{e.what}</div>
          {e.detail && <div className="text-body-sm text-on-surface-muted">{e.detail}</div>}
          <div className="mt-1 text-body-sm text-on-surface-muted tnum">
            {fmtClock(e.ts)} · open {fmtDur((nowTs - e.ts) / 60)}
          </div>
        </div>
      </div>
      <input className="input h-10 rounded text-body-sm" maxLength={300} placeholder="Note (optional) — what was agreed" value={note} onChange={(x) => setNote(x.target.value)} aria-label="Supervisor note" />
      {err !== null && <ErrorNote error={err} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon="check_circle" disabled={busy} onClick={resolve}>
          {busy ? 'Saving…' : 'Mark resolved'}
        </Button>
        <Button variant="ghost" size="sm" icon="call" onClick={() => toast(`Radio call to ${e.operator_name ?? e.machine_id} (placeholder integration)`, 'info')}>
          Call operator
        </Button>
      </div>
    </li>
  );
}
