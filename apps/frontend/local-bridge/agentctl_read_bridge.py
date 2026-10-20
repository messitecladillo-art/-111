#!/usr/bin/env python3
"""Loopback-only, read-only adapter for the Zhengda Cup agent control plane.

The browser can name a configured alias, but it can never submit a path,
command, working directory, or arbitrary argv. Raw agentctl output is treated as
sensitive and is rebuilt into a small allowlisted response before it reaches
the browser.
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, BinaryIO, Mapping, Optional, Sequence


BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 8765
SCHEMA_VERSION = "1.0.0"
AUTHORITY = "agentctl_read_only"
ALIAS_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
READ_COMMANDS = ("status", "next", "doctor")
GATE_NAMES = (
    "rule",
    "problem",
    "design",
    "fieldwork",
    "data",
    "inference",
    "action",
    "visual",
    "submission",
)
GATE_VALUES = {"not_run", "running", "pass", "warning", "fail", "unknown", "stale"}
ACCEPTED_GATE_VALUES = {"pass", "warning"}
DOCTOR_CHECKS = {
    "contracts",
    "dependency_pyyaml",
    "dependency_jsonschema",
    "project_schema",
    "state_schema",
    "project_id_match",
    "status_mirror",
    "recovery_state",
    "runtime_config",
    "active_writer_lock",
    "stale_lock_audit_trail",
    "event_chain",
    "latest_checkpoint",
    "gate_result_files",
    "gate_fingerprints",
    "closed_manifest",
}
BASE_DOCTOR_CHECKS = DOCTOR_CHECKS - {"closed_manifest"}
ANCHOR_FILES = (
    "project.yaml",
    ".agent/state.json",
    ".agent/events.jsonl",
    ".agent/config.json",
)
MAX_CONFIG_BYTES = 64 * 1024
MAX_STDOUT_BYTES = 512 * 1024
MAX_STDERR_BYTES = 32 * 1024
MAX_RESPONSE_BYTES = 256 * 1024
MAX_HASH_FILE_BYTES = 64 * 1024 * 1024
MAX_TREE_ENTRIES = 50_000
MAX_HEADER_BYTES = 8 * 1024
MAX_REJECTED_BODY_BYTES = 8 * 1024
MAX_STRING = 400
MAX_LIST_ITEMS = 50
RATE_LIMIT_REQUESTS = 30
RATE_LIMIT_WINDOW_SECONDS = 60.0
MAX_SNAPSHOT_ATTEMPTS = 2
MAX_SNAPSHOT_WALL_SECONDS = 75.0


MATERIAL_LABELS = {
    "本届届次、组别、赛区、赛道与当前赛事阶段": ("competition_scope", "确认本届届次、组别、赛区、赛道与当前赛事阶段"),
    "本届官方通知及校赛/省赛细则的原文件或官方链接": ("official_notice", "补充本届官方通知及校赛或省赛细则原文件"),
    "报名、报告、PPT与答辩的官方截止时间": ("official_deadlines", "确认报名、报告、PPT 与答辩的官方截止时间"),
    "当前赛段是否匿名评审及其可见内容、文件名、元数据和隐藏层要求": ("anonymity_scope", "确认当前赛段的匿名评审范围与隐藏信息要求"),
    "匿名禁用词表：学校、团队、教师、学生、企业及其他可识别名称": ("anonymity_terms", "补齐匿名禁用词表"),
    "企业命题书或拟研究的真实决策问题、目标人群和预期行动": ("decision_problem", "补充真实决策问题、目标人群与预期行动"),
    "已有报告、问卷、访谈、原始数据、分析代码和PPT（保留原始版本）": ("existing_artifacts", "盘点已有报告、问卷、访谈、数据、代码与 PPT"),
    "真实数据来源、采集授权/知情同意与可接触样本资源": ("data_governance", "确认数据来源、授权、知情同意与可接触样本资源"),
    "团队成员分工、方法能力、可投入时间与需由谁作最终决策": ("team_capacity", "确认团队分工、方法能力、时间与最终决策人"),
}
SAFE_PARALLEL_LABELS = {
    "盘点并哈希现有材料，不把未核验文件当作证据": "盘点并核验现有材料，不把未确认文件当作证据",
    "建立团队任务、review 与 blocker 台账": "建立团队任务、评审与阻塞台账",
    "检索并锁定适用官方规则来源": "检索并锁定适用的官方规则来源",
    "把决策问题、目标人群和可获得证据写成待确认清单": "整理决策问题、目标人群与可获得证据的待确认清单",
}


class BridgeError(Exception):
    """A browser-safe failure with no raw project or runtime details."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        details: Optional[Mapping[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.status = int(status)
        self.code = code
        self.message = message
        self.details = dict(details or {})


@dataclasses.dataclass(frozen=True)
class RuntimeContract:
    workflow_version: str
    workflow_sha256: str
    gates_version: str
    gates_sha256: str
    stages: tuple[str, ...]
    transitions: tuple[Mapping[str, Any], ...]


@dataclasses.dataclass(frozen=True)
class BridgeConfig:
    config_path: Path
    projects_root: Path
    projects: Mapping[str, str]
    allowed_origins: tuple[str, ...]
    agentctl_path: Path
    runtime_contract: RuntimeContract

    @classmethod
    def load(
        cls,
        config_path: Path,
        *,
        agentctl_path: Optional[Path] = None,
    ) -> "BridgeConfig":
        config_path = _absolute_lexical(config_path)
        _reject_reparse_chain(config_path)
        if not config_path.is_file():
            raise BridgeError(422, "config_invalid", "本机桥接配置文件不存在。")
        if config_path.stat().st_size > MAX_CONFIG_BYTES:
            raise BridgeError(422, "config_invalid", "本机桥接配置文件过大。")
        try:
            payload = json.loads(config_path.read_text(encoding="utf-8-sig"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise BridgeError(422, "config_invalid", "本机桥接配置不是有效的 UTF-8 JSON。") from exc
        if not isinstance(payload, dict):
            raise BridgeError(422, "config_invalid", "本机桥接配置必须是一个 JSON 对象。")
        allowed_keys = {"schemaVersion", "projectsRoot", "projects", "allowedOrigins"}
        if set(payload) != allowed_keys or payload.get("schemaVersion") != SCHEMA_VERSION:
            raise BridgeError(422, "config_invalid", "本机桥接配置字段或版本不正确。")

        root_value = payload.get("projectsRoot")
        if not isinstance(root_value, str) or not root_value.strip():
            raise BridgeError(422, "config_invalid", "projectsRoot 必须是明确的目录。")
        root_candidate = Path(root_value.strip())
        if not root_candidate.is_absolute():
            root_candidate = config_path.parent / root_candidate
        projects_root = _absolute_lexical(root_candidate)
        if _is_unc_path(projects_root):
            raise BridgeError(422, "config_invalid", "项目根目录不能位于网络共享路径。")
        _reject_reparse_chain(projects_root)
        if not projects_root.is_dir():
            raise BridgeError(422, "config_invalid", "项目根目录不存在或不是目录。")
        projects_root = projects_root.resolve(strict=True)

        raw_projects = payload.get("projects")
        if not isinstance(raw_projects, dict) or len(raw_projects) > 64:
            raise BridgeError(422, "config_invalid", "projects 必须是最多 64 项的别名映射。")
        projects: dict[str, str] = {}
        seen_casefold: set[str] = set()
        for alias, relative_value in raw_projects.items():
            if not isinstance(alias, str) or not ALIAS_PATTERN.fullmatch(alias):
                raise BridgeError(422, "config_invalid", "项目别名只能使用小写字母、数字、下划线或连字符。")
            folded = alias.casefold()
            if folded in seen_casefold:
                raise BridgeError(422, "config_invalid", "项目别名存在大小写歧义。")
            seen_casefold.add(folded)
            if not isinstance(relative_value, str) or not relative_value.strip():
                raise BridgeError(422, "config_invalid", "每个项目别名必须映射到相对目录。")
            relative = Path(relative_value.strip())
            if relative.is_absolute() or relative.drive or any(part in {"", ".", ".."} for part in relative.parts):
                raise BridgeError(422, "config_invalid", "项目映射必须是根目录内的规范相对路径。")
            projects[alias] = relative.as_posix()

        raw_origins = payload.get("allowedOrigins")
        if not isinstance(raw_origins, list) or not (1 <= len(raw_origins) <= 16):
            raise BridgeError(422, "config_invalid", "allowedOrigins 必须列出 1 至 16 个本机页面来源。")
        origins: list[str] = []
        for raw_origin in raw_origins:
            if not isinstance(raw_origin, str):
                raise BridgeError(422, "config_invalid", "页面来源必须是字符串。")
            origin = _validate_loopback_origin(raw_origin)
            if origin in origins:
                raise BridgeError(422, "config_invalid", "页面来源不能重复。")
            origins.append(origin)

        if agentctl_path is None:
            workspace_root = Path(__file__).resolve().parents[3]
            agentctl_path = workspace_root / "skill" / "zhengda-cup-champion" / "scripts" / "agentctl.py"
        agentctl_path = _absolute_lexical(agentctl_path)
        _reject_reparse_chain(agentctl_path)
        if not agentctl_path.is_file():
            raise BridgeError(422, "runtime_unavailable", "未找到受信任的本地证据控制程序。")
        agentctl_path = agentctl_path.resolve(strict=True)
        runtime_contract = _load_runtime_contract(agentctl_path)

        config = cls(
            config_path=config_path,
            projects_root=projects_root,
            projects=projects,
            allowed_origins=tuple(origins),
            agentctl_path=agentctl_path,
            runtime_contract=runtime_contract,
        )
        for alias in projects:
            config.resolve_project(alias)
        return config

    def resolve_project(self, alias: str, *, deadline: Optional[float] = None) -> Path:
        _ensure_snapshot_deadline(deadline)
        if not ALIAS_PATTERN.fullmatch(alias) or alias not in self.projects:
            raise BridgeError(404, "project_unavailable", "该项目未获本机桥接授权。")
        relative = Path(self.projects[alias])
        candidate = _absolute_lexical(self.projects_root / relative)
        _reject_reparse_chain(self.projects_root)
        _reject_reparse_chain(candidate)
        try:
            resolved = candidate.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise BridgeError(404, "project_unavailable", "授权项目目录当前不可用。") from exc
        try:
            common = os.path.commonpath((os.path.normcase(str(self.projects_root)), os.path.normcase(str(resolved))))
        except ValueError as exc:
            raise BridgeError(422, "project_invalid", "授权项目目录不在限定根目录内。") from exc
        if common != os.path.normcase(str(self.projects_root)):
            raise BridgeError(422, "project_invalid", "授权项目目录不在限定根目录内。")
        _ensure_snapshot_deadline(deadline)
        required = (resolved / "project.yaml", resolved / ".agent" / "state.json")
        for item in required:
            _ensure_snapshot_deadline(deadline)
            _reject_reparse_chain(item)
            if not item.is_file():
                raise BridgeError(422, "project_not_initialized", "该目录尚未初始化为可读取的正大杯项目。")
        _scan_reparse_tree(resolved, deadline=deadline)
        _ensure_snapshot_deadline(deadline)
        return resolved


@dataclasses.dataclass(frozen=True)
class CliResult:
    command: str
    return_code: int
    stdout_bytes: int
    payload: Mapping[str, Any]


class AgentctlRunner:
    def __init__(
        self,
        config: BridgeConfig,
        *,
        python_executable: Optional[Path] = None,
        status_timeout: float = 8.0,
        doctor_timeout: float = 15.0,
    ) -> None:
        self.config = config
        python_candidate = _absolute_lexical(Path(python_executable or sys.executable))
        if _is_unc_path(python_candidate):
            raise BridgeError(422, "runtime_unavailable", "Python 运行时不能位于网络共享路径。")
        _reject_reparse_chain(python_candidate)
        if not python_candidate.is_file():
            raise BridgeError(422, "runtime_unavailable", "Python 运行时不可用。")
        self.python_executable = python_candidate.resolve(strict=True)
        self.status_timeout = status_timeout
        self.doctor_timeout = doctor_timeout

    def invoke(self, alias: str, command: str, *, deadline: Optional[float] = None) -> CliResult:
        if command not in READ_COMMANDS:
            raise BridgeError(400, "action_forbidden", "本机桥接只允许读取状态。")
        project = self.config.resolve_project(alias, deadline=deadline)
        _ensure_snapshot_deadline(deadline)
        timeout = self.doctor_timeout if command == "doctor" else self.status_timeout
        if deadline is not None:
            timeout = min(timeout, max(0.0, deadline - time.monotonic()))
        if timeout <= 0:
            raise BridgeError(504, "snapshot_timeout", "本机权威快照超过总读取时限。")
        argv = [
            str(self.python_executable),
            "-E",
            "-B",
            "-X",
            "utf8",
            str(self.config.agentctl_path),
            str(project),
            command,
        ]
        environment = _minimal_environment()
        try:
            process = subprocess.Popen(
                argv,
                cwd=str(self.config.agentctl_path.parent),
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except OSError as exc:
            raise BridgeError(502, "runner_unavailable", "本地证据控制程序无法启动。") from exc
        stdout, stderr = _communicate_bounded(process, timeout=timeout)
        del stderr
        try:
            decoded = stdout.decode("utf-8-sig", errors="strict")
            payload = json.loads(decoded)
        except (UnicodeError, json.JSONDecodeError) as exc:
            raise BridgeError(502, "runner_invalid_output", "本地证据控制程序返回了无效结果。") from exc
        if not isinstance(payload, dict):
            raise BridgeError(502, "runner_invalid_output", "本地证据控制程序结果结构无效。")
        declared_exit = payload.get("exit_code")
        if not isinstance(declared_exit, int) or declared_exit != process.returncode:
            raise BridgeError(502, "runner_invalid_output", "本地证据控制程序退出状态不一致。")
        return CliResult(
            command=command,
            return_code=process.returncode,
            stdout_bytes=len(stdout),
            payload=payload,
        )


class RateLimiter:
    def __init__(self, limit: int = RATE_LIMIT_REQUESTS, window: float = RATE_LIMIT_WINDOW_SECONDS) -> None:
        self.limit = limit
        self.window = window
        self._timestamps: collections.deque[float] = collections.deque()
        self._lock = threading.Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._timestamps and now - self._timestamps[0] >= self.window:
                self._timestamps.popleft()
            if len(self._timestamps) >= self.limit:
                return False
            self._timestamps.append(now)
            return True


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(
        self,
        server_address: tuple[str, int],
        config: BridgeConfig,
        token: str,
        runner: Optional[AgentctlRunner] = None,
    ) -> None:
        if server_address[0] != BRIDGE_HOST:
            raise BridgeError(422, "bind_forbidden", "本机桥接只能绑定 127.0.0.1。")
        self.config = config
        self.token = token
        self.runner = runner or AgentctlRunner(config)
        self.rate_limiter = RateLimiter()
        self.snapshot_slots = threading.BoundedSemaphore(1)
        super().__init__(server_address, BridgeHandler)


class BridgeHandler(BaseHTTPRequestHandler):
    server: BridgeServer
    server_version = "EviXLocalBridge/1"
    sys_version = ""

    def log_message(self, format_string: str, *args: object) -> None:
        # Deliberately suppress raw request logging; it can contain authorization data.
        del format_string, args

    def do_OPTIONS(self) -> None:  # noqa: N802
        request_id = str(uuid.uuid4())
        try:
            origin = self._validate_network_request(require_token=False)
            requested_method = self.headers.get("Access-Control-Request-Method", "")
            requested_headers = {
                item.strip().lower()
                for item in self.headers.get("Access-Control-Request-Headers", "").split(",")
                if item.strip()
            }
            if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
                raise BridgeError(403, "private_network_request_forbidden", "云端页面不能连接本机桥接。")
            if requested_method != "GET" or not requested_headers.issubset({"authorization", "accept"}):
                raise BridgeError(400, "invalid_preflight", "本机桥接预检请求无效。")
            self.send_response(HTTPStatus.NO_CONTENT)
            self._send_security_headers(origin)
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Accept")
            self.send_header("Access-Control-Max-Age", "300")
            self.send_header("Content-Length", "0")
            self.end_headers()
        except BridgeError as exc:
            self._send_error(exc, request_id=request_id)

    def do_GET(self) -> None:  # noqa: N802
        request_id = str(uuid.uuid4())
        origin: Optional[str] = None
        acquired = False
        try:
            origin = self._validate_network_request(require_token=False)
            self._validate_token()
            if not self.server.rate_limiter.allow():
                raise BridgeError(429, "rate_limited", "读取过于频繁，请稍后再试。")
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.query or parsed.fragment:
                raise BridgeError(400, "invalid_request", "本机桥接不接受查询参数。")
            if parsed.path == "/v1/projects":
                self._send_json(
                    200,
                    {
                        "schemaVersion": SCHEMA_VERSION,
                        "authority": AUTHORITY,
                        "projects": [{"alias": alias} for alias in sorted(self.server.config.projects)],
                    },
                    request_id=request_id,
                    origin=origin,
                )
                return
            match = re.fullmatch(r"/v1/projects/([^/]+)/snapshot", parsed.path)
            if not match:
                raise BridgeError(404, "not_found", "本机桥接没有该读取接口。")
            try:
                alias = urllib.parse.unquote(match.group(1), encoding="utf-8", errors="strict")
            except UnicodeError as exc:
                raise BridgeError(400, "invalid_request", "项目别名编码无效。") from exc
            if not ALIAS_PATTERN.fullmatch(alias):
                raise BridgeError(404, "project_unavailable", "该项目未获本机桥接授权。")
            acquired = self.server.snapshot_slots.acquire(blocking=False)
            if not acquired:
                raise BridgeError(429, "bridge_busy", "本机桥接正在读取另一个快照，请稍后再试。")
            snapshot = build_snapshot(self.server.config, self.server.runner, alias)
            self._send_json(200, snapshot, request_id=request_id, origin=origin)
        except BridgeError as exc:
            self._send_error(exc, request_id=request_id, origin=origin)
        except Exception:
            self._send_error(
                BridgeError(500, "bridge_internal_error", "本机桥接发生未分类错误。"),
                request_id=request_id,
                origin=origin,
            )
        finally:
            if acquired:
                self.server.snapshot_slots.release()

    def _reject_write_method(self) -> None:
        request_id = str(uuid.uuid4())
        origin: Optional[str] = None
        try:
            origin = self._validate_network_request(require_token=False)
            self._validate_token()
            self._discard_small_rejected_body()
            raise BridgeError(405, "method_not_allowed", "本机桥接仅提供只读 GET 接口。")
        except BridgeError as exc:
            self._send_error(exc, request_id=request_id, origin=origin)

    do_POST = _reject_write_method  # type: ignore[assignment]
    do_PUT = _reject_write_method  # type: ignore[assignment]
    do_PATCH = _reject_write_method  # type: ignore[assignment]
    do_DELETE = _reject_write_method  # type: ignore[assignment]
    do_HEAD = _reject_write_method  # type: ignore[assignment]

    def _validate_network_request(self, *, require_token: bool) -> str:
        header_size = sum(len(key) + len(value) + 4 for key, value in self.headers.items())
        if header_size > MAX_HEADER_BYTES:
            raise BridgeError(431, "headers_too_large", "请求头过大。")
        required_once = ("Host", "Origin") + (("Authorization",) if require_token else ())
        if any(len(self.headers.get_all(name, [])) != 1 for name in required_once):
            raise BridgeError(400, "ambiguous_headers", "请求包含缺失或重复的安全标头。")
        if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
            raise BridgeError(403, "private_network_request_forbidden", "云端页面不能连接本机桥接。")
        host = self.headers.get("Host", "")
        parsed_host = urllib.parse.urlsplit("//" + host)
        expected_port = self.server.server_address[1]
        try:
            port = parsed_host.port
        except ValueError as exc:
            raise BridgeError(421, "host_forbidden", "请求目标不是本机桥接。") from exc
        if parsed_host.hostname != BRIDGE_HOST or port != expected_port:
            raise BridgeError(421, "host_forbidden", "请求目标不是本机桥接。")
        origin_raw = self.headers.get("Origin")
        if not origin_raw:
            raise BridgeError(403, "origin_forbidden", "仅允许已登记的本机页面访问。")
        origin = _validate_loopback_origin(origin_raw)
        if origin not in self.server.config.allowed_origins:
            raise BridgeError(403, "origin_forbidden", "仅允许已登记的本机页面访问。")
        if require_token:
            self._validate_token()
        return origin

    def _validate_token(self) -> None:
        if len(self.headers.get_all("Authorization", [])) != 1:
            raise BridgeError(400, "ambiguous_headers", "请求包含缺失或重复的安全标头。")
        auth = self.headers.get("Authorization", "")
        expected = "Bearer " + self.server.token
        if not hmac.compare_digest(auth.encode("utf-8", errors="ignore"), expected.encode("utf-8")):
            raise BridgeError(401, "unauthorized", "连接口令无效。")

    def _discard_small_rejected_body(self) -> None:
        if self.headers.get("Transfer-Encoding") is not None:
            self.close_connection = True
            raise BridgeError(400, "invalid_request", "本机桥接不接受流式请求体。")
        raw_lengths = self.headers.get_all("Content-Length", [])
        if not raw_lengths:
            return
        if len(raw_lengths) != 1:
            self.close_connection = True
            raise BridgeError(400, "ambiguous_headers", "请求包含重复的长度标头。")
        try:
            length = int(raw_lengths[0])
        except ValueError as exc:
            self.close_connection = True
            raise BridgeError(400, "invalid_request", "请求体长度无效。") from exc
        if length < 0 or length > MAX_REJECTED_BODY_BYTES:
            self.close_connection = True
            raise BridgeError(413, "request_too_large", "写入请求体超过拒绝接口的安全上限。")
        if length:
            try:
                body = self.rfile.read(length)
            except OSError as exc:
                self.close_connection = True
                raise BridgeError(400, "invalid_request", "请求体未完整接收。") from exc
            if len(body) != length:
                self.close_connection = True
                raise BridgeError(400, "invalid_request", "请求体未完整接收。")

    def _send_security_headers(self, origin: Optional[str]) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Pragma", "no-cache")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Vary", "Origin")
        if origin is not None and origin in self.server.config.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)

    def _send_json(
        self,
        status: int,
        payload: Mapping[str, Any],
        *,
        request_id: str,
        origin: Optional[str],
    ) -> None:
        body_payload = dict(payload)
        body_payload["requestId"] = request_id
        body = json.dumps(body_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(body) > MAX_RESPONSE_BYTES:
            raise BridgeError(502, "response_too_large", "安全摘要超过允许大小。")
        self.send_response(status)
        self._send_security_headers(origin)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(
        self,
        error: BridgeError,
        *,
        request_id: str,
        origin: Optional[str] = None,
    ) -> None:
        payload: dict[str, Any] = {
            "schemaVersion": SCHEMA_VERSION,
            "error": {"code": error.code, "message": error.message},
        }
        if error.details:
            payload["error"]["details"] = error.details
        try:
            self._send_json(error.status, payload, request_id=request_id, origin=origin)
        except (BrokenPipeError, ConnectionResetError):
            return


def build_snapshot(config: BridgeConfig, runner: AgentctlRunner, alias: str) -> Mapping[str, Any]:
    """Read a coherent status/next/doctor snapshot without mutating the project."""
    last_consistency_error: Optional[BridgeError] = None
    deadline = time.monotonic() + MAX_SNAPSHOT_WALL_SECONDS
    for attempt in range(MAX_SNAPSHOT_ATTEMPTS):
        _ensure_snapshot_deadline(deadline)
        _assert_runtime_contract_current(config)
        _ensure_snapshot_deadline(deadline)
        project = config.resolve_project(alias, deadline=deadline)
        _ensure_snapshot_deadline(deadline)
        before = _project_anchor(project, deadline=deadline)
        _ensure_snapshot_deadline(deadline)
        status_result = _invoke_snapshot_command(runner, alias, "status", deadline)
        next_result = _invoke_snapshot_command(runner, alias, "next", deadline)
        doctor_result = _invoke_snapshot_command(runner, alias, "doctor", deadline)
        project = config.resolve_project(alias, deadline=deadline)
        _ensure_snapshot_deadline(deadline)
        after = _project_anchor(project, deadline=deadline)
        _assert_runtime_contract_current(config)
        _ensure_snapshot_deadline(deadline)
        if before != after:
            last_consistency_error = BridgeError(
                409,
                "concurrent_change",
                "读取期间项目状态发生变化，未返回混合快照。",
            )
            if attempt == 0:
                continue
            raise last_consistency_error

        status_payload = _require_successful_read(status_result, expected_command="status", doctor=doctor_result)
        next_payload = _require_successful_read(next_result, expected_command="next", doctor=doctor_result)
        doctor_payload = _require_doctor_result(doctor_result)
        anchors = [_result_anchor(item) for item in (status_payload, next_payload, doctor_payload)]
        if not (anchors[0] == anchors[1] == anchors[2]):
            last_consistency_error = BridgeError(
                409,
                "state_changed_during_read",
                "读取期间项目状态发生变化，未拼接新旧结果。",
            )
            if attempt == 0:
                continue
            raise last_consistency_error
        return _sanitize_snapshot(config, alias, status_payload, next_payload, doctor_payload)
    raise last_consistency_error or BridgeError(409, "state_changed_during_read", "读取期间项目状态发生变化。")


def _invoke_snapshot_command(
    runner: AgentctlRunner,
    alias: str,
    command: str,
    deadline: float,
) -> CliResult:
    _ensure_snapshot_deadline(deadline)
    if isinstance(runner, AgentctlRunner):
        result = runner.invoke(alias, command, deadline=deadline)
    else:
        result = runner.invoke(alias, command)
    _ensure_snapshot_deadline(deadline)
    return result


def _ensure_snapshot_deadline(deadline: Optional[float]) -> None:
    if deadline is not None and time.monotonic() >= deadline:
        raise BridgeError(504, "snapshot_timeout", "本机权威快照超过总读取时限。")


def _require_successful_read(
    result: CliResult,
    *,
    expected_command: str,
    doctor: CliResult,
) -> Mapping[str, Any]:
    payload = result.payload
    if (
        result.return_code == 0
        and payload.get("exit_code") == 0
        and payload.get("command") == expected_command
        and payload.get("failure") is None
    ):
        return payload
    failure = payload.get("failure") if isinstance(payload.get("failure"), dict) else {}
    code = failure.get("code") if isinstance(failure.get("code"), str) else "read_failed"
    doctor_payload = doctor.payload if isinstance(doctor.payload, dict) else {}
    safe_failed_checks = _failed_check_names(doctor_payload)
    status = 409 if result.return_code == 5 or code == "state_conflict" else 422
    raise BridgeError(
        status,
        "agentctl_state_conflict" if status == 409 else "project_invalid",
        "本机权威状态暂时无法安全读取。",
        details={"failedChecks": safe_failed_checks},
    )


def _require_doctor_result(result: CliResult) -> Mapping[str, Any]:
    payload = result.payload
    if (
        payload.get("command") != "doctor"
        or not isinstance(payload.get("healthy"), bool)
        or not isinstance(payload.get("exit_code"), int)
        or isinstance(payload.get("exit_code"), bool)
        or payload.get("exit_code") != result.return_code
    ):
        raise BridgeError(422, "project_invalid", "本机项目体检结果不可用。")
    return payload


def _result_anchor(payload: Mapping[str, Any]) -> tuple[Any, ...]:
    event_stream = payload.get("event_stream")
    if not isinstance(event_stream, dict):
        raise BridgeError(502, "runner_invalid_output", "本机状态缺少一致性锚点。")
    gates = _validated_gates(payload.get("gates"))
    return (
        _bounded_string(payload.get("project_id"), "project_id", allow_empty=False, max_length=160),
        _bounded_string(payload.get("status_after"), "status_after", allow_empty=False, max_length=64),
        _bounded_int(payload.get("status_revision"), "status_revision", minimum=0),
        tuple((gate, gates[gate]) for gate in GATE_NAMES),
        payload.get("checkpoint_id"),
        _bounded_int(event_stream.get("last_sequence"), "last_sequence", minimum=0),
        _bounded_sha256(event_stream.get("stream_sha256"), "stream_sha256", allow_empty=True),
    )


def _sanitize_snapshot(
    config: BridgeConfig,
    alias: str,
    status_payload: Mapping[str, Any],
    next_payload: Mapping[str, Any],
    doctor_payload: Mapping[str, Any],
) -> Mapping[str, Any]:
    contract = config.runtime_contract
    control_status = _bounded_string(status_payload.get("status_after"), "control_status", allow_empty=False, max_length=64)
    if control_status not in contract.stages:
        raise BridgeError(502, "runner_contract_mismatch", "本机状态不属于受信任控制契约。")
    gates = _validated_gates(status_payload.get("gates"))
    blocking = _validated_gate_list(status_payload.get("blocking_gates"), "blocking_gates")
    transition = _sanitize_transition(status_payload.get("next_transition"), contract)
    materials, needs_local_review = _sanitize_materials(status_payload.get("materials_needed"))
    safe_parallel = _sanitize_safe_parallel(status_payload.get("safe_parallel_work"))
    next_action = _sanitize_next_action(next_payload.get("recommended"), contract)
    doctor_checks = _sanitize_doctor_checks(doctor_payload.get("checks"))
    failed_checks = [item["name"] for item in doctor_checks if not item["passed"]]
    expected_doctor_checks = DOCTOR_CHECKS if control_status == "closed" else BASE_DOCTOR_CHECKS
    if {item["name"] for item in doctor_checks} != expected_doctor_checks:
        raise BridgeError(502, "runner_contract_mismatch", "项目体检缺少当前阶段要求的检查项。")
    blocker_summary = _count_blockers(status_payload.get("unresolved_blockers"))
    risk_summary = _count_risks(status_payload.get("unresolved_risks"))
    inventory_summary = _count_inventory(status_payload.get("takeover_inventory"))
    expected_blocking = [] if transition is None else [
        gate for gate in transition["requiredGates"]
        if gates[gate] not in ACCEPTED_GATE_VALUES
    ]
    if blocking != expected_blocking:
        raise BridgeError(502, "runner_contract_mismatch", "阻断 Gate 与当前 Gate 结果不一致。")
    if transition is not None and transition["from"] != control_status:
        raise BridgeError(502, "runner_contract_mismatch", "下一转换与当前控制状态不一致。")
    _validate_next_action_consistency(
        next_action=next_action,
        transition=transition,
        blocking=blocking,
        control_status=control_status,
    )
    doctor_healthy = doctor_payload.get("healthy")
    doctor_exit_code = _bounded_int(doctor_payload.get("exit_code"), "doctor.exit_code", minimum=0, maximum=5)
    if doctor_exit_code not in {0, 2, 5}:
        raise BridgeError(502, "runner_contract_mismatch", "项目体检退出状态不属于受信任契约。")
    if doctor_healthy is not (doctor_exit_code == 0 and not failed_checks):
        raise BridgeError(502, "runner_contract_mismatch", "项目体检健康状态与检查项不一致。")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "authority": AUTHORITY,
        "readOnly": True,
        "projectAlias": alias,
        "projectId": _bounded_string(status_payload.get("project_id"), "project_id", allow_empty=False, max_length=160),
        "observedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "consistent": True,
        "contract": {
            "workflowVersion": contract.workflow_version,
            "workflowSha256": contract.workflow_sha256,
            "gatesVersion": contract.gates_version,
            "gatesSha256": contract.gates_sha256,
        },
        "status": {
            "controlStatus": control_status,
            "competitionStage": _bounded_string(status_payload.get("competition_stage"), "competition_stage", allow_empty=True, max_length=120) or "unknown",
            "statusRevision": _bounded_int(status_payload.get("status_revision"), "status_revision", minimum=0),
            "gates": gates,
            "blockingGates": blocking,
            "nextTransition": transition,
            "materialsNeeded": materials,
            "needsLocalMaterialReview": needs_local_review,
            "safeParallelWork": safe_parallel,
            "blockerSummary": blocker_summary,
            "riskSummary": risk_summary,
            "inventorySummary": inventory_summary,
        },
        "nextAction": next_action,
        "doctor": {
            "healthy": doctor_healthy,
            "exitCode": doctor_exit_code,
            "checks": doctor_checks,
            "failedChecks": failed_checks,
        },
        "redactions": [
            "project_absolute_path",
            "run_and_event_identifiers",
            "raw_command_text",
            "blocker_and_risk_text",
            "artifact_paths_and_hashes",
            "doctor_internal_details",
        ],
    }


def _sanitize_transition(value: Any, contract: RuntimeContract) -> Optional[Mapping[str, Any]]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise BridgeError(502, "runner_invalid_output", "下一状态结构无效。")
    source = _bounded_string(value.get("from"), "transition.from", allow_empty=False, max_length=64)
    target = _bounded_string(value.get("to"), "transition.to", allow_empty=False, max_length=64)
    matching = [item for item in contract.transitions if item.get("from") == source and item.get("to") == target]
    if len(matching) != 1:
        raise BridgeError(502, "runner_contract_mismatch", "下一状态不属于受信任控制契约。")
    canonical = matching[0]
    raw_gates = _validated_gate_list(value.get("required_gates"), "transition.required_gates")
    expected_gates = tuple(canonical.get("required_gates", []))
    if tuple(raw_gates) != expected_gates:
        raise BridgeError(502, "runner_contract_mismatch", "下一状态的 Gate 契约不一致。")
    artifacts = value.get("required_artifacts")
    if not isinstance(artifacts, list) or artifacts != canonical.get("required_artifacts", []):
        raise BridgeError(502, "runner_contract_mismatch", "下一状态的产物契约不一致。")
    return {
        "from": source,
        "to": target,
        "requiredGates": raw_gates,
        "requiredArtifacts": [_bounded_string(item, "required_artifact", allow_empty=False, max_length=160) for item in artifacts],
    }


def _sanitize_next_action(value: Any, contract: RuntimeContract) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise BridgeError(502, "runner_invalid_output", "首要下一步结构无效。")
    action = _bounded_string(value.get("action"), "next_action.action", allow_empty=False, max_length=32)
    if action not in {"resolve_gate", "advance", "closed"}:
        raise BridgeError(502, "runner_contract_mismatch", "首要下一步不属于只读契约。")
    result: dict[str, Any] = {"action": action}
    if action == "resolve_gate":
        gate = _bounded_string(value.get("gate"), "next_action.gate", allow_empty=False, max_length=32)
        if gate not in GATE_NAMES:
            raise BridgeError(502, "runner_contract_mismatch", "下一步 Gate 不属于控制契约。")
        result["gate"] = gate
        result["definitionOfDone"] = "为当前 Gate 补齐可复核证据，并在本机控制程序中重新判定。"
    if action == "advance":
        target = _bounded_string(value.get("to"), "next_action.to", allow_empty=False, max_length=64)
        if target not in contract.stages:
            raise BridgeError(502, "runner_contract_mismatch", "下一步状态不属于控制契约。")
        result["to"] = target
        result["definitionOfDone"] = "当前只读结果仅建议在本机尝试推进；最终是否允许推进，仍由 advance 的完整校验决定。"
    if action == "closed":
        result["definitionOfDone"] = "工作流已封存；仍应以最新体检和交接复验为准。"
    return result


def _sanitize_materials(value: Any) -> tuple[list[Mapping[str, str]], bool]:
    if not isinstance(value, list) or len(value) > MAX_LIST_ITEMS:
        raise BridgeError(502, "runner_invalid_output", "缺失材料清单结构无效。")
    materials: list[Mapping[str, str]] = []
    needs_local_review = False
    for item in value:
        if not isinstance(item, str) or len(item) > MAX_STRING:
            raise BridgeError(502, "runner_invalid_output", "缺失材料条目无效。")
        known = MATERIAL_LABELS.get(item)
        if known is None:
            needs_local_review = True
            continue
        code, label = known
        materials.append({"code": code, "label": label})
    if needs_local_review:
        materials.append({"code": "local_gate_evidence", "label": "请在本机证据控制程序中查看当前 Gate 的完整证据清单"})
    return materials, needs_local_review


def _sanitize_safe_parallel(value: Any) -> list[str]:
    if not isinstance(value, list) or len(value) > len(SAFE_PARALLEL_LABELS):
        raise BridgeError(502, "runner_invalid_output", "并行任务清单结构无效。")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or item not in SAFE_PARALLEL_LABELS:
            raise BridgeError(502, "runner_contract_mismatch", "并行任务条目不属于只读契约。")
        result.append(SAFE_PARALLEL_LABELS[item])
    return result


def _sanitize_doctor_checks(value: Any) -> list[Mapping[str, Any]]:
    if not isinstance(value, list) or not (1 <= len(value) <= len(DOCTOR_CHECKS)):
        raise BridgeError(502, "runner_invalid_output", "项目体检结构无效。")
    result: list[Mapping[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            raise BridgeError(502, "runner_invalid_output", "项目体检条目无效。")
        name = item.get("name")
        passed = item.get("passed")
        if name not in DOCTOR_CHECKS or name in seen or not isinstance(passed, bool):
            raise BridgeError(502, "runner_contract_mismatch", "项目体检项不属于受信任契约。")
        seen.add(name)
        result.append({"name": name, "passed": passed})
    return result


def _validate_next_action_consistency(
    *,
    next_action: Mapping[str, Any],
    transition: Optional[Mapping[str, Any]],
    blocking: Sequence[str],
    control_status: str,
) -> None:
    action = next_action["action"]
    if transition is None:
        if action != "closed" or blocking or control_status != "closed":
            raise BridgeError(502, "runner_contract_mismatch", "终态与下一动作不一致。")
        return
    if blocking:
        if action != "resolve_gate" or next_action.get("gate") != blocking[0]:
            raise BridgeError(502, "runner_contract_mismatch", "下一动作与首个阻断 Gate 不一致。")
        return
    if action != "advance" or next_action.get("to") != transition["to"]:
        raise BridgeError(502, "runner_contract_mismatch", "推进建议与下一转换不一致。")


def _failed_check_names(payload: Mapping[str, Any]) -> list[str]:
    try:
        return [item["name"] for item in _sanitize_doctor_checks(payload.get("checks")) if not item["passed"]]
    except BridgeError:
        return []


def _count_blockers(value: Any) -> Mapping[str, Any]:
    if not isinstance(value, list) or len(value) > 5_000:
        raise BridgeError(502, "runner_invalid_output", "阻塞项摘要结构无效。")
    counts = {severity: 0 for severity in ("fatal", "high", "medium", "low", "info")}
    for item in value:
        if not isinstance(item, dict):
            raise BridgeError(502, "runner_invalid_output", "阻塞项摘要结构无效。")
        severity = item.get("severity")
        if isinstance(severity, str) and severity.strip().lower() in counts:
            counts[severity.strip().lower()] += 1
        else:
            raise BridgeError(502, "runner_contract_mismatch", "阻塞项严重级别不属于受信任契约。")
    return {"total": len(value), "bySeverity": {key: count for key, count in counts.items() if count}}


def _count_risks(value: Any) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise BridgeError(502, "runner_invalid_output", "风险摘要结构无效。")
    if any(key not in {"fatal", "high", "medium"} for key in value):
        raise BridgeError(502, "runner_contract_mismatch", "风险摘要严重级别不属于受信任契约。")
    counts: dict[str, int] = {}
    total = 0
    for severity in ("fatal", "high", "medium"):
        items = value.get(severity, [])
        if not isinstance(items, list) or len(items) > 5_000:
            raise BridgeError(502, "runner_invalid_output", "风险摘要结构无效。")
        if items:
            counts[severity] = len(items)
            total += len(items)
    return {"total": total, "bySeverity": counts}


def _count_inventory(value: Any) -> Mapping[str, int]:
    if not isinstance(value, list) or len(value) > 5_000 or any(not isinstance(item, dict) for item in value):
        raise BridgeError(502, "runner_invalid_output", "材料盘点摘要结构无效。")
    return {"total": len(value)}


def _validated_gates(value: Any) -> Mapping[str, str]:
    if not isinstance(value, dict) or set(value) != set(GATE_NAMES):
        raise BridgeError(502, "runner_contract_mismatch", "Gate 集合与受信任控制契约不一致。")
    result: dict[str, str] = {}
    for gate in GATE_NAMES:
        status = value.get(gate)
        if status not in GATE_VALUES:
            raise BridgeError(502, "runner_contract_mismatch", "Gate 状态与受信任控制契约不一致。")
        result[gate] = str(status)
    return result


def _validated_gate_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or len(value) > len(GATE_NAMES):
        raise BridgeError(502, "runner_invalid_output", f"{field} 结构无效。")
    result: list[str] = []
    for item in value:
        if item not in GATE_NAMES or item in result:
            raise BridgeError(502, "runner_contract_mismatch", f"{field} 与控制契约不一致。")
        result.append(str(item))
    return result


def _bounded_string(value: Any, field: str, *, allow_empty: bool, max_length: int) -> str:
    if value is None and allow_empty:
        return ""
    if not isinstance(value, str):
        raise BridgeError(502, "runner_invalid_output", f"{field} 类型无效。")
    result = value.strip()
    if (not result and not allow_empty) or len(result) > max_length or any(ord(char) < 32 for char in result):
        raise BridgeError(502, "runner_invalid_output", f"{field} 内容无效。")
    return result


def _bounded_sha256(value: Any, field: str, *, allow_empty: bool) -> str:
    result = _bounded_string(value, field, allow_empty=allow_empty, max_length=64)
    if result or not allow_empty:
        if not re.fullmatch(r"[0-9a-f]{64}", result):
            raise BridgeError(502, "runner_invalid_output", f"{field} 摘要格式无效。")
    return result


def _bounded_int(value: Any, field: str, *, minimum: int, maximum: int = 2**31 - 1) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not (minimum <= value <= maximum):
        raise BridgeError(502, "runner_invalid_output", f"{field} 数值无效。")
    return value


def _load_runtime_contract(agentctl_path: Path) -> RuntimeContract:
    skill_root = agentctl_path.parent.parent
    workflow_path = skill_root / "assets" / "runtime" / "workflow.json"
    gates_path = skill_root / "assets" / "runtime" / "gates.json"
    for item in (workflow_path, gates_path):
        _reject_reparse_chain(item)
        if not item.is_file() or item.stat().st_size > 1024 * 1024:
            raise BridgeError(422, "runtime_unavailable", "本地控制契约不可读取。")
    workflow_raw = workflow_path.read_bytes()
    gates_raw = gates_path.read_bytes()
    try:
        workflow = json.loads(workflow_raw.decode("utf-8-sig"))
        gates = json.loads(gates_raw.decode("utf-8-sig"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise BridgeError(422, "runtime_unavailable", "本地控制契约格式无效。") from exc
    if not isinstance(workflow, dict) or not isinstance(gates, dict):
        raise BridgeError(422, "runtime_unavailable", "本地控制契约结构无效。")
    stages_raw = workflow.get("stages")
    transitions_raw = workflow.get("allowed_transitions")
    if not isinstance(stages_raw, list) or not isinstance(transitions_raw, list):
        raise BridgeError(422, "runtime_unavailable", "本地工作流契约缺少阶段或转换。")
    stages = tuple(item.get("id") for item in stages_raw if isinstance(item, dict) and isinstance(item.get("id"), str))
    if len(stages) != len(stages_raw) or len(stages) != len(set(stages)):
        raise BridgeError(422, "runtime_unavailable", "本地工作流阶段契约无效。")
    gate_ids = gates.get("gate_ids")
    if not isinstance(gate_ids, list) or tuple(gate_ids) != GATE_NAMES:
        raise BridgeError(422, "runtime_unavailable", "本地 Gate 契约与桥接版本不兼容。")
    transitions: list[Mapping[str, Any]] = []
    for item in transitions_raw:
        if not isinstance(item, dict):
            raise BridgeError(422, "runtime_unavailable", "本地状态转换契约无效。")
        transitions.append(dict(item))
    return RuntimeContract(
        workflow_version=_bounded_contract_string(workflow.get("version")),
        workflow_sha256=hashlib.sha256(workflow_raw).hexdigest(),
        gates_version=_bounded_contract_string(gates.get("version")),
        gates_sha256=hashlib.sha256(gates_raw).hexdigest(),
        stages=stages,
        transitions=tuple(transitions),
    )


def _assert_runtime_contract_current(config: BridgeConfig) -> None:
    current = _load_runtime_contract(config.agentctl_path)
    if current != config.runtime_contract:
        raise BridgeError(
            409,
            "runtime_contract_changed",
            "本地控制契约在桥接启动后发生变化，请重启本机只读桥接后再读取。",
        )


def _bounded_contract_string(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 64:
        raise BridgeError(422, "runtime_unavailable", "本地控制契约版本无效。")
    return value


def _project_anchor(project: Path, *, deadline: Optional[float] = None) -> Mapping[str, Optional[str]]:
    result: dict[str, Optional[str]] = {}
    for relative in ANCHOR_FILES:
        _ensure_snapshot_deadline(deadline)
        path = project / relative
        _reject_reparse_chain(path)
        if not path.exists():
            result[relative] = None
            continue
        if not path.is_file() or path.stat().st_size > MAX_HASH_FILE_BYTES:
            raise BridgeError(422, "project_invalid", "项目状态锚点不可安全读取。")
        result[relative] = _sha256_file(path, deadline=deadline)
    _ensure_snapshot_deadline(deadline)
    return result


def _sha256_file(path: Path, *, deadline: Optional[float] = None) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            _ensure_snapshot_deadline(deadline)
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _communicate_bounded(process: subprocess.Popen[bytes], *, timeout: float) -> tuple[bytes, bytes]:
    if process.stdout is None or process.stderr is None:
        process.kill()
        raise BridgeError(502, "runner_unavailable", "本地证据控制程序输出通道不可用。")
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    limits = {"stdout": MAX_STDOUT_BYTES, "stderr": MAX_STDERR_BYTES}
    overflow = threading.Event()
    lock = threading.Lock()

    def read_stream(name: str, stream: BinaryIO) -> None:
        try:
            while True:
                chunk = stream.read(8192)
                if not chunk:
                    return
                with lock:
                    remaining = limits[name] - len(buffers[name])
                    if remaining <= 0 or len(chunk) > remaining:
                        if remaining > 0:
                            buffers[name].extend(chunk[:remaining])
                        overflow.set()
                    else:
                        buffers[name].extend(chunk)
        finally:
            try:
                stream.close()
            except OSError:
                pass

    threads = [
        threading.Thread(target=read_stream, args=("stdout", process.stdout), daemon=True),
        threading.Thread(target=read_stream, args=("stderr", process.stderr), daemon=True),
    ]
    for thread in threads:
        thread.start()
    deadline = time.monotonic() + timeout
    timed_out = False
    while process.poll() is None:
        if overflow.is_set():
            _terminate_process(process)
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            timed_out = True
            _terminate_process(process)
            break
        try:
            process.wait(timeout=min(0.05, remaining))
        except subprocess.TimeoutExpired:
            continue
    for thread in threads:
        thread.join(timeout=1.0)
    if any(thread.is_alive() for thread in threads):
        _terminate_process(process)
        raise BridgeError(502, "runner_unavailable", "本机证据控制程序输出通道未正常关闭。")
    if timed_out:
        raise BridgeError(504, "runner_timeout", "本机证据控制程序读取超时。")
    if overflow.is_set():
        raise BridgeError(502, "runner_output_too_large", "本机证据控制程序输出超过安全上限。")
    return bytes(buffers["stdout"]), bytes(buffers["stderr"])


def _terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=1.0)
    except (OSError, subprocess.TimeoutExpired):
        try:
            process.kill()
            process.wait(timeout=1.0)
        except (OSError, subprocess.TimeoutExpired):
            pass


def _minimal_environment() -> Mapping[str, str]:
    # APPDATA/USERPROFILE are required for a Python installed with user-site
    # dependencies on Windows. PYTHONPATH and all agent fault-injection values
    # remain intentionally absent.
    allowed = (
        "SYSTEMROOT",
        "WINDIR",
        "TEMP",
        "TMP",
        "PATH",
        "PATHEXT",
        "COMSPEC",
        "APPDATA",
        "LOCALAPPDATA",
        "USERPROFILE",
    )
    environment = {key: os.environ[key] for key in allowed if key in os.environ}
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["NO_COLOR"] = "1"
    return environment


def _absolute_lexical(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def _is_unc_path(path: Path) -> bool:
    text = str(path)
    return text.startswith("\\\\") or text.startswith("//")


def _reject_reparse_chain(path: Path) -> None:
    absolute = _absolute_lexical(path)
    anchor = Path(absolute.anchor)
    current = anchor
    parts = absolute.parts[1:] if absolute.anchor else absolute.parts
    candidates = [anchor] if absolute.anchor else []
    for part in parts:
        current = current / part
        candidates.append(current)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    for candidate in candidates:
        if not os.path.lexists(str(candidate)):
            continue
        try:
            metadata = os.lstat(str(candidate))
        except OSError as exc:
            raise BridgeError(422, "path_unavailable", "本机项目路径无法安全检查。") from exc
        attributes = getattr(metadata, "st_file_attributes", 0)
        if stat.S_ISLNK(metadata.st_mode) or attributes & reparse_flag:
            raise BridgeError(422, "reparse_point_forbidden", "本机项目路径包含不允许的链接或重解析点。")


def _scan_reparse_tree(root: Path, *, deadline: Optional[float] = None) -> None:
    count = 0
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    pending = [root]
    while pending:
        _ensure_snapshot_deadline(deadline)
        directory = pending.pop()
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    _ensure_snapshot_deadline(deadline)
                    count += 1
                    if count > MAX_TREE_ENTRIES:
                        raise BridgeError(422, "project_tree_too_large", "项目文件数量超过本机桥接安全检查上限。")
                    try:
                        metadata = entry.stat(follow_symlinks=False)
                    except OSError as exc:
                        raise BridgeError(422, "path_unavailable", "项目文件无法安全检查。") from exc
                    attributes = getattr(metadata, "st_file_attributes", 0)
                    if entry.is_symlink() or attributes & reparse_flag:
                        raise BridgeError(422, "reparse_point_forbidden", "项目目录包含不允许的链接或重解析点。")
                    if entry.is_dir(follow_symlinks=False):
                        pending.append(Path(entry.path))
        except BridgeError:
            raise
        except OSError as exc:
            raise BridgeError(422, "path_unavailable", "项目目录无法安全扫描。") from exc
    _ensure_snapshot_deadline(deadline)


def _validate_loopback_origin(raw: str) -> str:
    if len(raw) > 200 or raw == "null" or "*" in raw:
        raise BridgeError(403, "origin_forbidden", "仅允许已登记的本机页面访问。")
    parsed = urllib.parse.urlsplit(raw)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"localhost", "127.0.0.1"}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise BridgeError(403, "origin_forbidden", "仅允许已登记的本机页面访问。")
    try:
        port = parsed.port
    except ValueError as exc:
        raise BridgeError(403, "origin_forbidden", "本机页面来源端口无效。") from exc
    if port is None or not (1 <= port <= 65535):
        raise BridgeError(403, "origin_forbidden", "本机页面来源必须包含明确端口。")
    return f"http://{parsed.hostname}:{port}"


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="EVI-X local read-only agentctl bridge")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).with_name("bridge.config.json"),
        help="Trusted local JSON config; browser requests never receive this path",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    try:
        config = BridgeConfig.load(args.config)
        token = "evx_local_" + secrets.token_urlsafe(32)
        server = BridgeServer((BRIDGE_HOST, BRIDGE_PORT), config, token)
    except BridgeError as exc:
        print(f"启动失败：{exc.message}", file=sys.stderr)
        return 2
    print("证见 EVI-X 本机只读桥接已启动。")
    print(f"地址：http://{BRIDGE_HOST}:{BRIDGE_PORT}")
    print(f"本次启动临时口令：{token}")
    print("口令只在本次进程内有效；请勿写入网页、Git、聊天记录或配置文件。")
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
