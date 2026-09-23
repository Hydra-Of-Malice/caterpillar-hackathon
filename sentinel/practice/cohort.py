"""Cohort simulation: coached (targeted tips) vs control (generic practice). SIMULATED + ASSUMPTION.

Skill-metric model, not raw telemetry, so a whole cohort runs in well under a second:
- Calibration: per-cycle metrics of ground-truth-segmented SIMULATED expert and novice cycles
  (sentinel.sim.practice when its experts pass the safety gate, else the built-in synthetic
  generator). Safe expert cycles give the metric distributions and a lightweight expert scorer
  (same ExpertScorer, fitted here; no trained Expert Motion Model needed).
- Trainee: a skill level per skill family in 0..1 (0 = novice median, 1 = expert median). Each
  cycle's metrics interpolate between the two references with interpolated cycle-to-cycle noise.
- Learning: after every session each skill closes ``lr * (1 - skill)`` of its gap. Coached
  trainees act on the analyser's top tips (``coaching_tips``); the skills those tips target learn
  ``lr_multiplier`` times faster (ASSUMPTION). Both arms share the same trainees and noise draws
  (common random numbers), so the difference comes from the coaching alone.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np

from sentinel.practice.feedback import coaching_tips
from sentinel.practice.metrics import MetricDistribution, fit_distributions, kinematic_metrics, safety_flags, summarise
from sentinel.practice.phases import detect_cycles
from sentinel.practice.scorer import ExpertScorer, session_score
from sentinel.practice.settings import COHORT_ASSUMPTIONS, EXERCISES, DEFAULT_EXERCISE
from sentinel.practice.signals import to_arrays
from sentinel.practice.synthetic import generate_synthetic_session
from sentinel.shared.schemas import PracticeSample

SKILL_OF_METRIC: dict[str, str] = {
    "swing_near_truck_dps": "near_truck", "swing_peak_dps": "near_truck", "swing_overshoot_deg": "overshoot",
    "boom_swing_overlap": "multi_function", "dig_stick_reversals": "dig_control", "dig_s": "dig_control",
    "swing_lever_reversals": "swing_control", "swing_smoothness": "swing_control",
    "swing_loaded_s": "swing_control", "idle_gap_s": "flow", "dump_s": "flow", "swing_empty_s": "flow",
    "bucket_fill_t": "fill",
}
SKILLS: tuple[str, ...] = tuple(sorted(set(SKILL_OF_METRIC.values())))
METRICS: tuple[str, ...] = tuple(SKILL_OF_METRIC)
PHASE_TIMES = ("dig_s", "swing_loaded_s", "dump_s", "swing_empty_s", "idle_gap_s")
KEY_METRICS = ("swing_near_truck_dps", "boom_swing_overlap", "idle_gap_s", "dig_stick_reversals", "cycle_time_s")
PROFICIENT, EXPERT_LIKE = 65.0, 85.0
LABELS = {"provenance": ["SIMULATED", "ASSUMPTION"],
          "scorer": "lightweight expert scorer fitted on ground-truth-segmented SIMULATED expert cycles "
                    "(no trained Expert Motion Model)"}


@dataclass
class Calibration:
    """Novice/expert metric references and the lightweight expert scorer."""
    novice: dict[str, tuple[float, float]]     # metric -> (median, sd)
    expert: dict[str, tuple[float, float]]
    dists: dict[str, MetricDistribution]
    scorer: ExpertScorer
    expert_cycle_s: float
    expert_m3_per_h: float
    source: str


def _cycle_metrics(sessions: list[list[PracticeSample]], safe_only: bool) -> list[dict[str, float]]:
    """Metrics of ground-truth cycles; ``safe_only`` drops cycles that fail the safety gate."""
    rows = []
    for samples in sessions:
        arrays = to_arrays(samples)
        for c in detect_cycles(arrays.gt_phase):
            m = kinematic_metrics(arrays, c)
            if m.keys() >= set(METRICS) and not (safe_only and safety_flags(m, arrays.truck_present)):
                rows.append(m)
    return rows


def _sim_sessions(seed: int) -> tuple[list[list[PracticeSample]], list[list[PracticeSample]]] | None:
    try:
        from sentinel.sim.practice import generate_practice_session
    except ImportError:
        return None
    experts = [generate_practice_session("expert", 10, seed=seed + i, operator_id=f"CAL-EXP-{i}") for i in range(2)]
    return experts, [generate_practice_session("novice", 8, seed=seed + 7, operator_id="CAL-NOV")]


def _synthetic_sessions(seed: int) -> tuple[list[list[PracticeSample]], list[list[PracticeSample]]]:
    experts = [generate_synthetic_session("expert", 10, seed=seed + i, operator=f"CAL-EXP-{i}") for i in range(2)]
    return experts, [generate_synthetic_session("novice", 8, seed=seed + 7, operator="CAL-NOV")]


def _stats(rows: list[dict[str, float]]) -> dict[str, tuple[float, float]]:
    return {m: (float(np.median([r[m] for r in rows])), float(np.std([r[m] for r in rows]))) for m in METRICS}


@lru_cache(maxsize=4)
def calibrate(seed: int = 0) -> Calibration:
    """Reference metrics from the simulator if its experts pass the safety gate, else the synthetic generator."""
    source = "sentinel.sim.practice"
    sim = _sim_sessions(seed)
    experts, novices = sim if sim else _synthetic_sessions(seed)
    safe = _cycle_metrics(experts, safe_only=True)
    if sim is None or len(safe) < 10:
        source = "sentinel.practice.synthetic" + ("" if sim is None else " (simulator experts failed the safety gate)")
        experts, novices = _synthetic_sessions(seed)
        safe = _cycle_metrics(experts, safe_only=True)
    dists = fit_distributions(safe)
    expert = _stats(safe)
    density = EXERCISES[DEFAULT_EXERCISE]["density_t_per_m3"]
    cycle_s = float(np.median([sum(r[m] for m in PHASE_TIMES) for r in safe]))
    return Calibration(novice=_stats(_cycle_metrics(novices, safe_only=False)), expert=expert, dists=dists,
                       scorer=ExpertScorer.fit(safe, dists), expert_cycle_s=cycle_s,
                       expert_m3_per_h=3600.0 / cycle_s * expert["bucket_fill_t"][0] / density, source=source)


def _session(cal: Calibration, skill: dict[str, float], noise: np.ndarray) -> list[dict[str, float]]:
    """Per-cycle metrics for one session at the given skill levels (noise: cycles x metrics)."""
    cycles = []
    for z in noise:
        m = {}
        for j, name in enumerate(METRICS):
            s = skill[SKILL_OF_METRIC[name]]
            (nov, nov_sd), (exp, exp_sd) = cal.novice[name], cal.expert[name]
            m[name] = nov + (exp - nov) * s + z[j] * (nov_sd + (exp_sd - nov_sd) * s)
        for name in ("dig_stick_reversals", "swing_lever_reversals", "idle_gap_s", "swing_overshoot_deg",
                     "swing_near_truck_dps", "bucket_fill_t"):
            m[name] = max(m[name], 0.0)
        m["boom_swing_overlap"] = min(max(m["boom_swing_overlap"], 0.0), 1.0)
        m["cycle_time_s"] = sum(max(m[p], 0.1) for p in PHASE_TIMES)
        cycles.append(m)
    return cycles


def _targeted(cal: Calibration, cycles: list[dict[str, float]], flags: list[list[str]], n_tips: int) -> set[str]:
    """Skills targeted by the analyser's top tips for this session."""
    tips = coaching_tips(summarise(cycles), cycles, flags, cal.dists, max_tips=n_tips)
    return {t.evidence["family"] for t in tips if t.evidence.get("family") in SKILLS}


def simulate_cohort(n_trainees: int = 20, n_sessions: int = 12, coached: bool = True, seed: int = 0,
                    effect: float | None = None) -> dict[str, Any]:
    """Simulate one arm; returns per-session learning curves, milestones, safety and productivity."""
    a = COHORT_ASSUMPTIONS
    effect = a["lr_multiplier"] if effect is None else effect
    cal = calibrate(seed)
    rng = np.random.default_rng(seed)
    k = len(SKILLS)
    skill = np.clip(rng.normal(a["initial_skill"], 0.05, (n_trainees, k)), 0.0, 0.4)
    lr = rng.lognormal(np.log(a["base_learning_rate"]), a["learning_rate_spread"], n_trainees)[:, None]
    aptitude = rng.lognormal(0.0, 0.25, (n_trainees, k))
    noise = rng.standard_normal((n_sessions, n_trainees, a["cycles_per_session"], len(METRICS)))
    learn_noise = rng.normal(0.0, 0.01, (n_sessions, n_trainees, k))
    density = EXERCISES[DEFAULT_EXERCISE]["density_t_per_m3"]

    scores = np.zeros((n_sessions, n_trainees))
    fast_rate = np.zeros((n_sessions, n_trainees))
    m3h = np.zeros((n_sessions, n_trainees))
    key = {m: np.zeros((n_sessions, n_trainees)) for m in KEY_METRICS}
    for t in range(n_sessions):
        for i in range(n_trainees):
            levels = dict(zip(SKILLS, skill[i]))
            cycles = _session(cal, levels, noise[t, i])
            flags = [safety_flags(m) for m in cycles]
            scores[t, i] = session_score(cal.scorer.cycle_scores(cycles, flags), flags)
            fast_rate[t, i] = np.mean(["fast_swing_near_truck" in f for f in flags])
            summary = summarise(cycles)
            m3h[t, i] = 3600.0 / summary["cycle_time_s"] * summary["bucket_fill_t"] / density
            for m in KEY_METRICS:
                key[m][t, i] = summary[m]
            boost = np.ones(k)
            if coached:
                boost[[SKILLS.index(s) for s in _targeted(cal, cycles, flags, a["tips_acted_on"])]] = effect
            skill[i] = np.clip(skill[i] + lr[i] * aptitude[i] * boost * (1 - skill[i]) + learn_noise[t, i], 0, 0.99)

    def band(x: np.ndarray, digits: int = 2) -> dict[str, list[float]]:
        return {"mean": np.round(x.mean(axis=1), digits).tolist(),
                "p05": np.round(np.percentile(x, 5, axis=1), digits).tolist(),
                "p95": np.round(np.percentile(x, 95, axis=1), digits).tolist()}

    return {
        "arm": "coached" if coached else "control", "n_trainees": n_trainees, "n_sessions": n_sessions,
        "sessions": list(range(1, n_sessions + 1)), "score": band(scores, 1),
        "metrics": {m: band(v) for m, v in key.items()}, "m3_per_h": band(m3h, 1),
        "fast_swing_near_truck_rate": band(fast_rate, 3),
        "pct_proficient_by_session": _reached_pct(scores, PROFICIENT),
        "pct_expert_like_by_session": _reached_pct(scores, EXPERT_LIKE),
        "sessions_to_proficient": _sessions_to(scores, PROFICIENT),
        "sessions_to_expert_like": _sessions_to(scores, EXPERT_LIKE),
        "end": {"m3_per_h": round(float(m3h[-1].mean()), 1), "cycle_time_s": round(float(key["cycle_time_s"][-1].mean()), 2),
                "expert_m3_per_h": round(cal.expert_m3_per_h, 1), "expert_cycle_s": round(cal.expert_cycle_s, 2),
                "gap_pct": round(100 * (1 - float(m3h[-1].mean()) / cal.expert_m3_per_h), 1)},
    }


def _first_reach(scores: np.ndarray, threshold: float) -> np.ndarray:
    """1-based first session at or above ``threshold`` per trainee (inf if never)."""
    hit = scores >= threshold
    return np.where(hit.any(axis=0), hit.argmax(axis=0) + 1.0, np.inf)


def _reached_pct(scores: np.ndarray, threshold: float) -> list[float]:
    first = _first_reach(scores, threshold)
    return [round(100 * float(np.mean(first <= t)), 1) for t in range(1, len(scores) + 1)]


def _sessions_to(scores: np.ndarray, threshold: float) -> dict[str, Any]:
    first = _first_reach(scores, threshold)
    median = float(np.median(first))
    return {"median": None if np.isinf(median) else median, "reached_pct": round(100 * float(np.isfinite(first).mean()), 1)}


def compare_arms(n_trainees: int = 20, n_sessions: int = 12, effect: float | None = None, seed: int = 0) -> dict[str, Any]:
    """Both arms on the same simulated trainees, plus a plain-language gains summary."""
    effect = COHORT_ASSUMPTIONS["lr_multiplier"] if effect is None else effect
    coached = simulate_cohort(n_trainees, n_sessions, True, seed, effect)
    control = simulate_cohort(n_trainees, n_sessions, False, seed, effect)
    c_med, k_med = coached["sessions_to_proficient"]["median"], control["sessions_to_proficient"]["median"]
    output_gain = 100 * (coached["end"]["m3_per_h"] / control["end"]["m3_per_h"] - 1)
    when = lambda m: f"a median {m:g} sessions" if m is not None else f"more than {n_sessions} sessions"  # noqa: E731
    pct = coached["pct_proficient_by_session"][-1], control["pct_proficient_by_session"][-1]
    summary = (f"Coached trainees reach proficiency in {when(c_med)} vs {when(k_med)} with generic practice "
               f"({pct[0]:.0f}% vs {pct[1]:.0f}% proficient by session {n_sessions}); {output_gain:+.1f}% output "
               f"(m3/h) at session {n_sessions}. SIMULATED; the coaching effect is an ASSUMPTION "
               f"({effect:.2f}x learning rate on coached skills).")
    sensitivity = {}
    for name, value in zip(("low", "high"), COHORT_ASSUMPTIONS["lr_multiplier_range"]):
        arm = simulate_cohort(n_trainees, n_sessions, True, seed, value)
        sensitivity[name] = {"lr_multiplier": value, "sessions_to_proficient": arm["sessions_to_proficient"]["median"],
                             "pct_proficient_at_end": arm["pct_proficient_by_session"][-1],
                             "output_gain_pct_at_end": round(100 * (arm["end"]["m3_per_h"] / control["end"]["m3_per_h"] - 1), 1)}
    return {
        "coached": coached, "control": control, "effect_sensitivity": sensitivity,
        "gains": {"sessions_to_proficient": {"coached": c_med, "control": k_med,
                                             "saved": None if None in (c_med, k_med) else k_med - c_med},
                  "pct_proficient_at_end": {"coached": coached["pct_proficient_by_session"][-1],
                                            "control": control["pct_proficient_by_session"][-1]},
                  "output_gain_pct_at_end": round(output_gain, 1),
                  "fast_swing_rate_at_end": {"coached": coached["fast_swing_near_truck_rate"]["mean"][-1],
                                             "control": control["fast_swing_near_truck_rate"]["mean"][-1]},
                  "summary": summary},
        "assumptions": dict(COHORT_ASSUMPTIONS, lr_multiplier=effect), "calibration_source": calibrate(seed).source,
        **LABELS,
    }
