"""PracticeAnalyser: scores trainee control inputs against the Expert Motion Model.

``analyse`` produces a full PracticeReport (cycles, phases, metrics vs the expert band, a
safety-gated expert-likeness score, ranked coaching tips and trajectory overlays).
``live_step`` gives per-sample phase + envelope deviation + an occasional, rate-limited hint,
meant for simulator / practice-machine sessions (not in-cab during production work).
The expert reference is SIMULATED in the prototype.
"""
from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from sentinel.practice.envelope import PhaseEnvelope
from sentinel.practice.feedback import coaching_tips
from sentinel.practice.metrics import (
    envelope_details, kinematic_metrics, phase_table, safety_flags, summarise,
)
from sentinel.practice.model import ExerciseModel, ExpertMotionModel
from sentinel.practice.phases import detect_cycles, window_features
from sentinel.practice.productivity import fuel_l, productivity, tip_impact
from sentinel.practice.scorer import score_band, session_score
from sentinel.practice.settings import (
    ALL_PHASES, BASE_CHANNELS, CHANNEL_LABELS, CHANNEL_UNITS, ENVELOPE_CHANNELS, LIVE_BUFFER,
    LIVE_HINT_MIN_INTERVAL_S, LIVE_HINT_REPEAT_S, LIVE_SUSTAIN_S, MISSING_TRUCK_M, N_POINTS, NEAR_TRUCK_M,
    SAFETY_CAPS, SAFETY_FLAG_TEXT, SAFETY_FLAGS, TRAINING_PROVENANCE, WORK_PHASES,
)
from sentinel.practice.signals import SessionArrays, to_arrays
from sentinel.shared.schemas import (
    PracticeCycleReport, PracticeReport, PracticeSample, Provenance,
)

RATE_TOLERANCE = 0.25
log = logging.getLogger(__name__)


class NoCyclesError(ValueError):
    """The session holds no complete dig -> swing -> dump -> return cycle."""


@dataclass
class _LiveState:
    exercise: str
    rows: deque = field(default_factory=lambda: deque(maxlen=LIVE_BUFFER))
    ts: deque = field(default_factory=lambda: deque(maxlen=LIVE_BUFFER))
    log_alpha: np.ndarray | None = None
    phase: int = -1
    phase_start: float = 0.0
    last_hint_ts: float = float("-inf")
    last_hint: str | None = None
    since: dict[str, float] = field(default_factory=dict)


class PracticeAnalyser:
    """Stateless offline analysis plus per-session live state."""

    def __init__(self, model: ExpertMotionModel) -> None:
        self.model = model
        self._live: dict[str, _LiveState] = {}

    @classmethod
    def load(cls, models_dir: Path | None = None) -> "PracticeAnalyser":
        """Load the latest expert motion model (default: models/expert_motion/)."""
        return cls(ExpertMotionModel.load(models_dir))

    # ------------------------------------------------------------ offline
    def analyse(self, samples: list[PracticeSample], exercise: str, trainee_id: str, session_id: str) -> PracticeReport:
        """Segment, measure, score and coach one practice session."""
        arrays = to_arrays(samples)
        self._check_rate(arrays)
        ex_name, ex = self.model.exercise_model(exercise)
        cycles = detect_cycles(self.model.phase_model.predict(arrays))
        if not cycles:
            raise NoCyclesError("no complete work cycle detected (dig -> swing -> dump -> return)")
        cycle_metrics, cycle_flags, details = [], [], []
        for c in cycles:
            m = kinematic_metrics(arrays, c)
            m["envelope_exit_frac"], det = envelope_details(arrays, c, ex.envelopes)
            cycle_metrics.append(m)
            cycle_flags.append(safety_flags(m, arrays.truck_present))
            details.append(det)
        scores = ex.scorer.cycle_scores(cycle_metrics, cycle_flags)
        cycle_reports = [PracticeCycleReport(
            cycle_index=c.index, t_start=float(arrays.ts[c.i0]), t_end=float(arrays.ts[c.i1 - 1] + arrays.dt),
            phases=phase_table(arrays, c), metrics=[ex.dists[k].cycle_metric(v) for k, v in m.items() if k in ex.dists],
            expert_likeness=round(score, 1), safety_flags=flags)
            for c, m, flags, score in zip(cycles, cycle_metrics, cycle_flags, scores)]
        overall = session_score([c.expert_likeness for c in cycle_reports], cycle_flags)
        summary = summarise(cycle_metrics)
        overlay = _overlay(ex, details, ex_name, exercise)
        prod = productivity(summary, [fuel_l(arrays, c) for c in cycles], ex.dists, ex.productivity_ref, ex_name)
        tips = coaching_tips(summary, cycle_metrics, cycle_flags, ex.dists, overlay["worst"])
        for tip in tips:
            tip.evidence |= tip_impact(tip.metric, summary, ex.dists, prod)
        return PracticeReport(
            session_id=session_id, trainee_id=trainee_id, exercise=exercise, n_cycles=len(cycles),
            overall_score=round(overall, 1), score_band=score_band(overall), cycles=cycle_reports,
            summary_metrics=[ex.dists[k].cycle_metric(v) for k, v in summary.items() if k in ex.dists],
            tips=tips, trajectory_overlay=overlay, productivity=prod,
            model_version=self.model.version, provenance=[Provenance.ML, Provenance.SIMULATED])

    def _check_rate(self, arrays: SessionArrays) -> None:
        expected = 1.0 / self.model.phase_model.sample_hz
        if arrays.n > 1 and abs(arrays.dt - expected) > RATE_TOLERANCE * expected:
            raise ValueError(f"sample interval {arrays.dt:.3f}s differs from the model's {expected:.3f}s")

    # ------------------------------------------------------------ live
    def live_step(self, session_id: str, sample: PracticeSample, exercise: str | None = None) -> dict[str, Any]:
        """Online phase, per-channel z vs the expert envelope at the current phase time, optional hint.

        ``exercise`` is only read when the session's live state is first created.
        """
        st = self._live.get(session_id)
        if st is None:
            st = self._live[session_id] = _LiveState(exercise=self.model.exercise_model(exercise or "")[0])
        pm = self.model.phase_model
        st.rows.append([_value(sample, c) for c in BASE_CHANNELS])
        st.ts.append(sample.ts)
        feats = window_features(np.asarray(st.rows, dtype=float), np.asarray(st.ts, dtype=float))[-1:]
        st.log_alpha = pm.filter_step(st.log_alpha, pm.proba_features(feats)[0])
        phase_i = int(np.argmax(st.log_alpha))
        if phase_i != st.phase:
            st.phase, st.phase_start = phase_i, sample.ts
        phase = ALL_PHASES[phase_i]
        ex = self.model.exercises[st.exercise]
        env = ex.envelopes.get(phase)
        tau = min((sample.ts - st.phase_start) / env.duration_s["p50"], 1.0) if env else 0.0
        deviation = {ch: round(env.z_at(ch, getattr(sample, ch), tau), 2) for ch in ENVELOPE_CHANNELS} if env else {}
        return {"session_id": session_id, "ts": sample.ts, "phase": phase,
                "phase_confidence": round(float(np.exp(st.log_alpha[phase_i])), 3), "tau": round(tau, 3),
                "deviation": deviation, "hint": self._hint(st, ex, sample, phase, deviation)}

    def end_live(self, session_id: str) -> None:
        """Drop the live state of a finished session."""
        self._live.pop(session_id, None)

    def _hint(self, st: _LiveState, ex: ExerciseModel, sample: PracticeSample, phase: str,
              deviation: dict[str, float]) -> str | None:
        """Short coaching hint, at most one per LIVE_HINT_MIN_INTERVAL_S of sample time."""
        near = sample.bucket_to_truck_m is not None and sample.bucket_to_truck_m < NEAR_TRUCK_M
        near_limit = ex.dists["swing_near_truck_dps"].p90 if "swing_near_truck_dps" in ex.dists \
            else SAFETY_CAPS["swing_near_truck_dps"]
        worst = max(deviation, key=lambda ch: abs(deviation[ch])) if deviation else None
        conditions = [
            ("near_truck", near and abs(sample.swing_dps) > near_limit, 0.0, "Ease the swing: truck is close"),
            ("boom_overlap", phase == "swing_loaded" and deviation.get("joy_boom", 0.0) < -2.0, LIVE_SUSTAIN_S,
             "Raise the boom as you swing"),
            ("envelope", worst is not None and abs(deviation[worst]) > 3.0, LIVE_SUSTAIN_S,
             f"Smoother on the {CHANNEL_LABELS.get(worst, 'levers')}"),
        ]
        hint = None
        for key, active, sustain, text in conditions:
            if not active:
                st.since.pop(key, None)
                continue
            start = st.since.setdefault(key, sample.ts)
            if hint is None and sample.ts - start >= sustain:
                hint = text
        if hint is None or sample.ts - st.last_hint_ts < LIVE_HINT_MIN_INTERVAL_S:
            return None
        if hint == st.last_hint and sample.ts - st.last_hint_ts < LIVE_HINT_REPEAT_S:
            return None
        st.last_hint, st.last_hint_ts = hint, sample.ts
        return hint


def _value(sample: PracticeSample, channel: str) -> float:
    value = getattr(sample, channel)
    return MISSING_TRUCK_M if value is None else float(value)


def _overlay(ex: ExerciseModel, details: list[dict[str, dict[str, Any]]], ex_name: str, exercise: str) -> dict[str, Any]:
    """Expert band + trainee mean curve per phase x channel on normalised time, plus DTW."""
    phases: dict[str, Any] = {}
    worst: dict[str, Any] | None = None
    for phase in WORK_PHASES:
        env: PhaseEnvelope | None = ex.envelopes.get(phase)
        dets = [d[phase] for d in details if phase in d]
        if env is None or not dets:
            continue
        channels = {}
        for ch in ENVELOPE_CHANNELS:
            exit_frac = float(np.mean([d["exit"][ch] for d in dets]))
            band = env.bands[ch]
            channels[ch] = {
                "label": CHANNEL_LABELS[ch], "unit": CHANNEL_UNITS[ch],
                "expert_p10": np.round(band["p10"], 3).tolist(), "expert_p50": np.round(band["p50"], 3).tolist(),
                "expert_p90": np.round(band["p90"], 3).tolist(),
                "trainee_mean": np.round(np.mean([d["curves"][ch] for d in dets], axis=0), 3).tolist(),
                "exit_frac": round(exit_frac, 3)}
            if worst is None or exit_frac > worst["exit_frac"]:
                worst = {"phase": phase, "channel": ch, "exit_frac": exit_frac}
        phases[phase] = {
            "channels": channels, "n_trainee_cycles": len(dets), "n_expert_cycles": env.n_cycles,
            "expert_duration_s": {k: round(v, 2) for k, v in env.duration_s.items()},
            "dtw": {"trainee": round(float(np.mean([d["dtw"] for d in dets])), 3),
                    "expert_p50": round(env.dtw_ref["p50"], 3), "expert_p90": round(env.dtw_ref["p90"], 3)}}
    return {
        "time_axis": "normalised phase time 0..1", "n_points": N_POINTS,
        "expert_reference": TRAINING_PROVENANCE, "reference_exercise": ex_name,
        "reference_fallback": ex_name != exercise,
        "label": "Expert band = P10-P90 of SIMULATED, safety-filtered expert cycles; trainee = mean of your cycles",
        "safety_caps": {SAFETY_FLAGS[k]: {"cap": v, "text": SAFETY_FLAG_TEXT[SAFETY_FLAGS[k]].format(cap=v)}
                        for k, v in SAFETY_CAPS.items()},
        "phases": phases, "worst": worst,
    }
