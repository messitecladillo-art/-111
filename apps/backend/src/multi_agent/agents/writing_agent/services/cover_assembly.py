"""Cover Production Engine (Backend Reference Analyzer, True Bézier Vector Calligraphy & Layer Assembler).

Supports:
- `direct_illustrated`: 6 diversified cross-medium "益普索杯" direct illustrated A4 covers (`f, a, b, c, d, e`).
- `layered_assembly`: Reference Cover -> Textless Backdrop (`1000x1414`) + True Bézier `<path d="M... C... Z"/>`
  Transparent Vector Art Typography (`matplotlib.textpath.TextPath` + authentic Chinese calligraphy fonts) ->
  Anchor-aligned 2x supersampled A4 PNG assembly (`<= 1 MB`, `CoverImage/v1` compliant).
"""
from __future__ import annotations

import base64
import binascii
import io
import math
from pathlib import Path
import re
from typing import Any
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.font_manager import FontProperties
from matplotlib.patches import Circle, Ellipse, FancyBboxPatch, PathPatch, Rectangle
from matplotlib.path import Path as MplPath
from matplotlib.textpath import TextPath
from matplotlib.transforms import Affine2D
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from multi_agent.agents.writing_agent.services.page_art import (
    COVER_PIPELINE_MODES,
    COVER_TYPOGRAPHY_STYLES,
    DEFAULT_COVER_COMPETITION_NAME,
    LIMITS,
    CoverPipelineMode,
    CoverTypographyStyle,
    build_clean_backdrop_prompt,
    cover_image_bytes,
    derive_blind_safe_team_name,
    normalize_cover_text_spec,
)
from shared.errors import ApiError

__all__ = [
    "CLEAN_BACKDROP_PRESET_IDS",
    "COVER_WIDTH",
    "COVER_HEIGHT",
    "COVER_PIPELINE_MODES",
    "COVER_TYPOGRAPHY_STYLES",
    "PRESET_PROFILES",
    "CoverPipelineMode",
    "CoverTypographyStyle",
    "analyze_reference_cover",
    "assemble_cover_from_layers",
    "assemble_cover_request",
    "build_clean_backdrop_prompt",
    "generate_vector_art_typography_svg",
]

COVER_WIDTH = 1000
COVER_HEIGHT = 1414
SUPERSAMPLE = 2
MAX_COVER_PNG_BYTES = 960_000
CLEAN_BACKDROP_PRESET_IDS = ("f", "e", "c", "b", "d", "a")

_PRESET_ID_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
_DATA_URL_RE = re.compile(r"^data:image/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$", re.IGNORECASE)
_SVG_NUM_TOKEN_RE = re.compile(r"[MmLlHhVvCcQqZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_ROTATE_RE = re.compile(r"rotate\(\s*([-+]?\d+\.?\d*)\s*(?:[, ]\s*([-+]?\d+\.?\d*)\s*[, ]\s*([-+]?\d+\.?\d*))?\s*\)")
_TRANSLATE_RE = re.compile(r"translate\(\s*([-+]?\d+\.?\d*)(?:\s*[, ]\s*([-+]?\d+\.?\d*))?\s*\)")
_CORNER_OPEN_RE = re.compile(r"^[\u300c\u300e]$")
_CORNER_CLOSE_RE = re.compile(r"^[\u300d\u300f]$")
_CORNER_BRACKET_RE = re.compile(r"^[\u300c\u300d\u300e\u300f]$")
_VERTICAL_QUOTE_STRIP_RE = re.compile(r"[\u300c\u300d\u300e\u300f\u201c\u201d\"]")
_UNMATCHED_CORNER_TITLE_RE = re.compile(r"\u300c([^\u300c\u300d]{1,4})\u300c")
_UNMATCHED_CORNER_SUB_RE = re.compile(r"\u300c([^\u300c\u300d]{1,8})\u300c")
_HIGHLIGHT_BRACKET_RE = re.compile(r"[\u300c\u300e\u201c\"](.)[\u300d\u300f\u201d\"]")
_NOTE_SANITIZE_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f\[\]\{\}\r\n\x00-\x1f\x7f]+")

DEFAULT_FALLBACK_COVER_TITLE = "银发智守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查"

STYLE_FONT_CANDIDATES: dict[str, tuple[str, ...]] = {
    "sculpted_orbit": (
        "C:/Windows/Fonts/STXINWEI.TTF",
        "C:/Windows/Fonts/STZHONGS.TTF",
        "C:/Windows/Fonts/FZSTK.TTF",
        "C:/Windows/Fonts/STKAITI.TTF",
        "C:/Windows/Fonts/simkai.ttf",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ),
    "cinnabar_vertical": (
        "C:/Windows/Fonts/STXINGKA.TTF",
        "C:/Windows/Fonts/FZSTK.TTF",
        "C:/Windows/Fonts/STKAITI.TTF",
        "C:/Windows/Fonts/simkai.ttf",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ),
    "xuan_calligraphy": (
        "C:/Windows/Fonts/FZSTK.TTF",
        "C:/Windows/Fonts/STXINGKA.TTF",
        "C:/Windows/Fonts/STKAITI.TTF",
        "C:/Windows/Fonts/simkai.ttf",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ),
    "staggered_poster": (
        "C:/Windows/Fonts/STXINGKA.TTF",
        "C:/Windows/Fonts/STXINWEI.TTF",
        "C:/Windows/Fonts/FZYTK.TTF",
        "C:/Windows/Fonts/STKAITI.TTF",
        "C:/Windows/Fonts/msyhbd.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ),
    "editorial_serif": (
        "C:/Windows/Fonts/NotoSerifSC-VF.ttf",
        "C:/Windows/Fonts/STZHONGS.TTF",
        "C:/Windows/Fonts/STSONG.TTF",
        "C:/Windows/Fonts/simsun.ttc",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ),
    "modern_geometric": (
        "C:/Windows/Fonts/Noto Sans SC Bold (TrueType).otf",
        "C:/Windows/Fonts/NotoSansSC-VF.ttf",
        "C:/Windows/Fonts/SourceHanSansCN-Normal.ttf",
        "C:/Windows/Fonts/STXIHEI.TTF",
        "C:/Windows/Fonts/Dengb.ttf",
        "C:/Windows/Fonts/msyhbd.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ),
}

EDITORIAL_SERIF_CANDIDATES = (
    "C:/Windows/Fonts/STZHONGS.TTF",
    "C:/Windows/Fonts/STKAITI.TTF",
    "C:/Windows/Fonts/simkai.ttf",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
)

KAITI_CANDIDATES = (
    "C:/Windows/Fonts/STKAITI.TTF",
    "C:/Windows/Fonts/simkai.ttf",
    "C:/Windows/Fonts/STZHONGS.TTF",
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
)

SEAL_FONT_CANDIDATES = (
    "C:/Windows/Fonts/SIMLI.TTF",
    "C:/Windows/Fonts/FZYTK.TTF",
    "C:/Windows/Fonts/STXINWEI.TTF",
    "C:/Windows/Fonts/STKAITI.TTF",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
)

CALLIGRAPHY_FONT_STACK = "'STXingkai', 'FZShuTi', 'STXinwei', 'STKaiti', 'KaiTi', 'Songti SC', serif"
KAITI_FONT_STACK = "'STKaiti', 'KaiTi', 'STZhongsong', 'Songti SC', 'Noto Serif SC', serif"
EDITORIAL_HEADER_STACK = "'STZhongsong', 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', 'SimSun', serif"
EDITORIAL_SERIF_FONT_STACK = "'Noto Serif SC', 'Source Han Serif SC', 'STZhongsong', 'Songti SC', 'SimSun', serif"
MODERN_GEOMETRIC_FONT_STACK = "'Noto Sans SC', 'Source Han Sans CN', 'PingFang SC', 'STXihei', 'DengXian', 'Microsoft YaHei', sans-serif"

DEFAULT_ANCHORS_HORIZONTAL: dict[str, Any] = {
    "canvasWidth": COVER_WIDTH,
    "canvasHeight": COVER_HEIGHT,
    "headerZone": {"x": 90, "y": 68, "width": 820, "height": 50},
    "titleZone": {"x": 96, "y": 175, "width": 808, "height": 230},
    "subtitleZone": {"x": 156, "y": 468, "width": 700, "height": 112},
    "teamPlaqueZone": {"x": 292, "y": 1300, "width": 416, "height": 60},
    "titleDirection": "horizontal",
    "titleOrientation": "horizontal",
    "inkMode": "dark_on_light",
}

DEFAULT_ANCHORS_VERTICAL: dict[str, Any] = {
    "canvasWidth": COVER_WIDTH,
    "canvasHeight": COVER_HEIGHT,
    "headerZone": {"x": 80, "y": 56, "width": 840, "height": 50},
    "titleZone": {"x": 625, "y": 145, "width": 265, "height": 575},
    "subtitleZone": {"x": 100, "y": 415, "width": 495, "height": 124},
    "teamPlaqueZone": {"x": 286, "y": 1308, "width": 428, "height": 58},
    "titleDirection": "vertical",
    "titleOrientation": "vertical",
    "inkMode": "dark_on_light",
}

PRESET_PROFILES: dict[str, dict[str, Any]] = {
    "f": {
        "defaultStyle": "sculpted_orbit",
        "inkMode": "dark_on_light",
        "headerZone": {"x": 90, "y": 68, "width": 820, "height": 50},
        "titleZone": {"x": 96, "y": 175, "width": 808, "height": 230},
        "subtitleZone": {"x": 156, "y": 468, "width": 700, "height": 112},
        "teamPlaqueZone": {"x": 292, "y": 1300, "width": 416, "height": 60},
        "titleDirection": "horizontal",
    },
    "e": {
        "defaultStyle": "staggered_poster",
        "inkMode": "dark_on_light",
        "headerZone": {"x": 84, "y": 58, "width": 832, "height": 50},
        "titleZone": {"x": 96, "y": 145, "width": 808, "height": 196},
        "subtitleZone": {"x": 136, "y": 372, "width": 728, "height": 102},
        "teamPlaqueZone": {"x": 292, "y": 1306, "width": 416, "height": 58},
        "titleDirection": "staggered",
    },
    "c": {
        "defaultStyle": "cinnabar_vertical",
        "inkMode": "dark_on_light",
        "headerZone": {"x": 80, "y": 56, "width": 840, "height": 50},
        "titleZone": {"x": 625, "y": 145, "width": 265, "height": 575},
        "subtitleZone": {"x": 100, "y": 415, "width": 495, "height": 124},
        "teamPlaqueZone": {"x": 286, "y": 1308, "width": 428, "height": 58},
        "titleDirection": "vertical",
    },
    "b": {
        "defaultStyle": "sculpted_orbit",
        "inkMode": "dark_on_light",
        "headerZone": {"x": 84, "y": 60, "width": 832, "height": 50},
        "titleZone": {"x": 96, "y": 156, "width": 808, "height": 210},
        "subtitleZone": {"x": 148, "y": 404, "width": 704, "height": 104},
        "teamPlaqueZone": {"x": 290, "y": 1308, "width": 420, "height": 58},
        "titleDirection": "horizontal",
    },
    "d": {
        "defaultStyle": "staggered_poster",
        "inkMode": "light_on_dark",
        "headerZone": {"x": 84, "y": 52, "width": 832, "height": 48},
        "titleZone": {"x": 96, "y": 136, "width": 808, "height": 196},
        "subtitleZone": {"x": 152, "y": 356, "width": 696, "height": 96},
        "teamPlaqueZone": {"x": 284, "y": 1326, "width": 432, "height": 58},
        "titleDirection": "staggered",
    },
    "a": {
        "defaultStyle": "xuan_calligraphy",
        "inkMode": "dark_on_light",
        "headerZone": {"x": 88, "y": 60, "width": 824, "height": 50},
        "titleZone": {"x": 96, "y": 156, "width": 808, "height": 212},
        "subtitleZone": {"x": 132, "y": 406, "width": 736, "height": 98},
        "teamPlaqueZone": {"x": 290, "y": 1308, "width": 420, "height": 58},
        "titleDirection": "horizontal",
    },
}


def _extract_preset_short_id(raw_name: str | None) -> str | None:
    if not isinstance(raw_name, str) or not raw_name.strip():
        return None
    clean = raw_name.strip().lower().removesuffix(".png")
    for prefix in ("cover-cand-", "backdrop-cand-"):
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    return clean if clean in PRESET_PROFILES else None


def _find_candidates_dir() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "apps" / "frontend" / "public" / "art" / "candidates"
        if candidate.is_dir():
            return candidate
    return None


def _resolve_candidate_file(raw_name: str, kind: str) -> Path:
    """Safely resolves `f`, `c`, `cover-cand-f`, or `backdrop-cand-c` inside `public/art/candidates`."""
    clean = raw_name.strip().lower().removesuffix(".png")
    if not _PRESET_ID_RE.fullmatch(clean):
        raise ApiError(422, "invalid_preset", "所选封面预设编号无效。")
    root = _find_candidates_dir()
    if root is None:
        raise ApiError(500, "candidates_missing", "未找到内置封面预设图库，请稍后重试或上传自定义底图。")
    resolved_root = root.resolve()

    short_id = clean
    for prefix in ("cover-cand-", "backdrop-cand-"):
        if short_id.startswith(prefix):
            short_id = short_id[len(prefix):]
            break

    if kind == "reference":
        filenames = [f"cover-cand-{short_id}.png", f"{clean}.png"]
    else:
        fallback_bg = "backdrop-cand-c.png" if short_id in ("c", "a", "e") else "backdrop-cand-f.png"
        filenames = [f"backdrop-cand-{short_id}.png", f"{clean}.png", fallback_bg]

    for fname in filenames:
        target = (resolved_root / fname).resolve()
        if target.is_relative_to(resolved_root) and target.is_file():
            return target
    raise ApiError(422, "preset_not_found", "未找到所选的封面预设底图，请切换其他预设后重试。")


def _decode_image_payload(raw_value: str) -> bytes:
    trimmed = raw_value.strip()
    m = _DATA_URL_RE.match(trimmed)
    b64_str = re.sub(r"\s+", "", m.group(1) if m else trimmed)
    if not b64_str or len(b64_str) > 16_000_000:
        raise ApiError(422, "invalid_image_data", "上传的图像数据为空或超出文件大小上限。")
    try:
        return base64.b64decode(b64_str, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(422, "invalid_image_data", "上传的图像文件格式无效，请重新选择清晰的 PNG 或 JPEG 图片。") from None


def _resolve_font_file(candidates: tuple[str, ...]) -> str | None:
    for candidate in candidates:
        if Path(candidate).is_file():
            return candidate
    return None


def _hex_to_rgba(hex_color: str, alpha: float = 1.0) -> tuple[int, int, int, int]:
    clean = hex_color.strip().lstrip("#")
    if len(clean) == 3:
        clean = "".join(ch * 2 for ch in clean)
    if len(clean) != 6:
        return (24, 36, 51, int(round(max(0.0, min(1.0, alpha)) * 255)))
    r = int(clean[0:2], 16)
    g = int(clean[2:4], 16)
    b = int(clean[4:6], 16)
    return (r, g, b, int(round(max(0.0, min(1.0, alpha)) * 255)))


def _zone_stats(lum: np.ndarray, grad: np.ndarray, rect: dict[str, int]) -> dict[str, float]:
    x0 = max(0, min(COVER_WIDTH - 1, int(rect["x"])))
    y0 = max(0, min(COVER_HEIGHT - 1, int(rect["y"])))
    x1 = max(x0 + 1, min(COVER_WIDTH, int(rect["x"] + rect["width"])))
    y1 = max(y0 + 1, min(COVER_HEIGHT, int(rect["y"] + rect["height"])))
    sub_l = lum[y0:y1, x0:x1]
    sub_g = grad[y0:y1, x0:x1]
    return {
        "luminance": round(float(sub_l.mean()), 2),
        "edgeDensity": round(float((sub_g > 24.0).mean()), 4),
    }


def _relative_luminance_srgb(r: float, g: float, b: float) -> float:
    def lin(c: float) -> float:
        c = max(0.0, min(1.0, c / 255.0))
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    ri = max(0, min(255, int(round(r))))
    gi = max(0, min(255, int(round(g))))
    bi = max(0, min(255, int(round(b))))
    return f"#{ri:02X}{gi:02X}{bi:02X}"


def _detect_reading_pocket(lum: np.ndarray, grad: np.ndarray) -> dict[str, Any]:
    """Sliding-window search over non-preset cover canvases to find the calmest low-saliency reading pocket."""
    candidates = [
        {
            "name": "upper_band",
            "titleZone": {"x": 96, "y": 158, "width": 808, "height": 230},
            "subtitleZone": {"x": 156, "y": 416, "width": 688, "height": 112},
            "priorBias": -0.05,
        },
        {
            "name": "upper_left_editorial",
            "titleZone": {"x": 76, "y": 154, "width": 620, "height": 236},
            "subtitleZone": {"x": 92, "y": 418, "width": 588, "height": 112},
            "priorBias": -0.03,
        },
        {
            "name": "upper_right_editorial",
            "titleZone": {"x": 304, "y": 154, "width": 620, "height": 236},
            "subtitleZone": {"x": 320, "y": 418, "width": 588, "height": 112},
            "priorBias": -0.02,
        },
        {
            "name": "mid_band_calm",
            "titleZone": {"x": 108, "y": 470, "width": 784, "height": 220},
            "subtitleZone": {"x": 156, "y": 712, "width": 688, "height": 108},
            "priorBias": 0.04,
        },
        {
            "name": "lower_calm_pocket",
            "titleZone": {"x": 100, "y": 872, "width": 800, "height": 212},
            "subtitleZone": {"x": 156, "y": 1102, "width": 688, "height": 104},
            "priorBias": 0.06,
        },
    ]

    best: dict[str, Any] | None = None
    best_cost = float("inf")
    for cand in candidates:
        tz = cand["titleZone"]
        x0, y0 = tz["x"], tz["y"]
        x1, y1 = x0 + tz["width"], y0 + tz["height"]
        sub_l = lum[y0:y1, x0:x1]
        sub_g = grad[y0:y1, x0:x1]
        edge_d = float((sub_g > 24.0).mean())
        lum_std = float(sub_l.std())
        mean_lum = float(sub_l.mean())
        cost = edge_d * 2.1 + (lum_std / 128.0) * 0.85 + cand["priorBias"]
        if cost < best_cost:
            best_cost = cost
            best = {
                **cand,
                "meanLuminance": round(mean_lum, 2),
                "edgeDensity": round(edge_d, 4),
                "luminanceStd": round(lum_std, 2),
                "score": round(max(0.0, 1.0 - cost), 4),
            }

    assert best is not None
    return best


def _extract_cover_palette(
    rgb: np.ndarray,
    pocket_rect: dict[str, int],
    ink_mode: str,
) -> dict[str, str]:
    """Extracts high-contrast dominant primary & accent colors from the reference backdrop."""
    x0 = max(0, min(COVER_WIDTH - 1, int(pocket_rect["x"])))
    y0 = max(0, min(COVER_HEIGHT - 1, int(pocket_rect["y"])))
    x1 = max(x0 + 1, min(COVER_WIDTH, int(pocket_rect["x"] + pocket_rect["width"])))
    y1 = max(y0 + 1, min(COVER_HEIGHT, int(pocket_rect["y"] + pocket_rect["height"])))
    pocket_mean = rgb[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0)
    pocket_rel_l = _relative_luminance_srgb(*pocket_mean.tolist())

    # Sample coarse grid across the visual artwork body for chromatic richness
    sample = rgb[::8, ::8].reshape(-1, 3)
    cmax = sample.max(axis=1)
    cmin = sample.min(axis=1)
    sat = cmax - cmin
    chromatic = sample[sat >= 26.0]
    if len(chromatic) >= 12:
        med_rgb = np.median(chromatic, axis=0)
        # Pick highest-chroma midtone cluster pixel as accent seed
        chroma_sat = chromatic.max(axis=1) - chromatic.min(axis=1)
        bright_mask = (chromatic.mean(axis=1) >= 65.0) & (chromatic.mean(axis=1) <= 215.0)
        pool = chromatic[bright_mask] if bright_mask.sum() >= 6 else chromatic
        pool_sat = pool.max(axis=1) - pool.min(axis=1)
        accent_seed = pool[int(np.argmax(pool_sat))]
    else:
        med_rgb = np.array([28.0, 62.0, 60.0])
        accent_seed = np.array([197.0, 141.0, 68.0]) if ink_mode == "dark_on_light" else np.array([245.0, 202.0, 123.0])

    def ensure_contrast(seed: np.ndarray, target_light_text: bool) -> str:
        cur = seed.copy()
        for _ in range(10):
            rel = _relative_luminance_srgb(*cur.tolist())
            contrast = (max(rel, pocket_rel_l) + 0.05) / (min(rel, pocket_rel_l) + 0.05)
            if contrast >= 4.2:
                break
            cur = cur + (255.0 - cur) * 0.25 if target_light_text else cur * 0.72
        return _rgb_to_hex(*cur.tolist())

    if ink_mode == "light_on_dark":
        primary_hex = ensure_contrast(np.array([250.0, 240.0, 215.0]), True)
        accent_hex = ensure_contrast(accent_seed * 0.8 + np.array([245.0, 202.0, 123.0]) * 0.2, True)
        plaque_bg = "#FAF0D7"
    else:
        primary_hex = ensure_contrast(med_rgb * 0.45 + np.array([18.0, 31.0, 48.0]) * 0.55, False)
        accent_hex = ensure_contrast(accent_seed * 0.75 + np.array([170.0, 62.0, 42.0]) * 0.25, False)
        plaque_bg = "#FAF7F1"

    return {
        "primaryHex": primary_hex,
        "accentHex": accent_hex,
        "plaqueBgHex": plaque_bg,
    }


def analyze_reference_cover(
    reference_bytes: bytes,
    *,
    style_hint: str | None = None,
    preset_hint: str | None = None,
) -> dict[str, Any]:
    """Analyzes a reference cover's spatial luminance and edge density, returning `ReferenceLayoutAnchors`."""
    if not isinstance(reference_bytes, (bytes, bytearray)) or len(reference_bytes) < 24:
        raise ApiError(422, "invalid_reference_image", "所选参照封面图像无效，请更换图片后重试。")
    try:
        with Image.open(io.BytesIO(reference_bytes)) as raw_img:
            orig_w, orig_h = raw_img.size
            rgb_img = raw_img.convert("RGB").resize((COVER_WIDTH, COVER_HEIGHT), Image.Resampling.BILINEAR)
    except Exception as exc:
        raise ApiError(422, "invalid_reference_image", "无法读取参照封面图像，请确认图片未损坏。") from exc

    rgb = np.asarray(rgb_img, dtype=np.float32)
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = 0.5 * (lum[:, 2:] - lum[:, :-2])
    gy[1:-1, :] = 0.5 * (lum[2:, :] - lum[:-2, :])
    grad = np.hypot(gx, gy)

    upper_lum = float(lum[:520, :].mean())
    plaque_lum = float(lum[1280:1385, 250:750].mean())
    ink_mode = "dark_on_light" if upper_lum >= 136.0 else "light_on_dark"

    # Detect vertical right-spine calligraphy vs horizontal / staggered banner from stroke contrast & edge energy
    stroke_contrast = np.abs(lum - np.median(lum[:700, :]))
    right_spine_energy = float(
        (grad[150:720, 635:895] + 0.45 * stroke_contrast[150:720, 635:895]).mean()
    )
    upper_left_energy = float(
        (grad[155:375, 120:545] + 0.45 * stroke_contrast[155:375, 120:545]).mean()
    )

    preset_key = _extract_preset_short_id(preset_hint)
    preset_prof = PRESET_PROFILES.get(preset_key) if preset_key else None

    if style_hint == "cinnabar_vertical" or (
        style_hint is None and right_spine_energy > max(12.0, upper_left_energy * 1.55)
    ):
        direction = "vertical"
    elif style_hint == "staggered_poster":
        direction = "staggered"
    elif preset_prof is not None and style_hint is None:
        direction = preset_prof["titleDirection"]
    else:
        left_band = grad[170:410, 140:490]
        right_band = grad[170:410, 510:860]
        ys = np.arange(170, 410, dtype=np.float32)[:, None]
        cy_left = float((left_band * ys).sum() / max(1.0, float(left_band.sum())))
        cy_right = float((right_band * ys).sum() / max(1.0, float(right_band.sum())))
        if style_hint is None and left_band.mean() > 8.0 and right_band.mean() > 8.0 and abs(cy_left - cy_right) >= 22.0:
            direction = "staggered"
        else:
            direction = "horizontal"

    if preset_prof is not None and direction == preset_prof["titleDirection"]:
        base = {
            "headerZone": dict(preset_prof["headerZone"]),
            "titleZone": dict(preset_prof["titleZone"]),
            "subtitleZone": dict(preset_prof["subtitleZone"]),
            "teamPlaqueZone": dict(preset_prof["teamPlaqueZone"]),
        }
        recommended_style = preset_prof["defaultStyle"]
        breathing_ratio = 0.58 if direction == "vertical" else 0.44
    elif direction == "vertical":
        base = {
            "headerZone": dict(DEFAULT_ANCHORS_VERTICAL["headerZone"]),
            "titleZone": dict(DEFAULT_ANCHORS_VERTICAL["titleZone"]),
            "subtitleZone": dict(DEFAULT_ANCHORS_VERTICAL["subtitleZone"]),
            "teamPlaqueZone": dict(DEFAULT_ANCHORS_VERTICAL["teamPlaqueZone"]),
        }
        recommended_style = "cinnabar_vertical"
        breathing_ratio = 0.58
        reading_pocket = {
            "name": "right_vertical_spine",
            "meanLuminance": round(upper_lum, 2),
            "edgeDensity": round(float((grad[150:720, 635:895] > 24.0).mean()), 4),
            "luminanceStd": round(float(lum[150:720, 635:895].std()), 2),
            "score": 0.72,
        }
    else:
        # Arbitrary / open-art-direction cover: use sliding-window low-saliency pocket detector + dynamic ink & color match
        reading_pocket = _detect_reading_pocket(lum, grad)
        pocket_lum = float(reading_pocket["meanLuminance"])
        ink_mode = "dark_on_light" if pocket_lum >= 134.0 else "light_on_dark"
        base = {
            "headerZone": dict(DEFAULT_ANCHORS_HORIZONTAL["headerZone"]),
            "titleZone": dict(reading_pocket["titleZone"]),
            "subtitleZone": dict(reading_pocket["subtitleZone"]),
            "teamPlaqueZone": dict(DEFAULT_ANCHORS_HORIZONTAL["teamPlaqueZone"]),
        }
        global_edge = float((grad > 24.0).mean())
        cool_delta = float(rgb[:, :, 2].mean() - rgb[:, :, 0].mean())
        if direction == "staggered":
            recommended_style = "staggered_poster"
        elif cool_delta > 6.0 and global_edge > 0.14:
            recommended_style = "modern_geometric"
        else:
            recommended_style = "editorial_serif"
        breathing_ratio = 0.44

    extracted_palette = _extract_cover_palette(rgb, base["titleZone"], ink_mode)
    zone_metrics = {
        name: _zone_stats(lum, grad, rect)
        for name, rect in base.items()
    }

    return {
        "canvasWidth": COVER_WIDTH,
        "canvasHeight": COVER_HEIGHT,
        "sourceWidth": orig_w,
        "sourceHeight": orig_h,
        "headerZone": base["headerZone"],
        "titleZone": base["titleZone"],
        "subtitleZone": base["subtitleZone"],
        "teamPlaqueZone": base["teamPlaqueZone"],
        "titleDirection": direction,
        "titleOrientation": direction,
        "inkMode": ink_mode,
        "plaqueInkMode": "dark_on_light" if plaque_lum >= 128.0 else "light_on_dark",
        "recommendedStyle": recommended_style,
        "breathingZoneRatio": breathing_ratio,
        "upperLuminance": round(upper_lum, 2),
        "readingPocket": locals().get("reading_pocket") or {
            "name": f"preset_{preset_key or 'default'}",
            "meanLuminance": round(upper_lum, 2),
            "edgeDensity": zone_metrics["titleZone"]["edgeDensity"],
            "luminanceStd": 0.0,
            "score": 0.85,
        },
        "extractedPalette": extracted_palette,
        "zoneMetrics": zone_metrics,
    }


def _wrap_chinese_lines(raw_text: str, max_per_line: int = 16, max_lines: int = 2) -> list[str]:
    clean = raw_text.strip()
    if not clean:
        return []
    chars = list(clean)
    if len(chars) <= max_per_line:
        return [clean]
    if max_lines == 2 and len(chars) <= max_per_line * 2:
        mid = math.ceil(len(chars) / 2)
        split_idx = mid
        for offset in range(0, 5):
            matched = False
            for cand in (mid - offset, mid + offset):
                if 4 < cand < len(chars) - 4 and chars[cand - 1] in "与及和跟对在":
                    split_idx = cand
                    matched = True
                    break
            if matched:
                break
        return ["".join(chars[:split_idx]), "".join(chars[split_idx:])]
    out: list[str] = []
    for i in range(0, len(chars), max_per_line):
        if len(out) >= max_lines:
            break
        out.append("".join(chars[i : i + max_per_line]))
    return out


def _split_hero_and_subtitle(main_title: str, subtitle: str) -> tuple[str, int, list[str]]:
    clean_title = (main_title or "").strip() or "银发智守"
    clean_title = _UNMATCHED_CORNER_TITLE_RE.sub("\u300c\\1\u300d", clean_title)
    clean_sub = _UNMATCHED_CORNER_SUB_RE.sub("\u300c\\1\u300d", (subtitle or "").strip())

    colon_match = re.match(r"^([^：:—–\-]{2,11})\s*[：:—–\-]+\s*(.+)$", clean_title)
    if colon_match:
        hero_lead = colon_match.group(1).strip()
        tail_from_title = colon_match.group(2).strip()
    elif len(clean_title) > 10:
        hero_lead = clean_title[:8].strip()
        tail_from_title = clean_title
    else:
        hero_lead = clean_title
        tail_from_title = ""

    bracket_match = _HIGHLIGHT_BRACKET_RE.search(hero_lead)
    hero_chars = list(hero_lead)
    if bracket_match and bracket_match.group(1) in hero_chars:
        highlight_idx = hero_chars.index(bracket_match.group(1))
    elif len(hero_chars) == 4:
        highlight_idx = 2
    else:
        highlight_idx = min(len(hero_chars) // 2, max(0, len(hero_chars) - 1))

    primary_sub = tail_from_title or clean_sub
    topic_lines = _wrap_chinese_lines(primary_sub, max_per_line=17, max_lines=2)
    return hero_lead, highlight_idx, topic_lines


def _glyph_to_cubic_bezier_d(
    char: str,
    font_path: str,
    target_em_px: float,
    center_x: float,
    center_y: float,
) -> str | None:
    """Converts a Unicode glyph into an upright SVG cubic Bézier `<path d="M ... C ... Z"/>` string."""
    tp = TextPath((0.0, 0.0), char, size=100.0, prop=FontProperties(fname=font_path))
    if tp.vertices is None or len(tp.vertices) < 3:
        return None

    verts = np.asarray(tp.vertices, dtype=np.float64)
    xmin, ymin = verts.min(axis=0)
    xmax, ymax = verts.max(axis=0)
    if xmax - xmin < 1e-3 or ymax - ymin < 1e-3:
        return None

    if _CORNER_OPEN_RE.match(char):
        scale = target_em_px / 96.0
        gx_mid = 0.5 * (xmin + xmax) + 8.0
        gy_mid = 0.5 * (ymin + ymax) - 16.0
    elif _CORNER_CLOSE_RE.match(char):
        scale = target_em_px / 96.0
        gx_mid = 0.5 * (xmin + xmax) - 8.0
        gy_mid = 0.5 * (ymin + ymax) + 16.0
    else:
        scale = target_em_px / 88.0
        gx_mid = 0.5 * (xmin + xmax)
        gy_mid = 0.5 * (ymin + ymax)

    def to_svg(pt: np.ndarray | tuple[float, float]) -> tuple[float, float]:
        return (
            center_x + (float(pt[0]) - gx_mid) * scale,
            center_y - (float(pt[1]) - gy_mid) * scale,
        )

    commands: list[str] = []
    cur_pt = (center_x, center_y)
    subpath_start = cur_pt
    has_cubic = False

    for points, code in tp.iter_segments():
        if code == MplPath.MOVETO:
            cur_pt = to_svg((points[0], points[1]))
            subpath_start = cur_pt
            commands.append(f"M {cur_pt[0]:.2f} {cur_pt[1]:.2f}")
        elif code == MplPath.LINETO:
            nxt = to_svg((points[0], points[1]))
            cur_pt = nxt
            commands.append(f"L {nxt[0]:.2f} {nxt[1]:.2f}")
        elif code == MplPath.CURVE3:
            # Exact degree elevation of quadratic Bézier (cur_pt, q1, p2) -> cubic Bézier (cur_pt, c1, c2, p2)
            q1 = to_svg((points[0], points[1]))
            p2 = to_svg((points[2], points[3]))
            c1x = cur_pt[0] + (2.0 / 3.0) * (q1[0] - cur_pt[0])
            c1y = cur_pt[1] + (2.0 / 3.0) * (q1[1] - cur_pt[1])
            c2x = p2[0] + (2.0 / 3.0) * (q1[0] - p2[0])
            c2y = p2[1] + (2.0 / 3.0) * (q1[1] - p2[1])
            cur_pt = p2
            has_cubic = True
            commands.append(
                f"C {c1x:.2f} {c1y:.2f} {c2x:.2f} {c2y:.2f} {p2[0]:.2f} {p2[1]:.2f}"
            )
        elif code == MplPath.CURVE4:
            c1 = to_svg((points[0], points[1]))
            c2 = to_svg((points[2], points[3]))
            p3 = to_svg((points[4], points[5]))
            cur_pt = p3
            has_cubic = True
            commands.append(
                f"C {c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p3[0]:.2f} {p3[1]:.2f}"
            )
        elif code == MplPath.CLOSEPOLY:
            cur_pt = subpath_start
            commands.append("Z")

    if not commands:
        return None
    if not has_cubic:
        # Degenerate straight-only glyph in geometric fonts: promote first L segment to exact collinear C
        for idx, token in enumerate(commands):
            if token.startswith("L "):
                lx, ly = (float(v) for v in token[2:].split())
                mx, my = subpath_start
                c1x, c1y = mx + (lx - mx) / 3.0, my + (ly - my) / 3.0
                c2x, c2y = mx + 2.0 * (lx - mx) / 3.0, my + 2.0 * (ly - my) / 3.0
                commands[idx] = f"C {c1x:.2f} {c1y:.2f} {c2x:.2f} {c2y:.2f} {lx:.2f} {ly:.2f}"
                break
    if commands[-1] != "Z":
        commands.append("Z")
    return " ".join(commands)


def _merge_anchors(style: str, overrides: dict[str, Any] | None) -> dict[str, Any]:
    template = DEFAULT_ANCHORS_VERTICAL if style == "cinnabar_vertical" else DEFAULT_ANCHORS_HORIZONTAL
    merged: dict[str, Any] = {
        "canvasWidth": COVER_WIDTH,
        "canvasHeight": COVER_HEIGHT,
        "titleDirection": template["titleDirection"],
        "titleOrientation": template["titleOrientation"],
        "inkMode": template["inkMode"],
    }
    for zone_key in ("headerZone", "titleZone", "subtitleZone", "teamPlaqueZone"):
        base_zone = dict(template[zone_key])
        if isinstance(overrides, dict) and isinstance(overrides.get(zone_key), dict):
            for k in ("x", "y", "width", "height"):
                val = overrides[zone_key].get(k)
                if isinstance(val, (int, float)) and math.isfinite(val):
                    base_zone[k] = int(round(val))
        merged[zone_key] = base_zone
    if isinstance(overrides, dict):
        if overrides.get("inkMode") in ("dark_on_light", "light_on_dark"):
            merged["inkMode"] = overrides["inkMode"]
        if overrides.get("titleDirection") in ("horizontal", "vertical", "staggered"):
            merged["titleDirection"] = overrides["titleDirection"]
            merged["titleOrientation"] = overrides["titleDirection"]
    return merged


def _horizontal_glyph_positions(chars: list[str], center_x: float, base_step: float) -> list[float]:
    """Tightens optical kerning around quote ornaments so paired marks hug the highlighted character naturally."""
    if not chars:
        return []
    advances: list[float] = []
    for i in range(len(chars) - 1):
        cur_is_br = bool(_CORNER_BRACKET_RE.match(chars[i]))
        nxt_is_br = bool(_CORNER_BRACKET_RE.match(chars[i + 1]))
        if cur_is_br or nxt_is_br:
            advances.append(base_step * 0.72)
        else:
            advances.append(base_step)
    total_span = sum(advances)
    xs = [center_x - 0.5 * total_span]
    for adv in advances:
        xs.append(xs[-1] + adv)
    return xs


def generate_vector_art_typography_svg(
    spec: dict[str, Any] | None = None,
    *,
    title: str | None = None,
    subtitle: str | None = None,
    competition_name: str | None = None,
    team_name: str | None = None,
    typography_style: str | None = None,
    anchors: dict[str, Any] | None = None,
    ink_mode: str | None = None,
    preset_theme: str | None = None,
    extracted_palette: dict[str, Any] | None = None,
    force_text_fallback: bool = False,
) -> str:
    """Generates a 100% transparent-background (`1000x1414`, zero full-canvas `<rect>`) true Bézier calligraphy SVG."""
    payload = dict(spec) if isinstance(spec, dict) else {}
    theme = _extract_preset_short_id(preset_theme or payload.get("presetTheme") or payload.get("preset"))
    raw_style = (
        typography_style
        or payload.get("typographyStyle")
        or payload.get("style")
        or (PRESET_PROFILES[theme]["defaultStyle"] if theme else "sculpted_orbit")
    )
    if raw_style not in COVER_TYPOGRAPHY_STYLES:
        raise ApiError(422, "invalid_typography_style", "暂不支持所选的封面字体版式风格。")
    style: str = raw_style

    raw_title = title if title is not None else (payload.get("title") or payload.get("mainTitle") or "")
    raw_sub = subtitle if subtitle is not None else (payload.get("subtitle") or "")
    raw_comp = competition_name if competition_name is not None else payload.get("competitionName")
    raw_team = team_name if team_name is not None else payload.get("teamName")

    norm = normalize_cover_text_spec({
        "title": raw_title or DEFAULT_FALLBACK_COVER_TITLE,
        "subtitle": raw_sub,
        "competitionName": raw_comp or DEFAULT_COVER_COMPETITION_NAME,
        "teamName": raw_team or derive_blind_safe_team_name(str(raw_title or "")),
        "titleLayout": "vertical" if style == "cinnabar_vertical" else "horizontal",
    })

    default_preset_anchors = PRESET_PROFILES[theme] if theme and PRESET_PROFILES[theme]["titleDirection"] == ("vertical" if style == "cinnabar_vertical" else PRESET_PROFILES[theme]["titleDirection"]) else None
    resolved_anchors = _merge_anchors(style, anchors or payload.get("anchors") or default_preset_anchors)
    resolved_ink = ink_mode or payload.get("inkMode") or resolved_anchors["inkMode"]
    light_ink = resolved_ink == "light_on_dark"

    hero_lead, hero_hi_idx, topic_lines = _split_hero_and_subtitle(norm["mainTitle"], norm["subtitle"])
    font_path = None if force_text_fallback else _resolve_font_file(STYLE_FONT_CANDIDATES[style])
    ext_pal = extracted_palette or (
        payload.get("extractedPalette") if isinstance(payload.get("extractedPalette"), dict) else None
    )

    # Theme-adapted ink & highlight stops across presets (`f, e, c, b, d, a`) and extracted open palettes
    if light_ink or theme == "d":
        primary_ink = str(ext_pal.get("primaryHex")) if (ext_pal and not theme and ext_pal.get("primaryHex")) else "#FBE9C0"
        secondary_ink = "#14233C"  # dark navy text inside warm cream subtitle capsule!
        gold_ink = str(ext_pal.get("accentHex")) if (ext_pal and not theme and ext_pal.get("accentHex")) else "#F5CA7B"
        cinnabar_ink = gold_ink if (ext_pal and not theme) else "#F0A84B"
        main_grad_stops = ("#FFFDF8", primary_ink)
        hi_grad_stops = ("#FFE7A0", gold_ink, "#C47B1E")
        glow_color = "#F59E0B"
        glow_opacity = 0.24
    elif theme == "b":
        # Swiss Cobalt Blueprint: deep cobalt + vibrant coral-orange highlight
        primary_ink = "#0D2B5E"
        secondary_ink = "#102C5C"
        gold_ink = "#E66434"
        cinnabar_ink = "#D85326"
        main_grad_stops = ("#163D7A", "#091E44")
        hi_grad_stops = ("#F07142", "#DC5426", "#B63A14")
        glow_color = "#0F172A"
        glow_opacity = 0.0
    elif theme == "e":
        # 35mm Warm Film Editorial: caramel-espresso ink + antique bronze highlight
        primary_ink = "#241912"
        secondary_ink = "#2B1F17"
        gold_ink = "#9E733B"
        cinnabar_ink = "#8C5A2B"
        main_grad_stops = ("#2E2017", "#140D09")
        hi_grad_stops = ("#B8884A", "#936730", "#68441C")
        glow_color = "#1C130D"
        glow_opacity = 0.0
    elif theme == "a":
        # Song Xuan Celadon-Gold: deep pine-soot + cinnabar-gold highlight
        primary_ink = "#162E2D"
        secondary_ink = "#163331"
        gold_ink = "#C58D44"
        cinnabar_ink = "#B8432A"
        main_grad_stops = ("#1F3B39", "#0D1B1B")
        hi_grad_stops = ("#D4783E", "#BA4A2B", "#8F2B1D")
        glow_color = "#0F2022"
        glow_opacity = 0.0
    else:
        primary_ink = str(ext_pal.get("primaryHex")) if (ext_pal and ext_pal.get("primaryHex")) else "#182433"
        secondary_ink = primary_ink if (ext_pal and ext_pal.get("primaryHex")) else "#223042"
        gold_ink = str(ext_pal.get("accentHex")) if (ext_pal and ext_pal.get("accentHex")) else "#C59B57"
        cinnabar_ink = gold_ink if (ext_pal and ext_pal.get("accentHex")) else "#A62C24"
        main_grad_stops = (primary_ink, "#121F30")
        hi_grad_stops = (gold_ink, "#B58942", "#7B5722")
        glow_color = "#0F172A"
        glow_opacity = 0.0

    hz = resolved_anchors["headerZone"]
    tz = resolved_anchors["titleZone"]
    sz = resolved_anchors["subtitleZone"]
    pz = resolved_anchors["teamPlaqueZone"]

    header_cx = int(round(hz["x"] + hz["width"] * 0.5))
    header_y = int(round(hz["y"] + 34))

    def emit_glyph(
        ch: str,
        gx: float,
        gy: float,
        em_px: float,
        fill_ref: str,
        *,
        is_highlight: bool = False,
        shadow_dx: float = 0.0,
        shadow_dy: float = 0.0,
        shadow_color: str = "#0F172A",
        shadow_opacity: float = 0.0,
        echo_dx: float = 0.0,
        echo_dy: float = 0.0,
        echo_stroke: str = "",
    ) -> str:
        d_str = _glyph_to_cubic_bezier_d(ch, font_path, em_px, gx, gy) if font_path else None
        role_attr = ' data-role="highlight-glyph"' if is_highlight else ""
        if d_str:
            parts: list[str] = []
            if glow_opacity > 0.01:
                gl_d = _glyph_to_cubic_bezier_d(ch, font_path, em_px * 1.045, gx, gy)
                if gl_d:
                    parts.append(
                        f'<path d="{gl_d}" fill="{glow_color}" fill-opacity="{glow_opacity:.2f}"/>'
                    )
            if echo_stroke and not light_ink and theme != "e":
                echo_d = _glyph_to_cubic_bezier_d(ch, font_path, em_px * 1.03, gx + echo_dx, gy + echo_dy)
                if echo_d:
                    parts.append(
                        f'<path d="{echo_d}" fill="none" stroke="{echo_stroke}" stroke-width="2.2" stroke-opacity="0.34"/>'
                    )
            if shadow_opacity > 0.01:
                sh_d = _glyph_to_cubic_bezier_d(ch, font_path, em_px, gx + shadow_dx, gy + shadow_dy)
                if sh_d:
                    parts.append(
                        f'<path d="{sh_d}" fill="{shadow_color}" fill-opacity="{shadow_opacity:.2f}"/>'
                    )
            parts.append(
                f'<path d="{d_str}" fill="{fill_ref}" data-glyph="{xml_escape(ch)}"{role_attr}/>'
            )
            return "\n      ".join(parts)
        return (
            f'<text x="{gx:.1f}" y="{gy + em_px * 0.34:.1f}" text-anchor="middle" '
            f'font-family="{CALLIGRAPHY_FONT_STACK}" font-size="{int(round(em_px))}" font-weight="700" '
            f'fill="{fill_ref}" data-glyph="{xml_escape(ch)}"{role_attr}>{xml_escape(ch)}</text>'
        )

    body_blocks: list[str] = []

    if style == "cinnabar_vertical":
        v_chars = list(_VERTICAL_QUOTE_STRIP_RE.sub("", hero_lead))
        if not v_chars:
            v_chars = list("银发智守")
        clean_hi_char = hero_lead[hero_hi_idx] if 0 <= hero_hi_idx < len(hero_lead) else v_chars[-2]
        v_hi_idx = v_chars.index(clean_hi_char) if clean_hi_char in v_chars else min(2, len(v_chars) - 1)

        col_x = tz["x"] + tz["width"] * 0.56
        top_cy = tz["y"] + 66.0
        step_y = min(136.0, max(92.0, (tz["height"] - 110.0) / max(1, len(v_chars) - 1))) if len(v_chars) > 1 else 132.0

        glyph_markup: list[str] = []
        for idx, ch in enumerate(v_chars):
            sway_x = (-6.0 if idx % 2 == 0 else 7.0) if len(v_chars) >= 3 else 0.0
            is_hi = idx == v_hi_idx
            em = 136.0 if idx == 0 else (132.0 if is_hi else 124.0)
            fill_val = "url(#cinnabarAccentGrad)" if is_hi else ("#F8FAFC" if light_ink else "url(#sumiInkGrad)")
            glyph_markup.append(
                emit_glyph(
                    ch,
                    col_x + sway_x,
                    top_cy + idx * step_y,
                    em,
                    fill_val,
                    is_highlight=is_hi,
                    shadow_dx=2.0,
                    shadow_dy=3.0,
                    shadow_color="#1A1210",
                    shadow_opacity=0.10 if not light_ink else 0.24,
                )
            )

        last_y = top_cy + max(0, len(v_chars) - 1) * step_y
        seal_x = int(round(col_x - 134))
        seal_y = int(round(last_y - 34))
        seal_fp = None if force_text_fallback else (_resolve_font_file(SEAL_FONT_CANDIDATES) or font_path)
        seal_glyph_nodes: list[str] = []
        for s_ch, sx_off, sy_off in (("实", 16.5, 19.5), ("证", 39.5, 19.5), ("调", 16.5, 44.5), ("研", 39.5, 44.5)):
            sd = _glyph_to_cubic_bezier_d(s_ch, seal_fp, 19.5, seal_x + sx_off, seal_y + sy_off) if seal_fp else None
            if sd:
                seal_glyph_nodes.append(f'    <path d="{sd}" fill="#FFFDF9"/>')
            else:
                seal_glyph_nodes.append(
                    f'    <text x="{seal_x + sx_off:.1f}" y="{seal_y + sy_off + 6.5:.1f}" text-anchor="middle" '
                    f'font-family="{KAITI_FONT_STACK}" font-size="18" font-weight="700" fill="#FFFDF9">{s_ch}</text>'
                )

        sub_left_x = sz["x"] + 22
        sub_base_y = sz["y"] + 42
        sub_lines_svg = "\n    ".join(
            f'<text x="{sub_left_x}" y="{sub_base_y + idx * 44}" text-anchor="start" '
            f'font-family="{KAITI_FONT_STACK}" font-size="30" font-weight="600" letter-spacing="1.2" '
            f'fill="{secondary_ink}">{xml_escape(line)}</text>'
            for idx, line in enumerate(topic_lines)
        )
        bar_h = max(56, len(topic_lines) * 44)

        body_blocks.append(f'  <g id="cover-hero-title" role="heading" aria-label="{xml_escape(hero_lead)}">')
        body_blocks.append("    " + "\n    ".join(glyph_markup))
        body_blocks.append("  </g>")
        body_blocks.append(
            f'  <g id="cover-cinnabar-seal">\n'
            f'    <rect x="{seal_x}" y="{seal_y}" width="56" height="64" rx="4" fill="none" stroke="{cinnabar_ink}" stroke-width="2.6"/>\n'
            f'    <rect x="{seal_x + 4}" y="{seal_y + 4}" width="48" height="56" rx="2.5" fill="{cinnabar_ink}" fill-opacity="0.92"/>\n'
            + "\n".join(seal_glyph_nodes)
            + "\n  </g>"
        )
        if topic_lines:
            body_blocks.append(
                f'  <rect x="{sz["x"]}" y="{sz["y"] + 8}" width="5" height="{bar_h}" rx="2" fill="{cinnabar_ink}"/>\n'
                f'  {sub_lines_svg}'
            )

    elif style == "xuan_calligraphy":
        chars = list(hero_lead)
        cx = tz["x"] + tz["width"] * 0.5
        cy = tz["y"] + tz["height"] * 0.54
        step = 118.0 if len(chars) <= 6 else max(82.0, 720.0 / len(chars))
        xs = _horizontal_glyph_positions(chars, cx, step)

        glyph_markup = []
        halo_svg = ""
        for idx, ch in enumerate(chars):
            is_br = bool(_CORNER_BRACKET_RE.match(ch))
            is_hi = idx == hero_hi_idx and not is_br
            dy = -7.0 if is_hi else (5.0 if idx % 2 == 1 and not is_br else 0.0)
            em = 84.0 if is_br else (138.0 if is_hi else 124.0)
            fill_val = (
                "url(#cinnabarGoldGrad)"
                if is_hi
                else (gold_ink if is_br else ("#F8FAFC" if light_ink else "url(#pineInkGrad)"))
            )
            if is_hi:
                halo_svg = (
                    f'  <circle cx="{xs[idx]:.1f}" cy="{cy + dy:.1f}" r="74" fill="url(#warmHaloGrad)"/>'
                )
            glyph_markup.append(
                emit_glyph(
                    ch,
                    xs[idx],
                    cy + dy,
                    em,
                    fill_val,
                    is_highlight=is_hi,
                    shadow_dx=1.8,
                    shadow_dy=3.0,
                    shadow_opacity=0.10 if not light_ink else 0.24,
                )
            )

        if halo_svg:
            body_blocks.append(halo_svg)
        body_blocks.append(f'  <g id="cover-hero-title" role="heading" aria-label="{xml_escape(hero_lead)}">')
        body_blocks.append("    " + "\n    ".join(glyph_markup))
        body_blocks.append("  </g>")
        if topic_lines:
            sub_h = max(88, len(topic_lines) * 42 + 24)
            if light_ink:
                body_blocks.append(
                    f'  <rect x="148" y="{sz["y"]}" width="704" height="{sub_h}" rx="{sub_h // 2}" '
                    f'fill="#FAF0D7" fill-opacity="0.94" stroke="#D4A14E" stroke-opacity="0.85" stroke-width="1.8" stroke-dasharray="7 5"/>'
                )
            else:
                body_blocks.append(
                    f'  <rect x="132" y="{sz["y"]}" width="736" height="{sub_h}" rx="12" '
                    f'fill="url(#celadonBandGrad)" stroke="#0F766E" stroke-opacity="0.28" stroke-width="1.3"/>'
                )
            for idx, line in enumerate(topic_lines):
                body_blocks.append(
                    f'  <text x="500" y="{sz["y"] + 40 + idx * 42}" text-anchor="middle" '
                    f'font-family="{KAITI_FONT_STACK}" font-size="30" font-weight="600" letter-spacing="1.3" '
                    f'fill="{secondary_ink}">{xml_escape(line)}</text>'
                )

    elif style == "staggered_poster":
        chars = list(hero_lead)
        cx = tz["x"] + tz["width"] * 0.5
        cy = tz["y"] + tz["height"] * 0.54
        step = 116.0 if len(chars) <= 6 else max(80.0, 720.0 / len(chars))
        xs = _horizontal_glyph_positions(chars, cx, step)

        if light_ink and 0 <= hero_hi_idx < len(chars):
            body_blocks.append(
                f'  <circle cx="{xs[hero_hi_idx]:.1f}" cy="{cy:.1f}" r="88" fill="url(#warmHaloGrad)"/>'
            )

        glyph_markup = []
        for idx, ch in enumerate(chars):
            is_br = bool(_CORNER_BRACKET_RE.match(ch))
            is_hi = idx == hero_hi_idx and not is_br
            stair_dy = 0.0 if is_br else ((-6.0 if idx % 2 == 0 else 6.0) if theme in ("d", "e") else (-14.0 if idx % 2 == 0 else 13.0))
            em = 82.0 if is_br else (140.0 if is_hi else 122.0)
            fill_val = "url(#sculptedGoldGrad)" if is_hi else (gold_ink if is_br else "url(#sculptedNavyGrad)")
            glyph_markup.append(
                emit_glyph(
                    ch,
                    xs[idx],
                    cy + stair_dy,
                    em,
                    fill_val,
                    is_highlight=is_hi,
                    shadow_dx=2.5 if light_ink else 2.2,
                    shadow_dy=4.0 if light_ink else 3.5,
                    shadow_color="#050C1A" if light_ink else "#0F172A",
                    shadow_opacity=0.45 if light_ink else 0.12,
                    echo_dx=7.0 if not is_br else 0.0,
                    echo_dy=-6.0 if not is_br else 0.0,
                    echo_stroke=gold_ink if not is_br else "",
                )
            )

        body_blocks.append(f'  <g id="cover-hero-title" role="heading" aria-label="{xml_escape(hero_lead)}">')
        body_blocks.append("    " + "\n    ".join(glyph_markup))
        body_blocks.append("  </g>")
        if topic_lines:
            sub_h = max(90, len(topic_lines) * 42 + 24)
            rx_val = sub_h // 2
            if light_ink:
                body_blocks.append(
                    f'  <rect x="148" y="{sz["y"]}" width="704" height="{sub_h}" rx="{rx_val}" '
                    f'fill="#FAF0D7" fill-opacity="0.94" stroke="#D4A14E" stroke-opacity="0.88" '
                    f'stroke-width="2.0" stroke-dasharray="8 5"/>'
                )
            elif theme == "e":
                # Clean warm magazine editorial typography without pill clutter
                body_blocks.append(
                    f'  <line x1="220" y1="{sz["y"] + 2}" x2="780" y2="{sz["y"] + 2}" stroke="{gold_ink}" stroke-opacity="0.45" stroke-width="1.2"/>'
                )
            else:
                body_blocks.append(
                    f'  <rect x="142" y="{sz["y"]}" width="716" height="{sub_h}" rx="{rx_val}" '
                    f'fill="#FFFFFF" fill-opacity="0.76" stroke="#0F766E" stroke-opacity="0.46" '
                    f'stroke-width="1.8" stroke-dasharray="7 5"/>'
                )
            for idx, line in enumerate(topic_lines):
                body_blocks.append(
                    f'  <text x="500" y="{sz["y"] + 40 + idx * 42}" text-anchor="middle" '
                    f'font-family="{KAITI_FONT_STACK}" font-size="30" font-weight="600" letter-spacing="1.2" '
                    f'fill="{secondary_ink}">{xml_escape(line)}</text>'
                )

    elif style == "editorial_serif":
        # Open publication serif hierarchy: refined Song/Zhongsong typography + double hairline rule + high-contrast pocket alignment
        chars = list(hero_lead)
        cx = tz["x"] + tz["width"] * 0.5
        cy = tz["y"] + tz["height"] * 0.56
        step = 114.0 if len(chars) <= 6 else max(80.0, (tz["width"] - 64.0) / max(1, len(chars)))
        xs = _horizontal_glyph_positions(chars, cx, step)

        rule_y = tz["y"] + 18
        body_blocks.append(
            f'  <line x1="164" y1="{rule_y}" x2="836" y2="{rule_y}" stroke="{gold_ink}" stroke-opacity="0.72" stroke-width="1.4"/>'
        )
        body_blocks.append(f'  <circle cx="{cx:.1f}" cy="{rule_y}" r="3.5" fill="{gold_ink}"/>')

        glyph_markup = []
        for idx, ch in enumerate(chars):
            is_br = bool(_CORNER_BRACKET_RE.match(ch))
            is_hi = idx == hero_hi_idx and not is_br
            em = 82.0 if is_br else (126.0 if is_hi else 116.0)
            fill_val = (
                "url(#cinnabarGoldGrad)"
                if is_hi
                else (gold_ink if is_br else ("#FFF8EC" if light_ink else primary_ink))
            )
            glyph_markup.append(
                emit_glyph(
                    ch,
                    xs[idx],
                    cy,
                    em,
                    fill_val,
                    is_highlight=is_hi,
                    shadow_dx=1.5,
                    shadow_dy=2.6,
                    shadow_color="#09111E",
                    shadow_opacity=0.28 if light_ink else 0.08,
                )
            )
        body_blocks.append(f'  <g id="cover-hero-title" role="heading" aria-label="{xml_escape(hero_lead)}">')
        body_blocks.append("    " + "\n    ".join(glyph_markup))
        body_blocks.append("  </g>")
        if topic_lines:
            sub_top_y = sz["y"] + 12
            body_blocks.append(
                f'  <line x1="210" y1="{sub_top_y - 10}" x2="790" y2="{sub_top_y - 10}" stroke="{gold_ink}" stroke-opacity="0.45" stroke-width="1.1"/>'
            )
            direct_sub = "#F8EFE0" if light_ink else primary_ink
            for idx, line in enumerate(topic_lines):
                body_blocks.append(
                    f'  <text x="{int(round(cx))}" y="{sub_top_y + 34 + idx * 42}" text-anchor="middle" '
                    f'font-family="{EDITORIAL_SERIF_FONT_STACK}" font-size="29" font-weight="600" letter-spacing="1.5" '
                    f'fill="{direct_sub}">{xml_escape(line)}</text>'
                )

    elif style == "modern_geometric":
        # Swiss modern geometric sans hierarchy: crisp eyebrow bar + tight grotesque glyphs + vertical rule subtitle
        chars = list(hero_lead)
        cx = tz["x"] + tz["width"] * 0.5
        cy = tz["y"] + tz["height"] * 0.56
        step = 112.0 if len(chars) <= 6 else max(78.0, (tz["width"] - 64.0) / max(1, len(chars)))
        xs = _horizontal_glyph_positions(chars, cx, step)

        accent_bar = gold_ink if light_ink else "#0F766E"
        body_blocks.append(
            f'  <rect x="{int(round(cx - 110))}" y="{tz["y"] + 8}" width="220" height="6" rx="3" fill="{accent_bar}"/>'
        )
        glyph_markup = []
        for idx, ch in enumerate(chars):
            is_br = bool(_CORNER_BRACKET_RE.match(ch))
            is_hi = idx == hero_hi_idx and not is_br
            em = 80.0 if is_br else (122.0 if is_hi else 112.0)
            fill_val = (
                accent_bar
                if is_hi
                else (gold_ink if is_br else ("#F8FAFC" if light_ink else primary_ink))
            )
            glyph_markup.append(
                emit_glyph(
                    ch,
                    xs[idx],
                    cy,
                    em,
                    fill_val,
                    is_highlight=is_hi,
                    shadow_dx=1.2,
                    shadow_dy=2.2,
                    shadow_color="#09111E",
                    shadow_opacity=0.22 if light_ink else 0.06,
                )
            )
        body_blocks.append(f'  <g id="cover-hero-title" role="heading" aria-label="{xml_escape(hero_lead)}">')
        body_blocks.append("    " + "\n    ".join(glyph_markup))
        body_blocks.append("  </g>")
        if topic_lines:
            sub_x = max(112, sz["x"] + 20)
            sub_top_y = sz["y"] + 38
            bar_h = max(46, len(topic_lines) * 42 + 4)
            body_blocks.append(
                f'  <rect x="{sub_x - 18}" y="{sz["y"] + 12}" width="6" height="{bar_h}" rx="2" fill="{accent_bar}"/>'
            )
            direct_sub = "#F8EFE0" if light_ink else primary_ink
            for idx, line in enumerate(topic_lines):
                body_blocks.append(
                    f'  <text x="{sub_x}" y="{sub_top_y + idx * 42}" text-anchor="start" '
                    f'font-family="{MODERN_GEOMETRIC_FONT_STACK}" font-size="28" font-weight="600" letter-spacing="1.0" '
                    f'fill="{direct_sub}">{xml_escape(line)}</text>'
                )

    else:
        # Default flagship `sculpted_orbit` (modeled on cover-cand-f: sculpted navy-gold calligraphy + golden orbital ellipse)
        chars = list(hero_lead)
        cx = tz["x"] + tz["width"] * 0.5
        cy = tz["y"] + tz["height"] * 0.56
        step = 122.0 if len(chars) <= 6 else max(84.0, 730.0 / len(chars))
        xs = _horizontal_glyph_positions(chars, cx, step)

        orbit_cx = cx + 18.0
        orbit_cy = cy - 4.0
        orb_rx, orb_ry = 248.0, 94.0
        orb_rad = math.radians(-18.0)
        cos_o, sin_o = math.cos(orb_rad), math.sin(orb_rad)
        kappa = 0.55228475

        def orb_pt(ux: float, uy: float) -> str:
            px = orbit_cx + ux * cos_o - uy * sin_o
            py = orbit_cy + ux * sin_o + uy * cos_o
            return f"{px:.2f} {py:.2f}"

        # Exact 3D split orbital ring: upper-back half behind glyphs, lower-front half sweeping across highlight glyph
        back_orbit_d = (
            f"M {orb_pt(-orb_rx, 0.0)} "
            f"C {orb_pt(-orb_rx, -orb_ry * kappa)} {orb_pt(-orb_rx * kappa, -orb_ry)} {orb_pt(0.0, -orb_ry)} "
            f"C {orb_pt(orb_rx * kappa, -orb_ry)} {orb_pt(orb_rx, -orb_ry * kappa)} {orb_pt(orb_rx, 0.0)}"
        )
        front_orbit_d = (
            f"M {orb_pt(orb_rx, 0.0)} "
            f"C {orb_pt(orb_rx, orb_ry * kappa)} {orb_pt(orb_rx * kappa, orb_ry)} {orb_pt(0.0, orb_ry)} "
            f"C {orb_pt(-orb_rx * kappa, orb_ry)} {orb_pt(-orb_rx, orb_ry * kappa)} {orb_pt(-orb_rx, 0.0)}"
        )
        body_blocks.append(
            f'  <path d="{back_orbit_d}" fill="none" stroke="{gold_ink}" stroke-width="2.0" stroke-opacity="0.58" stroke-linecap="round"/>'
        )

        glyph_markup = []
        for idx, ch in enumerate(chars):
            is_br = bool(_CORNER_BRACKET_RE.match(ch))
            is_hi = idx == hero_hi_idx and not is_br
            gentle_dy = -4.0 if is_hi else (2.0 if idx in (1, len(chars) - 2) and not is_br else 0.0)
            em = 84.0 if is_br else (136.0 if is_hi else 124.0)
            fill_val = (
                "url(#sculptedGoldGrad)"
                if is_hi
                else (gold_ink if is_br else ("#F8FAFC" if light_ink else "url(#sculptedNavyGrad)"))
            )
            glyph_markup.append(
                emit_glyph(
                    ch,
                    xs[idx],
                    cy + gentle_dy,
                    em,
                    fill_val,
                    is_highlight=is_hi,
                    shadow_dx=2.0,
                    shadow_dy=3.5,
                    shadow_color="#0F172A",
                    shadow_opacity=0.11 if not light_ink else 0.25,
                )
            )

        body_blocks.append(f'  <g id="cover-hero-title" role="heading" aria-label="{xml_escape(hero_lead)}">')
        body_blocks.append("    " + "\n    ".join(glyph_markup))
        body_blocks.append("  </g>")
        body_blocks.append(
            f'  <path d="{front_orbit_d}" fill="none" stroke="url(#orbitArcGrad)" stroke-width="2.6" stroke-linecap="round"/>'
        )

        if topic_lines:
            if light_ink:
                sub_h = max(90, len(topic_lines) * 42 + 24)
                body_blocks.append(
                    f'  <rect x="148" y="{sz["y"]}" width="704" height="{sub_h}" rx="{sub_h // 2}" '
                    f'fill="#FAF0D7" fill-opacity="0.94" stroke="#D4A14E" stroke-opacity="0.88" stroke-width="1.8" stroke-dasharray="7 5"/>'
                )
                for idx, line in enumerate(topic_lines):
                    body_blocks.append(
                        f'  <text x="500" y="{sz["y"] + 40 + idx * 42}" text-anchor="middle" '
                        f'font-family="{KAITI_FONT_STACK}" font-size="30" font-weight="600" letter-spacing="1.2" '
                        f'fill="{secondary_ink}">{xml_escape(line)}</text>'
                    )
            elif theme == "b":
                # Swiss Cobalt centered architectural subtitle
                for idx, line in enumerate(topic_lines):
                    body_blocks.append(
                        f'  <text x="500" y="{sz["y"] + 38 + idx * 44}" text-anchor="middle" '
                        f'font-family="{KAITI_FONT_STACK}" font-size="31" font-weight="600" letter-spacing="1.3" '
                        f'fill="{secondary_ink}">{xml_escape(line)}</text>'
                    )
            else:
                bar_h = max(62, len(topic_lines) * 45 + 6)
                sub_left_x = sz["x"] + 24
                sub_start_y = sz["y"] + 40
                body_blocks.append(
                    f'  <rect x="{sz["x"]}" y="{sz["y"] + 8}" width="6.5" height="{bar_h}" rx="2" fill="url(#sculptedGoldGrad)"/>'
                )
                for idx, line in enumerate(topic_lines):
                    body_blocks.append(
                        f'  <text x="{sub_left_x}" y="{sub_start_y + idx * 45}" text-anchor="start" '
                        f'font-family="{KAITI_FONT_STACK}" font-size="31" font-weight="600" letter-spacing="1.2" '
                        f'fill="{secondary_ink}">{xml_escape(line)}</text>'
                    )

    header_decor: list[str] = []
    if theme == "e":
        header_decor.append(
            f'  <line x1="76" y1="{header_y + 18}" x2="924" y2="{header_y + 18}" stroke="{primary_ink}" stroke-opacity="0.32" stroke-width="1.1"/>'
        )
    elif theme == "b":
        header_decor.append(
            f'  <line x1="68" y1="{header_y + 16}" x2="932" y2="{header_y + 16}" stroke="#0D2B5E" stroke-opacity="0.45" stroke-width="1.4"/>'
        )
        header_decor.append(
            f'  <line x1="68" y1="{header_y + 21}" x2="932" y2="{header_y + 21}" stroke="#0D2B5E" stroke-opacity="0.22" stroke-width="0.8"/>'
        )

    plaque_cx = int(round(pz["x"] + pz["width"] * 0.5))
    if light_ink or theme == "d":
        # Warm cream-parchment team plaque (`暖米底栏队名牌`) on dark indigo backdrop
        plaque_fill = "#FAF0D7"
        plaque_fill_op = "0.95"
        plaque_text_fill = "#14233C"
        plaque_outer_stroke = "#D8A44E"
        plaque_inner_stroke = "#B6802C"
    elif theme == "b":
        plaque_fill = "#0D2754"
        plaque_fill_op = "0.94"
        plaque_text_fill = "#F8FAFC"
        plaque_outer_stroke = "#1E4380"
        plaque_inner_stroke = "#E66434"
    elif theme == "a":
        plaque_fill = "#FAF7F0"
        plaque_fill_op = "0.86"
        plaque_text_fill = "#14302E"
        plaque_outer_stroke = "#1B4B47"
        plaque_inner_stroke = "#C58D44"
    else:
        plaque_fill = "#FAF7F1"
        plaque_fill_op = "0.82"
        plaque_text_fill = "#1E293B"
        plaque_outer_stroke = "#9E2B22" if style == "cinnabar_vertical" else "#9A8B70"
        plaque_inner_stroke = gold_ink

    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {COVER_WIDTH} {COVER_HEIGHT}" '
        f'width="{COVER_WIDTH}" height="{COVER_HEIGHT}" fill="none" '
        f'data-cover-layer="vector-typography" data-typography-style="{style}" data-ink-mode="{resolved_ink}">',
        "  <defs>",
        '    <linearGradient id="sculptedNavyGrad" x1="0%" y1="0%" x2="0%" y2="100%">',
        f'      <stop offset="0%" stop-color="{main_grad_stops[0]}"/>',
        f'      <stop offset="100%" stop-color="{main_grad_stops[1]}"/>',
        "    </linearGradient>",
        '    <linearGradient id="sculptedGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
        f'      <stop offset="0%" stop-color="{hi_grad_stops[0]}"/>',
        f'      <stop offset="55%" stop-color="{hi_grad_stops[1]}"/>',
        f'      <stop offset="100%" stop-color="{hi_grad_stops[2]}"/>',
        "    </linearGradient>",
        '    <linearGradient id="sumiInkGrad" x1="0%" y1="0%" x2="0%" y2="100%">',
        '      <stop offset="0%" stop-color="#2B2523"/>',
        '      <stop offset="100%" stop-color="#110F0E"/>',
        "    </linearGradient>",
        '    <linearGradient id="pineInkGrad" x1="0%" y1="0%" x2="0%" y2="100%">',
        f'      <stop offset="0%" stop-color="{main_grad_stops[0] if theme == "a" else "#1D3B3A"}"/>',
        f'      <stop offset="100%" stop-color="{main_grad_stops[1] if theme == "a" else "#0F2022"}"/>',
        "    </linearGradient>",
        '    <linearGradient id="cinnabarAccentGrad" x1="0%" y1="0%" x2="0%" y2="100%">',
        '      <stop offset="0%" stop-color="#C23A2B"/>',
        '      <stop offset="100%" stop-color="#7A1C18"/>',
        "    </linearGradient>",
        '    <linearGradient id="cinnabarGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">',
        f'      <stop offset="0%" stop-color="{hi_grad_stops[0] if light_ink else "#C84030"}"/>',
        f'      <stop offset="100%" stop-color="{hi_grad_stops[1] if light_ink else "#B6802C"}"/>',
        "    </linearGradient>",
        '    <linearGradient id="orbitArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">',
        f'      <stop offset="0%" stop-color="{gold_ink}" stop-opacity="0.22"/>',
        f'      <stop offset="52%" stop-color="{gold_ink}" stop-opacity="0.86"/>',
        f'      <stop offset="100%" stop-color="{gold_ink}" stop-opacity="0.28"/>',
        "    </linearGradient>",
        '    <radialGradient id="warmHaloGrad" cx="50%" cy="50%" r="50%">',
        f'      <stop offset="0%" stop-color="{"#F6BD60" if light_ink else "#E5B66B"}" stop-opacity="{"0.42" if light_ink else "0.34"}"/>',
        '      <stop offset="100%" stop-color="#E5B66B" stop-opacity="0"/>',
        "    </radialGradient>",
        '    <linearGradient id="celadonBandGrad" x1="0%" y1="0%" x2="100%" y2="0%">',
        '      <stop offset="0%" stop-color="#0F766E" stop-opacity="0.03"/>',
        '      <stop offset="50%" stop-color="#0F766E" stop-opacity="0.14"/>',
        '      <stop offset="100%" stop-color="#0F766E" stop-opacity="0.03"/>',
        "    </linearGradient>",
        "  </defs>",
        f'  <text id="cover-competition-header" x="{header_cx}" y="{header_y}" text-anchor="middle" '
        f'font-family="{EDITORIAL_HEADER_STACK}" font-size="27" font-weight="600" letter-spacing="1.1" '
        f'fill="{primary_ink}">{xml_escape(norm["competitionName"])}</text>',
        *header_decor,
        *body_blocks,
        '  <g id="cover-team-plaque" data-layer="team-plaque">',
        f'    <rect x="{pz["x"]}" y="{pz["y"]}" width="{pz["width"]}" height="{pz["height"]}" rx="3" '
        f'fill="{plaque_fill}" fill-opacity="{plaque_fill_op}" stroke="{plaque_outer_stroke}" stroke-opacity="0.72" stroke-width="1.5"/>',
        f'    <rect x="{pz["x"] + 5}" y="{pz["y"] + 5}" width="{pz["width"] - 10}" height="{pz["height"] - 10}" rx="1.5" '
        f'fill="none" stroke="{plaque_inner_stroke}" stroke-opacity="0.58" stroke-width="0.9"/>',
        f'    <text x="{plaque_cx}" y="{pz["y"] + 39}" text-anchor="middle" '
        f'font-family="{KAITI_FONT_STACK}" font-size="25" font-weight="600" letter-spacing="1.0" '
        f'fill="{plaque_text_fill}">{xml_escape(norm["teamLabel"])}</text>',
        "  </g>",
        "</svg>",
    ])


def _parse_svg_d_to_mpl_path(d_attr: str) -> MplPath | None:
    tokens = _SVG_NUM_TOKEN_RE.findall(d_attr or "")
    if not tokens:
        return None
    verts: list[tuple[float, float]] = []
    codes: list[int] = []
    idx = 0
    cmd = ""
    cx, cy = 0.0, 0.0
    sx, sy = 0.0, 0.0

    def next_float() -> float:
        nonlocal idx
        val = float(tokens[idx])
        idx += 1
        return val

    while idx < len(tokens):
        tok = tokens[idx]
        if tok.isalpha():
            cmd = tok
            idx += 1
            if cmd in ("Z", "z"):
                verts.append((sx, sy))
                codes.append(MplPath.CLOSEPOLY)
                cx, cy = sx, sy
                continue
        if cmd in ("M", "m"):
            x, y = next_float(), next_float()
            if cmd == "m":
                x, y = cx + x, cy + y
            cx, cy = x, y
            sx, sy = x, y
            verts.append((cx, cy))
            codes.append(MplPath.MOVETO)
            cmd = "L" if cmd == "M" else "l"
        elif cmd in ("L", "l"):
            x, y = next_float(), next_float()
            if cmd == "l":
                x, y = cx + x, cy + y
            cx, cy = x, y
            verts.append((cx, cy))
            codes.append(MplPath.LINETO)
        elif cmd in ("H", "h"):
            x = next_float()
            cx = cx + x if cmd == "h" else x
            verts.append((cx, cy))
            codes.append(MplPath.LINETO)
        elif cmd in ("V", "v"):
            y = next_float()
            cy = cy + y if cmd == "v" else y
            verts.append((cx, cy))
            codes.append(MplPath.LINETO)
        elif cmd in ("C", "c"):
            x1, y1 = next_float(), next_float()
            x2, y2 = next_float(), next_float()
            x3, y3 = next_float(), next_float()
            if cmd == "c":
                x1, y1 = cx + x1, cy + y1
                x2, y2 = cx + x2, cy + y2
                x3, y3 = cx + x3, cy + y3
            verts.extend(((x1, y1), (x2, y2), (x3, y3)))
            codes.extend((MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4))
            cx, cy = x3, y3
        elif cmd in ("Q", "q"):
            x1, y1 = next_float(), next_float()
            x2, y2 = next_float(), next_float()
            if cmd == "q":
                x1, y1 = cx + x1, cy + y1
                x2, y2 = cx + x2, cy + y2
            verts.extend(((x1, y1), (x2, y2)))
            codes.extend((MplPath.CURVE3, MplPath.CURVE3))
            cx, cy = x2, y2
        else:
            idx += 1

    if len(verts) < 2:
        return None
    return MplPath(verts, codes)


def _parse_svg_gradients(root: ET.Element) -> dict[str, dict[str, Any]]:
    gradients: dict[str, dict[str, Any]] = {}
    for elem in root.iter():
        tag = elem.tag.split("}")[-1]
        if tag not in ("linearGradient", "radialGradient"):
            continue
        gid = elem.attrib.get("id")
        if not gid:
            continue
        stops: list[tuple[float, tuple[int, int, int, int]]] = []
        for child in elem:
            if child.tag.split("}")[-1] != "stop":
                continue
            off_raw = child.attrib.get("offset", "0%").strip()
            off = float(off_raw[:-1]) / 100.0 if off_raw.endswith("%") else float(off_raw)
            sc = child.attrib.get("stop-color", "#182433")
            so = float(child.attrib.get("stop-opacity", "1"))
            stops.append((max(0.0, min(1.0, off)), _hex_to_rgba(sc, so)))
        if stops:
            gradients[gid] = {
                "kind": tag,
                "x1": elem.attrib.get("x1", "0%"),
                "y1": elem.attrib.get("y1", "0%"),
                "x2": elem.attrib.get("x2", "0%"),
                "y2": elem.attrib.get("y2", "100%"),
                "stops": sorted(stops, key=lambda s: s[0]),
            }
    return gradients


def _resolve_paint(paint_raw: str | None, opacity: float, gradients: dict[str, dict[str, Any]]) -> tuple[float, float, float, float] | None:
    if not paint_raw or paint_raw == "none":
        return None
    clean = paint_raw.strip()
    if clean.startswith("url(#") and clean.endswith(")"):
        gid = clean[5:-1]
        grad = gradients.get(gid)
        if not grad or not grad["stops"]:
            return (0.10, 0.16, 0.24, opacity)
        # Mid-weighted representative stop for stroke/shape; glyph paths get true 2D gradient shading below
        mid_idx = len(grad["stops"]) // 2
        r, g, b, a = grad["stops"][mid_idx][1]
        return (r / 255.0, g / 255.0, b / 255.0, (a / 255.0) * opacity)
    r, g, b, a = _hex_to_rgba(clean, opacity)
    return (r / 255.0, g / 255.0, b / 255.0, a / 255.0)


def _shade_gradient_mask(
    alpha_mask: np.ndarray,
    grad: dict[str, Any],
    extra_opacity: float = 1.0,
) -> np.ndarray:
    """Applies smooth per-pixel linear or radial gradient shading onto a 2x rasterized alpha mask."""
    h, w = alpha_mask.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    ys, xs = np.where(alpha_mask > 0)
    if xs.size == 0:
        return out
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    sub_a = alpha_mask[y0:y1, x0:x1].astype(np.float32) / 255.0

    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    nx = (xx - x0) / max(1.0, float(x1 - x0 - 1))
    ny = (yy - y0) / max(1.0, float(y1 - y0 - 1))

    if grad["kind"] == "radialGradient":
        t = np.clip(np.hypot(nx - 0.5, ny - 0.5) * 2.0, 0.0, 1.0)
    else:
        dx = 1.0 if grad.get("x2", "0%") == "100%" and grad.get("x1", "0%") == "0%" else 0.0
        dy = 1.0 if grad.get("y2", "100%") == "100%" and grad.get("y1", "0%") == "0%" else 0.0
        if dx == 0.0 and dy == 0.0:
            dy = 1.0
        denom = max(1e-6, dx * dx + dy * dy)
        t = np.clip((nx * dx + ny * dy) / denom, 0.0, 1.0)

    stops = grad["stops"]
    offsets = np.array([s[0] for s in stops], dtype=np.float32)
    colors = np.array([s[1] for s in stops], dtype=np.float32)

    r = np.interp(t, offsets, colors[:, 0])
    g = np.interp(t, offsets, colors[:, 1])
    b = np.interp(t, offsets, colors[:, 2])
    stop_a = np.interp(t, offsets, colors[:, 3]) / 255.0

    patch = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
    patch[:, :, 0] = np.clip(np.round(r), 0, 255).astype(np.uint8)
    patch[:, :, 1] = np.clip(np.round(g), 0, 255).astype(np.uint8)
    patch[:, :, 2] = np.clip(np.round(b), 0, 255).astype(np.uint8)
    patch[:, :, 3] = np.clip(np.round(sub_a * stop_a * extra_opacity * 255.0), 0, 255).astype(np.uint8)
    out[y0:y1, x0:x1] = patch
    return out


def _draw_pil_text_2x(
    draw: ImageDraw.ImageDraw,
    text_str: str,
    x_svg: float,
    y_svg: float,
    font_size_svg: float,
    anchor: str,
    letter_spacing_svg: float,
    rgba: tuple[int, int, int, int],
    font_family_hint: str,
) -> None:
    if not text_str:
        return
    if "Xingkai" in font_family_hint or "ShuTi" in font_family_hint or "Xinwei" in font_family_hint:
        fp = _resolve_font_file(STYLE_FONT_CANDIDATES["cinnabar_vertical"]) or _resolve_font_file(KAITI_CANDIDATES)
    elif "Zhongsong" in font_family_hint or "Source Han Serif" in font_family_hint:
        fp = _resolve_font_file(EDITORIAL_SERIF_CANDIDATES)
    else:
        fp = _resolve_font_file(KAITI_CANDIDATES)

    px_size = max(12, int(round(font_size_svg * SUPERSAMPLE)))
    font = ImageFont.truetype(fp, px_size) if fp else ImageFont.load_default()
    spacing_px = letter_spacing_svg * SUPERSAMPLE

    chars = list(text_str)
    advances = [float(draw.textlength(ch, font=font)) for ch in chars]
    total_w = sum(advances) + spacing_px * max(0, len(chars) - 1)

    x_px = x_svg * SUPERSAMPLE
    y_px = y_svg * SUPERSAMPLE
    if anchor == "middle":
        cur_x = x_px - 0.5 * total_w
    elif anchor == "end":
        cur_x = x_px - total_w
    else:
        cur_x = x_px

    try:
        ascent, _ = font.getmetrics()
    except AttributeError:
        ascent = int(round(px_size * 0.82))
    top_y = y_px - ascent * 0.90

    for ch, adv in zip(chars, advances):
        draw.text((cur_x, top_y), ch, font=font, fill=rgba)
        cur_x += adv + spacing_px


def rasterize_vector_typography_svg(svg_markup: str, *, scale: int = SUPERSAMPLE) -> Image.Image:
    """Renders transparent SVG Bézier `<path>` curves, ornaments, gradients, and `<text>` at 2x (`2000x2828`) -> `1000x1414` RGBA."""
    try:
        root = ET.fromstring(svg_markup)
    except ET.ParseError as exc:
        raise ApiError(422, "invalid_svg", "封面艺术字图层内容无法读取，请重新生成字形后再试。") from exc

    gradients = _parse_svg_gradients(root)
    hi_w, hi_h = COVER_WIDTH * scale, COVER_HEIGHT * scale
    composited = Image.new("RGBA", (hi_w, hi_h), (0, 0, 0, 0))

    def new_mpl_axes() -> tuple[Figure, FigureCanvasAgg, Any]:
        fig = Figure(figsize=(COVER_WIDTH / 100.0, COVER_HEIGHT / 100.0), dpi=100 * scale, facecolor=(0, 0, 0, 0))
        canvas = FigureCanvasAgg(fig)
        ax = fig.add_axes([0.0, 0.0, 1.0, 1.0], frameon=False)
        ax.set_xlim(0.0, float(COVER_WIDTH))
        ax.set_ylim(float(COVER_HEIGHT), 0.0)
        ax.axis("off")
        return fig, canvas, ax

    def flush_mpl_rgba(canvas: FigureCanvasAgg) -> Image.Image:
        canvas.draw()
        buf = np.asarray(canvas.buffer_rgba(), dtype=np.uint8).copy()
        return Image.fromarray(buf, mode="RGBA")

    def parse_elem_transform(raw_tf: str | None, base_tf: Affine2D) -> Affine2D:
        tf = Affine2D(base_tf.get_matrix().copy())
        if not raw_tf:
            return tf
        tr_m = _TRANSLATE_RE.search(raw_tf)
        if tr_m:
            tx = float(tr_m.group(1))
            ty = float(tr_m.group(2) or 0.0)
            tf = Affine2D().translate(tx, ty) + tf
        rot_m = _ROTATE_RE.search(raw_tf)
        if rot_m:
            deg = float(rot_m.group(1))
            rcx = float(rot_m.group(2) or 0.0)
            rcy = float(rot_m.group(3) or 0.0)
            tf = Affine2D().rotate_deg_around(rcx, rcy, deg) + tf
        return tf

    def walk(node: ET.Element, parent_tf: Affine2D) -> None:
        nonlocal composited
        tag = node.tag.split("}")[-1]
        if tag in ("defs", "filter", "linearGradient", "radialGradient", "title", "desc"):
            return
        cur_tf = parse_elem_transform(node.attrib.get("transform"), parent_tf)

        if tag in ("svg", "g"):
            for child in node:
                walk(child, cur_tf)
            return

        opacity = float(node.attrib.get("opacity", "1"))
        fill_raw = node.attrib.get("fill")
        stroke_raw = node.attrib.get("stroke")
        fill_op = float(node.attrib.get("fill-opacity", "1")) * opacity
        stroke_op = float(node.attrib.get("stroke-opacity", "1")) * opacity
        stroke_w = float(node.attrib.get("stroke-width", "1"))

        is_grad_fill = bool(fill_raw and fill_raw.strip().startswith("url(#") and fill_raw.strip().endswith(")"))
        grad_obj = gradients.get(fill_raw.strip()[5:-1]) if is_grad_fill and fill_raw else None

        if tag == "text":
            txt = "".join(node.itertext()).strip()
            if not txt:
                return
            tx = float(node.attrib.get("x", "0"))
            ty = float(node.attrib.get("y", "0"))
            pt = cur_tf.transform((tx, ty))
            fsize = float(node.attrib.get("font-size", "28"))
            anchor = node.attrib.get("text-anchor", "start")
            lspace = float(node.attrib.get("letter-spacing", "0"))
            ffam = node.attrib.get("font-family", "")
            resolved = _resolve_paint(fill_raw or "#182433", fill_op, gradients) or (0.1, 0.14, 0.2, 1.0)
            rgba_int = tuple(int(round(c * 255)) for c in resolved)
            txt_layer = Image.new("RGBA", (hi_w, hi_h), (0, 0, 0, 0))
            _draw_pil_text_2x(ImageDraw.Draw(txt_layer), txt, float(pt[0]), float(pt[1]), fsize, anchor, lspace, rgba_int, ffam)
            composited = Image.alpha_composite(composited, txt_layer)
            return

        fig, canvas, ax = new_mpl_axes()
        mpl_transform = cur_tf + ax.transData
        dash_raw = node.attrib.get("stroke-dasharray")
        linestyle: Any = (0, tuple(float(v) for v in re.split(r"[, ]+", dash_raw.strip()) if v)) if dash_raw else "solid"

        face_rgba = (1.0, 1.0, 1.0, 1.0) if grad_obj is not None else (_resolve_paint(fill_raw, fill_op, gradients) or (0.0, 0.0, 0.0, 0.0))
        edge_rgba = _resolve_paint(stroke_raw, stroke_op, gradients) or (0.0, 0.0, 0.0, 0.0)
        lw_pts = stroke_w * 0.75 if stroke_raw and stroke_raw != "none" else 0.0

        patch_added = False
        if tag == "path":
            mpl_path = _parse_svg_d_to_mpl_path(node.attrib.get("d", ""))
            if mpl_path is not None:
                ax.add_patch(
                    PathPatch(
                        mpl_path,
                        facecolor=face_rgba,
                        edgecolor=edge_rgba,
                        linewidth=lw_pts,
                        linestyle=linestyle,
                        capstyle="round",
                        joinstyle="round",
                        transform=mpl_transform,
                        antialiased=True,
                    )
                )
                patch_added = True
        elif tag == "rect":
            rx = float(node.attrib.get("rx", "0"))
            x = float(node.attrib.get("x", "0"))
            y = float(node.attrib.get("y", "0"))
            w = float(node.attrib.get("width", "0"))
            h = float(node.attrib.get("height", "0"))
            if w > 0 and h > 0:
                if rx > 0.5:
                    ax.add_patch(
                        FancyBboxPatch(
                            (x, y),
                            w,
                            h,
                            boxstyle=f"round,pad=0,rounding_size={min(rx, w * 0.5, h * 0.5)}",
                            facecolor=face_rgba,
                            edgecolor=edge_rgba,
                            linewidth=lw_pts,
                            linestyle=linestyle,
                            transform=mpl_transform,
                            antialiased=True,
                        )
                    )
                else:
                    ax.add_patch(
                        Rectangle(
                            (x, y),
                            w,
                            h,
                            facecolor=face_rgba,
                            edgecolor=edge_rgba,
                            linewidth=lw_pts,
                            linestyle=linestyle,
                            transform=mpl_transform,
                            antialiased=True,
                        )
                    )
                patch_added = True
        elif tag == "circle":
            cx_v = float(node.attrib.get("cx", "0"))
            cy_v = float(node.attrib.get("cy", "0"))
            r_v = float(node.attrib.get("r", "0"))
            if r_v > 0:
                ax.add_patch(
                    Circle(
                        (cx_v, cy_v),
                        r_v,
                        facecolor=face_rgba,
                        edgecolor=edge_rgba,
                        linewidth=lw_pts,
                        transform=mpl_transform,
                        antialiased=True,
                    )
                )
                patch_added = True
        elif tag == "ellipse":
            cx_v = float(node.attrib.get("cx", "0"))
            cy_v = float(node.attrib.get("cy", "0"))
            rx_v = float(node.attrib.get("rx", "0"))
            ry_v = float(node.attrib.get("ry", "0"))
            if rx_v > 0 and ry_v > 0:
                ax.add_patch(
                    Ellipse(
                        (cx_v, cy_v),
                        rx_v * 2.0,
                        ry_v * 2.0,
                        facecolor=face_rgba,
                        edgecolor=edge_rgba,
                        linewidth=lw_pts,
                        linestyle=linestyle,
                        transform=mpl_transform,
                        antialiased=True,
                    )
                )
                patch_added = True
        elif tag == "line":
            x1 = float(node.attrib.get("x1", "0"))
            y1 = float(node.attrib.get("y1", "0"))
            x2 = float(node.attrib.get("x2", "0"))
            y2 = float(node.attrib.get("y2", "0"))
            line_path = MplPath([(x1, y1), (x2, y2)], [MplPath.MOVETO, MplPath.LINETO])
            ax.add_patch(
                PathPatch(
                    line_path,
                    facecolor="none",
                    edgecolor=edge_rgba,
                    linewidth=max(0.75, lw_pts),
                    linestyle=linestyle,
                    capstyle="round",
                    transform=mpl_transform,
                    antialiased=True,
                )
            )
            patch_added = True

        if not patch_added:
            return

        rendered_img = flush_mpl_rgba(canvas)
        if grad_obj is not None:
            raw_arr = np.asarray(rendered_img, dtype=np.uint8)
            shaded = _shade_gradient_mask(raw_arr[:, :, 3], grad_obj, extra_opacity=fill_op)
            rendered_img = Image.fromarray(shaded, mode="RGBA")
            if lw_pts > 0.0:
                # Re-overlay crisp border stroke when both gradient fill and stroke are present
                fig_s, canvas_s, ax_s = new_mpl_axes()
                tf_s = cur_tf + ax_s.transData
                if tag == "rect":
                    rx = float(node.attrib.get("rx", "0"))
                    x, y = float(node.attrib.get("x", "0")), float(node.attrib.get("y", "0"))
                    w, h = float(node.attrib.get("width", "0")), float(node.attrib.get("height", "0"))
                    ax_s.add_patch(
                        FancyBboxPatch(
                            (x, y),
                            w,
                            h,
                            boxstyle=f"round,pad=0,rounding_size={min(rx, w * 0.5, h * 0.5)}" if rx > 0.5 else "square,pad=0",
                            facecolor="none",
                            edgecolor=edge_rgba,
                            linewidth=lw_pts,
                            linestyle=linestyle,
                            transform=tf_s,
                            antialiased=True,
                        )
                    )
                    rendered_img = Image.alpha_composite(rendered_img, flush_mpl_rgba(canvas_s))

        composited = Image.alpha_composite(composited, rendered_img)

    walk(root, Affine2D())
    if scale == 1:
        return composited
    return composited.resize((COVER_WIDTH, COVER_HEIGHT), Image.Resampling.LANCZOS)


def _derive_figure_palette_from_cover(rgb_img: Image.Image) -> dict[str, str]:
    """Derives a `FigurePalette/v1` object (`primary`, `secondary`, `opposite` uppercase `#RRGGBB`) from cover pixels."""
    thumb = np.asarray(rgb_img.resize((100, 141), Image.Resampling.BILINEAR), dtype=np.float32)
    flat = thumb.reshape(-1, 3)
    lum = 0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]
    chroma = flat.max(axis=1) - flat.min(axis=1)

    rich_mask = (lum >= 24.0) & (lum <= 195.0) & (chroma >= 18.0)
    candidates = flat[rich_mask] if int(rich_mask.sum()) >= 20 else flat[(lum >= 20.0) & (lum <= 210.0)]
    if candidates.size == 0:
        return {
            "schema": "FigurePalette/v1",
            "primary": "#1E3A5F",
            "secondary": "#C59B57",
            "opposite": "#A63A2E",
            "source": "cover",
        }

    def fmt_hex(vec: np.ndarray, max_lum: float = 175.0) -> str:
        r, g, b = (float(vec[0]), float(vec[1]), float(vec[2]))
        cur_l = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if cur_l > max_lum and cur_l > 1.0:
            sc = max_lum / cur_l
            r, g, b = r * sc, g * sc, b * sc
        return f"#{max(0, min(255, int(round(r)))):02X}{max(0, min(255, int(round(g)))):02X}{max(0, min(255, int(round(b)))):02X}"

    c_lum = 0.2126 * candidates[:, 0] + 0.7152 * candidates[:, 1] + 0.0722 * candidates[:, 2]
    dark_idx = int(np.argsort(c_lum)[len(c_lum) // 5])
    primary_vec = candidates[dark_idx]
    primary_hex = fmt_hex(primary_vec, max_lum=125.0)

    dists = np.linalg.norm(candidates - primary_vec[None, :], axis=1)
    opp_vec = candidates[int(np.argmax(dists))]
    opposite_hex = fmt_hex(opp_vec, max_lum=168.0)
    if opposite_hex == primary_hex:
        opposite_hex = "#A63A2E"

    warm_score = candidates[:, 0] * 0.6 + candidates[:, 1] * 0.4 - candidates[:, 2] * 0.8
    sec_vec = candidates[int(np.argmax(warm_score))]
    secondary_hex = fmt_hex(sec_vec, max_lum=182.0)
    if secondary_hex in (primary_hex, opposite_hex):
        secondary_hex = "#C59B57"

    return {
        "schema": "FigurePalette/v1",
        "primary": primary_hex,
        "secondary": secondary_hex,
        "opposite": opposite_hex,
        "source": "cover",
    }


def _encode_cover_png_within_budget(rgb_img: Image.Image, max_bytes: int = MAX_COVER_PNG_BYTES) -> bytes:
    buf = io.BytesIO()
    rgb_img.save(buf, format="PNG", optimize=True, compress_level=9)
    raw = buf.getvalue()
    if len(raw) <= max_bytes:
        return raw

    for n_colors in (256, 192, 144, 112):
        quantized = rgb_img.quantize(colors=n_colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        q_buf = io.BytesIO()
        quantized.save(q_buf, format="PNG", optimize=True, compress_level=9)
        cand = q_buf.getvalue()
        if len(cand) <= max_bytes:
            return cand
    raise ApiError(413, "cover_too_large", "生成的封面图像超过 1 MB 容量上限，请选用细节更简洁的底图。")


def assemble_cover_from_layers(
    backdrop_bytes: bytes,
    svg_markup: str | None = None,
    *,
    reference_bytes: bytes | None = None,
    anchors: dict[str, Any] | None = None,
    spec: dict[str, Any] | None = None,
) -> bytes:
    """Composites a clean zero-text backdrop (`1000x1414`) with transparent vector art typography into an A4 PNG (`<= 1 MB`)."""
    if not isinstance(backdrop_bytes, (bytes, bytearray)) or len(backdrop_bytes) < 24:
        raise ApiError(422, "invalid_backdrop_image", "封面背景底图无效，请重新选择底图后再试。")
    try:
        with Image.open(io.BytesIO(backdrop_bytes)) as bg_raw:
            backdrop_rgba = bg_raw.convert("RGBA").resize((COVER_WIDTH, COVER_HEIGHT), Image.Resampling.LANCZOS)
    except Exception as exc:
        raise ApiError(422, "invalid_backdrop_image", "无法读取封面背景底图，请更换清晰的 PNG 或 JPEG 底图。") from exc

    resolved_anchors = anchors
    if resolved_anchors is None and reference_bytes is not None:
        style_hint = (spec or {}).get("typographyStyle") if isinstance(spec, dict) else None
        resolved_anchors = analyze_reference_cover(reference_bytes, style_hint=style_hint)

    effective_svg = svg_markup
    if not effective_svg:
        spec_payload = dict(spec) if isinstance(spec, dict) else {}
        if resolved_anchors is not None and "anchors" not in spec_payload:
            spec_payload["anchors"] = resolved_anchors
        effective_svg = generate_vector_art_typography_svg(spec_payload)

    typo_rgba = rasterize_vector_typography_svg(effective_svg, scale=SUPERSAMPLE)
    merged_rgb = Image.alpha_composite(backdrop_rgba, typo_rgba).convert("RGB")
    png_bytes = _encode_cover_png_within_budget(merged_rgb, max_bytes=min(MAX_COVER_PNG_BYTES, LIMITS["cover"]["bytes"]))
    return png_bytes


def assemble_cover_request(data: dict[str, Any] | None) -> dict[str, Any]:
    """End-to-end handler for `POST /api/reports/cover-assemble` supporting pure-local cover synthesis."""
    if not isinstance(data, dict):
        raise ApiError()

    raw_mode = data.get("mode") or data.get("coverPipelineMode") or "layered_assembly"
    if raw_mode not in COVER_PIPELINE_MODES:
        raise ApiError(422, "invalid_mode", "暂不支持所选的封面生成方式，请选择整幅插画封面或底图叠字封面。")
    mode: str = raw_mode

    preset_hint = str(data.get("backdropPreset") or data.get("referencePreset") or data.get("preset") or data.get("presetId") or "f").strip()
    ref_preset = str(data.get("referencePreset") or preset_hint).strip()
    bg_preset = str(data.get("backdropPreset") or preset_hint).strip()

    ref_b64_in = data.get("referenceBase64") or data.get("referenceDataUrl") or data.get("referenceImage")
    bg_b64_in = data.get("backdropBase64") or data.get("backdropDataUrl") or data.get("backdropImage")

    reference_bytes = (
        _decode_image_payload(ref_b64_in)
        if isinstance(ref_b64_in, str) and ref_b64_in.strip()
        else _resolve_candidate_file(ref_preset, "reference").read_bytes()
    )
    backdrop_bytes = (
        _decode_image_payload(bg_b64_in)
        if isinstance(bg_b64_in, str) and bg_b64_in.strip()
        else _resolve_candidate_file(bg_preset, "backdrop").read_bytes()
    )

    explicit_style = data.get("typographyStyle") or data.get("style")
    if explicit_style is not None and explicit_style not in COVER_TYPOGRAPHY_STYLES:
        raise ApiError(422, "invalid_typography_style", "暂不支持所选的封面字体版式风格。")

    active_preset_id = (
        None
        if (
            (isinstance(bg_b64_in, str) and bg_b64_in.strip())
            or (isinstance(ref_b64_in, str) and ref_b64_in.strip())
        )
        else (_extract_preset_short_id(bg_preset) or _extract_preset_short_id(ref_preset))
    )
    ref_analysis = analyze_reference_cover(
        reference_bytes,
        style_hint=explicit_style,
        preset_hint=active_preset_id,
    )
    resolved_style: str = explicit_style or ref_analysis["recommendedStyle"]

    caller_anchors = data.get("anchors") if isinstance(data.get("anchors"), dict) else (
        data.get("referenceAnchors") if isinstance(data.get("referenceAnchors"), dict) else None
    )
    merged_anchors = _merge_anchors(resolved_style, caller_anchors or ref_analysis)
    ink_mode = data.get("inkMode") if data.get("inkMode") in ("dark_on_light", "light_on_dark") else ref_analysis["inkMode"]

    norm_text = normalize_cover_text_spec({
        "title": data.get("title") or data.get("mainTitle") or DEFAULT_FALLBACK_COVER_TITLE,
        "subtitle": data.get("subtitle") or "",
        "competitionName": data.get("competitionName") or DEFAULT_COVER_COMPETITION_NAME,
        "teamName": data.get("teamName"),
        "titleLayout": "vertical" if resolved_style == "cinnabar_vertical" else "horizontal",
    })

    custom_svg = data.get("vectorTypographySvg")
    svg_markup = (
        custom_svg.strip()
        if isinstance(custom_svg, str) and custom_svg.strip().startswith("<svg")
        else generate_vector_art_typography_svg(
            title=norm_text["mainTitle"],
            subtitle=norm_text["subtitle"],
            competition_name=norm_text["competitionName"],
            team_name=norm_text["teamName"],
            typography_style=resolved_style,
            anchors=merged_anchors,
            ink_mode=ink_mode,
            preset_theme=active_preset_id,
            extracted_palette=ref_analysis.get("extractedPalette") if active_preset_id is None else None,
        )
    )

    if mode == "direct_illustrated" and not (isinstance(bg_b64_in, str) and bg_b64_in.strip()):
        with Image.open(io.BytesIO(reference_bytes)) as direct_im:
            direct_rgb = direct_im.convert("RGB").resize((COVER_WIDTH, COVER_HEIGHT), Image.Resampling.LANCZOS)
        assembled_bytes = _encode_cover_png_within_budget(direct_rgb)
    else:
        assembled_bytes = assemble_cover_from_layers(
            backdrop_bytes,
            svg_markup,
            anchors=merged_anchors,
        )

    default_cover_note = (
        "出版级整幅插画 A4 封面（题名字形在图中）"
        if mode == "direct_illustrated"
        else "出版级艺术字合成 A4 封面（题名字形在图中）"
    )
    raw_note = data.get("note") if isinstance(data.get("note"), str) and data["note"].strip() else default_cover_note
    clean_note = _NOTE_SANITIZE_RE.sub(" ", raw_note).strip()[:280] or default_cover_note

    png_b64 = base64.b64encode(assembled_bytes).decode("ascii")
    cover_image_obj = {
        "schema": "CoverImage/v1",
        "mime": "image/png",
        "data": png_b64,
        "widthPx": COVER_WIDTH,
        "heightPx": COVER_HEIGHT,
        "note": clean_note,
    }
    cover_image_bytes(cover_image_obj)

    with Image.open(io.BytesIO(assembled_bytes)) as final_im:
        figure_palette = _derive_figure_palette_from_cover(final_im.convert("RGB"))

    svg_b64 = base64.b64encode(svg_markup.encode("utf-8")).decode("ascii")
    clean_prompt = build_clean_backdrop_prompt(
        topic=norm_text["mainTitle"],
        typography_style=resolved_style,
    )

    return {
        "ok": True,
        "source": "backend_bezier",
        "mode": mode,
        "typographyStyle": resolved_style,
        "textSpec": norm_text,
        "cleanBackdropPrompt": clean_prompt,
        "referenceAnalysis": ref_analysis,
        "vectorTypographySvg": svg_markup,
        "vectorTypographyDataUrl": f"data:image/svg+xml;base64,{svg_b64}",
        "assembledDataUrl": f"data:image/png;base64,{png_b64}",
        "coverImage": cover_image_obj,
        "figurePalette": figure_palette,
        "byteLength": len(assembled_bytes),
        "width": COVER_WIDTH,
        "height": COVER_HEIGHT,
    }
