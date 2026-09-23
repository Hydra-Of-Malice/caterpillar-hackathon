"""Training content: required modules, quiz sizes, citations that resolve, approval metadata."""
from __future__ import annotations

from sentinel.cloud.rag.retriever import default_retriever
from sentinel.cloud.training.modules import ModuleStore, check_citations, load_module_files
from sentinel.cloud.training.quiz import score_attempt

REQUIRED = {"MOD-SWING-APPROACH", "MOD-TRENCH-EDGES", "MOD-IDLE-FUEL", "MOD-BLIND-ZONE", "MOD-SEATBELT-CAB",
            "MOD-PRESTART", "MOD-SLOPE-TRAVEL", "MOD-TRUCK-LOADING"}


def _store() -> ModuleStore:
    return ModuleStore(load_module_files(), {})


def test_required_modules_are_approved_with_metadata() -> None:
    store = _store()
    approved = {m.module_id: m for m in store.approved_modules()}
    assert REQUIRED <= set(approved)
    for mv in approved.values():
        d = mv.data
        for key in ("id", "title", "duration_min", "format", "competency_ids", "key_points", "expert_demo"):
            assert d.get(key), (mv.module_id, key)
        assert set(d["instructor_approved"]) == {"by", "version", "date"}
        assert d["instructor_approved"]["version"] == mv.version
        assert d["expert_demo"]["type"] == "video_placeholder"
        n = len(d["quiz"]["questions"])
        assert n >= 5 if mv.module_id in ("MOD-SWING-APPROACH", "MOD-TRENCH-EDGES") else n == 3


def test_every_citation_resolves_to_an_approved_chunk() -> None:
    retriever = default_retriever()
    for mv in load_module_files():
        check = check_citations(mv, retriever)
        assert check["status"] == "PASS", (mv.review_id, check["failures"])
        for kp in mv.data["key_points"]:
            assert set(kp["citation"]) == {"doc_id", "section", "version"}


def test_draft_is_not_served_until_approved() -> None:
    store = _store()
    assert store.latest_approved("MOD-SWING-APPROACH").version == "1.2"
    approved = ModuleStore(load_module_files(), {"MOD-SWING-APPROACH@1.3": {"by": "INS-01", "version": "1.3",
                                                                           "date": "2026-09-23"}})
    assert approved.latest_approved("MOD-SWING-APPROACH").version == "1.3"


def test_quiz_answer_key_is_consistent() -> None:
    for mv in load_module_files():
        qs = mv.data["quiz"]["questions"]
        assert all(0 <= q["answer"] < len(q["options"]) for q in qs)
        perfect = score_attempt(mv, {q["id"]: q["answer"] for q in qs})
        assert perfect["passed"] and perfect["score"] == 1.0
        assert not score_attempt(mv, {})["passed"]
