"""Unit tests for proposals prompt and parse_proposal default 3..8 and signaled up-to-32 contracts."""
import json

import pytest

from multi_agent.agents.survey_agent.services import proposals
from shared.errors import ProviderFailure


def _make_raw(count: int) -> str:
    items = [
        {
            "text": f"题项 {i}：您对服务维度 {i} 的认可程度如何？",
            "type": "likert" if i > 2 else "single",
            "choices": [] if i > 2 else ["选项一", "选项二"],
            "researchQuestion": f"RQ{i}",
            "decisionUse": f"支持决策 {i}",
        }
        for i in range(1, count + 1)
    ]
    return json.dumps(
        {
            "title": "消费者体验拟议问卷",
            "objective": "评估服务关键体验维度",
            "population": "近期服务使用人群",
            "items": items,
        },
        ensure_ascii=False,
    )


def test_default_proposal_contract_stays_three_to_eight_items():
    p = proposals.prompt({"topic": "社区生鲜配送满意度"})
    assert "3至8题" in p and "互斥" in p and "不兼问" in p

    parsed = proposals.parse_proposal(_make_raw(5))
    assert len(parsed["questions"]) == 5

    for bad_count in (2, 9):
        with pytest.raises(ProviderFailure):
            proposals.parse_proposal(_make_raw(bad_count))


def test_rich_proposal_allows_up_to_32_items_when_signaled():
    p_dict = proposals.prompt({"topic": "新能源汽车使用体验", "itemCount": 24})
    assert "24题" in p_dict and "互斥" in p_dict and "不兼问" in p_dict

    p_str = proposals.prompt("请设计一份32题的完整问卷用于实证建模")
    assert "32题" in p_str and "互斥" in p_str and "不兼问" in p_str

    parsed_24 = proposals.parse_proposal(_make_raw(24), max_items=24)
    assert len(parsed_24["questions"]) == 24
    assert parsed_24["questions"][-1]["variable"] == "Q24"

    parsed_32 = proposals.parse_proposal(_make_raw(32), brief="需要32题完整问卷")
    assert len(parsed_32["questions"]) == 32
    assert parsed_32["questions"][-1]["variable"] == "Q32"

    with pytest.raises(ProviderFailure):
        proposals.parse_proposal(_make_raw(33), max_items=32)
