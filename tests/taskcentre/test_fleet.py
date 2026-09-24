"""Fleet management: the utilisation/downtime arithmetic, service-due logic, the work-order lifecycle
and the admin-only fleet API.

Stats are checked against hand-built state logs, so each expected number can be worked out on paper.
"""
from __future__ import annotations

import time

import pytest

from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import MachineStateRow, MaintenanceRow
from sentinel.taskcentre import fleet
from sentinel.taskcentre.seed import seed_task_centre

from .conftest import SITE

H = fleet.HOUR
NOW = time.time()
T0 = NOW - 10 * H


def _row(state: str, a_h: float, b_h: float | None, **kw) -> MachineStateRow:
    """An interval from T0 + a_h to T0 + b_h (open when b_h is None)."""
    return MachineStateRow(machine_id="EX-07", state=state, started_at=T0 + a_h * H,
                           ended_at=None if b_h is None else T0 + b_h * H, **kw)


CFG = fleet.FleetConfig(service_interval_h=500, due_soon_h=50, window_days=7, max_window_days=90)


# ---------------------------------------------------------------- arithmetic
def test_window_stats_follow_the_published_definitions() -> None:
    # 6 h operating, 1 h idle, 2 h down (one breakdown, repaired), 1 h maintenance; 10 h scheduled.
    rows = [_row("operating", 0, 3), _row("idle", 3, 4), _row("down", 4, 6), _row("operating", 6, 9),
            _row("maintenance", 9, 10)]
    st = fleet.window_stats(rows, start=T0, end=NOW, now=NOW)
    assert st["scheduled_h"] == pytest.approx(10.0)
    assert st["hours"] == {"operating": 6.0, "idle": 1.0, "down": 2.0, "maintenance": 1.0}
    assert st["availability_pct"] == 70.0          # (6 + 1) / 10
    assert st["utilisation_pct"] == 60.0           # 6 / 10
    assert st["planned_downtime_h"] == 1.0 and st["unplanned_downtime_h"] == 2.0
    assert st["breakdowns"] == 1 and st["mtbf_h"] == 6.0 and st["mttr_h"] == 2.0


def test_unscheduled_gaps_count_toward_nothing_and_window_clips() -> None:
    rows = [_row("operating", 0, 2), _row("operating", 5, 6)]      # 3 h gap parked in between
    st = fleet.window_stats(rows, start=T0 + 1 * H, end=NOW, now=NOW)
    assert st["scheduled_h"] == 2.0 and st["utilisation_pct"] == 100.0
    assert st["mtbf_h"] is None and st["mttr_h"] is None           # no breakdowns: no invented MTBF


def test_open_interval_runs_to_now_and_is_the_current_state() -> None:
    rows = [_row("operating", 0, 8), _row("down", 8, None, reason="Hose burst")]
    st = fleet.window_stats(rows, start=T0, end=NOW, now=NOW)
    assert st["hours"]["down"] == pytest.approx(2.0, abs=0.01)
    assert st["mttr_h"] is None                                     # not repaired yet
    cur = fleet.current_state(rows, NOW)
    assert cur["state"] == "down" and cur["reason"] == "Hose burst"
    assert fleet.current_state([_row("idle", 0, 1)], NOW)["state"] == "available"
    assert fleet.current_state([], NOW)["state"] == "no_data"


def test_service_due_is_computed_on_the_meter_not_the_calendar() -> None:
    machine = MachineRow(machine_id="EX-07", model="m", machine_type="t", site_id=SITE,
                         meta={"smu_base_h": 1000.0, "smu_base_ts": T0})
    rows = [_row("operating", 0, 4), _row("idle", 4, 5), _row("down", 5, 6)]     # 5 engine hours
    last = MaintenanceRow(maintenance_id="m1", machine_id="EX-07", kind="service", title="500 h", status="completed",
                          completed_at=T0 - H, hour_meter_h=560.0)
    st = fleet.service_status(machine, rows, [last], now=NOW, cfg=CFG)
    assert st["hour_meter_h"] == 1005.0
    assert st["due_at_h"] == 1060.0 and st["remaining_h"] == 55.0 and st["status"] == "ok"
    last.hour_meter_h = 540.0
    assert fleet.service_status(machine, rows, [last], now=NOW, cfg=CFG)["status"] == "due_soon"
    last.hour_meter_h = 500.0
    assert fleet.service_status(machine, rows, [last], now=NOW, cfg=CFG)["status"] == "overdue"


def test_service_status_is_unknown_without_a_meter_or_a_service() -> None:
    bare = MachineRow(machine_id="EX-07", model="m", machine_type="t", site_id=SITE, meta={})
    assert fleet.service_status(bare, [], [], now=NOW, cfg=CFG)["status"] == "unknown"
    assert fleet.hour_meter(bare, [], NOW, NOW) is None             # never guessed


# ---------------------------------------------------------------- API
@pytest.fixture()
def fleet_world(world):
    with world.db.session() as s:
        s.add(MachineRow(machine_id="EX-07", model="Cat 320 (simulated)", machine_type="EX-20t", site_id=SITE,
                         meta={"smu_base_h": 1000.0, "smu_base_ts": T0}))
        s.add_all([_row("operating", 0, 6, operator_id=world.ids["op1"]), _row("idle", 6, 7), _row("down", 7, 8)])
        s.add(MaintenanceRow(maintenance_id="mnt-old", machine_id="EX-07", kind="service", title="500 h service",
                             status="completed", completed_at=T0 - H, hour_meter_h=600.0, history=[]))
    return world


@pytest.mark.parametrize("who", ["sup1", "op1"])
def test_fleet_routes_are_admin_only(fleet_world, who: str) -> None:
    assert fleet_world.get(who, "/tc/admin/fleet").status_code == 403
    assert fleet_world.get(who, "/tc/admin/machines/EX-07").status_code == 403
    assert fleet_world.post(who, "/tc/admin/machines/EX-07/maintenance", json={"title": "x"}).status_code == 403


def test_fleet_lists_machines_with_stats_and_service(fleet_world) -> None:
    body = fleet_world.get("admin", "/tc/admin/fleet").json()
    (m,) = body["machines"]
    assert m["machine_id"] == "EX-07" and m["current"]["state"] == "available"
    assert m["stats"]["scheduled_h"] == 8.0 and m["stats"]["availability_pct"] == 87.5
    assert m["service"]["hour_meter_h"] == 1007.0 and m["service"]["remaining_h"] == 93.0
    assert [o["user_id"] for o in m["operators"]] == [fleet_world.ids["op1"]]
    assert body["totals"]["availability_pct"] == 87.5 and body["method"]


def test_machine_detail_and_unknown_machine(fleet_world) -> None:
    d = fleet_world.get("admin", "/tc/admin/machines/EX-07?days=2").json()
    assert [iv["state"] for iv in d["timeline"]] == ["operating", "idle", "down"]
    assert d["timeline"][0]["operator_name"] == "OP1"
    assert d["maintenance"][0]["maintenance_id"] == "mnt-old"
    assert d["window"]["days"] == 2 and len(d["cameras"]) == 1
    assert fleet_world.get("admin", "/tc/admin/machines/NOPE").status_code == 404


def test_work_order_lifecycle_moves_the_state_log(fleet_world) -> None:
    w = fleet_world
    r = w.post("admin", "/tc/admin/machines/EX-07/maintenance",
               json={"kind": "repair", "title": "Swing motor leak", "start_now": True})
    assert r.status_code == 201 and r.json()["status"] == "in_progress"
    mid = r.json()["maintenance_id"]
    cur = w.get("admin", "/tc/admin/machines/EX-07").json()["current"]
    assert cur["state"] == "down" and cur["maintenance_id"] == mid          # a repair is unplanned downtime

    done = w.post("admin", f"/tc/admin/maintenance/{mid}/complete", json={"performed_by": "Fitter A"}).json()
    assert done["status"] == "completed" and done["performed_by"] == "Fitter A"
    assert done["hour_meter_h"] == 1007.0 and done["downtime_h"] is not None
    assert [h["action"] for h in done["history"]] == ["created", "started", "completed"]
    assert w.get("admin", "/tc/admin/machines/EX-07").json()["current"]["state"] == "available"
    assert w.post("admin", f"/tc/admin/maintenance/{mid}/complete").status_code == 409
    assert w.post("admin", f"/tc/admin/maintenance/{mid}/start").status_code == 409


def test_completed_service_resets_the_due_date(fleet_world) -> None:
    w = fleet_world
    mid = w.post("admin", "/tc/admin/machines/EX-07/maintenance",
                 json={"kind": "service", "title": "500 h service"}).json()["maintenance_id"]
    w.post("admin", f"/tc/admin/maintenance/{mid}/start")
    w.post("admin", f"/tc/admin/maintenance/{mid}/complete", json={"hour_meter_h": 1007.0})
    svc = w.get("admin", "/tc/admin/fleet").json()["machines"][0]["service"]
    assert svc["last_service"]["maintenance_id"] == mid and svc["remaining_h"] == 500.0


def test_logged_past_work_and_cancel_and_edit_history(fleet_world) -> None:
    w = fleet_world
    logged = w.post("admin", "/tc/admin/machines/EX-07/maintenance",
                    json={"kind": "inspection", "title": "Walk-around", "completed_at": NOW - H,
                          "hour_meter_h": 1006.0}).json()
    assert logged["status"] == "completed" and logged["downtime_h"] is None  # no downtime invented
    both = w.post("admin", "/tc/admin/machines/EX-07/maintenance",
                  json={"title": "x", "completed_at": NOW, "start_now": True})
    assert both.status_code == 422

    mid = w.post("admin", "/tc/admin/machines/EX-07/maintenance", json={"title": "Grease"}).json()["maintenance_id"]
    edited = w.patch("admin", f"/tc/admin/maintenance/{mid}", json={"title": "Grease all points"}).json()
    assert edited["title"] == "Grease all points"
    assert edited["history"][-1]["data"]["title"] == {"from": "Grease", "to": "Grease all points"}
    cancelled = w.post("admin", f"/tc/admin/maintenance/{mid}/cancel", json={"reason": "Done with the service"}).json()
    assert cancelled["status"] == "cancelled" and cancelled["history"][-1]["note"] == "Done with the service"
    assert w.post("admin", "/tc/admin/maintenance/nope/start").status_code == 404


# ---------------------------------------------------------------- demo history
def test_simulated_history_is_idempotent_and_lands_on_its_profiles(db) -> None:
    with db.session() as s:
        seed_task_centre(s, now=NOW)
    with db.session() as s:
        again = fleet.seed_fleet_history(s, now=NOW)
        assert again["created"] == {}
        cfg = fleet.FleetConfig.load()
        for machine_id, profile in fleet.PROFILES.items():
            machine = s.get(MachineRow, machine_id)
            rows = fleet.state_rows(s, machine_id)
            assert all(r.source == "SIMULATED" for r in rows)
            svc = fleet.service_status(machine, rows, fleet.maintenance_rows(s, machine_id), now=NOW, cfg=cfg)
            assert svc["remaining_h"] == pytest.approx(profile["remaining_h"], abs=0.5)
        assert fleet.current_state(fleet.state_rows(s, "EX-04"), NOW)["state"] == "down"
