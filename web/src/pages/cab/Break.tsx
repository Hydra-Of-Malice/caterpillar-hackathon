import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, cx, toast } from '../../components/ui';
import { edge } from '../../lib/api';
import { fmtClock, fmtCountdown } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { liveNow } from '../../lib/live';
import { reloadShift } from '../../lib/shift';

const BREAK_S = 600;
const KSS = [
  'Extremely alert', 'Very alert', 'Alert', 'Rather alert', 'Neither alert nor sleepy',
  'Some signs of sleepiness', 'Sleepy, no effort to stay awake', 'Sleepy, some effort to stay awake', 'Very sleepy, fighting sleep',
];

/** Screen 7 — Break: 10-minute countdown, four suggestions, optional alertness rating (collapsed). */
export default function BreakScreen() {
  useNow(500);
  const nav = useNavigate();
  const startedAt = useRef(Date.now());
  const startedTs = useRef(liveNow());
  const [kss, setKss] = useState<number | null>(null);
  const [rate, setRate] = useState(false);
  const [ending, setEnding] = useState(false);
  const left = BREAK_S - (Date.now() - startedAt.current) / 1000;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void edge.breakStart().catch(() => undefined);
  }, []);

  const end = async () => {
    setEnding(true);
    await edge.breakEnd(kss).catch(() => undefined);
    await reloadShift();
    toast(`Break logged ${fmtClock(startedTs.current)} · operating timer reset`);
    nav('/cab/home');
  };

  const tips: Array<[string, string]> = [
    ['water_drop', 'Drink water'],
    ['self_improvement', 'Stretch'],
    ['directions_walk', 'Walk around the machine'],
    ['map', 'Check the site plan'],
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 p-8">
      <div className="text-center">
        <div className="font-display text-headline-md uppercase text-on-surface-muted">Break</div>
        <div className={cx('font-display text-[140px] font-bold leading-none tnum', left <= 0 && 'text-success-text')}>{fmtCountdown(Math.max(0, left))}</div>
      </div>

      <ul className="flex flex-wrap justify-center gap-10 text-body-lg">
        {tips.map(([icon, t]) => (
          <li key={t} className="flex items-center gap-3">
            <Icon name={icon} size={30} className="text-on-surface-muted" /> {t}
          </li>
        ))}
      </ul>

      <div className="flex gap-4">
        <Button variant="secondary" size="cab" icon="radio" onClick={() => toast('Radio: calling supervisor Priya Nair (MOCK)', 'info')}>
          Call supervisor
        </Button>
        <Button variant="primary" size="cab" icon="play_arrow" disabled={ending} onClick={end}>
          End break
        </Button>
      </div>

      <div className="w-full max-w-[760px]">
        <button type="button" onClick={() => setRate((r) => !r)} className="mx-auto flex items-center gap-2 font-display text-label-lg uppercase text-on-surface-muted hover:text-on-surface" aria-expanded={rate}>
          How alert do you feel? (optional) <Icon name={rate ? 'expand_less' : 'expand_more'} />
        </button>
        {rate && (
          <div className="mt-4">
            <div className="grid grid-cols-9 gap-2">
              {KSS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  onClick={() => setKss(i + 1)}
                  className={cx('flex h-16 items-center justify-center font-display text-headline-md', kss === i + 1 ? 'bg-cat text-black' : 'bg-surface-container-high hover:bg-surface-container-highest')}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-body-md text-on-surface-muted">
              <span>1 · extremely alert</span>
              <span>{kss ? KSS[kss - 1] : 'Only you and the study team see this'}</span>
              <span>9 · fighting sleep</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
