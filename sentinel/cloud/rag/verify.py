"""Citation verification for generated answers (08 §8.5).

Every sentence must be attributable to at least one retrieved chunk cited as `[chunk_id]`, every
cited id must be one of the retrieved chunks, the sentence's content words must be lexically
supported by the cited text, and every number in the sentence must appear in the cited text.

A citation at the end of a paragraph covers the uncited sentences immediately before it in that
paragraph ("citation inheritance") — LLMs often cite once per paragraph. Inherited sentences still
go through the full support and number checks against that chunk; an uncited sentence with no
citation after it in its paragraph fails. Any failure means the caller falls back to extractive mode.
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
    inherited: bool = False        # citation taken from the paragraph-end citation that follows


@dataclass
class Verification:
    ok: bool
    sentences: list[SentenceCheck] = field(default_factory=list)
    cited_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "n_sentences": len(self.sentences),
                "n_supported": sum(1 for s in self.sentences if s.ok), "cited_ids": self.cited_ids,
                "sentences": [s.__dict__ for s in self.sentences]}


def split_paragraph_sentences(text: str) -> list[list[str]]:
    """Sentences grouped by paragraph (line), with citations that follow a full stop moved in front of it."""
    text = BULLET_RE.sub("", text.strip())
    text = TRAILING_CITES_RE.sub(lambda m: m.group(2) + m.group(1), text)
    paragraphs = []
    for line in text.splitlines():
        parts = [p.strip() for p in SENTENCE_SPLIT_RE.split(line) if p.strip()]
        if parts:
            paragraphs.append(parts)
    return paragraphs


def split_sentences(text: str) -> list[str]:
    """All sentences in order (see split_paragraph_sentences)."""
    return [s for para in split_paragraph_sentences(text) for s in para]


def _citation_ids(sentence: str) -> list[str]:
    ids = []
    for group in CITATION_RE.findall(sentence):
        ids += [p.strip() for p in re.split(r"[,;]", group) if p.strip()]
    return ids


def _check(sentence: str, ids: list[str], retrieved: dict[str, Chunk], min_overlap: float,
           inherited: bool) -> SentenceCheck:
    """Support and number checks of one sentence against the chunks in `ids` (own or inherited)."""
    bare = CITATION_RE.sub(" ", sentence)
    unknown = [i for i in ids if i not in retrieved]
    if unknown:
        return SentenceCheck(sentence, ids, 0.0, False, False, f"cites unknown chunk(s) {unknown}", inherited)
    cited_text = " ".join(retrieved[i].search_text for i in ids)
    sent_tokens = set(tokens(bare))
    support = (len(sent_tokens & set(tokens(cited_text))) / len(sent_tokens)) if sent_tokens else 0.0
    numbers_ok = numbers(bare) <= numbers(cited_text)
    reason = None
    if support < min_overlap:
        reason = f"lexical support {support:.2f} < {min_overlap}"
    elif not numbers_ok:
        reason = f"numbers {sorted(numbers(bare) - numbers(cited_text))} not in cited text"
    return SentenceCheck(sentence, ids, round(support, 3), numbers_ok, reason is None, reason, inherited)


def verify_answer(answer: str, retrieved: dict[str, Chunk], min_overlap: float) -> Verification:
    """Check every sentence of a generated answer against the retrieved chunks it cites or inherits."""
    checks: list[SentenceCheck] = []
    cited_order: list[str] = []
    for paragraph in split_paragraph_sentences(answer):
        pending: list[str] = []                 # uncited sentences waiting for a citation later in the paragraph
        for sentence in paragraph:
            ids = _citation_ids(sentence)
            if not ids:
                pending.append(sentence)
                continue
            checks += [_check(s, ids, retrieved, min_overlap, inherited=True) for s in pending]
            checks.append(_check(sentence, ids, retrieved, min_overlap, inherited=False))
            if all(i in retrieved for i in ids):
                cited_order += [i for i in ids if i not in cited_order]
            pending = []
        checks += [SentenceCheck(s, [], 0.0, False, False, "no citation") for s in pending]
    ok = bool(checks) and all(c.ok for c in checks)
    return Verification(ok=ok, sentences=checks, cited_ids=cited_order)
