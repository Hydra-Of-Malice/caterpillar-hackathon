/**
 * Small helpers for the operator screens. Types and the API client come from the shared Task
 * Centre modules (`../../types`, `../../api`); only operator-specific logic lives here.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TcApiError, errorText, opApi } from '../../api';
import type { Checkpoint, ChecklistFailedCritical, GeofenceStatus, StartConflict, TaskChecklistSummary, TcTask } from '../../types';

// ---------------------------------------------------------------- tasks
export interface Progress {
  done: number;
  total: number;
}

/** Checkpoint progress for a task ("2/3"). Counted checkpoints count once they reach their target. */
export function taskProgress(task: Pick<TcTask, 'checkpoints'>): Progress {
  const cps = task.checkpoints ?? [];
  return { done: cps.filter((c) => c.done >= c.target).length, total: cps.length };
}

/** Required checkpoints that are not finished — what blocks Finish Task. */
export function unmetRequired(checkpoints: Checkpoint[] | undefined): Checkpoint[] {
  return (checkpoints ?? []).filter((c) => c.required && c.done < c.target);
}

/** Ongoing first, then what is still to do, then what is already closed; earliest finish first. */
export function sortTasks(tasks: TcTask[]): TcTask[] {
  const rank: Record<string, number> = { ongoing: 0, pending: 1, completed: 2, cancelled: 3 };
  return [...tasks].sort(
    (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.expected_finish_ts - b.expected_finish_ts,
  );
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'To do',
  ongoing: 'In progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

export function statusChip(status: string): { icon: string; tone: 'yellow' | 'green' | 'neutral' } {
  if (status === 'ongoing') return { icon: 'play_circle', tone: 'yellow' };
  if (status === 'completed') return { icon: 'check_circle', tone: 'green' };
  return { icon: 'schedule', tone: 'neutral' };
}

// ---------------------------------------------------------------- errors
/** HTTP status of a failed call; `undefined` when it was not an API error. */
export function errStatus(e: unknown): number | undefined {
  return e instanceof TcApiError ? e.status : undefined;
}

// ---------------------------------------------------------------- pre-start checklist
/** Where the pre-start inspection for a task lives. */
export const checklistPath = (taskId: string): string => `/tc/op/task/${encodeURIComponent(taskId)}/checklist`;

export const CHECKLIST_TITLE = 'Pre-start check';

/**
 * The structured `detail` of a rejected call. The API client stringifies a non-string `detail`, so
 * parse it back; plain text simply yields `null` and the server's own words are used instead.
 */
function conflictBody(e: unknown): Record<string, unknown> | null {
  if (!(e instanceof TcApiError)) return null;
  try {
    const parsed: unknown = JSON.parse(e.detail);
    if (!parsed || typeof parsed !== 'object') return null;
    const outer = parsed as Record<string, unknown>;
    const inner = outer.detail;
    return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : outer;
  } catch {
    return null;
  }
}

/** The 409 codes from `POST /op/tasks/{id}/start` that the pre-start check answers. */
const CHECKLIST_CONFLICTS = new Set(['checklist_incomplete', 'checklist_critical_failed']);

/**
 * Read a `409` from `POST /op/tasks/{id}/start` that the pre-start check can resolve.
 *
 * Returns `null` for every other failure — including 409s about the task itself
 * (`task_completed`, `another_task_ongoing`), which are shown where the operator is rather than
 * sending them into a checklist that would not help.
 */
export function startConflict(e: unknown): StartConflict | null {
  if (errStatus(e) !== 409) return null;
  const body = conflictBody(e);
  const code = typeof body?.error === 'string' ? body.error : null;
  if (!code || !CHECKLIST_CONFLICTS.has(code)) return null;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    error: code,
    message: errorText(e),
    missing: Array.isArray(body?.missing) ? (body.missing as unknown[]).filter((m): m is string => typeof m === 'string') : undefined,
    answered: num(body?.answered),
    total: num(body?.total),
    failed_critical: Array.isArray(body?.failed_critical) ? (body.failed_critical as ChecklistFailedCritical[]) : undefined,
    ticket_id: typeof body?.ticket_id === 'string' ? body.ticket_id : null,
  };
}

/** Plain words for the start failures that are not about the checklist; the raw detail otherwise. */
const START_ERROR_TEXT: Record<string, string> = {
  task_completed: 'This task is already finished, so it cannot be started again.',
  another_task_ongoing: 'Another task is already running. Finish that one before you start this one.',
  task_cancelled: 'This task was cancelled, so it cannot be started.',
};

export function startErrorText(e: unknown): string {
  const code = conflictBody(e)?.error;
  return (typeof code === 'string' && START_ERROR_TEXT[code]) || errorText(e);
}

/** How a task card / detail header should label the pre-start check. Icon **and** words, never colour alone. */
export function checklistChip(c: TaskChecklistSummary | null | undefined): { icon: string; tone: 'neutral' | 'green' | 'red' | 'yellow'; text: string } {
  if (!c) return { icon: 'fact_check', tone: 'neutral', text: `${CHECKLIST_TITLE} required` };
  if (c.blocked || c.failed_critical_count > 0) {
    return { icon: 'block', tone: 'red', text: `${CHECKLIST_TITLE}: ${c.failed_critical_count || 1} critical item failed` };
  }
  if (c.completed) return { icon: 'verified', tone: 'green', text: `${CHECKLIST_TITLE} complete` };
  if (c.total <= 0) return { icon: 'fact_check', tone: 'yellow', text: `${CHECKLIST_TITLE} required` };
  return { icon: 'fact_check', tone: 'yellow', text: `${CHECKLIST_TITLE}: ${c.answered}/${c.total}` };
}

/**
 * The Start task branch, shared by Today and the task detail.
 *
 * - checklist not complete → open the pre-start inspection; the task is **not** started.
 * - checklist complete → call the API. A `409` still means it did not start, so the operator is
 *   sent back to the checklist with the server's reason rather than shown a started task.
 */
export function useTaskStart(onStarted?: (task: TcTask) => void): {
  busy: boolean;
  error: string | null;
  start: (task: TcTask) => Promise<void>;
  clearError: () => void;
} {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (task: TcTask) => {
      const id = task.task_id;
      setError(null);
      if (!task.checklist?.completed) {
        nav(checklistPath(id));
        return;
      }
      setBusy(true);
      try {
        const updated = await opApi.startTask(id);
        onStarted?.(updated);
      } catch (e) {
        const conflict = startConflict(e);
        if (conflict) nav(checklistPath(id), { state: { conflict } });
        else setError(startErrorText(e));
      } finally {
        setBusy(false);
      }
    },
    [nav, onStarted],
  );

  return { busy, error, start, clearError: useCallback(() => setError(null), []) };
}

// ---------------------------------------------------------------- wording
/** Plain-language reading of a recorded geofence result — never dressed up as proof. */
export const GEOFENCE_TEXT: Record<GeofenceStatus, string> = {
  inside: 'Your position was inside the worksite boundary.',
  outside: 'Your position was outside the worksite boundary.',
  unverified: 'Your position could not be verified. Location shows presence, it is never proof.',
};

/** Shown when the browser gave no fix: the punch still goes in, with no coordinates invented. */
export const NO_FIX_NOTE =
  'Your device did not share a position — permission refused, no signal, or it took too long. The punch was still sent, with no coordinates.';
