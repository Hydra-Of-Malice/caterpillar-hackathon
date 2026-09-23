import { useEffect } from 'react';
import { createStore, useStore } from './store';

/** In-cab Day / Night mode (persisted). Everything else runs the dark theme. */
const KEY = 'sentinel.cabDay';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const cabDayStore = createStore<boolean>(load());

export function setCabDay(day: boolean): void {
  cabDayStore.set(day);
  try {
    localStorage.setItem(KEY, day ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

export function useCabDay(): boolean {
  return useStore(cabDayStore);
}

/**
 * Apply the light theme to <html> (so modals, toasts and the demo panel follow it too).
 *
 * Only the in-cab DAY mode passes `true`: sunlight through a cab window defeats a dark screen, so
 * that one stays an operator choice. Every other surface passes `false` and uses the dark theme.
 */
export function useLightTheme(light: boolean): void {
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', light);
  }, [light]);
}
