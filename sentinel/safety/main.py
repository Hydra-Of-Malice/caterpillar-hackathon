"""Independent safety process: telemetry/raw -> RuleEngine -> safety/alert, plus a 1 Hz heartbeat.

    python -m sentinel.safety.main [--bus mqtt|memory] [--site north-quarry] [--machine EX-07]

* Alerts: ``SafetyAlertMsg`` on ``topics.safety_alert`` (QoS 1), ``t_pub_ns`` stamped at publish.
* Heartbeat: ``SafetyHeartbeat`` on ``topics.safety_heartbeat`` at 1 Hz wall clock (QoS 0, never
  retained, so a crashed process cannot look alive). If no valid sample arrives for
  ``telemetry_stale_s`` (2 s), the heartbeat reports telemetry / seatbelt / proximity as "stale".
* A payload missing a rule input, failing validation, or for another machine is rejected (never
  defaulted to a safe value); persistent rejection therefore surfaces as "stale".
* Broker reconnects and re-subscription are handled by ``MqttBus``; this process logs them.
"""
from __future__ import annotations

import argparse
import logging
import math
import signal
import sys
import threading
import time
from typing import Any, Callable

from pydantic import ValidationError

from sentinel.bus.client import Bus, make_bus
from sentinel.shared import config, topics
from sentinel.shared.schemas import SafetyAlertMsg, SafetyHeartbeat, TelemetrySample

from sentinel.safety.health import protection_state
from sentinel.safety.rules import RuleEngine

log = logging.getLogger("sentinel.safety")


class SafetyService:
    """Wires one machine's ``RuleEngine`` to the bus.

    Thread-safe: bus callbacks (paho network thread) and the heartbeat loop share one lock.
    Clocks are injectable for tests; the engine itself only ever sees ``sample.ts``.
    """

    def __init__(self, bus: Bus, site: str, machine: str, engine: RuleEngine | None = None, *,
                 monotonic: Callable[[], float] = time.monotonic, wall: Callable[[], float] = time.time,
                 time_ns: Callable[[], int] = time.time_ns) -> None:
        self.bus, self.site, self.machine = bus, site, machine
        self.engine = engine if engine is not None else RuleEngine()
        self._mono, self._wall, self._time_ns = monotonic, wall, time_ns
        self._lock = threading.RLock()
        self._last_rx_mono: float | None = None
        self._rejected = 0
        self._logged_state: tuple[Any, ...] | None = None
        self._broker_up: bool | None = None
        self.telemetry_topic = topics.telemetry_raw(site, machine)
        self.alert_topic = topics.safety_alert(site, machine)
        self.heartbeat_topic = topics.safety_heartbeat(site, machine)

    def start(self) -> None:
        """Subscribe to this machine's raw telemetry."""
        self.bus.subscribe(self.telemetry_topic, self.on_telemetry, qos=0)
        log.info("safety process up: rule_version=%s machine=%s/%s subscribed=%s",
                 self.engine.rule_version, self.site, self.machine, self.telemetry_topic)

    def on_telemetry(self, topic: str, payload: dict[str, Any]) -> list[SafetyAlertMsg]:
        """Bus callback: validate, evaluate, publish transitions. Returns the published messages."""
        sample = self._parse(payload)
        if sample is None:
            return []
        with self._lock:
            try:
                alerts = self.engine.evaluate(sample)
            except Exception:                       # never kill the process; health goes stale instead
                log.exception("rule evaluation failed for seq=%s", sample.seq)
                return []
            self._last_rx_mono = self._mono()
        return [self._publish_alert(msg) for msg in alerts]

    def sample_clock(self) -> float:
        """Now on the sample clock: last sample ``ts`` plus wall time elapsed since it arrived."""
        last = self.engine.last_ts
        if last is None or self._last_rx_mono is None:
            return self._wall()
        return last + (self._mono() - self._last_rx_mono)

    def heartbeat(self) -> SafetyHeartbeat:
        """Build the current heartbeat (rule version, sensor health, latched alert ids)."""
        with self._lock:
            health = self.engine.sensor_health(self.sample_clock())
            active = self.engine.active_alert_ids()
        return SafetyHeartbeat(ts=self._wall(), machine_id=self.machine, rule_version=self.engine.rule_version,
                               sensor_health=health, active_alerts=active)

    def publish_heartbeat(self) -> SafetyHeartbeat:
        """Publish one heartbeat (QoS 0, not retained) and log health changes."""
        hb = self.heartbeat()
        self.bus.publish(self.heartbeat_topic, hb, qos=0, retain=False)
        self._log_status(hb)
        return hb

    def run_heartbeat(self, stop: threading.Event, period_s: float = 1.0) -> None:
        """Publish heartbeats every ``period_s`` wall-clock seconds until ``stop`` is set."""
        next_t = time.monotonic()
        while not stop.is_set():
            try:
                self.publish_heartbeat()
            except Exception:
                log.exception("heartbeat publish failed")
            now = time.monotonic()
            next_t = max(next_t + period_s, now)      # skip missed beats rather than bursting
            stop.wait(next_t - now)

    # ------------------------------------------------------------------ internals
    def _parse(self, payload: dict[str, Any]) -> TelemetrySample | None:
        required = self.engine.required_signals(bool(payload.get("prox_fitted", True)))
        missing = [k for k in required if k not in payload]
        if missing:
            return self._reject(f"missing rule inputs {missing}")
        # NaN/inf is kept on the wire; proximity NaN is a sensor fault the engine detects,
        # but a non-finite activity/motion input must never read as "not moving".
        bad = [k for k in required if not k.startswith(("prox_", "bucket_to_truck"))
               and isinstance(payload[k], float) and not math.isfinite(payload[k])]
        if bad:
            return self._reject(f"non-finite rule inputs {bad}")
        try:
            sample = TelemetrySample.model_validate(payload)
        except ValidationError as e:
            first = e.errors()[0]
            return self._reject(f"invalid sample ({e.error_count()} errors, first: {first['loc']} {first['msg']})")
        if sample.machine_id != self.machine:
            return self._reject(f"sample for machine {sample.machine_id!r} on {self.machine!r} topic")
        return sample

    def _reject(self, reason: str) -> None:
        self._rejected += 1
        if self._rejected == 1 or self._rejected % 100 == 0:
            log.warning("rejected telemetry payload #%d: %s", self._rejected, reason)
        return None

    def _publish_alert(self, msg: SafetyAlertMsg) -> SafetyAlertMsg:
        stamped = msg.model_copy(update={"t_pub_ns": self._time_ns()})
        self.bus.publish(self.alert_topic, stamped, qos=1)
        log.log(logging.WARNING if msg.state == "raised" else logging.INFO,
                "%s %s %s tier=%s | %s | %s", msg.state.upper(), msg.rule_id, msg.alert_id,
                msg.evidence.get("tier"), msg.what, msg.why)
        return stamped

    def _log_status(self, hb: SafetyHeartbeat) -> None:
        connected = getattr(self.bus, "connected", None)
        if connected is not None and connected != self._broker_up:
            log.log(logging.INFO if connected else logging.WARNING,
                    "broker %s", "connected" if connected else "NOT connected (retrying in background)")
            self._broker_up = connected
        state = (tuple(sorted(hb.sensor_health.items())), tuple(hb.active_alerts))
        if state != self._logged_state:
            protection = protection_state(hb.sensor_health)
            log.log(logging.INFO if protection == "active" else logging.WARNING,
                    "heartbeat protection=%s health=%s active_alerts=%d",
                    protection.upper(), hb.sensor_health, len(hb.active_alerts))
            self._logged_state = state


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m sentinel.safety.main",
                                description="CAT Sentinel independent safety advisory process")
    p.add_argument("--bus", choices=("mqtt", "memory"), default=None, help="default: $SENTINEL_BUS or mqtt")
    p.add_argument("--site", default=config.SITE_ID)
    p.add_argument("--machine", default=config.MACHINE_ID)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(stream=sys.stdout, level=logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    bus = make_bus(args.bus, client_id=f"sentinel-safety-{args.site}-{args.machine}")
    service = SafetyService(bus, args.site, args.machine)
    service.start()
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    try:
        service.run_heartbeat(stop)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        bus.close()
        log.info("safety process stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
