import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INJECTIONS, triggerFastForward, triggerInject, triggerScenario, triggerWan, type TriggerResult } from '../lib/demo';
import { useKey } from '../lib/hooks';
import { localPreview, useLive, type LocalPreview } from '../lib/live';
import { setForcedMock, useMockStatus } from '../lib/mockStatus';
import { Button, Icon, cx, toast } from './ui';

const PREVIEWS: Array<{ kind: LocalPreview; label: string }> = [
  { kind: 'break_due', label: '5e Break recommended (T3)' },
  { kind: 'heartbeat_loss', label: 'Heartbeat loss (12 s)' },
  { kind: 'proximity_fault', label: '5f Proximity sensor fault' },
  { kind: 'cloud_offline', label: 'Toggle cloud offline' },
  { kind: 'clear_all', label: 'Clear all alerts' },
];

const note = (r: TriggerResult, what: string) => toast(r === 'live' ? `${what} → edge /demo (live)` : `${what} → in-browser MOCK engine (edge unreachable)`, r === 'live' ? 'ok' : 'info');

/** Hidden demo control drawer, toggled with the "D" key. Calls /demo/inject, /demo/wan, /demo/scenario. */
export function DemoControlPanel() {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState('ravi_shift1');
  const [speed, setSpeed] = useState(1);
  const live = useLive();
  const ms = useMockStatus();
  useKey('d', () => setOpen((o) => !o));
  if (!open) return null;
  const dot = (ok: boolean) => <span className={cx('inline-block h-2 w-2 rounded-full', ok ? 'bg-success-text' : 'bg-danger-text')} />;

  return (
    <aside className="fixed right-0 top-0 z-[85] flex h-full w-[400px] animate-slide-in flex-col border-l-2 border-cat bg-surface-container-high" aria-label="Demo control panel">
      <header className="flex items-center justify-between border-b border-outline px-4 py-3">
        <div>
          <div className="font-display text-headline-sm uppercase">Demo control</div>
          <div className="font-display text-label-sm uppercase text-on-surface-muted">DEMO_MODE · press D to close</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center border border-outline" aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="grid grid-cols-2 gap-2 font-display text-label-sm uppercase text-on-surface-variant">
          <span className="flex items-center gap-2">{dot(live.edgeWs === 'open')} Edge WS</span>
          <span className="flex items-center gap-2">{dot(live.mqtt === 'open')} MQTT :9001</span>
          <span className="flex items-center gap-2">{dot(live.protection.state === 'active')} Protection {live.protection.state}</span>
          <span className="flex items-center gap-2">{dot(!live.mockEngine)} Mock engine {live.mockEngine ? 'on' : 'off'}</span>
        </section>

        <section>
          <h3 className="mb-2 font-display text-label-md uppercase text-cat-text">Inject (edge /demo/inject)</h3>
          <div className="grid grid-cols-1 gap-2">
            {INJECTIONS.map((i) => (
              <button
                key={i.kind}
                type="button"
                onClick={async () => note(await triggerInject(i.kind), i.label)}
                className="flex min-h-[48px] items-center gap-3 border border-outline-variant bg-surface-container px-3 text-left hover:border-cat"
              >
                <Icon name={i.icon} className="text-cat-text" />
                <span className="flex-1">
                  <span className="block font-display text-label-md uppercase">{i.label}</span>
                  <span className="block text-body-sm text-on-surface-muted">{i.expect}</span>
                </span>
                <code className="font-mono text-[11px] text-on-surface-muted">{i.kind}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-label-md uppercase text-cat-text">Time & network</h3>
          <Button block variant="secondary" icon="fast_forward" onClick={async () => note(await triggerFastForward(150), 'Fast-forward 150 min operation')}>
            Fast-forward 150 min (T3 break)
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon="cloud_off" onClick={async () => note(await triggerWan(false), 'WAN down')}>
              WAN down
            </Button>
            <Button variant="secondary" icon="cloud_done" onClick={async () => note(await triggerWan(true), 'WAN up')}>
              WAN up
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-label-md uppercase text-cat-text">Scenario (edge /demo/scenario)</h3>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <select className="select h-11" value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {['ravi_shift0', 'ravi_shift1', 'ravi_shift2', 'baseline_fleet'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className="select h-11" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[1, 2, 5, 10].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </div>
          <Button block variant="primary" icon="play_arrow" onClick={async () => note(await triggerScenario(scenario, speed), `Scenario ${scenario} at ${speed}×`)}>
            Start scenario
          </Button>
        </section>

        <section>
          <h3 className="mb-2 font-display text-label-md uppercase text-cat-text">Local UI previews</h3>
          <div className="grid grid-cols-1 gap-2">
            {PREVIEWS.map((p) => (
              <Button key={p.kind} variant="secondary" size="sm" className="justify-start" onClick={() => localPreview(p.kind)}>
                {p.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-body-sm text-on-surface-muted">Previews change only this browser (for rehearsing 5e/5f/offline states).</p>
        </section>

        <section className="flex flex-wrap gap-2 border-t border-outline pt-4">
          <Link to="/cab/operate" className="font-display text-label-md uppercase text-notice-dark underline">Open Operate</Link>
          <Link to="/tour" className="font-display text-label-md uppercase text-notice-dark underline">Demo tour</Link>
          <button type="button" className="font-display text-label-md uppercase text-notice-dark underline" onClick={() => setForcedMock(!ms.forced)}>
            {ms.forced ? 'Stop forcing mock data' : 'Force mock data'}
          </button>
        </section>
      </div>
    </aside>
  );
}
