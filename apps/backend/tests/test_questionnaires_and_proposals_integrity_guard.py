"""Permanent CI guard #29 (CI-BE-29) for questionnaire and proposal integrity (Wave 30).

Verifies across `questionnaires.py` and `proposals.py`:
1. Questionnaire save/load/version-history optimistic concurrency (`expectedRevision` CAS -> `409`),
   version ceiling (`2_147_483_647` -> `409`), idempotency replay stability & payload-mismatch `409`,
   and payload/design size boundaries (`350 KB` envelope / `300 KB` serialized design -> `413`).
2. Strict item schema, duplicate JSON key, and ASCII control-character rejection (`422`), blocking
   forged `classification`, path-traversal question IDs, duplicate IDs, non-boolean flags, out-of-range
   bounds, and NUL/control bytes.
3. Multi-tenant isolation (`404`), intra-team user-scoped proposal isolation (`404`), viewer read-only
   enforcement (`403`), unauthenticated rejection (`401`), and CSRF / cross-origin write defense (`403`).
4. Full proposal generation -> list -> inspect -> review -> apply (`sourceProposalId`) lifecycle,
   stale/non-ready proposal rejection (`409 stale_proposal`), explicit `consent: True` gate (`422`),
   service capability & revision checks (`422` / `409`), API-secret input/output leak prevention,
   concurrent `running` lock & stale expiry (`429` -> `outcome_unknown`), hourly `12`-call rate cap,
   and `parse_proposal` de-technicalized punctuation purification.
5. 100% pure Chinese de-technicalized error messages (`0` `Traceback`, `0` CJK square/corner brackets,
   `0` internal tech jargon, `0` `500` status codes).
"""
from __future__ import annotations

from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path
import re
from typing import Callable
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import (
    Base,
    Member,
    Proposal,
    Project,
    Service,
    Session as DbSessionModel,
    Team,
    User,
    now,
)
from infrastructure.security import encrypt, keyed
from infrastructure.settings import Settings
from multi_agent.agents.survey_agent.services import proposals as survey_proposals
from shared.errors import ApiError, ProviderFailure
from shared.questionnaire import questionnaire as validate_questionnaire_domain

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-3030-4111-8111-111111111111"
TEAM_B_ID = "22222222-3030-4222-8222-222222222222"
PROJECT_A_ID = "33333333-3030-4333-8333-333333333333"
SERVICE_Q_ID = "44444444-3030-4444-8444-444444444444"
SERVICE_NO_Q_ID = "55555555-3030-4555-8555-555555555555"

OWNER_ID = "aaaaaaaa-3030-4aaa-8aaa-aaaaaaaaaaaa"
COEDITOR_ID = "dddddddd-3030-4ddd-8ddd-dddddddddddd"
VIEWER_ID = "cccccccc-3030-4ccc-8ccc-cccccccccccc"
OUTSIDER_ID = "bbbbbbbb-3030-4bbb-8bbb-bbbbbbbbbbbb"

CANARY_API_SECRET = "sk-qprop-canary-secret-3030abcdef987654"

_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKET_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_INTERNAL_JARGON_RE = re.compile(r"\b(?:ReAct|DAG|EpistemicGraph|BYOK)\b|Track\s*[12]", re.IGNORECASE)
_LEAK_TRACE_OR_PATH_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
)
_EXCEPTION_CLASS_RE = re.compile(
    r"\b(?:ValueError|RuntimeError|TypeError|KeyError|AttributeError|OSError"
    r"|SQLAlchemyError|IntegrityError|OperationalError|ValidationError|RequestValidationError)\b"
)


class ControllableProposalProvider(FixtureProvider):
    """Deterministic offline provider with programmable proposal outcomes."""

    def __init__(self) -> None:
        self.call_count = 0
        self.last_brief = None
        self.custom_handler: Callable[[dict, str, object], object] | None = None

    async def __call__(self, config, key, brief):
        self.call_count += 1
        self.last_brief = brief
        if self.custom_handler is not None:
            result = self.custom_handler(config, key, brief)
            if hasattr(result, "__await__"):
                return await result
            return result
        return _make_raw_proposal_json(4, title="社区智慧助餐服务体验拟议问卷")


def _make_raw_proposal_json(count: int = 4, *, title: str = "消费者体验拟议问卷") -> str:
    items = []
    for idx in range(1, count + 1):
        is_single = idx <= 2
        items.append(
            {
                "text": f"您对社区助餐点第 {idx} 项服务环节的整体体验评价如何？",
                "type": "single" if is_single else "likert",
                "choices": ["满意", "一般", "有待改进"] if is_single else [],
                "researchQuestion": f"核心研究问题 {idx}：评估服务触点满意度分布",
                "decisionUse": f"支撑服务改进决策 {idx}：优化排班与供餐流程",
            }
        )
    return json.dumps(
        {
            "title": title,
            "objective": "识别社区助餐服务关键痛点与满意度驱动因素",
            "population": "过去三个月在社区助餐点就餐的常住居民",
            "items": items,
        },
        ensure_ascii=False,
    )


def _sample_design(*, title: str = "县域社区智慧助餐服务满意度调查问卷", question_count: int = 2) -> dict:
    questions = []
    for idx in range(1, question_count + 1):
        is_single = idx % 2 == 1
        questions.append(
            {
                "id": f"q_{idx}",
                "variable": f"Q{idx}",
                "text": f"请问您近一个月使用社区助餐服务的频率或评价（第 {idx} 题）？",
                "type": "single" if is_single else "likert",
                "required": True,
                "purpose": "screening" if idx == 1 else "research",
                "researchQuestion": f"研究问题 {idx}：居民接触频率与服务感知",
                "construct": f"服务感知维度{idx}",
                "analysis": "description" if is_single else "measurement",
                "decisionUse": "用于制定分时段供餐与补贴优化方案",
                "source": "课题组预调研访谈提炼",
                "choices": (
                    [
                        {"code": "1", "label": "每周三次及以上"},
                        {"code": "2", "label": "每周一至两次"},
                        {"code": "3", "label": "偶尔尝试"},
                    ]
                    if is_single
                    else []
                ),
                "min": None if is_single else 1,
                "max": None if is_single else 5,
                "minLabel": "" if is_single else "非常不满意",
                "maxLabel": "" if is_single else "非常满意",
                "reverse": False,
                "condition": None,
            }
        )
    return {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": title,
        "objective": "系统评估县域社区智慧助餐点供餐质量、价格可负担性与复购意愿之间的关联结构。",
        "population": "年满60周岁且近半年居住于样本社区的常住老年居民及其照护家属。",
        "geography": "样本县城关镇及周边三个街道下辖十二个社区。",
        "period": "2026年10月至2026年11月",
        "recruitment": "采用多阶段分层随机抽样与社区网格名册入户拦访相结合。",
        "introduction": "您好！本调查仅用于学术与公共服务改进研究，全程匿名作答，感谢支持。",
        "pilotNotes": "已完成30份小样本试访并修正题干歧义。",
        "questions": questions,
    }


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


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:qprop_guard_pw@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": [
            "owner@example.test",
            "coeditor@example.test",
            "viewer@example.test",
            "outsider@example.test",
        ],
        "auth_secret": "1a2b3c4d5e6f708192a3b4c5d6e7f809" * 2,
        "keyring": {"v1": "f0e1d2c3b4a5968778695a4b3c2d1e0f" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "proposal_stale_seconds": 60,
        "sav_temp_dir": tmp_path / "sav-qprop-guard",
        "preflight_temp_dir": tmp_path / "preflight-qprop-guard",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_workspace(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    ts_utc = now()
    ts_naive = ts_utc.replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts_naive)

    creds = {
        "owner": ("qprop-owner-cookie-0123456789", "qprop-owner-csrf"),
        "coeditor": ("qprop-coeditor-cookie-2222222222", "qprop-coeditor-csrf"),
        "viewer": ("qprop-viewer-cookie-5555555555", "qprop-viewer-csrf"),
        "outsider": ("qprop-outsider-cookie-9876543210", "qprop-outsider-csrf"),
    }

    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts_naive},
                {"id": COEDITOR_ID, "email": "coeditor@example.test", "created_at": ts_naive},
                {"id": VIEWER_ID, "email": "viewer@example.test", "created_at": ts_naive},
                {"id": OUTSIDER_ID, "email": "outsider@example.test", "created_at": ts_naive},
            ],
        )
        for uid, (cookie_val, csrf_val) in (
            (OWNER_ID, creds["owner"]),
            (COEDITOR_ID, creds["coeditor"]),
            (VIEWER_ID, creds["viewer"]),
            (OUTSIDER_ID, creds["outsider"]),
        ):
            conn.execute(
                DbSessionModel.__table__.insert().values(
                    user_id=uid,
                    token_hash=keyed(settings, "session/v1", cookie_val),
                    csrf=csrf_val,
                    expires_at=ts_naive + timedelta(days=30),
                    revoked_at=None,
                )
            )
        conn.execute(
            Team.__table__.insert(),
            [
                {"id": TEAM_A_ID, "name": "问卷与建议完整性课题组A"},
                {"id": TEAM_B_ID, "name": "外部租户隔离对照课题组B"},
            ],
        )
        conn.execute(
            Member.__table__.insert(),
            [
                {"team_id": TEAM_A_ID, "user_id": OWNER_ID, "role": "owner"},
                {"team_id": TEAM_A_ID, "user_id": COEDITOR_ID, "role": "editor"},
                {"team_id": TEAM_A_ID, "user_id": VIEWER_ID, "role": "viewer"},
                {"team_id": TEAM_B_ID, "user_id": OUTSIDER_ID, "role": "owner"},
            ],
        )
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_A_ID,
                team_id=TEAM_A_ID,
                title="县域社区智慧助餐服务满意度实证研究",
                revision=1,
                questionnaire_revision=0,
                created_at=ts_naive,
            )
        )

    with OrmSession(engine) as orm_session:
        svc_q = Service(
            id=SERVICE_Q_ID,
            user_id=OWNER_ID,
            label="问卷拟议专用模型服务",
            provider="openai",
            base_url="https://api.openai.com/v1",
            model="gpt-4o-mini",
            max_output_tokens=2400,
            capabilities=["questionnaire", "topic"],
            revision=1,
            key_id=settings.active_key_id,
            iv=b"\x00" * 12,
            ciphertext=b"",
            deleted=False,
        )
        encrypt(settings, svc_q, CANARY_API_SECRET)

        svc_no_q = Service(
            id=SERVICE_NO_Q_ID,
            user_id=OWNER_ID,
            label="仅报告写作不含问卷能力服务",
            provider="openai",
            base_url="https://api.openai.com/v1",
            model="gpt-4o-mini",
            max_output_tokens=2400,
            capabilities=["report"],
            revision=1,
            key_id=settings.active_key_id,
            iv=b"\x00" * 12,
            ciphertext=b"",
            deleted=False,
        )
        encrypt(settings, svc_no_q, CANARY_API_SECRET)
        orm_session.add_all([svc_q, svc_no_q])
        orm_session.commit()

    return creds


def _auth_headers(cookie_val: str, csrf_val: str, *, origin: str = TRUSTED_ORIGIN) -> dict[str, str]:
    return {
        "Origin": origin,
        "Cookie": f"evix_session={cookie_val}",
        "X-CSRF-Token": csrf_val,
    }


def _extract_error_fields(payload: dict) -> tuple[str, str]:
    if isinstance(payload.get("error"), dict):
        err = payload["error"]
        return str(err.get("code") or ""), str(err.get("message") or "")
    return str(payload.get("code") or ""), str(payload.get("message") or payload.get("detail") or "")


def _assert_clean_chinese_error(resp, expected_status: int, expected_code: str | None = None) -> str:
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    assert resp.status_code < 500, f"Unexpected 5xx response: {resp.text}"
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert "no-store" in (resp.headers.get("cache-control") or "")

    raw_text = resp.text
    assert CANARY_API_SECRET not in raw_text
    assert not _FORBIDDEN_BRACKET_RE.search(raw_text), f"Forbidden CJK brackets in error body: {raw_text}"
    assert not _INTERNAL_JARGON_RE.search(raw_text), f"Internal tech jargon leaked in error body: {raw_text}"
    assert not _LEAK_TRACE_OR_PATH_RE.search(raw_text), f"Stack trace or host path leaked: {raw_text}"
    assert not _EXCEPTION_CLASS_RE.search(raw_text), f"Python exception class leaked: {raw_text}"

    body = resp.json()
    code, message = _extract_error_fields(body)
    assert message.strip(), f"Empty error message in {body}"
    assert _CHINESE_CHAR_RE.search(message), f"Error message must be pure Chinese: {message!r}"
    if expected_code is not None:
        assert code == expected_code, f"Expected error code {expected_code!r}, got {code!r} ({body})"
    return message


@pytest.fixture
def guard_env(tmp_path: Path, monkeypatch):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    provider = ControllableProposalProvider()
    app = create_app(settings=settings, provider=provider, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield {
            "client": client,
            "engine": engine,
            "settings": settings,
            "creds": creds,
            "provider": provider,
        }
    engine.dispose()


# ---------------------------------------------------------------------------
# 1. Questionnaire CRUD, Version History Pagination, CAS & Idempotency
# ---------------------------------------------------------------------------


def test_empty_project_questionnaire_get_and_versions_return_clean_empty_state(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    q_resp = client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire", headers=headers)
    assert q_resp.status_code == 200
    assert q_resp.json() == {"questionnaire": None}

    v_resp = client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=headers)
    assert v_resp.status_code == 200
    assert v_resp.json() == {"versions": [], "nextBeforeRevision": None}


def test_questionnaire_save_load_and_version_history_cas_progression(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    saved_ids: list[str] = []
    for rev in (0, 1, 2):
        design = _sample_design(title=f"社区助餐调查问卷第{rev + 1}版", question_count=2 + rev)
        resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            headers=headers,
            json={
                "design": design,
                "expectedRevision": rev,
                "idempotencyKey": str(uuid4()),
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["revision"] == rev + 1
        assert data["projectId"] == PROJECT_A_ID
        assert data["design"]["title"] == f"社区助餐调查问卷第{rev + 1}版"
        assert len(data["design"]["questions"]) == 2 + rev
        saved_ids.append(data["id"])

    head_resp = client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire", headers=headers)
    assert head_resp.status_code == 200
    head_q = head_resp.json()["questionnaire"]
    assert head_q["revision"] == 3
    assert head_q["id"] == saved_ids[2]
    assert head_q["design"]["title"] == "社区助餐调查问卷第3版"

    list_resp = client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=headers)
    assert list_resp.status_code == 200
    versions = list_resp.json()["versions"]
    assert [v["revision"] for v in versions] == [3, 2, 1]
    assert [v["id"] for v in versions] == [saved_ids[2], saved_ids[1], saved_ids[0]]

    paged_resp = client.get(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions?beforeRevision=3",
        headers=headers,
    )
    assert paged_resp.status_code == 200
    assert [v["revision"] for v in paged_resp.json()["versions"]] == [2, 1]

    bad_cursor = client.get(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions?beforeRevision=0",
        headers=headers,
    )
    _assert_clean_chinese_error(bad_cursor, 422)

    v1_resp = client.get(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{saved_ids[0]}",
        headers=headers,
    )
    assert v1_resp.status_code == 200
    assert v1_resp.json()["revision"] == 1
    assert v1_resp.json()["design"]["title"] == "社区助餐调查问卷第1版"

    binding_resp = client.get(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{saved_ids[0]}/topic-binding",
        headers=headers,
    )
    assert binding_resp.status_code == 200
    binding_body = binding_resp.json()
    assert binding_body["versionId"] == saved_ids[0]
    assert binding_body["binding"] is None
    assert binding_body["bindingHash"] is None
    assert re.fullmatch(r"[0-9a-f]{64}", binding_body["designTransferHash"])


def test_questionnaire_topic_binding_mutation_and_tamper_integrity_guards(guard_env):
    client: TestClient = guard_env["client"]
    engine = guard_env["engine"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    saved = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
    )
    assert saved.status_code == 201
    version_id = saved.json()["id"]

    bad_hash_mutation = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": _sample_design(title="关联哈希不匹配写入"),
            "expectedRevision": 1,
            "idempotencyKey": str(uuid4()),
            "topicBindingMutation": {
                "kind": "restore",
                "hashContract": "evix-topic-transfer-json/1",
                "expectedBindingHash": "f" * 64,
                "origin": {"questionnaireVersionId": version_id},
            },
        },
    )
    _assert_clean_chinese_error(bad_hash_mutation, 409, "binding_conflict")

    missing_origin_mutation = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": _sample_design(title="恢复不存在来源版本"),
            "expectedRevision": 1,
            "idempotencyKey": str(uuid4()),
            "topicBindingMutation": {
                "kind": "restore",
                "hashContract": "evix-topic-transfer-json/1",
                "expectedBindingHash": None,
                "origin": {"questionnaireVersionId": str(uuid4())},
            },
        },
    )
    _assert_clean_chinese_error(missing_origin_mutation, 404, "not_found")

    from infrastructure.database.models import QuestionnaireTopicBinding

    with engine.begin() as conn:
        conn.execute(
            update(QuestionnaireTopicBinding)
            .where(QuestionnaireTopicBinding.version_id == version_id)
            .values(design_transfer_hash="0" * 64)
        )

    tampered_receipt = client.get(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{version_id}/topic-binding",
        headers=headers,
    )
    _assert_clean_chinese_error(tampered_receipt, 409, "binding_integrity")


def test_questionnaire_save_stale_and_future_expected_revision_return_409_conflict(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    for rev in (0, 1):
        ok = client.post(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            headers=headers,
            json={"design": _sample_design(), "expectedRevision": rev, "idempotencyKey": str(uuid4())},
        )
        assert ok.status_code == 201

    for bad_expected in (0, 1, 3, 99):
        conflict = client.post(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            headers=headers,
            json={
                "design": _sample_design(title="并发冲突写入尝试"),
                "expectedRevision": bad_expected,
                "idempotencyKey": str(uuid4()),
            },
        )
        msg = _assert_clean_chinese_error(conflict, 409, "revision_conflict")
        assert "版本" in msg

    head_q = client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire", headers=headers).json()["questionnaire"]
    assert head_q["revision"] == 2


def test_questionnaire_save_version_limit_ceiling_returns_409(guard_env):
    client: TestClient = guard_env["client"]
    engine = guard_env["engine"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    with engine.begin() as conn:
        conn.execute(
            update(Project)
            .where(Project.id == PROJECT_A_ID)
            .values(questionnaire_revision=2_147_483_647, revision=2_147_483_647)
        )

    resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": _sample_design(),
            "expectedRevision": 2_147_483_647,
            "idempotencyKey": str(uuid4()),
        },
    )
    msg = _assert_clean_chinese_error(resp, 409, "version_limit")
    assert "上限" in msg


def test_questionnaire_idempotency_exact_replay_and_payload_mismatch_conflict(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])
    idem_key = str(uuid4())
    payload = {
        "design": _sample_design(title="幂等重放基准问卷"),
        "expectedRevision": 0,
        "idempotencyKey": idem_key,
    }

    first = client.post(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=headers, json=payload)
    assert first.status_code == 201
    second = client.post(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=headers, json=payload)
    assert second.status_code == 201
    assert second.json() == first.json()

    versions = client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=headers).json()["versions"]
    assert len(versions) == 1

    tampered = {
        "design": _sample_design(title="篡改标题但复用同一幂等键"),
        "expectedRevision": 0,
        "idempotencyKey": idem_key,
    }
    conflict = client.post(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=headers, json=tampered)
    _assert_clean_chinese_error(conflict, 409, "idempotency_conflict")


def test_questionnaire_get_version_and_topic_binding_nonexistent_or_bad_uuid(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])
    missing_id = str(uuid4())

    for suffix in ("", "/topic-binding"):
        not_found = client.get(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{missing_id}{suffix}",
            headers=headers,
        )
        _assert_clean_chinese_error(not_found, 404, "not_found")

        for bad_uuid in ("not-a-valid-uuid", "00000000-0000-0000-0000-000000000000"):
            invalid = client.get(
                f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{bad_uuid}{suffix}",
                headers=headers,
            )
            _assert_clean_chinese_error(invalid, 422)


def test_questionnaire_payload_size_caps_and_media_type_enforced(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    wrong_ct = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers={**headers, "Content-Type": "text/plain"},
        content=b"{}",
    )
    _assert_clean_chinese_error(wrong_ct, 415, "unsupported_media_type")

    valid_body = json.dumps(
        {"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
        ensure_ascii=False,
    ).encode("utf-8")
    oversized_raw = valid_body + b" " * (350_005 - len(valid_body))
    too_big = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers={**headers, "Content-Type": "application/json"},
        content=oversized_raw,
    )
    _assert_clean_chinese_error(too_big, 413, "payload_too_large")

    huge_design = _sample_design(question_count=80)
    for idx, q in enumerate(huge_design["questions"]):
        q["text"] = f"题干扩展文本{idx}：" + ("访谈量表测量条目详细描述" * 45)
        q["researchQuestion"] = "核心研究问题详细界定" * 45
        q["decisionUse"] = "公共管理资源配置决策依据" * 35
        q["source"] = "文献与预调研综合改编条目来源" * 30
    with pytest.raises(ApiError) as exc_info:
        validate_questionnaire_domain(huge_design)
    assert exc_info.value.status == 413
    assert exc_info.value.code == "design_too_large"
    assert not _FORBIDDEN_BRACKET_RE.search(exc_info.value.message)


def test_questionnaire_strict_json_rejects_duplicate_keys_malformed_and_bad_utf8(guard_env):
    client: TestClient = guard_env["client"]
    headers = {**_auth_headers(*guard_env["creds"]["owner"]), "Content-Type": "application/json"}

    dup_raw = (
        '{"expectedRevision": 0, "expectedRevision": 0, '
        f'"idempotencyKey": "{uuid4()}", "design": {{}}}}'
    ).encode("utf-8")
    dup_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        content=dup_raw,
    )
    _assert_clean_chinese_error(dup_resp, 422, "duplicate_members")

    malformed_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        content=b'{"expectedRevision": 0, "idempotencyKey": ',
    )
    _assert_clean_chinese_error(malformed_resp, 422, "invalid_json")

    bad_utf8_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        content=b"\xff\xfe\xfa\x00",
    )
    _assert_clean_chinese_error(bad_utf8_resp, 422)


# ---------------------------------------------------------------------------
# 2. Item Schema & ASCII Control-Character Rejection Matrix (14 cases)
# ---------------------------------------------------------------------------


def _mutate_bad_schema(d: dict) -> None:
    d["schema"] = "questionnaire-design/v2"


def _mutate_forged_classification(d: dict) -> None:
    d["classification"] = "verified"


def _mutate_title_nul_char(d: dict) -> None:
    d["title"] = "社区助餐调查\x00注入标题"


def _mutate_stem_escape_control_char(d: dict) -> None:
    d["questions"][0]["text"] = "题干包含终端控制符\x1b[31m红色"


def _mutate_choice_vertical_tab_char(d: dict) -> None:
    d["questions"][0]["choices"][0]["label"] = "选项包含\x0b控制符"


def _mutate_duplicate_question_id(d: dict) -> None:
    d["questions"][1]["id"] = d["questions"][0]["id"]


def _mutate_traversal_question_id(d: dict) -> None:
    d["questions"][0]["id"] = "../etc/passwd"


def _mutate_too_many_questions(d: dict) -> None:
    template = deepcopy(d["questions"][1])
    d["questions"] = [{**deepcopy(template), "id": f"q_{i}", "variable": f"Q{i}"} for i in range(1, 82)]


def _mutate_invalid_question_type(d: dict) -> None:
    d["questions"][0]["type"] = "matrix_grid"


def _mutate_invalid_analysis_and_purpose(d: dict) -> None:
    d["questions"][0]["analysis"] = "causal_claim"


def _mutate_non_boolean_required_flag(d: dict) -> None:
    d["questions"][0]["required"] = 1


def _mutate_out_of_range_numeric_bound(d: dict) -> None:
    d["questions"][1]["max"] = 10_000_000_000


def _mutate_too_many_choices(d: dict) -> None:
    d["questions"][0]["choices"] = [{"code": str(i), "label": f"选项{i}"} for i in range(1, 32)]


def _mutate_unexpected_extra_property(d: dict) -> None:
    d["questions"][0]["unexpectedExtraField"] = "forbidden"


@pytest.mark.parametrize(
    ("case_id", "mutator"),
    [
        ("bad_schema", _mutate_bad_schema),
        ("forged_classification", _mutate_forged_classification),
        ("title_nul_char", _mutate_title_nul_char),
        ("stem_escape_control_char", _mutate_stem_escape_control_char),
        ("choice_vertical_tab_char", _mutate_choice_vertical_tab_char),
        ("duplicate_question_id", _mutate_duplicate_question_id),
        ("traversal_question_id", _mutate_traversal_question_id),
        ("too_many_questions_81", _mutate_too_many_questions),
        ("invalid_question_type", _mutate_invalid_question_type),
        ("invalid_analysis_mode", _mutate_invalid_analysis_and_purpose),
        ("non_boolean_required_flag", _mutate_non_boolean_required_flag),
        ("out_of_range_numeric_bound", _mutate_out_of_range_numeric_bound),
        ("too_many_choices_31", _mutate_too_many_choices),
        ("unexpected_extra_property", _mutate_unexpected_extra_property),
    ],
    ids=lambda item: item if isinstance(item, str) else "",
)
def test_questionnaire_rejects_invalid_schema_items_and_control_characters(guard_env, case_id: str, mutator):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    bad_design = _sample_design()
    mutator(bad_design)

    resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": bad_design,
            "expectedRevision": 0,
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_error(resp, 422)


# ---------------------------------------------------------------------------
# 3. Authentication, CSRF/Origin, Viewer Read-Only (`403`) & Multi-Tenant (`404`)
# ---------------------------------------------------------------------------


def test_unauthenticated_and_tampered_cookie_rejected_with_401_across_all_endpoints(guard_env):
    client: TestClient = guard_env["client"]
    fake_vid = str(uuid4())
    fake_pid = str(uuid4())
    endpoints = [
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{fake_vid}", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{fake_vid}/topic-binding", None),
        (
            "POST",
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            {"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
        ),
        ("GET", f"/api/projects/{PROJECT_A_ID}/proposals", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/proposals/{fake_pid}", None),
        (
            "POST",
            f"/api/projects/{PROJECT_A_ID}/proposals",
            {
                "serviceId": SERVICE_Q_ID,
                "serviceRevision": 1,
                "brief": "社区助餐满意度调查",
                "expectedQuestionnaireRevision": 0,
                "idempotencyKey": str(uuid4()),
                "consent": True,
            },
        ),
    ]

    for method, url, payload in endpoints:
        no_cookie_resp = client.request(method, url, headers={"Origin": TRUSTED_ORIGIN}, json=payload)
        _assert_clean_chinese_error(no_cookie_resp, 401, "session_required")

        tampered_resp = client.request(
            method,
            url,
            headers=_auth_headers("tampered-unknown-session-token", "any-csrf"),
            json=payload,
        )
        _assert_clean_chinese_error(tampered_resp, 401, "session_required")


def test_csrf_and_cross_site_origin_blocked_on_questionnaire_and_proposal_writes(guard_env):
    client: TestClient = guard_env["client"]
    owner_cookie, owner_csrf = guard_env["creds"]["owner"]

    q_payload = {"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())}
    p_payload = {
        "serviceId": SERVICE_Q_ID,
        "serviceRevision": 1,
        "brief": "研究社区助餐满意度",
        "expectedQuestionnaireRevision": 0,
        "idempotencyKey": str(uuid4()),
        "consent": True,
    }

    for url, body in (
        (f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", q_payload),
        (f"/api/projects/{PROJECT_A_ID}/proposals", p_payload),
    ):
        missing_csrf = client.post(
            url,
            headers={"Origin": TRUSTED_ORIGIN, "Cookie": f"evix_session={owner_cookie}"},
            json=body,
        )
        _assert_clean_chinese_error(missing_csrf, 403, "csrf_required")

        bad_origin = client.post(
            url,
            headers=_auth_headers(owner_cookie, owner_csrf, origin="https://attacker.example"),
            json=body,
        )
        _assert_clean_chinese_error(bad_origin, 403, "origin_forbidden")

        cross_site = client.post(
            url,
            headers={**_auth_headers(owner_cookie, owner_csrf), "Sec-Fetch-Site": "cross-site"},
            json=body,
        )
        _assert_clean_chinese_error(cross_site, 403, "origin_forbidden")


def test_viewer_can_read_questionnaires_and_proposals_but_write_is_blocked_with_403(guard_env):
    client: TestClient = guard_env["client"]
    owner_headers = _auth_headers(*guard_env["creds"]["owner"])
    viewer_headers = _auth_headers(*guard_env["creds"]["viewer"])

    saved = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=owner_headers,
        json={"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
    )
    assert saved.status_code == 201
    version_id = saved.json()["id"]

    assert client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire", headers=viewer_headers).status_code == 200
    assert client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", headers=viewer_headers).status_code == 200
    assert (
        client.get(f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{version_id}", headers=viewer_headers).status_code
        == 200
    )
    assert (
        client.get(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{version_id}/topic-binding",
            headers=viewer_headers,
        ).status_code
        == 200
    )
    assert client.get(f"/api/projects/{PROJECT_A_ID}/proposals", headers=viewer_headers).status_code == 200

    viewer_save = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=viewer_headers,
        json={"design": _sample_design(title="只读成员越权保存"), "expectedRevision": 1, "idempotencyKey": str(uuid4())},
    )
    _assert_clean_chinese_error(viewer_save, 403)

    viewer_propose = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=viewer_headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "只读成员越权发起问卷拟议",
            "expectedQuestionnaireRevision": 1,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(viewer_propose, 403)


def test_cross_tenant_outsider_isolated_with_404_on_all_questionnaire_and_proposal_routes(guard_env):
    client: TestClient = guard_env["client"]
    owner_headers = _auth_headers(*guard_env["creds"]["owner"])
    outsider_headers = _auth_headers(*guard_env["creds"]["outsider"])

    saved = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=owner_headers,
        json={"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
    )
    assert saved.status_code == 201
    version_id = saved.json()["id"]

    prop = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=owner_headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "跨租户隔离基准建议",
            "expectedQuestionnaireRevision": 1,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert prop.status_code == 201
    proposal_id = prop.json()["id"]

    checks = [
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire/versions", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{version_id}", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/questionnaire/versions/{version_id}/topic-binding", None),
        (
            "POST",
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            {"design": _sample_design(), "expectedRevision": 1, "idempotencyKey": str(uuid4())},
        ),
        ("GET", f"/api/projects/{PROJECT_A_ID}/proposals", None),
        ("GET", f"/api/projects/{PROJECT_A_ID}/proposals/{proposal_id}", None),
        (
            "POST",
            f"/api/projects/{PROJECT_A_ID}/proposals",
            {
                "serviceId": SERVICE_Q_ID,
                "serviceRevision": 1,
                "brief": "跨租户盗用尝试",
                "expectedQuestionnaireRevision": 1,
                "idempotencyKey": str(uuid4()),
                "consent": True,
            },
        ),
    ]
    for method, url, payload in checks:
        resp = client.request(method, url, headers=outsider_headers, json=payload)
        _assert_clean_chinese_error(resp, 404, "not_found")


def test_proposal_user_scoping_within_same_team_isolates_private_proposals(guard_env):
    client: TestClient = guard_env["client"]
    owner_headers = _auth_headers(*guard_env["creds"]["owner"])
    coeditor_headers = _auth_headers(*guard_env["creds"]["coeditor"])

    prop_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=owner_headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "项目负责人个人模型连接生成的建议",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert prop_resp.status_code == 201
    proposal_data = prop_resp.json()
    proposal_id = proposal_data["id"]

    coeditor_list = client.get(f"/api/projects/{PROJECT_A_ID}/proposals", headers=coeditor_headers)
    assert coeditor_list.status_code == 200
    assert coeditor_list.json()["proposals"] == []

    coeditor_detail = client.get(
        f"/api/projects/{PROJECT_A_ID}/proposals/{proposal_id}",
        headers=coeditor_headers,
    )
    _assert_clean_chinese_error(coeditor_detail, 404, "not_found")

    coeditor_apply = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=coeditor_headers,
        json={
            "design": proposal_data["design"],
            "expectedRevision": 0,
            "sourceProposalId": proposal_id,
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_error(coeditor_apply, 404, "not_found")


# ---------------------------------------------------------------------------
# 4. Proposal Lifecycle, State Transitions, Secrets & Rate/Concurrency Limits
# ---------------------------------------------------------------------------


def test_proposal_full_generate_list_get_review_and_apply_to_questionnaire_lifecycle(guard_env):
    client: TestClient = guard_env["client"]
    provider: ControllableProposalProvider = guard_env["provider"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    gen_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "围绕县域社区智慧助餐点老年居民就餐体验与价格敏感度设计一份拟议问卷",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert gen_resp.status_code == 201, gen_resp.text
    created = gen_resp.json()
    assert provider.call_count == 1
    assert created["status"] == "ready"
    assert created["inputRevision"] == 0
    assert created["serviceId"] == SERVICE_Q_ID
    assert created["design"]["classification"] == "proposed"
    assert len(created["design"]["questions"]) == 4
    assert "尚未开展预测试" in created["design"]["pilotNotes"]

    list_resp = client.get(f"/api/projects/{PROJECT_A_ID}/proposals", headers=headers)
    assert list_resp.status_code == 200
    summaries = list_resp.json()["proposals"]
    assert len(summaries) == 1
    assert summaries[0]["id"] == created["id"]
    assert summaries[0]["title"] == "社区智慧助餐服务体验拟议问卷"
    assert "design" not in summaries[0]

    detail_resp = client.get(f"/api/projects/{PROJECT_A_ID}/proposals/{created['id']}", headers=headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["design"] == created["design"]

    reviewed_design = deepcopy(created["design"])
    reviewed_design["geography"] = "样本县三个街道社区助餐服务网点"
    apply_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": reviewed_design,
            "expectedRevision": 0,
            "sourceProposalId": created["id"],
            "idempotencyKey": str(uuid4()),
        },
    )
    assert apply_resp.status_code == 201, apply_resp.text
    applied = apply_resp.json()
    assert applied["revision"] == 1
    assert applied["design"]["geography"] == "样本县三个街道社区助餐服务网点"


def test_proposal_apply_rejects_stale_input_revision_after_questionnaire_advances(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    gen_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "基于版本0生成的初始建议",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert gen_resp.status_code == 201
    old_proposal = gen_resp.json()

    manual_save = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={"design": _sample_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
    )
    assert manual_save.status_code == 201

    stale_apply = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": old_proposal["design"],
            "expectedRevision": 1,
            "sourceProposalId": old_proposal["id"],
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_error(stale_apply, 409, "stale_proposal")


def test_proposal_apply_rejects_non_ready_failed_or_running_proposals(guard_env):
    client: TestClient = guard_env["client"]
    engine = guard_env["engine"]
    provider: ControllableProposalProvider = guard_env["provider"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    provider.custom_handler = lambda _cfg, _key, _brief: "not valid json {{"
    failed_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "触发无效输出从而落入failed状态",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert failed_resp.status_code == 201
    assert failed_resp.json()["status"] == "failed"
    failed_id = failed_resp.json()["id"]

    apply_failed = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": _sample_design(),
            "expectedRevision": 0,
            "sourceProposalId": failed_id,
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_error(apply_failed, 409, "stale_proposal")

    running_id = str(uuid4())
    with OrmSession(engine) as orm_session:
        orm_session.add(
            Proposal(
                id=running_id,
                user_id=OWNER_ID,
                project_id=PROJECT_A_ID,
                service_id=SERVICE_Q_ID,
                service_revision=1,
                input_revision=0,
                idempotency_key=str(uuid4()),
                payload_hash="a" * 64,
                status="running",
                design=_sample_design(),
            )
        )
        orm_session.commit()

    apply_running = client.post(
        f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
        headers=headers,
        json={
            "design": _sample_design(),
            "expectedRevision": 0,
            "sourceProposalId": running_id,
            "idempotencyKey": str(uuid4()),
        },
    )
    _assert_clean_chinese_error(apply_running, 409, "stale_proposal")


def test_proposal_generation_requires_explicit_consent_boolean_true(guard_env):
    client: TestClient = guard_env["client"]
    provider: ControllableProposalProvider = guard_env["provider"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    for non_true_consent, expected_code in (
        (False, "consent_required"),
        ("true", "consent_required"),
        (1, "consent_required"),
        (None, "consent_required"),
    ):
        resp = client.post(
            f"/api/projects/{PROJECT_A_ID}/proposals",
            headers=headers,
            json={
                "serviceId": SERVICE_Q_ID,
                "serviceRevision": 1,
                "brief": "需要明确勾选外部调用同意后才能发送",
                "expectedQuestionnaireRevision": 0,
                "idempotencyKey": str(uuid4()),
                "consent": non_true_consent,
            },
        )
        _assert_clean_chinese_error(resp, 422, expected_code)

    assert provider.call_count == 0


def test_proposal_generation_checks_service_revision_capability_and_questionnaire_revision(guard_env):
    client: TestClient = guard_env["client"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    wrong_svc_rev = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 2,
            "brief": "服务版本号不匹配测试",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(wrong_svc_rev, 409, "revision_conflict")

    no_cap = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_NO_Q_ID,
            "serviceRevision": 1,
            "brief": "未启用问卷能力的服务",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(no_cap, 422, "capability_unavailable")

    wrong_q_rev = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "问卷预期版本不匹配测试",
            "expectedQuestionnaireRevision": 3,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(wrong_q_rev, 409, "revision_conflict")

    blank_brief = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "   \n\t  ",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(blank_brief, 422)


def test_proposal_generation_idempotency_replay_and_conflict(guard_env):
    client: TestClient = guard_env["client"]
    provider: ControllableProposalProvider = guard_env["provider"]
    headers = _auth_headers(*guard_env["creds"]["owner"])
    idem_key = str(uuid4())

    payload = {
        "serviceId": SERVICE_Q_ID,
        "serviceRevision": 1,
        "brief": "社区助餐满意度拟议问卷幂等核验",
        "expectedQuestionnaireRevision": 0,
        "idempotencyKey": idem_key,
        "consent": True,
    }
    first = client.post(f"/api/projects/{PROJECT_A_ID}/proposals", headers=headers, json=payload)
    assert first.status_code == 201
    assert provider.call_count == 1

    replay = client.post(f"/api/projects/{PROJECT_A_ID}/proposals", headers=headers, json=payload)
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert provider.call_count == 1

    conflict = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={**payload, "brief": "更改需求文本但复用同一操作标识"},
    )
    _assert_clean_chinese_error(conflict, 409, "idempotency_conflict")


def test_proposal_generation_blocks_api_key_in_brief_and_in_provider_output(guard_env):
    client: TestClient = guard_env["client"]
    provider: ControllableProposalProvider = guard_env["provider"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    leak_in_brief = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": f"请使用我的密钥 {CANARY_API_SECRET} 生成问卷",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(leak_in_brief, 422, "sensitive_input")
    assert provider.call_count == 0

    provider.custom_handler = lambda _cfg, key, _brief: _make_raw_proposal_json(4, title=f"回显密钥{key}")
    echoed_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "正常研究需求但模拟模型意外回显密钥",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert echoed_resp.status_code == 201
    assert CANARY_API_SECRET not in echoed_resp.text
    body = echoed_resp.json()
    assert body["status"] == "failed"
    assert body["errorCode"] == "invalid_response"
    assert "design" not in body


def test_proposal_concurrency_active_guard_stale_expiry_and_hourly_rate_limit(guard_env):
    client: TestClient = guard_env["client"]
    engine = guard_env["engine"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    fresh_running_id = str(uuid4())
    with OrmSession(engine) as orm_session:
        orm_session.add(
            Proposal(
                id=fresh_running_id,
                user_id=OWNER_ID,
                project_id=PROJECT_A_ID,
                service_id=SERVICE_Q_ID,
                service_revision=1,
                input_revision=0,
                idempotency_key=str(uuid4()),
                payload_hash="b" * 64,
                status="running",
                created_at=now(),
            )
        )
        orm_session.commit()

    blocked_active = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "已有进行中任务时并发提交",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(blocked_active, 429, "call_active")

    with engine.begin() as conn:
        conn.execute(
            update(Proposal)
            .where(Proposal.id == fresh_running_id)
            .values(created_at=now() - timedelta(seconds=120))
        )

    expired_detail = client.get(
        f"/api/projects/{PROJECT_A_ID}/proposals/{fresh_running_id}",
        headers=headers,
    )
    assert expired_detail.status_code == 200
    assert expired_detail.json()["status"] == "outcome_unknown"
    assert expired_detail.json()["errorCode"] == "interrupted_call"

    with OrmSession(engine) as orm_session:
        for i in range(12):
            orm_session.add(
                Proposal(
                    id=str(uuid4()),
                    user_id=OWNER_ID,
                    project_id=PROJECT_A_ID,
                    service_id=SERVICE_Q_ID,
                    service_revision=1,
                    input_revision=0,
                    idempotency_key=str(uuid4()),
                    payload_hash=f"{i:064x}",
                    status="ready",
                    created_at=now() - timedelta(minutes=10),
                )
            )
        orm_session.commit()

    rate_limited = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "超出每小时12次限额测试",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    _assert_clean_chinese_error(rate_limited, 429, "call_rate_limit")


def test_proposal_provider_failures_and_timeouts_map_cleanly_without_500_or_tracebacks(guard_env):
    client: TestClient = guard_env["client"]
    provider: ControllableProposalProvider = guard_env["provider"]
    headers = _auth_headers(*guard_env["creds"]["owner"])

    def _raise_timeout(_cfg, _key, _brief):
        raise TimeoutError("upstream gateway timed out")

    provider.custom_handler = _raise_timeout
    timeout_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "模拟上游模型响应超时",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert timeout_resp.status_code == 201
    assert timeout_resp.json()["status"] == "outcome_unknown"
    assert timeout_resp.json()["errorCode"] == "provider_timeout"

    def _raise_unexpected(_cfg, _key, _brief):
        raise RuntimeError("Traceback (most recent call last): internal adapter failure")

    provider.custom_handler = _raise_unexpected
    crash_resp = client.post(
        f"/api/projects/{PROJECT_A_ID}/proposals",
        headers=headers,
        json={
            "serviceId": SERVICE_Q_ID,
            "serviceRevision": 1,
            "brief": "模拟上游驱动抛出未捕获异常",
            "expectedQuestionnaireRevision": 0,
            "idempotencyKey": str(uuid4()),
            "consent": True,
        },
    )
    assert crash_resp.status_code == 201
    assert "Traceback" not in crash_resp.text
    assert "RuntimeError" not in crash_resp.text
    assert crash_resp.json()["status"] == "outcome_unknown"
    assert crash_resp.json()["errorCode"] == "provider_failure"


# ---------------------------------------------------------------------------
# 5. Survey-Agent Proposal Parser De-Technicalization & Bounds Contracts
# ---------------------------------------------------------------------------


def test_parse_proposal_purifies_forbidden_brackets_braces_and_colon_prefixes():
    noisy_raw = json.dumps(
        {
            "title": "\u3010社区助餐\u3011居民满意度\u300c拟议问卷\u300d{初稿}",
            "objective": "研究目的：评估\u300e助餐食堂\u300f餐品质量与价格感知",
            "population": "调查对象：[常住老年居民]与照护家属",
            "items": [
                {
                    "text": "Q1: 您对\u3010社区助餐点\u3011卫生状况是否满意？",
                    "type": "single",
                    "choices": ["\u300c非常满意\u300d", "[基本满意]", "{不满意}"],
                    "researchQuestion": "研究问题：就餐环境卫生感知分布",
                    "decisionUse": "支持决策：后厨巡检频次优化",
                },
                {
                    "text": "题项 2：您每周前往助餐点就餐的频次属于哪一档？",
                    "type": "single",
                    "choices": ["每周三次及以上", "每周一至两次"],
                    "researchQuestion": "核心问题：实际就餐粘性测量",
                    "decisionUse": "拟支持决策：备餐食材采购量测算",
                },
                {
                    "text": "问题三：助餐点的菜品口味符合日常清淡饮食习惯。",
                    "type": "likert",
                    "choices": [],
                    "researchQuestion": "菜品适老化口味匹配度",
                    "decisionUse": "制定低盐低脂菜单标准",
                },
            ],
        },
        ensure_ascii=False,
    )

    parsed = survey_proposals.parse_proposal(noisy_raw)
    serialized = json.dumps(parsed, ensure_ascii=False)
    assert not _FORBIDDEN_BRACKET_RE.search(serialized)
    assert "{" not in parsed["title"] and "}" not in parsed["title"]
    assert not parsed["objective"].startswith("研究目的：")
    assert not parsed["population"].startswith("调查对象：")
    assert not parsed["questions"][0]["text"].startswith("Q1:")
    assert not parsed["questions"][1]["text"].startswith("题项 2：")
    assert not parsed["questions"][2]["text"].startswith("问题三：")
    assert parsed["questions"][2]["min"] == 1 and parsed["questions"][2]["max"] == 5


@pytest.mark.parametrize(
    ("bad_case", "raw_builder"),
    [
        (
            "duplicate_choice_labels",
            lambda: json.dumps(
                {
                    "title": "重复选项测试",
                    "objective": "识别重复选项",
                    "population": "社区居民",
                    "items": [
                        {
                            "text": f"测试题干 {i}",
                            "type": "single",
                            "choices": ["满意", "满意"],
                            "researchQuestion": "问题",
                            "decisionUse": "决策",
                        }
                        for i in range(1, 4)
                    ],
                },
                ensure_ascii=False,
            ),
        ),
        (
            "likert_with_nonempty_choices",
            lambda: json.dumps(
                {
                    "title": "量表带选项错误测试",
                    "objective": "检验量表选项约束",
                    "population": "社区居民",
                    "items": [
                        {
                            "text": f"量表题干 {i}",
                            "type": "likert",
                            "choices": ["不该出现的选项"],
                            "researchQuestion": "问题",
                            "decisionUse": "决策",
                        }
                        for i in range(1, 4)
                    ],
                },
                ensure_ascii=False,
            ),
        ),
        (
            "single_with_only_one_choice",
            lambda: json.dumps(
                {
                    "title": "单选题单选项错误测试",
                    "objective": "检验单选最少两项约束",
                    "population": "社区居民",
                    "items": [
                        {
                            "text": f"单选题干 {i}",
                            "type": "single",
                            "choices": ["唯一选项"],
                            "researchQuestion": "问题",
                            "decisionUse": "决策",
                        }
                        for i in range(1, 4)
                    ],
                },
                ensure_ascii=False,
            ),
        ),
        (
            "oversized_raw_payload",
            lambda: _make_raw_proposal_json(4) + (" " * 40_000),
        ),
    ],
)
def test_parse_proposal_rejects_malformed_choices_and_oversized_raw(bad_case: str, raw_builder):
    with pytest.raises(ProviderFailure) as exc_info:
        survey_proposals.parse_proposal(raw_builder())
    assert exc_info.value.code == "invalid_proposal", bad_case


@pytest.mark.parametrize(
    ("brief_input", "valid_count", "invalid_count"),
    [
        ("设计社区便民食堂简短问卷", 6, 9),
        ({"topic": "新能源汽车充电桩体验", "questionCount": 18}, 18, 19),
        ("请生成一份多维量表完整问卷用于实证调查", 24, 33),
        ({"topic": "县域医共体慢病管理满意度", "full": True}, 32, 2),
    ],
)
def test_proposal_item_count_bounds_adapt_to_brief_signals(brief_input, valid_count: int, invalid_count: int):
    generated_prompt = survey_proposals.prompt(brief_input)
    assert not _FORBIDDEN_BRACKET_RE.search(generated_prompt)

    ok_parsed = survey_proposals.parse_proposal(_make_raw_proposal_json(valid_count), brief=brief_input)
    assert len(ok_parsed["questions"]) == valid_count

    with pytest.raises(ProviderFailure):
        survey_proposals.parse_proposal(_make_raw_proposal_json(invalid_count), brief=brief_input)
