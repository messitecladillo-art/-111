"""Project-owned immutable structured report versions, independent of native Office files."""
import re
from datetime import datetime, timezone
from fastapi import Depends, Request
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint, JSON, select
from sqlalchemy.orm import Mapped, mapped_column
from .models import Base, now, new_id
from .contracts import ApiError, body, object_fields, text, integer, uuid_string, fingerprint, canonical


class ReportVersion(Base):
    __tablename__ = "report_versions"
    __table_args__ = (UniqueConstraint("project_id", "revision"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def nonblank(value, maximum):
    text(value, maximum, 1)
    if not value.strip():
        raise ApiError()
    return value


def line(value, maximum):
    text(value, maximum)
    if re.search(r"[\x00-\x1f\x7f]", value):
        raise ApiError()
    return value


def report_settings(value):
    x = object_fields(value, ("edition", "group", "region", "track", "stage", "profileId", "options"))
    if x["edition"] not in ("第十六届", "第十七届") or x["profileId"] not in ("research-default", "ahpu-16-report-layout-v1", "btbu-17-report-layout-v1"):
        raise ApiError()
    for key in ("group", "region", "track", "stage"):
        line(x[key], 80)
        if re.search(r"[\x7f-\x9f\u2028\u2029]", x[key]):
            raise ApiError()
    o = object_fields(x["options"], ("part", "includeCover", "includeToc", "firstLineChars", "numberPages"))
    if o["part"] not in ("main", "appendix") or any(type(o[key]) is not bool for key in ("includeCover", "includeToc", "numberPages")):
        raise ApiError()
    if type(o["firstLineChars"]) is not int or o["firstLineChars"] not in (0, 2):
        raise ApiError()
    if o["part"] == "main" and (not o["includeCover"] or not o["includeToc"]):
        raise ApiError()
    return x


def report_content(value):
    x = object_fields(value, ("version", "title", "subtitle", "accent", "report", "slides"), ("reportFormat",))
    if type(x["version"]) is not int or x["version"] != 1 or x["accent"] not in ("teal", "blue", "burgundy"):
        raise ApiError()
    nonblank(x["title"], 120)
    text(x["subtitle"], 240)
    if "reportFormat" in x:
        report_settings(x["reportFormat"])
    for key in ("report", "slides"):
        if not isinstance(x[key], list) or not 1 <= len(x[key]) <= 40:
            raise ApiError()
        ids = set()
        for item in x[key]:
            required = ("id", "title", "body", "source") if key == "report" else ("id", "title", "body", "aside", "notes", "layout")
            object_fields(item, required, () if key == "report" else ("reportLink",))
            nonblank(item["id"], 80)
            if item["id"] in ids:
                raise ApiError()
            ids.add(item["id"])
            text(item["title"], 150)
            text(item["body"], 12000 if key == "report" else 1800)
            if key == "report":
                text(item["source"], 1500)
            else:
                text(item["aside"], 1800)
                text(item["notes"], 6000)
                if item["layout"] not in ("cover", "content", "two-column"):
                    raise ApiError()
                if "reportLink" in item:
                    link = object_fields(item["reportLink"], ("version", "sectionId", "sectionHash", "slideHash"))
                    if type(link["version"]) is not int or link["version"] != 1:
                        raise ApiError()
                    nonblank(link["sectionId"], 80)
                    line(link["sectionId"], 80)
                    for field in ("sectionHash", "slideHash"):
                        if not isinstance(link[field], str) or not re.fullmatch(r"[a-f0-9]{64}", link[field]):
                            raise ApiError()
    if len(canonical(x).encode("utf-8")) > 500000:
        raise ApiError(413, "payload_too_large", "草稿超过500KB，请拆分作品。")
    return x


def view(version, full=True):
    result = {"id": version.id, "projectId": version.project_id, "revision": version.revision,
              "title": version.content["title"], "updatedAt": version.created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")}
    if full:
        result["content"] = version.content
    return result


def register_reports(app, *, auth, db, owned_project, operation):
    def latest(session, project_id):
        return session.execute(select(ReportVersion).where(ReportVersion.project_id == project_id).order_by(ReportVersion.revision.desc()).limit(1)).scalar_one_or_none()

    @app.get("/api/projects/{project_id}/report")
    def get_report(project_id: str, user=Depends(auth), session=Depends(db)):
        project, _ = owned_project(session, user, project_id)
        report = latest(session, project.id)
        return {"report": view(report) if report else None}

    @app.get("/api/projects/{project_id}/report/versions")
    def versions(project_id: str, beforeRevision: int | None = None, user=Depends(auth), session=Depends(db)):
        project, _ = owned_project(session, user, project_id)
        query = select(ReportVersion).where(ReportVersion.project_id == project.id)
        if beforeRevision is not None:
            query = query.where(ReportVersion.revision < integer(beforeRevision, 1))
        items = session.execute(query.order_by(ReportVersion.revision.desc()).limit(31)).scalars().all()
        return {"versions": [view(v, False) for v in items[:30]], "nextBeforeRevision": items[29].revision if len(items) > 30 else None}

    @app.get("/api/projects/{project_id}/report/versions/{version_id}")
    def version(project_id: str, version_id: str, user=Depends(auth), session=Depends(db)):
        project, _ = owned_project(session, user, project_id)
        uuid_string(version_id)
        item = session.execute(select(ReportVersion).where(ReportVersion.id == version_id, ReportVersion.project_id == project.id)).scalar_one_or_none()
        if item is None:
            raise ApiError(404, "not_found", "版本不存在。")
        return view(item)

    @app.post("/api/projects/{project_id}/report/versions", status_code=201)
    async def save(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("content", "expectedRevision", "idempotencyKey"), limit=600000)
        project, _ = owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = operation(session, user, "report:" + project.id, data)
        if repeated:
            return op.response
        expected = integer(data["expectedRevision"], 0, 2147483646)
        previous = latest(session, project.id)
        if expected != (previous.revision if previous else 0):
            raise ApiError(409, "revision_conflict", "报告已有新版本，请保留当前编辑并核对。")
        content = report_content(data["content"])
        item = ReportVersion(id=new_id(), project_id=project.id, revision=expected + 1, content=content,
                             content_hash=fingerprint(content), created_by=user.id)
        session.add(item)
        session.flush()
        op.response = view(item)
        session.commit()
        return op.response
