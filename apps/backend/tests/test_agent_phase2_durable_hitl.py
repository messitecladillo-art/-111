"""Tests for Agent Upgrade Phase 2: durable checkpoints, SSE replay, HITL milestone steering, rework loop, and RLS."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from application import autonomous_cli
from application.providers import AuthoredProvider
from application.services.autonomous_research import build_planted_trap_benchmark, execute_autonomous_research_core
from application.workflow_data_tools import build_inline_sandbox
from evix_api.app import create_app
from infrastructure.llm import AgentModelTurn, ModelToolCall
from tests.test_postgres import idem, project


def _parse_sse_blocks(raw_text: str) -> list[dict]:
    events: list[dict] = []
    cur_id = ""
    cur_event = ""
    data_lines: list[str] = []

    def _flush():
        nonlocal cur_id, cur_event, data_lines
        if not data_lines:
            cur_id = ""
            cur_event = ""
            return
        parsed = json.loads("\n".join(data_lines))
        events.append({
            "id": int(cur_id) if cur_id.isdigit() else parsed["seq"],
            "event": cur_event,
            "data": parsed,
        })
        cur_id = ""
        cur_event = ""
        data_lines = []

    for raw_line in raw_text.splitlines():
        line = raw_line.rstrip("\r")
        if line == "":
            _flush()
            continue
        if line.startswith("id:"):
            cur_id = line.split(":", 1)[1].strip()
        elif line.startswith("event:"):
            cur_event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].lstrip())
    _flush()
    return events


def test_milestone_gated_pause_and_deterministic_replay_resume(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    title, questions, rows = build_planted_trap_benchmark()
    sandbox1 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    base_provider = AuthoredProvider(tmp_path)

    phase1_llm_calls = 0
    captured_events: list[tuple[str, dict]] = []
    saved_checkpoints: list[tuple[dict, dict, str, int]] = []

    class SpyProvider:
        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            nonlocal phase1_llm_calls
            phase1_llm_calls += 1
            return await base_provider.agent_step(
                config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout
            )

    paused = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-hitl-1",
            goal="县域老年智慧助餐采纳机制与里程碑纠偏验证",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="milestone_gated",
            max_tool_calls=28,
            sandbox=sandbox1,
            dataset_title=title,
            provider=SpyProvider(),
            run_id="run-hitl-1",
            emit_event=lambda et, pl: captured_events.append((et, deepcopy(pl))),
            save_checkpoint=lambda cp, gr, st, uc: saved_checkpoints.append((deepcopy(cp), deepcopy(gr), st, uc)),
        )
    )

    assert paused["status"] == "awaiting_milestone"
    assert paused["reworkRounds"] == 0
    assert paused["pendingMilestone"] is not None
    assert any(d.startswith("NEGATIVE_CITC_ITEM:") for d in paused["pendingMilestone"]["detectedDiagnostics"])
    assert paused["falsificationReport"]["decision"] == "pending"
    assert any(et == "milestone_pause" for et, _ in captured_events)
    assert saved_checkpoints and saved_checkpoints[-1][2] == "awaiting_milestone"
    # Phase 1 + Iter 1 + Iter 2 only (no Phase 3 reviewer calls!)
    assert phase1_llm_calls == 2
    assert paused["checkpoint"]["nextIteration"] == 3
    assert [op["operator"] for op in paused["checkpoint"]["executedOps"]] == [
        "inspect_distribution",
        "apply_cleaning_pipeline",
        "purify_scale_reliability",
        "factor_suitability_kmo",
    ]

    # Resume against a brand-new sandbox: prior 4 operators replay deterministically without re-calling LLM
    sandbox2 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    resume_calls: list[int] = []
    resume_events: list[tuple[str, dict]] = []

    class ResumeSpyProvider:
        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            # Ensure steering message is visible and prior iterations are not re-executed
            resume_calls.append(len(messages))
            if len(resume_calls) == 1:
                assert any(
                    m.get("role") == "user" and "PI 人工审阅与纠偏指令" in str(m.get("content", ""))
                    for m in messages
                )
            return await base_provider.agent_step(
                config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout
            )

    resumed = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-hitl-1",
            goal="县域老年智慧助餐采纳机制与里程碑纠偏验证",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="milestone_gated",
            max_tool_calls=28,
            sandbox=sandbox2,
            dataset_title=title,
            provider=ResumeSpyProvider(),
            run_id="run-hitl-1",
            emit_event=lambda et, pl: resume_events.append((et, deepcopy(pl))),
            resume_state=paused["checkpoint"],
            steering_note="请优先核验城乡分层与补贴调节效应，并补充共同方法偏差检验",
        )
    )

    assert resumed["status"] == "completed"
    assert resumed["epistemicGraph"]["completeness"]["passed"] is True
    assert resumed["falsificationReport"]["decision"] == "approve"
    assert resumed["datasetSummary"]["cleanedRowCount"] == 226
    assert any(et == "steering" for et, _ in resume_events)
    assert any(et == "completed" for et, _ in resume_events)
    assert any(s.get("operator") == "pi_steering" and s.get("agentRole") == "user" for s in resumed["reasoningTrace"])
    # Check steering hint triggered check_common_method_bias cleanly
    assert any(s.get("operator") == "check_common_method_bias" for s in resumed["reasoningTrace"])
    # Prior 2 iterations were NOT re-run through LLM; only post-resume turns ran
    assert len(resumed["reasoningTrace"]) > len(paused["reasoningTrace"])
    assert "受访者保密建议" not in json.dumps(resumed, ensure_ascii=False)


def test_milestone_gated_pauses_after_iteration_2_when_no_diagnostic_fires_and_redacts_inline():
    questions = [
        {"id": "q_grp", "variable": "grp", "text": "组别", "type": "single", "choices": [{"code": "a", "label": "A"}, {"code": "b", "label": "B"}]},
        {"id": "q_x", "variable": "x_val", "text": "自变量", "type": "number", "min": 1, "max": 5},
        {"id": "q_y", "variable": "y_val", "text": "因变量", "type": "number", "min": 1, "max": 5},
        {"id": "q_open", "variable": "open_txt", "text": "开放题", "type": "text"},
    ]
    rows = [
        {
            "answers": {
                "q_grp": "a" if i % 2 == 0 else "b",
                "q_x": 1.0 + (i % 5),
                "q_y": 1.5 + 0.6 * (i % 5) + (0.1 if i % 3 == 0 else 0.0),
                "q_open": f"绝密个人文本-{i}",
            },
            "visibility": {"q_grp": True, "q_x": True, "q_y": True, "q_open": True},
        }
        for i in range(24)
    ]
    sandbox = build_inline_sandbox(title="无告警里程碑测试", questions=questions, rows=rows, classification="actual")

    class CleanScriptedProvider:
        def __init__(self):
            self.step = 0

        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            joined = "\n".join(str(m.get("content", "")) for m in messages if isinstance(m, dict))
            if "<reviewer-tools-ready/>" in joined:
                if not any(m.get("role") == "tool" for m in messages):
                    return AgentModelTurn(
                        text="",
                        reasoning="核验快照",
                        tool_calls=(ModelToolCall(id="r1", name="verify_evidence_hashes", arguments={}),),
                        usage=None,
                        stop_reason="tool_calls",
                    )
                return AgentModelTurn(
                    text=json.dumps({"summary": "通过", "deliverable": {"decision": "approve", "findings": [], "consistency_checks": [], "ethics_and_privacy": []}}),
                    reasoning="审阅通过",
                    tool_calls=(),
                    usage=None,
                    stop_reason="stop",
                )
            self.step += 1
            if self.step == 1:
                return AgentModelTurn(
                    text="",
                    reasoning="先审计分布",
                    tool_calls=(ModelToolCall(id="d1", name="inspect_distribution", arguments={}),),
                    usage=None,
                    stop_reason="tool_calls",
                )
            if self.step == 2:
                return AgentModelTurn(
                    text="",
                    reasoning="检验组间差异",
                    tool_calls=(ModelToolCall(id="d2", name="test_group_difference", arguments={"outcome": "y_val", "group_var": "grp", "method": "auto"}),),
                    usage=None,
                    stop_reason="tool_calls",
                )
            return AgentModelTurn(text='{"summary":"完成"}', reasoning="结束", tool_calls=(), usage=None, stop_reason="stop")

    paused = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-clean",
            goal="无告警时在第二轮后暂停",
            geography="县域",
            dataset_mode="inline_dataset",
            lease_mode="milestone_gated",
            max_tool_calls=24,
            sandbox=sandbox,
            dataset_title="无告警里程碑测试",
            provider=CleanScriptedProvider(),
        )
    )
    assert paused["status"] == "awaiting_milestone"
    assert paused["checkpoint"]["nextIteration"] == 3
    assert paused["pendingMilestone"]["detectedDiagnostics"] == []
    assert "绝密个人文本" not in json.dumps(paused["checkpoint"], ensure_ascii=False)

    # Resume with rebuilt inline sandbox from redacted checkpoint
    cp = paused["checkpoint"]
    sandbox_rebuilt = build_inline_sandbox(
        title=cp["datasetTitle"],
        questions=cp["inlineQuestions"],
        rows=cp["inlineRows"],
        classification=cp["datasetClassification"],
        ref=cp["datasetRef"],
    )
    assert sandbox_rebuilt.dataset_sha256 == sandbox.dataset_sha256
    completed = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-clean",
            goal="无告警时在第二轮后暂停",
            geography="县域",
            dataset_mode="inline_dataset",
            lease_mode="milestone_gated",
            max_tool_calls=24,
            sandbox=sandbox_rebuilt,
            dataset_title=cp["datasetTitle"],
            provider=CleanScriptedProvider(),
            resume_state=cp,
        )
    )
    assert completed["status"] == "completed"
    assert completed["epistemicGraph"]["completeness"]["passed"] is True


def test_reviewer_rework_loop_resolves_in_round_1_and_caps_at_max_2():
    title, questions, rows = build_planted_trap_benchmark()

    class ReworkProvider:
        def __init__(self, *, always_revise: bool):
            self.always_revise = always_revise
            self.data_turns = 0
            self.reviewer_rounds = 0

        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            joined = "\n".join(str(m.get("content", "")) for m in messages if isinstance(m, dict))
            if "<reviewer-tools-ready/>" in joined:
                has_tool = any(m.get("role") == "tool" for m in messages)
                if not has_tool and tool_choice != "none":
                    return AgentModelTurn(
                        text="",
                        reasoning="核验快照哈希",
                        tool_calls=(ModelToolCall(id=f"rv_{self.reviewer_rounds}", name="verify_evidence_hashes", arguments={}),),
                        usage=None,
                        stop_reason="tool_calls",
                    )
                self.reviewer_rounds += 1
                has_cmb = any(
                    m.get("role") == "tool" and m.get("name") == "verify_evidence_hashes"
                    and len(json.loads(m["content"]).get("verifiedSnapshots", [])) >= 3
                    for m in messages
                )
                if self.always_revise or (self.reviewer_rounds == 1 and not has_cmb):
                    return AgentModelTurn(
                        text=json.dumps(
                            {
                                "summary": "缺少 Harman 共同方法偏差检验，退回补充。",
                                "deliverable": {
                                    "decision": "revise",
                                    "findings": [{"severity": "major", "location": "质控", "issue": "未执行 check_common_method_bias", "evidence_ref": "", "required_change": "补充 CMB 检验"}],
                                    "evidence_gaps": ["缺失 check_common_method_bias 快照"],
                                    "revision_request": "请调用 check_common_method_bias 后重新提交审稿。",
                                },
                            },
                            ensure_ascii=False,
                        ),
                        reasoning="要求补充 CMB 检验",
                        tool_calls=(),
                        usage=None,
                        stop_reason="stop",
                    )
                return AgentModelTurn(
                    text=json.dumps(
                        {
                            "summary": "补充 CMB 后哈希全部核验通过。",
                            "deliverable": {
                                "decision": "approve",
                                "findings": [],
                                "consistency_checks": [{"check": "CMB 补充核验", "result": "pass", "details": "已补全"}],
                                "ethics_and_privacy": ["零原始行泄露"],
                            },
                        },
                        ensure_ascii=False,
                    ),
                    reasoning="批准闭环",
                    tool_calls=(),
                    usage=None,
                    stop_reason="stop",
                )

            # Data Explorer turns
            self.data_turns += 1
            if "独立对抗审稿 Agent 返回 revise" in joined:
                has_cmb_tool = any(m.get("role") == "tool" and m.get("name") == "check_common_method_bias" for m in messages)
                if not has_cmb_tool and tool_choice != "none":
                    return AgentModelTurn(
                        text="",
                        reasoning="按审稿意见补充 check_common_method_bias",
                        tool_calls=(
                            ModelToolCall(
                                id=f"rw_{self.data_turns}",
                                name="check_common_method_bias",
                                arguments={"variables": ["trust_1", "trust_2", "trust_3", "tech_ease"]},
                            ),
                        ),
                        usage=None,
                        stop_reason="tool_calls",
                    )
                return AgentModelTurn(text='{"summary":"已补充共同方法偏差检验。"}', reasoning="返工收束", tool_calls=(), usage=None, stop_reason="stop")

            if self.data_turns == 1:
                return AgentModelTurn(
                    text="",
                    reasoning="清洗并回归",
                    tool_calls=(
                        ModelToolCall(id="d1", name="apply_cleaning_pipeline", arguments={"min_valid_ratio": 0.7, "drop_straightliners": True}),
                        ModelToolCall(id="d2", name="fit_linear_regression", arguments={"outcome": "adopt_intention", "predictors": ["trust_1", "tech_ease"]}),
                    ),
                    usage=None,
                    stop_reason="tool_calls",
                )
            return AgentModelTurn(text='{"summary":"首轮探索完成"}', reasoning="收敛", tool_calls=(), usage=None, stop_reason="stop")

    # Case 1: revise round 0 -> Data executes check_common_method_bias -> approve round 1
    events_r1: list[tuple[str, dict]] = []
    sb1 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    res1 = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-rw-1",
            goal="测试审稿返工闭环",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=24,
            sandbox=sb1,
            dataset_title=title,
            provider=ReworkProvider(always_revise=False),
            emit_event=lambda et, pl: events_r1.append((et, pl)),
        )
    )
    assert res1["status"] == "completed"
    assert res1["reworkRounds"] == 1
    assert len(res1["reworkHistory"]) == 1
    assert res1["falsificationReport"]["decision"] == "approve"
    assert res1["epistemicGraph"]["completeness"]["passed"] is True
    assert any(s["operator"] == "check_common_method_bias" and s["phase"] == "reanalyze" for s in res1["reasoningTrace"])
    assert any(et == "reviewer_critique" for et, _ in events_r1)
    assert any(et == "reanalysis" for et, _ in events_r1)

    # Case 2: perpetually returning revise stops deterministically at max_rework_rounds == 2
    sb2 = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    prov2 = ReworkProvider(always_revise=True)
    res2 = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-rw-2",
            goal="测试最大返工轮次熔断",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=24,
            sandbox=sb2,
            dataset_title=title,
            provider=prov2,
            max_rework_rounds=2,
        )
    )
    assert res2["status"] == "completed"
    assert res2["reworkRounds"] == 2
    assert len(res2["reworkHistory"]) == 2
    assert prov2.reviewer_rounds == 3
    assert res2["falsificationReport"]["decision"] == "revise"
    assert res2["epistemicGraph"]["completeness"]["passed"] is False


def test_autonomous_cli_stream_and_resume(capsys, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    paused_view = asyncio.run(
        autonomous_cli._run({
            "stream": True,
            "datasetMode": "planted_trap_benchmark",
            "leaseMode": "milestone_gated",
            "maxToolCalls": 28,
            "goal": "CLI 流式里程碑测试",
            "geography": "县域",
            "projectId": "local-cli",
        })
    )
    out1 = [json.loads(line) for line in capsys.readouterr().out.strip().splitlines() if line.strip()]
    assert any(item["type"] == "event" and item["eventType"] == "milestone_pause" for item in out1)
    assert out1[-1]["type"] == "done" and out1[-1]["ok"] is True
    assert out1[-1]["run"]["status"] == "awaiting_milestone"
    assert paused_view["status"] == "awaiting_milestone"

    resumed_view = asyncio.run(
        autonomous_cli._run({
            "action": "resume",
            "stream": True,
            "decision": "steer",
            "steeringNote": "请优先核验城乡分层并补充共同方法偏差检验",
            "datasetMode": "planted_trap_benchmark",
            "leaseMode": "milestone_gated",
            "maxToolCalls": 28,
            "goal": "CLI 流式里程碑测试",
            "geography": "县域",
            "projectId": "local-cli",
            "checkpoint": paused_view["checkpoint"],
            "epistemicGraph": paused_view["epistemicGraph"],
            "usedToolCalls": paused_view["lease"]["usedToolCalls"],
        })
    )
    out2 = [json.loads(line) for line in capsys.readouterr().out.strip().splitlines() if line.strip()]
    assert any(item["type"] == "event" and item["eventType"] == "steering" for item in out2)
    assert any(item["type"] == "event" and item["eventType"] == "completed" for item in out2)
    assert out2[-1]["type"] == "done" and out2[-1]["ok"] is True
    assert resumed_view["status"] == "completed"
    assert resumed_view["epistemicGraph"]["completeness"]["passed"] is True

    aborted = asyncio.run(
        autonomous_cli._run({
            "action": "resume",
            "stream": True,
            "decision": "abort",
            "datasetMode": "planted_trap_benchmark",
            "leaseMode": "milestone_gated",
            "maxToolCalls": 28,
            "projectId": "local-cli",
            "checkpoint": paused_view["checkpoint"],
            "epistemicGraph": paused_view["epistemicGraph"],
        })
    )
    out3 = [json.loads(line) for line in capsys.readouterr().out.strip().splitlines() if line.strip()]
    assert any(item["type"] == "event" and item["eventType"] == "cancelled" for item in out3)
    assert aborted["status"] == "cancelled"


@pytest.mark.postgres
def test_phase2_pg_rls_sse_resume_cancel_and_epistemic_memory(settings, pg_engine, tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    deliveries = {}

    async def mail(cid, email, code):
        deliveries[cid] = code

    class PoolCheckedProvider(AuthoredProvider):
        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            assert pg_engine.pool.checkedout() == 0
            return await super().agent_step(
                config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout
            )

    app = create_app(settings, engine=pg_engine, provider=PoolCheckedProvider(tmp_path), mail=mail)

    def _login(email: str):
        client = TestClient(app)
        client.headers["origin"] = settings.allowed_origins[0]
        cid = client.post("/api/auth/code", json={"email": email}).json()["challengeId"]
        ident = client.post("/api/auth/verify", json={"challengeId": cid, "code": deliveries[cid]}).json()
        client.headers["x-csrf-token"] = ident["csrfToken"]
        return client, ident["user"]["id"]

    with _login("a@example.test")[0] as owner_client, _login("b@example.test")[0] as outsider_client, _login("c@example.test")[0] as viewer_client:
        # Resolve user IDs cleanly
        with pg_engine.connect() as conn:
            owner_id = conn.execute(text("SELECT id FROM users WHERE email='a@example.test'")).scalar_one()
            outsider_id = conn.execute(text("SELECT id FROM users WHERE email='b@example.test'")).scalar_one()

        proj, team_id = project(owner_client)
        assert owner_client.post(f"/api/teams/{team_id}/members", json={"email": "c@example.test", "role": "viewer"}).status_code == 201

        # 1. Create milestone_gated run -> pauses at awaiting_milestone
        create_resp = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs",
            json={
                "idempotencyKey": idem(),
                "goal": "Phase 2 PG 持久化与里程碑门禁测试",
                "geography": "县域",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "milestone_gated",
                "maxToolCalls": 28,
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        paused = create_resp.json()
        run_id = paused["runId"]
        assert paused["status"] == "awaiting_milestone"
        assert paused["revision"] == 1
        assert paused["eventCount"] >= 4
        assert paused["pendingMilestone"] is not None

        # 2. Strict cross-tenant RLS & RBAC isolation
        assert outsider_client.get(f"/api/projects/{proj['id']}/autonomous-runs/{run_id}").status_code == 404
        assert outsider_client.get(f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/stream").status_code == 404
        assert outsider_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/resume",
            json={"expectedRevision": paused["revision"], "decision": "approve"},
        ).status_code == 404
        assert outsider_client.get(f"/api/projects/{proj['id']}/epistemic-memory").status_code == 404

        assert viewer_client.get(f"/api/projects/{proj['id']}/autonomous-runs/{run_id}").status_code == 200
        assert viewer_client.get(f"/api/projects/{proj['id']}/epistemic-memory").status_code == 200
        assert viewer_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/resume",
            json={"expectedRevision": paused["revision"], "decision": "approve"},
        ).status_code == 403
        assert viewer_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/cancel",
            json={"expectedRevision": paused["revision"]},
        ).status_code == 403

        # Raw SQL verification under non-superuser evix_app role
        with pg_engine.begin() as conn:
            conn.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": outsider_id})
            for tbl in ("autonomous_runs", "autonomous_run_events", "project_epistemic_memory"):
                assert conn.execute(text(f"SELECT count(*) FROM {tbl}")).scalar_one() == 0
            assert conn.execute(text("UPDATE autonomous_runs SET status='failed' WHERE id=:rid"), {"rid": run_id}).rowcount == 0

        with pytest.raises(DBAPIError, match="row-level security"):
            with pg_engine.begin() as conn:
                conn.execute(text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": outsider_id})
                conn.execute(
                    text(
                        "INSERT INTO autonomous_runs (id,project_id,created_by,idempotency_key,status,lease_mode,dataset_mode,goal,budget_cap,checkpoint_json,epistemic_graph_json,created_at,updated_at) "
                        "VALUES (:id,:pid,:uid,:ik,'running','pi_autonomous','planted_trap_benchmark','hack',24,'{}'::jsonb,'{}'::jsonb,now(),now())"
                    ),
                    {"id": str(uuid4()), "pid": proj["id"], "uid": outsider_id, "ik": str(uuid4())},
                )

        # 3. Conflict on wrong expectedRevision + steeringNote length check
        conflict = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/resume",
            json={"expectedRevision": 99, "decision": "steer", "steeringNote": "修正"},
        )
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "revision_conflict"

        too_long = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/resume",
            json={"expectedRevision": paused["revision"], "decision": "steer", "steeringNote": "x" * 801},
        )
        assert too_long.status_code == 422

        # 4. Resume with decision="steer" -> completes & populates project_epistemic_memory
        resumed_resp = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/resume",
            json={
                "expectedRevision": paused["revision"],
                "decision": "steer",
                "steeringNote": "请优先核验城乡分层与补贴调节效应",
            },
        )
        assert resumed_resp.status_code == 200, resumed_resp.text
        resumed = resumed_resp.json()
        assert resumed["status"] == "completed"
        assert resumed["revision"] > paused["revision"]
        assert resumed["epistemicGraph"]["completeness"]["passed"] is True
        assert resumed["falsificationReport"]["decision"] == "approve"
        assert "受访者保密建议" not in json.dumps(resumed, ensure_ascii=False)

        mem_resp = owner_client.get(f"/api/projects/{proj['id']}/epistemic-memory")
        assert mem_resp.status_code == 200
        memories = mem_resp.json()["memories"]
        kinds = {m["kind"] for m in memories}
        assert {"mother_insight", "cleaning_rule", "preference", "evidence_gap"}.issubset(kinds)
        assert any(m["kind"] == "preference" and "城乡分层" in m["summary"] for m in memories)
        assert any(m["kind"] == "evidence_gap" and m["status"] == "resolved" for m in memories)

        # 5. SSE stream & Last-Event-ID / afterSeq partial replay
        stream_all = owner_client.get(f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/stream")
        assert stream_all.status_code == 200
        assert stream_all.headers["content-type"].startswith("text/event-stream")
        assert "no-transform" in stream_all.headers.get("cache-control", "")
        assert stream_all.headers.get("x-accel-buffering") == "no"
        parsed_all = _parse_sse_blocks(stream_all.text)
        seqs = [ev["id"] for ev in parsed_all]
        assert seqs == list(range(1, len(parsed_all) + 1))
        event_names = [ev["event"] for ev in parsed_all]
        assert event_names[0] == "run_started"
        assert "milestone_pause" in event_names
        assert "steering" in event_names
        assert event_names[-1] == "completed"

        cutoff = 3
        stream_tail = owner_client.get(
            f"/api/projects/{proj['id']}/autonomous-runs/{run_id}/stream",
            headers={"Last-Event-ID": str(cutoff)},
        )
        assert stream_tail.status_code == 200
        parsed_tail = _parse_sse_blocks(stream_tail.text)
        assert parsed_tail and all(ev["id"] > cutoff for ev in parsed_tail)
        assert [ev["id"] for ev in parsed_tail] == seqs[cutoff:]

        # 6. Cancel transition & double-cancel 409
        cancel_run = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs",
            json={
                "idempotencyKey": idem(),
                "goal": "测试人工取消与重复取消冲突",
                "geography": "县域",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "milestone_gated",
                "maxToolCalls": 28,
            },
        )
        assert cancel_run.status_code == 201
        c_paused = cancel_run.json()
        c_id = c_paused["runId"]

        bad_cancel = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{c_id}/cancel",
            json={"expectedRevision": c_paused["revision"] + 5},
        )
        assert bad_cancel.status_code == 409 and bad_cancel.json()["error"]["code"] == "revision_conflict"

        ok_cancel = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{c_id}/cancel",
            json={"expectedRevision": c_paused["revision"]},
        )
        assert ok_cancel.status_code == 200
        c_done = ok_cancel.json()
        assert c_done["status"] == "cancelled"
        assert c_done["revision"] == c_paused["revision"] + 1

        double_cancel_stale = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{c_id}/cancel",
            json={"expectedRevision": c_paused["revision"]},
        )
        assert double_cancel_stale.status_code == 409

        double_cancel_current = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs/{c_id}/cancel",
            json={"expectedRevision": c_done["revision"]},
        )
        assert double_cancel_current.status_code == 409
        assert double_cancel_current.json()["error"]["code"] == "invalid_transition"
        assert pg_engine.pool.checkedout() == 0
