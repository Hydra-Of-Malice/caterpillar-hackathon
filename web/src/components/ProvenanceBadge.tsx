import type { ReactNode } from 'react';
import { useShowSources } from '../lib/prefs';
import type { Provenance } from '../lib/types';
import { cx } from './ui';

type Kind = Provenance | 'ESTIMATE';

const STYLE: Record<Kind, string> = {
  RULE: 'border-on-surface text-on-surface',
  ML: 'border-prov-ml text-prov-ml',
  SIMULATED: 'border-prov-sim text-prov-sim-text stripes-sim',
  MOCK: 'border-prov-mock text-prov-mock border-dashed',
  MANUAL: 'border-on-surface-muted text-on-surface-variant border-dotted',
  ESTIMATE: 'border-series-blue-light text-series-blue-light',
};

const TITLE: Record<Kind, string> = {
  RULE: 'Deterministic, versioned rule',
  ML: 'Trained model output (decision support only)',
  SIMULATED: 'Simulated telemetry or results',
  MOCK: 'Placeholder integration',
  MANUAL: 'Entered by a person',
  ESTIMATE: 'Business estimate — assumptions editable, to be proven in a pilot',
};

const WORD: Record<Kind, string> = {
  RULE: 'Rule-based',
  ML: 'ML model',
  SIMULATED: 'simulated data',
  MOCK: 'mock integration',
  MANUAL: 'manual entry',
  ESTIMATE: 'estimate',
};

/**
 * Provenance chip. Hidden unless the viewer turns on "data sources" (SIMULATED ribbon / More menu),
 * so everyday screens stay clean while judges can reveal RULE / ML / SIMULATED / MOCK everywhere.
 */
export function ProvenanceBadge({ kind, className, force }: { kind: Provenance | string; className?: string; force?: boolean }) {
  const show = useShowSources();
  if (!show && !force) return null;
  const k = (kind in STYLE ? kind : 'MOCK') as Kind;
  return (
    <span title={TITLE[k]} className={cx('inline-flex h-5 items-center whitespace-nowrap rounded border px-1.5 font-display text-[11px] font-bold uppercase leading-none tracking-[0.06em]', STYLE[k], className)}>
      {kind}
    </span>
  );
}

export function ProvenanceBadges({ kinds, className, force }: { kinds: Array<Provenance | string> | undefined | null; className?: string; force?: boolean }) {
  const show = useShowSources();
  if ((!show && !force) || !kinds?.length) return null;
  const uniq = Array.from(new Set(kinds));
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1', className)}>
      {uniq.map((k) => (
        <ProvenanceBadge key={k} kind={k} force={force} />
      ))}
    </span>
  );
}

/** One muted provenance footnote per panel ("Rule-based · simulated data"), shown only with data sources on. */
export function SourceNote({ kinds, children, className }: { kinds?: Array<Provenance | string>; children?: ReactNode; className?: string }) {
  const show = useShowSources();
  if (!show) return null;
  const text = [...new Set(kinds ?? [])].map((k) => WORD[k as Kind] ?? String(k).toLowerCase());
  return (
    <p className={cx('mt-3 text-footnote text-on-surface-muted', className)}>
      {text.length ? text.join(' · ').replace(/^./, (c) => c.toUpperCase()) : null}
      {text.length && children ? ' · ' : null}
      {children}
    </p>
  );
}
