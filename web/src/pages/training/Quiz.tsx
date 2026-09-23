import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SourceNote } from '../../components/ProvenanceBadge';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { Citations } from '../../components/training/citations';
import { Details } from '../../components/training/Details';
import { Button, EmptyState, ErrorNote, Icon, Loading, PageTitle, Panel, cx } from '../../components/ui';
import { cloud } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { DEMO_OPERATOR_ID } from '../../lib/persona';
import type { QuizAttemptResponse, QuizQuestion } from '../../lib/types';
import { competencyLabel } from '../../mocks/world';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ------------------------------------------------------------------ top-down illustrations (inline SVG, not to scale)
function TruckLoadingScene({ showDistance }: { showDistance: boolean }) {
  return (
    <svg viewBox="0 0 520 240" className="h-full w-full" role="img" aria-label="Top-down sketch: excavator swinging a loaded bucket from the dig face towards the truck body; the truck cab is a no-swing zone">
      <defs>
        <pattern id="qz-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--chart-tip-bg)" />
          <rect width="3" height="8" fill="var(--chart-grid)" />
        </pattern>
        <pattern id="qz-red" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--chart-grid)" />
          <rect width="3" height="8" fill="#C52320" opacity="0.8" />
        </pattern>
        <marker id="qz-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#FB5A00" />
        </marker>
      </defs>
      <rect x="0" y="0" width="520" height="240" fill="var(--chart-tip-bg)" />
      {/* dig face */}
      <rect x="150" y="204" width="200" height="36" fill="url(#qz-hatch)" stroke="var(--chart-axis)" />
      <text x="250" y="228" textAnchor="middle" fill="var(--chart-tick)" fontSize="12" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">DIG FACE</text>
      {/* slow zone around the truck */}
      <rect x="300" y="36" width="210" height="116" fill="none" stroke="var(--chart-tick)" strokeDasharray="6 5" rx="4" />
      <text x="306" y="30" fill="var(--chart-tick)" fontSize="11" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">SLOW ZONE · 5 m OF TRUCK</text>
      {/* truck: body + cab */}
      <rect x="330" y="60" width="118" height="68" fill="var(--chart-grid)" stroke="#757575" strokeWidth="2" />
      <rect x="338" y="68" width="102" height="52" fill="none" stroke="var(--chart-tip-border)" />
      <text x="389" y="98" textAnchor="middle" fill="var(--svg-text)" fontSize="12" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">TRUCK BODY</text>
      <rect x="454" y="66" width="46" height="56" fill="url(#qz-red)" stroke="#C52320" strokeWidth="2" />
      <text x="477" y="140" textAnchor="middle" fill="rgb(var(--danger-text))" fontSize="11" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">CAB · NO SWING</text>
      {/* excavator: tracks, house, cab */}
      <rect x="62" y="84" width="130" height="18" fill="var(--chart-grid)" stroke="var(--chart-tip-border)" />
      <rect x="62" y="168" width="130" height="18" fill="var(--chart-grid)" stroke="var(--chart-tip-border)" />
      <rect x="92" y="104" width="76" height="62" fill="var(--chart-grid)" stroke="#757575" strokeWidth="2" rx="3" />
      <rect x="97" y="109" width="22" height="24" fill="var(--chart-axis)" stroke="#757575" />
      <text x="127" y="203" textAnchor="middle" fill="var(--chart-tick)" fontSize="11" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">EXCAVATOR</text>
      {/* boom + bucket */}
      <line x1="160" y1="132" x2="292" y2="100" stroke="var(--chart-tip-border)" strokeWidth="9" strokeLinecap="square" />
      <rect x="290" y="90" width="18" height="18" fill="var(--svg-text)" stroke="var(--chart-tip-border)" />
      {/* swing path */}
      <path d="M 248 206 Q 262 140 286 108" fill="none" stroke="#FB5A00" strokeWidth="3" strokeDasharray="7 5" markerEnd="url(#qz-arrow)" />
      <text x="206" y="162" fill="rgb(var(--warning-text))" fontSize="12" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">SWING PATH</text>
      {showDistance && (
        <g>
          <line x1="308" y1="80" x2="330" y2="80" stroke="var(--svg-text)" strokeWidth="1.5" />
          <line x1="308" y1="74" x2="308" y2="86" stroke="var(--svg-text)" strokeWidth="1.5" />
          <line x1="330" y1="74" x2="330" y2="86" stroke="var(--svg-text)" strokeWidth="1.5" />
          <text x="319" y="70" textAnchor="middle" fill="var(--svg-text)" fontSize="12" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">4 m</text>
        </g>
      )}
    </svg>
  );
}

function TrenchScene() {
  return (
    <svg viewBox="0 0 520 240" className="h-full w-full" role="img" aria-label="Top-down sketch: excavator behind the setback line beside a trench, with the spoil pile placed back from the edge">
      <rect x="0" y="0" width="520" height="240" fill="var(--chart-tip-bg)" />
      <rect x="40" y="150" width="440" height="46" fill="var(--chart-axis)" stroke="var(--chart-tip-border)" strokeWidth="2" />
      <text x="260" y="178" textAnchor="middle" fill="var(--chart-tick)" fontSize="12" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">TRENCH</text>
      <line x1="40" y1="124" x2="480" y2="124" stroke="var(--chart-tick)" strokeDasharray="6 5" />
      <text x="44" y="118" fill="var(--chart-tick)" fontSize="11" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">SETBACK LINE</text>
      <ellipse cx="390" cy="72" rx="62" ry="26" fill="var(--chart-grid)" stroke="#757575" />
      <text x="390" y="76" textAnchor="middle" fill="var(--svg-text)" fontSize="11" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">SPOIL</text>
      <line x1="470" y1="98" x2="470" y2="150" stroke="var(--svg-text)" strokeWidth="1.5" />
      <line x1="464" y1="98" x2="476" y2="98" stroke="var(--svg-text)" strokeWidth="1.5" />
      <line x1="464" y1="150" x2="476" y2="150" stroke="var(--svg-text)" strokeWidth="1.5" />
      <text x="462" y="130" textAnchor="end" fill="var(--svg-text)" fontSize="12" fontFamily="Roboto Condensed, sans-serif" fontWeight="700">≥ 0.6 m</text>
      <rect x="130" y="22" width="120" height="16" fill="var(--chart-grid)" stroke="var(--chart-tip-border)" />
      <rect x="130" y="96" width="120" height="16" fill="var(--chart-grid)" stroke="var(--chart-tip-border)" />
      <rect x="156" y="40" width="68" height="54" fill="var(--chart-grid)" stroke="#757575" strokeWidth="2" rx="3" />
      <rect x="161" y="45" width="20" height="22" fill="var(--chart-axis)" stroke="#757575" />
      <line x1="200" y1="92" x2="228" y2="160" stroke="var(--chart-tip-border)" strokeWidth="9" strokeLinecap="square" />
      <rect x="220" y="158" width="18" height="18" fill="var(--svg-text)" stroke="var(--chart-tip-border)" />
    </svg>
  );
}

// ------------------------------------------------------------------ option card
function OptionCard({
  letter, text, selected, locked, isCorrect, isWrong, onSelect,
}: { letter: string; text: string; selected: boolean; locked: boolean; isCorrect: boolean; isWrong: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={locked}
      onClick={onSelect}
      className={cx(
        'flex min-h-[64px] w-full items-center gap-4 rounded border px-4 py-3 text-left transition-colors duration-quick disabled:cursor-default',
        isCorrect && 'border-success bg-success/10',
        isWrong && 'border-danger bg-danger/10',
        !isCorrect && !isWrong && selected && 'border-cat-border bg-cat/10',
        !isCorrect && !isWrong && !selected && (locked ? 'border-outline opacity-60' : 'border-outline hover:border-outline-strong hover:bg-surface-container-low'),
      )}
    >
      <span
        className={cx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display text-body-md font-bold',
          isCorrect ? 'border-success-text text-success-text' : isWrong ? 'border-danger-text text-danger-text' : selected ? 'border-cat-border bg-cat text-black' : 'border-outline-strong text-on-surface-variant',
        )}
      >
        {isCorrect ? <Icon name="check" size={20} /> : isWrong ? <Icon name="close" size={20} /> : letter}
      </span>
      <span className="flex-1 text-body-md text-on-surface">{text}</span>
      {isCorrect && <span className="text-body-sm font-semibold text-success-text">Safer answer</span>}
      {isWrong && <span className="text-body-sm font-semibold text-danger-text">Your answer</span>}
    </button>
  );
}

// ------------------------------------------------------------------ feedback
function Feedback({ q, chosen }: { q: QuizQuestion; chosen: string }) {
  const known = !!q.correct_option_id;
  const correct = known && chosen === q.correct_option_id;
  const right = q.options.find((o) => o.id === q.correct_option_id);
  const rightIdx = q.options.findIndex((o) => o.id === q.correct_option_id);
  if (!known) {
    return (
      <div className="flex items-start gap-3 rounded border-l-4 border-notice bg-notice/5 px-5 py-4" role="status">
        <Icon name="task_alt" size={24} className="text-notice-dark" />
        <div className="space-y-2">
          <div className="font-semibold text-on-surface">Answer recorded</div>
          {q.explanation && <p className="text-body-md text-on-surface-variant">{q.explanation}</p>}
          {q.citation && <Citations citations={[q.citation]} />}
        </div>
      </div>
    );
  }
  return (
    <div className={cx('flex items-start gap-3 rounded border-l-4 px-5 py-4', correct ? 'border-success bg-success/5' : 'border-danger bg-danger/5')} role="status">
      <Icon name={correct ? 'check_circle' : 'cancel'} size={24} fill className={correct ? 'text-success-text' : 'text-danger-text'} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={cx('font-semibold', correct ? 'text-success-text' : 'text-danger-text')}>{correct ? 'Correct' : 'Not quite'}</div>
        {!correct && right && (
          <p className="text-body-md text-on-surface">
            The safer answer is <strong>{LETTERS[rightIdx] ?? ''}</strong>: {right.text}
          </p>
        )}
        {q.explanation && <p className="text-body-md text-on-surface-variant">{q.explanation}</p>}
        {q.citation && <Citations citations={[q.citation]} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Quiz() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const quizRes = useResource(() => cloud.quiz(id), [id]);
  const modRes = useResource(() => cloud.module(id), [id]);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<QuizAttemptResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>();

  const reset = () => {
    setIdx(0);
    setAnswers({});
    setChecked({});
    setResult(null);
    setError(undefined);
  };
  useEffect(reset, [id]);

  const quiz = quizRes.data;
  const mod = modRes.data;
  const questions = quiz?.questions ?? [];
  const title = quiz?.title ?? mod?.title ?? 'Scenario quiz';
  const competencyId = mod?.competency_id ?? (id === 'MOD-TRENCH-EDGES' ? 'C07' : 'C04');
  const trench = /trench/i.test(`${id} ${title}`);

  const header = (
    <>
      <TrainingTabs />
      <PageTitle
        title="Scenario quiz"
        sub={questions.length ? `${title} · pass mark ${quiz?.pass_mark ?? Math.max(1, questions.length - 1)} of ${questions.length}` : title}
        right={
          <Link to={`/training/module/${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
            <Icon name="arrow_back" size={18} /> Back to module
          </Link>
        }
      />
    </>
  );

  if (quizRes.loading && !quiz) {
    return (
      <div className="space-y-8">
        {header}
        <Loading label="Loading quiz" />
      </div>
    );
  }
  if (!questions.length) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="quiz" title="No quiz published for this module yet">
          Your instructor has not published questions for this module.{' '}
          <Link to={`/training/module/${encodeURIComponent(id)}`} className="text-notice-dark underline">
            Back to the module
          </Link>
        </EmptyState>
      </div>
    );
  }

  const finish = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const payload = questions.filter((q) => answers[q.question_id]).map((q) => ({ question_id: q.question_id, option_id: answers[q.question_id] }));
      const r = await cloud.quizAttempt(id, DEMO_OPERATOR_ID, payload);
      const localScore = questions.filter((q) => q.correct_option_id && answers[q.question_id] === q.correct_option_id).length;
      setResult({
        ...r,
        score: Number.isFinite(r?.score) ? r.score : localScore,
        total: Number.isFinite(r?.total) ? r.total : questions.length,
        passed: typeof r?.passed === 'boolean' ? r.passed : localScore >= (quiz?.pass_mark ?? questions.length - 1),
      });
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------- end state
  if (result) {
    const perQ = new Map((result.results ?? []).map((r) => [r.question_id, r]));
    return (
      <div className="space-y-8">
        {header}
        <Panel className="mx-auto max-w-3xl space-y-6 p-8">
          <div className="flex flex-wrap items-center gap-4">
            <Icon name={result.passed ? 'emoji_events' : 'replay'} size={40} className={result.passed ? 'text-success-text' : 'text-warning-text'} />
            <div className="font-display text-headline-lg text-on-surface">
              <span className="tnum">
                {result.score}/{result.total}
              </span>{' '}
              — {result.passed ? 'passed' : 'not passed yet'}
            </div>
          </div>
          {result.passed ? (
            <p className="text-body-md text-on-surface-variant">
              Next: practise on the next shift. {result.next ?? `Your ${competencyLabel(competencyId).toLowerCase()} will be checked automatically over the next 3 shifts.`}
            </p>
          ) : (
            <p className="text-body-md text-on-surface-variant">Review the key points and try again. You need {quiz?.pass_mark ?? result.total - 1} of {result.total} to pass.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {result.passed ? (
              <>
                <Button variant="primary" icon="sports_esports" onClick={() => navigate(`/training/booking?topic=${encodeURIComponent(competencyId)}&format=simulator`)}>
                  Book simulator practice
                </Button>
                <Button variant="secondary" onClick={() => navigate('/training')}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" icon="replay" onClick={reset}>
                  Try again
                </Button>
                <Button variant="secondary" icon="menu_book" onClick={() => navigate(`/training/module/${encodeURIComponent(id)}`)}>
                  Review module
                </Button>
                <Button variant="ghost" onClick={() => navigate('/training')}>
                  Done
                </Button>
              </>
            )}
          </div>
          <p className="text-body-sm text-on-surface-muted">
            A quiz is a knowledge check. It never sets DEMONSTRATED for a safety-critical competency — an instructor verifies on the machine or simulator.{' '}
            <Link to="/training/effect" className="font-semibold text-notice-dark hover:underline">
              See whether the training helped
            </Link>
          </p>
          <Details label="Your answers" className="border-t border-outline pt-4">
            <ol className="space-y-3">
              {questions.map((q, i) => {
                const chosen = answers[q.question_id];
                const r = perQ.get(q.question_id);
                const ok = r ? r.correct : q.correct_option_id ? chosen === q.correct_option_id : null;
                return (
                  <li key={q.question_id} className="flex items-start gap-3">
                    <Icon
                      name={ok === null ? 'task_alt' : ok ? 'check_circle' : 'cancel'}
                      size={20}
                      className={cx('mt-0.5', ok === null ? 'text-notice-dark' : ok ? 'text-success-text' : 'text-danger-text')}
                      title={ok === null ? 'Recorded' : ok ? 'Correct' : 'Incorrect'}
                    />
                    <p className="text-body-sm text-on-surface-variant">
                      <span className="tnum font-semibold text-on-surface">{i + 1}.</span> {q.prompt}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Details>
          <SourceNote kinds={['RULE']} />
        </Panel>
      </div>
    );
  }

  // ---------------------------------------------------------------- question
  const q = questions[Math.min(idx, questions.length - 1)];
  const chosen = answers[q.question_id];
  const isChecked = !!checked[q.question_id];
  const last = idx >= questions.length - 1;

  return (
    <div className="space-y-8">
      {header}
      <Panel className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-8 pt-6">
          <span className="text-body-sm text-on-surface-muted">
            Question <span className="tnum font-semibold text-on-surface">{idx + 1}</span> of <span className="tnum">{questions.length}</span>
          </span>
          <div className="flex items-center gap-1.5" aria-label="Question status">
            {questions.map((qq, i) => {
              const c = checked[qq.question_id];
              const ok = c && qq.correct_option_id ? answers[qq.question_id] === qq.correct_option_id : null;
              return (
                <span
                  key={qq.question_id}
                  title={`Question ${i + 1}${c ? (ok === null ? ': recorded' : ok ? ': correct' : ': incorrect') : ''}`}
                  className={cx(
                    'h-2 w-6 rounded-full',
                    c && ok === true ? 'bg-success' : c && ok === false ? 'bg-danger' : c ? 'bg-notice' : i === idx ? 'bg-cat' : 'bg-surface-container-highest',
                  )}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-6 px-8 pb-8 pt-5">
          <div className="relative aspect-[13/6] w-full overflow-hidden rounded bg-surface-container-low">
            {trench ? <TrenchScene /> : <TruckLoadingScene showDistance={/4\s?m\b/.test(q.prompt)} />}
            <span className="absolute bottom-2 left-3 text-footnote text-on-surface-muted">Top-down sketch · not to scale</span>
          </div>
          <h2 className="font-display text-headline-sm text-on-surface">{q.prompt}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="radiogroup" aria-label="Answer options">
            {q.options.map((o, i) => (
              <OptionCard
                key={o.id}
                letter={LETTERS[i] ?? String(i + 1)}
                text={o.text}
                selected={chosen === o.id}
                locked={isChecked}
                isCorrect={isChecked && !!q.correct_option_id && o.id === q.correct_option_id}
                isWrong={isChecked && !!q.correct_option_id && chosen === o.id && o.id !== q.correct_option_id}
                onSelect={() => setAnswers((a) => ({ ...a, [q.question_id]: o.id }))}
              />
            ))}
          </div>
          {isChecked && chosen && <Feedback q={q} chosen={chosen} />}
          {error !== undefined && <ErrorNote error={error} />}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-6">
            <Button variant="ghost" icon="arrow_back" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              Previous
            </Button>
            {!isChecked ? (
              <Button variant="primary" icon="check" disabled={!chosen} onClick={() => setChecked((c) => ({ ...c, [q.question_id]: true }))}>
                Check answer
              </Button>
            ) : last ? (
              <Button variant="primary" icon="flag" disabled={submitting} onClick={finish}>
                {submitting ? 'Submitting…' : 'Finish quiz'}
              </Button>
            ) : (
              <Button variant="primary" iconRight="arrow_forward" onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}>
                Next question
              </Button>
            )}
          </div>
          <Details label="How this quiz works">
            <ul className="list-disc space-y-1.5 pl-5 text-body-sm text-on-surface-variant">
              <li>Pick one answer, then check it. Each answer shows why, with the SOP passage it comes from.</li>
              <li>Questions are everyday site scenarios, sketched top-down.</li>
              <li>A pass unlocks simulator practice. It never marks a safety-critical competency DEMONSTRATED.</li>
            </ul>
          </Details>
          <SourceNote kinds={['RULE']} />
        </div>
      </Panel>
    </div>
  );
}
