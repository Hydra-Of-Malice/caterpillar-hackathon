import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { startLive, useBannerAlert } from '../../lib/live';
import { useCabDay, useLightTheme } from '../../lib/theme';
import { CompactDangerStrip } from '../AlertBanner';
import { ErrorBoundary } from '../ErrorBoundary';
import { BottomActionBar } from '../cab/BottomActionBar';
import { IncidentLogModal } from '../cab/IncidentLogModal';
import { LeftNavRail } from '../cab/LeftNavRail';
import { TopStatusRail } from '../cab/TopStatusRail';

interface CabCtx {
  openIncident: () => void;
}
const Ctx = createContext<CabCtx>({ openIncident: () => undefined });
export const useCab = () => useContext(Ctx);

/**
 * In-cab frame (dark, 1280×800 target, ≥ 64 px targets): top status rail, left nav rail,
 * bottom action bar. A DANGER alert is mirrored as a strip on every cab screen except Operate
 * (which has the full alert slot) so it is never hidden.
 */
export function CabLayout() {
  const loc = useLocation();
  const [incident, setIncident] = useState(false);
  const day = useCabDay();
  useLightTheme(day);
  const { current } = useBannerAlert();
  useEffect(() => startLive('EX-07'), []);
  const onOperate = loc.pathname.startsWith('/cab/operate');
  const bare = loc.pathname.startsWith('/cab/start');

  if (bare) {
    return (
      <div className="min-h-screen bg-surface">
        <Outlet />
      </div>
    );
  }
  return (
    <Ctx.Provider value={{ openIncident: () => setIncident(true) }}>
      <div className="flex h-screen min-h-[720px] flex-col overflow-hidden bg-surface" data-theme="cab">
        <TopStatusRail />
        {!onOperate && current?.tier === 'T_CRIT' && <CompactDangerStrip alert={current} />}
        <div className="flex min-h-0 flex-1">
          <LeftNavRail />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <ErrorBoundary resetKey={loc.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
        <BottomActionBar onLogIncident={() => setIncident(true)} />
        <IncidentLogModal open={incident} onClose={() => setIncident(false)} />
      </div>
    </Ctx.Provider>
  );
}
