"""Shared fixtures for the edge tests (alert manager, sync, ETA, seed, FastAPI smoke)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Iterator

import pytest

from sentinel.alerts.manager import AlertManager
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import (Attribution, Event, FeatureContribution, Provenance, RiskCategory, SafetyAlertMsg,
                                     TelemetrySample, Tier)
from sentinel.store.db import Database

T0 = 1_790_000_000.0          # fixed sample-clock origin


def sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


@pytest.fixture
def db(tmp_path: Path) -> Iterator[Database]:
    database = Database(sqlite_url(tmp_path / "edge.db"))
    yield database
    database.engine.dispose()


@pytest.fixture
def policy() -> dict[str, Any]:
    load_yaml.cache_clear()
    return load_yaml("alert_policy")


@pytest.fixture
def manager(db: Database, policy: dict[str, Any]) -> AlertManager:
    am = AlertManager(db, policy)
    am.set_shift("SH-TEST", "OP-1042", "EX-07")
    return am


def make_event(etype: str = "fast_swing_near_truck", ts: float = T0, *, tier: Tier | None = None,
               category: RiskCategory = RiskCategory.dangerous_condition,
               provenance: tuple[Provenance, ...] = (Provenance.RULE, Provenance.ML, Provenance.SIMULATED),
               attribution: Attribution = Attribution.operator, **context: Any) -> Event:
    return Event(ts=ts, site_id="north-quarry", machine_id="EX-07", operator_id="OP-1042", shift_id="SH-TEST",
                 type=etype, category=category, tier=tier, provenance=list(provenance), attribution=attribution,
                 context=context,
                 explanation=[FeatureContribution(feature="swing_speed_near_truck", label="Swing rate near truck",
                                                  value=38.0, baseline_mean=24.0, baseline_std=4.0, z=3.5,
                                                  unit="°/s")])


def safety_msg(state: str = "raised", alert_id: str = "sfa_test1", ts: float = T0, tier: str = "T_CRIT",
               event_type: str = "seatbelt_unfastened_moving") -> SafetyAlertMsg:
    return SafetyAlertMsg(alert_id=alert_id, rule_id="R-SEAT-01", rule_version="rules-0.1.0", state=state, ts=ts,
                          machine_id="EX-07", operator_id="OP-1042", what="FASTEN SEATBELT — MACHINE ACTIVE",
                          why="Seatbelt open while swinging", do="Stop and fasten your seatbelt",
                          evidence={"tier": tier, "category": "immediate_critical", "attribution": "operator",
                                    "event_type": event_type, "provenance": ["RULE", "SIMULATED"]},
                          t_pub_ns=time.time_ns())


def sample(ts: float, seq: int = 0, **overrides: Any) -> TelemetrySample:
    base = {"ts": ts, "seq": seq, "site_id": "north-quarry", "machine_id": "EX-07", "operator_id": "OP-1042",
            "shift_id": "SH-TEST", "rpm": 1700.0, "park_brake": False, "swing_dps": 12.0, "joy_swing": 0.3}
    return TelemetrySample(**{**base, **overrides})
