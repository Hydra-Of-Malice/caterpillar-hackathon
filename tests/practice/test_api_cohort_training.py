"""Practice API (TestClient + temp DB), cohort simulation, and the training script on fixtures."""
from __future__ import annotations

import json
import time

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import sentinel.practice.api as api
import sentinel.practice.cohort as cohort
from ml import train_expert_model as tem
from sentinel.practice.synthetic import generate_synthetic_session
from sentinel.shared import config
from sentinel.store.db import Database
from sentinel.store.models import TrainingRecordRow
from tests.practice.conftest import expert_sessions


def _payload(samples) -> list[dict]:
    return [s.model_dump(mode="json") for s in samples]


@pytest.fixture()
def client(tmp_path, analyser):
    """App with the practice router under /api/v1, a temp SQLite DB and the fixture model."""
    api.router.db = Database(f"sqlite:///{(tmp_path / 'cloud.db').as_posix()}")
    api.router.analyser = analyser
    api.router.samples_dir = tmp_path / "practice"
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    with TestClient(app) as c:
        yield c
    api.router.db = api.router.analyser = api.router.samples_dir = None


P = "/api/v1/practice"


def test_session_lifecycle_and_history(client):
    r = client.post(f"{P}/sessions", json={"trainee_id": "OP-1042", "exercise": "truck_loading_basic"})
    assert r.status_code == 200
    sid = r.json()["session_id"]
    samples = _payload(generate_synthetic_session("novice", 4, seed=12))
    for i in range(0, len(samples), 200):
        body = client.post(f"{P}/sessions/{sid}/samples", json={"samples": samples[i:i + 200]}).json()
        assert body["accepted"] == len(samples[i:i + 200]) and body["live"]["phase"]
    assert client.get(f"{P}/sessions/{sid}/report").status_code == 409
    report = client.post(f"{P}/sessions/{sid}/finish").json()
    assert report["n_cycles"] == 4 and report["provenance"] == ["ML", "SIMULATED"]
    assert report["productivity"]["label"] == "SIMULATED / ESTIMATE"
    assert client.get(f"{P}/sessions/{sid}/report").json()["overall_score"] == report["overall_score"]
    assert client.post(f"{P}/sessions/{sid}/samples", json={"samples": samples[:5]}).status_code == 409
    with api.router.db.session() as s:
        rec = s.query(TrainingRecordRow).filter_by(operator_id="OP-1042").one()
    assert rec.kind == "practice_session" and rec.passed is None and rec.score == report["overall_score"]

    sid2 = client.post(f"{P}/sessions", json={"trainee_id": "OP-1042"}).json()["session_id"]
    client.post(f"{P}/sessions/{sid2}/samples", json={"samples": _payload(generate_synthetic_session("expert", 3, seed=2))})
    client.post(f"{P}/sessions/{sid2}/finish")
    hist = client.get(f"{P}/sessions", params={"trainee_id": "OP-1042"}).json()
    assert [s["session_id"] for s in hist["sessions"]] == [sid, sid2]
    assert hist["trend"]["direction"] == "improving" and hist["trend"]["delta"] > 0


def test_validation_errors(client):
    assert client.post(f"{P}/sessions", json={"trainee_id": "X", "exercise": "nope"}).status_code == 422
    assert client.post(f"{P}/sessions/prs_missing/finish").status_code == 404
    sid = client.post(f"{P}/sessions", json={"trainee_id": "X"}).json()["session_id"]
    assert client.post(f"{P}/sessions/{sid}/finish").status_code == 422             # no samples yet


def test_exercises_and_model_status(client):
    ex = {e["exercise_id"]: e for e in client.get(f"{P}/exercises").json()}
    assert ex["truck_loading_basic"]["model_available"] and not ex["trench_basic"]["model_available"]
    status = client.get(f"{P}/model").json()
    assert status["available"] and status["model_version"] == "emm-test"


def test_no_model_returns_503_and_never_crashes(client, monkeypatch):
    def no_model(*_args):
        raise FileNotFoundError("no expert motion model")

    api.router.analyser = None
    monkeypatch.setattr(api.PracticeAnalyser, "load", no_model)
    assert client.get(f"{P}/model").json() == {"available": False, "detail": api.NOT_TRAINED}
    sid = client.post(f"{P}/sessions", json={"trainee_id": "X"}).json()["session_id"]
    body = client.post(f"{P}/sessions/{sid}/samples",
                       json={"samples": _payload(generate_synthetic_session("novice", 1, seed=1))}).json()
    assert body["live"] is None and body["model_status"] == api.NOT_TRAINED
    r = client.post(f"{P}/sessions/{sid}/finish")
    assert r.status_code == 503 and r.json() == {"detail": api.NOT_TRAINED}
    assert client.post(f"{P}/demo/generate", json={"archetype": "novice"}).status_code == 503
    assert all(not e["model_available"] for e in client.get(f"{P}/exercises").json())
    with client.websocket_connect(f"{P}/sessions/{sid}/live") as ws:
        assert ws.receive_json()["data"]["model_available"] is False


def test_demo_generate_guards(client, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MODE", False)
    assert client.post(f"{P}/demo/generate", json={"archetype": "novice"}).status_code == 403
    monkeypatch.setattr(config, "DEMO_MODE", True)
    monkeypatch.setitem(__import__("sys").modules, "sentinel.sim.practice", None)   # simulator missing
    r = client.post(f"{P}/demo/generate", json={"archetype": "novice"})
    assert r.status_code == 503 and "simulator" in r.json()["detail"]


def test_demo_generate_and_replay(client, monkeypatch):
    """Uses the synthetic generator in place of the simulator so the test is self-contained."""
    fake = type("M", (), {"generate_practice_session": staticmethod(
        lambda archetype, n_cycles, seed=0, exercise="truck_loading_basic":
        generate_synthetic_session(archetype, n_cycles, seed=seed))})
    monkeypatch.setitem(__import__("sys").modules, "sentinel.sim.practice", fake)
    monkeypatch.setattr(config, "DEMO_MODE", True)
    out = client.post(f"{P}/demo/generate", json={"archetype": "novice_improving", "n_cycles": 3}).json()
    assert out["simulated"] and out["report"]["n_cycles"] == 3 and out["session"]["status"] == "analysed"
    sid = out["session"]["session_id"]
    with client.websocket_connect(f"{P}/sessions/{sid}/live?speed=1000") as ws:
        frames = []
        while (frame := ws.receive_json())["type"] == "live":
            frames.append(frame)
    assert frame["type"] == "report" and frame["data"]["overall_score"] == out["report"]["overall_score"]
    assert len(frames) == out["session"]["n_samples"] and {"phase", "deviation", "hint"} <= frames[0]["data"].keys()


def test_ws_streams_live_steps_as_samples_arrive(client):
    sid = client.post(f"{P}/sessions", json={"trainee_id": "X"}).json()["session_id"]
    samples = _payload(generate_synthetic_session("expert", 2, seed=3))
    with client.websocket_connect(f"{P}/sessions/{sid}/live") as ws:
        client.post(f"{P}/sessions/{sid}/samples", json={"samples": samples[:20]})
        got = [ws.receive_json() for _ in range(20)]
        assert all(f["type"] == "live" for f in got) and got[-1]["data"]["ts"] == samples[19]["ts"]
        client.post(f"{P}/sessions/{sid}/samples", json={"samples": samples[20:]})
        client.post(f"{P}/sessions/{sid}/finish")
        while (frame := ws.receive_json())["type"] == "live":
            pass
        assert frame["type"] == "finished"


def test_cohort_endpoint(client):
    body = client.get(f"{P}/cohort-sim", params={"n": 6, "sessions": 5, "effect": 1.4}).json()
    assert body["provenance"] == ["SIMULATED", "ASSUMPTION"] and "summary" in body["gains"]
    assert client.get(f"{P}/cohort-sim", params={"n": 500}).status_code == 422


# ---------------------------------------------------------------- cohort
@pytest.fixture()
def synthetic_calibration(monkeypatch):
    """Calibrate on the built-in generator so results do not depend on the simulator's current tuning."""
    monkeypatch.setattr(cohort, "_sim_sessions", lambda seed: None)
    cohort.calibrate.cache_clear()
    yield
    cohort.calibrate.cache_clear()


def test_cohort_coached_beats_control_and_is_fast(synthetic_calibration):
    t0 = time.perf_counter()
    out = cohort.compare_arms(n_trainees=20, n_sessions=12, effect=1.4, seed=3)
    assert time.perf_counter() - t0 < 8.0          # ~1.2 s idle; generous under parallel load
    co, ct = out["coached"], out["control"]
    assert co["score"]["mean"][-1] >= ct["score"]["mean"][-1]
    assert all(a >= b for a, b in zip(co["pct_proficient_by_session"], ct["pct_proficient_by_session"]))
    assert co["end"]["m3_per_h"] >= ct["end"]["m3_per_h"]
    assert co["score"]["mean"][0] == ct["score"]["mean"][0]                     # same trainees at the start
    assert co["score"]["mean"][-1] > co["score"]["mean"][0]
    assert all(lo <= m <= hi for lo, m, hi in zip(co["score"]["p05"], co["score"]["mean"], co["score"]["p95"]))
    assert out["calibration_source"].startswith("sentinel.practice.synthetic")
    assert "ASSUMPTION" in out["assumptions"]["lr_multiplier_note"] and "SIMULATED" in out["gains"]["summary"]


def test_cohort_deterministic_and_effect_monotone(synthetic_calibration):
    a = cohort.compare_arms(10, 8, 1.4, seed=5)
    assert a == cohort.compare_arms(10, 8, 1.4, seed=5)
    assert a != cohort.compare_arms(10, 8, 1.4, seed=6)
    none = cohort.compare_arms(10, 8, 1.0, seed=5)
    assert none["coached"]["score"] == none["control"]["score"]               # no effect -> identical arms
    assert a["coached"]["score"]["mean"][-1] > none["coached"]["score"]["mean"][-1]


# ---------------------------------------------------------------- training script
def test_train_on_fixtures_writes_card(tmp_path):
    trainees = [(a, generate_synthetic_session(a, 6, seed=60 + k, operator=f"T{k}"))
                for a in ("intermediate", "novice", "novice_improving") for k in range(2)]
    card = tem.train(expert_sessions(12), trainees, "emm-fixture", tmp_path, source="fixture")
    out = tmp_path / "emm-fixture"
    assert {p.name for p in out.iterdir()} == {"model.joblib", "envelopes.json", "model_card.json"}
    assert card["training_data"]["provenance"] == "SIMULATED expert operators"
    assert card["training_data"]["n_cycles_excluded_safety"] >= 1
    ev = card["evaluation"]
    assert ev["label"] == "SIMULATED" and all(ev["separation"].values())
    assert ev["leave_one_expert_out"]["phase_acc_smoothed"] > 0.95
    assert set(ev["leave_one_expert_out"]["per_expert"]) == {"EXP-A", "EXP-B", "EXP-C", "EXP-D"}
    assert ev["archetypes"]["novice_improving"]["spearman_cycle_vs_score"] > 0.3


def test_main_uses_loaders_and_out_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(tem, "load_expert_sessions", lambda n, c: (expert_sessions(10), "fixture"))
    monkeypatch.setattr(tem, "load_trainee_sessions", lambda n, c: [
        (a, generate_synthetic_session(a, 4, seed=70)) for a in ("intermediate", "novice", "novice_improving")])
    card = tem.main(["--out", str(tmp_path)])
    assert card["data_source"] == "fixture" and len(list(tmp_path.glob("emm-*/model.joblib"))) == 1


def test_unsafe_expert_pool_is_refused():
    pool = [tem.ExpertSession.from_samples(op, "truck_loading_basic", generate_synthetic_session(
        "expert", 6, seed=i, operator=op, unsafe_cycles=tuple(range(6)))) for i, op in enumerate("ABC")]
    with pytest.raises(ValueError, match="safety gate"):
        tem.fit_expert_model(pool, version="x")


def test_sessions_from_flat_parquet_frame():
    samples = generate_synthetic_session("expert", 2, seed=1)
    rows = [s.model_dump(exclude={"gt"}) | {"gt_phase": s.gt["phase"], "gt_cycle": s.gt["cycle"],
                                             "archetype": "expert", "operator_id": "EXP-9", "session_id": "s1"}
            for s in samples]
    (op, arch, ex, parsed), = tem.sessions_from_frame(pd.DataFrame(rows))
    assert (op, arch, ex, len(parsed)) == ("EXP-9", "expert", "truck_loading_basic", len(samples))
    assert parsed[10].gt["phase"] == samples[10].gt["phase"] and json.dumps(parsed[0].gt)
