"""CAT Sentinel Edge API (port 8000).

    .venv\\Scripts\\uvicorn sentinel.edge_api.main:app --port 8000

Runs the pipeline, alert manager, task-time estimator and outbox sync as background tasks
(see sentinel.edge_api.runtime). Settings come from the environment at app creation:
SENTINEL_BUS (mqtt|memory), SENTINEL_EDGE_DB, SENTINEL_CLOUD_API, DEMO_MODE.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sentinel.edge_api.routes import alerts, breaks, demo, health, incidents, live, shift, tasks
from sentinel.edge_api.runtime import EdgeRuntime
from sentinel.edge_api.settings import EdgeSettings

API_PREFIX = "/api/v1"
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def create_app(settings: EdgeSettings | None = None) -> FastAPI:
    """Build the edge app; the runtime starts in the lifespan and stops on shutdown."""
    settings = settings or EdgeSettings.from_env()
    if not logging.getLogger("sentinel").handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        runtime = EdgeRuntime(settings)
        app.state.runtime = runtime
        await runtime.start()
        try:
            yield
        finally:
            await runtime.stop()

    app = FastAPI(title="CAT Sentinel Edge", version="0.1.0", lifespan=lifespan,
                  description="Edge service for one machine: shift, tasks + ETA, alerts, incidents, live view, "
                              "store-and-forward sync. Demo data is SIMULATED.")
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    for module in (health, shift, tasks, alerts, incidents, breaks, live, demo):
        app.include_router(module.router, prefix=API_PREFIX)
    return app


app = create_app()
