/**
 * Admin: the fleet table.
 *
 * Each row is one machine: what it is doing now and since when, its availability, utilisation and
 * downtime over the chosen window, when it was last maintained and when the next service falls due
 * on the meter. A row opens the machine's own page. The figures are derived from the machine state
 * log (SIMULATED in the demo) and the method is printed under the table.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Caveat, Card, TABLE, TableWrap } from '../../../components/ops/layout';
import { Icon, Segmented, cx } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import { adminApi } from '../../api';
import { POLL } from '../../constants';
import { StaleDataNote, TcEmpty, TcError, TcLoading } from '../../components/States';
import { SimulatedChip } from '../../components/Badges';
import { fmtDate } from '../../time';
import type { FleetMachine, FleetResponse } from '../../types';
import { ServiceChip, StateChip, StateLegend, StateShareBar, WINDOW_OPTIONS, fmtHours, fmtMeter, fmtPct, fmtSpan } from './fleetParts';

export function FleetPanel() {
  const [days, setDays] = useState<string>('7');
  const fleet = useResource<FleetResponse>(() => adminApi.fleet(Number(days)), [days], POLL.admin);
  const f = fleet.data;

  return (
    <Card
      title="Fleet"
      sub={f ? `${f.machines.length} machines · last ${f.window.days} days · open a row for its history and maintenance` : 'Machines, utilisation, downtime and maintenance'}
      right={<Segmented value={days} options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} onChange={setDays} />}
    >
      {fleet.loading && !f ? (
        <TcLoading label="Loading the fleet" />
      ) : fleet.error && !f ? (
        <TcError error={fleet.error} what="The fleet" onRetry={fleet.reload} />
      ) : !f || f.machines.length === 0 ? (
        <TcEmpty icon="agriculture" title="No machines reported">
          The API returned no machines for this site. Nothing is filled in on their behalf.
        </TcEmpty>
      ) : (
        <div className="space-y-6">
          {fleet.error && <StaleDataNote error={fleet.error} />}
          <FleetTotals f={f} />
          <FleetTable machines={f.machines} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StateLegend />
            <SimulatedChip>State log SIMULATED</SimulatedChip>
          </div>
          <Caveat>{f.method}</Caveat>
        </div>
      )}
    </Card>
  );
}

function FleetTotals({ f }: { f: FleetResponse }) {
  const t = f.totals;
  const workingNow = (t.now.operating ?? 0) + (t.now.idle ?? 0);
  const outNow = (t.now.down ?? 0) + (t.now.maintenance ?? 0);
  const items = [
    { label: 'Working now', value: `${workingNow} / ${t.machines}`, sub: outNow ? `${outNow} out of service` : 'None out of service', tone: outNow ? 'text-warning-text' : '' },
    { label: 'Fleet availability', value: fmtPct(t.availability_pct), sub: `${fmtHours(t.uptime_h, 0)} up of ${fmtHours(t.scheduled_h, 0)} scheduled`, tone: '' },
    { label: 'Fleet utilisation', value: fmtPct(t.utilisation_pct), sub: 'Operating share of scheduled time', tone: '' },
    { label: 'Downtime', value: fmtHours(t.downtime_h), sub: `${fmtHours(t.unplanned_downtime_h)} unplanned · ${t.breakdowns} breakdown${t.breakdowns === 1 ? '' : 's'}`, tone: '' },
    { label: 'Services', value: `${t.service.overdue} overdue`, sub: `${t.service.due_soon} due soon · ${t.open_work_orders} open work orders`, tone: t.service.overdue ? 'text-danger-text' : '' },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-body-sm text-on-surface-muted">{i.label}</dt>
          <dd className={cx('font-display text-headline-sm tnum', i.tone)}>{i.value}</dd>
          <dd className="text-body-sm text-on-surface-muted">{i.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

function FleetTable({ machines }: { machines: FleetMachine[] }) {
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/tc/admin/machines/${encodeURIComponent(id)}`);
  return (
    <TableWrap>
      <table className={cx(TABLE, 'min-w-[1040px]')}>
        <thead>
          <tr>
            <th>Machine</th>
            <th>Now</th>
            <th>Availability</th>
            <th className="w-[220px]">Utilisation · time split</th>
            <th>Downtime</th>
            <th>Last maintained</th>
            <th>Next service</th>
            <th className="whitespace-nowrap">Open flags</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {machines.map((m) => {
            const s = m.stats;
            const svc = m.service;
            const flags = m.open_tickets + m.open_incidents;
            return (
              <tr key={m.machine_id} className="cursor-pointer transition-colors hover:bg-surface-container-high" onClick={() => open(m.machine_id)}>
                <td>
                  <button
                    type="button"
                    className="text-left font-display text-label-md uppercase text-on-surface hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(m.machine_id);
                    }}
                  >
                    {m.machine_id}
                  </button>
                  <span className="block text-body-sm text-on-surface-muted">{m.model ?? (m.registered ? '—' : 'Not registered')}</span>
                  {m.operators.length > 0 && <span className="block text-body-sm text-on-surface-muted">{m.operators.map((o) => o.name).join(', ')}</span>}
                </td>
                <td>
                  <StateChip state={m.current.state} />
                  <span className="mt-1 block text-body-sm text-on-surface-muted">{m.current.since_ts ? `for ${fmtSpan(m.current.age_s)}` : 'never reported'}</span>
                  {(m.current.state === 'down' || m.current.state === 'maintenance') && m.current.reason && (
                    <span className="block max-w-[220px] truncate text-body-sm text-on-surface-muted" title={m.current.reason}>
                      {m.current.reason}
                    </span>
                  )}
                </td>
                <td className="tnum">
                  <span className="font-display text-label-lg">{fmtPct(s.availability_pct)}</span>
                  <span className="block text-body-sm text-on-surface-muted">{fmtHours(s.uptime_h, 0)} up</span>
                </td>
                <td>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-label-lg tnum">{fmtPct(s.utilisation_pct)}</span>
                    <span className="text-body-sm text-on-surface-muted tnum">{fmtHours(s.scheduled_h, 0)} sched.</span>
                  </div>
                  <StateShareBar hours={s.hours} className="mt-1.5" />
                </td>
                <td className="tnum">
                  <span className={cx('font-display text-label-lg', s.unplanned_downtime_h > 0 && 'text-warning-text')}>{fmtHours(s.downtime_h)}</span>
                  <span className="block whitespace-nowrap text-body-sm text-on-surface-muted">{s.unplanned_downtime_h > 0 ? `${fmtHours(s.unplanned_downtime_h)} unplanned` : 'no breakdowns'}</span>
                  {s.breakdowns > 0 && (
                    <span className="block whitespace-nowrap text-body-sm text-on-surface-muted">
                      {s.breakdowns} stop{s.breakdowns === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                <td>
                  {svc.last_maintained ? (
                    <>
                      <span className="text-body-md">{fmtDate(svc.last_maintained.completed_at)}</span>
                      <span className="block max-w-[200px] truncate text-body-sm text-on-surface-muted" title={svc.last_maintained.title}>
                        {svc.last_maintained.title}
                      </span>
                    </>
                  ) : (
                    <span className="text-on-surface-muted">No record</span>
                  )}
                </td>
                <td>
                  <ServiceChip status={svc.status} />
                  <span className="mt-1 block text-body-sm text-on-surface-muted tnum">
                    {svc.remaining_h === null
                      ? 'No meter or service record'
                      : svc.remaining_h < 0
                        ? `${fmtHours(-svc.remaining_h, 0)} past due`
                        : `in ${fmtHours(svc.remaining_h, 0)} · meter ${fmtMeter(svc.hour_meter_h)}`}
                  </span>
                </td>
                <td className="tnum">
                  {flags === 0 ? (
                    <span className="text-on-surface-muted">none</span>
                  ) : (
                    <span className="text-warning-text">
                      {[m.open_tickets ? `${m.open_tickets} ticket${m.open_tickets === 1 ? '' : 's'}` : '', m.open_incidents ? `${m.open_incidents} incident${m.open_incidents === 1 ? '' : 's'}` : '']
                        .filter(Boolean)
                        .map((x) => (
                          <span key={x} className="block whitespace-nowrap">
                            {x}
                          </span>
                        ))}
                    </span>
                  )}
                </td>
                <td className="text-on-surface-muted">
                  <Icon name="chevron_right" size={20} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
