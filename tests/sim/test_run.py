"""Runner and replay over InMemoryBus (unpaced)."""
from __future__ import annotations

import io
import json

from sentinel.bus.client import InMemoryBus
from sentinel.shared import topics
from sentinel.sim.replay import replay
from sentinel.sim.run import SimRunner

SITE, M = "north-quarry", "EX-07"


def test_run_publishes_and_obeys_sim_control():
    bus = InMemoryBus()
    runner = SimRunner(bus, "demo_short", speed=0, anchor="scenario")
    assert runner.run(max_samples=100) == 100
    bus.publish(topics.sim_control(SITE, M), {"inject": "person_rear", "params": {"min_m": 2.0}})
    bus.publish(topics.sim_control(SITE, M), {"inject": "no_such_kind"})          # rejected, loop continues
    runner.run(max_samples=1300)
    tel = bus.published[topics.telemetry_raw(SITE, M)]
    assert len(tel) == 1300
    assert all(d["t_pub_ns"] and d["source"] == "SIM" for d in tel)
    assert [d["seq"] for d in tel] == list(range(1300))
    near = [d for d in tel[100:] if d["prox_person_m"] is not None]
    assert near and min(d["prox_person_m"] for d in near) < 2.5
    assert len(bus.published[topics.telemetry_tier_a(SITE, M)]) == 3                  # every 60 s simulated
    assert bus.published[topics.health(SITE, M, "sim")]


def test_edge_style_control_envelope_is_accepted():
    """The edge's /demo/inject sends {"action", "inject", "kind", "params": {}, "ts"} — kind must not clash."""
    bus = InMemoryBus()
    runner = SimRunner(bus, "demo_short", speed=0, anchor="scenario")
    runner.run(max_samples=100)
    bus.publish(topics.sim_control(SITE, M),
                {"action": "inject", "inject": "person_rear", "kind": "person_rear", "params": {}, "ts": 1.0})
    runner.run(max_samples=1300)
    near = [d for d in bus.published[topics.telemetry_raw(SITE, M)][100:] if d["prox_person_m"] is not None]
    assert near and min(d["prox_person_m"] for d in near) < 4.0


def test_task_state_tap_and_scenario_switch():
    bus = InMemoryBus()
    runner = SimRunner(bus, "demo_short", speed=0, anchor="now")
    bus.publish(topics.sim_control(SITE, M), {"inject": "truck_wait", "duration_s": 60})
    runner.run(max_samples=1500)
    taps = bus.published[topics.task_state(SITE, M)]
    assert taps[0] == {"waiting_for_truck": False, "source": "operator_tap", "ts": taps[0]["ts"]}
    assert [t["waiting_for_truck"] for t in taps][:3] == [False, True, False]
    tel = bus.published[topics.telemetry_raw(SITE, M)]
    assert abs(tel[-1]["ts"] - tel[0]["ts"] - 149.9) < 0.05                           # simulated time, re-anchored
    bus.publish(topics.sim_control(SITE, M), {"scenario": "ravi_shift1", "speed": 0})
    runner.run(max_samples=1600)
    assert runner.scenario_name == "ravi_shift1"
    assert bus.published[topics.telemetry_raw(SITE, M)][-1]["gt"]["activity"] == "warmup"


def test_record_and_replay(tmp_path):
    rec = io.StringIO()
    SimRunner(InMemoryBus(), "demo_short", speed=0, anchor="scenario", record=rec).run(max_samples=700)
    path = tmp_path / "beat.jsonl"
    path.write_text(rec.getvalue(), encoding="utf-8")
    kinds = [json.loads(line)["kind"] for line in rec.getvalue().splitlines()]
    assert kinds.count("telemetry") == 700 and kinds.count("tier_a") == 2
    bus = InMemoryBus()
    assert replay(bus, path, speed=0, anchor="recording") == 700
    out = bus.published[topics.telemetry_raw(SITE, M)]
    assert len(out) == 700 and all(d["source"] == "REPLAY" for d in out)
    assert len(bus.published[topics.telemetry_tier_a(SITE, M)]) == 2
