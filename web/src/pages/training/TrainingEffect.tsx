import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CompetencyChip } from '../../components/CompetencyChip';
import { DataSourceChip } from '../../components/DataSourceChip';
import { GainChip, signed } from '../../components/GainChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { RateRatioBar, ShiftRateChart, ShiftRateLegend, shiftRows, verdictText } from '../../components/training/rateCharts';
import { Chip, EmptyState, Icon, Label, Loading, PageTitle, Panel, PanelHeader, cx } from '../../components/ui';
import { cloud } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { DEMO_OPERATOR_ID } from '../../lib/persona';
import type { RateBlock } from '../../lib/types';
import { competencyLabel } from '../../mocks/world';

const COMPETENCY_ID = 'C04';

const rateOf = (b: RateBlock | undefined) => (!b ? 0 : Number.isFinite(b.rate) ? b.rate : b.opportunities ? b.events / b.opportunities : 0);
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

function Figure({ label, children, sub, className }: { label: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('space-y-1 border-b border-outline px-4 py-3 last:border-b-0', className)}>
      <Label>{label}</Label>
      <div className="font-display text-headline-md text-on-surface">{children}</div>
      {sub && <div className="text-body-sm text-on-surface-variant">{sub}</div>}
    </div>
  );
}

export default function TrainingEffect() {
  const { data, loading } = useResource(() => cloud.reassessment(DEMO_OPERATOR_ID, COMPETENCY_ID), []);

  const header = (
    <>
      <TrainingTabs />
      <div className="stripes-sim flex flex-wrap items-center gap-3 border-2 border-prov-sim px-4 py-3" role="note">
        <Icon name="science" size={24} className="text-prov-sim-text" />
        <ProvenanceBadge kind="SIMULATED" />
        <p className="font-display text-label-lg uppercase text-on-surface">Demo data (SIMULATED). Real results need a controlled trial.</p>
      </div>
      <PageTitle
        kicker="Training effect · before / after"
        title="Did the training help?"
        sub={`${competencyLabel(COMPETENCY_ID)} — Ravi Kumar · ${DEMO_OPERATOR_ID}`}
        right={
          <>
            <ProvenanceBadges kinds={['RULE', 'SIMULATED']} />
            <DataSourceChip endpoints={['/reassessment']} />
          </>
        }
      />
    </>
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {header}
        <Loading label="Loading before / after" />
      </div>
    );
  }
  if (!data || !data.pre || !data.post) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState icon="query_stats" title="No before / after data yet">
          The effect of training is measured over the shifts after the module is completed. Check back after your next shifts.
        </EmptyState>
      </div>
    );
  }

  const pre = data.pre;
  const post = data.post;
  const preRate = rateOf(pre);
  const postRate = rateOf(post);
  const ci: [number, number] = Array.isArray(data.ci95) && data.ci95.length === 2 ? data.ci95 : [NaN, NaN];
  const rr = Number.isFinite(data.rr) ? data.rr : preRate > 0 ? postRate / preRate : NaN;
  const includesNoChange = Number.isFinite(ci[0]) && Number.isFinite(ci[1]) ? ci[0] <= 1 && ci[1] >= 1 : true;
  const verdict = verdictText(data.verdict, ci);
  const fewCycles = pre.opportunities + post.opportunities < 300 || post.opportunities < 100;
  const rows = shiftRows(data);
  const trainedOn = data.training_completed ?? '23 Sep';

  const ratePctChange = Number.isFinite(rr) ? -(1 - rr) * 100 : NaN;
  const withinPp = ((1 - postRate) - (1 - preRate)) * 100;
  const verdictTone = includesNoChange ? 'blue' : rr < 1 ? 'green' : 'orange';

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* chart */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            icon="bar_chart"
            title="Fast swings near the truck, per shift"
            sub="Share of truck-loading cycles with a fast swing near the truck, with 95% intervals"
            right={<ProvenanceBadges kinds={['RULE', 'SIMULATED']} />}
          />
          <div className="space-y-3 p-4">
            <ShiftRateChart data={data} height={340} />
            <ShiftRateLegend />
            <div className="overflow-x-auto">
              <table className="table-dense w-full">
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th>Phase</th>
                    <th className="text-right">Fast swings</th>
                    <th className="text-right">Loading cycles</th>
                    <th className="text-right">Share</th>
                    <th className="text-right">95% interval</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.shift}>
                      <td className="font-display uppercase">{r.shift}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-on-surface-variant">
                          <span className="h-2.5 w-2.5" style={{ background: r.phase === 'before' ? '#0066FF' : '#1AC69E' }} />
                          {r.phase === 'before' ? 'Before training' : 'After training'}
                        </span>
                      </td>
                      <td className="text-right">{r.events}</td>
                      <td className="text-right">{r.opportunities}</td>
                      <td className="text-right">{pct1(r.rate)}</td>
                      <td className="text-right text-on-surface-variant">
                        {pct1(r.lo)}–{pct1(r.hi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-footnote text-on-surface-muted">
              Fast swing near the truck is detected by a deterministic, versioned rule on simulated telemetry. Training completed {trainedOn}.
            </p>
          </div>
        </Panel>

        {/* side card */}
        <div className="space-y-6">
          <Panel>
            <PanelHeader icon="compare_arrows" title="Before / after" right={<ProvenanceBadge kind="SIMULATED" />} />
            <Figure label="Before training" sub="Loading cycles with a fast swing near the truck">
              <span className="tnum">
                {pre.events} of {pre.opportunities}
              </span>{' '}
              <span className="text-headline-sm text-on-surface-muted">cycles ({pct1(preRate)})</span>
            </Figure>
            <Figure label="After training">
              <span className="tnum">
                {post.events} of {post.opportunities}
              </span>{' '}
              <span className="text-headline-sm text-on-surface-muted">cycles ({pct1(postRate)})</span>
            </Figure>
            <Figure
              label="Rate ratio (after ÷ before)"
              sub={
                Number.isFinite(ci[0]) ? (
                  <span className="tnum">
                    95% interval {ci[0].toFixed(2)}–{ci[1].toFixed(2)}
                  </span>
                ) : (
                  'Interval not available'
                )
              }
            >
              <span className="tnum">{Number.isFinite(rr) ? rr.toFixed(2) : '—'}</span>
            </Figure>
            {Number.isFinite(rr) && Number.isFinite(ci[0]) && (
              <div className="border-b border-outline px-4 pb-4 pt-1">
                <RateRatioBar rr={rr} lo={ci[0]} hi={ci[1]} />
              </div>
            )}
            <div className="space-y-2 px-4 py-3">
              <Label>Verdict</Label>
              <div>
                <Chip tone={verdictTone} icon={includesNoChange ? 'hourglass_top' : rr < 1 ? 'trending_down' : 'trending_up'} className="h-8">
                  {verdict}
                </Chip>
              </div>
            </div>
          </Panel>

          <div className="space-y-2 border border-outline-variant bg-surface-container-high p-4" role="note">
            <div className="flex items-center gap-2 font-display text-label-md uppercase text-on-surface">
              <Icon name="info" size={20} className="text-notice-dark" /> Why this is not proof yet
            </div>
            <p className="text-body-sm text-on-surface-variant">
              {fewCycles ? 'Too few cycles to be sure. ' : ''}
              {includesNoChange ? 'The interval includes no change. ' : ''}
              Early events may also drop by chance (regression to the mean). Next: assessment with an instructor, and more shifts of data.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* status */}
        <Panel accent="green" className="space-y-3 p-5 pl-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-label-md uppercase text-on-surface-muted">Competency status</span>
            <DataSourceChip endpoints={['/reassessment']} showLive={false} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CompetencyChip state={data.competency_state ?? 'improving'} className="h-8" />
            <span className="text-body-md text-on-surface">assessment scheduled with Marcus Lee</span>
            <ProvenanceBadge kind="MOCK" />
          </div>
          <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
            <Icon name="verified_user" size={18} className="mt-0.5 text-notice-dark" />
            Not yet DEMONSTRATED; an instructor must verify.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            <Link to="/training/booking?topic=C04" className="inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark hover:underline">
              View booking <Icon name="arrow_forward" size={16} />
            </Link>
            <Link to="/training/practice" className="inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark hover:underline">
              Practise in the analyser <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
        </Panel>

        {/* gains */}
        <Panel className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-label-md uppercase text-on-surface">
              <Icon name="trending_up" size={20} className="text-series-blue-light" /> Gains (operational units)
            </span>
            <ProvenanceBadges kinds={['SIMULATED']} />
          </div>
          <div className="flex flex-wrap gap-2">
            {Number.isFinite(ratePctChange) && (
              <GainChip size="lg" title="(1 − rate ratio) × 100 — simulated, not yet conclusive">
                {signed(ratePctChange, 0)}% fast-swing rate{includesNoChange ? ' (not yet conclusive)' : ''}
              </GainChip>
            )}
            {Number.isFinite(withinPp) && (
              <GainChip size="lg" title="Change in the share of loading cycles without a fast swing near the truck, in percentage points">
                {signed(withinPp, 1)} pp cycles within expert range
              </GainChip>
            )}
          </div>
          <p className="text-body-sm text-on-surface-muted">Shown in operational units only. Simulated data explains the method; it is not a measured result.</p>
          <Link to="/training/effectiveness" className="inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark hover:underline">
            Cohort view — training effectiveness <Icon name="arrow_forward" size={16} />
          </Link>
        </Panel>
      </div>
    </div>
  );
}
