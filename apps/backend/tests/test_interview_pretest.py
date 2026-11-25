"""Unit tests for interview_pretest focus candidate supplementation and route condition notification."""
import json

import pytest

from multi_agent.agents.survey_agent.services import interview_pretest
from shared.errors import ApiError
from tests.test_contracts import blank


def _q(qid, variable, kind="single", text="题干", choices=(("1", "是"), ("2", "否")), condition=None, purpose="research"):
    return {
        "id": qid,
        "variable": variable,
        "text": text,
        "type": kind,
        "required": True,
        "purpose": purpose,
        "researchQuestion": "RQ1",
        "construct": "构念",
        "analysis": "description",
        "decisionUse": "决策",
        "source": "自编",
        "choices": [{"code": c, "label": l} for c, l in choices],
        "min": 1 if kind == "likert" else None,
        "max": 5 if kind == "likert" else None,
        "minLabel": "非常不同意" if kind == "likert" else "",
        "maxLabel": "非常同意" if kind == "likert" else "",
        "reverse": False,
        "condition": condition,
    }


def _routed_design():
    d = blank()
    d["title"] = "社区数字服务使用体验问卷"
    d["objective"] = "评估使用门槛与改进方向"
    d["population"] = "本市常住居民"
    d["questions"] = [
        _q("q-use", "Q1", "single", "您过去30天是否使用过社区数字服务？", (("1", "经常使用"), ("2", "偶尔使用"), ("3", "未使用")), purpose="screening"),
        _q("q-age", "Q2", "single", "您的年龄段是？", (("1", "18-35岁"), ("2", "36岁及以上")), purpose="background"),
        _q("q-pipe", "Q3", "likert", "在{情境}下操作是否顺畅？", (), condition={"questionId": "q-use", "codes": ["1", "2"]}),
        _q("q-text", "Q4", "text", "请写下您的开放建议。", (), condition={"questionId": "q-use", "codes": ["1", "2"]}),
        _q("q-sat1", "Q5", "likert", "该服务界面字体与指引清晰直观。", (), condition={"questionId": "q-use", "codes": ["1", "2"]}),
        _q("q-sat2", "Q6", "likert", "该服务办理流程步骤简洁。", (), condition={"questionId": "q-use", "codes": ["1", "2"]}),
        _q("q-ch", "Q7", "multi", "您最常用哪类功能？", (("1", "预约"), ("2", "缴费"), ("3", "咨询")), condition={"questionId": "q-use", "codes": ["1", "2"]}),
        _q("q-extra1", "Q8", "likert", "问题反馈响应及时。", (), condition={"questionId": "q-use", "codes": ["1", "2"]}),
        _q("q-extra2", "Q9", "likert", "操作提示准确易懂。", (), condition={"questionId": "q-use", "codes": ["1", "2"]}),
    ]
    return d


def test_focus_candidates_supplements_up_to_six_with_core_routed_items_only_when_unconditional_lt_six():
    d = _routed_design()
    candidates = interview_pretest._focus_candidates(d)
    assert [q["id"] for q in candidates] == ["q-use", "q-age", "q-sat1", "q-sat2", "q-extra1", "q-extra2"]
    assert all("{情境}" not in q["text"] for q in candidates)

    # When >= 6 unconditional items already exist, routed items are not added.
    full = blank()
    full["title"] = "完整非路由问卷"
    full["questions"] = [_q(f"u{i}", f"Q{i}", "likert", f"题干{i}", ()) for i in range(1, 7)] + [
        _q("r1", "Q7", "likert", "条件题", (), condition={"questionId": "u1", "codes": ["1"]})
    ]
    assert [q["id"] for q in interview_pretest._focus_candidates(full)] == [f"u{i}" for i in range(1, 7)]

    # Empty/template-only questionnaire still refuses.
    empty = blank()
    empty["questions"] = [_q("t1", "Q1", "likert", "在{情境}中体验如何？", ())]
    with pytest.raises(ApiError) as exc:
        interview_pretest.pretest_plan({"topic": "测试", "design": empty})
    assert exc.value.code == "no_focus_questions"


@pytest.mark.asyncio
async def test_run_pretest_notifies_respondent_of_route_condition_for_routed_focus_items():
    d = _routed_design()
    plan = interview_pretest.pretest_plan({"topic": "社区数字服务使用体验", "design": d})
    seen_payloads = []
    personas = [
        {"id": "p1", "label": "高频用户", "background": "经常使用社区数字服务", "rationale": "检验高频使用视角"},
        {"id": "p2", "label": "低频用户", "background": "偶尔使用一次", "rationale": "检验低频回忆口径"},
        {"id": "p3", "label": "老年新手", "background": "在子女帮助下使用", "rationale": "检验术语可读性"},
    ]

    async def ask(stage, payload, prompt):
        seen_payloads.append((stage, payload, prompt))
        if stage == "roster":
            routed_q = next(q for q in payload["questions"] if q["id"] == "q-sat1")
            assert "经常使用" in routed_q["routeCondition"] and "偶尔使用" in routed_q["routeCondition"]
            return json.dumps({"personas": personas, "questionIds": ["q-use", "q-sat1"]}, ensure_ascii=False)
        if stage == "interview":
            routed_view = next(q for q in payload["questions"] if q["id"] == "q-sat1")
            assert "经常使用" in routed_view["routeCondition"]
            assert "routeCondition" in prompt
            return json.dumps({
                "answers": [
                    {"questionId": "q-use", "answer": "我最近用过一次预约功能。", "unclear": ""},
                    {"questionId": "q-sat1", "answer": "字体整体够大，但指引入口略深。", "unclear": "指引入口位置不确定"},
                ]
            }, ensure_ascii=False)
        if stage == "followup":
            anchor = payload["turns"][1]
            return json.dumps({
                "questionId": "q-sat1",
                "turnId": anchor["id"],
                "quote": "指引入口略深",
                "prompt": "你刚才说的指引入口略深具体指哪一步？",
                "answer": "点开服务后找不到文字帮助链接。",
                "unclear": "",
            }, ensure_ascii=False)
        if stage == "revise":
            t = payload["transcripts"][0]
            fu = next(turn for turn in t["turns"] if "anchor" in turn)
            return json.dumps({
                "revisions": [{
                    "questionId": "q-sat1",
                    "revised": "该服务界面字体大小与操作帮助指引均清晰直观。",
                    "reason": "明确指引所指为操作帮助指引。",
                    "evidence": [{"personaId": t["personaId"], "turnId": fu["id"], "quote": "找不到文字帮助链接"}],
                }]
            }, ensure_ascii=False)
        if stage == "retest":
            routed_retest = next(q for q in payload["questions"] if q["id"] == "q-sat1")
            assert "经常使用" in routed_retest["routeCondition"]
            return json.dumps({
                "answers": [
                    {"questionId": "q-use", "answer": "最近用过。", "unclear": ""},
                    {"questionId": "q-sat1", "answer": "新版表述清楚很多，我知道是看操作帮助。", "unclear": ""},
                ]
            }, ensure_ascii=False)
        raise AssertionError(stage)

    events = []

    async def emit(event):
        events.append(event)

    summary = await interview_pretest.run_pretest(plan, ask, emit)
    assert summary["revisionCount"] == 1
    assert any(stage == "interview" for stage, _, _ in seen_payloads)
    revision_ev = next(e for e in events if e["type"] == "revision")
    assert revision_ev["design"]["questions"][4]["text"] == "该服务界面字体大小与操作帮助指引均清晰直观。"
