"""Project memory: the confirmed research intent, decisions and open questions of one project."""
from copy import deepcopy
import json

from shared.contracts import canonical, fingerprint, object_fields, text
from shared.errors import ApiError

INTENT_FIELDS = ("title", "researchQuestion", "decisionGoal", "population", "geography", "stage")
DECISION_SCOPES = ("rules", "design", "sampling", "analysis", "report", "general")
SOURCE_KINDS = ("user", "topic", "diagnosis", "rules", "agent", "import")
MAX_INTENT = 600
MAX_STATEMENT = 1200
MAX_RATIONALE = 2000
MAX_QUESTION = 1200
MAX_WHY = 1000
MAX_DOCUMENT_BYTES = 48000
MAX_BRIEF_CHARS = 2000


def _source(value):
    object_fields(value, ("kind",), ("ref", "revision", "hash", "conversationId", "turnId", "serviceId"))
    if value["kind"] not in SOURCE_KINDS:
        raise ApiError()
    if "ref" in value:
        text(value["ref"], 120, 1)
    return deepcopy(value)


def _intent(value):
    object_fields(value, INTENT_FIELDS)
    for field in INTENT_FIELDS:
        item = value[field]
        object_fields(item, ("value", "status"), ("source", "confirmedBy", "confirmedAt"))
        if item["status"] not in ("confirmed", "unknown"):
            raise ApiError()
        text(item["value"], MAX_INTENT)
        if "source" in item:
            _source(item["source"])
        if "confirmedBy" in item:
            text(item["confirmedBy"], 64, 1)
        if "confirmedAt" in item:
            text(item["confirmedAt"], 40, 1)
    return deepcopy(value)


def _decisions(value):
    if not isinstance(value, list) or len(value) > 200:
        raise ApiError()
    seen = set()
    for item in value:
        object_fields(item, ("id", "statement", "rationale", "scope", "status"), ("source", "confirmedBy", "confirmedAt", "supersedes"))
        if not isinstance(item["id"], str) or not item["id"] or item["id"] in seen:
            raise ApiError()
        seen.add(item["id"])
        text(item["statement"], MAX_STATEMENT, 1)
        text(item["rationale"], MAX_RATIONALE)
        if item["scope"] not in DECISION_SCOPES or item["status"] not in ("confirmed", "superseded", "revoked"):
            raise ApiError()
        if "source" in item:
            _source(item["source"])
        if "confirmedBy" in item:
            text(item["confirmedBy"], 64, 1)
        if "confirmedAt" in item:
            text(item["confirmedAt"], 40, 1)
        if "supersedes" in item and item["supersedes"] is not None:
            text(item["supersedes"], 64, 1)
    return deepcopy(value)


def _questions(value):
    if not isinstance(value, list) or len(value) > 100:
        raise ApiError()
    seen = set()
    for item in value:
        object_fields(item, ("id", "question", "why", "next", "status", "createdAt"), ("source", "resolvedBy"))
        if not isinstance(item["id"], str) or not item["id"] or item["id"] in seen:
            raise ApiError()
        seen.add(item["id"])
        text(item["question"], MAX_QUESTION, 1)
        text(item["why"], MAX_WHY)
        text(item["next"], MAX_WHY)
        text(item["createdAt"], 40, 1)
        if item["status"] not in ("open", "resolved"):
            raise ApiError()
        if "source" in item:
            _source(item["source"])
        if "resolvedBy" in item:
            text(item["resolvedBy"], 64, 1)
    return deepcopy(value)


def document(value):
    object_fields(value, ("schemaVersion", "intent", "decisions", "openQuestions"))
    if value["schemaVersion"] != 1:
        raise ApiError()
    result = {
        "schemaVersion": 1,
        "intent": _intent(value["intent"]),
        "decisions": _decisions(value["decisions"]),
        "openQuestions": _questions(value["openQuestions"]),
    }
    if len(canonical(result).encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise ApiError(422, "memory_too_large", "项目记忆超过大小上限。")
    return result


def content_hash(value):
    return fingerprint(document(value))


def seed(project_title, topic=None):
    title = (topic or {}).get("title") or project_title
    intent = {"title": str(title)}
    if topic:
        for source_key, target in (("problem", "researchQuestion"), ("population", "population"), ("geography", "geography")):
            if topic.get(source_key):
                intent[target] = str(topic[source_key])
    return {
        "intent": intent,
        "source": {"kind": "topic" if topic else "import", "ref": (topic or {}).get("versionId", "project-title")},
    }


def _clip(value, limit):
    return value if len(value) <= limit else value[: limit - 1] + "…"


def brief(value, revision=0):
    doc = document(value)
    confirmed = [item for item in doc["decisions"] if item["status"] == "confirmed"]
    result = {
        "schemaVersion": 1,
        "available": True,
        "revision": revision,
        "intent": {field: _clip(doc["intent"][field]["value"], 160) for field in INTENT_FIELDS if doc["intent"][field]["status"] == "confirmed"},
        "decisions": [
            {"id": item["id"], "statement": _clip(item["statement"], 160), "rationale": _clip(item["rationale"], 120)}
            for item in confirmed[:8]
        ],
        "openQuestions": [
            {"id": item["id"], "question": _clip(item["question"], 140), "next": _clip(item["next"], 100)}
            for item in doc["openQuestions"] if item["status"] == "open"
        ][:5],
    }
    while len(json.dumps(result, ensure_ascii=False)) > MAX_BRIEF_CHARS and result["decisions"]:
        result["decisions"].pop()
    while len(json.dumps(result, ensure_ascii=False)) > MAX_BRIEF_CHARS and result["openQuestions"]:
        result["openQuestions"].pop()
    return result
