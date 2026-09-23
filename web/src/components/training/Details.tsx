import { useState, type ReactNode } from 'react';
import { Icon, cx } from '../ui';

/** Section heading used across the training pages: condensed bold title, optional muted line and right slot. */
export function SectionTitle({ children, sub, right, className, as: Tag = 'h2' }: { children: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string; as?: 'h2' | 'h3' }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-x-4 gap-y-1', className)}>
      <div className="min-w-0">
        <Tag className="font-display text-headline-sm text-on-surface">{children}</Tag>
        {sub && <p className="text-body-sm text-on-surface-muted">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
    </div>
  );
}

/** Quiet "Details" toggle (text + chevron). */
export function DetailsButton({ open, onClick, label = 'Details', className }: { open: boolean; onClick: () => void; label?: string; className?: string }) {
  return (
    <button type="button" aria-expanded={open} onClick={onClick} className={cx('inline-flex items-center gap-0.5 text-body-sm font-semibold text-notice-dark hover:underline', className)}>
      {label}
      <Icon name={open ? 'expand_less' : 'expand_more'} size={20} />
    </button>
  );
}

/** Secondary content hidden behind a "Details" toggle. */
export function Details({ children, label = 'Details', defaultOpen = false, className }: { children: ReactNode; label?: string; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <DetailsButton open={open} onClick={() => setOpen((v) => !v)} label={label} />
      {open && <div className="mt-4 animate-fade-up">{children}</div>}
    </div>
  );
}
