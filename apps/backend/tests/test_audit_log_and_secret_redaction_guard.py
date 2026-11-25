"""Permanent CI guard for credential zero-echo redaction, audit log privacy, and deletion/removal cascade isolation (Wave 25).

Verifies:
1. Custom BYOK model service keys (e.g. sk-live-secret-...) are AES-GCM encrypted at rest, never
   stored in plaintext in services/operations tables, never echoed in GET/POST/PUT /api/services,
   task/autonomous receipts, or 4xx error envelopes, rejected if embedded in public labels or run
   goals, and cryptographically wiped (ciphertext=b"", iv=b"") upon DELETE /api/services/{id}
   followed by 404 pure Chinese errors.
2. Login email 6-digit OTP codes and raw session Cookie tokens are stored strictly as HMAC-SHA256
   digests and are 100% absent from /api/auth/*, /api/session, error responses, and CSV/TeX exports.
3. Operational upload audit ring buffers (TemporarySavImports / TemporarySubmissionPreflights) and
   task/autonomous receipts scrub filenames, respondent answers, audit terms, and secret tokens.
4. Removing a team member (DELETE /api/teams/{tid}/members/{uid}) immediately isolates all
   associated project questionnaires, reports, survey datasets, agent tasks, autonomous runs, SSE
   streams, epistemic memories, topics, and knowledge references behind 404 pure Chinese errors.
5. Deleting an AutonomousRun cascades deletion of child AutonomousRunEvent rows (ON DELETE CASCADE),
   cleanly unlinks ProjectEpistemicMemory.run_id (ON DELETE SET NULL), and returns 404 pure Chinese
   errors across detail/stream/resume/cancel endpoints.
"""
from __future__ import annotations

from datetime import timedelta
from pathlib import Path
import re

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.pool import StaticPool

from evix_api.app import create_app
from evix_api.uploads.sav import TemporarySavImports
from evix_api.uploads.submission import TemporarySubmissionPreflights
from infrastructure.database.models import (
    AgentTask,
    AutonomousRun,
    AutonomousRunEvent,
    Base,
    Challenge,
    Member,
    Operation,
    Project,
    ProjectEpistemicMemory,
    ReportVersion,
    Service,
    Session as DbSessionModel,
    SurveyRelease,
    SurveyResponse,
    Team,
    User,
    Version as QuestionnaireVersionModel,
    now,
)
from infrastructure.security import keyed
from infrastructure.settings import Settings

_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_ID = "11111111-1111-4111-8111-111111111111"
PROJECT_ID = "22222222-2222-4222-8222-222222222222"
OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
EDITOR_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
QVER_ID = "33333333-3333-4333-8333-333333333333"
RELEASE_ID = "44444444-4444-4444-8444-444444444444"
TASK_ID = "55555555-5555-4555-8555-555555555555"
RUN_ID = "66666666-6666-4666-8666-666666666666"


def _make_sqlite_engine(*, enforce_fk: bool = True):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def _on_connect(dbapi_conn, _rec):
        if enforce_fk:
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.close()
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _l: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _lock_id: 1)

    event.listen(engine, "connect", _on_connect)
    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides) -> Settings:
    payload = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://evix_user:audit_secret_pw_55@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["owner@example.test", "editor@example.test", "login@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-audit-private",
        "preflight_temp_dir": tmp_path / "preflight-audit-private",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_team_and_full_project_artefacts(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    monkeypatch.setattr("application.services.auth.now", lambda: ts)
    monkeypatch.setattr("application.services.latex.now", lambda: ts)
    monkeypatch.setattr("multi_agent.agents.survey_agent.services.surveys.now", lambda: ts)

    creds = {
        "owner": ("raw-owner-session-secret-token-0001", "csrf-owner-0001"),
        "editor": ("raw-editor-session-secret-token-0002", "csrf-editor-0002"),
    }
    design = {
        "title": "机密民生满意度调研问卷",
        "introduction": "匿名学术调研说明",
        "questions": [
            {
                "id": "q1",
                "variable": "satisfaction",
                "text": "整体满意度评分",
                "type": "likert",
                "required": True,
                "reverse": False,
                "choices": [],
                "min": 1,
                "max": 5,
                "minLabel": "极不满意",
                "maxLabel": "非常满意",
                "condition": None,
            }
        ],
    }

    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts},
                {"id": EDITOR_ID, "email": "editor@example.test", "created_at": ts},
            ],
        )
        for uid, (cookie_val, csrf_val) in ((OWNER_ID, creds["owner"]), (EDITOR_ID, creds["editor"])):
            conn.execute(
                DbSessionModel.__table__.insert().values(
                    user_id=uid,
                    token_hash=keyed(settings, "session/v1", cookie_val),
                    csrf=csrf_val,
                    expires_at=ts + timedelta(days=30),
                    revoked_at=None,
                )
            )
        conn.execute(Team.__table__.insert().values(id=TEAM_ID, name="核心调研课题组"))
        conn.execute(
            Member.__table__.insert(),
            [
                {"team_id": TEAM_ID, "user_id": OWNER_ID, "role": "owner"},
                {"team_id": TEAM_ID, "user_id": EDITOR_ID, "role": "editor"},
            ],
        )
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_ID,
                team_id=TEAM_ID,
                title="内部机密研究课题：县域医疗可及性",
                revision=1,
                questionnaire_revision=1,
                created_at=ts,
            )
        )
        conn.execute(
            QuestionnaireVersionModel.__table__.insert().values(
                id=QVER_ID,
                project_id=PROJECT_ID,
                revision=1,
                created_by=OWNER_ID,
                design=design,
                design_hash="a" * 64,
                source_proposal_id=None,
                created_at=ts,
            )
        )
        conn.execute(
            ReportVersion.__table__.insert().values(
                id="77777777-7777-4777-8777-777777777777",
                project_id=PROJECT_ID,
                revision=1,
                created_by=OWNER_ID,
                content={"title": "机密研究报告初稿", "sections": [{"id": "s1", "title": "结论", "body": "敏感结论正文"}]},
                content_hash="b" * 64,
                created_at=ts,
            )
        )
        conn.execute(
            SurveyRelease.__table__.insert().values(
                id=RELEASE_ID,
                project_id=PROJECT_ID,
                version_id=QVER_ID,
                questionnaire_revision=1,
                token="secret-public-survey-token-0123456789ABCDEF",
                public_design={"title": design["title"], "introduction": design["introduction"], "questions": design["questions"]},
                classification="synthetic",
                revision=1,
                status="open",
                response_count=1,
                response_bytes=32,
                created_at=ts,
                closed_at=None,
            )
        )
        conn.execute(
            SurveyResponse.__table__.insert().values(
                id="88888888-8888-4888-8888-888888888888",
                release_id=RELEASE_ID,
                idempotency_key="99999999-9999-4999-8999-999999999999",
                payload_hash="c" * 64,
                answers={"q1": 5},
                visibility={"q1": True},
                created_at=ts,
            )
        )
        conn.execute(
            AgentTask.__table__.insert().values(
                id=TASK_ID,
                project_id=PROJECT_ID,
                created_by=OWNER_ID,
                task_type="survey_design",
                status="ready",
                state={"phase": "draft", "note": "机密任务检查点"},
                revision=0,
                created_at=ts,
                updated_at=ts,
            )
        )
        conn.execute(
            AutonomousRun.__table__.insert().values(
                id=RUN_ID,
                project_id=PROJECT_ID,
                created_by=OWNER_ID,
                idempotency_key="abababab-abab-4bab-8bab-abababababab",
                status="completed",
                lease_mode="pi_autonomous",
                dataset_mode="planted_trap_benchmark",
                goal="机密分层效应探索目标",
                geography="县域",
                budget_cap=24,
                used_calls=3,
                dataset_ref="benchmark:planted-4-traps",
                dataset_sha256="d" * 64,
                checkpoint_json={"internalSecretHint": "never-expose-checkpoint"},
                epistemic_graph_json={"project_id": PROJECT_ID, "nodes": [], "edges": [], "pivot_log": []},
                revision=1,
                created_at=ts,
                updated_at=ts,
            )
        )
        for seq in (1, 2, 3):
            conn.execute(
                AutonomousRunEvent.__table__.insert().values(
                    id=f"00000000-0000-4000-8000-{seq:012d}",
                    run_id=RUN_ID,
                    project_id=PROJECT_ID,
                    created_by=OWNER_ID,
                    seq=seq,
                    event_type="thought" if seq < 3 else "completed",
                    payload_json={"thought": f"内部推演步骤 {seq}"},
                    created_at=ts,
                )
            )
        conn.execute(
            ProjectEpistemicMemory.__table__.insert().values(
                id="cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
                project_id=PROJECT_ID,
                created_by=OWNER_ID,
                run_id=RUN_ID,
                memory_key="mother_insight:demo",
                kind="mother_insight",
                status="active",
                summary="机密认知记忆结论摘要",
                snapshot_refs=["snap-1"],
                created_at=ts,
                updated_at=ts,
            )
        )
    return creds


def _assert_404_chinese_no_echo(res, forbidden_substrings: tuple[str, ...] = ()) -> None:
    assert res.status_code == 404, f"Expected 404, got {res.status_code}: {res.text!r}"
    err = res.json()["error"]
    assert err["code"] == "not_found"
    assert _CHINESE_CHAR_RE.search(err["message"])
    assert not _FORBIDDEN_BRACKET_RE.search(err["message"])
    for token in forbidden_substrings:
        assert token not in res.text, f"Sensitive or tenant-private token leaked in 404 response: {token!r}"


def test_byok_model_service_key_encrypted_at_rest_never_echoed_and_cryptographically_wiped_on_delete(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_team_and_full_project_artefacts(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    owner_cookie, owner_csrf = creds["owner"]
    headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf}
    secret_key = "sk-live-secret-vault-key-9876543210abcdefXYZ"
    rotated_key = "sk-live-rotated-vault-key-112233445566778899"

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)

        # 1. Bind custom model service key -> 201 with zero plaintext echo
        create_res = client.post(
            "/api/services",
            json={
                "label": "课题组专属推理服务",
                "provider": "deepseek",
                "baseUrl": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
                "maxOutputTokens": 2048,
                "capabilities": ["research", "report"],
                "apiKey": secret_key,
                "idempotencyKey": "10101010-1010-4010-8010-101010101010",
            },
            headers=headers,
        )
        assert create_res.status_code == 201, create_res.text
        created = create_res.json()
        service_id = created["id"]
        assert set(created.keys()) == {
            "id",
            "label",
            "provider",
            "baseUrl",
            "model",
            "maxOutputTokens",
            "capabilities",
            "revision",
        }
        assert secret_key not in create_res.text

        # 2. GET /api/services and PUT /api/services/{id} never expose apiKey, ciphertext, iv, or key_id
        list_res = client.get("/api/services")
        assert list_res.status_code == 200
        assert secret_key not in list_res.text
        for forbidden_field in ("apiKey", "ciphertext", "iv", "key_id", "keyId"):
            assert forbidden_field not in list_res.text

        edit_res = client.put(
            f"/api/services/{service_id}",
            json={
                "label": "课题组专属推理服务-升级",
                "provider": "deepseek",
                "baseUrl": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
                "maxOutputTokens": 2048,
                "capabilities": ["research", "report"],
                "expectedRevision": 1,
                "apiKey": rotated_key,
                "idempotencyKey": "20202020-2020-4020-8020-202020202020",
            },
            headers=headers,
        )
        assert edit_res.status_code == 200
        assert secret_key not in edit_res.text and rotated_key not in edit_res.text

        # 3. Verify at-rest encryption in Service & Operation tables (zero plaintext secret bytes)
        with OrmSession(engine) as db_sess:
            svc_row = db_sess.get(Service, service_id)
            assert svc_row is not None and len(svc_row.ciphertext) > 16 and len(svc_row.iv) == 12
            assert secret_key.encode() not in svc_row.ciphertext
            assert rotated_key.encode() not in svc_row.ciphertext
            for op_row in db_sess.scalars(select(Operation)).all():
                serialized_op = repr(op_row.response)
                assert secret_key not in serialized_op and rotated_key not in serialized_op

        # 4. Reject embedding API key inside public label OR inside autonomous run goal without echoing key
        leak_in_label = client.post(
            "/api/services",
            json={
                "label": f"误填密钥-{rotated_key}",
                "provider": "deepseek",
                "baseUrl": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
                "maxOutputTokens": 1024,
                "capabilities": ["research"],
                "apiKey": rotated_key,
                "idempotencyKey": "30303030-3030-4030-8030-303030303030",
            },
            headers=headers,
        )
        assert leak_in_label.status_code == 422
        assert leak_in_label.json()["error"]["code"] == "invalid_service_input"
        assert rotated_key not in leak_in_label.text

        leak_in_goal = client.post(
            f"/api/projects/{PROJECT_ID}/autonomous-runs",
            json={
                "idempotencyKey": "40404040-4040-4040-8040-404040404040",
                "goal": f"使用密钥 {rotated_key} 执行回归分析",
                "datasetMode": "planted_trap_benchmark",
                "serviceId": service_id,
                "serviceRevision": 2,
            },
            headers=headers,
        )
        assert leak_in_goal.status_code == 422
        assert leak_in_goal.json()["error"]["code"] == "sensitive_input"
        assert rotated_key not in leak_in_goal.text

        # 5. Delete service -> wipes ciphertext/iv and subsequent access returns 404 pure Chinese
        del_res = client.request(
            "DELETE",
            f"/api/services/{service_id}",
            json={"expectedRevision": 2, "idempotencyKey": "50505050-5050-4050-8050-505050505050"},
            headers=headers,
        )
        assert del_res.status_code == 204
        assert client.get("/api/services").json() == {"services": []}

        with OrmSession(engine) as db_sess:
            wiped = db_sess.get(Service, service_id)
            assert wiped is not None and wiped.deleted is True
            assert wiped.ciphertext == b"" and wiped.iv == b""

        _assert_404_chinese_no_echo(
            client.request(
                "DELETE",
                f"/api/services/{service_id}",
                json={"expectedRevision": 2, "idempotencyKey": "60606060-6060-4060-8060-606060606060"},
                headers=headers,
            ),
            (rotated_key,),
        )
        _assert_404_chinese_no_echo(
            client.post(
                f"/api/projects/{PROJECT_ID}/autonomous-runs",
                json={
                    "idempotencyKey": "70707070-7070-4070-8070-707070707070",
                    "goal": "验证已删除模型服务不可再挂载",
                    "datasetMode": "planted_trap_benchmark",
                    "serviceId": service_id,
                },
                headers=headers,
            ),
            (rotated_key,),
        )


def test_email_otp_and_session_cookie_never_echoed_in_auth_session_errors_or_exports(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_team_and_full_project_artefacts(engine, settings, monkeypatch)

    captured_mail: list[tuple[str, str, str]] = []

    async def _capture_mailer(challenge_id: str, email: str, code: str) -> None:
        captured_mail.append((challenge_id, email, code))

    app = create_app(settings=settings, mail=_capture_mailer, engine=engine)

    with TestClient(app, raise_server_exceptions=False) as client:
        # 1. Request OTP code -> response & DB store zero plaintext 6-digit code
        code_res = client.post(
            "/api/auth/code",
            json={"email": "login@example.test"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        assert code_res.status_code == 202
        assert len(captured_mail) == 1
        challenge_id, _, raw_otp = captured_mail[0]
        assert len(raw_otp) == 6 and raw_otp.isdigit()
        assert code_res.json() == {"challengeId": challenge_id}
        assert raw_otp not in code_res.text

        with OrmSession(engine) as db_sess:
            ch_row = db_sess.get(Challenge, challenge_id)
            assert ch_row is not None and raw_otp not in ch_row.verifier

        # 2. Wrong OTP submission -> 401 without echoing real OTP
        wrong_otp = "000000" if raw_otp != "000000" else "999999"
        bad_verify = client.post(
            "/api/auth/verify",
            json={"challengeId": challenge_id, "code": wrong_otp},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        assert bad_verify.status_code == 401
        assert raw_otp not in bad_verify.text

        # 3. Valid OTP verification -> sets HttpOnly cookie, body & /api/session omit raw cookie & hash
        ok_verify = client.post(
            "/api/auth/verify",
            json={"challengeId": challenge_id, "code": raw_otp},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        assert ok_verify.status_code == 200
        set_cookie_hdr = ok_verify.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie_hdr and "SameSite=strict" in set_cookie_hdr
        issued_cookie = ok_verify.cookies.get(settings.cookie_name)
        assert issued_cookie and len(issued_cookie) >= 32
        issued_hash = keyed(settings, "session/v1", issued_cookie)
        assert issued_cookie not in ok_verify.text
        assert issued_hash not in ok_verify.text
        assert raw_otp not in ok_verify.text

        sess_res = client.get("/api/session")
        assert sess_res.status_code == 200
        assert issued_cookie not in sess_res.text and issued_hash not in sess_res.text

        # 4. Owner CSV dataset export & LaTeX TeX export never leak session cookies, hashes, or auth_secret
        owner_cookie, owner_csrf = creds["owner"]
        owner_hash = keyed(settings, "session/v1", owner_cookie)
        client.cookies.set(settings.cookie_name, owner_cookie)

        ds_res = client.get(f"/api/projects/{PROJECT_ID}/surveys/{RELEASE_ID}/dataset")
        assert ds_res.status_code == 200
        tex_res = client.post(
            f"/api/projects/{PROJECT_ID}/report/latex/compile",
            json={
                "title": "凭证隔离检验报告",
                "subtitle": "副标题",
                "body": "\\section{方法}\n数据经脱敏聚合检验。",
                "options": {
                    "part": "main",
                    "includeCover": True,
                    "includeToc": False,
                    "firstLineChars": 2,
                    "numberPages": True,
                },
            },
            headers={"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf},
        )
        assert tex_res.status_code == 200
        for export_text in (ds_res.text, tex_res.text):
            for secret_val in (owner_cookie, owner_hash, settings.auth_secret, next(iter(settings.keyring.values()))):
                assert secret_val not in export_text


def test_operational_audit_logs_and_task_receipts_scrub_filenames_labels_and_credentials(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_team_and_full_project_artefacts(engine, settings, monkeypatch)

    # 1. Operational upload lifecycle ring buffers keep ONLY ("importId", "status", "at")
    sav_mgr = TemporarySavImports(settings)
    pf_mgr = TemporarySubmissionPreflights(settings)
    dirty_event = {
        "importId": "imp-001",
        "status": "completed_cleaned",
        "at": "2026-11-25T00:00:00Z",
        "filename": "某大学张三机密答卷.sav",
        "answers": ["敏感开放题原文"],
        "terms": ["张三", "某大学"],
        "apiKey": "sk-live-should-never-log",
        "cookie": creds["owner"][0],
    }
    sav_mgr.record(dirty_event)
    pf_mgr.record(dirty_event)

    for recorded in (sav_mgr.events[-1], pf_mgr.events[-1]):
        assert set(recorded.keys()) == {"importId", "status", "at"}
        serialized = repr(recorded)
        for sensitive in ("张三", "敏感开放题原文", "sk-live-should-never-log", creds["owner"][0]):
            assert sensitive not in serialized

    # 2. AutonomousRun detail view strips internal checkpoint_json keys while keeping public contract
    app = create_app(settings=settings, engine=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, creds["owner"][0])
        run_res = client.get(f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}")
        assert run_res.status_code == 200
        assert "checkpoint" not in run_res.json()
        assert "never-expose-checkpoint" not in run_res.text


def test_member_removal_revokes_access_across_all_project_questionnaires_reports_surveys_tasks_and_memories(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_team_and_full_project_artefacts(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    owner_cookie, owner_csrf = creds["owner"]
    editor_cookie, editor_csrf = creds["editor"]

    project_read_endpoints = (
        f"/api/projects/{PROJECT_ID}",
        f"/api/projects/{PROJECT_ID}/questionnaire",
        f"/api/projects/{PROJECT_ID}/questionnaire/versions",
        f"/api/projects/{PROJECT_ID}/report",
        f"/api/projects/{PROJECT_ID}/report/versions",
        f"/api/projects/{PROJECT_ID}/surveys",
        f"/api/projects/{PROJECT_ID}/surveys/{RELEASE_ID}/dataset",
        f"/api/projects/{PROJECT_ID}/agent-tasks",
        f"/api/projects/{PROJECT_ID}/agent-tasks/{TASK_ID}",
        f"/api/projects/{PROJECT_ID}/autonomous-runs",
        f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}",
        f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream",
        f"/api/projects/{PROJECT_ID}/epistemic-memory",
        f"/api/projects/{PROJECT_ID}/topic",
        f"/api/projects/{PROJECT_ID}/knowledge-references",
    )
    private_canaries = (
        "县域医疗可及性",
        "机密民生满意度调研问卷",
        "机密研究报告初稿",
        "敏感结论正文",
        "机密任务检查点",
        "机密分层效应探索目标",
        "机密认知记忆结论摘要",
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        # 1. Before removal: Editor can read all project artefacts
        client.cookies.set(settings.cookie_name, editor_cookie)
        for ep in project_read_endpoints:
            pre_res = client.get(ep)
            assert pre_res.status_code == 200, f"Expected 200 before removal on {ep}, got {pre_res.status_code}"

        # 2. Owner removes Editor from Team -> 204 No Content
        client.cookies.set(settings.cookie_name, owner_cookie)
        rm_res = client.delete(
            f"/api/teams/{TEAM_ID}/members/{EDITOR_ID}",
            headers={"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf},
        )
        assert rm_res.status_code == 204

        # 3. Immediately after removal: Editor sees empty team/project lists and 404 across all 15 child endpoints
        client.cookies.set(settings.cookie_name, editor_cookie)
        assert client.get("/api/teams").json() == {"teams": []}
        assert client.get("/api/projects").json() == {"projects": []}

        for ep in project_read_endpoints:
            post_res = client.get(ep)
            _assert_404_chinese_no_echo(post_res, private_canaries)

        # Mutating calls by removed member also fail with 404 pure Chinese
        post_mut = client.post(
            f"/api/projects/{PROJECT_ID}/report/versions",
            json={"content": {"title": "越权写入"}, "expectedRevision": 1, "idempotencyKey": "81818181-8181-4181-8181-818181818181"},
            headers={"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": editor_csrf},
        )
        _assert_404_chinese_no_echo(post_mut, private_canaries)


def test_autonomous_run_deletion_cascades_events_nulls_memory_fk_and_returns_404_chinese_errors(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine(enforce_fk=True)
    settings = _make_settings(tmp_path)
    creds = _seed_team_and_full_project_artefacts(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)
    owner_cookie, owner_csrf = creds["owner"]

    # Verify child events and linked epistemic memory exist prior to run deletion
    with OrmSession(engine) as db_sess:
        pre_events = db_sess.scalar(select(func.count()).select_from(AutonomousRunEvent).where(AutonomousRunEvent.run_id == RUN_ID))
        mem_before = db_sess.scalar(select(ProjectEpistemicMemory).where(ProjectEpistemicMemory.project_id == PROJECT_ID))
        assert pre_events == 3
        assert mem_before is not None and mem_before.run_id == RUN_ID

        # Delete AutonomousRun -> FK ON DELETE CASCADE removes all events; ON DELETE SET NULL unlinks memory.run_id
        run_obj = db_sess.get(AutonomousRun, RUN_ID)
        db_sess.delete(run_obj)
        db_sess.commit()

    with OrmSession(engine) as db_sess:
        post_events = db_sess.scalar(select(func.count()).select_from(AutonomousRunEvent).where(AutonomousRunEvent.run_id == RUN_ID))
        mem_after = db_sess.scalar(select(ProjectEpistemicMemory).where(ProjectEpistemicMemory.project_id == PROJECT_ID))
        assert post_events == 0, "AutonomousRunEvent rows must cascade-delete with parent AutonomousRun"
        assert mem_after is not None and mem_after.run_id is None

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)
        headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf}

        _assert_404_chinese_no_echo(
            client.get(f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}"),
            ("机密分层效应探索目标", "内部推演步骤"),
        )
        _assert_404_chinese_no_echo(
            client.get(f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/stream"),
            ("内部推演步骤",),
        )
        _assert_404_chinese_no_echo(
            client.post(
                f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/resume",
                json={"expectedRevision": 1, "decision": "approve"},
                headers=headers,
            )
        )
        _assert_404_chinese_no_echo(
            client.post(
                f"/api/projects/{PROJECT_ID}/autonomous-runs/{RUN_ID}/cancel",
                json={"expectedRevision": 1},
                headers=headers,
            )
        )
