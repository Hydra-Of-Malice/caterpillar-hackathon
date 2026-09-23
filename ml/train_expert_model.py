"""Train the Expert Motion Model (practice analyser) on SIMULATED expert operators.

    .venv\\Scripts\\python -m ml.train_expert_model [--n-experts 5] [--n-cycles 12]

Data: data/sim/practice_expert.parquet and practice_trainees.parquet when present, otherwise
sessions generated with sentinel.sim.practice.generate_practice_session. Expert cycles that break
a site safety cap are excluded before training. Evaluation (all SIMULATED): leave-one-expert-out
phase accuracy and scores, and archetype separation (expert > intermediate > novice;
novice_improving rising). Output: models/expert_motion/<version>/ with model.joblib,
envelopes.json and model_card.json.
"""
from __future__ import annotations

import argparse
import inspect
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from sentinel.practice.analyser import PracticeAnalyser
from sentinel.practice.model import ExpertMotionModel, ExpertSession, fit_expert_model
from sentinel.practice.phases import detect_cycles, phase_accuracy
from sentinel.practice.settings import DEFAULT_EXERCISE, MODEL_KIND, TRAINING_PROVENANCE
from sentinel.practice.signals import to_arrays
from sentinel.shared.config import DATA_DIR, MODELS_DIR
from sentinel.shared.schemas import PracticeSample

SIM_DIR = DATA_DIR / "sim"
TRAINEE_ARCHETYPES = ("intermediate", "novice", "novice_improving")
SEPARATION_MARGIN = 10.0          # score points required between adjacent archetypes
TraineeSession = tuple[str, list[PracticeSample]]   # (archetype, samples)
LIMITS = [
    "Trained and evaluated on SIMULATED expert operators only; no real operator data.",
    "Envelopes coach bounds and smoothness, never speed; expert-likeness is not a competency assessment.",
    "Safety caps are site rules (config/fusion.yaml fast_swing_near_truck + overshoot proxy), not learned.",
    "Productivity and fuel figures are ESTIMATES (generic bucket, density and fuel assumptions).",
    "Assumes 10 Hz input with the PracticeSample signals; other rates are rejected.",
]


# ---------------------------------------------------------------- data loading
def _first(columns: pd.Index, names: tuple[str, ...]) -> str | None:
    return next((n for n in names if n in columns), None)


def sessions_from_frame(df: pd.DataFrame) -> list[tuple[str, str, str, list[PracticeSample]]]:
    """(operator_id, archetype, exercise, samples) per session from a flat practice parquet frame."""
    op_col = _first(df.columns, ("operator_id", "expert_id", "trainee_id", "operator"))
    sess_col = _first(df.columns, ("session_id", "session", "seed")) or op_col
    phase_col = _first(df.columns, ("gt_phase", "phase"))
    if op_col is None or (phase_col is None and "gt" not in df.columns):
        raise ValueError(f"practice parquet needs an operator column and gt phase labels; got {list(df.columns)}")
    fields = [f for f in PracticeSample.model_fields if f != "gt" and f in df.columns]
    out = []
    for (op, _), g in df.sort_values("ts").groupby([op_col, sess_col], sort=False):
        arch = str(g["archetype"].iloc[0]) if "archetype" in g else ""
        exercise = str(g["exercise"].iloc[0]) if "exercise" in g else DEFAULT_EXERCISE
        samples = []
        for rec in g.to_dict("records"):
            gt = rec["gt"] if "gt" in rec and isinstance(rec["gt"], dict) else {
                "phase": rec[phase_col], "cycle": rec.get("gt_cycle", rec.get("cycle")), "archetype": arch}
            vals = {f: (None if f == "bucket_to_truck_m" and pd.isna(rec[f]) else rec[f]) for f in fields}
            samples.append(PracticeSample(**vals, gt=gt))
        out.append((str(op), arch or str(samples[0].gt.get("archetype", "")), exercise, samples))
    return out


def _generate(archetype: str, n_cycles: int, seed: int, exercise: str, operator_id: str) -> list[PracticeSample]:
    from sentinel.sim.practice import generate_practice_session
    kwargs = {"operator_id": operator_id} if "operator_id" in inspect.signature(generate_practice_session).parameters else {}
    return generate_practice_session(archetype, n_cycles, seed=seed, exercise=exercise, **kwargs)


def load_expert_sessions(n_experts: int, n_cycles: int, exercise: str = DEFAULT_EXERCISE) -> tuple[list[ExpertSession], str]:
    """Expert sessions from the parquet dataset, else from the simulator. Returns (sessions, source)."""
    path = SIM_DIR / "practice_expert.parquet"
    if path.exists():
        rows = sessions_from_frame(pd.read_parquet(path))
        return [ExpertSession.from_samples(op, ex, smp) for op, _, ex, smp in rows], str(path)
    sessions = [ExpertSession.from_samples(f"EXP-{i:02d}", exercise,
                                           _generate("expert", n_cycles, 1000 + i, exercise, f"EXP-{i:02d}"))
                for i in range(1, n_experts + 1)]
    return sessions, "sentinel.sim.practice.generate_practice_session"


def load_trainee_sessions(n_seeds: int, n_cycles: int, exercise: str = DEFAULT_EXERCISE) -> list[TraineeSession]:
    """Held-out trainee sessions per archetype (parquet if present, else the simulator)."""
    path = SIM_DIR / "practice_trainees.parquet"
    if path.exists():
        return [(arch, smp) for _, arch, _, smp in sessions_from_frame(pd.read_parquet(path))]
    return [(arch, _generate(arch, n_cycles, 2000 + k, exercise, f"TRN-{arch}-{k}"))
            for arch in TRAINEE_ARCHETYPES for k in range(n_seeds)]


# ---------------------------------------------------------------- evaluation
def _phase_eval(model: ExpertMotionModel, samples: list[PracticeSample]) -> dict[str, float]:
    arrays = to_arrays(samples)
    smooth = model.phase_model.predict(arrays)
    return {"raw": phase_accuracy(model.phase_model.predict_raw(arrays), arrays.gt_phase),
            "smoothed": phase_accuracy(smooth, arrays.gt_phase),
            "cycles_detected": len(detect_cycles(smooth)), "cycles_gt": len(detect_cycles(arrays.gt_phase))}


def _mean(values: list[float]) -> float:
    return round(float(np.mean(values)), 3) if values else float("nan")


def leave_one_expert_out(sessions: list[ExpertSession], seed: int = 0) -> dict[str, Any]:
    """Fit without each expert in turn; score and segment that expert's sessions."""
    per_expert = {}
    for op in sorted({s.operator_id for s in sessions}):
        train = [s for s in sessions if s.operator_id != op]
        model = fit_expert_model(train, version=f"loeo-{op}", seed=seed, min_experts=2)
        analyser = PracticeAnalyser(model)
        held = [s for s in sessions if s.operator_id == op]
        phase = [_phase_eval(model, s.samples) for s in held]
        reports = [analyser.analyse(s.samples, s.exercise, op, f"loeo-{op}") for s in held]
        cycle_scores = [c.expert_likeness for r in reports for c in r.cycles]
        per_expert[op] = {"phase_acc_raw": _mean([p["raw"] for p in phase]),
                          "phase_acc_smoothed": _mean([p["smoothed"] for p in phase]),
                          "cycles_detected": sum(p["cycles_detected"] for p in phase),
                          "cycles_gt": sum(p["cycles_gt"] for p in phase),
                          "session_score": _mean([r.overall_score for r in reports]),
                          "cycle_score_median": round(float(np.median(cycle_scores)), 1),
                          "flagged_cycles": sum(bool(c.safety_flags) for r in reports for c in r.cycles)}
    vals = list(per_expert.values())
    return {"per_expert": per_expert, "phase_acc_smoothed": _mean([v["phase_acc_smoothed"] for v in vals]),
            "phase_acc_raw": _mean([v["phase_acc_raw"] for v in vals]),
            "session_score_mean": _mean([v["session_score"] for v in vals])}


def archetype_eval(model: ExpertMotionModel, trainees: list[TraineeSession]) -> dict[str, Any]:
    """Scores and phase accuracy per trainee archetype, plus the improvement trend of novice_improving."""
    analyser = PracticeAnalyser(model)
    out: dict[str, Any] = {}
    for arch in sorted({a for a, _ in trainees}):
        runs = [(s, analyser.analyse(s, DEFAULT_EXERCISE, f"eval-{arch}", f"eval-{arch}-{i}"))
                for i, (a, s) in enumerate(trainees) if a == arch]
        phase = [_phase_eval(model, s) for s, _ in runs]
        entry = {"n_sessions": len(runs), "session_score_mean": _mean([r.overall_score for _, r in runs]),
                 "phase_acc_smoothed": _mean([p["smoothed"] for p in phase]),
                 "cycles_detected": sum(p["cycles_detected"] for p in phase),
                 "cycles_gt": sum(p["cycles_gt"] for p in phase),
                 "flagged_cycle_frac": _mean([float(bool(c.safety_flags)) for _, r in runs for c in r.cycles]),
                 "gap_pct_mean": _mean([r.productivity["gap_pct"] for _, r in runs])}
        if arch == "novice_improving":
            idx = [c.cycle_index for _, r in runs for c in r.cycles]
            scores = [c.expert_likeness for _, r in runs for c in r.cycles]
            halves = [[c.expert_likeness for c in r.cycles[: len(r.cycles) // 2]] for _, r in runs], \
                     [[c.expert_likeness for c in r.cycles[len(r.cycles) // 2:]] for _, r in runs]
            entry |= {"spearman_cycle_vs_score": round(float(spearmanr(idx, scores).statistic), 3),
                      "first_half_mean": _mean(sum(halves[0], [])), "second_half_mean": _mean(sum(halves[1], []))}
        out[arch] = entry
    return out


def separation_checks(expert_score: float, arche: dict[str, Any]) -> dict[str, bool]:
    """expert > intermediate > novice by SEPARATION_MARGIN, and novice_improving rising."""
    get = lambda a: arche.get(a, {}).get("session_score_mean", float("nan"))  # noqa: E731
    imp = arche.get("novice_improving", {})
    return {"expert_gt_intermediate": expert_score - get("intermediate") >= SEPARATION_MARGIN,
            "intermediate_gt_novice": get("intermediate") - get("novice") >= SEPARATION_MARGIN,
            "novice_improving_rises": imp.get("spearman_cycle_vs_score", 0.0) > 0.3
            and imp.get("second_half_mean", 0.0) > imp.get("first_half_mean", 0.0)}


# ---------------------------------------------------------------- orchestration
def train(experts: list[ExpertSession], trainees: list[TraineeSession], version: str, out_root: Path,
          source: str, seed: int = 0) -> dict[str, Any]:
    """Fit on all experts, evaluate (LOEO + archetypes), save, and return the model card."""
    model = fit_expert_model(experts, version=version, seed=seed)
    loeo = leave_one_expert_out(experts, seed=seed)
    arche = archetype_eval(model, trainees)
    model.card |= {
        "created_at": datetime.now(timezone.utc).isoformat(), "data_source": source,
        "evaluation": {"label": "SIMULATED", "leave_one_expert_out": loeo, "archetypes": arche,
                       "separation": separation_checks(loeo["session_score_mean"], arche),
                       "separation_margin": SEPARATION_MARGIN},
        "limits": LIMITS, "provenance": TRAINING_PROVENANCE,
    }
    out = model.save(out_root)
    return json.loads((out / "model_card.json").read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> dict[str, Any]:
    """CLI entry point (also called by ml.train_all)."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--n-experts", type=int, default=5)
    ap.add_argument("--n-cycles", type=int, default=12)
    ap.add_argument("--n-trainee-seeds", type=int, default=4)
    ap.add_argument("--out", type=Path, default=MODELS_DIR / MODEL_KIND)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(argv)
    experts, source = load_expert_sessions(args.n_experts, args.n_cycles)
    trainees = load_trainee_sessions(args.n_trainee_seeds, 8)
    version = f"emm-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"
    card = train(experts, trainees, version, args.out, source, seed=args.seed)
    ev = card["evaluation"]
    print(json.dumps({"version": version, "training_data": card["training_data"],
                      "loeo": {k: v for k, v in ev["leave_one_expert_out"].items() if k != "per_expert"},
                      "archetypes": ev["archetypes"], "separation": ev["separation"]}, indent=2))
    return card


if __name__ == "__main__":
    main()
