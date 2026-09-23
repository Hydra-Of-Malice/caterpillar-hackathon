import { fmtClock } from '../lib/format';
import type { ProximitySector, SectorState } from '../lib/types';
import { cx } from './ui';

export type ProximityMode = 'active' | 'not_fitted' | 'no_signal';

const SECTOR_ANGLE: Record<ProximitySector, number> = { front: 0, right: 90, rear: 180, left: 270 };

function polar(cx0: number, cy0: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx0 + r * Math.cos(a), cy0 + r * Math.sin(a)];
}

function wedge(cx0: number, cy0: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx0, cy0, r, from);
  const [x2, y2] = polar(cx0, cy0, r, to);
  return `M ${cx0} ${cy0} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

/**
 * Top-down proximity-zone diagram (no camera, no identity): excavator outline, WARNING ring at 8 m
 * (orange dashed), DANGER ring at 4 m (red), four sectors. States: active, NOT FITTED, NO SIGNAL.
 */
export function ProximityZoneDiagram({
  sectors = {}, truckM, truckSector = 'left', truckId, personM, personSector, mode = 'active', lastGoodTs, height = 230, showLegend = true,
}: {
  sectors?: Partial<Record<ProximitySector, SectorState>>; truckM?: number | null; truckSector?: ProximitySector | null; truckId?: string | null;
  personM?: number | null; personSector?: ProximitySector | null; mode?: ProximityMode; lastGoodTs?: number | null; height?: number; showLegend?: boolean;
}) {
  const W = 420;
  const H = 250;
  const c = { x: W / 2, y: H / 2 };
  const R8 = 108;
  const R4 = 54;
  const scale = R8 / 8;
  const off = mode !== 'active';
  const fillFor = (s?: SectorState) => (s === 'danger' ? 'rgba(197,35,32,0.55)' : s === 'warning' ? 'rgba(229,108,0,0.28)' : 'transparent');

  const place = (m: number, sector: ProximitySector, skew = 0): [number, number] => polar(c.x, c.y, Math.min(m * scale, R8 + 22), SECTOR_ANGLE[sector] + skew);
  const truckPos = truckM != null ? place(truckM, truckSector ?? 'left', truckSector === 'left' ? 35 : 0) : null;
  const personPos = personM != null && personSector ? place(personM, personSector) : null;

  return (
    <div className="relative w-full overflow-hidden bg-surface-container-low" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className={cx('absolute inset-0 h-full w-full', off && 'opacity-30 grayscale')} role="img" aria-label="Proximity zones around the machine, seen from above">
        <line x1={c.x} x2={c.x} y1={6} y2={H - 6} stroke="var(--chart-axis)" strokeDasharray="3 3" />
        <line x1={c.x - R8 - 40} x2={c.x + R8 + 40} y1={c.y} y2={c.y} stroke="var(--chart-axis)" strokeDasharray="3 3" />
        {(Object.keys(SECTOR_ANGLE) as ProximitySector[]).map((s) => (
          <path key={s} d={wedge(c.x, c.y, R8, SECTOR_ANGLE[s] - 45, SECTOR_ANGLE[s] + 45)} fill={fillFor(sectors[s])} />
        ))}
        <circle cx={c.x} cy={c.y} r={R8} fill="none" stroke="#E56C00" strokeWidth="1.5" strokeDasharray="6 4" />
        <circle cx={c.x} cy={c.y} r={R4} fill="none" stroke="#C52320" strokeWidth="2" />
        <text x={c.x + 6} y={c.y - R8 + 13} fill="#FF9A40" fontSize="11" fontFamily="Roboto Condensed" fontWeight="700" letterSpacing="1">WARNING 8 m</text>
        <text x={c.x + 6} y={c.y - R4 + 13} fill="#FF6B66" fontSize="11" fontFamily="Roboto Condensed" fontWeight="700" letterSpacing="1">DANGER 4 m</text>
        {/* excavator, front = up */}
        <g transform={`translate(${c.x - 16}, ${c.y - 22})`}>
          <rect x="-5" y="4" width="6" height="40" fill="var(--chart-tip-bg)" stroke="#757575" />
          <rect x="31" y="4" width="6" height="40" fill="var(--chart-tip-bg)" stroke="#757575" />
          <rect x="2" y="10" width="28" height="30" fill="#2A2A2A" stroke="var(--chart-tick)" strokeWidth="1.5" />
          <rect x="4" y="12" width="10" height="10" fill="#4DB1FF" opacity="0.35" />
          <rect x="13" y="-26" width="6" height="38" fill="#FFCD11" />
          <rect x="10" y="-32" width="12" height="7" fill="#FFCD11" />
        </g>
        {truckPos && (
          <g transform={`translate(${truckPos[0] - 13}, ${truckPos[1] - 22})`}>
            <rect width="26" height="44" fill="#1E1E1E" stroke="#4DB1FF" strokeWidth="1.5" />
            <rect x="3" y="3" width="20" height="11" fill="#0067B8" opacity="0.5" />
            <text x={truckPos[0] < c.x ? -6 : 32} y="18" textAnchor={truckPos[0] < c.x ? 'end' : 'start'} fill="var(--svg-text)" fontSize="11" fontWeight="700" fontFamily="Roboto Condensed">
              {truckId ? `TRUCK ${truckId}` : 'TRUCK'}
            </text>
            <text x={truckPos[0] < c.x ? -6 : 32} y="32" textAnchor={truckPos[0] < c.x ? 'end' : 'start'} fill="var(--svg-accent)" fontSize="11" fontFamily="Roboto Condensed">
              {truckM?.toFixed(1)} m
            </text>
          </g>
        )}
        {personPos && (
          <g transform={`translate(${personPos[0]}, ${personPos[1]})`}>
            <circle r="14" fill="#C52320" stroke="#FFFFFF" strokeWidth="2" />
            <circle cy="-5" r="3.2" fill="#FFFFFF" />
            <path d="M-6 8 C-6 1 6 1 6 8 Z" fill="#FFFFFF" />
            <text x="20" y="4" fill="var(--svg-text)" fontSize="12" fontWeight="700" fontFamily="Roboto Condensed">PERSON · {personM?.toFixed(1)} m</text>
          </g>
        )}
      </svg>
      {mode === 'no_signal' && (
        <div className="stripes-hazard-thin absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40">
          <span className="border-2 border-danger bg-black px-4 py-1 font-display text-headline-md uppercase text-danger-text">NO SIGNAL</span>
          <span className="bg-black px-2 font-display text-label-sm uppercase text-on-surface-variant">Last good reading {fmtClock(lastGoodTs ?? null, true)}</span>
        </div>
      )}
      {mode === 'not_fitted' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="border-2 border-outline-strong bg-black px-4 py-1 font-display text-headline-sm uppercase text-on-surface-variant">PROXIMITY SENSING: NOT FITTED</span>
          <span className="bg-black px-2 text-body-sm text-on-surface-muted">Use mirrors and your spotter</span>
        </div>
      )}
      {showLegend && mode === 'active' && (
        <div className="absolute bottom-1.5 left-2 right-2 flex flex-wrap gap-x-4 font-display text-label-sm uppercase text-on-surface-muted">
          {(Object.keys(SECTOR_ANGLE) as ProximitySector[]).map((s) => (
            <span key={s} className={cx(sectors[s] === 'danger' && 'text-danger-text', sectors[s] === 'warning' && 'text-warning-text')}>
              {s}: {sectors[s] === 'danger' ? 'DANGER' : sectors[s] === 'warning' ? 'WARNING' : 'CLEAR'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
