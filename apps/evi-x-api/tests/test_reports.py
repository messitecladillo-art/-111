import copy
from uuid import uuid4
import pytest
from sqlalchemy import select, text, update
from evix_api.contracts import ApiError
from evix_api.reports import ReportVersion, report_content
from .test_postgres import project


def content():
    return {"version": 1, "title": "合成研究😀", "subtitle": "软件验收", "accent": "teal",
            "report": [{"id": "abstract", "title": "摘要", "body": "合成内容，不含实际调查。", "source": ""}],
            "slides": [{"id": "slide-1", "title": "研究", "body": "原始文字", "aside": "", "notes": "讲稿", "layout": "cover"}],
            "reportFormat": {"edition": "第十七届", "group": "", "region": "", "track": "", "stage": "", "profileId": "research-default",
                             "options": {"part": "main", "includeCover": True, "includeToc": True, "firstLineChars": 2, "numberPages": True}}}


def test_report_contract_rejects_unknown_fields_invalid_unicode_and_fake_binding():
    value = content()
    assert report_content(value) == value
    old = copy.deepcopy(value)
    del old["reportFormat"]
    assert report_content(old) == old
    for bad in [{**value, "verified": True}, {**value, "title": " "}, {**value, "title": "😀" * 61},
                {**value, "report": value["report"] * 2}, {**value, "version": True}]:
        with pytest.raises(ApiError):
            report_content(bad)
    for bad in ["\u2028", "\x85", "😀" * 41]:
        value = content()
        value["reportFormat"]["region"] = bad
        with pytest.raises(ApiError):
            report_content(value)
    value = content()
    value["reportFormat"]["officiallyApproved"] = True
    with pytest.raises(ApiError):
        report_content(value)


@pytest.mark.postgres
def test_report_versions_retry_restore_formats_and_team_permissions(harness, pg_engine):
    _, login, _, _ = harness
    owner, owner_session = login()
    other, other_session = login("b@example.test")
    p, team = project(owner)
    base = f'/api/projects/{p["id"]}/report'
    assert owner.get(base).json() == {"report": None}
    data = {"content": content(), "expectedRevision": 0, "idempotencyKey": str(uuid4())}
    response = owner.post(base + '/versions', json=data)
    assert response.status_code == 201, response.text
    first = response.json()
    assert first["revision"] == 1 and first["content"] == content()
    assert owner.post(base + '/versions', json=data).json() == first
    second_content = content()
    second_content["report"][0]["body"] = "修订文本"
    second = owner.post(base + '/versions', json={"content": second_content, "expectedRevision": 1, "idempotencyKey": str(uuid4())}).json()
    assert second["revision"] == 2
    assert owner.post(base + '/versions', json=data).json() == first
    assert owner.get(base).json()["report"] == second
    assert owner.post(base + '/versions', json={**data, "idempotencyKey": str(uuid4())}).status_code == 409
    assert owner.post(base + '/versions', json={**data, "content": second_content}).status_code == 409
    historical = owner.get(base + '/versions/' + first["id"]).json()
    restored = owner.post(base + '/versions', json={"content": historical["content"], "expectedRevision": 2, "idempotencyKey": str(uuid4())})
    assert restored.status_code == 201 and restored.json()["revision"] == 3
    assert [v["revision"] for v in owner.get(base + '/versions?beforeRevision=3').json()["versions"]] == [2, 1]
    assert other.get(base).status_code == 404
    assert other.get(base + '/versions/' + first["id"]).status_code == 404
    owner.post(f'/api/teams/{team}/members', json={"email": "b@example.test", "role": "viewer"})
    assert other.get(base).status_code == 200
    assert other.post(base + '/versions', json={**data, "expectedRevision": 3, "idempotencyKey": str(uuid4())}).status_code == 403
    owner.delete(f'/api/teams/{team}/members/{other_session["user"]["id"]}')
    assert other.get(base).status_code == 404
    with pg_engine.begin() as connection:
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": other_session["user"]["id"]})
        assert connection.execute(select(ReportVersion)).all() == []
    with pg_engine.begin() as connection:
        # No UPDATE policy: even an authenticated team member cannot rewrite snapshots.
        connection.execute(text("SELECT set_config('evix.user_id', :id, true)"), {"id": owner_session["user"]["id"]})
        assert connection.execute(update(ReportVersion).values(content=content())).rowcount == 0


@pytest.mark.postgres
def test_report_concurrent_cas_and_original_receipt(harness):
    from concurrent.futures import ThreadPoolExecutor
    from fastapi.testclient import TestClient
    app, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/report/versions'
    body = {"content": content(), "expectedRevision": 0, "idempotencyKey": str(uuid4())}
    def submit(data):
        with TestClient(app, cookies=owner.cookies, headers=dict(owner.headers)) as client:
            response = client.post(path, json=data)
            return response.status_code, response.json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(submit, [body, body]))
    assert replies[0] == replies[1]
    assert replies[0][0] == 201
    left = {**body, "expectedRevision": 1, "idempotencyKey": str(uuid4())}
    right = {**body, "expectedRevision": 1, "idempotencyKey": str(uuid4())}
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(submit, [left, right]))
    assert sorted(status for status, _ in replies) == [201, 409]


@pytest.mark.postgres
def test_report_custom_chapter_order_and_independent_cover_toc_roundtrip(harness):
    _, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    base = f'/api/projects/{p["id"]}/report'
    versions = []
    for part in ("main", "appendix"):
        for cover, toc in ((False, False), (False, True), (True, False), (True, True)):
            value = content()
            # Deliberately different from a conventional abstract-first template.
            value["report"] = [
                {"id": "findings", "title": "先看发现", "body": "合成发现", "source": ""},
                {"id": "custom-method", "title": "自定义方法", "body": "合成方法", "source": ""},
                {"id": "abstract", "title": "最后的摘要", "body": "合成摘要", "source": ""},
            ]
            value["reportFormat"]["options"].update(part=part, includeCover=cover, includeToc=toc)
            request = {"content": value, "expectedRevision": len(versions), "idempotencyKey": str(uuid4())}
            response = owner.post(base + '/versions', json=request)
            assert response.status_code == 201, response.text
            saved = response.json()
            assert saved["content"] == value and saved["revision"] == len(versions) + 1
            assert owner.get(base).json()["report"] == saved
            assert owner.post(base + '/versions', json=request).json() == saved
            versions.append(saved)
    for saved in versions:
        historical = owner.get(base + '/versions/' + saved["id"])
        assert historical.status_code == 200 and historical.json() == saved
        assert [section["id"] for section in historical.json()["content"]["report"]] == ["findings", "custom-method", "abstract"]
