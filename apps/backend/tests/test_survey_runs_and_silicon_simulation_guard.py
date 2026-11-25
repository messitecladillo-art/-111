"""Permanent CI guard #31 (CI-BE-31) for persona pre-test simulation runs (`survey_runs.py`) and real-respondent honesty separation (Wave 30).

Verifies:
1. Persona/attribute/level/scenario/question/background/service caps (`silicon.py` & `interview_pretest.py`):
   - Enforces `personas <= 120`, `attributes <= 8`, `2 <= levels <= 8`, `scenarios <= 4` (excluding `"base"`),
     `1 <= questions <= 60`, `background <= 240`, `services <= 3` (unique, `research` capability enabled),
     `expectedCalls == planned_calls`, and `total <= settings.silicon_max_calls`.
2. Secret / API-key anti-exfiltration (`sensitive_input` & outbound provider echo guard):
   - Rejects runs where decrypted service credentials appear in persona backgrounds, question wording,
     scenario text, or interview pretest topics (`422 sensitive_input`, zero secret echo).
   - Blocks provider responses or pretest events that echo the service credential (`invalid_response`).
3. Strict Honesty & Physical Table Separation Boundary (`SiliconRun` vs `SurveyRelease` / `SurveyResponse`):
   - Executing persona pre-test simulations and cognitive interview pretests marks every receipt with
     `"classification": "simulated"`, isolates `/silicon-runs` from `/silicon-pretests` (`404` cross-kind),
     and NEVER inserts, mutates, or increments a single row/counter in `survey_releases` or `survey_responses`.
4. Multi-tenant & role RBAC, idempotency, concurrency, rate limits, cancellation, and pure Chinese errors:
   - Unauthenticated (`401`), cross-tenant outsider (`404`), viewer read-only (`200` GET / `403` POST),
     idempotency replay & payload-mismatch (`409 idempotency_conflict`), active-run lock (`429 call_active`),
     hourly quota (`429 call_rate_limit`), user cancellation (`cancelled_by_user`), and `0` `500` / `0` `Traceback` /
     `0` `[【】「」『』]` across all HTTP responses.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
import re
import time
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event, func, select

from evix_api.app import create_app
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    Service,
    Session as DbSessionModel,
    SurveyRelease,
    SurveyResponse,
    Team,
    User,
    Version,
    now,
)
from infrastructure.security import encrypt, keyed
from infrastructure.settings import Settings
from multi_agent.agents.survey_agent.services import silicon
from shared.contracts import fingerprint
from shared.errors import ApiError

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-3030-4111-8111-111111111111"
TEAM_B_ID = "22222222-3030-4222-8222-222222222222"
PROJECT_A_ID = "33333333-3030-4333-8333-333333333333"
PROJECT_B_ID = "33333333-3030-4333-8333-444444444444"
SERVICE_RESEARCH_ID = "55555555-3030-4555-8555-555555555555"
SERVICE_RESEARCH_2_ID = "66666666-3030-4666-8666-666666666666"
SERVICE_REPORT_ONLY_ID = "77777777-3030-4777-8777-777777777777"
VERSION_A_ID = "88888888-3030-4888-8888-888888888888"
RELEASE_A_ID = "99999999-3030-4999-8999-999999999999"
REAL_RESPONSE_ID = "dddddddd-3030-4ddd-8ddd-dddddddddddd"
OWNER_ID = "aaaaaaaa-3030-4aaa-8aaa-aaaaaaaaaaaa"
VIEWER_ID = "cccccccc-3030-4ccc-8ccc-cccccccccccc"
OUTSIDER_ID = "bbbbbbbb-3030-4bbb-8bbb-bbbbbbbbbbbb"
CANARY_SILICON_SECRET = "sk-silicon-guard-secret-3030fedcba987654"

_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_LEAK_TRACE_OR_PATH_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
)
_EXCEPTION_CLASS_RE = re.compile(
    r"\b(?:ValueError|RuntimeError|TypeError|KeyError|AttributeError|OSError"
    r"|SQLAlchemyError|IntegrityError|ValidationError|RequestValidationError|ProviderFailure)\b"
)


def _make_sqlite_engine(tmp_path: Path):
    db_file = tmp_path / "silicon_guard31.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 15},
    )

    def _on_connect(dbapi_conn, _rec):
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _l: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _lock_id: 1)

    event.listen(engine, "connect", _on_connect)
    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:silicon_guard_pw@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["owner@example.test", "viewer@example.test", "outsider@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "silicon_concurrency": 1,
        "silicon_max_calls": 240,
        "silicon_hourly_runs": 6,
        "sav_temp_dir": tmp_path / "sav-silicon-guard",
        "preflight_temp_dir": tmp_path / "preflight-silicon-guard",
    }
    payload.update(overrides)
    return Settings(**payload)


def _make_question(
    qid: str,
    variable: str,
    kind: str = "single",
    text_val: str = "过去 30 天是否使用过社区助餐服务？",
    *,
    choices: tuple[tuple[str, str], ...] = (("1", "是"), ("0", "否")),
    condition: dict | None = None,
    mn: int | None = None,
    mx: int | None = None,
) -> dict:
    return {
        "id": qid,
        "variable": variable,
        "text": text_val,
        "type": kind,
        "required": False,
        "purpose": "research",
        "researchQuestion": "核查题干理解度",
        "construct": "服务使用行为",
        "analysis": "description",
        "decisionUse": "优化预调查题干",
        "source": "自编预试题项",
        "choices": [{"code": c, "label": lbl} for c, lbl in choices],
        "min": mn,
        "max": mx,
        "minLabel": "非常不满意" if kind == "likert" else "",
        "maxLabel": "非常满意" if kind == "likert" else "",
        "reverse": False,
        "condition": condition,
    }


def _sample_design(question_count: int = 3) -> dict:
    base_questions = [
        _make_question("q-use", "USE", "single", "过去 30 天是否在社区助餐点就餐？"),
        _make_question(
            "q-sat",
            "SAT",
            "likert",
            "您对助餐点餐食温度与口味的总体评价如何？",
            choices=(),
            mn=1,
            mx=5,
        ),
        _make_question("q-open", "IDEA", "text", "您认为社区助餐最需要改进的一点是什么？", choices=()),
    ]
    if question_count == 3:
        qs = base_questions
    elif question_count == 0:
        qs = []
    else:
        qs = [
            _make_question(f"q-item-{idx}", f"V{idx}", "single", f"预测试题干第 {idx} 题？")
            for idx in range(1, question_count + 1)
        ]
    return {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": "县域社区智慧助餐预测试问卷",
        "objective": "检验题干清晰度与跳转逻辑",
        "population": "县域 60 岁及以上常住居民",
        "geography": "华东三县样本社区",
        "period": "2026年春季预调查",
        "recruitment": "社区网格员协助拦截访谈",
        "introduction": "您好，本问卷用于正式发放前的题干预测试。",
        "pilotNotes": "仅用于问卷措辞预检验。",
        "questions": qs,
    }


def _sample_silicon_payload(*, service_id: str = SERVICE_RESEARCH_ID, **overrides) -> dict:
    payload = {
        "design": _sample_design(3),
        "attributes": [
            {
                "key": "age_group",
                "label": "年龄段",
                "levels": [
                    {"value": "60-69岁", "label": "低龄老年", "weight": 1},
                    {"value": "70岁及以上", "label": "中高龄老年", "weight": 1},
                ],
            }
        ],
        "personas": [
            {
                "id": "persona-01",
                "code": "P-01",
                "traits": {"age_group": "60-69岁"},
                "background": "独居退休职工，日常步行前往社区食堂。",
            },
            {
                "id": "persona-02",
                "code": "P-02",
                "traits": {"age_group": "70岁及以上"},
                "background": "与老伴同住，关注低盐软烂餐品。",
            },
        ],
        "scenarios": [
            {"id": "weekday_noon", "label": "工作日午间", "text": "工作日中午就餐高峰时段"}
        ],
        "memory": "carry",
        "shuffleOptions": True,
        "services": [{"serviceId": service_id, "serviceRevision": 1}],
        "expectedCalls": 2,
        "idempotencyKey": str(uuid4()),
        "consent": True,
    }
    payload.update(overrides)
    return payload


def _sample_pretest_payload(*, service_id: str = SERVICE_RESEARCH_ID, **overrides) -> dict:
    payload = {
        "design": _sample_design(3),
        "topic": "县域社区老年人助餐服务体验与题干理解预测试",
        "serviceId": service_id,
        "serviceRevision": 1,
        "idempotencyKey": str(uuid4()),
        "consent": True,
    }
    payload.update(overrides)
    return payload


def _seed_workspace(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    from sqlalchemy.orm import Session as OrmSession

    ts_utc = now()
    ts_naive = ts_utc.replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts_naive)
    monkeypatch.setattr("application.services.survey_runs.now", lambda: ts_utc)

    creds = {
        "owner": ("silicon-owner-cookie-0123456789", "silicon-owner-csrf"),
        "viewer": ("silicon-viewer-cookie-5555555555", "silicon-viewer-csrf"),
        "outsider": ("silicon-outsider-cookie-9876543210", "silicon-outsider-csrf"),
    }
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts_naive},
                {"id": VIEWER_ID, "email": "viewer@example.test", "created_at": ts_naive},
                {"id": OUTSIDER_ID, "email": "outsider@example.test", "created_at": ts_naive},
            ],
        )
        for uid, (ck, csrf) in (
            (OWNER_ID, creds["owner"]),
            (VIEWER_ID, creds["viewer"]),
            (OUTSIDER_ID, creds["outsider"]),
        ):
            conn.execute(
                DbSessionModel.__table__.insert().values(
                    user_id=uid,
                    token_hash=keyed(settings, "session/v1", ck),
                    csrf=csrf,
                    expires_at=ts_naive + timedelta(days=30),
                    revoked_at=None,
                )
            )
        conn.execute(
            Team.__table__.insert(),
            [
                {"id": TEAM_A_ID, "name": "预试隔离验证课题组A"},
                {"id": TEAM_B_ID, "name": "外部租户课题组B"},
            ],
        )
        conn.execute(
            Member.__table__.insert(),
            [
                {"team_id": TEAM_A_ID, "user_id": OWNER_ID, "role": "owner"},
                {"team_id": TEAM_A_ID, "user_id": VIEWER_ID, "role": "viewer"},
                {"team_id": TEAM_B_ID, "user_id": OUTSIDER_ID, "role": "owner"},
            ],
        )
        conn.execute(
            Project.__table__.insert(),
            [
                {
                    "id": PROJECT_A_ID,
                    "team_id": TEAM_A_ID,
                    "title": "社区助餐问卷预试与实证隔离项目",
                    "revision": 1,
                    "questionnaire_revision": 1,
                    "created_at": ts_naive,
                },
                {
                    "id": PROJECT_B_ID,
                    "team_id": TEAM_B_ID,
                    "title": "外部团队独立项目",
                    "revision": 1,
                    "questionnaire_revision": 0,
                    "created_at": ts_naive,
                },
            ],
        )

    with OrmSession(engine) as orm_session:
        for svc_id, label, caps in (
            (SERVICE_RESEARCH_ID, "研究预试主力模型", ["research", "report", "topic"]),
            (SERVICE_RESEARCH_2_ID, "研究预试对照模型", ["research"]),
            (SERVICE_REPORT_ONLY_ID, "仅报告写作模型", ["report"]),
        ):
            svc = Service(
                id=svc_id,
                user_id=OWNER_ID,
                label=label,
                provider="openai",
                base_url="https://api.openai.com/v1",
                model="gpt-4o-mini",
                max_output_tokens=2048,
                capabilities=caps,
                revision=1,
                key_id=settings.active_key_id,
                iv=b"\x00" * 12,
                ciphertext=b"",
                deleted=False,
            )
            encrypt(settings, svc, CANARY_SILICON_SECRET)
            orm_session.add(svc)

        q_design = _sample_design(3)
        ver = Version(
            id=VERSION_A_ID,
            project_id=PROJECT_A_ID,
            revision=1,
            created_by=OWNER_ID,
            design=q_design,
            design_hash=fingerprint(q_design),
            source_proposal_id=None,
            created_at=ts_utc,
        )
        orm_session.add(ver)
        orm_session.flush()

        rel = SurveyRelease(
            id=RELEASE_A_ID,
            project_id=PROJECT_A_ID,
            version_id=VERSION_A_ID,
            questionnaire_revision=1,
            token="A" * 43,
            public_design=q_design,
            classification="actual",
            revision=1,
            status="open",
            response_count=1,
            response_bytes=128,
            created_at=ts_utc,
            closed_at=None,
        )
        orm_session.add(rel)
        orm_session.flush()

        real_resp = SurveyResponse(
            id=REAL_RESPONSE_ID,
            release_id=RELEASE_A_ID,
            idempotency_key="11111111-0000-4000-8000-000000000001",
            payload_hash="f" * 64,
            answers={"USE": "1", "SAT": 5, "IDEA": "真实受访居民原始反馈"},
            visibility={"USE": True, "SAT": True, "IDEA": True},
            created_at=ts_utc,
        )
        orm_session.add(real_resp)
        orm_session.commit()

    return creds


def _auth_headers(cookie_val: str, csrf_val: str) -> dict[str, str]:
    return {
        "Origin": TRUSTED_ORIGIN,
        "Cookie": f"evix_session={cookie_val}",
        "X-CSRF-Token": csrf_val,
    }


def _assert_clean_chinese_error(resp, *, expected_statuses: tuple[int, ...], expected_code: str | None = None) -> dict:
    assert resp.status_code != 500, f"Unexpected 500 response: {resp.text}"
    assert resp.status_code in expected_statuses, f"Expected {expected_statuses}, got {resp.status_code}: {resp.text}"
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"

    raw = resp.text
    assert not _LEAK_TRACE_OR_PATH_RE.search(raw), f"Path or stack trace leaked: {raw}"
    assert not _FORBIDDEN_BRACKET_RE.search(raw), f"Forbidden brackets leaked: {raw}"
    assert not _EXCEPTION_CLASS_RE.search(raw), f"Exception class leaked: {raw}"
    assert CANARY_SILICON_SECRET not in raw, "Encrypted service secret leaked in HTTP response"

    data = resp.json()
    err = data.get("error") if isinstance(data.get("error"), dict) else data
    msg = str(err.get("message") or data.get("detail") or "")
    assert _CHINESE_CHAR_RE.search(msg), f"Expected Chinese message, got: {msg!r}"
    if expected_code is not None:
        assert err.get("code") == expected_code, f"Expected {expected_code!r}, got {err.get('code')!r} ({data})"
    return data


@pytest.mark.parametrize(
    ("case_name", "mutator"),
    [
        ("empty_questions", lambda p: p.__setitem__("design", _sample_design(0))),
        ("exceed_60_questions", lambda p: p.__setitem__("design", _sample_design(61))),
        ("empty_attributes", lambda p: p.__setitem__("attributes", [])),
        (
            "exceed_8_attributes",
            lambda p: p.__setitem__(
                "attributes",
                [
                    {
                        "key": f"attr_{i}",
                        "label": f"维度{i}",
                        "levels": [
                            {"value": "A", "label": "甲", "weight": 1},
                            {"value": "B", "label": "乙", "weight": 1},
                        ],
                    }
                    for i in range(9)
                ],
            ),
        ),
        (
            "duplicate_attribute_key",
            lambda p: p.__setitem__("attributes", [p["attributes"][0], deepcopy(p["attributes"][0])]),
        ),
        ("invalid_attribute_key_chars", lambda p: p["attributes"][0].__setitem__("key", "bad key!")),
        (
            "fewer_than_2_levels",
            lambda p: p["attributes"][0].__setitem__("levels", [{"value": "only", "label": "唯一", "weight": 1}]),
        ),
        (
            "exceed_8_levels",
            lambda p: p["attributes"][0].__setitem__(
                "levels",
                [{"value": f"L{i}", "label": f"层级{i}", "weight": 1} for i in range(9)],
            ),
        ),
        ("negative_level_weight", lambda p: p["attributes"][0]["levels"][0].__setitem__("weight", -0.5)),
        ("empty_personas", lambda p: p.__setitem__("personas", [])),
        (
            "exceed_120_personas",
            lambda p: p.__setitem__(
                "personas",
                [
                    {"id": f"p-{i}", "code": f"P{i}", "traits": {"age_group": "60-69岁"}, "background": ""}
                    for i in range(121)
                ],
            ),
        ),
        ("duplicate_persona_id", lambda p: p.__setitem__("personas", [p["personas"][0], deepcopy(p["personas"][0])])),
        ("undeclared_persona_trait_key", lambda p: p["personas"][0]["traits"].__setitem__("income", "高")),
        ("persona_background_exceeds_240", lambda p: p["personas"][0].__setitem__("background", "背" * 241)),
        (
            "exceed_4_scenarios",
            lambda p: p.__setitem__(
                "scenarios",
                [{"id": f"sc_{i}", "label": f"情境{i}", "text": f"描述{i}"} for i in range(5)],
            ),
        ),
        ("reserved_base_scenario_id", lambda p: p.__setitem__("scenarios", [{"id": "base", "label": "默认", "text": "基准"}])),
        ("invalid_memory_mode", lambda p: p.__setitem__("memory", "eternal")),
        ("non_boolean_shuffle_options", lambda p: p.__setitem__("shuffleOptions", 1)),
    ],
)
def test_silicon_plan_enforces_persona_attribute_level_scenario_question_and_background_caps(
    case_name: str,
    mutator,
) -> None:
    candidate = _sample_silicon_payload()
    mutator(candidate)
    with pytest.raises(ApiError), pytest.MonkeyPatch.context():
        silicon.silicon_plan(candidate)


@pytest.mark.parametrize(
    ("attack_id", "is_pretest", "max_calls_override", "mutator", "expected_status", "expected_code"),
    [
        ("run_missing_consent", False, 240, lambda p: p.__setitem__("consent", False), 422, "consent_required"),
        ("pretest_missing_consent", True, 240, lambda p: p.__setitem__("consent", False), 422, "consent_required"),
        ("run_zero_services", False, 240, lambda p: p.__setitem__("services", []), 422, None),
        (
            "run_exceed_3_services",
            False,
            240,
            lambda p: p.__setitem__(
                "services",
                [{"serviceId": SERVICE_RESEARCH_ID, "serviceRevision": 1} for _ in range(4)],
            ),
            422,
            None,
        ),
        (
            "run_duplicate_service_ref",
            False,
            240,
            lambda p: p.__setitem__(
                "services",
                [
                    {"serviceId": SERVICE_RESEARCH_ID, "serviceRevision": 1},
                    {"serviceId": SERVICE_RESEARCH_ID, "serviceRevision": 1},
                ],
            ),
            422,
            None,
        ),
        (
            "run_service_missing_research_cap",
            False,
            240,
            lambda p: p.__setitem__("services", [{"serviceId": SERVICE_REPORT_ONLY_ID, "serviceRevision": 1}]),
            422,
            "capability_unavailable",
        ),
        (
            "run_stale_service_revision",
            False,
            240,
            lambda p: p.__setitem__("services", [{"serviceId": SERVICE_RESEARCH_ID, "serviceRevision": 9}]),
            409,
            "revision_conflict",
        ),
        (
            "run_expected_calls_mismatch",
            False,
            240,
            lambda p: p.__setitem__("expectedCalls", 99),
            409,
            "estimate_conflict",
        ),
        ("run_exceeds_silicon_max_calls", False, 1, lambda _p: None, 422, "run_too_large"),
        (
            "secret_in_persona_background",
            False,
            240,
            lambda p: p["personas"][0].__setitem__("background", f"携带密钥 {CANARY_SILICON_SECRET}"),
            422,
            "sensitive_input",
        ),
        (
            "secret_in_question_text",
            False,
            240,
            lambda p: p["design"]["questions"][0].__setitem__("text", f"题干夹带 {CANARY_SILICON_SECRET}？"),
            422,
            "sensitive_input",
        ),
        (
            "secret_in_pretest_topic",
            True,
            240,
            lambda p: p.__setitem__("topic", f"预试主题 {CANARY_SILICON_SECRET}"),
            422,
            "sensitive_input",
        ),
        (
            "null_byte_in_persona_background",
            False,
            240,
            lambda p: p["personas"][0].__setitem__("background", "正常背景\x00控制符注入"),
            422,
            None,
        ),
        (
            "pretest_no_focus_questions",
            True,
            240,
            lambda p: p["design"].__setitem__(
                "questions",
                [_make_question("q-tpl", "TPL", "single", "在{情境}下是否就餐？")],
            ),
            422,
            "no_focus_questions",
        ),
    ],
)
def test_http_silicon_runs_reject_cap_breaches_secret_leaks_and_contract_conflicts_with_chinese_errors(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    attack_id: str,
    is_pretest: bool,
    max_calls_override: int,
    mutator,
    expected_status: int,
    expected_code: str | None,
) -> None:
    engine = _make_sqlite_engine(tmp_path)
    settings = _make_settings(tmp_path, silicon_max_calls=max_calls_override)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    req_body = _sample_pretest_payload() if is_pretest else _sample_silicon_payload()
    mutator(req_body)
    subpath = "silicon-pretests" if is_pretest else "silicon-runs"

    app = create_app(settings=settings, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/{subpath}",
            headers=owner_headers,
            json=req_body,
        )
        _assert_clean_chinese_error(resp, expected_statuses=(expected_status,), expected_code=expected_code)


@pytest.mark.parametrize(
    ("actor", "method", "project_id", "subpath", "expected_status"),
    [
        ("unauth", "GET", PROJECT_A_ID, "silicon-runs", 401),
        ("unauth", "POST", PROJECT_A_ID, "silicon-runs", 401),
        ("unauth", "GET", PROJECT_A_ID, "silicon-pretests", 401),
        ("unauth", "POST", PROJECT_A_ID, "silicon-pretests", 401),
        ("outsider", "GET", PROJECT_A_ID, "silicon-runs", 404),
        ("outsider", "POST", PROJECT_A_ID, "silicon-runs", 404),
        ("outsider", "GET", PROJECT_A_ID, "silicon-pretests", 404),
        ("outsider", "POST", PROJECT_A_ID, "silicon-pretests", 404),
        ("outsider", "POST", PROJECT_B_ID, "silicon-runs", 404),
        ("outsider", "POST", PROJECT_B_ID, "silicon-pretests", 404),
        ("viewer", "POST", PROJECT_A_ID, "silicon-runs", 403),
        ("viewer", "POST", PROJECT_A_ID, "silicon-pretests", 403),
    ],
)
def test_silicon_and_pretest_cross_tenant_viewer_and_unauth_isolation_matrix(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    actor: str,
    method: str,
    project_id: str,
    subpath: str,
    expected_status: int,
) -> None:
    engine = _make_sqlite_engine(tmp_path)
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)

    headers = {"Origin": TRUSTED_ORIGIN} if actor == "unauth" else _auth_headers(*creds[actor])
    app = create_app(settings=settings, engine=engine)
    url = f"/api/projects/{project_id}/{subpath}"

    with TestClient(app, raise_server_exceptions=False) as client:
        if actor == "viewer":
            read_ok = client.get(url, headers=headers)
            assert read_ok.status_code == 200, read_ok.text

        if method == "GET":
            resp = client.get(url, headers=headers)
        elif subpath == "silicon-pretests":
            resp = client.post(url, headers=headers, json=_sample_pretest_payload())
        else:
            resp = client.post(url, headers=headers, json=_sample_silicon_payload())

        _assert_clean_chinese_error(resp, expected_statuses=(expected_status,))


class _ScriptedHonestyProvider:
    async def answer(self, config, key, message, spec):
        import json as _json

        if spec.get("mode") == "interview_pretest":
            stage = spec["stage"]
            payload = spec["input"]
            if stage == "roster":
                qids = [q["id"] for q in payload["questions"][:2]]
                return _json.dumps(
                    {
                        "personas": [
                            {
                                "id": "p1",
                                "label": "「独居老人」画像",
                                "background": "【虚构设定】常去社区食堂就餐",
                                "rationale": "[预试对照]核查频次回忆口径",
                            },
                            {
                                "id": "p2",
                                "label": "高龄慢病居民",
                                "background": "虚构设定，饮食偏好清淡软烂",
                                "rationale": "核查口味与温度并列提问是否歧义",
                            },
                            {
                                "id": "p3",
                                "label": "子女代订餐老人",
                                "background": "虚构设定，由家属线上预约配送",
                                "rationale": "核查到店就餐与配送上门的范围界定",
                            },
                        ],
                        "questionIds": qids,
                    },
                    ensure_ascii=False,
                )
            if stage == "interview":
                return _json.dumps(
                    {
                        "answers": [
                            {
                                "questionId": q["id"],
                                "answer": "「助餐点」温度还行但口味偏咸，两个合在一起不好打分。"
                                if idx == 0
                                else "我一般按最近两周堂食经历来理解这道题。",
                                "unclear": "温度与口味合并提问难以单选" if idx == 0 else "",
                            }
                            for idx, q in enumerate(payload["questions"])
                        ]
                    },
                    ensure_ascii=False,
                )
            if stage == "followup":
                anchor = payload["turns"][0]
                return _json.dumps(
                    {
                        "questionId": anchor["questionId"],
                        "turnId": anchor["id"],
                        "quote": anchor["answer"][:10],
                        "prompt": "您刚才是先按温度还是先按口味来给分的？",
                        "answer": "我主要是按饭菜热不热来给分的。",
                        "unclear": "",
                    },
                    ensure_ascii=False,
                )
            if stage == "revise":
                return _json.dumps({"revisions": []}, ensure_ascii=False)
            if stage == "retest":
                return _json.dumps(
                    {
                        "answers": [
                            {"questionId": q["id"], "answer": "题目范围清楚，按近30天就餐体验作答。", "unclear": ""}
                            for q in payload["questions"]
                        ]
                    },
                    ensure_ascii=False,
                )

        return _json.dumps(
            {
                "answers": [
                    {
                        "variable": item["variable"],
                        "value": item["codes"][0]
                        if item["type"] == "single"
                        else (item["min"] if item["type"] == "likert" else "合成预测试回答"),
                        "unclear": "",
                    }
                    for item in spec["questions"]
                ]
            },
            ensure_ascii=False,
        )


def test_silicon_run_honesty_boundary_never_pollutes_real_survey_tables_and_completes_cleanly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = _make_sqlite_engine(tmp_path)
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    app = create_app(settings=settings, engine=engine, provider=_ScriptedHonestyProvider())
    with TestClient(app, raise_server_exceptions=False) as client:
        run_payload = _sample_silicon_payload()
        start_resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=run_payload,
        )
        assert start_resp.status_code == 202, start_resp.text
        started = start_resp.json()
        assert started["classification"] == "simulated"
        run_id = started["id"]

        detail = started
        for _ in range(40):
            poll = client.get(f"/api/projects/{PROJECT_A_ID}/silicon-runs/{run_id}", headers=owner_headers)
            assert poll.status_code == 200
            detail = poll.json()
            if detail["status"] != "running":
                break
            time.sleep(0.05)

        assert detail["status"] == "ready", detail
        assert detail["classification"] == "simulated"
        assert detail["done"] == detail["total"] == 2
        assert len(detail["responses"]) == 2
        assert not _FORBIDDEN_BRACKET_RE.search(poll.text)
        assert CANARY_SILICON_SECRET not in poll.text

        cross_kind_1 = client.get(
            f"/api/projects/{PROJECT_A_ID}/silicon-pretests/{run_id}",
            headers=owner_headers,
        )
        _assert_clean_chinese_error(cross_kind_1, expected_statuses=(404,), expected_code="not_found")

        pre_payload = _sample_pretest_payload()
        pre_start = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-pretests",
            headers=owner_headers,
            json=pre_payload,
        )
        assert pre_start.status_code == 202, pre_start.text
        pre_id = pre_start.json()["id"]

        pre_detail = pre_start.json()
        for _ in range(60):
            pre_poll = client.get(
                f"/api/projects/{PROJECT_A_ID}/silicon-pretests/{pre_id}",
                headers=owner_headers,
            )
            assert pre_poll.status_code == 200
            pre_detail = pre_poll.json()
            if pre_detail["status"] != "running":
                break
            time.sleep(0.05)

        assert pre_detail["status"] == "ready", pre_detail
        assert pre_detail["classification"] == "simulated"
        assert pre_detail["kind"] == "interview_pretest"
        assert len(pre_detail["events"]) >= 1
        assert not _FORBIDDEN_BRACKET_RE.search(pre_poll.text)

        cross_kind_2 = client.get(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs/{pre_id}",
            headers=owner_headers,
        )
        _assert_clean_chinese_error(cross_kind_2, expected_statuses=(404,), expected_code="not_found")

    with engine.connect() as conn:
        release_count = conn.scalar(select(func.count()).select_from(SurveyRelease))
        response_rows = conn.execute(select(SurveyResponse)).all()
        rel_row = conn.execute(select(SurveyRelease).where(SurveyRelease.id == RELEASE_A_ID)).one()

    assert release_count == 1
    assert len(response_rows) == 1
    assert response_rows[0].id == REAL_RESPONSE_ID
    assert response_rows[0].answers == {"USE": "1", "SAT": 5, "IDEA": "真实受访居民原始反馈"}
    assert rel_row.response_count == 1
    assert rel_row.classification == "actual"


class _ControllableSiliconProvider:
    def __init__(self, *, hold_seconds: float = 0.0, echo_secret: bool = False):
        self.hold_seconds = hold_seconds
        self.echo_secret = echo_secret

    async def answer(self, config, key, message, spec):
        if self.hold_seconds > 0:
            await asyncio.sleep(self.hold_seconds)
        if self.echo_secret:
            return f'{{"answers":[{{"variable":"USE","value":"1","unclear":"泄漏 {key}"}}]}}'
        return '{"answers":[{"variable":"USE","value":"1","unclear":""},{"variable":"SAT","value":4,"unclear":""},{"variable":"IDEA","value":"建议增加热汤保温台","unclear":""}]}'


def test_silicon_idempotency_active_call_concurrency_hourly_rate_limit_and_secret_echo_containment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = _make_sqlite_engine(tmp_path)
    settings = _make_settings(tmp_path, silicon_hourly_runs=2)
    creds = _seed_workspace(engine, settings, monkeypatch)
    owner_headers = _auth_headers(*creds["owner"])

    slow_provider = _ControllableSiliconProvider(hold_seconds=0.35, echo_secret=False)
    app = create_app(settings=settings, engine=engine, provider=slow_provider)

    idem_key = str(uuid4())
    first_payload = _sample_silicon_payload(idempotencyKey=idem_key)

    with TestClient(app, raise_server_exceptions=False) as client:
        r1 = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=first_payload,
        )
        assert r1.status_code == 202, r1.text
        run1_id = r1.json()["id"]

        replay_same = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=first_payload,
        )
        assert replay_same.status_code == 202
        assert replay_same.json()["id"] == run1_id

        mutated_same_key = deepcopy(first_payload)
        mutated_same_key["shuffleOptions"] = False
        idem_conflict = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=mutated_same_key,
        )
        _assert_clean_chinese_error(idem_conflict, expected_statuses=(409,), expected_code="idempotency_conflict")

        concurrent_blocked = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=_sample_silicon_payload(),
        )
        _assert_clean_chinese_error(concurrent_blocked, expected_statuses=(429,), expected_code="call_active")

        cancel_resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs/{run1_id}/cancel",
            headers=owner_headers,
        )
        assert cancel_resp.status_code == 200
        cancelled_body = cancel_resp.json()
        assert cancelled_body["status"] == "cancelled"
        assert cancelled_body["errorCode"] == "cancelled_by_user"

    echo_provider = _ControllableSiliconProvider(hold_seconds=0.0, echo_secret=True)
    app_echo = create_app(settings=settings, engine=engine, provider=echo_provider)
    with TestClient(app_echo, raise_server_exceptions=False) as client2:
        r2 = client2.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=_sample_silicon_payload(),
        )
        assert r2.status_code == 202, r2.text
        run2_id = r2.json()["id"]

        run2_detail = r2.json()
        for _ in range(40):
            poll2 = client2.get(
                f"/api/projects/{PROJECT_A_ID}/silicon-runs/{run2_id}",
                headers=owner_headers,
            )
            run2_detail = poll2.json()
            if run2_detail["status"] != "running":
                break
            time.sleep(0.05)

        assert run2_detail["status"] == "failed"
        assert run2_detail["errorCode"] == "invalid_response"
        assert all(item["status"] == "failed" and item["answers"] == [] for item in run2_detail["responses"])
        assert CANARY_SILICON_SECRET not in poll2.text

        rate_limited = client2.post(
            f"/api/projects/{PROJECT_A_ID}/silicon-runs",
            headers=owner_headers,
            json=_sample_silicon_payload(),
        )
        _assert_clean_chinese_error(rate_limited, expected_statuses=(429,), expected_code="call_rate_limit")
