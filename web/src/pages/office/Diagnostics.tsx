/**
 * /diagnostics — engineers and judges only (screen 19). The ONLY place for developer details:
 * latencies, connections, data sources, model cards, drift, and raw JSON.
 * Kept quiet: four headline metrics, compact connection status, and everything else
 * (URLs, topics, fixtures, limits, payloads) behind "Details" toggles. No compliance claims.
 */
import { useState, type ReactNode } from 'react';
import { Line, LineChart, ReferenceLine, YAxis } from 'recharts';
import { EDGE_URL, EDGE_WS_URL, CLOUD_URL, MQTT_URL, cloud, edge } from '../../lib/api';
import { useNow, useResource } from '../../lib/hooks';
import { fmtAgo, fmtClock, fmtNum, titleCase, typeLabel } from '../../lib/format';
import { TOPIC_ALERTS, TOPIC_HEARTBEAT, liveNow, useLive, type ConnState } from '../../lib/live';
import { useMockStatus } from '../../lib/mockStatus';
import type { LiveSnapshot, ModelCard } from '../../lib/types';
import { SourceNote } from '../../components/ProvenanceBadge';
import { Button, EmptyState, Icon, Loading, PageTitle, Panel, Toggle, cx, toast } from '../../components/ui';

// ------------------------------------------------------------------ helpers
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const ms = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v < 10 ? v.toFixed(1) : v.toFixed(0));

/** Pick whichever clock (wall or simulation) the timestamp belongs to. */
function nowFor(ts: number | null | undefined): number {
  const wall = Date.now() / 1000;
  if (!ts) return wall;
  const sim = liveNow();
  const dw = wall - ts;
  const ds = sim - ts;
  if (dw >= 0 && (ds < 0 || dw <= ds)) return wall;
  if (ds >= 0) return sim;
  return wall;
}

function fmtHz(hz: number | null): string {
  if (hz === null) return '—';
  if (hz >= 1) return fmtNum(hz, 0);
  return hz.toFixed(4);
}

// ------------------------------------------------------------------ small pieces
type Tone = 'neutral' | 'green' | 'orange' | 'red' | 'blue' | 'yellow' | 'purple';
const DOT: Record<Tone, string> = {
  neutral: 'bg-outline-strong',
  green: 'bg-success',
  orange: 'bg-warning',
  red: 'bg-danger',
  blue: 'bg-notice',
  yellow: 'bg-caution',
  purple: 'bg-prov-sim',
};

/** Quiet status: coloured dot + plain text (instead of bordered chips). */
function Status({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 whitespace-nowrap text-body-sm text-on-surface', className)}>
      <span className={cx('h-2 w-2 shrink-0 rounded-full', DOT[tone])} />
      {children}
    </span>
  );
}

function SectionHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-headline-sm text-on-surface">{title}</h2>
        {sub && <p className="mt-1 text-body-sm text-on-surface-muted">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-3">{right}</div>}
    </div>
  );
}

function DetailsToggle({ open, onToggle, label = 'Details' }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
      {open ? 'Hide' : label}
      <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
    </button>
  );
}

function Metric({ label, value, unit, sub, bar, tone = 'neutral' }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; bar?: number; tone?: 'neutral' | 'orange' | 'red' }) {
  const color = { neutral: 'text-on-surface', orange: 'text-warning-text', red: 'text-danger-text' }[tone];
  const barColor = { neutral: 'bg-series-blue', orange: 'bg-warning', red: 'bg-danger' }[tone];
  return (
    <div className="min-w-0">
      <div className="text-body-sm text-on-surface-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className={cx('font-display text-headline-lg tnum', color)}>{value}</span>
        {unit && <span className="text-body-sm text-on-surface-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-body-sm text-on-surface-muted">{sub}</div>}
      {bar !== undefined && (
        <div className="mt-3 h-1 w-full bg-surface-container-high">
          <div className={cx('h-full', barColor)} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

function connTone(state: ConnState): { tone: Tone; label: string } {
  return {
    open: { tone: 'green' as Tone, label: 'Open' },
    connecting: { tone: 'yellow' as Tone, label: 'Connecting' },
    closed: { tone: 'red' as Tone, label: 'Closed' },
    idle: { tone: 'neutral' as Tone, label: 'Idle' },
  }[state];
}

function ConnItem({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-body-sm text-on-surface-muted">{label}</div>
      {children}
      {sub && <div className="mt-1 truncate text-body-sm text-on-surface-muted">{sub}</div>}
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4 py-2">
      <span className="text-body-sm text-on-surface-muted">{k}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function JsonBlock({ title, sub, data, defaultOpen = false }: { title: string; sub: string; data: unknown; defaultOpen?: boolean }) {
  const text = data === undefined || data === null ? 'null' : JSON.stringify(data, null, 2);
  const bytes = new Blob([text]).size;
  const copy = () => {
    try {
      void navigator.clipboard
        .writeText(text)
        .then(() => toast(`${title} copied`, 'info'))
        .catch(() => toast('Clipboard not available', 'error'));
    } catch {
      toast('Clipboard not available', 'error');
    }
  };
  return (
    <details open={defaultOpen} className="group border-b border-outline last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 hover:bg-surface-container-low">
        <Icon name="chevron_right" size={20} className="text-on-surface-muted transition-transform group-open:rotate-90" />
        <span className="font-mono text-body-sm text-on-surface">{title}</span>
        <span className="truncate font-mono text-footnote text-on-surface-muted">{sub}</span>
        <span className="ml-auto font-mono text-footnote text-on-surface-muted tnum">{bytes} B</span>
      </summary>
      <div className="relative mb-3 bg-surface-container-low">
        <button type="button" onClick={copy} className="absolute right-2 top-2 flex h-8 items-center gap-1 rounded border border-outline bg-surface-container px-2 text-body-sm text-on-surface-variant hover:bg-surface-container-high">
          <Icon name="content_copy" size={14} /> Copy
        </button>
        <pre className="max-h-96 overflow-auto p-4 font-mono text-[12px] leading-5 text-on-surface-variant">{text}</pre>
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ data sources (fictional)
type SourceStatus = 'LIVE' | 'SIMULATED' | 'NOT FITTED' | 'FAULT';
interface SourceRow {
  key: string;
  signal: string;
  sub: string;
  tier: 'A' | 'B' | 'C';
  iface: string;
  hz: number | null;
  every?: string;
  current?: (s: LiveSnapshot) => string;
  status?: (s: LiveSnapshot | null) => SourceStatus;
}

const TIER_LABEL = { A: 'Tier A · telematics', B: 'Tier B · machine bus', C: 'Tier C · add-on sensor' } as const;

const SOURCES: SourceRow[] = [
  { key: 'seatbelt', signal: 'Seatbelt switch', sub: 'Operator restraint', tier: 'B', iface: 'Seat switch via machine bus — CAN gateway mocked', hz: 10, current: (s) => (s.seatbelt ? 'fastened' : 'OPEN') },
  { key: 'travel', signal: 'Travel speed', sub: 'Track motor speed', tier: 'B', iface: 'Machine bus — CAN gateway mocked', hz: 10, current: (s) => `${fmtNum(s.travel_kmh, 1)} km/h` },
  { key: 'swing', signal: 'Swing rate', sub: 'Upper-structure rotation', tier: 'B', iface: 'Machine bus (swing motor)', hz: 20, current: (s) => (typeof s.swing_dps === 'number' ? `${fmtNum(s.swing_dps, 0)} °/s` : '—') },
  { key: 'joystick', signal: 'Joystick commands', sub: 'Swing · boom · stick · bucket', tier: 'B', iface: 'Machine bus (pilot / electro-hydraulic)', hz: 20 },
  { key: 'hyd', signal: 'Hydraulic pressure', sub: 'Main pump pressure', tier: 'B', iface: 'Machine bus (pressure transducer)', hz: 50 },
  {
    key: 'proximity', signal: 'Proximity', sub: 'Person / truck distance by sector', tier: 'C', iface: 'Add-on detection system (Cat Detect-class) — mocked', hz: 10,
    current: (s) => (s.proximity.fitted === false ? '—' : `person ${s.proximity.person_m ?? '—'} m · truck ${s.proximity.truck_m ?? '—'} m`),
    status: (s) => (!s ? 'SIMULATED' : s.proximity.fitted === false || s.proximity.status === 'not_fitted' ? 'NOT FITTED' : s.proximity.status === 'fault' || s.proximity.status === 'stale' ? 'FAULT' : 'SIMULATED'),
  },
  { key: 'payload', signal: 'Payload weighing', sub: 'Bucket payload', tier: 'C', iface: 'Add-on payload system', hz: null, status: () => 'NOT FITTED' },
  { key: 'idle', signal: 'Idle hours', sub: 'Engine on, no work', tier: 'A', iface: 'Telematics (Product Link / AEMP-style API) — mocked', hz: 1 / 300, every: 'every 5 min', current: (s) => `${fmtNum(s.idle.today_min, 0)} min today` },
  { key: 'fuel', signal: 'Fuel used', sub: 'Cumulative litres', tier: 'A', iface: 'Telematics (Product Link / AEMP-style API) — mocked', hz: 1 / 300, every: 'every 5 min' },
  { key: 'gps', signal: 'GPS position', sub: 'Machine location (shift only)', tier: 'A', iface: 'Telematics GNSS', hz: 1, current: () => 'Bench 3 geofence' },
];

function SourceStatusText({ s }: { s: SourceStatus }) {
  if (s === 'SIMULATED') return <Status tone="purple">Simulated</Status>;
  if (s === 'LIVE') return <Status tone="green">Live</Status>;
  if (s === 'FAULT') return <Status tone="red">Fault</Status>;
  return <Status tone="neutral">Not fitted</Status>;
}

// ------------------------------------------------------------------ model cards
const KIND_ICON: Record<string, string> = { iforest: 'scatter_plot', tasktime: 'schedule', expert_motion: 'timeline' };

function fmtMetric(v: number | string): string {
  if (typeof v === 'string') return v;
  if (Math.abs(v) <= 1 && !Number.isInteger(v)) return v.toFixed(2);
  return fmtNum(v, Number.isInteger(v) ? 0 : 1);
}

function ModelCardView({ m }: { m: ModelCard }) {
  const [open, setOpen] = useState(false);
  const features = m.features;
  const nFeatures = typeof features === 'number' ? features : Array.isArray(features) ? features.length : undefined;
  const sim = /simulated/i.test(m.training_data);
  return (
    <Panel as="article" className="flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-headline-sm text-on-surface">{m.name ?? titleCase(m.kind)}</h3>
          <div className="mt-0.5 font-mono text-body-sm text-on-surface-muted">{m.version}</div>
        </div>
        <Icon name={KIND_ICON[m.kind] ?? 'model_training'} className="text-on-surface-muted" />
      </div>
      <p className="mt-4 text-body-sm text-on-surface-variant">
        {m.training_data}
        {nFeatures !== undefined && <span className="text-on-surface-muted"> · {nFeatures} features</span>}
      </p>
      {m.metrics && Object.keys(m.metrics).length > 0 && (
        <table className="mt-4 w-full">
          <tbody>
            {Object.entries(m.metrics).map(([k, v]) => (
              <tr key={k} className="border-t border-outline">
                <td className="py-1.5 pr-3 text-body-sm text-on-surface-variant">{titleCase(k)}</td>
                <td className="py-1.5 text-right text-body-sm text-on-surface tnum">{fmtMetric(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-auto pt-4">
        {sim && <p className="mb-2 text-body-sm text-on-surface-muted">Evaluated on simulated data.</p>}
        <DetailsToggle open={open} onToggle={() => setOpen((o) => !o)} label="Limits & details" />
        {open && (
          <div className="mt-3 space-y-3 text-body-sm">
            {m.limits && m.limits.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-warning-text">
                  <Icon name="warning" size={16} /> Known limits
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-on-surface-variant">
                  {m.limits.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            {m.threshold && (
              <div className="text-on-surface-variant">
                <span className="text-on-surface-muted">Threshold: </span>
                {m.threshold}
              </div>
            )}
            {Array.isArray(features) && features.length > 0 && (
              <div className="font-mono text-footnote leading-5 text-on-surface-variant">{features.join(' · ')}</div>
            )}
            <div className="truncate font-mono text-footnote text-on-surface-muted">sha256 {m.sha256 ?? 'not reported'}</div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ page
export default function Diagnostics() {
  const live = useLive();
  const mock = useMockStatus();
  const now = useNow(500);

  const rates = useResource(() => cloud.alertRates(), [], 5000);
  const health = useResource(() => edge.health(), [], 5000);
  const sync = useResource(() => edge.syncStatus(), [], 5000);
  const models = useResource(() => cloud.models(), []);
  const drift = useResource(() => cloud.drift(), [], 30000);

  const [frozen, setFrozen] = useState<null | { snapshot: unknown; alert: unknown; heartbeat: unknown }>(null);
  const [moreMetrics, setMoreMetrics] = useState(false);
  const [connDetails, setConnDetails] = useState(false);
  const [inspector, setInspector] = useState(false);

  const r = rates.data;
  const h = health.data;

  // Rule latency: prefer measured MQTT T-CRIT publish → browser latency.
  const measured = live.tcritLatencyMs;
  const hasMeasured = measured.length > 0;
  const ruleP50 = hasMeasured ? quantile(measured, 0.5) : r?.latency_ms?.rule_p50 ?? h?.rule_latency_ms?.p50;
  const ruleP99 = hasMeasured ? quantile(measured, 0.99) : r?.latency_ms?.rule_p99 ?? h?.rule_latency_ms?.p99;
  const ruleSrc = hasMeasured ? `Measured in this browser (MQTT → UI, n=${measured.length})` : r?.latency_ms ? 'Reported by monitoring' : h?.rule_latency_ms ? 'Reported by edge /health' : 'No samples yet';

  const perHour = r?.per_operating_hour;
  const budget = r?.budget ?? 1.0;
  const overBudget = perHour !== undefined && perHour > budget;
  const queue = r?.queue_depth ?? h?.outbox_backlog ?? sync.data?.backlog;
  const lastSync = sync.data?.last_sync_ts ?? r?.last_sync_ts ?? null;
  const online = sync.data?.online ?? (h ? h.cloud === 'online' : undefined);

  const hbAge = live.heartbeat.lastAt ? (now - live.heartbeat.lastAt) / 1000 : null;
  const snapAge = live.snapshotAt ? (now - live.snapshotAt) / 1000 : null;
  const streamLabel = live.edgeWs === 'open' && !live.mockEngine ? 'Edge WebSocket (seeded simulator)' : live.mockEngine ? 'In-browser mock engine' : 'No stream yet';

  const mockedList = Object.values(mock.mocked).sort((a, b) => a.endpoint.localeCompare(b.endpoint));
  const feedback = r?.feedback_not_correct ?? [];
  const maxTotal = Math.max(1, ...feedback.map((f) => f.total));

  const lastAlert = live.alerts[0] ?? null;
  const hbView = live.heartbeat.msg ? { received_at_ms: live.heartbeat.lastAt, via: live.heartbeat.via, ...live.heartbeat.msg } : null;
  const view = frozen ?? { snapshot: live.snapshot, alert: lastAlert, heartbeat: hbView };

  const edgeWs = connTone(live.edgeWs);
  const mqtt = connTone(live.mqtt);
  const originTone = (o: string): Tone => (o === 'online' ? 'green' : o === 'offline' ? 'red' : 'neutral');

  return (
    <div className="space-y-8">
      <PageTitle title="Diagnostics" sub="For engineers and judges: latencies, connections, data sources, models, drift and raw payloads. Telemetry is simulated." />

      {/* ---------------------------------------------------- runtime metrics (4 headline, rest behind Details) */}
      <Panel className="p-6">
        <SectionHead
          title="Runtime"
          sub={`Refreshes every 5 s · ${fmtClock(Date.now() / 1000, true)}`}
          right={<DetailsToggle open={moreMetrics} onToggle={() => setMoreMetrics((v) => !v)} label="More metrics" />}
        />
        {rates.loading && !r && health.loading && !h ? (
          <Loading label="Loading runtime metrics" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              <Metric
                label="Rule latency p50 / p99"
                value={
                  <>
                    {ms(ruleP50)}
                    <span className="text-on-surface-muted"> / {ms(ruleP99)}</span>
                  </>
                }
                unit="ms"
                sub={ruleSrc}
              />
              <Metric
                label="Alerts per operating hour"
                value={perHour !== undefined ? fmtNum(perHour, 1) : '—'}
                unit="/ h"
                sub={`Budget ≤ ${fmtNum(budget, 1)} / h`}
                tone={overBudget ? 'orange' : 'neutral'}
                bar={perHour !== undefined ? (perHour / Math.max(budget, 0.001)) * 100 : undefined}
              />
              <Metric
                label="Queue depth"
                value={queue !== undefined ? fmtNum(queue, 0) : '—'}
                unit="msgs"
                sub={`Outbox backlog ${sync.data ? fmtNum(sync.data.backlog, 0) : '—'}`}
                tone={queue ? 'orange' : 'neutral'}
              />
              <Metric
                label="Last cloud sync"
                value={lastSync ? fmtAgo(lastSync, nowFor(lastSync)).replace(' ago', '') : '—'}
                unit={lastSync ? 'ago' : undefined}
                sub={online === undefined ? 'Cloud status unknown' : online ? 'Cloud online' : 'Cloud offline · store-and-forward'}
                tone={online === false ? 'orange' : 'neutral'}
              />
            </div>
            {moreMetrics && (
              <div className="mt-8 grid grid-cols-2 gap-8 border-t border-outline pt-6 lg:grid-cols-4">
                <Metric
                  label="ML alert latency p50 / p99"
                  value={
                    <>
                      {ms(r?.latency_ms?.ml_p50)}
                      <span className="text-on-surface-muted"> / {ms(r?.latency_ms?.ml_p99)}</span>
                    </>
                  }
                  unit="ms"
                  sub="Window close → advisory alert"
                />
                <Metric label="Edge CPU" value={r?.edge_cpu_pct !== undefined ? fmtNum(r.edge_cpu_pct, 0) : '—'} unit="%" sub="Edge runtime process" bar={r?.edge_cpu_pct} />
                {r?.by_tier && (
                  <div className="col-span-2 min-w-0">
                    <div className="text-body-sm text-on-surface-muted">Alerts per hour by tier</div>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-body-md text-on-surface tnum">
                      {Object.entries(r.by_tier).map(([t, v]) => (
                        <span key={t}>
                          <span className="text-on-surface-muted">{t.replace('_', '-')}</span> {fmtNum(v, 1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <SourceNote kinds={['RULE', 'ML', 'SIMULATED']} />
      </Panel>

      {/* ---------------------------------------------------- live connections (compact) */}
      <Panel className="p-6">
        <SectionHead
          title="Live connections"
          sub="Edge WebSocket (advisory) and MQTT (safety, direct from the broker) are independent paths."
          right={<DetailsToggle open={connDetails} onToggle={() => setConnDetails((v) => !v)} />}
        />
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          <ConnItem label="Edge WebSocket">
            <Status tone={edgeWs.tone}>{edgeWs.label}</Status>
          </ConnItem>
          <ConnItem label="MQTT (WebSocket)">
            <Status tone={mqtt.tone}>{mqtt.label}</Status>
          </ConnItem>
          <ConnItem label="Safety heartbeat" sub="Degraded after 3 s without one">
            <Status tone={hbAge === null ? 'neutral' : hbAge > 3 ? 'red' : 'green'} className="tnum">
              {hbAge === null ? 'None received' : `${hbAge.toFixed(1)} s ago`}
            </Status>
          </ConnItem>
          <ConnItem label="Protection" sub={live.protection.reason || undefined}>
            {live.protection.state === 'active' ? (
              <Status tone="green">Active</Status>
            ) : live.protection.state === 'degraded' ? (
              <Status tone="red">Degraded</Status>
            ) : (
              <Status tone="neutral">Waiting for heartbeat</Status>
            )}
          </ConnItem>
        </div>
        <p className="mt-6 text-body-sm text-on-surface-muted tnum">
          Stream: {streamLabel}
          {snapAge !== null && ` · last snapshot ${snapAge.toFixed(1)} s ago`} · {mock.forced ? 'forced mock mode (?mock=1)' : `${mockedList.length} endpoint${mockedList.length === 1 ? '' : 's'} served from fixtures`}
        </p>

        {connDetails && (
          <div className="mt-6 grid gap-8 border-t border-outline pt-6 xl:grid-cols-2">
            <div>
              <Row k="Edge WebSocket">
                <span className="break-all font-mono text-footnote text-on-surface-variant">{EDGE_WS_URL}</span>
              </Row>
              <Row k="MQTT">
                <div className="space-y-0.5 font-mono text-footnote text-on-surface-variant">
                  <div className="break-all">{MQTT_URL}</div>
                  <div>
                    <span className="text-on-surface-muted">sub qos1</span> {TOPIC_ALERTS}
                  </div>
                  <div>
                    <span className="text-on-surface-muted">sub qos0</span> {TOPIC_HEARTBEAT}
                  </div>
                </div>
              </Row>
              <Row k="Heartbeat">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
                  {live.heartbeat.via && <span>via {live.heartbeat.via}</span>}
                  {live.heartbeat.msg?.rule_version && <span className="font-mono text-footnote">{live.heartbeat.msg.rule_version}</span>}
                  {!live.heartbeat.via && !live.heartbeat.msg && <span className="text-on-surface-muted">—</span>}
                </div>
                {live.heartbeat.msg && Object.keys(live.heartbeat.msg.sensor_health ?? {}).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(live.heartbeat.msg.sensor_health).map(([k, v]) => (
                      <Status key={k} tone={v === 'ok' ? 'green' : v === 'not_fitted' ? 'neutral' : 'red'}>
                        {k}: {v.replace('_', ' ')}
                      </Status>
                    ))}
                  </div>
                )}
              </Row>
              <Row k="Mock engine">
                <span className="text-body-sm text-on-surface-variant">{live.mockEngine ? 'On' : 'Off'}</span>
              </Row>
              <Row k="Origins">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Status tone={originTone(mock.origins.edge)}>edge {mock.origins.edge}</Status>
                    <span className="break-all font-mono text-footnote text-on-surface-muted">{EDGE_URL}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Status tone={originTone(mock.origins.cloud)}>cloud {mock.origins.cloud}</Status>
                    <span className="break-all font-mono text-footnote text-on-surface-muted">{CLOUD_URL}</span>
                  </div>
                </div>
              </Row>
            </div>
            <div>
              <div className="mb-2 text-body-sm text-on-surface-muted">Endpoints served from fixtures</div>
              {mockedList.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">{mock.forced ? 'Forced mock mode — every call is served from fixtures.' : 'None — every endpoint called so far was answered by the running backend.'}</p>
              ) : (
                <div className="max-h-[320px] overflow-auto">
                  <table className="table-dense w-full">
                    <thead className="sticky top-0">
                      <tr>
                        <th>Endpoint</th>
                        <th>Reason</th>
                        <th className="text-right">Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockedList.map((m) => (
                        <tr key={m.endpoint}>
                          <td className="font-mono text-footnote text-on-surface">{m.endpoint}</td>
                          <td className="font-mono text-footnote text-on-surface-muted">{m.reason}</td>
                          <td className="text-right text-footnote text-on-surface-muted tnum">{fmtAgo(m.since / 1000, now / 1000)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-body-sm text-on-surface-muted">Fixtures are used when an origin is unreachable or a route is not implemented yet (404/405/5xx).</p>
            </div>
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------- data sources */}
      <Panel className="p-6">
        <SectionHead title="Data sources" sub="All machine signals in this prototype come from a seeded generator. Interfaces are fictional." />
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[820px]">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Source</th>
                <th>Status</th>
                <th className="text-right">Rate (Hz)</th>
                <th className="text-right">Current value</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => {
                const st = s.status ? s.status(live.snapshot) : 'SIMULATED';
                return (
                  <tr key={s.key}>
                    <td>
                      <div className="text-on-surface">{s.signal}</div>
                      <div className="text-on-surface-muted">{s.sub}</div>
                    </td>
                    <td>
                      <div className="text-on-surface-variant">{TIER_LABEL[s.tier]}</div>
                      <div className="text-on-surface-muted">{s.iface}</div>
                    </td>
                    <td>
                      <SourceStatusText s={st} />
                    </td>
                    <td className="text-right text-on-surface tnum">
                      {st === 'NOT FITTED' ? '—' : fmtHz(s.hz)}
                      {s.every && st !== 'NOT FITTED' && <div className="text-on-surface-muted">{s.every}</div>}
                    </td>
                    <td className="text-right text-on-surface-variant tnum">{live.snapshot && s.current && st !== 'NOT FITTED' ? s.current(live.snapshot) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-body-sm text-on-surface-muted">
          Tier A = telematics (minutes), Tier B = machine bus (10–50 Hz), Tier C = optional add-on hardware. There is no real machine feed; CAN gateway, telematics API and detection hardware are mocked integrations.
        </p>
      </Panel>

      {/* ---------------------------------------------------- model cards */}
      <section>
        <SectionHead title="Model cards" sub="Decision support only — models never send machine-control commands." />
        {models.loading && !models.data ? (
          <Panel>
            <Loading label="Loading model cards" />
          </Panel>
        ) : !models.data?.length ? (
          <EmptyState icon="model_training" title="No model cards">
            GET /models returned no models.
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {models.data.map((m) => (
              <ModelCardView key={`${m.kind}-${m.version}`} m={m} />
            ))}
          </div>
        )}
        <SourceNote kinds={['ML', 'SIMULATED']} />
      </section>

      {/* ---------------------------------------------------- drift & feedback */}
      <div className="grid gap-8 xl:grid-cols-2">
        <Panel className="p-6">
          <SectionHead title="Feature drift (PSI)" sub={drift.data?.window ? `Population stability index · ${drift.data.window}` : 'Population stability index'} />
          {drift.loading && !drift.data ? (
            <Loading label="Loading drift" />
          ) : !drift.data?.features.length ? (
            <EmptyState icon="query_stats" title="No drift data" />
          ) : (
            <div className="divide-y divide-outline">
              {drift.data.features.map((f) => {
                const status = f.status ?? (f.psi > 0.25 ? 'drift' : f.psi > 0.1 ? 'watch' : 'stable');
                const tone: Tone = status === 'stable' ? 'green' : status === 'watch' ? 'orange' : 'red';
                const color = tone === 'green' ? '#1AC69E' : tone === 'orange' ? '#FB5A00' : '#C52320';
                const data = (f.series ?? []).map((v, i) => ({ i, v }));
                const yMax = Math.max(0.3, ...(f.series ?? [0]));
                return (
                  <div key={f.feature} className="grid grid-cols-[1fr_160px_56px_80px] items-center gap-3 py-2">
                    <span className="truncate font-mono text-body-sm text-on-surface">{f.feature}</span>
                    <LineChart width={160} height={36} data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
                      <YAxis hide domain={[0, yMax]} />
                      <ReferenceLine y={0.1} stroke="var(--chart-axis)" strokeDasharray="3 3" />
                      <ReferenceLine y={0.25} stroke="var(--chart-tick)" strokeDasharray="2 4" />
                      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                    <span className="text-right text-body-sm text-on-surface tnum">{f.psi.toFixed(2)}</span>
                    <span className="text-right">
                      <Status tone={tone}>{titleCase(status)}</Status>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-body-sm text-on-surface-muted">PSI &lt; 0.10 stable · 0.10–0.25 watch · &gt; 0.25 drift (dashed guides)</p>
        </Panel>

        <Panel className="p-6">
          <SectionHead title={'Operator "Not correct?" feedback'} sub="Alerts operators marked as not correct, by alert type. Feeds threshold review and the alert budget." />
          {rates.loading && !r ? (
            <Loading label="Loading feedback" />
          ) : !feedback.length ? (
            <EmptyState icon="feedback" title="No feedback yet" />
          ) : (
            <div className="space-y-4">
              {feedback.map((f) => (
                <div key={f.type}>
                  <div className="flex items-baseline justify-between gap-3 text-body-sm">
                    <span className="text-on-surface">{typeLabel(f.type)}</span>
                    <span className="text-on-surface-muted tnum">
                      <span className="text-on-surface">{f.count}</span> of {f.total} alerts
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-2 w-full bg-surface-container-high" title={`${f.count} marked not correct of ${f.total} shown`}>
                    <div className="h-full bg-series-blue" style={{ width: `${((f.total - f.count) / maxTotal) * 100}%` }} />
                    <div className="h-full bg-series-orange" style={{ width: `${(f.count / maxTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-6 pt-2 text-body-sm text-on-surface-muted">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-4 bg-series-blue" /> Not disputed
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-4 bg-series-orange" /> Marked “Not correct?”
                </span>
              </div>
            </div>
          )}
          <SourceNote kinds={['SIMULATED']} />
        </Panel>
      </div>

      {/* ---------------------------------------------------- API inspector (collapsed by default) */}
      <Panel className="p-6">
        <SectionHead
          title="API inspector"
          sub="Raw payloads from the edge and the live stream."
          right={
            <>
              {inspector && (
                <>
                  <Toggle on={!!frozen} onChange={(v) => setFrozen(v ? { snapshot: live.snapshot, alert: lastAlert, heartbeat: hbView } : null)} label={<span className="text-body-sm text-on-surface-variant">Freeze live</span>} />
                  <Button size="sm" icon="refresh" onClick={() => health.reload()}>
                    Refetch /health
                  </Button>
                </>
              )}
              <DetailsToggle open={inspector} onToggle={() => setInspector((v) => !v)} label="Show payloads" />
            </>
          }
        />
        {inspector && (
          <div className="border-t border-outline">
            <JsonBlock title="GET /health" sub={EDGE_URL + '/health'} data={h ?? null} />
            <JsonBlock title="Live snapshot" sub={`WS ${EDGE_WS_URL} · type=snapshot`} data={view.snapshot} />
            <JsonBlock title="Last alert" sub={lastAlert ? `${lastAlert.signal_word} · via ${lastAlert._via ?? 'edge'}` : 'none yet'} data={view.alert} />
            <JsonBlock title="Last safety heartbeat" sub={TOPIC_HEARTBEAT} data={view.heartbeat} />
          </div>
        )}
      </Panel>
    </div>
  );
}
