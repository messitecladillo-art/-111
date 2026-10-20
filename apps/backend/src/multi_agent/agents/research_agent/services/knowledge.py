"""Local-first knowledge APIs. Lookups send only an explicitly confirmed short query.

Budget reservations and receipts commit before dispatch. Unknown outcomes are never
replayed, and keep their reservation until an operator reconciles provider billing.
"""
from dataclasses import dataclass, field
from datetime import timezone
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

import httpx

from shared.errors import ApiError
from shared.contracts import object_fields, text


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
    path = Path(path) if path is not None else Path(__file__).resolve().parents[1] / "knowledge-catalog.json"
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
