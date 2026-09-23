"""Versioned micro-modules from content/modules/*.yaml with instructor approval and citation checks.

Operators only ever see the latest *approved* version of a module. A version is approved when its
YAML says `status: approved` or an instructor approved it through the content-review queue (an
audit-log row `content_approve`, target `MODULE@VERSION`).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from sentinel.cloud import CONTENT_DIR
from sentinel.cloud.audit import audit_rows
from sentinel.cloud.rag.retriever import HybridRetriever

APPROVE_ACTION = "content_approve"


@dataclass(frozen=True)
class ModuleVersion:
    module_id: str
    version: str
    status: str
    data: dict[str, Any]
    path: str

    @property
    def review_id(self) -> str:
        return f"{self.module_id}@{self.version}"


def _version_key(v: str) -> tuple[int, ...]:
    return tuple(int(p) if p.isdigit() else 0 for p in v.split("."))


@lru_cache(maxsize=4)
def load_module_files(content_dir: Path = CONTENT_DIR) -> tuple[ModuleVersion, ...]:
    """Every module version on disk (cached per directory)."""
    out = []
    for path in sorted(content_dir.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        out.append(ModuleVersion(data["id"], str(data["version"]), data.get("status", "draft"), data, str(path)))
    return tuple(out)


class ModuleStore:
    """Module versions merged with instructor approvals recorded in the audit log."""

    def __init__(self, versions: tuple[ModuleVersion, ...], approvals: dict[str, dict[str, Any]]) -> None:
        self.versions = versions
        self.approvals = approvals

    def status(self, mv: ModuleVersion) -> str:
        return "approved" if mv.status == "approved" or mv.review_id in self.approvals else mv.status

    def approval(self, mv: ModuleVersion) -> dict[str, Any] | None:
        return self.approvals.get(mv.review_id) or mv.data.get("instructor_approved")

    def get(self, module_id: str, version: str) -> ModuleVersion | None:
        return next((m for m in self.versions if m.module_id == module_id and m.version == version), None)

    def latest_approved(self, module_id: str) -> ModuleVersion | None:
        approved = [m for m in self.versions if m.module_id == module_id and self.status(m) == "approved"]
        return max(approved, key=lambda m: _version_key(m.version), default=None)

    def approved_modules(self) -> list[ModuleVersion]:
        ids = sorted({m.module_id for m in self.versions})
        return [m for m in (self.latest_approved(i) for i in ids) if m is not None]

    def previous_approved(self, mv: ModuleVersion) -> ModuleVersion | None:
        older = [m for m in self.versions if m.module_id == mv.module_id and self.status(m) == "approved"
                 and _version_key(m.version) < _version_key(mv.version)]
        return max(older, key=lambda m: _version_key(m.version), default=None)


def module_store(s: Session, content_dir: Path = CONTENT_DIR) -> ModuleStore:
    """Store for the current request (approvals read from the audit log)."""
    approvals = {}
    for row in audit_rows(s, APPROVE_ACTION):
        approvals[row.target] = {"by": row.actor, "version": row.target.split("@", 1)[1],
                                 "date": datetime.fromtimestamp(row.ts, tz=timezone.utc).date().isoformat()}
    return ModuleStore(load_module_files(content_dir), approvals)


def _citations(mv: ModuleVersion) -> list[dict[str, Any]]:
    cites = [kp["citation"] for kp in mv.data.get("key_points", []) if kp.get("citation")]
    cites += [q["citation"] for q in (mv.data.get("quiz") or {}).get("questions", []) if q.get("citation")]
    return cites


def chunk_id_for(citation: dict[str, Any]) -> str:
    return f"{citation['doc_id']}@{citation['version']}#{citation['section']}"


def check_citations(mv: ModuleVersion, retriever: HybridRetriever) -> dict[str, Any]:
    """PASS when every citation resolves to an approved chunk at the document's current version."""
    failures = []
    for cite in _citations(mv):
        doc = retriever.docs.get(cite["doc_id"])
        if doc is None:
            failures.append({"citation": cite, "problem": "document not in the approved corpus"})
        elif str(cite["version"]) != doc.version:
            failures.append({"citation": cite, "problem": f"stale version (document is now v{doc.version})"})
        elif chunk_id_for(cite) not in retriever.by_id:
            failures.append({"citation": cite, "problem": "section not found"})
    unique = {chunk_id_for(c) for c in _citations(mv)}
    return {"status": "FAIL" if failures else "PASS", "n_sources": len(unique), "failures": failures}


def module_summary(mv: ModuleVersion, store: ModuleStore) -> dict[str, Any]:
    d = mv.data
    return {"id": mv.module_id, "version": mv.version, "title": d["title"], "duration_min": d["duration_min"],
            "format": d["format"], "competency_ids": d.get("competency_ids", []),
            "machine_types": d.get("machine_types", []), "summary": d.get("summary", ""),
            "status": store.status(mv), "instructor_approved": store.approval(mv),
            "n_questions": len((d.get("quiz") or {}).get("questions", [])), "label": d.get("label")}


def module_detail(mv: ModuleVersion, store: ModuleStore, retriever: HybridRetriever) -> dict[str, Any]:
    """Operator-facing module: key points with resolved citations (no quiz answers)."""
    key_points = []
    for kp in mv.data.get("key_points", []):
        cite = dict(kp["citation"])
        chunk = retriever.by_id.get(chunk_id_for(cite))
        cite.update({"chunk_id": chunk_id_for(cite), "heading": chunk.heading if chunk else None,
                     "doc_title": chunk.doc_title if chunk else None, "text": chunk.text if chunk else None})
        key_points.append({"id": kp["id"], "text": kp["text"], "citation": cite})
    return {**module_summary(mv, store), "key_points": key_points, "expert_demo": mv.data.get("expert_demo"),
            "change_summary": mv.data.get("change_summary"), "citation_check": check_citations(mv, retriever)}
