import { useEffect } from 'react';

let ctx: AudioContext | null = null;

function beep(freq: number, ms: number): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* audio unavailable (autoplay policy before first interaction) */
  }
}

/** Audible tone for DANGER banners: a short two-tone beep once per second while active. */
export function useDangerTone(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const play = () => {
      beep(880, 160);
      setTimeout(() => beep(660, 160), 200);
    };
    play();
    const id = setInterval(play, 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** Single chime for WARNING banners that need acknowledgement. */
export function useWarningChime(key: string | null): void {
  useEffect(() => {
    if (key) beep(740, 220);
  }, [key]);
}
