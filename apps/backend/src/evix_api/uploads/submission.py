"""Private, consent-bound temporary submission-file checks.

The admission limit is per API process. PostgreSQL rate events survive process
restarts; raw files, filenames and audit terms never enter those events.
"""
from __future__ import annotations

import asyncio
import hashlib
from collections import deque
import json
import logging
import re
import threading
from typing import Callable
from urllib.parse import unquote

from fastapi import Request
from fastapi.responses import Response
from starlette.requests import ClientDisconnect

from shared.errors import ApiError
from multi_agent.agents.reviewer_agent.tools import submission_preflight

LOGGER = logging.getLogger("evix.preflight_import")
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
DB_DEADLINE_SECONDS = 3.0
MAX_ACTIVE_OPERATIONS = 8


class TemporarySubmissionPreflights:
    def __init__(self, settings):
        self.settings = settings
        self._lock = threading.Lock()
        self._users: set[str] = set()
        self._parsers: dict[asyncio.Task, asyncio.Event] = {}
        self._operations: dict[asyncio.Task, dict] = {}
        self._closing = False
        self.events = deque(maxlen=200)

    def record(self, event):
        # Only opaque identifiers and lifecycle states reach operational logs.
        safe = {key: event[key] for key in ("importId", "status", "at") if key in event}
        self.events.append(safe)
        LOGGER.info("temporary submission lifecycle %s", safe)

    async def sweep(self):
        try:
            records = await asyncio.to_thread(submission_preflight.cleanup_stale,
                                             self.settings.preflight_temp_dir)
        except submission_preflight.PreflightError:
            self.record({"status": "cleanup_failed"})
            return
        for event in records:
            self.record(event)

    async def maintenance(self):
        while True:
            await asyncio.sleep(self.settings.preflight_cleanup_seconds)
            await self.sweep()

    async def close(self):
        loop = asyncio.get_running_loop()
        with self._lock:
            self._closing = True
            active = [(task, state) for task, state in self._operations.items()
                      if task.get_loop() is loop]
        for task, state in active:
            state["cancelled"].set()
            # A parser owns child reaping and removal. Upload/DB phases instead
            # need HTTP-task cancellation to interrupt their pending receive.
            if state["parser"] is None:
                task.cancel()
        await asyncio.gather(*(task for task, _ in active), return_exceptions=True)

    async def _settle(self, task):
        # asyncio cannot kill a running synchronous DB thread. Keep ownership
        # until it closes its transaction, even with repeated HTTP cancellation.
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except Exception:
                break
        if not task.cancelled():
            task.exception()

    async def _database_call(self, callback, *args, **kwargs):
        task = asyncio.create_task(asyncio.to_thread(callback, *args, **kwargs))
        try:
            async with asyncio.timeout(DB_DEADLINE_SECONDS):
                return await asyncio.shield(task)
        except TimeoutError:
            await self._settle(task)
            raise ApiError(503, "preflight_auth_timeout", "文件检查授权等待超时，请稍后重试。") from None
        except asyncio.CancelledError:
            await self._settle(task)
            raise

    def _register(self, task, cancelled):
        with self._lock:
            if self._closing:
                raise ApiError(503, "preflight_unavailable", "文件检查服务正在重启，请稍后重试。")
            if len(self._operations) >= MAX_ACTIVE_OPERATIONS:
                raise ApiError(503, "preflight_busy", "文件检查服务繁忙，请稍后重试。")
            state = {"cancelled": cancelled, "parser": None}
            self._operations[task] = state
            return state

    def _ensure_open(self, state):
        with self._lock:
            if self._closing or state["cancelled"].is_set():
                raise ApiError(499, "preflight_cancelled", submission_preflight.MESSAGES["preflight_cancelled"])

    def _claim(self, user_id):
        with self._lock:
            if self._closing:
                raise ApiError(503, "preflight_unavailable", "文件检查服务正在重启，请稍后重试。")
            if user_id in self._users:
                raise ApiError(429, "preflight_user_active", "当前文件仍在检查，请先完成或取消。")
            if len(self._users) >= 2:
                raise ApiError(429, "preflight_busy", "文件检查服务繁忙，请稍后重试。")
            self._users.add(user_id)

    def _release(self, user_id):
        with self._lock:
            self._users.discard(user_id)

    async def convert(self, request: Request, authorize: Callable, reauthorize: Callable):
        operation = asyncio.current_task()
        cancelled = asyncio.Event()
        state = self._register(operation, cancelled)
        parser = monitor = None
        user_id = None
        claimed = False
        try:
            # Authentication remains required for malformed uploads. The sync
            # callbacks execute off-loop and close transactions before I/O.
            user_id = await self._database_call(authorize, request, charge=False)
            self._ensure_open(state)
            if request.headers.get("x-evix-temporary-upload") != "accepted":
                raise ApiError(422, "preflight_upload_consent_required", "请确认临时上传并检查此文件。")
            if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/octet-stream":
                raise ApiError(415, "preflight_content_type", "请直接上传 DOCX、PPTX 或 PDF 文件。")
            if request.headers.get("content-encoding", "identity").strip().lower() != "identity":
                raise ApiError(415, "preflight_content_encoding", "请上传原始 DOCX、PPTX 或 PDF 文件。")
            length = request.headers.get("content-length")
            if length is not None:
                if not re.fullmatch(r"[0-9]{1,10}", length):
                    raise ApiError(422, "preflight_content_length", "文件大小信息无效，请重新选择文件。")
                if int(length) > submission_preflight.MAX_BYTES:
                    raise ApiError(413, "preflight_too_large", submission_preflight.MESSAGES["preflight_too_large"])
            self._claim(user_id)
            claimed = True
            # Denied local admissions cannot spend persistent rate slots.
            try:
                raw_name = request.headers.get("x-evix-audit-name", "")
                if not raw_name or len(raw_name) > 3000 or re.search(r"%(?![0-9a-fA-F]{2})", raw_name):
                    raise submission_preflight.PreflightError("preflight_input")
                name = unquote(raw_name, encoding="utf-8", errors="strict")
                format = request.headers.get("x-evix-audit-format")
                terms = submission_preflight.decode_terms(request.headers.get("x-evix-audit-terms"))
                name, format, terms = submission_preflight.validate_input(name, format, terms)
            except (UnicodeError, submission_preflight.PreflightError):
                raise ApiError(422, "preflight_input", submission_preflight.MESSAGES["preflight_input"]) from None
            await self._database_call(authorize, request, charge=True)
            self._ensure_open(state)
            content = bytearray()
            try:
                async with asyncio.timeout(self.settings.preflight_upload_seconds):
                    async for chunk in request.stream():
                        self._ensure_open(state)
                        if len(content) + len(chunk) > submission_preflight.MAX_BYTES:
                            raise ApiError(413, "preflight_too_large", submission_preflight.MESSAGES["preflight_too_large"])
                        content.extend(chunk)
            except TimeoutError:
                raise ApiError(408, "preflight_upload_timeout", "文件上传超时，请重新选择文件。") from None
            except ClientDisconnect:
                raise ApiError(499, "preflight_cancelled", submission_preflight.MESSAGES["preflight_cancelled"]) from None
            if not content:
                raise ApiError(422, "preflight_empty", submission_preflight.MESSAGES["preflight_empty"])
            self._ensure_open(state)

            source_bytes = len(content)
            source_hash = hashlib.sha256(content).hexdigest()

            async def watch_disconnect():
                while True:
                    await asyncio.sleep(0.1)
                    if await request.is_disconnected():
                        cancelled.set()
                        return

            # No await separates the closing fence from parser registration.
            # close() therefore always sees either an upload or its child owner.
            with self._lock:
                if self._closing or cancelled.is_set():
                    raise ApiError(499, "preflight_cancelled", submission_preflight.MESSAGES["preflight_cancelled"])
                monitor = asyncio.create_task(watch_disconnect())
                parser = asyncio.create_task(submission_preflight.audit_bytes(
                    bytes(content), name=name, format=format, terms=terms, timeout_seconds=self.settings.preflight_parse_seconds,
                    temp_root=self.settings.preflight_temp_dir, cancel_event=cancelled,
                    on_event=self.record))
                self._parsers[parser] = cancelled
                state["parser"] = parser
            content.clear()
            try:
                value = await asyncio.shield(parser)
            except asyncio.CancelledError:
                cancelled.set()
                await self._settle(parser)
                raise
            except submission_preflight.PreflightError as error:
                status = (413 if error.code in {"preflight_too_large", "preflight_limits"}
                          else 408 if error.code == "preflight_timeout"
                          else 499 if error.code == "preflight_cancelled"
                          else 503 if error.code in {"preflight_dependency", "preflight_temp_unavailable", "preflight_cleanup_failed", "preflight_worker_failed"}
                          else 422)
                raise ApiError(status, error.code, error.message) from None
            self._ensure_open(state)
            if value.get("cleanup") != {"completed": True, "reason": "temporary-upload"}:
                raise ApiError(503, "preflight_cleanup_failed", submission_preflight.MESSAGES["preflight_cleanup_failed"])
            try:
                submission_preflight.validate_report(value, name=name, format=format, terms=terms,
                    source_bytes=source_bytes, source_hash=source_hash, cleaned=True)
            except submission_preflight.PreflightError as error:
                raise ApiError(503, error.code, error.message) from None
            await self._database_call(reauthorize, request, user_id)
            self._ensure_open(state)
            try:
                encoded = json.dumps(value, ensure_ascii=False, allow_nan=False,
                                     separators=(",", ":")).encode("utf-8")
            except (TypeError, ValueError, UnicodeError):
                raise ApiError(503, "preflight_worker_failed", submission_preflight.MESSAGES["preflight_worker_failed"]) from None
            if len(encoded) > MAX_RESPONSE_BYTES:
                raise ApiError(413, "preflight_limits", submission_preflight.MESSAGES["preflight_limits"])
            return Response(encoded, media_type="application/json")
        finally:
            cancelled.set()
            interrupted = False
            try:
                if monitor is not None:
                    monitor.cancel()
                    while not monitor.done():
                        try:
                            await asyncio.shield(monitor)
                        except asyncio.CancelledError:
                            if not monitor.done():
                                interrupted = True
                    if not monitor.cancelled():
                        monitor.exception()
            finally:
                if parser is not None:
                    if parser.done() and not parser.cancelled():
                        parser.exception()
                    with self._lock:
                        self._parsers.pop(parser, None)
                if claimed:
                    self._release(user_id)
                with self._lock:
                    self._operations.pop(operation, None)
            if interrupted:
                raise asyncio.CancelledError
