"""Real PostgreSQL CAS, immutable history, precise retries and team isolation."""
import copy
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select, text, update
from sqlalchemy.exc import DBAPIError

from infrastructure.database.models import Operation
from infrastructure.database.models import TopicProjectDecision, TopicProjectVersion
from tests.test_postgres import project
from tests.test_topic_projects import document

pytestmark = pytest.mark.postgres


def save(client, path, revision=0, value=None, key=None):
    return client.post(path + "/versions", json={"expectedRevision": revision, "idempotencyKey": key or str(uuid4()), "document": document() if value is None else value})


def decision_body(version, decision_revision=0, action="confirm"):
    return {"expectedRevision": version["revision"], "expectedDecisionRevision": decision_revision, "idempotencyKey": str(uuid4()), "versionId": version["id"], "contentHash": version["contentHash"], "action": action}


def test_topic_head_history_restore_precise_retry_and_confirmation_drift(harness):
    _, login, _, _ = harness
    owner, identity = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    blank = {"revision": 0, "status": "draft", "versionId": None, "contentHash": None}
    assert owner.get(path).json() == {"head": None, "document": None, "decision": blank, "canEdit": True}
    key = str(uuid4())
    response = save(owner, path, key=key)
    assert response.status_code == 201, response.text
    first = response.json()
    assert first["document"] == document()
    assert first["version"]["revision"] == 1
    assert first["version"]["createdBy"] == identity["user"]["id"]
    assert save(owner, path, key=key).json() == first
    body = decision_body(first["version"])
    response = owner.post(path + "/decisions", json=body)
    assert response.status_code == 201, response.text
    confirmed = response.json()["decision"]
    assert confirmed == {"revision": 1, "status": "confirmed", "versionId": first["version"]["id"], "contentHash": first["version"]["contentHash"]}
    assert owner.post(path + "/decisions", json=body).json() == {"decision": confirmed}
    assert owner.get(path).json()["decision"] == confirmed
    changed = copy.deepcopy(document())
    changed["brief"]["title"] = "修订题目"
    second = save(owner, path, 1, changed).json()
    assert second["version"]["revision"] == 2
    assert second["decision"] == {**blank, "revision": 1}
    assert owner.get(path + "/versions/" + first["version"]["id"]).json()["decision"] == confirmed
    assert owner.post(path + "/decisions", json={**body, "expectedDecisionRevision": 1, "idempotencyKey": str(uuid4())}).status_code == 409
    assert save(owner, path, key=key).json() == first
    assert owner.post(path + "/decisions", json=body).json() == {"decision": confirmed}
    assert save(owner, path).status_code == 409
    assert save(owner, path, 2, changed, key).status_code == 409
    restored = save(owner, path, 2, first["document"]).json()
    assert restored["version"]["revision"] == 3 and restored["decision"]["status"] == "draft"
    assert owner.get(path).json()["head"] == restored["version"]
    assert [row["revision"] for row in owner.get(path + "/versions?before=3").json()["versions"]] == [2, 1]


def test_topic_decisions_exact_target_cas_revoke_and_reconfirm(harness):
    _, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    first = save(owner, path).json()["version"]
    assert owner.post(path + "/decisions", json=decision_body(first, action="revoke")).status_code == 409
    bad_hash = {**decision_body(first), "contentHash": "a" * 64}
    assert owner.post(path + "/decisions", json=bad_hash).status_code == 409
    assert owner.post(path + "/decisions", json=decision_body(first, 1)).status_code == 409
    confirmed = owner.post(path + "/decisions", json=decision_body(first)).json()["decision"]
    assert confirmed["revision"] == 1
    assert owner.post(path + "/decisions", json=decision_body(first, 1)).status_code == 409
    revoked = owner.post(path + "/decisions", json=decision_body(first, 1, "revoke"))
    assert revoked.status_code == 201 and revoked.json()["decision"]["status"] == "revoked"
    assert revoked.json()["decision"]["revision"] == 2
    reconfirmed = owner.post(path + "/decisions", json=decision_body(first, 2))
    assert reconfirmed.status_code == 201 and reconfirmed.json()["decision"]["revision"] == 3
    value = document()
    value["brief"]["decisionOwner"] = ""
    next_version = save(owner, path, 1, value).json()["version"]
    response = owner.post(path + "/decisions", json=decision_body(next_version, 3))
    assert response.status_code == 422 and response.json()["error"]["code"] == "brief_incomplete"
    assert owner.get(path).json()["decision"]["revision"] == 3


def test_topic_membership_roles_revoke_project_and_database_isolation(harness, pg_engine):
    _, login, _, _ = harness
    owner, owner_identity = login()
    other, other_identity = login("b@example.test")
    p, team = project(owner)
    other_project, _ = project(other)
    path = f'/api/projects/{p["id"]}/topic'
    first = save(owner, path).json()
    owner.post(path + "/decisions", json=decision_body(first["version"]))
    for suffix in ("", "/versions", "/versions/" + first["version"]["id"]):
        assert other.get(path + suffix).status_code == 404
    assert save(other, path).status_code == 404
    assert other.get(f'/api/projects/{other_project["id"]}/topic/versions/{first["version"]["id"]}').status_code == 404
    for role in ("viewer", "reviewer"):
        assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": role}).status_code == 201
        assert other.get(path).json()["canEdit"] is False
        assert save(other, path, 1).status_code == 403
        assert other.post(path + "/decisions", json=decision_body(first["version"], 1, "revoke")).status_code == 403
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"}).status_code == 201
    assert other.get(path).json()["canEdit"] is True
    assert save(other, path, 1).status_code == 201
    assert owner.delete(f'/api/teams/{team}/members/{other_identity["user"]["id"]}').status_code == 204
    assert other.get(path).status_code == 404
    for model in (TopicProjectVersion, TopicProjectDecision):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": other_identity["user"]["id"]})
            assert connection.execute(select(model)).all() == []
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": owner_identity["user"]["id"]})
            assert connection.execute(update(model).values(content_hash="a" * 64)).rowcount == 0
            assert connection.execute(delete(model)).rowcount == 0
    # The decision FK binds project, version and hash even for direct inserts.
    with pytest.raises(DBAPIError):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": owner_identity["user"]["id"]})
            connection.execute(TopicProjectDecision.__table__.insert().values(id=str(uuid4()), project_id=p["id"], revision=2, version_id=first["version"]["id"], content_hash="b" * 64, action="confirm", created_by=owner_identity["user"]["id"]))


def test_topic_history_pages_validation_and_duplicate_json(harness):
    _, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    for revision in range(33):
        value = document()
        value["brief"]["title"] = f"合成版本 {revision + 1}"
        assert save(owner, path, revision, value).status_code == 201
    page = owner.get(path + "/versions").json()
    assert len(page["versions"]) == 30 and page["nextBefore"] == 4
    last = owner.get(path + "/versions?before=4").json()
    assert [row["revision"] for row in last["versions"]] == [3, 2, 1] and last["nextBefore"] is None
    assert owner.get(path + "/versions?limit=2").json()["nextBefore"] == 32
    for invalid in ("before=0", "limit=0", "limit=31", "limit=-1"):
        assert owner.get(path + "/versions?" + invalid).status_code == 422
    for suffix in ("not-a-uuid", str(uuid4())):
        assert owner.get(path + "/versions/" + suffix).status_code in (404, 422)
    raw = '{"expectedRevision":33,"expectedRevision":33,"idempotencyKey":"' + str(uuid4()) + '","document":{}}'
    response = owner.post(path + "/versions", content=raw, headers={"content-type": "application/json"})
    assert response.status_code == 422 and response.json()["error"]["code"] == "duplicate_members"
    invalid = document()
    invalid["provenance"]["sourceIds"] = ["missing"]
    assert save(owner, path, 33, invalid).status_code == 422
    assert owner.get(path).json()["head"]["revision"] == 33


def test_topic_concurrent_retry_writes_and_decisions_are_serialized(harness, pg_engine):
    app, login, _, _ = harness
    owner, identity = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    request = {"document": document(), "expectedRevision": 0, "idempotencyKey": str(uuid4())}

    def submit(pair):
        suffix, payload = pair
        with TestClient(app, cookies=owner.cookies, headers=dict(owner.headers)) as client:
            response = client.post(path + suffix, json=payload)
            return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(submit, [("/versions", request)] * 2))
    assert replies[0] == replies[1] and replies[0][0] == 201
    first = replies[0][1]["version"]
    action = decision_body(first)
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(submit, [("/decisions", action)] * 2))
    assert replies[0] == replies[1] and replies[0][0] == 201
    requests = [("/versions", {**request, "expectedRevision": 1, "idempotencyKey": str(uuid4())}) for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(submit, requests))
    assert sorted(status for status, _ in replies) == [201, 409]
    current = owner.get(path).json()
    assert current["decision"]["status"] == "draft" and current["decision"]["revision"] == 1
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": identity["user"]["id"]})
        assert len(connection.execute(select(TopicProjectVersion)).all()) == 2
        assert len(connection.execute(select(TopicProjectDecision)).all()) == 1
        assert len(connection.execute(select(Operation).where(Operation.scope == "topic-project-version:" + p["id"])).all()) == 2


def test_topic_immutable_triggers_also_protect_against_migration_owner_rewrites(harness, pg_engine):
    _, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    version = save(owner, path).json()["version"]
    assert owner.post(path + "/decisions", json=decision_body(version)).status_code == 201
    with pg_engine.connect() as connection:
        schema = connection.scalar(text("SELECT current_schema()"))
    # The migration role owns only the generated fixture schema for this test;
    # each denied mutation rolls back and cannot touch another database/schema.
    admin = create_engine(os.environ["EVIX_TEST_DATABASE_URL"], connect_args={"options": f"-csearch_path={schema},public"})
    try:
        for model in (TopicProjectVersion, TopicProjectDecision):
            for statement in (update(model).values(content_hash="c" * 64), delete(model)):
                with pytest.raises(DBAPIError, match="immutable"):
                    with admin.begin() as connection:
                        connection.execute(statement)
    finally:
        admin.dispose()
