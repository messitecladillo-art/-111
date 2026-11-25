"""Permanent Python AST purity guard for user-facing ApiError messages across all backend routes & services.

Verifies every static/templated ApiError message and dynamic error catalog entry:
1. 100% contains Chinese characters (zero raw English-only developer errors);
2. Zero forbidden bracket punctuation ([【】「」『』]);
3. Zero stack traces, local physical filesystem paths, or database connection URIs;
4. Zero raw SQL statements or Python / SQLAlchemy / Pydantic exception class names.
"""
from __future__ import annotations

import ast
from pathlib import Path
import re

from infrastructure.llm import describe_provider_failure
from multi_agent.agents.reviewer_agent.tools import submission_preflight
from multi_agent.agents.survey_agent.tools import survey_import
import pytest
from shared.errors import ApiError, ProviderFailure

_SRC_ROOT = Path(__file__).resolve().parents[1] / "src"
_ROUTES_DIR = _SRC_ROOT / "evix_api" / "routes"
_EVIX_API_DIR = _SRC_ROOT / "evix_api"

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_FORBIDDEN_BRACKETS_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f]")
_TRACE_OR_PATH_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://",
    re.IGNORECASE,
)
_SQL_OR_EXC_CLASS_RE = re.compile(
    r"\b(?:"
    r"SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM"
    r"|SQLAlchemyError|OperationalError|IntegrityError|ProgrammingError|DBAPIError|InterfaceError"
    r"|RequestValidationError|StarletteHTTPException|ValidationError|PydanticUserError"
    r"|RuntimeError|ValueError|KeyError|TypeError|AttributeError|IndexError|ZeroDivisionError"
    r"|FileNotFoundError|PermissionError|OSError|ConnectionRefusedError"
    r")\b",
    re.IGNORECASE,
)
_ROUTE_INTERNAL_JARGON_RE = re.compile(
    r"\b(?:ReAct|EpistemicGraph|RunLease|Last-Event-ID)\b|算子|沙盒",
    re.IGNORECASE,
)


def _assert_message_purity(message: str, location: str, *, strict_route: bool = False) -> None:
    assert isinstance(message, str) and message.strip(), f"{location}: empty ApiError message"
    assert _CJK_RE.search(message), f"{location}: ApiError message lacks Chinese text: {message!r}"
    assert not _FORBIDDEN_BRACKETS_RE.search(message), (
        f"{location}: ApiError message contains forbidden brackets: {message!r}"
    )
    assert not _TRACE_OR_PATH_RE.search(message), (
        f"{location}: ApiError message leaks stack trace, physical path, or DB URI: {message!r}"
    )
    assert not _SQL_OR_EXC_CLASS_RE.search(message), (
        f"{location}: ApiError message leaks SQL or Python exception class name: {message!r}"
    )
    if strict_route:
        assert not _ROUTE_INTERNAL_JARGON_RE.search(message), (
            f"{location}: route ApiError message leaks internal protocol jargon: {message!r}"
        )


def _extract_api_error_msg_expr(call_node: ast.Call) -> ast.expr | None:
    for kw in call_node.keywords:
        if kw.arg == "message":
            return kw.value
    if len(call_node.args) >= 3:
        return call_node.args[2]
    return None


def _static_string_from_expr(expr: ast.expr) -> str | None:
    if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
        return expr.value
    if isinstance(expr, ast.JoinedStr):
        return "".join(
            part.value
            for part in expr.values
            if isinstance(part, ast.Constant) and isinstance(part.value, str)
        )
    return None


def test_purity_validator_catches_synthetic_violations():
    _assert_message_purity("请求内容不符合要求，请核对后重试。", "synthetic-valid", strict_route=True)
    for bad_msg in (
        "Invalid request payload",
        "请求参数「格式」无效。",
        "参数【缺失】请重试。",
        "读取失败 C:/Users/admin/secret.json",
        "数据库异常 postgresql://user:pw@127.0.0.1:5432/evix",
        "查询失败 SELECT id FROM users",
        "转换失败 ValueError: bad int",
        "执行异常 OperationalError",
    ):
        with pytest.raises(AssertionError):
            _assert_message_purity(bad_msg, "synthetic-bad", strict_route=True)


def test_all_evix_api_routes_and_http_boundary_api_errors_are_pure():
    route_files = sorted(_ROUTES_DIR.glob("*.py"))
    assert len(route_files) >= 20, "expected full evix_api/routes/*.py inventory"

    # Default ApiError() fallback used by 0-arg / 2-arg ApiError raises
    _assert_message_purity(ApiError().message, "shared/errors.py:ApiError.default", strict_route=True)

    route_explicit_count = 0
    for py_file in sorted(_EVIX_API_DIR.rglob("*.py")):
        rel = py_file.relative_to(_SRC_ROOT).as_posix()
        is_route_module = py_file.parent == _ROUTES_DIR
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "ApiError":
                msg_expr = _extract_api_error_msg_expr(node)
                if msg_expr is None:
                    continue
                txt = _static_string_from_expr(msg_expr)
                if txt is None:
                    continue
                if is_route_module:
                    route_explicit_count += 1
                _assert_message_purity(txt, f"{rel}:{node.lineno}", strict_route=is_route_module)

    assert route_explicit_count >= 14


def test_all_backend_service_and_domain_static_api_error_messages_are_pure():
    checked_count = 0
    for py_file in sorted(_SRC_ROOT.rglob("*.py")):
        rel = py_file.relative_to(_SRC_ROOT).as_posix()
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "ApiError":
                msg_expr = _extract_api_error_msg_expr(node)
                if msg_expr is None:
                    continue
                txt = _static_string_from_expr(msg_expr)
                if txt is None:
                    continue
                checked_count += 1
                _assert_message_purity(txt, f"{rel}:{node.lineno}")

    assert checked_count >= 350


def test_dynamic_error_catalogs_and_provider_failure_messages_are_pure():
    assert survey_import.MESSAGES and submission_preflight.MESSAGES
    for code, msg in survey_import.MESSAGES.items():
        _assert_message_purity(msg, f"survey_import.MESSAGES[{code!r}]")
    for code, msg in submission_preflight.MESSAGES.items():
        _assert_message_purity(msg, f"submission_preflight.MESSAGES[{code!r}]")

    provider_codes = (
        "provider_unavailable",
        "invalid_proposal",
        "input_too_large",
        "redirect_blocked",
        "authentication_failed",
        "rate_limited",
        "provider_rejected",
        "invalid_response",
        "response_too_large",
        "provider_timeout",
        "provider_failure",
    )
    for code in provider_codes:
        desc = describe_provider_failure(ProviderFailure(code))
        _assert_message_purity(desc, f"describe_provider_failure({code!r})", strict_route=True)
