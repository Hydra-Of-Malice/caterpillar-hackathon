import type { SignalWord, Tier } from '../lib/types';
import { SIGNAL_WORD } from '../lib/types';
import { cx } from './ui';

/**
 * Signal-word system: every alert carries a signal word, a distinct icon SHAPE, a colour and text
 * (never colour alone). DANGER = octagon, WARNING = triangle, CAUTION = rounded square,
 * NOTICE = "i" circle, SUPERVISOR NOTIFIED = person with arrow.
 */
export const SIGNAL_STYLE: Record<SignalWord, { bg: string; text: string; ring: string; ink: string }> = {
  DANGER: { bg: 'bg-danger', text: 'text-white', ring: 'border-danger', ink: '#FFFFFF' },
  WARNING: { bg: 'bg-warning', text: 'text-black', ring: 'border-warning', ink: '#000000' },
  CAUTION: { bg: 'bg-caution', text: 'text-black', ring: 'border-caution', ink: '#000000' },
  NOTICE: { bg: 'bg-notice', text: 'text-white', ring: 'border-notice-dark', ink: '#FFFFFF' },
  'SUPERVISOR NOTIFIED': { bg: 'bg-escalation', text: 'text-white', ring: 'border-escalation', ink: '#FFFFFF' },
};

export function normaliseSignalWord(w: string | null | undefined, tier?: Tier): SignalWord {
  const u = (w ?? '').toUpperCase();
  if (u in SIGNAL_STYLE) return u as SignalWord;
  return tier ? SIGNAL_WORD[tier] : 'NOTICE';
}

/** Shape icon for a signal word. `ink` is the glyph colour; the shape inherits the chip colour. */
export function SignalIcon({ word, size = 20, ink, fill }: { word: SignalWord; size?: number; ink?: string; fill?: string }) {
  const c = ink ?? SIGNAL_STYLE[word].ink;
  const f = fill ?? 'none';
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (word) {
    case 'DANGER':
      return (
        <svg {...common}>
          <polygon points="7.5,1.5 16.5,1.5 22.5,7.5 22.5,16.5 16.5,22.5 7.5,22.5 1.5,16.5 1.5,7.5" fill={fill ?? '#C52320'} stroke={c} strokeWidth="2" />
          <rect x="10.8" y="6" width="2.4" height="8.5" fill={c} />
          <rect x="10.8" y="16.3" width="2.4" height="2.4" fill={c} />
        </svg>
      );
    case 'WARNING':
      return (
        <svg {...common}>
          <polygon points="12,2 23,21.5 1,21.5" fill={f} stroke={c} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="10.9" y="8.5" width="2.2" height="7" fill={c} />
          <rect x="10.9" y="17" width="2.2" height="2.2" fill={c} />
        </svg>
      );
    case 'CAUTION':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="5" fill={f} stroke={c} strokeWidth="2.2" />
          <rect x="10.9" y="6" width="2.2" height="8" fill={c} />
          <rect x="10.9" y="15.8" width="2.2" height="2.2" fill={c} />
        </svg>
      );
    case 'NOTICE':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={f} stroke={c} strokeWidth="2.2" />
          <rect x="10.9" y="10" width="2.2" height="8" fill={c} />
          <rect x="10.9" y="6" width="2.2" height="2.2" fill={c} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="9" cy="7" r="3.5" fill="none" stroke={c} strokeWidth="2" />
          <path d="M2.5 21c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5" fill="none" stroke={c} strokeWidth="2" />
          <path d="M15 9h6.5M18.5 6l3 3-3 3" fill="none" stroke={c} strokeWidth="2" strokeLinecap="square" />
        </svg>
      );
  }
}

export function SignalWordChip({ word, tier, size = 'md', className }: { word?: string | null; tier?: Tier; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const w = normaliseSignalWord(word, tier);
  const s = SIGNAL_STYLE[w];
  const dims = size === 'lg' ? 'h-9 px-3 text-label-lg gap-2' : size === 'sm' ? 'h-5 px-1.5 text-[11px] gap-1' : 'h-7 px-2 text-label-md gap-1.5';
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded font-display font-bold uppercase leading-none tracking-[0.04em]', s.bg, s.text, dims, className)}>
      <SignalIcon word={w} size={size === 'lg' ? 22 : size === 'sm' ? 13 : 17} fill={w === 'DANGER' ? '#C52320' : undefined} />
      {w}
    </span>
  );
}
