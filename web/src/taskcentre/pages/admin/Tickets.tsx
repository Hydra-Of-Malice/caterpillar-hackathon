/**
 * Admin — every ticket on the site, with filters and a detail drawer holding the evidence, the full
 * decision history and the admin decision form. Filters are sent to the API (`?status=&kind=&user=&machine=`)
 * so the list matches what the server would allow this account to see.
 */
import { useMemo, useState } from 'react';
import { Card } from '../../../components/ops/layout';
import { Button, Drawer, Icon, cx, toast } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import { adminApi, errorText, personName, ticketSubject } from '../../api';
import { SeverityChip, SimulatedChip, TicketStatusChip, kindLabel } from '../../components/Badges';
import { LocalTime } from '../../components/LocalTime';
import { TcEmpty, TcError, TcLoading } from '../../components/States';
import { DecisionHistory, EvidenceList, TicketCard, TicketDecisionForm } from '../../components/TicketCard';
import { POLL } from '../../constants';
import type { DecisionBody, MachineStatus, PersonRow, Ticket, TicketFilters, TicketStatus } from '../../types';

const STATUSES: TicketStatus[] = ['open', 'confirmed', 'dismissed', 'resolved'];
const KNOWN_KINDS = ['geofence_punch', 'ai_idle', 'fatigue', 'task_overrun', 'critical_incident'];

export function TicketsPanel({ people, machines, now }: { people: PersonRow[]; machines: MachineStatus[]; now: number }) {
  const [filters, setFilters] = useState<TicketFilters>({ status: 'open' });
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);

  const res = useResource<Ticket[]>(() => adminApi.tickets(filters), [filters.status, filters.kind, filters.user, filters.machine], POLL.admin);
  const tickets = res.data ?? [];

  const kinds = useMemo(() => Array.from(new Set([...KNOWN_KINDS, ...tickets.map((t) => t.kind)])).sort(), [tickets]);
  const active = selected ? (tickets.find((t) => t.ticket_id === selected.ticket_id) ?? selected) : null;

  const set = (patch: Partial<TicketFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const decide = async (body: DecisionBody) => {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await adminApi.decide(active.ticket_id, body);
      toast(`Ticket recorded as ${body.decision.replace(/_/g, ' ')}`, 'ok');
      setSelected(updated ?? null);
      res.reload();
    } catch (e) {
      toast(`Could not record the decision: ${errorText(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Tickets"
      sub="Flags raised for a human to decide. The original event is kept alongside every decision."
      right={
        <Button size="sm" variant="secondary" icon="refresh" onClick={res.reload}>
          Refresh
        </Button>
      }
    >
      {/* ------------------------------------------------ filters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label className="block">
          <span className="text-body-sm text-on-surface-variant">Status</span>
          <select className="select mt-1" value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value as TicketStatus | '' })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-body-sm text-on-surface-variant">Kind</span>
          <select className="select mt-1" value={filters.kind ?? ''} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-body-sm text-on-surface-variant">Person</span>
          <select className="select mt-1" value={filters.user ?? ''} onChange={(e) => set({ user: e.target.value })}>
            <option value="">Anyone</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {personName(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-body-sm text-on-surface-variant">Machine</span>
          <select className="select mt-1" value={filters.machine ?? ''} onChange={(e) => set({ machine: e.target.value })}>
            <option value="">Any machine</option>
            {machines.map((m) => (
              <option key={m.machine_id} value={m.machine_id}>
                {m.machine_id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(filters.kind || filters.user || filters.machine || filters.status) && (
        <button type="button" onClick={() => setFilters({})} className="mt-3 inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          <Icon name="filter_alt_off" size={18} /> Clear filters
        </button>
      )}

      {/* ------------------------------------------------ list */}
      <div className="mt-5">
        {res.loading && !res.data ? (
          <TcLoading label="Loading tickets" />
        ) : res.error && !res.data ? (
          <TcError error={res.error} what="Tickets" onRetry={res.reload} />
        ) : tickets.length === 0 ? (
          <TcEmpty icon="inbox" title="No tickets match these filters">
            Nothing is shown in place of the missing rows.
          </TcEmpty>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.ticket_id}>
                <TicketCard ticket={t} compact now={now} onOpen={setSelected} selected={active?.ticket_id === t.ticket_id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------ detail drawer */}
      <Drawer
        open={!!active}
        onClose={() => setSelected(null)}
        width="w-[640px]"
        title={
          active ? (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityChip severity={active.severity} />
                <TicketStatusChip status={active.status} />
                <span className="font-display text-label-sm uppercase text-on-surface-muted">{kindLabel(active.kind)}</span>
              </div>
              <h2 className={cx('mt-2 font-display text-headline-sm')}>{active.title}</h2>
              <p className="text-body-sm text-on-surface-muted">
                Raised <LocalTime ts={active.created_at} gmt={active.created_at_gmt} mode="datetime" /> · {active.ticket_id}
              </p>
            </div>
          ) : null
        }
      >
        {active && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <SimulatedChip source={active.source} />
              {active.machine_id && <span className="text-body-sm text-on-surface-muted">Machine {active.machine_id}</span>}
              {ticketSubject(active).name && <span className="text-body-sm text-on-surface-muted">Subject {ticketSubject(active).name}</span>}
              {active.task_id && <span className="text-body-sm text-on-surface-muted">Task {active.task_id}</span>}
              <span className="text-body-sm text-on-surface-muted">Owner {active.owner_name ?? active.owner_user_id ?? active.owner_role}</span>
            </div>
            {active.detail && <p className="text-body-md text-on-surface-variant">{active.detail}</p>}
            <section>
              <h3 className="font-display text-headline-sm">Evidence</h3>
              <EvidenceList className="mt-3" evidence={active.evidence} />
            </section>
            <section>
              <h3 className="font-display text-headline-sm">Decision history</h3>
              <DecisionHistory className="mt-3" decisions={active.decisions} />
            </section>
            <section>
              <h3 className="font-display text-headline-sm">Admin decision</h3>
              <p className="mt-1 text-body-sm text-on-surface-muted">Recorded with your name, your role and the server's time in UTC. It never overwrites the original event.</p>
              <TicketDecisionForm className="mt-3" onSubmit={decide} busy={busy} />
            </section>
          </div>
        )}
      </Drawer>
    </Card>
  );
}
