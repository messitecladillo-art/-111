"""Acceptance tests for Agent Upgrade Phase 1: native tool protocol, 41-tool registry, adaptive routing, and ISA WorkflowModels."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import inspect
import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from application.providers import AuthoredProvider, LiveProvider
from application.services.autonomous_research import build_planted_trap_benchmark, execute_autonomous_research_core
from application.workflow_data_tools import build_inline_sandbox
from evix_api.app import create_app
from infrastructure.llm import AgentModelTurn, ChatCompletionClient, ModelToolCall
from multi_agent.agents.research_agent.services import agent_chat as chat
from multi_agent.statistical_isa import StatisticalSandbox
from multi_agent.tool_registry import (
    all_tool_specs,
    chat_orchestrator_tool_specs,
    epistemic_tool_specs,
    grounding_tool_specs,
    isa_tool_specs,
    public_tool_catalog,
    reviewer_tool_specs,
    sandbox_tool_specs,
    to_agent_tools,
    to_anthropic_tools,
    to_gemini_function_declarations,
    to_openai_tools,
)
from shared.errors import ProviderFailure
from tests.test_postgres import idem, project, service_input
from tests.test_surveys_postgres import publish

KEY = "synthetic-phase1-protocol-key"
BASES = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "compatible": "https://approved-models.example.test/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
}
TOOLS = to_agent_tools(isa_tool_specs()[:2])


def _config(provider: str, **extra):
    return {
        "provider": provider,
        "baseUrl": BASES[provider],
        "model": "synthetic-agent-model",
        "maxOutputTokens": 512,
        **extra,
    }


def _transport(monkeypatch, handler):
    original, calls, options = httpx.AsyncClient, [], []

    def dispatch(request):
        calls.append(request)
        return handler(request)

    def client(**kwargs):
        options.append(kwargs)
        return original(transport=httpx.MockTransport(dispatch), **kwargs)

    monkeypatch.setattr("infrastructure.llm.httpx.AsyncClient", client)
    return calls, options


def _tool_call_response(provider: str):
    if provider == "anthropic":
        return {
            "type": "message",
            "role": "assistant",
            "stop_reason": "tool_use",
            "content": [
                {"type": "thinking", "thinking": "先审计分布并清洗样本。"},
                {"type": "tool_use", "id": "call_1", "name": "inspect_distribution", "input": {}},
                {"type": "tool_use", "id": "call_2", "name": "apply_cleaning_pipeline", "input": {"min_valid_ratio": 0.7}},
            ],
            "usage": {"input_tokens": 41, "output_tokens": 19},
        }
    if provider == "gemini":
        return {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {
                        "role": "model",
                        "parts": [
                            {"text": "先审计分布并清洗样本。", "thought": True},
                            {"functionCall": {"name": "inspect_distribution", "args": {}}},
                            {"functionCall": {"name": "apply_cleaning_pipeline", "args": {"min_valid_ratio": 0.7}}},
                        ],
                    },
                }
            ],
            "usageMetadata": {"promptTokenCount": 41, "candidatesTokenCount": 19},
        }
    return {
        "choices": [
            {
                "finish_reason": "tool_calls",
                "message": {
                    "role": "assistant",
                    "content": "",
                    "reasoning_content": "先审计分布并清洗样本。",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "inspect_distribution", "arguments": "{}"},
                        },
                        {
                            "id": "call_2",
                            "type": "function",
                            "function": {"name": "apply_cleaning_pipeline", "arguments": '{"min_valid_ratio":0.7}'},
                        },
                    ],
                },
            }
        ],
        "usage": {"prompt_tokens": 41, "completion_tokens": 19},
    }


def _final_response(provider: str, content: str = '{"summary":"已完成探索"}'):
    if provider == "anthropic":
        return {
            "type": "message",
            "role": "assistant",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": content}],
            "usage": {"input_tokens": 55, "output_tokens": 12},
        }
    if provider == "gemini":
        return {
            "candidates": [
                {"finishReason": "STOP", "content": {"role": "model", "parts": [{"text": content}]}}
            ],
            "usageMetadata": {"promptTokenCount": 55, "candidatesTokenCount": 12},
        }
    return {
        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
        "usage": {"prompt_tokens": 55, "completion_tokens": 12},
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
async def test_all_six_providers_native_multiturn_tool_calls_and_final(monkeypatch, provider):
    step_idx = 0

    def handle(_request):
        nonlocal step_idx
        step_idx += 1
        return httpx.Response(200, json=_tool_call_response(provider) if step_idx == 1 else _final_response(provider))

    calls, options = _transport(monkeypatch, handle)
    messages = [
        {"role": "system", "content": "你是严谨的统计算子分析专家。"},
        {"role": "user", "content": "请开始数据分析。"},
    ]

    turn1 = await LiveProvider().agent_step(_config(provider), KEY, messages, tools=TOOLS, tool_choice="auto")
    assert isinstance(turn1, AgentModelTurn)
    assert turn1.stop_reason == "tool_calls"
    assert turn1.reasoning == "先审计分布并清洗样本。"
    assert len(turn1.tool_calls) == 2
    assert turn1.tool_calls[0].name == "inspect_distribution"
    assert turn1.tool_calls[1].name == "apply_cleaning_pipeline"
    assert turn1.tool_calls[1].arguments == {"min_valid_ratio": 0.7}
    assert turn1.usage == {"inputTokens": 41, "outputTokens": 19}

    # Append assistant tool_calls + 2 consecutive tool results
    messages.append({
        "role": "assistant",
        "tool_calls": [{"id": tc.id, "name": tc.name, "arguments": tc.arguments} for tc in turn1.tool_calls],
    })
    messages.append({
        "role": "tool",
        "tool_call_id": turn1.tool_calls[0].id,
        "name": turn1.tool_calls[0].name,
        "content": '{"snapshot_id":"snap_111","n_effective":100}',
    })
    messages.append({
        "role": "tool",
        "tool_call_id": turn1.tool_calls[1].id,
        "name": turn1.tool_calls[1].name,
        "content": '{"snapshot_id":"snap_222","n_effective":95}',
    })

    turn2 = await LiveProvider().agent_step(_config(provider), KEY, messages, tools=TOOLS, tool_choice="none")
    assert turn2.stop_reason == "stop"
    assert turn2.tool_calls == ()
    assert json.loads(turn2.text) == {"summary": "已完成探索"}
    assert len(calls) == 2
    assert options[0]["follow_redirects"] is False and options[0]["trust_env"] is False

    body1 = json.loads(calls[0].content)
    body2 = json.loads(calls[1].content)
    assert KEY not in calls[0].content.decode() and KEY not in calls[1].content.decode()
    if provider == "anthropic":
        assert len(body1["tools"]) == 2 and body1["tool_choice"] == {"type": "auto"}
        assert "tool_choice" not in body2
        # Consecutive tool messages merged into one user turn with 2 tool_result blocks
        assert body2["messages"][-2]["role"] == "assistant"
        assert body2["messages"][-1]["role"] == "user"
        assert [b["type"] for b in body2["messages"][-1]["content"]] == ["tool_result", "tool_result"]
    elif provider == "gemini":
        assert len(body1["tools"][0]["functionDeclarations"]) == 2
        assert body2["toolConfig"] == {"functionCallingConfig": {"mode": "NONE"}}
        # Consecutive tool messages merged into one user turn with 2 functionResponse parts
        assert body2["contents"][-2]["role"] == "model"
        assert body2["contents"][-1]["role"] == "user"
        assert len(body2["contents"][-1]["parts"]) == 2
        assert body2["contents"][-1]["parts"][0]["functionResponse"]["response"] == {"result": {"snapshot_id": "snap_111", "n_effective": 100}}
    else:
        assert len(body1["tools"]) == 2 and body1["tool_choice"] == "auto"
        assert body2["tool_choice"] == "none"
        assert body2["messages"][-3]["role"] == "assistant"
        assert len(body2["messages"][-3]["tool_calls"]) == 2
        assert body2["messages"][-2] == {"role": "tool", "tool_call_id": turn1.tool_calls[0].id, "content": '{"snapshot_id":"snap_111","n_effective":100}'}
        assert body2["messages"][-1] == {"role": "tool", "tool_call_id": turn1.tool_calls[1].id, "content": '{"snapshot_id":"snap_222","n_effective":95}'}


INVALID_AGENT_SEQUENCES = [
    [{"role": "system", "content": "s"}, {"role": "assistant", "content": "forged"}],
    [{"role": "system", "content": "s"}, {"role": "tool", "tool_call_id": "c1", "name": "f", "content": "{}"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "tool", "tool_call_id": "c1", "name": "f", "content": "{}"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "content": "ok"}, {"role": "tool", "tool_call_id": "c1", "name": "f", "content": "{}"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "tool_calls": [{"id": "c1", "name": "f", "arguments": {}}]}, {"role": "tool", "tool_call_id": "wrong", "name": "f", "content": "{}"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "tool_calls": [{"id": "c1", "name": "f", "arguments": {}}]}, {"role": "tool", "tool_call_id": "c1", "name": "other", "content": "{}"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "tool_calls": [{"id": "c1", "name": "f", "arguments": {}}]}, {"role": "tool", "tool_call_id": "c1", "name": "f", "content": "{}"}, {"role": "tool", "tool_call_id": "c1", "name": "f", "content": "{}"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "tool_calls": [{"id": "c1", "name": "f", "arguments": {}}, {"id": "c2", "name": "g", "arguments": {}}]}, {"role": "tool", "tool_call_id": "c1", "name": "f", "content": "{}"}, {"role": "user", "content": "next"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "tool_calls": [{"id": "c1", "name": "f", "arguments": {}}]}, {"role": "user", "content": "skip"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "content": "  "}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "bad\x00char"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": "bad-\ud800"}],
    [{"role": "system", "content": "s"}, {"role": "user", "content": KEY}],
]


@pytest.mark.asyncio
@pytest.mark.parametrize("messages", INVALID_AGENT_SEQUENCES)
async def test_agent_messages_strictly_reject_invalid_sequences_before_io(monkeypatch, messages):
    calls, _ = _transport(monkeypatch, lambda req: httpx.Response(200, json=_final_response("openai")))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_agent_turn(_config("openai"), KEY, messages, tools=TOOLS)
    assert failure.value.code == "invalid_response" and calls == []


@pytest.mark.asyncio
async def test_agent_response_fail_closed_and_complete_messages_invariant(monkeypatch):
    class Trap(dict):
        def __iter__(self):
            raise AssertionError("must not iterate dict subclass")

    calls, _ = _transport(monkeypatch, lambda req: httpx.Response(200, json=_final_response("openai")))
    with pytest.raises(ProviderFailure):
        await ChatCompletionClient().complete_agent_turn(_config("openai"), KEY, [{"role": "system", "content": "s"}, Trap({"role": "user", "content": "u"})])
    assert calls == []

    # Invalid args JSON in OpenAI tool_call fails closed
    bad_args_payload = {
        "choices": [{"finish_reason": "tool_calls", "message": {"role": "assistant", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "inspect_distribution", "arguments": "{bad"}}]}}]
    }
    _transport(monkeypatch, lambda req: httpx.Response(200, json=bad_args_payload))
    with pytest.raises(ProviderFailure) as err_args:
        await ChatCompletionClient().complete_agent_turn(_config("openai"), KEY, [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}], tools=TOOLS)
    assert err_args.value.code == "invalid_response"

    # Empty turn fails closed
    empty_payload = {"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "  "}}]}
    _transport(monkeypatch, lambda req: httpx.Response(200, json=empty_payload))
    with pytest.raises(ProviderFailure) as err_empty:
        await ChatCompletionClient().complete_agent_turn(_config("openai"), KEY, [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}])
    assert err_empty.value.code == "invalid_response"

    # complete_messages invariant still rejects assistant/tool roles
    with pytest.raises(ProviderFailure):
        await ChatCompletionClient().complete_messages(_config("openai"), KEY, [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}, {"role": "assistant", "content": "no"}], 65536)


def test_tool_registry_41_tools_and_agent_tools_http_200(settings, tmp_path):
    isa = isa_tool_specs()
    epi = epistemic_tool_specs()
    rev = reviewer_tool_specs()
    orch = chat_orchestrator_tool_specs()
    sbx = sandbox_tool_specs()
    gnd = grounding_tool_specs()
    all_specs = all_tool_specs()

    assert len(isa) == 21
    assert len(epi) == 1
    assert len(rev) == 2
    assert len(orch) == 19
    assert len(sbx) == 2
    assert len(gnd) == 2
    assert len(all_specs) == 47
    assert len({s.name for s in all_specs}) == 47

    sb = StatisticalSandbox(questions=[], raw_responses=[], dataset_ref="ref", dataset_sha256="0" * 64)
    assert {s.name for s in isa} == set(sb.tool_registry().keys())
    for spec in isa:
        fn = sb.tool_registry()[spec.name]
        sig = inspect.signature(fn)
        props = spec.parameters["properties"]
        assert set(props.keys()) == set(sig.parameters.keys()), spec.name
        expected_req = {p.name for p in sig.parameters.values() if p.default is inspect.Parameter.empty}
        assert expected_req <= set(spec.parameters["required"]), spec.name

    assert {s.name for s in orch} == set(chat.TOOLS.keys())
    assert {"run_autonomous_research", "recommend_resource", "lookup_county", "verify_citation", "render_sandbox_plot"} <= set(chat.TOOLS.keys())
    assert "lookup_county" in chat.REQUIRED and chat.REQUIRED["lookup_county"] == ("query",)
    assert "recommend_resource" in chat.RESULT_TOOLS and "lookup_county" in chat.RESULT_TOOLS
    assert "verify_citation" in chat.RESULT_TOOLS and "render_sandbox_plot" in chat.RESULT_TOOLS
    parsed_chat = chat.parse_reply(
        json.dumps(
            {
                "reply": "已检索县域资料并推荐模板，准备启动自主探索。",
                "actions": [
                    {"tool": "lookup_county", "args": {"query": "县域养老"}},
                    {"tool": "recommend_resource", "args": {"query": "Kano"}},
                    {"tool": "run_autonomous_research", "args": {"goal": "采纳机制探索"}},
                ],
            },
            ensure_ascii=False,
        )
    )
    assert parsed_chat["droppedActions"] == 0 and len(parsed_chat["actions"]) == 3

    assert len(to_agent_tools()) == 47
    assert len(to_openai_tools()) == 47
    assert len(to_gemini_function_declarations()) == 47
    assert len(to_anthropic_tools()) == 47

    local = settings.model_copy(update={"sav_temp_dir": tmp_path / "sav", "preflight_temp_dir": tmp_path / "pre"})
    with TestClient(create_app(local)) as client:
        res = client.get("/api/agent/tools")
        assert res.status_code == 200
        body = res.json()
        assert body == public_tool_catalog()
        assert body["totalCount"] == 47
        assert body["groups"] == {
            "isa": 21,
            "epistemic": 1,
            "reviewer": 2,
            "orchestrator": 19,
            "sandbox": 2,
            "grounding": 2,
        }


def _run_authored_autonomous(tmp_path, *, title, goal, questions, rows, max_tool_calls=28):
    sb = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    provider = AuthoredProvider(tmp_path)
    return asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-phase1",
            goal=goal,
            geography="县域",
            dataset_mode="inline_dataset",
            lease_mode="pi_autonomous",
            max_tool_calls=max_tool_calls,
            sandbox=sb,
            dataset_title=title,
            provider=provider,
        )
    )


def test_authored_agent_step_adaptive_routing_across_5_designs_and_dynamic_epistemic(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")

    # 1. 4-Trap benchmark (exercises cleaning, scale purification, KMO, group_diff, OLS->Ridge, Logit->L2, mediation, subgroup reversal + mutate_epistemic_graph)
    t_title, t_qs, t_rows = build_planted_trap_benchmark()
    r_trap = _run_authored_autonomous(
        tmp_path,
        title=t_title,
        goal="县域老年智慧助餐与守护服务采纳机制调研",
        questions=t_qs,
        rows=t_rows,
        max_tool_calls=28,
    )
    trap_ops = [s["operator"] for s in r_trap["reasoningTrace"]]
    assert "mutate_epistemic_graph" in trap_ops
    assert r_trap["epistemicGraph"]["completeness"]["passed"] is True
    assert r_trap["epistemicGraph"]["completeness"]["pivotCount"] == 4
    pivot_snaps = [entry["snapshotId"] for entry in r_trap["epistemicGraph"]["pivot_log"]]
    assert len(pivot_snaps) == len(set(pivot_snaps)) == 4

    # 2. Kano (*_func / *_dysfunc)
    kano_qs = [
        {"id": "k1p", "variable": "voice_guide_func", "text": "语音导览正向", "type": "number"},
        {"id": "k1n", "variable": "voice_guide_dysfunc", "text": "语音导览反向", "type": "number"},
        {"id": "k2p", "variable": "popup_ads_func", "text": "高频弹窗正向", "type": "number"},
        {"id": "k2n", "variable": "popup_ads_dysfunc", "text": "高频弹窗反向", "type": "number"},
    ]
    kano_rows = [
        {
            "answers": {
                "k1p": 5,
                "k1n": 1 if i < 6 else 3,
                "k2p": 1 if i < 6 else 3,
                "k2n": 4 if i < 6 else 3,
            },
            "visibility": {q["id"]: True for q in kano_qs},
        }
        for i in range(24)
    ]
    r_kano = _run_authored_autonomous(tmp_path, title="Kano适配", goal="产品需求 Kano 属性优先级分类", questions=kano_qs, rows=kano_rows, max_tool_calls=16)
    assert "run_kano_better_worse" in [s["operator"] for s in r_kano["reasoningTrace"]]
    assert "mutate_epistemic_graph" in [s["operator"] for s in r_kano["reasoningTrace"]]

    # 3. Sharp RDD (running + cutoff)
    rdd_qs = [
        {"id": "r_x", "variable": "running_score", "text": "准入分", "type": "number"},
        {"id": "r_y", "variable": "outcome", "text": "产出", "type": "number"},
    ]
    rdd_rows = [
        {"answers": {"r_x": 50.0 + i * 0.6, "r_y": 8.0 + 0.1 * i}, "visibility": {"r_x": True, "r_y": True}}
        for i in range(12)
    ] + [
        {"answers": {"r_x": 60.05 + (i % 10) * 0.45, "r_y": 12.0 + 0.08 * (i % 5)}, "visibility": {"r_x": True, "r_y": True}}
        for i in range(44)
    ]
    r_rdd = _run_authored_autonomous(tmp_path, title="RDD断点", goal="政策准入断点评估 cutoff=60", questions=rdd_qs, rows=rdd_rows, max_tool_calls=16)
    assert "estimate_rdd_sharp_local" in [s["operator"] for s in r_rdd["reasoningTrace"]]
    assert "mutate_epistemic_graph" in [s["operator"] for s in r_rdd["reasoningTrace"]]

    # 4. Survival / Kaplan-Meier (duration + event + arm)
    surv_qs = [
        {"id": "s_t", "variable": "duration", "text": "留存月数", "type": "number"},
        {"id": "s_e", "variable": "event", "text": "流失事件", "type": "number"},
        {"id": "s_g", "variable": "arm", "text": "干预队列", "type": "single"},
    ]
    surv_rows = [
        {"answers": {"s_t": 2.0 + (i % 6), "s_e": 1.0 if i < 12 else 0.0, "s_g": "控制"}, "visibility": {q["id"]: True for q in surv_qs}}
        for i in range(15)
    ] + [
        {"answers": {"s_t": 11.0 + (i % 6), "s_e": 1.0 if i < 2 else 0.0, "s_g": "干预"}, "visibility": {q["id"]: True for q in surv_qs}}
        for i in range(15)
    ]
    r_surv = _run_authored_autonomous(tmp_path, title="KM生存", goal="服务留存与删失 Kaplan-Meier 分析", questions=surv_qs, rows=surv_rows, max_tool_calls=16)
    assert "estimate_kaplan_meier_logrank" in [s["operator"] for s in r_surv["reasoningTrace"]]

    # 5. Meta-analysis (study + effect + se)
    meta_qs = [
        {"id": "m_s", "variable": "study", "text": "研究", "type": "single"},
        {"id": "m_y", "variable": "effect", "text": "效应量", "type": "number"},
        {"id": "m_se", "variable": "se", "text": "标准误", "type": "number"},
    ]
    meta_rows = [
        {"answers": {"m_s": f"Study_{i}", "m_y": 0.25 + 0.3 * i, "m_se": 0.05 + 0.06 * i}, "visibility": {q["id"]: True for q in meta_qs}}
        for i in range(5)
    ]
    r_meta = _run_authored_autonomous(tmp_path, title="Meta合成", goal="跨研究效应量随机效应 Meta 合成", questions=meta_qs, rows=meta_rows, max_tool_calls=16)
    assert "run_meta_random_effects" in [s["operator"] for s in r_meta["reasoningTrace"]]
    assert "mutate_epistemic_graph" in [s["operator"] for s in r_meta["reasoningTrace"]]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "goal,variables,expected_op",
    [
        ("交错试点DID", [{"variable": "outcome", "type": "number"}, {"variable": "period", "type": "number"}, {"variable": "cohort", "type": "number"}], "estimate_staggered_did_att"),
        ("PSM倾向得分", [{"variable": "outcome", "type": "number"}, {"variable": "treated", "type": "number"}, {"variable": "income", "type": "number"}], "run_psm_balance_att"),
        ("IV工具变量", [{"variable": "outcome", "type": "number"}, {"variable": "treatment", "type": "number"}, {"variable": "iv_subsidy", "type": "number"}], "estimate_iv_2sls"),
        ("序贯AB实验", [{"variable": "variant", "type": "number"}, {"variable": "conv", "type": "number"}, {"variable": "latency", "type": "number"}], "run_ab_sequential_test"),
        ("熵权TOPSIS评价", [{"variable": "entity", "type": "single"}, {"variable": "coverage", "type": "number"}, {"variable": "wait_cost", "type": "number"}], "compute_entropy_topsis_rank"),
        ("Conformal预测区间", [{"variable": "y", "type": "number"}, {"variable": "x1", "type": "number"}, {"variable": "x2", "type": "number"}], "compute_conformal_prediction_band"),
        ("共同方法偏差CMB与相关矩阵", [{"variable": "v1", "type": "number"}, {"variable": "v2", "type": "number"}, {"variable": "v3", "type": "number"}], "check_common_method_bias"),
    ],
)
async def test_authored_agent_step_covers_remaining_specialized_isa_branches(tmp_path, monkeypatch, goal, variables, expected_op):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    provider = AuthoredProvider(tmp_path)
    tools_decl = to_agent_tools([*isa_tool_specs(), *epistemic_tool_specs()])
    ctx = {"goal": goal, "variables": variables}
    msgs = [
        {"role": "system", "content": "explorer"},
        {"role": "user", "content": "<sandbox-context>\n" + json.dumps(ctx, ensure_ascii=False) + "\n</sandbox-context>"},
    ]
    t1 = await provider.agent_step({"provider": "openai", "model": "authored"}, KEY, msgs, tools=tools_decl)
    assert t1.tool_calls
    msgs.append({"role": "assistant", "tool_calls": [{"id": tc.id, "name": tc.name, "arguments": tc.arguments} for tc in t1.tool_calls]})
    for tc in t1.tool_calls:
        msgs.append({"role": "tool", "tool_call_id": tc.id, "name": tc.name, "content": json.dumps({"operator": tc.name, "snapshot_id": "snap_1", "n_effective": 30, "diagnostics": []})})
    t2 = await provider.agent_step({"provider": "openai", "model": "authored"}, KEY, msgs, tools=tools_decl)
    assert any(tc.name == expected_op for tc in t2.tool_calls)
    if expected_op == "check_common_method_bias":
        assert any(tc.name == "compute_correlation_matrix" for tc in t2.tool_calls)


def test_autonomous_rejects_forged_epistemic_snapshot_and_supports_legacy_workflow_step(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    t_title, t_qs, t_rows = build_planted_trap_benchmark()
    sb = build_inline_sandbox(title=t_title, questions=t_qs, rows=t_rows, classification="simulated")

    class ForgedSnapProvider:
        def __init__(self):
            self.step = 0

        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            self.step += 1
            if self.step == 1:
                return AgentModelTurn(
                    text="",
                    reasoning="先尝试引用伪造快照 ID。",
                    tool_calls=(
                        ModelToolCall(
                            id="tc_bad",
                            name="mutate_epistemic_graph",
                            arguments={
                                "action": "record_pivot",
                                "node_id": "forged-claim",
                                "old_node_id": "hyp-h1",
                                "evidence_snapshot_id": "snap_nonexistent",
                            },
                        ),
                    ),
                    usage=None,
                    stop_reason="tool_calls",
                )
            return AgentModelTurn(text='{"summary":"结束"}', reasoning="结束", tool_calls=(), usage=None, stop_reason="stop")

    res_forged = asyncio.run(
        execute_autonomous_research_core(
            project_id="p",
            goal="测试伪造快照拒止",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=12,
            sandbox=sb,
            dataset_title=t_title,
            provider=ForgedSnapProvider(),
        )
    )
    assert any("unknown_evidence_snapshot:snap_nonexistent" in d for s in res_forged["reasoningTrace"] for d in s["diagnostics"])
    assert "forged-claim" not in res_forged["epistemicGraph"]["nodes"]

    # Legacy custom mock provider implementing ONLY workflow_step (no agent_step) continues to work
    class LegacyOnlyProvider:
        def __init__(self):
            self.delegate = AuthoredProvider(tmp_path)

        async def workflow_step(self, config, key, messages, limit=196608):
            return await self.delegate.workflow_step(config, key, messages, limit)

    res_legacy = asyncio.run(
        execute_autonomous_research_core(
            project_id="p",
            goal="测试向后兼容",
            geography="县域",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=28,
            sandbox=build_inline_sandbox(title=t_title, questions=t_qs, rows=t_rows, classification="simulated"),
            dataset_title=t_title,
            provider=LegacyOnlyProvider(),
        )
    )
    assert res_legacy["status"] == "completed" and res_legacy["epistemicGraph"]["completeness"]["passed"] is True


@pytest.mark.postgres
def test_workflow_models_isa_sandbox_multiturn_react_postgres(settings, pg_engine, tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    deliveries = {}

    async def mail(cid, email, code):
        deliveries[cid] = code

    class PoolCheckedAuthored(AuthoredProvider):
        async def workflow_step(self, config, key, messages, limit=196608):
            assert pg_engine.pool.checkedout() == 0
            return await super().workflow_step(config, key, messages, limit)

        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            assert pg_engine.pool.checkedout() == 0
            return await super().agent_step(config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout)

    app = create_app(settings, engine=pg_engine, provider=PoolCheckedAuthored(tmp_path), mail=mail)

    def _q(qid, var, kind, **extra):
        return {
            "id": qid,
            "variable": var,
            "text": f"题目 {var}",
            "type": kind,
            "required": True,
            "purpose": "research",
            "researchQuestion": "研究问题",
            "construct": "感知质量",
            "analysis": "measurement" if kind == "likert" else "association",
            "decisionUse": "决策依据",
            "source": "调研量表",
            "choices": [{"code": "a", "label": "城区"}, {"code": "b", "label": "乡镇"}],
            "min": 1,
            "max": 5,
            "minLabel": "极低",
            "maxLabel": "极高",
            "reverse": False,
            "condition": None,
            **extra,
        }

    design = {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": "ISA 沙盒工作流集成问卷",
        "objective": "验证多轮工具调用",
        "population": "成年受访者",
        "geography": "县域",
        "period": "2026",
        "recruitment": "分层抽样",
        "introduction": "自愿参与测试问卷。",
        "pilotNotes": "预试",
        "questions": [
            _q("q_grp", "living_mode", "single", choices=[{"code": "solo", "label": "独居"}, {"code": "cohabit", "label": "共居"}]),
            _q("q_t1", "trust_1", "likert"),
            _q("q_t2", "trust_2", "likert"),
            _q("q_t3", "trust_3", "likert"),
            _q("q_trap", "Q_trap", "likert", reverse=True),
            _q("q_ease", "tech_ease", "likert"),
            _q("q_flu", "ui_fluency", "number", min=1, max=5),
            _q("q_adopt", "adopt_intention", "number", min=1, max=5),
            _q("q_open", "open_note", "text", required=False),
        ],
    }

    with TestClient(app) as client:
        client.headers["origin"] = settings.allowed_origins[0]
        cid = client.post("/api/auth/code", json={"email": "a@example.test"}).json()["challengeId"]
        ident = client.post("/api/auth/verify", json={"challengeId": cid, "code": deliveries[cid]}).json()
        client.headers["x-csrf-token"] = ident["csrfToken"]

        model = client.post("/api/services", json=service_input(capabilities=["research", "questionnaire", "report"])).json()
        proj, _ = project(client)
        release, _ = publish(client, proj, value=design)

        with TestClient(app, headers={"origin": settings.allowed_origins[0]}) as public:
            for i in range(30):
                if i < 4:
                    ans = {
                        "q_grp": "solo" if i % 2 == 0 else "cohabit",
                        "q_t1": 3, "q_t2": 3, "q_t3": 3, "q_trap": 3, "q_ease": 3,
                        "q_flu": 3.0, "q_adopt": 3.0, "q_open": "private-open-text-secret",
                    }
                else:
                    grp = "solo" if i % 2 == 0 else "cohabit"
                    base = 1 + (i % 5)
                    t1 = max(1, min(5, base))
                    t2 = max(1, min(5, base + (1 if i % 3 == 0 and base < 5 else 0)))
                    t3 = max(1, min(5, base - (1 if i % 4 == 0 and base > 1 else 0)))
                    q_trap = 6 - base
                    ease = max(1, min(5, 1 + (i % 4)))
                    if len({t1, t2, t3, q_trap, ease}) <= 1:
                        ease = 4 if ease == 3 else 3
                    flu = round(float(ease) * 0.99 + 0.02 * (i % 2), 2)
                    adopt = round(1.5 + 0.65 * base if grp == "cohabit" else 4.8 - 0.65 * base, 2)
                    ans = {
                        "q_grp": grp,
                        "q_t1": t1, "q_t2": t2, "q_t3": t3, "q_trap": q_trap,
                        "q_ease": ease, "q_flu": max(1.0, min(5.0, flu)), "q_adopt": max(1.0, min(5.0, adopt)),
                        "q_open": f"private-open-text-{i}",
                    }
                resp = public.post(f"/api/surveys/{release['token']}/responses", json={"idempotencyKey": idem(), "answers": ans})
                assert resp.status_code == 201, resp.text

        task = client.post(
            f"/api/projects/{proj['id']}/agent-tasks",
            json={
                "taskType": "data_analysis",
                "requirements": {"goal": "县域养老采纳机制 ISA 沙盒多轮探索"},
                "inputArtifactRefs": [f"survey-release:{release['id']}"],
                "constraints": {"enableIsaSandbox": True},
                "modelPlan": {"schemaVersion": 1, "default": {"serviceId": model["id"], "revision": model["revision"]}},
            },
        ).json()
        path = f"/api/projects/{proj['id']}/agent-tasks/{task['id']}"

        data_preview = client.get(path + "/model-preview").json()
        assert data_preview["available"] is True
        assert data_preview["dataTool"] == "survey-release-isa-sandbox/v1"
        assert data_preview["isaEnabled"] is True
        assert data_preview["isaToolCount"] == 21
        assert data_preview["maxCalls"] == 9

        data_res = client.post(
            path + "/advance",
            json={
                "expectedRevision": 0,
                "modelConsent": {
                    "accepted": True,
                    "previewHash": data_preview["previewHash"],
                    "maxCalls": data_preview["maxCalls"],
                },
            },
        )
        assert data_res.status_code == 200, data_res.text
        data_state = data_res.json()
        assert data_state["status"] == "ready", (data_state["status"], data_state["state"]["errors"])
        deliverable = data_state["state"]["agent_outputs"]["data"]["deliverable"]
        assert deliverable["data_status"] == "analyzed"
        assert len(deliverable["tests"]) >= 4
        assert any(c["affected_rows"] == 4 for c in deliverable["cleaning_log"])
        assert "private-open-text" not in json.dumps(data_state, ensure_ascii=False)

        data_calls = client.get(path + "/model-calls").json()["calls"]
        assert len(data_calls) > 3 and len(data_calls) <= 9
        assert any(".iter" in c["step"] for c in data_calls)

        rev_preview = client.get(path + "/model-preview").json()
        assert rev_preview["role"] == "reviewer"
        assert rev_preview["falsificationToolsEnabled"] is True
        assert rev_preview["maxCalls"] == 5

        rev_res = client.post(
            path + "/advance",
            json={
                "expectedRevision": data_state["revision"],
                "modelConsent": {
                    "accepted": True,
                    "previewHash": rev_preview["previewHash"],
                    "maxCalls": rev_preview["maxCalls"],
                },
            },
        )
        assert rev_res.status_code == 200, rev_res.text
        rev_state = rev_res.json()
        assert rev_state["status"] == "completed", (rev_state["status"], rev_state["state"]["errors"])
        rev_deliv = rev_state["state"]["agent_outputs"]["reviewer"]["deliverable"]
        assert rev_deliv["decision"] == "approve"
        assert rev_deliv["competition_readiness"]["status"] == "ready"
        all_calls = client.get(path + "/model-calls").json()["calls"]
        assert any(c["step"].startswith("reviewer.review_deliverable.iter") for c in all_calls)
        assert "synthetic-private-model-key" not in json.dumps(all_calls)
