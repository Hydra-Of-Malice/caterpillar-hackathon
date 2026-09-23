/**
 * Demo triggers shared by the hidden demo panel (key "D") and the Demo Tour. Each calls the edge
 * DEMO_MODE endpoint; if the edge is unreachable the same effect is applied to the in-browser
 * MOCK engine so the demo still works standalone.
 */
import { edge } from './api';
import { liveStore, localPreview, mockFastForward, mockInject } from './live';
import type { DemoInjectKind } from './types';

export type TriggerResult = 'live' | 'mock';

export const INJECTIONS: Array<{ kind: DemoInjectKind; label: string; icon: string; expect: string }> = [
  { kind: 'seatbelt_open', label: 'Seatbelt open while moving', icon: 'airline_seat_recline_normal', expect: '5a DANGER — seatbelt' },
  { kind: 'person_rear', label: 'Person in rear danger zone', icon: 'person_alert', expect: '5b DANGER — proximity' },
  { kind: 'person_warning', label: 'Person in warning zone', icon: 'person', expect: 'WARNING — proximity 8 m ring' },
  { kind: 'fast_swing', label: 'Fast swing near truck', icon: 'rotate_right', expect: '5c WARNING (T2) + WHY bars' },
  { kind: 'idle', label: 'Excessive idle', icon: 'timer_pause', expect: '5d CAUTION (T1), or suppressed if waiting' },
  { kind: 'truck_wait', label: 'Waiting for truck', icon: 'local_shipping', expect: 'Idle suppressed — "not flagged"' },
  { kind: 'hyd_fault', label: 'Hydraulic fault (machine)', icon: 'build', expect: 'Machine-attributed, not coaching' },
  { kind: 'prox_sensor_fault', label: 'Proximity sensor fault', icon: 'sensors_off', expect: '5f PROTECTION DEGRADED' },
];

export async function triggerInject(kind: DemoInjectKind): Promise<TriggerResult> {
  const r = await edge.demoInject(kind).catch(() => ({ mock: true }));
  if ((r as { mock?: boolean }).mock) {
    mockInject(kind);
    return 'mock';
  }
  return 'live';
}

export async function triggerWan(up: boolean): Promise<TriggerResult> {
  const r = await edge.demoWan(up).catch(() => ({ mock: true }));
  if ((r as { mock?: boolean }).mock) {
    if (liveStore.get().cloudOffline === up) localPreview('cloud_offline');
    return 'mock';
  }
  return 'live';
}

export async function triggerFastForward(minutes = 150): Promise<TriggerResult> {
  const r = await edge.demoFastForward(minutes).catch(() => ({ mock: true }));
  if ((r as { mock?: boolean }).mock) {
    mockFastForward(minutes);
    return 'mock';
  }
  return 'live';
}

export async function triggerScenario(name: string, speed: number): Promise<TriggerResult> {
  const r = await edge.demoScenario(name, speed).catch(() => ({ mock: true }));
  return (r as { mock?: boolean }).mock ? 'mock' : 'live';
}
