"""Scripted Sichuan-Chongqing pepper culture pretest using fictional roles."""

import asyncio
import json
from copy import deepcopy
from threading import Event
from uuid import uuid4

import pytest

from multi_agent.agents.survey_agent.services import interview_pretest
from shared.errors import ProviderFailure
from tests.test_contracts import blank
from tests.test_silicon import entered, project, question, service_input, wait


TOPIC = "川渝辣文化消费体验与外地游客辣度提示"
QUESTION_ID = "q-spicy"
ORIGINAL = "最近一个月在川渝餐馆吃火锅，您点的火锅一般有多辣？"
REVISED = "过去 30 天在川渝餐馆点火锅时，您点的火锅通常是哪一档辣度？请按所到餐馆菜单的辣度标注作答。"
PERSONAS = (
    {
        "id": "p1",
        "label": "川渝常住居民",
        "background": "虚构角色，常和家人点火锅，习惯用店铺菜单的辣度比较。",
        "rationale": "用于排查不同餐馆辣度标尺的理解差异。",
    },
    {
        "id": "p2",
        "label": "首次来川渝的游客",
        "background": "虚构角色，来川渝旅游时试吃火锅，自评辣度耐受较低。",
        "rationale": "用于排查外地游客如何理解菜单辣度。",
    },
    {
        "id": "p3",
        "label": "在川渝读书的外地学生",
        "background": "虚构角色，常和同学聚餐，点单辣度取决于同行人。",
        "rationale": "用于排查个人耐受和多人点单之间的混淆。",
    },
)


def pepper_design():
    return {
        **blank(),
        "title": "川渝辣文化消费体验问卷 · 脚本验收",
        "objective": "排查辣度口径与火锅点单情境的理解差异。",
        "population": "近期在四川或重庆餐馆吃过火锅的成年人",
        "geography": "四川、重庆",
        "questions": [
            question(
                QUESTION_ID, "SPICE", text_=ORIGINAL,
                choices=(("plain", "不辣或清汤"), ("mild", "微辣"), ("medium", "中辣"), ("hot", "重辣"), ("none", "未在该时段点过火锅")),
            ),
            question("q-hints", "HINTS", "text", "菜单上的哪些辣度提示最容易理解？", ()),
        ],
    }


def scripted_response(stage, payload, *, bad_quote=None):
    """Return provider details to be validated and linked by the core."""
    if stage == "roster":
        return {"personas": list(PERSONAS), "questionIds": [q["id"] for q in payload["questions"]]}
    if stage == "interview":
        spice_answers = {
            "p1": ("不同店的微辣不一样，我不确定按哪家店作答。", "微辣的标尺未指定"),
            "p2": ("有的店写微微辣，我不确定是不是要归到微辣。", "菜单标注与答题选项不一致"),
            "p3": ("我按自己最近一次点单选择的中辣来回答。", ""),
        }
        spice_answer, unclear = spice_answers[payload["persona"]["id"]]
        return {"answers": [
            {
                "questionId": q["id"],
                "answer": spice_answer if q["id"] == QUESTION_ID else "给出菜品示例的菜单比较容易懂。",
                "unclear": unclear if q["id"] == QUESTION_ID else "",
            }
            for q in payload["questions"]
        ]}
    if stage == "followup":
        anchor = next(turn for turn in payload["turns"] if turn["questionId"] == QUESTION_ID)
        return {
            "questionId": QUESTION_ID,
            "turnId": anchor["id"],
            "quote": "脚本故意伪造的追问引文" if bad_quote == stage else anchor["answer"],
            "prompt": f"你提到“{anchor['answer']}”，你刚才是怎样在店铺菜单和题目选项之间做选择的？",
            "answer": "我先回想吃过的那家店，按菜单标的辣度回答。",
            "unclear": "",
        }
    if stage == "revise":
        transcript = payload["transcripts"][0]
        anchor = next(turn for turn in transcript["turns"] if "anchor" in turn)
        return {"revisions": [{
            "questionId": QUESTION_ID,
            "revised": REVISED,
            "reason": "明确回忆期，并用菜单标注统一辣度参照口径。",
            "evidence": [{
                "personaId": transcript["personaId"],
                "turnId": anchor["id"],
                "quote": "脚本故意伪造的修订引文" if bad_quote == stage else "按菜单标的辣度回答",
            }],
        }]}
    if stage == "retest":
        assert set(payload) == {"topic", "persona", "questions"}
        assert [(q["id"], q["text"]) for q in payload["questions"]] == [
            (QUESTION_ID, REVISED), ("q-hints", "菜单上的哪些辣度提示最容易理解？"),
        ]
        persona_id = payload["persona"]["id"]
        answer = {
            "p1": "我点的火锅在店铺菜单上通常标中辣。",
            "p2": "我点的火锅在菜单上标微微辣，这里依然没有该选项。",
            "p3": "我点的火锅在店铺菜单上通常标微辣。",
        }[persona_id]
        unclear = "微微辣与微辣是否可合并仍不清楚" if persona_id == "p2" else ""
        return {"answers": [
            {"questionId": QUESTION_ID, "answer": answer, "unclear": unclear},
            {"questionId": "q-hints", "answer": "菜单给出菜品示例时比较容易懂。", "unclear": ""},
        ]}
    raise AssertionError(f"unexpected provider stage: {stage}")


class ScriptedPepperProvider:
    def __init__(self, bad_quote=None):
        self.calls = []
        self.bad_quote = bad_quote

    async def ask(self, stage, payload, prompt):
        assert TOPIC in prompt
        self.calls.append(stage)
        return json.dumps(scripted_response(stage, payload, bad_quote=self.bad_quote), ensure_ascii=False)

    async def answer(self, _config, _key, prompt, spec):
        assert spec["mode"] == "interview_pretest"
        return await self.ask(spec["stage"], spec["input"], prompt)


def assert_pepper_events(events, design):
    assert all(event["classification"] == "simulated" for event in events)
    kinds = ("roster", "interview", "followup", "revision", "retest", "summary")
    by_type = {kind: [event for event in events if event["type"] == kind] for kind in kinds}
    roster, = by_type["roster"]
    assert set(roster["questionIds"]) == {QUESTION_ID, "q-hints"}
    assert {item["id"] for item in roster["personas"]} == {p["id"] for p in PERSONAS}
    interviews = {(event["personaId"], turn["id"]): turn for event in by_type["interview"] for turn in event["turns"]}
    assert len(interviews) == 6
    followups = {(event["personaId"], turn["id"]): turn for event in by_type["followup"] for turn in event["turns"]}
    assert len(followups) == 3
    for (persona_id, _), turn in followups.items():
        linked_turn = interviews[(persona_id, turn["anchor"]["turnId"])]
        assert linked_turn["questionId"] == turn["questionId"] == QUESTION_ID
        assert turn["anchor"]["quote"] in linked_turn["answer"]

    revision, = by_type["revision"]
    change, = revision["revisions"]
    assert (change["questionId"], change["original"], change["revised"]) == (QUESTION_ID, ORIGINAL, REVISED)
    evidence, = change["evidence"]
    assert evidence["quote"] in followups[(evidence["personaId"], evidence["turnId"])]["answer"]
    expected_proposal = deepcopy(design)
    expected_proposal["questions"][0]["text"] = REVISED
    assert revision["design"] == expected_proposal

    assert {event["personaId"] for event in by_type["retest"]} == {p["id"] for p in PERSONAS}
    for event in by_type["retest"]:
        result, = event["results"]
        before = interviews[(event["personaId"], result["baseline"]["turnId"])]
        assert (before["prompt"], result["prompt"]) == (ORIGINAL, REVISED)
        assert result["baseline"]["answer"] == before["answer"]
        assert result["baseline"]["unclear"] == before["unclear"]

    summary, = by_type["summary"]
    assert summary["retestedPersonaCount"] == 3
    assert summary["comparisons"] == [{
        "questionId": QUESTION_ID, "baselineUnclear": 2, "retestUnclear": 1, "personaCount": 3,
    }]
    assert events[0] == roster and events[-1] == summary


@pytest.mark.asyncio
async def test_pepper_culture_pretest_links_simulated_turns_and_retests_the_same_roles():
    original = pepper_design()
    source_snapshot = deepcopy(original)
    plan = interview_pretest.pretest_plan({"topic": TOPIC, "design": original})
    provider = ScriptedPepperProvider()
    events = []

    async def emit(event):
        events.append(event)

    summary = await interview_pretest.run_pretest(plan, provider.ask, emit)
    assert_pepper_events(events, source_snapshot)
    assert original == source_snapshot
    assert summary == events[-1]
    assert sorted(provider.calls) == sorted(["roster", "revise", *(["interview", "followup", "retest"] * 3)])


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_quote", ["followup", "revise"])
async def test_pretest_rejects_untraceable_simulated_quotes(bad_quote):
    provider = ScriptedPepperProvider(bad_quote)
    plan = interview_pretest.pretest_plan({"topic": TOPIC, "design": pepper_design()})
    events = []

    async def emit(event):
        events.append(event)

    with pytest.raises(ProviderFailure) as failure:
        await interview_pretest.run_pretest(plan, provider.ask, emit)
    assert failure.value.code == "invalid_response"
    assert not any(event["type"] in {"revision", "retest", "summary"} for event in events)


def start_data(client):
    response = client.post("/api/services", json=service_input())
    assert response.status_code == 201, response.text
    service = response.json()
    return {
        "topic": TOPIC,
        "design": pepper_design(),
        "serviceId": service["id"],
        "serviceRevision": service["revision"],
        "consent": True,
        "idempotencyKey": str(uuid4()),
    }


@pytest.mark.postgres
def test_pretest_pepper_api_is_private_idempotent_and_keeps_questionnaire_version(entered):
    _, open_client, fixture_provider = entered
    scripted = ScriptedPepperProvider()
    fixture_provider.answer = scripted.answer
    owner, _ = open_client()
    peer, _ = open_client("b@example.test")
    team = owner.get("/api/teams").json()["teams"][0]["id"]
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"}).status_code == 201
    project_url = f"/api/projects/{project(owner)['id']}"
    path = f"{project_url}/silicon-pretests"
    data = start_data(owner)
    saved = owner.post(f"{project_url}/questionnaire/versions", json={
        "design": data["design"], "expectedRevision": 0, "idempotencyKey": str(uuid4()),
    })
    assert saved.status_code == 201, saved.text

    assert owner.post(path, json={**data, "consent": False}).status_code == 422
    assert owner.post(path, json={**data, "serviceRevision": data["serviceRevision"] + 1}).status_code == 409
    assert scripted.calls == []

    started = owner.post(path, json=data)
    assert started.status_code == 202, started.text
    run_url = f"{path}/{started.json()['id']}"
    done = wait(owner, run_url)
    assert (done["status"], done["kind"], done["classification"], done["engine"]) == (
        "ready", "interview_pretest", "simulated", "fixture",
    )
    assert done["originalDesign"] == data["design"]
    assert_pepper_events(done["events"], data["design"])
    assert done["done"] == done["total"] == len(scripted.calls)
    assert "synthetic-private-model-key" not in json.dumps(done)
    assert owner.get(f"{project_url}/questionnaire").json()["questionnaire"] == saved.json()
    assert owner.get(f"{project_url}/silicon-runs").json()["runs"] == []

    dispatched = len(scripted.calls)
    assert owner.post(path, json=data).json()["id"] == done["id"]
    assert owner.post(path, json={**data, "topic": TOPIC + "（新版）"}).status_code == 409
    assert len(scripted.calls) == dispatched
    listing, = owner.get(path).json()["runs"]
    assert listing["id"] == done["id"]
    assert "events" not in listing and "originalDesign" not in listing
    assert peer.get(path).json()["runs"] == []
    assert peer.get(run_url).status_code == peer.post(f"{run_url}/cancel").status_code == 404


@pytest.mark.postgres
@pytest.mark.parametrize(
    ("mode", "status", "error"),
    [("timeout", "outcome_unknown", "provider_timeout"), ("bad_quote", "failed", "invalid_response")],
)
def test_pretest_api_preserves_outcome_without_replay_or_invalid_revision(entered, mode, status, error):
    _, open_client, fixture_provider = entered
    scripted = ScriptedPepperProvider(bad_quote="revise" if mode == "bad_quote" else None)
    calls = []

    async def answer(*args):
        calls.append(args[-1]["stage"])
        if mode == "timeout" and calls[-1] == "interview":
            raise ProviderFailure("provider_timeout", unknown=True)
        return await scripted.answer(*args)

    fixture_provider.answer = answer
    owner, _ = open_client()
    path = f"/api/projects/{project(owner)['id']}/silicon-pretests"
    data = start_data(owner)
    started = owner.post(path, json=data)
    assert started.status_code == 202, started.text
    done = wait(owner, f"{path}/{started.json()['id']}")
    assert (done["status"], done["errorCode"]) == (status, error)
    assert all(event["type"] not in {"revision", "retest", "summary"} for event in done["events"])
    assert all(event["classification"] == "simulated" for event in done["events"])
    dispatched = len(calls)
    assert owner.post(path, json=data).json()["id"] == done["id"]
    assert len(calls) == dispatched


@pytest.mark.postgres
def test_pretest_api_discards_a_late_provider_reply_after_cancel(entered):
    app, open_client, fixture_provider = entered
    owner, _ = open_client()
    path = f"/api/projects/{project(owner)['id']}/silicon-pretests"
    data = start_data(owner)
    release = asyncio.Event()
    dispatched = Event()
    scripted = ScriptedPepperProvider()
    called_stages = []

    async def late_answer(*args):
        called_stages.append(args[-1]["stage"])
        dispatched.set()
        await release.wait()
        return await scripted.answer(*args)

    fixture_provider.answer = late_answer
    started = owner.post(path, json=data)
    assert started.status_code == 202, started.text
    run_url = f"{path}/{started.json()['id']}"
    assert dispatched.wait(5)
    active = owner.post(path, json={**data, "idempotencyKey": str(uuid4())})
    assert active.status_code == 429 and active.json()["error"]["code"] == "call_active"
    cancelled = owner.post(f"{run_url}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"

    async def finish_worker():
        release.set()
        await asyncio.wait_for(asyncio.gather(*app.state.silicon_tasks), timeout=5)

    owner.portal.call(finish_worker)
    final = owner.get(run_url).json()
    assert final["status"] == "cancelled"
    assert final["events"] == []
    assert called_stages == ["roster"]
