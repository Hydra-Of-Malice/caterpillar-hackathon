import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataSourceChip } from '../components/DataSourceChip';
import { ProvenanceBadges, SourceNote } from '../components/ProvenanceBadge';
import { Button, Icon, cx, toast } from '../components/ui';
import { cloud, edge, practice } from '../lib/api';
import { triggerFastForward, triggerInject, triggerWan, type TriggerResult } from '../lib/demo';
import { localPreview, useLive } from '../lib/live';
import { useShowSources } from '../lib/prefs';
import type { DemoInjectKind } from '../lib/types';

type Trigger = { kind: 'inject'; inject: DemoInjectKind } | { kind: 'wan' } | { kind: 'ff' } | { kind: 'hb' };

interface Row {
  id: string;
  title: string;
  desc: string;
  chips: string[];
  to: string;
  endpoints?: string[];
  modelBacked?: boolean;
  trigger?: Trigger;
  liveSafety?: boolean;
}

const GROUPS: Array<{ id: string; title: string; icon: string; rows: Row[] }> = [
  {
    id: 'r1', title: 'R1 · Daily task dashboard', icon: 'dashboard',
    rows: [
      { id: 'start', title: 'Shift start & privacy notice', desc: 'Badge / ID sign-in (MOCK), today at a glance, "What CAT Sentinel records" before the check.', chips: ['MOCK', 'SIMULATED'], to: '/cab/start', endpoints: ['GET /shift/current'] },
      { id: 'home', title: 'Operator home: tasks, progress, P10–P90 estimates', desc: 'Three tasks with progress bars, estimate range bar with a now-marker, "why this estimate?" drivers.', chips: ['ML', 'SIMULATED'], to: '/cab/home', endpoints: ['GET /tasks'], modelBacked: true },
      { id: 'crew', title: 'Crew overview — no ranking', desc: 'Machines & operators, protection status, escalations, gains today in operational units.', chips: ['RULE', 'SIMULATED'], to: '/supervisor', endpoints: ['/supervisor/'] },
    ],
  },
  {
    id: 'r2', title: 'R2 · Operator safety', icon: 'health_and_safety',
    rows: [
      { id: 'checklist', title: 'Pre-shift check with live safety chips', desc: 'PASS / FAIL / N/A, defect notes; a failed critical item blocks shift start (409) and opens an incident.', chips: ['RULE'], to: '/cab/checklist', endpoints: ['/checklist'] },
      { id: '5a', title: '5a DANGER — seatbelt unfastened while moving', desc: 'Deterministic rule in the independent safety process; arrives over MQTT even if the edge API is down. No dismiss.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'seatbelt_open' }, liveSafety: true },
      { id: '5b', title: '5b DANGER — person in rear danger zone', desc: 'Rear sector fills red with a person icon (no identity). "Stop swing. Confirm the area is clear."', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'person_rear' }, liveSafety: true },
      { id: 'pw', title: 'WARNING — person in the 8 m warning ring', desc: 'Warning sector highlighted; acknowledge required.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'person_warning' }, liveSafety: true },
      { id: '5c', title: '5c WARNING — fast swing near truck + WHY', desc: 'Swing above your own truck-loading range; ACKNOWLEDGE, NOT CORRECT? feedback, explanation bars vs your usual band.', chips: ['RULE', 'ML'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'fast_swing' }, liveSafety: true },
      { id: '5e', title: '5e WARNING — break recommended (T3)', desc: 'Fast-forward 150 min of operation: START BREAK or REMIND ME IN 10 MIN (once) → supervisor-notified chip.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'ff' }, liveSafety: true },
      { id: '5f', title: '5f PROTECTION DEGRADED — proximity sensor fault', desc: 'Hazard band across the top rail, proximity diagram greyed with NO SIGNAL and the last good reading.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'prox_sensor_fault' }, liveSafety: true },
      { id: 'hb', title: 'Heartbeat watchdog (3 s)', desc: 'No safety heartbeat for 3 s → PROTECTION DEGRADED. Local preview pauses the heartbeat for 12 s.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'hb' }, liveSafety: true },
      { id: 'wan', title: 'Cloud offline — store and forward', desc: 'WAN down: "CLOUD OFFLINE — events queued · Safety checks still running on this machine". Toggle again to restore.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'wan' }, liveSafety: true },
      { id: 'log', title: 'Quick incident / near-miss log', desc: 'LOG INCIDENT in the bottom bar: 6 tiles, severity, auto-attached context, voice note (MOCK).', chips: ['MANUAL', 'RULE'], to: '/cab/operate', endpoints: ['POST /incidents'] },
      { id: 'inc', title: 'Incident log with detail drawer', desc: 'Filters, 60 s timeline around the event, why flagged, operator note / dispute, review actions.', chips: ['RULE', 'ML', 'MANUAL'], to: '/incidents', endpoints: ['GET /incidents'] },
      { id: 'break', title: 'Break screen', desc: '10-minute countdown, optional research alertness rating (only you and the study team).', chips: ['RULE'], to: '/cab/break', endpoints: ['/breaks/'] },
    ],
  },
  {
    id: 'r3', title: 'R3 · Training hub', icon: 'school',
    rows: [
      { id: 'hub', title: 'Recommended modules from competency gaps', desc: 'Why recommended (evidence), 14 competencies; DEMONSTRATED only with instructor initials.', chips: ['RULE', 'SIMULATED'], to: '/training', endpoints: ['/training/recommendations', '/operators/'] },
      { id: 'module', title: 'Module player + "Ask the Manual"', desc: 'Key points with citations; copilot answers only from approved documents — extractive and refused modes.', chips: ['ML', 'MOCK'], to: '/training/module/MOD-SWING-APPROACH', endpoints: ['/copilot', '/training/modules'] },
      { id: 'quiz', title: 'Scenario quiz', desc: 'Question cards with cited feedback; pass never sets DEMONSTRATED for safety-critical skills.', chips: ['RULE'], to: '/training/quiz/MOD-SWING-APPROACH', endpoints: ['/training/quiz'] },
      { id: 'book', title: 'Instructor & simulator booking', desc: 'Instructor slots, confirm booking.', chips: ['MOCK'], to: '/training/booking', endpoints: ['/instructors', '/bookings'] },
      { id: 'effect', title: 'Did the training help? (before/after)', desc: 'RR 0.51, 95% CI 0.05–2.70 — "trending better, not yet conclusive".', chips: ['SIMULATED'], to: '/training/effect', endpoints: ['/reassessment'] },
      { id: 'instr', title: 'Instructor workspace', desc: 'Competency heatmap (states, never scores), verify DEMONSTRATED (403 unless instructor), content review with citation check.', chips: ['RULE'], to: '/instructor', endpoints: ['/instructor/'] },
      { id: 'review', title: 'Post-shift review — one thing to work on', desc: 'Well-done list, focus item with evidence line and per-cycle chart, shift timeline with alert markers.', chips: ['ML', 'RULE', 'SIMULATED'], to: '/cab/review', endpoints: ['/review/shift'] },
    ],
  },
  {
    id: 'r4', title: 'R4 · Unusual behaviour & idle', icon: 'troubleshoot',
    rows: [
      { id: '5d', title: '5d CAUTION — engine idling, no truck waiting', desc: 'Context-aware idle rule; auto-clears.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'idle' }, liveSafety: true },
      { id: 'wait', title: 'Waiting for truck → idle not flagged', desc: 'Operator taps WAITING FOR TRUCK; idle is suppressed with a reason line.', chips: ['RULE'], to: '/cab/operate', trigger: { kind: 'inject', inject: 'truck_wait' }, liveSafety: true },
      { id: 'hyd', title: 'Machine vs operator — hydraulic fault', desc: 'Pressure spikes seen across operators are attributed to the machine and kept out of coaching.', chips: ['ML', 'RULE'], to: '/anomaly', trigger: { kind: 'inject', inject: 'hyd_fault' }, liveSafety: true },
      { id: 'anom', title: 'Unusual operation & idle analysis', desc: 'Idle stacked by reason, flagged windows by category, "what caused it?", Isolation Forest per task.', chips: ['ML', 'RULE', 'SIMULATED'], to: '/anomaly', endpoints: ['/idle/', '/behaviour/'], modelBacked: true },
    ],
  },
  {
    id: 'r5', title: 'R5 · Task-time estimation', icon: 'timer',
    rows: [
      { id: 'tasks', title: 'Plan a task: P10–P90 estimate and drivers', desc: 'What moves the estimate (+/− minutes), calibration chip, low-data state, estimate vs actual.', chips: ['ML', 'SIMULATED'], to: '/tasks', endpoints: ['/eta/preview'], modelBacked: true },
      { id: 'eta', title: 'Live remaining-time estimate in the cab', desc: 'Finish time with range and now-marker on Operate and Home.', chips: ['ML', 'SIMULATED'], to: '/cab/operate', endpoints: ['GET /live/snapshot'] },
    ],
  },
  {
    id: 'practice', title: 'Practice Analyser · Expert Motion Model', icon: 'sports_esports',
    rows: [
      { id: 'pl', title: 'Live session vs expert band', desc: 'Run a demo trainee (novice / intermediate / improving / expert): phase chip, joystick strip chart vs shaded expert band, live hint.', chips: ['ML', 'SIMULATED'], to: '/training/practice', endpoints: ['/practice/'], modelBacked: true },
      { id: 'pr', title: 'Report — You vs Expert', desc: 'Score & band, phase timeline, metric cards with expert P10–P90, trajectory overlays, ranked tips with gains.', chips: ['ML', 'SIMULATED'], to: '/training/practice/latest', endpoints: ['/practice/sessions'], modelBacked: true },
      { id: 'pp', title: 'Progress across sessions', desc: 'Score trend per trainee from the session history.', chips: ['ML', 'SIMULATED'], to: '/training/practice/progress', endpoints: ['GET /practice/sessions'], modelBacked: true },
      { id: 'te', title: 'Training effectiveness (cohort)', desc: 'Coached vs control learning curves, sessions to proficiency, effect-size slider.', chips: ['ML', 'SIMULATED'], to: '/training/effectiveness', endpoints: ['/practice/cohort-sim'], modelBacked: true },
    ],
  },
  {
    id: 'sys', title: 'System & traceability', icon: 'query_stats',
    rows: [
      { id: 'sys', title: 'Diagnostics, model cards, traceability, privacy', desc: 'Measured rule latency, data sources, model cards, drift; R1–R5 matrix; who sees what.', chips: ['ML', 'RULE', 'SIMULATED'], to: '/diagnostics', endpoints: ['GET /models'], modelBacked: true },
    ],
  },
];

function loadSeen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('sentinel.tour') ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Demo Tour for judges: every functional outcome with its status, "Show me" and "Trigger". */
export default function DemoTour() {
  const nav = useNavigate();
  const live = useLive();
  const showSources = useShowSources();
  const [seen, setSeen] = useState<Record<string, boolean>>(loadSeen);
  const [busy, setBusy] = useState<string | null>(null);

  // Probe the read endpoints once so every row shows LIVE / MOCK / DEMO FIXTURE.
  useEffect(() => {
    const probes: Array<Promise<unknown>> = [
      edge.health(), edge.shiftCurrent().then((s) => edge.shiftReview(s.shift.shift_id)), edge.tasks(), edge.checklistItems(), edge.incidents(), edge.liveSnapshot(),
      cloud.profile('OP-1042'), cloud.recommendations('OP-1042'), cloud.modules(), cloud.reassessment('OP-1042', 'C04'), cloud.crewSummary(), cloud.idleSummary('2026-09-23'),
      cloud.behaviourEvents(), cloud.models(), cloud.instructorOperators(), cloud.instructors(), practice.sessions('OP-1042'), practice.exercises(), practice.cohortSim(),
    ];
    probes.forEach((p) => p.catch(() => undefined));
  }, []);

  const mark = (id: string, value = true) =>
    setSeen((s) => {
      const next = { ...s, [id]: value };
      try {
        localStorage.setItem('sentinel.tour', JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  const run = async (row: Row) => {
    if (!row.trigger) return;
    setBusy(row.id);
    let r: TriggerResult = 'mock';
    if (row.trigger.kind === 'inject') r = await triggerInject(row.trigger.inject);
    else if (row.trigger.kind === 'ff') r = await triggerFastForward(150);
    else if (row.trigger.kind === 'wan') r = await triggerWan(live.cloudOffline);
    else localPreview('heartbeat_loss');
    setBusy(null);
    mark(row.id);
    toast(r === 'live' ? 'Triggered on the edge (live) — opening the screen' : 'Edge unreachable — triggered in the in-browser MOCK engine', r === 'live' ? 'ok' : 'info');
    nav(row.to);
  };

  const total = GROUPS.reduce((a, g) => a + g.rows.length, 0);
  const done = Object.values(seen).filter(Boolean).length;
  const safetyLive = live.mqtt === 'open' || live.edgeWs === 'open';

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-headline-lg">Demo tour</h1>
          <p className="mt-2 text-body-lg text-on-surface-variant">Every functional outcome, with a link to the screen and a trigger for live states.</p>
        </div>
        <div className="flex items-center gap-4 text-body-md text-on-surface-muted">
          <span className="tnum">
            {done} / {total} shown
          </span>
          <button type="button" className="hover:text-on-surface" onClick={() => { setSeen({}); try { localStorage.removeItem('sentinel.tour'); } catch { /* ignore */ } }}>
            Reset
          </button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-x-6 gap-y-2 text-body-md">
        {GROUPS.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="text-notice-dark hover:underline">
            {g.title}
          </a>
        ))}
      </nav>
      {GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-24">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-headline-md">{g.title}</h2>
            <span className="text-body-md text-on-surface-muted tnum">
              {g.rows.filter((r) => seen[r.id]).length} / {g.rows.length}
            </span>
          </div>
          <ul className="panel divide-y divide-outline">
            {g.rows.map((row) => (
              <li key={row.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-5 px-5 py-4">
                <button type="button" onClick={() => mark(row.id, !seen[row.id])} aria-label={seen[row.id] ? 'Mark as not shown' : 'Mark as shown'} aria-pressed={!!seen[row.id]} className={cx('flex h-6 w-6 items-center justify-center border-2', seen[row.id] ? 'border-success bg-success text-white' : 'border-outline-strong')}>
                  {seen[row.id] && <Icon name="check" size={16} />}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-md font-semibold text-on-surface">{row.title}</span>
                    {showSources && <ProvenanceBadges kinds={row.chips} />}
                    {showSources && (row.liveSafety
                      ? <span className={cx('text-body-sm', safetyLive ? 'text-success-text' : 'text-on-surface-muted')}>{safetyLive ? '● live' : 'mock engine'}</span>
                      : row.endpoints && <DataSourceChip endpoints={row.endpoints} modelBacked={row.modelBacked} />)}
                  </div>
                  <p className="text-body-sm text-on-surface-muted">{row.desc}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.trigger && (
                    <Button variant="secondary" size="sm" icon="bolt" disabled={busy === row.id} onClick={() => void run(row)}>
                      Trigger
                    </Button>
                  )}
                  <Link to={row.to} onClick={() => mark(row.id)} className="flex h-9 items-center gap-1 px-2 font-display text-label-md uppercase text-notice-dark hover:underline">
                    Show me <Icon name="arrow_forward" size={16} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <SourceNote kinds={['RULE', 'ML', 'SIMULATED', 'MOCK']}>live = served by the running services · mock = local fixture · demo fixture = model trains tomorrow</SourceNote>
    </div>
  );
}
