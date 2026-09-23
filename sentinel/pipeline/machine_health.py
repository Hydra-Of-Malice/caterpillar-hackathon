"""Operator vs machine vs environment attribution (04 §5.4, 08 §2) and the hydraulic
machine-health channel.

Operator issues change the command; machine faults change the command → response mapping
and recur across operators of one machine (09 §4.5). Evidence, in order:

1. Task state explains it (context gate) → environment.
2. Active DTC coinciding with an event type a fault can plausibly cause → machine.
3. Hydraulic signature plus pressure spikes / pressure without matching lever input → machine.
4. Hydraulic signature seen with ≥ 2 operators on the same machine → machine.
5. Top deviation is an environment feature (person or truck positioning) → environment.
6. Otherwise → operator.

Machine-attributed events never carry competency ids (the cloud maps operator events only).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Iterable

from sentinel.shared.schemas import Attribution


@dataclass(frozen=True)
class MachineCues:
    """Machine-side evidence in one window."""
    dtc_count: int
    uncommanded_spikes: int
    press_no_cmd_ratio: float

    def hydraulic_suspect(self, acfg: dict[str, Any]) -> bool:
        return (self.uncommanded_spikes >= acfg["uncommanded_spikes_min"]
                or self.press_no_cmd_ratio >= acfg["press_no_cmd_ratio_min"])


@dataclass(frozen=True)
class AttributionResult:
    attribution: Attribution
    reasons: tuple[str, ...]


class MachineHealth:
    """Attribution rules plus cross-operator signature history per machine."""

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.acfg: dict[str, Any] = cfg["attribution"]
        self.version: str = self.acfg["version"]
        self.machine_features = frozenset(self.acfg["machine_cue_features"])
        self.env_features = frozenset(self.acfg["environment_features"])
        self._operators: dict[tuple[str, str], set[str]] = defaultdict(set)

    @staticmethod
    def cues(features: dict[str, float]) -> MachineCues:
        """Machine cues from a window's features."""
        return MachineCues(int(features.get("dtc_active_count", 0)),
                           int(features.get("hyd_uncmd_spike_count", 0)),
                           float(features.get("hyd_press_no_cmd_ratio", 0.0)))

    def hydraulic_suspect(self, cues: MachineCues) -> bool:
        return cues.hydraulic_suspect(self.acfg)

    def seed(self, records: Iterable[tuple[str, str, str]]) -> None:
        """Pre-load history as (machine_id, signature_feature, operator_id) tuples."""
        for machine_id, feature, operator_id in records:
            self._operators[(machine_id, feature)].add(operator_id)

    def record(self, machine_id: str, signature: Iterable[str], operator_id: str) -> None:
        """Remember which operators produced a machine-capable signature on a machine."""
        for f in set(signature) & self.machine_features:
            self._operators[(machine_id, f)].add(operator_id)

    def operators_with(self, machine_id: str, signature: Iterable[str]) -> set[str]:
        ops: set[str] = set()
        for f in set(signature) & self.machine_features:
            ops |= self._operators.get((machine_id, f), set())
        return ops

    def attribute(self, event_type: str, signature: Iterable[str], top_feature: str | None,
                  machine_id: str, operator_id: str, cues: MachineCues, gated: bool = False) -> AttributionResult:
        """Attribute one event to operator, machine or environment."""
        signature = set(signature)
        if gated:
            return AttributionResult(Attribution.environment, ("task_state_explains",))
        if cues.dtc_count > 0 and event_type in self.acfg["dtc_event_types"]:
            return AttributionResult(Attribution.machine, (f"active_dtc:{cues.dtc_count}",))
        machine_sig = bool(signature & self.machine_features)
        if machine_sig and self.hydraulic_suspect(cues):
            return AttributionResult(Attribution.machine, ("pressure_without_lever_input",))
        if machine_sig:
            ops = self.operators_with(machine_id, signature) | {operator_id}
            if len(ops) >= self.acfg["cross_operator_min"]:
                return AttributionResult(Attribution.machine, (f"same_signature_{len(ops)}_operators",))
        if top_feature in self.env_features:
            return AttributionResult(Attribution.environment, (f"environment_feature:{top_feature}",))
        return AttributionResult(Attribution.operator, ("operator_command_pattern",))
