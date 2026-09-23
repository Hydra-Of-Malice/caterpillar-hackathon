"""SIMULATED training datasets → data/sim/*.parquet.

    python -m sentinel.sim.datasets [--only fleet_baseline ravi practice] [--seed 42] [--out data/sim]

| file                        | content                                                                  |
|-----------------------------|--------------------------------------------------------------------------|
| fleet_baseline.parquet      | 10 Hz TelemetrySample rows from baseline_fleet (16 shifts), gt kept      |
| ravi_shift0/1/2.parquet     | Ravi's three shifts                                                      |
| practice_expert.parquet     | 5 expert operators × 40 cycles × 2 exercises (operator_id, session_id)   |
| practice_trainees.parquet   | novice / intermediate / novice_improving trainees, same layout           |

Telemetry files hold every TelemetrySample field (dtc as list<string>) with gt flattened into
gt_* columns (GT_COLUMNS); `iter_samples` rebuilds TelemetrySample objects. In parquet, a None
proximity value and a NaN (sensor fault) both read back as NaN in pandas — use gt_inject to tell
them apart. Generation is not real-time (roughly 30 k rows/s).
"""
from __future__ import annotations

import argparse
import math
import time
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from sentinel.shared.config import DATA_DIR
from sentinel.shared.schemas import PracticeSample, TelemetrySample
from sentinel.sim.generator import ShiftSimulator, load_scenario
from sentinel.sim.practice import EXERCISES, generate_practice_session

OUT_DIR = DATA_DIR / "sim"
CHUNK_ROWS = 36_000                     # one simulated hour per row group

_F32 = pa.float32()
TELEMETRY_SCHEMA = pa.schema([
    ("schema_version", pa.int8()), ("ts", pa.float64()), ("seq", pa.int64()), ("source", pa.string()),
    ("t_pub_ns", pa.int64()), ("site_id", pa.string()), ("machine_id", pa.string()), ("operator_id", pa.string()),
    ("shift_id", pa.string()), ("task_id", pa.string()), ("task_type", pa.string()), ("zone", pa.string()),
    ("engine_on", pa.bool_()), ("rpm", _F32), ("throttle_pct", _F32), ("fuel_rate_lph", _F32), ("coolant_c", _F32),
    ("travel_kmh", _F32), ("gear", pa.int8()), ("park_brake", pa.bool_()), ("service_brake", pa.bool_()),
    ("swing_brake", pa.bool_()), ("hyd_lockout", pa.bool_()),
    ("joy_swing", _F32), ("joy_boom", _F32), ("joy_stick", _F32), ("joy_bucket", _F32), ("travel_cmd", _F32),
    ("swing_dps", _F32), ("swing_angle_deg", _F32), ("boom_angle_deg", _F32), ("stick_angle_deg", _F32),
    ("bucket_angle_deg", _F32), ("hyd_pressure_bar", _F32), ("hyd_pilot_bar", _F32), ("hyd_oil_temp_c", _F32),
    ("payload_t", _F32), ("seatbelt", pa.bool_()), ("prox_fitted", pa.bool_()), ("prox_person_m", _F32),
    ("prox_person_sector", pa.string()), ("prox_truck_m", _F32), ("bucket_to_truck_m", _F32),
    ("dtc", pa.list_(pa.string())),
    ("gt_phase", pa.string()), ("gt_cycle", pa.int32()), ("gt_archetype", pa.string()), ("gt_activity", pa.string()),
    ("gt_wait_truck", pa.bool_()), ("gt_inject", pa.string()), ("gt_inject_id", pa.int32()), ("gt_actor", pa.string()),
    ("gt_m", _F32), ("gt_injects", pa.string()), ("gt_natural", pa.bool_()),
])
GT_COLUMNS = [f.name for f in TELEMETRY_SCHEMA if f.name.startswith("gt_")]
_SAMPLE_COLUMNS = [f.name for f in TELEMETRY_SCHEMA if not f.name.startswith("gt_")]


def _flatten(row: dict[str, Any]) -> dict[str, Any]:
    gt = row.get("gt") or {}
    out = {k: row.get(k) for k in _SAMPLE_COLUMNS}
    out["schema_version"] = out["schema_version"] or 1
    for col in GT_COLUMNS:
        v = gt.get(col[3:])
        out[col] = ",".join(v) if col == "gt_injects" and v else v
    out["gt_wait_truck"] = bool(gt.get("wait_truck", False))
    out["gt_natural"] = bool(gt.get("natural", False))
    return out


def write_telemetry(rows: Iterable[dict[str, Any]], path: Path, max_rows: int | None = None) -> int:
    """Stream generator rows (ShiftSimulator.rows()) into a zstd parquet file. Returns rows written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    n, buf = 0, []
    with pq.ParquetWriter(path, TELEMETRY_SCHEMA, compression="zstd") as w:
        for row in rows:
            buf.append(_flatten(row))
            n += 1
            if len(buf) >= CHUNK_ROWS:
                w.write_table(pa.Table.from_pylist(buf, schema=TELEMETRY_SCHEMA))
                buf = []
            if max_rows is not None and n >= max_rows:
                break
        if buf:
            w.write_table(pa.Table.from_pylist(buf, schema=TELEMETRY_SCHEMA))
    return n


def write_scenario(name: str, path: Path, seed: int = 42, max_rows: int | None = None) -> int:
    """Simulate a scenario and write it as a telemetry parquet file."""
    return write_telemetry(ShiftSimulator(load_scenario(name), seed=seed).rows(), path, max_rows)


def iter_samples(df: pd.DataFrame) -> Iterator[TelemetrySample]:
    """Rebuild TelemetrySample objects (with gt) from a telemetry dataset frame."""
    cols = list(df.columns)
    for values in df.itertuples(index=False, name=None):
        r = dict(zip(cols, values))
        gt: dict[str, Any] = {}
        for col in GT_COLUMNS:
            v = r.pop(col, None)
            if v is None or (isinstance(v, float) and math.isnan(v)) or v is False:
                continue
            gt[col[3:]] = v.split(",") if col == "gt_injects" else v
        for k, v in list(r.items()):
            if isinstance(v, float) and math.isnan(v):
                r[k] = None
        r["dtc"] = list(r.get("dtc") if r.get("dtc") is not None else [])
        if "cycle" in gt:
            gt["cycle"] = int(gt["cycle"])
        yield TelemetrySample.model_validate({**r, "gt": gt or None})


def read_dataset(name: str, out_dir: Path = OUT_DIR) -> pd.DataFrame:
    """Load data/sim/<name>.parquet."""
    return pd.read_parquet(out_dir / f"{name}.parquet")


# ---------------------------------------------------------------- practice
def practice_rows(samples: list[PracticeSample], **meta: Any) -> list[dict[str, Any]]:
    out = []
    for s in samples:
        d = s.model_dump(exclude={"gt"})
        d.update(phase=s.gt["phase"], cycle=s.gt["cycle"], archetype=s.gt["archetype"], **meta)
        out.append(d)
    return out


def practice_frame(specs: list[tuple[str, str, float | None]], sessions: int, cycles: int, seed: int) -> pd.DataFrame:
    """specs: (operator_id, archetype, skill|None). One row per PracticeSample, both exercises."""
    rows: list[dict[str, Any]] = []
    for op_id, archetype, skill in specs:
        for exercise in EXERCISES:
            for k in range(sessions):
                sid = f"{op_id}-{exercise}-{k:02d}"
                samples = generate_practice_session(archetype, cycles, seed + k, exercise, operator_id=op_id,
                                                    skill=skill)
                rows += practice_rows(samples, operator_id=op_id, session_id=sid, exercise=exercise,
                                      skill=skill, simulated=True)
    return pd.DataFrame(rows)


EXPERTS = [(f"EXP-{i:02d}", "expert", None) for i in range(1, 6)]
TRAINEES = [("TR-201", "novice", None), ("TR-202", "novice", None), ("TR-203", "intermediate", None),
            ("TR-204", "intermediate", None), ("OP-1042", "novice_improving", 0.1),
            ("OP-1042", "novice_improving", 0.6)]


def build(out_dir: Path = OUT_DIR, seed: int = 42, only: list[str] | None = None) -> dict[str, tuple[int, int]]:
    """Write the datasets; returns {file: (rows, bytes)}."""
    jobs = only or ["fleet_baseline", "ravi", "practice"]
    out: dict[str, tuple[int, int]] = {}

    def done(name: str, rows: int) -> None:
        path = out_dir / f"{name}.parquet"
        out[name] = (rows, path.stat().st_size)
        print(f"{name:22s} {rows:>10,d} rows {path.stat().st_size / 1e6:8.1f} MB", flush=True)

    out_dir.mkdir(parents=True, exist_ok=True)
    if "fleet_baseline" in jobs:
        done("fleet_baseline", write_scenario("baseline_fleet", out_dir / "fleet_baseline.parquet", seed))
    if "ravi" in jobs:
        for k in range(3):
            done(f"ravi_shift{k}", write_scenario(f"ravi_shift{k}", out_dir / f"ravi_shift{k}.parquet", seed))
    if "practice" in jobs:
        for name, specs in (("practice_expert", EXPERTS), ("practice_trainees", TRAINEES)):
            df = practice_frame(specs, sessions=5, cycles=8, seed=seed)
            df.to_parquet(out_dir / f"{name}.parquet", compression="zstd", index=False)
            done(name, len(df))
    return out


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Write SIMULATED datasets to data/sim/")
    ap.add_argument("--only", nargs="*", choices=("fleet_baseline", "ravi", "practice"))
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    a = ap.parse_args(argv)
    t = time.time()
    res = build(a.out, a.seed, a.only)
    total = sum(b for _, b in res.values())
    print(f"total {total / 1e6:.1f} MB in {time.time() - t:.0f} s — SIMULATED data")


if __name__ == "__main__":
    main()
