import { useState } from 'react';
import { markLive, mockStatusStore, setForcedMock, setOrigin, useMockStatus } from '../lib/mockStatus';
import { setShowSources, useShowSources } from '../lib/prefs';
import { Icon, cx } from './ui';

/**
 * The single global SIMULATED ribbon (top-right). Clicking it toggles the data-sources layer
 * (RULE / ML / SIMULATED / MOCK chips and LIVE vs fixture chips) on every screen.
 */
export function DemoRibbon({ compact = true }: { compact?: boolean }) {
  const show = useShowSources();
  return (
    <button
      type="button"
      onClick={() => setShowSources(!show)}
      aria-pressed={show}
      title={show ? 'Hide data sources' : 'All data is SIMULATED (fictional). Click to show data sources on every screen.'}
      className={cx(
        'flex h-7 shrink-0 items-center gap-1.5 border px-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
        show ? 'stripes-sim-solid border-prov-sim text-white' : 'border-prov-sim/70 text-prov-sim-text hover:bg-prov-sim/15',
      )}
    >
      <Icon name={show ? 'visibility' : 'science'} size={14} />
      {compact ? 'Simulated' : 'Simulated data'}
      {show && <span className="font-normal normal-case tracking-normal">· sources on</span>}
    </button>
  );
}

/**
 * "MOCK DATA" indicator: always shown when a backend is unreachable (the whole screen is fixtures),
 * otherwise only with the data-sources layer on. Click for the endpoint list.
 */
export function MockIndicator({ align = 'right' }: { align?: 'left' | 'right' }) {
  const s = useMockStatus();
  const show = useShowSources();
  const [open, setOpen] = useState(false);
  const entries = Object.values(s.mocked);
  const offline = s.origins.edge === 'offline' || s.origins.cloud === 'offline';
  if (!entries.length && !s.forced) return null;
  if (!show && !offline && !s.forced) return null;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1.5 border border-dashed border-prov-mock px-2 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-on-surface-variant hover:bg-surface-container-high"
        title="Some data is served from local fixtures"
      >
        <Icon name="database" size={14} className="text-prov-mock" />
        {offline ? 'Offline · mock data' : 'Mock data'}
        <span className="text-prov-mock">{s.forced ? 'all' : entries.length}</span>
      </button>
      {open && (
        <div className={cx('absolute top-9 z-[80] w-[420px] border border-outline-variant bg-surface-container-high p-4 text-body-sm', align === 'right' ? 'right-0' : 'left-0')}>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-label-md uppercase">Served from fixtures</span>
            <button type="button" className="text-on-surface-muted hover:text-on-surface" onClick={() => setOpen(false)} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-[12px]">
            {s.forced && <li className="text-cat-text">Forced mock mode (?mock=1)</li>}
            {entries.map((e) => (
              <li key={e.endpoint} className="flex justify-between gap-2 py-0.5">
                <span className="truncate">{e.endpoint}</span>
                <span className="shrink-0 text-on-surface-muted">{e.reason}</span>
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
  );
}
