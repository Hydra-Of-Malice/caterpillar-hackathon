"""Edge API settings, read from the environment when the app is created (not at import)."""
from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel

from sentinel.shared import config


def edge_state_path(db_url: str) -> Path:
    """Runtime-state JSON beside the edge DB (continuous operation, idle counters, progress)."""
    if db_url.startswith("sqlite:///") and ":memory:" not in db_url:
        db_path = Path(db_url.removeprefix("sqlite:///"))
        return db_path.with_name(db_path.stem + "_state.json")
    return config.DATA_DIR / "edge_state.json"


class EdgeSettings(BaseModel):
    db_url: str = config.EDGE_DB_URL
    bus_kind: str = "mqtt"
    cloud_url: str = config.CLOUD_API_URL
    demo_mode: bool = config.DEMO_MODE
    site_id: str = config.SITE_ID
    machine_id: str = config.MACHINE_ID
    models_dir: Path = config.MODELS_DIR
    state_path: Path | None = None
    cloud_connect_timeout_s: float = 0.5
    sync_interval_s: float = 2.0
    snapshot_hz: float = 2.0
    queue_max: int = 600                    # 60 s of 10 Hz telemetry before the oldest samples are dropped
    mqtt_connect_timeout_s: float = 2.0

    @classmethod
    def from_env(cls) -> "EdgeSettings":
        env = os.environ
        return cls(
            db_url=env.get("SENTINEL_EDGE_DB", config.EDGE_DB_URL),
            bus_kind=env.get("SENTINEL_BUS", "mqtt"),
            cloud_url=env.get("SENTINEL_CLOUD_API", config.CLOUD_API_URL),
            demo_mode=env.get("DEMO_MODE", "1") == "1",
            site_id=env.get("SENTINEL_SITE", config.SITE_ID),
            machine_id=env.get("SENTINEL_MACHINE", config.MACHINE_ID),
        )

    def resolved_state_path(self) -> Path:
        return self.state_path or edge_state_path(self.db_url)
