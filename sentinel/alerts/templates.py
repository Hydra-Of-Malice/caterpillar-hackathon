"""what / why / do text rendering from config/alert_policy.yaml templates (≤ 12 words each)."""
from __future__ import annotations

from typing import Any

from sentinel.shared.schemas import Event

MAX_WORDS = 12
TEXT_FIELDS = ("what", "why", "do")


def clip_words(text: str, n: int = MAX_WORDS) -> str:
    words = text.split()
    return text.strip() if len(words) <= n else " ".join(words[:n])


def _unit(unit: str) -> str:
    """'°/s' attaches to the number; word units get a space ('12 km/h')."""
    return unit if unit.startswith("°") or unit in ("%", "") else f" {unit}"


def event_context(event: Event, **extra: Any) -> dict[str, Any]:
    """Placeholder values for one event: scalar context/evidence plus the top explanation feature."""
    ctx: dict[str, Any] = {}
    for source in (event.evidence, event.context):
        ctx.update({k: v for k, v in source.items() if isinstance(v, (str, int, float, bool))})
    ctx["type_label"] = clip_words(event.type.replace("_", " ").upper(), 6)
    if event.explanation:
        top = event.explanation[0]
        ctx.update(top_label=top.label, top_value=top.value, top_baseline=top.baseline_mean,
                   top_unit=_unit(top.unit), top_z=top.z)
    if "idle_min" not in ctx:
        idle_s = ctx.get("idle_s") or ctx.get("idle_duration_s")
        if isinstance(idle_s, (int, float)):
            ctx["idle_min"] = idle_s / 60.0
    ctx.update(extra)
    return ctx


def render(template: dict[str, str], ctx: dict[str, Any]) -> dict[str, str]:
    """Render what/why/do; a field whose placeholders are missing falls back to ``<field>_fallback``."""
    out = {}
    for field in TEXT_FIELDS:
        out[field] = ""
        for candidate in (template.get(field), template.get(f"{field}_fallback")):
            if candidate is None:
                continue
            try:
                out[field] = clip_words(candidate.format(**ctx))
                break
            except (KeyError, ValueError, TypeError, IndexError, AttributeError):
                continue
    return out
