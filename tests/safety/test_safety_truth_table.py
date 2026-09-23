"""Truth table for the deterministic safety rules: boundaries, activity combinations, debounce, latching.

Each case feeds constant-signal segments at 10 Hz and checks which rules are latched at the end.
A segment of duration d spans (d - 0.1) s of elapsed sample time.
"""
from __future__ import annotations

from typing import Any

import pytest

from sentinel.safety.rules import LOCK, PROX_CRIT, PROX_WARN, SEAT, SPEED

from tests.safety.factory import ACTIVE, UNBELTED_ACTIVE, Stream, person

Seg = tuple[float, dict[str, Any]]


def seg(duration_s: float, *parts: dict[str, Any], **signals: Any) -> Seg:
    merged: dict[str, Any] = {}
    for p in parts:
        merged.update(p)
    merged.update(signals)
    return duration_s, merged


OPEN = {"seatbelt": False}
UNLOCKED = {"hyd_lockout": False}
LEFT_SEAT = {"seatbelt": False, "hyd_lockout": False}     # R-LOCK-01 preconditions (engine on by default)

CASES: list[tuple[str, list[Seg], set[str]]] = [
    # ---------------- R-SEAT-01: activity combinations (1 s hold, debounce 0.5 s)
    ("seat/fastened-idle", [seg(1.0)], set()),
    ("seat/open-idle-parkbrake-on", [seg(1.0, OPEN)], set()),
    ("seat/open-parkbrake-released", [seg(1.0, OPEN, ACTIVE)], {SEAT}),
    ("seat/open-travel-0.49", [seg(1.0, OPEN, travel_kmh=0.49)], set()),
    ("seat/open-travel-0.50", [seg(1.0, OPEN, travel_kmh=0.50)], set()),
    ("seat/open-travel-0.51", [seg(1.0, OPEN, travel_kmh=0.51)], {SEAT}),
    ("seat/open-swing-2.99", [seg(1.0, OPEN, swing_dps=2.99)], set()),
    ("seat/open-swing-3.00", [seg(1.0, OPEN, swing_dps=3.0)], set()),
    ("seat/open-swing-3.01", [seg(1.0, OPEN, swing_dps=3.01)], {SEAT}),
    ("seat/open-swing-minus-3.01", [seg(1.0, OPEN, swing_dps=-3.01)], {SEAT}),
    ("seat/open-joy-boom-0.11-unlocked", [seg(1.0, OPEN, UNLOCKED, joy_boom=0.11)], {SEAT}),
    ("seat/open-joy-boom-0.11-locked", [seg(1.0, OPEN, joy_boom=0.11)], set()),
    ("seat/open-joy-boom-0.10-unlocked", [seg(1.0, OPEN, UNLOCKED, joy_boom=0.10)], set()),
    ("seat/open-joy-swing-minus-0.5-unlocked", [seg(1.0, OPEN, UNLOCKED, joy_swing=-0.5)], {SEAT}),
    ("seat/open-joy-stick-unlocked", [seg(1.0, OPEN, UNLOCKED, joy_stick=0.3)], {SEAT}),
    ("seat/open-joy-bucket-unlocked", [seg(1.0, OPEN, UNLOCKED, joy_bucket=-0.3)], {SEAT}),
    ("seat/open-travel-cmd-unlocked", [seg(1.0, OPEN, UNLOCKED, travel_cmd=0.4)], {SEAT}),
    ("seat/open-travel-with-parkbrake-on", [seg(1.0, OPEN, travel_kmh=1.0)], {SEAT}),
    ("seat/fastened-full-motion", [seg(1.0, ACTIVE, UNLOCKED, travel_kmh=3.0, swing_dps=25.0, joy_boom=0.8)],
     set()),
    # ---------------- R-SEAT-01: debounce and latching
    ("seat/debounce-0.4s-not-raised", [seg(0.5, UNBELTED_ACTIVE)], set()),
    ("seat/debounce-0.5s-raised", [seg(0.6, UNBELTED_ACTIVE)], {SEAT}),
    ("seat/bounce-resets-debounce", [seg(0.4, UNBELTED_ACTIVE), seg(0.1, ACTIVE),
                                     seg(0.4, UNBELTED_ACTIVE), seg(0.1, ACTIVE)], set()),
    ("seat/latched-while-condition-persists", [seg(0.6, UNBELTED_ACTIVE), seg(10.0, UNBELTED_ACTIVE)], {SEAT}),
    ("seat/fastened-0.4s-still-latched", [seg(0.6, UNBELTED_ACTIVE), seg(0.5, ACTIVE)], {SEAT}),
    ("seat/fastened-0.5s-cleared", [seg(0.6, UNBELTED_ACTIVE), seg(0.6, ACTIVE)], set()),
    ("seat/inactive-parkbrake-on-cleared", [seg(0.6, UNBELTED_ACTIVE), seg(0.6, OPEN)], set()),
    ("seat/stopped-but-parkbrake-released-latched", [seg(0.6, OPEN, travel_kmh=2.0), seg(2.0, UNBELTED_ACTIVE)],
     {SEAT}),
    # ---------------- R-PROX-CRIT: danger-zone boundaries (idle machine unless stated)
    ("crit/3.99", [seg(1.0, person(3.99))], {PROX_CRIT}),
    ("crit/4.00-inclusive", [seg(1.0, person(4.0))], {PROX_CRIT}),
    ("crit/4.01-idle-nothing", [seg(1.0, person(4.01))], set()),
    ("crit/0.0", [seg(1.0, person(0.0))], {PROX_CRIT}),
    ("crit/no-person", [seg(1.0, person(None))], set()),
    ("crit/3.99-active-no-warning", [seg(1.0, ACTIVE, person(3.99))], {PROX_CRIT}),
    ("crit/4.00-active-no-warning", [seg(1.0, ACTIVE, person(4.0))], {PROX_CRIT}),
    ("crit/debounce-0.1s-not-raised", [seg(0.2, person(3.0))], set()),
    ("crit/debounce-0.2s-raised", [seg(0.3, person(3.0))], {PROX_CRIT}),
    ("crit/hold-1.9s-still-latched", [seg(0.3, person(3.0)), seg(2.0, person(5.0))], {PROX_CRIT}),
    ("crit/hold-2.0s-cleared", [seg(0.3, person(3.0)), seg(2.1, person(5.0))], set()),
    ("crit/person-gone-cleared", [seg(0.3, person(3.0)), seg(2.1, person(None))], set()),
    ("crit/re-entry-within-hold-latched", [seg(0.3, person(3.0)), seg(1.5, person(5.0)), seg(1.0, person(3.5)),
                                           seg(1.5, person(5.0))], {PROX_CRIT}),
    ("crit/sector-change-latched", [seg(0.3, person(3.0, "rear")), seg(1.0, person(2.0, "left"))], {PROX_CRIT}),
    # ---------------- R-PROX-WARN: warning zone (4, 8] while active
    ("warn/4.01-active", [seg(1.0, ACTIVE, person(4.01))], {PROX_WARN}),
    ("warn/8.00-active-inclusive", [seg(1.0, ACTIVE, person(8.0))], {PROX_WARN}),
    ("warn/8.01-active-nothing", [seg(1.0, ACTIVE, person(8.01))], set()),
    ("warn/6.0-idle-nothing", [seg(1.0, person(6.0))], set()),
    ("warn/6.0-swinging", [seg(1.0, swing_dps=15.0, **person(6.0))], {PROX_WARN}),
    ("warn/debounce-0.4s-not-raised", [seg(0.5, ACTIVE, person(6.0))], set()),
    ("warn/inhibited-while-crit-latched", [seg(0.3, ACTIVE, person(3.0)), seg(1.5, ACTIVE, person(6.0))],
     {PROX_CRIT}),
    ("warn/after-crit-clears", [seg(0.3, ACTIVE, person(3.0)), seg(3.0, ACTIVE, person(6.0))], {PROX_WARN}),
    ("warn/machine-stops-cleared", [seg(1.0, ACTIVE, person(6.0)), seg(2.1, person(6.0))], set()),
    ("warn/enters-danger-zone", [seg(1.0, ACTIVE, person(6.0)), seg(2.1, ACTIVE, person(3.0))], {PROX_CRIT}),
    ("prox/not-fitted-ignores-readings", [seg(1.0, ACTIVE, prox_fitted=False, **person(1.0))], set()),
    # ---------------- R-SPEED-01: zone limits, debounce 1 s, clear hysteresis 0.5 km/h
    ("speed/8.00-default-at-limit", [seg(1.5, ACTIVE, travel_kmh=8.0)], set()),
    ("speed/8.01-default-raised", [seg(1.1, ACTIVE, travel_kmh=8.01)], {SPEED}),
    ("speed/8.01-debounce-0.9s", [seg(1.0, ACTIVE, travel_kmh=8.01)], set()),
    ("speed/5.00-loading-zone-at-limit", [seg(1.5, ACTIVE, travel_kmh=5.0, zone="TL-1")], set()),
    ("speed/5.01-loading-zone-raised", [seg(1.5, ACTIVE, travel_kmh=5.01, zone="TL-1")], {SPEED}),
    ("speed/6.0-other-zone-ok", [seg(1.5, ACTIVE, travel_kmh=6.0, zone="BENCH-3")], set()),
    ("speed/hysteresis-band-latched", [seg(1.1, ACTIVE, travel_kmh=9.0), seg(3.0, ACTIVE, travel_kmh=7.8)],
     {SPEED}),
    ("speed/below-margin-cleared", [seg(1.1, ACTIVE, travel_kmh=9.0), seg(1.1, ACTIVE, travel_kmh=7.5)], set()),
    ("speed/enter-loading-zone-raised", [seg(1.5, ACTIVE, travel_kmh=6.0), seg(1.1, ACTIVE, travel_kmh=6.0,
                                                                              zone="TL-1")], {SPEED}),
    # ---------------- R-LOCK-01: belt open + hydraulics unlocked + engine on + stationary, debounce 5 s
    ("lock/5.0s-raised", [seg(5.1, LEFT_SEAT)], {LOCK}),
    ("lock/4.9s-not-raised", [seg(5.0, LEFT_SEAT)], set()),
    ("lock/hydraulics-locked", [seg(6.0, OPEN)], set()),
    ("lock/engine-off", [seg(6.0, LEFT_SEAT, engine_on=False)], set()),
    ("lock/belt-fastened", [seg(6.0, UNLOCKED)], set()),
    ("lock/active-machine-is-seatbelt-rule", [seg(6.0, LEFT_SEAT, ACTIVE)], {SEAT}),
    ("lock/lockout-lowered-cleared", [seg(5.1, LEFT_SEAT), seg(1.1, OPEN)], set()),
    ("lock/controls-touched-hands-over-to-seat", [seg(5.1, LEFT_SEAT), seg(1.1, LEFT_SEAT, joy_boom=0.5)], {SEAT}),
]


def test_truth_table_is_large_enough() -> None:
    assert len(CASES) >= 50


@pytest.mark.parametrize(("segments", "expected"), [c[1:] for c in CASES], ids=[c[0] for c in CASES])
def test_truth_table(segments: list[Seg], expected: set[str]) -> None:
    stream = Stream()
    for duration, signals in segments:
        stream.hold(duration, **signals)
    assert stream.active_rules() == expected


# ---------------------------------------------------------------- latching / ids / evidence
def test_one_announcement_per_continuous_activation() -> None:
    stream = Stream()
    stream.hold(0.6, **UNBELTED_ACTIVE)
    stream.hold(0.2, **ACTIVE)                   # fastened briefly: shorter than clear hold
    stream.hold(10.0, **UNBELTED_ACTIVE)
    assert len(stream.raised(SEAT)) == 1 and not stream.cleared(SEAT)


def test_raise_is_exactly_at_debounce() -> None:
    stream = Stream()
    start = stream.now
    stream.hold(1.0, **UNBELTED_ACTIVE)
    (msg,) = stream.raised(SEAT)
    assert msg.ts - start == pytest.approx(0.5, abs=1e-6)
    assert msg.evidence["onset_ts"] == pytest.approx(start)


def test_reentry_gets_a_new_alert_id() -> None:
    stream = Stream()
    stream.hold(0.6, **UNBELTED_ACTIVE)
    stream.hold(0.6, **ACTIVE)
    stream.hold(0.6, **UNBELTED_ACTIVE)
    first, second = stream.raised(SEAT)
    (cleared,) = stream.cleared(SEAT)
    assert cleared.alert_id == first.alert_id != second.alert_id
    assert stream.engine.active_alert_ids() == [second.alert_id]


def test_messages_carry_version_ids_and_sample_publish_time() -> None:
    stream = Stream()
    stream.hold(0.6, **UNBELTED_ACTIVE)
    stream.hold(0.6, **ACTIVE)
    raised, cleared = stream.transitions
    assert raised.rule_version == stream.engine.rule_version == cleared.rule_version
    assert (raised.machine_id, raised.operator_id) == ("EX-07", "OP-1042")
    assert raised.sample_t_pub_ns == 1_000 + 5 and cleared.sample_t_pub_ns == 1_000 + 11
    assert raised.t_pub_ns is None                       # stamped by the process at publish time
    assert cleared.evidence["active_s"] == pytest.approx(0.6, abs=1e-3)
    assert (raised.what, raised.why, raised.do) == (cleared.what, cleared.why, cleared.do)


def test_danger_zone_reports_sector_distance_and_tier() -> None:
    stream = Stream()
    stream.hold(0.3, **person(2.5, "left"))
    (msg,) = stream.raised(PROX_CRIT)
    assert msg.evidence["sector"] == "left"
    assert msg.evidence["distance_m"] == pytest.approx(2.5, abs=1e-3)
    assert msg.evidence["tier"] == "T_CRIT" and msg.evidence["category"] == "immediate_critical"
    assert "left" in msg.what
    assert msg.evidence["provenance"] == ["RULE", "SIMULATED"]


@pytest.mark.parametrize(("rule_id", "segments", "tier"), [
    (SEAT, [seg(1.0, UNBELTED_ACTIVE)], "T_CRIT"),
    (PROX_WARN, [seg(1.0, ACTIVE, person(6.0))], "T2"),
    (SPEED, [seg(1.5, ACTIVE, travel_kmh=9.0)], "T2"),
    (LOCK, [seg(5.5, LEFT_SEAT)], "T2"),
])
def test_tier_hint_in_evidence(rule_id: str, segments: list[Seg], tier: str) -> None:
    stream = Stream()
    for duration, signals in segments:
        stream.hold(duration, **signals)
    (msg,) = stream.raised(rule_id)
    assert msg.evidence["tier"] == tier


def test_seatbelt_evidence_names_the_activity() -> None:
    stream = Stream()
    stream.hold(1.0, seatbelt=False, swing_dps=12.0)
    (msg,) = stream.raised(SEAT)
    assert msg.evidence["active_reasons"] == ["swing"]
    assert msg.why == "Seatbelt open while swinging"
