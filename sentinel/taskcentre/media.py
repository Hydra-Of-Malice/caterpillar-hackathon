"""Camera stills and clips, served from local storage.

**The convention is the feature.** Each camera owns a directory::

    media/cameras/<camera_id>/still.<ext>     the frame a tile shows
    media/cameras/<camera_id>/clip.<ext>      footage an incident links to

Drop a file in with one of those names and it is served. Nothing is registered, imported or
resized, and no code changes — which is the point, because the people staging this demo want to
replace a mock with a real photograph five minutes before showing it.

Extensions are tried in :data:`STILL_EXTS` / :data:`CLIP_EXTS` order, so a photograph placed beside
the shipped SVG mock wins without anyone deleting the mock first.

**What this is not.** These are staged files, not a camera feed. Nothing here streams, nothing is
recorded, and the API marks every one of them ``simulated`` unless the camera row says otherwise.
A tile that shows a picture must still say where the picture came from - a demo that quietly looks
like live CCTV is the one dishonest thing this system could do.
"""
from __future__ import annotations

from pathlib import Path

from sentinel.shared import config

__all__ = ["MEDIA_ROOT", "STILL_EXTS", "CLIP_EXTS", "camera_dir", "find_still", "find_clip",
           "media_for", "content_type"]

#: Where camera media lives. Override with ``SENTINEL_MEDIA_DIR``.
MEDIA_ROOT: Path = config.MEDIA_DIR / "cameras"

#: Real photography first, then the shipped SVG mock. A dropped-in file always wins.
STILL_EXTS: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg")
CLIP_EXTS: tuple[str, ...] = (".mp4", ".webm", ".mov", ".m4v")

_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/mp4",
}


def content_type(path: Path) -> str:
    """The media type to serve a file as; ``application/octet-stream`` when unrecognised."""
    return _TYPES.get(path.suffix.lower(), "application/octet-stream")


def camera_dir(camera_id: str) -> Path:
    """This camera's directory, resolved and confined to :data:`MEDIA_ROOT`.

    ``camera_id`` reaches here from the URL, so it is treated as hostile: the resolved path must sit
    under the media root or this raises. Without that check a crafted id could read any file the
    service can open.
    """
    root = MEDIA_ROOT.resolve()
    candidate = (root / camera_id).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"camera id {camera_id!r} escapes the media directory")
    return candidate


def _first(camera_id: str, stem: str, exts: tuple[str, ...]) -> Path | None:
    try:
        folder = camera_dir(camera_id)
    except ValueError:
        return None
    for ext in exts:
        candidate = folder / f"{stem}{ext}"
        if candidate.is_file():
            return candidate
    return None


def find_still(camera_id: str) -> Path | None:
    """The still for this camera, or ``None`` when nobody has put one there."""
    return _first(camera_id, "still", STILL_EXTS)


def find_clip(camera_id: str) -> Path | None:
    """The clip for this camera, or ``None``."""
    return _first(camera_id, "clip", CLIP_EXTS)


def media_for(camera_id: str) -> dict[str, object]:
    """What this camera has on disk, in the shape the API reports it.

    ``*_url`` are paths the browser fetches **with its bearer token** - the media route applies the
    same scope as the camera list, so a supervisor cannot read a still from somebody else's site by
    guessing a camera id.
    """
    still, clip = find_still(camera_id), find_clip(camera_id)
    return {
        "still_available": still is not None,
        "still_url": f"/tc/media/camera/{camera_id}/still" if still else None,
        "still_kind": still.suffix.lstrip(".") if still else None,
        "clip_available": clip is not None,
        "clip_url": f"/tc/media/camera/{camera_id}/clip" if clip else None,
        "clip_kind": clip.suffix.lstrip(".") if clip else None,
        "note": ("Staged file served from local storage for the demo. It is not a live feed, nothing "
                 "is streamed and nothing is recorded."),
    }
