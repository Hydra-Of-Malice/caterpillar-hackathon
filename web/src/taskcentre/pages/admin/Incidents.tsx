/**
 * Admin — critical incidents: what happened, who the dispatcher picked, who was notified and
 * whether anybody has acknowledged it. "No eligible operator" is shown as its own outcome; the
 * dispatcher never invents a person.
 */
import { Card } from '../../../components/ops/layout';
import { Chip, Icon, cx } from '../../../components/ui';
import { personName } from '../../api';
import { RoleBadge, SeverityChip, SimulatedChip, kindLabel } from '../../components/Badges';
import { GmtTime } from '../../components/GmtTime';
import { TcEmpty } from '../../components/States';
import { fmtAge, fmtMetres } from '../../time';
import type { PersonRow, Role, TcIncident } from '../../types';

function nameOf(people: PersonRow[], userId: string | null | undefined): string {
  if (!userId) return '—';
  const p = people.find((x) => x.user_id === userId);
  return p ? personName(p) : userId;
}

function roleOf(people: PersonRow[], userId: string | null | undefined): Role | undefined {
  if (!userId) return undefined;
  return people.find((x) => x.user_id === userId)?.role ?? people.find((x) => x.user_id === userId)?.user?.role;
}

/**
 * Exactly who the incident reached, each with their role, so "the right supervisor was told" is
 * visible on the record rather than assumed. Nobody is listed who is not in the API's response.
 */
function NotifiedList({ incident, people }: { incident: TcIncident; people: PersonRow[] }) {
  const rows = incident.notified_users?.length
    ? incident.notified_users.map((u) => ({ id: u.user_id, name: u.name ?? nameOf(people, u.user_id), role: u.role ?? roleOf(people, u.user_id) }))
    : (incident.notified_user_ids ?? []).map((id) => ({ id, name: nameOf(people, id), role: roleOf(people, id) }));

  if (rows.length === 0) {
    return (
      <span className="flex items-center gap-1 text-warning-text">
        <Icon name="report" size={16} className="align-[-3px]" /> Nobody recorded as notified
      </span>
    );
  }
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-1.5">
          <Icon name="mark_email_read" size={16} className="text-on-surface-muted" />
          <span className="text-on-surface">{r.name}</span>
          {r.role && <RoleBadge role={r.role} />}
        </li>
      ))}
    </ul>
  );
}

export function IncidentsPanel({ incidents, people, now }: { incidents: TcIncident[]; people: PersonRow[]; now: number }) {
  const unacked = incidents.filter((i) => !i.acknowledged_at).length;
  return (
    <Card
      title="Critical incidents"
      sub={
        incidents.length === 0
          ? 'Every critical event is written to this record with who it reached and who acknowledged it. Nothing is removed from here.'
          : `${incidents.length} recorded · ${unacked} not acknowledged. Each one is kept here permanently with the people it reached.`
      }
    >
      {unacked > 0 && (
        <p className="mb-4 flex items-start gap-2 border-l-4 border-danger bg-danger/10 px-3 py-2 text-body-sm text-danger-text" role="status">
          <Icon name="notifications_active" size={20} className="mt-0.5 shrink-0" />
          <span>
            {unacked} critical {unacked === 1 ? 'incident has' : 'incidents have'} not been acknowledged by anyone yet. Who each one reached
            is listed below.
          </span>
        </p>
      )}
      {incidents.length === 0 ? (
        <TcEmpty icon="check_circle" title="No critical incidents recorded">
          Trigger one from the scenario panel to see the dispatch, the alarm and the acknowledgement trail.
        </TcEmpty>
      ) : (
        <ul className="space-y-4">
          {incidents.map((inc) => {
            const dispatched = inc.dispatch_status !== 'no_eligible_operator';
            return (
              <li key={inc.incident_id} className={cx('border-l-4 pl-4', inc.acknowledged_at ? 'border-success' : 'border-danger')}>
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={inc.severity} />
                  <SimulatedChip source={inc.source} />
                  <span className="font-display text-label-sm uppercase text-on-surface-muted">{kindLabel(inc.kind)}</span>
                  <Chip tone={inc.acknowledged_at ? 'green' : 'red'} icon={inc.acknowledged_at ? 'task_alt' : 'notifications_active'}>
                    {inc.acknowledged_at ? 'Acknowledged' : 'Awaiting acknowledgement'}
                  </Chip>
                  <span className="ml-auto text-body-sm text-on-surface-muted">
                    <GmtTime ts={inc.ts} gmt={inc.ts_gmt} mode="datetime" />
                  </span>
                </div>
                <h3 className="mt-1 font-display text-headline-sm">
                  {inc.machine_id} — {kindLabel(inc.kind)}
                </h3>
                {inc.detail && <p className="text-body-md text-on-surface-variant">{inc.detail}</p>}

                <dl className="mt-2 grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-on-surface-muted">Dispatch</dt>
                    <dd className={dispatched ? 'text-on-surface-variant' : 'text-warning-text'}>
                      {dispatched ? (
                        <>
                          {nameOf(people, inc.nearest_user_id) === '—' ? (inc.nearest_user_name ?? 'assigned') : (inc.nearest_user_name ?? nameOf(people, inc.nearest_user_id))}
                          {typeof inc.nearest_distance_m === 'number' && <> · {fmtMetres(inc.nearest_distance_m)} away</>}
                        </>
                      ) : (
                        <>No eligible operator — supervisor and admin alerted instead</>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-on-surface-muted">Who was notified</dt>
                    <dd className="text-on-surface-variant">
                      <NotifiedList incident={inc} people={people} />
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-on-surface-muted">Acknowledged</dt>
                    <dd className={inc.acknowledged_at ? 'text-success-text' : 'text-danger-text'}>
                      {inc.acknowledged_at ? (
                        <>
                          <Icon name="check_circle" size={16} className="align-[-3px]" /> {inc.acknowledged_by_name ?? nameOf(people, inc.acknowledged_by)} ·{' '}
                          <GmtTime ts={inc.acknowledged_at} gmt={inc.acknowledged_at_gmt} mode="smart" />
                        </>
                      ) : (
                        <>
                          <Icon name="pending" size={16} className="align-[-3px]" /> Not acknowledged · raised {fmtAge(inc.ts, now)}
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-on-surface-muted">Incident</dt>
                    <dd className="font-mono text-on-surface-muted">{inc.incident_id}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
