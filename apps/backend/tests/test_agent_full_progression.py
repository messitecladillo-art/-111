"""End-to-end specialist wiring with synthetic inputs and real deterministic tools.

No model provider is called. Data storage/loading and role decisions are injected
test adapters; the statistics run the application's existing TypeScript engine.
"""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from multi_agent.agents.contracts import AgentRole, ToolResult
from multi_agent.agents.data_agent import DataAgent
from multi_agent.agents.research_agent import ResearchAgent
from multi_agent.agents.reviewer_agent import ReviewerAgent
from multi_agent.agents.survey_agent import SurveyAgent
from multi_agent.agents.writing_agent import WritingAgent
from multi_agent.agents.writing_agent.tools import latex
from multi_agent.workflow import WorkflowEngine, WorkflowState, WorkflowStatus, create_workflow
from multi_agent.workflow.handlers import create_agent_handlers
from multi_agent.workflow.langgraph_runner import LangGraphRunner
from shared.errors import ProviderFailure
from tests.test_agent_execution_postgres import advance, execution_harness, make_task
from tests.test_postgres import project


def checkpoint(state):
    return WorkflowState.from_dict(json.loads(json.dumps(state.to_dict())))


def test_full_role_graph_calls_canonical_tools_and_keeps_human_gates(tmp_path):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is required to execute the existing TypeScript statistics")
    root = Path(__file__).resolve().parents[3]
    csv = tmp_path / "synthetic-fixture.csv"
    csv.write_text("score\n1\n2\n2\n3\n", encoding="utf-8")
    data_ref = f"fixture:sha256:{sha256(csv.read_bytes()).hexdigest()}"
    evidence_ref = "fixture:synthetic-research-plan"
    tex_file = tmp_path / "synthetic-draft.tex"
    events = []
    options = {"part": "main", "includeCover": True, "includeToc": True,
               "firstLineChars": 2, "numberPages": True}

    def role_steps(role, executors):
        def trace(step, execute):
            def run(request):
                events.append((role, step))
                return execute(request)
            return run

        return {step: trace(step, execute) for step, execute in executors.items()}

    def inventory(request):
        return request.call_tool("reference_inventory", artifact_refs=request.task.artifact_refs,
                                 evidence_refs=request.task.evidence_refs).data

    def research_output(request):
        assert request.previous_results["review_materials"]["verification"] == "not_verified"
        return {
            "summary": "合成验收研究计划", "evidence_refs": [evidence_ref],
            "deliverable": {
                "title": "合成数据评分描述", "background": "软件验收",
                "research_questions": ["评分的样本均值是什么？"],
                "objectives": ["验证数值从分析传递至报告"],
                "population": "合成测试记录", "geography": "不适用", "period": "不适用",
                "feasibility": {"classification": "synthetic"},
            },
        }

    research = ResearchAgent(executors=role_steps("research", {
        "review_materials": inventory,
        "design_research": lambda _: {"plan": "descriptive"},
        "assess_feasibility": research_output,
    }))
    questionnaire = {"title": "合成评分问卷", "sections": [
        {"questions": [{"id": "score", "text": "评分"}]},
    ]}

    def survey_output(request):
        assert request.task.context["upstream_outputs"]["research"]["deliverable"]["title"] == "合成数据评分描述"
        assert request.previous_results["design_questionnaire"]["question_count"] == 1
        return {
            "summary": "合成验收问卷",
            "deliverable": {"questionnaire": questionnaire, "sampling": {},
                            "pilot_plan": {"status": "planned"}},
        }

    survey = SurveyAgent(executors=role_steps("survey", {
        "design_variables": lambda _: {"column": "score"},
        "design_questionnaire": lambda request: request.call_tool(
            "check_questionnaire", questionnaire=questionnaire,
        ).data,
        "design_sampling": survey_output,
    }))

    def load_dataset(*, artifact_refs):
        assert artifact_refs == [data_ref]
        assert sha256(csv.read_bytes()).hexdigest() == data_ref.rsplit(":", 1)[1]
        # The tool read the actual local fixture bytes. The dataset provenance
        # remains synthetic and is carried into the results and report.
        return ToolResult(data={"source": "synthetic_fixture"}, artifact_refs=artifact_refs, classification="actual")

    def analyze_dataset(*, artifact_refs):
        load_dataset(artifact_refs=artifact_refs)
        script = """
            import {readFileSync} from 'node:fs';
            import {parseSurveyCsv} from './apps/frontend/lib/survey-analysis.ts';
            import {runRecipe} from './apps/frontend/lib/analysis-recipes.ts';
            const table = parseSurveyCsv(readFileSync(process.argv[1], 'utf8'));
            const result = runRecipe(table, {
                id: 'synthetic-score', method: 'numeric', x: 0, y: null, question: '评分描述'
            }, []);
            console.log(JSON.stringify({n: result.n, mean: result.metrics[0].value}));
        """
        process = subprocess.run([node, "--experimental-strip-types", "--input-type=module", "-e", script, str(csv)],
                                 cwd=root, capture_output=True, encoding="utf-8", check=True, timeout=20)
        calculated = json.loads(process.stdout)
        assert calculated == {"n": 4, "mean": 2}
        return ToolResult(
            classification="actual", artifact_refs=artifact_refs,
            data={"deliverable": {"data_status": "analyzed", "input_artifact_refs": artifact_refs,
                                  "descriptive_statistics": [calculated], "limitations": ["合成软件验收数据"]}},
        )

    def inspect_data(request):
        refs = request.task.artifact_refs
        assert request.call_tool("check_artifact_refs", artifact_refs=refs).data["status"] == "not_loaded"
        return request.call_tool("load_dataset", artifact_refs=refs).data

    data = DataAgent(executors=role_steps("data", {
        "inspect_data": inspect_data,
        "clean_data": lambda _: {"transformation": "none"},
        "analyze_data": lambda request: {
            "summary": "实际计算合成验收文件",
            "deliverable": request.call_tool("analyze_dataset", artifact_refs=request.task.artifact_refs).data["deliverable"],
        },
    }), tools={"load_dataset": load_dataset, "analyze_dataset": analyze_dataset})

    def export_source(*, title, body):
        latex.validate_body(body)
        tex = latex.build_source(title, "", body, options)
        tex_file.write_bytes(tex.encode("utf-8"))
        ref = f"fixture:tex:sha256:{sha256(tex_file.read_bytes()).hexdigest()}"
        return ToolResult(artifact_refs=[ref], classification="actual")

    def write_report(request):
        computed = request.task.context["upstream_outputs"]["data"]["deliverable"]
        assert computed["limitations"] == ["合成软件验收数据"]
        statistic = computed["descriptive_statistics"][0]
        title = "合成验收报告"
        body = f"合成样本 {statistic['n']} 条，均值 {statistic['mean']}。"
        content = {"version": 1, "title": title, "subtitle": "", "accent": "teal",
                   "report": [{"id": "results", "title": "结果", "body": body, "source": data_ref}],
                   "slides": [{"id": "results", "title": "结果", "body": body,
                               "aside": "", "notes": "", "layout": "content"}]}
        report = request.call_tool("validate_report", content=content).data["report"]
        exported = request.call_tool("export_source", title=report["title"], body=report["report"][0]["body"])
        return {"summary": "合成验收稿已生成 TeX 源文件", "artifact_refs": exported.artifact_refs,
                "deliverable": {"status": "draft", "title": title, "abstract": body,
                                "chapters": report["report"], "export_artifact_ref": exported.artifact_refs[0]}}

    writing = WritingAgent(executors=role_steps("writing", {
        "outline_report": lambda _: {"section": "results"},
        "draft_report": write_report,
    }), tools={"export_source": export_source})
    reviewed = []

    def review_output(request):
        stage = request.task.review_stage
        source = request.task.context["upstream_outputs"][stage]["deliverable"]
        reviewed.append(stage)
        if stage == "writing":
            assert sha256(tex_file.read_bytes()).hexdigest() == source["export_artifact_ref"].rsplit(":", 1)[1]
            assert "合成样本 4 条，均值 2。" in tex_file.read_text(encoding="utf-8")
        value = {
            "decision": "approve", "stage": stage,
            "consistency_checks": [{"check": "阶段和产物对应", "result": "pass", "details": "合成验收"}],
            "competition_readiness": {"status": "not_assessed", "basis": "未评估赛事提交"},
        }
        assert request.call_tool("validate_review", deliverable=value).data["consistent"]
        return {"summary": f"合成验收复核 {stage}", "deliverable": value}

    reviewer = ReviewerAgent(executors=role_steps("reviewer", {
        "check_evidence": lambda request: {"stage": request.task.review_stage},
        "check_consistency": lambda _: {"check": "stage_handoff"},
        "review_deliverable": review_output,
    }))
    agents = [research, survey, data, writing, reviewer]
    runner = LangGraphRunner(WorkflowEngine(create_agent_handlers({agent.role: agent for agent in agents})))
    state = create_workflow(project_id="fixture-project", task_type="full_research",
                            requirements={"provenance": "synthetic_fixture"})
    state.evidence_refs.append(evidence_ref)

    for expected in ("research", "survey"):
        state = runner.advance(checkpoint(state))
        assert state.status is WorkflowStatus.NEEDS_INPUT
        assert state.awaiting_approval == "approve_reviewer"
        assert reviewed[-1] == expected
        before = deepcopy(events)
        assert runner.advance(checkpoint(state)).to_dict() == state.to_dict()
        assert events == before
        runner.approve(state, approved=True)

    state = runner.advance(checkpoint(state))
    assert state.awaiting_approval == "upload_real_data"
    assert not any(role in {"data", "writing"} for role, _ in events)
    runner.provide_input(state, [data_ref])
    state = runner.advance(checkpoint(state))
    assert state.status is WorkflowStatus.COMPLETED
    assert reviewed == ["research", "survey", "data", "writing"]
    assert len(events) == 23
    assert state.input_artifact_refs == [data_ref]
    assert state.agent_outputs["writing"]["deliverable"]["export_artifact_ref"] in state.artifact_refs


@pytest.mark.parametrize("unknown", [False, True])
def test_specialist_handler_preserves_provider_failure_for_durable_caller(unknown):
    def reject(_):
        raise ProviderFailure("provider_timeout" if unknown else "provider_rejected", unknown=unknown)

    handlers = create_agent_handlers({AgentRole.RESEARCH: ResearchAgent(executors={"review_materials": reject})})
    engine = WorkflowEngine(handlers)
    state = create_workflow(project_id="fixture-project", task_type="topic_design", requirements={})
    prepared = engine.prepare_step(state)
    with pytest.raises(ProviderFailure) as failure:
        prepared.handler(checkpoint(prepared.state))
    assert failure.value.unknown is unknown
    assert prepared.state.agent_outputs == {}
    assert engine.prepare_step(prepared.state).handler is None
    # The in-memory API still stops with a safe error; it has no durable receipt.
    assert engine.advance(state).status is WorkflowStatus.FAILED
    assert state.errors == ["research failed: ProviderFailure"]


@pytest.mark.postgres
@pytest.mark.parametrize(("unknown", "receipt_status", "error_code"), [
    (False, "failed", "execution_provider_rejected"),
    (True, "outcome_unknown", "execution_outcome_unknown"),
])
def test_http_specialist_failure_has_no_success_receipt_and_cannot_replay(
    execution_harness, unknown, receipt_status, error_code,
):
    def reject(_):
        raise ProviderFailure("provider_timeout" if unknown else "provider_rejected", unknown=unknown)

    harness = execution_harness()
    harness.hooks[AgentRole.RESEARCH] = create_agent_handlers({
        AgentRole.RESEARCH: ResearchAgent(executors={"review_materials": reject}),
    })[AgentRole.RESEARCH]
    client, _ = harness.login()
    research, _ = project(client)
    path, initial = make_task(client, research["id"], task_type="topic_design")
    stopped = advance(client, path, initial["revision"])
    assert stopped["status"] == ("blocked" if unknown else "failed")
    assert stopped["execution"]["status"] == receipt_status
    assert stopped["execution"]["errorCode"] == error_code
    assert stopped["execution"]["resultHash"] is None
    assert stopped["state"]["agent_outputs"] == {}
    assert advance(client, path, initial["revision"])["execution"] == stopped["execution"]
    assert advance(client, path, stopped["revision"])["execution"] == stopped["execution"]
    assert harness.calls == ["research"]
