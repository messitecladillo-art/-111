"""Unknown provider receipts must remain distinguishable from known failures."""
import pytest

from shared.errors import ProviderFailure
from tests.test_silicon import entered, payload, project, service_input, wait


@pytest.mark.postgres
@pytest.mark.parametrize("unknown", [True, False])
def test_mixed_silicon_receipts_prioritize_unknown_and_idempotency_never_replays(entered, unknown):
    _, open_client, provider = entered
    client, _ = open_client(); p = project(client)
    service = client.post("/api/services", json=service_input()).json()
    original, dispatched = provider.answer, 0

    async def mixed(*args):
        nonlocal dispatched
        dispatched += 1
        if dispatched == 2:
            raise ProviderFailure("provider_timeout" if unknown else "rate_limited", unknown=unknown)
        return await original(*args)

    provider.answer = mixed
    data = payload(services=[{"serviceId": service["id"], "serviceRevision": 1}], scenarios=[], expectedCalls=3)
    path = f'/api/projects/{p["id"]}/silicon-runs'
    response = client.post(path, json=data)
    assert response.status_code == 202, response.text
    receipt = wait(client, path + "/" + response.json()["id"])
    assert receipt["status"] == ("outcome_unknown" if unknown else "ready")
    assert receipt["errorCode"] == ("unreconciled_calls" if unknown else "rate_limited")
    assert any(item["status"] == "ok" for item in receipt["responses"])
    error = next(item for item in receipt["responses"] if item["status"] != "ok")
    assert error["status"] == ("outcome_unknown" if unknown else "failed")
    assert error["error"] == ("provider_timeout" if unknown else "rate_limited")
    assert client.post(path, json=data).json()["id"] == receipt["id"]
    assert dispatched == 3


@pytest.mark.postgres
@pytest.mark.parametrize("failure", [ProviderFailure("provider_rejected", unknown=True), RuntimeError("synthetic interrupted receipt"), ProviderFailure("authentication_failed")])
def test_all_failed_or_uncertain_silicon_units_keep_correct_run_status(entered, failure):
    _, open_client, provider = entered
    client, _ = open_client(); p = project(client)
    service = client.post("/api/services", json=service_input()).json()

    async def failed(*args):
        raise failure

    provider.answer = failed
    sample = payload()
    data = payload(services=[{"serviceId": service["id"], "serviceRevision": 1}], personas=sample["personas"][:1], scenarios=[], expectedCalls=1)
    path = f'/api/projects/{p["id"]}/silicon-runs'
    response = client.post(path, json=data)
    assert response.status_code == 202, response.text
    receipt = wait(client, path + "/" + response.json()["id"])
    unknown = not isinstance(failure, ProviderFailure) or failure.unknown
    assert receipt["status"] == ("outcome_unknown" if unknown else "failed")
    assert receipt["responses"][0]["status"] == ("outcome_unknown" if unknown else "failed")
    assert receipt["responses"][0]["answers"] == []
    assert receipt["errorCode"] == ("unreconciled_calls" if unknown else "authentication_failed")
