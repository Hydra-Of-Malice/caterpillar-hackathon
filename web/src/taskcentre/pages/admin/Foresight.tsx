/**
 * Admin — "What could happen next", at `/tc/admin/foresight`.
 *
 * **What this is.** Deterministic rules read facts the system already recorded (a fatigue prompt,
 * a proximity detection, an overrunning task) and spell out what those conditions could lead to.
 * It is *not* a trained predictive model and nothing here forecasts the future: there is no
 * learned model, no probability estimated from history, and no automatic action. Every item shows
 * the facts it was built from with their GMT times, so a reader can disagree with it on the spot.
 *
 * **What it does.** Each item offers suggestions a person can take — notify the supervisor, open a
 * ticket. Pressing one calls the API and the screen then reports what the API said it did. Nothing
 * on this page controls a machine.
 *
 * `method` and `caveats` from the backend are rendered verbatim and are never paraphrased.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Caveat } from '../../../components/ops/layout';
import { Button, Chip, Icon, PageTitle, cx } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import { adminApi, errorText } from '../../api';
import { SimulatedChip, kindLabel } from '../../components/Badges';
import { GmtTime } from '../../components/GmtTime';
import { StaleDataNote, TcEmpty, TcError, TcLoading } from '../../components/States';
import { POLL } from '../../constants';
import type { ForesightActResult, ForesightAction, ForesightBasis, ForesightItem, ForesightResponse, Likelihood } from '../../types';

// ---------------------------------------------------------------- likelihood
/**
 * Likelihood is always an icon **and** words — colour is never the only signal. The wording says
 * what the rules concluded from the conditions, not how often it has happened before.
 */
const LIKELIHOOD: Record<Likelihood, { label: string; icon: string; tone: 'red' | 'orange' | 'yellow' | 'neutral'; rank: number; note: string }> = {
  high: { label: 'High', icon: 'priority_high', tone: 'red', rank: 0, note: 'Several conditions for this are present right now.' },
  elevated: { label: 'Elevated', icon: 'warning', tone: 'orange', rank: 1, note: 'More than one condition for this is present.' },
  moderate: { label: 'Moderate', icon: 'trending_up', tone: 'yellow', rank: 2, note: 'A condition for this is present.' },
  low: { label: 'Low', icon: 'trending_flat', tone: 'neutral', rank: 3, note: 'Worth knowing about; little is pointing this way.' },
};
const LIKELIHOOD_ORDER: Likelihood[] = ['high', 'elevated', 'moderate', 'low'];

function likelihoodKey(v: string | null | undefined): Likelihood {
  return v === 'high' || v === 'elevated' || v === 'moderate' || v === 'low' ? v : 'low';
}

export function LikelihoodChip({ likelihood, className }: { likelihood: string | null | undefined; className?: string }) {
  const k = likelihoodKey(likelihood);
  const l = LIKELIHOOD[k];
  return (
    <span className={cx('inline-flex', className)} title={`${l.label} likelihood — ${l.note} Worked out by rule from the facts listed below, not from a trained model.`}>
      <Chip tone={l.tone} icon={l.icon}>
        {l.label} likelihood
      </Chip>
    </span>
  );
}

/** Count items per likelihood, preferring the server's own counts when it sent them. */
function countsOf(res: ForesightResponse | undefined): Record<Likelihood, number> {
  const out: Record<Likelihood, number> = { high: 0, elevated: 0, moderate: 0, low: 0 };
  const sent = res?.counts?.by_likelihood;
  if (sent && LIKELIHOOD_ORDER.some((k) => typeof sent[k] === 'number')) {
    LIKELIHOOD_ORDER.forEach((k) => {
      out[k] = Number(sent[k] ?? 0);
    });
    return out;
  }
  (res?.items ?? []).forEach((i) => {
    out[likelihoodKey(i.likelihood)] += 1;
  });
  return out;
}

/** Most pressing first, so the admin does not have to scan for it. */
function sortItems(items: ForesightItem[]): ForesightItem[] {
  return [...items].sort((a, b) => LIKELIHOOD[likelihoodKey(a.likelihood)].rank - LIKELIHOOD[likelihoodKey(b.likelihood)].rank);
}

// ---------------------------------------------------------------- small pieces
function basisValue(v: ForesightBasis['value']): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/** The recorded facts behind one item, each with the GMT time it was observed. */
function BasisList({ basis }: { basis: ForesightBasis[] }) {
  if (basis.length === 0) {
    return <p className="text-body-sm text-on-surface-muted">The API sent no facts for this item. Nothing is shown in their place.</p>;
  }
  return (
    <ul className="space-y-2">
      {basis.map((b, i) => (
        <li key={`${b.fact}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-l-2 border-outline pl-3 text-body-sm">
          <span className="text-on-surface-variant">{b.fact}</span>
          <span className="font-semibold tnum text-on-surface">{basisValue(b.value)}</span>
          <span className="text-on-surface-muted">
            observed <GmtTime ts={b.observed_at} gmt={b.observed_at_gmt} mode="datetime" missing="time not recorded" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function affectedNames(item: ForesightItem): { operators: string[]; machines: string[] } {
  const operators = (item.affected?.operators ?? []).map((o) => (typeof o === 'string' ? o : (o.name ?? o.user_id ?? 'unknown'))).filter(Boolean);
  const machines = (item.affected?.machines ?? []).filter(Boolean);
  return { operators, machines };
}

/** Plain sentence describing what the API reported back after an action was taken. */
function actSummary(r: ForesightActResult): string {
  const bits: string[] = [];
  const notified = r.notified_users?.length ? r.notified_users.map((u) => u.name ?? u.user_id) : (r.notified_user_ids ?? []);
  if (notified.length) bits.push(`Notified ${notified.join(', ')}.`);
  if (r.ticket_id) bits.push(`Ticket ${r.ticket_id} opened for a human decision.`);
  if (r.message) bits.push(r.message);
  else if (r.detail) bits.push(r.detail);
  if (bits.length === 0) bits.push(r.status ? `The API reported: ${r.status}.` : 'The API accepted it but did not say what it did.');
  return bits.join(' ');
}

const ACTION_ICON: Record<string, string> = {
  supervisor: 'supervisor_account',
  admin: 'admin_panel_settings',
  operator: 'engineering',
};

// ---------------------------------------------------------------- one item
function ForesightCard({ item, onActed }: { item: ForesightItem; onActed: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ action: string; text: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { operators, machines } = affectedNames(item);
  const actions = item.recommended_actions ?? [];
  const commentId = `foresight-comment-${item.risk_id}`;

  const take = async (a: ForesightAction) => {
    setBusy(a.action);
    setFailed(null);
    setDone(null);
    try {
      const result = await adminApi.foresightAct(item.risk_id, a.action, comment);
      setDone({ action: a.label ?? a.action, text: actSummary(result ?? {}) });
      setComment('');
      onActed();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="panel rounded-lg p-6" aria-labelledby={`foresight-${item.risk_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <LikelihoodChip likelihood={item.likelihood} />
        <SimulatedChip source={item.source ?? 'RULE'} />
        <span className="font-display text-label-sm uppercase text-on-surface-muted">{kindLabel(item.kind)}</span>
      </div>

      <h3 id={`foresight-${item.risk_id}`} className="mt-2 font-display text-headline-sm text-on-surface">
        {item.title}
      </h3>

      <p className="mt-2 text-body-md text-on-surface-variant">
        <span className="font-semibold text-on-surface">What could happen: </span>
        {item.what_could_happen}
      </p>
      {item.note && <p className="mt-1 text-body-sm text-on-surface-muted">{item.note}</p>}

      {(operators.length > 0 || machines.length > 0) && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-body-sm">
          {operators.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-on-surface-muted">People affected</dt>
              <dd className="text-on-surface">{operators.join(', ')}</dd>
            </div>
          )}
          {machines.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-on-surface-muted">Machines affected</dt>
              <dd className="text-on-surface">{machines.join(', ')}</dd>
            </div>
          )}
        </dl>
      )}

      <section className="mt-4" aria-label={`Facts behind ${item.title}`}>
        <h4 className="font-display text-label-md uppercase text-on-surface-muted">Built from these recorded facts (GMT)</h4>
        <div className="mt-2">
          <BasisList basis={item.basis ?? []} />
        </div>
      </section>

      {actions.length > 0 && (
        <section className="mt-5 border-t border-outline pt-4" aria-label={`Suggestions for ${item.title}`}>
          <h4 className="font-display text-label-md uppercase text-on-surface-muted">Suggested next steps — for a person to decide</h4>
          <p className="mt-1 text-body-sm text-on-surface-muted">
            Pressing one of these routes it to the person named. It does not change anything on a machine, and it is recorded with your name and the server's GMT time.
          </p>

          <label htmlFor={commentId} className="mt-3 block text-body-sm text-on-surface-variant">
            Note to send with it (optional)
          </label>
          <textarea
            id={commentId}
            className="input mt-1 h-auto py-2"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything the person receiving this should know."
          />

          <div className="mt-3 flex flex-wrap gap-3">
            {actions.map((a) => (
              <Button
                key={a.action}
                variant="primary"
                size="md"
                icon={ACTION_ICON[String(a.owner_role ?? '')] ?? 'send'}
                disabled={busy !== null}
                onClick={() => void take(a)}
                title={a.endpoint_hint ? `Calls ${a.endpoint_hint}` : undefined}
              >
                {busy === a.action ? 'Sending…' : (a.label ?? a.action)}
              </Button>
            ))}
          </div>
          {actions.some((a) => a.owner_role) && (
            <p className="mt-2 text-body-sm text-on-surface-muted">
              Goes to: {Array.from(new Set(actions.map((a) => a.owner_role).filter(Boolean))).join(', ')}.
            </p>
          )}

          {done && (
            <div className="mt-3 flex items-start gap-2 border border-success bg-success/10 px-3 py-2 text-body-sm text-success-text" role="status">
              <Icon name="check_circle" size={20} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">“{done.action}” done. </span>
                {done.text}
              </span>
            </div>
          )}
          {failed && (
            <div className="mt-3 flex items-start gap-2 border border-danger bg-danger/10 px-3 py-2 text-body-sm text-danger-text" role="alert">
              <Icon name="error" size={20} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Nothing was sent. </span>
                {failed}
              </span>
            </div>
          )}
        </section>
      )}

      <p className="mt-4 font-mono text-body-sm text-on-surface-muted">{item.risk_id}</p>
    </article>
  );
}

// ---------------------------------------------------------------- method & caveats
/**
 * The backend's own words about how this was produced and what it does not cover — `note`,
 * `method` and every `caveat` printed verbatim, never paraphrased or shortened.
 */
function MethodNote({ res }: { res: ForesightResponse | undefined }) {
  const caveats = res?.caveats ?? [];
  return (
    <Card title="How these were worked out" sub="Read this before acting on anything below.">
      <div className="space-y-2">
        {res?.note && (
          <p className="border-l-4 border-outline-strong pl-3 text-body-md text-on-surface-variant">{res.note}</p>
        )}
        <Caveat icon="rule">
          <span className="font-semibold">Method: </span>
          {res?.method ?? 'The API did not state a method for these items.'}
          {res?.method_version ? ` (${res.method_version})` : ''}
        </Caveat>
        {caveats.map((c, i) => (
          <Caveat key={i} icon="info">
            {c}
          </Caveat>
        ))}
        {caveats.length === 0 && <Caveat icon="info">The API sent no caveats with this response.</Caveat>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- counts strip
function CountsStrip({ counts, total }: { counts: Record<Likelihood, number>; total: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Items by likelihood">
      {LIKELIHOOD_ORDER.map((k) => {
        const l = LIKELIHOOD[k];
        const n = counts[k];
        return (
          <li key={k} className={cx('panel rounded-lg p-4', n > 0 && k === 'high' && 'border-danger')}>
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Icon name={l.icon} size={20} />
              <span className="font-display text-label-md uppercase">{l.label}</span>
            </div>
            <div className="mt-1 font-display text-headline-md tnum text-on-surface">{n}</div>
          </li>
        );
      })}
      <li className="sr-only">{total} items in total.</li>
    </ul>
  );
}

// ---------------------------------------------------------------- summary card (AdminHome)
/**
 * Compact version for the site overview: the counts, the one or two most pressing items, and a
 * link through. It loads on its own so a missing endpoint degrades this card only.
 */
export function ForesightSummary({ limit = 2 }: { limit?: number }) {
  const r = useResource<ForesightResponse>(() => adminApi.foresight(), [], POLL.admin);
  const res = r.data;
  const items = useMemo(() => sortItems(res?.items ?? []), [res]);
  const counts = useMemo(() => countsOf(res), [res]);
  const pressing = items.slice(0, limit);

  return (
    <Card
      title="What could happen next — from current conditions"
      sub="Worked out by rule from facts already recorded. Not a prediction from a trained model."
      right={
        <Link
          to="/tc/admin/foresight"
          className="inline-flex items-center gap-1 font-display text-label-md uppercase text-notice-dark hover:underline"
        >
          Open the full list
          <Icon name="chevron_right" size={20} />
        </Link>
      }
    >
      {r.loading && !res ? (
        <TcLoading label="Reading current conditions" />
      ) : r.error && !res ? (
        <TcError error={r.error} what="What could happen next" onRetry={r.reload} />
      ) : (
        <div className="space-y-4">
          {r.error && <StaleDataNote error={r.error} />}
          {/* The backend's standing honesty sentence travels with this view wherever it appears. */}
          {res?.note && <p className="border-l-4 border-outline-strong pl-3 text-body-sm text-on-surface-variant">{res.note}</p>}
          <CountsStrip counts={counts} total={items.length} />
          {items.length === 0 ? (
            <TcEmpty icon="check_circle" title="No conditions are pointing anywhere right now">
              Nothing is listed in place of the missing items.
            </TcEmpty>
          ) : (
            <ul className="space-y-3">
              {pressing.map((i) => {
                const { operators, machines } = affectedNames(i);
                const who = [...operators, ...machines].join(', ');
                return (
                  <li key={i.risk_id} className="border-l-4 border-outline-strong pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <LikelihoodChip likelihood={i.likelihood} />
                      <SimulatedChip source={i.source ?? 'RULE'} />
                    </div>
                    <h3 className="mt-1 font-display text-headline-sm text-on-surface">{i.title}</h3>
                    <p className="text-body-sm text-on-surface-variant">{i.what_could_happen}</p>
                    {who && <p className="text-body-sm text-on-surface-muted">Affects {who}</p>}
                    <p className="mt-1 text-body-sm text-on-surface-muted">
                      Built from {(i.basis ?? []).length} recorded fact{(i.basis ?? []).length === 1 ? '' : 's'} · {(i.recommended_actions ?? []).length} suggested step
                      {(i.recommended_actions ?? []).length === 1 ? '' : 's'} — open the full list to see them and act.
                    </p>
                  </li>
                );
              })}
              {items.length > pressing.length && (
                <li className="text-body-sm text-on-surface-muted">
                  <Link to="/tc/admin/foresight" className="font-semibold text-notice-dark hover:underline">
                    {items.length - pressing.length} more {items.length - pressing.length === 1 ? 'item' : 'items'}
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- page
export default function Foresight() {
  const r = useResource<ForesightResponse>(() => adminApi.foresight(), [], POLL.admin);
  const res = r.data;
  const items = useMemo(() => sortItems(res?.items ?? []), [res]);
  const counts = useMemo(() => countsOf(res), [res]);

  return (
    <div className="space-y-8">
      <PageTitle
        kicker="Administrator"
        title="What could happen next — from current conditions"
        sub="Rules read the facts already recorded on this site and spell out where they could lead, so a person can decide early. This is not a trained predictive model and nothing here acts on its own or controls a machine."
        right={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-body-sm text-on-surface-muted">
              Worked out <GmtTime ts={res?.generated_at} gmt={res?.generated_at_gmt} mode="datetime" missing="time not reported" />
            </span>
            <Button size="sm" variant="secondary" icon="refresh" onClick={r.reload}>
              Refresh
            </Button>
          </div>
        }
      />

      {r.loading && !res ? (
        <TcLoading label="Reading current conditions" />
      ) : r.error && !res ? (
        <TcError error={r.error} what="What could happen next" onRetry={r.reload} />
      ) : (
        <>
          {r.error && <StaleDataNote error={r.error} />}

          <CountsStrip counts={counts} total={items.length} />

          <MethodNote res={res} />

          {items.length === 0 ? (
            <Card title="Nothing is pointing anywhere right now">
              <TcEmpty icon="check_circle" title="No conditions met any of the rules">
                Nothing is shown in place of the missing items. Run a scenario from the Scenarios page to see this fill up.
              </TcEmpty>
            </Card>
          ) : (
            <section className="space-y-5" aria-label="What could happen next">
              {items.map((i) => (
                <ForesightCard key={i.risk_id} item={i} onActed={r.reload} />
              ))}
            </section>
          )}

          <p className="text-body-sm text-on-surface-muted">
            Site {res?.site_id ?? 'not reported'} · every time on this page is GMT, recorded by the server clock.
          </p>
        </>
      )}
    </div>
  );
}
