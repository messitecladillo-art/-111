"""Project-owned topic briefs and exact-version decisions, without competition Gate effects."""
from datetime import datetime, timezone
import re
from urllib.parse import urlsplit


from shared.errors import ApiError
from shared.contracts import canonical, object_fields, text
from multi_agent.agents.research_agent.services.topics import ACCESS, RESOURCES, day, profile_input
from multi_agent.agents.research_agent.services.topic_regions import assert_profile_region_executable

MAX_DOCUMENT_BYTES = 300_000
ID_PATTERN = r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}"






def value_text(value, maximum, required=False):
    text(value, maximum)
    if "\x7f" in value or required and not value.strip():
        raise ApiError()
    return value


def identifier(value):
    value_text(value, 100, True)
    if not re.fullmatch(ID_PATTERN, value) or value in ("__proto__", "prototype", "constructor"):
        raise ApiError()
    return value


def rows(value, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise ApiError()
    return value


def strings(value, maximum, length, allowed=None, ids=False):
    result = [(identifier(item) if ids else value_text(item, length, True)) for item in rows(value, maximum)]
    if len(set(result)) != len(result) or allowed is not None and any(item not in allowed for item in result):
        raise ApiError()
    return result


def unique_rows(value):
    ids = [identifier(item["id"]) for item in value]
    if len(set(ids)) != len(ids):
        raise ApiError()
    return set(ids)


def candidate_input(value):
    c = object_fields(value, ("title", "decisionOwner", "decision", "population", "geography", "accessNeeds", "resourceNeeds", "evidencePlan", "differentiators", "action", "sensitive"))
    for key, maximum in (("title", 200), ("decisionOwner", 160), ("decision", 600), ("population", 300), ("geography", 160), ("evidencePlan", 1200), ("action", 600)):
        value_text(c[key], maximum)
    strings(c["accessNeeds"], 30, 100, ACCESS)
    strings(c["resourceNeeds"], 30, 100, RESOURCES)
    strings(c["differentiators"], 8, 300)
    if type(c["sensitive"]) is not bool:
        raise ApiError()
    return c


def timestamp(value):
    if value is None:
        return
    value_text(value, 40, True)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.utcoffset() is None:
            raise ValueError()
    except ValueError:
        raise ApiError() from None


def source_input(value):
    s = object_fields(value, ("id", "title", "url", "locator", "coverage", "publishedAt", "retrievedAt"), ("snippet",))
    identifier(s["id"])
    value_text(s["title"], 300, True)
    value_text(s["url"], 2048)
    value_text(s["locator"], 1000)
    if "snippet" in s:
        value_text(s["snippet"], 4000)
    if s["coverage"] not in ("fulltext", "listing_only", "reference", "search_excerpt"):
        raise ApiError()
    for key in ("publishedAt", "retrievedAt"):
        day(s[key], empty=True)
    if s["url"]:
        try:
            url = urlsplit(s["url"])
            if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or re.search(r"[\s<>\x00-\x1f]", s["url"]):
                raise ValueError()
            url.port
        except ValueError:
            raise ApiError() from None


def topic_document(value, *, require_current=True):
    """Strict v1/v2 contract; historical reads may preserve old reference shapes."""
    d = object_fields(value, ("schemaVersion", "profile", "candidate", "shortlistIds", "selected", "brief", "verification", "provenance"))
    if type(d["schemaVersion"]) is not int or d["schemaVersion"] not in (1, 2):
        raise ApiError()
    profile = d["profile"]
    if not isinstance(profile, dict) or (d["schemaVersion"] == 1 and ("schemaVersion" in profile or "regionRef" in profile)) or (d["schemaVersion"] == 2 and (type(profile.get("schemaVersion")) is not int or profile.get("schemaVersion") != 2 or "regionRef" not in profile)):
        raise ApiError()
    # Reads never rewrite the immutable snapshot; writes/execution require current refs.
    try:
        profile_input(profile, require_current=require_current)
    except (OverflowError, ValueError):
        # Extremely large JSON integers must remain a 422, not overflow the
        # existing profile parser's finite-number conversion into a 500.
        raise ApiError() from None
    if d["candidate"] is not None:
        candidate_input(d["candidate"])
    shortlist = strings(d["shortlistIds"], 3, 100, ids=True)
    if d["selected"] is not None:
        selected = object_fields(d["selected"], ("kind", "id", "title"))
        if selected["kind"] not in ("pattern", "custom"):
            raise ApiError()
        identifier(selected["id"])
        value_text(selected["title"], 200)
        if selected["kind"] == "pattern" and selected["id"] not in shortlist:
            raise ApiError(422, "invalid_reference", "选中的模式须在候选列表中。")
    b = object_fields(d["brief"], ("title", "decisionOwner", "decision", "population", "geography", "inclusion", "exclusion", "evidencePlan", "questions", "constructs", "differentiators", "unknowns", "firstWeekPlan", "sources"))
    for key, maximum in (("title", 200), ("decisionOwner", 160), ("decision", 600), ("population", 300), ("geography", 160), ("inclusion", 1200), ("exclusion", 1200), ("evidencePlan", 3000)):
        value_text(b[key], maximum)
    questions = rows(b["questions"], 12)
    for question in questions:
        q = object_fields(question, ("id", "text"))
        identifier(q["id"])
        value_text(q["text"], 1200)
    question_ids = unique_rows(questions)
    constructs = rows(b["constructs"], 20)
    for construct in constructs:
        c = object_fields(construct, ("id", "name", "questionIds"))
        identifier(c["id"])
        value_text(c["name"], 160)
        strings(c["questionIds"], 12, 100, question_ids, ids=True)
    unique_rows(constructs)
    for key, maximum, length in (("differentiators", 8, 600), ("unknowns", 20, 1200), ("firstWeekPlan", 12, 1200)):
        strings(b[key], maximum, length)
    sources = rows(b["sources"], 40)
    for source in sources:
        source_input(source)
    source_ids = unique_rows(sources)
    checks = rows(d["verification"], 30)
    for check in checks:
        v = object_fields(check, ("id", "title", "status", "note", "sourceRefs", "recordedAt"))
        identifier(v["id"])
        value_text(v["title"], 300)
        value_text(v["note"], 3000)
        if v["status"] not in ("planned", "in_progress", "supported", "not_supported", "inconclusive"):
            raise ApiError()
        strings(v["sourceRefs"], 40, 100, source_ids, ids=True)
        timestamp(v["recordedAt"])
    unique_rows(checks)
    p = object_fields(d["provenance"], ("catalogVersion", "modelVersion", "sourceIds"))
    value_text(p["catalogVersion"], 150)
    value_text(p["modelVersion"], 150)
    strings(p["sourceIds"], 40, 100, source_ids, ids=True)
    if len(canonical(d).encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise ApiError(413, "payload_too_large", "选题草稿超过300KB，请精简资料。")
    return d


def confirmable(document):
    assert_profile_region_executable(document["profile"])
    brief = document["brief"]
    if any(not brief[key].strip() for key in ("title", "decisionOwner", "decision", "population", "geography")) or not any(q["text"].strip() for q in brief["questions"]):
        raise ApiError(422, "brief_incomplete", "请补充题目、决策对象、决策、人群、地域和至少一个研究问题。")


def version_view(item):
    return {"id": item.id, "revision": item.revision, "contentHash": item.content_hash,
            "createdAt": item.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), "createdBy": item.created_by}
