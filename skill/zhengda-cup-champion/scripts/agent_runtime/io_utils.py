"""Atomic I/O, hashing, locking, and event-stream helpers."""

from __future__ import annotations

import contextlib
import csv
import ctypes
import datetime as dt
import hashlib
import json
import os
import re
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

from .errors import ArtifactError, ConflictError, ContractError


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S")
    return f"{prefix}-{stamp}-{uuid.uuid4().hex[:8]}"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = None
    temporary: Path | None = None
    try:
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        )
        temporary = Path(handle.name)
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        handle = None
        os.replace(temporary, path)
    except OSError as exc:
        raise ArtifactError(f"Could not atomically write {path}: {exc}") from exc
    finally:
        if handle is not None:
            handle.close()
        if temporary is not None and temporary.exists():
            with contextlib.suppress(OSError):
                temporary.unlink()


def atomic_write_json(path: Path, payload: Any) -> None:
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise ContractError(f"Required JSON file is missing: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"Could not parse JSON file {path}: {exc}") from exc


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        import yaml
    except ImportError as exc:
        raise ContractError("PyYAML is required; install the dependencies declared in pyproject.toml") from exc
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise ContractError(f"project.yaml is missing: {path}") from exc
    except (OSError, yaml.YAMLError) as exc:
        raise ContractError(f"Could not parse YAML file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ContractError(f"YAML root must be an object: {path}")
    return value


def atomic_write_yaml(path: Path, payload: dict[str, Any]) -> None:
    try:
        import yaml
    except ImportError as exc:
        raise ContractError("PyYAML is required; install the dependencies declared in pyproject.toml") from exc
    text = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=1000)
    atomic_write_text(path, text)


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.is_file():
        raise ArtifactError(f"CSV file is missing: {path}")
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                reader = csv.DictReader(handle)
                return list(reader.fieldnames or []), [dict(row) for row in reader]
        except UnicodeDecodeError as exc:
            last_error = exc
    raise ArtifactError(f"Could not decode CSV {path}: {last_error}")


def atomic_write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = None
    temporary: Path | None = None
    try:
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8-sig",
            newline="",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        )
        temporary = Path(handle.name)
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})
        handle.flush()
        os.fsync(handle.fileno())
        handle.close()
        handle = None
        os.replace(temporary, path)
    except OSError as exc:
        raise ArtifactError(f"Could not atomically write CSV {path}: {exc}") from exc
    finally:
        if handle is not None:
            handle.close()
        if temporary is not None and temporary.exists():
            with contextlib.suppress(OSError):
                temporary.unlink()


def resolve_inside(project: Path, relative: str | Path) -> Path:
    raw = os.fspath(relative)
    if not raw or Path(raw).is_absolute():
        raise ArtifactError(f"Path must be non-empty and project-relative: {relative}")
    if ":" in raw or any(ord(character) < 32 for character in raw):
        raise ArtifactError(f"Path contains a forbidden ADS/URI/control character: {relative}")
    segments = [segment for segment in re.split(r"[/\\]+", raw) if segment]
    reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    for segment in segments:
        if segment in {".", ".."} or segment.endswith((" ", ".")):
            raise ArtifactError(f"Path contains an unsafe segment: {relative}")
        if segment.split(".", 1)[0].upper() in reserved:
            raise ArtifactError(f"Path uses a reserved Windows device name: {relative}")
    root = project.resolve()
    unresolved = project / raw
    _assert_no_reparse_points(project, unresolved)
    candidate = unresolved.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ArtifactError(f"Path escapes the project directory: {relative}") from exc
    return candidate


def _assert_no_reparse_points(project: Path, candidate: Path) -> None:
    """Reject symlink/junction traversal for every existing path component."""
    if project.exists():
        project_stat = project.lstat()
        if project.is_symlink() or getattr(project_stat, "st_file_attributes", 0) & 0x400:
            raise ArtifactError(f"Project root cannot be a symlink or junction: {project}")
    root = project.resolve()
    try:
        relative = candidate.absolute().relative_to(project.absolute())
    except ValueError as exc:
        raise ArtifactError(f"Path escapes the project directory: {candidate}") from exc
    current = root
    paths = [root]
    for part in relative.parts:
        current = current / part
        paths.append(current)
    for path in paths:
        if not path.exists():
            continue
        try:
            stat_result = path.lstat()
        except OSError as exc:
            raise ArtifactError(f"Could not inspect path safety for {path}: {exc}") from exc
        attributes = getattr(stat_result, "st_file_attributes", 0)
        if path.is_symlink() or attributes & 0x400:
            raise ArtifactError(f"Symlink or junction traversal is forbidden: {path}")


def relative_posix(project: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(project.resolve()).as_posix()
    except ValueError as exc:
        raise ArtifactError(f"Path is outside the project directory: {path}") from exc


def fingerprint_paths(project: Path, relative_paths: list[str]) -> tuple[str, list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    for relative in sorted(set(relative_paths)):
        path = resolve_inside(project, relative)
        if path.is_file():
            records.append({"path": relative_posix(project, path), "sha256": sha256_file(path), "size_bytes": path.stat().st_size})
        elif path.is_dir():
            children = sorted(item for item in path.rglob("*") if item.is_file() and ".agent" not in item.parts)
            if not children:
                records.append({"path": relative_posix(project, path), "sha256": canonical_hash([]), "size_bytes": 0})
            for child in children:
                records.append({"path": relative_posix(project, child), "sha256": sha256_file(child), "size_bytes": child.stat().st_size})
        else:
            raise ArtifactError(f"Evidence path does not exist: {relative}")
    return canonical_hash(records), records


@contextlib.contextmanager
def project_lock(project: Path, *, command: str) -> Iterator[None]:
    if os.name == "nt":
        with _windows_project_lock(project, command=command):
            yield
        return

    agent_dir = resolve_inside(project, ".agent")
    agent_dir.mkdir(parents=True, exist_ok=True)
    lock_path = agent_dir / "lock"
    descriptor: int | None = None
    existing = "unreadable lock"
    for attempt in range(2):
        try:
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError as exc:
            try:
                existing = lock_path.read_text(encoding="utf-8")
                metadata = json.loads(existing)
            except (OSError, json.JSONDecodeError):
                metadata = None
            corrupt_is_stale = metadata is None and _lock_age_seconds(lock_path) >= 30
            if attempt == 0 and (
                (isinstance(metadata, dict) and _archive_dead_lock(agent_dir, lock_path, metadata))
                or (corrupt_is_stale and _archive_corrupt_lock(agent_dir, lock_path))
            ):
                continue
            raise ConflictError("Another writer holds the project lock", details={"lock": existing}) from exc
    if descriptor is None:
        raise ConflictError("Could not acquire the project lock")
    token = {"pid": os.getpid(), "command": command, "created_at": utc_now(), "token": uuid.uuid4().hex}
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(token, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        yield
    finally:
        _release_owned_lock(lock_path, token["token"])


@contextlib.contextmanager
def _windows_project_lock(project: Path, *, command: str) -> Iterator[None]:
    """Use a kernel mutex on Windows so crashed writers cannot leave a permanent lock."""
    agent_dir = resolve_inside(project, ".agent")
    agent_dir.mkdir(parents=True, exist_ok=True)
    lock_path = agent_dir / "lock"
    mutex_name = "Local\\ZhengdaCupAgent-" + sha256_bytes(str(project.resolve()).casefold().encode("utf-8"))[:40]
    kernel32 = ctypes.windll.kernel32
    kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel32.WaitForSingleObject.restype = ctypes.c_uint32
    kernel32.ReleaseMutex.argtypes = [ctypes.c_void_p]
    kernel32.ReleaseMutex.restype = ctypes.c_bool
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_bool
    handle = kernel32.CreateMutexW(None, False, mutex_name)
    if not handle:
        raise ConflictError("Could not create the Windows project mutex", details={"winerror": ctypes.get_last_error()})
    acquired = False
    token = {"pid": os.getpid(), "command": command, "created_at": utc_now(), "token": uuid.uuid4().hex, "mutex": mutex_name}
    try:
        wait_result = kernel32.WaitForSingleObject(handle, 0)
        if wait_result not in {0x00000000, 0x00000080}:  # WAIT_OBJECT_0 or WAIT_ABANDONED
            if wait_result == 0x00000102:  # WAIT_TIMEOUT
                raise ConflictError("Another writer holds the project lock", details={"mutex": mutex_name})
            raise ConflictError("Could not acquire the Windows project mutex", details={"wait_result": int(wait_result)})
        acquired = True
        if lock_path.exists():
            existing_text = ""
            existing_metadata: dict[str, Any] | None = None
            try:
                existing_text = lock_path.read_text(encoding="utf-8")
                parsed = json.loads(existing_text)
                existing_metadata = parsed if isinstance(parsed, dict) else None
            except (OSError, json.JSONDecodeError):
                existing_metadata = None
            if existing_metadata is not None:
                try:
                    existing_pid = int(existing_metadata.get("pid", -1))
                except (TypeError, ValueError):
                    existing_pid = -1
                if _pid_is_running(existing_pid):
                    raise ConflictError("A live legacy writer holds the project lock", details={"lock": existing_text})
                _archive_dead_lock(agent_dir, lock_path, existing_metadata)
            elif _lock_age_seconds(lock_path) >= 30:
                _archive_corrupt_lock(agent_dir, lock_path)
            else:
                raise ConflictError("A recent unreadable legacy lock exists", details={"lock": existing_text})
        atomic_write_json(lock_path, token)
        yield
    finally:
        if acquired:
            _release_owned_lock(lock_path, token["token"])
            kernel32.ReleaseMutex(handle)
        kernel32.CloseHandle(handle)


def _lock_age_seconds(lock_path: Path) -> float:
    try:
        return max(0.0, time.time() - lock_path.stat().st_mtime)
    except OSError:
        return 0.0


def _release_owned_lock(lock_path: Path, token: str) -> None:
    try:
        metadata = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if isinstance(metadata, dict) and metadata.get("token") == token:
        with contextlib.suppress(OSError):
            lock_path.unlink()


def _pid_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if pid == os.getpid():
        return True
    if os.name == "nt":
        process_query_limited_information = 0x1000
        still_active = 259
        handle = ctypes.windll.kernel32.OpenProcess(process_query_limited_information, False, pid)
        if not handle:
            return False
        exit_code = ctypes.c_ulong()
        try:
            if not ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return False
            return exit_code.value == still_active
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _archive_dead_lock(agent_dir: Path, lock_path: Path, metadata: dict[str, Any]) -> bool:
    try:
        pid = int(metadata.get("pid", -1))
    except (TypeError, ValueError):
        return False
    if _pid_is_running(pid):
        return False
    archive_dir = agent_dir / "stale-locks"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive = archive_dir / f"{new_id('stale-lock')}.json"
    try:
        os.replace(lock_path, archive)
    except OSError:
        return False
    return True


def _archive_corrupt_lock(agent_dir: Path, lock_path: Path) -> bool:
    archive_dir = agent_dir / "stale-locks"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive = archive_dir / f"{new_id('corrupt-lock')}.bin"
    try:
        os.replace(lock_path, archive)
    except OSError:
        return False
    return True


def scan_event_stream(path: Path) -> dict[str, Any]:
    """Validate an event hash chain and return its authoritative cursor."""
    if not path.is_file():
        return {"last_sequence": 0, "last_event_id": None, "stream_sha256": None, "events": []}
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError as exc:
        raise ArtifactError(f"Could not read event stream: {exc}") from exc
    events: list[dict[str, Any]] = []
    previous_hash: str | None = None
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ConflictError(f"Event stream line {line_number} is invalid JSON") from exc
        expected_sequence = len(events) + 1
        if event.get("sequence") != expected_sequence:
            raise ConflictError(f"Event stream sequence mismatch at line {line_number}")
        if event.get("previous_event_hash") != previous_hash:
            raise ConflictError(f"Event hash-chain predecessor mismatch at line {line_number}")
        expected_hash = event.get("event_hash")
        unhashed = dict(event)
        unhashed.pop("event_hash", None)
        if expected_hash != canonical_hash(unhashed):
            raise ConflictError(f"Event hash mismatch at line {line_number}")
        events.append(event)
        previous_hash = expected_hash
    return {
        "last_sequence": len(events),
        "last_event_id": events[-1]["event_id"] if events else None,
        "stream_sha256": previous_hash,
        "events": events,
    }


def reconcile_event_cursor(project: Path, state: dict[str, Any]) -> bool:
    """Advance a lagging state cursor after a crash, never truncate or rewrite events."""
    cursor = state["event_stream"]
    actual = scan_event_stream(resolve_inside(project, cursor["path"]))
    expected_sequence = int(cursor.get("last_sequence", 0))
    if actual["last_sequence"] < expected_sequence:
        raise ConflictError("Event stream is shorter than the committed state cursor")
    if expected_sequence:
        committed_event = actual["events"][expected_sequence - 1]
        if committed_event.get("event_id") != cursor.get("last_event_id") or committed_event.get("event_hash") != cursor.get("stream_sha256"):
            raise ConflictError("Event stream prefix does not match the committed state cursor")
    elif cursor.get("last_event_id") is not None or cursor.get("stream_sha256") is not None:
        raise ConflictError("Zero event cursor contains non-empty identifiers")
    changed = actual["last_sequence"] > expected_sequence
    if changed:
        cursor.update({
            "last_sequence": actual["last_sequence"],
            "last_event_id": actual["last_event_id"],
            "stream_sha256": actual["stream_sha256"],
        })
    return changed


def append_event(
    project: Path,
    state: dict[str, Any],
    event_type: str,
    *,
    run_id: str,
    payload: dict[str, Any] | None = None,
    severity: str = "info",
    checkpoint_id: str | None = None,
    node_id: str | None = None,
) -> dict[str, Any]:
    cursor = state["event_stream"]
    events_path = resolve_inside(project, cursor["path"])
    actual_cursor = scan_event_stream(events_path)
    for key in ("last_sequence", "last_event_id", "stream_sha256"):
        if actual_cursor[key] != cursor.get(key):
            raise ConflictError(
                "Event stream is ahead of or inconsistent with state; run resume",
                details={"field": key, "state": cursor.get(key), "stream": actual_cursor[key]},
            )
    sequence = int(cursor.get("last_sequence", 0)) + 1
    event: dict[str, Any] = {
        "event_id": new_id("evt"),
        "run_id": run_id,
        "sequence": sequence,
        "timestamp": utc_now(),
        "type": event_type,
        "project_id": state["project_id"],
        "workflow_version": state["workflow"]["version"],
        "control_status": state["status"],
        "node_id": node_id or state.get("active_node") or state.get("status"),
        "attempt": int((state.get("run") or {}).get("attempt", 1)),
        "severity": severity,
        "checkpoint_id": checkpoint_id,
        "causation_id": cursor.get("last_event_id") or run_id,
        "correlation_id": run_id,
        "input_fingerprint": (state.get("run") or {}).get("input_fingerprint") or canonical_hash(payload or {}),
        "previous_event_hash": cursor.get("stream_sha256"),
        "payload": payload or {},
    }
    event["event_hash"] = canonical_hash(event)
    events_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with events_path.open("a", encoding="utf-8", newline="") as handle:
            handle.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as exc:
        raise ArtifactError(f"Could not append event stream: {exc}") from exc
    cursor["last_sequence"] = sequence
    cursor["last_event_id"] = event["event_id"]
    cursor["stream_sha256"] = event["event_hash"]
    return event
