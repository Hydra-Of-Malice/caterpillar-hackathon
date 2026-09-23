import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, ReferenceLine } from 'recharts';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { CHANNEL_COLOR, PhaseChip, ScoreBandChip } from '../../components/practice/parts';
import { SourceNote } from '../../components/ProvenanceBadge';
import { Button, Icon, PageTitle, Segmented, cx, toast } from '../../components/ui';
import { practice, practiceLiveWsUrl } from '../../lib/api';
import { CHANNEL_LABEL, fmtDate } from '../../lib/format';
import { useInterval, useResource } from '../../lib/hooks';
import { LIVE_CHANNELS, Z_BAND, buildReplay, hintFor, type LivePoint } from '../../lib/practiceReplay';
import { exerciseLabel } from '../../lib/practiceView';
import type { PracticeReport } from '../../lib/types';
import type { Archetype } from '../../mocks/practice';

type Mode = 'idle' | 'connecting' | 'ws' | 'replay' | 'waiting' | 'done';
type ChartPoint = Record<string, number | [number, number]> & { t: number };

const TRAINEES = [
  { id: 'OP-1042', name: 'Ravi Kumar (novice, 3 months)' },
  { id: 'OP-1019', name: 'Joe Mendes (intermediate)' },
  { id: 'OP-1033', name: 'Lena Ortiz (intermediate)' },
];
const WINDOW = 120; // 12 s at 10 Hz

function StripChart({ data, ch, zMode }: { data: ChartPoint[]; ch: string; zMode: boolean }) {
  const last = data[data.length - 1];
  const v = last?.[ch] as number | undefined;
  const band = last?.[`${ch}_band`] as [number, number] | undefined;
  const outside = v !== undefined && band ? v < band[0] || v > band[1] : false;
  const t0 = data[0]?.t ?? 0;
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-1">
      <div>
        <div className="font-display text-label-lg" style={{ color: CHANNEL_COLOR[ch] }}>
          {CHANNEL_LABEL[ch] ?? ch}
        </div>
        <div className={cx('font-display text-headline-sm tnum', outside ? 'text-warning-text' : 'text-on-surface')}>
          {v === undefined ? '—' : zMode ? `${v > 0 ? '+' : ''}${v.toFixed(1)}σ` : v.toFixed(2)}
        </div>
      </div>
      <div className="h-[86px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <XAxis dataKey="t" type="number" domain={[t0, t0 + WINDOW / 10]} hide />
            <YAxis domain={zMode ? [-4, 4] : [-1.1, 1.1]} ticks={zMode ? [-Z_BAND, 0, Z_BAND] : [-1, 0, 1]} tickFormatter={(x: number) => (zMode ? x.toFixed(1) : String(x))} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
            <ReferenceLine y={0} stroke="var(--chart-grid)" />
            <Area dataKey={`${ch}_band`} stroke="none" fill="var(--svg-text)" fillOpacity={0.13} isAnimationActive={false} />
            <Line dataKey={ch} stroke={CHANNEL_COLOR[ch] ?? '#0066FF'} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Practice Session Live (dark, in-cab style): exercise picker, "Run demo trainee" (cloud
 * POST /practice/demo/generate) with an archetype selector, the current cycle phase chip, a live
 * strip chart of the joystick channels against the shaded expert band, and a one-line hint.
 * Frames come from WS /practice/sessions/{id}/live; if that is unavailable the analysed session
 * is replayed from the report.
 */
export default function PracticeLive() {
  const nav = useNavigate();
  const { data: exercises } = useResource(() => practice.exercises(), []);
  const [exercise, setExercise] = useState('truck_loading_basic');
  const [trainee, setTrainee] = useState('OP-1042');
  const [archetype, setArchetype] = useState<Archetype>('novice_improving');
  const [cycles, setCycles] = useState(8);
  const [speed, setSpeed] = useState(2);
  const { data: sessions, reload: reloadSessions } = useResource(() => practice.sessions(trainee), [trainee]);

  const [mode, setMode] = useState<Mode>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<PracticeReport | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [cur, setCur] = useState<LivePoint | null>(null);
  const [hint, setHint] = useState<{ text: string; until: number } | null>(null);
  const [zMode, setZMode] = useState(false);
  const [source, setSource] = useState<'ws' | 'replay' | null>(null);
  const [opts, setOpts] = useState(false);
  const points = useRef<LivePoint[]>([]);
  const cursor = useRef(0);
  const ws = useRef<WebSocket | null>(null);
  const gotLive = useRef(false);
  const t0 = useRef<number | null>(null);

  useEffect(() => () => ws.current?.close(), []);

  const push = (p: LivePoint, asZ: boolean) => {
    const row: ChartPoint = { t: p.t };
    for (const ch of LIVE_CHANNELS) {
      if (asZ) {
        if (p.deviation[ch] !== undefined) {
          row[ch] = Math.max(-4, Math.min(4, p.deviation[ch]));
          row[`${ch}_band`] = [-Z_BAND, Z_BAND];
        }
      } else if (p.values[ch] !== undefined) {
        row[ch] = p.values[ch];
        row[`${ch}_band`] = p.band[ch];
      }
    }
    setChart((c) => [...c, row].slice(-WINDOW));
    setCur(p);
  };

  const startReplay = (rep: PracticeReport) => {
    ws.current?.close();
    points.current = buildReplay(rep);
    cursor.current = 0;
    setChart([]);
    setZMode(false);
    setSource('replay');
    setMode('replay');
  };

  useInterval(() => {
    if (mode !== 'replay' || !report) return;
    const pts = points.current;
    for (let k = 0; k < speed; k++) {
      const p = pts[cursor.current];
      if (!p) {
        setMode('done');
        reloadSessions();
        return;
      }
      cursor.current += 1;
      if (k === speed - 1) {
        push(p, false);
        const h = hintFor(report, p.phase, p.deviation);
        if (h) setHint({ text: h, until: Date.now() + 4000 });
      }
    }
  }, mode === 'replay' ? 100 : null);

  const openWs = (id: string, rep: PracticeReport | null, waitForMachine: boolean) => {
    gotLive.current = false;
    t0.current = null;
    let sock: WebSocket;
    try {
      sock = new WebSocket(`${practiceLiveWsUrl(id)}?speed=${speed}`);
    } catch {
      if (rep) startReplay(rep);
      return;
    }
    ws.current = sock;
    let fellBack = false;
    const fallback = () => {
      if (fellBack || gotLive.current || !rep || waitForMachine) return;
      fellBack = true;
      startReplay(rep);
    };
    const timer = setTimeout(() => {
      if (!gotLive.current) {
        sock.close();
        fallback();
      }
    }, 2500);
    sock.onmessage = (ev) => {
      let msg: { type?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'live' && msg.data) {
        const d = msg.data as { ts?: number; phase?: string; tau?: number; deviation?: Record<string, number>; hint?: string | null; cycle?: number };
        if (!gotLive.current) {
          gotLive.current = true;
          clearTimeout(timer);
          setChart([]);
          setZMode(true);
          setSource('ws');
          setMode('ws');
        }
        const ts = d.ts ?? Date.now() / 1000;
        t0.current = t0.current ?? ts;
        push({ t: ts - t0.current, phase: d.phase ?? 'idle', cycle: d.cycle ?? -1, tau: d.tau ?? 0, values: {}, band: {}, deviation: d.deviation ?? {} }, true);
        if (d.hint) setHint({ text: d.hint, until: Date.now() + 6000 });
      } else if (msg.type === 'status' && msg.data?.model_available === false) {
        clearTimeout(timer);
        sock.close();
        fallback();
      } else if (msg.type === 'report' || msg.type === 'finished') {
        setMode('done');
        reloadSessions();
      }
    };
    sock.onerror = () => {
      clearTimeout(timer);
      fallback();
    };
    sock.onclose = () => {
      clearTimeout(timer);
      if (gotLive.current) setMode((m) => (m === 'ws' ? 'done' : m));
    };
  };

  const runDemo = async () => {
    setMode('connecting');
    setHint(null);
    setCur(null);
    try {
      const r = await practice.demoGenerate(archetype, cycles, exercise, trainee);
      const rep = r.report ?? (await practice.report(r.session_id));
      setSessionId(r.session_id);
      setReport(rep);
      openWs(r.session_id, rep, false);
    } catch (e) {
      toast(`Could not start the demo trainee: ${(e as Error).message}`, 'error');
      setMode('idle');
    }
  };

  const connectMachine = async () => {
    setMode('connecting');
    try {
      const s = await practice.create(trainee, exercise);
      setSessionId(s.session_id);
      setReport(null);
      setMode('waiting');
      openWs(s.session_id, null, true);
    } catch (e) {
      toast((e as Error).message, 'error');
      setMode('idle');
    }
  };

  const finish = async () => {
    if (!sessionId) return;
    ws.current?.close();
    const rep = await practice.finish(sessionId).catch(() => null);
    if (rep) nav(`/training/practice/${sessionId}`);
    else toast('No samples received yet — nothing to analyse', 'info');
  };

  const running = mode === 'replay' || mode === 'ws';
  const total = report?.n_cycles ?? cycles;
  const showHint = hint && hint.until > Date.now() ? hint.text : null;
  const exList = exercises?.length ? exercises : [{ exercise_id: 'truck_loading_basic', title: 'Truck loading — basic' }, { exercise_id: 'trench_basic', title: 'Trench — basic' }];
  const done = mode === 'done' && !!sessionId;

  return (
    <div className="space-y-8">
      <TrainingTabs />
      <PageTitle title="Practice session" sub="Your controls, phase by phase, against an envelope learned from expert operators." />

      <section className="flex flex-wrap items-end gap-8">
        <div>
          <div className="mb-2 text-body-md text-on-surface-muted">Exercise</div>
          <div className="flex gap-2">
            {exList.map((ex) => (
              <button
                key={ex.exercise_id}
                type="button"
                onClick={() => setExercise(ex.exercise_id)}
                className={cx('h-12 border px-4 text-body-md', exercise === ex.exercise_id ? 'border-on-surface bg-on-surface text-surface' : 'border-outline-variant hover:bg-surface-container-high')}
              >
                {(ex.title ?? ex.label ?? exerciseLabel(ex.exercise_id)).replace(' - ', ' — ').replace(/ dig and cast to spoil/, '')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-body-md text-on-surface-muted">Demo trainee</div>
          <Segmented
            value={archetype}
            onChange={setArchetype}
            options={[
              { value: 'novice', label: 'Novice' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'novice_improving', label: 'Improving' },
              { value: 'expert', label: 'Expert' },
            ]}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="md" iconRight={opts ? 'expand_less' : 'expand_more'} onClick={() => setOpts((o) => !o)}>
            Options
          </Button>
          <Button variant={done ? 'secondary' : 'primary'} size="lg" icon="smart_toy" disabled={mode === 'connecting'} onClick={() => void runDemo()}>
            Run demo trainee
          </Button>
        </div>
      </section>
      {opts && (
        <section className="flex flex-wrap items-center gap-6 bg-surface-container-low px-6 py-4 text-body-md">
          <label className="flex items-center gap-2">
            Trainee
            <select className="select h-10 w-auto" value={trainee} onChange={(e) => setTrainee(e.target.value)}>
              {TRAINEES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Cycles
            <select className="select h-10 w-20" value={cycles} onChange={(e) => setCycles(Number(e.target.value))}>
              {[4, 6, 8, 12].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Speed
            <select className="select h-10 w-20" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" size="md" icon="cable" disabled={mode === 'connecting'} onClick={() => void connectMachine()}>
            Connect practice machine
          </Button>
          <Button variant="secondary" size="md" icon="stop_circle" disabled={!sessionId || mode === 'idle'} onClick={() => void finish()}>
            Finish session
          </Button>
        </section>
      )}

      <div className="grid grid-cols-12 gap-8">
        <section className="panel col-span-12 p-6 xl:col-span-9">
          <div className="flex items-center gap-6">
            {cur ? <PhaseChip phase={cur.phase} size="xl" /> : <span className="flex h-16 items-center bg-surface-container-high px-6 font-display text-headline-md uppercase text-on-surface-muted">Waiting</span>}
            <div className="flex-1">
              <div className="font-display text-headline-md tnum">
                {cur && cur.cycle >= 0 ? `Cycle ${cur.cycle + 1} of ${total}` : mode === 'waiting' ? 'Waiting for machine samples…' : mode === 'connecting' ? 'Simulating trainee…' : 'Ready'}
              </div>
              <div className="mt-2 h-1.5 w-64 bg-surface-container-high">
                <div className="h-full bg-cat transition-all" style={{ width: `${Math.round((cur?.tau ?? 0) * 100)}%` }} />
              </div>
            </div>
          </div>

          <div className={cx('mt-6 flex min-h-[56px] items-center gap-3 px-4', showHint ? 'bg-notice/10 text-notice-dark' : 'text-on-surface-muted')}>
            <Icon name={showHint ? 'lightbulb' : 'check_circle'} size={26} className={showHint ? '' : 'text-success-text'} />
            <span className="font-display text-headline-sm">{showHint ?? (running ? 'On the expert line — keep it smooth' : 'Run a demo trainee to see live coaching')}</span>
          </div>

          <div className="mt-6">
            {LIVE_CHANNELS.map((ch) => (
              <StripChart key={ch} data={chart} ch={ch} zMode={zMode} />
            ))}
            <div className="mt-3 text-body-sm text-on-surface-muted">
              Shaded = expert band (P10–P90) · line = trainee {zMode ? 'deviation (σ)' : 'lever command'} · last 12 s
            </div>
          </div>

          {done && (
            <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-outline pt-6">
              {report && (
                <div className="flex items-center gap-3 text-body-lg">
                  Score <b className="font-display text-headline-md tnum">{Math.round(report.overall_score)}</b> / 100 <ScoreBandChip band={report.score_band} />
                </div>
              )}
              <span className="flex-1" />
              <Button variant="primary" size="lg" iconRight="arrow_forward" onClick={() => nav(`/training/practice/${sessionId}`)}>
                You vs expert report
              </Button>
            </div>
          )}
          <SourceNote kinds={['ML', 'SIMULATED']}>{source === 'ws' ? 'live frames over WebSocket' : source === 'replay' ? 'replay of the analysed session' : ''}</SourceNote>
        </section>

        <aside className="col-span-12 xl:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="font-display text-headline-sm">Recent sessions</span>
            <Link to="/training/practice/progress" className="text-body-md text-notice-dark hover:underline">
              Progress
            </Link>
          </div>
          <ul className="divide-y divide-outline">
            {(sessions ?? [])
              .slice()
              .reverse()
              .slice(0, 6)
              .map((s) => (
                <li key={s.session_id}>
                  <Link to={`/training/practice/${s.session_id}`} className="flex items-center justify-between gap-2 py-3 hover:text-notice-dark">
                    <span className="min-w-0">
                      <span className="block truncate text-body-md">{exerciseLabel(s.exercise)}</span>
                      <span className="block text-body-sm text-on-surface-muted">{fmtDate(s.created_ts ?? null)}</span>
                    </span>
                    <span className="font-display text-headline-sm tnum">{s.overall_score != null ? Math.round(s.overall_score) : '—'}</span>
                  </Link>
                </li>
              ))}
            {!sessions?.length && <li className="py-3 text-body-md text-on-surface-muted">No sessions yet.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
