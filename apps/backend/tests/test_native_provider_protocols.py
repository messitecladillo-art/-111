"""Synthetic native-protocol acceptance: no vendor keys, live traffic or SDK retries."""
import copy
import json

import httpx
import pytest

from infrastructure.llm import ChatCompletionClient
from shared.errors import ProviderFailure


KEY = "synthetic-native-transport-key"
BASES = {"openai": "https://api.openai.com/v1", "deepseek": "https://api.deepseek.com/v1",
         "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1", "compatible": "https://approved-models.example.test/v1",
         "anthropic": "https://api.anthropic.com/v1", "gemini": "https://generativelanguage.googleapis.com/v1beta"}
ANTHROPIC = {"type": "message", "role": "assistant", "content": [{"type": "text", "text": '{"reply":"合成结果"}'}], "stop_reason": "end_turn"}
GEMINI = {"candidates": [{"content": {"role": "model", "parts": [{"text": '{"reply":"合成结果"}'}]}, "finishReason": "STOP"}]}


def config(provider, **changes):
    return {"provider": provider, "baseUrl": BASES.get(provider, "https://api.openai.com/v1"), "model": "synthetic-model", "maxOutputTokens": 512, **changes}


def transport(monkeypatch, handler):
    original = httpx.AsyncClient
    options = []

    def client(**kwargs):
        options.append(kwargs)
        return original(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr("infrastructure.llm.httpx.AsyncClient", client)
    return options


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
async def test_native_request_contract_and_one_dispatch(monkeypatch, provider):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=ANTHROPIC if provider == "anthropic" else GEMINI)

    options = transport(monkeypatch, handler)
    result = await ChatCompletionClient().complete(config(provider), KEY, "合成研究问题", 65536)
    assert result == '{"reply":"合成结果"}' and len(calls) == 1
    request = calls[0]
    assert request.method == "POST" and not request.url.query
    assert KEY not in str(request.url) and KEY not in request.content.decode()
    assert "authorization" not in request.headers
    if provider == "anthropic":
        assert str(request.url) == "https://api.anthropic.com/v1/messages"
        assert request.headers["x-api-key"] == KEY and request.headers["anthropic-version"] == "2023-06-01"
        assert json.loads(request.content) == {"model": "synthetic-model", "max_tokens": 512, "messages": [{"role": "user", "content": "合成研究问题"}], "stream": False}
    else:
        assert str(request.url) == "https://generativelanguage.googleapis.com/v1beta/models/synthetic-model:generateContent"
        assert request.headers["x-goog-api-key"] == KEY and "x-api-key" not in request.headers
        assert json.loads(request.content) == {"contents": [{"role": "user", "parts": [{"text": "合成研究问题"}]}], "generationConfig": {"maxOutputTokens": 512, "candidateCount": 1}}
    assert options[0]["follow_redirects"] is False and options[0]["trust_env"] is False
    assert options[0]["timeout"].connect == 5 and options[0]["timeout"].read == 30


@pytest.mark.asyncio
@pytest.mark.parametrize("provider,body", [
    ("anthropic", {**ANTHROPIC, "stop_reason": "stop_sequence", "content": [{"type": "thinking", "thinking": "hidden-synthetic-thought", "signature": "synthetic-signature"}, {"type": "text", "text": "甲"}, {"type": "redacted_thinking", "data": "redacted"}, {"type": "text", "text": "乙"}]}),
    ("gemini", {"candidates": [{"finishReason": "STOP", "content": {"role": "model", "parts": [{"text": "hidden-synthetic-thought", "thought": True}, {"text": "甲", "thought": False}, {"text": "乙", "thoughtSignature": "synthetic-signature"}]}}]}),
])
async def test_native_visible_text_only_never_thoughts_or_signatures(monkeypatch, provider, body):
    transport(monkeypatch, lambda request: httpx.Response(200, json=body))
    assert await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536) == "甲乙"


ANTHROPIC_INVALID = [
    {}, [], {**ANTHROPIC, "type": "error"}, {**ANTHROPIC, "role": "user"},
    *[{**ANTHROPIC, "stop_reason": reason} for reason in [None, "max_tokens", "tool_use", "pause_turn", "refusal", "model_context_window_exceeded", "future_reason"]],
    {**ANTHROPIC, "stop_details": {"type": "refusal", "explanation": "synthetic-refusal"}},
    *[{**ANTHROPIC, "content": blocks} for blocks in [None, [], [None], [{"type": "text"}], [{"type": "text", "text": 42}], [{"type": "text", "text": "  "}], [{"type": "thinking", "thinking": "only-hidden"}], [{"type": "tool_use", "name": "run", "input": {}}], [{"type": "refusal", "text": "synthetic-refusal"}], [{"type": "text", "text": "safe"}, {"type": "tool_use", "name": "run", "input": {}}], [{"type": "text", "text": KEY}]]],
]


@pytest.mark.asyncio
@pytest.mark.parametrize("body", ANTHROPIC_INVALID)
async def test_anthropic_rejects_unsupported_stops_tools_refusals_and_shapes(monkeypatch, body):
    transport(monkeypatch, lambda request: httpx.Response(200, json=body))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config("anthropic"), KEY, "synthetic", 65536)
    assert failure.value.code == "invalid_response" and KEY not in str(failure.value)


def gemini_with(**patch):
    body = copy.deepcopy(GEMINI)
    body["candidates"][0].update(patch)
    return body


GEMINI_INVALID = [
    {}, [], {"candidates": []}, {"candidates": [GEMINI["candidates"][0]] * 2}, {"candidates": [None]},
    *[gemini_with(finishReason=reason) for reason in [None, "MAX_TOKENS", "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "OTHER", "future_reason"]],
    {**GEMINI, "promptFeedback": {"blockReason": "SAFETY"}},
    {**GEMINI, "promptFeedback": {"blockReason": "future_reason"}},
    gemini_with(safetyRatings=[{"category": "HARM_CATEGORY_HATE_SPEECH", "probability": "HIGH", "blocked": True}]),
    *[gemini_with(content=content) for content in [None, {}, {"role": "user", "parts": [{"text": "safe"}]}, {"parts": []}, {"parts": [None]}, {"parts": [{"text": 42}]}, {"parts": [{"text": "  "}]}, {"parts": [{"text": "only-hidden", "thought": True}]}, {"parts": [{"functionCall": {"name": "run", "args": {}}}]}, {"parts": [{"inlineData": {"mimeType": "image/png", "data": "synthetic"}}]}, {"parts": [{"text": "safe", "functionCall": {"name": "run"}}]}, {"parts": [{"text": "safe", "thought": "true"}]}, {"parts": [{"text": KEY}]}]],
]


@pytest.mark.asyncio
@pytest.mark.parametrize("body", GEMINI_INVALID)
async def test_gemini_rejects_blocked_truncated_tool_multimodal_and_invalid_shapes(monkeypatch, body):
    transport(monkeypatch, lambda request: httpx.Response(200, json=body))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config("gemini"), KEY, "synthetic", 65536)
    assert failure.value.code == "invalid_response" and KEY not in str(failure.value)


@pytest.mark.asyncio
@pytest.mark.parametrize("model", ["", ".", "..", "models/gemini-test", "gemini/../models", "gemini/other", "gemini:generateContent", "gemini?key=synthetic", "gemini#fragment", "gemini%2froute", "gemini\\route", "gemini\nheader"])
async def test_gemini_rejects_model_path_injection_before_transport(monkeypatch, model):
    calls = []
    transport(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json=GEMINI))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config("gemini", model=model), KEY, "synthetic", 65536)
    assert failure.value.code == "provider_rejected" and not calls


@pytest.mark.asyncio
async def test_unknown_provider_never_falls_back_to_chat_completions(monkeypatch):
    calls = []
    transport(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json={"choices": [{"message": {"content": "safe"}, "finish_reason": "stop"}]}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config("unknown-vendor"), KEY, "synthetic", 65536)
    assert failure.value.code == "provider_rejected" and not calls


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
@pytest.mark.parametrize("status,code", [(302, "redirect_blocked"), (400, "provider_rejected"), (401, "authentication_failed"), (403, "authentication_failed"), (408, "provider_rejected"), (429, "rate_limited"), (500, "provider_rejected"), (503, "provider_rejected")])
async def test_native_status_errors_are_sanitized_no_retry_and_unknown_preserved(monkeypatch, provider, status, code):
    calls = []
    transport(monkeypatch, lambda request: calls.append(request) or httpx.Response(status, json={"error": KEY}, headers={"location": "https://attacker.invalid/"}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536)
    assert failure.value.code == code and failure.value.unknown is (status == 408 or status >= 500)
    assert KEY not in str(failure.value) and len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
async def test_native_utf8_input_cap_prevents_dispatch(monkeypatch, provider):
    calls = []
    transport(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json=ANTHROPIC if provider == "anthropic" else GEMINI))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider), KEY, "汉" * 100, 256)
    assert failure.value.code == "input_too_large" and not calls


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
async def test_native_response_byte_cap_and_network_unknown(monkeypatch, provider):
    transport(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 131073, headers={"content-type": "application/json"}))
    with pytest.raises(ProviderFailure) as oversized:
        await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536)
    assert oversized.value.code == "response_too_large"


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
async def test_native_transport_timeout_never_retries_or_echoes_error(monkeypatch, provider):
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout(KEY, request=request)

    transport(monkeypatch, handler)
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536)
    assert failure.value.code == "provider_timeout" and failure.value.unknown is True
    assert KEY not in str(failure.value) and len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("provider,body", [("anthropic", ANTHROPIC), ("gemini", GEMINI)])
async def test_native_mixed_error_and_success_envelope_is_not_adopted(monkeypatch, provider, body):
    transport(monkeypatch, lambda request: httpx.Response(200, json={**body, "error": {"message": KEY}}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536)
    assert failure.value.code == "invalid_response" and KEY not in str(failure.value)


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
async def test_native_wrong_base_is_rejected_before_a_key_can_leave(monkeypatch, provider):
    calls = []
    transport(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json=ANTHROPIC if provider == "anthropic" else GEMINI))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider, baseUrl="https://attacker.invalid/v1"), KEY, "synthetic", 65536)
    assert failure.value.code == "provider_rejected" and not calls


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
@pytest.mark.parametrize("raw,content_type", [(b"not-json", "application/json"), (b'{"candidates":[],"candidates":[]}', "application/json"), (b"{}", "text/plain")])
async def test_native_malformed_duplicate_json_or_non_json_content_is_rejected(monkeypatch, provider, raw, content_type):
    transport(monkeypatch, lambda request: httpx.Response(200, content=raw, headers={"content-type": content_type}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536)
    assert failure.value.code == "invalid_response"


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini"])
async def test_native_stream_cap_stops_reading_after_limit(monkeypatch, provider):
    chunks = []

    class Body(httpx.AsyncByteStream):
        async def __aiter__(self):
            chunks.append(1)
            yield b"x" * 131072
            chunks.append(2)
            yield b"x"
            chunks.append(3)
            yield b"must-not-read"

    transport(monkeypatch, lambda request: httpx.Response(200, stream=Body(), headers={"content-type": "application/json"}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config(provider), KEY, "synthetic", 65536)
    assert failure.value.code == "response_too_large" and chunks == [1, 2]


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["openai", "deepseek", "qwen", "compatible"])
async def test_existing_compatible_request_contracts_keep_slash_model_ids(monkeypatch, provider):
    calls = []
    transport(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "safe"}, "finish_reason": "stop"}]}))
    assert await ChatCompletionClient().complete(config(provider, model="vendor/model-name"), KEY, "synthetic", 65536) == "safe"
    payload = json.loads(calls[0].content)
    assert payload["model"] == "vendor/model-name" and payload["stream"] is False
    assert payload["max_completion_tokens" if provider in ("openai", "qwen") else "max_tokens"] == 512
    assert (payload.get("store") is False) is (provider == "openai")
    assert str(calls[0].url) == BASES[provider] + "/chat/completions"
    assert calls[0].headers["authorization"] == "Bearer " + KEY


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", [None, "content_filter", "length", "tool_calls", "function_call", "future_reason"])
async def test_compatible_completion_rejects_nonterminal_or_blocked_reasons(monkeypatch, reason):
    transport(monkeypatch, lambda request: httpx.Response(200, json={"choices": [{"message": {"content": "partial-or-blocked"}, "finish_reason": reason}]}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete(config("openai"), KEY, "synthetic", 65536)
    assert failure.value.code == "invalid_response"
