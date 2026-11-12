import asyncio
import json
import re
from urllib.parse import quote

import httpx
from shared.contracts import strict_json

from shared.errors import ProviderFailure


_CHAT_PROVIDERS = frozenset(("openai", "deepseek", "qwen", "compatible"))
_WORKFLOW_MAX_MESSAGES = 16
_WORKFLOW_MAX_BYTES = 262144


class Completion(str):
    """A model's text, carrying the token counts its provider reported for the call (None when it reported none)."""
    usage = None


def _response_usage(provider, data):
    """Input and output tokens as the provider billed them; None unless both are plain, plausible counts."""
    if provider == "anthropic":
        names, usage = ("input_tokens", "output_tokens"), data.get("usage")
    elif provider == "gemini":
        names, usage = ("promptTokenCount", "candidatesTokenCount"), data.get("usageMetadata")
    else:
        names, usage = ("prompt_tokens", "completion_tokens"), data.get("usage")
    if not isinstance(usage, dict):
        return None
    counts = [usage.get(name) for name in names]
    if any(type(count) is not int or not 0 <= count <= 10_000_000 for count in counts):
        return None
    return {"inputTokens": counts[0], "outputTokens": counts[1]}


def _request(config, key, message):
    provider = config["provider"]
    headers = {"content-type": "application/json"}
    if provider == "anthropic":
        if config["baseUrl"] != "https://api.anthropic.com/v1":
            raise ProviderFailure("provider_rejected")
        headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
        return config["baseUrl"] + "/messages", headers, {
            "model": config["model"], "max_tokens": config["maxOutputTokens"],
            "messages": [{"role": "user", "content": message}], "stream": False,
        }
    if provider == "gemini":
        model = config["model"]
        # Model IDs are one path segment. Existing compatible providers may still use vendor/model IDs.
        if (config["baseUrl"] != "https://generativelanguage.googleapis.com/v1beta"
                or not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", model)):
            raise ProviderFailure("provider_rejected")
        headers["x-goog-api-key"] = key
        return config["baseUrl"] + "/models/" + quote(model, safe="") + ":generateContent", headers, {
            "contents": [{"role": "user", "parts": [{"text": message}]}],
            "generationConfig": {"maxOutputTokens": config["maxOutputTokens"], "candidateCount": 1},
        }
    if provider not in _CHAT_PROVIDERS:
        raise ProviderFailure("provider_rejected")
    headers["authorization"] = "Bearer " + key
    parameter = "max_completion_tokens" if provider in ("openai", "qwen") else "max_tokens"
    payload = {"model": config["model"], "messages": [{"role": "user", "content": message}], "stream": False,
               parameter: config["maxOutputTokens"]}
    if provider == "openai":
        payload["store"] = False
    return config["baseUrl"] + "/chat/completions", headers, payload


def _workflow_messages(messages, key):
    """A trusted system instruction followed only by bounded plain user data."""
    if (type(key) is not str or not key or type(messages) is not list
            or not 2 <= len(messages) <= _WORKFLOW_MAX_MESSAGES):
        raise ProviderFailure("invalid_response")
    result = []
    for index, item in enumerate(messages):
        if type(item) is not dict or any(type(name) is not str for name in item) or set(item) != {"role", "content"}:
            raise ProviderFailure("invalid_response")
        role, content = item["role"], item["content"]
        if (type(role) is not str or role != ("system" if index == 0 else "user")
                or type(content) is not str or not content.strip() or key in content):
            raise ProviderFailure("invalid_response")
        if len(content) > _WORKFLOW_MAX_BYTES:
            raise ProviderFailure("input_too_large")
        if any(ord(char) < 32 and char not in "\n\r\t" for char in content):
            raise ProviderFailure("invalid_response")
        result.append({"role": role, "content": content})
    return result


def _workflow_request(config, key, messages):
    messages = _workflow_messages(messages, key)
    # Reuse the existing provider, model path and destination checks; never
    # downgrade an unsupported native provider to a compatible endpoint.
    url, headers, payload = _request(config, key, messages[-1]["content"])
    if config["provider"] == "anthropic":
        payload["system"] = messages[0]["content"]
        payload["messages"] = messages[1:]
    elif config["provider"] == "gemini":
        payload["systemInstruction"] = {"parts": [{"text": messages[0]["content"]}]}
        payload["contents"] = [{"role": "user", "parts": [{"text": item["content"]}]} for item in messages[1:]]
    else:
        payload["messages"] = messages
    return url, headers, payload


def _contains_secret(value, key):
    if isinstance(value, str):
        return key in value
    if isinstance(value, dict):
        return any(_contains_secret(name, key) or _contains_secret(item, key) for name, item in value.items())
    if isinstance(value, list):
        return any(_contains_secret(item, key) for item in value)
    return False


def _anthropic_text(data):
    if (data.get("type") != "message" or data.get("role") != "assistant"
            or data.get("stop_reason") not in ("end_turn", "stop_sequence")
            or data.get("stop_details") is not None or not isinstance(data.get("content"), list)):
        raise ProviderFailure("invalid_response")
    text = []
    for block in data["content"]:
        if not isinstance(block, dict):
            raise ProviderFailure("invalid_response")
        if block.get("type") in ("thinking", "redacted_thinking"):
            continue
        if block.get("type") != "text" or not isinstance(block.get("text"), str):
            raise ProviderFailure("invalid_response")
        text.append(block["text"])
    return "".join(text)


def _check_safety(container):
    ratings = container.get("safetyRatings", [])
    if (not isinstance(ratings, list)
            or any(not isinstance(rating, dict) or rating.get("blocked", False) is not False for rating in ratings)):
        raise ProviderFailure("invalid_response")


def _gemini_text(data):
    feedback = data.get("promptFeedback", {})
    if not isinstance(feedback, dict) or feedback.get("blockReason") not in (None, "BLOCK_REASON_UNSPECIFIED"):
        raise ProviderFailure("invalid_response")
    _check_safety(feedback)
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != 1:
        raise ProviderFailure("invalid_response")
    candidate = candidates[0]
    if not isinstance(candidate, dict) or candidate.get("finishReason") != "STOP":
        raise ProviderFailure("invalid_response")
    _check_safety(candidate)
    content = candidate.get("content")
    if not isinstance(content, dict) or content.get("role") not in (None, "model") or not isinstance(content.get("parts"), list):
        raise ProviderFailure("invalid_response")
    text = []
    for part in content["parts"]:
        if (not isinstance(part, dict) or set(part) - {"text", "thought", "thoughtSignature"}
                or not isinstance(part.get("text"), str) or type(part.get("thought", False)) is not bool
                or ("thoughtSignature" in part and not isinstance(part["thoughtSignature"], str))):
            raise ProviderFailure("invalid_response")
        if not part.get("thought", False):
            text.append(part["text"])
    return "".join(text)


def _response_text(provider, data):
    if not isinstance(data, dict) or "error" in data:
        raise ProviderFailure("invalid_response")
    if provider == "anthropic":
        return _anthropic_text(data)
    if provider == "gemini":
        return _gemini_text(data)
    choices = data.get("choices")
    if not isinstance(choices, list) or len(choices) != 1:
        raise ProviderFailure("invalid_response")
    choice = choices[0]
    if not isinstance(choice, dict) or choice.get("finish_reason") != "stop":
        raise ProviderFailure("invalid_response")
    message = choice.get("message")
    if (not isinstance(message, dict) or message.get("role") not in (None, "assistant")
            or message.get("tool_calls") or message.get("function_call") or message.get("refusal")):
        raise ProviderFailure("invalid_response")
    return message.get("content")


class ChatCompletionClient:
    async def complete(self, config, key, message, limit):
        return await self._complete(config, key, message, limit, structured=False)

    async def complete_messages(self, config, key, messages, limit):
        """Preserve system/user separation without enabling tools or remote parts.

        The caller must persist consent and a call receipt before invoking this
        transport. A completion is not a verified research/tool result.
        """
        return await self._complete(config, key, messages, limit, structured=True)

    async def _complete(self, config, key, content, limit, *, structured):
        try:
            if structured:
                if type(limit) is not int or not 1 <= limit <= _WORKFLOW_MAX_BYTES:
                    raise ProviderFailure("input_too_large")
                url, headers, payload = _workflow_request(config, key, content)
                if key in url or _contains_secret(payload, key):
                    raise ProviderFailure("invalid_response")
            else:
                url, headers, payload = _request(config, key, content)
            encoded = json.dumps(payload, ensure_ascii=False).encode()
            if len(encoded) > limit:
                raise ProviderFailure("input_too_large")
            async with asyncio.timeout(30):
                async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=5), follow_redirects=False, trust_env=False) as client:
                    async with client.stream("POST", url, headers=headers, content=encoded) as response:
                        if 300 <= response.status_code < 400:
                            raise ProviderFailure("redirect_blocked")
                        if response.status_code in (401, 403):
                            raise ProviderFailure("authentication_failed")
                        if response.status_code == 429:
                            raise ProviderFailure("rate_limited")
                        if not 200 <= response.status_code < 300:
                            # A timeout or server error may follow completed billable
                            # work; preserve reconciliation state without re-dispatch.
                            raise ProviderFailure("provider_rejected", unknown=response.status_code == 408 or response.status_code >= 500)
                        if not response.headers.get("content-type", "").split(";", 1)[0].endswith("json"):
                            raise ProviderFailure("invalid_response")
                        chunks, size = [], 0
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > 131072:
                                raise ProviderFailure("response_too_large")
                            chunks.append(chunk)
                        data = strict_json(b"".join(chunks).decode("utf-8"))
                        result = _response_text(config["provider"], data)
                        if not isinstance(result, str) or not result.strip() or key in result:
                            raise ProviderFailure("invalid_response")
                        completion = Completion(result)
                        completion.usage = _response_usage(config["provider"], data)
                        return completion
        except ProviderFailure:
            raise
        except (TimeoutError, httpx.HTTPError):
            raise ProviderFailure("provider_timeout", unknown=True) from None
        except Exception:
            raise ProviderFailure("invalid_response") from None
