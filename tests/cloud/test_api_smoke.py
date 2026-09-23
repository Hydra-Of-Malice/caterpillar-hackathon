"""TestClient smoke tests for every cloud route on a temp DB with the SIMULATED demo fixtures."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from sentinel.shared.schemas import Attribution, Event, Provenance, RiskCategory

API = "/api/v1"


def _next_weekday() -> date:
    d = date.today() + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def test_openapi_title_and_health(client: TestClient) -> None:
    assert client.get("/openapi.json").json()["info"]["title"] == "CAT Sentinel Cloud"
    assert client.get(f"{API}/health").json()["status"] == "ok"


def test_cors_allows_vite_dev_server(client: TestClient) -> None:
    r = client.options(f"{API}/health", headers={"Origin": "http://localhost:5173",
                                                 "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_ingest_batch_is_idempotent(client: TestClient) -> None:
    ev = Event(event_id="evt_ingest_1", ts=1_790_300_000.0, site_id="north-quarry", machine_id="EX-09",
               operator_id="OP-1007", shift_id="SH-X", type="fast_swing_near_truck",
               category=RiskCategory.dangerous_condition, provenance=[Provenance.RULE],
               attribution=Attribution.operator).model_dump(mode="json")
    items = [{"uuid": "u1", "kind": "event", "payload": ev},
             {"uuid": "u2", "kind": "exposure", "payload": {"operator_id": "OP-1007", "shift_id": "SH-X",
                                                           "task_type": "truck_loading", "operating_h": 2.0,
                                                           "cycles": 20, "truck_approach_cycles": 20}},
             {"uuid": "u3", "kind": "shift", "payload": {"shift_id": "SH-X", "operator_id": "OP-1007",
                                                        "machine_id": "EX-09", "planned_start": 1_790_290_000.0}},
             {"uuid": "u4", "kind": "health", "payload": {"machine_id": "EX-09", "protection": "active"}},
             {"uuid": "u5", "kind": "event", "payload": {"type": "broken"}},
             {"uuid": "u6", "kind": "nonsense", "payload": {}}]
    first = client.post(f"{API}/ingest/batch", json={"items": items}).json()
    assert first["accepted"] == 4 and len(first["rejected"]) == 2
    assert (first["inserted"], first["updated"]) == (3, 1)          # EX-09 already exists → health updates it
    second = client.post(f"{API}/ingest/batch", json={"items": items}).json()
    assert second["inserted"] == 0 and second["updated"] == 4
    events = client.get(f"{API}/behaviour/events", params={"operator_id": "OP-1007", "type": "fast_swing_near_truck"})
    assert len(events.json()["items"]) == 1


def test_profile_and_evaluate(client: TestClient) -> None:
    p = client.get(f"{API}/operators/OP-1042/profile").json()
    assert p["operator"]["name"] == "Ravi Kumar" and len(p["competencies"]) == 14
    c04 = next(c for c in p["competencies"] if c["id"] == "C04")
    assert c04["state"] == "observed_gap" and c04["evidence"]["n_events"] == 7
    assert client.get(f"{API}/operators/NOPE/profile").status_code == 404
    r = client.post(f"{API}/competency/evaluate", json={"operator_id": "OP-1042", "shift_id": "SH-OP1042-S1"})
    assert r.status_code == 200 and [g["competency_id"] for g in r.json()["gaps"]] == ["C04"]
    assert client.post(f"{API}/competency/evaluate", json={"operator_id": "OP-9", "shift_id": "S"}).status_code == 404
    assert client.patch(f"{API}/competency/OP-1042/C99", json={"state": "in_training"}).status_code == 404


def test_training_routes(client: TestClient) -> None:
    recs = client.get(f"{API}/training/recommendations", params={"operator_id": "OP-1042"}).json()
    ids = [r["module"]["id"] for r in recs["recommendations"]]
    assert "MOD-SWING-APPROACH" in ids and "MOD-TRENCH-EDGES" in ids
    swing = next(r for r in recs["recommendations"] if r["module"]["id"] == "MOD-SWING-APPROACH")
    assert "7 fast swings" in swing["why"][0]["text"]
    modules = client.get(f"{API}/training/modules").json()["modules"]
    assert len(modules) >= 8
    detail = client.get(f"{API}/training/modules/MOD-SWING-APPROACH").json()
    assert detail["key_points"][0]["citation"]["chunk_id"] == "SOP-EX-04@1.2#3.2"
    assert detail["citation_check"]["status"] == "PASS"
    assert client.get(f"{API}/training/modules/MOD-NOPE").status_code == 404
    assert len(client.get(f"{API}/training/quiz/MOD-TRENCH-EDGES").json()["questions"]) == 5
    done = client.post(f"{API}/training/modules/MOD-SWING-APPROACH/complete", json={"operator_id": "OP-1042"})
    assert done.status_code == 200


def test_bookings_mock(client: TestClient) -> None:
    names = [i["name"] for i in client.get(f"{API}/instructors").json()["instructors"]]
    assert "Marcus Lee" in names and len(names) == 2
    slots = client.get(f"{API}/instructors/slots", params={"instructor_id": "INS-01",
                                                           "from_date": _next_weekday().isoformat()}).json()["slots"]
    slot = next(s for s in slots if s["available"])
    body = {"operator_id": "OP-1042", "instructor_id": "INS-01", "slot_id": slot["slot_id"], "format": "simulator",
            "competency_id": "C04"}
    b = client.post(f"{API}/bookings", json=body)
    assert b.status_code == 200 and b.json()["mock"] and b.json()["evidence"]["n_events"] == 7
    assert client.post(f"{API}/bookings", json=body).status_code == 409
    booked = client.get(f"{API}/instructors/slots", params={"instructor_id": "INS-01",
                                                            "from_date": _next_weekday().isoformat()}).json()["slots"]
    assert not next(s for s in booked if s["slot_id"] == slot["slot_id"])["available"]


def test_copilot_extractive_and_refused(client: TestClient) -> None:
    a = client.post(f"{API}/copilot/ask", json={"question": "How should I control swing speed approaching the truck?"})
    assert a.json()["mode"] == "extractive" and a.json()["citations"]
    r = client.post(f"{API}/copilot/ask", json={"question": "What is the relief pressure on a 320?"}).json()
    assert r["mode"] == "refused"
    gaps = client.get(f"{API}/instructor/content-review").json()["content_gaps"]
    assert any("relief pressure" in g["question"] for g in gaps)


def test_reassessment_route_uses_fixture_fallback(client: TestClient) -> None:
    r = client.get(f"{API}/reassessment", params={"operator_id": "OP-1042", "competency_id": "C04"}).json()
    assert r["rr"] == 0.514 and r["ci95"] == [0.052, 2.701] and r["label"] == "SIMULATED"
    assert r["fixture_loaded"] == ["shift2"]
    assert client.get(f"{API}/reassessment", params={"operator_id": "OP-1007", "competency_id": "C04"}).status_code == 404


def test_supervisor_routes(client: TestClient) -> None:
    crew = client.get(f"{API}/supervisor/crew-summary").json()
    assert [r["machine_id"] for r in crew["rows"]] == ["EX-07", "EX-09"]
    ex07 = crew["rows"][0]
    assert ex07["current_task"]["task_id"] == "T-1" and ex07["protection"]["status"] == "active"
    assert ex07["operations"]["idle_min_by_reason"] == {"waiting_for_truck": 24.0, "unexplained": 14.0}
    assert ex07["operations"]["m3_moved"] == 180.0 and ex07["operations"]["label"] == "SIMULATED"
    assert crew["kpis"]["open_escalations"] == 1 and crew["kpis"]["protection_degraded"] == 1
    esc = client.get(f"{API}/supervisor/escalations").json()
    assert esc["open"] == 1 and esc["items"][0]["what"] == "Break recommendation snoozed"
    eid = esc["items"][0]["escalation_id"]
    res = client.post(f"{API}/supervisor/escalations/{eid}/resolve", json={"note": "radioed"},
                      headers={"X-Role": "supervisor", "X-Actor": "SUP-01"})
    assert res.json()["resolution"]["by"] == "SUP-01"
    assert client.get(f"{API}/supervisor/escalations").json()["open"] == 0
    assert client.post(f"{API}/supervisor/escalations/nope/resolve", json={},
                       headers={"X-Role": "supervisor"}).status_code == 404
    issues = client.get(f"{API}/supervisor/machine-issues").json()["items"]
    assert issues[0]["n_operators"] == 2 and issues[0]["dtc"]


def test_idle_and_behaviour(client: TestClient) -> None:
    idle = client.get(f"{API}/idle/summary").json()
    ex07 = next(m for m in idle["machines"] if m["machine_id"] == "EX-07")
    assert (ex07["waiting_for_truck_min"], ex07["unexplained_min"]) == (24.0, 14.0)
    assert ex07["fuel_l_unexplained"] == 0.7 and idle["label"] == "SIMULATED"
    assert client.get(f"{API}/idle/summary", params={"date": "2020-01-01"}).json()["machines"] == []
    beh = client.get(f"{API}/behaviour/events", params={"attribution": "machine"}).json()
    assert beh["items"] and all(not i["competency_map"]["counts_toward_competency"] for i in beh["items"])
    assert set(client.get(f"{API}/behaviour/events").json()["counts"]["by_attribution"]) >= {"operator", "machine"}


def test_instructor_routes(client: TestClient) -> None:
    hm = client.get(f"{API}/instructor/operators", headers={"X-Role": "instructor"}).json()
    ravi = next(o for o in hm["operators"] if o["operator_id"] == "OP-1042")
    assert ravi["cells"]["C04"] == "observed_gap" and len(ravi["cells"]) == 14
    assert all(isinstance(v, str) for v in ravi["cells"].values())            # states, never scores
    review = client.get(f"{API}/instructor/content-review").json()
    assert "MOD-SWING-APPROACH@1.3" in review["queue"]
    draft = next(i for i in review["items"] if i["id"] == "MOD-SWING-APPROACH@1.3")
    assert draft["citation_check"] == "PASS" and draft["diff"]["added"] and draft["diff_vs"] == "1.2"
    ok = client.post(f"{API}/instructor/content-review/MOD-SWING-APPROACH@1.3/approve",
                     headers={"X-Role": "instructor", "X-Actor": "INS-01 Marcus Lee"})
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    assert client.get(f"{API}/training/modules/MOD-SWING-APPROACH").json()["version"] == "1.3"
    assert client.post(f"{API}/instructor/content-review/MOD-NOPE@1.0/approve",
                       headers={"X-Role": "instructor"}).status_code == 404


def test_monitoring_routes(client: TestClient) -> None:
    rates = client.get(f"{API}/monitoring/alert-rates").json()
    assert rates["operating_h"] > 0 and {t["tier"] for t in rates["tiers"]} >= {"T1", "T2", "T_CRIT"}
    drift = client.get(f"{API}/monitoring/drift").json()["contexts"][0]
    assert drift["context_key"] == "EX-20t|truck_loading" and drift["features"][0]["feature"] == "swing_dps_peak"
    models = client.get(f"{API}/models").json()["models"]
    assert {m["kind"] for m in models} >= {"iforest", "tasktime", "expert_motion"}


def test_demo_fixture_route(client: TestClient) -> None:
    r = client.post(f"{API}/demo/fixture", json={"shifts": ["shift0"]})
    assert r.status_code == 200 and r.json()["loaded"][0]["key"] == "shift0"
    assert client.post(f"{API}/demo/fixture", json={"shifts": ["bogus"]}).status_code == 422
