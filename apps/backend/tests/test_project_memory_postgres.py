import pytest
from sqlalchemy import text

from tests.test_postgres import project

pytestmark = pytest.mark.postgres


def test_memory_version_table_and_rls_exist(pg_engine):
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT to_regclass('project_memory_versions')")).scalar()
        assert connection.execute(text(
            "SELECT relrowsecurity FROM pg_class WHERE relname='project_memory_versions'"
        )).scalar() is True


def test_project_memory_starts_empty_and_saves_a_version(harness):
    _, login, _, _ = harness
    client, _ = login()
    item, _ = project(client)
    response = client.get(f"/api/projects/{item['id']}/memory")
    assert response.status_code == 200
    assert response.json()["revision"] == 0
    assert response.json()["seed"]["intent"]["title"] == item["title"]

    document = {
        "schemaVersion": 1,
        "intent": {field: {"value": "", "status": "unknown"} for field in ("title", "researchQuestion", "decisionGoal", "population", "geography", "stage")},
        "decisions": [],
        "openQuestions": [],
    }
    saved = client.post(f"/api/projects/{item['id']}/memory/versions", json={
        "schemaVersion": 1, "idempotencyKey": "11111111-1111-4111-8111-111111111111",
        "expectedRevision": 0, "document": document, "changeNote": "初始化",
    })
    assert saved.status_code == 201
    assert saved.json()["revision"] == 1
    assert client.get(f"/api/projects/{item['id']}/memory").json()["document"]["intent"]["title"]["status"] == "unknown"


def test_viewer_and_reviewer_read_memory_but_cannot_write(harness):
    _, login, _, _ = harness
    owner, _ = login()
    other, _ = login("b@example.test")
    item, team = project(owner)
    document = {
        "schemaVersion": 1,
        "intent": {field: {"value": "", "status": "unknown"} for field in ("title", "researchQuestion", "decisionGoal", "population", "geography", "stage")},
        "decisions": [], "openQuestions": [],
    }
    for role in ("viewer", "reviewer"):
        assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": role}).status_code == 201
        read = other.get(f"/api/projects/{item['id']}/memory")
        assert read.status_code == 200
        assert read.json()["permissions"]["canEdit"] is False
        assert other.post(f"/api/projects/{item['id']}/memory/versions", json={
            "schemaVersion": 1, "idempotencyKey": "22222222-2222-4222-8222-222222222222",
            "expectedRevision": 0, "document": document, "changeNote": "",
        }).status_code == 403
