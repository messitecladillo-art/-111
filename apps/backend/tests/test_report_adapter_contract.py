"""Recovery wiring checks; these are fault probes, not PostgreSQL/RLS acceptance."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from application.services.report_ai_usage import ReportAiUsageService
from application.services.latex import LatexService
from shared.errors import ApiError


def test_usage_authorization_precedes_any_query():
    def denied(*args):
        raise ApiError(404, "not_found", "not found")

    class NoQuery:
        def execute(self, query):
            pytest.fail("unauthorized project must not query metadata")

    with pytest.raises(ApiError):
        ReportAiUsageService(owned_project=denied).ledger(project_id="p", user=SimpleNamespace(id="u"), session=NoQuery())


def test_usage_projects_only_current_personal_metadata_and_preserves_unknown():
    now = datetime(2026, 10, 26, tzinfo=timezone.utc)
    row = {"id": "proposal", "status": "outcome_unknown", "service_revision": 1,
           "dispatched_at": now, "finished_at": None, "current_service_revision": 2,
           "provider": "openai", "model": "current-model"}

    class ReadSession:
        query = None

        def execute(self, query):
            self.query = query
            return SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: [row]))

    session = ReadSession()
    service = ReportAiUsageService(owned_project=lambda *_: (SimpleNamespace(id="project-one"), None))
    result = service.ledger(project_id="requested", user=SimpleNamespace(id="owner-one"), session=session)
    query = session.query
    selected = {column.key for column in query.selected_columns}
    assert selected == {"id", "status", "service_revision", "dispatched_at", "finished_at", "current_service_revision", "provider", "model"}
    params = query.compile().params
    assert "owner-one" in params.values() and "project-one" in params.values()
    assert query._limit_clause.value == 200
    sql = str(query)
    assert "proposals.user_id" in sql and "services.user_id" in sql
    assert "services.deleted IS false" in sql
    assert "proposals.created_at DESC, proposals.id DESC" in sql
    assert result["coverage"] == "partial"
    assert result["records"][0]["status"] == "unknown"
    assert result["records"][0]["provider"] is None
    assert result["records"][0]["model"] is None
    assert result["records"][0]["finishedAt"] is None
    assert result["records"][0]["inputHash"] is None


class CompileSession:
    def __init__(self):
        self.calls = []

    def execute(self, query):
        self.calls.append("user-lock")
        return SimpleNamespace(scalar_one=lambda: object())

    def scalar(self, query):
        self.calls.append("quota")
        return 0

    def add(self, value):
        self.calls.append("rate-event")

    def commit(self):
        self.calls.append("commit")


def latex_service():
    settings = SimpleNamespace(latex_concurrency=1, latex_hourly_compiles=10)
    return LatexService(settings=settings, owned_project=lambda *_: None)


def compile_data(**extra):
    return {"title": "Software-only test", "subtitle": "", "body": "Body.",
            "options": {"part": "main", "includeCover": False, "includeToc": False, "firstLineChars": 2, "numberPages": True}, **extra}


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", [{"figures": []}, {"frame": {"status": "draft"}}, {"visualStyle": {"schema": "unknown"}}])
async def test_invalid_visual_request_is_rejected_before_quota_or_compile(invalid):
    session = CompileSession()
    service = latex_service()
    service.compiler.compile = lambda *_: pytest.fail("invalid visual request compiled")
    with pytest.raises(ApiError):
        await service.compile_report(project_id="p", user=SimpleNamespace(id="u"), session=session,
                                     check_session=lambda _: SimpleNamespace(id="u"), data=compile_data(**invalid))
    assert session.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation", ["session", "membership"])
async def test_late_revocation_does_not_return_private_compile_result(revocation):
    session = CompileSession()
    service = latex_service()
    called = []

    def compile_result(*args):
        called.append(args)
        return {"status": "compiled", "pdfBase64": "private-output-marker"}

    def revoked(_):
        if revocation == "session":
            raise ApiError(401, "session_required", "revoked")
        return SimpleNamespace(id="u")

    def project_access(*_):
        if revocation == "membership":
            raise ApiError(404, "not_found", "membership revoked")

    service.compiler.compile = compile_result
    service.owned_project = project_access
    with pytest.raises(ApiError):
        await service.compile_report(project_id="p", user=SimpleNamespace(id="u"), session=session,
                                     check_session=revoked, data=compile_data())
    assert len(called) == 1 and called[0][4:] == (None, None, None)
    assert session.calls == ["user-lock", "quota", "rate-event", "commit"]
