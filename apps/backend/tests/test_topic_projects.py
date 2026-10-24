"""The project topic contract validates editable plans, not claimed fieldwork."""
import copy

import pytest

from shared.errors import ApiError
from multi_agent.agents.research_agent.services.topic_projects import MAX_DOCUMENT_BYTES, confirmable, topic_document


def document():
    return {
        "schemaVersion": 1,
        "profile": {"region": "湖北省", "city": "武汉市", "school": "", "schoolContext": [], "discipline": "", "interests": [], "domains": ["employment"], "days": None, "budgetYuan": None, "access": {}, "resources": {}, "sensitiveData": "avoid", "referenceDate": "2026-10-15", "competitionWindow": None},
        "candidate": None,
        "shortlistIds": ["local-work"],
        "selected": {"kind": "pattern", "id": "local-work", "title": "合成验收选题"},
        "brief": {
            "title": "合成验收：就业服务选择😀", "decisionOwner": "公共就业服务团队", "decision": "选择下一轮服务的优先项目", "population": "计划求职的受访者", "geography": "武汉市（软件验收场景）", "inclusion": "计划在研究地区求职", "exclusion": "不在研究对象范围内", "evidencePlan": "先验证招募渠道，再制定调查计划。",
            "questions": [{"id": "rq-1", "text": "不同人群需要哪类服务？"}],
            "constructs": [{"id": "need", "name": "服务需求", "questionIds": ["rq-1"]}],
            "differentiators": ["区分服务类型"], "unknowns": ["渠道尚未确认"], "firstWeekPlan": ["联系目标对象核实招募渠道"],
            "sources": [{"id": "source-1", "title": "合成验收来源", "url": "https://example.test/source", "locator": "测试段落", "coverage": "reference", "publishedAt": "2026-10-01", "retrievedAt": "2026-10-15"}],
        },
        "verification": [{"id": "check-1", "title": "核实招募渠道", "status": "planned", "note": "尚未开展实际调查。", "sourceRefs": ["source-1"], "recordedAt": None}],
        "provenance": {"catalogVersion": "test-catalog-1", "modelVersion": "test-model-1", "sourceIds": ["source-1"]},
    }


def test_complete_and_empty_drafts_are_roundtripped_without_inventing_fieldwork():
    value = document()
    value["brief"]["decision"] = "  保留用户段落与换行\n第二行  "
    assert topic_document(value) == value
    assert confirmable(value) is None
    value["brief"].update(title="", decisionOwner="", decision="", population="", geography="", questions=[], constructs=[], sources=[])
    value.update(candidate=None, selected=None, shortlistIds=[], verification=[])
    value["provenance"]["sourceIds"] = []
    assert topic_document(value) == value
    with pytest.raises(ApiError) as failure:
        confirmable(value)
    assert failure.value.code == "brief_incomplete"


def test_candidate_contract_matches_existing_topic_candidate_v1():
    value = document()
    value["candidate"] = {"title": "自拟题目", "decisionOwner": "", "decision": "", "population": "", "geography": "", "accessNeeds": ["campus_students"], "resourceNeeds": ["questionnaire"], "evidencePlan": "", "differentiators": [], "action": "", "sensitive": False}
    value["selected"] = {"kind": "custom", "id": "user-candidate", "title": "自拟题目"}
    assert topic_document(value) == value
    for patch in ({"sensitive": 0}, {"serviceId": "private"}, {"accessNeeds": ["guessed_access"]}, {"resourceNeeds": ["apiKey"]}, {"title": "😀" * 101}):
        bad = copy.deepcopy(value)
        bad["candidate"].update(patch)
        with pytest.raises(ApiError):
            topic_document(bad)


@pytest.mark.parametrize("path", [(), ("profile",), ("brief",), ("provenance",), ("selected",), ("brief", "questions", 0), ("brief", "constructs", 0), ("brief", "sources", 0), ("verification", 0)])
def test_unknown_and_missing_fields_are_rejected_at_every_level(path):
    value = document()
    target = value
    for part in path:
        target = target[part]
    target["privateServiceConfig"] = "forbidden"
    with pytest.raises(ApiError):
        topic_document(value)
    del target["privateServiceConfig"]
    del target[next(iter(target))]
    with pytest.raises(ApiError):
        topic_document(value)


@pytest.mark.parametrize("mutation", [
    lambda d: d.update(schemaVersion=True),
    lambda d: d["profile"].update(days=True),
    lambda d: d["profile"].update(days=10 ** 400),
    lambda d: d["profile"].update(referenceDate="2026-02-30"),
    lambda d: d["profile"].update(access={"campus_students": "assumed"}),
    lambda d: d["brief"].update(title="\ud800"),
    lambda d: d["brief"].update(title="\x7f"),
    lambda d: d["brief"].update(title="\x01"),
    lambda d: d.update(shortlistIds=["a", "b", "c", "d"]),
    lambda d: d.update(shortlistIds=["local-work", "local-work"]),
    lambda d: d["selected"].update(id="not-shortlisted"),
    lambda d: d["selected"].update(kind="official"),
    lambda d: d["brief"]["questions"].append(d["brief"]["questions"][0]),
    lambda d: d["brief"]["constructs"].append(d["brief"]["constructs"][0]),
    lambda d: d["brief"]["sources"].append(d["brief"]["sources"][0]),
    lambda d: d["verification"].append(d["verification"][0]),
    lambda d: d["brief"]["questions"][0].update(id="../path"),
    lambda d: d["brief"]["questions"][0].update(id="constructor"),
    lambda d: d["brief"]["constructs"][0].update(questionIds=["missing"]),
    lambda d: d["brief"]["constructs"][0].update(questionIds=["rq-1", "rq-1"]),
    lambda d: d["verification"][0].update(sourceRefs=["missing"]),
    lambda d: d["provenance"].update(sourceIds=["missing"]),
    lambda d: d["brief"]["sources"][0].update(coverage="verified"),
    lambda d: d["brief"]["sources"][0].update(publishedAt="2026-02-30"),
    lambda d: d["brief"]["sources"][0].update(url="javascript:alert(1)"),
    lambda d: d["brief"]["sources"][0].update(url="https://user:secret@example.test/"),
    lambda d: d["brief"]["sources"][0].update(url="https://example.test/has space"),
    lambda d: d["brief"]["sources"][0].update(url="https://[broken"),
    lambda d: d["verification"][0].update(status="passed"),
    lambda d: d["verification"][0].update(recordedAt="2026-10-15T10:00:00"),
    lambda d: d["verification"][0].update(recordedAt="tomorrow"),
])
def test_invalid_scalars_duplicate_ids_and_dangling_references_fail_closed(mutation):
    value = document()
    mutation(value)
    with pytest.raises(ApiError):
        topic_document(value)


def test_source_dates_can_be_unknown_and_verification_dates_require_timezones():
    value = document()
    value["brief"]["sources"][0].update(url="", publishedAt="", retrievedAt="")
    for timestamp in ("2026-10-15T10:00:00Z", "2026-10-15T18:00:00+08:00", None):
        value["verification"][0]["recordedAt"] = timestamp
        assert topic_document(value) == value


@pytest.mark.parametrize("key", ["title", "decisionOwner", "decision", "population", "geography"])
def test_confirmation_needs_minimal_research_brief_but_no_fabricated_fieldwork(key):
    value = document()
    value["brief"][key] = " \n "
    assert topic_document(value) == value
    with pytest.raises(ApiError) as failure:
        confirmable(value)
    assert failure.value.code == "brief_incomplete"


def test_confirmation_needs_an_actual_question_and_payload_limit_counts_utf8_bytes():
    value = document()
    value["brief"]["questions"][0]["text"] = " \t "
    with pytest.raises(ApiError):
        confirmable(value)
    value = document()
    source = value["brief"]["sources"][0]
    value["brief"]["sources"] = [{**source, "id": f"source-{i}", "title": "中" * 300, "locator": "中" * 1000, "url": "https://example.test/" + "a" * 1950} for i in range(40)]
    value["verification"] = [{"id": f"check-{i}", "title": "中" * 300, "status": "planned", "note": "中" * 3000, "sourceRefs": [], "recordedAt": None} for i in range(30)]
    assert MAX_DOCUMENT_BYTES == 300_000
    with pytest.raises(ApiError) as failure:
        topic_document(value)
    assert failure.value.status == 413
