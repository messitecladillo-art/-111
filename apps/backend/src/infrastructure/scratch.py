from __future__ import annotations
import ctypes
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

CLEANUP_RETRY_DELAYS = (0.01, 0.02, 0.04, 0.08, 0.16, 0.32)

class ScratchError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

def private_directory(path: Path) -> None:
    """Restrict scratch files to the service account (plus SYSTEM on Windows)."""
    if os.name != "nt":
        if path.stat().st_uid != os.getuid():
            raise OSError("scratch owner mismatch")
        path.chmod(0o700)
        return
    from ctypes import wintypes
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    token = wintypes.HANDLE()
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    advapi.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                       ctypes.POINTER(wintypes.HANDLE)]
    advapi.GetTokenInformation.argtypes = [wintypes.HANDLE, ctypes.c_int,
                                         ctypes.c_void_p, wintypes.DWORD,
                                         ctypes.POINTER(wintypes.DWORD)]
    advapi.ConvertSidToStringSidW.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.LPWSTR)]
    advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    advapi.SetFileSecurityW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    sid_text = wintypes.LPWSTR()
    descriptor = ctypes.c_void_p()
    try:
        if not advapi.OpenProcessToken(kernel.GetCurrentProcess(), 0x0008, ctypes.byref(token)):
            raise ctypes.WinError(ctypes.get_last_error())
        needed = wintypes.DWORD()
        advapi.GetTokenInformation(token, 1, None, 0, ctypes.byref(needed))
        if not needed.value:
            raise ctypes.WinError(ctypes.get_last_error())
        buffer = ctypes.create_string_buffer(needed.value)
        if not advapi.GetTokenInformation(token, 1, buffer, needed.value, ctypes.byref(needed)):
            raise ctypes.WinError(ctypes.get_last_error())
        sid = ctypes.cast(buffer, ctypes.POINTER(ctypes.c_void_p)).contents.value
        if not advapi.ConvertSidToStringSidW(sid, ctypes.byref(sid_text)):
            raise ctypes.WinError(ctypes.get_last_error())
        sddl = f"D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;{sid_text.value})"
        if not advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl, 1, ctypes.byref(descriptor), None):
            raise ctypes.WinError(ctypes.get_last_error())
        if not advapi.SetFileSecurityW(str(path), 0x00000004 | 0x80000000, descriptor):
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        if descriptor:
            kernel.LocalFree(descriptor)
        if sid_text:
            kernel.LocalFree(sid_text)
        if token:
            kernel.CloseHandle(token)


def is_link(path: Path) -> bool:
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def private_root(temp_root: Path | None) -> Path:
    candidate = Path(temp_root) if temp_root is not None else Path(tempfile.gettempdir()) / "evix-scratch-v1"
    candidate = candidate.absolute()
    if any(is_link(parent) for parent in (candidate, *candidate.parents)):
        raise ScratchError("temp_unavailable")
    try:
        candidate.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not candidate.is_dir():
            raise OSError("scratch root is not a directory")
        private_directory(candidate)
        return candidate.resolve(strict=True)
    except OSError:
        raise ScratchError("temp_unavailable") from None


def pid_alive(pid: Any) -> bool:
    if not isinstance(pid, int) or isinstance(pid, bool) or not 0 < pid < 2 ** 31:
        return False
    if os.name == "nt":
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5  # Denied means alive, not disposable.
        try:
            code = wintypes.DWORD()
            return not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def write_record(job: Path, filename: str, entry: dict[str, Any]) -> None:
    # Readers see the previous complete lease or the new complete lease.
    temporary = job / ("." + filename + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(entry, handle, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(job / filename)


def write_lease(job: Path, entry: dict[str, Any]) -> None:
    write_record(job, "lease.json", entry)


def process_executable() -> str:
    # Windows venv python.exe is a redirector. Killing its PID can leave the
    # actual parser alive; use the real interpreter process we can reap.
    if os.name == "nt" and sys.prefix != sys.base_prefix:
        executable = getattr(sys, "_base_executable", None)
        if not executable or not Path(executable).is_file():
            raise ScratchError("dependency")
        return executable
    return sys.executable


def emit(callback: Callable[[dict[str, Any]], None] | None, identifier: str, status: str) -> None:
    if callback:
        try:
            callback({"importId": identifier, "status": status, "at": time.time()})
        except Exception:
            # Observability cannot change decoding, cleanup or a valid receipt.
            pass
