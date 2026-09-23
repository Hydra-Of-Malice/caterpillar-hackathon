"""Pre-start inspection gate (`/tc/op/tasks/{id}/checklist`) tests.

A task cannot go `ongoing` until the operator has answered the shared `config/checklist.yaml`
inspection for it. The rules mirror the in-cab copilot's pre-shift check and are asserted here:
an incomplete list blocks with the missing ids, a FAIL on a critical item blocks and raises one
supervisor ticket per task, a non-critical FAIL and N/A never block, and a FAIL must be described.
"""
from __future__ import annotations

from typing import Any

import pytest

from sentinel.store.taskcentre_models import NotificationRow, TaskChecklistResultRow, TaskProgressRow, TcTaskRow, TicketRow
from sentinel.taskcentre.checklist import checklist_items

from .conftest import World, add_task

ITEMS = checklist_items()
TOTAL = len(ITEMS)
CRITICAL = next(i["id"] for i in ITEMS if i["critical"])          # WA-02
NON_CRITICAL = next(i["id"] for i in ITEMS if not i["critical"])  # WA-01


# ---------------------------------------------------------------- helpers
@pytest.fixture()
def task(world: World, day_start: float) -> str:
    """One pending task for op1, inside today, owned by supervisor sup1."""
    return add_task(world.db, task_id="T1", operator_id=world.ids["op1"], supervisor_id=world.ids["sup1"],
                    status="pending", start_ts=day_start + 3600.0, expected_finish_ts=day_start + 7200.0,
                    title="Load the haul truck")


def answers(**overrides: Any) -> list[dict[str, Any]]:
    """Every item answered PASS, except the ids named in `overrides` (value: result or (result, note))."""
    out: list[dict[str, Any]] = []
    for item in ITEMS:
        override = overrides.get(item["id"].replace("-", "_"))
        if override is None:
            out.append({"item_id": item["id"], "result": "PASS"})
        elif isinstance(override, tuple):
            out.append({"item_id": item["id"], "result": override[0], "note": override[1]})
        else:
            out.append({"item_id": item["id"], "result": override})
    return out


def submit(world: World, task_id: str, results: list[dict[str, Any]], who: str = "op1"):
    return world.post(who, f"/tc/op/tasks/{task_id}/checklist", json={"results": results})


def start(world: World, task_id: str, who: str = "op1"):
    return world.post(who, f"/tc/op/tasks/{task_id}/start")


def tickets(world: World) -> list[TicketRow]:
    with world.db.session() as s:
        return s.query(TicketRow).filter(TicketRow.kind == "checklist_fail").all()


def supervisor_notifications(world: World) -> list[NotificationRow]:
    with world.db.session() as s:
        return s.query(NotificationRow).filter(NotificationRow.user_id == world.ids["sup1"],
                                               NotificationRow.kind == "ticket").all()


# ---------------------------------------------------------------- the gate
def test_start_is_blocked_until_the_checklist_is_answered(world: World, task: str) -> None:
    blocked = start(world, task)
    assert blocked.status_code == 409
    detail = blocked.json()["detail"]
    assert detail["error"] == "checklist_incomplete"
    assert detail["answered"] == 0 and detail["total"] == TOTAL
    assert detail["missing"] == [i["id"] for i in ITEMS]          # every item, in config order

    with world.db.session() as s:
        assert s.get(TcTaskRow, task).status == "pending"         # nothing was started
        assert s.get(TcTaskRow, task).started_at is None


def test_a_partial_submission_saves_but_still_blocks_the_start(world: World, task: str) -> None:
    saved = submit(world, task, answers()[:3])
    assert saved.status_code == 200
    status = saved.json()["status"]
    assert (status["answered"], status["passed"], status["completed"]) == (3, 3, False)
    assert status["blocked"] is False and len(status["missing"]) == TOTAL - 3

    blocked = start(world, task)
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["error"] == "checklist_incomplete"
    assert blocked.json()["detail"]["answered"] == 3


def test_a_fully_passed_checklist_lets_the_task_start(world: World, task: str) -> None:
    status = submit(world, task, answers()).json()["status"]
    assert status["completed"] is True and status["blocked"] is False
    assert status["passed"] == TOTAL and status["signed_by"] == world.ids["op1"]
    assert status["signed_at"] is not None and status["signed_at_gmt"].endswith("Z")

    started = start(world, task)
    assert started.status_code == 200
    assert started.json()["task"]["status"] == "ongoing"
    assert started.json()["task"]["checklist"]["completed"] is True
    assert not tickets(world)


def test_na_never_blocks_the_start(world: World, task: str) -> None:
    status = submit(world, task, [{"item_id": i["id"], "result": "N_A"} for i in ITEMS]).json()["status"]
    assert status["na"] == TOTAL and status["completed"] is True and status["blocked"] is False
    assert start(world, task).status_code == 200


def test_a_non_critical_fail_with_a_note_does_not_block(world: World, task: str) -> None:
    key = NON_CRITICAL.replace("-", "_")
    status = submit(world, task, answers(**{key: ("FAIL", "beacon lens cracked")})).json()["status"]
    assert status["failed"] == 1 and status["failed_critical"] == [] and status["blocked"] is False
    assert start(world, task).status_code == 200


# ---------------------------------------------------------------- critical failure
def test_a_critical_fail_blocks_the_start_opens_one_ticket_and_notifies_the_supervisor(
        world: World, task: str) -> None:
    key = CRITICAL.replace("-", "_")
    submitted = submit(world, task, answers(**{key: ("FAIL", "hydraulic leak at the boom base")}))
    assert submitted.json()["status"]["blocked"] is True

    blocked = start(world, task)
    assert blocked.status_code == 409
    detail = blocked.json()["detail"]
    assert detail["error"] == "checklist_critical_failed"
    assert detail["failed_critical"] == [
        {"item_id": CRITICAL, "label": next(i["label"] for i in ITEMS if i["id"] == CRITICAL),
         "note": "hydraulic leak at the boom base"}]
    assert detail["ticket_id"]

    opened = tickets(world)
    assert len(opened) == 1
    ticket = opened[0]
    assert ticket.ticket_id == detail["ticket_id"]
    assert (ticket.severity, ticket.owner_role, ticket.source) == ("high", "supervisor", "RULE")
    assert ticket.owner_user_id == world.ids["sup1"] and ticket.subject_user_id == world.ids["op1"]
    assert ticket.task_id == task and ticket.status == "open"
    assert ticket.evidence["failed_critical"][0]["note"] == "hydraulic leak at the boom base"

    notifications = supervisor_notifications(world)
    assert len(notifications) == 1 and notifications[0].ticket_id == ticket.ticket_id

    with world.db.session() as s:
        assert s.get(TcTaskRow, task).status == "pending"


def test_retrying_the_start_reuses_the_ticket_instead_of_duplicating_it(world: World, task: str) -> None:
    key = CRITICAL.replace("-", "_")
    submit(world, task, answers(**{key: ("FAIL", "hydraulic leak at the boom base")}))
    first = start(world, task).json()["detail"]["ticket_id"]
    second = start(world, task)

    assert second.status_code == 409
    assert second.json()["detail"]["ticket_id"] == first
    assert [t.ticket_id for t in tickets(world)] == [first]
    assert len(supervisor_notifications(world)) == 1


def test_fixing_the_failed_item_unblocks_the_start(world: World, task: str) -> None:
    key = CRITICAL.replace("-", "_")
    submit(world, task, answers(**{key: ("FAIL", "hydraulic leak at the boom base")}))
    assert start(world, task).status_code == 409

    repaired = submit(world, task, [{"item_id": CRITICAL, "result": "PASS", "note": "hose replaced"}])
    assert repaired.json()["status"]["blocked"] is False        # the latest answer wins
    assert start(world, task).status_code == 200


# ---------------------------------------------------------------- submission rules
def test_a_fail_without_a_note_is_rejected(world: World, task: str) -> None:
    rejected = submit(world, task, [{"item_id": CRITICAL, "result": "FAIL"}])
    assert rejected.status_code == 400
    assert rejected.json()["detail"]["error"] == "note_required"
    assert rejected.json()["detail"]["item_ids"] == [CRITICAL]
    with world.db.session() as s:
        assert s.query(TaskChecklistResultRow).count() == 0      # nothing was written


def test_an_unknown_item_id_is_rejected(world: World, task: str) -> None:
    rejected = submit(world, task, [{"item_id": "WA-99", "result": "PASS"},
                                    {"item_id": ITEMS[0]["id"], "result": "PASS"}])
    assert rejected.status_code == 400
    assert rejected.json()["detail"]["error"] == "unknown_checklist_items"
    assert rejected.json()["detail"]["item_ids"] == ["WA-99"]
    with world.db.session() as s:
        assert s.query(TaskChecklistResultRow).count() == 0      # the valid half was not written either


def test_one_progress_entry_summarises_a_submission(world: World, task: str) -> None:
    submit(world, task, answers()[:4])
    with world.db.session() as s:
        rows = s.query(TaskProgressRow).filter(TaskProgressRow.task_id == task,
                                               TaskProgressRow.kind == "checklist").all()
    assert len(rows) == 1                                        # one row, not one per item
    assert rows[0].data["answered"] == 4 and rows[0].data["total"] == TOTAL
    assert rows[0].data["completed"] is False


def test_the_latest_answer_per_item_wins(world: World, task: str) -> None:
    submit(world, task, [{"item_id": CRITICAL, "result": "PASS"}])
    submit(world, task, [{"item_id": CRITICAL, "result": "N_A"}])
    with world.db.session() as s:
        rows = s.query(TaskChecklistResultRow).filter(TaskChecklistResultRow.item_id == CRITICAL).all()
    assert len(rows) == 1 and rows[0].result == "na"             # upserted, never appended


# ---------------------------------------------------------------- reading it
def test_the_checklist_lists_every_item_with_its_answer(world: World, task: str) -> None:
    submit(world, task, [{"item_id": CRITICAL, "result": "FAIL", "note": "seal weeping"}])
    body = world.get("op1", f"/tc/op/tasks/{task}/checklist").json()

    assert body["task_id"] == task and len(body["items"]) == TOTAL
    assert [g["id"] for g in body["groups"]] == ["walk_around", "cab_controls", "safety_systems",
                                                 "site_conditions"]
    answered = next(i for i in body["items"] if i["id"] == CRITICAL)
    assert (answered["result"], answered["note"], answered["critical"]) == ("fail", "seal weeping", True)
    assert answered["answered"] is True and answered["ts_gmt"].endswith("Z")
    unanswered = next(i for i in body["items"] if i["id"] == NON_CRITICAL)
    assert unanswered["result"] is None and unanswered["answered"] is False
    assert body["status"]["blocked"] is True and body["status"]["version"]


def test_another_operator_cannot_reach_this_checklist(world: World, task: str) -> None:
    assert world.get("op2", f"/tc/op/tasks/{task}/checklist").status_code == 403
    assert submit(world, task, answers(), who="op2").status_code == 404      # writes are self-scoped
    assert world.get("sup1", f"/tc/op/tasks/{task}/checklist").status_code == 200   # their supervisor
    assert world.get("sup2", f"/tc/op/tasks/{task}/checklist").status_code == 403   # not their operator


# ---------------------------------------------------------------- the today board
def test_today_tasks_carry_the_checklist_block(world: World, task: str) -> None:
    before = world.get("op1", "/tc/op/today").json()["tasks"][0]["checklist"]
    assert before == {"completed": False, "blocked": False, "answered": 0, "total": TOTAL,
                      "failed_critical_count": 0}

    key = CRITICAL.replace("-", "_")
    submit(world, task, answers(**{key: ("FAIL", "hydraulic leak at the boom base")}))
    after = world.get("op1", "/tc/op/today").json()["tasks"][0]["checklist"]
    assert after == {"completed": True, "blocked": True, "answered": TOTAL, "total": TOTAL,
                     "failed_critical_count": 1}
