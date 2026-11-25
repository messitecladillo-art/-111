"""Full-report boundary and dispatch ordering, using explicit synthetic responses.

The application double below tests transaction ordering and revocation handling;
it does not replace the separately marked actual PostgreSQL/RLS acceptance tests.
"""
import asyncio
from copy import deepcopy
from datetime import timedelta
from functools import partial
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from application.idempotency import reserve_operation
from application.providers import AuthoredProvider, LiveProvider, _AUTHORED_ENVELOPE
from application.services.full_report_section import FullReportSectionService
from evix_api.app import create_app
from infrastructure.database.models import Operation, RateEvent, Service, now
from infrastructure.llm import ChatCompletionClient, Completion
from infrastructure.security import encrypt
from multi_agent.agents.writing_agent.services import full_report_section as report
from multi_agent.skill_guidance import active_corpus_skills
from shared.errors import ApiError, ProviderFailure


def preflight(**changes):
    return {"schemaVersion": 1, "runId": str(uuid4()), "projectId": None, "inputRevision": "synthetic-input-revision",
            "serviceId": str(uuid4()), "serviceRevision": 1, "consent": True, "mode": "plan", **changes}


def request(**changes):
    return {**preflight(), "idempotencyKey": str(uuid4()), "nodeId": "intro.background", "prompt": "合成测试资料：请保留待实施性质。",
            "wave": 1, "attempt": 1, "purpose": "draft", **changes}


def test_exact_context_and_all_thirty_four_slots_are_accepted_without_mutation():
    context = preflight()
    version, _ = active_corpus_skills()
    assert report.preflight_input(context) == context
    assert report.MAX_OUTPUT_TOKENS == 3600 and report.CALLS_PER_HOUR == 180 and report.PROMPT_BYTES == 96000
    assert {
        "segments.cluster", "plan.feasibility", "secondary.source", "secondary.analysis",
        "secondary.implication", "demand.preference", "demand.willingness", "plan.priority",
    } <= report.WAVE_1_NODES
    assert len(report.WAVE_1_NODES | report.WAVE_2_NODES) == 34
    for node in report.WAVE_1_NODES | report.WAVE_2_NODES:
        data = request(**context, nodeId=node, wave=1 if node in report.WAVE_1_NODES else 2)
        assert report.request_input(data) == data
        prompt = report.section_prompt(data)
        assert json.loads(prompt.split("资料 JSON：", 1)[1])["instructions"] == data["prompt"]
        assert f'<corpus-skill-guidance package="survey-corpus-7pack@{version[:12]}">' in prompt
        assert _AUTHORED_ENVELOPE.findall(prompt)[-1] == (node, "draft")


def test_storyline_and_blueprint_purposes_are_scoped_and_return_clean_json_envelopes():
    for mode in ("plan", "demonstration", "empirical"):
        story = request(
            mode=mode,
            projectId=str(uuid4()) if mode == "empirical" else None,
            nodeId="intro.roadmap",
            wave=1,
            attempt=1,
            purpose="storyline",
        )
        assert report.request_input(story) == story
        prompt = report.section_prompt(story)
        assert "叙事主线" in prompt and "只返回要求中规定字段的一个 JSON 对象" in prompt and "不编造数字" in prompt
        assert "paragraphs" not in prompt and "<corpus-skill-guidance" not in prompt
        assert json.loads(prompt.split("资料 JSON：", 1)[1]) == {
            "instructions": story["prompt"], "nodeId": "intro.roadmap", "purpose": "storyline",
        }
        assert _AUTHORED_ENVELOPE.findall(prompt)[-1] == ("intro.roadmap", "storyline")

    for bad_story in (
        {"nodeId": "intro.background", "wave": 1, "attempt": 1, "purpose": "storyline"},
        {"nodeId": "abstract", "wave": 2, "attempt": 1, "purpose": "storyline"},
        {"nodeId": "intro.roadmap", "wave": 1, "attempt": 2, "purpose": "storyline"},
    ):
        with pytest.raises(ApiError) as denied:
            report.request_input(request(**bad_story))
        assert denied.value.code == "storyline_scope"

    bp = request(mode="demonstration", nodeId="design.content", wave=1, attempt=1, purpose="blueprint")
    assert report.request_input(bp) == bp
    assert _AUTHORED_ENVELOPE.findall(report.section_prompt(bp))[-1] == ("design.content", "blueprint")
    with pytest.raises(ApiError) as bp_denied:
        report.request_input(request(mode="plan", nodeId="design.content", wave=1, attempt=1, purpose="blueprint"))
    assert bp_denied.value.code == "blueprint_scope"


def test_draft_and_revision_inject_compact_role_matched_skill_guidance_and_twelve_paragraph_budget():
    version, _ = active_corpus_skills()
    tag = f'<corpus-skill-guidance package="survey-corpus-7pack@{version[:12]}">'
    expectations = (
        ("abstract", 2, "draft", "五步高密结构"),
        ("segments.cluster", 1, "draft", "实证织造"),
        ("plan.feasibility", 1, "revision", "监测阈值"),
    )
    for node, wave, purpose, marker in expectations:
        data = request(nodeId=node, wave=wave, purpose=purpose)
        assert report.request_input(data) == data
        prompt = report.section_prompt(data)
        assert tag in prompt and "</corpus-skill-guidance>" in prompt and marker in prompt
        assert "最多十二段" in prompt and "12 段" in prompt
        assert "可直接引用已提供的登记证据表数值或占位符" in prompt
        assert _AUTHORED_ENVELOPE.findall(prompt)[-1] == (node, purpose)

    max_ascii = request(nodeId="segments.cluster", prompt="x" * 64000)
    assert report.request_input(max_ascii) == max_ascii
    wide_cjk = request(nodeId="plan.feasibility", prompt="中" * 21000)
    assert report.request_input(wide_cjk) == wide_cjk


def test_demonstration_disclosure_boundary_vs_analytical_node_prompt_guidance():
    directive = "（全篇已在摘要与方法章集中声明教学模拟性质，本节请直接切入实证与机制分析，勿在段首或段末机械重复‘本轮仅作教学模拟，不报告真实调查发现’式免责声明套话，但仍须以样本内数据口径客观表述。）"
    honesty = "不得将模拟样本、计算或结论写成真实调查发现"
    assert report.DEMONSTRATION_DISCLOSURE_NODES == frozenset((
        "abstract", "design.population", "design.sampling", "data.cleaning", "conclusion.limits",
    ))
    for node in report.DEMONSTRATION_DISCLOSURE_NODES:
        data = request(mode="demonstration", nodeId=node, wave=1 if node in report.WAVE_1_NODES else 2, purpose="draft")
        prompt = report.section_prompt(data)
        assert honesty in prompt and directive not in prompt
        assert "……不等于……" in prompt and "纯文本行内复写已有独立公式块" in prompt

    for node in ("intro.background", "segments.cluster", "drivers.model", "plan.feasibility", "conclusion.findings"):
        data = request(mode="demonstration", nodeId=node, wave=1 if node in report.WAVE_1_NODES else 2, purpose="draft")
        prompt = report.section_prompt(data)
        assert honesty in prompt and directive in prompt
        assert "……不等于……" in prompt and "纯文本行内复写已有独立公式块" in prompt

    assert directive not in report.section_prompt(request(mode="plan", nodeId="drivers.model", wave=1, purpose="draft"))
    assert directive not in report.section_prompt(request(mode="demonstration", nodeId="drivers.model", wave=1, purpose="revision"))


def test_wave6_abstract_local_policy_vosviewer_and_wordcloud_guidance():
    abstract_prompt = report.section_prompt(request(nodeId="abstract", wave=2, purpose="draft"))
    assert "920–1,030" in abstract_prompt and "四段式五步高密结构" in abstract_prompt and "关键词：" in abstract_prompt

    for node, wave in (("plan.measures", 1), ("plan.feasibility", 1), ("conclusion.suggestions", 2)):
        prompt = report.section_prompt(request(nodeId=node, wave=wave, purpose="draft"))
        assert "加强顶层设计、加大宣传力度、完善监管机制、形成多方合力" in prompt
        assert "基层微观实情" in prompt and "属地制度/政策工具" in prompt and "监测阈值" in prompt
        assert "长者数字驿站" not in prompt and "县域商业建设行动" not in prompt
        assert "严禁跨领域" in prompt and "核验口径" in prompt

    clinical_prompt = report.section_prompt(request(
        nodeId="plan.feasibility",
        wave=1,
        purpose="draft",
        prompt='资料 JSON：{"project":{"title":"医院临床随机对照干预试点效果调查"}}',
    ))
    assert "试点止损触发阈值" in clinical_prompt

    lit_prompt = report.section_prompt(request(
        nodeId="intro.literature",
        wave=1,
        purpose="draft",
        prompt='资料 JSON：{"project":{"title":"智慧城市交通治理调查"},"exhibits":[{"text":"文献关键词共现聚类网络图"}]}',
    ))
    assert "文献关键词共现聚类网络图" in lit_prompt and "VOSviewer" not in lit_prompt

    desc_prompt = report.section_prompt(request(
        nodeId="sample.descriptive",
        wave=1,
        purpose="draft",
        prompt='资料 JSON：{"project":{"title":"社区服务调查"},"exhibits":[{"text":"开放题Q32主动建言高频词云图"}]}',
    ))
    assert "开放题Q32主动建言高频词云图" in desc_prompt and "互证关系" in desc_prompt


def test_wave7_empirical_zero_simulation_ban_and_chapter1_xulun_alignment():
    project_id = str(uuid4())
    emp_prompt = report.section_prompt(request(mode="empirical", projectId=project_id, nodeId="intro.background", wave=1, purpose="draft"))
    assert "一、绪论" in emp_prompt
    assert "真实田野调研实证口吻" in emp_prompt
    for forbidden in ("模拟数据", "脚本生成", "随机种子", "合成记录", "教学模拟", "AI生成", "大语言模型", "机器生成", "演练语料"):
        assert forbidden in emp_prompt
    assert "绝对禁止" in emp_prompt

    # Demonstration mode preserves its own simulation disclosure rules without breaking legacy tests.
    demo_prompt = report.section_prompt(request(mode="demonstration", nodeId="abstract", wave=2, purpose="draft"))
    assert "必须保留模拟性质" in demo_prompt


def test_wave7_dense_wordcloud_renderer_and_http_endpoint(settings):
    import base64
    from multi_agent.agents.writing_agent.services.page_art import section_illustration_bytes
    from multi_agent.agents.writing_agent.services.word_cloud_render import render_dense_wordcloud

    rendered = render_dense_wordcloud({
        "topic": "城市老年人智能健康监测设备采纳意愿",
        "resultId": "rich-wordcloud-silver",
        "frequencies": {"字体放大": 168, "语音播报": 152, "一键求助": 146, "血压趋势": 135, "子女远程": 128, "续航持久": 118, "社区驿站": 108},
        "palette": {"primary": "#0F766E", "secondary": "#C99A3E", "opposite": "#A65A3A"},
    })
    assert rendered["ok"] is True and rendered["schema"] == "SectionIllustration/v1"
    assert rendered["shape"] == "elder_portrait" and rendered["widthPx"] == 1280 and rendered["heightPx"] == 720
    assert rendered["byteLength"] <= 500_000 and rendered["wordCount"] >= 40
    assert isinstance(rendered["associatedSilhouettes"], list) and len(rendered["associatedSilhouettes"]) == 2
    raw_png = section_illustration_bytes(rendered["illustration"])
    assert raw_png == base64.b64decode(rendered["data"]) and raw_png.startswith(b"\x89PNG\r\n\x1a\n")

    with TestClient(create_app(settings)) as client:
        res = client.post("/api/reports/wordcloud", json={
            "shape": "shield",
            "accent": "blue",
            "resultId": "rich-wordcloud-retail",
            "text": "即时配送 闪电仓 骑手接驳 包装完好 准时送达 临期隔离 阳光溯源 冷链保鲜 错峰并单 价格透明 " * 8,
        })
        assert res.status_code == 200, res.text
        payload = res.json()
        assert payload["ok"] is True and payload["shape"] == "shield" and payload["byteLength"] <= 500_000
        assert section_illustration_bytes(payload["illustration"]).startswith(b"\x89PNG")

        cross_site = client.post("/api/reports/wordcloud", json={"frequencies": {"测试": 10}}, headers={"sec-fetch-site": "cross-site"})
        assert cross_site.status_code == 403


def test_wave7_4_dual_axis_elder_portrait_and_smart_watch_silhouettes(settings):
    import io
    from PIL import Image
    from multi_agent.agents.writing_agent.services.page_art import section_illustration_bytes
    from multi_agent.agents.writing_agent.services.word_cloud_render import associate_topic_silhouettes

    topic = "银发「智」守：城市老年人智能健康监测设备采纳意愿与代际数字反哺机制"
    assoc = associate_topic_silhouettes(topic)
    assert [(item["axis"], item["shape"], item["hasAsset"]) for item in assoc] == [
        ("persona", "elder_portrait", True),
        ("artifact", "smart_watch", True),
    ]

    with TestClient(create_app(settings)) as client:
        persona_res = client.post("/api/reports/wordcloud", json={
            "topic": topic,
            "axis": "persona",
            "resultId": "rich-wordcloud-persona-silver",
            "note": "银发群体代际数字反哺与社区照护诉求词云图",
            "frequencies": {
                "子女代设": 185, "健康焦虑": 172, "老伴互助": 160, "慢病管理": 154,
                "社区指导": 148, "独居安全": 136, "医养驿站": 130, "数字鸿沟": 126,
                "陪伴": 70, "血压": 66, "心率": 62, "适老": 54,
            },
        })
        assert persona_res.status_code == 200, persona_res.text
        persona_body = persona_res.json()
        assert persona_body["axis"] == "persona" and persona_body["shape"] == "elder_portrait"
        assert persona_body["widthPx"] == 1280 and persona_body["heightPx"] == 720
        assert persona_body["byteLength"] <= 500_000 and persona_body["wordCount"] >= 40
        assert [x["shape"] for x in persona_body["associatedSilhouettes"]] == ["elder_portrait", "smart_watch"]
        persona_png = section_illustration_bytes(persona_body["illustration"])
        assert Image.open(io.BytesIO(persona_png)).size == (1280, 720)

        artifact_res = client.post("/api/reports/wordcloud", json={
            "topic": topic,
            "axis": "artifact",
            "resultId": "rich-wordcloud-silver",
            "note": "智能健康监测设备交互体验与功能改进建言词云图",
            "frequencies": {
                "字体放大": 190, "语音播报": 176, "一键求助": 168, "超长续航": 158,
                "血压校准": 150, "心率预警": 144, "磁吸充电": 138, "跌倒报警": 132,
                "续航": 62, "表盘": 54, "蓝牙": 50, "心电": 42,
            },
        })
        assert artifact_res.status_code == 200, artifact_res.text
        artifact_body = artifact_res.json()
        assert artifact_body["axis"] == "artifact" and artifact_body["shape"] == "smart_watch"
        assert artifact_body["widthPx"] == 1280 and artifact_body["heightPx"] == 720
        assert artifact_body["byteLength"] <= 500_000 and artifact_body["wordCount"] >= 40
        artifact_png = section_illustration_bytes(artifact_body["illustration"])
        assert Image.open(io.BytesIO(artifact_png)).size == (1280, 720)


def test_wave9_domain_agnostic_paired_bar_wordcloud_exhibit(settings):
    import io
    import re
    from PIL import Image
    from multi_agent.agents.writing_agent.services.page_art import section_illustration_bytes
    from multi_agent.agents.writing_agent.services.word_cloud_render import render_word_cloud_png

    # Direct helper `render_word_cloud_png(..., pairedBar=True)` works on any arbitrary cross-industry topic
    raw_bytes = render_word_cloud_png(
        {
            "topic": "高校大学生数字化自主学习与课程体验调查",
            "shape": "capsule",
            "accent": "blue",
            "frequencies": {
                "文献检索": 210, "知识图谱": 195, "学术规范": 182, "课堂互动": 170,
                "错题归纳": 158, "实验复现": 146, "小组研讨": 135, "跨学科融合": 124,
                "时间管理": 116, "批判思维": 108, "课程反馈": 96, "科研训练": 88,
                "思维导图": 79, "自主探究": 72,
            },
        },
        pairedBar=True,
    )
    assert len(raw_bytes) <= 500_000
    with Image.open(io.BytesIO(raw_bytes)) as im:
        assert im.size == (1400, 680)
        assert im.getpixel((4, 4)) == (255, 255, 255)
        assert im.getpixel((1395, 675)) == (255, 255, 255)

    with TestClient(create_app(settings)) as client:
        res = client.post("/api/reports/wordcloud", json={
            "topic": "县域即时零售闪电仓履约体验与消费意愿调查",
            "shape": "shield",
            "accent": "teal",
            "pairedBar": True,
            "resultId": "rich-wordcloud-paired",
            "frequencies": {
                "准时送达": 215, "包装完好": 198, "价格透明": 184, "冷链保鲜": 172,
                "品类齐全": 164, "夜间应急": 150, "骑手礼貌": 141, "临期隔离": 132,
                "售后极速": 124, "阳光溯源": 115, "满减清晰": 106, "缺货替补": 96,
                "定位准确": 88, "APP": 75,
            },
        })
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True and body["pairedBar"] is True
        assert body["widthPx"] == 1400 and body["heightPx"] == 680
        assert body["byteLength"] <= 500_000
        assert len(body["topTerms"]) == 12
        assert body["topTerms"][0] == {"term": "准时送达", "count": 215}
        assert all(re.fullmatch(r"[\u4e00-\u9fa5]+", item["term"]) for item in body["topTerms"])
        validated_png = section_illustration_bytes(body["illustration"])
        assert Image.open(io.BytesIO(validated_png)).size == (1400, 680)


@pytest.mark.asyncio
async def test_live_and_authored_providers_support_expanded_budget_and_storyline_envelope(monkeypatch, tmp_path):
    observed = []

    async def fake_complete(self, config, key, message, limit, timeout=30):
        observed.append((limit, timeout, message))
        return Completion('{"claims":[]}')

    monkeypatch.setattr(ChatCompletionClient, "complete", fake_complete)
    story_prompt = report.section_prompt(request(nodeId="intro.roadmap", purpose="storyline"))
    res = await LiveProvider().section_draft({"provider": "deepseek"}, "synthetic-key", story_prompt)
    assert res == '{"claims":[]}' and observed == [(131072, 85, story_prompt)]

    async def instant_sleep(_s):
        return None

    (tmp_path / "storyline").mkdir(parents=True)
    (tmp_path / "storyline" / "intro.roadmap.json").write_text('{"motherInsight":"合成测试主线"}', encoding="utf-8")
    monkeypatch.setattr("application.providers.asyncio.sleep", instant_sleep)
    authored = await AuthoredProvider(tmp_path).section_draft({"provider": "openai"}, "synthetic-key", story_prompt)
    assert json.loads(authored) == {"motherInsight": "合成测试主线"}
    assert (tmp_path / "prompts" / "storyline" / "intro.roadmap.txt").is_file()


@pytest.mark.asyncio
async def test_authored_provider_supports_full_workflow_stages(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    (tmp_path / "agent_chat").mkdir()
    (tmp_path / "agent_chat" / "routes.json").write_text(
        json.dumps(
            {
                "rules": [{"pattern": "资料库|三线表", "response": {"reply": "打开资料库", "actions": [{"tool": "stage", "args": {"view": "library"}}]}}],
                "default": {"reply": "按研究主线继续。", "actions": [{"tool": "next", "args": {}}]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (tmp_path / "proposals").mkdir()
    (tmp_path / "proposals" / "default.json").write_text(
        json.dumps({"title": "合成问卷", "objective": "目标", "population": "人群", "items": []}, ensure_ascii=False),
        encoding="utf-8",
    )
    (tmp_path / "interview_pretest").mkdir()
    (tmp_path / "interview_pretest" / "pack.json").write_text(
        json.dumps(
            {
                "personas": [
                    {"id": "p1", "label": "甲", "background": "背景一", "rationale": "理由一"},
                    {"id": "p2", "label": "乙", "background": "背景二", "rationale": "理由二"},
                    {"id": "p3", "label": "丙", "background": "背景三", "rationale": "理由三"},
                ],
                "focusKeywords": ["满意"],
                "unclearKeywords": ["满意"],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    provider = AuthoredProvider(tmp_path)
    chat_out = json.loads(await provider.agent_chat({}, "k", '前缀资料JSON：{"message":"打开资料库"}'))
    assert chat_out["actions"][0]["args"]["view"] == "library"
    prop_out = json.loads(await provider({}, "k", {"topic": "测试"}))
    assert prop_out["title"] == "合成问卷"
    roster_out = json.loads(
        await provider.answer(
            {},
            "k",
            "{}",
            {"mode": "interview_pretest", "stage": "roster", "input": {"maxFocusQuestions": 1, "questions": [{"id": "q1", "text": "整体满意吗？", "type": "likert"}]}},
        )
    )
    assert roster_out["questionIds"] == ["q1"]
    iv_out = json.loads(
        await provider.answer(
            {},
            "k",
            "{}",
            {"mode": "interview_pretest", "stage": "interview", "input": {"persona": {"id": "p1"}, "questions": [{"id": "q1", "text": "整体满意吗？", "type": "likert", "min": 1, "max": 5}]}},
        )
    )
    assert iv_out["answers"][0]["questionId"] == "q1" and iv_out["answers"][0]["unclear"]

    (tmp_path / "topic").mkdir()
    (tmp_path / "topic" / "default.json").write_text(
        json.dumps(
            {
                "items": [
                    {
                        "patternId": "p1",
                        "title": "方案一",
                        "researchQuestion": "问题一",
                        "decisionOwner": "方一",
                        "decision": "决定一",
                        "whyHere": "理由一",
                        "firstWeekPlan": ["行动一"],
                        "unknowns": ["待核实一"],
                        "sourceIds": ["s1"],
                    },
                    {
                        "patternId": "p2",
                        "title": "方案二",
                        "researchQuestion": "问题二",
                        "decisionOwner": "方二",
                        "decision": "决定二",
                        "whyHere": "理由二",
                        "firstWeekPlan": ["行动二"],
                        "unknowns": ["待核实二"],
                        "sourceIds": ["s2"],
                    },
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (tmp_path / "topic_agent").mkdir()
    (tmp_path / "topic_agent" / "default.json").write_text(
        json.dumps(
            {"text": "建议继续聚焦。", "questions": ["哪个区县？"], "items": json.loads((tmp_path / "topic" / "default.json").read_text(encoding="utf-8"))["items"]},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    one_sel = [{"id": "p01-campus-food", "sourceIds": ["src-a", "src-b"]}]
    three_sel = [
        {"id": "p01-campus-food", "sourceIds": ["src-a"]},
        {"id": "p02-elder-care", "sourceIds": ["src-b"]},
        {"id": "p03-ai-study", "sourceIds": ["src-c"]},
    ]
    t1 = json.loads(await provider.topic({}, "k", "主题消息", one_sel))
    t3 = json.loads(await provider.topic({}, "k", "主题消息", three_sel))
    ta1 = json.loads(await provider.topic_agent({}, "k", "主题消息", one_sel))
    ta3 = json.loads(await provider.topic_agent({}, "k", "主题消息", three_sel))
    assert [r["patternId"] for r in t1["items"]] == ["p01-campus-food"] and t1["items"][0]["sourceIds"] == ["src-a", "src-b"]
    assert [r["patternId"] for r in t3["items"]] == ["p01-campus-food", "p02-elder-care", "p03-ai-study"]
    assert [r["patternId"] for r in ta1["items"]] == ["p01-campus-food"]
    assert [r["patternId"] for r in ta3["items"]] == ["p01-campus-food", "p02-elder-care", "p03-ai-study"]

    (tmp_path / "draft").mkdir()
    (tmp_path / "draft" / "intro.background.json").write_text('{"paragraphs":[{"text":"回退稿"}]}', encoding="utf-8")
    rev_prompt = report.section_prompt(request(nodeId="intro.background", purpose="revision"))
    rev_out = json.loads(await provider.section_draft({"provider": "openai"}, "k", rev_prompt))
    assert rev_out["paragraphs"][0]["text"] == "回退稿"


@pytest.mark.parametrize("changes", [
    {"schemaVersion": True}, {"schemaVersion": 2}, {"runId": "invalid"}, {"projectId": "local"},
    {"inputRevision": ""}, {"inputRevision": " "}, {"inputRevision": "x" * 129}, {"inputRevision": "bad\x7f"},
    {"serviceId": "00000000-0000-0000-0000-000000000000"}, {"serviceRevision": True}, {"serviceRevision": 0},
    {"consent": 1}, {"consent": False}, {"mode": "live"}, {"mode": {}}, {"mode": "empirical"}, {"extra": True},
])
def test_bad_preflight_context_is_refused(changes):
    with pytest.raises(ApiError):
        report.preflight_input(preflight(**changes))


@pytest.mark.parametrize("changes", [
    {"idempotencyKey": "invalid"}, {"nodeId": "invented"}, {"nodeId": []}, {"wave": True}, {"wave": 3},
    {"wave": 2}, {"nodeId": "abstract", "wave": 1}, {"attempt": True}, {"attempt": 0}, {"attempt": 3},
    {"purpose": "automatic-retry"}, {"purpose": []}, {"prompt": ""}, {"prompt": " "},
    {"prompt": "bad\x7f"}, {"prompt": "\ud800"}, {"prompt": "x" * 64001}, {"extra": 1},
])
def test_invalid_slot_payload_is_refused(changes):
    with pytest.raises(ApiError):
        report.request_input(request(**changes))


def test_missing_fields_and_escaped_transport_budget_are_refused():
    data = preflight()
    del data["projectId"]
    with pytest.raises(ApiError):
        report.preflight_input(data)
    with pytest.raises(ApiError) as failure:
        report.request_input(request(prompt="中" * 33000))
    assert failure.value.code == "input_too_large"
    with pytest.raises(ApiError) as escaped:
        report.request_input(request(prompt='"' * 35000))
    assert escaped.value.code == "input_too_large"


def test_modes_keep_their_truth_boundary_and_empirical_requires_a_real_project_id():
    for mode, phrase in (("plan", "研究计划"), ("demonstration", "教学模拟"), ("empirical", "登记证据")):
        data = request(mode=mode, projectId=str(uuid4()) if mode == "empirical" else None)
        assert report.request_input(data) == data
        prompt = report.section_prompt(data)
        assert phrase in prompt and "候选稿" in prompt and "不编造数字" in prompt
    with pytest.raises(ApiError) as denied:
        report.preflight_input(preflight(mode="empirical"))
    assert denied.value.code == "project_required"


def test_unknown_fingerprint_cannot_be_evaded_by_a_new_run_key_wording_or_attempt():
    data = request()
    changed = {**data, "runId": str(uuid4()), "idempotencyKey": str(uuid4()), "prompt": "换措辞重新发", "attempt": 2}
    assert report.input_fingerprint(data) == report.input_fingerprint(changed)
    for name, value in (("inputRevision", "new-input"), ("serviceRevision", 2), ("projectId", str(uuid4())),
                        ("nodeId", "intro.significance"), ("purpose", "revision"), ("mode", "demonstration")):
        assert report.input_fingerprint(data) != report.input_fingerprint({**data, name: value})


@pytest.mark.parametrize("encode", [
    lambda key: key,
    lambda key: json.dumps(key),
    lambda key: "".join("\\u%04x" % ord(character) for character in key),
    lambda key: json.dumps("".join("\\u%04x" % ord(character) for character in key)),
    lambda key: "\\u0073" + key[1:],
])
def test_credentials_are_refused_even_in_nested_or_mixed_json_escapes(encode):
    key = 'synthetic-"quoted"-credential'
    raw = '{"paragraphs":[{"text":' + encode(key) + '}]}'
    assert report.contains_secret(raw, key)
    with pytest.raises(ProviderFailure) as denied:
        report.safe_content(raw, key)
    assert denied.value.code == "invalid_response"


def test_raw_content_is_bounded_but_known_content_rejection_can_be_revised():
    # A received malformed paragraph object is known, not an uncertain transport failure.
    assert report.safe_content("合成测试：不是 JSON", "synthetic-credential") == "合成测试：不是 JSON"
    assert not report.contains_secret("普通研究资料", "synthetic-credential")
    for raw in (None, "", " ", "x\x00", "x\x7f", "\ud800"):
        with pytest.raises(ProviderFailure):
            report.safe_content(raw, "synthetic-credential")
    with pytest.raises(ProviderFailure) as large:
        report.safe_content("中" * 22000, "synthetic-credential")
    assert large.value.code == "response_too_large"


@pytest.mark.parametrize("usage", [None, {}, {"inputTokens": 1}, {"inputTokens": True, "outputTokens": 2},
                                   {"inputTokens": -1, "outputTokens": 2}, {"inputTokens": 1.5, "outputTokens": 2},
                                   {"inputTokens": 1, "outputTokens": 2**54}])
def test_usage_is_unknown_unless_both_actual_counts_are_valid(usage):
    assert report.safe_usage(usage) is None
    assert report.safe_usage({"inputTokens": 0, "outputTokens": 2, "extra": "discard"}) == {"inputTokens": 0, "outputTokens": 2}


def test_run_authorization_is_bounded_and_metadata_never_contains_the_body():
    data = request()
    run = report.run_receipt(data, SimpleNamespace(provider="deepseek", model="synthetic-model", max_output_tokens=8000), "fixture")
    assert run["maxConcurrency"] == 6 and run["maxOutputTokens"] == 3600 and run["providerMode"] == "fixture"
    assert report.timestamp(run["authorizationExpiresAt"]) - report.timestamp(run["createdAt"]) == timedelta(hours=2)
    assert report.authorization_expired(run) is False
    receipt = report.section_receipt(data, run)
    receipt.update(content="合成测试正文", usage={"inputTokens": 9, "outputTokens": 4})
    metadata = report.section_metadata(receipt)
    assert metadata["usage"] == receipt["usage"]
    assert not ({"content", "prompt", "apiKey", "key", "inputFingerprint"} & metadata.keys())
    op = SimpleNamespace(response={**receipt, "createdAt": report.iso(now() - timedelta(seconds=121))})
    report.expire_section(op)
    assert op.response["status"] == "outcome_unknown" and op.response["content"] is None
    assert op.response["errorCode"] == "interrupted_call"
    terminal = deepcopy(op.response)
    report.expire_section(op)
    assert op.response == terminal


class ApplicationSession:
    """A dispatch-order test double only; PostgreSQL semantics are not simulated."""
    def __init__(self, service):
        self.service, self.operations, self.events, self.commits, self.refreshed = service, {}, [], [], []
        self.fresh_revision, self.fresh_capabilities, self.fresh_deleted = service.revision, list(service.capabilities), False
        self.final_operation = None

    def get(self, model, identifier):
        assert model is Operation
        return self.operations.get(identifier)

    def add(self, value):
        if isinstance(value, Operation):
            self.operations[(value.user_id, value.scope, value.key)] = value
            if value.scope == report.SCOPE:
                self.final_operation = value
        else:
            assert isinstance(value, RateEvent)
            self.events.append(value)

    def refresh(self, service):
        assert service is self.service
        service.revision, service.capabilities, service.deleted = self.fresh_revision, self.fresh_capabilities, self.fresh_deleted
        self.refreshed.append(service.revision)

    def execute(self, statement, parameters=None):
        if parameters:
            assert "set_config" in str(statement)
            return None
        return SimpleNamespace(scalar_one=lambda: self.final_operation)

    def commit(self):
        self.commits.append({key: deepcopy(op.response) for key, op in self.operations.items()})


@pytest.fixture
def application_harness(settings, monkeypatch):
    user = SimpleNamespace(id=str(uuid4()))
    data = request()
    credential = 'synthetic-"quoted"-credential'
    service = Service(id=data["serviceId"], user_id=user.id, label="合成测试服务", provider="deepseek",
                      base_url="https://api.deepseek.com/v1", model="synthetic-model", max_output_tokens=8000,
                      capabilities=["report"], revision=1, deleted=False)
    encrypt(settings, service, credential)
    session = ApplicationSession(service)
    state = SimpleNamespace(calls=0, revoked=False, after_dispatch=lambda: None, raw=Completion('{"paragraphs":[{"text":"合成测试候选正文。"}]}'),
                            failure=None, checks=[])
    state.raw.usage = {"inputTokens": 51, "outputTokens": 13}

    async def dispatch(config, key, prompt):
        state.calls += 1
        assert session.commits[-1][(user.id, report.SCOPE, data["idempotencyKey"])]["status"] == "running"
        assert len(session.events) == state.calls
        assert config["maxOutputTokens"] == 3600 and key == credential
        assert "研究计划" in prompt and credential not in prompt
        assert credential not in json.dumps(list(session.commits[-1].values()), ensure_ascii=False)
        state.after_dispatch()
        if state.failure:
            raise state.failure
        return state.raw

    def check_session(session, *, lock=False):
        state.checks.append(lock)
        if state.revoked:
            raise ApiError(401, "session_required", "请先登录。")

    sut = FullReportSectionService(settings=settings, lock_user=lambda *args: None,
        operation=partial(reserve_operation, settings), owned_project=lambda *args, **kwargs: pytest.fail("unexpected project"),
        owned_service=lambda *args, **kwargs: service, generator=SimpleNamespace(section_draft=dispatch))
    # Slot/rate SQL is exercised by the actual PostgreSQL tests, not by this double.
    monkeypatch.setattr(sut, "_reserve_limits", lambda *args: "synthetic-rate-scope")
    sut.preflight(user=user, session=session, check_session=check_session, raw_data=report.context(data))
    return SimpleNamespace(sut=sut, user=user, data=data, service=service, session=session, state=state,
                           key=credential, check_session=check_session,
                           invoke=lambda: sut.create_section(user=user, session=session, check_session=check_session, raw_data=data))


async def test_committed_dispatch_is_replayed_without_a_second_provider_call(application_harness):
    h = application_harness
    made = await h.invoke()
    assert made["status"] == "ready" and made["usage"] == {"inputTokens": 51, "outputTokens": 13}
    assert made["classification"] == "proposed" and h.state.calls == 1
    assert await h.invoke() == made and h.state.calls == 1 and len(h.session.events) == 1
    assert len(h.session.refreshed) == 4 and all(h.state.checks)
    assert "prompt" not in made and h.key not in json.dumps(made)
    h.data["prompt"] = "变化后的资料"
    with pytest.raises(ApiError) as conflict:
        await h.invoke()
    assert conflict.value.code == "idempotency_conflict" and h.state.calls == 1


@pytest.mark.parametrize("failure, status, code", [
    (ProviderFailure("rate_limited"), "failed", "rate_limited"),
    (ProviderFailure("provider_rejected", unknown=True), "outcome_unknown", "provider_rejected"),
    (TimeoutError("raw-secret-must-not-leak"), "outcome_unknown", "provider_timeout"),
    (RuntimeError("raw-secret-must-not-leak"), "outcome_unknown", "provider_failure"),
])
async def test_provider_failure_is_safe_and_not_redispatched(application_harness, failure, status, code):
    h = application_harness
    h.state.failure = failure
    made = await h.invoke()
    assert made["status"] == status and made["errorCode"] == code and made["content"] is None and made["usage"] is None
    assert "raw-secret" not in json.dumps(made)
    assert await h.invoke() == made and h.state.calls == 1


async def test_cancellation_records_unknown_before_propagating(application_harness):
    h = application_harness
    h.state.failure = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await h.invoke()
    receipt = h.session.final_operation.response
    assert receipt["status"] == "outcome_unknown" and receipt["errorCode"] == "provider_timeout"
    assert h.session.commits[-1][(h.user.id, report.SCOPE, receipt["id"])] == receipt
    assert await h.invoke() == receipt and h.state.calls == 1


@pytest.mark.parametrize("change, code", [
    (lambda h: setattr(h.state, "revoked", True), "session_required"),
    (lambda h: setattr(h.session, "fresh_revision", 2), "revision_conflict"),
    (lambda h: setattr(h.session, "fresh_capabilities", ["research"]), "capability_unavailable"),
    (lambda h: setattr(h.session, "fresh_deleted", True), "not_found"),
])
async def test_post_dispatch_revocation_discards_body_but_preserves_actual_usage(application_harness, change, code):
    h = application_harness
    h.state.after_dispatch = lambda: change(h)
    with pytest.raises(ApiError) as denied:
        await h.invoke()
    assert denied.value.code == code
    receipt = h.session.final_operation.response
    assert receipt["status"] == "failed" and receipt["content"] is None and receipt["errorCode"] == code
    assert receipt["usage"] == {"inputTokens": 51, "outputTokens": 13} and h.state.calls == 1


@pytest.mark.parametrize("failure", [ProviderFailure("provider_timeout", unknown=True), TimeoutError(), asyncio.CancelledError()])
@pytest.mark.parametrize("access_change, code", [("session", "session_required"), ("run", "run_expired")])
async def test_access_loss_preserves_unknown_provider_outcome(application_harness, failure, access_change, code):
    h = application_harness
    h.state.failure = failure

    def lose_access():
        if access_change == "session":
            h.state.revoked = True
        else:
            run = h.session.operations[(h.user.id, report.RUN_SCOPE, h.data["runId"])]
            run.response = {**run.response, "authorizationExpiresAt": report.iso(now() - timedelta(seconds=1))}

    h.state.after_dispatch = lose_access
    expected = asyncio.CancelledError if isinstance(failure, asyncio.CancelledError) else ApiError
    with pytest.raises(expected):
        await h.invoke()
    receipt = deepcopy(h.session.final_operation.response)
    assert receipt["status"] == "outcome_unknown" and receipt["content"] is None
    assert receipt["errorCode"] == code and receipt["usage"] is None and h.state.calls == 1
    assert h.session.commits[-1][(h.user.id, report.SCOPE, receipt["id"])] == receipt
    if access_change == "session":
        # A fresh session may inspect/replay its original receipt, never dispatch it again.
        h.state.revoked = False
        assert await h.invoke() == receipt and h.state.calls == 1


@pytest.mark.parametrize("kind", ["section", "run"])
async def test_receipt_read_rechecks_session_after_account_lock(application_harness, monkeypatch, kind):
    h = application_harness
    made = await h.invoke()
    before = len(h.session.commits)
    assert not h.state.revoked  # The route's initial authentication succeeded.

    def revoked_while_waiting_for_account_lock(*args):
        h.state.revoked = True

    monkeypatch.setattr(h.sut, "lock_user", revoked_while_waiting_for_account_lock)
    with pytest.raises(ApiError) as denied:
        if kind == "section":
            h.sut.receipt(section_id=made["id"], user=h.user, session=h.session, check_session=h.check_session)
        else:
            h.sut.run_receipt(run_id=made["runId"], user=h.user, session=h.session, check_session=h.check_session)
    assert denied.value.code == "session_required" and h.state.checks[-1] is True
    assert len(h.session.commits) == before
    assert h.session.final_operation.response == made
    # Reconciliation is still available to a fresh session even if its model changed.
    monkeypatch.setattr(h.sut, "lock_user", lambda *args: None)
    h.state.revoked, h.session.fresh_revision = False, 2
    assert h.sut.receipt(section_id=made["id"], user=h.user, session=h.session, check_session=h.check_session) == made
    assert h.state.calls == 1


async def test_project_edit_revocation_discards_late_body(application_harness, monkeypatch):
    h = application_harness
    checks = []

    def project_access(session, user, project_id, *, edit=False):
        checks.append(edit)
        if h.state.revoked:
            raise ApiError(403, "permission_denied", "当前项目权限不能生成报告。")

    monkeypatch.setattr(h.sut, "_project", project_access)
    h.state.after_dispatch = lambda: setattr(h.state, "revoked", True)
    with pytest.raises(ApiError) as denied:
        await h.invoke()
    assert denied.value.code == "permission_denied" and checks == [True, True]
    assert h.session.final_operation.response["content"] is None
    assert h.session.final_operation.response["usage"] == {"inputTokens": 51, "outputTokens": 13}


async def test_secret_input_never_dispatches_and_secret_output_keeps_only_actual_usage(application_harness):
    h = application_harness
    original = h.data["prompt"]
    h.data["prompt"] = "误贴凭据 " + json.dumps(h.key)
    with pytest.raises(ApiError) as denied:
        await h.invoke()
    assert denied.value.code == "sensitive_input" and h.state.calls == 0 and not h.session.events
    # The real database dependency rolls back a rejected transaction; clear this
    # test double's uncommitted reservation before trying a separate request.
    h.session.operations.pop((h.user.id, report.SCOPE, h.data["idempotencyKey"]))
    h.data["prompt"] = original
    h.state.raw = Completion(json.dumps({"paragraphs": [{"text": h.key}]}))
    h.state.raw.usage = {"inputTokens": 8, "outputTokens": 5}
    made = await h.invoke()
    assert made["status"] == "failed" and made["content"] is None and made["errorCode"] == "invalid_response"
    assert made["usage"] == {"inputTokens": 8, "outputTokens": 5} and h.key not in json.dumps(made)


async def test_expired_lease_is_not_promoted_by_a_late_answer(application_harness):
    h = application_harness
    h.state.after_dispatch = lambda: setattr(h.session.final_operation, "response", {
        **h.session.final_operation.response, "createdAt": report.iso(now() - timedelta(seconds=121))})
    made = await h.invoke()
    assert made["status"] == "outcome_unknown" and made["content"] is None and made["usage"] == {"inputTokens": 51, "outputTokens": 13}


def test_preflight_replay_does_not_extend_authorization(application_harness):
    h = application_harness
    original = h.session.operations[(h.user.id, report.RUN_SCOPE, h.data["runId"])]
    before = deepcopy(original.response)
    assert h.sut.preflight(user=h.user, session=h.session, check_session=h.check_session, raw_data=report.context(h.data)) == before
    original.response = {**before, "authorizationExpiresAt": report.iso(now() - timedelta(seconds=1))}
    with pytest.raises(ApiError) as denied:
        h.sut.preflight(user=h.user, session=h.session, check_session=h.check_session, raw_data=report.context(h.data))
    assert denied.value.code == "run_expired" and h.state.calls == 0


def test_preflight_never_persists_credentials_in_caller_supplied_metadata(application_harness):
    h = application_harness
    data = {**report.context(h.data), "runId": str(uuid4()), "inputRevision": json.dumps(h.key)}
    with pytest.raises(ApiError) as denied:
        h.sut.preflight(user=h.user, session=h.session, check_session=h.check_session, raw_data=data)
    assert denied.value.code == "sensitive_input"
    assert (h.user.id, report.RUN_SCOPE, data["runId"]) not in h.session.operations
    assert h.state.calls == 0


def test_all_four_http_endpoints_require_a_session_without_connecting_to_database(settings):
    with TestClient(create_app(settings)) as client:
        for path, body in (("/api/agent/report-sections/preflight", preflight()), ("/api/agent/report-sections", request())):
            response = client.post(path, json=body)
            assert response.status_code == 401 and response.json()["error"]["code"] == "session_required"
        for path in ("/api/agent/report-sections/", "/api/agent/report-runs/"):
            response = client.get(path + str(uuid4()))
            assert response.status_code == 401 and response.json()["error"]["code"] == "session_required"
