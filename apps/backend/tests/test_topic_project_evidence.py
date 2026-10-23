"""Search excerpts remain private, versioned source snapshots through project saves."""
import copy
import json
from pathlib import Path

import pytest

from shared.errors import ApiError
from multi_agent.agents.research_agent.services.topic_projects import topic_document


def document():
    fixture = Path(__file__).parents[3] / "packages/evi-x-shared/fixtures/topic-project-v1.json"
    base = next(case["document"] for case in json.loads(fixture.read_text(encoding="utf-8"))["cases"] if case["valid"])
    value = copy.deepcopy(base)
    source = {"id": "lookup-89a51370-8659-4ce8-858a-a9aab9a9a7bb-0", "title": "武汉公开线索（合成测试）", "url": "https://example.test/wuhan", "locator": "查询：武汉 就业 政策\n检索时间：2026-10-19T01:23:45Z\n搜索片段，尚未核对原文与事件日期", "coverage": "search_excerpt", "publishedAt": "", "retrievedAt": "2026-10-19", "snippet": "合成片段，仅验证来源保存 🧭"}
    value["brief"]["sources"] = [source]
    value["provenance"]["sourceIds"] = [source["id"]]
    value["verification"] = []
    return value


def test_search_snapshot_and_legacy_source_both_round_trip():
    value = document()
    assert topic_document(value) == value
    assert topic_document(json.loads(json.dumps(value, ensure_ascii=False))) == value
    del value["brief"]["sources"][0]["snippet"]
    value["brief"]["sources"][0]["coverage"] = "reference"
    assert topic_document(value) == value


def test_snapshot_limits_match_browser_utf16_units():
    value = document()
    source = value["brief"]["sources"][0]
    source["url"] = "https://example.test/" + "x" * (2048 - len("https://example.test/"))
    source["snippet"] = "🧭" * 2000
    assert topic_document(value) == value
    source["snippet"] += "x"
    with pytest.raises(ApiError):
        topic_document(value)


@pytest.mark.parametrize("field,bad", [("url", "javascript:alert(1)"), ("coverage", "verified_fact"), ("retrievedAt", "2026-02-30"), ("snippet", {"injected": True})])
def test_invalid_search_source_never_reaches_saved_version(field, bad):
    value = document()
    value["brief"]["sources"][0][field] = bad
    with pytest.raises(ApiError):
        topic_document(value)
