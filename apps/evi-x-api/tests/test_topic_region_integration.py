"""Synthetic v1/v2 parser, scope, prompt and pre-dispatch integration evidence."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from starlette.requests import Request

from evix_api.contracts import ApiError, fingerprint, strict_json
import evix_api.topics as topics
import evix_api.topic_regions as regions
from evix_api.topic_projects import confirmable, topic_document
from .test_topics import profile
from .test_topic_projects import document

VERSION = "cn-admin-2025-e2c2b2e1fb4c"
ROOT = Path(__file__).resolve().parents[3]


def ref(code="420106", version=VERSION):
    return {"code": code, "catalogVersion": version}


def profile2(code="420106", **extra):
    return profile(**{"schemaVersion": 2, "regionRef": None if code is None else ref(code), **extra})


def document2(code="420106", **extra):
    result = document()
    result.update(schemaVersion=2, profile=profile2(code, **extra))
    return result


def pattern(**extra):
    return {"id": "synthetic-scope", "accessNeeds": [], "resourceNeeds": [], "regionTags": [], "cityTags": [],
            "minimumDays": None, "minimumBudgetYuan": None, "sensitive": False, "sourceIds": ["synthetic-source"], **extra}


def corpus_with_events(geographies):
    return {"catalog": {"contentVersion": "synthetic-corpus", "patterns": [pattern()]},
            "sources": {"sources": [{"id": "synthetic-source", "title": "合成验收来源", "coverage": "reference"}]},
            "hotspot-events": {"events": [{"id": f"synthetic-event-{i}", "geography": scope, "patternIds": ["synthetic-scope"], "sourceIds": ["synthetic-source"]} for i, scope in enumerate(geographies)]},
            "train": {"pairs": []}, "digest": "0" * 64}


def material(profile_value, geographies=()):
    corpus = corpus_with_events(geographies)
    message, *_ = topics.build_prompt(profile_value, [pattern()], corpus, "合成目标：先核实研究范围")
    return strict_json(message.split("资料JSON：", 1)[1])


@pytest.mark.parametrize("code", ["420106", "110105", "220104", "429004", "810000", None])
def test_api_parser_and_project_v2_write_roundtrip_without_changing_raw_display_text(code):
    value = profile2(code, region="保留旧省文本", city="保留旧市文本")
    before = copy.deepcopy(value)
    assert topics.profile_input(value) == value
    doc = document2(code, region="保留旧省文本", city="保留旧市文本")
    assert topic_document(doc) == doc
    assert value == before
    assert confirmable(doc) is None
    context = material(value)
    assert context["teamClaims"] == before
    resolved = context["regionResolution"]
    assert resolved["status"] == ("unset" if code is None else "current")
    assert resolved["regionRef"] == value["regionRef"]
    assert resolved["catalog"] == regions.region_catalog_binding()
    assert [row["code"] for row in resolved["path"]] == ([] if code is None else [row["code"] for row in regions.region_path(ref(code))])


@pytest.mark.parametrize("code,version", [("420106", "cn-admin-2024-old"), ("999999", VERSION), ("350625", VERSION)])
def test_historical_v2_refs_remain_readable_but_write_confirmation_and_execution_fail(code, version):
    value = document2(regionRef=ref(code, version))
    before = copy.deepcopy(value)
    assert topic_document(value, require_current=False) == before
    assert topics.profile_input(value["profile"], require_current=False)["regionRef"] == ref(code, version)
    for execute in (lambda: topic_document(value), lambda: confirmable(value), lambda: topics.profile_input(value["profile"]),
                    lambda: topics.selected_blockers(value["profile"], [pattern()]), lambda: material(value["profile"])):
        with pytest.raises(ApiError) as error:
            execute()
        assert error.value.status == 422
    assert value == before


@pytest.mark.parametrize("change", [
    lambda d: d.update(schemaVersion=1),
    lambda d: d["profile"].pop("schemaVersion"),
    lambda d: d["profile"].pop("regionRef"),
    lambda d: d["profile"].update(schemaVersion=True),
    lambda d: d["profile"].update(regionRef={"code": "420106", "catalogVersion": VERSION, "name": "武昌区"}),
])
def test_outer_document_and_profile_versions_are_paired_without_silent_upgrade(change):
    value = document2()
    change(value)
    with pytest.raises(ApiError):
        topic_document(value)
    with pytest.raises(ApiError):
        topic_document(value, require_current=False)
    legacy = document()
    legacy["schemaVersion"] = 2
    with pytest.raises(ApiError):
        topic_document(legacy)


def test_legacy_document_and_all_original_shared_vectors_keep_their_exact_contract():
    fixture = strict_json((ROOT / "packages/evi-x-shared/fixtures/topic-project-v1.json").read_text(encoding="utf-8"))
    assert len(fixture["cases"]) == 18
    before = copy.deepcopy(fixture)
    for case in fixture["cases"]:
        if case["valid"]:
            assert topic_document(case["document"]) == case["document"]
        else:
            with pytest.raises(ApiError):
                topic_document(case["document"])
    assert fixture == before
    assert topics.profile_input(profile()) == profile()
    assert "regionResolution" not in material(profile())


def test_all_shared_project_v2_read_write_vectors_match_the_browser_contract():
    fixture = strict_json((ROOT / "packages/evi-x-shared/fixtures/topic-project-v2.json").read_text(encoding="utf-8"))
    assert fixture["schemaVersion"] == 2 and len(fixture["cases"]) == 14
    before = copy.deepcopy(fixture)
    for case in fixture["cases"]:
        for label, require_current in (("readValid", False), ("writeValid", True)):
            if case[label]:
                assert topic_document(case["document"], require_current=require_current) == case["document"], (case["id"], label)
            else:
                with pytest.raises(ApiError):
                    topic_document(case["document"], require_current=require_current)
    assert fixture == before


def test_pattern_constraints_use_actual_ancestors_and_do_not_reject_unknown_scope():
    wuhan = pattern(regionTags=["湖北"], cityTags=["武汉"])
    assert topics.selected_blockers(profile2("420106", region="吉林", city="长春"), [wuhan]) == []
    assert topics.selected_blockers(profile2("220104", region="湖北", city="武汉"), [wuhan]) == [wuhan["id"]]
    assert topics.selected_blockers(profile2(None), [wuhan]) == []
    assert topics.selected_blockers(profile2("420000"), [wuhan]) == []
    county = pattern(regionTags=["山西"], cityTags=["阳城县"])
    assert topics.selected_blockers(profile2("140522"), [county]) == []
    assert topics.selected_blockers(profile2("140500"), [county]) == [county["id"]]
    assert topics.selected_blockers(profile(), [pattern(regionTags=["湖北省"], cityTags=["武汉市"])])


def test_prompt_event_selection_matches_all_shared_ts_scope_counterexamples():
    vectors = strict_json((ROOT / "packages/evi-x-shared/fixtures/topic-region-v2.json").read_text(encoding="utf-8"))
    for case in vectors["cases"]:
        value = {**profile(), **case["profile"]}
        if not case["executable"]:
            with pytest.raises(ApiError):
                material(value)
            continue
        events = case["events"]
        result = material(value, [event["geography"] for event in events])
        assert [event["id"] for event in result["events"]] == [f"synthetic-event-{i}" for i, event in enumerate(events) if event["included"]], case["id"]


@pytest.mark.parametrize("city", ["朝阳区", "北京市", "北京"])
def test_explicit_county_event_ref_allows_only_real_ancestor_display_labels(city):
    selected = profile2("110105", region="旧省文字", city="旧市文字")
    event = {"level": "county", "schemaVersion": 2, "regionRef": ref("110105"), "region": "北京", "city": city}
    assert regions.event_region_includes_profile(selected, event)
    assert not regions.event_region_includes_profile(selected, {**event, "city": "东城区"})
    assert not regions.event_region_includes_profile(selected, {**event, "region": "吉林"})
    assert not regions.event_region_includes_profile(selected, {**event, "regionRef": ref("220104")})
    assert not regions.event_region_includes_profile(profile2("220104"), event)


def test_v2_fingerprint_binds_exact_region_bytes_while_legacy_and_frozen_manifest_stay_unchanged(monkeypatch):
    corpus = topics.load_corpus()
    manifest = Path(topics.__file__).with_name("topic_assets") / "manifest.json"
    before = manifest.read_bytes()
    data = {"profile": profile(), "candidateIds": ["synthetic"], "goal": "synthetic", "catalogVersion": corpus["catalog"]["contentVersion"]}
    legacy_hash = fingerprint({**data, "lookupId": None})
    assert topics.proposal_input_fingerprint(data, corpus) == legacy_hash
    typed = {**data, "profile": profile2()}
    typed_hash = topics.proposal_input_fingerprint(typed, corpus)
    binding = regions.region_catalog_binding()
    assert topics.proposal_source_versions(typed["profile"], corpus) == {"topicDigest": corpus["digest"], "regionCatalog": binding}
    monkeypatch.setattr(topics, "region_catalog_binding", lambda: {**binding, "catalogSha256": "1" * 64})
    assert topics.proposal_input_fingerprint(typed, corpus) != typed_hash
    assert topics.proposal_input_fingerprint(data, corpus) == legacy_hash
    assert manifest.read_bytes() == before


@pytest.mark.asyncio
@pytest.mark.parametrize("reference", [ref(version="cn-admin-2024-old"), ref("999999"), ref("350625")])
async def test_invalid_execution_ref_rejects_after_replay_lookup_before_service_or_provider(reference):
    touched = []
    def forbidden(*args, **kwargs):
        touched.append("downstream")
        raise AssertionError("invalid region reached a downstream capability")
    app = FastAPI()
    corpus = corpus_with_events([])
    def lock(*args):
        touched.append("lock")
    def reserve(*args):
        touched.append("operation")
        return SimpleNamespace(), False
    topics.register_topics(app, SimpleNamespace(), lambda: None, forbidden, lock, reserve, forbidden, SimpleNamespace(topic=forbidden), corpus=corpus)
    endpoint = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/api/topic-advisor/proposals" and "POST" in route.methods)
    payload = {"serviceId": str(uuid4()), "serviceRevision": 1, "idempotencyKey": str(uuid4()), "consent": True,
               "catalogVersion": "synthetic-corpus", "profile": profile2(regionRef=reference), "candidateIds": ["synthetic-scope"], "goal": "合成测试"}
    raw = json.dumps(payload).encode("utf-8")
    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}
    request = Request({"type": "http", "method": "POST", "path": "/api/topic-advisor/proposals", "headers": [(b"content-type", b"application/json")]}, receive)
    with pytest.raises(ApiError) as error:
        await endpoint(request, user=SimpleNamespace(id="synthetic-user"), session=SimpleNamespace())
    assert error.value.status == 422 and touched == ["lock", "operation"]
