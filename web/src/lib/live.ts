/**
 * Live data for the in-cab screens.
 *
 * Two independent paths, by design (docs/sections/10-mvp.md §4, AC2.3):
 *  1. Edge WebSocket  EDGE_WS_URL (/ws/live): snapshots, advisory alerts (T1–T4), ETA, task, health.
 *  2. MQTT over WebSocket (MQTT_URL, Mosquitto :9001), subscribed DIRECTLY to
 *       sentinel/v1/+/+/safety/alert      (SafetyAlertMsg → T-CRIT DANGER banner)
 *       sentinel/v1/+/+/safety/heartbeat  (SafetyHeartbeat)
 *     so a T-CRIT still renders when the edge API is down.
 * Watchdog: no heartbeat for > 3 s (or a sensor reporting fault/stale) → PROTECTION DEGRADED.
 *
 * When neither path connects (standalone demo) a clearly-labelled MOCK engine drives the same
 * state, and the demo panel's injections are applied to it.
 */
import mqtt, { type MqttClient } from 'mqtt';
import { EDGE_WS_URL, MQTT_URL, edge } from './api';
import { isForcedMock, mockStatusStore } from './mockStatus';
import { createStore, useStore } from './store';
import { SIGNAL_WORD, TIER_PRIORITY } from './types';
import type { Alert, DemoInjectKind, Health, LiveFrame, LiveSnapshot, SafetyAlertMsg, SafetyHeartbeat, Task, TaskEstimate, Tier } from './types';
import { FAST_SWING_EXPLANATION, mockLiveSnapshot } from '../mocks/edge';
import { mockNow } from '../mocks/world';
import { normAlert, normEstimate, normSnapshot, normTask } from './normalizeEdge';

export type ConnState = 'idle' | 'connecting' | 'open' | 'closed';
export type ProtectionState = 'unknown' | 'active' | 'degraded';

export const HEARTBEAT_TIMEOUT_MS = 3000;

export interface LiveState {
  machineId: string;
  edgeWs: ConnState;
  mqtt: ConnState;
  mockEngine: boolean;
  snapshot: LiveSnapshot | null;
  snapshotAt: number;
  alerts: Alert[];
  heartbeat: { lastAt: number | null; msg: SafetyHeartbeat | null; via: 'mqtt' | 'edge' | 'mock' | null };
  protection: { state: ProtectionState; reason: string | null; lastGoodTs: number | null };
  health: Health | null;
  cloudOffline: boolean;
  outboxBacklog: number;
  waitingForTruck: boolean;
  suppressedIdle: string | null;
  snoozed: Record<string, number>;
  escalationNotice: string | null;
  tcritLatencyMs: number[];
  lastEta: TaskEstimate | null;
  lastTask: Task | null;
}

const initial: LiveState = {
  machineId: 'EX-07',
  edgeWs: 'idle',
  mqtt: 'idle',
  mockEngine: false,
  snapshot: null,
  snapshotAt: 0,
  alerts: [],
  heartbeat: { lastAt: null, msg: null, via: null },
  protection: { state: 'unknown', reason: null, lastGoodTs: null },
  health: null,
  cloudOffline: false,
  outboxBacklog: 0,
  waitingForTruck: false,
  suppressedIdle: null,
  snoozed: {},
  escalationNotice: null,
  tcritLatencyMs: [],
  lastEta: null,
  lastTask: null,
};

export const liveStore = createStore<LiveState>(initial);
export const useLive = () => useStore(liveStore);
const patch = (p: Partial<LiveState> | ((s: LiveState) => Partial<LiveState>)) =>
  liveStore.set((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));

/** JSON.parse that tolerates NaN/Infinity constants (pydantic ser_json_inf_nan="constants"). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/(-?Infinity|NaN)/g, 'null'));
  }
}

// ------------------------------------------------------------------ alerts
function upsertAlert(a: Alert): void {
  liveStore.set((s) => {
    // De-duplicate a T-CRIT that arrives on both paths (MQTT first, then the edge mirror).
    const dupe = s.alerts.find(
      (x) => x.alert_id === a.alert_id || x.event_id === a.alert_id || (a.tier === 'T_CRIT' && x.tier === 'T_CRIT' && !x.cleared_at && (x.what ?? '').toLowerCase() === (a.what ?? '').toLowerCase()),
    );
    if (dupe) {
      return { ...s, alerts: s.alerts.map((x) => (x === dupe ? { ...x, ...a, alert_id: x.alert_id, _via: x._via ?? a._via, provenance: x.provenance.length ? x.provenance : a.provenance } : x)) };
    }
    return { ...s, alerts: [a, ...s.alerts].slice(0, 100) };
  });
}

function clearAlert(id: string, ts?: number): void {
  liveStore.set((s) => ({
    ...s,
    alerts: s.alerts.map((x) => (x.alert_id === id || x.event_id === id ? { ...x, state: 'cleared', cleared_at: ts ?? Date.now() / 1000 } : x)),
  }));
}

function safetyMsgToAlert(m: SafetyAlertMsg): Alert {
  return {
    alert_id: m.alert_id, event_id: m.alert_id, ts: m.ts, machine_id: m.machine_id, operator_id: m.operator_id,
    tier: 'T_CRIT', signal_word: 'DANGER', what: m.what, why: m.why, do: m.do, provenance: ['RULE'],
    state: 'raised', requires_ack: false, dismissible: false, explanation: [], simulated: true, _via: 'mqtt',
  };
}

/** Is the alert eligible for the single in-cab alert slot? T0 never, T4 shows as a chip. */
export function isBannerAlert(a: Alert, snoozed: Record<string, number>): boolean {
  if (a.tier === 'T0' || a.tier === 'T4') return false;
  if (a.state === 'cleared' || a.state === 'suppressed' || a.state === 'queued_post_shift') return false;
  if ((snoozed[a.alert_id] ?? 0) > Date.now()) return false;
  if (a.tier === 'T_CRIT') return !a.cleared_at; // DANGER stays while the condition is true, even if acked
  return a.state === 'raised' || a.state === 'escalated';
}

export function useBannerAlert(): { current: Alert | null; queued: number; supervisorNotified: Alert | null } {
  const s = useLive();
  const eligible = s.alerts
    .filter((a) => a.machine_id === s.machineId || !a.machine_id)
    .filter((a) => isBannerAlert(a, s.snoozed))
    .sort((a, b) => TIER_PRIORITY[b.tier] - TIER_PRIORITY[a.tier] || b.ts - a.ts);
  const t4 = s.alerts.find((a) => a.tier === 'T4' && a.state !== 'cleared') ?? null;
  return { current: eligible[0] ?? null, queued: Math.max(0, eligible.length - 1), supervisorNotified: t4 };
}

export async function acknowledge(alert: Alert): Promise<void> {
  liveStore.set((s) => ({ ...s, alerts: s.alerts.map((x) => (x.alert_id === alert.alert_id ? { ...x, state: 'acknowledged', acked_at: Date.now() / 1000 } : x)) }));
  if (alert._via !== 'mock') await edge.ackAlert(alert.alert_id).catch(() => undefined);
}

/**
 * Snooze a T3 break recommendation (allowed once): edge POST /alerts/{id}/ack {"action":"snooze"}.
 * The alert is hidden locally for `minutes`; the edge's alert manager escalates (T4) if it recurs.
 */
export async function snooze(alert: Alert, minutes: number, escalationNotice: string): Promise<void> {
  patch((s) => ({ snoozed: { ...s.snoozed, [alert.alert_id]: Date.now() + minutes * 60_000 }, escalationNotice }));
  if (alert._via !== 'mock') await edge.ackAlert(alert.alert_id, 'snooze').catch(() => undefined);
}

// ------------------------------------------------------------------ protection watchdog
const startedAt = Date.now();

function evaluateProtection(): void {
  const s = liveStore.get();
  const now = Date.now();
  let state: ProtectionState = 'unknown';
  let reason: string | null = null;
  let lastGoodTs = s.protection.lastGoodTs;
  const age = s.heartbeat.lastAt ? now - s.heartbeat.lastAt : null;
  if (age === null) {
    if (now - startedAt > HEARTBEAT_TIMEOUT_MS) {
      state = 'degraded';
      reason = 'No safety heartbeat received';
    }
  } else if (age > HEARTBEAT_TIMEOUT_MS) {
    state = 'degraded';
    reason = `No safety heartbeat for ${Math.round(age / 1000)} s`;
  } else {
    const bad = Object.entries(s.heartbeat.msg?.sensor_health ?? {}).find(([, v]) => v === 'fault' || v === 'stale');
    if (bad) {
      state = 'degraded';
      reason = `${bad[0]} sensor not responding`;
    } else {
      state = 'active';
      lastGoodTs = Date.now() / 1000;
    }
  }
  if (state !== s.protection.state || reason !== s.protection.reason || lastGoodTs !== s.protection.lastGoodTs) {
    patch({ protection: { state, reason, lastGoodTs } });
  }
}

function onHeartbeat(msg: SafetyHeartbeat, via: 'mqtt' | 'edge' | 'mock'): void {
  const s = liveStore.get();
  if (msg.machine_id && msg.machine_id !== s.machineId) return;
  patch({ heartbeat: { lastAt: Date.now(), msg, via } });
  evaluateProtection();
}

// ------------------------------------------------------------------ edge WebSocket
let ws: WebSocket | null = null;

function onFrame(frame: LiveFrame): void {
  switch (frame.type) {
    case 'snapshot': {
      const snap = normSnapshot(frame.data);
      if (snap.machine_id && snap.machine_id !== liveStore.get().machineId) return;
      patch({ snapshot: snap, snapshotAt: Date.now(), waitingForTruck: snap.waiting_for_truck ?? liveStore.get().waitingForTruck });
      break;
    }
    case 'alert': {
      const al = normAlert(frame.data);
      upsertAlert({ ...al, _via: 'edge', signal_word: al.signal_word || SIGNAL_WORD[al.tier] });
      break;
    }
    case 'alert_cleared':
      clearAlert(frame.data.alert_id, frame.data.ts);
      break;
    case 'eta':
      patch({ lastEta: normEstimate(frame.data) });
      break;
    case 'task':
      patch({ lastTask: normTask(frame.data) });
      break;
    case 'health': {
      const h = frame.data;
      patch({ health: h, cloudOffline: h.cloud === 'offline', outboxBacklog: h.outbox_backlog ?? 0 });
      // The edge mirrors the safety heartbeat; accept it as evidence when MQTT is not reachable.
      if (liveStore.get().mqtt !== 'open' && h.protection === 'active' && (h.safety_heartbeat_age_s ?? 99) < HEARTBEAT_TIMEOUT_MS / 1000) {
        onHeartbeat({ ts: Date.now() / 1000, machine_id: liveStore.get().machineId, rule_version: h.versions?.rules ?? '', sensor_health: h.sensor_health ?? {}, active_alerts: [] }, 'edge');
      }
      break;
    }
    default:
      break;
  }
}

function connectEdgeWs(): void {
  if (ws) return;
  patch({ edgeWs: 'connecting' });
  try {
    ws = new WebSocket(EDGE_WS_URL);
  } catch {
    ws = null;
    patch({ edgeWs: 'closed' });
    setTimeout(connectEdgeWs, 4000);
    return;
  }
  ws.onopen = () => {
    patch({ edgeWs: 'open' });
    stopMockEngine();
  };
  ws.onmessage = (ev) => {
    try {
      onFrame(parseJson(String(ev.data)) as LiveFrame);
    } catch {
      /* ignore malformed frame */
    }
  };
  ws.onclose = () => {
    ws = null;
    patch({ edgeWs: 'closed' });
    setTimeout(connectEdgeWs, 4000);
  };
  ws.onerror = () => ws?.close();
}

// ------------------------------------------------------------------ MQTT over WebSocket
let mq: MqttClient | null = null;
export const TOPIC_ALERTS = 'sentinel/v1/+/+/safety/alert';
export const TOPIC_HEARTBEAT = 'sentinel/v1/+/+/safety/heartbeat';

function connectMqtt(): void {
  if (mq) return;
  patch({ mqtt: 'connecting' });
  try {
    mq = mqtt.connect(MQTT_URL, {
      clientId: `sentinel-web-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 3000,
      connectTimeout: 4000,
      clean: true,
    });
  } catch {
    mq = null;
    patch({ mqtt: 'closed' });
    return;
  }
  mq.on('connect', () => {
    patch({ mqtt: 'open' });
    stopMockEngine();
    mq?.subscribe(TOPIC_ALERTS, { qos: 1 });
    mq?.subscribe(TOPIC_HEARTBEAT, { qos: 0 });
  });
  mq.on('close', () => patch({ mqtt: 'closed' }));
  mq.on('offline', () => patch({ mqtt: 'closed' }));
  mq.on('error', () => patch({ mqtt: 'closed' }));
  mq.on('message', (topic, payload) => {
    let msg: unknown;
    try {
      msg = parseJson(payload.toString());
    } catch {
      return;
    }
    if (topic.endsWith('/safety/heartbeat')) {
      onHeartbeat(msg as SafetyHeartbeat, 'mqtt');
    } else if (topic.endsWith('/safety/alert')) {
      const m = msg as SafetyAlertMsg;
      if (m.machine_id && m.machine_id !== liveStore.get().machineId) return;
      if (m.state === 'raised') {
        upsertAlert(safetyMsgToAlert(m));
        if (m.t_pub_ns) {
          const ms = Date.now() - m.t_pub_ns / 1e6;
          if (ms >= 0 && ms < 60_000) patch((s) => ({ tcritLatencyMs: [...s.tcritLatencyMs, ms].slice(-200) }));
        }
      } else {
        clearAlert(m.alert_id, m.ts);
      }
    }
  });
}

// ------------------------------------------------------------------ mock engine (standalone demo)
interface MockWorld {
  seatbelt: boolean;
  travel: number;
  person: { m: number; sector: 'rear' } | null;
  proxFault: boolean;
  hbPausedUntil: number;
  timers: Array<ReturnType<typeof setTimeout>>;
}
const mw: MockWorld = { seatbelt: true, travel: 0, person: null, proxFault: false, hbPausedUntil: 0, timers: [] };
let mockTimer: ReturnType<typeof setInterval> | null = null;
const mockStart = Date.now();

function mockSnapshot(): LiveSnapshot {
  const base = mockLiveSnapshot();
  const el = (Date.now() - mockStart) / 1000;
  const done = Math.min(420, 143 + el * 0.037);
  const truck = 9.5 + 2.5 * Math.sin(el / 18);
  const s = liveStore.get();
  const sectors = { front: 'clear', right: 'clear', rear: mw.person ? (mw.person.m <= 4 ? 'danger' : 'warning') : 'clear', left: truck < 8 ? 'warning' : 'clear' } as const;
  return {
    ...base,
    ts: mockNow(),
    seatbelt: mw.seatbelt,
    travel_kmh: mw.travel,
    moving: mw.travel > 0.3,
    proximity: {
      ...base.proximity,
      status: mw.proxFault ? 'fault' : 'active',
      sectors: { ...sectors },
      truck_m: +truck.toFixed(1),
      person_m: mw.person?.m ?? null,
      person_sector: mw.person?.sector ?? null,
      last_good_ts: mw.proxFault ? s.snapshot?.proximity.last_good_ts ?? mockNow() : null,
    },
    task: base.task ? { ...base.task, done_qty: +done.toFixed(0), progress_pct: +((done / 420) * 100).toFixed(0), cycles: 58 + Math.floor(el / 24) } : null,
    idle: { today_min: 12, waiting_min: 7 },
    waiting_for_truck: s.waitingForTruck,
    continuous_operation_min: 112 + el / 60,
  };
}

function mockTick(): void {
  patch({ snapshot: mockSnapshot(), snapshotAt: Date.now() });
  if (Date.now() > mw.hbPausedUntil) {
    const active = liveStore.get().alerts.filter((a) => a.tier === 'T_CRIT' && !a.cleared_at).map((a) => a.alert_id);
    onHeartbeat({ ts: mockNow(), machine_id: liveStore.get().machineId, rule_version: 'rules-1.0.0 (mock)', sensor_health: { seatbelt: 'ok', proximity: mw.proxFault ? 'fault' : 'ok', travel: 'ok' }, active_alerts: active }, 'mock');
  }
}

function startMockEngine(): void {
  if (mockTimer) return;
  patch({ mockEngine: true });
  mockTick();
  mockTimer = setInterval(mockTick, 500);
}

function stopMockEngine(): void {
  if (!mockTimer) return;
  clearInterval(mockTimer);
  mockTimer = null;
  mw.timers.forEach(clearTimeout);
  mw.timers = [];
  patch({ mockEngine: false });
}

/** Never overlay mock snapshots on a live edge: only start the engine when the edge is unreachable. */
function startMockEngineIfOffline(): void {
  if (mockStatusStore.get().origins.edge !== 'online') startMockEngine();
}

let mockSeq = 0;
function mockAlert(tier: Tier, what: string, why: string, doText: string, prov: Alert['provenance'], extra: Partial<Alert> = {}): Alert {
  mockSeq += 1;
  const a: Alert = {
    alert_id: `alt_mock_${Date.now().toString(36)}_${mockSeq}`, event_id: `evt_mock_${mockSeq}`, ts: mockNow(), machine_id: liveStore.get().machineId, operator_id: 'OP-1042',
    tier, signal_word: SIGNAL_WORD[tier], what, why, do: doText, provenance: [...prov, 'SIMULATED'], state: 'raised',
    requires_ack: tier === 'T2' || tier === 'T3', dismissible: tier !== 'T_CRIT', explanation: [], simulated: true, _via: 'mock', ...extra,
  };
  upsertAlert(a);
  return a;
}

function later(ms: number, fn: () => void): void {
  mw.timers.push(setTimeout(fn, ms));
}

/** Apply a demo injection to the in-browser mock engine (used when the edge /demo/inject is unreachable). */
export function mockInject(kind: DemoInjectKind): void {
  startMockEngineIfOffline();
  switch (kind) {
    case 'seatbelt_open': {
      mw.seatbelt = false;
      mw.travel = 2.4;
      const a = mockAlert('T_CRIT', 'SEATBELT UNFASTENED — MACHINE MOVING', 'Seat switch open with parking brake released', 'Fasten your seatbelt now', ['RULE']);
      later(9000, () => {
        mw.seatbelt = true;
        mw.travel = 0;
        clearAlert(a.alert_id);
      });
      break;
    }
    case 'person_rear': {
      mw.person = { m: 3.2, sector: 'rear' };
      const a = mockAlert('T_CRIT', 'PERSON IN REAR DANGER ZONE — 3.2 m', 'Proximity sensor, rear sector', 'Stop swing. Confirm the area is clear', ['RULE']);
      later(9000, () => {
        mw.person = null;
        clearAlert(a.alert_id);
      });
      break;
    }
    case 'fast_swing':
      mockAlert('T2', 'FAST SWING NEAR TRUCK', 'Swing 38% above your truck-loading range, within 5 m of truck · 3rd time today', 'Slow the swing when the bucket is near the truck', ['RULE', 'ML'], { explanation: FAST_SWING_EXPLANATION });
      break;
    case 'idle': {
      if (liveStore.get().waitingForTruck) {
        patch({ suppressedIdle: 'Idle 9 m — waiting for truck (not flagged)' });
      } else {
        const a = mockAlert('T1', 'ENGINE IDLING 9 MIN', 'No truck waiting in dispatch', 'Consider shutting down if the wait continues', ['RULE']);
        later(15000, () => clearAlert(a.alert_id));
      }
      break;
    }
    case 'truck_wait':
      patch({ waitingForTruck: true, suppressedIdle: 'Idle 6 m — waiting for truck (not flagged)' });
      break;
    case 'hyd_fault': {
      const a = mockAlert('T1', 'HYDRAULIC PRESSURE SPIKES', 'Seen with 2 operators on this machine — likely machine', 'Report it to maintenance at your next stop', ['RULE', 'ML']);
      later(15000, () => clearAlert(a.alert_id));
      break;
    }
    case 'person_warning': {
      mw.person = { m: 6.4, sector: 'rear' };
      const a = mockAlert('T2', 'PERSON IN REAR WARNING ZONE — 6.4 m', 'Proximity sensor, rear sector', 'Check mirrors before you swing', ['RULE']);
      later(12000, () => {
        mw.person = null;
        clearAlert(a.alert_id);
      });
      break;
    }
    case 'prox_sensor_fault':
      mw.proxFault = true;
      later(15000, () => {
        mw.proxFault = false;
      });
      break;
  }
}

/** Mock of POST /demo/fast-forward-operation: continuous operation jumps past the site limit → T3. */
export function mockFastForward(minutes: number): void {
  startMockEngineIfOffline();
  const h = Math.floor((112 + minutes) / 60);
  const m = Math.round((112 + minutes) % 60);
  mockAlert('T3', 'BREAK RECOMMENDED', `${h} h ${String(m).padStart(2, '0')} m continuous operation (site limit 2 h)`, 'Park safely and take a 10-minute break', ['RULE']);
}

export type LocalPreview = 'break_due' | 'heartbeat_loss' | 'proximity_fault' | 'cloud_offline' | 'clear_all';

/** UI-only previews of states the backend produces on its own timers (5e, 5f, offline). */
export function localPreview(kind: LocalPreview): void {
  switch (kind) {
    case 'break_due':
      mockAlert('T3', 'BREAK RECOMMENDED', '2 h 30 m continuous operation (site limit 2 h)', 'Park safely and take a 10-minute break', ['RULE']);
      break;
    case 'heartbeat_loss':
      startMockEngine();
      mw.hbPausedUntil = Date.now() + 12000;
      break;
    case 'proximity_fault':
      startMockEngine();
      mw.proxFault = true;
      later(15000, () => {
        mw.proxFault = false;
      });
      break;
    case 'cloud_offline':
      patch((s) => ({ cloudOffline: !s.cloudOffline, outboxBacklog: s.cloudOffline ? 0 : 42 }));
      break;
    case 'clear_all':
      mw.seatbelt = true;
      mw.travel = 0;
      mw.person = null;
      mw.proxFault = false;
      mw.hbPausedUntil = 0;
      patch((s) => ({ alerts: s.alerts.map((a) => (a.state === 'cleared' ? a : { ...a, state: 'cleared', cleared_at: Date.now() / 1000 })), suppressedIdle: null, escalationNotice: null, snoozed: {} }));
      break;
  }
}

export async function setWaitingForTruck(on: boolean): Promise<void> {
  patch({ waitingForTruck: on, suppressedIdle: on ? liveStore.get().suppressedIdle : null });
  await edge.taskState(on).catch(() => undefined);
}

// ------------------------------------------------------------------ edge HTTP polling (WS unavailable)
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** When the edge API answers over HTTP but its WebSocket does not, poll snapshot/health/alerts. */
function startEdgePolling(): void {
  if (pollTimer) return;
  let n = 0;
  const tick = async () => {
    n += 1;
    if (liveStore.get().edgeWs === 'open') return;
    const snap = await edge.liveSnapshot().catch(() => null);
    if (snap && mockStatusStore.get().origins.edge === 'online') onFrame({ type: 'snapshot', data: snap });
    if (n % 2 === 0) {
      const h = await edge.health().catch(() => null);
      if (h && mockStatusStore.get().origins.edge === 'online') onFrame({ type: 'health', data: h });
      const active = await edge.alerts(true).catch(() => null);
      if (active && mockStatusStore.get().origins.edge === 'online') {
        const ids = new Set(active.map((a) => a.alert_id));
        active.forEach((a) => upsertAlert({ ...normAlert(a), _via: 'edge' }));
        liveStore.get().alerts.filter((a) => a._via === 'edge' && a.state === 'raised' && !ids.has(a.alert_id)).forEach((a) => clearAlert(a.alert_id));
      }
    }
  };
  void tick();
  pollTimer = setInterval(() => void tick(), 1000);
}

// ------------------------------------------------------------------ lifecycle
let started = false;

export function startLive(machineId = 'EX-07'): void {
  if (started) return;
  started = true;
  patch({ machineId });
  setInterval(evaluateProtection, 500);
  if (isForcedMock()) {
    startMockEngine();
    return;
  }
  connectEdgeWs();
  connectMqtt();
  edge
    .alerts(true)
    .then((list) => list.forEach((a) => upsertAlert({ ...a, _via: a._via ?? 'edge' })))
    .catch(() => undefined);
  edge
    .liveSnapshot()
    .then((snap) => {
      if (!liveStore.get().snapshot) patch({ snapshot: snap, snapshotAt: Date.now() });
    })
    .catch(() => undefined);
  setTimeout(() => {
    const s = liveStore.get();
    if (s.edgeWs === 'open') return;
    if (mockStatusStore.get().origins.edge === 'online') startEdgePolling();
    else if (s.mqtt !== 'open') startMockEngine();
  }, 2500);
}

/** Simulation clock (unix s): the latest snapshot time advanced locally, else the mock clock. */
export function liveNow(): number {
  const s = liveStore.get();
  if (s.snapshot && !s.mockEngine && Date.now() - s.snapshotAt < 10_000) return s.snapshot.ts + (Date.now() - s.snapshotAt) / 1000;
  return mockNow();
}
