import { NavLink } from 'react-router-dom';
import { Icon, cx } from '../ui';

const ITEMS = [
  { to: '/cab/home', icon: 'home', label: 'Home' },
  { to: '/cab/operate', icon: 'speed', label: 'Operate' },
  { to: '/cab/checklist', icon: 'fact_check', label: 'Checklist' },
  { to: '/incidents?operator_id=OP-1042', icon: 'warning', label: 'Log' },
  { to: '/training', icon: 'school', label: 'Training' },
  { to: '/cab/review', icon: 'timeline', label: 'Review' },
];

/** In-cab left navigation rail (96 px, icon above label, 64 px targets). */
export function LeftNavRail() {
  return (
    <aside className="flex w-24 shrink-0 flex-col border-r border-outline bg-surface-container py-2">
      <nav className="flex flex-col gap-1" aria-label="In-cab">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              cx(
                'flex min-h-[72px] flex-col items-center justify-center gap-1 border-l-4 px-1 transition-colors duration-quick',
                isActive ? 'border-cat bg-surface-container-highest text-cat-text' : 'border-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
              )
            }
          >
            <Icon name={it.icon} size={30} />
            <span className="font-display text-label-sm uppercase">{it.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
