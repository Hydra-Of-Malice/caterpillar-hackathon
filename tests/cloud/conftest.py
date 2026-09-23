"""Shared fixtures for cloud tests: temp SQLite DB, offline copilot, TestClient."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sentinel.cloud.api.main import create_app
from sentinel.cloud.competency.demo_fixture import FIXTURE_SHIFTS, load_shift
from sentinel.cloud.competency.service import evaluate_shift
from sentinel.cloud.rag.answer import Copilot, CopilotSettings
from sentinel.cloud.rag.retriever import default_retriever
from sentinel.cloud.roles import Role
from sentinel.store.db import Database

SHIFT0 = FIXTURE_SHIFTS["shift0"].default_shift_id
SHIFT1 = FIXTURE_SHIFTS["shift1"].default_shift_id
SHIFT2 = FIXTURE_SHIFTS["shift2"].default_shift_id


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    return Database(f"sqlite:///{(tmp_path / 'cloud.db').as_posix()}")


@pytest.fixture()
def demo_db(db: Database) -> Database:
    """Shift 0 + Shift 1 fixtures loaded and Shift 1 evaluated (C04 observed_gap)."""
    with db.session() as s:
        load_shift(s, "shift0")
        load_shift(s, "shift1")
        evaluate_shift(s, "OP-1042", SHIFT1, requested_by=Role.system)
    return db


@pytest.fixture()
def offline_copilot() -> Copilot:
    return Copilot(default_retriever(), CopilotSettings.from_config(), generator=None)


@pytest.fixture()
def client(demo_db: Database, offline_copilot: Copilot) -> TestClient:
    app = create_app(demo_db, copilot=offline_copilot, seed=False)
    with TestClient(app) as c:
        yield c
