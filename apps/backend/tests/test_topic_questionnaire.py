"""Synthetic kernel parity and SQLite transaction behavior; not a PostgreSQL substitute."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shared.errors import ApiError
from shared.contracts import fingerprint
from infrastructure.database.models import Base, Project, QuestionnaireTopicBinding, QuestionnaireTopicBindingSource, Team, User, Version, now
from infrastructure.database.models import TopicProjectDecision, TopicProjectVersion
from multi_agent.agents.research_agent.services.topic_projects import version_view
from multi_agent.agents.research_agent.services.topic_questionnaire import HASH_CONTRACT, binding_input, persist_binding, prepare_binding_save, rebuild_transfer, topic_binding_receipt, transfer_hash
from evix_api.requests import questionnaire_save_body
from tests.test_contracts import blank
from tests.test_topic_projects import document

FIXTURE = json.loads((Path(__file__).resolve().parents[3] / "packages/evi-x-shared/fixtures/topic-questionnaire-transfer-v1.json").read_text(encoding="utf-8"))


def mutation_payload(source, before, base=None, binding=None, selected=None, mappings=None, key=None):
    target = {"design": copy.deepcopy(before), "pending": False, "versionId": base["id"] if base else None, "revision": base["revision"] if base else 0}
    mappings = copy.deepcopy(mappings or [])
    selected = selected or ["brief:title"]
    application = rebuild_transfer(source, target, mappings, binding, selected)
    mutation = {"kind": "apply", "hashContract": HASH_CONTRACT, "expectedBindingHash": None if binding is None else transfer_hash(binding),
                "source": {"versionId": source["version"]["id"], "revision": source["version"]["revision"], "contentHash": source["version"]["contentHash"],
                           "briefHash": transfer_hash(source["brief"]), "expectedDecisionRevision": source["decisionRevision"]},
                "target": {"baseVersionId": target["versionId"], "baseRevision": target["revision"], "beforeContentHash": transfer_hash(before)},
                "beforeDesign": copy.deepcopy(before), "afterContentHash": transfer_hash(application["after"]), "proposalId": application["proposalId"],
                "mappings": mappings, "selectedChangeIds": list(selected)}
    return {"design": application["after"], "expectedRevision": target["revision"], "idempotencyKey": key or str(uuid4()), "topicBindingMutation": mutation}, application


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["id"])
def test_whole_transfer_matches_ts_generated_interoperability_fixture(case):
    original = copy.deepcopy(case)
    result = rebuild_transfer(case["source"], case["target"], case["mappings"], case["beforeBinding"], case["selectedChangeIds"])
    expected = case["expected"]
    assert result["proposalId"] == expected["proposalId"]
    assert result["after"] == expected["after"]
    assert result["binding"] == expected["binding"]
    assert transfer_hash(result["binding"]) == expected["bindingHash"]
    payload, _ = mutation_payload(case["source"], case["target"]["design"], {"id": case["target"]["versionId"], "revision": case["target"]["revision"]} if case["target"]["versionId"] else None,
                                  case["beforeBinding"], case["selectedChangeIds"], case["mappings"])
    assert payload["topicBindingMutation"] == expected["mutation"]
    assert case == original


def test_unselected_mappings_are_still_in_the_proposal_fingerprint():
    case = FIXTURE["cases"][0]
    with_mapping = rebuild_transfer(case["source"], case["target"], case["mappings"], None, ["brief:title"])
    without_mapping = rebuild_transfer(case["source"], case["target"], [], None, ["brief:title"])
    assert with_mapping["after"] == without_mapping["after"]
    assert with_mapping["proposalId"] != without_mapping["proposalId"]


@pytest.mark.parametrize("change", [
    lambda c: c["source"].update(dirty=True),
    lambda c: c["source"].update(decisionRevision=True),
    lambda c: c["target"].update(pending=True),
    lambda c: c["target"].update(revision=True),
    lambda c: c["mappings"].append(c["mappings"][0]),
    lambda c: c["mappings"][0].update(questionId="deleted-question"),
    lambda c: c["mappings"][0].update(researchQuestionIds=["missing"]),
    lambda c: c.update(selectedChangeIds=[]),
    lambda c: c.update(selectedChangeIds=["brief:title", "brief:title"]),
    lambda c: c.update(selectedChangeIds=["brief:missing"]),
    lambda c: c["source"]["brief"].update(privateData="forbidden"),
])
def test_invalid_source_target_mapping_and_selection_never_modify_input(change):
    case = copy.deepcopy(FIXTURE["cases"][0])
    change(case)
    before = copy.deepcopy(case)
    with pytest.raises(ApiError):
        rebuild_transfer(case["source"], case["target"], case["mappings"], case["beforeBinding"], case["selectedChangeIds"])
    assert case == before


def test_js_trim_and_utf16_lengths_handle_bom_nbsp_nel_and_astral_boundaries():
    case = copy.deepcopy(FIXTURE["cases"][0])
    case["source"]["brief"]["decisionOwner"] = "\ufeff\u00a0"
    case["source"]["brief"]["decision"] = "\ufeff决定\ufeff"
    case["source"]["brief"]["inclusion"] = "\u0085"  # Python.strip would incorrectly remove this; JS trim does not.
    result = rebuild_transfer(case["source"], case["target"], [], None, ["brief:objective", "brief:population"])
    assert result["after"]["objective"] == "决策问题：\ufeff决定\ufeff"
    assert result["after"]["population"].endswith("排除：" + case["source"]["brief"]["exclusion"])
    assert "纳入：\u0085" in result["after"]["population"]
    case["source"]["brief"]["title"] = "😀" * 80
    assert rebuild_transfer(case["source"], case["target"], [], None, ["brief:title"])["after"]["title"] == "😀" * 80
    case["source"]["brief"]["title"] += "😀"
    with pytest.raises(ApiError) as failure:
        rebuild_transfer(case["source"], case["target"], [], None, ["brief:title"])
    assert failure.value.code == "transfer_field_invalid"
    # An unchecked oversized source field must not prevent adopting a different valid field.
    assert rebuild_transfer(case["source"], case["target"], [], None, ["brief:geography"])["after"]["geography"] == case["source"]["brief"]["geography"]


def test_blank_mapped_sources_never_clear_existing_question_work():
    case = copy.deepcopy(FIXTURE["cases"][1])
    selected = case["mappings"][0]["researchQuestionIds"][0]
    next(q for q in case["source"]["brief"]["questions"] if q["id"] == selected)["text"] = "\ufeff\u00a0"
    with pytest.raises(ApiError) as failure:
        rebuild_transfer(case["source"], case["target"], case["mappings"], None, [f"question:{case['mappings'][0]['questionId']}:researchQuestion"])
    assert failure.value.code == "transfer_field_invalid"


def test_partial_application_preserves_every_unselected_question_field_and_ids():
    case = FIXTURE["cases"][1]
    result = rebuild_transfer(case["source"], case["target"], case["mappings"], None, case["selectedChangeIds"])
    for before, after in zip(case["target"]["design"]["questions"], result["after"]["questions"], strict=True):
        assert {k: v for k, v in before.items() if k not in ("researchQuestion", "construct")} == {k: v for k, v in after.items() if k not in ("researchQuestion", "construct")}


@pytest.mark.parametrize("change", [
    lambda b: b.update(schema="wrong"),
    lambda b: b["sources"][0].update(briefHash="0" * 64),
    lambda b: b["applications"][0].update(sourceContentHash="0" * 64),
    lambda b: b["applications"][0].update(changes=[]),
    lambda b: b["applications"][0]["changes"][0].update(field=[]),
    lambda b: b["applications"].append(b["applications"][0]),
])
def test_historical_binding_checks_hashes_relations_and_exact_shape(change):
    b = copy.deepcopy(FIXTURE["cases"][0]["expected"]["binding"])
    change(b)
    with pytest.raises(ApiError):
        binding_input(b)


@pytest.mark.asyncio
async def test_raw_request_limits_preserve_legacy_350kb_but_bound_mutations_at_1mb():
    class Request:
        headers = {"content-type": "application/json"}
        def __init__(self, value, size):
            raw = json.dumps(value).encode()
            self.raw = raw + b" " * max(0, size - len(raw))
        async def stream(self):
            for i in range(0, len(self.raw), 8192):
                yield self.raw[i:i + 8192]
    value = {"design": blank(), "expectedRevision": 0, "idempotencyKey": str(uuid4())}
    assert await questionnaire_save_body(Request(value, 350_000)) == value
    with pytest.raises(ApiError) as failure:
        await questionnaire_save_body(Request(value, 350_001))
    assert failure.value.status == 413
    mutation = {**value, "topicBindingMutation": {"kind": "invalid-but-body-shape-only"}}
    assert await questionnaire_save_body(Request(mutation, 1_000_000)) == mutation
    with pytest.raises(ApiError) as failure:
        await questionnaire_save_body(Request(mutation, 1_000_001))
    assert failure.value.status == 413


@pytest.fixture
def sqlite_state():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(id=str(uuid4()), email="synthetic@example.test")
        team = Team(id=str(uuid4()), name="synthetic")
        session.add_all([user, team]); session.flush()
        project = Project(id=str(uuid4()), team_id=team.id, title="synthetic", revision=1, questionnaire_revision=0)
        session.add(project); session.flush()
        doc = document()
        topic = TopicProjectVersion(id=str(uuid4()), project_id=project.id, revision=1, document=doc, content_hash=fingerprint(doc), created_by=user.id)
        session.add(topic); session.flush()
        session.add(TopicProjectDecision(id=str(uuid4()), project_id=project.id, revision=1, version_id=topic.id, content_hash=topic.content_hash, action="confirm", created_by=user.id))
        session.commit()
        yield session, project, user, topic
    engine.dispose()


def test_sqlite_atomic_sidecar_inheritance_and_before_restore(sqlite_state):
    session, project, user, topic = sqlite_state
    source = {"brief": topic.document["brief"], "version": version_view(topic), "dirty": False, "decisionRevision": 1}
    before = {**blank(), "pilotNotes": "unsaved manual work"}
    payload, application = mutation_payload(source, before)
    state = prepare_binding_save(session, project, None, payload["design"], payload["topicBindingMutation"], provided=True)
    version = Version(id=str(uuid4()), project_id=project.id, revision=1, design=payload["design"], design_hash=fingerprint(payload["design"]), created_by=user.id)
    session.add(version); session.flush()
    persist_binding(session, version, user, state)
    project.questionnaire_revision = 1
    session.commit()
    receipt = topic_binding_receipt(session, version)
    assert receipt["binding"] == application["binding"]
    inherited = prepare_binding_save(session, project, version, blank())
    assert inherited["binding"] == application["binding"]
    restored = prepare_binding_save(session, project, version, blank(), {"kind": "restore", "hashContract": HASH_CONTRACT, "expectedBindingHash": receipt["bindingHash"], "origin": {"applicationVersionId": version.id, "phase": "before"}}, provided=True)
    assert restored["binding"] is None
    assert session.get(QuestionnaireTopicBinding, version.id).audit["beforeDesign"] == before
    assert len(session.scalars(select(QuestionnaireTopicBindingSource)).all()) == 1


def test_sqlite_composite_fk_rejects_wrong_source_hash_and_transaction_rolls_back(sqlite_state):
    session, project, user, topic = sqlite_state
    version = Version(id=str(uuid4()), project_id=project.id, revision=1, design=blank(), design_hash=fingerprint(blank()), created_by=user.id)
    session.add(version); session.flush()
    state = prepare_binding_save(session, project, None, blank())
    persist_binding(session, version, user, state)
    session.add(QuestionnaireTopicBindingSource(version_id=version.id, project_id=project.id, source_version_id=topic.id, source_content_hash="0" * 64, created_by=user.id))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()
    assert session.get(Version, version.id) is None
    assert session.get(QuestionnaireTopicBinding, version.id) is None


def test_sqlite_confirmed_historical_v2_source_cannot_create_a_new_downstream_version(sqlite_state):
    session, project, user, _ = sqlite_state
    doc = document()
    doc["schemaVersion"] = 2
    doc["profile"].update(schemaVersion=2, regionRef={"code": "420111", "catalogVersion": "cn-admin-2024-old"})
    topic = TopicProjectVersion(id=str(uuid4()), project_id=project.id, revision=2, document=doc, content_hash=fingerprint(doc), created_by=user.id)
    session.add(topic); session.flush()
    session.add(TopicProjectDecision(id=str(uuid4()), project_id=project.id, revision=2, version_id=topic.id, content_hash=topic.content_hash, action="confirm", created_by=user.id))
    session.commit()
    source = {"brief": doc["brief"], "version": version_view(topic), "dirty": False, "decisionRevision": 2}
    payload, _ = mutation_payload(source, blank())
    with pytest.raises(ApiError) as failure:
        prepare_binding_save(session, project, None, payload["design"], payload["topicBindingMutation"], provided=True)
    assert failure.value.status == 422
    assert session.scalars(select(Version)).all() == []
    assert session.scalars(select(QuestionnaireTopicBinding)).all() == []
