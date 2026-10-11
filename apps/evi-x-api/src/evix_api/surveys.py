"""Frozen questionnaires and bounded, version-bound collection. No model calls or scoring."""
import csv
import io
import math
import re
from datetime import timezone

from fastapi import Depends, Request
from sqlalchemy import select, func, text as sql_text

from .contracts import ApiError, body, canonical, fingerprint, integer, questionnaire, text, uuid_string
from .models import SurveyRelease, SurveyResponse, Version, now, new_id
from .security import keyed, random_token

MAX_RESPONSES = 5000
MAX_ANSWER_BYTES = 2 * 1024 * 1024
MAX_REQUEST_BYTES = 64 * 1024
MAX_DATASET_BYTES = 16 * 1024 * 1024
PUBLIC_QUESTION_FIELDS = ("id", "text", "type", "required", "choices", "min", "max", "minLabel", "maxLabel", "condition")


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def publishable_design(value):
    design = questionnaire(value)

    def require(condition):
        if not condition:
            raise ApiError(422, "invalid_survey", "请补全问卷标题、调查说明，并修正题目与跳题配置后发布。")

    require(design["title"].strip() and design["introduction"].strip() and design["questions"])
    variables, previous = set(), {}
    for q in design["questions"]:
        require(q["text"].strip() and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,31}", q["variable"]))
        require(q["variable"].lower() not in variables)
        variables.add(q["variable"].lower())
        if q["type"] in ("single", "multi"):
            codes = [c["code"] for c in q["choices"]]
            labels = [c["label"].strip() for c in q["choices"]]
            require(len(codes) >= 2 and all(re.fullmatch(r"[A-Za-z0-9_-]{1,16}", c) for c in codes))
            require(len(set(codes)) == len(codes) and all(labels) and len(set(labels)) == len(labels))
        if q["type"] == "likert":
            require(type(q["min"]) in (int, float) and type(q["max"]) in (int, float))
            require(float(q["min"]).is_integer() and float(q["max"]).is_integer() and 1 <= q["max"] - q["min"] <= 14)
            require(q["minLabel"].strip() and q["maxLabel"].strip())
        else:
            require(not q["reverse"])
        if q["type"] == "number" and q["min"] is not None and q["max"] is not None:
            require(q["min"] <= q["max"])
        condition = q["condition"]
        if condition:
            parent = previous.get(condition["questionId"])
            require(parent is not None and parent["type"] == "single")
            codes = condition["codes"]
            require(codes and len(set(codes)) == len(codes) and set(codes) <= {c["code"] for c in parent["choices"]})
        previous[q["id"]] = q
    return design


def public_design(design):
    return {"title": design["title"], "introduction": design["introduction"],
            "questions": [{k: q[k] for k in PUBLIC_QUESTION_FIELDS} for q in design["questions"]]}


def validate_answers(design, raw):
    questions = design["questions"]
    if not isinstance(raw, dict) or set(raw) - {q["id"] for q in questions}:
        raise ApiError(422, "invalid_answers", "答卷包含未知题目。")
    answers, visibility = {}, {}
    for q in questions:
        qid, condition, value = q["id"], q["condition"], raw.get(q["id"])
        shown = condition is None or (visibility.get(condition["questionId"], False)
                                     and answers.get(condition["questionId"]) in condition["codes"])
        visibility[qid] = shown
        if value == "" or value == []:
            value = None
        if not shown:
            if value is not None:
                raise ApiError(422, "hidden_answer", "隐藏题目不能包含答案，请检查前面的选择。")
            answers[qid] = None
            continue
        if value is None:
            if q["required"]:
                raise ApiError(422, "required_answer", "请完成所有必答题。")
            answers[qid] = None
            continue
        valid = True
        codes = [c["code"] for c in q["choices"]]
        if q["type"] == "single":
            valid = isinstance(value, str) and value in codes
        elif q["type"] == "multi":
            valid = isinstance(value, list) and all(isinstance(v, str) and v in codes for v in value)
            valid = valid and len(set(value)) == len(value)
            if valid:
                value = [code for code in codes if code in value]
        elif q["type"] in ("number", "likert"):
            valid = type(value) in (int, float) and abs(value) <= 1e9 and math.isfinite(value)
            valid = valid and (q["min"] is None or value >= q["min"]) and (q["max"] is None or value <= q["max"])
            if valid and q["type"] == "likert":
                valid = float(value).is_integer()
            if valid and value == 0:
                value = 0
        else:
            try:
                text(value, 2000)
                valid = not q["required"] or bool(value.strip())
            except ApiError:
                valid = False
        if not valid:
            raise ApiError(422, "invalid_answer", "答案不符合题型、选项或数值范围。")
        answers[qid] = value
    return answers, visibility


def release_view(row):
    return {"id": row.id, "projectId": row.project_id, "versionId": row.version_id,
            "questionnaireRevision": row.questionnaire_revision, "revision": row.revision,
            "status": row.status, "token": row.token, "title": row.public_design["title"],
            "classification": row.classification, "responseCount": row.response_count,
            "responseBytes": row.response_bytes, "limits": {"responses": MAX_RESPONSES, "answerBytes": MAX_ANSWER_BYTES},
            "createdAt": iso(row.created_at), "closedAt": iso(row.closed_at) if row.closed_at else None}


def receipt(row, release):
    return {"id": row.id, "releaseId": release.id, "submittedAt": iso(row.created_at), "classification": release.classification}


def safe_spreadsheet_cell(value):
    # CSV for analysis remains lossless. The separately downloadable CSV escapes
    # spreadsheet formula prefixes without changing numeric answers or codes.
    stripped = value.lstrip()
    if stripped and stripped[0] in "=+-@" and not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", stripped):
        return "'" + value
    if value.startswith(("\t", "\r", "\n")):
        return "'" + value
    return value


def dataset_view(release, design, responses):
    columns = [{"column": "__response_id", "questionId": None, "kind": "metadata"},
               {"column": "__submitted_at", "questionId": None, "kind": "metadata"}]
    for q in design["questions"]:
        columns.extend([{"column": q["variable"], "questionId": q["id"], "kind": "answer"},
                        {"column": "__shown_" + q["id"], "questionId": q["id"], "kind": "visibility"}])
    rows = []
    for response in responses:
        row = [response.id, iso(response.created_at)]
        for q in design["questions"]:
            value = response.answers[q["id"]]
            encoded = "" if value is None else ";".join(value) if isinstance(value, list) else str(value)
            row.extend([encoded, "1" if response.visibility[q["id"]] else "0"])
        rows.append(row)

    def csv_text(safe=False):
        stream = io.StringIO(newline="")
        writer = csv.writer(stream, lineterminator="\r\n")
        writer.writerow([c["column"] for c in columns])
        writer.writerows(([safe_spreadsheet_cell(cell) for cell in row] if safe else row) for row in rows)
        return stream.getvalue()

    result = {"schema": "survey-dataset/v1", "release": release_view(release), "design": design, "rowCount": len(rows),
              "sha256": fingerprint({"releaseId": release.id, "versionId": release.version_id, "classification": release.classification,
                                     "columns": columns, "rows": rows}),
              "generatedAt": iso(now()), "columns": columns, "csv": csv_text(), "downloadCsv": csv_text(True)}
    if len(canonical(result).encode("utf-8")) > MAX_DATASET_BYTES:
        raise ApiError(413, "dataset_too_large", "答卷导出超过容量，请联系项目管理员。")
    return result


def install_routes(app, *, settings, db, auth, origin, owned_project, operation):
    """Reuse the session/auth contracts without widening anonymous authority."""
    def project_release(session, user, project_id, release_id, edit=False, lock=False):
        owned_project(session, user, project_id, edit=edit)
        uuid_string(release_id)
        query = select(SurveyRelease).where(SurveyRelease.id == release_id, SurveyRelease.project_id == project_id).execution_options(populate_existing=True)
        row = session.execute(query.with_for_update() if lock else query).scalar_one_or_none()
        if row is None:
            raise ApiError(404, "not_found", "问卷发布记录不存在。")
        return row

    def public_release(session, token, lock=False):
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            raise ApiError(404, "not_found", "问卷不存在。")
        session.execute(sql_text("SELECT set_config('evix.survey_token',:token,true)"), {"token": token})
        query = select(SurveyRelease).where(SurveyRelease.token == token).execution_options(populate_existing=True)
        row = session.execute(query.with_for_update() if lock else query).scalar_one_or_none()
        if row is None:
            raise ApiError(404, "not_found", "问卷不存在。")
        return row

    @app.get("/api/projects/{project_id}/surveys")
    def list_releases(project_id: str, user=Depends(auth), session=Depends(db)):
        owned_project(session, user, project_id)
        rows = session.scalars(select(SurveyRelease).where(SurveyRelease.project_id == project_id).order_by(SurveyRelease.created_at.desc(), SurveyRelease.id.desc())).all()
        return {"surveys": [release_view(row) for row in rows]}

    @app.post("/api/projects/{project_id}/surveys", status_code=201)
    async def publish(project_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("expectedQuestionnaireRevision", "idempotencyKey"), limit=1024)
        project, _ = owned_project(session, user, project_id, edit=True, lock=True)
        op, repeated = operation(session, user, "survey-publish:" + project_id, data)
        if repeated:
            return op.response
        expected = integer(data["expectedQuestionnaireRevision"], 1)
        if expected != project.questionnaire_revision:
            raise ApiError(409, "revision_conflict", "问卷版本已变化，请重新载入后发布。")
        version = session.scalar(select(Version).where(Version.project_id == project_id, Version.revision == expected))
        if version is None:
            raise ApiError(409, "unsaved_questionnaire", "请先保存问卷。")
        existing = session.scalar(select(SurveyRelease).where(SurveyRelease.project_id == project_id, SurveyRelease.version_id == version.id))
        if existing:
            op.response = release_view(existing)
            session.commit()
            return op.response
        if session.scalar(select(func.count()).select_from(SurveyRelease).where(SurveyRelease.project_id == project_id)) >= 50:
            raise ApiError(409, "release_limit", "每个项目最多发布50个问卷版本。")
        design = publishable_design(version.design)
        release = SurveyRelease(id=new_id(), project_id=project_id, version_id=version.id, questionnaire_revision=expected,
                                token=random_token(), public_design=public_design(design), classification="synthetic" if settings.mode == "local_test" else "actual",
                                revision=1, status="open", response_count=0, response_bytes=0, created_at=now())
        session.add(release)
        session.flush()
        op.response = release_view(release)
        session.commit()
        return op.response

    @app.post("/api/projects/{project_id}/surveys/{release_id}/close")
    async def close(project_id: str, release_id: str, request: Request, user=Depends(auth), session=Depends(db)):
        data = await body(request, ("expectedRevision", "idempotencyKey"), limit=1024)
        release = project_release(session, user, project_id, release_id, edit=True, lock=True)
        op, repeated = operation(session, user, "survey-close:" + release_id, data)
        if repeated:
            return op.response
        if integer(data["expectedRevision"], 1) != release.revision:
            raise ApiError(409, "revision_conflict", "回收状态已变化，请刷新。")
        if release.status == "open":
            release.status, release.closed_at, release.revision = "closed", now(), release.revision + 1
        session.flush()
        op.response = release_view(release)
        session.commit()
        return op.response

    @app.get("/api/projects/{project_id}/surveys/{release_id}/dataset")
    def export_dataset(project_id: str, release_id: str, user=Depends(auth), session=Depends(db)):
        # A read-only team member can export; the advisory lock freezes intake
        # without requiring the member to have UPDATE privileges for a row lock.
        project_release(session, user, project_id, release_id)
        session.execute(sql_text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(fingerprint(["survey", release_id])[:15], 16)})
        release = project_release(session, user, project_id, release_id)
        version = session.get(Version, release.version_id)
        responses = session.scalars(select(SurveyResponse).where(SurveyResponse.release_id == release_id).order_by(SurveyResponse.created_at, SurveyResponse.id)).all()
        return dataset_view(release, version.design, responses)

    @app.get("/api/surveys/{token}")
    def get_public(token: str, session=Depends(db)):
        release = public_release(session, token)
        return {"id": release.id, "status": release.status, "classification": release.classification, **release.public_design}

    @app.post("/api/surveys/{token}/responses", status_code=201)
    async def submit(token: str, request: Request, session=Depends(db)):
        origin(request)
        data = await body(request, ("idempotencyKey", "answers"), limit=MAX_REQUEST_BYTES)
        key = uuid_string(data["idempotencyKey"])
        session.execute(sql_text("SELECT set_config('evix.submission_key',:key,true)"), {"key": key})
        # Never consume cookie authority on the anonymous intake path.
        release = public_release(session, token)
        session.execute(sql_text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(fingerprint(["survey", release.id])[:15], 16)})
        release = public_release(session, token, lock=True)
        digest = keyed(settings, "survey-response/v1", canonical(data))
        existing = session.scalar(select(SurveyResponse).where(SurveyResponse.release_id == release.id, SurveyResponse.idempotency_key == key))
        if existing:
            if existing.payload_hash != digest:
                raise ApiError(409, "idempotency_conflict", "提交标识已用于不同答卷。")
            return receipt(existing, release)
        if release.status != "open":
            raise ApiError(409, "survey_closed", "本问卷已结束回收。")
        answers, visibility = validate_answers(release.public_design, data["answers"])
        size = len(canonical(answers).encode("utf-8"))
        if size > MAX_REQUEST_BYTES:
            raise ApiError(413, "response_too_large", "答卷内容超过64 KiB，请缩短开放题回答。")
        if release.response_count >= MAX_RESPONSES or release.response_bytes + size > MAX_ANSWER_BYTES:
            raise ApiError(409, "survey_capacity", "本问卷回收容量已满。")
        response = SurveyResponse(id=new_id(), release_id=release.id, idempotency_key=key, payload_hash=digest,
                                  answers=answers, visibility=visibility, created_at=now())
        session.add(response)
        release.response_count += 1
        release.response_bytes += size
        session.flush()
        result = receipt(response, release)
        session.commit()
        return result
