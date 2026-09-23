"""Citation verification for generated answers (08 §8.5).

Every sentence must cite at least one retrieved chunk as `[chunk_id]`, every cited id must be one of
the retrieved chunks, the sentence's content words must be lexically supported by the cited text,
and every number in the sentence must appear in the cited text. Any failure means the caller
falls back to extractive mode.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sentinel.cloud.rag.ingest import Chunk
from sentinel.cloud.rag.text import numbers, tokens

CITATION_RE = re.compile(r"\[([^\[\]]+)\]")
TRAILING_CITES_RE = re.compile(r"([.!?])((?:\s*\[[^\[\]]+\])+)")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(\[])")
BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.MULTILINE)


@dataclass
class SentenceCheck:
    text: str
    citations: list[str]
    support: float
    numbers_ok: bool
    ok: bool
    reason: str | None = None


@dataclass
class Verification:
    ok: bool
    sentences: list[SentenceCheck] = field(default_factory=list)
    cited_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "n_sentences": len(self.sentences),
                "n_supported": sum(1 for s in self.sentences if s.ok), "cited_ids": self.cited_ids,
                "sentences": [s.__dict__ for s in self.sentences]}


def split_sentences(text: str) -> list[str]:
    """Split into sentences, first moving citations that follow the full stop in front of it."""
    text = BULLET_RE.sub("", text.strip())
    text = TRAILING_CITES_RE.sub(lambda m: m.group(2) + m.group(1), text)
    parts = [p.strip() for line in text.splitlines() for p in SENTENCE_SPLIT_RE.split(line)]
    return [p for p in parts if p]


def _citation_ids(sentence: str) -> list[str]:
    ids = []
    for group in CITATION_RE.findall(sentence):
        ids += [p.strip() for p in re.split(r"[,;]", group) if p.strip()]
    return ids


def verify_answer(answer: str, retrieved: dict[str, Chunk], min_overlap: float) -> Verification:
    """Check every sentence of a generated answer against the retrieved chunks it cites."""
    checks: list[SentenceCheck] = []
    cited_order: list[str] = []
    for sentence in split_sentences(answer):
        ids = _citation_ids(sentence)
        bare = CITATION_RE.sub(" ", sentence)
        if not ids:
            checks.append(SentenceCheck(sentence, [], 0.0, False, False, "no citation"))
            continue
        unknown = [i for i in ids if i not in retrieved]
        if unknown:
            checks.append(SentenceCheck(sentence, ids, 0.0, False, False, f"cites unknown chunk(s) {unknown}"))
            continue
        cited_text = " ".join(retrieved[i].search_text for i in ids)
        sent_tokens = set(tokens(bare))
        support = (len(sent_tokens & set(tokens(cited_text))) / len(sent_tokens)) if sent_tokens else 0.0
        numbers_ok = numbers(bare) <= numbers(cited_text)
        reason = None
        if support < min_overlap:
            reason = f"lexical support {support:.2f} < {min_overlap}"
        elif not numbers_ok:
            reason = f"numbers {sorted(numbers(bare) - numbers(cited_text))} not in cited text"
        checks.append(SentenceCheck(sentence, ids, round(support, 3), numbers_ok, reason is None, reason))
        cited_order += [i for i in ids if i not in cited_order]
    ok = bool(checks) and all(c.ok for c in checks)
    return Verification(ok=ok, sentences=checks, cited_ids=cited_order)
