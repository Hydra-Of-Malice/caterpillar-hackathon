import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SourceNote } from '../../components/ProvenanceBadge';
import { SignalIcon } from '../../components/SignalWordChip';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { CitationPassage, Citations } from '../../components/training/citations';
import { SectionTitle } from '../../components/training/Details';
import { MotionReplay } from '../../components/training/MotionReplay';
import { VrOption } from '../../components/training/VrOption';
import { ApprovedChip, formatLabel } from '../../components/training/moduleMeta';
import { Button, EmptyState, ErrorNote, Icon, Loading, PageTitle, Panel, cx, toast } from '../../components/ui';
import { ApiError, cloud } from '../../lib/api';
import { useResource } from '../../lib/hooks';
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

// ------------------------------------------------------------------ step progress
function StepProgress({ steps, current, done, onSelect }: { steps: string[]; current: number; done: boolean; onSelect: (i: number) => void }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Module progress">
      {steps.map((s, i) => {
        const state = i < current || (done && i <= current) ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s}>
            <button type="button" onClick={() => onSelect(i)} className="w-full text-left" aria-current={state === 'current' ? 'step' : undefined}>
              <div className={cx('h-1 w-full rounded-full', state === 'done' ? 'bg-success' : state === 'current' ? 'bg-cat' : 'bg-surface-container-highest')} />
              <div className={cx('mt-2 flex items-center gap-1 text-body-sm', state === 'todo' ? 'text-on-surface-muted' : 'text-on-surface')}>
                {state === 'done' ? <Icon name="check" size={16} className="text-success-text" /> : <span className="tnum">{i + 1}.</span>}
                {s}
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
  generative: { label: 'Cited answer', cls: 'text-notice-dark', icon: 'auto_awesome' },
  extractive: { label: 'Quoted from the source', cls: 'text-comp-improving', icon: 'format_quote' },
  refused: { label: 'No approved source', cls: 'text-warning-text', icon: 'block' },
};

function ModeChip({ mode }: { mode: CopilotAnswer['mode'] }) {
  const m = MODE[mode] ?? MODE.refused;
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap text-footnote font-semibold', m.cls)}>
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
      <div className="flex items-center gap-2 text-body-sm text-on-surface-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cat" />
        Searching approved documents…
      </div>
    );
  }
  if (turn.status === 'error' || !a) return <ErrorNote error={turn.error ?? 'No answer'} />;
  const refused = a.mode === 'refused' || !a.citations?.length;
  const mode = refused ? 'refused' : a.mode;
  return (
    <div className={cx('space-y-2', refused && 'border-l-2 border-warning pl-3')}>
      <ModeChip mode={mode} />
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
            className="inline-flex items-center gap-0.5 text-body-sm font-semibold text-notice-dark hover:underline"
          >
            {showSource ? 'Hide source passage' : 'View source passage'}
            <Icon name={showSource ? 'expand_less' : 'expand_more'} size={18} />
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
      <div className="px-6 pt-6">
        <SectionTitle sub="Answers only from approved site documents">Ask the manual</SectionTitle>
      </div>
      <div ref={threadRef} className="max-h-[560px] min-h-[240px] space-y-6 overflow-y-auto px-6 py-5">
        {turns.length === 0 && <Loading label="Loading examples" />}
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-surface-container-high px-4 py-2 text-body-md text-on-surface">{t.q}</p>
            <AnswerBlock key={`${t.id}-${t.status}`} turn={t} />
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-outline px-6 py-5">
        <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void ask(s)}
              className="rounded-full border border-outline px-3 py-1 text-left text-body-sm text-on-surface-variant transition-colors duration-quick hover:border-outline-strong hover:text-on-surface disabled:opacity-50"
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
        <p className="text-footnote text-on-surface-muted">Safety-critical answers show the source text. Reviewed by {module?.approved_by ?? 'M. Lee'}.</p>
        <SourceNote kinds={['RULE', 'ML']} className="!mt-0" />
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
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    setStep(0);
    setCompleted(false);
    setError(undefined);
  }, [id]);

  // Replay finished → move on to the key points.
  const onReplayEnded = useCallback(() => setStep((s) => Math.max(s, 1)), []);

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
    <div className="space-y-8">
      <TrainingTabs />
      <PageTitle title={mod.title} sub={`${formatLabel(mod.format)} · ${mod.duration_min} min · ${competencyLabel(mod.competency_id)}`} />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <div className="space-y-10 xl:col-span-2">
          {/* video */}
          <section className="space-y-4">
            {mod.replay_exercise ? (
              <MotionReplay key={mod.module_id} exercise={mod.replay_exercise} onEnded={onReplayEnded} />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded bg-surface-container-low text-center">
                <Icon name="smart_display" size={40} className="text-on-surface-muted" />
                <p className="text-body-md text-on-surface">Demonstration video</p>
                <p className="text-body-sm text-on-surface-muted">Recorded with an instructor in the production phase. Key points and quiz below are ready now.</p>
                <button type="button" onClick={onReplayEnded} className="mt-2 text-body-sm text-notice-dark hover:underline">Go to key points</button>
              </div>
            )}
            <VrOption vr={mod.vr} />
            <StepProgress steps={steps} current={step} done={completed} onSelect={setStep} />
          </section>

          {/* key points */}
          <section className="space-y-2">
            <SectionTitle sub="Tap a citation to read the passage from the site document">Key points</SectionTitle>
            <ol className="divide-y divide-outline">
              {(hasPoints ? points : PLACEHOLDER_POINTS.map((text) => ({ text, citations: [] }))).map((p, i) => (
                <li key={`${i}-${p.text}`} className="flex gap-4 py-5">
                  <span className="tnum w-6 shrink-0 font-display text-headline-sm text-on-surface-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className="text-body-md text-on-surface">{p.text}</p>
                    {p.citations?.length ? <Citations citations={p.citations} /> : <p className="text-body-sm text-on-surface-muted">No citation yet</p>}
                  </div>
                </li>
              ))}
            </ol>
            {!hasPoints && <p className="text-body-sm text-on-surface-muted">Cited key points are not published yet. Follow your instructor and the site SOP.</p>}
            <div className="pt-2">
              <ApprovedChip version={mod.version} approvedAt={mod.approved_at} approvedBy={mod.approved_by} />
            </div>
            <SourceNote kinds={hasPoints ? ['RULE'] : ['MOCK']} />
          </section>

          {/* why this matters (NOTICE) */}
          <div className="flex items-start gap-3 rounded border-l-4 border-notice bg-notice/5 px-5 py-4" role="note">
            <SignalIcon word="NOTICE" size={24} ink="#0067B8" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-label-sm uppercase text-notice-dark">Notice · Why this matters for you</div>
              <p className="mt-1 text-body-md text-on-surface">{mod.why_for_you || 'Part of the standard excavator programme for this site.'}</p>
              <SourceNote kinds={mod.why_for_you ? ['RULE', 'SIMULATED'] : ['RULE']} className="!mt-1" />
            </div>
          </div>

          {/* actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-outline pt-6">
            <p className="max-w-md text-body-sm text-on-surface-muted">Completing a module never sets DEMONSTRATED. An instructor or a passed assessment does.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" icon={completed ? 'task_alt' : 'check'} onClick={markComplete} disabled={completed || saving}>
                {completed ? 'Completed' : saving ? 'Saving…' : 'Mark complete'}
              </Button>
              <Button variant="primary" iconRight="arrow_forward" onClick={() => navigate(`/training/quiz/${encodeURIComponent(mod.module_id)}`)}>
                Next: scenario quiz
              </Button>
            </div>
            {error !== undefined && (
              <div className="w-full">
                <ErrorNote error={error} />
              </div>
            )}
          </div>
        </div>

        <div>
          <AskTheManual module={mod} />
        </div>
      </div>
    </div>
  );
}
