/**
 * CAT Sentinel design tokens — ported from the Google Stitch export
 * (design/stitch/cat_sentinel_safety_first_operator_copilot/DESIGN.md) and docs/ui-theme.md.
 * Fixes vs the export: Roboto Condensed replaces Barlow Condensed, Noto Sans for body,
 * yellow is only brand/primary, #AAAAAA is the darkest text allowed on dark panels.
 * @type {import('tailwindcss').Config}
 */
/** Themed colour: rgb channels in a CSS variable, so opacity modifiers (bg-x/10) keep working. */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand
        cat: {
          DEFAULT: '#FFCD11',
          text: v('--cat-text'),
          hover: '#FFE672',
          border: '#B18D00',
          subtle: '#FFF1B6',
          ink: '#6C5600',
          active: '#F6B800',
        },
        // themed surfaces: CSS variables (dark = in-cab night, .theme-light = office / cab day)
        surface: {
          DEFAULT: v('--surface'),
          dim: v('--surface'),
          bright: v('--surface-high'),
          'container-lowest': v('--surface-lowest'),
          'container-low': v('--surface-low'),
          container: v('--surface-container'),
          'container-high': v('--surface-high'),
          'container-highest': v('--surface-highest'),
        },
        'on-surface': {
          DEFAULT: v('--on-surface'),
          variant: v('--on-surface-variant'),
          muted: v('--on-surface-muted'),
        },
        outline: {
          DEFAULT: v('--outline'),
          variant: v('--outline-variant'),
          strong: v('--outline-strong'),
        },
        // signal words (fills fixed; *-text variants are themed for contrast)
        danger: { DEFAULT: '#C52320', hover: '#DE2222', text: v('--danger-text') },
        warning: { DEFAULT: '#E56C00', text: v('--warning-text') },
        caution: { DEFAULT: '#F3C206', text: v('--caution-text') },
        notice: { DEFAULT: '#0067B8', dark: v('--notice-text') },
        escalation: { DEFAULT: '#8F24D1', text: v('--escalation-text') },
        success: { DEFAULT: '#197527', text: v('--success-text') },
        // provenance
        prov: {
          rule: '#FFFFFF',
          ml: '#1AC69E',
          sim: '#6852BE',
          'sim-text': v('--sim-text'),
          mock: '#909090',
        },
        // data-viz series (Cat data-* tokens)
        series: {
          blue: '#0066FF',
          'blue-light': v('--gain-text'),
          green: '#1AC69E',
          orange: '#FB5A00',
          purple: '#6852BE',
          'purple-light': '#9E90D5',
        },
        // competency states
        comp: {
          unassessed: '#909090',
          gap: '#E56C00',
          training: v('--comp-training'),
          improving: v('--comp-improving'),
          demonstrated: v('--comp-demonstrated'),
        },
      },
      fontFamily: {
        display: ['"Roboto Condensed"', '"Arial Narrow"', 'sans-serif'],
        body: ['"Noto Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['80px', { lineHeight: '80px', letterSpacing: '0.01em', fontWeight: '700' }],
        display: ['48px', { lineHeight: '56px', letterSpacing: '0.01em', fontWeight: '700' }],
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '0.02em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '0.01em', fontWeight: '700' }],
        'headline-sm': ['20px', { lineHeight: '28px', letterSpacing: '0.01em', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '26px' }],
        'body-md': ['16px', { lineHeight: '24px' }],
        'body-sm': ['14px', { lineHeight: '20px' }],
        'label-lg': ['18px', { lineHeight: '22px', letterSpacing: '0.05em', fontWeight: '700' }],
        'label-md': ['15px', { lineHeight: '18px', letterSpacing: '0.06em', fontWeight: '700' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '700' }],
        footnote: ['12px', { lineHeight: '16px' }],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '8px',
        full: '9999px',
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2rem',
        gutter: '1rem',
        'gutter-sm': '0.75rem',
        'gutter-lg': '1.5rem',
        margin: '1.5rem',
        'margin-cab': '1rem',
        rail: '72px',
        nav: '96px',
        bar: '80px',
        touch: '64px',
      },
      maxWidth: { content: '75rem' },
      transitionDuration: { quick: '150ms', long: '400ms' },
      keyframes: {
        'pulse-1hz': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.72' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'pulse-1hz': 'pulse-1hz 1s ease-in-out infinite',
        'slide-in': 'slide-in 150ms ease',
        'fade-up': 'fade-up 150ms ease',
      },
    },
  },
  plugins: [],
};
