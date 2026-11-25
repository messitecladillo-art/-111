"""Deterministic CI regression guard for backend outbound de-technicalization, bracket hygiene, and p-value formatting."""
from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient

from application.providers import AuthoredProvider
from application.services.autonomous_research import (
    build_planted_trap_benchmark,
    execute_autonomous_research_core,
)
from application.workflow_data_tools import build_inline_sandbox
from evix_api import errors as api_errors
from evix_api.routes.autonomous_agent import _sanitize_outbound_payload
from multi_agent import grounding_tools, plot_sandbox
from multi_agent.agents.research_agent.services import topic_agent
from multi_agent.agents.survey_agent.services import interview_pretest, proposals
from multi_agent.agents.writing_agent.services import (
    cover_assembly,
    full_report_section,
    page_art,
    pre_submission_gate,
    section_draft,
    word_cloud_render,
)
from multi_agent.agents.writing_agent.tools import latex
from multi_agent.statistical_isa import _fmt_p
from multi_agent.tool_registry import (
    all_tool_specs,
    public_tool_catalog,
    to_agent_tools,
    to_anthropic_tools,
    to_gemini_function_declarations,
    to_openai_tools,
)
import pytest
from shared.errors import ApiError

_FORBIDDEN_BRACKETS_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_FORBIDDEN_CATALOG_JARGON_RE = re.compile(
    r"ReAct|EpistemicGraph|RunLease|算子|沙盒|大模型|大语言模型",
    re.IGNORECASE,
)
_PRIVATE_PATH_RE = re.compile(r"(?:[A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/[a-z0-9_-]+\/)", re.IGNORECASE)
_ZERO_P_RE = re.compile(r"(?<![A-Za-z])[pP]\s*=\s*0\.0+(?![0-9])")


def _iter_schema_descriptions(schema: object):
    if isinstance(schema, dict):
        desc = schema.get("description")
        if isinstance(desc, str):
            yield desc
        for key in ("properties", "items", "additionalProperties", "anyOf", "oneOf", "allOf"):
            child = schema.get(key)
            if isinstance(child, dict):
                for val in (child.values() if key == "properties" else [child]):
                    yield from _iter_schema_descriptions(val)
            elif isinstance(child, list):
                for item in child:
                    yield from _iter_schema_descriptions(item)


def test_public_tool_catalog_all_47_descriptions_free_of_internal_jargon_and_brackets():
    catalog = public_tool_catalog()
    assert catalog["schemaVersion"] == 1
    assert catalog["totalCount"] == 47
    tools = catalog["tools"]
    assert len(tools) == 47
    assert sum(catalog["groups"].values()) == 47

    specs = all_tool_specs()
    assert len(specs) == 47
    assert len(to_agent_tools(specs)) == 47
    assert len(to_openai_tools(specs)) == 47
    assert len(to_gemini_function_declarations(specs)) == 47
    assert len(to_anthropic_tools(specs)) == 47

    for entry in tools:
        texts = [entry["zhLabel"], entry["description"], *_iter_schema_descriptions(entry["parameters"])]
        for txt in texts:
            assert not _FORBIDDEN_BRACKETS_RE.search(txt), f"{entry['name']} leaked bracket punctuation: {txt!r}"
            assert not _FORBIDDEN_CATALOG_JARGON_RE.search(txt), f"{entry['name']} leaked internal jargon: {txt!r}"
            assert not _PRIVATE_PATH_RE.search(txt), f"{entry['name']} leaked host path: {txt!r}"


@pytest.mark.asyncio
async def test_autonomous_research_outbound_events_and_dynamic_p_value_hygiene(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    assert _fmt_p(0.0) == "p < 0.0001"
    assert _fmt_p(1e-9) == "p < 0.0001"
    assert _fmt_p(0.00004) == "p < 0.0001"
    assert _fmt_p(0.01234) == "p=0.0123"

    title, questions, rows = build_planted_trap_benchmark()
    sb = build_inline_sandbox(title=title, questions=questions, rows=rows, classification="simulated")
    emitted: list[tuple[str, dict]] = []
    out = await execute_autonomous_research_core(
        project_id="w14-prose-guard-test",
        goal="系统核查量表信度、共线性、完全分离与分层异质性",
        geography="县域",
        dataset_mode="inline_dataset",
        lease_mode="pi_autonomous",
        max_tool_calls=28,
        sandbox=sb,
        dataset_title=title,
        provider=AuthoredProvider(tmp_path),
        emit_event=lambda kind, payload: emitted.append((kind, _sanitize_outbound_payload(payload))),
    )
    sanitized = _sanitize_outbound_payload(out)
    prose_blobs: list[str] = []
    for _, payload in emitted:
        for key in ("thought", "summary", "pivot_note", "proposedAction", "message", "warning"):
            val = payload.get(key)
            if isinstance(val, str) and val:
                prose_blobs.append(val)
    for list_key in ("motherInsights", "cleaningRules", "refutedClaims"):
        for item in sanitized.get(list_key, []):
            if isinstance(item, str):
                prose_blobs.append(item)

    assert prose_blobs, "expected non-empty autonomous research prose traces"
    for text_item in prose_blobs:
        assert not _FORBIDDEN_BRACKETS_RE.search(text_item), f"bracket residue in autonomous trace: {text_item!r}"
        assert not _FORBIDDEN_CATALOG_JARGON_RE.search(text_item), f"jargon residue in autonomous trace: {text_item!r}"
        assert not _ZERO_P_RE.search(text_item), f"unmerged zero p-value in autonomous trace: {text_item!r}"

    # Structural fields (SVG, diagnostics, epistemicGraph) must remain intact while prose keys are scrubbed
    dirty_payload = {
        "thought": "工作记忆压缩：算子执行失败：「测试」【沙盒】观察",
        "svg": "<svg><text>「保留原始SVG节点供绘图层自管」</text></svg>",
        "diagnostics": ["HIGH_VIF_COLLINEARITY:x1"],
    }
    cleaned_payload = _sanitize_outbound_payload(dirty_payload)
    assert not _FORBIDDEN_BRACKETS_RE.search(cleaned_payload["thought"])
    assert "算子" not in cleaned_payload["thought"] and "沙盒" not in cleaned_payload["thought"]
    assert cleaned_payload["svg"] == dirty_payload["svg"]
    assert cleaned_payload["diagnostics"] == ["HIGH_VIF_COLLINEARITY:x1"]


def test_full_report_section_preserves_anchors_sentinel_math_and_merges_zero_p():
    raw_paragraph = (
        "【教学模拟数据：本轮仅作课堂演练，不代表真实调查结论】"
        "在「银发智守」【核心样本】中，回归显著（t = 6.42, p = 0.000；稳健复核 P=0.0000，对照组 p = 0.032），"
        "详见[[表:3-1]]、占位符{G1}与{T2}，非公式{冗余花括号}及[受访者补充说明]已净化，"
        "且行内公式 $\\hat{\\beta}_{1} = \\frac{1}{n}\\sum_{i=1}^{n} x_{i}$（其中 $p_{0} = 0.05$）完整保留。"
    )
    raw_json = "```json\n" + json.dumps({"paragraphs": [{"text": raw_paragraph}]}, ensure_ascii=False) + "\n```"
    cleaned_raw = full_report_section.safe_content(raw_json, secret="top-secret-token")
    assert cleaned_raw.startswith("```json\n") and cleaned_raw.endswith("\n```")
    inner = json.loads(cleaned_raw.strip().removeprefix("```json").removesuffix("```").strip())
    result_text = inner["paragraphs"][0]["text"]

    # Preserved sentinel, placeholders, cross-references, and LaTeX math braces
    assert "【教学模拟数据：本轮仅作课堂演练，不代表真实调查结论】" in result_text
    assert "[[表:3-1]]" in result_text
    assert "{G1}" in result_text and "{T2}" in result_text
    assert "$\\hat{\\beta}_{1} = \\frac{1}{n}\\sum_{i=1}^{n} x_{i}$" in result_text
    assert "$p_{0} = 0.05$" in result_text

    # Purged forbidden brackets/braces outside protected spans and merged dynamic zero p-values
    without_sentinel = result_text.replace("【教学模拟数据：本轮仅作课堂演练，不代表真实调查结论】", "")
    assert not _FORBIDDEN_BRACKETS_RE.search(without_sentinel)
    assert "“银发智守”" in without_sentinel
    assert "冗余花括号" in without_sentinel and "{冗余花括号}" not in without_sentinel
    assert "（受访者补充说明）" in without_sentinel
    assert "p < 0.0001" in without_sentinel and "P < 0.0001" in without_sentinel
    assert "p = 0.032" in without_sentinel
    assert not _ZERO_P_RE.search(without_sentinel)

    # Prompt anchor contract: negative rules after "【规则三" must NOT pollute exhibit hints,
    # whereas registered tables after "【本节完整登记证据三线表" MUST trigger exhibit method hints.
    negative_only_prompt = (
        "章节要求摘要\n"
        "【规则三：严禁捏造未登记的 PPS 抽样、游程检验（Runs Test）、CFA/SEM、雷达图或帕累托图】\n"
        "【本节完整登记证据三线表】\n"
        "表 4-1 多元线性回归结果（OLS）\n"
        "资料 JSON：not-valid-json-head-split-mode"
    )
    topic_neg, probe_neg = full_report_section._extract_topic_and_exhibits(negative_only_prompt)
    assert topic_neg == "当前研究课题"
    assert full_report_section._exhibit_method_hints("data.testing", probe_neg) == ""
    assert full_report_section._exhibit_method_hints("sample.descriptive", probe_neg) == ""

    positive_exhibit_prompt = (
        "章节要求摘要\n"
        "【规则三：严禁捏造未登记的帕累托图】\n"
        "【本节完整登记证据三线表】\n"
        "表 3-2 PPS 抽样设计与游程检验（Runs Test）及 CFA/SEM 验证结果\n"
        "资料 JSON：not-valid-json-head-split-mode"
    )
    _, probe_pos = full_report_section._extract_topic_and_exhibits(positive_exhibit_prompt)
    hints_pos = full_report_section._exhibit_method_hints("data.testing", probe_pos)
    assert "PPS" in hints_pos and "游程检验" in hints_pos and "CFA/SEM" in hints_pos
    assert "帕累托" not in hints_pos


def test_section_draft_preserves_fact_placeholders_sentinel_and_math_while_purging_brackets():
    raw_draft = json.dumps(
        {
            "paragraphs": [
                {
                    "text": (
                        "【教学模拟数据：演练提示】调查发现「社区助餐」满意度如{F1}所示，『复购意愿』见[[图:G_overview]]与[样本附注]，"
                        "非占位{多余括号}已剥离，模型 $\\alpha_{k} = \\sqrt{x}$ 保持不变。"
                    )
                }
            ]
        },
        ensure_ascii=False,
    )
    parsed = section_draft.parse_draft(raw_draft, {"F1"})
    assert parsed["droppedParagraphs"] == 0
    text_out = parsed["paragraphs"][0]["text"]
    assert "【教学模拟数据：演练提示】" in text_out
    assert "{F1}" in text_out
    assert "[[图:G_overview]]" in text_out
    assert "$\\alpha_{k} = \\sqrt{x}$" in text_out
    assert "“社区助餐”" in text_out and "‘复购意愿’" in text_out
    assert "（样本附注）" in text_out
    assert "{多余括号}" not in text_out and "多余括号" in text_out
    rest = text_out.replace("【教学模拟数据：演练提示】", "")
    assert not _FORBIDDEN_BRACKETS_RE.search(rest)


def test_cover_assembly_and_page_art_sanitizers_enforce_blind_and_bracket_hygiene():
    spec = page_art.normalize_cover_text_spec(
        {
            "competitionName": "「正大杯」第十七届全国大学生市场调查与分析大赛 AI生成",
            "title": '"银发智守"：智能健康监测模拟数据市场调查与统计分析报告',
            "subtitle": '大语言模型辅助下的"代际数字反哺"研究',
            "teamName": "参赛团队：浙江工商大学【银发】「智守」[测试]队",
            "titleLayout": "horizontal",
        }
    )
    assert spec["competitionName"].startswith("“益普索杯”第十七届")
    assert "AI" not in spec["competitionName"]
    assert "模拟数据" not in spec["mainTitle"]
    assert "市场调查与统计分析报告" not in spec["mainTitle"]
    assert "“银发智守”" in spec["mainTitle"]
    assert "大语言模型" not in spec["subtitle"]
    assert "“代际数字反哺”" in spec["subtitle"]
    assert "浙江工商大学" not in spec["teamName"]
    assert not _FORBIDDEN_BRACKETS_RE.search(spec["teamName"])
    assert "清华大学" not in page_art.derive_blind_safe_team_name("清华大学社区助餐满意度调查")

    typo_prompt = page_art.build_cover_typography_prompt(
        {
            "title": "「银发」【智守】{专题}调研",
            "subtitle": "[城市社区]老年人健康服务体验",
            "teamName": "北京大学调研队",
        }
    )
    assert not _FORBIDDEN_BRACKETS_RE.search(typo_prompt)
    assert "北京大学" not in typo_prompt

    backdrop_prompt = cover_assembly.build_clean_backdrop_prompt(
        topic="复旦大学「青年消费」【县域茶饮】{测试}市场调查与统计分析报告",
        typography_style="sculpted_orbit",
        art_direction="「柔和晨光」【纸雕景深】{细节}",
    )
    assert not _FORBIDDEN_BRACKETS_RE.search(backdrop_prompt)
    assert "复旦大学" not in backdrop_prompt
    assert "市场调查与统计分析报告" not in backdrop_prompt

    svg = cover_assembly.generate_vector_art_typography_svg(
        title="银发“智”守：城市老年人智能健康监测调查",
        subtitle="家庭代际支持与持续使用意愿实证分析",
        team_name="复旦大学【数智民声】调研队",
        typography_style="sculpted_orbit",
        force_text_fallback=True,
    )
    assert svg.startswith("<svg") and "复旦大学" not in svg
    assert not _FORBIDDEN_BRACKETS_RE.search(svg)


def test_pre_submission_gate_ui_sanitizer_and_sentinel_bracket_zero_p_audits():
    assert pre_submission_gate._sanitize_gate_ui_text("【第三章】「抽样设计」[初稿]{修订}") == "第三章抽样设计初稿修订"

    audit = pre_submission_gate.run_preflight_audit(
        {
            "title": "社区助餐服务满意度与持续意愿实证调查",
            "subtitle": "基于多阶段分层抽样的实证分析",
            "sections": [
                {
                    "id": "s1",
                    "title": "【第四章】「实证分析」",
                    "body": (
                        "【教学模拟数据：内部演练哨兵】"
                        "回归结果显示显著正相关（t = 5.18, p = 0.000），详见表 4-1 与 [[表:4-1]]，"
                        "公式 $\\beta_{1} = \\frac{y_{i}}{x_{i}}$ 成立，但残留「直角引号」待清理。"
                    ),
                }
            ],
        }
    )
    check_ids = {c["id"] for c in audit["checks"]}
    assert "simulation_or_ai_leak" in check_ids
    assert "zero_p_value_notation" in check_ids
    assert "bracket_punctuation_residue" in check_ids
    for check in audit["checks"]:
        for field in ("title", "message", "sectionTitle", "excerpt"):
            if field in check and isinstance(check[field], str):
                assert not _FORBIDDEN_BRACKETS_RE.search(check[field]), f"gate check leaked bracket in {field}: {check[field]!r}"
                assert "[" not in check[field] and "{" not in check[field]


def test_interview_pretest_topic_agent_proposals_and_latex_outbound_sanitizers():
    # interview_pretest
    cleaned_pretest = interview_pretest._sanitize_pretest_text("「受访者」【原话】：对[夜间助餐]{配送费}规则不太清楚")
    assert cleaned_pretest == "“受访者”原话：对（夜间助餐）配送费规则不太清楚"
    assert not _FORBIDDEN_BRACKETS_RE.search(cleaned_pretest)
    design = {
        "questions": [
            {"id": "q1", "text": "您是否使用过「社区食堂」？", "choices": [{"code": "1", "label": "【经常使用】"}]},
            {"id": "q2", "text": "满意度评价", "condition": {"questionId": "q1", "codes": ["1"]}},
        ]
    }
    cond_text = interview_pretest._route_condition_text(design, design["questions"][1])
    assert cond_text == "仅在前置题“您是否使用过“社区食堂”？”选择“经常使用”时向受访者展示"
    assert not _FORBIDDEN_BRACKETS_RE.search(cond_text)

    # topic_agent
    assert topic_agent._sanitize_topic_text("「县域电商」【冷链物流】{调研}方向") == "“县域电商”冷链物流调研方向"
    raw_assistant = json.dumps(
        {
            "text": "建议聚焦「县域农特微短剧电商」的【复购转化】与{售后信任}机制。",
            "questions": ["「合作社」是否具备【抽样框】访问条件？"],
            "items": [
                {
                    "patternId": "p1",
                    "title": "「乡味入云」【实证】调查",
                    "researchQuestion": "研究「主播专业度」对{复购意愿}的影响",
                    "decisionOwner": "「县域电商园区」【运营办】",
                    "whyHere": "具备【县域产业园】合作基础",
                    "decision": "优化「选品品控」与售后响应流程",
                    "firstWeekPlan": ["第1天：核实「园区商户」【名录】"],
                    "unknowns": ["尚待确认「退货率」{历史台账}"],
                    "sourceIds": ["src-1"],
                }
            ],
        },
        ensure_ascii=False,
    )
    parsed_turn = topic_agent.parse_assistant(raw_assistant, {"p1"}, {"src-1"})
    dumped_turn = json.dumps(parsed_turn, ensure_ascii=False)
    assert not _FORBIDDEN_BRACKETS_RE.search(dumped_turn)
    assert "{售后信任}" not in dumped_turn and "{复购意愿}" not in dumped_turn

    # proposals & latex diagnostics
    raw_prop = json.dumps(
        {
            "title": "「青年消费」【茶饮】{试拟}问卷",
            "objective": "研究目的：评估[低糖茶饮]复购\\{驱动\\}因素",
            "population": "调查对象：18至35岁城市青年群体",
            "items": [
                {
                    "text": "题项 1：您购买「现制低糖茶饮」的频率如何？",
                    "type": "single",
                    "choices": ["[每周多次]", "【偶尔购买】"],
                    "researchQuestion": "研究问题：消费频次基线",
                    "decisionUse": "拟支持决策：门店备料排期",
                },
                {"text": "Q2：您对配料透明度的重视程度如何？", "type": "likert", "choices": [], "researchQuestion": "配料感知", "decisionUse": "菜单标识改进"},
                {"text": "问题三：您对门店服务还有哪些{具体}建议？", "type": "text", "choices": [], "researchQuestion": "开放痛点", "decisionUse": "服务优化"},
            ],
        },
        ensure_ascii=False,
    )
    parsed_prop = proposals.parse_proposal(raw_prop)
    dumped_prop = json.dumps(parsed_prop, ensure_ascii=False)
    assert not _FORBIDDEN_BRACKETS_RE.search(dumped_prop)
    assert "AI生成" not in dumped_prop and "AI拟议" not in dumped_prop
    assert parsed_prop["objective"] == "评估（低糖茶饮）复购驱动因素"

    with pytest.raises(latex.UnsafeBody) as bad_tabular:
        latex.validate_body(r"\begin{tabular}{lc}\toprule a & b \\ \midrule 1 & 2 \\ \bottomrule\end{tabular}")
    assert "{" not in bad_tabular.value.message and "}" not in bad_tabular.value.message
    source = latex.build_source(
        "合成",
        "",
        "x\ny",
        {"part": "main", "includeCover": False, "includeToc": False, "firstLineChars": 2, "numberPages": True},
    )
    diag = latex.compiler_diagnostic("document.tex:25: Missing $ inserted", source)
    assert "[" not in diag["message"] and "]" not in diag["message"]


def test_plot_sandbox_humanize_and_title_formatter_strip_jargon_brackets_zero_p_and_rho():
    raw_label = (
        "「construct:service_perception」与【tech_ease】对 construct:brand_trust 的影响："
        "ReAct 算子在科研绘图沙盒与 EpistemicGraph / RunLease / 认知图谱 / DAG 下测得 p = 0.000, rho = 0.68"
    )
    humanized = plot_sandbox._humanize_plot_text(raw_label)
    assert "服务感知综合分" in humanized
    assert "适老易用度" in humanized
    assert "brand_trust综合分" in humanized
    assert "多步实证" in humanized and "统计分析" in humanized and "证据链" in humanized
    assert "p < 0.0001" in humanized and "ρ= 0.68" in humanized
    assert plot_sandbox._humanize_plot_text("rho=0.68") == "ρ=0.68"
    assert not _FORBIDDEN_BRACKETS_RE.search(humanized)
    assert not _FORBIDDEN_CATALOG_JARGON_RE.search(humanized)
    assert not _ZERO_P_RE.search(humanized)
    assert "rho" not in humanized.lower()

    formatted_title = plot_sandbox._format_plot_title(
        "[12] 核心母洞察：「living_mode」与【adopt_intention】分层效应对比（ReAct 沙盒算子 p=0.0000）…"
    )
    assert not formatted_title.startswith("[12]")
    assert "核心母洞察" not in formatted_title
    assert "居住方式" in formatted_title and "采纳意愿" in formatted_title
    assert "…" not in formatted_title and "..." not in formatted_title
    assert not _FORBIDDEN_BRACKETS_RE.search(formatted_title)
    assert not _FORBIDDEN_CATALOG_JARGON_RE.search(formatted_title)

    _, payload = plot_sandbox.build_snapshot_plot_script(
        {
            "id": "snap-1",
            "title": "[3] 关键结论更新：「Q_trap」与【ui_fluency】得分差异…",
            "chart": {
                "categories": ["「Q_trap」", "【ui_fluency】", "『subsidy_support』"],
                "values": [2.15, 4.08, 3.62],
            },
        }
    )
    assert payload["categories"] == ["“反向异常题项”", "界面流畅度", "“补贴覆盖感”"]
    assert not _FORBIDDEN_BRACKETS_RE.search(payload["title"])
    assert "关键结论更新" not in payload["title"] and "…" not in payload["title"]


def test_grounding_tools_verify_method_or_concept_and_regional_context_hygiene():
    sampling_res = grounding_tools.verify_method_or_concept(query="「样本量」【Deff】多阶段抽样设计")
    assert sampling_res.classification == "actual"
    assert sampling_res.data["query"] == "“样本量”Deff多阶段抽样设计"
    assert "Deff" in sampling_res.data["groundedFormulaHint"]
    assert not _FORBIDDEN_BRACKETS_RE.search(json.dumps(sampling_res.data, ensure_ascii=False))

    model_res = grounding_tools.verify_method_or_concept(query="「OLS回归」【多重共线性】与『Logistic完全分离』核验")
    assert model_res.data["query"] == "“OLS回归”多重共线性与“Logistic完全分离”核验"
    hint = model_res.data["groundedFormulaHint"]
    assert "VIF ≤ 5" in hint
    assert "Cronbach α ≥ 0.70" in hint and "CITC ≥ 0.30" in hint
    assert "Firth 或 L2 惩罚似然估计" in hint
    assert not _FORBIDDEN_BRACKETS_RE.search(hint)

    regional_res = grounding_tools.verify_regional_context(
        geography="「浙江」【社区】",
        topic_keywords="「养老」【助餐】『服务』",
    )
    dumped_regional = json.dumps(regional_res.data, ensure_ascii=False)
    assert regional_res.data["geography"] == "“浙江”社区"
    assert not _FORBIDDEN_BRACKETS_RE.search(dumped_regional)


def test_evix_api_errors_sanitize_error_message_and_exception_handler():
    dirty_err = (
        "ReAct 算子在统计计算沙盒与 EpistemicGraph / RunLease / 认知图谱 / DAG 中中断："
        "请检查「BYOK」【Bento】『Atypica』参数。"
    )
    cleaned_err = api_errors._sanitize_error_message(dirty_err)
    assert not _FORBIDDEN_BRACKETS_RE.search(cleaned_err)
    assert not _FORBIDDEN_CATALOG_JARGON_RE.search(cleaned_err)
    for raw_token in ("DAG", "认知图谱", "BYOK", "Bento", "Atypica"):
        assert raw_token not in cleaned_err
    assert "多步实证" in cleaned_err
    assert "统计环境" in cleaned_err
    assert "证据链" in cleaned_err
    assert "“专属服务配置”" in cleaned_err
    assert "复合信息图" in cleaned_err
    assert "“深度访谈”" in cleaned_err
    assert api_errors._sanitize_error_message("   ") == "当前请求未能完成，请稍后重试。"

    app = FastAPI()
    api_errors.install_handlers(app)

    @app.get("/probe-api-error")
    def _probe():
        raise ApiError(409, "custom_conflict_code", "自主算子与安全沙盒在「项目」【节点】发生版本冲突。")

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/probe-api-error")
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"] == "custom_conflict_code"
    assert body["error"]["message"] == "统计方法与统计环境在“项目”节点发生版本冲突。"
    assert not _FORBIDDEN_BRACKETS_RE.search(body["error"]["message"])
    assert not _FORBIDDEN_CATALOG_JARGON_RE.search(body["error"]["message"])


def test_word_cloud_render_enforces_zero_contour_width_and_zero_forbidden_brackets(monkeypatch):
    # 1. Static AST audit of word_cloud_render.py: zero forbidden brackets, zero personal paths, contour_width == 0.0
    wc_file = Path(inspect.getsourcefile(word_cloud_render) or "").resolve()
    wc_src = wc_file.read_text(encoding="utf-8")
    tree = ast.parse(wc_src, filename=str(wc_file))
    wordcloud_calls = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            assert not _FORBIDDEN_BRACKETS_RE.search(node.value), f"word_cloud_render.py:{node.lineno} leaked bracket: {node.value!r}"
            assert not _PRIVATE_PATH_RE.search(node.value), f"word_cloud_render.py:{node.lineno} leaked private path: {node.value!r}"
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "contour_width":
                    assert isinstance(node.value, ast.Constant) and float(node.value.value) == 0.0
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "WordCloud":
            wordcloud_calls += 1
            kw_names = {kw.arg for kw in node.keywords if kw.arg}
            assert "contour_width" in kw_names, "WordCloud(...) must explicitly pass contour_width=0.0"
    assert wordcloud_calls >= 1

    # 2. Dual-axis association catalog hygiene across diverse domains
    for sample_topic in (
        "银发长者智能健康监测手表采纳调查",
        "县域低空经济植保无人机农户采纳调研",
        "城市青年现制茶饮健康配方消费偏好",
        "非遗博物馆数字化展陈体验研究",
        "社区即时零售闪电仓履约满意度调查",
    ):
        pairs = word_cloud_render.associate_topic_silhouettes(sample_topic)
        assert [p["axis"] for p in pairs] == ["persona", "artifact"]
        dumped_pairs = json.dumps(pairs, ensure_ascii=False)
        assert not _FORBIDDEN_BRACKETS_RE.search(dumped_pairs)
        assert not _FORBIDDEN_CATALOG_JARGON_RE.search(dumped_pairs)

    # 3. Runtime spy verifying WordCloud(contour_width == 0.0) across both Persona & Artifact dual-axis renders
    real_wc_cls = word_cloud_render.WordCloud
    captured_kwargs: list[dict] = []

    def _spy_wordcloud(*args, **kwargs):
        captured_kwargs.append(dict(kwargs))
        return real_wc_cls(*args, **kwargs)

    monkeypatch.setattr(word_cloud_render, "WordCloud", _spy_wordcloud)

    sample_freqs = {
        "语音播报": 42,
        "字体清晰": 38,
        "跌倒预警": 35,
        "续航持久": 31,
        "子女远程": 29,
        "社区义诊": 26,
        "操作简便": 24,
        "医保补贴": 22,
        "误报校准": 19,
        "佩戴舒适": 18,
        "睡眠监测": 16,
        "心率异常": 15,
        "AI生成": 99,
        "大语言模型": 88,
        "模拟数据": 77,
    }
    res_persona = word_cloud_render.render_dense_wordcloud(
        {
            "topic": "城市老年人智能健康监测手表采纳与代际支持调查",
            "axis": "persona",
            "resultId": "wc-persona",
            "note": "AI生成大语言模型教学模拟受众诉求词云",
            "frequencies": sample_freqs,
            "maxWords": 40,
            "seed": 7,
        }
    )
    res_artifact = word_cloud_render.render_dense_wordcloud(
        {
            "topic": "城市老年人智能健康监测手表采纳与代际支持调查",
            "axis": "artifact",
            "resultId": "wc-artifact",
            "frequencies": sample_freqs,
            "pairedBar": True,
            "maxWords": 40,
            "seed": 7,
        }
    )

    assert len(captured_kwargs) == 2
    for call_kw in captured_kwargs:
        assert call_kw["contour_width"] == 0.0
        assert call_kw["background_color"] == "white"

    assert res_persona["axis"] == "persona" and (res_persona["widthPx"], res_persona["heightPx"]) == (1280, 720)
    assert res_artifact["axis"] == "artifact" and (res_artifact["widthPx"], res_artifact["heightPx"]) == (1400, 680)
    assert res_persona["byteLength"] <= word_cloud_render.MAX_PNG_BYTES
    assert res_artifact["byteLength"] <= word_cloud_render.MAX_PNG_BYTES
    for rendered in (res_persona, res_artifact):
        assert "AI" not in rendered["note"] and "大语言模型" not in rendered["note"] and "教学模拟" not in rendered["note"]
        assert not _FORBIDDEN_BRACKETS_RE.search(rendered["note"])
        top_terms = {item["term"] for item in rendered["topTerms"]}
        assert not ({"AI生成", "大语言模型", "模拟数据"} & top_terms)
        assert not _FORBIDDEN_BRACKETS_RE.search(json.dumps(rendered["topTerms"], ensure_ascii=False))

