import type { CompetencyState } from '../lib/types';
import { Icon, cx } from './ui';

const STATE: Record<CompetencyState, { label: string; cls: string; icon: string }> = {
  unassessed: { label: 'UNASSESSED', cls: 'border-comp-unassessed text-on-surface-muted', icon: 'radio_button_unchecked' },
  observed_gap: { label: 'GAP OBSERVED', cls: 'border-comp-gap text-warning-text bg-warning/10', icon: 'error' },
  in_training: { label: 'IN TRAINING', cls: 'border-comp-training text-comp-training bg-notice/15', icon: 'school' },
  improving: { label: 'IMPROVING', cls: 'border-comp-improving text-comp-improving bg-prov-ml/10', icon: 'trending_up' },
  demonstrated: { label: 'DEMONSTRATED', cls: 'border-comp-demonstrated text-comp-demonstrated bg-success/15', icon: 'verified' },
};

export const COMPETENCY_COLOR: Record<CompetencyState, string> = {
  unassessed: 'var(--chart-axis)',
  observed_gap: '#E56C00',
  in_training: '#0067B8',
  improving: '#1AC69E',
  demonstrated: '#197527',
};

export function competencyStateLabel(s: CompetencyState): string {
  return STATE[s]?.label ?? s;
}

/**
 * Competency state chip. DEMONSTRATED always shows who verified it (instructor initials) —
 * it is never set by ML.
 */
export function CompetencyChip({ state, verifiedBy, className }: { state: CompetencyState; verifiedBy?: string | null; className?: string }) {
  const s = STATE[state] ?? STATE.unassessed;
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded border px-1.5 font-display text-[11px] font-bold uppercase tracking-[0.05em]', s.cls, className)}>
      <Icon name={s.icon} size={14} fill={state === 'demonstrated'} />
      {s.label}
      {state === 'demonstrated' && verifiedBy && <span className="ml-0.5 border-l border-comp-demonstrated/60 pl-1 normal-case">✓ {verifiedBy}</span>}
    </span>
  );
}
