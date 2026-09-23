import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { value as valueApi } from '../lib/api';
import { createStore, useStore } from '../lib/store';
import type { ValueUnitCosts } from '../lib/types';
import { mockUnitCosts } from '../mocks/value';
import { cx } from './ui';

/**
 * Gain chip in OPERATIONAL units ("+18 m³ per shift", "−38 idle min", "12 L fuel saved"),
 * always labelled ESTIMATE and linked to /value where the assumptions live.
 * Dollar figures never appear on operational screens — only on the Business Value page.
 */
export function GainChip({ children, tone = 'gain', size = 'md', className, title, to = '/value' }: { children: React.ReactNode; tone?: 'gain' | 'neutral'; size?: 'sm' | 'md' | 'lg'; className?: string; title?: string; to?: string | null }) {
  const dims = size === 'lg' ? 'text-label-lg' : size === 'sm' ? 'text-[12px]' : 'text-label-md';
  const cls = cx(
    'inline-flex items-baseline gap-1.5 whitespace-nowrap font-display font-bold leading-tight tracking-[0.02em]',
    tone === 'gain' ? 'text-series-blue-light' : 'text-on-surface-variant',
    dims,
    className,
  );
  const body = (
    <>
      <span className="tnum">{children}</span>
      <span className="text-[10px] font-normal uppercase tracking-[0.08em] opacity-70">est.</span>
    </>
  );
  const t = title ?? 'Estimated gain from editable assumptions — see Business Value';
  return to ? (
    <Link to={to} title={t} className={cx(cls, 'hover:underline')}>
      {body}
    </Link>
  ) : (
    <span title={t} className={cls}>
      {body}
    </span>
  );
}

/** Signed number with a real minus sign: +18, −6. */
export function signed(v: number, digits = 0): string {
  const s = Math.abs(v).toFixed(digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

// ------------------------------------------------------------------ unit conversions (cached)
const unitStore = createStore<ValueUnitCosts>(mockUnitCosts());
let loaded = false;

/** Conversion factors from GET /value/unit-costs (fixture fallback) — used for L/h, not shown as $. */
export function useUnitCosts(): ValueUnitCosts {
  const v = useStore(unitStore);
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    valueApi
      .unitCosts()
      .then((u) => unitStore.set({ ...mockUnitCosts(), ...u }))
      .catch(() => undefined);
  }, []);
  return v;
}

/** Idle minutes → litres of fuel at the idle burn rate. */
export function idleLitres(u: ValueUnitCosts, minutes: number): number {
  return (minutes / 60) * u.idle_fuel_l_per_h;
}
