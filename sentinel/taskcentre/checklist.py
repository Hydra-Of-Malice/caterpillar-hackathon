"""Pre-start inspection for a Task Centre task.

A task cannot move to ``ongoing`` until the operator has answered every item of the pre-start
inspection **for that task**. The items are not redefined here: they are the shared
``config/checklist.yaml`` the in-cab copilot already uses for its pre-shift check (14 items, 4
groups, 11 of them critical), so an item added there is required by both surfaces at once.

The semantics are the copilot's, deliberately (see ``sentinel/edge_api/routes/shift.py``):

* answers are ``pass`` / ``fail`` / ``na`` (the UI shows PASS / FAIL / N_A),
* a FAIL on a **critical** item blocks the start (409) and raises a ticket,
* N/A never blocks, and
* a FAIL must describe the defect - an answer of ``fail`` with no note is rejected.

Answers live in ``tc_task_checklist``: one row per (task, item), the latest answer overwriting the
previous one in place. ``critical`` is stamped from the config at answer time, so a later edit to
the config can never silently rewrite what did or did not block a start.

Rows are added and flushed but never committed - the request-scoped session commits.
"""
from __future__ import annotations

import time
from functools import lru_cache
from typing import Any, Iterable, Mapping

from fastapi import HTTPException
from sqlalchemy.orm import Session

from sentinel.shared.config import load_yaml
from sentinel.store.taskcentre_models import TaskChecklistResultRow
from sentinel.taskcentre.service import gmt_iso

__all__ = ["CONFIG_NAME", "RESULTS", "checklist_version", "checklist_groups", "checklist_items",
           "latest_results", "checklist_status", "checklist_block", "checklist_blocks", "save_results"]

CONFIG_NAME = "checklist"
#: Stored answers. The API accepts the UI's wording (PASS / FAIL / N_A) case-insensitively.
RESULTS = ("pass", "fail", "na")
_ALIASES = {"n_a": "na", "not_applicable": "na", "passed": "pass", "failed": "fail", "ok": "pass"}


# ---------------------------------------------------------------- the shared config
@lru_cache(maxsize=1)
def _spec() -> dict[str, Any]:
    """``config/checklist.yaml`` read once, reshaped for the API. Callers copy before returning."""
    cfg = load_yaml(CONFIG_NAME)
    groups = [{"id": g["id"], "label": g["label"]} for g in cfg["groups"]]
    labels = {g["id"]: g["label"] for g in groups}
    items = [{"id": i["id"], "group": i["group"], "group_label": labels.get(i["group"], i["group"]),
              "label": i["label"], "hint": i.get("hint", ""), "critical": bool(i.get("critical")),
              "live_signal": i.get("live_signal")} for i in cfg["items"]]
    return {"version": str(cfg["version"]), "groups": groups, "items": items,
            "by_id": {i["id"]: i for i in items}}


def checklist_version() -> str:
    """The config's version string, carried on every status so an answer set can be dated."""
    return _spec()["version"]


def checklist_groups() -> list[dict[str, Any]]:
    """The four display groups, in config order: ``{id, label}``."""
    return [dict(g) for g in _spec()["groups"]]


def checklist_items() -> list[dict[str, Any]]:
    """Every item in config order: ``{id, group, group_label, label, hint, critical, live_signal}``."""
    return [dict(i) for i in _spec()["items"]]


# ---------------------------------------------------------------- reading answers
def latest_results(s: Session, task_id: str) -> dict[str, TaskChecklistResultRow]:
    """The current answer per item for one task (one row per item; the latest answer won)."""
    rows = (s.query(TaskChecklistResultRow)
            .filter(TaskChecklistResultRow.task_id == task_id)
            .order_by(TaskChecklistResultRow.ts, TaskChecklistResultRow.id).all())
    return {r.item_id: r for r in rows}


def _status(results: Mapping[str, TaskChecklistResultRow]) -> dict[str, Any]:
    """Shape the verdict from a task's current answers.

    ``completed`` means every configured item has an answer; ``blocked`` means at least one critical
    item was answered FAIL. The two are independent: an incomplete checklist is not "blocked", it is
    unfinished, and the start route reports them separately so the UI can say which it is.
    """
    items = _spec()["items"]
    answered = [i for i in items if i["id"] in results]
    rows = [results[i["id"]] for i in answered]
    failed_critical = [{"item_id": i["id"], "label": i["label"], "note": results[i["id"]].note}
                       for i in answered
                       if results[i["id"]].result == "fail" and bool(results[i["id"]].critical)]
    completed = len(answered) == len(items)
    signed = max(rows, key=lambda r: (r.ts, r.id or 0), default=None) if completed else None
    return {
        "version": checklist_version(),
        "total": len(items),
        "answered": len(answered),
        "passed": sum(1 for r in rows if r.result == "pass"),
        "failed": sum(1 for r in rows if r.result == "fail"),
        "na": sum(1 for r in rows if r.result == "na"),
        "missing": [i["id"] for i in items if i["id"] not in results],
        "failed_critical": failed_critical,
        "completed": completed,
        "blocked": bool(failed_critical),
        "signed_at": None if signed is None else signed.ts,
        "signed_at_gmt": None if signed is None else gmt_iso(signed.ts),
        "signed_by": None if signed is None else signed.user_id,
    }


def checklist_status(s: Session, task_id: str) -> dict[str, Any]:
    """The full pre-start verdict for one task."""
    return _status(latest_results(s, task_id))


def checklist_block(status: Mapping[str, Any]) -> dict[str, Any]:
    """The compact block carried on every serialised task, so the UI knows whether Start is allowed."""
    return {"completed": bool(status["completed"]), "blocked": bool(status["blocked"]),
            "answered": int(status["answered"]), "total": int(status["total"]),
            "failed_critical_count": len(status["failed_critical"])}


def checklist_blocks(s: Session, task_ids: Iterable[str]) -> dict[str, dict[str, Any]]:
    """``checklist_block`` for many tasks in one query (the today board serialises a whole day)."""
    ids = list(task_ids)
    if not ids:
        return {}
    rows = (s.query(TaskChecklistResultRow)
            .filter(TaskChecklistResultRow.task_id.in_(ids))
            .order_by(TaskChecklistResultRow.ts, TaskChecklistResultRow.id).all())
    per_task: dict[str, dict[str, TaskChecklistResultRow]] = {tid: {} for tid in ids}
    for row in rows:
        per_task[row.task_id][row.item_id] = row
    return {tid: checklist_block(_status(answers)) for tid, answers in per_task.items()}


# ---------------------------------------------------------------- writing answers
def _normalise_result(raw: Any) -> str:
    """PASS / FAIL / N_A in any casing -> ``pass`` / ``fail`` / ``na``. 400 for anything else."""
    value = str(raw or "").strip().lower().replace("/", "_").replace("-", "_").replace(" ", "_")
    value = _ALIASES.get(value, value)
    if value not in RESULTS:
        raise HTTPException(400, {"error": "bad_checklist_result", "result": raw,
                                  "allowed": ["PASS", "FAIL", "N_A"],
                                  "message": "a checklist answer is PASS, FAIL or N_A"})
    return value


def _entry(raw: Any) -> tuple[str, str, str | None]:
    """One submitted answer as ``(item_id, result, note)``; accepts a dict or a pydantic model."""
    get = raw.get if isinstance(raw, Mapping) else (lambda k, d=None: getattr(raw, k, d))
    item_id = str(get("item_id", "") or "").strip()
    note = get("note", None)
    note = note.strip() if isinstance(note, str) and note.strip() else None
    return item_id, _normalise_result(get("result", None)), note


def save_results(s: Session, task_id: str, user_id: str,
                 results: Iterable[Any]) -> list[TaskChecklistResultRow]:
    """Record answers for a task; the latest answer per item wins and overwrites the previous row.

    Partial submissions are allowed so the UI can save as the operator works down the list. The whole
    submission is validated before anything is written, so a rejected body never leaves half its
    answers stored:

    * an item id that is not in the config is **400** (a fork of the checklist cannot creep in), and
    * a FAIL with no note is **400** - a defect has to be described, exactly as the copilot demands.
    """
    by_id = _spec()["by_id"]
    entries = [_entry(r) for r in results]

    unknown = sorted({item_id for item_id, _result, _note in entries if item_id not in by_id})
    if unknown:
        raise HTTPException(400, {"error": "unknown_checklist_items", "item_ids": unknown,
                                  "checklist_version": checklist_version(),
                                  "message": "these item ids are not in config/checklist.yaml"})
    undescribed = sorted({item_id for item_id, result, note in entries if result == "fail" and not note})
    if undescribed:
        raise HTTPException(400, {"error": "note_required", "item_ids": undescribed,
                                  "message": "describe the defect: a FAIL must carry a note"})

    now = time.time()
    current = latest_results(s, task_id)
    saved: dict[str, TaskChecklistResultRow] = {}
    for item_id, result, note in entries:            # a repeated id inside one body: the last one wins
        row = current.get(item_id)
        if row is None:
            row = TaskChecklistResultRow(task_id=task_id, item_id=item_id, user_id=user_id,
                                         result=result, critical=bool(by_id[item_id]["critical"]),
                                         note=note, ts=now)
            s.add(row)
            current[item_id] = row
        else:
            row.user_id, row.result, row.note, row.ts = user_id, result, note, now
            row.critical = bool(by_id[item_id]["critical"])
        saved[item_id] = row
    s.flush()
    return [saved[item_id] for item_id in dict.fromkeys(item_id for item_id, _result, _note in entries)]
