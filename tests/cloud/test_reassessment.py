"""Re-assessment: exact conditional rate ratio and the demo fixture numbers (SIMULATED)."""
from __future__ import annotations

import math

import pytest

from sentinel.cloud.competency.demo_fixture import load_shift
from sentinel.cloud.competency.service import evaluate_shift, on_module_completed
from sentinel.cloud.competency.state import get_row
from sentinel.cloud.reassess.rate_ratio import exact_conditional_rr, poisson_glm_rr, poisson_rate_ci
from sentinel.cloud.reassess.service import NoGapEvidence, reassess
from sentinel.cloud.roles import Role
from sentinel.store.db import Database

from tests.cloud.conftest import SHIFT2


def test_exact_conditional_rr_reproduces_demo_numbers() -> None:
    rr = exact_conditional_rr(7, 81, 2, 45)
    assert rr.rr == pytest.approx(0.514, abs=0.001)
    assert rr.lo == pytest.approx(0.052, abs=0.001)
    assert rr.hi == pytest.approx(2.70, abs=0.01)
    assert "exact" in rr.method


def test_exact_rr_edge_cases() -> None:
    assert exact_conditional_rr(0, 81, 0, 45).rr is None
    zero_post = exact_conditional_rr(7, 81, 0, 45)
    assert zero_post.rr == 0 and zero_post.lo == 0 and zero_post.hi > 0
    assert math.isinf(exact_conditional_rr(0, 81, 3, 45).hi)
    lo, hi = poisson_rate_ci(7, 81)
    assert lo < 7 / 81 < hi


def test_poisson_glm_with_strata_agrees_with_exact_on_one_stratum_scale() -> None:
    rows = [("pre", "truck_loading", 7, 81.0), ("post", "truck_loading", 2, 45.0),
            ("pre", "trenching", 4, 60.0), ("post", "trenching", 1, 50.0)]
    rr = poisson_glm_rr(rows)
    assert 0.2 < rr.rr < 0.8 and rr.lo < rr.rr < rr.hi
    assert "GLM" in rr.method


def test_demo_fixture_reassessment_7_of_81_to_2_of_45(demo_db: Database) -> None:
    with demo_db.session() as s:
        on_module_completed(s, "OP-1042", ["C04"])
        load_shift(s, "shift2")
        result = evaluate_shift(s, "OP-1042", SHIFT2, requested_by=Role.system)
        state = get_row(s, "OP-1042", "C04", create=False).state
    r = next(x for x in result["reassessments"] if x["competency_id"] == "C04")
    assert (r["pre"]["events"], r["pre"]["opportunities"]) == (7, 81)
    assert (r["post"]["events"], r["post"]["opportunities"]) == (2, 45)
    assert r["rr"] == pytest.approx(0.51, abs=0.01)
    assert r["ci95"][0] == pytest.approx(0.05, abs=0.005) and r["ci95"][1] == pytest.approx(2.70, abs=0.01)
    assert r["verdict"] == "trending better, not yet conclusive"
    assert r["behavior_trend"] == "improving" and r["label"] == "SIMULATED"
    assert any("SIMULATED" in c for c in r["caveats"])
    assert state == "improving"                    # improving schedules an assessment; never demonstrated
    assert [p["period"] for p in r["series"]] == ["pre", "pre", "post"]


def test_reassessment_needs_gap_evidence(db: Database) -> None:
    with db.session() as s, pytest.raises(NoGapEvidence):
        reassess(s, "OP-1042", "C04")
