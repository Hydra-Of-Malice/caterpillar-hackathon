"""FastAPI TestClient smoke tests for every edge route (SENTINEL_BUS=memory, temp DB, cloud unreachable).

Tests run in file order against one app: checklist gating → start → live/alerts → end → review.
"""
from __future__ import annotations

import time
from datetime import date

import pytest
from fastapi.testclient import TestClient

from sentinel.edge_api.main import create_app
from sentinel.seed import seed
from sentinel.shared import topics
from sentinel.store.db import Database
from tests.edge.conftest import sample, sqlite_url

API = "/api/v1"
SHIFT = "SH-1042-S1"


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("edge_api")
    edge_url, cloud_url = sqlite_url(d / "edge.db"), sqlite_url(d / "cloud.db")
    edge, cloud = Database(edge_url), Database(cloud_url)
    seed(edge, cloud, reset=True, day=date.today())
    edge.engine.dispose()
    cloud.engine.dispose()
    with pytest.MonkeyPatch.context() as mp:
        for key, value in {"SENTINEL_BUS": "memory", "SENTINEL_EDGE_DB": edge_url, "DEMO_MODE": "1",
                           "SENTINEL_CLOUD_API": "http://127.0.0.1:9/api/v1", "SENTINEL_PIPELINE": "noop"}.items():
            mp.setenv(key, value)
        with TestClient(create_app()) as c:
            yield c


def rt(client):
    return client.app.state.runtime


def publish_sample(client, **overrides):
    runtime = rt(client)
    s = sample(time.time(), seq=int(time.time() * 10) % 100000, shift_id=SHIFT, **overrides)
    runtime.memory_bus.publish(topics.telemetry_raw(runtime.site_id, runtime.machine_id), s)


def wait_for(fn, timeout: float = 3.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError("condition not met in time")


def test_01_openapi_cors_health(client):
    assert client.get("/openapi.json").json()["info"]["title"] == "CAT Sentinel Edge"
    r = client.get(f"{API}/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    h = r.json()
    assert h["broker"] == "memory" and h["protection"] == "degraded" and h["cloud"] == "offline"
    assert {"rules", "models"} <= set(h["versions"]) and "outbox_backlog" in h
    assert client.get(f"{API}/health", headers={"Origin": "http://127.0.0.1:5173"}).headers[
        "access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_02_shift_current_tasks_conditions(client):
    cur = client.get(f"{API}/shift/current").json()
    assert cur["shift"]["shift_id"] == SHIFT and cur["operator"]["name"] == "Ravi Kumar"
    assert [t["task_id"] for t in cur["tasks"]] == ["T-1", "T-2", "T-3"]
    assert all(t["estimate"]["p10_min"] <= t["estimate"]["p50_min"] <= t["estimate"]["p90_min"] for t in cur["tasks"])
    assert cur["checklist_status"]["missing"] == ["SC-01"] and cur["eta_mode"] == "baseline"
    tasks = client.get(f"{API}/tasks").json()
    assert len(tasks) >= 5 and all(t["estimate"] for t in tasks)
    assert client.get(f"{API}/tasks", params={"shift_id": SHIFT}).status_code == 200
    cond = client.get(f"{API}/conditions").json()
    assert cond["temp_c"] == 31.0 and cond["source"] == "MOCK" and "stale_s" in cond
    assert client.post(f"{API}/shift/{SHIFT}/privacy-ack").json() == {"ok": True}


def test_03_checklist_gates_start(client):
    items = client.get(f"{API}/checklist/items").json()
    assert len(items) == 14 and len({i["group"] for i in items}) == 4
    assert any(i["critical"] for i in items) and any(i["live_signal"] for i in items)
    r = client.post(f"{API}/shift/{SHIFT}/start")
    assert r.status_code == 409 and r.json()["detail"]["reason"] == "checklist_incomplete"
    r = client.post(f"{API}/shift/{SHIFT}/checklist",
                    json={"results": [{"item_id": "SC-01", "result": "fail", "note": "Overhead line"}]}).json()
    assert r["passed"] is False and r["failed_critical"] == ["SC-01"] and len(r["incident_ids"]) == 1
    r2 = client.post(f"{API}/shift/{SHIFT}/start")
    assert r2.status_code == 409 and r2.json()["detail"]["incident_ids"] == r["incident_ids"]
    inc = client.get(f"{API}/incidents/{r['incident_ids'][0]}").json()
    assert inc["type"] == "checklist_critical_fail" and inc["shift_id"] == SHIFT
    ok = client.post(f"{API}/shift/{SHIFT}/checklist", json={"results": [{"item_id": "SC-01", "result": "pass"}]})
    assert ok.json()["passed"] is True
    assert client.post(f"{API}/shift/{SHIFT}/checklist",
                       json={"results": [{"item_id": "NOPE", "result": "pass"}]}).status_code == 422
    started = client.post(f"{API}/shift/{SHIFT}/start")
    assert started.status_code == 200 and started.json()["shift"]["status"] == "active"
    assert client.post(f"{API}/shift/{SHIFT}/start").json()["already_active"] is True


def test_04_tasks_patch_and_eta(client):
    before = client.get(f"{API}/tasks/T-1/eta").json()
    patched = client.patch(f"{API}/tasks/T-1", json={"done_qty": 210.0}).json()
    assert patched["progress_pct"] == 50.0 and patched["status"] == "in_progress"
    after = client.get(f"{API}/tasks/T-1/eta").json()
    assert after["remaining_p50_min"] < before["remaining_p50_min"]
    assert after["p10_min"] <= after["p50_min"] <= after["p90_min"]
    assert client.patch(f"{API}/tasks/NOPE", json={"done_qty": 1}).status_code == 404
    preview = client.post(f"{API}/eta/preview", json={"task_type": "trenching", "qty": 60, "material": "clay_gravel",
                                                      "operator_id": "OP-1042", "machine_id": "EX-07",
                                                      "planned_start": "2026-09-23T11:30"}).json()
    assert preview["task_id"] == "preview" and preview["p10_min"] <= preview["p50_min"] <= preview["p90_min"]
    low = client.post(f"{API}/eta/preview", json={"task_type": "grading", "qty": 200, "operator_id": "OP-1042",
                                                  "planned_start": "09:30"}).json()
    assert low["low_data"] is True


def test_05_live_snapshot_and_feedback_locked_while_moving(client):
    publish_sample(client, travel_kmh=4.0)
    snap = wait_for(lambda: (s := client.get(f"{API}/live/snapshot").json())["moving"] and s)
    assert snap["seatbelt"] is True and snap["proximity"]["fitted"] and snap["task"]["task_id"] == "T-1"
    assert {"today_min", "waiting_min"} <= set(snap["idle"]) and snap["eta"]["task_id"] == "T-1"
    alert = client.post(f"{API}/demo/inject", json={"kind": "fast_swing"}).json()["alerts"][0]
    r = client.post(f"{API}/alerts/{alert['alert_id']}/feedback", json={"useful": False, "reason": "wrong context"})
    assert r.status_code == 423
    publish_sample(client, travel_kmh=0.0, swing_dps=0.0, joy_swing=0.0, park_brake=True, hyd_lockout=True)
    wait_for(lambda: not client.get(f"{API}/live/snapshot").json()["moving"])
    ok = client.post(f"{API}/alerts/{alert['alert_id']}/feedback", json={"useful": False, "reason": "wrong context"})
    assert ok.status_code == 200 and ok.json()["ok"]
    acked = client.post(f"{API}/alerts/{alert['alert_id']}/ack").json()
    assert acked["state"] == "acknowledged"
    assert client.post(f"{API}/alerts/nope/ack").status_code == 404


def test_05b_task_state_topic_sets_waiting(client):
    runtime = rt(client)
    topic = topics.task_state(runtime.site_id, runtime.machine_id)
    runtime.memory_bus.publish(topic, {"waiting_for_truck": True, "source": "operator_tap"})
    wait_for(lambda: client.get(f"{API}/live/snapshot").json()["waiting_for_truck"])
    runtime.memory_bus.publish(topic, {"waiting_for_truck": False, "source": "operator_tap"})
    wait_for(lambda: not client.get(f"{API}/live/snapshot").json()["waiting_for_truck"])


def test_06_demo_injections_cover_every_outcome(client):
    kinds = client.get(f"{API}/demo/kinds").json()["kinds"]
    r = client.post(f"{API}/demo/inject", json={"kind": "seatbelt_open"}).json()
    assert r["direct"] and r["bus"] == "memory"
    active = client.get(f"{API}/alerts", params={"active": 1}).json()
    assert active[0]["tier"] == "T_CRIT" and not active[0]["dismissible"]
    assert client.post(f"{API}/demo/inject", json={"kind": "person_rear"}).status_code == 200
    person_warn = client.post(f"{API}/demo/inject", json={"kind": "person_warning"}).json()
    assert person_warn["direct"]
    idle = client.post(f"{API}/demo/inject", json={"kind": "idle"}).json()["alerts"][0]
    assert idle["tier"] == "T1" and idle["state"] == "raised"
    waiting = client.post(f"{API}/demo/inject", json={"kind": "idle_waiting"}).json()["alerts"][0]
    assert waiting["state"] == "suppressed" and waiting["suppressed_reason"] == "waiting_for_truck"
    assert client.post(f"{API}/context/task-state", json={"waiting_for_truck": False}).json()["waiting_for_truck"] is False
    hyd = client.post(f"{API}/demo/inject", json={"kind": "hyd_fault"}).json()["alerts"][0]
    assert hyd["what"] == "MACHINE CHECK NEEDED"
    assert client.get(f"{API}/live/snapshot").json()["machine_issues"]
    client.post(f"{API}/demo/inject", json={"kind": "protection_degraded", "params": {"duration_s": 30}})
    assert any("DEMO" in reason for reason in client.get(f"{API}/health").json()["protection_reasons"])
    assert client.post(f"{API}/demo/inject", json={"kind": "truck_wait"}).json()["direct"] is False
    assert client.post(f"{API}/demo/inject", json={"kind": "wan_offline"}).json()["wan_up"] is False
    assert client.post(f"{API}/demo/wan", json={"up": True}).json()["wan_up"] is True
    assert client.post(f"{API}/demo/inject", json={"kind": "bogus"}).status_code == 422
    assert client.post(f"{API}/demo/scenario", json={"name": "ravi_shift1", "speed": 10}).json()["ok"]
    published = rt(client).memory_bus.published[topics.sim_control(rt(client).site_id, rt(client).machine_id)]
    assert {m.get("kind") for m in published} >= {"seatbelt_open", "fast_swing", "person_rear"}
    assert set(kinds) >= {"seatbelt_open", "person_rear", "person_warning", "fast_swing", "idle", "idle_waiting",
                          "protection_degraded", "wan_offline"}


def test_07_fast_forward_break_rule_and_breaks(client):
    r = client.post(f"{API}/demo/fast-forward-operation", json={"minutes": 151}).json()
    assert r["continuous_operation_min"] >= 150
    assert {(a["tier"], a["what"]) for a in r["alerts"]} >= {("T1", "BREAK CHECK-IN"), ("T3", "BREAK RECOMMENDED")}
    t3 = next(a for a in r["alerts"] if a["tier"] == "T3")
    assert client.post(f"{API}/alerts/{t3['alert_id']}/ack", json={"action": "snooze"}).json()["state"] == "acknowledged"
    assert client.post(f"{API}/alerts/{t3['alert_id']}/ack", json={"action": "snooze"}).status_code == 409
    started = client.post(f"{API}/breaks/start").json()
    assert started["ok"] and client.get(f"{API}/live/snapshot").json()["on_break"]
    ended = client.post(f"{API}/breaks/end", json={"kss": 3}).json()
    assert ended["ok"] and ended["continuous_operation_reset"] is False       # < 10 min break does not reset
    assert client.post(f"{API}/breaks/end").status_code == 409


def test_08_incidents(client):
    all_inc = client.get(f"{API}/incidents").json()
    assert any(i["signal_word"] == "DANGER" and i["source"] == "auto" for i in all_inc)
    assert all(i["signal_word"] == "DANGER" for i in client.get(f"{API}/incidents", params={"signal_word": "DANGER"}).json())
    manual = client.post(f"{API}/incidents", json={"type": "near_miss", "severity": "medium",
                                                   "note": "Truck reversed early"}).json()
    assert manual["source"] == "manual" and manual["signal_word"] == "CAUTION" and manual["context"]["task_id"] == "T-1"
    patched = client.patch(f"{API}/incidents/{manual['incident_id']}",
                           json={"operator_note": "Driver did not wait", "status": "reviewed"}).json()
    assert patched["dispute_status"] == "disputed" and patched["status"] == "reviewed"
    assert client.get(f"{API}/incidents/nope").status_code == 404
    assert client.get(f"{API}/incidents", params={"source": "manual", "operator_id": "OP-1042"}).json()


def test_09_websocket_frames(client):
    with client.websocket_connect(f"{API}/ws/live") as ws:
        types = {ws.receive_json()["type"], ws.receive_json()["type"]}
        assert types == {"health", "snapshot"}
        client.post(f"{API}/demo/inject", json={"kind": "person_rear", "mode": "direct"})
        seen = set()
        for _ in range(30):
            frame = ws.receive_json()
            seen.add(frame["type"])
            if frame["type"] == "alert" and frame["data"]["tier"] == "T_CRIT":
                break
        assert "alert" in seen                                                     # pushed without polling


def test_10_sync_offline_and_shift_end(client):
    status = client.get(f"{API}/sync/status").json()
    assert status["backlog"] > 0 and status["cloud"] == "offline"
    flushed = client.post(f"{API}/sync/flush").json()
    assert flushed["ok"] is False and flushed["backlog"] > 0
    ended = client.post(f"{API}/shift/{SHIFT}/end").json()
    assert ended["ok"] and ended["competency"]["status"] == "queued" and ended["shift"]["status"] == "ended"
    assert client.post(f"{API}/shift/{SHIFT}/end").status_code == 409
    assert client.get(f"{API}/sync/status").json()["backlog_by_priority"].get("9") == 1


def test_11_post_shift_reviews(client):
    today = client.get(f"{API}/review/shift/{SHIFT}").json()
    assert today["totals"]["tasks_total"] == 3 and today["alerts_by_signal_word"]["DANGER"] >= 1
    assert today["suppressed"]["by_reason"].get("waiting_for_truck") == 1 and today["timeline"]
    s0 = client.get(f"{API}/review/shift/SH-1042-S0").json()
    assert s0["idle_breakdown"] == {"waiting_min": 24.0, "warmup_min": 9.0, "unexplained_min": 5.0}
    assert s0["focus"]["competency_id"] == "C04" and s0["well_done"] and s0["coaching"]
    assert client.get(f"{API}/review/shift/NOPE").status_code == 404
