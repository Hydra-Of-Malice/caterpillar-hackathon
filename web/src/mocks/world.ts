/**
 * The fictional demo world from docs/implementation-plan.md ("Demo world", all SIMULATED).
 * Times are built in the browser's local timezone so "06:00" always renders as 06:00.
 */
import type { CompetencyCatalogEntry, Machine, Operator, TrainingModule } from '../lib/types';

export const DEMO_Y = 2026;
export const DEMO_M = 8; // September (0-based)
export const DEMO_D = 23;

/** Unix seconds for hh:mm on the demo day (dayOffset for earlier/later shifts). */
export function at(h: number, m = 0, s = 0, dayOffset = 0): number {
  return new Date(DEMO_Y, DEMO_M, DEMO_D + dayOffset, h, m, s).getTime() / 1000;
}

/** Mock clock: starts at 07:52 on the demo day and advances in real time. */
const CLOCK_START = at(7, 52);
const APP_START_MS = Date.now();
export function mockNow(): number {
  return CLOCK_START + (Date.now() - APP_START_MS) / 1000;
}

export const SITE_ID = 'north-quarry';
export const SITE_NAME = 'North Quarry';

export const OPERATORS: Record<string, Operator> = {
  'OP-1042': { operator_id: 'OP-1042', name: 'Ravi Kumar', role: 'operator', experience_months: 3, operating_hours: 212, level: 'novice' },
  'OP-1007': { operator_id: 'OP-1007', name: 'Anita Rao', role: 'operator', experience_years: 9, operating_hours: 14800, level: 'expert' },
  'OP-1019': { operator_id: 'OP-1019', name: 'Joe Mendes', role: 'operator', experience_years: 3, operating_hours: 4100, level: 'intermediate' },
  'OP-1033': { operator_id: 'OP-1033', name: 'Lena Ortiz', role: 'operator', experience_years: 4, operating_hours: 5200, level: 'intermediate' },
  'OP-1051': { operator_id: 'OP-1051', name: 'Sam Okafor', role: 'operator', experience_years: 6, operating_hours: 9300, level: 'experienced' },
  'OP-1060': { operator_id: 'OP-1060', name: 'Mei Chen', role: 'operator', experience_years: 2, operating_hours: 2600, level: 'intermediate' },
};

export const STAFF = {
  supervisor: { id: 'SUP-01', name: 'Priya Nair', initials: 'P.N.' },
  instructor: { id: 'INS-01', name: 'Marcus Lee', initials: 'M.L.' },
};

export const MACHINES: Record<string, Machine> = {
  'EX-07': { machine_id: 'EX-07', model: 'Cat 320 (simulated)', machine_type: 'EX-20t', site_id: SITE_ID, prox_fitted: true },
  'EX-09': { machine_id: 'EX-09', model: 'Cat 320 (simulated)', machine_type: 'EX-20t', site_id: SITE_ID, prox_fitted: true },
};

export const COMPETENCIES: CompetencyCatalogEntry[] = [
  { id: 'C01', label: 'Pre-start inspection & walk-around', safety_critical: false },
  { id: 'C02', label: 'Seatbelt & cab entry/exit', safety_critical: true },
  { id: 'C03', label: 'Safe park & hydraulic lockout', safety_critical: true },
  { id: 'C04', label: 'Approach & swing control near trucks', safety_critical: false },
  { id: 'C05', label: 'Blind-zone & surroundings check', safety_critical: true },
  { id: 'C06', label: 'Travel on slopes & uneven ground', safety_critical: false },
  { id: 'C07', label: 'Working near trench edges', safety_critical: true },
  { id: 'C08', label: 'Load handling & lifting', safety_critical: false },
  { id: 'C09', label: 'Smooth multi-function control', safety_critical: false },
  { id: 'C10', label: 'Idle & fuel-efficient operation', safety_critical: false },
  { id: 'C11', label: 'Travel speed & site traffic rules', safety_critical: true },
  { id: 'C12', label: 'Communication with spotters', safety_critical: false },
  { id: 'C13', label: 'Break & shift-duration discipline', safety_critical: false },
  { id: 'C14', label: 'Warm-up, cool-down & machine care', safety_critical: false },
];

export function competencyLabel(id: string | null | undefined): string {
  if (!id) return '';
  return COMPETENCIES.find((c) => c.id === id)?.label ?? id;
}

/** Competency → primary micro-module (used by coaching tips and gap cards). */
export const COMPETENCY_MODULE: Record<string, string> = {
  C01: 'MOD-PRESTART',
  C02: 'MOD-SEATBELT-CAB',
  C03: 'MOD-SEATBELT-CAB',
  C04: 'MOD-SWING-APPROACH',
  C05: 'MOD-BLIND-ZONE',
  C06: 'MOD-SLOPE-TRAVEL',
  C07: 'MOD-TRENCH-EDGES',
  C08: 'MOD-TRUCK-LOADING',
  C09: 'MOD-SMOOTH-CONTROLS',
  C10: 'MOD-IDLE-FUEL',
};

const SOP = (section: string, text: string, chunk: string) => ({
  chunk_id: chunk,
  doc_id: 'Site SOP-EX-04',
  title: 'Excavator truck loading (SAMPLE SOP, team-authored)',
  section,
  version: 'v1.2',
  text,
});

export const MODULES: TrainingModule[] = [
  {
    module_id: 'MOD-SWING-APPROACH',
    title: 'Approach & Swing Control',
    competency_id: 'C04',
    duration_min: 4,
    format: 'micro_lesson',
    version: 'v1.2',
    approved_by: 'M. Lee',
    approved_at: '12 Aug 2026',
    machine_types: ['EX-20t'],
    summary: 'Control swing speed as the bucket approaches the truck body.',
    steps: ['Expert demonstration', 'Key points', 'Scenario quiz'],
    why_for_you: 'Your fast swings happened within 5 m of the truck, late in the cycle.',
    key_points: [
      {
        text: 'Slow the swing as the bucket approaches the truck body.',
        citations: [SOP('§3.2', 'Reduce swing speed progressively as the bucket approaches the haul truck body; aim to arrive over the body with the swing almost stopped.', 'sop-ex-04#3.2')],
      },
      {
        text: 'Keep the bucket higher than the truck side boards before you swing over them.',
        citations: [SOP('§3.3', 'Raise the bucket clear of the truck side boards before the swing brings it over the body. Do not drag the bucket across the side board.', 'sop-ex-04#3.3')],
      },
      {
        text: 'Never swing the bucket over the truck cab.',
        citations: [SOP('§3.4', 'Position the truck so the bucket never passes over the cab. Load from the side or rear only.', 'sop-ex-04#3.4')],
      },
    ],
  },
  {
    module_id: 'MOD-TRENCH-EDGES',
    title: 'Trenching Near Edges',
    competency_id: 'C07',
    duration_min: 5,
    format: 'micro_lesson',
    version: 'v1.1',
    approved_by: 'M. Lee',
    approved_at: '02 Sep 2026',
    safety_critical: true,
    machine_types: ['EX-20t'],
    summary: 'Edge setback, spoil placement and surcharge loads.',
    steps: ['Site walk-through', 'Key points', 'Scenario quiz'],
    why_for_you: 'Before your first trench task on this site today.',
    key_points: [
      {
        text: 'Keep spoil piles at least 0.6 m back from the trench edge.',
        citations: [{ chunk_id: 'sop-ex-07#2.1', doc_id: 'Site SOP-EX-07', section: '§2.1', version: 'v1.1', title: 'Trenching (SAMPLE SOP)', text: 'Place excavated material at least 0.6 m from the edge of the excavation.' }],
      },
      {
        text: 'Position the machine so the tracks stay outside the edge setback line.',
        citations: [{ chunk_id: 'sop-ex-07#2.3', doc_id: 'Site SOP-EX-07', section: '§2.3', version: 'v1.1', title: 'Trenching (SAMPLE SOP)', text: 'Tracks remain behind the marked setback line throughout trenching.' }],
      },
      {
        text: 'Stop and call your supervisor if the trench wall shows cracks or water.',
        citations: [{ chunk_id: 'sop-ex-07#4.1', doc_id: 'Site SOP-EX-07', section: '§4.1', version: 'v1.1', title: 'Trenching (SAMPLE SOP)', text: 'Signs of wall distress (tension cracks, seepage, spalling) require work to stop and a competent-person inspection.' }],
      },
    ],
  },
  { module_id: 'MOD-SEATBELT-CAB', title: 'Seatbelt & Three Points of Contact', competency_id: 'C02', duration_min: 2, format: 'video', version: 'v1.0', approved_by: 'M. Lee', approved_at: '20 Jul 2026', safety_critical: true, key_points: [], summary: 'Cab entry and exit, fastening before any movement.' },
  { module_id: 'MOD-BLIND-ZONE', title: 'Blind-Zone Awareness', competency_id: 'C05', duration_min: 6, format: 'scenario_quiz', version: 'v1.0', approved_by: 'M. Lee', approved_at: '28 Jul 2026', safety_critical: true, key_points: [], summary: 'Mirror checks and pause-before-motion around the machine.' },
  { module_id: 'MOD-IDLE-FUEL', title: 'Fuel-Efficient Idle Practice', competency_id: 'C10', duration_min: 3, format: 'micro_lesson', version: 'v1.0', approved_by: 'M. Lee', approved_at: '05 Aug 2026', key_points: [], summary: 'When to shut down, and how auto-idle helps.' },
  { module_id: 'MOD-SLOPE-TRAVEL', title: 'Slope Travel Basics', competency_id: 'C06', duration_min: 5, format: 'simulator', version: 'v0.9', approved_by: 'M. Lee', approved_at: '11 Aug 2026', key_points: [], summary: 'Travel direction, attachment height and speed on grades.' },
  { module_id: 'MOD-SMOOTH-CONTROLS', title: 'Smooth Multi-Function Control', competency_id: 'C09', duration_min: 8, format: 'simulator', version: 'v1.0', approved_by: 'M. Lee', approved_at: '15 Aug 2026', key_points: [], summary: 'Blend boom, stick and swing in one flowing motion.' },
  { module_id: 'MOD-PRESTART', title: 'Pre-Start Walk-Around', competency_id: 'C01', duration_min: 4, format: 'video', version: 'v1.3', approved_by: 'M. Lee', approved_at: '01 Jul 2026', key_points: [], summary: 'What to check, in order, before key-on.' },
  { module_id: 'MOD-TRUCK-LOADING', title: 'Truck Loading Technique', competency_id: 'C08', duration_min: 6, format: 'simulator', version: 'v1.0', approved_by: 'M. Lee', approved_at: '18 Aug 2026', key_points: [], summary: 'Bench height, truck spotting and even load placement.' },
];

export function moduleTitle(id: string | null | undefined): string {
  if (!id) return '';
  return MODULES.find((m) => m.module_id === id)?.title ?? id;
}
