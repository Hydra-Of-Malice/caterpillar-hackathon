"""Value model: monotonicity, zero-change → zero value, scenario ordering, config integrity."""
from __future__ import annotations

import pytest

from sentinel.value import model as m

ZERO_CHANGE = {
    "gap_closure_frac": 0, "idle_hours_reduction_frac": 0, "time_to_proficiency_reduction_frac": 0,
    "instructor_hours_reduction_frac": 0, "training_machine_hours_reduction_frac": 0,
    "precursor_event_reduction_frac": 0, "wear_reduction_frac": 0, "truck_wait_reduction_frac": 0,
    "bid_risk_reduction_frac_of_revenue": 0,
}


@pytest.fixture()
def base() -> m.Params:
    return m.resolve("base")


def test_config_every_assumption_is_documented():
    cfg = m.load_config()
    assert cfg["version"]
    for name, spec in cfg["assumptions"].items():
        assert spec["low"] <= spec["base"] <= spec["high"], name
        for field in ("unit", "tag", "source", "note"):
            assert spec.get(field), (name, field)
        assert spec["tag"] in {"ESTABLISHED", "VENDOR_CLAIM", "ASSUMPTION", "INPUT"}, name
    te = cfg["training_effect"]
    assert te["sources"] and te["learning_rate_multiplier"]["low"] < te["learning_rate_multiplier"]["high"]


@pytest.mark.parametrize("closure_lo,closure_hi", [(0.0, 0.1), (0.1, 0.2), (0.2, 0.5), (0.5, 1.0)])
def test_productivity_monotonic_in_gap_closure(base, closure_lo, closure_hi):
    lo = m.productivity_gain(base, closure=closure_lo)
    hi = m.productivity_gain(base, closure=closure_hi)
    assert hi["usd"] > lo["usd"]
    assert hi["gains"]["output_uplift_pct"] > lo["gains"]["output_uplift_pct"]
    assert hi["gains"]["extra_m3_per_shift"] > lo["gains"]["extra_m3_per_shift"]


def test_productivity_monotonic_in_gap(base):
    values = [m.productivity_gain(base, gap=g)["usd"] for g in (0.05, 0.1, 0.2, 0.4)]
    assert values == sorted(values) and len(set(values)) == len(values)


@pytest.mark.parametrize("name,lever", [
    ("idle_hours_reduction_frac", "idle_fuel"),
    ("precursor_event_reduction_frac", "safety"),
    ("time_to_proficiency_reduction_frac", "training"),
    ("wear_reduction_frac", "wear"),
    ("truck_wait_reduction_frac", "planning"),
])
def test_each_lever_monotonic_in_its_effect(base, name, lever):
    small = m.LEVERS[lever]({**base, name: 0.05})["usd"]
    large = m.LEVERS[lever]({**base, name: 0.25})["usd"]
    assert large > small


def test_zero_change_gives_zero_value(base):
    p = {**base, **ZERO_CHANGE}
    per = m.annual_value_per_machine(p)
    assert all(lv["usd"] == 0 for lv in per["levers"].values()), per["levers"]
    assert per["gross_usd"] == 0
    assert m.productivity_gain(base, gap=0.0)["usd"] == 0
    assert m.fleet_value(p)["payback_months"] is None       # never pays back with no value


def test_scenario_ordering_low_lt_base_lt_high():
    s = m.scenario_summary()
    assert s["low"]["per_machine_net_usd"] < s["base"]["per_machine_net_usd"] < s["high"]["per_machine_net_usd"]
    assert s["low"]["per_machine_gross_usd"] < s["base"]["per_machine_gross_usd"] < s["high"]["per_machine_gross_usd"]
    assert s["low"]["fleet"]["net_usd"] < s["base"]["fleet"]["net_usd"] < s["high"]["fleet"]["net_usd"]


def test_overrides_win_and_are_validated():
    assert m.resolve("low", {"fuel_price_per_l": 2.0})["fuel_price_per_l"] == 2.0
    with pytest.raises(ValueError):
        m.resolve("base", {"not_an_assumption": 1})
    with pytest.raises(ValueError):
        m.resolve("base", {"gap_closure_frac": 1.5})
    with pytest.raises(ValueError):
        m.resolve("base", {"fuel_price_per_l": -1})


def test_fleet_scales_linearly_and_payback(base):
    per = m.annual_value_per_machine(base)
    f = m.fleet_value(base, 25)
    assert f["gross_usd"] == pytest.approx(25 * per["gross_usd"], rel=1e-6)
    assert f["payback_months"] == pytest.approx(12 * 25 * base["one_off_per_machine"] / f["net_usd"], abs=0.01)
    assert m.payback_months(1000, 0) is None and m.payback_months(0, 100) == 0


def test_sensitivity_sorted_and_excludes_inputs():
    rows = m.sensitivity(top_n=60)
    swings = [r["swing_usd"] for r in rows]
    assert swings == sorted(swings, reverse=True)
    names = {r["name"] for r in rows}
    assert "fleet_size" not in names and "gap_closure_frac" in names
    assert "gap_closure_frac" not in {r["name"] for r in m.sensitivity({"gap_closure_frac": 0.3}, top_n=60)}


def test_estimate_has_gains_and_usd_and_label():
    e = m.estimate(fleet_size=10)
    assert e["label"].startswith("ESTIMATE")
    assert e["gains"]["per_machine_per_year"]["output_uplift_pct"] > 0
    assert e["usd"]["fleet"]["fleet_size"] == 10
    assert set(e["usd"]["per_machine"]["levers"]) == set(m.LEVERS)
    u = e["uncertainty"]
    assert u["per_machine_net_usd"]["p10"] <= u["per_machine_net_usd"]["p50"] <= u["per_machine_net_usd"]["p90"]


def test_monte_carlo_is_reproducible():
    a = m.uncertainty(n=200, seed=3)
    b = m.uncertainty(n=200, seed=3)
    assert a == b


def test_practice_value_from_m3_and_from_cycles():
    prod = {"trainee_cycle_s": 31.0, "expert_cycle_s": 23.0, "trainee_m3_per_h": 180, "expert_m3_per_h": 245}
    v = m.practice_value(prod)
    assert v["gains"]["gap_to_expert_pct"] == pytest.approx(26.53, abs=0.01)
    assert v["gains"]["extra_m3_per_shift"] > 0 and v["annual_value_usd"] > 0
    assert "m³/shift" in v["headline"] and v["assumptions"]["practice_gap_closure_frac"]["source"]
    ladder = [row["usd_per_year"] for row in v["ladder"]]
    assert ladder == sorted(ladder)
    by_cycles = m.practice_value({"trainee_cycle_s": 31.0, "expert_cycle_s": 23.0})
    assert by_cycles["expert_m3_per_h"] == m.resolve()["expert_production_m3_per_h"]
    assert by_cycles["gains"]["output_uplift_pct"] > 0


def test_practice_value_zero_gap_and_bad_input():
    v = m.practice_value({"trainee_m3_per_h": 200, "expert_m3_per_h": 200})
    assert v["annual_value_usd"] == 0 and v["gains"]["extra_m3_per_shift"] == 0
    assert m.practice_value({"trainee_m3_per_h": 180, "expert_m3_per_h": 245}, closure=0)["annual_value_usd"] == 0
    with pytest.raises(ValueError):
        m.practice_value({"foo": 1})
