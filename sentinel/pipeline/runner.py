"""Behaviour pipeline entry point: RuntimeContext and Pipeline (implementation-plan §C).

Per sample: the excessive-idle rule runs, and the sample enters the per-machine window
buffer. Per closed window (20 s, 5 s stride): features → context → Isolation Forest
percentile → procedural rules → fusion and in-cab gate → robust-z explanation →
attribution → Events. `sample.gt` is never read.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sentinel.pipeline.anomaly import AnomalyDetector, AnomalyResult
from sentinel.pipeline.context import (
    IdleTracker, context_key, gated_features, machine_type_for, provenance_for,
)
from sentinel.pipeline.explain import (
    Baseline, default_baseline, direction_indicator, robust_z, signature_of, top_contributions,
)
from sentinel.pipeline.features import FeatureExtractor, Window, compute_features
from sentinel.pipeline.fusion import (
    Cooldown, Decision, Exposure, FusionEngine, RecurrenceCounter, exposure, rule_feature_map, signature_key,
)
from sentinel.pipeline.machine_health import AttributionResult, MachineCues, MachineHealth
from sentinel.pipeline.rules_behaviour import BehaviourRules, RuleHit
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import (
    Attribution, Event, FeatureContribution, FeatureWindow, Provenance, RiskCategory,
    Source, TelemetrySample, Tier,
)

log = logging.getLogger(__name__)

ML_EVENT_TYPE = "behaviour_anomaly"
TOP_K = 3


@dataclass
class RuntimeContext:
    """Edge-side context not carried by telemetry (dispatch / operator tap / roster)."""
    waiting_for_truck: bool = False
    task_type: str | None = None
    operator_experience_h: float = 0.0


@dataclass
class _WindowState:
    """Everything computed once per window and shared by its events."""
    window: Window
    record: FeatureWindow
    features: dict[str, float]
    task_type: str | None
    ctx: RuntimeContext
    gated: frozenset[str]
    scored: AnomalyResult | None
    d: int
    risk_share: float
    explanation: list[FeatureContribution]
    baseline: Baseline | None
    baseline_source: str | None
    top_feature: str | None
    exposure: Exposure
    cues: MachineCues


class Pipeline:
    """Windowed behaviour pipeline. Runs in rules-only mode when no model is available."""

    def __init__(self, models_dir: Path | None = None) -> None:
        self.cfg: dict[str, Any] = load_yaml("fusion")
        self.extractor = FeatureExtractor(self.cfg)
        self.idle = IdleTracker(self.cfg)
        self.rules = BehaviourRules(self.cfg)
        self.machine_health = MachineHealth(self.cfg)
        self.detector = AnomalyDetector.load(models_dir)
        thresholds = self.detector.thresholds if self.detector else {}
        self.fusion = FusionEngine(self.cfg, thresholds.get("tau1"), thresholds.get("tau2"))
        self.recurrence = RecurrenceCounter()
        self.cooldown = Cooldown()
        self._rule_map = rule_feature_map(self.cfg)
        self._default_baseline = default_baseline(self.cfg)
        self._last: FeatureWindow | None = None
        log.info("Behaviour pipeline started in %s mode (model %s)", self.mode, self.model_version)

    @property
    def mode(self) -> str:
        """"fusion" with a loaded model, "rules_only" otherwise."""
        return "fusion" if self.detector is not None else "rules_only"

    @property
    def model_version(self) -> str | None:
        return self.detector.version if self.detector else None

    def process(self, sample: TelemetrySample, ctx: RuntimeContext) -> list[Event]:
        """Consume one 10 Hz sample; return any Events due (idle rule, closed-window events)."""
        task_type = ctx.task_type or getattr(sample.task_type, "value", sample.task_type)
        events: list[Event] = []
        idle_event = self.idle.update(sample, ctx.waiting_for_truck, task_type)
        if idle_event is not None:
            events.append(idle_event)
        window = self.extractor.push(sample)
        if window is not None:
            events.extend(self._process_window(window, ctx))
        return events

    def last_window(self) -> FeatureWindow | None:
        """The most recently closed FeatureWindow (with score and percentile if scored)."""
        return self._last

    # ------------------------------------------------------------------ window path
    def _process_window(self, w: Window, ctx: RuntimeContext) -> list[Event]:
        st = self._analyse(w, ctx)
        self._last = st.record
        hits = self.rules.evaluate(w)
        events = [self._rule_event(st, hit) for hit in hits]
        if not hits:
            ml_event = self._ml_event(st)
            if ml_event is not None:
                events.append(ml_event)
        health_event = self._health_event(st)
        if health_event is not None:
            events.append(health_event)
        return events

    def _analyse(self, w: Window, ctx: RuntimeContext) -> _WindowState:
        feats = compute_features(w, self.cfg["features"])
        task_type = ctx.task_type or w.meta.task_type
        ckey = context_key(machine_type_for(w.meta.machine_id, self.cfg), task_type)
        gated = gated_features(ctx.waiting_for_truck, self.cfg)
        scored, baseline = self._score(feats, ckey, w.variant)
        source = "model" if baseline is not None else None
        if baseline is None and self._default_baseline is not None:
            baseline, source = self._default_baseline, "default"
        d, share, explanation = 0, 0.0, []
        if baseline is not None:
            explanation = top_contributions(feats, baseline, TOP_K, gated)
            if scored is not None:
                d, share = direction_indicator(robust_z(feats, baseline), gated, self.cfg["fusion"]["direction"])
        record = FeatureWindow(
            t_start=w.t_start, t_end=w.t_end, machine_id=w.meta.machine_id,
            operator_id=w.meta.operator_id, shift_id=w.meta.shift_id, task_id=w.meta.task_id,
            context_key=ckey, variant=w.variant, features={k: round(v, 5) for k, v in feats.items()},
            score=scored.score if scored else None, percentile=scored.percentile if scored else None,
            model_version=scored.model_version if scored else None,
        )
        return _WindowState(w, record, feats, task_type, ctx, gated, scored, d, share, explanation, baseline, source,
                            signature_of(explanation), exposure(feats, w.meta.zone, task_type, self.cfg),
                            MachineHealth.cues(feats))

    def _score(self, feats: dict[str, float], ckey: str, variant: str) -> tuple[AnomalyResult | None, Baseline | None]:
        """(calibrated score, model baseline); either is None when unavailable."""
        if self.detector is None:
            return None, None
        baseline = self.detector.baseline(ckey, variant)
        if feats["engine_on_frac"] < self.cfg["anomaly"]["min_engine_on_frac"]:
            return None, baseline
        return self.detector.score(feats, ckey, variant), baseline

    def _rule_event(self, st: _WindowState, hit: RuleHit) -> Event:
        meta = st.window.meta
        q = st.scored.q if st.scored else 0.0
        k = self.recurrence.peek(meta.operator_id, meta.shift_id, hit.rule_id)
        dec = self.fusion.decide_rule(hit.severity, st.d, q, st.exposure.m_e, k)
        self.recurrence.add(meta.operator_id, meta.shift_id, hit.rule_id)
        kinds = [Provenance.RULE, Provenance.ML] if dec.ml_corroborates else [Provenance.RULE]
        att = self._attribute(st, hit.rule_id, hit.signature)
        evidence = {"value": hit.value, "threshold": hit.threshold, "unit": hit.unit,
                    "t_first": hit.t_first, **hit.evidence}
        explanation = (top_contributions(st.features, st.baseline, TOP_K, st.gated, prefer=hit.signature)
                       if st.baseline is not None else [])
        return self._event(st, hit.rule_id, dec.category, dec.tier, kinds, dec, att, evidence,
                           rule_id=hit.rule_id, rule_version=hit.rule_version, ts=hit.t_first,
                           explanation=explanation)

    def _ml_event(self, st: _WindowState) -> Event | None:
        if st.scored is None:
            return None
        meta = st.window.meta
        key = signature_key(st.top_feature, self._rule_map)
        if not self.cooldown.ready(meta.machine_id, key, st.window.t_end):
            return None
        k = self.recurrence.peek(meta.operator_id, meta.shift_id, key)
        dec = self.fusion.decide_ml(st.d, st.scored.q, st.exposure.m_e, k)
        if dec is None:
            return None
        self.cooldown.arm(meta.machine_id, key, st.window.t_end, self.cfg["fusion"]["ml_cooldown_s"])
        if dec.tier is not None:
            self.recurrence.add(meta.operator_id, meta.shift_id, key)
        signature = (st.top_feature,) if st.top_feature else ()
        att = self._attribute(st, ML_EVENT_TYPE, signature)
        category = (RiskCategory.emerging_degradation
                    if att.attribution == Attribution.machine and dec.tier is not None else dec.category)
        return self._event(st, ML_EVENT_TYPE, category, dec.tier, [Provenance.ML], dec, att,
                           {"signature": key}, ts=st.window.t_end)

    def _health_event(self, st: _WindowState) -> Event | None:
        hcfg = self.cfg["attribution"]["health_event"]
        meta = st.window.meta
        if not self.machine_health.hydraulic_suspect(st.cues):
            return None
        if not self.cooldown.ready(meta.machine_id, hcfg["type"], st.window.t_end):
            return None
        self.cooldown.arm(meta.machine_id, hcfg["type"], st.window.t_end, hcfg["cooldown_s"])
        att = AttributionResult(Attribution.machine, ("pressure_without_lever_input",))
        self.machine_health.record(meta.machine_id, self.machine_health.machine_features, meta.operator_id)
        evidence = {"uncommanded_spikes": st.cues.uncommanded_spikes,
                    "press_no_cmd_ratio": round(st.cues.press_no_cmd_ratio, 3), "dtc_count": st.cues.dtc_count}
        return self._event(st, hcfg["type"], RiskCategory.emerging_degradation, Tier.T0, [Provenance.RULE],
                           None, att, evidence, rule_id=hcfg["type"], rule_version=hcfg["version"],
                           ts=st.window.t_end)

    def _attribute(self, st: _WindowState, event_type: str, signature: tuple[str, ...]) -> AttributionResult:
        meta = st.window.meta
        att = self.machine_health.attribute(event_type, signature, st.top_feature, meta.machine_id,
                                            meta.operator_id, st.cues)
        self.machine_health.record(meta.machine_id, signature, meta.operator_id)
        return att

    def _event(self, st: _WindowState, event_type: str, category: RiskCategory, tier: Tier | None,
               kinds: list[Provenance], dec: Decision | None, att: AttributionResult,
               evidence: dict[str, Any], ts: float, rule_id: str | None = None,
               rule_version: str | None = None, explanation: list[FeatureContribution] | None = None) -> Event:
        meta, feats, scored = st.window.meta, st.features, st.scored
        context: dict[str, Any] = {
            "task_type": st.task_type, "task_id": meta.task_id, "zone": meta.zone,
            "waiting_for_truck": st.ctx.waiting_for_truck, "operator_experience_h": st.ctx.operator_experience_h,
            "context_key": st.record.context_key, "variant": st.window.variant,
            "proximity_monitored": st.window.variant == "BC", "mode": self.mode,
            "window_id": st.record.window_id, "t_start": st.window.t_start, "t_end": st.window.t_end,
            "m_E": st.exposure.m_e, "exposure_reasons": list(st.exposure.reasons),
            "travel_kmh_p95": round(feats["travel_speed_p95"], 2),
            "swing_dps_p95": round(feats["swing_speed_p95"], 2),
            "swing_dps_near_truck": round(feats["swing_speed_near_truck"], 2) if "swing_speed_near_truck" in feats else None,
            "approach_mps": round(feats["approach_speed_to_truck"], 2) if "approach_speed_to_truck" in feats else None,
            "gated_features": sorted(st.gated), "attribution_reasons": list(att.reasons),
            "baseline_source": st.baseline_source,
            "baseline_version": (self.model_version if st.baseline_source == "model"
                                 else self.cfg["default_baseline"]["version"] if st.baseline_source else None),
        }
        if scored is not None:
            context.update(percentile=round(scored.percentile, 5), pvalue=round(scored.pvalue, 6),
                           q=round(scored.q, 3), model_key=scored.model_key,
                           model_fallback=scored.fallback, unfamiliar_context=scored.unfamiliar)
        if dec is not None:
            evidence = {**evidence, "r": round(dec.r, 3), "S_proc": dec.s_proc, "d": st.d,
                        "risk_share": round(st.risk_share, 3), "dq": round(dec.ml_term, 3),
                        "K": dec.k, "tau1": self.fusion.tau1, "tau2": self.fusion.tau2,
                        "in_cab": dec.in_cab, "fusion_version": self.cfg["version"]}
        ml_involved = Provenance.ML in kinds
        return Event(
            ts=ts, site_id=meta.site_id, machine_id=meta.machine_id, operator_id=meta.operator_id,
            shift_id=meta.shift_id, task_id=meta.task_id, type=event_type, category=category, tier=tier,
            provenance=provenance_for(meta.source, *kinds), rule_id=rule_id, rule_version=rule_version,
            model_version=scored.model_version if (scored is not None and ml_involved) else None,
            risk_score=round(dec.r, 3) if dec is not None else None, attribution=att.attribution,
            context=context, explanation=st.explanation if explanation is None else explanation,
            evidence=evidence,
            simulated=meta.source != Source.REAL.value,
        )
