"""Chat API: the thread is scoped to one supervisor/operator pair, whichever way a message travels."""
from __future__ import annotations

from sentinel.store.db import Database
from tests.taskcentre.conftest import World


def test_pair_scoping_is_enforced_for_both_roles(world: World) -> None:
    assert world.get("op1", f"/tc/chat/{world.ids['sup1']}").status_code == 200
    assert world.get("op1", f"/tc/chat/{world.ids['sup2']}").status_code == 403
    assert world.get("op1", f"/tc/chat/{world.ids['op2']}").status_code == 403
    assert world.get("sup1", f"/tc/chat/{world.ids['op1']}").status_code == 200
    assert world.get("sup1", f"/tc/chat/{world.ids['op3']}").status_code == 403
    assert world.post("sup2", f"/tc/chat/{world.ids['op1']}", json={"text": "hi"}).status_code == 403
    assert world.get("sup1", "/tc/chat/ghost").status_code == 404


def test_thread_key_is_the_same_in_both_directions(world: World) -> None:
    sent = world.post("op1", f"/tc/chat/{world.ids['sup1']}", json={"text": "Belt is jammed"}).json()
    reply = world.post("sup1", f"/tc/chat/{world.ids['op1']}", json={"text": "On my way"}).json()
    key = f"{world.ids['sup1']}:{world.ids['op1']}"
    assert sent["thread_key"] == reply["thread_key"] == key

    operator_view = world.get("op1", f"/tc/chat/{world.ids['sup1']}").json()
    supervisor_view = world.get("sup1", f"/tc/chat/{world.ids['op1']}").json()
    assert [m["text"] for m in operator_view["messages"]] == ["Belt is jammed", "On my way"]
    assert [m["message_id"] for m in supervisor_view["messages"]] == \
           [m["message_id"] for m in operator_view["messages"]]
    assert [m["mine"] for m in supervisor_view["messages"]] == [False, True]
    assert operator_view["can_post"] is True and operator_view["thread_key"] == key


def test_reading_a_thread_marks_incoming_messages_read(world: World) -> None:
    world.post("op1", f"/tc/chat/{world.ids['sup1']}", json={"text": "Need a spare filter"})
    before = world.get("sup1", "/tc/sup/operators").json()["operators"]
    assert [o["unread_messages"] for o in before if o["user_id"] == world.ids["op1"]] == [1]

    thread = world.get("sup1", f"/tc/chat/{world.ids['op1']}").json()
    assert thread["messages"][0]["read_at"] is not None
    after = world.get("sup1", "/tc/sup/operators").json()["operators"]
    assert [o["unread_messages"] for o in after if o["user_id"] == world.ids["op1"]] == [0]


def test_a_message_notifies_the_recipient_and_carries_a_task_id(world: World, db: Database) -> None:
    from sqlalchemy import select

    from sentinel.store.taskcentre_models import NotificationRow

    world.post("sup1", f"/tc/chat/{world.ids['op1']}", json={"text": "Start with the ramp", "task_id": "t1"})
    with db.session() as s:
        notes = list(s.scalars(select(NotificationRow).where(NotificationRow.user_id == world.ids["op1"])))
    assert [n.kind for n in notes] == ["chat"]
    messages = world.get("op1", f"/tc/chat/{world.ids['sup1']}").json()["messages"]
    assert [(m["task_id"], m["system"]) for m in messages] == [("t1", False)]


def test_admin_may_read_a_thread_but_not_post_into_it(world: World) -> None:
    world.post("op1", f"/tc/chat/{world.ids['sup1']}", json={"text": "Confirmed"})
    body = world.get("admin", f"/tc/chat/{world.ids['op1']}").json()
    assert body["read_only"] is True and body["can_post"] is False
    assert [m["text"] for m in body["messages"]] == ["Confirmed"]
    assert world.post("admin", f"/tc/chat/{world.ids['op1']}", json={"text": "hello"}).status_code == 403
    assert world.get("admin", f"/tc/chat/{world.ids['sup1']}").status_code == 400
    unread = world.get("sup1", "/tc/sup/operators").json()["operators"]   # the admin's read marks nothing
    assert [o["unread_messages"] for o in unread if o["user_id"] == world.ids["op1"]] == [1]


def test_since_ts_returns_only_newer_messages(world: World) -> None:
    first = world.post("op1", f"/tc/chat/{world.ids['sup1']}", json={"text": "one"}).json()
    world.post("op1", f"/tc/chat/{world.ids['sup1']}", json={"text": "two"})
    later = world.get("sup1", f"/tc/chat/{world.ids['op1']}", params={"since_ts": first["ts"]}).json()
    assert [m["text"] for m in later["messages"]] == ["two"]
