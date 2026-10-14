"""Project-owned immutable structured report versions, independent of native Office files."""
import re
import math
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
    return x


# Mirrors EDITOR_LIMITS and QUALITY_LIMITS in the browser models: chapters and their sections are separate
# entries, and a full report backs dozens of figures and tables with registered results.
MAX_SECTIONS, MAX_SLIDES, MAX_RESULTS, MAX_CONTENT_BYTES = 100, 40, 120, 2_000_000
QUALITY_LAYOUTS = ("cover", "problem", "chart", "comparison", "segments", "insight", "action", "closing")
VECTOR_ASSETS = ("mosaic-edge", "focus-loop", "path-ribbon")
# ECMAScript trim differs from Python strip for BOM and NEL. Preserve ID text
# exactly while using the same nonblank test as the browser composition parser.
COMPOSITION_WHITESPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def quality_text(value, maximum, required=False):
    text(value, maximum)
    if "\x7f" in value or required and not value.strip():
        raise ApiError()
    return value


def composition_reference(value, single_line=False):
    (line if single_line else quality_text)(value, 80)
    if not value.strip(COMPOSITION_WHITESPACE):
        raise ApiError()
    return value


def bounded_number(value, minimum, maximum, integral=False):
    if type(value) not in (int, float):
        raise ApiError()
    try:
        valid = math.isfinite(value) and minimum <= value <= maximum and (not integral or value == math.trunc(value))
    except (OverflowError, ValueError):
        valid = False
    if not valid:
        raise ApiError()
    return value


def quality_hash(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
        raise ApiError()
    return value


def quality_list(value, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        raise ApiError()
    return value


def unique_quality(items):
    if len({x["id"] for x in items}) != len(items):
        raise ApiError()


def quality_content(value):
    x = object_fields(value, ("version", "results", "findings"))
    if type(x["version"]) is not int or x["version"] != 1:
        raise ApiError()
    results = quality_list(x["results"], MAX_RESULTS)
    for result in results:
        r = object_fields(result, ("id", "title", "sourceName", "sourceUrl", "sourceHash", "resultHash", "classification", "method", "n", "total", "headers", "rows", "metrics", "warnings"))
        for key, maximum in (("id", 80), ("title", 150), ("sourceName", 240), ("method", 80)):
            quality_text(r[key], maximum, True)
        quality_text(r["sourceUrl"], 512)
        if r["sourceUrl"] and not re.fullmatch(r"https://[^\s<>\ufeff]+", r["sourceUrl"]):
            raise ApiError()
        quality_hash(r["sourceHash"]); quality_hash(r["resultHash"])
        if r["classification"] not in ("public", "user_provided", "simulated"):
            raise ApiError()
        n = bounded_number(r["n"], 0, 5000, True)
        bounded_number(r["total"], n, 5000, True)
        headers = quality_list(r["headers"], 30)
        if not headers:
            raise ApiError()
        for header in headers:
            quality_text(header, 160, True)
        for row in quality_list(r["rows"], 400):
            quality_list(row, len(headers))
            if len(row) != len(headers):
                raise ApiError()
            for cell in row:
                if cell is None:
                    continue
                if type(cell) in (int, float):
                    bounded_number(cell, -1e100, 1e100)
                else:
                    quality_text(cell, 2000)
        for metric in quality_list(r["metrics"], 40):
            m = object_fields(metric, ("label", "value"))
            quality_text(m["label"], 160, True)
            if m["value"] is not None:
                bounded_number(m["value"], -1e100, 1e100)
        for warning in quality_list(r["warnings"], 30):
            quality_text(warning, 1000)
    unique_quality(results)
    result_ids = {r["id"] for r in results}
    findings = quality_list(x["findings"], 40)
    for finding in findings:
        f = object_fields(finding, ("id", "title", "question", "evidenceIds", "interpretation", "alternatives", "scope", "action", "status", "confirmedHashes"))
        quality_text(f["id"], 80, True)
        for key, maximum in (("title", 150), ("question", 1000), ("interpretation", 3000), ("alternatives", 1500), ("scope", 1500), ("action", 1500)):
            quality_text(f[key], maximum)
        evidence = quality_list(f["evidenceIds"], 40)
        for item in evidence:
            quality_text(item, 80, True)
        if len(set(evidence)) != len(evidence) or any(e not in result_ids for e in evidence) or f["status"] not in ("draft", "confirmed"):
            raise ApiError()
        hashes = object_fields(f["confirmedHashes"], (), evidence)
        for key, val in hashes.items():
            if key in ("__proto__", "constructor", "prototype"):
                raise ApiError()
            quality_hash(val)
        if f["status"] == "confirmed" and (not evidence or any(e not in hashes for e in evidence)):
            raise ApiError()
    unique_quality(findings)
    # Client hashes preserve registered result identity; this endpoint does not recompute statistics.
    return result_ids


def report_block(value):
    b = object_fields(value, ("id", "kind", "text", "evidenceId", "valueColumn"))
    if b["kind"] not in ("paragraph", "chart", "table", "formula", "citation", "callout"):
        raise ApiError()
    quality_text(b["id"], 80, True); quality_text(b["text"], 12000); quality_text(b["evidenceId"], 80)
    bounded_number(b["valueColumn"], 0, 29, True)


def slide_object(value):
    o = object_fields(value, ("id", "kind", "x", "y", "width", "height", "rotation", "opacity", "locked", "groupId", "text", "fontSize", "color", "align", "evidenceId", "valueColumn", "chartType", "assetId", "shape"), ("bold", "sourceBlockId"))
    if "bold" in o and type(o["bold"]) is not bool:
        raise ApiError()
    if "sourceBlockId" in o:
        composition_reference(o["sourceBlockId"])
    if o["kind"] not in ("text", "chart", "table", "vector", "shape") or type(o["locked"]) is not bool or o["align"] not in ("left", "center", "right") or o["chartType"] not in ("bar", "line", "pie") or o["shape"] not in ("rect", "ellipse", "line"):
        raise ApiError()
    if not isinstance(o["color"], str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", o["color"]):
        raise ApiError()
    for key, maximum, required in (("id", 80, True), ("groupId", 80, False), ("text", 6000, False), ("evidenceId", 80, False), ("assetId", 80, False)):
        quality_text(o[key], maximum, required)
    x = bounded_number(o["x"], 0, 100); y = bounded_number(o["y"], 0, 100)
    width = bounded_number(o["width"], .1, 100); height = bounded_number(o["height"], .1, 100)
    if x + width > 100.001 or y + height > 100.001 or o["assetId"] and o["assetId"] not in VECTOR_ASSETS or o["kind"] == "vector" and not o["assetId"]:
        raise ApiError()
    bounded_number(o["rotation"], -180, 180); bounded_number(o["opacity"], 0, 1)
    bounded_number(o["fontSize"], 10, 72); bounded_number(o["valueColumn"], 0, 29, True)


def report_content(value):
    x = object_fields(value, ("version", "title", "subtitle", "accent", "report", "slides"), ("reportFormat", "latex", "quality"))
    if type(x["version"]) is not int or x["version"] not in (1, 2) or x["accent"] not in ("teal", "blue", "burgundy"):
        raise ApiError()
    if x["version"] == 1 and "quality" in x:
        raise ApiError()
    result_ids = quality_content(x["quality"]) if "quality" in x else set()
    finding_ids = {f["id"] for f in x["quality"]["findings"]} if "quality" in x else set()
    nonblank(x["title"], 120)
    text(x["subtitle"], 240)
    if "reportFormat" in x:
        report_settings(x["reportFormat"])
    if "latex" in x:
        latex = object_fields(x["latex"], ("version", "body", "reportHash"))
        if type(latex["version"]) is not int or latex["version"] != 1 or not isinstance(latex["reportHash"], str) or not re.fullmatch(r"[a-f0-9]{64}", latex["reportHash"]):
            raise ApiError()
        text(latex["body"], 120000)
    for key in ("report", "slides"):
        if not isinstance(x[key], list) or not 1 <= len(x[key]) <= (MAX_SECTIONS if key == "report" else MAX_SLIDES):
            raise ApiError()
        ids = set()
        for item in x[key]:
            required = ("id", "title", "body", "source") if key == "report" else ("id", "title", "body", "aside", "notes", "layout")
            object_fields(item, required, (("blocks", "findingIds", "findingSnapshots") if x["version"] == 2 else ()) if key == "report" else (("reportLink", "objects") if x["version"] == 2 else ("reportLink",)))
            nonblank(item["id"], 80)
            if item["id"] in ids:
                raise ApiError()
            ids.add(item["id"])
            text(item["title"], 150)
            text(item["body"], 12000 if key == "report" else 1800)
            if key == "report":
                text(item["source"], 1500)
                if "findingIds" in item:
                    references = quality_list(item["findingIds"], 40)
                    for reference in references:
                        quality_text(reference, 80, True)
                    if len(set(references)) != len(references) or any(reference not in finding_ids for reference in references):
                        raise ApiError()
                references = item.get("findingIds", [])
                if "findingSnapshots" in item:
                    snapshots = object_fields(item["findingSnapshots"], (), tuple(references))
                    for reference, snapshot in snapshots.items():
                        if reference in ("__proto__", "constructor", "prototype"):
                            raise ApiError()
                        quality_text(snapshot, 12000, True)
                else:
                    snapshots = {}
                if any(reference not in snapshots for reference in references):
                    raise ApiError()
            else:
                text(item["aside"], 1800)
                text(item["notes"], 6000)
                if item["layout"] not in (("cover", "content", "two-column") + (QUALITY_LAYOUTS if x["version"] == 2 else ())):
                    raise ApiError()
                if "reportLink" in item:
                    link = object_fields(item["reportLink"], ("version", "sectionId", "sectionHash", "slideHash"))
                    if type(link["version"]) is not int or link["version"] not in ((1, 2) if x["version"] == 2 else (1,)):
                        raise ApiError()
                    composition_reference(link["sectionId"], single_line=True)
                    for field in ("sectionHash", "slideHash"):
                        if not isinstance(link[field], str) or not re.fullmatch(r"[a-f0-9]{64}", link[field]):
                            raise ApiError()
            structured = "blocks" if key == "report" else "objects"
            if structured in item:
                pieces = quality_list(item[structured], 60)
                for piece in pieces:
                    (report_block if key == "report" else slide_object)(piece)
                    if piece["kind"] in ("chart", "table") and piece["evidenceId"] not in result_ids:
                        raise ApiError()
                unique_quality(pieces)
    if len(canonical(x).encode("utf-8")) > MAX_CONTENT_BYTES:
        raise ApiError(413, "payload_too_large", "草稿超过 2 MB，请拆分作品。")
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
        data = await body(request, ("content", "expectedRevision", "idempotencyKey"), limit=MAX_CONTENT_BYTES + 100_000)
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
