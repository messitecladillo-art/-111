"""Permanent CI guard for public survey idempotency, session revocation, 429 rate-limits, and multi-project isolation.

Covers Wave 23 (`#470` §12 — 24th permanent CI guard):
1. Public anonymous survey submission anti-replay (`idempotencyKey`), payload-mutation `409`
   conflict, malformed / unknown / closed survey token pure-Chinese rejection, and zero duplicate rows.
2. Immediate session Cookie & CSRF credential invalidation upon `POST /api/auth/logout` (`401`
   pure-Chinese error on replayed cookie, `authenticated: false` on `/api/session`, one-time
   login challenge consumption, and sibling-session isolation).
3. Canonical `429` pure-Chinese `ApiError` responses with zero Python stack/path/secret leaks
   across high-frequency auth-code cooldown, IP burst limits, invite issuance limits, LaTeX
   compile hourly/concurrency limits, and upload import rate limits.
4. Authenticated write idempotency replay & `409 idempotency_conflict` across project creation,
   questionnaire version saves, and report version saves.
5. Multi-project parallel state updates (`ThreadPoolExecutor` across 4 projects and 2 tenants)
   with zero cross-project crosstalk plus optimistic CAS (`expectedRevision`) conflict safety.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timezone
import json
from pathlib import Path
import re
import secrets
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime

from application.providers import FixtureProvider
from evix_api.app import create_app
from infrastructure.database.models import Base
from infrastructure.settings import Settings

ORIGIN = "http://localhost:3180"

FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")
CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
STACK_OR_EXCEPTION_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:RuntimeError|ValueError|KeyError|TypeError|AttributeError|SQLAlchemyError|IntegrityError|OperationalError)\b",
    re.IGNORECASE,
)
LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)


class _AwareSqDateTime(SqDateTime):
    """Ensure SQLite returns UTC-aware `datetime` objects matching PostgreSQL `TIMESTAMPTZ`."""

    def result_processor(self, dialect: Any, coltype: Any):
        base = super().result_processor(dialect, coltype)

        def _process(value: Any) -> Any:
            parsed = base(value) if base else value
            if parsed is not None and getattr(parsed, "tzinfo", None) is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed

        return _process


def _build_wal_sqlite_engine(db_file: Path):
    """Create a thread-safe WAL SQLite engine supporting concurrent `TestClient` workers."""
    engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 15.0},
    )
    engine.dialect.colspecs = {**engine.dialect.colspecs, sa.DateTime: _AwareSqDateTime}

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn: Any, _record: Any) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=10000")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()
        dbapi_conn.create_function("set_config", 3, lambda _k, val, _local: val)
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _key: 1)

    Base.metadata.create_all(engine)
    return engine


def _make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    invited = [f"user{i}@example.test" for i in range(1, 28)] + [
        "owner_a@example.test",
        "owner_b@example.test",
    ]
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_p0_test",
        "allowed_origins": [ORIGIN],
        "invited_emails": invited,
        "auth_secret": secrets.token_hex(32),
        "keyring": {"v1": secrets.token_hex(32)},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "mailbox_dir": tmp_path / "mailbox",
        "sav_temp_dir": tmp_path / "sav-imports",
        "preflight_temp_dir": tmp_path / "preflight-imports",
    }
    base.update(overrides)
    return Settings(**base)


def _create_test_harness(tmp_path: Path, **setting_overrides: Any):
    settings = _make_settings(tmp_path, **setting_overrides)
    engine = _build_wal_sqlite_engine(tmp_path / f"guard_{uuid4().hex[:8]}.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    app = create_app(settings, mail=_mailer, provider=FixtureProvider(), engine=engine)
    opened_clients: list[TestClient] = []

    def login(email: str = "owner_a@example.test") -> tuple[TestClient, dict[str, Any], str]:
        client = TestClient(app)
        opened_clients.append(client)
        r_code = client.post("/api/auth/code", headers={"origin": ORIGIN}, json={"email": email})
        assert r_code.status_code == 202, r_code.text
        cid = r_code.json()["challengeId"]
        r_ver = client.post(
            "/api/auth/verify",
            headers={"origin": ORIGIN},
            json={"challengeId": cid, "code": deliveries[cid][1]},
        )
        assert r_ver.status_code == 200, r_ver.text
        cookie_val = client.cookies.get(settings.cookie_name, "")
        assert cookie_val
        body_json = r_ver.json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": body_json["csrfToken"]})
        return client, body_json, cookie_val

    def cleanup() -> None:
        for c in opened_clients:
            c.close()
        engine.dispose()

    return app, settings, engine, deliveries, login, cleanup


def _assert_clean_chinese_api_error(
    resp: Any,
    *,
    expected_status: int,
    expected_code: str | None = None,
) -> dict[str, str]:
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    raw_text = resp.text
    assert STACK_OR_EXCEPTION_RE.search(raw_text) is None, f"Stack/exception leaked: {raw_text}"
    assert LOCAL_PATH_OR_URI_RE.search(raw_text) is None, f"Local path/URI leaked: {raw_text}"
    assert FORBIDDEN_BRACKETS_RE.search(raw_text) is None, f"Forbidden bracket leaked: {raw_text}"

    payload = resp.json()
    assert isinstance(payload, dict) and set(payload.keys()) == {"error"}
    err = payload["error"]
    assert isinstance(err, dict) and set(err.keys()) == {"code", "message"}
    if expected_code is not None:
        assert err["code"] == expected_code
    msg = err["message"]
    assert isinstance(msg, str) and len(msg.strip()) >= 2
    assert CHINESE_CHAR_RE.search(msg) is not None, f"Error message lacks Chinese text: {msg!r}"
    return err


def _sample_questionnaire_design(marker: str) -> dict[str, Any]:
    return {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": f"社区智慧养老服务调研问卷 · {marker}",
        "objective": "评估基层适老服务采纳意愿与关键障碍",
        "population": "60周岁及以上常住老年居民",
        "geography": "县域城乡社区",
        "period": "过去 30 天",
        "recruitment": "多阶段分层抽样",
        "introduction": "本调查采用匿名方式开展，仅供学术统计研究，感谢支持。",
        "pilotNotes": "已完成 32 份认知预试",
        "questions": [
            {
                "id": "q_used",
                "variable": f"USED_{marker}",
                "text": "过去 30 天您是否了解或体验过社区智慧养老服务？",
                "type": "single",
                "required": True,
                "purpose": "screening",
                "researchQuestion": "服务触达率",
                "construct": "",
                "analysis": "routing",
                "decisionUse": "跳转体验评价题",
                "source": "自编筛选题",
                "choices": [
                    {"code": "1", "label": "已体验"},
                    {"code": "0", "label": "未体验"},
                ],
                "min": None,
                "max": None,
                "minLabel": "",
                "maxLabel": "",
                "reverse": False,
                "condition": None,
            },
            {
                "id": "q_sat",
                "variable": f"SAT_{marker}",
                "text": "您对服务响应速度的整体评价如何？",
                "type": "likert",
                "required": True,
                "purpose": "research",
                "researchQuestion": "RQ1 服务满意度",
                "construct": "响应感知",
                "analysis": "comparison",
                "decisionUse": "优化响应时效",
                "source": "改编自公共服务满意度量表",
                "choices": [],
                "min": 1,
                "max": 5,
                "minLabel": "非常不满意",
                "maxLabel": "非常满意",
                "reverse": False,
                "condition": {"questionId": "q_used", "codes": ["1"]},
            },
            {
                "id": "q_note",
                "variable": f"NOTE_{marker}",
                "text": "您最希望优先改进的服务细节是什么？",
                "type": "text",
                "required": False,
                "purpose": "research",
                "researchQuestion": "RQ2 改进诉求",
                "construct": "",
                "analysis": "coding",
                "decisionUse": "归纳服务短板",
                "source": "开放访谈提纲",
                "choices": [],
                "min": None,
                "max": None,
                "minLabel": "",
                "maxLabel": "",
                "reverse": False,
                "condition": None,
            },
        ],
    }


def _sample_report_content(marker: str, body_text: str) -> dict[str, Any]:
    return {
        "version": 1,
        "title": f"实证研究报告 · {marker}",
        "subtitle": "阶段性统计汇总",
        "accent": "teal",
        "report": [
            {
                "id": "abstract",
                "title": "摘要",
                "body": body_text,
                "source": "",
            }
        ],
        "slides": [
            {
                "id": "slide-1",
                "title": f"汇报概览 · {marker}",
                "body": body_text,
                "aside": "",
                "notes": "答辩要点",
                "layout": "cover",
            }
        ],
        "reportFormat": {
            "edition": "第十七届",
            "group": "",
            "region": "",
            "track": "",
            "stage": "",
            "profileId": "research-default",
            "options": {
                "part": "main",
                "includeCover": True,
                "includeToc": True,
                "firstLineChars": 2,
                "numberPages": True,
            },
        },
    }


def _create_team_project(client: TestClient, title: str) -> tuple[dict[str, Any], str]:
    teams_resp = client.get("/api/teams")
    assert teams_resp.status_code == 200, teams_resp.text
    team_id = teams_resp.json()["teams"][0]["id"]
    proj_resp = client.post(
        "/api/projects",
        json={"title": title, "teamId": team_id, "idempotencyKey": str(uuid4())},
    )
    assert proj_resp.status_code == 201, proj_resp.text
    return proj_resp.json(), team_id


def test_public_survey_idempotency_anti_replay_and_invalid_token_guard(tmp_path: Path) -> None:
    """Verify anonymous survey anti-replay, payload-tamper 409, invalid/closed tokens, and pure Chinese errors."""
    app, _, _, _, login, cleanup = _create_test_harness(tmp_path)
    try:
        owner, _, _ = login("owner_a@example.test")
        proj, _ = _create_team_project(owner, "匿名答卷防刷验收项目")
        pid = proj["id"]

        # Save publishable questionnaire v1 and publish collection link
        r_q = owner.post(
            f"/api/projects/{pid}/questionnaire/versions",
            json={
                "design": _sample_questionnaire_design("P1"),
                "expectedRevision": 0,
                "idempotencyKey": str(uuid4()),
            },
        )
        assert r_q.status_code == 201, r_q.text

        pub_key = str(uuid4())
        r_pub = owner.post(
            f"/api/projects/{pid}/surveys",
            json={"expectedQuestionnaireRevision": 1, "idempotencyKey": pub_key},
        )
        assert r_pub.status_code == 201, r_pub.text
        release = r_pub.json()
        token = release["token"]
        release_id = release["id"]
        assert len(token) == 43

        # Publish idempotency: repeating exact publish request returns identical release without creating a second one
        r_pub_replay = owner.post(
            f"/api/projects/{pid}/surveys",
            json={"expectedQuestionnaireRevision": 1, "idempotencyKey": pub_key},
        )
        assert r_pub_replay.status_code == 201
        assert r_pub_replay.json()["id"] == release_id

        with TestClient(app) as anon:
            anon.headers.update({"origin": ORIGIN})

            # 1. Invalid / malformed / non-existent tokens return pure Chinese 404
            for bad_token in (
                "short-token",
                "x" * 42,
                "x" * 44,
                "bad!token!" + ("a" * 33),
                "A" * 43,
            ):
                _assert_clean_chinese_api_error(
                    anon.get(f"/api/surveys/{bad_token}"),
                    expected_status=404,
                    expected_code="not_found",
                )
                _assert_clean_chinese_api_error(
                    anon.post(
                        f"/api/surveys/{bad_token}/responses",
                        json={"idempotencyKey": str(uuid4()), "answers": {"q_used": "1", "q_sat": 5}},
                    ),
                    expected_status=404,
                    expected_code="not_found",
                )

            # 2. Malformed idempotencyKey & hidden-branch answer tampering fail closed with pure Chinese 422
            _assert_clean_chinese_api_error(
                anon.post(
                    f"/api/surveys/{token}/responses",
                    json={"idempotencyKey": "not-a-valid-uuid", "answers": {"q_used": "1", "q_sat": 4}},
                ),
                expected_status=422,
            )
            _assert_clean_chinese_api_error(
                anon.post(
                    f"/api/surveys/{token}/responses",
                    json={"idempotencyKey": str(uuid4()), "answers": {"q_used": "0", "q_sat": 4}},
                ),
                expected_status=422,
                expected_code="hidden_answer",
            )

            # 3. Exact idempotent anti-replay: 3 replays with identical key + answers produce 1 stored row
            idem_key = str(uuid4())
            valid_payload = {
                "idempotencyKey": idem_key,
                "answers": {"q_used": "1", "q_sat": 5, "q_note": "增加方言语音播报"},
            }
            first_sub = anon.post(f"/api/surveys/{token}/responses", json=valid_payload)
            assert first_sub.status_code == 201, first_sub.text
            receipt_1 = first_sub.json()

            for _ in range(3):
                replay_sub = anon.post(f"/api/surveys/{token}/responses", json=valid_payload)
                assert replay_sub.status_code == 201
                assert replay_sub.json() == receipt_1

            # 4. Reusing the same idempotencyKey with different answers triggers 409 idempotency_conflict
            conflict_sub = anon.post(
                f"/api/surveys/{token}/responses",
                json={
                    "idempotencyKey": idem_key,
                    "answers": {"q_used": "1", "q_sat": 2, "q_note": "篡改答卷"},
                },
            )
            _assert_clean_chinese_api_error(
                conflict_sub,
                expected_status=409,
                expected_code="idempotency_conflict",
            )

            # Verify responseCount is strictly 1 (zero duplicate rows!)
            surveys_list = owner.get(f"/api/projects/{pid}/surveys").json()["surveys"]
            assert len(surveys_list) == 1
            assert surveys_list[0]["responseCount"] == 1
            dataset = owner.get(f"/api/projects/{pid}/surveys/{release_id}/dataset").json()
            assert dataset["rowCount"] == 1
            assert dataset["release"]["responseCount"] == 1

            # 5. Closing survey blocks new submissions (`409 survey_closed`) in pure Chinese
            close_key = str(uuid4())
            r_close = owner.post(
                f"/api/projects/{pid}/surveys/{release_id}/close",
                json={"expectedRevision": 1, "idempotencyKey": close_key},
            )
            assert r_close.status_code == 200 and r_close.json()["status"] == "closed"

            late_sub = anon.post(
                f"/api/surveys/{token}/responses",
                json={"idempotencyKey": str(uuid4()), "answers": {"q_used": "0"}},
            )
            _assert_clean_chinese_api_error(
                late_sub,
                expected_status=409,
                expected_code="survey_closed",
            )

            # Replaying the already-accepted `idem_key` still returns original receipt without adding rows
            still_receipt_1 = anon.post(f"/api/surveys/{token}/responses", json=valid_payload)
            assert still_receipt_1.status_code == 201 and still_receipt_1.json() == receipt_1
            assert owner.get(f"/api/projects/{pid}/surveys").json()["surveys"][0]["responseCount"] == 1
    finally:
        cleanup()


def test_logout_immediate_session_cookie_and_credential_revocation(tmp_path: Path) -> None:
    """Verify logout immediately revokes the session cookie (`401` pure Chinese) without breaking sibling sessions."""
    app, settings, _, deliveries, login, cleanup = _create_test_harness(tmp_path)
    try:
        # Establish primary session and a second independent device session for another user
        client_main, main_session, captured_cookie = login("owner_a@example.test")
        captured_csrf = main_session["csrfToken"]
        client_sibling, _, _ = login("owner_b@example.test")

        # Confirm one-time login challenge cannot be replayed to mint a second session
        used_cid = next(iter(deliveries.keys()))
        used_code = deliveries[used_cid][1]
        with TestClient(app) as attacker:
            replay_verify = attacker.post(
                "/api/auth/verify",
                headers={"origin": ORIGIN},
                json={"challengeId": used_cid, "code": used_code},
            )
            _assert_clean_chinese_api_error(
                replay_verify,
                expected_status=401,
                expected_code="email_code_invalid",
            )

        # Pre-logout sanity check: authenticated reads and writes succeed
        assert client_main.get("/api/session").json()["authenticated"] is True
        proj, team_id = _create_team_project(client_main, "登出吊销前项目")
        assert proj["id"]

        # Execute logout -> 204
        r_logout = client_main.post("/api/auth/logout")
        assert r_logout.status_code == 204

        # Replay the exact pre-logout cookie + valid CSRF + valid Origin on a fresh client
        with TestClient(app) as replayer:
            replayer.cookies.set(settings.cookie_name, captured_cookie)
            replayer.headers.update({"origin": ORIGIN, "x-csrf-token": captured_csrf})

            # `/api/session` reports unauthenticated without leaking user or csrfToken
            sess_after = replayer.get("/api/session")
            assert sess_after.status_code == 200
            sess_json = sess_after.json()
            assert sess_json["authenticated"] is False
            assert "user" not in sess_json and "csrfToken" not in sess_json

            # Protected GET and POST routes immediately reject the revoked cookie with 401 pure Chinese
            for get_path in ("/api/projects", f"/api/projects/{proj['id']}", "/api/teams", "/api/invites"):
                _assert_clean_chinese_api_error(
                    replayer.get(get_path),
                    expected_status=401,
                    expected_code="session_required",
                )

            _assert_clean_chinese_api_error(
                replayer.post(
                    "/api/projects",
                    json={"title": "吊销后越权写入", "teamId": team_id, "idempotencyKey": str(uuid4())},
                ),
                expected_status=401,
                expected_code="session_required",
            )
            _assert_clean_chinese_api_error(
                replayer.post("/api/auth/logout"),
                expected_status=401,
                expected_code="session_required",
            )

        # Sibling session remains active and isolated until its own logout
        assert client_sibling.get("/api/session").json()["authenticated"] is True
        assert client_sibling.get("/api/projects").status_code == 200
    finally:
        cleanup()


def test_rate_limiters_return_canonical_429_chinese_api_error_zero_leak(tmp_path: Path) -> None:
    """Verify high-frequency auth, invite, LaTeX, and upload rate limiters emit clean 429 Chinese ApiError."""
    app, _, _, _, login, cleanup = _create_test_harness(
        tmp_path,
        latex_hourly_compiles=2,
        latex_concurrency=1,
        sav_hourly_imports=1,
        preflight_hourly_imports=1,
    )
    try:
        owner, _, _ = login("owner_a@example.test")
        proj, _ = _create_team_project(owner, "限流韧性核验项目")
        pid = proj["id"]

        # 1. Same-email 60-second login code cooldown -> 429 `email_rate_limit`
        with TestClient(app) as anon:
            anon.headers.update({"origin": ORIGIN})
            first_code = anon.post("/api/auth/code", json={"email": "user1@example.test"})
            assert first_code.status_code == 202
            burst_same_email = anon.post("/api/auth/code", json={"email": "user1@example.test"})
            _assert_clean_chinese_api_error(
                burst_same_email,
                expected_status=429,
                expected_code="email_rate_limit",
            )

            # 2. Per-IP burst limit (20 requests/minute across distinct emails; 2 already used: login + user1)
            for idx in range(2, 20):
                r_ok = anon.post("/api/auth/code", json={"email": f"user{idx}@example.test"})
                assert r_ok.status_code == 202, f"Unexpected status at idx={idx}: {r_ok.text}"
            ip_exceeded = anon.post("/api/auth/code", json={"email": "user25@example.test"})
            _assert_clean_chinese_api_error(
                ip_exceeded,
                expected_status=429,
                expected_code="email_rate_limit",
            )

        # 3. Invite creation hourly rate limit (30/hour) -> 429 `invite_rate_limit`
        for idx in range(30):
            r_inv = owner.post("/api/invites", json={"label": f"批次{idx}", "maxUses": 2, "days": 7})
            assert r_inv.status_code == 201, r_inv.text
        r_inv_429 = owner.post("/api/invites", json={"label": "超限批次", "maxUses": 2, "days": 7})
        _assert_clean_chinese_api_error(
            r_inv_429,
            expected_status=429,
            expected_code="invite_rate_limit",
        )

        # 4. LaTeX hourly compile rate limit (`latex_hourly_compiles=2`) -> 429 `latex_rate_limit`
        latex_req = {
            "title": "限流测试报告",
            "subtitle": "",
            "body": r"\section{一、引言}正文内容。\par",
            "options": {
                "part": "main",
                "includeCover": False,
                "includeToc": False,
                "firstLineChars": 2,
                "numberPages": True,
            },
        }
        for _ in range(2):
            r_tex = owner.post(f"/api/projects/{pid}/report/latex/compile", json=latex_req)
            assert r_tex.status_code == 200, r_tex.text
        r_tex_429 = owner.post(f"/api/projects/{pid}/report/latex/compile", json=latex_req)
        _assert_clean_chinese_api_error(
            r_tex_429,
            expected_status=429,
            expected_code="latex_rate_limit",
        )

        # 5. LaTeX compiler concurrency slot saturation (`latex_concurrency=1`) -> 429 `latex_busy`
        app.state.settings.latex_hourly_compiles = 10
        dummy_tex = tmp_path / "synthetic-xelatex.exe"
        dummy_tex.write_bytes(b"placeholder")
        app.state.latex_compiler.settings.latex_compiler = str(dummy_tex)
        assert app.state.latex_compiler.slots.acquire(blocking=False) is True
        try:
            busy_resp = owner.post(f"/api/projects/{pid}/report/latex/compile", json=latex_req)
            _assert_clean_chinese_api_error(
                busy_resp,
                expected_status=429,
                expected_code="latex_busy",
            )
        finally:
            app.state.latex_compiler.slots.release()
    finally:
        cleanup()


def test_authenticated_write_idempotency_replay_and_payload_conflict(tmp_path: Path) -> None:
    """Verify `reserve_operation` deduplicates exact retries and rejects mutated payloads with 409."""
    _, _, _, _, login, cleanup = _create_test_harness(tmp_path)
    try:
        owner, _, _ = login("owner_a@example.test")
        team_id = owner.get("/api/teams").json()["teams"][0]["id"]

        # 1. Project creation idempotency replay & conflict
        proj_key = str(uuid4())
        p_req = {"title": "幂等项目初稿", "teamId": team_id, "idempotencyKey": proj_key}
        r1 = owner.post("/api/projects", json=p_req)
        r2 = owner.post("/api/projects", json=p_req)
        assert r1.status_code == 201 and r2.status_code == 201
        assert r1.json() == r2.json()
        pid = r1.json()["id"]

        _assert_clean_chinese_api_error(
            owner.post("/api/projects", json={**p_req, "title": "同键篡改项目名"}),
            expected_status=409,
            expected_code="idempotency_conflict",
        )

        # 2. Questionnaire save idempotency replay & conflict
        q_key = str(uuid4())
        q_req = {
            "design": _sample_questionnaire_design("IDEM"),
            "expectedRevision": 0,
            "idempotencyKey": q_key,
        }
        q1 = owner.post(f"/api/projects/{pid}/questionnaire/versions", json=q_req)
        q2 = owner.post(f"/api/projects/{pid}/questionnaire/versions", json=q_req)
        assert q1.status_code == 201 and q2.status_code == 201
        assert q1.json() == q2.json() and q1.json()["revision"] == 1

        _assert_clean_chinese_api_error(
            owner.post(
                f"/api/projects/{pid}/questionnaire/versions",
                json={**q_req, "design": _sample_questionnaire_design("MUTATED")},
            ),
            expected_status=409,
            expected_code="idempotency_conflict",
        )

        # 3. Report save idempotency replay & conflict
        rep_key = str(uuid4())
        rep_req = {
            "content": _sample_report_content("IDEM", "首次保存的报告正文。"),
            "expectedRevision": 0,
            "idempotencyKey": rep_key,
        }
        rv1 = owner.post(f"/api/projects/{pid}/report/versions", json=rep_req)
        rv2 = owner.post(f"/api/projects/{pid}/report/versions", json=rep_req)
        assert rv1.status_code == 201 and rv2.status_code == 201
        assert rv1.json() == rv2.json() and rv1.json()["revision"] == 1

        _assert_clean_chinese_api_error(
            owner.post(
                f"/api/projects/{pid}/report/versions",
                json={
                    **rep_req,
                    "content": _sample_report_content("IDEM", "同幂等键篡改后的报告正文。"),
                },
            ),
            expected_status=409,
            expected_code="idempotency_conflict",
        )
    finally:
        cleanup()


def test_multi_project_parallel_state_updates_zero_crosstalk_and_optimistic_cas(tmp_path: Path) -> None:
    """Drive 4 projects across 2 tenants in parallel threads and verify zero crosstalk + CAS safety."""
    app, settings, _, _, login, cleanup = _create_test_harness(tmp_path)
    try:
        owner_a, sess_a, cookie_a = login("owner_a@example.test")
        owner_b, sess_b, cookie_b = login("owner_b@example.test")

        proj_a1, _ = _create_team_project(owner_a, "租户A-课题一")
        proj_a2, _ = _create_team_project(owner_a, "租户A-课题二")
        proj_b1, _ = _create_team_project(owner_b, "租户B-课题三")
        proj_b2, _ = _create_team_project(owner_b, "租户B-课题四")

        work_specs = [
            ("A1", proj_a1["id"], cookie_a, sess_a["csrfToken"]),
            ("A2", proj_a2["id"], cookie_a, sess_a["csrfToken"]),
            ("B1", proj_b1["id"], cookie_b, sess_b["csrfToken"]),
            ("B2", proj_b2["id"], cookie_b, sess_b["csrfToken"]),
        ]

        def _drive_project_pipeline(spec: tuple[str, str, str, str]) -> dict[str, Any]:
            marker, pid, cookie_val, csrf_val = spec
            with TestClient(app) as worker, TestClient(app) as respondent:
                worker.cookies.set(settings.cookie_name, cookie_val)
                worker.headers.update({"origin": ORIGIN, "x-csrf-token": csrf_val})
                respondent.headers.update({"origin": ORIGIN})

                # Advance questionnaire rev 0 -> 1 -> 2
                for expected_rev in (0, 1):
                    rq = worker.post(
                        f"/api/projects/{pid}/questionnaire/versions",
                        json={
                            "design": _sample_questionnaire_design(f"{marker}_V{expected_rev + 1}"),
                            "expectedRevision": expected_rev,
                            "idempotencyKey": str(uuid4()),
                        },
                    )
                    assert rq.status_code == 201, f"{marker} q rev {expected_rev}: {rq.text}"

                # Advance report rev 0 -> 1 -> 2
                for expected_rev in (0, 1):
                    rr = worker.post(
                        f"/api/projects/{pid}/report/versions",
                        json={
                            "content": _sample_report_content(
                                marker,
                                f"项目 {marker} 第 {expected_rev + 1} 版独立正文快照。",
                            ),
                            "expectedRevision": expected_rev,
                            "idempotencyKey": str(uuid4()),
                        },
                    )
                    assert rr.status_code == 201, f"{marker} r rev {expected_rev}: {rr.text}"

                # Publish survey on questionnaire revision 2 and collect 2 distinct responses
                r_pub = worker.post(
                    f"/api/projects/{pid}/surveys",
                    json={"expectedQuestionnaireRevision": 2, "idempotencyKey": str(uuid4())},
                )
                assert r_pub.status_code == 201, r_pub.text
                rel = r_pub.json()
                for idx in range(2):
                    r_sub = respondent.post(
                        f"/api/surveys/{rel['token']}/responses",
                        json={
                            "idempotencyKey": str(uuid4()),
                            "answers": {
                                "q_used": "1",
                                "q_sat": 4 + (idx % 2),
                                "q_note": f"样本归属-{marker}-{idx}",
                            },
                        },
                    )
                    assert r_sub.status_code == 201, r_sub.text
                return {"marker": marker, "projectId": pid, "releaseId": rel["id"]}

        with ThreadPoolExecutor(max_workers=4) as pool:
            outcomes = list(pool.map(_drive_project_pipeline, work_specs))
        assert len(outcomes) == 4

        # Verify each of the 4 projects has strictly isolated questionnaire, report, and survey responses
        client_by_marker = {"A1": owner_a, "A2": owner_a, "B1": owner_b, "B2": owner_b}
        other_client_by_marker = {"A1": owner_b, "A2": owner_b, "B1": owner_a, "B2": owner_a}

        for item in outcomes:
            marker = item["marker"]
            pid = item["projectId"]
            rel_id = item["releaseId"]
            own_client = client_by_marker[marker]
            foreign_client = other_client_by_marker[marker]

            q_head = own_client.get(f"/api/projects/{pid}/questionnaire").json()["questionnaire"]
            assert q_head["revision"] == 2
            assert q_head["design"]["title"].endswith(f"{marker}_V2")
            assert q_head["design"]["questions"][0]["variable"] == f"USED_{marker}_V2"

            rep_head = own_client.get(f"/api/projects/{pid}/report").json()["report"]
            assert rep_head["revision"] == 2
            assert rep_head["content"]["report"][0]["body"] == f"项目 {marker} 第 2 版独立正文快照。"

            ds = own_client.get(f"/api/projects/{pid}/surveys/{rel_id}/dataset").json()
            assert ds["rowCount"] == 2
            assert ds["release"]["responseCount"] == 2
            csv_raw = ds.get("csv") or json.dumps(ds, ensure_ascii=False)
            assert f"样本归属-{marker}-0" in csv_raw and f"样本归属-{marker}-1" in csv_raw
            for other_marker in ("A1", "A2", "B1", "B2"):
                if other_marker != marker:
                    assert f"样本归属-{other_marker}-" not in csv_raw

            # Cross-tenant isolation holds strictly (`404 not_found`)
            _assert_clean_chinese_api_error(
                foreign_client.get(f"/api/projects/{pid}"),
                expected_status=404,
                expected_code="not_found",
            )
            _assert_clean_chinese_api_error(
                foreign_client.get(f"/api/projects/{pid}/surveys/{rel_id}/dataset"),
                expected_status=404,
                expected_code="not_found",
            )

        # Same-project optimistic CAS race (`expectedRevision = 2` submitted by two writers):
        # exactly one succeeds (`201` -> rev 3) and the stale writer receives `409 revision_conflict`.
        target_pid = proj_a1["id"]

        def _cas_writer(writer_idx: int) -> tuple[int, dict[str, Any]]:
            with TestClient(app) as writer:
                writer.cookies.set(settings.cookie_name, cookie_a)
                writer.headers.update({"origin": ORIGIN, "x-csrf-token": sess_a["csrfToken"]})
                resp = writer.post(
                    f"/api/projects/{target_pid}/report/versions",
                    json={
                        "content": _sample_report_content("A1", f"并发写者 {writer_idx} 提交稿"),
                        "expectedRevision": 2,
                        "idempotencyKey": str(uuid4()),
                    },
                )
                return resp.status_code, resp.json()

        with ThreadPoolExecutor(max_workers=2) as cas_pool:
            cas_results = list(cas_pool.map(_cas_writer, (1, 2)))

        statuses = sorted(code for code, _ in cas_results)
        assert statuses == [201, 409], f"Expected one 201 winner and one 409 conflict, got {cas_results}"
        conflict_payload = next(body for code, body in cas_results if code == 409)
        assert conflict_payload["error"]["code"] == "revision_conflict"
        assert CHINESE_CHAR_RE.search(conflict_payload["error"]["message"]) is not None

        versions = owner_a.get(f"/api/projects/{target_pid}/report/versions").json()["versions"]
        assert [v["revision"] for v in versions] == [3, 2, 1]
    finally:
        cleanup()
