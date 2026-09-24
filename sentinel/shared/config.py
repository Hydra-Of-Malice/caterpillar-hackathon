"""Paths, settings and YAML config loading."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")   # local, gitignored; never commit secrets here
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"

#: The built web app. When present the cloud API serves it, so the whole demo is one origin and one
#: tunnel — which is what makes it reachable from a phone with geolocation working (HTTPS).
WEB_DIST = Path(os.getenv("SENTINEL_WEB_DIST", str(ROOT / "web" / "dist")))

#: Staged camera stills and clips, served from local storage (see `sentinel.taskcentre.media`).
#: Drop a file at ``media/cameras/<camera_id>/still.jpg`` and the demo shows it.
MEDIA_DIR = Path(os.getenv("SENTINEL_MEDIA_DIR", str(ROOT / "media")))

#: Browser origins allowed to call the API cross-origin. Same-origin serving needs none of these;
#: they are for running the Vite dev server against this API. Comma-separated; "*" allows any.
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "SENTINEL_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
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

# Azure OpenAI (training copilot LLM). All optional; unset -> Claude, then extractive-only offline mode.
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", os.getenv("AZURE_FOUNDRY_ENDPOINT", ""))
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", os.getenv("OPENAI_API_KEY", ""))
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT",
                                    os.getenv("AZURE_FOUNDRY_GPT4O_DEPLOYMENT", "gpt-4o"))
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21")

for _d in (DATA_DIR, MODELS_DIR):
    _d.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=None)
def load_yaml(name: str) -> dict[str, Any]:
    """Load config/<name>.yaml (cached). Call load_yaml.cache_clear() in tests after edits."""
    path = CONFIG_DIR / f"{name}.yaml"
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
