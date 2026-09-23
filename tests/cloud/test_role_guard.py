"""Role guard: `demonstrated` needs an instructor or a passing assessment; ml_service always 403; audit rows."""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from sentinel.store.db import Database
from sentinel.store.models import AuditLogRow

URL = "/api/v1/competency/OP-1042/{cid}"


def _patch(client: TestClient, cid: str, state: str, role: str | None = None, **body) -> object:
    headers = {"X-Role": role} if role else {}
    return client.patch(URL.format(cid=cid), json={"state": state, **body}, headers=headers)


def _to_in_training(client: TestClient) -> None:
    r = client.post("/api/v1/training/modules/MOD-SWING-APPROACH/complete", json={"operator_id": "OP-1042"})
    assert r.status_code == 200
    assert any(t["competency_id"] == "C04" and t["to"] == "in_training" for t in r.json()["transitions"])


def test_ml_service_can_never_set_demonstrated(client: TestClient) -> None:
    _to_in_training(client)
    r = _patch(client, "C04", "demonstrated", "ml_service")
    assert r.status_code == 403
    assert "ML" in r.json()["detail"] or "ml" in r.json()["detail"]


def test_operator_without_assessment_gets_403(client: TestClient) -> None:
    _to_in_training(client)
    assert _patch(client, "C04", "demonstrated").status_code == 403           # no header → operator
    assert _patch(client, "C04", "demonstrated", "trainee").status_code == 403


def test_supervisor_cannot_change_states_or_view_profiles(client: TestClient) -> None:
    assert _patch(client, "C04", "in_training", "supervisor").status_code == 403
    assert client.get("/api/v1/operators/OP-1042/profile", headers={"X-Role": "supervisor"}).status_code == 403
    assert client.get("/api/v1/instructor/operators", headers={"X-Role": "supervisor"}).status_code == 403


def test_unknown_role_and_header_body_mismatch_are_403(client: TestClient) -> None:
    assert _patch(client, "C04", "in_training", "admin").status_code == 403
    r = client.patch(URL.format(cid="C04"), json={"state": "demonstrated", "actor_role": "instructor"},
                     headers={"X-Role": "ml_service"})
    assert r.status_code == 403


def test_instructor_signs_off_and_audit_log_is_written(client: TestClient, demo_db: Database) -> None:
    _to_in_training(client)
    r = _patch(client, "C04", "demonstrated", "instructor", actor_id="INS-01 Marcus Lee", note="sim + observation")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["competency"]["state"] == "demonstrated"
    assert body["competency"]["verified_by"] == "INS-01 Marcus Lee"
    with demo_db.session() as s:
        rows = list(s.scalars(select(AuditLogRow).where(AuditLogRow.action == "competency_state_change",
                                                        AuditLogRow.target == "OP-1042/C04")))
    transitions = [(r.data["from"], r.data["to"], r.role) for r in rows]
    assert ("unassessed", "observed_gap", "system") in transitions
    assert ("observed_gap", "in_training", "system") in transitions
    assert ("in_training", "demonstrated", "instructor") in transitions


def test_invalid_transition_is_409(client: TestClient) -> None:
    # observed_gap -> improving skips training
    assert _patch(client, "C04", "improving", "instructor").status_code == 409


def test_quiz_pass_demonstrates_knowledge_competency_but_not_skill(client: TestClient) -> None:
    quiz = client.get("/api/v1/training/quiz/MOD-PRESTART").json()
    assert all("answer" not in q for q in quiz["questions"])
    answers = {"Q1": 1, "Q2": 1, "Q3": 1}
    attempt = client.post("/api/v1/training/quiz/MOD-PRESTART/attempts",
                          json={"operator_id": "OP-1042", "answers": answers}).json()
    assert attempt["passed"] and attempt["assessment_id"]
    assert attempt["can_set_demonstrated_for"] == ["C01"]
    ok = _patch(client, "C01", "demonstrated", "operator", assessment_id=attempt["assessment_id"])
    assert ok.status_code == 200 and ok.json()["competency"]["verified_by"].startswith("assessment:")

    swing = client.post("/api/v1/training/quiz/MOD-SWING-APPROACH/attempts",
                        json={"operator_id": "OP-1042", "answers": {"Q1": 1, "Q2": 1, "Q3": 2, "Q4": 1, "Q5": 1}}).json()
    assert swing["passed"]
    _to_in_training(client)
    denied = _patch(client, "C04", "demonstrated", "operator", assessment_id=swing["assessment_id"])
    assert denied.status_code == 403 and "instructor" in denied.json()["detail"]


def test_failed_quiz_is_not_an_assessment(client: TestClient) -> None:
    attempt = client.post("/api/v1/training/quiz/MOD-PRESTART/attempts",
                          json={"operator_id": "OP-1042", "answers": [{"question_id": "Q1", "choice": 0}]}).json()
    assert not attempt["passed"] and attempt["assessment_id"] is None
    assert _patch(client, "C01", "demonstrated", "operator", assessment_id=attempt["attempt_id"]).status_code == 403


def test_resolve_and_approve_require_roles(client: TestClient) -> None:
    esc = client.get("/api/v1/supervisor/escalations").json()["items"][0]["escalation_id"]
    url = f"/api/v1/supervisor/escalations/{esc}/resolve"
    assert client.post(url, json={"note": "radioed"}).status_code == 403
    assert client.post(url, json={"note": "radioed"}, headers={"X-Role": "supervisor"}).status_code == 200
    approve = "/api/v1/instructor/content-review/MOD-SWING-APPROACH@1.3/approve"
    assert client.post(approve, headers={"X-Role": "supervisor"}).status_code == 403
