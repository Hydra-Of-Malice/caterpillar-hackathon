"""Deterministic event -> competency mapping (08 §8.3 step 3). The first matching rule wins."""
from __future__ import annotations

from typing import Any

from sentinel.cloud.competency.catalog import Catalog, MapRule


def _when_matches(rule: MapRule, context: dict[str, Any]) -> bool:
    for key, expected in rule.when.items():
        value = context.get(key)
        if isinstance(expected, list):
            if value not in expected:
                return False
        elif value != expected:
            return False
    return True


def map_event(event_type: str, context: dict[str, Any], own_ids: list[str],
              catalog: Catalog) -> tuple[dict[str, float], str | None]:
    """Return ({competency_id: weight}, rule_id) for one event.

    Falls back to the event's own `competency_ids` (weight 1.0, rule None) when no rule matches.
    """
    for rule in catalog.event_map:
        hit = event_type in rule.types or (rule.pattern is not None and rule.pattern.search(event_type))
        if hit and _when_matches(rule, context):
            return dict(rule.competencies), rule.id
    known = [c for c in own_ids if c in catalog.competencies]
    return {c: 1.0 for c in known}, None
