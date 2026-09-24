"""Idempotent Task Centre demo seed: ``python -m sentinel.taskcentre.seed``.

Creates the site and its geofence, the five demo accounts, the machines and cameras the Task Centre
shows, DEMO training placeholders, 30 days of SIMULATED machine state and maintenance history, and a handful of location reports (one deliberately stale and far
away, so the nearest-operator logic has an honest negative case).

It creates **no tasks**: the operator's "no tasks assigned yet" empty state must be real on first run.
Re-running never overwrites existing rows, so demo edits and changed passwords survive.
"""
from __future__ import annotations

import json
import time
from math import cos, radians
from typing import Any

from sqlalchemy.orm import Session

from sentinel.shared import config
from sentinel.store.db import Database
from sentinel.store.models import MachineRow
from sentinel.store.taskcentre_models import (CameraRow, GeofenceRow, SiteRow, TrainingVideoRow, UserRow)
from sentinel.taskcentre.auth import hash_password
from sentinel.taskcentre.fleet import seed_fleet_history
from sentinel.taskcentre.geo import classify
from sentinel.taskcentre.service import latest_location, record_location

SITE_ID = config.SITE_ID                     # "north-quarry" unless SENTINEL_SITE overrides it
SITE_NAME = "North Quarry"
GEOFENCE_ID = "fence-north-quarry"
CENTER_LAT = 12.9184                         # fictional quarry east of Bengaluru (SIMULATED demo world)
CENTER_LON = 77.7325
RADIUS_M = 500.0
MAX_ACCURACY_M = 100.0

# (user_id, username, password, role, name, supervisor_id, machine_id)
USERS = [
    ("u_admin", "admin", "admin123", "admin", "Meera Iyer", None, None),
    ("u_super1", "super1", "super123", "supervisor", "Priya Nair", None, None),
    ("u_op1", "op1", "op123", "operator", "Ravi Kumar", "u_super1", "EX-07"),
    ("u_op2", "op2", "op123", "operator", "Anita Rao", "u_super1", "EX-09"),
    ("u_op3", "op3", "op123", "operator", "Joe Mendes", "u_super1", "EX-11"),
]

# (machine_id, model, machine_type) - EX-07/EX-09 already exist in the copilot fixtures
MACHINES = [("EX-07", "Cat 320 (simulated)", "EX-20t"), ("EX-09", "Cat 320 (simulated)", "EX-20t"),
            ("EX-11", "Cat 320 (simulated)", "EX-20t"), ("EX-04", "Cat 336 (simulated)", "EX-36t")]

# (camera_id, machine_id, label)
CAMERAS = [("cam-ex-07", "EX-07", "EX-07 cab view"), ("cam-ex-09", "EX-09", "EX-09 cab view"),
           ("cam-ex-11", "EX-11", "EX-11 cab view"), ("cam-yard-01", "EX-04", "North yard wide angle")]

# (video_id, title, category, duration_min, description)
TRAINING_VIDEOS = [
    ("vid-walkaround", "Excavator pre-start walkaround", "safety", 4.0,
     "The order to walk the machine in and what stops the shift before it starts."),
    ("vid-exclusion", "Working near people: exclusion zones", "safety", 5.0,
     "Setting, marking and holding the zone while the bucket is live."),
    ("vid-swing", "Truck loading: smooth swing technique", "operations", 6.0,
     "Why a slower swing at the truck costs seconds and saves cycles."),
    ("vid-bench", "Slope and bench safety basics", "safety", 4.5,
     "Reading the bench, standing back from the edge and spotting tension cracks."),
    ("vid-hydraulics", "Hydraulic warning lights: what to do", "maintenance", 3.5,
     "Which lamps mean stop now, and who to call."),
    ("vid-radio", "Radio discipline and stop-work authority", "safety", 3.0,
     "Clear calls, read-backs and using stop-work without hesitation."),
    ("vid-fatigue", "Fatigue: recognising the signs", "wellbeing", 4.0,
     "Self-checks, micro-sleep warning signs and how to report them."),
]


def _offset(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """Shift a WGS84 point by a small distance in metres (flat-earth approximation, fine at this scale)."""
    return lat + north_m / 111_320.0, lon + east_m / (111_320.0 * cos(radians(lat)))


def _seed_site(s: Session) -> dict[str, Any]:
    created = []
    if s.get(SiteRow, SITE_ID) is None:
        s.add(SiteRow(site_id=SITE_ID, name=SITE_NAME, meta={"simulated": True}))
        created.append("site")
    if s.get(GeofenceRow, GEOFENCE_ID) is None:
        s.add(GeofenceRow(geofence_id=GEOFENCE_ID, site_id=SITE_ID, name=f"{SITE_NAME} perimeter",
                          center_lat=CENTER_LAT, center_lon=CENTER_LON, radius_m=RADIUS_M,
                          max_accuracy_m=MAX_ACCURACY_M, active=True))
        created.append("geofence")
    s.flush()
    return {"created": created}


def _seed_users(s: Session) -> list[str]:
    created = []
    for user_id, username, password, role, name, supervisor_id, machine_id in USERS:
        if s.get(UserRow, user_id) is not None:
            continue
        s.add(UserRow(user_id=user_id, username=username, password_hash=hash_password(password), role=role,
                      name=name, site_id=SITE_ID, supervisor_id=supervisor_id, machine_id=machine_id,
                      active=True, created_at=time.time(), meta={"demo": True}))
        created.append(username)
    s.flush()
    return created


def _seed_machines_and_cameras(s: Session, now: float) -> dict[str, list[str]]:
    machines, cameras = [], []
    for machine_id, model, machine_type in MACHINES:
        if s.get(MachineRow, machine_id) is None:
            s.add(MachineRow(machine_id=machine_id, model=model, machine_type=machine_type, site_id=SITE_ID,
                             prox_fitted=True, meta={"simulated": True, "task_centre": True}))
            machines.append(machine_id)
    for camera_id, machine_id, label in CAMERAS:
        if s.get(CameraRow, camera_id) is None:
            s.add(CameraRow(camera_id=camera_id, site_id=SITE_ID, machine_id=machine_id,
                            label=f"{label} (simulated)", stream_kind="simulated", last_frame_ts=now,
                            meta={"simulated": True}))
            cameras.append(camera_id)
    s.flush()
    return {"machines": machines, "cameras": cameras}


def _seed_training(s: Session) -> list[str]:
    created = []
    for index, (video_id, title, category, duration_min, description) in enumerate(TRAINING_VIDEOS):
        if s.get(TrainingVideoRow, video_id) is not None:
            continue
        s.add(TrainingVideoRow(video_id=video_id, title=title, category=category, duration_min=duration_min,
                               url=None, description=description, order_index=index))
        created.append(video_id)
    s.flush()
    return created


def _seed_locations(s: Session, now: float) -> list[str]:
    """A few position reports so people views and nearest-operator logic have data on first run.

    op3 is deliberately stale (3 h old) and ~4 km away: the demo must show what "no eligible operator"
    and "last seen 3 h ago" actually look like.
    """
    fence = s.get(GeofenceRow, GEOFENCE_ID)
    lat_in, lon_in = _offset(CENTER_LAT, CENTER_LON, 80.0, -60.0)
    lat_edge, lon_edge = _offset(CENTER_LAT, CENTER_LON, -310.0, 240.0)
    lat_far, lon_far = _offset(CENTER_LAT, CENTER_LON, 3_600.0, 1_800.0)
    plan = [
        # (user_id, age_s, lat, lon, accuracy_m)
        ("u_super1", 45.0, *_offset(CENTER_LAT, CENTER_LON, 20.0, 30.0), 10.0),
        ("u_op1", 90.0, lat_in, lon_in, 8.0),
        ("u_op2", 240.0, lat_edge, lon_edge, 15.0),
        ("u_op3", 3 * 3600.0, lat_far, lon_far, 25.0),
    ]
    created = []
    for user_id, age_s, lat, lon, accuracy_m in plan:
        if s.get(UserRow, user_id) is None or latest_location(s, user_id) is not None:
            continue
        status, _ = classify(lat, lon, accuracy_m, fence)
        record_location(s, user_id, ts=now - age_s, lat=lat, lon=lon, accuracy_m=accuracy_m,
                        geofence_status=status, source="simulated")
        created.append(user_id)
    return created


def seed_task_centre(s: Session, *, now: float | None = None) -> dict[str, Any]:
    """Seed (or top up) the Task Centre demo world. Idempotent; returns what it created."""
    now = time.time() if now is None else now
    site = _seed_site(s)
    users = _seed_users(s)
    hardware = _seed_machines_and_cameras(s, now)
    videos = _seed_training(s)
    locations = _seed_locations(s, now)
    fleet_history = seed_fleet_history(s, now=now)
    return {"site_id": SITE_ID, "geofence": {"geofence_id": GEOFENCE_ID, "center_lat": CENTER_LAT,
                                             "center_lon": CENTER_LON, "radius_m": RADIUS_M,
                                             "max_accuracy_m": MAX_ACCURACY_M},
            "created": {"site_rows": site["created"], "users": users, "machines": hardware["machines"],
                        "cameras": hardware["cameras"], "training_videos": videos,
                        "location_reports": locations, "fleet_history": fleet_history["created"]},
            "tasks": 0, "note": "No tasks seeded: the operator empty state must be genuine.",
            "credentials": {username: password for _, username, password, _, _, _, _ in USERS}}


def main() -> None:
    """Seed the cloud database (``data/cloud.db``) and print what happened."""
    with Database.cloud().session() as s:
        result = seed_task_centre(s)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
