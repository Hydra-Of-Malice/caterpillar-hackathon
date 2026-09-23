/**
 * `/tc/login/:role` — role-specific sign-in.
 *
 * Asks the browser for a position fix first (short timeout). Deny it, or have no fix, and we send
 * no coordinates at all: the server records the login punch as "unverified". Demo credentials are
 * printed on the page because this is a demo, not a deployment.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Icon, toast } from '../../components/ui';
import { errorText } from '../api';
import { useAuth } from '../auth';
import { DEMO_CREDENTIALS, PRESENCE_NOTE, PRODUCT_SHORT, ROLE_HOME, ROLE_ICON, ROLE_LABEL } from '../constants';
import { GeofenceBadge } from '../components/Badges';
import { GmtTime } from '../components/GmtTime';
import type { Role } from '../types';

const ROLES: Role[] = ['admin', 'supervisor', 'operator'];

const BLURB: Record<Role, string> = {
  admin: 'Site-wide view: machines, cameras, people, every ticket and every critical incident.',
  supervisor: 'Your crew: assign tasks, follow progress, and review what the detectors flag.',
  operator: 'Your day: tasks and checkpoints, start and finish work, messages and alarms.',
};

export default function TcLogin() {
  const { role: roleParam } = useParams<{ role: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const { user, ready, signIn, geo, loginInfo } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = (ROLES as string[]).includes(roleParam ?? '') ? (roleParam as Role) : null;

  useEffect(() => {
    if (role) {
      const demo = DEMO_CREDENTIALS[role][0];
      setUsername((u) => u || demo.username);
    }
  }, [role]);

  if (!role) return <Navigate to="/tc" replace />;
  if (ready && user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn(username, password);
      const home = ROLE_HOME[res.user.role];
      if (res.user.role !== role) {
        toast(`${res.user.name} is a ${ROLE_LABEL[res.user.role].toLowerCase()} account — opening that view instead.`, 'info');
        nav(home, { replace: true });
      } else {
        const from = (loc.state as { from?: string } | null)?.from;
        nav(from && from.startsWith('/tc') ? from : home, { replace: true });
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const accounts = DEMO_CREDENTIALS[role];

  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[1fr_320px]">
      {/* ------------------------------------------------ form */}
      <section className="panel rounded-lg p-6 sm:p-8">
        <Link to="/tc" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          <Icon name="arrow_back" size={18} /> All roles
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <Icon name={ROLE_ICON[role]} size={32} className="text-on-surface-muted" />
          <div>
            <h1 className="font-display text-headline-lg">{ROLE_LABEL[role]} sign-in</h1>
            <p className="text-body-sm text-on-surface-muted">{PRODUCT_SHORT}</p>
          </div>
        </div>
        <p className="mt-3 text-body-md text-on-surface-variant">{BLURB[role]}</p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-body-sm text-on-surface-variant">Username</span>
            <input className="input mt-1" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={busy} required />
          </label>
          <label className="block">
            <span className="text-body-sm text-on-surface-variant">Password</span>
            <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} required />
          </label>

          {error && (
            <div className="flex items-start gap-2 border border-danger bg-danger/10 px-3 py-2 text-body-sm text-danger-text" role="alert">
              <Icon name="error" size={20} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" block icon={busy ? 'hourglass_top' : 'login'} disabled={busy}>
            {busy ? (geo === 'pending' ? 'Checking location…' : 'Signing in…') : `Sign in as ${role}`}
          </Button>
        </form>

        {loginInfo && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
            Last sign-in recorded <GmtTime ts={loginInfo.ts} gmt={loginInfo.ts_gmt} mode="datetime" />
            <GeofenceBadge status={loginInfo.geofence_status} distanceM={loginInfo.distance_m} accuracyM={loginInfo.accuracy_m} />
          </p>
        )}

        <div className="mt-6 flex items-start gap-2 border-t border-outline pt-4 text-body-sm text-on-surface-muted">
          <Icon name="my_location" size={20} className="mt-0.5 shrink-0" />
          <p>
            Your browser is asked for a position when you sign in. If you decline, it is unavailable, or it takes too long, <strong>no coordinates are sent</strong> and the login is recorded as
            “unverified”. {PRESENCE_NOTE}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ demo accounts */}
      <aside className="panel h-fit rounded-lg p-6">
        <h2 className="font-display text-headline-sm">Demo accounts</h2>
        <p className="mt-1 text-body-sm text-on-surface-muted">Seeded on site north-quarry. Shown on screen because this is a prototype.</p>
        <ul className="mt-4 space-y-3">
          {accounts.map((a) => (
            <li key={a.username}>
              <button
                type="button"
                onClick={() => {
                  setUsername(a.username);
                  setPassword(a.password);
                  setError(null);
                }}
                className="w-full border border-outline-variant px-3 py-2 text-left transition-colors hover:bg-surface-container-high"
              >
                <span className="block font-mono text-body-sm text-on-surface">
                  {a.username} / {a.password}
                </span>
                {a.note && <span className="block text-body-sm text-on-surface-muted">{a.note}</span>}
                <span className="mt-1 inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark">
                  <Icon name="content_paste_go" size={14} /> Fill this in
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-2 border-t border-outline pt-4 text-body-sm">
          {ROLES.filter((r) => r !== role).map((r) => (
            <Link key={r} to={`/tc/login/${r}`} className="flex items-center gap-2 text-notice-dark hover:underline">
              <Icon name={ROLE_ICON[r]} size={18} /> {ROLE_LABEL[r]} sign-in
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
