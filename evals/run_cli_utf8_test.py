#!/usr/bin/env python3
"""Verify deterministic UTF-8 CLI output without relying on Python UTF-8 mode."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "skill" / "zhengda-cup-champion" / "scripts" / "agentctl.py"


def run_cli(project: Path, *arguments: str) -> tuple[subprocess.CompletedProcess[bytes], dict[str, object]]:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "0"
    environment.pop("PYTHONIOENCODING", None)
    completed = subprocess.run(
        [sys.executable, str(CLI), str(project), *arguments],
        cwd=ROOT,
        capture_output=True,
        env=environment,
        timeout=30,
    )
    try:
        decoded = completed.stdout.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"stdout is not UTF-8: {exc}") from exc
    try:
        payload = json.loads(decoded)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"stdout is not one JSON document: {exc}") from exc
    return completed, payload


def exercise() -> dict[str, object]:
    title = '中文“循证”项目 with ASCII "quote" and 单引号\''
    with tempfile.TemporaryDirectory(prefix="zhengda-cli-utf8-") as temporary:
        project = Path(temporary) / "中文项目"
        bootstrap, bootstrap_payload = run_cli(project, "bootstrap", "--title", title)
        if bootstrap.returncode != 0:
            raise RuntimeError(f"bootstrap failed with exit {bootstrap.returncode}: {bootstrap_payload}")

        project_document = yaml.safe_load((project / "project.yaml").read_text(encoding="utf-8"))
        actual_title = project_document["project"]["title"]
        if actual_title != title:
            raise RuntimeError(f"title round-trip mismatch: {actual_title!r} != {title!r}")

        status, status_payload = run_cli(project, "status")
        if status.returncode != 0:
            raise RuntimeError(f"status failed with exit {status.returncode}: {status_payload}")
        if status_payload.get("project") != str(project.resolve()):
            raise RuntimeError("Unicode project path did not round-trip through the JSON response")

        return {
            "passed": True,
            "python_utf8_mode": 0,
            "bootstrap_exit": bootstrap.returncode,
            "status_exit": status.returncode,
            "unicode_path_round_trip": True,
            "quoted_title_round_trip": True,
        }


def main() -> int:
    try:
        result = exercise()
    except Exception as exc:  # noqa: BLE001 - emit one deterministic test result
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
