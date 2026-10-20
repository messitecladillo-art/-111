import hashlib
import json
import math
import re
from uuid import UUID
from shared.errors import ApiError




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
