"""Sensor validation: NaN / stuck-at proximity, flapping seatbelt switch, proximity not fitted, staleness."""
from __future__ import annotations

import math

from sentinel.safety.health import protection_state
from sentinel.safety.rules import PROX_CRIT, SEAT, SENSOR

from tests.safety.factory import ACTIVE, T0, UNBELTED_ACTIVE, Stream, person

NAN = math.nan


def _faults(stream: Stream, sensor: str, state: str = "raised") -> list:
    return [m for m in stream.transitions
            if m.rule_id == SENSOR and m.evidence["sensor"] == sensor and m.state == state]


# ---------------------------------------------------------------- proximity: invalid values
def test_nan_for_2s_is_not_yet_a_fault() -> None:
    stream = Stream()
    stream.hold(2.1, prox_person_m=NAN)                  # elapsed 2.0 s: not "more than 2 s"
    assert not _faults(stream, "proximity")
    assert stream.engine.sensor_health(stream.last_ts)["proximity"] == "ok"


def test_nan_for_more_than_2s_is_a_fault_and_degrades_protection() -> None:
    stream = Stream()
    stream.hold(2.2, prox_person_m=NAN)
    (fault,) = _faults(stream, "proximity")
    assert fault.evidence["fault"] == "invalid" and fault.evidence["value"] == "nan"
    assert fault.evidence["channel"] == "prox_person_m" and fault.evidence["tier"] == "T2"
    health = stream.engine.sensor_health(stream.last_ts)
    assert health == {"seatbelt": "ok", "proximity": "fault", "telemetry": "ok"}
    assert protection_state(health) == "degraded"


def test_negative_and_infinite_distances_are_invalid() -> None:
    for bad in (-1.0, math.inf):
        stream = Stream()
        stream.hold(2.2, prox_truck_m=bad)
        (fault,) = _faults(stream, "proximity")
        assert fault.evidence["channel"] == "prox_truck_m"


def test_nan_fault_clears_after_valid_readings_for_hold() -> None:
    stream = Stream()
    stream.hold(2.2, prox_person_m=NAN)
    stream.hold(2.0, prox_person_m=None)                 # clear hold 2.0 s: elapsed 1.9
    assert not _faults(stream, "proximity", "cleared")
    stream.hold(0.1, prox_person_m=None)
    (cleared,) = _faults(stream, "proximity", "cleared")
    assert cleared.alert_id == _faults(stream, "proximity")[0].alert_id
    assert stream.engine.sensor_health(stream.last_ts)["proximity"] == "ok"


def test_nan_never_raises_or_clears_the_danger_zone() -> None:
    stream = Stream()
    stream.hold(1.0, prox_person_m=NAN)
    assert not stream.raised(PROX_CRIT)
    stream.hold(0.3, **person(3.0))
    stream.hold(5.0, prox_person_m=NAN)                   # unreadable: hold the latched alert
    assert stream.active_rules() == {PROX_CRIT, SENSOR}
    assert not stream.cleared(PROX_CRIT)


# ---------------------------------------------------------------- proximity: stuck-at
def test_stuck_at_value_is_a_fault_but_live_jitter_is_not() -> None:
    live = Stream(jitter=True)
    live.hold(10.0, **person(6.25))
    assert not _faults(live, "proximity")

    stuck = Stream(jitter=False)
    stuck.hold(2.1, **person(6.25))
    assert not _faults(stuck, "proximity")
    stuck.hold(0.1, **person(6.25))
    (fault,) = _faults(stuck, "proximity")
    assert fault.evidence["fault"] == "stuck" and fault.evidence["value"] == 6.25
    assert "stuck" in fault.why


def test_stuck_in_danger_zone_keeps_alert_latched_until_sensor_recovers() -> None:
    stream = Stream(jitter=False)
    stream.hold(3.0, **person(3.0))                       # CRIT at 0.2 s, stuck fault at 2.1 s
    stream.hold(3.0, **person(None))                      # sensor fault clears at +2.0 s; CRIT frozen until then
    order = [(m.rule_id, m.state) for m in stream.transitions]
    assert order == [(PROX_CRIT, "raised"), (SENSOR, "raised"), (SENSOR, "cleared")]
    stream.hold(1.1, **person(None))                      # CRIT needs its own 2 s clear hold after recovery
    assert stream.cleared(PROX_CRIT) and stream.active_rules() == set()


# ---------------------------------------------------------------- seatbelt: flapping switch
def _toggle(stream: Stream, period_s: float, duration_s: float, **signals) -> None:
    fastened, t_end = True, stream.now + duration_s
    while stream.now < t_end - 1e-9:
        stream.hold(period_s, seatbelt=fastened, **signals)
        fastened = not fastened


def test_flapping_switch_is_a_sensor_fault_not_an_alarm_flood() -> None:
    stream = Stream()
    _toggle(stream, 0.3, 10.0, **ACTIVE)
    (fault,) = _faults(stream, "seatbelt")
    assert fault.evidence["fault"] == "flapping" and fault.evidence["transitions"] == 7
    assert not stream.raised(SEAT)
    assert stream.engine.sensor_health(stream.last_ts)["seatbelt"] == "fault"


def test_slow_flapping_raises_bounded_seat_alerts_then_freezes() -> None:
    stream = Stream()
    _toggle(stream, 0.7, 20.0, **ACTIVE)
    fault_ts = _faults(stream, "seatbelt")[0].ts
    assert len(stream.raised(SEAT)) <= 3
    assert not [m for m in stream.transitions if m.rule_id == SEAT and m.ts > fault_ts]


def test_six_transitions_in_5s_is_not_a_fault_seven_is() -> None:
    six = Stream()
    _toggle(six, 0.8, 5.6)                               # 6 changes, all within one 5 s window
    assert six.engine.sensor_health(six.last_ts)["seatbelt"] == "ok"
    seven = Stream()
    _toggle(seven, 0.7, 5.6)                              # 7 changes within 4.9 s
    assert _faults(seven, "seatbelt")


def test_flap_fault_clears_after_stable_window_and_releases_seat_rule() -> None:
    stream = Stream()
    stream.hold(1.0, **UNBELTED_ACTIVE)                   # R-SEAT-01 latched
    _toggle(stream, 0.3, 3.0, **ACTIVE)                   # flapping -> fault; SEAT held latched
    assert stream.active_rules() == {SEAT, SENSOR}
    stream.hold(5.0, **ACTIVE)                            # fastened, but the last change is still in the window
    assert not _faults(stream, "seatbelt", "cleared")
    stream.hold(0.2, **ACTIVE)                            # stable for more than a full 5 s window
    assert _faults(stream, "seatbelt", "cleared")
    stream.hold(0.6, **ACTIVE)
    assert stream.active_rules() == set()
    assert stream.engine.sensor_health(stream.last_ts)["seatbelt"] == "ok"


# ---------------------------------------------------------------- proximity not fitted
def test_proximity_not_fitted_reports_not_fitted_without_crash() -> None:
    stream = Stream()
    stream.hold(5.0, prox_fitted=False, prox_person_m=NAN, prox_truck_m=-3.0, **ACTIVE)
    assert stream.transitions == []
    health = stream.engine.sensor_health(stream.last_ts)
    assert health == {"seatbelt": "ok", "proximity": "not_fitted", "telemetry": "ok"}
    assert protection_state(health) == "active"
    assert "prox_person_m" not in stream.engine.required_signals(prox_fitted=False)
    stream.hold(1.0, prox_fitted=False, **UNBELTED_ACTIVE)   # other rules still work
    assert stream.active_rules() == {SEAT}


# ---------------------------------------------------------------- staleness and clock
def test_health_goes_stale_after_2s_without_samples() -> None:
    stream = Stream()
    assert set(stream.engine.sensor_health(T0).values()) == {"stale"}      # nothing received yet
    stream.hold(1.0)
    last = stream.last_ts
    assert set(stream.engine.sensor_health(last + 2.0).values()) == {"ok"}
    assert stream.engine.sensor_health(last + 2.1) == {"seatbelt": "stale", "proximity": "stale",
                                                        "telemetry": "stale"}


def test_non_finite_motion_signal_counts_as_active() -> None:
    stream = Stream()
    stream.hold(1.0, seatbelt=False, travel_kmh=NAN)
    (msg,) = stream.raised(SEAT)
    assert "signal_invalid" in msg.evidence["active_reasons"]


def test_backwards_clock_jump_restarts_timers_without_losing_protection() -> None:
    stream = Stream()
    stream.hold(0.3, **UNBELTED_ACTIVE)                   # debounce timer running on the old timeline
    stream.t0 -= 3600.0                                   # scenario restarted one hour earlier
    onset = stream.now
    stream.hold(0.6, **UNBELTED_ACTIVE)
    (msg,) = stream.raised(SEAT)
    assert onset <= msg.ts <= onset + 0.5 + 1e-6
