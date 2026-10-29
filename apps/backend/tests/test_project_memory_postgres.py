import pytest
from sqlalchemy import text

from tests.test_postgres import project

pytestmark = pytest.mark.postgres


def test_memory_version_table_and_rls_exist(pg_engine):
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT to_regclass('public.project_memory_versions')")).scalar()
        assert connection.execute(text(
            "SELECT relrowsecurity FROM pg_class WHERE relname='project_memory_versions'"
        )).scalar() is True


def test_project_memory_starts_empty_and_saves_a_version(harness):
    _, login, _, _ = harness
    client, _ = login("memory@example.com")
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
