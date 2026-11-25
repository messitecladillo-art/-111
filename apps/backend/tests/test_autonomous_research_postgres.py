"""Authenticated HTTP + PostgreSQL persistence tests for autonomous research runs."""

from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient

from application.providers import AuthoredProvider
from evix_api.app import create_app
from tests.test_postgres import project

pytestmark = pytest.mark.postgres


def test_autonomous_runs_http_auth_csrf_idempotency_and_persistence(settings, pg_engine, tmp_path, monkeypatch):
    monkeypatch.setenv("EVIXLOCAL_AUTHORED_SLEEP", "0")
    deliveries = {}

    async def mail(cid, email, code):
        deliveries[cid] = code

    app = create_app(settings, engine=pg_engine, provider=AuthoredProvider(tmp_path), mail=mail)
    with TestClient(app) as client:
        client.headers["origin"] = settings.allowed_origins[0]
        challenge = client.post("/api/auth/code", json={"email": "a@example.test"}).json()
        identity = client.post(
            "/api/auth/verify",
            json={"challengeId": challenge["challengeId"], "code": deliveries[challenge["challengeId"]]},
        ).json()
        client.headers["x-csrf-token"] = identity["csrfToken"]

        proj, _team = project(client)
        idem = "11111111-1111-4111-8111-111111111199"
        body = {
            "idempotencyKey": idem,
            "goal": "县域养老智慧助餐采纳机制实证自主探索",
            "geography": "县域",
            "datasetMode": "planted_trap_benchmark",
            "leaseMode": "pi_autonomous",
            "maxToolCalls": 28,
        }
        r1 = client.post(f"/api/projects/{proj['id']}/autonomous-runs", json=body)
        assert r1.status_code == 201, r1.text
        v1 = r1.json()
        assert v1["status"] == "completed"
        assert v1["datasetSummary"]["cleanedRowCount"] == 226
        assert v1["epistemicGraph"]["completeness"]["passed"] is True

        # Idempotent replay returns same runId
        r2 = client.post(f"/api/projects/{proj['id']}/autonomous-runs", json=body)
        assert r2.status_code == 201
        assert r2.json()["runId"] == v1["runId"]

        # GET list and GET detail succeed
        lst = client.get(f"/api/projects/{proj['id']}/autonomous-runs")
        assert lst.status_code == 200 and lst.json()["runs"][0]["runId"] == v1["runId"]
        detail = client.get(f"/api/projects/{proj['id']}/autonomous-runs/{v1['runId']}")
        assert detail.status_code == 200 and detail.json()["runId"] == v1["runId"]

        # Zero secret or open-text leakage
        assert "受访者保密建议" not in json.dumps(v1, ensure_ascii=False)
