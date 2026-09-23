"""Quiz delivery (answers withheld) and scoring against the module's versioned pass mark."""
from __future__ import annotations

from typing import Any

from sentinel.cloud.training.modules import ModuleVersion


def public_quiz(mv: ModuleVersion) -> dict[str, Any]:
    quiz = mv.data.get("quiz") or {}
    return {"module_id": mv.module_id, "module_version": mv.version, "pass_mark": quiz.get("pass_mark", 0.8),
            "questions": [{"id": q["id"], "prompt": q["prompt"], "options": q["options"]}
                          for q in quiz.get("questions", [])]}


def score_attempt(mv: ModuleVersion, answers: dict[str, int]) -> dict[str, Any]:
    """Score answers {question_id: option_index}. Unanswered questions count as wrong."""
    quiz = mv.data.get("quiz") or {}
    questions = quiz.get("questions", [])
    results = []
    for q in questions:
        chosen = answers.get(q["id"])
        results.append({"question_id": q["id"], "chosen": chosen, "answer": q["answer"],
                        "correct": chosen == q["answer"], "explanation": q.get("explanation"),
                        "citation": q.get("citation")})
    correct = sum(r["correct"] for r in results)
    total = len(questions)
    score = correct / total if total else 0.0
    pass_mark = float(quiz.get("pass_mark", 0.8))
    return {"module_id": mv.module_id, "module_version": mv.version, "correct": correct, "total": total,
            "score": round(score, 3), "pass_mark": pass_mark, "passed": score >= pass_mark, "results": results}
