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
