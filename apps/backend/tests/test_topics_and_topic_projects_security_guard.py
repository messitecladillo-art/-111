"""Permanent CI guard #30 (CI-BE-30) for topic advisor, topic projects, and topic agent security & integrity (Wave 30).

Verifies across `topics.py`, `topic_projects.py`, and `topic_agent.py`:
1. Unauthenticated (`401`) & cross-origin/CSRF (`403`) rejection across all 12 topic endpoints.
2. Topic evaluation & proposal input validation (`POST /api/topic-advisor/proposals`):
   - Malformed profiles, invalid/unknown/stale v2 administrative region codes, ASCII control chars,
     oversized inputs, missing consent, stale catalog/service revisions, missing research capability,
     and API secret canary leakage -> clean `422` / `409` / `413` Chinese `ApiError` (`0` `500`).
3. Topic project lifecycle (`topic_projects.py`):
   - CRUD, version history pagination, optimistic concurrency CAS (`expectedRevision` -> `409`),
     confirm/revoke decision state machine (`brief_incomplete` -> `422`, duplicate/stale -> `409`),
     viewer read-only block (`403`), and strict cross-tenant `404` non-disclosure.
4. Topic agent (`topic_agent.py`):
   - Deterministic offline execution (`EVIX_ENABLE_LIVE_SCHOLAR_API=0`) in `local` and `model` modes,
     multi-turn conversation chain & query-scope fencing, non-survey research-scope guard (`422`),
     secret leak prevention, rate-limit enforcement (`429`), and 100% pure Chinese de-technicalized copy.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import re
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    RateEvent,
    Service,
    Session as DbSessionModel,
    Team,
    User,
    now,
)
from infrastructure.security import encrypt, keyed
from infrastructure.settings import Settings
from multi_agent.agents.research_agent.services import topic_projects as topic_project_domain
from multi_agent.agents.research_agent.services import topics as topics_domain
from multi_agent.agents.research_agent.services.topic_regions import region_catalog_binding

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-3030-4111-8111-111111111111"
TEAM_B_ID = "22222222-3030-4222-8222-222222222222"
PROJECT_A_ID = "33333333-3030-4333-8333-333333333333"
SERVICE_RESEARCH_ID = "44444444-3030-4444-8444-444444444444"
SERVICE_NO_RESEARCH_ID = "55555555-3030-4555-8555-555555555555"
OWNER_ID = "aaaaaaaa-3030-4aaa-8aaa-aaaaaaaaaaaa"
VIEWER_ID = "cccccccc-3030-4ccc-8ccc-cccccccccccc"
OUTSIDER_ID = "bbbbbbbb-3030-4bbb-8bbb-bbbbbbbbbbbb"
CANARY_API_SECRET = "sk-topic-guard-canary-3030abcdef987654"

_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKET_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_LEAK_TRACE_OR_PATH_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?<![A-Za-z])[A-Za-z]:(?:\\|/(?!/))[^\s\"'<>]+"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
)
_EXCEPTION_CLASS_RE = re.compile(
    r"\b(?:UnsafeBody|ValueError|RuntimeError|TypeError|KeyError|AttributeError|OSError|OverflowError"
    r"|SQLAlchemyError|IntegrityError|ValidationError|RequestValidationError)\b"
)
_PRIVATE_JARGON_RE = re.compile(r"\b(?:ReAct|EpistemicGraph|BYOK)\b|Track\s*[12]", re.IGNORECASE)

_CORPUS = topics_domain.load_corpus()
_CATALOG_VERSION = _CORPUS["catalog"]["contentVersion"]
_REGION_CATALOG_VERSION = region_catalog_binding()["catalogVersion"]
_ELIGIBLE_PATTERN = next(
    row
    for row in _CORPUS["catalog"]["patterns"]
    if not row["sensitive"] and not row["regionTags"] and not row["cityTags"]
)
_ELIGIBLE_PATTERN_ID = _ELIGIBLE_PATTERN["id"]
_ELIGIBLE_ACCESS = {k: "confirmed" for k in _ELIGIBLE_PATTERN.get("accessNeeds", [])}
_ELIGIBLE_RESOURCES = {k: "confirmed" for k in _ELIGIBLE_PATTERN.get("resourceNeeds", [])}


def _make_sqlite_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def _on_connect(dbapi_conn, _rec):
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _l: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _lock_id: 1)

    event.listen(engine, "connect", _on_connect)
    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        mode="local_test",
        database_url="postgresql+psycopg://evix_user:topic_guard_pw@127.0.0.1:55432/evix_p0_test",
        allowed_origins=[TRUSTED_ORIGIN],
        invited_emails=["owner@example.test", "viewer@example.test", "outsider@example.test"],
        auth_secret="a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        keyring={"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        mail_mode="fixture",
        provider_mode="fixture",
        sav_temp_dir=tmp_path / "sav-topic-guard",
        preflight_temp_dir=tmp_path / "preflight-topic-guard",
    )


@pytest.fixture
def topic_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EVIX_ENABLE_LIVE_SCHOLAR_API", "0")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")

    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    ts_utc = now()
    ts_naive = ts_utc.replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts_naive)

    creds = {
        "owner": ("topic-owner-cookie-0123456789", "topic-owner-csrf"),
        "viewer": ("topic-viewer-cookie-5555555555", "topic-viewer-csrf"),
        "outsider": ("topic-outsider-cookie-9876543210", "topic-outsider-csrf"),
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
                {"id": TEAM_A_ID, "name": "选题安全核验课题组甲"},
                {"id": TEAM_B_ID, "name": "外部租户隔离课题组乙"},
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
            Project.__table__.insert().values(
                id=PROJECT_A_ID,
                team_id=TEAM_A_ID,
                title="县域青年就业公共服务体验调查",
                revision=1,
                questionnaire_revision=0,
                created_at=ts_naive,
            )
        )

    with OrmSession(engine) as orm_session:
        svc_ok = Service(
            id=SERVICE_RESEARCH_ID,
            user_id=OWNER_ID,
            label="研究探索命名服务",
            provider="openai",
            base_url="https://api.openai.com/v1",
            model="gpt-4o-mini",
            max_output_tokens=1024,
            capabilities=["questionnaire", "research", "report", "defense"],
            revision=1,
            key_id=settings.active_key_id,
            iv=b"\x00" * 12,
            ciphertext=b"",
            deleted=False,
        )
        encrypt(settings, svc_ok, CANARY_API_SECRET)
        svc_limited = Service(
            id=SERVICE_NO_RESEARCH_ID,
            user_id=OWNER_ID,
            label="仅问卷起草服务",
            provider="openai",
            base_url="https://api.openai.com/v1",
            model="gpt-4o-mini",
            max_output_tokens=1024,
            capabilities=["questionnaire"],
            revision=1,
            key_id=settings.active_key_id,
            iv=b"\x00" * 12,
            ciphertext=b"",
            deleted=False,
        )
        encrypt(settings, svc_limited, CANARY_API_SECRET)
        orm_session.add_all([svc_ok, svc_limited])
        orm_session.commit()

    provider = FixtureProvider()
    app = create_app(settings, provider=provider, engine=engine)
    with TestClient(app) as client:
        yield {
            "client": client,
            "creds": creds,
            "engine": engine,
            "settings": settings,
            "provider": provider,
        }
    engine.dispose()


def _headers(creds: dict[str, tuple[str, str]], role: str = "owner") -> dict[str, str]:
    ck, csrf = creds[role]
    return {
        "Origin": TRUSTED_ORIGIN,
        "Cookie": f"evix_session={ck}",
        "X-CSRF-Token": csrf,
    }


def _assert_clean_chinese_response(resp, expected_status: int | tuple[int, ...]) -> dict:
    allowed = (expected_status,) if isinstance(expected_status, int) else expected_status
    assert resp.status_code != 500, f"Unexpected 500 Internal Server Error: {resp.text}"
    assert resp.status_code in allowed, f"Expected {allowed}, got {resp.status_code}: {resp.text}"
    raw_text = resp.text
    assert CANARY_API_SECRET not in raw_text, "Encrypted API secret canary leaked in HTTP response"
    assert not _FORBIDDEN_BRACKET_RE.search(raw_text), f"Forbidden brackets in response: {raw_text}"
    assert not _LEAK_TRACE_OR_PATH_RE.search(raw_text), f"Traceback or host path leaked: {raw_text}"
    assert not _EXCEPTION_CLASS_RE.search(raw_text), f"Python exception class leaked: {raw_text}"
    assert not _PRIVATE_JARGON_RE.search(raw_text), f"Private engineering jargon leaked: {raw_text}"
    payload = resp.json()
    if resp.status_code >= 400:
        err = payload.get("error") if isinstance(payload.get("error"), dict) else payload
        msg = err.get("message", "")
        assert isinstance(msg, str) and _CHINESE_CHAR_RE.search(msg), f"Error must be pure Chinese: {payload}"
    return payload


def _valid_v2_profile(**overrides) -> dict:
    base = {
        "schemaVersion": 2,
        "region": "浙江省",
        "city": "义乌市",
        "regionRef": {"code": "330782", "catalogVersion": _REGION_CATALOG_VERSION},
        "school": "",
        "schoolContext": [],
        "discipline": "社会学",
        "interests": ["青年就业"],
        "domains": [],
        "days": 21,
        "budgetYuan": 600,
        "access": dict(_ELIGIBLE_ACCESS),
        "resources": dict(_ELIGIBLE_RESOURCES),
        "sensitiveData": "avoid",
        "referenceDate": "2026-10-15",
        "competitionWindow": {"start": "2026-10-01", "end": "2026-12-31"},
    }
    base.update(overrides)
    return base


def _valid_proposal_body(**overrides) -> dict:
    body = {
        "serviceId": SERVICE_RESEARCH_ID,
        "serviceRevision": 1,
        "idempotencyKey": str(uuid4()),
        "consent": True,
        "catalogVersion": _CATALOG_VERSION,
        "profile": _valid_v2_profile(),
        "candidateIds": [_ELIGIBLE_PATTERN_ID],
        "goal": "围绕县域青年公共就业服务站的使用体验与信息触达障碍开展实地问卷调查",
    }
    body.update(overrides)
    return body


def _valid_topic_document(title: str = "义乌市青年求职公共服务触达机制调查") -> dict:
    return {
        "schemaVersion": 2,
        "profile": _valid_v2_profile(),
        "candidate": None,
        "shortlistIds": [_ELIGIBLE_PATTERN_ID],
        "selected": {"kind": "pattern", "id": _ELIGIBLE_PATTERN_ID, "title": "合成参考选题"},
        "brief": {
            "title": title,
            "decisionOwner": "县域公共就业服务管理部门",
            "decision": "优化线下零工驿站与线上政策指南的服务配置优先级",
            "population": "近六个月在本地求职的18至35岁青年群体",
            "geography": "浙江省金华市义乌市",
            "inclusion": "近六个月内在义乌市求职或使用公共就业服务的青年",
            "exclusion": "未在研究地域开展求职活动的短期访客",
            "evidencePlan": "结合分层拦截问卷与服务窗口结构化访谈交叉核验。",
            "questions": [{"id": "rq-1", "text": "求职青年在不同服务渠道上的知晓率与使用障碍有何差异？"}],
            "constructs": [{"id": "access-gap", "name": "服务可达性感知", "questionIds": ["rq-1"]}],
            "differentiators": ["聚焦县域公共服务触点与求职阶段匹配度"],
            "unknowns": ["各街道驿站日均人流仍待预调研核实"],
            "firstWeekPlan": ["走访两处街道就业服务站核对抽样框可行性"],
            "sources": [
                {
                    "id": "source-1",
                    "title": "公开就业服务办事指南汇编",
                    "url": "https://example.test/employment-guide",
                    "locator": "第二章服务目录",
                    "coverage": "reference",
                    "publishedAt": "2026-09-01",
                    "retrievedAt": "2026-10-15",
                }
            ],
        },
        "verification": [
            {
                "id": "verify-1",
                "title": "核实街道零工驿站预调研许可",
                "status": "planned",
                "note": "拟于第一周完成现场踏勘。",
                "sourceRefs": ["source-1"],
                "recordedAt": None,
            }
        ],
        "provenance": {
            "catalogVersion": _CATALOG_VERSION,
            "modelVersion": "test-model-v1",
            "sourceIds": ["source-1"],
        },
    }


def _valid_agent_turn_body(**overrides) -> dict:
    body = {
        "schemaVersion": 1,
        "idempotencyKey": str(uuid4()),
        "catalogVersion": _CATALOG_VERSION,
        "profile": _valid_v2_profile(),
        "candidateIds": [_ELIGIBLE_PATTERN_ID],
        "message": "请结合现有调查渠道，先帮我梳理第一周需要核实的招募与抽样条件。",
        "intent": "refine",
        "parentTurnId": None,
        "mode": "local",
        "serviceId": None,
        "serviceRevision": None,
        "consent": False,
        "projectId": PROJECT_A_ID,
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# 1. Unauthenticated (401) & CSRF/Origin (403) Gate Matrix (14 cases)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("GET", "/api/topic-advisor/proposals", None),
        ("GET", f"/api/topic-advisor/proposals/{uuid4()}", None),
        ("POST", "/api/topic-advisor/proposals", {}),
        ("GET", f"/api/projects/{PROJECT_A_ID}/topic", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/topic/versions", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/topic/versions/{uuid4()}", None),
        ("POST", f"/api/projects/{PROJECT_A_ID}/topic/versions", {}),
        ("POST", f"/api/projects/{PROJECT_A_ID}/topic/decisions", {}),
        ("GET", "/api/topic-agent/turns", None),
        ("GET", f"/api/topic-agent/turns/{uuid4()}", None),
        ("GET", f"/api/topic-agent/turns/{uuid4()}/conversation?scope=global", None),
        ("POST", "/api/topic-agent/turns", {}),
    ],
)
def test_unauthenticated_requests_rejected_with_clean_chinese_401(topic_env, method: str, path: str, json_body):
    resp = topic_env["client"].request(
        method,
        path,
        headers={"Origin": TRUSTED_ORIGIN},
        json=json_body,
    )
    _assert_clean_chinese_response(resp, 401)


@pytest.mark.parametrize(
    ("path", "bad_headers"),
    [
        (
            "/api/topic-advisor/proposals",
            {"Origin": "https://evil.example.org", "X-CSRF-Token": "topic-owner-csrf"},
        ),
        (
            f"/api/projects/{PROJECT_A_ID}/topic/versions",
            {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": "forged-csrf-token"},
        ),
        (
            "/api/topic-agent/turns",
            {"Origin": TRUSTED_ORIGIN},
        ),
    ],
)
def test_mutating_topic_endpoints_enforce_origin_and_csrf_token(topic_env, path: str, bad_headers: dict):
    ck, _ = topic_env["creds"]["owner"]
    headers = {"Cookie": f"evix_session={ck}", **bad_headers}
    resp = topic_env["client"].post(path, headers=headers, json={})
    _assert_clean_chinese_response(resp, 403)


# ---------------------------------------------------------------------------
# 2. Topic Evaluation & Proposal Input Validation Matrix (12 cases)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("case_label", "patch_fn", "expected_status"),
    [
        ("bool_days_in_profile", lambda b: b["profile"].update(days=True), 422),
        ("negative_days_in_profile", lambda b: b["profile"].update(days=-5), 422),
        ("excessive_budget_in_profile", lambda b: b["profile"].update(budgetYuan=100_000_001), 422),
        (
            "invalid_zero_region_code",
            lambda b: b["profile"].update(regionRef={"code": "000000", "catalogVersion": _REGION_CATALOG_VERSION}),
            422,
        ),
        (
            "unknown_county_region_code",
            lambda b: b["profile"].update(regionRef={"code": "999999", "catalogVersion": _REGION_CATALOG_VERSION}),
            422,
        ),
        (
            "stale_region_catalog_version",
            lambda b: b["profile"].update(regionRef={"code": "330782", "catalogVersion": "cn-admin-1999"}),
            422,
        ),
        ("nul_control_char_in_goal", lambda b: b.update(goal="实地调研\x00控制字符注入"), 422),
        ("control_char_in_school", lambda b: b["profile"].update(school="测试学院\x07"), 422),
        ("oversized_goal_length", lambda b: b.update(goal="研" * 801), 422),
        ("missing_explicit_consent", lambda b: b.update(consent=False), 422),
        ("stale_topic_catalog_version", lambda b: b.update(catalogVersion="outdated-catalog-v0"), 409),
        ("stale_service_revision", lambda b: b.update(serviceRevision=99), 409),
        ("service_without_research_capability", lambda b: b.update(serviceId=SERVICE_NO_RESEARCH_ID), 422),
        ("api_key_canary_in_goal", lambda b: b.update(goal=f"请用密钥 {CANARY_API_SECRET} 生成选题"), 422),
    ],
)
def test_topic_proposal_validation_rejects_malformed_profiles_regions_and_secrets(
    topic_env,
    case_label: str,
    patch_fn,
    expected_status: int,
):
    body = _valid_proposal_body()
    patch_fn(body)
    resp = topic_env["client"].post(
        "/api/topic-advisor/proposals",
        headers=_headers(topic_env["creds"], "owner"),
        json=body,
    )
    _assert_clean_chinese_response(resp, expected_status)
    assert topic_env["provider"].calls == 0, f"Provider must not be called on invalid case {case_label}"


def test_topic_proposal_oversized_http_body_rejected_cleanly(topic_env):
    oversized_raw = json.dumps({"goal": "超" * 9000}, ensure_ascii=False)
    resp = topic_env["client"].post(
        "/api/topic-advisor/proposals",
        headers={**_headers(topic_env["creds"], "owner"), "Content-Type": "application/json"},
        content=oversized_raw.encode("utf-8"),
    )
    _assert_clean_chinese_response(resp, (413, 422))


def test_topic_proposal_offline_execution_idempotency_and_cross_user_isolation(topic_env):
    client = topic_env["client"]
    owner_hdrs = _headers(topic_env["creds"], "owner")
    outsider_hdrs = _headers(topic_env["creds"], "outsider")

    req_body = _valid_proposal_body()
    created = client.post("/api/topic-advisor/proposals", headers=owner_hdrs, json=req_body)
    receipt = _assert_clean_chinese_response(created, 201)
    assert receipt["status"] == "ready"
    assert receipt["classification"] == "proposed"
    assert receipt["proposal"]["items"][0]["patternId"] == _ELIGIBLE_PATTERN_ID
    assert receipt["sourceVersions"]["regionCatalog"]["catalogVersion"] == _REGION_CATALOG_VERSION
    assert topic_env["provider"].calls == 1

    # Exact idempotent replay never dispatches a second model call
    replayed = client.post("/api/topic-advisor/proposals", headers=owner_hdrs, json=req_body)
    replay_receipt = _assert_clean_chinese_response(replayed, 201)
    assert replay_receipt["id"] == receipt["id"]
    assert topic_env["provider"].calls == 1

    # Owner history & receipt read succeed; outsider receives 404 non-disclosure
    hist = _assert_clean_chinese_response(
        client.get("/api/topic-advisor/proposals", headers=owner_hdrs), 200
    )
    assert any(r["id"] == receipt["id"] for r in hist["receipts"])
    fetched = _assert_clean_chinese_response(
        client.get(f"/api/topic-advisor/proposals/{receipt['id']}", headers=owner_hdrs), 200
    )
    assert fetched["id"] == receipt["id"]

    outsider_get = client.get(f"/api/topic-advisor/proposals/{receipt['id']}", headers=outsider_hdrs)
    _assert_clean_chinese_response(outsider_get, 404)


# ---------------------------------------------------------------------------
# 3. Topic Project CRUD, Version History, CAS Conflicts (409) & RBAC/Tenant Isolation
# ---------------------------------------------------------------------------


def test_topic_project_crud_version_history_and_cas_revision_conflicts(topic_env):
    client = topic_env["client"]
    owner_hdrs = _headers(topic_env["creds"], "owner")
    viewer_hdrs = _headers(topic_env["creds"], "viewer")

    initial = _assert_clean_chinese_response(
        client.get(f"/api/projects/{PROJECT_A_ID}/topic", headers=owner_hdrs), 200
    )
    assert initial["head"] is None
    assert initial["document"] is None
    assert initial["canEdit"] is True

    viewer_initial = _assert_clean_chinese_response(
        client.get(f"/api/projects/{PROJECT_A_ID}/topic", headers=viewer_hdrs), 200
    )
    assert viewer_initial["canEdit"] is False

    # Save revision 1 (expectedRevision=0)
    doc_v1 = _valid_topic_document("义乌市青年就业服务调查第一版")
    save_v1_body = {"expectedRevision": 0, "idempotencyKey": str(uuid4()), "document": doc_v1}
    v1_resp = _assert_clean_chinese_response(
        client.post(f"/api/projects/{PROJECT_A_ID}/topic/versions", headers=owner_hdrs, json=save_v1_body),
        201,
    )
    assert v1_resp["version"]["revision"] == 1
    v1_id = v1_resp["version"]["id"]
    v1_hash = v1_resp["version"]["contentHash"]

    # Idempotent replay of v1 save returns identical revision 1 without conflict
    v1_replay = _assert_clean_chinese_response(
        client.post(f"/api/projects/{PROJECT_A_ID}/topic/versions", headers=owner_hdrs, json=save_v1_body),
        201,
    )
    assert v1_replay["version"]["id"] == v1_id
    assert v1_replay["version"]["revision"] == 1

    # Stale expectedRevision=0 with a new idempotencyKey -> 409 revision_conflict
    stale_save = client.post(
        f"/api/projects/{PROJECT_A_ID}/topic/versions",
        headers=owner_hdrs,
        json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "document": doc_v1},
    )
    stale_err = _assert_clean_chinese_response(stale_save, 409)
    assert stale_err["error"]["code"] == "revision_conflict"

    # Save revision 2 (expectedRevision=1)
    doc_v2 = _valid_topic_document("义乌市青年就业服务调查第二版")
    v2_resp = _assert_clean_chinese_response(
        client.post(
            f"/api/projects/{PROJECT_A_ID}/topic/versions",
            headers=owner_hdrs,
            json={"expectedRevision": 1, "idempotencyKey": str(uuid4()), "document": doc_v2},
        ),
        201,
    )
    assert v2_resp["version"]["revision"] == 2
    v2_id = v2_resp["version"]["id"]
    v2_hash = v2_resp["version"]["contentHash"]

    # Paginated version history & single historical version fetch
    page1 = _assert_clean_chinese_response(
        client.get(f"/api/projects/{PROJECT_A_ID}/topic/versions?limit=1", headers=owner_hdrs), 200
    )
    assert len(page1["versions"]) == 1
    assert page1["versions"][0]["id"] == v2_id
    assert page1["nextBefore"] == 2

    page2 = _assert_clean_chinese_response(
        client.get(f"/api/projects/{PROJECT_A_ID}/topic/versions?limit=1&before=2", headers=owner_hdrs),
        200,
    )
    assert len(page2["versions"]) == 1
    assert page2["versions"][0]["id"] == v1_id
    assert v1_hash == page2["versions"][0]["contentHash"]

    hist_v1 = _assert_clean_chinese_response(
        client.get(f"/api/projects/{PROJECT_A_ID}/topic/versions/{v1_id}", headers=owner_hdrs), 200
    )
    assert hist_v1["document"]["brief"]["title"] == "义乌市青年就业服务调查第一版"

    missing_ver = client.get(f"/api/projects/{PROJECT_A_ID}/topic/versions/{uuid4()}", headers=owner_hdrs)
    _assert_clean_chinese_response(missing_ver, 404)

    # Confirm/revoke decision state machine & CAS conflicts on v2
    confirm_v2 = _assert_clean_chinese_response(
        client.post(
            f"/api/projects/{PROJECT_A_ID}/topic/decisions",
            headers=owner_hdrs,
            json={
                "expectedRevision": 2,
                "expectedDecisionRevision": 0,
                "idempotencyKey": str(uuid4()),
                "versionId": v2_id,
                "contentHash": v2_hash,
                "action": "confirm",
            },
        ),
        201,
    )
    assert confirm_v2["decision"]["status"] == "confirmed"
    assert confirm_v2["decision"]["revision"] == 1

    # Duplicate confirm with fresh key -> 409 decision_conflict
    dup_confirm = client.post(
        f"/api/projects/{PROJECT_A_ID}/topic/decisions",
        headers=owner_hdrs,
        json={
            "expectedRevision": 2,
            "expectedDecisionRevision": 1,
            "idempotencyKey": str(uuid4()),
            "versionId": v2_id,
            "contentHash": v2_hash,
            "action": "confirm",
        },
    )
    _assert_clean_chinese_response(dup_confirm, 409)

    # Tampered contentHash -> 409 revision_conflict
    wrong_hash = client.post(
        f"/api/projects/{PROJECT_A_ID}/topic/decisions",
        headers=owner_hdrs,
        json={
            "expectedRevision": 2,
            "expectedDecisionRevision": 1,
            "idempotencyKey": str(uuid4()),
            "versionId": v2_id,
            "contentHash": "f" * 64,
            "action": "revoke",
        },
    )
    _assert_clean_chinese_response(wrong_hash, 409)

    # Valid revoke -> status becomes revoked, revision=2
    revoked = _assert_clean_chinese_response(
        client.post(
            f"/api/projects/{PROJECT_A_ID}/topic/decisions",
            headers=owner_hdrs,
            json={
                "expectedRevision": 2,
                "expectedDecisionRevision": 1,
                "idempotencyKey": str(uuid4()),
                "versionId": v2_id,
                "contentHash": v2_hash,
                "action": "revoke",
            },
        ),
        201,
    )
    assert revoked["decision"]["status"] == "revoked"
    assert revoked["decision"]["revision"] == 2


def test_topic_project_incomplete_brief_cannot_be_confirmed(topic_env):
    client = topic_env["client"]
    owner_hdrs = _headers(topic_env["creds"], "owner")
    empty_doc = _valid_topic_document("")
    empty_doc["brief"].update(
        title="",
        decisionOwner="",
        decision="",
        population="",
        geography="",
        questions=[],
        constructs=[],
        sources=[],
    )
    empty_doc.update(shortlistIds=[], selected=None, verification=[])
    empty_doc["provenance"]["sourceIds"] = []

    saved = _assert_clean_chinese_response(
        client.post(
            f"/api/projects/{PROJECT_A_ID}/topic/versions",
            headers=owner_hdrs,
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "document": empty_doc},
        ),
        201,
    )
    ver = saved["version"]

    confirm_incomplete = client.post(
        f"/api/projects/{PROJECT_A_ID}/topic/decisions",
        headers=owner_hdrs,
        json={
            "expectedRevision": ver["revision"],
            "expectedDecisionRevision": 0,
            "idempotencyKey": str(uuid4()),
            "versionId": ver["id"],
            "contentHash": ver["contentHash"],
            "action": "confirm",
        },
    )
    err = _assert_clean_chinese_response(confirm_incomplete, 422)
    assert err["error"]["code"] == "brief_incomplete"


@pytest.mark.parametrize(
    ("doc_mutator", "expected_status"),
    [
        (lambda d: d.update(privateField="forbidden"), 422),
        (lambda d: d["brief"].update(title="控制符\x00注入"), 422),
        (lambda d: d["brief"]["sources"][0].update(url="javascript:alert(1)"), 422),
        (lambda d: d["brief"].update(evidencePlan="证" * 3005), 422),
    ],
)
def test_topic_project_document_validation_blocks_unsafe_or_malformed_payloads(
    topic_env,
    doc_mutator,
    expected_status: int,
):
    doc = deepcopy(_valid_topic_document())
    doc_mutator(doc)
    resp = topic_env["client"].post(
        f"/api/projects/{PROJECT_A_ID}/topic/versions",
        headers=_headers(topic_env["creds"], "owner"),
        json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "document": doc},
    )
    _assert_clean_chinese_response(resp, expected_status)


def test_topic_project_oversized_document_rejected_cleanly(topic_env):
    huge_raw = json.dumps(
        {
            "expectedRevision": 0,
            "idempotencyKey": str(uuid4()),
            "document": {"pad": "文" * (topic_project_domain.MAX_DOCUMENT_BYTES + 25000)},
        },
        ensure_ascii=False,
    )
    resp = topic_env["client"].post(
        f"/api/projects/{PROJECT_A_ID}/topic/versions",
        headers={**_headers(topic_env["creds"], "owner"), "Content-Type": "application/json"},
        content=huge_raw.encode("utf-8"),
    )
    _assert_clean_chinese_response(resp, (413, 422))


@pytest.mark.parametrize(
    ("role", "method", "subpath", "expected_status"),
    [
        ("outsider", "GET", "/topic", 404),
        ("outsider", "GET", "/topic/versions", 404),
        ("outsider", "GET", f"/topic/versions/{uuid4()}", 404),
        ("outsider", "POST", "/topic/versions", 404),
        ("outsider", "POST", "/topic/decisions", 404),
        ("viewer", "POST", "/topic/versions", 403),
        ("viewer", "POST", "/topic/decisions", 403),
    ],
)
def test_topic_project_enforces_cross_tenant_404_and_viewer_readonly_403(
    topic_env,
    role: str,
    method: str,
    subpath: str,
    expected_status: int,
):
    body = None
    if subpath == "/topic/versions" and method == "POST":
        body = {"expectedRevision": 0, "idempotencyKey": str(uuid4()), "document": _valid_topic_document()}
    elif subpath == "/topic/decisions":
        body = {
            "expectedRevision": 1,
            "expectedDecisionRevision": 0,
            "idempotencyKey": str(uuid4()),
            "versionId": str(uuid4()),
            "contentHash": "a" * 64,
            "action": "confirm",
        }
    resp = topic_env["client"].request(
        method,
        f"/api/projects/{PROJECT_A_ID}{subpath}",
        headers=_headers(topic_env["creds"], role),
        json=body,
    )
    _assert_clean_chinese_response(resp, expected_status)


# ---------------------------------------------------------------------------
# 4. Topic Agent Offline Execution, Scope Fencing, Non-Survey Guard & Rate Limit
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "off_scope_prompt",
    [
        "请证明梯度下降的收敛定理",
        "设计机翼的空气动力结构",
        "开展临床随机试验比较药物疗效",
        "Synthesize a molecular compound",
    ],
)
def test_topic_agent_rejects_non_survey_engineering_clinical_and_proof_prompts(
    topic_env,
    off_scope_prompt: str,
):
    resp = topic_env["client"].post(
        "/api/topic-agent/turns",
        headers=_headers(topic_env["creds"], "owner"),
        json=_valid_agent_turn_body(message=off_scope_prompt),
    )
    err = _assert_clean_chinese_response(resp, 422)
    assert err["error"]["code"] == "research_scope_unavailable"


def test_topic_agent_deterministic_offline_local_and_model_conversation_with_scope_isolation(topic_env):
    client = topic_env["client"]
    owner_hdrs = _headers(topic_env["creds"], "owner")
    viewer_hdrs = _headers(topic_env["creds"], "viewer")
    outsider_hdrs = _headers(topic_env["creds"], "outsider")

    # 1. Deterministic offline local turn bound to PROJECT_A_ID (zero provider calls)
    turn1_req = _valid_agent_turn_body()
    turn1 = _assert_clean_chinese_response(
        client.post("/api/topic-agent/turns", headers=owner_hdrs, json=turn1_req),
        201,
    )
    assert turn1["status"] == "ready"
    assert turn1["projectId"] == PROJECT_A_ID
    assert len(turn1["assistant"]["items"]) >= 1
    assert topic_env["provider"].calls == 0

    # 2a. Mixing session modes across parentTurnId is blocked with 409 history_conflict
    mixed_mode_req = _valid_agent_turn_body(
        parentTurnId=turn1["id"],
        mode="model",
        serviceId=SERVICE_RESEARCH_ID,
        serviceRevision=1,
        consent=True,
        message="请继续比较第一周最容易落地的拦截抽样时段。",
    )
    mixed_conflict = _assert_clean_chinese_response(
        client.post("/api/topic-agent/turns", headers=owner_hdrs, json=mixed_mode_req),
        409,
    )
    assert mixed_conflict["error"]["code"] == "history_conflict"

    # 2b. Follow-up local-mode turn chained via parentTurnId + standalone offline model-mode turn
    turn2_req = _valid_agent_turn_body(
        parentTurnId=turn1["id"],
        mode="local",
        message="请继续比较第一周最容易落地的拦截抽样时段。",
    )
    turn2 = _assert_clean_chinese_response(
        client.post("/api/topic-agent/turns", headers=owner_hdrs, json=turn2_req),
        201,
    )
    assert turn2["status"] == "ready"
    assert turn2["parentTurnId"] == turn1["id"]
    assert topic_env["provider"].calls == 0

    model_turn_req = _valid_agent_turn_body(
        parentTurnId=None,
        mode="model",
        serviceId=SERVICE_RESEARCH_ID,
        serviceRevision=1,
        consent=True,
        message="请进一步推敲选题表述并压缩研究对象边界。",
    )
    model_turn = _assert_clean_chinese_response(
        client.post("/api/topic-agent/turns", headers=owner_hdrs, json=model_turn_req),
        201,
    )
    assert model_turn["status"] == "ready"
    assert model_turn["mode"] == "model"
    assert topic_env["provider"].calls == 1

    # 3. Conversation endpoint requires explicit matching scope and returns ordered chain
    missing_scope = client.get(f"/api/topic-agent/turns/{turn2['id']}/conversation", headers=owner_hdrs)
    _assert_clean_chinese_response(missing_scope, 422)

    wrong_scope = client.get(
        f"/api/topic-agent/turns/{turn2['id']}/conversation?scope=global",
        headers=owner_hdrs,
    )
    _assert_clean_chinese_response(wrong_scope, (404, 422))

    conv = _assert_clean_chinese_response(
        client.get(
            f"/api/topic-agent/turns/{turn2['id']}/conversation?projectId={PROJECT_A_ID}",
            headers=owner_hdrs,
        ),
        200,
    )
    assert [t["id"] for t in conv["turns"]] == [turn1["id"], turn2["id"]]

    # 4. Viewer cannot create project-scoped turns (403) while outsider gets 404
    viewer_post = client.post(
        "/api/topic-agent/turns",
        headers=viewer_hdrs,
        json=_valid_agent_turn_body(),
    )
    _assert_clean_chinese_response(viewer_post, 403)

    outsider_post = client.post(
        "/api/topic-agent/turns",
        headers=outsider_hdrs,
        json=_valid_agent_turn_body(),
    )
    _assert_clean_chinese_response(outsider_post, 404)

    outsider_hist = client.get(
        f"/api/topic-agent/turns?projectId={PROJECT_A_ID}",
        headers=outsider_hdrs,
    )
    _assert_clean_chinese_response(outsider_hist, 404)


def test_topic_agent_blocks_secret_leak_invalid_query_params_and_enforces_hourly_rate_cap(topic_env):
    client = topic_env["client"]
    owner_hdrs = _headers(topic_env["creds"], "owner")

    # Invalid query parameter combinations on GET /api/topic-agent/turns
    for bad_qs in ("?scope=private", f"?projectId={PROJECT_A_ID}&scope=global", "?unknown=1"):
        resp = client.get(f"/api/topic-agent/turns{bad_qs}", headers=owner_hdrs)
        _assert_clean_chinese_response(resp, 422)

    # Secret canary in model-mode prompt rejected before calling provider
    secret_turn = client.post(
        "/api/topic-agent/turns",
        headers=owner_hdrs,
        json=_valid_agent_turn_body(
            mode="model",
            serviceId=SERVICE_RESEARCH_ID,
            serviceRevision=1,
            consent=True,
            message=f"附带测试密钥 {CANARY_API_SECRET} 请求选题细化",
        ),
    )
    err = _assert_clean_chinese_response(secret_turn, 422)
    assert err["error"]["code"] == "sensitive_input"
    assert topic_env["provider"].calls == 0

    # Hourly 12-call rate cap on model-mode topic_agent -> 429 call_rate_limit
    rate_scope = keyed(topic_env["settings"], "topic-agent-call-rate/v1", OWNER_ID)
    with OrmSession(topic_env["engine"]) as orm_session:
        for _ in range(12):
            orm_session.add(RateEvent(scope=rate_scope))
        orm_session.commit()

    throttled = client.post(
        "/api/topic-agent/turns",
        headers=owner_hdrs,
        json=_valid_agent_turn_body(
            mode="model",
            serviceId=SERVICE_RESEARCH_ID,
            serviceRevision=1,
            consent=True,
            message="第13次模型细化请求应被每小时限流拦截",
        ),
    )
    throttle_err = _assert_clean_chinese_response(throttled, 429)
    assert throttle_err["error"]["code"] == "call_rate_limit"
