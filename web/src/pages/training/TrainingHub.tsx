import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CompetencyChip } from '../../components/CompetencyChip';
import { SourceNote } from '../../components/ProvenanceBadge';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { DetailsButton, SectionTitle } from '../../components/training/Details';
import { FORMAT_OPTIONS, ModuleStatusChip, formatIcon, formatLabel, machineTypeLabel } from '../../components/training/moduleMeta';
import { Button, EmptyState, Icon, Loading, PageTitle, Panel, cx } from '../../components/ui';
import { cloud } from '../../lib/api';
import { fmtClock, fmtDate } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { DEMO_OPERATOR_ID } from '../../lib/persona';
import type { CompetencyEntry, Recommendation, TrainingModule } from '../../lib/types';
import { COMPETENCIES, COMPETENCY_MODULE, competencyLabel } from '../../mocks/world';

/** Evidence lines are for people: drop any probability/confidence fragments (never shown to operators). */
function plainEvidence(e: string | undefined | null): string {
  if (!e) return '';
  return e
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !/P\(|confidence|probab|%/i.test(s))
    .join(' · ');
}

const isStarted = (status: string | undefined | null) => {
  const s = (status ?? '').toLowerCase();
  return !!s && s !== 'not_started' && s !== 'unassessed';
};

// ------------------------------------------------------------------ recommended card
function RecommendedCard({ rec, module, primary }: { rec: Recommendation; module?: TrainingModule; primary: boolean }) {
  const navigate = useNavigate();
  const telemetry = /cycle|swing|shift|idle|intrusion/i.test(`${rec.why} ${rec.evidence ?? ''}`);
  const format = rec.format ?? module?.format;
  const evidence = plainEvidence(rec.evidence);
  return (
    <Panel as="article" className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-1.5 text-body-sm text-on-surface-muted">
        <Icon name={formatIcon(format)} size={18} />
        {formatLabel(format)} · <span className="tnum">{rec.duration_min} min</span>
      </div>
      <h3 className="font-display text-headline-sm text-on-surface">{rec.title}</h3>
      <p className="text-body-md text-on-surface-variant" title={evidence ? `Evidence: ${evidence}` : undefined}>
        {rec.why}
      </p>
      <div className="mt-auto pt-3">
        <Button variant={primary ? 'primary' : 'secondary'} icon="play_arrow" onClick={() => navigate(`/training/module/${encodeURIComponent(rec.module_id)}`)}>
          {rec.status === 'in_training' ? 'Continue' : 'Start'}
        </Button>
      </div>
      <SourceNote kinds={telemetry ? ['RULE', 'SIMULATED'] : ['RULE']}>{evidence || undefined}</SourceNote>
    </Panel>
  );
}

// ------------------------------------------------------------------ module grid card
function ModuleCard({ m }: { m: TrainingModule }) {
  return (
    <Link to={`/training/module/${encodeURIComponent(m.module_id)}`} className="panel group flex flex-col gap-2 p-5 transition-colors duration-quick hover:bg-surface-container-low">
      <div className="flex items-center gap-1.5 text-body-sm text-on-surface-muted">
        <Icon name={formatIcon(m.format)} size={18} />
        {formatLabel(m.format)} · <span className="tnum">{m.duration_min} min</span>
        {m.safety_critical && <Icon name="shield" size={16} className="ml-auto text-danger-text" title="Safety-critical: an instructor must verify DEMONSTRATED" />}
      </div>
      <div className="font-semibold text-on-surface group-hover:underline">{m.title}</div>
      {m.summary && <p className="line-clamp-2 text-body-sm text-on-surface-variant">{m.summary}</p>}
      {isStarted(m.status) && (
        <div className="mt-auto pt-1">
          <ModuleStatusChip status={m.status} />
        </div>
      )}
    </Link>
  );
}

// ------------------------------------------------------------------ filter chip
function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex h-9 items-center rounded-full border px-4 text-body-sm transition-colors duration-quick',
        on ? 'border-on-surface bg-surface-container-high font-semibold text-on-surface' : 'border-outline bg-surface text-on-surface-variant hover:border-outline-strong hover:text-on-surface',
      )}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ competency row
function CompetencyRow({ c, showEvidence }: { c: CompetencyEntry; showEvidence: boolean }) {
  const moduleId = COMPETENCY_MODULE[c.id];
  const evidence = plainEvidence(c.evidence);
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-body-md text-on-surface">
          <span className="truncate">{c.label}</span>
          {c.safety_critical && <Icon name="shield" size={16} className="text-danger-text" title="Safety-critical: instructor verification required" />}
        </span>
        <CompetencyChip state={c.state} verifiedBy={c.verified_by} className="shrink-0" />
      </div>
      {showEvidence && evidence && <p className="mt-1 text-body-sm text-on-surface-muted">{evidence}</p>}
    </>
  );
  const cls = 'block py-3';
  return moduleId ? (
    <li>
      <Link to={`/training/module/${moduleId}`} className={cx(cls, '-mx-2 rounded px-2 transition-colors duration-quick hover:bg-surface-container-low')} title="Open the linked module">
        {body}
      </Link>
    </li>
  ) : (
    <li className={cls}>{body}</li>
  );
}

// ------------------------------------------------------------------ page
export default function TrainingHub() {
  const recs = useResource(() => cloud.recommendations(DEMO_OPERATOR_ID), []);
  const mods = useResource(() => cloud.modules(), []);
  const profile = useResource(() => cloud.profile(DEMO_OPERATOR_ID), []);
  const slots = useResource(() => cloud.slots(), []);

  const [machine, setMachine] = useState<string>('all');
  const [competency, setCompetency] = useState<string>('all');
  const [format, setFormat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const modules = mods.data ?? [];
  const moduleById = useMemo(() => new Map(modules.map((m) => [m.module_id, m])), [modules]);
  const machineTypes = useMemo(() => Array.from(new Set(modules.flatMap((m) => m.machine_types ?? []))), [modules]);

  const filtered = modules.filter((m) => {
    if (machine !== 'all' && m.machine_types?.length && !m.machine_types.includes(machine)) return false;
    if (competency !== 'all' && m.competency_id !== competency) return false;
    if (format !== 'all' && m.format !== format) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!`${m.title} ${m.summary ?? ''} ${competencyLabel(m.competency_id)}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const anyFilter = machine !== 'all' || competency !== 'all' || format !== 'all' || search.trim() !== '';
  const hiddenFilters = (machine !== 'all' ? 1 : 0) + (competency !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);
  const clearFilters = () => {
    setMachine('all');
    setCompetency('all');
    setFormat('all');
    setSearch('');
  };

  const recommendations = (recs.data ?? []).slice(0, 2);
  const pending = (recs.data ?? []).filter((r) => r.status !== 'completed').length;
  const comps = profile.data?.competencies ?? [];

  // The booked session (MOCK): Marcus Lee's first simulator slot.
  const upcoming = (slots.data ?? [])
    .filter((s) => s.instructor_id === 'INS-01' && s.format === 'simulator' && s.available !== false)
    .sort((a, b) => a.start_ts - b.start_ts)[0];
  const upcomingWhen = upcoming ? `${fmtDate(upcoming.start_ts)} · ${fmtClock(upcoming.start_ts)}` : 'Fri 25 Sep · 10:00';
  const upcomingWhere = upcoming?.location ?? 'Simulator bay 2';

  return (
    <div className="space-y-8">
      <TrainingTabs />
      <PageTitle
        title="Training Hub"
        sub={
          recs.loading && !recs.data
            ? 'Short, cited modules picked from your own shifts.'
            : `Short, cited modules picked from your own shifts · ${pending} pending`
        }
      />

      {/* upcoming session, one line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-md text-on-surface-variant">
        <Icon name="event" size={20} className="text-notice-dark" />
        <span>
          Next session: <span className="font-semibold text-on-surface">Simulator with Marcus Lee</span> · <span className="tnum">{upcomingWhen}</span> · {upcomingWhere}
        </span>
        <Link to="/training/booking?topic=C04" className="text-body-sm font-semibold text-notice-dark hover:underline">
          Book instructor
        </Link>
        <SourceNote kinds={['MOCK']} className="!mt-0" />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        {/* ------------------------------------------------ left 2/3 */}
        <div className="space-y-10 xl:col-span-2">
          <section className="space-y-4">
            <SectionTitle sub="Based on your recent shifts">Recommended for you</SectionTitle>
            {recs.loading && !recs.data ? (
              <Loading label="Loading recommendations" />
            ) : recommendations.length === 0 ? (
              <EmptyState icon="task_alt" title="Nothing recommended right now">
                No gaps were observed in your recent shifts. Browse all modules below or book a session with your instructor.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {recommendations.map((r, i) => (
                  <RecommendedCard key={r.module_id} rec={r} module={moduleById.get(r.module_id)} primary={i === 0} />
                ))}
              </div>
            )}
          </section>

          {/* all modules */}
          <section className="space-y-4">
            <SectionTitle
              sub="Approved by your instructor. Every key point cites the site SOP."
              right={
                <span className="text-body-sm text-on-surface-muted">
                  <span className="tnum">{filtered.length}</span> of <span className="tnum">{modules.length}</span>
                </span>
              }
            >
              All modules
            </SectionTitle>

            <div className="flex flex-wrap items-center gap-2">
              <FilterChip on={format === 'all'} onClick={() => setFormat('all')}>
                All
              </FilterChip>
              {FORMAT_OPTIONS.map((f) => (
                <FilterChip key={f.value} on={format === f.value} onClick={() => setFormat(f.value)}>
                  {f.label}
                </FilterChip>
              ))}
              <span className="ml-auto flex items-center gap-4">
                {anyFilter && (
                  <button type="button" onClick={clearFilters} className="text-body-sm text-on-surface-muted hover:text-on-surface hover:underline">
                    Clear
                  </button>
                )}
                <DetailsButton open={showFilters} onClick={() => setShowFilters((v) => !v)} label={hiddenFilters ? `Filters (${hiddenFilters})` : 'Filters'} />
              </span>
            </div>

            {showFilters && (
              <div className="grid animate-fade-up grid-cols-1 gap-4 rounded bg-surface-container-low p-4 md:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-body-sm text-on-surface-muted">
                  Search
                  <input className="input h-10" placeholder="Title or topic…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5 text-body-sm text-on-surface-muted">
                  Competency
                  <select className="select h-10" value={competency} onChange={(e) => setCompetency(e.target.value)}>
                    <option value="all">All competencies</option>
                    {COMPETENCIES.filter((c) => modules.some((m) => m.competency_id === c.id)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-body-sm text-on-surface-muted">
                  Machine
                  <select className="select h-10" value={machine} onChange={(e) => setMachine(e.target.value)}>
                    <option value="all">All machines</option>
                    {machineTypes.map((t) => (
                      <option key={t} value={t}>
                        {machineTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {mods.loading && !mods.data ? (
              <Loading label="Loading modules" />
            ) : modules.length === 0 ? (
              <EmptyState icon="school" title="No modules published yet">
                Your instructor has not published any modules for this site.
              </EmptyState>
            ) : filtered.length === 0 ? (
              <EmptyState icon="filter_alt_off" title="No modules match these filters">
                Try another format, or clear the filters.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((m) => (
                  <ModuleCard key={m.module_id} m={m} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ right 1/3 */}
        <aside>
          <Panel className="p-6">
            <SectionTitle sub="Excavator · North Quarry">My competencies</SectionTitle>
            {profile.loading && !profile.data ? (
              <Loading label="Loading competencies" />
            ) : comps.length === 0 ? (
              <p className="mt-4 text-body-sm text-on-surface-muted">Your instructor will set up your competency record after your first assessment.</p>
            ) : (
              <ul className="mt-3 divide-y divide-outline">
                {comps.map((c) => (
                  <CompetencyRow key={c.id} c={c} showEvidence={showEvidence} />
                ))}
              </ul>
            )}
            <div className="mt-4">
              <DetailsButton open={showEvidence} onClick={() => setShowEvidence((v) => !v)} />
              {showEvidence && <p className="mt-2 text-body-sm text-on-surface-muted">Only an instructor or a passed assessment can mark DEMONSTRATED. Initials show who verified it.</p>}
            </div>
            <SourceNote kinds={['RULE', 'SIMULATED']} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
