"""Presentation roll-ups over the value model: unit values, "value today", pitch numbers,
headline gains and the feature → lever catalogue.

Gains in operational units always come first. USD is kept alongside for the Business Value
page only. Everything is an ESTIMATE, and prototype metrics are SIMULATED.
"""
from __future__ import annotations

import math
from typing import Any, Callable, Mapping

from sentinel.value import model as m
from sentinel.value.model import LABEL, Params

PILOT_NOTE = "MODELLED from sourced assumptions; prototype results SIMULATED; a controlled pilot must prove it"


def _src(names: tuple[str, ...], config: Mapping[str, Any]) -> list[dict[str, str]]:
    sp = m.specs(config)
    return [{"assumption": n, "source": sp[n]["source"], "tag": sp[n]["tag"]} for n in names]


RANGE_BASIS = ("low = min(base, Monte Carlo P10), high = max(base, P90); 1,000 draws, triangular(low, base, high), "
               "independent. The base is often below P10 because most ranges skew upward. Corners = "
               "all-conservative / all-optimistic stress cases.")


def _ranged(fn: Callable[[Params], float | None], overrides: Mapping[str, Any] | None,
            config: Mapping[str, Any], samples: list[Params] | None = None) -> dict[str, Any]:
    """{low, base, high} for ``fn``: base scenario plus Monte Carlo P10/P90 and the stress corners.

    ``fn`` may return None (undefined, e.g. never pays back); that value sorts as +inf and is shown as None.
    """
    samples = samples if samples is not None else m.sample_params(overrides=overrides, config=config)
    as_num = lambda v: math.inf if v is None else float(v)  # noqa: E731
    shown = lambda v: None if v is None or math.isinf(v) else round(v, 4)  # noqa: E731
    pct = m.percentiles([as_num(fn(p)) for p in samples])
    base = as_num(fn(m.resolve("base", overrides, config)))
    corners = sorted(as_num(fn(m.resolve(s, overrides, config))) for s in ("low", "high"))
    return {"low": shown(min(pct["p10"], base)), "base": shown(base), "high": shown(max(pct["p90"], base)),
            "p10": shown(pct["p10"]), "p50": shown(pct["p50"]), "p90": shown(pct["p90"]),
            "corner_low": shown(corners[0]), "corner_high": shown(corners[1])}


# ---------------------------------------------------------------- unit values
def _usd_per_event(p: Params) -> float:
    events = p["high_risk_events_per_100h"] * p["operating_hours_per_year"] / 100
    if events <= 0:
        return 0.0
    return m.incident_baseline(p)["expected_cost_usd"] * p["precursor_risk_attribution_frac"] / events


UNIT_DEFS: dict[str, dict[str, Any]] = {
    "usd_per_idle_minute": {
        "label": "Idle minute (fuel + engine-hour cost)", "unit": "USD / idle min",
        "fn": lambda p: (p["idle_fuel_l_per_h"] * p["fuel_price_per_l"] + p["idle_hour_smu_cost_per_h"]) / 60,
        "sources": ("idle_fuel_l_per_h", "fuel_price_per_l", "idle_hour_smu_cost_per_h")},
    "usd_per_m3_extra_production": {
        "label": "Extra m³ produced (cost-avoidance view)", "unit": "USD / m³",
        "fn": lambda p: m.productive_hour_value(p) / p["production_m3_per_h"],
        "sources": ("production_m3_per_h", "fuel_working_l_per_h", "machine_ownership_cost_per_h",
                    "operator_wage_loaded_per_h", "time_value_realization_frac"),
        "note": "Cost of the machine-hour share that one m³ needs. The revenue view (billed rate / m³) is higher and not used."},
    "usd_per_cycle_second_saved_per_shift": {
        "label": "1 s saved on every cycle for one shift", "unit": "USD / (s/cycle) / shift",
        "fn": lambda p: m.productive_hours_per_shift(p) / p["cycle_time_s"] * m.productive_hour_value(p),
        "sources": ("cycle_time_s", "idle_share_baseline", "operator_wage_loaded_per_h")},
    "usd_per_high_risk_event_avoided": {
        "label": "Avoided DANGER/WARNING precursor event (EXPECTED value)", "unit": "USD / event",
        "fn": _usd_per_event,
        "sources": ("recordable_rate_per_worker_year", "cost_per_recordable_injury", "cost_per_fatality",
                    "precursor_risk_attribution_frac", "high_risk_events_per_100h"),
        "note": "Expected incident cost carried by one precursor event. A probability-weighted, conservative value, not a promise."},
    "usd_per_training_day_saved": {
        "label": "Day of ramp-up to proficiency saved", "unit": "USD / day",
        "fn": lambda p: m.productive_hours_per_shift(p) * p["novice_productivity_deficit_frac"] * m.productive_hour_value(p),
        "sources": ("novice_productivity_deficit_frac", "operator_wage_loaded_per_h", "time_value_realization_frac")},
    "usd_per_hour_earlier_task_completion": {
        "label": "Hour of earlier task completion (trucks + crew not waiting)", "unit": "USD / h",
        "fn": lambda p: (m.fixed_cost_per_h(p) + p["haul_trucks_per_excavator"] * p["haul_truck_cost_per_h"])
        * p["time_value_realization_frac"],
        "sources": ("haul_trucks_per_excavator", "haul_truck_cost_per_h", "time_value_realization_frac")},
}

INCIDENT_TYPES = {
    "recordable_injury": "cost_per_recordable_injury",
    "fatality": "cost_per_fatality",
    "property_damage": "cost_per_property_damage_incident",
}


def unit_value(key: str, p: Params) -> float:
    return float(UNIT_DEFS[key]["fn"](p))


def unit_costs(overrides: Mapping[str, Any] | None = None,
               config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """USD per unit of outcome, with low/base/high and sources, for the Business Value page."""
    config = config or m.load_config()
    sp = m.specs(config)
    samples = m.sample_params(overrides=overrides, config=config)
    units = [{"key": k, "label": d["label"], "unit": d["unit"], **_ranged(d["fn"], overrides, config, samples),
              "sources": _src(d["sources"], config), "note": d.get("note", "")}
             for k, d in UNIT_DEFS.items()]
    incidents = [{"key": k, "unit": "USD / incident", "low": sp[n]["low"], "base": sp[n]["base"],
                  "high": sp[n]["high"], "source": sp[n]["source"], "tag": sp[n]["tag"], "note": sp[n]["note"]}
                 for k, n in INCIDENT_TYPES.items()]
    return {"label": LABEL, "version": config["version"], "range_basis": RANGE_BASIS,
            "units": units, "incident_types": incidents}


# ---------------------------------------------------------------- value today
DEMO_TODAY: dict[str, Any] = {
    "site_id": "north-quarry",
    "shift": "demo day shift",
    "machines": 2,
    "engine_hours": 16.0,
    "idle_minutes_by_reason": {"waiting_for_truck": 150, "operator_avoidable": 70,
                               "warm_up_cool_down": 48, "machine_fault": 20},
    "high_risk_events": {"baseline": 7, "observed": 3, "acknowledged": 3},
    "practice": {"trainee_m3_per_h": 180, "expert_m3_per_h": 245, "gap_closure_frac": 0.2, "productive_hours": 5.2},
    "tasks": {"total": 3, "on_time": 2, "minutes_early": 25},
    "simulated": True,
}


def _gain(key: str, label: str, value: float, unit: str, basis: str) -> dict[str, Any]:
    return {"key": key, "label": label, "value": round(value, 2), "unit": unit, "basis": basis}


def value_today(fleet_summary: Mapping[str, Any] | None = None, overrides: Mapping[str, Any] | None = None,
                config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Site/shift roll-up from live quantities. Gains lead; USD line items follow.

    With no ``fleet_summary`` it uses the seeded SIMULATED demo shift (``DEMO_TODAY``).
    """
    config = config or m.load_config()
    p = m.resolve("base", overrides, config)
    demo = fleet_summary is None
    s: Mapping[str, Any] = DEMO_TODAY if demo else fleet_summary
    engine_h = float(s.get("engine_hours", 0.0))
    gains, usd = [], []

    idle = {k: float(v) for k, v in (s.get("idle_minutes_by_reason") or {}).items()}
    if engine_h > 0 and idle:
        baseline_min = float(s.get("baseline_idle_share", p["idle_share_baseline"])) * engine_h * 60
        avoided = max(baseline_min - sum(idle.values()), 0.0)
        gains.append(_gain("idle_minutes_avoided", "Idle minutes avoided vs fleet baseline", avoided, "min",
                           f"baseline {p['idle_share_baseline']:.0%} of engine time minus actual idle"))
        gains.append(_gain("idle_fuel_l_saved", "Idle fuel saved", avoided / 60 * p["idle_fuel_l_per_h"], "L",
                           "avoided idle h × idle burn"))
        usd.append({"key": "idle", "usd": round(avoided * unit_value("usd_per_idle_minute", p), 2)})

    ev = s.get("high_risk_events") or {}
    if ev:
        observed = float(ev.get("observed", 0))
        baseline = float(ev.get("baseline", p["high_risk_events_per_100h"] * engine_h / 100))
        avoided_ev = max(baseline - observed, 0.0)
        gains.append(_gain("high_risk_events_avoided", "High-risk events avoided vs baseline", avoided_ev,
                           "events", "baseline minus observed DANGER/WARNING events"))
        if observed > 0 and "acknowledged" in ev:
            gains.append(_gain("alert_ack_rate", "Alerts acknowledged", 100 * float(ev["acknowledged"]) / observed,
                               "%", "acknowledged / observed"))
        usd.append({"key": "safety_expected", "usd": round(avoided_ev * unit_value("usd_per_high_risk_event_avoided", p), 2)})

    pr = s.get("practice") or {}
    if pr.get("trainee_m3_per_h") and pr.get("expert_m3_per_h"):
        closure = float(pr.get("gap_closure_frac", p["practice_gap_closure_frac"]))
        prod_h = float(pr.get("productive_hours", m.productive_hours_per_shift(p)))
        extra_m3_h = max(float(pr["expert_m3_per_h"]) - float(pr["trainee_m3_per_h"]), 0.0) * closure
        gains.append(_gain("extra_m3", "Extra production from practice gap closed", extra_m3_h * prod_h, "m³",
                           f"{closure:.0%} of trainee gap × productive hours"))
        gains.append(_gain("output_uplift", "Trainee output uplift", 100 * extra_m3_h / float(pr["trainee_m3_per_h"]),
                           "%", "extra m³/h ÷ trainee m³/h"))
        usd.append({"key": "practice", "usd": round(extra_m3_h * prod_h * unit_value("usd_per_m3_extra_production", p), 2)})

    tk = s.get("tasks") or {}
    if tk:
        early = max(float(tk.get("minutes_early", 0.0)), 0.0)
        gains.append(_gain("minutes_earlier", "Task minutes finished early", early, "min", "sum over tasks"))
        if tk.get("total"):
            gains.append(_gain("on_time_rate", "Tasks on time", 100 * float(tk.get("on_time", 0)) / float(tk["total"]),
                               "%", "on-time / total"))
        usd.append({"key": "planning", "usd": round(early / 60 * unit_value("usd_per_hour_earlier_task_completion", p), 2)})

    opportunity = {}
    if idle.get("operator_avoidable"):
        opportunity["avoidable_idle_min_remaining"] = idle["operator_avoidable"]
        opportunity["usd_if_removed"] = round(idle["operator_avoidable"] * unit_value("usd_per_idle_minute", p), 2)
    return {"label": LABEL, "demo": demo, "simulated": bool(s.get("simulated", demo)),
            "site_id": s.get("site_id"), "shift": s.get("shift"),
            "gains": gains,
            "usd": {"line_items": usd, "total_usd": round(sum(i["usd"] for i in usd), 2)},
            "opportunity": opportunity, "inputs_used": dict(s)}


# ---------------------------------------------------------------- pitch and headline gains
def _per_machine(key: str) -> Callable[[Params], float]:
    return lambda p: float(m.annual_value_per_machine(p)[key])


def _payback(p: Params) -> float | None:
    """Payback months, or None when net value is not positive (never pays back)."""
    return m.fleet_value(p)["payback_months"]


def pitch(config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """The five headline numbers for the judges' slide (base with low–high corner range)."""
    config = config or m.load_config()
    lv = lambda name, gain: (lambda p: float(m.LEVERS[name](p)["gains"][gain]))  # noqa: E731
    items = [
        ("annual_value_per_machine", "Annual value per machine (gross)", "USD / machine / yr",
         _per_machine("gross_usd"), ("idle_share_baseline", "operator_wage_loaded_per_h", "productivity_gap_frac",
                                      "cost_per_recordable_injury")),
        ("fleet_10_annual_value", "10-machine fleet, annual value (gross)", "USD / yr",
         lambda p: 10 * float(m.annual_value_per_machine(p)["gross_usd"]), ("fleet_size",)),
        ("payback_months", "Payback on one-off cost (net of subscription)", "months", _payback,
         ("subscription_per_machine_per_year", "one_off_per_machine")),
        ("productivity_uplift_pct", "Fleet output uplift from coaching + training", "% output",
         lv("productivity", "output_uplift_pct"), ("productivity_gap_frac", "gap_closure_frac")),
        ("idle_fuel_saved_usd_per_machine", "Idle fuel saved", "USD / machine / yr",
         lv("idle_fuel", "fuel_usd_per_year"), ("idle_share_baseline", "idle_fuel_l_per_h", "fuel_price_per_l",
                                                "idle_hours_reduction_frac")),
    ]
    samples = m.sample_params(config=config)
    out = []
    for key, label, unit, fn, src in items:
        out.append({"key": key, "label": label, "unit": unit, **_ranged(fn, None, config, samples),
                    "sources": _src(src, config)})
    return {"label": LABEL, "version": config["version"], "status": PILOT_NOTE, "range_basis": RANGE_BASIS,
            "numbers": out,
            "per_machine_net_usd_base": m.annual_value_per_machine(m.resolve("base", None, config))["net_usd"]}


def gains_headline(config: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """4–5 headline gains (operational units) with ranges and sources for the landing hero."""
    config = config or m.load_config()
    sp = m.specs(config)

    def trainee_uplift(p: Params) -> float:
        d = p["novice_productivity_deficit_frac"]
        return 100 * p["practice_gap_closure_frac"] * d / (1 - d)

    def g(name: str, key: str) -> Callable[[Params], float]:
        return lambda p: float(m.LEVERS[name](p)["gains"][key])

    items = [
        ("trainee_output", "Trainee output", "% more m³/h per trainee", trainee_uplift,
         "+{base:.0f}% output per trainee ({low:.0f}–{high:.0f}%)",
         [("Operator skill alone spreads output by 10–15% on the same machine (Caterpillar, secondary)",
           sp["productivity_gap_frac"]["source"], "VENDOR_CLAIM")],
         "closing part of a novice's gap to the Expert Motion Model"),
        ("idle_hours", "Avoidable idle", "% fewer idle hours", lambda p: 100 * p["idle_hours_reduction_frac"],
         "−{base:.0f}% idle hours ({low:.0f}–{high:.0f}%)",
         [("Fleet idle averages 28–38% of engine hours vs a ~20% target (Komatsu, Volvo)",
           sp["idle_share_baseline"]["source"], "ESTABLISHED")],
         "waiting-for-truck idle is context-gated, only avoidable idle is coached"),
        ("idle_fuel", "Idle fuel", "L / machine / yr", g("idle_fuel", "fuel_l_saved_per_year"),
         "−{base:.0f} L idle fuel per machine per year ({low:.0f}–{high:.0f} L)",
         [("~1 gal (3.8 L) per idle hour (Cat)", sp["idle_fuel_l_per_h"]["source"], "VENDOR_CLAIM")],
         "avoided idle hours × idle burn"),
        ("time_to_proficiency", "Time to proficiency", "% faster", lambda p: 100 * p["time_to_proficiency_reduction_frac"],
         "{base:.0f}% faster to proficiency ({low:.0f}–{high:.0f}%)",
         [(s["claim"], s["url"], s["tag"]) for s in config.get("training_effect", {}).get("sources", [])[:3]],
         "targeted feedback / proficiency-based practice, analogue evidence"),
        ("high_risk_events", "High-risk precursor events", "% fewer events",
         lambda p: 100 * p["precursor_event_reduction_frac"],
         "−{base:.0f}% high-risk events ({low:.0f}–{high:.0f}%)",
         [("Proficiency-based training cut excavation utility strikes 35–61%",
           sp["precursor_event_reduction_frac"]["source"], "ESTABLISHED (analogue)")],
         "belt-off-while-moving, person-in-zone, fast swing near truck; demo reduction is SIMULATED"),
    ]
    samples = m.sample_params(config=config)
    out = []
    for key, label, unit, fn, fmt, evidence, basis in items:
        r = _ranged(fn, None, config, samples)
        out.append({"key": key, "label": label, "unit": unit, **r, "headline": fmt.format(**r),
                    "evidence": [{"claim": c, "source": u, "tag": t} for c, u, t in evidence],
                    "basis": basis, "status": PILOT_NOTE})
    return {"label": LABEL, "version": config["version"], "range_basis": RANGE_BASIS, "gains": out}


# ---------------------------------------------------------------- feature → lever catalogue
LEVER_CATALOG: list[dict[str, Any]] = [
    {"feature": "Daily task dashboard + live progress", "requirement": "R1", "levers": ["planning"],
     "gain_units": "truck wait min/shift, tasks on time %",
     "kpi": "Excavator wait-for-truck minutes per shift; schedule adherence",
     "measure": "Telematics idle split by task state + dispatch log, treatment vs control machines"},
    {"feature": "Seatbelt-while-moving T-CRIT + proximity-zone rules", "requirement": "R2", "levers": ["safety"],
     "gain_units": "high-risk events avoided / 100 h",
     "kpi": "Belt-off-while-moving minutes and person-in-zone entries per 100 engine h",
     "measure": "Deterministic rule events (exposure-normalised), 30-day baseline then 60-day treatment"},
    {"feature": "Incident log (auto + manual near-miss)", "requirement": "R2", "levers": ["safety"],
     "gain_units": "near-miss reports / 100 h, incidents",
     "kpi": "Near-miss reporting rate (leading), recordables and property-damage incidents (lagging)",
     "measure": "Incident records vs the site's historical OSHA 300 log (lagging KPIs need > 90 days)"},
    {"feature": "Training hub: gap-targeted micro-modules + instructor booking", "requirement": "R3",
     "levers": ["training"], "gain_units": "days to proficiency, instructor h",
     "kpi": "Days to reach the 'proficient' band; instructor hours per new operator",
     "measure": "New-operator cohort vs the prior cohort; booking log"},
    {"feature": "Practice Analyser (Expert Motion Model)", "requirement": "R3",
     "levers": ["productivity", "training"], "gain_units": "m³/h, s/cycle, % output, expert-likeness",
     "kpi": "Cycle time, m³/h, bucket fill vs expert envelope; score trend",
     "measure": "Same exercise before and after practice; field m³/h from Cat Payload / VisionLink Productivity"},
    {"feature": "Excessive-idle detection with context gating", "requirement": "R4", "levers": ["idle_fuel"],
     "gain_units": "idle min/shift, fuel L",
     "kpi": "Idle share of engine hours excluding waiting-for-truck; idle fuel L",
     "measure": "AEMP 2.0 cumulative idle hours and fuel used, treatment vs control"},
    {"feature": "Unusual-behaviour anomalies + machine/operator attribution", "requirement": "R4",
     "levers": ["safety", "wear"], "gain_units": "unsafe-pattern windows / 100 h, maintenance $/h",
     "kpi": "Anomaly windows per 100 h; repair cost per working hour; fault-code-routed events",
     "measure": "Model events + dealer repair records (wear needs > 12 months: assumption-flagged)"},
    {"feature": "Task-time estimate P10/P50/P90", "requirement": "R5", "levers": ["planning"],
     "gain_units": "minutes earlier, truck wait h, estimate error %",
     "kpi": "P50 absolute error %, P10–P90 coverage, truck queue hours, bid-vs-actual variance",
     "measure": "Estimates vs actual task durations; dispatch truck wait logs"},
]


def levers_catalog() -> dict[str, Any]:
    return {"label": LABEL, "levers": list(m.LEVERS), "features": LEVER_CATALOG}
