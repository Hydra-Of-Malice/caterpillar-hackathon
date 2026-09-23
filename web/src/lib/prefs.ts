import { createStore, useStore } from './store';

/**
 * Viewer preferences. `showSources` reveals the data-provenance layer (RULE / ML / SIMULATED /
 * MOCK chips, LIVE vs fixture chips, per-panel source notes). Off by default to keep screens clean;
 * toggled from the SIMULATED ribbon, the More menu or the demo panel (key "D").
 */
const KEY = 'sentinel.showSources';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const sourcesStore = createStore<boolean>(load());

export function setShowSources(on: boolean): void {
  sourcesStore.set(on);
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function useShowSources(): boolean {
  return useStore(sourcesStore);
}
