/**
 * /diagnostics — engineers and judges only (screen 19). The ONLY place for developer details:
 * latencies, connections, data sources, model cards, drift, and raw JSON.
 * No compliance claims; every value carries its provenance.
 */
import { useState, type ReactNode } from 'react';
import { Line, LineChart, ReferenceLine, YAxis } from 'recharts';
import { EDGE_URL, EDGE_WS_URL, CLOUD_URL, MQTT_URL, cloud, edge } from '../../lib/api';
import { useNow, useResource } from '../../lib/hooks';
import { fmtAgo, fmtClock, fmtNum, titleCase, typeLabel } from '../../lib/format';
import { TOPIC_ALERTS, TOPIC_HEARTBEAT, liveNow, useLive, type ConnState } from '../../lib/live';
import { useMockStatus } from '../../lib/mockStatus';
import type { LiveSnapshot, ModelCard } from '../../lib/types';
import { DataSourceChip } from '../../components/DataSourceChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { Button, Chip, EmptyState, Icon, Label, Loading, PageTitle, Panel, PanelHeader, Toggle, cx, toast } from '../../components/ui';

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
function Tile({ label, value, unit, sub, badges, bar, tone = 'neutral', extra }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; badges?: ReactNode; bar?: number; tone?: 'neutral' | 'green' | 'orange' | 'red' | 'blue'; extra?: ReactNode }) {
  const color = { neutral: 'text-on-surface', green: 'text-success-text', orange: 'text-warning-text', red: 'text-danger-text', blue: 'text-notice-dark' }[tone];
  const barColor = { neutral: 'bg-on-surface-muted', green: 'bg-series-green', orange: 'bg-warning', red: 'bg-danger', blue: 'bg-series-blue' }[tone];
  return (
    <div className="flex min-w-0 flex-col gap-2 border border-outline bg-surface-container p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-label-sm uppercase text-on-surface-variant">{label}</span>
        <span className="flex flex-wrap justify-end gap-1">{badges}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className={cx('font-mono text-[28px] font-medium leading-none tnum', color)}>{value}</span>
        {unit && <span className="font-mono text-body-sm text-on-surface-muted">{unit}</span>}
      </div>
      {sub && <div className="font-mono text-[12px] leading-4 text-on-surface-muted">{sub}</div>}
      {extra}
      {bar !== undefined && (
        <div className="mt-auto h-1.5 w-full bg-surface-container-lowest">
          <div className={cx('h-full', barColor)} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

function ConnChip({ state }: { state: ConnState }) {
  const map: Record<ConnState, { tone: 'green' | 'yellow' | 'red' | 'neutral'; label: string; icon: string }> = {
    open: { tone: 'green', label: 'Open', icon: 'link' },
    connecting: { tone: 'yellow', label: 'Connecting', icon: 'sync' },
    closed: { tone: 'red', label: 'Closed', icon: 'link_off' },
    idle: { tone: 'neutral', label: 'Idle', icon: 'pause' },
  };
  const m = map[state];
  return (
    <Chip tone={m.tone} icon={m.icon}>
      {m.label}
    </Chip>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[170px_1fr] items-start gap-3 border-b border-outline py-2.5 last:border-b-0">
      <Label className="pt-1">{k}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function JsonBlock({ title, sub, data, defaultOpen = false, badges }: { title: string; sub: string; data: unknown; defaultOpen?: boolean; badges?: ReactNode }) {
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
    <details open={defaultOpen} className="group border border-outline bg-surface-container-lowest">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-surface-container-low px-4 py-2.5 hover:bg-surface-container">
        <Icon name="chevron_right" size={20} className="text-on-surface-muted transition-transform group-open:rotate-90" />
        <span className="font-mono text-body-sm text-on-surface">{title}</span>
        <span className="truncate font-mono text-[12px] text-on-surface-muted">{sub}</span>
        <span className="ml-auto flex items-center gap-2">
          {badges}
          <span className="font-mono text-[11px] text-on-surface-muted tnum">{bytes} B</span>
        </span>
      </summary>
      <div className="relative border-t border-outline">
        <button type="button" onClick={copy} className="absolute right-2 top-2 flex h-8 items-center gap-1 border border-outline bg-surface-container px-2 font-display text-label-sm uppercase text-on-surface-variant hover:bg-surface-container-high">
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

const TIER_LABEL = { A: 'A · Telematics', B: 'B · Machine bus', C: 'C · Add-on sensor' } as const;

const SOURCES: SourceRow[] = [
  { key: 'seatbelt', signal: 'Seatbelt switch', sub: 'Operator restraint', tier: 'B', iface: 'Seat switch via machine bus — CAN gateway MOCKED', hz: 10, current: (s) => (s.seatbelt ? 'fastened' : 'OPEN') },
  { key: 'travel', signal: 'Travel speed', sub: 'Track motor speed', tier: 'B', iface: 'Machine bus — CAN gateway MOCKED', hz: 10, current: (s) => `${fmtNum(s.travel_kmh, 1)} km/h` },
  { key: 'swing', signal: 'Swing rate', sub: 'Upper-structure rotation', tier: 'B', iface: 'Machine bus (swing motor)', hz: 20, current: (s) => (typeof s.swing_dps === 'number' ? `${fmtNum(s.swing_dps, 0)} °/s` : '—') },
  { key: 'joystick', signal: 'Joystick commands', sub: 'Swing · boom · stick · bucket', tier: 'B', iface: 'Machine bus (pilot / electro-hydraulic)', hz: 20 },
  { key: 'hyd', signal: 'Hydraulic pressure', sub: 'Main pump pressure', tier: 'B', iface: 'Machine bus (pressure transducer)', hz: 50 },
  {
    key: 'proximity', signal: 'Proximity', sub: 'Person / truck distance by sector', tier: 'C', iface: 'Add-on detection system (Cat Detect-class) — MOCKED', hz: 10,
    current: (s) => (s.proximity.fitted === false ? '—' : `person ${s.proximity.person_m ?? '—'} m · truck ${s.proximity.truck_m ?? '—'} m`),
    status: (s) => (!s ? 'SIMULATED' : s.proximity.fitted === false || s.proximity.status === 'not_fitted' ? 'NOT FITTED' : s.proximity.status === 'fault' || s.proximity.status === 'stale' ? 'FAULT' : 'SIMULATED'),
  },
  { key: 'payload', signal: 'Payload weighing', sub: 'Bucket payload', tier: 'C', iface: 'Add-on payload system', hz: null, status: () => 'NOT FITTED' },
  { key: 'idle', signal: 'Idle hours', sub: 'Engine on, no work', tier: 'A', iface: 'Telematics (Product Link / AEMP-style API) — MOCKED', hz: 1 / 300, every: 'every 5 min', current: (s) => `${fmtNum(s.idle.today_min, 0)} min today` },
  { key: 'fuel', signal: 'Fuel used', sub: 'Cumulative litres', tier: 'A', iface: 'Telematics (Product Link / AEMP-style API) — MOCKED', hz: 1 / 300, every: 'every 5 min' },
  { key: 'gps', signal: 'GPS position', sub: 'Machine location (shift only)', tier: 'A', iface: 'Telematics GNSS', hz: 1, current: () => 'Bench 3 geofence' },
];

function StatusChip({ s }: { s: SourceStatus }) {
  if (s === 'SIMULATED') return <ProvenanceBadge kind="SIMULATED" />;
  if (s === 'LIVE') return <Chip tone="green">Live</Chip>;
  if (s === 'FAULT') return <Chip tone="red" icon="error">Fault</Chip>;
  return <Chip tone="neutral" icon="block">Not fitted</Chip>;
}

// ------------------------------------------------------------------ model cards
const KIND_ICON: Record<string, string> = { iforest: 'scatter_plot', tasktime: 'schedule', expert_motion: 'timeline' };

function fmtMetric(v: number | string): string {
  if (typeof v === 'string') return v;
  if (Math.abs(v) <= 1 && !Number.isInteger(v)) return v.toFixed(2);
  return fmtNum(v, Number.isInteger(v) ? 0 : 1);
}

function ModelCardView({ m }: { m: ModelCard }) {
  const features = m.features;
  const sim = /simulated/i.test(m.training_data);
  return (
    <Panel accent="yellow" as="article" className="flex flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-outline px-4 py-3 pl-5">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <ProvenanceBadges kinds={m.provenance ?? ['ML']} />
            <span className="font-mono text-[11px] text-on-surface-muted">{m.kind}</span>
          </div>
          <h3 className="font-display text-headline-sm uppercase text-on-surface">{m.name ?? titleCase(m.kind)}</h3>
          <div className="font-mono text-body-sm text-cat-text">{m.version}</div>
        </div>
        <Icon name={KIND_ICON[m.kind] ?? 'model_training'} size={28} className="text-on-surface-muted" />
      </header>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3 pl-5">
        <DataSourceChip endpoints={['GET /models']} modelBacked />
        <div>
          <Label>Training data</Label>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
            {m.training_data}
            {sim && <ProvenanceBadge kind="SIMULATED" />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="border border-outline bg-surface-container-low px-3 py-2">
            <Label>Features</Label>
            <div className="font-mono text-body-md text-on-surface tnum">{typeof features === 'number' ? features : Array.isArray(features) ? features.length : '—'}</div>
          </div>
          <div className="border border-outline bg-surface-container-low px-3 py-2">
            <Label>Threshold</Label>
            <div className="text-body-sm text-on-surface">{m.threshold ?? '—'}</div>
          </div>
        </div>
        {Array.isArray(features) && features.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {features.map((f) => (
              <span key={f} className="border border-outline px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant">
                {f}
              </span>
            ))}
          </div>
        )}
        {m.metrics && Object.keys(m.metrics).length > 0 && (
          <div>
            <div className="flex items-center gap-2">
              <Label>Evaluation</Label>
              {sim && <span className="text-footnote text-on-surface-muted">on SIMULATED data</span>}
            </div>
            <table className="mt-1 w-full">
              <tbody>
                {Object.entries(m.metrics).map(([k, v]) => (
                  <tr key={k} className="border-b border-outline last:border-b-0">
                    <td className="py-1 pr-2 text-body-sm text-on-surface-variant">{titleCase(k)}</td>
                    <td className="py-1 text-right font-mono text-body-sm text-on-surface tnum">{fmtMetric(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {m.limits && m.limits.length > 0 && (
          <div className="border border-warning/60 bg-warning/5 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Icon name="warning" size={16} className="text-warning-text" />
              <Label className="text-warning-text">Known limits</Label>
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body-sm text-on-surface-variant">
              {m.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 border-t border-outline pt-2">
          <Label>sha256</Label>
          <span className="truncate font-mono text-[12px] text-on-surface-variant">{m.sha256 ?? 'not reported'}</span>
        </div>
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

  const r = rates.data;
  const h = health.data;

  // Rule latency: prefer measured MQTT T-CRIT publish → browser latency.
  const measured = live.tcritLatencyMs;
  const hasMeasured = measured.length > 0;
  const ruleP50 = hasMeasured ? quantile(measured, 0.5) : r?.latency_ms?.rule_p50 ?? h?.rule_latency_ms?.p50;
  const ruleP99 = hasMeasured ? quantile(measured, 0.99) : r?.latency_ms?.rule_p99 ?? h?.rule_latency_ms?.p99;
  const ruleSrc = hasMeasured ? `measured in this browser · MQTT publish → UI · n=${measured.length}` : r?.latency_ms ? 'reported by monitoring (rule evaluation)' : h?.rule_latency_ms ? 'reported by edge /health' : 'no samples yet';

  const perHour = r?.per_operating_hour;
  const budget = r?.budget ?? 1.0;
  const overBudget = perHour !== undefined && perHour > budget;
  const queue = r?.queue_depth ?? h?.outbox_backlog ?? sync.data?.backlog;
  const lastSync = sync.data?.last_sync_ts ?? r?.last_sync_ts ?? null;
  const online = sync.data?.online ?? (h ? h.cloud === 'online' : undefined);

  const hbAge = live.heartbeat.lastAt ? (now - live.heartbeat.lastAt) / 1000 : null;
  const snapAge = live.snapshotAt ? (now - live.snapshotAt) / 1000 : null;
  const streamLabel = live.edgeWs === 'open' && !live.mockEngine ? 'Edge WebSocket (seeded simulator)' : live.mockEngine ? 'In-browser MOCK engine' : 'No stream yet';

  const mockedList = Object.values(mock.mocked).sort((a, b) => a.endpoint.localeCompare(b.endpoint));
  const feedback = r?.feedback_not_correct ?? [];
  const maxTotal = Math.max(1, ...feedback.map((f) => f.total));

  const lastAlert = live.alerts[0] ?? null;
  const hbView = live.heartbeat.msg ? { received_at_ms: live.heartbeat.lastAt, via: live.heartbeat.via, ...live.heartbeat.msg } : null;
  const view = frozen ?? { snapshot: live.snapshot, alert: lastAlert, heartbeat: hbView };

  return (
    <div className="space-y-6">
      <PageTitle
        kicker="Engineers & judges only"
        title="Diagnostics"
        sub="Runtime latencies, connections, data sources, model cards, drift and raw API payloads. Telemetry is SIMULATED."
        right={
          <>
            <Chip tone="neutral" icon="engineering">
              Developer view
            </Chip>
            <ProvenanceBadge kind="SIMULATED" />
            <DataSourceChip endpoints={['GET /health', '/monitoring/', 'GET /sync/status']} />
          </>
        }
      />

      {/* ---------------------------------------------------- row 1: tiles */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-label-md uppercase text-cat-text">Runtime metrics</h2>
          <span className="font-mono text-[12px] text-on-surface-muted">refresh 5 s · {fmtClock(Date.now() / 1000, true)}</span>
        </div>
        {rates.loading && !r && health.loading && !h ? (
          <Panel>
            <Loading label="Loading runtime metrics" />
          </Panel>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile
              label="Rule latency p50 / p99"
              value={
                <>
                  {ms(ruleP50)}
                  <span className="text-[18px] text-on-surface-variant"> / {ms(ruleP99)}</span>
                </>
              }
              unit="ms"
              sub={ruleSrc}
              tone={hasMeasured ? 'green' : 'neutral'}
              badges={
                <>
                  <ProvenanceBadge kind="RULE" />
                  {hasMeasured && <Chip tone="green">Measured</Chip>}
                </>
              }
            />
            <Tile
              label="ML alert latency p50 / p99"
              value={
                <>
                  {ms(r?.latency_ms?.ml_p50)}
                  <span className="text-[18px] text-on-surface-variant"> / {ms(r?.latency_ms?.ml_p99)}</span>
                </>
              }
              unit="ms"
              sub="window close → advisory alert"
              badges={<ProvenanceBadges kinds={['ML', 'SIMULATED']} />}
            />
            <Tile
              label="Alerts / operating hour"
              value={perHour !== undefined ? fmtNum(perHour, 1) : '—'}
              unit="/ h"
              sub={
                <>
                  budget ≤ {fmtNum(budget, 1)} / h
                  {r?.by_tier && (
                    <span className="block">
                      {Object.entries(r.by_tier)
                        .map(([t, v]) => `${t.replace('_', '-')} ${fmtNum(v, 1)}`)
                        .join(' · ')}
                    </span>
                  )}
                </>
              }
              tone={perHour === undefined ? 'neutral' : overBudget ? 'orange' : 'green'}
              bar={perHour !== undefined ? (perHour / Math.max(budget, 0.001)) * 100 : undefined}
              badges={<ProvenanceBadge kind="SIMULATED" />}
            />
            <Tile
              label="Edge CPU"
              value={r?.edge_cpu_pct !== undefined ? fmtNum(r.edge_cpu_pct, 0) : '—'}
              unit="%"
              sub="edge runtime process"
              bar={r?.edge_cpu_pct}
              tone="blue"
              badges={<ProvenanceBadge kind="SIMULATED" />}
            />
            <Tile
              label="Queue depth"
              value={queue !== undefined ? fmtNum(queue, 0) : '—'}
              unit="msgs"
              sub={`outbox backlog ${sync.data ? fmtNum(sync.data.backlog, 0) : '—'}`}
              tone={queue ? 'orange' : 'green'}
              badges={<ProvenanceBadge kind="SIMULATED" />}
            />
            <Tile
              label="Last cloud sync"
              value={lastSync ? fmtAgo(lastSync, nowFor(lastSync)).replace(' ago', '') : '—'}
              unit={lastSync ? 'ago' : undefined}
              sub={online === undefined ? 'cloud status unknown' : online ? 'cloud ONLINE' : 'cloud OFFLINE · store-and-forward'}
              tone={online === false ? 'orange' : 'green'}
              badges={<ProvenanceBadge kind="SIMULATED" />}
            />
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- live connections */}
      <Panel>
        <PanelHeader icon="cable" title="Live connections" sub="Two independent paths: edge WebSocket (advisory) and MQTT (safety, direct from the broker)" />
        <div className="grid gap-6 p-4 xl:grid-cols-2">
          <div>
            <Row k="Edge WebSocket">
              <div className="flex flex-wrap items-center gap-2">
                <ConnChip state={live.edgeWs} />
                <span className="font-mono text-[12px] text-on-surface-muted">{EDGE_WS_URL}</span>
              </div>
            </Row>
            <Row k="MQTT (WebSocket)">
              <div className="flex flex-wrap items-center gap-2">
                <ConnChip state={live.mqtt} />
                <span className="font-mono text-[12px] text-on-surface-muted">{MQTT_URL}</span>
              </div>
              <div className="mt-1.5 space-y-0.5 font-mono text-[12px] text-on-surface-variant">
                <div>
                  <span className="text-on-surface-muted">sub qos1</span> {TOPIC_ALERTS}
                </div>
                <div>
                  <span className="text-on-surface-muted">sub qos0</span> {TOPIC_HEARTBEAT}
                </div>
              </div>
            </Row>
            <Row k="Safety heartbeat">
              <div className="flex flex-wrap items-center gap-2 font-mono text-body-sm">
                <span className={cx('tnum', hbAge === null ? 'text-on-surface-muted' : hbAge > 3 ? 'text-danger-text' : 'text-success-text')}>{hbAge === null ? 'none received' : `${hbAge.toFixed(1)} s ago`}</span>
                {live.heartbeat.via && <Chip tone="neutral">via {live.heartbeat.via}</Chip>}
                {live.heartbeat.msg?.rule_version && <span className="text-[12px] text-on-surface-muted">{live.heartbeat.msg.rule_version}</span>}
              </div>
              {live.heartbeat.msg && Object.keys(live.heartbeat.msg.sensor_health ?? {}).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(live.heartbeat.msg.sensor_health).map(([k, v]) => (
                    <Chip key={k} tone={v === 'ok' ? 'green' : v === 'not_fitted' ? 'neutral' : 'red'}>
                      {k}: {v.replace('_', ' ')}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="mt-1 text-footnote text-on-surface-muted">Watchdog: no heartbeat for &gt; 3 s → PROTECTION DEGRADED</div>
            </Row>
            <Row k="Protection">
              <div className="flex flex-wrap items-center gap-2">
                {live.protection.state === 'active' ? (
                  <Chip tone="green" icon="verified_user">
                    Protection active
                  </Chip>
                ) : live.protection.state === 'degraded' ? (
                  <Chip tone="red" icon="gpp_maybe">
                    Protection degraded
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="hourglass_empty">
                    Waiting for heartbeat
                  </Chip>
                )}
                {live.protection.reason && <span className="text-body-sm text-on-surface-variant">{live.protection.reason}</span>}
              </div>
            </Row>
            <Row k="Telemetry stream">
              <div className="flex flex-wrap items-center gap-2">
                {live.mockEngine ? (
                  <Chip tone="neutral" icon="memory">
                    Mock engine ON
                  </Chip>
                ) : (
                  <Chip tone="neutral" icon="memory">
                    Mock engine off
                  </Chip>
                )}
                <span className="text-body-sm text-on-surface-variant">{streamLabel}</span>
                {snapAge !== null && <span className="font-mono text-[12px] text-on-surface-muted tnum">last snapshot {snapAge.toFixed(1)} s ago</span>}
              </div>
            </Row>
            <Row k="Origins">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
                <Chip tone={mock.origins.edge === 'online' ? 'green' : mock.origins.edge === 'offline' ? 'red' : 'neutral'}>edge {mock.origins.edge}</Chip>
                <span className="text-on-surface-muted">{EDGE_URL}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[12px]">
                <Chip tone={mock.origins.cloud === 'online' ? 'green' : mock.origins.cloud === 'offline' ? 'red' : 'neutral'}>cloud {mock.origins.cloud}</Chip>
                <span className="text-on-surface-muted">{CLOUD_URL}</span>
              </div>
              {mock.forced && (
                <div className="mt-1.5">
                  <Chip tone="orange" icon="science">
                    Forced mock mode (?mock=1)
                  </Chip>
                </div>
              )}
            </Row>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Endpoints served from fixtures</Label>
              <span className="font-mono text-[12px] text-on-surface-muted">{mockedList.length} mocked</span>
            </div>
            {mockedList.length === 0 ? (
              <EmptyState icon="dns" title={mock.forced ? 'Forced mock mode' : 'No mocked endpoints'}>
                {mock.forced ? 'Every call is served from fixtures.' : 'Every endpoint called so far was answered by the running backend.'}
              </EmptyState>
            ) : (
              <div className="max-h-[360px] overflow-auto border border-outline">
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
                        <td className="font-mono text-[12px] text-on-surface">{m.endpoint}</td>
                        <td className="font-mono text-[12px] text-on-surface-muted">{m.reason}</td>
                        <td className="text-right font-mono text-[12px] text-on-surface-muted tnum">{fmtAgo(m.since / 1000, now / 1000)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-footnote text-on-surface-muted">
              <ProvenanceBadge kind="MOCK" className="mr-1" /> Fixtures are used when an origin is unreachable or a route is not implemented yet (404/405/5xx).
            </p>
          </div>
        </div>
      </Panel>

      {/* ---------------------------------------------------- row 2: data sources */}
      <Panel>
        <PanelHeader
          icon="sensors"
          title="Data sources"
          sub={`Stream: ${streamLabel}. All machine signals in this prototype come from a seeded generator.`}
          right={<ProvenanceBadge kind="SIMULATED" />}
        />
        <div className="overflow-x-auto">
          <table className="table-dense w-full min-w-[980px]">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Tier</th>
                <th>Interface (fictional)</th>
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
                      <div className="font-display text-label-md uppercase text-on-surface">{s.signal}</div>
                      <div className="text-footnote text-on-surface-muted">{s.sub}</div>
                    </td>
                    <td className="whitespace-nowrap font-display text-label-sm uppercase text-on-surface-variant">{TIER_LABEL[s.tier]}</td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{s.iface}</td>
                    <td>
                      <StatusChip s={st} />
                    </td>
                    <td className="text-right font-mono text-on-surface tnum">
                      {st === 'NOT FITTED' ? '—' : fmtHz(s.hz)}
                      {s.every && st !== 'NOT FITTED' && <div className="text-[11px] text-on-surface-muted">{s.every}</div>}
                    </td>
                    <td className="text-right font-mono text-[12px] text-on-surface-variant">{live.snapshot && s.current && st !== 'NOT FITTED' ? s.current(live.snapshot) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-outline px-4 py-2 text-footnote text-on-surface-muted">
          Tier A = telematics (minutes), Tier B = machine bus (10–50 Hz), Tier C = optional add-on hardware. LIVE would mean a real machine feed — there is none in this prototype. CAN gateway, telematics API and detection hardware are MOCKED integrations.
        </p>
      </Panel>

      {/* ---------------------------------------------------- row 3: model cards */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-headline-sm uppercase text-on-surface">
            <Icon name="model_training" className="text-cat-text" /> Model cards
          </h2>
          <DataSourceChip endpoints={['GET /models']} modelBacked />
        </div>
        {models.loading && !models.data ? (
          <Panel>
            <Loading label="Loading model cards" />
          </Panel>
        ) : !models.data?.length ? (
          <EmptyState icon="model_training" title="No model cards">
            GET /models returned no models.
          </EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {models.data.map((m) => (
              <ModelCardView key={`${m.kind}-${m.version}`} m={m} />
            ))}
          </div>
        )}
        <p className="mt-2 text-footnote text-on-surface-muted">Models are decision support only — they never send machine-control commands. Evaluation numbers are measured on SIMULATED data with injected events.</p>
      </section>

      {/* ---------------------------------------------------- row 4: drift & feedback */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader icon="query_stats" title="Feature drift (PSI)" sub={drift.data?.window ? `Population stability index · ${drift.data.window}` : 'Population stability index'} right={<DataSourceChip endpoints={['GET /monitoring/drift']} />} />
          {drift.loading && !drift.data ? (
            <Loading label="Loading drift" />
          ) : !drift.data?.features.length ? (
            <div className="p-4">
              <EmptyState icon="query_stats" title="No drift data" />
            </div>
          ) : (
            <div className="divide-y divide-outline">
              {drift.data.features.map((f) => {
                const status = f.status ?? (f.psi > 0.25 ? 'drift' : f.psi > 0.1 ? 'watch' : 'stable');
                const tone = status === 'stable' ? 'green' : status === 'watch' ? 'orange' : 'red';
                const color = tone === 'green' ? '#1AC69E' : tone === 'orange' ? '#FB5A00' : '#FF6B66';
                const data = (f.series ?? []).map((v, i) => ({ i, v }));
                const yMax = Math.max(0.3, ...(f.series ?? [0]));
                return (
                  <div key={f.feature} className="grid grid-cols-[1fr_190px_80px_80px] items-center gap-3 px-4 py-2">
                    <span className="truncate font-mono text-body-sm text-on-surface">{f.feature}</span>
                    <LineChart width={190} height={40} data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
                      <YAxis hide domain={[0, yMax]} />
                      <ReferenceLine y={0.1} stroke="var(--chart-tip-border)" strokeDasharray="3 3" />
                      <ReferenceLine y={0.25} stroke="#757575" strokeDasharray="2 4" />
                      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                    <span className="text-right font-mono text-body-sm text-on-surface tnum">{f.psi.toFixed(2)}</span>
                    <span className="text-right">
                      <Chip tone={tone}>{status}</Chip>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-outline px-4 py-2 text-footnote text-on-surface-muted">
            <span>PSI &lt; 0.10 stable · 0.10–0.25 watch · &gt; 0.25 drift (dashed guides)</span>
            <ProvenanceBadges kinds={['ML', 'SIMULATED']} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader icon="feedback" title={'Operator "Not correct?" feedback'} sub="Alerts operators marked as not correct, by alert type" right={<DataSourceChip endpoints={['GET /monitoring/alert-rates']} />} />
          {rates.loading && !r ? (
            <Loading label="Loading feedback" />
          ) : !feedback.length ? (
            <div className="p-4">
              <EmptyState icon="feedback" title="No feedback yet" />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {feedback.map((f) => (
                <div key={f.type}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-label-md uppercase text-on-surface">{typeLabel(f.type)}</span>
                    <span className="font-mono text-body-sm text-on-surface-variant tnum">
                      <span className="text-on-surface">{f.count}</span> of {f.total} alerts
                    </span>
                  </div>
                  <div className="mt-1 flex h-3 w-full bg-surface-container-lowest" title={`${f.count} marked not correct of ${f.total} shown`}>
                    <div className="h-full bg-series-blue" style={{ width: `${((f.total - f.count) / maxTotal) * 100}%` }} />
                    <div className="h-full bg-series-orange" style={{ width: `${(f.count / maxTotal) * 100}%` }} />
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-on-surface-muted">{f.type}</div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-4 border-t border-outline pt-2 text-footnote text-on-surface-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-4 bg-series-blue" /> not disputed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-4 bg-series-orange" /> marked “Not correct?”
                </span>
                <span>Feeds threshold review and the alert budget.</span>
                <ProvenanceBadge kind="SIMULATED" />
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ---------------------------------------------------- row 5: API inspector */}
      <Panel>
        <PanelHeader
          icon="data_object"
          title="API inspector"
          sub="Raw payloads — click a row to expand or collapse"
          right={
            <>
              <Toggle
                on={!!frozen}
                onChange={(v) => setFrozen(v ? { snapshot: live.snapshot, alert: lastAlert, heartbeat: hbView } : null)}
                label={<span className="font-display text-label-sm uppercase text-on-surface-variant">Freeze live</span>}
              />
              <Button size="sm" icon="refresh" onClick={() => health.reload()}>
                Refetch /health
              </Button>
            </>
          }
        />
        <div className="space-y-2 p-4">
          <JsonBlock title="GET /health" sub={EDGE_URL + '/health'} data={h ?? null} defaultOpen badges={<DataSourceChip endpoints={['GET /health']} />} />
          <JsonBlock title="Live snapshot" sub={`WS ${EDGE_WS_URL} · type=snapshot`} data={view.snapshot} badges={<ProvenanceBadge kind="SIMULATED" />} />
          <JsonBlock title="Last alert" sub={lastAlert ? `${lastAlert.signal_word} · via ${lastAlert._via ?? 'edge'}` : 'none yet'} data={view.alert} badges={<ProvenanceBadge kind="SIMULATED" />} />
          <JsonBlock title="Last safety heartbeat" sub={TOPIC_HEARTBEAT} data={view.heartbeat} badges={<ProvenanceBadge kind="RULE" />} />
        </div>
      </Panel>
    </div>
  );
}
