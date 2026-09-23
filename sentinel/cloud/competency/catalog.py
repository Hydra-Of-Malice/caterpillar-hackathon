"""Typed view of config/competencies.yaml (catalog, gap rule, event map)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from sentinel.shared.config import load_yaml

EXPOSURE_UNITS = frozenset({"truck_approach_cycles", "cycles", "operating_h", "shifts"})
COUNT_MODES = frozenset({"events", "shifts_with_event"})


@dataclass(frozen=True)
class Competency:
    id: str
    label: str
    safety_critical: bool
    exposure_unit: str
    task_types: tuple[str, ...]
    reference_rate: float
    prior_alpha: float
    prior_beta: float
    floor: int
    min_shifts: int
    min_exposure: float
    count_mode: str
    module_ids: tuple[str, ...]
    assessment_can_demonstrate: bool
    assessment_only: bool
    reassess_metric: str
    reassess_min_opportunities: float
    why_template: str
    indicators: str
    applies_to: tuple[str, ...]


@dataclass(frozen=True)
class GapRule:
    version: str
    posterior_threshold: float
    confidence_high: float
    decay_half_life_days: float
    lookback_days: float
    counted_attributions: frozenset[str]
    unknown_low_confidence_share: float


@dataclass(frozen=True)
class MapRule:
    id: str
    types: frozenset[str]
    pattern: re.Pattern[str] | None
    when: dict[str, Any]
    competencies: dict[str, float]


@dataclass(frozen=True)
class Catalog:
    version: str
    catalog_version: str
    gap_rule: GapRule
    competencies: dict[str, Competency]
    event_map: tuple[MapRule, ...]
    prior_mode: str
    empirical_min_operators: int
    experience_bands_h: dict[str, float] = field(default_factory=dict)

    def ordered(self) -> list[Competency]:
        """Competencies in catalog order (C01..C14)."""
        return list(self.competencies.values())


def _competency(raw: dict[str, Any], rule: dict[str, Any]) -> Competency:
    safety = bool(raw.get("safety_critical", False))
    exposure = raw.get("exposure") or {}
    unit = exposure.get("unit", "operating_h")
    count_mode = raw.get("count_mode", "events")
    if unit not in EXPOSURE_UNITS:
        raise ValueError(f"{raw['id']}: unknown exposure unit {unit!r}")
    if count_mode not in COUNT_MODES:
        raise ValueError(f"{raw['id']}: unknown count_mode {count_mode!r}")
    default_floor = rule["floor_safety_critical"] if safety else rule["floor"]
    prior = raw.get("prior") or {}
    min_exposure = float(raw.get("min_exposure", 0.0))
    return Competency(
        id=raw["id"], label=raw["label"], safety_critical=safety,
        exposure_unit=unit, task_types=tuple(exposure.get("task_types") or ()),
        reference_rate=float(raw["reference_rate"]),
        prior_alpha=float(prior.get("alpha", 0.5)), prior_beta=float(prior.get("beta", 5.0)),
        floor=int(raw.get("floor", default_floor)), min_shifts=int(raw.get("min_shifts", rule["min_shifts"])),
        min_exposure=min_exposure, count_mode=count_mode,
        module_ids=tuple(raw.get("module_ids") or ()),
        assessment_can_demonstrate=bool(raw.get("assessment_can_demonstrate", False)),
        assessment_only=bool(raw.get("assessment_only", False)),
        reassess_metric=raw.get("reassess_metric", ""),
        reassess_min_opportunities=float(raw.get("reassess_min_opportunities", min_exposure)),
        why_template=raw.get("why_template", "{n_events} events across {n_shifts} shifts"),
        indicators=raw.get("indicators", ""), applies_to=tuple(raw.get("applies_to") or ()),
    )


def _map_rule(raw: dict[str, Any]) -> MapRule:
    pattern = raw.get("pattern")
    return MapRule(
        id=raw["id"], types=frozenset(raw.get("types") or ()),
        pattern=re.compile(pattern) if pattern else None,
        when=dict(raw.get("when") or {}),
        competencies={k: float(v) for k, v in (raw.get("competencies") or {}).items()},
    )


def parse_catalog(raw: dict[str, Any]) -> Catalog:
    """Build a Catalog from the YAML dict (validates units, modes and map targets)."""
    rule_raw = raw["gap_rule"]
    rule = GapRule(
        version=rule_raw["version"], posterior_threshold=float(rule_raw["posterior_threshold"]),
        confidence_high=float(rule_raw["confidence_high"]),
        decay_half_life_days=float(rule_raw["decay_half_life_days"]),
        lookback_days=float(rule_raw["lookback_days"]),
        counted_attributions=frozenset(rule_raw["counted_attributions"]),
        unknown_low_confidence_share=float(rule_raw["unknown_low_confidence_share"]),
    )
    comps = {c["id"]: _competency(c, rule_raw) for c in raw["competencies"]}
    event_map = tuple(_map_rule(m) for m in raw.get("event_map") or ())
    for m in event_map:
        unknown = set(m.competencies) - set(comps)
        if unknown:
            raise ValueError(f"{m.id}: maps to unknown competencies {sorted(unknown)}")
    return Catalog(
        version=raw["version"], catalog_version=str(raw.get("catalog_version", "")), gap_rule=rule,
        competencies=comps, event_map=event_map, prior_mode=raw.get("prior_mode", "fixed"),
        empirical_min_operators=int((raw.get("empirical_prior") or {}).get("min_operators", 5)),
        experience_bands_h=dict((raw.get("profile") or {}).get("experience_bands_h") or {}),
    )


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    """The active catalog from config/competencies.yaml (cached)."""
    return parse_catalog(load_yaml("competencies"))
