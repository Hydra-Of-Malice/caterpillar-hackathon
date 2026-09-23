"""Edge API routers (all mounted under /api/v1)."""
from __future__ import annotations

from fastapi import Request

from sentinel.edge_api.runtime import EdgeRuntime


def get_rt(request: Request) -> EdgeRuntime:
    """Dependency: the app's EdgeRuntime (created in the lifespan)."""
    return request.app.state.runtime
