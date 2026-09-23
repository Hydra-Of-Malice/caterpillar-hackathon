/**
 * Primitive UI pieces in the Stitch "dark industrial" style: squared 4px corners, 1–2px borders,
 * tonal depth instead of shadows, Roboto Condensed uppercase labels, Cat Yellow only for primary.
 */
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createStore, useStore } from '../lib/store';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ icon (Material Symbols, bundled locally)
export function Icon({ name, className, size = 24, fill = false, title }: { name: string; className?: string; size?: number; fill?: boolean; title?: string }) {
  return (
    <span aria-hidden={title ? undefined : true} title={title} className={cx('material-symbols-outlined shrink-0', fill && 'icon-fill', className)} style={{ fontSize: size }}>
      {name}
    </span>
  );
}

// ------------------------------------------------------------------ wordmark (no official logo)
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sq = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const txt = size === 'lg' ? 'text-headline-lg' : size === 'sm' ? 'text-label-md' : 'text-headline-sm';
  return (
    <span className="flex shrink-0 items-center gap-2" aria-label="CAT Sentinel">
      <span className={cx('bg-cat', sq)} />
      <span className={cx('font-display font-bold uppercase tracking-wider text-on-surface', txt)}>CAT SENTINEL</span>
    </span>
  );
}

// ------------------------------------------------------------------ buttons
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'notice' | 'outline-yellow';
type Size = 'sm' | 'md' | 'lg' | 'cab' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-cat text-black border border-cat-border hover:bg-cat-hover active:bg-cat-active disabled:bg-outline disabled:text-on-surface-muted disabled:border-outline',
  secondary: 'bg-transparent text-on-surface border border-outline-strong hover:bg-surface-container-high hover:border-on-surface-muted disabled:text-on-surface-muted disabled:border-outline',
  danger: 'bg-danger text-white border border-danger hover:bg-danger-hover disabled:opacity-50',
  ghost: 'bg-transparent text-notice-dark border border-transparent hover:underline disabled:text-on-surface-muted',
  notice: 'bg-notice text-white border border-notice hover:brightness-110',
  'outline-yellow': 'bg-transparent text-cat-text border-2 border-cat hover:bg-cat/10',
};
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-label-sm gap-1.5',
  md: 'h-12 px-4 text-label-md gap-2',
  lg: 'h-14 px-5 text-label-lg gap-2',
  cab: 'h-16 min-w-[64px] px-6 text-headline-sm gap-3 border-2',
  xl: 'h-20 px-8 text-headline-md gap-3',
};

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  iconRight?: string;
  block?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, block, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center rounded font-display font-bold uppercase tracking-wider transition-colors duration-quick disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'cab' || size === 'xl' ? 28 : size === 'sm' ? 18 : 22} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 18 : 22} />}
    </button>
  );
}

// ------------------------------------------------------------------ panels
export function Panel({ children, className, accent, as = 'section' }: { children: ReactNode; className?: string; accent?: 'yellow' | 'green' | 'red' | 'blue' | 'purple' | 'orange'; as?: 'section' | 'div' | 'article' }) {
  const Tag = as;
  const bar = accent && { yellow: 'bg-cat', green: 'bg-success', red: 'bg-danger', blue: 'bg-notice', purple: 'bg-escalation', orange: 'bg-warning' }[accent];
  return (
    <Tag className={cx('panel relative', className)}>
      {bar && <span className={cx('absolute bottom-0 left-0 top-0 w-1', bar)} />}
      {children}
    </Tag>
  );
}

export function PanelHeader({ icon, title, right, className, sub }: { icon?: string; title: ReactNode; right?: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <header className={cx('flex items-center justify-between gap-3 px-6 pb-2 pt-5', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <Icon name={icon} size={22} className="text-on-surface-muted" />}
        <div className="min-w-0">
          <h2 className="truncate font-display text-headline-sm text-on-surface">{title}</h2>
          {sub && <p className="truncate text-body-sm text-on-surface-muted">{sub}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-display text-label-sm uppercase text-on-surface-muted', className)}>{children}</span>;
}

export function PageTitle({ kicker, title, sub, right }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        {kicker && <div className="mb-1 text-body-sm text-on-surface-muted">{kicker}</div>}
        <h1 className="font-display text-headline-lg text-on-surface">{title}</h1>
        {sub && <p className="mt-2 max-w-3xl text-body-md text-on-surface-variant">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ chips and bars
export function Chip({ children, className, icon, tone = 'neutral' }: { children: ReactNode; className?: string; icon?: string; tone?: 'neutral' | 'green' | 'red' | 'yellow' | 'orange' | 'blue' | 'purple' | 'teal' }) {
  const tones = {
    neutral: 'border-outline-variant text-on-surface-variant bg-surface-container-low',
    green: 'border-success text-success-text bg-success/10',
    red: 'border-danger text-danger-text bg-danger/10',
    yellow: 'border-caution text-caution bg-caution/10',
    orange: 'border-warning text-warning-text bg-warning/10',
    blue: 'border-notice-dark text-notice-dark bg-notice/10',
    purple: 'border-escalation text-escalation-text bg-escalation/10',
    teal: 'border-prov-ml text-prov-ml bg-prov-ml/10',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 font-display text-label-sm uppercase', tones[tone], className)}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function ProgressBar({ pct, tone = 'yellow', className, height = 'h-3' }: { pct: number; tone?: 'yellow' | 'green' | 'blue' | 'orange' | 'red' | 'teal'; className?: string; height?: string }) {
  const color = { yellow: 'bg-cat', green: 'bg-success', blue: 'bg-series-blue', orange: 'bg-warning', red: 'bg-danger', teal: 'bg-prov-ml' }[tone];
  return (
    <div className={cx('w-full bg-surface-container-high', height, className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full transition-all duration-long', color)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', className }: { value: T | null; options: Array<{ value: T; label: string; tone?: 'green' | 'red' | 'neutral' | 'yellow' | 'orange' }>; onChange: (v: T) => void; size?: 'md' | 'cab'; className?: string }) {
  const toneOn = { green: 'bg-success text-white', red: 'bg-danger text-white', neutral: 'bg-surface-container-highest text-on-surface', yellow: 'bg-cat text-black', orange: 'bg-warning text-black' };
  return (
    <div className={cx('inline-flex divide-x divide-outline border border-outline-variant bg-surface-container-lowest', className)} role="radiogroup">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'font-display font-bold uppercase tracking-wider transition-colors duration-quick',
              size === 'cab' ? 'h-16 min-w-[80px] px-4 text-label-lg' : 'h-11 min-w-[64px] px-3 text-label-md',
              on ? toneOn[o.tone ?? 'yellow'] : 'text-on-surface-muted hover:bg-surface-container-high hover:text-on-surface',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; size?: 'md' | 'cab' }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('flex shrink-0 items-center justify-center border-2 transition-colors', size === 'cab' ? 'h-12 w-12' : 'h-7 w-7', checked ? 'border-cat bg-cat text-black' : 'border-outline-strong bg-surface-container-lowest')}
      >
        {checked && <Icon name="check" size={size === 'cab' ? 32 : 20} className="font-bold" />}
      </button>
      <span className={cx('font-display uppercase tracking-wide', size === 'cab' ? 'text-label-lg' : 'text-label-md')}>{label}</span>
    </label>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-3">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cx('relative h-8 w-14 border-2 transition-colors', on ? 'border-cat bg-cat' : 'border-outline-strong bg-surface-container-lowest')}>
        <span className={cx('absolute top-0.5 h-6 w-6 transition-all duration-quick', on ? 'left-6 bg-black' : 'left-0.5 bg-on-surface-muted')} />
      </button>
      <span className="text-body-md">{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ states
export function EmptyState({ icon = 'inbox', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Icon name={icon} size={36} className="text-on-surface-muted" />
      <div className="font-display text-headline-sm text-on-surface-variant">{title}</div>
      {children && <div className="max-w-md text-body-sm text-on-surface-muted">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-6 text-on-surface-muted">
      <span className="h-2 w-2 animate-pulse bg-cat" />
      <span className="font-display text-label-md uppercase">{label}…</span>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const msg = error instanceof Error ? ((error as { detail?: string }).detail ?? error.message) : String(error);
  return (
    <div className="flex items-start gap-2 border border-danger bg-danger/10 px-3 py-2 text-body-sm text-danger-text">
      <Icon name="error" size={20} />
      <span>{msg}</span>
    </div>
  );
}

/** Local, offline placeholder for photos/videos (no remote stock images). */
export function MediaPlaceholder({ label, icon = 'image', className, ratio = 'aspect-video', children }: { label: string; icon?: string; className?: string; ratio?: string; children?: ReactNode }) {
  return (
    <div className={cx('placeholder-media relative flex items-center justify-center overflow-hidden border border-outline', ratio, className)}>
      {children ?? (
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <Icon name={icon} size={40} className="text-outline-strong" />
          <span className="font-display text-label-sm uppercase text-on-surface-muted">{label}</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ modal and drawer
export function Modal({ open, onClose, title, children, width = 'max-w-[900px]', footer, dismissible = true }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; footer?: ReactNode; dismissible?: boolean }) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose, dismissible]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" onMouseDown={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      <div className={cx('panel flex max-h-[92vh] w-full animate-fade-up flex-col', width)} style={{ boxShadow: '0 15px 40px rgba(0,0,0,.25)' }}>
        <header className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="font-display text-headline-md">{title}</h2>
          {dismissible && (
            <button type="button" onClick={onClose} className="flex h-12 w-12 items-center justify-center border border-outline text-on-surface-variant hover:bg-surface-container-high" aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 'w-[480px]', footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={cx('flex h-full max-w-full animate-slide-in flex-col border-l border-outline bg-surface-container', width)} style={{ boxShadow: '0 0 40px rgba(0,0,0,.2)' }} role="dialog" aria-modal="true">
        <header className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0 flex-1">{title}</div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center border border-outline text-on-surface-variant hover:bg-surface-container-high" aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-outline px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ toasts
interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'info' | 'error';
}
const toastStore = createStore<ToastItem[]>([]);
let toastSeq = 0;

export function toast(text: string, tone: ToastItem['tone'] = 'ok'): void {
  toastSeq += 1;
  const id = toastSeq;
  toastStore.set((t) => [...t, { id, text, tone }]);
  setTimeout(() => toastStore.set((t) => t.filter((x) => x.id !== id)), 4500);
}

export function Toaster() {
  const items = useStore(toastStore);
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'panel pointer-events-auto flex animate-fade-up items-center gap-3 border-l-4 px-5 py-3 text-body-md',
            t.tone === 'ok' && 'border-success',
            t.tone === 'info' && 'border-notice-dark',
            t.tone === 'error' && 'border-danger',
          )}
          role="status"
        >
          <Icon name={t.tone === 'ok' ? 'check_circle' : t.tone === 'error' ? 'error' : 'info'} className={t.tone === 'ok' ? 'text-success-text' : t.tone === 'error' ? 'text-danger-text' : 'text-notice-dark'} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
