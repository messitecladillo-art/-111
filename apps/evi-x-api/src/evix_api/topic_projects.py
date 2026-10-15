"""Project-owned topic briefs and exact-version decisions, without competition Gate effects."""
from datetime import datetime, timezone
import re
from urllib.parse import urlsplit

from fastapi import Depends, Request
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column

from .contracts import ApiError, body, canonical, fingerprint, integer, object_fields, text, uuid_string
from .models import Base, new_id, now
from .topics import ACCESS, RESOURCES, day, profile_input

MAX_DOCUMENT_BYTES = 300_000
ID_PATTERN = r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}"


class TopicProjectVersion(Base):
    __tablename__ = "topic_project_versions"
    __table_args__ = (UniqueConstraint("project_id", "revision"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class TopicProjectDecision(Base):
    __tablename__ = "topic_project_decisions"
    __table_args__ = (UniqueConstraint("project_id", "revision"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    version_id: Mapped[str] = mapped_column(ForeignKey("topic_project_versions.id"), index=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(16))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


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
    s = object_fields(value, ("id", "title", "url", "locator", "coverage", "publishedAt", "retrievedAt"))
    identifier(s["id"])
    value_text(s["title"], 300, True)
    value_text(s["url"], 2000)
    value_text(s["locator"], 1000)
    if s["coverage"] not in ("fulltext", "listing_only", "reference"):
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


def topic_document(value):
    """Strict v1 JSON contract; references stay local to this immutable snapshot."""
    d = object_fields(value, ("schemaVersion", "profile", "candidate", "shortlistIds", "selected", "brief", "verification", "provenance"))
    if type(d["schemaVersion"]) is not int or d["schemaVersion"] != 1:
        raise ApiError()
    # Validate with the same existing strict v1 parser used by model refinement.
    try:
        profile_input(d["profile"])
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
    brief = document["brief"]
    if any(not brief[key].strip() for key in ("title", "decisionOwner", "decision", "population", "geography")) or not any(q["text"].strip() for q in brief["questions"]):
        raise ApiError(422, "brief_incomplete", "请补充题目、决策对象、决策、人群、地域和至少一个研究问题。")


def version_view(item):
    return {"id": item.id, "revision": item.revision, "contentHash": item.content_hash,
            "createdAt": item.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), "createdBy": item.created_by}


def register_topic_projects(app, *, auth, db, owned_project, operation):
    def latest(session, project_id):
        return session.execute(select(TopicProjectVersion).where(TopicProjectVersion.project_id == project_id).order_by(TopicProjectVersion.revision.desc()).limit(1)).scalar_one_or_none()

    def latest_decision(session, project_id, version_id=None):
        query = select(TopicProjectDecision).where(TopicProjectDecision.project_id == project_id)
        if version_id is not None:
            query = query.where(TopicProjectDecision.version_id == version_id)
        return session.execute(query.order_by(TopicProjectDecision.revision.desc()).limit(1)).scalar_one_or_none()

    def decision_view(session, project_id, version, historical=False):
        last = latest_decision(session, project_id, version.id if historical and version else None)
        if last and version and last.version_id == version.id:
            return {"revision": last.revision, "status": "confirmed" if last.action == "confirm" else "revoked", "versionId": last.version_id, "contentHash": last.content_hash}
        return {"revision": last.revision if last else 0, "status": "draft", "versionId": None, "contentHash": None}

    @app.get("/api/projects/{project_id}/topic")
    def get_topic(project_id: str, user=Depends(auth), session=Depends(db)):
        project, role = owned_project(session, user, project_id)
        item = latest(session, project.id)
        return {"head": version_view(item) if item else None, "document": item.document if item else None,
                "decision": decision_view(session, project.id, item), "canEdit": role in ("owner", "editor")}

    @app.get("/api/projects/{project_id}/topic/versions")
    def versions(project_id: str, before: int | None = None, limit: int = 30, user=Depends(auth), session=Depends(db)):
        project, _ = owned_project(session, user, project_id)
        limit = integer(limit, 1, 30)
        query = select(TopicProjectVersion).where(TopicProjectVersion.project_id == project.id)
        if before is not None:
            query = query.where(TopicProjectVersion.revision < integer(before, 1))
        found = session.execute(query.order_by(TopicProjectVersion.revision.desc()).limit(limit + 1)).scalars().all()
        return {"versions": [version_view(item) for item in found[:limit]], "nextBefore": found[limit - 1].revision if len(found) > limit else None}

    @app.get("/api/projects/{project_id}/topic/versions/{version_id}")
    def version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        project, _ = owned_project(session, user, project_id)
        uuid_string(version_id)
        item = session.execute(select(TopicProjectVersion).where(TopicProjectVersion.id == version_id, TopicProjectVersion.project_id == project.id)).scalar_one_or_none()
        if item is None:
            raise ApiError(404, "not_found", "选题版本不存在。")
        return {"version": version_view(item), "document": item.document, "decision": decision_view(session, project.id, item, historical=True)}

    @app.post("/api/projects/{project_id}/topic/versions", status_code=201)
    async def save(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("expectedRevision", "idempotencyKey", "document"), limit=MAX_DOCUMENT_BYTES + 20_000)
        project, _ = owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = operation(session, user, "topic-project-version:" + project.id, data)
        if repeated:
            return op.response
        expected = integer(data["expectedRevision"], 0, 2147483646)
        previous = latest(session, project.id)
        if expected != (previous.revision if previous else 0):
            raise ApiError(409, "revision_conflict", "选题已有新版本，请保留当前编辑并核对。")
        document = topic_document(data["document"])
        item = TopicProjectVersion(id=new_id(), project_id=project.id, revision=expected + 1, document=document, content_hash=fingerprint(document), created_by=user.id)
        session.add(item)
        session.flush()
        op.response = {"version": version_view(item), "document": item.document, "decision": decision_view(session, project.id, item)}
        session.commit()
        return op.response

    @app.post("/api/projects/{project_id}/topic/decisions", status_code=201)
    async def decide(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("expectedRevision", "expectedDecisionRevision", "idempotencyKey", "versionId", "contentHash", "action"), limit=2000)
        project, _ = owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = operation(session, user, "topic-project-decision:" + project.id, data)
        if repeated:
            return op.response
        expected = integer(data["expectedRevision"], 1, 2147483647)
        expected_decision = integer(data["expectedDecisionRevision"], 0, 2147483646)
        uuid_string(data["versionId"])
        if not isinstance(data["contentHash"], str) or not re.fullmatch(r"[a-f0-9]{64}", data["contentHash"]) or data["action"] not in ("confirm", "revoke"):
            raise ApiError()
        current = latest(session, project.id)
        last = latest_decision(session, project.id)
        if current is None or current.revision != expected or current.id != data["versionId"] or current.content_hash != data["contentHash"]:
            raise ApiError(409, "revision_conflict", "选题版本已变化，请核对后再确认。")
        if expected_decision != (last.revision if last else 0):
            raise ApiError(409, "decision_conflict", "选题确认记录已变化，请重新读取。")
        status = decision_view(session, project.id, current)["status"]
        if data["action"] == "revoke" and status != "confirmed":
            raise ApiError(409, "decision_conflict", "当前版本尚未确认。")
        if data["action"] == "confirm":
            if status == "confirmed":
                raise ApiError(409, "decision_conflict", "当前版本已确认。")
            confirmable(current.document)
        session.add(TopicProjectDecision(id=new_id(), project_id=project.id, revision=expected_decision + 1, version_id=current.id, content_hash=current.content_hash, action=data["action"], created_by=user.id))
        session.flush()
        op.response = {"decision": decision_view(session, project.id, current)}
        session.commit()
        return op.response
