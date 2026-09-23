import { useEffect, useMemo, useState } from 'react';
import { CLOUD_URL } from '../../lib/api';
import { useInterval } from '../../lib/hooks';
import { Icon, cx } from '../ui';

/**
 * Expert demonstration as a motion replay: side view (boom, stick, bucket) and top view (swing,
 * truck, 5 m near-truck zone) of a SIMULATED operator's work cycles from GET /practice/motion-replay —
 * the same kind of data the Expert Motion Model learns from. Not footage of a real operator.
 */
type Archetype = 'expert' | 'novice';
interface Frame {
  t: number;
  phase: string | null;
  joints: [number, number][];
  swing_deg: number;
  swing_dps: number;
  bucket_to_truck_m: number | null;
  payload_t: number;
}
interface Replay {
  duration_s: number;
  hz: number;
  truck: { angle_deg: number; dist_m: number; rim_m: number } | null;
  near_truck_rule: { swing_dps: number; within_m: number };
  frames: Frame[];
}

const PHASES: Record<string, string> = { dig: 'Dig', swing_loaded: 'Swing loaded', dump: 'Dump', swing_empty: 'Swing empty', idle: 'Idle' };
const S = 40;                                  // px per metre in the side view
const sx = (r: number) => (r + 3) * S;
const sy = (z: number) => (9 - z) * S;

export function MotionReplay({ exercise = 'truck_loading_basic', onEnded }: { exercise?: string; onEnded?: () => void }) {
  const [who, setWho] = useState<Archetype>('expert');
  const [data, setData] = useState<Partial<Record<Archetype, Replay>>>({});
  const [failed, setFailed] = useState(false);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);

  useEffect(() => {
    if (data[who]) return;
    let live = true;
    fetch(`${CLOUD_URL}/practice/motion-replay?archetype=${who}&exercise=${encodeURIComponent(exercise)}&cycles=2`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Replay) => live && setData((m) => ({ ...m, [who]: d })))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [who, data, exercise]);

  const rep = data[who];
  const n = rep?.frames.length ?? 0;
  useInterval(() => setI((k) => (k + 1 >= n ? k : k + 1)), playing && rep ? 1000 / (rep.hz * speed) : null);
  useEffect(() => {
    if (playing && n && i >= n - 1) {
      setPlaying(false);
      onEnded?.();
    }
  }, [playing, i, n, onEnded]);

  const f = rep?.frames[Math.min(i, Math.max(0, n - 1))];
  const rule = rep?.near_truck_rule ?? { swing_dps: 35, within_m: 5 };
  const near = f?.bucket_to_truck_m != null && f.bucket_to_truck_m < rule.within_m;
  const fast = near && Math.abs(f?.swing_dps ?? 0) > rule.swing_dps;
  const tipR = f ? f.joints[3][0] : 0;

  const topArm = useMemo(() => {
    if (!f) return null;
    const th = (f.swing_deg * Math.PI) / 180;
    return { x: tipR * Math.cos(th), y: -tipR * Math.sin(th) };
  }, [f, tipR]);

  if (failed && !rep) {
    return (
      <div className="flex aspect-video items-center justify-center rounded bg-surface-container-low text-center text-body-md text-on-surface-muted">
        Motion replay needs the cloud service (port 8100).
      </div>
    );
  }
  if (!rep || !f) {
    return <div className="flex aspect-video items-center justify-center rounded bg-surface-container-low text-body-md text-on-surface-muted">Loading expert motion…</div>;
  }

  const truck = rep.truck;
  const tA = truck ? (truck.angle_deg * Math.PI) / 180 : 0;
  const armClass = fast ? 'stroke-warning' : who === 'expert' ? 'stroke-on-surface' : 'stroke-on-surface-variant';

  return (
    <div className="rounded bg-surface-container-low p-4">
      {/* header: who + phase + readouts */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded border border-outline" role="group" aria-label="Operator to replay">
          {(['expert', 'novice'] as const).map((a) => (
            <button key={a} type="button" onClick={() => { setWho(a); setI(0); setPlaying(true); }}
              className={cx('px-4 py-1.5 font-display text-label-md uppercase', who === a ? 'bg-cat text-black' : 'text-on-surface-variant hover:text-on-surface')}>
              {a === 'expert' ? 'Expert operator' : 'Novice (compare)'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-5 text-body-sm text-on-surface-variant">
          <span className="rounded bg-surface-container px-2 py-0.5 font-display text-label-md uppercase text-on-surface">{PHASES[f.phase ?? ''] ?? '—'}</span>
          <span className={cx('tnum', fast && 'font-semibold text-warning-text')}>Swing {Math.abs(f.swing_dps).toFixed(0)}°/s</span>
          {f.bucket_to_truck_m != null && <span className="tnum">Bucket to truck {f.bucket_to_truck_m.toFixed(1)} m</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[3fr_2fr]">
        {/* side view */}
        <svg viewBox="0 0 640 400" className="w-full" role="img" aria-label="Side view of boom, stick and bucket">
          <line x1="0" y1={sy(0)} x2="640" y2={sy(0)} className="stroke-outline-strong" strokeWidth="2" />
          <rect x={sx(-2.8)} y={sy(0.8)} width={5.1 * S} height={0.8 * S} rx="10" className="fill-on-surface-variant" />
          <rect x={sx(-2.6)} y={sy(3.0)} width={3.8 * S} height={2.2 * S} rx="6" className="fill-cat" />
          <rect x={sx(-0.4)} y={sy(3.9)} width={1.3 * S} height={0.9 * S} rx="4" className="fill-on-surface-variant" opacity={0.8} />
          <polyline points={f.joints.map(([r, z]) => `${sx(r)},${sy(z)}`).join(' ')} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="14" className={armClass} />
          {f.joints.slice(0, 3).map(([r, z], k) => (
            <circle key={k} cx={sx(r)} cy={sy(z)} r="7" className="fill-cat" />
          ))}
          {f.payload_t > 0.2 && <circle cx={sx(f.joints[3][0])} cy={sy(f.joints[3][1]) - 10} r="9" className="fill-warning" opacity={0.85} />}
          <text x="12" y="24" className="fill-on-surface-muted text-[13px]">Side view · reach and height</text>
        </svg>

        {/* top view */}
        <svg viewBox="-12 -12 24 24" className="w-full" role="img" aria-label="Top view of swing and truck">
          {truck && (
            <g transform={`translate(${truck.dist_m * Math.cos(tA)} ${-truck.dist_m * Math.sin(tA)})`}>
              <circle r={1.6 + rule.within_m} fill="none" strokeDasharray="0.5 0.4" strokeWidth="0.1" className="stroke-warning" />
              <rect x="-1.4" y="-2.4" width="2.8" height="4.8" rx="0.3" className="fill-outline-strong" />
              <text y="3.6" textAnchor="middle" className="fill-on-surface-muted" fontSize="0.9">truck · 5 m zone</text>
            </g>
          )}
          <path d="M 7 -3 A 7.6 7.6 0 0 1 7 3" fill="none" strokeWidth="0.25" className="stroke-on-surface-muted" />
          <text x="8.2" y="0.3" className="fill-on-surface-muted" fontSize="0.9">dig</text>
          <circle r="1.8" className="fill-cat" />
          {topArm && <line x1="0" y1="0" x2={topArm.x} y2={topArm.y} strokeWidth="0.6" strokeLinecap="round" className={armClass} />}
          {topArm && <circle cx={topArm.x} cy={topArm.y} r="0.6" className={fast ? 'fill-warning' : 'fill-on-surface'} />}
          <text x="-11.4" y="-10.4" className="fill-on-surface-muted" fontSize="0.9">Top view · swing</text>
        </svg>
      </div>

      {/* controls */}
      <div className="mt-3 flex items-center gap-4">
        <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (i >= n - 1) setI(0); setPlaying((p) => !p); }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-cat text-black">
          <Icon name={playing ? 'pause' : i >= n - 1 ? 'replay' : 'play_arrow'} size={24} />
        </button>
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} className="flex-1 accent-[#FFCD11]" aria-label="Replay position" />
        <span className="tnum text-footnote text-on-surface-variant">{f.t.toFixed(0)} / {rep.duration_s.toFixed(0)} s</span>
        <button type="button" onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))} className="rounded border border-outline px-2 py-1 font-display text-label-sm text-on-surface-variant">
          {speed}×
        </button>
      </div>
      <p className="mt-2 text-footnote text-on-surface-muted">
        {fast ? 'Fast swing near the truck — the expert slows here. ' : ''}Simulated operator motion from the Expert Motion Model's training data — not footage of a real operator.
      </p>
    </div>
  );
}
