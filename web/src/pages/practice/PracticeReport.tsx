import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { DataSourceChip } from '../../components/DataSourceChip';
import { GainChip, signed } from '../../components/GainChip';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { BandScale, CycleSparkline, MetricCard, PhaseChip, PhaseTimelineBar, ScoreBandChip, TipCard, TrajectoryChart } from '../../components/practice/parts';
import { ProvenanceBadges } from '../../components/ProvenanceBadge';
import { Button, EmptyState, Icon, Loading, PageTitle, cx } from '../../components/ui';
import { practice } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { WORK_PHASES, exerciseLabel, parseOverlay, practiceGains, traineePhaseDurations } from '../../lib/practiceView';
import type { PracticeReport } from '../../lib/types';
import { OPERATORS } from '../../mocks/world';

const FALLBACK_EXPERT_S: Record<string, number> = { dig: 6.5, swing_loaded: 4.5, dump: 2.4, swing_empty: 4.1 };

function ValueCard({ report }: { report: PracticeReport }) {
  const g = practiceGains(report);
  if (!g.trainee || !g.expert) return null;
  const data = [
    { name: 'You', v: g.trainee, fill: '#0066FF' },
    { name: 'Expert', v: g.expert, fill: '#1AC69E' },
  ];
  return (
    <section className="border-2 border-series-blue-light/60 bg-surface-container p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-headline-sm uppercase">
          <Icon name="trending_up" className="text-series-blue-light" /> Value of closing the gap
        </h2>
        <span className="flex items-center gap-1">
          <ProvenanceBadges kinds={['ESTIMATE', 'SIMULATED']} />
        </span>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <XAxis type="number" hide domain={[0, Math.max(g.trainee, g.expert) * 1.1]} />
              <YAxis type="category" dataKey="name" stroke="var(--chart-axis)" tick={{ fill: 'var(--svg-text)', fontSize: 13, fontFamily: 'Roboto Condensed' }} width={56} />
              <Bar dataKey="v" isAnimationActive={false} barSize={26}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
                <LabelList dataKey="v" position="right" formatter={(v: number) => `${Math.round(v)} m³/h`} fill="var(--svg-text)" fontSize={13} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="col-span-7 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-outline bg-surface-container-low p-3">
              <div className="font-display text-label-sm uppercase text-on-surface-muted">Time to move 420 m³ (Bench 3 task)</div>
              <div className="font-display text-headline-md tnum">
                {g.hoursFor420?.toFixed(1)} h <span className="text-headline-sm text-on-surface-muted">vs expert {g.expertHoursFor420?.toFixed(1)} h</span>
              </div>
            </div>
            <div className="border border-outline bg-surface-container-low p-3">
              <div className="font-display text-label-sm uppercase text-on-surface-muted">Gap to expert pace</div>
              <div className="font-display text-headline-md tnum">{g.gapPct !== undefined ? `${g.gapPct.toFixed(0)}% lower output` : '—'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.m3PerShift !== undefined && <GainChip size="lg">+{g.m3PerShift.toFixed(0)} m³ per shift</GainChip>}
            {g.secondsPerCycle !== undefined && g.secondsPerCycle > 0.05 && <GainChip size="lg">{signed(-g.secondsPerCycle, 1)} s per cycle</GainChip>}
            {g.upliftPct !== undefined && <GainChip size="lg">{signed(g.upliftPct)}% output vs your baseline</GainChip>}
            {g.fuelSavedL !== undefined && g.fuelSavedL > 0 && <GainChip size="lg">−{g.fuelSavedL.toFixed(0)} L fuel per year</GainChip>}
          </div>
          <p className="text-body-sm text-on-surface-muted">
            If you close {Math.round(g.closure * 100)}% of your gap to the expert (value-model assumption). Gains in operational units; expert = SIMULATED professional operators. See Business Value for the assumptions.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Practice Report "You vs Expert" (PracticeReport schema): overall score and band, phase timeline,
 * metric cards with expert P10–P90, trajectory overlays per phase, ranked coaching tips with
 * "Start module", per-cycle score sparkline, and the gains of closing the gap.
 */
export default function PracticeReportPage() {
  const { sessionId = '' } = useParams();
  const nav = useNavigate();
  const [resolved, setResolved] = useState<string | null>(sessionId === 'latest' ? null : sessionId);
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

  return (
    <div className="space-y-5">
      <TrainingTabs />
      <PageTitle
        kicker={`Practice report · ${exerciseLabel(report.exercise)} · ${report.n_cycles} cycles`}
        title="You vs expert"
        sub={`${op?.name ?? report.trainee_id} (${report.trainee_id}) · session ${report.session_id} · model ${report.model_version}`}
        right={
          <>
            <ProvenanceBadges kinds={report.provenance?.length ? report.provenance : ['ML', 'SIMULATED']} />
            <DataSourceChip endpoints={['/practice/sessions', '/practice/demo']} modelBacked />
          </>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <section className="panel col-span-12 flex flex-col gap-3 p-5 lg:col-span-4">
          <div className="font-display text-label-md uppercase text-on-surface-muted">Expert-likeness score</div>
          <div className="flex items-end gap-3">
            <span className="font-display text-display-xl leading-none tnum">{Math.round(report.overall_score)}</span>
            <span className="pb-2 font-display text-headline-md text-on-surface-muted">/ 100</span>
            <span className="pb-2">
              <ScoreBandChip band={report.score_band} size="lg" />
            </span>
          </div>
          <BandScale score={report.overall_score} />
          <div>
            <div className="mb-1 font-display text-label-sm uppercase text-on-surface-muted">Score per cycle</div>
            <CycleSparkline report={report} />
          </div>
          {flagged.length > 0 && (
            <div className="flex items-start gap-2 border border-warning bg-warning/10 p-2 text-body-sm text-warning-text">
              <Icon name="warning" size={18} /> {flagged.length} of {report.n_cycles} cycles went past a site safety cap ({Array.from(new Set(flagged.flatMap((c) => c.safety_flags))).join(', ').replace(/_/g, ' ')}). Those cycles can never score as expert-like.
            </div>
          )}
        </section>

        <div className="col-span-12 space-y-4 lg:col-span-8">
          <ValueCard report={report} />
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-headline-sm uppercase">Where the time goes — per phase</h2>
              <span className="font-display text-label-sm uppercase text-on-surface-muted">mean of your cycles vs expert median</span>
            </div>
            <PhaseTimelineBar trainee={trainee} expert={expert} />
          </section>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-display text-headline-sm uppercase">How you compare — metrics</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {report.summary_metrics.map((m) => (
            <MetricCard key={m.name} m={m} />
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-headline-sm uppercase">Trajectory overlay — your controls over the expert envelope</h2>
          <div className="flex gap-1">
            {overlay.phases.map((p) => (
              <button key={p.phase} type="button" onClick={() => setPhase(p.phase)} className={cx('border-2', ph?.phase === p.phase ? 'border-cat' : 'border-transparent opacity-70 hover:opacity-100')}>
                <PhaseChip phase={p.phase} />
              </button>
            ))}
          </div>
        </div>
        {ph ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ph.channels.map((ch) => (
              <TrajectoryChart key={ch.key} ch={ch} />
            ))}
          </div>
        ) : (
          <EmptyState icon="show_chart" title="No overlay in this report" />
        )}
        <p className="mt-2 text-body-sm text-on-surface-muted">{overlay.label ?? 'Expert band = P10–P90 of SIMULATED, safety-filtered expert cycles; trainee = mean of your cycles.'} Time is normalised to 0–100% of each phase.</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-headline-sm uppercase">Coaching tips — ranked</h2>
          <span className="font-display text-label-sm uppercase text-on-surface-muted">Safety tips come first; each links to a module</span>
        </div>
        <div className="space-y-2">
          {report.tips.map((t, i) => (
            <TipCard key={t.tip_id} tip={t} rank={i + 1} report={report} />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" icon="replay" onClick={() => nav('/training/practice')}>
          Practise again
        </Button>
        <Link to="/training/practice/progress">
          <Button variant="secondary" size="lg" icon="insights">
            Progress across sessions
          </Button>
        </Link>
        <span className="text-body-sm text-on-surface-muted">Report generated {fmtDate(report.cycles[0]?.t_start)} · coaching only — not used for pay or discipline.</span>
      </div>
    </div>
  );
}
