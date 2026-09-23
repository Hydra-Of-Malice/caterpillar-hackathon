/**
 * The operator's notifications, including simulated safety prompts with an acknowledge action.
 * The always-on critical alarm banner is `TcLayout`'s job — this is only the list of what arrived.
 */
import { useState } from 'react';
import { opApi, errorText } from '../../api';
import { POLL, SIMULATED_NOTE } from '../../constants';
import { GmtTime, SimulatedChip, TcEmpty, TcError, TcLoading } from '../../components';
import { Button, Icon, cx } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import type { Notification } from '../../types';
import { Note, TOUCH_BIG } from './common';

const ICON: Record<string, string> = {
  critical_incident: 'e911_emergency',
  fatigue: 'bedtime',
  ticket: 'flag',
  chat: 'forum',
  task: 'assignment',
  info: 'info',
};

/** In this prototype these kinds come from simulated detectors, so they are labelled as such. */
const SIMULATED_KINDS = new Set(['fatigue', 'critical_incident']);

function tone(n: Notification): 'danger' | 'warn' | 'info' {
  if (n.alarm || n.severity === 'critical') return 'danger';
  if (n.severity === 'high' || n.severity === 'medium') return 'warn';
  return 'info';
}

export function NotificationsPanel() {
  const r = useResource<Notification[]>(() => opApi.notifications(), [], POLL.operator);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const items = [...(r.data ?? [])].sort((a, b) => b.ts - a.ts);

  const ack = async (n: Notification) => {
    const before = r.data ?? [];
    setBusy(n.notification_id);
    setFailed(null);
    r.setData(before.map((x) => (x.notification_id === n.notification_id ? { ...x, acknowledged_at: Date.now() / 1000 } : x)));
    try {
      await opApi.ack(n.notification_id);
      r.reload();
    } catch (e) {
      r.setData(before);
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (r.loading && !r.data) return <TcLoading label="Loading alerts" />;
  if (r.error && !r.data) return <TcError error={r.error} what="Your alerts" onRetry={r.reload} />;

  return (
    <section className="space-y-3" aria-label="Your alerts">
      {failed && (
        <Note tone="danger" title="Not acknowledged" role="alert">
          {failed}
        </Note>
      )}
      {items.length === 0 && (
        <div className="panel">
          <TcEmpty icon="notifications_off" title="Nothing to read">
            Safety prompts and messages from the system appear here.
          </TcEmpty>
        </div>
      )}
      {items.map((n) => {
        const t = tone(n);
        const border = { danger: 'border-l-danger', warn: 'border-l-warning', info: 'border-l-outline-strong' }[t];
        const text = { danger: 'text-danger-text', warn: 'text-warning-text', info: 'text-on-surface-muted' }[t];
        return (
          <article key={n.notification_id} className={cx('panel border-l-4 p-4', border)}>
            <div className="flex items-start gap-3">
              <Icon name={ICON[n.kind] ?? 'notifications'} size={28} className={text} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-headline-sm text-on-surface">{n.title}</h3>
                  {SIMULATED_KINDS.has(n.kind) && <SimulatedChip />}
                </div>
                {n.body && <p className="mt-1 text-body-lg text-on-surface-variant">{n.body}</p>}
                {n.kind === 'fatigue' && <p className="mt-2 text-body-md text-on-surface-muted">{SIMULATED_NOTE} Take a break if you need one.</p>}
                <div className="mt-2 font-display text-label-sm uppercase text-on-surface-muted">
                  <GmtTime ts={n.ts} gmt={n.ts_gmt} mode="smart" />
                </div>
              </div>
            </div>
            {n.acknowledged_at ? (
              <p className="mt-3 flex items-center gap-2 font-display text-label-md uppercase text-success-text">
                <Icon name="check_circle" size={20} /> Acknowledged <GmtTime ts={n.acknowledged_at} />
              </p>
            ) : (
              <Button
                variant="primary"
                size="cab"
                icon="check"
                block
                className={cx('mt-3', TOUCH_BIG)}
                disabled={busy === n.notification_id}
                onClick={() => void ack(n)}
              >
                {busy === n.notification_id ? 'Sending…' : 'I have seen this'}
              </Button>
            )}
          </article>
        );
      })}
    </section>
  );
}
