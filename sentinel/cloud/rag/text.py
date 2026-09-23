"""Tokenisation shared by retrieval and verification: lowercase, stopwords removed, light stemming.

The same function is applied to documents, questions and generated sentences, so matching is
symmetric. Numbers (including decimals such as 0.6 or 1926.651) are kept as tokens.
"""
from __future__ import annotations

import re

TOKEN_RE = re.compile(r"[a-z0-9]+(?:\.[0-9]+)*")
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")

STOPWORDS = frozenset("""
a about above after again against all am an and any are as at be because been before being below between
both but by can could did do does doing down during each few for from further had has have having he her
here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or
other our ours out over own same she should so some such than that the their theirs them then there these
they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours yourself must may might shall also any every much many get got let s t
""".split())


def stem(word: str) -> str:
    """Tiny suffix stemmer (plural, -ing, -ed, doubled consonant, final e). Deterministic, symmetric."""
    if len(word) <= 3 or word[0].isdigit():
        return word
    w = word
    if w.endswith("sses"):
        w = w[:-2]
    elif w.endswith("ies") and len(w) > 4:
        w = w[:-3] + "y"
    elif w.endswith("s") and not w.endswith(("ss", "us", "is")):
        w = w[:-1]
    if w.endswith("ing") and len(w) > 5:
        w = w[:-3]
    elif w.endswith("ed") and not w.endswith("eed") and len(w) > 4:
        w = w[:-2]
    if len(w) > 3 and w[-1] == w[-2] and w[-1] not in "aeiousz":
        w = w[:-1]
    if w.endswith("e") and len(w) > 4:
        w = w[:-1]
    return w


def tokens(text: str) -> list[str]:
    """Content tokens (stemmed, stopwords removed) in order."""
    return [stem(t) for t in TOKEN_RE.findall(text.lower()) if t not in STOPWORDS]


def analyzer(text: str) -> list[str]:
    """Unigrams plus adjacent bigrams, for the TF-IDF vectoriser."""
    toks = tokens(text)
    return toks + [f"{a} {b}" for a, b in zip(toks, toks[1:])]


def numbers(text: str) -> set[str]:
    """Numeric strings in the text, normalised (1,5 -> 1.5)."""
    return {n.replace(",", ".") for n in NUMBER_RE.findall(text)}
