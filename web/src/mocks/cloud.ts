/**
 * Cloud API fixtures (port 8100): profile & competencies, training, copilot (RAG), bookings,
 * re-assessment, supervisor, idle/behaviour, instructor, monitoring. All SIMULATED or MOCK.
 */
import type {
  AlertRates,
  Booking,
  BookingRequest,
  CompetencyEntry,
  CompetencyState,
  ContentReviewItem,
  CopilotAnswer,
  CrewSummary,
  DriftReport,
  Escalation,
  IdleSummary,
  Instructor,
  InstructorOperatorRow,
  InstructorSlot,
  MachineIssue,
  ModelCard,
  OperatorProfile,
  Quiz,
  QuizAttemptResponse,
  Reassessment,
  Recommendation,
  SentinelEvent,
  TrainingModule,
} from '../lib/types';
import { FAST_SWING_EXPLANATION } from './edge';
import { COMPETENCIES, MODULES, OPERATORS, SITE_ID, STAFF, at, mockNow } from './world';

// ------------------------------------------------------------------ competencies
type CompState = { state: CompetencyState; evidence?: string; verified_by?: string };

const ravi: Record<string, CompState> = {
  C01: { state: 'demonstrated', verified_by: STAFF.instructor.initials, evidence: 'Instructor spot-check 02 Sep' },
  C02: { state: 'demonstrated', verified_by: STAFF.instructor.initials, evidence: 'Instructor sign-off 20 Jul' },
  C03: { state: 'unassessed' },
  C04: { state: 'in_training', evidence: '7 fast swings near truck in 2 shifts' },
  C05: { state: 'improving', evidence: '1 intrusion in last 5 shifts (was 3)' },
  C06: { state: 'unassessed' },
  C07: { state: 'unassessed', evidence: 'First trench on this site today' },
  C08: { state: 'unassessed' },
  C09: { state: 'unassessed' },
  C10: { state: 'observed_gap', evidence: 'Unexplained idle above site target in 3 of last 5 shifts' },
  C11: { state: 'unassessed' },
  C12: { state: 'unassessed', evidence: 'Assessment only — not telemetry-derived' },
  C13: { state: 'unassessed' },
  C14: { state: 'unassessed' },
};

const others: Record<string, Record<string, CompetencyState>> = {
  'OP-1007': Object.fromEntries(COMPETENCIES.map((c) => [c.id, 'demonstrated'])) as Record<string, CompetencyState>,
  'OP-1019': { C01: 'demonstrated', C02: 'demonstrated', C03: 'demonstrated', C04: 'improving', C05: 'observed_gap', C06: 'demonstrated', C07: 'in_training', C08: 'unassessed', C09: 'improving', C10: 'demonstrated', C11: 'demonstrated', C12: 'demonstrated', C13: 'unassessed', C14: 'unassessed' },
  'OP-1033': { C01: 'demonstrated', C02: 'demonstrated', C03: 'demonstrated', C04: 'demonstrated', C05: 'demonstrated', C06: 'improving', C07: 'demonstrated', C08: 'demonstrated', C09: 'demonstrated', C10: 'improving', C11: 'demonstrated', C12: 'demonstrated', C13: 'observed_gap', C14: 'unassessed' },
};

export function mockProfile(operatorId: string): OperatorProfile {
  const op = OPERATORS[operatorId] ?? OPERATORS['OP-1042'];
  const competencies: CompetencyEntry[] = COMPETENCIES.map((c) => {
    if (operatorId === 'OP-1042' || !others[operatorId]) {
      const s = ravi[c.id];
      return { id: c.id, label: c.label, state: s.state, evidence: s.evidence ?? null, verified_by: s.verified_by ?? null, safety_critical: c.safety_critical };
    }
    const st = others[operatorId][c.id] ?? 'unassessed';
    return { id: c.id, label: c.label, state: st, verified_by: st === 'demonstrated' ? STAFF.instructor.initials : null, safety_critical: c.safety_critical };
  });
  return {
    operator: op,
    competencies,
    exposure: { operating_h: op.operating_hours, loading_cycles: 1840, shifts: 31 },
    training_history: [
      { module_id: 'MOD-SEATBELT-CAB', title: 'Seatbelt & Three Points of Contact', completed_ts: at(9, 0, 0, -65), score: '5/5' },
      { module_id: 'MOD-PRESTART', title: 'Pre-Start Walk-Around', completed_ts: at(9, 0, 0, -21), score: '4/5' },
    ],
  };
}

export function mockPatchCompetency(operatorId: string, competencyId: string, state: CompetencyState, actorRole: string): { ok: boolean; status: number; detail?: string } {
  if (state === 'demonstrated' && actorRole !== 'supervisor') {
    return { ok: false, status: 403, detail: 'Only a supervisor or a passed assessment can set DEMONSTRATED' };
  }
  if (operatorId === 'OP-1042' && ravi[competencyId]) {
    ravi[competencyId] = { ...ravi[competencyId], state, verified_by: state === 'demonstrated' ? STAFF.instructor.initials : undefined };
  }
  return { ok: true, status: 200 };
}

export function mockEvaluate(): { gaps: Array<{ competency_id: string; p: number; events: number; shifts: number }> } {
  return { gaps: [{ competency_id: 'C04', p: 0.91, events: 7, shifts: 2 }] };
}

// ------------------------------------------------------------------ training
export function mockRecommendations(): Recommendation[] {
  return [
    { module_id: 'MOD-SWING-APPROACH', title: 'Approach & Swing Control', duration_min: 4, why: '7 fast swings near truck in 2 shifts', evidence: 'P(rate above reference) = 0.91 · 7 of 81 loading cycles', competency_id: 'C04', status: 'in_training', version: 'v1.2', approved_by: 'M. Lee', approved_at: '12 Aug 2026', format: 'micro_lesson' },
    { module_id: 'MOD-TRENCH-EDGES', title: 'Trenching Near Edges', duration_min: 5, why: 'Before your first trench task today', evidence: 'Task T-2 requires this module', competency_id: 'C07', status: 'not_started', version: 'v1.1', approved_by: 'M. Lee', approved_at: '02 Sep 2026', format: 'micro_lesson' },
  ];
}

export function mockModules(): TrainingModule[] {
  const state = (cid: string) => ravi[cid]?.state;
  return MODULES.map((m) => ({ ...m, status: state(m.competency_id) === 'demonstrated' ? 'passed' : state(m.competency_id) ?? 'unassessed' }));
}

export function mockModule(id: string): TrainingModule | undefined {
  return mockModules().find((m) => m.module_id === id);
}

const cite = (section: string, text: string) => ({ chunk_id: `sop-ex-04#${section.slice(1)}`, doc_id: 'Site SOP-EX-04', section, version: 'v1.2', text, title: 'Excavator truck loading (SAMPLE SOP)' });

export function mockQuiz(moduleId: string): Quiz {
  if (moduleId === 'MOD-TRENCH-EDGES') {
    return {
      module_id: moduleId, title: 'Trenching Near Edges', pass_mark: 4,
      questions: [
        { question_id: 'q1', prompt: 'How far back from the trench edge should spoil be placed?', options: [{ id: 'a', text: 'Right at the edge' }, { id: 'b', text: 'At least 0.6 m back' }, { id: 'c', text: 'Anywhere on the same side' }, { id: 'd', text: 'Inside the trench' }], correct_option_id: 'b', explanation: 'Spoil too close adds surcharge load to the wall.', citation: { doc_id: 'Site SOP-EX-07', section: '§2.1', version: 'v1.1' } },
        { question_id: 'q2', prompt: 'You see a tension crack along the trench wall. What do you do?', options: [{ id: 'a', text: 'Dig faster to finish' }, { id: 'b', text: 'Keep going but watch it' }, { id: 'c', text: 'Stop and call your supervisor' }, { id: 'd', text: 'Fill the crack with spoil' }], correct_option_id: 'c', explanation: 'Wall distress means stop work and get an inspection.', citation: { doc_id: 'Site SOP-EX-07', section: '§4.1', version: 'v1.1' } },
      ],
    };
  }
  return {
    module_id: moduleId, title: 'Approach & Swing Control', pass_mark: 4,
    questions: [
      { question_id: 'q1', prompt: 'When should you start slowing the swing towards the truck?', options: [{ id: 'a', text: 'Only when the bucket is over the body' }, { id: 'b', text: 'Progressively, as the bucket approaches the body' }, { id: 'c', text: 'Never — keep a constant speed' }, { id: 'd', text: 'After dumping' }], correct_option_id: 'b', explanation: 'Slow progressively so you arrive over the body with the swing almost stopped.', citation: cite('§3.2', 'Reduce swing speed progressively as the bucket approaches the haul truck body.') },
      { question_id: 'q2', prompt: 'The bucket is 4 m from the truck body and swinging fast. What should you do?', options: [{ id: 'a', text: 'Keep swinging and brake hard over the body' }, { id: 'b', text: 'Ease off the swing now and let it slow before the body' }, { id: 'c', text: 'Lower the bucket to stop it faster' }, { id: 'd', text: 'Sound the horn and continue' }], correct_option_id: 'b', explanation: 'Easing off early avoids overshoot and load spill; hard braking over the body swings the load.', citation: cite('§3.2', 'Aim to arrive over the body with the swing almost stopped.') },
      { question_id: 'q3', prompt: 'Before swinging over the truck side boards, the bucket should be…', options: [{ id: 'a', text: 'Level with the side boards' }, { id: 'b', text: 'Below the side boards' }, { id: 'c', text: 'Higher than the side boards' }, { id: 'd', text: 'Fully curled at ground level' }], correct_option_id: 'c', explanation: 'Keep the bucket clear of the side boards before it passes over them.', citation: cite('§3.3', 'Raise the bucket clear of the truck side boards before the swing brings it over the body.') },
      { question_id: 'q4', prompt: 'Which swing path is never acceptable?', options: [{ id: 'a', text: 'Over the truck cab' }, { id: 'b', text: 'Over the rear of the body' }, { id: 'c', text: 'Over the side of the body' }, { id: 'd', text: 'Back to the dig face' }], correct_option_id: 'a', explanation: 'Never swing the bucket over the cab.', citation: cite('§3.4', 'Position the truck so the bucket never passes over the cab.') },
      { question_id: 'q5', prompt: 'The truck driver reverses in early while you are swinging. What do you do?', options: [{ id: 'a', text: 'Stop the swing and wait until the truck is spotted' }, { id: 'b', text: 'Swing faster to finish the pass' }, { id: 'c', text: 'Dump on the ground behind the truck' }, { id: 'd', text: 'Ignore it' }], correct_option_id: 'a', explanation: 'Stop and wait until the truck is in position and the driver signals ready.', citation: cite('§2.4', 'Do not load until the truck is stationary in the loading position.') },
    ],
  };
}

export function mockQuizAttempt(moduleId: string, answers: Array<{ question_id: string; option_id: string }>): QuizAttemptResponse {
  const quiz = mockQuiz(moduleId);
  const results = quiz.questions.map((q) => {
    const a = answers.find((x) => x.question_id === q.question_id);
    return { question_id: q.question_id, correct: a?.option_id === q.correct_option_id, correct_option_id: q.correct_option_id, explanation: q.explanation };
  });
  const score = results.filter((r) => r.correct).length;
  return { attempt_id: `att_${Date.now()}`, score, total: quiz.questions.length, passed: score >= (quiz.pass_mark ?? quiz.questions.length - 1), results, next: 'Your swing near the truck will be checked automatically over the next 3 shifts.' };
}

// ------------------------------------------------------------------ instructors and bookings (MOCK)
export function mockInstructors(): Instructor[] {
  return [
    { instructor_id: 'INS-01', name: 'Marcus Lee', initials: 'M.L.', specialties: ['Excavator', 'Truck loading', 'Simulator'], formats: ['simulator', 'on_machine'] },
    { instructor_id: 'INS-02', name: 'Dana Whitfield', initials: 'D.W.', specialties: ['Excavator', 'Trenching', 'Site safety'], formats: ['on_machine', 'video_call'] },
  ];
}

export function mockSlots(): InstructorSlot[] {
  const s = (id: string, ins: string, d: number, h: number, format: string, location: string, available = true): InstructorSlot => ({ slot_id: id, instructor_id: ins, start_ts: at(h, 0, 0, d), end_ts: at(h + 1, 0, 0, d), format, location, available });
  return [
    s('SL-1', 'INS-01', 2, 10, 'simulator', 'Simulator bay 2'),
    s('SL-2', 'INS-01', 2, 14, 'simulator', 'Simulator bay 2'),
    s('SL-3', 'INS-01', 3, 7, 'on_machine', 'Bench 3, EX-07'),
    s('SL-4', 'INS-01', 1, 15, 'simulator', 'Simulator bay 1', false),
    s('SL-5', 'INS-02', 1, 11, 'video_call', 'Video call'),
    s('SL-6', 'INS-02', 2, 9, 'on_machine', 'Trench T-4'),
    s('SL-7', 'INS-02', 4, 13, 'on_machine', 'Trench T-4'),
  ];
}

const bookings: Booking[] = [];
export function mockBooking(req: BookingRequest): Booking {
  const b: Booking = { booking_id: `BK-${1000 + bookings.length + 1}`, slot_id: req.slot_id, operator_id: req.operator_id, status: 'confirmed', provenance: ['MOCK'] };
  bookings.push(b);
  return b;
}

// ------------------------------------------------------------------ copilot ("Ask the Manual")
export function mockCopilot(question: string): CopilotAnswer {
  const q = question.toLowerCase();
  if (q.includes('driver') || q.includes('pay') || q.includes('discipline')) {
    return { answer: "I couldn't find this in the approved documents. Ask your supervisor or instructor.", citations: [], mode: 'refused' };
  }
  if (q.includes('cab') || q.includes('close') || q.includes('distance')) {
    return {
      answer: 'Never pass the bucket over the truck cab. Keep the bucket clear of the side boards and arrive over the body with the swing almost stopped.',
      citations: [
        cite('§3.4', 'Position the truck so the bucket never passes over the cab. Load from the side or rear only.'),
        cite('§3.3', 'Raise the bucket clear of the truck side boards before the swing brings it over the body. Do not drag the bucket across the side board.'),
      ],
      mode: 'extractive',
    };
  }
  if (q.includes('swing') || q.includes('slow') || q.includes('speed')) {
    return {
      answer: 'Reduce swing speed progressively as the bucket approaches the truck body, so the swing has almost stopped when the bucket is over the body.',
      citations: [cite('§3.2', 'Reduce swing speed progressively as the bucket approaches the haul truck body; aim to arrive over the body with the swing almost stopped.')],
      mode: 'extractive',
    };
  }
  if (q.includes('trench') || q.includes('edge') || q.includes('spoil')) {
    return {
      answer: 'Place spoil at least 0.6 m back from the trench edge and keep the tracks behind the setback line.',
      citations: [{ chunk_id: 'sop-ex-07#2.1', doc_id: 'Site SOP-EX-07', section: '§2.1', version: 'v1.1', text: 'Place excavated material at least 0.6 m from the edge of the excavation.' }],
      mode: 'extractive',
    };
  }
  return { answer: "I couldn't find this in the approved documents. Ask your supervisor or instructor.", citations: [], mode: 'refused' };
}

// ------------------------------------------------------------------ re-assessment (SIMULATED)
export function mockReassessment(): Reassessment {
  return {
    operator_id: 'OP-1042',
    competency_id: 'C04',
    pre: { events: 7, opportunities: 81, rate: 7 / 81 },
    post: { events: 2, opportunities: 45, rate: 2 / 45 },
    rr: 0.51,
    ci95: [0.05, 2.7],
    verdict: 'trending_better_not_conclusive',
    label: 'SIMULATED',
    training_completed: '23 Sep',
    competency_state: 'improving',
    per_shift: [
      { shift: 'Shift 0', events: 2, opportunities: 39, rate: 2 / 39, lo: 0.006, hi: 0.173 },
      { shift: 'Shift 1', events: 5, opportunities: 42, rate: 5 / 42, lo: 0.04, hi: 0.258 },
      { shift: 'Shift 2', events: 2, opportunities: 45, rate: 2 / 45, lo: 0.005, hi: 0.151 },
    ],
  };
}

// ------------------------------------------------------------------ supervisor
let escalations: Escalation[] = [
  { escalation_id: 'ESC-1', machine_id: 'EX-07', operator_id: 'OP-1042', operator_name: 'Ravi Kumar', what: 'Break recommendation snoozed', detail: '2 h 45 m continuous operation · reminder snoozed once', ts: at(8, 45), status: 'open' },
  { escalation_id: 'ESC-2', machine_id: 'EX-04', operator_id: 'OP-1033', operator_name: 'Lena Ortiz', what: 'Proximity sensor not responding', detail: 'Protection degraded since 07:31 · operator relying on mirrors and spotter', ts: at(7, 31), status: 'open' },
];

export function mockCrewSummary(): CrewSummary {
  const now = mockNow();
  const row = (machine_id: string, model: string, operator_id: string, task: string, task_detail: string, progress_pct: number, progress_label: string, eta: [number, number, number] | null, protection: 'active' | 'degraded' | 'not_fitted', alerts: Record<string, number>, cont: number, syncAgo: number, protection_note?: string) => ({
    machine_id, model, operator_id, operator_name: OPERATORS[operator_id]?.name ?? operator_id, task, task_detail, progress_pct, progress_label,
    estimate: eta ? { p10_ts: at(eta[0], 0) + 0, p50_ts: at(eta[1], 0), p90_ts: at(eta[2], 0) } : null,
    protection, protection_note, alerts_by_signal_word: alerts, continuous_operation_min: cont, last_sync_ts: now - syncAgo,
  });
  const machines = [
    row('EX-07', 'Cat 320', 'OP-1042', 'Truck Loading', 'Bench 3', 34, '143 / 420 m³', [9.58, 10.08, 10.83], 'active', { DANGER: 1, WARNING: 2, CAUTION: 2 }, 112, 4),
    row('EX-04', 'Cat 336', 'OP-1033', 'Trench Excavation', 'Drainage line T-3', 62, '37 / 60 m', [11.25, 11.6, 12.1], 'degraded', { WARNING: 1 }, 170, 9, 'Proximity sensor not responding'),
    row('EX-09', 'Cat 320', 'OP-1019', 'Truck Loading', 'Bench 2', 51, '214 / 420 m³', [10.5, 10.9, 11.6], 'active', { CAUTION: 1 }, 64, 3),
    row('EX-11', 'Cat 320', 'OP-1007', 'Trench Excavation', 'Services corridor', 44, '31 / 70 m', [12.0, 12.5, 13.2], 'active', {}, 88, 5),
    row('DZ-02', 'Cat D6 (dozer)', 'OP-1051', 'Highwall spoil prep', 'Upper ramp', 88, '4.4 / 5.0 ha', [10.1, 10.3, 10.6], 'not_fitted', {}, 70, 6),
    row('WL-03', 'Cat 966 (wheel loader)', 'OP-1060', 'Stockpile load-out', 'Pad 4', 15, '80 / 540 t', [14.0, 14.5, 15.4], 'active', { CAUTION: 1 }, 45, 12),
  ];
  return {
    site: 'North Quarry', shift_label: 'Day shift 06:00–14:30',
    kpis: { machines_active: 6, machines_total: 7, protection_degraded: 1, open_escalations: escalations.filter((e) => e.status === 'open').length, idle_today_min: 190, idle_waiting_pct: 58, tasks_on_track: 9, tasks_total: 11, idle_fuel_l: 38, idle_fuel_usd: 38 },
    machines,
  };
}

export function mockEscalations(): Escalation[] {
  return escalations;
}

export function mockResolveEscalation(id: string, note: string): Escalation | undefined {
  escalations = escalations.map((e) => (e.escalation_id === id ? { ...e, status: 'resolved', note } : e));
  return escalations.find((e) => e.escalation_id === id);
}

export function mockMachineIssues(): MachineIssue[] {
  return [
    { machine_id: 'EX-09', issue: 'Hydraulic pressure spikes during boom-up (seen with 2 operators)', attribution: 'machine', since_ts: at(11, 40, 0, -1), dtc: ['HYD-1204'], operators_affected: 2 },
    { machine_id: 'EX-04', issue: 'Proximity sensor rear-left not responding', attribution: 'machine', since_ts: at(7, 31), dtc: ['PRX-0032'], operators_affected: 1 },
  ];
}

// ------------------------------------------------------------------ idle and behaviour
export function mockIdleSummary(date: string): IdleSummary {
  const days = ['17 Sep', '18 Sep', '19 Sep', '20 Sep', '21 Sep', '22 Sep', '23 Sep'];
  const mk = (seed: number) => days.map((d, i) => ({ date: d, waiting_min: 14 + ((i * 7 + seed * 5) % 19), unexplained_min: 3 + ((i * 3 + seed * 11) % 13) }));
  return {
    date,
    machines: [
      { machine_id: 'EX-07', days: mk(1) },
      { machine_id: 'EX-09', days: mk(2) },
      { machine_id: 'EX-04', days: mk(3) },
    ],
    longest_unexplained: [
      { machine_id: 'EX-04', operator_id: 'OP-1033', start_ts: at(13, 5, 0, -1), duration_min: 14, context: 'Stockpile tidy · no truck scheduled · engine 1,400 rpm' },
      { machine_id: 'EX-07', operator_id: 'OP-1042', start_ts: at(7, 21), duration_min: 9, context: 'Truck loading · no truck in dispatch queue' },
      { machine_id: 'EX-09', operator_id: 'OP-1019', start_ts: at(10, 48, 0, -1), duration_min: 8, context: 'Trenching · waiting for pipe crew (not tapped)' },
      { machine_id: 'EX-07', operator_id: 'OP-1033', start_ts: at(15, 2, 0, -2), duration_min: 7, context: 'End of shift · cool-down exceeded 5 min' },
    ],
    fuel_unexplained_l: 14,
    fuel_unexplained_usd: 14,
    fuel_usd_per_l: 1.0,
    provenance: ['RULE', 'SIMULATED'],
  };
}

export function mockBehaviourEvents(): SentinelEvent[] {
  const mk = (i: number, h: number, m: number, type: string, category: SentinelEvent['category'], attribution: SentinelEvent['attribution'], risk: number, machine = 'EX-07', op = 'OP-1042'): SentinelEvent => ({
    event_id: `evt_b${i}`, ts: at(h, m), site_id: SITE_ID, machine_id: machine, operator_id: op, type, category, tier: category === 'dangerous_condition' ? 'T2' : category === 'procedural' ? 'T1' : null,
    provenance: category === 'unusual_harmless' ? ['ML'] : ['ML', 'RULE'], model_version: 'iforest-0.2.1', risk_score: risk, attribution,
    context: { task_type: type.includes('trench') ? 'trenching' : 'truck_loading', zone: 'TL-1', waiting_for_truck: false },
    explanation: type === 'hydraulic_pressure_spikes'
      ? [
          { feature: 'hyd_pressure_spike_rate', label: 'Hydraulic pressure spikes', value: 6.2, baseline_mean: 1.1, baseline_std: 0.8, z: 6.4, unit: '/min', direction: 'high' },
          { feature: 'joy_boom_jerk', label: 'Boom lever jerk', value: 0.9, baseline_mean: 0.8, baseline_std: 0.3, z: 0.3, unit: '', direction: 'high' },
        ]
      : FAST_SWING_EXPLANATION,
    evidence: {}, competency_ids: type === 'fast_swing_near_truck' ? ['C04'] : [], simulated: true,
  });
  return [
    mk(1, 6, 31, 'fast_swing_near_truck', 'dangerous_condition', 'operator', 0.82),
    mk(2, 6, 48, 'unusual_cycle_rhythm', 'unusual_harmless', 'unknown', 0.41),
    mk(3, 7, 8, 'fast_swing_near_truck', 'dangerous_condition', 'operator', 0.88),
    mk(4, 7, 21, 'excessive_idle', 'procedural', 'operator', 0.35),
    mk(5, 7, 30, 'jerky_multi_function', 'emerging_degradation', 'operator', 0.62),
    mk(6, 7, 44, 'fast_swing_near_truck', 'dangerous_condition', 'operator', 0.79),
    mk(7, 8, 5, 'hydraulic_pressure_spikes', 'emerging_degradation', 'machine', 0.71, 'EX-09', 'OP-1019'),
    mk(8, 8, 20, 'unusual_cycle_rhythm', 'unusual_harmless', 'environment', 0.38, 'EX-09', 'OP-1019'),
    mk(9, 8, 41, 'jerky_multi_function', 'emerging_degradation', 'operator', 0.58),
    mk(10, 9, 2, 'bucket_over_cab_path', 'procedural', 'operator', 0.55, 'EX-09', 'OP-1019'),
  ];
}

// ------------------------------------------------------------------ instructor
export function mockInstructorOperators(): InstructorOperatorRow[] {
  return ['OP-1042', 'OP-1019', 'OP-1033', 'OP-1007'].map((id) => {
    const p = mockProfile(id);
    return { operator_id: id, name: p.operator.name, level: p.operator.level, competencies: p.competencies.map((c) => ({ id: c.id, state: c.state })) };
  });
}

let reviews: ContentReviewItem[] = [
  {
    review_id: 'REV-31', module_id: 'MOD-SWING-APPROACH', title: 'Approach & Swing Control', version: 'v1.3', change_summary: 'Adds truck-reversing scenario; clarifies side-board clearance', sources_cited: 4, citation_check: 'PASS', status: 'in_review',
    diff: [
      { op: 'same', text: '1. Slow the swing as the bucket approaches the truck body.', citation: 'SOP-EX-04 §3.2 v1.2' },
      { op: 'del', text: '2. Keep the bucket above the truck.', citation: 'SOP-EX-04 §3.3 v1.1' },
      { op: 'add', text: '2. Keep the bucket higher than the truck side boards before you swing over them.', citation: 'SOP-EX-04 §3.3 v1.2' },
      { op: 'same', text: '3. Never swing the bucket over the truck cab.', citation: 'SOP-EX-04 §3.4 v1.2' },
      { op: 'add', text: '4. If the truck reverses early, stop the swing and wait for the driver to signal ready.', citation: 'SOP-EX-04 §2.4 v1.2' },
    ],
  },
  {
    review_id: 'REV-29', module_id: 'MOD-TRENCH-EDGES', title: 'Trenching Near Edges', version: 'v1.2', change_summary: 'Updates setback wording after SOP-EX-07 v1.2', sources_cited: 3, citation_check: 'FAIL', status: 'draft',
    diff: [
      { op: 'same', text: '1. Keep spoil piles at least 0.6 m back from the trench edge.', citation: 'SOP-EX-07 §2.1 v1.1' },
      { op: 'add', text: '2. Mark the setback line with pins before starting.', citation: 'SOP-EX-07 §2.2 v1.2 (not yet approved)' },
    ],
  },
  { review_id: 'REV-27', module_id: 'MOD-IDLE-FUEL', title: 'Fuel-Efficient Idle Practice', version: 'v1.0', change_summary: 'Initial version', sources_cited: 2, citation_check: 'PASS', status: 'approved', diff: [] },
];

export function mockContentReview(): ContentReviewItem[] {
  return reviews;
}

export function mockApproveContent(id: string): ContentReviewItem | undefined {
  reviews = reviews.map((r) => (r.review_id === id ? { ...r, status: 'approved' } : r));
  return reviews.find((r) => r.review_id === id);
}

// ------------------------------------------------------------------ monitoring
export function mockAlertRates(): AlertRates {
  return {
    per_operating_hour: 0.8,
    budget: 1.0,
    by_tier: { T_CRIT: 0.1, T2: 0.2, T1: 0.5 },
    feedback_not_correct: [
      { type: 'fast_swing_near_truck', count: 1, total: 9 },
      { type: 'excessive_idle', count: 2, total: 6 },
      { type: 'jerky_multi_function', count: 0, total: 3 },
    ],
    latency_ms: { rule_p50: 1.8, rule_p99: 4.1, ml_p50: 44, ml_p99: 96 },
    edge_cpu_pct: 14,
    queue_depth: 0,
    last_sync_ts: mockNow() - 3,
  };
}

export function mockDrift(): DriftReport {
  const series = (base: number, amp: number) => Array.from({ length: 14 }, (_, i) => +(base + amp * Math.sin(i / 2) + (i > 10 ? amp : 0)).toFixed(3));
  return {
    window: 'last 14 shifts',
    features: [
      { feature: 'swing_dps_p95', psi: 0.06, series: series(0.05, 0.01), status: 'stable' },
      { feature: 'hyd_pressure_bar_mean', psi: 0.14, series: series(0.08, 0.03), status: 'watch' },
      { feature: 'idle_fraction', psi: 0.04, series: series(0.03, 0.01), status: 'stable' },
      { feature: 'joy_boom_jerk', psi: 0.09, series: series(0.06, 0.02), status: 'stable' },
    ],
  };
}

export function mockModels(): ModelCard[] {
  return [
    {
      kind: 'iforest', name: 'Unusual operation detector — Isolation Forest per task type', version: 'iforest-0.2.1', training_data: 'SIMULATED windows (4 operators, 2 machines, 38 shifts)', features: 18,
      threshold: 'Set by alert budget (≤ 1.0 alerts per operating hour)',
      metrics: { event_precision_injected: 0.71, event_recall_injected: 0.84, contexts: 'truck_loading, trenching × B / BC' },
      limits: ['Trained on simulated data only', 'Per-task baselines; skips inference while travelling', 'Unusual ≠ unsafe — reviewed in context'], sha256: '9f3c…e21a', provenance: ['ML', 'SIMULATED'],
    },
    {
      kind: 'tasktime', name: 'Task time — LightGBM quantile + conformal', version: 'tasktime-lgbm-q-0.3.0', training_data: 'SIMULATED task history (612 tasks)', features: 12,
      metrics: { interval_coverage: 0.8, target_coverage: 0.8, median_width_min: 58, p50_mae_vs_baseline: '-18%' },
      limits: ['Coverage checked on time-later split (SIMULATED)', 'Wider intervals when few similar tasks'], sha256: '4b7a…90c2', provenance: ['ML', 'SIMULATED'],
    },
    {
      kind: 'expert_motion', name: 'Expert Motion Model — practice analyser', version: 'expert-motion-0.1.0', training_data: 'SIMULATED expert operators (safety-filtered: no rule violations)', features: 8,
      metrics: { phase_segmentation_acc: 0.93, score_rank_corr_archetype: 0.9 },
      limits: ['Expert envelopes from simulated professionals', 'Fast is not automatically good — safety-filtered'], sha256: 'c1d9…7f40', provenance: ['ML', 'SIMULATED'],
    },
  ];
}
