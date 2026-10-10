import copy
import os
from datetime import timedelta
from uuid import uuid4
import pytest
from sqlalchemy import create_engine, select, text, update
from sqlalchemy.exc import DBAPIError
from fastapi.testclient import TestClient
from evix_api.models import Session, Service, Proposal, Challenge, RateEvent, now
from evix_api.security import keyed
from evix_api.provider import ProviderFailure
from .test_contracts import blank

pytestmark = pytest.mark.postgres


def idem():
    return str(uuid4())


def project(client):
    team = client.get("/api/teams").json()["teams"][0]["id"]
    response = client.post("/api/projects", json={"title": "合成研究", "teamId": team, "idempotencyKey": idem()})
    assert response.status_code == 201, response.text
    return response.json(), team


def service_input(**extra):
    return {"label": "离线合成服务", "provider": "openai", "baseUrl": "https://api.openai.com/v1", "model": "fixture-model",
            "maxOutputTokens": 1024, "capabilities": ["questionnaire"], "apiKey": "synthetic-private-model-key", "idempotencyKey": idem(), **extra}


def test_auth_replay_attempts_rate_uniform_and_logout(harness, settings, pg_engine):
    app, login, mail, _ = harness
    a, session = login()
    assert a.get("/api/health").json()["database"] == "ok"
    cid = next(iter(mail))
    assert a.post("/api/auth/verify", json={"challengeId": cid, "code": mail[cid][1]}).status_code == 401
    assert a.post("/api/auth/code", json={"email": "a@example.test"}).status_code == 429
    unknown = a.post("/api/auth/code", json={"email": "unknown@example.test"})
    assert unknown.status_code == 202 and unknown.json()["challengeId"] not in mail
    client = TestClient(app)
    assert client.post("/api/auth/code", json={"email": "b@example.test"}, headers={"origin": "https://attacker.invalid"}).status_code == 403
    response = client.post("/api/auth/code", json={"email": "b@example.test"}, headers={"origin": settings.allowed_origins[0]})
    cid = response.json()["challengeId"]
    for _ in range(5):
        assert client.post("/api/auth/verify", json={"challengeId": cid, "code": "000000" if mail[cid][1] != "000000" else "111111"}, headers={"origin": settings.allowed_origins[0]}).status_code == 401
    assert client.post("/api/auth/verify", json={"challengeId": cid, "code": mail[cid][1]}, headers={"origin": settings.allowed_origins[0]}).status_code == 401
    token = a.cookies.get(settings.cookie_name)
    assert a.post("/api/auth/logout", headers={"x-csrf-token": "wrong"}).status_code == 403
    assert a.post("/api/auth/logout").status_code == 204
    replay = TestClient(app)
    replay.cookies.set(settings.cookie_name, token)
    assert replay.get("/api/projects").status_code == 401


def test_invitation_removal_and_undelivered_code_fail(harness, settings, pg_engine):
    app, login, mail, _ = harness
    a, session = login()
    settings.invited_emails.remove("a@example.test")
    assert a.get("/api/services").status_code == 401
    client = TestClient(app)

    async def fail_mail(*args):
        raise RuntimeError("synthetic failure")
    from evix_api.app import create_app
    failure_app = create_app(settings, mail=fail_mail, engine=pg_engine)
    response = TestClient(failure_app).post("/api/auth/code", headers={"origin": settings.allowed_origins[0]}, json={"email": "b@example.test"})
    assert response.status_code == 202
    with pg_engine.begin() as connection:
        assert connection.scalar(select(Challenge.delivered).where(Challenge.id == response.json()["challengeId"])) is False


def test_team_isolation_roles_revocation_and_personal_services(harness, pg_engine):
    app, login, _, _ = harness
    a, sa = login()
    b, sb = login("b@example.test")
    p, team = project(a)
    assert b.get(f'/api/projects/{p["id"]}').status_code == 404
    assert b.get(f'/api/teams/{team}/members').status_code == 404
    assert a.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "viewer"}).status_code == 201
    assert b.get(f'/api/projects/{p["id"]}').status_code == 200
    assert b.get(f"/api/teams/{team}/members").status_code == 403
    assert b.post(f'/api/projects/{p["id"]}/questionnaire/versions', json={"design": blank(), "expectedRevision": 0, "idempotencyKey": idem()}).status_code == 403
    assert a.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"}).status_code == 201
    assert b.post(f'/api/projects/{p["id"]}/questionnaire/versions', json={"design": blank(), "expectedRevision": 0, "idempotencyKey": idem()}).status_code == 201
    created = a.post("/api/services", json=service_input()).json()
    assert b.get("/api/services").json()["services"] == []
    foreign = service_input(expectedRevision=1)
    foreign.pop("apiKey")
    assert b.put('/api/services/' + created["id"], json=foreign).status_code == 404
    assert a.delete(f'/api/teams/{team}/members/{sb["user"]["id"]}').status_code == 204
    assert b.get(f'/api/projects/{p["id"]}/questionnaire').status_code == 404
    assert a.delete(f'/api/teams/{team}/members/{sa["user"]["id"]}').status_code == 409
    # Actual DB policy isolation, beyond HTTP query predicates.
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id',:id,true)"), {"id": sb["user"]["id"]})
        assert connection.execute(select(Service)).all() == []


def test_vault_service_cas_idempotency_keyless_destination_and_delete(harness):
    _, login, _, _ = harness
    a, _ = login()
    body = service_input()
    response = a.post("/api/services", json=body)
    assert response.status_code == 201, response.text
    s = response.json()
    assert "key" not in response.text.lower()
    assert a.post("/api/services", json=body).json() == s
    assert a.post("/api/services", json={**body, "label": "different"}).status_code == 409
    edit = {k: v for k, v in body.items() if k != "apiKey"}
    edit.update(expectedRevision=1, idempotencyKey=idem(), label="changed")
    current = a.put('/api/services/' + s["id"], json=edit)
    assert current.status_code == 200 and current.json()["revision"] == 2
    assert a.put('/api/services/' + s["id"], json=edit).json() == current.json()
    assert a.put('/api/services/' + s["id"], json={**edit, "idempotencyKey": idem()}).status_code == 409
    changed = {**edit, "provider": "deepseek", "baseUrl": "https://api.deepseek.com/v1", "expectedRevision": 2, "idempotencyKey": idem()}
    assert a.put('/api/services/' + s["id"], json=changed).status_code == 422
    removal = {"expectedRevision": 2, "idempotencyKey": idem()}
    assert a.request("DELETE", '/api/services/' + s["id"], json=removal).status_code == 204
    assert a.request("DELETE", '/api/services/' + s["id"], json=removal).status_code == 204
    assert a.get("/api/services").json()["services"] == []


def test_immutable_versions_cas_precise_retry_and_restore(harness):
    _, login, _, _ = harness
    a, _ = login()
    p, _ = project(a)
    path = f'/api/projects/{p["id"]}/questionnaire/versions'
    data = {"design": blank(), "expectedRevision": 0, "idempotencyKey": idem()}
    one = a.post(path, json=data)
    assert one.status_code == 201, one.text
    first = one.json()
    second = a.post(path, json={"design": {**blank(), "title": "new"}, "expectedRevision": 1, "idempotencyKey": idem()}).json()
    assert second["revision"] == 2
    assert a.post(path, json=data).json() == first
    assert a.post(path, json={**data, "idempotencyKey": idem()}).status_code == 409
    old = a.get(path + '/' + first["id"]).json()
    restored = a.post(path, json={"design": old["design"], "expectedRevision": 2, "idempotencyKey": idem()}).json()
    assert restored["revision"] == 3 and restored["design"] == first["design"]
    assert a.get(path).json()["versions"][0]["revision"] == 3
    invalid = {**blank(), "classification": "actual"}
    assert a.post(path, json={"design": invalid, "expectedRevision": 3, "idempotencyKey": idem()}).status_code == 422


def test_version_history_continues_beyond_local_undo_capacity(harness):
    _, login, _, _ = harness
    client, _ = login()
    p, _ = project(client)
    path = f'/api/projects/{p["id"]}/questionnaire/versions'
    for revision in range(41):
        response = client.post(path, json={"design": {**blank(), "title": f"版本 {revision + 1}"},
                                          "expectedRevision": revision, "idempotencyKey": idem()})
        assert response.status_code == 201, response.text
        assert response.json()["revision"] == revision + 1
    assert len(client.get(path).json()["versions"]) == 41


def test_nonfinite_and_invalid_unicode_are_rejected_before_operation_hash(harness):
    _, login, _, _ = harness
    client, _ = login()
    team = client.get("/api/teams").json()["teams"][0]["id"]
    for invalid in [r'"\ud800"', "1e999", "-1e999"]:
        raw = '{"title":' + invalid + ',"teamId":"' + team + '","idempotencyKey":"' + idem() + '"}'
        response = client.post("/api/projects", content=raw, headers={"content-type": "application/json"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] in ("invalid_input", "invalid_json")
    assert client.get("/api/projects").json()["projects"] == []


def test_database_trigger_rejects_owner_mutation_and_rls_resets_between_transactions(harness, pg_engine):
    _, login, _, _ = harness
    client, identity = login()
    p, _ = project(client)
    response = client.post(f'/api/projects/{p["id"]}/questionnaire/versions',
                           json={"design": blank(), "expectedRevision": 0, "idempotencyKey": idem()})
    assert response.status_code == 201
    assert client.post("/api/services", json=service_input()).status_code == 201
    with pg_engine.begin() as connection:
        schema = connection.scalar(text("SELECT current_schema()"))
        assert schema.startswith("test_") and len(schema) == 37
        connection.execute(text("SELECT set_config('evix.user_id',:id,true)"), {"id": identity["user"]["id"]})
        assert len(connection.execute(select(Service)).all()) == 1
    with pg_engine.begin() as connection:
        assert connection.execute(select(Service)).all() == []
    admin = create_engine(os.environ["EVIX_TEST_DATABASE_URL"], connect_args={"options": f"-csearch_path={schema},public"})
    try:
        for statement in ["UPDATE questionnaire_versions SET revision=99 WHERE id=:id",
                          "DELETE FROM questionnaire_versions WHERE id=:id"]:
            with pytest.raises(DBAPIError, match="questionnaire versions are immutable"):
                with admin.begin() as connection:
                    connection.execute(text(statement), {"id": response.json()["id"]})
    finally:
        admin.dispose()
    assert client.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"] == response.json()


def test_proposal_list_personal_scope_restart_expiry_and_revocation(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, sa = login()
    teammate, sb = login("b@example.test")
    p, team = project(owner)
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"}).status_code == 201
    service = owner.post("/api/services", json=service_input()).json()
    path = f'/api/projects/{p["id"]}/proposals'
    data = {"serviceId": service["id"], "serviceRevision": 1, "brief": "合成需求", "expectedQuestionnaireRevision": 0,
            "idempotencyKey": idem(), "consent": True}
    one = owner.post(path, json=data).json()
    two = owner.post(path, json={**data, "idempotencyKey": idem()}).json()
    assert [v["id"] for v in owner.get(path).json()["proposals"]] == [two["id"], one["id"]]
    summary = owner.get(path).json()["proposals"][0]
    assert "design" not in summary and summary["title"] == two["design"]["title"]
    assert owner.get(path + '/' + two["id"]).json()["design"] == two["design"]
    assert teammate.get(path).json()["proposals"] == []
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id',:id,true)"), {"id": sa["user"]["id"]})
        connection.execute(update(Proposal).where(Proposal.id == one["id"]).values(status="running", design=None,
                                                                                 created_at=now() - timedelta(seconds=180)))
    from evix_api.app import create_app
    recreated = TestClient(create_app(settings, provider=provider, engine=pg_engine))
    recreated.cookies.update(owner.cookies)
    records = recreated.get(path).json()["proposals"]
    assert records[0]["status"] == "ready" and records[1]["status"] == "outcome_unknown"
    assert provider.calls == 2
    assert owner.delete(f'/api/teams/{team}/members/{sb["user"]["id"]}').status_code == 204
    assert teammate.get(path).status_code == 404


def test_version_history_pagination_preserves_older_versions(harness):
    _, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/questionnaire/versions'
    for revision in range(101):
        response = owner.post(path, json={"design": {**blank(), "title": f"版本 {revision + 1}"},
                                         "expectedRevision": revision, "idempotencyKey": idem()})
        assert response.status_code == 201, response.text
    first = owner.get(path).json()
    assert [v["revision"] for v in first["versions"]] == list(range(101, 1, -1))
    assert first["nextBeforeRevision"] == 2
    second = owner.get(path, params={"beforeRevision": first["nextBeforeRevision"]}).json()
    assert [v["revision"] for v in second["versions"]] == [1]
    assert second["nextBeforeRevision"] is None
    assert owner.get(path + '/' + second["versions"][0]["id"]).json()["design"]["title"] == "版本 1"
    for invalid in (0, -1, "not-a-number"):
        assert owner.get(path, params={"beforeRevision": invalid}).status_code == 422


def test_proposal_duplicate_unknown_restart_and_stale_provenance(harness, pg_engine, settings):
    app, login, _, provider = harness
    a, sa = login()
    p, team = project(a)
    s = a.post("/api/services", json=service_input()).json()
    path = f'/api/projects/{p["id"]}/proposals'
    data = {"serviceId": s["id"], "serviceRevision": 1, "brief": "合成需求", "expectedQuestionnaireRevision": 0, "idempotencyKey": idem(), "consent": True}
    response = a.post(path, json=data)
    assert response.status_code == 201, response.text
    ready = response.json()
    assert ready["status"] == "ready" and len(ready["design"]["questions"]) == 3
    assert a.post(path, json=data).json() == ready and provider.calls == 1
    assert a.post(path, json={**data, "brief": "different"}).status_code == 409 and provider.calls == 1
    assert a.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"] is None
    versions = f'/api/projects/{p["id"]}/questionnaire/versions'
    assert a.post(versions, json={"design": blank(), "expectedRevision": 0, "idempotencyKey": idem()}).status_code == 201
    assert a.post(versions, json={"design": ready["design"], "expectedRevision": 1, "sourceProposalId": ready["id"], "idempotencyKey": idem()}).status_code == 409
    # Interrupted persisted reservation is not silently replayed after app recreation.
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id',:id,true)"), {"id": sa["user"]["id"]})
        connection.execute(update(Proposal).where(Proposal.id == ready["id"]).values(status="running", design=None, created_at=now() - timedelta(seconds=180)))
    recreated = TestClient(__import__('evix_api.app', fromlist=['create_app']).create_app(settings, provider=provider, engine=pg_engine))
    recreated.cookies.update(a.cookies)
    result = recreated.get(path + '/' + ready["id"])
    assert result.json()["status"] == "outcome_unknown" and provider.calls == 1
    assert a.post(path, json=data).json()["status"] == "outcome_unknown" and provider.calls == 1
