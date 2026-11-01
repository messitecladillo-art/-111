"""One-role durable handoff semantics without a database or model supplier."""

import asyncio
from copy import deepcopy

import pytest

from multi_agent.agents.contracts import AgentOutput, AgentResult, AgentRole, ReviewDecision
from multi_agent.agents.reviewer_agent.schemas import ReviewerOutput
from multi_agent.workflow.langgraph_runner import LangGraphRunner
from multi_agent.workflow.orchestrator import (
    MAX_WORKFLOW_STATE_BYTES, WorkflowEngine, WorkflowError, WorkflowState,
    WorkflowStatus, create_workflow,
)


def task(kind="topic_design", **changes):
    state = create_workflow(project_id="project-1", task_type=kind, requirements={"goal": "synthetic"})
    for key, value in changes.items():
        setattr(state, key, value)
    return state


@pytest.mark.parametrize("wrapper", [lambda value: value, LangGraphRunner])
def test_prepare_never_calls_handler_and_apply_advances_exactly_one_role(wrapper):
    calls = []
    def research(state):
        calls.append("research")
        return AgentResult("proposal", artifact_refs=("artifact:proposal",))
    def reviewer(state):
        calls.append("reviewer")
        return AgentResult("reviewed", review_decision=ReviewDecision.APPROVE)
    runner = wrapper(WorkflowEngine({AgentRole.RESEARCH: research, AgentRole.REVIEWER: reviewer}))
    original = task(context={"nested": {"value": "unchanged"}})
    snapshot = deepcopy(original.to_dict())
    prepared = runner.prepare_step(original)
    assert calls == []
    assert original.to_dict() == snapshot
    assert (prepared.role, prepared.state.status) == (AgentRole.RESEARCH, WorkflowStatus.RUNNING)
    result = prepared.handler(deepcopy(prepared.state))
    updated = runner.apply_result(prepared.state, result)
    assert calls == ["research"]
    assert updated.status is WorkflowStatus.READY
    assert updated.revision == 1
    assert updated.artifact_refs == ["artifact:proposal"]
    assert prepared.state.revision == 0
    assert original.to_dict() == snapshot


def test_callback_cannot_mutate_saved_input_when_called_with_separate_copy():
    def malicious_copy(state):
        state.context["nested"]["value"] = "changed"
        state.requirements["goal"] = "changed"
        state.artifact_refs.append("artifact:not-returned")
        state.revision = 5
        return AgentResult("legitimate result")
    engine = WorkflowEngine({AgentRole.RESEARCH: malicious_copy})
    prepared = engine.prepare_step(task(context={"nested": {"value": "original"}}))
    receipt_snapshot = deepcopy(prepared.state.to_dict())
    result = prepared.handler(deepcopy(prepared.state))
    updated = engine.apply_result(WorkflowState.from_dict(receipt_snapshot), result)
    assert prepared.state.to_dict() == receipt_snapshot
    assert updated.context == {"nested": {"value": "original"}}
    assert updated.requirements == {"goal": "synthetic"}
    assert updated.artifact_refs == []
    assert updated.revision == 1


def test_legacy_advance_preserves_in_place_api_but_isolates_callback_mutation():
    def mutation(state):
        state.context["unexpected"] = True
        state.artifact_refs.append("artifact:injected")
        return AgentResult("synthetic")
    original = task()
    returned = WorkflowEngine({AgentRole.RESEARCH: mutation}).advance(original)
    assert returned is original
    assert original.context == {}
    assert original.artifact_refs == []
    assert original.revision == 1


@pytest.mark.parametrize("status", [WorkflowStatus.RUNNING, WorkflowStatus.NEEDS_INPUT,
                                    WorkflowStatus.BLOCKED, WorkflowStatus.FAILED,
                                    WorkflowStatus.COMPLETED])
def test_nonready_checkpoint_never_redispatches(status):
    def forbidden(_):
        pytest.fail("Must not replay a running/paused/terminal checkpoint")
    engine = WorkflowEngine({AgentRole.RESEARCH: forbidden})
    original = task(status=status, current_role=AgentRole.RESEARCH)
    prepared = engine.prepare_step(original)
    assert prepared.handler is None
    assert prepared.role is None
    assert prepared.state.to_dict() == original.to_dict()


def test_input_and_configuration_blockers_create_no_executable_step():
    engine = WorkflowEngine({})
    missing = engine.prepare_step(task())
    assert missing.handler is None
    assert missing.state.status is WorkflowStatus.BLOCKED
    assert missing.state.artifact_refs == []
    waiting = engine.prepare_step(task("data_analysis"))
    assert waiting.handler is None
    assert waiting.state.status is WorkflowStatus.NEEDS_INPUT
    assert waiting.state.awaiting_approval == "upload_real_data"
    finished = engine.prepare_step(task(revision=2))
    assert finished.handler is None
    assert finished.state.status is WorkflowStatus.COMPLETED


@pytest.mark.asyncio
async def test_async_handler_and_unknown_exception_reach_application_caller():
    class SupplierOutcomeUnknown(RuntimeError):
        pass
    async def handler(_):
        await asyncio.sleep(0)
        raise SupplierOutcomeUnknown("safe synthetic test marker")
    engine = WorkflowEngine({AgentRole.RESEARCH: handler})
    prepared = engine.prepare_step(task())
    with pytest.raises(SupplierOutcomeUnknown):
        await prepared.handler(deepcopy(prepared.state))
    assert prepared.state.status is WorkflowStatus.RUNNING
    assert prepared.state.errors == []


@pytest.mark.parametrize("result", [
    {"summary": "untyped"},
    AgentResult(""),
    AgentResult("summary", artifact_refs="artifact:wrong-container"),
    AgentResult("summary", artifact_refs=(123,)),
    AgentResult("summary", evidence_refs=(" ",)),
    AgentResult("summary", errors=(None,)),
    AgentResult("summary", unresolved_questions="wrong-container"),
    AgentResult("summary", review_decision="approve"),
    AgentResult("summary", review_decision=ReviewDecision.APPROVE),
    AgentResult("summary", output={"summary": "untyped"}),
    AgentResult("x" * 8_001),
    AgentResult("summary", artifact_refs=("x" * 513,)),
    AgentResult("summary", artifact_refs=tuple(f"a:{i}" for i in range(101))),
    AgentResult("summary", errors=tuple("x" * 8_000 for _ in range(20))),
])
def test_invalid_handoff_is_atomic_and_safe(result):
    engine = WorkflowEngine({AgentRole.RESEARCH: lambda _: result})
    prepared = engine.prepare_step(task(artifact_refs=["artifact:prior"], errors=["prior_error"]))
    snapshot = deepcopy(prepared.state.to_dict())
    failed = engine.apply_result(prepared.state, result)
    assert failed.status is WorkflowStatus.FAILED
    assert failed.errors == ["prior_error", "invalid_agent_result"]
    assert failed.artifact_refs == ["artifact:prior"]
    assert failed.agent_outputs == {}
    assert failed.revision == 0
    assert prepared.state.to_dict() == snapshot


def test_mutable_nested_output_is_detached_and_revalidated():
    class Structured(AgentOutput):
        detail: dict
    output = Structured(summary="structured", detail={"items": ["original"]})
    engine = WorkflowEngine({AgentRole.RESEARCH: lambda _: AgentResult("structured", output=output)})
    prepared = engine.prepare_step(task())
    updated = engine.apply_result(prepared.state, AgentResult("structured", output=output))
    output.detail["items"].append("after-return")
    assert updated.agent_outputs["research"]["detail"] == {"items": ["original"]}
    forged = Structured.model_construct(summary=23, detail={})
    failed = engine.apply_result(prepared.state, AgentResult("forged", output=forged))
    assert failed.status is WorkflowStatus.FAILED
    assert failed.errors == ["invalid_agent_result"]
    output.detail["nonfinite"] = float("nan")
    failed = engine.apply_result(prepared.state, AgentResult("structured", output=output))
    assert failed.status is WorkflowStatus.FAILED


@pytest.mark.parametrize("changes", [
    {"status": WorkflowStatus.READY}, {"current_role": AgentRole.DATA},
    {"revision": 2}, {"revision": -1}, {"revision": True},
])
def test_apply_requires_exact_prepared_running_position(changes):
    engine = WorkflowEngine({AgentRole.RESEARCH: lambda _: AgentResult("ok")})
    prepared = engine.prepare_step(task()).state
    for key, value in changes.items():
        setattr(prepared, key, value)
    with pytest.raises(WorkflowError):
        engine.apply_result(prepared, AgentResult("should not apply"))


def test_json_and_aggregate_checkpoint_bounds_are_enforced():
    engine = WorkflowEngine({AgentRole.RESEARCH: lambda _: AgentResult("ok")})
    with pytest.raises(WorkflowError):
        engine.prepare_step(task(context={"invalid": float("inf")}))
    with pytest.raises(WorkflowError):
        engine.prepare_step(task(context={"large": "x" * MAX_WORKFLOW_STATE_BYTES}))
    # The starting snapshot fits; appending an otherwise valid individual result does not.
    original = task(context={"almost_full": "x" * (MAX_WORKFLOW_STATE_BYTES - 1000)})
    prepared = engine.prepare_step(original)
    result = AgentResult("y" * 2_000, artifact_refs=("artifact:must-not-leak",))
    failed = engine.apply_result(prepared.state, result)
    assert failed.status is WorkflowStatus.FAILED
    assert failed.errors == ["invalid_agent_result"]
    assert failed.artifact_refs == []


def apply_one(engine, state, result):
    prepared = engine.prepare_step(state)
    assert prepared.handler is not None
    return engine.apply_result(prepared.state, result)


def test_review_revision_human_gate_and_resume_preserved_one_step_at_a_time():
    engine = WorkflowEngine({role: lambda _: None for role in AgentRole})
    state = apply_one(engine, task(max_retries=1), AgentResult("proposal"))
    state = apply_one(engine, state, AgentResult("revise", review_decision=ReviewDecision.REVISE))
    assert (state.revision, state.status) == (0, WorkflowStatus.READY)
    assert state.retry_count == {"research": 1}
    state = apply_one(engine, state, AgentResult("revised proposal"))
    state = apply_one(engine, state, AgentResult("approved", review_decision=ReviewDecision.APPROVE))
    assert (state.revision, state.status) == (2, WorkflowStatus.NEEDS_INPUT)
    assert state.awaiting_approval == "approve_reviewer"
    engine.approve(state, approved=True)
    final = engine.prepare_step(state)
    assert final.state.status is WorkflowStatus.COMPLETED
    assert final.handler is None


def test_reviewer_rejection_and_rework_limit_do_not_progress():
    engine = WorkflowEngine({role: lambda _: None for role in AgentRole})
    state = apply_one(engine, task(max_retries=0), AgentResult("proposal"))
    rejected = apply_one(engine, state, AgentResult("reject", review_decision=ReviewDecision.REJECT))
    assert rejected.status is WorkflowStatus.BLOCKED
    assert rejected.revision == 1
    exhausted = apply_one(engine, state, AgentResult("revise", review_decision=ReviewDecision.REVISE))
    assert exhausted.status is WorkflowStatus.BLOCKED
    assert exhausted.retry_count == {"research": 1}
    assert exhausted.revision == 1


def test_missing_reviewer_decision_cannot_publish_partial_artifacts():
    engine = WorkflowEngine({AgentRole.REVIEWER: lambda _: None})
    prepared = engine.prepare_step(task(revision=1))
    failed = engine.apply_result(prepared.state, AgentResult("invalid review", artifact_refs=("artifact:unsafe",)))
    assert failed.status is WorkflowStatus.FAILED
    assert failed.artifact_refs == []
    assert failed.summary == ""
    assert failed.errors == ["invalid_agent_result"]
    waiting = engine.apply_result(prepared.state, AgentResult("need source", unresolved_questions=("provide source",)))
    assert waiting.status is WorkflowStatus.NEEDS_INPUT
    assert waiting.awaiting_approval == "agent_input"


def test_legacy_graph_does_not_loop_or_replay_a_running_checkpoint():
    def forbidden(_):
        pytest.fail("Running checkpoint must not replay")
    runner = LangGraphRunner(WorkflowEngine({AgentRole.RESEARCH: forbidden}))
    original = task(status=WorkflowStatus.RUNNING, current_role=AgentRole.RESEARCH)
    assert runner.advance(original).to_dict() == original.to_dict()


@pytest.mark.parametrize("field,value", [
    ("summary", "different summary"),
    ("artifact_refs", ["artifact:unrecorded"]),
    ("evidence_refs", ["evidence:unrecorded"]),
    ("unresolved_questions", ["input still required"]),
    ("errors", ["blocked"]),
])
def test_structured_output_cannot_contradict_its_handoff_envelope(field, value):
    payload = {"summary": "matched"}
    payload[field] = value
    output = AgentOutput(**payload)
    engine = WorkflowEngine({AgentRole.RESEARCH: lambda _: None})
    prepared = engine.prepare_step(task())
    failed = engine.apply_result(prepared.state, AgentResult("matched", output=output))
    assert failed.status is WorkflowStatus.FAILED
    assert failed.errors == ["invalid_agent_result"]
    assert failed.artifact_refs == []
    assert failed.agent_outputs == {}


def test_legacy_sync_entry_rejects_async_handler_without_starting_it():
    calls = []
    async def async_handler(_):
        calls.append("started")
        return AgentResult("must await through durable caller")
    state = task()
    WorkflowEngine({AgentRole.RESEARCH: async_handler}).advance(state)
    assert calls == []
    assert state.status is WorkflowStatus.FAILED
    assert state.errors == ["research failed: TypeError"]


@pytest.mark.parametrize("decision", [ReviewDecision.REJECT, ReviewDecision.REVISE])
def test_review_envelope_cannot_approve_a_rejected_structured_deliverable(decision):
    engine = WorkflowEngine({AgentRole.REVIEWER: lambda _: None})
    prepared = engine.prepare_step(task(revision=1))
    output = ReviewerOutput(summary="review", deliverable={
        "decision": decision, "stage": "research",
        "findings": [{"severity": "blocking", "location": "source",
                      "issue": "missing evidence", "required_change": "supply source"}],
        "competition_readiness": {"status": "not_ready", "basis": "missing evidence"},
        "revision_request": "supply source",
    })
    rejected = engine.apply_result(prepared.state, AgentResult(
        "review", review_decision=ReviewDecision.APPROVE, output=output))
    assert rejected.status is WorkflowStatus.FAILED
    assert rejected.errors == ["invalid_agent_result"]
    assert rejected.awaiting_approval is None
    assert rejected.agent_outputs == {}
    assert rejected.revision == prepared.state.revision
    # Consistent negative reviews retain their existing return/reject behavior.
    consistent = engine.apply_result(prepared.state, AgentResult(
        "review", review_decision=decision, output=output))
    assert consistent.status is (WorkflowStatus.BLOCKED if decision is ReviewDecision.REJECT else WorkflowStatus.READY)
