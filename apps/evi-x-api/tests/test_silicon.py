import asyncio
import json
import time
from datetime import timedelta
from pathlib import Path
from uuid import uuid4
import pytest
from sqlalchemy import text, update
from evix_api import silicon
from evix_api.contracts import ApiError
from evix_api.models import SiliconRun, now
from evix_api.provider import FixtureProvider
from .test_contracts import blank

PARITY = json.loads((Path(__file__).parent / "fixtures" / "silicon-parity.json").read_text(encoding="utf-8"))


def question(qid, variable, kind="single", text_="题干", choices=(("1", "是"), ("0", "否")), condition=None, mn=None, mx=None):
    return {"id": qid, "variable": variable, "text": text_, "type": kind, "required": False, "purpose": "research", "researchQuestion": "",
            "construct": "", "analysis": "undecided", "decisionUse": "", "source": "", "choices": [{"code": c, "label": l} for c, l in choices],
            "min": mn, "max": mx, "minLabel": "低" if kind == "likert" else "", "maxLabel": "高" if kind == "likert" else "", "reverse": False, "condition": condition}


def design():
    d = blank()
    d["title"] = "合成预测试问卷"
    d["questions"] = [
        question("q-use", "USE", text_="过去 30 天是否取过件？"),
        question("q-freq", "FREQ", text_="取件几次？", choices=(("1", "1–2 次"), ("2", "3 次及以上")), condition={"questionId": "q-use", "codes": ["1"]}),
        question("q-wait", "WAIT", "likert", "在{情境}取件的等待压力？", (), {"questionId": "q-use", "codes": ["1"]}, 1, 5),
        question("q-why", "WHY", "multi", "结合{FREQ}，哪些问题影响体验？", (("a", "排队"), ("b", "找件"), ("c", "其他")), {"questionId": "q-use", "codes": ["1"]}),
        question("q-idea", "IDEA", "text", "改进建议？", ()),
    ]
    return d


def payload(**extra):
    personas = [{"id": f"7-S-00{i}", "code": f"S-00{i}", "traits": {"grade": ["大一", "大二"][i % 2]}, "background": "住校内宿舍" if i == 1 else ""} for i in range(1, 4)]
    base = {"design": design(), "attributes": [{"key": "grade", "label": "年级", "levels": [{"value": "大一", "label": "大一", "weight": 1}, {"value": "大二", "label": "大二", "weight": 1}]}],
            "personas": personas, "scenarios": [{"id": "noon", "label": "午间", "text": "平日午间"}, {"id": "peak", "label": "高峰", "text": "晚高峰"}],
            "memory": "carry", "shuffleOptions": True, "services": [], "expectedCalls": 6, "idempotencyKey": str(uuid4()), "consent": True}
    return {**base, **extra}


def test_normalisation_matches_the_typescript_twin():
    for case in PARITY["cases"]:
        value, valid = silicon.normalize(case["question"], case["raw"])
        assert (value, valid) == (case["value"], case["valid"]), case


def test_plan_validation_and_call_bounds():
    plan = silicon.silicon_plan(payload())
    assert silicon.planned_calls(plan, 1) == 6 and silicon.planned_calls(plan, 3) == 18
    assert silicon.planned_calls({**plan, "memory": "independent"}, 2) == 3 * 2 * 2 * 5
    assert silicon.planned_calls({**plan, "scenarios": []}, 1) == 3
    bad = [
        payload(attributes=[]),
        payload(personas=[]),
        payload(personas=[{"id": "x", "code": "S-1", "traits": {"unknown": "v"}, "background": ""}]),
        payload(personas=[{"id": "x", "code": "S-1", "traits": {}, "background": ""}] * 2),
        payload(scenarios=[{"id": "base", "label": "基准", "text": "x"}]),
        payload(scenarios=[{"id": "a", "label": " ", "text": "x"}]),
        payload(memory="forever"),
        payload(shuffleOptions="yes"),
        payload(design={**design(), "questions": []}),
    ]
    for item in bad:
        with pytest.raises(ApiError):
            silicon.silicon_plan(item)


def test_routing_piping_and_prompts_follow_the_browser_rules():
    d = design()
    q = {x["variable"]: x for x in d["questions"]}
    answers = {"q-use": silicon.make_answer(q["USE"], True, "1", ""), "q-freq": silicon.make_answer(q["FREQ"], True, "2", "")}
    assert silicon.is_shown(q["WAIT"], answers)
    assert silicon.render(d, q["WAIT"], {"id": "peak", "label": "高峰", "text": "晚高峰"}, answers) == "在晚高峰取件的等待压力？"
    assert silicon.render(d, q["WHY"], None, answers) == "结合3 次及以上，哪些问题影响体验？"
    assert "你对 FREQ 题的回答" in silicon.render(d, q["WHY"], None, {}, carry_hint=True)
    refused = {"q-use": silicon.make_answer(q["USE"], True, None, "不确定")}
    assert refused["q-use"]["refused"] and not silicon.is_shown(q["FREQ"], refused)
    plan = silicon.silicon_plan(payload())
    persona = plan["personas"][0]
    prompt = silicon.carry_prompt(plan, persona, plan["scenarios"][1])
    assert "年级：大二。背景：住校内宿舍" in prompt and "当前情境：高峰（晚高峰）" in prompt
    assert "仅当第 1 题选择编码 1 时作答" in prompt and '"answers"' in prompt and "不可信" in prompt
    single = silicon.single_prompt(plan, persona, None, q["WHY"], answers)
    assert "结合3 次及以上" in single and '{"value"' in single


def test_carry_assembly_keeps_routing_violations_visible_and_flags_invalid_values():
    d = design()
    raw = "```json\n" + json.dumps({"answers": [
        {"variable": "USE", "value": "0", "unclear": ""},
        {"variable": "FREQ", "value": "2"},
        {"variable": "IDEA", "value": "多开窗口", "unclear": "  "},
        {"variable": "use", "value": "1"},
    ]}, ensure_ascii=False) + "\n```"
    answers = {a["questionId"]: a for a in silicon.assemble_carry(d, silicon.parse_carry(raw, d))}
    assert answers["q-use"]["value"] == "0" and answers["q-use"]["shown"]
    assert answers["q-freq"] == {"questionId": "q-freq", "value": "2", "shown": False, "refused": False, "unclear": ""}
    assert not answers["q-wait"]["shown"] and answers["q-wait"]["value"] is None
    assert answers["q-idea"]["value"] == "多开窗口" and answers["q-idea"]["unclear"] == ""
    invalid = silicon.assemble_carry(d, silicon.parse_carry(json.dumps({"answers": [{"variable": "USE", "value": "7", "unclear": "选项不全"}]}), d))
    assert invalid[0]["refused"] and silicon.INVALID_NOTE in invalid[0]["unclear"] and invalid[0]["unclear"].startswith("选项不全")
    for broken in ("not json", '{"answers": {}}', '{"answers": [], "extra": 1}'):
        with pytest.raises(ApiError):
            silicon.parse_carry(broken, d)


@pytest.mark.asyncio
async def test_fixture_answers_parse_cleanly_in_both_modes():
    d = design()
    provider = FixtureProvider()
    carry = await provider.answer({}, "k", "x", {"mode": "carry", "questions": [silicon.question_spec(q) for q in d["questions"]]})
    answers = silicon.assemble_carry(d, silicon.parse_carry(carry, d))
    assert [a["shown"] for a in answers] == [True, True, True, True, True]
    assert answers[2]["value"] == 1 and answers[3]["value"] == ["a"] and "合成" in answers[4]["value"]
    single = await provider.answer({}, "k", "x", {"mode": "single", "questions": [silicon.question_spec(d["questions"][1])]})
    assert silicon.parse_single(single) == ("1", "")
    assert provider.calls == 2


# ───────────── PostgreSQL integration ─────────────

def service_input(**extra):
    return {"label": "合成研究服务", "provider": "openai", "baseUrl": "https://api.openai.com/v1", "model": "fixture-model",
            "maxOutputTokens": 1024, "capabilities": ["research"], "apiKey": "synthetic-private-model-key", "idempotencyKey": str(uuid4()), **extra}


def project(client):
    team = client.get("/api/teams").json()["teams"][0]["id"]
    response = client.post("/api/projects", json={"title": "合成研究", "teamId": team, "idempotencyKey": str(uuid4())})
    assert response.status_code == 201, response.text
    return response.json()


def wait(client, path, until=("ready", "failed", "cancelled", "outcome_unknown"), seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        view = client.get(path).json()
        if view["status"] in until:
            return view
        time.sleep(0.05)
    raise AssertionError(f"run did not settle: {view}")


@pytest.fixture
def entered(harness):
    """Silicon runs continue after the response, so each client keeps one event loop alive for its lifetime."""
    app, login, deliveries, provider = harness
    opened = []

    def open_client(email="a@example.test"):
        client, session = login(email)
        client.__enter__()
        opened.append(client)
        return client, session
    yield app, open_client, provider
    for client in opened:
        client.__exit__(None, None, None)


@pytest.mark.postgres
def test_silicon_run_lifecycle_idempotency_scope_and_limits(entered, pg_engine, settings):
    app, open_client, provider = entered
    a, sa = open_client()
    b, _ = open_client("b@example.test")
    p = project(a)
    service = a.post("/api/services", json=service_input()).json()
    questionnaire_only = a.post("/api/services", json=service_input(label="仅问卷服务", capabilities=["questionnaire"])).json()
    path = f'/api/projects/{p["id"]}/silicon-runs'
    data = payload(services=[{"serviceId": service["id"], "serviceRevision": 1}])
    assert a.post(path, json={**data, "consent": False}).status_code == 422
    assert a.post(path, json={**data, "idempotencyKey": str(uuid4()), "expectedCalls": 5}).status_code == 409
    assert a.post(path, json={**data, "idempotencyKey": str(uuid4()), "services": [{"serviceId": questionnaire_only["id"], "serviceRevision": 1}]}).status_code == 422
    assert a.post(path, json={**data, "idempotencyKey": str(uuid4()), "services": [{"serviceId": service["id"], "serviceRevision": 2}]}).status_code == 409
    assert a.post(path, json={**data, "idempotencyKey": str(uuid4()), "memory": "independent", "expectedCalls": 3 * 2 * 5,
                              "personas": [{"id": f"p{i}", "code": f"S-{i}", "traits": {}, "background": ""} for i in range(30)]}).status_code in (409, 422)
    leaked = payload(services=data["services"], personas=[{"id": "x", "code": "S-1", "traits": {}, "background": "synthetic-private-model-key"}], expectedCalls=2)
    assert a.post(path, json=leaked).json()["error"]["code"] == "sensitive_input"
    assert provider.calls == 0

    started = a.post(path, json=data)
    assert started.status_code == 202, started.text
    view = started.json()
    assert view["classification"] == "simulated" and view["total"] == 6 and view["services"][0]["name"] == "合成研究服务 · fixture-model"
    done = wait(a, f'{path}/{view["id"]}')
    assert done["status"] == "ready" and done["done"] == 6 and len(done["responses"]) == 6 and provider.calls == 6
    response = done["responses"][0]
    assert response["status"] == "ok" and response["model"] == "合成研究服务 · fixture-model"
    assert [x["questionId"] for x in response["answers"]] == [q["id"] for q in design()["questions"]]
    assert {(r["personaId"], r["scenarioId"]) for r in done["responses"]} == {(f"7-S-00{i}", s) for i in range(1, 4) for s in ("noon", "peak")}
    assert a.post(path, json=data).json()["id"] == view["id"] and provider.calls == 6
    assert a.post(path, json={**data, "shuffleOptions": False}).status_code == 409
    listing = a.get(path).json()
    assert listing["limits"] == {"maxCalls": settings.silicon_max_calls, "hourlyRuns": settings.silicon_hourly_runs, "maxServices": 3}
    listed = listing["runs"]
    assert listed[0]["id"] == view["id"] and "responses" not in listed[0]
    assert b.get(path).status_code == 404 and b.get(f'{path}/{view["id"]}').status_code == 404
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM silicon_runs")).scalar_one() == 0  # RLS hides rows without a user scope.


@pytest.mark.postgres
def test_silicon_cancel_single_active_run_and_restart_expiry(entered, pg_engine, settings):
    app, open_client, provider = entered
    gate = asyncio.Event()

    async def slow(config, key, message, spec):
        provider.calls += 1
        await gate.wait()
        return json.dumps({"answers": []})
    provider.answer = slow
    a, sa = open_client()
    p = project(a)
    service = a.post("/api/services", json=service_input()).json()
    path = f'/api/projects/{p["id"]}/silicon-runs'
    data = payload(services=[{"serviceId": service["id"], "serviceRevision": 1}])
    view = a.post(path, json=data).json()
    assert view["status"] == "running"
    assert a.post(path, json={**data, "idempotencyKey": str(uuid4())}).json()["error"]["code"] == "call_active"
    cancelled = a.post(f'{path}/{view["id"]}/cancel').json()
    assert cancelled["status"] == "cancelled" and cancelled["errorCode"] == "cancelled_by_user"
    a.portal.call(gate.set)  # Let in-flight calls finish; their results are discarded.
    time.sleep(0.3)
    final = a.get(f'{path}/{view["id"]}').json()
    assert final["status"] == "cancelled" and final["responses"] == [] and provider.calls <= settings.silicon_concurrency
    # A run whose worker vanished reads as outcome_unknown, never replayed.
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id',:id,true)"), {"id": sa["user"]["id"]})
        connection.execute(update(SiliconRun).where(SiliconRun.id == view["id"]).values(status="running", updated_at=now() - timedelta(seconds=settings.silicon_stale_seconds + 5)))
    assert a.get(f'{path}/{view["id"]}').json()["status"] == "outcome_unknown"
