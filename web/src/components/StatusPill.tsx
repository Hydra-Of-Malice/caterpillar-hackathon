import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { markLive, mockStatusStore, setForcedMock, setOrigin, useMockStatus } from '../lib/mockStatus';
import { setShowSources, useShowSources } from '../lib/prefs';
import { Icon, cx } from './ui';

/**
 * The single global status pill (fixed, bottom-right): "SIMULATED", plus "demo fixture" when some
 * panels fell back to local fixtures. Its popover holds the data-sources toggle and the fixture list.
 * Nothing status-related lives in the page headers.
 */
export function StatusPill() {
  const s = useMockStatus();
  const show = useShowSources();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const cab = loc.pathname.startsWith('/cab') && !loc.pathname.startsWith('/cab/start');
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.values(s.mocked);
  const offline = s.origins.edge === 'offline' || s.origins.cloud === 'offline';
  const fixtures = entries.length > 0 || s.forced;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className={cx('fixed right-4 z-[75]', cab ? 'bottom-[100px]' : 'bottom-4')}>
      {open && (
        <div className="panel absolute bottom-12 right-0 w-[360px] p-5 text-body-md" style={{ boxShadow: '0 15px 40px rgba(0,0,0,.25)' }}>
          <p className="text-on-surface-variant">All people, machines and data in this prototype are simulated.</p>
          <button type="button" onClick={() => setShowSources(!show)} className="mt-4 flex w-full items-center justify-between py-1 text-left">
            <span>Show data sources</span>
            <Icon name={show ? 'toggle_on' : 'toggle_off'} size={32} className={show ? 'text-cat-text' : 'text-on-surface-muted'} />
          </button>
          {fixtures && (
            <div className="mt-4 border-t border-outline pt-4">
              <div className="mb-2 text-on-surface-variant">{offline ? 'A service is offline — panels use demo fixtures:' : 'Some panels use a demo fixture:'}</div>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-body-sm text-on-surface-muted">
                {s.forced && <li>All data (forced mock mode)</li>}
                {entries.map((e) => (
                  <li key={e.endpoint} className="flex justify-between gap-2">
                    <span className="truncate">{e.endpoint.replace(/^(edge|cloud): (GET|POST|PATCH) /, '')}</span>
                    <span className="shrink-0">{/not trained|503/.test(e.reason) ? 'trains tomorrow' : e.reason}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-4 font-display text-label-sm uppercase">
                <button
                  type="button"
                  className="text-notice-dark hover:underline"
                  onClick={() => {
                    Object.keys(mockStatusStore.get().mocked).forEach(markLive);
                    setOrigin('edge', 'unknown');
                    setOrigin('cloud', 'unknown');
                    window.location.reload();
                  }}
                >
                  Retry live
                </button>
                <button type="button" className="text-notice-dark hover:underline" onClick={() => setForcedMock(!s.forced)}>
                  {s.forced ? 'Stop forcing mock' : 'Force mock'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          'panel flex h-9 items-center gap-2 whitespace-nowrap px-3 font-display text-[12px] font-bold uppercase tracking-[0.08em]',
          show ? 'text-cat-text' : 'text-prov-sim-text',
        )}
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}
      >
        <Icon name="science" size={16} />
        Simulated
        {fixtures && <span className="font-normal normal-case tracking-normal text-on-surface-muted">· {offline ? 'offline' : 'demo fixture'}</span>}
        {show && <span className="font-normal normal-case tracking-normal text-on-surface-muted">· sources on</span>}
      </button>
    </div>
  );
}
