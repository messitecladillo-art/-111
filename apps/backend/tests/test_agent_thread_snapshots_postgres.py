from uuid import uuid4

import pytest

from tests.test_postgres import project

pytestmark = pytest.mark.postgres


def body(**extra):
    return {
        "schemaVersion": 1, "idempotencyKey": str(uuid4()), "expectedRevision": 0,
        "title": "社区体育设施研究", "messages": [{"id": "m1", "at": 1, "role": "user", "text": "下一步？"}],
        "events": [{"id": "e1", "threadId": "t", "at": 1, "kind": "user.message", "summary": "下一步？"}],
        "checkpoint": {"id": "c1", "threadId": "t", "at": 1, "eventId": "e1"},
        **extra,
    }


def test_owner_can_back_up_and_only_the_owner_can_read_it(harness):
    _, login, _, _ = harness
    owner, _ = login()
    item, team = project(owner)
    thread_id = str(uuid4())
    path = f"/api/projects/{item['id']}/agent-threads/{thread_id}"
    first = owner.put(path, json=body())
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == 1
    assert owner.get(path).json()["title"] == "社区体育设施研究"
    assert owner.get(f"/api/projects/{item['id']}/agent-threads").json()["threads"][0]["threadId"] == thread_id
    assert owner.put(path, json=body(expectedRevision=0)).status_code == 409

    other, _ = login("b@example.test")
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "viewer"}).status_code == 201
    assert other.get(path).status_code == 404
    assert other.get(f"/api/projects/{item['id']}/agent-threads").json()["threads"] == []


def test_replaying_the_same_backup_does_not_create_a_second_version(harness):
    _, login, _, _ = harness
    owner, _ = login()
    item, _ = project(owner)
    thread_id = str(uuid4())
    path = f"/api/projects/{item['id']}/agent-threads/{thread_id}"
    payload = body()
    first = owner.put(path, json=payload)
    repeated = owner.put(path, json=payload)
    assert first.json() == repeated.json()
    assert owner.get(f"/api/projects/{item['id']}/agent-threads").json()["threads"][0]["revision"] == 1
