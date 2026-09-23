"""Paths, settings and YAML config loading."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "models"
CORPUS_DIR = ROOT / "corpus"

SITE_ID = os.getenv("SENTINEL_SITE", "north-quarry")
MACHINE_ID = os.getenv("SENTINEL_MACHINE", "EX-07")
MQTT_HOST = os.getenv("SENTINEL_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("SENTINEL_MQTT_PORT", "1883"))
EDGE_DB_URL = os.getenv("SENTINEL_EDGE_DB", f"sqlite:///{(DATA_DIR / 'edge.db').as_posix()}")
CLOUD_DB_URL = os.getenv("SENTINEL_CLOUD_DB", f"sqlite:///{(DATA_DIR / 'cloud.db').as_posix()}")
CLOUD_API_URL = os.getenv("SENTINEL_CLOUD_API", "http://127.0.0.1:8100/api/v1")
DEMO_MODE = os.getenv("DEMO_MODE", "1") == "1"
ANTHROPIC_MODEL = os.getenv("SENTINEL_LLM_MODEL", "claude-opus-5-5")

for _d in (DATA_DIR, MODELS_DIR):
    _d.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=None)
def load_yaml(name: str) -> dict[str, Any]:
    """Load config/<name>.yaml (cached). Call load_yaml.cache_clear() in tests after edits."""
    path = CONFIG_DIR / f"{name}.yaml"
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
