"""Model list from the model_registry table and models/**/model_card.json, with placeholders for
the expected model kinds that have not been trained yet."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from sentinel.shared.config import MODELS_DIR
from sentinel.store.models import ModelRegistryRow

EXPECTED_KINDS = {
    "iforest": "Unusual operation detector — Isolation Forest per machine type × task",
    "tasktime": "Task time — LightGBM quantile regression + split-conformal calibration",
    "expert_motion": "Expert Motion Model — practice analyser phase envelopes",
}
NOT_TRAINED = "not trained yet — trains tomorrow"


def _card_files(models_dir: Path) -> list[Path]:
    return sorted(set(models_dir.glob("*/model_card.json")) | set(models_dir.glob("*/*/model_card.json")))


def list_models(s: Session, models_dir: Path = MODELS_DIR) -> dict[str, Any]:
    items: dict[tuple[str, str], dict[str, Any]] = {}
    for r in s.scalars(select(ModelRegistryRow)):
        items[(r.kind, r.version)] = {"model_id": r.model_id, "kind": r.kind, "version": r.version,
                                      "context_key": r.context_key, "sha256": r.sha256, "path": r.path,
                                      "active": r.active, "card": r.card, "source": "model_registry",
                                      "status": "trained"}
    for path in _card_files(models_dir):
        try:
            card = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rel = path.relative_to(models_dir).parts
        kind = str(card.get("kind", rel[0]))
        version = str(card.get("version", rel[1] if len(rel) > 2 else "unversioned"))
        items.setdefault((kind, version), {"model_id": card.get("model_id", f"{kind}-{version}"), "kind": kind,
                                           "version": version, "context_key": card.get("context_key"),
                                           "sha256": card.get("sha256"), "path": str(path.parent), "active": True,
                                           "card": card, "source": "model_card.json", "status": "trained"})
    trained_kinds = {k for k, _ in items}
    placeholders = [{"model_id": None, "kind": kind, "version": None, "title": title, "status": "not_trained",
                     "note": NOT_TRAINED, "card": None, "source": "expected"}
                    for kind, title in EXPECTED_KINDS.items() if kind not in trained_kinds]
    models = sorted(items.values(), key=lambda m: (m["kind"], m["version"]))
    for m in models:
        m.setdefault("title", EXPECTED_KINDS.get(m["kind"], m["kind"]))
    return {"models": models + placeholders, "n_trained": len(models),
            "training_data": "SIMULATED", "label": "SIMULATED"}
