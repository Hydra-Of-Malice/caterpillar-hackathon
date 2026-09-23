"""Practice sessions: contract, determinism, archetype separability, near-truck rule compliance."""
from __future__ import annotations

import pandas as pd
import pytest

from sentinel.shared.schemas import PracticeSample
from sentinel.sim.practice import EXERCISES, generate_practice_session
from tests.sim.metrics import cycle_metrics, rule_violations, to_frame


def _metrics(archetype: str, exercise: str = "truck_loading_basic", seeds: int = 3, cycles: int = 10) -> pd.DataFrame:
    return pd.concat([cycle_metrics(to_frame(generate_practice_session(archetype, cycles, s, exercise)))
                      for s in range(seeds)])


@pytest.fixture(scope="module")
def expert() -> pd.DataFrame:
    return _metrics("expert")


@pytest.fixture(scope="module")
def novice() -> pd.DataFrame:
    return _metrics("novice")


def test_contract():
    s = generate_practice_session("novice_improving", 3, 7, "trench_basic")
    assert all(isinstance(x, PracticeSample) for x in s)
    assert {x.gt["phase"] for x in s} >= {"dig", "swing_loaded", "dump", "swing_empty"}
    assert {x.gt["cycle"] for x in s} == {0, 1, 2}
    assert all(set(x.gt) == {"phase", "cycle", "archetype"} and x.gt["archetype"] == "novice_improving" for x in s)
    assert all(x.bucket_to_truck_m is None for x in s)            # no truck in the trench exercise
    assert set(EXERCISES) == {"truck_loading_basic", "trench_basic"}


def test_deterministic():
    a = generate_practice_session("novice", 2, 3)
    b = generate_practice_session("novice", 2, 3)
    c = generate_practice_session("novice", 2, 4)
    assert [x.model_dump() for x in a] == [x.model_dump() for x in b]
    assert [x.model_dump() for x in a] != [x.model_dump() for x in c]


def test_realistic_magnitudes(expert, novice):
    assert 17 <= expert.cycle_s.mean() <= 25
    assert 25 <= novice.cycle_s.mean() <= 35
    assert expert.swing_peak_dps.max() <= 60
    assert novice.swing_peak_dps.max() <= 68


@pytest.mark.parametrize("metric, direction", [
    ("cycle_s", "novice_higher"), ("dig_s", "novice_higher"), ("dump_s", "novice_higher"),
    ("idle_gap_s", "novice_higher"), ("swing_peak_dps", "novice_higher"), ("swing_near_truck_dps", "novice_higher"),
    ("jerk", "novice_higher"), ("reversals", "novice_higher"), ("overshoot_deg", "novice_higher"),
    ("overlap", "expert_higher"), ("fill_t", "expert_higher"),
])
def test_archetype_separability(expert, novice, metric, direction):
    e, n = expert[metric].mean(), novice[metric].mean()
    assert (n > e) if direction == "novice_higher" else (e > n), (metric, e, n)


def test_expert_clean_and_consistent(expert):
    assert expert.reversals.sum() == 0
    assert expert.overshoot_deg.max() < 1.0
    assert expert.cycle_s.std() / expert.cycle_s.mean() < 0.08


def test_near_truck_rule_expert_zero_novice_often():
    """fusion.yaml fast_swing_near_truck: |swing| > 35 °/s with bucket_to_truck_m < 5 m for 0.3 s."""
    def rate(archetype: str, sessions: int, strict: int) -> tuple[float, int, float]:
        frames = [to_frame(generate_practice_session(archetype, 25, 100 + k)) for k in range(sessions)]
        viol = pd.concat([rule_violations(f, strict) for f in frames])
        near = pd.concat(frames)
        near = near[near.bucket_to_truck_m < 5].swing_dps.abs()
        return float(viol.mean()), len(viol), float(near.max())

    ex_rate, ex_cycles, ex_near_max = rate("expert", 8, strict=3)
    assert ex_cycles >= 200 and ex_rate == 0.0
    assert ex_near_max <= 25.0                       # typically 15–22 °/s once within 5 m of the truck
    nov_rate, _, _ = rate("novice", 4, strict=4)
    assert nov_rate > 0.30
    int_rate, _, _ = rate("intermediate", 4, strict=3)
    assert int_rate < 0.10
