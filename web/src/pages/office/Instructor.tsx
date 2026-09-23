import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COMPETENCY_COLOR, CompetencyChip, competencyStateLabel } from '../../components/CompetencyChip';
import { DataSourceChip } from '../../components/DataSourceChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { CitationTag } from '../../components/training/citations';
import { ShiftRateChart, ShiftRateLegend, verdictText } from '../../components/training/rateCharts';
import { Button, Chip, EmptyState, ErrorNote, Icon, Label, Loading, PageTitle, Panel, PanelHeader, cx, toast } from '../../components/ui';
import { ApiError, cloud } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { usePersona, type Persona } from '../../lib/persona';
import type { CompetencyState, ContentReviewItem, InstructorOperatorRow } from '../../lib/types';
import { COMPETENCIES, COMPETENCY_MODULE, competencyLabel, moduleTitle } from '../../mocks/world';

type Tab = 'operators' | 'content';

const STATES: CompetencyState[] = ['unassessed', 'observed_gap', 'in_training', 'improving', 'demonstrated'];
const GLYPH: Record<CompetencyState, { icon: string; ink: string }> = {
  unassessed: { icon: 'remove', ink: 'var(--chart-tick)' },
  observed_gap: { icon: 'priority_high', ink: '#000000' },
  in_training: { icon: 'school', ink: '#FFFFFF' },
  improving: { icon: 'trending_up', ink: '#000000' },
  demonstrated: { icon: 'check', ink: '#FFFFFF' },
};

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join('.') + '.'
  );
}

/** Evidence lines are for people: drop probability/confidence fragments. */
function plainEvidence(e: string | null | undefined): string {
  if (!e) return '';
  return e
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !/P\(|confidence|probab|%/i.test(s))
    .join(' · ');
}

/** 403/409 business errors from the API, shown with their status. */
function ActionError({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    return (
      <div className="flex items-start gap-2 border-2 border-danger bg-danger/10 px-3 py-2.5" role="alert">
        <Icon name="block" size={20} className="mt-0.5 text-danger-text" />
        <div>
          <div className="font-display text-label-sm uppercase text-danger-text">
            HTTP {error.status}
            {error.status === 403 ? ' · Forbidden' : error.status === 409 ? ' · Conflict' : ''}
          </div>
          <div className="text-body-sm text-on-surface">{error.detail}</div>
        </div>
      </div>
    );
  }
  return <ErrorNote error={error} />;
}

function StateCell({ state, selected, title, onClick }: { state: CompetencyState; selected: boolean; title: string; onClick: () => void }) {
  const g = GLYPH[state] ?? GLYPH.unassessed;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      className={cx('flex h-9 w-full min-w-[36px] items-center justify-center border border-surface transition-[filter] duration-quick hover:brightness-125', selected && 'outline outline-2 -outline-offset-2 outline-cat')}
      style={{ background: COMPETENCY_COLOR[state] ?? COMPETENCY_COLOR.unassessed }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: g.ink }} aria-hidden>
        {g.icon}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STATES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 font-display text-label-sm uppercase text-on-surface-variant">
          <span className="flex h-5 w-5 items-center justify-center border border-outline-variant" style={{ background: COMPETENCY_COLOR[s] }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: GLYPH[s].ink }} aria-hidden>
              {GLYPH[s].icon}
            </span>
          </span>
          {competencyStateLabel(s)}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ OPERATORS tab
function OperatorsTab({ persona }: { persona: Persona }) {
  const navigate = useNavigate();
  const opsRes = useResource(() => cloud.instructorOperators(), []);
  const rows: InstructorOperatorRow[] = opsRes.data ?? [];

  const [selOp, setSelOp] = useState<string>('OP-1042');
  const [selComp, setSelComp] = useState<string>('C04');
  const [overrides, setOverrides] = useState<Record<string, { state: CompetencyState; verified_by?: string | null }>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>();

  useEffect(() => {
    if (rows.length && !rows.some((r) => r.operator_id === selOp)) setSelOp(rows[0].operator_id);
  }, [rows, selOp]);
  useEffect(() => setActionError(undefined), [selOp, selComp]);

  const profileRes = useResource(() => cloud.profile(selOp), [selOp]);
  const reassRes = useResource(() => cloud.reassessment(selOp, selComp), [selOp, selComp]);

  const stateOf = (opId: string, compId: string): CompetencyState => {
    const o = overrides[`${opId}:${compId}`];
    if (o) return o.state;
    return rows.find((r) => r.operator_id === opId)?.competencies.find((c) => c.id === compId)?.state ?? 'unassessed';
  };

  const row = rows.find((r) => r.operator_id === selOp);
  const opName = row?.name ?? profileRes.data?.operator.name ?? selOp;
  const compEntry = profileRes.data?.competencies.find((c) => c.id === selComp);
  const key = `${selOp}:${selComp}`;
  const curState = stateOf(selOp, selComp);
  const verifiedBy = overrides[key] ? overrides[key].verified_by : compEntry?.verified_by;
  const reass = reassRes.data;
  const reassValid =
    !!reass &&
    !!reass.pre &&
    (reass.operator_id ? reass.operator_id === selOp : selOp === 'OP-1042') &&
    (reass.competency_id ? reass.competency_id === selComp : selComp === 'C04');
  const moduleId = COMPETENCY_MODULE[selComp];
  const history = (profileRes.data?.training_history ?? []).filter((h) => moduleId && h.module_id === moduleId);
  const evidence = plainEvidence(compEntry?.evidence);

  const act = async (state: CompetencyState) => {
    setBusy(true);
    setActionError(undefined);
    try {
      await cloud.patchCompetency(selOp, selComp, { state, actor_role: persona.role });
      const initials = initialsOf(persona.name);
      setOverrides((o) => ({ ...o, [key]: { state, verified_by: state === 'demonstrated' ? initials : null } }));
      toast(state === 'demonstrated' ? `Verified by ${initials}` : `${opName}: needs more practice — set to IN TRAINING`);
    } catch (e) {
      setActionError(e);
      toast(e instanceof ApiError ? e.detail : 'Could not update the competency', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (opsRes.loading && !opsRes.data) return <Loading label="Loading operators" />;
  if (!rows.length) {
    return (
      <EmptyState icon="group_off" title="No operators assigned">
        No operators are assigned to you on this site yet.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          icon="grid_on"
          title="Competency heatmap"
          sub="Rows = your assigned operators · columns = 14 competencies · cells show state, never scores"
          right={<DataSourceChip endpoints={['GET /instructor/operators']} />}
        />
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="min-w-[180px] pb-2 pr-3 text-left font-display text-label-sm uppercase text-on-surface-muted">Operator</th>
                {COMPETENCIES.map((c) => (
                  <th key={c.id} className="px-0.5 pb-2 text-center" title={`${c.id} · ${c.label}${c.safety_critical ? ' (safety-critical)' : ''}`}>
                    <span className={cx('font-display text-[11px] font-bold uppercase tracking-[0.04em]', selComp === c.id ? 'text-cat-text' : 'text-on-surface-muted')}>{c.id}</span>
                    {c.safety_critical && <Icon name="shield" size={12} className="ml-0.5 align-middle text-danger-text" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = r.operator_id === selOp;
                return (
                  <tr key={r.operator_id} className={cx(on && 'bg-surface-container-high')}>
                    <th scope="row" className="py-0.5 pr-3 text-left">
                      <button type="button" onClick={() => setSelOp(r.operator_id)} className="flex w-full items-center gap-2 text-left" aria-pressed={on}>
                        <span className={cx('h-8 w-1', on ? 'bg-cat' : 'bg-transparent')} />
                        <span>
                          <span className="block font-display text-label-md uppercase text-on-surface">{r.name}</span>
                          <span className="block text-footnote text-on-surface-muted">
                            {r.operator_id}
                            {r.level ? ` · ${r.level}` : ''}
                          </span>
                        </span>
                      </button>
                    </th>
                    {COMPETENCIES.map((c) => {
                      const st = stateOf(r.operator_id, c.id);
                      return (
                        <td key={c.id} className="p-0.5">
                          <StateCell
                            state={st}
                            selected={on && selComp === c.id}
                            title={`${r.name} · ${c.id} ${c.label}: ${competencyStateLabel(st)}`}
                            onClick={() => {
                              setSelOp(r.operator_id);
                              setSelComp(c.id);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 border-t border-outline px-4 py-3">
          <Legend />
          <p className="text-body-sm text-on-surface-muted">
            <Icon name="shield" size={14} className="mr-1 align-middle text-danger-text" />
            Safety-critical. DEMONSTRATED is set only by an instructor (initials recorded) or a passed assessment — never by ML.
          </p>
          <details className="text-body-sm text-on-surface-muted">
            <summary className="cursor-pointer font-display text-label-sm uppercase text-on-surface-variant">Column key</summary>
            <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {COMPETENCIES.map((c) => (
                <li key={c.id}>
                  <span className="font-display font-bold text-on-surface-variant">{c.id}</span> {c.label}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* evidence */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            icon="fact_check"
            title={`${opName} — ${competencyLabel(selComp)}`}
            sub="Evidence for the selected competency"
            right={<CompetencyChip state={curState} verifiedBy={verifiedBy} />}
          />
          <div className="grid grid-cols-1 gap-0 divide-y divide-outline md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Events</Label>
                  {(evidence || reassValid) && <ProvenanceBadges kinds={['RULE', 'SIMULATED']} />}
                </div>
                {profileRes.loading && !profileRes.data ? (
                  <Loading label="Loading evidence" />
                ) : evidence || reassValid ? (
                  <ul className="space-y-1 text-body-sm text-on-surface">
                    {evidence && <li>{evidence}</li>}
                    {reassValid && reass && (
                      <>
                        <li className="tnum text-on-surface-variant">
                          Before training: {reass.pre.events} fast swings near the truck in {reass.pre.opportunities} loading cycles
                        </li>
                        <li className="tnum text-on-surface-variant">
                          After training: {reass.post.events} in {reass.post.opportunities} loading cycles
                        </li>
                      </>
                    )}
                  </ul>
                ) : (
                  <p className="text-body-sm text-on-surface-muted">No logged events for this competency.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Training done</Label>
                {history.length || (reassValid && reass?.training_completed) ? (
                  <ul className="space-y-1 text-body-sm text-on-surface">
                    {reassValid && reass?.training_completed && moduleId && (
                      <li className="flex items-center gap-1.5">
                        <Icon name="task_alt" size={16} className="text-success-text" />
                        {moduleTitle(moduleId)} — completed {reass.training_completed}
                      </li>
                    )}
                    {history.map((h) => (
                      <li key={`${h.module_id}-${h.completed_ts}`} className="flex items-center gap-1.5">
                        <Icon name="task_alt" size={16} className="text-success-text" />
                        {h.title} — {fmtDate(h.completed_ts)}
                        {h.score ? ` · quiz ${h.score}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-sm text-on-surface-muted">No training recorded for this competency.</p>
                )}
              </div>
              {curState === 'demonstrated' && verifiedBy && (
                <div className="flex items-center gap-2 border border-success bg-success/10 px-3 py-2 text-body-sm text-on-surface">
                  <Icon name="verified" size={18} fill className="text-success-text" /> Verified by {verifiedBy}
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Before / after</Label>
                <span className="flex items-center gap-1.5">
                  <ProvenanceBadge kind="SIMULATED" />
                  <DataSourceChip endpoints={['/reassessment']} showLive={false} />
                </span>
              </div>
              {reassRes.loading && !reassRes.data ? (
                <Loading label="Loading" />
              ) : reassValid && reass ? (
                <>
                  <ShiftRateChart data={reass} height={190} compact />
                  <ShiftRateLegend />
                  <p className="tnum text-body-sm text-on-surface-variant">
                    Rate ratio {Number.isFinite(reass.rr) ? reass.rr.toFixed(2) : '—'}
                    {Array.isArray(reass.ci95) ? ` (95% interval ${reass.ci95[0].toFixed(2)}–${reass.ci95[1].toFixed(2)})` : ''} · {verdictText(reass.verdict, reass.ci95)}
                  </p>
                  <Link to="/training/effect" className="inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark hover:underline">
                    Full before / after view <Icon name="arrow_forward" size={16} />
                  </Link>
                </>
              ) : (
                <p className="text-body-sm text-on-surface-muted">No before / after data for this competency yet.</p>
              )}
            </div>
          </div>
        </Panel>

        {/* actions */}
        <Panel>
          <span className="absolute left-0 right-0 top-0 h-1 bg-cat" />
          <PanelHeader icon="how_to_reg" title="Instructor decision" />
          <div className="space-y-4 p-4">
            <div className="space-y-1 border border-outline bg-surface-container-low px-3 py-2.5">
              <Label>Acting as</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-label-md uppercase text-on-surface">{persona.name}</span>
                <Chip tone={persona.role === 'instructor' ? 'green' : 'orange'} icon="badge">
                  role: {persona.role}
                </Chip>
                <ProvenanceBadge kind="MOCK" />
              </div>
              <p className="text-footnote text-on-surface-muted">
                The role comes from the persona switcher (SSO is mocked) and is sent as actor_role. Non-instructor roles get 403 when setting DEMONSTRATED.
              </p>
            </div>
            <div className="space-y-2">
              <Button variant="primary" size="lg" block icon="verified" disabled={busy || curState === 'demonstrated'} onClick={() => act('demonstrated')}>
                {curState === 'demonstrated' ? 'Already demonstrated' : 'Verify as demonstrated'}
              </Button>
              <Button variant="secondary" block icon="replay" disabled={busy || curState === 'in_training'} onClick={() => act('in_training')}>
                Needs more practice
              </Button>
              <Button variant="secondary" block icon="event" onClick={() => navigate(`/training/booking?topic=${encodeURIComponent(selComp)}`)}>
                Book session
              </Button>
            </div>
            {actionError !== undefined && <ActionError error={actionError} />}
            <p className="text-body-sm text-on-surface-muted">Verify only after observing {opName.split(' ')[0]} on the machine or simulator. Telemetry and ML suggest gaps; they never mark DEMONSTRATED.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ CONTENT REVIEW tab
const STATUS_CHIP: Record<ContentReviewItem['status'], { label: string; tone: 'neutral' | 'blue' | 'green' | 'orange'; icon: string }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: 'edit_note' },
  in_review: { label: 'In review', tone: 'blue', icon: 'rate_review' },
  approved: { label: 'Approved', tone: 'green', icon: 'task_alt' },
  changes_requested: { label: 'Changes requested', tone: 'orange', icon: 'undo' },
};

function StatusChip({ status }: { status: ContentReviewItem['status'] }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.draft;
  return (
    <Chip tone={s.tone} icon={s.icon}>
      {s.label}
    </Chip>
  );
}

function CheckChip({ check }: { check: ContentReviewItem['citation_check'] }) {
  return check === 'PASS' ? (
    <Chip tone="green" icon="check">
      Pass
    </Chip>
  ) : (
    <Chip tone="red" icon="close">
      Fail
    </Chip>
  );
}

const BAD_CITATION = /not yet approved|unapproved|missing|not found/i;

function ContentTab({ items, loading, onStatus }: { items: ContentReviewItem[]; loading: boolean; onStatus: (id: string, status: ContentReviewItem['status']) => void }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    if (!selId && items.length) setSelId((items.find((i) => i.status === 'in_review') ?? items[0]).review_id);
  }, [items, selId]);
  useEffect(() => setError(undefined), [selId]);

  const sel = items.find((i) => i.review_id === selId);

  const approve = async () => {
    if (!sel) return;
    setBusy(true);
    setError(undefined);
    try {
      await cloud.approveContent(sel.review_id);
      onStatus(sel.review_id, 'approved');
      toast(`${sel.title} ${sel.version} approved. Learners get it on next sync.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !items.length) return <Loading label="Loading review queue" />;
  if (!items.length) {
    return (
      <EmptyState icon="inbox" title="Review queue is empty">
        No training content is waiting for review.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader icon="rule" title="Content review queue" sub="Every change must cite an approved source before it can be published" right={<DataSourceChip endpoints={['/instructor/content-review']} />} />
        <div className="overflow-x-auto">
          <table className="table-dense w-full">
            <thead>
              <tr>
                <th>Module</th>
                <th>Version</th>
                <th>Change summary</th>
                <th className="text-right">Sources cited</th>
                <th>Citation check</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const on = it.review_id === selId;
                return (
                  <tr key={it.review_id} onClick={() => setSelId(it.review_id)} className={cx('cursor-pointer transition-colors duration-quick', on ? 'bg-surface-container-high' : 'hover:bg-surface-container-low')}>
                    <td>
                      <button type="button" onClick={() => setSelId(it.review_id)} className="flex items-center gap-2 text-left" aria-pressed={on}>
                        <span className={cx('h-6 w-1', on ? 'bg-cat' : 'bg-transparent')} />
                        <span className="font-display text-label-md uppercase text-on-surface">{it.title}</span>
                      </button>
                    </td>
                    <td className="font-display text-label-md">{it.version}</td>
                    <td className="text-on-surface-variant">{it.change_summary}</td>
                    <td className="text-right">{it.sources_cited}</td>
                    <td>
                      <CheckChip check={it.citation_check} />
                    </td>
                    <td>
                      <StatusChip status={it.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {sel && (
        <Panel>
          <PanelHeader
            icon="difference"
            title={`${sel.title} — ${sel.version}`}
            sub={sel.change_summary}
            right={
              <>
                <CheckChip check={sel.citation_check} />
                <StatusChip status={sel.status} />
              </>
            }
          />
          <div className="space-y-4 p-4">
            {sel.citation_check === 'FAIL' && (
              <div className="flex items-start gap-2 border-2 border-danger bg-danger/10 px-3 py-2.5 text-body-sm text-on-surface" role="alert">
                <Icon name="link_off" size={20} className="mt-0.5 text-danger-text" />
                Citation check failed: at least one point cites a source that is not approved. Fix the citation before this version can be approved.
              </div>
            )}
            {sel.diff?.length ? (
              <ol className="space-y-1" aria-label="Text changes">
                {sel.diff.map((d, i) => (
                  <li
                    key={`${i}-${d.op}`}
                    className={cx(
                      'flex flex-wrap items-start gap-3 border-l-4 px-3 py-2',
                      d.op === 'add' && 'border-success bg-success/15',
                      d.op === 'del' && 'border-danger bg-danger/15',
                      d.op === 'same' && 'border-outline bg-surface-container-low',
                    )}
                  >
                    <span className={cx('w-4 shrink-0 font-mono text-body-md font-bold', d.op === 'add' ? 'text-success-text' : d.op === 'del' ? 'text-danger-text' : 'text-on-surface-muted')} aria-hidden>
                      {d.op === 'add' ? '+' : d.op === 'del' ? '−' : ' '}
                    </span>
                    <span className="sr-only">{d.op === 'add' ? 'Added:' : d.op === 'del' ? 'Removed:' : 'Unchanged:'}</span>
                    <span className={cx('min-w-0 flex-1 text-body-md', d.op === 'del' ? 'text-on-surface-muted line-through' : 'text-on-surface')}>{d.text}</span>
                    {d.citation && <CitationTag text={d.citation} tone={BAD_CITATION.test(d.citation) ? 'red' : 'neutral'} />}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-body-sm text-on-surface-muted">No text changes recorded for this version.</p>
            )}
            {error !== undefined && <ActionError error={error} />}
            <div className="flex flex-wrap items-center gap-3 border-t border-outline pt-4">
              <Button
                variant="primary"
                size="lg"
                icon="task_alt"
                disabled={busy || sel.citation_check === 'FAIL' || sel.status === 'approved'}
                title={sel.citation_check === 'FAIL' ? 'Citation check must pass before approval' : undefined}
                onClick={approve}
              >
                {sel.status === 'approved' ? `${sel.version} approved` : `Approve ${sel.version}`}
              </Button>
              <span className="inline-flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  icon="undo"
                  disabled={busy || sel.status === 'approved' || sel.status === 'changes_requested'}
                  onClick={() => {
                    onStatus(sel.review_id, 'changes_requested');
                    toast(`Changes requested on ${sel.title} ${sel.version}. Sent back to the author.`, 'info');
                  }}
                >
                  Request changes
                </Button>
                <ProvenanceBadge kind="MOCK" />
              </span>
              {sel.citation_check === 'FAIL' && <span className="text-body-sm text-danger-text">Approval blocked by the citation check.</span>}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Instructor() {
  const persona = usePersona();
  const [tab, setTab] = useState<Tab>('operators');
  const reviewsRes = useResource(() => cloud.contentReview(), []);
  const [statusOverride, setStatusOverride] = useState<Record<string, ContentReviewItem['status']>>({});

  const items = useMemo(() => (reviewsRes.data ?? []).map((r) => (statusOverride[r.review_id] ? { ...r, status: statusOverride[r.review_id] } : r)), [reviewsRes.data, statusOverride]);
  const pending = items.filter((i) => i.status === 'in_review' || i.status === 'draft').length;

  const tabs: Array<{ id: Tab; label: string; icon: string; count?: number }> = [
    { id: 'operators', label: 'Operators', icon: 'groups' },
    { id: 'content', label: 'Content review', icon: 'rule', count: pending },
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        kicker="Instructor · R3"
        title="Instructor Workspace — Marcus Lee"
        sub="Assigned operators, competency evidence and training-content review"
        right={
          <>
            <Chip tone={persona.role === 'instructor' ? 'green' : 'orange'} icon="badge">
              Viewing as {persona.name} · {persona.role}
            </Chip>
            <DataSourceChip endpoints={['/instructor/', '/competency/', '/reassessment']} />
          </>
        }
      />

      {persona.role !== 'instructor' && (
        <div className="flex items-start gap-3 border-2 border-warning bg-warning/10 px-4 py-3" role="note">
          <Icon name="badge" size={24} className="text-warning-text" />
          <p className="text-body-md text-on-surface">
            You are viewing as <strong>{persona.name}</strong> ({persona.title}). Actions are sent with <span className="font-mono text-body-sm">actor_role="{persona.role}"</span>. Only an instructor may verify DEMONSTRATED, so the server will answer 403. Switch to Marcus Lee (Instructor) in the persona menu to verify.
          </p>
        </div>
      )}

      <nav className="flex gap-1 border-b border-outline" role="tablist" aria-label="Instructor workspace">
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={cx(
                'relative flex items-center gap-2 px-5 py-3 font-display text-label-md uppercase transition-colors duration-quick',
                on ? 'text-on-surface after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-1 after:bg-cat' : 'text-on-surface-muted hover:text-on-surface',
              )}
            >
              <Icon name={t.icon} size={20} />
              {t.label}
              {t.count ? <span className="tnum border border-outline-variant px-1.5 text-label-sm">{t.count}</span> : null}
            </button>
          );
        })}
      </nav>

      {tab === 'operators' ? (
        <OperatorsTab persona={persona} />
      ) : (
        <ContentTab items={items} loading={reviewsRes.loading} onStatus={(id, status) => setStatusOverride((s) => ({ ...s, [id]: status }))} />
      )}
    </div>
  );
}
