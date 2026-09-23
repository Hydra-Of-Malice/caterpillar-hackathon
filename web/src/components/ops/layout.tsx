/**
 * Minimal building blocks for the office operations pages (crew, incidents, tasks, behaviour, instructor):
 * flat white cards with generous padding, plain-language labels, a "Details" expander and quiet in-page tabs.
 */
import { useState, type ReactNode } from 'react';
import { Icon, cx } from '../ui';

/** One white card: optional title row, then content. No inner borders. */
export function Card({ title, sub, right, children, className, as = 'section' }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  const Tag = as;
  return (
    <Tag className={cx('panel rounded-lg p-6', className)}>
      {(title || right) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-headline-sm text-on-surface">{title}</h2>}
            {sub && <p className="mt-0.5 text-body-sm text-on-surface-muted">{sub}</p>}
          </div>
          {right && <div className="flex shrink-0 flex-wrap items-center gap-3">{right}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

/** Key number: small muted label, big value, optional one-line sub. */
export function Stat({ label, value, unit, sub, tone = 'neutral', className, onClick, active }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; tone?: 'neutral' | 'red' | 'orange' | 'green' | 'blue' | 'purple'; className?: string; onClick?: () => void; active?: boolean }) {
  const color = { neutral: 'text-on-surface', red: 'text-danger-text', orange: 'text-warning-text', green: 'text-success-text', blue: 'text-notice-dark', purple: 'text-escalation-text' }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cx('panel rounded-lg p-6 text-left', onClick && 'transition-colors hover:bg-surface-container-high', active && 'border-cat', className)}
    >
      <div className="text-body-sm text-on-surface-variant">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cx('font-display text-headline-lg leading-none tnum', color)}>{value}</span>
        {unit && <span className="font-display text-body-md text-on-surface-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-body-sm text-on-surface-muted">{sub}</div>}
    </Tag>
  );
}

/** Collapsible secondary content ("Details" link-style toggle). */
export function Details({ label = 'Details', children, className, defaultOpen = false }: { label?: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} />
        {label}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Quiet in-page tabs (sentence case, yellow underline on the active tab). */
export function InlineTabs<T extends string>({ value, options, onChange, className, label }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; className?: string; label?: string }) {
  return (
    <div className={cx('flex flex-wrap gap-6 border-b border-outline', className)} role="tablist" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative -mb-px pb-3 pt-1 text-body-md transition-colors duration-quick',
              on ? 'font-semibold text-on-surface after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-cat' : 'text-on-surface-muted hover:text-on-surface',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Thin progress bar (no box). */
export function Bar({ pct, tone = 'neutral', className }: { pct: number; tone?: 'neutral' | 'green' | 'blue' | 'orange'; className?: string }) {
  const color = { neutral: 'bg-on-surface-variant', green: 'bg-success', blue: 'bg-series-blue', orange: 'bg-warning' }[tone];
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Plain form label. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('text-body-sm text-on-surface-variant', className)}>{children}</span>;
}

/** Muted one-line caveat (no box). */
export function Caveat({ icon = 'info', children, className }: { icon?: string; children: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-start gap-2 text-body-sm text-on-surface-muted', className)}>
      <Icon name={icon} size={18} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

/** Hairline table style; wrap in <TableWrap> so rows run edge to edge inside a Card. */
export const TABLE = cx(
  'w-full text-body-md',
  '[&_th]:border-b [&_th]:border-outline [&_th]:px-3 [&_th]:pb-2 [&_th]:pt-0 [&_th]:text-left [&_th]:align-bottom [&_th]:text-body-sm [&_th]:font-normal [&_th]:text-on-surface-muted',
  '[&_td]:border-b [&_td]:border-outline [&_td]:px-3 [&_td]:py-3.5 [&_td]:align-middle',
  '[&_tbody_tr:last-child_td]:border-b-0',
  '[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6',
);

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('-mx-6 overflow-x-auto', className)}>{children}</div>;
}
