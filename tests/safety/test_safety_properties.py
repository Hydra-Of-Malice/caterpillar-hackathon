"""Property-based tests (hypothesis) for the safety rule engine."""
from __future__ import annotations

from typing import Any

from hypothesis import given, settings
from hypothesis import strategies as st

from sentinel.shared.schemas import SafetyAlertMsg

from sentinel.safety.rules import LOCK, SEAT, SENSOR, RuleEngine

from tests.safety.factory import UNBELTED_ACTIVE, Stream

PROPS = settings(max_examples=150, deadline=None)

_speed = st.sampled_from([0.0, 0.5, 0.51, 3.0, 5.0, 5.01, 7.6, 8.0, 8.01, 12.0]) | st.floats(0.0, 15.0)
_distance = st.none() | st.sampled_from([3.99, 4.0, 4.01, 7.99, 8.0, 8.01]) | st.floats(0.0, 12.0)


def _signals(seatbelt: st.SearchStrategy[bool]) -> st.SearchStrategy[dict[str, Any]]:
    return st.fixed_dictionaries({
        "seatbelt": seatbelt,
        "park_brake": st.booleans(),
        "hyd_lockout": st.booleans(),
        "engine_on": st.booleans(),
        "travel_kmh": _speed,
        "swing_dps": st.floats(-40.0, 40.0),
        "joy_boom": st.floats(-1.0, 1.0),
        "prox_person_m": _distance,
        "prox_person_sector": st.sampled_from(["front", "right", "rear", "left"]),
        "zone": st.sampled_from([None, "TL-1", "BENCH-3"]),
    })


def _segments(seatbelt: st.SearchStrategy[bool] = st.booleans()) -> st.SearchStrategy[list[tuple[int, dict]]]:
    """Run-length encoded streams: (n samples at 10 Hz, constant signals)."""
    return st.lists(st.tuples(st.integers(1, 40), _signals(seatbelt)), min_size=1, max_size=25)


def _run(segments: list[tuple[int, dict[str, Any]]], engine: RuleEngine | None = None) -> list[SafetyAlertMsg]:
    stream = Stream(engine)
    for n, signals in segments:
        for _ in range(n):
            stream.step(**signals)
    return stream.transitions


@PROPS
@given(_segments(seatbelt=st.just(True)))
def test_no_seatbelt_alert_while_fastened(segments: list[tuple[int, dict]]) -> None:
    out = _run(segments)
    assert not [m for m in out if m.rule_id in (SEAT, LOCK) or m.evidence.get("sensor") == "seatbelt"]


@PROPS
@given(st.lists(st.tuples(st.integers(1, 40), st.fixed_dictionaries({
    "park_brake": st.booleans(), "hyd_lockout": st.booleans(), "engine_on": st.booleans(),
    "travel_kmh": st.floats(0.0, 4.4), "swing_dps": st.floats(-40.0, 40.0), "joy_boom": st.floats(-1.0, 1.0),
    "zone": st.sampled_from([None, "TL-1", "BENCH-3"])})), min_size=1, max_size=25))
def test_no_alert_at_all_when_fastened_clear_and_slow(segments: list[tuple[int, dict]]) -> None:
    assert _run(segments) == []


@PROPS
@given(_segments())
def test_never_cleared_without_prior_raise(segments: list[tuple[int, dict]]) -> None:
    open_by_channel: dict[tuple[str, Any], str] = {}
    seen: dict[str, list[str]] = {}
    for m in _run(segments):
        channel = (m.rule_id, m.evidence.get("sensor"))
        seen.setdefault(m.alert_id, []).append(m.state)
        if m.state == "raised":
            assert channel not in open_by_channel, "re-raised while still latched"
            open_by_channel[channel] = m.alert_id
        else:
            assert open_by_channel.pop(channel, None) == m.alert_id, "cleared without a prior raise"
    assert all(states in (["raised"], ["raised", "cleared"]) for states in seen.values())


def _canonical(out: list[SafetyAlertMsg]) -> list[dict[str, Any]]:
    """Replace random activation ids by first-seen order so two runs can be compared."""
    order: dict[str, int] = {}
    rows = []
    for m in out:
        row = m.model_dump()
        row["alert_id"] = order.setdefault(m.alert_id, len(order))
        rows.append(row)
    return rows


@PROPS
@given(_segments())
def test_same_input_stream_gives_same_outputs(segments: list[tuple[int, dict]]) -> None:
    assert _canonical(_run(segments)) == _canonical(_run(segments))


@PROPS
@given(_segments(seatbelt=st.just(True)))
def test_seatbelt_tcrit_within_debounce_after_any_belted_history(segments: list[tuple[int, dict]]) -> None:
    stream = Stream()
    for n, signals in segments:
        for _ in range(n):
            stream.step(**signals)
    onset = stream.now
    stream.hold(0.6, **UNBELTED_ACTIVE)
    raised = stream.raised(SEAT)
    assert len(raised) == 1 and raised[0].ts - onset <= 0.5 + 1e-6


@PROPS
@given(st.lists(st.tuples(st.integers(1, 30), st.fixed_dictionaries({
    "seatbelt": st.booleans(), "park_brake": st.booleans(), "prox_fitted": st.booleans(),
    "travel_kmh": st.floats(allow_nan=True, allow_infinity=True),
    "swing_dps": st.floats(allow_nan=True, allow_infinity=True),
    "joy_stick": st.floats(allow_nan=True, allow_infinity=True),
    "prox_person_m": st.none() | st.floats(allow_nan=True, allow_infinity=True),
    "prox_truck_m": st.none() | st.floats(allow_nan=True, allow_infinity=True)})), min_size=1, max_size=20))
def test_arbitrary_floats_never_crash_and_stay_consistent(segments: list[tuple[int, dict]]) -> None:
    stream = Stream()
    for n, signals in segments:
        for _ in range(n):
            stream.step(**signals)
    health = stream.engine.sensor_health(stream.last_ts)
    assert set(health) == {"seatbelt", "proximity", "telemetry"}
    assert set(stream.engine.active_alert_ids()) == {m.alert_id for m in stream.raised()} - {
        m.alert_id for m in stream.cleared()}
    for m in stream.transitions:
        SafetyAlertMsg.model_validate_json(m.model_dump_json())     # evidence stays JSON-safe
        assert m.rule_id != SENSOR or m.evidence["sensor"] in ("seatbelt", "proximity")
