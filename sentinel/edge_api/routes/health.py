"""GET /health · GET /sync/status · POST /sync/flush."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime

router = APIRouter(tags=["health"])


@router.get("/health")
def health(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Heartbeat age, protection active/degraded, broker, cloud, outbox backlog, versions."""
    return rt.health()


@router.get("/sync/status")
def sync_status(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    return rt.sync.status()


@router.post("/sync/flush")
def sync_flush(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Try to drain the outbox now (ignores backoff; a no-op while the WAN is down)."""
    return rt.sync.flush()
