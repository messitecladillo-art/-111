import copy
import csv
import io
from types import SimpleNamespace

import pytest

from shared.errors import ApiError
from shared.contracts import canonical
from infrastructure.database.models import now
from multi_agent.agents.survey_agent.services.surveys import publishable_design, public_design, validate_answers, dataset_view, MAX_DATASET_BYTES


def question(qid="choice", variable="Q1", kind="single", **changes):
    return {"id": qid, "variable": variable, "text": "题目", "type": kind, "required": True,
            "purpose": "research", "researchQuestion": "私有研究问题", "construct": "态度", "analysis": "description",
            "decisionUse": "私有决策", "source": "私有来源", "choices": [{"code": "yes", "label": "是"}, {"code": "no", "label": "否"}],
            "min": 1, "max": 5, "minLabel": "低", "maxLabel": "高", "reverse": False, "condition": None, **changes}


def design():
    return {"schema": "questionnaire-design/v1", "classification": "proposed", "title": "合成回收验收问卷", "objective": "私有目标",
            "population": "合成受访者", "geography": "合成地区", "period": "2026", "recruitment": "合成流程", "introduction": "合成测试问卷，可自愿选择参加。",
            "pilotNotes": "私有预试记录", "questions": [question(), question("score", "Q2", "likert", condition={"questionId": "choice", "codes": ["yes"]}),
                                                     question("multi", "Q3", "multi", required=False), question("text", "Q4", "text", required=False),
                                                     question("number", "Q5", "number", required=False, min=-5, max=100)]}


def test_public_projection_and_semantic_publication_checks():
    value = design()
    assert publishable_design(value) == value
    projected = canonical(public_design(value))
    for private in ("私有", "pilotNotes", "analysis", "variable", "source", "objective"):
        assert private not in projected
    mutations = [lambda d: d.update(title=""), lambda d: d.update(introduction=""), lambda d: d.update(questions=[]),
                 lambda d: d["questions"][1].update(variable="q1"), lambda d: d["questions"][0].update(text=""),
                 lambda d: d["questions"][0]["choices"][0].update(code="semi;code"),
                 lambda d: d["questions"][0]["choices"][1].update(code="yes"),
                 lambda d: d["questions"][0]["choices"][1].update(label="是"),
                 lambda d: d["questions"][1].update(min=5,max=1), lambda d: d["questions"][1].update(min=1.5),
                 lambda d: d["questions"][1].update(minLabel=""), lambda d: d["questions"][0].update(reverse=True),
                 lambda d: d["questions"][0].update(condition={"questionId": "score", "codes": ["yes"]}),
                 lambda d: d["questions"][1].update(condition={"questionId": "choice", "codes": ["other"]}),
                 lambda d: d["questions"][4].update(min=8,max=2)]
    for mutate in mutations:
        invalid = copy.deepcopy(value)
        mutate(invalid)
        with pytest.raises(ApiError):
            publishable_design(invalid)


@pytest.mark.parametrize("answers", [
    {}, {"choice": "other"}, {"choice": 1}, {"choice": "yes"}, {"choice": "yes", "score": 3.5},
    {"choice": "yes", "score": True}, {"choice": "no", "score": 3}, {"choice": "no", "extra": "bad"},
    {"choice": "no", "multi": ["yes", "yes"]}, {"choice": "no", "multi": ["other"]},
    {"choice": "no", "multi": [["yes"]]}, {"choice": "no", "text": 12},
    {"choice": "no", "text": "😀" * 1001}, {"choice": "no", "number": float("inf")},
    {"choice": "no", "number": -6}, {"choice": "no", "number": "10"},
])
def test_invalid_answers(answers):
    with pytest.raises(ApiError):
        validate_answers(public_design(design()), answers)


def test_optional_missing_zero_and_multiselect_do_not_change_semantics():
    values, shown = validate_answers(public_design(design()), {"choice": "no", "score": None, "multi": ["no", "yes"], "number": 0, "text": ""})
    assert values == {"choice": "no", "score": None, "multi": ["yes", "no"], "number": 0, "text": None}
    assert shown == {"choice": True, "score": False, "multi": True, "number": True, "text": True}
    value = design()
    value["questions"][1] = question("gate", "Q2", condition={"questionId": "choice", "codes": ["yes"]})
    value["questions"][2]["condition"] = {"questionId": "gate", "codes": ["yes"]}
    publishable_design(value)
    _, visible = validate_answers(public_design(value), {"choice": "no"})
    assert visible["gate"] is False and visible["multi"] is False


def fake_release(value, count=1, answer_bytes=100):
    return SimpleNamespace(id="synthetic-release",project_id="synthetic-project",version_id="synthetic-version",questionnaire_revision=1,
                           revision=1,status="open",token="s"*43,public_design=public_design(value),classification="synthetic",
                           response_count=count,response_bytes=answer_bytes,created_at=now(),closed_at=None)


def test_export_is_version_bound_lossless_and_spreadsheet_safe():
    value = design()
    answers, visible = validate_answers(public_design(value), {"choice": "no", "multi": ["no", "yes"], "text": '=HYPERLINK("x")\n中文😀', "number": -2})
    response = SimpleNamespace(id="synthetic-response",created_at=now(),answers=answers,visibility=visible)
    release = fake_release(value)
    out = dataset_view(release,value,[response])
    raw, safe = [list(csv.reader(io.StringIO(out[key]))) for key in ("csv","downloadCsv")]
    columns = raw[0]
    assert raw[1][columns.index("Q4")] == answers["text"]
    assert safe[1][columns.index("Q4")] == "'" + answers["text"]
    assert safe[1][columns.index("Q5")] == "-2"
    assert raw[1][columns.index("Q3")] == "yes;no"
    assert raw[1][columns.index("Q2")] == "" and raw[1][columns.index("__shown_score")] == "0"
    assert out["sha256"] == dataset_view(release,value,[response])["sha256"]
    response.answers["number"] = 5
    assert out["sha256"] != dataset_view(release,value,[response])["sha256"]


@pytest.mark.parametrize("payload", ['"' * 2000, "中文😀" * 500, "=\"\\\r\n" * 350])
def test_adversarial_export_stays_inside_capacity(payload):
    value = design()
    value["questions"] = [question(f"q{i}",f"Q{i}","text",required=False) for i in range(80)]
    # Fill the exact aggregate answer budget, including 80-column visibility and CSV/JSON escaping.
    answers = {q["id"]: None for q in value["questions"]}
    answers["q0"] = payload
    byte_count = len(canonical(answers).encode())
    count = min(5000, 2097152 // byte_count)
    responses = [SimpleNamespace(id=f"synthetic-{i:036}",created_at=now(),answers=answers,visibility={q["id"]: True for q in value["questions"]}) for i in range(count)]
    out = dataset_view(fake_release(value,count,count*byte_count),value,responses)
    assert len(canonical(out).encode()) < MAX_DATASET_BYTES
    assert out["rowCount"] == count
