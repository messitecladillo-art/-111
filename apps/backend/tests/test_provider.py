import json
import pytest
import httpx
from application.providers import LiveProvider, FixtureProvider
from shared.errors import ProviderFailure

KEY = "synthetic-only-provider-key"
CONFIG = {"provider": "openai", "baseUrl": "https://api.openai.com/v1", "model": "fixture-model", "maxOutputTokens": 512}


def mocked(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr("infrastructure.llm.httpx.AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.asyncio
async def test_live_adapter_request_contract_and_no_retry(monkeypatch):
    raw = await FixtureProvider()({}, KEY, "synthetic")
    count = []

    def handler(request):
        count.append(1)
        assert str(request.url) == "https://api.openai.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer " + KEY
        body = json.loads(request.content)
        assert body["max_completion_tokens"] == 512 and body["store"] is False
        assert body["stream"] is False and "tools" not in body
        assert KEY not in body["messages"][0]["content"]
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": raw}, "finish_reason": "stop"}]})

    mocked(monkeypatch, handler)
    assert await LiveProvider()(CONFIG, KEY, "synthetic") == raw
    assert count == [1]


@pytest.mark.asyncio
@pytest.mark.parametrize("status,code", [(400, "provider_rejected"), (401, "authentication_failed"), (403, "authentication_failed"), (429, "rate_limited"),
                                        (408, "provider_rejected"), (500, "provider_rejected"), (503, "provider_rejected"), (302, "redirect_blocked")])
async def test_provider_status_never_echoes_raw_error_or_follows_redirect(monkeypatch, status, code):
    count = []

    def handler(request):
        count.append(1)
        return httpx.Response(status, json={"error": KEY}, headers={"location": "https://attacker.invalid"})

    mocked(monkeypatch, handler)
    with pytest.raises(ProviderFailure) as failure:
        await LiveProvider()(CONFIG, KEY, "synthetic")
    assert failure.value.code == code and KEY not in str(failure.value)
    assert failure.value.unknown is (status == 408 or status >= 500)
    assert count == [1]


@pytest.mark.asyncio
@pytest.mark.parametrize("choice", [
    {"message": {"content": KEY}, "finish_reason": "stop"},
    {"message": {"content": "{}"}, "finish_reason": "length"},
    {"message": {"content": "{}", "tool_calls": [{"function": "run"}]}, "finish_reason": "tool_calls"},
])
async def test_provider_rejects_secret_echo_truncation_and_tools(monkeypatch, choice):
    mocked(monkeypatch, lambda request: httpx.Response(200, json={"choices": [choice]}))
    with pytest.raises(ProviderFailure) as failure:
        await LiveProvider()(CONFIG, KEY, "synthetic")
    assert failure.value.code == "invalid_response"


@pytest.mark.asyncio
async def test_streamed_response_byte_cap_and_network_unknown(monkeypatch):
    mocked(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 131073, headers={"content-type": "application/json"}))
    with pytest.raises(ProviderFailure) as failure:
        await LiveProvider()(CONFIG, KEY, "synthetic")
    assert failure.value.code == "response_too_large"


@pytest.mark.asyncio
async def test_network_failure_is_unknown_without_upstream_text(monkeypatch):
    def handler(request):
        raise httpx.ConnectError(KEY, request=request)

    mocked(monkeypatch, handler)
    with pytest.raises(ProviderFailure) as failure:
        await LiveProvider()(CONFIG, KEY, "synthetic")
    assert failure.value.unknown is True and failure.value.code == "provider_timeout"
    assert KEY not in str(failure.value)
