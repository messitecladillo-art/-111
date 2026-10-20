"""Actual synthetic PostgreSQL atomicity, RLS, replay and immutable history."""
import copy
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, func, select, text, update
from sqlalchemy.exc import DBAPIError

import application.services.questionnaires as app_module
import multi_agent.agents.research_agent.services.topic_regions as region_module
from shared.errors import ApiError
from shared.contracts import fingerprint
from infrastructure.database.models import Operation, Project, QuestionnaireTopicBinding, QuestionnaireTopicBindingSource, Version, now
from infrastructure.database.models import TopicProjectVersion
from multi_agent.agents.research_agent.services.topic_questionnaire import HASH_CONTRACT, transfer_hash
from tests.test_contracts import blank
from tests.test_postgres import project
from tests.test_topic_projects import document
from tests.test_topic_projects_postgres import decision_body, save as save_topic
from tests.test_topic_questionnaire import mutation_payload

pytestmark = pytest.mark.postgres


def path(p):
    return f'/api/projects/{p["id"]}/questionnaire/versions'


def source_from(client, p):
    topic = client.get(f'/api/projects/{p["id"]}/topic').json()
    return {"brief": topic["document"]["brief"], "version": topic["head"], "dirty": False, "decisionRevision": topic["decision"]["revision"]}


def confirmed_topic(client, p, value=None):
    url = f'/api/projects/{p["id"]}/topic'
    previous = client.get(url).json()
    response = save_topic(client, url, previous["head"]["revision"] if previous["head"] else 0, value or document())
    assert response.status_code == 201, response.text
    version = response.json()["version"]
    response = client.post(url + "/decisions", json=decision_body(version, previous["decision"]["revision"]))
    assert response.status_code == 201, response.text
    return source_from(client, p)


def plain_save(client, p, design, revision, **extra):
    return client.post(path(p), json={"design": design, "expectedRevision": revision, "idempotencyKey": str(uuid4()), **extra})


def sidecar(client, p, version):
    response = client.get(path(p) + f'/{version["id"]}/topic-binding')
    assert response.status_code == 200, response.text
    return response.json()


def counts(engine, uid, project_id):
    with engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": uid})
        return tuple(connection.scalar(select(func.count()).select_from(model).where(model.project_id == project_id)) for model in (Version, QuestionnaireTopicBinding, QuestionnaireTopicBindingSource))


def test_apply_saves_unsaved_before_design_and_binding_atomically_with_legacy_receipt(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p)
    saved = plain_save(owner, p, {**blank(), "title": "saved base"}, 0).json()
    before = {**blank(), "title": "unsaved draft", "pilotNotes": "未保存的手工说明\n第二行😀"}
    payload, application = mutation_payload(source, before, saved, selected=["brief:title", "brief:objective"])
    response = owner.post(path(p), json=payload)
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert set(receipt) == {"id", "projectId", "revision", "design", "updatedAt"}
    assert receipt["design"] == application["after"] and receipt["design"]["pilotNotes"] == before["pilotNotes"]
    linked = sidecar(owner, p, receipt)
    assert set(linked) == {"versionId", "binding", "bindingHash", "designTransferHash"}
    assert linked == {"versionId": receipt["id"], "binding": application["binding"], "bindingHash": transfer_hash(application["binding"]), "designTransferHash": transfer_hash(receipt["design"])}
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": identity["user"]["id"]})
        row = connection.execute(select(QuestionnaireTopicBinding).where(QuestionnaireTopicBinding.version_id == receipt["id"])).mappings().one()
        assert row["audit"]["beforeDesign"] == before
        assert row["audit"]["sourceDecisionRevision"] == 1
        assert row["parent_version_id"] == saved["id"]
        assert connection.scalar(select(Version.design_hash).where(Version.id == receipt["id"])) == fingerprint(receipt["design"])
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (2, 2, 1)


def test_normal_saves_inherit_full_historical_binding_after_source_changes(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p)
    payload, app = mutation_payload(source, blank())
    first = owner.post(path(p), json=payload).json()
    changed_topic = document(); changed_topic["brief"]["title"] = "上游新草稿"
    assert save_topic(owner, f'/api/projects/{p["id"]}/topic', 1, changed_topic).status_code == 201
    manual = {**first["design"], "objective": "后续手工修订", "questions": []}
    response = plain_save(owner, p, manual, 1)
    assert response.status_code == 201, response.text
    assert sidecar(owner, p, response.json())["binding"] == app["binding"]
    assert sidecar(owner, p, first)["binding"] == app["binding"]


def test_existing_legacy_row_without_sidecar_reads_and_can_be_explicit_restore_origin(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    legacy_id = str(uuid4())
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": identity["user"]["id"]})
        connection.execute(Version.__table__.insert().values(id=legacy_id, project_id=p["id"], revision=1, design=blank(), design_hash=fingerprint(blank()), created_by=identity["user"]["id"], created_at=now()))
        connection.execute(update(Project).where(Project.id == p["id"]).values(questionnaire_revision=1, revision=2))
    legacy = {"id": legacy_id, "revision": 1}
    assert sidecar(owner, p, legacy) == {"versionId": legacy_id, "binding": None, "bindingHash": None, "designTransferHash": transfer_hash(blank())}
    source = confirmed_topic(owner, p)
    payload, _ = mutation_payload(source, blank(), legacy)
    applied = owner.post(path(p), json=payload).json()
    mutation = {"kind": "restore", "hashContract": HASH_CONTRACT, "expectedBindingHash": sidecar(owner, p, applied)["bindingHash"], "origin": {"questionnaireVersionId": legacy_id}}
    response = plain_save(owner, p, {**blank(), "title": "保留新手工标题"}, 2, topicBindingMutation=mutation)
    assert response.status_code == 201, response.text
    assert sidecar(owner, p, response.json())["binding"] is None
    assert response.json()["design"]["title"] == "保留新手工标题"
    assert sidecar(owner, p, applied)["binding"] is not None


def test_restore_before_application_survives_later_edits_and_does_not_require_old_design(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p)
    payload, _ = mutation_payload(source, {**blank(), "pilotNotes": "unsaved before"})
    applied = owner.post(path(p), json=payload).json()
    edited = plain_save(owner, p, {**applied["design"], "title": "later"}, 1).json()
    mutation = {"kind": "restore", "hashContract": HASH_CONTRACT, "expectedBindingHash": sidecar(owner, p, edited)["bindingHash"], "origin": {"applicationVersionId": applied["id"], "phase": "before"}}
    restored = plain_save(owner, p, {**blank(), "title": "undo then manual edit"}, 2, topicBindingMutation=mutation)
    assert restored.status_code == 201, restored.text
    assert sidecar(owner, p, restored.json())["binding"] is None
    assert restored.json()["design"]["title"] == "undo then manual edit"


def test_second_application_keeps_authentic_historical_sources_and_ledger(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    source1 = confirmed_topic(owner, p)
    payload1, first_app = mutation_payload(source1, blank())
    first = owner.post(path(p), json=payload1).json()
    doc = document(); doc["brief"]["title"] = "另一个已确认源😀"
    source2 = confirmed_topic(owner, p, doc)
    payload2, second_app = mutation_payload(source2, first["design"], first, first_app["binding"])
    response = owner.post(path(p), json=payload2)
    assert response.status_code == 201, response.text
    binding = sidecar(owner, p, response.json())["binding"]
    assert binding == second_app["binding"]
    assert len(binding["sources"]) == len(binding["applications"]) == 2
    assert binding["applications"][0] == first_app["provenance"]


def test_new_application_rejects_old_topic_head_and_rolls_back_operation(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    payload, _ = mutation_payload(confirmed_topic(owner, p), blank())
    changed = document(); changed["brief"]["title"] = "new unconfirmed head"
    assert save_topic(owner, f'/api/projects/{p["id"]}/topic', 1, changed).status_code == 201
    response = owner.post(path(p), json=payload)
    assert response.status_code == 409 and response.json()["error"]["code"] == "stale_topic_source"
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (0, 0, 0)
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": identity["user"]["id"]})
        assert connection.scalar(select(Operation.key).where(Operation.key == payload["idempotencyKey"])) is None


def test_revoked_confirmation_rejects_a_fresh_application(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p); payload, _ = mutation_payload(source, blank())
    response = owner.post(f'/api/projects/{p["id"]}/topic/decisions', json=decision_body(source["version"], 1, "revoke"))
    assert response.status_code == 201
    response = owner.post(path(p), json=payload)
    assert response.status_code == 409 and response.json()["error"]["code"] == "topic_not_confirmed"


def test_reconfirmation_revision_is_global_and_invalidates_old_preview(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p); payload, _ = mutation_payload(source, blank())
    url = f'/api/projects/{p["id"]}/topic/decisions'
    assert owner.post(url, json=decision_body(source["version"], 1, "revoke")).status_code == 201
    assert owner.post(url, json=decision_body(source["version"], 2, "confirm")).status_code == 201
    response = owner.post(path(p), json=payload)
    assert response.status_code == 409 and response.json()["error"]["code"] == "topic_not_confirmed"
    fresh, _ = mutation_payload(source_from(owner, p), blank())
    assert owner.post(path(p), json=fresh).status_code == 201


@pytest.mark.parametrize("field", ["beforeContentHash", "briefHash", "afterContentHash", "proposalId", "design", "selectedChangeIds"])
def test_tampered_transfer_data_never_creates_partial_versions(harness, pg_engine, field):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    payload, _ = mutation_payload(confirmed_topic(owner, p), blank())
    mutation = payload["topicBindingMutation"]
    if field == "beforeContentHash": mutation["target"][field] = "0" * 64
    elif field == "briefHash": mutation["source"][field] = "0" * 64
    elif field == "design": payload["design"]["title"] = "tampered final design"
    elif field == "selectedChangeIds": mutation[field] = ["brief:missing"]
    else: mutation[field] = "0" * 64
    response = owner.post(path(p), json=payload)
    assert response.status_code == 422, response.text
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (0, 0, 0)


def test_exact_nonce_replay_precedes_source_rollout_guards_and_changed_body_conflicts(harness, monkeypatch, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p); payload, _ = mutation_payload(source, blank())
    response = owner.post(path(p), json=payload)
    assert response.status_code == 201, response.text
    original = response.json(); original_sidecar = sidecar(owner, p, original)
    doc = document(); doc["brief"]["title"] = "later head"
    confirmed_topic(owner, p, doc)
    def forbidden(*_args, **_kwargs):
        raise AssertionError("mutable transfer guards must not run during replay")
    with monkeypatch.context() as patch:
        patch.setattr(app_module, "prepare_binding_save", forbidden)
        replay = owner.post(path(p), json=payload)
        assert replay.status_code == 201 and replay.json() == original
        changed = copy.deepcopy(payload); changed["design"]["title"] = "different body"
        conflict = owner.post(path(p), json=changed)
        assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "idempotency_conflict"
    fresh = {**payload, "idempotencyKey": str(uuid4())}
    assert owner.post(path(p), json=fresh).status_code == 409
    assert sidecar(owner, p, original) == original_sidecar
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (1, 1, 1)


def test_competing_apply_cas_serializes_on_the_same_project_lock(harness):
    app, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    payload, _ = mutation_payload(confirmed_topic(owner, p), blank())
    def submit(_):
        with TestClient(app) as client:
            client.cookies.update(owner.cookies); client.headers.update(owner.headers)
            return client.post(path(p), json={**payload, "idempotencyKey": str(uuid4())}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(submit, range(2)))
    assert sorted(statuses) == [201, 409]
    assert owner.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"]["revision"] == 1


def test_roles_cross_project_source_and_binding_read_permissions(harness):
    _, login, _, _ = harness
    owner, _ = login(); other, _ = login("b@example.test")
    p, team = project(owner); other_p, _ = project(other)
    payload, _ = mutation_payload(confirmed_topic(owner, p), blank())
    assert other.post(path(p), json=payload).status_code == 404
    assert other.post(path(other_p), json=payload).status_code == 409
    for role in ("viewer", "reviewer"):
        assert owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": role}).status_code == 201
        assert other.post(path(p), json=payload).status_code == 403
    assert owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "editor"}).status_code == 201
    response = other.post(path(p), json=payload)
    assert response.status_code == 201, response.text
    linked = sidecar(other, p, response.json())
    assert linked["binding"] is not None
    assert owner.get(path(other_p) + f'/{response.json()["id"]}/topic-binding').status_code == 404


def test_database_rls_composite_fks_and_immutable_triggers(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); other, other_identity = login("b@example.test")
    p, _ = project(owner); other_p, _ = project(other)
    source = confirmed_topic(owner, p); payload, _ = mutation_payload(source, blank())
    version = owner.post(path(p), json=payload).json()
    uid = identity["user"]["id"]
    for model in (QuestionnaireTopicBinding, QuestionnaireTopicBindingSource):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": other_identity["user"]["id"]})
            assert connection.execute(select(model)).all() == []
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": uid})
            assert connection.execute(update(model).values(created_by=uid)).rowcount == 0
            assert connection.execute(delete(model)).rowcount == 0
    with pytest.raises(DBAPIError):
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": uid})
            connection.execute(QuestionnaireTopicBindingSource.__table__.insert().values(version_id=version["id"], project_id=p["id"], source_version_id=str(uuid4()), source_content_hash="0" * 64, created_by=uid, created_at=now()))
    # Use a different real source ID so this proves the hash FK, not a duplicate PK.
    changed = document(); changed["brief"]["title"] = "另一个真实合成源"
    source2 = confirmed_topic(owner, p, changed)
    target = plain_save(owner, p, version["design"], 1).json()
    with pytest.raises(DBAPIError) as failure:
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": uid})
            connection.execute(QuestionnaireTopicBindingSource.__table__.insert().values(version_id=target["id"], project_id=p["id"], source_version_id=source2["version"]["id"], source_content_hash="0" * 64, created_by=uid, created_at=now()))
    assert "foreign key" in str(failure.value.orig).lower()
    # A new target ID avoids a primary-key collision and proves project ownership.
    same_owner_project, _ = project(owner)
    orphan_id = str(uuid4())
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": uid})
        connection.execute(Version.__table__.insert().values(id=orphan_id, project_id=p["id"], revision=3, design=blank(), design_hash=fingerprint(blank()), created_by=uid, created_at=now()))
    with pytest.raises(DBAPIError) as failure:
        with pg_engine.begin() as connection:
            connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": uid})
            connection.execute(QuestionnaireTopicBinding.__table__.insert().values(version_id=orphan_id, project_id=same_owner_project["id"], operation_kind="edit", binding=None, binding_hash=None, design_transfer_hash=transfer_hash(blank()), audit={}, created_by=uid, created_at=now()))
    assert "foreign key" in str(failure.value.orig).lower()
    # Triggers are installed, independently of the app role's lack of UPDATE policy.
    with pg_engine.begin() as connection:
        result = connection.execute(text("SELECT tgname FROM pg_trigger WHERE tgrelid IN ('questionnaire_topic_bindings'::regclass,'questionnaire_topic_binding_sources'::regclass) AND NOT tgisinternal")).scalars().all()
        assert set(result) == {"immutable_questionnaire_topic_bindings", "immutable_questionnaire_topic_binding_sources"}
        schema = connection.scalar(text("SELECT current_schema()"))
    assert re.fullmatch(r"test_[a-f0-9]{32}", schema)
    admin = create_engine(os.environ["EVIX_TEST_DATABASE_URL"], connect_args={"options": f"-csearch_path={schema},public"})
    try:
        for table in ("questionnaire_topic_bindings", "questionnaire_topic_binding_sources"):
            with pytest.raises(DBAPIError) as failure:
                with admin.begin() as connection:
                    # Transactional DDL in only this test's isolated schema lets
                    # the trigger execute; the exception rolls back the RLS change.
                    connection.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
                    connection.execute(text(f"UPDATE {table} SET created_by=created_by WHERE version_id=:id"), {"id": version["id"]})
            assert "immutable" in str(failure.value.orig).lower()
    finally:
        admin.dispose()
    with pg_engine.begin() as connection:
        assert connection.execute(text("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('questionnaire_topic_bindings'::regclass,'questionnaire_topic_binding_sources'::regclass)")).all() == [(True, True), (True, True)]


def test_restore_requires_explicit_same_project_origin_and_matching_binding_hash(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner); other_p, _ = project(owner)
    source = confirmed_topic(owner, p); payload, _ = mutation_payload(source, blank())
    applied = owner.post(path(p), json=payload).json()
    unrelated = plain_save(owner, other_p, blank(), 0).json()
    h = sidecar(owner, p, applied)["bindingHash"]
    for origin, expected in [({"questionnaireVersionId": unrelated["id"]}, 404), ({"applicationVersionId": applied["id"], "phase": "after"}, 422), ({"questionnaireVersionId": applied["id"], "extra": True}, 422)]:
        mutation = {"kind": "restore", "hashContract": HASH_CONTRACT, "expectedBindingHash": h, "origin": origin}
        assert plain_save(owner, p, blank(), 1, topicBindingMutation=mutation).status_code == expected
    mutation = {"kind": "restore", "hashContract": HASH_CONTRACT, "expectedBindingHash": None, "origin": {"questionnaireVersionId": applied["id"]}}
    response = plain_save(owner, p, blank(), 1, topicBindingMutation=mutation)
    assert response.status_code == 409 and response.json()["error"]["code"] == "binding_conflict"
    assert plain_save(owner, p, blank(), 1, topicBindingMutation=None).status_code == 422


def test_failure_after_sidecar_insert_rolls_back_version_source_operation_and_counters(harness, monkeypatch, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    payload, _ = mutation_payload(confirmed_topic(owner, p), blank())
    real_persist = app_module.persist_binding
    def interrupted(*args, **kwargs):
        real_persist(*args, **kwargs)
        raise ApiError(503, "synthetic_interruption", "synthetic local rollback")
    with monkeypatch.context() as patch:
        patch.setattr(app_module, "persist_binding", interrupted)
        assert owner.post(path(p), json=payload).status_code == 503
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (0, 0, 0)
    assert owner.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"] is None
    assert owner.post(path(p), json=payload).status_code == 201


def test_strict_request_boundary_rejects_duplicate_unknown_fields_and_preserves_size_limits(harness):
    _, login, _, _ = harness
    owner, _ = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p); payload, _ = mutation_payload(source, blank())
    raw = json.dumps(payload, ensure_ascii=False)
    duplicate = raw.replace('"hashContract":', '"kind":"apply","hashContract":', 1)
    response = owner.post(path(p), content=duplicate.encode(), headers={"content-type": "application/json"})
    assert response.status_code == 422 and response.json()["error"]["code"] == "duplicate_members"
    invalid = copy.deepcopy(payload); invalid["topicBindingMutation"]["rawBinding"] = {}
    assert owner.post(path(p), json=invalid).status_code == 422
    legacy = json.dumps({"design": blank(), "expectedRevision": 0, "idempotencyKey": str(uuid4())}).encode()
    assert owner.post(path(p), content=legacy + b" " * (350_001 - len(legacy)), headers={"content-type": "application/json"}).status_code == 413
    assert owner.post(path(p), content=raw.encode() + b" " * 1_000_000, headers={"content-type": "application/json"}).status_code == 413


def v2_document():
    doc = document()
    doc["schemaVersion"] = 2
    doc["profile"].update(schemaVersion=2, regionRef={"code": "420111", "catalogVersion": region_module.load_region_catalog()["catalogVersion"]})
    return doc


def catalog_rollout(monkeypatch):
    catalog, index, binding = region_module._runtime()
    new_version = catalog["catalogVersion"] + "-rollout"
    monkeypatch.setattr(region_module, "_runtime", lambda: ({**catalog, "catalogVersion": new_version}, index, {**binding, "catalogVersion": new_version}))
    return catalog


def test_catalog_rollout_rejects_fresh_confirmed_v2_apply_before_any_version_receipt_or_sidecar(harness, pg_engine, monkeypatch):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p, v2_document())
    payload, _ = mutation_payload(source, blank())
    current_catalog = catalog_rollout(monkeypatch)
    response = owner.post(path(p), json=payload)
    assert response.status_code == 422, response.text
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (0, 0, 0)
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": identity["user"]["id"]})
        assert connection.scalar(select(Operation.key).where(Operation.key == payload["idempotencyKey"])) is None
    # The exact old topic snapshot and confirmation remain available for migration.
    topic = owner.get(f'/api/projects/{p["id"]}/topic').json()
    assert topic["document"]["profile"]["regionRef"]["catalogVersion"] == current_catalog["catalogVersion"]
    assert topic["decision"]["status"] == "confirmed"


def test_catalog_rollout_preserves_stored_replay_history_inherit_and_explicit_restore(harness, monkeypatch, pg_engine):
    _, login, _, _ = harness
    owner, identity = login(); p, _ = project(owner)
    source = confirmed_topic(owner, p, v2_document())
    payload, application = mutation_payload(source, blank())
    saved_response = owner.post(path(p), json=payload)
    assert saved_response.status_code == 201, saved_response.text
    saved = saved_response.json(); original_sidecar = sidecar(owner, p, saved)
    fresh, _ = mutation_payload(source, {**saved["design"], "title": "new unsaved title"}, saved, application["binding"])
    catalog_rollout(monkeypatch)
    replay = owner.post(path(p), json=payload)
    assert replay.status_code == 201 and replay.json() == saved
    assert sidecar(owner, p, saved) == original_sidecar
    assert owner.post(path(p), json=fresh).status_code == 422
    assert counts(pg_engine, identity["user"]["id"], p["id"]) == (1, 1, 1)
    manual = plain_save(owner, p, {**saved["design"], "objective": "historical carry edit"}, 1)
    assert manual.status_code == 201, manual.text
    assert sidecar(owner, p, manual.json())["binding"] == application["binding"]
    mutation = {"kind": "restore", "hashContract": HASH_CONTRACT, "expectedBindingHash": original_sidecar["bindingHash"], "origin": {"applicationVersionId": saved["id"], "phase": "before"}}
    restored = plain_save(owner, p, blank(), 2, topicBindingMutation=mutation)
    assert restored.status_code == 201, restored.text
    assert sidecar(owner, p, restored.json())["binding"] is None
    revoked = owner.post(f'/api/projects/{p["id"]}/topic/decisions', json=decision_body(source["version"], 1, "revoke"))
    assert revoked.status_code == 201, revoked.text
    after_revoke = owner.post(path(p), json=payload)
    assert after_revoke.status_code == 201 and after_revoke.json() == saved
    assert owner.get(f'/api/projects/{p["id"]}/questionnaire').json()["questionnaire"]["id"] == restored.json()["id"]
