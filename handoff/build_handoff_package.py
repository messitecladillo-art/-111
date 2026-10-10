#!/usr/bin/env python3
"""Build and verify the private EVI-X handoff ZIP.

The archive is deliberately curated. It excludes dependencies, caches, Git
working metadata, secrets and old build output while preserving the tracked
site source (including build/sites-vite-plugin.ts), provenance, evals, skill
assets, handoff docs and the six user-supplied reference artifacts.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import stat
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Iterable
from zoneinfo import ZoneInfo


PACKAGE_NAME = "正大杯EVI-X-Agent交接包-2026-08-28-r3"
APP_COMMIT = "3aedd608a40ced1784c6890f39cb2fff635f8b66"
APP_BRANCH = "codex/unify-control-contract"
SITES_PROJECT_ID = "appgprj_6a71eee7cf908191a4c3c83d7f9969d3"
DEPLOYMENT_URL_HISTORICAL = "https://evi-x-zhengda-champion.probe-name-chill.chatgpt.site"

ROOT_FILES = (
    ".gitignore",
    "AGENTS.md",
    "README.md",
    "RELEASE_AUDIT.md",
    "pyproject.toml",
    "资料交接清单.md",
    "三件国奖作品共性提炼与Agent升级-2026-08-04.md",
    "三件作品案例审计与Agent优化报告-2026-08-04.md",
)

HANDOFF_DOCS = (
    "00_先读我_交接说明.md",
    "01_给下一位Agent的接管指令.md",
    "02_交接范围与已知边界.md",
    "03_验收与复现记录.md",
)

HANDOFF_TOOLS = (
    "build_handoff_package.py",
    "verify_handoff_package.py",
)

REFERENCE_FILES = (
    (
        "01_足梦前行_武汉城市足球超级联赛双轨赛道",
        "5.8 足”梦前行，绝不“蒜鸟”——武汉城市足球超级联赛城区-高校双轨赛道赛事反馈与优化路径 (1).pptx",
        44_640_559,
        "7c45a1e0d3f525c5fe0e63479898e576529a2715cd8e0c1e89e6b72a01ca9ac1",
    ),
    (
        "01_足梦前行_武汉城市足球超级联赛双轨赛道",
        "5.9更新版完整版（正文+附录）报告书 (1).docx",
        25_224_105,
        "14c3d612adbdb57dada2fd0a183746719700d14a080d8d2e1efffdea6da181a9",
    ),
    (
        "02_脱下长衫之后_高校毕业生新蓝领",
        "脱下“长衫”之后——武汉市高校毕业生新蓝领群体就业选择、分层画像与成长支持路径研究 (2) (1).docx",
        16_578_002,
        "65c6efba92816b25a81922aa31047a00dae96bb0c1bb8ea1c86522c34863d30f",
    ),
    (
        "02_脱下长衫之后_高校毕业生新蓝领",
        "脱下“长衫”之后——武汉市高校毕业生新蓝领群体就业选择、分层画像与成长支持路径研究（国赛).pdf",
        4_000_478,
        "fa3c4291924fb68ea16a550c4c2cd8463fb8b1892346382d8c076eba3aae6300",
    ),
    (
        "03_娱你相遇_Z世代线下观演娱乐",
        "“娱”你相遇，因为心动--Z世代线下观演类娱乐的消费态度、行为和体验研究+报告.pdf",
        4_512_522,
        "20bc459f9b2e45c3f33019fe2ad9ef3b007bd8733107e535316291c7cd55f75f",
    ),
    (
        "03_娱你相遇_Z世代线下观演娱乐",
        "“娱”你相遇，因为心动--Z世代线下观演类娱乐的消费态度、行为和体验研究+PPT.pptx",
        10_830_169,
        "a61de53d5dfb60744d1994db4610c2d656c5d5fe412842582f184829208d2e5d",
    ),
)

EXCLUDED_DIR_NAMES = {
    ".git",
    ".vinext",
    ".wrangler",
    ".pytest_cache",
    "__pycache__",
    "dist",
    "node_modules",
    "tmp",
}

EXCLUDED_FILE_NAMES = {"tsconfig.tsbuildinfo"}
EXCLUDED_SUFFIXES = {".log", ".pyc", ".pyo", ".partial", ".zip"}
SENSITIVE_FILE_NAMES = {
    "credentials.json",
    "secrets.json",
    "id_rsa",
    "id_ed25519",
}
WINDOWS_REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


@dataclass(frozen=True)
class Payload:
    source: Path
    archive_path: str
    category: str
    expected_size: int | None = None
    expected_sha256: str | None = None


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_archive_path(*parts: str) -> str:
    value = PurePosixPath(*parts).as_posix()
    if value.startswith("/") or ".." in PurePosixPath(value).parts:
        raise ValueError(f"Unsafe archive path: {value}")
    return value


def is_excluded(path: Path) -> bool:
    if any(part in EXCLUDED_DIR_NAMES for part in path.parts):
        return True
    if path.name in EXCLUDED_FILE_NAMES:
        return True
    if path.name.startswith(".env"):
        return True
    return path.suffix.lower() in EXCLUDED_SUFFIXES


def reject_unsafe_source(path: Path, *, require_file: bool = False) -> None:
    metadata = path.lstat()
    attributes = getattr(metadata, "st_file_attributes", 0)
    if stat.S_ISLNK(metadata.st_mode) or attributes & WINDOWS_REPARSE_POINT:
        raise RuntimeError(f"Refusing symlink or reparse-point source: {path}")
    if require_file and not stat.S_ISREG(metadata.st_mode):
        raise RuntimeError(f"Refusing non-regular source file: {path}")
    if path.name.lower() in SENSITIVE_FILE_NAMES:
        raise RuntimeError(f"Refusing sensitive filename in handoff source: {path}")


def walk_files(root: Path) -> Iterable[Path]:
    reject_unsafe_source(root)
    for directory, dirnames, filenames in os.walk(root):
        base = Path(directory)
        reject_unsafe_source(base)
        included_dirs: list[str] = []
        for name in sorted(dirnames):
            if name in EXCLUDED_DIR_NAMES:
                continue
            reject_unsafe_source(base / name)
            included_dirs.append(name)
        dirnames[:] = included_dirs
        for filename in sorted(filenames):
            path = base / filename
            relative = path.relative_to(root)
            if not is_excluded(relative):
                reject_unsafe_source(path, require_file=True)
                yield path


def run_git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)


def tracked_site_payloads(workspace: Path) -> list[Payload]:
    app = workspace / "apps" / "evi-x-platform"
    head = run_git(["rev-parse", "HEAD"], app)
    if head != APP_COMMIT:
        raise RuntimeError(f"Unexpected site HEAD: {head}; expected {APP_COMMIT}")
    if run_git(["status", "--short"], app):
        raise RuntimeError("Site Git worktree is not clean; refusing an ambiguous handoff")
    branch = run_git(["branch", "--show-current"], app)
    if branch != APP_BRANCH:
        raise RuntimeError(f"Unexpected site branch: {branch}; expected {APP_BRANCH}")
    listing = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=app,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout
    paths = [item.decode("utf-8") for item in listing.split(b"\0") if item]
    payloads: list[Payload] = []
    for relative_text in sorted(paths):
        relative = Path(relative_text)
        if is_excluded(relative):
            raise RuntimeError(f"Tracked site source unexpectedly matches an exclusion: {relative_text}")
        source = app / relative
        if not source.is_file():
            raise FileNotFoundError(source)
        reject_unsafe_source(source, require_file=True)
        payloads.append(
            Payload(
                source,
                safe_archive_path("workspace", "apps", "evi-x-platform", relative.as_posix()),
                "site_source",
            )
        )
    required_plugin = "workspace/apps/evi-x-platform/build/sites-vite-plugin.ts"
    if required_plugin not in {item.archive_path for item in payloads}:
        raise RuntimeError(f"Required tracked source missing: {required_plugin}")
    return payloads


def collect_payloads(workspace: Path, downloads: Path) -> list[Payload]:
    handoff_dir = workspace / "handoff"
    payloads: list[Payload] = []

    for name in ROOT_FILES:
        source = workspace / name
        if not source.is_file():
            raise FileNotFoundError(source)
        payloads.append(Payload(source, safe_archive_path("workspace", name), "workspace_root"))

    payloads.extend(tracked_site_payloads(workspace))

    for relative_dir, category in (
        (Path("corpus-source"), "provenance"),
        (Path("evals"), "evals"),
        (Path("skill") / "zhengda-cup-champion", "skill"),
    ):
        source_root = workspace / relative_dir
        if not source_root.is_dir():
            raise FileNotFoundError(source_root)
        for source in walk_files(source_root):
            relative = source.relative_to(workspace).as_posix()
            payloads.append(Payload(source, safe_archive_path("workspace", relative), category))

    for name in HANDOFF_DOCS:
        source = handoff_dir / name
        if not source.is_file():
            raise FileNotFoundError(source)
        payloads.append(Payload(source, name, "handoff_documentation"))

    for name in HANDOFF_TOOLS:
        tool = handoff_dir / name
        if not tool.is_file():
            raise FileNotFoundError(tool)
        payloads.append(
            Payload(tool, safe_archive_path("handoff-tools", tool.name), "handoff_tool")
        )

    for folder, filename, expected_size, expected_hash in REFERENCE_FILES:
        source = downloads / filename
        if not source.is_file():
            raise FileNotFoundError(source)
        payloads.append(
            Payload(
                source,
                safe_archive_path("source-works", folder, filename),
                "private_reference_work",
                expected_size,
                expected_hash,
            )
        )

    archive_paths = [item.archive_path for item in payloads]
    duplicates = sorted({path for path in archive_paths if archive_paths.count(path) > 1})
    if duplicates:
        raise RuntimeError(f"Duplicate archive paths: {duplicates}")
    return sorted(payloads, key=lambda item: item.archive_path)


def verify_reference(item: Payload) -> tuple[int, str]:
    reject_unsafe_source(item.source, require_file=True)
    size = item.source.stat().st_size
    digest = sha256_file(item.source)
    if item.expected_size is not None and size != item.expected_size:
        raise RuntimeError(f"Size mismatch for {item.source.name}: {size} != {item.expected_size}")
    if item.expected_sha256 is not None and digest != item.expected_sha256:
        raise RuntimeError(
            f"SHA-256 mismatch for {item.source.name}: {digest} != {item.expected_sha256}"
        )
    return size, digest


def build_manifest_csv(records: list[dict[str, object]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(
        output,
        fieldnames=("archive_path", "category", "bytes", "sha256"),
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(records)
    return output.getvalue().encode("utf-8-sig")


def build_checksums(records: list[dict[str, object]]) -> bytes:
    lines = [f"{record['sha256']}  {record['archive_path']}" for record in records]
    return ("\n".join(lines) + "\n").encode("utf-8")


def add_generated(
    zip_handle: zipfile.ZipFile,
    path: str,
    data: bytes,
    zip_date_time: tuple[int, int, int, int, int, int],
) -> None:
    info = zipfile.ZipInfo(path, date_time=zip_date_time)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    zip_handle.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


def build_package(workspace: Path, downloads: Path, output_dir: Path) -> dict[str, object]:
    workspace = workspace.resolve()
    downloads = downloads.resolve()
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    payloads = collect_payloads(workspace, downloads)
    output = output_dir / f"{PACKAGE_NAME}.zip"
    partial = output_dir / f"{PACKAGE_NAME}.zip.partial"
    sidecar = output_dir / f"{PACKAGE_NAME}.zip.sha256"
    if output.exists() or sidecar.exists():
        raise FileExistsError(
            f"Refusing to overwrite an existing handoff package: {output} or {sidecar}"
        )

    created_at = datetime.now(ZoneInfo("Asia/Shanghai"))
    created_at_text = created_at.isoformat(timespec="seconds")
    zip_date_time = (
        created_at.year,
        created_at.month,
        created_at.day,
        created_at.hour,
        created_at.minute,
        created_at.second,
    )

    for target in (partial,):
        if target.exists():
            target.unlink()

    app = workspace / "apps" / "evi-x-platform"
    temporary_bundle: Path | None = None
    try:
        file_descriptor, bundle_name = tempfile.mkstemp(
            prefix="evi-x-platform-", suffix=".bundle", dir=output_dir
        )
        os.close(file_descriptor)
        temporary_bundle = Path(bundle_name)
        temporary_bundle.unlink()
        branch_ref = f"refs/heads/{APP_BRANCH}"
        run_git(["bundle", "create", str(temporary_bundle), branch_ref], app)
        run_git(["bundle", "verify", str(temporary_bundle)], app)
        bundle_heads = run_git(["bundle", "list-heads", str(temporary_bundle)], app)
        expected_bundle_head = f"{APP_COMMIT} {branch_ref}"
        if bundle_heads.strip() != expected_bundle_head:
            raise RuntimeError(
                f"Unexpected Git bundle refs: {bundle_heads!r}; expected {expected_bundle_head!r}"
            )

        records: list[dict[str, object]] = []
        with zipfile.ZipFile(
            partial,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
            allowZip64=True,
        ) as archive:
            for item in payloads:
                size, digest = verify_reference(item)
                packaged_path = safe_archive_path(PACKAGE_NAME, item.archive_path)
                archive.write(item.source, packaged_path)
                post_size, post_digest = verify_reference(item)
                if (post_size, post_digest) != (size, digest):
                    raise RuntimeError(f"Source changed while packaging: {item.source}")
                records.append(
                    {
                        "archive_path": packaged_path,
                        "category": item.category,
                        "bytes": size,
                        "sha256": digest,
                    }
                )

            bundle_path = safe_archive_path(
                PACKAGE_NAME, "git-bundles", "evi-x-platform.git.bundle"
            )
            bundle_size = temporary_bundle.stat().st_size
            bundle_hash = sha256_file(temporary_bundle)
            archive.write(temporary_bundle, bundle_path)
            records.append(
                {
                    "archive_path": bundle_path,
                    "category": "git_baseline",
                    "bytes": bundle_size,
                    "sha256": bundle_hash,
                }
            )
            records.sort(key=lambda record: str(record["archive_path"]))

            manifest = {
                "schemaVersion": 2,
                "title": "正大杯 EVI-X Agent 私有完整交接包",
                "createdAt": created_at_text,
                "packageDirectory": PACKAGE_NAME,
                "privacy": {
                    "classification": "private_handoff",
                    "referenceWorksRightsStatus": "unknown",
                    "publicRedistributionAllowed": False,
                },
                "site": {
                    "gitCommit": APP_COMMIT,
                    "branch": APP_BRANCH,
                    "remoteIncluded": False,
                    "deploymentUrlHistoricalSnapshot": DEPLOYMENT_URL_HISTORICAL,
                    "sitesProjectIdSnapshot": SITES_PROJECT_ID,
                    "sitesProjectAccess": "project_not_found_current_connector",
                    "productionDeploymentVerified": False,
                    "productionD1Verified": False,
                    "hostingCredentialsIncluded": False,
                    "productionD1DataIncluded": False,
                },
                "caseLibrary": {
                    "total": 32,
                    "officialVerified": 29,
                    "userAttested": 3,
                },
                "ruleCorpus": {
                    "totalRules": 10,
                    "totalSources": 1,
                    "edition": "第十六届",
                    "group": "本科组",
                    "sourceRawSha256": "861229a14cc08085324187011c57fa4df5e3b2ede9b7deff5c826a8749c9dc71",
                },
                "lifecycleReadBridge": {
                    "scope": "local_loopback_read_only",
                    "commands": ["status", "next", "doctor"],
                    "projectAliasesOnly": True,
                    "ephemeralBearerToken": True,
                    "redactedDtoOnly": True,
                    "rawAgentctlOutputExposed": False,
                    "browserSnapshotMaxAgeSeconds": 300,
                    "serverSnapshotDeadlineSeconds": 75,
                    "clientSnapshotTimeoutSeconds": 90,
                    "writeEndpointsAvailable": False,
                    "advanceAvailable": False,
                    "handoffAvailable": False,
                    "cloudBundleIsolationPostbuild": True,
                },
                "validationSnapshot": {
                    "date": "2026-08-28",
                    "fullVerify": "pass",
                    "contract": {
                        "stages": 12,
                        "transitions": 11,
                        "gates": 9,
                        "mutationGuards": 3,
                    },
                    "assetSecurity": {"filesScanned": 64, "status": "pass"},
                    "cloudBundleIsolation": {"filesScanned": 103, "status": "pass"},
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
                    "formalSecurityScan": {
                        "status": "tool_error",
                        "scanId": None,
                        "reason": "GBK decode failure on Chinese workspace path",
                    },
                },
                "projectState": {"realCompetitionProjectInitialized": False},
                "rulesBoundary": (
                    "Rule snapshots are edition/group/region/track/stage specific; "
                    "revalidate the current official notice before applying hard rules."
                ),
                "gitBundle": {
                    "status": "verified",
                    "refs": {branch_ref: APP_COMMIT},
                },
                "referenceWorks": [
                    {
                        "archivePath": record["archive_path"],
                        "category": record["category"],
                        "bytes": record["bytes"],
                        "sha256": record["sha256"],
                    }
                    for record in records
                    if record["category"] == "private_reference_work"
                ],
                "excluded": [
                    ".git directories",
                    "node_modules",
                    ".vinext",
                    ".wrangler",
                    "dist",
                    "tsconfig.tsbuildinfo",
                    "workspace tmp",
                    "Python caches",
                    "logs",
                    ".env files and credentials",
                ],
                "payloadFileCount": len(records),
                "payloadBytes": sum(int(record["bytes"]) for record in records),
                "payloadManifestFiles": ["FILE_MANIFEST.csv", "CHECKSUMS.sha256"],
            }

            add_generated(
                archive,
                safe_archive_path(PACKAGE_NAME, "FILE_MANIFEST.csv"),
                build_manifest_csv(records),
                zip_date_time,
            )
            add_generated(
                archive,
                safe_archive_path(PACKAGE_NAME, "CHECKSUMS.sha256"),
                build_checksums(records),
                zip_date_time,
            )
            add_generated(
                archive,
                safe_archive_path(PACKAGE_NAME, "PACKAGE_MANIFEST.json"),
                (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
                zip_date_time,
            )

        with zipfile.ZipFile(partial, "r") as archive:
            bad_member = archive.testzip()
            if bad_member is not None:
                raise RuntimeError(f"ZIP CRC verification failed at {bad_member}")
            names = set(archive.namelist())
            required = {
                safe_archive_path(PACKAGE_NAME, "00_先读我_交接说明.md"),
                safe_archive_path(PACKAGE_NAME, "01_给下一位Agent的接管指令.md"),
                safe_archive_path(PACKAGE_NAME, "02_交接范围与已知边界.md"),
                safe_archive_path(PACKAGE_NAME, "03_验收与复现记录.md"),
                safe_archive_path(PACKAGE_NAME, "FILE_MANIFEST.csv"),
                safe_archive_path(PACKAGE_NAME, "CHECKSUMS.sha256"),
                safe_archive_path(PACKAGE_NAME, "PACKAGE_MANIFEST.json"),
                safe_archive_path(PACKAGE_NAME, "workspace", "AGENTS.md"),
                safe_archive_path(
                    PACKAGE_NAME, "workspace", "skill", "zhengda-cup-champion", "SKILL.md"
                ),
                safe_archive_path(
                    PACKAGE_NAME,
                    "workspace",
                    "apps",
                    "evi-x-platform",
                    "data",
                    "rule-corpus.snapshot.json",
                ),
                safe_archive_path(
                    PACKAGE_NAME,
                    "workspace",
                    "apps",
                    "evi-x-platform",
                    "build",
                    "sites-vite-plugin.ts",
                ),
                safe_archive_path(
                    PACKAGE_NAME, "git-bundles", "evi-x-platform.git.bundle"
                ),
            }
            missing = sorted(required - names)
            if missing:
                raise RuntimeError(f"Required archive entries missing: {missing}")

        os.replace(partial, output)
        output_hash = sha256_file(output)
        sidecar.write_text(f"{output_hash}  {output.name}\n", encoding="utf-8")
        result = {
            "output": str(output),
            "sidecar": str(sidecar),
            "zipBytes": output.stat().st_size,
            "zipSha256": output_hash,
            "payloadFileCount": len(records),
            "payloadBytes": sum(int(record["bytes"]) for record in records),
            "referenceFileCount": len(REFERENCE_FILES),
        }
        return result
    finally:
        if partial.exists():
            partial.unlink()
        if temporary_bundle is not None and temporary_bundle.exists():
            temporary_bundle.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    script_path = Path(__file__).resolve()
    default_workspace = script_path.parent.parent
    parser.add_argument("--workspace", type=Path, default=default_workspace)
    parser.add_argument("--downloads", type=Path, default=Path.home() / "Downloads")
    parser.add_argument("--output-dir", type=Path, default=script_path.parent)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = build_package(args.workspace, args.downloads, args.output_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
