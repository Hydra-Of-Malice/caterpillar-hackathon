"""Session fixtures for simulator tests."""
from __future__ import annotations

import itertools
from typing import Any

import pytest

from sentinel.sim.generator import ShiftSimulator, load_scenario


@pytest.fixture(scope="session")
def ravi_shift1_t1() -> list[dict[str, Any]]:
    """First 130 simulated minutes of ravi_shift1 (all scripted T-1 events)."""
    return list(itertools.islice(ShiftSimulator(load_scenario("ravi_shift1"), seed=42).rows(), 130 * 600))
