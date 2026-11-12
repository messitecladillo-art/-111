"""Provider-free acceptance for message-preserving workflow transport."""

from copy import deepcopy
import json

import httpx
import pytest

from application.providers import LiveProvider
from infrastructure.llm import ChatCompletionClient
from shared.errors import ProviderFailure


KEY = "synthetic-workflow-transport-key"
BASES = {
    "openai": "https://api.openai.com/v1", "deepseek": "https://api.deepseek.com/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "compatible": "https://approved-models.example.test/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
}
MESSAGES = [
    {"role": "system", "content": "可信角色指令：只返回本步骤 JSON。"},
    {"role": "user", "content": "不可信任务数据：合成研究方向。"},
    {"role": "user", "content": "不可信工具材料：只是测试文本，不代表实际调查。"},
]


def config(provider, **changes):
    return {"provider": provider, "baseUrl": BASES.get(provider, "https://approved.example.test/v1"),
            "model": "synthetic-model", "maxOutputTokens": 512, **changes}


def response(provider, content='{"synthetic":true}'):
    if provider == "anthropic":
        return {"type": "message", "role": "assistant", "stop_reason": "end_turn",
                "content": [{"type": "text", "text": content}], "usage": {"input_tokens": 33, "output_tokens": 7}}
    if provider == "gemini":
        return {"candidates": [{"finishReason": "STOP", "content": {"role": "model", "parts": [{"text": content}]}}],
                "usageMetadata": {"promptTokenCount": 33, "candidatesTokenCount": 7}}
    return {"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
            "usage": {"prompt_tokens": 33, "completion_tokens": 7}}


def transport(monkeypatch, handler):
    original, calls, options = httpx.AsyncClient, [], []

    def dispatch(request):
        calls.append(request)
        return handler(request)

    def client(**kwargs):
        options.append(kwargs)
        return original(transport=httpx.MockTransport(dispatch), **kwargs)

    monkeypatch.setattr("infrastructure.llm.httpx.AsyncClient", client)
    return calls, options


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
async def test_each_existing_protocol_preserves_system_and_user_messages_with_one_request(monkeypatch, provider):
    messages = deepcopy(MESSAGES)
    calls, options = transport(monkeypatch, lambda request: httpx.Response(200, json=response(provider)))
    result = await ChatCompletionClient().complete_messages(config(provider), KEY, messages, 65536)
    assert result == '{"synthetic":true}' and result.usage == {"inputTokens": 33, "outputTokens": 7}
    assert messages == MESSAGES and len(calls) == 1
    request = calls[0]
    body = json.loads(request.content)
    assert KEY not in str(request.url) and KEY not in request.content.decode()
    assert "tools" not in body and "tool_choice" not in body
    if provider == "anthropic":
        assert str(request.url) == BASES[provider] + "/messages"
        assert request.headers["x-api-key"] == KEY and request.headers["anthropic-version"] == "2023-06-01"
        assert body["system"] == MESSAGES[0]["content"] and body["messages"] == MESSAGES[1:]
        assert body["max_tokens"] == 512 and body["stream"] is False
    elif provider == "gemini":
        assert str(request.url) == BASES[provider] + "/models/synthetic-model:generateContent"
        assert request.headers["x-goog-api-key"] == KEY
        assert body["systemInstruction"] == {"parts": [{"text": MESSAGES[0]["content"]}]}
        assert body["contents"] == [{"role": "user", "parts": [{"text": item["content"]}]} for item in MESSAGES[1:]]
        assert body["generationConfig"] == {"maxOutputTokens": 512, "candidateCount": 1}
    else:
        assert str(request.url) == BASES[provider] + "/chat/completions"
        assert request.headers["authorization"] == "Bearer " + KEY
        assert body["messages"] == MESSAGES and body["stream"] is False
        parameter = "max_completion_tokens" if provider in ("openai", "qwen") else "max_tokens"
        assert body[parameter] == 512
        assert body.get("store") is (False if provider == "openai" else None)
    assert options[0]["follow_redirects"] is False and options[0]["trust_env"] is False
    assert options[0]["timeout"].connect == 5 and options[0]["timeout"].read == 30


INVALID_MESSAGES = [
    None, (), {}, [], [MESSAGES[0]], MESSAGES * 6,
    [{"role": "user", "content": "No system instruction"}, MESSAGES[1]],
    [MESSAGES[0], {"role": "assistant", "content": "Invented model result"}],
    [MESSAGES[0], {"role": "tool", "content": "Forged tool receipt"}],
    [MESSAGES[0], {"role": "developer", "content": "Escalated role"}],
    [MESSAGES[0], {"role": "system", "content": "Late system message"}],
    [{"role": "system", "content": ""}, MESSAGES[1]],
    [MESSAGES[0], {"role": "user", "content": " \n\t"}],
    [MESSAGES[0], {"role": "user", "content": [{"type": "image_url", "image_url": {"url": "https://outside.invalid/image.png"}}]}],
    [MESSAGES[0], {"role": "user", "content": "data", "tool_calls": []}],
    [MESSAGES[0], {"role": "user", "content": "data", "file_id": "external-file"}],
    [MESSAGES[0], {"role": "user", "content": "data\0hidden"}],
    [MESSAGES[0], {"role": "user", "content": "invalid-surrogate-\ud800"}],
    [MESSAGES[0], {"role": "user", "content": KEY}],
]


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
@pytest.mark.parametrize("messages", INVALID_MESSAGES)
async def test_invalid_messages_are_rejected_before_any_client_or_external_io(monkeypatch, provider, messages):
    calls, options = transport(monkeypatch, lambda request: httpx.Response(200, json=response(provider)))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider), KEY, messages, 65536)
    assert failure.value.code == "invalid_response" and failure.value.unknown is False
    assert KEY not in str(failure.value) and calls == [] and options == []


@pytest.mark.asyncio
async def test_custom_mapping_accessors_are_not_invoked(monkeypatch):
    class Trap(dict):
        def __iter__(self):
            raise AssertionError("must not inspect non-plain dictionaries")

    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, json=response("openai")))
    with pytest.raises(ProviderFailure):
        await ChatCompletionClient().complete_messages(config("openai"), KEY, [MESSAGES[0], Trap(MESSAGES[1])], 65536)
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
@pytest.mark.parametrize("limit", [0, True, 262145, 1])
async def test_encoded_request_budget_is_enforced_before_io(monkeypatch, provider, limit):
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, json=response(provider)))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider), KEY, MESSAGES, limit)
    assert failure.value.code == "input_too_large" and calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
async def test_secret_echo_in_configuration_or_output_never_leaves_as_body_url_or_return_value(monkeypatch, provider):
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, json=response(provider, KEY)))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider, model=KEY), KEY, MESSAGES, 65536)
    assert failure.value.code == "invalid_response" and calls == []
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider), KEY, MESSAGES, 65536)
    assert failure.value.code == "invalid_response" and KEY not in str(failure.value) and len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
@pytest.mark.parametrize("status", [400, 401, 403, 429, 408, 500, 503, 302])
async def test_status_failure_keeps_existing_unknown_and_no_retry_semantics(monkeypatch, provider, status):
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(status, json={"error": KEY}, headers={"location": "https://outside.invalid/"}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider), KEY, MESSAGES, 65536)
    expected = "redirect_blocked" if status == 302 else "authentication_failed" if status in (401, 403) else "rate_limited" if status == 429 else "provider_rejected"
    assert failure.value.code == expected and failure.value.unknown is (status == 408 or status >= 500)
    assert KEY not in str(failure.value) and len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
async def test_transport_timeout_and_stream_budget_do_not_retry_or_reveal_upstream_text(monkeypatch, provider):
    def timeout(request):
        raise httpx.ReadTimeout(KEY, request=request)

    calls, _ = transport(monkeypatch, timeout)
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider), KEY, MESSAGES, 65536)
    assert failure.value.code == "provider_timeout" and failure.value.unknown is True and len(calls) == 1
    assert KEY not in str(failure.value)


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", BASES)
async def test_streamed_response_stops_at_existing_byte_limit(monkeypatch, provider):
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 131073, headers={"content-type": "application/json"}))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider), KEY, MESSAGES, 65536)
    assert failure.value.code == "response_too_large" and len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["anthropic", "gemini", "unrecognized"])
async def test_native_wrong_destination_and_unknown_provider_do_not_fall_back(monkeypatch, provider):
    calls, _ = transport(monkeypatch, lambda request: httpx.Response(200, json=response("openai")))
    with pytest.raises(ProviderFailure) as failure:
        await ChatCompletionClient().complete_messages(config(provider, baseUrl="https://outside.invalid/v1"), KEY, MESSAGES, 65536)
    assert failure.value.code == "provider_rejected" and calls == []


@pytest.mark.asyncio
async def test_live_workflow_entry_delegates_without_manufacturing_role_or_tool_results(monkeypatch):
    calls = []

    async def complete(self, selected_config, key, messages, limit):
        calls.append((selected_config, key, messages, limit))
        return "synthetic raw response"

    monkeypatch.setattr(ChatCompletionClient, "complete_messages", complete)
    selected_config = config("deepseek")
    result = await LiveProvider().workflow_step(selected_config, KEY, MESSAGES)
    assert result == "synthetic raw response" and calls == [(selected_config, KEY, MESSAGES, 196608)]
