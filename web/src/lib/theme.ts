import { useEffect } from 'react';
import { createStore, useStore } from './store';

/** In-cab Day / Night mode (persisted). Office pages always use the Caterpillar light theme. */
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

/** Apply the light theme to <html> (so modals, toasts and the demo panel follow it too). */
export function useLightTheme(light: boolean): void {
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', light);
  }, [light]);
}
