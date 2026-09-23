"""Parse the approved SAMPLE corpus (corpus/*.md) and chunk it by numbered section.

Each document has YAML front matter (doc_id, version, safety_critical, approval_status, ...).
Every `### N.M Title` subsection is one chunk; a `## N.` section without subsections is one chunk.
Chunk ids are `DOC@VERSION#SECTION`, e.g. `SOP-EX-04@1.2#3.2`, and every chunk carries a sha256.
Only the latest approved version of each doc_id is indexed.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from sentinel.shared.config import CORPUS_DIR

H2 = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$")
H3 = re.compile(r"^###\s+(\d+\.\d+)\s+(.+?)\s*$")


@dataclass(frozen=True)
class Document:
    doc_id: str
    version: str
    title: str
    safety_critical: bool
    approval_status: str
    meta: dict[str, Any]
    path: str
    sha256: str
    watermark: str


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    version: str
    section: str
    heading: str
    text: str            # body only (what gets quoted)
    doc_title: str
    safety_critical: bool
    sha256: str

    @property
    def search_text(self) -> str:
        """Document title + heading + body; titles and headings help retrieval."""
        return f"{self.doc_title}. {self.heading}. {self.text}"


def _version_key(v: str) -> tuple[int, ...]:
    return tuple(int(p) if p.isdigit() else 0 for p in re.split(r"[.\-]", v))


def parse_document(path: Path) -> tuple[Document, list[Chunk]]:
    """Parse one markdown SOP into its Document and section chunks."""
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        raise ValueError(f"{path.name}: missing front matter")
    _, front, body = raw.split("---", 2)
    meta = yaml.safe_load(front) or {}
    doc_id, version = str(meta["doc_id"]), str(meta["version"])
    lines = body.strip().splitlines()
    watermark = next((ln.lstrip("> ").strip() for ln in lines if ln.startswith(">")), "")
    doc = Document(doc_id=doc_id, version=version, title=str(meta.get("title", doc_id)),
                   safety_critical=bool(meta.get("safety_critical", False)),
                   approval_status=str(meta.get("approval_status", "draft")), meta=meta, path=str(path),
                   sha256=hashlib.sha256(raw.encode("utf-8")).hexdigest(), watermark=watermark)

    sections: list[tuple[str, str, list[str]]] = []      # (section, heading, body lines)
    h2_title: dict[str, str] = {}
    for ln in lines:
        if m := H2.match(ln):
            h2_title[m.group(1)] = m.group(2)
            sections.append((m.group(1), m.group(2), []))
        elif m := H3.match(ln):
            sections.append((m.group(1), m.group(2), []))
        elif sections and ln.strip() and not ln.startswith(("#", ">")):
            sections[-1][2].append(ln.strip())
    chunks = []
    for section, heading, body_lines in sections:
        text = " ".join(body_lines).strip()
        if not text:
            continue                                      # an H2 that only groups subsections
        parent = h2_title.get(section.split(".")[0])
        full_heading = f"{parent} — {heading}" if parent and "." in section else heading
        chunks.append(Chunk(chunk_id=f"{doc_id}@{version}#{section}", doc_id=doc_id, version=version,
                            section=section, heading=full_heading, text=text, doc_title=doc.title,
                            safety_critical=doc.safety_critical,
                            sha256=hashlib.sha256(text.encode("utf-8")).hexdigest()))
    return doc, chunks


def load_corpus(corpus_dir: Path = CORPUS_DIR) -> tuple[dict[str, Document], list[Chunk]]:
    """Latest approved version of every document in the corpus, and its chunks."""
    latest: dict[str, tuple[Document, list[Chunk]]] = {}
    for path in sorted(corpus_dir.glob("*.md")):
        doc, chunks = parse_document(path)
        if doc.approval_status != "approved":
            continue
        prev = latest.get(doc.doc_id)
        if prev is None or _version_key(doc.version) > _version_key(prev[0].version):
            latest[doc.doc_id] = (doc, chunks)
    docs = {d.doc_id: d for d, _ in latest.values()}
    chunks = [c for _, cs in latest.values() for c in cs]
    return docs, chunks
