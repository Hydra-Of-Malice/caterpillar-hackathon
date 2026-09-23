"""EdgeRuntime — everything the edge API runs in the background (10 §3 service 4).

* Bus: MqttBus (persistent session, QoS 1 for safety alerts) with an in-memory fallback while the
  broker is unreachable. Bus callbacks run on paho's thread and only hop onto the asyncio loop.
* telemetry/raw → bounded asyncio queue (drop oldest) → ring buffer, trackers, task progress,
  pipeline.process → alert_manager.on_event. Per-sample and per-window processing times are kept.
* safety/alert → alert_manager.on_safety_alert (T-CRIT mirror + incident).
* safety/heartbeat → protection status (degraded when older than 3 s or a sensor reports a fault).
* Loops: processing, 2 Hz live snapshot over WS, 1 Hz alert tick, outbox sync, state persistence.
All shift logic runs on the sample clock (last sample ts + wall time since it arrived).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np
from sqlalchemy import select

from sentinel.alerts.manager import AlertManager
from sentinel.bus.client import InMemoryBus, MqttBus
from sentinel.edge_api import services
from sentinel.edge_api.pipeline_adapter import load_pipeline
from sentinel.edge_api.settings import EdgeSettings
from sentinel.edge_api.tracking import OperationTracker, ProgressTracker
from sentinel.eta.estimator import TaskTimeEstimator
from sentinel.shared import topics
from sentinel.shared.config import load_yaml
from sentinel.shared.schemas import (Alert, AlertState, Attribution, Event, Provenance, RiskCategory,
                                     SafetyAlertMsg, SafetyHeartbeat, TaskEstimate, TelemetrySample)
from sentinel.store.db import Database
from sentinel.store.models import FeatureWindowRow, OperatorRow, ShiftRow, TaskHistoryRow, TaskRow
from sentinel.sync import outbox
from sentinel.sync.agent import SyncAgent

log = logging.getLogger("sentinel.edge")

HIDDEN_STATES = (AlertState.suppressed, AlertState.queued_post_shift)
WEATHER_REFRESH_S = 300.0          # MOCK feed refresh while the WAN is up
WEATHER_STALE_S = 900.0


def _p(values: deque, q: float) -> float | None:
    return round(float(np.percentile(list(values), q)), 2) if values else None


class EdgeRuntime:
    """Owns the edge DB, bus, alert manager, estimator, sync agent and live state."""

    def __init__(self, settings: EdgeSettings) -> None:
        self.settings = settings
        self.machine_id, self.site_id = settings.machine_id, settings.site_id
        self.db = Database(settings.db_url)
        self.policy = load_yaml("alert_policy")
        self.alerts = AlertManager(self.db, self.policy)
        self.alerts.site_id, self.alerts.machine_id = self.site_id, self.machine_id
        self.estimator = TaskTimeEstimator.load(settings.models_dir / "tasktime", history=self._history())
        self.pipeline, self._ctx_cls, self.pipeline_status = load_pipeline()
        self.sync = SyncAgent(self.db, settings.cloud_url, connect_timeout_s=settings.cloud_connect_timeout_s,
                              on_rpc_result=self._on_rpc_result)
        self.tracker = OperationTracker(min_break_s=self.policy["break"]["min_break_min"] * 60)
        self.progress = ProgressTracker()
        self.waiting_for_truck = False
        self.evaluations: dict[str, Any] = {}
        self.shift_stats: dict[str, Any] = {}
        self.latest: TelemetrySample | None = None
        self._last_sample_mono: float | None = None
        self._heartbeat: SafetyHeartbeat | None = None
        self._hb_mono: float | None = None
        self._last_protection: str | None = None
        self._last_good_prox_ts: float | None = None
        self.rule_latency_ms: deque = deque(maxlen=500)
        self.sample_ms: deque = deque(maxlen=2000)
        self.window_ms: deque = deque(maxlen=500)
        self.dropped_samples = 0
        self._last_window_id: str | None = None
        self._ctx: dict[str, Any] = {}
        self._eta: TaskEstimate | None = None
        self._weather_ts = time.time()
        self._idle_started: float | None = None
        self.demo_degraded: tuple[float, str] | None = None     # (monotonic until, reason) — DEMO override
        self.machine_issues: deque = deque(maxlen=5)
        self._ws: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue: asyncio.Queue | None = None
        self._stop: asyncio.Event | None = None
        self._tasks: list[asyncio.Task] = []
        self.memory_bus = InMemoryBus()
        self.mqtt: MqttBus | None = None
        self._load_state()
        self.refresh_context()
        self.alerts.subscribe(self._on_alert)

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=self.settings.queue_max)
        self._stop = asyncio.Event()
        if self.settings.bus_kind == "mqtt":
            await self._connect_mqtt()
        for bus in filter(None, (self.memory_bus, self.mqtt)):
            bus.subscribe(topics.telemetry_raw(self.site_id, self.machine_id), self._on_telemetry, qos=0)
            bus.subscribe(topics.safety_alert(self.site_id, self.machine_id), self._on_safety_alert, qos=1)
            bus.subscribe(topics.safety_heartbeat(self.site_id, self.machine_id), self._on_heartbeat, qos=0)
            bus.subscribe(topics.task_state(self.site_id, self.machine_id), self._on_task_state, qos=1)
        self._tasks = [asyncio.create_task(c) for c in (
            self._process_loop(), self._snapshot_loop(), self._tick_loop(),
            self.sync.run(self._stop, self.settings.sync_interval_s))]
        log.info("edge runtime up: machine=%s bus=%s pipeline=%s tasktime=%s", self.machine_id,
                 self.broker_status(), self.pipeline_status, self.estimator.model_version)

    async def stop(self) -> None:
        if self._stop is not None:
            self._stop.set()
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self.save_state()
        if self.mqtt is not None:
            self.mqtt.close()
        self.sync.close()
        self.db.engine.dispose()

    async def _connect_mqtt(self) -> None:
        try:
            self.mqtt = await asyncio.to_thread(
                MqttBus, client_id=f"sentinel-edge-api-{self.machine_id}", clean_session=False,
                connect_timeout_s=self.settings.mqtt_connect_timeout_s)
        except Exception:
            log.exception("MQTT client could not start — in-memory bus only")
            return
        if not self.mqtt.connected:
            log.warning("MQTT broker unreachable — using the in-memory bus until it connects (client keeps retrying)")

    def publish(self, topic: str, payload: Any, qos: int = 0, retain: bool = False) -> str:
        """Publish on MQTT when connected, else on the in-memory bus. Returns the bus used."""
        if self.mqtt is not None and self.mqtt.connected:
            self.mqtt.publish(topic, payload, qos=qos, retain=retain)
            return "mqtt"
        self.memory_bus.publish(topic, payload, qos=qos, retain=retain)
        return "memory"

    def broker_status(self) -> str:
        if self.settings.bus_kind == "memory":
            return "memory"
        return "connected" if self.mqtt is not None and self.mqtt.connected else "disconnected (in-memory fallback)"

    # ------------------------------------------------------------------ clock
    def now_ts(self) -> float:
        """Sample clock: last sample ts plus wall time since it arrived (wall clock before any sample)."""
        if self.latest is None or self._last_sample_mono is None:
            return time.time()
        return self.latest.ts + (time.monotonic() - self._last_sample_mono)

    def telemetry_age_s(self) -> float | None:
        return None if self._last_sample_mono is None else time.monotonic() - self._last_sample_mono

    def moving(self) -> bool:
        """Machine in motion per the latest sample (stale after 3 s of silence)."""
        age = self.telemetry_age_s()
        return bool(self.tracker.moving and age is not None and age <= 3.0)

    # ------------------------------------------------------------------ bus callbacks (paho thread)
    def _hop(self, fn: Any, payload: dict[str, Any]) -> None:
        loop = self._loop
        if loop is not None and not loop.is_closed():
            loop.call_soon_threadsafe(fn, payload)

    def _on_telemetry(self, topic: str, payload: dict[str, Any]) -> None:
        self._hop(self._enqueue_sample, payload)

    def _on_safety_alert(self, topic: str, payload: dict[str, Any]) -> None:
        self._hop(self._handle_safety_alert, payload)

    def _on_heartbeat(self, topic: str, payload: dict[str, Any]) -> None:
        self._hop(self._handle_heartbeat, payload)

    def _on_task_state(self, topic: str, payload: dict[str, Any]) -> None:
        self._hop(self._handle_task_state, payload)

    def _handle_task_state(self, payload: dict[str, Any]) -> None:
        """Operator tap or simulated truck wait on context/task_state (also receives our own publish)."""
        if isinstance(payload.get("waiting_for_truck"), bool):
            self._apply_waiting(payload["waiting_for_truck"])

    def _enqueue_sample(self, payload: dict[str, Any]) -> None:
        assert self._queue is not None
        if self._queue.full():
            self._queue.get_nowait()                            # drop the oldest under backlog
            self.dropped_samples += 1
        self._queue.put_nowait(payload)

    # ------------------------------------------------------------------ safety path mirror
    def _handle_safety_alert(self, payload: dict[str, Any]) -> None:
        try:
            msg = SafetyAlertMsg.model_validate(payload)
        except Exception:
            log.warning("invalid safety/alert payload ignored")
            return
        if msg.machine_id != self.machine_id:
            return
        if msg.t_pub_ns and msg.sample_t_pub_ns:
            self.rule_latency_ms.append((msg.t_pub_ns - msg.sample_t_pub_ns) / 1e6)
        self.alerts.on_safety_alert(msg)

    def _handle_heartbeat(self, payload: dict[str, Any]) -> None:
        try:
            hb = SafetyHeartbeat.model_validate(payload)
        except Exception:
            return
        if hb.machine_id != self.machine_id:
            return
        self._heartbeat, self._hb_mono = hb, time.monotonic()
        self.alerts.reconcile_safety(hb.active_alerts, self.now_ts())

    def protection(self) -> dict[str, Any]:
        cfg = self.policy["protection"]
        age = None if self._hb_mono is None else round(time.monotonic() - self._hb_mono, 2)
        reasons = []
        if age is None:
            reasons.append("no safety heartbeat received")
        elif age > cfg["heartbeat_max_age_s"]:
            reasons.append(f"safety heartbeat {age:.1f} s old")
        health = self._heartbeat.sensor_health if self._heartbeat else {}
        reasons += [f"{k} {v}" for k, v in health.items() if v in cfg["degraded_sensor_states"]]
        if self.demo_degraded and time.monotonic() < self.demo_degraded[0]:
            reasons.append(self.demo_degraded[1])
        return {"status": "degraded" if reasons else "active", "heartbeat_age_s": age, "reasons": reasons,
                "sensor_health": health, "rule_version": self._heartbeat.rule_version if self._heartbeat else None}

    # ------------------------------------------------------------------ telemetry processing
    async def _process_loop(self) -> None:
        assert self._queue is not None
        failures = 0
        while True:
            payload = await self._queue.get()
            try:
                self.process_sample(payload)
            except Exception:
                failures += 1
                if failures in (1, 10) or failures % 500 == 0:
                    log.exception("telemetry processing failed (%d so far)", failures)

    def process_sample(self, payload: dict[str, Any]) -> None:
        t0 = time.perf_counter()
        sample = TelemetrySample.model_validate(payload)
        if sample.machine_id != self.machine_id:
            return
        self.latest, self._last_sample_mono = sample, time.monotonic()
        if sample.prox_fitted and (sample.prox_person_m is None or sample.prox_person_m >= 0):
            self._last_good_prox_ts = sample.ts
        self.alerts.record_sample(sample)
        task = self._ctx.get("task")
        idle_before = self.tracker.idle_current_s
        self.tracker.update(sample, self.waiting_for_truck, task["type"] if task else None)
        self._track_idle_period(sample, idle_before)
        self._update_progress(sample)
        ctx = self._ctx_cls(waiting_for_truck=self.waiting_for_truck, task_type=task["type"] if task else None,
                            operator_experience_h=float(self._ctx.get("operator", {}).get("operating_hours") or 0.0))
        for event in self.pipeline.process(sample, ctx):
            self.on_pipeline_event(event)
        window = self.pipeline.last_window()
        elapsed_ms = (time.perf_counter() - t0) * 1000
        self.sample_ms.append(elapsed_ms)
        if window is not None and window.window_id != self._last_window_id:
            self._last_window_id = window.window_id
            self.window_ms.append(elapsed_ms)
            self._store_window(window)

    def on_pipeline_event(self, event: Event) -> list[Alert]:
        """Pipeline (or demo) event → alert manager; machine-attributed ones also feed the machine card."""
        if event.attribution == Attribution.machine:
            self.machine_issues.append({"ts": event.ts, "type": event.type,
                                        "tier": event.tier.value if event.tier else None,
                                        "dtc": event.context.get("dtc") or event.evidence.get("dtc"),
                                        "label": "Machine issue: maintenance flag, not operator coaching"})
        return self.alerts.on_event(event, self.tracker.moving)

    def _track_idle_period(self, sample: TelemetrySample, idle_before_s: float) -> None:
        """Log each idle period >= 60 s as an ``idle_period`` event with its reason (screen 8, 16)."""
        if self.tracker.idle_current_s > 0 and idle_before_s == 0:
            self._idle_started = sample.ts
        if self.tracker.idle_current_s == 0 and idle_before_s >= 60 and self._idle_started is not None:
            reason = ("waiting_for_truck" if self.waiting_for_truck else
                      "warmup" if sample.coolant_c < self.tracker.warmup_coolant_c else "unexplained")
            self.alerts.record_event(Event(
                ts=self._idle_started, site_id=self.site_id, machine_id=self.machine_id,
                operator_id=sample.operator_id, shift_id=self._ctx.get("shift_id"), task_id=sample.task_id,
                type="idle_period", category=RiskCategory.normal, provenance=[Provenance.RULE, Provenance.SIMULATED],
                rule_id="EDGE-IDLE-PERIOD", rule_version=self.alerts.version,
                context={"reason": reason, "duration_min": round(idle_before_s / 60, 1), "start_ts": self._idle_started,
                         "end_ts": sample.ts, "zone": sample.zone}))
            self._idle_started = None

    def _history(self) -> list[dict[str, Any]]:
        with self.db.session() as s:
            rows = s.scalars(select(TaskHistoryRow).order_by(TaskHistoryRow.completed_at)).all()
            return [{"task_type": r.task_type, "features": r.features, "duration_min": r.duration_min,
                     "completed_at": r.completed_at} for r in rows]

    def _store_window(self, window: Any) -> None:
        data = window.model_dump(mode="json")
        with self.db.session() as s:
            s.merge(FeatureWindowRow(window_id=window.window_id, t_end=window.t_end, operator_id=window.operator_id,
                                     shift_id=window.shift_id, context_key=window.context_key,
                                     percentile=window.percentile, data=data))
            outbox.enqueue(s, "feature_window", data, outbox.P_WINDOW)
        self.broadcast("window", data)

    def _update_progress(self, sample: TelemetrySample) -> None:
        if self._ctx.get("status") != "active":
            return
        if sample.task_id and sample.task_id in self._ctx.get("task_ids", ()) and \
                (self._ctx.get("task") or {}).get("task_id") != sample.task_id:
            self._start_task(sample.task_id, sample.ts)
        task = self._ctx.get("task")
        if not task:
            return
        delta = self.progress.update(sample, task["type"], task.get("material"), (task.get("meta") or {}).get("depth_m"))
        if delta <= 0:
            return
        with self.db.session() as s:
            row = s.get(TaskRow, task["task_id"])
            row.done_qty = min(row.planned_qty, row.done_qty + delta)
            if row.done_qty >= row.planned_qty and row.status != "done":
                row.status, row.done_at = "done", sample.ts
        self.refresh_context()
        self.push_task(task["task_id"])

    def _start_task(self, task_id: str, ts: float) -> None:
        with self.db.session() as s:
            for row in s.scalars(select(TaskRow).where(TaskRow.shift_id == self._ctx["shift_id"],
                                                       TaskRow.status == "in_progress")):
                if row.task_id != task_id:
                    row.status = "queued"
            row = s.get(TaskRow, task_id)
            if row.status != "done":
                row.status = "in_progress"
                row.started_at = row.started_at or ts
        self.refresh_context()

    def _apply_waiting(self, waiting: bool) -> None:
        self.waiting_for_truck = waiting
        self.alerts.set_waiting_for_truck(waiting)

    def set_waiting(self, waiting: bool) -> None:
        """Operator "waiting for truck" tap → pipeline context, idle suppression, retained task_state topic."""
        self._apply_waiting(waiting)
        task = self._ctx.get("task") or {}
        self.publish(topics.task_state(self.site_id, self.machine_id),
                     {"task_id": task.get("task_id"), "state": "waiting_for_truck" if waiting else "working",
                      "waiting_for_truck": waiting, "source": "operator_tap", "ts": self.now_ts()}, qos=1, retain=True)

    # ------------------------------------------------------------------ shift context
    def refresh_context(self) -> None:
        """Cache the current shift, operator and in-progress task (read on every sample)."""
        with self.db.session() as s:
            shift = services.current_shift(s, self.machine_id)
            if shift is None:
                self._ctx = {}
                return
            tasks = s.scalars(select(TaskRow).where(TaskRow.shift_id == shift.shift_id)
                              .order_by(TaskRow.priority)).all()
            current = next((t for t in tasks if t.status == "in_progress"), None)
            operator = services.operator_dict(s.get(OperatorRow, shift.operator_id))
            self._ctx = {"shift_id": shift.shift_id, "status": shift.status, "operator_id": shift.operator_id,
                         "operator": operator, "task_ids": [t.task_id for t in tasks],
                         "task": services.row_dict(current) if current else None}
        self.alerts.set_shift(shift.shift_id, shift.operator_id, self.machine_id)

    @property
    def context(self) -> dict[str, Any]:
        return self._ctx

    def conditions(self, shift: ShiftRow | None = None) -> dict[str, Any]:
        """MOCK weather for the shift plus staleness (the mock feed refreshes only while the WAN is up)."""
        if shift is None:
            with self.db.session() as s:
                shift = services.current_shift(s, self.machine_id)
        base = dict(shift.conditions) if shift is not None else {}
        now = time.time()
        if self.sync.wan_up and now - self._weather_ts >= WEATHER_REFRESH_S:
            self._weather_ts = now
        stale_s = round(now - self._weather_ts, 1)
        rain_from = base.get("rain_from_ts")
        base.update(updated_ts=self._weather_ts, stale_s=stale_s, stale=stale_s > WEATHER_STALE_S,
                    raining=bool(rain_from and self.now_ts() >= rain_from), source="MOCK",
                    provenance=["MOCK"])
        return base

    # ------------------------------------------------------------------ estimates
    def estimate_task(self, task: TaskRow, shift: ShiftRow, operator: dict[str, Any],
                      conditions: dict[str, Any] | None = None) -> TaskEstimate:
        now = self.now_ts()
        cond = {**(conditions if conditions is not None else self.conditions(shift)), "now_ts": now,
                "machine_id": shift.machine_id}
        return self.estimator.estimate(services.task_inputs(task, shift, now), operator, cond,
                                       progress_frac=services.progress_frac(task))

    def push_task(self, task_id: str) -> None:
        """Recompute a task's estimate and push "task" + "eta" frames (AC5.4: within 1 s of progress)."""
        with self.db.session() as s:
            task = s.get(TaskRow, task_id)
            if task is None:
                return
            shift = s.get(ShiftRow, task.shift_id)
            operator = services.operator_dict(s.get(OperatorRow, shift.operator_id))
            est = self.estimate_task(task, shift, operator)
            payload = services.task_dict(task, est)
            outbox.enqueue(s, "task", services.row_dict(task), outbox.P_SHIFT)     # crew progress in the cloud
        if (self._ctx.get("task") or {}).get("task_id") == task_id:
            self._eta = est
        self.broadcast("task", payload)
        self.broadcast("eta", est.model_dump(mode="json"))

    def current_eta(self) -> TaskEstimate | None:
        task = self._ctx.get("task")
        if not task:
            return None
        if self._eta is None or self._eta.task_id != task["task_id"]:
            self.push_task(task["task_id"])
        return self._eta

    # ------------------------------------------------------------------ live snapshot
    def snapshot(self) -> dict[str, Any]:
        s = self.latest
        prot = self.protection()
        zones = self.policy["display"]["proximity_zones_m"]
        prox_health = prot["sensor_health"].get("proximity")
        fitted = bool(s.prox_fitted) if s else True
        sectors: dict[str, str] = {k: "clear" for k in ("front", "right", "rear", "left")} if fitted else {}
        if s and fitted and s.prox_person_m is not None and s.prox_person_sector:
            sectors[s.prox_person_sector] = ("danger" if s.prox_person_m <= zones["danger"] else
                                             "warning" if s.prox_person_m <= zones["warning"] else "clear")
        task = self._ctx.get("task")
        task_view = None
        if task:
            task_view = {"task_id": task["task_id"], "name": task["name"], "type": task["type"],
                         "done_qty": round(task["done_qty"], 1), "planned_qty": task["planned_qty"],
                         "unit": task["qty_unit"], "progress_pct": round(100 * task["done_qty"] / task["planned_qty"], 1)
                         if task["planned_qty"] else 0.0, "cycles": self.progress.cycles,
                         "avg_cycle_s": self.progress.avg_cycle_s(), "progress_source": self.progress.source}
        eta = self.current_eta()
        idle = self.tracker.idle_summary()
        idle["suppressed_now"] = bool(self.waiting_for_truck and idle["current_min"] > 0)
        now = self.now_ts()
        return {
            "ts": now, "machine_id": self.machine_id, "shift_id": self._ctx.get("shift_id"),
            "operator_id": self._ctx.get("operator_id"), "has_telemetry": s is not None,
            "telemetry_age_s": None if self.telemetry_age_s() is None else round(self.telemetry_age_s(), 2),
            "seatbelt": s.seatbelt if s else None, "engine_on": s.engine_on if s else None,
            "zone": s.zone if s else None, "travel_kmh": round(s.travel_kmh, 2) if s else 0.0,
            "swing_dps": round(s.swing_dps, 1) if s else 0.0, "moving": self.moving(),
            "proximity": {"fitted": fitted,
                          "status": "not_fitted" if not fitted else {"ok": "active", None: "active"}.get(prox_health, prox_health),
                          "sectors": sectors, "truck_m": s.prox_truck_m if s else None, "truck_id": None,
                          "truck_sector": None, "person_m": s.prox_person_m if s else None,
                          "person_sector": s.prox_person_sector if s else None, "last_good_ts": self._last_good_prox_ts},
            "idle": idle, "waiting_for_truck": self.waiting_for_truck, "task": task_view,
            "machine_issues": list(self.machine_issues),
            "eta": eta.model_dump(mode="json") if eta else None, "banner": self.alerts.banner(),
            "protection": prot["status"], "protection_reasons": prot["reasons"],
            "continuous_operation_min": round(self.tracker.continuous_operation_min(now), 1),
            "last_break_ts": self.tracker.last_break_ts, "on_break": self.tracker.on_break,
            "cloud": "online" if self.sync.cloud_online else "offline", "outbox_backlog": self.sync.backlog(),
            "simulated": True,
        }

    def health(self) -> dict[str, Any]:
        prot = self.protection()
        rules_version = prot["rule_version"]
        if rules_version is None:
            try:
                rules_version = load_yaml("rules").get("rule_version")
            except FileNotFoundError:
                rules_version = None
        return {
            "status": "ok", "machine_id": self.machine_id, "safety_heartbeat_age_s": prot["heartbeat_age_s"],
            "protection": prot["status"], "protection_reasons": prot["reasons"], "sensor_health": prot["sensor_health"],
            "broker": self.broker_status(), "cloud": "online" if self.sync.cloud_online else "offline",
            "wan_up": self.sync.wan_up, "outbox_backlog": self.sync.backlog(),
            "versions": {"rules": rules_version, "alert_policy": self.alerts.version,
                         "checklist": services.checklist_version(),
                         "models": {"tasktime": self.estimator.model_version,
                                    "pipeline": getattr(self.pipeline, "version", self.pipeline_status)}},
            "pipeline": self.pipeline_status,
            "rule_latency_ms": {"p50": _p(self.rule_latency_ms, 50), "p99": _p(self.rule_latency_ms, 99),
                                "n": len(self.rule_latency_ms)},
            "processing_ms": {"sample_p99": _p(self.sample_ms, 99), "window_p50": _p(self.window_ms, 50),
                              "window_p99": _p(self.window_ms, 99), "windows": len(self.window_ms)},
            "dropped_samples": self.dropped_samples, "telemetry_age_s": self.telemetry_age_s(),
            "demo_mode": self.settings.demo_mode, "simulated": True,
        }

    # ------------------------------------------------------------------ WebSocket hub
    def ws_register(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._ws.add(q)
        return q

    def ws_unregister(self, q: asyncio.Queue) -> None:
        self._ws.discard(q)

    def broadcast(self, frame_type: str, data: Any) -> None:
        """Thread-safe fan-out of one ``{type, data}`` frame to every WS client."""
        loop = self._loop
        if loop is None or loop.is_closed() or not self._ws:
            return
        loop.call_soon_threadsafe(self._fanout, {"type": frame_type, "data": data})

    def _fanout(self, frame: dict[str, Any]) -> None:
        for q in list(self._ws):
            if q.full():
                q.get_nowait()
            q.put_nowait(frame)

    def _on_alert(self, alert: Alert) -> None:
        if alert.state in HIDDEN_STATES:
            return                                               # suppressed / post-shift: never pushed in-cab
        displayed = self.alerts.is_displayed(alert.alert_id)
        self.broadcast("alert" if displayed else "alert_cleared", alert.model_dump(mode="json"))

    # ------------------------------------------------------------------ loops
    async def _snapshot_loop(self) -> None:
        period = 1.0 / self.settings.snapshot_hz
        n = 0
        while True:
            try:
                if self._ws:
                    self._fanout({"type": "snapshot", "data": self.snapshot()})
                    status = self.protection()["status"]
                    if status != self._last_protection or n % 4 == 0:
                        self._last_protection = status
                        self._fanout({"type": "health", "data": self.health()})
            except Exception:
                log.exception("snapshot loop iteration failed")
            n += 1
            await asyncio.sleep(period)

    async def _tick_loop(self) -> None:
        n = 0
        while True:
            try:
                now = self.now_ts()
                self.alerts.tick(now, self.tracker.continuous_operation_min(now))
                if n % 5 == 0:
                    self.refresh_context()
                    self.save_state()
                if n % 30 == 0:
                    self.enqueue_health()
            except Exception:
                log.exception("tick loop iteration failed")
            n += 1
            await asyncio.sleep(1.0)

    def enqueue_health(self) -> None:
        """Machine health summary for the supervisor view (kind "health", stored on the cloud machine row)."""
        prot = self.protection()
        with self.db.session() as s:
            outbox.enqueue(s, "health", {"machine_id": self.machine_id, "ts": time.time(), "protection": prot["status"],
                                         "protection_reasons": prot["reasons"], "sensor_health": prot["sensor_health"],
                                         "heartbeat_age_s": prot["heartbeat_age_s"], "broker": self.broker_status(),
                                         "outbox_backlog": self.sync.backlog(), "pipeline": self.pipeline_status,
                                         "shift_id": self._ctx.get("shift_id"), "operator_id": self._ctx.get("operator_id"),
                                         "continuous_operation_min": round(
                                             self.tracker.continuous_operation_min(self.now_ts()), 1)},
                           outbox.P_SHIFT)

    # ------------------------------------------------------------------ cloud results
    def _on_rpc_result(self, call: dict[str, Any], result: Any) -> None:
        body = call.get("json") or {}
        if call.get("path") == "/competency/evaluate" and body.get("shift_id") and result is not None:
            self.evaluations[body["shift_id"]] = result

    # ------------------------------------------------------------------ state persistence
    @property
    def state_path(self) -> Path:
        return self.settings.resolved_state_path()

    def save_state(self) -> None:
        state = {"shift_id": self._ctx.get("shift_id"), "tracker": self.tracker.to_dict(),
                 "progress": self.progress.to_dict(), "waiting_for_truck": self.waiting_for_truck,
                 "evaluations": self.evaluations, "shift_stats": self.shift_stats, "saved_at": time.time()}
        tmp = self.state_path.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps(state, default=str), encoding="utf-8")
            tmp.replace(self.state_path)
        except OSError:
            log.warning("could not save edge runtime state to %s", self.state_path, exc_info=True)

    def _load_state(self) -> None:
        try:
            state = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        self.tracker = OperationTracker.from_dict(state.get("tracker", {}))
        self.progress = ProgressTracker.from_dict(state.get("progress", {}))
        self.waiting_for_truck = bool(state.get("waiting_for_truck", False))
        self.alerts.set_waiting_for_truck(self.waiting_for_truck)
        self.evaluations = state.get("evaluations", {})
        self.shift_stats = state.get("shift_stats", {})

    def reset_shift_state(self, ts: float) -> None:
        """New shift: fresh trackers (continuous operation starts now)."""
        self.tracker.start_shift(ts)
        self.progress = ProgressTracker()
        self.waiting_for_truck = False
        self.alerts.set_waiting_for_truck(False)
        self._eta = None

    def close_shift_stats(self, shift_id: str) -> dict[str, Any]:
        """Freeze the shift's operation/idle/exposure figures for the post-shift review."""
        stats = {"operating_min": round(self.tracker.operating_s / 60, 1), "idle": self.tracker.idle_summary(),
                 "operating_by_type_h": {k: round(v / 3600, 3) for k, v in self.tracker.operating_by_type.items()},
                 "exposure": self.progress.exposure, "cycles": self.progress.cycles,
                 "progress_source": self.progress.source}
        self.shift_stats[shift_id] = stats
        self.save_state()
        return stats

    def live_stats(self, shift_id: str) -> dict[str, Any] | None:
        """Figures for a shift: frozen at shift end, or live for the current shift."""
        if shift_id in self.shift_stats:
            return self.shift_stats[shift_id]
        if shift_id == self._ctx.get("shift_id"):
            return {"operating_min": round(self.tracker.operating_s / 60, 1), "idle": self.tracker.idle_summary(),
                    "exposure": self.progress.exposure, "cycles": self.progress.cycles,
                    "progress_source": self.progress.source}
        return None
