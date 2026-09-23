/**
 * /privacy — "Privacy & Data" (screen 21). What is recorded, what is not, who sees what,
 * retention (example values), optional research opt-in (default OFF, stored in this browser),
 * a client-side "Download my data" (sample fixture) and a link to dispute an alert.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_OPERATOR_ID, PERSONAS } from '../../lib/persona';
import { Button, Icon, PageTitle, Panel, Toggle, toast } from '../../components/ui';

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
  return a === 'yes' ? (
    <span className="inline-flex items-center text-success-text" title="Can see">
      <Icon name="check" size={22} />
      <span className="sr-only">Can see</span>
    </span>
  ) : (
    <span className="inline-flex items-center text-on-surface-muted" title="Cannot see">
      <span aria-hidden>—</span>
      <span className="sr-only">Cannot see</span>
    </span>
  );
}

function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-headline-sm text-on-surface">{children}</h2>
      {sub && <p className="mt-1 text-body-sm text-on-surface-muted">{sub}</p>}
    </div>
  );
}

function ItemList({ items, iconClass }: { items: Array<{ icon: string; title: string; detail: string }>; iconClass: string }) {
  return (
    <ul className="space-y-5">
      {items.map((r) => (
        <li key={r.title} className="flex items-start gap-4">
          <Icon name={r.icon} size={22} className={iconClass} />
          <div>
            <div className="text-body-md font-semibold text-on-surface">{r.title}</div>
            <div className="mt-0.5 text-body-md text-on-surface-variant">{r.detail}</div>
          </div>
        </li>
      ))}
    </ul>
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
    toast('Sample data file created', 'ok');
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
    <div className="space-y-8">
      <div className="space-y-3">
        <PageTitle title="Privacy & data" sub="What CAT Sentinel records while you work, who can see it, and how long it is kept." />
        <p className="flex items-center gap-2 text-body-md text-on-surface">
          <Icon name="volunteer_activism" size={22} className="text-success-text" />
          These notes are for your coaching. They are not used for pay or discipline.
        </p>
      </div>

      {/* ---------------------------------------------------- recorded / not recorded */}
      <Panel className="p-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <section>
            <SectionTitle sub="Only while you are on shift">What is recorded</SectionTitle>
            <ItemList items={RECORDED} iconClass="mt-0.5 text-on-surface-muted" />
          </section>
          <section>
            <SectionTitle sub="Never, on or off shift">What is not recorded</SectionTitle>
            <ItemList items={NOT_RECORDED} iconClass="mt-0.5 text-danger-text" />
          </section>
        </div>
      </Panel>

      {/* ---------------------------------------------------- who sees what */}
      <Panel className="p-6">
        <SectionTitle sub="No leaderboards. Fleet managers see team totals only.">Who can see what</SectionTitle>
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="w-[40%]">Information</th>
                {AUDIENCES.map((a) => (
                  <th key={a} className="text-center">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WHO.map((w) => (
                <tr key={w.what}>
                  <td>
                    <div className="font-semibold text-on-surface">{w.what}</div>
                    <div className="text-on-surface-muted">{w.detail}</div>
                  </td>
                  {w.access.map((a, i) => (
                    <td key={AUDIENCES[i]} className="text-center">
                      <AccessCell a={a} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ---------------------------------------------------- retention + research */}
      <Panel className="p-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <section>
            <SectionTitle sub="Example values for the prototype. A real site sets these in its data policy.">How long it is kept</SectionTitle>
            <div className="grid gap-6 sm:grid-cols-2">
              {RETENTION.map((r) => (
                <div key={r.what}>
                  <div className="text-body-sm text-on-surface-muted">{r.what}</div>
                  <div className="mt-1 font-display text-headline-lg text-on-surface tnum">{r.period}</div>
                  <div className="text-body-sm text-on-surface-variant">{r.detail}</div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <SectionTitle sub="Off unless you turn it on">Optional research</SectionTitle>
            <Toggle on={optIn} onChange={changeOptIn} label="Share break-time alertness ratings with the study team" />
            <p className="mt-4 text-body-md text-on-surface-variant">At a break you can rate how alert you feel. If you switch this on, those ratings are shared with the study team without your name. You can turn it off any time.</p>
            <p className="mt-2 text-body-sm text-on-surface-muted">Prototype: this choice is stored in this browser only.</p>
          </section>
        </div>
      </Panel>

      {/* ---------------------------------------------------- your data + dispute */}
      <Panel className="p-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <section>
            <SectionTitle>Download my data</SectionTitle>
            <p className="mb-5 text-body-md text-on-surface-variant">Get a copy of what is recorded about you. In the prototype this is a small sample file made in your browser.</p>
            <Button variant="primary" icon="download" onClick={() => downloadMyData(optIn)}>
              Download my data
            </Button>
          </section>
          <section>
            <SectionTitle>Dispute an alert</SectionTitle>
            <p className="mb-5 text-body-md text-on-surface-variant">Think an alert or incident was wrong? Add your side of the story. Your note stays with the record.</p>
            <Link
              to={`/incidents?operator_id=${DEMO_OPERATOR_ID}`}
              className="inline-flex h-12 items-center gap-2 rounded border border-outline-strong bg-surface-container px-4 font-display text-label-md font-bold uppercase tracking-wider text-on-surface hover:bg-surface-container-low"
            >
              <Icon name="flag" size={22} /> Dispute an alert
            </Link>
          </section>
        </div>
      </Panel>
    </div>
  );
}
