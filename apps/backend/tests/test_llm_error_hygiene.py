"""Deterministic error-hygiene tests for infrastructure/llm.py upstream failure translation."""

from __future__ import annotations

import ast
import inspect
import logging
from pathlib import Path
import re
import traceback

import httpx
import pytest

from infrastructure import llm
from infrastructure.llm import (
    PROVIDER_FAILURE_MESSAGES,
    ChatCompletionClient,
    describe_provider_failure,
    provider_failure_to_api_error,
    sanitize_upstream_error_text,
)
from shared.errors import ApiError, ProviderFailure

SECRET_KEY = "sk-evix-secret-upstream-credential-99887766"
INTERNAL_BASE = "http://10.24.18.9:8080/v1"
PRIVATE_LAN_URL = "http://192.168.50.12:11434/v1/chat/completions"
FORBIDDEN_BRACKETS_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
PRIVATE_PATH_RE = re.compile(r"(?:[A-Za-z]:\\Users\\|/Users/|zyy20|AppData)", re.IGNORECASE)
EXPOSED_TECH_JARGON_RE = re.compile(
    r"\b(?:LLM|API|Token|BYOK|HTTP|URL|Bearer|Payload|ReAct|EpistemicGraph|RunLease)\b|沙盒|算子",
    re.IGNORECASE,
)


def _mock_transport(monkeypatch: pytest.MonkeyPatch, handler):
    original_client = httpx.AsyncClient

    async def _fast_sleep(_delay: float) -> None:
        return None

    monkeypatch.setattr("infrastructure.llm.asyncio.sleep", _fast_sleep)
    monkeypatch.setattr(
        "infrastructure.llm.httpx.AsyncClient",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_llm_module_ast_and_chinese_failure_catalog_hygiene():
    llm_path = Path(inspect.getsourcefile(llm) or "").resolve()
    tree = ast.parse(llm_path.read_text(encoding="utf-8"), filename=str(llm_path))

    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            assert not FORBIDDEN_BRACKETS_RE.search(node.value), (
                f"infrastructure/llm.py:{node.lineno} contains forbidden bracket literal"
            )
            assert not PRIVATE_PATH_RE.search(node.value), (
                f"infrastructure/llm.py:{node.lineno} contains machine-local path"
            )

    all_messages = list(PROVIDER_FAILURE_MESSAGES.values()) + [
        describe_provider_failure("provider_rejected", unknown=True),
        describe_provider_failure("unknown_custom_code"),
    ]
    for msg in all_messages:
        assert isinstance(msg, str) and len(msg) >= 10
        assert any("\u4e00" <= ch <= "\u9fff" for ch in msg)
        assert not FORBIDDEN_BRACKETS_RE.search(msg)
        assert not re.search(r"[\[\]{}]", msg)
        assert not EXPOSED_TECH_JARGON_RE.search(msg)
        # Calm prose rather than dictionary-colon header
        assert not re.match(r"^[^，。；！？]{1,8}：", msg)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,expected_code,expected_unknown,expected_http_status",
    [
        (302, "redirect_blocked", False, 502),
        (400, "provider_rejected", False, 502),
        (401, "authentication_failed", False, 502),
        (403, "authentication_failed", False, 502),
        (404, "provider_rejected", False, 502),
        (408, "provider_rejected", True, 502),
        (422, "provider_rejected", False, 502),
        (429, "rate_limited", False, 429),
        (500, "provider_rejected", True, 502),
        (502, "provider_rejected", True, 502),
        (503, "provider_rejected", True, 502),
        (504, "provider_rejected", True, 502),
    ],
)
async def test_upstream_4xx_5xx_and_redirect_preserve_codes_and_never_echo_secrets_urls_or_brackets(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    status: int,
    expected_code: str,
    expected_unknown: bool,
    expected_http_status: int,
):
    poisoned_upstream_body = {
        "error": {
            "message": (
                f"\u300c上游网关鉴权或限流异常\u300d\u3010内部节点 {INTERNAL_BASE}/chat/completions\u3011 "
                f"Authorization: Bearer {SECRET_KEY} proxy={PRIVATE_LAN_URL}"
            )
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == f"Bearer {SECRET_KEY}"
        return httpx.Response(
            status,
            json=poisoned_upstream_body,
            headers={"location": f"{PRIVATE_LAN_URL}?key={SECRET_KEY}"},
        )

    _mock_transport(monkeypatch, handler)
    cfg = {
        "provider": "compatible",
        "baseUrl": INTERNAL_BASE,
        "model": "qwen-plus",
        "maxOutputTokens": 512,
    }
    messages = [
        {"role": "system", "content": "请输出结构化分析结果。"},
        {"role": "user", "content": "核验样本分布与量表信度。"},
    ]

    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        for runner in (
            lambda: ChatCompletionClient().complete(cfg, SECRET_KEY, "核验样本分布", 65536),
            lambda: ChatCompletionClient().complete_messages(cfg, SECRET_KEY, messages, 65536),
            lambda: ChatCompletionClient().complete_agent_turn(cfg, SECRET_KEY, messages),
        ):
            with pytest.raises(ProviderFailure) as exc_info:
                await runner()

            failure = exc_info.value
            assert failure.code == expected_code
            assert failure.unknown is expected_unknown
            assert failure.__cause__ is None and failure.__context__ is None

            user_msg = getattr(failure, "user_message", "")
            assert user_msg == describe_provider_failure(failure)
            api_err = provider_failure_to_api_error(failure)
            assert isinstance(api_err, ApiError)
            assert api_err.status == expected_http_status
            assert api_err.code == expected_code
            assert api_err.message == user_msg

            formatted_tb = "".join(traceback.format_exception(type(failure), failure, failure.__traceback__))
            for surface in (str(failure), repr(failure), user_msg, api_err.message, formatted_tb):
                assert SECRET_KEY not in surface
                assert "Bearer" not in surface
                assert INTERNAL_BASE not in surface
                assert "10.24.18.9" not in surface
                assert "192.168.50.12" not in surface
                assert not FORBIDDEN_BRACKETS_RE.search(surface)

    log_blob = "\n".join(caplog.messages)
    assert SECRET_KEY not in log_blob
    assert INTERNAL_BASE not in log_blob
    assert "10.24.18.9" not in log_blob
    assert not FORBIDDEN_BRACKETS_RE.search(log_blob)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "exc_factory",
    [
        lambda req: httpx.ConnectTimeout(f"\u3010连接超时\u3011 {INTERNAL_BASE} Bearer {SECRET_KEY}", request=req),
        lambda req: httpx.ReadTimeout(f"\u300c读取超时\u300d {PRIVATE_LAN_URL} key={SECRET_KEY}", request=req),
        lambda req: httpx.ConnectError(f"Dial {INTERNAL_BASE} failed with {SECRET_KEY}", request=req),
        lambda req: httpx.RemoteProtocolError(f"Upstream reset at {PRIVATE_LAN_URL} ({SECRET_KEY})", request=req),
    ],
)
async def test_transport_timeouts_and_network_errors_strip_httpx_request_context_and_secrets(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    exc_factory,
):
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc_factory(request)

    _mock_transport(monkeypatch, handler)
    cfg = {
        "provider": "compatible",
        "baseUrl": INTERNAL_BASE,
        "model": "deepseek-chat",
        "maxOutputTokens": 512,
    }
    messages = [
        {"role": "system", "content": "请返回实证摘要。"},
        {"role": "user", "content": "继续完成检验。"},
    ]

    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        for runner in (
            lambda: ChatCompletionClient().complete(cfg, SECRET_KEY, "继续完成检验", 65536),
            lambda: ChatCompletionClient().complete_agent_turn(cfg, SECRET_KEY, messages),
        ):
            with pytest.raises(ProviderFailure) as exc_info:
                await runner()

            failure = exc_info.value
            assert failure.code == "provider_timeout"
            assert failure.unknown is True
            assert failure.__cause__ is None and failure.__context__ is None

            zh_prompt = describe_provider_failure(failure)
            assert "超时" in zh_prompt
            assert not FORBIDDEN_BRACKETS_RE.search(zh_prompt)
            formatted_tb = "".join(traceback.format_exception(type(failure), failure, failure.__traceback__))
            for surface in (str(failure), zh_prompt, formatted_tb):
                assert SECRET_KEY not in surface
                assert INTERNAL_BASE not in surface
                assert PRIVATE_LAN_URL not in surface
                assert "10.24.18.9" not in surface
                assert "192.168.50.12" not in surface

    log_blob = "\n".join(caplog.messages)
    assert SECRET_KEY not in log_blob
    assert "10.24.18.9" not in log_blob
    assert "192.168.50.12" not in log_blob
    assert not FORBIDDEN_BRACKETS_RE.search(log_blob)


@pytest.mark.asyncio
async def test_pre_io_secret_echo_malformed_config_and_log_redaction(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    calls: list[httpx.Request] = []
    _mock_transport(
        monkeypatch,
        lambda req: calls.append(req)
        or httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}),
    )

    # 1. Non-dict config never crashes exception logging with AttributeError
    for bad_cfg in (None, [], "not-a-dict"):
        with pytest.raises(ProviderFailure) as bad_exc:
            await ChatCompletionClient().complete(bad_cfg, SECRET_KEY, "测试", 65536)
        assert bad_exc.value.code == "invalid_response"

    # 2. Single-turn complete() also blocks secret leak in model/message before IO and redacts logs
    poisoned_cfg = {
        "provider": "compatible",
        "baseUrl": INTERNAL_BASE,
        "model": f"\u3010内部模型\u3011{SECRET_KEY}\r\n{PRIVATE_LAN_URL}",
        "maxOutputTokens": 256,
    }
    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        with pytest.raises(ProviderFailure) as secret_exc:
            await ChatCompletionClient().complete(poisoned_cfg, SECRET_KEY, "测试", 65536)
        assert secret_exc.value.code == "invalid_response"
        assert calls == []

    for record_msg in caplog.messages:
        assert SECRET_KEY not in record_msg
        assert PRIVATE_LAN_URL not in record_msg
        assert INTERNAL_BASE not in record_msg
        assert "\r" not in record_msg and "\n" not in record_msg
        assert not FORBIDDEN_BRACKETS_RE.search(record_msg)

    # 3. Direct sanitizer utility removes headers, keys, internal endpoints, and brackets
    dirty = (
        f"Upstream \u300c网关异常\u300d \u3010502\u3011 at {PRIVATE_LAN_URL} "
        f"Authorization: Bearer {SECRET_KEY} x-api-key={SECRET_KEY} 节点连接中断"
    )
    cleaned = sanitize_upstream_error_text(dirty, secret=SECRET_KEY)
    assert SECRET_KEY not in cleaned
    assert "Bearer" not in cleaned
    assert "192.168.50.12" not in cleaned
    assert not FORBIDDEN_BRACKETS_RE.search(cleaned)
    assert "节点连接中断" in cleaned
