/**
 * Loading / empty / error states with Task Centre copy.
 *
 * The rule these encode: when a call fails, the screen says so. It never falls back to invented
 * rows, because a safety tool that shows plausible-looking data when it has none is worse than one
 * that shows nothing.
 */
import type { ReactNode } from 'react';
import { Button, EmptyState, Icon, cx } from '../../components/ui';
import { TC_BASE, TcApiError } from '../api';

export function TcLoading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2 px-4 py-6 text-on-surface-muted', className)} role="status" aria-live="polite">
      <span className="h-2 w-2 animate-pulse bg-cat" />
      <span className="font-display text-label-md uppercase">{label}…</span>
    </div>
  );
}

/** Empty state with Task Centre wording; `what` names the thing that has none. */
export function TcEmpty({ icon = 'inbox', title, children, className }: { icon?: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <EmptyState icon={icon} title={title}>
        {children}
      </EmptyState>
    </div>
  );
}

/** Marker error for client-side validation messages routed through <TcError>. */
export class TcArgError extends Error {}

function explain(error: unknown, what: string): { headline: string; body: string; icon: string } {
  if (error instanceof TcArgError) return { headline: what, body: error.message, icon: 'error' };
  if (error instanceof TcApiError) {
    if (error.offline) return { headline: `${what} is unavailable`, body: `${error.detail} Start the cloud service and try again — nothing is shown from cache or fixtures.`, icon: 'cloud_off' };
    if (error.missing) return { headline: `${what} is not available yet`, body: `This endpoint is not implemented on the running API (${error.endpoint}). No stand-in data is shown.`, icon: 'construction' };
    if (error.forbidden) return { headline: 'Permission denied', body: `${error.detail} The API refused this request for your role.`, icon: 'lock' };
    if (error.status === 409) return { headline: 'Blocked by a rule', body: error.detail, icon: 'block' };
    return { headline: `${what} could not be loaded`, body: `${error.detail} (${error.endpoint})`, icon: 'error' };
  }
  const msg = error instanceof Error ? error.message : String(error);
  return { headline: `${what} could not be loaded`, body: msg, icon: 'error' };
}

export function TcError({ error, what = 'This view', onRetry, className }: { error: unknown; what?: string; onRetry?: () => void; className?: string }) {
  const { headline, body, icon } = explain(error, what);
  return (
    <div className={cx('flex flex-col gap-3 border border-danger bg-danger/10 px-4 py-4 text-danger-text', className)} role="alert">
      <div className="flex items-start gap-2">
        <Icon name={icon} size={22} className="mt-0.5" />
        <div className="min-w-0">
          <div className="font-display text-label-lg uppercase">{headline}</div>
          <p className="mt-1 text-body-sm">{body}</p>
          <p className="mt-1 text-body-sm opacity-80">API: {TC_BASE}</p>
        </div>
      </div>
      {onRetry && (
        <div>
          <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * One-line inline warning for a panel that lost its poll but still shows the last successful
 * response. Says plainly that the figures are not live.
 */
export function StaleDataNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const detail = error instanceof TcApiError ? error.detail : String(error);
  return (
    <p className={cx('flex items-start gap-2 text-body-sm text-warning-text', className)} role="status">
      <Icon name="sync_problem" size={18} className="mt-0.5" />
      <span>Showing the last successful response — the live refresh is failing. {detail}</span>
    </p>
  );
}

/** Placeholder for something the prototype does not provide (e.g. a real camera stream). */
export function NotAvailable({ title, detail, icon = 'videocam_off', className }: { title: string; detail?: string; icon?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 border border-dashed border-outline-variant bg-surface-container-high px-4 py-8 text-center', className)}>
      <Icon name={icon} size={32} className="text-on-surface-muted" />
      <div className="font-display text-label-md uppercase text-on-surface-variant">{title}</div>
      {detail && <p className="max-w-sm text-body-sm text-on-surface-muted">{detail}</p>}
    </div>
  );
}
