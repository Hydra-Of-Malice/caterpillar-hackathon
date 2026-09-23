import { useEffect } from 'react';
import { edge } from './api';
import { createStore, useStore } from './store';
import type { ShiftCurrent } from './types';

interface ShiftState {
  data: ShiftCurrent | null;
  loading: boolean;
  error: Error | null;
  loadedAt: number;
}

const shiftStore = createStore<ShiftState>({ data: null, loading: false, error: null, loadedAt: 0 });
let inflight: Promise<void> | null = null;

export function reloadShift(): Promise<void> {
  if (inflight) return inflight;
  shiftStore.set((s) => ({ ...s, loading: true }));
  inflight = edge
    .shiftCurrent()
    .then((data) => shiftStore.set({ data, loading: false, error: null, loadedAt: Date.now() }))
    .catch((error: Error) => shiftStore.set((s) => ({ ...s, loading: false, error })))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/** Current shift (GET /shift/current), shared by all in-cab screens; one 30 s refresh timer app-wide. */
export function useShift(): ShiftState & { reload: () => Promise<void> } {
  const s = useStore(shiftStore);
  useEffect(() => {
    const cur = shiftStore.get();
    if (!cur.data && !cur.loading) void reloadShift();
    if (!refreshTimer) refreshTimer = setInterval(() => void reloadShift(), 30_000);
  }, []);
  return { ...s, reload: reloadShift };
}
