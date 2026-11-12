"""Synthetic, provider-free contract tests for immutable model assignments."""

from copy import deepcopy
import json
from types import SimpleNamespace

import pytest

from application.agent_model_bindings import (
    ROLE_CAPABILITIES, ROLE_STEPS, TASK_ROLES, freeze_model_bindings,
    validate_frozen_model_bindings, validate_role_bindings,
)
from shared.errors import ApiError


OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"
C = "33333333-3333-4333-8333-333333333333"


def selection(service_id=A, revision=1):
    return {"serviceId": service_id, "revision": revision}


def model(revision=1, capabilities=("research", "questionnaire", "report"), deleted=False):
    return SimpleNamespace(revision=revision, capabilities=list(capabilities), deleted=deleted)


def resolver(services=None):
    calls = []
    services = {A: model(), B: model(), C: model()} if services is None else services

    def resolve(service_id):
        calls.append(service_id)
        return services.get(service_id)

    return resolve, calls


def freeze(raw, *, task_type="full_research", resolve=None, owner_id=OWNER):
    return freeze_model_bindings(raw, owner_id=owner_id, task_type=task_type, resolve_service=resolve or resolver()[0])


def plan():
    return {"schemaVersion": 1, "default": selection()}


def assert_error(code, action, status=None):
    with pytest.raises(ApiError) as caught:
        action()
    assert caught.value.code == code
    if status is not None:
        assert caught.value.status == status
    return caught.value


def test_wire_steps_match_all_actual_internal_workflows_and_task_pipeline_roles():
    from multi_agent.agents.research_agent.workflow import ResearchWorkflow
    from multi_agent.agents.survey_agent.workflow import SurveyWorkflow
    from multi_agent.agents.data_agent.workflow import DataWorkflow
    from multi_agent.agents.writing_agent.workflow import WritingWorkflow
    from multi_agent.agents.reviewer_agent.workflow import ReviewerWorkflow
    from multi_agent.workflow.orchestrator import _PIPELINE

    for workflow in (ResearchWorkflow, SurveyWorkflow, DataWorkflow, WritingWorkflow, ReviewerWorkflow):
        assert ROLE_STEPS[workflow.role.value] == workflow.steps
    assert set(TASK_ROLES) == set(_PIPELINE)
    for task_type, roles in _PIPELINE.items():
        assert set(TASK_ROLES[task_type]) == {role.value for role in roles}


@pytest.mark.parametrize("task_type", TASK_ROLES)
def test_default_covers_the_exact_task_steps_including_reviewer(task_type):
    resolve, calls = resolver()
    frozen = freeze(plan(), task_type=task_type, resolve=resolve)
    expected = {f"{role}.{step}" for role in TASK_ROLES[task_type] for step in ROLE_STEPS[role]}
    assert set(frozen["steps"]) == expected
    assert calls == [A]
    assert frozen["ownerId"] == OWNER and frozen["schemaVersion"] == 1
    for qualified, binding in frozen["steps"].items():
        assert binding == {**selection(), "capability": ROLE_CAPABILITIES[qualified.split(".")[0]]}
    assert validate_frozen_model_bindings(json.loads(json.dumps(frozen)), owner_id=OWNER, task_type=task_type) == frozen


def test_step_role_default_precedence_is_frozen_without_mutating_or_aliasing_input():
    raw = {"schemaVersion": 1, "default": selection(C), "roles": {"research": selection(B)},
           "steps": {"research.design_research": selection(A)}}
    before = deepcopy(raw)
    resolve, calls = resolver()
    frozen = freeze(raw, task_type="topic_design", resolve=resolve)
    assert calls == [A, B, C], "owned row lock order must not depend on request object order"
    assert frozen["steps"]["research.design_research"]["serviceId"] == A
    assert frozen["steps"]["research.review_materials"]["serviceId"] == B
    assert frozen["steps"]["reviewer.check_evidence"]["serviceId"] == C
    assert raw == before
    raw["steps"]["research.design_research"]["revision"] = 99
    frozen["steps"]["research.design_research"]["revision"] = 2
    assert frozen["steps"]["research.review_materials"]["revision"] == 1
    assert before["steps"]["research.design_research"]["revision"] == 1


def test_roles_and_steps_can_cover_a_task_without_a_default_and_never_autoselect():
    raw = {"schemaVersion": 1, "roles": {"research": selection(B), "reviewer": selection(A)}}
    assert len(freeze(raw, task_type="topic_design")["steps"]) == 6
    assert_error("invalid_model_plan", lambda: freeze({"schemaVersion": 1}, task_type="topic_design"))
    assert_error("invalid_model_plan", lambda: freeze({"schemaVersion": 1, "roles": {"research": selection()}}, task_type="topic_design"))
    resolve, calls = resolver()
    assert freeze_model_bindings(None, owner_id=OWNER, task_type="topic_design", resolve_service=resolve) is None
    assert validate_frozen_model_bindings(None, owner_id=OWNER) is None
    assert validate_role_bindings(None, owner_id=OWNER, role="research", resolve_service=resolve) is None
    assert calls == []


@pytest.mark.parametrize("raw", [
    {}, [], True, 1, "plan", {"schemaVersion": True}, {"schemaVersion": 1.0}, {"schemaVersion": 2},
    {"schemaVersion": 1, "default": None}, {"schemaVersion": 1, "roles": None},
    {"schemaVersion": 1, "steps": []}, {"schemaVersion": 1, "default": selection(), "ownerId": OWNER},
    {"schemaVersion": 1, "default": {**selection(), "provider": "private-provider"}},
    {"schemaVersion": 1, "default": selection(revision=True)},
    {"schemaVersion": 1, "default": selection(revision=1.0)},
    {"schemaVersion": 1, "default": selection(revision=0)},
    {"schemaVersion": 1, "default": selection(revision=2_147_483_648)},
    {"schemaVersion": 1, "default": selection(service_id="not-a-uuid")},
    {"schemaVersion": 1, "default": selection(service_id=OWNER.upper())},
    {"schemaVersion": 1, "default": selection(service_id="00000000-0000-0000-0000-000000000000")},
    {"schemaVersion": 1, "default": selection(), "roles": {"unknown": selection()}},
    {"schemaVersion": 1, "default": selection(), "steps": {"research.unknown": selection()}},
    {"schemaVersion": 1, "default": selection(), "steps": {"review_materials": selection()}},
    {"schemaVersion": 1, "default": selection(), "roles": {"survey": selection()}},
    {"schemaVersion": 1, "default": selection(), "steps": {"data.analyze_data": selection()}},
])
def test_invalid_and_irrelevant_raw_fields_fail_before_any_service_lookup(raw):
    resolve, calls = resolver()
    assert_error("invalid_model_plan", lambda: freeze(raw, task_type="topic_design", resolve=resolve), 422)
    assert calls == []


def test_custom_mappings_and_non_string_keys_are_rejected_before_accessors_execute():
    class Trap(dict):
        def items(self):
            raise AssertionError("must not be read")

        def __iter__(self):
            raise AssertionError("must not be read")

    for raw in (Trap(plan()), {**plan(), "roles": Trap()}, {**plan(), "default": Trap(selection())}, {1: "field"}):
        assert_error("invalid_model_plan", lambda: freeze(raw))
    assert_error("invalid_model_plan", lambda: freeze(plan(), task_type="unrecognized"))
    assert_error("invalid_model_plan", lambda: freeze(plan(), owner_id="invalid-owner"))


@pytest.mark.parametrize("service, code", [
    (None, "model_service_unavailable"), (model(deleted=True), "model_service_unavailable"),
    (SimpleNamespace(revision=1, capabilities=["research"]), "model_service_unavailable"),
    (model(revision=2), "model_service_revision_conflict"),
    (model(revision=True), "model_service_revision_conflict"),
    (model(capabilities=("research",)), "model_capability_unavailable"),
    (SimpleNamespace(revision=1, deleted=False, capabilities="research,report"), "model_capability_unavailable"),
])
def test_current_service_revision_deletion_and_effective_capability_are_checked(service, code):
    resolve, _ = resolver({A: service})
    assert_error(code, lambda: freeze(plan(), task_type="topic_design", resolve=resolve))


def test_shadowed_references_still_need_owned_current_revisions_but_capabilities_apply_to_effective_steps():
    raw = {"schemaVersion": 1, "default": selection(C), "roles": {"research": selection(B), "reviewer": selection(B)},
           "steps": {"research.design_research": selection(A)}}
    resolve, calls = resolver({A: model(capabilities=("research",)), B: model(), C: model(capabilities=())})
    assert freeze(raw, task_type="topic_design", resolve=resolve)["steps"]["reviewer.check_evidence"]["serviceId"] == B
    assert calls == [A, B, C]
    resolve, _ = resolver({A: model(), B: model(), C: model(revision=2)})
    assert_error("model_service_revision_conflict", lambda: freeze(raw, task_type="topic_design", resolve=resolve))
    resolve, _ = resolver({A: model(), B: model()})
    assert_error("model_service_unavailable", lambda: freeze(raw, task_type="topic_design", resolve=resolve))


def test_safe_errors_and_snapshots_do_not_read_or_leak_provider_configuration():
    class NoConfiguration:
        revision = 1
        capabilities = ["research", "questionnaire", "report"]
        deleted = False

        @property
        def provider(self):
            raise AssertionError("provider configuration must not be read")

        @property
        def api_key(self):
            raise AssertionError("secrets must not be read")

    frozen = freeze(plan(), resolve=lambda _service: NoConfiguration())
    assert set(frozen) == {"schemaVersion", "ownerId", "steps"}
    assert all(set(item) == {"serviceId", "revision", "capability"} for item in frozen["steps"].values())
    forbidden = "synthetic-private-provider-config"

    def broken(_service):
        raise RuntimeError(forbidden)

    error = assert_error("model_service_unavailable", lambda: freeze(plan(), resolve=broken))
    assert forbidden not in error.message and forbidden not in str(error)


def test_frozen_snapshot_checks_owner_exact_step_coverage_types_capabilities_and_detaches():
    frozen = freeze(plan(), task_type="topic_design")
    assert_error("model_bindings_owner_mismatch", lambda: validate_frozen_model_bindings(frozen, owner_id=OTHER), 403)
    mutations = []
    for field, value in (("provider", "injected"), ("schemaVersion", True), ("ownerId", "invalid")):
        changed = deepcopy(frozen); changed[field] = value; mutations.append(changed)
    partial = deepcopy(frozen); del partial["steps"]["research.review_materials"]; mutations.append(partial)
    wrong_capability = deepcopy(frozen); wrong_capability["steps"]["research.review_materials"]["capability"] = "report"; mutations.append(wrong_capability)
    extra = deepcopy(frozen); extra["steps"]["research.review_materials"]["baseUrl"] = "injected"; mutations.append(extra)
    wrong_revision = deepcopy(frozen); wrong_revision["steps"]["research.review_materials"]["revision"] = True; mutations.append(wrong_revision)
    for changed in mutations:
        assert_error("invalid_model_bindings", lambda: validate_frozen_model_bindings(changed, owner_id=OWNER, task_type="topic_design"))
    assert_error("invalid_model_bindings", lambda: validate_frozen_model_bindings(frozen, owner_id=OWNER, task_type="report"))
    clean = validate_frozen_model_bindings(frozen, owner_id=OWNER)
    clean["steps"]["research.review_materials"]["revision"] = 99
    assert frozen["steps"]["research.review_materials"]["revision"] == 1


def test_role_preflight_rechecks_only_that_roles_owned_refs_in_sorted_order_and_accepts_role_enum():
    from multi_agent.agents.contracts import AgentRole

    raw = {"schemaVersion": 1, "default": selection(C), "roles": {"research": selection(B)},
           "steps": {"research.assess_feasibility": selection(A)}}
    frozen = freeze(raw, task_type="topic_design")
    resolve, calls = resolver({A: model(), B: model(), C: model(deleted=True)})
    selected = validate_role_bindings(frozen, owner_id=OWNER, role=AgentRole.RESEARCH, resolve_service=resolve)
    assert calls == [A, B]
    assert set(selected) == {f"research.{step}" for step in ROLE_STEPS["research"]}
    assert_error("model_service_unavailable", lambda: validate_role_bindings(frozen, owner_id=OWNER, role="reviewer", resolve_service=resolve))
    assert_error("invalid_model_bindings", lambda: validate_role_bindings(frozen, owner_id=OWNER, role="survey", resolve_service=resolve))
    assert_error("model_bindings_owner_mismatch", lambda: validate_role_bindings(frozen, owner_id=OTHER, role="research", resolve_service=resolve))


def test_role_preflight_never_substitutes_a_new_revision_or_capability_and_snapshot_is_unchanged():
    frozen = freeze(plan(), task_type="topic_design")
    before = deepcopy(frozen)
    for service, code in ((model(revision=2), "model_service_revision_conflict"), (model(capabilities=("report",)), "model_capability_unavailable")):
        resolve, _ = resolver({A: service})
        assert_error(code, lambda: validate_role_bindings(frozen, owner_id=OWNER, role="research", resolve_service=resolve))
    assert frozen == before
