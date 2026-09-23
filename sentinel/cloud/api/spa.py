"""Serve the built web app from the cloud API, so one origin carries both.

Why one origin: the demo runs on three devices at once (admin on a laptop, supervisor and operator
on phones), which means the API has to be reachable from something other than localhost. Serving the
built SPA from the same process as the API removes three problems in one move:

* **CORS stops applying** - the browser is asking the origin it was served from, so there is no
  cross-origin request to allow, and no list of tunnel hostnames to keep updated;
* **no mixed content** - a page served over HTTPS may not call an HTTP API, and a tunnel gives HTTPS;
* **geolocation works** - browsers only expose ``navigator.geolocation`` on a secure context
  (HTTPS or localhost). Over a plain ``http://192.168.x.x`` address every punch would silently
  record as ``unverified`` instead of inside/outside, and the geofence would look broken rather than
  blocked.

The API keeps priority: this only mounts if ``web/dist`` has been built, the mount happens *after*
every router, and :func:`_is_api_path` refuses to answer for anything the API owns. A request to a
missing API route must return that route's 404, not the index page.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

log = logging.getLogger(__name__)

#: Prefixes the API owns. A request under one of these is never answered with the SPA shell.
API_PREFIXES: tuple[str, ...] = ("/api/", "/docs", "/redoc", "/openapi.json", "/health")

#: Hashed asset filenames are content-addressed, so they can be cached hard. `index.html` cannot:
#: it names the current bundle, and a stale copy would pin a phone to yesterday's build.
ASSET_CACHE = "public, max-age=31536000, immutable"
INDEX_CACHE = "no-cache"


def _is_api_path(path: str) -> bool:
    return any(path.startswith(p) for p in API_PREFIXES)


def mount_spa(app: FastAPI, dist: Path) -> bool:
    """Serve ``dist`` as the SPA. Returns ``False`` (having changed nothing) when it is not built.

    Client-side routes such as ``/tc/sup`` do not exist on disk, so any unmatched GET falls back to
    ``index.html`` and React Router takes it from there. That fallback is deliberately narrow: only
    GET and HEAD, never an API prefix, and never a path that looks like a missing static file -
    answering a request for ``/assets/main.js`` with HTML produces a blank page and a console error
    about an unexpected ``<``, which is far harder to diagnose than a plain 404.
    """
    index = dist / "index.html"
    if not index.is_file():
        log.info("web/dist not built; API-only. Run `npm run build` in web/ to serve the app here.")
        return False

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str, request: Request) -> Response:  # noqa: ARG001 - path captured by route
        path = request.url.path
        if _is_api_path(path):
            return Response(status_code=404)

        candidate = (dist / path.lstrip("/")).resolve()
        if dist.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate, headers={"Cache-Control": ASSET_CACHE})

        # A missing file with an extension is a missing file, not a client-side route.
        if "." in Path(path).name:
            return Response(status_code=404)

        return FileResponse(index, headers={"Cache-Control": INDEX_CACHE})

    log.info("serving the web app from %s", dist)
    return True
