"""Token counts as each provider reports them, carried with the model's text; synthetic responses only."""
import json
import pytest
import httpx
from application.providers import LiveProvider
from infrastructure.llm import Completion, _response_usage
from tests.test_provider import KEY, mocked


def test_each_provider_reports_its_counts_in_its_own_shape():
    assert _response_usage("deepseek", {"usage": {"prompt_tokens": 1200, "completion_tokens": 340, "prompt_cache_hit_tokens": 800}}) == {"inputTokens": 1200, "outputTokens": 340}
    assert _response_usage("anthropic", {"usage": {"input_tokens": 50, "output_tokens": 7}}) == {"inputTokens": 50, "outputTokens": 7}
    assert _response_usage("gemini", {"usageMetadata": {"promptTokenCount": 9, "candidatesTokenCount": 3}}) == {"inputTokens": 9, "outputTokens": 3}


@pytest.mark.parametrize("usage", [None, "1200", {}, {"prompt_tokens": 1}, {"prompt_tokens": -1, "completion_tokens": 2},
                                   {"prompt_tokens": 1.5, "completion_tokens": 2}, {"prompt_tokens": True, "completion_tokens": 2},
                                   {"prompt_tokens": 10**8, "completion_tokens": 2}])
def test_counts_that_are_missing_or_implausible_are_not_reported(usage):
    assert _response_usage("openai", {"usage": usage}) is None


@pytest.mark.asyncio
async def test_a_deepseek_answer_carries_its_token_counts(monkeypatch):
    config = {"provider": "deepseek", "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat", "maxOutputTokens": 512}
    reply = json.dumps({"reply": "合成测试回执。", "actions": []}, ensure_ascii=False)

    def handler(request):
        assert str(request.url) == "https://api.deepseek.com/v1/chat/completions"
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}],
                                         "usage": {"prompt_tokens": 2048, "completion_tokens": 96}})

    mocked(monkeypatch, handler)
    raw = await LiveProvider().agent_chat(config, KEY, "synthetic")
    assert raw == reply and isinstance(raw, Completion)
    assert raw.usage == {"inputTokens": 2048, "outputTokens": 96}
