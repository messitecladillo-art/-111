"""Task collaboration exercised through the HTTP API and an unprivileged DB role."""

import copy
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from evix_api.app import create_app
from evix_api.runtime import SCHEMA_REVISION, create_runtime
from infrastructure.database.models import AgentTask
from multi_agent.roles import AgentRole
from multi_agent.workflow import AgentResult, ReviewDecision
from tests.test_postgres import project

pytestmark = pytest.mark.postgres


@pytest.mark.asyncio
async def test_production_lifespan_accepts_current_migration_and_rejects_old_revision(
    settings, pg_engine, monkeypatch,
):
    # Inject only into local_test, then exercise the same production startup
    # branch against the real unprivileged DB role. No external service is used.
    runtime = create_runtime(settings, engine=pg_engine)
    application = SimpleNamespace(state=SimpleNamespace(silicon_tasks=set()))
    settings.mode = "production"
    with pg_engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == SCHEMA_REVISION
    async with runtime.lifespan(application):
        pass
    monkeypatch.setattr("evix_api.runtime.SCHEMA_REVISION", "0008_agent_tasks")
    with pytest.raises(RuntimeError, match="current migrations"):
        async with runtime.lifespan(application):
            pytest.fail("Old application revision must reject the updated schema")


@pytest.fixture
def task_harness(settings, pg_engine):
    deliveries, clients, calls = {}, [], []

    async def mail(challenge_id, email, code):
        deliveries[challenge_id] = code

    def specialist(role):
        def run(state):
            calls.append(role.value)
            return AgentResult(
                "Synthetic task output",
                (f"artifact:synthetic-{role.value}",),
            )
        return run

    def review(state):
        calls.append("reviewer")
        return AgentResult("Synthetic review", review_decision=ReviewDecision.APPROVE)

    app = create_app(
        settings, engine=pg_engine, mail=mail,
        workflow_handlers={
            AgentRole.RESEARCH: specialist(AgentRole.RESEARCH),
            AgentRole.SURVEY: specialist(AgentRole.SURVEY),
            AgentRole.DATA: specialist(AgentRole.DATA),
            AgentRole.REVIEWER: review,
        },
    )

    def login(email):
        client = TestClient(app)
        client.headers["origin"] = settings.allowed_origins[0]
        challenge = client.post("/api/auth/code", json={"email": email}).json()
        response = client.post("/api/auth/verify", json={
            "challengeId": challenge["challengeId"],
            "code": deliveries[challenge["challengeId"]],
        })
        assert response.status_code == 200, response.text
        session = response.json()
        client.headers["x-csrf-token"] = session["csrfToken"]
        clients.append(client)
        return client, session["user"]["id"]

    yield login, calls
    for client in clients:
        client.close()


def make_task(client, project_id, task_type="questionnaire"):
    path = f"/api/projects/{project_id}/agent-tasks"
    response = client.post(path, json={
        "taskType": task_type, "requirements": {"goal": "Synthetic collaboration test"},
    })
    assert response.status_code == 201, response.text
    return f'{path}/{response.json()["id"]}', response.json()


def step(client, path, action, revision, **payload):
    response = client.post(f"{path}/{action}", json={
        "expectedRevision": revision, **payload,
    })
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("creator_role", ["owner", "editor"])
def test_teammates_review_and_advance_same_task_without_rewriting_creator(
    task_harness, pg_engine, creator_role,
):
    login, calls = task_harness
    owner, owner_id = login("a@example.test")
    editor, editor_id = login("b@example.test")
    research, team = project(owner)
    assert owner.post(f"/api/teams/{team}/members", json={
        "email": "b@example.test", "role": "editor",
    }).status_code == 201
    creator, actor, creator_id = (
        (owner, editor, owner_id) if creator_role == "owner"
        else (editor, owner, editor_id)
    )
    path, initial = make_task(creator, research["id"])
    pending = step(actor, path, "advance", 0)
    assert pending["status"] == "needs_input"
    assert pending["state"]["awaiting_approval"] == "approve_reviewer"
    assert calls == ["survey", "reviewer"]

    approved = step(creator, path, "approval", pending["revision"], approved=True)
    completed = step(actor, path, "advance", approved["revision"])
    assert completed["status"] == "completed"
    assert calls == ["survey", "reviewer"]
    assert creator.get(path).json() == actor.get(path).json()
    stale = actor.post(f"{path}/approval", json={
        "expectedRevision": pending["revision"], "approved": True,
    })
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "revision_conflict"
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": owner_id})
        row = connection.execute(select(AgentTask.__table__).where(
            AgentTask.id == initial["id"],
        )).mappings().one()
        assert row["created_by"] == creator_id
        assert row["project_id"] == research["id"]
        assert row["task_type"] == "questionnaire"


def test_teammate_can_supply_required_input_and_revocation_takes_effect(task_harness):
    login, calls = task_harness
    owner, _ = login("a@example.test")
    editor, editor_id = login("b@example.test")
    research, team = project(owner)
    owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"})
    path, _ = make_task(owner, research["id"], "data_analysis")
    waiting = step(owner, path, "advance", 0)
    assert waiting["state"]["awaiting_approval"] == "upload_real_data"
    supplied = step(editor, path, "input", waiting["revision"],
                    artifactRefs=["artifact:synthetic-test-dataset"])
    assert calls == []
    assert owner.delete(f"/api/teams/{team}/members/{editor_id}").status_code == 204
    assert editor.post(f"{path}/advance", json={"expectedRevision": supplied["revision"]}).status_code == 404
    assert editor.get(path).status_code == 404
    assert calls == []
    done = step(owner, path, "advance", supplied["revision"])
    assert done["status"] == "completed"
    assert done["state"]["input_artifact_refs"] == ["artifact:synthetic-test-dataset"]
    assert calls == ["data", "reviewer"]


@pytest.mark.parametrize("role", ["viewer", "reviewer"])
def test_readonly_members_and_outsiders_cannot_change_task(task_harness, pg_engine, role):
    login, calls = task_harness
    owner, _ = login("a@example.test")
    reader, reader_id = login("b@example.test")
    outsider, outsider_id = login("c@example.test")
    research, team = project(owner)
    owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": role})
    path, initial = make_task(owner, research["id"])
    assert reader.get(path).status_code == 200
    assert outsider.get(path).status_code == 404
    for action, extra in (
        ("advance", {}), ("approval", {"approved": True}),
        ("input", {"artifactRefs": ["artifact:synthetic-test-dataset"]}),
    ):
        payload = {"expectedRevision": 0, **extra}
        assert reader.post(f"{path}/{action}", json=payload).status_code == 403
        assert outsider.post(f"{path}/{action}", json=payload).status_code == 404
    for user_id in (reader_id, outsider_id):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user_id})
            result = connection.execute(text(
                "UPDATE agent_tasks SET revision=revision+1 WHERE id=:id"
            ), {"id": initial["id"]})
            assert result.rowcount == 0
    assert owner.get(path).json() == initial
    assert calls == []


@pytest.mark.parametrize("column", ["id", "project_id", "created_by", "task_type", "created_at"])
def test_task_identity_is_immutable_even_for_an_authorized_editor(
    task_harness, pg_engine, column,
):
    login, _ = task_harness
    owner, _ = login("a@example.test")
    editor, editor_id = login("b@example.test")
    first, team = project(owner)
    second, _ = project(owner)
    owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"})
    path, task = make_task(owner, first["id"])
    # Both source and destination projects are editable by this actor.
    assignments = {
        "id": ("id=:value", str(uuid4())),
        "project_id": ("project_id=:value", second["id"]),
        "created_by": ("created_by=:value", editor_id),
        "task_type": ("task_type=:value", "topic_design"),
        "created_at": ("created_at=created_at + interval '1 second'", None),
    }
    assignment, value = assignments[column]
    with pytest.raises(DBAPIError, match="agent task identity is immutable"):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": editor_id})
            connection.execute(text(f"UPDATE agent_tasks SET {assignment} WHERE id=:id"),
                               {"id": task["id"], "value": value})
    assert owner.get(path).json() == task


def test_agent_task_insert_cannot_impersonate_a_teammate(task_harness, pg_engine):
    login, _ = task_harness
    owner, owner_id = login("a@example.test")
    editor, editor_id = login("b@example.test")
    research, team = project(owner)
    owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"})
    _, task = make_task(owner, research["id"])
    forged_id = str(uuid4())
    forged_state = copy.deepcopy(task["state"])
    forged_state["task_id"] = forged_id
    with pytest.raises(DBAPIError, match="row-level security"):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": editor_id})
            connection.execute(AgentTask.__table__.insert().values(
                id=forged_id, project_id=research["id"], created_by=owner_id,
                task_type="questionnaire", status="ready", state=forged_state, revision=0,
            ))
