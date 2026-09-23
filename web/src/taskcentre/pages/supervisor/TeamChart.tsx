/**
 * Today's work, one stacked bar per operator.
 *
 * The bar's height is the number of tasks that operator has been given today, split bottom-to-top
 * into completed, ongoing, pending and overdue. Each task is counted **once** (see
 * `exclusiveBucket`), so the segments add up to the number on top of the bar and a bar of height 5
 * means five tasks. An operator with nothing assigned gets no bar, not a zero-height stub — an
 * empty column is the honest picture of "no work given", and inventing a mark there would suggest
 * the system knows something it does not.
 *
 * Selecting a segment (or its legend entry) filters the task list below.
 */
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SupOperatorRow, TcTask } from '../../types';
import { BUCKET, BUCKETS, exclusiveBucket, operatorName, cx, type Bucket } from './common';

export interface ChartRow {
  user_id: string;
  name: string;
  short: string;
  total: number;
  completed: number;
  ongoing: number;
  pending: number;
  overdue: number;
}

/** One row per operator, in the order they are listed, with today's tasks counted once each. */
export function chartRows(operators: SupOperatorRow[], tasks: TcTask[], now: number): ChartRow[] {
  return operators.map((o) => {
    const mine = tasks.filter((t) => t.operator_id === o.user_id);
    const row: ChartRow = {
      user_id: o.user_id,
      name: operatorName(o),
      short: shortName(operatorName(o)),
      total: 0,
      completed: 0,
      ongoing: 0,
      pending: 0,
      overdue: 0,
    };
    for (const t of mine) {
      const b = exclusiveBucket(t, now);
      if (b) {
        row[b] += 1;
        row.total += 1;
      }
    }
    return row;
  });
}

/** "Anita Rao" -> "Anita R." so the axis stays readable without turning the labels sideways. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Hide the number inside a segment that is not there; a "0" printed on nothing reads as a bug. */
const hideZero = (v: unknown) => (typeof v === 'number' && v > 0 ? String(v) : '');

export function TeamChart({
  rows,
  bucket,
  onBucket,
}: {
  rows: ChartRow[];
  bucket: Bucket | null;
  onBucket: (b: Bucket | null) => void;
}) {
  const anyWork = rows.some((r) => r.total > 0);
  const tallest = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="h-[260px] min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: -18 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="short" tickLine={false} interval={0} />
            <YAxis allowDecimals={false} domain={[0, tallest]} tickLine={false} axisLine={false} width={34} />
            <Tooltip
              cursor={{ fill: 'rgba(128,128,128,0.10)' }}
              labelFormatter={(_l, p) => (p?.[0]?.payload as ChartRow | undefined)?.name ?? ''}
            />
            {BUCKETS.map((b, i) => (
              <Bar
                key={b}
                dataKey={b}
                stackId="tasks"
                name={BUCKET[b].label}
                fill={BUCKET[b].color}
                fillOpacity={bucket && bucket !== b ? 0.25 : 1}
                isAnimationActive={false}
                cursor="pointer"
                onClick={() => onBucket(bucket === b ? null : b)}
                maxBarSize={72}
              >
                <LabelList
                  dataKey={b}
                  position="center"
                  formatter={hideZero}
                  fill="#ffffff"
                  className="tnum"
                  fontSize={12}
                  fontWeight={700}
                />
                {/* The running total sits above the last segment in the stack. */}
                {i === BUCKETS.length - 1 && (
                  <LabelList dataKey="total" position="top" formatter={hideZero} className="recharts-label tnum" fontSize={12} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* The index. Doubles as the filter, so the colours are never the only way to read the chart. */}
      <ul className="flex shrink-0 flex-row flex-wrap gap-x-4 gap-y-1.5 sm:w-[132px] sm:flex-col sm:pt-2">
        {BUCKETS.map((b) => (
          <li key={b}>
            <button
              type="button"
              onClick={() => onBucket(bucket === b ? null : b)}
              aria-pressed={bucket === b}
              className={cx(
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-body-sm transition-colors',
                bucket === b ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-high',
              )}
            >
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: BUCKET[b].color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{BUCKET[b].label}</span>
              <span className="tnum text-on-surface-muted">{rows.reduce((n, r) => n + r[b], 0)}</span>
            </button>
          </li>
        ))}
      </ul>

      {!anyWork && (
        <p className="sr-only">No tasks are assigned to your team today, so no bars are drawn.</p>
      )}
    </div>
  );
}
