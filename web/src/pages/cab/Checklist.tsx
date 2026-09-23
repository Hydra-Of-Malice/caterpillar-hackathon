import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChecklistRow } from '../../components/ChecklistRow';
import { ProvenanceBadge } from '../../components/ProvenanceBadge';
import { Button, Icon, Loading, cx } from '../../components/ui';
import { ApiError, edge } from '../../lib/api';
import { fmtClock } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { liveNow, useLive } from '../../lib/live';
import { reloadShift, useShift } from '../../lib/shift';
import type { ChecklistResultValue, ChecklistSubmitResponse } from '../../lib/types';

interface Answer {
  result: ChecklistResultValue | null;
  note: string;
}

/** Screen 3 — Pre-shift checklist with live safety-signal chips and the 409 start gate. */
export default function Checklist() {
  const nav = useNavigate();
  const live = useLive();
  const { data: shift } = useShift();
  const { data: items, loading } = useResource(() => edge.checklistItems(), []);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [result, setResult] = useState<{ submit: ChecklistSubmitResponse; startError: string | null; ts: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const groups = useMemo(() => {
    const g: Array<{ name: string; items: NonNullable<typeof items> }> = [];
    (items ?? []).forEach((it) => {
      const found = g.find((x) => x.name === it.group);
      if (found) found.items.push(it);
      else g.push({ name: it.group, items: [it] });
    });
    return g;
  }, [items]);

  const total = items?.length ?? 0;
  const answered = (items ?? []).filter((i) => answers[i.id]?.result).length;
  const failed = (items ?? []).filter((i) => answers[i.id]?.result === 'fail');
  const set = (id: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [id]: { result: a[id]?.result ?? null, note: a[id]?.note ?? '', ...patch } }));

  const liveChip = (signal?: string | null) => {
    if (!signal) return undefined;
    if (signal === 'seatbelt') {
      const ok = live.snapshot?.seatbelt ?? true;
      return (
        <span className="flex items-center gap-2">
          <span className={cx('flex h-9 items-center gap-1.5 border px-2 font-display text-label-md uppercase', ok ? 'border-success text-success-text' : 'border-danger bg-danger text-white')}>
            <span className={cx('h-2 w-2 rounded-full', ok ? 'bg-success-text' : 'bg-white')} /> {ok ? 'Fastened' : 'Unfastened'}
          </span>
          <ProvenanceBadge kind="RULE" />
        </span>
      );
    }
    if (signal === 'proximity') {
      const fitted = live.snapshot?.proximity.fitted ?? true;
      const fault = live.snapshot?.proximity.status === 'fault';
      return (
        <span className={cx('flex h-9 items-center gap-1.5 border px-2 font-display text-label-md uppercase', fault ? 'border-danger text-danger-text' : fitted ? 'border-success text-success-text' : 'border-outline-strong text-on-surface-muted')}>
          <Icon name="radar" size={18} /> {fault ? 'Fault' : fitted ? 'Active · 4 sectors' : 'Not fitted'}
        </span>
      );
    }
    const ok = live.protection.state === 'active';
    return (
      <span className="flex items-center gap-2">
        <span className={cx('flex h-9 items-center gap-1.5 border px-2 font-display text-label-md uppercase', ok ? 'border-success text-success-text' : 'border-danger text-danger-text')}>
          <Icon name={ok ? 'verified_user' : 'gpp_bad'} size={18} /> {ok ? 'Passed' : 'Not passed'}
        </span>
        <ProvenanceBadge kind="RULE" />
      </span>
    );
  };

  const signOff = async () => {
    if (!items) return;
    setBusy(true);
    const shiftId = shift?.shift.shift_id ?? 'current';
    try {
      const submit = await edge.submitChecklist(
        shiftId,
        items.map((i) => ({ item_id: i.id, result: answers[i.id]?.result ?? 'na', note: answers[i.id]?.note ?? '' })),
      );
      let startError: string | null = null;
      try {
        await edge.startShift(shiftId);
      } catch (e) {
        startError = e instanceof ApiError ? `${e.status === 409 ? 'Shift start blocked (409)' : `Error ${e.status}`}: ${e.detail}` : (e as Error).message;
      }
      setResult({ submit, startError, ts: liveNow() });
      void reloadShift();
    } catch (e) {
      setResult({ submit: { passed: false, failed_critical: [], incident_ids: [] }, startError: (e as Error).message, ts: liveNow() });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !items) return <Loading label="Loading checklist" />;

  const done = result && !result.startError && result.submit.passed;
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 space-y-2 overflow-y-auto bg-surface-container-low p-4">
        <div className="px-1 pb-2 font-display text-headline-sm">Pre-shift check</div>
        {groups.map((g, i) => {
          const n = g.items.filter((it) => answers[it.id]?.result).length;
          const f = g.items.filter((it) => answers[it.id]?.result === 'fail').length;
          const complete = n === g.items.length;
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => {
                setActiveGroup(g.name);
                refs.current[g.name]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={cx('flex min-h-[72px] w-full items-center gap-3 border px-3 text-left', activeGroup === g.name ? 'border-cat bg-surface-container-high' : 'border-outline bg-surface-container')}
            >
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center font-display text-headline-sm', complete ? (f ? 'bg-danger text-white' : 'bg-success text-white') : 'bg-surface-container-highest')}>
                {complete ? <Icon name={f ? 'close' : 'check'} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-label-lg uppercase">{g.name}</span>
                <span className="block text-body-sm text-on-surface-muted">
                  {n} of {g.items.length} checked{f ? ` · ${f} fail` : ''}
                </span>
              </span>
            </button>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          block
          icon="done_all"
          title="Demo helper — a real check needs each item confirmed"
          onClick={() => (items ?? []).forEach((i) => !answers[i.id]?.result && set(i.id, { result: 'pass' }))}
        >
          Mark remaining pass
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {result && (
          <div className={cx('flex items-center gap-4 border-b px-6 py-4', done ? 'border-success bg-success/15' : 'border-danger bg-danger/15')}>
            <Icon name={done ? 'check_circle' : 'block'} size={40} className={done ? 'text-success-text' : 'text-danger-text'} fill />
            <div className="flex-1">
              <div className="font-display text-headline-md uppercase">
                {done ? `Check complete · ${fmtClock(result.ts)} · signed ${shift?.operator.name.split(' ')[0] ?? 'Ravi'} K.` : 'Shift cannot start yet'}
              </div>
              <div className="text-body-md text-on-surface-variant">
                {done
                  ? `${answered - failed.length}/${total} passed${failed.length ? ` · ${failed.length} defect(s) sent to maintenance` : ''}. Protection self-test recorded.`
                  : `${result.startError ?? 'A critical item failed.'}${result.submit.failed_critical.length ? ` · Critical: ${result.submit.failed_critical.join(', ')}` : ''}${result.submit.incident_ids.length ? ` · Incident ${result.submit.incident_ids.join(', ')} created, supervisor notified` : ''}`}
              </div>
            </div>
            {done ? (
              <Button variant="primary" size="cab" icon="arrow_forward" onClick={() => nav('/cab/home')}>
                Go to home
              </Button>
            ) : (
              <Button variant="secondary" size="cab" icon="radio">
                Call supervisor
              </Button>
            )}
          </div>
        )}
        <div className="flex-1 space-y-8 overflow-y-auto p-6">
          {groups.map((g, gi) => (
            <section key={g.name} ref={(el) => (refs.current[g.name] = el)} className="space-y-2">
              <h2 className="pt-2 font-display text-headline-md">
                {gi + 1}. {g.name.charAt(0) + g.name.slice(1).toLowerCase()}
              </h2>
              {g.items.map((it) => (
                <ChecklistRow
                  key={it.id}
                  item={it}
                  value={answers[it.id]?.result ?? null}
                  note={answers[it.id]?.note ?? ''}
                  onChange={(v) => set(it.id, { result: v })}
                  onNote={(n) => set(it.id, { note: n })}
                  liveValue={liveChip(it.live_signal)}
                />
              ))}
            </section>
          ))}
        </div>
        <div className="flex items-center gap-6 border-t border-outline bg-surface-container px-6 py-3">
          <div>
            <div className="font-display text-label-sm uppercase text-on-surface-muted">Checklist progress</div>
            <div className="font-display text-headline-lg tnum">
              {answered} / {total} completed
            </div>
          </div>
          {failed.length > 0 && (
            <div className="font-display text-label-md uppercase text-danger-text">
              {failed.length} defect{failed.length > 1 ? 's' : ''} flagged{failed.some((f) => f.critical) ? ' · critical item — shift start will be blocked' : ''}
            </div>
          )}
          <span className="flex-1" />
          <Button variant="primary" size="cab" icon="task_alt" disabled={answered < total || busy} onClick={signOff}>
            Sign off check
          </Button>
        </div>
      </div>
    </div>
  );
}
