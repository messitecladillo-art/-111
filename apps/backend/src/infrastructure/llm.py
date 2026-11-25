import asyncio
from dataclasses import dataclass
import json
import logging
import math
import re
import time
from typing import Any
from urllib.parse import quote

import httpx
from shared.contracts import strict_json

from shared.errors import ApiError, ProviderFailure

# Diagnostics carry only provider/model/class/elapsed: never the key, prompt or response body.
_log = logging.getLogger("uvicorn.error")


_CHAT_PROVIDERS = frozenset(("openai", "deepseek", "qwen", "compatible"))
_WORKFLOW_MAX_MESSAGES = 16
_WORKFLOW_MAX_BYTES = 262144

_FORBIDDEN_BRACKET_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f\[\]{}]+")
_UPSTREAM_URL_RE = re.compile(
    r"https?://[^\s\"'<>]+|\b(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?(?:/[^\s\"'<>]*)?",
    re.IGNORECASE,
)
_SECRET_HEADER_OR_TOKEN_RE = re.compile(
    r"(?:authorization\s*[:=]\s*bearer\s+\S+|bearer\s+[A-Za-z0-9._~+/=-]{6,}|x-(?:goog-)?api-key\s*[:=]\s*\S+|\bsk-[A-Za-z0-9_-]{8,}|\bAIza[0-9A-Za-z_-]{12,})",
    re.IGNORECASE,
)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]+")

PROVIDER_FAILURE_MESSAGES: dict[str, str] = {
    "provider_timeout": "模型服务连接或响应超时，本次结果尚未确认，请稍后核查状态后再试。",
    "rate_limited": "当前模型服务请求过于频繁，请稍候片刻再试。",
    "authentication_failed": "模型服务凭据校验未通过，请在服务设置中核对密钥配置。",
    "redirect_blocked": "模型服务地址发生了未授权跳转，已出于安全原因拦截本次请求。",
    "provider_rejected": "模型服务未接受本次请求，请核对服务地址与模型名称设置。",
    "input_too_large": "单次提交的内容篇幅超出上限，请精简上下文或分段处理后再试。",
    "response_too_large": "模型服务返回的内容超出安全容量上限，请缩小生成范围后再试。",
    "invalid_response": "模型服务返回的数据格式不符合预期，原内容已安全保留，请稍后重试。",
    "invalid_proposal": "生成的结构化建议未能通过格式校验，原内容已安全保留，请稍后重试。",
    "provider_unavailable": "当前未配置可用的模型服务，请先前往服务设置完成连接配置。",
    "provider_failure": "模型服务暂时无法完成本次请求，请稍后重试。",
}
_PROVIDER_REJECTED_UNKNOWN_MESSAGE = "上游模型服务暂时异常，本次处理状态尚未确认，请稍后核查后再试。"
_PROVIDER_STATUS_MAP: dict[str, int] = {
    "rate_limited": 429,
    "provider_timeout": 504,
    "input_too_large": 422,
    "provider_unavailable": 503,
}


def sanitize_upstream_error_text(raw: object, *, secret: str | None = None) -> str:
    """Strip secrets, upstream URLs/IPs, control chars, and forbidden brackets from any diagnostic string."""
    text = str(raw or "")
    if isinstance(secret, str) and secret:
        text = text.replace(secret, "")
    text = _SECRET_HEADER_OR_TOKEN_RE.sub("", text)
    text = _UPSTREAM_URL_RE.sub("", text)
    text = _FORBIDDEN_BRACKET_RE.sub("", text)
    text = _CONTROL_CHARS_RE.sub(" ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text or PROVIDER_FAILURE_MESSAGES["provider_failure"]


def describe_provider_failure(failure: ProviderFailure | str, *, unknown: bool | None = None) -> str:
    """Return a calm, natural Chinese user prompt for any ProviderFailure without echoing upstream payloads."""
    if isinstance(failure, ProviderFailure):
        code = failure.code
        is_unknown = failure.unknown if unknown is None else bool(unknown)
    else:
        code = failure if isinstance(failure, str) else "provider_failure"
        is_unknown = bool(unknown)
    if code == "provider_rejected" and is_unknown:
        return _PROVIDER_REJECTED_UNKNOWN_MESSAGE
    return PROVIDER_FAILURE_MESSAGES.get(code, PROVIDER_FAILURE_MESSAGES["provider_failure"])


def provider_failure_to_api_error(failure: ProviderFailure) -> ApiError:
    """Translate a ProviderFailure into a clean HTTP ApiError with calm Chinese copy."""
    if not isinstance(failure, ProviderFailure):
        failure = ProviderFailure("provider_failure")
    status = _PROVIDER_STATUS_MAP.get(failure.code, 502)
    return ApiError(status, failure.code, describe_provider_failure(failure))


def _provider_failure(code: str, *, unknown: bool = False) -> ProviderFailure:
    err = ProviderFailure(code, unknown=unknown)
    err.user_message = describe_provider_failure(err)
    return err


def _safe_diag_field(config: object, field: str, secret: object = None) -> str:
    if not isinstance(config, dict):
        return "unknown"
    raw = config.get(field)
    if not isinstance(raw, str) or not raw.strip():
        return "unknown"
    if isinstance(secret, str) and secret and secret in raw:
        return "redacted"
    cleaned = _SECRET_HEADER_OR_TOKEN_RE.sub("redacted", raw)
    cleaned = _UPSTREAM_URL_RE.sub("redacted", cleaned)
    cleaned = _FORBIDDEN_BRACKET_RE.sub("", cleaned)
    cleaned = _CONTROL_CHARS_RE.sub("", cleaned).strip()
    if not cleaned:
        return "redacted"
    return cleaned[:64]


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
    if type(config) is not dict or type(key) is not str or not key or type(message) is not str:
        raise _provider_failure("invalid_response")
    if any(ch in key for ch in "\r\n\x00"):
        raise _provider_failure("invalid_response")
    provider = config.get("provider")
    base_url = config.get("baseUrl")
    model = config.get("model")
    max_output_tokens = config.get("maxOutputTokens")
    if not isinstance(provider, str) or not isinstance(base_url, str) or any(ord(ch) <= 32 for ch in base_url):
        raise _provider_failure("provider_rejected")
    if type(max_output_tokens) is not int or max_output_tokens <= 0:
        raise _provider_failure("invalid_response")
    headers = {"content-type": "application/json"}
    if provider == "anthropic":
        if base_url != "https://api.anthropic.com/v1" or not isinstance(model, str) or not model.strip():
            raise _provider_failure("provider_rejected")
        headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
        return base_url + "/messages", headers, {
            "model": model, "max_tokens": max_output_tokens,
            "messages": [{"role": "user", "content": message}], "stream": False,
        }
    if provider == "gemini":
        # Model IDs are one path segment. Existing compatible providers may still use vendor/model IDs.
        if (base_url != "https://generativelanguage.googleapis.com/v1beta"
                or not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", model)):
            raise _provider_failure("provider_rejected")
        headers["x-goog-api-key"] = key
        return base_url + "/models/" + quote(model, safe="") + ":generateContent", headers, {
            "contents": [{"role": "user", "parts": [{"text": message}]}],
            "generationConfig": {"maxOutputTokens": max_output_tokens, "candidateCount": 1},
        }
    if provider not in _CHAT_PROVIDERS or not isinstance(model, str) or not model.strip():
        raise _provider_failure("provider_rejected")
    headers["authorization"] = "Bearer " + key
    parameter = "max_completion_tokens" if provider in ("openai", "qwen") else "max_tokens"
    payload = {"model": model, "messages": [{"role": "user", "content": message}], "stream": False,
               parameter: max_output_tokens}
    if provider == "openai":
        payload["store"] = False
    return base_url + "/chat/completions", headers, payload


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
    async def complete(self, config, key, message, limit, timeout=30):
        return await self._complete(config, key, message, limit, structured=False, timeout=timeout)

    async def complete_messages(self, config, key, messages, limit):
        """Preserve system/user separation without enabling tools or remote parts.

        The caller must persist consent and a call receipt before invoking this
        transport. A completion is not a verified research/tool result.
        """
        return await self._complete(config, key, messages, limit, structured=True)

    async def _complete(self, config, key, content, limit, *, structured, timeout=30):
        # Long-form report sections (bounded by their own outer lease) may need more
        # than the interactive default; never allow an unbounded or tiny budget.
        if type(timeout) not in (int, float) or not 5 <= timeout <= 120:
            timeout = 30
        started = time.monotonic()
        pending_failure: ProviderFailure | None = None
        try:
            if structured:
                if type(limit) is not int or not 1 <= limit <= _WORKFLOW_MAX_BYTES:
                    raise _provider_failure("input_too_large")
                url, headers, payload = _workflow_request(config, key, content)
            else:
                if type(limit) is not int or limit < 1:
                    raise _provider_failure("input_too_large")
                url, headers, payload = _request(config, key, content)
            if key in url or _contains_secret(payload, key):
                raise _provider_failure("invalid_response")
            encoded = json.dumps(payload, ensure_ascii=False).encode()
            if len(encoded) > limit:
                raise _provider_failure("input_too_large")
            async def read(response):
                if 300 <= response.status_code < 400:
                    raise _provider_failure("redirect_blocked")
                if response.status_code in (401, 403):
                    raise _provider_failure("authentication_failed")
                if response.status_code == 429:
                    raise _provider_failure("rate_limited")
                if not 200 <= response.status_code < 300:
                    # A timeout or server error may follow completed billable
                    # work; preserve reconciliation state without re-dispatch.
                    raise _provider_failure("provider_rejected", unknown=response.status_code == 408 or response.status_code >= 500)
                if not response.headers.get("content-type", "").split(";", 1)[0].endswith("json"):
                    raise _provider_failure("invalid_response")
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > 131072:
                        raise _provider_failure("response_too_large")
                    chunks.append(chunk)
                data = strict_json(b"".join(chunks).decode("utf-8"))
                result = _response_text(config["provider"], data)
                if not isinstance(result, str) or not result.strip() or key in result:
                    raise _provider_failure("invalid_response")
                completion = Completion(result)
                completion.usage = _response_usage(config["provider"], data)
                return completion

            async with asyncio.timeout(timeout):
                async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=5), follow_redirects=False, trust_env=False) as client:
                    for connect_attempt in range(3):
                        try:
                            async with client.stream("POST", url, headers=headers, content=encoded) as response:
                                return await read(response)
                        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
                            # Connection never established: no request bytes reached the provider,
                            # so a bounded re-connect cannot duplicate billable work.
                            if connect_attempt == 2:
                                raise
                            _log.warning("llm connect retry provider=%s model=%s error=%s attempt=%d elapsed=%.1fs",
                                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                                         type(error).__name__, connect_attempt + 1, time.monotonic() - started)
                            await asyncio.sleep(0.8 * (connect_attempt + 1))
        except ProviderFailure as failure:
            if not getattr(failure, "user_message", None):
                failure.user_message = describe_provider_failure(failure)
            failure.__cause__ = None
            failure.__context__ = None
            failure.__suppress_context__ = True
            _log.warning("llm call failed provider=%s model=%s code=%s unknown=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         failure.code, failure.unknown, time.monotonic() - started)
            pending_failure = failure
        except asyncio.CancelledError:
            _log.warning("llm call cancelled provider=%s model=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         time.monotonic() - started)
            raise
        except (TimeoutError, httpx.HTTPError) as error:
            # Kept conservative: after bounded re-connects the outcome is still reported as unknown.
            _log.warning("llm transport failed provider=%s model=%s error=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         type(error).__name__, time.monotonic() - started)
            pending_failure = _provider_failure("provider_timeout", unknown=True)
        except Exception as error:
            _log.warning("llm response invalid provider=%s model=%s error=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         type(error).__name__, time.monotonic() - started)
            pending_failure = _provider_failure("invalid_response")
        if pending_failure is not None:
            pending_failure.__cause__ = None
            pending_failure.__context__ = None
            pending_failure.__suppress_context__ = True
            raise pending_failure

    async def complete_agent_turn(
        self,
        config,
        key,
        messages,
        *,
        tools=None,
        tool_choice="auto",
        limit=196608,
        timeout=45,
    ) -> "AgentModelTurn":
        """Execute one bounded multi-turn tool-calling turn across all supported providers."""
        if type(timeout) not in (int, float) or not 5 <= timeout <= 120:
            timeout = 45
        started = time.monotonic()
        pending_failure: ProviderFailure | None = None
        try:
            if type(limit) is not int or not 1 <= limit <= _AGENT_MAX_BYTES:
                raise _provider_failure("input_too_large")
            url, headers, payload = _agent_request(config, key, messages, tools, tool_choice)
            if key in url or _contains_secret(payload, key):
                raise _provider_failure("invalid_response")
            encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            if len(encoded) > limit:
                raise _provider_failure("input_too_large")

            async def read(response):
                if 300 <= response.status_code < 400:
                    raise _provider_failure("redirect_blocked")
                if response.status_code in (401, 403):
                    raise _provider_failure("authentication_failed")
                if response.status_code == 429:
                    raise _provider_failure("rate_limited")
                if not 200 <= response.status_code < 300:
                    raise _provider_failure("provider_rejected", unknown=response.status_code == 408 or response.status_code >= 500)
                if not response.headers.get("content-type", "").split(";", 1)[0].endswith("json"):
                    raise _provider_failure("invalid_response")
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > _AGENT_MAX_BYTES:
                        raise _provider_failure("response_too_large")
                    chunks.append(chunk)
                data = strict_json(b"".join(chunks).decode("utf-8"))
                turn = _agent_response_turn(config["provider"], data, key)
                if tool_choice == "none" and turn.tool_calls:
                    raise _provider_failure("invalid_response")
                return turn

            async with asyncio.timeout(timeout):
                async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=5), follow_redirects=False, trust_env=False) as client:
                    for connect_attempt in range(3):
                        try:
                            async with client.stream("POST", url, headers=headers, content=encoded) as response:
                                return await read(response)
                        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
                            if connect_attempt == 2:
                                raise
                            _log.warning("llm agent connect retry provider=%s model=%s error=%s attempt=%d elapsed=%.1fs",
                                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                                         type(error).__name__, connect_attempt + 1, time.monotonic() - started)
                            await asyncio.sleep(0.8 * (connect_attempt + 1))
        except ProviderFailure as failure:
            if not getattr(failure, "user_message", None):
                failure.user_message = describe_provider_failure(failure)
            failure.__cause__ = None
            failure.__context__ = None
            failure.__suppress_context__ = True
            _log.warning("llm agent call failed provider=%s model=%s code=%s unknown=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         failure.code, failure.unknown, time.monotonic() - started)
            pending_failure = failure
        except asyncio.CancelledError:
            _log.warning("llm agent call cancelled provider=%s model=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         time.monotonic() - started)
            raise
        except (TimeoutError, httpx.HTTPError) as error:
            _log.warning("llm agent transport failed provider=%s model=%s error=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         type(error).__name__, time.monotonic() - started)
            pending_failure = _provider_failure("provider_timeout", unknown=True)
        except Exception as error:
            _log.warning("llm agent response invalid provider=%s model=%s error=%s elapsed=%.1fs",
                         _safe_diag_field(config, "provider", key), _safe_diag_field(config, "model", key),
                         type(error).__name__, time.monotonic() - started)
            pending_failure = _provider_failure("invalid_response")
        if pending_failure is not None:
            pending_failure.__cause__ = None
            pending_failure.__context__ = None
            pending_failure.__suppress_context__ = True
            raise pending_failure


_AGENT_MAX_MESSAGES = 48
_AGENT_MAX_BYTES = 262144
_TOOL_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]{0,63}$")
_TOOL_CALL_ID_RE = re.compile(r"^[A-Za-z0-9_.:/@-]{1,128}$")


@dataclass(frozen=True)
class ModelToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class AgentModelTurn:
    text: str
    reasoning: str
    tool_calls: tuple[ModelToolCall, ...]
    usage: dict[str, int] | None
    stop_reason: str = "stop"


def _validate_agent_str(value, key, *, allow_empty=False, max_bytes=_AGENT_MAX_BYTES):
    if type(value) is not str:
        raise ProviderFailure("invalid_response")
    if not allow_empty and not value.strip():
        raise ProviderFailure("invalid_response")
    try:
        encoded = value.encode("utf-8", errors="strict")
    except UnicodeEncodeError:
        raise ProviderFailure("invalid_response") from None
    if len(encoded) > max_bytes:
        raise ProviderFailure("input_too_large")
    if any(ord(ch) < 32 and ch not in "\n\r\t" for ch in value):
        raise ProviderFailure("invalid_response")
    if key in value:
        raise ProviderFailure("invalid_response")
    return value


def _validate_json_value(value, key, *, depth=0):
    if depth > 16:
        raise ProviderFailure("invalid_response")
    if value is None or type(value) is bool or type(value) is int:
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise ProviderFailure("invalid_response")
        return value
    if type(value) is str:
        return _validate_agent_str(value, key, allow_empty=True, max_bytes=_AGENT_MAX_BYTES)
    if type(value) is list:
        return [_validate_json_value(item, key, depth=depth + 1) for item in value]
    if type(value) is dict:
        out = {}
        for k, v in value.items():
            clean_k = _validate_agent_str(k, key, allow_empty=False, max_bytes=4096)
            out[clean_k] = _validate_json_value(v, key, depth=depth + 1)
        return out
    raise ProviderFailure("invalid_response")


def _agent_messages(messages, key):
    """Validate bounded multi-turn system/user/assistant/tool messages strictly."""
    if (type(key) is not str or not key or type(messages) is not list
            or not 2 <= len(messages) <= _AGENT_MAX_MESSAGES):
        raise ProviderFailure("invalid_response")
    result = []
    prev_role = ""
    pending_calls: dict[str, str] | None = None
    answered_ids: set[str] = set()

    for index, item in enumerate(messages):
        if type(item) is not dict or any(type(name) is not str for name in item):
            raise ProviderFailure("invalid_response")
        keys = set(item)
        role = item.get("role")
        if type(role) is not str:
            raise ProviderFailure("invalid_response")

        if index == 0:
            if keys != {"role", "content"} or role != "system":
                raise ProviderFailure("invalid_response")
            content = _validate_agent_str(item["content"], key)
            result.append({"role": "system", "content": content})
            prev_role = "system"
            continue

        if index == 1:
            if keys != {"role", "content"} or role != "user":
                raise ProviderFailure("invalid_response")
            content = _validate_agent_str(item["content"], key)
            result.append({"role": "user", "content": content})
            prev_role = "user"
            continue

        if role == "user":
            if keys != {"role", "content"}:
                raise ProviderFailure("invalid_response")
            if pending_calls is not None and len(answered_ids) != len(pending_calls):
                raise ProviderFailure("invalid_response")
            pending_calls = None
            answered_ids = set()
            content = _validate_agent_str(item["content"], key)
            result.append({"role": "user", "content": content})
            prev_role = "user"
        elif role == "assistant":
            if prev_role not in ("user", "tool"):
                raise ProviderFailure("invalid_response")
            if pending_calls is not None and len(answered_ids) != len(pending_calls):
                raise ProviderFailure("invalid_response")
            if keys - {"role", "content", "tool_calls"}:
                raise ProviderFailure("invalid_response")
            raw_content = item.get("content")
            clean_content = None
            if raw_content is not None:
                clean_content = _validate_agent_str(raw_content, key, allow_empty=True)
            has_text = isinstance(clean_content, str) and bool(clean_content.strip())

            clean_tcs = []
            has_tc_key = "tool_calls" in item and item["tool_calls"] is not None
            if has_tc_key:
                raw_tcs = item["tool_calls"]
                if type(raw_tcs) is not list or not 1 <= len(raw_tcs) <= 8:
                    raise ProviderFailure("invalid_response")
                new_pending: dict[str, str] = {}
                for tc in raw_tcs:
                    if type(tc) is not dict or any(type(k) is not str for k in tc) or set(tc) != {"id", "name", "arguments"}:
                        raise ProviderFailure("invalid_response")
                    tc_id, tc_name, tc_args = tc["id"], tc["name"], tc["arguments"]
                    if (type(tc_id) is not str or not _TOOL_CALL_ID_RE.fullmatch(tc_id) or key in tc_id
                            or tc_id in new_pending):
                        raise ProviderFailure("invalid_response")
                    if type(tc_name) is not str or not _TOOL_NAME_RE.fullmatch(tc_name) or key in tc_name:
                        raise ProviderFailure("invalid_response")
                    if type(tc_args) is not dict:
                        raise ProviderFailure("invalid_response")
                    clean_args = _validate_json_value(tc_args, key)
                    new_pending[tc_id] = tc_name
                    clean_tcs.append({"id": tc_id, "name": tc_name, "arguments": clean_args})
                pending_calls = new_pending
                answered_ids = set()
            else:
                if not has_text:
                    raise ProviderFailure("invalid_response")
                pending_calls = None
                answered_ids = set()

            entry: dict[str, Any] = {"role": "assistant"}
            if clean_content is not None:
                entry["content"] = clean_content
            if clean_tcs:
                entry["tool_calls"] = clean_tcs
            result.append(entry)
            prev_role = "assistant"
        elif role == "tool":
            if keys != {"role", "tool_call_id", "name", "content"}:
                raise ProviderFailure("invalid_response")
            if prev_role not in ("assistant", "tool") or not pending_calls:
                raise ProviderFailure("invalid_response")
            tc_id, tc_name, tc_content = item["tool_call_id"], item["name"], item["content"]
            if type(tc_id) is not str or tc_id not in pending_calls or tc_id in answered_ids:
                raise ProviderFailure("invalid_response")
            if type(tc_name) is not str or pending_calls[tc_id] != tc_name:
                raise ProviderFailure("invalid_response")
            clean_tool_content = _validate_agent_str(tc_content, key, allow_empty=False, max_bytes=_AGENT_MAX_BYTES)
            answered_ids.add(tc_id)
            result.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "name": tc_name,
                "content": clean_tool_content,
            })
            prev_role = "tool"
        else:
            raise ProviderFailure("invalid_response")

    if pending_calls is not None and len(answered_ids) != len(pending_calls):
        raise ProviderFailure("invalid_response")
    if _contains_secret(result, key):
        raise ProviderFailure("invalid_response")
    return result


def _validate_agent_tools(tools, key):
    if tools is None:
        return None
    if type(key) is not str or not key or type(tools) is not list or len(tools) > 64:
        raise ProviderFailure("invalid_response")
    cleaned = []
    seen_names: set[str] = set()
    for tool in tools:
        if type(tool) is not dict or any(type(k) is not str for k in tool) or set(tool) != {"name", "description", "parameters"}:
            raise ProviderFailure("invalid_response")
        name = tool["name"]
        if type(name) is not str or not _TOOL_NAME_RE.fullmatch(name) or key in name or name in seen_names:
            raise ProviderFailure("invalid_response")
        seen_names.add(name)
        desc = _validate_agent_str(tool["description"], key, allow_empty=False, max_bytes=4096)
        params = tool["parameters"]
        if type(params) is not dict:
            raise ProviderFailure("invalid_response")
        clean_params = _validate_json_value(params, key)
        cleaned.append({"name": name, "description": desc, "parameters": clean_params})
    if _contains_secret(cleaned, key):
        raise ProviderFailure("invalid_response")
    return cleaned


def _agent_request(config, key, messages, tools, tool_choice):
    if tool_choice not in ("auto", "none"):
        raise ProviderFailure("invalid_response")
    validated_messages = _agent_messages(messages, key)
    validated_tools = _validate_agent_tools(tools, key)
    anchor = validated_messages[-1].get("content") or "turn"
    url, headers, payload = _request(config, key, anchor)
    provider = config["provider"]

    if provider == "anthropic":
        payload["system"] = validated_messages[0]["content"]
        conv = []
        idx = 1
        while idx < len(validated_messages):
            msg = validated_messages[idx]
            if msg["role"] == "user":
                conv.append({"role": "user", "content": msg["content"]})
                idx += 1
            elif msg["role"] == "assistant":
                blocks = []
                if isinstance(msg.get("content"), str) and msg["content"]:
                    blocks.append({"type": "text", "text": msg["content"]})
                for tc in msg.get("tool_calls") or []:
                    blocks.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc["arguments"],
                    })
                conv.append({"role": "assistant", "content": blocks})
                idx += 1
            else:
                tool_blocks = []
                while idx < len(validated_messages) and validated_messages[idx]["role"] == "tool":
                    tmsg = validated_messages[idx]
                    tool_blocks.append({
                        "type": "tool_result",
                        "tool_use_id": tmsg["tool_call_id"],
                        "content": tmsg["content"],
                    })
                    idx += 1
                conv.append({"role": "user", "content": tool_blocks})
        payload["messages"] = conv
        if validated_tools:
            payload["tools"] = [
                {
                    "name": t["name"],
                    "description": t["description"],
                    "input_schema": t["parameters"],
                }
                for t in validated_tools
            ]
            if tool_choice != "none":
                payload["tool_choice"] = {"type": "auto"}
        return url, headers, payload

    if provider == "gemini":
        payload["systemInstruction"] = {"parts": [{"text": validated_messages[0]["content"]}]}
        contents = []
        idx = 1
        while idx < len(validated_messages):
            msg = validated_messages[idx]
            if msg["role"] == "user":
                contents.append({"role": "user", "parts": [{"text": msg["content"]}]})
                idx += 1
            elif msg["role"] == "assistant":
                parts = []
                if isinstance(msg.get("content"), str) and msg["content"]:
                    parts.append({"text": msg["content"]})
                for tc in msg.get("tool_calls") or []:
                    parts.append({"functionCall": {"name": tc["name"], "args": tc["arguments"]}})
                contents.append({"role": "model", "parts": parts})
                idx += 1
            else:
                resp_parts = []
                while idx < len(validated_messages) and validated_messages[idx]["role"] == "tool":
                    tmsg = validated_messages[idx]
                    try:
                        parsed_res = strict_json(tmsg["content"])
                    except Exception:
                        parsed_res = tmsg["content"]
                    resp_parts.append({
                        "functionResponse": {
                            "name": tmsg["name"],
                            "response": {"result": parsed_res},
                        }
                    })
                    idx += 1
                contents.append({"role": "user", "parts": resp_parts})
        payload["contents"] = contents
        if validated_tools:
            payload["tools"] = [{
                "functionDeclarations": [
                    {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["parameters"],
                    }
                    for t in validated_tools
                ]
            }]
            if tool_choice == "none":
                payload["toolConfig"] = {"functionCallingConfig": {"mode": "NONE"}}
        return url, headers, payload

    # OpenAI / DeepSeek / Qwen / Compatible
    chat_msgs = []
    for msg in validated_messages:
        if msg["role"] in ("system", "user"):
            chat_msgs.append({"role": msg["role"], "content": msg["content"]})
        elif msg["role"] == "assistant":
            out: dict[str, Any] = {"role": "assistant"}
            if isinstance(msg.get("content"), str):
                out["content"] = msg["content"]
            elif msg.get("tool_calls"):
                out["content"] = ""
            if msg.get("tool_calls"):
                out["tool_calls"] = [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": json.dumps(tc["arguments"], ensure_ascii=False, separators=(",", ":")),
                        },
                    }
                    for tc in msg["tool_calls"]
                ]
            chat_msgs.append(out)
        else:
            chat_msgs.append({
                "role": "tool",
                "tool_call_id": msg["tool_call_id"],
                "content": msg["content"],
            })
    payload["messages"] = chat_msgs
    if validated_tools:
        payload["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in validated_tools
        ]
        payload["tool_choice"] = tool_choice
    return url, headers, payload


def _agent_response_turn(provider, data, key) -> AgentModelTurn:
    if not isinstance(data, dict) or "error" in data:
        raise ProviderFailure("invalid_response")

    text_out = ""
    reasoning_out = ""
    tool_calls: list[ModelToolCall] = []
    stop_reason = "stop"

    if provider == "anthropic":
        if (data.get("type") != "message" or data.get("role") != "assistant"
                or data.get("stop_reason") not in ("end_turn", "stop_sequence", "tool_use")
                or data.get("stop_details") is not None or not isinstance(data.get("content"), list)):
            raise ProviderFailure("invalid_response")
        text_parts: list[str] = []
        reason_parts: list[str] = []
        for block in data["content"]:
            if not isinstance(block, dict):
                raise ProviderFailure("invalid_response")
            btype = block.get("type")
            if btype == "thinking":
                if isinstance(block.get("thinking"), str):
                    reason_parts.append(block["thinking"])
            elif btype == "redacted_thinking":
                continue
            elif btype == "text":
                if not isinstance(block.get("text"), str):
                    raise ProviderFailure("invalid_response")
                text_parts.append(block["text"])
            elif btype == "tool_use":
                tc_id = block.get("id")
                tc_name = block.get("name")
                tc_input = {} if block.get("input") is None else block.get("input")
                if (type(tc_id) is not str or not _TOOL_CALL_ID_RE.fullmatch(tc_id)
                        or type(tc_name) is not str or not _TOOL_NAME_RE.fullmatch(tc_name)
                        or type(tc_input) is not dict):
                    raise ProviderFailure("invalid_response")
                clean_args = _validate_json_value(tc_input, key)
                tool_calls.append(ModelToolCall(id=tc_id, name=tc_name, arguments=clean_args))
            else:
                raise ProviderFailure("invalid_response")
        text_out = "".join(text_parts)
        reasoning_out = "".join(reason_parts)
        stop_reason = "tool_calls" if (tool_calls or data.get("stop_reason") == "tool_use") else "stop"

    elif provider == "gemini":
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
        text_parts = []
        reason_parts = []
        for idx, part in enumerate(content["parts"]):
            if not isinstance(part, dict):
                raise ProviderFailure("invalid_response")
            if "functionCall" in part:
                if set(part) - {"functionCall", "thoughtSignature"}:
                    raise ProviderFailure("invalid_response")
                fc = part["functionCall"]
                if not isinstance(fc, dict) or set(fc) - {"id", "name", "args"}:
                    raise ProviderFailure("invalid_response")
                tc_name = fc.get("name")
                tc_args = {} if fc.get("args") is None else fc.get("args")
                tc_id = fc.get("id") or f"gemini_tc_{idx}"
                if (type(tc_id) is not str or not _TOOL_CALL_ID_RE.fullmatch(tc_id)
                        or type(tc_name) is not str or not _TOOL_NAME_RE.fullmatch(tc_name)
                        or type(tc_args) is not dict):
                    raise ProviderFailure("invalid_response")
                clean_args = _validate_json_value(tc_args, key)
                tool_calls.append(ModelToolCall(id=tc_id, name=tc_name, arguments=clean_args))
            else:
                if (set(part) - {"text", "thought", "thoughtSignature"}
                        or not isinstance(part.get("text"), str)
                        or type(part.get("thought", False)) is not bool
                        or ("thoughtSignature" in part and not isinstance(part["thoughtSignature"], str))):
                    raise ProviderFailure("invalid_response")
                if part.get("thought", False):
                    reason_parts.append(part["text"])
                else:
                    text_parts.append(part["text"])
        text_out = "".join(text_parts)
        reasoning_out = "".join(reason_parts)
        stop_reason = "tool_calls" if tool_calls else "stop"

    elif provider in _CHAT_PROVIDERS:
        choices = data.get("choices")
        if not isinstance(choices, list) or len(choices) != 1:
            raise ProviderFailure("invalid_response")
        choice = choices[0]
        if not isinstance(choice, dict) or choice.get("finish_reason") not in ("stop", "tool_calls"):
            raise ProviderFailure("invalid_response")
        message = choice.get("message")
        if (not isinstance(message, dict) or message.get("role") not in (None, "assistant")
                or message.get("function_call") or message.get("refusal")):
            raise ProviderFailure("invalid_response")
        raw_content = message.get("content")
        if raw_content is not None and type(raw_content) is not str:
            raise ProviderFailure("invalid_response")
        text_out = raw_content or ""
        raw_reasoning = message.get("reasoning_content")
        if raw_reasoning is None:
            raw_reasoning = message.get("reasoning")
        if raw_reasoning is not None and type(raw_reasoning) is not str:
            raise ProviderFailure("invalid_response")
        reasoning_out = raw_reasoning or ""
        raw_tcs = message.get("tool_calls")
        if raw_tcs is not None:
            if type(raw_tcs) is not list:
                raise ProviderFailure("invalid_response")
            for tc in raw_tcs:
                if not isinstance(tc, dict) or tc.get("type") not in (None, "function"):
                    raise ProviderFailure("invalid_response")
                tc_id = tc.get("id")
                fn = tc.get("function")
                if type(tc_id) is not str or not _TOOL_CALL_ID_RE.fullmatch(tc_id) or not isinstance(fn, dict):
                    raise ProviderFailure("invalid_response")
                tc_name = fn.get("name")
                raw_args = fn.get("arguments")
                if type(tc_name) is not str or not _TOOL_NAME_RE.fullmatch(tc_name) or type(raw_args) is not str:
                    raise ProviderFailure("invalid_response")
                try:
                    parsed_args = strict_json(raw_args)
                except Exception:
                    raise ProviderFailure("invalid_response") from None
                if type(parsed_args) is not dict:
                    raise ProviderFailure("invalid_response")
                clean_args = _validate_json_value(parsed_args, key)
                tool_calls.append(ModelToolCall(id=tc_id, name=tc_name, arguments=clean_args))
        stop_reason = "tool_calls" if (tool_calls or choice.get("finish_reason") == "tool_calls") else "stop"

    else:
        raise ProviderFailure("provider_rejected")

    if len(tool_calls) > 8 or (not text_out.strip() and not tool_calls) or (stop_reason == "tool_calls" and not tool_calls):
        raise ProviderFailure("invalid_response")
    if (key in text_out or key in reasoning_out
            or _contains_secret([{"id": tc.id, "name": tc.name, "arguments": tc.arguments} for tc in tool_calls], key)):
        raise ProviderFailure("invalid_response")
    return AgentModelTurn(
        text=text_out,
        reasoning=reasoning_out,
        tool_calls=tuple(tool_calls),
        usage=_response_usage(provider, data),
        stop_reason=stop_reason,
    )
