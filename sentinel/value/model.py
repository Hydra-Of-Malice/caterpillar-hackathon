"""CAT Sentinel business value model (ESTIMATE).

Pure functions: assumptions from ``config/value_model.yaml`` go in; each value lever returns
``gains`` in operational units (m³, % output, idle h, fuel L, days, events) and ``usd``.
Every result is an estimate built on editable assumptions. Prototype metrics are SIMULATED,
and customer ROI needs a pilot (docs/sections/16-business-value.md §6).

Conventions
- ``Params`` is a flat ``{assumption_name: float}`` dict (see :func:`resolve`).
- Scenario "low" puts every uncertain assumption at its value-conservative end and "high" at
  its optimistic end. Each is a corner case, not a probability interval.
- Productive (working) hours = engine hours × (1 − idle share).
"""
from __future__ import annotations

import math
from typing import Any, Callable, Literal, Mapping

import numpy as np

from sentinel.shared.config import load_yaml

Scenario = Literal["low", "base", "high"]
SCENARIOS: tuple[Scenario, ...] = ("low", "base", "high")
LABEL = "ESTIMATE — assumptions editable; prototype metrics SIMULATED"
Params = dict[str, float]
LeverResult = dict[str, Any]


# ---------------------------------------------------------------- assumptions
def load_config() -> dict[str, Any]:
    """The versioned assumptions file (cached by ``load_yaml``)."""
    return load_yaml("value_model")


def specs(config: Mapping[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    return dict((config or load_config())["assumptions"])


def base_params(config: Mapping[str, Any] | None = None) -> Params:
    return {name: float(s["base"]) for name, s in specs(config).items()}


def uncertain_names(config: Mapping[str, Any] | None = None) -> list[str]:
    """Assumptions that vary across scenarios (not INPUT, low != high)."""
    return [n for n, s in specs(config).items()
            if s.get("tag") != "INPUT" and float(s["low"]) != float(s["high"])]


def validate_overrides(overrides: Mapping[str, Any] | None,
                       config: Mapping[str, Any] | None = None) -> Params:
    """Check that override names exist and values are finite and inside [min, max] (default min 0)."""
    sp = specs(config)
    out: Params = {}
    for name, raw in (overrides or {}).items():
        if name not in sp:
            raise ValueError(f"unknown assumption {name!r}")
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"assumption {name!r} must be a number") from exc
        lo, hi = float(sp[name].get("min", 0.0)), sp[name].get("max")
        if not math.isfinite(value) or value < lo or (hi is not None and value > float(hi)):
            bound = f"[{lo}, {hi}]" if hi is not None else f">= {lo}"
            raise ValueError(f"assumption {name!r}={raw} out of range {bound}")
        out[name] = value
    return out


def conservative_end(name: str, config: Mapping[str, Any] | None = None) -> Literal["low", "high"]:
    """Which end of an assumption's range gives the lower net value per machine (others at base)."""
    sp, p = specs(config), base_params(config)
    at_low = annual_value_per_machine({**p, name: float(sp[name]["low"])})["net_usd"]
    at_high = annual_value_per_machine({**p, name: float(sp[name]["high"])})["net_usd"]
    return "low" if at_low <= at_high else "high"


def resolve(scenario: Scenario = "base", overrides: Mapping[str, Any] | None = None,
            config: Mapping[str, Any] | None = None) -> Params:
    """Flat parameter set for a scenario. Overrides are applied last and always win."""
    if scenario not in SCENARIOS:
        raise ValueError(f"scenario must be one of {SCENARIOS}")
    config = config or load_config()
    sp, p = specs(config), base_params(config)
    if scenario != "base":
        for name in uncertain_names(config):
            cons = conservative_end(name, config)
            pick = cons if scenario == "low" else ("high" if cons == "low" else "low")
            p[name] = float(sp[name][pick])
    p.update(validate_overrides(overrides, config))
    return p


# ---------------------------------------------------------------- shared cost helpers
def hours(p: Params) -> tuple[float, float, float]:
    """(engine h, productive h, idle h) per machine per year."""
    h = p["operating_hours_per_year"]
    idle = p["idle_share_baseline"]
    return h, h * (1.0 - idle), h * idle


def variable_cost_per_h(p: Params) -> float:
    """Fuel + wear per working hour. Always saved in full when a working hour is avoided."""
    return p["fuel_working_l_per_h"] * p["fuel_price_per_l"] + p["machine_operating_cost_ex_fuel_per_h"]


def fixed_cost_per_h(p: Params) -> float:
    """Ownership + loaded operator wage per hour (saved only when the time is redeployed)."""
    return p["machine_ownership_cost_per_h"] + p["operator_wage_loaded_per_h"]


def productive_hour_value(p: Params) -> float:
    """Money value of one freed productive hour: variable cost + realised share of fixed cost."""
    return variable_cost_per_h(p) + fixed_cost_per_h(p) * p["time_value_realization_frac"]


def shifts_per_year(p: Params) -> float:
    return p["operating_hours_per_year"] / p["shift_engine_hours"]


def productive_hours_per_shift(p: Params) -> float:
    return p["shift_engine_hours"] * (1.0 - p["idle_share_baseline"])


def _lever(name: str, usd: float, gains: dict[str, float], basis: str,
           evidence: str = "ASSUMPTION") -> LeverResult:
    return {"lever": name, "usd": round(usd, 2), "gains": {k: round(v, 4) for k, v in gains.items()},
            "basis": basis, "evidence": evidence}


def _uplift_and_saving(gap: float, closure: float) -> tuple[float, float]:
    """(relative output uplift, fraction of hours saved for the same work) from closing part of a gap."""
    current = 1.0 - gap
    new = current + closure * gap
    if current <= 0 or new <= 0:
        return 0.0, 0.0
    return new / current - 1.0, 1.0 - current / new


# ---------------------------------------------------------------- levers (per machine per year)
def productivity_gain(p: Params, gap: float | None = None, closure: float | None = None) -> LeverResult:
    """Closing part of the operator-to-expert output gap (cycle time × bucket fill).

    The gain can be taken as more m³ in the same hours or the same m³ in fewer hours. The
    money view uses the second (cost avoidance), which is the more conservative of the two.
    """
    gap = p["productivity_gap_frac"] if gap is None else gap
    closure = p["gap_closure_frac"] if closure is None else closure
    _, work_h, _ = hours(p)
    uplift, saved_frac = _uplift_and_saving(gap, closure)
    hours_saved = work_h * saved_frac
    extra_m3 = work_h * p["production_m3_per_h"] * uplift
    gains = {
        "output_uplift_pct": 100 * uplift,
        "extra_m3_per_year": extra_m3,
        "extra_m3_per_shift": extra_m3 / shifts_per_year(p),
        "productive_hours_freed_per_year": hours_saved,
        "fuel_l_saved_per_year": hours_saved * p["fuel_working_l_per_h"],
    }
    return _lever("productivity", hours_saved * productive_hour_value(p), gains,
                  "hours saved for the same work × (variable cost + realised ownership/labour)",
                  "VENDOR_CLAIM gap × ASSUMPTION closure")


def fuel_savings_idle(p: Params) -> LeverResult:
    """Avoidable idle hours removed. Waiting-for-truck idle is context-gated, not targeted."""
    engine_h, _, idle_h = hours(p)
    avoided_h = idle_h * p["idle_hours_reduction_frac"]
    fuel_l = avoided_h * p["idle_fuel_l_per_h"]
    fuel_usd = fuel_l * p["fuel_price_per_l"]
    smu_usd = avoided_h * p["idle_hour_smu_cost_per_h"]
    gains = {
        "idle_hours_avoided_per_year": avoided_h,
        "idle_minutes_avoided_per_shift": 60 * avoided_h / shifts_per_year(p),
        "idle_share_before_pct": 100 * p["idle_share_baseline"],
        "idle_share_after_pct": 100 * (idle_h - avoided_h) / (engine_h - avoided_h) if engine_h > avoided_h else 0.0,
        "fuel_l_saved_per_year": fuel_l,
        "co2_kg_avoided_per_year": fuel_l * p["co2_kg_per_l_diesel"],
        "fuel_usd_per_year": fuel_usd,
        "engine_hour_usd_per_year": smu_usd,
    }
    return _lever("idle_fuel", fuel_usd + smu_usd, gains,
                  "avoided idle h × (idle fuel × price + non-fuel engine-hour cost)",
                  "ESTABLISHED idle share × ASSUMPTION reduction")


def training_cost_savings(p: Params) -> LeverResult:
    """Faster time to proficiency, fewer instructor hours and less production-machine seat time."""
    new_ops = p["operators_per_machine"] * p["annual_operator_turnover_frac"]
    ramp_prod_h = p["time_to_proficiency_months"] * p["operating_hours_per_year"] / 12 * (1 - p["idle_share_baseline"])
    ramp_shifts = p["time_to_proficiency_months"] * shifts_per_year(p) / 12
    ramp_usd = ramp_prod_h * p["novice_productivity_deficit_frac"] * p["time_to_proficiency_reduction_frac"] \
        * productive_hour_value(p)
    instr_h = p["instructor_hours_per_new_operator"] * p["instructor_hours_reduction_frac"]
    seat_h = p["training_machine_hours_per_new_operator"] * p["training_machine_hours_reduction_frac"]
    seat_rate = variable_cost_per_h(p) + p["machine_ownership_cost_per_h"] * p["time_value_realization_frac"]
    per_new_op = ramp_usd + instr_h * p["instructor_cost_per_h"] + seat_h * seat_rate
    gains = {
        "new_operators_per_machine_year": new_ops,
        "days_to_proficiency_saved_per_new_operator": ramp_shifts * p["time_to_proficiency_reduction_frac"],
        "time_to_proficiency_reduction_pct": 100 * p["time_to_proficiency_reduction_frac"],
        "instructor_hours_saved_per_new_operator": instr_h,
        "machine_hours_freed_per_new_operator": seat_h,
        "usd_per_new_operator": per_new_op,
    }
    return _lever("training", new_ops * per_new_op, gains,
                  "new operators/yr × (ramp deficit avoided + instructor h + machine seat h)",
                  "ASSUMPTION (analogue evidence: training_effect)")


def incident_baseline(p: Params) -> dict[str, float]:
    """Expected machine-related incidents and cost per machine-year before Sentinel."""
    workers = p["workers_exposed_per_machine"]
    injuries = workers * p["recordable_rate_per_worker_year"] * p["machine_related_share_of_recordables"]
    deaths = workers * p["fatality_rate_per_worker_year"] * p["machine_related_share_of_fatalities"]
    damage = p["property_damage_incidents_per_machine_year"]
    cost = (injuries * p["cost_per_recordable_injury"] + deaths * p["cost_per_fatality"]
            + damage * p["cost_per_property_damage_incident"])
    return {"recordables": injuries, "fatalities": deaths, "property_damage": damage, "expected_cost_usd": cost}


def safety_expected_value(p: Params) -> LeverResult:
    """EXPECTED incident cost avoided. A probability-weighted value, not a promise.

    incident-risk reduction = precursor-event reduction × share of risk carried by those precursors.
    """
    base = incident_baseline(p)
    risk_red = p["precursor_event_reduction_frac"] * p["precursor_risk_attribution_frac"]
    events = p["high_risk_events_per_100h"] * p["operating_hours_per_year"] / 100
    gains = {
        "high_risk_events_per_year_baseline": events,
        "high_risk_events_avoided_per_year": events * p["precursor_event_reduction_frac"],
        "precursor_event_reduction_pct": 100 * p["precursor_event_reduction_frac"],
        "incident_risk_reduction_pct": 100 * risk_red,
        "expected_recordables_avoided_per_year": base["recordables"] * risk_red,
        "expected_property_incidents_avoided_per_year": base["property_damage"] * risk_red,
        "baseline_expected_incident_cost_usd": base["expected_cost_usd"],
    }
    return _lever("safety", base["expected_cost_usd"] * risk_red, gains,
                  "expected machine-related incident cost × precursor reduction × attribution (EXPECTED VALUE)",
                  "ESTABLISHED rates/costs × ASSUMPTION reduction")


def wear_savings(p: Params) -> LeverResult:
    """Smoother operation → less operator-driven wear. WEAK EVIDENCE: assumption-flagged."""
    _, work_h, _ = hours(p)
    red = p["operator_sensitive_maintenance_share"] * p["wear_reduction_frac"]
    gains = {"maintenance_cost_reduction_pct": 100 * red,
             "maintenance_usd_per_working_h_saved": p["machine_operating_cost_ex_fuel_per_h"] * red}
    return _lever("wear", work_h * p["machine_operating_cost_ex_fuel_per_h"] * red, gains,
                  "working h × non-fuel operating cost × operator-sensitive share × reduction",
                  "ASSUMPTION (weak evidence)")


def planning_value(p: Params) -> LeverResult:
    """Better task-time estimates: fewer waiting haul trucks and less bid contingency."""
    _, work_h, _ = hours(p)
    truck_h = p["truck_wait_hours_per_machine_year"] * p["truck_wait_reduction_frac"]
    truck_usd = truck_h * p["haul_truck_cost_per_h"]
    bid_usd = work_h * p["billed_rate_per_h"] * p["bid_risk_reduction_frac_of_revenue"]
    gains = {"truck_wait_hours_avoided_per_year": truck_h,
             "truck_wait_minutes_avoided_per_shift": 60 * truck_h / shifts_per_year(p),
             "truck_usd_per_year": truck_usd, "bid_risk_usd_per_year": bid_usd}
    return _lever("planning", truck_usd + bid_usd, gains,
                  "truck wait h avoided × truck cost + revenue × bid-risk reduction", "ASSUMPTION")


LEVERS: dict[str, Callable[[Params], LeverResult]] = {
    "productivity": productivity_gain,
    "idle_fuel": fuel_savings_idle,
    "training": training_cost_savings,
    "safety": safety_expected_value,
    "wear": wear_savings,
    "planning": planning_value,
}


# ---------------------------------------------------------------- totals
def annual_value_per_machine(p: Params) -> dict[str, Any]:
    """All levers for one machine-year, gross value, subscription and net value."""
    levers = {name: fn(p) for name, fn in LEVERS.items()}
    gross = sum(lv["usd"] for lv in levers.values())
    sub = p["subscription_per_machine_per_year"]
    return {"levers": levers, "gross_usd": round(gross, 2), "subscription_usd": round(sub, 2),
            "net_usd": round(gross - sub, 2)}


def payback_months(one_off_usd: float, annual_net_usd: float) -> float | None:
    """Months to recover the one-off cost from net value. None if the net value is not positive."""
    if annual_net_usd <= 0:
        return None
    return round(12.0 * max(one_off_usd, 0.0) / annual_net_usd, 2)


def fleet_value(p: Params, fleet_size: int | None = None) -> dict[str, Any]:
    """Scale one machine-year to the fleet and add the one-off cost, payback and ROI multiple."""
    n = int(fleet_size if fleet_size is not None else p["fleet_size"])
    per = annual_value_per_machine(p)
    one_off = n * p["one_off_per_machine"]
    net = n * per["net_usd"]
    year1_cost = n * per["subscription_usd"] + one_off
    return {
        "fleet_size": n,
        "gross_usd": round(n * per["gross_usd"], 2),
        "subscription_usd": round(n * per["subscription_usd"], 2),
        "net_usd": round(net, 2),
        "one_off_usd": round(one_off, 2),
        "payback_months": payback_months(one_off, net),
        "year1_roi_multiple": round(n * per["gross_usd"] / year1_cost, 2) if year1_cost > 0 else None,
    }


def sensitivity(overrides: Mapping[str, Any] | None = None, top_n: int = 8,
                config: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
    """Tornado list: swing of net value per machine when one assumption goes low→high (others base)."""
    config = config or load_config()
    sp = specs(config)
    fixed = set(validate_overrides(overrides, config))
    p0 = resolve("base", overrides, config)
    rows = []
    for name in uncertain_names(config):
        if name in fixed:
            continue
        lo = annual_value_per_machine({**p0, name: float(sp[name]["low"])})["net_usd"]
        hi = annual_value_per_machine({**p0, name: float(sp[name]["high"])})["net_usd"]
        rows.append({"name": name, "unit": sp[name]["unit"], "tag": sp[name]["tag"],
                     "low": sp[name]["low"], "base": p0[name], "high": sp[name]["high"],
                     "net_usd_at_low": lo, "net_usd_at_high": hi, "swing_usd": round(abs(hi - lo), 2)})
    rows.sort(key=lambda r: r["swing_usd"], reverse=True)
    return rows[:top_n]


def sample_params(n: int = 1000, seed: int = 7, overrides: Mapping[str, Any] | None = None,
                  config: Mapping[str, Any] | None = None) -> list[Params]:
    """Monte Carlo parameter sets: each uncertain assumption ~ triangular(low, base, high), independent.

    Seeded, so results are reproducible. Overridden assumptions are held fixed.
    """
    config = config or load_config()
    sp = specs(config)
    fixed = set(validate_overrides(overrides, config))
    p0 = resolve("base", overrides, config)
    rng = np.random.default_rng(seed)
    names = [x for x in uncertain_names(config) if x not in fixed]
    draws = {x: rng.triangular(float(sp[x]["low"]), float(sp[x]["base"]), float(sp[x]["high"]), n) for x in names}
    return [{**p0, **{x: float(d[i]) for x, d in draws.items()}} for i in range(n)]


def percentiles(values: list[float], qs: tuple[int, ...] = (10, 50, 90)) -> dict[str, float]:
    arr = np.asarray(values, dtype=float)
    return {f"p{q}": round(float(np.percentile(arr, q)), 4) for q in qs}


def uncertainty(overrides: Mapping[str, Any] | None = None, fleet_size: int | None = None, n: int = 1000,
                seed: int = 7, config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """P10/P50/P90 of per-machine gross/net value, fleet net value and payback (Monte Carlo)."""
    samples = sample_params(n, seed, overrides, config)
    per = [annual_value_per_machine(p) for p in samples]
    fleets = [fleet_value(p, fleet_size) for p in samples]
    never = sum(1 for f in fleets if f["payback_months"] is None)
    paybacks = [f["payback_months"] if f["payback_months"] is not None else math.inf for f in fleets]
    pb = percentiles(paybacks)
    return {"method": f"{n} Monte Carlo draws, triangular(low, base, high), independent, seed {seed}",
            "per_machine_gross_usd": percentiles([x["gross_usd"] for x in per]),
            "per_machine_net_usd": percentiles([x["net_usd"] for x in per]),
            "fleet_net_usd": percentiles([f["net_usd"] for f in fleets]),
            "payback_months": {k: (None if math.isinf(v) else v) for k, v in pb.items()},
            "share_never_pays_back": round(never / n, 4)}


def scenario_summary(overrides: Mapping[str, Any] | None = None, fleet_size: int | None = None,
                     config: Mapping[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """Per-machine and fleet totals for the low / base / high corners."""
    out = {}
    for s in SCENARIOS:
        p = resolve(s, overrides, config)
        per = annual_value_per_machine(p)
        out[s] = {"per_machine_gross_usd": per["gross_usd"], "per_machine_net_usd": per["net_usd"],
                  "fleet": fleet_value(p, fleet_size),
                  "output_uplift_pct": per["levers"]["productivity"]["gains"]["output_uplift_pct"]}
    return out


def _headline_gains(levers: Mapping[str, LeverResult]) -> dict[str, float]:
    g = {k: lv["gains"] for k, lv in levers.items()}
    return {
        "output_uplift_pct": g["productivity"]["output_uplift_pct"],
        "extra_m3_per_shift": g["productivity"]["extra_m3_per_shift"],
        "extra_m3_per_year": g["productivity"]["extra_m3_per_year"],
        "productive_hours_freed_per_year": g["productivity"]["productive_hours_freed_per_year"],
        "idle_hours_avoided_per_year": g["idle_fuel"]["idle_hours_avoided_per_year"],
        "idle_minutes_avoided_per_shift": g["idle_fuel"]["idle_minutes_avoided_per_shift"],
        "fuel_l_saved_per_year": g["idle_fuel"]["fuel_l_saved_per_year"] + g["productivity"]["fuel_l_saved_per_year"],
        "co2_kg_avoided_per_year": g["idle_fuel"]["co2_kg_avoided_per_year"],
        "days_to_proficiency_saved_per_new_operator": g["training"]["days_to_proficiency_saved_per_new_operator"],
        "instructor_hours_saved_per_new_operator": g["training"]["instructor_hours_saved_per_new_operator"],
        "high_risk_events_avoided_per_year": g["safety"]["high_risk_events_avoided_per_year"],
        "incident_risk_reduction_pct": g["safety"]["incident_risk_reduction_pct"],
        "truck_wait_hours_avoided_per_year": g["planning"]["truck_wait_hours_avoided_per_year"],
    }


def estimate(scenario: Scenario = "base", fleet_size: int | None = None,
             overrides: Mapping[str, Any] | None = None, top_n: int = 8,
             config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Full estimate: gains (operational units) first, then the USD view, scenarios and tornado."""
    config = config or load_config()
    p = resolve(scenario, overrides, config)
    per = annual_value_per_machine(p)
    fleet = fleet_value(p, fleet_size)
    n = fleet["fleet_size"]
    gains_pm = _headline_gains(per["levers"])
    scaled = {"output_uplift_pct", "incident_risk_reduction_pct", "idle_minutes_avoided_per_shift",
              "extra_m3_per_shift", "days_to_proficiency_saved_per_new_operator",
              "instructor_hours_saved_per_new_operator"}
    return {
        "label": LABEL,
        "version": config["version"],
        "machine_class": config["machine_class"],
        "currency": config["currency"],
        "scenario": scenario,
        "gains": {
            "per_machine_per_year": {k: round(v, 2) for k, v in gains_pm.items()},
            "fleet_per_year": {k: round(v if k in scaled else v * n, 2) for k, v in gains_pm.items()},
        },
        "usd": {
            "per_machine": {"levers": {k: lv["usd"] for k, lv in per["levers"].items()},
                            "gross_usd": per["gross_usd"], "subscription_usd": per["subscription_usd"],
                            "net_usd": per["net_usd"]},
            "fleet": fleet,
            "payback_months": fleet["payback_months"],
        },
        "levers": per["levers"],
        "scenarios": scenario_summary(overrides, fleet_size, config),
        "uncertainty": uncertainty(overrides, fleet_size, config=config),
        "sensitivity": sensitivity(overrides, top_n, config),
        "overrides": validate_overrides(overrides, config),
        "assumptions_used": p,
        "notes": [
            "Gains are modelled from editable assumptions; none is a measured customer result.",
            "Prototype metrics are SIMULATED. Customer ROI needs a controlled pilot.",
            "Safety is an expected value (probability × cost), not a promise.",
            "Wear is assumption-flagged (weak public evidence).",
            "low/high scenarios are all-conservative / all-optimistic stress corners; use the Monte Carlo "
            "P10–P90 in 'uncertainty' as the headline range.",
        ],
    }


# ---------------------------------------------------------------- practice analyser view
def _practice_rates(productivity: Mapping[str, Any], p: Params) -> tuple[float, float]:
    """(trainee, expert) m³/h from a PracticeReport.productivity dict."""
    t, e = productivity.get("trainee_m3_per_h"), productivity.get("expert_m3_per_h")
    if t is not None and e is not None:
        return float(t), float(e)
    tc, ec = productivity.get("trainee_cycle_s"), productivity.get("expert_cycle_s")
    expert = float(e) if e is not None else p["expert_production_m3_per_h"]
    if tc and ec:
        rel = float(ec) / float(tc)
        tf, ef = productivity.get("trainee_bucket_fill_t"), productivity.get("expert_bucket_fill_t")
        if tf and ef:
            rel *= float(tf) / float(ef)
        return expert * rel, expert
    if productivity.get("gap_pct") is not None:
        return expert * (1 - float(productivity["gap_pct"]) / 100), expert
    raise ValueError("productivity needs trainee/expert m3_per_h, trainee/expert cycle_s, or gap_pct")


PRACTICE_ASSUMPTIONS = ("practice_gap_closure_frac", "operating_hours_per_year", "idle_share_baseline",
                        "shift_engine_hours", "fuel_working_l_per_h", "fuel_price_per_l",
                        "machine_operating_cost_ex_fuel_per_h", "machine_ownership_cost_per_h",
                        "operator_wage_loaded_per_h", "time_value_realization_frac")


def _practice_point(trainee: float, expert: float, closure: float, p: Params) -> dict[str, float]:
    gap_m3 = max(expert - trainee, 0.0)
    extra = gap_m3 * closure
    work_h = p["operating_hours_per_year"] * (1 - p["idle_share_baseline"])
    hours_saved = work_h * (1 - trainee / (trainee + extra)) if trainee + extra > 0 else 0.0
    return {"closure_frac": closure,
            "extra_m3_per_h": extra,
            "extra_m3_per_shift": extra * productive_hours_per_shift(p),
            "extra_m3_per_year": extra * work_h,
            "output_uplift_pct": 100 * extra / trainee if trainee > 0 else 0.0,
            "productive_hours_freed_per_year": hours_saved,
            "usd_per_year": hours_saved * productive_hour_value(p)}


def practice_value(productivity: Mapping[str, Any], assumptions: Params | None = None,
                   closure: float | None = None, config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Turn a PracticeReport.productivity gap into gains and money for one operator-year.

    "Closing X% of your gap to expert = +Y m³/shift = $Z/yr per operator", with the assumptions
    used listed. Suitable for ``PracticeReport.value_estimate``.
    """
    config = config or load_config()
    p = dict(assumptions) if assumptions is not None else base_params(config)
    trainee, expert = _practice_rates(productivity, p)
    if trainee <= 0 or expert <= 0:
        raise ValueError("m3_per_h values must be positive")
    c = p["practice_gap_closure_frac"] if closure is None else float(closure)
    if not 0.0 <= c <= 1.0:
        raise ValueError("closure must be in [0, 1]")
    pt = _practice_point(trainee, expert, c, p)
    gains: dict[str, float] = {
        "gap_to_expert_pct": 100 * max(expert - trainee, 0.0) / expert,
        "output_uplift_pct": pt["output_uplift_pct"],
        "extra_m3_per_shift": pt["extra_m3_per_shift"],
        "extra_m3_per_year": pt["extra_m3_per_year"],
        "productive_hours_freed_per_year": pt["productive_hours_freed_per_year"],
    }
    tc, ec = productivity.get("trainee_cycle_s"), productivity.get("expert_cycle_s")
    if tc and ec:
        gains["cycle_s_saved"] = max(float(tc) - float(ec), 0.0) * c
    ft, fe = productivity.get("fuel_l_per_m3_trainee"), productivity.get("fuel_l_per_m3_expert")
    if ft is not None and fe is not None:
        annual_m3 = trainee * p["operating_hours_per_year"] * (1 - p["idle_share_baseline"])
        gains["fuel_l_saved_per_year"] = annual_m3 * max(float(ft) - float(fe), 0.0) * c
    else:
        gains["fuel_l_saved_per_year"] = pt["productive_hours_freed_per_year"] * p["fuel_working_l_per_h"]
    sp = specs(config)
    return {
        "label": LABEL,
        "headline": (f"Closing {c:.0%} of your gap to expert = +{pt['extra_m3_per_shift']:.0f} m³/shift "
                     f"(+{pt['output_uplift_pct']:.1f}% output) = ${pt['usd_per_year']:,.0f}/yr per operator (ESTIMATE)"),
        "trainee_m3_per_h": round(trainee, 2),
        "expert_m3_per_h": round(expert, 2),
        "gains": {k: round(v, 2) for k, v in gains.items()},
        "usd": {"annual_value_usd": round(pt["usd_per_year"], 2),
                "basis": "hours saved for the same work × (variable cost + realised ownership/labour)"},
        "annual_value_usd": round(pt["usd_per_year"], 2),
        "ladder": [{k: round(v, 2) for k, v in _practice_point(trainee, expert, x, p).items()}
                   for x in (0.10, 0.25, 0.50)],
        "assumptions": {n: {"value": p[n], "unit": sp[n]["unit"], "source": sp[n]["source"], "tag": sp[n]["tag"]}
                        for n in PRACTICE_ASSUMPTIONS},
        "simulated": True,
    }
