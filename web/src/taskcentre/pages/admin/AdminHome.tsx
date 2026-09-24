/**
 * `/tc/admin` — site-wide dashboard for the administrator.
 *
 * Four key numbers, then machines + cameras, tickets, people and critical incidents. Each panel
 * loads independently, so one failing endpoint degrades that panel only — and says so instead of
 * showing stand-in figures.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, InlineTabs, Stat } from '../../../components/ops/layout';
import { Button, PageTitle } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { adminApi } from '../../api';
import { LocalTime } from '../../components/LocalTime';
import { StaleDataNote, TcError, TcLoading } from '../../components/States';
import { PRESENCE_NOTE, POLL, STALE } from '../../constants';
import { ageS } from '../../time';
import type { AdminOverview, Camera, PersonRow, TcIncident } from '../../types';
import { CamerasPanel, MachinesPanel } from './Machines';
import { ForesightSummary } from './Foresight';
import { IncidentsPanel } from './Incidents';
import { PeoplePanel } from './People';
import { TicketsPanel } from './Tickets';

type Tab = 'site' | 'tickets' | 'people' | 'incidents';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'site', label: 'Machines & cameras' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'people', label: 'People' },
  { value: 'incidents', label: 'Critical incidents' },
];

export default function AdminHome() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'site') as Tab;
  const setTab = (t: Tab) => setParams(t === 'site' ? {} : { tab: t }, { replace: true });

  const now = useNow(5_000) / 1000;
  const overview = useResource<AdminOverview>(() => adminApi.overview(), [], POLL.admin);
  const people = useResource<PersonRow[]>(() => adminApi.people(), [], POLL.admin);
  const cameras = useResource<Camera[]>(() => adminApi.cameras(), [], POLL.admin);
  const incidents = useResource<TcIncident[]>(() => adminApi.incidents(), [], POLL.admin);

  const o = overview.data;
  const machines = o?.machines ?? [];
  const cameraList = cameras.data ?? o?.cameras ?? [];
  const peopleList = people.data ?? [];
  const incidentList = incidents.data ?? [];

  const counts = useMemo(() => {
    const staleMachines = machines.filter((m) => {
      const a = ageS(m.last_seen_ts, now);
      return m.stale ?? (a === null || a > STALE.machine_s);
    }).length;
    const positions = peopleList.map((p) => ({
      status: p.geofence_status ?? p.location?.geofence_status ?? 'unverified',
      ts: p.last_seen_ts ?? p.location?.ts ?? null,
    }));
    const fresh = positions.filter((p) => {
      const a = ageS(p.ts, now);
      return a !== null && a <= STALE.location_s;
    });
    return {
      staleMachines,
      inside: fresh.filter((p) => p.status === 'inside').length,
      outside: positions.filter((p) => p.status === 'outside').length,
      unverified: positions.filter((p) => p.status === 'unverified').length,
      stalePositions: positions.length - fresh.length,
      unacked: incidentList.filter((i) => !i.acknowledged_at).length,
      noOperator: incidentList.filter((i) => i.dispatch_status === 'no_eligible_operator').length,
    };
  }, [machines, peopleList, incidentList, now]);

  // The overview nests counts under `totals` and stamps the clock as `now_ts`.
  const openTickets = o?.totals?.tickets?.open ?? o?.tickets?.open;

  return (
    <div className="space-y-8">
      <PageTitle
        kicker="Administrator"
        title={`Site overview — ${o?.site?.name ?? o?.site?.site_id ?? 'north-quarry'}`}
        sub={PRESENCE_NOTE}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-body-sm text-on-surface-muted">
              Server time <LocalTime ts={o?.now_ts ?? o?.ts} gmt={o?.now_ts_gmt ?? o?.ts_gmt} mode="datetime" missing="unknown" />
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => {
                overview.reload();
                people.reload();
                cameras.reload();
                incidents.reload();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------ four key numbers */}
      {overview.loading && !o ? (
        <TcLoading label="Loading the site overview" />
      ) : overview.error && !o ? (
        <TcError error={overview.error} what="The site overview" onRetry={overview.reload} />
      ) : (
        <>
          {overview.error && <StaleDataNote error={overview.error} />}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat
              label="Machines"
              value={machines.length}
              sub={counts.staleMachines ? `${counts.staleMachines} with a stale reading` : 'All readings current'}
              tone={counts.staleMachines ? 'orange' : 'neutral'}
              onClick={() => setTab('site')}
              active={tab === 'site'}
            />
            <Stat
              label="Open tickets"
              value={openTickets ?? '—'}
              sub={openTickets === undefined ? 'Not reported by the overview endpoint' : 'Waiting for a decision'}
              tone={openTickets ? 'orange' : 'neutral'}
              onClick={() => setTab('tickets')}
              active={tab === 'tickets'}
            />
            <Stat
              label="People on site"
              value={counts.inside}
              unit={`/ ${peopleList.length}`}
              sub={`${counts.unverified} unverified · ${counts.outside} outside · ${counts.stalePositions} stale`}
              onClick={() => setTab('people')}
              active={tab === 'people'}
            />
            <Stat
              label="Unacknowledged incidents"
              value={counts.unacked}
              sub={counts.noOperator ? `${counts.noOperator} found no eligible operator` : 'Critical machine events'}
              tone={counts.unacked ? 'red' : 'neutral'}
              onClick={() => setTab('incidents')}
              active={tab === 'incidents'}
            />
          </div>
        </>
      )}

      {/* ------------------------------------------------ what could happen next (rules, not a forecast) */}
      <ForesightSummary />

      <InlineTabs value={tab} options={TABS} onChange={setTab} label="Admin sections" />

      {/* ------------------------------------------------ panels */}
      {tab === 'site' && (
        <div className="space-y-8">
          {overview.loading && !o ? (
            <TcLoading label="Loading machines" />
          ) : overview.error && !o ? (
            <TcError error={overview.error} what="Machines" onRetry={overview.reload} />
          ) : (
            <MachinesPanel machines={machines} now={now} />
          )}
          {cameras.loading && !cameras.data && !o?.cameras ? (
            <TcLoading label="Loading cameras" />
          ) : cameras.error && cameraList.length === 0 ? (
            <Card title="Cameras">
              <TcError error={cameras.error} what="Cameras" onRetry={cameras.reload} />
            </Card>
          ) : (
            <CamerasPanel cameras={cameraList} now={now} />
          )}
        </div>
      )}

      {tab === 'tickets' && <TicketsPanel people={peopleList} machines={machines} now={now} />}

      {tab === 'people' &&
        (people.loading && !people.data ? (
          <TcLoading label="Loading people" />
        ) : people.error && !people.data ? (
          <TcError error={people.error} what="People" onRetry={people.reload} />
        ) : (
          <>
            {people.error && <StaleDataNote error={people.error} className="mb-3" />}
            <PeoplePanel people={peopleList} now={now} />
          </>
        ))}

      {tab === 'incidents' &&
        (incidents.loading && !incidents.data ? (
          <TcLoading label="Loading incidents" />
        ) : incidents.error && !incidents.data ? (
          <TcError error={incidents.error} what="Critical incidents" onRetry={incidents.reload} />
        ) : (
          <>
            {incidents.error && <StaleDataNote error={incidents.error} className="mb-3" />}
            <IncidentsPanel incidents={incidentList} people={peopleList} now={now} />
          </>
        ))}
    </div>
  );
}
