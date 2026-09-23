/**
 * Shared chrome for the operator screens: one column, large touch targets, generous type.
 *
 * `TcLayout` already supplies the header and the always-on critical alarm banner, so nothing here
 * is fixed or sticky at the top of the viewport — the banner must never be covered.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, cx } from '../../../components/ui';

/** Minimum touch heights: ordinary controls 48px, primary actions 64px. */
export const TOUCH = 'min-h-[48px]';
export const TOUCH_BIG = 'min-h-[64px]';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Advisory block: always an icon *and* words, so colour is never the only signal. */
export function Note({
  tone = 'info',
  icon,
  title,
  children,
  role = 'status',
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  icon?: string;
  title: ReactNode;
  children?: ReactNode;
  role?: 'status' | 'alert';
}) {
  const style = {
    info: 'border-notice-dark bg-notice/10 text-notice-dark',
    warn: 'border-warning bg-warning/10 text-warning-text',
    danger: 'border-danger bg-danger/10 text-danger-text',
    ok: 'border-success bg-success/10 text-success-text',
  }[tone];
  const fallback = { info: 'info', warn: 'warning', danger: 'error', ok: 'check_circle' }[tone];
  return (
    <div className={cx('flex items-start gap-3 border-2 px-4 py-3', style)} role={role}>
      <Icon name={icon ?? fallback} size={26} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-label-lg uppercase">{title}</div>
        {children && <div className="mt-1 text-body-md text-on-surface">{children}</div>}
      </div>
    </div>
  );
}

export function OfflineNote() {
  return (
    <Note tone="warn" icon="wifi_off" title="You are offline">
      What you see was loaded earlier. Anything you send now will fail until the signal is back.
    </Note>
  );
}

/** A labelled value in a status strip. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-label-sm uppercase text-on-surface-muted">{label}</div>
      <div className="mt-0.5 text-body-lg text-on-surface">{children}</div>
    </div>
  );
}

/** Page frame: optional back link, one big title, then the content. */
export function OpPage({
  title,
  sub,
  back,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-10 pt-4">
      <header className="pb-3">
        {back && (
          <Link
            to={back.to}
            className={cx('-ml-2 inline-flex items-center gap-2 px-2 font-display text-label-lg uppercase text-on-surface-variant', TOUCH)}
          >
            <Icon name="arrow_back" size={26} />
            {back.label}
          </Link>
        )}
        <h1 className="font-display text-headline-lg text-on-surface">{title}</h1>
        {sub && <p className="mt-1 text-body-md text-on-surface-muted">{sub}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
