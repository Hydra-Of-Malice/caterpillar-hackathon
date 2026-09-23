import { Link } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceArea, LineChart, ReferenceLine } from 'recharts';
import { PHASE_LABEL } from '../../lib/format';
import { BAND_LABEL, tipGainM3, type OverlayChannel } from '../../lib/practiceView';
import type { CoachingTip, CycleMetric, PracticeReport, ScoreBand } from '../../lib/types';
import { COMPETENCY_MODULE, competencyLabel } from '../../mocks/world';
import { GainChip } from '../GainChip';
import { Button, Icon, cx } from '../ui';

export const PHASE_COLOR: Record<string, string> = { dig: '#FB5A00', swing_loaded: '#0066FF', dump: '#6852BE', swing_empty: '#1AC69E', idle: '#757575', travel: '#757575' };
export const CHANNEL_COLOR: Record<string, string> = { joy_swing: '#0066FF', joy_boom: '#FB5A00', joy_stick: '#1AC69E', joy_bucket: '#6852BE', swing_dps: '#4D94FF', boom_angle_deg: '#909090' };

/** Current work-cycle phase: DIG / SWING LOADED / DUMP / SWING EMPTY. */
export function PhaseChip({ phase, size = 'md' }: { phase: string; size?: 'sm' | 'md' | 'xl' }) {
  const dims = size === 'xl' ? 'h-16 px-6 text-headline-lg' : size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-8 px-3 text-label-md';
  return (
    <span className={cx('inline-flex items-center gap-2 whitespace-nowrap font-display font-bold uppercase tracking-[0.04em] text-white', dims)} style={{ background: PHASE_COLOR[phase] ?? 'var(--chart-axis)' }}>
      {PHASE_LABEL[phase] ?? phase}
    </span>
  );
}

const BAND_STYLE: Record<ScoreBand, string> = {
  beginner: 'border-warning text-warning-text bg-warning/10',
  developing: 'border-caution text-caution bg-caution/10',
  proficient: 'border-notice-dark text-notice-dark bg-notice/15',
  expert_like: 'border-success-text text-success-text bg-success/15',
};

export function ScoreBandChip({ band, size = 'md' }: { band: ScoreBand | string; size?: 'md' | 'lg' }) {
  return (
    <span className={cx('inline-flex items-center border font-display font-bold uppercase', size === 'lg' ? 'h-10 px-4 text-label-lg' : 'h-7 px-2 text-label-md', BAND_STYLE[band as ScoreBand] ?? 'border-outline text-on-surface')}>
      {BAND_LABEL[band] ?? band}
    </span>
  );
}

/** 0–100 scale with the band thresholds (40 / 65 / 85) and a marker. */
export function BandScale({ score }: { score: number }) {
  const segs: Array<[number, number, string, string]> = [
    [0, 40, 'bg-warning/40', 'Beginner'],
    [40, 65, 'bg-caution/40', 'Developing'],
    [65, 85, 'bg-notice/50', 'Proficient'],
    [85, 100, 'bg-success/60', 'Expert-like'],
  ];
  return (
    <div className="w-full">
      <div className="relative flex h-3 w-full">
        {segs.map(([a, b, cls]) => (
          <div key={a} className={cls} style={{ width: `${b - a}%` }} />
        ))}
        <div className="absolute -bottom-1.5 -top-1.5 w-1.5 bg-on-surface" style={{ left: `calc(${Math.max(0, Math.min(100, score))}% - 3px)` }} />
      </div>
      <div className="mt-2 flex text-body-sm text-on-surface-muted">
        {segs.map(([a, b, , l]) => (
          <span key={a} style={{ width: `${b - a}%` }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Per-phase timeline: trainee vs expert durations as two stacked horizontal bars. */
export function PhaseTimelineBar({ trainee, expert }: { trainee: Record<string, number>; expert: Record<string, number> }) {
  const phases = ['dig', 'swing_loaded', 'dump', 'swing_empty'];
  const tTot = phases.reduce((a, p) => a + (trainee[p] ?? 0), 0);
  const eTot = phases.reduce((a, p) => a + (expert[p] ?? 0), 0);
  const max = Math.max(tTot, eTot, 1);
  const Row = ({ label, d, tot }: { label: string; d: Record<string, number>; tot: number }) => (
    <div className="grid grid-cols-[110px_1fr_70px] items-center gap-4">
      <span className="text-body-md text-on-surface-variant">{label}</span>
      <div className="flex h-9 w-full bg-surface-container-high">
        <div className="flex h-full" style={{ width: `${(tot / max) * 100}%` }}>
          {phases.map((p) => (
            <div key={p} className="flex h-full items-center justify-center overflow-hidden border-r border-black font-display text-[11px] font-bold text-white" style={{ width: `${((d[p] ?? 0) / (tot || 1)) * 100}%`, background: PHASE_COLOR[p] }} title={`${PHASE_LABEL[p]} ${(d[p] ?? 0).toFixed(1)} s`}>
              {(d[p] ?? 0).toFixed(1)}s
            </div>
          ))}
        </div>
      </div>
      <span className="text-right text-body-md tnum">{tot.toFixed(1)} s</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <Row label="You" d={trainee} tot={tTot} />
      <Row label="Expert P50" d={expert} tot={eTot} />
      <div className="flex flex-wrap gap-4 pl-[126px] text-body-sm text-on-surface-muted">
        {phases.map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5" style={{ background: PHASE_COLOR[p] }} /> {PHASE_LABEL[p]}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  expert_like: { label: 'EXPERT-LIKE', cls: 'border-success-text text-success-text', icon: 'verified' },
  near: { label: 'NEAR', cls: 'border-caution text-caution', icon: 'adjust' },
  needs_work: { label: 'NEEDS WORK', cls: 'border-warning text-warning-text', icon: 'build' },
};

/** Metric card: value, expert P10–P90 band with P50 tick and the trainee marker, status chip. */
export function MetricCard({ m }: { m: CycleMetric }) {
  const lo = Math.min(m.expert_p10, m.value);
  const hi = Math.max(m.expert_p90, m.value);
  const pad = (hi - lo) * 0.2 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const st = STATUS[m.status] ?? STATUS.near;
  const unit = m.unit === 'deg/s' ? '°/s' : m.unit === 'ratio' ? '' : m.unit;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  return (
    <div className="panel flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-md text-on-surface-variant">{m.label}</span>
        <span className={cx('inline-flex items-center gap-1 font-display text-label-sm uppercase', st.cls)}>
          <Icon name={st.icon} size={14} /> {st.label}
        </span>
      </div>
      <div className="font-display text-headline-lg tnum">
        {fmt(m.value)} <span className="text-headline-sm text-on-surface-muted">{unit}</span>
      </div>
      <div className="relative h-3 bg-surface-container-high">
        <div className="absolute bottom-0 top-0 bg-on-surface/15" style={{ left: pos(m.expert_p10), width: `calc(${pos(m.expert_p90)} - ${pos(m.expert_p10)})` }} />
        <div className="absolute -bottom-1 -top-1 w-0.5 bg-on-surface-muted" style={{ left: pos(m.expert_p50) }} />
        <div className={cx('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black', m.status === 'expert_like' ? 'bg-success-text' : m.status === 'near' ? 'bg-caution' : 'bg-warning')} style={{ left: pos(m.value) }} />
      </div>
      <div className="text-body-sm text-on-surface-muted">
        Expert {fmt(m.expert_p10)}–{fmt(m.expert_p90)} {unit} · {m.better === 'higher' ? 'higher is better' : m.better === 'lower' ? 'lower is better' : 'stay in band'}
      </div>
    </div>
  );
}

/** Trainee curve over the expert envelope (P10–P90 band, P50 dashed) on normalised phase time. */
export function TrajectoryChart({ ch, height = 170 }: { ch: OverlayChannel; height?: number }) {
  const data = ch.t.map((t, i) => ({ t: Math.round(t), band: [ch.p10[i], ch.p90[i]] as [number, number], p50: ch.p50[i], you: ch.trainee[i] }));
  const unit = ch.unit === '-1..1' ? '' : ch.unit === 'deg/s' ? '°/s' : ch.unit;
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-headline-sm">{ch.label}</span>
        {ch.exitFrac !== undefined && <span className={cx('text-body-sm', ch.exitFrac > 0.3 ? 'text-warning-text' : 'text-on-surface-muted')}>{Math.round(ch.exitFrac * 100)}% outside band</span>}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, bottom: 14, left: -12 }}>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis dataKey="t" type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} unit="%" label={{ value: 'phase time', position: 'insideBottom', offset: -6, fill: 'var(--chart-tick)', fontSize: 10 }} />
            <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} domain={['auto', 'auto']} unit={unit} />
            <Tooltip contentStyle={{ background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)' }} formatter={(v: unknown) => (Array.isArray(v) ? `${(v[0] as number).toFixed(2)} – ${(v[1] as number).toFixed(2)}` : (v as number).toFixed(2))} />
            <Area dataKey="band" stroke="none" fill="var(--svg-text)" fillOpacity={0.12} isAnimationActive={false} name="Expert P10–P90" />
            <Line dataKey="p50" stroke="var(--chart-tick)" strokeDasharray="4 3" dot={false} isAnimationActive={false} name="Expert P50" />
            <Line dataKey="you" stroke={CHANNEL_COLOR[ch.key] ?? '#0066FF'} strokeWidth={2.5} dot={false} isAnimationActive={false} name="You" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Per-cycle expert-likeness sparkline with band thresholds. */
export function CycleSparkline({ report, height = 90 }: { report: PracticeReport; height?: number }) {
  const data = report.cycles.map((c) => ({ cycle: c.cycle_index + 1, score: c.expert_likeness, flagged: c.safety_flags.length > 0 }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <ReferenceArea y1={65} y2={85} fill="#0067B8" fillOpacity={0.12} />
          <ReferenceArea y1={85} y2={100} fill="#197527" fillOpacity={0.15} />
          <ReferenceLine y={40} stroke="var(--chart-tip-border)" strokeDasharray="3 3" />
          <XAxis dataKey="cycle" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
          <YAxis domain={[0, 100]} ticks={[0, 40, 65, 85, 100]} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)' }} formatter={(v: number) => [v.toFixed(0), 'Cycle score']} labelFormatter={(l) => `Cycle ${l}`} />
          <Line dataKey="score" stroke="#0066FF" strokeWidth={2} dot={{ r: 3, fill: '#0066FF' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const SEV: Record<string, { label: string; cls: string }> = {
  priority: { label: 'PRIORITY', cls: 'bg-warning text-black' },
  improve: { label: 'IMPROVE', cls: 'bg-caution text-black' },
  info: { label: 'INFO', cls: 'bg-notice text-white' },
};

/** Ranked coaching tip with phase, linked competency, gain (m³/shift) and a Start module button. */
export function TipCard({ tip, rank, report }: { tip: CoachingTip; rank: number; report: PracticeReport }) {
  const sev = SEV[tip.severity] ?? SEV.info;
  const moduleId = (tip.evidence?.module_id as string | null | undefined) ?? (tip.competency_id ? COMPETENCY_MODULE[tip.competency_id] : undefined);
  const gain = tipGainM3(report, tip);
  const outside = tip.evidence?.cycles_outside_band as number | undefined;
  const n = tip.evidence?.n_cycles as number | undefined;
  return (
    <article className="panel flex gap-6 p-6">
      <span className="w-6 shrink-0 font-display text-headline-md text-on-surface-muted">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          {tip.phase && <PhaseChip phase={tip.phase} size="sm" />}
          {tip.severity === 'priority' && <span className={cx('px-1.5 py-0.5 font-display text-[11px] font-bold uppercase', sev.cls)}>{sev.label}</span>}
          <h3 className="font-display text-headline-sm">{tip.title}</h3>
        </div>
        <p className="mt-2 text-body-md text-on-surface-variant">{tip.detail}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-body-sm text-on-surface-muted">
          {gain !== undefined && gain >= 0.5 && <GainChip>fixing this ≈ +{gain.toFixed(0)} m³/shift</GainChip>}
          {outside !== undefined && n !== undefined && <span>{outside} of {n} cycles outside the expert band</span>}
          {tip.competency_id && <span>{competencyLabel(tip.competency_id)}</span>}
        </div>
      </div>
      {moduleId && (
        <Link to={`/training/module/${moduleId}`} className="shrink-0 self-center">
          <Button variant="secondary" size="md" icon="play_circle">
            Start module
          </Button>
        </Link>
      )}
    </article>
  );
}
