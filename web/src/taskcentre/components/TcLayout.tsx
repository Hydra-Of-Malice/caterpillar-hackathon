/**
 * Task Centre frame. Its own shell — the in-cab and office layouts are untouched.
 *
 * Holds the auth provider, the always-on critical alarm banner, a role-aware nav and the standing
 * honesty footer. Sticky elements sit below the alarm banner via the `--tc-alarm-h` variable it
 * publishes.
 */
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Icon, cx } from '../../components/ui';
import { useLightTheme } from '../../lib/theme';
import { TcAuthProvider, useAuth } from '../auth';
import { PRESENCE_NOTE, PRODUCT_SHORT, PROTOTYPE_NOTE, ROLE_HOME, ROLE_LABEL } from '../constants';
import type { Role } from '../types';
import { AlarmBanner } from './AlarmBanner';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: '/tc/admin', label: 'Site overview', icon: 'dashboard', end: true },
    { to: '/tc/demo', label: 'Scenarios', icon: 'science' },
  ],
  supervisor: [
    { to: '/tc/sup', label: 'My crew', icon: 'groups', end: true },
    { to: '/tc/demo', label: 'Scenarios', icon: 'science' },
  ],
  operator: [
    { to: '/tc/op', label: 'Today', icon: 'today', end: true },
    { to: '/tc/op/training', label: 'Training', icon: 'school' },
  ],
};

function TcHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const items = (user ? NAV[user.role] : undefined) ?? [];   // unknown role -> no nav, never a crash

  return (
    <header
      className="theme-dark sticky z-40 border-b border-outline bg-black text-on-surface"
      style={{ top: 'var(--tc-alarm-h, 0px)' }}
    >
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link to={(user ? ROLE_HOME[user.role] : undefined) ?? '/tc'} className="flex shrink-0 items-center gap-2" aria-label={`${PRODUCT_SHORT} home`}>
          <span className="h-5 w-5 bg-cat" />
          <span className="leading-tight">
            <span className="block font-display text-label-md uppercase tracking-wider text-on-surface">CAT Sentinel</span>
            <span className="block font-display text-label-sm uppercase tracking-wider text-cat-text">{PRODUCT_SHORT}</span>
          </span>
        </Link>

        <nav className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:flex-1" aria-label="Task Centre">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 font-display text-label-md uppercase transition-colors',
                  isActive ? 'border-b-2 border-cat text-on-surface' : 'text-on-surface-muted hover:text-on-surface',
                )
              }
            >
              <Icon name={n.icon} size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-body-sm text-on-surface">{user.name}</span>
                <span className="block font-display text-label-sm uppercase text-on-surface-muted">{ROLE_LABEL[user.role] ?? user.role}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await signOut();
                  setBusy(false);
                  navigate('/tc');
                }}
                className="flex h-10 items-center gap-1 border border-outline-strong px-3 font-display text-label-sm uppercase text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="logout" size={18} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <Link to="/tc" className="flex h-10 items-center gap-1 border border-outline-strong px-3 font-display text-label-sm uppercase text-on-surface-variant hover:bg-surface-container-high">
              <Icon name="login" size={18} />
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function TcFooter() {
  return (
    <footer className="border-t border-outline px-4 py-4 text-footnote text-on-surface-muted sm:px-6">
      <div className="mx-auto max-w-[1360px] space-y-1">
        <p>{PROTOTYPE_NOTE}</p>
        <p>{PRESENCE_NOTE} All operational times are GMT, recorded by the server clock.</p>
      </div>
    </footer>
  );
}

/** Route element for everything under `/tc`. */
export function TcLayout() {
  const loc = useLocation();
  useLightTheme(true);
  return (
    <TcAuthProvider>
      <div className="flex min-h-screen flex-col bg-surface">
        <AlarmBanner />
        <TcHeader />
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <ErrorBoundary resetKey={loc.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <TcFooter />
      </div>
    </TcAuthProvider>
  );
}
