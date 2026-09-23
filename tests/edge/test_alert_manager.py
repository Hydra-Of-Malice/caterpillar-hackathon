"""AlertManager: tiers, suppression, rate limits, T2 ack/re-raise/escalation, incidents, outbox."""
from __future__ import annotations

import time

import pytest

from sentinel.alerts.templates import MAX_WORDS, render
from sentinel.shared.schemas import (SIGNAL_WORD, AlertState, Attribution, Incident, Provenance, RiskCategory, Tier)
from sentinel.store.models import AlertRow, EventRow, IncidentRow, OutboxRow
from tests.edge.conftest import T0, make_event, safety_msg, sample


# ------------------------------------------------------------------ tier mapping
@pytest.mark.parametrize("category, expected", [
    (RiskCategory.dangerous_condition, Tier.T2), (RiskCategory.procedural, Tier.T1),
    (RiskCategory.emerging_degradation, Tier.T1), (RiskCategory.unusual_harmless, Tier.T0)])
def test_tier_from_category(manager, category, expected):
    alerts = manager.on_event(make_event("anomaly_x", category=category), moving=False)
    assert alerts[0].tier == expected
    assert alerts[0].signal_word == SIGNAL_WORD[expected]


def test_normal_event_is_recorded_without_alert(manager, db):
    assert manager.on_event(make_event("idle_period", category=RiskCategory.normal), moving=False) == []
    with db.session() as s:
        assert s.query(EventRow).count() == 1 and s.query(AlertRow).count() == 0


def test_ml_evidence_never_becomes_tcrit(manager):
    ev = make_event("weird", tier=Tier.T_CRIT, provenance=(Provenance.ML, Provenance.SIMULATED))
    assert manager.on_event(ev, moving=True)[0].tier == Tier.T2


def test_machine_attribution_routes_to_maintenance_advisory(manager):
    ev = make_event("hyd_pressure_anomaly", tier=Tier.T2, attribution=Attribution.machine)
    alert = manager.on_event(ev, moving=False)[0]
    assert alert.tier == Tier.T1 and alert.what == "MACHINE CHECK NEEDED"


def test_every_template_renders_within_12_words(policy):
    ctx = {"type_label": "SOME EVENT TYPE", "top_label": "Swing rate near truck", "top_value": 38.0,
           "top_baseline": 24.0, "top_unit": "°/s", "idle_min": 9.0, "cont_h": 2, "cont_m": 30, "count": 3}
    for key, tpl in policy["templates"].items():
        text = render(tpl, ctx)
        for field in ("what", "why", "do"):
            assert text[field], (key, field)
            assert len(text[field].split()) <= MAX_WORDS, (key, field, text[field])


def test_alert_text_uses_explanation(manager):
    alert = manager.on_event(make_event(tier=Tier.T2), moving=True)[0]
    assert alert.what == "FAST SWING NEAR TRUCK" and "38°/s" in alert.why
    assert alert.explanation and alert.explanation[0].feature == "swing_speed_near_truck"


# ------------------------------------------------------------------ T-CRIT mirror
def test_tcrit_from_safety_is_not_dismissible_and_clears_on_cleared(manager):
    alert = manager.on_safety_alert(safety_msg("raised"))
    assert alert.tier == Tier.T_CRIT and alert.signal_word == "DANGER"
    assert not alert.dismissible and alert.state == AlertState.raised
    assert manager.on_safety_alert(safety_msg("raised")) is None            # QoS 1 redelivery
    acked = manager.ack(alert.alert_id, T0 + 1)
    assert acked.acked_at == T0 + 1 and manager.is_displayed(alert.alert_id)  # still shown until the condition clears
    cleared = manager.on_safety_alert(safety_msg("cleared", ts=T0 + 4))
    assert cleared.state == AlertState.cleared and cleared.cleared_at == T0 + 4
    assert not manager.is_displayed(alert.alert_id)


def test_tcrit_never_suppressed_even_when_waiting(manager):
    manager.set_waiting_for_truck(True)
    alert = manager.on_safety_alert(safety_msg())
    assert alert.state == AlertState.raised and alert.suppressed_reason is None


def test_tcrit_preempts_banner_with_queue_count(manager):
    manager.on_event(make_event("excessive_idle", category=RiskCategory.procedural), moving=False)
    manager.on_safety_alert(safety_msg())
    banner = manager.banner()
    assert banner["alert"]["tier"] == "T_CRIT" and banner["queued"] == 1


def test_second_tcrit_of_type_escalates_to_t4(manager):
    manager.on_safety_alert(safety_msg("raised", "sfa_a"))
    manager.on_safety_alert(safety_msg("cleared", "sfa_a", ts=T0 + 5))
    manager.on_safety_alert(safety_msg("raised", "sfa_b", ts=T0 + 60))
    t4 = [a for a in manager.active() if a.tier == Tier.T4]
    assert t4 and t4[0].signal_word == "SUPERVISOR NOTIFIED" and t4[0].escalated_to == "SUP-01"


def test_reconcile_clears_mirror_missing_from_heartbeats(manager):
    alert = manager.on_safety_alert(safety_msg())
    for _ in range(2):
        assert manager.reconcile_safety([], T0 + 1) == []
    assert manager.reconcile_safety([], T0 + 3)[0].alert_id == alert.alert_id


# ------------------------------------------------------------------ T0 / suppression
def test_t0_is_never_shown_in_cab(manager):
    alert = manager.on_event(make_event("harsh_reversal", category=RiskCategory.unusual_harmless), moving=True)[0]
    assert alert.state == AlertState.queued_post_shift and not manager.is_displayed(alert.alert_id)
    assert manager.banner()["alert"] is None


def test_idle_suppressed_with_reason_when_waiting(manager, db):
    manager.set_waiting_for_truck(True)
    alert = manager.on_event(make_event("excessive_idle", category=RiskCategory.procedural), moving=False)[0]
    assert alert.state == AlertState.suppressed and alert.suppressed_reason == "waiting_for_truck"
    manager.set_waiting_for_truck(False)
    raised = manager.on_event(make_event("excessive_idle", ts=T0 + 700, category=RiskCategory.procedural),
                              moving=False)[0]
    assert raised.state == AlertState.raised
    with db.session() as s:                                                   # suppressed-with-reason is logged
        assert s.get(AlertRow, alert.alert_id).data["suppressed_reason"] == "waiting_for_truck"


def test_idle_suppressed_by_event_context(manager):
    ev = make_event("excessive_idle", category=RiskCategory.procedural, waiting_for_truck=True)
    assert manager.on_event(ev, moving=False)[0].state == AlertState.suppressed


# ------------------------------------------------------------------ T1 rate limit / auto-clear / promotion
def test_t1_rate_limited_one_per_10_min_per_type(manager):
    ev = lambda t, typ="excessive_idle": make_event(typ, ts=t, category=RiskCategory.procedural)  # noqa: E731
    assert manager.on_event(ev(T0), moving=False)[0].state == AlertState.raised
    second = manager.on_event(ev(T0 + 300), moving=False)[0]
    assert second.state == AlertState.suppressed and second.suppressed_reason == "rate_limited"
    assert manager.on_event(ev(T0 + 320, "approach_speed_near_truck"), moving=False)[0].state == AlertState.raised
    assert manager.on_event(ev(T0 + 601), moving=False)[0].state == AlertState.raised


def test_t1_hourly_budget(manager):
    for i in range(6):
        assert manager.on_event(make_event(f"type_{i}", ts=T0 + i, category=RiskCategory.procedural),
                                moving=False)[0].state == AlertState.raised
    seventh = manager.on_event(make_event("type_7", ts=T0 + 10, category=RiskCategory.procedural), moving=False)[0]
    assert seventh.suppressed_reason == "hourly_budget"


def test_t1_auto_clears(manager):
    alert = manager.on_event(make_event("excessive_idle", category=RiskCategory.procedural), moving=False)[0]
    assert manager.tick(T0 + 5, 0) == []
    cleared = manager.tick(T0 + 8, 0)
    assert cleared[0].alert_id == alert.alert_id and cleared[0].state == AlertState.cleared


def test_three_t1_in_30_min_promote_to_t2(manager):
    ev = lambda t: make_event("approach_speed_near_truck", ts=t, category=RiskCategory.procedural)  # noqa: E731
    manager.on_event(ev(T0), moving=True)
    manager.on_event(ev(T0 + 5), moving=True)                                  # same episode (< 20 s): not counted
    manager.on_event(ev(T0 + 700), moving=True)
    promoted = manager.on_event(ev(T0 + 1400), moving=True)[0]
    assert promoted.tier == Tier.T2 and promoted.requires_ack


# ------------------------------------------------------------------ T2 ack / re-raise / escalation
def test_t2_ack(manager):
    alert = manager.on_event(make_event(tier=Tier.T2), moving=True)[0]
    assert alert.requires_ack
    acked = manager.ack(alert.alert_id, T0 + 3)
    assert acked.state == AlertState.acknowledged and not manager.is_displayed(alert.alert_id)
    assert manager.tick(T0 + 200, 0) == []                                     # acked: no re-raise, no escalation


def test_t2_unacked_reraised_once_then_escalated(manager):
    pushes = []
    manager.subscribe(pushes.append)
    alert = manager.on_event(make_event(tier=Tier.T2), moving=True)[0]
    assert manager.tick(T0 + 59, 0) == []
    assert [a.alert_id for a in manager.tick(T0 + 60, 0)] == [alert.alert_id]    # re-annunciated once
    assert manager.tick(T0 + 100, 0) == []
    changed = manager.tick(T0 + 120, 0)
    t4 = [a for a in changed if a.tier == Tier.T4]
    assert len(t4) == 1 and t4[0].what == "SUPERVISOR NOTIFIED" and t4[0].state == AlertState.escalated
    later = manager.tick(T0 + 400, 0)                                          # T4 leaves the cab display only
    assert [(a.tier, a.state) for a in later] == [(Tier.T4, AlertState.escalated)]
    assert sum(1 for p in pushes if p.alert_id == alert.alert_id) >= 2


def test_t2_duplicate_is_deduplicated(manager):
    manager.on_event(make_event(tier=Tier.T2), moving=True)
    assert manager.on_event(make_event(tier=Tier.T2, ts=T0 + 30), moving=True) == []


def test_third_t2_of_type_in_shift_escalates(manager):
    for i in range(3):
        alerts = manager.on_event(make_event(tier=Tier.T2, ts=T0 + i * 400), moving=True)
        manager.ack(alerts[0].alert_id, T0 + i * 400 + 2)
    assert [a.tier for a in alerts] == [Tier.T2, Tier.T4]
    assert alerts[1].signal_word == "SUPERVISOR NOTIFIED" and "3 times" in alerts[1].why


# ------------------------------------------------------------------ incidents + persistence + outbox
def test_tcrit_and_t2_create_incident_within_1s_with_snapshot(manager, db):
    for i in range(100):                                                        # 10 s of 10 Hz history
        manager.record_sample(sample(T0 - 10 + i * 0.1, seq=i))
    started = time.perf_counter()
    alert = manager.on_safety_alert(safety_msg(ts=T0))
    elapsed = time.perf_counter() - started
    assert elapsed < 1.0
    with db.session() as s:
        rows = s.query(IncidentRow).all()
        assert len(rows) == 1
        inc = Incident.model_validate(rows[0].data)
    assert inc.signal_word == "DANGER" and inc.severity == "high" and inc.context["alert_id"] == alert.alert_id
    assert inc.snapshot and min(r["ts"] for r in inc.snapshot) >= T0 - 10 and not inc.context["snapshot_complete"]
    for i in range(101):                                                        # +10 s after the event
        manager.record_sample(sample(T0 + i * 0.1, seq=200 + i))
    with db.session() as s:
        inc = Incident.model_validate(s.query(IncidentRow).one().data)
    assert inc.context["snapshot_complete"] and max(r["ts"] for r in inc.snapshot) >= T0 + 9.9
    assert all("gt" not in r for r in inc.snapshot)
    t2 = manager.on_event(make_event(tier=Tier.T2, ts=T0 + 30), moving=True)[0]
    with db.session() as s:
        signal_words = {Incident.model_validate(r.data).signal_word for r in s.query(IncidentRow)}
    assert t2.tier == Tier.T2 and signal_words == {"DANGER", "WARNING"}


def test_persistence_and_outbox_priorities(manager, db):
    manager.on_safety_alert(safety_msg())
    manager.on_event(make_event("excessive_idle", ts=T0 + 1, category=RiskCategory.procedural), moving=False)
    with db.session() as s:
        rows = s.query(OutboxRow).all()
    kinds = {(r.kind, r.priority) for r in rows}
    assert ("incident", 0) in kinds and ("alert", 0) in kinds and ("event", 0) in kinds   # T-CRIT → priority 0
    assert ("alert", 1) in kinds


def test_restart_restores_raised_alerts(db, policy, manager):
    from sentinel.alerts.manager import AlertManager
    alert = manager.on_safety_alert(safety_msg())
    restored = AlertManager(db, policy)
    assert restored.is_displayed(alert.alert_id)
    assert restored.on_safety_alert(safety_msg("cleared", ts=T0 + 9)).state == AlertState.cleared
