"""Dual-axis semantic silhouette word-cloud renderer (fuqiuai/wordCloud & flingjie/words_image style).

Supports high-resolution binary silhouette PNG masks from `skill/research-themed-wordcloud/assets/masks/`
(e.g., `elder_portrait.png`, `smart_watch.png`) alongside procedural supersampled PIL silhouettes,
outputting pure-white (#FFFFFF), zero-border, zero-header/footer 1280x720 PNGs (<= 500 KB)
compatible with SectionIllustration/v1.
"""
from __future__ import annotations

import base64
import hashlib
import io
import math
from pathlib import Path
import re
import threading

import jieba
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from wordcloud import WordCloud

from shared.contracts import text as bounded_text
from shared.errors import ApiError

TARGET_WIDTH = 1280
TARGET_HEIGHT = 720
PAIRED_WIDTH = 1400
PAIRED_HEIGHT = 680
MAX_PNG_BYTES = 500_000
MAX_RAW_TEXT_CHARS = 48_000
MAX_INPUT_TERMS = 400
BUILTIN_SHAPES = (
    "auto",
    "elder_portrait",
    "smart_watch",
    "cloud",
    "heart",
    "shield",
    "leaf",
    "capsule",
    "circle",
    "book_scroll",
    "city_skyline",
    "delivery_box",
    "teacup_leaf",
    "drone_wing",
    "paw_care",
    "museum_arch",
)
AXES = ("auto", "persona", "artifact")
_MASK_NAME_RE = re.compile(r"^[a-z0-9_]{2,40}$")

FONT_CANDIDATES = (
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/Dengb.ttf",
    "C:/Windows/Fonts/simsun.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
)

PALETTE_PRESETS: dict[str, tuple[str, ...]] = {
    "teal": ("#0F766E", "#182634", "#155E63", "#B5802A", "#A65A3A", "#2B6A6C", "#334155"),
    "blue": ("#234E80", "#182232", "#1E6091", "#B5802A", "#9E4747", "#2F6690", "#334155"),
    "burgundy": ("#8A3449", "#1F2430", "#6D2E46", "#B5802A", "#23576E", "#9C4A5B", "#334155"),
}

STOPWORDS = frozenset((
    "的", "了", "和", "与", "及", "或", "在", "是", "有", "也", "都", "就", "而", "但", "却", "又", "更", "最",
    "很", "太", "较", "比较", "非常", "十分", "特别", "主要", "基本", "整体", "目前", "当前", "平时", "日常",
    "我们", "你们", "他们", "自己", "个人", "大家", "本人", "受访者", "调查", "问卷", "样本", "研究", "报告",
    "建议", "希望", "觉得", "认为", "感觉", "可能", "需要", "可以", "应该", "能够", "如果", "因为", "所以",
    "虽然", "但是", "还是", "或者", "以及", "对于", "关于", "通过", "进行", "使用", "情况", "方面", "问题",
    "时候", "地方", "东西", "没有", "不要", "不能", "不会", "不是", "一个", "一些", "一定", "一点",
    "一下", "一直", "一般", "一样", "进一步", "存在", "出现", "提供", "相关", "其他", "以上", "以下", "其中",
    "模拟", "教学模拟", "随机种子", "人工智能", "大语言模型", "机器生成", "合成", "演练",
))

_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
_BRACKET_STRIP_RE = re.compile(r"[\u3010\u3011\u300c\u300d\u300e\u300f\[\]{}]+")
_BANNED_META_RE = re.compile(
    r"教学模拟|模拟数据|模拟样本|模拟记录|随机种子|算法合成|演练语料|机器生成|数据生成|人工智能|大语言模型|大模型|AI\s*生成|AIGC|\bAI\b|AI(?=[\u4e00-\u9fa5])",
    re.IGNORECASE,
)
_JIEBA_LOCK = threading.Lock()


def _find_mask_dir() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "skill" / "research-themed-wordcloud" / "assets" / "masks"
        if candidate.is_dir():
            return candidate
    return None


def _mask_asset_path(name: str) -> Path | None:
    if not _MASK_NAME_RE.fullmatch(name):
        return None
    root = _find_mask_dir()
    if root is None:
        return None
    resolved_root = root.resolve()
    target = (resolved_root / f"{name}.png").resolve()
    if not target.is_relative_to(resolved_root) or not target.is_file():
        return None
    return target


def associate_topic_silhouettes(topic: str) -> list[dict]:
    """Dual-axis semantic silhouette association: Axis A (Persona) & Axis B (Artifact)."""
    clean = topic or ""
    has_elder = bool(re.search(r"银发|老年|老人|长者|养老|高龄|康养|适老", clean))
    has_watch = bool(re.search(r"健康监测|智能穿戴|手表|手环|设备|监测仪|体征", clean))
    has_dining = bool(re.search(r"助餐|食堂|餐饮|就餐|送餐", clean))
    has_drone = bool(re.search(r"低空|无人机|飞行器|植保机|航拍|低空经济", clean))
    has_pet = bool(re.search(r"宠物|伴侣动物|猫咪|狗狗|宠物医疗|宠物食品", clean))
    has_museum = bool(re.search(r"博物馆|文博|非遗|古建|历史文化街区|文创馆", clean))
    has_retail = bool(re.search(r"即时零售|闪电仓|外卖|配送|骑手|履约|食安|生鲜仓|快递", clean))
    has_tea = bool(re.search(r"茶饮|咖啡|奶茶|茶叶|饮品|烘培|农特产", clean))
    has_edu = bool(re.search(r"高校|大学生|学习|教育|课程|科研|阅读|古籍|素养", clean))
    has_city = bool(re.search(r"城市|商圈|文旅|旅游|夜市|轨道交通|景区|县城", clean))
    has_eco = bool(re.search(r"生态|绿|农|林|碳|环保|乡村", clean))

    if has_elder and has_watch:
        pairs = [
            ("persona", "elder_portrait", "elder_portrait", "银发长者温和侧影", "代际数字反哺与社区照护诉求"),
            ("artifact", "smart_watch", "smart_watch", "智能健康监测手表轮廓", "设备交互体验与功能改进建言"),
        ]
    elif has_elder or has_dining:
        artifact_shape = "smart_watch" if has_watch else "heart"
        artifact_concept = "smart_watch" if has_watch else "care_bowl"
        artifact_label = "智能健康监测手表轮廓" if has_watch else "社区温情助餐关怀轮廓"
        pairs = [
            ("persona", "elder_portrait", "elder_portrait", "银发长者温和侧影", "长者群体照护与适老服务诉求"),
            ("artifact", artifact_shape, artifact_concept, artifact_label, "服务流程与品质改进建言"),
        ]
    elif has_watch:
        pairs = [
            ("persona", "heart", "health_user", "健康管理受众关怀轮廓", "日常健康管理心理与习惯诉求"),
            ("artifact", "smart_watch", "smart_watch", "智能健康监测手表轮廓", "设备硬件交互与监测功能建言"),
        ]
    elif has_drone:
        pairs = [
            ("persona", "city_skyline", "airspace_user", "县域城乡低空应用场景轮廓", "空域需求方与农户采纳意愿诉求"),
            ("artifact", "drone_wing", "drone_wing", "四旋翼低空无人机轮廓", "飞行半径、载重成本与监管预期"),
        ]
    elif has_pet:
        pairs = [
            ("persona", "paw_care", "paw_care", "伴侣动物照护爪印轮廓", "宠物情感消费与医疗照护诉求"),
            ("artifact", "heart", "care_bond", "人宠情感联结心形轮廓", "服务规范与消费信任建言"),
        ]
    elif has_museum:
        pairs = [
            ("persona", "museum_arch", "museum_arch", "文博馆阁拱门列柱轮廓", "文化体验、展陈理解与活态传承诉求"),
            ("artifact", "book_scroll", "book_scroll", "展卷图谱典籍轮廓", "讲解数字化与文创转化建言"),
        ]
    elif has_retail:
        pairs = [
            ("persona", "cloud", "rider_silhouette", "即时消费与骑手协同云廓", "即时履约痛点与配送时效预期"),
            ("artifact", "delivery_box", "delivery_box", "仓配包裹箱体轮廓", "前置仓品控、冷链与食安建言"),
        ]
    elif has_tea:
        pairs = [
            ("persona", "cloud", "flavor_consumer", "消费风味偏好语义云廓", "日常饮用场景与健康配方诉求"),
            ("artifact", "teacup_leaf", "teacup_leaf", "茶杯与嫩叶意象轮廓", "茶饮研发与风味体验改进建言"),
        ]
    elif has_edu:
        pairs = [
            ("persona", "cloud", "scholar_cap", "青年学习者语义云廓", "学习体验与认知负荷诉求"),
            ("artifact", "book_scroll", "book_scroll", "展卷书页知识轮廓", "课程工具交互与规范引导建言"),
        ]
    elif has_city:
        pairs = [
            ("persona", "city_skyline", "city_skyline", "城市天际线建筑群廓", "空间感知、消费活力与公共服务评价"),
            ("artifact", "shield", "urban_governance", "现代城市治理护盾轮廓", "公共配套与消费体验优化建言"),
        ]
    elif has_eco:
        pairs = [
            ("persona", "cloud", "traveler_profile", "受众体验全景云廓", "生态消费动机与绿色认知诉求"),
            ("artifact", "leaf", "botanical_leaf", "生态叶片意象轮廓", "低碳供给与可持续发展建言"),
        ]
    else:
        pairs = [
            ("persona", "cloud", "persona_cloud", "核心受众诉求语义轮廓", "受众群体需求与体验痛点"),
            ("artifact", "shield", "artifact_shield", "产品服务改进护盾轮廓", "服务机制与功能优化建言"),
        ]

    out: list[dict] = []
    for axis_name, shape_id, concept, label, focus in pairs:
        asset_file = _mask_asset_path(shape_id)
        effective_shape = shape_id if (asset_file is not None or shape_id in BUILTIN_SHAPES) else "cloud"
        out.append({
            "axis": axis_name,
            "shape": effective_shape,
            "concept": concept,
            "label": label,
            "focus": focus,
            "hasAsset": asset_file is not None,
        })
    return out


def _resolve_font_path() -> str:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).is_file():
            return candidate
    raise ApiError(503, "font_unavailable", "服务器未找到可用的中文字体文件。")


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    clean = value.lstrip("#")
    return int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)


def _ensure_contrast_on_white(hex_color: str) -> str:
    """Darken overly pale colors so every word remains crisp on pure #FFFFFF."""
    r, g, b = _hex_to_rgb(hex_color)
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if luminance <= 178:
        return f"#{r:02X}{g:02X}{b:02X}"
    scale = 165.0 / max(luminance, 1.0)
    return f"#{max(0, min(255, int(r * scale))):02X}{max(0, min(255, int(g * scale))):02X}{max(0, min(255, int(b * scale))):02X}"


def _resolve_palette(data: dict) -> tuple[str, ...]:
    accent = data.get("accent") if data.get("accent") in PALETTE_PRESETS else "teal"
    base = list(PALETTE_PRESETS[accent])
    custom = data.get("palette")
    if isinstance(custom, dict):
        extracted = []
        for key in ("primary", "secondary", "opposite"):
            val = custom.get(key)
            if isinstance(val, str) and _HEX_COLOR_RE.fullmatch(val.strip()):
                extracted.append(_ensure_contrast_on_white(val.strip()))
        if extracted:
            return tuple(extracted + [c for c in base if c.upper() not in {x.upper() for x in extracted}])
    if isinstance(custom, list):
        extracted = [
            _ensure_contrast_on_white(item.strip())
            for item in custom[:8]
            if isinstance(item, str) and _HEX_COLOR_RE.fullmatch(item.strip())
        ]
        if len(extracted) >= 2:
            return tuple(extracted + base[:3])
    return tuple(base)


def _infer_axis(raw_axis: str | None, result_id: str, note: str) -> str:
    if raw_axis is not None:
        if raw_axis not in AXES:
            raise ApiError(422, "invalid_axis", "axis 参数仅支持 persona、artifact 或 auto。")
        return raw_axis
    rid_low = result_id.lower()
    if "persona" in rid_low or re.search(r"人群|长者|银发群体|代际|照护诉求", note):
        return "persona"
    if "artifact" in rid_low or re.search(r"设备交互|功能改进|手表|手环|硬件|Q32", note, re.IGNORECASE):
        return "artifact"
    return "auto"


def _choose_shape(requested: str | None, axis: str, topic: str, words: list[str]) -> str:
    if requested and requested != "auto":
        if requested in BUILTIN_SHAPES or _mask_asset_path(requested) is not None:
            if requested in ("elder_portrait", "smart_watch") and _mask_asset_path(requested) is None:
                return "heart" if requested == "elder_portrait" else "shield"
            return requested
        raise ApiError(422, "invalid_shape", "不支持的词云轮廓类型。")

    joined = topic + " " + " ".join(words[:30])
    has_elder = bool(re.search(r"银发|老年|老人|长者|养老|高龄|康养", joined))
    has_watch = bool(re.search(r"健康监测|智能穿戴|手表|手环|设备|监测仪", joined))

    if has_elder and axis in ("persona", "auto") and _mask_asset_path("elder_portrait") is not None:
        return "elder_portrait"
    if has_watch and axis == "artifact" and _mask_asset_path("smart_watch") is not None:
        return "smart_watch"
    if has_watch and axis == "auto" and not has_elder and _mask_asset_path("smart_watch") is not None:
        return "smart_watch"

    assoc = associate_topic_silhouettes(joined)
    if axis == "persona":
        return assoc[0]["shape"]
    if axis == "artifact":
        return assoc[1]["shape"]
    # For `axis == "auto"`, prefer domain-matched thematic silhouettes before falling back to generic shapes
    if assoc[1]["shape"] in (
        "drone_wing",
        "museum_arch",
        "delivery_box",
        "teacup_leaf",
        "book_scroll",
        "city_skyline",
        "paw_care",
    ):
        return assoc[1]["shape"]
    if assoc[0]["shape"] in ("paw_care", "museum_arch", "city_skyline"):
        return assoc[0]["shape"]

    if re.search(r"老|银发|健康|医|护|关怀|助餐|养老|家庭|康养", joined):
        return "elder_portrait" if _mask_asset_path("elder_portrait") is not None else "heart"
    if re.search(r"安全|食安|监管|风险|隐私|溯源|防诈|合规", joined):
        return "shield"
    if re.search(r"生态|绿|农|茶|生鲜|果|碳|乡村|文旅", joined):
        return "leaf"
    return "cloud"


def _otsu_threshold(gray: np.ndarray) -> int:
    hist, _ = np.histogram(gray.ravel(), bins=256, range=(0, 256))
    total = int(gray.size)
    if total <= 0:
        return 128
    sum_total = float(np.dot(np.arange(256, dtype=np.float64), hist))
    sum_bg = 0.0
    w_bg = 0
    max_var = -1.0
    first_t = 128
    last_t = 128
    for t in range(256):
        w_bg += int(hist[t])
        if w_bg == 0:
            continue
        w_fg = total - w_bg
        if w_fg == 0:
            break
        sum_bg += float(t * int(hist[t]))
        mean_bg = sum_bg / w_bg
        mean_fg = (sum_total - sum_bg) / w_fg
        var_between = w_bg * w_fg * ((mean_bg - mean_fg) ** 2)
        if var_between > max_var + 1e-6:
            max_var = var_between
            first_t = t
            last_t = t
        elif abs(var_between - max_var) <= 1e-6:
            last_t = t
    return (first_t + last_t) // 2


def _normalize_mask_image(raw_img: Image.Image, canvas_w: int = 1440, canvas_h: int = 1080) -> np.ndarray:
    """Binarizes an arbitrary mask image (alpha or Otsu luminance), crops tight, and centers on canvas."""
    rgba = raw_img.convert("RGBA")
    arr = np.asarray(rgba, dtype=np.uint8)
    alpha = arr[:, :, 3]
    # Use alpha matte directly if image carries meaningful transparency
    if int((alpha < 245).sum()) >= max(32, int(alpha.size * 0.03)) and int((alpha >= 128).sum()) >= 32:
        fg_mask = alpha >= 128
    else:
        gray = np.asarray(rgba.convert("L"), dtype=np.uint8)
        thresh = _otsu_threshold(gray)
        # Inspect 4 corners to infer whether exterior background is bright or dark
        corners = np.array([gray[0, 0], gray[0, -1], gray[-1, 0], gray[-1, -1]], dtype=np.float32)
        dark_bg = float(corners.mean()) < 120.0
        fg_mask = (gray > thresh) if dark_bg else (gray < max(20, min(235, thresh)))

    fg_y, fg_x = np.where(fg_mask)
    if fg_x.size == 0 or fg_y.size == 0:
        raise ApiError(422, "empty_mask", "剪影掩膜不包含有效前景区域。")
    x0, x1 = int(fg_x.min()), int(fg_x.max()) + 1
    y0, y1 = int(fg_y.min()), int(fg_y.max()) + 1
    cropped = Image.fromarray(np.where(fg_mask[y0:y1, x0:x1], np.uint8(0), np.uint8(255)), mode="L")

    avail_w, avail_h = int(canvas_w * 0.90), int(canvas_h * 0.92)
    scale = min(avail_w / max(1, cropped.width), avail_h / max(1, cropped.height))
    new_w = max(64, int(round(cropped.width * scale)))
    new_h = max(64, int(round(cropped.height * scale)))
    resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = Image.new("L", (canvas_w, canvas_h), 255)
    canvas.paste(resized, ((canvas_w - new_w) // 2, (canvas_h - new_h) // 2))
    out_arr = np.asarray(canvas, dtype=np.uint8)
    return np.where(out_arr < 140, np.uint8(0), np.uint8(255))


def _load_png_mask(mask_path: Path, canvas_w: int = 1280, canvas_h: int = 920) -> np.ndarray:
    """Tightly crop binary silhouette PNG whitespace and center onto high-density working canvas."""
    with Image.open(mask_path) as im:
        return _normalize_mask_image(im, canvas_w=canvas_w, canvas_h=canvas_h)


def _load_mask_from_base64(payload: str, canvas_w: int = 1440, canvas_h: int = 1080) -> np.ndarray:
    clean = payload.strip()
    if "," in clean and clean.lower().startswith("data:image/"):
        clean = clean.split(",", 1)[1].strip()
    try:
        raw = base64.b64decode(clean, validate=True)
    except Exception as exc:
        raise ApiError(422, "invalid_wordcloud_mask", "自定义词云剪影图像编码无效。") from exc
    if len(raw) < 24 or len(raw) > 3_500_000:
        raise ApiError(422, "invalid_wordcloud_mask", "自定义词云剪影图像大小超出限制。")
    try:
        with Image.open(io.BytesIO(raw)) as im:
            return _normalize_mask_image(im, canvas_w=canvas_w, canvas_h=canvas_h)
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(422, "invalid_wordcloud_mask", "无法解析自定义词云剪影图像格式。") from exc


def _build_procedural_mask(shape: str, width: int = TARGET_WIDTH, height: int = TARGET_HEIGHT) -> np.ndarray:
    """Create a smooth binary mask (0 = fillable interior, 255 = pure white exterior)."""
    ss = 2
    w, h = width * ss, height * ss
    img = Image.new("L", (w, h), 255)
    draw = ImageDraw.Draw(img)
    cx, cy = w * 0.5, h * 0.5

    if shape == "circle":
        rx, ry = w * 0.36, h * 0.45
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=0)
    elif shape == "capsule":
        pad_x, pad_y = int(w * 0.055), int(h * 0.055)
        draw.rounded_rectangle((pad_x, pad_y, w - pad_x, h - pad_y), radius=int(h * 0.42), fill=0)
    elif shape == "heart":
        pts: list[tuple[float, float]] = []
        scale_x, scale_y = w * 0.0245, h * 0.0285
        center_y = h * 0.455
        for step in range(360):
            t = math.radians(step)
            x = 16.0 * (math.sin(t) ** 3)
            y = 13.0 * math.cos(t) - 5.0 * math.cos(2 * t) - 2.0 * math.cos(3 * t) - math.cos(4 * t)
            pts.append((cx + x * scale_x, center_y - y * scale_y))
        draw.polygon(pts, fill=0)
    elif shape == "shield":
        top_y, bot_y = h * 0.06, h * 0.94
        half_w = w * 0.39
        right_flank = [
            (cx + half_w * (math.cos((s / 60.0) * math.pi * 0.5) ** 0.72), top_y + h * 0.04 + (bot_y - top_y - h * 0.04) * (s / 60.0))
            for s in range(61)
        ]
        left_flank = [(2 * cx - x, y) for x, y in reversed(right_flank)]
        crown = [(cx + (-1.0 + 2.0 * s / 40.0) * half_w, top_y + h * 0.04 * (abs(-1.0 + 2.0 * s / 40.0) ** 1.5)) for s in range(41)]
        draw.polygon(crown + right_flank[1:] + left_flank[1:], fill=0)
    elif shape == "leaf":
        pts = []
        rx, ry = w * 0.42, h * 0.43
        tilt = -0.16
        cos_t, sin_t = math.cos(tilt), math.sin(tilt)
        for step in range(240):
            theta = 2.0 * math.pi * step / 240.0
            pinch = 0.86 + 0.14 * math.sin(theta)
            lx = rx * math.cos(theta)
            ly = ry * math.sin(theta) * pinch * (0.92 + 0.12 * math.cos(theta))
            pts.append((cx + lx * cos_t - ly * sin_t, cy + lx * sin_t + ly * cos_t))
        draw.polygon(pts, fill=0)
    elif shape == "book_scroll":
        # Open spread curved book silhouette with gentle spine dip and solid body for dense packing
        top_pts = []
        bot_pts = []
        for i in range(65):
            t = i / 64.0
            px = w * (0.09 + 0.82 * t)
            spine_dip = h * 0.09 * math.exp(-((t - 0.5) / 0.12) ** 2)
            arch = math.sin(t * math.pi) * h * 0.045
            top_pts.append((px, h * 0.16 - arch + spine_dip))
            bot_pts.append((px, h * 0.84 - arch * 0.4 + spine_dip * 0.7))
        draw.polygon(top_pts + list(reversed(bot_pts)), fill=0)
        draw.rounded_rectangle((int(w * 0.075), int(h * 0.22), int(w * 0.925), int(h * 0.86)), radius=int(h * 0.05), fill=0)
        draw.polygon([(cx - w * 0.03, h * 0.84), (cx + w * 0.03, h * 0.84), (cx + w * 0.03, h * 0.95), (cx, h * 0.91), (cx - w * 0.03, h * 0.95)], fill=0)
    elif shape == "city_skyline":
        # Layered urban skyline towers anchored on a wide cohesive boulevard plinth
        towers = (
            (0.08, 0.46, 0.19, 0.88),
            (0.18, 0.30, 0.30, 0.88),
            (0.28, 0.20, 0.41, 0.88),
            (0.39, 0.10, 0.54, 0.88),
            (0.52, 0.24, 0.65, 0.88),
            (0.63, 0.16, 0.76, 0.88),
            (0.74, 0.34, 0.85, 0.88),
            (0.83, 0.48, 0.92, 0.88),
        )
        for x0, y0, x1, y1 in towers:
            draw.rounded_rectangle((int(w * x0), int(h * y0), int(w * x1), int(h * y1)), radius=int(w * 0.015), fill=0)
        draw.polygon([(w * 0.465, h * 0.03), (w * 0.49, h * 0.12), (w * 0.44, h * 0.12)], fill=0)
        draw.ellipse((w * 0.06, h * 0.66, w * 0.94, h * 0.93), fill=0)
    elif shape == "delivery_box":
        # Isometric hexagonal parcel cube silhouette + rounded corner polish
        parcel = [
            (w * 0.50, h * 0.08),
            (w * 0.88, h * 0.27),
            (w * 0.88, h * 0.72),
            (w * 0.50, h * 0.92),
            (w * 0.12, h * 0.72),
            (w * 0.12, h * 0.27),
        ]
        draw.polygon(parcel, fill=0)
        draw.rounded_rectangle((int(w * 0.16), int(h * 0.25), int(w * 0.84), int(h * 0.78)), radius=int(w * 0.04), fill=0)
    elif shape == "teacup_leaf":
        # Rounded ceramic cup silhouette + curved handle + sprouting twin tea leaves
        draw.chord((w * 0.18, h * 0.18, w * 0.76, h * 0.88), start=0, end=180, fill=0)
        draw.rounded_rectangle((int(w * 0.18), int(h * 0.36), int(w * 0.76), int(h * 0.64)), radius=int(h * 0.05), fill=0)
        draw.ellipse((w * 0.67, h * 0.40, w * 0.88, h * 0.68), fill=0)
        draw.ellipse((w * 0.41, h * 0.07, w * 0.60, h * 0.39), fill=0)
        draw.ellipse((w * 0.30, h * 0.14, w * 0.49, h * 0.41), fill=0)
        draw.rounded_rectangle((int(w * 0.22), int(h * 0.84), int(w * 0.72), int(h * 0.91)), radius=int(h * 0.03), fill=0)
    elif shape == "drone_wing":
        # Symmetric UAV silhouette: streamlined body + X-arms + 4 wide rotor guards
        draw.ellipse((w * 0.34, h * 0.22, w * 0.66, h * 0.78), fill=0)
        draw.polygon([(w * 0.20, h * 0.24), (w * 0.80, h * 0.76), (w * 0.76, h * 0.82), (w * 0.16, h * 0.30)], fill=0)
        draw.polygon([(w * 0.80, h * 0.24), (w * 0.20, h * 0.76), (w * 0.24, h * 0.82), (w * 0.84, h * 0.30)], fill=0)
        for rx0, ry0 in ((0.18, 0.24), (0.82, 0.24), (0.18, 0.74), (0.82, 0.74)):
            draw.ellipse((w * (rx0 - 0.14), h * (ry0 - 0.17), w * (rx0 + 0.14), h * (ry0 + 0.17)), fill=0)
    elif shape == "paw_care":
        # Cohesive pet paw silhouette (bridged palm + 4 soft toe pads so word packing stays dense & recognizable)
        draw.ellipse((w * 0.22, h * 0.38, w * 0.78, h * 0.92), fill=0)
        toes = ((0.21, 0.34, 0.11, 0.16), (0.39, 0.21, 0.12, 0.17), (0.61, 0.21, 0.12, 0.17), (0.79, 0.34, 0.11, 0.16))
        for tx, ty, rx_f, ry_f in toes:
            draw.ellipse((w * (tx - rx_f), h * (ty - ry_f), w * (tx + rx_f), h * (ty + ry_f)), fill=0)
            draw.ellipse((w * (tx - 0.08), h * (ty + 0.05), w * (tx + 0.08), h * 0.56), fill=0)
    elif shape == "museum_arch":
        # Neoclassical museum pediment roof + colonnade block + broad foundation steps
        draw.polygon([(cx, h * 0.06), (w * 0.90, h * 0.28), (w * 0.10, h * 0.28)], fill=0)
        draw.rounded_rectangle((int(w * 0.12), int(h * 0.26), int(w * 0.88), int(h * 0.83)), radius=int(w * 0.025), fill=0)
        draw.rounded_rectangle((int(w * 0.07), int(h * 0.81), int(w * 0.93), int(h * 0.92)), radius=int(w * 0.02), fill=0)
    else:
        ellipses = (
            (0.18, 0.30, 0.82, 0.88),
            (0.07, 0.36, 0.44, 0.84),
            (0.56, 0.36, 0.93, 0.84),
            (0.17, 0.14, 0.53, 0.66),
            (0.47, 0.14, 0.83, 0.66),
            (0.31, 0.07, 0.69, 0.62),
            (0.12, 0.50, 0.88, 0.91),
        )
        for x0, y0, x1, y1 in ellipses:
            draw.ellipse((w * x0, h * y0, w * x1, h * y1), fill=0)

    downsampled = img.resize((width, height), Image.Resampling.BILINEAR)
    arr = np.asarray(downsampled, dtype=np.uint8)
    return np.where(arr < 128, np.uint8(0), np.uint8(255))


def _crop_and_center_on_canvas(
    pil_img: Image.Image,
    target_w: int = TARGET_WIDTH,
    target_h: int = TARGET_HEIGHT,
    fill_w: float = 0.90,
    fill_h: float = 0.93,
) -> Image.Image:
    """Trim excess outer #FFFFFF whitespace and center silhouette onto a pure white canvas."""
    rgb = np.asarray(pil_img.convert("RGB"), dtype=np.uint8)
    non_white = np.any(rgb < 250, axis=2)
    ys, xs = np.where(non_white)
    if xs.size == 0 or ys.size == 0:
        return pil_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    cropped = pil_img.crop((x0, y0, x1, y1))

    max_w = int(target_w * fill_w)
    max_h = int(target_h * fill_h)
    scale = min(max_w / max(1, cropped.width), max_h / max(1, cropped.height))
    out_w = max(64, int(round(cropped.width * scale)))
    out_h = max(64, int(round(cropped.height * scale)))
    resized = cropped.resize((out_w, out_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (target_w, target_h), (255, 255, 255))
    canvas.paste(resized, ((target_w - out_w) // 2, (target_h - out_h) // 2))
    return canvas


def _crop_and_center_on_1280x720(pil_img: Image.Image) -> Image.Image:
    return _crop_and_center_on_canvas(pil_img, TARGET_WIDTH, TARGET_HEIGHT)


def _select_top_chinese_bar_terms(freqs: dict[str, float], top_n: int = 12) -> list[tuple[str, float]]:
    cjk_pairs: list[tuple[str, float]] = []
    for term, val in freqs.items():
        pure_cjk = re.sub(r"[^\u4e00-\u9fa5]", "", term)
        if len(pure_cjk) >= 2 and pure_cjk not in STOPWORDS:
            if all(existing != pure_cjk for existing, _ in cjk_pairs):
                cjk_pairs.append((pure_cjk[:8], val))
        if len(cjk_pairs) >= top_n:
            break
    if len(cjk_pairs) >= 3:
        return cjk_pairs[:top_n]
    return [(k[:8], v) for k, v in list(freqs.items())[:top_n]]


def _blend_rgb(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        int(round(c1[0] * (1.0 - t) + c2[0] * t)),
        int(round(c1[1] * (1.0 - t) + c2[1] * t)),
        int(round(c1[2] * (1.0 - t) + c2[2] * t)),
    )


def _compose_paired_wordcloud_and_top12_bars(
    wc_hi_img: Image.Image,
    freqs: dict[str, float],
    palette: tuple[str, ...],
    font_path: str,
) -> tuple[Image.Image, list[dict]]:
    """Composes a borderless pure-#FFFFFF 1400x680 dual exhibit: left 56% silhouette wordcloud + right 44% Top-12 gradient bar chart."""
    left_w = int(round(PAIRED_WIDTH * 0.56))  # 784 px
    right_w = PAIRED_WIDTH - left_w           # 616 px

    left_panel = _crop_and_center_on_canvas(wc_hi_img, left_w, PAIRED_HEIGHT, fill_w=0.92, fill_h=0.93)

    # Render right 44% panel at 2x supersampling (1232 x 1360) for razor-sharp CJK labels, gradient bars & exact counts
    ss = 2
    rw_hi, rh_hi = right_w * ss, PAIRED_HEIGHT * ss
    right_hi = Image.new("RGBA", (rw_hi, rh_hi), (255, 255, 255, 255))
    draw = ImageDraw.Draw(right_hi)

    reg_font_path = "C:/Windows/Fonts/msyh.ttc" if Path("C:/Windows/Fonts/msyh.ttc").is_file() else font_path
    bold_font_path = "C:/Windows/Fonts/msyhbd.ttc" if Path("C:/Windows/Fonts/msyhbd.ttc").is_file() else font_path

    header_font = ImageFont.truetype(bold_font_path, 15 * ss)
    top_label_font = ImageFont.truetype(bold_font_path, 17 * ss)
    norm_label_font = ImageFont.truetype(reg_font_path, 16 * ss)
    compact_label_font = ImageFont.truetype(reg_font_path, 14 * ss)
    top_num_font = ImageFont.truetype(bold_font_path, 16 * ss)
    norm_num_font = ImageFont.truetype(reg_font_path, 15 * ss)

    # Delicate vertical divider at left edge of right panel (zero outer card border!)
    draw.line([(8 * ss, 46 * ss), (8 * ss, (PAIRED_HEIGHT - 42) * ss)], fill=(232, 237, 243, 255), width=ss)

    top_items = _select_top_chinese_bar_terms(freqs, top_n=12)
    n_bars = max(1, len(top_items))
    max_val = max(v for _, v in top_items) if top_items else 1.0

    header_title = f"高频语义词条频次分布（前 {n_bars} 项）"
    draw.text((28 * ss, 20 * ss), header_title, font=header_font, fill=(71, 85, 105, 255))
    draw.line([(28 * ss, 48 * ss), ((right_w - 24) * ss, 48 * ss)], fill=(226, 232, 240, 255), width=ss)

    label_right_x = 158 * ss
    bar_x0 = 170 * ss
    bar_max_w = 360 * ss
    chart_y0 = 62 * ss
    chart_y1 = (PAIRED_HEIGHT - 22) * ss
    row_pitch = (chart_y1 - chart_y0) / float(n_bars)
    bar_h = max(14 * ss, min(22 * ss, int(round(row_pitch * 0.48))))

    # Subtle vertical reference gridlines behind bars
    for frac in (0.25, 0.50, 0.75, 1.0):
        gx = int(round(bar_x0 + bar_max_w * frac))
        draw.line([(gx, chart_y0 + 4 * ss), (gx, chart_y1 - 4 * ss)], fill=(243, 246, 250, 255), width=ss)

    base_rgb = _hex_to_rgb(palette[0])
    warm_rgb = _hex_to_rgb(palette[3] if len(palette) > 3 else palette[-1])
    white_rgb = (255, 255, 255)

    top_records: list[dict] = []
    for idx, (term, val) in enumerate(top_items):
        cy = chart_y0 + (idx + 0.5) * row_pitch
        by0 = int(round(cy - 0.5 * bar_h))
        by1 = by0 + bar_h
        ratio = max(0.08, min(1.0, float(val) / max(1e-6, float(max_val))))
        bw = max(bar_h, int(round(bar_max_w * ratio)))

        # Subtle background track
        draw.rounded_rectangle(
            (bar_x0, by0, bar_x0 + bar_max_w, by1),
            radius=bar_h // 4,
            fill=(246, 248, 251, 255),
        )

        # Tiered horizontal gradient bar
        if idx < 3:
            c_start = base_rgb
            c_end = _blend_rgb(base_rgb, warm_rgb, 0.42)
        elif idx < 7:
            c_start = _blend_rgb(base_rgb, white_rgb, 0.14)
            c_end = _blend_rgb(base_rgb, white_rgb, 0.34)
        else:
            c_start = _blend_rgb(base_rgb, white_rgb, 0.32)
            c_end = _blend_rgb(base_rgb, white_rgb, 0.50)

        bar_mask = Image.new("L", (bw, bar_h), 0)
        ImageDraw.Draw(bar_mask).rounded_rectangle((0, 0, bw - 1, bar_h - 1), radius=bar_h // 4, fill=255)
        t_ramp = np.linspace(0.0, 1.0, bw, dtype=np.float32)[None, :]
        grad_arr = np.zeros((bar_h, bw, 4), dtype=np.uint8)
        grad_arr[:, :, 0] = np.round(c_start[0] * (1.0 - t_ramp) + c_end[0] * t_ramp).astype(np.uint8)
        grad_arr[:, :, 1] = np.round(c_start[1] * (1.0 - t_ramp) + c_end[1] * t_ramp).astype(np.uint8)
        grad_arr[:, :, 2] = np.round(c_start[2] * (1.0 - t_ramp) + c_end[2] * t_ramp).astype(np.uint8)
        grad_arr[:, :, 3] = np.asarray(bar_mask, dtype=np.uint8)
        right_hi.alpha_composite(Image.fromarray(grad_arr, mode="RGBA"), (bar_x0, by0))

        # Pure Chinese term label (right-aligned to bar_x0 - 12px)
        l_font = compact_label_font if len(term) >= 6 else (top_label_font if idx < 3 else norm_label_font)
        l_color = (15, 23, 42, 255) if idx < 3 else (30, 41, 59, 255)
        lw = float(draw.textlength(term, font=l_font))
        try:
            l_asc, _ = l_font.getmetrics()
        except AttributeError:
            l_asc = int(l_font.size * 0.8)
        draw.text((max(18 * ss, label_right_x - lw), cy - l_asc * 0.56), term, font=l_font, fill=l_color)

        # Exact frequency number at right tip of bar
        is_int = abs(val - round(val)) < 1e-4
        num_val: int | float = int(round(val)) if is_int else round(float(val), 1)
        num_str = str(num_val)
        n_font = top_num_font if idx < 3 else norm_num_font
        n_color = (15, 23, 42, 255) if idx < 3 else (51, 65, 85, 255)
        try:
            n_asc, _ = n_font.getmetrics()
        except AttributeError:
            n_asc = int(n_font.size * 0.8)
        draw.text((bar_x0 + bw + 9 * ss, cy - n_asc * 0.54), num_str, font=n_font, fill=n_color)
        top_records.append({"term": term, "count": num_val})

    right_panel = right_hi.convert("RGB").resize((right_w, PAIRED_HEIGHT), Image.Resampling.LANCZOS)
    combined = Image.new("RGB", (PAIRED_WIDTH, PAIRED_HEIGHT), (255, 255, 255))
    combined.paste(left_panel, (0, 0))
    combined.paste(right_panel, (left_w, 0))
    return combined, top_records


def _clean_term(raw: str) -> str:
    term = _BRACKET_STRIP_RE.sub("", re.sub(r"[\s\x00-\x1f\x7f]+", "", raw))
    if not term or len(term) > 24 or _BANNED_META_RE.search(term):
        return ""
    if re.fullmatch(r"[0-9.%+-]+", term):
        return ""
    return term


def _extract_frequencies(data: dict) -> dict[str, float]:
    freqs: dict[str, float] = {}
    raw_items = data.get("frequencies")
    if raw_items is None:
        for alt in ("words", "items", "entries"):
            if alt in data:
                raw_items = data[alt]
                break

    if isinstance(raw_items, dict):
        if len(raw_items) > MAX_INPUT_TERMS:
            raise ApiError(422, "too_many_terms", "词频条目数量超过上限。")
        for k, v in raw_items.items():
            if not isinstance(k, str) or type(v) not in (int, float) or not math.isfinite(v) or v <= 0:
                continue
            term = _clean_term(k)
            if term and term not in STOPWORDS:
                freqs[term] = freqs.get(term, 0.0) + float(v)
    elif isinstance(raw_items, list):
        if len(raw_items) > MAX_INPUT_TERMS:
            raise ApiError(422, "too_many_terms", "词频条目数量超过上限。")
        for entry in raw_items:
            term_raw, weight_raw = None, None
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                term_raw, weight_raw = entry[0], entry[1]
            elif isinstance(entry, dict):
                for tk in ("word", "term", "label", "name", "text"):
                    if isinstance(entry.get(tk), str):
                        term_raw = entry[tk]
                        break
                for wk in ("weight", "count", "value", "freq", "frequency"):
                    if type(entry.get(wk)) in (int, float):
                        weight_raw = entry[wk]
                        break
            if isinstance(term_raw, str) and type(weight_raw) in (int, float) and math.isfinite(weight_raw) and weight_raw > 0:
                term = _clean_term(term_raw)
                if term and term not in STOPWORDS:
                    freqs[term] = freqs.get(term, 0.0) + float(weight_raw)

    raw_text = data.get("text")
    if raw_text is None and isinstance(data.get("texts"), list):
        pieces = [bounded_text(t, 4000) for t in data["texts"][:600] if isinstance(t, str)]
        raw_text = "\n".join(pieces)
    if isinstance(raw_text, str) and raw_text.strip():
        bounded_text(raw_text, MAX_RAW_TEXT_CHARS)
        with _JIEBA_LOCK:
            tokens = jieba.lcut(raw_text, cut_all=False)
        for tok in tokens:
            term = _clean_term(tok)
            if len(term) < 2 or term in STOPWORDS:
                continue
            freqs[term] = freqs.get(term, 0.0) + 1.0

    if not freqs:
        raise ApiError(422, "empty_wordcloud", "未提取到有效的高频词条，请提供词频表或待分词文本。")

    ordered = sorted(freqs.items(), key=lambda kv: (-kv[1], kv[0]))[:180]
    return dict(ordered)


def render_dense_wordcloud(data: dict, *, pairedBar: bool | None = None) -> dict:
    """Render a 1280x720 (or 1400x680 when `pairedBar=True`) silhouette word cloud PNG (<= 500 KB)."""
    if not isinstance(data, dict):
        raise ApiError()
    raw_paired = pairedBar if pairedBar is not None else data.get("pairedBar", data.get("paired_bar", False))
    if raw_paired is not None and not isinstance(raw_paired, bool):
        raise ApiError(422, "invalid_paired_bar", "pairedBar 参数必须为布尔值。")
    is_paired = bool(raw_paired)

    freqs = _extract_frequencies(data)
    topic = bounded_text(data["topic"], 200) if isinstance(data.get("topic"), str) else ""
    result_id = bounded_text(data.get("resultId") or "wordcloud", 80, 1).strip()
    if not result_id or "\x7f" in result_id:
        raise ApiError()
    raw_note = data.get("note") if isinstance(data.get("note"), str) and data["note"].strip() else "开放式反馈高频语义词云图"
    clean_note = (
        _BRACKET_STRIP_RE.sub("", _BANNED_META_RE.sub("", re.sub(r"[\r\n\x00-\x1f\x7f]+", " ", raw_note))).strip()[:280]
        or "开放式反馈高频语义词云图"
    )

    axis = _infer_axis(data.get("axis"), result_id, clean_note)
    custom_mask_b64 = data.get("maskBase64") or data.get("maskDataUrl")
    has_custom_mask = isinstance(custom_mask_b64, str) and len(custom_mask_b64.strip()) > 0
    shape = "custom_mask" if has_custom_mask else _choose_shape(data.get("shape"), axis, topic, list(freqs.keys()))
    associated = associate_topic_silhouettes(topic or (" ".join(list(freqs.keys())[:20])))
    palette = _resolve_palette(data)

    max_words = data.get("maxWords", 220)
    if type(max_words) is not int or not 20 <= max_words <= 320:
        max_words = 220
    seed = data.get("seed", 42)
    if type(seed) is not int or not 0 <= seed <= 2_147_483_647:
        seed = 42

    asset_mask = None if has_custom_mask else _mask_asset_path(shape)
    # Never draw a literal contour stroke around the mask; let dense multi-scale typography sculpt the silhouette cleanly.
    contour_width = 0.0
    contour_color = "white"
    if has_custom_mask:
        mask = _load_mask_from_base64(str(custom_mask_b64), canvas_w=1440, canvas_h=1080)
        min_font = 7
        max_font = 98
        render_scale = 1
    elif asset_mask is not None:
        mask = _load_png_mask(asset_mask, canvas_w=1440, canvas_h=1080)
        min_font = 7
        max_font = 96
        render_scale = 1
    else:
        mask = _build_procedural_mask(shape, TARGET_WIDTH, TARGET_HEIGHT)
        min_font = 8
        max_font = 102
        render_scale = 2

    sorted_terms = list(freqs.keys())
    top_tier = set(sorted_terms[: max(3, len(sorted_terms) // 6)])
    mid_tier = set(sorted_terms[len(top_tier) : max(6, len(sorted_terms) // 2)])

    def color_func(word, font_size, position, orientation, random_state=None, **kwargs):
        digest = hashlib.blake2b(f"{word}:{font_size}:{position}".encode("utf-8"), digest_size=4).digest()
        idx = int.from_bytes(digest, "big")
        if word in top_tier or (font_size and font_size >= 64):
            pool = palette[:2]
        elif word in mid_tier or (font_size and font_size >= 36):
            pool = palette[1:5] if len(palette) >= 5 else palette
        else:
            pool = palette[2:] if len(palette) > 2 else palette
        return pool[idx % len(pool)]

    font_path = _resolve_font_path()
    wc = WordCloud(
        font_path=font_path,
        width=mask.shape[1],
        height=mask.shape[0],
        scale=render_scale,
        mask=mask,
        contour_width=contour_width,
        contour_color=contour_color,
        max_words=max_words,
        min_font_size=min_font,
        max_font_size=max_font,
        relative_scaling=0.45,
        prefer_horizontal=0.88,
        collocations=False,
        repeat=True,
        margin=1,
        background_color="white",
        mode="RGB",
        random_state=seed,
        color_func=color_func,
    )
    wc.generate_from_frequencies(freqs)
    pil_hi = wc.to_image()

    top_records: list[dict] = []
    if is_paired:
        pil_img, top_records = _compose_paired_wordcloud_and_top12_bars(pil_hi, freqs, palette, font_path)
        out_w, out_h = PAIRED_WIDTH, PAIRED_HEIGHT
    else:
        pil_img = _crop_and_center_on_1280x720(pil_hi)
        out_w, out_h = TARGET_WIDTH, TARGET_HEIGHT
        top_records = [
            {"term": t, "count": int(round(v)) if abs(v - round(v)) < 1e-4 else round(float(v), 1)}
            for t, v in _select_top_chinese_bar_terms(freqs, top_n=12)
        ]

    raw_buf = io.BytesIO()
    pil_img.save(raw_buf, format="PNG", optimize=True, compress_level=9)
    png_bytes = raw_buf.getvalue()
    if len(png_bytes) > MAX_PNG_BYTES:
        for n_colors in (256, 128, 96, 64, 48, 32):
            quantized = pil_img.quantize(colors=n_colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            buf = io.BytesIO()
            quantized.save(buf, format="PNG", optimize=True, compress_level=9)
            candidate = buf.getvalue()
            png_bytes = candidate
            if len(candidate) <= MAX_PNG_BYTES:
                break

    if len(png_bytes) > MAX_PNG_BYTES:
        raise ApiError(413, "wordcloud_too_large", "生成的词云图像超过容量上限。")

    digest_hex = hashlib.sha256(png_bytes).hexdigest()[:12]
    ill_id = (
        bounded_text(data["id"], 80, 1).strip()
        if isinstance(data.get("id"), str) and data["id"].strip()
        else f"wc-{digest_hex}"
    )
    encoded = base64.b64encode(png_bytes).decode("ascii")
    illustration = {
        "schema": "SectionIllustration/v1",
        "id": ill_id,
        "resultId": result_id,
        "mime": "image/png",
        "data": encoded,
        "widthPx": out_w,
        "heightPx": out_h,
        "note": clean_note,
    }
    return {
        "ok": True,
        **illustration,
        "axis": axis,
        "shape": shape,
        "pairedBar": is_paired,
        "topTerms": top_records,
        "associatedSilhouettes": associated,
        "wordCount": len(wc.layout_),
        "uniqueWordCount": len(wc.words_),
        "byteLength": len(png_bytes),
        "illustration": illustration,
        "sectionArt": {
            "mime": "image/png",
            "data": encoded,
            "widthPx": out_w,
            "heightPx": out_h,
        },
    }


def render_word_cloud_png(
    data: dict | None = None,
    *,
    pairedBar: bool = False,
    **kwargs,
) -> bytes:
    """Renders raw PNG bytes for either single silhouette (`1280x720`) or paired bar exhibit (`1400x680`)."""
    payload = dict(data) if isinstance(data, dict) else {}
    payload.update(kwargs)
    if "pairedBar" not in payload and "paired_bar" not in payload:
        payload["pairedBar"] = pairedBar
    elif pairedBar:
        payload["pairedBar"] = True
    rendered = render_dense_wordcloud(payload)
    return base64.b64decode(rendered["data"])
