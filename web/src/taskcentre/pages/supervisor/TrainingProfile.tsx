/**
 * One operator's training profile, shown inside the supervisor's operator page
 * (`/tc/sup/operator/:id`).
 *
 * Overall completion, a per-category breakdown, and every training item with the status the API
 * reports: not started, in progress with its percent, or completed with the date it finished.
 * A not-started item can be assigned from here.
 *
 * The modules are DEMO content written for this prototype. Every item carries that label and the
 * screen says so in words — nothing here is official Caterpillar training material, and none of it
 * replaces a site safety induction.
 */
import { useState } from 'react';
import { sup } from '../../api';
import { LocalTime, TcError } from '../../components';
import { POLL } from '../../constants';
import type { TrainingItem, TrainingStatus } from '../../types';
import { Button } from '../../../components/ui';
import { fmtDur, titleCase } from '../../../lib/format';
import { useResource } from '../../../lib/hooks';
import { Bar, Card, Caveat, Chip, EmptyState, Icon, cx, gate } from './common';

/** Icon + words for every status, so the state never depends on colour alone. */
const STATUS: Record<TrainingStatus, { label: string; icon: string; tone: 'green' | 'blue' | 'neutral' }> = {
  completed: { label: 'Completed', icon: 'check_circle', tone: 'green' },
  in_progress: { label: 'In progress', icon: 'hourglass_top', tone: 'blue' },
  not_started: { label: 'Not started', icon: 'radio_button_unchecked', tone: 'neutral' },
};

const DEMO_LABEL = 'DEMO placeholder — not official Caterpillar material';

/** 0-100, never NaN and never off the end of the bar. */
export function clampPct(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

export default function TrainingProfile({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  const r = useResource(() => sup.training(operatorId), [operatorId], POLL.supervisor);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<unknown>();
  const [justAssigned, setJustAssigned] = useState<string[]>([]);

  const items = r.data?.items ?? [];
  const summary = r.data?.summary ?? {};

  const total = summary.total ?? items.length;
  const completed = summary.completed ?? items.filter((i) => i.status === 'completed').length;
  const inProgress = summary.in_progress ?? items.filter((i) => i.status === 'in_progress').length;
  const notStarted = summary.not_started ?? items.filter((i) => i.status === 'not_started').length;
  const overall = clampPct(summary.percent_complete ?? (total > 0 ? (completed / total) * 100 : 0));

  /** Prefer the server's breakdown; fall back to counting the items it sent. */
  const categories = (() => {
    const from = r.data?.by_category;
    if (from && Object.keys(from).length > 0) {
      return Object.entries(from)
        .map(([cat, s]) => ({ cat, total: s.total ?? 0, completed: s.completed ?? 0 }))
        .sort((a, b) => a.cat.localeCompare(b.cat));
    }
    const map = new Map<string, { total: number; completed: number }>();
    for (const i of items) {
      const row = map.get(i.category) ?? { total: 0, completed: 0 };
      row.total += 1;
      if (i.status === 'completed') row.completed += 1;
      map.set(i.category, row);
    }
    return [...map.entries()].map(([cat, s]) => ({ cat, total: s.total, completed: s.completed })).sort((a, b) => a.cat.localeCompare(b.cat));
  })();

  const ordered = [...items].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const assign = async (item: TrainingItem) => {
    setBusy(item.video_id);
    setAssignError(undefined);
    try {
      await sup.assignTraining(operatorId, item.video_id);
      setJustAssigned((s) => (s.includes(item.video_id) ? s : [...s, item.video_id]));
      r.reload();
    } catch (e) {
      setAssignError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Training profile"
      sub={`What ${operatorName} has watched, and what is still open. Dates are shown in your own timezone.`}
      right={
        summary.last_activity_ts ? (
          <span className="text-body-sm text-on-surface-muted">
            Last activity <LocalTime ts={summary.last_activity_ts} gmt={summary.last_activity_ts_gmt} mode="smart" />
          </span>
        ) : undefined
      }
    >
      {gate(r, 'The training profile', 'Loading training profile') ?? (
        <>
          <div className="border border-outline bg-surface-container-low p-3">
            <p className="flex items-start gap-2 text-body-sm text-on-surface-variant">
              <Icon name="science" size={18} className="mt-0.5" />
              <span>
                Demo training content. These modules were written for this prototype — they are not official Caterpillar training material and they do
                not replace the site safety induction.
              </span>
            </p>
          </div>

          {items.length === 0 ? (
            <EmptyState icon="school" title="No training items for this operator">
              The API returned no training modules, so none are shown. Nothing is filled in on their behalf.
            </EmptyState>
          ) : (
            <>
              {/* ------------------------------------------------ overall */}
              <div className="mt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-display text-label-sm uppercase text-on-surface-muted">Overall completion</span>
                  <span className="text-body-md text-on-surface tnum">
                    {Math.round(overall)}% · {completed} of {total} completed
                  </span>
                </div>
                <Bar className="mt-2" pct={overall} tone={total > 0 && completed >= total ? 'green' : 'blue'} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip tone="green" icon={STATUS.completed.icon}>
                    {completed} completed
                  </Chip>
                  <Chip tone="blue" icon={STATUS.in_progress.icon}>
                    {inProgress} in progress
                  </Chip>
                  <Chip tone="neutral" icon={STATUS.not_started.icon}>
                    {notStarted} not started
                  </Chip>
                  {typeof summary.minutes_completed === 'number' && <Chip icon="schedule">{fmtDur(summary.minutes_completed)} watched</Chip>}
                </div>
              </div>

              {/* ------------------------------------------------ by category */}
              {categories.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-display text-label-sm uppercase text-on-surface-muted">By category</h3>
                  <ul className="mt-2 space-y-3">
                    {categories.map((c) => (
                      <li key={c.cat}>
                        <div className="flex items-baseline justify-between gap-3 text-body-sm">
                          <span className="text-on-surface">{titleCase(c.cat)}</span>
                          <span className="text-on-surface-variant tnum">
                            {c.completed}/{c.total}
                          </span>
                        </div>
                        <Bar
                          className="mt-1.5"
                          pct={c.total > 0 ? (c.completed / c.total) * 100 : 0}
                          tone={c.total > 0 && c.completed >= c.total ? 'green' : 'neutral'}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ------------------------------------------------ every item */}
              {assignError !== undefined && <TcError className="mt-5" error={assignError} what="The assignment" />}

              <ul className="mt-6 divide-y divide-outline">
                {ordered.map((item) => (
                  <TrainingRow
                    key={item.video_id}
                    item={item}
                    busy={busy === item.video_id}
                    justAssigned={justAssigned.includes(item.video_id)}
                    onAssign={() => void assign(item)}
                  />
                ))}
              </ul>
            </>
          )}

          <Caveat className="mt-5" icon="info">
            Progress comes from the training records the API holds for this operator. A module with no record is shown as not started, never as
            partially done.
          </Caveat>
        </>
      )}
    </Card>
  );
}

function TrainingRow({ item, busy, justAssigned, onAssign }: { item: TrainingItem; busy: boolean; justAssigned: boolean; onAssign: () => void }) {
  const s = STATUS[item.status] ?? STATUS.not_started;
  const pct = clampPct(item.percent);
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon name={s.icon} size={20} className={cx(item.status === 'completed' ? 'text-success-text' : 'text-on-surface-muted')} />
            <span className="font-display text-body-lg text-on-surface">{item.title}</span>
            <Chip tone={s.tone} icon={s.icon}>
              {s.label}
            </Chip>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
            <Chip icon="folder">{titleCase(item.category)}</Chip>
            <Chip icon="schedule">{fmtDur(item.duration_min)}</Chip>
            <Chip tone="purple" icon="science">
              Demo
            </Chip>
          </div>
          <p className="mt-1 text-body-sm text-on-surface-muted">{item.label || DEMO_LABEL}</p>
        </div>

        <div className="shrink-0 text-right">
          {item.status === 'completed' ? (
            <span className="text-body-sm text-on-surface-variant">
              Completed <LocalTime ts={item.completed_at} gmt={item.completed_at_gmt} mode="datetime" missing="date not recorded" />
            </span>
          ) : item.status === 'in_progress' ? (
            <div className="min-w-[160px]">
              <span className="text-body-sm text-on-surface-variant tnum">{Math.round(pct)}% watched</span>
              <Bar className="mt-1.5" pct={pct} tone="blue" />
              {item.started_at ? (
                <span className="mt-1 block text-body-sm text-on-surface-muted">
                  Started <LocalTime ts={item.started_at} gmt={item.started_at_gmt} mode="datetime" />
                </span>
              ) : null}
            </div>
          ) : justAssigned ? (
            <span className="inline-flex items-center gap-1 text-body-sm text-success-text">
              <Icon name="check" size={18} /> Assigned
            </span>
          ) : (
            <Button size="sm" icon="assignment_add" onClick={onAssign} disabled={busy}>
              {busy ? 'Assigning…' : 'Assign'}
            </Button>
          )}
        </div>
      </div>

      {(item.assigned_by || item.assigned_at) && (
        <p className="mt-1.5 text-body-sm text-on-surface-muted">
          Assigned{item.assigned_by ? ` by ${item.assigned_by}` : ''}
          {item.assigned_at ? (
            <>
              {' · '}
              <LocalTime ts={item.assigned_at} gmt={item.assigned_at_gmt} mode="datetime" />
            </>
          ) : null}
        </p>
      )}
    </li>
  );
}
