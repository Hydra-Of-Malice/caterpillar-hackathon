/** Shared Recharts styling for the office operations pages (incidents, tasks, anomaly, crew). Theme-aware via CSS vars. */
export const GRID = { stroke: 'var(--chart-grid)' } as const;

export const AXIS = {
  stroke: 'var(--chart-axis)',
  tick: { fill: 'var(--chart-tick)', fontSize: 12 },
} as const;

export const TOOLTIP = {
  contentStyle: { background: 'var(--chart-tip-bg)', border: '1px solid var(--chart-tip-border)', fontSize: 12, borderRadius: 4 },
  labelStyle: { color: 'var(--svg-text)', fontFamily: '"Roboto Condensed", sans-serif' },
  itemStyle: { color: 'var(--svg-text)' },
  cursor: { stroke: 'var(--chart-axis)', fill: 'var(--chart-grid)', fillOpacity: 0.5 },
} as const;

export const SERIES = {
  blue: '#0066FF',
  green: '#1AC69E',
  orange: '#FB5A00',
  purple: '#6852BE',
  grey: '#909090',
} as const;

/** Envelope / band fill: use with BAND_OPACITY (fillOpacity) so it works on light and dark surfaces. */
export const BAND = 'var(--chart-band)';
export const BAND_OPACITY = 0.08;

export const AXIS_LABEL = { fill: 'var(--chart-tick)', fontSize: 12 } as const;
