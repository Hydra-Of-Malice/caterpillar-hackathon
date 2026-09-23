import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GainChip, signed } from '../../components/GainChip';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { ScoreBandChip } from '../../components/practice/parts';
import { Button, EmptyState, Loading, PageTitle } from '../../components/ui';
import { practice } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { exerciseLabel } from '../../lib/practiceView';
import { OPERATORS } from '../../mocks/world';

const TRAINEES = ['OP-1042', 'OP-1019', 'OP-1033'];

/** Practice progress: score trend across sessions (GET /practice/sessions?trainee_id=). */
export default function PracticeProgress() {
  const [trainee, setTrainee] = useState('OP-1042');
  const { data: sessions, loading } = useResource(() => practice.sessions(trainee), [trainee]);
  const scored = (sessions ?? []).filter((s) => s.overall_score != null);
  const data = scored.map((s, i) => ({ n: i + 1, score: Math.round(s.overall_score as number), trench: s.exercise !== 'truck_loading_basic' ? Math.round(s.overall_score as number) : null, date: fmtDate(s.created_ts ?? null), id: s.session_id }));
  const first = data[0]?.score;
  const last = data[data.length - 1]?.score;
  const firstProficient = data.find((d) => d.score >= 65)?.n;

  return (
    <div className="space-y-8">
      <TrainingTabs />
      <PageTitle
        title="Progress"
        sub="Expert-likeness score per session."
        right={
          <>
            <select className="select h-10 w-auto" value={trainee} onChange={(e) => setTrainee(e.target.value)} aria-label="Trainee">
              {TRAINEES.map((t) => (
                <option key={t} value={t}>
                  {OPERATORS[t]?.name ?? t} ({t})
                </option>
              ))}
            </select>
          </>
        }
      />

      {loading && !sessions ? (
        <Loading label="Loading sessions" />
      ) : !data.length ? (
        <EmptyState icon="insights" title="No analysed sessions yet">
          <Link to="/training/practice" className="text-notice-dark underline">Run a demo trainee</Link> to start a trend.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {first !== undefined && last !== undefined && <GainChip size="lg" to={null}>{signed(last - first)} points since session 1</GainChip>}
            {firstProficient && <GainChip size="lg" to={null}>proficient at session {firstProficient}</GainChip>}
          </div>
          <section className="panel p-6">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 20, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" />
                  <ReferenceArea y1={65} y2={85} fill="#0067B8" fillOpacity={0.12} label={{ value: 'PROFICIENT', position: 'insideTopRight', fill: '#4DB1FF', fontSize: 11 }} />
                  <ReferenceArea y1={85} y2={100} fill="#197527" fillOpacity={0.16} label={{ value: 'EXPERT-LIKE', position: 'insideTopRight', fill: '#4CD964', fontSize: 11 }} />
                  <ReferenceLine y={40} stroke="var(--chart-tip-border)" strokeDasharray="3 3" label={{ value: 'DEVELOPING', position: 'insideBottomRight', fill: 'var(--chart-tick)', fontSize: 11 }} />
                  <XAxis dataKey="n" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} label={{ value: 'Practice session', position: 'insideBottom', offset: -8, fill: 'var(--chart-tick)', fontSize: 12 }} />
                  <YAxis domain={[0, 100]} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 12 }} label={{ value: 'Score (0–100)', angle: -90, position: 'insideLeft', fill: 'var(--chart-tick)', fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)' }} labelFormatter={(n) => `Session ${n}`} />
                  <Line dataKey="score" name="All sessions" stroke="#0066FF" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
                  <Line dataKey="trench" name="Trench — basic" stroke="#1AC69E" strokeWidth={0} dot={{ r: 6, fill: '#1AC69E' }} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-body-sm text-on-surface-muted">Blue = score per session · green dots = trench exercise.</p>
          </section>
          <section className="panel">
            <table className="table-dense w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Exercise</th>
                  <th>Score</th>
                  <th>Band</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scored.map((s, i) => (
                  <tr key={s.session_id}>
                    <td className="tnum">{i + 1}</td>
                    <td>{fmtDate(s.created_ts ?? null)}</td>
                    <td>{exerciseLabel(s.exercise)}</td>
                    <td className="font-display text-label-lg tnum">{Math.round(s.overall_score as number)}</td>
                    <td>{s.score_band && <ScoreBandChip band={s.score_band} />}</td>
                    <td className="text-right">
                      <Link to={`/training/practice/${s.session_id}`}>
                        <Button variant="secondary" size="sm" iconRight="arrow_forward">
                          Report
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
