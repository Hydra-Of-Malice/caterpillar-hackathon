/**
 * Work-schedule fatigue-RISK card for one operator (`GET /tc/sup/operators/:id/fatigue-risk`).
 *
 * **This is not a fatigue detector and this card must never let anyone read it as one.**
 * `docs/sections/06-fatigue.md` found no published validation of machine data as a fatigue
 * indicator and put "any fatigue score shown to supervisors" as a judgement of a person on the
 * never list. So what is shown here is an *exposure estimate from the recorded work schedule* —
 * hours since the Start Work punch, time since a punched break, night work, consecutive days —
 * the same kind of model a real fatigue-risk management system uses.
 *
 * Three rules this component keeps:
 *
 * 1. the label and every caveat from the API are rendered **verbatim**, never summarised away;
 * 2. every factor is shown with its value, its weight, what it contributed and the threshold it
 *    was judged against, so the score can be checked by hand — there is nothing hidden behind it;
 * 3. the level is always an icon **and** a word, never colour alone.
 *
 * Self-contained on purpose: it fetches, types and renders its own payload, so it can be dropped
 * into the operator page with one line and removed again just as cleanly.
 */
import { TC_BASE, TcApiError, getToken } from '../../api';
import { useResource } from '../../../lib/hooks';
import { POLL } from '../../constants';
import { Bar, Card, Caveat, Chip, Details, Icon, cx, gate } from './common';

// ---------------------------------------------------------------- payload
/** One row of the visible weighted sum. `weight: 0` means reported but deliberately not scored. */
interface RiskFactor {
  key: string;
  label: string;
  value: number | boolean | null;
  value_text?: string;
  unit?: string;
  weight: number;
  contribution: number;
  threshold?: unknown;
  threshold_text?: string;
  note?: string;
}

type RiskLevel = 'low' | 'elevated' | 'high';

interface RiskPayload {
  label: string;
  level: RiskLevel;
  score: number;
  score_formula?: string;
  score_points?: number;
  score_max_points?: number;
  factors: RiskFactor[];
  inputs: Record<string, unknown>;
  recommendation: string;
  caveats: string[];
  method_version?: string;
  generated_at_gmt?: string | null;
  level_from?: { score_band?: string; break_policy_band?: string; rule?: string };
  break_policy?: Record<string, number>;
}

/**
 * One GET, with the bearer token this client already holds. Written here rather than added to the
 * shared api module so this feature stays one file plus one line elsewhere.
 */
async function loadRisk(operatorId: string): Promise<RiskPayload> {
  const path = `/sup/operators/${encodeURIComponent(operatorId)}/fatigue-risk`;
  const endpoint = `GET /tc${path}`;
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${TC_BASE}${path}`, { headers });
  } catch {
    throw new TcApiError(0, `Cannot reach the Task Centre API at ${TC_BASE}.`, endpoint);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string' && body.detail.trim()) detail = body.detail;
    } catch {
      /* not JSON — keep the status line */
    }
    throw new TcApiError(res.status, detail, endpoint);
  }
  return (await res.json()) as RiskPayload;
}

// ---------------------------------------------------------------- vocabulary
/** Icon **and** word for every level: the colour is never the only thing carrying the meaning. */
const LEVEL: Record<RiskLevel, { word: string; icon: string; tone: 'green' | 'orange' | 'red'; bar: 'green' | 'orange'; hint: string }> = {
  low: {
    word: 'Low',
    icon: 'check_circle',
    tone: 'green',
    bar: 'green',
    hint: 'The recorded schedule is inside the normal break and hours pattern.',
  },
  elevated: {
    word: 'Elevated',
    icon: 'error',
    tone: 'orange',
    bar: 'orange',
    hint: 'The recorded schedule has passed a break or hours threshold. Plan cover.',
  },
  high: {
    word: 'High',
    icon: 'report',
    tone: 'red',
    bar: 'orange',
    hint: 'The recorded schedule is past the point where the break policy recommends acting.',
  },
};

const num = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : '—');

// ---------------------------------------------------------------- card
export function FatigueRisk({ operatorId, operatorName = 'this operator' }: { operatorId: string; operatorName?: string }) {
  const r = useResource(() => loadRisk(operatorId), [operatorId], POLL.supervisor);
  const d = r.data;

  return (
    <Card
      title="Fatigue risk from the work schedule"
      sub="An exposure estimate from recorded hours, breaks, shift timing and consecutive days — not a measurement of the person"
    >
      {gate(r, 'This estimate', 'Loading the estimate') ?? (d ? <Body d={d} operatorName={operatorName} /> : null)}
    </Card>
  );
}

export default FatigueRisk;

function Body({ d, operatorName }: { d: RiskPayload; operatorName: string }) {
  const level = LEVEL[d.level] ?? LEVEL.low;
  const scored = d.factors.filter((f) => f.weight > 0);
  const reported = d.factors.filter((f) => !(f.weight > 0));
  // `shift_recorded`, not `punched_in_today`: a night shift that began at 23:20 is still a shift.
  const punchedIn = d.inputs?.shift_recorded !== false;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------- what this is, before any number */}
      <p className="border-l-4 border-notice-dark bg-surface-container-low px-4 py-3 text-body-md text-on-surface">
        <strong>{d.label}</strong> It estimates risk from {operatorName}&rsquo;s recorded work schedule — punches, declared waiting and completed tasks. It
        does not observe, measure or detect anyone&rsquo;s fatigue, and it must not be the sole basis for a decision about a person.
      </p>

      {/* ---------------------------------------------- level and score */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <Icon
            name={level.icon}
            size={36}
            className={cx(d.level === 'high' && 'text-danger-text', d.level === 'elevated' && 'text-warning-text', d.level === 'low' && 'text-success-text')}
            title={`${level.word} risk`}
          />
          <div>
            <div className="font-display text-label-sm uppercase text-on-surface-muted">Level</div>
            <div className="flex items-center gap-2">
              <span className="font-display text-headline-md text-on-surface">{level.word}</span>
              <Chip tone={level.tone} icon={level.icon}>
                {level.word} risk
              </Chip>
            </div>
          </div>
        </div>

        <div className="min-w-[200px] flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-label-sm uppercase text-on-surface-muted">Score</span>
            <span className="text-body-md text-on-surface tnum">{d.score} / 100</span>
          </div>
          <Bar className="mt-1.5" pct={d.score} tone={level.bar} />
          <p className="mt-1.5 text-body-sm text-on-surface-muted">{level.hint}</p>
        </div>
      </div>

      {!punchedIn && (
        <p className="border border-outline bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
          <Icon name="info" size={18} className="mr-1 align-text-bottom text-on-surface-muted" />
          {String(d.inputs?.not_punched_in_note ?? 'No open or recent Start Work punch is recorded, so there is no shift to estimate from.')}
        </p>
      )}

      {/* ---------------------------------------------- what to do */}
      <div>
        <div className="font-display text-label-sm uppercase text-on-surface-muted">Suggested action</div>
        <p className="mt-1 text-body-md text-on-surface">{d.recommendation}</p>
      </div>

      {/* ---------------------------------------------- every factor, with its threshold */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-display text-label-sm uppercase text-on-surface-muted">What produced this score</h4>
          <span className="text-body-sm text-on-surface-muted tnum">
            {num(d.score_points)} of {num(d.score_max_points)} points
          </span>
        </div>
        <ul className="mt-2 divide-y divide-outline">
          {scored.map((f) => (
            <FactorRow key={f.key} f={f} />
          ))}
        </ul>
        {d.score_formula && <p className="mt-2 text-body-sm text-on-surface-muted">{d.score_formula}.</p>}
      </div>

      {reported.length > 0 && (
        <div>
          <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Reported, but deliberately not scored</h4>
          <ul className="mt-2 divide-y divide-outline">
            {reported.map((f) => (
              <FactorRow key={f.key} f={f} />
            ))}
          </ul>
        </div>
      )}

      {/* ---------------------------------------------- the honesty block, verbatim */}
      <Details label={`How this is worked out, and what it cannot tell you (${d.caveats.length})`} defaultOpen>
        <ul className="space-y-2">
          {d.caveats.map((c) => (
            <li key={c} className="flex gap-2 text-body-sm text-on-surface-variant">
              <Icon name="chevron_right" size={18} className="mt-0.5 shrink-0 text-on-surface-muted" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
        {d.level_from?.rule && <p className="mt-3 text-body-sm text-on-surface-muted">Level: {d.level_from.rule}.</p>}
        {d.method_version && <p className="mt-1 text-body-sm text-on-surface-muted tnum">Method {d.method_version}</p>}
      </Details>

      <Caveat icon="balance">
        This is an estimate about a <em>schedule</em>, not a person. It must not be used as the sole basis for any decision about {operatorName}, and never for
        pay, rostering or discipline. {operatorName} can see this same estimate, with the same inputs, in their own app — nobody is assessed behind their back.
      </Caveat>
    </div>
  );
}

/** One factor: what it was, what it contributed, and the threshold it was judged against. */
function FactorRow({ f }: { f: RiskFactor }) {
  const scored = f.weight > 0;
  const pct = scored ? Math.max(0, Math.min(100, (f.contribution / f.weight) * 100)) : 0;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-body-md text-on-surface">{f.label}</span>
        <span className="text-body-md text-on-surface tnum">{f.value_text ?? (typeof f.value === 'boolean' ? (f.value ? 'Yes' : 'No') : num(f.value))}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-on-surface-muted">
        {scored ? (
          <span className="tnum">
            contributed {num(f.contribution)} of {num(f.weight)} points
          </span>
        ) : (
          <Chip tone="neutral" icon="do_not_disturb_on">
            Not scored
          </Chip>
        )}
        {f.threshold_text && <span>· {f.threshold_text}</span>}
      </div>
      {scored && <Bar className="mt-1.5" pct={pct} tone={pct > 0 ? 'orange' : 'neutral'} />}
      {f.note && <p className="mt-1 text-body-sm text-on-surface-muted">{f.note}</p>}
    </li>
  );
}
