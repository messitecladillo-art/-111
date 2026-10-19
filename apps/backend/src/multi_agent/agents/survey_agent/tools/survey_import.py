"""Bounded SAV decoding in a disposable process, without HTTP or project writes.

Only pyreadstat's raw values are returned. User-defined missing codes remain data;
date/time formats remain numeric SPSS encodings. The caller owns authorization,
upload consent, mapping, and any later persistence.
"""
from __future__ import annotations

import asyncio
import ctypes
import hashlib
import json
import math
import numbers
import os
import re
import shutil
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Callable

if not __package__:
    # Isolated worker: add only the trusted source root, never the upload directory.
    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from infrastructure import scratch as scratch_runtime
from infrastructure.scratch import (
    private_directory as _private_directory, is_link as _is_link,
    pid_alive as _pid_alive, write_record as _write_record,
    write_lease as _write_lease, emit as _emit, CLEANUP_RETRY_DELAYS,
)

PARSER_VERSION = "pyreadstat/1.3.6"
MAX_BYTES = 2_000_000
MAX_ROWS = 5000
MAX_COLUMNS = 80
MAX_CELLS = 200_000
MAX_TEXT_UNITS = 2000
MAX_SAFE_NUMBER = 9_007_199_254_740_991
MAX_RESULT_BYTES = 12 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 60
INCOMPLETE_LEASE_GRACE_SECONDS = MAX_TIMEOUT_SECONDS + 120

REGISTRATION_TIMEOUT_SECONDS = 2
JOB_PREFIX = "sav-"
JOB_NAME = re.compile(r"^sav-([a-f0-9]{32})$")
MESSAGES = {
    "sav_empty": "请选择包含数据的 SAV 文件。",
    "sav_too_large": "SAV 文件超过 2 MB，请先在原软件中筛选或拆分后导入。",
    "sav_invalid": "无法读取该 SAV 文件，请在 SPSS 中重新保存为 SAV 后重试。",
    "sav_limits": "数据超过 5000 行、80 列或 200000 个单元格，请先筛选或拆分。",
    "sav_text_limit": "存在超过 2000 个字符的文本，请先精简或移除长文本变量。",
    "sav_number_unsafe": "存在非有限值或超出 JavaScript 安全范围的数值，请在原软件中核对后重试。",
    "sav_metadata_invalid": "变量元数据无法完整保留，请在原软件中核对变量定义后重试。",
    "sav_result_too_large": "展开后的数据超过处理上限，请减少变量或长文本后重试。",
    "sav_dependency": "SAV 解析服务尚未准备完成，请联系管理员配置解析依赖。",
    "sav_timeout": "SAV 读取超时，请减少文件规模后重试。",
    "sav_cancelled": "SAV 读取已取消，可以重新选择文件。",
    "sav_worker_failed": "SAV 解析进程未完成，请稍后重试或重新保存文件。",
    "sav_temp_unavailable": "临时处理空间不可用，请联系管理员检查权限与空间。",
    "sav_cleanup_failed": "临时文件未能清理，请联系管理员检查处理空间。",
}


class SurveyImportError(Exception):
    """A stable, public error. Native parser errors never leave the worker."""

    def __init__(self, code: str):
        self.code = code if code in MESSAGES else "sav_worker_failed"
        self.message = MESSAGES[self.code]
        super().__init__(self.message)


def _text(value: Any, *, nullable: bool = False) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        raise SurveyImportError("sav_metadata_invalid")
    try:
        units = len(value.encode("utf-16-le")) // 2
    except UnicodeError:
        raise SurveyImportError("sav_metadata_invalid") from None
    if units > MAX_TEXT_UNITS:
        raise SurveyImportError("sav_text_limit")
    return value


def _scalar(value: Any, *, system_missing: bool = False) -> str | int | float | None:
    # numpy scalar objects expose item(); arrays and arbitrary objects are rejected.
    if hasattr(value, "item") and type(value).__module__.startswith("numpy"):
        value = value.item()
    if value is None:
        if system_missing:
            return None
        raise SurveyImportError("sav_metadata_invalid")
    if isinstance(value, str):
        return _text(value)
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        raise SurveyImportError("sav_metadata_invalid")
    try:
        number = float(value)
    except (OverflowError, ValueError):
        raise SurveyImportError("sav_number_unsafe") from None
    if math.isnan(number) and system_missing:
        # With user_missing=True, pyreadstat reserves NaN for system missing.
        return None
    if not math.isfinite(number) or abs(number) > MAX_SAFE_NUMBER:
        raise SurveyImportError("sav_number_unsafe")
    return int(value) if isinstance(value, numbers.Integral) else number


def _date_encoding(original_format: str | None) -> dict[str, Any] | None:
    base = re.match(r"^[A-Z]+", (original_format or "").upper())
    name = base.group(0) if base else ""
    # Only claim encodings defined by the pinned pyreadstat parser. Other
    # display formats remain available verbatim in originalFormat.
    if name in {"DATE", "ADATE", "EDATE", "JDATE", "SDATE", "DATETIME", "YMDHMS"}:
        return {"kind": "date-time", "unit": "seconds",
                "epoch": "1582-10-14T00:00:00", "timezone": None}
    if name in {"TIME", "DTIME"}:
        return {"kind": "duration", "unit": "seconds", "epoch": None, "timezone": None}
    return None


def _shape(rows: Any, columns: Any) -> None:
    if (isinstance(rows, bool) or isinstance(columns, bool)
            or not isinstance(rows, numbers.Integral)
            or not isinstance(columns, numbers.Integral)
            or rows < 1 or columns < 1
            or rows > MAX_ROWS or columns > MAX_COLUMNS
            or rows * columns > MAX_CELLS):
        raise SurveyImportError("sav_limits")


def _column_metadata(meta: Any, names: list[str]) -> list[dict[str, Any]]:
    result = []
    value_labels = getattr(meta, "variable_value_labels", {}) or {}
    missing = getattr(meta, "missing_ranges", {}) or {}
    labels = getattr(meta, "column_names_to_labels", {}) or {}
    formats = getattr(meta, "original_variable_types", {}) or {}
    types = getattr(meta, "readstat_variable_types", {}) or {}
    measures = getattr(meta, "variable_measure", {}) or {}
    alignment = getattr(meta, "variable_alignment", {}) or {}
    for name in names:
        original = _text(formats.get(name), nullable=True)
        ranges, discrete = [], []
        for item in missing.get(name, []):
            if not isinstance(item, dict) or set(item) != {"lo", "hi"}:
                raise SurveyImportError("sav_metadata_invalid")
            lo, hi = _scalar(item["lo"]), _scalar(item["hi"])
            if type(lo) is not type(hi) and not (
                    isinstance(lo, numbers.Real) and isinstance(hi, numbers.Real)):
                raise SurveyImportError("sav_metadata_invalid")
            if lo == hi:
                discrete.append(lo)
            elif isinstance(lo, numbers.Real) and isinstance(hi, numbers.Real) and lo < hi:
                ranges.append({"lo": lo, "hi": hi})
            else:
                raise SurveyImportError("sav_metadata_invalid")
        entries = [{"value": _scalar(value), "label": _text(label)}
                   for value, label in value_labels.get(name, {}).items()]
        measure = measures.get(name, "unknown")
        if measure not in {"nominal", "ordinal", "scale", "unknown"}:
            raise SurveyImportError("sav_metadata_invalid")
        result.append({
            "name": _text(name), "label": _text(labels.get(name), nullable=True),
            "measurement": measure, "originalFormat": original,
            "storageType": _text(types.get(name), nullable=True),
            "alignment": _text(alignment.get(name), nullable=True),
            "valueLabels": entries, "userMissingValues": discrete,
            "userMissingRanges": ranges, "dateEncoding": _date_encoding(original),
            "systemMissingCount": 0,
        })
    return result


def _parse_file(path: Path) -> dict[str, Any]:
    try:
        import pyreadstat
    except ImportError:
        raise SurveyImportError("sav_dependency") from None
    if pyreadstat.__version__ != "1.3.6":
        raise SurveyImportError("sav_dependency")
    size = path.stat().st_size
    if not 0 < size <= MAX_BYTES:
        raise SurveyImportError("sav_empty" if size == 0 else "sav_too_large")
    # The dictionary is checked before data is expanded; read at most one row
    # beyond the limit when a file does not declare a trustworthy row count.
    _, meta = pyreadstat.read_sav(
        str(path), metadataonly=True, user_missing=True,
        apply_value_formats=False, disable_datetime_conversion=True, output_format="dict",
    )
    names = list(meta.column_names)
    if not names or len(names) > MAX_COLUMNS or len(set(names)) != len(names):
        raise SurveyImportError("sav_limits")
    for name in names:
        _text(name)
    if meta.number_rows is not None:
        _shape(meta.number_rows, len(names))
    columns = _column_metadata(meta, names)
    read_limit = min(MAX_ROWS, MAX_CELLS // len(names)) + 1
    data, actual_meta = pyreadstat.read_sav(
        str(path), user_missing=True, apply_value_formats=False,
        disable_datetime_conversion=True, row_limit=read_limit, output_format="dict",
    )
    if list(data) != names or list(actual_meta.column_names) != names:
        raise SurveyImportError("sav_metadata_invalid")
    row_count = len(data[names[0]])
    _shape(row_count, len(names))
    if any(len(data[name]) != row_count for name in names):
        raise SurveyImportError("sav_invalid")
    if meta.number_rows is not None and meta.number_rows != row_count:
        raise SurveyImportError("sav_invalid")
    rows = []
    estimated_bytes = 0
    for index in range(row_count):
        row = []
        for column_index, name in enumerate(names):
            value = _scalar(data[name][index], system_missing=True)
            if value is None:
                columns[column_index]["systemMissingCount"] += 1
            row.append(value)
            estimated_bytes += (len(value.encode("utf-8")) + 8
                                if isinstance(value, str) else 24)
        if estimated_bytes > MAX_RESULT_BYTES:
            raise SurveyImportError("sav_result_too_large")
        rows.append(row)
    return {
        "schema": "survey-import/sav-v1", "format": "sav", "parser": PARSER_VERSION,
        "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": size,
        "rowCount": row_count, "columnCount": len(names),
        "fileEncoding": _text(getattr(meta, "file_encoding", None), nullable=True),
        "columns": columns, "rows": rows,
    }








def _remove_job(root: Path, job: Path) -> None:
    if _is_link(job) or job.parent.resolve(strict=True) != root or not JOB_NAME.fullmatch(job.name):
        raise SurveyImportError("sav_cleanup_failed")
    if not job.exists():
        return
    resolved = job.resolve(strict=True)
    if resolved.parent != root:
        raise SurveyImportError("sav_cleanup_failed")
    for attempt in range(len(CLEANUP_RETRY_DELAYS) + 1):
        # Recheck every attempt: retries never widen the deletion boundary.
        if _is_link(job) or job.parent.resolve(strict=True) != root:
            raise SurveyImportError("sav_cleanup_failed")
        try:
            shutil.rmtree(resolved)
            return
        except FileNotFoundError:
            if not job.exists():
                return
            raise SurveyImportError("sav_cleanup_failed") from None
        except OSError as error:
            transient = os.name == "nt" and getattr(error, "winerror", None) in {32, 33}
            if not transient or attempt == len(CLEANUP_RETRY_DELAYS):
                raise SurveyImportError("sav_cleanup_failed") from None
            time.sleep(CLEANUP_RETRY_DELAYS[attempt])








async def _finish_job(
    root: Path, job: Path, process: asyncio.subprocess.Process | None,
    spawning: asyncio.Task | None, waiting: asyncio.Task | None,
    cancellation: asyncio.Task | None,
) -> None:
    # Shield the whole lifecycle in the caller, including process creation.
    if process is None and spawning is not None:
        try:
            process = await spawning
        except (OSError, ValueError):
            process = None
    if process is not None and process.returncode is None:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        await process.wait()
    for task in (waiting, cancellation):
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    if job.exists():
        _remove_job(root, job)


def _registered_worker(job: Path, identifier: str) -> int | None:
    registration = job / "worker.json"
    if not registration.exists():
        return None
    if _is_link(registration) or registration.stat().st_size > 2048:
        raise SurveyImportError("sav_cleanup_failed")
    entry = json.loads(registration.read_text(encoding="utf-8"))
    pid = entry.get("pid")
    if (entry.get("schema") != "sav-import-worker/v1" or entry.get("id") != identifier
            or isinstance(pid, bool) or not isinstance(pid, int) or not 0 < pid < 2 ** 31):
        raise SurveyImportError("sav_cleanup_failed")
    return pid


def cleanup_stale_imports(temp_root: Path | None = None, *, now: float | None = None) -> list[dict[str, Any]]:
    """Remove expired jobs with proven inactive owners; defer uncertain spawn windows."""
    root = _root(temp_root)
    timestamp = time.time() if now is None else now
    records = []
    for job in root.iterdir():
        match = JOB_NAME.fullmatch(job.name)
        if not match or _is_link(job) or not job.is_dir():
            continue
        identifier = match.group(1)
        try:
            lease = job / "lease.json"
            if _is_link(lease):
                continue
            if not lease.exists():
                if job.stat().st_mtime + INCOMPLETE_LEASE_GRACE_SECONDS <= timestamp:
                    worker_pid = _registered_worker(job, identifier)
                    if _pid_alive(worker_pid):
                        records.append({"importId": identifier, "status": "deferred", "at": timestamp})
                        continue
                    _remove_job(root, job)
                    records.append({"importId": identifier, "status": "removed", "at": timestamp})
                continue
            if lease.stat().st_size > 2048:
                records.append({"importId": identifier, "status": "cleanup_failed", "at": timestamp})
                continue
            entry = json.loads(lease.read_text(encoding="utf-8"))
            expires = entry.get("expiresAt")
            if (entry.get("schema") != "sav-import-lease/v1" or entry.get("id") != identifier
                    or isinstance(expires, bool) or not isinstance(expires, (int, float))
                    or not math.isfinite(expires) or expires > timestamp):
                continue
            worker_pid = _registered_worker(job, identifier)
            if (_pid_alive(entry.get("parentPid")) or _pid_alive(entry.get("childPid"))
                    or _pid_alive(worker_pid)):
                records.append({"importId": identifier, "status": "deferred", "at": timestamp})
                continue
            # A legacy/partly registered lease with no child PID cannot prove
            # that OS process creation never happened. Retain it for recovery.
            if entry.get("childPid") is None and worker_pid is None and entry.get("phase") != "prepared":
                records.append({"importId": identifier, "status": "deferred", "at": timestamp})
                continue
            _remove_job(root, job)
            records.append({"importId": identifier, "status": "removed", "at": timestamp})
        except (OSError, ValueError, AttributeError, SurveyImportError):
            records.append({"importId": identifier, "status": "cleanup_failed", "at": timestamp})
    return records




def _root(temp_root: Path | None) -> Path:
    candidate = temp_root if temp_root is not None else Path(tempfile.gettempdir()) / "evix-sav-import-v1"
    try:
        return scratch_runtime.private_root(candidate)
    except scratch_runtime.ScratchError:
        raise SurveyImportError("sav_temp_unavailable") from None


def _process_executable() -> str:
    try:
        return scratch_runtime.process_executable()
    except scratch_runtime.ScratchError:
        raise SurveyImportError("sav_dependency") from None


def _worker_command(upload: Path, result: Path) -> tuple[str, ...]:
    executable = _process_executable()
    script = str(Path(__file__).resolve())
    if executable != sys.executable:
        # The trusted application venv supplies dependencies, without loading
        # .pth hooks or adding the scratch directory to the import search path.
        site_packages = str(Path(sys.prefix) / "Lib" / "site-packages")
        bootstrap = ("import runpy,sys;sys.path.insert(0,sys.argv.pop(1));"
                     "sys.argv.pop(0);runpy.run_path(sys.argv[0],run_name='__main__')")
        return (executable, "-I", "-B", "-c", bootstrap, site_packages,
                script, "--worker", str(upload), str(result))
    return (executable, "-I", "-B", script, "--worker", str(upload), str(result))


async def parse_sav_bytes(
    content: bytes, *, timeout_seconds: float = 15,
    temp_root: Path | None = None, cancel_event: asyncio.Event | None = None,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Apply one spawn+parse deadline, then finish protected termination and cleanup."""
    entered_at = time.monotonic()
    if not isinstance(content, bytes) or not content:
        raise SurveyImportError("sav_empty")
    if len(content) > MAX_BYTES:
        raise SurveyImportError("sav_too_large")
    if (isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, numbers.Real)
            or not math.isfinite(timeout_seconds) or not 0 < timeout_seconds <= MAX_TIMEOUT_SECONDS):
        raise ValueError("timeout_seconds must be positive and at most 60")
    if cancel_event is not None and cancel_event.is_set():
        raise SurveyImportError("sav_cancelled")
    deadline = entered_at + float(timeout_seconds)
    root = _root(temp_root)
    identifier = uuid.uuid4().hex
    job = root / f"{JOB_PREFIX}{identifier}"
    process = None
    spawning = waiting = cancellation = None
    completed = False
    value = None
    try:
        job.mkdir(mode=0o700)
        _private_directory(job)
        upload, result_path = job / "input.sav", job / "result.json"
        lease = {"schema": "sav-import-lease/v1", "id": identifier,
                 "createdAt": time.time(), "expiresAt": time.time() + max(0, deadline - time.monotonic()) + 10,
                 "parentPid": os.getpid(), "childPid": None, "phase": "prepared"}
        _write_lease(job, lease)
        upload.write_bytes(content)
        environment = {key: value for key, value in os.environ.items()
                       if key.upper() in {"SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP",
                                          "HOME", "USERPROFILE", "LOCALAPPDATA", "LANG"}}
        environment.update(PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8",
                           OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1")
        if time.monotonic() >= deadline:
            raise SurveyImportError("sav_timeout")
        lease["phase"] = "spawning"
        _write_lease(job, lease)
        if cancel_event is not None:
            cancellation = asyncio.create_task(cancel_event.wait())
        spawning = asyncio.create_task(asyncio.create_subprocess_exec(
            *_worker_command(upload, result_path), cwd=job, env=environment,
            stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        ))
        watched = {spawning}
        if cancellation is not None:
            watched.add(cancellation)
        done, _ = await asyncio.wait(watched, timeout=max(0, deadline - time.monotonic()),
                                     return_when=asyncio.FIRST_COMPLETED)
        if cancellation is not None and cancellation in done:
            raise SurveyImportError("sav_cancelled")
        if spawning not in done:
            raise SurveyImportError("sav_timeout")
        process = spawning.result()
        lease["childPid"] = process.pid
        lease["phase"] = "registered"
        _write_lease(job, lease)
        _emit(on_event, identifier, "started")
        waiting = asyncio.create_task(process.wait())
        watched = {waiting}
        if cancellation is not None:
            watched.add(cancellation)
        done, _ = await asyncio.wait(watched, timeout=max(0, deadline - time.monotonic()),
                                     return_when=asyncio.FIRST_COMPLETED)
        if cancellation is not None and cancellation in done:
            raise SurveyImportError("sav_cancelled")
        if waiting not in done or time.monotonic() >= deadline:
            raise SurveyImportError("sav_timeout")
        if process.returncode != 0 or not result_path.is_file() or _is_link(result_path):
            raise SurveyImportError("sav_worker_failed")
        if result_path.stat().st_size > MAX_RESULT_BYTES:
            raise SurveyImportError("sav_result_too_large")
        response = json.loads(result_path.read_text(encoding="utf-8"),
                              parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if not isinstance(response, dict):
            raise SurveyImportError("sav_worker_failed")
        if response.get("ok") is not True:
            raise SurveyImportError(response.get("code", "sav_worker_failed"))
        value = response.get("result")
        if not isinstance(value, dict) or value.get("sourceSha256") != hashlib.sha256(content).hexdigest():
            raise SurveyImportError("sav_worker_failed")
        completed = True
        return value
    except asyncio.CancelledError:
        raise
    except SurveyImportError:
        raise
    except (OSError, ValueError, TypeError):
        raise SurveyImportError("sav_worker_failed") from None
    finally:
        # Repeated HTTP/task cancellation cannot interrupt child reaping or
        # directory removal. Cancellation is propagated after cleanup completes.
        cleanup = asyncio.create_task(_finish_job(root, job, process, spawning, waiting, cancellation))
        interrupted = False
        try:
            while True:
                try:
                    await asyncio.shield(cleanup)
                    break
                except asyncio.CancelledError:
                    interrupted = True
                    if cleanup.cancelled():
                        raise SurveyImportError("sav_cleanup_failed") from None
                    if cleanup.done():
                        cleanup.result()
                        break
        except (OSError, SurveyImportError):
            _emit(on_event, identifier, "cleanup_failed")
            raise SurveyImportError("sav_cleanup_failed") from None
        if completed and value is not None:
            value["cleanup"] = {"completed": True, "reason": "temporary-upload"}
        _emit(on_event, identifier, "completed_cleaned" if completed else "failed_cleaned")
        if interrupted:
            raise asyncio.CancelledError





def _linux_worker_limits() -> None:
    if sys.platform.startswith("linux"):
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (10, 11))
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_RESULT_BYTES,) * 2)


def _register_worker(input_path: Path, output_path: Path) -> None:
    job = input_path.parent
    match = JOB_NAME.fullmatch(job.name)
    if (not match or _is_link(job) or input_path.name != "input.sav"
            or output_path.name != "result.json" or output_path.parent != job):
        raise SurveyImportError("sav_worker_failed")
    identifier = match.group(1)
    _write_record(job, "worker.json", {"schema": "sav-import-worker/v1", "id": identifier,
                                     "pid": os.getpid(), "at": time.time()})
    # The child cannot read an upload until the parent has durably registered
    # its PID. An orphan created in the OS-spawn gap therefore never reads SAV.
    deadline = time.monotonic() + REGISTRATION_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        lease_path = job / "lease.json"
        if _is_link(lease_path) or not lease_path.is_file() or lease_path.stat().st_size > 2048:
            raise SurveyImportError("sav_worker_failed")
        entry = json.loads(lease_path.read_text(encoding="utf-8"))
        if (entry.get("schema") != "sav-import-lease/v1" or entry.get("id") != identifier
                or not _pid_alive(entry.get("parentPid"))):
            raise SurveyImportError("sav_worker_failed")
        if entry.get("phase") == "registered" and entry.get("childPid") == os.getpid():
            return
        time.sleep(0.01)
    raise SurveyImportError("sav_worker_failed")


def _worker(input_path: Path, output_path: Path) -> int:
    try:
        _linux_worker_limits()
        _register_worker(input_path, output_path)
        value = _parse_file(input_path)
        response = {"ok": True, "result": value}
        encoded = json.dumps(response, ensure_ascii=False, allow_nan=False,
                             separators=(",", ":")).encode("utf-8")
        if len(encoded) > MAX_RESULT_BYTES:
            raise SurveyImportError("sav_result_too_large")
    except SurveyImportError as error:
        encoded = json.dumps({"ok": False, "code": error.code}).encode("utf-8")
    except Exception:
        # pyreadstat can include paths, labels and source text in its exceptions.
        encoded = b'{"ok":false,"code":"sav_invalid"}'
    output_path.write_bytes(encoded)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] != "--worker":
        raise SystemExit(2)
    raise SystemExit(_worker(Path(sys.argv[2]), Path(sys.argv[3])))
