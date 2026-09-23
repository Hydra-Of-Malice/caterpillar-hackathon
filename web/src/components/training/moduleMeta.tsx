import { titleCase } from '../../lib/format';
import type { CompetencyState } from '../../lib/types';
import { CompetencyChip } from '../CompetencyChip';
import { Chip, Icon, cx } from '../ui';

export const FORMAT_OPTIONS = [
  { value: 'video', label: 'Video', icon: 'play_circle' },
  { value: 'micro_lesson', label: 'Micro-lesson', icon: 'menu_book' },
  { value: 'scenario_quiz', label: 'Scenario quiz', icon: 'quiz' },
  { value: 'simulator', label: 'Simulator', icon: 'sports_esports' },
] as const;

export function formatLabel(f: string | undefined | null): string {
  if (!f) return 'Module';
  return FORMAT_OPTIONS.find((o) => o.value === f)?.label ?? titleCase(f);
}

export function formatIcon(f: string | undefined | null): string {
  return FORMAT_OPTIONS.find((o) => o.value === f)?.icon ?? 'school';
}

const FORMAT_TONE: Record<string, 'orange' | 'teal' | 'purple' | 'blue'> = {
  video: 'orange',
  micro_lesson: 'teal',
  scenario_quiz: 'purple',
  simulator: 'blue',
};

export function FormatChip({ format, className }: { format: string | undefined | null; className?: string }) {
  return (
    <Chip tone={FORMAT_TONE[format ?? ''] ?? 'neutral'} icon={formatIcon(format)} className={cx('bg-surface-container-lowest/90', className)}>
      {formatLabel(format)}
    </Chip>
  );
}

export const MACHINE_TYPE_LABEL: Record<string, string> = {
  'EX-20t': 'Excavator 20 t',
};

export function machineTypeLabel(t: string): string {
  return MACHINE_TYPE_LABEL[t] ?? t;
}

const COMP_STATES: CompetencyState[] = ['unassessed', 'observed_gap', 'in_training', 'improving', 'demonstrated'];

/** Module status: completed / not started, or the competency state that drives it. Never "ML". */
export function ModuleStatusChip({ status }: { status: string | undefined | null }) {
  const s = (status ?? '').toLowerCase();
  if (s === 'passed' || s === 'completed' || s === 'demonstrated') {
    return (
      <Chip tone="green" icon="task_alt">
        Completed
      </Chip>
    );
  }
  if (!s || s === 'not_started' || s === 'unassessed') {
    return <Chip icon="radio_button_unchecked">Not started</Chip>;
  }
  if (COMP_STATES.includes(s as CompetencyState)) return <CompetencyChip state={s as CompetencyState} />;
  return <Chip>{titleCase(s)}</Chip>;
}

/** Quiet line "Instructor approved · M. Lee · v1.2" (content approval by a named instructor). */
export function ApprovedChip({ version, approvedAt, approvedBy, className }: { version?: string; approvedAt?: string; approvedBy?: string; className?: string }) {
  const parts = ['Instructor approved', approvedBy, version].filter(Boolean).join(' · ');
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-body-sm text-success-text', className)} title={approvedAt ? `Approved ${approvedAt}` : undefined}>
      <Icon name="verified_user" size={16} />
      {parts}
    </span>
  );
}
