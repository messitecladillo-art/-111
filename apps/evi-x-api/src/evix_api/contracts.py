import hashlib
import json
import math
import re
from uuid import UUID


class ApiError(Exception):
    def __init__(self, status=422, code="invalid_input", message="请求格式或字段无效。"):
        self.status, self.code, self.message = status, code, message


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def object_fields(value, required, optional=()):
    if not isinstance(value, dict) or set(value) - set(required) - set(optional) or set(required) - set(value):
        raise ApiError()
    return value


def uuid_string(value):
    if not isinstance(value, str):
        raise ApiError()
    try:
        parsed = str(UUID(value))
    except (ValueError, AttributeError):
        raise ApiError() from None
    if parsed != value or parsed == "00000000-0000-0000-0000-000000000000":
        raise ApiError()
    return parsed


def text(value, maximum, minimum=0):
    # Match JavaScript UTF-16 string.length in the canonical legacy schema.
    if not isinstance(value, str):
        raise ApiError()
    try:
        count = len(value.encode("utf-16-le")) // 2
    except UnicodeEncodeError:
        raise ApiError() from None
    if not minimum <= count <= maximum or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
        raise ApiError()
    return value


def integer(value, minimum, maximum=2_147_483_647):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ApiError()
    return value


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ApiError(422, "duplicate_members", "JSON包含重复字段。")
            result[key] = value
        return result

    def check_depth(value, depth=0):
        if depth > 16:
            raise ApiError()
        if isinstance(value, dict):
            for key in value:
                key.encode("utf-8", errors="strict")
            for item in value.values():
                check_depth(item, depth + 1)
        elif isinstance(value, list):
            for item in value:
                check_depth(item, depth + 1)
        elif isinstance(value, float) and not math.isfinite(value):
            raise ApiError()
        elif isinstance(value, str):
            value.encode("utf-8", errors="strict")
    try:
        result = json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ApiError()))
        check_depth(result)
        return result
    except (ValueError, UnicodeError, RecursionError):
        raise ApiError(422, "invalid_json", "请求必须是完整的UTF-8 JSON。") from None


async def body(request, required, optional=(), limit=350_000):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise ApiError(415, "unsupported_media_type", "请求须为JSON。")
    advertised = request.headers.get("content-length")
    if advertised and (not advertised.isdecimal() or int(advertised) > limit):
        raise ApiError(413, "payload_too_large", "请求内容超过上限。")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise ApiError(413, "payload_too_large", "请求内容超过上限。")
        chunks.append(chunk)
    try:
        decoded = b"".join(chunks).decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        raise ApiError() from None
    return object_fields(strict_json(decoded), required, optional)


def questionnaire(value):
    fields = ("schema", "classification", "title", "objective", "population", "geography", "period", "recruitment", "introduction", "pilotNotes", "questions")
    d = object_fields(value, fields)
    if d["schema"] != "questionnaire-design/v1" or d["classification"] != "proposed":
        raise ApiError()
    for key in ("title", "population", "geography", "period"):
        text(d[key], 160)
    for key in ("objective", "recruitment"):
        text(d[key], 600)
    for key in ("introduction", "pilotNotes"):
        text(d[key], 2000)
    if not isinstance(d["questions"], list) or len(d["questions"]) > 80:
        raise ApiError()
    ids = set()
    for question in d["questions"]:
        q = object_fields(question, ("id", "variable", "text", "type", "required", "purpose", "researchQuestion", "construct", "analysis", "decisionUse", "source", "choices", "min", "max", "minLabel", "maxLabel", "reverse", "condition"))
        text(q["id"], 64, 1)
        if not re.fullmatch(r"[A-Za-z0-9_-]+", q["id"]) or q["id"] in ids:
            raise ApiError()
        ids.add(q["id"])
        for key, maximum in (("variable", 32), ("text", 600), ("researchQuestion", 500), ("decisionUse", 500), ("source", 500), ("construct", 120), ("minLabel", 120), ("maxLabel", 120)):
            text(q[key], maximum)
        if q["type"] not in ("single", "multi", "likert", "number", "text") or q["analysis"] not in ("undecided", "description", "comparison", "association", "measurement", "coding", "routing") or q["purpose"] not in ("research", "screening", "background"):
            raise ApiError()
        if type(q["required"]) is not bool or type(q["reverse"]) is not bool:
            raise ApiError()
        for key in ("min", "max"):
            v = q[key]
            if v is not None and (type(v) not in (int, float) or abs(v) > 1e9 or not math.isfinite(v)):
                raise ApiError()
        if not isinstance(q["choices"], list) or len(q["choices"]) > 30:
            raise ApiError()
        for choice in q["choices"]:
            c = object_fields(choice, ("code", "label"))
            text(c["code"], 16)
            text(c["label"], 160)
        if q["condition"] is not None:
            c = object_fields(q["condition"], ("questionId", "codes"))
            text(c["questionId"], 64)
            if not isinstance(c["codes"], list) or len(c["codes"]) > 30:
                raise ApiError()
            for code in c["codes"]:
                text(code, 16)
    if len(json.dumps(d, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")) > 300_000:
        raise ApiError(413, "design_too_large", "问卷超过300KB。")
    return d
