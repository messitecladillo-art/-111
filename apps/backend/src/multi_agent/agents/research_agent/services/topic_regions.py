"""Version-bound administrative geography, independent of API routing and storage.

The packaged directory is a 2025 year-end community compilation. Its presence
does not establish current official verification, local research or field access.
Historical names are retained as provenance and never followed by this matcher.
"""
from copy import deepcopy
from functools import lru_cache
import hashlib
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

from shared.errors import ApiError
from shared.contracts import strict_json, text

_ASSET_DIR = Path(__file__).resolve().parents[1] / "topic_assets"
_PROFILE_FIELDS = (
    "region", "city", "school", "schoolContext", "discipline", "interests", "domains",
    "days", "budgetYuan", "access", "resources", "sensitiveData", "referenceDate", "competitionWindow",
)
_SPECIAL_PROVINCE = {
    "150000": "内蒙古", "450000": "广西", "540000": "西藏", "640000": "宁夏",
    "650000": "新疆", "810000": "香港", "820000": "澳门",
}
_MUNICIPALITIES = {"110000", "120000", "310000", "500000"}


def _object(value, required, optional=()):
    if type(value) is not dict or set(value) != set(required) | (set(value) & set(optional)):
        raise ApiError()
    if any(type(key) is not str for key in value):
        raise ApiError()
    return value


def _string(value, maximum=160, *, empty=False):
    if type(value) is not str:
        raise ApiError()
    text(value, maximum, 0 if empty else 1)
    if value != value.strip() or re.search(r"[\x00-\x1f\x7f]", value):
        raise ApiError()
    return value


def _integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ApiError()
    return value


def _code(value):
    value = _string(value, 6)
    if not re.fullmatch(r"[1-9][0-9]{5}", value):
        raise ApiError()
    return value


def _rows(value, maximum):
    if type(value) is not list or len(value) > maximum:
        raise ApiError()
    return value


def _strings(value, maximum, length=1000):
    result = [_string(item, length) for item in _rows(value, maximum)]
    if len(set(result)) != len(result):
        raise ApiError()
    return result


def _https(value):
    value = _string(value, 2000)
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or re.search(r"[\s<>]", value):
            raise ValueError()
        parsed.port
    except ValueError:
        raise ApiError() from None
    return value


def parse_region_ref_shape(value):
    """Validate only the portable shape, for preserving historical project reads.

    Unknown codes/versions are intentionally retained here. Writes and execution
    must use region_ref_input. A caller handles an explicit null separately.
    """
    value = _object(value, ("code", "catalogVersion"))
    code, version = _code(value["code"]), _string(value["catalogVersion"], 100)
    if not re.fullmatch(r"cn-admin-[a-zA-Z0-9-]+", version):
        raise ApiError()
    return {"code": code, "catalogVersion": version}


def parse_region_catalog(value):
    """Validate catalog structure/parentage without resolving any historical name."""
    root = _object(value, ("schemaVersion", "catalogVersion", "asOf", "source", "coverage", "records", "historicalNames", "functionalAreas"))
    if type(root["schemaVersion"]) is not int or root["schemaVersion"] != 1:
        raise ApiError()
    version, as_of = _string(root["catalogVersion"], 100), _string(root["asOf"], 10)
    if not re.fullmatch(r"cn-admin-[a-zA-Z0-9-]+", version) or not re.fullmatch(r"[0-9]{4}-12-31", as_of):
        raise ApiError()
    year = int(as_of[:4])
    if not 1900 <= year <= 9999:
        raise ApiError()
    source = _object(root["source"], ("id", "repository", "commit", "rawPath", "rawSha256", "license", "officialSource", "verification"))
    _string(source["id"])
    for key in ("repository", "officialSource"):
        _https(source[key])
    if source["license"] != "CC0-1.0" or source["verification"] != "community_compilation_official_full_recheck_pending":
        raise ApiError()
    if not re.fullmatch(r"[a-f0-9]{40}", _string(source["commit"], 40)) or not re.fullmatch(r"[a-f0-9]{64}", _string(source["rawSha256"], 64)):
        raise ApiError()
    raw_path = _string(source["rawPath"], 300)
    if re.match(r"(?:[a-zA-Z]:|[\\/])", raw_path) or ".." in re.split(r"[\\/]", raw_path):
        raise ApiError()
    records = _rows(root["records"], 10000)
    index = {}
    for row in records:
        _object(row, ("code", "name", "level", "parentCode", "provinceCode", "startYear"))
        code = _code(row["code"])
        level = "province" if int(code) % 10000 == 0 else "prefecture" if int(code) % 100 == 0 else "county"
        if row["level"] != level or code in index:
            raise ApiError()
        _string(row["name"])
        _code(row["provinceCode"])
        if row["parentCode"] is not None:
            _code(row["parentCode"])
        _integer(row["startYear"], 1900, year)
        index[code] = row
    if not records:
        raise ApiError()
    for row in records:
        province, parent = index.get(row["provinceCode"]), index.get(row["parentCode"])
        if not province or province["level"] != "province" or row["provinceCode"] != row["code"][:2] + "0000":
            raise ApiError()
        if row["level"] == "province":
            if row["parentCode"] is not None:
                raise ApiError()
        elif not parent or parent["provinceCode"] != row["provinceCode"] or parent["level"] == "county" or row["level"] == "prefecture" and parent["level"] != "province":
            raise ApiError()
        if row["level"] == "county":
            encoded = row["code"][:4] + "00"
            if parent["level"] == "prefecture" and parent["code"] != encoded or index.get(encoded, {}).get("level") == "prefecture" and row["parentCode"] != encoded:
                raise ApiError()
    historical = _rows(root["historicalNames"], 20000)
    historical_keys = set()
    for row in historical:
        _object(row, ("code", "name", "parentCode", "startYear", "endYear", "candidateCodes", "relation"))
        _code(row["code"])
        _string(row["name"])
        if row["parentCode"] is not None:
            _code(row["parentCode"])
        start, end = _integer(row["startYear"], 1900, year), _integer(row["endYear"], 1900, year)
        identity = (row["code"], start, end, row["name"])
        if end <= start or row["relation"] != "historical_candidate" or identity in historical_keys:
            raise ApiError()
        historical_keys.add(identity)
        if any(_code(code) not in index for code in _strings(row["candidateCodes"], 100)):
            raise ApiError()
    functional_ids = set()
    for row in _rows(root["functionalAreas"], 5000):
        _object(row, ("id", "name", "kind", "regionCodes", "sourceIds", "classification"))
        identity = _string(row["id"], 100)
        _string(row["name"])
        if not re.fullmatch(r"[a-z][a-z0-9_.:-]*", identity) or identity in functional_ids or row["kind"] not in ("industrial_park", "campus", "tourism_area", "other") or row["classification"] not in ("curated", "user_defined"):
            raise ApiError()
        functional_ids.add(identity)
        codes, sources = _strings(row["regionCodes"], 100), _strings(row["sourceIds"], 30)
        if not codes or any(_code(code) not in index for code in codes) or row["classification"] == "curated" and not sources:
            raise ApiError()
    coverage = _object(root["coverage"], ("provinceCount", "prefectureCount", "countyCount", "provinceOnlyCodes", "countyContent", "limitations"))
    for level in ("province", "prefecture", "county"):
        if _integer(coverage[level + "Count"], 0, 20000) != sum(row["level"] == level for row in records):
            raise ApiError()
    if coverage["countyContent"] != "directory_only":
        raise ApiError()
    for code in _strings(coverage["provinceOnlyCodes"], 100):
        if _code(code) not in index or index[code]["level"] != "province" or any(row["parentCode"] == code for row in records):
            raise ApiError()
    _strings(coverage["limitations"], 30)
    return deepcopy(root)


def _load_region_assets(directory=None):
    """Load and validate exact packaged bytes, failing closed on asset corruption."""
    directory = _ASSET_DIR if directory is None else Path(directory)
    try:
        manifest_bytes = (directory / "regions.manifest.json").read_bytes()
        raw = (directory / "regions.catalog.json").read_bytes()
        if len(manifest_bytes) > 4096 or len(raw) > 4_000_000:
            raise ValueError("Region asset size")
        manifest = _object(strict_json(manifest_bytes.decode("utf-8")), ("schemaVersion", "catalogVersion", "asOf", "bytes", "sha256"))
        if type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 1:
            raise ApiError()
        hashes = _object(manifest["sha256"], ("regions.catalog.json",))
        digest = _string(hashes["regions.catalog.json"], 64)
        if not re.fullmatch(r"[a-f0-9]{64}", digest) or hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError("Region catalog hash mismatch")
        if _integer(manifest["bytes"], 1, 4_000_000) != len(raw):
            raise ValueError("Region catalog size mismatch")
        catalog = parse_region_catalog(strict_json(raw.decode("utf-8")))
        if manifest["catalogVersion"] != catalog["catalogVersion"] or manifest["asOf"] != catalog["asOf"]:
            raise ValueError("Region catalog identity mismatch")
        return catalog, {"catalogVersion": catalog["catalogVersion"], "asOf": catalog["asOf"], "catalogSha256": digest}
    except (OSError, UnicodeError, ValueError, TypeError, ApiError, RecursionError) as error:
        raise RuntimeError("Region catalog assets are missing, corrupt or inconsistent") from error


def load_region_catalog(directory=None):
    """Detached catalog validated against its packaged manifest and exact bytes."""
    return _load_region_assets(directory)[0]


@lru_cache(maxsize=1)
def _runtime():
    catalog, binding = _load_region_assets()
    return catalog, {row["code"]: row for row in catalog["records"]}, binding


def get_catalog_meta():
    """Detached metadata suitable for a future API, without current-official claims."""
    catalog, _, _ = _runtime()
    return deepcopy({key: catalog[key] for key in ("schemaVersion", "catalogVersion", "asOf", "source", "coverage")})


def region_ref_input(value):
    """Strict current reference for writes/execution; explicit null is caller-owned."""
    result = parse_region_ref_shape(value)
    catalog, index, _ = _runtime()
    if result["catalogVersion"] != catalog["catalogVersion"]:
        raise ApiError(422, "region_catalog_mismatch", "地区引用属于其他目录版本，请重新选择并确认。")
    if result["code"] not in index:
        raise ApiError(422, "unknown_region", "地区未在该目录版本中登记。")
    return result


def region_path(value):
    """Actual canonical parent chain; codes never imply a virtual prefecture."""
    _, index, _ = _runtime()
    code = _code(value) if type(value) is str else region_ref_input(value)["code"]
    if code not in index:
        raise ApiError(422, "unknown_region", "地区未在该目录版本中登记。")
    result, visited = [], set()
    while code is not None:
        if code in visited or code not in index:
            raise RuntimeError("Region catalog parent chain is inconsistent")
        visited.add(code)
        row = index[code]
        result.insert(0, deepcopy(row))
        code = row["parentCode"]
    return result


def region_names(value):
    """Canonical display names only; this does not rewrite any profile's text."""
    path = region_path(value)
    return {"region": path[0]["name"], "city": path[-1]["name"] if len(path) > 1 else "", "path": [row["name"] for row in path]}


def profile_input_v2(value, legacy_validator, *, require_current=True):
    """Reuse the caller's v1 parser, avoiding a circular import or parallel runtime.

    Historical reads may explicitly pass require_current=False. That mode only
    preserves the ref shape; matching/execution still validates current identity.
    """
    value = _object(value, (*_PROFILE_FIELDS, "schemaVersion", "regionRef"))
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 2 or type(require_current) is not bool:
        raise ApiError()
    reference = value["regionRef"]
    if reference is not None:
        reference = region_ref_input(reference) if require_current else parse_region_ref_shape(reference)
    try:
        legacy = legacy_validator(deepcopy({key: value[key] for key in _PROFILE_FIELDS}))
    except (OverflowError, ValueError, UnicodeError, TypeError):
        raise ApiError() from None
    return {**legacy, "schemaVersion": 2, "regionRef": reference}


def _key(value):
    if type(value) is not str:
        raise ApiError()
    text(value, 160)
    if "\x7f" in value:
        raise ApiError()
    return unicodedata.normalize("NFKC", value).strip()


def _aliases(row):
    if row["level"] == "province":
        short = _SPECIAL_PROVINCE.get(row["code"], re.sub(r"(?:省|市)$", "", row["name"]))
    elif row["level"] == "prefecture":
        short = re.sub(r"(?:市|地区|盟)$", "", row["name"])
    else:
        short = ""
    return {_key(row["name"])} | ({_key(short)} if short else set())


def region_catalog_binding():
    """Exact immutable catalog identity for receipts and v2 input fingerprints."""
    return deepcopy(_runtime()[2])


def profile_region_status(profile):
    """Shape-only status for historical reads; no automatic code migration."""
    profile = _object(profile, ("region", "city"), tuple(key for key in _PROFILE_FIELDS if key not in ("region", "city")) + ("schemaVersion", "regionRef"))
    _key(profile["region"])
    _key(profile["city"])
    if "schemaVersion" not in profile:
        if "regionRef" in profile:
            raise ApiError()
        return "legacy"
    if type(profile["schemaVersion"]) is not int or profile["schemaVersion"] != 2 or "regionRef" not in profile:
        raise ApiError()
    if profile["regionRef"] is None:
        return "unset"
    reference = parse_region_ref_shape(profile["regionRef"])
    catalog, index, _ = _runtime()
    return "current" if reference["catalogVersion"] == catalog["catalogVersion"] and reference["code"] in index else "migration_required"


def assert_profile_region_executable(profile):
    status = profile_region_status(profile)
    if status == "migration_required":
        region_ref_input(profile["regionRef"])
    return status


def _scope(profile):
    status = assert_profile_region_executable(profile)
    if status == "legacy":
        region, city = _key(profile["region"]), _key(profile["city"])
        return ({region} if region else set()), ({city} if city else set()), []
    if status == "unset":
        return set(), set(), []
    path = region_path(profile["regionRef"])
    province_names = _aliases(path[0])
    local_names = set().union(*(_aliases(row) for row in path[1:]))
    if path[0]["code"] in _MUNICIPALITIES:
        local_names.update(_aliases(path[0]))
    return province_names, local_names, path


def region_resolution(profile):
    """Canonical prompt context beside retained user text, without rewriting it."""
    status = assert_profile_region_executable(profile)
    result = {"status": status, "path": []}
    if status != "legacy":
        result.update(regionRef=deepcopy(profile["regionRef"]), catalog=region_catalog_binding(), countyContent="directory_only")
    if status == "current":
        result["path"] = region_path(profile["regionRef"])
    return result


@lru_cache(maxsize=1)
def _county_name_index():
    result = {}
    for row in _runtime()[0]["records"]:
        if row["level"] == "county":
            result.setdefault(_key(row["name"]), []).append(row)
    return result


def _local_source_name_matches(key, local_names, path, source_provinces):
    if key not in local_names:
        return False
    if not path:  # Legacy exact text contract remains unchanged.
        return True
    if any(key in _aliases(row) for row in path if row["level"] == "prefecture" or row["code"] in _MUNICIPALITIES):
        return True
    county = next((row for row in path if row["level"] == "county" and key in _aliases(row)), None)
    if county is None:
        return False
    declared = {row["code"] for row in _runtime()[0]["records"] if row["level"] == "province" and any(_key(label) in _aliases(row) for label in source_provinces)}
    candidates = [row for row in _county_name_index().get(key, []) if not declared or row["provinceCode"] in declared]
    return len(candidates) == 1 and candidates[0]["code"] == county["code"]


def profile_geography_fit(profile, region_tags, city_tags):
    """Return exact/transferable/unknown/mismatch without inventing local scope.

    Empty tag lists impose no constraint. For v2 refs only the selected node's
    current ancestor chain is authoritative. County tags never broaden to a
    prefecture/sibling county. Event inclusion separately needs a known scope.
    The complete profile must first pass its v1/v2 profile input parser.
    """
    province_names, local_names, path = _scope(profile)
    region_tags = {_key(tag) for tag in _rows(region_tags, 100)}
    city_tags = {_key(tag) for tag in _rows(city_tags, 100)}
    if not region_tags and not city_tags:
        return "transferable"
    unknown = False
    for expected, available, local in ((region_tags, province_names, False), (city_tags, local_names, True)):
        if not expected:
            continue
        if not available:
            unknown = True
        elif not any(_local_source_name_matches(tag, local_names, path, region_tags) if local else tag in available for tag in expected):
            return "mismatch"
    return "unknown" if unknown else "exact"


def matches_profile_geography(profile, region_tags, city_tags):
    """Constraint-only predicate: unknown does not block, and earns no local fit."""
    return profile_geography_fit(profile, region_tags, city_tags) != "mismatch"


def event_region_includes_profile(profile, geography):
    """Positive event scope, separate from unknown/nonblocking constraints."""
    if profile_region_status(profile) == "migration_required":
        return False
    if type(geography) is not dict:
        raise ApiError()
    level = geography.get("level")
    if level in ("national", "province", "city"):
        geography = _object(geography, ("level", "region", "city"))
    elif level == "county":
        geography = _object(geography, ("level", "region", "city", "schemaVersion", "regionRef"))
        if type(geography["schemaVersion"]) is not int or geography["schemaVersion"] != 2:
            raise ApiError()
        parse_region_ref_shape(geography["regionRef"])
    else:
        raise ApiError()
    region, city = _key(geography["region"]), _key(geography["city"])
    province_names, local_names, path = _scope(profile)
    if level == "national":
        return True
    if level == "province":
        return bool(region) and region in province_names
    if level == "city":
        return bool(city) and _local_source_name_matches(city, local_names, path, [region]) and (not region or region in province_names)
    reference = geography["regionRef"]
    if not path or reference["catalogVersion"] != region_catalog_binding()["catalogVersion"]:
        return False
    row = next((row for row in path if row["code"] == reference["code"] and row["level"] == "county"), None)
    # The explicit county ref is authoritative. A display city may name that
    # county or its actual city ancestry (including 北京/北京市), never a sibling.
    return bool(row) and (not region or region in province_names) and (not city or city in local_names)
