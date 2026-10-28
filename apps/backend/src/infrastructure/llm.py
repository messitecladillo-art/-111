import asyncio
import json
import re
from urllib.parse import quote

import httpx
from shared.contracts import strict_json

from shared.errors import ProviderFailure


_CHAT_PROVIDERS = frozenset(("openai", "deepseek", "qwen", "compatible"))


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
        try:
            url, headers, payload = _request(config, key, message)
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
                        return result
        except ProviderFailure:
            raise
        except (TimeoutError, httpx.HTTPError):
            raise ProviderFailure("provider_timeout", unknown=True) from None
        except Exception:
            raise ProviderFailure("invalid_response") from None
