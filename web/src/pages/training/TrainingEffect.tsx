import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CompetencyChip } from '../../components/CompetencyChip';
import { SourceNote } from '../../components/ProvenanceBadge';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { Details, SectionTitle } from '../../components/training/Details';
import { AFTER_COLOR, BEFORE_COLOR, RateRatioBar, ShiftRateChart, ShiftRateLegend, shiftRows, verdictText } from '../../components/training/rateCharts';
import { Chip, EmptyState, Loading, PageTitle, Panel } from '../../components/ui';
import { cloud } from '../../lib/api';
import { signed } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { DEMO_OPERATOR_ID } from '../../lib/persona';
import type { RateBlock } from '../../lib/types';
import { competencyLabel } from '../../mocks/world';

const COMPETENCY_ID = 'C04';
const CAVEAT = 'Simulated demo data — real results need a controlled trial.';

const rateOf = (b: RateBlock | undefined) => (!b ? 0 : Number.isFinite(b.rate) ? b.rate : b.opportunities ? b.events / b.opportunities : 0);
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

function Figure({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-body-sm text-on-surface-muted">{label}</div>
      <div className="tnum font-display text-headline-lg text-on-surface">{children}</div>
      {sub && <div className="text-body-sm text-on-surface-muted">{sub}</div>}
    </div>
  );
}

export default function TrainingEffect() {
  const { data, loading } = useResource(() => cloud.reassessment(DEMO_OPERATOR_ID, COMPETENCY_ID), []);

  const header = (
    <>
      <TrainingTabs />
      <PageTitle title="Did the training help?" sub={`${competencyLabel(COMPETENCY_ID)} — Ravi Kumar, before and after the module`} />
    </>
  );

  if (loading && !data) {
    return (
      <div className="space-y-8">
        {header}
        <Loading label="Loading before / after" />
      </div>
    );
  }
  if (!data || !data.pre || !data.post) {
    return (
      <div className="space-y-8">
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
  const hasCi = Number.isFinite(ci[0]) && Number.isFinite(ci[1]);
  const rr = Number.isFinite(data.rr) ? data.rr : preRate > 0 ? postRate / preRate : NaN;
  const includesNoChange = hasCi ? ci[0] <= 1 && ci[1] >= 1 : true;
  const verdict = verdictText(data.verdict, ci);
  const fewCycles = pre.opportunities + post.opportunities < 300 || post.opportunities < 100;
  const rows = shiftRows(data);

  const ratePctChange = Number.isFinite(rr) ? -(1 - rr) * 100 : NaN;
  const withinPp = ((1 - postRate) - (1 - preRate)) * 100;
  const verdictTone = includesNoChange ? 'blue' : rr < 1 ? 'green' : 'orange';

  return (
    <div className="space-y-8">
      {header}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        {/* chart */}
        <Panel className="space-y-4 p-6 xl:col-span-2">
          <SectionTitle sub="Share of truck-loading cycles, with 95% intervals">Fast swings near the truck, per shift</SectionTitle>
          <ShiftRateChart data={data} height={320} />
          <ShiftRateLegend />
          <SourceNote kinds={['RULE', 'SIMULATED']}>Detected by a versioned rule on simulated telemetry</SourceNote>
        </Panel>

        {/* figures + verdict */}
        <Panel className="space-y-6 p-6">
          <div className="space-y-2">
            <div className="text-body-sm text-on-surface-muted">Verdict</div>
            <Chip tone={verdictTone} icon={includesNoChange ? 'hourglass_top' : rr < 1 ? 'trending_down' : 'trending_up'} className="h-8">
              {verdict}
            </Chip>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            <Figure label="Before training" sub={`${pre.events} of ${pre.opportunities} cycles`}>
              {pct1(preRate)}
            </Figure>
            <Figure label="After training" sub={`${post.events} of ${post.opportunities} cycles`}>
              {pct1(postRate)}
            </Figure>
            <Figure label="Rate ratio" sub="after ÷ before">
              {Number.isFinite(rr) ? rr.toFixed(2) : '—'}
            </Figure>
            <Figure label="95% interval" sub="1.0 = no change">
              {hasCi ? `${ci[0].toFixed(2)}–${ci[1].toFixed(2)}` : '—'}
            </Figure>
          </div>
          <p className="text-body-sm text-on-surface-muted">{CAVEAT}</p>
          <Details>
            <div className="space-y-5">
              {Number.isFinite(rr) && hasCi && <RateRatioBar rr={rr} lo={ci[0]} hi={ci[1]} />}
              <p className="text-body-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">Why this is not proof yet. </span>
                {fewCycles ? 'Too few cycles to be sure. ' : ''}
                {includesNoChange ? 'The interval includes no change. ' : ''}
                Early events may also drop by chance (regression to the mean). Next: assessment with an instructor, and more shifts of data.
              </p>
              <table className="table-dense w-full">
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th className="text-right">Fast swings</th>
                    <th className="text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.shift}>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.phase === 'before' ? BEFORE_COLOR : AFTER_COLOR }} title={r.phase === 'before' ? 'Before training' : 'After training'} />
                          {r.shift}
                        </span>
                      </td>
                      <td className="text-right">
                        {r.events} of {r.opportunities}
                      </td>
                      <td className="text-right">{pct1(r.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Details>
        </Panel>
      </div>

      {/* status + gains */}
      <Panel className="grid grid-cols-1 gap-8 p-6 md:grid-cols-2">
        <div className="space-y-3">
          <SectionTitle as="h3">Competency status</SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <CompetencyChip state={data.competency_state ?? 'improving'} className="h-7" />
            <span className="text-body-md text-on-surface">Assessment scheduled with Marcus Lee</span>
          </div>
          <p className="text-body-sm text-on-surface-muted">
            Not yet DEMONSTRATED — an instructor must verify.{' '}
            <Link to="/training/booking?topic=C04" className="font-semibold text-notice-dark hover:underline">
              View booking
            </Link>
          </p>
        </div>
        <div className="space-y-3">
          <SectionTitle as="h3">Gains</SectionTitle>
          <div className="flex flex-col items-start gap-2">
            {Number.isFinite(ratePctChange) && (
              <span className="text-body-sm text-on-surface-muted" title="(1 − rate ratio) × 100 — simulated, not yet conclusive">
                {signed(ratePctChange, 0)}% fast-swing rate{includesNoChange ? ' (not yet conclusive)' : ''}
              </span>
            )}
            {Number.isFinite(withinPp) && (
              <span className="text-body-sm text-on-surface-muted" title="Change in the share of loading cycles without a fast swing near the truck, in percentage points">
                {signed(withinPp, 1)} pp cycles within expert range
              </span>
            )}
          </div>
          <SourceNote kinds={['SIMULATED', 'ESTIMATE']} className="!mt-1" />
        </div>
      </Panel>
    </div>
  );
}
