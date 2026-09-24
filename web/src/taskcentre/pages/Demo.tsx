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
import type { ScenarioAppearance, SimScenario, SimScenarioResult } from '../types';

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
const ROLE_TONE: Record<string, string> = {
  operator: 'bg-cat text-black',
  supervisor: 'bg-notice text-white',
  admin: 'bg-escalation text-white',
};

/**
 * Which screen to point at when this scenario runs.
 *
 * The demo is three devices on a table, and knowing a flag "went to the supervisor" is no use if
 * you are still looking for the tab it went to. A row that reads **Nowhere** is not a gap: for the
 * suppression scenarios, nothing appearing *is* the result, and the panel has to be able to show a
 * non-event or it cannot show restraint.
 */
function WhereItLands({ items }: { items?: ScenarioAppearance[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 border-t border-outline pt-3">
      <h3 className="font-body text-label-md uppercase tracking-wide text-on-surface-muted">Where to watch</h3>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((a, i) => {
          const nowhere = a.where.toLowerCase() === 'nowhere';
          return (
            <li key={`${a.role}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body-sm">
              <span className={cx('shrink-0 px-1.5 py-0.5 font-display text-label-sm uppercase', ROLE_TONE[a.role] ?? 'bg-surface-container-high text-on-surface-variant')}>
                {a.role}
              </span>
              <span className={cx('font-semibold', nowhere ? 'text-on-surface-muted' : 'text-on-surface')}>
                {a.where}
              </span>
              <span className="text-on-surface-muted">{a.what}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The one sentence to show for a run. Never an object: `detail` is a dict on success. */
function resultLine(r?: SimScenarioResult): string | undefined {
  if (!r) return undefined;
  const pick = [r.message, r.summary, typeof r.detail === 'string' ? r.detail : undefined, r.status];
  return pick.find((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

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
                <WhereItLands items={s.appears_for} />
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
                      {resultLine(r.result) && <p className="mt-1 text-body-md text-on-surface-variant">{resultLine(r.result)}</p>}
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
