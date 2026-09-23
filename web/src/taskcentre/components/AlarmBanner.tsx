/**
 * Global critical-alarm banner. Mounted once by the Task Centre layout, so it is visible on **every**
 * page — the operator must not have to be on the right screen to learn that a machine needs them.
 *
 * It polls `GET /tc/op/notifications` every few seconds and shows the newest notification with
 * `alarm = true` and no `acknowledged_at`. Accessibility: `role="alert"` + `aria-live="assertive"`,
 * an icon and words (never colour alone), and the sound is optional and mutable — never the only
 * channel. Acknowledging posts to the API; the banner does not clear itself locally on a failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, cx, toast } from '../../components/ui';
import { useDangerTone } from '../../lib/audio';
import { TcApiError, errorText, opApi } from '../api';
import { ALARM_MUTE_KEY, POLL, SIMULATED_NOTE } from '../constants';
import { useAuth } from '../auth';
import { fmtMetres } from '../time';
import type { Notification } from '../types';
import { GmtTime } from './GmtTime';

const ALARM_HEIGHT_VAR = '--tc-alarm-h';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(ALARM_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(v: boolean): void {
  try {
    localStorage.setItem(ALARM_MUTE_KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function AlarmBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [muted, setMuted] = useState(loadMuted);
  const [acking, setAcking] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  /** Set when the API says this role has no notification feed — stop polling instead of spamming. */
  const disabled = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (disabled.current) return;
    try {
      const list = await opApi.notifications({ quiet: true });
      setItems(list.filter((n) => n.alarm && !n.acknowledged_at).sort((a, b) => b.ts - a.ts));
      setPollError(null);
    } catch (e) {
      if (e instanceof TcApiError && (e.forbidden || e.missing || e.status === 401)) {
        disabled.current = true;
        setItems([]);
        return;
      }
      setPollError(errorText(e));
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      disabled.current = false;
      return;
    }
    disabled.current = false;
    void load();
    const id = setInterval(() => void load(), POLL.alarm);
    return () => clearInterval(id);
  }, [user, load]);

  const active = items[0] ?? null;

  // Publish the banner height so sticky page headers can sit below it.
  useEffect(() => {
    const h = active ? (barRef.current?.offsetHeight ?? 0) : 0;
    document.documentElement.style.setProperty(ALARM_HEIGHT_VAR, `${h}px`);
    document.body.style.paddingTop = h ? `${h}px` : '';
    return () => {
      document.documentElement.style.setProperty(ALARM_HEIGHT_VAR, '0px');
      document.body.style.paddingTop = '';
    };
  }, [active, active?.notification_id]);

  useDangerTone(!!active && !muted);

  const acknowledge = async () => {
    if (!active) return;
    setAcking(true);
    try {
      await opApi.ack(active.notification_id);
      setItems((prev) => prev.filter((n) => n.notification_id !== active.notification_id));
      toast('Alarm acknowledged', 'ok');
      void load();
    } catch (e) {
      toast(`Could not acknowledge: ${errorText(e)}`, 'error');
    } finally {
      setAcking(false);
    }
  };

  if (!user || !active) return null;

  const inc = active.incident;
  const remaining = items.length - 1;

  return (
    <div
      ref={barRef}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="fixed inset-x-0 top-0 z-[95] border-b-4 border-danger bg-danger text-white"
    >
      <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
        <Icon name="e911_emergency" size={32} className="shrink-0 animate-pulse-1hz" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-label-lg uppercase tracking-wider">Critical alarm</span>
            <span className="inline-flex items-center gap-1 border border-dashed border-white/80 px-2 py-0.5 font-display text-label-sm uppercase" title={SIMULATED_NOTE}>
              <Icon name="science" size={14} />
              Simulated
            </span>
            <span className="text-body-sm opacity-90">
              <GmtTime ts={active.ts} gmt={active.ts_gmt} mode="smart" />
            </span>
            {remaining > 0 && <span className="text-body-sm opacity-90">· {remaining} more waiting</span>}
          </div>
          <p className="mt-1 font-display text-headline-sm">{active.title}</p>
          {active.body && <p className="text-body-md opacity-95">{active.body}</p>}
          {inc && (
            <p className="mt-1 text-body-sm opacity-95">
              {inc.machine_id} · {inc.kind.replace(/_/g, ' ')}
              {typeof inc.nearest_distance_m === 'number' && <> · {fmtMetres(inc.nearest_distance_m)} away</>}
              {inc.dispatch_status === 'no_eligible_operator' && <> · no eligible operator was found — supervisor and admin were alerted</>}
              {inc.detail && <> · {inc.detail}</>}
            </p>
          )}
          {pollError && <p className="mt-1 text-body-sm opacity-90">Alarm refresh is failing ({pollError}) — this banner may be out of date.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {active.link && (
            <button
              type="button"
              onClick={() => navigate(active.link as string)}
              className="flex h-9 items-center gap-1 border border-white px-3 font-display text-label-sm uppercase text-white hover:bg-white/10"
            >
              <Icon name="open_in_new" size={18} />
              Open
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              saveMuted(next);
            }}
            aria-pressed={muted}
            title={muted ? 'Alarm sound is off — the banner stays visible' : 'Mute the alarm sound (the banner stays visible)'}
            className={cx('flex h-9 items-center gap-1 border px-3 font-display text-label-sm uppercase', muted ? 'border-white/60 text-white/80' : 'border-white text-white')}
          >
            <Icon name={muted ? 'volume_off' : 'volume_up'} size={18} />
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <Button variant="primary" size="md" icon="check" onClick={() => void acknowledge()} disabled={acking}>
            {acking ? 'Sending…' : 'Acknowledge'}
          </Button>
        </div>
      </div>
    </div>
  );
}
