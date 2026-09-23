"""Break rule (06 §7): T1 at 120 min, T3 at 150 min with one 10-min snooze, T4 at 165 min."""
from __future__ import annotations

import pytest

from sentinel.shared.schemas import AlertState, Tier
from tests.edge.conftest import T0


def raised(manager, now: float, cont_min: float) -> list[tuple[Tier, str]]:
    """Alerts newly raised by this tick (ignores T1 auto-clears and T4 display time-outs)."""
    return [(a.tier, a.what) for a in manager.tick(now, cont_min) if a.ts == now]


def test_break_timeline_with_snooze(manager):
    assert raised(manager, T0, 119.0) == []
    assert raised(manager, T0 + 60, 120.0) == [(Tier.T1, "BREAK CHECK-IN")]
    assert "2 h 0 min" in next(a for a in manager.active() if a.tier == Tier.T1).why
    assert raised(manager, T0 + 120, 121.0) == []
    assert raised(manager, T0 + 1800, 150.0) == [(Tier.T3, "BREAK RECOMMENDED")]
    t3 = next(a for a in manager.active() if a.tier == Tier.T3)
    assert t3.requires_ack and not t3.dismissible and t3.signal_word == "WARNING"
    snoozed = manager.snooze(t3.alert_id, T0 + 1810)
    assert snoozed.state == AlertState.acknowledged and not manager.is_displayed(snoozed.alert_id)
    assert raised(manager, T0 + 2300, 158.0) == []                                  # snooze still running
    assert raised(manager, T0 + 2410, 160.0) == [(Tier.T3, "BREAK RECOMMENDED")]    # 10 min later
    again = next(a for a in manager.active() if a.tier == Tier.T3)
    with pytest.raises(ValueError):
        manager.snooze(again.alert_id, T0 + 2420)                                  # only one snooze
    assert raised(manager, T0 + 2700, 165.0) == [(Tier.T4, "SUPERVISOR NOTIFIED")]
    t4 = next(a for a in manager.active() if a.tier == Tier.T4)
    assert t4.escalated_to == "SUP-01" and t4.state == AlertState.escalated
    assert raised(manager, T0 + 2710, 166.0) == []                                  # escalated once only


def test_break_clears_advisories_and_resets(manager):
    manager.tick(T0, 150.0)
    assert any(a.tier == Tier.T3 for a in manager.active())
    cleared = manager.on_break_start(T0 + 30)
    assert cleared and {a.state for a in cleared} == {AlertState.cleared}
    assert not any(a.tier in (Tier.T1, Tier.T3) for a in manager.active())
    assert raised(manager, T0 + 60, 0.0) == []                                      # on break: clock is 0
    assert raised(manager, T0 + 7200, 120.0) == [(Tier.T1, "BREAK CHECK-IN")]       # new stretch starts fresh


def test_t4_at_165_even_without_snooze(manager):
    manager.tick(T0, 150.0)
    t3 = next(a for a in manager.active() if a.tier == Tier.T3)
    manager.ack(t3.alert_id, T0 + 5)                                                # "Stopping now" but no break
    assert raised(manager, T0 + 900, 165.0) == [(Tier.T4, "SUPERVISOR NOTIFIED")]
