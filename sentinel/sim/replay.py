"""Replay a recording onto the bus (source=REPLAY). SIMULATED data.

    python -m sentinel.sim.replay recording.jsonl [--speed 1] [--bus memory|mqtt] [--anchor now|recording] [--loop]
    python -m sentinel.sim.replay data/sim/ravi_shift1.parquet --speed 20

JSONL lines are either {"kind": "telemetry"|"tier_a", "data": {...}} (as written by
`sentinel.sim.run --record`) or bare TelemetrySample dicts. Parquet files use the dataset layout
from sentinel.sim.datasets. Paces by sample.ts, sets t_pub_ns, and re-publishes the simulated
operator's "Waiting for truck" taps on context/task_state.
"""
from __future__ import annotations

import argparse
import json
import logging
import time
from collections.abc import Iterator
from pathlib import Path

import pandas as pd

from sentinel.bus.client import Bus, make_bus
from sentinel.shared import topics
from sentinel.shared.schemas import Source, TelemetrySample, TierASnapshot
from sentinel.sim.datasets import iter_samples
from sentinel.sim.run import WaitTap

log = logging.getLogger("sentinel.sim.replay")


def read_recording(path: Path) -> Iterator[TelemetrySample | TierASnapshot]:
    """Yield samples (and Tier A snapshots) from a JSONL or parquet recording."""
    if path.suffix == ".parquet":
        yield from iter_samples(pd.read_parquet(path))
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            if rec.get("kind") == "tier_a":
                yield TierASnapshot.model_validate(rec["data"])
            else:
                yield TelemetrySample.model_validate(rec.get("data", rec))


def replay(bus: Bus, path: Path, speed: float = 1.0, anchor: str = "now") -> int:
    """Publish a recording once. speed ≤ 0 publishes as fast as possible. Returns samples published."""
    tap, n = WaitTap(), 0
    wall0 = sim0 = offset = site = None
    for item in read_recording(path):
        if isinstance(item, TierASnapshot):
            if site is None:                      # no telemetry yet: site unknown
                continue
            item.ts = round(item.ts + offset, 2)
            bus.publish(topics.telemetry_tier_a(site, item.machine_id), item, qos=1)
            continue
        if wall0 is None:
            wall0, sim0 = time.monotonic(), item.ts
            offset = (time.time() - item.ts) if anchor == "now" else 0.0
            site = item.site_id
        if speed > 0:
            delay = wall0 + (item.ts - sim0) / speed - time.monotonic()
            if delay > 0.001:
                time.sleep(delay)
        item.ts = round(item.ts + offset, 2)
        item.source = Source.REPLAY
        item.t_pub_ns = time.time_ns()
        bus.publish(topics.telemetry_raw(item.site_id, item.machine_id), item, qos=0)
        state = tap.update(item)
        if state is not None:
            bus.publish(topics.task_state(item.site_id, item.machine_id), state, qos=1, retain=True)
        n += 1
    return n


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Replay a SIMULATED recording onto the bus")
    ap.add_argument("path", type=Path)
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--bus", choices=("memory", "mqtt"), default=None)
    ap.add_argument("--anchor", choices=("now", "recording"), default="now")
    ap.add_argument("--loop", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    bus = make_bus(a.bus, client_id="sentinel-replay")
    try:
        while True:
            log.info("replayed %d samples from %s", replay(bus, a.path, a.speed, a.anchor), a.path)
            if not a.loop:
                break
    except KeyboardInterrupt:
        log.info("stopped")
    finally:
        bus.close()


if __name__ == "__main__":
    main()
