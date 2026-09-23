"""Test fixtures for the Practice Analyser, built on the package's SIMULATED synthetic generator."""
from __future__ import annotations

from pathlib import Path

import pytest

from sentinel.practice.analyser import PracticeAnalyser
from sentinel.practice.model import ExpertSession, fit_expert_model
from sentinel.practice.synthetic import generate_synthetic_session

FIXTURE_EXPERTS = ("EXP-A", "EXP-B", "EXP-C", "EXP-D")


def expert_sessions(n_cycles: int = 14, unsafe: bool = True) -> list[ExpertSession]:
    """Fixture expert pool: 4 SIMULATED experts, one unsafe cycle planted in the first session."""
    return [ExpertSession.from_samples(op, "truck_loading_basic", generate_synthetic_session(
        "expert", n_cycles, seed=100 + i, operator=op, unsafe_cycles=(3,) if unsafe and i == 0 else ()))
        for i, op in enumerate(FIXTURE_EXPERTS)]


@pytest.fixture(scope="session")
def make_session():
    """Factory: make_session(archetype, n_cycles=8, seed=0) -> list[PracticeSample]."""
    return generate_synthetic_session


@pytest.fixture(scope="session")
def emm():
    """An Expert Motion Model trained once on the fixture experts."""
    return fit_expert_model(expert_sessions(), version="emm-test")


@pytest.fixture(scope="session")
def analyser(emm) -> PracticeAnalyser:
    return PracticeAnalyser(emm)


@pytest.fixture(scope="session")
def model_dir(emm, tmp_path_factory) -> Path:
    """The fixture model saved to a temp models/expert_motion dir."""
    root = tmp_path_factory.mktemp("models") / "expert_motion"
    emm.save(root)
    return root
