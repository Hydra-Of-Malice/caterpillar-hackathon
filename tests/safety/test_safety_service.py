"""End-to-end tests of the safety process over InMemoryBus (handlers, heartbeat, CLI)."""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import threading
import time
from typing import Any

from pydantic import BaseModel

from sentinel.bus.client import InMemoryBus
from sentinel.shared import topics
from sentinel.shared.config import ROOT
from sentinel.shared.schemas import SafetyAlertMsg, SafetyHeartbeat

from sentinel.safety.main import SafetyService, build_parser
from sentinel.safety.rules import SEAT

from tests.safety.factory import DT, T0, UNBELTED_ACTIVE, sample

SITE, MACHINE = "north-quarry", "EX-07"


class RecordingBus(InMemoryBus):
    """InMemoryBus that also records QoS and retain flags."""

    def __init__(self) -> None:
        super().__init__()
        self.flags: list[tuple[str, int, bool]] = []

    def publish(self, topic: str, payload: BaseModel | dict[str, Any], qos: int = 0, retain: bool = False) -> None:
        self.flags.append((topic, qos, retain))
        super().publish(topic, payload, qos, retain)


class FakeClock:
    def __init__(self) -> None:
        self.t = 100.0

    def __call__(self) -> float:
        return self.t


def _service() -> tuple[SafetyService, RecordingBus, FakeClock]:
    bus, mono = RecordingBus(), FakeClock()
    svc = SafetyService(bus, SITE, MACHINE, monotonic=mono, wall=lambda: 1_900_000_000.0, time_ns=lambda: 42)
    svc.start()
    return svc, bus, mono


def _publish(bus: RecordingBus, mono: FakeClock, n: int, start: int = 0, **signals: Any) -> None:
    for i in range(start, start + n):
        bus.publish(topics.telemetry_raw(SITE, MACHINE), sample(T0 + i * DT, seq=i, t_pub_ns=10_000 + i, **signals))
        mono.t += DT


def test_alerts_flow_from_telemetry_to_safety_alert_topic() -> None:
    svc, bus, mono = _service()
    _publish(bus, mono, 10, **UNBELTED_ACTIVE)
    _publish(bus, mono, 10, start=10, park_brake=False)
    msgs = [SafetyAlertMsg.model_validate(p) for p in bus.published[svc.alert_topic]]
    assert [(m.rule_id, m.state) for m in msgs] == [(SEAT, "raised"), (SEAT, "cleared")]
    raised, cleared = msgs
    assert raised.alert_id == cleared.alert_id
    assert raised.t_pub_ns == 42 and raised.sample_t_pub_ns == 10_005
    assert cleared.sample_t_pub_ns == 10_015
    assert {(q, r) for t, q, r in bus.flags if t == svc.alert_topic} == {(1, False)}


def test_heartbeat_reports_version_health_and_active_alerts() -> None:
    svc, bus, mono = _service()
    _publish(bus, mono, 10, **UNBELTED_ACTIVE)
    hb = svc.publish_heartbeat()
    (payload,) = bus.published[svc.heartbeat_topic]
    assert SafetyHeartbeat.model_validate(payload) == hb
    assert hb.rule_version == svc.engine.rule_version and hb.machine_id == MACHINE
    assert hb.sensor_health == {"seatbelt": "ok", "proximity": "ok", "telemetry": "ok"}
    assert hb.active_alerts == [bus.published[svc.alert_topic][0]["alert_id"]]
    assert {(q, r) for t, q, r in bus.flags if t == svc.heartbeat_topic} == {(0, False)}


def test_heartbeat_goes_stale_when_telemetry_stops_for_2s() -> None:
    svc, bus, mono = _service()
    assert set(svc.heartbeat().sensor_health.values()) == {"stale"}          # nothing received yet
    _publish(bus, mono, 5)
    mono.t += 1.9
    assert svc.heartbeat().sensor_health["telemetry"] == "ok"
    mono.t += 0.3
    assert svc.heartbeat().sensor_health == {"seatbelt": "stale", "proximity": "stale", "telemetry": "stale"}
    _publish(bus, mono, 1, start=5)                                            # telemetry resumes
    assert svc.heartbeat().sensor_health["telemetry"] == "ok"


def test_untrustworthy_payloads_are_rejected_not_defaulted() -> None:
    svc, bus, mono = _service()
    topic = topics.telemetry_raw(SITE, MACHINE)
    good = sample(T0, seq=0, **UNBELTED_ACTIVE).model_dump(mode="json")
    missing_belt = {k: v for k, v in good.items() if k != "seatbelt"}
    null_belt = {**good, "seatbelt": None}
    other_machine = {**good, "machine_id": "EX-09"}
    nan_travel = json.loads(sample(T0, seq=0, travel_kmh=math.nan).model_dump_json())   # NaN kept on the wire
    for payload in (missing_belt, null_belt, other_machine, nan_travel):
        bus.publish(topic, payload)
    assert svc.engine.last_ts is None
    assert svc._rejected == 4
    assert bus.published[svc.alert_topic] == []


def test_heartbeat_thread_publishes_at_its_period() -> None:
    bus = RecordingBus()
    svc = SafetyService(bus, SITE, MACHINE)
    stop = threading.Event()
    th = threading.Thread(target=svc.run_heartbeat, args=(stop, 0.05), daemon=True)
    th.start()
    time.sleep(0.32)
    stop.set()
    th.join(timeout=2.0)
    assert not th.is_alive()
    beats = bus.published[svc.heartbeat_topic]
    assert 3 <= len(beats) <= 12                                                # ~7 expected at 20 Hz
    assert all(SafetyHeartbeat.model_validate(b).sensor_health["telemetry"] == "stale" for b in beats)


def test_cli_parser_defaults() -> None:
    args = build_parser().parse_args([])
    assert (args.bus, args.site, args.machine) == (None, "north-quarry", "EX-07")
    args = build_parser().parse_args(["--bus", "memory", "--site", "s1", "--machine", "EX-09"])
    assert (args.bus, args.site, args.machine) == ("memory", "s1", "EX-09")


def test_cli_process_runs_and_logs_heartbeat() -> None:
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    proc = subprocess.Popen([sys.executable, "-m", "sentinel.safety.main", "--bus", "memory", "--machine", "EX-09"],
                            cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        out, _ = proc.communicate(timeout=4.0)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, _ = proc.communicate()
    assert "safety process up" in out and "EX-09" in out
    assert "heartbeat protection=DEGRADED" in out                           # no telemetry -> stale, never green
    assert "Traceback" not in out
