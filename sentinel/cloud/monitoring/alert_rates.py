"""Alerts per operating hour by tier vs the alert budget (13 M3), with an exact Poisson upper 95 % bound."""
from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.reassess.rate_ratio import poisson_rate_ci
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import SIGNAL_WORD, Tier
from sentinel.store.models import AlertRow, ExposureRow

TIER_ORDER = [t.value for t in (Tier.T_CRIT, Tier.T4, Tier.T3, Tier.T2, Tier.T1, Tier.T0)]


def alert_rates(s: Session) -> dict[str, Any]:
    cfg = load_yaml("cloud")["monitoring"]
    budget = {k: float(v) for k, v in cfg["alert_budget_per_h"].items()}
    hours = float(sum(x.operating_h or 0.0 for x in s.scalars(select(ExposureRow))))
    counts = Counter(a.tier for a in s.scalars(select(AlertRow)))
    tiers = []
    for tier in TIER_ORDER:
        n = counts.get(tier, 0)
        rate = n / hours if hours > 0 else None
        upper = poisson_rate_ci(n, hours)[1] if hours > 0 else None
        b = budget.get(tier)
        tiers.append({"tier": tier, "signal_word": SIGNAL_WORD[Tier(tier)], "count": n,
                      "rate_per_h": round(rate, 3) if rate is not None else None,
                      "upper95_per_h": round(upper, 3) if upper is not None else None,
                      "budget_per_h": b,
                      "within_budget": None if b is None or upper is None else upper <= b})
    return {"operating_h": round(hours, 2), "tiers": tiers, "budget_version": cfg["version"],
            "note": "Budget applies to the upper 95 % bound (exact Poisson). T-CRIT has no budget: it is never suppressed.",
            "label": "SIMULATED"}
