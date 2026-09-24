/**
 * The operator's full-screen alert, raised when their supervisor acts on a flag about them.
 *
 * Deliberately harder to miss than the standing alarm banner: this one covers the screen, because
 * the situation it exists for is an operator who is *not looking at their phone*. It carries the
 * supervisor's own words and what the flag was about, so the first thing they read is what this is
 * for rather than only that somebody is unhappy with them.
 *
 * **The noise is time-boxed; the screen is not.** The sound runs for `alert_seconds` (30 by default)
 * or until they switch it off, whichever comes first, and the panel stays until they acknowledge.
 * An alarm that cannot be silenced is one people learn to ignore, and an operator silencing a phone
 * mid-task is exactly the distraction this is supposed to prevent — but a message that clears itself
 * before it is read has not been delivered.
 *
 * Nothing here controls a machine. It is a message to a person, and it says so.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Icon, cx, toast } from '../../components/ui';
import { useDangerTone } from '../../lib/audio';
import { errorText, opApi } from '../api';
import { ALARM_MUTE_KEY } from '../constants';
import type { Notification } from '../types';
import { LocalTime } from './LocalTime';

/** Matches `ALERT_SECONDS` in `sentinel/taskcentre/routes_supervisor.py`. */
const DEFAULT_SECONDS = 30;

function loadMuted(): boolean {
  try {
    return localStorage.getItem(ALARM_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function SupervisorAlert({ alert, onAcknowledged }: { alert: Notification; onAcknowledged: () => void }) {
  const [left, setLeft] = useState(DEFAULT_SECONDS);
  const [silenced, setSilenced] = useState(loadMuted);
  const [acking, setAcking] = useState(false);
  const startedAt = useRef<number>(Date.now());

  // Count down from when this alert first appeared, not from every re-render.
  useEffect(() => {
    startedAt.current = Date.now();
    setLeft(DEFAULT_SECONDS);
    setSilenced(loadMuted());
    const id = setInterval(() => {
      const gone = Math.floor((Date.now() - startedAt.current) / 1000);
      setLeft(Math.max(0, DEFAULT_SECONDS - gone));
    }, 250);
    return () => clearInterval(id);
  }, [alert.notification_id]);

  useDangerTone(!silenced && left > 0);

  const acknowledge = async () => {
    setAcking(true);
    try {
      await opApi.ack(alert.notification_id);
      onAcknowledged();
    } catch (e) {
      toast(`Could not acknowledge: ${errorText(e)}`, 'error');
      setAcking(false);
    }
  };

  const ringing = left > 0 && !silenced;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-labelledby="sup-alert-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4"
    >
      <div className="flex w-full max-w-[560px] flex-col border-4 border-warning bg-surface-container">
        {/* banner */}
        <div className="flex items-center gap-3 bg-warning px-5 py-4 text-black">
          <Icon name="campaign" size={36} className={cx('shrink-0', ringing && 'animate-pulse-1hz')} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-label-lg uppercase tracking-wider">Message from your supervisor</p>
            <p className="text-body-sm">
              <LocalTime ts={alert.ts} gmt={alert.ts_gmt} mode="smart" />
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <h2 id="sup-alert-title" className="font-display text-headline-md text-on-surface">
            {alert.title}
          </h2>

          {alert.body && <p className="text-body-lg text-on-surface-variant">{alert.body}</p>}

          <p className="border-l-4 border-cat bg-surface-container-high px-4 py-3 font-display text-headline-sm uppercase tracking-wide text-on-surface">
            Get back to work
          </p>

          <p className="text-body-sm text-on-surface-muted">
            If something is stopping you, tap <strong className="text-on-surface-variant">Waiting</strong> on your Today screen
            or message your supervisor — declared waiting is recorded as waiting, not as your idle time.
          </p>

          <p className="text-footnote text-on-surface-muted">
            This is a message from a person. It does not control the machine, and no penalty has been applied.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline px-5 py-4">
          <span className="text-body-sm text-on-surface-muted" aria-live="polite">
            {ringing ? `Sounding for ${left} s` : 'Sound off'}
          </span>
          <div className="flex flex-wrap gap-2">
            {ringing && (
              <Button size="md" icon="volume_off" onClick={() => setSilenced(true)}>
                Silence
              </Button>
            )}
            <Button variant="primary" size="md" icon="check" disabled={acking} onClick={() => void acknowledge()}>
              {acking ? 'Sending…' : 'I am on it'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SupervisorAlert;
