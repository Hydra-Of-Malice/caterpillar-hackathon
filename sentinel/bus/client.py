"""Message bus abstraction.

- MqttBus: paho-mqtt v2 client (Mosquitto in Docker, or the amqtt fallback broker).
- InMemoryBus: same interface, synchronous, for tests and single-process demos.

Callbacks receive (topic: str, payload: dict). MqttBus callbacks run on paho's network
thread — async consumers must hop to their loop with loop.call_soon_threadsafe.
"""
from __future__ import annotations

import json
import threading
import time
from collections import defaultdict
from typing import Any, Callable, Protocol

from pydantic import BaseModel

Callback = Callable[[str, dict[str, Any]], None]


def _encode(payload: BaseModel | dict[str, Any]) -> bytes:
    if isinstance(payload, BaseModel):
        return payload.model_dump_json().encode()
    return json.dumps(payload, default=str).encode()


def topic_matches(pattern: str, topic: str) -> bool:
    """MQTT wildcard match (+ single level, # multi level)."""
    p_parts, t_parts = pattern.split("/"), topic.split("/")
    for i, p in enumerate(p_parts):
        if p == "#":
            return True
        if i >= len(t_parts):
            return False
        if p != "+" and p != t_parts[i]:
            return False
    return len(p_parts) == len(t_parts)


class Bus(Protocol):
    def publish(self, topic: str, payload: BaseModel | dict[str, Any], qos: int = 0, retain: bool = False) -> None: ...
    def subscribe(self, topic: str, callback: Callback, qos: int = 0) -> None: ...
    def close(self) -> None: ...


class InMemoryBus:
    def __init__(self) -> None:
        self._subs: list[tuple[str, Callback]] = []
        self._retained: dict[str, dict[str, Any]] = {}
        self._lock = threading.RLock()
        self.published: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)

    def publish(self, topic: str, payload: BaseModel | dict[str, Any], qos: int = 0, retain: bool = False) -> None:
        data = json.loads(_encode(payload))
        with self._lock:
            self.published[topic].append(data)
            if retain:
                self._retained[topic] = data
            subs = [cb for pat, cb in self._subs if topic_matches(pat, topic)]
        for cb in subs:
            cb(topic, data)

    def subscribe(self, topic: str, callback: Callback, qos: int = 0) -> None:
        with self._lock:
            self._subs.append((topic, callback))
            retained = [(t, d) for t, d in self._retained.items() if topic_matches(topic, t)]
        for t, d in retained:
            callback(t, d)

    def close(self) -> None:
        with self._lock:
            self._subs.clear()


class MqttBus:
    def __init__(self, host: str | None = None, port: int | None = None, client_id: str | None = None,
                 clean_session: bool = True, connect_timeout_s: float = 5.0) -> None:
        import paho.mqtt.client as mqtt

        from sentinel.shared import config

        self._host = host or config.MQTT_HOST
        self._port = port or config.MQTT_PORT
        self._subs: list[tuple[str, int, Callback]] = []
        self._connected = threading.Event()
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id or f"sentinel-{int(time.time() * 1000) % 10_000_000}",
            clean_session=clean_session,
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = lambda *a, **k: self._connected.clear()
        self._client.on_message = self._on_message
        self._client.reconnect_delay_set(min_delay=1, max_delay=5)
        self._client.connect_async(self._host, self._port, keepalive=15)
        self._client.loop_start()
        self._connected.wait(connect_timeout_s)

    @property
    def connected(self) -> bool:
        return self._connected.is_set()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):  # noqa: ANN001
        self._connected.set()
        for topic, qos, _ in self._subs:          # re-subscribe after reconnect
            client.subscribe(topic, qos)

    def _on_message(self, client, userdata, msg):  # noqa: ANN001
        try:
            data = json.loads(msg.payload.decode() or "{}")
        except json.JSONDecodeError:
            return
        for pattern, _, cb in list(self._subs):
            if topic_matches(pattern, msg.topic):
                cb(msg.topic, data)

    def publish(self, topic: str, payload: BaseModel | dict[str, Any], qos: int = 0, retain: bool = False) -> None:
        self._client.publish(topic, _encode(payload), qos=qos, retain=retain)

    def subscribe(self, topic: str, callback: Callback, qos: int = 0) -> None:
        self._subs.append((topic, qos, callback))
        if self.connected:
            self._client.subscribe(topic, qos)

    def close(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()


def make_bus(kind: str | None = None, **kwargs: Any) -> Bus:
    """kind: 'mqtt' (default) or 'memory'. Env SENTINEL_BUS overrides."""
    import os

    kind = kind or os.getenv("SENTINEL_BUS", "mqtt")
    return InMemoryBus() if kind == "memory" else MqttBus(**kwargs)
