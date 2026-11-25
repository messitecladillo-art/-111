"""Whole-page artwork made with the user's report skills, kept in step with the frontend's lib/page-art.ts.

- The cover image (research-report-cover) is the cover page; no title is set over it.
- The frame image (research-report-frame) is a transparent A4 PNG behind every page after the cover.

The pixel size is read from the file's own header, never trusted from the draft; the page shape must be A4 portrait,
because an image is printed whole, edge to edge.
"""
from __future__ import annotations

import base64
import binascii
import re
from typing import Literal

from shared.contracts import text
from shared.errors import ApiError

CoverPipelineMode = Literal['direct_illustrated', 'layered_assembly']
CoverTypographyStyle = Literal[
    'sculpted_orbit',
    'cinnabar_vertical',
    'xuan_calligraphy',
    'staggered_poster',
    'editorial_serif',
    'modern_geometric',
]
COVER_PIPELINE_MODES: tuple[str, ...] = ('direct_illustrated', 'layered_assembly')
COVER_TYPOGRAPHY_STYLES: tuple[str, ...] = (
    'sculpted_orbit',
    'cinnabar_vertical',
    'xuan_calligraphy',
    'staggered_poster',
    'editorial_serif',
    'modern_geometric',
)

LIMITS = {
    'cover': {'schema': 'CoverImage/v1', 'bytes': 1_000_000, 'mimes': ('image/jpeg', 'image/png')},
    'frame': {'schema': 'FrameImage/v1', 'bytes': 600_000, 'mimes': ('image/png',)},
}
MAX_SECTION_ILLUSTRATIONS = 12
MAX_PAGE_ART_BYTES = 12_000_000
SECTION_ILLUSTRATION_LIMITS = {
    'schema': 'SectionIllustration/v1',
    'bytes': 650_000,
    'count': MAX_SECTION_ILLUSTRATIONS,
    'mimes': ('image/jpeg', 'image/png'),
    'min_width': 320,
    'max_width': 2400,
    'min_height': 200,
    'max_height': 1800,
}
MIN_WIDTH = 800
MAX_SIDE = 6000
ASPECT_TOLERANCE = 0.015
MAX_NOTE = 300
A4_ASPECT = 210 / 297
KEYS = {'schema', 'mime', 'data', 'widthPx', 'heightPx', 'note'}
SECTION_ILLUSTRATION_KEYS = {'schema', 'id', 'resultId', 'mime', 'data', 'widthPx', 'heightPx', 'note'}
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
FRAME_IMAGE_FILE = 'frame-image.png'
FRAME_CLEAR_ZONES_MM = (
    {'x0': 28.8, 'y0': 22.4, 'x1': 181.2, 'y1': 274.6},
    {'x0': 80.0, 'y0': 276.0, 'x1': 130.0, 'y1': 293.0},
)
FRAME_OUTER_BAND_SPEC = {
    'minRatio': 0.04,
    'maxRatio': 0.06,
    'minClearCoreRatio': 0.88,
    'allowFeatherBlurMask': False,
}
DEFAULT_COVER_COMPETITION_NAME = '“益普索杯”第十七届全国大学生市场调查与分析大赛'
COVER_TITLE_LAYOUTS = ('horizontal', 'vertical')
DEFAULT_PREFERRED_COVER_CANDIDATE_ID = 'cover-cand-f'
COVER_CANDIDATE_SPEC_POOL = (
    {
        'id': 'cover-cand-f',
        'genre': 'optical_glass_macro',
        'label': 'F · 晶透光学玻璃静物微距风（默认首选）',
        'titleLayout': 'horizontal',
        'accent': 'teal',
        'isDefaultPreferred': True,
        'mediumPrompt': '高端晶透光学玻璃器皿与主题核心静物微距摄影级棚拍质感，晨光折射散景通透，极简高级静物美学',
    },
    {
        'id': 'cover-cand-a',
        'genre': 'song_xuan_gongbi',
        'label': 'A · 宋韵宣纸青金工笔行楷风',
        'titleLayout': 'horizontal',
        'accent': 'teal',
        'isDefaultPreferred': False,
        'mediumPrompt': '温润手工宣纸纤维肌理配青瓷绿与暖金游丝飘带，宋韵细线工笔淡彩人文场景',
    },
    {
        'id': 'cover-cand-b',
        'genre': 'swiss_cobalt_blueprint',
        'label': 'B · 钴蓝银灰瑞士数据蓝图现代风',
        'titleLayout': 'horizontal',
        'accent': 'blue',
        'isDefaultPreferred': False,
        'mediumPrompt': '冷峻高级钴蓝与银灰白现代瑞士网格蓝图构成，搭配精密等轴空间建筑白模',
    },
    {
        'id': 'cover-cand-c',
        'genre': 'danqing_cinnabar_vertical',
        'label': 'C · 丹青朱砂新中式竖排书法风',
        'titleLayout': 'vertical',
        'accent': 'burgundy',
        'isDefaultPreferred': False,
        'mediumPrompt': '东方新中式水墨丹青晕染配朱砂印泥红点睛与留白气韵，右侧竖排毛笔行书气势贯通',
    },
    {
        'id': 'cover-cand-d',
        'genre': 'indigo_amber_lightbox',
        'label': 'D · 深海靛蓝×琥珀暖光 3D 剪纸灯箱风',
        'titleLayout': 'horizontal',
        'accent': 'blue',
        'isDefaultPreferred': False,
        'mediumPrompt': '深海靛蓝与琥珀暖金多层无酸卡纸 3D 立体剪纸透光灯箱浮雕，层次分明温暖治愈',
    },
    {
        'id': 'cover-cand-e',
        'genre': 'warm_film_editorial',
        'label': 'E · 暖阳 35mm 胶片纪实人文大刊风',
        'titleLayout': 'horizontal',
        'accent': 'burgundy',
        'isDefaultPreferred': False,
        'mediumPrompt': '暖阳 35mm 胶片颗粒质感与人文特刊厚涂纪实插画笔触，故事感与烟火温度浓郁',
    },
)

_COVER_BANNED_META_RX = re.compile(
    r'市场调查与统计分析报告|标准化市场调查报告|教学模拟|模拟数据|模拟样本|模拟记录|不作为实际调查结论|不作为实际|仅作演示|免责说明|'
    r'随机种子|算法合成|演练语料|机器生成|人工智能|大语言模型|AI\s*生成|AIGC|测试样本|测试数据|测试',
    re.IGNORECASE,
)
_BLIND_REVIEW_INSTITUTION_RX = re.compile(
    r'[\u4e00-\u9fa5A-Za-z0-9]{1,16}(?:大学|学院|学校|校区|附中|中学|研究院|研究所|学部|教务处|委员会)'
)
_BANNED_UI_BRACKETS_RX = re.compile(r'[\u3010\u3011\u300c\u300d\u300e\u300f\[\]\{\}]')


def _normalize_ascii_quotes(raw_value: str) -> str:
    paired = re.sub(r'"([^"]+)"', r'“\1”', raw_value)
    return paired.replace('"', '')


def derive_blind_safe_team_name(title: str = '') -> str:
    """Derives a blind-review-compliant team name from topic (zero school or personal real names)."""
    cleaned = _BLIND_REVIEW_INSTITUTION_RX.sub('', _COVER_BANNED_META_RX.sub('', title or '')).strip()
    lead_segment = re.split(r'[：:—–\-]', cleaned)[0] if cleaned else ''
    lead_cjk = re.sub(r'[^\u4e00-\u9fa5]', '', lead_segment)
    if 2 <= len(lead_cjk) <= 6 and lead_cjk not in ('关于', '基于', '面向', '我国', '中国', '城市', '社区'):
        return lead_cjk if lead_cjk.endswith(('队', '组', '团')) else f'{lead_cjk}调研队'
    if re.search(r'银发|老年|长者|养老|健康监测|助餐', cleaned):
        return '银发智守调研队'
    if re.search(r'即时零售|闪购|骑手|外卖|消费', cleaned):
        return '数智民生调研队'
    if re.search(r'非遗|文旅|古镇|博物馆|传统', cleaned):
        return '寻脉新声调研队'
    if re.search(r'新能源|低碳|充电|绿色|生态', cleaned):
        return '绿行智联调研队'
    generic_cjk = re.sub(r'[^\u4e00-\u9fa5]', '', re.sub(r'^(?:关于|基于|面向|我国|中国|新时代)', '', cleaned))[:4]
    return f'{generic_cjk}调研队' if len(generic_cjk) >= 2 else '笃行实证调研队'


def sanitize_blind_safe_team_name(team_name: str | None = None, fallback_title: str = '') -> str:
    """Sanitizes a team name for strict blind-review compliance."""
    raw = re.sub(r'^(?:参赛团队|参赛队伍|队伍名称|团队名称|团队|队伍)\s*[:：]?\s*', '', team_name or '')
    raw = _BLIND_REVIEW_INSTITUTION_RX.sub('', _COVER_BANNED_META_RX.sub('', raw))
    raw = re.sub(r'[\x00-\x1f\x7f"“”\'‘’《》\u3010\u3011\u300c\u300d\u300e\u300f\[\]()（）\s]', '', raw).strip()
    cjk_only = re.sub(r'[^\u4e00-\u9fa5A-Za-z0-9]', '', raw)
    if len(cjk_only) < 2:
        return derive_blind_safe_team_name(fallback_title)
    if not re.search(r'(?:调研队|实践队|课题组|调研团|研学队|探索队|观察团|小分队|团队|小组)$', cjk_only):
        if re.fullmatch(r'[\u4e00-\u9fa5]{2,3}', cjk_only):
            return derive_blind_safe_team_name(fallback_title)
        return f'{cjk_only[:8]}调研队'
    return cjk_only[:14]


def normalize_cover_text_spec(spec: dict | None = None) -> dict:
    """Validates and normalizes the 3 mandatory cover text elements + non-rigid calligraphy layout."""
    payload = spec if isinstance(spec, dict) else {}
    layout_raw = payload.get('titleLayout')
    if layout_raw is not None and layout_raw not in COVER_TITLE_LAYOUTS:
        raise ApiError()
    title_layout = layout_raw or 'horizontal'

    comp_cleaned = re.sub(r'[“"\u300c\u300e]?正大杯[”"\u300d\u300f]?\s*第十七届', '“益普索杯”第十七届', _COVER_BANNED_META_RX.sub('', str(payload.get('competitionName') or '')))
    comp_raw = re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', comp_cleaned)).strip()
    competition_name = comp_raw[:48] if len(comp_raw) >= 6 else DEFAULT_COVER_COMPETITION_NAME

    title_raw = _normalize_ascii_quotes(_COVER_BANNED_META_RX.sub('', str(payload.get('title') or '')))
    title_clean = re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', title_raw)).strip()
    main_title = (title_clean or '社会民生与消费体验专题实证研究')[:52]

    sub_raw = _normalize_ascii_quotes(_COVER_BANNED_META_RX.sub('', str(payload.get('subtitle') or '')))
    subtitle = re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', sub_raw)).strip()[:56]

    team_name = sanitize_blind_safe_team_name(
        str(payload['teamName']) if payload.get('teamName') is not None else None,
        main_title,
    )
    return {
        'competitionName': competition_name,
        'mainTitle': main_title,
        'subtitle': subtitle,
        'teamName': team_name,
        'teamLabel': f'参赛团队：{team_name}',
        'titleLayout': title_layout,
    }


def build_cover_typography_prompt(
    spec: dict | None = None,
    accent_hex: str = '#0F766E',
    ink_mode: str = 'dark_on_light',
) -> str:
    """Builds the canonical cover typography specification (edition competition + non-rigid artistic lettering + blind-safe team)."""
    norm = normalize_cover_text_spec(spec)
    display_main_title = _BANNED_UI_BRACKETS_RX.sub('', norm['mainTitle']).strip() or norm['mainTitle']
    display_subtitle = _BANNED_UI_BRACKETS_RX.sub('', norm['subtitle']).strip()
    layout_clause = (
        '竖排非板正艺术字（全出血杂志海报级编排，依题材气质自由选用书法行楷、雕塑现代字或手绘构成字，居右或视觉焦点竖向错落排布，核心字破格放大高亮，绝非死板电脑印刷正体）'
        if norm['titleLayout'] == 'vertical'
        else '横排或阶梯错落非板正艺术字（全出血杂志海报级编排，依题材气质自由选用手写书法、现代雕塑光弧字、几何构成字或人文大刊字，富于字重对比、节奏错位与字图呼应，绝非白纸死板居中排印）'
    )
    ink_clause = (
        '亮暖金/象牙白高反差字色，与深色底面形成通透对比'
        if ink_mode == 'light_on_dark'
        else '与底色协调的高反差深墨/主题色字形'
    )
    lines = [
        '封面须完整呈现以下三大文字要素并遵循非板正艺术字编排要求。',
        f'1. 顶部置顶眉栏以优雅小字精确书写赛事届次全称"{norm["competitionName"]}"；',
        f'2. 选题核心主标题采用{layout_clause}，严禁使用死板机械的电脑印刷黑体或印刷宋体，精确书写"{display_main_title}"（{ink_clause}，每一笔偏旁清晰可辨零错字）；',
    ]
    if display_subtitle:
        lines.append(
            f'3. 选题副标题置入低干扰安静区域（可配主色 {accent_hex} 淡雅色带、细线导引或竖列排布），以清晰易读字体精确书写"{display_subtitle}"，完整承托实证选题范围；'
        )
    idx = 4 if display_subtitle else 3
    lines.append(f'{idx}. 封面底部居中或右下角盲审合规署名栏以端秀小字精确书写"{norm["teamLabel"]}"（仅限课题队名，绝不含学校或个人真实姓名）。')
    lines.append(
        '画面内严格且仅允许渲染上述双引号内指定的文字要素，严禁添加自述文种身份的冗余报告类别词，严禁出现虚构演练免责声明、机器合成标识、校徽院徽、高校名称或个人真实姓名。'
    )
    return '\n'.join(lines)


def build_clean_backdrop_prompt(
    topic: str = '',
    typography_style: str = 'sculpted_orbit',
    accent_hex: str = '#0F766E',
    breathing_ratio: float | None = None,
    ink_mode: str = 'dark_on_light',
    art_direction: str = '',
) -> str:
    """Builds the clean textless cover backdrop description reserving negative space matching reference light/dark mood."""
    if typography_style not in COVER_TYPOGRAPHY_STYLES:
        raise ApiError(422, 'invalid_typography_style', '暂不支持所选的封面字体版式风格。')
    clean_topic = _BANNED_UI_BRACKETS_RX.sub(
        '',
        _BLIND_REVIEW_INSTITUTION_RX.sub('', _COVER_BANNED_META_RX.sub('', topic or '')),
    ).strip()[:36]
    subject = clean_topic or '专题实证调研'
    default_ratio = 0.58 if typography_style == 'cinnabar_vertical' else 0.44
    ratio = breathing_ratio if isinstance(breathing_ratio, (int, float)) and 0.36 <= float(breathing_ratio) <= 0.68 else default_ratio
    upper_pct = int(round(float(ratio) * 100))
    lower_pct = 100 - upper_pct

    custom_dir = _BANNED_UI_BRACKETS_RX.sub('', _COVER_BANNED_META_RX.sub('', art_direction or '')).strip()[:160]
    if custom_dir:
        medium_clause = f'{custom_dir}（主色呼应 {accent_hex}，视觉主体凝聚于画面下 {lower_pct}%）'
    elif typography_style == 'cinnabar_vertical':
        medium_clause = (
            f'东方新中式手工宣纸纤维肌理配水墨与暖金细线笔触意境（主色 {accent_hex}），'
            f'视觉意象凝聚于画面下 {lower_pct}% 的墨韵弧线与主题实体隐喻'
        )
    elif typography_style == 'xuan_calligraphy':
        medium_clause = (
            f'温润纸纹淡彩与层次光影肌理（主色 {accent_hex}），主题核心意象凝练安放于画面下 {lower_pct}%'
        )
    elif typography_style == 'staggered_poster':
        medium_clause = (
            f'现代海报纯净光影构成与高质感主题实体/场景视觉（主色 {accent_hex}），主视觉锚定于画面下 {lower_pct}%'
        )
    else:
        medium_clause = (
            f'高质感主题核心器物静物/环境光影（主色 {accent_hex}），'
            f'主体意象安放于画面下 {lower_pct}%'
        )

    neg_tone = '沉静均匀的深色呼吸负空间' if ink_mode == 'light_on_dark' else '纯净均匀的浅色呼吸负空间'
    bottom_tone = '干净深底负空间' if ink_mode == 'light_on_dark' else '干净浅底负空间'

    return '\n'.join([
        f'创作一张 A4 竖版（210:297，1000×1414）纯无字报告封面背景底图，围绕“{subject}”研究主题，采用{medium_clause}。',
        f'1. 画面上方 {upper_pct}% 区域须留出{neg_tone}供艺术字图层排布，底部 8%–10% 保持{bottom_tone}供盲审署名栏排布；',
        '2. 全图严格保持零汉字、零字母、零数字、零印章、零标牌、零水印与零伪文字笔画（strictly zero Chinese characters, zero letters, zero digits, zero seals, zero logos）。',
    ])


def build_frame_perimeter_prompt(topic: str = '', accent_hex: str = '#0F766E') -> str:
    """Builds the source-stage ultra-narrow 4%–6% perimeter specification for page frames (zero inner feather-blur)."""
    clean_topic = _BANNED_UI_BRACKETS_RX.sub('', _COVER_BANNED_META_RX.sub('', topic or '')).strip()[:26] or '学术实证调查'
    return '\n'.join([
        f'围绕“{clean_topic}”设计 A4 竖版（210:297）极细外缘透明装饰页框（主色 {accent_hex} 搭配暖金 #C99A3E 细线）。',
        '1. 所有边框双细线与四角纹样须严格紧贴页面最外缘 4%–6%（距纸边 8.5mm–12.5mm）的极窄边带内，角饰紧收在最外角绝不向内蔓延侵入；',
        '2. 四周留白核心区 >= 88%×88% 保持 100% 纯白或全透明净空，底部正中央页码区自然留空断开；',
        '3. 严禁任何边缘羽化虚化、白雾渐变遮罩或半透明模糊过渡，所有几何折线、回纹角花与植物细线须保持笔触 100% 锐利闭合、干净利落，且画面零内嵌文字。',
    ])


def retract_frame_rgba_crisply(input_rgba: bytes | bytearray, width: int, height: int) -> bytes:
    """Keys out white background and proportionally retracts any inward-intruding border strip WITHOUT feather-blur bite."""
    if width <= 0 or height <= 0 or len(input_rgba) != width * height * 4:
        raise ValueError('Invalid RGBA buffer dimensions')
    rgba = bytearray(input_rgba)

    for i in range(0, len(rgba), 4):
        a = rgba[i + 3]
        if a == 0:
            continue
        r, g, b = rgba[i], rgba[i + 1], rgba[i + 2]
        min_ch = min(r, g, b)
        chroma = max(r, g, b) - min_ch
        if min_ch >= 245 and chroma <= 10:
            rgba[i:i + 4] = b'\x00\x00\x00\x00'
        elif min_ch >= 234 and chroma <= 14:
            ink_alpha = round(a * ((245 - min_ch) / 11.0))
            if ink_alpha <= 8:
                rgba[i:i + 4] = b'\x00\x00\x00\x00'
            else:
                rgba[i + 3] = ink_alpha

    px_per_mm = width / 210.0
    body_zone, page_num_zone = FRAME_CLEAR_ZONES_MM
    safe_left = max(1, int(body_zone['x0'] * px_per_mm) - 1)
    safe_right_start = min(width - 2, int(-(-body_zone['x1'] * px_per_mm // 1)) + 1)
    safe_top = max(1, int(body_zone['y0'] * px_per_mm) - 1)
    safe_bottom_start = min(height - 2, int(-(-body_zone['y1'] * px_per_mm // 1)) + 1)

    bx0 = int(body_zone['x0'] * px_per_mm)
    bx1 = min(width, int(-(-body_zone['x1'] * px_per_mm // 1)))
    by0 = int(body_zone['y0'] * px_per_mm)
    by1 = min(height, int(-(-body_zone['y1'] * px_per_mm // 1)))

    mid_x, mid_y = width // 2, height // 2
    max_left_x, min_right_x = safe_left, safe_right_start
    max_top_y, min_bottom_y = safe_top, safe_bottom_start
    has_intrusion = False

    for y in range(by0, by1):
        row_off = y * width * 4
        for x in range(bx0, bx1):
            if rgba[row_off + x * 4 + 3] > 8:
                has_intrusion = True
                dl, dr = x - bx0, bx1 - 1 - x
                dt, db = y - by0, by1 - 1 - y
                m = min(dl, dr, dt, db)
                if m == dl and x < mid_x and x + 1 > max_left_x:
                    max_left_x = x + 1
                elif m == dr and x >= mid_x and x - 1 < min_right_x:
                    min_right_x = x - 1
                elif m == dt and y < mid_y and y + 1 > max_top_y:
                    max_top_y = y + 1
                elif y >= mid_y and y - 1 < min_bottom_y:
                    min_bottom_y = y - 1

    working = rgba
    if has_intrusion:
        retracted = bytearray(len(rgba))

        def map_coord(dst: int, total: int, safe_low: int, src_low_max: int, safe_high: int, src_high_min: int) -> int:
            if dst < safe_low:
                return min(total - 1, round((dst / max(1, safe_low)) * src_low_max))
            dst_span = max(1, total - 1 - safe_high)
            src_span = max(1, total - 1 - src_high_min)
            return max(0, min(total - 1, round(total - 1 - ((total - 1 - dst) / dst_span) * src_span)))

        for y in range(height):
            in_outer_y = y < safe_top or y >= safe_bottom_start
            for x in range(width):
                in_outer_x = x < safe_left or x >= safe_right_start
                if not in_outer_x and not in_outer_y:
                    continue
                sx = map_coord(x, width, safe_left, max_left_x, safe_right_start, min_right_x) if in_outer_x else x
                sy = map_coord(y, height, safe_top, max_top_y, safe_bottom_start, min_bottom_y) if in_outer_y else y
                di = (y * width + x) * 4
                si = (sy * width + sx) * 4
                retracted[di:di + 4] = rgba[si:si + 4]
        working = retracted

    px0 = max(0, int(page_num_zone['x0'] * px_per_mm))
    px1 = min(width, int(-(-page_num_zone['x1'] * px_per_mm // 1)))
    py0 = max(0, int(page_num_zone['y0'] * px_per_mm))
    py1 = min(height, int(-(-page_num_zone['y1'] * px_per_mm // 1)))
    for y in range(py0, py1):
        row_off = y * width * 4
        for x in range(px0, px1):
            idx = row_off + x * 4
            working[idx:idx + 4] = b'\x00\x00\x00\x00'

    return bytes(working)


def image_size(data, mime):
    """The pixel size a PNG or JPEG states in its own header, or None."""
    if mime == 'image/png':
        if len(data) < 24 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b'IHDR':
            return None
        return int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    if len(data) < 4 or data[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = int.from_bytes(data[i + 2:i + 4], 'big')
        if length < 2:
            return None
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            return int.from_bytes(data[i + 7:i + 9], 'big'), int.from_bytes(data[i + 5:i + 7], 'big')
        i += 2 + length
    return None


def _art_bytes(value, kind):
    limits = LIMITS[kind]
    if not isinstance(value, dict) or set(value) != KEYS or value['schema'] != limits['schema']:
        raise ApiError()
    mime, data, note = value['mime'], value['data'], value['note']
    if mime not in limits['mimes'] or not isinstance(data, str) or len(data) > -(-limits['bytes'] // 3) * 4:
        raise ApiError()
    if not re.fullmatch(r'[A-Za-z0-9+/]+={0,2}', data) or len(data) % 4:
        raise ApiError()
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError() from None
    if len(raw) > limits['bytes']:
        raise ApiError()
    size = image_size(raw, mime)
    width, height = value['widthPx'], value['heightPx']
    if not size or type(width) is not int or type(height) is not int or size != (width, height):
        raise ApiError()
    if width < MIN_WIDTH or max(width, height) > MAX_SIDE or abs(width / height / A4_ASPECT - 1) > ASPECT_TOLERANCE:
        raise ApiError()
    if not isinstance(note, str) or not note.strip() or len(note) > MAX_NOTE or re.search(r'[\x00-\x1f\x7f]', note):
        raise ApiError()
    return raw


def cover_image_bytes(value):
    """Validates a cover image and returns its decoded bytes."""
    return _art_bytes(value, 'cover')


def frame_image_bytes(value):
    """Validates a frame image and returns its decoded bytes."""
    return _art_bytes(value, 'frame')


def section_illustration_bytes(value):
    """Validates a SectionIllustration/v1 image and returns its decoded bytes."""
    limits = SECTION_ILLUSTRATION_LIMITS
    if not isinstance(value, dict) or set(value) != SECTION_ILLUSTRATION_KEYS or value['schema'] != limits['schema']:
        raise ApiError()
    for field in ('id', 'resultId'):
        ident = text(value[field], 80, 1)
        if not ident.strip() or '\x7f' in ident:
            raise ApiError()
    mime, data, note = value['mime'], value['data'], value['note']
    if mime not in limits['mimes'] or not isinstance(data, str) or len(data) > -(-limits['bytes'] // 3) * 4:
        raise ApiError()
    if not re.fullmatch(r'[A-Za-z0-9+/]+={0,2}', data) or len(data) % 4:
        raise ApiError()
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError() from None
    if len(raw) > limits['bytes']:
        raise ApiError()
    size = image_size(raw, mime)
    width, height = value['widthPx'], value['heightPx']
    if not size or type(width) is not int or type(height) is not int or size != (width, height):
        raise ApiError()
    if not (limits['min_width'] <= width <= limits['max_width'] and limits['min_height'] <= height <= limits['max_height']):
        raise ApiError()
    text(note, MAX_NOTE, 1)
    if not note.strip() or re.search(r'[\x00-\x1f\x7f]', note):
        raise ApiError()
    return raw


def cover_image_file(value):
    """The file name the LaTeX source includes and the compiler writes next to it."""
    return 'cover-image.png' if value['mime'] == 'image/png' else 'cover-image.jpg'


def cover_image_titlepage(value):
    """The title page that prints the cover over the whole page; byte-identical with the frontend."""
    return [
        r'\begin{titlepage}',
        r'\begin{tikzpicture}[remember picture,overlay]',
        r'\node[inner sep=0pt] at (current page.center) {\includegraphics[width=\paperwidth,height=\paperheight]{' + cover_image_file(value) + '}};',
        r'\end{tikzpicture}',
        r'\end{titlepage}',
    ]


def frame_image_preamble():
    """Lays the frame image behind every page while \\ReportFrameImagetrue; byte-identical with the frontend."""
    return [
        r'\newif\ifReportFrameImage',
        r'\ReportFrameImagefalse',
        r'\AddToHook{shipout/background}{\ifReportFrameImage\begin{tikzpicture}[remember picture,overlay]\node[inner sep=0pt] at (current page.center) {\includegraphics[width=\paperwidth,height=\paperheight]{' + FRAME_IMAGE_FILE + r'}};\end{tikzpicture}\fi}',
    ]
