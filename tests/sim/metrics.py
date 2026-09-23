"""Per-cycle practice metrics used by the simulator tests (independent of the Practice Analyser)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from sentinel.shared.schemas import PracticeSample

NEAR_TRUCK_M = 5.0
DT = 0.1


def to_frame(samples: list[PracticeSample]) -> pd.DataFrame:
    df = pd.DataFrame([s.model_dump(exclude={"gt"}) for s in samples])
    df["phase"] = [s.gt["phase"] for s in samples]
    df["cycle"] = [s.gt["cycle"] for s in samples]
    return df


def _reversals(x: np.ndarray) -> int:
    """Harsh reversals: sign flip with |Δ| > 1.0 within 0.3 s."""
    a, b = x[:-3], x[3:]
    flips = (np.sign(a) * np.sign(b) < 0) & (np.abs(b - a) > 1.0)
    return int((np.diff(np.r_[0, flips.astype(int)]) == 1).sum())


def cycle_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """One row per cycle with the archetype-separability metrics."""
    joy = df[["joy_swing", "joy_boom", "joy_stick", "joy_bucket"]].to_numpy()
    jerk = np.r_[0.0, 0.0, np.abs(np.diff(joy, n=2, axis=0)).sum(axis=1) / DT**2]
    rows = []
    for c, g in df.groupby("cycle"):
        sl = g[g.phase == "swing_loaded"]
        if sl.empty:
            continue
        dur = g.groupby("phase").size() * DT
        near = sl[sl.bucket_to_truck_m.notna() & (sl.bucket_to_truck_m < NEAR_TRUCK_M)]
        swing_on = sl.joy_swing.abs() > 0.2
        work = g[g.phase != "idle"]
        dump = g[g.phase == "dump"]
        rows.append({
            "cycle": c,
            "cycle_s": len(g) * DT,
            "dig_s": dur.get("dig", 0.0),
            "swing_loaded_s": dur.get("swing_loaded", 0.0),
            "dump_s": dur.get("dump", 0.0),
            "swing_empty_s": dur.get("swing_empty", 0.0),
            "idle_gap_s": dur.get("idle", 0.0),
            "swing_peak_dps": float(sl.swing_dps.abs().max()),
            "swing_near_truck_dps": float(near.swing_dps.abs().mean()) if not near.empty else np.nan,
            "jerk": float(jerk[g.index].mean()),
            "reversals": sum(_reversals(work[col].to_numpy()) for col in ("joy_swing", "joy_boom", "joy_stick")),
            # share of the loaded boom raise done while swinging (multi-function control)
            "overlap": float(((sl.joy_boom > 0.2) & swing_on).sum() / max(1, (sl.joy_boom > 0.2).sum())),
            "fill_t": float(g.payload_t.max()),
            "overshoot_deg": float(max(0.0, sl.swing_angle_deg.max() - dump.swing_angle_deg.mean()))
            if not dump.empty else 0.0,
        })
    return pd.DataFrame(rows)


def rule_violations(df: pd.DataFrame, min_run: int = 3) -> pd.Series:
    """Per cycle: does fusion.yaml fast_swing_near_truck fire? |swing_dps| > 35 while
    bucket_to_truck_m < 5 m for >= min_run consecutive 10 Hz samples (0.3 s)."""
    hit = (df.swing_dps.abs() > 35) & (df.bucket_to_truck_m < 5)
    out = {}
    for c, g in df.groupby("cycle"):
        run = best = 0
        for v in hit[g.index]:
            run = run + 1 if v else 0
            best = max(best, run)
        out[c] = best >= min_run
    return pd.Series(out)
