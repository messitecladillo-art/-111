import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select, text, update

from infrastructure.database.models import Proposal, Service
from multi_agent.agents.writing_agent.services.report_ai_usage import SCOPE, proposal_usage_record
from .test_postgres import project, service_input


def metadata(**patch):
    return {"id": str(uuid4()), "status": "outcome_unknown", "service_revision": 1,
            "current_service_revision": 1, "provider": "openai", "model": "fixture-model",
            "dispatched_at": datetime(2026, 10, 17, 8, 0, tzinfo=timezone.utc),
            "finished_at": None, **patch}


@pytest.mark.parametrize("stored,exported", [("ready", "succeeded"), ("outcome_unknown", "unknown"),
    ("running", "running"), ("failed", "failed"), ("cancelled", "cancelled"),
    ("queued", "queued"), ("unrecognized-future-status", "unknown")])
def test_actual_proposal_statuses_preserve_uncertainty_and_missing_receipts(stored, exported):
    row = metadata(status=stored)
    result = proposal_usage_record(row)
    assert result["id"] == row["id"] and result["status"] == exported
    assert result["requestedAt"] == "2026-10-17T08:00:00.000Z"
    assert result["finishedAt"] is None
    assert result["inputHash"] is None and result["outputHash"] is None
    assert result["usage"] == {"inputTokens": None, "outputTokens": None, "cost": None, "currency": None}


def test_adapter_reads_only_projected_metadata_and_never_converts_hmac_to_content_hash():
    class Restricted(dict):
        def __getitem__(self, key):
            assert key not in {"design", "brief", "payload_hash", "ciphertext", "iv", "key_id", "base_url"}
            return super().__getitem__(key)

        def __iter__(self):
            raise AssertionError("must not copy the full source record")

    row = Restricted(metadata(payload_hash="a" * 64, design={"private": "synthetic-raw-marker"},
                              ciphertext=b"synthetic-only", brief="synthetic brief"))
    result = proposal_usage_record(row)
    assert set(result) == {"id", "provider", "model", "purpose", "status", "requestedAt", "finishedAt", "inputHash", "outputHash", "usage"}
    assert result["inputHash"] is None and "synthetic-raw-marker" not in json.dumps(result)


@pytest.mark.parametrize("revision", [None, 0, 2, True])
def test_historical_revision_mismatch_does_not_read_current_model_metadata(revision):
    class Historical(dict):
        def __getitem__(self, key):
            assert key not in {"provider", "model"}, "current config is not historical provenance"
            return super().__getitem__(key)

    result = proposal_usage_record(Historical(metadata(current_service_revision=revision)))
    assert result["provider"] is None and result["model"] is None


def test_actual_timestamp_zone_is_converted_and_missing_timezone_is_not_invented():
    result = proposal_usage_record(metadata(dispatched_at=datetime(2026, 10, 17, 16, 0, 1, 234567,
        tzinfo=timezone(timedelta(hours=8))), finished_at=datetime(2026, 10, 17, 8, 0, 3, tzinfo=timezone.utc)))
    assert result["requestedAt"] == "2026-10-17T08:00:01.234Z"
    assert result["finishedAt"] == "2026-10-17T08:00:03.000Z"
    assert proposal_usage_record(metadata(dispatched_at=datetime(2026, 10, 17, 8)))['requestedAt'] is None
    for provider in ("deepseek", "qwen"):
        assert proposal_usage_record(metadata(provider=provider))["provider"] == provider
    assert proposal_usage_record(metadata(model="sk-synthetic-private"))["model"] is None


def browser_ledger(value):
    platform = Path(__file__).resolve().parents[2] / 'frontend'
    script = "import {parseAiUsageLedger} from './lib/evidence-appendices.ts';let raw='';for await(const c of process.stdin)raw+=c;const x=JSON.parse(raw);process.stdout.write(JSON.stringify(parseAiUsageLedger(x,x.projectId)));"
    result = subprocess.run(['node', '--experimental-strip-types', '--input-type=module', '-e', script], cwd=platform,
                            input=json.dumps(value), capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_converted_unknown_and_historical_records_roundtrip_through_browser_validator():
    value = {"schema": "AiUsageLedger/v1", "coverage": "partial", "projectId": str(uuid4()), "scope": SCOPE,
             "records": [proposal_usage_record(metadata()), proposal_usage_record(metadata(current_service_revision=2))]}
    assert browser_ledger(value) == value


def seed(pg_engine, user_id, project_id, service_id, *, count=1, status="ready", service_revision=1, start=None):
    start = start or datetime(2026, 10, 17, 8, 0, tzinfo=timezone.utc)
    rows = [{"id": str(uuid4()), "user_id": user_id, "project_id": project_id, "service_id": service_id,
             "service_revision": service_revision, "input_revision": 0, "idempotency_key": str(uuid4()),
             "payload_hash": "a" * 64, "status": status, "design": {"private": "SYNTHETIC_RAW_DESIGN_DO_NOT_EXPORT"},
             "created_at": start + timedelta(seconds=i), "dispatched_at": start + timedelta(seconds=i),
             "finished_at": None if status == "outcome_unknown" else start + timedelta(seconds=i, milliseconds=200)}
            for i in range(count)]
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": user_id})
        connection.execute(Proposal.__table__.insert(), rows)
    return rows


@pytest.mark.postgres
def test_route_personal_project_scope_order_cap_no_secret_projection_and_revocation(harness, pg_engine):
    app, login, _, _ = harness
    owner, owner_session = login()
    member, member_session = login("b@example.test")
    p, team = project(owner)
    other, _ = project(owner)
    path = f'/api/projects/{p["id"]}/report/ai-usage'
    with TestClient(app) as guest:
        assert guest.get(path).status_code == 401
    assert member.get(path).status_code == 404
    assert owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "editor"}).status_code == 201
    own_service = owner.post('/api/services', json=service_input()).json()
    member_service = member.post('/api/services', json=service_input()).json()
    own = seed(pg_engine, owner_session['user']['id'], p['id'], own_service['id'], count=201)
    foreign = seed(pg_engine, member_session['user']['id'], p['id'], member_service['id'], status='outcome_unknown')
    cross_project = seed(pg_engine, owner_session['user']['id'], other['id'], own_service['id'])
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _many):
        if re.search(r'\bFROM proposals\b', statement):
            statements.append(statement)

    event.listen(pg_engine, 'before_cursor_execute', capture)
    try:
        response = owner.get(path)
    finally:
        event.remove(pg_engine, 'before_cursor_execute', capture)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['schema'] == 'AiUsageLedger/v1' and payload['coverage'] == 'partial' and payload['scope'] == SCOPE
    assert payload['projectId'] == p['id'] and len(payload['records']) == 200
    assert browser_ledger(payload) == payload
    assert [r['id'] for r in payload['records']] == [r['id'] for r in reversed(own[1:])]
    assert all(r['id'] not in {foreign[0]['id'], cross_project[0]['id']} for r in payload['records'])
    assert all(r['inputHash'] is None and r['outputHash'] is None and r['usage']['cost'] is None for r in payload['records'])
    assert response.headers['cache-control'] == 'no-store' and 'Cookie' in response.headers.get('vary', '')
    assert statements
    for statement in statements:
        projection = re.split(r'\bFROM\b', statement, maxsplit=1)[0]
        assert not re.search(r'\b(?:design|brief|payload_hash|ciphertext|iv|key_id|base_url|capabilities)\b', projection)
    assert not re.search(r'SYNTHETIC_RAW|synthetic-private-model-key|payload_hash|ciphertext|idempotency', response.text)
    member_result = member.get(path)
    assert member_result.status_code == 200 and [r['id'] for r in member_result.json()['records']] == [foreign[0]['id']]
    assert member_result.json()['records'][0]['status'] == 'unknown'
    assert member_result.json()['records'][0]['finishedAt'] is None
    # Role changes preserve read access; team removal invalidates access on the next request.
    assert owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "viewer"}).status_code == 201
    assert member.get(path).status_code == 200
    assert owner.delete(f'/api/teams/{team}/members/{member_session["user"]["id"]}').status_code == 204
    assert member.get(path).status_code == 404
    assert member.get(f'/api/projects/{other["id"]}/report/ai-usage').status_code == 404
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": member_session['user']['id']})
        visible_ids = set(connection.scalars(select(Proposal.id)).all())
        assert not visible_ids.intersection(r['id'] for r in own)


@pytest.mark.postgres
def test_route_old_service_revision_deleted_metadata_and_empty_coverage(harness, pg_engine):
    _, login, _, _ = harness
    owner, session = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/report/ai-usage'
    empty = owner.get(path)
    assert empty.status_code == 200 and empty.json()['records'] == []
    assert empty.json()['coverage'] == 'partial' and empty.json()['scope'] == SCOPE
    service = owner.post('/api/services', json=service_input()).json()
    rows = seed(pg_engine, session['user']['id'], p['id'], service['id'], status='outcome_unknown')
    initial = owner.get(path).json()['records'][0]
    assert initial['id'] == rows[0]['id'] and initial['provider'] == 'openai' and initial['model'] == 'fixture-model'
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": session['user']['id']})
        connection.execute(update(Service).where(Service.id == service['id']).values(revision=2, provider='qwen', model='new-current-model'))
    historical = owner.get(path).json()['records'][0]
    assert historical['provider'] is None and historical['model'] is None
    assert historical['status'] == 'unknown' and historical['requestedAt'] == initial['requestedAt']
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": session['user']['id']})
        connection.execute(update(Service).where(Service.id == service['id']).values(revision=1, deleted=True))
    deleted = owner.get(path).json()['records'][0]
    assert deleted['provider'] is None and deleted['model'] is None
