"""Actual PostgreSQL/RLS acceptance; every provider return is synthetic.

The existing pg_engine fixture skips without an explicitly supplied synthetic
PostgreSQL URL. These tests neither install a database nor substitute SQLite.
"""
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Event
from uuid import uuid4

import pytest
from sqlalchemy import event, select, text, update

from infrastructure.database.models import Member, Operation, RateEvent, Service, Session, User, now
from infrastructure.llm import Completion
from infrastructure.security import keyed
from multi_agent.agents.writing_agent.services import full_report_section as report
from shared.errors import ProviderFailure
from tests.test_full_report_section import preflight, request
from tests.test_postgres import project, service_input
from tests.test_topics_postgres import as_user

pytestmark = pytest.mark.postgres
PATH = "/api/agent/report-sections"
RUNS = "/api/agent/report-runs"


def setup(client, **changes):
    response = client.post("/api/services", json=service_input(capabilities=["report"], maxOutputTokens=4096))
    assert response.status_code == 201, response.text
    service = response.json()
    data = request(serviceId=service["id"], serviceRevision=service["revision"], **changes)
    checked = client.post(PATH + "/preflight", json=report.context(data))
    assert checked.status_code == 200, checked.text
    return service, data, checked.json()


def operation_response(engine, user_id, scope, key):
    return as_user(engine, user_id, lambda connection: connection.scalar(select(Operation.response).where(
        Operation.user_id == user_id, Operation.scope == scope, Operation.key == key)))


def replace_response(engine, user_id, scope, key, **changes):
    response = operation_response(engine, user_id, scope, key)
    as_user(engine, user_id, lambda connection: connection.execute(update(Operation).where(
        Operation.user_id == user_id, Operation.scope == scope, Operation.key == key).values(response={**response, **changes})))


def test_preflight_dispatch_replay_metadata_privacy_and_owner_rls(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    other, other_identity = login("b@example.test")
    _, data, run = setup(owner)
    assert run["providerMode"] == "fixture" and run["maxConcurrency"] == 6 and run["maxOutputTokens"] == 2400
    assert provider.calls == 0
    made = owner.post(PATH, json=data)
    assert made.status_code == 201, made.text
    receipt = made.json()
    assert receipt["status"] == "ready" and receipt["classification"] == "proposed" and receipt["usage"] is None
    assert "合成测试" in receipt["content"]
    assert owner.post(PATH, json=data).json() == receipt and provider.calls == 1
    assert owner.get(PATH + "/" + receipt["id"]).json() == receipt
    metadata = owner.get(RUNS + "/" + data["runId"]).json()
    assert metadata["serviceCurrent"] is True and metadata["authorizationExpired"] is False and metadata["reconciliationOnly"] is True
    assert metadata["sections"] == [report.section_metadata(receipt)]
    assert "content" not in json.dumps(metadata) and "prompt" not in json.dumps(metadata)
    stored = operation_response(pg_engine, identity["user"]["id"], report.SCOPE, receipt["id"])
    assert data["prompt"] not in json.dumps(stored, ensure_ascii=False) and "synthetic-private-model-key" not in json.dumps(stored)
    assert other.get(PATH + "/" + receipt["id"]).status_code == 404
    assert other.get(RUNS + "/" + data["runId"]).status_code == 404
    assert as_user(pg_engine, other_identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope.in_((report.RUN_SCOPE, report.SCOPE)))).all()) == []


def test_preflight_requires_current_service_consent_origin_csrf_and_exact_schema(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    report_service = owner.post("/api/services", json=service_input(capabilities=["report"])).json()
    wrong_service = owner.post("/api/services", json=service_input(capabilities=["research"])).json()
    data = preflight(serviceId=report_service["id"], serviceRevision=report_service["revision"])
    for changes, code in (({"consent": False}, "consent_required"), ({"serviceRevision": 99}, "revision_conflict"),
                          ({"serviceId": wrong_service["id"]}, "capability_unavailable"), ({"mode": "empirical"}, "project_required"),
                          ({"apiKey": "synthetic-private-model-key"}, "invalid_input")):
        response = owner.post(PATH + "/preflight", json={**data, **changes})
        assert response.status_code in (409, 422) and response.json()["error"]["code"] == code
    for headers in ({"origin": "https://attacker.invalid"}, {"x-csrf-token": "wrong"}, {"sec-fetch-site": "cross-site"}):
        assert owner.post(PATH + "/preflight", json=data, headers=headers).status_code == 403
    assert provider.calls == 0
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope == report.RUN_SCOPE)).all()) == []
    assert owner.post(PATH, json=request(**data)).json()["error"]["code"] == "run_not_authorized"


def test_run_context_is_immutable_and_replay_cannot_extend_two_hour_authorization(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    _, data, run = setup(owner)
    assert owner.post(PATH + "/preflight", json=report.context(data)).json() == run
    changed = {**data, "inputRevision": "different-input"}
    assert owner.post(PATH, json=changed).json()["error"]["code"] == "run_context_conflict"
    assert owner.post(PATH + "/preflight", json=report.context(changed)).json()["error"]["code"] == "idempotency_conflict"
    replace_response(pg_engine, identity["user"]["id"], report.RUN_SCOPE, data["runId"],
                     authorizationExpiresAt=report.iso(now() - timedelta(seconds=1)))
    assert owner.post(PATH + "/preflight", json=report.context(data)).json()["error"]["code"] == "run_expired"
    assert owner.post(PATH, json=data).json()["error"]["code"] == "run_expired"
    assert owner.get(RUNS + "/" + data["runId"]).json()["authorizationExpired"] is True
    assert provider.calls == 0


def test_stable_slots_and_second_attempt_only_after_known_received_content(harness):
    _, login, _, provider = harness
    owner, _ = login()
    _, data, _ = setup(owner)
    too_early = {**data, "idempotencyKey": str(uuid4()), "attempt": 2}
    assert owner.post(PATH, json=too_early).json()["error"]["code"] == "attempt_order"
    first = owner.post(PATH, json=data)
    assert first.json()["status"] == "ready"
    assert owner.post(PATH, json={**data, "idempotencyKey": str(uuid4())}).json()["error"]["code"] == "slot_already_reserved"
    changed = owner.post(PATH, json={**data, "prompt": "本轮换一份资料"})
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "idempotency_conflict"
    second = owner.post(PATH, json={**too_early, "prompt": "合成测试：对已收到的结构进行修订"})
    assert second.status_code == 201 and second.json()["status"] == "ready"
    assert provider.calls == 2


def test_unknown_outcome_blocks_new_run_new_key_new_prompt_and_second_attempt(harness):
    _, login, _, provider = harness
    owner, _ = login()
    _, data, _ = setup(owner)

    async def uncertain(*args):
        provider.calls += 1
        raise ProviderFailure("provider_timeout", unknown=True)

    provider.section_draft = uncertain
    first = owner.post(PATH, json=data).json()
    assert first["status"] == "outcome_unknown" and first["content"] is None
    assert owner.post(PATH, json=data).json() == first
    new = {**data, "runId": str(uuid4()), "idempotencyKey": str(uuid4()), "prompt": "换措辞不能再次扣费", "attempt": 2}
    assert owner.post(PATH + "/preflight", json=report.context(new)).status_code == 200
    blocked = owner.post(PATH, json=new)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "outcome_unknown"
    assert provider.calls == 1


def test_hourly_rate_limit_counts_dispatches_and_does_not_block_exact_replay(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, data, _ = setup(owner)
    ready = owner.post(PATH, json=data).json()
    uid = identity["user"]["id"]
    scope = keyed(settings, "agent-full-report-call-rate/v1", uid)
    as_user(pg_engine, uid, lambda c: c.execute(RateEvent.__table__.insert(), [
        {"id": str(uuid4()), "scope": scope, "created_at": now()} for _ in range(119)]))
    assert owner.post(PATH, json=data).json() == ready
    another = {**data, "idempotencyKey": str(uuid4()), "nodeId": "intro.significance"}
    refusal = owner.post(PATH, json=another)
    assert refusal.status_code == 429 and refusal.json()["error"]["code"] == "call_rate_limit" and provider.calls == 1


def test_six_active_slots_and_expired_lease_reconciliation(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    _, data, run = setup(owner)
    uid = identity["user"]["id"]
    # Explicit synthetic abandoned reservations, inserted through the real RLS role.
    pending = []
    for node in sorted(report.WAVE_1_NODES - {data["nodeId"]})[:6]:
        call = {**data, "nodeId": node, "idempotencyKey": str(uuid4())}
        receipt = report.section_receipt(call, run)
        pending.append(receipt)
        as_user(pg_engine, uid, lambda c, r=receipt: c.execute(Operation.__table__.insert().values(
            user_id=uid, scope=report.SCOPE, key=r["id"], payload_hash="0" * 64, response=r)))
    blocked = owner.post(PATH, json=data)
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "call_active" and provider.calls == 0
    replace_response(pg_engine, uid, report.SCOPE, pending[0]["id"], createdAt=report.iso(now() - timedelta(seconds=121)))
    metadata = owner.get(RUNS + "/" + data["runId"]).json()
    stale = next(section for section in metadata["sections"] if section["id"] == pending[0]["id"])
    assert stale["status"] == "outcome_unknown" and stale["errorCode"] == "interrupted_call"
    assert owner.post(PATH, json=data).json()["status"] == "ready" and provider.calls == 1


def test_service_revision_changed_during_io_discards_body_and_keeps_usage(harness, pg_engine):
    _, login, _, provider = harness
    owner, identity = login()
    service, data, _ = setup(owner)
    uid = identity["user"]["id"]

    async def changed(*args):
        provider.calls += 1
        # A separate committed transaction can see the reservation before I/O.
        assert operation_response(pg_engine, uid, report.SCOPE, data["idempotencyKey"])["status"] == "running"
        as_user(pg_engine, uid, lambda c: c.execute(update(Service).where(Service.id == service["id"]).values(revision=2)))
        raw = Completion('{"paragraphs":[{"text":"合成测试晚到正文，应丢弃。"}]}')
        raw.usage = {"inputTokens": 70, "outputTokens": 15}
        return raw

    provider.section_draft = changed
    denied = owner.post(PATH, json=data)
    assert denied.status_code == 409 and denied.json()["error"]["code"] == "revision_conflict"
    receipt = owner.get(PATH + "/" + data["idempotencyKey"]).json()
    assert receipt["status"] == "failed" and receipt["content"] is None and receipt["usage"] == {"inputTokens": 70, "outputTokens": 15}
    assert owner.get(RUNS + "/" + data["runId"]).json()["serviceCurrent"] is False
    assert provider.calls == 1


def test_session_revoked_during_io_records_safe_terminal_receipt(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, data, _ = setup(owner)
    uid = identity["user"]["id"]
    token_hash = keyed(settings, "session/v1", owner.cookies.get(settings.cookie_name))

    async def revoked(*args):
        provider.calls += 1
        as_user(pg_engine, uid, lambda c: c.execute(update(Session).where(Session.token_hash == token_hash).values(revoked_at=now())))
        raw = Completion('{"paragraphs":[{"text":"合成测试晚到正文，应丢弃。"}]}')
        raw.usage = {"inputTokens": 10, "outputTokens": 3}
        return raw

    provider.section_draft = revoked
    denied = owner.post(PATH, json=data)
    assert denied.status_code == 401 and denied.json()["error"]["code"] == "session_required"
    receipt = operation_response(pg_engine, uid, report.SCOPE, data["idempotencyKey"])
    assert receipt["status"] == "failed" and receipt["content"] is None and receipt["errorCode"] == "session_required"
    assert receipt["usage"] == {"inputTokens": 10, "outputTokens": 3} and provider.calls == 1


def test_unknown_with_session_revocation_blocks_new_run_after_fresh_login(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, data, _ = setup(owner)
    uid = identity["user"]["id"]
    token_hash = keyed(settings, "session/v1", owner.cookies.get(settings.cookie_name))

    async def revoked_and_unknown(*args):
        provider.calls += 1
        as_user(pg_engine, uid, lambda c: c.execute(update(Session).where(Session.token_hash == token_hash).values(revoked_at=now())))
        raise ProviderFailure("provider_timeout", unknown=True)

    provider.section_draft = revoked_and_unknown
    assert owner.post(PATH, json=data).status_code == 401
    stored = operation_response(pg_engine, uid, report.SCOPE, data["idempotencyKey"])
    assert stored["status"] == "outcome_unknown" and stored["content"] is None
    assert stored["errorCode"] == "session_required" and provider.calls == 1
    fresh, fresh_identity = login()
    assert fresh_identity["user"]["id"] == uid
    assert fresh.get(PATH + "/" + data["idempotencyKey"]).json() == stored
    assert fresh.post(PATH, json=data).json() == stored
    new_run = {**data, "runId": str(uuid4()), "idempotencyKey": str(uuid4())}
    assert fresh.post(PATH + "/preflight", json=report.context(new_run)).status_code == 200
    blocked = fresh.post(PATH, json=new_run)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "outcome_unknown"
    assert provider.calls == 1


@pytest.mark.parametrize("kind", ["section", "run"])
def test_receipt_session_revoked_during_actual_account_lock_wait(harness, pg_engine, settings, kind):
    _, login, _, provider = harness
    owner, identity = login()
    _, data, _ = setup(owner)
    ready = owner.post(PATH, json=data).json()
    assert ready["status"] == "ready"
    uid = identity["user"]["id"]
    token_hash = keyed(settings, "session/v1", owner.cookies.get(settings.cookie_name))
    path = PATH + "/" + ready["id"] if kind == "section" else RUNS + "/" + data["runId"]
    reached_account_lock = Event()

    def waiting_for_user(conn, cursor, statement, parameters, context, executemany):
        if "from users" in statement.lower() and "for update" in statement.lower():
            reached_account_lock.set()

    with pg_engine.connect() as blocker:
        transaction = blocker.begin()
        blocker.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": uid})
        blocker.execute(select(User.id).where(User.id == uid).with_for_update()).scalar_one()
        event.listen(pg_engine, "before_cursor_execute", waiting_for_user)
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending = pool.submit(owner.get, path)
                try:
                    assert reached_account_lock.wait(5), "GET did not reach its account lock after initial authentication"
                    as_user(pg_engine, uid, lambda c: c.execute(update(Session).where(Session.token_hash == token_hash).values(revoked_at=now())))
                finally:
                    transaction.rollback()
                denied = pending.result(timeout=5)
        finally:
            if transaction.is_active:
                transaction.rollback()
            event.remove(pg_engine, "before_cursor_execute", waiting_for_user)
    assert denied.status_code == 401 and denied.json()["error"]["code"] == "session_required"
    fresh, _ = login()
    assert fresh.get(path).status_code == 200
    assert operation_response(pg_engine, uid, report.SCOPE, ready["id"]) == ready and provider.calls == 1


def test_project_edit_permission_is_checked_before_and_after_provider_io(harness, pg_engine):
    _, login, _, provider = harness
    owner, owner_identity = login()
    editor, editor_identity = login("b@example.test")
    p, team = project(owner)
    service = editor.post("/api/services", json=service_input(capabilities=["report"])).json()
    data = request(serviceId=service["id"], projectId=p["id"], mode="empirical")
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "viewer"}).status_code == 201
    assert editor.post(PATH + "/preflight", json=report.context(data)).status_code == 403
    assert owner.post(f"/api/teams/{team}/members", json={"email": "b@example.test", "role": "editor"}).status_code == 201
    assert editor.post(PATH + "/preflight", json=report.context(data)).status_code == 200

    async def downgraded(*args):
        provider.calls += 1
        as_user(pg_engine, owner_identity["user"]["id"], lambda c: c.execute(update(Member).where(
            Member.team_id == team, Member.user_id == editor_identity["user"]["id"]).values(role="viewer")))
        raw = Completion('{"paragraphs":[{"text":"合成测试晚到正文，应丢弃。"}]}')
        raw.usage = {"inputTokens": 20, "outputTokens": 6}
        return raw

    provider.section_draft = downgraded
    denied = editor.post(PATH, json=data)
    assert denied.status_code == 403
    receipt = editor.get(PATH + "/" + data["idempotencyKey"]).json()
    assert receipt["status"] == "failed" and receipt["content"] is None and receipt["usage"] == {"inputTokens": 20, "outputTokens": 6}
    assert provider.calls == 1
    assert owner.delete(f"/api/teams/{team}/members/{editor_identity['user']['id']}").status_code == 204
    assert editor.get(PATH + "/" + data["idempotencyKey"]).status_code == 404
    assert editor.get(RUNS + "/" + data["runId"]).status_code == 404


def test_input_and_escaped_provider_credential_leaks_are_refused(harness):
    _, login, _, provider = harness
    owner, _ = login()
    key = 'synthetic-"quoted"-private-key'
    service = owner.post("/api/services", json=service_input(capabilities=["report"], apiKey=key)).json()
    data = request(serviceId=service["id"], prompt="误贴凭据 " + json.dumps(key))
    assert owner.post(PATH + "/preflight", json=report.context(data)).status_code == 200
    refusal = owner.post(PATH, json=data)
    assert refusal.status_code == 422 and refusal.json()["error"]["code"] == "sensitive_input" and provider.calls == 0

    async def leak(*args):
        provider.calls += 1
        raw = Completion('{"paragraphs":[{"text":"' + "".join("\\u%04x" % ord(char) for char in key) + '"}]}')
        raw.usage = {"inputTokens": 11, "outputTokens": 9}
        return raw

    provider.section_draft = leak
    result = owner.post(PATH, json={**data, "prompt": "合成测试安全资料"}).json()
    assert result["status"] == "failed" and result["errorCode"] == "invalid_response" and result["content"] is None
    assert result["usage"] == {"inputTokens": 11, "outputTokens": 9} and key not in json.dumps(result)
