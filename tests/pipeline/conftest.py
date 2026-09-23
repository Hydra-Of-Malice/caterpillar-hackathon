"""Shared fixtures: config copy and a small model trained on synthetic fleet data."""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest

from ml.train_iforest import train
from sentinel.shared.config import load_yaml
from tests.pipeline.synth import fleet_frame


@pytest.fixture
def cfg() -> dict[str, Any]:
    return copy.deepcopy(load_yaml("fusion"))


@pytest.fixture(scope="session")
def fleet_parquet(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("sim") / "fleet_baseline.parquet"
    fleet_frame(45).to_parquet(path)
    return path


@pytest.fixture(scope="session")
def trained(fleet_parquet: Path, tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    """(version dir, model card, split info) for a model trained on the synthetic fleet."""
    return train(fleet_parquet, tmp_path_factory.mktemp("models") / "iforest")


@pytest.fixture(scope="session")
def model_dir(trained: tuple[Path, dict[str, Any], dict[str, Any]]) -> Path:
    return trained[0]


@pytest.fixture
def no_model_dir(tmp_path: Path) -> Path:
    return tmp_path / "no-models"
