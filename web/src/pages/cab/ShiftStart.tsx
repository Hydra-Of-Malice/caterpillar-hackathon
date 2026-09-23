import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Checkbox, Icon, Wordmark, cx } from '../../components/ui';
import { edge } from '../../lib/api';
import { fmtClock } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { liveNow } from '../../lib/live';
import { useShift } from '../../lib/shift';
import { setCabDay, useCabDay } from '../../lib/theme';

/** Screen 1 — Shift Start / sign-in: badge or ID, today at a glance, privacy notice, one action. */
export default function ShiftStart() {
  useNow(1000);
  const nav = useNavigate();
  const day = useCabDay();
  const { data: shift } = useShift();
  const [ack, setAck] = useState(false);
  const [pin, setPin] = useState('');
  const [identified, setIdentified] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = shift?.operator.name.split(' ')[0] ?? 'Ravi';
  const opId = shift?.operator.operator_id ?? 'OP-1042';
  const pinOk = pin.length === 4 && opId.endsWith(pin);
  const hour = new Date(liveNow() * 1000).getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const press = (k: string) => {
    if (k === 'CLR') return setPin('');
    if (k === 'DEL') return setPin((p) => p.slice(0, -1));
    setPin((p) => {
      const next = (p + k).slice(0, 4);
      if (next.length === 4 && opId.endsWith(next)) setIdentified(true);
      return next;
    });
  };

  const start = async () => {
    setBusy(true);
    await edge.privacyAck(shift?.shift.shift_id ?? 'current').catch(() => undefined);
    nav('/cab/checklist');
  };

  const c = shift?.conditions;
  const glance: Array<[string, string]> = [
    ['precision_manufacturing', `${shift?.machine.machine_id ?? 'EX-07'} · ${(shift?.machine.model ?? 'Cat 320').replace(' (simulated)', '')}`],
    ['location_on', shift?.shift.location ?? 'North Quarry, Bench 3'],
    ['schedule', `${fmtClock(shift?.shift.planned_start_ts)} – ${fmtClock(shift?.shift.planned_end_ts)}`],
    ['assignment', `${shift?.tasks.length ?? 3} tasks today`],
    ['partly_cloudy_day', `${c?.temp_c ?? 31} °C · ${c?.forecast ?? 'rain from 13:00'}`],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="h-1 w-full bg-cat" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-8 py-8">
        <div className="flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setCabDay(!day)} className="flex h-12 items-center gap-2 border border-outline-variant px-3 font-display text-label-md uppercase hover:bg-surface-container-high">
              <Icon name={day ? 'dark_mode' : 'light_mode'} size={22} /> {day ? 'Night' : 'Day'}
            </button>
          </div>
        </div>

        <h1 className="font-display text-display">
          {greet}, {first}
        </h1>

        <div className="grid flex-1 grid-cols-12 gap-8">
          <section className="panel col-span-7 flex items-center gap-8 p-8">
            <button
              type="button"
              onClick={() => setIdentified(true)}
              className={cx('flex h-[220px] w-[220px] shrink-0 flex-col items-center justify-center gap-4 border-4 transition-colors', identified ? 'border-success bg-success/10' : 'border-cat hover:bg-cat/5')}
            >
              <span className={cx('flex h-20 w-20 items-center justify-center rounded-full', identified ? 'bg-success text-white' : 'bg-cat text-black')}>
                <Icon name={identified ? 'check' : 'contactless'} size={48} />
              </span>
              <span className="font-display text-label-lg uppercase">{identified ? 'Signed in' : 'Tap badge'}</span>
            </button>
            <div className="flex-1">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-body-lg text-on-surface-muted">or enter your ID</span>
                <span className="flex gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cx('h-3 w-3 rounded-full', i < pin.length ? (pin.length === 4 && !pinOk ? 'bg-danger' : 'bg-cat') : 'bg-outline-variant')} />
                  ))}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
                  <button key={k} type="button" onClick={() => press(k)} className="flex h-16 items-center justify-center bg-surface-container-high font-display text-headline-md hover:bg-surface-container-highest">
                    {k === 'DEL' ? <Icon name="backspace" size={28} /> : k}
                  </button>
                ))}
              </div>
              {pin.length === 4 && !pinOk && <div className="mt-3 text-body-md text-danger-text">ID not recognised (demo: 1042)</div>}
            </div>
          </section>

          <section className="col-span-5 p-2">
            <h2 className="mb-6 font-display text-headline-md">Today</h2>
            <ul className="space-y-5 text-body-lg">
              {glance.map(([icon, text]) => (
                <li key={icon} className="flex items-center gap-4">
                  <Icon name={icon} size={28} className="text-on-surface-muted" /> {text}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="flex items-center gap-8 border-t border-outline pt-6">
          <p className="flex-1 text-body-lg text-on-surface-variant">
            CAT Sentinel records machine signals and alerts during your shift — no camera, no microphone.{' '}
            <Link to="/privacy" className="text-notice-dark underline">
              Learn more
            </Link>
          </p>
          <Checkbox size="cab" checked={ack} onChange={setAck} label="I understand" />
          <Button variant="primary" size="cab" icon="fact_check" disabled={!ack || busy} onClick={start}>
            Start pre-shift check
          </Button>
        </section>
      </div>
    </div>
  );
}
