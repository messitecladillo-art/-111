"""Actual isolated PostgreSQL API evidence; the model provider is a local fixture."""
import copy
from uuid import uuid4

import pytest
from sqlalchemy import select

from evix_api.contracts import ApiError, fingerprint, strict_json
from evix_api.models import Operation, RateEvent
from evix_api.provider import ProviderFailure
from evix_api.security import keyed
from evix_api.topic_projects import TopicProjectDecision, TopicProjectVersion
from evix_api.topic_regions import region_catalog_binding
import evix_api.topics as topics
from .test_postgres import project
from .test_topic_projects import document
from .test_topic_projects_postgres import decision_body, save
from .test_topics_postgres import PATH, as_user, setup
from .test_topic_region_integration import VERSION, document2, profile2, ref

pytestmark = pytest.mark.postgres


@pytest.fixture
def county_event_harness(monkeypatch, request):
    original = topics.load_corpus
    def synthetic_corpus():
        corpus = original()
        candidate = next(row for row in corpus["catalog"]["patterns"] if not row["sensitive"] and not row["regionTags"] and not row["cityTags"])
        mode = getattr(request, "param", "beijing")
        labels = [("北京", "朝阳区", "110105"), ("北京", "北京市", "110105"), ("北京市", "北京", "110105"),
                  ("北京", "东城区", "110105"), ("吉林", "北京市", "110105"), ("北京", "朝阳区", "220104")]
        events = [
            {"id": f"synthetic-county-{i}", "title": "合成县级范围验收事件", "patternIds": [candidate["id"]], "sourceIds": candidate["sourceIds"][:1],
             "geography": {"level": "county", "schemaVersion": 2, "regionRef": ref(code), "region": region, "city": city}}
            for i, (region, city, code) in enumerate(labels)
        ]
        if mode in ("xuzhou", "ambiguous-pattern"):
            scopes = [{"level": "city", "region": "江苏", "city": name} for name in ("鼓楼区", "南京", "徐州")]
            scopes += [{"level": "county", "schemaVersion": 2, "regionRef": ref(code), "region": "江苏", "city": "鼓楼区"} for code in ("320302", "320106")]
            events = [{"id": f"synthetic-city-{i}", "title": "合成同省同名县区验收事件", "patternIds": [candidate["id"]],
                       "sourceIds": candidate["sourceIds"][:1], "geography": scope} for i, scope in enumerate(scopes)]
        if mode == "ambiguous-pattern":
            candidate.update(regionTags=["江苏"], cityTags=["南京", "鼓楼区"])
        corpus["hotspot-events"]["events"] = events
        return corpus
    monkeypatch.setattr(topics, "load_corpus", synthetic_corpus)
    return request.getfixturevalue("harness")


def test_project_v1_v2_history_roundtrips_without_rewriting_legacy_rows(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login()
    other, _ = login("b@example.test")
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    original = document()
    first = save(owner, path, value=original)
    assert first.status_code == 201, first.text
    legacy = first.json()
    current = document2("420106", region="历史自报省", city="历史自报市")
    second = save(owner, path, revision=1, value=current)
    assert second.status_code == 201, second.text
    typed = second.json()
    assert typed["document"] == current and typed["version"]["contentHash"] == fingerprint(current)
    assert owner.get(path).json()["document"] == current
    historical = owner.get(path + "/versions/" + legacy["version"]["id"]).json()
    assert historical["document"] == original and historical["version"]["contentHash"] == legacy["version"]["contentHash"]
    assert other.get(path).status_code == 404
    assert owner.post(path + "/decisions", json=decision_body(typed["version"])).status_code == 201
    rows = as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(TopicProjectVersion.document).order_by(TopicProjectVersion.revision)).scalars().all())
    assert rows == [original, current]


def test_existing_historical_v2_row_is_readable_but_resave_and_confirm_require_explicit_migration(harness, pg_engine):
    _, login, _, _ = harness
    owner, identity = login()
    p, _ = project(owner)
    path = f'/api/projects/{p["id"]}/topic'
    legacy = save(owner, path).json()
    stale = document2(regionRef=ref("511402", "cn-admin-1988-history"), region="旧四川", city="枳城区")
    historical_id = str(uuid4())
    # Synthetic previously persisted history, inserted only in this fixture's
    # random schema. Production API writes may never create this stale ref.
    as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(TopicProjectVersion.__table__.insert().values(
        id=historical_id, project_id=p["id"], revision=2, document=stale, content_hash=fingerprint(stale), created_by=identity["user"]["id"])))
    head = owner.get(path).json()
    assert head["document"] == stale and head["head"]["contentHash"] == fingerprint(stale)
    assert owner.get(path + "/versions/" + historical_id).json()["document"] == stale
    assert owner.get(path + "/versions/" + legacy["version"]["id"]).json()["document"]["schemaVersion"] == 1
    assert save(owner, path, revision=2, value=stale).status_code == 422
    denied = owner.post(path + "/decisions", json=decision_body(head["head"]))
    assert denied.status_code == 422
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(TopicProjectDecision)).all()) == []
    migrated = copy.deepcopy(stale)
    migrated["profile"]["regionRef"] = ref("511402")
    saved = save(owner, path, revision=2, value=migrated)
    assert saved.status_code == 201 and saved.json()["version"]["revision"] == 3
    assert owner.get(path + "/versions/" + historical_id).json()["document"] == stale


@pytest.mark.parametrize("code", ["420106", "110105", "220104", "810000", None])
def test_current_or_unset_v2_provider_receipt_binds_catalog_and_canonical_scope(harness, code):
    _, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner, profile=profile2(code, region="保留旧省", city="保留旧市"))
    messages = []
    original = provider.topic
    async def inspect(config, key, message, selected):
        messages.append(strict_json(message.split("资料JSON：", 1)[1]))
        return await original(config, key, message, selected)
    provider.topic = inspect
    response = owner.post(PATH, json=data)
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert receipt["status"] == "ready" and provider.calls == 1
    assert receipt["sourceVersions"]["regionCatalog"] == region_catalog_binding()
    resolved = messages[0]["regionResolution"]
    assert resolved["regionRef"] == data["profile"]["regionRef"]
    assert resolved["status"] == ("unset" if code is None else "current")
    assert messages[0]["teamClaims"]["region"] == "保留旧省"
    if code is None:
        assert resolved["path"] == []
        assert all(event["geography"]["level"] == "national" for event in messages[0]["events"])
    else:
        assert resolved["path"][-1]["code"] == code
    assert owner.post(PATH, json=data).json() == receipt and provider.calls == 1


def test_stale_nonexistent_and_removed_refs_fail_before_operation_rate_or_provider(harness, pg_engine, settings):
    _, login, _, provider = harness
    owner, identity = login()
    _, _, data = setup(owner)
    for value in (ref(version="cn-admin-2024-old"), ref("999999"), ref("350625")):
        response = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4()), "profile": profile2(regionRef=value)})
        assert response.status_code == 422, response.text
    assert provider.calls == 0
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation).where(Operation.scope == "topic-advisor/v1")).all()) == []
    scope = keyed(settings, "topic-call-rate/v1", identity["user"]["id"])
    assert as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(RateEvent).where(RateEvent.scope == scope)).all()) == []


def test_cross_region_legacy_display_cannot_override_code_and_clear_has_no_local_events(harness):
    _, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner, candidateIds=["p09-wuhan-coupons"])
    wrong = owner.post(PATH, json={**data, "profile": profile2("220104", region="湖北", city="武汉")})
    assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "topic_infeasible"
    assert provider.calls == 0
    messages = []
    original = provider.topic
    async def inspect(config, key, message, selected):
        messages.append(strict_json(message.split("资料JSON：", 1)[1]))
        return await original(config, key, message, selected)
    provider.topic = inspect
    for code in ("420106", "420000", None):
        response = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4()), "profile": profile2(code)})
        assert response.status_code == 201 and response.json()["status"] == "ready", response.text
    assert provider.calls == 3
    assert all(event["geography"]["level"] != "city" for event in messages[1]["events"])
    assert all(event["geography"]["level"] == "national" for event in messages[2]["events"])


def test_v2_uncertain_call_with_same_material_remains_non_replayable(harness):
    _, login, _, provider = harness
    owner, _ = login()
    _, _, data = setup(owner, profile=profile2("420106"))
    async def uncertain(*args):
        provider.calls += 1
        raise ProviderFailure("provider_timeout", unknown=True)
    provider.topic = uncertain
    first = owner.post(PATH, json=data)
    assert first.status_code == 201 and first.json()["status"] == "outcome_unknown"
    assert first.json()["sourceVersions"]["regionCatalog"]["catalogVersion"] == VERSION
    assert owner.post(PATH, json=data).json() == first.json()
    retried = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4())})
    assert retried.status_code == 409 and retried.json()["error"]["code"] == "outcome_unknown"
    assert provider.calls == 1


def test_county_event_canonical_parent_labels_reach_provider_without_cross_county_leakage(county_event_harness):
    _, login, _, provider = county_event_harness
    owner, _ = login()
    _, _, data = setup(owner, profile=profile2("110105", region="保留旧省文字", city="保留旧市文字"))
    material = []
    original = provider.topic
    async def inspect(config, key, message, selected):
        material.append(strict_json(message.split("资料JSON：", 1)[1]))
        return await original(config, key, message, selected)
    provider.topic = inspect
    result = owner.post(PATH, json=data)
    assert result.status_code == 201 and result.json()["status"] == "ready", result.text
    assert provider.calls == 1
    assert [row["id"] for row in material[0]["events"]] == ["synthetic-county-0", "synthetic-county-1", "synthetic-county-2"]


@pytest.mark.parametrize("county_event_harness", ["xuzhou"], indirect=True)
def test_same_province_ambiguous_city_event_does_not_enter_the_provider_context(county_event_harness):
    _, login, _, provider = county_event_harness
    owner, _ = login()
    _, _, data = setup(owner, profile=profile2("320302"))
    material = []
    original = provider.topic
    async def inspect(config, key, message, selected):
        material.append(strict_json(message.split("资料JSON：", 1)[1]))
        return await original(config, key, message, selected)
    provider.topic = inspect
    result = owner.post(PATH, json=data)
    assert result.status_code == 201 and result.json()["status"] == "ready", result.text
    assert [row["id"] for row in material[0]["events"]] == ["synthetic-city-2", "synthetic-city-3"]


@pytest.mark.parametrize("county_event_harness", ["ambiguous-pattern"], indirect=True)
def test_ambiguous_county_or_tag_cannot_rescue_wrong_city_before_provider(county_event_harness):
    _, login, _, provider = county_event_harness
    owner, _ = login()
    candidate = next(row for row in topics.load_corpus()["catalog"]["patterns"] if row["regionTags"] == ["江苏"] and row["cityTags"] == ["南京", "鼓楼区"])
    _, _, data = setup(owner, candidateIds=[candidate["id"]], profile=profile2("320302"))
    blocked = owner.post(PATH, json=data)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "topic_infeasible"
    assert provider.calls == 0
    correct_city = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4()), "profile": profile2("320106")})
    assert correct_city.status_code == 201 and correct_city.json()["status"] == "ready", correct_city.text
    assert provider.calls == 1


def test_original_v2_nonce_reconciles_receipt_before_rollout_guards_and_new_stale_nonce_rolls_back(harness, pg_engine, settings, monkeypatch):
    _, login, _, provider = harness
    owner, identity = login()
    _, _, data = setup(owner, profile=profile2("420106"))
    initial = owner.post(PATH, json=data)
    assert initial.status_code == 201 and initial.json()["status"] == "ready", initial.text
    receipt = initial.json()
    frozen_sources = copy.deepcopy(receipt["sourceVersions"])
    assert provider.calls == 1
    guarded = []
    def rolled_out_profile(value):
        guarded.append("current-profile")
        raise ApiError(422, "region_catalog_mismatch", "合成目录升级后须确认迁移。")
    def forbidden_candidate_validation(*args, **kwargs):
        raise AssertionError("durable replay reached current candidate validation")
    monkeypatch.setattr(topics, "profile_input", rolled_out_profile)
    monkeypatch.setattr(topics, "string_list", forbidden_candidate_validation)
    monkeypatch.setattr(topics, "region_catalog_binding", lambda: {"catalogVersion": "cn-admin-2026-synthetic-rollout", "asOf": "2026-12-31", "catalogSha256": "f" * 64})
    replayed = owner.post(PATH, json=data)
    assert replayed.status_code == 201 and replayed.json() == receipt
    assert replayed.json()["sourceVersions"] == frozen_sources and guarded == []
    changed = owner.post(PATH, json={**data, "goal": "同一幂等标识的新内容"})
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "idempotency_conflict"
    assert guarded == []
    fresh = owner.post(PATH, json={**data, "idempotencyKey": str(uuid4())})
    assert fresh.status_code == 422 and fresh.json()["error"]["code"] == "region_catalog_mismatch"
    assert guarded == ["current-profile"] and provider.calls == 1
    assert owner.get(PATH + "/" + receipt["id"]).json() == receipt
    operations = as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(Operation.response).where(Operation.scope == "topic-advisor/v1")).scalars().all())
    assert operations == [receipt]
    scope = keyed(settings, "topic-call-rate/v1", identity["user"]["id"])
    rates = as_user(pg_engine, identity["user"]["id"], lambda c: c.execute(select(RateEvent).where(RateEvent.scope == scope)).all())
    assert len(rates) == 1
