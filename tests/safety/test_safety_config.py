"""config/rules.yaml: versioned, complete, and every operator text is glanceable (<= 12 words)."""
from __future__ import annotations

import copy
import string

import pytest

from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import Attribution, RiskCategory, Tier

from sentinel.safety.rules import LOCK, PROX_CRIT, PROX_WARN, RULE_IDS, SEAT, SENSOR, SPEED, RuleEngine

from tests.safety.factory import ACTIVE, UNBELTED_ACTIVE, Stream, person

CFG = load_yaml("rules")
EXPECTED_TIERS = {SEAT: "T_CRIT", PROX_CRIT: "T_CRIT", PROX_WARN: "T2", SPEED: "T2", LOCK: "T2", SENSOR: "T2"}


def _templates() -> list[tuple[str, str]]:
    out = []
    for rid in RULE_IDS:
        rule = CFG["rules"][rid]
        blocks = [rule[k]["texts"] for k in ("seatbelt", "proximity")] if rid == SENSOR else [rule["texts"]]
        out += [(f"{rid}.{k}", b[k]) for b in blocks for k in ("what", "why", "do")]
    return out


def test_rule_version_and_all_rules_present() -> None:
    assert isinstance(CFG["rule_version"], str) and CFG["rule_version"]
    assert set(CFG["rules"]) == set(RULE_IDS)


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_rule_metadata_is_valid(rule_id: str) -> None:
    rule = CFG["rules"][rule_id]
    assert rule["tier"] == EXPECTED_TIERS[rule_id] and Tier(rule["tier"])
    RiskCategory(rule["category"])
    Attribution(rule["attribution"])
    assert rule["debounce_s"] >= 0 and rule["event_type"]


@pytest.mark.parametrize(("name", "template"), _templates(), ids=[n for n, _ in _templates()])
def test_text_templates_have_at_most_12_words(name: str, template: str) -> None:
    fields = [f for _, f, _, _ in string.Formatter().parse(template) if f]
    rendered = template.format_map({f: "x" for f in fields})
    assert len(rendered.split()) <= 12, name


def test_rendered_texts_have_at_most_12_words() -> None:
    stream = Stream(jitter=False)
    stream.hold(1.0, **UNBELTED_ACTIVE, **person(2.0, "front"))
    stream.hold(3.0, **ACTIVE, **person(6.0, "right"))
    stream.hold(2.0, **ACTIVE, travel_kmh=9.0, zone="TL-1")
    stream.hold(6.0, seatbelt=False, hyd_lockout=False)
    for fastened in [True, False] * 5:
        stream.hold(0.2, seatbelt=fastened)
    rules = {m.rule_id for m in stream.raised()}
    assert rules == set(RULE_IDS)
    for m in stream.transitions:
        for text in (m.what, m.why, m.do):
            assert 0 < len(text.split()) <= 12 and "?" not in text, (m.rule_id, text)


def test_engine_accepts_an_explicit_rules_dict() -> None:
    cfg = copy.deepcopy(CFG)
    cfg["rules"][PROX_CRIT]["danger_m"] = 6.0
    stream = Stream(RuleEngine(cfg))
    stream.hold(1.0, **person(5.5))
    assert stream.active_rules() == {PROX_CRIT}
    assert CFG["rules"][PROX_CRIT]["danger_m"] == 4.0          # cached config left untouched
