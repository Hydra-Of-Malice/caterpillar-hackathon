"""Operator efficiency: the fairness rules are the feature, so they are what these tests pin down.

Declared waiting is subtracted from working time and reported separately; a dismissed AI flag never
counts against anybody and an unreviewed one is labelled unreviewed; there is no score and no
leaderboard, the team view is ordered by name and says so; and every number carries the task and
ticket ids it was built from. Scope is exercised through the real auth stack.
"""
from __future__ import annotations

import time

import pytest

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import (CheckpointRow, TaskChecklistResultRow, TcTaskRow,
                                              TicketRow, WaitPeriodRow)
from sentinel.taskcentre.service import open_ticket
from tests.taskcentre.conftest import SITE, World

MIN = 60.0


@pytest.fixture()
def now() -> float:
    return time.time()


def _task(world: World, task_id: str, *, start: float, planned_end: float, started: float | None = None,
          finished: float | None = None, status: str = "completed", operator: str = "op1",
          supervisor: str = "sup1", title: str = "Load haul trucks") -> str:
    """A task in a state the API cannot reach directly (already started, already finished)."""
    with world.db.session() as s:
        s.add(TcTaskRow(task_id=task_id, site_id=SITE, operator_id=world.ids[operator],
                        supervisor_id=world.ids[supervisor], title=title, instructions="",
                        location="Pit 3", machine_id=None, priority="normal", status=status,
                        start_ts=start, expected_finish_ts=planned_end, started_at=started,
                        finished_at=finished, created_at=start))
    return task_id


def _wait(world: World, wait_id: str, *, started: float, ended: float | None,
          reason: str = "waiting_for_truck", operator: str = "op1", task_id: str | None = None) -> str:
    with world.db.session() as s:
        s.add(WaitPeriodRow(wait_id=wait_id, user_id=world.ids[operator], task_id=task_id,
                            reason=reason, started_at=started, ended_at=ended, source="operator"))
    return wait_id


def _ticket(world: World, *, kind: str, status: str, operator: str = "op1") -> str:
    with world.db.session() as s:
        row = open_ticket(s, site_id=SITE, kind=kind, title=f"{kind} flag", severity="medium",
                          owner_role="supervisor", owner_user_id=world.ids["sup1"],
                          subject_user_id=world.ids[operator], evidence={"idle_seconds": 1200})
        row.status = status
        return row.ticket_id


def _efficiency(world: World, who: str = "sup1", operator: str = "op1", days: int = 7) -> dict:
    res = world.get(who, f"/tc/sup/operators/{world.ids[operator]}/efficiency?days={days}")
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------- fairness: declared waiting
def test_declared_waiting_is_excluded_from_working_time(world: World, now: float) -> None:
    """A truck that did not arrive is never charged to the operator.

    The task ran 30 min wall-clock with 5 min of declared waiting inside it, so working time is
    25 min, the 5 min are reported separately under their reason, and the payload shows both the
    gross figure and the amount excluded so the subtraction is auditable.
    """
    _task(world, "t-wait", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 30 * MIN)
    _wait(world, "w-1", started=now - 50 * MIN, ended=now - 45 * MIN, task_id="t-wait")

    body = _efficiency(world)
    assert body["duration"]["gross_minutes"] == 30.0
    assert body["duration"]["waiting_minutes_excluded"] == 5.0
    assert body["duration"]["total_working_minutes"] == 25.0        # 30 - 5, not 30
    assert body["duration"]["median_minutes"] == 25.0
    assert body["waiting"]["declared_minutes"] == 5.0
    assert body["waiting"]["by_reason"] == {"waiting_for_truck": 5.0}
    assert body["evidence"]["wait_ids"] == ["w-1"]
    assert any("waiting" in c and "excluded" in c for c in body["caveats"])


def test_waiting_by_reason_and_open_periods_are_reported(world: World, now: float) -> None:
    """Several reasons are kept apart, and a wait still running is measured up to now."""
    _task(world, "t-open", start=now - 40 * MIN, planned_end=now - 10 * MIN,
          started=now - 40 * MIN, finished=now - 10 * MIN)
    _wait(world, "w-truck", started=now - 35 * MIN, ended=now - 30 * MIN)
    _wait(world, "w-paused", started=now - 25 * MIN, ended=now - 15 * MIN, reason="machine_paused")
    _wait(world, "w-live", started=now - 5 * MIN, ended=None, reason="expected_delay")

    body = _efficiency(world)
    reasons = body["waiting"]["by_reason"]
    assert reasons["waiting_for_truck"] == 5.0
    assert reasons["machine_paused"] == 10.0
    assert reasons["expected_delay"] >= 5.0                    # open period, measured to now
    assert body["waiting"]["open_periods"] == 1
    assert body["waiting"]["periods"] == 3
    # only the two waits inside the task's run are taken off that task's working time
    assert body["duration"]["waiting_minutes_excluded"] == 15.0
    assert body["duration"]["total_working_minutes"] == 15.0    # 30 gross - 15 waiting


# ---------------------------------------------------------------- fairness: AI flags
def test_dismissed_flags_do_not_count_against_the_operator(world: World, now: float) -> None:
    """Confirmed, dismissed and unreviewed idle flags are counted separately and labelled."""
    _ticket(world, kind="ai_idle", status="open")
    _ticket(world, kind="ai_idle", status="dismissed")
    _ticket(world, kind="ai_idle", status="confirmed")

    body = _efficiency(world)
    flags = body["flags"]
    assert flags["ai_idle_open"] == 1
    assert flags["ai_idle_dismissed"] == 1
    assert flags["ai_idle_confirmed"] == 1
    assert flags["ai_idle_total"] == 3
    assert "unreviewed" in flags["unreviewed_label"]
    assert "never count against" in flags["dismissed_note"]
    assert len(body["evidence"]["ai_idle_dismissed_ticket_ids"]) == 1
    assert any("dismissed" in c and "do not count against" in c for c in body["caveats"])
    assert any("unreviewed" in c for c in body["caveats"])


def test_no_composite_score_is_produced(world: World, now: float) -> None:
    """Facts, not a ranking: there is no opaque number anywhere in the payload."""
    body = _efficiency(world)
    assert body["composite_score"] is None
    assert body["ranked"] is False
    assert "rank" not in body and "score" not in body
    assert body["on_time_rate_inputs"] == {"completed_on_time": 0, "completed": 0}
    assert any("not a competency assessment" in c for c in body["caveats"])


# ---------------------------------------------------------------- task counts
def test_on_time_and_late_completions_are_counted_with_their_task_ids(world: World, now: float) -> None:
    _task(world, "t-early", start=now - 120 * MIN, planned_end=now - 60 * MIN,
          started=now - 120 * MIN, finished=now - 70 * MIN)
    _task(world, "t-late", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 10 * MIN)
    _task(world, "t-running", start=now - 20 * MIN, planned_end=now + 40 * MIN,
          started=now - 20 * MIN, status="ongoing")
    _task(world, "t-todo", start=now - 5 * MIN, planned_end=now + 60 * MIN, status="pending")
    _task(world, "t-dropped", start=now - 5 * MIN, planned_end=now + 60 * MIN, status="cancelled")

    body = _efficiency(world)
    assert body["tasks"] == {"assigned": 4, "completed": 2, "completed_on_time": 1,
                             "completed_late": 1, "ongoing": 1, "pending": 1, "cancelled": 1}
    assert body["on_time_rate"] == 0.5
    assert body["evidence"]["on_time_task_ids"] == ["t-early"]
    assert body["evidence"]["late_task_ids"] == ["t-late"]
    assert set(body["evidence"]["task_ids"]) == {"t-early", "t-late", "t-running", "t-todo"}
    assert any("still running" in c for c in body["caveats"])


def test_checkpoints_and_checklist_evidence(world: World, now: float) -> None:
    """Required checkpoints met and pre-start inspection answers travel with the counts."""
    _task(world, "t-cp", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 35 * MIN)
    with world.db.session() as s:
        s.add(CheckpointRow(checkpoint_id="cp1", task_id="t-cp", order_index=0, label="PPE",
                            kind="checkbox", target=1, done=1, required=True))
        s.add(CheckpointRow(checkpoint_id="cp2", task_id="t-cp", order_index=1, label="Grease",
                            kind="counted", target=3, done=1, required=True))
        s.add(TaskChecklistResultRow(task_id="t-cp", item_id="brakes", user_id=world.ids["op1"],
                                     result="fail", critical=True, note="soft pedal", ts=now - 61 * MIN))
    body = _efficiency(world)
    assert body["checkpoints"] == {"required_total": 2, "completed": 1, "exception_resolved": 0,
                                   "percent": 50.0}
    assert body["checklist"]["tasks_with_check"] == 1
    assert body["checklist"]["critical_fails"] == 1
    assert "not a mark against the operator" in body["checklist"]["note"]


def test_small_sample_is_declared(world: World, now: float) -> None:
    _task(world, "t-one", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 30 * MIN)
    body = _efficiency(world)
    assert body["caveats"][0].startswith("Small sample")


# ---------------------------------------------------------------- team view
def test_team_view_is_name_ordered_with_no_ranking(world: World, now: float) -> None:
    """No leaderboard: rows are in name order, the payload says so, and no row carries a rank."""
    _task(world, "t-a", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 40 * MIN, operator="op1")
    _task(world, "t-b", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 10 * MIN, operator="op2")

    res = world.get("sup1", "/tc/sup/efficiency?days=7")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ordering"] == "name (no ranking)"
    assert body["ranked"] is False and body["composite_score"] is None
    names = [row["operator"]["name"] for row in body["operators"]]
    assert names == sorted(names) == ["OP1", "OP2"]          # sup1's team only
    assert all("rank" not in row and "score" not in row for row in body["operators"])
    assert body["totals"]["completed"] == 2
    assert body["totals"]["completed_on_time"] == 1
    assert body["totals"]["completed_late"] == 1
    assert body["totals"]["on_time_rate"] == 0.5
    assert any("no ranking" in c for c in body["caveats"])


def test_team_view_scopes_to_the_callers_own_operators(world: World) -> None:
    sup2 = world.get("sup2", "/tc/sup/efficiency").json()
    assert [row["operator"]["user_id"] for row in sup2["operators"]] == [world.ids["op3"]]
    admin = world.get("admin", "/tc/sup/efficiency").json()
    assert {row["operator"]["user_id"] for row in admin["operators"]} == {
        world.ids["op1"], world.ids["op2"], world.ids["op3"]}
    assert [row["operator"]["name"] for row in admin["operators"]] == ["OP1", "OP2", "OP3"]


def test_team_totals_keep_waiting_separate(world: World, now: float) -> None:
    _task(world, "t-w", start=now - 60 * MIN, planned_end=now - 30 * MIN,
          started=now - 60 * MIN, finished=now - 30 * MIN, operator="op1")
    _wait(world, "w-team", started=now - 50 * MIN, ended=now - 40 * MIN)
    body = world.get("sup1", "/tc/sup/efficiency?days=7").json()
    assert body["totals"]["waiting_minutes_declared"] == 10.0
    assert body["totals"]["working_minutes"] == 20.0          # 30 gross - 10 declared waiting
    assert body["waiting_by_reason"] == {"waiting_for_truck": 10.0}


# ---------------------------------------------------------------- scope
def test_cross_team_efficiency_is_403(world: World) -> None:
    res = world.get("sup2", f"/tc/sup/operators/{world.ids['op1']}/efficiency")
    assert res.status_code == 403


def test_operator_cannot_read_the_team_efficiency_view(world: World) -> None:
    assert world.get("op1", "/tc/sup/efficiency").status_code == 403
    assert world.get("op1", f"/tc/sup/operators/{world.ids['op1']}/efficiency").status_code == 403


def test_admin_may_read_any_operator(world: World) -> None:
    assert world.get("admin", f"/tc/sup/operators/{world.ids['op3']}/efficiency").status_code == 200
