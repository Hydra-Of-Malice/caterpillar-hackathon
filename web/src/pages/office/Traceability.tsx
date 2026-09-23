/**
 * /traceability — "How CAT Sentinel meets the brief" (screen 20).
 * Requirement → problem → feature → data → method → where to see it → success measure, with an
 * honest Built / Simulated / Mocked status. No compliance claims, no scores.
 */
import { Link } from 'react-router-dom';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { Chip, Icon, Label, PageTitle, Panel, PanelHeader, cx } from '../../components/ui';

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
    data: 'Shift plan and tasks (fixture), progress from cycle counts (SIMULATED), weather (MOCKED feed).',
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
    feature: 'Deterministic seatbelt and proximity rules published over MQTT (DANGER banner even if the edge API is down); heartbeat watchdog → PROTECTION DEGRADED; incident log with telemetry snapshot and dispute; break and conditions reminders.',
    data: 'Seat switch, travel speed (Tier B, SIMULATED); person / truck distance (Tier C, SIMULATED, optional hardware); shift clock and break log; weather (MOCKED).',
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
    data: 'Alert and event history (SIMULATED); practice joystick and phase samples (SIMULATED); team-authored SAMPLE SOPs; instructor calendar (MOCKED).',
    methods: ['ML', 'RULE', 'SIMULATED', 'MOCK'],
    links: [
      { to: '/training', label: 'Training hub' },
      { to: '/training/practice', label: 'Practice' },
      { to: '/training/effectiveness', label: 'Effectiveness' },
    ],
    success: 'Gap → module → re-assessment loop closes; every published sentence traces to a source; practice score reaches the proficient band in fewer sessions (SIMULATED cohort).',
    status: ['Built', 'Simulated', 'Mocked'],
    statusNote: 'LMS and booking mocked',
  },
  {
    id: 'R4',
    requirement: 'Unusual behaviour & idle',
    problem: 'Unusual control patterns go unnoticed, idling is hard to separate from legitimate waiting, and machine faults get blamed on operators.',
    feature: 'Isolation Forest per task type with a plain “why” (robust-z); machine-vs-operator attribution; context-aware idle rule with the waiting-for-truck gate.',
    data: 'Swing rate, joystick commands, hydraulic pressure (Tier B, SIMULATED); idle hours and fuel (Tier A, SIMULATED).',
    methods: ['ML', 'RULE', 'SIMULATED'],
    links: [
      { to: '/anomaly', label: 'Unusual & idle' },
      { to: '/cab/operate', label: 'Operate' },
    ],
    success: 'In-cab alerts per operating hour within the 1.0 budget; event precision / recall on injected events (SIMULATED); unexplained idle minutes per shift.',
    status: ['Built', 'Simulated'],
  },
  {
    id: 'R5',
    requirement: 'Task-time estimation',
    problem: 'Planners and operators get single-point guesses with no uncertainty, and estimates go stale mid-shift.',
    feature: 'LightGBM quantile P10 / P50 / P90 with conformal calibration (CQR); drivers of the estimate; live remaining-time update from observed progress.',
    data: 'Task history (SIMULATED), task type, material, operator experience, conditions.',
    methods: ['ML', 'SIMULATED'],
    links: [
      { to: '/tasks', label: 'Tasks' },
      { to: '/cab/home', label: 'Cab home' },
    ],
    success: 'Interval coverage close to the 80 % target on a time-later split; beats a per-task-type historical baseline on pinball loss.',
    status: ['Built', 'Simulated'],
  },
  {
    id: 'VAL',
    requirement: 'Business value',
    problem: 'A buyer needs to see what the features could be worth, and which assumptions drive the number.',
    feature: 'Editable lever model — productivity, idle fuel, training time, safety expected value, wear, planning — with scenarios and a sensitivity chart.',
    data: 'Customer inputs, public reference prices (example values), team assumptions, SIMULATED prototype gaps.',
    methods: ['ESTIMATE', 'SIMULATED'],
    links: [{ to: '/value', label: 'Business value' }],
    success: 'Every dollar traces to an editable assumption; return on investment to be proven in a pilot.',
    status: ['Built', 'Simulated'],
    statusNote: 'Estimate, not measured',
  },
];

type ClassKind = 'REAL MODEL' | 'REAL' | 'RULE' | 'SIMULATED INPUT' | 'MOCKED INTEGRATION' | 'SAMPLE CONTENT';

const REALITY: Array<{ element: string; cls: ClassKind; detail: string }> = [
  { element: 'Isolation Forest (4 models), ECDF percentiles, alert-budget thresholds', cls: 'REAL MODEL', detail: 'Trained and calibrated on SIMULATED windows; live inference' },
  { element: 'LightGBM P10 / P50 / P90 + CQR', cls: 'REAL MODEL', detail: 'Trained on SIMULATED task history, or supplied logs if usable' },
  { element: 'Expert Motion Model (Practice Analyser)', cls: 'REAL MODEL', detail: 'Expert envelopes built from SIMULATED, safety-filtered expert sessions' },
  { element: 'Robust-z explainer; TreeSHAP post-shift', cls: 'REAL', detail: 'Deterministic statistic / real SHAP' },
  { element: 'Embedding + BM25 retrieval, LLM generation, citation verifier', cls: 'REAL', detail: 'LLM is a live API call; extractive fallback is real' },
  { element: 'Gamma–Poisson gap evidence, re-assessment rate ratio', cls: 'REAL', detail: 'Real statistics, run on SIMULATED events' },
  { element: 'Seatbelt, inner proximity zone, over-speed, sensor health', cls: 'RULE', detail: 'rules.yaml, versioned' },
  { element: 'Excessive idle + context gate; procedural rules', cls: 'RULE', detail: 'Versioned rules' },
  { element: 'Fusion, in-cab gate, tiering, rate limits, escalation', cls: 'RULE', detail: 'Hand-set weights, inspectable' },
  { element: 'Event → competency map, recurrence floor, attribution', cls: 'RULE', detail: 'Versioned YAML' },
  { element: 'Tier B signals, Tier C distances, GPS, truck presence', cls: 'SIMULATED INPUT', detail: 'Seeded generator' },
  { element: 'Tier A (hour meter, fuel, idle hours, fault codes)', cls: 'SIMULATED INPUT', detail: 'Unless a supplied dataset provides them' },
  { element: 'Operators, shift seeds, improvement between shifts, expert envelopes', cls: 'SIMULATED INPUT', detail: 'Improvement is a generator parameter change' },
  { element: 'CAN / J1939 gateway, Product Link / AEMP API, Cat Detect hardware', cls: 'MOCKED INTEGRATION', detail: 'Adapter interfaces + fixtures' },
  { element: 'Weather API, LMS, instructor / simulator booking, expert videos, notifications, SSO / roles', cls: 'MOCKED INTEGRATION', detail: 'Placeholders; role switcher' },
  { element: 'Training corpus', cls: 'SAMPLE CONTENT', detail: 'Team-authored SAMPLE SOPs, watermarked; not official Caterpillar content' },
];

/** Provenance badge where the class maps cleanly; REAL statistics and SAMPLE content get a plain chip. */
const CLASS_BADGE: Record<ClassKind, string | null> = {
  'REAL MODEL': 'ML',
  REAL: null,
  RULE: 'RULE',
  'SIMULATED INPUT': 'SIMULATED',
  'MOCKED INTEGRATION': 'MOCK',
  'SAMPLE CONTENT': null,
};

function StatusChips({ status }: { status: Status[] }) {
  return (
    <span className="flex flex-col items-start gap-1">
      {status.map((s) =>
        s === 'Built' ? (
          <Chip key={s} tone="green" icon="check">
            Built
          </Chip>
        ) : s === 'Simulated' ? (
          <span key={s} className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-prov-sim px-2 py-0.5 font-display text-label-sm uppercase text-prov-sim-text stripes-sim">
            <Icon name="science" size={14} /> Simulated data
          </span>
        ) : (
          <span key={s} className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-dashed border-prov-mock px-2 py-0.5 font-display text-label-sm uppercase text-prov-mock">
            <Icon name="extension" size={14} /> Mocked parts
          </span>
        ),
      )}
    </span>
  );
}

export default function Traceability() {
  return (
    <div className="space-y-6">
      <PageTitle
        kicker="For judges · requirement traceability"
        title="How CAT Sentinel meets the brief"
        sub="Each Caterpillar requirement traced to the operator problem, the feature, the data it uses, the method and where to see it working."
        right={
          <>
            <ProvenanceBadges kinds={['RULE', 'ML', 'SIMULATED', 'MOCK']} />
            <Link to="/tour" className="inline-flex h-9 items-center gap-1.5 rounded border border-cat-border bg-cat px-3 font-display text-label-sm font-bold uppercase tracking-wider text-black hover:bg-cat-hover">
              <Icon name="play_circle" size={18} /> Demo tour
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-outline bg-surface-container-low px-4 py-2.5 text-body-sm text-on-surface-variant">
        <Label>Method key</Label>
        <span className="flex items-center gap-1.5">
          <ProvenanceBadge kind="RULE" /> deterministic, versioned rule
        </span>
        <span className="flex items-center gap-1.5">
          <ProvenanceBadge kind="ML" /> trained model, decision support only
        </span>
        <span className="flex items-center gap-1.5">
          <ProvenanceBadge kind="SIMULATED" /> simulated telemetry or results
        </span>
        <span className="flex items-center gap-1.5">
          <ProvenanceBadge kind="MOCK" /> placeholder integration
        </span>
        <span className="flex items-center gap-1.5">
          <ProvenanceBadge kind="ESTIMATE" /> business estimate
        </span>
      </div>

      <Panel>
        <PanelHeader icon="checklist" title="Requirement traceability" sub="Status is honest: what is built, what runs on simulated data, what is a mocked integration" />
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[1280px]">
            <thead>
              <tr>
                <th className="w-[12%]">Caterpillar requirement</th>
                <th className="w-[15%]">Operator problem</th>
                <th className="w-[19%]">Feature</th>
                <th className="w-[15%]">Data used</th>
                <th className="w-[8%]">Method</th>
                <th className="w-[10%]">Where to see it</th>
                <th className="w-[13%]">Success measure</th>
                <th className="w-[8%]">Status</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="!align-top">
                    <span className={cx('mb-1 inline-block border px-1.5 py-0.5 font-mono text-[11px] font-bold', r.id === 'VAL' ? 'border-series-blue-light text-series-blue-light' : 'border-cat text-cat-text')}>{r.id === 'VAL' ? 'VALUE' : r.id}</span>
                    <div className="font-display text-label-md uppercase text-on-surface">{r.requirement}</div>
                  </td>
                  <td className="!align-top text-on-surface-variant">{r.problem}</td>
                  <td className="!align-top text-on-surface">{r.feature}</td>
                  <td className="!align-top text-on-surface-variant">{r.data}</td>
                  <td className="!align-top">
                    <span className="flex flex-col items-start gap-1">
                      {r.methods.map((m) => (
                        <ProvenanceBadge key={m} kind={m} />
                      ))}
                    </span>
                  </td>
                  <td className="!align-top">
                    <span className="flex flex-col items-start gap-1.5">
                      {r.links.map((l) => (
                        <Link key={l.to} to={l.to} className="inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark hover:underline">
                          {l.label} <Icon name="arrow_forward" size={14} />
                        </Link>
                      ))}
                      <span className="font-mono text-[11px] text-on-surface-muted">{r.links.map((l) => l.to).join(' · ')}</span>
                    </span>
                  </td>
                  <td className="!align-top text-on-surface-variant">{r.success}</td>
                  <td className="!align-top">
                    <StatusChips status={r.status} />
                    {r.statusNote && <div className="mt-1 text-footnote text-on-surface-muted">{r.statusNote}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon="rule" title="What is real, rule, simulated or mocked" sub="Said out loud in the pitch" />
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[45%]">Element</th>
                <th>Class</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {REALITY.map((x) => (
                <tr key={x.element}>
                  <td className="text-on-surface">{x.element}</td>
                  <td>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {CLASS_BADGE[x.cls] ? (
                        <ProvenanceBadge kind={CLASS_BADGE[x.cls]!} />
                      ) : (
                        <Chip tone={x.cls === 'REAL' ? 'teal' : 'neutral'}>{x.cls === 'REAL' ? 'Real' : 'Sample'}</Chip>
                      )}
                      <span className="font-display text-label-sm uppercase text-on-surface-variant">{x.cls}</span>
                    </span>
                  </td>
                  <td className="text-on-surface-muted">{x.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-4 border-2 border-outline-variant bg-surface-container-low px-4 py-3">
        <Icon name="info" className="text-on-surface-variant" />
        <p className="flex-1 text-body-md text-on-surface-variant">Prototype on simulated data. It has not been validated on Caterpillar operations and does not prove accident prevention.</p>
        <Link to="/tour" className="inline-flex items-center gap-1 font-display text-label-md uppercase text-notice-dark hover:underline">
          Demo tour <Icon name="arrow_forward" size={18} />
        </Link>
      </div>
    </div>
  );
}
