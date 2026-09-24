"""CAT Sentinel Cloud API (port 8100): `uvicorn sentinel.cloud.api.main:app --port 8100`.

All routes live under /api/v1. When ``web/dist`` is built it is also served from here, so the
demo can run from a single origin (see ``sentinel.cloud.api.spa``). CORS allows the Vite dev server
by default and is overridable with ``SENTINEL_CORS_ORIGINS``. Auth is MOCK:
the `X-Role` header (operator|trainee|instructor|supervisor|ml_service; operator when absent)
guards competency sign-off, content approval, escalation resolution and individual drill-downs.
In DEMO_MODE the app seeds deterministic SIMULATED fixtures at startup so every view has data.
"""
from __future__ import annotations

import importlib
import sys
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator, Callable

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sentinel.cloud.api import routes_competency, routes_ops, routes_training
from sentinel.cloud.api.spa import mount_spa
from sentinel.cloud.competency.catalog import get_catalog
from sentinel.cloud.demo import seed_demo
from sentinel.cloud.rag.answer import Copilot
from sentinel.shared import config
from sentinel.shared.config import load_yaml
from sentinel.store.db import Database

log = logging.getLogger(__name__)
API_PREFIX = "/api/v1"
OPTIONAL_ROUTERS = (
    "sentinel.practice.api",
    # AI Task Centre: worksite users/roles, geofenced punches, assignable tasks, chat,
    # review flags and the simulated AI brain. Additive; the copilot routes are unchanged.
    "sentinel.taskcentre.routes_auth",
    "sentinel.taskcentre.routes_admin",
    "sentinel.taskcentre.routes_supervisor",
    "sentinel.taskcentre.routes_operator",
    "sentinel.taskcentre.routes_chat",
    "sentinel.taskcentre.routes_media",
    "sentinel.taskcentre.routes_sim",
)


def _include_optional(app: FastAPI, module_name: str) -> None:
    """Mount `module.router` under /api/v1 if the module imports; log and skip otherwise."""
    try:
        module = importlib.import_module(module_name)
        router = getattr(module, "router")
    except ModuleNotFoundError as exc:
        log.warning("optional router %s not mounted: %s", module_name, exc)
        return
    except Exception:   # a broken optional module must not take the cloud API down
        log.exception("optional router %s failed to import; not mounted", module_name)
        return
    app.include_router(router, prefix=API_PREFIX)
    log.info("mounted %s at %s%s", module_name, API_PREFIX, getattr(router, "prefix", ""))


def create_app(db: Database | None = None, *, copilot: Copilot | None = None, seed: bool | None = None,
               db_factory: Callable[[], Database] = Database.cloud) -> FastAPI:
    """Build the app. Tests pass a temp Database, an offline Copilot and seed=False."""
    do_seed = config.DEMO_MODE if seed is None else seed

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if do_seed:
            if app.state.db is None:
                app.state.db = app.state.db_factory()
            try:
                with app.state.db.session() as s:
                    log.info("demo seed: %s", seed_demo(s))
            except Exception:
                log.exception("demo seed failed; continuing without fixtures")
            warm = getattr(sys.modules.get("sentinel.practice.api"), "warm_cohort_cache", None)
            if warm is not None:
                warm()          # the Training Effectiveness page's default cohort, precomputed off-thread
        yield

    app = FastAPI(title="CAT Sentinel Cloud", version="0.1.0", lifespan=lifespan,
                  description="Cloud service: ingest, operator profile, competency gap evidence, training hub, "
                              "RAG copilot, re-assessment, supervisor and monitoring. Demo data is SIMULATED; "
                              "bookings and auth are MOCK.")
    app.state.db = db
    app.state.db_factory = db_factory
    app.state.copilot = copilot
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    health = APIRouter(tags=["health"])

    @health.get("/health")
    def get_health() -> dict:
        return {"status": "ok", "service": "cloud", "demo_mode": config.DEMO_MODE,
                "versions": {"competencies": get_catalog().version, "cloud": load_yaml("cloud")["version"]}}

    for router in (health, routes_competency.router, routes_training.router, routes_ops.router):
        app.include_router(router, prefix=API_PREFIX)
    for module_name in OPTIONAL_ROUTERS:
        _include_optional(app, module_name)
    mount_spa(app, config.WEB_DIST)   # last: its catch-all must not shadow a router
    return app


app = create_app()
