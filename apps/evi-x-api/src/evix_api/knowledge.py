"""Local-first knowledge APIs. Lookups send only an explicitly confirmed short query.

Budget reservations and receipts commit before dispatch. Unknown outcomes are never
replayed, and keep their reservation until an operator reconciles provider billing.
"""
import asyncio
from dataclasses import dataclass, field
from datetime import timedelta, timezone
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, Request
from sqlalchemy import select, text as sql_text, func
from sqlalchemy.dialects.postgresql import insert

from .contracts import ApiError, body, object_fields, integer, text, uuid_string
from .models import now
from .knowledge_models import (KnowledgeUserState, KnowledgeProjectState,
    KnowledgeReference, KnowledgeTermRequest, KnowledgeLookup,
    KnowledgeMonthlyBudget, KnowledgeDailyBudget)


@dataclass(frozen=True)
class KnowledgeConfig:
    api_key: str = field(default="", repr=False)
    timeout_seconds: int = 15
    monthly_limit: int = 1000
    daily_limit: int = 20

    def __post_init__(self):
        if (self.api_key and not re.fullmatch(r"[!-~]{8,512}", self.api_key)
                or type(self.timeout_seconds) is not int or not 1 <= self.timeout_seconds <= 30
                or type(self.monthly_limit) is not int or not 1 <= self.monthly_limit <= 1000
                or type(self.daily_limit) is not int or not 1 <= self.daily_limit <= 20):
            raise ValueError("Invalid knowledge lookup configuration")

    @classmethod
    def from_environment(cls, production):
        # No environment proxy, alternate endpoint or PAYG switch is accepted.
        return cls(api_key=os.getenv("EVIX_KNOWLEDGE_TAVILY_API_KEY", "") if production else "")


class LookupFailure(Exception):
    def __init__(self, code, unknown=True):
        self.code, self.unknown = code, unknown
        super().__init__(code)


@dataclass(frozen=True)
class LookupResult:
    results: list
    credits: int | None
    request_id: str | None


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def provider_text(value, maximum):
    if not isinstance(value, str):
        return ""
    parser = PlainText()
    parser.feed(value[:maximum * 8])
    clean = re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", "".join(parser.parts))
    return clean[:maximum]


def safe_result_url(value):
    if not isinstance(value, str) or len(value) > 2048 or re.search(r"[\x00-\x20\x7f\\]", value):
        return None
    try:
        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
            return None
        url.port  # Reject malformed ports.
    except ValueError:
        return None
    return value


def parse_provider_result(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise LookupFailure("lookup_invalid_response")
    results = []
    for item in payload["results"][:5]:
        if not isinstance(item, dict):
            continue
        url = safe_result_url(item.get("url"))
        if url:
            results.append({"url": url, "title": provider_text(item.get("title"), 240),
                            "snippet": provider_text(item.get("content"), 2000)})
    usage = payload.get("usage")
    credits = usage.get("credits") if isinstance(usage, dict) else None
    if type(credits) is not int or not 0 <= credits <= 1000:
        credits = None  # Missing, booleans and malformed usage are not zero.
    request_id = payload.get("request_id")
    if not isinstance(request_id, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,120}", request_id):
        request_id = None
    return LookupResult(results, credits, request_id)


class LiveTavily:
    def __init__(self, config):
        self.config = config

    async def __call__(self, query):
        payload = {"query": query, "search_depth": "basic", "max_results": 5,
                   "auto_parameters": False, "include_answer": False,
                   "include_raw_content": False, "include_usage": True}
        domains = authoritative_domains(query)
        if domains:
            payload["include_domains"] = domains
        try:
            async with httpx.AsyncClient(timeout=self.config.timeout_seconds, follow_redirects=False, trust_env=False) as client:
                async with client.stream("POST", "https://api.tavily.com/search",
                        headers={"Authorization": "Bearer " + self.config.api_key}, json=payload) as response:
                    if response.status_code in (400, 401, 403, 429, 432, 433):
                        raise LookupFailure("lookup_rate_limited" if response.status_code == 429 else "lookup_rejected", False)
                    if response.status_code != 200:
                        raise LookupFailure("lookup_provider_unknown")
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(raw) + len(chunk) > 128_000:
                            raise LookupFailure("lookup_response_too_large")
                        raw.extend(chunk)
                    try:
                        return parse_provider_result(json.loads(raw))
                    except (ValueError, UnicodeError):
                        raise LookupFailure("lookup_invalid_response") from None
        except httpx.HTTPError:
            raise LookupFailure("lookup_network_unknown") from None


def authoritative_domains(query):
    """Fixed source domains selected by the confirmed query, never by page context."""
    groups = (
        (r"地理|空间|坐标|地图|生态谬误|可变空间|\b(?:gis|maup|spatial)\b",
         ["pro.arcgis.com", "docs.qgis.org", "geopandas.org", "geodacenter.github.io"]),
        (r"哲学|归纳|演绎|溯因|认识论|证伪|实证主义|\b(?:epistemology|abduction|falsifiability)\b",
         ["plato.stanford.edu", "iep.utm.edu"]),
        (r"机器学习|过拟合|交叉验证|聚类|降维|分类器|特征工程|\b(?:overfit\w*|clustering|machine learning|pca)\b",
         ["scikit-learn.org", "tensorflow.org", "pytorch.org", "developers.google.com"]),
        (r"统计|置信|效应量|信度|效度|抽样|概率|标准误|方差|回归|相关|卡方|检验|\b(?:sem|anova|confidence|cronbach|p.value|pearson|spearman|regression)\b",
         ["itl.nist.gov", "online.stat.psu.edu", "stats.oarc.ucla.edu", "cdc.gov"]),
        (r"向量|矩阵|特征值|梯度|优化|\b(?:eigenvalue|matrix|gradient|vector)\b",
         ["ocw.mit.edu", "numpy.org", "docs.scipy.org"]),
        (r"编码|数据库|哈希|数据类型|计算机|\b(?:api|sql|hash|unicode|database)\b",
         ["docs.python.org", "developer.mozilla.org", "postgresql.org", "w3.org", "nist.gov"]),
        (r"问卷|访谈|预测试|研究方法|\b(?:survey|questionnaire|pilot study)\b",
         ["aapor.org", "pewresearch.org", "who.int", "oecd.org"]),
    )
    for pattern, domains in groups:
        if re.search(pattern, query, re.IGNORECASE):
            return domains
    return []


def catalog_from_file(path=None):
    path = Path(path) if path is not None else Path(__file__).with_name("knowledge-catalog.json")
    if not path.is_file():
        return {}
    if path.stat().st_size > 1_000_000:
        raise ValueError("Knowledge catalog too large")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1 or not isinstance(payload.get("entries"), list):
        raise ValueError("Invalid knowledge catalog")
    catalog = {}
    for entry in payload["entries"]:
        review = entry.get("review", {})
        if (review.get("status") != "reviewed" or not review.get("producer") or not review.get("reviewer")
                or review["producer"] == review["reviewer"] or not review.get("checkedAt")):
            continue
        entry_id, version = entry.get("id"), entry.get("version")
        if not isinstance(entry_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,95}", entry_id) or type(version) is not int or not 1 <= version <= 2147483647:
            raise ValueError("Invalid knowledge catalog reference")
        catalog.setdefault(entry_id, set()).add(version)
    return catalog


def short_line(value, maximum, minimum=0):
    text(value, maximum, minimum)
    if value != value.strip() or re.search(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]", value):
        raise ApiError()
    return value


def lookup_query(value):
    return short_line(value, 120, 1)


def validate_entry(value, catalog):
    x = object_fields(value, ("entryId", "entryVersion"))
    if (not isinstance(x["entryId"], str) or type(x["entryVersion"]) is not int
            or x["entryVersion"] not in catalog.get(x["entryId"], set())):
        raise ApiError(422, "knowledge_version_unavailable", "词条版本不可用，请重新选择。")
    return x


def user_content(value, catalog):
    x = object_fields(value, ("favorites", "recent", "preferences"))
    for key, maximum in (("favorites", 500), ("recent", 50)):
        if not isinstance(x[key], list) or len(x[key]) > maximum:
            raise ApiError()
        for item in x[key]:
            validate_entry(item, catalog)
        if len({(v["entryId"], v["entryVersion"]) for v in x[key]}) != len(x[key]):
            raise ApiError()
    p = object_fields(x["preferences"], (), ("mode", "x", "y", "width", "height", "query", "scrollEntryId", "scrollTop"))
    if "mode" in p and p["mode"] not in ("float", "pinned"):
        raise ApiError()
    for key, low, high in (("x", 0, 1), ("y", 0, 1), ("width", 280, 1000), ("height", 240, 1200), ("scrollTop", 0, 1_000_000)):
        if key in p and (type(p[key]) not in (float, int) or not low <= p[key] <= high or not math.isfinite(p[key])):
            raise ApiError()
    if "query" in p:
        short_line(p["query"], 120)
    if "scrollEntryId" in p and p["scrollEntryId"] not in catalog:
        raise ApiError()
    return x


def stamp(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def lookup_view(row):
    return {"id": row.id, "status": row.status, "query": row.query, "createdAt": stamp(row.created_at),
            "finishedAt": stamp(row.finished_at) if row.finished_at else None,
            "results": row.results, "credits": row.actual_credits, "errorCode": row.error_code,
            "providerRequestId": row.provider_request_id}


def register_knowledge(app, settings, db, session_user, owned_project, lock_user, operation,
                       catalog=None, provider=None, config=None):
    catalog = catalog if catalog is not None else catalog_from_file()
    config = config or KnowledgeConfig.from_environment(settings.mode == "production")
    if settings.mode == "production" and provider is not None:
        raise ValueError("Production knowledge rejects injected providers")
    provider = provider or (LiveTavily(config) if config.api_key else None)

    def bind(session, user):
        session.execute(sql_text("SELECT set_config('evix.user_id', :uid, true)"), {"uid": user.id})

    def state_view(row):
        return {"revision": row.revision if row else 0,
                **(row.content if row else {"favorites": [], "recent": [], "preferences": {}})}

    def project_state(session, project_id):
        state = session.get(KnowledgeProjectState, project_id)
        refs = session.scalars(select(KnowledgeReference).where(KnowledgeReference.project_id == project_id,
            KnowledgeReference.deleted.is_(False)).order_by(KnowledgeReference.created_at, KnowledgeReference.id)).all()
        return {"revision": state.revision if state else 0, "references": [
            {"id": r.id, "entryId": r.entry_id, "entryVersion": r.entry_version,
             "createdBy": r.created_by, "createdAt": stamp(r.created_at)} for r in refs]}

    def check_revision(actual, expected):
        if actual != integer(expected, 0):
            raise ApiError(409, "version_conflict", "内容已有更新，请载入最新版本。")

    @app.get("/api/me/knowledge-state")
    def get_state(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        return state_view(session.get(KnowledgeUserState, user.id))

    @app.put("/api/me/knowledge-state")
    async def put_state(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        data = await body(request, ("expectedRevision", "idempotencyKey", "state"), limit=100_000)
        content = user_content(data["state"], catalog)
        lock_user(session, user)
        op, repeated = operation(session, user, "knowledge-state", data)
        if repeated:
            return op.response
        row = session.get(KnowledgeUserState, user.id)
        check_revision(row.revision if row else 0, data["expectedRevision"])
        if row:
            row.revision += 1; row.content = content; row.updated_at = now()
        else:
            row = KnowledgeUserState(user_id=user.id, revision=1, content=content, updated_at=now())
            session.add(row)
        op.response = state_view(row)
        session.commit()
        return op.response

    @app.get("/api/projects/{project_id}/knowledge-references")
    def get_references(project_id: str, request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        owned_project(session, user, project_id)
        return project_state(session, project_id)

    async def mutate_reference(project_id, request, session, reference_id=None):
        user, _ = session_user(request, session)
        required = ("expectedRevision", "idempotencyKey") + (() if reference_id else ("entryId", "entryVersion"))
        data = await body(request, required, limit=2000)
        if reference_id:
            uuid_string(reference_id)
        else:
            validate_entry({"entryId": data["entryId"], "entryVersion": data["entryVersion"]}, catalog)
        lock_user(session, user)
        owned_project(session, user, project_id, edit=True, lock=True)
        scope = "knowledge-ref:" + project_id + (":" + reference_id if reference_id else "")
        op, repeated = operation(session, user, scope, data)
        if repeated:
            return op.response
        state = session.get(KnowledgeProjectState, project_id)
        check_revision(state.revision if state else 0, data["expectedRevision"])
        if not state:
            state = KnowledgeProjectState(project_id=project_id, revision=0)
            session.add(state)
        if reference_id:
            row = session.scalar(select(KnowledgeReference).where(KnowledgeReference.id == reference_id,
                KnowledgeReference.project_id == project_id, KnowledgeReference.deleted.is_(False)))
            if not row:
                raise ApiError(404, "not_found", "资源不存在。")
            row.deleted = True
        else:
            row = session.scalar(select(KnowledgeReference).where(KnowledgeReference.project_id == project_id,
                KnowledgeReference.entry_id == data["entryId"], KnowledgeReference.entry_version == data["entryVersion"]))
            if row:
                row.deleted = False
            else:
                session.add(KnowledgeReference(project_id=project_id, entry_id=data["entryId"],
                    entry_version=data["entryVersion"], created_by=user.id, deleted=False))
        state.revision += 1
        session.flush()
        op.response = project_state(session, project_id)
        session.commit()
        return op.response

    @app.post("/api/projects/{project_id}/knowledge-references")
    async def add_reference(project_id: str, request: Request, session=Depends(db)):
        return await mutate_reference(project_id, request, session)

    @app.delete("/api/projects/{project_id}/knowledge-references/{reference_id}")
    async def delete_reference(project_id: str, reference_id: str, request: Request, session=Depends(db)):
        return await mutate_reference(project_id, request, session, reference_id)

    @app.post("/api/knowledge/term-requests", status_code=201)
    async def term_request(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        data = await body(request, ("idempotencyKey", "term", "domain", "note"), limit=4000)
        short_line(data["term"], 120, 1); short_line(data["domain"], 60); short_line(data["note"], 500)
        lock_user(session, user)
        op, repeated = operation(session, user, "knowledge-term-request", data)
        if repeated:
            return op.response
        midnight = now().replace(hour=0, minute=0, second=0, microsecond=0)
        count = session.scalar(select(func.count()).select_from(KnowledgeTermRequest).where(
            KnowledgeTermRequest.user_id == user.id, KnowledgeTermRequest.created_at >= midnight))
        if count >= 5:
            raise ApiError(429, "knowledge_request_limit", "今天的补词申请已达上限。")
        row = KnowledgeTermRequest(user_id=user.id, idempotency_key=data["idempotencyKey"],
            payload_hash=op.payload_hash, term=data["term"], domain=data["domain"], note=data["note"], status="submitted")
        session.add(row); session.flush()
        op.response = {"id": row.id, "status": row.status, "createdAt": stamp(row.created_at)}
        session.commit()
        return op.response

    def expire_lookup(row):
        if row.status == "running" and row.created_at <= now() - timedelta(seconds=config.timeout_seconds + 30):
            row.status = "outcome_unknown"; row.error_code = "lookup_interrupted_unknown"; row.finished_at = now()
            return True
        return False

    @app.get("/api/knowledge/lookups/{lookup_id}")
    def get_lookup(lookup_id: str, request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        uuid_string(lookup_id)
        row = session.scalar(select(KnowledgeLookup).where(KnowledgeLookup.id == lookup_id,
            KnowledgeLookup.user_id == user.id).with_for_update())
        if not row:
            raise ApiError(404, "not_found", "资源不存在。")
        if expire_lookup(row):
            session.commit()
        return lookup_view(row)

    def settle_lookup(session, user, lookup_id, result=None, failure=None):
        bind(session, user)
        # Lock order matches reservations: monthly aggregate before receipt.
        initial = session.get(KnowledgeLookup, lookup_id)
        monthly = session.scalar(select(KnowledgeMonthlyBudget).where(
            KnowledgeMonthlyBudget.month == initial.budget_month).with_for_update())
        row = session.scalar(select(KnowledgeLookup).where(KnowledgeLookup.id == lookup_id).with_for_update()
            .execution_options(populate_existing=True))
        if row.status not in ("running", "outcome_unknown"):
            return lookup_view(row)
        if result:
            row.results = result.results
            row.provider_request_id = result.request_id
            row.actual_credits = result.credits
            if result.credits is None:
                row.status = "outcome_unknown"; row.error_code = "lookup_usage_unknown"
            elif result.credits > row.reserved_credits:
                # A basic-call billing anomaly closes the month's dispatch budget.
                # Record reported usage; never quietly convert it to the expected one.
                monthly.blocked = True
                monthly.reserved -= row.reserved_credits; monthly.settled += result.credits
                row.reserved_credits = 0
                row.status = "outcome_unknown"; row.error_code = "lookup_usage_anomaly"
            else:
                monthly.reserved -= row.reserved_credits; monthly.settled += result.credits
                row.reserved_credits = 0; row.status = "ready"; row.error_code = None
        elif failure.unknown:
            row.status = "outcome_unknown"; row.error_code = failure.code
        else:
            monthly.reserved -= row.reserved_credits; row.reserved_credits = 0
            row.actual_credits = 0; row.status = "failed"; row.error_code = failure.code
        row.finished_at = now()
        session.commit()
        return lookup_view(row)

    @app.post("/api/knowledge/lookups", status_code=202)
    async def create_lookup(request: Request, session=Depends(db)):
        user, _ = session_user(request, session)
        data = await body(request, ("query", "idempotencyKey"), limit=1000)
        query = lookup_query(data["query"])
        uuid_string(data["idempotencyKey"])
        lock_user(session, user)
        op, repeated = operation(session, user, "knowledge-lookup", data)
        if repeated:
            row = session.get(KnowledgeLookup, op.response["id"])
            if expire_lookup(row):
                session.commit()
            return lookup_view(row)
        if provider is None:
            raise ApiError(503, "knowledge_lookup_unconfigured", "联网查证尚未配置。")
        month, day = now().strftime("%Y-%m"), now().strftime("%Y-%m-%d")
        session.execute(insert(KnowledgeMonthlyBudget).values(month=month, reserved=0, settled=0, blocked=False).on_conflict_do_nothing())
        monthly = session.scalar(select(KnowledgeMonthlyBudget).where(KnowledgeMonthlyBudget.month == month).with_for_update())
        session.execute(insert(KnowledgeDailyBudget).values(user_id=user.id, day=day, requests=0).on_conflict_do_nothing())
        daily = session.scalar(select(KnowledgeDailyBudget).where(KnowledgeDailyBudget.user_id == user.id,
            KnowledgeDailyBudget.day == day).with_for_update())
        if monthly.blocked or monthly.reserved + monthly.settled >= config.monthly_limit:
            raise ApiError(429, "knowledge_monthly_limit", "本月联网查证额度已用完。")
        if daily.requests >= config.daily_limit:
            raise ApiError(429, "knowledge_daily_limit", "今天的联网查证次数已用完。")
        monthly.reserved += 1; daily.requests += 1
        row = KnowledgeLookup(user_id=user.id, idempotency_key=data["idempotencyKey"],
            payload_hash=op.payload_hash, query=query, status="running", budget_month=month,
            budget_day=day, reserved_credits=1, results=[])
        session.add(row); session.flush()
        op.response = {"id": row.id}
        lookup_id = row.id
        session.commit()  # Durable receipt, quota and idempotency precede external IO.
        try:
            result = await asyncio.wait_for(provider(query), config.timeout_seconds)
            if not isinstance(result, LookupResult):
                raise LookupFailure("lookup_invalid_response")
            return settle_lookup(session, user, lookup_id, result=result)
        except LookupFailure as failure:
            return settle_lookup(session, user, lookup_id, failure=failure)
        except asyncio.CancelledError:
            settle_lookup(session, user, lookup_id, failure=LookupFailure("lookup_cancelled_unknown"))
            raise
        except Exception:
            return settle_lookup(session, user, lookup_id, failure=LookupFailure("lookup_dispatch_unknown"))

    # Introspection contains no operator credential or user query.
    app.state.knowledge = {"catalogVersions": sum(len(v) for v in catalog.values()), "configured": provider is not None}
