"""Hybrid retriever: BM25 (rank-bm25) + TF-IDF cosine (scikit-learn), fused by reciprocal rank fusion.

A fused hit is "above threshold" only if its TF-IDF cosine and its IDF-weighted coverage of the
question's terms both clear configured floors. Question terms unknown to the corpus get the highest
IDF, so out-of-corpus questions ("relief pressure on a 320") fail the coverage floor and are refused.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer

from sentinel.cloud.rag.ingest import Chunk, Document, load_corpus
from sentinel.cloud.rag.text import analyzer, tokens
from sentinel.shared.config import CORPUS_DIR, load_yaml


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    rrf: float
    bm25: float
    cosine: float
    coverage: float
    passes: bool


@dataclass(frozen=True)
class RetrieverSettings:
    top_k: int = 5
    rrf_k: int = 60
    min_cosine: float = 0.10
    min_coverage: float = 0.55

    @classmethod
    def from_config(cls) -> "RetrieverSettings":
        rag = load_yaml("cloud")["rag"]
        return cls(top_k=int(rag["top_k"]), rrf_k=int(rag["rrf_k"]), min_cosine=float(rag["min_cosine"]),
                   min_coverage=float(rag["min_coverage"]))


class HybridRetriever:
    """In-memory index over the approved corpus chunks."""

    def __init__(self, docs: dict[str, Document], chunks: list[Chunk], settings: RetrieverSettings) -> None:
        if not chunks:
            raise ValueError("corpus has no approved chunks")
        self.docs = docs
        self.chunks = chunks
        self.by_id = {c.chunk_id: c for c in chunks}
        self.settings = settings
        corpus_tokens = [tokens(c.search_text) for c in chunks]
        self._token_sets = [set(t) for t in corpus_tokens]
        self._bm25 = BM25Okapi(corpus_tokens)
        self._tfidf = TfidfVectorizer(analyzer=analyzer, sublinear_tf=True)
        self._matrix = self._tfidf.fit_transform([c.search_text for c in chunks])
        n = len(chunks)
        df: dict[str, int] = {}
        for ts in self._token_sets:
            for t in ts:
                df[t] = df.get(t, 0) + 1
        self._idf = {t: math.log((n + 1) / (d + 1)) + 1 for t, d in df.items()}
        self._idf_unknown = math.log(n + 1) + 1

    def idf(self, term: str) -> float:
        return self._idf.get(term, self._idf_unknown)

    def coverage(self, query_terms: set[str], index: int) -> float:
        """IDF-weighted share of the question's terms present in chunk `index`."""
        total = sum(self.idf(t) for t in query_terms)
        if total == 0:
            return 0.0
        return sum(self.idf(t) for t in query_terms if t in self._token_sets[index]) / total

    def search(self, question: str, k: int | None = None) -> list[Hit]:
        """Top-k fused hits (best first), each flagged with whether it clears the relevance floors."""
        k = k or self.settings.top_k
        q_tokens = tokens(question)
        q_terms = set(q_tokens)
        if not q_terms:
            return []
        bm25 = np.asarray(self._bm25.get_scores(q_tokens), dtype=float)
        cosine = (self._matrix @ self._tfidf.transform([question]).T).toarray().ravel()
        fused = np.zeros(len(self.chunks))
        for scores in (bm25, cosine):
            ranked = [i for i in np.argsort(-scores, kind="stable") if scores[i] > 0]
            for rank, i in enumerate(ranked, start=1):
                fused[i] += 1.0 / (self.settings.rrf_k + rank)
        order = [i for i in np.argsort(-fused, kind="stable") if fused[i] > 0][:k]
        hits = []
        for i in order:
            cov = self.coverage(q_terms, i)
            passes = cosine[i] >= self.settings.min_cosine and cov >= self.settings.min_coverage
            hits.append(Hit(self.chunks[i], float(fused[i]), float(bm25[i]), float(cosine[i]), cov, passes))
        return hits


def build_retriever(corpus_dir: Path = CORPUS_DIR, settings: RetrieverSettings | None = None) -> HybridRetriever:
    """Build a retriever over the latest approved documents in `corpus_dir`."""
    docs, chunks = load_corpus(corpus_dir)
    return HybridRetriever(docs, chunks, settings or RetrieverSettings.from_config())


@lru_cache(maxsize=1)
def default_retriever() -> HybridRetriever:
    """Process-wide retriever over corpus/ (built once)."""
    return build_retriever()
