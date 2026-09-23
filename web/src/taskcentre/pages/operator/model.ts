/**
 * Small helpers for the operator screens. Types and the API client come from the shared Task
 * Centre modules (`../../types`, `../../api`); only operator-specific logic lives here.
 */
import { TcApiError } from '../../api';
import type { Checkpoint, GeofenceStatus, TcTask } from '../../types';

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
