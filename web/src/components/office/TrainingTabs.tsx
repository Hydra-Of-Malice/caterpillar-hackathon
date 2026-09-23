import { NavLink } from 'react-router-dom';
import { cx } from '../ui';

interface Tab {
  to: string;
  label: string;
  end?: boolean;
}

/** Section tabs (yellow 4 px underline on the active tab). */
export function SectionTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  return (
    <nav className="-mt-2 flex flex-wrap gap-1 border-b border-outline" aria-label={label}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cx(
              'relative px-4 py-3 font-display text-label-md uppercase transition-colors',
              isActive ? 'text-on-surface after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-1 after:bg-cat' : 'text-on-surface-muted hover:text-on-surface',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

const TRAINING: Tab[] = [
  { to: '/training', label: 'Hub', end: true },
  { to: '/training/practice', label: 'Practice' },
  { to: '/training/effectiveness', label: 'Effectiveness' },
  { to: '/training/effect', label: 'Results' },
  { to: '/training/booking', label: 'Booking' },
];

const SUPERVISOR: Tab[] = [
  { to: '/supervisor', label: 'Crew', end: true },
  { to: '/incidents', label: 'Incidents' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/anomaly', label: 'Behaviour & idle' },
];

export function TrainingTabs() {
  return <SectionTabs tabs={TRAINING} label="Training sections" />;
}

export function SupervisorTabs() {
  return <SectionTabs tabs={SUPERVISOR} label="Supervisor sections" />;
}
