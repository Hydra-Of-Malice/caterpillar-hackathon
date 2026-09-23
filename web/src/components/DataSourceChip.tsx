import { useMockStatus } from '../lib/mockStatus';
import { useShowSources } from '../lib/prefs';
import { Icon, cx } from './ui';

/**
 * Per-panel data-source chip. Pass endpoint name fragments (e.g. "/practice/", "GET /models").
 *  - endpoint answered 503 / "not trained yet" → DEMO FIXTURE — model trains tomorrow
 *  - backend unreachable / route missing        → MOCK DATA (fixture)
 *  - otherwise                                  → LIVE (only if `showLive`)
 */
export function DataSourceChip({ endpoints, showLive = true, className, modelBacked = false }: { endpoints: string[]; showLive?: boolean; className?: string; modelBacked?: boolean }) {
  const s = useMockStatus();
  const show = useShowSources();
  if (!show) return null;
  const hits = Object.values(s.mocked).filter((m) => endpoints.some((e) => m.endpoint.includes(e)));
  if (!hits.length && !s.forced) {
    if (!showLive) return null;
    return (
      <span className={cx('inline-flex h-6 items-center gap-1 border border-success px-2 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-success-text', className)} title="Served by the running backend">
        <span className="h-1.5 w-1.5 rounded-full bg-success-text" /> LIVE
      </span>
    );
  }
  const notTrained = hits.some((h) => h.reason.includes('503') || h.reason.includes('shape'));
  if (notTrained || (modelBacked && !s.forced && hits.some((h) => h.reason.startsWith('HTTP')))) {
    return (
      <span className={cx('inline-flex h-6 items-center gap-1 border border-dashed border-cat px-2 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-cat-text', className)} title={hits.map((h) => `${h.endpoint}: ${h.reason}`).join('\n')}>
        <Icon name="model_training" size={14} /> DEMO FIXTURE — model trains tomorrow
      </span>
    );
  }
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 border border-dashed border-prov-mock px-2 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-prov-mock', className)} title={hits.map((h) => `${h.endpoint}: ${h.reason}`).join('\n') || 'forced mock mode'}>
      <Icon name="database" size={14} /> MOCK DATA
    </span>
  );
}
