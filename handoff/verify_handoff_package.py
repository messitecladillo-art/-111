#!/usr/bin/env python3
"""Independently verify the private EVI-X handoff ZIP and its provenance."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import stat
import subprocess
import tempfile
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping


PACKAGE_NAME = "正大杯EVI-X-Agent交接包-2026-08-28-r3"
APP_BRANCH = "codex/unify-control-contract"
APP_COMMIT = "3aedd608a40ced1784c6890f39cb2fff635f8b66"
SITES_PROJECT_ID = "appgprj_6a71eee7cf908191a4c3c83d7f9969d3"
HISTORICAL_DEPLOYMENT_URL = "https://evi-x-zhengda-champion.probe-name-chill.chatgpt.site"

CSV_HEADER = ("archive_path", "category", "bytes", "sha256")
ALLOWED_CATEGORIES = {
    "workspace_root",
    "site_source",
    "provenance",
    "evals",
    "skill",
    "handoff_documentation",
    "handoff_tool",
    "private_reference_work",
    "git_baseline",
}
BANNED_PARTS = {
    ".git",
    ".vinext",
    ".wrangler",
    ".pytest_cache",
    "__pycache__",
    "dist",
    "node_modules",
    "tmp",
}
BANNED_FILE_NAMES = {"tsconfig.tsbuildinfo"}

MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024
MAX_MEMBERS = 10_000
MAX_MEMBER_BYTES = 512 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024
MAX_METADATA_BYTES = 8 * 1024 * 1024
MAX_COMPRESSION_RATIO = 250

SHA256_RE = re.compile(r"[0-9a-f]{64}\Z")
GIT_OID_RE = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
NON_NEGATIVE_INTEGER_RE = re.compile(r"(?:0|[1-9][0-9]*)\Z")
CHECKSUM_LINE_RE = re.compile(r"([0-9a-f]{64})  (.+)\Z")
SIDECAR_LINE_RE = re.compile(r"([0-9a-f]{64})  (.+)\Z")


def package_path(*parts: str) -> str:
    return PurePosixPath(PACKAGE_NAME, *parts).as_posix()


REFERENCE_FILES = (
    (
        package_path(
            "source-works",
            "01_足梦前行_武汉城市足球超级联赛双轨赛道",
            "5.8 足”梦前行，绝不“蒜鸟”——武汉城市足球超级联赛城区-高校双轨赛道赛事反馈与优化路径 (1).pptx",
        ),
        44_640_559,
        "7c45a1e0d3f525c5fe0e63479898e576529a2715cd8e0c1e89e6b72a01ca9ac1",
    ),
    (
        package_path(
            "source-works",
            "01_足梦前行_武汉城市足球超级联赛双轨赛道",
            "5.9更新版完整版（正文+附录）报告书 (1).docx",
        ),
        25_224_105,
        "14c3d612adbdb57dada2fd0a183746719700d14a080d8d2e1efffdea6da181a9",
    ),
    (
        package_path(
            "source-works",
            "02_脱下长衫之后_高校毕业生新蓝领",
            "脱下“长衫”之后——武汉市高校毕业生新蓝领群体就业选择、分层画像与成长支持路径研究 (2) (1).docx",
        ),
        16_578_002,
        "65c6efba92816b25a81922aa31047a00dae96bb0c1bb8ea1c86522c34863d30f",
    ),
    (
        package_path(
            "source-works",
            "02_脱下长衫之后_高校毕业生新蓝领",
            "脱下“长衫”之后——武汉市高校毕业生新蓝领群体就业选择、分层画像与成长支持路径研究（国赛).pdf",
        ),
        4_000_478,
        "fa3c4291924fb68ea16a550c4c2cd8463fb8b1892346382d8c076eba3aae6300",
    ),
    (
        package_path(
            "source-works",
            "03_娱你相遇_Z世代线下观演娱乐",
            "“娱”你相遇，因为心动--Z世代线下观演类娱乐的消费态度、行为和体验研究+报告.pdf",
        ),
        4_512_522,
        "20bc459f9b2e45c3f33019fe2ad9ef3b007bd8733107e535316291c7cd55f75f",
    ),
    (
        package_path(
            "source-works",
            "03_娱你相遇_Z世代线下观演娱乐",
            "“娱”你相遇，因为心动--Z世代线下观演类娱乐的消费态度、行为和体验研究+PPT.pptx",
        ),
        10_830_169,
        "a61de53d5dfb60744d1994db4610c2d656c5d5fe412842582f184829208d2e5d",
    ),
)

REFERENCE_MAP = {
    path: {
        "archivePath": path,
        "category": "private_reference_work",
        "bytes": size,
        "sha256": digest,
    }
    for path, size, digest in REFERENCE_FILES
}

BUNDLE_PATH = package_path("git-bundles", "evi-x-platform.git.bundle")
REQUIRED_PAYLOAD_PATHS = {
    package_path("00_先读我_交接说明.md"),
    package_path("01_给下一位Agent的接管指令.md"),
    package_path("02_交接范围与已知边界.md"),
    package_path("03_验收与复现记录.md"),
    package_path("handoff-tools", "build_handoff_package.py"),
    package_path("handoff-tools", "verify_handoff_package.py"),
    package_path("workspace", "AGENTS.md"),
    package_path("workspace", "skill", "zhengda-cup-champion", "SKILL.md"),
    package_path("workspace", "apps", "evi-x-platform", "package.json"),
    package_path("workspace", "apps", "evi-x-platform", "package-lock.json"),
    package_path("workspace", "apps", "evi-x-platform", "README.md"),
    package_path(
        "workspace", "apps", "evi-x-platform", "components", "EviXPlatform.tsx"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "components", "LifecycleWarRoom.tsx"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "lib", "lifecycle-interpretation.js"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "local-bridge", "README.md"
    ),
    package_path(
        "workspace",
        "apps",
        "evi-x-platform",
        "local-bridge",
        "agentctl_read_bridge.py",
    ),
    package_path(
        "workspace",
        "apps",
        "evi-x-platform",
        "local-bridge",
        "bridge.config.example.json",
    ),
    package_path(
        "workspace",
        "apps",
        "evi-x-platform",
        "local-bridge",
        "tests",
        "test_bridge.py",
    ),
    package_path(
        "workspace",
        "apps",
        "evi-x-platform",
        "scripts",
        "run-bridge-tests.mjs",
    ),
    package_path(
        "workspace",
        "apps",
        "evi-x-platform",
        "scripts",
        "check-cloud-bundle-isolation.mjs",
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "scripts", "verify.mjs"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "tests", "rendered-html.test.mjs"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "tests", "run-tests.mjs"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "data", "control-plane-contract.snapshot.json"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "data", "control-plane-contract.generated.ts"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "data", "rule-corpus.snapshot.json"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "data", "rule-corpus.generated.ts"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "scripts", "sync-rule-corpus.mjs"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "app", "api", "rules", "route.ts"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "drizzle", "0000_hot_quasimodo.sql"
    ),
    package_path(
        "workspace", "apps", "evi-x-platform", "drizzle", "0001_overjoyed_robin_chapel.sql"
    ),
    package_path("workspace", "apps", "evi-x-platform", ".openai", "hosting.json"),
    package_path("workspace", "apps", "evi-x-platform", "build", "sites-vite-plugin.ts"),
    BUNDLE_PATH,
}


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_member(
    archive: zipfile.ZipFile, name: str, chunk_size: int = 1024 * 1024
) -> str:
    digest = hashlib.sha256()
    with archive.open(name, "r") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reject_duplicate_json_keys(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise RuntimeError(f"PACKAGE_MANIFEST.json contains duplicate key: {key}")
        result[key] = value
    return result


def require_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be an object")
    return value


def expect_string(mapping: Mapping[str, Any], key: str, expected: str, label: str) -> None:
    value = mapping.get(key)
    if not isinstance(value, str) or value != expected:
        raise RuntimeError(f"{label}.{key} mismatch: {value!r} != {expected!r}")


def expect_integer(mapping: Mapping[str, Any], key: str, expected: int, label: str) -> None:
    value = mapping.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value != expected:
        raise RuntimeError(f"{label}.{key} mismatch: {value!r} != {expected}")


def expect_false(mapping: Mapping[str, Any], key: str, label: str) -> None:
    if mapping.get(key) is not False:
        raise RuntimeError(f"{label}.{key} must be false")


def expect_true(mapping: Mapping[str, Any], key: str, label: str) -> None:
    if mapping.get(key) is not True:
        raise RuntimeError(f"{label}.{key} must be true")


def validate_member_path(name: str) -> None:
    if not name or "\x00" in name or "\\" in name:
        raise RuntimeError(f"Unsafe ZIP member path: {name!r}")
    pure = PurePosixPath(name)
    if pure.is_absolute() or name.startswith("/") or pure.as_posix() != name:
        raise RuntimeError(f"Unsafe ZIP member path: {name}")
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise RuntimeError(f"Unsafe ZIP member path: {name}")
    if any(part.endswith((" ", ".")) or ":" in part for part in pure.parts):
        raise RuntimeError(f"Windows-unsafe ZIP member path: {name}")
    if not name.startswith(f"{PACKAGE_NAME}/"):
        raise RuntimeError(f"ZIP member escapes the package directory: {name}")
    folded_parts = {part.casefold() for part in pure.parts}
    if folded_parts & BANNED_PARTS:
        raise RuntimeError(f"Excluded directory was packaged: {name}")
    folded_name = pure.name.casefold()
    if folded_name in BANNED_FILE_NAMES or folded_name.startswith(".env"):
        raise RuntimeError(f"Excluded file was packaged: {name}")


def validate_zip_structure(archive: zipfile.ZipFile) -> dict[str, zipfile.ZipInfo]:
    infos = archive.infolist()
    if len(infos) > MAX_MEMBERS:
        raise RuntimeError(f"ZIP member count exceeds safety limit: {len(infos)}")
    exact_names: set[str] = set()
    portable_names: set[str] = set()
    total_uncompressed = 0
    for info in infos:
        name = info.filename
        validate_member_path(name)
        if info.is_dir():
            raise RuntimeError(f"Directory entries are not allowed in the curated ZIP: {name}")
        if name in exact_names:
            raise RuntimeError(f"ZIP contains duplicate member name: {name}")
        exact_names.add(name)
        portable_key = unicodedata.normalize("NFC", name).casefold()
        if portable_key in portable_names:
            raise RuntimeError(f"ZIP contains a portable path collision: {name}")
        portable_names.add(portable_key)
        unix_mode = (info.external_attr >> 16) & 0xFFFF
        if unix_mode and stat.S_ISLNK(unix_mode):
            raise RuntimeError(f"ZIP symbolic links are not allowed: {name}")
        if info.flag_bits & 0x1:
            raise RuntimeError(f"Encrypted ZIP members are not allowed: {name}")
        if info.file_size < 0 or info.file_size > MAX_MEMBER_BYTES:
            raise RuntimeError(f"ZIP member exceeds safety limit: {name}")
        total_uncompressed += info.file_size
        if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise RuntimeError("ZIP uncompressed payload exceeds safety limit")
        if info.file_size > 0:
            if info.compress_size <= 0:
                raise RuntimeError(f"Invalid compressed size for {name}")
            ratio = info.file_size / info.compress_size
            if ratio > MAX_COMPRESSION_RATIO:
                raise RuntimeError(f"Suspicious ZIP compression ratio for {name}: {ratio:.1f}")
    bad_member = archive.testzip()
    if bad_member is not None:
        raise RuntimeError(f"ZIP CRC verification failed at {bad_member}")
    return {info.filename: info for info in infos}


def read_metadata_member(archive: zipfile.ZipFile, name: str, encoding: str) -> str:
    info = archive.getinfo(name)
    if info.file_size > MAX_METADATA_BYTES:
        raise RuntimeError(f"Package metadata exceeds safety limit: {name}")
    return archive.read(name).decode(encoding)


def verify_sidecar(zip_path: Path, outer_hash: str) -> Path:
    if zip_path.name != f"{PACKAGE_NAME}.zip":
        raise RuntimeError(
            f"Unexpected ZIP filename: {zip_path.name}; expected {PACKAGE_NAME}.zip"
        )
    sidecar = zip_path.with_name(zip_path.name + ".sha256")
    if not sidecar.is_file():
        raise RuntimeError(f"Required outer SHA-256 sidecar is missing: {sidecar.name}")
    if sidecar.stat().st_size > 1024:
        raise RuntimeError("Outer SHA-256 sidecar is unexpectedly large")
    lines = sidecar.read_text(encoding="utf-8-sig").splitlines()
    if len(lines) != 1:
        raise RuntimeError("Outer SHA-256 sidecar must contain exactly one line")
    match = SIDECAR_LINE_RE.fullmatch(lines[0])
    if match is None:
        raise RuntimeError("Malformed outer SHA-256 sidecar")
    expected_hash, expected_name = match.groups()
    if expected_name != zip_path.name:
        raise RuntimeError(
            f"Outer SHA-256 sidecar filename mismatch: {expected_name!r} != {zip_path.name!r}"
        )
    if expected_hash != outer_hash:
        raise RuntimeError("Outer ZIP SHA-256 does not match the sidecar")
    return sidecar


def parse_file_manifest(csv_text: str) -> dict[str, dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames != list(CSV_HEADER):
        raise RuntimeError(
            f"FILE_MANIFEST.csv header mismatch: {reader.fieldnames!r} != {list(CSV_HEADER)!r}"
        )
    records: dict[str, dict[str, Any]] = {}
    for row_number, row in enumerate(reader, start=2):
        if None in row or any(row.get(field) is None for field in CSV_HEADER):
            raise RuntimeError(f"Malformed FILE_MANIFEST.csv row {row_number}")
        path = row["archive_path"]
        category = row["category"]
        size_text = row["bytes"]
        digest = row["sha256"]
        validate_member_path(path)
        if path in records:
            raise RuntimeError(f"FILE_MANIFEST.csv contains duplicate path: {path}")
        if category not in ALLOWED_CATEGORIES:
            raise RuntimeError(
                f"FILE_MANIFEST.csv row {row_number} has disallowed category: {category!r}"
            )
        if NON_NEGATIVE_INTEGER_RE.fullmatch(size_text) is None:
            raise RuntimeError(
                f"FILE_MANIFEST.csv row {row_number} has invalid byte count: {size_text!r}"
            )
        if SHA256_RE.fullmatch(digest) is None:
            raise RuntimeError(
                f"FILE_MANIFEST.csv row {row_number} has invalid lowercase SHA-256"
            )
        records[path] = {
            "archive_path": path,
            "category": category,
            "bytes": int(size_text),
            "sha256": digest,
        }
    if not records:
        raise RuntimeError("FILE_MANIFEST.csv contains no payload records")
    return records


def parse_checksums(checksum_text: str) -> dict[str, str]:
    lines = checksum_text.splitlines()
    if not lines or any(not line for line in lines):
        raise RuntimeError("CHECKSUMS.sha256 contains a blank or missing line")
    checksums: dict[str, str] = {}
    for line_number, line in enumerate(lines, start=1):
        match = CHECKSUM_LINE_RE.fullmatch(line)
        if match is None:
            raise RuntimeError(f"Malformed checksum line {line_number}: {line!r}")
        digest, path = match.groups()
        validate_member_path(path)
        if path in checksums:
            raise RuntimeError(f"CHECKSUMS.sha256 contains duplicate path: {path}")
        checksums[path] = digest
    return checksums


def verify_reference_records(records: Mapping[str, Mapping[str, Any]]) -> None:
    actual_reference_paths = {
        path
        for path, record in records.items()
        if record.get("category") == "private_reference_work"
    }
    expected_reference_paths = set(REFERENCE_MAP)
    if actual_reference_paths != expected_reference_paths:
        missing = sorted(expected_reference_paths - actual_reference_paths)
        unexpected = sorted(actual_reference_paths - expected_reference_paths)
        raise RuntimeError(
            f"Private reference payload mismatch; missing={missing}, unexpected={unexpected}"
        )
    for path, expected in REFERENCE_MAP.items():
        record = records[path]
        for key in ("category", "bytes", "sha256"):
            if record.get(key) != expected[key]:
                raise RuntimeError(f"Fixed reference {key} mismatch for {path}")


def verify_reference_manifest(metadata: Mapping[str, Any]) -> None:
    works = metadata.get("referenceWorks")
    if not isinstance(works, list) or len(works) != len(REFERENCE_MAP):
        raise RuntimeError("PACKAGE_MANIFEST referenceWorks must contain exactly six entries")
    seen: set[str] = set()
    for index, value in enumerate(works):
        work = require_mapping(value, f"PACKAGE_MANIFEST.referenceWorks[{index}]")
        path = work.get("archivePath")
        if not isinstance(path, str) or path in seen:
            raise RuntimeError("PACKAGE_MANIFEST referenceWorks contains an invalid/duplicate path")
        seen.add(path)
        expected = REFERENCE_MAP.get(path)
        if expected is None:
            raise RuntimeError(f"Unexpected PACKAGE_MANIFEST reference work: {path}")
        for key in ("archivePath", "category", "bytes", "sha256"):
            if work.get(key) != expected[key]:
                raise RuntimeError(f"PACKAGE_MANIFEST referenceWorks {key} mismatch for {path}")
    if seen != set(REFERENCE_MAP):
        raise RuntimeError("PACKAGE_MANIFEST referenceWorks does not match the fixed reference set")


def verify_package_manifest(
    metadata: Mapping[str, Any], payload_count: int, payload_bytes: int
) -> Mapping[str, Any]:
    expect_integer(metadata, "schemaVersion", 2, "PACKAGE_MANIFEST")
    expect_string(metadata, "packageDirectory", PACKAGE_NAME, "PACKAGE_MANIFEST")
    expect_integer(metadata, "payloadFileCount", payload_count, "PACKAGE_MANIFEST")
    expect_integer(metadata, "payloadBytes", payload_bytes, "PACKAGE_MANIFEST")

    privacy = require_mapping(metadata.get("privacy"), "PACKAGE_MANIFEST.privacy")
    expect_string(privacy, "classification", "private_handoff", "privacy")
    expect_string(privacy, "referenceWorksRightsStatus", "unknown", "privacy")
    expect_false(privacy, "publicRedistributionAllowed", "privacy")

    site = require_mapping(metadata.get("site"), "PACKAGE_MANIFEST.site")
    expect_string(site, "gitCommit", APP_COMMIT, "site")
    expect_string(site, "branch", APP_BRANCH, "site")
    expect_false(site, "remoteIncluded", "site")
    expect_string(site, "deploymentUrlHistoricalSnapshot", HISTORICAL_DEPLOYMENT_URL, "site")
    expect_string(site, "sitesProjectIdSnapshot", SITES_PROJECT_ID, "site")
    expect_string(
        site, "sitesProjectAccess", "project_not_found_current_connector", "site"
    )
    expect_false(site, "productionDeploymentVerified", "site")
    expect_false(site, "productionD1Verified", "site")
    expect_false(site, "hostingCredentialsIncluded", "site")
    expect_false(site, "productionD1DataIncluded", "site")

    cases = require_mapping(metadata.get("caseLibrary"), "PACKAGE_MANIFEST.caseLibrary")
    expect_integer(cases, "total", 32, "caseLibrary")
    expect_integer(cases, "officialVerified", 29, "caseLibrary")
    expect_integer(cases, "userAttested", 3, "caseLibrary")

    rules = require_mapping(metadata.get("ruleCorpus"), "PACKAGE_MANIFEST.ruleCorpus")
    expect_integer(rules, "totalRules", 10, "ruleCorpus")
    expect_integer(rules, "totalSources", 1, "ruleCorpus")
    expect_string(rules, "edition", "第十六届", "ruleCorpus")
    expect_string(rules, "group", "本科组", "ruleCorpus")
    expect_string(
        rules,
        "sourceRawSha256",
        "861229a14cc08085324187011c57fa4df5e3b2ede9b7deff5c826a8749c9dc71",
        "ruleCorpus",
    )

    bridge = require_mapping(
        metadata.get("lifecycleReadBridge"), "PACKAGE_MANIFEST.lifecycleReadBridge"
    )
    expect_string(bridge, "scope", "local_loopback_read_only", "lifecycleReadBridge")
    if bridge.get("commands") != ["status", "next", "doctor"]:
        raise RuntimeError(
            "lifecycleReadBridge.commands must be exactly status, next, doctor"
        )
    for key in (
        "projectAliasesOnly",
        "ephemeralBearerToken",
        "redactedDtoOnly",
        "cloudBundleIsolationPostbuild",
    ):
        expect_true(bridge, key, "lifecycleReadBridge")
    for key in (
        "rawAgentctlOutputExposed",
        "writeEndpointsAvailable",
        "advanceAvailable",
        "handoffAvailable",
    ):
        expect_false(bridge, key, "lifecycleReadBridge")
    expect_integer(
        bridge,
        "browserSnapshotMaxAgeSeconds",
        300,
        "lifecycleReadBridge",
    )
    expect_integer(
        bridge,
        "serverSnapshotDeadlineSeconds",
        75,
        "lifecycleReadBridge",
    )
    expect_integer(
        bridge,
        "clientSnapshotTimeoutSeconds",
        90,
        "lifecycleReadBridge",
    )

    validation = require_mapping(
        metadata.get("validationSnapshot"), "PACKAGE_MANIFEST.validationSnapshot"
    )
    expected_validation_strings = {
        "date": "2026-08-28",
        "fullVerify": "pass",
        "typecheck": "pass",
        "eslint": "pass",
        "build": "pass",
        "bridgeTests": "16/16 pass",
        "siteAndApiTests": "11/11 pass",
        "d1Integration": "migration, owner partition, restart persistence pass",
        "staticEvals": "27/27 pass",
        "behaviorSchema": "33/33 pass",
        "recovery": "7/7 pass",
        "concurrency": "1/1 pass",
        "cliUtf8": "1/1 pass",
        "submissionIntegration": "pass",
        "npmAuditModerate": "0 vulnerabilities",
    }
    for key, expected in expected_validation_strings.items():
        expect_string(validation, key, expected, "validationSnapshot")

    contract = require_mapping(validation.get("contract"), "validationSnapshot.contract")
    expect_integer(contract, "stages", 12, "validationSnapshot.contract")
    expect_integer(contract, "transitions", 11, "validationSnapshot.contract")
    expect_integer(contract, "gates", 9, "validationSnapshot.contract")
    expect_integer(contract, "mutationGuards", 3, "validationSnapshot.contract")

    asset_security = require_mapping(
        validation.get("assetSecurity"), "validationSnapshot.assetSecurity"
    )
    expect_integer(asset_security, "filesScanned", 64, "validationSnapshot.assetSecurity")
    expect_string(asset_security, "status", "pass", "validationSnapshot.assetSecurity")

    cloud_bundle = require_mapping(
        validation.get("cloudBundleIsolation"),
        "validationSnapshot.cloudBundleIsolation",
    )
    expect_integer(
        cloud_bundle,
        "filesScanned",
        103,
        "validationSnapshot.cloudBundleIsolation",
    )
    expect_string(
        cloud_bundle,
        "status",
        "pass",
        "validationSnapshot.cloudBundleIsolation",
    )

    formal_scan = require_mapping(
        validation.get("formalSecurityScan"), "validationSnapshot.formalSecurityScan"
    )
    expect_string(formal_scan, "status", "tool_error", "formalSecurityScan")
    if "scanId" not in formal_scan or formal_scan.get("scanId") is not None:
        raise RuntimeError("formalSecurityScan.scanId must be null for the recorded tool error")
    expect_string(
        formal_scan,
        "reason",
        "GBK decode failure on Chinese workspace path",
        "formalSecurityScan",
    )

    project_state = require_mapping(
        metadata.get("projectState"), "PACKAGE_MANIFEST.projectState"
    )
    expect_false(project_state, "realCompetitionProjectInitialized", "projectState")

    git_bundle = require_mapping(metadata.get("gitBundle"), "PACKAGE_MANIFEST.gitBundle")
    expect_string(git_bundle, "status", "verified", "gitBundle")
    bundle_refs = require_mapping(git_bundle.get("refs"), "gitBundle.refs")
    target_ref = f"refs/heads/{APP_BRANCH}"
    expect_string(bundle_refs, target_ref, APP_COMMIT, "gitBundle.refs")

    verify_reference_manifest(metadata)
    return bundle_refs


def run_git(args: list[str], label: str) -> str:
    try:
        result = subprocess.run(
            args,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Git is required to verify the bundled repository") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"{label} failed: {detail[-2000:]}")
    return result.stdout.strip()


def verify_git_bundle(
    archive: zipfile.ZipFile, declared_refs: Mapping[str, Any]
) -> dict[str, str]:
    with tempfile.TemporaryDirectory(prefix="evi-x-handoff-verify-") as temporary:
        temp_root = Path(temporary)
        bundle_file = temp_root / "evi-x-platform.git.bundle"
        with archive.open(BUNDLE_PATH, "r") as source, bundle_file.open("wb") as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
        bare_repo = temp_root / "verify.git"
        run_git(["git", "init", "--bare", str(bare_repo)], "git init")
        run_git(
            ["git", "-C", str(bare_repo), "bundle", "verify", str(bundle_file)],
            "git bundle verify",
        )
        heads_output = run_git(
            ["git", "bundle", "list-heads", str(bundle_file)],
            "git bundle list-heads",
        )
        actual_refs: dict[str, str] = {}
        for line in heads_output.splitlines():
            digest, separator, ref_name = line.partition(" ")
            if not separator or GIT_OID_RE.fullmatch(digest) is None or not ref_name:
                raise RuntimeError(f"Malformed git bundle reference: {line!r}")
            if ref_name in actual_refs:
                raise RuntimeError(f"Duplicate git bundle reference: {ref_name}")
            actual_refs[ref_name] = digest
        target_ref = f"refs/heads/{APP_BRANCH}"
        if actual_refs.get(target_ref) != APP_COMMIT:
            raise RuntimeError(
                f"Git bundle target ref mismatch: {actual_refs.get(target_ref)!r} != {APP_COMMIT}"
            )
        for ref_name, digest in declared_refs.items():
            if not isinstance(ref_name, str) or not isinstance(digest, str):
                raise RuntimeError("gitBundle.refs must map strings to lowercase commit IDs")
            if GIT_OID_RE.fullmatch(digest) is None:
                raise RuntimeError(f"gitBundle.refs has invalid commit ID for {ref_name}")
            if actual_refs.get(ref_name) != digest:
                raise RuntimeError(f"Declared git bundle ref is absent or mismatched: {ref_name}")
        run_git(
            [
                "git",
                "-C",
                str(bare_repo),
                "fetch",
                str(bundle_file),
                f"{target_ref}:{target_ref}",
            ],
            "git fetch from bundle",
        )
        fetched_commit = run_git(
            ["git", "-C", str(bare_repo), "rev-parse", target_ref],
            "git rev-parse bundled branch",
        )
        if fetched_commit != APP_COMMIT:
            raise RuntimeError(f"Fetched git bundle commit mismatch: {fetched_commit}")
        object_type = run_git(
            ["git", "-C", str(bare_repo), "cat-file", "-t", APP_COMMIT],
            "git cat-file bundled commit",
        )
        if object_type != "commit":
            raise RuntimeError(f"Bundled target object is not a commit: {object_type!r}")
        return actual_refs


def verify(zip_path: Path) -> dict[str, object]:
    zip_path = zip_path.resolve()
    if not zip_path.is_file():
        raise FileNotFoundError(zip_path)
    if zip_path.stat().st_size > MAX_ZIP_BYTES:
        raise RuntimeError("Outer ZIP exceeds safety limit")
    outer_hash = sha256_file(zip_path)
    sidecar = verify_sidecar(zip_path, outer_hash)

    prefix = f"{PACKAGE_NAME}/"
    manifest_csv_path = f"{prefix}FILE_MANIFEST.csv"
    checksums_path = f"{prefix}CHECKSUMS.sha256"
    package_manifest_path = f"{prefix}PACKAGE_MANIFEST.json"
    metadata_members = {manifest_csv_path, checksums_path, package_manifest_path}

    with zipfile.ZipFile(zip_path, "r") as archive:
        zip_info = validate_zip_structure(archive)
        for required in metadata_members:
            if required not in zip_info:
                raise RuntimeError(f"Missing package metadata: {required}")
        csv_text = read_metadata_member(archive, manifest_csv_path, "utf-8-sig")
        records = parse_file_manifest(csv_text)
        checksum_text = read_metadata_member(archive, checksums_path, "utf-8")
        checksum_map = parse_checksums(checksum_text)
        if set(checksum_map) != set(records):
            raise RuntimeError("CHECKSUMS.sha256 and FILE_MANIFEST.csv disagree on paths")
        for path, record in records.items():
            if checksum_map[path] != record["sha256"]:
                raise RuntimeError(f"CHECKSUMS.sha256 and FILE_MANIFEST.csv disagree for {path}")

        missing_required = sorted(REQUIRED_PAYLOAD_PATHS - set(records))
        if missing_required:
            raise RuntimeError(f"Required handoff payloads missing: {missing_required}")
        if records[BUNDLE_PATH]["category"] != "git_baseline":
            raise RuntimeError("Git bundle must use the git_baseline category")
        verify_reference_records(records)

        payload_bytes = 0
        for path, record in records.items():
            info = zip_info.get(path)
            if info is None:
                raise RuntimeError(f"Manifest payload missing from ZIP: {path}")
            expected_size = record["bytes"]
            if info.file_size != expected_size:
                raise RuntimeError(
                    f"Size mismatch for {path}: {info.file_size} != {expected_size}"
                )
            actual_hash = sha256_member(archive, path)
            if actual_hash != record["sha256"]:
                raise RuntimeError(f"SHA-256 mismatch for {path}")
            payload_bytes += info.file_size

        unlisted = set(zip_info) - set(records) - metadata_members
        if unlisted:
            raise RuntimeError(f"Unlisted ZIP members: {sorted(unlisted)}")

        manifest_text = read_metadata_member(archive, package_manifest_path, "utf-8")
        metadata_value = json.loads(
            manifest_text, object_pairs_hook=reject_duplicate_json_keys
        )
        metadata = require_mapping(metadata_value, "PACKAGE_MANIFEST")
        declared_refs = verify_package_manifest(metadata, len(records), payload_bytes)
        actual_bundle_refs = verify_git_bundle(archive, declared_refs)

    return {
        "status": "pass",
        "zip": str(zip_path),
        "sidecar": str(sidecar),
        "zipBytes": zip_path.stat().st_size,
        "zipSha256": outer_hash,
        "sidecarVerified": True,
        "payloadFileCount": len(records),
        "payloadBytes": payload_bytes,
        "privateReferenceFiles": len(REFERENCE_MAP),
        "gitBundleVerified": True,
        "gitBranch": APP_BRANCH,
        "gitCommit": APP_COMMIT,
        "gitBundleRefCount": len(actual_bundle_refs),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_path", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print(json.dumps(verify(args.zip_path), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
