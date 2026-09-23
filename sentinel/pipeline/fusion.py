"""Contextual risk fusion and decision table (04 §5.3).

    r = max(S_proc, d·q) × m_E + bonus · 1[K ≥ k_min]

- q = -log10(p-value) of the calibrated IF score; d = direction indicator (explain.py).
- S_proc = severity of the procedural rule hit, in threshold units (T1-level = τ₁,
  T2-level = τ₂; with the nominal τ this is {0, 2, 3} as in 04 §5.3).
- m_E = exposure multiplier from zone, task and Tier C proximity.
- K = recurrence count of the same event type / signature for this operator in this shift.

Decision table: r < τ₁ → log only; τ₁ ≤ r < τ₂ → T1; r ≥ τ₂ → T2. T-CRIT belongs to the
independent safety engine and T3/T4 to the alert manager.

In-cab gate: an ML anomaly alone never produces an in-cab tier. Without a rule hit the
proposal is at most T0 (post-shift coaching) or a log entry.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sentinel.shared.schemas import RiskCategory, Tier


@dataclass(frozen=True)
class Exposure:
    """Exposure multiplier m_E and the reasons behind it."""
    m_e: float
    reasons: tuple[str, ...]


def exposure(features: dict[str, float], zone: str | None, task_type: str | None,
             cfg: dict[str, Any]) -> Exposure:
    """m_E: 1.5 near a person, a close truck or when reversing; 1.0 in a loading zone or
    travel lane; 0.5 in an open area."""
    e = cfg["fusion"]["exposure"]
    reasons = []
    if features.get("person_near_frac", 0.0) > 0:
        reasons.append("person_in_warning_zone")
    if features.get("min_truck_m", float("inf")) < e["truck_close_m"]:
        reasons.append("truck_close")
    if features.get("reverse_travel_frac", 0.0) > 0:
        reasons.append("reversing")
    if reasons:
        return Exposure(float(e["high"]), tuple(reasons))
    z = (zone or "").upper()
    if any(z.startswith(p) for p in e["loading_zone_prefixes"]) or task_type in e["loading_task_types"]:
        return Exposure(float(e["zone"]), ("loading_zone",))
    if any(z.startswith(p) for p in e["travel_lane_prefixes"]):
        return Exposure(float(e["zone"]), ("travel_lane",))
    return Exposure(float(e["open"]), ("open_area",))


@dataclass(frozen=True)
class Decision:
    """Fusion outcome for one candidate event."""
    r: float
    tier: Tier | None          # None = log only
    category: RiskCategory
    in_cab: bool
    s_proc: float
    ml_term: float             # d·q
    m_e: float
    k: int
    ml_corroborates: bool      # d·q·m_E alone reaches τ₁


class FusionEngine:
    """Applies the fusion formula, decision table and in-cab gate."""

    def __init__(self, cfg: dict[str, Any], tau1: float | None = None, tau2: float | None = None) -> None:
        f = cfg["fusion"]
        self.tau1 = float(tau1 if tau1 is not None else f["tau1"])
        self.tau2 = float(tau2 if tau2 is not None else f["tau2"])
        if self.tau2 <= self.tau1:
            raise ValueError(f"tau2 ({self.tau2}) must exceed tau1 ({self.tau1})")
        self.bonus = float(f["recurrence_bonus"])
        self.k_min = int(f["recurrence_k_min"])
        self.high_exposure = float(f["exposure"]["high"])

    def severity_value(self, level: str | None) -> float:
        """S_proc for a rule severity level ("T1" → τ₁, "T2" → τ₂, else 0)."""
        return {"T1": self.tau1, "T2": self.tau2}.get(level or "", 0.0)

    def risk(self, s_proc: float, ml_term: float, m_e: float, k: int) -> float:
        """r = max(S_proc, d·q) × m_E + bonus · 1[K ≥ k_min]."""
        return max(s_proc, ml_term) * m_e + (self.bonus if k >= self.k_min else 0.0)

    def tier_for(self, r: float) -> Tier | None:
        """Decision table: None (log only), T1 or T2."""
        if r >= self.tau2:
            return Tier.T2
        return Tier.T1 if r >= self.tau1 else None

    def decide_rule(self, severity: str, d: int, q: float, m_e: float, k: int) -> Decision:
        """Decision for a procedural rule hit, optionally corroborated by the ML term."""
        s_proc, ml_term = self.severity_value(severity), d * q
        r = self.risk(s_proc, ml_term, m_e, k)
        tier = self.tier_for(r)
        corroborates = d == 1 and ml_term * m_e >= self.tau1
        category = RiskCategory.dangerous_condition if corroborates else RiskCategory.procedural
        return Decision(r, tier, category, tier in (Tier.T1, Tier.T2), s_proc, ml_term, m_e, k, corroborates)

    def decide_ml(self, d: int, q: float, m_e: float, k: int) -> Decision | None:
        """Decision for an ML-only anomaly: at most T0, never in-cab. None if below τ₁.

        Risk-direction (d = 1) anomalies with r ≥ τ₁ become T0 coaching events; those at
        r ≥ τ₂ in high exposure are dangerous_condition (04 §5.2). Non-risk-direction
        anomalies whose surprise alone reaches τ₁ are logged as unusual_harmless.
        """
        if d == 1:
            r = self.risk(0.0, q, m_e, k)
            if r < self.tau1:
                return None
            dangerous = r >= self.tau2 and m_e >= self.high_exposure
            category = RiskCategory.dangerous_condition if dangerous else RiskCategory.unusual_harmless
            return Decision(r, Tier.T0, category, False, 0.0, q, m_e, k, True)
        if q * m_e >= self.tau1:
            return Decision(0.0, None, RiskCategory.unusual_harmless, False, 0.0, 0.0, m_e, k, False)
        return None


def rule_feature_map(cfg: dict[str, Any]) -> dict[str, str]:
    """feature -> rule_id for every feature listed in a behaviour rule's signature."""
    out: dict[str, str] = {}
    for rule_id, rc in cfg["rules"].items():
        if isinstance(rc, dict):
            for f in rc.get("signature", ()):
                out.setdefault(f, rule_id)
    return out


def signature_key(top_feature: str | None, rule_map: dict[str, str]) -> str:
    """Recurrence / cooldown key: the rule a feature belongs to, else "anomaly:<feature>",
    so a behaviour counts once whether a rule or the ML path caught it."""
    if top_feature is None:
        return "anomaly:none"
    return rule_map.get(top_feature, f"anomaly:{top_feature}")


class RecurrenceCounter:
    """K: events per operator × event type (or signature) within the current shift."""

    def __init__(self) -> None:
        self._shift: dict[str, str | None] = {}
        self._counts: dict[tuple[str, str], int] = {}

    def _sync(self, operator_id: str, shift_id: str | None) -> None:
        if self._shift.get(operator_id, shift_id) != shift_id:
            self._counts = {k: v for k, v in self._counts.items() if k[0] != operator_id}
        self._shift[operator_id] = shift_id

    def peek(self, operator_id: str, shift_id: str | None, key: str) -> int:
        """K including a prospective new event (prior count + 1)."""
        self._sync(operator_id, shift_id)
        return self._counts.get((operator_id, key), 0) + 1

    def add(self, operator_id: str, shift_id: str | None, key: str) -> int:
        """Record an emitted event; return the new count."""
        self._sync(operator_id, shift_id)
        n = self._counts.get((operator_id, key), 0) + 1
        self._counts[(operator_id, key)] = n
        return n


class Cooldown:
    """Per-key refractory period so overlapping windows emit one event per episode."""

    def __init__(self) -> None:
        self._until: dict[tuple[str, str], float] = {}

    def ready(self, machine_id: str, key: str, ts: float) -> bool:
        return ts >= self._until.get((machine_id, key), float("-inf"))

    def arm(self, machine_id: str, key: str, ts: float, seconds: float) -> None:
        self._until[(machine_id, key)] = ts + seconds
