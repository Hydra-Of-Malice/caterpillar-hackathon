/**
 * Business-value fixtures (cloud /value, ESTIMATE). `value_fixture.json` is a dump of agent H's
 * value model (sentinel/value, base case, config/value_model.yaml) so offline numbers match the
 * live endpoints exactly: +11% trainee output (7–18%), −15% idle hours (10–24%), −276 L idle fuel
 * per machine-year (183–472 L), fleet output +2.7% (2.1–4.9%).
 * Offline, /value/estimate re-scales the base case with a small lever model when inputs are edited
 * (labelled as an offline approximation).
 */
import type { ValueUnitCosts } from '../lib/types';
import fixture from './value_fixture.json';

type Json = Record<string, unknown>;
const F = fixture as unknown as {
  gains_headline: Json;
  pitch: Json;
  today: Json;
  levers: Json;
  assumptions: { assumptions: Record<string, { base: number; low: number; high: number }> } & Json;
  estimate_base: Json & {
    usd: { per_machine: { levers: Record<string, number>; subscription_usd: number } };
    levers: Record<string, Json>;
    gains: { per_machine_per_year: Record<string, number> };
    scenarios: Record<string, { per_machine_gross_usd: number; fleet: { fleet_size: number; subscription_usd: number; one_off_usd: number } }>;
    uncertainty: Json & { per_machine_gross_usd: Record<string, number>; payback_months: Record<string, number> };
    sensitivity: Array<Json & { net_usd_at_low: number; net_usd_at_high: number }>;
    notes: string[];
  };
};

export const LEVER_LABEL: Record<string, string> = {
  productivity: 'Productivity (training & practice)',
  idle_fuel: 'Idle fuel & engine hours',
  training: 'Training cost / time to proficiency',
  safety: 'Safety (expected value)',
  wear: 'Wear & maintenance',
  planning: 'Planning (task-time estimates)',
};

const A = F.assumptions.assumptions;
const base = (k: string, d: number) => A[k]?.base ?? d;

/** Relative effect of editing an input on each lever (offline approximation of the value model). */
function leverRatios(ov: Record<string, number>): Record<string, number> {
  const r = (k: string, d: number) => (ov[k] ?? base(k, d)) / base(k, d);
  const hours = r('operating_hours_per_year', 1500);
  const labourMachine = ((ov.operator_wage_loaded_per_h ?? base('operator_wage_loaded_per_h', 45)) + (ov.machine_ownership_cost_per_h ?? base('machine_ownership_cost_per_h', 60))) /
    (base('operator_wage_loaded_per_h', 45) + base('machine_ownership_cost_per_h', 60));
  const idle = hours * r('idle_share_baseline', 0.35) * r('idle_hours_reduction_frac', 0.15) * (0.5 + 0.5 * r('fuel_price_per_l', 1) * r('idle_fuel_l_per_h', 3.8));
  return {
    productivity: hours * labourMachine * r('productivity_gap_frac', 0.12) * r('gap_closure_frac', 0.2),
    idle_fuel: idle,
    training: r('operator_wage_loaded_per_h', 45),
    safety: hours,
    wear: hours * r('wear_reduction_frac', 0.03),
    planning: hours * labourMachine,
  };
}

/** Offline /value/estimate in the value model's response shape. */
export function mockValueEstimate(body: { fleet_size?: number; overrides?: Record<string, number>; scenario?: string }): Json {
  const E = F.estimate_base;
  const scenario = body.scenario ?? 'base';
  const sc = E.scenarios[scenario] ?? E.scenarios.base;
  const scale = sc.per_machine_gross_usd / E.scenarios.base.per_machine_gross_usd;
  const ov = body.overrides ?? {};
  const ratios = leverRatios(ov);
  const fleetSize = body.fleet_size ?? 10;
  const levers: Record<string, number> = {};
  for (const [k, v] of Object.entries(E.usd.per_machine.levers)) levers[k] = +(v * scale * (ratios[k] ?? 1)).toFixed(2);
  const gross = Object.values(levers).reduce((a, b) => a + b, 0);
  const sub = ov.subscription_per_machine_per_year ?? sc.fleet.subscription_usd / sc.fleet.fleet_size;
  const oneOff = ov.one_off_per_machine ?? sc.fleet.one_off_usd / sc.fleet.fleet_size;
  const net = gross - sub;
  const payback = net > 0 ? +((oneOff / net) * 12).toFixed(2) : null;
  const overall = gross / E.scenarios.base.per_machine_gross_usd;
  const scaleRange = (x: Record<string, number>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, +(v * overall).toFixed(2)]));
  return {
    ...E,
    scenario,
    usd: {
      per_machine: { levers, gross_usd: +gross.toFixed(2), subscription_usd: sub, net_usd: +net.toFixed(2) },
      fleet: { fleet_size: fleetSize, gross_usd: +(gross * fleetSize).toFixed(2), subscription_usd: sub * fleetSize, net_usd: +(net * fleetSize).toFixed(2), one_off_usd: oneOff * fleetSize, payback_months: payback },
      payback_months: payback,
    },
    levers: Object.fromEntries(Object.entries(E.levers).map(([k, v]) => [k, { ...v, usd: levers[k] }])),
    gains: { ...E.gains, per_machine_per_year: scaleRange(E.gains.per_machine_per_year) },
    uncertainty: { ...E.uncertainty, per_machine_gross_usd: scaleRange(E.uncertainty.per_machine_gross_usd) },
    sensitivity: E.sensitivity.map((x) => ({ ...x, net_usd_at_low: +(x.net_usd_at_low * overall).toFixed(2), net_usd_at_high: +(x.net_usd_at_high * overall).toFixed(2) })),
    overrides: ov,
    notes: [...E.notes, Object.keys(ov).length ? 'Offline fixture: edited inputs are applied with an approximation of the value model.' : 'Offline fixture: base case of the value model.'],
  };
}

export const mockValueAssumptionsRaw = () => F.assumptions;
export const mockValueLeversRaw = () => F.levers;
export const mockValueTodayRaw = () => F.today;
export const mockValuePitchRaw = () => F.pitch;
export const mockGainsHeadlineRaw = () => F.gains_headline;
export const mockUnitCostsRaw = () => ({ label: F.pitch.label, units: [], note: 'Offline fixture' });

/** Conversion factors for gain chips (litres per idle hour etc.) — never shown as dollars. */
export function mockUnitCosts(): ValueUnitCosts {
  return {
    currency: 'USD',
    fuel_usd_per_l: base('fuel_price_per_l', 1),
    idle_fuel_l_per_h: base('idle_fuel_l_per_h', 3.8),
    operator_usd_per_h: base('operator_wage_loaded_per_h', 45),
    machine_usd_per_h: base('machine_ownership_cost_per_h', 60),
    truck_wait_usd_per_min: 0,
    crew_wait_usd_per_min: 0,
    value_per_m3_usd: 0,
    incident_expected_cost_usd: {},
    label: 'ESTIMATE',
  };
}
