import { createStore, useStore } from './store';

/**
 * Tracks which endpoints are currently served from fixtures (src/mocks) and whether each
 * backend origin is reachable. Drives the global "MOCK DATA" indicator and connection chips.
 */
export type Origin = 'edge' | 'cloud';
export type OriginState = 'unknown' | 'online' | 'offline';

export interface MockEntry {
  endpoint: string;
  reason: string;
  since: number;
}

export interface MockStatus {
  mocked: Record<string, MockEntry>;
  origins: Record<Origin, OriginState>;
  forced: boolean;
}

const FORCE =
  import.meta.env.VITE_FORCE_MOCK === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1');

export const mockStatusStore = createStore<MockStatus>({
  mocked: {},
  origins: { edge: 'unknown', cloud: 'unknown' },
  forced: FORCE,
});

export function isForcedMock(): boolean {
  return mockStatusStore.get().forced;
}

export function setForcedMock(forced: boolean): void {
  mockStatusStore.set((s) => ({ ...s, forced }));
}

export function markMock(endpoint: string, reason: string): void {
  const cur = mockStatusStore.get().mocked[endpoint];
  if (cur && cur.reason === reason) return;
  mockStatusStore.set((s) => ({
    ...s,
    mocked: { ...s.mocked, [endpoint]: { endpoint, reason, since: Date.now() } },
  }));
}

export function markLive(endpoint: string): void {
  if (!mockStatusStore.get().mocked[endpoint]) return;
  mockStatusStore.set((s) => {
    const next = { ...s.mocked };
    delete next[endpoint];
    return { ...s, mocked: next };
  });
}

export function setOrigin(origin: Origin, state: OriginState): void {
  if (mockStatusStore.get().origins[origin] === state) return;
  mockStatusStore.set((s) => ({ ...s, origins: { ...s.origins, [origin]: state } }));
}

export function useMockStatus(): MockStatus {
  return useStore(mockStatusStore);
}

/** True when any endpoint used by the given prefix list is being mocked. */
export function useIsMocked(prefixes: string[]): boolean {
  const s = useMockStatus();
  return Object.keys(s.mocked).some((k) => prefixes.some((p) => k.includes(p)));
}
