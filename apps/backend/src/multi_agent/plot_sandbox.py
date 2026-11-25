"""AST-validated, network-free subprocess sandbox for SVG plotting and readonly statistics."""

from __future__ import annotations

import ast
from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any, Callable, Literal
import xml.etree.ElementTree as ET

from multi_agent.agents.contracts import ToolResult
from shared.contracts import fingerprint

_PLOT_IMPORTS = frozenset({
    "numpy",
    "matplotlib",
    "matplotlib.pyplot",
    "matplotlib.figure",
    "matplotlib.patches",
    "matplotlib.ticker",
    "math",
    "statistics",
    "json",
    "collections",
})

_STAT_IMPORTS = frozenset({
    "numpy",
    "math",
    "statistics",
    "json",
    "collections",
    "itertools",
})

_MATPLOTLIB_SUB_ALLOW = frozenset({"pyplot", "figure", "patches", "ticker", "rcParams"})

_FORBIDDEN_NAMES = frozenset({
    "open", "exec", "eval", "compile", "__import__", "getattr", "setattr", "delattr",
    "globals", "locals", "vars", "dir", "input", "breakpoint", "memoryview",
    "type", "object", "super", "help", "exit", "quit", "__builtins__", "__loader__",
    "__spec__", "__file__", "__name__", "os", "sys", "subprocess", "socket",
    "pathlib", "shutil", "ctypes", "pickle", "marshal", "importlib", "urllib",
    "http", "httpx", "requests", "io", "tempfile",
})

_FORBIDDEN_SVG_TAGS = frozenset({"script", "image", "foreignobject"})
_GEOM_TAGS = frozenset({"path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "use"})
_SKIP_GROUP_TAGS = frozenset({"defs", "clippath", "metadata"})
_TRANSFORM_CALL_RE = re.compile(r"([a-zA-Z]+)\s*\(([^)]*)\)")
_FONT_SIZE_RE = re.compile(r"font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(pt|px)?", re.I)
_TEXT_ANCHOR_RE = re.compile(r"text-anchor\s*:\s*(start|middle|end)", re.I)
_CTRL_SPACE_RE = re.compile(r"[\s\x00-\x1f]+")

MAX_SCRIPT_CHARS = 16_000
MAX_SVG_BYTES = 2_000_000
MAX_STAT_RESULT_BYTES = 32_000
MAX_STAT_TABLE_ROWS = 40


class SandboxSecurityError(ValueError):
    """Raised when user/model sandbox code or output violates security policies."""


class SandboxExecutionError(RuntimeError):
    """Raised when sandbox execution fails, times out, or violates output contracts."""


def validate_sandbox_ast(code: str, *, mode: Literal["plot", "stat"]) -> None:
    """Validate script size, characters, imports, and AST safety rules before execution."""
    if mode not in ("plot", "stat"):
        raise SandboxSecurityError(f"invalid_sandbox_mode:{mode}")
    if not isinstance(code, str) or not 1 <= len(code) <= MAX_SCRIPT_CHARS:
        raise SandboxSecurityError("invalid_script_length")
    if "\x00" in code or any(ord(ch) < 32 and ch not in "\n\r\t" for ch in code):
        raise SandboxSecurityError("control_char_forbidden")

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise SandboxSecurityError(f"syntax_error:{exc.msg}") from None

    allowed_imports = _PLOT_IMPORTS if mode == "plot" else _STAT_IMPORTS
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name not in allowed_imports:
                    raise SandboxSecurityError(f"forbidden_import:{alias.name}")
                if alias.asname and alias.asname.startswith("_"):
                    raise SandboxSecurityError(f"dunder_alias_forbidden:{alias.asname}")
        elif isinstance(node, ast.ImportFrom):
            if node.level != 0 or not node.module or node.module not in allowed_imports:
                raise SandboxSecurityError(f"forbidden_import:{node.module or '.'}")
            for alias in node.names:
                if alias.name == "*" or alias.name.startswith("_"):
                    raise SandboxSecurityError(f"forbidden_import_symbol:{alias.name}")
                if alias.asname and alias.asname.startswith("_"):
                    raise SandboxSecurityError(f"dunder_alias_forbidden:{alias.asname}")
                if node.module == "matplotlib" and alias.name not in _MATPLOTLIB_SUB_ALLOW:
                    raise SandboxSecurityError(f"forbidden_matplotlib_symbol:{alias.name}")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("_"):
                raise SandboxSecurityError(f"dunder_attribute_forbidden:{node.attr}")
        elif isinstance(node, ast.Name):
            if node.id in _FORBIDDEN_NAMES:
                raise SandboxSecurityError(f"forbidden_identifier:{node.id}")
        elif isinstance(node, (ast.Global, ast.Nonlocal, ast.AsyncFunctionDef, ast.Await, ast.Yield, ast.YieldFrom)):
            raise SandboxSecurityError(f"forbidden_syntax:{type(node).__name__}")


def _scrubbed_env(mpl_dir: str) -> dict[str, str]:
    env = {
        key: os.environ[key]
        for key in ("SYSTEMROOT", "PATH", "TEMP", "TMP", "WINDIR")
        if key in os.environ
    }
    env.update({
        "MPLBACKEND": "Agg",
        "MPLCONFIGDIR": mpl_dir,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
        "NO_PROXY": "*",
    })
    return env


def _resolve_mpl_cache_dir(fallback_dir: str) -> str:
    candidate = Path(tempfile.gettempdir()) / "evix-mpl-cache"
    try:
        candidate.mkdir(parents=True, exist_ok=True)
        probe = candidate / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return str(candidate)
    except Exception:
        return fallback_dir


_CHILD_HARNESS = r"""
import copy
import hashlib
import io
import json
import math
import random
import socket
import statistics
import collections
import itertools
import sys
import types

def _blocked_net(*args, **kwargs):
    raise PermissionError("network_disabled_in_sandbox")

socket.socket = _blocked_net
socket.create_connection = _blocked_net

payload = json.loads(sys.stdin.read())
mode = payload["mode"]
code = payload["code"]

import numpy as np

# Pre-warm NumPy internals before restricting builtins/imports so idiomatic
# calls (mean, std, percentile, corrcoef, default_rng.choice) never trigger
# lazy internal submodule imports inside user execution.
_warm_a = np.asarray([1.0, 2.0, 3.0, 4.0], dtype=float)
_ = float(_warm_a.mean())
_ = float(_warm_a.std(ddof=1))
_ = float(_warm_a.var(ddof=1))
_ = np.percentile(_warm_a, [2.5, 97.5])
_ = np.quantile(_warm_a, [0.25, 0.75])
_ = float(np.median(_warm_a))
_ = np.corrcoef(np.asarray([[1.0, 2.0, 3.0], [2.0, 3.0, 5.0]], dtype=float))
_ = float(np.linalg.norm(_warm_a))
_ = int((_warm_a > 2.0).sum())
_ = int(np.argmin(_warm_a))
_ = np.random.default_rng(0).choice(_warm_a, size=4, replace=True)
del _warm_a, _
random.seed(42)
np.random.seed(42)

preloaded = {
    "numpy": np,
    "math": math,
    "statistics": statistics,
    "json": json,
    "collections": collections,
}
if mode == "stat":
    preloaded["itertools"] = itertools
    allowed = {"numpy", "math", "statistics", "json", "collections", "itertools"}
else:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.figure
    import matplotlib.patches
    import matplotlib.ticker
    _svg_salt = hashlib.sha256(
        json.dumps({"code": code, "data": payload.get("data")}, sort_keys=True, ensure_ascii=True).encode("utf-8")
    ).hexdigest()[:16]
    plt.rcParams["svg.fonttype"] = "none"
    plt.rcParams["svg.hashsalt"] = f"evix-{_svg_salt}"
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    preloaded.update({
        "matplotlib": matplotlib,
        "matplotlib.pyplot": plt,
        "matplotlib.figure": matplotlib.figure,
        "matplotlib.patches": matplotlib.patches,
        "matplotlib.ticker": matplotlib.ticker,
    })
    allowed = set(preloaded.keys())

real_import = __import__

def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level != 0 or name not in allowed:
        raise ImportError(f"forbidden_import:{name}")
    mod = preloaded[name]
    if fromlist:
        for sym in fromlist:
            if sym == "*" or str(sym).startswith("_"):
                raise ImportError(f"forbidden_import_symbol:{sym}")
            if name == "matplotlib" and sym not in {"pyplot", "figure", "patches", "ticker", "rcParams"}:
                raise ImportError(f"forbidden_matplotlib_symbol:{sym}")
            full = f"{name}.{sym}"
            attr = getattr(mod, sym, None)
            if isinstance(attr, types.ModuleType) and full not in allowed:
                raise ImportError(f"forbidden_submodule:{full}")
    return real_import(name, globals, locals, fromlist, level)

safe_builtins = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "enumerate": enumerate, "filter": filter, "float": float, "frozenset": frozenset,
    "int": int, "isinstance": isinstance, "iter": iter, "len": len, "list": list, "map": map,
    "max": max, "min": min, "next": next, "pow": pow, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set, "slice": slice,
    "sorted": sorted, "str": str, "sum": sum, "tuple": tuple, "zip": zip,
    "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError, "RuntimeError": RuntimeError,
    "ZeroDivisionError": ZeroDivisionError,
    "True": True, "False": False, "None": None,
    "__import__": _safe_import,
}

exec_globals = {"__builtins__": safe_builtins}

if mode == "plot":
    plt.close("all")
    real_fig_savefig = matplotlib.figure.Figure.savefig
    real_plt_savefig = plt.savefig
    real_plt_show = plt.show
    def _no_disk(*args, **kwargs):
        raise PermissionError("disk_write_forbidden_in_sandbox")
    matplotlib.figure.Figure.savefig = _no_disk
    plt.savefig = _no_disk
    plt.show = lambda *args, **kwargs: None

    data_obj = copy.deepcopy(payload["data"])
    exec_globals["DATA"] = data_obj
    exec_globals["plt"] = plt
    exec_globals["np"] = np

    try:
        exec(compile(code, "<sandbox_plot>", "exec"), exec_globals, exec_globals)
    finally:
        matplotlib.figure.Figure.savefig = real_fig_savefig
        plt.savefig = real_plt_savefig
        plt.show = real_plt_show

    fig = exec_globals.get("fig")
    if not isinstance(fig, matplotlib.figure.Figure):
        if not plt.get_fignums():
            raise RuntimeError("no_figure_created")
        fig = plt.gcf()

    hints = data_obj.get("_layoutHints") or {}
    repair_round = int(hints.get("repairRound") or 0)
    if repair_round > 0:
        cur_w, cur_h = fig.get_size_inches()
        pref_w = float(hints.get("preferredWidth") or cur_w)
        pref_h = float(hints.get("preferredHeight") or cur_h)
        fig.set_size_inches(max(float(cur_w), pref_w), max(float(cur_h), pref_h), forward=True)
        rot_deg = float(hints.get("rotateXTicks") or 0)
        font_scale = float(hints.get("fontScale") or 1.0)
        for ax in fig.get_axes():
            if rot_deg > 0:
                xlabels = ax.get_xticklabels()
                if len([t for t in xlabels if t.get_text().strip()]) >= 2:
                    for lbl in xlabels:
                        lbl.set_rotation(rot_deg)
                        lbl.set_horizontalalignment("right")
                        lbl.set_fontsize(max(8.0, float(lbl.get_fontsize()) * font_scale))
            for lbl in ax.get_yticklabels():
                lbl.set_fontsize(max(8.0, float(lbl.get_fontsize()) * font_scale))
            for txt_artist in [ax.title, ax.xaxis.label, ax.yaxis.label, *ax.texts]:
                if txt_artist is not None and txt_artist.get_text():
                    txt_artist.set_fontsize(max(8.0, float(txt_artist.get_fontsize()) * font_scale))
            leg = ax.get_legend()
            if leg is not None:
                for lt in leg.get_texts():
                    lt.set_fontsize(max(8.0, float(lt.get_fontsize()) * font_scale))
        try:
            fig.tight_layout(pad=1.4)
        except Exception:
            pass

    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight", pad_inches=0.18, metadata={"Date": None})
    plt.close("all")
    print(json.dumps({"ok": True, "svg": buf.getvalue()}, ensure_ascii=True))
else:
    data_obj = copy.deepcopy(payload["data"])
    exec_globals["DATA"] = data_obj
    exec_globals["QUESTIONS"] = copy.deepcopy(data_obj.get("questions") or [])
    exec_globals["ROWS"] = copy.deepcopy(data_obj.get("rows") or [])
    exec_globals["np"] = np
    exec_globals["RESULT"] = None
    exec(compile(code, "<sandbox_stat>", "exec"), exec_globals, exec_globals)
    res = exec_globals.get("RESULT")
    if type(res) is not dict:
        raise RuntimeError("stat_result_must_be_dict")
    print(json.dumps({"ok": True, "result": res}, ensure_ascii=True, allow_nan=False))
"""


def _run_child(
    *,
    mode: Literal["plot", "stat"],
    code: str,
    data: dict[str, Any],
    timeout_s: float,
) -> dict[str, Any]:
    stdin_payload = json.dumps(
        {"mode": mode, "code": code, "data": data},
        ensure_ascii=True,
        allow_nan=False,
    )
    with tempfile.TemporaryDirectory() as work_dir:
        mpl_dir = _resolve_mpl_cache_dir(work_dir)
        env = _scrubbed_env(mpl_dir)
        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-c", _CHILD_HARNESS],
                input=stdin_payload,
                cwd=work_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=max(1.0, float(timeout_s)),
                env=env,
            )
        except subprocess.TimeoutExpired as exc:
            raise SandboxExecutionError(f"sandbox_timeout:{timeout_s}s") from exc

    if proc.returncode != 0:
        err_line = (proc.stderr or proc.stdout or "").strip().splitlines()
        detail = err_line[-1][:240] if err_line else f"returncode_{proc.returncode}"
        if "forbidden_import" in detail or "disk_write_forbidden" in detail or "network_disabled" in detail:
            raise SandboxSecurityError(detail)
        raise SandboxExecutionError(f"sandbox_child_failed:{detail}")

    try:
        parsed = json.loads(proc.stdout)
    except Exception as exc:
        raise SandboxExecutionError(f"sandbox_invalid_stdout:{exc}") from exc
    if not isinstance(parsed, dict) or not parsed.get("ok"):
        raise SandboxExecutionError("sandbox_unexpected_response")
    return parsed


def _local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _mat_mul(
    m1: tuple[float, float, float, float, float, float],
    m2: tuple[float, float, float, float, float, float],
) -> tuple[float, float, float, float, float, float]:
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def _parse_transform(spec: str) -> tuple[float, float, float, float, float, float]:
    mat = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    if not spec:
        return mat
    for fn, args_raw in _TRANSFORM_CALL_RE.findall(spec):
        nums = [float(x) for x in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", args_raw)]
        op = fn.lower()
        cur: tuple[float, float, float, float, float, float] | None = None
        if op == "translate" and len(nums) >= 1:
            cur = (1.0, 0.0, 0.0, 1.0, nums[0], nums[1] if len(nums) >= 2 else 0.0)
        elif op == "scale" and len(nums) >= 1:
            sx = nums[0]
            sy = nums[1] if len(nums) >= 2 else sx
            cur = (sx, 0.0, 0.0, sy, 0.0, 0.0)
        elif op == "rotate" and len(nums) >= 1:
            rad = math.radians(nums[0])
            ca, sa = math.cos(rad), math.sin(rad)
            cx = nums[1] if len(nums) >= 3 else 0.0
            cy = nums[2] if len(nums) >= 3 else 0.0
            cur = (ca, sa, -sa, ca, cx - ca * cx + sa * cy, cy - sa * cx - ca * cy)
        elif op == "matrix" and len(nums) == 6:
            cur = (nums[0], nums[1], nums[2], nums[3], nums[4], nums[5])
        if cur is not None:
            mat = _mat_mul(mat, cur)
    return mat


def _apply_mat(mat: tuple[float, float, float, float, float, float], x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = mat
    return (a * x + c * y + e, b * x + d * y + f)


def _poly_area(poly: list[tuple[float, float]]) -> float:
    if len(poly) < 3:
        return 0.0
    total = 0.0
    for idx in range(len(poly)):
        x1, y1 = poly[idx]
        x2, y2 = poly[(idx + 1) % len(poly)]
        total += x1 * y2 - x2 * y1
    return abs(total) * 0.5


def _clip_convex_polygons(
    subject: list[tuple[float, float]],
    clipper: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Sutherland-Hodgman polygon intersection for arbitrarily rotated quads."""
    # Ensure clipper winding order is consistent via signed area
    signed = sum(
        clipper[i][0] * clipper[(i + 1) % len(clipper)][1]
        - clipper[(i + 1) % len(clipper)][0] * clipper[i][1]
        for i in range(len(clipper))
    )
    clip_pts = list(reversed(clipper)) if signed < 0 else list(clipper)

    output = list(subject)
    for i in range(len(clip_pts)):
        if not output:
            return []
        cp1 = clip_pts[i]
        cp2 = clip_pts[(i + 1) % len(clip_pts)]

        def _inside(p: tuple[float, float]) -> bool:
            return (cp2[0] - cp1[0]) * (p[1] - cp1[1]) - (cp2[1] - cp1[1]) * (p[0] - cp1[0]) >= -1e-9

        def _intersect(s: tuple[float, float], e: tuple[float, float]) -> tuple[float, float]:
            dc = (cp1[0] - cp2[0], cp1[1] - cp2[1])
            dp = (s[0] - e[0], s[1] - e[1])
            n1 = cp1[0] * cp2[1] - cp1[1] * cp2[0]
            n2 = s[0] * e[1] - s[1] * e[0]
            denom = dc[0] * dp[1] - dc[1] * dp[0]
            if abs(denom) < 1e-12:
                return e
            return ((n1 * dp[0] - n2 * dc[0]) / denom, (n1 * dp[1] - n2 * dc[1]) / denom)

        inp = output
        output = []
        s = inp[-1]
        for e in inp:
            if _inside(e):
                if not _inside(s):
                    output.append(_intersect(s, e))
                output.append(e)
            elif _inside(s):
                output.append(_intersect(s, e))
            s = e
    return output


def _estimate_text_width(text_str: str, font_size: float) -> float:
    total = 0.0
    for ch in text_str:
        code = ord(ch)
        if code > 0x2E80:
            total += 0.96 * font_size
        elif ch.isupper() or ch.isdigit():
            total += 0.58 * font_size
        elif ch.isspace():
            total += 0.30 * font_size
        else:
            total += 0.48 * font_size
    return max(font_size * 0.4, total)


def _parse_float_prefix(raw: str | None) -> float | None:
    if not raw:
        return None
    match = re.match(r"\s*([-+]?(?:\d+\.?\d*|\.\d+))", str(raw))
    if not match:
        return None
    val = float(match.group(1))
    return val if math.isfinite(val) else None


def audit_svg_layout(svg: str) -> dict[str, Any]:
    """Verify SVG vector purity, geometric density, text sizing, clipping, and label overlap."""
    issues: list[str] = []
    if not isinstance(svg, str) or not svg.strip():
        return {
            "passed": False,
            "vectorPure": False,
            "primitiveCount": 0,
            "textCount": 0,
            "overlapCount": 0,
            "truncationCount": 0,
            "smallFontCount": 0,
            "outOfBoundsCount": 0,
            "issues": ["empty_svg"],
        }

    try:
        root = ET.fromstring(svg)
    except ET.ParseError:
        return {
            "passed": False,
            "vectorPure": False,
            "primitiveCount": 0,
            "textCount": 0,
            "overlapCount": 0,
            "truncationCount": 0,
            "smallFontCount": 0,
            "outOfBoundsCount": 0,
            "issues": ["invalid_svg_xml"],
        }

    if _local_tag(root.tag) != "svg":
        return {
            "passed": False,
            "vectorPure": False,
            "primitiveCount": 0,
            "textCount": 0,
            "overlapCount": 0,
            "truncationCount": 0,
            "smallFontCount": 0,
            "outOfBoundsCount": 0,
            "issues": ["root_not_svg"],
        }

    vector_pure = True
    for elem in root.iter():
        ltag = _local_tag(elem.tag)
        if ltag in _FORBIDDEN_SVG_TAGS:
            vector_pure = False
            issues.append(f"forbidden_svg_tag:{ltag}")
        for attr_k, attr_v in elem.attrib.items():
            ak_local = _local_tag(attr_k)
            if ak_local.startswith("on"):
                vector_pure = False
                issues.append(f"forbidden_event_attr:{ak_local}")
            compact_val = _CTRL_SPACE_RE.sub("", str(attr_v)).lower()
            if "javascript:" in compact_val:
                vector_pure = False
                issues.append("forbidden_javascript_uri")

    vb_raw = root.attrib.get("viewBox") or root.attrib.get("viewbox") or ""
    vb_nums = [float(x) for x in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", vb_raw)]
    if len(vb_nums) != 4 or vb_nums[2] <= 0 or vb_nums[3] <= 0:
        issues.append("invalid_or_missing_viewbox")
        vb_x, vb_y, vb_w, vb_h = 0.0, 0.0, 400.0, 300.0
    else:
        vb_x, vb_y, vb_w, vb_h = vb_nums

    primitive_count = 0
    truncation_count = 0
    small_font_count = 0
    out_of_bounds_count = 0
    text_boxes: list[tuple[str, list[tuple[float, float]], tuple[float, float, float, float]]] = []

    def _walk(
        elem: ET.Element,
        parent_mat: tuple[float, float, float, float, float, float],
        in_defs: bool,
    ) -> None:
        nonlocal primitive_count, truncation_count, small_font_count, out_of_bounds_count
        ltag = _local_tag(elem.tag)
        now_in_defs = in_defs or (ltag in _SKIP_GROUP_TAGS)
        local_mat = _parse_transform(elem.attrib.get("transform", ""))
        cur_mat = _mat_mul(parent_mat, local_mat)

        if not now_in_defs:
            if ltag in _GEOM_TAGS:
                primitive_count += 1
            elif ltag == "text":
                txt = re.sub(r"\s+", " ", "".join(elem.itertext())).strip()
                if txt:
                    style = elem.attrib.get("style", "")
                    fs_match = _FONT_SIZE_RE.search(style)
                    fs_raw = float(fs_match.group(1)) if fs_match else (_parse_float_prefix(elem.attrib.get("font-size")) or 10.0)
                    scale_y = math.hypot(cur_mat[2], cur_mat[3]) or 1.0
                    eff_fs = fs_raw * scale_y

                    if eff_fs < 7.5:
                        small_font_count += 1
                        issues.append(f"small_font:{eff_fs:.1f}pt:{txt[:24]}")
                    if "…" in txt or "..." in txt:
                        truncation_count += 1
                        issues.append(f"ellipsis_truncation:{txt[:32]}")

                    x = _parse_float_prefix(elem.attrib.get("x")) or 0.0
                    y = _parse_float_prefix(elem.attrib.get("y")) or 0.0
                    ta_match = _TEXT_ANCHOR_RE.search(style)
                    anchor = (ta_match.group(1).lower() if ta_match else (elem.attrib.get("text-anchor") or "start").lower())
                    width = _estimate_text_width(txt, fs_raw)
                    if anchor == "middle":
                        x0, x1 = x - 0.5 * width, x + 0.5 * width
                    elif anchor == "end":
                        x0, x1 = x - width, x
                    else:
                        x0, x1 = x, x + width
                    y0, y1 = y - 0.82 * fs_raw, y + 0.18 * fs_raw

                    quad = [
                        _apply_mat(cur_mat, x0, y0),
                        _apply_mat(cur_mat, x1, y0),
                        _apply_mat(cur_mat, x1, y1),
                        _apply_mat(cur_mat, x0, y1),
                    ]
                    xs = [p[0] for p in quad]
                    ys = [p[1] for p in quad]
                    aabb = (min(xs), min(ys), max(xs), max(ys))
                    if (
                        aabb[0] < vb_x - 2.0
                        or aabb[1] < vb_y - 2.0
                        or aabb[2] > vb_x + vb_w + 2.0
                        or aabb[3] > vb_y + vb_h + 2.0
                    ):
                        out_of_bounds_count += 1
                        issues.append(f"out_of_bounds:{txt[:24]}")
                    if any(ch.isalnum() for ch in txt):
                        text_boxes.append((txt, quad, aabb))

        for child in elem:
            _walk(child, cur_mat, now_in_defs)

    _walk(root, (1.0, 0.0, 0.0, 1.0, 0.0, 0.0), False)

    if primitive_count < 2:
        issues.append(f"insufficient_primitives:{primitive_count}")

    overlap_count = 0
    for i in range(len(text_boxes)):
        txt_a, quad_a, aabb_a = text_boxes[i]
        area_a = _poly_area(quad_a)
        if area_a <= 1e-6:
            continue
        for j in range(i + 1, len(text_boxes)):
            txt_b, quad_b, aabb_b = text_boxes[j]
            if (
                aabb_a[2] <= aabb_b[0]
                or aabb_b[2] <= aabb_a[0]
                or aabb_a[3] <= aabb_b[1]
                or aabb_b[3] <= aabb_a[1]
            ):
                continue
            area_b = _poly_area(quad_b)
            if area_b <= 1e-6:
                continue
            inter_poly = _clip_convex_polygons(quad_a, quad_b)
            inter_area = _poly_area(inter_poly)
            if inter_area <= 1e-6:
                continue
            union_area = area_a + area_b - inter_area
            min_area = min(area_a, area_b)
            ratio = max(inter_area / union_area if union_area > 0 else 0.0, inter_area / min_area)
            if ratio > 0.35:
                overlap_count += 1
                issues.append(f"text_overlap:{txt_a[:16]}~{txt_b[:16]}({ratio:.2f})")

    return {
        "passed": len(issues) == 0,
        "vectorPure": vector_pure,
        "primitiveCount": primitive_count,
        "textCount": len(text_boxes),
        "overlapCount": overlap_count,
        "truncationCount": truncation_count,
        "smallFontCount": small_font_count,
        "outOfBoundsCount": out_of_bounds_count,
        "viewBox": [vb_x, vb_y, vb_w, vb_h],
        "issues": issues,
    }


def _layout_hints_for_round(round_idx: int, prev_audit: dict[str, Any] | None) -> dict[str, Any]:
    if round_idx <= 0:
        return {
            "repairRound": 0,
            "preferredWidth": 7.6,
            "preferredHeight": 4.8,
            "rotateXTicks": 0,
            "fontScale": 1.0,
        }
    has_overlap = bool(prev_audit and prev_audit.get("overlapCount", 0) > 0)
    has_oob = bool(prev_audit and prev_audit.get("outOfBoundsCount", 0) > 0)
    return {
        "repairRound": round_idx,
        "preferredWidth": 9.4 + 1.4 * (round_idx - 1) + (0.8 if has_oob else 0.0),
        "preferredHeight": 5.6 + 0.8 * (round_idx - 1),
        "rotateXTicks": 30 + 12 * (round_idx - 1) if (has_overlap or has_oob or round_idx >= 1) else 0,
        "fontScale": max(0.84, 0.94 - 0.06 * (round_idx - 1)),
    }


def execute_sandbox_plot(
    script: str,
    data_payload: dict[str, Any] | None = None,
    *,
    auto_repair: bool = True,
    max_repairs: int = 2,
    timeout_s: float = 12.0,
    vision_auditor: Callable[..., dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run an AST-validated Matplotlib script offline and auto-repair SVG layout defects."""
    validate_sandbox_ast(script, mode="plot")
    base_data = deepcopy(data_payload) if isinstance(data_payload, dict) else {}
    rounds_cap = max(0, int(max_repairs)) if auto_repair else 0

    svg = ""
    audit: dict[str, Any] = {}
    vision_res: dict[str, Any] | None = None
    rounds_used = 0

    for round_idx in range(rounds_cap + 1):
        rounds_used = round_idx
        payload = deepcopy(base_data)
        payload["_layoutHints"] = _layout_hints_for_round(round_idx, audit if round_idx > 0 else None)
        child_out = _run_child(mode="plot", code=script, data=payload, timeout_s=timeout_s)
        svg = str(child_out.get("svg") or "")
        if len(svg.encode("utf-8")) > MAX_SVG_BYTES:
            raise SandboxExecutionError("svg_output_too_large")
        audit = audit_svg_layout(svg)
        if not audit.get("vectorPure"):
            raise SandboxSecurityError("unsafe_svg_output")
        vision_ok = True
        if vision_auditor is not None:
            vision_res = vision_auditor(svg=svg, audit=audit, round_idx=round_idx)
            if isinstance(vision_res, dict) and vision_res.get("passed") is False:
                vision_ok = False
        if audit.get("passed") and vision_ok:
            break

    return {
        "ok": True,
        "svg": svg,
        "svgSha256": hashlib.sha256(svg.encode("utf-8")).hexdigest(),
        "audit": audit,
        "repairRounds": rounds_used,
        "visionAudit": vision_res,
    }


_PLOT_LABEL_MAP: tuple[tuple[str, str], ...] = (
    ("construct:service_perception", "服务感知综合分"),
    ("service_perception", "服务感知"),
    ("Q_trap", "反向异常题项"),
    ("ui_fluency", "界面流畅度"),
    ("tech_ease", "适老易用度"),
    ("subsidy_support", "补贴覆盖感"),
    ("living_mode", "居住方式"),
    ("region_tier", "县域区位层级"),
    ("adopt_intention", "采纳意愿"),
    ("adoption_intent", "采纳意愿"),
    ("renew_tier", "高阶续费意愿"),
    ("open_feedback", "开放意见反馈"),
)


_PLOT_JARGON_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bR[e]Act\b\s*(?:\u8f68\u8ff9|\u7b97\u5b50)?", re.I), "多步实证"),
    (re.compile(r"(?:\u79d1\u7814\u7ed8\u56fe|\u7edf\u8ba1\u8ba1\u7b97|\u53d7\u63a7|\u5b89\u5168)?\u6c99\u76d2"), "统计分析"),
    (re.compile(r"\u53d7\u63a7\u7b97\u5b50|\u81ea\u4e3b\u7b97\u5b50|\u7b97\u5b50\u56de\u6267|\u7b97\u5b50"), "统计方法"),
    (re.compile(r"\b(?:Epistemic[G]raph|Run[L]ease)\b", re.I), ""),
    (re.compile(r"\u8ba4\u77e5\u56fe\u8c31|\u6709\u5411\u65e0\u73af\u56fe|\u6709\u5411\u56fe|\bD[A]G\b"), "证据链"),
    (re.compile(r"\bp\s*=\s*0(?:\.0+)?(?![0-9.])", re.I), "p < 0.0001"),
    (re.compile(r"\br[h]o\s*="), "ρ="),
)


_PLOT_BRACKET_MAP: dict[int, str | None] = {
    0x300C: "“",
    0x300E: "“",
    0x300D: "”",
    0x300F: "”",
    0x3010: None,
    0x3011: None,
}


def _humanize_plot_text(raw: Any) -> str:
    """Translate internal dataset/construct identifiers into human-readable Chinese labels."""
    out = str(raw or "")
    for key, label in _PLOT_LABEL_MAP:
        out = re.sub(rf"\b{re.escape(key)}\b", label, out)
    out = re.sub(r"\bconstruct:([A-Za-z0-9_]+)\b", r"\1综合分", out)
    for pat, repl in _PLOT_JARGON_RULES:
        out = pat.sub(repl, out)
    return out.translate(_PLOT_BRACKET_MAP)


def _format_plot_title(raw_title: Any) -> str:
    """Strip internal snapshot numbering and wrap long academic chart titles without ellipsis."""
    clean = re.sub(r"^\[\d+\]\s*", "", _humanize_plot_text(raw_title)).strip()
    clean = re.sub(r"^(?:核心母洞察|关键结论更新|分析状态更新)[：:]\s*", "", clean).strip()
    clean = clean.replace("...", "").replace("…", "")
    clean = re.sub(r"\s{2,}", " ", clean).strip(" ，,;；:：—-")
    if not clean:
        return "统计分析结果可视化"
    if len(clean) > 60:
        for paren in ("（", "("):
            p_idx = clean.find(paren)
            if p_idx >= 12 and p_idx <= 60:
                clean = clean[:p_idx].strip()
                break
    if len(clean) > 60:
        cut = clean[:60]
        best = max((cut.rfind(sep) for sep in (" ", "。", "；", ";", "，", ",", "：", ":")), default=-1)
        if best >= 20:
            cut = cut[:best]
        while cut and cut[-1] in ("(", "（", "[", " ", "，", ",", "：", ":", "—", "-"):
            cut = cut[:-1]
        clean = cut.strip() or clean[:56].strip()
    if len(clean) <= 32:
        return clean
    mid = len(clean) // 2
    split_at = -1
    best_dist = 10**9
    for idx in range(max(14, mid - 12), min(len(clean) - 8, mid + 13)):
        ch = clean[idx]
        if ch in (" ", "：", ":", "，", ",", "；", ";", "—", "-", "(", "（"):
            dist = abs(idx - mid)
            if dist < best_dist:
                best_dist = dist
                split_at = idx + (0 if ch in ("(", "（") else 1)
    if split_at <= 0:
        split_at = min(34, max(20, mid))
    left = clean[:split_at].rstrip()
    right = clean[split_at:].lstrip()
    return f"{left}\n{right}" if right else left


def build_snapshot_plot_script(snapshot: dict[str, Any], chart_kind: str = "auto") -> tuple[str, dict[str, Any]]:
    """Build a safe deterministic Matplotlib plotting script + payload from a statistical receipt."""
    if not isinstance(snapshot, dict):
        raise ValueError("snapshot_must_be_dict")
    chart = snapshot.get("chart") if isinstance(snapshot.get("chart"), dict) else {}
    raw_cats = list(chart.get("categories") or [])
    raw_vals = list(chart.get("values") or [])

    if not raw_cats or len(raw_cats) != len(raw_vals):
        metrics = [m for m in (snapshot.get("metrics") or []) if isinstance(m, dict) and isinstance(m.get("value"), (int, float))]
        if metrics:
            raw_cats = [str(m.get("label") or f"M{i+1}")[:28] for i, m in enumerate(metrics[:12])]
            raw_vals = [float(m["value"]) for m in metrics[:12]]
        else:
            tbl = snapshot.get("table") if isinstance(snapshot.get("table"), dict) else {}
            rows = tbl.get("rows") if isinstance(tbl.get("rows"), list) else (snapshot.get("rows") or [])
            for r in rows[:12]:
                if isinstance(r, list) and len(r) >= 2 and isinstance(r[1], (int, float)):
                    raw_cats.append(str(r[0])[:28])
                    raw_vals.append(float(r[1]))

    if not raw_cats or not raw_vals:
        raw_cats = ["有效样本 n"]
        raw_vals = [float(snapshot.get("n") or snapshot.get("n_effective") or 0)]

    clean_cats = [_humanize_plot_text(c)[:32] for c in raw_cats[:16]]
    clean_vals = [float(v) if isinstance(v, (int, float)) and math.isfinite(float(v)) else 0.0 for v in raw_vals[:16]]
    title = _format_plot_title(chart.get("title") or snapshot.get("title") or snapshot.get("summary") or "统计分析结果可视化")
    chosen_kind = chart_kind if chart_kind in ("bar", "line", "forest", "dumbbell") else "auto"
    if chosen_kind == "auto":
        if chart.get("kind") == "line":
            chosen_kind = "line"
        elif len(clean_cats) > 6 or max((len(c) for c in clean_cats), default=0) > 8:
            chosen_kind = "barh"
        else:
            chosen_kind = "bar"

    data_payload = {
        "title": title,
        "categories": clean_cats,
        "values": clean_vals,
        "kind": chosen_kind,
        "snapshotId": str(snapshot.get("snapshot_id") or snapshot.get("id") or ""),
    }

    script = """import numpy as np
import matplotlib.pyplot as plt

cats = DATA["categories"]
vals = [float(v) for v in DATA["values"]]
kind = DATA["kind"]
hints = DATA.get("_layoutHints") or {}
w = float(hints.get("preferredWidth") or 8.2)
h = float(hints.get("preferredHeight") or 5.0)
rot = float(hints.get("rotateXTicks") or 0)

fig, ax = plt.subplots(figsize=(w, h))
idx = np.arange(len(cats))

if kind == "line":
    ax.plot(idx, vals, marker="o", linewidth=2.2, color="#1f4e78")
    ax.set_xticks(idx)
    ax.set_xticklabels(cats, rotation=rot if rot else (22 if len(cats) > 5 else 0), ha="right" if (rot or len(cats) > 5) else "center")
    for x_i, y_i in zip(idx, vals):
        ax.annotate(f"{y_i:.3g}", (x_i, y_i), textcoords="offset points", xytext=(0, 7), ha="center", fontsize=8.5)
elif kind == "barh":
    bars = ax.barh(idx, vals, color="#2b5c8f", height=0.58)
    ax.set_yticks(idx)
    ax.set_yticklabels(cats, fontsize=9)
    ax.invert_yaxis()
    span = max(abs(max(vals, default=1.0) - min(vals, default=0.0)), 1.0)
    ax.set_xlim(min(0.0, min(vals, default=0.0)) - 0.1 * span, max(vals, default=1.0) + 0.18 * span)
    for b, y_i in zip(bars, vals):
        ax.text(y_i + 0.02 * span, b.get_y() + b.get_height() / 2.0, f"{y_i:.3g}", va="center", ha="left", fontsize=8.5)
elif kind == "forest":
    vmin = min(vals, default=0.0)
    vmax = max(vals, default=1.0)
    ref_x = 0.0 if vmin <= 0.0 <= vmax else float(sum(vals) / max(len(vals), 1))
    span = max(vmax - vmin, abs(ref_x) * 0.25, 0.5)
    ax.axvline(ref_x, color="#64748b", linestyle="--", linewidth=1.1, alpha=0.8, zorder=1)
    ax.hlines(idx, [min(ref_x, v) for v in vals], [max(ref_x, v) for v in vals], color="#64748b", linewidth=2.0, zorder=2)
    ax.plot(vals, idx, "o", color="#0f766e", markersize=7.5, zorder=4)
    ax.set_yticks(idx)
    ax.set_yticklabels(cats, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlim(min(vmin, ref_x) - 0.26 * span, max(vmax, ref_x) + 0.26 * span)
    for y_idx, y_i in zip(idx, vals):
        if y_i < ref_x:
            ax.text(y_i - 0.045 * span, y_idx, f"{y_i:.3g}", va="center", ha="right", fontsize=8.5)
        else:
            ax.text(y_i + 0.045 * span, y_idx, f"{y_i:.3g}", va="center", ha="left", fontsize=8.5)
elif kind == "dumbbell":
    vmin = min(vals, default=0.0)
    vmax = max(vals, default=1.0)
    base_x = vmin * 0.92 if vmin > 0.0 and vmax > vmin else min(0.0, vmin)
    span = max(vmax - base_x, abs(vmax) * 0.25, 0.5)
    ax.hlines(idx, [base_x] * len(idx), vals, color="#94a3b8", linewidth=2.2, zorder=2)
    ax.plot([base_x] * len(idx), idx, "o", color="#cbd5e1", markeredgecolor="#475569", markersize=6.5, zorder=3)
    ax.plot(vals, idx, "o", color="#1f4e78", markersize=8.0, zorder=4)
    ax.set_yticks(idx)
    ax.set_yticklabels(cats, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlim(min(base_x, vmin) - 0.26 * span, max(vmax, base_x) + 0.26 * span)
    for y_idx, y_i in zip(idx, vals):
        if y_i < base_x:
            ax.text(y_i - 0.045 * span, y_idx, f"{y_i:.3g}", va="center", ha="right", fontsize=8.5)
        else:
            ax.text(y_i + 0.045 * span, y_idx, f"{y_i:.3g}", va="center", ha="left", fontsize=8.5)
else:
    colors = ["#1f4e78" if i % 2 == 0 else "#4a7ebb" for i in range(len(cats))]
    bars = ax.bar(idx, vals, color=colors, width=0.56)
    ax.set_xticks(idx)
    ax.set_xticklabels(cats, rotation=rot, ha="right" if rot else "center", fontsize=9)
    span = max(abs(max(vals, default=1.0) - min(vals, default=0.0)), 1.0)
    ax.set_ylim(min(0.0, min(vals, default=0.0)), max(vals, default=1.0) + 0.18 * span)
    for b, y_i in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2.0, y_i + 0.025 * span, f"{y_i:.3g}", ha="center", va="bottom", fontsize=8.5)

ax.set_title(DATA["title"], fontsize=10.8, pad=12, linespacing=1.32)
ax.grid(axis="x" if kind in ("barh", "forest", "dumbbell") else "y", linestyle="--", alpha=0.35)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
fig.tight_layout(pad=1.4)
"""
    return script, data_payload


def _check_no_row_exfiltration(value: Any, *, row_cap: int, depth: int = 0) -> None:
    if depth > 12:
        raise SandboxSecurityError("stat_result_depth_exceeded")
    if isinstance(value, list):
        if len(value) >= row_cap:
            raise SandboxSecurityError(f"raw_row_exfiltration_blocked:len={len(value)}>={row_cap}")
        for item in value:
            _check_no_row_exfiltration(item, row_cap=row_cap, depth=depth + 1)
    elif isinstance(value, dict):
        for v in value.values():
            _check_no_row_exfiltration(v, row_cap=row_cap, depth=depth + 1)


def execute_sandbox_readonly_stat(
    script: str,
    *,
    questions: list[dict[str, Any]],
    rows: list[Any],
    dataset_sha256: str = "",
    classification: str = "actual",
    timeout_s: float = 10.0,
) -> ToolResult:
    """Execute a readonly aggregate script with open-text stripped and anti-exfiltration gates."""
    validate_sandbox_ast(script, mode="stat")

    text_qids = {str(q.get("id") or "") for q in questions if isinstance(q, dict) and q.get("type") == "text"}
    text_vars = {str(q.get("variable") or "") for q in questions if isinstance(q, dict) and q.get("type") == "text"}
    forbidden_keys = (text_qids | text_vars) - {""}

    safe_questions = [
        deepcopy(q)
        for q in questions
        if isinstance(q, dict) and q.get("type") != "text"
    ]
    safe_rows: list[dict[str, Any]] = []
    for item in rows:
        raw_ans = item.answers if hasattr(item, "answers") else (item.get("answers", {}) if isinstance(item, dict) else {})
        raw_vis = item.visibility if hasattr(item, "visibility") else (item.get("visibility", {}) if isinstance(item, dict) else {})
        safe_rows.append({
            "answers": {k: deepcopy(v) for k, v in dict(raw_ans).items() if str(k) not in forbidden_keys},
            "visibility": {str(k): bool(v) for k, v in dict(raw_vis).items() if str(k) not in forbidden_keys},
        })

    child_out = _run_child(
        mode="stat",
        code=script,
        data={"questions": safe_questions, "rows": safe_rows},
        timeout_s=timeout_s,
    )
    result = child_out.get("result")
    if type(result) is not dict:
        raise SandboxExecutionError("stat_result_must_be_dict")

    encoded = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_STAT_RESULT_BYTES:
        raise SandboxSecurityError("stat_result_exceeds_32kb")

    summary = result.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise SandboxExecutionError("stat_result_missing_summary")
    clean_summary = _humanize_plot_text(summary).strip()

    metrics = result.get("metrics")
    if not isinstance(metrics, dict):
        raise SandboxExecutionError("stat_result_missing_metrics_dict")

    n_eff = result.get("n_effective")
    if type(n_eff) is not int or n_eff < 0:
        raise SandboxExecutionError("stat_result_invalid_n_effective")
    if len(safe_rows) >= 5 and n_eff < 5:
        raise SandboxSecurityError("stat_result_min_cell_n_violation")

    table = result.get("table")
    if isinstance(table, list) and len(table) > MAX_STAT_TABLE_ROWS:
        raise SandboxSecurityError("stat_table_exceeds_40_rows")
    if isinstance(table, dict) and isinstance(table.get("rows"), list) and len(table["rows"]) > MAX_STAT_TABLE_ROWS:
        raise SandboxSecurityError("stat_table_exceeds_40_rows")

    row_exfil_cap = max(10, len(safe_rows) // 2)
    _check_no_row_exfiltration(result, row_cap=row_exfil_cap)

    script_hash = hashlib.sha256(script.encode("utf-8")).hexdigest()
    snap_body = {
        "operator": "run_custom_stat_script",
        "script_sha256": script_hash,
        "dataset_sha256": dataset_sha256,
        "n_effective": n_eff,
        "metrics": metrics,
        "summary": clean_summary,
    }
    result_hash = fingerprint(snap_body)
    snapshot_id = f"snap_{result_hash[:12]}"
    cls_tag: Literal["actual", "simulated"] = "actual" if classification == "actual" else "simulated"
    return ToolResult(
        classification=cls_tag,
        evidence_refs=[snapshot_id],
        data={
            **deepcopy(result),
            "summary": clean_summary,
            "operator": "run_custom_stat_script",
            "snapshot_id": snapshot_id,
            "result_hash": result_hash,
            "script_sha256": script_hash,
            "diagnostics": list(result.get("diagnostics") or []),
        },
    )
