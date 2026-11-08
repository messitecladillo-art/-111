"""Full-report boundary and dispatch ordering, using explicit synthetic responses.

The application double below tests transaction ordering and revocation handling;
it does not replace the separately marked actual PostgreSQL/RLS acceptance tests.
"""
import asyncio
from copy import deepcopy
from datetime import timedelta
from functools import partial
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from application.idempotency import reserve_operation
from application.services.full_report_section import FullReportSectionService
from evix_api.app import create_app
from infrastructure.database.models import Operation, RateEvent, Service, now
from infrastructure.llm import Completion
from infrastructure.security import encrypt
from multi_agent.agents.writing_agent.services import full_report_section as report
from shared.errors import ApiError, ProviderFailure


def preflight(**changes):
    return {"schemaVersion": 1, "runId": str(uuid4()), "projectId": None, "inputRevision": "synthetic-input-revision",
            "serviceId": str(uuid4()), "serviceRevision": 1, "consent": True, "mode": "plan", **changes}


def request(**changes):
    return {**preflight(), "idempotencyKey": str(uuid4()), "nodeId": "intro.background", "prompt": "合成测试资料：请保留待实施性质。",
            "wave": 1, "attempt": 1, "purpose": "draft", **changes}


def test_exact_context_and_all_twenty_six_slots_are_accepted_without_mutation():
    context = preflight()
    assert report.preflight_input(context) == context
    assert len(report.WAVE_1_NODES | report.WAVE_2_NODES) == 26
    for node in report.WAVE_1_NODES | report.WAVE_2_NODES:
        data = request(**context, nodeId=node, wave=1 if node in report.WAVE_1_NODES else 2)
        assert report.request_input(data) == data
        assert json.loads(report.section_prompt(data).split("资料 JSON：", 1)[1])["instructions"] == data["prompt"]


@pytest.mark.parametrize("changes", [
    {"schemaVersion": True}, {"schemaVersion": 2}, {"runId": "invalid"}, {"projectId": "local"},
    {"inputRevision": ""}, {"inputRevision": " "}, {"inputRevision": "x" * 129}, {"inputRevision": "bad\x7f"},
    {"serviceId": "00000000-0000-0000-0000-000000000000"}, {"serviceRevision": True}, {"serviceRevision": 0},
    {"consent": 1}, {"consent": False}, {"mode": "live"}, {"mode": {}}, {"mode": "empirical"}, {"extra": True},
])
def test_bad_preflight_context_is_refused(changes):
    with pytest.raises(ApiError):
        report.preflight_input(preflight(**changes))


@pytest.mark.parametrize("changes", [
    {"idempotencyKey": "invalid"}, {"nodeId": "invented"}, {"nodeId": []}, {"wave": True}, {"wave": 3},
    {"wave": 2}, {"nodeId": "abstract", "wave": 1}, {"attempt": True}, {"attempt": 0}, {"attempt": 3},
    {"purpose": "automatic-retry"}, {"purpose": []}, {"prompt": ""}, {"prompt": " "},
    {"prompt": "bad\x7f"}, {"prompt": "\ud800"}, {"prompt": "x" * 40001}, {"extra": 1},
])
def test_invalid_slot_payload_is_refused(changes):
    with pytest.raises(ApiError):
        report.request_input(request(**changes))


def test_missing_fields_and_escaped_transport_budget_are_refused():
    data = preflight()
    del data["projectId"]
    with pytest.raises(ApiError):
        report.preflight_input(data)
    with pytest.raises(ApiError) as failure:
        report.request_input(request(prompt="中" * 21000))
    assert failure.value.code == "input_too_large"
    with pytest.raises(ApiError) as escaped:
        report.request_input(request(prompt='"' * 35000))
    assert escaped.value.code == "input_too_large"


def test_modes_keep_their_truth_boundary_and_empirical_requires_a_real_project_id():
    for mode, phrase in (("plan", "研究计划"), ("demonstration", "教学模拟"), ("empirical", "登记证据")):
        data = request(mode=mode, projectId=str(uuid4()) if mode == "empirical" else None)
        assert report.request_input(data) == data
        prompt = report.section_prompt(data)
        assert phrase in prompt and "候选稿" in prompt and "不编造数字" in prompt
    with pytest.raises(ApiError) as denied:
        report.preflight_input(preflight(mode="empirical"))
    assert denied.value.code == "project_required"


def test_unknown_fingerprint_cannot_be_evaded_by_a_new_run_key_wording_or_attempt():
    data = request()
    changed = {**data, "runId": str(uuid4()), "idempotencyKey": str(uuid4()), "prompt": "换措辞重新发", "attempt": 2}
    assert report.input_fingerprint(data) == report.input_fingerprint(changed)
    for name, value in (("inputRevision", "new-input"), ("serviceRevision", 2), ("projectId", str(uuid4())),
                        ("nodeId", "intro.significance"), ("purpose", "revision"), ("mode", "demonstration")):
        assert report.input_fingerprint(data) != report.input_fingerprint({**data, name: value})


@pytest.mark.parametrize("encode", [
    lambda key: key,
    lambda key: json.dumps(key),
    lambda key: "".join("\\u%04x" % ord(character) for character in key),
    lambda key: json.dumps("".join("\\u%04x" % ord(character) for character in key)),
    lambda key: "\\u0073" + key[1:],
])
def test_credentials_are_refused_even_in_nested_or_mixed_json_escapes(encode):
    key = 'synthetic-"quoted"-credential'
    raw = '{"paragraphs":[{"text":' + encode(key) + '}]}'
    assert report.contains_secret(raw, key)
    with pytest.raises(ProviderFailure) as denied:
        report.safe_content(raw, key)
    assert denied.value.code == "invalid_response"


def test_raw_content_is_bounded_but_known_content_rejection_can_be_revised():
    # A received malformed paragraph object is known, not an uncertain transport failure.
    assert report.safe_content("合成测试：不是 JSON", "synthetic-credential") == "合成测试：不是 JSON"
    assert not report.contains_secret("普通研究资料", "synthetic-credential")
    for raw in (None, "", " ", "x\x00", "x\x7f", "\ud800"):
        with pytest.raises(ProviderFailure):
            report.safe_content(raw, "synthetic-credential")
    with pytest.raises(ProviderFailure) as large:
        report.safe_content("中" * 22000, "synthetic-credential")
    assert large.value.code == "response_too_large"


@pytest.mark.parametrize("usage", [None, {}, {"inputTokens": 1}, {"inputTokens": True, "outputTokens": 2},
                                   {"inputTokens": -1, "outputTokens": 2}, {"inputTokens": 1.5, "outputTokens": 2},
                                   {"inputTokens": 1, "outputTokens": 2**54}])
def test_usage_is_unknown_unless_both_actual_counts_are_valid(usage):
    assert report.safe_usage(usage) is None
    assert report.safe_usage({"inputTokens": 0, "outputTokens": 2, "extra": "discard"}) == {"inputTokens": 0, "outputTokens": 2}


def test_run_authorization_is_bounded_and_metadata_never_contains_the_body():
    data = request()
    run = report.run_receipt(data, SimpleNamespace(provider="deepseek", model="synthetic-model", max_output_tokens=8000), "fixture")
    assert run["maxConcurrency"] == 6 and run["maxOutputTokens"] == 2400 and run["providerMode"] == "fixture"
    assert report.timestamp(run["authorizationExpiresAt"]) - report.timestamp(run["createdAt"]) == timedelta(hours=2)
    assert report.authorization_expired(run) is False
    receipt = report.section_receipt(data, run)
    receipt.update(content="合成测试正文", usage={"inputTokens": 9, "outputTokens": 4})
    metadata = report.section_metadata(receipt)
    assert metadata["usage"] == receipt["usage"]
    assert not ({"content", "prompt", "apiKey", "key", "inputFingerprint"} & metadata.keys())
    op = SimpleNamespace(response={**receipt, "createdAt": report.iso(now() - timedelta(seconds=121))})
    report.expire_section(op)
    assert op.response["status"] == "outcome_unknown" and op.response["content"] is None
    assert op.response["errorCode"] == "interrupted_call"
    terminal = deepcopy(op.response)
    report.expire_section(op)
    assert op.response == terminal


class ApplicationSession:
    """A dispatch-order test double only; PostgreSQL semantics are not simulated."""
    def __init__(self, service):
        self.service, self.operations, self.events, self.commits, self.refreshed = service, {}, [], [], []
        self.fresh_revision, self.fresh_capabilities, self.fresh_deleted = service.revision, list(service.capabilities), False
        self.final_operation = None

    def get(self, model, identifier):
        assert model is Operation
        return self.operations.get(identifier)

    def add(self, value):
        if isinstance(value, Operation):
            self.operations[(value.user_id, value.scope, value.key)] = value
            if value.scope == report.SCOPE:
                self.final_operation = value
        else:
            assert isinstance(value, RateEvent)
            self.events.append(value)

    def refresh(self, service):
        assert service is self.service
        service.revision, service.capabilities, service.deleted = self.fresh_revision, self.fresh_capabilities, self.fresh_deleted
        self.refreshed.append(service.revision)

    def execute(self, statement, parameters=None):
        if parameters:
            assert "set_config" in str(statement)
            return None
        return SimpleNamespace(scalar_one=lambda: self.final_operation)

    def commit(self):
        self.commits.append({key: deepcopy(op.response) for key, op in self.operations.items()})


@pytest.fixture
def application_harness(settings, monkeypatch):
    user = SimpleNamespace(id=str(uuid4()))
    data = request()
    credential = 'synthetic-"quoted"-credential'
    service = Service(id=data["serviceId"], user_id=user.id, label="合成测试服务", provider="deepseek",
                      base_url="https://api.deepseek.com/v1", model="synthetic-model", max_output_tokens=8000,
                      capabilities=["report"], revision=1, deleted=False)
    encrypt(settings, service, credential)
    session = ApplicationSession(service)
    state = SimpleNamespace(calls=0, revoked=False, after_dispatch=lambda: None, raw=Completion('{"paragraphs":[{"text":"合成测试候选正文。"}]}'),
                            failure=None, checks=[])
    state.raw.usage = {"inputTokens": 51, "outputTokens": 13}

    async def dispatch(config, key, prompt):
        state.calls += 1
        assert session.commits[-1][(user.id, report.SCOPE, data["idempotencyKey"])]["status"] == "running"
        assert len(session.events) == state.calls
        assert config["maxOutputTokens"] == 2400 and key == credential
        assert "研究计划" in prompt and credential not in prompt
        assert credential not in json.dumps(list(session.commits[-1].values()), ensure_ascii=False)
        state.after_dispatch()
        if state.failure:
            raise state.failure
        return state.raw

    def check_session(session, *, lock=False):
        state.checks.append(lock)
        if state.revoked:
            raise ApiError(401, "session_required", "请先登录。")

    sut = FullReportSectionService(settings=settings, lock_user=lambda *args: None,
        operation=partial(reserve_operation, settings), owned_project=lambda *args, **kwargs: pytest.fail("unexpected project"),
        owned_service=lambda *args, **kwargs: service, generator=SimpleNamespace(section_draft=dispatch))
    # Slot/rate SQL is exercised by the actual PostgreSQL tests, not by this double.
    monkeypatch.setattr(sut, "_reserve_limits", lambda *args: "synthetic-rate-scope")
    sut.preflight(user=user, session=session, check_session=check_session, raw_data=report.context(data))
    return SimpleNamespace(sut=sut, user=user, data=data, service=service, session=session, state=state,
                           key=credential, check_session=check_session,
                           invoke=lambda: sut.create_section(user=user, session=session, check_session=check_session, raw_data=data))


async def test_committed_dispatch_is_replayed_without_a_second_provider_call(application_harness):
    h = application_harness
    made = await h.invoke()
    assert made["status"] == "ready" and made["usage"] == {"inputTokens": 51, "outputTokens": 13}
    assert made["classification"] == "proposed" and h.state.calls == 1
    assert await h.invoke() == made and h.state.calls == 1 and len(h.session.events) == 1
    assert len(h.session.refreshed) == 4 and all(h.state.checks)
    assert "prompt" not in made and h.key not in json.dumps(made)
    h.data["prompt"] = "变化后的资料"
    with pytest.raises(ApiError) as conflict:
        await h.invoke()
    assert conflict.value.code == "idempotency_conflict" and h.state.calls == 1


@pytest.mark.parametrize("failure, status, code", [
    (ProviderFailure("rate_limited"), "failed", "rate_limited"),
    (ProviderFailure("provider_rejected", unknown=True), "outcome_unknown", "provider_rejected"),
    (TimeoutError("raw-secret-must-not-leak"), "outcome_unknown", "provider_timeout"),
    (RuntimeError("raw-secret-must-not-leak"), "outcome_unknown", "provider_failure"),
])
async def test_provider_failure_is_safe_and_not_redispatched(application_harness, failure, status, code):
    h = application_harness
    h.state.failure = failure
    made = await h.invoke()
    assert made["status"] == status and made["errorCode"] == code and made["content"] is None and made["usage"] is None
    assert "raw-secret" not in json.dumps(made)
    assert await h.invoke() == made and h.state.calls == 1


async def test_cancellation_records_unknown_before_propagating(application_harness):
    h = application_harness
    h.state.failure = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await h.invoke()
    receipt = h.session.final_operation.response
    assert receipt["status"] == "outcome_unknown" and receipt["errorCode"] == "provider_timeout"
    assert h.session.commits[-1][(h.user.id, report.SCOPE, receipt["id"])] == receipt
    assert await h.invoke() == receipt and h.state.calls == 1


@pytest.mark.parametrize("change, code", [
    (lambda h: setattr(h.state, "revoked", True), "session_required"),
    (lambda h: setattr(h.session, "fresh_revision", 2), "revision_conflict"),
    (lambda h: setattr(h.session, "fresh_capabilities", ["research"]), "capability_unavailable"),
    (lambda h: setattr(h.session, "fresh_deleted", True), "not_found"),
])
async def test_post_dispatch_revocation_discards_body_but_preserves_actual_usage(application_harness, change, code):
    h = application_harness
    h.state.after_dispatch = lambda: change(h)
    with pytest.raises(ApiError) as denied:
        await h.invoke()
    assert denied.value.code == code
    receipt = h.session.final_operation.response
    assert receipt["status"] == "failed" and receipt["content"] is None and receipt["errorCode"] == code
    assert receipt["usage"] == {"inputTokens": 51, "outputTokens": 13} and h.state.calls == 1


@pytest.mark.parametrize("failure", [ProviderFailure("provider_timeout", unknown=True), TimeoutError(), asyncio.CancelledError()])
@pytest.mark.parametrize("access_change, code", [("session", "session_required"), ("run", "run_expired")])
async def test_access_loss_preserves_unknown_provider_outcome(application_harness, failure, access_change, code):
    h = application_harness
    h.state.failure = failure

    def lose_access():
        if access_change == "session":
            h.state.revoked = True
        else:
            run = h.session.operations[(h.user.id, report.RUN_SCOPE, h.data["runId"])]
            run.response = {**run.response, "authorizationExpiresAt": report.iso(now() - timedelta(seconds=1))}

    h.state.after_dispatch = lose_access
    expected = asyncio.CancelledError if isinstance(failure, asyncio.CancelledError) else ApiError
    with pytest.raises(expected):
        await h.invoke()
    receipt = deepcopy(h.session.final_operation.response)
    assert receipt["status"] == "outcome_unknown" and receipt["content"] is None
    assert receipt["errorCode"] == code and receipt["usage"] is None and h.state.calls == 1
    assert h.session.commits[-1][(h.user.id, report.SCOPE, receipt["id"])] == receipt
    if access_change == "session":
        # A fresh session may inspect/replay its original receipt, never dispatch it again.
        h.state.revoked = False
        assert await h.invoke() == receipt and h.state.calls == 1


@pytest.mark.parametrize("kind", ["section", "run"])
async def test_receipt_read_rechecks_session_after_account_lock(application_harness, monkeypatch, kind):
    h = application_harness
    made = await h.invoke()
    before = len(h.session.commits)
    assert not h.state.revoked  # The route's initial authentication succeeded.

    def revoked_while_waiting_for_account_lock(*args):
        h.state.revoked = True

    monkeypatch.setattr(h.sut, "lock_user", revoked_while_waiting_for_account_lock)
    with pytest.raises(ApiError) as denied:
        if kind == "section":
            h.sut.receipt(section_id=made["id"], user=h.user, session=h.session, check_session=h.check_session)
        else:
            h.sut.run_receipt(run_id=made["runId"], user=h.user, session=h.session, check_session=h.check_session)
    assert denied.value.code == "session_required" and h.state.checks[-1] is True
    assert len(h.session.commits) == before
    assert h.session.final_operation.response == made
    # Reconciliation is still available to a fresh session even if its model changed.
    monkeypatch.setattr(h.sut, "lock_user", lambda *args: None)
    h.state.revoked, h.session.fresh_revision = False, 2
    assert h.sut.receipt(section_id=made["id"], user=h.user, session=h.session, check_session=h.check_session) == made
    assert h.state.calls == 1


async def test_project_edit_revocation_discards_late_body(application_harness, monkeypatch):
    h = application_harness
    checks = []

    def project_access(session, user, project_id, *, edit=False):
        checks.append(edit)
        if h.state.revoked:
            raise ApiError(403, "permission_denied", "当前项目权限不能生成报告。")

    monkeypatch.setattr(h.sut, "_project", project_access)
    h.state.after_dispatch = lambda: setattr(h.state, "revoked", True)
    with pytest.raises(ApiError) as denied:
        await h.invoke()
    assert denied.value.code == "permission_denied" and checks == [True, True]
    assert h.session.final_operation.response["content"] is None
    assert h.session.final_operation.response["usage"] == {"inputTokens": 51, "outputTokens": 13}


async def test_secret_input_never_dispatches_and_secret_output_keeps_only_actual_usage(application_harness):
    h = application_harness
    original = h.data["prompt"]
    h.data["prompt"] = "误贴凭据 " + json.dumps(h.key)
    with pytest.raises(ApiError) as denied:
        await h.invoke()
    assert denied.value.code == "sensitive_input" and h.state.calls == 0 and not h.session.events
    # The real database dependency rolls back a rejected transaction; clear this
    # test double's uncommitted reservation before trying a separate request.
    h.session.operations.pop((h.user.id, report.SCOPE, h.data["idempotencyKey"]))
    h.data["prompt"] = original
    h.state.raw = Completion(json.dumps({"paragraphs": [{"text": h.key}]}))
    h.state.raw.usage = {"inputTokens": 8, "outputTokens": 5}
    made = await h.invoke()
    assert made["status"] == "failed" and made["content"] is None and made["errorCode"] == "invalid_response"
    assert made["usage"] == {"inputTokens": 8, "outputTokens": 5} and h.key not in json.dumps(made)


async def test_expired_lease_is_not_promoted_by_a_late_answer(application_harness):
    h = application_harness
    h.state.after_dispatch = lambda: setattr(h.session.final_operation, "response", {
        **h.session.final_operation.response, "createdAt": report.iso(now() - timedelta(seconds=121))})
    made = await h.invoke()
    assert made["status"] == "outcome_unknown" and made["content"] is None and made["usage"] == {"inputTokens": 51, "outputTokens": 13}


def test_preflight_replay_does_not_extend_authorization(application_harness):
    h = application_harness
    original = h.session.operations[(h.user.id, report.RUN_SCOPE, h.data["runId"])]
    before = deepcopy(original.response)
    assert h.sut.preflight(user=h.user, session=h.session, check_session=h.check_session, raw_data=report.context(h.data)) == before
    original.response = {**before, "authorizationExpiresAt": report.iso(now() - timedelta(seconds=1))}
    with pytest.raises(ApiError) as denied:
        h.sut.preflight(user=h.user, session=h.session, check_session=h.check_session, raw_data=report.context(h.data))
    assert denied.value.code == "run_expired" and h.state.calls == 0


def test_preflight_never_persists_credentials_in_caller_supplied_metadata(application_harness):
    h = application_harness
    data = {**report.context(h.data), "runId": str(uuid4()), "inputRevision": json.dumps(h.key)}
    with pytest.raises(ApiError) as denied:
        h.sut.preflight(user=h.user, session=h.session, check_session=h.check_session, raw_data=data)
    assert denied.value.code == "sensitive_input"
    assert (h.user.id, report.RUN_SCOPE, data["runId"]) not in h.session.operations
    assert h.state.calls == 0


def test_all_four_http_endpoints_require_a_session_without_connecting_to_database(settings):
    with TestClient(create_app(settings)) as client:
        for path, body in (("/api/agent/report-sections/preflight", preflight()), ("/api/agent/report-sections", request())):
            response = client.post(path, json=body)
            assert response.status_code == 401 and response.json()["error"]["code"] == "session_required"
        for path in ("/api/agent/report-sections/", "/api/agent/report-runs/"):
            response = client.get(path + str(uuid4()))
            assert response.status_code == 401 and response.json()["error"]["code"] == "session_required"
