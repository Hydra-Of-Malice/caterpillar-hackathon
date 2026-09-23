import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { PERSONAS, setRole, usePersona, type Role } from '../../lib/persona';
import { setShowSources, useShowSources } from '../../lib/prefs';
import { useLightTheme } from '../../lib/theme';
import { DemoRibbon, MockIndicator } from '../DemoRibbon';
import { ErrorBoundary } from '../ErrorBoundary';
import { Icon, Wordmark, cx } from '../ui';

/** Top nav: five sections. Everything else lives under More or inside its parent section's tabs. */
const MAIN: Array<{ to: string; label: string; match: string[] }> = [
  { to: '/cab/home', label: 'Operator', match: ['/cab'] },
  { to: '/training', label: 'Training', match: ['/training'] },
  { to: '/supervisor', label: 'Supervisor', match: ['/supervisor', '/incidents', '/tasks', '/anomaly'] },
  { to: '/value', label: 'Business value', match: ['/value'] },
  { to: '/tour', label: 'Demo tour', match: ['/tour'] },
];

const MORE = [
  { to: '/instructor', label: 'Instructor workspace', icon: 'school' },
  { to: '/incidents', label: 'Incident log', icon: 'report' },
  { to: '/diagnostics', label: 'Diagnostics', icon: 'monitor_heart' },
  { to: '/traceability', label: 'Traceability', icon: 'account_tree' },
  { to: '/privacy', label: 'Privacy & data', icon: 'shield_person' },
];

function navCls(active: boolean): string {
  return cx(
    'relative flex h-full items-center whitespace-nowrap px-4 font-display text-label-md uppercase transition-colors',
    active ? 'text-on-surface after:absolute after:bottom-0 after:left-3 after:right-3 after:h-1 after:bg-cat' : 'text-on-surface-muted hover:text-on-surface',
  );
}

/** Office frame (Caterpillar light theme): black header, 5-item nav, More menu, persona switcher. */
export function OfficeLayout() {
  const persona = usePersona();
  const loc = useLocation();
  useLightTheme(true);
  const showSources = useShowSources();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMore(false), [loc.pathname]);
  useEffect(() => {
    if (!more) return;
    const h = (e: MouseEvent) => moreRef.current && !moreRef.current.contains(e.target as Node) && setMore(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [more]);
  const is = (m: string[]) => m.some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`));
  const moreActive = MORE.some((m) => loc.pathname.startsWith(m.to)) && !is(['/incidents']);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="h-1 w-full bg-cat" />
      <header className="theme-dark sticky top-0 z-40 flex h-16 items-stretch gap-6 bg-black px-6 text-on-surface">
        <Link to="/" className="flex items-center">
          <Wordmark />
        </Link>
        <nav className="flex min-w-0 flex-1 items-stretch" aria-label="Main">
          {MAIN.map((n) => (
            <NavLink key={n.to} to={n.to} className={() => navCls(is(n.match))}>
              {n.label}
            </NavLink>
          ))}
          <div ref={moreRef} className="relative flex items-stretch">
            <button type="button" onClick={() => setMore((m) => !m)} className={navCls(moreActive)} aria-expanded={more}>
              More <Icon name={more ? 'expand_less' : 'expand_more'} size={18} />
            </button>
            {more && (
              <div className="absolute left-0 top-full z-50 w-64 border border-outline-variant bg-surface-container-high py-2">
                {MORE.map((m) => (
                  <NavLink key={m.to} to={m.to} className={({ isActive }) => cx('flex items-center gap-3 px-4 py-2.5 text-body-md hover:bg-surface-container-highest', isActive ? 'text-cat-text' : 'text-on-surface-variant')}>
                    <Icon name={m.icon} size={18} /> {m.label}
                  </NavLink>
                ))}
                <div className="my-2 border-t border-outline" />
                <button type="button" onClick={() => setShowSources(!showSources)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body-md text-on-surface-variant hover:bg-surface-container-highest">
                  <Icon name={showSources ? 'toggle_on' : 'toggle_off'} size={22} className={showSources ? 'text-cat-text' : ''} /> Show data sources
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <MockIndicator />
          <DemoRibbon />
          <label className="flex items-center gap-2" title={`${persona.name} · ${persona.title} (roles are mocked)`}>
            <span className="flex h-8 w-8 items-center justify-center bg-cat font-display text-label-md text-black">{persona.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
            <select aria-label="Viewing as (roles are mocked)" value={persona.role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 border-0 bg-transparent font-display text-label-sm uppercase text-on-surface-variant focus:outline-none">
              {Object.values(PERSONAS).map((p) => (
                <option key={p.role} value={p.role} className="bg-surface-container">
                  {p.role}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-8 py-8">
        <ErrorBoundary resetKey={loc.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="px-8 py-4 text-footnote text-on-surface-muted">
        <div className="mx-auto max-w-[1360px]">Prototype on simulated data · fictional people, machines and site.</div>
      </footer>
    </div>
  );
}
