"""RAG gold set (no API key needed): answerable questions are cited and lexically supported;
unanswerable questions are refused. Also the generative path with a fake generator."""
from __future__ import annotations

import pytest

from sentinel.cloud.rag.answer import Copilot, CopilotSettings, GenerationError
from sentinel.cloud.rag.ingest import load_corpus
from sentinel.cloud.rag.retriever import default_retriever
from sentinel.cloud.rag.text import tokens
from sentinel.cloud.rag.verify import split_sentences, verify_answer

# (question, expected chunk id among the citations, phrase the cited passage must contain)
ANSWERABLE = [
    ("How should I control swing speed approaching the truck?", "SOP-EX-04@1.2#3.2", "slow the swing"),
    ("Can I swing the bucket over the truck cab?", "SOP-EX-04@1.2#3.4", "never swing the bucket"),
    ("How high should the bucket be before swinging over the truck side boards?", "SOP-EX-04@1.2#3.3",
     "higher than the truck side boards"),
    ("What if the truck moves while I am swinging?", "SOP-EX-04@1.2#3.5", "stop the swing"),
    ("How far from the trench edge should spoil be placed?", "SOP-EX-07@1.1#3.2", "0.6 m"),
    ("What are the warning signs that a trench wall may collapse?", "SOP-EX-07@1.1#5.1", "cracks"),
    ("Do trenches need a ladder to get out?", "SOP-EX-07@1.1#4.3", "ladder"),
    ("How many points of contact should I use when climbing into the cab?", "SOP-GEN-01@2.0#2.1",
     "three points of contact"),
    ("When must I wear the seatbelt?", "SOP-GEN-01@2.0#3.1", "at all times"),
    ("What should I do when the person-in-zone proximity alert sounds?", "SOP-EX-02@1.3#3.1", "stop all machine motion"),
    ("What should I do if I lose sight of the spotter?", "SOP-EX-02@1.3#4.3", "stop all motion"),
    ("Should I shut down the engine while waiting for a truck?", "SOP-GEN-03@1.0#2.3", "shut the engine down"),
    ("How long should the engine cool down after heavy work?", "SOP-GEN-03@1.0#3.2", "3 to 5 minutes"),
    ("What do I do if the pre-start check finds a critical defect?", "SOP-GEN-02@1.1#4.2", "do not operate"),
    ("How should I travel on a slope?", "SOP-EX-05@1.0#2.1", "slope"),
    ("Should the bucket be raised when travelling?", "SOP-EX-05@1.0#2.3", "low and close to the ground"),
]
UNANSWERABLE = [
    "What is the main relief valve pressure on a Cat 320?",
    "How many litres of engine oil does the 320 take?",
    "What is the warranty period for the undercarriage?",
    "How do I pair my phone with the cab radio over Bluetooth?",
    "What is the price of a replacement bucket tooth?",
    "What torque should the track shoe bolts be tightened to?",
    "What is the maximum lifting capacity at 6 m reach?",
    "Can I load while the driver is in the truck?",
]
REFUSAL = "I couldn't find this in the approved documents. Ask your supervisor or instructor."


@pytest.fixture(scope="module")
def settings() -> CopilotSettings:
    return CopilotSettings.from_config()


@pytest.fixture(scope="module")
def offline(settings: CopilotSettings) -> Copilot:
    return Copilot(default_retriever(), settings, generator=None)


def test_corpus_is_watermarked_versioned_and_chunked_by_section() -> None:
    docs, chunks = load_corpus()
    assert {"SOP-EX-04", "SOP-EX-07", "SOP-GEN-01", "SOP-GEN-03", "SOP-EX-02"} <= set(docs)
    for d in docs.values():
        assert d.version and "SAMPLE — not official Caterpillar content" in d.watermark
    assert all(len(c.sha256) == 64 and c.chunk_id == f"{c.doc_id}@{c.version}#{c.section}" for c in chunks)
    assert len({c.chunk_id for c in chunks}) == len(chunks)


@pytest.mark.parametrize("question,chunk_id,phrase", ANSWERABLE)
def test_answerable_questions_are_cited_and_supported(offline: Copilot, question: str, chunk_id: str,
                                                      phrase: str) -> None:
    out = offline.ask(question)
    assert out["mode"] == "extractive"                       # no API key in tests
    ids = [c["chunk_id"] for c in out["citations"]]
    assert ids and chunk_id in ids, ids
    cited = next(c for c in out["citations"] if c["chunk_id"] == chunk_id)
    assert phrase.lower() in cited["text"].lower()           # lexical support check
    assert all(f"[{c['chunk_id']}]" in out["answer"] and c["text"] in out["answer"] for c in out["citations"])
    q_terms = set(tokens(question))
    assert len(q_terms & set(tokens(cited["heading"] + " " + cited["text"]))) >= 1


@pytest.mark.parametrize("question", UNANSWERABLE)
def test_unanswerable_questions_are_refused(offline: Copilot, question: str) -> None:
    out = offline.ask(question)
    assert out["mode"] == "refused" and out["answer"] == REFUSAL and out["citations"] == []


def test_gold_set_totals(offline: Copilot) -> None:
    cited = sum(1 for q, cid, _ in ANSWERABLE if cid in [c["chunk_id"] for c in offline.ask(q)["citations"]])
    refused = sum(1 for q in UNANSWERABLE if offline.ask(q)["mode"] == "refused")
    assert len(ANSWERABLE) >= 10 and len(UNANSWERABLE) >= 5
    assert cited == len(ANSWERABLE) and refused == len(UNANSWERABLE)


def _copilot_with(settings: CopilotSettings, text_or_exc) -> Copilot:
    def gen(question, chunks):
        if isinstance(text_or_exc, Exception):
            raise text_or_exc
        return text_or_exc(chunks) if callable(text_or_exc) else text_or_exc
    return Copilot(default_retriever(), settings, generator=gen)


def test_generative_answer_passes_verification(settings: CopilotSettings) -> None:
    cp = _copilot_with(settings, lambda chunks: (
        "Slow the swing as the bucket approaches the truck body [SOP-EX-04@1.2#3.2]. "
        "Ease off the swing control early so the upper structure stops without overshooting. [SOP-EX-04@1.2#3.2]"))
    out = cp.ask("How should I control swing speed approaching the truck?")
    assert out["mode"] == "generative", out.get("verification")
    assert [c["chunk_id"] for c in out["citations"]] == ["SOP-EX-04@1.2#3.2"]
    assert out["verification"]["n_sentences"] == out["verification"]["n_supported"] == 2


@pytest.mark.parametrize("answer", [
    "Slow the swing as the bucket approaches the truck body.",                               # no citation
    "Slow the swing to 12 degrees per second near the truck [SOP-EX-04@1.2#3.2].",           # invented number
    "Slow the swing as the bucket approaches the truck body [SOP-XX-99@9.9#1.1].",           # unknown chunk
    "Always wear gloves and sunglasses inside the cab [SOP-EX-04@1.2#3.2].",                  # unsupported
])
def test_failed_verification_falls_back_to_extractive(settings: CopilotSettings, answer: str) -> None:
    out = _copilot_with(settings, answer).ask("How should I control swing speed approaching the truck?")
    assert out["mode"] == "extractive" and out["reason"] == "citation verification failed"
    assert not out["verification"]["ok"]


def test_safety_critical_topics_are_extractive_even_with_llm(settings: CopilotSettings) -> None:
    cp = _copilot_with(settings, "Wear it [SOP-GEN-01@2.0#3.1].")
    for q in ("When must I wear the seatbelt?", "How far from the trench edge should spoil be placed?",
              "What should I do when the person-in-zone proximity alert sounds?",
              "When do I engage the hydraulic lockout?"):
        out = cp.ask(q)
        assert out["mode"] == "extractive" and out["safety_critical"], q


def test_llm_error_and_llm_refusal(settings: CopilotSettings) -> None:
    q = "How long should the engine cool down after heavy work?"
    err = _copilot_with(settings, GenerationError("timeout")).ask(q)
    assert err["mode"] == "extractive" and "LLM unavailable" in err["reason"]
    refused = _copilot_with(settings, "No approved source covers this.").ask(q)
    assert refused["mode"] == "refused" and refused["answer"] == REFUSAL


def test_sentence_split_moves_trailing_citations() -> None:
    parts = split_sentences("Slow down. [A@1#1] Then dump smoothly [B@1#2]. Done!")
    assert parts == ["Slow down [A@1#1].", "Then dump smoothly [B@1#2].", "Done!"]
    v = verify_answer("Place spoil at least 0.6 m back [SOP-EX-07@1.1#3.2].",
                      {c.chunk_id: c for c in default_retriever().chunks}, 0.5)
    assert v.ok
