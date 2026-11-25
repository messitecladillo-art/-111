"""Authenticated HTTP routes for autonomous research runs and verification tools."""

from __future__ import annotations

import asyncio
import inspect
import json
import re
from typing import Any

from fastapi import Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from application.services.autonomous_research import AutonomousResearchService
from evix_api.requests import body
from evix_api.runtime import sanitize_boundary_error_message
from multi_agent.react_loop import sanitize_trace_prose
from shared.contracts import integer, uuid_string
from shared.errors import ApiError

_ERROR_PROSE_KEYS = frozenset(("message", "error", "detail", "warning"))
_PROSE_DICT_KEYS = frozenset((
    "thought",
    "observationSummary",
    "summary",
    "mechanism",
    "proposedAction",
    "reason",
    "pivotTaken",
    "pivot_note",
    "issue",
    "fix",
    "paradoxDetail",
    "scopeBoundary",
    "headline",
    "briefText",
    "message",
    "error",
    "detail",
    "warning",
))
_COLON_COMPACT_RE = re.compile(r"^工作记忆压缩[：:]\s*")
_SECRET_HEADER_OR_KEY_RE = re.compile(
    r"(?:Authorization|Proxy-Authorization)\s*:\s*(?:Bearer|Basic|Token)\s+[^\s\"',;\])}]+"
    r"|\bBearer\s+[A-Za-z0-9._\-]{8,}"
    r"|\b(?:x-api-key|api[-_]?key|mail_api_key|auth_secret)\s*[=:]\s*[^\s\"',;\])}]+"
    r"|\b(?:sk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_\-]{10,}|re_[A-Za-z0-9_\-]{10,}|AIza[0-9A-Za-z_\-]{20,})",
    re.IGNORECASE,
)
_BOUNDARY_LEAK_HINT_RE = re.compile(
    r"Traceback\s*\(most recent call last\)"
    r"|File\s+\"[^\"]+\",\s*line\s+\d+"
    r"|(?:postgresql(?:\+[a-z0-9]+)?|mysql(?:\+[a-z0-9]+)?|sqlite)://"
    r"|(?:[A-Za-z]:[\\/][^\s\"'<>]+)"
    r"|(?:/(?:Users|home|var|tmp|etc|opt|private|root)/[^\s\"'<>]+)"
    r"|\b(?:SQLAlchemyError|OperationalError|IntegrityError|ProgrammingError|DBAPIError|InterfaceError"
    r"|RequestValidationError|StarletteHTTPException|ValidationError|PydanticUserError"
    r"|RuntimeError|ValueError|KeyError|TypeError|AttributeError|IndexError|ZeroDivisionError"
    r"|FileNotFoundError|PermissionError|OSError|ConnectionRefusedError)\b",
    re.IGNORECASE,
)
_SAFE_TOKEN_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
_SAFE_SSE_FALLBACK_MSG = "当前探索步骤执行受阻，请检查输入或稍后重试。"


def _clean_outbound_text(text: str, *, is_error_field: bool = False) -> str:
    raw = str(text or "")
    if not raw.strip():
        return _SAFE_SSE_FALLBACK_MSG if is_error_field else ""
    had_secret = bool(_SECRET_HEADER_OR_KEY_RE.search(raw))
    working = _SECRET_HEADER_OR_KEY_RE.sub("", raw) if had_secret else raw
    if is_error_field or had_secret or _BOUNDARY_LEAK_HINT_RE.search(working):
        working = sanitize_boundary_error_message(working, fallback=_SAFE_SSE_FALLBACK_MSG)
        if had_secret and not any("\u4e00" <= ch <= "\u9fff" for ch in working):
            working = _SAFE_SSE_FALLBACK_MSG
    cleaned = _COLON_COMPACT_RE.sub("工作记忆压缩已完成，", working)
    cleaned = cleaned.replace("\u7b97\u5b50执行失败：", "统计步骤未能完成（") + (
        "）" if "\u7b97\u5b50执行失败：" in cleaned else ""
    )
    cleaned = cleaned.replace("绘图\u6c99\u76d2执行失败：", "统计图表绘制未能完成，")
    cleaned = cleaned.replace("只读统计\u6c99\u76d2执行失败：", "汇总统计计算未能完成，")
    cleaned = cleaned.replace("无法重建\u6c99\u76d2", "无法恢复统计检验环境")
    cleaned = cleaned.replace("用于\u6c99\u76d2计算", "用于受控统计计算")
    out = sanitize_trace_prose(cleaned, max(len(cleaned) + 32, 400))
    if is_error_field and (not out or not any("\u4e00" <= ch <= "\u9fff" for ch in out)):
        return _SAFE_SSE_FALLBACK_MSG
    return out


def _sanitize_outbound_payload(value: Any, *, _parent_key: str = "", _event_type: str = "") -> Any:
    """Purify user-visible SSE/JSON prose and error frames while leaving hashes, SVGs, diagnostics, and JSON keys untouched."""
    if _parent_key in ("epistemicGraph", "registeredResults", "svg", "diagnostics", "args"):
        return value
    is_error_event = _event_type in ("error", "failed", "run_failed", "tool_error")
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if is_error_event and k == "code":
                out[k] = v if isinstance(v, str) and _SAFE_TOKEN_RE.fullmatch(v) else "execution_failed"
            elif (k in _PROSE_DICT_KEYS or is_error_event) and isinstance(v, str) and (v or is_error_event or k in _ERROR_PROSE_KEYS):
                out[k] = _clean_outbound_text(v, is_error_field=(is_error_event or k in _ERROR_PROSE_KEYS))
            elif k in ("motherInsights", "cleaningRules", "refutedClaims", "steeringNotes") and isinstance(v, list):
                out[k] = [_clean_outbound_text(item) if isinstance(item, str) else item for item in v]
            else:
                out[k] = _sanitize_outbound_payload(v, _parent_key=k, _event_type=_event_type)
        return out
    if isinstance(value, list):
        return [_sanitize_outbound_payload(item, _parent_key=_parent_key, _event_type=_event_type) for item in value]
    return value


def _format_sse_frame(*, seq: int, run_id: str, event_type: str, payload: Any, created_at: str) -> str:
    raw_type = str(event_type or "message").strip()
    safe_type = raw_type if _SAFE_TOKEN_RE.fullmatch(raw_type) else "message"
    payload_json = json.dumps(
        {
            "seq": int(seq),
            "runId": str(run_id),
            "eventType": safe_type,
            "payload": _sanitize_outbound_payload(payload, _event_type=safe_type),
            "createdAt": str(created_at),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"id: {int(seq)}\nevent: {safe_type}\ndata: {payload_json}\n\n"


async def _guard_api_errors(call_or_coro: Any) -> Any:
    try:
        res = await call_or_coro if inspect.isawaitable(call_or_coro) else call_or_coro
        return _sanitize_outbound_payload(res)
    except ApiError as exc:
        raise ApiError(exc.status, exc.code, _clean_outbound_text(exc.message, is_error_field=True)) from None


def register_autonomous_agent(
    app,
    *,
    settings,
    db,
    auth,
    session_user,
    lock_user,
    operation,
    owned_project,
    owned_service,
    generator,
):
    engine = getattr(app.state, "engine", None)
    service = AutonomousResearchService(
        settings=settings,
        lock_user=lock_user,
        operation=operation,
        owned_project=owned_project,
        owned_service=owned_service,
        generator=generator,
        engine=engine,
    )

    @app.post("/api/projects/{project_id}/autonomous-runs", status_code=201)
    async def create_autonomous_run(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(
            request,
            ("idempotencyKey", "goal", "datasetMode"),
            ("geography", "leaseMode", "maxToolCalls", "serviceId", "serviceRevision", "surveyReleaseRef", "inlineDataset"),
            limit=2_500_000,
        )
        return await _guard_api_errors(
            service.create_run(
                project_id=project_id,
                user=user,
                session=session,
                check_session=lambda cur, **kw: session_user(request, cur, **kw),
                raw_data=data,
            )
        )

    @app.get("/api/projects/{project_id}/autonomous-runs")
    async def list_autonomous_runs(project_id: str, user=Depends(auth), session=Depends(db)):
        return await _guard_api_errors(service.list_runs(project_id=project_id, user=user, session=session))

    @app.get("/api/projects/{project_id}/autonomous-runs/{run_id}")
    async def get_autonomous_run(project_id: str, run_id: str, user=Depends(auth), session=Depends(db)):
        return await _guard_api_errors(service.get_run(project_id=project_id, run_id=run_id, user=user, session=session))

    @app.get("/api/projects/{project_id}/autonomous-runs/{run_id}/stream")
    async def stream_autonomous_run(
        project_id: str,
        run_id: str,
        request: Request,
        afterSeq: int = Query(default=0, ge=0),
    ):
        uuid_string(project_id)
        uuid_string(run_id)
        cursor = integer(afterSeq, 0)
        last_event_id = (request.headers.get("last-event-id") or "").strip()
        if last_event_id:
            if not (last_event_id.isascii() and last_event_id.isdecimal()) or len(last_event_id) > 12:
                raise ApiError(422, "invalid_input", "事件续传序号必须为非负整数。")
            cursor = max(cursor, int(last_event_id))

        db_engine = engine or app.state.engine
        with DBSession(db_engine, expire_on_commit=False) as session:
            user, _ = session_user(request, session)
            user_id = user.id
            service.verify_run_access(project_id=project_id, run_id=run_id, user=user, session=session)
            session.rollback()

        async def event_stream():
            nonlocal cursor
            max_polls = 200
            try:
                for _ in range(max_polls):
                    if await request.is_disconnected():
                        break
                    events, status = service.poll_run_events(
                        engine=db_engine,
                        user_id=user_id,
                        project_id=project_id,
                        run_id=run_id,
                        after_seq=cursor,
                    )
                    for ev in events:
                        seq = int(ev["seq"])
                        cursor = seq
                        yield _format_sse_frame(
                            seq=seq,
                            run_id=run_id,
                            event_type=ev["eventType"],
                            payload=ev["payload"],
                            created_at=ev["createdAt"],
                        )
                    if status != "running":
                        break
                    await asyncio.sleep(0.15)
            except Exception:
                cursor += 1
                yield _format_sse_frame(
                    seq=cursor,
                    run_id=run_id,
                    event_type="error",
                    payload={"code": "stream_interrupted", "message": "实时事件流连接暂时中断，请稍后重试。"},
                    created_at="",
                )

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store, no-transform",
                "X-Accel-Buffering": "no",
            },
        )

    @app.post("/api/projects/{project_id}/autonomous-runs/{run_id}/resume")
    async def resume_autonomous_run(project_id: str, run_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(
            request,
            ("expectedRevision", "decision"),
            ("steeringNote",),
            limit=20_000,
        )
        return await _guard_api_errors(
            service.resume_run(
                project_id=project_id,
                run_id=run_id,
                user=user,
                session=session,
                check_session=lambda cur, **kw: session_user(request, cur, **kw),
                raw_data=data,
            )
        )

    @app.post("/api/projects/{project_id}/autonomous-runs/{run_id}/cancel")
    async def cancel_autonomous_run(project_id: str, run_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("expectedRevision",), limit=2000)
        return await _guard_api_errors(
            service.cancel_run(
                project_id=project_id,
                run_id=run_id,
                user=user,
                session=session,
                raw_data=data,
            )
        )

    @app.get("/api/projects/{project_id}/epistemic-memory")
    async def list_epistemic_memory(project_id: str, user=Depends(auth), session=Depends(db)):
        return await _guard_api_errors(service.list_project_memory(project_id=project_id, user=user, session=session))

    @app.post("/api/projects/{project_id}/sandbox/plot")
    async def run_plot_sandbox(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(
            request,
            (),
            ("script", "data", "snapshot", "runId", "snapshotId", "chartKind", "autoRepair"),
            limit=120_000,
        )
        return await _guard_api_errors(service.run_project_plot_sandbox(project_id=project_id, user=user, session=session, raw_data=data))

    @app.post("/api/projects/{project_id}/sandbox/stat")
    async def run_stat_sandbox(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(
            request,
            ("script",),
            ("questions", "rows", "runId", "classification"),
            limit=1_500_000,
        )
        return await _guard_api_errors(service.run_project_stat_sandbox(project_id=project_id, user=user, session=session, raw_data=data))

    @app.get("/api/projects/{project_id}/grounding/counties")
    async def lookup_counties(
        project_id: str,
        q: str = Query(..., min_length=1, max_length=80),
        limit: int = Query(default=5, ge=1, le=20),
        user=Depends(auth),
        session=Depends(db),
    ):
        return await _guard_api_errors(service.lookup_project_counties(project_id=project_id, user=user, session=session, query=q, limit=limit))

    @app.post("/api/projects/{project_id}/grounding/verify-citation")
    async def verify_citation(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, (), ("query", "doi"), limit=8_000)
        return await _guard_api_errors(service.verify_project_citation(project_id=project_id, user=user, session=session, raw_data=data))
