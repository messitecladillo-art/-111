import pytest

from multi_agent.roles import AgentRole
from multi_agent.workflow import AgentResult, ReviewDecision, WorkflowEngine, WorkflowError, WorkflowStatus, create_workflow
from multi_agent.workflow.langgraph_runner import LangGraphRunner


def test_topic_workflow_pauses_for_user_after_research_review():
    calls = []

    def research(state):
        calls.append(AgentRole.RESEARCH)
        return AgentResult("Topic proposal created", ("artifact:topic-1",), ("evidence:source-1",))

    def reviewer(state):
        calls.append(AgentRole.REVIEWER)
        assert "artifact:topic-1" in state.artifact_refs
        return AgentResult("Topic proposal passed review", review_decision=ReviewDecision.APPROVE)

    state = create_workflow(project_id="project-1", task_type="topic_design", requirements={"goal": "test"})
    engine = WorkflowEngine({AgentRole.RESEARCH: research, AgentRole.REVIEWER: reviewer})

    assert engine.advance(state).status == WorkflowStatus.READY
    assert engine.advance(state).status == WorkflowStatus.NEEDS_INPUT
    assert state.awaiting_approval == "approve_reviewer"
    assert state.artifact_refs == ["artifact:topic-1"]
    assert calls == [AgentRole.RESEARCH, AgentRole.REVIEWER]

    engine.approve(state, approved=True)
    assert engine.advance(state).status == WorkflowStatus.COMPLETED


def test_reviewer_can_request_bounded_revision():
    runs = {"research": 0, "reviewer": 0}

    def research(state):
        runs["research"] += 1
        return AgentResult(f"proposal-{runs['research']}")

    def reviewer(state):
        runs["reviewer"] += 1
        verdict = ReviewDecision.REVISE if runs["reviewer"] == 1 else ReviewDecision.APPROVE
        return AgentResult("reviewed", review_decision=verdict)

    state = create_workflow(project_id="project-1", task_type="topic_design", requirements={}, max_retries=1)
    engine = WorkflowEngine({AgentRole.RESEARCH: research, AgentRole.REVIEWER: reviewer})
    engine.advance(state)
    engine.advance(state)
    assert state.status == WorkflowStatus.READY
    assert state.revision == 0
    engine.advance(state)
    engine.advance(state)
    assert state.status == WorkflowStatus.NEEDS_INPUT
    assert runs == {"research": 2, "reviewer": 2}


def test_workflow_state_round_trips_as_json_data():
    state = create_workflow(
        project_id="project-1",
        task_type="data_analysis",
        requirements={"researchQuestion": "Q1"},
        input_artifact_refs=["artifact:survey.csv"],
    )

    restored = type(state).from_dict(state.to_dict())

    assert restored.task_id == state.task_id
    assert restored.current_role is None
    assert restored.input_artifact_refs == ["artifact:survey.csv"]


def test_missing_agent_handler_blocks_without_fabricating_output():
    state = create_workflow(project_id="project-1", task_type="questionnaire", requirements={})

    result = WorkflowEngine({}).advance(state)

    assert result.status == WorkflowStatus.BLOCKED
    assert result.artifact_refs == []
    assert "survey" in result.errors[0]


def test_data_role_waits_for_uploaded_real_data_reference():
    state = create_workflow(project_id="project-1", task_type="data_analysis", requirements={})
    engine = WorkflowEngine({})

    result = engine.advance(state)

    assert result.status == WorkflowStatus.NEEDS_INPUT
    assert result.awaiting_approval == "upload_real_data"
    engine.provide_input(state, ["artifact:real-survey.csv"])
    assert state.status == WorkflowStatus.READY
    assert state.input_artifact_refs == ["artifact:real-survey.csv"]


def test_user_revision_routes_back_to_specialist_not_reviewer():
    state = create_workflow(project_id="project-1", task_type="topic_design", requirements={})
    engine = WorkflowEngine({
        AgentRole.RESEARCH: lambda _: AgentResult("proposal"),
        AgentRole.REVIEWER: lambda _: AgentResult("passed", review_decision=ReviewDecision.APPROVE),
    })
    engine.advance(state)
    engine.advance(state)
    engine.approve(state, approved=False, feedback="补充依据")

    assert state.status == WorkflowStatus.READY
    assert state.revision == 0
    assert state.context["user_feedback"] == "补充依据"


def test_full_pipeline_waits_for_both_design_approvals_then_real_data():
    reviewer_calls = {"count": 0}

    def reviewer(_):
        reviewer_calls["count"] += 1
        return AgentResult("reviewed", review_decision=ReviewDecision.APPROVE)

    engine = WorkflowEngine({
        AgentRole.RESEARCH: lambda _: AgentResult("research plan", ("artifact:plan",)),
        AgentRole.SURVEY: lambda _: AgentResult("questionnaire", ("artifact:questionnaire",)),
        AgentRole.REVIEWER: reviewer,
    })
    state = create_workflow(project_id="project-1", task_type="full_research", requirements={})

    engine.advance(state)
    engine.advance(state)
    assert state.awaiting_approval == "approve_reviewer"
    engine.approve(state, approved=True)
    engine.advance(state)
    engine.advance(state)
    assert state.awaiting_approval == "approve_reviewer"
    engine.approve(state, approved=True)
    engine.advance(state)

    assert state.status == WorkflowStatus.NEEDS_INPUT
    assert state.awaiting_approval == "upload_real_data"
    assert state.current_role == AgentRole.DATA
    assert reviewer_calls["count"] == 2


def test_invalid_transition_requires_checkpoint_and_feedback():
    state = create_workflow(project_id="project-1", task_type="topic_design", requirements={})
    engine = WorkflowEngine({AgentRole.RESEARCH: lambda _: AgentResult("ok")})

    try:
        engine.approve(state, approved=True)
    except WorkflowError:
        pass
    else:
        raise AssertionError("approve should reject a state without a pending checkpoint")


def test_langgraph_runner_executes_the_coordinator_node():
    engine = WorkflowEngine({
        AgentRole.RESEARCH: lambda _: AgentResult("topic proposal"),
        AgentRole.REVIEWER: lambda _: AgentResult("reviewed", review_decision=ReviewDecision.APPROVE),
    })
    runner = LangGraphRunner(engine)
    state = create_workflow(project_id="project-1", task_type="topic_design", requirements={})

    result = runner.advance(state)

    assert result.status == WorkflowStatus.NEEDS_INPUT
    assert result.revision == 2
    assert result.summary == "reviewed"


def advance_until_paused(executor, state):
    for _ in range(20):
        state = executor.advance(state)
        if state.status != WorkflowStatus.READY:
            return state
    raise AssertionError("Workflow did not reach a gate or terminal state")


@pytest.mark.parametrize("runner_type", [WorkflowEngine, LangGraphRunner])
@pytest.mark.parametrize("task_type,specialist", [
    ("topic_design", AgentRole.RESEARCH),
    ("questionnaire", AgentRole.SURVEY),
])
def test_design_approval_resumes_to_completion_without_repeating_steps(runner_type, task_type, specialist):
    calls = []

    def produce(_):
        calls.append(specialist)
        return AgentResult("synthetic design", ("artifact:design",))

    def review(_):
        calls.append(AgentRole.REVIEWER)
        return AgentResult("reviewed", review_decision=ReviewDecision.APPROVE)

    engine = WorkflowEngine({specialist: produce, AgentRole.REVIEWER: review})
    executor = engine if runner_type is WorkflowEngine else runner_type(engine)
    state = create_workflow(project_id="project-1", task_type=task_type, requirements={})
    state = advance_until_paused(executor, state)
    assert state.status == WorkflowStatus.NEEDS_INPUT
    assert state.awaiting_approval == "approve_reviewer"
    assert state.revision == 2

    # Resume the same JSON checkpoint used by persisted API tasks.
    state = type(state).from_dict(state.to_dict())
    assert executor.advance(state).to_dict() == state.to_dict()
    executor.approve(state, approved=True)
    state = executor.advance(state)
    assert state.status == WorkflowStatus.COMPLETED
    assert state.current_role is None
    assert state.awaiting_approval is None
    assert executor.advance(state).status == WorkflowStatus.COMPLETED
    assert calls == [specialist, AgentRole.REVIEWER]


@pytest.mark.parametrize("runner_type", [WorkflowEngine, LangGraphRunner])
def test_questionnaire_user_rejection_reworks_survey_then_requires_new_approval(runner_type):
    feedback = []
    calls = []

    def survey(state):
        feedback.append(state.context.get("user_feedback"))
        calls.append(AgentRole.SURVEY)
        return AgentResult("synthetic questionnaire")

    def reviewer(_):
        calls.append(AgentRole.REVIEWER)
        return AgentResult("reviewed", review_decision=ReviewDecision.APPROVE)

    engine = WorkflowEngine({AgentRole.SURVEY: survey, AgentRole.REVIEWER: reviewer})
    executor = engine if runner_type is WorkflowEngine else runner_type(engine)
    state = create_workflow(project_id="project-1", task_type="questionnaire", requirements={}, max_retries=1)
    state = advance_until_paused(executor, state)
    checkpoint = state.to_dict()
    with pytest.raises(WorkflowError, match="Feedback is required"):
        executor.approve(state, approved=False)
    assert state.to_dict() == checkpoint

    executor.approve(state, approved=False, feedback="  补充筛选题  ")
    assert state.revision == 0
    assert state.retry_count == {"survey": 1}
    state = advance_until_paused(executor, type(state).from_dict(state.to_dict()))
    assert state.status == WorkflowStatus.NEEDS_INPUT
    assert state.awaiting_approval == "approve_reviewer"
    assert feedback == [None, "补充筛选题"]
    assert calls == [AgentRole.SURVEY, AgentRole.REVIEWER] * 2
    executor.approve(state, approved=True)
    assert executor.advance(state).status == WorkflowStatus.COMPLETED
    assert calls == [AgentRole.SURVEY, AgentRole.REVIEWER] * 2


@pytest.mark.parametrize("runner_type", [WorkflowEngine, LangGraphRunner])
def test_questionnaire_human_rework_is_bounded(runner_type):
    engine = WorkflowEngine({
        AgentRole.SURVEY: lambda _: AgentResult("synthetic questionnaire"),
        AgentRole.REVIEWER: lambda _: AgentResult("reviewed", review_decision=ReviewDecision.APPROVE),
    })
    executor = engine if runner_type is WorkflowEngine else runner_type(engine)
    state = create_workflow(project_id="project-1", task_type="questionnaire", requirements={}, max_retries=1)
    state = advance_until_paused(executor, state)
    executor.approve(state, approved=False, feedback="第一次修订")
    state = advance_until_paused(executor, state)
    executor.approve(state, approved=False, feedback="第二次修订")
    assert state.status == WorkflowStatus.BLOCKED
    assert state.awaiting_approval is None
    assert state.retry_count == {"survey": 2}
    assert state.errors == ["Retry limit reached for survey"]
    assert executor.advance(state).status == WorkflowStatus.BLOCKED


def test_full_research_runner_preserves_both_human_gates_and_survey_rework():
    calls = []

    def handler(role):
        def run(_):
            calls.append(role)
            return AgentResult("synthetic step", review_decision=ReviewDecision.APPROVE if role is AgentRole.REVIEWER else None)
        return run

    runner = LangGraphRunner(WorkflowEngine({role: handler(role) for role in AgentRole}))
    state = create_workflow(project_id="project-1", task_type="full_research", requirements={})
    state = runner.advance(state)
    assert (state.revision, state.awaiting_approval) == (2, "approve_reviewer")
    runner.approve(state, approved=True)
    state = runner.advance(state)
    assert (state.revision, state.awaiting_approval) == (4, "approve_reviewer")
    runner.approve(state, approved=False, feedback="完善问卷")
    assert state.revision == 2
    state = runner.advance(state)
    assert (state.revision, state.awaiting_approval) == (4, "approve_reviewer")
    assert calls == [AgentRole.RESEARCH, AgentRole.REVIEWER] + [AgentRole.SURVEY, AgentRole.REVIEWER] * 2
    runner.approve(state, approved=True)
    state = runner.advance(state)
    assert (state.revision, state.awaiting_approval) == (4, "upload_real_data")
    runner.provide_input(state, ["artifact:synthetic-test-upload.csv"])
    state = runner.advance(state)
    assert state.status == WorkflowStatus.COMPLETED
    assert calls[-4:] == [AgentRole.DATA, AgentRole.REVIEWER, AgentRole.WRITING, AgentRole.REVIEWER]
