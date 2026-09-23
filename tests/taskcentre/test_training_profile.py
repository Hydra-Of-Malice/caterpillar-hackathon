"""Training profiles: every item present, honest upserts, and assignment that reaches the operator.

The rules under test are the ones that make the profile trustworthy: an item nobody has opened reads
``not_started`` rather than being hidden, progress is clamped and never walks backwards, completion
is stamped once, and a supervisor assigning an item notifies the person rather than silently adding
a row to their record. Scope is exercised through the real auth stack, so the 403s mean what they say.
"""
from __future__ import annotations

import pytest

from sentinel.store.taskcentre_models import NotificationRow, TrainingVideoRow
from tests.taskcentre.conftest import World

#: (video_id, title, category, duration_min, order_index)
VIDEOS = [
    ("vid-walkaround", "Pre-start walkaround", "safety", 4.0, 0),
    ("vid-exclusion", "Exclusion zones", "safety", 5.0, 1),
    ("vid-swing", "Smooth swing technique", "operations", 6.0, 2),
]


@pytest.fixture()
def videos(world: World) -> list[str]:
    """Three DEMO items in two categories, inserted after the world is seeded."""
    with world.db.session() as s:
        for video_id, title, category, duration_min, order_index in VIDEOS:
            s.add(TrainingVideoRow(video_id=video_id, title=title, category=category,
                                   duration_min=duration_min, url=None, description=f"{title} demo",
                                   order_index=order_index))
    return [v[0] for v in VIDEOS]


def _profile(world: World, who: str = "op1") -> dict:
    res = world.get(who, "/tc/op/training/profile")
    assert res.status_code == 200, res.text
    return res.json()


def _item(profile: dict, video_id: str) -> dict:
    return next(i for i in profile["items"] if i["video_id"] == video_id)


def _progress(world: World, video_id: str, percent: float, *, completed: bool | None = None,
              who: str = "op1") -> dict:
    body: dict = {"percent": percent}
    if completed is not None:
        body["completed"] = completed
    res = world.post(who, f"/tc/op/training/{video_id}/progress", json=body)
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------- profile
def test_profile_lists_every_video_and_defaults_to_not_started(world: World, videos: list[str]) -> None:
    """Every seeded item appears, untouched ones read not_started at 0 % — nothing is hidden."""
    body = _profile(world)
    assert [i["video_id"] for i in body["items"]] == videos          # order_index order
    assert {i["status"] for i in body["items"]} == {"not_started"}
    assert {i["percent"] for i in body["items"]} == {0.0}
    assert all(i["started_at"] is None and i["completed_at"] is None for i in body["items"])
    assert all(i["label"] and i["duration_min"] for i in body["items"])
    assert body["summary"] == {**body["summary"], "total": 3, "completed": 0, "in_progress": 0,
                               "not_started": 3, "percent_complete": 0.0, "minutes_completed": 0.0}
    assert body["summary"]["last_activity_ts"] is None
    assert body["by_category"]["safety"]["total"] == 2
    assert body["by_category"]["operations"] == {**body["by_category"]["operations"], "total": 1,
                                                 "completed": 0}
    assert body["user"]["user_id"] == world.ids["op1"]
    assert "competency" in body["note"]           # content covered != competency demonstrated


def test_profile_is_empty_not_invented(world: World) -> None:
    """With no training content seeded the profile is explicitly empty, never padded."""
    body = _profile(world)
    assert body["items"] == []
    assert body["empty"] is True
    assert body["summary"]["total"] == 0 and body["summary"]["percent_complete"] == 0.0


def test_training_list_carries_progress_per_item(world: World, videos: list[str]) -> None:
    """The existing library listing keeps working and now shows where the operator got to."""
    _progress(world, "vid-swing", 40.0)
    body = world.get("op1", "/tc/op/training").json()
    by_id = {v["video_id"]: v for v in body["videos"]}
    assert by_id["vid-swing"]["progress"]["status"] == "in_progress"
    assert by_id["vid-swing"]["progress"]["percent"] == 40.0
    assert by_id["vid-walkaround"]["progress"]["status"] == "not_started"
    assert body["summary"]["in_progress"] == 1
    assert body["categories"][0]["videos"][0]["progress"]["status"] in ("not_started", "in_progress")


# ---------------------------------------------------------------- progress upsert
def test_progress_clamps_out_of_range_values(world: World, videos: list[str]) -> None:
    """A player reporting -10 % or 150 % is clamped, not rejected: real progress is never lost."""
    low = _progress(world, "vid-walkaround", -10.0)
    assert low["item"]["percent"] == 0.0 and low["clamped"] is True
    assert low["item"]["status"] == "in_progress"      # they opened it, even at 0 %

    high = _progress(world, "vid-exclusion", 150.0)
    assert high["item"]["percent"] == 100.0 and high["clamped"] is True
    assert high["item"]["status"] == "completed" and high["completed_now"] is True


def test_progress_never_goes_backwards(world: World, videos: list[str]) -> None:
    """Seeking back or replaying keeps the best value already recorded."""
    first = _progress(world, "vid-swing", 80.0)
    assert first["item"]["percent"] == 80.0 and first["regressed"] is False

    back = _progress(world, "vid-swing", 20.0)
    assert back["item"]["percent"] == 80.0
    assert back["regressed"] is True and back["previous_percent"] == 80.0
    assert _item(_profile(world), "vid-swing")["percent"] == 80.0


def test_completion_stamps_completed_at_once(world: World, videos: list[str]) -> None:
    """Completion sets completed_at, and a replay never restamps it."""
    done = _progress(world, "vid-walkaround", 0.0, completed=True)
    item = done["item"]
    assert item["status"] == "completed" and item["percent"] == 100.0
    assert item["completed_at"] is not None and item["completed_at_gmt"].endswith("Z")
    assert item["started_at"] is not None
    assert done["summary"]["completed"] == 1
    assert done["summary"]["minutes_completed"] == 4.0        # the item's own duration

    again = _progress(world, "vid-walkaround", 100.0)
    assert again["completed_now"] is False
    assert again["item"]["completed_at"] == item["completed_at"]


def test_progress_on_unknown_item_is_404(world: World, videos: list[str]) -> None:
    res = world.post("op1", "/tc/op/training/vid-nope/progress", json={"percent": 10.0})
    assert res.status_code == 404


def test_operator_cannot_read_another_operators_profile(world: World, videos: list[str]) -> None:
    """Self-scoped: one operator reading another operator's profile is 403."""
    res = world.get("op2", f"/tc/op/training/profile?operator_id={world.ids['op1']}")
    assert res.status_code == 403


# ---------------------------------------------------------------- supervisor view & assignment
def test_supervisor_reads_own_operator_and_admin_reads_anyone(world: World, videos: list[str]) -> None:
    assert world.get("sup1", f"/tc/sup/operators/{world.ids['op1']}/training").status_code == 200
    assert world.get("admin", f"/tc/sup/operators/{world.ids['op1']}/training").status_code == 200


def test_cross_team_training_read_is_403(world: World, videos: list[str]) -> None:
    """op1 belongs to sup1; sup2 may not open their training record."""
    res = world.get("sup2", f"/tc/sup/operators/{world.ids['op1']}/training")
    assert res.status_code == 403


def test_assignment_records_who_asked_and_notifies_the_operator(world: World, videos: list[str]) -> None:
    """Assigning puts the item on the list, names the supervisor and tells the operator."""
    res = world.post("sup1", f"/tc/sup/operators/{world.ids['op1']}/training/vid-exclusion/assign",
                     json={"note": "Before Thursday's bench work"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["assigned"] is True and body["operator_notified"] is True
    item = body["item"]
    assert item["assigned"] is True and item["assigned_by"] == world.ids["sup1"]
    assert item["assigned_at"] is not None and item["assigned_at_gmt"].endswith("Z")
    assert item["status"] == "not_started"            # assigning work is not doing it
    assert item["note"] == "Before Thursday's bench work"

    with world.db.session() as s:
        notes = [n for n in s.query(NotificationRow).filter(
            NotificationRow.user_id == world.ids["op1"]).all()]
    assert len(notes) == 1
    assert "Training assigned" in notes[0].title and "Exclusion zones" in notes[0].title
    assert "Before Thursday's bench work" in notes[0].body
    assert notes[0].alarm is False                     # a training nudge is never an alarm

    profile = _profile(world)
    assert _item(profile, "vid-exclusion")["assigned"] is True
    assert profile["summary"]["assigned_outstanding"] == 1


def test_assignment_keeps_existing_progress(world: World, videos: list[str]) -> None:
    """Assigning an item somebody has already part-watched never resets them to zero."""
    _progress(world, "vid-swing", 60.0)
    world.post("sup1", f"/tc/sup/operators/{world.ids['op1']}/training/vid-swing/assign", json={})
    item = _item(_profile(world), "vid-swing")
    assert item["percent"] == 60.0 and item["status"] == "in_progress"
    assert item["assigned_by"] == world.ids["sup1"]


def test_assign_across_teams_or_unknown_item_is_refused(world: World, videos: list[str]) -> None:
    cross = world.post("sup2", f"/tc/sup/operators/{world.ids['op1']}/training/vid-swing/assign", json={})
    assert cross.status_code == 403
    unknown = world.post("sup1", f"/tc/sup/operators/{world.ids['op1']}/training/vid-nope/assign", json={})
    assert unknown.status_code == 404


def test_operator_cannot_assign_training(world: World, videos: list[str]) -> None:
    res = world.post("op1", f"/tc/sup/operators/{world.ids['op1']}/training/vid-swing/assign", json={})
    assert res.status_code == 403
