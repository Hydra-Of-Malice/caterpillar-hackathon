"""Demo seed: idempotent, edge holds EX-07 only, every screen has SIMULATED data."""
from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from sentinel.edge_api import services
from sentinel.edge_api.settings import edge_state_path
from sentinel.seed import seed
from sentinel.store.db import Database
from sentinel.store.models import (AlertRow, BreakLogRow, ChecklistResultRow, EventRow, IncidentRow, OperatorRow,
                                   ShiftRow, TaskHistoryRow, TaskRow)
from tests.edge.conftest import sqlite_url

DAY = date(2026, 9, 23)


@pytest.fixture
def dbs(tmp_path):
    edge, cloud = Database(sqlite_url(tmp_path / "edge.db")), Database(sqlite_url(tmp_path / "cloud.db"))
    yield edge, cloud
    edge.engine.dispose()
    cloud.engine.dispose()


def test_seed_is_idempotent(dbs):
    first = seed(*dbs, reset=True, day=DAY)
    assert seed(*dbs, day=DAY) == first == seed(*dbs, day=DAY)


def test_edge_world(dbs):
    edge, cloud = dbs
    seed(edge, cloud, reset=True, day=DAY)
    with edge.session() as s:
        assert {r.machine_id for r in s.scalars(select(ShiftRow))} == {"EX-07"}
        roles = {r.role for r in s.scalars(select(OperatorRow))}
        assert {"operator", "trainee", "instructor", "supervisor"} <= roles
        today = services.shifts_on_day(s, DAY.isoformat())
        tasks = s.scalars(select(TaskRow).where(TaskRow.shift_id.in_([t.shift_id for t in today]))).all()
        assert len(tasks) >= 5                                                    # AC1.1
        t2 = s.get(TaskRow, "T-2")
        assert t2.required_module_id == "MOD-TRENCH-EDGES" and t2.first_on_site
        assert [t.task_id for t in tasks if t.shift_id == "SH-1042-S1"] == ["T-1", "T-2", "T-3"]
        current = services.current_shift(s, "EX-07")
        assert current.shift_id == "SH-1042-S1" and current.conditions["source"] == "MOCK"
        assert services.checklist_status(s, "SH-1042-S1", None)["missing"] == ["SC-01"]
        assert s.query(TaskHistoryRow).count() == 1500
        s0_alerts = {r.data["signal_word"] for r in s.scalars(select(AlertRow))}
        assert s0_alerts == {"DANGER", "WARNING", "CAUTION", "NOTICE", "SUPERVISOR NOTIFIED"}
        incidents = s.scalars(select(IncidentRow)).all()
        assert {r.data["signal_word"] for r in incidents} == {"DANGER", "WARNING", "CAUTION", "NOTICE"}
        assert {r.source for r in incidents} == {"auto", "manual"}
        idle = [r.data["context"]["reason"] for r in s.scalars(select(EventRow).where(EventRow.type == "idle_period"))]
        assert set(idle) == {"waiting_for_truck", "warmup", "unexplained"}
        assert s.query(BreakLogRow).count() == 2
        assert all(r.data["simulated"] for r in s.scalars(select(EventRow)))


def test_cloud_world_for_supervisor(dbs):
    edge, cloud = dbs
    seed(edge, cloud, reset=True, day=DAY)
    with cloud.session() as s:
        assert {r.machine_id for r in s.scalars(select(ShiftRow))} == {"EX-07", "EX-09"}
        open_esc = [r for r in s.scalars(select(AlertRow)) if r.tier == "T4" and r.state == "escalated"]
        assert len(open_esc) == 2 and {r.operator_id for r in open_esc} == {"OP-1042", "OP-1019"}
        machine = [r for r in s.scalars(select(EventRow)) if r.attribution == "machine"]
        assert {r.operator_id for r in machine} == {"OP-1019", "OP-1007"} and {r.machine_id for r in machine} == {"EX-09"}
        assert s.get(ShiftRow, "SH-1007-S1").status == "active"
        assert s.query(ChecklistResultRow).filter(ChecklistResultRow.shift_id == "SH-1007-S1").count() == 14


def test_reset_removes_edge_runtime_state(dbs):
    edge, cloud = dbs
    state = edge_state_path(edge.url)
    state.write_text("{}", encoding="utf-8")
    seed(edge, cloud, reset=True, day=DAY)
    assert not state.exists()
