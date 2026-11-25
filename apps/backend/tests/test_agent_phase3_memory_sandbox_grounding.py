"""Acceptance tests for Agent Upgrade Phase 3: working memory compaction, plot/stat sandboxes, grounding tools, and cross-run epistemic memory recall."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from application.providers import AuthoredProvider
from application.services.autonomous_research import build_planted_trap_benchmark, execute_autonomous_research_core
from application.workflow_data_tools import build_inline_sandbox
from evix_api.app import create_app
from infrastructure.llm import AgentModelTurn, ModelToolCall, _agent_messages
from multi_agent.agents.research_agent.services import agent_chat as chat
from multi_agent.context_memory import (
    WorkingMemoryBrief,
    compact_agent_messages,
    compact_chat_history,
    format_project_epistemic_memory,
)
from multi_agent.grounding_tools import (
    _OFFLINE_SCHOLARLY_FIXTURES,
    lookup_county_gazetteer,
    verify_scholarly_citation,
)
from multi_agent.plot_sandbox import (
    SandboxExecutionError,
    SandboxSecurityError,
    audit_svg_layout,
    build_snapshot_plot_script,
    execute_sandbox_plot,
    execute_sandbox_readonly_stat,
    validate_sandbox_ast,
)
from multi_agent.tool_registry import (
    all_tool_specs,
    grounding_tool_specs,
    public_tool_catalog,
    sandbox_tool_specs,
    to_agent_tools,
    to_anthropic_tools,
    to_gemini_function_declarations,
    to_openai_tools,
)
from tests.test_postgres import idem, project


def _make_long_agent_history(num_turns: int = 12) -> list[dict]:
    msgs: list[dict] = [
        {"role": "system", "content": "你是严谨的自主统计分析专家。"},
        {
            "role": "user",
            "content": '请开始分析。\n<sandbox-context>\n{"goal":"县域助餐调研"}\n</sandbox-context>',
        },
    ]
    for i in range(1, num_turns + 1):
        tc_id_a = f"call_{i}_a"
        tc_id_b = f"call_{i}_b"
        op_a = "inspect_distribution" if i == 1 else f"op_stage_{i}_a"
        op_b = "purify_scale_reliability" if i == 2 else f"op_stage_{i}_b"
        msgs.append({
            "role": "assistant",
            "tool_calls": [
                {"id": tc_id_a, "name": op_a, "arguments": {"step": i}},
                {"id": tc_id_b, "name": op_b, "arguments": {"step": i}},
            ],
        })
        msgs.append({
            "role": "tool",
            "tool_call_id": tc_id_a,
            "name": op_a,
            "content": json.dumps(
                {
                    "operator": op_a,
                    "snapshot_id": f"snap_{i:04d}a",
                    "n_effective": 220,
                    "diagnostics": [f"DIAG_{i}_A"] if i % 2 == 0 else [],
                    "pivotTaken": f"转向修正_{i}" if i == 3 else "",
                },
                ensure_ascii=False,
            ),
        })
        msgs.append({
            "role": "tool",
            "tool_call_id": tc_id_b,
            "name": op_b,
            "content": json.dumps(
                {
                    "operator": op_b,
                    "snapshot_id": f"snap_{i:04d}b",
                    "n_effective": 220,
                    "diagnostics": [f"HIGH_VIF_COLLINEARITY:x{i}"] if i == 4 else [],
                },
                ensure_ascii=False,
            ),
        })
        if i == 3:
            msgs.append({
                "role": "user",
                "content": "PI 人工审阅与纠偏指令（必须优先响应并在后续算子及总结中落实）：请优先核验城乡分层",
            })
    return msgs


# ---- Scenario 1: Working Memory Compaction & Epistemic Recall Formatting ----


def test_working_memory_compaction_chat_budget_and_epistemic_formatting():
    # Below threshold -> untouched
    short = _make_long_agent_history(4)
    out_short, brief_short = compact_agent_messages(short, max_messages=24)
    assert out_short == short and brief_short is None

    # Above threshold -> atomic assistant+tool boundary preserved & _agent_messages validates cleanly
    long_msgs = _make_long_agent_history(10)  # 2 + 30 + 1 = 33 messages
    compacted, brief = compact_agent_messages(long_msgs, max_messages=20, keep_recent_messages=8)
    assert isinstance(brief, WorkingMemoryBrief)
    assert len(compacted) <= 20
    assert compacted[0]["role"] == "system"
    assert compacted[1]["role"] == "user"
    assert "<sandbox-context>" in compacted[1]["content"]
    assert "<working-memory-brief>" in compacted[1]["content"]
    assert compacted[2]["role"] == "assistant"
    # No consecutive user/user turns and no orphaned tool messages
    for idx in range(1, len(compacted) - 1):
        assert not (compacted[idx]["role"] == "user" and compacted[idx + 1]["role"] == "user")
    validated = _agent_messages(compacted, "synthetic-secret-key")
    assert len(validated) == len(compacted)
    assert "inspect_distribution" in brief.completed_operators
    assert "snap_0001a" in brief.verified_snapshots
    assert "DIAG_2_A" in brief.active_diagnostics
    assert any("请优先核验城乡分层" in p for p in brief.pivots)

    # Re-compaction merges prior brief instead of losing earlier history
    extended = [*compacted, *long_msgs[-9:]]
    re_compacted, re_brief = compact_agent_messages(extended, max_messages=18, keep_recent_messages=6)
    assert re_brief is not None
    assert re_brief.dropped_count > brief.dropped_count
    assert "inspect_distribution" in re_brief.completed_operators
    assert re_compacted[1]["content"].count("<working-memory-brief>") == 1
    assert _agent_messages(re_compacted, "synthetic-secret-key")

    # Chat history compaction + agent_prompt integration (both normal fit & thin-budget fallback)
    dropped_chat = [{"role": "user", "text": "前文讨论\x00\x07社区养老"}, {"role": "agent", "text": "建议先看照度"}]
    wm = compact_chat_history(dropped_chat, max_chars=200)
    assert wm["droppedCount"] == 2
    assert all("\x00" not in h and "\x07" not in h for h in wm["highlights"])

    long_history = [{"role": "user" if i % 2 == 0 else "agent", "text": f"第{i}轮" + "详" * 1180} for i in range(12)]
    chat_req = {
        "schemaVersion": 1,
        "idempotencyKey": str(uuid4()),
        "message": "请总结下一步",
        "history": long_history,
        "context": {"notes": "摘" * 4500},
        "serviceId": str(uuid4()),
        "serviceRevision": 1,
        "consent": True,
    }
    prompt_fit = chat.agent_prompt(chat_req)
    assert chat.encoded_size(prompt_fit) <= chat.PROMPT_BYTES
    embedded = json.loads(prompt_fit.split("资料JSON：", 1)[1])
    assert "workingMemory" in embedded
    assert embedded["workingMemory"]["droppedCount"] > 0
    assert embedded["history"] == long_history[-len(embedded["history"]):]

    # When context nearly exhausts PROMPT_BYTES and remaining history is thin, workingMemory is omitted cleanly
    tight_history = [{"role": "user", "text": "第0条" + "长" * 1190}, {"role": "agent", "text": "最后一条短消息"}]
    tight_req = {
        **chat_req,
        "history": tight_history,
        "context": {"notes": "摘" * 11400},  # ~34200 bytes UTF-8
    }
    prompt_tight = chat.agent_prompt(tight_req)
    assert chat.encoded_size(prompt_tight) <= chat.PROMPT_BYTES
    embedded_tight = json.loads(prompt_tight.split("资料JSON：", 1)[1])
    assert embedded_tight["history"] == tight_history[-len(embedded_tight["history"]):]

    # Epistemic memory priority & deduplication
    mem_records = [
        {"memoryKey": "gap:1", "kind": "evidence_gap", "status": "active", "summary": "补充样本"},
        {"memoryKey": "hyp:1", "kind": "hypothesis", "status": "pivoted", "summary": "线性假设"},
        {"memoryKey": "clean:1", "kind": "cleaning_rule", "status": "active", "summary": "剔除14条直选"},
        {"memoryKey": "pref:1", "kind": "preference", "status": "active", "summary": "关注城乡差异"},
        {"memoryKey": "ref:1", "kind": "refuted_claim", "status": "refuted", "summary": "全样本正效应被推翻"},
        {"memoryKey": "mi:1", "kind": "mother_insight", "status": "active", "summary": "存在辛普森悖论反转", "snapshotRefs": ["snap_1"]},
        {"memoryKey": "mi:1", "kind": "mother_insight", "status": "active", "summary": "重复键应去重"},
    ]
    formatted = format_project_epistemic_memory(mem_records, max_items=12, max_chars=2400)
    assert formatted["recalledCount"] == 6
    assert formatted["items"][0]["kind"] == "mother_insight"
    assert formatted["items"][1]["kind"] == "preference"
    assert formatted["items"][2]["kind"] == "cleaning_rule"
    assert formatted["items"][3]["kind"] == "refuted_claim"
    assert formatted["motherInsights"] == ["存在辛普森悖论反转"]
    assert formatted["steeringNotes"] == ["关注城乡差异"]
    assert formatted["cleaningRules"] == ["剔除14条直选"]
    assert formatted["refutedClaims"] == ["全样本正效应被推翻"]
    assert len(formatted["briefText"]) <= 2400


# ---- Scenario 2: Plot Sandbox Security, Layout Audit & Auto-Repair ----


@pytest.mark.parametrize(
    "bad_code,mode",
    [
        ("import os\nprint(os.getcwd())", "plot"),
        ("import subprocess\n", "stat"),
        ("from pathlib import Path\n", "plot"),
        ("from matplotlib import os\n", "plot"),
        ("x = ().__class__.__bases__", "plot"),
        ("x = open('secret.txt', 'r')", "stat"),
        ("eval('1+1')", "stat"),
        ("getattr(DATA, '__dict__')", "plot"),
        ("global x\nx = 1", "stat"),
        ("async def f():\n    await g()", "plot"),
        ("x = 'bad\x00char'", "plot"),
        ("x = 1\n" * 4000, "stat"),
    ],
)
def test_sandbox_ast_blocks_dangerous_constructs(bad_code, mode):
    with pytest.raises(SandboxSecurityError):
        validate_sandbox_ast(bad_code, mode=mode)


def test_plot_sandbox_svg_security_layout_audit_and_auto_repair(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-must-never-leak-to-child")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ds-must-never-leak-to-child")

    # 1. Clean plot with Chinese labels + scrubbed env check
    clean_res = execute_sandbox_plot(
        """
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(7.2, 4.4))
ax.bar(["独居老年群体", "子女共居群体"], [2.35, 3.85], color=["#1f4e78", "#c55a11"])
ax.set_title("居住模式采纳意愿对比")
ax.set_ylabel("均分")
""",
        {},
    )
    assert clean_res["ok"] is True
    assert clean_res["svg"].lstrip().startswith("<?xml") or "<svg" in clean_res["svg"]
    assert clean_res["audit"]["passed"] is True
    assert clean_res["audit"]["vectorPure"] is True
    assert clean_res["repairRounds"] == 0
    assert len(clean_res["svgSha256"]) == 64

    # 2. Cannot write to disk via plt.savefig
    with pytest.raises(SandboxSecurityError, match="disk_write_forbidden"):
        execute_sandbox_plot(
            f"""
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.plot([1, 2], [3, 4])
plt.savefig({str(tmp_path / 'evil.svg')!r})
""",
            {},
        )
    assert not (tmp_path / "evil.svg").exists()

    # 3. Direct audit_svg_layout checks (XSS/unsafe tags, truncation, small font, OOB, overlap)
    assert audit_svg_layout('<svg viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><rect x="20" y="0" width="10" height="10"/><script>alert(1)</script></svg>')["vectorPure"] is False
    assert audit_svg_layout('<svg viewBox="0 0 100 100"><rect width="10" height="10"/><rect width="10" height="10"/><image href="x"/></svg>')["vectorPure"] is False
    assert audit_svg_layout('<svg viewBox="0 0 100 100"><rect width="10" height="10" onclick="alert(1)"/><rect width="10" height="10"/></svg>')["vectorPure"] is False
    trunc = audit_svg_layout('<svg viewBox="0 0 200 100"><rect width="10" height="10"/><rect width="10" height="10"/><text x="20" y="40" font-size="10">Truncated…</text></svg>')
    assert trunc["passed"] is False and trunc["truncationCount"] == 1
    small = audit_svg_layout('<svg viewBox="0 0 200 100"><rect width="10" height="10"/><rect width="10" height="10"/><text x="20" y="40" font-size="6">Tiny</text></svg>')
    assert small["passed"] is False and small["smallFontCount"] == 1
    oob = audit_svg_layout('<svg viewBox="0 0 100 100"><rect width="10" height="10"/><rect width="10" height="10"/><text x="95" y="50" font-size="10">OverflowLabel</text></svg>')
    assert oob["passed"] is False and oob["outOfBoundsCount"] == 1
    overlap = audit_svg_layout(
        '<svg viewBox="0 0 200 100"><rect width="10" height="10"/><rect width="10" height="10"/>'
        '<text x="20" y="40" font-size="10">AlphaLabel</text>'
        '<text x="22" y="40" font-size="10">AlphaLabel2</text></svg>'
    )
    assert overlap["passed"] is False and overlap["overlapCount"] >= 1

    # 4. Crowded overlapping plot triggers auto-repair round > 0 and succeeds cleanly
    crowded_res = execute_sandbox_plot(
        """
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(3.4, 2.8))
cats = [
    "县域智慧助餐维度甲一",
    "县域智慧助餐维度乙二",
    "县域智慧助餐维度丙三",
    "县域智慧助餐维度丁四",
    "县域智慧助餐维度戊五",
]
ax.bar(cats, [1.5, 2.4, 3.2, 2.9, 4.1])
ax.set_title("极窄画布重叠自修复测试")
""",
        {},
        auto_repair=True,
        max_repairs=2,
    )
    assert crowded_res["repairRounds"] >= 1
    assert crowded_res["audit"]["passed"] is True

    # 5. build_snapshot_plot_script from real StatisticalSandbox receipt
    t_title, t_qs, t_rows = build_planted_trap_benchmark()
    sb = build_inline_sandbox(title=t_title, questions=t_qs, rows=t_rows, classification="simulated")
    snap = sb.test_group_difference("adopt_intention", "living_mode").data
    sc, pl = build_snapshot_plot_script(snap, chart_kind="auto")
    snap_plot = execute_sandbox_plot(sc, pl)
    assert snap_plot["audit"]["passed"] is True


# ---- Scenario 3: Readonly Custom Stat Sandbox ----


def test_readonly_stat_sandbox_strips_open_text_and_blocks_exfiltration():
    questions = [
        {"id": "q1", "variable": "score", "type": "number"},
        {"id": "q_txt", "variable": "open_secret", "type": "text"},
    ]
    rows = [
        {
            "answers": {"q1": float(i + 1), "q_txt": f"PRIVATE_OPEN_TEXT_{i}"},
            "visibility": {"q1": True, "q_txt": True},
        }
        for i in range(20)
    ]

    # Valid aggregate stat script runs cleanly and produces signed snapshot
    res = execute_sandbox_readonly_stat(
        """
import numpy as np
vals = np.array([r["answers"]["q1"] for r in ROWS], dtype=float)
has_open = any("q_txt" in r["answers"] or "open_secret" in r["answers"] for r in ROWS)
RESULT = {
    "summary": f"自定义均值={float(np.mean(vals)):.2f}, open_stripped={not has_open}",
    "metrics": {"mean": float(np.mean(vals)), "std": float(np.std(vals, ddof=1)), "open_stripped": not has_open},
    "n_effective": int(len(vals)),
}
""",
        questions=questions,
        rows=rows,
        dataset_sha256="a" * 64,
        classification="actual",
    )
    assert res.classification == "actual"
    assert res.evidence_refs[0].startswith("snap_")
    assert res.data["metrics"]["open_stripped"] is True
    assert "PRIVATE_OPEN_TEXT" not in json.dumps(res.data, ensure_ascii=False)

    # Child script trying to read stripped open-text column finds nothing
    probe = execute_sandbox_readonly_stat(
        """
leaked = [r["answers"].get("q_txt") for r in ROWS if r["answers"].get("q_txt")]
q_types = [q["type"] for q in QUESTIONS]
RESULT = {
    "summary": "探测文本剥离",
    "metrics": {"leaked_count": len(leaked), "has_text_q": "text" in q_types},
    "n_effective": len(ROWS),
}
""",
        questions=questions,
        rows=rows,
    )
    assert probe.data["metrics"] == {"leaked_count": 0, "has_text_q": False}

    # Row exfiltration via large array/table is blocked
    with pytest.raises(SandboxSecurityError, match="raw_row_exfiltration_blocked"):
        execute_sandbox_readonly_stat(
            """
RESULT = {
    "summary": "尝试窃取逐行样本",
    "metrics": {"count": len(ROWS)},
    "n_effective": len(ROWS),
    "leaked": [r["answers"]["q1"] for r in ROWS],
}
""",
            questions=questions,
            rows=rows,
        )

    # Table > 40 rows blocked even on large dataset
    big_rows = [{"answers": {"q1": float(i)}, "visibility": {"q1": True}} for i in range(100)]
    with pytest.raises(SandboxSecurityError, match="stat_table_exceeds_40_rows"):
        execute_sandbox_readonly_stat(
            """
RESULT = {
    "summary": "超过40行表格",
    "metrics": {"count": len(ROWS)},
    "n_effective": len(ROWS),
    "table": {"headers": ["idx"], "rows": [[i] for i in range(41)]},
}
""",
            questions=questions,
            rows=big_rows,
        )

    # n_effective < 5 blocked
    with pytest.raises(SandboxSecurityError, match="min_cell_n"):
        execute_sandbox_readonly_stat(
            'RESULT = {"summary": "小样本", "metrics": {"m": 1}, "n_effective": 3}',
            questions=questions,
            rows=rows,
        )

    # Missing required fields rejected
    with pytest.raises(SandboxExecutionError):
        execute_sandbox_readonly_stat(
            'RESULT = {"metrics": {"m": 1}, "n_effective": 10}',
            questions=questions,
            rows=rows,
        )


# ---- Scenario 4: Grounding Tools (Gazetteer + Citation Verifier) ----


def test_county_gazetteer_and_scholarly_citation_verifier(monkeypatch):
    # 1. County lookup by adcode and Chinese geo name
    by_code = lookup_county_gazetteer(query="420106", limit=5).data
    assert by_code["matches"][0]["code"] == "420106"
    assert by_code["matches"][0]["name"] == "武昌区"
    assert by_code["matches"][0]["provinceName"] == "湖北省"
    assert by_code["matches"][0]["prefectureName"] == "武汉市"
    assert by_code["coverage"]["countyCount"] == 2845
    assert by_code["caveats"]
    assert by_code["matchedPatterns"]

    by_name = lookup_county_gazetteer(query="阳城县", limit=5).data
    assert any(m["name"] == "阳城县" and m["provinceName"] == "山西省" for m in by_name["matches"])

    # 2. Offline scholarly citation catalog (>=16 entries)
    assert len(_OFFLINE_SCHOLARLY_FIXTURES) >= 16
    cronbach = verify_scholarly_citation(doi="10.1007/BF02310555").data
    assert cronbach["verified"] is True
    assert cronbach["citation"]["year"] == 1951
    assert "Cronbach" in cronbach["citation"]["authors"][0]

    callaway = verify_scholarly_citation(query="Callaway Sant'Anna Difference-in-Differences").data
    assert callaway["verified"] is True
    assert callaway["doi"] == "10.1016/j.jeconom.2020.12.001"

    # Offline unknown DOI fails closed without making network calls
    called_urls: list[str] = []

    def _trap_get(*args, **kwargs):
        called_urls.append(str(args[0]))
        raise AssertionError("httpx.get must not be called offline")

    monkeypatch.delenv("EVIX_ENABLE_LIVE_SCHOLAR_API", raising=False)
    monkeypatch.setattr("multi_agent.grounding_tools.httpx.get", _trap_get)
    unknown_offline = verify_scholarly_citation(doi="10.9999/unknown.paper.2026").data
    assert unknown_offline["verified"] is False
    assert called_urls == []

    # Live lookup works via mocked httpx.get when enable_live=True
    def _mock_crossref_get(url, **kwargs):
        called_urls.append(url)
        assert kwargs.get("follow_redirects") is False
        assert kwargs.get("trust_env") is False
        return httpx.Response(
            200,
            json={
                "status": "ok",
                "message": {
                    "DOI": "10.1234/live.verified.2025",
                    "title": ["Live Verified Survey Methodology"],
                    "author": [{"family": "Zhang", "given": "Wei"}],
                    "issued": {"date-parts": [[2025]]},
                    "container-title": ["Journal of Survey Statistics"],
                },
            },
        )

    monkeypatch.setattr("multi_agent.grounding_tools.httpx.get", _mock_crossref_get)
    live_res = verify_scholarly_citation(doi="10.1234/live.verified.2025", enable_live=True).data
    assert live_res["verified"] is True
    assert live_res["source"] == "crossref_live"
    assert live_res["citation"]["year"] == 2025
    assert len(called_urls) == 1


# ---- Scenario 5: Unified 47-Tool Registry ----


def test_tool_registry_45_tools_and_serializers(settings, tmp_path):
    assert len(sandbox_tool_specs()) == 2
    assert len(grounding_tool_specs()) == 2
    specs = all_tool_specs()
    assert len(specs) == 47
    assert len({s.name for s in specs}) == 47
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


# ---- Scenario 6: End-to-End Integration & PostgreSQL Cross-Run Memory + HTTP Routes ----


def test_autonomous_core_recalls_memory_and_compacts_long_multiturn_loop(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    t_title, t_qs, t_rows = build_planted_trap_benchmark()
    sb = build_inline_sandbox(title=t_title, questions=t_qs, rows=t_rows, classification="simulated")
    base = AuthoredProvider(tmp_path)
    events: list[tuple[str, dict]] = []

    class CompactionSpyProvider:
        def __init__(self):
            self.step = 0
            self.saw_brief = False

        async def agent_step(self, config, key, messages, *, tools=None, tool_choice="auto", limit=196608, timeout=45):
            joined = "\n".join(str(m.get("content", "")) for m in messages if isinstance(m, dict))
            if "<reviewer-tools-ready/>" in joined:
                return await base.agent_step(config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout)
            self.step += 1
            if "<working-memory-brief>" in str(messages[1].get("content", "")):
                self.saw_brief = True
            # Pad 1 multi-tool turn (3 tools = +4 msgs, +4 budget) so total reaches 25 > 24 within 31 <= 32 budget
            if self.step == 1 and tool_choice != "none":
                return AgentModelTurn(
                    text="",
                    reasoning="多轮深度核查：文献、区划与自定义隔离统计",
                    tool_calls=(
                        ModelToolCall(id="pad_cite", name="verify_scholarly_citation", arguments={"doi": "10.1007/BF02310555"}),
                        ModelToolCall(id="pad_geo", name="lookup_county_gazetteer", arguments={"query": "420106"}),
                        ModelToolCall(
                            id="pad_stat",
                            name="run_custom_stat_script",
                            arguments={
                                "script": (
                                    "import numpy as np\n"
                                    "vals = [float(r['answers'].get('q_adopt', 0)) for r in ROWS if r['answers'].get('q_adopt') is not None]\n"
                                    "RESULT = {'summary': f'自定义采纳均值={np.mean(vals):.2f}', 'metrics': {'mean': float(np.mean(vals))}, 'n_effective': len(vals)}\n"
                                )
                            },
                        ),
                    ),
                    usage=None,
                    stop_reason="tool_calls",
                )
            return await base.agent_step(config, key, messages, tools=tools, tool_choice=tool_choice, limit=limit, timeout=timeout)

    spy = CompactionSpyProvider()
    prior_mem = [
        {"memoryKey": "mi:prev", "kind": "mother_insight", "status": "active", "summary": "历史母洞察：独居与共居斜率反转"},
        {"memoryKey": "pref:prev", "kind": "preference", "status": "active", "summary": "优先核验武昌区助餐补贴"},
    ]
    res = asyncio.run(
        execute_autonomous_research_core(
            project_id="proj-phase3",
            goal="跨轮记忆召回与长对话压缩验证",
            geography="武昌区",
            dataset_mode="planted_trap_benchmark",
            lease_mode="pi_autonomous",
            max_tool_calls=32,
            sandbox=sb,
            dataset_title=t_title,
            provider=spy,
            emit_event=lambda et, pl: events.append((et, deepcopy(pl))),
            prior_memory=prior_mem,
        )
    )
    assert res["status"] == "completed"
    assert res["recalledMemory"]["recalledCount"] == 2
    assert any(et == "memory_recalled" and pl["recalledCount"] == 2 for et, pl in events)
    assert spy.saw_brief is True
    assert any("工作记忆压缩" in pl.get("thought", "") for et, pl in events if et == "thought")


def test_phase3_http_routes_require_session_and_origin(settings, tmp_path):
    local = settings.model_copy(update={"sav_temp_dir": tmp_path / "sav", "preflight_temp_dir": tmp_path / "pre"})
    pid = str(uuid4())
    with TestClient(create_app(local)) as client:
        assert client.get(f"/api/projects/{pid}/grounding/counties", params={"q": "420106"}).status_code == 401
        assert client.post(f"/api/projects/{pid}/sandbox/plot", json={"script": "import matplotlib.pyplot as plt"}).status_code == 401
        assert client.post(f"/api/projects/{pid}/grounding/verify-citation", json={"doi": "10.1007/BF02310555"}).status_code == 401


@pytest.mark.postgres
def test_phase3_pg_cross_run_memory_recall_and_sandbox_grounding_routes(settings, pg_engine, tmp_path, monkeypatch):
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
        return client

    with _login("a@example.test") as owner_client, _login("b@example.test") as outsider_client:
        proj, _team = project(owner_client)

        # 1. Run 1 completes and populates project_epistemic_memory
        r1 = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs",
            json={
                "idempotencyKey": idem(),
                "goal": "首轮探索沉淀项目认知记忆",
                "geography": "县域",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "pi_autonomous",
                "maxToolCalls": 28,
            },
        )
        assert r1.status_code == 201, r1.text
        v1 = r1.json()
        assert v1["status"] == "completed"
        assert v1["recalledMemory"]["recalledCount"] == 0

        # 2. Run 2 on the same project recalls Run 1 memories & emits memory_recalled SSE event
        r2 = owner_client.post(
            f"/api/projects/{proj['id']}/autonomous-runs",
            json={
                "idempotencyKey": idem(),
                "goal": "第二轮探索验证跨轮记忆自动召回",
                "geography": "县域",
                "datasetMode": "planted_trap_benchmark",
                "leaseMode": "pi_autonomous",
                "maxToolCalls": 28,
            },
        )
        assert r2.status_code == 201, r2.text
        v2 = r2.json()
        assert v2["status"] == "completed"
        assert v2["recalledMemory"]["recalledCount"] >= 2
        assert v2["recalledMemory"]["motherInsights"]
        stream2 = owner_client.get(f"/api/projects/{proj['id']}/autonomous-runs/{v2['runId']}/stream")
        assert stream2.status_code == 200
        assert "event: memory_recalled" in stream2.text

        # 3. Phase 3 HTTP routes: plot sandbox (via snapshot + script), county gazetteer, citation verifier
        snap_id = v1["registeredResults"][0]["id"]
        plot_snap = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/plot",
            json={"runId": v1["runId"], "snapshotId": snap_id, "chartKind": "auto"},
        )
        assert plot_snap.status_code == 200, plot_snap.text
        p_body = plot_snap.json()
        assert p_body["ok"] is True and p_body["audit"]["passed"] is True and "<svg" in p_body["svg"]

        plot_bad = owner_client.post(
            f"/api/projects/{proj['id']}/sandbox/plot",
            json={"script": "import os\nos.listdir('.')"},
        )
        assert plot_bad.status_code == 422
        assert plot_bad.json()["error"]["code"] == "sandbox_security_error"

        counties = owner_client.get(f"/api/projects/{proj['id']}/grounding/counties", params={"q": "420106", "limit": 3})
        assert counties.status_code == 200, counties.text
        assert counties.json()["matches"][0]["name"] == "武昌区"

        cite_ok = owner_client.post(
            f"/api/projects/{proj['id']}/grounding/verify-citation",
            json={"doi": "10.1007/BF02310555"},
        )
        assert cite_ok.status_code == 200 and cite_ok.json()["verified"] is True

        cite_bad = owner_client.post(
            f"/api/projects/{proj['id']}/grounding/verify-citation",
            json={"doi": "10.9999/nonexistent.2026"},
        )
        assert cite_bad.status_code == 200 and cite_bad.json()["verified"] is False

        # 4. Cross-tenant isolation (404 for outsider)
        assert outsider_client.post(
            f"/api/projects/{proj['id']}/sandbox/plot",
            json={"runId": v1["runId"], "snapshotId": snap_id},
        ).status_code == 404
        assert outsider_client.get(
            f"/api/projects/{proj['id']}/grounding/counties",
            params={"q": "420106"},
        ).status_code == 404
        assert outsider_client.post(
            f"/api/projects/{proj['id']}/grounding/verify-citation",
            json={"doi": "10.1007/BF02310555"},
        ).status_code == 404
        assert pg_engine.pool.checkedout() == 0
