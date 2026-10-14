"""Knowledge validation/provider tests; no live key or network is used."""
import json
import pytest
import httpx
from evix_api.contracts import ApiError
from evix_api.knowledge import (KnowledgeConfig, LookupFailure, LiveTavily,
    catalog_from_file, lookup_query, parse_provider_result, user_content, safe_result_url)

CATALOG = {"confidence-interval": {2, 1}, "effect-size": {2}}


def state():
    return {"favorites": [{"entryId": "confidence-interval", "entryVersion": 1}],
            "recent": [], "preferences": {"mode": "float", "x": .4, "y": .5, "query": "置信区间"}}


@pytest.mark.parametrize("query", ["置信区间", "SEM standard error", "α", "置信区间 😀"])
def test_short_confirmed_query_valid(query):
    assert lookup_query(query) == query


@pytest.mark.parametrize("query", ["", " ", " secret", "x\ny", "x\ty", "x\x85y", "x\u2028y", "😀" * 61, "x" * 121, "\ud800"])
def test_query_rejects_control_multiline_large_or_invalid_unicode(query):
    with pytest.raises(ApiError):
        lookup_query(query)


def test_state_versions_and_strict_preferences():
    assert user_content(state(), CATALOG) == state()
    for bad in [dict(state(), rawAnswers=[]), dict(state(), favorites=state()["favorites"] * 2),
                dict(state(), favorites=[{"entryId": "confidence-interval", "entryVersion": "draft"}]),
                dict(state(), favorites=[{"entryId": "draft-entry", "entryVersion": 2}]),
                dict(state(), preferences={"x": float("nan")}), dict(state(), preferences={"x": True}),
                dict(state(), preferences={"query": "x\ny"}), dict(state(), preferences={"apiKey": "no"})]:
        with pytest.raises(ApiError):
            user_content(bad, CATALOG)


def test_missing_or_malformed_usage_is_unknown_not_zero():
    for usage in [None, {}, {"credits": True}, {"credits": "1"}, {"credits": -1}, {"credits": 1.5}]:
        result = parse_provider_result({"results": [], "usage": usage})
        assert result.credits is None
    assert parse_provider_result({"results": [], "usage": {"credits": 0}}).credits == 0
    assert parse_provider_result({"results": [], "usage": {"credits": 1}}).credits == 1


def test_provider_response_is_bounded_plain_text_and_safe_links():
    result = parse_provider_result({"results": [
        {"url": "javascript:alert(1)", "title": "bad", "content": "bad"},
        {"url": "https://example.org/stat", "title": "<b>效应量</b>", "content": "<p>说明</p>" + "a" * 4000},
        {"url": "https://secret@example.org", "title": "bad"},
    ], "usage": {"credits": 1}, "request_id": "r-1"})
    assert len(result.results) == 1
    assert result.results[0]["title"] == "效应量"
    assert len(result.results[0]["snippet"]) == 2000
    assert result.request_id == "r-1"
    assert safe_result_url("https://example.org:bad") is None
    assert safe_result_url("https://example.org\\evil") is None
    with pytest.raises(LookupFailure):
        parse_provider_result({"results": None})


def test_catalog_only_independently_reviewed_exact_versions(tmp_path):
    entries = [
        {"id": "confidence-interval", "version": 2, "review": {"status": "reviewed", "producer": "writer", "reviewer": "auditor", "checkedAt": "2026-10-14"}},
        {"id": "draft-entry", "version": 2, "review": {"status": "draft"}},
        {"id": "self-reviewed", "version": 2, "review": {"status": "reviewed", "producer": "writer", "reviewer": "writer", "checkedAt": "2026-10-14"}},
    ]
    path = tmp_path / "catalog.json"
    path.write_text(json.dumps({"schemaVersion": 1, "entries": entries}), encoding="utf-8")
    assert catalog_from_file(path) == {"confidence-interval": {2}}
    assert catalog_from_file(tmp_path / "absent.json") == {}


def test_configuration_hard_caps_and_credential_repr():
    config = KnowledgeConfig(api_key="synthetic-key-only")
    assert "synthetic-key-only" not in repr(config)
    for kwargs in [{"monthly_limit": 1001}, {"daily_limit": 21}, {"timeout_seconds": 31}, {"api_key": "x\ny"}]:
        with pytest.raises(ValueError):
            KnowledgeConfig(**kwargs)
    assert KnowledgeConfig.from_environment(False).api_key == ""


@pytest.mark.asyncio
async def test_live_provider_request_payload_and_transport_no_redirect_no_proxy(monkeypatch):
    captured = {}

    def handler(request):
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        captured["authorization"] = request.headers["authorization"]
        return httpx.Response(200, json={"results": [], "usage": {"credits": 1}, "request_id": "fixture-1"})

    original = httpx.AsyncClient

    def factory(**kwargs):
        captured["options"] = kwargs
        return original(**kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", factory)
    result = await LiveTavily(KnowledgeConfig(api_key="synthetic-key-only"))("效应量")
    assert result.credits == 1
    assert captured["url"] == "https://api.tavily.com/search"
    assert captured["body"] == {"query": "效应量", "search_depth": "basic", "max_results": 5,
                                "auto_parameters": False, "include_answer": False,
                                "include_raw_content": False, "include_usage": True,
                                "include_domains": ["itl.nist.gov", "online.stat.psu.edu", "stats.oarc.ucla.edu", "cdc.gov"]}
    assert captured["authorization"] == "Bearer synthetic-key-only"
    assert captured["options"]["follow_redirects"] is False
    assert captured["options"]["trust_env"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("status,unknown", [(429, False), (432, False), (401, False), (500, True), (302, True)])
async def test_provider_failure_classification(monkeypatch, status, unknown):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs,
        transport=httpx.MockTransport(lambda _: httpx.Response(status, json={"error": "ignored"}))))
    with pytest.raises(LookupFailure) as error:
        await LiveTavily(KnowledgeConfig(api_key="synthetic-key-only"))("SEM")
    assert error.value.unknown is unknown


@pytest.mark.asyncio
async def test_provider_network_exception_and_response_limit_are_unknown(monkeypatch):
    original = httpx.AsyncClient

    def timeout(_):
        raise httpx.ReadTimeout("synthetic timeout")

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs,
        transport=httpx.MockTransport(timeout)))
    with pytest.raises(LookupFailure) as error:
        await LiveTavily(KnowledgeConfig(api_key="synthetic-key-only"))("SEM")
    assert error.value.unknown is True and error.value.code == "lookup_network_unknown"
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs,
        transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"x" * 128001))))
    with pytest.raises(LookupFailure) as error:
        await LiveTavily(KnowledgeConfig(api_key="synthetic-key-only"))("SEM")
    assert error.value.unknown is True and error.value.code == "lookup_response_too_large"
