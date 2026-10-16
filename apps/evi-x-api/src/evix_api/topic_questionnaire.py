"""Deterministic topic field transfer and immutable questionnaire sidecars.

Call prepare_binding_save only while holding the project's edit lock. No model,
queue or external service participates in this transaction.
"""
import copy
import re

from sqlalchemy import select

from .contracts import ApiError, body, integer, object_fields, questionnaire, text, uuid_string
from .models import QuestionnaireTopicBinding, QuestionnaireTopicBindingSource, Version
from .topic_projects import (TopicProjectDecision, TopicProjectVersion, identifier, rows,
                             source_input, strings, timestamp, unique_rows, value_text, version_view)
from .topic_transfer_hash import topic_transfer_hash
from .topic_regions import assert_profile_region_executable

HASH_CONTRACT = "evix-topic-transfer-json/1"
BINDING_SCHEMA = "topic-questionnaire-binding/v1"
_BRIEF_FIELDS = {"title", "objective", "population", "geography", "pilotNotes"}
_QUESTION_FIELDS = {"researchQuestion", "construct"}
_JS_SPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def transfer_hash(value):
    try:
        return topic_transfer_hash(value)
    except ValueError:
        raise ApiError(422, "invalid_binding", "关联数据结构或大小无效。") from None


def _hash(value, nullable=False):
    if nullable and value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
        raise ApiError()
    return value


def _trim(value):
    return value.strip(_JS_SPACE)


def _length(value):
    return len(value.encode("utf-16-le")) // 2


def _brief(value):
    b = object_fields(value, ("title", "decisionOwner", "decision", "population", "geography", "inclusion", "exclusion", "evidencePlan", "questions", "constructs", "differentiators", "unknowns", "firstWeekPlan", "sources"))
    for key, maximum in (("title", 200), ("decisionOwner", 160), ("decision", 600), ("population", 300), ("geography", 160), ("inclusion", 1200), ("exclusion", 1200), ("evidencePlan", 3000)):
        value_text(b[key], maximum)
    for question in rows(b["questions"], 12):
        q = object_fields(question, ("id", "text"))
        identifier(q["id"])
        value_text(q["text"], 1200)
    question_ids = unique_rows(b["questions"])
    for construct in rows(b["constructs"], 20):
        c = object_fields(construct, ("id", "name", "questionIds"))
        identifier(c["id"])
        value_text(c["name"], 160)
        strings(c["questionIds"], 12, 100, question_ids, ids=True)
    unique_rows(b["constructs"])
    for key, maximum, length in (("differentiators", 8, 600), ("unknowns", 20, 1200), ("firstWeekPlan", 12, 1200)):
        strings(b[key], maximum, length)
    for source in rows(b["sources"], 40):
        source_input(source)
    unique_rows(b["sources"])
    return b


def _version(value):
    v = object_fields(value, ("id", "revision", "contentHash", "createdAt", "createdBy"))
    identifier(v["id"])
    identifier(v["createdBy"])
    integer(v["revision"], 1)
    _hash(v["contentHash"])
    value_text(v["createdAt"], 40, True)
    timestamp(v["createdAt"])
    return v


def _question_id(value):
    text(value, 64, 1)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ApiError()
    return value


def _reference(value):
    r = object_fields(value, ("baseVersionId", "baseRevision", "contentHash"))
    if r["baseVersionId"] is not None:
        identifier(r["baseVersionId"])
    integer(r["baseRevision"], 0)
    if (r["baseVersionId"] is None) != (r["baseRevision"] == 0):
        raise ApiError()
    _hash(r["contentHash"])
    return r


def _mapping(value, brief, design=None):
    m = object_fields(value, ("questionId", "researchQuestionIds", "constructIds"))
    _question_id(m["questionId"])
    question_ids = strings(m["researchQuestionIds"], 12, 100, ids=True)
    construct_ids = strings(m["constructIds"], 20, 100, ids=True)
    questions = {q["id"] for q in brief["questions"]}
    constructs = {c["id"]: c for c in brief["constructs"]}
    if (not question_ids and not construct_ids or any(q not in questions for q in question_ids)
            or any(c not in constructs for c in construct_ids)
            or any(q not in question_ids for c in construct_ids for q in constructs[c]["questionIds"])
            or design is not None and not any(q["id"] == m["questionId"] for q in design["questions"])):
        raise ApiError(422, "invalid_reference", "题目与研究问题或概念的关联已变化。")
    return m


def binding_input(value):
    """Strict historical ledger parsing; deleted current questions remain historical."""
    if value is None:
        return None
    transfer_hash(value)  # Enforce bounded ordinary JSON before inspecting it.
    b = object_fields(value, ("schema", "classification", "sources", "applications"))
    if b["schema"] != BINDING_SCHEMA or b["classification"] != "proposed":
        raise ApiError()
    sources = {}
    for source in rows(b["sources"], 80):
        s = object_fields(source, ("version", "briefHash", "brief"))
        v = _version(s["version"])
        _brief(s["brief"])
        if v["id"] in sources or _hash(s["briefHash"]) != transfer_hash(s["brief"]):
            raise ApiError(422, "invalid_binding", "历史研究简报与指纹不符。")
        sources[v["id"]] = s
    seen = set()
    for application in rows(b["applications"], 400):
        a = object_fields(application, ("proposalId", "sourceVersionId", "sourceContentHash", "sourceBriefHash", "before", "after", "changes"))
        proposal_id = _hash(a["proposalId"])
        s = sources.get(identifier(a["sourceVersionId"]))
        if proposal_id in seen or not s or _hash(a["sourceContentHash"]) != s["version"]["contentHash"] or _hash(a["sourceBriefHash"]) != s["briefHash"]:
            raise ApiError(422, "invalid_binding", "历史关联的精确选题版本不存在。")
        seen.add(proposal_id)
        _reference(a["before"])
        _reference(a["after"])
        changes = rows(a["changes"], 165)
        ids = set()
        for change in changes:
            c = object_fields(change, ("id", "kind", "field", "questionId", "researchQuestionIds", "constructIds"))
            text(c["id"], 120)
            if c["id"] in ids:
                raise ApiError()
            ids.add(c["id"])
            rqs = strings(c["researchQuestionIds"], 12, 100, ids=True)
            cs = strings(c["constructIds"], 20, 100, ids=True)
            if c["kind"] == "brief":
                if not isinstance(c["field"], str) or c["field"] not in _BRIEF_FIELDS or c["id"] != "brief:" + c["field"] or c["questionId"] is not None or rqs or cs:
                    raise ApiError()
            elif c["kind"] == "question" and isinstance(c["field"], str) and c["field"] in _QUESTION_FIELDS:
                qid = _question_id(c["questionId"])
                if c["id"] != f"question:{qid}:{c['field']}" or c["field"] == "researchQuestion" and (not rqs or cs) or c["field"] == "construct" and not cs:
                    raise ApiError()
                _mapping({"questionId": qid, "researchQuestionIds": rqs, "constructIds": cs}, s["brief"])
            else:
                raise ApiError()
        if not changes:
            raise ApiError()
    return b


def rebuild_transfer(source, target, mappings, before_binding, selected_ids):
    """Reproduce the unpublished TS core without accepting a caller-owned ledger."""
    source = copy.deepcopy(object_fields(source, ("brief", "version", "dirty", "decisionRevision")))
    if source["dirty"] is not False:
        raise ApiError()
    integer(source["decisionRevision"], 1)
    b = _brief(source["brief"])
    _version(source["version"])
    target = copy.deepcopy(object_fields(target, ("design", "pending", "versionId", "revision")))
    if target["pending"] is not False:
        raise ApiError()
    _reference({"baseVersionId": target["versionId"], "baseRevision": target["revision"], "contentHash": transfer_hash(target["design"])})
    before = questionnaire(target["design"])
    mappings = copy.deepcopy(rows(mappings, 80))
    mapped = set()
    for m in mappings:
        _mapping(m, b, before)
        if m["questionId"] in mapped:
            raise ApiError()
        mapped.add(m["questionId"])
    previous = copy.deepcopy(binding_input(before_binding))
    brief_hash = transfer_hash(b)
    source_fingerprint = transfer_hash(source)
    target_fingerprint = transfer_hash(target)
    binding_fingerprint = None if previous is None else transfer_hash(previous)
    proposal_id = transfer_hash({"sourceFingerprint": source_fingerprint, "targetFingerprint": target_fingerprint, "bindingFingerprint": binding_fingerprint, "mappings": mappings})
    fields = []

    def field(kind, key, qid, after, maximum, rqs=None, cs=None, blank=False):
        fields.append({"id": "brief:" + key if kind == "brief" else f"question:{qid}:{key}", "kind": kind, "field": key,
                       "questionId": qid, "researchQuestionIds": list(rqs or []), "constructIds": list(cs or []),
                       "after": after, "invalid": _length(after) > maximum or blank})

    candidates = [
        ("title", b["title"], 160),
        ("objective", "\n".join((["决策主体：" + b["decisionOwner"]] if _trim(b["decisionOwner"]) else []) + (["决策问题：" + b["decision"]] if _trim(b["decision"]) else [])), 600),
        ("population", "\n".join(s for s in [b["population"], "纳入：" + b["inclusion"] if _trim(b["inclusion"]) else "", "排除：" + b["exclusion"] if _trim(b["exclusion"]) else ""] if _trim(s)), 160),
        ("geography", b["geography"], 160),
        ("pilotNotes", "\n".join((["拟议证据计划：" + b["evidencePlan"]] if _trim(b["evidencePlan"]) else []) + (["拟议首周计划：\n" + "\n".join(b["firstWeekPlan"])] if b["firstWeekPlan"] else [])), 2000),
    ]
    for key, after, maximum in candidates:
        if _trim(after) and after != before[key]:
            field("brief", key, None, after, maximum)
    for m in mappings:
        rqs = [next(q for q in b["questions"] if q["id"] == qid) for qid in m["researchQuestionIds"]]
        cs = [next(c for c in b["constructs"] if c["id"] == cid) for cid in m["constructIds"]]
        if rqs:
            field("question", "researchQuestion", m["questionId"], "\n".join(q["text"] for q in rqs), 500, m["researchQuestionIds"], blank=any(not _trim(q["text"]) for q in rqs))
        if cs:
            field("question", "construct", m["questionId"], "\n".join(c["name"] for c in cs), 120, m["researchQuestionIds"], m["constructIds"], any(not _trim(c["name"]) for c in cs))
    selection = rows(selected_ids, 165)
    for item in selection:
        text(item, 120)
    if not selection or len(set(selection)) != len(selection) or any(item not in {f["id"] for f in fields} for item in selection):
        raise ApiError(422, "invalid_selection", "请选择不重复的有效修改项。")
    chosen = [f for f in fields if f["id"] in selection]
    if any(f["invalid"] for f in chosen):
        raise ApiError(422, "transfer_field_invalid", "所选字段为空或超过上限，未截断或清空问卷内容。")
    after = copy.deepcopy(before)
    for f in chosen:
        if f["kind"] == "brief":
            after[f["field"]] = f["after"]
        else:
            next(q for q in after["questions"] if q["id"] == f["questionId"])[f["field"]] = f["after"]
    questionnaire(after)
    provenance = {"proposalId": proposal_id, "sourceVersionId": source["version"]["id"], "sourceContentHash": source["version"]["contentHash"], "sourceBriefHash": brief_hash,
                  "before": {"baseVersionId": target["versionId"], "baseRevision": target["revision"], "contentHash": transfer_hash(before)},
                  "after": {"baseVersionId": target["versionId"], "baseRevision": target["revision"], "contentHash": transfer_hash(after)},
                  "changes": [{k: v for k, v in f.items() if k not in ("after", "invalid")} for f in chosen]}
    binding = previous or {"schema": BINDING_SCHEMA, "classification": "proposed", "sources": [], "applications": []}
    if any(a["proposalId"] == proposal_id for a in binding["applications"]):
        raise ApiError(409, "duplicate_application", "本提案已采纳。")
    snapshot = {"version": source["version"], "briefHash": brief_hash, "brief": b}
    existing = next((s for s in binding["sources"] if s["version"]["id"] == source["version"]["id"]), None)
    if existing is not None and transfer_hash(existing) != transfer_hash(snapshot):
        raise ApiError(422, "invalid_binding", "同一选题版本出现不同内容。")
    if existing is None:
        binding["sources"].append(snapshot)
    binding["applications"].append(provenance)
    binding_input(binding)
    return {"proposalId": proposal_id, "before": copy.deepcopy(before), "after": after, "beforeBinding": copy.deepcopy(before_binding),
            "binding": binding, "provenance": provenance, "mappings": mappings}


async def questionnaire_save_body(request):
    """Keep the legacy raw 350KB cap; allow the two-design apply envelope 1MB."""
    class CountedRequest:
        headers = request.headers
        size = 0

        async def stream(self):
            async for chunk in request.stream():
                self.size += len(chunk)
                yield chunk

    counted = CountedRequest()
    data = await body(counted, ("design", "expectedRevision", "idempotencyKey"), ("sourceProposalId", "topicBindingMutation"), limit=1_000_000)
    advertised = request.headers.get("content-length")
    if "topicBindingMutation" not in data and (counted.size > 350_000 or advertised and int(advertised) > 350_000):
        raise ApiError(413, "payload_too_large", "请求内容超过上限。")
    return data


def _authentic_binding(session, project_id, value):
    b = binding_input(value)
    if b is None:
        return None
    for source in b["sources"]:
        row = session.execute(select(TopicProjectVersion).where(TopicProjectVersion.project_id == project_id, TopicProjectVersion.id == source["version"]["id"])).scalar_one_or_none()
        if row is None or transfer_hash(version_view(row)) != transfer_hash(source["version"]) or transfer_hash(row.document["brief"]) != source["briefHash"]:
            raise ApiError(409, "binding_integrity", "历史选题来源与保存记录不符。")
    return b


def _load_binding(session, version):
    if version is None:
        return None
    row = session.execute(select(QuestionnaireTopicBinding).where(QuestionnaireTopicBinding.project_id == version.project_id, QuestionnaireTopicBinding.version_id == version.id)).scalar_one_or_none()
    if row is None:
        return None
    b = _authentic_binding(session, version.project_id, row.binding)
    if row.binding_hash != (None if b is None else transfer_hash(b)) or row.design_transfer_hash != transfer_hash(version.design):
        raise ApiError(409, "binding_integrity", "问卷关联与保存指纹不符。")
    return row


def topic_binding_receipt(session, version):
    row = _load_binding(session, version)
    return {"versionId": version.id, "binding": copy.deepcopy(row.binding) if row else None,
            "bindingHash": row.binding_hash if row else None, "designTransferHash": transfer_hash(version.design)}


def prepare_binding_save(session, project, current, design, mutation=None, *, provided=False):
    """Resolve authority and prepare a sidecar; caller owns lock/commit/rollback."""
    previous_row = _load_binding(session, current)
    previous = previous_row.binding if previous_row else None
    previous_hash = previous_row.binding_hash if previous_row else None
    state = {"binding": copy.deepcopy(previous), "parent_version_id": current.id if current else None,
             "origin_version_id": None, "operation_kind": "edit", "audit": {"hashContract": HASH_CONTRACT}}
    if not provided:
        return state
    if not isinstance(mutation, dict) or mutation.get("kind") not in ("apply", "restore"):
        raise ApiError()
    common = ("kind", "hashContract", "expectedBindingHash")
    if mutation["kind"] == "apply":
        m = object_fields(mutation, common + ("source", "target", "beforeDesign", "afterContentHash", "proposalId", "mappings", "selectedChangeIds"))
    else:
        m = object_fields(mutation, common + ("origin",))
    if m["hashContract"] != HASH_CONTRACT:
        raise ApiError()
    if _hash(m["expectedBindingHash"], True) != previous_hash:
        raise ApiError(409, "binding_conflict", "问卷关联已变化，请重新核对。")
    state["operation_kind"] = m["kind"]
    if m["kind"] == "restore":
        origin = m["origin"]
        if not isinstance(origin, dict):
            raise ApiError()
        if "questionnaireVersionId" in origin:
            object_fields(origin, ("questionnaireVersionId",))
            origin_id = uuid_string(origin["questionnaireVersionId"])
        else:
            object_fields(origin, ("applicationVersionId", "phase"))
            if origin["phase"] != "before":
                raise ApiError()
            origin_id = uuid_string(origin["applicationVersionId"])
        version = session.execute(select(Version).where(Version.project_id == project.id, Version.id == origin_id)).scalar_one_or_none()
        if version is None:
            raise ApiError(404, "not_found", "恢复来源不存在。")
        origin_row = _load_binding(session, version)
        if "questionnaireVersionId" in origin:
            restored = origin_row.binding if origin_row else None
        else:
            if origin_row is None or origin_row.operation_kind != "apply":
                raise ApiError(422, "invalid_restore_origin", "该版本没有应用前关联快照。")
            restored = _authentic_binding(session, project.id, origin_row.audit["beforeBinding"])
            if origin_row.audit["beforeBindingHash"] != (None if restored is None else transfer_hash(restored)):
                raise ApiError(409, "binding_integrity", "恢复来源指纹不符。")
        state.update(binding=copy.deepcopy(restored), origin_version_id=origin_id, audit={"hashContract": HASH_CONTRACT, "origin": copy.deepcopy(origin), "previousBindingHash": previous_hash})
        return state
    target = object_fields(m["target"], ("baseVersionId", "baseRevision", "beforeContentHash"))
    if target["baseVersionId"] is not None:
        uuid_string(target["baseVersionId"])
    integer(target["baseRevision"], 0)
    if target["baseVersionId"] != (current.id if current else None) or target["baseRevision"] != project.questionnaire_revision:
        raise ApiError(409, "revision_conflict", "问卷基础版本已变化。")
    before = questionnaire(copy.deepcopy(m["beforeDesign"]))
    if _hash(target["beforeContentHash"]) != transfer_hash(before):
        raise ApiError(422, "transfer_mismatch", "应用前草稿与指纹不符。")
    source = object_fields(m["source"], ("versionId", "revision", "contentHash", "briefHash", "expectedDecisionRevision"))
    uuid_string(source["versionId"])
    integer(source["revision"], 1)
    integer(source["expectedDecisionRevision"], 1)
    _hash(source["contentHash"])
    _hash(source["briefHash"])
    row = session.execute(select(TopicProjectVersion).where(TopicProjectVersion.project_id == project.id).order_by(TopicProjectVersion.revision.desc()).limit(1)).scalar_one_or_none()
    decision = session.execute(select(TopicProjectDecision).where(TopicProjectDecision.project_id == project.id).order_by(TopicProjectDecision.revision.desc()).limit(1)).scalar_one_or_none()
    if row is None or row.id != source["versionId"] or row.revision != source["revision"] or row.content_hash != source["contentHash"]:
        raise ApiError(409, "stale_topic_source", "选题已不是当前保存版本，请重新预览。")
    if decision is None or decision.revision != source["expectedDecisionRevision"] or decision.action != "confirm" or decision.version_id != row.id or decision.content_hash != row.content_hash:
        raise ApiError(409, "topic_not_confirmed", "当前精确选题版本尚未确认或确认已变化。")
    if transfer_hash(row.document["brief"]) != source["briefHash"]:
        raise ApiError(422, "transfer_mismatch", "来源研究简报与指纹不符。")
    # Historical bindings remain readable/carryable. A new downstream write
    # requires the current source's region reference to be explicitly migrated.
    assert_profile_region_executable(row.document["profile"])
    authentic_source = {"brief": row.document["brief"], "version": version_view(row), "dirty": False, "decisionRevision": decision.revision}
    application = rebuild_transfer(authentic_source, {"design": before, "pending": False, "versionId": target["baseVersionId"], "revision": target["baseRevision"]}, m["mappings"], previous, m["selectedChangeIds"])
    if _hash(m["proposalId"]) != application["proposalId"] or _hash(m["afterContentHash"]) != transfer_hash(application["after"]) or transfer_hash(design) != transfer_hash(application["after"]):
        raise ApiError(422, "transfer_mismatch", "选题、映射、所选字段或最终设计已变化，请重新预览。")
    state.update(binding=application["binding"], audit={"hashContract": HASH_CONTRACT, "sourceDecisionRevision": decision.revision,
                 "sourceVersionId": row.id, "proposalId": application["proposalId"], "beforeDesign": before,
                 "beforeContentHash": transfer_hash(before), "beforeBinding": copy.deepcopy(previous), "beforeBindingHash": previous_hash})
    return state


def persist_binding(session, version, user, state):
    binding = state["binding"]
    row = QuestionnaireTopicBinding(version_id=version.id, project_id=version.project_id, parent_version_id=state["parent_version_id"],
                                   origin_version_id=state["origin_version_id"], operation_kind=state["operation_kind"], binding=copy.deepcopy(binding),
                                   binding_hash=None if binding is None else transfer_hash(binding), design_transfer_hash=transfer_hash(version.design),
                                   audit=state["audit"], created_by=user.id)
    session.add(row)
    session.flush()
    for source in binding["sources"] if binding else []:
        session.add(QuestionnaireTopicBindingSource(version_id=version.id, project_id=version.project_id, source_version_id=source["version"]["id"],
                                                   source_content_hash=source["version"]["contentHash"], created_by=user.id))
    session.flush()
    return row
