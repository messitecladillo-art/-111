"""A report section drafted by the 证见 Agent: what a request may carry, what the prompt holds, what a draft may say."""
import json
from uuid import uuid4

import pytest

from multi_agent.agents.writing_agent.services import section_draft as draft
from shared.errors import ApiError, ProviderFailure


def request(**extra):
    data = {"schemaVersion": 1, "idempotencyKey": str(uuid4()),
            "section": {"node": "sample.profile", "title": "样本特征分析", "purpose": "描述样本结构并说明代表性。",
                        "moves": ["先总述有效样本", "再分述各项人口特征"], "needs": ["图"], "length": [400, 900]},
            "project": {"title": "社区体育设施满意度调查（教学模拟）", "objective": "找出设施改进的优先次序", "population": "本市常住居民"},
            "facts": [{"id": "F1", "text": "「受访者构成」：有效样本 212 人（共 240 人）"}, {"id": "F2", "text": "「受访者构成」：女性占 54.2%"}],
            "findings": [{"title": "高年级满意度更低", "interpretation": "差异来自开放时间。", "scope": "仅限本校。", "action": "延长开放时间。"}],
            "existing": "", "serviceId": str(uuid4()), "serviceRevision": 1, "consent": True}
    data.update(extra)
    return data


def test_a_valid_request_is_kept_exactly_and_the_prompt_holds_the_section_and_the_number_rule():
    data = request()
    assert draft.request_input(data) == data
    prompt = draft.draft_prompt(data)
    assert "不可信资料" in prompt and "样本特征分析" in prompt and "{F编号}" in prompt and "不得自己写任何阿拉伯数字" in prompt
    assert "本节建议共 400 到 900 字" in prompt
    assert json.loads(prompt.split("资料JSON：", 1)[1])["facts"] == data["facts"]
    assert draft.input_fingerprint(data) == draft.input_fingerprint({**data, "idempotencyKey": str(uuid4())})


@pytest.mark.parametrize("change", [
    {"schemaVersion": 2}, {"idempotencyKey": "x"}, {"facts": [{"id": "F0", "text": "x"}]}, {"facts": [{"id": "F1", "text": "a"}, {"id": "F1", "text": "b"}]},
    {"facts": [{"id": "F1", "text": "x" * 161}]}, {"facts": [{"id": f"F{i + 1}", "text": "x"} for i in range(draft.MAX_FACTS + 1)]},
    {"existing": "x" * 3001}, {"section": {**request()["section"], "length": [900, 400]}}, {"section": {**request()["section"], "moves": ["x"] * 9}},
    {"findings": [{"title": "x"}]}, {"project": {"title": "x"}}, {"extra": 1},
])
def test_a_malformed_request_is_refused(change):
    with pytest.raises(ApiError):
        draft.request_input(request(**change))


def test_consent_and_size_are_explained():
    with pytest.raises(ApiError) as refused:
        draft.request_input(request(consent=False))
    assert refused.value.code == "consent_required"
    with pytest.raises(ApiError) as large:
        draft.request_input(request(facts=[{"id": f"F{i + 1}", "text": "长" * 160} for i in range(80)], existing="长" * 3000,
                                    findings=[{"title": "长" * 80, "interpretation": "长" * 600, "scope": "长" * 300, "action": "长" * 300}] * 20))
    assert large.value.code == "input_too_large"


def test_a_draft_keeps_only_paragraphs_whose_numbers_are_all_facts():
    raw = "```json\n" + json.dumps({"paragraphs": [
        {"text": "本次调查有效样本为{F1}，其中{F2}。"},
        {"text": "调查覆盖了 5 个街道。"},
        {"text": "调查覆盖了５个街道。"},
        {"text": "引用了不存在的{F9}。"},
        {"text": "样本结构与总体大体一致，但仍需（待补：总体的性别比例）。"},
    ]}, ensure_ascii=False) + "\n```"
    assert draft.parse_draft(raw, {"F1", "F2"}) == {"droppedParagraphs": 3, "paragraphs": [
        {"text": "本次调查有效样本为{F1}，其中{F2}。", "facts": ["F1", "F2"]},
        {"text": "样本结构与总体大体一致，但仍需（待补：总体的性别比例）。", "facts": []}]}


@pytest.mark.parametrize("raw", ["不是 JSON", json.dumps({"paragraphs": []}), json.dumps({"paragraphs": [{"text": "共 3 个"}]}),
                                 json.dumps({"paragraphs": "x"}), json.dumps({"paragraphs": [{"text": "好"}], "extra": 1}),
                                 pytest.param("x" * 70000, id="oversized")])
def test_a_draft_out_of_shape_or_with_nothing_left_is_an_invalid_response(raw):
    with pytest.raises(ProviderFailure) as failure:
        draft.parse_draft(raw, {"F1"})
    assert failure.value.code == "invalid_response"


def test_a_draft_keeps_at_most_eight_paragraphs_and_counts_the_rest():
    raw = json.dumps({"paragraphs": [{"text": f"第{'一二三四五六七八九十'[i]}段，引用{{F1}}。"} for i in range(10)]}, ensure_ascii=False)
    parsed = draft.parse_draft(raw, {"F1"})
    assert len(parsed["paragraphs"]) == draft.MAX_PARAGRAPHS and parsed["droppedParagraphs"] == 2


def test_the_receipt_starts_running_and_binds_the_request():
    data = request()
    receipt = draft.draft_receipt(data, "fixture")
    assert receipt["status"] == "running" and receipt["modelCalled"] is True and receipt["node"] == "sample.profile"
    assert receipt["inputFingerprint"] == draft.input_fingerprint(data) and receipt["paragraphs"] == [] and receipt["createdAt"].endswith("Z")


def test_a_secret_is_found_in_decoded_text_or_a_property_name():
    assert draft.contains_secret({"facts": [{"id": "F1", "text": "密钥 sk-123"}]}, "sk-123")
    assert draft.contains_secret({"sk-123": 1}, "sk-123")
    assert not draft.contains_secret({"facts": []}, "sk-123")


def test_a_summarising_section_carries_an_outline_and_is_told_to_add_nothing_new():
    outline = [{"title": "样本特征分析", "excerpt": "受访者以高年级学生为主。"}, {"title": "回归模型分析", "excerpt": "课程评价与满意度正相关。"}]
    data = request(section={**request()["section"], "node": "abstract", "title": "摘要"}, outline=outline)
    assert draft.request_input(data) == data
    prompt = draft.draft_prompt(data)
    assert "只能复述其中已有的方法、发现与建议" in prompt and "摘录里的数字同样不能照抄" in prompt
    assert json.loads(prompt.split("资料JSON：", 1)[1])["outline"] == outline
    plain = request()
    assert "outline" not in draft.draft_prompt(plain) and draft.input_fingerprint(data) != draft.input_fingerprint({**data, "outline": outline[:1]})
    for bad in ([{"title": "x"}], [{"title": "", "excerpt": "x"}], [{"title": "x", "excerpt": "长" * 401}], [{"title": "x", "excerpt": ""}] * 61, "x"):
        with pytest.raises(ApiError):
            draft.request_input(request(outline=bad))
