#!/usr/bin/env python3
"""Check tracked application entry points; not an architecture/dependency audit.

Uses git ls-files and selected active configuration only. Historical documents,
frontend/legacy and ignored local archives are deliberately not text-scanned.
No third-party dependency, mutation, network access or recursive disk walk.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
from typing import Callable, Iterable, NamedTuple

OLD_APPS = {"evi-x-platform", "evi-x-api"}
WORKSPACES = {"apps/frontend", "packages/evi-x-shared"}
REQUIRED = {
    "package.json", "package-lock.json", "packages/evi-x-shared/package.json",
    "apps/frontend/package.json", "apps/frontend/next.config.ts",
    "apps/frontend/app/layout.tsx", "apps/frontend/app/page.tsx",
    "apps/backend/pyproject.toml", "apps/backend/uv.lock",
    "apps/backend/src/evix_api/app.py", ".github/workflows/ci.yml",
}
OLD_REFERENCE = re.compile(
    r"(?<![\w.-])(?:apps/+|(?:\.\.?/)+)evi-x-(?:platform|api)(?=$|[^\w.-])",
    re.IGNORECASE,
)
SCRIPT_SUFFIXES = {".py", ".ps1", ".sh", ".mjs", ".js", ".cjs", ".cmd", ".bat"}


class Finding(NamedTuple):
    code: str
    path: str
    detail: str


def normalize_path(value: str) -> str:
    value = value.replace("\\", "/")
    parts = value.split("/")
    if not value or value.startswith("/") or re.match(r"^[A-Za-z]:", value):
        raise ValueError("Expected a repository-relative file path")
    if any(part in {"", ".", ".."} for part in parts) or any(ord(c) < 32 for c in value):
        raise ValueError("Non-canonical or control-character path")
    return value


def validate_paths(paths: Iterable[str]) -> list[Finding]:
    """Pure list check, including Windows separators; no filesystem effects."""
    findings = []
    for raw in paths:
        try:
            name = normalize_path(raw)
        except ValueError as error:
            findings.append(Finding("invalid_path", raw, str(error)))
            continue
        parts = PurePosixPath(name).parts
        if len(parts) < 3 or parts[0].lower() != "apps" or parts[1].lower() not in OLD_APPS:
            continue
        # Retired README/notes are legitimate history, not a second runtime.
        # requirements.txt is intentionally NOT covered by this exception.
        historical = PurePosixPath(name).suffix.lower() in {".md", ".rst"}
        historical |= parts[2] in {"docs", "legacy", "archive", "history"}
        if not historical:
            findings.append(Finding("retired_app_runtime", name, "Retired application runtime must not be tracked"))
    return findings


def active_config(path: str) -> bool:
    p = PurePosixPath(path)
    if path in {"apps/frontend/next.config.ts", "apps/frontend/tsconfig.json", "apps/backend/pyproject.toml"}:
        return True
    if path.startswith(".github/workflows/") and p.suffix in {".yml", ".yaml"}:
        return True
    if path.startswith("deploy/") and (p.suffix in {".yml", ".yaml", ".json", ".toml"} or p.name.startswith("Dockerfile")):
        return True
    if p.parent.as_posix() == "." and p.suffix in {".yml", ".yaml"} and p.name.startswith(("compose", "docker-compose")):
        return True
    if p.parent.as_posix() == "scripts" and p.suffix in SCRIPT_SUFFIXES:
        return p.name.startswith(("start-", "deploy-")) or p.name in {"p0-env.ps1", "migrate-p0.ps1"}
    if path.startswith(("apps/frontend/scripts/", "apps/backend/scripts/")) and p.suffix in SCRIPT_SUFFIXES:
        return p.name.startswith(("start-", "deploy-", "check-hosted-build"))
    return p.name.startswith("Dockerfile") and p.parent.as_posix() in {".", "apps/frontend", "apps/backend"}


def without_comments(text: str, javascript: bool) -> str:
    """Preserve literal values but ignore # or JS // /* */ comments."""
    result, index, quote = [], 0, None
    while index < len(text):
        c = text[index]
        if quote:
            result.append(c)
            if c == "\\" and index + 1 < len(text):
                index += 1
                result.append(text[index])
            elif c == quote:
                quote = None
            index += 1
            continue
        if c in "\"'`":
            quote = c
        elif (javascript and text.startswith("//", index)) or (not javascript and c == "#"):
            end = text.find("\n", index)
            index = len(text) if end == -1 else end
            continue
        elif javascript and text.startswith("/*", index):
            end = text.find("*/", index + 2)
            chunk = text[index:] if end == -1 else text[index:end + 2]
            result.extend("\n" if char == "\n" else " " for char in chunk)
            index += len(chunk)
            continue
        result.append(c)
        index += 1
    return "".join(result)


def old_reference(value: str) -> bool:
    # Also covers doubled backslashes inside JSON/PowerShell quoted paths.
    return OLD_REFERENCE.search(re.sub(r"\\+", "/", value)) is not None


def delegates(command: object, script: str, frontend_name: str) -> bool:
    if not isinstance(command, str):
        return False
    try:
        tokens = shlex.split(command)
    except ValueError:
        return False
    if not tokens or tokens[0] not in {"npm", "npm.cmd"}:
        return False
    workspace = None
    core = []
    i = 1
    while i < len(tokens):
        token = tokens[i]
        if token in {"--workspace", "-w"} and i + 1 < len(tokens):
            if workspace is not None:
                return False
            i += 1
            workspace = tokens[i]
        elif token.startswith("--workspace="):
            if workspace is not None:
                return False
            workspace = token.split("=", 1)[1]
        else:
            core.append(token)
        i += 1
    return core == ["run", script] and workspace in {frontend_name, "apps/frontend"}


def check_snapshot(paths: Iterable[str], read_text: Callable[[str], str]) -> list[Finding]:
    paths = list(paths)
    findings = validate_paths(paths)
    names = set()
    for item in paths:
        try:
            names.add(normalize_path(item))
        except ValueError:
            pass
    findings.extend(Finding("missing_entry", name, "Required tracked entry is missing") for name in sorted(REQUIRED - names))

    def document(name: str) -> dict:
        if name not in names:
            return {}
        try:
            value = json.loads(read_text(name))
            if not isinstance(value, dict):
                raise ValueError("Expected JSON object")
            return value
        except (OSError, UnicodeError, ValueError) as error:
            findings.append(Finding("invalid_config", name, str(error)))
            return {}

    root = document("package.json")
    frontend = document("apps/frontend/package.json")
    frontend_name = frontend.get("name")
    if not isinstance(frontend_name, str) or not frontend_name:
        findings.append(Finding("invalid_config", "apps/frontend/package.json", "Expected nonempty frontend package name"))
        frontend_name = ""
    workspaces = root.get("workspaces")
    if not isinstance(workspaces, list) or len(workspaces) != 2 or set(str(x) for x in workspaces) != WORKSPACES:
        findings.append(Finding("workspace_contract", "package.json", "Expected exactly apps/frontend and packages/evi-x-shared"))
    for owner, package in [("package.json", root), ("apps/frontend/package.json", frontend)]:
        scripts = package.get("scripts", {})
        if not isinstance(scripts, dict):
            findings.append(Finding("invalid_config", owner, "scripts must be an object"))
            continue
        for name, command in scripts.items():
            if not isinstance(command, str) or old_reference(command):
                findings.append(Finding("active_script_path", owner, "Invalid or retired application path in script " + str(name)))
        for section in ["dependencies", "devDependencies", "optionalDependencies"]:
            dependencies = package.get(section, {})
            if isinstance(dependencies, dict):
                for name, value in dependencies.items():
                    if isinstance(value, str) and value.startswith(("file:", "link:")) and old_reference(value):
                        findings.append(Finding("local_dependency_path", owner, "Retired local dependency " + name))
    scripts = root.get("scripts", {})
    local_scripts = frontend.get("scripts", {})
    for alias, target in [("dev:web", "dev"), ("build:web", "build"), ("typecheck:web", "typecheck")]:
        valid = isinstance(scripts, dict) and delegates(scripts.get(alias), target, frontend_name)
        valid &= isinstance(local_scripts, dict) and target in local_scripts
        if not valid:
            findings.append(Finding("web_delegate", "package.json", alias + " must delegate to the current frontend workspace"))

    lock = document("package-lock.json")
    packages = lock.get("packages", {})
    if not isinstance(packages, dict):
        findings.append(Finding("lock_contract", "package-lock.json", "Expected npm packages map"))
    else:
        for name in WORKSPACES:
            if name not in packages:
                findings.append(Finding("lock_contract", "package-lock.json", "Missing local workspace " + name))
        locked_root = packages.get("", {})
        if not isinstance(locked_root, dict) or locked_root.get("workspaces") != workspaces:
            findings.append(Finding("lock_contract", "package-lock.json", "Root workspaces differ from package.json"))
        for name, package in packages.items():
            resolved = package.get("resolved", "") if isinstance(package, dict) else ""
            local = isinstance(package, dict) and (package.get("link") is True or str(resolved).startswith(("file:", "link:")))
            if old_reference(name) or (local and old_reference(str(resolved))):
                findings.append(Finding("lock_retired_path", "package-lock.json", "Retired local workspace: " + name))

    for name in sorted(names):
        if not active_config(name):
            continue
        try:
            raw = read_text(name)
        except (OSError, UnicodeError) as error:
            findings.append(Finding("unreadable_config", name, str(error)))
            continue
        javascript = PurePosixPath(name).suffix in {".js", ".mjs", ".cjs", ".ts", ".json"}
        clean = without_comments(raw, javascript)
        for number, line in enumerate(clean.splitlines(), 1):
            if old_reference(line):
                findings.append(Finding("active_config_path", name, "Retired path on line " + str(number)))
        if name.startswith(".github/workflows/"):
            for match in re.finditer(r"(?m)^\s*working-directory:\s*([^\n]+)", clean):
                directory = match.group(1).strip().strip("\"'").replace("\\", "/")
                if directory == "." or "${{" in directory:
                    continue  # Dynamic expressions require the existing CI review.
                directory = directory.removeprefix("./").rstrip("/")
                if not directory or not any(path.startswith(directory + "/") for path in names):
                    findings.append(Finding("ci_directory", name, "No tracked directory " + directory))
    return sorted(set(findings))


def check_repository(root: Path) -> tuple[int, list[Finding]]:
    root = root.resolve(strict=True)
    result = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    paths = result.stdout.decode("utf-8").rstrip("\0").split("\0") if result.stdout else []

    def read(name: str) -> str:
        target = root.joinpath(*PurePosixPath(name).parts)
        if target.is_symlink() or not target.resolve().is_relative_to(root):
            raise OSError("Active config must remain inside the checkout")
        return target.read_text(encoding="utf-8-sig")

    return len(paths), check_snapshot(paths, read)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    try:
        count, findings = check_repository(args.root)
    except (OSError, UnicodeError, subprocess.SubprocessError) as error:
        print(json.dumps({"status": "error", "error": str(error)}))
        return 2
    print(json.dumps({"status": "fail" if findings else "pass", "tracked_files": count, "findings": [item._asdict() for item in findings], "scope": "tracked runtime roots, workspace delegates, local lock paths and selected active configs; not dependency architecture or CI expression execution"}, ensure_ascii=False, indent=2))
    return int(bool(findings))


if __name__ == "__main__":
    raise SystemExit(main())
