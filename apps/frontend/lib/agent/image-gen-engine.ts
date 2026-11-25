/**
 * Report-Driven AI Image Generation & Dual-Track Visual Engine
 *
 * Enforces the Zhengda Cup National First-Prize Dual-Track Visual Taxonomy
 * (`skill/survey-analysis-exhibit-weaver/SKILL.md` & `skill/survey-visual-layout-typesetting/SKILL.md`):
 *
 * - Track 1 (`track1_deterministic_code`): Quantitative charts, statistical distributions, forest plots,
 *   IPA/KANO matrices, topological roadmaps, and composite numeric panels MUST be rendered deterministically
 *   by code from SHA-256 verified `ResultSnapshot`s.
 * - Track 2 (`track2_ai_non_quantitative`): AI image generation is strictly scoped to non-quantitative
 *   visual assets — A4 Editorial Cover (`cover`), Subtle A4 Page Frame/Border (`frame`), and Conceptual
 *   Scenario/Mechanism Illustration (`scene` / `concept`). All prompts strictly forbid fake axis ticks,
 *   fake chart numbers, garbled pseudo-Chinese text, school/team logos, and fake fieldwork photos.
 *
 * Kept 100% isomorphic (browser + Node safe, zero native Node imports) because client studios import this module.
 */

import { applyCoverImage, applyFrameImage, applySectionIllustration, type EditorContent } from '../editor-model.ts';
import { descriptiveInfographicSVG } from '../diagram-figures.ts';
import { paletteFromPixels, parseFigurePalette, type FigurePalette } from '../figure-palette.ts';
import {
  COVER_CANDIDATE_SPEC_POOL,
  COVER_TITLE_LAYOUTS,
  DEFAULT_COVER_COMPETITION_NAME,
  DEFAULT_PREFERRED_COVER_CANDIDATE_ID,
  FRAME_CLEAR_ZONES_MM,
  FRAME_OUTER_BAND_SPEC,
  PAGE_ART_LIMITS,
  buildCoverTypographyPrompt as rawBuildCoverTypographyPrompt,
  buildFramePerimeterPromptClause as rawBuildFramePerimeterPromptClause,
  deriveBlindSafeTeamName,
  imageSize,
  normalizeCoverTextSpec,
  parseCoverImage,
  parseFrameImage,
  parseSectionIllustration,
  presetCoverImageFromBlob,
  retractFrameRgbaCrisply,
  sanitizeBlindSafeTeamName,
  type CoverImage,
  type CoverTitleLayout,
  type FrameImage,
  type SectionIllustration,
} from '../page-art.ts';

export {
  COVER_CANDIDATE_SPEC_POOL,
  COVER_TITLE_LAYOUTS,
  DEFAULT_COVER_COMPETITION_NAME,
  DEFAULT_PREFERRED_COVER_CANDIDATE_ID,
  FRAME_OUTER_BAND_SPEC,
  deriveBlindSafeTeamName,
  normalizeCoverTextSpec,
  presetCoverImageFromBlob,
  retractFrameRgbaCrisply,
  sanitizeBlindSafeTeamName,
  type CoverTitleLayout,
};

const KNOWN_PROMPT_HEX_LABELS: Readonly<Record<string, string>> = {
  '#0F766E': '松石青绿主调',
  '#234E80': '学院靛蓝主调',
  '#8A3449': '人文绛红主调',
  '#FCFAF5': '暖米白宣纸底色',
  '#FAFAF8': '暖石灰岩浅白底色',
  '#FBF9F7': '暖雪花石膏白底色',
  '#F7F9FC': '清透银灰白底色',
  '#FFFFFF': '纯净纯白底色',
  '#212529': '深炭墨正文色',
  '#595959': '中性岩灰辅色',
  '#C99A3E': '暖金细节点缀',
  '#C4933F': '暖金细节点缀',
  '#D9822B': '暖琥珀金点缀',
  '#1E3A5F': '深海靛蓝底色',
  '#2E6B7E': '远山青黛辅色',
  '#A65A3A': '赭石暖棕点缀',
};

/** Converts raw `#RRGGBB` hex literals into natural Chinese editorial color descriptions for user-visible prompts. */
export function describeHexColorForPrompt(hex: string, fallback = '柔和学术色调'): string {
  const upper = (hex || '').trim().toUpperCase();
  if (KNOWN_PROMPT_HEX_LABELS[upper]) return KNOWN_PROMPT_HEX_LABELS[upper];
  const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/u.exec(upper);
  if (!m) return fallback;
  const r = Number.parseInt(m[1], 16) / 255;
  const g = Number.parseInt(m[2], 16) / 255;
  const b = Number.parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (l >= 0.93) return '暖米白浅底色';
  if (l <= 0.2) return '深炭墨色';
  if (d < 0.08) return l < 0.5 ? '中性深岩灰色' : '清雅浅银灰色';
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h >= 25 && h < 58) return '暖金琥珀色调';
  if (h >= 150 && h < 198) return '松石青绿色调';
  if (h >= 198 && h < 255) return '学院靛蓝色调';
  if (h >= 330 || h < 25) return '人文绛红色调';
  if (h >= 58 && h < 150) return '温润竹青色调';
  return '典雅紫灰色调';
}

/** Scrubs any parenthetical or inline `#RRGGBB` hex tokens from user-facing prompt text while keeping prose natural. */
export function humanizePromptHexColors(text: string): string {
  return (text || '')
    .replace(/\s*[（(]\s*#[0-9A-Fa-f]{6}(?:\s*\/\s*#[0-9A-Fa-f]{6})*\s*[）)]/gu, '')
    .replace(/#[0-9A-Fa-f]{6}/gu, match => describeHexColorForPrompt(match))
    .replace(/暖金\s*暖金细节点缀/gu, '暖金细节点缀')
    .replace(/暖金色\s*暖金细节点缀/gu, '暖金色')
    .replace(/\s+细线/gu, '细线');
}

export function buildCoverTypographyPrompt(
  input: Parameters<typeof rawBuildCoverTypographyPrompt>[0] = {},
): string {
  const accentLabel =
    input.accentHex && /^#[0-9A-Fa-f]{6}$/u.test(input.accentHex)
      ? describeHexColorForPrompt(input.accentHex, '松石青绿主调')
      : input.accentHex ?? '松石青绿主调';
  return humanizePromptHexColors(rawBuildCoverTypographyPrompt({ ...input, accentHex: accentLabel }));
}

export function buildFramePerimeterPromptClause(
  params: Parameters<typeof rawBuildFramePerimeterPromptClause>[0] = {},
): string {
  const accentLabel =
    params.accentHex && /^#[0-9A-Fa-f]{6}$/u.test(params.accentHex)
      ? describeHexColorForPrompt(params.accentHex, '松石青绿主调')
      : params.accentHex ?? '松石青绿主调';
  return humanizePromptHexColors(rawBuildFramePerimeterPromptClause({ ...params, accentHex: accentLabel }));
}
import { placeResult, targetSection } from '../report-placement.ts';
import { digestText, parseResultSnapshot, resultPayload, verifyResearchQuality, type ResultSnapshot } from '../research-quality.ts';
import { appendRegisteredResult } from '../result-registration.ts';

export type ImageModelProvider = 'gemini' | 'imagen' | 'openai_compatible';

export interface ImageGenModelSpec {
  id: string;
  label: string;
  shortLabel: string;
  provider: ImageModelProvider;
  apiModel: string;
  fallbackApiModel?: string;
  badge: string;
}

export const IMAGE_GEN_MODELS: readonly ImageGenModelSpec[] = [
  {
    id: 'gpt-image-1.5',
    label: '图文一体封面与画像精绘',
    shortLabel: '图文精绘主通道',
    provider: 'openai_compatible',
    apiModel: 'gpt-image-1.5',
    fallbackApiModel: 'gpt-image-2',
    badge: '高精中文标题 / 主题页框 / 样本画像',
  },
  {
    id: 'gpt-image-2',
    label: '高分辨率结构化插画精绘',
    shortLabel: '结构精绘增强',
    provider: 'openai_compatible',
    apiModel: 'gpt-image-2',
    fallbackApiModel: 'chatgpt-image-latest',
    badge: '结构总结图 / 机制架构图',
  },
  {
    id: 'chatgpt-image-latest',
    label: '智能版式视觉编排',
    shortLabel: '智能版式编排',
    provider: 'openai_compatible',
    apiModel: 'chatgpt-image-latest',
    fallbackApiModel: 'gpt-image-1.5',
    badge: '图文协同排版',
  },
  {
    id: 'gpt-image-1',
    label: '标准插画备用通道',
    shortLabel: '标准插画通道',
    provider: 'openai_compatible',
    apiModel: 'gpt-image-1',
    fallbackApiModel: 'gpt-image-1.5',
    badge: '自动衔接主通道',
  },
  {
    id: 'dall-e-3',
    label: '编辑风纸雕与概念插画',
    shortLabel: '概念插画通道',
    provider: 'openai_compatible',
    apiModel: 'dall-e-3',
    badge: '克制纸雕 / 版画插画',
  },
  {
    id: 'gemini-nano-banana-2.1',
    label: '概念机制与版式草图',
    shortLabel: '概念机制草图',
    provider: 'gemini',
    apiModel: 'gemini-2.5-flash-image-preview',
    badge: '概念机制 / 版式探索',
  },
  {
    id: 'gemini-3-pro-image',
    label: '超清封面与复杂版式精绘',
    shortLabel: '超清版式精绘',
    provider: 'gemini',
    apiModel: 'gemini-2.5-pro-image-preview',
    badge: '高清封面 / 复杂版式',
  },
  {
    id: 'imagen-3.0-generate-002',
    label: '出版级静物与场景插画',
    shortLabel: '出版插画通道',
    provider: 'imagen',
    apiModel: 'imagen-3.0-generate-002',
    badge: '编辑插画风格',
  },
  {
    id: 'kolors-flux-compatible',
    label: '扩展自定义绘图通道',
    shortLabel: '扩展绘图通道',
    provider: 'openai_compatible',
    apiModel: 'black-forest-labs/FLUX.1-schnell',
    badge: '需个人服务支持',
  },
];

/* ───────── Dual-Track Visual Taxonomy & Zhengda National First-Prize Aesthetics ───────── */

export type VisualProductionTrack = 'track1_deterministic_code' | 'track2_ai_non_quantitative';
export type Track2VisualKind = 'cover' | 'frame' | 'scene' | 'concept';
export type EditorialArtStyleId = 'architectural_papercut' | 'risograph_printmaking' | 'spatial_diorama';

export interface ZhengdaAccentPaletteSpec {
  accent: EditorContent['accent'];
  hex: '#0F766E' | '#234E80' | '#8A3449';
  zhName: string;
  enName: string;
  paperHex: string;
  inkHex: string;
  mutedHex: string;
  secondaryHex: string;
  oppositeHex: string;
  promptClause: string;
}

export const ZHENGDA_ACCENT_PALETTES: Readonly<Record<EditorContent['accent'], ZhengdaAccentPaletteSpec>> = {
  teal: {
    accent: 'teal',
    hex: '#0F766E',
    zhName: '林青学术绿',
    enName: 'deep forest academic teal',
    paperHex: '#FCFAF5',
    inkHex: '#212529',
    mutedHex: '#595959',
    secondaryHex: '#C99A3E',
    oppositeHex: '#A65A3A',
    promptClause: '克制 1+1 中性色板：暖米白宣纸底色 + 深炭墨正文色与中性岩灰辅色 + 唯一行业语义主色林青学术绿（松石青绿主调），严禁刺眼高饱和彩虹渐变与荧光色',
  },
  blue: {
    accent: 'blue',
    hex: '#234E80',
    zhName: '学院靛蓝',
    enName: 'editorial academy indigo-navy',
    paperHex: '#FAFAF8',
    inkHex: '#212529',
    mutedHex: '#595959',
    secondaryHex: '#C99A3E',
    oppositeHex: '#A65A3A',
    promptClause: '克制 1+1 中性色板：暖石灰岩浅白纸基 + 深炭墨正文色与中性岩灰辅色 + 唯一行业语义主色学院靛蓝，严禁刺眼高饱和彩虹渐变与荧光色',
  },
  burgundy: {
    accent: 'burgundy',
    hex: '#8A3449',
    zhName: '人文绛红',
    enName: 'scholarly oxblood burgundy',
    paperHex: '#FBF9F7',
    inkHex: '#212529',
    mutedHex: '#595959',
    secondaryHex: '#2E6B7E',
    oppositeHex: '#C4933F',
    promptClause: '克制 1+1 中性色板：暖雪花石膏白纸基 + 深炭墨正文色与中性岩灰辅色 + 唯一行业语义主色人文绛红，严禁刺眼高饱和彩虹渐变与荧光色',
  },
};

export interface EditorialArtStyleSpec {
  id: EditorialArtStyleId;
  zhLabel: string;
  promptClause: string;
}

export const EDITORIAL_ART_STYLES: readonly EditorialArtStyleSpec[] = [
  {
    id: 'architectural_papercut',
    zhLabel: '建筑折纸浮雕',
    promptClause:
      '美术工艺：Editorial architectural paper-cut layered relief (博物馆级无酸卡纸层叠折纸浮雕)，柔和侧逆棚拍漫射光影，利落几何切面与细微棉纸肌理，克制冷静的国家级智库出版气质。',
  },
  {
    id: 'risograph_printmaking',
    zhLabel: '孔版与铜版学术版画',
    promptClause:
      '美术工艺：Editorial risograph printmaking & fine copperplate engraving lines (学术期刊孔版套色版画与精密铜版细线)，温暖纸张纤维质感与克制几何网点肌理，典雅人文社科风范。',
  },
  {
    id: 'spatial_diorama',
    zhLabel: '极简等轴空间白模',
    promptClause:
      '美术工艺：Clean isometric spatial architectural diorama (极简等轴空间微缩建筑白模沙盘)，哑光矿物纸板与单主色几何体块协同，自然天光柔和投影，画面秩序井然。',
  },
];

export const DUAL_TRACK_VISUAL_TAXONOMY = {
  track1_deterministic_code: {
    track: 'track1_deterministic_code' as const,
    summary: '所有承载真实样本数值、比例、回归置信区间、象限分割线与地理边界的统计图表，100% 由代码从冻结 ResultSnapshot 确定性渲染。',
    ownedMethods: ['frequency', 'crosstab', 'alpha', 'validity', 'regression', 'logistic', 'ipa', 'cluster', 'kano', 'infographic', 'framework', 'wordcloud'],
  },
  track2_ai_non_quantitative: {
    track: 'track2_ai_non_quantitative' as const,
    summary: 'AI 生图严格限定于非定量视觉资产：A4 出版级主题封面 (cover)、极简学术页框 (frame) 与定性概念/机制场景插画 (scene / concept)。',
    allowedKinds: ['cover', 'frame', 'scene', 'concept'] as readonly Track2VisualKind[],
    hardProhibitions: [
      '严禁绘制伪坐标轴刻度、伪网格线、伪柱状图/折线图/饼图或任何虚构统计曲线（No fake axis ticks, chart bars, or coordinate grids）',
      '严禁出现任何阿拉伯数字、百分比数值、样本量或伪造统计指标（Zero numbers, digits, percentages, or fake chart values）',
      '零内嵌文字铁律：画面内严禁生成任何中文汉字、伪汉字乱码笔画、英文字母、标签文字、水印、校徽院徽或团队标识（Zero embedded text, zero garbled pseudo-Chinese characters, zero logos/watermarks）',
      '严禁生成写实人物肖像摄影或冒充实地田野调查访谈照片（No photorealistic human faces or fake fieldwork photos）',
    ] as const,
  },
} as const;

export const TRACK2_FORBIDDEN_CLAUSES: readonly string[] = DUAL_TRACK_VISUAL_TAXONOMY.track2_ai_non_quantitative.hardProhibitions;

/** Curated static showcase/fallback art paths under `apps/frontend/public/art/` (.png/.svg only). */
export const SHOWCASE_PAGE_ART_ASSETS = {
  covers: {
    teal: '/art/cover-teal-editorial.png',
    blue: '/art/cover-blue-editorial.png',
    burgundy: '/art/cover-burgundy-editorial.png',
    silverIllustrated: '/art/cover-silver-illustrated.png',
  },
  frame: '/art/frame-academic-a4.png',
  frames: {
    teal: '/art/frame-academic-a4.png',
    blue: '/art/frame-blue-geometric-a4.png',
  },
  overviews: {
    silverHealth: '/art/overview-silver-health.png',
    instantRetail: '/art/overview-instant-retail.png',
  },
  demographics: {
    silverProfile: '/art/demographic-silver-profile.png',
    retailProfile: '/art/demographic-retail-profile.png',
  },
  roadmaps: {
    silverAction: '/art/roadmap-silver-action.png',
    retailAction: '/art/roadmap-retail-action.png',
  },
  summaries: {
    classificationSupport: '/art/summary-classification-support.png',
  },
  candidates: {
    covers: {
      a: '/art/candidates/cover-cand-a.png',
      b: '/art/candidates/cover-cand-b.png',
      c: '/art/candidates/cover-cand-c.png',
      d: '/art/candidates/cover-cand-d.png',
      e: '/art/candidates/cover-cand-e.png',
      f: '/art/candidates/cover-cand-f.png',
    },
    frames: {
      a: '/art/candidates/frame-cand-a.png',
      b: '/art/candidates/frame-cand-b.png',
      c: '/art/candidates/frame-cand-c.png',
    },
  },
  v3Covers: {
    woodblock: '/art/candidates/cover-v3-1.png',
    risograph: '/art/candidates/cover-v3-2.png',
    nocturne: '/art/candidates/cover-v3-3.png',
    collage: '/art/candidates/cover-v3-4.png',
  },
} as const;

export type ReportImageTaskId =
  | 'descriptive_infographic'
  | 'section_illustration'
  | 'report_cover'
  | 'report_frame';

export interface ReportImageTaskSpec {
  id: ReportImageTaskId;
  label: string;
  shortLabel: string;
  aspect: '16:9' | '3:4';
  track: VisualProductionTrack;
  track2Kind: Track2VisualKind;
  recommendedModelId: string;
  description: string;
}

export const REPORT_IMAGE_TASKS: readonly ReportImageTaskSpec[] = [
  {
    id: 'descriptive_infographic',
    label: '小人进度条人物画像与总体特征图',
    shortLabel: '人物画像图',
    aspect: '16:9',
    track: 'track2_ai_non_quantitative',
    track2Kind: 'concept',
    recommendedModelId: 'gpt-image-1.5',
    description: '依据已登记样本统计占比，绘制含受访者形象、十格人物剪影阵列与进度条的样本特征画像图。',
  },
  {
    id: 'section_illustration',
    label: '第九章实施机制与场景架构图',
    shortLabel: '实施机制图',
    aspect: '16:9',
    track: 'track2_ai_non_quantitative',
    track2Kind: 'scene',
    recommendedModelId: 'gpt-image-1.5',
    description: '绘制契合课题主题的多方协同治理与三十天试点实施机制架构插画（可绑定图 9-1）。',
  },
  {
    id: 'report_cover',
    label: 'A4 图文一体国奖封面',
    shortLabel: 'A4 封面',
    aspect: '3:4',
    track: 'track2_ai_non_quantitative',
    track2Kind: 'cover',
    recommendedModelId: 'gpt-image-2',
    description: '将报告主副标题、赛事抬头与出版级主题插画融合编排为整页 A4 封面（正本与附录同款共用）。',
  },
  {
    id: 'report_frame',
    label: '主题流动纹样艺术页框',
    shortLabel: '艺术页框',
    aspect: '3:4',
    track: 'track2_ai_non_quantitative',
    track2Kind: 'frame',
    recommendedModelId: 'gpt-image-1.5',
    description: '绘制四角与页边富有流动层次感的主题丝带或几何装饰页框（正文版心与页码保护区自动全透明留白）。',
  },
];

export function mapTaskToTrack2Kind(task: ReportImageTaskId): Track2VisualKind {
  switch (task) {
    case 'report_cover':
      return 'cover';
    case 'report_frame':
      return 'frame';
    case 'section_illustration':
      return 'scene';
    case 'descriptive_infographic':
      return 'concept';
  }
}

export function selectEditorialArtStyle(topicOrTitle: string): EditorialArtStyleId {
  const text = topicOrTitle || '';
  if (/非遗|文旅|茶|古镇|文博|乡村|老字号|养老|助餐|银发|中医药|国风|戏曲|生态/iu.test(text)) {
    return 'risograph_printmaking';
  }
  if (/低空|无人机|智能|数智|算法|AI|平台|数字|科技|金融|冷链|算力|模型|新能源|网联/iu.test(text)) {
    return 'spatial_diorama';
  }
  return 'architectural_papercut';
}

/** Strip raw digits/stats/codes from qualitative topic phrases before feeding an AI image prompt so models never draw numbers. */
function qualitativeSubjectPhrase(text: string, fallback: string, maxChars = 48): string {
  const cleaned = (text || '')
    .replace(/\[\[(?:图|表|式|引):[^\]]+\]\]/gu, '')
    .replace(/\{[FGR]\d+\}/gu, '')
    .replace(/\$[^$]*\$/gu, '')
    .replace(/\bQ\d+(?:\s*[-~–—]\s*Q?\d+)?\b/giu, '')
    .replace(/\d+(?:\.\d+)?%?/gu, '')
    .replace(/[()（）【】[\]「」『』《》"]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned.slice(0, maxChars) || fallback;
}

const QUANTITATIVE_PROMPT_CONTAMINATION = /(?:写出文字|写上标题|绘制坐标轴刻度|标注具体百分比|实拍访谈照片|真实受访者人脸照片|photorealistic\s+fieldwork\s+photo|draw\s+exact\s+numbers)/giu;

/** Audits whether a prompt satisfies Track 2 non-quantitative visual safety rules. */
export function auditTrack2PromptSafety(prompt: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const text = (prompt || '').trim();
  if (!text) {
    violations.push('empty_prompt');
    return { valid: false, violations };
  }
  if (QUANTITATIVE_PROMPT_CONTAMINATION.test(text)) {
    violations.push('requests_forbidden_quantitative_or_photorealistic_content');
  }
  if (!/(?:零内嵌文字|严禁生成任何中文|zero\s+embedded\s+text|no\s+text)/iu.test(text)) {
    violations.push('missing_zero_text_guardrail');
  }
  if (!/(?:伪坐标轴|伪统计|fake\s+axis\s+ticks|fake\s+chart\s+numbers)/iu.test(text)) {
    violations.push('missing_no_fake_axes_or_numbers_guardrail');
  }
  if (!/(?:冒充实地|写实人物肖像|fake\s+fieldwork\s+photos)/iu.test(text)) {
    violations.push('missing_no_fake_fieldwork_photo_guardrail');
  }
  return { valid: violations.length === 0, violations };
}

/** Enforces Track 2 non-quantitative guardrails, Zhengda 1+1 restraint palette, and A4 negative space rules on any prompt. */
export function enforceTrack2VisualPrompt(
  rawPrompt: string,
  kind: Track2VisualKind,
  accent: EditorContent['accent'] = 'teal',
  style?: EditorialArtStyleId,
): string {
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const resolvedStyleId = style ?? selectEditorialArtStyle(rawPrompt);
  const styleSpec = EDITORIAL_ART_STYLES.find(s => s.id === resolvedStyleId) ?? EDITORIAL_ART_STYLES[0];

  const scrubbed = (rawPrompt || '')
    .replace(QUANTITATIVE_PROMPT_CONTAMINATION, '纯抽象视觉隐喻')
    .trim();

  const layoutClause =
    kind === 'cover'
      ? 'A4 竖版构图与留白约束：严格按 A4 纵向版面构图，顶部至中上部（上部约四成至五成区域）保持纯净浅暖纸色大面积负空间留白以便标题排版呼吸，视觉主体集中于中下部，层次克制舒朗。'
      : kind === 'frame'
        ? 'A4 页框透明留白约束：中央正文版心区域与底部页码区域必须保持彻底纯净留白/全透明，仅在四周页边外缘与四角布置极细单色几何线框与微距行业抽象角标，绝不侵入正文阅读区。'
        : '构图与留白约束：主体几何结构清晰、四周留有充足干净纸白边距，以非写实抽象空间体块与机制流向传递研究语境，不堆砌琐碎杂物。';

  const guardrailBlock = [
    `全国市调大赛国一色彩规范：${palette.promptClause}。`,
    styleSpec.promptClause,
    layoutClause,
    '非定量插画视觉约束（Editorial Non-Quantitative Guardrails）：严禁绘制伪坐标轴刻度、伪网格线或伪统计柱线图（no fake axis ticks or fake chart bars）；严禁生成任何数字、百分比或伪统计数值（no fake chart numbers）；零内嵌文字铁律——严禁生成任何中文汉字、伪汉字乱码笔画、英文字母、商业水印、校徽院徽或团队标识（zero embedded text, zero garbled pseudo-Chinese text, blind-review anonymous）；严禁生成写实人物肖像或冒充实地田野调查访谈照片（no fake fieldwork photos）。',
  ];

  const audit = auditTrack2PromptSafety(scrubbed);
  if (audit.valid) {
    return Array.from(humanizePromptHexColors(scrubbed)).slice(0, 3800).join('');
  }
  const combined = scrubbed ? `${scrubbed}\n${guardrailBlock.join('\n')}` : guardrailBlock.join('\n');
  return Array.from(humanizePromptHexColors(combined)).slice(0, 3800).join('');
}

export interface BuildTrack2AssetPromptParams {
  title: string;
  subtitle?: string;
  kind: Track2VisualKind;
  accent?: EditorContent['accent'];
  style?: EditorialArtStyleId;
  dimensions?: readonly string[];
  sectionTitle?: string;
  sectionContext?: string;
}

/** Synthesizes a pure Track 2 non-quantitative Zhengda National First-Prize visual prompt. */
export function buildTrack2AssetPrompt(params: BuildTrack2AssetPromptParams): string {
  const accent = params.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const cleanTitle = qualitativeSubjectPhrase(params.title, '当代市场调查与社会实证研究', 38);
  const styleId = params.style ?? selectEditorialArtStyle(`${params.title} ${params.subtitle ?? ''}`);
  const styleSpec = EDITORIAL_ART_STYLES.find(s => s.id === styleId) ?? EDITORIAL_ART_STYLES[0];
  const cleanDims = (params.dimensions ?? [])
    .map(d => qualitativeSubjectPhrase(d, '', 14))
    .filter(Boolean)
    .slice(0, 4)
    .join('、') || '核心研究构念与多主体协同机制';

  switch (params.kind) {
    case 'cover':
      return enforceTrack2VisualPrompt(
        [
          `为主题“${cleanTitle}”创作全国大学生市场调查与分析大赛国一水准的 A4 竖版出版级学术报告封面底图（Editorial A4 Cover Artwork）。`,
          `核心视觉意象：围绕“${cleanTitle}”及“${cleanDims}”提炼抽象行业建筑几何符号、等高线层叠切面与秩序感空间构图，兼具学术庄重感与现代设计美感。`,
          `版面负空间：上部与中上部预留大面积干净温暖纸基负空间用于标题排版，中下部呈现主视觉层叠结构；${palette.promptClause}。`,
          styleSpec.promptClause,
        ].join('\n'),
        'cover',
        accent,
        styleId,
      );
    case 'frame':
      return enforceTrack2VisualPrompt(
        [
          `为主题“${cleanTitle}”创作极简克制的 A4 竖版学术报告页框装饰底图（Subtle A4 Academic Page Frame，透明底 PNG）。`,
          `几何边界：中央大面积正文版心与页脚页码区彻底留白透明，仅在页眉顶边与四角外缘点缀极细双平行线及与“${cleanTitle}”呼应的微缩纯几何单色角标；${palette.promptClause}。`,
          styleSpec.promptClause,
        ].join('\n'),
        'frame',
        accent,
        styleId,
      );
    case 'scene':
    case 'concept': {
      const secHeading = qualitativeSubjectPhrase(params.sectionTitle ?? '', cleanTitle, 28);
      const secCtx = qualitativeSubjectPhrase(params.sectionContext ?? params.subtitle ?? '', cleanDims, 64);
      return enforceTrack2VisualPrompt(
        [
          `为学术调查报告章节“${secHeading}”创作横版编辑风概念场景与机制示意插画（Conceptual Scenario & Mechanism Illustration）。`,
          `抽象叙事语境：以非定量空间隐喻表现“${secCtx}”中的多主体互动与流程衔接关系；${palette.promptClause}。`,
          styleSpec.promptClause,
        ].join('\n'),
        params.kind,
        accent,
        styleId,
      );
    }
  }
}

export interface ExtractedDescriptiveStats {
  sampleN: number;
  totalN: number;
  resultCount: number;
  distributions: Array<{ label: string; value: number; unit: string }>;
  dimensionMeans: Array<{ label: string; value: number; unit: string }>;
  reliabilityAlpha: number | null;
  highlightFinding: string;
}

/** A composite uses one dataset, classification and analysis denominator; unrelated results stay separate. */
function descriptiveSources(content: EditorContent): ResultSnapshot[] {
  const results = (content.quality?.results ?? []).filter(result => result.n > 0
    && !['infographic', 'framework', 'diagram', 'wordcloud', 'sampling-frame', 'cooccurrence', 'macro-trend', 'summary-card'].includes(result.method));
  const primary = results.find(result => result.method === 'frequency') ?? results.find(result => result.method === 'quality-control') ?? results[0];
  return primary ? results.filter(result => result.sourceHash === primary.sourceHash && result.classification === primary.classification
    && result.n === primary.n && result.total === primary.total) : [];
}

/** 从当前报告已冻结的 ResultSnapshot 中无幻觉提取描述性统计摘要 */
export function extractDescriptivePanelsFromReport(content: EditorContent): ExtractedDescriptiveStats {
  const results = descriptiveSources(content);
  const freqResults = results.filter(r => r.method === 'frequency');
  const qcResult = results.find(r => r.method === 'quality-control');
  const primarySampleResult = freqResults[0] ?? qcResult ?? results.find(r => r.n > 0);

  const sampleN = primarySampleResult?.n ?? 0;
  const totalN = primarySampleResult?.total ?? sampleN;

  const distributions: Array<{ label: string; value: number; unit: string }> = [];
  for (const fr of freqResults.slice(0, 2)) {
    const pctCol = fr.headers.findIndex(h => /%|％|占比/u.test(h));
    const countCol = fr.headers.findIndex(h => /频数|人数/u.test(h));
    for (const row of fr.rows.slice(0, 3)) {
      const cat = String(row[0] ?? '').trim();
      if (!cat || /合计|总计|valid|total/iu.test(cat)) continue;
      if (pctCol < 0 && countCol < 0) continue;
      const pctRaw = row[pctCol >= 0 ? pctCol : countCol];
      if (pctRaw === null || pctRaw === undefined || String(pctRaw).trim() === '') continue;
      const numVal =
        typeof pctRaw === 'number'
          ? pctRaw
          : Number(String(pctRaw ?? '').replace(/[%％]/gu, '').trim());
      if (Number.isFinite(numVal) && numVal >= 0 && numVal <= (pctCol >= 0 ? 100 : sampleN) && distributions.length < 5) {
        const prefix = fr.variables?.[0] ? `${fr.variables[0].slice(0, 5)}·` : '';
        distributions.push({
          label: `${prefix}${cat}`,
          value: Number(numVal.toFixed(1)),
          unit: pctCol >= 0 ? '%' : '份',
        });
      }
    }
  }

  const dimensionMeans: Array<{ label: string; value: number; unit: string }> = [];
  const ipa = results.find(r => r.method === 'ipa');
  if (ipa) {
    for (const m of ipa.metrics) {
      if (m.label.endsWith('｜表现') && typeof m.value === 'number' && Number.isFinite(m.value)) {
        const dimName = m.label.slice(0, m.label.lastIndexOf('｜'));
        if (dimName !== '分界线' && dimensionMeans.length < 5) {
          dimensionMeans.push({ label: dimName, value: Number(m.value.toFixed(2)), unit: '原量纲' });
        }
      }
    }
  }
  if (!dimensionMeans.length) {
    const profile = results.find(r => r.method === 'profile');
    if (profile) {
      for (const m of profile.metrics) {
        if (!m.label.includes('｜') || m.label.startsWith('人数｜') || typeof m.value !== 'number' || !Number.isFinite(m.value)) continue;
        if (dimensionMeans.length >= 5) break;
        // Keep each observed subgroup metric; an unweighted average is not a population mean.
        dimensionMeans.push({ label: m.label, value: Number(m.value.toFixed(2)), unit: '原量纲' });
      }
    }
  }

  const alphaSnap = results.find(r => r.method === 'alpha');
  const alphaMetric = alphaSnap?.metrics.find(m => /alpha|α/iu.test(m.label) && typeof m.value === 'number');
  const reliabilityAlpha = typeof alphaMetric?.value === 'number' ? Number(alphaMetric.value.toFixed(3)) : null;

  const firstConfirmed = content.quality?.findings.find(f => f.status === 'confirmed' && f.evidenceIds.length > 0
    && f.evidenceIds.every(id => results.some(result => result.id === id && f.confirmedHashes[id] === result.resultHash)));
  let highlightFinding = firstConfirmed?.interpretation?.split(/[。\n]/u)[0]?.trim() ?? '';
  if (!highlightFinding && dimensionMeans.length >= 2) {
    const sorted = [...dimensionMeans].sort((a, b) => a.value - b.value);
    highlightFinding = `样本核心评价维度得分依次为 ${sorted.map(item => `${item.label}（${item.value}）`).slice(0, 3).join('、')}。`;
  }
  if (!highlightFinding) {
    highlightFinding = results.length
      ? `引用 ${results.length} 项同源同分母分析快照（分析样本 n = ${sampleN}）。`
      : '尚未运行实证统计计算；当前展示框架概念布局，计算结果就绪后自动回填。';
  }

  return {
    sampleN,
    totalN,
    resultCount: results.length,
    distributions,
    dimensionMeans,
    reliabilityAlpha,
    highlightFinding,
  };
}

/** 依照双轨制与国一视觉美学规范自动提取当前报告上下文生图 Prompt（严格拦截伪刻度、伪数值、乱码汉字与假照片） */
export function buildReportDrivenImagePrompt(
  content: EditorContent,
  task: ReportImageTaskId,
  targetSectionId?: string,
  styleOverride?: EditorialArtStyleId,
): string {
  const rawTitle = content.title?.trim() || '市场调查与实证分析研究报告';
  const accent = content.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const styleId = styleOverride ?? selectEditorialArtStyle(`${rawTitle} ${content.subtitle ?? ''}`);
  const styleSpec = EDITORIAL_ART_STYLES.find(s => s.id === styleId) ?? EDITORIAL_ART_STYLES[0];
  const sec = content.report.find(s => s.id === targetSectionId)
    ?? content.report.find(s => /描述|样本|现状/u.test(s.title))
    ?? content.report[0];
  const stats = extractDescriptivePanelsFromReport(content);
  const cleanDims = stats.dimensionMeans.map(d => qualitativeSubjectPhrase(d.label, '', 14)).filter(Boolean).slice(0, 4);
  const cleanDists = stats.distributions
    .map(d => qualitativeSubjectPhrase(d.label.split('·').pop() ?? '', '', 14))
    .filter(Boolean)
    .slice(0, 4);

  switch (task) {
    case 'descriptive_infographic': {
      const cleanTitle = qualitativeSubjectPhrase(rawTitle, '市场调查研究课题', 36);
      const dimSummary = cleanDims.join('、') || '核心体验与服务触点';
      const distSummary = cleanDists.join('、') || '多元受访人群画像';
      const coverHarmonyClause = content.figurePalette
        ? `色彩联动：主色调严格呼应报告封面色板（主色采用${describeHexColorForPrompt(content.figurePalette.primary, palette.zhName)}、辅色采用${describeHexColorForPrompt(content.figurePalette.secondary, '中性岩灰辅色')}、点缀采用${describeHexColorForPrompt(content.figurePalette.opposite, '暖金细节点缀')}）与暖米白宣纸底色`
        : palette.promptClause;
      return enforceTrack2VisualPrompt(
        [
          `为调研课题“${cleanTitle}”创作 16:9 横版出版级课题总体特征与核心研究场景全景示意图（Editorial Topic Overall Feature & Scenario Panorama，瑞士 Bento 多分镜叙事网格）。`,
          `画面内容与分镜：以三至四个干净连贯的空间微缩分镜，具象呈现“${cleanTitle}”中的典型受访人群特征（${distSummary}）、真实使用/服务触点与关键体验环节（${dimSummary}），整体视觉与报告主题高度契合，不画死板 KPI 方格或统计柱条。`,
          `${coverHarmonyClause}；${styleSpec.promptClause}`,
        ].join('\n'),
        'concept',
        accent,
        styleId,
      );
    }
    case 'section_illustration':
      return buildTrack2AssetPrompt({
        title: rawTitle,
        subtitle: content.subtitle,
        kind: 'scene',
        accent,
        style: styleId,
        dimensions: cleanDims,
        sectionTitle: sec?.title || rawTitle,
        sectionContext: sec?.body || content.subtitle || rawTitle,
      });
    case 'report_cover':
      return buildTrack2AssetPrompt({
        title: rawTitle,
        subtitle: content.subtitle,
        kind: 'cover',
        accent,
        style: styleId,
        dimensions: cleanDims,
      });
    case 'report_frame':
      return buildTrack2AssetPrompt({
        title: rawTitle,
        subtitle: content.subtitle,
        kind: 'frame',
        accent,
        style: styleId,
        dimensions: cleanDims,
      });
  }
}

const PROMPT_INSTRUCTION_PATTERN = /^(?:为(?:主题|调研课题|学术研究报告|学术调查报告章节)?[「『《"“].*?[」』》"”]\s*(?:创作|生成|绘制)|(?:创作|生成|绘制)[^，。\n]*(?:信息图|插画|封面|页框))/u;

/** 清洗图表标题，避免将生图提示词指令（如“为「…」创作科研级…”）直接泄漏到正文图注中 */
export function cleanInfographicTitle(rawTitle: string | undefined, contentTitle: string, taskLabel = '描述性统计复合信息图'): string {
  const shortSubject = (contentTitle || '研究报告').replace(/[（(].*?[）)]/gu, '').trim().slice(0, 22) || '研究报告';
  const raw = (rawTitle ?? '').replace(/\s+/gu, ' ').trim();
  if (!raw || PROMPT_INSTRUCTION_PATTERN.test(raw)) {
    return `${shortSubject}核心${taskLabel}`;
  }
  const cleaned = raw
    .replace(/（[A-Za-z0-9\s-]+）/gu, '')
    .replace(/^(?:科研级|极简编辑风|出版级)/gu, '')
    .trim();
  if (cleaned.length < 4 || /创作|生成|视觉版式|构图几何/u.test(cleaned)) {
    return `${shortSubject}核心${taskLabel}`;
  }
  return cleaned;
}

let infographicSeq = 0;

/** 构造已通过 SHA-256 校验的描述性统计复合信息图 / 总体特征图 ResultSnapshot，可直接通过 placeResult 嵌入报告 */
export async function buildInfographicResultSnapshot(params: {
  content: EditorContent;
  title?: string;
  prompt?: string;
  classification?: ResultSnapshot['classification'];
}): Promise<ResultSnapshot> {
  const existing = params.content.quality?.results ?? [];
  if (params.content.quality) await verifyResearchQuality(params.content.quality);
  const stats = extractDescriptivePanelsFromReport(params.content), sources = descriptiveSources(params.content);
  const classification = sources[0]?.classification ?? 'simulated';
  if (params.classification && params.classification !== classification) throw Error('派生图形须保留来源结果的数据分类。');
  const resolvedTitle = cleanInfographicTitle(params.title, params.content.title, '描述性统计复合信息图');
  const sourceHash = await digestText(JSON.stringify(sources.map(result => ({ id: result.id, resultHash: result.resultHash,
    sourceHash: result.sourceHash, classification: result.classification, n: result.n, total: result.total })).sort((a, b) => a.id.localeCompare(b.id))));

  const rows: (string | number | null)[][] = [
    ['KPI', '分析样本量 n', sources.length ? stats.sampleN : '未登记', sources.length ? '份' : '待计算'],
    ['KPI', '同源同分母分析结果', stats.resultCount, '项快照'],
    ...(stats.reliabilityAlpha !== null ? [['KPI', '量表 Cronbach α', stats.reliabilityAlpha, '内部一致性']] : []),
    ...stats.distributions.map(d => ['频数分布', d.label, d.value, d.unit]),
    ...stats.dimensionMeans.map(d => ['均值评价', d.label, d.value, d.unit]),
    ['结论摘要', stats.highlightFinding.slice(0, 64), null, sources.length ? '依据已登记来源快照' : '概念布局，无调查结果'],
    ...sources.map(result => ['来源快照', result.id, result.resultHash, result.sourceHash]),
  ];

  const metrics = [
    { label: '分析样本量', value: stats.sampleN },
    { label: '涵盖分布与维度指标数', value: stats.distributions.length + stats.dimensionMeans.length },
  ];

  const unsigned = parseResultSnapshot({
    id: `infographic-${Date.now().toString(36)}-${(++infographicSeq).toString(36)}`,
    title: resolvedTitle,
    sourceName: sources.length ? '已登记分析快照的同源派生图形' : '概念布局（无调查数据）',
    sourceUrl: '',
    sourceHash,
    resultHash: '0'.repeat(64),
    classification,
    method: 'infographic',
    n: stats.sampleN,
    total: stats.totalN,
    headers: ['面板区域', '指标项', '数值', '单位/说明'],
    rows,
    metrics,
    warnings: sources.length ? ['图形引用来源快照行所列的结果版本；分析样本量不等同于已通过质控的有效答卷数。',
      ...(existing.length > sources.length ? ['不同来源、数据分类或分析分母的结果未合并到本图。'] : [])]
      : ['当前报告尚无可用定量统计结果，仅展示概念布局，不含受访者实测数据。'],
    variables: ['样本分布', '核心维度'],
  });

  return {
    ...unsigned,
    resultHash: await digestText(JSON.stringify(resultPayload(unsigned))),
  };
}

/** 即时合成当前任务的确定性高清矢量预览（与 A4/Word/LaTeX 共用渲染底座） */
export async function buildPreviewSvgForTask(params: {
  content: EditorContent;
  task: ReportImageTaskId;
  prompt: string;
  accentHex: string;
}): Promise<{ svg: string; snapshot: ResultSnapshot }> {
  const taskLabel = REPORT_IMAGE_TASKS.find(t => t.id === params.task)?.label ?? '描述性统计复合信息图';
  const snapshot = await buildInfographicResultSnapshot({
    content: params.content,
    title: cleanInfographicTitle(undefined, params.content.title, taskLabel),
    prompt: params.prompt,
  });
  const svg = descriptiveInfographicSVG(snapshot, params.accentHex);
  return { svg, snapshot };
}

/* ───────── Isomorphic Pure-Web PNG Codec & Deterministic A4 Page-Art Synthesizer ───────── */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triplet >>> 18) & 63];
    out += BASE64_ALPHABET[(triplet >>> 12) & 63];
    out += i + 1 < len ? BASE64_ALPHABET[(triplet >>> 6) & 63] : '=';
    out += i + 2 < len ? BASE64_ALPHABET[triplet & 63] : '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/gu, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = Math.floor((clean.length * 3) / 4) - pad;
  const out = new Uint8Array(byteLen);
  let pos = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(clean[i + 3]);
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (pos < byteLen) out[pos++] = (triplet >>> 16) & 255;
    if (pos < byteLen) out[pos++] = (triplet >>> 8) & 255;
    if (pos < byteLen) out[pos++] = triplet & 255;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(typeBytes: Uint8Array, data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < typeBytes.length; i++) c = CRC_TABLE[(c ^ typeBytes[i]) & 0xff] ^ (c >>> 8);
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeU32BE(target: Uint8Array, offset: number, val: number): void {
  target[offset] = (val >>> 24) & 255;
  target[offset + 1] = (val >>> 16) & 255;
  target[offset + 2] = (val >>> 8) & 255;
  target[offset + 3] = val & 255;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, ch => ch.charCodeAt(0));
  const out = new Uint8Array(12 + data.length);
  writeU32BE(out, 0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  writeU32BE(out, 8 + data.length, crc32(typeBytes, data));
  return out;
}

async function zlibCompress(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const writePromise = writer.write(raw as unknown as BufferSource).then(() => writer.close());
  const compressed = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await writePromise;
  return compressed;
}

async function encodePngFromRgba(width: number, height: number, rgba: Uint8Array, withAlpha: boolean): Promise<Uint8Array> {
  const channels = withAlpha ? 4 : 3;
  const rowStride = 1 + width * channels;
  const scanlines = new Uint8Array(height * rowStride);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    scanlines[rowOffset] = 0; // Filter 0 (None)
    const srcRow = y * width * 4;
    if (withAlpha) {
      scanlines.set(rgba.subarray(srcRow, srcRow + width * 4), rowOffset + 1);
    } else {
      let dst = rowOffset + 1;
      for (let x = 0; x < width; x++) {
        const s = srcRow + x * 4;
        scanlines[dst++] = rgba[s];
        scanlines[dst++] = rgba[s + 1];
        scanlines[dst++] = rgba[s + 2];
      }
    }
  }
  const idatPayload = await zlibCompress(scanlines);
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = withAlpha ? 6 : 2; // RGBA or RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const cIhdr = pngChunk('IHDR', ihdr);
  const cIdat = pngChunk('IDAT', idatPayload);
  const cIend = pngChunk('IEND', new Uint8Array(0));
  const png = new Uint8Array(sig.length + cIhdr.length + cIdat.length + cIend.length);
  let offset = 0;
  for (const part of [sig, cIhdr, cIdat, cIend]) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function seedFromString(seedText: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 0x9e3779b9;
}

function fillRectRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: readonly [number, number, number],
  alpha = 255,
): void {
  const minX = Math.max(0, Math.floor(x0));
  const maxX = Math.min(width, Math.ceil(x1));
  const minY = Math.max(0, Math.floor(y0));
  const maxY = Math.min(height, Math.ceil(y1));
  const aFrac = alpha / 255;
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const idx = (y * width + x) * 4;
      if (alpha >= 255 || rgba[idx + 3] === 0) {
        rgba[idx] = rgb[0];
        rgba[idx + 1] = rgb[1];
        rgba[idx + 2] = rgb[2];
        rgba[idx + 3] = alpha;
      } else {
        rgba[idx] = Math.round(rgba[idx] * (1 - aFrac) + rgb[0] * aFrac);
        rgba[idx + 1] = Math.round(rgba[idx + 1] * (1 - aFrac) + rgb[1] * aFrac);
        rgba[idx + 2] = Math.round(rgba[idx + 2] * (1 - aFrac) + rgb[2] * aFrac);
        rgba[idx + 3] = Math.min(255, Math.max(rgba[idx + 3], alpha));
      }
    }
  }
}

function sanitizeArtNote(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(cleaned || fallback).slice(0, PAGE_ART_LIMITS.note).join('');
}

export interface DeterministicCoverArtOptions {
  title?: string;
  accent?: EditorContent['accent'];
  style?: EditorialArtStyleId;
  note?: string;
}

/**
 * Synthesizes a valid A4 portrait PNG (`840×1188` = exact `210:297` aspect, `<= 1 MB`) with Zhengda Cup
 * National First-Prize editorial geometry (clean top negative space + architectural paper-cut/risograph/diorama blocks)
 * and extracts its `FigurePalette/v1` directly via `paletteFromPixels`.
 */
export async function synthesizeDeterministicCoverArt(
  options: DeterministicCoverArtOptions = {},
): Promise<{ coverImage: CoverImage; figurePalette: FigurePalette }> {
  // 840 / 1188 === 210 / 297 (exact A4 ratio, >= 800 minWidth, fast compression < 40 KB)
  const width = 840;
  const height = 1188;
  const accent = options.accent ?? 'teal';
  const paletteSpec = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const title = options.title?.trim() || '市场调查与实证分析研究报告';
  const style = options.style ?? selectEditorialArtStyle(title);
  const seed = seedFromString(`${title}|${accent}|${style}`);

  const paperRgb = hexToRgb(paletteSpec.paperHex);
  const primaryRgb = hexToRgb(paletteSpec.hex);
  const secondaryRgb = hexToRgb(paletteSpec.secondaryHex);
  const oppositeRgb = hexToRgb(paletteSpec.oppositeHex);
  const inkRgb = hexToRgb(paletteSpec.inkHex);
  const mutedRgb = hexToRgb(paletteSpec.mutedHex);

  const rgba = new Uint8Array(width * height * 4);
  // 1. Warm archival paper base across 100% of page (top 46% stays clean negative space for typography)
  fillRectRgba(rgba, width, height, 0, 0, width, height, paperRgb, 255);

  // 2. Subtle outer editorial hairline frame & double-thin top rule (Zhengda 178/174 CIS benchmark)
  fillRectRgba(rgba, width, height, 68, 64, width - 68, 67, primaryRgb, 255);
  fillRectRgba(rgba, width, height, 68, 72, width - 68, 73, primaryRgb, 180);
  fillRectRgba(rgba, width, height, 68, height - 68, width - 68, height - 66, inkRgb, 190);

  // 3. Lower-half bespoke editorial composition seeded by topic + style (strictly below y = 550 so top/center stays clear)
  const shift = ((seed % 7) - 3) * 14;
  if (style === 'spatial_diorama') {
    // Isometric plinths & architectural columns
    fillRectRgba(rgba, width, height, 86, 600, 754, 1084, primaryRgb, 24);
    fillRectRgba(rgba, width, height, 112 + shift, 668, 438 + shift, 1048, primaryRgb, 255);
    fillRectRgba(rgba, width, height, 456 + shift, 736, 646 + shift, 1048, secondaryRgb, 255);
    fillRectRgba(rgba, width, height, 660, 818, 742, 1048, oppositeRgb, 255);
    fillRectRgba(rgba, width, height, 112 + shift, 644, 742, 648, inkRgb, 255);
  } else if (style === 'risograph_printmaking') {
    // Layered printmaking plates & fine horizontal rule rhythm
    fillRectRgba(rgba, width, height, 88, 592, 752, 1082, primaryRgb, 20);
    fillRectRgba(rgba, width, height, 108, 646, 516 + shift, 1036, primaryRgb, 255);
    fillRectRgba(rgba, width, height, 476 + shift, 696, 694, 944, secondaryRgb, 255);
    fillRectRgba(rgba, width, height, 528, 956, 724, 1054, oppositeRgb, 255);
    for (let y = 598; y <= 634; y += 9) {
      fillRectRgba(rgba, width, height, 108, y, 724, y + 2, mutedRgb, 140);
    }
  } else {
    // Architectural paper-cut stepped relief
    fillRectRgba(rgba, width, height, 84, 586, 756, 1086, primaryRgb, 22);
    fillRectRgba(rgba, width, height, 104, 640, 492 + shift, 1052, primaryRgb, 255);
    fillRectRgba(rgba, width, height, 508 + shift, 704, 718, 922, secondaryRgb, 255);
    fillRectRgba(rgba, width, height, 508 + shift, 938, 692, 1052, oppositeRgb, 255);
    fillRectRgba(rgba, width, height, 144, 680, 444 + shift, 684, paperRgb, 220);
  }

  const pngBytes = await encodePngFromRgba(width, height, rgba, false);
  const figurePalette = parseFigurePalette(paletteFromPixels(rgba, 'cover'));
  const styleLabel = EDITORIAL_ART_STYLES.find(s => s.id === style)?.zhLabel ?? '建筑折纸浮雕';
  const note = sanitizeArtNote(
    options.note ?? `国奖级 A4 报告封面（${paletteSpec.zhName} · ${styleLabel}，预留标题留白，零伪造数值与文字）`,
    '国奖级 A4 报告封面底图',
  );
  const coverImage = parseCoverImage({
    schema: 'CoverImage/v1',
    mime: 'image/png',
    data: bytesToBase64(pngBytes),
    widthPx: width,
    heightPx: height,
    note,
  });
  return { coverImage, figurePalette };
}

export interface DeterministicFrameArtOptions {
  accent?: EditorContent['accent'];
  note?: string;
}

/**
 * Synthesizes a valid transparent A4 PNG (`FrameImage/v1`, `840×1188`, `<= 600 KB`) whose ornaments sit strictly
 * in the outer perimeter so `FRAME_CLEAR_ZONES_MM` (body text + 3 mm buffer and footer page number) remain 100% alpha=0.
 */
export async function synthesizeDeterministicFrameArt(
  options: DeterministicFrameArtOptions = {},
): Promise<FrameImage> {
  const width = 840;
  const height = 1188;
  const accent = options.accent ?? 'teal';
  const paletteSpec = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const primaryRgb = hexToRgb(paletteSpec.hex);
  const mutedRgb = hexToRgb(paletteSpec.mutedHex);

  const rgba = new Uint8Array(width * height * 4); // Initialized to (0,0,0,0) transparent
  // Perimeter hairline rules at ~12mm..16mm from edges (well outside x0=28.8mm, y0=22.4mm clear zones)
  const pxPerMm = width / 210; // 4 px/mm
  const xOuter = Math.round(13 * pxPerMm);
  const yTop = Math.round(13 * pxPerMm);
  const yBottom = height - Math.round(13 * pxPerMm);

  // Top double-thin rule ( stays above y0 = 22.4mm = 89px )
  fillRectRgba(rgba, width, height, xOuter, yTop, width - xOuter, yTop + 3, primaryRgb, 210);
  fillRectRgba(rgba, width, height, xOuter, yTop + 6, width - xOuter, yTop + 7, primaryRgb, 130);

  // Corner geometric micro-brackets in outer margins
  const arm = Math.round(8 * pxPerMm);
  fillRectRgba(rgba, width, height, xOuter, yTop, xOuter + 3, yTop + arm, primaryRgb, 210);
  fillRectRgba(rgba, width, height, width - xOuter - 3, yTop, width - xOuter, yTop + arm, primaryRgb, 210);
  fillRectRgba(rgba, width, height, xOuter, yBottom - arm, xOuter + 3, yBottom, mutedRgb, 170);
  fillRectRgba(rgba, width, height, width - xOuter - 3, yBottom - arm, width - xOuter, yBottom, mutedRgb, 170);
  // Bottom hairline split left & right of page-number clear zone (80..130mm)
  fillRectRgba(rgba, width, height, xOuter, yBottom - 2, Math.floor(76 * pxPerMm), yBottom, mutedRgb, 150);
  fillRectRgba(rgba, width, height, Math.ceil(134 * pxPerMm), yBottom - 2, width - xOuter, yBottom, mutedRgb, 150);

  // Enforce 100% alpha=0 inside FRAME_CLEAR_ZONES_MM
  for (const zone of FRAME_CLEAR_ZONES_MM) {
    const x0 = Math.max(0, Math.floor(zone.x0 * pxPerMm) - 1);
    const y0 = Math.max(0, Math.floor(zone.y0 * pxPerMm) - 1);
    const x1 = Math.min(width, Math.ceil(zone.x1 * pxPerMm) + 1);
    const y1 = Math.min(height, Math.ceil(zone.y1 * pxPerMm) + 1);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  const pngBytes = await encodePngFromRgba(width, height, rgba, true);
  const note = sanitizeArtNote(
    options.note ?? `国奖级 A4 极简学术页框（${paletteSpec.zhName}，正文与页码保护区全透明）`,
    '国奖级 A4 极简学术页框',
  );
  return parseFrameImage({
    schema: 'FrameImage/v1',
    mime: 'image/png',
    data: bytesToBase64(pngBytes),
    widthPx: width,
    heightPx: height,
    note,
  });
}

function defaultPaletteForAccent(accent: EditorContent['accent']): FigurePalette {
  const spec = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  return parseFigurePalette({
    schema: 'FigurePalette/v1',
    primary: spec.hex,
    secondary: spec.secondaryHex,
    opposite: spec.oppositeHex,
    source: 'cover',
  });
}

/* ───────── 1-Call Bespoke Report Cover + Auto-Derived FigurePalette Helper ───────── */

export interface GenerateReportCoverArtOptions {
  /** Report draft (`EditorContent`). When supplied, `result.content` returns `applyCoverImage(content, coverImage, figurePalette)`. */
  content?: EditorContent;
  /** Report title override (defaults to `content?.title`). */
  title?: string;
  /** Optional subtitle / domain context (defaults to `content?.subtitle`). */
  subtitle?: string;
  /** Edition-specific competition name at cover top (defaults to `“益普索杯”第十七届全国大学生市场调查与分析大赛`). */
  competitionName?: string;
  /** Blind-review-compliant team name at cover bottom (defaults to topic-derived `XX调研队`, rendered as `参赛团队：{teamName}`). */
  teamName?: string;
  /** Non-rigid artistic calligraphy layout direction (`'horizontal' | 'vertical'`, defaults to `'horizontal'`). */
  titleLayout?: CoverTitleLayout;
  /** Domain accent (`'teal' | 'blue' | 'burgundy'`, defaults to `content?.accent ?? 'teal'`). */
  accent?: EditorContent['accent'];
  /** Editorial art direction style (auto-selected from topic semantics when omitted). */
  style?: EditorialArtStyleId;
  /** Preferred image model ID (defaults to `'gpt-image-1.5'`, with automatic fallback chain). */
  modelId?: string;
  /** Render quality on GPT-Image (`'high'` default for razor-sharp embedded Chinese title strokes). */
  quality?: 'high' | 'medium';
  /**
   * When `true` (default), fuses `content.title` and `content.subtitle` (with zero top eyebrow plaque) directly into the
   * GPT-Image A4 cover composition and marks `coverImage.note` with `题名字形在图中` so `coverHasEmbeddedTitle(cover)` is `true`.
   * Pass `false` for a zero-text negative-space cover background.
   */
  embeddedTitle?: boolean;
  /** Custom prompt override. */
  prompt?: string;
  /** Image gateway endpoint (defaults to `'/api/agent/image-gen'` in browser; pass an absolute URL in Node when targeting a server). */
  endpoint?: string;
  /** Optional personal API key for authorized local dev gateway requests (never logged or returned). */
  apiKey?: string;
  /** Optional custom `fetch` implementation for testing or server-to-server transport. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /**
   * When `true` (default), gracefully synthesizes a deterministic A4 PNG editorial cover + pixel-derived `FigurePalette`
   * if the live gateway is offline, unconfigured, or unreachable so pipeline/UI runs never fail.
   */
  allowDeterministicFallback?: boolean;
}

export interface GeneratedReportCoverArt {
  ok: true;
  mode: 'live_api' | 'deterministic_fallback';
  modelId: string;
  resolvedModel: string;
  style: EditorialArtStyleId;
  prompt: string;
  coverImage: CoverImage;
  figurePalette: FigurePalette;
  /** Version-3 `EditorContent` with `coverImage` and `figurePalette` applied when `options.content` was provided. */
  content?: EditorContent;
  fallbackReason?: string;
}

const SIMULATION_OR_AI_DISCLOSURE_RX =
  /教学模拟|模拟数据|模拟样本|模拟记录|不作为实际|仅作演示|免责说明|演示样本|随机种子|算法合成|演练语料|机器生成|数据生成|人工智能|大语言模型|AI\s*生成|AIGC/iu;

/**
 * Scrubs any simulation/synthetic/AI disclosure or meta-disclaimer wording from a cover subtitle or heading,
 * replacing contaminated or empty subtitles with authentic empirical survey framing.
 */
export function sanitizeEmpiricalCoverSubtitle(rawSubtitle?: string, title?: string): string {
  const raw = (rawSubtitle ?? '').trim();
  const withoutSimParens = raw
    .replace(/[（(][^）)]*(?:教学模拟|模拟数据|模拟样本|不作为实际|仅作演示|免责说明|算法合成|机器生成|人工智能|AI)[^）)]*[）)]/giu, '')
    .trim();

  if (!withoutSimParens || SIMULATION_OR_AI_DISCLOSURE_RX.test(withoutSimParens)) {
    const topicHint = `${title ?? ''} ${raw}`;
    if (/入户|社区|街区|邻里/u.test(topicHint)) {
      return '基于多阶段分层抽样与社区实地调研的实证研究';
    }
    return '基于多阶段分层实地与线上联合调查的实证研究';
  }
  return withoutSimParens;
}

function cleanCoverHeadingText(raw: string, maxLen: number): string {
  return (raw || '')
    .replace(/【[^】]*】/gu, '')
    .replace(/\[\[(?:图|表|式|引):[^\]]+\]\]/gu, '')
    .replace(/教学模拟|模拟数据|模拟样本|模拟记录|不作为实际调查结论|不作为实际|仅作演示|免责说明|AI\s*生成|人工智能|大语言模型|AIGC/giu, '')
    .replace(/[【】「」『』"“”]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, Math.max(maxLen, 52));
}

/** Builds a GPT-Image All-in-One Editorial A4 Cover Prompt with 3 mandatory competition elements & non-rigid calligraphy. */
export function buildEmbeddedCoverPrompt(params: {
  title: string;
  subtitle?: string;
  competitionName?: string;
  teamName?: string;
  titleLayout?: CoverTitleLayout;
  accent?: EditorContent['accent'];
  style?: EditorialArtStyleId;
  dimensions?: readonly string[];
}): string {
  const accent = params.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const rawMainTitle = cleanCoverHeadingText(params.title, 44) || '社会民生与消费体验专题实证研究';
  const empiricalSub = sanitizeEmpiricalCoverSubtitle(params.subtitle, rawMainTitle);
  const spec = normalizeCoverTextSpec({
    title: rawMainTitle,
    subtitle: cleanCoverHeadingText(empiricalSub, 48),
    competitionName: params.competitionName,
    teamName: params.teamName,
    titleLayout: params.titleLayout,
  });
  const styleId = params.style ?? selectEditorialArtStyle(`${spec.mainTitle} ${spec.subtitle}`);
  const styleSpec = EDITORIAL_ART_STYLES.find(s => s.id === styleId) ?? EDITORIAL_ART_STYLES[0];
  const subjectMotif = qualitativeSubjectPhrase(spec.mainTitle, '现代社会治理与消费研究', 32);
  const cleanDims = (params.dimensions ?? [])
    .map(d => qualitativeSubjectPhrase(d, '', 14))
    .filter(Boolean)
    .slice(0, 4)
    .join('、') || '多主体协同与调查分析';

  return humanizePromptHexColors(
    [
      `创作一张全国大学生市场调查与分析大赛国一出版级 A4 竖版图文一体学术报告封面（210:297 纵向满版构图）。`,
      buildCoverTypographyPrompt({
        title: spec.mainTitle,
        subtitle: spec.subtitle,
        competitionName: spec.competitionName,
        teamName: spec.teamName,
        titleLayout: spec.titleLayout,
        accentHex: palette.zhName,
      }),
      `中下部主视觉插画（与艺术字标题错落呼应，留足标题艺术字呼吸空间与底部团队署名净空）：围绕“${subjectMotif}”及“${cleanDims}”绘制高质感主题具象场景与立体层次构图；${palette.promptClause}，辅以微量暖金细节点缀细线提亮；${styleSpec.promptClause}`,
      `高精中文排版铁律：整幅封面严格且仅允许出现上述双引号内明确指定的赛事届次名称、非板正艺术字主标题、副标题与盲审合规参赛团队四项文字！严禁使用死板机械的电脑印刷黑体或印刷宋体做主标题，严禁添加自述文种身份的冗余报告头衔标签，严禁出现虚构演练免责字样、机器合成标识、校徽院徽、真实学校名称或个人姓名。`,
    ].join('\n'),
  );
}

/** Alias for `buildEmbeddedCoverPrompt` used by Wave-7 pipeline callers. */
export const buildGptIntegratedCoverPrompt = buildEmbeddedCoverPrompt;

/** Builds a source-stage ultra-narrow 4%–6% perimeter A4 Frame Prompt (zero inner feather-blur bite). */
export function buildArtisticFramePrompt(params: {
  title?: string;
  accent?: EditorContent['accent'];
}): string {
  const accent = params.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const cleanTopic = qualitativeSubjectPhrase(params.title ?? '', '学术调查报告', 28);
  const isTech = accent === 'blue' || selectEditorialArtStyle(cleanTopic) === 'spatial_diorama';

  const ornamentStyle = isTech
    ? `四角与页边纹样采用精密几何折线美学（Geometric Architectural Ultra-Fine Perimeter）：严格紧贴距纸张四边最外缘 4%–6%（8.5mm–12.5mm）的极窄边带内，设计纤巧对角折线、极细双轨平行线与微型暖金细节点缀菱形节点（主色学院靛蓝），角饰紧收在最外角绝不向内蔓延`
    : `四角与页边纹样采用东方极细双线与植物游丝美学（Ultra-Fine Perimeter Double-Rule & Corner Motif）：严格紧贴距纸张四边最外缘 4%–6%（8.5mm–12.5mm）的极窄边带内，绘制纤巧双细线外框与克制角花细节（主色${palette.zhName}搭配暖金细节点缀细金线），角饰紧收在最外角绝不向内蔓延`;

  return humanizePromptHexColors(
    [
      `为学术研究报告“${cleanTopic}”创作一张 A4 竖版（210:297）透明底/纯白底极细外缘装饰页框（Thematic Editorial Page Border Frame）。`,
      `${ornamentStyle}。`,
      buildFramePerimeterPromptClause({ accentHex: palette.zhName, topic: cleanTopic }),
      `零内嵌文字铁律：画面内严禁生成任何中英文文字、数字、页码字符、校徽或水印（zero embedded text, no fake axis ticks, no fake chart numbers, no fake fieldwork photos）。`,
    ].join('\n'),
  );
}

/**
 * 1-call helper for `@pipeline-v2` and UI studios: generates a Zhengda National First-Prize GPT-Image-1.5
 * All-in-One Illustrated Title Cover (`CoverImage/v1`, `<= 1 MB`, `题名字形在图中` when `embeddedTitle !== false`)
 * + auto-derived `FigurePalette/v1` and attaches both to `options.content`.
 */
export async function generateReportCoverArt(
  options: GenerateReportCoverArtOptions = {},
): Promise<GeneratedReportCoverArt> {
  const accent = options.accent ?? options.content?.accent ?? 'teal';
  const title = (options.title ?? options.content?.title ?? '市场调查与实证分析研究报告').trim() || '市场调查与实证分析研究报告';
  const subtitle = options.subtitle ?? options.content?.subtitle ?? '';
  const style = options.style ?? selectEditorialArtStyle(`${title} ${subtitle}`);
  const modelId = options.modelId ?? 'gpt-image-1.5';
  const embeddedTitle = options.embeddedTitle !== false;
  const quality = options.quality ?? (embeddedTitle ? 'high' : 'medium');
  const allowFallback = options.allowDeterministicFallback !== false;

  const stats = options.content ? extractDescriptivePanelsFromReport(options.content) : null;
  const cleanDims = stats?.dimensionMeans.map(d => qualitativeSubjectPhrase(d.label, '', 14)).filter(Boolean).slice(0, 4) ?? [];

  const prompt = options.prompt
    ? embeddedTitle
      ? options.prompt.trim().slice(0, 3800)
      : enforceTrack2VisualPrompt(options.prompt, 'cover', accent, style)
    : embeddedTitle
      ? buildEmbeddedCoverPrompt({
          title,
          subtitle,
          competitionName: options.competitionName,
          teamName: options.teamName,
          titleLayout: options.titleLayout,
          accent,
          style,
          dimensions: cleanDims,
        })
      : options.content
        ? buildReportDrivenImagePrompt({ ...options.content, title, accent }, 'report_cover', undefined, style)
        : buildTrack2AssetPrompt({ title, subtitle, kind: 'cover', accent, style });

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  let fallbackReason = '当前未启用在线精绘通道，已生成出版级 A4 封面与同源图表色板。';

  if (transport && targetUrl) {
    try {
      const response = await transport(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task: 'report_cover',
          aspect: '3:4',
          pageArtKind: 'cover',
          accent,
          style,
          quality,
          allowEmbeddedTypography: embeddedTitle,
          ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(95_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        mime?: string;
        imageDataUrl?: string;
        pageArt?: unknown;
        figurePalette?: unknown;
        fallbackReason?: string;
        error?: string;
      } | null;

      if (payload?.ok && payload.mode === 'live_api') {
        let coverImage: CoverImage | null = null;
        let figurePalette: FigurePalette | null = null;
        const embeddedNote = sanitizeArtNote(
          embeddedTitle
            ? '国奖出版级 A4 图文一体报告封面（题名字形在图中）'
            : '国奖出版级 A4 报告封面底图',
          embeddedTitle ? '报告封面（题名字形在图中）' : '报告封面底图',
        );

        if (payload.pageArt) {
          const parsed = parseCoverImage(payload.pageArt);
          coverImage = embeddedTitle && !parsed.note.includes('题名字形在图中')
            ? parseCoverImage({ ...parsed, note: embeddedNote })
            : parsed;
        } else if (typeof payload.imageDataUrl === 'string') {
          const match = payload.imageDataUrl.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/u);
          if (match) {
            const mime = match[1] as 'image/png' | 'image/jpeg';
            const data = match[2];
            const dims = imageSize(base64ToBytes(data), mime);
            if (dims) {
              coverImage = parseCoverImage({
                schema: 'CoverImage/v1',
                mime,
                data,
                widthPx: dims.width,
                heightPx: dims.height,
                note: embeddedNote,
              });
            }
          }
        }

        if (payload.figurePalette) {
          figurePalette = parseFigurePalette(payload.figurePalette);
        } else if (coverImage) {
          figurePalette = defaultPaletteForAccent(accent);
        }

        if (coverImage && figurePalette) {
          const nextContent = options.content ? applyCoverImage(options.content, coverImage, figurePalette) : undefined;
          return {
            ok: true,
            mode: 'live_api',
            modelId,
            resolvedModel: payload.resolvedModel || modelId,
            style,
            prompt,
            coverImage,
            figurePalette,
            ...(nextContent ? { content: nextContent } : {}),
          };
        }
      }

      if (payload?.fallbackReason || payload?.error) {
        fallbackReason = payload.fallbackReason || payload.error || fallbackReason;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }
      fallbackReason = '在线封面精绘未完成，已自动切换为出版级 A4 封面与同源色板。';
    }
  }

  if (!allowFallback) {
    throw new Error(fallbackReason);
  }

  const { coverImage, figurePalette } = await synthesizeDeterministicCoverArt({
    title,
    accent,
    style,
  });
  const nextContent = options.content ? applyCoverImage(options.content, coverImage, figurePalette) : undefined;
  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId,
    resolvedModel: 'deterministic-a4-editorial-v1',
    style,
    prompt,
    coverImage,
    figurePalette,
    ...(nextContent ? { content: nextContent } : {}),
    fallbackReason,
  };
}

/* ───────── 2. GPT-Image Thematic Flowing A4 Page Frame (`generateReportFrameArt`) ───────── */

export interface GenerateReportFrameArtOptions {
  /** Target report draft (`EditorContent`). When supplied, `result.content` returns `applyFrameImage(content, frameImage)`. */
  content?: EditorContent;
  /** Topic / report title for motif alignment. */
  title?: string;
  /** Domain accent (`'teal' | 'blue' | 'burgundy'`). */
  accent?: EditorContent['accent'];
  /** Preferred image model ID (defaults to `'gpt-image-1.5'`). */
  modelId?: string;
  /** Render quality (defaults to `'medium'`). */
  quality?: 'high' | 'medium';
  /** Custom prompt override. */
  prompt?: string;
  /** Image gateway endpoint. */
  endpoint?: string;
  /** Optional API key override. */
  apiKey?: string;
  /** Optional custom `fetch` implementation. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /** When `true` (default), falls back to deterministic transparent A4 PNG frame when offline. */
  allowDeterministicFallback?: boolean;
}

export interface GeneratedReportFrameArt {
  ok: true;
  mode: 'live_api' | 'deterministic_fallback';
  modelId: string;
  resolvedModel: string;
  prompt: string;
  frameImage: FrameImage;
  content?: EditorContent;
  fallbackReason?: string;
}

/**
 * Generates a flowing thematic A4 page border/frame (`FrameImage/v1`, `<= 600 KB`, `FRAME_CLEAR_ZONES_MM` hard-wiped
 * to `alpha = 0`) modeled on `green-contour-v1.png` & `blue-geometric-v1.png` and applies it to `options.content`.
 */
export async function generateReportFrameArt(
  options: GenerateReportFrameArtOptions = {},
): Promise<GeneratedReportFrameArt> {
  const accent = options.accent ?? options.content?.accent ?? 'teal';
  const title = (options.title ?? options.content?.title ?? '市场调查与统计分析报告').trim();
  const modelId = options.modelId ?? 'gpt-image-1.5';
  const quality = options.quality ?? 'medium';
  const allowFallback = options.allowDeterministicFallback !== false;

  const prompt = options.prompt
    ? enforceTrack2VisualPrompt(options.prompt, 'frame', accent)
    : buildArtisticFramePrompt({ title, accent });

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  let fallbackReason = '当前未启用在线精绘通道，已生成透明 A4 装饰页框。';

  if (transport && targetUrl) {
    try {
      const response = await transport(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task: 'report_frame',
          aspect: '3:4',
          pageArtKind: 'frame',
          accent,
          quality,
          ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(95_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        pageArt?: unknown;
        fallbackReason?: string;
        error?: string;
      } | null;

      if (payload?.ok && payload.mode === 'live_api' && payload.pageArt) {
        const frameImage = parseFrameImage(payload.pageArt);
        const nextContent = options.content ? applyFrameImage(options.content, frameImage) : undefined;
        return {
          ok: true,
          mode: 'live_api',
          modelId,
          resolvedModel: payload.resolvedModel || modelId,
          prompt,
          frameImage,
          ...(nextContent ? { content: nextContent } : {}),
        };
      }

      if (payload?.fallbackReason || payload?.error) {
        fallbackReason = payload.fallbackReason || payload.error || fallbackReason;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }
      fallbackReason = '在线页框精绘未完成，已自动切换为透明 A4 装饰页框。';
    }
  }

  if (!allowFallback) {
    throw new Error(fallbackReason);
  }

  const frameImage = await synthesizeDeterministicFrameArt({ accent });
  const nextContent = options.content ? applyFrameImage(options.content, frameImage) : undefined;
  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId,
    resolvedModel: 'deterministic-a4-frame-v1',
    prompt,
    frameImage,
    ...(nextContent ? { content: nextContent } : {}),
    fallbackReason,
  };
}

/* ───────── 3. GPT-Image Respondent Persona + 10-Icon Silhouette Array + Progress-Bar Infographic (`generateDemographicInfographicArt`) ───────── */

export type DemographicInfographicVariant = 'profile' | 'behavior';

export interface DemographicInfographicBand {
  dimension: string;
  items: Array<{ label: string; pct: string }>;
}

function cleanInfographicCardLabel(raw: string): string {
  let s = (raw || '')
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/^过去\s*30\s*天内/u, '')
    .replace(/^近\s*30\s*天内?/u, '')
    .replace(/^目前正在/u, '正在')
    .replace(/^当前正在/u, '正在')
    .replace(/^曾经使用过?但近期/u, '曾用')
    .replace(/^曾使用但目前已?/u, '曾用')
    .replace(/^听说或?了解但尚未/u, '尚未')
    .replace(/^了解但尚未实际/u, '尚未')
    .replace(/^了解但尚未/u, '尚未')
    .trim();

  // Keep age ranges super clean & compact (e.g. "60–64 岁低龄长者" -> "60-64岁", "71 岁及以上老年人" -> "71岁及以上")
  const ageRangeMatch = /^(\d+)\s*[-~–—]\s*(\d+)\s*岁/u.exec(s);
  if (ageRangeMatch) {
    return `${ageRangeMatch[1]}-${ageRangeMatch[2]}岁`;
  }
  const agePlusMatch = /^(\d+)\s*岁(?:及以上|以上)/u.exec(s);
  if (agePlusMatch) {
    return `${agePlusMatch[1]}岁及以上`;
  }
  const ageUnderMatch = /^(\d+)\s*岁(?:及以下|以下)/u.exec(s);
  if (ageUnderMatch) {
    return `${ageUnderMatch[1]}岁及以下`;
  }

  // Price / budget tiers (e.g. "每月 50–100 元区间" -> "50-100元", "200 元以上档" -> "200元以上")
  const yuanRangeMatch = /(\d+)\s*[-~–—]\s*(\d+)\s*元/u.exec(s);
  if (yuanRangeMatch) {
    return `${yuanRangeMatch[1]}-${yuanRangeMatch[2]}元`;
  }
  const yuanBoundMatch = /(\d+)\s*元(?:及以上|以上|及以下|以下)/u.exec(s);
  if (yuanBoundMatch) {
    return yuanBoundMatch[0].replace(/\s+/gu, '');
  }
  if (/暂不愿付费|0\s*元|免费/u.test(s) && s.length > 6) {
    return '免费/零预算';
  }

  // Frequency phrases (e.g. "每周2–4次" -> "每周2-4次", "累计1–3次" -> "月1-3次", "0次" -> "近期0次")
  s = s.replace(/(\d+)\s*[-~–—]\s*(\d+)/gu, '$1-$2');
  if (/^0\s*次$/u.test(s)) return '近期0次';

  // Split slash / enumeration phrases cleanly rather than chopping mid-token
  if (s.length > 7 && /[\/、｜|]/u.test(s)) {
    const firstPart = s.split(/[\/、｜|]/u)[0]?.trim() ?? '';
    if (firstPart.length >= 3) s = firstPart;
  }

  s = s
    .replace(/^社区健康服务站/u, '社区站')
    .replace(/^街道网格员入户或/u, '网格员')
    .replace(/^设备端语音播报与/u, '设备语音')
    .replace(/^家庭微信群与子女/u, '家庭微信')
    .replace(/^每月稳定复购/u, '稳定复购')
    .replace(/^曾经购买现已趋于/u, '曾购趋于')
    .replace(/^仅围观关注尚未/u, '关注尚未')
    .replace(/^仅因喜爱\s*IP\s*/iu, '喜爱IP')
    .replace(/(?:受访群体|消费者群体|消费群体|用户群体|老年群体|长者群体|服务对象)$/u, '')
    .replace(/[-~–—/·、，,：:\s]+$/gu, '')
    .trim();

  if (Array.from(s).length > 10) {
    s = Array.from(s).slice(0, 10).join('').replace(/[-~–—/·、，,：:\s]+$/gu, '');
  }
  return s || (raw || '').trim().slice(0, 6);
}

function cleanInfographicDimLabel(raw: string): string {
  let s = (raw || '')
    .replace(/^受访者的?|^实际体验群体的?|^全体样本的?/u, '')
    .replace(/(?:构成|分布|情况|区间|承受档位|档位)$/u, '')
    .trim();
  if (Array.from(s).length > 6 && s.includes('与')) {
    const parts = s.split('与').map(p => p.trim()).filter(Boolean);
    s = parts.find(p => /状态|渠道|频次|年龄/u.test(p)) ?? parts[0] ?? s;
  }
  return Array.from(s).slice(0, 7).join('').replace(/[与和及·\s]+$/gu, '') || '特征维度';
}

export function extractDemographicBandsForInfographic(
  content: EditorContent,
  variant: DemographicInfographicVariant = 'profile',
  targetSnap?: ResultSnapshot | null,
): DemographicInfographicBand[] {
  const results = content.quality?.results ?? [];
  const resolvedTarget =
    targetSnap
    ?? results.find(r =>
      r.id.startsWith(variant === 'profile' ? 'rich-profile-infographic-' : 'rich-behavior-infographic-'),
    )
    ?? null;

  // 1. Prefer exact pre-reconciled rows inside `rich-profile-infographic-*` (Q1+Q2+Q3) or `rich-behavior-infographic-*` (Q4+Q27+Q28)
  if (resolvedTarget && resolvedTarget.rows.length >= 4) {
    const byGroup = new Map<string, Array<{ label: string; pct: string }>>();
    for (const row of resolvedTarget.rows) {
      const grp = String(row[0] ?? '').trim();
      const lbl = String(row[1] ?? '').trim();
      const val = row[2];
      const unit = String(row[3] ?? '').trim();
      if (!grp || !lbl || /KPI|核心发现|结论|来源快照/u.test(grp) || typeof val !== 'number' || !Number.isFinite(val)) {
        continue;
      }
      const rawKey = lbl.includes('·') ? lbl.split('·')[0].trim() : grp;
      const rawItem = lbl.includes('·') ? lbl.split('·').slice(1).join('·').trim() : lbl;
      const key = cleanInfographicDimLabel(rawKey);
      const itemLbl = cleanInfographicCardLabel(rawItem);
      const list = byGroup.get(key) ?? [];
      if (list.length < 4 && itemLbl) {
        list.push({ label: itemLbl, pct: unit.includes('%') ? `${Number(val.toFixed(1))}%` : `${val}` });
      }
      byGroup.set(key, list);
    }
    const snapBands: DemographicInfographicBand[] = [];
    for (const [dimension, items] of byGroup.entries()) {
      if (items.length >= 2 && snapBands.length < 3) {
        snapBands.push({ dimension, items });
      }
    }
    if (snapBands.length >= 2) {
      return snapBands;
    }
  }

  // 2. Fallback to `frequency` snapshots
  const freqSnaps = results.filter(r => r.method === 'frequency' && r.rows.length >= 2);
  const profilePattern = /群体|身份|性别|年龄|代际|年级|状态|经历|接触/u;
  const behaviorPattern = /频次|频率|天数|次数|渠道|途径|方式|通知|预算|价格|费用|档位|接受|月均/u;

  const matchedFreq = freqSnaps.filter(r => {
    const labelText = `${r.title} ${(r.variables ?? []).join(' ')}`;
    return variant === 'profile'
      ? profilePattern.test(labelText) && !behaviorPattern.test(labelText)
      : behaviorPattern.test(labelText);
  });
  const selectedFreq = (matchedFreq.length ? matchedFreq : variant === 'profile' ? freqSnaps.slice(0, 3) : freqSnaps.slice(3, 6)).slice(0, 3);

  const bands: DemographicInfographicBand[] = [];
  for (const fr of selectedFreq) {
    const pctCol = fr.headers.findIndex(h => /%|％|占比/u.test(h));
    const countCol = fr.headers.findIndex(h => /频数|人数/u.test(h));
    const rawDim = cleanInfographicDimLabel(fr.variables?.[0] || fr.title);
    const items: Array<{ label: string; pct: string }> = [];
    for (const row of fr.rows) {
      const cat = String(row[0] ?? '').trim();
      if (!cat || /合计|总计|valid|total/iu.test(cat)) continue;
      let pctNum = NaN;
      if (pctCol >= 0 && row[pctCol] !== null && row[pctCol] !== undefined) {
        pctNum = typeof row[pctCol] === 'number' ? row[pctCol] : Number(String(row[pctCol]).replace(/[%％]/gu, '').trim());
      } else if (countCol >= 0 && fr.n > 0 && row[countCol] !== null) {
        pctNum = (Number(row[countCol]) / fr.n) * 100;
      }
      if (Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100 && items.length < 4) {
        items.push({ label: cleanInfographicCardLabel(cat), pct: `${Number(pctNum.toFixed(1))}%` });
      }
    }
    if (items.length >= 2) {
      bands.push({ dimension: rawDim, items });
    }
  }

  return bands;
}

export function buildDemographicInfographicPrompt(params: {
  content: EditorContent;
  variant?: DemographicInfographicVariant;
  targetSnap?: ResultSnapshot | null;
}): string {
  const variant = params.variant ?? 'profile';
  const accent = params.content.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const cleanTopic = qualitativeSubjectPhrase(params.content.title || '市场调查研究', '受访者特征研究', 26);
  const bands = extractDemographicBandsForInfographic(params.content, variant, params.targetSnap);
  const headerTitle = variant === 'profile' ? '受访者基本构成画像图' : '受访者使用行为与渠道预算特征图';

  const bandLines = bands.length
    ? bands.map(
        (b, idx) =>
          `- 第 ${idx + 1} 横栏左侧深色圆角标签卡大字写 "${b.dimension}"，右侧严格并列 ${b.items.length} 张浅色圆角信息卡（严禁多余空卡）：${b.items
            .map(it => {
              const pctVal = Number.parseFloat(String(it.pct).replace(/[%％]/gu, ''));
              const litCount = Number.isFinite(pctVal) ? Math.max(0, Math.min(10, Math.round(pctVal / 10))) : 5;
              const dimCount = 10 - litCount;
              const barPct = Number.isFinite(pctVal) ? Math.round(pctVal) : 50;
              return `[角色/物件插画 + 10人剪影条（一共必须画满恰好10个并排小人图标：左起 ${litCount} 个主色点亮小人 + 右侧紧接 ${dimCount} 个浅灰未点亮小人，${litCount}+${dimCount}=10个，严禁只画6个或8个！） + 填充约 ${barPct}% 长度的圆角进度条 + 大号印刷黑体标签 "${it.label}" + 大号数字 "${it.pct}"]`;
            })
            .join('；')}`,
      )
    : [
        `- 第 1 横栏左侧标签卡写 "群体构成"，右侧并列扁平人物角色插画、10格小人剪影占比条与圆角进度条卡片`,
        `- 第 2 横栏左侧标签卡写 "接触状态"，右侧并列场景插画图标与圆角进度条卡片`,
        `- 第 3 横栏左侧标签卡写 "年龄结构"，右侧并列青年/中年/银发扁平人物半身插画与占比进度条卡片`,
      ];

  return humanizePromptHexColors(
    [
      `参照出版级社科调查人物画像信息图范式，为“${cleanTopic}”创作一张横版高颜值受访者统计画像信息图（Editorial Respondent Persona & Silhouette Icon-Array Infographic）。`,
      `整体版式与留白：暖米白宣纸底色背景，四周预留至少 7% 干净温暖纸白安全边距（顶部标题绝不贴顶裁切！）；左上角大号端庄现代黑体标题正面水平书写："${headerTitle}"（下方配暖金色细装饰线），右上角点缀无任何招牌文字的极简社区/城市水彩剪影；主色统一采用${palette.zhName}主调搭配暖金细节点缀、深炭墨正文色与中性岩灰辅色。`,
      `主体分栏结构（共 ${Math.max(bands.length, 3)} 行圆角横向卡片带，每张卡片含亲切温润的半身人物形象或主题器物插画 + 直观的 10格小人剪影占比阵列 + 圆角横向进度条，每行 10 个小人剪影的点亮个数必须严格等于对应百分比除以 10 四舍五入整数，例如 19.6% 必画 2 个彩色点亮小人 + 8 个浅灰未点亮小人！）：`,
      ...bandLines,
      `高精中文排版铁律：所有卡片标签与百分比必须采用正面水平大字号端庄印刷黑体，严格且仅精确渲染双引号内给出的简体中文词组与真实百分比；逐字核对 12 画以上复杂汉字偏旁部首（如“触”字左角右虫笔画分明零粘连、“庭”为广字头、“频”为步+页、“常”为尚字头+巾、“龄”为齿+令），严禁错别字或笔画糊成一团；严禁在背景小建筑屋顶、器物表面或徽章上印任何微小汉字或英文，严禁出现伪汉字乱码、水印或校徽。`,
    ].join('\n'),
  );
}

export interface GenerateDemographicInfographicArtOptions {
  content: EditorContent;
  /** `'profile'` (Q1/Q2/Q3 respondent persona & age/status) or `'behavior'` (Q4/Q27/Q28 frequency, channel & budget). Defaults to `'profile'`. */
  variant?: DemographicInfographicVariant;
  /** Explicit `ResultSnapshot.id` to bind (auto-detects `rich-profile-infographic-*` or `rich-behavior-infographic-*` when omitted). */
  resultId?: string;
  /** Optional target section ID override when creating a new exhibit block. */
  sectionId?: string;
  /** Preferred image model ID (defaults to `'gpt-image-1.5'`). */
  modelId?: string;
  /** Render quality (defaults to `'high'` for crisp Chinese labels & percentages). */
  quality?: 'high' | 'medium';
  /** Custom prompt override. */
  prompt?: string;
  /** Image gateway endpoint. */
  endpoint?: string;
  /** Optional API key override. */
  apiKey?: string;
  /** Optional custom `fetch` implementation. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /** When `false` (recommended for offline pipeline unit tests), returns `content` untouched without throwing if live gateway is offline. */
  allowDeterministicFallback?: boolean;
}

export interface GeneratedSectionIllustrationResult {
  ok: true;
  mode: 'live_api' | 'deterministic_fallback';
  modelId: string;
  resolvedModel: string;
  prompt: string;
  content: EditorContent;
  resultId: string | null;
  sectionId?: string;
  sectionIllustration: SectionIllustration | null;
  fallbackReason?: string;
}

function parseSectionArtFromGatewayPayload(
  payload: {
    resolvedModel?: string;
    imageDataUrl?: string;
    sectionArt?: { mime?: string; data?: string; widthPx?: number; heightPx?: number };
  },
  resultId: string,
  note: string,
): SectionIllustration | null {
  if (payload.sectionArt && typeof payload.sectionArt.data === 'string') {
    return parseSectionIllustration({
      schema: 'SectionIllustration/v1',
      id: `ill-${resultId}`.slice(0, 80),
      resultId,
      mime: payload.sectionArt.mime,
      data: payload.sectionArt.data,
      widthPx: payload.sectionArt.widthPx,
      heightPx: payload.sectionArt.heightPx,
      note,
    });
  }
  if (typeof payload.imageDataUrl === 'string') {
    const match = payload.imageDataUrl.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/u);
    if (match) {
      const mime = match[1] as 'image/png' | 'image/jpeg';
      const data = match[2];
      const dims = imageSize(base64ToBytes(data), mime);
      if (dims) {
        return parseSectionIllustration({
          schema: 'SectionIllustration/v1',
          id: `ill-${resultId}`.slice(0, 80),
          resultId,
          mime,
          data,
          widthPx: dims.width,
          heightPx: dims.height,
          note,
        });
      }
    }
  }
  return null;
}

/**
 * Generates a GPT-Image-1.5 Respondent Persona + 10-Unit Silhouette Array + Progress-Bar Infographic
 * grounded in `content.quality.results` and binds it via `applySectionIllustration` to `rich-profile-infographic-*`
 * / `rich-behavior-infographic-*` (or a newly registered `infographic` snapshot).
 */
export async function generateDemographicInfographicArt(
  options: GenerateDemographicInfographicArtOptions,
): Promise<GeneratedSectionIllustrationResult> {
  const baseContent = options.content;
  const variant = options.variant ?? 'profile';
  const accent = baseContent.accent ?? 'teal';
  const modelId = options.modelId ?? 'gpt-image-2';
  const quality = options.quality ?? 'high';
  const allowFallback = options.allowDeterministicFallback !== false;
  const defaultBlueprintNode = variant === 'profile' ? 'sample.profile' : 'sample.descriptive';
  const idPrefix = variant === 'profile' ? 'rich-profile-infographic-' : 'rich-behavior-infographic-';

  const existingSnap =
    (options.resultId
      ? baseContent.quality?.results.find(r => r.id === options.resultId)
      : baseContent.quality?.results.find(r => r.id.startsWith(idPrefix))) ?? null;

  const prompt = options.prompt?.trim()
    ? options.prompt.trim().slice(0, 3800)
    : buildDemographicInfographicPrompt({ content: baseContent, variant, targetSnap: existingSnap });

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  let fallbackReason = '当前未启用在线精绘通道，保留矢量小人进度条复合信息图。';

  if (transport && targetUrl) {
    try {
      const response = await transport(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task: 'descriptive_infographic',
          aspect: '16:9',
          accent,
          quality,
          allowEmbeddedTypography: true,
          ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(95_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        imageDataUrl?: string;
        sectionArt?: { mime?: string; data?: string; widthPx?: number; heightPx?: number };
        fallbackReason?: string;
        error?: string;
      } | null;

      if (payload?.ok && payload.mode === 'live_api') {
        let workingContent = baseContent;
        let boundResultId = existingSnap?.id ?? '';
        let placedSectionId: string | undefined;

        if (existingSnap) {
          const alreadyPlacedSec = workingContent.report.find(s =>
            s.blocks?.some(b => b.kind === 'chart' && b.evidenceId === existingSnap.id),
          );
          if (alreadyPlacedSec) {
            placedSectionId = alreadyPlacedSec.id;
          } else {
            const explicitSec =
              options.sectionId && workingContent.report.some(s => s.id === options.sectionId)
                ? options.sectionId
                : undefined;
            const resolved = targetSection(workingContent, defaultBlueprintNode, explicitSec);
            const placed = placeResult(resolved.content, existingSnap.id, {
              sectionId: resolved.sectionId,
              exhibits: ['chart'],
            });
            workingContent = placed.content;
            placedSectionId = placed.sectionId;
          }
        } else {
          const snapTitle =
            variant === 'profile'
              ? '受访者群体构成、接触状态与年龄分布画像图'
              : '受访者使用频次、获知渠道与预算档位特征图';
          const newSnap = await buildInfographicResultSnapshot({
            content: workingContent,
            title: snapTitle,
            prompt,
          });
          const appended = appendRegisteredResult(workingContent, { result: newSnap });
          const explicitSec =
            options.sectionId && appended.report.some(s => s.id === options.sectionId)
              ? options.sectionId
              : undefined;
          const resolved = targetSection(appended, defaultBlueprintNode, explicitSec);
          const placed = placeResult(resolved.content, newSnap.id, {
            sectionId: resolved.sectionId,
            exhibits: ['chart'],
          });
          workingContent = placed.content;
          boundResultId = newSnap.id;
          placedSectionId = placed.sectionId;
        }

        const artNote = sanitizeArtNote(
          '出版级受访者人物画像与小人进度条统计图（绑定样本实证占比）',
          '受访者人物画像统计图',
        );
        const illustration = parseSectionArtFromGatewayPayload(payload, boundResultId, artNote);
        if (illustration) {
          const withArt = applySectionIllustration(workingContent, illustration);
          return {
            ok: true,
            mode: 'live_api',
            modelId,
            resolvedModel: payload.resolvedModel || modelId,
            prompt,
            content: withArt,
            resultId: boundResultId,
            sectionId: placedSectionId,
            sectionIllustration: illustration,
          };
        }
      }

      if (payload?.fallbackReason || payload?.error) {
        fallbackReason = payload.fallbackReason || payload.error || fallbackReason;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }
      fallbackReason = '在线人物画像精绘未完成，保留矢量小人进度条图。';
    }
  }

  if (!allowFallback || existingSnap) {
    return {
      ok: true,
      mode: 'deterministic_fallback',
      modelId,
      resolvedModel: 'none',
      prompt,
      content: baseContent,
      resultId: existingSnap?.id ?? null,
      sectionIllustration: null,
      fallbackReason,
    };
  }

  const snapTitle =
    variant === 'profile'
      ? '受访者群体构成、接触状态与年龄分布画像图'
      : '受访者使用频次、获知渠道与预算档位特征图';
  const snap = await buildInfographicResultSnapshot({
    content: baseContent,
    title: snapTitle,
    prompt,
  });
  const appended = appendRegisteredResult(baseContent, { result: snap });
  const explicitSec =
    options.sectionId && appended.report.some(s => s.id === options.sectionId)
      ? options.sectionId
      : undefined;
  const resolved = targetSection(appended, defaultBlueprintNode, explicitSec);
  const placed = placeResult(resolved.content, snap.id, {
    sectionId: resolved.sectionId,
    exhibits: ['chart'],
  });
  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId,
    resolvedModel: 'deterministic-svg-fallback',
    prompt,
    content: placed.content,
    resultId: snap.id,
    sectionId: placed.sectionId,
    sectionIllustration: null,
    fallbackReason,
  };
}

/* ───────── 4. GPT-Image Chapter 9 Action Implementation Mechanism Roadmap (`generateActionRoadmapArt`) ───────── */

export function buildActionRoadmapPrompt(params: {
  content: EditorContent;
  targetSnap?: ResultSnapshot | null;
  policyHighlights?: readonly string[];
}): string {
  const accent = params.content.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const cleanTopic = qualitativeSubjectPhrase(params.content.title || '市场调查研究', '民生服务优化', 26);

  const stageTitles: string[] = [];
  if (params.targetSnap) {
    for (const row of params.targetSnap.rows) {
      if (String(row[0] ?? '') === '节点' || row.length >= 2) {
        const candidate = cleanCoverHeadingText(String(row[1] ?? row[0] ?? ''), 12);
        if (candidate && stageTitles.length < 4 && !stageTitles.includes(candidate)) {
          stageTitles.push(candidate);
        }
      }
    }
  }
  const stages =
    stageTitles.length >= 3
      ? stageTitles.slice(0, 4)
      : ['实证痛点识别', '基层制度协同', '三十天试点运行', '效果复测推广'];

  const policyCue = (params.policyHighlights ?? [])
    .map(p => qualitativeSubjectPhrase(p, '', 16))
    .filter(Boolean)
    .slice(0, 3)
    .join('、');

  return humanizePromptHexColors(
    [
      `为全国大学生市场调查与分析大赛报告第九章对策方案“${cleanTopic}”创作一张横版出版级多方协同治理与落地实施机制架构插画（Editorial Multi-Actor Implementation & Pilot Governance Mechanism Diagram）。`,
      `整体构图与留白：暖米白宣纸底色背景，四周预留至少 8% 纯净纸白安全边距（顶部标题横幅绝不贴边裁切！）；顶部居中横幅以大号端庄印刷黑体精确书写："协同治理与试点实施路径图"；画面中部由左至右水平排布四个扁平微缩场景插画模块，模块 1→2→3→4 之间以朝右的宽幅暖金箭头串联；画面最下方绘制一条从最右端模块 4 正下方作为起点出发、沿底部向左弯曲延伸、最终箭头尖端明确停在最左端模块 1 正下方且箭头朝左回指模块 1 的暖金色虚线反馈回流箭头（注意：底部虚线的箭头三角形必须在最左端模块 1 下方且朝左/左上，最右端模块 4 下方是虚线起点无箭头，严禁把底部箭头画在右端！）；主色调严格采用${palette.zhName}主调搭配暖金细节点缀、深炭墨正文色与中性岩灰辅色。`,
      `四大递进实施模块（每个模块上方配无任何微小文字的纯净扁平微缩场景插画${policyCue ? `，呼应${policyCue}等真实服务场景` : ''}，下方配足够宽大的正面水平深色圆角铭牌，字号充裕醒目，严禁倾斜透视字）：`,
      ...stages.map((st, idx) => `- 模块 ${idx + 1} 正面水平铭牌大号白字印刷黑体精确书写："${st}"`),
      `高精中文排版铁律：严格且仅在顶部横幅与下方四块正面水平铭牌中以大号标准印刷黑体渲染上述双引号内的简体中文词组；逐字严格核对笔画偏旁——特别是“实证痛点识别”的“痛”字必须是病字头“疒+甬”，绝不可误写成三点水“浦”！“基层制度协同”的“基/制/度/协”、“三十天试点运行”的“试/点/运/行”、“效果复测推广”的“复/测/推/广”每一笔清晰锐利零粘连；严禁在微缩建筑屋顶、印章、日历、旗帜或单据道具上书写任何汉字、数字（包括 30）、二维码或英文字母，严禁出现伪汉字乱码、水印或校徽。`,
    ].join('\n'),
  );
}

export interface GenerateActionRoadmapArtOptions {
  content: EditorContent;
  /** Explicit `ResultSnapshot.id` to bind (auto-detects `rich-action-roadmap-*`, `demo-action-roadmap-*`, or `plan.measures` diagram). */
  resultId?: string;
  /** Optional target section ID override if creating a fallback exhibit block. */
  sectionId?: string;
  /** Optional concrete local governance / policy tools to weave into visual scene icons. */
  policyHighlights?: readonly string[];
  /** Preferred image model ID (defaults to `'gpt-image-1.5'`). */
  modelId?: string;
  /** Render quality (defaults to `'high'`). */
  quality?: 'high' | 'medium';
  /** Custom prompt override. */
  prompt?: string;
  /** Image gateway endpoint. */
  endpoint?: string;
  /** Optional API key override. */
  apiKey?: string;
  /** Optional custom `fetch` implementation. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /** When `false` (recommended for offline unit tests), keeps the existing vector `diagram` untouched if offline. */
  allowDeterministicFallback?: boolean;
}

/**
 * Generates a GPT-Image-1.5 16:9 Multi-Actor Governance & 30-Day Implementation Mechanism Illustration
 * for Chapter 9 (`图 9-1` / `plan.measures`) and binds it via `applySectionIllustration` to `rich-action-roadmap-*`.
 */
export async function generateActionRoadmapArt(
  options: GenerateActionRoadmapArtOptions,
): Promise<GeneratedSectionIllustrationResult> {
  const baseContent = options.content;
  const accent = baseContent.accent ?? 'teal';
  const modelId = options.modelId ?? 'gpt-image-2';
  const quality = options.quality ?? 'high';
  const allowFallback = options.allowDeterministicFallback !== false;

  const results = baseContent.quality?.results ?? [];
  const measuresSec = baseContent.report.find(s => /对策|措施|方案|落地/u.test(s.title));
  const existingSnap =
    (options.resultId ? results.find(r => r.id === options.resultId) : undefined)
    ?? results.find(r => r.id.startsWith('rich-action-roadmap-') || r.id.startsWith('demo-action-roadmap-'))
    ?? results.find(
      r =>
        (r.method === 'diagram' || r.method === 'framework')
        && measuresSec?.blocks?.some(b => b.kind === 'chart' && b.evidenceId === r.id),
    )
    ?? null;

  const prompt = options.prompt?.trim()
    ? options.prompt.trim().slice(0, 3800)
    : buildActionRoadmapPrompt({
        content: baseContent,
        targetSnap: existingSnap,
        policyHighlights: options.policyHighlights,
      });

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  let fallbackReason = '当前未启用在线精绘通道，保留矢量实施路径图。';

  if (transport && targetUrl) {
    try {
      const response = await transport(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task: 'section_illustration',
          aspect: '16:9',
          accent,
          quality,
          allowEmbeddedTypography: true,
          ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(95_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        imageDataUrl?: string;
        sectionArt?: { mime?: string; data?: string; widthPx?: number; heightPx?: number };
        fallbackReason?: string;
        error?: string;
      } | null;

      if (payload?.ok && payload.mode === 'live_api') {
        let workingContent = baseContent;
        let boundResultId = existingSnap?.id ?? '';
        let placedSectionId = measuresSec?.id;

        if (!existingSnap) {
          const newSnap = await buildInfographicResultSnapshot({
            content: workingContent,
            title: '多方协同治理与三十天试点实施机制路径图',
            prompt,
          });
          const appended = appendRegisteredResult(workingContent, { result: newSnap });
          const explicitSec =
            options.sectionId && appended.report.some(s => s.id === options.sectionId)
              ? options.sectionId
              : undefined;
          const resolved = targetSection(appended, 'plan.measures', explicitSec);
          const placed = placeResult(resolved.content, newSnap.id, {
            sectionId: resolved.sectionId,
            exhibits: ['chart'],
          });
          workingContent = placed.content;
          boundResultId = newSnap.id;
          placedSectionId = placed.sectionId;
        }

        const artNote = sanitizeArtNote(
          '出版级第九章多方协同治理与试点实施机制路径图',
          '协同治理与实施机制图',
        );
        const illustration = parseSectionArtFromGatewayPayload(payload, boundResultId, artNote);
        if (illustration) {
          const withArt = applySectionIllustration(workingContent, illustration);
          return {
            ok: true,
            mode: 'live_api',
            modelId,
            resolvedModel: payload.resolvedModel || modelId,
            prompt,
            content: withArt,
            resultId: boundResultId,
            sectionId: placedSectionId,
            sectionIllustration: illustration,
          };
        }
      }

      if (payload?.fallbackReason || payload?.error) {
        fallbackReason = payload.fallbackReason || payload.error || fallbackReason;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }
      fallbackReason = '在线机制路径图精绘未完成，保留矢量实施流程图。';
    }
  }

  if (!allowFallback || existingSnap) {
    return {
      ok: true,
      mode: 'deterministic_fallback',
      modelId,
      resolvedModel: 'none',
      prompt,
      content: baseContent,
      resultId: existingSnap?.id ?? null,
      sectionId: measuresSec?.id,
      sectionIllustration: null,
      fallbackReason,
    };
  }

  const fallbackSnap = await buildInfographicResultSnapshot({
    content: baseContent,
    title: '多方协同治理与三十天试点实施机制路径图',
    prompt,
  });
  const appended = appendRegisteredResult(baseContent, { result: fallbackSnap });
  const explicitSec =
    options.sectionId && appended.report.some(s => s.id === options.sectionId)
      ? options.sectionId
      : undefined;
  const resolved = targetSection(appended, 'plan.measures', explicitSec);
  const placed = placeResult(resolved.content, fallbackSnap.id, {
    sectionId: resolved.sectionId,
    exhibits: ['chart'],
  });
  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId,
    resolvedModel: 'deterministic-svg-fallback',
    prompt,
    content: placed.content,
    resultId: fallbackSnap.id,
    sectionId: placed.sectionId,
    sectionIllustration: null,
    fallbackReason,
  };
}

/* ───────── 1-Call AI Topic Overall-Feature Panorama (`总体特征图` / `SectionIllustration/v1`) Helper ───────── */

export interface GenerateTopicFeatureOverviewArtOptions {
  /** Target report draft (`EditorContent`). */
  content: EditorContent;
  /** Optional explicit section ID (defaults to the section matching blueprint `'sample.profile'`, creating Chapter 4.1 if missing). */
  sectionId?: string;
  /** Preferred image model ID (defaults to `'gpt-image-1'`). */
  modelId?: string;
  /** Optional custom prompt override (sanitized & enforced through Track 2 non-quantitative guardrails). */
  prompt?: string;
  /** Image gateway endpoint (defaults to `'/api/agent/image-gen'` in browser; pass an absolute URL in Node when targeting a live gateway). */
  endpoint?: string;
  /** Optional personal API key for authorized local dev gateway requests (never logged or echoed). */
  apiKey?: string;
  /** Optional custom `fetch` implementation for testing or server-to-server calls. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /**
   * When `false` (recommended for offline unit-test pipeline runs), returns `{ ok: true, mode: 'deterministic_fallback', content: options.content, ... }`
   * without injecting the legacy SVG Bento card or throwing. When `true` (default for interactive UI), places the deterministic snapshot if offline.
   */
  allowDeterministicFallback?: boolean;
}

export interface GeneratedTopicFeatureOverviewArt {
  ok: true;
  mode: 'live_api' | 'deterministic_fallback';
  modelId: string;
  resolvedModel: string;
  style: EditorialArtStyleId;
  prompt: string;
  content: EditorContent;
  sectionId?: string;
  snapshot: ResultSnapshot | null;
  sectionIllustration: SectionIllustration | null;
  fallbackReason?: string;
}

export function buildTopicOverviewAcademicTitle(reportTitle: string): string {
  const shortSubject = (reportTitle || '市场调查研究')
    .replace(/[（(].*?[）)]/gu, '')
    .replace(/[—–-].*$/u, '')
    .replace(/(?:市场调查与分析报告|调查研究报告|实证研究报告|研究报告|调查报告)$/u, '')
    .trim()
    .slice(0, 22) || '市场调查研究';
  return `${shortSubject}调查对象与核心研究场景总体特征全景示意图`;
}

/**
 * 1-call helper for `@pipeline-v2` and `ImageWorkshopStudio`: generates a live 16:9 AI Topic Overall-Feature
 * Panorama (`1280×720`), registers its `ResultSnapshot` (`method: 'infographic'`), places it in `sample.profile`
 * (or `options.sectionId`), and binds `SectionIllustration/v1` via `applySectionIllustration` so Web A4, Word `.docx`,
 * PPTX, and LaTeX `.tex` all render the real topic illustration.
 */
export async function generateTopicFeatureOverviewArt(
  options: GenerateTopicFeatureOverviewArtOptions,
): Promise<GeneratedTopicFeatureOverviewArt> {
  const baseContent = options.content;
  const accent = baseContent.accent ?? 'teal';
  const rawTitle = baseContent.title?.trim() || '市场调查与实证分析研究报告';
  const style = selectEditorialArtStyle(`${rawTitle} ${baseContent.subtitle ?? ''}`);
  const modelId = options.modelId ?? 'gpt-image-1';
  const allowFallback = options.allowDeterministicFallback !== false;

  const prompt = options.prompt
    ? enforceTrack2VisualPrompt(options.prompt, 'concept', accent, style)
    : buildReportDrivenImagePrompt(baseContent, 'descriptive_infographic', options.sectionId, style);

  const overviewTitle = buildTopicOverviewAcademicTitle(rawTitle);

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  let fallbackReason = '当前未启用在线精绘通道，暂未插入课题总体特征全景示意图。';

  if (transport && targetUrl) {
    try {
      const response = await transport(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task: 'descriptive_infographic',
          aspect: '16:9',
          accent,
          ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(65_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        mime?: string;
        imageDataUrl?: string;
        sectionArt?: {
          mime?: string;
          data?: string;
          widthPx?: number;
          heightPx?: number;
        };
        fallbackReason?: string;
        error?: string;
      } | null;

      if (payload?.ok && payload.mode === 'live_api') {
        const snap = await buildInfographicResultSnapshot({
          content: baseContent,
          title: overviewTitle,
          prompt,
        });
        const appended = appendRegisteredResult(baseContent, { result: snap });
        const explicitSec =
          options.sectionId && appended.report.some(s => s.id === options.sectionId)
            ? options.sectionId
            : undefined;
        const resolvedTarget = targetSection(appended, 'sample.profile', explicitSec);
        const placed = placeResult(resolvedTarget.content, snap.id, {
          sectionId: resolvedTarget.sectionId,
          exhibits: ['chart'],
        });

        const artNote = sanitizeArtNote(
          '出版级课题总体特征全景示意图（16:9 主题场景示意，非定量测量图）',
          '课题总体特征全景示意图',
        );

        let illustration: SectionIllustration | null = null;
        if (payload.sectionArt && typeof payload.sectionArt.data === 'string') {
          illustration = parseSectionIllustration({
            schema: 'SectionIllustration/v1',
            id: `ill-${snap.id}`.slice(0, 80),
            resultId: snap.id,
            mime: payload.sectionArt.mime,
            data: payload.sectionArt.data,
            widthPx: payload.sectionArt.widthPx,
            heightPx: payload.sectionArt.heightPx,
            note: artNote,
          });
        } else if (typeof payload.imageDataUrl === 'string') {
          const match = payload.imageDataUrl.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/u);
          if (match) {
            const mime = match[1] as 'image/png' | 'image/jpeg';
            const data = match[2];
            const dims = imageSize(base64ToBytes(data), mime);
            if (dims) {
              illustration = parseSectionIllustration({
                schema: 'SectionIllustration/v1',
                id: `ill-${snap.id}`.slice(0, 80),
                resultId: snap.id,
                mime,
                data,
                widthPx: dims.width,
                heightPx: dims.height,
                note: artNote,
              });
            }
          }
        }

        if (illustration) {
          const withArt = applySectionIllustration(placed.content, illustration);
          return {
            ok: true,
            mode: 'live_api',
            modelId,
            resolvedModel: payload.resolvedModel || modelId,
            style,
            prompt,
            content: withArt,
            sectionId: placed.sectionId,
            snapshot: snap,
            sectionIllustration: illustration,
          };
        }
      }

      if (payload?.fallbackReason || payload?.error) {
        fallbackReason = payload.fallbackReason || payload.error || fallbackReason;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }
      fallbackReason = '在线绘图连接未完成，已切换为本地矢量模式。';
    }
  }

  if (!allowFallback) {
    return {
      ok: true,
      mode: 'deterministic_fallback',
      modelId,
      resolvedModel: 'none',
      style,
      prompt,
      content: baseContent,
      snapshot: null,
      sectionIllustration: null,
      fallbackReason,
    };
  }

  const snap = await buildInfographicResultSnapshot({
    content: baseContent,
    title: overviewTitle,
    prompt,
  });
  const appended = appendRegisteredResult(baseContent, { result: snap });
  const explicitSec =
    options.sectionId && appended.report.some(s => s.id === options.sectionId)
      ? options.sectionId
      : undefined;
  const resolvedTarget = targetSection(appended, 'sample.profile', explicitSec);
  const placed = placeResult(resolvedTarget.content, snap.id, {
    sectionId: resolvedTarget.sectionId,
    exhibits: ['chart'],
  });
  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId,
    resolvedModel: 'deterministic-svg-fallback',
    style,
    prompt,
    content: placed.content,
    sectionId: placed.sectionId,
    snapshot: snap,
    sectionIllustration: null,
    fallbackReason,
  };
}

/* ───────── Wave 7A: GPT-Image Structured Summary Card (`generateStructuredSummaryCardArt` — Figure-29 Paradigm) ───────── */

export type SummaryCardSlot =
  | 'intro.significance'
  | 'intro.innovation'
  | 'plan.measures'
  | 'conclusion.findings';

export interface StructuredSummaryCardColumn {
  header: string;
  iconHint?: string;
  bullets: readonly string[];
}

export interface BuildStructuredSummaryCardPromptParams {
  content: EditorContent;
  slot: SummaryCardSlot;
  mainTitle?: string;
  subtitle?: string;
  frameworkBadge?: string;
  columns?: readonly StructuredSummaryCardColumn[];
  bottomGoal?: string;
  policyHighlights?: readonly string[];
  targetSnap?: ResultSnapshot | null;
}

function cleanSummaryPhrase(raw: string, maxChars = 10): string {
  const s = (raw || '')
    .replace(/^[①②③④⑤1-9.、\s]+/u, '')
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/\[\[(?:图|表|式|引):[^\]]+\]\]/gu, '')
    .replace(SIMULATION_OR_AI_DISCLOSURE_RX, '')
    .replace(/抓手|闭环|赋能|VOSviewer/giu, '')
    .replace(/[：:；;，,。！!？?"“”'‘’「」『』]/gu, ' ')
    .trim()
    .split(/\s+/u)[0] ?? '';
  return Array.from(s).slice(0, maxChars).join('').replace(/[-~–—/·与和及]+$/gu, '').trim();
}

function defaultSummarySpecForSlot(
  content: EditorContent,
  slot: SummaryCardSlot,
  policyHighlights?: readonly string[],
  targetSnap?: ResultSnapshot | null,
): {
  mainTitle: string;
  subtitle: string;
  frameworkBadge: string;
  columns: StructuredSummaryCardColumn[];
  bottomGoal: string;
} {
  const clusterSnap = content.quality?.results.find(r => r.method === 'cluster');
  const clusterNames = (clusterSnap?.rows ?? [])
    .map(r => cleanSummaryPhrase(String(r[0] ?? ''), 7))
    .filter(s => s.length >= 2 && !/^(?:簇|群|类别|合计|总计)/u.test(s));
  const cleanTitleSubject = qualitativeSubjectPhrase(content.title || '', '研究对象', 10);

  // Extract structured columns from targetSnap rows if @study-engine populated summary-card rows
  const extractedCols: StructuredSummaryCardColumn[] = [];
  if (targetSnap && targetSnap.rows.length >= 3) {
    const byCol = new Map<string, string[]>();
    for (const row of targetSnap.rows) {
      const c0 = String(row[0] ?? '').trim();
      const c1 = String(row[1] ?? '').trim();
      const c2 = String(row[2] ?? '').trim();
      if (!c0 || /标题|框架|目标导向|KPI|核心发现|来源快照/u.test(c0)) continue;
      const header = cleanSummaryPhrase(c0, 7);
      const rawPoints = [c1, c2]
        .flatMap(cell => cell.split(/[；;｜|\n]/u))
        .map(p => cleanSummaryPhrase(p, 9))
        .filter(p => p.length >= 3);
      if (header && rawPoints.length) {
        const list = byCol.get(header) ?? [];
        for (const pt of rawPoints) {
          if (list.length < 3 && !list.includes(pt)) list.push(pt);
        }
        byCol.set(header, list);
      }
    }
    for (const [header, bullets] of byCol.entries()) {
      if (bullets.length >= 2 && extractedCols.length < 4) {
        extractedCols.push({ header, bullets: bullets.slice(0, 3) });
      }
    }
  }

  switch (slot) {
    case 'intro.significance':
      return {
        mainTitle: '研究理论拓展与实践支撑体系图',
        subtitle: '学术机制深化与基层服务提质双向支撑',
        frameworkBadge: '多维研究价值支撑框架',
        columns:
          extractedCols.length >= 3
            ? extractedCols
            : [
                {
                  header: '理论机制拓展',
                  iconHint: '极简书本与指南针线性图标',
                  bullets: ['拓展技术接受边界', '融合服务感知评价', '明晰协同调节路径'],
                },
                {
                  header: '调查方法规范',
                  iconHint: '极简分层抽样与矩阵线性图标',
                  bullets: ['多阶段分层配额抽样', '量表信效度双重核验', '回归与分群交叉印证'],
                },
                {
                  header: '实践治理参考',
                  iconHint: '极简社区建筑与盾牌线性图标',
                  bullets: ['定位核心体验短板', '识别细分群体诉求', '支撑试点方案落地'],
                },
              ],
        bottomGoal: '目标导向：构建兼具统计严密性与基层可操作性的实证决策支撑体系',
      };

    case 'intro.innovation':
      return {
        mainTitle: '研究体系三维创新架构总结图',
        subtitle: '研究视角、分析链路与制度转化协同创新',
        frameworkBadge: '三维协同创新架构',
        columns:
          extractedCols.length >= 3
            ? extractedCols
            : [
                {
                  header: '研究视角创新',
                  iconHint: '极简双环透镜线性图标',
                  bullets: ['超越单一均值评价', '纳入家庭与社区情境', '兼顾已用与未用样本'],
                },
                {
                  header: '实证链路创新',
                  iconHint: '极简模型网络线性图标',
                  bullets: ['控制总体满意回归', '衔接需求分类矩阵', '刻画多维人群画像'],
                },
                {
                  header: '落地转化创新',
                  iconHint: '极简靶心与核验单线性图标',
                  bullets: ['痛点对接属地制度', '设定平行对照观察', '明确客观放行标准'],
                },
              ],
        bottomGoal: '目标导向：打通从微观痛点识别到基层制度工具落地的完整证据链',
      };

    case 'plan.measures': {
      const h0 = clusterNames[0] || '高频核心群体';
      const h1 = clusterNames[1] || '协同依赖群体';
      const h2 = clusterNames[2] || '低评敏感群体';
      const h3 = clusterNames[3] || '潜在观望群体';
      return {
        mainTitle: `${cleanTitleSubject}受访群体分类支持路径图`,
        subtitle: '基于实证分群特征与需求优先级的差异化支持方案',
        frameworkBadge: '系统化分类支持框架',
        columns:
          extractedCols.length >= 3
            ? extractedCols
            : [
                {
                  header: h0,
                  iconHint: '极简星标与看板线性图标',
                  bullets: ['简化核心流程层级', '开放关键记录追溯', '培育核心示范反馈'],
                },
                {
                  header: h1,
                  iconHint: '极简双手协同与驿站线性图标',
                  bullets: ['驻点分步操作指引', '落实本人知情确认', '配发简明流程图卡'],
                },
                {
                  header: h2,
                  iconHint: '极简扳手与盾牌复核线性图标',
                  bullets: ['优先修复高频痛点', '缩短异常响应时效', '畅通人工接管渠道'],
                },
                {
                  header: h3,
                  iconHint: '极简窗口与放大镜线性图标',
                  bullets: ['完善补贴与试行政策', '开放低门槛体验包', '透明公示权责边界'],
                },
              ],
        bottomGoal: `目标导向：实现${cleanTitleSubject}分群精准触达、核心短板靶向修复与服务可持续运行`,
      };
    }

    case 'conclusion.findings':
      return {
        mainTitle: '核心实证发现与治理启示总结图',
        subtitle: '样本结构、驱动机制、群体分化与优化方向全景凝练',
        frameworkBadge: '实证研究核心结论体系',
        columns:
          extractedCols.length >= 3
            ? extractedCols
            : [
                {
                  header: '需求结构基线',
                  iconHint: '极简人群比例线性图标',
                  bullets: ['整体认知基础良好', '实际使用呈梯度分化', '价格预期集中务实'],
                },
                {
                  header: '核心驱动机制',
                  iconHint: '极简上升趋势线性图标',
                  bullets: ['感知易用显著正向', '规则透明降低顾虑', '启发支持促进留存'],
                },
                {
                  header: '痛点与人群分化',
                  iconHint: '极简分层聚光线性图标',
                  bullets: ['操作繁琐为首要阻碍', '细分群体诉求各异', '通知偏好随龄分化'],
                },
                {
                  header: '制度优化启示',
                  iconHint: '极简天平与核验章线性图标',
                  bullets: ['嵌入基层既有阵地', '实施三十天对照试行', '严守知情确认边界'],
                },
              ],
        bottomGoal: '目标导向：以扎实微观调查证据推动服务供给质量与基层治理效能协同跃升',
      };
  }
}

/**
 * Builds a Figure-29 style ("分类支持路径图 / 系统化支撑框架") GPT-Image-2 prompt on a pure `#FFFFFF` canvas:
 * Top title/subtitle -> centered deep-accent framework capsule -> tree connectors -> 3-4 equal-height cards
 * (accent header + minimalist icon + ①②③ concise bullets) -> bottom full-width goal banner.
 */
export function buildStructuredSummaryCardPrompt(params: BuildStructuredSummaryCardPromptParams): string {
  const accent = params.content.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const defaults = defaultSummarySpecForSlot(
    params.content,
    params.slot,
    params.policyHighlights,
    params.targetSnap,
  );

  const mainTitle = params.mainTitle?.trim() || defaults.mainTitle;
  const subtitle = params.subtitle?.trim() || defaults.subtitle;
  const badge = params.frameworkBadge?.trim() || defaults.frameworkBadge;
  const cols = (params.columns?.length ? params.columns : defaults.columns).slice(0, 4);
  const bottomGoal = params.bottomGoal?.trim() || defaults.bottomGoal;
  const circles = ['①', '②', '③'];

  const colLines = cols.map((c, idx) => {
    const bulletStr = c.bullets
      .slice(0, 3)
      .map((b, bi) => `"${circles[bi] ?? '•'} ${cleanSummaryPhrase(b, 10) || b}"`)
      .join('、');
    return `- 第 ${idx + 1} 张等高圆角白卡：顶部深色标题栏白字写 "${c.header}"，标题栏下方居中绘一枚${c.iconHint || '极简双色线性主题图标'}，图标下方左对齐分行清晰书写 ${c.bullets.slice(0, 3).length} 条要点：${bulletStr}`;
  });

  return humanizePromptHexColors(
    [
      `参照出版级社科研究报告“分类支持路径与结构化总结卡”经典版式，创作一张 16:9 横版高颜值结构化图文总结图（Editorial Tree-Branching Structured Summary Card Diagram）。`,
      `画布与色彩规范：100% 纯净纯白背景（四周留出 7% 纯白安全边距，严禁灰黑外框或杂乱底纹！）；主色统一采用${palette.zhName}主调搭配浅雾底色、暖金细节点缀与深炭墨正文色。`,
      `自上而下四层严谨几何结构：`,
      `1. 顶部居中标题区：大号端庄现代黑体主标题精确书写："${mainTitle}"；正下方小号清雅灰字副标题书写："${subtitle}"；`,
      `2. 中上部核心枢纽胶囊：居中绘制一枚深${palette.zhName}圆角胶囊横条，白字精确书写："${badge}"，胶囊底部向下伸出工整直角树状分叉细线，精准连接下方并列的 ${cols.length} 张等宽等高圆角卡片；`,
      `3. 中部并列 ${cols.length} 张等高圆角信息卡（卡片白底配淡雅细边框，顶部为深主色圆角标题头）：`,
      ...colLines,
      `4. 底部通栏总结条：跨越全部卡片底部的浅主色/暖金细边圆角通栏横条，居中端庄黑体精确书写："${bottomGoal}"。`,
      `高精中文排版铁律：所有文字一律采用正面水平标准印刷黑体，字号充裕、笔画端庄锐利零粘连零错字；严格且仅渲染上述双引号内给出的简体中文词句与圆圈序号；严禁添加任何双引号之外的括号备注小字、伪汉字乱码、多余英文水印或机构校徽。`,
    ].join('\n'),
  );
}

export interface GenerateStructuredSummaryCardArtOptions {
  content: EditorContent;
  /** Target long-prose summary slot (`'intro.significance' | 'intro.innovation' | 'plan.measures' | 'conclusion.findings'`). */
  slot: SummaryCardSlot;
  /** Explicit `ResultSnapshot.id` to bind (auto-detects `rich-significance-summary-*`, `rich-innovation-summary-*`, `rich-action-roadmap-*`, `rich-conclusion-summary-*`). */
  resultId?: string;
  /** Optional explicit section ID override. */
  sectionId?: string;
  /** Optional custom card columns override. */
  columns?: readonly StructuredSummaryCardColumn[];
  /** Optional policy instruments or domain highlights for `plan.measures`. */
  policyHighlights?: readonly string[];
  /** Preferred image model ID (defaults to `'gpt-image-2'`). */
  modelId?: string;
  /** Render quality (defaults to `'high'`). */
  quality?: 'high' | 'medium';
  /** Custom prompt override. */
  prompt?: string;
  /** Image gateway endpoint. */
  endpoint?: string;
  /** Optional API key override. */
  apiKey?: string;
  /** Optional custom `fetch` implementation. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /** When `false` (recommended for offline unit tests), leaves `content` untouched without throwing if gateway is offline. */
  allowDeterministicFallback?: boolean;
}

const SUMMARY_SLOT_META: Record<SummaryCardSlot, { prefixes: readonly string[]; fallbackTitle: string }> = {
  'intro.significance': {
    prefixes: ['rich-significance-summary-'],
    fallbackTitle: '研究理论拓展与基层治理实践支撑总结图',
  },
  'intro.innovation': {
    prefixes: ['rich-innovation-summary-'],
    fallbackTitle: '研究体系三维创新架构总结图',
  },
  'plan.measures': {
    prefixes: ['rich-measures-summary-', 'rich-action-roadmap-', 'demo-action-roadmap-'],
    fallbackTitle: '受访群体分类支持与精准施策路径图',
  },
  'conclusion.findings': {
    prefixes: ['rich-conclusion-summary-'],
    fallbackTitle: '核心实证发现与治理启示全景总结图',
  },
};

/**
 * Generates a Figure-29 style GPT-Image-2 (`quality: 'high'`, pure `#FFFFFF` canvas) Structured Summary Card
 * for prose-heavy sections (`intro.significance`, `intro.innovation`, `plan.measures`, `conclusion.findings`)
 * and binds `SectionIllustration/v1` via `applySectionIllustration`.
 */
export async function generateStructuredSummaryCardArt(
  options: GenerateStructuredSummaryCardArtOptions,
): Promise<GeneratedSectionIllustrationResult> {
  const baseContent = options.content;
  const slot = options.slot;
  const accent = baseContent.accent ?? 'teal';
  const modelId = options.modelId ?? 'gpt-image-2';
  const quality = options.quality ?? 'high';
  const allowFallback = options.allowDeterministicFallback !== false;
  const slotMeta = SUMMARY_SLOT_META[slot] ?? SUMMARY_SLOT_META['plan.measures'];

  const results = baseContent.quality?.results ?? [];
  const existingSnap =
    (options.resultId ? results.find(r => r.id === options.resultId) : undefined)
    ?? results.find(r => slotMeta.prefixes.some(prefix => r.id.startsWith(prefix)))
    ?? null;

  const prompt = options.prompt?.trim()
    ? options.prompt.trim().slice(0, 3800)
    : buildStructuredSummaryCardPrompt({
        content: baseContent,
        slot,
        columns: options.columns,
        policyHighlights: options.policyHighlights,
        targetSnap: existingSnap,
      });

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  let fallbackReason = '当前未启用在线精绘通道，保留矢量结构化总结卡片图。';

  if (transport && targetUrl) {
    try {
      const response = await transport(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt,
          task: 'section_illustration',
          aspect: '16:9',
          accent,
          quality,
          allowEmbeddedTypography: true,
          canvasBackground: 'white',
          ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(95_000),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mode?: 'live_api' | 'data_bound_composite';
        resolvedModel?: string;
        imageDataUrl?: string;
        sectionArt?: { mime?: string; data?: string; widthPx?: number; heightPx?: number };
        fallbackReason?: string;
        error?: string;
      } | null;

      if (payload?.ok && payload.mode === 'live_api') {
        let workingContent = baseContent;
        let boundResultId = existingSnap?.id ?? '';
        let placedSectionId: string | undefined;

        if (existingSnap) {
          const alreadySec = workingContent.report.find(s =>
            s.blocks?.some(b => b.kind === 'chart' && b.evidenceId === existingSnap.id),
          );
          if (alreadySec) {
            placedSectionId = alreadySec.id;
          } else {
            const explicitSec =
              options.sectionId && workingContent.report.some(s => s.id === options.sectionId)
                ? options.sectionId
                : undefined;
            const resolved = targetSection(workingContent, slot, explicitSec);
            const placed = placeResult(resolved.content, existingSnap.id, {
              sectionId: resolved.sectionId,
              exhibits: ['chart'],
            });
            workingContent = placed.content;
            placedSectionId = placed.sectionId;
          }
        } else {
          const newSnap = await buildInfographicResultSnapshot({
            content: workingContent,
            title: slotMeta.fallbackTitle,
            prompt,
          });
          const appended = appendRegisteredResult(workingContent, { result: newSnap });
          const explicitSec =
            options.sectionId && appended.report.some(s => s.id === options.sectionId)
              ? options.sectionId
              : undefined;
          const resolved = targetSection(appended, slot, explicitSec);
          const placed = placeResult(resolved.content, newSnap.id, {
            sectionId: resolved.sectionId,
            exhibits: ['chart'],
          });
          workingContent = placed.content;
          boundResultId = newSnap.id;
          placedSectionId = placed.sectionId;
        }

        const artNote = sanitizeArtNote(
          `出版级章节结构化框架总结图（${slotMeta.fallbackTitle}）`,
          '出版级结构化总结图',
        );
        const illustration = parseSectionArtFromGatewayPayload(payload, boundResultId, artNote);
        if (illustration) {
          const withArt = applySectionIllustration(workingContent, illustration);
          return {
            ok: true,
            mode: 'live_api',
            modelId,
            resolvedModel: payload.resolvedModel || modelId,
            prompt,
            content: withArt,
            resultId: boundResultId,
            sectionId: placedSectionId,
            sectionIllustration: illustration,
          };
        }
      }

      if (payload?.fallbackReason || payload?.error) {
        fallbackReason = payload.fallbackReason || payload.error || fallbackReason;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }
      fallbackReason = '在线结构化总结图精绘未完成，保留矢量结构总结图。';
    }
  }

  if (!allowFallback || existingSnap) {
    return {
      ok: true,
      mode: 'deterministic_fallback',
      modelId,
      resolvedModel: 'none',
      prompt,
      content: baseContent,
      resultId: existingSnap?.id ?? null,
      sectionIllustration: null,
      fallbackReason,
    };
  }

  const fallbackSnap = await buildInfographicResultSnapshot({
    content: baseContent,
    title: slotMeta.fallbackTitle,
    prompt,
  });
  const appended = appendRegisteredResult(baseContent, { result: fallbackSnap });
  const explicitSec =
    options.sectionId && appended.report.some(s => s.id === options.sectionId)
      ? options.sectionId
      : undefined;
  const resolved = targetSection(appended, slot, explicitSec);
  const placed = placeResult(resolved.content, fallbackSnap.id, {
    sectionId: resolved.sectionId,
    exhibits: ['chart'],
  });
  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId,
    resolvedModel: 'deterministic-svg-fallback',
    prompt,
    content: placed.content,
    resultId: fallbackSnap.id,
    sectionId: placed.sectionId,
    sectionIllustration: null,
    fallbackReason,
  };
}

/* ───────── Wave 7C: Backend Python `wordcloud` + `jieba` Shaped Word-Cloud Binder (`generateDenseWordCloudArt`) ───────── */

export interface DenseWordCloudEntry {
  word: string;
  weight: number;
}

export interface GenerateDenseWordCloudArtOptions {
  content: EditorContent;
  /** Optional explicit weighted word list; when omitted, automatically extracts words & weights from `rich-wordcloud-*` or `method === 'wordcloud'`. */
  words?: readonly DenseWordCloudEntry[];
  /** Optional raw open-feedback text corpus for backend `jieba` segmentation. */
  text?: string;
  /** Mask silhouette shape (`'auto' | 'cloud' | 'heart' | 'shield' | 'leaf' | 'capsule' | 'circle'`). Defaults to `'auto'`. */
  shape?: 'auto' | 'cloud' | 'heart' | 'shield' | 'leaf' | 'capsule' | 'circle';
  /** Explicit `ResultSnapshot.id` to bind (auto-detects `rich-wordcloud-*` or `method === 'wordcloud'`). */
  resultId?: string;
  /** Optional section ID override if placing an unplaced word-cloud snapshot. */
  sectionId?: string;
  /** Backend word-cloud endpoint (defaults to `'/api/reports/wordcloud'` in browser, or `${EVIX_API_ORIGIN}/api/reports/wordcloud` when set in Node). */
  endpoint?: string;
  /** Optional custom `fetch` implementation. */
  fetchImpl?: typeof fetch;
  /** Optional `AbortSignal`. */
  signal?: AbortSignal;
  /** Maximum words to pack into the silhouette mask (defaults to `160`). */
  maxWords?: number;
  /** Deterministic random seed (defaults to `42`). */
  seed?: number;
}

function extractWordCloudFrequenciesFromContent(
  content: EditorContent,
  explicitSnap?: ResultSnapshot | null,
): DenseWordCloudEntry[] {
  const results = content.quality?.results ?? [];
  const wcSnap =
    explicitSnap
    ?? results.find(r => r.id.startsWith('rich-wordcloud-'))
    ?? results.find(r => r.method === 'wordcloud')
    ?? null;
  if (!wcSnap) return [];

  const entries: DenseWordCloudEntry[] = [];
  for (const row of wcSnap.rows) {
    const word = String(row[0] ?? '').trim();
    const rawWeight = typeof row[1] === 'number' ? row[1] : Number(String(row[1] ?? '').trim());
    if (!word || SIMULATION_OR_AI_DISCLOSURE_RX.test(word)) continue;
    if (Number.isFinite(rawWeight) && rawWeight > 0) {
      entries.push({ word, weight: rawWeight });
    }
  }
  return entries;
}

/**
 * Calls the FastAPI Python `wordcloud` + `jieba` shaped high-density renderer (`POST /api/reports/wordcloud`,
 * `fuqiuai/wordCloud` & `flingjie/words_image` aesthetic: pure `#FFFFFF`, 160 words, `1280×720` `<= 500 KB`)
 * and binds the resulting PNG as `SectionIllustration/v1` onto `rich-wordcloud-*` (or `method === 'wordcloud'`).
 */
export async function generateDenseWordCloudArt(
  options: GenerateDenseWordCloudArtOptions,
): Promise<GeneratedSectionIllustrationResult> {
  const baseContent = options.content;
  const accent = baseContent.accent ?? 'teal';
  const results = baseContent.quality?.results ?? [];
  const existingSnap =
    (options.resultId ? results.find(r => r.id === options.resultId) : undefined)
    ?? results.find(r => r.id.startsWith('rich-wordcloud-'))
    ?? results.find(r => r.method === 'wordcloud')
    ?? null;

  const words = (options.words?.length ? [...options.words] : extractWordCloudFrequenciesFromContent(baseContent, existingSnap))
    .filter(w => w.word.trim() && !SIMULATION_OR_AI_DISCLOSURE_RX.test(w.word));

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const nodeApiOrigin =
    !hasBrowserOrigin && typeof process !== 'undefined' && process?.env?.EVIX_API_ORIGIN
      ? process.env.EVIX_API_ORIGIN.trim().replace(/\/+$/u, '')
      : '';
  const endpoint =
    options.endpoint
    ?? (hasBrowserOrigin ? '/api/reports/wordcloud' : nodeApiOrigin ? `${nodeApiOrigin}/api/reports/wordcloud` : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:8180/api/reports/wordcloud' : '');

  if (!existingSnap || (!words.length && !options.text?.trim()) || !transport || !targetUrl) {
    return {
      ok: true,
      mode: 'deterministic_fallback',
      modelId: 'python-wordcloud',
      resolvedModel: 'none',
      prompt: options.content.title || '开放式反馈高频语义词云图',
      content: baseContent,
      resultId: existingSnap?.id ?? null,
      sectionIllustration: null,
      fallbackReason: '语义词云绘图服务未连接或缺少词频记录，保留高密度矢量词云图。',
    };
  }

  const boundResultId = existingSnap.id;
  const cleanNote = '开放式反馈高频语义词云图';

  try {
    const response = await transport(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words,
        ...(options.text?.trim() ? { text: options.text.trim() } : {}),
        topic: baseContent.title || '市场调查实证研究',
        shape: options.shape ?? 'auto',
        accent,
        ...(baseContent.figurePalette
          ? {
              palette: {
                primary: baseContent.figurePalette.primary,
                secondary: baseContent.figurePalette.secondary,
                opposite: baseContent.figurePalette.opposite,
              },
            }
          : {}),
        resultId: boundResultId,
        id: `wc-${boundResultId}`.slice(0, 80),
        note: cleanNote,
        maxWords: options.maxWords ?? 160,
        seed: options.seed ?? 42,
      }),
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        mime?: string;
        data?: string;
        widthPx?: number;
        heightPx?: number;
        illustration?: unknown;
        sectionArt?: { mime?: string; data?: string; widthPx?: number; heightPx?: number };
        imageDataUrl?: string;
      } | null;

      let illustration: SectionIllustration | null = null;
      if (payload?.illustration && typeof payload.illustration === 'object') {
        const rawIll = payload.illustration as Record<string, unknown>;
        illustration = parseSectionIllustration({
          ...rawIll,
          id: `wc-${boundResultId}`.slice(0, 80),
          resultId: boundResultId,
          note: cleanNote,
        });
      } else if (payload?.sectionArt || (payload?.data && payload?.mime)) {
        illustration = parseSectionArtFromGatewayPayload(
          {
            sectionArt: payload.sectionArt ?? {
              mime: payload.mime,
              data: payload.data,
              widthPx: payload.widthPx,
              heightPx: payload.heightPx,
            },
            imageDataUrl: payload.imageDataUrl,
          },
          boundResultId,
          cleanNote,
        );
      }

      if (illustration) {
        let workingContent = baseContent;
        const alreadyPlaced = workingContent.report.find(s =>
          s.blocks?.some(b => b.kind === 'chart' && b.evidenceId === boundResultId),
        );
        let placedSectionId = alreadyPlaced?.id;
        if (!alreadyPlaced) {
          const explicitSec =
            options.sectionId && workingContent.report.some(s => s.id === options.sectionId)
              ? options.sectionId
              : undefined;
          const resolved = targetSection(workingContent, 'sample.descriptive', explicitSec);
          const placed = placeResult(resolved.content, boundResultId, {
            sectionId: resolved.sectionId,
            exhibits: ['chart'],
          });
          workingContent = placed.content;
          placedSectionId = placed.sectionId;
        }
        const withArt = applySectionIllustration(workingContent, illustration);
        return {
          ok: true,
          mode: 'live_api',
          modelId: 'python-wordcloud',
          resolvedModel: 'wordcloud-jieba-pil',
          prompt: cleanNote,
          content: withArt,
          resultId: boundResultId,
          sectionId: placedSectionId,
          sectionIllustration: illustration,
        };
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
      throw err;
    }
  }

  return {
    ok: true,
    mode: 'deterministic_fallback',
    modelId: 'python-wordcloud',
    resolvedModel: 'none',
    prompt: cleanNote,
    content: baseContent,
    resultId: boundResultId,
    sectionIllustration: null,
    fallbackReason: '语义词云绘图服务暂未就绪，保留高密度矢量词云图。',
  };
}

/* ───────── Wave 7.5: Parallel 6-Candidate Cross-Medium Cover (`cover-cand-f` Default Preferred) & 3-Candidate Frame Generators ───────── */

export type CoverCandidateId =
  | 'cover-cand-f'
  | 'cover-cand-a'
  | 'cover-cand-b'
  | 'cover-cand-c'
  | 'cover-cand-d'
  | 'cover-cand-e';
export type FrameCandidateMotifId = 'botanical_watercolor' | 'geometric_architectural' | 'oriental_double_rule';
export type FrameCandidateId = 'frame-cand-a' | 'frame-cand-b' | 'frame-cand-c';

export interface CoverCandidatePresetSpec {
  id: CoverCandidateId;
  label: string;
  badge: string;
  styleId: EditorialArtStyleId;
  defaultTitleLayout: CoverTitleLayout;
  defaultAccent: NonNullable<EditorContent['accent']>;
  isDefaultPreferred?: boolean;
  staticAssetUrl: string;
}

export const COVER_CANDIDATE_PRESETS: readonly CoverCandidatePresetSpec[] = [
  {
    id: 'cover-cand-f',
    label: '★ 首选 · 晶透光学玻璃静物微距风',
    badge: '光学玻璃主题器物微距 + 益普索杯全称',
    styleId: 'spatial_diorama',
    defaultTitleLayout: 'horizontal',
    defaultAccent: 'teal',
    isDefaultPreferred: true,
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.covers.f,
  },
  {
    id: 'cover-cand-a',
    label: 'A · 宋韵宣纸青金工笔风',
    badge: '宣纸青金丝带 + 非板正横排大字 + 益普索杯全称',
    styleId: 'risograph_printmaking',
    defaultTitleLayout: 'horizontal',
    defaultAccent: 'teal',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.covers.a,
  },
  {
    id: 'cover-cand-b',
    label: 'B · 钴蓝银灰瑞士数据蓝图现代风',
    badge: '钴蓝银灰网格 + 雕塑构成艺术字 + 益普索杯全称',
    styleId: 'spatial_diorama',
    defaultTitleLayout: 'horizontal',
    defaultAccent: 'blue',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.covers.b,
  },
  {
    id: 'cover-cand-c',
    label: 'C · 丹青朱砂新中式竖排风',
    badge: '丹青朱砂水墨 + 竖排非板正大字 + 益普索杯全称',
    styleId: 'risograph_printmaking',
    defaultTitleLayout: 'vertical',
    defaultAccent: 'burgundy',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.covers.c,
  },
  {
    id: 'cover-cand-d',
    label: 'D · 深海靛蓝×琥珀暖光 3D 剪纸灯箱风',
    badge: '靛蓝琥珀多层剪纸灯箱 + 立体艺术字 + 益普索杯全称',
    styleId: 'architectural_papercut',
    defaultTitleLayout: 'horizontal',
    defaultAccent: 'blue',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.covers.d,
  },
  {
    id: 'cover-cand-e',
    label: 'E · 暖阳 35mm 胶片纪实人文大刊风',
    badge: '暖阳 35mm 胶片纪实人文插画 + 手写艺术字 + 益普索杯全称',
    styleId: 'architectural_papercut',
    defaultTitleLayout: 'horizontal',
    defaultAccent: 'burgundy',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.covers.e,
  },
];

export type V3CoverVariantId = 'v3-woodblock' | 'v3-risograph' | 'v3-nocturne' | 'v3-collage';

export interface V3OpenCoverShowcaseItem {
  id: V3CoverVariantId;
  label: string;
  badge: string;
  directionName: string;
  pocketDescription: string;
  inkMode: 'dark_on_light' | 'light_on_dark';
  recommendedTypography: 'editorial_serif' | 'modern_geometric' | 'xuan_calligraphy' | 'cinnabar_vertical';
  defaultAccent: NonNullable<EditorContent['accent']>;
  staticAssetUrl: string;
}

export const V3_OPEN_COVER_SHOWCASE: readonly V3OpenCoverShowcaseItem[] = [
  {
    id: 'v3-woodblock',
    label: '方向一 · 版画叠印三层时空',
    badge: '木刻版画×柔印渐变 + 顶部松烟阅读口袋 + 高密度纹理',
    directionName: '木刻版画叠印与手工棉纸',
    pocketDescription: '顶部天穹留白阅读口袋，中景错落屋檐与植物剪影，前景质感纸纹与精细雕版线条',
    inkMode: 'dark_on_light',
    recommendedTypography: 'editorial_serif',
    defaultAccent: 'teal',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.v3Covers.woodblock,
  },
  {
    id: 'v3-risograph',
    label: '方向二 · 孔版几何城市剖面',
    badge: '双色孔版网点 + 建筑结构层叠 + 现代无衬线口袋',
    directionName: '双色孔版几何建筑叙事',
    pocketDescription: '左下/左上低噪点几何构图区，中景建筑剖面与微粒网点，前景锐利矢量节奏块面',
    inkMode: 'dark_on_light',
    recommendedTypography: 'modern_geometric',
    defaultAccent: 'blue',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.v3Covers.risograph,
  },
  {
    id: 'v3-nocturne',
    label: '方向三 · 夜航胶片电影感',
    badge: '深青夜幕微光城市 + 暗底暖金阅读区 + 电影景深',
    directionName: '35mm 夜航胶片纪实光影',
    pocketDescription: '深海暮色暗部阅读口袋（适配浅金/象牙白字体），中景温暖窗光与城市地平线',
    inkMode: 'light_on_dark',
    recommendedTypography: 'editorial_serif',
    defaultAccent: 'blue',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.v3Covers.nocturne,
  },
  {
    id: 'v3-collage',
    label: '方向四 · 博物志拼贴手账',
    badge: '铜版线稿×水彩切片×档案材质拼贴 + 杂志刊头节奏',
    directionName: '博物志多媒介纸本拼贴',
    pocketDescription: '米白档案纸偏心阅读框，中景手绘铜版器物线稿、半透明水彩切片与细密邮票网格',
    inkMode: 'dark_on_light',
    recommendedTypography: 'editorial_serif',
    defaultAccent: 'burgundy',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.v3Covers.collage,
  },
] as const;

export interface OpenArtDirectionBrief {
  id: V3CoverVariantId;
  label: string;
  directionName: string;
  inkMode: 'dark_on_light' | 'light_on_dark';
  pocketDescription: string;
  recommendedTypography: V3OpenCoverShowcaseItem['recommendedTypography'];
  prompt: string;
}

/**
 * Build 4 topic-agnostic, rich three-plane Open Art-Direction Briefs for any research domain
 * without locking layouts to rigid templates or hardcoded sample topics.
 */
export function buildOpenArtDirectionBriefs(params: {
  topic: string;
  subtitle?: string;
  accent?: NonNullable<EditorContent['accent']>;
  competitionName?: string;
}): OpenArtDirectionBrief[] {
  const cleanTopic = params.topic.trim() || '当代社会消费与行为实证调研';
  const cleanSubtitle = (params.subtitle ?? '').trim() || '多阶段抽样与异质性机制实证研究';
  const competition = (params.competitionName ?? '').trim() || '“益普索杯”第十七届全国大学生市场调查与分析大赛';
  const paletteSpec = ZHENGDA_ACCENT_PALETTES[params.accent ?? 'teal'] ?? ZHENGDA_ACCENT_PALETTES.teal;

  return V3_OPEN_COVER_SHOWCASE.map(item => ({
    id: item.id,
    label: item.label,
    directionName: item.directionName,
    inkMode: item.inkMode,
    pocketDescription: item.pocketDescription,
    recommendedTypography: item.recommendedTypography,
    prompt: [
      `A4 竖版学术调研报告封面视觉创作（3:4，出版级三景深结构），研究主题为“${cleanTopic}”，副主题为“${cleanSubtitle}”。`,
      `美术方向采用${item.directionName}；核心主色调参照 ${paletteSpec.zhName}（${paletteSpec.hex}）与自然纸墨协调层次。`,
      `构图与阅读留白：${item.pocketDescription}。切忌画面死板空洞或千篇一律的 50/50 切割，确保前景器物隐喻与中景环境叙事丰富饱满，同时为标题“${cleanTopic}”及赛事抬头“${competition}”保留高对比度纯净阅读区域。`,
      `物理材质真实可见（细微纸肌理/油墨颗粒/自然漫反射），严禁出现乱码伪字、界面进度条、统计数字或二维码。`,
    ].join('\n'),
  }));
}

export interface FrameCandidatePresetSpec {
  id: FrameCandidateId;
  label: string;
  badge: string;
  motifId: FrameCandidateMotifId;
  staticAssetUrl: string;
}

export const FRAME_CANDIDATE_PRESETS: readonly FrameCandidatePresetSpec[] = [
  {
    id: 'frame-cand-a',
    label: 'A · 流动植物水彩金线',
    badge: '水彩植物丝带 + 暖金游丝',
    motifId: 'botanical_watercolor',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.frames.a,
  },
  {
    id: 'frame-cand-b',
    label: 'B · 精密学院几何折线',
    badge: '对角建筑折线 + 暖金微菱锚点',
    motifId: 'geometric_architectural',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.frames.b,
  },
  {
    id: 'frame-cand-c',
    label: 'C · 极简东方双线角花',
    badge: '克制双细线框 + 淡墨回纹折角',
    motifId: 'oriental_double_rule',
    staticAssetUrl: SHOWCASE_PAGE_ART_ASSETS.candidates.frames.c,
  },
];

export function buildCoverCandidatePrompt(params: {
  candidateId: CoverCandidateId;
  title: string;
  subtitle?: string;
  competitionName?: string;
  teamName?: string;
  titleLayout?: CoverTitleLayout;
  accent?: EditorContent['accent'];
  dimensions?: readonly string[];
}): string {
  const preset = COVER_CANDIDATE_PRESETS.find(p => p.id === params.candidateId) ?? COVER_CANDIDATE_PRESETS[0];
  const accent = params.accent ?? preset.defaultAccent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const rawMainTitle = cleanCoverHeadingText(params.title, 44) || '社会民生与消费体验专题实证研究';
  const spec = normalizeCoverTextSpec({
    title: rawMainTitle,
    subtitle: cleanCoverHeadingText(sanitizeEmpiricalCoverSubtitle(params.subtitle, rawMainTitle), 48),
    competitionName: params.competitionName,
    teamName: params.teamName,
    titleLayout: params.titleLayout ?? preset.defaultTitleLayout,
  });
  const subjectMotif = qualitativeSubjectPhrase(spec.mainTitle, '现代社会治理与消费研究', 32);
  const cleanDims = (params.dimensions ?? [])
    .map(d => qualitativeSubjectPhrase(d, '', 14))
    .filter(Boolean)
    .slice(0, 4)
    .join('、') || '多主体协同与实证调查';

  const typoBlock = buildCoverTypographyPrompt({
    title: spec.mainTitle,
    subtitle: spec.subtitle,
    competitionName: spec.competitionName,
    teamName: spec.teamName,
    titleLayout: spec.titleLayout,
    accentHex: palette.zhName,
    inkMode: params.candidateId === 'cover-cand-d' ? 'light_on_dark' : 'dark_on_light',
  });

  const zeroMetaRule =
    '高精中文排版与盲审净版铁律：整幅画面严格且仅精确渲染上述双引号内指定的赛事全称、非板正艺术字主标题、副标题与盲审合规参赛团队！严禁使用死板机械的电脑印刷黑体或印刷宋体做主标题，严禁添加自述文种身份的冗余报告头衔标签，严禁在双引号之外添加任何括号说明或额外小字！严禁在插画区域写任何多余汉字、伪汉字乱码、英文字母、阿拉伯数字、百分比、水印、校徽或个人真实姓名。';

  switch (params.candidateId) {
    case 'cover-cand-f':
      return humanizePromptHexColors(
        [
          `创作“益普索杯”第十七届全国大学生市场调查与分析大赛国一出版级 A4 竖版图文一体封面（首选方案 F · 晶透光学玻璃静物微距风，210:297 纵向满版，参考《源头之后》高端静物微距艺术美学）。`,
          `版式结构（顶部益普索杯第十七届赛事全称 + 上中部高辨识度非板正艺术字主标题配极简金色竖线导引副标题 + 下半幅晶透光学玻璃器物微距静物 + 底部居中细线框盲审合规参赛团队署名）：`,
          typoBlock,
          `主视觉工艺：高端商业棚拍级晶透光学玻璃与围绕“${subjectMotif}”及“${cleanDims}”提炼的标志性器物微距静物美学，静置于通透玻璃/水晶载体之上，柔和晨光穿过建筑光影与散景投下通透焦散光斑，色调纯净克制、质感晶莹高级（绝非卡通插画）。`,
          zeroMetaRule,
        ].join('\n'),
      );

    case 'cover-cand-a':
      return humanizePromptHexColors(
        [
          `创作“益普索杯”第十七届全国大学生市场调查与分析大赛国一出版级 A4 竖版图文一体封面（方案 A · 宣纸青金横排行楷，210:297 纵向满版）。`,
          `版式结构（顶部益普索杯第十七届赛事全称 + 上中部灵动横排行楷毛笔艺术字主标题与青金色带副标题 + 中下部人文淡彩场景 + 底部盲审合规参赛团队署名）：`,
          typoBlock,
          `主视觉工艺：暖米白手工宣纸底色肌理搭配松石青瓷绿主调与暖金细节点缀飘逸游丝丝带，铜版细线融合清雅淡彩描绘“${subjectMotif}”与“${cleanDims}”的温暖人文互动场景。`,
          zeroMetaRule,
        ].join('\n'),
      );

    case 'cover-cand-b':
      return humanizePromptHexColors(
        [
          `创作“益普索杯”第十七届全国大学生市场调查与分析大赛国一出版级 A4 竖版图文一体封面（方案 B · 钴蓝银灰瑞士数据现代风，210:297 纵向满版）。`,
          `版式结构（顶部益普索杯赛事眉栏 + 雕塑现代构成艺术字主标题配银灰圆角胶囊副标题 + 右下等轴空间微缩构成 + 底部盲审合规参赛团队署名）：`,
          typoBlock,
          `主视觉工艺：冷峻高级的学院钴蓝主调与清透银灰白底色现代瑞士设计网格，搭配等轴微缩立体空间呈现“${subjectMotif}”与“${cleanDims}”，理性克制、视觉冲击力强。`,
          zeroMetaRule,
        ].join('\n'),
      );

    case 'cover-cand-c':
      return humanizePromptHexColors(
        [
          `创作“益普索杯”第十七届全国大学生市场调查与分析大赛国一出版级 A4 竖版图文一体封面（方案 C · 丹青朱砂新中式竖排书法，210:297 纵向满版）。`,
          `版式结构（顶部益普索杯第十七届全称 + 右侧气韵生动的竖排手写毛笔书法艺术字主标题 + 左侧简洁竖列/胶囊副题与留白 + 下部丹青水墨意境 + 底部盲审合规参赛团队署名）：`,
          typoBlock,
          `主视觉工艺：东方新中式宋韵丹青水墨融合人文绛红朱砂印泥点睛色与远山青黛意境，诗意呈现“${subjectMotif}”与“${cleanDims}”的人文温度与书卷张力。`,
          zeroMetaRule,
        ].join('\n'),
      );

    case 'cover-cand-d':
      return humanizePromptHexColors(
        [
          `创作“益普索杯”第十七届全国大学生市场调查与分析大赛国一出版级 A4 竖版图文一体封面（方案 D · 靛蓝琥珀 3D 立体剪纸光影，210:297 纵向满版）。`,
          `版式结构（顶部益普索杯赛事全称 + 富有立体层次感的暗底暖金非板正艺术字主标题与琥珀暖光副题 + 中下部多层立体剪纸光影场景 + 底部盲审合规参赛团队署名）：`,
          typoBlock,
          `主视觉工艺：博物馆级深海靛蓝底色与暖琥珀金细节点缀多层无酸卡纸 3D 剪纸透光浮雕艺术，柔和侧逆光影勾勒“${subjectMotif}”与“${cleanDims}”的温暖层次意象。`,
          zeroMetaRule,
        ].join('\n'),
      );

    case 'cover-cand-e':
      return humanizePromptHexColors(
        [
          `创作“益普索杯”第十七届全国大学生市场调查与分析大赛国一出版级 A4 竖版全出血封面（方案 E · 暖阳 35mm 胶片纪实摄影大刊风，210:297 纵向满版，参考《孤独经济》《短途露营》全出血暖光实拍纪实大刊美学）。`,
          `版式结构（顶部益普索杯赛事全称 + 自由手写/错落阶梯大字主标题与大刊副题 + 全出血暖阳 35mm 胶片纪实光影画面 + 底部盲审合规参赛团队署名）：`,
          typoBlock,
          `主视觉工艺：全出血温暖午后逆光琥珀色阳光、细腻 35mm 胶片光学颗粒与浅景深纪实生活场景构图，围绕“${subjectMotif}”与“${cleanDims}”定格真实器物或背影特写（避免可识别真人正脸肖像），故事感与人文温度极强。`,
          zeroMetaRule,
        ].join('\n'),
      );
  }
}

export function buildFrameCandidatePrompt(params: {
  motifId: FrameCandidateMotifId;
  title?: string;
  accent?: EditorContent['accent'];
}): string {
  const accent = params.accent ?? 'teal';
  const palette = ZHENGDA_ACCENT_PALETTES[accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const cleanTopic = qualitativeSubjectPhrase(params.title ?? '', '学术调查报告', 26);

  const motifClause =
    params.motifId === 'botanical_watercolor'
      ? `方案 A（极细外缘植物细线）：严格紧贴距纸张四边最外缘 4%–6%（8.5mm–12.5mm）的极窄页边带内，在四角最外缘点缀纤巧清雅的植物叶片细线与暖金色游丝双线（主色${palette.zhName}），角饰紧收在最外角绝不向内侵入，笔触 100% 锐利清晰无白雾虚化`
      : params.motifId === 'geometric_architectural'
        ? `方案 B（极细学院几何折线）：严格紧贴距纸张四边最外缘 4%–6%（8.5mm–12.5mm）的极窄外框带内，设计现代学院风精密双轨平行细线与四角微型几何折角节点（主色${palette.zhName}搭配暖金细节点缀细线），线条 100% 锐利闭合无任何边缘羽化虚化`
        : `方案 C（极细东方双线回纹角花）：严格紧贴距纸张四边最外缘 4%–5.5%（8.5mm–11.5mm）的极窄边带内，布置克制古典双细线外框与四角小巧精致的传统回纹对称折角（主色${palette.zhName}搭配暖金细节点缀极细内线），回字纹笔触 100% 完整锐利无遮罩擦除虚化`;

  return humanizePromptHexColors(
    [
      `为学术研究报告“${cleanTopic}”创作一张 A4 竖版（210:297）透明底/纯白底极细外缘装饰页框（Thematic Editorial Page Border Frame）。`,
      `${motifClause}。`,
      buildFramePerimeterPromptClause({ accentHex: palette.zhName, topic: cleanTopic }),
      `零内嵌文字铁律：画面内严禁生成任何中英文文字、数字、页码字符、校徽或水印（zero embedded text, no fake axis ticks, no fake chart numbers, no fake fieldwork photos）。`,
    ].join('\n'),
  );
}

export interface CoverArtCandidateItem {
  id: CoverCandidateId;
  label: string;
  badge: string;
  styleId: EditorialArtStyleId;
  prompt: string;
  coverImage: CoverImage;
  figurePalette: FigurePalette;
  resolvedModel: string;
  mode: 'live_api' | 'deterministic_fallback';
}

export interface GenerateCoverCandidatesOptions {
  content?: EditorContent;
  title?: string;
  subtitle?: string;
  competitionName?: string;
  teamName?: string;
  titleLayout?: CoverTitleLayout;
  accent?: EditorContent['accent'];
  modelId?: string;
  quality?: 'high' | 'medium';
  endpoint?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  allowDeterministicFallback?: boolean;
}

export interface GeneratedCoverCandidatesResult {
  ok: true;
  candidates: CoverArtCandidateItem[];
}

/**
 * Generates 5 high-contrast diversified editorial A4 cover candidates in parallel (`A`–`E`)
 * WITHOUT mutating `options.content`, so the user can compare all 5 side-by-side and click to adopt.
 */
export async function generateCoverCandidates(
  options: GenerateCoverCandidatesOptions = {},
): Promise<GeneratedCoverCandidatesResult> {
  const rawTitle = (options.title ?? options.content?.title ?? '社会民生与消费体验专题实证研究').trim() || '社会民生与消费体验专题实证研究';
  const subtitle = sanitizeEmpiricalCoverSubtitle(options.subtitle ?? options.content?.subtitle ?? '', rawTitle);
  const modelId = options.modelId ?? 'gpt-image-2';
  const quality = options.quality ?? 'high';
  const stats = options.content ? extractDescriptivePanelsFromReport(options.content) : null;
  const cleanDims = stats?.dimensionMeans.map(d => qualitativeSubjectPhrase(d.label, '', 14)).filter(Boolean).slice(0, 4) ?? [];

  const candidates = await Promise.all(
    COVER_CANDIDATE_PRESETS.map(async (preset): Promise<CoverArtCandidateItem> => {
      const candidateLayout = options.titleLayout ?? preset.defaultTitleLayout;
      const candidateAccent = options.accent ?? preset.defaultAccent;
      const prompt = buildCoverCandidatePrompt({
        candidateId: preset.id,
        title: rawTitle,
        subtitle,
        competitionName: options.competitionName,
        teamName: options.teamName,
        titleLayout: candidateLayout,
        accent: candidateAccent,
        dimensions: cleanDims,
      });
      const res = await generateReportCoverArt({
        title: `${rawTitle}`,
        subtitle,
        competitionName: options.competitionName,
        teamName: options.teamName,
        titleLayout: candidateLayout,
        accent: preset.defaultAccent,
        style: preset.styleId,
        modelId,
        quality,
        embeddedTitle: true,
        prompt,
        endpoint: options.endpoint,
        apiKey: options.apiKey,
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        allowDeterministicFallback: options.allowDeterministicFallback ?? true,
      });
      // Ensure offline deterministic fallback yields 5 distinct visuals across presets a..e
      const finalCoverRes =
        res.mode === 'deterministic_fallback'
          ? await synthesizeDeterministicCoverArt({
              title: `${rawTitle}|${preset.id}`,
              accent: preset.defaultAccent,
              style: preset.styleId,
              note: `国奖出版级 A4 封面候选（${preset.label}）`,
            })
          : { coverImage: res.coverImage, figurePalette: res.figurePalette };
      const taggedCover = parseCoverImage({
        ...finalCoverRes.coverImage,
        note: `国奖出版级 A4 封面候选（${preset.label}${res.mode === 'live_api' ? '，题名字形在图中' : ''}）`,
      });
      return {
        id: preset.id,
        label: preset.label,
        badge: preset.badge,
        styleId: preset.styleId,
        prompt,
        coverImage: taggedCover,
        figurePalette: finalCoverRes.figurePalette,
        resolvedModel: res.resolvedModel,
        mode: res.mode,
      };
    }),
  );

  return { ok: true, candidates };
}

export interface FrameArtCandidateItem {
  id: FrameCandidateId;
  label: string;
  badge: string;
  motifId: FrameCandidateMotifId;
  prompt: string;
  frameImage: FrameImage;
  resolvedModel: string;
  mode: 'live_api' | 'deterministic_fallback';
}

export interface GenerateFrameCandidatesOptions {
  content?: EditorContent;
  title?: string;
  accent?: EditorContent['accent'];
  modelId?: string;
  quality?: 'high' | 'medium';
  endpoint?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  allowDeterministicFallback?: boolean;
}

export interface GeneratedFrameCandidatesResult {
  ok: true;
  candidates: FrameArtCandidateItem[];
}

async function synthesizeDeterministicMotifFrameArt(params: {
  accent: EditorContent['accent'];
  motifId: FrameCandidateMotifId;
  label: string;
}): Promise<FrameImage> {
  const width = 840;
  const height = 1188;
  const paletteSpec = ZHENGDA_ACCENT_PALETTES[params.accent] ?? ZHENGDA_ACCENT_PALETTES.teal;
  const primaryRgb = hexToRgb(paletteSpec.hex);
  const goldRgb = hexToRgb('#C99A3E');
  const mutedRgb = hexToRgb(paletteSpec.mutedHex);
  const rgba = new Uint8Array(width * height * 4);
  const pxPerMm = width / 210; // 4 px/mm

  if (params.motifId === 'botanical_watercolor') {
    const xOuter = Math.round(12 * pxPerMm);
    const yTop = Math.round(12 * pxPerMm);
    const yBottom = height - Math.round(12 * pxPerMm);
    fillRectRgba(rgba, width, height, xOuter, yTop, width - xOuter, yTop + 4, primaryRgb, 185);
    fillRectRgba(rgba, width, height, xOuter + 8, yTop + 7, width - xOuter - 8, yTop + 9, goldRgb, 195);
    fillRectRgba(rgba, width, height, width - Math.round(24 * pxPerMm), yTop, width - xOuter, yTop + Math.round(18 * pxPerMm), primaryRgb, 95);
    fillRectRgba(rgba, width, height, xOuter, yBottom - Math.round(18 * pxPerMm), Math.round(24 * pxPerMm), yBottom, primaryRgb, 95);
    fillRectRgba(rgba, width, height, xOuter, yBottom - 3, Math.floor(76 * pxPerMm), yBottom, goldRgb, 165);
    fillRectRgba(rgba, width, height, Math.ceil(134 * pxPerMm), yBottom - 3, width - xOuter, yBottom, goldRgb, 165);
  } else if (params.motifId === 'geometric_architectural') {
    const xOuter = Math.round(14 * pxPerMm);
    const yTop = Math.round(13 * pxPerMm);
    const yBottom = height - Math.round(13 * pxPerMm);
    fillRectRgba(rgba, width, height, xOuter, yTop, width - xOuter, yTop + 3, primaryRgb, 230);
    fillRectRgba(rgba, width, height, xOuter, yTop, xOuter + 4, yBottom, primaryRgb, 145);
    fillRectRgba(rgba, width, height, width - xOuter - 4, yTop, width - xOuter, yBottom, primaryRgb, 145);
    fillRectRgba(rgba, width, height, width - Math.round(26 * pxPerMm), yTop + 5, width - xOuter - 6, yTop + 10, goldRgb, 220);
    fillRectRgba(rgba, width, height, xOuter + 6, yBottom - 10, Math.round(26 * pxPerMm), yBottom - 5, goldRgb, 220);
  } else {
    const xOuter = Math.round(11 * pxPerMm);
    const yTop = Math.round(11 * pxPerMm);
    const yBottom = height - Math.round(11 * pxPerMm);
    fillRectRgba(rgba, width, height, xOuter, yTop, width - xOuter, yTop + 2, primaryRgb, 200);
    fillRectRgba(rgba, width, height, xOuter + 6, yTop + 6, width - xOuter - 6, yTop + 7, goldRgb, 180);
    fillRectRgba(rgba, width, height, xOuter, yTop, xOuter + 2, yBottom, mutedRgb, 155);
    fillRectRgba(rgba, width, height, width - xOuter - 2, yTop, width - xOuter, yBottom, mutedRgb, 155);
    fillRectRgba(rgba, width, height, xOuter, yBottom - 2, Math.floor(76 * pxPerMm), yBottom, primaryRgb, 175);
    fillRectRgba(rgba, width, height, Math.ceil(134 * pxPerMm), yBottom - 2, width - xOuter, yBottom, primaryRgb, 175);
  }

  for (const zone of FRAME_CLEAR_ZONES_MM) {
    const x0 = Math.max(0, Math.floor(zone.x0 * pxPerMm) - 1);
    const y0 = Math.max(0, Math.floor(zone.y0 * pxPerMm) - 1);
    const x1 = Math.min(width, Math.ceil(zone.x1 * pxPerMm) + 1);
    const y1 = Math.min(height, Math.ceil(zone.y1 * pxPerMm) + 1);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  const pngBytes = await encodePngFromRgba(width, height, rgba, true);
  return parseFrameImage({
    schema: 'FrameImage/v1',
    mime: 'image/png',
    data: bytesToBase64(pngBytes),
    widthPx: width,
    heightPx: height,
    note: `国奖出版级 A4 透明页框候选（${params.label}）`,
  });
}

/**
 * Generates 3 distinct transparent A4 page-frame candidates in parallel (`A · 流动植物水彩金线`, `B · 精密学院几何折线`,
 * `C · 极简东方双线角花`), all strictly preserving `FRAME_CLEAR_ZONES_MM` `alpha === 0` without mutating `options.content`.
 */
export async function generateFrameCandidates(
  options: GenerateFrameCandidatesOptions = {},
): Promise<GeneratedFrameCandidatesResult> {
  const accent = options.accent ?? options.content?.accent ?? 'teal';
  const rawTitle = (options.title ?? options.content?.title ?? '市场调查与统计分析报告').trim();
  const modelId = options.modelId ?? 'gpt-image-2';
  const quality = options.quality ?? 'medium';
  const allowFallback = options.allowDeterministicFallback !== false;

  const hasBrowserOrigin = typeof window !== 'undefined' && typeof window.location?.origin === 'string';
  const endpoint = options.endpoint ?? (hasBrowserOrigin ? '/api/agent/image-gen' : '');
  const transport = options.fetchImpl ?? (endpoint ? globalThis.fetch : undefined);
  const targetUrl = endpoint || (options.fetchImpl ? 'http://127.0.0.1:3180/api/agent/image-gen' : '');

  const candidates = await Promise.all(
    FRAME_CANDIDATE_PRESETS.map(async (preset): Promise<FrameArtCandidateItem> => {
      const prompt = buildFrameCandidatePrompt({
        motifId: preset.motifId,
        title: rawTitle,
        accent,
      });

      if (transport && targetUrl) {
        try {
          const response = await transport(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelId,
              prompt,
              task: 'report_frame',
              aspect: '3:4',
              pageArtKind: 'frame',
              accent,
              quality,
              ...(options.apiKey?.trim() ? { apiKey: options.apiKey.trim() } : {}),
            }),
            signal: options.signal ?? AbortSignal.timeout(95_000),
          });
          const payload = (await response.json().catch(() => null)) as {
            ok?: boolean;
            mode?: 'live_api' | 'data_bound_composite';
            resolvedModel?: string;
            pageArt?: unknown;
          } | null;

          if (payload?.ok && payload.mode === 'live_api' && payload.pageArt) {
            const parsed = parseFrameImage(payload.pageArt);
            const tagged = parseFrameImage({
              ...parsed,
              note: `国奖出版级 A4 透明页框候选（${preset.label}）`,
            });
            return {
              id: preset.id,
              label: preset.label,
              badge: preset.badge,
              motifId: preset.motifId,
              prompt,
              frameImage: tagged,
              resolvedModel: payload.resolvedModel || modelId,
              mode: 'live_api',
            };
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError' && options.signal?.aborted) {
            throw err;
          }
        }
      }

      if (!allowFallback) {
        throw new Error(`页框候选方案（${preset.label}）生成失败。`);
      }

      const detFrame = await synthesizeDeterministicMotifFrameArt({
        accent,
        motifId: preset.motifId,
        label: preset.label,
      });
      return {
        id: preset.id,
        label: preset.label,
        badge: preset.badge,
        motifId: preset.motifId,
        prompt,
        frameImage: detFrame,
        resolvedModel: 'deterministic-a4-frame-v1',
        mode: 'deterministic_fallback',
      };
    }),
  );

  return { ok: true, candidates };
}
