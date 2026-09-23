/**
 * Admin — people, with the latest position, its geofence status and how old it is.
 * The heading note is not decoration: a position indicates presence, it does not prove it.
 */
import { Card, Caveat, TABLE, TableWrap } from '../../../components/ops/layout';
import { cx } from '../../../components/ui';
import { personName } from '../../api';
import { GeofenceBadge, RoleBadge, StaleBadge } from '../../components/Badges';
import { GmtTime } from '../../components/GmtTime';
import { TcEmpty } from '../../components/States';
import { PRESENCE_NOTE, STALE } from '../../constants';
import { fmtMetres } from '../../time';
import type { PersonRow } from '../../types';

/** A row may nest the user object or flatten its fields — read both shapes. */
function read(p: PersonRow) {
  return {
    name: personName(p),
    role: p.role ?? p.user?.role ?? 'operator',
    username: p.username ?? p.user?.username ?? '',
    machine: p.machine_id ?? p.user?.machine_id ?? null,
    supervisor: p.supervisor?.name ?? p.supervisor_name ?? p.supervisor_id ?? p.user?.supervisor_id ?? null,
    geofence: p.geofence_status ?? p.location?.geofence_status ?? 'unverified',
    ts: p.last_seen_ts ?? p.location?.ts ?? null,
    gmt: p.last_seen_gmt ?? p.location?.ts_gmt ?? null,
    accuracy: p.accuracy_m ?? p.location?.accuracy_m ?? null,
    distance: p.distance_m ?? p.location?.distance_m ?? null,
  };
}

export function PeoplePanel({ people, now }: { people: PersonRow[]; now: number }) {
  return (
    <Card title="People" sub={`${people.length} account${people.length === 1 ? '' : 's'} · latest known position`}>
      {people.length === 0 ? (
        <TcEmpty icon="group" title="No people returned">
          The API returned no accounts for this site.
        </TcEmpty>
      ) : (
        <>
          <TableWrap>
            <table className={cx(TABLE, 'min-w-[860px]')}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Machine</th>
                  <th>Geofence</th>
                  <th>Last fix (GMT)</th>
                  <th>Age</th>
                  <th>Fix accuracy</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const r = read(p);
                  return (
                    <tr key={p.user_id}>
                      <td>
                        <span className="font-semibold text-on-surface">{r.name}</span>
                        <span className="block text-body-sm text-on-surface-muted">
                          {r.username}
                          {r.supervisor ? ` · reports to ${r.supervisor}` : ''}
                        </span>
                      </td>
                      <td>
                        <RoleBadge role={r.role} />
                      </td>
                      <td className="font-display text-label-md uppercase">{r.machine ?? <span className="normal-case text-on-surface-muted">—</span>}</td>
                      <td>
                        <GeofenceBadge status={r.geofence} distanceM={r.distance} accuracyM={r.accuracy} />
                      </td>
                      <td>
                        <GmtTime ts={r.ts} gmt={r.gmt} mode="smart" />
                      </td>
                      <td>
                        <StaleBadge ts={r.ts} thresholdS={STALE.location_s} now={now} label="position" />
                      </td>
                      <td className="tnum text-body-sm text-on-surface-variant">{typeof r.accuracy === 'number' ? `± ${fmtMetres(r.accuracy)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <Caveat className="mt-5" icon="my_location">
            {PRESENCE_NOTE} A fix can be denied, stale or wrong by hundreds of metres; one that is missing or too imprecise is recorded as “unverified”, never as “outside the fence”. Do not use this table
            as an attendance record.
          </Caveat>
        </>
      )}
    </Card>
  );
}
