"""The work-schedule fatigue-RISK indicator: honest inputs, a visible score, and who may read it.

These tests are as much about the *claims* as the arithmetic. ``docs/sections/06-fatigue.md``
rejected fatigue diagnosis outright, so the things asserted hardest here are:

* an operator who has not punched in gets an explicit "not punched in" input and no invented hours;
* declared waiting ("waiting for a truck") is **never** counted as rest;
* the thresholds are the copilot's own break thresholds (120 / 150 / 165 min);
* the label and every caveat travel with every payload, including the team view;
* the team view is ordered by name, with no rank field anywhere;
* the operator can read their own estimate, and nobody can read another team's.
"""
from __future__ import annotations

import time

import pytest

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import PunchRow, TcTaskRow, UserRow, WaitPeriodRow
from sentinel.taskcentre.fatigue import LABEL, config, fatigue_risk, team_fatigue_risk

from .conftest import SITE, World, day_start  # noqa: F401  (day_start is a fixture)

HOUR = 3600.0
MIN = 60.0


# ---------------------------------------------------------------- fixtures / helpers
@pytest.fixture()
def cfg() -> dict:
    return config()


def punch(db: Database, user_id: str, kind: str, ts: float, punch_id: str | None = None) -> None:
    """Insert a punch straight into the DB — these tests need shifts hours long."""
    with db.session() as s:
        s.add(PunchRow(punch_id=punch_id or f"p-{user_id}-{kind}-{ts:.0f}", user_id=user_id, kind=kind,
                       ts=ts, geofence_status="inside"))


def wait(db: Database, user_id: str, started_at: float, ended_at: float | None,
         reason: str = "waiting_for_truck") -> None:
    with db.session() as s:
        s.add(WaitPeriodRow(wait_id=f"w-{user_id}-{started_at:.0f}", user_id=user_id, task_id=None,
                            reason=reason, started_at=started_at, ended_at=ended_at, source="operator"))


def factor(payload: dict, key: str) -> dict:
    """One factor out of the payload, so a test can name what it is asserting about."""
    return next(f for f in payload["factors"] if f["key"] == key)


def midday(day_start: float) -> float:
    """12:00 GMT — safely outside the 22:00-06:00 night window, so day tests isolate one factor."""
    return day_start + 12 * HOUR


# ---------------------------------------------------------------- not punched in
def test_no_punch_today_says_so_and_invents_nothing(db: Database, world: World, day_start: float) -> None:
    """The honest empty case: no shift, no hours, an explicit note — never a fabricated number."""
    now = midday(day_start)
    with db.session() as s:
        out = fatigue_risk(s, world.ids["op1"], now=now)

    assert out["level"] == "low"
    assert out["inputs"]["punched_in_today"] is False
    assert out["inputs"]["status"] == "not_punched_in"
    assert out["inputs"]["hours_since_start_work"] is None
    assert out["inputs"]["continuous_minutes_without_break"] is None
    assert out["inputs"]["minutes_since_last_break"] is None
    assert out["inputs"]["shift_recorded"] is False
    assert "no shift hours are assumed" in out["inputs"]["not_punched_in_note"]
    # An unknown contributes exactly zero rather than being guessed in either direction.
    assert factor(out, "hours_since_start_work")["contribution"] == 0.0
    assert factor(out, "continuous_minutes_without_break")["contribution"] == 0.0
    assert "no shift to estimate" in out["recommendation"]


def test_a_night_shift_that_began_before_midnight_is_still_a_shift(db: Database, world: World,
                                                                   day_start: float) -> None:
    """The case "today's punches" would get badly wrong — and it is the highest-risk case there is.

    Start Work at 23:20, read at 02:00. The shift is 2 h 40 m old, not "nobody has started work".
    """
    op = world.ids["op1"]
    now = day_start + 2 * HOUR                       # 02:00 GMT
    punch(db, op, "start_work", now - 160 * MIN)     # 23:20 GMT, the previous day
    with db.session() as s:
        out = fatigue_risk(s, op, now=now)

    assert out["inputs"]["punched_in_today"] is False       # strictly true: no punch this GMT day
    assert out["inputs"]["shift_recorded"] is True          # ...but there is very much a shift
    assert out["inputs"]["on_shift"] is True
    assert out["inputs"]["hours_since_start_work"] == pytest.approx(2.67, abs=0.02)
    assert out["inputs"]["continuous_minutes_without_break"] == pytest.approx(160.0, abs=0.2)
    assert out["inputs"]["night_work"] is True
    assert out["level"] == "high"


def test_yesterdays_finished_shift_is_not_charged_against_today(db: Database, world: World,
                                                                day_start: float) -> None:
    """A shift that ended more than `new_shift_gap_min` ago is over; today starts from nothing."""
    op = world.ids["op1"]
    now = midday(day_start)
    punch(db, op, "start_work", now - 20 * HOUR, punch_id="y1")
    punch(db, op, "finish_work", now - 12 * HOUR, punch_id="y2")
    with db.session() as s:
        out = fatigue_risk(s, op, now=now)
    assert out["inputs"]["shift_recorded"] is False
    assert out["inputs"]["hours_since_start_work"] is None
    assert out["level"] == "low"


# ---------------------------------------------------------------- continuous work / break policy
@pytest.mark.parametrize(("minutes", "expected"), [(30, "low"), (100, "low"), (120, "elevated"),
                                                   (150, "high"), (200, "high")])
def test_continuous_minutes_cross_the_break_policy_thresholds(db: Database, world: World,
                                                              day_start: float, minutes: int,
                                                              expected: str) -> None:
    """120 / 150 / 165 are the copilot's numbers; the supervisor's level must move with them."""
    now = midday(day_start)
    punch(db, world.ids["op1"], "start_work", now - minutes * MIN)
    with db.session() as s:
        out = fatigue_risk(s, world.ids["op1"], now=now)
    assert out["level"] == expected
    assert out["inputs"]["continuous_minutes_without_break"] == pytest.approx(float(minutes), abs=0.2)


def test_level_never_falls_as_continuous_minutes_rise(db: Database, world: World, day_start: float) -> None:
    """Monotonic in the one factor a supervisor will act on: more unbroken hours is never calmer."""
    order = {"low": 0, "elevated": 1, "high": 2}
    seen = []
    for minutes in (0, 60, 120, 150, 165, 240):
        op = world.ids["op1"]
        now = midday(day_start)
        with db.session() as s:
            s.query(PunchRow).filter(PunchRow.user_id == op).delete()
        punch(db, op, "start_work", now - minutes * MIN)
        with db.session() as s:
            seen.append(order[fatigue_risk(s, op, now=now)["level"]])
    assert seen == sorted(seen)
    assert seen[0] == 0 and seen[-1] == 2


def test_thresholds_mirror_the_copilot_break_policy(db: Database, world: World, day_start: float) -> None:
    """The numbers in the payload are the ones in config/alert_policy.yaml, echoed for the UI."""
    now = midday(day_start)
    punch(db, world.ids["op1"], "start_work", now - 130 * MIN)
    with db.session() as s:
        out = fatigue_risk(s, world.ids["op1"], now=now)
    threshold = factor(out, "continuous_minutes_without_break")["threshold"]
    assert (threshold["advisory_min"], threshold["recommend_min"], threshold["escalate_min"]) == (120, 150, 165)
    assert out["break_policy"]["min_break_min"] == 10


def test_punched_break_resets_continuous_work_and_is_counted(db: Database, world: World,
                                                             day_start: float) -> None:
    """A punched Finish → Start gap of at least min_break_min is the only thing counted as rest."""
    op = world.ids["op1"]
    now = midday(day_start)
    punch(db, op, "start_work", now - 300 * MIN, punch_id="p1")
    punch(db, op, "finish_work", now - 120 * MIN, punch_id="p2")
    punch(db, op, "start_work", now - 90 * MIN, punch_id="p3")     # 30 min break
    with db.session() as s:
        out = fatigue_risk(s, op, now=now)
    assert out["inputs"]["breaks_taken"] == 1
    assert out["inputs"]["break_minutes_total"] == pytest.approx(30.0, abs=0.2)
    assert out["inputs"]["continuous_minutes_without_break"] == pytest.approx(90.0, abs=0.2)
    assert out["inputs"]["minutes_since_last_break"] == pytest.approx(90.0, abs=0.2)
    assert out["level"] == "low"          # 90 min since the break is below the 120 min advisory


def test_gap_shorter_than_min_break_does_not_reset(db: Database, world: World, day_start: float) -> None:
    """`break.min_break_min` (10 min) is respected: a 5 min punch-out is not a rest break."""
    op = world.ids["op1"]
    now = midday(day_start)
    punch(db, op, "start_work", now - 200 * MIN, punch_id="p1")
    punch(db, op, "finish_work", now - 130 * MIN, punch_id="p2")
    punch(db, op, "start_work", now - 125 * MIN, punch_id="p3")    # only 5 min
    with db.session() as s:
        out = fatigue_risk(s, op, now=now)
    assert out["inputs"]["breaks_taken"] == 0
    assert out["inputs"]["minutes_since_last_break"] is None
    assert out["inputs"]["continuous_minutes_without_break"] == pytest.approx(200.0, abs=0.2)


# ---------------------------------------------------------------- waiting is not rest
def test_declared_waiting_is_not_counted_as_rest(db: Database, world: World, day_start: float) -> None:
    """The point of the whole feature: waiting for a truck is time in the cab, not a break.

    Two operators work an identical 180 min stretch. One of them declared a 60 min wait. Their
    continuous-work minutes, their level and their score must be identical — the wait must not buy
    them a "rest" — while the waiting minutes are reported separately and labelled.
    """
    now = midday(day_start)
    op_waiting, op_plain = world.ids["op1"], world.ids["op2"]
    punch(db, op_waiting, "start_work", now - 180 * MIN, punch_id="a1")
    punch(db, op_plain, "start_work", now - 180 * MIN, punch_id="b1")
    wait(db, op_waiting, now - 150 * MIN, now - 90 * MIN)          # 60 min "waiting for truck"

    with db.session() as s:
        waited = fatigue_risk(s, op_waiting, now=now)
        plain = fatigue_risk(s, op_plain, now=now)

    assert waited["inputs"]["continuous_minutes_without_break"] == pytest.approx(180.0, abs=0.2)
    assert waited["inputs"]["continuous_minutes_without_break"] == \
        pytest.approx(plain["inputs"]["continuous_minutes_without_break"], abs=0.2)
    assert waited["inputs"]["breaks_taken"] == 0
    assert waited["score"] == plain["score"]
    assert waited["level"] == plain["level"] == "high"

    # ...and the waiting is still visible, counted, and explicitly not rest.
    assert waited["inputs"]["declared_waiting_minutes"] == pytest.approx(60.0, abs=0.2)
    assert waited["inputs"]["declared_waiting_by_reason"] == {"Waiting for a truck": pytest.approx(60.0, abs=0.2)}
    assert "not rest" in waited["inputs"]["declared_waiting_note"]
    assert factor(waited, "declared_waiting_minutes")["weight"] == 0
    assert factor(waited, "declared_waiting_minutes")["contribution"] == 0.0
    assert any("never counted as a break" in c for c in waited["caveats"])
    # Working minutes exclude the wait; the plain operator's do not.
    assert waited["inputs"]["working_minutes"] == pytest.approx(120.0, abs=0.2)
    assert plain["inputs"]["working_minutes"] == pytest.approx(180.0, abs=0.2)


# ---------------------------------------------------------------- night work
def test_night_work_raises_the_score(db: Database, world: World, day_start: float) -> None:
    """Shift timing is an established risk factor, so 02:00 must score above the same shift at 12:00."""
    op_night, op_day = world.ids["op1"], world.ids["op2"]
    night_now = day_start + 2 * HOUR                # 02:00 GMT, inside 22:00-06:00
    day_now = day_start + 12 * HOUR                 # 12:00 GMT, outside it
    punch(db, op_night, "start_work", night_now - 60 * MIN, punch_id="n1")
    punch(db, op_day, "start_work", day_now - 60 * MIN, punch_id="d1")

    with db.session() as s:
        night = fatigue_risk(s, op_night, now=night_now)
        day = fatigue_risk(s, op_day, now=day_now)

    assert night["inputs"]["night_work"] is True
    assert day["inputs"]["night_work"] is False
    assert factor(night, "night_work")["contribution"] > 0
    assert factor(day, "night_work")["contribution"] == 0.0
    assert night["score"] > day["score"]
    assert "GMT" in factor(night, "night_work")["threshold_text"]


# ---------------------------------------------------------------- consecutive days
def test_consecutive_work_days_raise_the_score(db: Database, world: World, day_start: float) -> None:
    """A run of shifts is counted from the punch history and adds to the estimate."""
    op_run, op_fresh = world.ids["op1"], world.ids["op2"]
    now = midday(day_start)
    for back in range(7):                            # today plus the six days before it
        punch(db, op_run, "start_work", now - back * 86_400.0, punch_id=f"r{back}")
    punch(db, op_fresh, "start_work", now, punch_id="f0")

    with db.session() as s:
        run = fatigue_risk(s, op_run, now=now)
        fresh = fatigue_risk(s, op_fresh, now=now)

    assert run["inputs"]["consecutive_work_days"] == 7
    assert run["inputs"]["consecutive_work_days_includes_today"] is True
    assert fresh["inputs"]["consecutive_work_days"] == 1
    assert factor(run, "consecutive_work_days")["contribution"] > \
        factor(fresh, "consecutive_work_days")["contribution"]
    assert run["score"] > fresh["score"]


# ---------------------------------------------------------------- transparency of the score
def test_score_is_the_weighted_sum_it_claims_to_be(db: Database, world: World, day_start: float,
                                                   cfg: dict) -> None:
    """No hidden model: the published formula reproduces the published score from the published parts."""
    now = day_start + 2 * HOUR
    punch(db, world.ids["op1"], "start_work", now - 200 * MIN)
    with db.session() as s:
        out = fatigue_risk(s, world.ids["op1"], now=now)

    weights = sum(float(f["weight"]) for f in out["factors"])
    points = sum(float(f["contribution"]) for f in out["factors"])
    assert weights == pytest.approx(out["score_max_points"])
    assert out["score"] == round(100.0 * points / weights)
    assert 0 <= out["score"] <= 100
    # Every scoring weight in the payload is the one from config, not a constant baked into the code.
    for key, spec in cfg["factors"].items():
        assert factor(out, key)["weight"] == spec["weight"]
    # ...and every factor shows its value and the threshold it is being judged against.
    for f in out["factors"]:
        assert set(("key", "label", "value", "contribution", "threshold", "note")) <= set(f)
        assert f["note"]


def test_completed_tasks_are_reported_but_never_scored(db: Database, world: World,
                                                       day_start: float) -> None:
    """Output is context, not risk. A busy operator must not score higher for finishing work."""
    op = world.ids["op1"]
    now = midday(day_start)
    punch(db, op, "start_work", now - 60 * MIN)
    with db.session() as s:
        before = fatigue_risk(s, op, now=now)
        s.add(TcTaskRow(task_id="t-done", site_id=SITE, operator_id=op, supervisor_id=world.ids["sup1"],
                        title="Load trucks", status="completed", start_ts=now - 60 * MIN,
                        expected_finish_ts=now, started_at=now - 60 * MIN, finished_at=now - 5 * MIN,
                        created_at=now - 60 * MIN))
    with db.session() as s:
        after = fatigue_risk(s, op, now=now)
    assert before["inputs"]["tasks_completed_today"] == 0
    assert after["inputs"]["tasks_completed_today"] == 1
    assert after["score"] == before["score"]
    assert factor(after, "tasks_completed_today")["weight"] == 0


# ---------------------------------------------------------------- honesty of the wording
def test_every_payload_carries_the_label_and_the_caveats(db: Database, world: World,
                                                         day_start: float) -> None:
    """The label and caveats are not optional decoration — they are part of the response contract."""
    now = midday(day_start)
    punch(db, world.ids["op1"], "start_work", now - 200 * MIN)
    with db.session() as s:
        one = fatigue_risk(s, world.ids["op1"], now=now)
        team = team_fatigue_risk(s, world.ids["sup1"], now=now)

    for payload in (one, team):
        assert payload["label"] == LABEL
        assert "not a measurement" in payload["label"]
        assert len(payload["caveats"]) >= 5
        assert any("does not measure, detect or diagnose" in c for c in payload["caveats"])
        assert any("sole basis" in c for c in payload["caveats"])
        assert payload["method_version"]
    assert all(row["label"] == LABEL for row in team["operators"])


def test_recommendation_is_operational_and_never_diagnostic(db: Database, world: World,
                                                            day_start: float) -> None:
    """"Suggest a break", never "this operator is fatigued"."""
    op = world.ids["op1"]
    now = midday(day_start)
    punch(db, op, "start_work", now - 160 * MIN)
    with db.session() as s:
        out = fatigue_risk(s, op, now=now)
    assert "2 h 40 m" in out["recommendation"]
    assert "break" in out["recommendation"]
    banned = ("is fatigued", "is tired", "drowsy", "asleep", "unfit", "impaired")
    text = " ".join([out["recommendation"], out["label"], *out["caveats"],
                     *(f["note"] for f in out["factors"])]).lower()
    assert not any(word in text for word in banned)


# ---------------------------------------------------------------- team view
def test_team_view_is_name_ordered_with_no_ranking(db: Database, world: World, day_start: float) -> None:
    """Ordered by name on purpose: a fatigue leaderboard is exactly what we refuse to build."""
    now = midday(day_start)
    with db.session() as s:
        s.get(UserRow, world.ids["op1"]).name = "Zoe Adams"
        s.get(UserRow, world.ids["op2"]).name = "Aaron Blake"
    punch(db, world.ids["op1"], "start_work", now - 240 * MIN)     # the higher-risk one, sorted last
    punch(db, world.ids["op2"], "start_work", now - 10 * MIN)

    with db.session() as s:
        team = team_fatigue_risk(s, world.ids["sup1"], now=now)

    assert [row["name"] for row in team["operators"]] == ["Aaron Blake", "Zoe Adams"]
    assert team["operators"][0]["score"] < team["operators"][1]["score"]   # not sorted by score
    assert "not a ranking" in team["ordering_note"]
    assert not any(key in row for row in team["operators"] for key in ("rank", "position", "worst"))
    assert team["counts"]["high"] == 1 and team["counts"]["low"] == 1
    assert team["count"] == len(team["operators"]) == 2
    assert world.ids["op3"] not in [row["user_id"] for row in team["operators"]]   # other team


def test_team_view_for_admin_covers_every_operator(db: Database, world: World, day_start: float) -> None:
    with db.session() as s:
        team = team_fatigue_risk(s, None, now=midday(day_start))
    assert {row["user_id"] for row in team["operators"]} == {world.ids["op1"], world.ids["op2"],
                                                             world.ids["op3"]}


# ---------------------------------------------------------------- endpoints and permissions
def test_supervisor_reads_their_own_operator(world: World, db: Database, day_start: float) -> None:
    punch(db, world.ids["op1"], "start_work", time.time() - 200 * MIN)
    r = world.get("sup1", f"/tc/sup/operators/{world.ids['op1']}/fatigue-risk")
    assert r.status_code == 200
    body = r.json()
    assert body["label"] == LABEL
    assert body["level"] in ("low", "elevated", "high")
    assert body["caveats"] and body["factors"] and body["inputs"]
    assert body["recommendation"]


def test_supervisor_cannot_read_another_teams_operator(world: World) -> None:
    """Cross-team read is 403 — the scope guard, not the UI, decides who is assessable."""
    r = world.get("sup1", f"/tc/sup/operators/{world.ids['op3']}/fatigue-risk")
    assert r.status_code == 403
    r2 = world.get("op1", f"/tc/op/fatigue-risk?operator_id={world.ids['op3']}")
    assert r2.status_code == 403


def test_admin_reads_any_operator(world: World) -> None:
    assert world.get("admin", f"/tc/sup/operators/{world.ids['op1']}/fatigue-risk").status_code == 200


def test_team_endpoint_is_name_ordered(world: World, db: Database) -> None:
    with db.session() as s:
        s.get(UserRow, world.ids["op1"]).name = "Zoe Adams"
        s.get(UserRow, world.ids["op2"]).name = "Aaron Blake"
    r = world.get("sup1", "/tc/sup/fatigue-risk")
    assert r.status_code == 200
    body = r.json()
    assert [row["name"] for row in body["operators"]] == ["Aaron Blake", "Zoe Adams"]
    assert body["label"] == LABEL and body["caveats"]
    assert set(body["counts"]) == {"low", "elevated", "high"}


def test_operator_can_read_their_own_estimate(world: World, db: Database) -> None:
    """Nobody is assessed behind their back: the subject reads the same payload as the supervisor."""
    punch(db, world.ids["op1"], "start_work", time.time() - 200 * MIN)
    mine = world.get("op1", "/tc/op/fatigue-risk")
    assert mine.status_code == 200
    theirs = world.get("sup1", f"/tc/sup/operators/{world.ids['op1']}/fatigue-risk")
    assert mine.json()["level"] == theirs.json()["level"]
    assert mine.json()["label"] == theirs.json()["label"] == LABEL
    assert mine.json()["caveats"] == theirs.json()["caveats"]


def test_operator_cannot_reach_the_team_view(world: World) -> None:
    """The supervisor router is role-guarded; an operator gets 403, not somebody else's numbers."""
    assert world.get("op1", "/tc/sup/fatigue-risk").status_code == 403
