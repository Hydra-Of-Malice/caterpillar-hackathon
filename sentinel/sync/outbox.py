"""Outbox helpers. Rows are written in the same transaction as the domain row they describe.

Priorities (03 §5.3): 0 = T-CRIT and incidents, 1 = alerts / acks / events, 2 = shift and exposure,
3 = feature windows, 9 = queued cloud calls (run after all data has been delivered).
"""
from __future__ import annotations

import threading
import time
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sentinel.store.db import Database
from sentinel.store.models import OutboxRow

P_CRITICAL, P_ALERT, P_SHIFT, P_WINDOW, P_RPC = 0, 1, 2, 3, 9
RPC_KIND = "rpc"

_clock_lock = threading.Lock()
_last_created = 0.0


def _created_at() -> float:
    """Strictly increasing timestamp so FIFO order within a priority survives equal clock reads."""
    global _last_created
    with _clock_lock:
        _last_created = max(time.time(), _last_created + 1e-6)
        return _last_created


def enqueue(session: Session, kind: str, payload: dict[str, Any], priority: int) -> str:
    """Add one outbox row (idempotency key = a fresh UUID) to ``session``; returns the UUID."""
    uuid = str(uuid4())
    session.add(OutboxRow(uuid=uuid, kind=kind, payload=payload, priority=priority,
                          attempts=0, created_at=_created_at()))
    return uuid


def enqueue_rpc(session: Session, method: str, path: str, body: dict[str, Any] | None = None) -> str:
    """Queue a cloud API call (e.g. competency evaluation) to run once all queued data is synced."""
    return enqueue(session, RPC_KIND, {"method": method, "path": path, "json": body or {}}, P_RPC)


def pending_query():
    return (select(OutboxRow).where(OutboxRow.synced_at.is_(None))
            .order_by(OutboxRow.priority, OutboxRow.created_at))


def backlog(db: Database) -> int:
    with db.session() as s:
        return int(s.scalar(select(func.count()).select_from(OutboxRow).where(OutboxRow.synced_at.is_(None))) or 0)


def backlog_by_priority(db: Database) -> dict[int, int]:
    with db.session() as s:
        rows = s.execute(select(OutboxRow.priority, func.count()).where(OutboxRow.synced_at.is_(None))
                         .group_by(OutboxRow.priority)).all()
    return {int(p): int(n) for p, n in rows}
