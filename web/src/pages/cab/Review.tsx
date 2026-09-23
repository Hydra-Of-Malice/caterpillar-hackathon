import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { ExplanationBars } from '../../components/ExplanationBars';
import { ProvenanceBadges } from '../../components/ProvenanceBadge';
import { SignalIcon, SignalWordChip, normaliseSignalWord } from '../../components/SignalWordChip';
import { Button, Icon, Loading, cx, toast } from '../../components/ui';
import { edge } from '../../lib/api';
import { fmtClock, fmtDur } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { useShift } from '../../lib/shift';
import type { Alert } from '../../lib/types';

const TASK_COLOR: Record<string, string> = { truck_loading: '#0066FF', trenching: '#1AC69E', stockpile: '#FB5A00' };

/** Screen 8 — Post-shift review (operator, T0 coaching). */
export default function ShiftReviewPage() {
  const { data: shift } = useShift();
  const shiftId = shift?.shift.shift_id ?? null;
  const { data: r, loading } = useResource(() => (shiftId ? edge.shiftReview(shiftId) : Promise.resolve(undefined)), [shiftId]);
  const [picked, setPicked] = useState<Alert | null>(null);
  if (loading && !r) return <Loading label="Loading your shift review" />;
  if (!r) return <Loading label="Loading your shift review" />;

  const t0 = Math.min(...r.timeline.map((x) => x.t_start), shift?.shift.planned_start_ts ?? Infinity);
  const t1 = Math.max(...r.timeline.map((x) => x.t_end ?? x.t_start), shift?.shift.planned_end_ts ?? -Infinity);
  const pos = (t: number) => `${((t - t0) / (t1 - t0 || 1)) * 100}%`;
  const hours = Array.from({ length: Math.floor((t1 - t0) / 3600) + 1 }, (_, i) => t0 + i * 3600);
  const alertsLine = Object.entries(r.alerts_by_signal_word)
    .map(([w, n]) => `${n} ${w}`)
    .join(', ');
  const idle = r.idle_breakdown;
  const focus = r.focus;
  const waitingShare = r.totals.idle_min ? idle.waiting_min / r.totals.idle_min : 0;

  return (
    <div className="space-y-8 p-6">
      <header className="flex items-end justify-between">
        <h1 className="font-display text-headline-lg">Your shift review</h1>
        <span className="text-body-lg text-on-surface-muted">
          {r.date ?? 'Today'} · {r.totals.tasks_done} of {r.totals.tasks_total} tasks done
        </span>
      </header>

      <div className="grid grid-cols-4 gap-6">
        {[
          ['Operating', fmtDur(r.totals.operating_min), null],
          ['Material moved', `${Math.round(r.totals.material_m3)} m³`, null],
          ['Idle', fmtDur(r.totals.idle_min), `${Math.round(waitingShare * 100)}% waiting for trucks`],
          ['Alerts', String(Object.values(r.alerts_by_signal_word).reduce((a, b) => a + b, 0)), alertsLine || 'none'],
        ].map(([label, value, sub]) => (
          <div key={label} className="panel p-5">
            <div className="text-body-md text-on-surface-muted">{label}</div>
            <div className="mt-1 font-display text-headline-lg tnum">{value}</div>
            {sub && <div className="text-body-md text-on-surface-muted">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-4">
          <h2 className="mb-4 font-display text-headline-md">What went well</h2>
          <ul className="space-y-3">
            {r.well_done.map((w) => (
              <li key={w} className="flex items-start gap-3 text-body-lg">
                <Icon name="check_circle" className="mt-0.5 text-success-text" fill /> {w}
              </li>
            ))}
          </ul>
        </section>

        {focus && (
          <section className="panel col-span-8 border-l-4 p-6" style={{ borderLeftColor: '#0067B8' }}>
            <div className="flex items-center gap-3">
              <SignalWordChip word="NOTICE" size="sm" />
              <span className="font-display text-headline-md">{focus.title}</span>
            </div>
            <p className="mt-2 text-body-lg text-on-surface-variant">{focus.detail}</p>
            {focus.per_cycle && (
              <div className="mt-4 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={focus.per_cycle} margin={{ top: 4, right: 8, bottom: 14, left: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="cycle" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} label={{ value: 'Loading cycle', position: 'insideBottom', offset: -6, fill: 'var(--chart-tick)', fontSize: 11 }} />
                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} width={40} unit={focus.band?.unit === '°/s' ? '°' : ''} />
                    {focus.band && <ReferenceArea y1={focus.band.lo} y2={focus.band.hi} fill="var(--chart-band)" fillOpacity={0.08} />}
                    <Tooltip contentStyle={{ background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)' }} formatter={(v: number) => [`${v} ${focus.band?.unit ?? ''}`, 'Swing rate near truck']} />
                    <Bar dataKey="value" barSize={6}>
                      {focus.per_cycle.map((c) => (
                        <Cell key={c.cycle} fill={c.flagged ? '#E56C00' : '#4D94FF'} />
                      ))}
                    </Bar>
                    <Line dataKey="value" stroke="transparent" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-body-md text-on-surface-muted">{focus.evidence_line}</span>
              <Link to={`/training/module/${focus.module_id ?? 'MOD-SWING-APPROACH'}`}>
                <Button variant="primary" size="cab" icon="play_circle">
                  Start module
                </Button>
              </Link>
            </div>
          </section>
        )}
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-headline-md">Shift timeline</h2>
          <span className="text-body-md text-on-surface-muted">Tap a marker for details</span>
        </div>
        <div className="relative h-28 bg-surface-container-low">
          {r.timeline
            .filter((x) => x.kind !== 'alert')
            .map((x, i) => (
              <div
                key={i}
                className={cx('absolute top-10 flex h-10 items-center overflow-hidden px-2 font-display text-label-sm uppercase', x.kind === 'break' ? 'bg-surface-container-highest text-on-surface-variant' : x.kind === 'idle' ? 'top-[88px] h-4 bg-warning/40' : 'text-white')}
                style={{ left: pos(x.t_start), width: `calc(${pos(x.t_end ?? x.t_start)} - ${pos(x.t_start)})`, background: x.kind === 'task' ? TASK_COLOR[x.task_type ?? 'stockpile'] : undefined }}
                title={x.label}
              >
                {x.kind !== 'idle' && x.label}
              </div>
            ))}
          {r.timeline
            .filter((x) => x.kind === 'alert' && x.alert)
            .map((x) => {
              const w = normaliseSignalWord(x.alert!.signal_word, x.alert!.tier);
              return (
                <button key={x.alert!.alert_id} type="button" onClick={() => setPicked(x.alert!)} className="absolute top-1 -translate-x-1/2" style={{ left: pos(x.t_start) }} title={`${fmtClock(x.t_start)} ${x.label}`}>
                  <SignalIcon word={w} size={26} ink={w === 'DANGER' ? '#FFFFFF' : w === 'WARNING' ? '#E56C00' : '#F3C206'} fill={w === 'DANGER' ? '#C52320' : 'none'} />
                </button>
              );
            })}
          {hours.map((h) => (
            <span key={h} className="absolute bottom-0 -translate-x-1/2 font-display text-[11px] text-on-surface-muted" style={{ left: pos(h) }}>
              {fmtClock(h)}
            </span>
          ))}
        </div>
        {picked && (
          <div className="mt-3 grid grid-cols-12 gap-4 border border-outline-variant bg-surface-container-high p-4">
            <div className="col-span-5">
              <div className="flex items-center gap-2">
                <SignalWordChip word={picked.signal_word} tier={picked.tier} size="sm" />
                <span className="font-display text-label-md">{fmtClock(picked.ts)}</span>
                <ProvenanceBadges kinds={picked.provenance} />
              </div>
              <div className="mt-2 font-display text-headline-sm uppercase">{picked.what}</div>
              <div className="text-body-md text-on-surface-variant">Why: {picked.why}</div>
              <div className="text-body-md text-on-surface-variant">Do: {picked.do}</div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="md" icon="check" onClick={() => { toast('Thanks — marked as correct'); setPicked(null); }}>
                  This was correct
                </Button>
                <Button variant="secondary" size="md" icon="edit_note" onClick={() => { toast('Note added — your instructor will review it'); setPicked(null); }}>
                  This was wrong — add note
                </Button>
              </div>
            </div>
            <div className="col-span-7">{picked.explanation.length ? <ExplanationBars items={picked.explanation} compact /> : <p className="text-body-md text-on-surface-muted">Deterministic rule — no model explanation needed.</p>}</div>
          </div>
        )}
      </section>

      <p className="text-center text-body-md text-on-surface-muted">For your coaching only — not used for pay or discipline.</p>
    </div>
  );
}
