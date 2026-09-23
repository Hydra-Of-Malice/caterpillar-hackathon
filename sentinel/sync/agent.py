"""Sync agent: drains the SQLite outbox to the cloud ``POST /ingest/batch`` (03 §5.3).

* Batches of <= 200 rows in priority order (0 first), FIFO within a priority.
* At-least-once delivery: rows are marked synced only after a 2xx; the cloud upserts on UUID.
* Exponential backoff on failure; ``wan_up`` (toggled by POST /demo/wan) simulates a WAN partition.
* Nothing is ever deleted: an unreachable or failing cloud only leaves rows pending.
* Queued cloud calls (kind ``rpc``, priority 9) run after all data rows are delivered.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any, Callable

import httpx
from sqlalchemy import update

from sentinel.shared import config
from sentinel.store.db import Database
from sentinel.store.models import OutboxRow
from sentinel.sync import outbox

log = logging.getLogger("sentinel.sync")

RpcCallback = Callable[[dict[str, Any], Any], None]


class SyncAgent:
    """Owns the edge → cloud link: outbox upload, queued calls and ad-hoc cloud requests."""

    def __init__(self, db: Database, cloud_url: str | None = None, *, batch_size: int = 200,
                 timeout_s: float = 5.0, connect_timeout_s: float = 0.5, base_backoff_s: float = 1.0,
                 max_backoff_s: float = 30.0, transport: httpx.BaseTransport | None = None,
                 clock: Callable[[], float] = time.monotonic, on_rpc_result: RpcCallback | None = None) -> None:
        self.db = db
        self.cloud_url = (cloud_url or config.CLOUD_API_URL).rstrip("/")
        self.batch_size = batch_size
        self.base_backoff_s, self.max_backoff_s = base_backoff_s, max_backoff_s
        self.on_rpc_result = on_rpc_result
        self._client = httpx.Client(timeout=httpx.Timeout(timeout_s, connect=connect_timeout_s), transport=transport)
        self._clock = clock
        self._lock = threading.Lock()
        self._wan_up = True
        self.cloud_online = False
        self.offline_since: float | None = time.time()
        self.last_sync_ts: float | None = None
        self.last_attempt_ts: float | None = None
        self.last_error: str | None = None
        self.synced_total = 0
        self._failures = 0
        self._next_attempt = 0.0

    # ------------------------------------------------------------------ WAN switch
    @property
    def wan_up(self) -> bool:
        return self._wan_up

    def set_wan(self, up: bool) -> None:
        """Demo WAN partition switch. Going up clears the backoff so the queue drains at once."""
        self._wan_up = up
        if up:
            self._failures, self._next_attempt = 0, 0.0
        else:
            self._mark_offline("WAN down (demo partition)")
        log.warning("WAN %s", "up" if up else "DOWN (simulated partition)")

    # ------------------------------------------------------------------ sync
    def sync_once(self) -> dict[str, Any]:
        """Send one batch (or one queued call). Returns ``{ok, sent, kind, reason?}``."""
        with self._lock:
            if not self._wan_up:
                return {"ok": False, "sent": 0, "kind": "none", "reason": "wan_down"}
            with self.db.session() as s:
                rows = s.scalars(outbox.pending_query().limit(self.batch_size)).all()
                batch = [(r.uuid, r.kind, r.payload) for r in rows]
            if not batch:
                return {"ok": True, "sent": 0, "kind": "none"}
            if batch[0][1] == outbox.RPC_KIND:
                return self._send_rpc(batch[0])
            data = []
            for item in batch:
                if item[1] == outbox.RPC_KIND:
                    break
                data.append(item)
            return self._send_ingest(data)

    def maybe_sync(self) -> dict[str, Any] | None:
        """``sync_once`` unless backing off; None when skipped."""
        if self._clock() < self._next_attempt:
            return None
        return self.sync_once()

    def flush(self, max_batches: int = 50) -> dict[str, Any]:
        """Drain the outbox now (ignores backoff); stops at the first failure or when empty."""
        sent = 0
        result: dict[str, Any] = {"ok": True}
        for _ in range(max_batches):
            result = self.sync_once()
            sent += result["sent"]
            if not result["ok"] or result["sent"] == 0:
                break
        return {"ok": result["ok"], "sent": sent, "reason": result.get("reason"), **self.status()}

    async def run(self, stop: asyncio.Event, interval_s: float = 2.0) -> None:
        """Background loop: keep draining while rows are pending, otherwise poll every ``interval_s``."""
        while not stop.is_set():
            try:
                result = await asyncio.to_thread(self.maybe_sync)
            except Exception:
                log.exception("sync iteration failed")
                result = None
            busy = bool(result and result["ok"] and result["sent"])
            try:
                await asyncio.wait_for(stop.wait(), timeout=0.05 if busy else interval_s)
            except asyncio.TimeoutError:
                pass

    # ------------------------------------------------------------------ ad-hoc cloud calls
    def request(self, method: str, path: str, json: dict[str, Any] | None = None,
                params: dict[str, Any] | None = None, *, skip_if_offline: bool = False) -> Any | None:
        """Call the cloud API; returns parsed JSON on 2xx, else None. Honours the WAN switch.

        ``skip_if_offline`` avoids a slow timeout while a recent failure is still backing off.
        """
        if not self._wan_up:
            return None
        if skip_if_offline and not self.cloud_online and self._clock() < self._next_attempt:
            return None
        try:
            resp = self._client.request(method, f"{self.cloud_url}{path}", json=json, params=params)
        except httpx.HTTPError as exc:
            self._fail(f"{type(exc).__name__} on {method} {path}")
            return None
        self._mark_online()
        if resp.is_success:
            return resp.json() if resp.content else {}
        self.last_error = f"HTTP {resp.status_code} on {method} {path}"
        return None

    # ------------------------------------------------------------------ status
    def backlog(self) -> int:
        return outbox.backlog(self.db)

    def status(self) -> dict[str, Any]:
        wait = max(0.0, self._next_attempt - self._clock())
        return {
            "online": self.cloud_online, "cloud": "online" if self.cloud_online else "offline",
            "wan_up": self._wan_up, "backlog": self.backlog(), "backlog_by_priority": outbox.backlog_by_priority(self.db),
            "last_sync_ts": self.last_sync_ts, "last_attempt_ts": self.last_attempt_ts,
            "last_error": self.last_error, "offline_since": self.offline_since, "failures": self._failures,
            "next_attempt_in_s": round(wait, 1), "synced_total": self.synced_total, "batch_size": self.batch_size,
            "cloud_url": self.cloud_url,
        }

    def close(self) -> None:
        self._client.close()

    # ------------------------------------------------------------------ internals
    def _send_ingest(self, batch: list[tuple[str, str, dict]]) -> dict[str, Any]:
        body = {"items": [{"uuid": u, "kind": k, "payload": p} for u, k, p in batch],
                "sent_at": time.time(), "edge": {"site_id": config.SITE_ID, "machine_id": config.MACHINE_ID}}
        uuids = [u for u, _, _ in batch]
        self.last_attempt_ts = time.time()
        try:
            resp = self._client.post(f"{self.cloud_url}/ingest/batch", json=body)
        except httpx.HTTPError as exc:
            return self._batch_failed(uuids, f"{type(exc).__name__}: cloud unreachable")
        self._mark_online()
        if not resp.is_success:
            return self._batch_failed(uuids, f"HTTP {resp.status_code} from /ingest/batch")
        self._mark_synced(uuids)
        return {"ok": True, "sent": len(uuids), "kind": "ingest"}

    def _send_rpc(self, row: tuple[str, str, dict]) -> dict[str, Any]:
        uuid, _, call = row
        self.last_attempt_ts = time.time()
        try:
            resp = self._client.request(call["method"], f"{self.cloud_url}{call['path']}", json=call.get("json"))
        except httpx.HTTPError as exc:
            return self._batch_failed([uuid], f"{type(exc).__name__}: cloud unreachable")
        self._mark_online()
        if resp.status_code >= 500:
            return self._batch_failed([uuid], f"HTTP {resp.status_code} from {call['path']}")
        result = resp.json() if resp.is_success and resp.content else None
        if not resp.is_success:                       # a rejected call is not data: log it and move on
            log.error("queued call %s %s rejected: HTTP %s", call["method"], call["path"], resp.status_code)
        self._mark_synced([uuid])
        if self.on_rpc_result is not None:
            self.on_rpc_result(call, result)
        return {"ok": True, "sent": 1, "kind": "rpc"}

    def _mark_synced(self, uuids: list[str]) -> None:
        now = time.time()
        with self.db.session() as s:
            s.execute(update(OutboxRow).where(OutboxRow.uuid.in_(uuids))
                      .values(synced_at=now, attempts=OutboxRow.attempts + 1))
        self.synced_total += len(uuids)
        self.last_sync_ts = now
        self.last_error = None
        self._failures, self._next_attempt = 0, 0.0

    def _batch_failed(self, uuids: list[str], reason: str) -> dict[str, Any]:
        with self.db.session() as s:
            s.execute(update(OutboxRow).where(OutboxRow.uuid.in_(uuids)).values(attempts=OutboxRow.attempts + 1))
        self._fail(reason)
        return {"ok": False, "sent": 0, "kind": "error", "reason": reason}

    def _fail(self, reason: str) -> None:
        self._failures += 1
        delay = min(self.max_backoff_s, self.base_backoff_s * 2 ** (self._failures - 1))
        self._next_attempt = self._clock() + delay
        self.last_error = reason
        if "HTTP" not in reason:
            self._mark_offline(reason)
        if self._failures in (1, 5) or self._failures % 20 == 0:
            log.warning("cloud sync failed (%d in a row, retry in %.0f s): %s", self._failures, delay, reason)

    def _mark_online(self) -> None:
        if not self.cloud_online:
            log.info("cloud online")
        self.cloud_online, self.offline_since = True, None

    def _mark_offline(self, reason: str) -> None:
        if self.cloud_online or self.offline_since is None:
            self.offline_since = time.time()
        self.cloud_online = False
        self.last_error = reason
