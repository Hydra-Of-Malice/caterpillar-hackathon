"""Smoke tests for the /value router (standalone app, base-case defaults)."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sentinel.value.api import router


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return TestClient(app)


def test_assumptions(client):
    r = client.get("/api/v1/value/assumptions")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] and "idle_share_baseline" in body["assumptions"] and body["training_effect"]


def test_estimate_default_and_scenarios(client):
    r = client.post("/api/v1/value/estimate")
    assert r.status_code == 200
    base = r.json()
    assert base["label"] == "ESTIMATE — assumptions editable; prototype metrics SIMULATED"
    assert base["gains"]["per_machine_per_year"]["idle_hours_avoided_per_year"] > 0
    assert base["usd"]["payback_months"] > 0 and base["sensitivity"]
    nets = [client.post("/api/v1/value/estimate", json={"scenario": s, "fleet_size": 10}).json()
            ["usd"]["per_machine"]["net_usd"] for s in ("low", "base", "high")]
    assert nets[0] < nets[1] < nets[2]


def test_estimate_overrides_and_validation(client):
    r = client.post("/api/v1/value/estimate", json={"overrides": {"fuel_price_per_l": 1.5}, "fleet_size": 3})
    assert r.status_code == 200 and r.json()["usd"]["fleet"]["fleet_size"] == 3
    assert r.json()["assumptions_used"]["fuel_price_per_l"] == 1.5
    assert client.post("/api/v1/value/estimate", json={"overrides": {"nope": 1}}).status_code == 422
    assert client.post("/api/v1/value/estimate", json={"scenario": "extreme"}).status_code == 422


def test_practice(client):
    prod = {"trainee_cycle_s": 31.0, "expert_cycle_s": 23.0, "trainee_m3_per_h": 180, "expert_m3_per_h": 245}
    r = client.post("/api/v1/value/practice", json={"productivity": prod})
    assert r.status_code == 200
    body = r.json()
    assert body["gains"]["extra_m3_per_shift"] > 0 and body["usd"]["annual_value_usd"] > 0
    assert client.post("/api/v1/value/practice", json={"productivity": {}}).status_code == 422


def test_levers_cover_all_requirements(client):
    body = client.get("/api/v1/value/levers").json()
    reqs = {f["requirement"] for f in body["features"]}
    assert reqs == {"R1", "R2", "R3", "R4", "R5"}
    assert any("Practice Analyser" in f["feature"] for f in body["features"])
    assert all(f["kpi"] and f["measure"] for f in body["features"])


def test_unit_costs(client):
    body = client.get("/api/v1/value/unit-costs").json()
    keys = {u["key"] for u in body["units"]}
    assert {"usd_per_idle_minute", "usd_per_m3_extra_production", "usd_per_cycle_second_saved_per_shift",
            "usd_per_high_risk_event_avoided", "usd_per_training_day_saved",
            "usd_per_hour_earlier_task_completion"} <= keys
    for u in body["units"]:
        assert u["low"] <= u["base"] <= u["high"] and u["sources"]
    assert {i["key"] for i in body["incident_types"]} == {"recordable_injury", "fatality", "property_damage"}


def test_today_demo_and_custom(client):
    demo = client.post("/api/v1/value/today").json()
    assert demo["demo"] and demo["simulated"] and demo["gains"] and demo["usd"]["total_usd"] > 0
    custom = client.post("/api/v1/value/today", json={"fleet_summary": {
        "engine_hours": 8, "idle_minutes_by_reason": {"operator_avoidable": 60, "waiting_for_truck": 60}}}).json()
    assert not custom["demo"]
    assert custom["gains"][0]["key"] == "idle_minutes_avoided" and custom["gains"][0]["value"] == pytest.approx(48.0)


def test_pitch_and_gains_headline(client):
    pitch = client.get("/api/v1/value/pitch").json()
    keys = [n["key"] for n in pitch["numbers"]]
    assert keys == ["annual_value_per_machine", "fleet_10_annual_value", "payback_months",
                    "productivity_uplift_pct", "idle_fuel_saved_usd_per_machine"]
    for n in pitch["numbers"]:
        assert n["low"] <= n["base"] <= n["high"] and n["sources"]
    gains = client.get("/api/v1/value/gains-headline").json()["gains"]
    assert 4 <= len(gains) <= 5
    assert all(g["headline"] and g["evidence"] and g["low"] <= g["base"] <= g["high"] for g in gains)
