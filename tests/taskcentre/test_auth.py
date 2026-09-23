"""Task Centre auth: password hashing, bearer sessions, expiry, and the role/scope matrix."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from sentinel.store.db import Database
from sentinel.store.taskcentre_models import SessionRow, UserRow
from sentinel.taskcentre.auth import assert_can_view_operator, hash_password, verify_password
from sentinel.taskcentre.routes_auth import router
from sentinel.taskcentre.seed import CENTER_LAT, CENTER_LON, seed_task_centre

API = "/api/v1/tc"
PASSWORDS = {"admin": "admin123", "super1": "super123", "op1": "op123", "op2": "op123", "op3": "op123"}
INSIDE_FIX = {"lat": CENTER_LAT, "lon": CENTER_LON, "accuracy_m": 8.0}


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    database = Database(f"sqlite:///{(tmp_path / 'tc.db').as_posix()}")
    with database.session() as s:
        seed_task_centre(s)
    return database


@pytest.fixture()
def client(db: Database) -> Iterator[TestClient]:
    app = FastAPI()
    app.state.db = db
    app.state.db_factory = Database.cloud      # never called: state.db is already set
    app.include_router(router, prefix="/api/v1")
    with TestClient(app) as c:
        yield c


def login(client: TestClient, username: str, **fix: Any) -> str:
    body = {"username": username, "password": PASSWORDS[username], **fix}
    response = client.post(f"{API}/auth/login", json=body)
    assert response.status_code == 200, response.text
    return response.json()["token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- password hashing
def test_password_hash_round_trip() -> None:
    stored = hash_password("op123")
    scheme, iterations, salt_hex, hash_hex = stored.split("$")
    assert (scheme, int(iterations) >= 100_000, len(salt_hex), len(hash_hex)) == ("pbkdf2", True, 32, 64)
    assert verify_password("op123", stored)
    assert not verify_password("op124", stored)
    assert "op123" not in stored


def test_each_hash_uses_a_fresh_salt() -> None:
    assert hash_password("same") != hash_password("same")


@pytest.mark.parametrize("stored", ["", "not-a-hash", "pbkdf2$1$zz$zz", "sha1$1$00$00", "pbkdf2$a$00$00"])
def test_malformed_hashes_never_verify(stored: str) -> None:
    assert not verify_password("op123", stored)


# ---------------------------------------------------------------- login / session
def test_login_issues_token_and_records_the_login_fix(client: TestClient, db: Database) -> None:
    response = client.post(f"{API}/auth/login", json={"username": "op1", "password": "op123", **INSIDE_FIX})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["user"]["username"] == "op1" and payload["user"]["role"] == "operator"
    assert "password_hash" not in payload["user"]
    assert payload["login"]["geofence_status"] == "inside"
    assert payload["login"]["ts_gmt"].endswith("Z")
    assert payload["login"]["expires_at"] - payload["login"]["ts"] == pytest.approx(12 * 3600, abs=1.0)

    me = client.get(f"{API}/auth/me", headers=auth(payload["token"]))
    assert me.status_code == 200
    assert me.json()["latest_location"]["geofence_status"] == "inside"
    assert me.json()["latest_location"]["lat"] == pytest.approx(CENTER_LAT)


def test_login_without_a_fix_is_unverified_not_outside(client: TestClient) -> None:
    payload = client.post(f"{API}/auth/login", json={"username": "op1", "password": "op123"}).json()
    assert payload["login"]["geofence_status"] == "unverified"
    assert payload["login"]["distance_m"] is None


@pytest.mark.parametrize("body", [{"username": "op1", "password": "wrong"},
                                  {"username": "nobody", "password": "op123"}])
def test_bad_credentials_are_401(client: TestClient, body: dict[str, str]) -> None:
    assert client.post(f"{API}/auth/login", json=body).status_code == 401


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nope"}, {"Authorization": "token abc"},
                                     {"Authorization": "Bearer"}])
def test_missing_or_invalid_token_is_401(client: TestClient, headers: dict[str, str]) -> None:
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401


def test_expired_token_is_401(client: TestClient, db: Database) -> None:
    token = login(client, "op1", **INSIDE_FIX)
    with db.session() as s:
        s.get(SessionRow, token).expires_at = time.time() - 1.0
    assert client.get(f"{API}/auth/me", headers=auth(token)).status_code == 401


def test_logout_invalidates_the_token(client: TestClient) -> None:
    token = login(client, "op1", **INSIDE_FIX)
    assert client.post(f"{API}/auth/logout", headers=auth(token)).json() == {"ok": True, "ended": True}
    assert client.get(f"{API}/auth/me", headers=auth(token)).status_code == 401


def test_deactivated_account_cannot_use_its_token(client: TestClient) -> None:
    token = login(client, "op1", **INSIDE_FIX)
    admin = login(client, "admin", **INSIDE_FIX)
    assert client.patch(f"{API}/users/u_op1", json={"active": False}, headers=auth(admin)).status_code == 200
    assert client.get(f"{API}/auth/me", headers=auth(token)).status_code == 401
    assert client.post(f"{API}/auth/login", json={"username": "op1", "password": "op123"}).status_code == 401


# ---------------------------------------------------------------- listing users
def test_user_list_is_scoped_by_role(client: TestClient) -> None:
    admin_users = client.get(f"{API}/users", headers=auth(login(client, "admin"))).json()
    assert admin_users["count"] == 5

    team = client.get(f"{API}/users", headers=auth(login(client, "super1"))).json()
    assert {u["username"] for u in team["users"]} == {"super1", "op1", "op2", "op3"}

    mine = client.get(f"{API}/users", headers=auth(login(client, "op1"))).json()
    assert [u["username"] for u in mine["users"]] == ["op1"]


def test_user_list_filters(client: TestClient) -> None:
    token = auth(login(client, "admin"))
    operators = client.get(f"{API}/users", params={"role": "operator"}, headers=token).json()
    assert {u["username"] for u in operators["users"]} == {"op1", "op2", "op3"}
    team = client.get(f"{API}/users", params={"supervisor_id": "u_super1"}, headers=token).json()
    assert team["count"] == 3


def test_users_requires_a_token(client: TestClient) -> None:
    assert client.get(f"{API}/users").status_code == 401


# ---------------------------------------------------------------- creating users
def test_supervisor_may_only_add_their_own_operators(client: TestClient) -> None:
    token = auth(login(client, "super1"))
    created = client.post(f"{API}/users", headers=token,
                          json={"username": "op4", "password": "op123", "name": "Lena Ortiz",
                                "role": "operator", "machine_id": "EX-04"})
    assert created.status_code == 201, created.text
    assert created.json()["supervisor_id"] == "u_super1"
    assert created.json()["site_id"] == "north-quarry"

    for body, expected in [({"username": "sup2", "password": "sup123", "name": "X", "role": "supervisor"}, 403),
                           ({"username": "op5", "password": "op123", "name": "Y", "role": "operator",
                             "supervisor_id": "u_admin"}, 403),
                           ({"username": "op1", "password": "op123", "name": "Z", "role": "operator"}, 409)]:
        assert client.post(f"{API}/users", json=body, headers=token).status_code == expected


def test_operator_may_not_create_accounts(client: TestClient) -> None:
    response = client.post(f"{API}/users", headers=auth(login(client, "op1")),
                           json={"username": "op9", "password": "op123", "name": "N", "role": "operator"})
    assert response.status_code == 403


def test_admin_creates_any_role_and_the_account_can_sign_in(client: TestClient) -> None:
    token = auth(login(client, "admin"))
    created = client.post(f"{API}/users", headers=token,
                          json={"username": "super2", "password": "super123", "name": "Dev Sharma",
                                "role": "supervisor"})
    assert created.status_code == 201 and created.json()["supervisor_id"] is None
    assert client.post(f"{API}/auth/login",
                       json={"username": "super2", "password": "super123"}).status_code == 200
    short = client.post(f"{API}/users", headers=token,
                        json={"username": "op9", "password": "x", "name": "N", "role": "operator"})
    assert short.status_code == 400


# ---------------------------------------------------------------- patching users
def test_patch_permission_matrix(client: TestClient) -> None:
    operator, supervisor, admin = (auth(login(client, u)) for u in ("op1", "super1", "admin"))

    assert client.patch(f"{API}/users/u_op1", json={"name": "Ravi K."}, headers=operator).status_code == 200
    assert client.patch(f"{API}/users/u_op2", json={"name": "nope"}, headers=operator).status_code == 403
    assert client.patch(f"{API}/users/u_op1", json={"role": "admin"}, headers=operator).status_code == 403

    assert client.patch(f"{API}/users/u_op1", json={"machine_id": "EX-11"},
                        headers=supervisor).status_code == 200
    assert client.patch(f"{API}/users/u_admin", json={"name": "nope"}, headers=supervisor).status_code == 403
    assert client.patch(f"{API}/users/u_op1", json={"role": "supervisor"},
                        headers=supervisor).status_code == 403

    assert client.patch(f"{API}/users/u_op1", json={"role": "supervisor"}, headers=admin).status_code == 200
    assert client.patch(f"{API}/users/u_nobody", json={"name": "x"}, headers=admin).status_code == 404


def test_patch_password_rehashes_and_takes_effect(client: TestClient, db: Database) -> None:
    token = auth(login(client, "op1"))
    assert client.patch(f"{API}/users/u_op1", json={"password": "newpass"}, headers=token).status_code == 200
    with db.session() as s:
        stored = s.get(UserRow, "u_op1").password_hash
    assert stored.startswith("pbkdf2$") and verify_password("newpass", stored)
    assert client.post(f"{API}/auth/login", json={"username": "op1", "password": "op123"}).status_code == 401
    assert client.post(f"{API}/auth/login",
                       json={"username": "op1", "password": "newpass"}).status_code == 200


# ---------------------------------------------------------------- scope helper
def test_assert_can_view_operator_matrix(db: Database) -> None:
    with db.session() as s:
        admin, supervisor, op1, op2 = (s.get(UserRow, uid)
                                       for uid in ("u_admin", "u_super1", "u_op1", "u_op2"))

        assert assert_can_view_operator(admin, "u_op1", s).user_id == "u_op1"
        assert assert_can_view_operator(supervisor, "u_op1", s).user_id == "u_op1"
        assert assert_can_view_operator(supervisor, "u_super1", s).user_id == "u_super1"
        assert assert_can_view_operator(op1, "u_op1", s).user_id == "u_op1"

        for viewer, target in [(op1, "u_op2"), (op2, "u_super1"), (op1, "u_admin"), (supervisor, "u_admin")]:
            with pytest.raises(HTTPException) as excinfo:
                assert_can_view_operator(viewer, target, s)
            assert excinfo.value.status_code == 403

        with pytest.raises(HTTPException) as missing:
            assert_can_view_operator(admin, "u_ghost", s)
        assert missing.value.status_code == 404
