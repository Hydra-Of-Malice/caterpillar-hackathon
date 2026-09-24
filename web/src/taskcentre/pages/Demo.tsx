/**
 * `/tc/demo` — scenario control panel.
 *
 * Lists the scenarios the API offers (`GET /tc/sim/scenarios`) and triggers them
 * (`POST /tc/sim/scenario/{name}`). Everything produced here is simulated and labelled as such;
 * the panel reports exactly what the server said it created, and nothing more.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Caveat } from '../../components/ops/layout';
import { Button, Icon, cx } from '../../components/ui';
import { useResource } from '../../lib/hooks';
import { errorText, simApi } from '../api';
import { SimulatedChip } from '../components/Badges';
import { LocalTime } from '../components/LocalTime';
import { TcEmpty, TcError, TcLoading } from '../components/States';
import { nowTs } from '../time';
import type { SimScenario, SimScenarioResult } from '../types';

/** What each contract scenario is meant to show. Used when the API sends no description. */
const INFO: Record<string, { title: string; demonstrates: string }> = {
  critical_incident: {
    title: 'Critical machine incident',
    demonstrates: 'A machine sensor fires. The nearest eligible operator (freshest position, inside the age and distance limits) is alarmed, and their supervisor and the admin are notified.',
  },
  critical_incident_no_operator: {
    title: 'Critical incident with nobody eligible',
    demonstrates: 'The same event when no operator qualifies. The dispatch is recorded as "no eligible operator" and the supervisor and admin are alerted — no operator is invented.',
  },
  waiting_for_truck: {
    title: 'Idle with a good reason',
    demonstrates: 'A long idle period with context "waiting for truck". The observation is logged and the flag is suppressed, so the operator is not blamed for a queue.',
  },
  true_idle: { title: 'Unexplained idle', demonstrates: 'Idle with no supporting context raises an ai_idle ticket for the supervisor, with a timeline and a clip placeholder.' },
  false_idle: { title: 'Idle flag a supervisor dismisses', demonstrates: 'Shows the review path: the AI flag is a question, the supervisor decides, and the original event is kept beside the decision.' },
  fatigue: { title: 'Fatigue prompt', demonstrates: 'A simulated fatigue indicator prompts the operator and notifies the supervisor. Labelled SIMULATED — never presented as validated fatigue detection.' },
  outside_geofence_punch: { title: 'Punch outside the geofence', demonstrates: 'A start-work punch outside the fence raises a ticket for the supervisor. An imprecise fix would be "unverified" instead, never "outside".' },
  task_overrun: { title: 'Task overrun', demonstrates: 'Finishing after the expected finish time opens a task_overrun ticket for the supervisor.' },
};

interface RunEntry {
  name: string;
  ts: number;
  result?: SimScenarioResult;
  error?: string;
}

/** Ids worth surfacing from a scenario result, with where to look at them. */
function created(r: SimScenarioResult): Array<{ label: string; value: string; to?: string }> {
  const out: Array<{ label: string; value: string; to?: string }> = [];
  const push = (label: string, value: unknown, to?: string) => {
    if (typeof value === 'string' && value) out.push({ label, value, to });
  };
  push('Incident', r.incident_id, '/tc/admin?tab=incidents');
  push('Ticket', r.ticket_id, '/tc/admin?tab=tickets');
  push('Task', r.task_id);
  push('Event', r.event_id);
  push('Operator', r.user_id, '/tc/admin?tab=people');
  for (const [k, v] of Object.entries(r.created ?? {})) push(k.replace(/_/g, ' '), v);
  if (r.notification_ids?.length) out.push({ label: 'Notifications', value: `${r.notification_ids.length} sent` });
  return out;
}

export default function TcDemo() {
  const res = useResource<SimScenario[]>(() => simApi.scenarios(), []);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string) => {
    setBusy(name);
    try {
      const result = await simApi.runScenario(name);
      setRuns((r) => [{ name, ts: nowTs(), result }, ...r].slice(0, 12));
    } catch (e) {
      setRuns((r) => [{ name, ts: nowTs(), error: errorText(e) }, ...r].slice(0, 12));
    } finally {
      setBusy(null);
    }
  };

  const scenarios = res.data ?? [];

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-headline-lg">Scenario panel</h1>
          <SimulatedChip />
        </div>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Trigger each situation on purpose during a demo. Every scenario writes a simulated event and whatever it produces — tickets, incidents, notifications — is labelled SIMULATED throughout the app.
        </p>
        <Caveat className="mt-3" icon="warning">
          These are generated events, not observations of anything real. Nothing here controls a machine.
        </Caveat>
      </header>

      {res.loading && !res.data ? (
        <TcLoading label="Loading scenarios" />
      ) : res.error && !res.data ? (
        <TcError error={res.error} what="The scenario list" onRetry={res.reload} />
      ) : scenarios.length === 0 ? (
        <TcEmpty icon="science" title="The API offers no scenarios">
          <code>GET /tc/sim/scenarios</code> returned an empty list.
        </TcEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {scenarios.map((s) => {
            const info = INFO[s.name];
            const title = s.title ?? info?.title ?? s.name.replace(/_/g, ' ');
            const body = s.description ?? s.demonstrates ?? info?.demonstrates;
            return (
              <Card key={s.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-headline-sm">{title}</h2>
                    <code className="text-body-sm text-on-surface-muted">{s.name}</code>
                  </div>
                  <SimulatedChip />
                </div>
                <p className="mt-2 text-body-md text-on-surface-variant">{body ?? 'The API did not describe this scenario.'}</p>
                {s.expects && <p className="mt-1 text-body-sm text-on-surface-muted">Expected: {s.expects}</p>}
                <Button className="mt-4" variant="primary" icon="play_arrow" disabled={busy !== null} onClick={() => void run(s.name)}>
                  {busy === s.name ? 'Running…' : 'Trigger'}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------ run log */}
      <Card title="What was created" sub="Newest first · exactly what the API reported">
        {runs.length === 0 ? (
          <TcEmpty icon="history" title="Nothing has been triggered in this session" />
        ) : (
          <ul className="space-y-4">
            {runs.map((r, i) => {
              const items = r.result ? created(r.result) : [];
              return (
                <li key={`${r.name}-${r.ts}-${i}`} className={cx('border-l-4 pl-4', r.error ? 'border-danger' : 'border-success')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon name={r.error ? 'error' : 'check_circle'} size={18} className={r.error ? 'text-danger-text' : 'text-success-text'} />
                    <span className="font-display text-label-md uppercase">{INFO[r.name]?.title ?? r.name}</span>
                    <SimulatedChip />
                    <span className="ml-auto text-body-sm text-on-surface-muted">
                      <LocalTime ts={r.ts} mode="datetime" />
                    </span>
                  </div>
                  {r.error ? (
                    <p className="mt-1 text-body-sm text-danger-text">{r.error}</p>
                  ) : (
                    <>
                      {(r.result?.message || r.result?.detail || r.result?.status) && <p className="mt-1 text-body-md text-on-surface-variant">{r.result?.message ?? r.result?.detail ?? r.result?.status}</p>}
                      {r.result?.dispatch_status === 'no_eligible_operator' && <p className="mt-1 text-body-sm text-warning-text">No eligible operator was found — the supervisor and admin were alerted instead.</p>}
                      {items.length === 0 ? (
                        <p className="mt-1 text-body-sm text-on-surface-muted">The API reported no ids for this run.</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
                          {items.map((it) => (
                            <li key={`${it.label}-${it.value}`}>
                              <span className="text-on-surface-muted">{it.label}: </span>
                              {it.to ? (
                                <Link to={it.to} className="font-mono font-semibold text-notice-dark hover:underline">
                                  {it.value}
                                </Link>
                              ) : (
                                <span className="font-mono">{it.value}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
