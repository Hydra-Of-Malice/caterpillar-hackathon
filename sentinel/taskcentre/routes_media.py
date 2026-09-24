"""Serve staged camera stills and clips, scoped the same way the camera list is.

A picture of a worksite shows people at work, so it is not public: this route applies exactly the
scope ``GET /tc/sup/cameras`` applies. A supervisor sees cameras on machines their own team is
working; an admin sees the site; an operator sees the camera on their own machine. Guessing another
site's camera id gets a 404, not a photograph.

Because an ``<img src>`` cannot carry an Authorization header, the browser fetches these with its
bearer token and renders the result from a blob URL (see ``useAuthedMedia`` in the web app). That is
the whole reason this is a route rather than a static mount — a static mount would have been two
lines and would have published every frame to anyone who found the path.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.cloud.api.deps import get_session
from sentinel.store.taskcentre_models import CameraRow, TcTaskRow, UserRow
from sentinel.taskcentre import media
from sentinel.taskcentre.auth import current_user, require_roles

router = APIRouter(prefix="/tc/media", tags=["task-centre-media"],
                   dependencies=[Depends(require_roles("admin", "supervisor", "operator"))])

#: A staged file never changes under a given camera id during a demo, but it may be replaced between
#: runs, so this is short enough that swapping a photograph in is visible on the next page load.
CACHE = "private, max-age=30"


def _machine_ids_for(s: Session, user: UserRow) -> set[str]:
    """Machines this person may look at: their own, their team's, and any they are tasked on."""
    if user.role == "operator":
        return {user.machine_id} - {None}  # type: ignore[operator]
    operators = list(s.scalars(select(UserRow).where(UserRow.supervisor_id == user.user_id,
                                                     UserRow.role == "operator")))
    ids = {o.machine_id for o in operators if o.machine_id}
    if user.machine_id:
        ids.add(user.machine_id)
    if operators:
        tasked = s.scalars(select(TcTaskRow.machine_id)
                           .where(TcTaskRow.operator_id.in_([o.user_id for o in operators]),
                                  TcTaskRow.machine_id.is_not(None)))
        ids |= {m for m in tasked if m}
    return ids


def _visible_camera(s: Session, user: UserRow, camera_id: str) -> CameraRow:
    """The camera row, or 404. A camera outside the caller's scope is 404, never 403.

    404 rather than 403 on purpose: answering "that exists but is not yours" to a guessed id tells
    somebody which camera ids are real, which is the first half of the thing this route prevents.
    """
    camera = s.get(CameraRow, camera_id)
    if camera is None:
        raise HTTPException(404, f"camera {camera_id!r} not found")
    if user.role == "admin":
        return camera
    if camera.machine_id and camera.machine_id in _machine_ids_for(s, user):
        return camera
    raise HTTPException(404, f"camera {camera_id!r} not found")


@router.get("/camera/{camera_id}/{kind}")
def camera_media(camera_id: str, kind: Literal["still", "clip"], s: Session = Depends(get_session),
                 user: UserRow = Depends(current_user)) -> FileResponse:
    """The staged still or clip for a camera the caller may see.

    404 when the camera is out of scope, and 404 when nobody has put a file in its directory — an
    absent file is not an error, it is a camera with no staged media, and the tile renders its
    honest "no picture" state.
    """
    _visible_camera(s, user, camera_id)
    path = media.find_still(camera_id) if kind == "still" else media.find_clip(camera_id)
    if path is None:
        raise HTTPException(404, f"no {kind} staged for camera {camera_id!r}")
    return FileResponse(path, media_type=media.content_type(path),
                        headers={"Cache-Control": CACHE})


@router.get("/cameras")
def list_media(s: Session = Depends(get_session),
               user: UserRow = Depends(current_user)) -> dict[str, Any]:
    """What is staged for every camera the caller can see. Used by the demo panel and diagnostics."""
    rows = list(s.scalars(select(CameraRow).order_by(CameraRow.camera_id)))
    if user.role != "admin":
        allowed = _machine_ids_for(s, user)
        rows = [c for c in rows if c.machine_id in allowed]
    return {
        "count": len(rows),
        "media_root": str(media.MEDIA_ROOT),
        "cameras": [{"camera_id": c.camera_id, "label": c.label, "machine_id": c.machine_id,
                     **media.media_for(c.camera_id)} for c in rows],
        "how_to_add": ("Put a file at media/cameras/<camera_id>/still.jpg (or .png/.svg) and it is "
                       "served on the next request. clip.mp4 works the same way. Nothing needs "
                       "registering and the service does not need restarting."),
        "note": ("Staged files served from local storage. Not a live feed: nothing is streamed and "
                 "nothing is recorded."),
    }
