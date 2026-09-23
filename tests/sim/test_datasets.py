"""Dataset writers: parquet round trip and practice layout (small slices only)."""
from __future__ import annotations

import itertools

import pandas as pd

from sentinel.sim.datasets import GT_COLUMNS, iter_samples, practice_frame, write_scenario
from sentinel.sim.generator import ShiftSimulator, load_scenario


def test_telemetry_parquet_round_trip(tmp_path):
    path = tmp_path / "demo.parquet"
    assert write_scenario("demo_short", path, seed=3, max_rows=2500) == 2500
    df = pd.read_parquet(path)
    assert len(df) == 2500 and set(GT_COLUMNS) <= set(df.columns)
    back = list(iter_samples(df))
    orig = list(itertools.islice(ShiftSimulator(load_scenario("demo_short"), seed=3).samples(), 2500))
    for a, b in zip(orig[::97], back[::97]):
        assert a.seq == b.seq and a.task_type == b.task_type and a.seatbelt == b.seatbelt and a.dtc == b.dtc
        assert abs(a.swing_dps - b.swing_dps) < 1e-3 and a.gt["phase"] == b.gt["phase"]
        assert (a.prox_truck_m is None) == (b.prox_truck_m is None)
    assert any((s.gt or {}).get("inject") == "seatbelt_open" for s in back)


def test_practice_frame_layout():
    df = practice_frame([("EXP-01", "expert", None), ("TR-201", "novice", None)], sessions=1, cycles=2, seed=0)
    assert {"operator_id", "session_id", "exercise", "phase", "cycle", "archetype", "ts", "joy_swing"} <= set(df.columns)
    assert set(df.exercise) == {"truck_loading_basic", "trench_basic"}
    assert df.groupby(["operator_id", "exercise"]).cycle.nunique().eq(2).all()
