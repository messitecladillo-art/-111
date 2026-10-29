import json

import pytest
from shared.errors import ApiError

from multi_agent.agents.research_agent.services import project_memory as memory


def empty_intent():
    return {field: {"value": "", "status": "unknown"} for field in memory.INTENT_FIELDS}


def doc():
    return {"schemaVersion": 1, "intent": empty_intent(), "decisions": [], "openQuestions": []}


def test_empty_document_is_valid_and_seed_keeps_the_title():
    value = memory.document(doc())
    assert value["intent"]["title"]["status"] == "unknown"
    seeded = memory.seed("社区体育设施研究")
    assert seeded["intent"]["title"] == "社区体育设施研究"
    assert seeded["source"]["kind"] == "import"


def test_unknown_fields_and_long_intent_are_rejected():
    extra = {**doc(), "extra": True}
    with pytest.raises(ApiError):
        memory.document(extra)
    bad = doc()
    bad["intent"]["title"] = {"value": "x" * 601, "status": "confirmed"}
    with pytest.raises(ApiError):
        memory.document(bad)


def test_brief_lists_only_effective_entries_and_stays_compact():
    value = doc()
    value["intent"]["title"] = {"value": "社区体育设施研究", "status": "confirmed"}
    value["decisions"] = [
        {"id": "d1", "statement": "分层抽样", "rationale": "街道差异大", "scope": "sampling", "status": "confirmed"},
        {"id": "d2", "statement": "旧方案", "rationale": "已取代", "scope": "sampling", "status": "superseded"},
    ]
    value["openQuestions"] = [
        {"id": "q1", "question": "要补样吗", "why": "老年样本可能不足", "next": "看年龄分布", "status": "open", "createdAt": "2026-10-29T00:00:00Z"},
        {"id": "q2", "question": "已解决", "why": "", "next": "", "status": "resolved", "createdAt": "2026-10-29T00:00:00Z"},
    ]
    brief = memory.brief(value, revision=2)
    assert brief["revision"] == 2
    assert brief["intent"]["title"] == "社区体育设施研究"
    assert [item["id"] for item in brief["decisions"]] == ["d1"]
    assert [item["id"] for item in brief["openQuestions"]] == ["q1"]
    assert len(json.dumps(brief, ensure_ascii=False)) <= memory.MAX_BRIEF_CHARS


def test_content_hash_is_stable_for_the_same_document():
    assert memory.content_hash(doc()) == memory.content_hash(doc())
    changed = doc()
    changed["intent"]["title"] = {"value": "新题目", "status": "confirmed"}
    assert memory.content_hash(changed) != memory.content_hash(doc())
