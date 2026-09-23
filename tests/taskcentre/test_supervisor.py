"""Supervisor API: team scoping, task creation, dashboard buckets and the review trail."""
from __future__ import annotations

import time

from sqlalchemy import select

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import (ChatMessageRow, NotificationRow, ReviewDecisionRow,
                                              TaskProgressRow, TicketRow)
from sentinel.taskcentre.service import open_ticket
from tests.taskcentre.conftest import SITE, World, add_task

EVIDENCE = {"idle_seconds": 1200, "camera_id": "cam-ex07", "clip": "placeholder",
            "timeline": [{"ts": 1.0, "kind": "observation", "text": "no movement"}]}


def _new_task(world: World, who: str = "sup1", **overrides) -> dict:
    now = time.time()
    body = {"operator_id": world.ids["op1"], "title": "Inspect conveyor", "instructions": "Check the belt",
            "location": "Pit 3", "priority": "high", "start_ts": now, "expected_finish_ts": now + 3600,
            "checkpoints": [{"label": "PPE on", "kind": "checkbox", "target": 1, "required": True},
                            {"label": "Rollers greased", "kind": "counted", "target": 3, "required": False}]}
    body.update(overrides)
    return world.post(who, "/tc/sup/tasks", json=body)


def _idle_ticket(db: Database, world: World, owner: str = "u_sup1", subject: str = "u_op1") -> str:
    with db.session() as s:
        return open_ticket(s, site_id=SITE, kind="ai_idle", title="Idle 20 min", severity="medium",
                           owner_role="supervisor", owner_user_id=owner, subject_user_id=subject,
                           detail="camera flagged idle", evidence=dict(EVIDENCE)).ticket_id


# ---------------------------------------------------------------- scoping
def test_operators_lists_only_the_callers_team(world: World) -> None:
    body = world.get("sup1", "/tc/sup/operators").json()
    assert [o["user_id"] for o in body["operators"]] == [world.ids["op1"], world.ids["op2"]]
    assert all("tasks" in o and "location" in o and "unread_messages" in o for o in body["operators"])


def test_cross_supervisor_operator_detail_is_denied(world: World) -> None:
    assert world.get("sup2", f"/tc/sup/operators/{world.ids['op1']}").status_code == 403
    assert world.get("sup1", f"/tc/sup/operators/{world.ids['op1']}").status_code == 200
    assert world.get("sup1", "/tc/sup/operators/nobody").status_code == 404
    assert world.get("admin", f"/tc/sup/operators/{world.ids['op1']}").status_code == 200


def test_operator_role_may_not_use_the_supervisor_api(world: World) -> None:
    assert world.get("op1", "/tc/sup/operators").status_code == 403
    assert world.client.get("/api/v1/tc/sup/operators").status_code == 401


def test_cross_supervisor_task_is_invisible(world: World, db: Database) -> None:
    add_task(db, task_id="t_other", operator_id=world.ids["op3"], supervisor_id=world.ids["sup2"],
             status="pending", start_ts=time.time(), expected_finish_ts=time.time() + 60)
    assert world.patch("sup1", "/tc/sup/tasks/t_other", json={"title": "hijack"}).status_code == 404
    assert world.post("sup1", "/tc/sup/tasks/t_other/resolve-exception", json={"comment": "x"}).status_code == 404
    tasks = world.get("sup1", "/tc/sup/tasks").json()["tasks"]
    assert "t_other" not in [t["task_id"] for t in tasks]


# ---------------------------------------------------------------- task creation
def test_create_task_validates_times_targets_and_team(world: World) -> None:
    now = time.time()
    assert _new_task(world, expected_finish_ts=now - 10, start_ts=now).status_code == 400
    assert _new_task(world, checkpoints=[{"label": "Loads", "kind": "counted", "target": 0}]).status_code == 400
    assert _new_task(world, operator_id=world.ids["op3"]).status_code == 403
    assert _new_task(world, operator_id="ghost").status_code == 404


def test_create_task_writes_checkpoints_progress_and_notifies(world: World, db: Database) -> None:
    body = _new_task(world).json()
    assert body["status"] == "pending" and body["supervisor_id"] == world.ids["sup1"]
    assert [(c["label"], c["kind"], c["target"], c["required"]) for c in body["checkpoints"]] == [
        ("PPE on", "checkbox", 1, True), ("Rollers greased", "counted", 3, False)]
    assert body["required_outstanding"] == 1 and body["exception_resolved"] is False
    with db.session() as s:
        progress = list(s.scalars(select(TaskProgressRow).where(TaskProgressRow.task_id == body["task_id"])))
        notes = list(s.scalars(select(NotificationRow).where(NotificationRow.user_id == world.ids["op1"])))
    assert [(p.kind, p.text) for p in progress] == [("status", "assigned")]
    assert [n.kind for n in notes] == ["task"]


def test_patch_task_cancels_and_records_the_change(world: World) -> None:
    task_id = _new_task(world).json()["task_id"]
    patched = world.patch("sup1", f"/tc/sup/tasks/{task_id}", json={"status": "cancelled"}).json()
    assert patched["status"] == "cancelled"
    assert world.patch("sup1", f"/tc/sup/tasks/{task_id}",
                       json={"expected_finish_ts": 1.0, "start_ts": 2.0}).status_code == 400


def test_task_list_filters_by_operator_and_status(world: World, db: Database) -> None:
    now = time.time()
    add_task(db, task_id="t_done", operator_id=world.ids["op2"], supervisor_id=world.ids["sup1"],
             status="completed", start_ts=now - 100, expected_finish_ts=now - 50)
    _new_task(world)
    assert [t["task_id"] for t in world.get(
        "sup1", "/tc/sup/tasks", params={"status": "completed"}).json()["tasks"]] == ["t_done"]
    listed = world.get("sup1", "/tc/sup/tasks", params={"operator_id": world.ids["op1"]}).json()["tasks"]
    assert [t["operator_id"] for t in listed] == [world.ids["op1"]]
    assert world.get("sup1", "/tc/sup/tasks", params={"operator_id": world.ids["op3"]}).status_code == 403


# ---------------------------------------------------------------- dashboard
def test_dashboard_buckets_and_overdue_maths(world: World, db: Database, day_start: float) -> None:
    now = time.time()
    plan = [("t_done", "completed", day_start + 1, day_start + 2),
            ("t_going", "ongoing", now - 300, now + 3600),
            ("t_going_late", "ongoing", day_start + 1, now - 60),
            ("t_pending", "pending", now + 3600, now + 7200),
            ("t_pending_late", "pending", day_start + 1, now - 120),
            ("t_cancelled", "cancelled", day_start + 1, now + 600)]
    for task_id, status, start_ts, finish_ts in plan:
        add_task(db, task_id=task_id, operator_id=world.ids["op1"], supervisor_id=world.ids["sup1"],
                 status=status, start_ts=start_ts, expected_finish_ts=finish_ts)

    body = world.get("sup1", "/tc/sup/dashboard").json()
    assert body["counts"] == {"pending": 2, "ongoing": 2, "completed": 1, "cancelled": 0,
                              "overdue": 2, "total": 5}
    assert sorted(t["task_id"] for t in body["buckets"]["overdue"]) == ["t_going_late", "t_pending_late"]
    assert body["overdue_overlaps"] == ["pending", "ongoing"]
    assert {t["task_id"] for t in body["buckets"]["pending"]} == {"t_pending", "t_pending_late"}
    assert body["operators"][0]["counts"]["overdue"] == 2

    everything = world.get("sup1", "/tc/sup/dashboard", params={"scope": "all"}).json()
    assert everything["counts"]["cancelled"] == 1 and everything["counts"]["total"] == 6
    assert world.get("sup2", "/tc/sup/dashboard").json()["counts"]["total"] == 0


# ---------------------------------------------------------------- review
def test_review_queue_is_scoped_to_the_owner(world: World, db: Database) -> None:
    ticket_id = _idle_ticket(db, world)
    mine = world.get("sup1", "/tc/sup/review").json()
    assert [t["ticket_id"] for t in mine["tickets"]] == [ticket_id]
    assert mine["tickets"][0]["evidence"] == EVIDENCE
    assert [e["kind"] for e in mine["tickets"][0]["timeline"]] == ["raised", "observation"]
    assert world.get("sup2", "/tc/sup/review").json()["count"] == 0
    assert world.post("sup2", f"/tc/sup/review/{ticket_id}",
                      json={"decision": "dismissed", "comment": "not mine"}).status_code == 403
    assert world.post("sup1", "/tc/sup/review/tkt_missing",
                      json={"decision": "dismissed", "comment": ""}).status_code == 404


def test_review_decisions_append_and_never_rewrite_the_event(world: World, db: Database) -> None:
    ticket_id = _idle_ticket(db, world)
    with db.session() as s:
        created_at, detail = (lambda t: (t.created_at, t.detail))(s.get(TicketRow, ticket_id))

    first = world.post("sup1", f"/tc/sup/review/{ticket_id}",
                       json={"decision": "confirmed", "comment": "was idle"}).json()
    assert first["ticket"]["status"] == "confirmed" and first["penalty_applied"] is False
    second = world.post("sup1", f"/tc/sup/review/{ticket_id}",
                        json={"decision": "dismissed", "comment": "waiting for a truck"}).json()

    assert [d["decision"] for d in second["ticket"]["decisions"]] == ["confirmed", "dismissed"]
    assert [d["dismissed"] for d in second["ticket"]["decisions"]] == [False, True]
    assert second["ticket"]["evidence"] == EVIDENCE
    assert second["ticket"]["created_at"] == created_at and second["ticket"]["detail"] == detail
    with db.session() as s:
        rows = list(s.scalars(select(ReviewDecisionRow).where(ReviewDecisionRow.ticket_id == ticket_id)))
    assert len(rows) == 2 and all(r.data["penalty_applied"] is False for r in rows)


def test_dismissed_flag_stays_visible_and_marked(world: World, db: Database) -> None:
    ticket_id = _idle_ticket(db, world)
    world.post("sup1", f"/tc/sup/review/{ticket_id}", json={"decision": "dismissed", "comment": "false flag"})
    assert world.get("sup1", "/tc/sup/review").json()["count"] == 0
    history = world.get("sup1", "/tc/sup/review", params={"status": "all"}).json()["tickets"]
    assert [(t["ticket_id"], t["status"], t["dismissed"]) for t in history] == [(ticket_id, "dismissed", True)]
    assert history[0]["timeline"][-1]["kind"] == "decision:dismissed"


def test_more_info_keeps_the_flag_open(world: World, db: Database) -> None:
    ticket_id = _idle_ticket(db, world)
    body = world.post("sup1", f"/tc/sup/review/{ticket_id}",
                      json={"decision": "more_info", "comment": "what happened?"}).json()
    assert body["ticket"]["status"] == "open"
    assert world.get("sup1", "/tc/sup/review").json()["count"] == 1


def test_message_to_operator_creates_a_system_chat_message(world: World, db: Database) -> None:
    ticket_id = _idle_ticket(db, world)
    body = world.post("sup1", f"/tc/sup/review/{ticket_id}",
                      json={"decision": "confirmed", "comment": "confirmed idle",
                            "message_to_operator": "Log a delay next time and I will sort it out."}).json()
    assert body["message_sent"] is True and body["penalty_applied"] is False
    with db.session() as s:
        messages = list(s.scalars(select(ChatMessageRow)))
    assert len(messages) == 1
    assert messages[0].system is True
    assert messages[0].thread_key == f"{world.ids['sup1']}:{world.ids['op1']}"
    assert messages[0].to_user_id == world.ids["op1"]
    thread = world.get("op1", f"/tc/chat/{world.ids['sup1']}").json()
    assert [(m["system"], m["text"]) for m in thread["messages"]] == [
        (True, "Log a delay next time and I will sort it out.")]


# ---------------------------------------------------------------- exceptions & cameras
def test_resolve_exception_records_the_authorisation(world: World, db: Database) -> None:
    task_id = _new_task(world).json()["task_id"]
    body = world.post("sup1", f"/tc/sup/tasks/{task_id}/resolve-exception",
                      json={"comment": "belt guard removed by maintenance"}).json()
    assert body["exception_resolved"] is True and body["task"]["exception_resolved"] is True
    with db.session() as s:
        rows = list(s.scalars(select(TaskProgressRow).where(TaskProgressRow.task_id == task_id,
                                                            TaskProgressRow.kind == "exception_resolved")))
    assert [r.text for r in rows] == ["belt guard removed by maintenance"]
    listed = world.get("sup1", "/tc/sup/tasks").json()["tasks"]
    assert [t["exception_resolved"] for t in listed if t["task_id"] == task_id] == [True]


def test_cameras_are_scoped_to_the_teams_machines_and_labelled_simulated(world: World) -> None:
    body = world.get("sup1", "/tc/sup/cameras").json()
    assert [c["camera_id"] for c in body["cameras"]] == ["cam-ex07"]
    assert body["cameras"][0]["simulated"] is True and body["cameras"][0]["note"]
    assert {c["camera_id"] for c in world.get("admin", "/tc/sup/cameras").json()["cameras"]} == {
        "cam-ex07", "cam-ex09"}
