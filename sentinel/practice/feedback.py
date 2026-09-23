"""Ranked, phase-level coaching tips (max 5, one per metric family).

Rank = distance outside the expert band (in band widths) x safety weight. Safety flags add
evidence of their own, so a trainee who is fast but unsafe gets the safety tip first. Tips
coach bounds and smoothness, never "go faster" (05 §5.6).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sentinel.practice.metrics import MetricDistribution
from sentinel.practice.settings import CHANNEL_LABELS, PHASE_LABELS, SAFETY_CAPS, SAFETY_FLAGS
from sentinel.shared.schemas import CoachingTip, Phase, new_id

MAX_TIPS = 5
SWING, TRUCK, SMOOTH = "MOD-SWING-APPROACH", "MOD-TRUCK-LOADING", "MOD-SMOOTH-CONTROLS"
UNIT_TEXT = {"deg/s": "°/s", "deg": "°", "s": " s", "t": " t", "count": "", "ratio": "%", "": ""}


@dataclass(frozen=True)
class TipTemplate:
    """Wording and routing for one metric in one direction ("high" = above band, "low" = below)."""
    family: str
    phase: str | None
    competency: str
    module: str
    weight: float
    safety: bool
    title: str
    detail: str


def _t(family: str, phase: str | None, comp: str, module: str, weight: float, title: str, detail: str,
       safety: bool = False) -> TipTemplate:
    return TipTemplate(family, phase, comp, module, weight, safety, title, detail)


TEMPLATES: dict[tuple[str, str], TipTemplate] = {
    ("swing_near_truck_dps", "high"): _t(
        "near_truck", "swing_loaded", "C04", SWING, 3.0,
        "Slow the swing in the last 5 m before the truck",
        "Slow the swing in the last 5 m before the truck (yours {yours} vs expert {upto}). Start easing the "
        "swing lever back about halfway round, so the bucket arrives slowly over the truck bed.", safety=True),
    ("swing_overshoot_deg", "high"): _t(
        "overshoot", "dump", "C04", TRUCK, 2.5,
        "Stop the swing over the truck bed, not past it",
        "Your loaded swing ran {yours} past the dump point (expert {upto}). Overshooting can carry the bucket "
        "over the truck cab: ease off the swing lever earlier and let the swing settle over the bed.", safety=True),
    ("boom_swing_overlap", "low"): _t(
        "multi_function", "swing_loaded", "C09", SMOOTH, 1.5,
        "Raise the boom while you start the swing",
        "Start raising the boom while you begin the swing, as experts overlap these (your overlap {yours} vs "
        "expert {band}). Blend the two levers instead of finishing the lift first; it is smoother and shortens "
        "the cycle without swinging faster."),
    ("dig_stick_reversals", "high"): _t(
        "dig_control", "dig", "C09", SMOOTH, 1.5,
        "Fewer stop-start corrections on the stick during the dig",
        "Fewer stop-start corrections on the stick during the dig ({yours} reversals vs expert {band}). Set the "
        "bucket angle first, then pull the stick in with one steady movement and curl the bucket as it fills."),
    ("swing_lever_reversals", "high"): _t(
        "swing_control", "swing_loaded", "C04", SWING, 1.5,
        "Use one steady movement on the swing lever",
        "Your swing lever changed direction {yours} times per cycle (expert {band}). Push the lever smoothly, "
        "hold it, then ease it back once; avoid correcting back and forth."),
    ("swing_smoothness", "low"): _t(
        "swing_control", "swing_loaded", "C09", SMOOTH, 1.5,
        "Build up and slow down the swing gradually",
        "Your swing was jerkier than the expert range (smoothness {yours} vs expert {band}; higher is smoother). "
        "Move the swing lever progressively instead of full-on then full-off; abrupt starts and stops shake the load."),
    ("swing_peak_dps", "high"): _t(
        "swing_control", "swing_loaded", "C04", SWING, 2.0,
        "Keep the peak swing speed in the expert range",
        "Your peak loaded swing speed was {yours} (expert {band}). A faster swing saves no time if you then "
        "have to brake hard and correct at the truck.", safety=True),
    ("swing_loaded_s", "low"): _t(
        "swing_control", "swing_loaded", "C04", SWING, 1.5,
        "Take more time over the loaded swing",
        "Your loaded swing took only {yours} (expert {band}). A rushed loaded swing is hard to stop precisely "
        "over the truck; keep it controlled.", safety=True),
    ("idle_gap_s", "high"): _t(
        "flow", None, "C09", TRUCK, 1.0,
        "Plan the next movement before the current one ends",
        "You paused {yours} per cycle between movements (expert {upto}). Look ahead to the next position while "
        "you finish each movement, so the levers flow from one phase into the next."),
    ("bucket_fill_t", "low"): _t(
        "fill", "dig", "C08", TRUCK, 1.0,
        "Fill the bucket in one full pass",
        "Average bucket load {yours} (expert {band}). Keep the teeth at a shallow angle, pull the stick in "
        "steadily and curl the bucket as it fills instead of several short scrapes."),
    ("dig_s", "high"): _t(
        "dig_control", "dig", "C09", SMOOTH, 0.7,
        "Plan the cut before you start digging",
        "Your dig took {yours} (expert {band}). Plan the cut first: one steady stick pull with the bucket "
        "curling, rather than repeated small passes."),
    ("cycle_time_s", "high"): _t(
        "flow", None, "C09", TRUCK, 0.5,
        "Shorten the cycle through flow, not speed",
        "Your cycles took {yours} (expert {band}). Do not rush the swing: time comes back from fewer pauses "
        "and from overlapping boom and swing, not from higher speed."),
    ("cycle_time_s", "low"): _t(
        "flow", None, "C04", SWING, 1.0,
        "Quicker than the expert range: check your control",
        "Your cycles took {yours}, quicker than the expert range ({band}). Speed is not the goal: check the truck "
        "approach and the overlay to be sure control has not suffered."),
    ("swing_loaded_s", "high"): _t(
        "flow", "swing_loaded", "C09", SMOOTH, 0.5,
        "Let boom and swing move together",
        "Your loaded swing took {yours} (expert {band}). Start the swing once the bucket clears the face and let "
        "boom and swing move together."),
    ("dump_s", "high"): _t(
        "flow", "dump", "C08", TRUCK, 0.5,
        "Open the bucket in one smooth movement",
        "Your dump took {yours} (expert {band}). Open the bucket in one smooth movement once it is over the "
        "centre of the truck bed."),
    ("dump_s", "low"): _t(
        "flow", "dump", "C08", TRUCK, 0.5,
        "Spread the load as you dump",
        "Your dump took only {yours} (expert {band}). Open the bucket progressively to spread the load and "
        "avoid spillage."),
    ("swing_empty_s", "high"): _t(
        "flow", "swing_empty", "C09", SMOOTH, 0.5,
        "Lower the boom while you swing back",
        "Your return swing took {yours} (expert {band}). Lower the boom while swinging back, so the bucket "
        "arrives at the face ready to dig."),
    ("swing_empty_s", "low"): _t(
        "swing_control", "swing_empty", "C05", SWING, 0.7,
        "Keep the return swing controlled",
        "Your return swing took only {yours} (expert {band}). Keep the return controlled and check that the "
        "swing area is clear before swinging back."),
    ("envelope_exit_frac", "high"): _t(
        "envelope", None, "C09", SMOOTH, 1.0,
        "Follow the expert movement pattern in {phase_label}",
        "Your {channel_label} during {phase_label} was outside the expert band {exit_pct} of the time (expert "
        "typically {upto} across all levers). Compare your curve with the shaded expert band in the overlay."),
}


def _num(value: float, unit: str) -> str:
    if unit == "ratio":
        return f"{100 * value:.0f}"
    if unit in ("deg/s", "deg", "count"):
        return f"{value:.0f}"
    if unit == "t":
        return f"{value:.2f}"
    return f"{value:.1f}"


def _words(dist: MetricDistribution, value: float) -> dict[str, str]:
    unit = dist.spec.unit
    u = UNIT_TEXT[unit]
    lo, hi = _num(dist.p10, unit), _num(dist.p90, unit)
    band = lo if lo == hi else f"{lo} to {hi}" if dist.p10 < 0 else f"{lo}–{hi}"
    return {"yours": f"{_num(value, unit)}{u}", "band": f"{band}{u}", "upto": f"≤ {hi}{u}"}


def _direction(dist: MetricDistribution, value: float) -> str:
    return "high" if value > dist.p90 else "low"


def _flag_fraction(metric: str, cycle_flags: list[list[str]]) -> tuple[int, float]:
    flag = SAFETY_FLAGS.get(metric)
    n_flag = sum(flag in f for f in cycle_flags) if flag else 0
    return n_flag, n_flag / max(len(cycle_flags), 1)


def coaching_tips(summary: dict[str, float], cycle_metrics: list[dict[str, float]], cycle_flags: list[list[str]],
                  dists: dict[str, MetricDistribution], worst_envelope: dict[str, Any] | None = None,
                  max_tips: int = MAX_TIPS) -> list[CoachingTip]:
    """Build ranked, deduplicated coaching tips from session-level metric values.

    ``summary`` holds the session value per metric (median across cycles); ``worst_envelope``
    is ``{"phase", "channel", "exit_frac"}`` for the phase/channel furthest outside the envelope.
    """
    best: dict[str, tuple[float, CoachingTip]] = {}
    for name, value in summary.items():
        dist = dists.get(name)
        if dist is None:
            continue
        n_flag, frac = _flag_fraction(name, cycle_flags)
        distance = dist.distance(value)
        if distance == 0 and n_flag == 0:
            continue
        direction = "high" if n_flag else _direction(dist, value)
        tpl = TEMPLATES.get((name, direction))
        if tpl is None:
            continue
        rank = max(distance, 1.0 + 4.0 * frac if n_flag else 0.0) * tpl.weight
        tip = _make_tip(name, value, dist, tpl, cycle_metrics, n_flag, distance, rank, worst_envelope)
        if tip is not None and rank > best.get(tpl.family, (-1.0, None))[0]:
            best[tpl.family] = (rank, tip)
    ranked = [tip for _, tip in sorted(best.values(), key=lambda rt: -rt[0])][:max_tips]
    return ranked or [_all_good_tip()]


def _make_tip(name: str, value: float, dist: MetricDistribution, tpl: TipTemplate,
              cycle_metrics: list[dict[str, float]], n_flag: int, distance: float, rank: float,
              worst_envelope: dict[str, Any] | None) -> CoachingTip | None:
    words = _words(dist, value)
    phase = tpl.phase
    if name == "envelope_exit_frac":
        if not worst_envelope:
            return None
        phase = worst_envelope["phase"]
        words |= {"phase_label": PHASE_LABELS[phase], "channel_label": CHANNEL_LABELS[worst_envelope["channel"]],
                  "exit_pct": f"{100 * worst_envelope['exit_frac']:.0f}%"}
    detail = tpl.detail.format(**words)
    n_cycles = len(cycle_metrics)
    n_out = sum(dist.distance(m[name]) > 0 for m in cycle_metrics if name in m)
    evidence: dict[str, Any] = {
        "value": round(float(value), 4), "unit": dist.spec.unit, "expert_p10": round(dist.p10, 4),
        "expert_p50": round(dist.p50, 4), "expert_p90": round(dist.p90, 4), "cycles_outside_band": int(n_out),
        "n_cycles": n_cycles, "distance_band_widths": round(distance, 3), "rank": round(rank, 3),
        "module_id": tpl.module, "family": tpl.family, "expert_reference": "SIMULATED expert operators",
    }
    if n_flag:
        cap = SAFETY_CAPS[name]
        detail += (f" {n_flag} of {n_cycles} cycles went over the {_num(cap, dist.spec.unit)}"
                   f"{UNIT_TEXT[dist.spec.unit]} site safety cap.")
        evidence |= {"safety_flagged_cycles": n_flag, "safety_cap": cap}
    if worst_envelope and name == "envelope_exit_frac":
        evidence |= {"channel": worst_envelope["channel"], "phase_exit_frac": round(worst_envelope["exit_frac"], 3)}
    severity = ("priority" if tpl.safety and (n_flag or distance > 0.5)
                else "improve" if distance > 0.5 else "info")
    return CoachingTip(tip_id=new_id("tip"), phase=Phase(phase) if phase else None, metric=name,
                       severity=severity, title=tpl.title.format(**words), detail=detail,
                       competency_id=tpl.competency, evidence=evidence)


def _all_good_tip() -> CoachingTip:
    return CoachingTip(
        tip_id=new_id("tip"), phase=None, metric="overall", severity="info", title="Keep this technique",
        detail="All measured movements are within the SIMULATED expert band. Keep the same smooth, "
               "controlled approach to the truck.", competency_id=None,
        evidence={"module_id": None, "expert_reference": "SIMULATED expert operators"})
