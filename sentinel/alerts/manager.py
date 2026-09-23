"""AlertManager — the single owner of in-cab advisory state (07 §1, §3; 03 §3).

Responsibilities:
* Tier mapping from Event.tier / Event.category (policy), signal words, what/why/do templates.
* T-CRIT is mirrored from the independent safety process (SafetyAlertMsg): never suppressed,
  never dismissible, latched until the safety process sends "cleared".
* T0 is never shown in-cab: it is queued for the post-shift report.
* T1: 1 per 10 min per type, hourly budget, auto-clear; 3 in 30 min → one T2 (ESC-1).
* T2: ack required; re-raised once after 60 s; T4 if still unacknowledged; 3rd in a shift → T4.
* Break rule: T1 at 120 min continuous operation, T3 at 150 min (one 10 min snooze), T4 at 165 min.
* Idle advisories are suppressed with a reason while the operator reports waiting for a truck.
* Every T-CRIT / T2 opens an incident synchronously with a ±10 s snapshot (the post-event half is
  filled in from the ring buffer once the sample clock passes event + 10 s).
* Events, alerts and incidents are written to the edge DB with their outbox rows in one transaction.

All timers run on the sample clock (``ts`` arguments), never on the wall clock.
"""
from __future__ import annotations

import logging
import threading
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable

from sentinel.alerts.ring import SampleRing
from sentinel.alerts.templates import clip_words, event_context, render
from sentinel.shared import config
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import (Alert, AlertState, Attribution, Event, Incident, Provenance, RiskCategory,
                                     SafetyAlertMsg, TelemetrySample, Tier)
from sentinel.store.db import Database
from sentinel.store.models import AlertRow, EventRow, IncidentRow
from sentinel.sync import outbox

log = logging.getLogger("sentinel.alerts")

AlertCallback = Callable[[Alert], None]
SEVERITY_ORDER = [Tier.T0, Tier.T1, Tier.T2, Tier.T3, Tier.T_CRIT]
DISPLAY_STATES = (AlertState.raised, AlertState.escalated)
SAFETY_SOURCES = ("safety", "restored")
RECONCILE_MISSES = 3            # heartbeats without the id before a mirrored alert is cleared


@dataclass
class _Active:
    alert: Alert
    etype: str
    source: str                   # safety | pipeline | break | escalation | restored
    last_raise_ts: float
    reraised: int = 0
    escalated: bool = False
    missing_beats: int = 0


@dataclass
class _BreakState:
    advisory_raised: bool = False
    t3_raised: bool = False
    snoozes: int = 0
    snoozed_until: float | None = None
    escalated: bool = False


@dataclass
class _ShiftCounters:
    t1_last: dict[str, float] = field(default_factory=dict)
    t1_shown: list[float] = field(default_factory=list)
    t1_occurrences: dict[str, list[float]] = field(default_factory=dict)
    t2_count: Counter = field(default_factory=Counter)
    t2_escalated: set[str] = field(default_factory=set)
    tcrit_count: Counter = field(default_factory=Counter)
    tcrit_escalated: set[str] = field(default_factory=set)


@dataclass
class _PendingSnapshot:
    incident_id: str
    event_ts: float
    due_ts: float


def _cap(tier: Tier, cap: Tier) -> Tier:
    if tier in SEVERITY_ORDER and SEVERITY_ORDER.index(tier) > SEVERITY_ORDER.index(cap):
        return cap
    return tier


class AlertManager:
    """Tiering, suppression, timers and persistence for alerts; see the module docstring."""

    def __init__(self, db: Database, policy: dict | None = None) -> None:
        self._db = db
        self.policy = policy or load_yaml("alert_policy")
        self.version: str = self.policy["version"]
        self._tiers: dict[str, dict[str, Any]] = self.policy["tiers"]
        self._lock = threading.RLock()
        self._subs: list[AlertCallback] = []
        self.ring = SampleRing(self.policy["incident"]["ring_buffer_s"])
        self._active: dict[str, _Active] = {}
        self._pending_snapshots: list[_PendingSnapshot] = []
        self._counters = _ShiftCounters()
        self._break = _BreakState()
        self._waiting_for_truck = False
        self.shift_id: str | None = None
        self.operator_id = "unknown"
        self.machine_id = config.MACHINE_ID
        self.site_id = config.SITE_ID
        self._restore_active()

    # ------------------------------------------------------------------ context
    def subscribe(self, cb: AlertCallback) -> None:
        """Register a callback for every alert raised, updated or cleared (WS push)."""
        self._subs.append(cb)

    def set_shift(self, shift_id: str | None, operator_id: str | None = None, machine_id: str | None = None) -> None:
        """Bind the current shift; per-shift recurrence counters reset when the shift changes."""
        with self._lock:
            if shift_id != self.shift_id:
                self._counters = _ShiftCounters()
                self._break = _BreakState()
            self.shift_id = shift_id
            self.operator_id = operator_id or self.operator_id
            self.machine_id = machine_id or self.machine_id

    def set_waiting_for_truck(self, waiting: bool) -> None:
        self._waiting_for_truck = waiting

    def record_sample(self, sample: TelemetrySample | dict[str, Any]) -> None:
        """Append to the ring buffer and complete any incident snapshot whose +10 s window has passed."""
        row = self.ring.add(sample)
        if self._pending_snapshots and row["ts"] >= min(p.due_ts for p in self._pending_snapshots):
            with self._lock:
                self._fill_snapshots(row["ts"])

    # ------------------------------------------------------------------ inputs
    def on_event(self, event: Event, moving: bool) -> list[Alert]:
        """Finalise the tier of a pipeline event and raise / suppress / queue its alert."""
        with self._lock:
            tier, template_key = self._resolve(event)
            if tier is None:
                self._persist(event=event)
                return []
            ctx = event_context(event, moving=moving)
            if tier == Tier.T1 and self._t1_promotes(event.type, event.ts):
                tier = Tier.T2
            if tier == Tier.T_CRIT and self._find_active(event.type, Tier.T_CRIT):
                self._persist(event=event)                   # latched: one announcement per condition
                return []
            if tier == Tier.T2 and self._t2_duplicate(event.type, event.ts):
                self._persist(event=event)                   # DED-1
                return []
            alert = self._build_alert(event, tier, template_key, ctx)
            state, reason = self._gate(event, tier, moving)
            if state is not AlertState.raised:
                alert.state, alert.suppressed_reason = state, reason
                self._persist(event=event, alert=alert)
                self._notify(alert)
                return [alert]
            return self._raise(alert, event, event.type, source="pipeline")

    def on_safety_alert(self, msg: SafetyAlertMsg) -> Alert | None:
        """Mirror a safety-process transition. Returns the raised/cleared alert, or None if a duplicate."""
        with self._lock:
            if msg.state == "raised":
                if msg.alert_id in self._active or self._load_alert(msg.alert_id) is not None:
                    return None                              # QoS 1 redelivery
                event, alert = self._from_safety(msg)
                self._raise(alert, event, event.type, source="safety")
                return alert
            act = self._active.pop(msg.alert_id, None)
            alert = act.alert if act else self._load_alert(msg.alert_id)
            if alert is None or alert.state == AlertState.cleared:
                return None
            alert.state, alert.cleared_at = AlertState.cleared, msg.ts
            self._persist(alert=alert)
            self._notify(alert)
            return alert

    def reconcile_safety(self, active_ids: list[str], ts: float) -> list[Alert]:
        """Clear mirrored alerts the safety process no longer holds (lost "cleared", edge restart)."""
        cleared = []
        with self._lock:
            for alert_id, act in list(self._active.items()):
                if act.source not in SAFETY_SOURCES or act.alert.tier not in (Tier.T_CRIT, Tier.T2):
                    continue
                if alert_id in active_ids:
                    act.missing_beats = 0
                    continue
                act.missing_beats += 1
                if act.missing_beats >= RECONCILE_MISSES:
                    del self._active[alert_id]
                    act.alert.state, act.alert.cleared_at = AlertState.cleared, ts
                    self._persist(alert=act.alert)
                    self._notify(act.alert)
                    cleared.append(act.alert)
        return cleared

    def ack(self, alert_id: str, ts: float) -> Alert:
        """Operator acknowledgement. T-CRIT records the ack but stays up until its condition clears."""
        with self._lock:
            act = self._active.get(alert_id)
            alert = act.alert if act else self._load_alert(alert_id)
            if alert is None:
                raise KeyError(alert_id)
            if alert.tier == Tier.T_CRIT:
                alert.acked_at = alert.acked_at or ts
            elif act is not None:
                del self._active[alert_id]
                if alert.state == AlertState.raised:
                    alert.state, alert.acked_at = AlertState.acknowledged, ts
            self._persist(alert=alert)
            self._notify(alert)
            return alert

    def snooze(self, alert_id: str, ts: float) -> Alert:
        """"Remind me in 10 min" on a break recommendation — allowed once per operating stretch."""
        cfg = self.policy["break"]
        with self._lock:
            act = self._active.get(alert_id)
            if act is None or act.etype != "break_recommended":
                raise ValueError("only an active break recommendation can be snoozed")
            if self._break.snoozes >= cfg["snooze_max"]:
                raise ValueError("the break reminder was already snoozed once")
            self._break.snoozes += 1
            self._break.snoozed_until = ts + cfg["snooze_min"] * 60
            del self._active[alert_id]
            act.alert.state, act.alert.acked_at = AlertState.acknowledged, ts
            self._persist(alert=act.alert)
            self._notify(act.alert)
            return act.alert

    def on_break_start(self, ts: float) -> list[Alert]:
        """A break was started: take the break advisories off the display."""
        cleared = []
        with self._lock:
            for alert_id, act in list(self._active.items()):
                if act.etype in ("break_checkin", "break_recommended"):
                    del self._active[alert_id]
                    act.alert.state, act.alert.cleared_at = AlertState.cleared, ts
                    self._persist(alert=act.alert)
                    self._notify(act.alert)
                    cleared.append(act.alert)
        return cleared

    def tick(self, now_ts: float, continuous_operation_min: float) -> list[Alert]:
        """Advance timers: T1 auto-clear, T4 display, T2 re-raise/escalation, break rule (T1/T3/T4)."""
        with self._lock:
            changed = self._tick_timers(now_ts)
            changed += self._tick_break(now_ts, continuous_operation_min)
            self._fill_snapshots(now_ts)
            return changed

    # ------------------------------------------------------------------ queries
    def active(self) -> list[Alert]:
        """Alerts currently on the in-cab display, highest priority first."""
        order = [Tier(t) for t in self.policy["banner_priority"]]
        with self._lock:
            acts = sorted(self._active.values(),
                          key=lambda a: (order.index(a.alert.tier) if a.alert.tier in order else 99, -a.last_raise_ts))
            return [a.alert.model_copy() for a in acts]

    def banner(self) -> dict[str, Any]:
        """The single alert slot plus the queued count (07 §5.1)."""
        active = self.active()
        return {"alert": active[0].model_dump(mode="json") if active else None, "queued": max(0, len(active) - 1)}

    def is_displayed(self, alert_id: str) -> bool:
        return alert_id in self._active

    def log_incident(self, incident: Incident) -> Incident:
        """Persist a manual / checklist incident (+ outbox, priority 0)."""
        with self._lock:
            self._persist(incident=incident)
        return incident

    def record_event(self, event: Event) -> Event:
        with self._lock:
            self._persist(event=event)
        return event

    # ------------------------------------------------------------------ tiering and gating
    def _resolve(self, event: Event) -> tuple[Tier | None, str]:
        proposed = event.tier.value if event.tier else self.policy["tier_by_category"].get(event.category.value)
        if proposed is None:
            return None, ""
        tier = Tier(proposed)
        templates = self.policy["templates"]
        key = event.type if event.type in templates else ("anomaly" if Provenance.ML in event.provenance else "default")
        if Provenance.ML in event.provenance:
            tier = _cap(tier, Tier(self.policy["ml_max_tier"]))
        if event.attribution == Attribution.machine:
            tier = _cap(tier, Tier(self.policy["machine_attribution_max_tier"]))
            key = event.type if event.type in templates else self.policy["machine_template"]
        return tier, key

    def _gate(self, event: Event, tier: Tier, moving: bool) -> tuple[AlertState, str | None]:
        """Decide raised / suppressed / queued. T-CRIT is never gated (SUP-4)."""
        if tier == Tier.T_CRIT:
            return AlertState.raised, None
        if tier == Tier.T0:
            return AlertState.queued_post_shift, "coaching_post_shift_while_moving" if moving else "coaching_post_shift"
        waiting = bool(event.context.get("waiting_for_truck")) or self._waiting_for_truck
        if waiting and event.type in self.policy["suppression"]["waiting_for_truck_types"]:
            return AlertState.suppressed, "waiting_for_truck"
        if event.context.get("suppressed_reason"):
            return AlertState.suppressed, str(event.context["suppressed_reason"])
        if tier == Tier.T1:
            cfg = self._tiers["T1"]
            last = self._counters.t1_last.get(event.type)
            if last is not None and event.ts - last < cfg["rate_limit_window_s"]:
                return AlertState.suppressed, "rate_limited"
            recent = [t for t in self._counters.t1_shown if event.ts - t < 3600]
            if len(recent) >= cfg["max_per_hour"]:
                return AlertState.suppressed, "hourly_budget"
        return AlertState.raised, None

    def _t1_promotes(self, etype: str, ts: float) -> bool:
        """ESC-1: record a T1 occurrence; True when it is the Nth in the window (then reset)."""
        cfg = self._tiers["T1"]
        occ = [t for t in self._counters.t1_occurrences.get(etype, []) if ts - t < cfg["promote_window_s"]]
        if not occ or ts - occ[-1] >= cfg["promote_min_gap_s"]:
            occ.append(ts)
        self._counters.t1_occurrences[etype] = occ
        if len(occ) >= cfg["promote_count"]:
            self._counters.t1_occurrences[etype] = []
            return True
        return False

    def _t2_duplicate(self, etype: str, ts: float) -> bool:
        act = self._find_active(etype, Tier.T2)
        return bool(act and act.alert.state == AlertState.raised
                    and ts - act.alert.ts < self._tiers["T2"]["dedupe_window_s"])

    def _find_active(self, etype: str, tier: Tier) -> _Active | None:
        return next((a for a in self._active.values() if a.etype == etype and a.alert.tier == tier), None)

    # ------------------------------------------------------------------ raising
    def _build_alert(self, event: Event, tier: Tier, template_key: str, ctx: dict[str, Any],
                     alert_id: str | None = None) -> Alert:
        cfg = self._tiers[tier.value]
        text = render(self.policy["templates"][template_key], ctx)
        kwargs = {"alert_id": alert_id} if alert_id else {}
        return Alert(**kwargs, event_id=event.event_id, ts=event.ts, machine_id=event.machine_id,
                     operator_id=event.operator_id, tier=tier, signal_word=self.policy["signal_words"][tier.value],
                     what=text["what"], why=text["why"], do=text["do"], provenance=event.provenance,
                     requires_ack=bool(cfg.get("requires_ack")), dismissible=bool(cfg.get("dismissible", True)),
                     explanation=event.explanation[:3], simulated=event.simulated)

    def _raise(self, alert: Alert, event: Event, etype: str, source: str) -> list[Alert]:
        """Show an alert: register it, persist event+alert(+incident), push, then apply escalations."""
        alert.state = AlertState.escalated if alert.tier == Tier.T4 else AlertState.raised
        self._active[alert.alert_id] = _Active(alert, etype, source, last_raise_ts=alert.ts)
        incident = self._open_incident(alert, event) if self._tiers[alert.tier.value].get("incident") else None
        self._persist(event=event, alert=alert, incident=incident)
        self._notify(alert)
        out = [alert]
        if alert.tier == Tier.T1:
            self._counters.t1_last[etype] = alert.ts
            self._counters.t1_shown.append(alert.ts)
        elif alert.tier == Tier.T2:
            out += self._count_recurrence(self._counters.t2_count, self._counters.t2_escalated, etype, alert,
                                          self._tiers["T2"]["recurrence_escalate_count"], "escalation_recurrence")
        elif alert.tier == Tier.T_CRIT:
            out += self._count_recurrence(self._counters.tcrit_count, self._counters.tcrit_escalated, etype, alert,
                                          self._tiers["T_CRIT"]["repeat_escalate_count"], "escalation_tcrit_repeat")
        return out

    def _count_recurrence(self, counts: Counter, escalated: set[str], etype: str, alert: Alert,
                          threshold: int, template: str) -> list[Alert]:
        counts[etype] += 1
        if counts[etype] < threshold or etype in escalated:
            return []
        escalated.add(etype)
        alert.escalated_to = self._tiers["T4"]["escalate_to"]
        self._persist(alert=alert)
        return [self._escalate(template, {"count": counts[etype]}, alert.ts, source_alert=alert)]

    def _internal_event(self, etype: str, tier: Tier, ts: float, ctx: dict[str, Any],
                        category: RiskCategory = RiskCategory.procedural) -> Event:
        return Event(ts=ts, site_id=self.site_id, machine_id=self.machine_id, operator_id=self.operator_id,
                     shift_id=self.shift_id, type=etype, category=category, tier=tier,
                     provenance=[Provenance.RULE], rule_id=f"ALERT-POLICY/{etype}", rule_version=self.version,
                     context=ctx, simulated=True)

    def _raise_internal(self, etype: str, tier: Tier, ts: float, ctx: dict[str, Any]) -> list[Alert]:
        event = self._internal_event(etype, tier, ts, ctx, RiskCategory.emerging_degradation)
        return self._raise(self._build_alert(event, tier, etype, ctx), event, etype, source="break")

    def _escalate(self, template: str, ctx: dict[str, Any], ts: float, source_alert: Alert | None = None) -> Alert:
        """T4 supervisor escalation. The operator always sees "SUPERVISOR NOTIFIED" (07 T4)."""
        if source_alert is not None:
            ctx = {**ctx, "source_alert_id": source_alert.alert_id, "source_what": source_alert.what}
        event = self._internal_event(template, Tier.T4, ts, ctx)
        alert = self._build_alert(event, Tier.T4, template, ctx)
        alert.escalated_to = self._tiers["T4"]["escalate_to"]
        self._raise(alert, event, template, source="escalation")
        log.warning("T4 escalation to %s: %s", alert.escalated_to, alert.why)
        return alert

    def _from_safety(self, msg: SafetyAlertMsg) -> tuple[Event, Alert]:
        ev = msg.evidence
        tier = Tier(ev["tier"]) if ev.get("tier") in Tier.__members__ else Tier.T_CRIT
        provenance = [Provenance(p) for p in ev.get("provenance", []) if p in Provenance.__members__] \
            or [Provenance.RULE]
        category = ev.get("category") if ev.get("category") in RiskCategory.__members__ else "immediate_critical"
        attribution = ev.get("attribution") if ev.get("attribution") in Attribution.__members__ else "unknown"
        event = Event(ts=msg.ts, site_id=self.site_id, machine_id=msg.machine_id, operator_id=msg.operator_id,
                      shift_id=self.shift_id, type=str(ev.get("event_type") or msg.rule_id), category=category,
                      tier=tier, provenance=provenance, rule_id=msg.rule_id, rule_version=msg.rule_version,
                      attribution=attribution, context={"zone": ev.get("zone"), "safety_alert_id": msg.alert_id},
                      evidence={**ev, "t_pub_ns": msg.t_pub_ns, "sample_t_pub_ns": msg.sample_t_pub_ns},
                      simulated=Provenance.SIMULATED in provenance)
        cfg = self._tiers[tier.value]
        alert = Alert(alert_id=msg.alert_id, event_id=event.event_id, ts=msg.ts, machine_id=msg.machine_id,
                      operator_id=msg.operator_id, tier=tier, signal_word=self.policy["signal_words"][tier.value],
                      what=clip_words(msg.what), why=clip_words(msg.why), do=clip_words(msg.do),
                      provenance=provenance, requires_ack=bool(cfg.get("requires_ack")),
                      dismissible=bool(cfg.get("dismissible", True)), simulated=event.simulated)
        return event, alert

    # ------------------------------------------------------------------ timers
    def _tick_timers(self, now: float) -> list[Alert]:
        t1, t2, t4 = self._tiers["T1"], self._tiers["T2"], self._tiers["T4"]
        changed: list[Alert] = []
        for alert_id, act in list(self._active.items()):
            a = act.alert
            if a.tier == Tier.T1 and now - act.last_raise_ts >= t1["auto_clear_s"]:
                del self._active[alert_id]
                a.state, a.cleared_at = AlertState.cleared, now
                self._persist(alert=a)
                self._notify(a)
                changed.append(a)
            elif a.tier == Tier.T4 and now - a.ts >= t4["display_s"]:
                del self._active[alert_id]                   # off the cab display; stays escalated for the supervisor
                self._notify(a)
                changed.append(a)
            elif a.tier == Tier.T2 and a.state == AlertState.raised:
                since = now - act.last_raise_ts
                if act.reraised < t2["reraise_max"] and since >= t2["ack_timeout_s"]:
                    act.reraised += 1
                    act.last_raise_ts = now
                    self._notify(a)                          # re-annunciate once
                    changed.append(a)
                elif act.reraised >= t2["reraise_max"] and not act.escalated and since >= t2["escalate_after_reraise_s"]:
                    act.escalated = True
                    a.escalated_to = t4["escalate_to"]
                    self._persist(alert=a)
                    changed += [a, self._escalate("escalation_t2_unacknowledged", {}, now, source_alert=a)]
        return changed

    def _tick_break(self, now: float, cont_min: float) -> list[Alert]:
        cfg, st = self.policy["break"], self._break
        if cont_min < cfg["advisory_min"]:
            if st.advisory_raised:
                self._break = _BreakState()                  # a qualifying break reset the clock
            return []
        ctx = {"cont_h": int(cont_min // 60), "cont_m": int(cont_min % 60), "continuous_operation_min": cont_min}
        out: list[Alert] = []
        if not st.advisory_raised:
            st.advisory_raised = True
            out += self._raise_internal("break_checkin", Tier.T1, now, ctx)
        if cont_min >= cfg["recommend_min"]:
            if not st.t3_raised:
                st.t3_raised = True
                out += self._raise_internal("break_recommended", Tier.T3, now, ctx)
            elif st.snoozed_until is not None and now >= st.snoozed_until:
                st.snoozed_until = None
                out += self._raise_internal("break_recommended", Tier.T3, now, ctx)
        if cont_min >= cfg["escalate_min"] and not st.escalated:
            st.escalated = True
            out.append(self._escalate("escalation_break_not_taken", ctx, now))
        return out

    # ------------------------------------------------------------------ incidents
    def _open_incident(self, alert: Alert, event: Event) -> Incident:
        cfg = self.policy["incident"]
        context = {**event.context, "alert_id": alert.alert_id, "tier": alert.tier.value, "what": alert.what,
                   "why": alert.why, "do": alert.do, "rule_id": event.rule_id, "rule_version": event.rule_version,
                   "model_version": event.model_version, "policy_version": self.version,
                   "attribution": event.attribution.value, "task_id": event.task_id,
                   "explanation": [c.model_dump(mode="json") for c in event.explanation[:3]],
                   "snapshot_window_s": [-cfg["snapshot_pre_s"], cfg["snapshot_post_s"]], "snapshot_complete": False}
        incident = Incident(ts=event.ts, site_id=event.site_id, machine_id=event.machine_id,
                            operator_id=event.operator_id, shift_id=event.shift_id or self.shift_id, source="auto",
                            type=event.type, severity=self._tiers[alert.tier.value].get("severity", "medium"),
                            signal_word=alert.signal_word, event_ids=[event.event_id], context=context,
                            snapshot=self.ring.window(event.ts - cfg["snapshot_pre_s"], event.ts + cfg["snapshot_post_s"]),
                            simulated=event.simulated)
        self._pending_snapshots.append(_PendingSnapshot(incident.incident_id, event.ts,
                                                        event.ts + cfg["snapshot_post_s"]))
        return incident

    def _fill_snapshots(self, now: float) -> None:
        """Append the post-event samples to incidents whose +10 s window has elapsed."""
        post = self.policy["incident"]["snapshot_post_s"]
        due = [p for p in self._pending_snapshots if now >= p.due_ts]
        if not due:
            return
        self._pending_snapshots = [p for p in self._pending_snapshots if now < p.due_ts]
        for p in due:
            with self._db.session() as s:
                row = s.get(IncidentRow, p.incident_id)
                if row is None:
                    continue
                inc = Incident.model_validate(row.data)
            last = inc.snapshot[-1]["ts"] if inc.snapshot else p.event_ts - 1e9
            inc.snapshot += [r for r in self.ring.window(last + 1e-9, p.event_ts + post)]
            inc.context["snapshot_complete"] = True
            self._persist(incident=inc)

    # ------------------------------------------------------------------ persistence
    def _persist(self, *, event: Event | None = None, alert: Alert | None = None,
                 incident: Incident | None = None) -> None:
        prio = self.policy["outbox_priority"]
        with self._db.session() as s:
            if event is not None:
                data = event.model_dump(mode="json")
                s.merge(EventRow(event_id=event.event_id, ts=event.ts, operator_id=event.operator_id,
                                 machine_id=event.machine_id, shift_id=event.shift_id, type=event.type,
                                 category=event.category.value, tier=event.tier.value if event.tier else None,
                                 attribution=event.attribution.value, data=data))
                outbox.enqueue(s, "event", data, prio["T_CRIT"] if event.tier == Tier.T_CRIT else prio["event"])
            if alert is not None:
                data = alert.model_dump(mode="json")
                s.merge(AlertRow(alert_id=alert.alert_id, event_id=alert.event_id, ts=alert.ts,
                                 operator_id=alert.operator_id, machine_id=alert.machine_id,
                                 tier=alert.tier.value, state=alert.state.value, data=data))
                outbox.enqueue(s, "alert", data, prio[alert.tier.value])
            if incident is not None:
                data = incident.model_dump(mode="json")
                s.merge(IncidentRow(incident_id=incident.incident_id, ts=incident.ts, operator_id=incident.operator_id,
                                    machine_id=incident.machine_id, source=incident.source, type=incident.type,
                                    severity=incident.severity, status=incident.status, data=data))
                outbox.enqueue(s, "incident", data, prio["incident"])

    def _load_alert(self, alert_id: str) -> Alert | None:
        with self._db.session() as s:
            row = s.get(AlertRow, alert_id)
            return Alert.model_validate(row.data) if row else None

    def _restore_active(self) -> None:
        """After an edge restart, put still-raised alerts back on the display (safety clears reconcile them)."""
        with self._db.session() as s:
            rows = s.query(AlertRow).filter(AlertRow.state == AlertState.raised.value,
                                            AlertRow.tier != Tier.T0.value).all()
            alerts = [Alert.model_validate(r.data) for r in rows]
            types = dict(s.query(EventRow.event_id, EventRow.type)
                         .filter(EventRow.event_id.in_([a.event_id for a in alerts])).all())
        for a in alerts:
            self._active[a.alert_id] = _Active(a, etype=types.get(a.event_id, a.what), source="restored",
                                               last_raise_ts=a.ts)

    def _notify(self, alert: Alert) -> None:
        snapshot = alert.model_copy()
        for cb in self._subs:
            try:
                cb(snapshot)
            except Exception:
                log.exception("alert subscriber failed")
