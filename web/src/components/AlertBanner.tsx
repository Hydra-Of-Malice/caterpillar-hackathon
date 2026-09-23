import { useState } from 'react';
import { useDangerTone, useWarningChime } from '../lib/audio';
import type { Alert } from '../lib/types';
import { ExplanationBars } from './ExplanationBars';
import { ProvenanceBadges } from './ProvenanceBadge';
import { SIGNAL_STYLE, SignalIcon, normaliseSignalWord } from './SignalWordChip';
import { Button, Icon, cx } from './ui';

export interface AlertActions {
  onAck?: (a: Alert) => void;
  onNotCorrect?: (a: Alert) => void;
  onStartBreak?: (a: Alert) => void;
  onSnooze?: (a: Alert) => void;
  snoozeUsed?: boolean;
}

/**
 * The single in-cab ALERT SLOT. One banner at a time with a "+N queued" counter.
 * WHAT (32px) / WHY (18px) / DO (one action) + source badges. DANGER has no dismiss control,
 * pulses at ≤ 1 Hz and plays a tone; WARNING needs ACKNOWLEDGE; CAUTION auto-clears.
 */
export function AlertBanner({ alert, queued = 0, actions = {}, height = 'min-h-[112px]', quietText = 'All clear' }: { alert: Alert | null; queued?: number; actions?: AlertActions; height?: string; quietText?: string }) {
  const [why, setWhy] = useState(false);
  const word = alert ? normaliseSignalWord(alert.signal_word, alert.tier) : null;
  useDangerTone(word === 'DANGER');
  useWarningChime(word === 'WARNING' ? alert?.alert_id ?? null : null);

  if (!alert || !word) {
    return (
      <div className={cx('panel relative flex w-full items-center gap-5 px-6', height)} role="status" aria-live="polite">
        <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-success" />
        <span className="h-5 w-5 rounded-full bg-success" />
        <div className="font-display text-headline-lg uppercase">{quietText}</div>
      </div>
    );
  }

  const s = SIGNAL_STYLE[word];
  const isDanger = word === 'DANGER';
  const isBreak = alert.tier === 'T3';
  const needsAck = alert.requires_ack && !isDanger && !isBreak;
  const dark = s.text === 'text-black';
  const clearsWhen = /seatbelt/i.test(alert.what) ? 'Clears when fastened' : 'Clears when the condition ends';

  return (
    <div className="relative w-full" role="alert" aria-live="assertive">
      <div className={cx('relative flex w-full items-center gap-5 px-6 py-3', height, s.bg, s.text, isDanger && 'animate-pulse-1hz')}>
        <div className="flex shrink-0 flex-col items-center gap-1">
          {isBreak ? <Icon name="coffee" size={56} /> : <SignalIcon word={word} size={60} fill={isDanger ? '#C52320' : 'none'} />}
          <span className="font-display text-label-md font-bold uppercase">{word}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-headline-lg uppercase leading-tight">{alert.what}</div>
          <div className="text-body-lg leading-snug opacity-95">{alert.why}</div>
          <div className="mt-1 flex items-center gap-2 font-display text-headline-sm uppercase">
            <Icon name="arrow_forward" size={22} />
            {alert.do}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <ProvenanceBadges kinds={alert.provenance.filter((p) => p !== 'SIMULATED')} className={cx(dark ? '[&>span]:border-black [&>span]:text-black' : '[&>span]:border-white [&>span]:text-white')} />
            {queued > 0 && <span className={cx('border px-2 py-0.5 font-display text-label-md uppercase', dark ? 'border-black' : 'border-white')}>+{queued} queued</span>}
          </div>
          {isDanger && (
            <div className="flex items-center gap-2 font-display text-label-lg uppercase">
              <Icon name="volume_up" size={26} />
              {clearsWhen}
            </div>
          )}
          {needsAck && (
            <div className="flex items-center gap-3">
              {alert.explanation.length > 0 && (
                <button type="button" onClick={() => setWhy((w) => !w)} className={cx('flex h-12 items-center gap-1 border-2 px-3 font-display text-label-lg uppercase', dark ? 'border-black' : 'border-white')} aria-expanded={why}>
                  WHY? <Icon name={why ? 'expand_less' : 'expand_more'} size={22} />
                </button>
              )}
              <Button variant="secondary" size="md" className="h-12" onClick={() => actions.onNotCorrect?.(alert)}>
                Not correct?
              </Button>
              <Button variant="primary" size="cab" icon="check" className="border-2 border-black" onClick={() => actions.onAck?.(alert)}>
                Acknowledge
              </Button>
            </div>
          )}
          {isBreak && (
            <div className="flex items-center gap-3">
              {!actions.snoozeUsed && (
                <Button variant="secondary" size="lg" className="h-16" onClick={() => actions.onSnooze?.(alert)}>
                  Remind me in 10 min
                </Button>
              )}
              <Button variant="primary" size="cab" icon="coffee" className="border-2 border-black" onClick={() => actions.onStartBreak?.(alert)}>
                Start break
              </Button>
            </div>
          )}
          {word === 'CAUTION' && <span className="font-display text-label-md uppercase opacity-80">Clears automatically</span>}
        </div>
      </div>
      {why && alert.explanation.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 border-2 border-t-0 border-warning bg-surface-container-high p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-label-lg uppercase">Why this alert — compared with your usual truck-loading range</span>
            <ProvenanceBadges kinds={alert.provenance} />
          </div>
          <ExplanationBars items={alert.explanation} />
        </div>
      )}
    </div>
  );
}

/** Compact banner used on non-Operate cab screens so DANGER is never hidden. */
export function CompactDangerStrip({ alert }: { alert: Alert }) {
  useDangerTone(true);
  return (
    <div className="flex animate-pulse-1hz items-center gap-4 bg-danger px-5 py-2 text-white" role="alert">
      <SignalIcon word="DANGER" size={36} />
      <span className="font-display text-headline-md uppercase">{alert.what}</span>
      <span className="text-body-lg">{alert.do}</span>
      <span className="ml-auto flex items-center gap-1 font-display text-label-md uppercase">
        <Icon name="volume_up" /> DANGER · RULE
      </span>
    </div>
  );
}
