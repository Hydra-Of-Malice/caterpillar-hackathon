/**
 * /traceability — "How CAT Sentinel meets the brief" (screen 20).
 * Requirement → feature → where to see it → honest status. Problem, data, method and success
 * measure open per row; the real / rule / simulated / mocked breakdown sits behind Details.
 * No compliance claims, no scores.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, PageTitle, Panel, cx } from '../../components/ui';

type Status = 'Built' | 'Simulated' | 'Mocked';

interface TraceRow {
  id: string;
  requirement: string;
  problem: string;
  feature: string;
  data: string;
  methods: string[];
  links: Array<{ to: string; label: string }>;
  success: string;
  status: Status[];
  statusNote?: string;
}

const ROWS: TraceRow[] = [
  {
    id: 'R1',
    requirement: 'Daily task dashboard',
    problem: 'The shift starts from a verbal or paper briefing; priorities, progress and conditions are scattered.',
    feature: 'Cab home with today’s tasks, progress bars and a P10–P90 time range; pre-shift checklist that gates “Start shift”; conditions card; supervisor crew view.',
    data: 'Shift plan and tasks (fixture), progress from cycle counts (simulated), weather (mocked feed).',
    methods: ['RULE', 'ML', 'SIMULATED', 'MOCK'],
    links: [
      { to: '/cab/home', label: 'Cab home' },
      { to: '/supervisor', label: 'Supervisor' },
    ],
    success: 'All scheduled tasks render; progress lag < 5 s; checklist completed before first movement.',
    status: ['Built', 'Simulated'],
    statusNote: 'Weather feed mocked',
  },
  {
    id: 'R2',
    requirement: 'Safety — seatbelt, proximity, incident log, working conditions',
    problem: 'Unbelted operation and people entering the swing radius are the highest-severity risks; near-misses go unreported and context is lost.',
    feature: 'Deterministic seatbelt and proximity rules published over MQTT (DANGER banner even if the edge API is down); heartbeat watchdog → protection degraded; incident log with telemetry snapshot and dispute; break and conditions reminders.',
    data: 'Seat switch, travel speed (Tier B, simulated); person / truck distance (Tier C, simulated, optional hardware); shift clock and break log; weather (mocked).',
    methods: ['RULE', 'SIMULATED', 'MOCK'],
    links: [
      { to: '/cab/operate', label: 'Operate' },
      { to: '/cab/checklist', label: 'Checklist' },
      { to: '/incidents', label: 'Incidents' },
    ],
    success: 'Rule suite passes (boundary, missing, stuck-at); rule latency p99 shown measured on Diagnostics; every DANGER event logged with evidence; degraded state shown within 3 s of heartbeat loss.',
    status: ['Built', 'Simulated'],
    statusNote: 'Detection hardware mocked',
  },
  {
    id: 'R3',
    requirement: 'Training hub (+ Practice Analyser with Expert Motion Model)',
    problem: 'Training is generic and not tied to what the operator actually did on the machine; instructor time is hard to schedule.',
    feature: 'Competency gaps from observed events (evidence first); cited micro-modules and quiz; instructor booking; Practice Analyser comparing trainee motion with an Expert Motion Model; before/after re-assessment.',
    data: 'Alert and event history (simulated); practice joystick and phase samples (simulated); team-authored sample SOPs; instructor calendar (mocked).',
    methods: ['ML', 'RULE', 'SIMULATED', 'MOCK'],
    links: [
      { to: '/training', label: 'Training hub' },
      { to: '/training/practice', label: 'Practice' },
      { to: '/training/effectiveness', label: 'Effectiveness' },
    ],
    success: 'Gap → module → re-assessment loop closes; every published sentence traces to a source; practice score reaches the proficient band in fewer sessions (simulated cohort).',
    status: ['Built', 'Simulated', 'Mocked'],
    statusNote: 'LMS and booking mocked',
  },
  {
    id: 'R4',
    requirement: 'Unusual behaviour & idle',
    problem: 'Unusual control patterns go unnoticed, idling is hard to separate from legitimate waiting, and machine faults get blamed on operators.',
    feature: 'Isolation Forest per task type with a plain “why” (robust-z); machine-vs-operator attribution; context-aware idle rule with the waiting-for-truck gate.',
    data: 'Swing rate, joystick commands, hydraulic pressure (Tier B, simulated); idle hours and fuel (Tier A, simulated).',
    methods: ['ML', 'RULE', 'SIMULATED'],
    links: [
      { to: '/anomaly', label: 'Unusual & idle' },
      { to: '/cab/operate', label: 'Operate' },
    ],
    success: 'In-cab alerts per operating hour within the 1.0 budget; event precision / recall on injected events (simulated); unexplained idle minutes per shift.',
    status: ['Built', 'Simulated'],
  },
  {
    id: 'R5',
    requirement: 'Task-time estimation',
    problem: 'Planners and operators get single-point guesses with no uncertainty, and estimates go stale mid-shift.',
    feature: 'LightGBM quantile P10 / P50 / P90 with conformal calibration (CQR); drivers of the estimate; live remaining-time update from observed progress.',
    data: 'Task history (simulated), task type, material, operator experience, conditions.',
    methods: ['ML', 'SIMULATED'],
    links: [
      { to: '/tasks', label: 'Tasks' },
      { to: '/cab/home', label: 'Cab home' },
    ],
    success: 'Interval coverage close to the 80 % target on a time-later split; beats a per-task-type historical baseline on pinball loss.',
    status: ['Built', 'Simulated'],
  },
  {
    id: 'Value',
    requirement: 'Business value',
    problem: 'A buyer needs to see what the features could be worth, and which assumptions drive the number.',
    feature: 'Editable lever model — productivity, idle fuel, training time, safety expected value, wear, planning — with scenarios and a sensitivity chart.',
    data: 'Customer inputs, public reference prices (example values), team assumptions, simulated prototype gaps.',
    methods: ['ESTIMATE', 'SIMULATED'],
    links: [{ to: '/value', label: 'Business value' }],
    success: 'Every dollar traces to an editable assumption; return on investment to be proven in a pilot.',
    status: ['Built', 'Simulated'],
    statusNote: 'Estimate, not measured',
  },
];

const METHOD_WORD: Record<string, string> = {
  RULE: 'Deterministic rules',
  ML: 'Trained model (decision support)',
  SIMULATED: 'Simulated data',
  MOCK: 'Mocked integration',
  ESTIMATE: 'Business estimate',
};

type ClassKind = 'Real model' | 'Real' | 'Rule' | 'Simulated input' | 'Mocked integration' | 'Sample content';

const REALITY: Array<{ element: string; cls: ClassKind; detail: string }> = [
  { element: 'Isolation Forest (4 models), ECDF percentiles, alert-budget thresholds', cls: 'Real model', detail: 'Trained and calibrated on simulated windows; live inference' },
  { element: 'LightGBM P10 / P50 / P90 + CQR', cls: 'Real model', detail: 'Trained on simulated task history, or supplied logs if usable' },
  { element: 'Expert Motion Model (Practice Analyser)', cls: 'Real model', detail: 'Expert envelopes built from simulated, safety-filtered expert sessions' },
  { element: 'Robust-z explainer; TreeSHAP post-shift', cls: 'Real', detail: 'Deterministic statistic / real SHAP' },
  { element: 'Embedding + BM25 retrieval, LLM generation, citation verifier', cls: 'Real', detail: 'LLM is a live API call; extractive fallback is real' },
  { element: 'Gamma–Poisson gap evidence, re-assessment rate ratio', cls: 'Real', detail: 'Real statistics, run on simulated events' },
  { element: 'Seatbelt, inner proximity zone, over-speed, sensor health', cls: 'Rule', detail: 'Versioned rule file' },
  { element: 'Excessive idle + context gate; procedural rules', cls: 'Rule', detail: 'Versioned rules' },
  { element: 'Fusion, in-cab gate, tiering, rate limits, escalation', cls: 'Rule', detail: 'Hand-set weights, inspectable' },
  { element: 'Event → competency map, recurrence floor, attribution', cls: 'Rule', detail: 'Versioned rule file' },
  { element: 'Tier B signals, Tier C distances, GPS, truck presence', cls: 'Simulated input', detail: 'Seeded generator' },
  { element: 'Tier A (hour meter, fuel, idle hours, fault codes)', cls: 'Simulated input', detail: 'Unless a supplied dataset provides them' },
  { element: 'Operators, shift seeds, improvement between shifts, expert envelopes', cls: 'Simulated input', detail: 'Improvement is a generator parameter change' },
  { element: 'CAN / J1939 gateway, Product Link / AEMP API, Cat Detect hardware', cls: 'Mocked integration', detail: 'Adapter interfaces + fixtures' },
  { element: 'Weather API, LMS, instructor / simulator booking, expert videos, notifications, SSO / roles', cls: 'Mocked integration', detail: 'Placeholders; role switcher' },
  { element: 'Training corpus', cls: 'Sample content', detail: 'Team-authored sample SOPs, watermarked; not official Caterpillar content' },
];

function StatusText({ status, note }: { status: Status[]; note?: string }) {
  const rest = status.filter((s) => s !== 'Built').map((s) => (s === 'Simulated' ? 'simulated data' : 'mocked parts'));
  return (
    <div>
      {status.includes('Built') && (
        <span className="inline-flex items-center gap-1.5 text-success-text">
          <Icon name="check_circle" size={18} /> Built
        </span>
      )}
      {rest.length > 0 && <div className="text-on-surface-muted">On {rest.join(' · ')}</div>}
      {note && <div className="text-on-surface-muted">{note}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-body-sm text-on-surface-muted">{label}</div>
      <div className="mt-1 text-body-sm text-on-surface-variant">{children}</div>
    </div>
  );
}

export default function Traceability() {
  const [open, setOpen] = useState<string | null>(null);
  const [showReality, setShowReality] = useState(false);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PageTitle
          title="How CAT Sentinel meets the brief"
          sub="Each Caterpillar requirement, the feature that answers it, and where to see it working."
          right={
            <Link to="/tour" className="inline-flex h-10 items-center gap-2 rounded border border-cat-border bg-cat px-4 font-display text-label-md font-bold uppercase tracking-wider text-black hover:bg-cat-hover">
              <Icon name="play_circle" size={20} /> Demo tour
            </Link>
          }
        />
        <p className="flex items-center gap-2 text-body-sm text-on-surface-muted">
          <Icon name="info" size={18} />
          Prototype on simulated data. It has not been validated on Caterpillar operations and does not prove accident prevention.
        </p>
      </div>

      <Panel className="p-6">
        <div className="mb-6">
          <h2 className="font-display text-headline-sm text-on-surface">Requirements</h2>
          <p className="mt-1 text-body-sm text-on-surface-muted">Open a row for the operator problem, data, method and success measure.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="w-[26%]">Requirement</th>
                <th>Feature</th>
                <th className="w-[16%]">Where to see it</th>
                <th className="w-[16%]">Status</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const isOpen = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={cx('align-top', isOpen && 'bg-surface-container-low')}>
                      <td className="!align-top">
                        <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen} className="flex w-full items-start gap-2 text-left">
                          <Icon name="chevron_right" size={20} className={cx('mt-px text-on-surface-muted transition-transform', isOpen && 'rotate-90')} />
                          <span>
                            <span className="text-on-surface-muted">{r.id}</span>
                            <span className="ml-2 font-semibold text-on-surface">{r.requirement}</span>
                          </span>
                        </button>
                      </td>
                      <td className="!align-top text-on-surface-variant">{r.feature}</td>
                      <td className="!align-top">
                        <span className="flex flex-col items-start gap-1">
                          {r.links.map((l) => (
                            <Link key={l.to} to={l.to} className="inline-flex items-center gap-1 text-notice-dark hover:underline">
                              {l.label} <Icon name="arrow_forward" size={14} />
                            </Link>
                          ))}
                        </span>
                      </td>
                      <td className="!align-top">
                        <StatusText status={r.status} note={r.statusNote} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface-container-low">
                        <td colSpan={4} className="!pb-6 !pl-10">
                          <div className="grid gap-6 md:grid-cols-2">
                            <Field label="Operator problem">{r.problem}</Field>
                            <Field label="Data used">{r.data}</Field>
                            <Field label="Method">{r.methods.map((m) => METHOD_WORD[m] ?? m).join(' · ')}</Field>
                            <Field label="Success measure">{r.success}</Field>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-headline-sm text-on-surface">What is real, rule, simulated or mocked</h2>
            <p className="mt-1 text-body-sm text-on-surface-muted">Said out loud in the pitch.</p>
          </div>
          <button type="button" onClick={() => setShowReality((v) => !v)} aria-expanded={showReality} className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
            {showReality ? 'Hide' : 'Details'}
            <Icon name={showReality ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        </div>
        {showReality && (
          <div className="mt-6 overflow-x-auto">
            <table className="table-dense w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className="w-[45%]">Element</th>
                  <th className="w-[20%]">Class</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {REALITY.map((x) => (
                  <tr key={x.element}>
                    <td className="text-on-surface">{x.element}</td>
                    <td className="whitespace-nowrap text-on-surface-variant">{x.cls}</td>
                    <td className="text-on-surface-muted">{x.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
