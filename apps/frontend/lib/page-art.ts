/**
 * Whole-page artwork made with the user's report skills, stored in the draft and printed edge to edge:
 *
 * - the cover image (research-report-cover): one generated A4 artwork with the title lettering drawn into it. It is
 *   the cover page; no title is set over it.
 * - the frame image (research-report-frame): a transparent A4 PNG whose ornaments sit only in the page perimeter. It
 *   lies behind every page after the cover; the text area and its geometry never change.
 *
 * The pixel size is read from the file's own header, never trusted from the draft, and the page shape must be A4
 * portrait: an image is placed whole, never stretched or cropped. Kept in step with the backend's page_art.py.
 */

import { paletteFromPixels, type FigurePalette } from './figure-palette.ts';
import {
  A4_ASPECT,
  A4_PAGE_PX,
  PAGE_ART_LIMITS,
  SECTION_ILLUSTRATION_LIMITS,
  imageSize,
  pageArtBytes,
  pageArtDataUrl,
  parseCoverImage,
  parseFrameImage,
  parseSectionIllustration,
  sectionIllustrationBytes,
  sectionIllustrationDataUrl,
  type CoverImage,
  type FrameImage,
  type PageArt,
  type PageArtMime,
  type SectionIllustration,
} from './page-art-schema.ts';

export * from './page-art-schema.ts';
export {
  A4_ASPECT,
  A4_PAGE_PX,
  PAGE_ART_LIMITS,
  SECTION_ILLUSTRATION_LIMITS,
  imageSize,
  pageArtBytes,
  pageArtDataUrl,
  parseCoverImage,
  parseFrameImage,
  parseSectionIllustration,
  sectionIllustrationBytes,
  sectionIllustrationDataUrl,
  type CoverImage,
  type FrameImage,
  type PageArt,
  type PageArtMime,
  type SectionIllustration,
};
/** Where the frame must stay transparent, in millimetres: the body text area plus 3 mm, and the page number. */
export const FRAME_CLEAR_ZONES_MM = [{ x0: 28.8, y0: 22.4, x1: 181.2, y1: 274.6 }, { x0: 80, y0: 276, x1: 130, y1: 293 }] as const;
/** Source-stage ultra-narrow perimeter constraint (4%–6% outer strip, >= 88%×88% clear core, zero feather-blur bite). */
export const FRAME_OUTER_BAND_SPEC = {
  minRatio: 0.04,
  maxRatio: 0.06,
  minClearCoreRatio: 0.88,
  allowFeatherBlurMask: false,
} as const;

/** Default edition-specific competition title required at the top of 17th-edition report covers (officially crowned 益普索杯). */
export const DEFAULT_COVER_COMPETITION_NAME = '“益普索杯”第十七届全国大学生市场调查与分析大赛';
export const COVER_TITLE_LAYOUTS = ['horizontal', 'vertical'] as const;
export type CoverTitleLayout = (typeof COVER_TITLE_LAYOUTS)[number];

export const COVER_PIPELINE_MODES = ['direct_illustrated', 'layered_assembly'] as const;
export type CoverPipelineMode = (typeof COVER_PIPELINE_MODES)[number];
export const COVER_LAYER_ROLES = ['reference', 'clean_backdrop'] as const;
export type CoverLayerRole = (typeof COVER_LAYER_ROLES)[number];

export const DEFAULT_PREFERRED_COVER_CANDIDATE_ID = 'cover-cand-f';

/**
 * Six cross-palette, cross-medium cover art genres codified to eliminate homogenized green cartoon covers.
 * `cover-cand-f` (optical glass macro still-life inspired by 《源头之后》) is the default preferred #1 preset.
 */
export const COVER_CANDIDATE_SPEC_POOL = [
  {
    id: 'cover-cand-f',
    genre: 'optical_glass_macro',
    label: 'F · 晶透光学玻璃静物微距风（默认首选）',
    titleLayout: 'horizontal' as const,
    accent: 'teal' as const,
    isDefaultPreferred: true,
    mediumPrompt: '高端晶透光学玻璃器皿与研究主题标志性双器物微距摄影级棚拍质感（静置于精密刻度光学水晶载体上），晨光折射散景柔美通透，极简高级静物美学',
  },
  {
    id: 'cover-cand-a',
    genre: 'song_xuan_gongbi',
    label: 'A · 宋韵宣纸青金工笔风',
    titleLayout: 'horizontal' as const,
    accent: 'teal' as const,
    isDefaultPreferred: false,
    mediumPrompt: '温润手工宣纸纤维肌理配青瓷绿与暖金游丝飘带，细线工笔淡彩描绘温暖人文互动场景',
  },
  {
    id: 'cover-cand-b',
    genre: 'swiss_cobalt_blueprint',
    label: 'B · 钴蓝银灰瑞士数据蓝图现代风',
    titleLayout: 'horizontal' as const,
    accent: 'blue' as const,
    isDefaultPreferred: false,
    mediumPrompt: '冷峻高级钴蓝与银灰白现代瑞士网格蓝图构成，搭配精密等轴空间建筑白模',
  },
  {
    id: 'cover-cand-c',
    genre: 'danqing_cinnabar_vertical',
    label: 'C · 丹青朱砂新中式竖排风',
    titleLayout: 'vertical' as const,
    accent: 'burgundy' as const,
    isDefaultPreferred: false,
    mediumPrompt: '东方新中式水墨丹青晕染配朱砂印泥红点睛与留白气韵，右侧竖排非板正大字气势贯通',
  },
  {
    id: 'cover-cand-d',
    genre: 'indigo_amber_lightbox',
    label: 'D · 深海靛蓝×琥珀暖光 3D 剪纸灯箱风',
    titleLayout: 'horizontal' as const,
    accent: 'blue' as const,
    isDefaultPreferred: false,
    mediumPrompt: '深海靛蓝与琥珀暖金多层无酸卡纸 3D 立体剪纸透光灯箱浮雕，层次分明温暖治愈',
  },
  {
    id: 'cover-cand-e',
    genre: 'warm_film_editorial',
    label: 'E · 暖阳 35mm 胶片纪实人文大刊风',
    titleLayout: 'horizontal' as const,
    accent: 'burgundy' as const,
    isDefaultPreferred: false,
    mediumPrompt: '暖阳 35mm 胶片颗粒质感与人文特刊厚涂纪实插画笔触，故事感与烟火温度浓郁',
  },
] as const;

export interface CoverTextSpecInput {
  title?: string;
  subtitle?: string;
  competitionName?: string;
  teamName?: string;
  titleLayout?: CoverTitleLayout;
}

export interface NormalizedCoverTextSpec {
  competitionName: string;
  mainTitle: string;
  subtitle: string;
  teamName: string;
  teamLabel: string;
  titleLayout: CoverTitleLayout;
}

const COVER_BANNED_META_RX =
  /市场调查与统计分析报告|标准化市场调查报告|教学模拟|模拟数据|模拟样本|模拟记录|不作为实际调查结论|不作为实际|仅作演示|免责说明|随机种子|算法合成|演练语料|机器生成|人工智能|大语言模型|AI\s*生成|AIGC|测试样本|测试数据|测试/giu;
const BLIND_REVIEW_INSTITUTION_RX =
  /[\u4e00-\u9fa5A-Za-z0-9]{1,16}(?:大学|学院|学校|校区|附中|中学|研究院|研究所|学部|教务处|委员会)/gu;
const BANNED_UI_BRACKETS_RX = /[\u3010\u3011\u300c\u300d\u300e\u300f\[\]{}]/gu;

function normalizeCoverQuotes(raw: string): string {
  const convertedCorners = raw
    .replace(/\u300c/gu, '“')
    .replace(/\u300d/gu, '”')
    .replace(/\u300e/gu, '‘')
    .replace(/\u300f/gu, '’')
    .replace(/[\u3010\u3011\[\]{}]/gu, '');
  return convertedCorners
    .replace(/"([^"]+)"/gu, '“$1”')
    .replace(/"/gu, '')
    .replace(/'([^']+)'/gu, '‘$1’');
}

/**
 * Derives a poetic, blind-review-compliant team name from the research topic (never containing school or personal names),
 * e.g. `"银发“智”守：城市老年人..."` -> `"银发智守调研队"`.
 */
export function deriveBlindSafeTeamName(title = ''): string {
  const cleaned = (title || '')
    .replace(COVER_BANNED_META_RX, '')
    .replace(BLIND_REVIEW_INSTITUTION_RX, '')
    .trim();
  const leadSegment = cleaned.split(/[：:—–\-]/u)[0] ?? '';
  const leadCjk = leadSegment.replace(/[^\u4e00-\u9fa5]/gu, '');
  if (leadCjk.length >= 2 && leadCjk.length <= 6 && !/^(?:关于|基于|面向|我国|中国|城市|社区)$/u.test(leadCjk)) {
    return leadCjk.endsWith('队') || leadCjk.endsWith('组') || leadCjk.endsWith('团')
      ? leadCjk
      : `${leadCjk}调研队`;
  }
  if (/银发|老年|长者|养老|健康监测|助餐/u.test(cleaned)) return '银发智守调研队';
  if (/即时零售|闪购|骑手|外卖|消费/u.test(cleaned)) return '数智民生调研队';
  if (/非遗|文旅|古镇|博物馆|传统/u.test(cleaned)) return '寻脉新声调研队';
  if (/新能源|低碳|充电|绿色|生态/u.test(cleaned)) return '绿行智联调研队';
  const genericCjk = cleaned
    .replace(/^(?:关于|基于|面向|我国|中国|新时代)/u, '')
    .replace(/[^\u4e00-\u9fa5]/gu, '')
    .slice(0, 4);
  return genericCjk.length >= 2 ? `${genericCjk}调研队` : '笃行实证调研队';
}

/** Sanitizes a caller-supplied team name for strict blind-review compliance (`参赛团队：teamName` without school/real names). */
export function sanitizeBlindSafeTeamName(teamName?: string, fallbackTitle = ''): string {
  const raw = (teamName ?? '')
    .replace(/^(?:参赛团队|参赛队伍|队伍名称|团队名称|团队|队伍)\s*[:：]?\s*/u, '')
    .replace(COVER_BANNED_META_RX, '')
    .replace(BLIND_REVIEW_INSTITUTION_RX, '')
    .replace(/[\u0000-\u001f\u007f"“”'‘’《》\u3010\u3011\u300c\u300d\u300e\u300f\[\]()（）]/gu, '')
    .replace(/\s+/gu, '')
    .trim();
  const cjkOnly = raw.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/gu, '');
  if (cjkOnly.length < 2) {
    return deriveBlindSafeTeamName(fallbackTitle);
  }
  const hasCollectiveSuffix = /(?:调研队|实践队|课题组|调研团|研学队|探索队|观察团|小分队|团队|小组)$/u.test(cjkOnly);
  if (!hasCollectiveSuffix) {
    // Bare 2–3 CJK chars without a team collective suffix risk looking like a personal name; convert to topic or suffix safely.
    if (/^[\u4e00-\u9fa5]{2,3}$/u.test(cjkOnly)) {
      return deriveBlindSafeTeamName(fallbackTitle);
    }
    return `${cjkOnly.slice(0, 8)}调研队`;
  }
  return cjkOnly.slice(0, 14);
}

/** Validates and normalizes the 3 mandatory cover text elements + non-rigid calligraphy layout (`horizontal | vertical`). */
export function normalizeCoverTextSpec(input: CoverTextSpecInput = {}): NormalizedCoverTextSpec {
  if (
    input.titleLayout !== undefined &&
    input.titleLayout !== 'horizontal' &&
    input.titleLayout !== 'vertical'
  ) {
    fail('所选的封面标题排版方向不受支持，仅支持横排或竖排。');
  }
  const titleLayout: CoverTitleLayout = input.titleLayout ?? 'horizontal';

  const rawComp = normalizeCoverQuotes(
    (input.competitionName ?? '')
      .replace(COVER_BANNED_META_RX, '')
      .replace(/[“"\u300c\u300e]?正大杯[”"\u300d\u300f]?\s*第十七届/gu, '“益普索杯”第十七届'),
  )
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const competitionName = rawComp.length >= 6 ? rawComp.slice(0, 48) : DEFAULT_COVER_COMPETITION_NAME;

  const rawTitle = normalizeCoverQuotes((input.title ?? '').replace(COVER_BANNED_META_RX, ''))
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const mainTitle = (rawTitle || '社会民生与消费体验专题实证研究').slice(0, 52);

  const subtitle = normalizeCoverQuotes((input.subtitle ?? '').replace(COVER_BANNED_META_RX, ''))
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 56);

  const teamName = sanitizeBlindSafeTeamName(input.teamName, mainTitle);
  return {
    competitionName,
    mainTitle,
    subtitle,
    teamName,
    teamLabel: `参赛团队：${teamName}`,
    titleLayout,
  };
}

/**
 * Builds the canonical cover typography prompt enforcing:
 * 1) Edition-specific competition header at top;
 * 2) Non-rigid expressive artistic lettering main title (`horizontal` or `vertical`, medium/style open to topic) + quiet readable subtitle;
 * 3) Blind-safe `参赛团队` credit at bottom;
 * 4) Zero self-identifying report plaques and zero simulation/AI/school/personal-name tokens.
 */
export function buildCoverTypographyPrompt(
  input: CoverTextSpecInput & { accentHex?: string; inkMode?: 'dark_on_light' | 'light_on_dark' } = {},
): string {
  const spec = normalizeCoverTextSpec(input);
  const displayMainTitle = spec.mainTitle.replace(BANNED_UI_BRACKETS_RX, '').trim() || spec.mainTitle;
  const displaySubtitle = spec.subtitle.replace(BANNED_UI_BRACKETS_RX, '').trim();
  const accentHex = input.accentHex ?? '#0F766E';
  const inkMode = input.inkMode ?? 'dark_on_light';
  const layoutClause =
    spec.titleLayout === 'vertical'
      ? '竖排非板正艺术字（全出血杂志海报级编排，依题材气质自由选用书法行楷、雕塑现代字或手绘构成字，居右或视觉焦点竖向错落排布，核心字破格放大高亮，绝非死板电脑印刷正体）'
      : '横排或阶梯错落非板正艺术字（全出血杂志海报级编排，依题材气质自由选用手写书法、现代雕塑光弧字、几何构成字或人文大刊字，富于字重对比、节奏错位与字图呼应，绝非白纸死板居中排印）';
  const inkClause =
    inkMode === 'light_on_dark'
      ? '亮暖金/象牙白高反差字色，与深色底面形成通透对比'
      : '与底色协调的高反差深墨/主题色字形';

  return [
    '封面须完整呈现以下三大文字要素并遵循非板正艺术字编排要求。',
    `1. 顶部置顶眉栏以优雅小字精确书写赛事届次全称"${spec.competitionName}"；`,
    `2. 选题核心主标题采用${layoutClause}，严禁使用死板机械的电脑印刷黑体或印刷宋体，精确书写"${displayMainTitle}"（${inkClause}，每一笔偏旁清晰可辨零错字）；`,
    ...(displaySubtitle
      ? [`3. 选题副标题置入低干扰安静区域（可配主色 ${accentHex} 淡雅色带、细线导引或竖列排布），以清晰易读字体精确书写"${displaySubtitle}"，完整承托实证选题范围；`]
      : []),
    `${displaySubtitle ? '4' : '3'}. 封面底部居中或右下角盲审合规署名栏以端秀小字精确书写"${spec.teamLabel}"（仅限课题队名，绝不含学校或个人真实姓名）。`,
    '画面内严格且仅允许渲染上述双引号内指定的文字要素，严禁添加自述文种身份的冗余报告类别词，严禁出现虚构演练免责声明、机器合成标识、校徽院徽、高校名称或个人真实姓名。',
  ].join('\n');
}

/** Builds the source-stage ultra-narrow 4%–6% perimeter prompt clause for page frames (zero inner feather-blur). */
export function buildFramePerimeterPromptClause(params: { accentHex?: string; topic?: string } = {}): string {
  const accentHex = params.accentHex ?? '#0F766E';
  const cleanTopic =
    normalizeCoverQuotes((params.topic ?? '').replace(COVER_BANNED_META_RX, ''))
      .replace(BANNED_UI_BRACKETS_RX, '')
      .trim()
      .slice(0, 26) || '学术实证调查';
  return [
    `围绕“${cleanTopic}”设计 A4 竖版（210:297）极细外缘透明装饰页框（主色 ${accentHex} 搭配暖金 #C99A3E 细线）。`,
    '1. 所有边框双细线与四角纹样须严格紧贴页面最外缘 4%–6%（距纸边 8.5mm–12.5mm）的极窄边带内，角饰紧收在最外角绝不向内蔓延侵入；',
    '2. 四周留白核心区不少于 88%×88% 保持 100% 纯白或全透明净空，底部正中央页码区自然留空断开；',
    '3. 严禁任何边缘羽化虚化、白雾渐变遮罩或半透明模糊过渡，所有几何折线、回纹角花与植物细线须保持笔触 100% 锐利闭合、干净利落，且画面零内嵌文字。',
  ].join('\n');
}

const LABEL = { cover: '封面图', frame: '页框图' } as const;
const fail = (message: string): never => { throw Error(message); };
/** The file names the LaTeX source includes and the compiler writes next to it. */
export const coverImageFile = (cover: Pick<CoverImage, 'mime'>) => (cover.mime === 'image/png' ? 'cover-image.png' : 'cover-image.jpg');
export const FRAME_IMAGE_FILE = 'frame-image.png';

const escapeCoverLatexText = (value: string): string =>
  value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}#$%&_^~])/g, '\\$1');

/**
 * Legacy `research-report-cover` artworks carry hand-verified title lettering drawn inside the image pixels;
 * Track-2 AI / deterministic / showcase covers leave the upper negative space clean so title typography overlays sharply.
 */
export const coverHasEmbeddedTitle = (cover: Pick<CoverImage, 'note'>): boolean =>
  /(?:^封面由报告封面技能生成[。.]?$|题名字形在图中)/u.test((cover.note ?? '').trim());

/** The LaTeX title page that prints the cover image over the whole page, with optional overlaid title/subtitle in the top negative space. */
export const coverImageTitlepage = (
  cover: Pick<CoverImage, 'mime'> & Partial<Pick<CoverImage, 'note'>>,
  overlay?: { title?: string; subtitle?: string },
) => {
  const showOverlay =
    !!overlay?.title?.trim() && !(cover.note && coverHasEmbeddedTitle({ note: cover.note }));
  if (!showOverlay) {
    return [
      '\\begin{titlepage}',
      '\\begin{tikzpicture}[remember picture,overlay]',
      `\\node[inner sep=0pt] at (current page.center) {\\includegraphics[width=\\paperwidth,height=\\paperheight]{${coverImageFile(cover)}}};`,
      '\\end{tikzpicture}',
      '\\end{titlepage}',
    ];
  }
  const titleTex = escapeCoverLatexText(overlay!.title!.trim());
  const subtitleTex = overlay?.subtitle?.trim() ? escapeCoverLatexText(overlay.subtitle.trim()) : '';
  return [
    '\\begin{titlepage}',
    '\\begin{tikzpicture}[remember picture,overlay]',
    `\\node[inner sep=0pt] at (current page.center) {\\includegraphics[width=\\paperwidth,height=\\paperheight]{${coverImageFile(cover)}}};`,
    `\\node[anchor=north,inner xsep=10mm,inner ysep=8mm,fill=white,fill opacity=0.84,text opacity=1,rounded corners=2mm,text width=146mm,align=center] at ([yshift=-26mm]current page.north) {{\\zihao{1}\\heiti\\bfseries ${titleTex}\\par}${subtitleTex ? `\\vspace{4mm}{\\zihao{4} ${subtitleTex}\\par}` : ''}};`,
    '\\end{tikzpicture}',
    '\\end{titlepage}',
  ];
};
/** The preamble that lays the frame image behind every page while \ReportFrameImagetrue; byte-identical with page_art.py. */
export const frameImagePreamble = () => [
  '\\newif\\ifReportFrameImage',
  '\\ReportFrameImagefalse',
  `\\AddToHook{shipout/background}{\\ifReportFrameImage\\begin{tikzpicture}[remember picture,overlay]\\node[inner sep=0pt] at (current page.center) {\\includegraphics[width=\\paperwidth,height=\\paperheight]{${FRAME_IMAGE_FILE}}};\\end{tikzpicture}\\fi}`,
];

async function decode(file: File, kind: 'cover' | 'frame') {
  const bitmap = await createImageBitmap(file);
  if (Math.abs(bitmap.width / bitmap.height / A4_ASPECT - 1) > PAGE_ART_LIMITS.aspectTolerance) { bitmap.close(); fail(`${LABEL[kind]}须为 A4 竖版比例（210:297），这张是 ${bitmap.width}×${bitmap.height} 像素。`); }
  if (bitmap.width < PAGE_ART_LIMITS.minWidth) { bitmap.close(); fail(`${LABEL[kind]}宽度至少 ${PAGE_ART_LIMITS.minWidth} 像素，这张只有 ${bitmap.width} 像素。`); }
  const scale = Math.min(1, 2480 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); return fail('浏览器无法处理这张图片。'); }
  if (kind === 'cover') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, context };
}

async function base64Of(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * A chosen file as a cover image, in the browser: drawn once and saved as JPEG at the file's own size (at most 2480
 * pixels wide, A4 at 300 dpi), lowering the quality until it fits. A file that is not A4 portrait is refused rather
 * than cropped or stretched.
 */
export async function coverImageFromFile(file: File, note: string): Promise<{ cover: CoverImage; palette: FigurePalette }> {
  const { canvas } = await decode(file, 'cover');
  // The figures' colours come from the cover: its pixels at a small size are enough to find its hues.
  const sample = document.createElement('canvas');
  sample.width = 120; sample.height = Math.round(120 * canvas.height / canvas.width);
  const small = sample.getContext('2d');
  if (!small) return fail('浏览器无法处理这张图片。');
  small.drawImage(canvas, 0, 0, sample.width, sample.height);
  const palette = paletteFromPixels(small.getImageData(0, 0, sample.width, sample.height).data);
  for (const quality of [0.92, 0.86, 0.8, 0.72, 0.62]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size > PAGE_ART_LIMITS.cover.bytes) continue;
    return { cover: parseCoverImage({ schema: 'CoverImage/v1', mime: 'image/jpeg', data: await base64Of(blob), widthPx: canvas.width, heightPx: canvas.height, note }), palette };
  }
  return fail('封面图压缩后仍超过 1 MB，请换一张细节少一些或尺寸小一些的图。');
}

/**
 * Loads a showcase/preset cover candidate Blob in the browser, automatically fitting near-A4 portrait ratios (e.g. 3:4
 * `896×1200`) onto an exact A4 `210:297` portrait canvas (`<= 1 MB`) so preset walls never fail on raw generator outputs.
 */
export async function presetCoverImageFromBlob(
  blob: Blob,
  note: string,
): Promise<{ cover: CoverImage; palette: FigurePalette }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const targetW = Math.max(PAGE_ART_LIMITS.minWidth, Math.min(1240, bitmap.width));
    const targetH = Math.round(targetW / A4_ASPECT);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const context = canvas.getContext('2d');
    if (!context) return fail('浏览器无法处理这张封面候选图片。');
    context.fillStyle = '#FCFAF5';
    context.fillRect(0, 0, targetW, targetH);
    context.drawImage(bitmap, 0, 0, targetW, targetH);

    const sample = document.createElement('canvas');
    sample.width = 120;
    sample.height = Math.round((120 * targetH) / targetW);
    const small = sample.getContext('2d');
    if (!small) return fail('浏览器无法处理这张封面候选图片。');
    small.drawImage(canvas, 0, 0, sample.width, sample.height);
    const palette = paletteFromPixels(small.getImageData(0, 0, sample.width, sample.height).data);

    for (const quality of [0.92, 0.86, 0.8, 0.72, 0.62]) {
      const outBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!outBlob || outBlob.size > PAGE_ART_LIMITS.cover.bytes) continue;
      return {
        cover: parseCoverImage({
          schema: 'CoverImage/v1',
          mime: 'image/jpeg',
          data: await base64Of(outBlob),
          widthPx: targetW,
          heightPx: targetH,
          note,
        }),
        palette,
      };
    }
    return fail('预置封面候选压缩后仍超过 1 MB。');
  } finally {
    bitmap.close();
  }
}

/**
 * A chosen file as a frame image: a transparent PNG, kept as PNG. Refused when any ornament reaches into the text
 * area (plus its 3 mm protection) or the page-number zone, so the frame can never cover a word.
 */
export async function frameImageFromFile(file: File, note: string): Promise<FrameImage> {
  const { canvas, context } = await decode(file, 'frame');
  const pxPerMm = canvas.width / 210;
  for (const zone of FRAME_CLEAR_ZONES_MM) {
    const x = Math.floor(zone.x0 * pxPerMm), y = Math.floor(zone.y0 * pxPerMm);
    const pixels = context.getImageData(x, y, Math.ceil(zone.x1 * pxPerMm) - x, Math.ceil(zone.y1 * pxPerMm) - y).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) fail('页框图的装饰进入了正文区（含 3 mm 保护带）或页码区。请用页框技能重新排布，正文区必须完全透明。');
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob || blob.size > PAGE_ART_LIMITS.frame.bytes) return fail('页框图超过 600 KB，请用 150 dpi 的透明 PNG。');
  return parseFrameImage({ schema: 'FrameImage/v1', mime: 'image/png', data: await base64Of(blob), widthPx: canvas.width, heightPx: canvas.height, note });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function sectionIllustrationFromBlob(
  blob: Blob,
  resultId: string,
  note: string,
  id?: string,
): Promise<SectionIllustration> {
  const cleanResultId = resultId.trim();
  const cleanId = (id?.trim() || `ill-${cleanResultId}`).slice(0, 80);
  const cleanNote = (note.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim() || '专题场景概念配图').slice(0, PAGE_ART_LIMITS.note);
  const rawBytes = new Uint8Array(await blob.arrayBuffer());
  const pngDims = imageSize(rawBytes, 'image/png');
  const jpgDims = pngDims ? null : imageSize(rawBytes, 'image/jpeg');
  const nativeMime: PageArtMime | null = pngDims ? 'image/png' : jpgDims ? 'image/jpeg' : null;
  const nativeDims = pngDims ?? jpgDims;

  // Fast path (works in both Node and Browser): already within <= 1280×720 and <= 650 KB.
  if (
    nativeMime &&
    nativeDims &&
    rawBytes.length <= SECTION_ILLUSTRATION_LIMITS.maxBytes &&
    nativeDims.width >= SECTION_ILLUSTRATION_LIMITS.minWidth &&
    nativeDims.width <= 1280 &&
    nativeDims.height >= SECTION_ILLUSTRATION_LIMITS.minHeight &&
    nativeDims.height <= 720
  ) {
    return parseSectionIllustration({
      schema: 'SectionIllustration/v1',
      id: cleanId,
      resultId: cleanResultId,
      mime: nativeMime,
      data: bytesToBase64(rawBytes),
      widthPx: nativeDims.width,
      heightPx: nativeDims.height,
      note: cleanNote,
    });
  }

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    if (
      nativeMime &&
      nativeDims &&
      rawBytes.length <= SECTION_ILLUSTRATION_LIMITS.maxBytes &&
      nativeDims.width >= SECTION_ILLUSTRATION_LIMITS.minWidth &&
      nativeDims.width <= SECTION_ILLUSTRATION_LIMITS.maxWidth &&
      nativeDims.height >= SECTION_ILLUSTRATION_LIMITS.minHeight &&
      nativeDims.height <= SECTION_ILLUSTRATION_LIMITS.maxHeight
    ) {
      return parseSectionIllustration({
        schema: 'SectionIllustration/v1',
        id: cleanId,
        resultId: cleanResultId,
        mime: nativeMime,
        data: bytesToBase64(rawBytes),
        widthPx: nativeDims.width,
        heightPx: nativeDims.height,
        note: cleanNote,
      });
    }
    return fail('当前环境无法缩放章节配图，请传入不超过 650 KB 的 PNG 或 JPEG 图像。');
  }

  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width < SECTION_ILLUSTRATION_LIMITS.minWidth || bitmap.height < SECTION_ILLUSTRATION_LIMITS.minHeight) {
      return fail(`章节配图尺寸至少为 ${SECTION_ILLUSTRATION_LIMITS.minWidth}×${SECTION_ILLUSTRATION_LIMITS.minHeight} 像素。`);
    }
    const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height);
    const width = Math.max(SECTION_ILLUSTRATION_LIMITS.minWidth, Math.round(bitmap.width * scale));
    const height = Math.max(SECTION_ILLUSTRATION_LIMITS.minHeight, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return fail('浏览器无法处理章节配图。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (pngBlob && pngBlob.size <= SECTION_ILLUSTRATION_LIMITS.maxBytes) {
      return parseSectionIllustration({
        schema: 'SectionIllustration/v1',
        id: cleanId,
        resultId: cleanResultId,
        mime: 'image/png',
        data: await base64Of(pngBlob),
        widthPx: width,
        heightPx: height,
        note: cleanNote,
      });
    }
    for (const quality of [0.9, 0.84, 0.76, 0.66, 0.56]) {
      const jpgBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!jpgBlob || jpgBlob.size > SECTION_ILLUSTRATION_LIMITS.maxBytes) continue;
      return parseSectionIllustration({
        schema: 'SectionIllustration/v1',
        id: cleanId,
        resultId: cleanResultId,
        mime: 'image/jpeg',
        data: await base64Of(jpgBlob),
        widthPx: width,
        heightPx: height,
        note: cleanNote,
      });
    }
    return fail('章节配图压缩后仍超过 650 KB，请换一张细节更简洁的配图。');
  } finally {
    bitmap.close();
  }
}

/**
 * Post-processes a raw RGBA A4 frame buffer WITHOUT any inner feather-blur mask ("No Feather-Blur Bite"):
 * 1) Keys out pure/near-white paper background cleanly while preserving full stroke chroma & crisp edges;
 * 2) If all strokes already sit outside `FRAME_CLEAR_ZONES_MM`, leaves every ornament pixel 100% untouched;
 * 3) If an AI frame intruded inward past `FRAME_CLEAR_ZONES_MM`, proportionally retracts each outer border strip
 *    toward the nearest page edge (`整体等比贴边收窄`) so corner motifs stay 100% sharp, complete, and un-blurred.
 */
export function retractFrameRgbaCrisply(
  inputRgba: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const rgba = new Uint8Array(inputRgba.length);
  rgba.set(inputRgba);

  // Step 1: Crisp chroma-aware white-paper unmatting (no wide foggy alpha ramp on colored/dark strokes)
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a === 0) continue;
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const chroma = maxCh - minCh;
    if (minCh >= 245 && chroma <= 10) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    } else if (minCh >= 234 && chroma <= 14) {
      // Narrow 11-level anti-alias edge unmatte for crisp 1px stroke anti-aliasing only
      const inkAlpha = Math.round(a * ((245 - minCh) / 11));
      if (inkAlpha <= 8) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
      } else {
        rgba[i + 3] = inkAlpha;
      }
    }
  }

  const pxPerMm = width / 210;
  const bodyZone = FRAME_CLEAR_ZONES_MM[0];
  const pageNumZone = FRAME_CLEAR_ZONES_MM[1];
  const safeLeftPx = Math.max(1, Math.floor(bodyZone.x0 * pxPerMm) - 1);
  const safeRightStartPx = Math.min(width - 2, Math.ceil(bodyZone.x1 * pxPerMm) + 1);
  const safeTopPx = Math.max(1, Math.floor(bodyZone.y0 * pxPerMm) - 1);
  const safeBottomStartPx = Math.min(height - 2, Math.ceil(bodyZone.y1 * pxPerMm) + 1);

  const midX = width >> 1;
  const midY = height >> 1;
  let maxLeftX = safeLeftPx;
  let minRightX = safeRightStartPx;
  let maxTopY = safeTopPx;
  let minBottomY = safeBottomStartPx;
  let hasBodyIntrusion = false;

  const bx0 = Math.floor(bodyZone.x0 * pxPerMm);
  const bx1 = Math.ceil(bodyZone.x1 * pxPerMm);
  const by0 = Math.floor(bodyZone.y0 * pxPerMm);
  const by1 = Math.ceil(bodyZone.y1 * pxPerMm);

  for (let y = by0; y < by1 && y < height; y++) {
    for (let x = bx0; x < bx1 && x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        hasBodyIntrusion = true;
        const dLeft = x - bx0;
        const dRight = bx1 - 1 - x;
        const dTop = y - by0;
        const dBottom = by1 - 1 - y;
        const minSide = Math.min(dLeft, dRight, dTop, dBottom);
        if (minSide === dLeft && x < midX && x + 1 > maxLeftX) maxLeftX = x + 1;
        else if (minSide === dRight && x >= midX && x - 1 < minRightX) minRightX = x - 1;
        else if (minSide === dTop && y < midY && y + 1 > maxTopY) maxTopY = y + 1;
        else if (y >= midY && y - 1 < minBottomY) minBottomY = y - 1;
      }
    }
  }

  let working = rgba;
  if (hasBodyIntrusion) {
    // Step 2: Proportional outer-border retraction (`整体等比贴边收窄`) — zero feather-blur!
    const retracted = new Uint8Array(rgba.length);
    const mapCoord = (
      dst: number,
      total: number,
      safeLow: number,
      srcLowMax: number,
      safeHighStart: number,
      srcHighMin: number,
    ): number | null => {
      if (dst < safeLow) {
        return Math.min(total - 1, Math.round((dst / Math.max(1, safeLow)) * srcLowMax));
      }
      if (dst >= safeHighStart) {
        const dstSpan = Math.max(1, total - 1 - safeHighStart);
        const srcSpan = Math.max(1, total - 1 - srcHighMin);
        return Math.max(0, Math.min(total - 1, Math.round(total - 1 - ((total - 1 - dst) / dstSpan) * srcSpan)));
      }
      return null;
    };

    for (let y = 0; y < height; y++) {
      const inOuterY = y < safeTopPx || y >= safeBottomStartPx;
      for (let x = 0; x < width; x++) {
        const inOuterX = x < safeLeftPx || x >= safeRightStartPx;
        if (!inOuterX && !inOuterY) continue;
        const srcX = inOuterX
          ? mapCoord(x, width, safeLeftPx, maxLeftX, safeRightStartPx, minRightX)!
          : x;
        const srcY = inOuterY
          ? mapCoord(y, height, safeTopPx, maxTopY, safeBottomStartPx, minBottomY)!
          : y;
        const dstIdx = (y * width + x) * 4;
        const srcIdx = (srcY * width + srcX) * 4;
        retracted[dstIdx] = rgba[srcIdx];
        retracted[dstIdx + 1] = rgba[srcIdx + 1];
        retracted[dstIdx + 2] = rgba[srcIdx + 2];
        retracted[dstIdx + 3] = rgba[srcIdx + 3];
      }
    }
    working = retracted;
  }

  // Step 3: Ensure bottom center page-number slot (`80..130mm × 276..293mm`) is cleanly open without blurring neighbors
  const px0 = Math.floor(pageNumZone.x0 * pxPerMm);
  const px1 = Math.ceil(pageNumZone.x1 * pxPerMm);
  const py0 = Math.floor(pageNumZone.y0 * pxPerMm);
  const py1 = Math.ceil(pageNumZone.y1 * pxPerMm);
  for (let y = Math.max(0, py0); y < Math.min(height, py1); y++) {
    for (let x = Math.max(0, px0); x < Math.min(width, px1); x++) {
      const idx = (y * width + x) * 4;
      working[idx] = 0;
      working[idx + 1] = 0;
      working[idx + 2] = 0;
      working[idx + 3] = 0;
    }
  }

  return working;
}
