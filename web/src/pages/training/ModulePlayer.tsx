import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataSourceChip } from '../../components/DataSourceChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { SignalIcon } from '../../components/SignalWordChip';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { CitationPassage, Citations } from '../../components/training/citations';
import { ApprovedChip, FormatChip } from '../../components/training/moduleMeta';
import { Button, Chip, EmptyState, ErrorNote, Icon, Loading, MediaPlaceholder, PageTitle, Panel, PanelHeader, cx, toast } from '../../components/ui';
import { ApiError, cloud } from '../../lib/api';
import { useInterval, useResource } from '../../lib/hooks';
import { DEMO_OPERATOR_ID } from '../../lib/persona';
import type { CopilotAnswer, TrainingModule } from '../../lib/types';
import { competencyLabel } from '../../mocks/world';

const DEFAULT_STEPS = ['Expert demonstration', 'Key points', 'Scenario quiz'];
const PLACEHOLDER_POINTS = [
  'Watch the expert demonstration from start to finish.',
  'Note the actions your instructor highlights for this task.',
  'Check your understanding in the scenario quiz.',
];
const SEED_QUESTIONS = ['How close can the bucket be to the truck cab?', 'Can I load while the driver is in the truck?'];
const SUGGESTED = ['How should I slow the swing near the truck?', 'Can I swing over the truck cab?', 'How far back should spoil be from a trench edge?', 'What is my bonus for loading faster?'];
const REFUSED_TEXT = "I couldn't find this in the approved documents. Ask your supervisor or instructor.";
const CLIP_TICKS = 100; // placeholder clip: 100 ticks × 200 ms = 20 s

// ------------------------------------------------------------------ step progress
function StepProgress({ steps, current, done, onSelect }: { steps: string[]; current: number; done: boolean; onSelect: (i: number) => void }) {
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Module progress">
      {steps.map((s, i) => {
        const state = i < current || (done && i <= current) ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s}>
            <button type="button" onClick={() => onSelect(i)} className="w-full text-left" aria-current={state === 'current' ? 'step' : undefined}>
              <div className={cx('h-1.5 w-full', state === 'done' ? 'bg-success-text' : state === 'current' ? 'bg-cat' : 'bg-surface-container-highest')} />
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className={cx(
                    'flex h-5 w-5 items-center justify-center border font-display text-[11px] font-bold',
                    state === 'done' ? 'border-success-text text-success-text' : state === 'current' ? 'border-cat text-cat-text' : 'border-outline-variant text-on-surface-muted',
                  )}
                >
                  {state === 'done' ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span className={cx('font-display text-label-sm uppercase', state === 'todo' ? 'text-on-surface-muted' : 'text-on-surface')}>{s}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ Ask the manual
interface Turn {
  id: number;
  q: string;
  status: 'loading' | 'done' | 'error';
  answer?: CopilotAnswer;
  error?: unknown;
}

const MODE: Record<CopilotAnswer['mode'], { label: string; cls: string; icon: string }> = {
  generative: { label: 'Generative — cited', cls: 'border-notice-dark text-notice-dark bg-notice/10', icon: 'auto_awesome' },
  extractive: { label: 'Extractive — quoted from source', cls: 'border-prov-ml text-prov-ml bg-prov-ml/10', icon: 'format_quote' },
  refused: { label: 'Refused — no approved source', cls: 'border-warning text-warning-text bg-warning/10', icon: 'block' },
};

function ModeChip({ mode }: { mode: CopilotAnswer['mode'] }) {
  const m = MODE[mode] ?? MODE.refused;
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded border px-1.5 font-display text-[11px] font-bold uppercase tracking-[0.05em]', m.cls)}>
      <Icon name={m.icon} size={14} />
      {m.label}
    </span>
  );
}

function AnswerBlock({ turn }: { turn: Turn }) {
  const navigate = useNavigate();
  const a = turn.answer;
  const [showSource, setShowSource] = useState(a?.mode === 'extractive');
  if (turn.status === 'loading') {
    return (
      <div className="flex items-center gap-2 border border-outline bg-surface-container-low px-3 py-3 text-on-surface-muted">
        <span className="h-2 w-2 animate-pulse bg-cat" />
        <span className="font-display text-label-sm uppercase">Searching approved documents…</span>
      </div>
    );
  }
  if (turn.status === 'error' || !a) return <ErrorNote error={turn.error ?? 'No answer'} />;
  const refused = a.mode === 'refused' || !a.citations?.length;
  const mode = refused ? 'refused' : a.mode;
  return (
    <div className={cx('space-y-2 border bg-surface-container-low px-3 py-3', refused ? 'border-warning/60' : 'border-outline')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-label-sm uppercase text-on-surface-muted">
          <Icon name="menu_book" size={16} /> Manual
        </span>
        <span className="flex items-center gap-1">
          <ModeChip mode={mode} />
          {mode === 'generative' && <ProvenanceBadge kind="ML" />}
        </span>
      </div>
      {refused ? (
        <>
          <p className="text-body-md text-on-surface">{a.answer?.trim() || REFUSED_TEXT}</p>
          <Button variant="secondary" size="sm" icon="school" onClick={() => navigate('/training/booking')}>
            Ask instructor
          </Button>
        </>
      ) : (
        <>
          <p className="text-body-md text-on-surface">{a.answer}</p>
          <Citations citations={a.citations} />
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
            className="inline-flex items-center gap-1 font-display text-label-sm uppercase text-notice-dark hover:underline"
          >
            <Icon name={showSource ? 'expand_less' : 'expand_more'} size={18} />
            {showSource ? 'Hide source passage' : 'View source passage'}
          </button>
          {showSource && (
            <div className="space-y-2">
              {a.citations.map((c, i) => (
                <CitationPassage key={`${c.chunk_id ?? c.doc_id}-${i}`} citation={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AskTheManual({ module }: { module: TrainingModule | undefined }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const seq = useRef(0);
  const seeded = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question) return;
    seq.current += 1;
    const id = seq.current;
    setTurns((t) => [...t, { id, q: question, status: 'loading' }]);
    try {
      const answer = await cloud.copilotAsk(question, DEMO_OPERATOR_ID);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'done', answer: { answer: answer?.answer ?? '', citations: answer?.citations ?? [], mode: answer?.mode ?? 'refused' } } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'error', error: e } : x)));
    }
  };

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    (async () => {
      for (const q of SEED_QUESTIONS) await ask(q);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el && turns.length > SEED_QUESTIONS.length) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = input;
    setInput('');
    void ask(q);
  };

  const busy = turns.some((t) => t.status === 'loading');
  return (
    <Panel className="flex flex-col xl:sticky xl:top-4">
      <PanelHeader icon="forum" title="Ask the manual" sub="Answers only from approved documents" right={<DataSourceChip endpoints={['/copilot']} />} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-outline bg-surface-container-low px-4 py-2 font-display text-[11px] uppercase tracking-[0.06em] text-on-surface-muted">
        <Icon name="library_books" size={14} /> Approved sources: <span className="normal-case text-on-surface-variant">Site SOP-EX-04 v1.2 · Site SOP-EX-07 v1.1</span>
      </div>
      <div ref={threadRef} className="max-h-[620px] min-h-[240px] space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && <Loading label="Loading examples" />}
        {turns.map((t) => (
          <div key={t.id} className="space-y-2">
            <div className="ml-8 border border-outline-variant bg-surface-container-high px-3 py-2">
              <div className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-on-surface-muted">You asked</div>
              <p className="text-body-md text-on-surface">{t.q}</p>
            </div>
            <AnswerBlock key={`${t.id}-${t.status}`} turn={t} />
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-outline p-4">
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void ask(s)}
              className="rounded border border-outline bg-surface-container-low px-2 py-1 text-left text-body-sm text-on-surface-variant transition-colors duration-quick hover:border-outline-strong hover:text-on-surface disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input className="input" placeholder="Ask about this procedure…" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Question for the manual" maxLength={300} />
          <Button type="submit" variant="secondary" icon="send" disabled={!input.trim() || busy} aria-label="Ask">
            Ask
          </Button>
        </form>
        <p className="flex items-start gap-1.5 text-footnote text-on-surface-muted">
          <Icon name="verified_user" size={14} className="mt-0.5" />
          Safety-critical answers show the source text. Content {module?.version ?? 'v1.2'} reviewed by {module?.approved_by ?? 'M. Lee'}.
        </p>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ page
export default function ModulePlayer() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: mod, loading } = useResource(() => cloud.module(id), [id]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    setStep(0);
    setPlaying(false);
    setTick(0);
    setCompleted(false);
    setError(undefined);
  }, [id]);

  useInterval(() => setTick((t) => Math.min(CLIP_TICKS, t + 1)), playing ? 200 : null);

  // Clip finished → stop and move on to the key points.
  useEffect(() => {
    if (playing && tick >= CLIP_TICKS) {
      setPlaying(false);
      setStep((s) => Math.max(s, 1));
    }
  }, [playing, tick]);

  if (loading && !mod) {
    return (
      <div className="space-y-6">
        <TrainingTabs />
        <Loading label="Loading module" />
      </div>
    );
  }
  if (!mod) {
    return (
      <div className="space-y-6">
        <TrainingTabs />
        <EmptyState icon="school" title="Module not found">
          This module is not available. <Link to="/training" className="text-notice-dark underline">Back to the Training Hub</Link>
        </EmptyState>
      </div>
    );
  }

  const steps = mod.steps?.length ? mod.steps : DEFAULT_STEPS;
  const points = mod.key_points ?? [];
  const hasPoints = points.length > 0;
  const secs = Math.round((tick / CLIP_TICKS) * 20);

  const markComplete = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await cloud.completeModule(mod.module_id, DEMO_OPERATOR_ID);
      setCompleted(true);
      setStep(Math.max(step, steps.length - 1));
      toast(`Module complete. ${competencyLabel(mod.competency_id) || 'This competency'} stays below DEMONSTRATED until assessed.`);
    } catch (e) {
      setError(e);
      toast(e instanceof ApiError ? e.detail : 'Could not save completion', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <TrainingTabs />
      <PageTitle
        kicker={`Micro-module · ${competencyLabel(mod.competency_id)}`}
        title={mod.title}
        sub={`Step ${Math.min(step + 1, steps.length)} of ${steps.length} · ${mod.duration_min} min${mod.summary ? ` · ${mod.summary}` : ''}`}
        right={
          <>
            <FormatChip format={mod.format} />
            <ApprovedChip version={mod.version} approvedAt={mod.approved_at} approvedBy={mod.approved_by} mock />
            <DataSourceChip endpoints={['GET /training/modules/{id}']} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* video */}
          <Panel className="space-y-4 p-4">
            <MediaPlaceholder label="Expert demonstration — placeholder video" icon="smart_display">
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (tick >= CLIP_TICKS) setTick(0);
                    setPlaying((p) => !p);
                  }}
                  className="flex h-20 w-20 items-center justify-center border-2 border-on-surface-muted bg-surface-container-lowest/80 text-on-surface transition-colors duration-quick hover:border-on-surface"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  <Icon name={playing ? 'pause' : tick >= CLIP_TICKS ? 'replay' : 'play_arrow'} size={48} />
                </button>
                <span className="font-display text-label-md uppercase text-on-surface-variant">Expert demonstration — placeholder video</span>
                <span className="text-body-sm text-on-surface-muted">{steps[0]} · clip not bundled in the prototype</span>
              </div>
              <div className="absolute left-3 top-3 flex gap-1.5">
                <ProvenanceBadge kind="MOCK" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-surface-container-lowest/85 px-3 py-2">
                <span className="tnum font-display text-label-sm text-on-surface-variant">0:{String(secs).padStart(2, '0')} / 0:20</span>
                <div className="h-1.5 flex-1 bg-surface-container-highest">
                  <div className="h-full bg-cat transition-all" style={{ width: `${(tick / CLIP_TICKS) * 100}%` }} />
                </div>
              </div>
            </MediaPlaceholder>
            <StepProgress steps={steps} current={step} done={completed} onSelect={setStep} />
          </Panel>

          {/* key points */}
          <Panel>
            <PanelHeader icon="checklist" title="Key points" sub="Each point cites the approved site document — tap a citation to read the passage" right={<ProvenanceBadges kinds={hasPoints ? ['RULE'] : ['MOCK']} />} />
            <ol className="divide-y divide-outline">
              {(hasPoints ? points : PLACEHOLDER_POINTS.map((text) => ({ text, citations: [] }))).map((p, i) => (
                <li key={`${i}-${p.text}`} className="flex gap-4 px-4 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-outline-strong bg-surface-container-high font-display text-headline-sm text-on-surface">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-body-lg text-on-surface">{p.text}</p>
                    {p.citations?.length ? (
                      <Citations citations={p.citations} />
                    ) : (
                      <Chip icon="link_off" className="border-dashed">
                        No citation yet
                      </Chip>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {!hasPoints && (
              <div className="flex items-start gap-2 border-t border-outline bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant">
                <Icon name="info" size={18} className="mt-0.5 text-notice-dark" />
                Cited key points for this module are not published yet. These are placeholder steps — follow your instructor and the site SOP.
              </div>
            )}
          </Panel>

          {/* why this matters */}
          <div className="flex items-start gap-3 border-2 border-notice bg-notice/15 p-4" role="note">
            <SignalIcon word="NOTICE" size={28} ink="#4DB1FF" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-label-md uppercase text-notice-dark">Notice · Why this matters for you</span>
                <ProvenanceBadges kinds={mod.why_for_you ? ['RULE', 'SIMULATED'] : ['RULE']} />
              </div>
              <p className="mt-1 text-body-lg text-on-surface">{mod.why_for_you || 'Part of the standard excavator programme for this site.'}</p>
            </div>
          </div>

          {/* actions */}
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="max-w-md text-body-sm text-on-surface-muted">
              Completing a module never sets DEMONSTRATED. An instructor or a passed assessment does.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="lg" icon={completed ? 'task_alt' : 'check'} onClick={markComplete} disabled={completed || saving}>
                {completed ? 'Completed' : saving ? 'Saving…' : 'Mark complete'}
              </Button>
              <Button variant="primary" size="lg" iconRight="arrow_forward" onClick={() => navigate(`/training/quiz/${encodeURIComponent(mod.module_id)}`)}>
                Next: scenario quiz
              </Button>
            </div>
            {error !== undefined && (
              <div className="w-full">
                <ErrorNote error={error} />
              </div>
            )}
          </Panel>
        </div>

        <div>
          <AskTheManual module={mod} />
        </div>
      </div>
    </div>
  );
}
