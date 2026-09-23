/**
 * `/tc` — Task Centre landing. Says what the product does, who signs in where, and exactly what it
 * does not claim: the detectors are simulated and a position fix indicates presence, not proof.
 */
import { Link } from 'react-router-dom';
import { Card } from '../../components/ops/layout';
import { Icon } from '../../components/ui';
import { useAuth } from '../auth';
import { DEMO_CREDENTIALS, PRODUCT_NAME, PRODUCT_TAGLINE, ROLE_HOME, ROLE_LABEL, loginPath } from '../constants';
import type { Role } from '../types';

const ENTRIES: Array<{ role: Role; icon: string; line: string; does: string[] }> = [
  {
    role: 'admin',
    icon: 'admin_panel_settings',
    line: 'The whole site in one view.',
    does: ['Machines, cameras and staleness', 'Every ticket with evidence and decision history', 'People, last known position and critical incidents'],
  },
  {
    role: 'supervisor',
    icon: 'supervisor_account',
    line: 'Assign the work, review what is flagged.',
    does: ['Create tasks with checkpoints and a finish time', 'Track pending, ongoing, completed and overdue', 'Confirm or dismiss AI flags, and message the operator'],
  },
  {
    role: 'operator',
    icon: 'engineering',
    line: 'Today’s work, on a phone.',
    does: ['Start work, tick checkpoints, record delays', 'Chat with your supervisor', 'Critical alarms reach you on any screen'],
  },
];

const HOW: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: 'assignment',
    title: 'Tasks with checkpoints',
    body: 'A supervisor assigns a task with a location, a machine, a start time, an expected finish and the checkpoints that must be met. The operator works through them; every change is an append-only progress entry.',
  },
  {
    icon: 'my_location',
    title: 'Presence, honestly',
    body: 'Punches and locations are timestamped by the server and compared with the site geofence. A fix that is missing or too imprecise is recorded as “unverified” — never as “outside”.',
  },
  {
    icon: 'flag',
    title: 'Flags a human decides',
    body: 'Simulated idle, fatigue and geofence detectors raise tickets, not verdicts. A supervisor or admin confirms, dismisses or asks for more information, and the original event is kept alongside the decision.',
  },
  {
    icon: 'e911_emergency',
    title: 'Critical incident dispatch',
    body: 'A critical machine event alarms the nearest eligible operator using the freshest position, and notifies their supervisor and the admin. If nobody qualifies, it says so instead of inventing someone.',
  },
];

export default function TcLanding() {
  const { user, ready } = useAuth();

  return (
    <div className="space-y-12">
      {/* ------------------------------------------------ hero */}
      <section className="max-w-3xl">
        <p className="font-display text-label-md uppercase tracking-wider text-on-surface-muted">Prototype · simulated detectors</p>
        <h1 className="mt-2 font-display text-headline-xl text-on-surface sm:text-display">{PRODUCT_NAME}</h1>
        <p className="mt-4 text-body-lg text-on-surface-variant">
          {PRODUCT_TAGLINE} One place to assign the day’s work, see who is on site, review what the detectors flag, and get a critical machine alarm to the nearest person who can act on it.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-body-sm text-on-surface-muted">
          {['All times GMT', 'Permissions enforced in the API', 'Simulated detectors, labelled', 'No machine control'].map((t) => (
            <span key={t} className="inline-flex items-center gap-1 border border-outline-variant px-2 py-1">
              <Icon name="check" size={16} /> {t}
            </span>
          ))}
        </div>
        {ready && user && (
          <p className="mt-5 text-body-md">
            Signed in as <strong>{user.name}</strong> ({ROLE_LABEL[user.role]}).{' '}
            <Link to={ROLE_HOME[user.role]} className="font-semibold text-notice-dark hover:underline">
              Go to your view
            </Link>
          </p>
        )}
      </section>

      {/* ------------------------------------------------ three entry points */}
      <section>
        <h2 className="font-display text-headline-md">Sign in</h2>
        <p className="mt-1 text-body-md text-on-surface-muted">Three roles, three views. Each one only sees what its role is allowed to see.</p>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {ENTRIES.map((e) => (
            <Link
              key={e.role}
              to={loginPath(e.role)}
              className="panel group flex flex-col gap-3 rounded-lg p-6 transition-colors hover:bg-surface-container-high focus-visible:bg-surface-container-high"
            >
              <Icon name={e.icon} size={36} className="text-on-surface-muted" />
              <span className="font-display text-headline-sm text-on-surface">{ROLE_LABEL[e.role]}</span>
              <span className="text-body-md text-on-surface-variant">{e.line}</span>
              <ul className="mt-1 space-y-1.5 text-body-sm text-on-surface-muted">
                {e.does.map((d) => (
                  <li key={d} className="flex items-start gap-1.5">
                    <Icon name="chevron_right" size={16} className="mt-0.5" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
              <span className="mt-auto pt-3 text-body-sm text-on-surface-muted">
                Demo account <code className="font-mono">{DEMO_CREDENTIALS[e.role][0].username}</code>
              </span>
              <span className="flex items-center gap-1 font-display text-label-md uppercase text-notice-dark">
                Sign in as {e.role}
                <Icon name="arrow_forward" size={18} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ how it works */}
      <section>
        <h2 className="font-display text-headline-md">What it does</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {HOW.map((h) => (
            <Card key={h.title}>
              <div className="flex items-start gap-3">
                <Icon name={h.icon} size={28} className="mt-0.5 shrink-0 text-on-surface-muted" />
                <div>
                  <h3 className="font-display text-headline-sm">{h.title}</h3>
                  <p className="mt-1 text-body-md text-on-surface-variant">{h.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ limits */}
      <section>
        <Card title="What this prototype is, and is not">
          <ul className="space-y-3 text-body-md text-on-surface-variant">
            <li className="flex items-start gap-2">
              <Icon name="science" size={20} className="mt-0.5 shrink-0 text-prov-sim-text" />
              <span>
                <strong>The detectors are simulated.</strong> Idle, fatigue and machine-sensor events come from a scenario generator, are stored as simulated events and are labelled SIMULATED everywhere they
                appear. Nothing here is validated fatigue or hazard detection.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="my_location" size={20} className="mt-0.5 shrink-0 text-on-surface-muted" />
              <span>
                <strong>Geolocation indicates presence; it does not prove it.</strong> A browser fix can be denied, stale or wrong by hundreds of metres. A fix that is missing or too imprecise is shown as
                “unverified”, never as “outside the fence”.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="block" size={20} className="mt-0.5 shrink-0 text-on-surface-muted" />
              <span>
                <strong>It does not control machinery</strong> and does not replace site safety procedures, supervision or incident reporting. People, machines and the site are fictional.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="schedule" size={20} className="mt-0.5 shrink-0 text-on-surface-muted" />
              <span>
                <strong>Every operational time is GMT</strong>, stamped by the server. The browser clock is never used for a stored value.
              </span>
            </li>
          </ul>
          <p className="mt-6 text-body-sm text-on-surface-muted">
            Running a demo?{' '}
            <Link to="/tc/demo" className="font-semibold text-notice-dark hover:underline">
              Open the scenario panel
            </Link>{' '}
            to trigger each situation on purpose.
          </p>
        </Card>
      </section>
    </div>
  );
}
