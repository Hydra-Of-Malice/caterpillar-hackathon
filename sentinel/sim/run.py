"""Live simulator runner: publishes SIMULATED TelemetrySample on telemetry/raw.

    python -m sentinel.sim.run --scenario ravi_shift1 --speed 1 [--bus memory|mqtt] [--machine EX-07]

- Paces at speed × real time (speed 10 = 10× faster; 0 = as fast as possible). With the default
  `--anchor now`, sample.ts starts at the wall clock and advances speed× faster; `--anchor scenario`
  keeps the scenario's own timestamps.
- Sets t_pub_ns just before each publish; publishes a TierASnapshot every 60 s of simulated time
  and a 1 Hz health/sim status message.
- Publishes the simulated operator's "Waiting for truck" tap on context/task_state (QoS 1, retained)
  whenever a simulated truck wait begins or ends: {"waiting_for_truck", "source": "operator_tap", "ts"}.
- Subscribes to sim/control: {"inject": kind, "params"?: {...}} (or flat extra keys),
  {"scenario": name, "speed"?: n, "seed"?: n}, {"speed": n}.
- A cue's `speed` hint (e.g. 10× through a long idle) raises the pace while it is active.
"""
from __future__ import annotations

import argparse
import json
import logging
import queue
import time
from pathlib import Path
from typing import IO, Any

from sentinel.bus.client import Bus, make_bus
from sentinel.shared import topics
from sentinel.shared.schemas import TelemetrySample
from sentinel.sim.generator import ShiftSimulator, load_scenario

log = logging.getLogger("sentinel.sim.run")
TIER_A_PERIOD_S = 60.0
MAX_LAG_S = 2.0            # re-anchor pacing instead of bursting when the loop falls behind


class WaitTap:
    """Simulated operator taps: turns the simulator's truck-wait state into task_state messages."""

    def __init__(self) -> None:
        self.waiting: bool | None = None

    def update(self, sample: TelemetrySample) -> dict[str, Any] | None:
        """Return a task_state payload when the wait state changes (the first sample always reports)."""
        waiting = bool((sample.gt or {}).get("wait_truck"))
        if waiting == self.waiting:
            return None
        self.waiting = waiting
        return {"waiting_for_truck": waiting, "source": "operator_tap", "ts": sample.ts}


class SimRunner:
    """Drives a ShiftSimulator onto a bus in (scaled) real time."""

    def __init__(self, bus: Bus, scenario: str, speed: float = 1.0, machine: str | None = None, seed: int = 42,
                 anchor: str = "now", record: IO[str] | None = None) -> None:
        self.bus = bus
        self.speed = speed
        self.seed = seed
        self.anchor = anchor
        self.record = record
        self._control: queue.SimpleQueue[dict[str, Any]] = queue.SimpleQueue()
        self.published = 0
        self._load(scenario, machine)
        bus.subscribe(topics.sim_control(self.site, self.machine), self._on_control, qos=1)

    # ------------------------------------------------------------ setup / control
    def _load(self, name: str, machine: str | None = None) -> None:
        sc = load_scenario(name)
        self.machine = machine or getattr(self, "machine", None) or sc.machine_ids[0]
        if self.machine not in sc.machine_ids:
            log.warning("scenario %s has no shifts on %s; using %s", name, self.machine, sc.machine_ids[0])
            self.machine = sc.machine_ids[0]
        self.scenario_name = name
        self.site = sc.site_id
        self.sim = ShiftSimulator(sc.for_machine(self.machine), seed=self.seed)
        self._samples = self.sim.samples()
        self._t_topic = topics.telemetry_raw(self.site, self.machine)
        self._a_topic = topics.telemetry_tier_a(self.site, self.machine)
        self._h_topic = topics.health(self.site, self.machine, "sim")
        self._s_topic = topics.task_state(self.site, self.machine)
        self._tap = WaitTap()
        self._ts_offset: float | None = None
        self._pace_wall: float | None = None
        self._pace_sim = self._pace_speed = 0.0
        self._last_tier_a: float | None = None
        log.info("scenario %s on %s (seed %d, speed %s)", name, self.machine, self.seed, self.speed)

    def _on_control(self, topic: str, payload: dict[str, Any]) -> None:
        self._control.put(payload)          # bus thread → sim loop

    def _handle(self, msg: dict[str, Any]) -> None:
        if "scenario" in msg:
            self.seed = int(msg.get("seed", self.seed))
            self._load(str(msg["scenario"]), msg.get("machine"))
        if "speed" in msg:
            self.speed = float(msg["speed"])
            self._pace_wall = None
        if "inject" in msg:
            envelope = ("inject", "scenario", "speed", "action", "kind", "ts", "source", "seed", "machine")
            params = msg["params"] if isinstance(msg.get("params"), dict) else {
                k: v for k, v in msg.items() if k not in envelope}
            try:
                self.sim.inject(str(msg["inject"]), **params)
                log.info("inject %s %s", msg["inject"], params or "")
            except (TypeError, ValueError) as e:
                log.warning("rejected control message %s: %s", msg, e)

    # ------------------------------------------------------------ loop
    def _effective_speed(self) -> float:
        hint = self.sim.speed_hint
        return max(self.speed, hint) if (hint and self.speed > 0) else self.speed

    def _pace(self, sim_ts: float, speed: float) -> None:
        if speed <= 0:
            return
        now = time.monotonic()
        if self._pace_wall is None or self._pace_speed != speed:
            self._pace_wall, self._pace_sim, self._pace_speed = now, sim_ts, speed
            return
        target = self._pace_wall + (sim_ts - self._pace_sim) / speed
        if target - now > 0.001:
            time.sleep(target - now)
        elif now - target > MAX_LAG_S:
            self._pace_wall, self._pace_sim = now, sim_ts

    def step(self) -> TelemetrySample | None:
        """Handle pending control, then pace and publish one sample. None when the scenario ends."""
        while not self._control.empty():
            self._handle(self._control.get())
        sample = next(self._samples, None)
        if sample is None:
            return None
        sim_ts = sample.ts
        self._pace(sim_ts, self._effective_speed())
        if self._ts_offset is None:
            self._ts_offset = (time.time() - sim_ts) if self.anchor == "now" else 0.0
        sample.ts = round(sim_ts + self._ts_offset, 2)
        sample.t_pub_ns = time.time_ns()
        self.bus.publish(self._t_topic, sample, qos=0)
        self.published += 1
        tap = self._tap.update(sample)
        if tap is not None:
            self.bus.publish(self._s_topic, tap, qos=1, retain=True)
        if self.record:
            self.record.write(json.dumps({"kind": "telemetry", "data": json.loads(sample.model_dump_json())}) + "\n")
        if self._last_tier_a is None or sim_ts - self._last_tier_a >= TIER_A_PERIOD_S:
            self._last_tier_a = sim_ts
            snap = self.sim.tier_a()
            if snap is not None:
                snap.ts = sample.ts
                self.bus.publish(self._a_topic, snap, qos=1)
                if self.record:
                    self.record.write(json.dumps({"kind": "tier_a", "data": snap.model_dump(mode="json")}) + "\n")
        return sample

    def health(self, last: TelemetrySample | None) -> dict[str, Any]:
        run = self.sim.run
        return {"component": "sim", "status": "running" if last else "finished", "scenario": self.scenario_name,
                "machine_id": self.machine, "speed": self._effective_speed(), "seq": last.seq if last else None,
                "sim_ts": last.ts if last else None, "simulated": True,
                "active_injections": [i.kind for i in run.injections] if run else []}

    def run(self, max_samples: int | None = None, max_sim_s: float | None = None, loop: bool = False) -> int:
        """Publish until the scenario ends (or the limits are hit). Returns samples published."""
        next_health, first_ts, last = 0.0, None, None
        while max_samples is None or self.published < max_samples:
            sample = self.step()
            if sample is None:
                if not loop:
                    break
                self._load(self.scenario_name, self.machine)
                continue
            last = sample
            first_ts = sample.ts if first_ts is None else first_ts
            if max_sim_s is not None and sample.ts - first_ts >= max_sim_s:
                break
            if time.monotonic() >= next_health:
                next_health = time.monotonic() + 1.0
                self.bus.publish(self._h_topic, self.health(last))
        self.bus.publish(self._h_topic, self.health(None))
        return self.published


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="CAT Sentinel SIMULATED telemetry runner")
    ap.add_argument("--scenario", default="ravi_shift1")
    ap.add_argument("--speed", type=float, default=1.0, help="× real time; 0 = as fast as possible")
    ap.add_argument("--bus", choices=("memory", "mqtt"), default=None, help="default: $SENTINEL_BUS or mqtt")
    ap.add_argument("--machine", default=None)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--anchor", choices=("now", "scenario"), default="now")
    ap.add_argument("--duration-s", type=float, default=None, help="stop after this much simulated time")
    ap.add_argument("--record", type=Path, default=None, help="also write a JSONL recording (for replay)")
    ap.add_argument("--loop", action="store_true", help="restart the scenario when it ends")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(asctime)s %(name)s %(message)s")
    bus = make_bus(a.bus, client_id=f"sentinel-sim-{a.machine or 'default'}")
    if getattr(bus, "connected", True) is False:
        log.warning("MQTT broker not reachable yet; paho keeps retrying (docker compose up -d broker)")
    rec = a.record.open("w", encoding="utf-8") if a.record else None
    try:
        runner = SimRunner(bus, a.scenario, a.speed, a.machine, a.seed, a.anchor, rec)
        n = runner.run(max_sim_s=a.duration_s, loop=a.loop)
        log.info("published %d samples", n)
    except KeyboardInterrupt:
        log.info("stopped")
    finally:
        if rec:
            rec.close()
        bus.close()


if __name__ == "__main__":
    main()
