"""Permanent CI guard for multi-role Team RBAC matrices and Invite Code full lifecycle security.

Covers Wave 27 (`#561` §12 — 24th backend permanent CI guard / 36th full-stack CI guard):
1. Team Management RBAC, Owner Protection, Member Cap & Anti-Escalation:
   - Enforces `owner` vs `editor` / `viewer` (`403 permission_denied`) vs `outsider` (`404 not_found`
     zero existence leak) across member listing, role assignment, member removal, and presence; blocks
     `role='owner'` privilege escalation (`422`), protects owner from demotion/removal (`409
     owner_protected`), rejects un-admitted emails (`404`), and enforces `MAX_TEAM_MEMBERS == 6`
     (`409 team_full`).
2. Full 4-Role (`owner` / `editor` / `viewer` / `outsider`) Project & Research Asset RBAC Matrix:
   - Verifies exact permission boundaries across project creation/read, questionnaire version writes,
     report version writes, survey publishing/closing/dataset export, multi-agent workflow tasks
     (`create` / `advance` / `approval` / `cancel`), and autonomous research runs: `viewer` receives
     pure-Chinese `403 permission_denied` on every mutating operation while keeping read access;
     `outsider` receives pure-Chinese `404 not_found` across both reads and writes.
3. Live Role Demotion & Member Removal Immediate Enforcement:
   - Verifies demoting an `editor` to `viewer` immediately blocks subsequent writes with `403
     permission_denied`, and removing the member (`204`) immediately turns all project/asset reads and
     writes into `404 not_found`.
4. Invite Code Issuance Authority, One-Time Secret Non-Echo & Cross-Admin Isolation:
   - Verifies operator-listed admins can issue, list (with zero plaintext code echo), and revoke codes
     within strict parameter bounds, cannot revoke another admin's invite (`404`), and invite-registered
     accounts are blocked from issuing/listing/revoking invites (`403 invite_forbidden`).
5. Invite Code Full Redemption Lifecycle (Normal, NFKC Normalization, Exhausted/Race, Expired, Revoked & Wrong-Email):
   - Verifies normal invite registration, subsequent passwordless re-login without invite code, uniform
     anti-enumeration `202` + `401 email_code_invalid` on missing/bogus codes, atomic race-condition
     rejection (`401 invite_unavailable`) on exhausted/expired/revoked codes, preservation of already
     admitted accounts after code revocation, and wrong-email / brute-force OTP rejection leaving invite
     quota unspent.
"""

from __future__ import annotations

from datetime import timedelta, timezone
import json
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
import sqlalchemy as sa
from sqlalchemy import create_engine, event, update
from sqlalchemy.dialects.sqlite.base import DATETIME as SqDateTime
from sqlalchemy.orm import Session as DBSession

from application.providers import FixtureProvider
from application.services.invites import ALPHABET
from evix_api.app import create_app
from infrastructure.database.models import Base, InviteCode, now
from infrastructure.settings import Settings
from multi_agent.roles import AgentRole
from multi_agent.workflow import AgentResult, ReviewDecision

ORIGIN = "http://localhost:3180"

FORBIDDEN_BRACKETS_RE = re.compile("[\u300c\u300d\u300e\u300f\u3010\u3011]")
PRIVATE_JARGON_RE = re.compile(
    r"\b(?:ReAct|DAG|EpistemicGraph|RunLease|BYOK|Bento|Atypica)\b|\u6c99\u76d2|\u7b97\u5b50",
    re.IGNORECASE,
)
CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
STACK_OR_EXCEPTION_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|\b(?:RuntimeError|ValueError|KeyError|TypeError|AttributeError|SQLAlchemyError"
    r"|IntegrityError|OperationalError|RequestValidationError)\b",
    re.IGNORECASE,
)
LOCAL_PATH_OR_URI_RE = re.compile(
    r"(?:(?<![A-Za-z])[A-Za-z]:[\\/][^\s\"'<>]+)"
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


class _PgCompatCursor(sqlite3.Cursor):
    """Translate PostgreSQL `SET LOCAL ...` session statements into no-op `SELECT 1` on SQLite."""

    def execute(self, sql: str, parameters: Any = ()):
        if sql.lstrip().upper().startswith("SET LOCAL "):
            return super().execute("SELECT 1")
        return super().execute(sql, parameters)


class _PgCompatConnection(sqlite3.Connection):
    def cursor(self, *args: Any, **kwargs: Any):
        kwargs.setdefault("factory", _PgCompatCursor)
        return super().cursor(*args, **kwargs)


def _build_wal_sqlite_engine(db_file: Path):
    engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={
            "check_same_thread": False,
            "timeout": 15.0,
            "factory": _PgCompatConnection,
        },
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
    invited = [
        "owner_admin@example.test",
        "second_admin@example.test",
        "editor_user@example.test",
        "viewer_user@example.test",
        "outsider_user@example.test",
        *(f"cap_member_{idx}@example.test" for idx in range(1, 8)),
    ]
    base: dict[str, Any] = {
        "mode": "local_test",
        "database_url": "postgresql+psycopg://unused:synthetic@127.0.0.1:55432/evix_rbac_invite_test",
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


def _create_harness(tmp_path: Path, **setting_overrides: Any):
    settings = _make_settings(tmp_path, **setting_overrides)
    engine = _build_wal_sqlite_engine(tmp_path / f"rbac_inv_{uuid4().hex[:8]}.db")
    deliveries: dict[str, tuple[str, str]] = {}

    async def _mailer(challenge_id: str, email: str, code: str) -> None:
        deliveries[challenge_id] = (email, code)

    workflow_handlers = {
        AgentRole.RESEARCH: lambda _state: AgentResult("已完成选题方案草案", ("artifact:topic-v1",)),
        AgentRole.SURVEY: lambda _state: AgentResult("已完成问卷结构草案", ("artifact:survey-v1",)),
        AgentRole.REVIEWER: lambda _state: AgentResult("质量复核通过", review_decision=ReviewDecision.APPROVE),
    }

    app = create_app(
        settings,
        mail=_mailer,
        provider=FixtureProvider(),
        engine=engine,
        workflow_handlers=workflow_handlers,
    )
    lifespan_ctx = TestClient(app)
    lifespan_ctx.__enter__()
    opened_clients: list[TestClient] = []

    def new_anon_client() -> TestClient:
        client = TestClient(app)
        opened_clients.append(client)
        client.headers.update({"origin": ORIGIN})
        return client

    def login(email: str, *, invite_code: str | None = None) -> tuple[TestClient, dict[str, Any]]:
        client = new_anon_client()
        payload: dict[str, Any] = {"email": email}
        if invite_code is not None:
            payload["inviteCode"] = invite_code
        r_code = client.post("/api/auth/code", json=payload)
        assert r_code.status_code == 202, r_code.text
        cid = r_code.json()["challengeId"]
        assert cid in deliveries, f"OTP was not delivered for {email!r} (check admission/invite)"
        r_ver = client.post(
            "/api/auth/verify",
            json={"challengeId": cid, "code": deliveries[cid][1]},
        )
        assert r_ver.status_code == 200, r_ver.text
        session_json = r_ver.json()
        client.headers.update({"origin": ORIGIN, "x-csrf-token": session_json["csrfToken"]})
        return client, session_json

    def cleanup() -> None:
        for c in opened_clients:
            c.close()
        lifespan_ctx.__exit__(None, None, None)
        engine.dispose()

    return app, settings, engine, deliveries, new_anon_client, login, cleanup


def _assert_clean_chinese_api_error(
    resp: Any,
    *,
    expected_status: int,
    expected_code: str,
) -> dict[str, str]:
    assert resp.status_code == expected_status, f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    raw = resp.text
    assert not FORBIDDEN_BRACKETS_RE.search(raw), f"Forbidden brackets leaked: {raw}"
    assert not PRIVATE_JARGON_RE.search(raw), f"Private jargon leaked: {raw}"
    assert not STACK_OR_EXCEPTION_RE.search(raw), f"Traceback/exception leaked: {raw}"
    assert not LOCAL_PATH_OR_URI_RE.search(raw), f"Local path/URI leaked: {raw}"

    payload = resp.json()
    assert set(payload.keys()) == {"error"}, payload
    err = payload["error"]
    assert set(err.keys()) == {"code", "message"}, payload
    assert err["code"] == expected_code, f"Expected {expected_code!r}, got {err['code']!r}: {payload}"
    assert isinstance(err["message"], str) and CHINESE_CHAR_RE.search(err["message"]), payload
    return err


def _sample_questionnaire_design(tag: str) -> dict[str, Any]:
    return {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": f"社区公共服务满意度调研问卷 · {tag}",
        "objective": "评估居民服务满意度与改进优先级",
        "population": "辖区常住居民",
        "geography": "县域城乡社区",
        "period": "过去 30 天",
        "recruitment": "分层随机抽样",
        "introduction": "本问卷采用匿名方式收集，结果仅用于学术统计分析。",
        "pilotNotes": "已完成 30 份预调查信效度检验",
        "questions": [
            {
                "id": "q_used",
                "variable": f"USED_{tag}",
                "text": "过去一个月您是否使用过社区便民服务窗口？",
                "type": "single",
                "required": True,
                "purpose": "screening",
                "researchQuestion": "基础触达率",
                "construct": "",
                "analysis": "routing",
                "decisionUse": "评估覆盖面",
                "source": "自编筛选题",
                "choices": [
                    {"code": "1", "label": "使用过"},
                    {"code": "0", "label": "未使用"},
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
                "variable": f"SAT_{tag}",
                "text": "您对社区便民服务办理效率的整体评价如何？",
                "type": "likert",
                "required": True,
                "purpose": "research",
                "researchQuestion": "RQ1 办理效率评价",
                "construct": "服务效率感知",
                "analysis": "comparison",
                "decisionUse": "优化窗口排班",
                "source": "公共服务评价量表",
                "choices": [],
                "min": 1,
                "max": 5,
                "minLabel": "非常不满意",
                "maxLabel": "非常满意",
                "reverse": False,
                "condition": None,
            },
        ],
    }


def _sample_report_content(tag: str) -> dict[str, Any]:
    return {
        "version": 1,
        "title": f"社区便民服务调研报告 · {tag}",
        "subtitle": "多角色权限隔离校验稿",
        "accent": "teal",
        "report": [
            {
                "id": "abstract",
                "title": "摘要",
                "body": "基于分层样本核验社区服务满意度影响因素与改进重点。",
                "source": "",
            }
        ],
        "slides": [
            {
                "id": "slide-1",
                "title": f"调研结论概览 · {tag}",
                "body": "窗口响应效率显著正向关联整体满意度。",
                "aside": "",
                "notes": "汇报摘要",
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


# ---------------------------------------------------------------------------
# 1. Team Management RBAC, Owner Protection, Member Cap & Anti-Escalation
# ---------------------------------------------------------------------------


def test_team_management_rbac_owner_protection_member_cap_and_anti_escalation(tmp_path: Path) -> None:
    _app, _settings, _engine, _deliveries, _anon, login, cleanup = _create_harness(tmp_path)
    try:
        owner, owner_sess = login("owner_admin@example.test")
        editor, editor_sess = login("editor_user@example.test")
        viewer, viewer_sess = login("viewer_user@example.test")
        outsider, outsider_sess = login("outsider_user@example.test")

        owner_uid = owner_sess["user"]["id"]
        editor_uid = editor_sess["user"]["id"]
        viewer_uid = viewer_sess["user"]["id"]
        outsider_uid = outsider_sess["user"]["id"]

        team_id = owner.get("/api/teams").json()["teams"][0]["id"]

        # Owner adds editor & viewer
        r_add_ed = owner.post(f"/api/teams/{team_id}/members", json={"email": "editor_user@example.test", "role": "editor"})
        assert r_add_ed.status_code == 201, r_add_ed.text
        assert r_add_ed.json()["role"] == "editor"

        r_add_vw = owner.post(f"/api/teams/{team_id}/members", json={"email": "viewer_user@example.test", "role": "viewer"})
        assert r_add_vw.status_code == 201, r_add_vw.text
        assert r_add_vw.json()["role"] == "viewer"

        # Owner can list members (maxMembers == 6)
        r_list = owner.get(f"/api/teams/{team_id}/members")
        assert r_list.status_code == 200, r_list.text
        assert r_list.json()["maxMembers"] == 6
        assert {m["role"] for m in r_list.json()["members"]} == {"owner", "editor", "viewer"}

        # Presence is accessible to team members (owner, editor, viewer) -> 200, but 404 to outsider!
        for member_client in (owner, editor, viewer):
            r_hb = member_client.post(f"/api/teams/{team_id}/presence", json={"status": "writing", "note": "撰写问卷"})
            assert r_hb.status_code == 200, r_hb.text
            r_pr = member_client.get(f"/api/teams/{team_id}/presence")
            assert r_pr.status_code == 200, r_pr.text

        _assert_clean_chinese_api_error(
            outsider.get(f"/api/teams/{team_id}/presence"),
            expected_status=404,
            expected_code="not_found",
        )
        _assert_clean_chinese_api_error(
            outsider.post(f"/api/teams/{team_id}/presence", json={"status": "online"}),
            expected_status=404,
            expected_code="not_found",
        )

        # Editor & Viewer MUST receive 403 permission_denied on member list, add/self-promote, and remove!
        for non_owner_client, self_email in (
            (editor, "editor_user@example.test"),
            (viewer, "viewer_user@example.test"),
        ):
            _assert_clean_chinese_api_error(
                non_owner_client.get(f"/api/teams/{team_id}/members"),
                expected_status=403,
                expected_code="permission_denied",
            )
            # Attempt self-escalation or adding outsider
            _assert_clean_chinese_api_error(
                non_owner_client.post(f"/api/teams/{team_id}/members", json={"email": self_email, "role": "editor"}),
                expected_status=403,
                expected_code="permission_denied",
            )
            _assert_clean_chinese_api_error(
                non_owner_client.post(
                    f"/api/teams/{team_id}/members",
                    json={"email": "outsider_user@example.test", "role": "viewer"},
                ),
                expected_status=403,
                expected_code="permission_denied",
            )
            _assert_clean_chinese_api_error(
                non_owner_client.delete(f"/api/teams/{team_id}/members/{viewer_uid}"),
                expected_status=403,
                expected_code="permission_denied",
            )

        # Outsider MUST receive 404 not_found (zero team existence leak) on all member management endpoints
        _assert_clean_chinese_api_error(
            outsider.get(f"/api/teams/{team_id}/members"),
            expected_status=404,
            expected_code="not_found",
        )
        _assert_clean_chinese_api_error(
            outsider.post(f"/api/teams/{team_id}/members", json={"email": "outsider_user@example.test", "role": "editor"}),
            expected_status=404,
            expected_code="not_found",
        )
        _assert_clean_chinese_api_error(
            outsider.delete(f"/api/teams/{team_id}/members/{editor_uid}"),
            expected_status=404,
            expected_code="not_found",
        )
        assert outsider_uid not in {m["userId"] for m in owner.get(f"/api/teams/{team_id}/members").json()["members"]}

        # Anti-escalation & Owner protection:
        # 1) Setting role='owner' is rejected with 422 invalid_input
        _assert_clean_chinese_api_error(
            owner.post(f"/api/teams/{team_id}/members", json={"email": "editor_user@example.test", "role": "owner"}),
            expected_status=422,
            expected_code="invalid_input",
        )
        # 2) Modifying or deleting the owner row is blocked with 409 owner_protected
        _assert_clean_chinese_api_error(
            owner.post(f"/api/teams/{team_id}/members", json={"email": "owner_admin@example.test", "role": "editor"}),
            expected_status=409,
            expected_code="owner_protected",
        )
        _assert_clean_chinese_api_error(
            owner.delete(f"/api/teams/{team_id}/members/{owner_uid}"),
            expected_status=409,
            expected_code="owner_protected",
        )
        # 3) Adding an un-registered / un-admitted email returns 404 not_found
        _assert_clean_chinese_api_error(
            owner.post(f"/api/teams/{team_id}/members", json={"email": "never_registered@external.test", "role": "viewer"}),
            expected_status=404,
            expected_code="not_found",
        )

        # 4) Enforce MAX_TEAM_MEMBERS == 6 (currently 3 members: owner, editor, viewer -> add 3 more = 6, 7th -> 409 team_full)
        for idx in range(1, 4):
            login(f"cap_member_{idx}@example.test")
            r_cap = owner.post(
                f"/api/teams/{team_id}/members",
                json={"email": f"cap_member_{idx}@example.test", "role": "viewer"},
            )
            assert r_cap.status_code == 201, r_cap.text

        login("cap_member_4@example.test")
        r_over_cap = owner.post(
            f"/api/teams/{team_id}/members",
            json={"email": "cap_member_4@example.test", "role": "viewer"},
        )
        _assert_clean_chinese_api_error(r_over_cap, expected_status=409, expected_code="team_full")
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 2. Full 4-Role Project, Questionnaire, Report, Survey & Agent RBAC Matrix
# ---------------------------------------------------------------------------


def test_project_questionnaire_report_survey_and_agent_4role_rbac_matrix(tmp_path: Path) -> None:
    _app, _settings, _engine, _deliveries, _anon, login, cleanup = _create_harness(tmp_path)
    try:
        owner, _ = login("owner_admin@example.test")
        editor, _ = login("editor_user@example.test")
        viewer, _ = login("viewer_user@example.test")
        outsider, _ = login("outsider_user@example.test")

        team_id = owner.get("/api/teams").json()["teams"][0]["id"]
        assert owner.post(
            f"/api/teams/{team_id}/members",
            json={"email": "editor_user@example.test", "role": "editor"},
        ).status_code == 201
        assert owner.post(
            f"/api/teams/{team_id}/members",
            json={"email": "viewer_user@example.test", "role": "viewer"},
        ).status_code == 201

        # --- Project Creation ---
        r_proj_owner = owner.post(
            "/api/projects",
            json={"teamId": team_id, "title": "所有者立项课题", "idempotencyKey": str(uuid4())},
        )
        assert r_proj_owner.status_code == 201, r_proj_owner.text

        r_proj_editor = editor.post(
            "/api/projects",
            json={"teamId": team_id, "title": "编辑者协同立项课题", "idempotencyKey": str(uuid4())},
        )
        assert r_proj_editor.status_code == 201, r_proj_editor.text
        pid = r_proj_editor.json()["id"]

        # Viewer -> 403 permission_denied; Outsider -> 404 not_found
        _assert_clean_chinese_api_error(
            viewer.post("/api/projects", json={"teamId": team_id, "title": "只读成员越权立项", "idempotencyKey": str(uuid4())}),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post("/api/projects", json={"teamId": team_id, "title": "外部账号越权立项", "idempotencyKey": str(uuid4())}),
            expected_status=404,
            expected_code="not_found",
        )

        # --- Project Read & membershipRole Binding ---
        for role_client, expected_role in ((owner, "owner"), (editor, "editor"), (viewer, "viewer")):
            r_get_p = role_client.get(f"/api/projects/{pid}")
            assert r_get_p.status_code == 200, r_get_p.text
            assert r_get_p.json()["membershipRole"] == expected_role

        _assert_clean_chinese_api_error(
            outsider.get(f"/api/projects/{pid}"),
            expected_status=404,
            expected_code="not_found",
        )

        # --- Questionnaire Write & Read ---
        _assert_clean_chinese_api_error(
            viewer.post(
                f"/api/projects/{pid}/questionnaire/versions",
                json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "design": _sample_questionnaire_design("VW")},
            ),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(
                f"/api/projects/{pid}/questionnaire/versions",
                json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "design": _sample_questionnaire_design("OUT")},
            ),
            expected_status=404,
            expected_code="not_found",
        )

        r_q_v1 = owner.post(
            f"/api/projects/{pid}/questionnaire/versions",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "design": _sample_questionnaire_design("V1")},
        )
        assert r_q_v1.status_code == 201, r_q_v1.text
        r_q_v2 = editor.post(
            f"/api/projects/{pid}/questionnaire/versions",
            json={"expectedRevision": 1, "idempotencyKey": str(uuid4()), "design": _sample_questionnaire_design("V2")},
        )
        assert r_q_v2.status_code == 201, r_q_v2.text

        assert viewer.get(f"/api/projects/{pid}/questionnaire").status_code == 200
        assert viewer.get(f"/api/projects/{pid}/questionnaire/versions").status_code == 200
        _assert_clean_chinese_api_error(
            outsider.get(f"/api/projects/{pid}/questionnaire"),
            expected_status=404,
            expected_code="not_found",
        )

        # --- Report Write & Read ---
        _assert_clean_chinese_api_error(
            viewer.post(
                f"/api/projects/{pid}/report/versions",
                json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "content": _sample_report_content("VW")},
            ),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(
                f"/api/projects/{pid}/report/versions",
                json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "content": _sample_report_content("OUT")},
            ),
            expected_status=404,
            expected_code="not_found",
        )

        r_rep_v1 = editor.post(
            f"/api/projects/{pid}/report/versions",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "content": _sample_report_content("V1")},
        )
        assert r_rep_v1.status_code == 201, r_rep_v1.text
        assert viewer.get(f"/api/projects/{pid}/report").status_code == 200
        _assert_clean_chinese_api_error(
            outsider.get(f"/api/projects/{pid}/report"),
            expected_status=404,
            expected_code="not_found",
        )

        # --- Survey Publish, Dataset Export & Close ---
        _assert_clean_chinese_api_error(
            viewer.post(
                f"/api/projects/{pid}/surveys",
                json={"expectedQuestionnaireRevision": 2, "idempotencyKey": str(uuid4())},
            ),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(
                f"/api/projects/{pid}/surveys",
                json={"expectedQuestionnaireRevision": 2, "idempotencyKey": str(uuid4())},
            ),
            expected_status=404,
            expected_code="not_found",
        )

        r_pub = editor.post(
            f"/api/projects/{pid}/surveys",
            json={"expectedQuestionnaireRevision": 2, "idempotencyKey": str(uuid4())},
        )
        assert r_pub.status_code == 201, r_pub.text
        release_id = r_pub.json()["id"]

        # Viewer can list survey releases & export dataset, but CANNOT close a survey release!
        assert viewer.get(f"/api/projects/{pid}/surveys").status_code == 200
        assert viewer.get(f"/api/projects/{pid}/surveys/{release_id}/dataset").status_code == 200
        _assert_clean_chinese_api_error(
            outsider.get(f"/api/projects/{pid}/surveys/{release_id}/dataset"),
            expected_status=404,
            expected_code="not_found",
        )
        _assert_clean_chinese_api_error(
            viewer.post(
                f"/api/projects/{pid}/surveys/{release_id}/close",
                json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
            ),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(
                f"/api/projects/{pid}/surveys/{release_id}/close",
                json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
            ),
            expected_status=404,
            expected_code="not_found",
        )
        r_closed = owner.post(
            f"/api/projects/{pid}/surveys/{release_id}/close",
            json={"expectedRevision": 1, "idempotencyKey": str(uuid4())},
        )
        assert r_closed.status_code == 200, r_closed.text
        assert r_closed.json()["status"] == "closed"

        # --- Agent Tasks & Autonomous Research Trigger RBAC ---
        _assert_clean_chinese_api_error(
            viewer.post(
                f"/api/projects/{pid}/agent-tasks",
                json={"taskType": "questionnaire", "requirements": {"goal": "只读成员越权发起任务"}},
            ),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(
                f"/api/projects/{pid}/agent-tasks",
                json={"taskType": "questionnaire", "requirements": {"goal": "外部账号越权发起任务"}},
            ),
            expected_status=404,
            expected_code="not_found",
        )

        r_task = owner.post(
            f"/api/projects/{pid}/agent-tasks",
            json={"taskType": "questionnaire", "requirements": {"goal": "协同推进问卷设计审阅"}},
        )
        assert r_task.status_code == 201, r_task.text
        tid = r_task.json()["id"]
        tpath = f"/api/projects/{pid}/agent-tasks/{tid}"

        # Viewer can read task status (200), but CANNOT advance, approve, or cancel (403)!
        assert viewer.get(tpath).status_code == 200
        _assert_clean_chinese_api_error(
            viewer.post(f"{tpath}/advance", json={"expectedRevision": 0}),
            expected_status=403,
            expected_code="permission_denied",
        )

        # Editor CAN advance to awaiting_approval; Viewer still blocked from /approval & /cancel with 403!
        s1 = editor.post(f"{tpath}/advance", json={"expectedRevision": 0}).json()
        s2 = editor.post(f"{tpath}/advance", json={"expectedRevision": s1["revision"]}).json()
        assert s2["status"] == "needs_input"
        _assert_clean_chinese_api_error(
            viewer.post(f"{tpath}/approval", json={"expectedRevision": s2["revision"], "approved": True}),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            viewer.post(f"{tpath}/cancel", json={"expectedRevision": s2["revision"]}),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(f"{tpath}/approval", json={"expectedRevision": s2["revision"], "approved": True}),
            expected_status=404,
            expected_code="not_found",
        )

        # Autonomous run trigger: Viewer -> 403 permission_denied; Outsider -> 404 not_found
        _assert_clean_chinese_api_error(
            viewer.post(
                f"/api/projects/{pid}/autonomous-runs",
                json={
                    "idempotencyKey": str(uuid4()),
                    "goal": "只读成员尝试启动自主探索",
                    "datasetMode": "planted_trap_benchmark",
                    "leaseMode": "milestone_gated",
                },
            ),
            expected_status=403,
            expected_code="permission_denied",
        )
        _assert_clean_chinese_api_error(
            outsider.post(
                f"/api/projects/{pid}/autonomous-runs",
                json={
                    "idempotencyKey": str(uuid4()),
                    "goal": "外部用户尝试启动自主探索",
                    "datasetMode": "planted_trap_benchmark",
                    "leaseMode": "milestone_gated",
                },
            ),
            expected_status=404,
            expected_code="not_found",
        )
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 3. Live Role Demotion & Member Removal Immediate Enforcement Guard
# ---------------------------------------------------------------------------


def test_live_role_demotion_and_member_removal_immediate_revocation(tmp_path: Path) -> None:
    _app, _settings, _engine, _deliveries, _anon, login, cleanup = _create_harness(tmp_path)
    try:
        owner, _ = login("owner_admin@example.test")
        collab, collab_sess = login("editor_user@example.test")
        collab_uid = collab_sess["user"]["id"]

        team_id = owner.get("/api/teams").json()["teams"][0]["id"]
        assert owner.post(
            f"/api/teams/{team_id}/members",
            json={"email": "editor_user@example.test", "role": "editor"},
        ).status_code == 201

        proj = owner.post(
            "/api/projects",
            json={"teamId": team_id, "title": "动态降级与移除即时生效核验", "idempotencyKey": str(uuid4())},
        ).json()
        pid = proj["id"]

        # While editor, write succeeds (201)
        r_write_ok = collab.post(
            f"/api/projects/{pid}/report/versions",
            json={"expectedRevision": 0, "idempotencyKey": str(uuid4()), "content": _sample_report_content("ED_OK")},
        )
        assert r_write_ok.status_code == 201, r_write_ok.text

        # Owner demotes editor -> viewer in-place
        r_demote = owner.post(
            f"/api/teams/{team_id}/members",
            json={"email": "editor_user@example.test", "role": "viewer"},
        )
        assert r_demote.status_code == 201, r_demote.text
        assert r_demote.json()["role"] == "viewer"

        # Immediately: GET still succeeds as 'viewer', but write is rejected with 403 permission_denied!
        r_read_vw = collab.get(f"/api/projects/{pid}")
        assert r_read_vw.status_code == 200
        assert r_read_vw.json()["membershipRole"] == "viewer"
        _assert_clean_chinese_api_error(
            collab.post(
                f"/api/projects/{pid}/report/versions",
                json={"expectedRevision": 1, "idempotencyKey": str(uuid4()), "content": _sample_report_content("VW_BLOCK")},
            ),
            expected_status=403,
            expected_code="permission_denied",
        )

        # Owner removes collaborator completely -> 204
        r_del = owner.delete(f"/api/teams/{team_id}/members/{collab_uid}")
        assert r_del.status_code == 204
        # Deleting an already-removed member returns 404 not_found
        _assert_clean_chinese_api_error(
            owner.delete(f"/api/teams/{team_id}/members/{collab_uid}"),
            expected_status=404,
            expected_code="not_found",
        )

        # Immediately: ALL reads and writes on the team & project return 404 not_found!
        for check_resp in (
            collab.get(f"/api/projects/{pid}"),
            collab.get(f"/api/projects/{pid}/report"),
            collab.get(f"/api/projects/{pid}/questionnaire"),
            collab.get(f"/api/teams/{team_id}/presence"),
            collab.post(
                f"/api/projects/{pid}/report/versions",
                json={"expectedRevision": 1, "idempotencyKey": str(uuid4()), "content": _sample_report_content("GONE")},
            ),
        ):
            _assert_clean_chinese_api_error(check_resp, expected_status=404, expected_code="not_found")
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 4. Invite Issuance Admin-Only Authority, Secret Non-Echo & Cross-Admin Guard
# ---------------------------------------------------------------------------


def test_invite_issuance_admin_only_secret_non_echo_and_cross_admin_isolation(tmp_path: Path) -> None:
    _app, _settings, _engine, _deliveries, _anon, login, cleanup = _create_harness(tmp_path)
    try:
        admin_1, _ = login("owner_admin@example.test")
        admin_2, _ = login("second_admin@example.test")

        # Parameter bounds validation (maxUses 1..50, days 1..30, non-empty control-free label)
        for bad_invite in (
            {"label": "", "maxUses": 1, "days": 7},
            {"label": "含控制符\x07标签", "maxUses": 1, "days": 7},
            {"label": "零次越界", "maxUses": 0, "days": 7},
            {"label": "超量越界", "maxUses": 51, "days": 7},
            {"label": "零天越界", "maxUses": 1, "days": 0},
            {"label": "超期越界", "maxUses": 1, "days": 31},
        ):
            _assert_clean_chinese_api_error(
                admin_1.post("/api/invites", json=bad_invite),
                expected_status=422,
                expected_code="invalid_input",
            )

        # Issue valid invite -> plaintext `code` returned ONCE in 201 response, never echoed in GET /api/invites
        r_inv = admin_1.post("/api/invites", json={"label": "春季赛省赛调研队员邀请", "maxUses": 2, "days": 7})
        assert r_inv.status_code == 201, r_inv.text
        inv_created = r_inv.json()
        raw_code = inv_created["code"]
        inv_id = inv_created["id"]
        assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}", raw_code)
        assert all(ch in ALPHABET for ch in raw_code.replace("-", ""))
        assert inv_created["status"] == "active"
        assert inv_created["uses"] == 0

        r_list = admin_1.get("/api/invites")
        assert r_list.status_code == 200, r_list.text
        assert raw_code not in r_list.text
        assert raw_code.replace("-", "") not in r_list.text
        listed_item = r_list.json()["invites"][0]
        assert listed_item["id"] == inv_id
        assert "code" not in listed_item

        # Cross-admin isolation: admin_2 cannot see or revoke admin_1's invite
        assert admin_2.get("/api/invites").json()["invites"] == []
        _assert_clean_chinese_api_error(
            admin_2.post(f"/api/invites/{inv_id}/revoke"),
            expected_status=404,
            expected_code="not_found",
        )

        # Register an external account via raw_code; verify invite-admitted user CANNOT issue/list/revoke invites (403 invite_forbidden)!
        invited_client, _ = login("external_researcher@campus.test", invite_code=raw_code)
        _assert_clean_chinese_api_error(
            invited_client.get("/api/invites"),
            expected_status=403,
            expected_code="invite_forbidden",
        )
        _assert_clean_chinese_api_error(
            invited_client.post("/api/invites", json={"label": "禁止二次扩散邀请", "maxUses": 1, "days": 3}),
            expected_status=403,
            expected_code="invite_forbidden",
        )
        _assert_clean_chinese_api_error(
            invited_client.post(f"/api/invites/{inv_id}/revoke"),
            expected_status=403,
            expected_code="invite_forbidden",
        )
    finally:
        cleanup()


# ---------------------------------------------------------------------------
# 5. Invite Redemption Full Lifecycle (Normal, Duplicate/Race, Expired, Revoked, Wrong-Email)
# ---------------------------------------------------------------------------


def test_invite_redemption_normal_duplicate_race_expired_revoked_and_wrong_email_guards(
    tmp_path: Path,
) -> None:
    _app, _settings, engine, deliveries, new_anon_client, login, cleanup = _create_harness(tmp_path)
    try:
        admin, _ = login("owner_admin@example.test")
        admin_team_id = admin.get("/api/teams").json()["teams"][0]["id"]

        # 5a. Unlisted email without inviteCode or with bogus inviteCode -> uniform 202 + 401 email_code_invalid
        anon = new_anon_client()
        r_no_inv = anon.post("/api/auth/code", json={"email": "stranger_no_code@external.test"})
        assert r_no_inv.status_code == 202
        cid_no_inv = r_no_inv.json()["challengeId"]
        assert cid_no_inv not in deliveries
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid_no_inv, "code": "123456"}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        r_bad_inv = anon.post(
            "/api/auth/code",
            json={"email": "stranger_bad_code@external.test", "inviteCode": "ABCD-EFGH-JKLM"},
        )
        assert r_bad_inv.status_code == 202
        cid_bad_inv = r_bad_inv.json()["challengeId"]
        assert cid_bad_inv not in deliveries
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid_bad_inv, "code": "654321"}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        # 5b. Normal redemption (with NFKC lowercase + spaces formatting) + subsequent login without inviteCode
        inv_single = admin.post("/api/invites", json={"label": "单次兑换码核验", "maxUses": 1, "days": 5}).json()
        spaced_lower_code = "  " + inv_single["code"].replace("-", " ").lower() + "  "
        admitted_client, admitted_sess = login("admitted_once@external.test", invite_code=spaced_lower_code)
        assert admitted_sess["authenticated"] is True
        assert len(admitted_client.get("/api/teams").json()["teams"]) == 1

        # Invite status is now 'used_up' (uses == 1 == maxUses)
        inv_map = {row["id"]: row for row in admin.get("/api/invites").json()["invites"]}
        assert inv_map[inv_single["id"]]["status"] == "used_up"
        assert inv_map[inv_single["id"]]["uses"] == 1

        # Admitted account can join admin's team (201)
        r_join_team = admin.post(
            f"/api/teams/{admin_team_id}/members",
            json={"email": "admitted_once@external.test", "role": "editor"},
        )
        assert r_join_team.status_code == 201, r_join_team.text

        # Second unlisted user trying to reuse the already used_up code at /auth/code -> 401 email_code_invalid
        r_reuse = anon.post(
            "/api/auth/code",
            json={"email": "second_reuser@external.test", "inviteCode": inv_single["code"]},
        )
        assert r_reuse.status_code == 202
        cid_reuse = r_reuse.json()["challengeId"]
        assert cid_reuse not in deliveries
        _assert_clean_chinese_api_error(
            anon.post("/api/auth/verify", json={"challengeId": cid_reuse, "code": "111111"}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        # 5c. Concurrent race on single-use invite: two emails obtain OTPs while uses==0; loser gets 401 invite_unavailable!
        inv_race = admin.post("/api/invites", json={"label": "并发单次抢占测试", "maxUses": 1, "days": 5}).json()
        c_racer1 = new_anon_client()
        c_racer2 = new_anon_client()
        cid_r1 = c_racer1.post(
            "/api/auth/code",
            json={"email": "racer_one@external.test", "inviteCode": inv_race["code"]},
        ).json()["challengeId"]
        cid_r2 = c_racer2.post(
            "/api/auth/code",
            json={"email": "racer_two@external.test", "inviteCode": inv_race["code"]},
        ).json()["challengeId"]
        assert cid_r1 in deliveries and cid_r2 in deliveries

        # Racer 1 redeems first -> 200 OK
        r_win = c_racer1.post("/api/auth/verify", json={"challengeId": cid_r1, "code": deliveries[cid_r1][1]})
        assert r_win.status_code == 200, r_win.text

        # Racer 2 submits valid OTP after quota hit max_uses -> atomic 401 invite_unavailable pure Chinese!
        r_lose = c_racer2.post("/api/auth/verify", json={"challengeId": cid_r2, "code": deliveries[cid_r2][1]})
        _assert_clean_chinese_api_error(r_lose, expected_status=401, expected_code="invite_unavailable")

        # 5d. Expired invite code: both mid-flight expiry (401 invite_unavailable) and pre-request expiry (401 email_code_invalid)
        inv_exp = admin.post("/api/invites", json={"label": "过期拦截核验", "maxUses": 3, "days": 1}).json()
        c_exp = new_anon_client()
        cid_exp_mid = c_exp.post(
            "/api/auth/code",
            json={"email": "expire_midflight@external.test", "inviteCode": inv_exp["code"]},
        ).json()["challengeId"]
        assert cid_exp_mid in deliveries

        # Force invite expiration in DB before /auth/verify
        with DBSession(engine) as db_sess:
            db_sess.execute(
                update(InviteCode)
                .where(InviteCode.id == inv_exp["id"])
                .values(expires_at=now() - timedelta(minutes=5))
            )
            db_sess.commit()

        inv_map_exp = {row["id"]: row for row in admin.get("/api/invites").json()["invites"]}
        assert inv_map_exp[inv_exp["id"]]["status"] == "expired"

        _assert_clean_chinese_api_error(
            c_exp.post("/api/auth/verify", json={"challengeId": cid_exp_mid, "code": deliveries[cid_exp_mid][1]}),
            expected_status=401,
            expected_code="invite_unavailable",
        )

        cid_exp_after = c_exp.post(
            "/api/auth/code",
            json={"email": "expire_after@external.test", "inviteCode": inv_exp["code"]},
        ).json()["challengeId"]
        assert cid_exp_after not in deliveries
        _assert_clean_chinese_api_error(
            c_exp.post("/api/auth/verify", json={"challengeId": cid_exp_after, "code": "222222"}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        # 5e. Revoked invite code: mid-flight revoke -> 401 invite_unavailable; post-revoke -> 401 email_code_invalid;
        #     meanwhile already-admitted `admitted_once@external.test` retains full session access!
        inv_rev = admin.post("/api/invites", json={"label": "作废撤销核验", "maxUses": 3, "days": 5}).json()
        c_rev = new_anon_client()
        cid_rev_mid = c_rev.post(
            "/api/auth/code",
            json={"email": "revoked_midflight@external.test", "inviteCode": inv_rev["code"]},
        ).json()["challengeId"]
        assert cid_rev_mid in deliveries

        r_revoked = admin.post(f"/api/invites/{inv_rev['id']}/revoke")
        assert r_revoked.status_code == 200, r_revoked.text
        assert r_revoked.json()["status"] == "revoked"
        assert r_revoked.json()["revokedAt"] is not None

        _assert_clean_chinese_api_error(
            c_rev.post("/api/auth/verify", json={"challengeId": cid_rev_mid, "code": deliveries[cid_rev_mid][1]}),
            expected_status=401,
            expected_code="invite_unavailable",
        )

        cid_rev_after = c_rev.post(
            "/api/auth/code",
            json={"email": "revoked_after@external.test", "inviteCode": inv_rev["code"]},
        ).json()["challengeId"]
        assert cid_rev_after not in deliveries
        _assert_clean_chinese_api_error(
            c_rev.post("/api/auth/verify", json={"challengeId": cid_rev_after, "code": "333333"}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        # Already-admitted user keeps working seamlessly even if their original invite is later revoked
        assert admin.post(f"/api/invites/{inv_single['id']}/revoke").status_code == 200
        assert admitted_client.get("/api/projects").status_code == 200

        # 5f. Wrong-email OTP swap & brute-force lockout leave invite quota completely unspent
        inv_swap = admin.post("/api/invites", json={"label": "错邮箱与防爆破核验", "maxUses": 2, "days": 5}).json()
        c_legit = new_anon_client()
        c_wrong = new_anon_client()
        cid_legit = c_legit.post(
            "/api/auth/code",
            json={"email": "legit_target@external.test", "inviteCode": inv_swap["code"]},
        ).json()["challengeId"]
        cid_wrong_email = c_wrong.post(
            "/api/auth/code",
            json={"email": "wrong_attacker@external.test"},
        ).json()["challengeId"]
        legit_otp = deliveries[cid_legit][1]

        # Attacker trying to redeem legit_otp against wrong_attacker's challenge -> 401 email_code_invalid
        _assert_clean_chinese_api_error(
            c_wrong.post("/api/auth/verify", json={"challengeId": cid_wrong_email, "code": legit_otp}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        # 5 wrong OTP guesses against cid_legit lock out that challenge, so even legit_otp on 6th try is rejected!
        wrong_otp = "000000" if legit_otp != "000000" else "999999"
        for _ in range(5):
            _assert_clean_chinese_api_error(
                c_wrong.post("/api/auth/verify", json={"challengeId": cid_legit, "code": wrong_otp}),
                expected_status=401,
                expected_code="email_code_invalid",
            )
        _assert_clean_chinese_api_error(
            c_legit.post("/api/auth/verify", json={"challengeId": cid_legit, "code": legit_otp}),
            expected_status=401,
            expected_code="email_code_invalid",
        )

        # Verify invite quota was NOT consumed (uses == 0)
        inv_map_final = {row["id"]: row for row in admin.get("/api/invites").json()["invites"]}
        assert inv_map_final[inv_swap["id"]]["uses"] == 0
        assert inv_map_final[inv_swap["id"]]["status"] == "active"
    finally:
        cleanup()
