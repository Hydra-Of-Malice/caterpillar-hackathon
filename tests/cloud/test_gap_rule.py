"""Gap rule: Gamma–Poisson evidence, recurrence floor, machine-attribution exclusion, disputes."""
from __future__ import annotations

import pytest

from sentinel.cloud.competency.catalog import get_catalog
from sentinel.cloud.competency.evidence import Prior, method_of_moments_prior, posterior_exceedance
from sentinel.cloud.competency.mapping import map_event
from sentinel.cloud.competency.service import evaluate_shift
from sentinel.cloud.competency.state import get_row
from sentinel.cloud.roles import Role
from sentinel.shared.schemas import Attribution, Event, Provenance, RiskCategory
from sentinel.store.db import Database
from sentinel.store.models import EventRow, ExposureRow, IncidentRow, ShiftRow

from tests.cloud.conftest import SHIFT0, SHIFT1

DAY = 86_400.0
T0 = 1_790_000_000.0


def _evidence(result: dict, cid: str) -> dict:
    return next(e for e in result["evaluated"] if e["competency_id"] == cid)


def _seed(db: Database, operator: str, shifts: list[tuple[str, int, str]], cycles: int = 40,
          hours: float = 4.0, event_type: str = "fast_swing_near_truck") -> None:
    """shifts = [(shift_id, n_events, attribution)] one day apart, each with truck-loading exposure."""
    with db.session() as s:
        for i, (sid, n, attribution) in enumerate(shifts):
            start = T0 + i * DAY
            s.add(ShiftRow(shift_id=sid, operator_id=operator, machine_id="EX-07", site_id="north-quarry",
                           planned_start=start, planned_end=start + 30_600, started_at=start, ended_at=start + 30_600))
            s.add(ExposureRow(operator_id=operator, shift_id=sid, task_type="truck_loading", operating_h=hours,
                              cycles=cycles, truck_approach_cycles=cycles))
            for k in range(n):
                ev = Event(event_id=f"e_{sid}_{k}", ts=start + 3600 + k * 600, site_id="north-quarry",
                           machine_id="EX-07", operator_id=operator, shift_id=sid, type=event_type,
                           category=RiskCategory.dangerous_condition, provenance=[Provenance.RULE],
                           attribution=Attribution(attribution), context={"task_type": "truck_loading"})
                s.add(EventRow(event_id=ev.event_id, ts=ev.ts, operator_id=operator, machine_id="EX-07",
                               shift_id=sid, type=ev.type, category=ev.category.value, tier=None,
                               attribution=attribution, data=ev.model_dump(mode="json")))


def _evaluate(db: Database, operator: str, shift_id: str) -> dict:
    with db.session() as s:
        return evaluate_shift(s, operator, shift_id, requested_by=Role.system)


def test_catalog_has_14_competencies_and_c04_is_swing_control() -> None:
    cat = get_catalog()
    assert list(cat.competencies) == [f"C{i:02d}" for i in range(1, 15)]
    assert cat.competencies["C04"].label.startswith("Approach & swing control")
    assert cat.competencies["C02"].floor == 2 and cat.competencies["C04"].floor == 3   # safety-critical floor
    assert cat.version and cat.gap_rule.version


def test_mapping_is_deterministic_and_first_match_wins() -> None:
    cat = get_catalog()
    assert map_event("fast_swing_near_truck", {}, [], cat) == ({"C04": 1.0, "C09": 0.3}, "MAP-SWING-TRUCK")
    assert map_event("swing_rate_exceed", {"task_type": "truck_loading"}, [], cat)[0] == {"C04": 1.0, "C09": 0.3}
    assert map_event("swing_rate_exceed", {"task_type": "trenching"}, [], cat)[0] == {"C09": 1.0}
    assert map_event("brand_new_type", {}, ["C06"], cat) == ({"C06": 1.0}, None)


def test_ravi_after_shift1_has_c04_gap_7_events_2_shifts_81_cycles(demo_db: Database) -> None:
    with demo_db.session() as s:
        row = get_row(s, "OP-1042", "C04", create=False)
        assert row is not None and row.state == "observed_gap"
        gap = row.evidence["gap"]
    assert gap["n_events"] == 7
    assert gap["n_shifts"] == 2
    assert gap["opportunities"] == 81
    assert gap["posterior_p"] == pytest.approx(0.9, abs=0.03)
    assert gap["shift_ids"] == [SHIFT0, SHIFT1]
    assert gap["confidence"] in ("medium", "high")
    assert gap["data_provenance"] == "SIMULATED"


def test_single_shift_never_creates_a_gap(demo_db: Database) -> None:
    # C02: 2 seatbelt events in Shift 1 only → floor met, but only one shift → no gap
    with demo_db.session() as s:
        row = get_row(s, "OP-1042", "C02", create=False)
        assert row.state == "unassessed"
        assert "min_shifts" in row.evidence["latest"]["failed_checks"]


def test_recurrence_floor_blocks_two_events_for_c04(db: Database) -> None:
    _seed(db, "OP-T1", [("A1", 1, "operator"), ("A2", 1, "operator")], cycles=10)
    ev = _evidence(_evaluate(db, "OP-T1", "A2"), "C04")
    assert ev["n_events"] == 2 and ev["n_shifts"] == 2
    assert not ev["gap"] and "recurrence_floor" in ev["failed_checks"]


def test_safety_critical_floor_is_two_across_two_shifts(db: Database) -> None:
    _seed(db, "OP-T2", [("B1", 1, "operator"), ("B2", 1, "operator")], event_type="seatbelt_unfastened_moving")
    result = _evaluate(db, "OP-T2", "B2")
    ev = _evidence(result, "C02")
    assert ev["n_events"] == 2 and ev["floor"] == 2
    assert ev["gap"], ev["failed_checks"]
    assert any(t["competency_id"] == "C02" and t["to"] == "observed_gap" for t in result["transitions"])


def test_posterior_threshold_blocks_low_rate_even_above_floor(db: Database) -> None:
    # 4 events over 400 cycles (1 %) is far below the 5 % reference → P small → no gap
    _seed(db, "OP-T3", [("C1", 2, "operator"), ("C2", 2, "operator")], cycles=200)
    ev = _evidence(_evaluate(db, "OP-T3", "C2"), "C04")
    assert ev["n_events"] == 4 and ev["posterior_p"] < 0.8 and not ev["gap"]


def test_machine_attributed_events_are_excluded_from_counts(db: Database) -> None:
    _seed(db, "OP-T4", [("D1", 4, "machine"), ("D2", 4, "machine")])
    ev = _evidence(_evaluate(db, "OP-T4", "D2"), "C04")
    assert ev["n_events"] == 0 and ev["excluded"]["machine"] == 8 and not ev["gap"]


def test_environment_attributed_events_are_excluded_and_unknown_counts(db: Database) -> None:
    _seed(db, "OP-T5", [("E1", 3, "environment"), ("E2", 4, "unknown")], cycles=40)
    ev = _evidence(_evaluate(db, "OP-T5", "E2"), "C04")
    assert ev["excluded"]["environment"] == 3
    assert ev["n_events"] == 4 and ev["n_unknown"] == 4 and ev["n_shifts"] == 1


def test_mixed_attribution_only_operator_events_count(db: Database) -> None:
    _seed(db, "OP-T6", [("F1", 3, "operator"), ("F2", 4, "operator")])
    with db.session() as s:   # re-attribute 3 of Shift F2's events to the machine
        for k in range(3):
            s.get(EventRow, f"e_F2_{k}").attribution = "machine"
    ev = _evidence(_evaluate(db, "OP-T6", "F2"), "C04")
    assert ev["n_events"] == 4 and ev["excluded"]["machine"] == 3


def test_disputed_events_are_excluded_until_resolved(db: Database) -> None:
    _seed(db, "OP-T7", [("G1", 3, "operator"), ("G2", 4, "operator")], cycles=40)
    with db.session() as s:
        s.add(IncidentRow(incident_id="inc1", ts=T0, operator_id="OP-T7", machine_id="EX-07", source="auto",
                          type="fast_swing", severity="medium",
                          data={"dispute_status": "disputed", "event_ids": ["e_G1_0", "e_G1_1"]}))
    ev = _evidence(_evaluate(db, "OP-T7", "G2"), "C04")
    assert ev["excluded"]["disputed"] == 2 and ev["n_events"] == 5


def test_posterior_increases_with_events_and_prior_moments() -> None:
    prior = Prior(1.0, 10.0, "fixed")
    ps = [posterior_exceedance(k, 81, prior, 0.05) for k in (0, 3, 7, 12)]
    assert ps == sorted(ps) and ps[0] < 0.2 and ps[-1] > 0.99
    fitted = method_of_moments_prior([1, 9, 2, 14, 5, 0], [80, 80, 90, 70, 100, 60])
    assert fitted is not None and fitted.alpha > 0 and fitted.beta > 0
    assert method_of_moments_prior([4, 4, 4], [80, 80, 80]) is None   # no between-operator variance
