/**
 * Dual-Track Cover Production Engine (Wave 8 — Isomorphic Frontend Contract & Vector Layer Compositor)
 *
 * - Mode 1 (`direct_illustrated`): 6 diversified cross-medium "益普索杯" direct illustrated A4 covers (`F/E/C/B/D/A`).
 * - Mode 2 (`layered_assembly`): 4-stage Reference-Guided Layered Assembly:
 *   ① Reference Cover (`cover-cand-{f,c}.png`) -> ② Clean Zero-Text Backdrop (`backdrop-cand-{f,c}.png`)
 *   -> ③ Transparent Vector Calligraphy SVG (`buildTransparentCoverTypographySvg` / backend `matplotlib.textpath` Bézier `<path>`)
 *   -> ④ Anchor-Aligned Final A4 Composite (`1000×1414`, `CoverImage/v1` + `FigurePalette/v1`).
 */

import { paletteFromPixels, type FigurePalette } from './figure-palette.ts';
import {
  A4_ASPECT,
  DEFAULT_COVER_COMPETITION_NAME,
  PAGE_ART_LIMITS,
  deriveBlindSafeTeamName,
  imageSize,
  normalizeCoverTextSpec,
  parseCoverImage,
  type CoverImage,
} from './page-art.ts';

export const COVER_CANVAS_PX = { width: 1000, height: 1414 } as const;

export const COVER_PIPELINE_MODES = ['direct_illustrated', 'layered_assembly'] as const;
export type CoverPipelineMode = (typeof COVER_PIPELINE_MODES)[number];

export const COVER_TYPOGRAPHY_STYLES = [
  'sculpted_orbit',
  'cinnabar_vertical',
  'xuan_calligraphy',
  'staggered_poster',
  'editorial_serif',
  'modern_geometric',
] as const;
export type CoverTypographyStyle = (typeof COVER_TYPOGRAPHY_STYLES)[number];

export type CoverInkMode = 'dark_on_light' | 'light_on_dark';

export interface CoverZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoverReferenceAnchors {
  canvasWidth: number;
  canvasHeight: number;
  headerZone: CoverZoneRect;
  titleZone: CoverZoneRect;
  subtitleZone: CoverZoneRect;
  teamPlaqueZone: CoverZoneRect;
  titleDirection: 'horizontal' | 'vertical' | 'staggered';
  inkMode: CoverInkMode;
}

export interface CoverTypographyStyleOption {
  id: CoverTypographyStyle;
  label: string;
  shortLabel: string;
  badge: string;
  defaultDirection: 'horizontal' | 'vertical' | 'staggered';
}

export const COVER_TYPOGRAPHY_STYLE_OPTIONS: readonly CoverTypographyStyleOption[] = [
  {
    id: 'sculpted_orbit',
    label: '蓝金光弧雕塑艺术字（横排首选）',
    shortLabel: '蓝金光弧横排',
    badge: '深海蓝金渐变 + 椭圆光弧轨 + 左金条导引副题',
    defaultDirection: 'horizontal',
  },
  {
    id: 'cinnabar_vertical',
    label: '新中式竖排书法 + 朱砂篆印',
    shortLabel: '竖排朱砂篆印',
    badge: '右侧竖排行楷大字 + 朱砂闲章 + 左列清雅副题',
    defaultDirection: 'vertical',
  },
  {
    id: 'xuan_calligraphy',
    label: '宣纸行楷 + 朱金高亮晕染',
    shortLabel: '宣纸行楷朱金',
    badge: '破格高亮核心字 + 青瓷渐变色带副题',
    defaultDirection: 'horizontal',
  },
  {
    id: 'staggered_poster',
    label: '杂志海报级阶梯错落叠影',
    shortLabel: '阶梯错落海报',
    badge: '阶梯字号错位排布 + 飞白轻叠影 + 虚线胶囊副题',
    defaultDirection: 'staggered',
  },
  {
    id: 'editorial_serif',
    label: '现代出版衬线大刊',
    shortLabel: '出版衬线大刊',
    badge: '思源宋体与华文中宋 + 精致双细线刊头 + 高可读性阅读框',
    defaultDirection: 'horizontal',
  },
  {
    id: 'modern_geometric',
    label: '瑞士现代几何无衬线',
    shortLabel: '现代几何无衬线',
    badge: '思源黑体几何字重 + 眉标色块 + 理性网格副题',
    defaultDirection: 'horizontal',
  },
] as const;

export type CleanBackdropPresetId = 'f' | 'e' | 'c' | 'b' | 'd' | 'a';

export interface CleanBackdropPreset {
  id: CleanBackdropPresetId;
  label: string;
  shortLabel: string;
  badge: string;
  referenceUrl: string;
  backdropUrl: string;
  defaultTypographyStyle: CoverTypographyStyle;
  accent: 'teal' | 'blue' | 'burgundy';
  inkMode: CoverInkMode;
  anchors: CoverReferenceAnchors;
}

export const CLEAN_BACKDROP_PRESETS: readonly CleanBackdropPreset[] = [
  {
    id: 'f',
    label: 'F · 晶透光学玻璃静物微距底图（首选）',
    shortLabel: 'F · 光学玻璃微距',
    badge: '上部 46% 晨光纯净留白 + 研究主题光学玻璃器物微距',
    referenceUrl: '/art/candidates/cover-cand-f.png',
    backdropUrl: '/art/candidates/backdrop-cand-f.png',
    defaultTypographyStyle: 'sculpted_orbit',
    accent: 'teal',
    inkMode: 'dark_on_light',
    anchors: {
      canvasWidth: 1000,
      canvasHeight: 1414,
      headerZone: { x: 90, y: 74, width: 820, height: 48 },
      titleZone: { x: 96, y: 175, width: 808, height: 225 },
      subtitleZone: { x: 155, y: 468, width: 700, height: 112 },
      teamPlaqueZone: { x: 290, y: 1298, width: 420, height: 62 },
      titleDirection: 'horizontal',
      inkMode: 'dark_on_light',
    },
  },
  {
    id: 'e',
    label: 'E · 暖阳 35mm 胶片纪实人文大刊底图',
    shortLabel: 'E · 暖阳胶片大刊',
    badge: '上部 38% 暖米杂志留白 + 暖阳胶片特写 + 焦糖古铜手写大字',
    referenceUrl: '/art/candidates/cover-cand-e.png',
    backdropUrl: '/art/candidates/backdrop-cand-e.png',
    defaultTypographyStyle: 'staggered_poster',
    accent: 'burgundy',
    inkMode: 'dark_on_light',
    anchors: {
      canvasWidth: 1000,
      canvasHeight: 1414,
      headerZone: { x: 80, y: 58, width: 840, height: 44 },
      titleZone: { x: 88, y: 128, width: 824, height: 216 },
      subtitleZone: { x: 130, y: 392, width: 740, height: 108 },
      teamPlaqueZone: { x: 285, y: 1296, width: 430, height: 62 },
      titleDirection: 'staggered',
      inkMode: 'dark_on_light',
    },
  },
  {
    id: 'c',
    label: 'C · 丹青朱砂新中式竖排书法底图',
    shortLabel: 'C · 丹青朱砂竖排',
    badge: '上部 54% 宣纸纯净留白 + 丹青朱砂城市心电笔触长卷',
    referenceUrl: '/art/candidates/cover-cand-c.png',
    backdropUrl: '/art/candidates/backdrop-cand-c.png',
    defaultTypographyStyle: 'cinnabar_vertical',
    accent: 'burgundy',
    inkMode: 'dark_on_light',
    anchors: {
      canvasWidth: 1000,
      canvasHeight: 1414,
      headerZone: { x: 80, y: 68, width: 840, height: 48 },
      titleZone: { x: 610, y: 150, width: 280, height: 590 },
      subtitleZone: { x: 110, y: 285, width: 465, height: 150 },
      teamPlaqueZone: { x: 285, y: 1296, width: 430, height: 62 },
      titleDirection: 'vertical',
      inkMode: 'dark_on_light',
    },
  },
  {
    id: 'b',
    label: 'B · 钴蓝银灰瑞士数据蓝图底图',
    shortLabel: 'B · 瑞士钴蓝蓝图',
    badge: '上部 48% 银灰瑞士精密网格 + 钴蓝珊瑚双侧颜心电圆盘',
    referenceUrl: '/art/candidates/cover-cand-b.png',
    backdropUrl: '/art/candidates/backdrop-cand-b.png',
    defaultTypographyStyle: 'sculpted_orbit',
    accent: 'blue',
    inkMode: 'dark_on_light',
    anchors: {
      canvasWidth: 1000,
      canvasHeight: 1414,
      headerZone: { x: 90, y: 74, width: 820, height: 46 },
      titleZone: { x: 96, y: 168, width: 808, height: 222 },
      subtitleZone: { x: 145, y: 455, width: 710, height: 110 },
      teamPlaqueZone: { x: 285, y: 1302, width: 430, height: 58 },
      titleDirection: 'horizontal',
      inkMode: 'dark_on_light',
    },
  },
  {
    id: 'd',
    label: 'D · 深海靛蓝×琥珀暖光 3D 剪纸灯箱底图（暗底浅金）',
    shortLabel: 'D · 靛蓝琥珀灯箱',
    badge: '深海靛蓝暗底 + 暖金与象牙白发光艺术字',
    referenceUrl: '/art/candidates/cover-cand-d.png',
    backdropUrl: '/art/candidates/backdrop-cand-d.png',
    defaultTypographyStyle: 'staggered_poster',
    accent: 'blue',
    inkMode: 'light_on_dark',
    anchors: {
      canvasWidth: 1000,
      canvasHeight: 1414,
      headerZone: { x: 80, y: 58, width: 840, height: 44 },
      titleZone: { x: 88, y: 126, width: 824, height: 218 },
      subtitleZone: { x: 140, y: 390, width: 720, height: 102 },
      teamPlaqueZone: { x: 275, y: 1298, width: 450, height: 64 },
      titleDirection: 'staggered',
      inkMode: 'light_on_dark',
    },
  },
  {
    id: 'a',
    label: 'A · 宋韵宣纸青金工笔行楷底图',
    shortLabel: 'A · 宋韵宣纸青金',
    badge: '上部 42% 宣纸留白 + 花窗银杏温情工笔 + 深松墨朱金行楷',
    referenceUrl: '/art/candidates/cover-cand-a.png',
    backdropUrl: '/art/candidates/backdrop-cand-a.png',
    defaultTypographyStyle: 'xuan_calligraphy',
    accent: 'teal',
    inkMode: 'dark_on_light',
    anchors: {
      canvasWidth: 1000,
      canvasHeight: 1414,
      headerZone: { x: 85, y: 68, width: 830, height: 46 },
      titleZone: { x: 96, y: 148, width: 808, height: 218 },
      subtitleZone: { x: 135, y: 416, width: 730, height: 102 },
      teamPlaqueZone: { x: 285, y: 1300, width: 430, height: 60 },
      titleDirection: 'horizontal',
      inkMode: 'dark_on_light',
    },
  },
] as const;

export interface CoverLayeredSpec {
  competitionName?: string;
  title: string;
  subtitle?: string;
  teamName?: string;
  typographyStyle?: CoverTypographyStyle;
  anchors?: Partial<CoverReferenceAnchors>;
  inkMode?: CoverInkMode;
}

export interface CoverLayeredState {
  mode: CoverPipelineMode;
  selectedPresetId: CleanBackdropPresetId;
  referenceUrl: string;
  backdropUrl: string;
  competitionName: string;
  title: string;
  subtitle: string;
  teamName: string;
  typographyStyle: CoverTypographyStyle;
  inkMode: CoverInkMode;
  anchors: CoverReferenceAnchors;
  vectorTypographySvg: string;
  vectorTypographyDataUrl: string;
  assembledDataUrl: string;
  assembledSource: 'backend_bezier' | 'client_canvas' | 'pending';
}

export interface BackendCoverAssemblyResponse {
  ok: boolean;
  source: 'backend_bezier' | 'client_canvas';
  mode: 'layered_assembly';
  referenceAnalysis: CoverReferenceAnchors;
  vectorTypographySvg: string;
  vectorTypographyDataUrl: string;
  assembledDataUrl: string;
  coverImage?: CoverImage;
  figurePalette?: FigurePalette;
  width: number;
  height: number;
}

const CALLIGRAPHY_FONT_STACK =
  "'STXingkai', 'FZShuTi', 'STXinwei', 'Huawen Xingkai', 'STKaiti', 'KaiTi', 'Songti SC', serif";
const KAITI_FONT_STACK =
  "'STKaiti', 'KaiTi', 'FangSong', 'Songti SC', 'Noto Serif SC', serif";
const EDITORIAL_SANS_STACK =
  "'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', 'SimSun', serif";
const EDITORIAL_SERIF_STACK =
  "'Noto Serif SC', 'Source Han Serif SC', 'STZhongsong', 'Songti SC', 'SimSun', serif";
const MODERN_GEOMETRIC_STACK =
  "'Noto Sans SC', 'Source Han Sans CN', 'PingFang SC', 'STXihei', 'DengXian', 'Microsoft YaHei', sans-serif";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapChineseLines(text: string, maxPerLine: number, maxLines = 2): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const chars = Array.from(clean);
  if (chars.length <= maxPerLine) return [clean];
  if (maxLines === 2 && chars.length <= maxPerLine * 2) {
    // Split near semantic conjunctions (`与`, `及`, `和`) around the midpoint when possible
    const mid = Math.ceil(chars.length / 2);
    let splitIdx = mid;
    for (let offset = 0; offset <= 4; offset++) {
      for (const candidate of [mid - offset, mid + offset]) {
        if (candidate > 4 && candidate < chars.length - 4 && /[与及和跟对在]/u.test(chars[candidate])) {
          splitIdx = candidate;
          offset = 99;
          break;
        }
      }
    }
    return [chars.slice(0, splitIdx).join(''), chars.slice(splitIdx).join('')];
  }
  const lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += maxPerLine) {
    lines.push(chars.slice(i, i + maxPerLine).join(''));
  }
  return lines;
}

function scrubCoverBrackets(raw: string): string {
  return raw
    .replace(/\u300c/gu, '“')
    .replace(/\u300d/gu, '”')
    .replace(/\u300e/gu, '‘')
    .replace(/\u300f/gu, '’')
    .replace(/[\u3010\u3011\[\]{}]/gu, '')
    .replace(/"([^"]+)"/gu, '“$1”')
    .replace(/"/gu, '');
}

/**
 * Splits a dual-segment Chinese survey title (e.g. `"银发“智”守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查"`)
 * into a concise poetic hero calligraphy hook + balanced subtitle lines so cover typography breathes like a National First-Prize poster.
 */
export function splitHeroAndTopicLines(
  rawTitle: string,
  rawSubtitle?: string,
): {
  heroLead: string;
  heroHighlightIndex: number;
  topicLines: string[];
  empiricalLine: string;
} {
  const sourceTitle = (rawTitle || '').trim() || '银发“智”守：城市老年人智能健康监测采纳调查';
  const rawColonMatch = sourceTitle.match(/^([^：:—–\-]{2,10})\s*[：:—–\-]+\s*(.+)$/u);
  const rawHeroSegment = rawColonMatch ? rawColonMatch[1].trim() : sourceTitle.slice(0, 8).trim();
  const highlightMatch = rawHeroSegment.match(/(?:“(.)”|\u300c(.)\u300d|"(.?)")/u);
  const highlightedChar = highlightMatch?.[1] || highlightMatch?.[2] || highlightMatch?.[3] || '';

  const cleanTitle = scrubCoverBrackets(sourceTitle);
  const colonMatch = cleanTitle.match(/^([^：:—–\-]{2,10})\s*[：:—–\-]+\s*(.+)$/u);
  const heroLead = colonMatch ? colonMatch[1].trim() : cleanTitle.slice(0, 8).trim();
  const tailFromTitle = colonMatch ? colonMatch[2].trim() : cleanTitle.length > 8 ? cleanTitle : '';

  const heroChars = Array.from(heroLead);
  const matchedIdx = highlightedChar ? heroChars.findIndex(ch => ch === highlightedChar) : -1;
  const heroHighlightIndex =
    matchedIdx >= 0
      ? matchedIdx
      : Math.min(Math.floor(heroChars.length / 2), Math.max(0, heroChars.length - 1));

  const cleanedSubtitle = scrubCoverBrackets((rawSubtitle ?? '').trim());
  const primarySubSource = tailFromTitle || cleanedSubtitle;
  const topicLines = wrapChineseLines(primarySubSource, 16, 2);
  const empiricalLine =
    tailFromTitle && cleanedSubtitle && cleanedSubtitle !== tailFromTitle
      ? cleanedSubtitle.slice(0, 34)
      : '';

  return {
    heroLead,
    heroHighlightIndex,
    topicLines,
    empiricalLine,
  };
}

/**
 * Builds a strict zero-text Clean Backdrop prompt (`layer: 'clean_backdrop'`) reserving upper 36%–68% and bottom 10%
 * pure negative space (supporting both light and dark moods, open art direction) so vector typography overlays cleanly.
 */
export function buildCleanBackdropPrompt(params: {
  title?: string;
  genre?: string;
  accent?: 'teal' | 'blue' | 'burgundy';
  breathRatio?: number;
  inkMode?: CoverInkMode;
  artDirection?: string;
} = {}): string {
  const ratio =
    typeof params.breathRatio === 'number' && params.breathRatio >= 0.36 && params.breathRatio <= 0.68
      ? params.breathRatio
      : 0.46;
  const breathPct = Math.round(ratio * 100);
  const lowerPct = 100 - breathPct;
  const cleanSubject =
    scrubCoverBrackets(
      (params.title ?? '').replace(/市场调查与统计分析报告|教学模拟|模拟|测试|AI/giu, ''),
    )
      .replace(/[“”‘’]/gu, '')
      .trim()
      .slice(0, 30) || '专题实证调研';
  const customDir = scrubCoverBrackets(
    (params.artDirection ?? '').replace(/市场调查与统计分析报告|教学模拟|模拟|测试|AI/giu, ''),
  )
    .trim()
    .slice(0, 160);
  const genreClause = customDir
    ? `${customDir}，视觉主体凝聚于画面下 ${lowerPct}%`
    : params.genre === 'danqing_cinnabar_vertical'
      ? `东方新中式纸纹水墨丹青与暖金细线意境，主体隐喻凝聚于画面下 ${lowerPct}%`
      : `围绕选题核心意象自由择取适配媒介与真实光影（如静物微距、人文场景、版画插画、空间立体构成或建筑极简等），主视觉凝聚于画面下 ${lowerPct}%`;
  const isDark = params.inkMode === 'light_on_dark';
  const upperNegTone = isDark
    ? '沉静均匀的深色呼吸负空间（供叠加亮色或暖金矢量化艺术字主标题）'
    : '纯净均匀的浅色呼吸负空间（供叠加深墨或主题色矢量化艺术字主标题）';
  const bottomNegTone = isDark ? '干净深底负空间' : '干净浅底负空间';

  return [
    `创作一张 A4 竖版（210:297，1000×1414）纯无字报告封面背景底图，围绕“${cleanSubject}”研究主题，采用${genreClause}。`,
    `1. 页面上方 ${breathPct}% 区域须保持${upperNegTone}，页面底部 10% 区域保持${bottomNegTone}（供叠加参赛团队铭牌），主视觉静物或意象集中在页面中下部；`,
    '2. 整幅底图内严禁出现任何汉字、伪汉字笔画、英文字母、阿拉伯数字、印章文字、角标、坐标轴或水印（strictly zero text, zero characters, zero numbers, zero stamps, zero logos）。',
  ].join('\n');
}

/** Encodes raw SVG markup into a browser- & `<img>`-safe `data:image/svg+xml;charset=utf-8,...` URL. */
export function svgToDataUrl(svgMarkup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

/** Resolves merged anchors for a preset/style + optional partial overrides. */
export function resolveCoverReferenceAnchors(
  style: CoverTypographyStyle,
  overrides?: Partial<CoverReferenceAnchors>,
  presetId?: CleanBackdropPresetId,
): CoverReferenceAnchors {
  const matchedPreset = presetId
    ? CLEAN_BACKDROP_PRESETS.find(p => p.id === presetId)
    : undefined;
  const basePreset =
    matchedPreset
    ?? (style === 'cinnabar_vertical' ? CLEAN_BACKDROP_PRESETS.find(p => p.id === 'c')! : CLEAN_BACKDROP_PRESETS[0]);
  return {
    ...basePreset.anchors,
    ...overrides,
    headerZone: { ...basePreset.anchors.headerZone, ...(overrides?.headerZone ?? {}) },
    titleZone: { ...basePreset.anchors.titleZone, ...(overrides?.titleZone ?? {}) },
    subtitleZone: { ...basePreset.anchors.subtitleZone, ...(overrides?.subtitleZone ?? {}) },
    teamPlaqueZone: { ...basePreset.anchors.teamPlaqueZone, ...(overrides?.teamPlaqueZone ?? {}) },
  };
}

/**
 * Generates an instant, 100% transparent-background (`alpha = 0` outside glyphs/ornaments, zero full-page `<rect>`)
 * A4 `1000×1414` Vector Calligraphy SVG carrying all 3 mandatory 17th-edition elements:
 * 1) `“益普索杯”第十七届全国大学生市场调查与分析大赛`
 * 2) Non-rigid expressive artistic title (`sculpted_orbit` / `cinnabar_vertical` / `xuan_calligraphy` / `staggered_poster`) + subtitle
 * 3) Blind-review-compliant `参赛团队：{teamName}`
 */
export function buildTransparentCoverTypographySvg(spec: CoverLayeredSpec): string {
  const style: CoverTypographyStyle = spec.typographyStyle ?? 'sculpted_orbit';
  const normalized = normalizeCoverTextSpec({
    title: spec.title,
    subtitle: spec.subtitle,
    competitionName: spec.competitionName ?? DEFAULT_COVER_COMPETITION_NAME,
    teamName: spec.teamName ?? deriveBlindSafeTeamName(spec.title),
    titleLayout: style === 'cinnabar_vertical' ? 'vertical' : 'horizontal',
  });
  const anchors = resolveCoverReferenceAnchors(style, spec.anchors);
  const inkMode: CoverInkMode = spec.inkMode ?? anchors.inkMode ?? 'dark_on_light';
  const { heroLead, heroHighlightIndex, topicLines } = splitHeroAndTopicLines(
    normalized.mainTitle,
    normalized.subtitle,
  );

  const isDarkBg = inkMode === 'light_on_dark';
  const primaryInk = isDarkBg ? 'url(#ivoryLuminousGrad)' : '#182433';
  const headerInk = isDarkBg ? '#FCECC9' : '#182433';
  const secondaryInk = isDarkBg ? '#1E293B' : '#243447';
  const directSubInk = isDarkBg ? '#F8EFE0' : '#243447';
  const goldInk = isDarkBg ? '#F6CA75' : '#C59B57';
  const cinnabarInk = isDarkBg ? '#F29F58' : '#A62C2B';
  const headerCenterX = Math.round(anchors.headerZone.x + anchors.headerZone.width / 2);
  const headerBaselineY = Math.round(anchors.headerZone.y + 32);

  const plaqueX = anchors.teamPlaqueZone.x;
  const plaqueY = anchors.teamPlaqueZone.y;
  const plaqueW = anchors.teamPlaqueZone.width;
  const plaqueH = anchors.teamPlaqueZone.height;
  const plaqueCx = Math.round(plaqueX + plaqueW / 2);
  const plaqueBg = isDarkBg ? '#FCEBC8' : '#FDFBF7';
  const plaqueOpacity = isDarkBg ? '0.95' : '0.86';
  const plaqueBorder = isDarkBg ? '#D99B43' : '#8C7A5B';

  let bodyNodes = '';

  const QUOTE_PUNCT_RX = /[“”‘’"\u300c\u300d\u300e\u300f]/u;
  const QUOTE_PUNCT_GLOBAL_RX = /[“”‘’"\u300c\u300d\u300e\u300f]/gu;

  if (style === 'cinnabar_vertical') {
    // Vertical calligraphy column on right + cinnabar seal stamp + vertical/clean left topic lines
    const cleanVerticalChars = Array.from(heroLead.replace(QUOTE_PUNCT_GLOBAL_RX, ''));
    const cleanVerticalHi = splitHeroAndTopicLines(heroLead.replace(QUOTE_PUNCT_GLOBAL_RX, '')).heroHighlightIndex;
    const colX = Math.round(anchors.titleZone.x + anchors.titleZone.width * 0.56);
    const startY = anchors.titleZone.y + 82;
    const stepY = Math.min(132, Math.floor((anchors.titleZone.height - 80) / Math.max(1, cleanVerticalChars.length)));

    const charNodes = cleanVerticalChars
      .map((ch, idx) => {
        const dx = idx % 2 === 0 ? -8 : 10;
        const size = idx === 0 ? 124 : idx === cleanVerticalHi ? 118 : 108;
        const fill =
          idx === cleanVerticalHi
            ? isDarkBg
              ? 'url(#amberGlowGrad)'
              : 'url(#cinnabarAccentGrad)'
            : primaryInk;
        return `<text x="${colX + dx}" y="${startY + idx * stepY}" text-anchor="middle" font-family="${CALLIGRAPHY_FONT_STACK}" font-size="${size}" font-weight="700" fill="${fill}" filter="url(#inkCrispShadow)">${escapeXml(ch)}</text>`;
      })
      .join('\n    ');

    const sealX = colX - 118;
    const sealY = startY + Math.max(1, cleanVerticalChars.length - 1) * stepY - 52;
    const subX = anchors.subtitleZone.x + anchors.subtitleZone.width;
    const subY = anchors.subtitleZone.y + 42;
    const subNodes = topicLines
      .map(
        (line, idx) =>
          `<text x="${subX}" y="${subY + idx * 46}" text-anchor="end" font-family="${KAITI_FONT_STACK}" font-size="31" font-weight="600" letter-spacing="1.5" fill="${directSubInk}">${escapeXml(line)}</text>`,
      )
      .join('\n    ');

    bodyNodes = `
    <!-- Vertical Brush Calligraphy & Cinnabar Seal -->
    ${charNodes}
    <g transform="translate(${sealX}, ${sealY})">
      <rect x="0" y="0" width="58" height="68" rx="5" fill="none" stroke="${cinnabarInk}" stroke-width="3.2"/>
      <rect x="4" y="4" width="50" height="60" rx="3" fill="#A62C2B" fill-opacity="0.92"/>
      <text x="29" y="30" text-anchor="middle" font-family="${KAITI_FONT_STACK}" font-size="20" font-weight="700" fill="#FFFDF9">实证</text>
      <text x="29" y="54" text-anchor="middle" font-family="${KAITI_FONT_STACK}" font-size="20" font-weight="700" fill="#FFFDF9">调研</text>
    </g>
    <line x1="${subX + 18}" y1="${subY - 30}" x2="${subX + 18}" y2="${subY + topicLines.length * 46 - 24}" stroke="${cinnabarInk}" stroke-width="3.5" stroke-linecap="round"/>
    ${subNodes}`;
  } else if (style === 'xuan_calligraphy') {
    // Expressive horizontal Xingkai brush with warm cinnabar-gold halo behind highlight character + celadon/warm-cream ribbon subtitle
    const cx = Math.round(anchors.titleZone.x + anchors.titleZone.width / 2);
    const baseY = anchors.titleZone.y + 150;
    const chars = Array.from(heroLead);
    const spacing = chars.length <= 6 ? 116 : 92;
    const startX = cx - ((chars.length - 1) * spacing) / 2;

    const charNodes = chars
      .map((ch, idx) => {
        const x = Math.round(startX + idx * spacing);
        const isBracket = QUOTE_PUNCT_RX.test(ch);
        const isHero = idx === heroHighlightIndex && !isBracket;
        const dy = isHero ? -8 : idx % 2 === 1 ? 6 : 0;
        const size = isBracket ? 86 : isHero ? 136 : 122;
        const fill = isHero
          ? isDarkBg
            ? 'url(#amberGlowGrad)'
            : 'url(#cinnabarAccentGrad)'
          : isDarkBg
            ? 'url(#ivoryLuminousGrad)'
            : '#0F292A';
        const halo = isHero
          ? `<circle cx="${x}" cy="${baseY - 44}" r="68" fill="url(#warmHaloGrad)"/>`
          : '';
        return `${halo}<text x="${x}" y="${baseY + dy}" text-anchor="middle" font-family="${CALLIGRAPHY_FONT_STACK}" font-size="${size}" font-weight="700" fill="${fill}" filter="url(#inkCrispShadow)">${escapeXml(ch)}</text>`;
      })
      .join('\n    ');

    const subY = anchors.subtitleZone.y;
    const subH = Math.max(88, topicLines.length * 42 + 26);
    const subBandFill = isDarkBg ? '#FCEBC8' : 'url(#celadonBandGrad)';
    const subBandOpacity = isDarkBg ? '0.92' : '1';
    const subTextFill = isDarkBg ? '#182433' : '#133332';
    const subNodes = topicLines
      .map(
        (line, idx) =>
          `<text x="500" y="${subY + 40 + idx * 40}" text-anchor="middle" font-family="${KAITI_FONT_STACK}" font-size="30" font-weight="600" letter-spacing="1.5" fill="${subTextFill}">${escapeXml(line)}</text>`,
      )
      .join('\n    ');

    bodyNodes = `
    ${charNodes}
    <rect x="130" y="${subY}" width="740" height="${subH}" rx="10" fill="${subBandFill}" fill-opacity="${subBandOpacity}" stroke="${isDarkBg ? '#D99B43' : '#0F766E'}" stroke-opacity="0.35" stroke-width="1.3"/>
    ${subNodes}`;
  } else if (style === 'staggered_poster') {
    // Magazine poster staggered stepped typography + flying-white echo + warm cream / light dashed capsule subtitle
    const cx = Math.round(anchors.titleZone.x + anchors.titleZone.width / 2);
    const baseY = anchors.titleZone.y + 148;
    const chars = Array.from(heroLead);
    const spacing = chars.length <= 6 ? 114 : 90;
    const startX = cx - ((chars.length - 1) * spacing) / 2;

    const echoText = escapeXml(heroLead.replace(QUOTE_PUNCT_GLOBAL_RX, ''));
    const charNodes = chars
      .map((ch, idx) => {
        const x = Math.round(startX + idx * spacing);
        const isBracket = QUOTE_PUNCT_RX.test(ch);
        const stepOffset = isBracket ? 0 : idx % 2 === 0 ? -12 : 12;
        const size = isBracket ? 84 : idx === heroHighlightIndex ? 138 : 118;
        const fill =
          idx === heroHighlightIndex
            ? isDarkBg
              ? 'url(#amberGlowGrad)'
              : 'url(#sculptedGoldGrad)'
            : primaryInk;
        return `<text x="${x}" y="${baseY + stepOffset}" text-anchor="middle" font-family="${CALLIGRAPHY_FONT_STACK}" font-size="${size}" font-weight="700" fill="${fill}" filter="url(#inkCrispShadow)">${escapeXml(ch)}</text>`;
      })
      .join('\n    ');

    const subY = anchors.subtitleZone.y;
    const subH = Math.max(92, topicLines.length * 42 + 28);
    const capsuleFill = isDarkBg ? '#FCEBC8' : '#FFFFFF';
    const capsuleFillOpacity = isDarkBg ? '0.94' : '0.82';
    const capsuleStroke = isDarkBg ? '#D99B43' : '#0F766E';
    const subNodes = topicLines
      .map(
        (line, idx) =>
          `<text x="500" y="${subY + 42 + idx * 40}" text-anchor="middle" font-family="${KAITI_FONT_STACK}" font-size="29" font-weight="600" letter-spacing="1.2" fill="${secondaryInk}">${escapeXml(line)}</text>`,
      )
      .join('\n    ');

    bodyNodes = `
    <text x="${cx + 12}" y="${baseY - 18}" text-anchor="middle" font-family="${CALLIGRAPHY_FONT_STACK}" font-size="146" font-weight="700" fill="${goldInk}" fill-opacity="${isDarkBg ? '0.18' : '0.11'}" letter-spacing="14">${echoText}</text>
    ${charNodes}
    <rect x="142" y="${subY}" width="716" height="${subH}" rx="${Math.round(subH / 2)}" fill="${capsuleFill}" fill-opacity="${capsuleFillOpacity}" stroke="${capsuleStroke}" stroke-opacity="0.55" stroke-width="1.8" stroke-dasharray="7 5"/>
    ${subNodes}`;
  } else if (style === 'editorial_serif') {
    // Open modern editorial serif: crisp publication rulework + proportioned Noto Serif hero lead + calm serif subtitle block
    const cx = Math.round(anchors.titleZone.x + anchors.titleZone.width / 2);
    const baseY = anchors.titleZone.y + 148;
    const chars = Array.from(heroLead);
    const spacing = chars.length <= 6 ? 114 : 88;
    const startX = cx - ((chars.length - 1) * spacing) / 2;

    const charNodes = chars
      .map((ch, idx) => {
        const x = Math.round(startX + idx * spacing);
        const isBracket = QUOTE_PUNCT_RX.test(ch);
        const isHero = idx === heroHighlightIndex && !isBracket;
        const size = isBracket ? 82 : isHero ? 124 : 114;
        const fill = isHero
          ? isDarkBg
            ? 'url(#amberGlowGrad)'
            : 'url(#cinnabarAccentGrad)'
          : isBracket
            ? goldInk
            : isDarkBg
              ? '#FFF8EC'
              : '#162332';
        return `<text x="${x}" y="${baseY}" text-anchor="middle" font-family="${EDITORIAL_SERIF_STACK}" font-size="${size}" font-weight="700" fill="${fill}" filter="url(#inkCrispShadow)">${escapeXml(ch)}</text>`;
      })
      .join('\n    ');

    const ruleY = anchors.titleZone.y + 22;
    const subTopY = anchors.subtitleZone.y + 14;
    const subNodes = topicLines
      .map(
        (line, idx) =>
          `<text x="${cx}" y="${subTopY + 34 + idx * 42}" text-anchor="middle" font-family="${EDITORIAL_SERIF_STACK}" font-size="29" font-weight="500" letter-spacing="1.6" fill="${directSubInk}">${escapeXml(line)}</text>`,
      )
      .join('\n    ');

    bodyNodes = `
    <line x1="164" y1="${ruleY}" x2="836" y2="${ruleY}" stroke="${goldInk}" stroke-opacity="0.72" stroke-width="1.4"/>
    <circle cx="${cx}" cy="${ruleY}" r="3.5" fill="${goldInk}"/>
    ${charNodes}
    <line x1="210" y1="${subTopY - 8}" x2="790" y2="${subTopY - 8}" stroke="${goldInk}" stroke-opacity="0.45" stroke-width="1.1"/>
    ${subNodes}`;
  } else if (style === 'modern_geometric') {
    // Crisp Swiss geometric grotesque typography: left-aligned or centered sharp blocks + eyebrow bar + clean sans grid
    const cx = Math.round(anchors.titleZone.x + anchors.titleZone.width / 2);
    const baseY = anchors.titleZone.y + 146;
    const chars = Array.from(heroLead);
    const spacing = chars.length <= 6 ? 112 : 88;
    const startX = cx - ((chars.length - 1) * spacing) / 2;

    const charNodes = chars
      .map((ch, idx) => {
        const x = Math.round(startX + idx * spacing);
        const isBracket = QUOTE_PUNCT_RX.test(ch);
        const isHero = idx === heroHighlightIndex && !isBracket;
        const size = isBracket ? 80 : isHero ? 120 : 110;
        const fill = isHero
          ? isDarkBg
            ? '#F6BD60'
            : '#0F766E'
          : isBracket
            ? goldInk
            : isDarkBg
              ? '#F8FAFC'
              : '#0F172A';
        return `<text x="${x}" y="${baseY}" text-anchor="middle" font-family="${MODERN_GEOMETRIC_STACK}" font-size="${size}" font-weight="700" fill="${fill}">${escapeXml(ch)}</text>`;
      })
      .join('\n    ');

    const pillY = anchors.titleZone.y + 10;
    const subX = Math.max(112, anchors.subtitleZone.x + 18);
    const subTopY = anchors.subtitleZone.y + 38;
    const subNodes = topicLines
      .map(
        (line, idx) =>
          `<text x="${subX}" y="${subTopY + idx * 42}" text-anchor="start" font-family="${MODERN_GEOMETRIC_STACK}" font-size="28" font-weight="500" letter-spacing="1.0" fill="${directSubInk}">${escapeXml(line)}</text>`,
      )
      .join('\n    ');

    bodyNodes = `
    <rect x="${cx - 110}" y="${pillY}" width="220" height="6" rx="3" fill="${isDarkBg ? '#F6BD60' : '#0F766E'}"/>
    ${charNodes}
    <rect x="${subX - 18}" y="${anchors.subtitleZone.y + 12}" width="6" height="${Math.max(46, topicLines.length * 42 + 4)}" rx="2" fill="${isDarkBg ? '#F6BD60' : '#0F766E'}"/>
    ${subNodes}`;
  } else {
    // Default preferred `sculpted_orbit`: sculpted navy-gold (or luminous ivory-gold on dark) calligraphy + golden orbital arc + left vertical gold rule subtitle
    const cx = Math.round(anchors.titleZone.x + anchors.titleZone.width / 2);
    const baseY = anchors.titleZone.y + 152;
    const chars = Array.from(heroLead);
    const spacing = chars.length <= 6 ? 116 : 90;
    const startX = cx - ((chars.length - 1) * spacing) / 2;

    const charNodes = chars
      .map((ch, idx) => {
        const x = Math.round(startX + idx * spacing);
        const isBracket = QUOTE_PUNCT_RX.test(ch);
        const isHero = idx === heroHighlightIndex && !isBracket;
        const size = isBracket ? 88 : isHero ? 132 : 120;
        const fill = isHero
          ? isDarkBg
            ? 'url(#amberGlowGrad)'
            : 'url(#sculptedGoldGrad)'
          : isBracket
            ? goldInk
            : isDarkBg
              ? 'url(#ivoryLuminousGrad)'
              : 'url(#sculptedNavyGrad)';
        return `<text x="${x}" y="${baseY}" text-anchor="middle" font-family="${CALLIGRAPHY_FONT_STACK}" font-size="${size}" font-weight="700" fill="${fill}" filter="url(#inkCrispShadow)">${escapeXml(ch)}</text>`;
      })
      .join('\n    ');

    const subLeftX = anchors.subtitleZone.x + 26;
    const subStartY = anchors.subtitleZone.y + 38;
    const subNodes = topicLines
      .map(
        (line, idx) =>
          `<text x="${subLeftX}" y="${subStartY + idx * 44}" text-anchor="start" font-family="${KAITI_FONT_STACK}" font-size="31" font-weight="600" letter-spacing="1.4" fill="${directSubInk}">${escapeXml(line)}</text>`,
      )
      .join('\n    ');

    bodyNodes = `
    <!-- Golden Orbital Arc & Sculpted Artistic Title -->
    <ellipse cx="${cx + 22}" cy="${baseY - 46}" rx="242" ry="96" transform="rotate(-19 ${cx + 22} ${baseY - 46})" fill="none" stroke="url(#orbitArcGrad)" stroke-width="2.6"/>
    ${charNodes}
    <rect x="${anchors.subtitleZone.x}" y="${anchors.subtitleZone.y + 8}" width="7" height="${Math.max(58, topicLines.length * 44 + 4)}" rx="2" fill="${isDarkBg ? 'url(#amberGlowGrad)' : 'url(#sculptedGoldGrad)'}"/>
    ${subNodes}`;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_CANVAS_PX.width} ${COVER_CANVAS_PX.height}" width="${COVER_CANVAS_PX.width}" height="${COVER_CANVAS_PX.height}" data-cover-layer="vector-typography" data-typography-style="${style}" data-ink-mode="${inkMode}">`,
    `  <defs>`,
    `    <linearGradient id="sculptedNavyGrad" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="#263B54"/>`,
    `      <stop offset="100%" stop-color="#121E2D"/>`,
    `    </linearGradient>`,
    `    <linearGradient id="sculptedGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `      <stop offset="0%" stop-color="#D4AF6A"/>`,
    `      <stop offset="55%" stop-color="#8C6A38"/>`,
    `      <stop offset="100%" stop-color="#2A3B4F"/>`,
    `    </linearGradient>`,
    `    <linearGradient id="ivoryLuminousGrad" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="#FFFDF7"/>`,
    `      <stop offset="65%" stop-color="#FCE5B4"/>`,
    `      <stop offset="100%" stop-color="#E5B15A"/>`,
    `    </linearGradient>`,
    `    <linearGradient id="amberGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="#FFE8A3"/>`,
    `      <stop offset="55%" stop-color="#F5B851"/>`,
    `      <stop offset="100%" stop-color="#D9822B"/>`,
    `    </linearGradient>`,
    `    <linearGradient id="cinnabarAccentGrad" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="#C23B2B"/>`,
    `      <stop offset="100%" stop-color="#7E1D1C"/>`,
    `    </linearGradient>`,
    `    <linearGradient id="orbitArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">`,
    `      <stop offset="0%" stop-color="#C59B57" stop-opacity="0.18"/>`,
    `      <stop offset="50%" stop-color="${isDarkBg ? '#FFE29A' : '#C59B57'}" stop-opacity="0.92"/>`,
    `      <stop offset="100%" stop-color="#C59B57" stop-opacity="0.24"/>`,
    `    </linearGradient>`,
    `    <radialGradient id="warmHaloGrad" cx="50%" cy="50%" r="50%">`,
    `      <stop offset="0%" stop-color="#E6B973" stop-opacity="0.42"/>`,
    `      <stop offset="100%" stop-color="#E6B973" stop-opacity="0"/>`,
    `    </radialGradient>`,
    `    <linearGradient id="celadonBandGrad" x1="0%" y1="0%" x2="100%" y2="0%">`,
    `      <stop offset="0%" stop-color="#0F766E" stop-opacity="0.02"/>`,
    `      <stop offset="50%" stop-color="#0F766E" stop-opacity="0.13"/>`,
    `      <stop offset="100%" stop-color="#0F766E" stop-opacity="0.02"/>`,
    `    </linearGradient>`,
    `    <filter id="inkCrispShadow" x="-10%" y="-10%" width="120%" height="120%">`,
    `      <feDropShadow dx="0" dy="3" stdDeviation="${isDarkBg ? '3.2' : '1.6'}" flood-color="#09111E" flood-opacity="${isDarkBg ? '0.52' : '0.14'}"/>`,
    `    </filter>`,
    `  </defs>`,
    `  <!-- 1. Official 17th-Edition Competition Full Title -->`,
    `  <text x="${headerCenterX}" y="${headerBaselineY}" text-anchor="middle" font-family="${EDITORIAL_SANS_STACK}" font-size="28" font-weight="600" letter-spacing="1.2" fill="${headerInk}"${isDarkBg ? ' filter="url(#inkCrispShadow)"' : ''}>${escapeXml(normalized.competitionName)}</text>`,
    `  <!-- 2. Non-Rigid Expressive Vector Calligraphy Topic -->`,
    `  ${bodyNodes.trim()}`,
    `  <!-- 3. Blind-Review Compliant Team Credit Plaque -->`,
    `  <g data-layer="team-plaque">`,
    `    <rect x="${plaqueX}" y="${plaqueY}" width="${plaqueW}" height="${plaqueH}" rx="4" fill="${plaqueBg}" fill-opacity="${plaqueOpacity}" stroke="${plaqueBorder}" stroke-opacity="0.68" stroke-width="1.4"/>`,
    `    <rect x="${plaqueX + 5}" y="${plaqueY + 5}" width="${plaqueW - 10}" height="${plaqueH - 10}" rx="2" fill="none" stroke="#C59B57" stroke-opacity="0.5" stroke-width="0.9"/>`,
    `    <text x="${plaqueCx}" y="${plaqueY + 40}" text-anchor="middle" font-family="${KAITI_FONT_STACK}" font-size="26" font-weight="600" letter-spacing="1" fill="#182433">${escapeXml(normalized.teamLabel)}</text>`,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

/** Creates initial reactive UI state for layered cover customization. */
export function createInitialCoverLayeredState(
  init: Partial<CoverLayeredSpec> & { presetId?: CleanBackdropPresetId; mode?: CoverPipelineMode } = {},
): CoverLayeredState {
  const preset =
    CLEAN_BACKDROP_PRESETS.find(p => p.id === (init.presetId ?? 'f')) ?? CLEAN_BACKDROP_PRESETS[0];
  const typographyStyle = init.typographyStyle ?? preset.defaultTypographyStyle;
  const inkMode: CoverInkMode = init.inkMode ?? preset.inkMode ?? preset.anchors.inkMode;
  const norm = normalizeCoverTextSpec({
    title: init.title || '银发“智”守：城市老年人智能健康监测设备采纳意愿与家庭代际数字反哺机制调查',
    subtitle: init.subtitle ?? '基于多阶段分层抽样与社区实地入户调查的实证研究',
    competitionName: init.competitionName ?? DEFAULT_COVER_COMPETITION_NAME,
    teamName: init.teamName,
    titleLayout: typographyStyle === 'cinnabar_vertical' ? 'vertical' : 'horizontal',
  });
  const anchors = resolveCoverReferenceAnchors(typographyStyle, init.anchors ?? preset.anchors, preset.id);
  const svg = buildTransparentCoverTypographySvg({
    competitionName: norm.competitionName,
    title: norm.mainTitle,
    subtitle: norm.subtitle,
    teamName: norm.teamName,
    typographyStyle,
    anchors,
    inkMode,
  });
  return {
    mode: init.mode ?? 'direct_illustrated',
    selectedPresetId: preset.id,
    referenceUrl: preset.referenceUrl,
    backdropUrl: preset.backdropUrl,
    competitionName: norm.competitionName,
    title: norm.mainTitle,
    subtitle: norm.subtitle,
    teamName: norm.teamName,
    typographyStyle,
    inkMode,
    anchors,
    vectorTypographySvg: svg,
    vectorTypographyDataUrl: svgToDataUrl(svg),
    assembledDataUrl: '',
    assembledSource: 'pending',
  };
}

function loadBrowserImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('封面图层图像加载失败，请检查所选底图文件是否完整。'));
    img.src = url;
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function parseAssembledDataUrlToCover(
  assembledDataUrl: string,
  note = '国奖出版级分层组装 A4 封面（题名字形在图中）',
): CoverImage | undefined {
  const match = assembledDataUrl.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/u);
  if (!match) return undefined;
  const mime = match[1] as 'image/png' | 'image/jpeg';
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const dims = imageSize(bytes, mime);
  if (!dims || bytes.byteLength > PAGE_ART_LIMITS.cover.bytes) return undefined;
  if (Math.abs(dims.width / dims.height / A4_ASPECT - 1) > PAGE_ART_LIMITS.aspectTolerance) return undefined;
  return parseCoverImage({
    schema: 'CoverImage/v1',
    mime,
    data: b64,
    widthPx: dims.width,
    heightPx: dims.height,
    note,
  });
}

/**
 * Browser Canvas Compositor: composites a Clean Zero-Text Backdrop (`1000×1414`) + Transparent Vector Calligraphy SVG
 * into a validated `CoverImage/v1` (`<= 1 MB`, `题名字形在图中`) + pixel-derived `FigurePalette/v1`.
 */
export async function compositeBackdropAndVectorSvg(
  backdropSource: string | Blob,
  svgMarkup: string,
  note = '国奖出版级分层组装 A4 封面（题名字形在图中）',
): Promise<{ dataUrl: string; coverImage: CoverImage; figurePalette: FigurePalette }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('当前运行环境不支持浏览器画布合成，请通过服务端封面合成接口生成。');
  }
  const width = COVER_CANVAS_PX.width;
  const height = COVER_CANVAS_PX.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器画布初始化失败，请刷新页面后重试。');

  ctx.fillStyle = '#FCFAF5';
  ctx.fillRect(0, 0, width, height);

  let tempUrl = '';
  try {
    const backdropUrl =
      typeof backdropSource === 'string'
        ? backdropSource
        : ((tempUrl = URL.createObjectURL(backdropSource)), tempUrl);
    const [bgImg, typoImg] = await Promise.all([
      loadBrowserImage(backdropUrl),
      loadBrowserImage(svgToDataUrl(svgMarkup)),
    ]);
    ctx.drawImage(bgImg, 0, 0, width, height);
    ctx.drawImage(typoImg, 0, 0, width, height);
  } finally {
    if (tempUrl) URL.revokeObjectURL(tempUrl);
  }

  const sample = document.createElement('canvas');
  sample.width = 120;
  sample.height = Math.round((120 * height) / width);
  const sCtx = sample.getContext('2d');
  if (!sCtx) throw new Error('封面主辅色提取失败，请换一张封面图重试。');
  sCtx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const figurePalette = paletteFromPixels(sCtx.getImageData(0, 0, sample.width, sample.height).data);

  for (const quality of [0.92, 0.86, 0.8, 0.72, 0.62]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size > PAGE_ART_LIMITS.cover.bytes) continue;
    const data = await blobToBase64(blob);
    const coverImage = parseCoverImage({
      schema: 'CoverImage/v1',
      mime: 'image/jpeg',
      data,
      widthPx: width,
      heightPx: height,
      note,
    });
    return {
      dataUrl: `data:image/jpeg;base64,${data}`,
      coverImage,
      figurePalette,
    };
  }
  throw new Error('合成后的封面图像超过 1 MB 上限，请选用尺寸更精简的底图后重试。');
}

/**
 * Calls Backend `POST /api/reports/cover-assemble` to obtain true `matplotlib.textpath` Bézier `<path>` vector
 * calligraphy SVG + 2× supersampled A4 composite PNG, falling back seamlessly to client isomorphic assembly when offline.
 */
export async function requestBackendCoverAssembly(
  params: CoverLayeredSpec & {
    referencePreset?: CleanBackdropPresetId | string;
    backdropPreset?: CleanBackdropPresetId | string;
    backdropUrl?: string;
    backdropBase64?: string;
    referenceBase64?: string;
    endpoint?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<BackendCoverAssemblyResponse> {
  const rawPresetId = String(params.backdropPreset ?? params.referencePreset ?? 'f').toLowerCase();
  const presetId: CleanBackdropPresetId = (['f', 'e', 'c', 'b', 'd', 'a'] as const).includes(
    rawPresetId as CleanBackdropPresetId,
  )
    ? (rawPresetId as CleanBackdropPresetId)
    : 'f';
  const preset = CLEAN_BACKDROP_PRESETS.find(p => p.id === presetId) ?? CLEAN_BACKDROP_PRESETS[0];
  const typographyStyle = params.typographyStyle ?? preset.defaultTypographyStyle;
  const effectiveInkMode: CoverInkMode = params.inkMode ?? preset.inkMode ?? preset.anchors.inkMode;
  const norm = normalizeCoverTextSpec({
    title: params.title,
    subtitle: params.subtitle,
    competitionName: params.competitionName ?? DEFAULT_COVER_COMPETITION_NAME,
    teamName: params.teamName,
    titleLayout: typographyStyle === 'cinnabar_vertical' ? 'vertical' : 'horizontal',
  });
  const localAnchors = resolveCoverReferenceAnchors(typographyStyle, params.anchors ?? preset.anchors, presetId);
  const localSvg = buildTransparentCoverTypographySvg({
    competitionName: norm.competitionName,
    title: norm.mainTitle,
    subtitle: norm.subtitle,
    teamName: norm.teamName,
    typographyStyle,
    anchors: localAnchors,
    inkMode: effectiveInkMode,
  });

  const endpoint = params.endpoint ?? '/api/reports/cover-assemble';
  const transport = params.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);

  if (transport) {
    try {
      const res = await transport(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referencePreset: params.referencePreset ?? presetId,
          backdropPreset: params.backdropPreset ?? presetId,
          ...(params.backdropBase64 ? { backdropBase64: params.backdropBase64 } : {}),
          ...(params.referenceBase64 ? { referenceBase64: params.referenceBase64 } : {}),
          competitionName: norm.competitionName,
          title: norm.mainTitle,
          subtitle: norm.subtitle,
          teamName: norm.teamName,
          typographyStyle,
          inkMode: effectiveInkMode,
        }),
        signal: params.signal ?? AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const json = (await res.json()) as Partial<BackendCoverAssemblyResponse>;
        if (json.assembledDataUrl && json.vectorTypographySvg) {
          const coverImage = parseAssembledDataUrlToCover(json.assembledDataUrl);
          return {
            ok: true,
            source: 'backend_bezier',
            mode: 'layered_assembly',
            referenceAnalysis: json.referenceAnalysis ?? localAnchors,
            vectorTypographySvg: json.vectorTypographySvg,
            vectorTypographyDataUrl: json.vectorTypographyDataUrl || svgToDataUrl(json.vectorTypographySvg),
            assembledDataUrl: json.assembledDataUrl,
            ...(coverImage ? { coverImage } : {}),
            ...(json.figurePalette ? { figurePalette: json.figurePalette } : {}),
            width: json.width ?? 1000,
            height: json.height ?? 1414,
          };
        }
      }
    } catch {
      // Seamless fallback to client canvas assembly below
    }
  }

  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    const backdropTarget = params.backdropUrl ?? preset.backdropUrl;
    const composited = await compositeBackdropAndVectorSvg(backdropTarget, localSvg);
    return {
      ok: true,
      source: 'client_canvas',
      mode: 'layered_assembly',
      referenceAnalysis: localAnchors,
      vectorTypographySvg: localSvg,
      vectorTypographyDataUrl: svgToDataUrl(localSvg),
      assembledDataUrl: composited.dataUrl,
      coverImage: composited.coverImage,
      figurePalette: composited.figurePalette,
      width: 1000,
      height: 1414,
    };
  }

  return {
    ok: true,
    source: 'client_canvas',
    mode: 'layered_assembly',
    referenceAnalysis: localAnchors,
    vectorTypographySvg: localSvg,
    vectorTypographyDataUrl: svgToDataUrl(localSvg),
    assembledDataUrl: svgToDataUrl(localSvg),
    width: 1000,
    height: 1414,
  };
}
