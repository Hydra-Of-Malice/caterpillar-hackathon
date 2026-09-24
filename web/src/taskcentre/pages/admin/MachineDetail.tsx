/**
 * `/tc/admin/machines/:id` — one machine in full.
 *
 * Top to bottom: what it is doing now; availability, utilisation, downtime, MTBF/MTTR and the
 * service meter over the chosen window; when it was last maintained and when the next service
 * falls due; the last 24 hours as a strip and every day of the window as a stacked bar (with a
 * table view); its work orders, which the admin manages here; and its operational history —
 * downtime log, incidents, flags and tasks. Every figure comes from the API's state log, which
 * the page labels SIMULATED when it is, and the method is printed at the foot.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bar as ThinBar, Caveat, Card, Details, InlineTabs, Stat, TABLE, TableWrap } from '../../../components/ops/layout';
import { AXIS, GRID, TOOLTIP } from '../../../components/ops/chartTheme';
import { Button, Chip, Icon, PageTitle, Segmented, cx } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { adminApi } from '../../api';
import { CameraStill } from '../../components/CameraStill';
import { LocalTime } from '../../components/LocalTime';
import { SeverityChip, SimulatedChip, TicketStatusChip, kindLabel } from '../../components/Badges';
import { StaleDataNote, TcEmpty, TcError, TcLoading } from '../../components/States';
import { POLL } from '../../constants';
import { fmtDate, fmtTime } from '../../time';
import type { MachineDetail as Detail, MaintenanceKind, StateInterval } from '../../types';
import { MaintenancePanel, NewWorkOrderModal } from './MaintenancePanel';
import { KindLabel, STATE_META, ServiceChip, StateChip, StateLegend, TIME_STATES, WINDOW_OPTIONS, WorkOrderStatusChip, fmtHours, fmtMeter, fmtPct, fmtSpan } from './fleetParts';

type HistoryTab = 'downtime' | 'incidents' | 'flags' | 'tasks';

export default function MachineDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [days, setDays] = useState<string>('7');
  const [creating, setCreating] = useState<{ kind: MaintenanceKind; mode: 'schedule' | 'start' | 'log'; title?: string } | null>(null);
  const now = useNow(30_000) / 1000;
  const res = useResource<Detail>(() => adminApi.machine(id, Number(days)), [id, days], POLL.admin);
  const d = res.data;

  if (res.loading && !d) return <TcLoading label={`Loading ${id}`} />;
  if (res.error && !d) {
    return (
      <div className="space-y-6">
        <BackLink />
        <TcError error={res.error} what={`Machine ${id}`} onRetry={res.reload} />
      </div>
    );
  }
  if (!d) return null;

  const s = d.stats;
  const svc = d.service;
  const out = d.current.state === 'down' || d.current.state === 'maintenance';

  return (
    <div className="space-y-8">
      <BackLink />
      <PageTitle
        kicker={d.machine_type ? `Machine · ${d.machine_type}` : 'Machine'}
        title={`${d.machine_id}${d.model ? ` — ${d.model}` : ''}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StateChip state={d.current.state} />
            <span>
              {d.current.since_ts ? (
                <>
                  since <LocalTime ts={d.current.since_ts} gmt={d.current.since_ts_gmt} mode="smart" /> ({fmtSpan(d.current.age_s)})
                </>
              ) : (
                'no state recorded'
              )}
            </span>
            {out && d.current.reason && <span className="text-on-surface-variant">· {d.current.reason}</span>}
            {d.simulated && <SimulatedChip>State log SIMULATED</SimulatedChip>}
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={days} options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} onChange={setDays} />
            <Button size="sm" icon="refresh" onClick={res.reload}>
              Refresh
            </Button>
            {!out && (
              <Button size="sm" variant="danger" icon="build_circle" onClick={() => setCreating({ kind: 'repair', mode: 'start' })}>
                Report breakdown
              </Button>
            )}
          </div>
        }
      />
      {res.error && <StaleDataNote error={res.error} />}

      {/* ------------------------------------------------ key numbers for the window */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Availability (uptime)" value={fmtPct(s.availability_pct)} sub={`${fmtHours(s.uptime_h)} up of ${fmtHours(s.scheduled_h)} scheduled`} tone={s.availability_pct !== null && s.availability_pct < 85 ? 'orange' : 'neutral'} />
        <Stat label="Utilisation" value={fmtPct(s.utilisation_pct)} sub={`${fmtHours(s.hours.operating)} operating · ${fmtPct(s.idle_pct)} idle`} />
        <Stat label="Downtime" value={fmtHours(s.downtime_h)} sub={`${fmtHours(s.unplanned_downtime_h)} unplanned · ${fmtHours(s.planned_downtime_h)} planned`} tone={s.unplanned_downtime_h > 0 ? 'orange' : 'neutral'} />
        <Stat label="Breakdowns" value={s.breakdowns} sub={`MTBF ${fmtHours(s.mtbf_h)} · MTTR ${fmtHours(s.mttr_h)}`} tone={s.breakdowns ? 'orange' : 'neutral'} />
        <Stat label="Service meter" value={fmtMeter(svc.hour_meter_h)} sub={`${fmtHours(s.engine_h_per_day)} engine time a day`} />
      </div>

      {/* ------------------------------------------------ service + now */}
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <ServiceCard d={d} onSchedule={() => setCreating({ kind: 'service', mode: 'schedule', title: `${Math.round(svc.interval_h)} h planned service` })} />
        <NowCard d={d} />
      </div>

      {/* ------------------------------------------------ time */}
      <Card title="Last 24 hours" sub="Each block is one recorded state. Blank stretches are unscheduled time (parked or off shift)." right={<StateLegend />}>
        <DayStrip timeline={d.timeline} now={d.now_ts} />
      </Card>

      <DailyCard d={d} now={now} />

      {/* ------------------------------------------------ maintenance */}
      <MaintenancePanel machineId={d.machine_id} records={d.maintenance} meterNow={svc.hour_meter_h} onChanged={res.reload} onCreate={() => setCreating({ kind: 'service', mode: 'schedule' })} />

      {/* ------------------------------------------------ history */}
      <HistoryCard d={d} />

      <Caveat>
        {d.method} Lifetime of the recorded log: availability {fmtPct(d.lifetime.availability_pct)}, utilisation {fmtPct(d.lifetime.utilisation_pct)}, {d.lifetime.breakdowns} breakdowns. {d.disclaimer}
      </Caveat>

      <NewWorkOrderModal
        machineId={d.machine_id}
        open={creating !== null}
        preset={creating}
        meterNow={svc.hour_meter_h}
        onClose={() => setCreating(null)}
        onCreated={() => {
          setCreating(null);
          res.reload();
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/tc/admin" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
      <Icon name="arrow_back" size={18} /> Fleet
    </Link>
  );
}

// ---------------------------------------------------------------- service
function ServiceCard({ d, onSchedule }: { d: Detail; onSchedule: () => void }) {
  const svc = d.service;
  const used = svc.remaining_h === null ? null : svc.interval_h - svc.remaining_h;
  const pct = used === null ? 0 : (100 * used) / svc.interval_h;
  return (
    <Card title="Maintenance status" sub={`Planned service every ${fmtHours(svc.interval_h, 0)} on the meter`} right={<ServiceChip status={svc.status} />}>
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
            <span className="text-on-surface-variant">Since last service</span>
            <span className="tnum text-on-surface">
              {used === null ? '—' : `${fmtHours(used, 0)} of ${fmtHours(svc.interval_h, 0)}`}
            </span>
          </div>
          <ThinBar pct={pct} tone={svc.status === 'overdue' || svc.status === 'due_soon' ? 'orange' : 'green'} />
          <p className={cx('mt-2 text-body-md', svc.status === 'overdue' && 'text-danger-text')}>
            {svc.remaining_h === null ? (
              'The next service date is unknown: there is no meter reading or no completed service on record.'
            ) : svc.remaining_h < 0 ? (
              <>
                <strong>{fmtHours(-svc.remaining_h, 0)} overdue</strong> — due at {fmtMeter(svc.due_at_h)}, meter now {fmtMeter(svc.hour_meter_h)}.
              </>
            ) : (
              <>
                Next service due at <strong>{fmtMeter(svc.due_at_h)}</strong>, in {fmtHours(svc.remaining_h, 0)} of engine time
                {svc.est_due_ts ? (
                  <>
                    {' '}
                    — around <LocalTime ts={svc.est_due_ts} gmt={svc.est_due_ts_gmt} mode="datetime" /> at the recent {fmtHours(svc.engine_h_per_day)} a day
                  </>
                ) : null}
                .
              </>
            )}
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Last maintained">
            {svc.last_maintained ? (
              <>
                <LocalTime ts={svc.last_maintained.completed_at} gmt={svc.last_maintained.completed_at_gmt} mode="datetime" />
                <span className="block text-body-sm text-on-surface-muted">{svc.last_maintained.title}</span>
              </>
            ) : (
              'No record'
            )}
          </Fact>
          <Fact label="Last planned service">
            {svc.last_service ? (
              <>
                <LocalTime ts={svc.last_service.completed_at} gmt={svc.last_service.completed_at_gmt} mode="datetime" />
                <span className="block text-body-sm text-on-surface-muted">at {fmtMeter(svc.last_service.hour_meter_h)}</span>
              </>
            ) : (
              'No record'
            )}
          </Fact>
          <Fact label="Next booked">
            {svc.next_scheduled ? (
              <>
                <LocalTime ts={svc.next_scheduled.scheduled_for} gmt={svc.next_scheduled.scheduled_for_gmt} mode="datetime" missing="no date set" />
                <span className="block text-body-sm text-on-surface-muted">{svc.next_scheduled.title}</span>
              </>
            ) : (
              <Button size="sm" variant="ghost" icon="event" onClick={onSchedule} className="-ml-3">
                Schedule the service
              </Button>
            )}
          </Fact>
        </dl>
      </div>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-body-sm text-on-surface-muted">{label}</dt>
      <dd className="mt-0.5 text-body-md text-on-surface">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- now
function NowCard({ d }: { d: Detail }) {
  return (
    <Card title="Assignment & cameras" sub={d.site_id ? `Site ${d.site_id}` : undefined}>
      <div className="space-y-4">
        <div>
          <p className="text-body-sm text-on-surface-muted">Assigned operator</p>
          {d.operators.length ? (
            <ul className="mt-1 space-y-1">
              {d.operators.map((o) => (
                <li key={o.user_id} className="text-body-md">
                  {o.name} <span className="text-on-surface-muted">@{o.username}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-md text-on-surface-muted">Nobody is assigned to this machine.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
          <span>
            <span className="text-on-surface-muted">Open flags </span>
            <span className={cx('tnum', d.open_tickets > 0 && 'text-warning-text')}>{d.open_tickets}</span>
          </span>
          <span>
            <span className="text-on-surface-muted">Unacknowledged incidents </span>
            <span className={cx('tnum', d.open_incidents > 0 && 'text-danger-text')}>{d.open_incidents}</span>
          </span>
          <span>
            <span className="text-on-surface-muted">Open work orders </span>
            <span className="tnum">{d.work_orders.open}</span>
          </span>
        </div>
        {d.cameras.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {d.cameras.slice(0, 2).map((c) => (
              <figure key={c.camera_id} className="space-y-1">
                <CameraStill cam={c} />
                <figcaption className="text-body-sm text-on-surface-muted">{c.label}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-on-surface-muted">No camera is registered on this machine.</p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- 24 h strip
function DayStrip({ timeline, now }: { timeline: StateInterval[]; now: number }) {
  const start = now - 86_400;
  const blocks = timeline
    .map((iv) => ({ ...iv, a: Math.max(iv.start_ts, start), b: Math.min(iv.end_ts, now) }))
    .filter((iv) => iv.b > iv.a);
  const ticks = [0, 6, 12, 18, 24].map((h) => start + h * 3600);
  if (blocks.length === 0) {
    return <TcEmpty icon="schedule" title="Nothing recorded in the last 24 hours">The machine was not scheduled, or no state was reported.</TcEmpty>;
  }
  return (
    <div>
      <div className="relative h-10 w-full overflow-hidden rounded bg-surface-container-low" role="img" aria-label="Machine states over the last 24 hours">
        {blocks.map((iv) => (
          <div
            key={iv.id}
            className="absolute inset-y-0 border-r-2 border-surface"
            style={{ left: `${((iv.a - start) / 86_400) * 100}%`, width: `${((iv.b - iv.a) / 86_400) * 100}%`, background: STATE_META[iv.state].color }}
            title={`${STATE_META[iv.state].label} · ${fmtTime(iv.a)}–${iv.open ? 'now' : fmtTime(iv.b)} (${fmtHours((iv.b - iv.a) / 3600)})${iv.reason ? ` · ${iv.reason}` : ''}`}
          />
        ))}
      </div>
      <div className="relative mt-1 h-5 text-body-sm text-on-surface-muted">
        {ticks.map((t, i) => (
          <span key={t} className={cx('absolute tnum', i === 0 ? 'left-0' : i === ticks.length - 1 ? 'right-0' : '-translate-x-1/2')} style={i > 0 && i < ticks.length - 1 ? { left: `${(i / (ticks.length - 1)) * 100}%` } : undefined}>
            {i === ticks.length - 1 ? 'now' : fmtTime(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- daily chart
interface DayRow {
  key: string;
  label: string;
  operating: number;
  idle: number;
  maintenance: number;
  down: number;
  scheduled: number;
}

/** Split every interval at the reader's local midnights and sum hours per state per day. */
function dailyRows(timeline: StateInterval[], windowStart: number, now: number): DayRow[] {
  const rows = new Map<string, DayRow>();
  const midnight = (ts: number) => {
    const d = new Date(ts * 1000);
    d.setHours(0, 0, 0, 0);
    return d.getTime() / 1000;
  };
  for (let day = midnight(windowStart); day < now; ) {
    const d = new Date(day * 1000);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    rows.set(key, { key, label: fmtDate(day), operating: 0, idle: 0, maintenance: 0, down: 0, scheduled: 0 });
    d.setDate(d.getDate() + 1);
    day = d.getTime() / 1000;
  }
  for (const iv of timeline) {
    let a = Math.max(iv.start_ts, windowStart);
    const end = Math.min(iv.end_ts, now);
    while (a < end) {
      const d = new Date(a * 1000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      d.setHours(24, 0, 0, 0);
      const b = Math.min(end, d.getTime() / 1000);
      const row = rows.get(key);
      if (row) {
        row[iv.state] += (b - a) / 3600;
        row.scheduled += (b - a) / 3600;
      }
      a = b;
    }
  }
  return [...rows.values()].map((r) => ({
    ...r,
    operating: +r.operating.toFixed(2),
    idle: +r.idle.toFixed(2),
    maintenance: +r.maintenance.toFixed(2),
    down: +r.down.toFixed(2),
    scheduled: +r.scheduled.toFixed(2),
  }));
}

function DailyCard({ d, now }: { d: Detail; now: number }) {
  const rows = useMemo(() => dailyRows(d.timeline, d.window.start_ts, Math.max(now, d.now_ts)), [d, now]);
  return (
    <Card title="Hours by day" sub={`Scheduled hours per day, split by state, in your local days · last ${d.window.days} days`} right={<StateLegend />}>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -12 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} {...GRID} />
            <XAxis dataKey="label" tickLine={false} {...AXIS} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={40} {...AXIS} unit=" h" />
            <Tooltip {...TOOLTIP} formatter={(v: number, name: string) => [fmtHours(v), name]} />
            {TIME_STATES.map((st, i) => (
              <Bar
                key={st}
                dataKey={st}
                stackId="h"
                name={STATE_META[st].label}
                fill={STATE_META[st].color}
                stroke="var(--chart-tip-bg)"
                strokeWidth={1}
                radius={i === TIME_STATES.length - 1 ? [3, 3, 0, 0] : undefined}
                isAnimationActive={false}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Details label="Table view" className="mt-4">
        <TableWrap>
          <table className={cx(TABLE, 'min-w-[560px]')}>
            <thead>
              <tr>
                <th>Day</th>
                {TIME_STATES.map((st) => (
                  <th key={st} className="text-right">
                    {STATE_META[st].label}
                  </th>
                ))}
                <th className="text-right">Scheduled</th>
                <th className="text-right">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  {TIME_STATES.map((st) => (
                    <td key={st} className="text-right tnum">
                      {r[st] ? fmtHours(r[st]) : '—'}
                    </td>
                  ))}
                  <td className="text-right tnum">{r.scheduled ? fmtHours(r.scheduled) : 'not scheduled'}</td>
                  <td className="text-right tnum">{r.scheduled ? fmtPct((100 * r.operating) / r.scheduled) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Details>
    </Card>
  );
}

// ---------------------------------------------------------------- operational history
function HistoryCard({ d }: { d: Detail }) {
  const [tab, setTab] = useState<HistoryTab>('downtime');
  const downtime = useMemo(() => d.timeline.filter((iv) => iv.state === 'down' || iv.state === 'maintenance').sort((a, b) => b.start_ts - a.start_ts), [d.timeline]);
  const workOrders = useMemo(() => new Map(d.maintenance.map((m) => [m.maintenance_id, m])), [d.maintenance]);
  return (
    <Card title="Operational history" sub={`Downtime in the last ${d.window.days} days; incidents, flags and tasks on this machine`}>
      <InlineTabs<HistoryTab>
        value={tab}
        onChange={setTab}
        label="History"
        className="mb-5"
        options={[
          { value: 'downtime', label: `Downtime log (${downtime.length})` },
          { value: 'incidents', label: `Incidents (${d.incidents.length})` },
          { value: 'flags', label: `Flags (${d.tickets.length})` },
          { value: 'tasks', label: `Tasks (${d.tasks.length})` },
        ]}
      />
      {tab === 'downtime' &&
        (downtime.length === 0 ? (
          <TcEmpty icon="check_circle" title="No downtime in this window">The machine was never down or in maintenance during scheduled time.</TcEmpty>
        ) : (
          <TableWrap>
            <table className={cx(TABLE, 'min-w-[720px]')}>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th className="text-right">Duration</th>
                  <th>Work order</th>
                </tr>
              </thead>
              <tbody>
                {downtime.map((iv) => (
                  <tr key={iv.id}>
                    <td>
                      <LocalTime ts={iv.start_ts} gmt={iv.start_ts_gmt} mode="datetime" />
                      {iv.clipped && <span className="block text-body-sm text-on-surface-muted">began before the window</span>}
                    </td>
                    <td>
                      <StateChip state={iv.state} />
                    </td>
                    <td className="max-w-[320px]">{iv.reason || <span className="text-on-surface-muted">—</span>}</td>
                    <td className="text-right tnum">
                      {fmtHours(iv.duration_h)}
                      {iv.open && <span className="block text-body-sm text-warning-text">ongoing</span>}
                    </td>
                    <td className="text-body-sm text-on-surface-muted">
                      {(() => {
                        const wo = iv.maintenance_id ? workOrders.get(iv.maintenance_id) : undefined;
                        if (!wo) return '—';
                        return (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <KindLabel kind={wo.kind} />
                            <WorkOrderStatusChip status={wo.status} />
                            {wo.performed_by && <span>{wo.performed_by}</span>}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))}
      {tab === 'incidents' &&
        (d.incidents.length === 0 ? (
          <TcEmpty icon="verified" title="No incidents recorded">No critical machine incident has been raised for this machine.</TcEmpty>
        ) : (
          <ul className="divide-y divide-outline">
            {d.incidents.map((i) => (
              <li key={i.incident_id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={i.severity} />
                    <span className="font-semibold">{kindLabel(i.kind)}</span>
                    {i.source === 'SIMULATED' && <SimulatedChip />}
                  </div>
                  {i.detail && <p className="mt-1 text-body-sm text-on-surface-muted">{i.detail}</p>}
                </div>
                <div className="text-right text-body-sm">
                  <LocalTime ts={i.ts} gmt={i.ts_gmt} mode="datetime" />
                  <span className="block">{i.acknowledged ? <Chip tone="green">Acknowledged</Chip> : <Chip tone="red">Open</Chip>}</span>
                </div>
              </li>
            ))}
          </ul>
        ))}
      {tab === 'flags' &&
        (d.tickets.length === 0 ? (
          <TcEmpty icon="flag" title="No flags on this machine" />
        ) : (
          <ul className="divide-y divide-outline">
            {d.tickets.map((t) => (
              <li key={t.ticket_id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TicketStatusChip status={t.status} />
                    <SeverityChip severity={t.severity} />
                    <span className="text-body-sm text-on-surface-muted">{kindLabel(t.kind)}</span>
                  </div>
                  <p className="mt-1">{t.title}</p>
                </div>
                <LocalTime ts={t.created_at} gmt={t.created_at_gmt} mode="datetime" className="text-body-sm" />
              </li>
            ))}
          </ul>
        ))}
      {tab === 'tasks' &&
        (d.tasks.length === 0 ? (
          <TcEmpty icon="assignment" title="No tasks on this machine">No supervisor has assigned a task that names this machine.</TcEmpty>
        ) : (
          <TableWrap>
            <table className={cx(TABLE, 'min-w-[620px]')}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Operator</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                {d.tasks.map((t) => (
                  <tr key={t.task_id}>
                    <td>{t.title}</td>
                    <td>{t.operator_name ?? t.operator_id}</td>
                    <td className="capitalize">{t.status}</td>
                    <td>
                      <LocalTime ts={t.start_ts} gmt={t.start_ts_gmt} mode="smart" />
                    </td>
                    <td>
                      <LocalTime ts={t.finished_at} gmt={t.finished_at_gmt} mode="smart" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))}
    </Card>
  );
}
