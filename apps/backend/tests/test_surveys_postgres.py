import copy
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text, update
from sqlalchemy.exc import DBAPIError

from infrastructure.database.models import SurveyRelease, SurveyResponse
from tests.test_postgres import project, idem
from tests.test_surveys import design

pytestmark = pytest.mark.postgres


def publish(owner, p, value=None, revision=0):
    response = owner.post(f'/api/projects/{p["id"]}/questionnaire/versions',
                          json={"design": value or design(), "expectedRevision": revision, "idempotencyKey": idem()})
    assert response.status_code == 201, response.text
    data = {"expectedQuestionnaireRevision": revision + 1, "idempotencyKey": idem()}
    response = owner.post(f'/api/projects/{p["id"]}/surveys',json=data)
    assert response.status_code == 201, response.text
    return response.json(), data


def anon_client(app, settings):
    return TestClient(app,headers={"origin":settings.allowed_origins[0]})


def test_collection_version_binding_idempotency_projection_and_close(harness, settings):
    app, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    release, publish_data = publish(owner,p)
    path = f'/api/projects/{p["id"]}/surveys'
    assert owner.post(path,json=publish_data).json() == release
    assert owner.post(path,json={**publish_data,"idempotencyKey":idem()}).json() == release
    assert owner.post(path,json={**publish_data,"expectedQuestionnaireRevision":2}).status_code == 409
    newer = copy.deepcopy(design())
    newer["title"] = "新稿不能影响已发布问卷"
    assert owner.post(f'/api/projects/{p["id"]}/questionnaire/versions',json={"design":newer,"expectedRevision":1,"idempotencyKey":idem()}).status_code == 201
    with anon_client(app,settings) as public:
        public_path = f'/api/surveys/{release["token"]}'
        view = public.get(public_path)
        assert set(view.json()) == {"id","status","classification","title","introduction","questions"}
        assert view.json()["title"] == design()["title"]
        assert "私有" not in view.text and "projectId" not in view.text and "versionId" not in view.text
        data = {"idempotencyKey":idem(),"answers":{"choice":"yes","score":4,"multi":["no","yes"],"number":10}}
        receipt = public.post(public_path+"/responses",json=data)
        assert receipt.status_code == 201, receipt.text
        assert set(receipt.json()) == {"id","releaseId","submittedAt","classification"}
        assert receipt.json()["classification"] == "synthetic"
        assert public.post(public_path+"/responses",json=data).json() == receipt.json()
        assert public.post(public_path+"/responses",json={**data,"answers":{"choice":"no"}}).status_code == 409
        dataset = owner.get(path+f'/{release["id"]}/dataset').json()
        assert dataset["rowCount"] == 1 and dataset["design"]["title"] == design()["title"]
        assert dataset["release"]["questionnaireRevision"] == 1
        assert public.get(path+f'/{release["id"]}/dataset').status_code == 401
        assert public.get(public_path+"/responses").status_code == 405
        close_data = {"expectedRevision":1,"idempotencyKey":idem()}
        closed = owner.post(path+f'/{release["id"]}/close',json=close_data)
        assert closed.status_code == 200, closed.text
        assert closed.json()["status"] == "closed" and closed.json()["revision"] == 2
        assert owner.post(path+f'/{release["id"]}/close',json=close_data).json() == closed.json()
        assert owner.post(path+f'/{release["id"]}/close',json={**close_data,"idempotencyKey":idem()}).status_code == 409
        assert public.post(public_path+"/responses",json=data).json() == receipt.json()
        assert public.post(public_path+"/responses",json={**data,"idempotencyKey":idem()}).json()["error"]["code"] == "survey_closed"
        assert owner.get(path+f'/{release["id"]}/dataset').json()["sha256"] == dataset["sha256"]


def test_collection_team_roles_revocation_and_public_origin(harness, settings):
    app, login, _, _ = harness
    owner, _ = login()
    foreign, identity = login("b@example.test")
    p, team = project(owner)
    release, _ = publish(owner,p)
    path = f'/api/projects/{p["id"]}/surveys'
    assert foreign.get(path).status_code == 404
    assert foreign.get(path+f'/{release["id"]}/dataset').status_code == 404
    assert owner.post(f'/api/teams/{team}/members',json={"email":"b@example.test","role":"viewer"}).status_code == 201
    assert foreign.get(path).status_code == 200
    assert foreign.get(path+f'/{release["id"]}/dataset').status_code == 200
    assert foreign.post(path,json={"expectedQuestionnaireRevision":1,"idempotencyKey":idem()}).status_code == 403
    assert foreign.post(path+f'/{release["id"]}/close',json={"expectedRevision":1,"idempotencyKey":idem()}).status_code == 403
    assert owner.delete(f'/api/teams/{team}/members/{identity["user"]["id"]}').status_code == 204
    assert foreign.get(path+f'/{release["id"]}/dataset').status_code == 404
    with TestClient(app) as public:
        target = f'/api/surveys/{release["token"]}/responses'
        data = {"idempotencyKey":idem(),"answers":{"choice":"no"}}
        assert public.post(target,json=data).status_code == 403
        assert public.post(target,json=data,headers={"origin":"https://attacker.invalid"}).status_code == 403
        assert public.post(target,json=data,headers={"origin":settings.allowed_origins[0],"sec-fetch-site":"cross-site"}).status_code == 403
        assert public.get('/api/surveys/'+'x'*43).status_code == 404


def test_response_validation_rollback_and_concurrent_retry(harness, settings):
    app, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    release, _ = publish(owner,p)
    target = f'/api/surveys/{release["token"]}/responses'
    data = {"idempotencyKey":idem(),"answers":{"choice":"no"}}
    with anon_client(app,settings) as public:
        for answers in ({},{"choice":"yes"},{"choice":"no","score":2},{"choice":"no","multi":["yes","yes"]},{"choice":"no","unknown":1}):
            bad = public.post(target,json={"idempotencyKey":idem(),"answers":answers})
            assert bad.status_code == 422, bad.text
        raw = '{"idempotencyKey":"'+idem()+'","answers":{"choice":"no","choice":"yes"}}'
        assert public.post(target,content=raw,headers={"content-type":"application/json"}).status_code == 422
        assert public.post(target,content='x'*65537,headers={"content-type":"application/json"}).status_code == 413
    def send():
        with anon_client(app,settings) as client:
            result = client.post(target,json=data)
            return result.status_code,result.json()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _:send(),range(4)))
    assert all(code == 201 for code,_ in results), results
    assert len({result["id"] for _,result in results}) == 1
    exported = owner.get(f'/api/projects/{p["id"]}/surveys/{release["id"]}/dataset').json()
    assert exported["rowCount"] == exported["release"]["responseCount"] == 1


def test_forced_rls_anonymous_receipt_scope_and_immutable_content(harness, settings, pg_engine):
    app, login, _, _ = harness
    owner, identity = login()
    p, _ = project(owner)
    release, _ = publish(owner,p)
    keys = [idem(),idem()]
    with anon_client(app,settings) as public:
        for key in keys:
            assert public.post(f'/api/surveys/{release["token"]}/responses',json={"idempotencyKey":key,"answers":{"choice":"no"}}).status_code == 201
    with pg_engine.begin() as connection:
        assert connection.execute(select(SurveyRelease)).all() == []
        assert connection.execute(select(SurveyResponse)).all() == []
        connection.execute(text("SELECT set_config('evix.survey_token',:token,true)"),{"token":release["token"]})
        assert len(connection.execute(select(SurveyRelease)).all()) == 1
        assert connection.execute(select(SurveyResponse)).all() == []
        connection.execute(text("SELECT set_config('evix.submission_key',:key,true)"),{"key":keys[0]})
        assert len(connection.execute(select(SurveyResponse)).all()) == 1
    for assignment in ("public_design='{}'", "status='closed',closed_at=now(),revision=revision+1", "response_count=response_count-1", "response_bytes=0", "token='"+'t'*43+"'"):
        with pytest.raises(DBAPIError):
            with pg_engine.begin() as connection:
                connection.execute(text("SELECT set_config('evix.survey_token',:token,true)"),{"token":release["token"]})
                connection.execute(text("UPDATE survey_releases SET "+assignment+" WHERE id=:id"),{"id":release["id"]})
    with pg_engine.begin() as connection:
        schema = connection.scalar(text("SELECT current_schema()"))
    admin = create_engine(os.environ["EVIX_TEST_DATABASE_URL"],connect_args={"options":f"-csearch_path={schema},public"})
    try:
        for statement in ("DELETE FROM survey_responses", "UPDATE survey_responses SET answers='{}'", "DELETE FROM survey_releases"):
            with pytest.raises(DBAPIError,match="immutable"):
                with admin.begin() as connection:
                    connection.execute(text(statement))
    finally:
        admin.dispose()
    assert owner.get(f'/api/projects/{p["id"]}/surveys/{release["id"]}/dataset').json()["rowCount"] == 2


@pytest.mark.parametrize("value", [10**500, -(10**500)], ids=["positive", "negative"])
def test_oversized_integer_answer_is_rejected_without_consuming_submission(harness, settings, value):
    app, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    release, _ = publish(owner, p)
    target = f'/api/surveys/{release["token"]}/responses'
    dataset_path = f'/api/projects/{p["id"]}/surveys/{release["id"]}/dataset'
    data = {"idempotencyKey": idem(), "answers": {"choice": "no", "number": value}}
    with TestClient(app, raise_server_exceptions=False, headers={"origin": settings.allowed_origins[0]}) as public:
        rejected = public.post(target, json=data)
        assert rejected.status_code == 422, rejected.text
        assert rejected.json()["error"]["code"] == "invalid_answer"
        empty = owner.get(dataset_path).json()
        assert empty["rowCount"] == empty["release"]["responseCount"] == 0
        assert empty["release"]["responseBytes"] == 0
        corrected = {**data, "answers": {"choice": "no", "number": 10}}
        receipt = public.post(target, json=corrected)
        assert receipt.status_code == 201, receipt.text
        assert public.post(target, json=corrected).json() == receipt.json()
    exported = owner.get(dataset_path).json()
    assert exported["rowCount"] == exported["release"]["responseCount"] == 1


@pytest.mark.parametrize("field", ["min", "max"])
@pytest.mark.parametrize("value", [10**500, -(10**500)], ids=["positive", "negative"])
def test_oversized_questionnaire_bound_rolls_back_version_write(harness, field, value):
    app, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    target = f'/api/projects/{p["id"]}/questionnaire/versions'
    invalid = design()
    invalid["questions"][-1][field] = value
    data = {"expectedRevision": 0, "idempotencyKey": idem(), "design": invalid}
    with TestClient(app, raise_server_exceptions=False, cookies=owner.cookies, headers=dict(owner.headers)) as editor:
        rejected = editor.post(target, json=data)
        assert rejected.status_code == 422, rejected.text
        corrected = editor.post(target, json={**data, "design": design()})
        assert corrected.status_code == 201, corrected.text
        assert corrected.json()["revision"] == 1
        assert editor.post(target, json={**data, "design": design()}).json() == corrected.json()


def test_capacity_rejects_without_losing_retry_receipt(harness, settings, pg_engine):
    app, login, _, _ = harness
    owner, _ = login()
    p, _ = project(owner)
    value = design()
    value["questions"] = [value["questions"][0],value["questions"][3]]
    release, _ = publish(owner,p,value)
    target = f'/api/surveys/{release["token"]}/responses'
    # Exercise the actual serialized cumulative-byte boundary with CJK answers.
    data = {"idempotencyKey":idem(),"answers":{"choice":"no","text":"汉"*2000}}
    with anon_client(app,settings) as public:
        first = public.post(target,json=data)
        assert first.status_code == 201
        accepted = 1
        for _ in range(400):
            response = public.post(target,json={**data,"idempotencyKey":idem()})
            if response.status_code == 409:
                assert response.json()["error"]["code"] == "survey_capacity"
                break
            assert response.status_code == 201,response.text
            accepted += 1
        else:
            pytest.fail("2 MiB quota not enforced")
        assert public.post(target,json=data).json() == first.json()
    exported = owner.get(f'/api/projects/{p["id"]}/surveys/{release["id"]}/dataset')
    assert exported.status_code == 200, exported.text[:200]
    assert exported.json()["rowCount"] == exported.json()["release"]["responseCount"] == accepted
    assert exported.json()["release"]["responseBytes"] <= 2097152
