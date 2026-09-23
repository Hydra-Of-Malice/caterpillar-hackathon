import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { GainChip, signed } from '../../components/GainChip';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { BandScale, CycleSparkline, MetricCard, PhaseChip, PhaseTimelineBar, ScoreBandChip, TipCard, TrajectoryChart } from '../../components/practice/parts';
import { SourceNote } from '../../components/ProvenanceBadge';
import { Button, EmptyState, Icon, Loading, PageTitle, cx } from '../../components/ui';
import { practice } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { WORK_PHASES, exerciseLabel, parseOverlay, practiceGains, traineePhaseDurations } from '../../lib/practiceView';
import type { CycleMetric, PracticeReport } from '../../lib/types';
import { OPERATORS } from '../../mocks/world';

const FALLBACK_EXPERT_S: Record<string, number> = { dig: 6.5, swing_loaded: 4.5, dump: 2.4, swing_empty: 4.1 };
const LEVERS = ['joy_swing', 'joy_boom', 'joy_stick', 'joy_bucket'];
const STATUS_RANK: Record<CycleMetric['status'], number> = { needs_work: 0, near: 1, expert_like: 2 };

function ValueCard({ report }: { report: PracticeReport }) {
  const g = practiceGains(report);
  if (!g.trainee || !g.expert) return null;
  const data = [
    { name: 'You', v: g.trainee, fill: '#0066FF' },
    { name: 'Expert', v: g.expert, fill: '#1AC69E' },
  ];
  return (
    <section className="panel p-6">
      <h2 className="font-display text-headline-sm">Value of closing the gap</h2>
      <div className="mt-4 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
            <XAxis type="number" hide domain={[0, Math.max(g.trainee, g.expert) * 1.1]} />
            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--svg-text)', fontSize: 14 }} width={60} />
            <Bar dataKey="v" isAnimationActive={false} barSize={22}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
              <LabelList dataKey="v" position="right" formatter={(v: number) => `${Math.round(v)} m³/h`} fill="var(--svg-text)" fontSize={14} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {g.m3PerShift !== undefined && <GainChip size="lg">+{g.m3PerShift.toFixed(0)} m³ per shift</GainChip>}
        {g.upliftPct !== undefined && <GainChip size="lg">{signed(g.upliftPct)}% output</GainChip>}
        {g.secondsPerCycle !== undefined && g.secondsPerCycle > 0.05 && <GainChip size="lg">{signed(-g.secondsPerCycle, 1)} s per cycle</GainChip>}
      </div>
      <p className="mt-3 text-body-sm text-on-surface-muted">
        If you close {Math.round(g.closure * 100)}% of your gap to the expert
        {g.hoursFor420 && g.expertHoursFor420 ? ` · 420 m³ takes you ${g.hoursFor420.toFixed(1)} h vs ${g.expertHoursFor420.toFixed(1)} h` : ''}.
      </p>
    </section>
  );
}

/**
 * Practice Report "You vs Expert" (PracticeReport schema): score and band, per-cycle sparkline,
 * value of closing the gap, phase timeline, key metrics, trajectory overlays, ranked coaching tips.
 */
export default function PracticeReportPage() {
  const { sessionId = '' } = useParams();
  const nav = useNavigate();
  const [resolved, setResolved] = useState<string | null>(sessionId === 'latest' ? null : sessionId);
  const [allMetrics, setAllMetrics] = useState(false);
  const [allChannels, setAllChannels] = useState(false);
  useEffect(() => {
    if (sessionId !== 'latest') {
      setResolved(sessionId);
      return;
    }
    practice
      .sessions('OP-1042')
      .then((ss) => {
        const done = ss.filter((s) => s.overall_score != null);
        setResolved((done[done.length - 1] ?? ss[ss.length - 1])?.session_id ?? 'ps_hist_6');
      })
      .catch(() => setResolved('ps_hist_6'));
  }, [sessionId]);

  const { data: report, loading } = useResource(() => (resolved ? practice.report(resolved) : Promise.resolve(undefined)), [resolved]);
  const overlay = useMemo(() => parseOverlay(report), [report]);
  const [phase, setPhase] = useState<string>('swing_loaded');

  if ((loading || !resolved) && !report) return <Loading label="Loading practice report" />;
  if (!report) return <EmptyState icon="query_stats" title="Report not available">Run a practice session first.</EmptyState>;

  const trainee = traineePhaseDurations(report);
  const expert = Object.fromEntries(WORK_PHASES.map((p) => [p, overlay.phases.find((x) => x.phase === p)?.expertDurationS ?? FALLBACK_EXPERT_S[p]]));
  const ph = overlay.phases.find((p) => p.phase === phase) ?? overlay.phases[0];
  const flagged = report.cycles.filter((c) => c.safety_flags.length > 0);
  const op = OPERATORS[report.trainee_id];
  const metrics = [...report.summary_metrics].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const channels = ph ? (allChannels ? ph.channels : ph.channels.filter((c) => LEVERS.includes(c.key))) : [];

  return (
    <div className="space-y-10">
      <TrainingTabs />
      <PageTitle title="You vs expert" sub={`${op?.name ?? report.trainee_id} · ${exerciseLabel(report.exercise)} · ${report.n_cycles} cycles`} />

      <div className="grid grid-cols-12 gap-8">
        <section className="panel col-span-12 flex flex-col gap-4 p-6 lg:col-span-5">
          <div className="flex items-end gap-4">
            <span className="font-display text-display-xl leading-none tnum">{Math.round(report.overall_score)}</span>
            <span className="pb-2">
              <ScoreBandChip band={report.score_band} size="lg" />
            </span>
          </div>
          <BandScale score={report.overall_score} />
          <div>
            <div className="mb-1 text-body-sm text-on-surface-muted">Score per cycle</div>
            <CycleSparkline report={report} />
          </div>
          {flagged.length > 0 && (
            <div className="flex items-start gap-2 text-body-md text-warning-text">
              <Icon name="warning" size={20} /> {flagged.length} of {report.n_cycles} cycles went past a site safety cap — they can never score as expert-like.
            </div>
          )}
        </section>
        <div className="col-span-12 lg:col-span-7">
          <ValueCard report={report} />
        </div>
      </div>

      <section>
        <h2 className="mb-4 font-display text-headline-md">Where the time goes</h2>
        <PhaseTimelineBar trainee={trainee} expert={expert} />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-headline-md">Key metrics</h2>
          {metrics.length > 4 && (
            <button type="button" className="flex items-center gap-1 text-body-md text-notice-dark hover:underline" onClick={() => setAllMetrics((v) => !v)}>
              {allMetrics ? 'Show fewer' : `All ${metrics.length} metrics`} <Icon name={allMetrics ? 'expand_less' : 'expand_more'} size={18} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {(allMetrics ? metrics : metrics.slice(0, 4)).map((m) => (
            <MetricCard key={m.name} m={m} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-headline-md">Your controls vs the expert envelope</h2>
          <div className="flex items-center gap-2">
            {overlay.phases.map((p) => (
              <button key={p.phase} type="button" onClick={() => setPhase(p.phase)} className={cx(ph?.phase === p.phase ? 'opacity-100' : 'opacity-40 hover:opacity-80')}>
                <PhaseChip phase={p.phase} />
              </button>
            ))}
          </div>
        </div>
        {ph ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {channels.map((ch) => (
              <TrajectoryChart key={ch.key} ch={ch} />
            ))}
          </div>
        ) : (
          <EmptyState icon="show_chart" title="No overlay in this report" />
        )}
        <div className="mt-3 flex items-center justify-between text-body-sm text-on-surface-muted">
          <span>Shaded = expert P10–P90 · dashed = expert median · line = you · time = % of the phase</span>
          {ph && ph.channels.length > channels.length && (
            <button type="button" className="text-notice-dark hover:underline" onClick={() => setAllChannels(true)}>
              Show swing speed and boom angle
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-headline-md">What to work on</h2>
        <div className="space-y-4">
          {report.tips.map((t, i) => (
            <TipCard key={t.tip_id} tip={t} rank={i + 1} report={report} />
          ))}
        </div>
      </section>

      <div className="flex items-center gap-6">
        <Button variant="primary" size="lg" icon="replay" onClick={() => nav('/training/practice')}>
          Practise again
        </Button>
        <Link to="/training/practice/progress" className="text-body-md text-notice-dark hover:underline">
          Progress across sessions
        </Link>
      </div>
      <SourceNote kinds={report.provenance?.length ? report.provenance : ['ML', 'SIMULATED']}>expert reference = simulated, safety-filtered expert operators · coaching only, not used for pay or discipline</SourceNote>
    </div>
  );
}
