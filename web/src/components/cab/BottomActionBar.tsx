import { useNavigate } from 'react-router-dom';
import { Icon, toast } from '../ui';

/** In-cab bottom action bar (80 px): LOG INCIDENT · TAKE BREAK · CALL SUPERVISOR (radio). No machine control. */
export function BottomActionBar({ onLogIncident }: { onLogIncident: () => void }) {
  const nav = useNavigate();
  const btn = 'flex h-16 flex-1 items-center justify-center gap-3 border-2 border-outline-variant bg-surface-container-high font-display text-headline-sm uppercase text-on-surface transition-colors duration-quick hover:bg-surface-container-highest';
  return (
    <footer className="flex h-20 shrink-0 items-center gap-4 border-t border-outline bg-surface-container px-6">
      <button type="button" className={`${btn} hover:border-warning`} onClick={onLogIncident}>
        <Icon name="report_problem" size={28} className="text-warning" /> Log incident
      </button>
      <button
        type="button"
        className={`${btn} hover:border-cat`}
        onClick={() => nav('/cab/break')}
      >
        <Icon name="coffee" size={28} className="text-cat-text" /> Take break
      </button>
      <button type="button" className={`${btn} hover:border-notice-dark`} onClick={() => toast('Radio: calling supervisor Priya Nair on channel 3 (MOCK)', 'info')}>
        <Icon name="radio" size={28} className="text-notice-dark" /> Call supervisor
      </button>
    </footer>
  );
}
