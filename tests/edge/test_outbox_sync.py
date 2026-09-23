"""Outbox ordering, batching, offline durability, WAN switch and queued cloud calls."""
from __future__ import annotations

import httpx
import pytest

from sentinel.store.models import OutboxRow
from sentinel.sync import outbox
from sentinel.sync.agent import SyncAgent


class FakeCloud:
    """httpx transport standing in for the cloud: records batches, can be switched off."""

    def __init__(self) -> None:
        self.up = True
        self.status = 200
        self.batches: list[list[dict]] = []
        self.calls: list[tuple[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if not self.up:
            raise httpx.ConnectError("cloud unreachable", request=request)
        self.calls.append((request.method, request.url.path))
        if request.url.path.endswith("/ingest/batch"):
            if self.status != 200:
                return httpx.Response(self.status, json={"detail": "fail"})
            import json
            self.batches.append(json.loads(request.content)["items"])
            return httpx.Response(200, json={"accepted": len(self.batches[-1])})
        return httpx.Response(200, json={"gaps": [{"competency_id": "C04"}]})


@pytest.fixture
def cloud() -> FakeCloud:
    return FakeCloud()


@pytest.fixture
def agent(db, cloud) -> SyncAgent:
    clock = {"t": 0.0}
    a = SyncAgent(db, "http://cloud.test/api/v1", transport=httpx.MockTransport(cloud), clock=lambda: clock["t"])
    a.clock = clock                                                                # test handle
    yield a
    a.close()


def _fill(db, n_by_priority: dict[int, int]) -> None:
    with db.session() as s:
        for prio in (5, 3, 1, 0):                                                  # insert lowest priority first
            for i in range(n_by_priority.get(prio, 0)):
                outbox.enqueue(s, "event", {"prio": prio, "i": i}, prio)


def test_priority_order_fifo_and_batch_size(agent, cloud, db):
    _fill(db, {0: 3, 1: 250, 3: 10})
    result = agent.flush()
    assert result["ok"] and result["backlog"] == 0 and result["sent"] == 263
    assert [len(b) for b in cloud.batches] == [200, 63]
    order = [(item["payload"]["prio"], item["payload"]["i"]) for batch in cloud.batches for item in batch]
    assert order[:3] == [(0, 0), (0, 1), (0, 2)]                                   # T-CRIT priority first
    assert order == sorted(order)                                                 # priority, then FIFO
    assert all({"uuid", "kind", "payload"} <= set(item) for item in cloud.batches[0])


def test_offline_keeps_everything_and_backs_off(agent, cloud, db):
    _fill(db, {0: 5, 1: 5})
    cloud.up = False
    first = agent.sync_once()
    assert not first["ok"] and agent.backlog() == 10 and not agent.cloud_online
    assert agent.status()["cloud"] == "offline" and agent.status()["next_attempt_in_s"] == pytest.approx(1.0)
    assert agent.maybe_sync() is None                                              # backing off
    agent.clock["t"] = 1.0
    agent.maybe_sync()
    assert agent.status()["next_attempt_in_s"] == pytest.approx(2.0)               # exponential
    with db.session() as s:
        assert all(r.attempts == 2 and r.synced_at is None for r in s.query(OutboxRow))
    cloud.up = True
    assert agent.flush()["backlog"] == 0 and agent.cloud_online
    uuids = [i["uuid"] for b in cloud.batches for i in b]
    assert len(uuids) == len(set(uuids)) == 10                                     # nothing lost, nothing duplicated


def test_http_error_keeps_items(agent, cloud, db):
    _fill(db, {1: 3})
    cloud.status = 500
    assert not agent.sync_once()["ok"] and agent.backlog() == 3


def test_wan_switch_partitions_without_requests(agent, cloud, db):
    _fill(db, {1: 2})
    agent.set_wan(False)
    assert agent.sync_once()["reason"] == "wan_down" and cloud.calls == []
    assert agent.request("GET", "/operators/OP-1042/profile") is None and cloud.calls == []
    assert agent.status()["cloud"] == "offline" and agent.backlog() == 2
    agent.set_wan(True)
    assert agent.flush()["backlog"] == 0


def test_queued_call_runs_after_data(agent, cloud, db):
    results = []
    agent.on_rpc_result = lambda call, result: results.append((call["path"], result))
    with db.session() as s:
        outbox.enqueue_rpc(s, "POST", "/competency/evaluate", {"operator_id": "OP-1042", "shift_id": "SH-1"})
    _fill(db, {1: 3})
    agent.flush()
    assert cloud.calls[0][1].endswith("/ingest/batch") and cloud.calls[-1][1].endswith("/competency/evaluate")
    assert results == [("/competency/evaluate", {"gaps": [{"competency_id": "C04"}]})]
    assert agent.backlog() == 0
