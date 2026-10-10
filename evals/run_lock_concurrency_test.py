#!/usr/bin/env python3
"""Exercise live-writer exclusion and crashed-writer recovery on Windows."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "skill" / "zhengda-cup-champion" / "scripts"
CLI = RUNTIME / "agentctl.py"
sys.path.insert(0, str(RUNTIME))

from agent_runtime.io_utils import project_lock  # noqa: E402


def hold_lock(project: Path, *, crash: bool) -> int:
    with project_lock(project, command="concurrency-test-holder"):
        if crash:
            os._exit(17)
        time.sleep(2.0)
    return 0


def run_cli(project: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-X", "utf8", str(CLI), str(project), *arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
    )


def wait_for_lock(project: Path, process: subprocess.Popen[str]) -> None:
    lock = project / ".agent" / "lock"
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if lock.is_file():
            return
        if process.poll() is not None:
            raise RuntimeError(f"lock holder exited before acquiring the lock: {process.returncode}")
        time.sleep(0.05)
    raise RuntimeError("lock holder did not acquire the lock within five seconds")


def exercise() -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="zhengda-lock-eval-") as temporary:
        project = Path(temporary) / "project"
        project.mkdir()
        bootstrap = run_cli(project, "bootstrap", "--title", "Windows lock regression")
        if bootstrap.returncode != 0:
            raise RuntimeError(f"bootstrap failed: {bootstrap.stdout[-2000:]}")

        holder = subprocess.Popen(
            [sys.executable, "-X", "utf8", str(Path(__file__).resolve()), "--hold", str(project)],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        wait_for_lock(project, holder)
        contender = run_cli(project, "checkpoint", "--label", "live-contender")
        holder_stderr = holder.communicate(timeout=10)[1]
        if holder.returncode != 0:
            raise RuntimeError(f"live holder failed: {holder_stderr[-2000:]}")
        if contender.returncode != 5:
            raise RuntimeError(f"live contender exit={contender.returncode}, expected 5: {contender.stdout[-2000:]}")

        crashed = subprocess.Popen(
            [sys.executable, "-X", "utf8", str(Path(__file__).resolve()), "--hold", str(project), "--crash"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        wait_for_lock(project, crashed)
        crashed.communicate(timeout=10)
        if crashed.returncode != 17:
            raise RuntimeError(f"crash holder exit={crashed.returncode}, expected 17")
        recovered = run_cli(project, "checkpoint", "--label", "after-crash")
        if recovered.returncode != 0:
            raise RuntimeError(f"crashed writer was not recoverable: {recovered.stdout[-2000:]}")
        doctor = run_cli(project, "doctor")
        if doctor.returncode != 0:
            raise RuntimeError(f"doctor failed after recovery: {doctor.stdout[-2000:]}")
        archived = list((project / ".agent" / "stale-locks").glob("*.json"))
        if not archived:
            raise RuntimeError("crashed writer lock was not archived for audit")
        return {
            "passed": True,
            "live_contender_exit": contender.returncode,
            "crash_holder_exit": crashed.returncode,
            "recovery_exit": recovered.returncode,
            "doctor_exit": doctor.returncode,
            "archived_stale_locks": len(archived),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hold", type=Path)
    parser.add_argument("--crash", action="store_true")
    args = parser.parse_args()
    if args.hold is not None:
        return hold_lock(args.hold.resolve(), crash=args.crash)
    try:
        result = exercise()
    except Exception as exc:  # noqa: BLE001 - emit one deterministic test result
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
