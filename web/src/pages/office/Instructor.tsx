/**
 * Instructor workspace (R3). Two tabs: Operators (competency heatmap → evidence → decision) and
 * Content review (queue → text diff → approve). DEMONSTRATED is set only by an instructor, never by ML.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COMPETENCY_COLOR, CompetencyChip, competencyStateLabel } from '../../components/CompetencyChip';
import { SourceNote } from '../../components/ProvenanceBadge';
import { CitationTag } from '../../components/training/citations';
import { ShiftRateChart, ShiftRateLegend, verdictText } from '../../components/training/rateCharts';
import { Card, Details, InlineTabs, TABLE, TableWrap } from '../../components/ops/layout';
import { Button, EmptyState, ErrorNote, Icon, Loading, PageTitle, cx, toast } from '../../components/ui';
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

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const stateLabel = (s: CompetencyState) => sentence(competencyStateLabel(s));

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

/** 403/409 business errors from the API, in plain words. */
function ActionError({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    const head = error.status === 403 ? 'Not allowed' : error.status === 409 ? 'Not possible right now' : 'Could not save';
    return (
      <p className="flex items-start gap-2 text-body-sm text-danger-text" role="alert">
        <Icon name="block" size={18} className="mt-0.5" />
        <span>
          <span className="font-semibold">{head}.</span> <span className="text-on-surface">{error.detail}</span>
        </span>
      </p>
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
      className={cx('flex h-9 w-full min-w-[36px] items-center justify-center rounded-sm transition-[filter] duration-quick hover:brightness-110', selected && 'outline outline-2 outline-offset-1 outline-on-surface')}
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {STATES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <span className="h-3 w-3 rounded-sm" style={{ background: COMPETENCY_COLOR[s] }} aria-hidden />
          {stateLabel(s)}
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
      toast(state === 'demonstrated' ? `Verified by ${initials}` : `${opName}: needs more practice — set to in training`);
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
    <div className="space-y-8">
      <Card title="Competencies" sub="Your assigned operators. Cells show state, never scores — select one to see the evidence.">
        <div className="-mx-2 overflow-x-auto px-2 pb-1 pt-1">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="min-w-[160px] pb-1 text-left text-body-sm font-normal text-on-surface-muted">Operator</th>
                {COMPETENCIES.map((c) => (
                  <th key={c.id} className="pb-1 text-center" title={`${c.id} · ${c.label}${c.safety_critical ? ' (safety-critical)' : ''}`}>
                    <span className={cx('text-body-sm tnum', selComp === c.id ? 'font-semibold text-on-surface' : 'font-normal text-on-surface-muted')}>{c.id}</span>
                    {c.safety_critical && <Icon name="shield" size={12} className="ml-0.5 align-middle text-danger-text" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = r.operator_id === selOp;
                return (
                  <tr key={r.operator_id}>
                    <th scope="row" className="pr-3 text-left">
                      <button type="button" onClick={() => setSelOp(r.operator_id)} className="flex w-full items-center gap-2 text-left" aria-pressed={on}>
                        <span className={cx('h-8 w-[3px] rounded-full', on ? 'bg-cat' : 'bg-transparent')} />
                        <span>
                          <span className={cx('block text-body-md', on ? 'font-semibold text-on-surface' : 'font-normal text-on-surface')}>{r.name}</span>
                          {r.level && <span className="block text-body-sm font-normal text-on-surface-muted">{r.level}</span>}
                        </span>
                      </button>
                    </th>
                    {COMPETENCIES.map((c) => {
                      const st = stateOf(r.operator_id, c.id);
                      return (
                        <td key={c.id}>
                          <StateCell
                            state={st}
                            selected={on && selComp === c.id}
                            title={`${r.name} · ${c.label}: ${stateLabel(st)}`}
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
        <div className="mt-5 space-y-3">
          <Legend />
          <p className="text-body-sm text-on-surface-muted">
            <Icon name="shield" size={14} className="mr-1 align-middle text-danger-text" />
            Safety-critical. Demonstrated is set only by an instructor (initials recorded) or a passed assessment — never by ML.
          </p>
          <Details label="Column key">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-body-sm text-on-surface-variant sm:grid-cols-2 lg:grid-cols-3">
              {COMPETENCIES.map((c) => (
                <li key={c.id}>
                  <span className="font-semibold text-on-surface">{c.id}</span> {c.label}
                </li>
              ))}
            </ul>
          </Details>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[1fr_340px]">
        {/* evidence */}
        <Card title={`${opName} — ${competencyLabel(selComp)}`} right={<CompetencyChip state={curState} verifiedBy={verifiedBy} />}>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-body-md font-semibold text-on-surface">Events</h3>
                {profileRes.loading && !profileRes.data ? (
                  <Loading label="Loading evidence" />
                ) : evidence || reassValid ? (
                  <ul className="space-y-1 text-body-sm text-on-surface-variant">
                    {evidence && <li className="text-on-surface">{evidence}</li>}
                    {reassValid && reass && (
                      <>
                        <li className="tnum">
                          Before training: {reass.pre.events} fast swings near the truck in {reass.pre.opportunities} loading cycles
                        </li>
                        <li className="tnum">
                          After training: {reass.post.events} in {reass.post.opportunities} loading cycles
                        </li>
                      </>
                    )}
                  </ul>
                ) : (
                  <p className="text-body-sm text-on-surface-muted">No logged events for this competency.</p>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-body-md font-semibold text-on-surface">Training done</h3>
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
                <p className="flex items-center gap-2 text-body-sm text-success-text">
                  <Icon name="verified" size={18} fill /> Verified by {verifiedBy}
                </p>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-body-md font-semibold text-on-surface">Before / after training</h3>
              {reassRes.loading && !reassRes.data ? (
                <Loading label="Loading" />
              ) : reassValid && reass ? (
                <>
                  <ShiftRateChart data={reass} height={190} compact />
                  <ShiftRateLegend />
                  <p className="text-body-sm text-on-surface-variant">{verdictText(reass.verdict, reass.ci95)}</p>
                  <Link to="/training/effect" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
                    Full before / after view <Icon name="arrow_forward" size={16} />
                  </Link>
                </>
              ) : (
                <p className="text-body-sm text-on-surface-muted">No before / after data for this competency yet.</p>
              )}
            </div>
          </div>
          <SourceNote kinds={['RULE', 'SIMULATED']} />
        </Card>

        {/* decision */}
        <Card title="Your decision">
          <div className="space-y-5">
            <p className="text-body-sm text-on-surface-muted">
              Acting as <span className="font-semibold text-on-surface">{persona.name}</span> · {persona.role}
            </p>
            {persona.role !== 'supervisor' && (
              <p className="flex items-start gap-2 text-body-sm text-warning-text" role="note">
                <Icon name="badge" size={18} className="mt-0.5" />
                <span>Only a supervisor can verify Demonstrated. Switch to Priya Nair (Supervisor) in the persona menu.</span>
              </p>
            )}
            <div className="space-y-3">
              <Button variant="primary" block icon="verified" disabled={busy || curState === 'demonstrated'} onClick={() => act('demonstrated')}>
                {curState === 'demonstrated' ? 'Already demonstrated' : 'Verify as demonstrated'}
              </Button>
              <Button variant="secondary" block icon="replay" disabled={busy || curState === 'in_training'} onClick={() => act('in_training')}>
                Needs more practice
              </Button>
              <Button variant="ghost" block icon="event" onClick={() => navigate(`/training/booking?topic=${encodeURIComponent(selComp)}`)}>
                Book session
              </Button>
            </div>
            {actionError !== undefined && <ActionError error={actionError} />}
            <p className="text-body-sm text-on-surface-muted">Verify only after observing {opName.split(' ')[0]} on the machine or simulator. Telemetry and ML suggest gaps; they never mark Demonstrated.</p>
            <SourceNote kinds={['MOCK']}>Role comes from the persona switcher; sign-in is mocked</SourceNote>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ CONTENT REVIEW tab
const STATUS: Record<ContentReviewItem['status'], { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: 'bg-on-surface-muted' },
  in_review: { label: 'In review', dot: 'bg-notice' },
  approved: { label: 'Approved', dot: 'bg-success' },
  changes_requested: { label: 'Changes requested', dot: 'bg-warning' },
};

function StatusText({ status }: { status: ContentReviewItem['status'] }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={cx('h-2 w-2 rounded-full', s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

function CheckText({ check }: { check: ContentReviewItem['citation_check'] }) {
  return check === 'PASS' ? (
    <span className="inline-flex items-center gap-1 text-success-text">
      <Icon name="check" size={18} /> Passed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-danger-text">
      <Icon name="close" size={18} /> Failed
    </span>
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
    <div className="space-y-8">
      <Card title="Review queue" sub="Every change must cite an approved source before it can be published">
        <TableWrap>
          <table className={cx(TABLE, 'min-w-[640px]')}>
            <thead>
              <tr>
                <th>Module</th>
                <th>Version</th>
                <th>Change</th>
                <th>Citation check</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const on = it.review_id === selId;
                return (
                  <tr
                    key={it.review_id}
                    tabIndex={0}
                    onClick={() => setSelId(it.review_id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelId(it.review_id)}
                    aria-selected={on}
                    className={cx('cursor-pointer transition-colors duration-quick hover:bg-surface-container-low', on && 'bg-surface-container-low shadow-[inset_3px_0_0_#FFCD11]')}
                  >
                    <td className="font-semibold text-on-surface">{it.title}</td>
                    <td className="whitespace-nowrap tnum">{it.version}</td>
                    <td className="text-on-surface-variant">{it.change_summary}</td>
                    <td className="whitespace-nowrap">
                      <CheckText check={it.citation_check} />
                    </td>
                    <td>
                      <StatusText status={it.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {sel && (
        <Card title={`${sel.title} — ${sel.version}`} sub={`${sel.change_summary} · ${sel.sources_cited} ${sel.sources_cited === 1 ? 'source' : 'sources'} cited`} right={<StatusText status={sel.status} />}>
          <div className="space-y-6">
            {sel.citation_check === 'FAIL' && (
              <p className="flex items-start gap-2 text-body-sm text-danger-text" role="alert">
                <Icon name="link_off" size={18} className="mt-0.5" />
                Citation check failed: at least one point cites a source that is not approved. Fix the citation before this version can be approved.
              </p>
            )}
            {sel.diff?.length ? (
              <ol className="space-y-1" aria-label="Text changes">
                {sel.diff.map((d, i) => (
                  <li
                    key={`${i}-${d.op}`}
                    className={cx('flex flex-wrap items-start gap-3 rounded-sm border-l-[3px] px-3 py-2', d.op === 'add' && 'border-success bg-success/10', d.op === 'del' && 'border-danger bg-danger/10', d.op === 'same' && 'border-transparent')}
                  >
                    <span className={cx('w-4 shrink-0 font-mono text-body-md font-bold', d.op === 'add' ? 'text-success-text' : d.op === 'del' ? 'text-danger-text' : 'text-on-surface-muted')} aria-hidden>
                      {d.op === 'add' ? '+' : d.op === 'del' ? '−' : ' '}
                    </span>
                    <span className="sr-only">{d.op === 'add' ? 'Added:' : d.op === 'del' ? 'Removed:' : 'Unchanged:'}</span>
                    <span className={cx('min-w-0 flex-1 text-body-md', d.op === 'del' ? 'text-on-surface-muted line-through' : d.op === 'same' ? 'text-on-surface-variant' : 'text-on-surface')}>{d.text}</span>
                    {d.citation && <CitationTag text={d.citation} tone={BAD_CITATION.test(d.citation) ? 'red' : 'neutral'} />}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-body-sm text-on-surface-muted">No text changes recorded for this version.</p>
            )}
            {error !== undefined && <ActionError error={error} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" icon="task_alt" disabled={busy || sel.citation_check === 'FAIL' || sel.status === 'approved'} title={sel.citation_check === 'FAIL' ? 'Citation check must pass before approval' : undefined} onClick={approve}>
                {sel.status === 'approved' ? `${sel.version} approved` : `Approve ${sel.version}`}
              </Button>
              <Button
                variant="secondary"
                icon="undo"
                disabled={busy || sel.status === 'approved' || sel.status === 'changes_requested'}
                onClick={() => {
                  onStatus(sel.review_id, 'changes_requested');
                  toast(`Changes requested on ${sel.title} ${sel.version}. Sent back to the author.`, 'info');
                }}
              >
                Request changes
              </Button>
              {sel.citation_check === 'FAIL' && <span className="text-body-sm text-danger-text">Approval blocked by the citation check.</span>}
            </div>
            <SourceNote kinds={['MOCK']}>Sending changes back to the author is a placeholder</SourceNote>
          </div>
        </Card>
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

  return (
    <div className="space-y-8">
      <PageTitle title="Instructor workspace" sub="Marcus Lee · assigned operators, competency evidence and training-content review" />

      <InlineTabs
        label="Instructor workspace"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'operators', label: 'Operators' },
          { value: 'content', label: pending ? `Content review (${pending})` : 'Content review' },
        ]}
      />

      {tab === 'operators' ? (
        <OperatorsTab persona={persona} />
      ) : (
        <ContentTab items={items} loading={reviewsRes.loading} onStatus={(id, status) => setStatusOverride((s) => ({ ...s, [id]: status }))} />
      )}
    </div>
  );
}
