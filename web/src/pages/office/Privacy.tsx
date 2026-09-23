/**
 * /privacy — "Privacy & Data" (screen 21). What is recorded, what is not, who sees what,
 * retention (example values), optional research opt-in (default OFF, stored in this browser),
 * a client-side "Download my data" (MOCK fixture) and a link to dispute an alert.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_OPERATOR_ID, PERSONAS } from '../../lib/persona';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { Button, Chip, Icon, Label, PageTitle, Panel, PanelHeader, Toggle, toast } from '../../components/ui';

const RESEARCH_KEY = 'sentinel.privacy.researchOptIn';

function loadOptIn(): boolean {
  try {
    return localStorage.getItem(RESEARCH_KEY) === '1';
  } catch {
    return false;
  }
}

function saveOptIn(on: boolean): void {
  try {
    localStorage.setItem(RESEARCH_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

const RECORDED: Array<{ icon: string; title: string; detail: string }> = [
  { icon: 'settings_input_component', title: 'Machine signals', detail: 'Seatbelt, travel speed, swing, joystick and hydraulic pressure, idle time and fuel — while you are on shift.' },
  { icon: 'notifications_active', title: 'Alerts', detail: 'Each alert, when you acknowledged it, and any “Not correct?” feedback you gave.' },
  { icon: 'fact_check', title: 'Checklists', detail: 'Your pre-shift checklist answers and the time you signed it.' },
  { icon: 'report', title: 'Incident reports', detail: 'Incidents created automatically or by you, with a short signal snapshot and your notes.' },
];

const NOT_RECORDED: Array<{ icon: string; title: string; detail: string }> = [
  { icon: 'videocam_off', title: 'No camera', detail: 'There is no camera in the cab and no video of you.' },
  { icon: 'mic_off', title: 'No microphone', detail: 'Nothing is recorded unless you choose to add a voice note to an incident.' },
  { icon: 'location_off', title: 'No location outside shifts', detail: 'Machine position is only used during your shift, on site.' },
  { icon: 'person_off', title: 'No identity from sensors', detail: 'Proximity only says “person detected — rear zone”. It never names who.' },
];

type Access = 'yes' | 'no';
const AUDIENCES = ['You', 'Your instructor', 'Supervisor', 'Fleet manager'] as const;
const WHO: Array<{ what: string; detail: string; access: [Access, Access, Access, Access] }> = [
  { what: 'Your coaching details', detail: 'Coaching notes, practice results, competency progress', access: ['yes', 'yes', 'no', 'no'] },
  { what: 'Alerts escalated to supervisor', detail: 'Only alerts that were escalated (e.g. break not taken, repeated DANGER)', access: ['yes', 'no', 'yes', 'no'] },
  { what: 'Team totals', detail: 'Counts for the whole crew, no names', access: ['yes', 'yes', 'yes', 'yes'] },
];

const RETENTION: Array<{ what: string; period: string; detail: string }> = [
  { what: 'Detailed machine signals', period: '90 days', detail: 'Then kept only as shift totals.' },
  { what: 'Incident records', period: '2 years', detail: 'Including your notes and any dispute.' },
];

function AccessCell({ a }: { a: Access }) {
  if (a === 'yes')
    return (
      <span className="inline-flex items-center gap-1.5 text-success-text">
        <Icon name="check_circle" size={22} fill />
        <span className="font-display text-label-sm uppercase">Can see</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-on-surface-muted">
      <Icon name="cancel" size={22} />
      <span className="font-display text-label-sm uppercase">Cannot see</span>
    </span>
  );
}

function downloadMyData(optIn: boolean): void {
  const op = PERSONAS.operator;
  const data = {
    _note: 'SAMPLE EXPORT (MOCK) — prototype fixture, not your real record',
    exported_at: new Date().toISOString(),
    operator: { operator_id: DEMO_OPERATOR_ID, name: op.name, role: op.title },
    settings: { research_share_alertness_ratings: optIn },
    retention: { detailed_signals_days: 90, incident_records_years: 2, example_values: true },
    shifts: [{ shift_id: 'SH-2026-09-23-A', date: '2026-09-23', machine_id: 'EX-07', site: 'North Quarry, Bench 3', planned: '06:00–14:30' }],
    checklists: [{ shift_id: 'SH-2026-09-23-A', passed: true, items: 14, signed_at: '2026-09-23T05:52:00' }],
    alerts: [
      { alert_id: 'alt_0412', signal_word: 'WARNING', what: 'Fast swing near truck', acknowledged: true, feedback: null },
      { alert_id: 'alt_0419', signal_word: 'CAUTION', what: 'Engine idling 9 min', acknowledged: true, feedback: 'not_correct' },
    ],
    incidents: [{ incident_id: 'INC-0107', type: 'near_miss', source: 'manual', note: 'Truck reversed into loading area without signal', dispute_status: 'none' }],
    coaching: [{ competency: 'Approach & swing control', state: 'in_training', module: 'Swing speed near trucks (6 min)' }],
    simulated: true,
  };
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cat-sentinel-my-data-${DEMO_OPERATOR_ID}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Sample data file created (MOCK)', 'ok');
  } catch {
    toast('Could not create the file in this browser', 'error');
  }
}

export default function Privacy() {
  const [optIn, setOptIn] = useState<boolean>(loadOptIn);

  const changeOptIn = (v: boolean) => {
    setOptIn(v);
    saveOptIn(v);
    toast(v ? 'You are sharing break-time alertness ratings with the study team' : 'Research sharing is off', 'info');
  };

  return (
    <div className="space-y-6">
      <PageTitle
        kicker="Your data"
        title="Privacy & Data"
        sub="What CAT Sentinel records while you work, who can see it, and how long it is kept."
        right={
          <Chip tone="neutral" icon="badge">
            {PERSONAS.operator.name} · {DEMO_OPERATOR_ID}
          </Chip>
        }
      />

      <div className="flex items-center gap-3 border-2 border-success bg-success/10 px-4 py-3">
        <Icon name="volunteer_activism" size={28} className="text-success-text" />
        <p className="font-display text-label-lg uppercase text-on-surface">These notes are for your coaching. They are not used for pay or discipline.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel accent="green">
          <PanelHeader icon="radio_button_checked" title="What is recorded" sub="Only while you are on shift" />
          <ul className="divide-y divide-outline">
            {RECORDED.map((r) => (
              <li key={r.title} className="flex items-start gap-3 px-4 py-3 pl-5">
                <Icon name={r.icon} className="mt-0.5 text-on-surface-variant" />
                <div>
                  <div className="font-display text-label-md uppercase text-on-surface">{r.title}</div>
                  <div className="text-body-sm text-on-surface-variant">{r.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel accent="red">
          <PanelHeader icon="block" title="What is NOT recorded" />
          <ul className="divide-y divide-outline">
            {NOT_RECORDED.map((r) => (
              <li key={r.title} className="flex items-start gap-3 px-4 py-3 pl-5">
                <Icon name={r.icon} className="mt-0.5 text-danger-text" />
                <div>
                  <div className="font-display text-label-md uppercase text-on-surface">{r.title}</div>
                  <div className="text-body-sm text-on-surface-variant">{r.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelHeader icon="visibility" title="Who can see what" sub="No leaderboards. Fleet managers see team totals only." />
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="w-[30%]">Information</th>
                {AUDIENCES.map((a) => (
                  <th key={a}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WHO.map((w) => (
                <tr key={w.what}>
                  <td>
                    <div className="font-display text-label-md uppercase text-on-surface">{w.what}</div>
                    <div className="text-footnote text-on-surface-muted">{w.detail}</div>
                  </td>
                  {w.access.map((a, i) => (
                    <td key={AUDIENCES[i]}>
                      <AccessCell a={a} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader icon="schedule" title="Retention" right={<Chip tone="neutral">Example values</Chip>} />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {RETENTION.map((r) => (
              <div key={r.what} className="border border-outline bg-surface-container-low p-4">
                <Label>{r.what}</Label>
                <div className="mt-1 font-display text-headline-lg text-on-surface tnum">{r.period}</div>
                <div className="text-body-sm text-on-surface-variant">{r.detail}</div>
              </div>
            ))}
          </div>
          <p className="border-t border-outline px-4 py-2 text-footnote text-on-surface-muted">Example values for the prototype. A real site sets these in its data policy.</p>
        </Panel>

        <Panel>
          <PanelHeader icon="science" title="Optional research" right={<ProvenanceBadge kind="MOCK" />} />
          <div className="space-y-3 p-4">
            <Toggle on={optIn} onChange={changeOptIn} label="Share break-time alertness ratings with the study team" />
            <p className="text-body-sm text-on-surface-variant">
              At a break you can rate how alert you feel. If you switch this on, those ratings are shared with the study team without your name. It is off unless you turn it on, and you can turn it off any time.
            </p>
            <p className="text-footnote text-on-surface-muted">Prototype: this choice is stored in this browser only. Status: {optIn ? 'ON — sharing' : 'OFF — not shared'}.</p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader icon="download" title="Download my data" right={<ProvenanceBadge kind="MOCK" />} />
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <p className="max-w-md text-body-sm text-on-surface-variant">Get a copy of what is recorded about you as a JSON file. In the prototype this is a small sample file, made in your browser.</p>
            <Button variant="primary" icon="download" onClick={() => downloadMyData(optIn)}>
              Download my data
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader icon="gavel" title="Dispute an alert" />
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <p className="max-w-md text-body-sm text-on-surface-variant">Think an alert or incident was wrong? Add your side of the story. Your note stays with the record.</p>
            <Link
              to={`/incidents?operator_id=${DEMO_OPERATOR_ID}`}
              className="inline-flex h-12 items-center gap-2 rounded border-2 border-outline-strong bg-surface-container-high px-4 font-display text-label-md font-bold uppercase tracking-wider text-on-surface hover:border-on-surface-muted hover:bg-surface-container-highest"
            >
              <Icon name="flag" size={22} /> Dispute an alert
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
