"""API tests for the simulated-detector ingest and the demo scenario panel.

The demo is run live in front of people, so the property that matters most here is that every
scenario can be fired twice in a row and still do what it says on the tin. Each one is run twice
and both responses are checked.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from sentinel.store.taskcentre_models import PunchRow, TcTaskRow
from sentinel.taskcentre import routes_sim

SCENARIO_IDS = tuple(sc["id"] for sc in routes_sim.SCENARIOS)


@pytest.fixture()
def sim(world):
    """The shared world with the simulation router mounted (``main.py`` mounts it in the real app)."""
    world.client.app.include_router(routes_sim.router, prefix="/api/v1")
    return world


def run(sim, name: str, who: str = "admin") -> dict:
    response = sim.post(who, f"/tc/sim/scenario/{name}")
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- catalogue
def test_catalogue_describes_every_runnable_scenario(sim) -> None:
    """``GET /scenarios`` is what the demo panel renders, so it must cover every runner exactly."""
    body = sim.get("admin", "/tc/sim/scenarios").json()
    assert {sc["id"] for sc in body["scenarios"]} == set(SCENARIO_IDS)
    for scenario in body["scenarios"]:
        assert scenario["title"] and scenario["description"] and scenario["demonstrates"]
    assert body["trigger_roles"] == ["admin", "supervisor"]
    assert body["config"]["idle"]["threshold_s"] == 900.0
    assert body["source"] == "SIMULATED"


def test_any_signed_in_user_can_read_the_catalogue(sim) -> None:
    assert sim.get("op1", "/tc/sim/scenarios").status_code == 200


# ---------------------------------------------------------------- repeatability
@pytest.mark.parametrize("name", SCENARIO_IDS)
def test_every_scenario_runs_twice_cleanly(sim, name: str) -> None:
    """A demo is never run once. Both runs must succeed and report the same shape."""
    for result in (run(sim, name), run(sim, name)):
        assert result["scenario"] == name
        assert result["summary"] and result["demonstrates"] and result["links"]
        assert result["source"] == "SIMULATED"
        assert result["ran_at_gmt"].endswith("Z")
        assert isinstance(result["ids"], dict) and result["ids"]


def test_a_supervisor_scenario_only_touches_their_own_team(sim) -> None:
    """A supervisor may run the demo, but never files a ticket against somebody else's operator."""
    result = sim.post("sup2", "/tc/sim/scenario/fatigue").json()
    assert result["ids"]["operator_id"] == sim.ids["op3"]        # sup2's only operator
    assert result["ids"]["supervisor_id"] == sim.ids["sup2"]
    assert sim.post("sup1", "/tc/sim/scenario/fatigue").json()["ids"]["operator_id"] == sim.ids["op1"]


@pytest.mark.parametrize("path", ["/tc/sim/scenario/fatigue", "/tc/sim/machine-sensor"])
def test_an_operator_may_not_fire_simulated_events(sim, path: str) -> None:
    """Firing a simulated critical incident alarms a real screen, so operators are refused."""
    assert sim.post("op1", path, json={"machine_id": "EX-07", "kind": "x"}).status_code == 403


def test_unknown_scenario_is_a_404(sim) -> None:
    response = sim.post("admin", "/tc/sim/scenario/not_a_scenario")
    assert response.status_code == 404 and "scenarios" in response.json()["detail"]


# ---------------------------------------------------------------- incident scenarios
def test_critical_incident_dispatches_the_nearest_and_repeats_with_a_fresh_incident(sim) -> None:
    first, second = run(sim, "critical_incident"), run(sim, "critical_incident")
    incident = second["detail"]["incident"]

    assert incident["dispatch_status"] == "dispatched"
    assert incident["nearest_user_id"] == sim.ids["op1"]        # staged closest to the machine
    assert incident["nearest_distance_m"] < 100.0
    assert [c["user_id"] for c in incident["candidates"]][0] == sim.ids["op1"]
    assert sim.ids["sup1"] in incident["notified_user_ids"]
    assert sim.ids["admin"] in incident["notified_user_ids"]
    # The second run retires its own previous incident rather than being swallowed by dedupe.
    assert second["ids"]["incident_id"] != first["ids"]["incident_id"]
    assert second["detail"]["dedupe_retired"] == 1


def test_no_eligible_operator_scenario_never_names_one(sim) -> None:
    for result in (run(sim, "critical_incident_no_operator"),
                   run(sim, "critical_incident_no_operator")):
        incident = result["detail"]["incident"]
        assert incident["dispatch_status"] == "no_eligible_operator"
        assert incident["nearest_user_id"] is None
        assert result["ids"]["nearest_user_id"] is None
        assert "No eligible nearby operator identified" in result["summary"]
        assert all(not c["eligible"] for c in incident["candidates"])
        assert sim.ids["sup1"] in incident["notified_user_ids"]


# ---------------------------------------------------------------- camera scenarios
@pytest.mark.parametrize("name, expected", [("waiting_for_truck", "waiting_for_truck"),
                                            ("false_idle", "below the 15 min threshold")])
def test_pauses_that_should_not_be_flagged_are_not(sim, name: str, expected: str) -> None:
    """Both runs stay silent, and the log says why - no ticket, no supervisor notification."""
    for result in (run(sim, name), run(sim, name)):
        assert result["ids"]["ticket_id"] is None
        assert result["detail"]["ticket"] is None
        assert expected in result["detail"]["suppressed_reason"]


def test_true_idle_flags_on_both_runs_with_reviewable_evidence(sim) -> None:
    first, second = run(sim, "true_idle"), run(sim, "true_idle")
    ticket = second["detail"]["ticket"]

    assert first["ids"]["ticket_id"] and second["ids"]["ticket_id"]
    assert second["ids"]["ticket_id"] != first["ids"]["ticket_id"]
    assert second["detail"]["cooldown_retired"] == 1          # the re-run retires its own cooldown
    assert ticket["kind"] == "ai_idle" and ticket["owner_role"] == "supervisor"
    assert ticket["owner_user_id"] == sim.ids["sup1"]
    assert ticket["source"] == "SIMULATED"
    assert ticket["evidence"]["is_safety_alert"] is False
    assert ticket["evidence"]["clip_available"] is False
    assert len(ticket["evidence"]["timeline"]) >= 2


# ---------------------------------------------------------------- fatigue, punch, overrun
def test_fatigue_scenario_produces_a_simulated_prompt(sim) -> None:
    result = run(sim, "fatigue")
    ticket = result["detail"]["ticket"]
    assert ticket["kind"] == "fatigue" and ticket["source"] == "SIMULATED"
    assert "SIMULATED" in ticket["title"]
    assert ticket["evidence"]["is_diagnosis"] is False


def test_outside_geofence_punch_records_the_punch_and_tickets_the_supervisor(sim) -> None:
    first, second = run(sim, "outside_geofence_punch"), run(sim, "outside_geofence_punch")

    assert second["detail"]["geofence_status"] == "outside"
    assert second["detail"]["distance_m"] > second["detail"]["fence"]["radius_m"]
    assert second["ids"]["punch_id"] != first["ids"]["punch_id"]     # append-only, never rewritten
    ticket = second["detail"]["ticket"]
    assert ticket["kind"] == "geofence_punch" and ticket["owner_role"] == "supervisor"
    assert "never proof" in ticket["detail"]
    with sim.db.session() as s:
        punches = s.execute(select(PunchRow).where(PunchRow.user_id == sim.ids["op3"])).scalars().all()
        assert len(punches) == 2 and all(p.geofence_status == "outside" for p in punches)


def test_task_overrun_reuses_one_demo_task_and_reports_gmt_times(sim) -> None:
    first, second = run(sim, "task_overrun"), run(sim, "task_overrun")

    assert second["ids"]["task_id"] == first["ids"]["task_id"]       # no pile-up of demo tasks
    assert second["ids"]["ticket_id"] != first["ids"]["ticket_id"]
    assert second["detail"]["overrun_minutes"] == pytest.approx(30.0, abs=1.0)
    assert second["detail"]["expected_finish_gmt"].endswith("Z")
    with sim.db.session() as s:
        tasks = s.execute(select(TcTaskRow).where(TcTaskRow.operator_id == sim.ids["op1"])
                          ).scalars().all()
        assert len(tasks) == 1 and tasks[0].status == "ongoing"
        assert tasks[0].overrun_ticket_id == second["ids"]["ticket_id"]


# ---------------------------------------------------------------- direct ingest
def test_machine_sensor_ingest_dedupes_a_repeat(sim) -> None:
    """The ingest route is the seam a real detector posts to; dedupe applies there too."""
    payload = {"machine_id": "EX-07", "kind": "engine_overheat", "lat": 1.0, "lon": 1.0,
               "site_id": "north-quarry"}
    first = sim.post("admin", "/tc/sim/machine-sensor", json=payload).json()
    repeat = sim.post("admin", "/tc/sim/machine-sensor", json=payload).json()

    assert first["deduped"] is False and repeat["deduped"] is True
    assert repeat["incident"]["incident_id"] == first["incident"]["incident_id"]
    assert "dedupe window" in repeat["sim_event"]["suppressed_reason"]
    assert first["incident"]["source"] == "SIMULATED"


def test_camera_ingest_suppresses_an_explained_pause(sim) -> None:
    body = sim.post("admin", "/tc/sim/camera-observation",
                    json={"camera_id": "cam-ex07", "operator_id": sim.ids["op1"],
                          "idle_seconds": 1800, "context": "machine_paused"}).json()
    assert body["flagged"] is False and body["ticket"] is None
    assert body["outcome"] == "suppressed_explained"
    assert "machine_paused" in body["suppressed_reason"]


def test_fatigue_ingest_returns_the_ticket_it_opened(sim) -> None:
    body = sim.post("admin", "/tc/sim/fatigue",
                    json={"operator_id": sim.ids["op1"], "indicator": "long_shift_without_break"}).json()
    assert body["ticket"]["kind"] == "fatigue"
    assert body["sim_event"]["kind"] == "fatigue" and body["sim_event"]["source"] == "SIMULATED"
    assert body["sim_event"]["produced_ticket_id"] == body["ticket"]["ticket_id"]
