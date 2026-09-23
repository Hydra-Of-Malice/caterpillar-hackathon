/**
 * Edge API fixtures (port 8000) for the Ravi demo world. Mutations update in-memory state so a
 * standalone demo stays coherent (sign off checklist → start shift → log incident → review).
 */
import type {
  Alert,
  ChecklistItem,
  ChecklistResult,
  ChecklistSubmitResponse,
  Conditions,
  EtaPreviewRequest,
  FeatureContribution,
  Health,
  Incident,
  LiveSnapshot,
  ShiftCurrent,
  ShiftReview,
  SyncStatus,
  Task,
  TaskEstimate,
} from '../lib/types';
import { MACHINES, OPERATORS, SITE_ID, at, mockNow } from './world';

const SHIFT_ID = 'SH-2026-09-23-EX07-D';

// ------------------------------------------------------------------ tasks and estimates
export function estimateFor(taskId: string): TaskEstimate {
  switch (taskId) {
    case 'T-1':
      return {
        task_id: 'T-1', p10_min: 160, p50_min: 190, p90_min: 235, nominal_coverage: 0.8,
        remaining_p10_min: 103, remaining_p50_min: 133, remaining_p90_min: 178,
        drivers: [
          { factor: 'material', delta_min: 4, label: 'Clay-gravel material' },
          { factor: 'operator_experience', delta_min: 9, label: 'Operator experience 212 h' },
          { factor: 'machine', delta_min: -6, label: '320 machine size' },
          { factor: 'rain', delta_min: 0, label: 'Rain from 13:00 — not affecting this task' },
        ],
        n_similar: 52, low_data: false, model_version: 'tasktime-lgbm-q-0.3.0', provenance: ['ML', 'SIMULATED'],
      };
    case 'T-2':
      return {
        task_id: 'T-2', p10_min: 100, p50_min: 125, p90_min: 170, nominal_coverage: 0.8,
        remaining_p10_min: 100, remaining_p50_min: 125, remaining_p90_min: 170,
        drivers: [
          { factor: 'first_on_site', delta_min: 12, label: 'First trench on this site for operator' },
          { factor: 'rain', delta_min: 8, label: 'Rain from 13:00' },
          { factor: 'material', delta_min: 4, label: 'Clay-gravel material' },
          { factor: 'machine', delta_min: -6, label: '320 machine size' },
        ],
        n_similar: 37, low_data: false, model_version: 'tasktime-lgbm-q-0.3.0', provenance: ['ML', 'SIMULATED'],
      };
    default:
      return {
        task_id: taskId, p10_min: 30, p50_min: 40, p90_min: 55, nominal_coverage: 0.8,
        remaining_p10_min: 30, remaining_p50_min: 40, remaining_p90_min: 55,
        drivers: [{ factor: 'task_type', delta_min: 0, label: 'Typical stockpile tidy' }],
        n_similar: 11, low_data: true, model_version: 'tasktime-lgbm-q-0.3.0', provenance: ['ML', 'SIMULATED'],
      };
  }
}

let tasks: Task[] = [
  {
    task_id: 'T-1', shift_id: SHIFT_ID, priority: 1, type: 'truck_loading', name: 'Truck Loading, Bench 3',
    location: 'Bench 3', zone: 'TL-1', planned_qty: 420, unit: 'm³', done_qty: 143, progress_pct: 34,
    status: 'in_progress', material: 'clay-gravel', started_at: at(6, 20), note: 'Haul trucks HT-12, HT-14',
  },
  {
    task_id: 'T-2', shift_id: SHIFT_ID, priority: 2, type: 'trenching', name: 'Trench Excavation T-4',
    location: 'Drainage line T-4', zone: 'TR-4', planned_qty: 60, unit: 'm', done_qty: 0, progress_pct: 0,
    status: 'queued', material: 'clay-gravel', first_on_site: true, required_module: 'MOD-TRENCH-EDGES',
    required_module_title: 'Trenching near edges', spotter_assigned: true, note: '60 m × 1.5 m deep',
  },
  {
    task_id: 'T-3', shift_id: SHIFT_ID, priority: 3, type: 'stockpile', name: 'Stockpile Tidy',
    location: 'Pad 4', zone: null, planned_qty: 1, unit: 'job', done_qty: 0, progress_pct: 0,
    status: 'queued', material: 'mixed', planned_duration_min: 40,
  },
];

export function mockTasks(): Task[] {
  return tasks.map((t) => ({ ...t, estimate: estimateFor(t.task_id) }));
}

export function mockPatchTask(id: string, patch: Partial<Task>): Task {
  tasks = tasks.map((t) => (t.task_id === id ? { ...t, ...patch } : t));
  return mockTasks().find((t) => t.task_id === id)!;
}

export function mockEtaPreview(req: EtaPreviewRequest): TaskEstimate {
  const perUnit: Record<string, number> = { truck_loading: 0.45, trenching: 1.75, stockpile: 40, grading: 0.6 };
  const materialDelta: Record<string, number> = { 'clay-gravel': 4, rock: 14, topsoil: -5 };
  const base = (perUnit[req.task_type] ?? 1) * (req.task_type === 'stockpile' ? 1 : req.qty);
  const drivers = [
    { factor: 'rain', delta_min: 8, label: 'Rain from 13:00' },
    ...(req.task_type === 'trenching' && req.operator_id === 'OP-1042'
      ? [{ factor: 'first_on_site', delta_min: 12, label: 'First trench on this site for operator' }]
      : []),
    { factor: 'material', delta_min: materialDelta[req.material] ?? 0, label: `${req.material} material` },
    { factor: 'machine', delta_min: -6, label: '320 machine size' },
  ];
  const p50 = Math.max(10, base + drivers.reduce((a, d) => a + d.delta_min, 0));
  const lowData = req.task_type === 'grading' || req.material === 'rock';
  const spreadLo = lowData ? 0.62 : 0.8;
  const spreadHi = lowData ? 1.65 : 1.36;
  return {
    task_id: 'preview',
    p10_min: Math.round(p50 * spreadLo),
    p50_min: Math.round(p50),
    p90_min: Math.round(p50 * spreadHi),
    nominal_coverage: 0.8,
    drivers,
    n_similar: lowData ? 4 : req.task_type === 'trenching' ? 37 : 52,
    low_data: lowData,
    model_version: 'tasktime-lgbm-q-0.3.0',
    provenance: ['ML', 'SIMULATED'],
  };
}

// ------------------------------------------------------------------ shift
const conditions: Conditions = {
  temp_c: 31, dust: 'moderate', rain_from: '13:00', forecast: 'Light rain from 13:00',
  visibility: 'good', lighting: 'daylight', updated_ts: at(7, 40), stale_s: 720, provenance: ['MOCK'],
};

const shiftState = {
  status: 'planned' as ShiftCurrent['shift']['status'],
  privacyAck: false,
  checklist: { completed: true, passed: true, total: 14, passed_count: 14, failed_count: 0, signed_at: at(5, 52), signed_by: 'Ravi K.' },
  startedAt: at(6, 0) as number | null,
  lastBreak: at(6, 0) as number | null,
};

export function mockShiftCurrent(): ShiftCurrent {
  const now = mockNow();
  return {
    shift: {
      shift_id: SHIFT_ID, date: '2026-09-23', planned_start_ts: at(6, 0), planned_end_ts: at(14, 30),
      started_at: shiftState.startedAt, status: shiftState.status === 'planned' ? 'active' : shiftState.status,
      site_id: SITE_ID, location: 'North Quarry, Bench 3', privacy_ack: shiftState.privacyAck,
    },
    operator: OPERATORS['OP-1042'],
    machine: MACHINES['EX-07'],
    tasks: mockTasks(),
    conditions: { ...conditions, stale_s: Math.round(now - conditions.updated_ts) },
    checklist_status: shiftState.checklist,
    continuous_operation_min: shiftState.lastBreak ? Math.round((now - shiftState.lastBreak) / 60) : 0,
    last_break_ts: shiftState.lastBreak,
  };
}

export function mockConditions(): Conditions {
  return { ...conditions, stale_s: Math.round(mockNow() - conditions.updated_ts) };
}

export function mockPrivacyAck(): { ok: boolean } {
  shiftState.privacyAck = true;
  return { ok: true };
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'wa_tracks', group: 'Walk-around', label: 'Tracks & rollers', hint: 'Tension, sprocket wear, no debris or damage', critical: false },
  { id: 'wa_hoses', group: 'Walk-around', label: 'Hoses & fittings', hint: 'No leaks, chafing or weeping at boom and stick joints', critical: true },
  { id: 'wa_bucket', group: 'Walk-around', label: 'Bucket, teeth & pins', hint: 'Pins seated and locked, teeth intact', critical: false },
  { id: 'wa_mirrors', group: 'Walk-around', label: 'Mirrors & cameras clean', hint: 'All mirrors adjusted, lenses clean', critical: false },
  { id: 'wa_lights', group: 'Walk-around', label: 'Lights', hint: 'Work lights and beacon working', critical: false },
  { id: 'wa_extinguisher', group: 'Walk-around', label: 'Fire extinguisher present', hint: 'Mounted, charged, pin in place', critical: true },
  { id: 'cc_seatbelt', group: 'Cab & controls', label: 'Seatbelt latches and retracts', hint: 'Buckle clicks, webbing not frayed', critical: true },
  { id: 'cc_horn', group: 'Cab & controls', label: 'Horn works', hint: 'Test before moving', critical: false },
  { id: 'cc_travel_alarm', group: 'Cab & controls', label: 'Travel alarm works', hint: 'Audible when travelling', critical: true },
  { id: 'cc_lockout', group: 'Cab & controls', label: 'Hydraulic lockout lever works', hint: 'Lever down stops all implement movement', critical: true },
  { id: 'ss_seatbelt_sensor', group: 'Safety systems', label: 'Seatbelt sensor reads FASTENED', hint: 'Fasten your belt and check the live value', critical: true, live_signal: 'seatbelt' },
  { id: 'ss_proximity', group: 'Safety systems', label: 'Proximity sensing self-test', hint: 'All four sectors report', critical: false, live_signal: 'proximity' },
  { id: 'ss_protection', group: 'Safety systems', label: 'CAT Sentinel protection self-test', hint: 'Safety process heartbeat and rule version', critical: true, live_signal: 'protection' },
  { id: 'sc_ground', group: 'Site conditions', label: 'Ground conditions & overhead hazards reviewed', hint: 'Toolbox talk done with the supervisor', critical: false },
];

let incidents: Incident[] = [];

export function mockSubmitChecklist(results: ChecklistResult[]): ChecklistSubmitResponse {
  const failedCritical = results
    .filter((r) => r.result === 'fail')
    .map((r) => r.item_id)
    .filter((id) => CHECKLIST_ITEMS.find((i) => i.id === id)?.critical);
  const incidentIds: string[] = [];
  results
    .filter((r) => r.result === 'fail')
    .forEach((r) => {
      const item = CHECKLIST_ITEMS.find((i) => i.id === r.item_id);
      const inc = mockCreateIncident({
        type: 'checklist_defect',
        severity: item?.critical ? 'high' : 'medium',
        note: `${item?.label ?? r.item_id}: ${r.note || 'defect reported'}`,
        source: 'manual',
      });
      incidentIds.push(inc.incident_id);
    });
  const passedCount = results.filter((r) => r.result !== 'fail').length;
  shiftState.checklist = {
    completed: results.length >= CHECKLIST_ITEMS.length,
    passed: failedCritical.length === 0,
    total: CHECKLIST_ITEMS.length,
    passed_count: passedCount,
    failed_count: results.length - passedCount,
    signed_at: mockNow(),
    signed_by: 'Ravi K.',
  };
  return { passed: failedCritical.length === 0, failed_critical: failedCritical, incident_ids: incidentIds };
}

export function mockStartShift(): { ok: boolean; status: number; detail?: string } {
  if (!shiftState.checklist.completed) return { ok: false, status: 409, detail: 'Checklist incomplete' };
  if (!shiftState.checklist.passed) return { ok: false, status: 409, detail: 'A critical checklist item failed' };
  shiftState.status = 'active';
  shiftState.startedAt = shiftState.startedAt ?? mockNow();
  return { ok: true, status: 200 };
}

export function mockEndShift(): { ok: boolean } {
  shiftState.status = 'ended';
  return { ok: true };
}

export function mockBreakStart(): { ok: boolean; break_id: string; started_at: number } {
  return { ok: true, break_id: 'BRK-1', started_at: mockNow() };
}

export function mockBreakEnd(): { ok: boolean } {
  shiftState.lastBreak = mockNow();
  return { ok: true };
}

// ------------------------------------------------------------------ alerts
export const FAST_SWING_EXPLANATION: FeatureContribution[] = [
  { feature: 'swing_dps_p95_near_truck', label: 'Swing rate near truck', value: 33.1, baseline_mean: 24, baseline_std: 3, z: 3.0, unit: '°/s', direction: 'high' },
  { feature: 'bucket_to_truck_min_m', label: 'Bucket-to-truck distance', value: 1.1, baseline_mean: 2.2, baseline_std: 0.45, z: -2.4, unit: 'm', direction: 'low' },
  { feature: 'approach_speed_mps', label: 'Approach speed', value: 1.9, baseline_mean: 1.2, baseline_std: 0.3, z: 2.3, unit: 'm/s', direction: 'high' },
];

export const SAMPLE_ALERTS: Alert[] = [
  {
    alert_id: 'alt_mock_0631', event_id: 'evt_mock_0631', ts: at(6, 31), machine_id: 'EX-07', operator_id: 'OP-1042',
    tier: 'T1', signal_word: 'CAUTION', what: 'Swing speed near truck', why: 'Above your truck-loading range', do: 'Slow the swing near the truck',
    provenance: ['RULE', 'ML'], state: 'cleared', requires_ack: false, dismissible: true, cleared_at: at(6, 31, 40), explanation: FAST_SWING_EXPLANATION, simulated: true,
  },
  {
    alert_id: 'alt_mock_0612', event_id: 'evt_mock_0612', ts: at(6, 12), machine_id: 'EX-07', operator_id: 'OP-1042',
    tier: 'T_CRIT', signal_word: 'DANGER', what: 'Seatbelt unfastened while moving', why: 'Seat switch open with parking brake released', do: 'Fasten your seatbelt now',
    provenance: ['RULE'], state: 'cleared', requires_ack: false, dismissible: false, cleared_at: at(6, 12, 4), explanation: [], simulated: true,
  },
  {
    alert_id: 'alt_mock_0708', event_id: 'evt_mock_0708', ts: at(7, 8), machine_id: 'EX-07', operator_id: 'OP-1042',
    tier: 'T2', signal_word: 'WARNING', what: 'Fast swing near truck', why: 'Swing 38% above your truck-loading range', do: 'Slow the swing when the bucket is near the truck',
    provenance: ['RULE', 'ML'], state: 'acknowledged', requires_ack: true, dismissible: true, acked_at: at(7, 8, 6), explanation: FAST_SWING_EXPLANATION, simulated: true,
  },
];

export function mockAlerts(activeOnly: boolean): Alert[] {
  const list = [...SAMPLE_ALERTS].sort((a, b) => b.ts - a.ts);
  return activeOnly ? list.filter((a) => a.state === 'raised') : list;
}

// ------------------------------------------------------------------ incidents
function snapshotSeries(kind: string, seed: number): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (let i = -30; i <= 30; i++) {
    const t = i;
    const w = Math.sin((i + seed) / 3.1);
    const near = Math.exp(-(i * i) / 40);
    out.push({
      t,
      swing_dps: +(kind === 'fast_swing_near_truck' ? 18 + 16 * near + 3 * w : 12 + 6 * Math.abs(w)).toFixed(1),
      travel_kmh: +(kind === 'seatbelt_unfastened_moving' ? (i > -4 && i < 12 ? 2.6 : 0.2) : 0.1 + 0.1 * Math.abs(w)).toFixed(2),
      prox_m: +(kind === 'person_in_danger_zone' ? 9 - 5.8 * near : kind === 'fast_swing_near_truck' ? 6 - 3.6 * near : 12 + 2 * w).toFixed(2),
    });
  }
  return out;
}

function mkIncident(p: Partial<Incident> & Pick<Incident, 'incident_id' | 'ts' | 'type' | 'severity' | 'source'>): Incident {
  return {
    site_id: SITE_ID,
    machine_id: 'EX-07',
    operator_id: 'OP-1042',
    shift_id: SHIFT_ID,
    signal_word: null,
    event_ids: [],
    context: {},
    snapshot: snapshotSeries(p.type, p.ts % 7),
    note: null,
    operator_note: null,
    dispute_status: 'none',
    status: 'open',
    simulated: true,
    ...p,
  };
}

incidents = [
  mkIncident({ incident_id: 'inc_0612', ts: at(6, 12), type: 'seatbelt_unfastened_moving', severity: 'high', source: 'auto', signal_word: 'DANGER', provenance: ['RULE'], context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', travel_kmh: 2.6, rule_id: 'R-SEATBELT-01', rule_version: 'rules-1.0.0' }, competency_ids: ['C02'], status: 'reviewed', note: 'Cleared in 4 s' }),
  mkIncident({ incident_id: 'inc_0631', ts: at(6, 31), type: 'fast_swing_near_truck', severity: 'low', source: 'auto', signal_word: 'CAUTION', provenance: ['RULE', 'ML'], explanation: FAST_SWING_EXPLANATION, context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', truck: 'HT-12' }, competency_ids: ['C04'] }),
  mkIncident({ incident_id: 'inc_0708', ts: at(7, 8), type: 'fast_swing_near_truck', severity: 'medium', source: 'auto', signal_word: 'WARNING', provenance: ['RULE', 'ML'], explanation: FAST_SWING_EXPLANATION, context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', truck: 'HT-14' }, competency_ids: ['C04'], operator_note: 'Truck driver reversed early', dispute_status: 'disputed' }),
  mkIncident({ incident_id: 'inc_0721', ts: at(7, 21), type: 'excessive_idle', severity: 'low', source: 'auto', signal_word: 'CAUTION', provenance: ['RULE'], context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', idle_min: 9, waiting_for_truck: false }, competency_ids: ['C10'] }),
  mkIncident({ incident_id: 'inc_0733', ts: at(7, 33), type: 'near_miss', severity: 'medium', source: 'manual', signal_word: 'NOTICE', provenance: ['MANUAL'], context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', machine_state: 'swinging, 0 km/h' }, note: 'Light vehicle drove through loading zone without radio call', attachments: [{ kind: 'voice', label: 'Voice note 0:18', mock: true }] }),
  mkIncident({ incident_id: 'inc_0744', ts: at(7, 44), type: 'fast_swing_near_truck', severity: 'medium', source: 'auto', signal_word: 'WARNING', provenance: ['RULE', 'ML'], explanation: FAST_SWING_EXPLANATION, context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', truck: 'HT-12' }, competency_ids: ['C04'] }),
  mkIncident({ incident_id: 'inc_y1', ts: at(13, 5, 0, -1), machine_id: 'EX-09', operator_id: 'OP-1019', type: 'person_in_danger_zone', severity: 'high', source: 'auto', signal_word: 'DANGER', provenance: ['RULE'], context: { task: 'Truck Loading, Bench 2', zone: 'TL-2', person_m: 3.4, sector: 'rear' }, competency_ids: ['C05'], status: 'closed' }),
  mkIncident({ incident_id: 'inc_y2', ts: at(11, 40, 0, -1), machine_id: 'EX-09', operator_id: 'OP-1019', type: 'hydraulic_pressure_spikes', severity: 'medium', source: 'auto', signal_word: 'CAUTION', provenance: ['ML', 'RULE'], context: { task: 'Truck Loading, Bench 2', attribution: 'machine', dtc: ['HYD-1204'] }, status: 'reviewed', note: 'Seen across 2 operators — attributed to machine' }),
  mkIncident({ incident_id: 'inc_y3', ts: at(10, 2, 0, -1), machine_id: 'EX-07', operator_id: 'OP-1033', type: 'excessive_idle', severity: 'low', source: 'auto', signal_word: 'CAUTION', provenance: ['RULE'], context: { task: 'Stockpile Tidy', idle_min: 11 }, competency_ids: ['C10'], status: 'closed' }),
  mkIncident({ incident_id: 'inc_y4', ts: at(9, 15, 0, -1), machine_id: 'EX-07', operator_id: 'OP-1042', type: 'fast_swing_near_truck', severity: 'low', source: 'auto', signal_word: 'CAUTION', provenance: ['RULE', 'ML'], explanation: FAST_SWING_EXPLANATION, context: { task: 'Truck Loading, Bench 3', zone: 'TL-1' }, competency_ids: ['C04'], status: 'reviewed' }),
  mkIncident({ incident_id: 'inc_y5', ts: at(8, 3, 0, -1), machine_id: 'EX-09', operator_id: 'OP-1007', type: 'machine_fault', severity: 'medium', source: 'manual', signal_word: 'NOTICE', provenance: ['MANUAL'], context: { task: 'Trench Excavation T-2', dtc: ['ENG-0211'] }, note: 'Coolant warning light at start-up', status: 'closed' }),
  mkIncident({ incident_id: 'inc_y6', ts: at(7, 12, 0, -1), machine_id: 'EX-07', operator_id: 'OP-1042', type: 'fast_swing_near_truck', severity: 'low', source: 'auto', signal_word: 'CAUTION', provenance: ['RULE', 'ML'], explanation: FAST_SWING_EXPLANATION, context: { task: 'Truck Loading, Bench 3', zone: 'TL-1' }, competency_ids: ['C04'], status: 'reviewed' }),
];

export function mockIncidents(filters: Record<string, string | undefined> = {}): Incident[] {
  return incidents
    .filter((i) => !filters.signal_word || i.signal_word === filters.signal_word)
    .filter((i) => !filters.type || i.type === filters.type)
    .filter((i) => !filters.status || i.status === filters.status)
    .filter((i) => !filters.operator_id || i.operator_id === filters.operator_id)
    .filter((i) => !filters.source || (filters.source === 'MANUAL' ? i.source === 'manual' : (i.provenance ?? []).includes(filters.source as never)))
    .sort((a, b) => b.ts - a.ts);
}

export function mockIncident(id: string): Incident | undefined {
  return incidents.find((i) => i.incident_id === id);
}

export function mockCreateIncident(body: Partial<Incident>): Incident {
  const inc = mkIncident({
    incident_id: `inc_${Math.random().toString(16).slice(2, 14)}`,
    ts: mockNow(),
    type: body.type ?? 'near_miss',
    severity: body.severity ?? 'medium',
    source: body.source ?? 'manual',
    signal_word: body.signal_word ?? 'NOTICE',
    provenance: ['MANUAL'],
    context: { task: 'Truck Loading, Bench 3', zone: 'TL-1', machine_state: 'swinging, 0 km/h', ...(body.context ?? {}) },
    note: body.note ?? null,
    attachments: body.attachments,
  });
  incidents = [inc, ...incidents];
  return inc;
}

export function mockPatchIncident(id: string, patch: Partial<Incident>): Incident | undefined {
  incidents = incidents.map((i) => (i.incident_id === id ? { ...i, ...patch } : i));
  return mockIncident(id);
}

// ------------------------------------------------------------------ health / sync / live
export const mockSync = { online: true, backlog: 0 };

export function mockHealth(): Health {
  return {
    status: 'ok',
    safety_heartbeat_age_s: 0.4,
    protection: 'active',
    broker: 'connected',
    cloud: mockSync.online ? 'online' : 'offline',
    outbox_backlog: mockSync.backlog,
    versions: { rules: 'rules-1.0.0', models: { iforest: 'iforest-0.2.1', tasktime: 'tasktime-lgbm-q-0.3.0', expert: 'expert-motion-0.1.0' } },
    rule_latency_ms: { p50: 1.8, p99: 4.1 },
  };
}

export function mockSyncStatus(): SyncStatus {
  return { online: mockSync.online, backlog: mockSync.backlog, last_sync_ts: mockNow() - (mockSync.online ? 3 : 240) };
}

export function mockLiveSnapshot(): LiveSnapshot {
  return {
    ts: mockNow(),
    machine_id: 'EX-07',
    seatbelt: true,
    proximity: { fitted: true, status: 'active', sectors: { front: 'clear', right: 'clear', rear: 'clear', left: 'clear' }, truck_m: 9.5, truck_id: 'HT-12', truck_sector: 'left', person_m: null, person_sector: null },
    travel_kmh: 0,
    idle: { today_min: 12, waiting_min: 7 },
    task: { task_id: 'T-1', name: 'Truck Loading, Bench 3', type: 'truck_loading', done_qty: 143, planned_qty: 420, unit: 'm³', progress_pct: 34, cycles: 58, avg_cycle_s: 24 },
    eta: estimateFor('T-1'),
    waiting_for_truck: false,
    continuous_operation_min: 112,
    moving: false,
  };
}

// ------------------------------------------------------------------ post-shift review
export function mockShiftReview(): ShiftReview {
  const task = (t0: number, t1: number, label: string, task_type: Task['type']) => ({ kind: 'task' as const, t_start: t0, t_end: t1, label, task_type });
  const alert = (a: Alert) => ({ kind: 'alert' as const, t_start: a.ts, label: a.what, alert: a });
  const mk = (h: number, m: number, tier: Alert['tier'], what: string, why: string, doText: string, prov: Alert['provenance']): Alert => ({
    alert_id: `alt_rev_${h}${m}`, event_id: `evt_rev_${h}${m}`, ts: at(h, m), machine_id: 'EX-07', operator_id: 'OP-1042', tier,
    signal_word: tier === 'T_CRIT' ? 'DANGER' : tier === 'T1' ? 'CAUTION' : 'WARNING', what, why, do: doText, provenance: prov,
    state: 'cleared', requires_ack: tier === 'T2', dismissible: tier !== 'T_CRIT', explanation: tier === 'T2' || tier === 'T1' ? FAST_SWING_EXPLANATION : [], simulated: true,
  });
  const flagged = new Set([12, 19, 27, 33, 38]);
  return {
    shift_id: SHIFT_ID,
    date: 'Tue 23 Sep',
    totals: { operating_min: 460, tasks_done: 2, tasks_total: 3, material_m3: 420, idle_min: 38 },
    idle_breakdown: { waiting_min: 24, warmup_min: 9, unexplained_min: 5 },
    alerts_by_signal_word: { DANGER: 1, WARNING: 3, CAUTION: 2 },
    well_done: ['Smooth bucket control — steadier than your last 5 shifts', 'Pre-shift check on time', 'Waited correctly for trucks — 24 min idle not flagged'],
    focus: {
      competency_id: 'C04',
      title: 'Swing speed near the truck.',
      detail: 'Fast swings within 5 m of the truck happened 5 times today and 2 times in your previous shift, mostly late in the loading cycle.',
      evidence_line: 'Based on 7 events across 2 shifts (7 of 81 loading cycles)',
      module_id: 'MOD-SWING-APPROACH',
      module_title: 'Approach & Swing Control',
      provenance: ['ML', 'RULE'],
      per_cycle: Array.from({ length: 42 }, (_, i) => {
        const c = i + 1;
        const base = 21 + 3 * Math.sin(c / 2.3) + (c % 5) * 0.6;
        return { cycle: c, value: +(flagged.has(c) ? base + 9 + (c % 3) : base).toFixed(1), flagged: flagged.has(c) };
      }),
      band: { lo: 18, hi: 28, unit: '°/s', label: 'Your normal band' },
    },
    timeline: [
      task(at(6, 0), at(6, 20), 'Warm-up & walk-around', 'stockpile'),
      task(at(6, 20), at(9, 40), 'Truck Loading, Bench 3', 'truck_loading'),
      { kind: 'break', t_start: at(9, 40), t_end: at(9, 55), label: 'Break' },
      task(at(9, 55), at(12, 20), 'Trench Excavation T-4', 'trenching'),
      { kind: 'break', t_start: at(12, 20), t_end: at(12, 50), label: 'Lunch' },
      task(at(12, 50), at(14, 20), 'Trench Excavation T-4 (cont.)', 'trenching'),
      { kind: 'idle', t_start: at(7, 15), t_end: at(7, 24), label: 'Idle — waiting for truck' },
      alert(mk(6, 12, 'T_CRIT', 'Seatbelt unfastened while moving', 'Seat switch open with parking brake released', 'Fasten your seatbelt now', ['RULE'])),
      alert(mk(6, 31, 'T1', 'Swing speed near truck', 'Above your truck-loading range', 'Slow the swing near the truck', ['RULE', 'ML'])),
      alert(mk(7, 8, 'T2', 'Fast swing near truck', 'Swing 38% above your truck-loading range', 'Slow the swing when the bucket is near the truck', ['RULE', 'ML'])),
      alert(mk(7, 21, 'T1', 'Engine idling 9 min', 'No truck waiting in dispatch', 'Consider shutting down if the wait continues', ['RULE'])),
      alert(mk(7, 44, 'T2', 'Fast swing near truck', 'Swing 35% above your truck-loading range', 'Slow the swing when the bucket is near the truck', ['RULE', 'ML'])),
      alert(mk(9, 22, 'T2', 'Fast swing near truck', '3rd time today, within 5 m of truck', 'Slow the swing when the bucket is near the truck', ['RULE', 'ML'])),
    ],
  };
}
