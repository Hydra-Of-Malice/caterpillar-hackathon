"""Practice Analyser HTTP/WS API. ``router`` is mounted by the cloud app under /api/v1.

Wiring (set before serving; all optional):
    router.db = Database.cloud()           # default when unset: Database.cloud() (data/cloud.db)
    router.analyser = PracticeAnalyser...  # default when unset: PracticeAnalyser.load() on first use
    router.samples_dir = Path(...)         # default: data/practice/ (raw inputs as JSONL)
FastAPI ``dependency_overrides`` on ``get_db`` / ``get_analyser`` work as well.

GET /practice/cohort-sim runs the coached-vs-control cohort simulation (no model needed).
When no Expert Motion Model exists, model-dependent endpoints return 503 with
``{"detail": "Expert Motion Model not trained yet — run ml.train_expert_model"}``; sessions can
still be created and samples uploaded (``live`` is then null). Scores, tips and productivity are
relative to SIMULATED expert operators.
"""
from __future__ import annotations

import asyncio
import threading
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from sentinel.practice.analyser import NoCyclesError, PracticeAnalyser
from sentinel.practice.cohort import compare_arms
from sentinel.practice.settings import DEFAULT_EXERCISE, EXERCISES
from sentinel.shared import config
from sentinel.shared.schemas import PracticeReport, PracticeSample, new_id
from sentinel.store.db import Database
from sentinel.store.models import PracticeSessionRow, TrainingRecordRow

router = APIRouter(prefix="/practice", tags=["practice"])
NOT_TRAINED = "Expert Motion Model not trained yet — run ml.train_expert_model"
MAX_BATCH = 6000                  # 10 minutes at 10 Hz per request
_lock = threading.Lock()
_subscribers: dict[str, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = {}


# ---------------------------------------------------------------- dependencies
def get_db() -> Database:
    """Database set by the host app (``router.db``), else the cloud database."""
    if getattr(router, "db", None) is None:
        router.db = Database.cloud()
    return router.db


def _try_analyser() -> PracticeAnalyser | None:
    """The configured analyser, or the latest trained model; None if none is trained yet."""
    if getattr(router, "analyser", None) is None:
        try:
            router.analyser = PracticeAnalyser.load()
        except FileNotFoundError:
            return None
    return router.analyser


def get_analyser() -> PracticeAnalyser:
    analyser = _try_analyser()
    if analyser is None:
        raise HTTPException(status_code=503, detail=NOT_TRAINED)
    return analyser


def _samples_path(session_id: str) -> Path:
    root = getattr(router, "samples_dir", None) or config.DATA_DIR / "practice"
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{session_id}.jsonl"


# ---------------------------------------------------------------- bodies
class SessionIn(BaseModel):
    trainee_id: str
    exercise: str = DEFAULT_EXERCISE


class SamplesIn(BaseModel):
    samples: list[PracticeSample] = Field(min_length=1, max_length=MAX_BATCH)


class DemoIn(BaseModel):
    trainee_id: str = "OP-1042"
    archetype: str = "novice_improving"
    n_cycles: int = Field(8, ge=1, le=40)
    exercise: str = DEFAULT_EXERCISE
    seed: int | None = None


# ---------------------------------------------------------------- helpers
def _session_dict(row: PracticeSessionRow) -> dict[str, Any]:
    report = row.report or {}
    return {"session_id": row.session_id, "trainee_id": row.trainee_id, "exercise": row.exercise,
            "status": row.status, "started_at": row.started_at, "ended_at": row.ended_at,
            "n_samples": row.n_samples, "overall_score": row.overall_score,
            "score_band": report.get("score_band"), "model_version": report.get("model_version"),
            "simulated_reference": True}


def _get_row(db: Database, session_id: str) -> PracticeSessionRow:
    with db.session() as s:
        row = s.get(PracticeSessionRow, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"practice session {session_id} not found")
    return row


def _check_exercise(exercise: str) -> None:
    if exercise not in EXERCISES:
        raise HTTPException(status_code=422, detail=f"unknown exercise {exercise!r}; see GET /practice/exercises")


def _create(db: Database, trainee_id: str, exercise: str) -> PracticeSessionRow:
    row = PracticeSessionRow(session_id=new_id("prs"), trainee_id=trainee_id, exercise=exercise, status="open",
                             started_at=time.time(), n_samples=0)
    row.samples_path = str(_samples_path(row.session_id))
    with db.session() as s:
        s.add(row)
    return row


def _append(db: Database, row: PracticeSessionRow, samples: list[PracticeSample]) -> None:
    with _lock:
        with open(row.samples_path, "a", encoding="utf-8") as f:
            f.writelines(smp.model_dump_json() + "\n" for smp in samples)
        with db.session() as s:
            s.get(PracticeSessionRow, row.session_id).n_samples += len(samples)


def _load_samples(row: PracticeSessionRow) -> list[PracticeSample]:
    path = Path(row.samples_path or "")
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [PracticeSample.model_validate_json(line) for line in f if line.strip()]


def _publish(session_id: str, frame: dict[str, Any]) -> None:
    for loop, queue in list(_subscribers.get(session_id, [])):
        loop.call_soon_threadsafe(queue.put_nowait, frame)


def _finish(db: Database, analyser: PracticeAnalyser, row: PracticeSessionRow) -> PracticeReport:
    samples = _load_samples(row)
    if not samples:
        raise HTTPException(status_code=422, detail="no samples uploaded for this session")
    try:
        report = analyser.analyse(samples, row.exercise, row.trainee_id, row.session_id)
    except (NoCyclesError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    analyser.end_live(row.session_id)
    now = time.time()
    with db.session() as s:
        stored = s.get(PracticeSessionRow, row.session_id)
        stored.status, stored.ended_at, stored.overall_score = "analysed", now, report.overall_score
        stored.report = report.model_dump(mode="json")
        s.add(TrainingRecordRow(
            operator_id=row.trainee_id, module_id=f"practice:{row.exercise}", kind="practice_session",
            score=report.overall_score, passed=None, ts=now,
            data={"session_id": row.session_id, "exercise": row.exercise, "score_band": report.score_band,
                  "n_cycles": report.n_cycles, "model_version": report.model_version,
                  "competencies": sorted({t.competency_id for t in report.tips if t.competency_id}),
                  "provenance": ["ML", "SIMULATED"],
                  "note": "practice score vs SIMULATED experts; not an assessment (does not set competency state)"}))
    _publish(row.session_id, {"type": "finished", "data": {"session_id": row.session_id,
                                                           "overall_score": report.overall_score,
                                                           "score_band": report.score_band}})
    return report


def _trend(scores: list[float]) -> dict[str, Any]:
    if len(scores) < 2:
        return {"scores": scores, "slope_per_session": None, "direction": "insufficient_data"}
    slope = float(np.polyfit(np.arange(len(scores)), scores, 1)[0])
    direction = "improving" if slope > 1.0 else "declining" if slope < -1.0 else "stable"
    return {"scores": scores, "slope_per_session": round(slope, 2), "first": scores[0], "latest": scores[-1],
            "delta": round(scores[-1] - scores[0], 1), "direction": direction}


# ---------------------------------------------------------------- endpoints
@router.get("/model")
def model_status() -> dict[str, Any]:
    """Whether an Expert Motion Model is loaded, and its card summary."""
    analyser = _try_analyser()
    if analyser is None:
        return {"available": False, "detail": NOT_TRAINED}
    card = analyser.model.card
    return {"available": True, "model_version": analyser.model.version,
            "training_data": card.get("training_data"), "evaluation": card.get("evaluation"),
            "exercises": sorted(analyser.model.exercises)}


@router.get("/exercises")
def exercises() -> list[dict[str, Any]]:
    """Exercise catalog, with whether a SIMULATED expert reference exists for each."""
    analyser = _try_analyser()
    trained = analyser.model.exercises if analyser else {}
    return [dict(ex, model_available=name in trained,
                 expert_support={"n_experts": trained[name].n_experts, "n_cycles": trained[name].n_cycles}
                 if name in trained else None)
            for name, ex in EXERCISES.items()]


@router.get("/cohort-sim")
def cohort_sim(n: int = Query(20, ge=2, le=50), sessions: int = Query(12, ge=2, le=24),
               effect: float | None = Query(None, ge=1.0, le=3.0), seed: int = 0) -> dict[str, Any]:
    """Coached vs control cohort (SIMULATED + ASSUMPTION); needs no trained model."""
    return _cohort_cached(n, sessions, None if effect is None else round(effect, 2), seed)


@router.get("/motion-replay")
def motion_replay(archetype: str = Query("expert"), exercise: str = Query(DEFAULT_EXERCISE),
                  cycles: int = Query(2, ge=1, le=4)) -> dict[str, Any]:
    """Animated side/top-view frames of a SIMULATED operator's cycles (the expert demonstration)."""
    _check_exercise(exercise)
    from sentinel.practice.replay import motion_replay as _replay     # imports the simulator lazily
    try:
        return _replay(archetype, exercise, cycles)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@lru_cache(maxsize=64)
def _cohort_cached(n: int, sessions: int, effect: float | None, seed: int) -> dict[str, Any]:
    """Deterministic by seed, so identical queries (e.g. the effect slider) are served from memory."""
    return compare_arms(n, sessions, effect, seed)


def warm_cohort_cache() -> None:
    """Precompute the UI's default cohort query in the background so the demo page opens instantly."""
    def warm() -> None:
        from sentinel.practice.replay import motion_replay as _replay
        for a in ("expert", "novice"):
            _replay(a, DEFAULT_EXERCISE, 2)
        for e in (None, 1.4):
            _cohort_cached(20, 12, e, 0)

    threading.Thread(target=warm, daemon=True, name="cohort-warmup").start()


@router.post("/sessions")
def create_session(body: SessionIn, db: Database = Depends(get_db)) -> dict[str, Any]:
    _check_exercise(body.exercise)
    return _session_dict(_create(db, body.trainee_id, body.exercise))


@router.get("/sessions")
def list_sessions(trainee_id: str | None = Query(None), db: Database = Depends(get_db)) -> dict[str, Any]:
    """Session history (oldest first) with the score trend of analysed sessions."""
    with db.session() as s:
        q = s.query(PracticeSessionRow)
        if trainee_id:
            q = q.filter(PracticeSessionRow.trainee_id == trainee_id)
        rows = q.order_by(PracticeSessionRow.started_at).all()
    sessions = [_session_dict(r) for r in rows]
    scores = [r["overall_score"] for r in sessions if r["overall_score"] is not None]
    return {"trainee_id": trainee_id, "sessions": sessions, "trend": _trend(scores),
            "label": "scores vs SIMULATED expert operators"}


@router.post("/sessions/{session_id}/samples")
def post_samples(session_id: str, body: SamplesIn, db: Database = Depends(get_db)) -> dict[str, Any]:
    """Append samples; each one is also run through live_step and streamed to WS subscribers."""
    row = _get_row(db, session_id)
    if row.status != "open":
        raise HTTPException(status_code=409, detail="session already finished")
    _append(db, row, body.samples)
    analyser = _try_analyser()
    if analyser is None:
        return {"accepted": len(body.samples), "live": None, "hints": [], "model_status": NOT_TRAINED}
    live = None
    hints: list[str] = []
    for smp in body.samples:
        live = analyser.live_step(session_id, smp, exercise=row.exercise)
        _publish(session_id, {"type": "live", "data": live})
        if live["hint"]:
            hints.append(live["hint"])
    return {"accepted": len(body.samples), "live": live, "hints": hints}


@router.post("/sessions/{session_id}/finish", response_model=PracticeReport)
def finish_session(session_id: str, db: Database = Depends(get_db),
                   analyser: PracticeAnalyser = Depends(get_analyser)) -> PracticeReport:
    row = _get_row(db, session_id)
    if row.status == "analysed":
        return PracticeReport.model_validate(row.report)
    return _finish(db, analyser, row)


@router.get("/sessions/{session_id}/report", response_model=PracticeReport)
def get_report(session_id: str, db: Database = Depends(get_db)) -> PracticeReport:
    row = _get_row(db, session_id)
    if row.report is None:
        raise HTTPException(status_code=409, detail="session not finished yet; POST .../finish first")
    return PracticeReport.model_validate(row.report)


@router.post("/demo/generate")
def demo_generate(body: DemoIn, db: Database = Depends(get_db)) -> dict[str, Any]:
    """DEMO_MODE only: simulate a trainee session with sentinel.sim, store and analyse it.

    Replay it at 10x over WS /practice/sessions/{id}/live.
    """
    if not config.DEMO_MODE:
        raise HTTPException(status_code=403, detail="demo endpoints are disabled (DEMO_MODE=0)")
    _check_exercise(body.exercise)
    try:
        from sentinel.sim.practice import generate_practice_session
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="simulator (sentinel.sim.practice) is not available") from exc
    analyser = get_analyser()
    with db.session() as s:
        seed = body.seed if body.seed is not None else s.query(PracticeSessionRow).filter(
            PracticeSessionRow.trainee_id == body.trainee_id).count()
    try:
        samples = generate_practice_session(body.archetype, body.n_cycles, seed=seed, exercise=body.exercise)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    row = _create(db, body.trainee_id, body.exercise)
    _append(db, row, samples)
    report = _finish(db, analyser, _get_row(db, row.session_id))
    return {"session": _session_dict(_get_row(db, row.session_id)), "report": report.model_dump(mode="json"),
            "replay_ws": f"/api/v1/practice/sessions/{row.session_id}/live?speed=10",
            "simulated": True, "archetype": body.archetype, "seed": seed}


@router.websocket("/sessions/{session_id}/live")
async def live(websocket: WebSocket, session_id: str, speed: float = 10.0) -> None:
    """Frames {"type": "live"|"finished"|"report"|"status", "data"}.

    Open session: streams live_step output as samples arrive. Finished session: replays the
    stored samples at ``speed`` x real time, then sends the report summary and closes.
    """
    await websocket.accept()
    db = get_db()
    with db.session() as s:
        row = s.get(PracticeSessionRow, session_id)
    analyser = _try_analyser()
    try:
        if row is None:
            await websocket.send_json({"type": "status", "data": {"detail": f"session {session_id} not found"}})
        elif analyser is None:
            await websocket.send_json({"type": "status", "data": {"model_available": False, "detail": NOT_TRAINED}})
        elif row.status == "analysed":
            await _replay(websocket, analyser, row, max(speed, 0.1))
        else:
            await _stream(websocket, session_id)
        await websocket.close()
    except WebSocketDisconnect:
        return


async def _replay(websocket: WebSocket, analyser: PracticeAnalyser, row: PracticeSessionRow, speed: float) -> None:
    key = new_id(f"replay_{row.session_id}")
    samples = _load_samples(row)
    try:
        for prev, smp in zip([None, *samples[:-1]], samples):
            if prev is not None:
                await asyncio.sleep(max(smp.ts - prev.ts, 0.0) / speed)
            await websocket.send_json({"type": "live", "data": analyser.live_step(key, smp, exercise=row.exercise)})
    finally:
        analyser.end_live(key)
    await websocket.send_json({"type": "report", "data": _session_dict(row)})


async def _stream(websocket: WebSocket, session_id: str) -> None:
    entry = (asyncio.get_running_loop(), asyncio.Queue())
    _subscribers.setdefault(session_id, []).append(entry)
    receiver = asyncio.ensure_future(websocket.receive())
    try:
        while True:
            getter = asyncio.ensure_future(entry[1].get())
            done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                frame = getter.result()
                await websocket.send_json(frame)
                if frame["type"] == "finished":
                    return
            else:
                getter.cancel()
            if receiver in done:
                if receiver.result()["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect()
                receiver = asyncio.ensure_future(websocket.receive())
    finally:
        receiver.cancel()
        _subscribers[session_id].remove(entry)
