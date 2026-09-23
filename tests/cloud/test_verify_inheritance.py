"""Citation inheritance: a paragraph-end citation covers the uncited sentences before it, but every
sentence is still support-checked and uncited trailing sentences still fail."""
from __future__ import annotations

from sentinel.cloud.rag.retriever import default_retriever
from sentinel.cloud.rag.verify import verify_answer

Q = "How should I slow the swing near the truck?"
SWING = "SOP-EX-04@1.2#3.2"


def _retrieved():
    hits = default_retriever().search(Q)
    return {h.chunk.chunk_id: h.chunk for h in hits if h.passes}


def test_paragraph_end_citation_covers_preceding_sentence():
    text = ("Slow the swing as the bucket approaches the truck body by easing off the swing control early "
            "in the last part of the swing. This helps the upper structure stop without overshooting, "
            f"preventing bucket contact with the truck and spilled material [{SWING}].")
    v = verify_answer(text, _retrieved(), 0.5)
    assert v.ok and v.cited_ids == [SWING]
    assert [s.inherited for s in v.sentences] == [True, False]
    assert all(s.citations == [SWING] for s in v.sentences)


def test_inherited_sentence_must_still_be_supported():
    text = (f"Operators earn a bonus for loading faster than the shift target. "
            f"Slow the swing as the bucket approaches the truck body [{SWING}].")
    v = verify_answer(text, _retrieved(), 0.5)
    assert not v.ok
    first = v.sentences[0]
    assert first.inherited and not first.ok and first.reason.startswith("lexical support")


def test_uncited_trailing_sentence_still_fails():
    text = f"Slow the swing as the bucket approaches the truck body [{SWING}]. Then you can speed up again."
    v = verify_answer(text, _retrieved(), 0.5)
    assert not v.ok and v.sentences[-1].reason == "no citation"


def test_inheritance_does_not_cross_paragraphs():
    text = (f"Slow the swing as the bucket approaches the truck body.\n"
            f"Ease off the swing control early in the last part of the swing [{SWING}].")
    v = verify_answer(text, _retrieved(), 0.5)
    assert not v.ok and v.sentences[0].reason == "no citation"


def test_fully_uncited_answer_fails():
    v = verify_answer("Slow the swing as the bucket approaches the truck body.", _retrieved(), 0.5)
    assert not v.ok and v.cited_ids == []
