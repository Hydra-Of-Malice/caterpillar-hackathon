"""Behaviour pipeline (agent C): windowed features, context gating, idle and procedural
rules, Isolation Forest anomaly scoring, risk fusion, explanations and attribution."""
from sentinel.pipeline.runner import Pipeline, RuntimeContext

__all__ = ["Pipeline", "RuntimeContext"]
