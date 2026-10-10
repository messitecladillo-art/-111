import copy
import json
import pytest
from types import SimpleNamespace
from evix_api.contracts import questionnaire, strict_json, ApiError
from evix_api.security import encrypt, decrypt
from evix_api.settings import Settings, validate_base
from evix_api.provider import FixtureProvider, parse_proposal, ProviderFailure


def blank():
    return {"schema": "questionnaire-design/v1", "classification": "proposed", "title": "", "objective": "", "population": "",
            "geography": "", "period": "", "recruitment": "", "introduction": "", "pilotNotes": "", "questions": []}


def test_duplicate_json_depth_nonfinite_and_extra_fields_rejected():
    for raw in ['{"x":1,"x":2}', '{"x":{"n":1,"n":2}}', '{"x":NaN}', '{"x":1e999}', '{"x":-1e999}',
                r'{"x":"\ud800"}', r'{"\udfff":1}', '[' * 18 + '0' + ']' * 18]:
        with pytest.raises(ApiError):
            strict_json(raw)
    assert questionnaire(blank())["questions"] == []
    with pytest.raises(ApiError):
        questionnaire({**blank(), "certified": True})


@pytest.mark.asyncio
async def test_nested_full_design_and_generator_shape_are_distinct():
    raw = await FixtureProvider()({}, "synthetic-provider-key", "fixture")
    d = parse_proposal(raw)
    d["questions"][1]["condition"] = {"questionId": d["questions"][0]["id"], "codes": ["1"]}
    assert questionnaire(copy.deepcopy(d)) == d
    for field, invalid in (("required", 1), ("max", True), ("choices", [{"code": "1", "label": "a", "x": 1}])):
        invalid_design = copy.deepcopy(d)
        invalid_design["questions"][0][field] = invalid
        with pytest.raises(ApiError):
            questionnaire(invalid_design)
    d["questions"][0]["text"] = "😀" * 300
    questionnaire(d)
    d["questions"][0]["text"] += "😀"
    with pytest.raises(ApiError):
        questionnaire(d)
    with pytest.raises(ProviderFailure):
        parse_proposal(json.dumps({"title": "x", "objective": "x", "population": "x", "items": []}))
    generated = json.loads(raw)
    generated["items"][0]["choices"][0] = "   "
    with pytest.raises(ProviderFailure):
        parse_proposal(json.dumps(generated))


def test_vault_authenticates_every_config_field_owner_revision_and_key_id(settings):
    s = SimpleNamespace(id="service-id", user_id="user-id", label="fixture", provider="openai", base_url="https://api.openai.com/v1",
                        model="fixture", capabilities=["questionnaire"], max_output_tokens=512, revision=1)
    key = "synthetic-private-model-key"
    encrypt(settings, s, key)
    assert key.encode() not in s.ciphertext
    assert decrypt(settings, s) == key
    original = copy.deepcopy(s)
    for field, value in (("label", "tampered"), ("model", "other"), ("base_url", "https://elsewhere.invalid/v1"),
                         ("provider", "compatible"), ("user_id", "another"), ("revision", 2), ("max_output_tokens", 128),
                         ("capabilities", ["report"]), ("id", "another-id"), ("key_id", "missing")):
        tampered = copy.deepcopy(original)
        setattr(tampered, field, value)
        with pytest.raises(ApiError):
            decrypt(settings, tampered)
    encrypt(settings, s, key)
    assert original.iv != s.iv
    assert decrypt(settings, s) == key


def test_operator_exact_allowlist_and_production_fixture_fail_closed(settings):
    for base in ("https://api.openai.com.evil/v1", "https://user@api.openai.com/v1", "http://api.openai.com/v1",
                 "https://api.openai.com/v1?", "https://api.openai.com/v1#", "https://api.openai.com/v1/", "https://api.openai.com\\v1"):
        with pytest.raises(ValueError):
            validate_base("openai", base)
    for overrides in ({"mode": "production"}, {"provider_mode": "live"}, {"mail_mode": "resend"},
                      {"auth_secret": next(iter(settings.keyring.values()))}, {"database_url": "sqlite://"}):
        with pytest.raises(ValueError):
            Settings(**(settings.model_dump() | overrides))
