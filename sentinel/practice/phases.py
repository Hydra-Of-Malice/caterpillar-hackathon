"""Work-cycle phase segmentation and cycle detection.

A LightGBM classifier on short causal rolling-window features predicts the phase of each
sample (dig / swing_loaded / dump / swing_empty / idle). Offline, the per-sample posteriors are
smoothed with HMM (Viterbi) decoding over a cyclic transition matrix plus a minimum phase
duration. Live, the same classifier feeds an HMM forward filter. Trained on SIMULATED expert
phase labels.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from lightgbm import LGBMClassifier

from sentinel.practice.settings import (
    ALL_PHASES, BASE_CHANNELS, HMM_STAY_P, MIN_PHASE_S, SAMPLE_HZ, WORK_PHASES,
)
from sentinel.practice.signals import IDLE, PHASE_INDEX, SessionArrays

K = len(ALL_PHASES)
DIG, SWING_LOADED, DUMP, SWING_EMPTY = (PHASE_INDEX[p] for p in WORK_PHASES)

DERIV_CHANNELS = ("joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps",
                  "boom_angle_deg", "stick_angle_deg", "bucket_angle_deg", "payload_t")
ROLL_CHANNELS = ("joy_swing", "joy_boom", "joy_stick", "joy_bucket", "swing_dps")
DERIV_LAG = 3      # samples (0.3 s at 10 Hz)
ROLL_WIN = 10      # samples (1 s at 10 Hz)
FEATURE_NAMES: list[str] = (
    list(BASE_CHANNELS)
    + [f"d_{c}" for c in DERIV_CHANNELS]
    + [f"mean1s_{c}" for c in ROLL_CHANNELS]
    + [f"std1s_{c}" for c in ROLL_CHANNELS]
    + ["payload_change_1s"]
)
_COL = {c: i for i, c in enumerate(BASE_CHANNELS)}
_SWING_COLS = [_COL[c] for c in ("joy_swing", "swing_dps", "swing_angle_deg")]


def window_features(x: np.ndarray, ts: np.ndarray) -> np.ndarray:
    """Causal rolling-window features for every row of ``x`` (n x len(BASE_CHANNELS)).

    Swing channels enter as magnitudes, so "loaded" vs "empty" must come from payload rather
    than from swing direction (a novice's corrective swing back is still a loaded swing), and
    the model does not depend on which side the truck is on. Only past samples are used, so the
    last row computed on a short live buffer equals the offline value once the buffer holds
    ROLL_WIN + 1 samples.
    """
    x = x.copy()
    x[:, _SWING_COLS] = np.abs(x[:, _SWING_COLS])
    n = len(x)
    idx = np.arange(n)
    lag = np.maximum(idx - DERIV_LAG, 0)
    dt = np.maximum(ts - ts[lag], 1e-3)
    deriv_cols = [_COL[c] for c in DERIV_CHANNELS]
    deriv = (x[:, deriv_cols] - x[lag][:, deriv_cols]) / dt[:, None]
    deriv[idx == lag] = 0.0

    roll = x[:, [_COL[c] for c in ROLL_CHANNELS]]
    csum = np.vstack([np.zeros(roll.shape[1]), np.cumsum(roll, axis=0)])
    csq = np.vstack([np.zeros(roll.shape[1]), np.cumsum(roll ** 2, axis=0)])
    start = np.maximum(idx + 1 - ROLL_WIN, 0)
    count = (idx + 1 - start)[:, None]
    mean = (csum[idx + 1] - csum[start]) / count
    var = np.maximum((csq[idx + 1] - csq[start]) / count - mean ** 2, 0.0)

    payload = x[:, _COL["payload_t"]]
    payload_change = payload - payload[np.maximum(idx - ROLL_WIN, 0)]
    return np.column_stack([x, deriv, mean, np.sqrt(var), payload_change])


def _transition_matrix(stay: float = HMM_STAY_P) -> np.ndarray:
    """Cyclic dig -> swing_loaded -> dump -> swing_empty -> dig, any phase <-> idle, rare skips."""
    move = 1.0 - stay
    trans = np.full((K, K), 1e-4)
    cycle = [DIG, SWING_LOADED, DUMP, SWING_EMPTY]
    for i, ph in enumerate(cycle):
        trans[ph, cycle[(i + 1) % 4]] = move * 0.7
        trans[ph, IDLE] = move * 0.3
    trans[IDLE, cycle] = move / 4
    np.fill_diagonal(trans, stay)
    return trans / trans.sum(axis=1, keepdims=True)


def _logsumexp(a: np.ndarray, axis: int) -> np.ndarray:
    m = np.max(a, axis=axis, keepdims=True)
    return np.squeeze(m, axis=axis) + np.log(np.sum(np.exp(a - m), axis=axis))


def viterbi(log_emis: np.ndarray, log_trans: np.ndarray) -> np.ndarray:
    """Most likely phase path given per-sample log posteriors (n x K) and log transitions."""
    n = len(log_emis)
    delta = log_emis[0] - np.log(K)
    back = np.zeros((n, K), dtype=np.int64)
    cols = np.arange(K)
    for t in range(1, n):
        cand = delta[:, None] + log_trans
        back[t] = np.argmax(cand, axis=0)
        delta = cand[back[t], cols] + log_emis[t]
    path = np.empty(n, dtype=np.int64)
    path[-1] = int(np.argmax(delta))
    for t in range(n - 1, 0, -1):
        path[t - 1] = back[t, path[t]]
    return path


def runs(labels: np.ndarray) -> list[tuple[int, int, int]]:
    """Contiguous runs as (phase, i0, i1_exclusive)."""
    if len(labels) == 0:
        return []
    change = np.flatnonzero(np.diff(labels)) + 1
    starts = np.concatenate([[0], change])
    ends = np.concatenate([change, [len(labels)]])
    return [(int(labels[s]), int(s), int(e)) for s, e in zip(starts, ends)]


def enforce_min_duration(labels: np.ndarray, proba: np.ndarray, min_len: int) -> np.ndarray:
    """Merge runs shorter than ``min_len`` samples into the neighbour the classifier prefers."""
    labels = labels.copy()
    while True:
        segs = runs(labels)
        short = [(e - s, j) for j, (_, s, e) in enumerate(segs) if e - s < min_len]
        if len(segs) < 2 or not short:
            return labels
        _, j = min(short)
        _, s, e = segs[j]
        neighbours = [segs[k][0] for k in (j - 1, j + 1) if 0 <= k < len(segs)]
        best = max(neighbours, key=lambda ph: proba[s:e, ph].mean())
        labels[s:e] = best


@dataclass
class Cycle:
    """One detected work cycle: ordered (phase, i0, i1) runs over sample indices."""
    index: int
    segments: list[tuple[int, int, int]]

    @property
    def i0(self) -> int:
        return self.segments[0][1]

    @property
    def i1(self) -> int:
        return self.segments[-1][2]

    def phase_idx(self, phase: int) -> np.ndarray:
        """Sample indices of all runs of ``phase`` inside the cycle."""
        parts = [np.arange(s, e) for ph, s, e in self.segments if ph == phase]
        return np.concatenate(parts) if parts else np.array([], dtype=np.int64)


def detect_cycles(labels: np.ndarray) -> list[Cycle]:
    """Group phase runs into complete cycles (dig, swing_loaded, dump and swing_empty all present).

    A new cycle starts at a dig run once the current cycle has reached dump or swing_empty, so
    a pause inside the dig does not split the cycle. Leading runs before the first dig and
    trailing idle after the last cycle are dropped.
    """
    groups: list[list[tuple[int, int, int]]] = []
    for seg in runs(labels):
        seen = {ph for ph, _, _ in groups[-1]} if groups else set()
        if seg[0] == DIG and (not groups or seen & {DUMP, SWING_EMPTY}):
            groups.append([seg])
        elif groups:
            groups[-1].append(seg)
    if groups:
        while groups[-1] and groups[-1][-1][0] == IDLE:
            groups[-1].pop()
    required = {DIG, SWING_LOADED, DUMP, SWING_EMPTY}
    complete = [g for g in groups if required <= {ph for ph, _, _ in g}]
    return [Cycle(index=i, segments=g) for i, g in enumerate(complete)]


@dataclass
class PhaseModel:
    """Phase classifier + HMM smoothing. ``predict`` for sessions, ``filter_step`` for live."""
    clf: LGBMClassifier
    log_trans: np.ndarray
    min_len: int
    sample_hz: float = SAMPLE_HZ

    @classmethod
    def fit(cls, sessions: list[SessionArrays], masks: list[np.ndarray], seed: int = 0) -> "PhaseModel":
        """Train on ground-truth phase labels of the samples selected by ``masks``."""
        x = np.vstack([window_features(s.matrix(), s.ts)[m] for s, m in zip(sessions, masks)])
        y = np.concatenate([s.gt_phase[m] for s, m in zip(sessions, masks)])
        clf = LGBMClassifier(n_estimators=200, learning_rate=0.08, num_leaves=31, min_child_samples=20,
                             subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                             class_weight="balanced", random_state=seed, n_jobs=4, verbose=-1)
        clf.fit(x, y)
        min_len = max(1, int(round(MIN_PHASE_S * SAMPLE_HZ)))
        return cls(clf=clf, log_trans=np.log(_transition_matrix()), min_len=min_len)

    def proba_features(self, feats: np.ndarray) -> np.ndarray:
        """Per-sample posteriors (n x K), columns in ALL_PHASES order."""
        raw = self.clf.booster_.predict(feats, num_threads=1)
        out = np.full((len(feats), K), 1e-6)
        out[:, self.clf.classes_.astype(int)] = raw
        return out / out.sum(axis=1, keepdims=True)

    def proba(self, arrays: SessionArrays) -> np.ndarray:
        return self.proba_features(window_features(arrays.matrix(), arrays.ts))

    def predict_raw(self, arrays: SessionArrays) -> np.ndarray:
        """Unsmoothed argmax phase per sample."""
        return np.argmax(self.proba(arrays), axis=1)

    def predict(self, arrays: SessionArrays) -> np.ndarray:
        """Smoothed phase per sample (Viterbi + minimum phase duration)."""
        proba = self.proba(arrays)
        path = viterbi(np.log(proba), self.log_trans)
        return enforce_min_duration(path, proba, self.min_len)

    def filter_step(self, log_alpha: np.ndarray | None, proba_row: np.ndarray) -> np.ndarray:
        """One HMM forward-filter update; returns the normalised log posterior over phases."""
        log_emis = np.log(proba_row)
        if log_alpha is None:
            la = log_emis
        else:
            la = _logsumexp(log_alpha[:, None] + self.log_trans, axis=0) + log_emis
        return la - _logsumexp(la, axis=0)


def phase_accuracy(pred: np.ndarray, gt: np.ndarray) -> float:
    """Fraction of samples whose predicted phase matches the ground truth."""
    return float(np.mean(pred == gt)) if len(gt) else float("nan")
