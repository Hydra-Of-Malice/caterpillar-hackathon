"""The Expert Motion Model (EMM): fitting from expert sessions, saving and loading.

Training data in the prototype are SIMULATED expert operators. Before anything is learned,
every expert cycle that breaks a site safety cap is excluded (fast is not automatically good).
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from sentinel.practice.envelope import PhaseEnvelope, build_phase_envelope, phase_curves
from sentinel.practice.metrics import (
    MetricDistribution, envelope_details, fit_distributions, kinematic_metrics, safety_flags,
)
from sentinel.practice.phases import FEATURE_NAMES, Cycle, PhaseModel, detect_cycles
from sentinel.practice.productivity import expert_reference, fuel_l
from sentinel.practice.scorer import ExpertScorer
from sentinel.practice.settings import (
    ALL_PHASES, DEFAULT_EXERCISE, MIN_EXPERT_CYCLES, MIN_EXPERTS, MODEL_KIND, NEAR_TRUCK_RULE, PRACTICE_CONFIG_VERSION,
    SAFETY_CAPS, SAFETY_SCORE_CAP, TRAINING_PROVENANCE, WORK_PHASES,
)
from sentinel.practice.signals import PHASE_INDEX, SessionArrays, to_arrays
from sentinel.shared.config import MODELS_DIR
from sentinel.shared.schemas import PracticeSample

MODEL_FILE = "model.joblib"
MIN_SAFE_CYCLES = 10


@dataclass
class ExpertSession:
    """One labelled expert practice session (SIMULATED)."""
    operator_id: str
    exercise: str
    arrays: SessionArrays
    samples: list[PracticeSample]

    @classmethod
    def from_samples(cls, operator_id: str, exercise: str, samples: list[PracticeSample]) -> "ExpertSession":
        arrays = to_arrays(samples)
        if arrays.gt_phase is None:
            raise ValueError(f"expert session for {operator_id} has no ground-truth phase labels")
        return cls(operator_id=operator_id, exercise=exercise, arrays=arrays, samples=samples)


@dataclass
class ExerciseModel:
    """Everything learned for one exercise (context)."""
    envelopes: dict[str, PhaseEnvelope]
    dists: dict[str, MetricDistribution]
    scorer: ExpertScorer
    n_experts: int
    n_cycles: int
    productivity_ref: dict[str, float]
    n_gate_dropped: int = 0


@dataclass
class ExpertMotionModel:
    """Phase model (shared) + per-exercise envelopes, metric distributions and scorer."""
    version: str
    phase_model: PhaseModel
    exercises: dict[str, ExerciseModel]
    card: dict[str, Any] = field(default_factory=dict)

    def exercise_model(self, exercise: str) -> tuple[str, ExerciseModel]:
        """Model for ``exercise``, falling back to the default (or first) trained exercise."""
        if exercise in self.exercises:
            return exercise, self.exercises[exercise]
        name = DEFAULT_EXERCISE if DEFAULT_EXERCISE in self.exercises else next(iter(self.exercises))
        return name, self.exercises[name]

    def envelopes_json(self) -> dict[str, Any]:
        return {"model_version": self.version, "provenance": TRAINING_PROVENANCE,
                "exercises": {ex: {ph: env.to_json() for ph, env in em.envelopes.items()}
                              for ex, em in self.exercises.items()}}

    def save(self, root: Path | None = None) -> Path:
        """Write models/expert_motion/<version>/ with model.joblib, envelopes.json and model_card.json."""
        out = (root or MODELS_DIR / MODEL_KIND) / self.version
        out.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, out / MODEL_FILE)
        (out / "envelopes.json").write_text(json.dumps(self.envelopes_json()), encoding="utf-8")
        card = dict(self.card, sha256=hashlib.sha256((out / MODEL_FILE).read_bytes()).hexdigest())
        (out / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
        return out

    @classmethod
    def load(cls, models_dir: Path | None = None) -> "ExpertMotionModel":
        """Load a version dir, or the latest version under a kind dir or the models root."""
        path = Path(models_dir) if models_dir else MODELS_DIR / MODEL_KIND
        if not (path / MODEL_FILE).exists():
            kind_dir = path / MODEL_KIND if (path / MODEL_KIND).is_dir() else path
            versions = sorted(p for p in kind_dir.glob("*") if (p / MODEL_FILE).exists()) if kind_dir.is_dir() else []
            if not versions:
                raise FileNotFoundError(f"no expert motion model under {path}; run: python -m ml.train_expert_model")
            path = versions[-1]
        model = joblib.load(path / MODEL_FILE)
        if not isinstance(model, cls):
            raise TypeError(f"{path / MODEL_FILE} is not an ExpertMotionModel")
        return model


# ---------------------------------------------------------------- fitting
def _gt_cycles(session: ExpertSession) -> list[tuple[Cycle, list[str]]]:
    """Ground-truth cycles with their safety flags."""
    arrays = session.arrays
    return [(c, safety_flags(kinematic_metrics(arrays, c), arrays.truck_present))
            for c in detect_cycles(arrays.gt_phase)]


def _training_mask(arrays: SessionArrays, excluded: list[Cycle]) -> np.ndarray:
    mask = np.ones(arrays.n, dtype=bool)
    for c in excluded:
        mask[c.i0:c.i1] = False
    return mask


def _envelopes(sessions: list[ExpertSession], safe: dict[int, list[Cycle]]) -> dict[str, PhaseEnvelope]:
    out: dict[str, PhaseEnvelope] = {}
    for phase in WORK_PHASES:
        curves, durations, operators = [], [], []
        for i, s in enumerate(sessions):
            for c in safe[i]:
                idx = c.phase_idx(PHASE_INDEX[phase])
                if len(idx):
                    curves.append(phase_curves(s.arrays, idx))
                    durations.append(len(idx) * s.arrays.dt)
                    operators.append(s.operator_id)
        if curves:
            out[phase] = build_phase_envelope(curves, durations, operators)
    return out


@dataclass
class ExpertCycles:
    """Safe expert cycles as the analyser sees them (predicted segmentation)."""
    metrics: list[dict[str, float]] = field(default_factory=list)
    fuel_l: list[float] = field(default_factory=list)
    dropped: int = 0


def expert_cycle_metrics(phase_model: PhaseModel, envelopes: dict[str, PhaseEnvelope],
                         sessions: list[ExpertSession]) -> ExpertCycles:
    """Metrics and fuel of expert cycles; cycles failing the safety gate are counted and dropped."""
    out = ExpertCycles()
    for s in sessions:
        for c in detect_cycles(phase_model.predict(s.arrays)):
            m = kinematic_metrics(s.arrays, c)
            m["envelope_exit_frac"] = envelope_details(s.arrays, c, envelopes)[0]
            if safety_flags(m, s.arrays.truck_present):
                out.dropped += 1
            else:
                out.metrics.append(m)
                out.fuel_l.append(fuel_l(s.arrays, c))
    return out


def fit_expert_model(sessions: list[ExpertSession], version: str, seed: int = 0,
                     min_experts: int = MIN_EXPERTS) -> ExpertMotionModel:
    """Fit the full EMM on labelled expert sessions (>= ``min_experts`` distinct operators).

    ``min_experts`` is lowered only for leave-one-expert-out evaluation folds.
    """
    operators = {s.operator_id for s in sessions}
    if len(operators) < min_experts:
        raise ValueError(f"need >= {min_experts} expert operators, got {len(operators)}")
    gt = [_gt_cycles(s) for s in sessions]
    safe = {i: [c for c, flags in cycles if not flags] for i, cycles in enumerate(gt)}
    reasons = Counter(f for cycles in gt for _, flags in cycles for f in flags)
    n_excluded = sum(bool(flags) for cycles in gt for _, flags in cycles)
    n_safe = sum(len(c) for c in safe.values())
    if n_safe < MIN_SAFE_CYCLES:
        raise ValueError(f"only {n_safe} of {n_safe + n_excluded} expert cycles pass the safety gate "
                         f"({dict(reasons)}); the expert data breaks the site rules, so no model is trained")
    masks = [_training_mask(s.arrays, [c for c, flags in cycles if flags]) for s, cycles in zip(sessions, gt)]
    phase_model = PhaseModel.fit([s.arrays for s in sessions], masks, seed=seed)

    exercises: dict[str, ExerciseModel] = {}
    for exercise in sorted({s.exercise for s in sessions}):
        idx = [i for i, s in enumerate(sessions) if s.exercise == exercise]
        subset = [sessions[i] for i in idx]
        envelopes = _envelopes(subset, {j: safe[i] for j, i in enumerate(idx)})
        cycles = expert_cycle_metrics(phase_model, envelopes, subset)
        dists = fit_distributions(cycles.metrics)
        ref = expert_reference([m["cycle_time_s"] for m in cycles.metrics],
                               [m["bucket_fill_t"] for m in cycles.metrics], cycles.fuel_l, exercise)
        exercises[exercise] = ExerciseModel(
            envelopes=envelopes, dists=dists, scorer=ExpertScorer.fit(cycles.metrics, dists, seed=seed),
            n_experts=len({s.operator_id for s in subset}), n_cycles=len(cycles.metrics),
            productivity_ref=ref, n_gate_dropped=cycles.dropped)

    n_cycles = sum(len(c) for c in gt)
    card = {
        "kind": MODEL_KIND, "version": version, "config_version": PRACTICE_CONFIG_VERSION,
        "training_data": {
            "provenance": TRAINING_PROVENANCE, "simulated": True, "n_experts": len(operators),
            "experts": sorted(operators), "n_sessions": len(sessions), "n_cycles_total": n_cycles,
            "n_cycles_excluded_safety": n_excluded, "exclusion_reasons": dict(reasons),
            "selection_rule": "expert archetype only; cycles breaking a site safety cap excluded before training",
        },
        "phase_model": {"classifier": "LightGBM multiclass + HMM (Viterbi) smoothing + min phase duration",
                        "features": FEATURE_NAMES, "phases": list(ALL_PHASES)},
        "safety_gate": {"near_truck_rule": NEAR_TRUCK_RULE, "caps": SAFETY_CAPS,
                        "flagged_cycle_score_cap": SAFETY_SCORE_CAP},
        "exercises": {ex: {"n_experts": em.n_experts, "n_cycles_used": em.n_cycles,
                           "n_detected_cycles_dropped_by_safety_gate": em.n_gate_dropped,
                           "meets_min_support": em.n_experts >= MIN_EXPERTS and em.n_cycles >= MIN_EXPERT_CYCLES,
                           "metrics": {k: d.to_json() for k, d in em.dists.items()},
                           "productivity_ref": {k: round(v, 3) for k, v in em.productivity_ref.items()},
                           "scorer_components": int(em.scorer.gmm.n_components)}
                      for ex, em in exercises.items()},
    }
    return ExpertMotionModel(version=version, phase_model=phase_model, exercises=exercises, card=card)
