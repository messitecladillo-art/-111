"""Independent synthetic counterexamples for the packaged geography contract."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import pytest

from evix_api.contracts import ApiError, strict_json
import evix_api.topic_regions as regions
from evix_api.topics import profile_input as legacy_profile_input


ROOT = Path(__file__).resolve().parents[3]
FRONTEND = ROOT / "apps" / "evi-x-platform"
ASSETS = Path(regions.__file__).with_name("topic_assets")
VERSION = "cn-admin-2025-e2c2b2e1fb4c"


def ref(code, version=VERSION):
    return {"code": code, "catalogVersion": version}


def profile(**extra):
    return {"region": "湖北", "city": "武汉", "school": "", "schoolContext": [], "discipline": "", "interests": [], "domains": [],
            "days": None, "budgetYuan": None, "access": {}, "resources": {}, "sensitiveData": "avoid", "referenceDate": "2026-10-15",
            "competitionWindow": {"start": "2026-10-01", "end": "2026-12-31"}, **extra}


def v2(code="420111", **extra):
    return profile(**{"schemaVersion": 2, "regionRef": None if code is None else ref(code), **extra})


def match(code, province_tags, local_tags, **extra):
    return regions.matches_profile_geography(v2(code, **extra), province_tags, local_tags)


def assert_422(call):
    with pytest.raises(ApiError) as error:
        call()
    assert error.value.status == 422


def write_assets(directory, catalog, manifest_extra=None, raw=None):
    directory.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(catalog, ensure_ascii=False).encode("utf-8") if raw is None else raw
    manifest = {"schemaVersion": 1, "catalogVersion": catalog["catalogVersion"], "asOf": catalog["asOf"], "bytes": len(raw),
                "sha256": {"regions.catalog.json": hashlib.sha256(raw).hexdigest()}, **(manifest_extra or {})}
    (directory / "regions.catalog.json").write_bytes(raw)
    (directory / "regions.manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return manifest


def test_packaged_catalog_bytes_and_manifest_match_the_frontend_exactly():
    raw = (FRONTEND / "content" / "topic-advisor" / "regions.catalog.json").read_bytes()
    assert raw == (ASSETS / "regions.catalog.json").read_bytes()
    manifest = strict_json((ASSETS / "regions.manifest.json").read_text(encoding="utf-8"))
    assert manifest == {"schemaVersion": 1, "catalogVersion": VERSION, "asOf": "2025-12-31", "bytes": len(raw),
                        "sha256": {"regions.catalog.json": hashlib.sha256(raw).hexdigest()}}
    catalog = regions.load_region_catalog()
    assert len(catalog["records"]) == 3212
    assert [catalog["coverage"][key] for key in ("provinceCount", "prefectureCount", "countyCount")] == [34, 333, 2845]
    assert catalog["source"]["verification"] == "community_compilation_official_full_recheck_pending"
    assert catalog["coverage"]["countyContent"] == "directory_only"
    meta = regions.get_catalog_meta()
    meta["coverage"]["provinceOnlyCodes"].clear()
    assert regions.get_catalog_meta()["coverage"]["provinceOnlyCodes"] == ["710000", "810000", "820000"]


def test_offline_sync_writes_exact_bytes_and_default_mode_detects_drift_without_repair(tmp_path):
    frontend = tmp_path / "evi-x-platform"
    source = frontend / "content" / "topic-advisor"
    script = frontend / "scripts" / "sync-topic-region-api.mjs"
    source.mkdir(parents=True)
    script.parent.mkdir()
    raw = (FRONTEND / "content" / "topic-advisor" / "regions.catalog.json").read_bytes()
    (source / "regions.catalog.json").write_bytes(raw)
    shutil.copyfile(FRONTEND / "scripts" / script.name, script)
    def run(*args):
        return subprocess.run([shutil.which("node"), str(script), *args], cwd=frontend, capture_output=True, text=True, encoding="utf-8", timeout=20)
    written = run("--write")
    assert written.returncode == 0, written.stderr
    assert json.loads(written.stdout)["status"] == "written"
    target = tmp_path / "evi-x-api" / "src" / "evix_api" / "topic_assets"
    assert (target / "regions.catalog.json").read_bytes() == raw
    assert regions.load_region_catalog(target)["catalogVersion"] == VERSION
    checked = run()
    assert checked.returncode == 0, checked.stderr
    (target / "regions.catalog.json").write_bytes(raw + b" ")
    drift = run()
    assert drift.returncode != 0 and "catalog drift" in drift.stderr
    assert (target / "regions.catalog.json").read_bytes() == raw + b" "
    assert run("--unknown").returncode != 0


@pytest.mark.parametrize("change", [
    {"schemaVersion": True}, {"bytes": True}, {"bytes": 1}, {"catalogVersion": "cn-admin-old"}, {"asOf": "2024-12-31"},
    {"sha256": {"regions.catalog.json": "0" * 64}}, {"sha256": {"regions.catalog.json": "f" * 64, "other": "0" * 64}},
    {"unexpected": "field"},
])
def test_asset_manifest_corruption_fails_closed(tmp_path, change):
    write_assets(tmp_path, regions.load_region_catalog(), change)
    with pytest.raises(RuntimeError, match="assets"):
        regions.load_region_catalog(tmp_path)


def test_asset_missing_invalid_utf8_and_duplicate_json_members_fail_closed(tmp_path):
    with pytest.raises(RuntimeError):
        regions.load_region_catalog(tmp_path)
    catalog = regions.load_region_catalog()
    for raw in (b"\xff", b'{"schemaVersion":1,"schemaVersion":1}', b"NaN", b'"\\ud800"'):
        write_assets(tmp_path, catalog, raw=raw)
        with pytest.raises(RuntimeError):
            regions.load_region_catalog(tmp_path)
    write_assets(tmp_path, catalog)
    raw = (tmp_path / "regions.manifest.json").read_text(encoding="utf-8")
    (tmp_path / "regions.manifest.json").write_text(raw.replace('"schemaVersion": 1', '"schemaVersion": 1,"schemaVersion": 1'), encoding="utf-8")
    with pytest.raises(RuntimeError):
        regions.load_region_catalog(tmp_path)


@pytest.mark.parametrize("bad", [
    None, True, [], ["420111", VERSION], "420111", {"code": "420111"}, {"code": "420111", "catalogVersion": VERSION, "name": "洪山区"},
    {"code": 420111, "catalogVersion": VERSION}, {"code": True, "catalogVersion": VERSION}, {"code": "４２０１１１", "catalogVersion": VERSION},
    {"code": "42011\n", "catalogVersion": VERSION}, {"code": " 420111", "catalogVersion": VERSION},
    {"code": "420111", "catalogVersion": [VERSION]}, {"code": "420111", "catalogVersion": "cn-admin-\ud800"},
    {"code": "420111", "catalogVersion": "cn-admin-x\x7f"}, {"code": "420111", "catalogVersion": True},
])
def test_reference_shape_is_strict_and_does_not_coerce_types_or_unicode(bad):
    assert_422(lambda: regions.parse_region_ref_shape(bad))
    assert_422(lambda: regions.region_ref_input(bad))


def test_historical_shape_is_preserved_but_write_and_execution_require_current_membership():
    old = ref("350625", "cn-admin-2020-old")
    assert regions.parse_region_ref_shape(old) == old
    assert regions.parse_region_ref_shape(ref("999999")) == ref("999999")
    for value in (old, ref("350625"), ref("999999"), ref("420111", "cn-admin-2024-old")):
        assert_422(lambda: regions.region_ref_input(value))
        assert_422(lambda: regions.region_path(value))
        assert_422(lambda: regions.matches_profile_geography(v2(regionRef=value), [], []))
    current = regions.region_ref_input(ref("420111"))
    current["code"] = "999999"
    assert regions.region_ref_input(ref("420111"))["code"] == "420111"


def test_real_parent_paths_do_not_create_prefectures_for_municipalities_or_direct_counties():
    cases = {"110101": ["110000", "110101"], "500155": ["500000", "500155"], "429004": ["420000", "429004"],
             "659001": ["650000", "659001"], "150623": ["150000", "150600", "150623"]}
    for code, expected in cases.items():
        path = regions.region_path(ref(code))
        assert [row["code"] for row in path] == expected
        path[0]["name"] = "mutated returned copy"
        assert regions.region_path(code)[0]["name"] != path[0]["name"]
    assert regions.region_names(ref("420111")) == {"region": "湖北省", "city": "洪山区", "path": ["湖北省", "武汉市", "洪山区"]}
    assert regions.region_names(ref("810000")) == {"region": "香港特别行政区", "city": "", "path": ["香港特别行政区"]}


@pytest.mark.parametrize("change", [
    lambda c: c["records"].append(copy.deepcopy(c["records"][0])),
    lambda c: c["records"].__setitem__(0, {**c["records"][0], "startYear": True}),
    lambda c: c["coverage"].update(countyCount=True),
    lambda c: c["coverage"].update(countyCount=999),
    lambda c: c["source"].update(verification="official_verified_2026"),
    lambda c: c["source"].update(rawPath="../outside"),
    lambda c: c["source"].update(officialSource="javascript:alert(1)"),
    lambda c: c["historicalNames"][0].update(relation="automatic_successor"),
    lambda c: c["historicalNames"][0].update(candidateCodes=["999999"]),
    lambda c: c["coverage"].update(provinceOnlyCodes=["420000"]),
])
def test_catalog_structure_rejects_wrong_counts_provenance_and_historical_authority(change):
    catalog = regions.load_region_catalog()
    change(catalog)
    assert_422(lambda: regions.parse_region_catalog(catalog))


@pytest.mark.parametrize("parent", ["420200", "420000", "320100", "420111", "999999"])
def test_county_cannot_be_reparented_even_within_the_same_province(parent):
    catalog = regions.load_region_catalog()
    next(row for row in catalog["records"] if row["code"] == "420106")["parentCode"] = parent
    assert_422(lambda: regions.parse_region_catalog(catalog))


def test_current_codes_never_take_historical_successor_names_or_reused_code_meanings():
    assert regions.region_path(ref("511402"))[-1]["name"] == "东坡区"
    assert match("511402", ["四川"], ["东坡区"])
    assert not match("511402", ["重庆"], ["涪陵区"])
    assert not match("511402", [], ["枳城区"])
    assert regions.region_path(ref("421024"))[-1]["name"] == "江陵县"
    assert match("421024", ["湖北"], ["江陵县"])
    assert not match("421024", [], ["松滋县"])
    assert regions.region_path(ref("419001"))[-1]["name"] == "济源市"
    assert not match("419001", [], ["义马市"])


def test_county_tags_match_only_that_county_while_prefecture_tags_cover_selected_descendants():
    assert match("140522", ["山西"], ["阳城县"])
    assert match("140522", ["山西省"], ["晋城"])
    assert not match("140500", ["山西"], ["阳城县"])
    assert not match("140502", ["山西"], ["阳城县"])
    assert not match("140522", [], ["阳城"])
    assert match("420111", ["湖北"], ["武汉"])
    assert match("420111", ["湖北省"], ["武汉市", "other"])
    assert not match("420200", ["湖北"], ["武汉"])
    assert match("420000", ["湖北"], ["武汉"])  # Unknown city scope stays conditional.
    assert regions.profile_geography_fit(v2("420000"), ["湖北"], ["武汉"]) == "unknown"
    assert not match("420111", ["湖北"], ["武汉新区"])
    assert not match("420111", ["湖北"], ["武"])


def test_same_name_counties_keep_actual_province_and_prefecture_disambiguation():
    assert match("110105", ["北京"], ["朝阳区"])
    assert not match("220104", ["北京"], ["朝阳区"])
    assert match("220104", ["吉林"], ["长春"])
    assert not match("110105", ["吉林"], ["长春"])
    assert match("110105", ["北京市"], ["北京"])
    assert match("110000", ["北京"], ["北京市"])
    assert not match("110000", ["北京"], ["朝阳区"])


def test_only_explicit_province_and_prefecture_aliases_are_used():
    assert match("150623", ["内蒙古"], ["鄂尔多斯"])
    assert match("450100", ["广西"], ["南宁"])
    assert match("650100", ["新疆"], ["乌鲁木齐"])
    assert not match("150623", ["内蒙"], ["鄂尔多斯"])
    assert not match("150623", ["内蒙古"], ["鄂托克前"])
    assert match("420111", [" 湖北 "], ["武汉"])
    # A current ref is authority; retained free text cannot redirect the code.
    assert match("420111", ["湖北"], ["武汉"], region="广东", city="深圳")
    assert not match("420111", ["广东"], ["深圳"], region="广东", city="深圳")


def test_province_only_records_do_not_invent_city_or_county_coverage():
    for code, short in (("710000", "台湾"), ("810000", "香港"), ("820000", "澳门")):
        assert len(regions.region_path(ref(code))) == 1
        assert match(code, [short], [])
        assert regions.profile_geography_fit(v2(code), [short], [short]) == "unknown"
        assert regions.profile_geography_fit(v2(code), [], ["中西区"]) == "unknown"
        assert match(code, [], ["中西区"])  # No inferred match; unknown is nonblocking.


def test_v1_preserves_exact_nfkc_text_and_unknown_conditions_without_inferring_counties():
    assert regions.matches_profile_geography(profile(), ["湖北"], ["武汉"])
    assert regions.matches_profile_geography(profile(region=" 湖北 ", city="Ａ市"), ["湖北"], ["A市"])
    assert not regions.matches_profile_geography(profile(), ["湖北省"], ["武汉市"])
    assert not regions.matches_profile_geography(profile(city="阳城县", region="山西"), ["山西"], ["晋城"])
    assert regions.matches_profile_geography(profile(region="", city=""), ["任意省"], ["任意县"])
    explicit_unset = v2(None, region="湖北", city="武汉")
    assert regions.matches_profile_geography(explicit_unset, ["广东"], ["深圳"])
    assert regions.matches_profile_geography(explicit_unset, ["湖北"], ["武汉"])
    assert explicit_unset["regionRef"] is None and explicit_unset["city"] == "武汉"


def test_profile_v2_reuses_legacy_validator_without_rewriting_user_geography_or_mutating_input():
    original = v2(region="旧省级文本", city="旧城市文本", days=0, budgetYuan=0)
    before = copy.deepcopy(original)
    parsed = regions.profile_input_v2(original, legacy_profile_input)
    assert original == before
    assert parsed["region"] == "旧省级文本" and parsed["city"] == "旧城市文本"
    assert parsed["regionRef"] == ref("420111") and parsed["schemaVersion"] == 2
    assert parsed["days"] == 0 and parsed["budgetYuan"] == 0
    assert regions.profile_input_v2(v2(None), legacy_profile_input)["regionRef"] is None
    old = v2(regionRef=ref("350625", "cn-admin-2020-old"))
    assert_422(lambda: regions.profile_input_v2(old, legacy_profile_input))
    assert regions.profile_input_v2(old, legacy_profile_input, require_current=False)["regionRef"] == old["regionRef"]


@pytest.mark.parametrize("extra", [
    {"schemaVersion": True}, {"schemaVersion": 2.0}, {"schemaVersion": "2"}, {"schemaVersion": 1}, {"regionRef": []},
    {"days": True}, {"days": 10 ** 4000}, {"budgetYuan": float("nan")}, {"resources": []},
    {"schoolContext": True}, {"school": "\ud800"}, {"region": "a\x7fb"}, {"unregistered": "field"},
])
def test_profile_v2_rejects_bad_fields_types_unicode_and_nonfinite_numbers(extra):
    assert_422(lambda: regions.profile_input_v2(v2(**extra), legacy_profile_input))


def test_json_duplicate_ref_members_and_extension_contract_fail_with_422():
    for raw in ('{"code":"420111","code":"420106","catalogVersion":"' + VERSION + '"}',
                '{"schemaVersion":2,"schemaVersion":1}', '{"code":"\\ud800"}'):
        assert_422(lambda: regions.region_ref_input(strict_json(raw)))
    for bad in ([], True, {"region": "湖北", "city": "武汉", "regionRef": ref("420111")},
                {"region": "湖北", "city": "武汉", "schemaVersion": True, "regionRef": None},
                {"region": "湖北", "city": "武汉", "schemaVersion": 2}):
        assert_422(lambda: regions.matches_profile_geography(bad, [], []))
    for tags in (True, "湖北", ("湖北",), [True], ["\ud800"]):
        assert_422(lambda: regions.matches_profile_geography(profile(), tags, []))


def test_shared_typescript_python_vectors_keep_constraint_and_fit_parity():
    vector_path = ROOT / "packages" / "evi-x-shared" / "fixtures" / "topic-region-v2.json"
    vectors = strict_json(vector_path.read_text(encoding="utf-8"))
    assert vectors["schemaVersion"] == 1 and vectors["dataClass"] == "authored_synthetic"
    assert vectors["catalogVersion"] == VERSION and len(vectors["cases"]) == 22
    for case in vectors["cases"]:
        item = case["profile"]
        if not case["executable"]:
            assert regions.parse_region_ref_shape(item["regionRef"]) == item["regionRef"]
            assert_422(lambda: regions.region_ref_input(item["regionRef"]))
            assert_422(lambda: regions.matches_profile_geography(item, [], []))
            continue
        for pattern in case["patterns"]:
            assert regions.profile_geography_fit(item, pattern["regionTags"], pattern["cityTags"]) == pattern["fit"], case["id"]
            assert regions.matches_profile_geography(item, pattern["regionTags"], pattern["cityTags"]) is pattern["constraint"], case["id"]
