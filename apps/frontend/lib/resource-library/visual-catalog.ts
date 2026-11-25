/**
 * Curated Visual Design, Cover, Backdrop, Frame, Track-2 Example Plate & Academic Palette Board Catalog
 * for EVI-X Resource Library (121 items across 6 visual branches).
 *
 * - All raster `assetUrl` entries map 1-to-1 to verified files under `apps/frontend/public/`.
 * - All 44 `palette_board` items carry strict `FigurePalette/v1` definitions (uppercase HEX) and render
 *   publication-grade `360x228` pure-vector journal specimen sheets passing `assertTrueVector`.
 * - 52 pure-vector `bentoArchetype` infographic plates dynamically inherit `FigureInk` and export 1:1
 *   across Browser Preview, Word `.docx`, PPT `.pptx`, and XeLaTeX PDF.
 * - Uses explicit `.ts` relative imports so Node `--experimental-strip-types --test` imports directly.
 */
import type { FigureInk, FigurePalette } from '../figure-palette.ts';
import type { ReportInsert } from '../report-insert.ts';
import { digestText, parseResultSnapshot, resultPayload } from '../research-quality.ts';
import { assertTrueVector } from '../svg-safety.ts';
import { assertTrueVector as assertStrictOfficeVector } from '../vector-svg.ts';
import {
  BENTO_PLATE_META,
  renderBentoInfographicSvg,
  type BentoInfographicArchetype,
} from './bento-infographic-renderer.ts';
import { deriveInkPalette } from './chart-example-renderer.ts';

export type VisualBranchFilterId =
  | 'all'
  | 'v3_cover'
  | 'mode1_cover'
  | 'backdrop'
  | 'frame'
  | 'infographic'
  | 'palette_board';

export type VisualAssetKind = Exclude<VisualBranchFilterId, 'all'>;
export type VisualAccentId = 'teal' | 'blue' | 'burgundy';

export const VISUAL_FILTER_LABELS: ReadonlyArray<{ id: VisualBranchFilterId; label: string }> = [
  { id: 'all', label: '全部装帧与视觉' },
  { id: 'v3_cover', label: '艺术创意封面' },
  { id: 'mode1_cover', label: '图文一体封面' },
  { id: 'backdrop', label: '无字纯画底图' },
  { id: 'frame', label: '透明 A4 学术页框' },
  { id: 'infographic', label: '概念与画像例图' },
  { id: 'palette_board', label: '学科语义配色样板' },
];

export interface PaletteBoardSpecimen {
  disciplineTag: string;
  journalRef: string;
  paperHex: string;
  inkHex: string;
  mutedHex: string;
  tintHex: string;
  ruleHex: string;
  typographyScale: string;
  chartBars: readonly [number, number, number, number, number];
  chartLine: readonly [number, number, number, number, number];
  tableHeaders: readonly [string, string, string];
  tableRows: readonly [readonly [string, string, string], readonly [string, string, string]];
  tableNote: string;
}

export interface VisualCatalogItem {
  id: string;
  kind: VisualAssetKind;
  label: string;
  badge: string;
  subnote: string;
  aspect: '3:4' | '16:9' | 'specimen';
  accent: VisualAccentId;
  assetUrl?: string;
  palette?: FigurePalette;
  boardSpec?: PaletteBoardSpecimen;
  bentoArchetype?: BentoInfographicArchetype;
  targetNode?: string;
  whenToUse: string;
  keywords: readonly string[];
}

export const VISUAL_CATALOG: readonly VisualCatalogItem[] = [
  // ───────── 1. V3 Open Art-Direction Covers (4 verified PNGs) ─────────
  {
    id: 'v3-woodblock',
    kind: 'v3_cover',
    label: '版画叠印 · 三层社区时空',
    badge: '艺术封面样板',
    subnote: '木刻版画×柔印渐变 + 顶部松烟阅读口袋 + 银杏社区三景深纹理',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/cover-v3-1.png',
    palette: { schema: 'FigurePalette/v1', primary: '#1E5B53', secondary: '#C99A3E', opposite: '#C05621', source: 'cover' },
    whenToUse: '适合银发养老、基层民生、社区服务与人文温度突出的长周期社会调查报告封面。',
    keywords: ['艺术封面', '木刻版画', '银发', '社区', '三景深', '封面'],
  },
  {
    id: 'v3-risograph',
    kind: 'v3_cover',
    label: '孔版双色 · 几何城市剖面',
    badge: '艺术封面样板',
    subnote: '孔版双色网点 + 阳台建筑结构层叠 + 现代无衬线标题留白区',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/cover-v3-2.png',
    palette: { schema: 'FigurePalette/v1', primary: '#234E80', secondary: '#E09F3E', opposite: '#D15B38', source: 'cover' },
    whenToUse: '适合城市更新、智能设备采纳、数字治理及兼具几何节奏感的实证调研作品。',
    keywords: ['艺术封面', '孔版', 'Risograph', '城市', '现代无衬线', '封面'],
  },
  {
    id: 'v3-nocturne',
    kind: 'v3_cover',
    label: '夜航微光 · 胶片景深叙事',
    badge: '艺术封面样板',
    subnote: '深青夜幕微光城市 + 暗底浅金高对比阅读区 + 35mm 电影景深',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/cover-v3-3.png',
    palette: { schema: 'FigurePalette/v1', primary: '#163A5F', secondary: '#D4A857', opposite: '#2A9D8F', source: 'cover' },
    whenToUse: '适合夜间经济、居家照护、即时消费或强调情感守护叙事的深色调封面方案。',
    keywords: ['艺术封面', '夜航', '胶片', '暗底', '电影感', '封面'],
  },
  {
    id: 'v3-collage',
    kind: 'v3_cover',
    label: '博物手账 · 铜版拼贴风物',
    badge: '艺术封面样板',
    subnote: '铜版线稿×水彩切片×怀表玉镯器物拼贴 + 右侧竖排题名节奏',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/cover-v3-4.png',
    palette: { schema: 'FigurePalette/v1', primary: '#1B5E4E', secondary: '#C49A45', opposite: '#8A3449', source: 'cover' },
    whenToUse: '适合非遗文旅、传统消费变迁、多代际记忆与工艺调研等博物志风格报告。',
    keywords: ['艺术封面', '博物志', '拼贴', '铜版', '竖排', '封面'],
  },

  // ───────── 2. Mode 1 Illustrated Covers (7 verified PNGs) ─────────
  {
    id: 'cover-cand-f',
    kind: 'mode1_cover',
    label: '★ 首选 F · 晶透光学玻璃静物微距风',
    badge: '主题封面样板',
    subnote: '光学玻璃主题器物微距 + 雕塑环轨非板正大字 + 益普索杯赛事全称',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/cover-cand-f.png',
    palette: { schema: 'FigurePalette/v1', primary: '#0F766E', secondary: '#C99A3E', opposite: '#A65A3A', source: 'cover' },
    whenToUse: '全学科默认首选国一封面范式，通透克制的棚拍静物质感彻底摆脱卡通同质化。',
    keywords: ['首选', '光学玻璃', '静物微距', '益普索杯', '封面'],
  },
  {
    id: 'cover-cand-a',
    kind: 'mode1_cover',
    label: 'A · 宋韵宣纸青金工笔风',
    badge: '主题封面样板',
    subnote: '宣纸青金丝带 + 非板正横排行楷大字 + 益普索杯赛事全称',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/cover-cand-a.png',
    palette: { schema: 'FigurePalette/v1', primary: '#0F766E', secondary: '#C99A3E', opposite: '#9C4221', source: 'cover' },
    whenToUse: '适合温情民生、乡村振兴、非遗茶旅、医疗助餐等兼具宋韵清雅书卷气的课题。',
    keywords: ['宋韵', '宣纸', '青金', '行楷', '封面'],
  },
  {
    id: 'cover-cand-b',
    kind: 'mode1_cover',
    label: 'B · 钴蓝银灰瑞士数据蓝图现代风',
    badge: '主题封面样板',
    subnote: '钴蓝银灰精密瑞士网格 + 雕塑构成艺术字 + 益普索杯赛事全称',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/cover-cand-b.png',
    palette: { schema: 'FigurePalette/v1', primary: '#234E80', secondary: '#5B82B2', opposite: '#D96B43', source: 'cover' },
    whenToUse: '适合算法平台、低空物流、金融科技、数字基础设施等强调精密理性感的选题。',
    keywords: ['瑞士网格', '钴蓝', '数据蓝图', '现代风', '封面'],
  },
  {
    id: 'cover-cand-c',
    kind: 'mode1_cover',
    label: 'C · 丹青朱砂新中式竖排风',
    badge: '主题封面样板',
    subnote: '丹青朱砂水墨长卷 + 右侧竖排非板正书法大字 + 益普索杯全称',
    aspect: '3:4',
    accent: 'burgundy',
    assetUrl: '/art/candidates/cover-cand-c.png',
    palette: { schema: 'FigurePalette/v1', primary: '#8A3449', secondary: '#2E5A78', opposite: '#C4933F', source: 'cover' },
    whenToUse: '适合老字号国潮、城市文脉、文化自信与东方美学意蕴突出的市场调查报告。',
    keywords: ['丹青', '朱砂', '竖排书法', '新中式', '封面'],
  },
  {
    id: 'cover-cand-d',
    kind: 'mode1_cover',
    label: 'D · 深海靛蓝×琥珀暖光 3D 剪纸灯箱风',
    badge: '主题封面样板',
    subnote: '靛蓝琥珀多层无酸卡纸剪纸灯箱 + 暗底暖金立体艺术字',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/cover-cand-d.png',
    palette: { schema: 'FigurePalette/v1', primary: '#1E3A5F', secondary: '#D9822B', opposite: '#2A7B88', source: 'cover' },
    whenToUse: '适合家庭代际、社区灯光、教育陪伴、文旅夜游等强调空间层次与温暖灯光的选题。',
    keywords: ['剪纸灯箱', '靛蓝', '琥珀', '3D浮雕', '封面'],
  },
  {
    id: 'cover-cand-e',
    kind: 'mode1_cover',
    label: 'E · 暖阳 35mm 胶片纪实人文大刊风',
    badge: '主题封面样板',
    subnote: '暖阳 35mm 胶片颗粒质感 + 错落大刊手写艺术字 + 益普索杯全称',
    aspect: '3:4',
    accent: 'burgundy',
    assetUrl: '/art/candidates/cover-cand-e.png',
    palette: { schema: 'FigurePalette/v1', primary: '#8A3449', secondary: '#C48A3E', opposite: '#2B5B6C', source: 'cover' },
    whenToUse: '适合城市烟火、新消费体验、青年生活方式、骑手与户外人群纪实调研报告。',
    keywords: ['35mm胶片', '纪实', '暖阳', '人文大刊', '封面'],
  },
  {
    id: 'cover-silver-illustrated',
    kind: 'mode1_cover',
    label: 'G · 图文一体光学镜表国奖示范封面',
    badge: '示范封面样板',
    subnote: '题名字形入画 · 晨光光学玻璃托盘、老花镜与心电监测表静物',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/cover-silver-illustrated.png',
    palette: { schema: 'FigurePalette/v1', primary: '#1D3549', secondary: '#C99A3E', opposite: '#0F766E', source: 'cover' },
    whenToUse: '作为题名字形与光学静物微距合一的标杆参考封面，直接验证排版呼吸感。',
    keywords: ['示范封面', '银发智守', '光学静物', '题名字形'],
  },

  // ───────── 3. Mode 2 Clean Cover Backdrops (9 verified PNGs) ─────────
  {
    id: 'backdrop-cand-f',
    kind: 'backdrop',
    label: 'F 底图 · 晶透光学玻璃静物微距无字底图',
    badge: '纯画无字底图',
    subnote: '上部 46% 晨光纯净留白，供矢量书法叠字与智能锚点精准合成（零嵌字）',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/backdrop-cand-f.png',
    palette: { schema: 'FigurePalette/v1', primary: '#0F766E', secondary: '#C99A3E', opposite: '#A65A3A', source: 'cover' },
    whenToUse: '配合矢量字体层独立合成标题，保证任何长标题清晰锐利、可自由排版编辑。',
    keywords: ['无字底图', '光学玻璃', '分层合成', '留白'],
  },
  {
    id: 'backdrop-cand-a',
    kind: 'backdrop',
    label: 'A 底图 · 宋韵宣纸青金工笔无字底图',
    badge: '纯画无字底图',
    subnote: '上部 42% 宣纸纯净留白 + 银杏花窗温情工笔，适配横排行楷叠字',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/backdrop-cand-a.png',
    palette: { schema: 'FigurePalette/v1', primary: '#0F766E', secondary: '#C99A3E', opposite: '#9C4221', source: 'cover' },
    whenToUse: '适用于需要精确控制竞赛名称、主副标题与盲审队名的中式工笔分层封面。',
    keywords: ['无字底图', '宋韵', '宣纸', '分层合成'],
  },
  {
    id: 'backdrop-cand-b',
    kind: 'backdrop',
    label: 'B 底图 · 钴蓝银灰瑞士数据蓝图无字底图',
    badge: '纯画无字底图',
    subnote: '上部 48% 银灰瑞士精密网格留白 + 钴蓝珊瑚双侧颜圆盘构图',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/backdrop-cand-b.png',
    palette: { schema: 'FigurePalette/v1', primary: '#234E80', secondary: '#5B82B2', opposite: '#D96B43', source: 'cover' },
    whenToUse: '适配现代科技、数据分析类选题的无字网格底图，支持矢量几何黑体叠题。',
    keywords: ['无字底图', '瑞士网格', '钴蓝', '分层合成'],
  },
  {
    id: 'backdrop-cand-c',
    kind: 'backdrop',
    label: 'C 底图 · 丹青朱砂新中式无字底图',
    badge: '纯画无字底图',
    subnote: '上部 54% 宣纸纯净留白 + 丹青朱砂城市笔触长卷，适配右侧竖排书法',
    aspect: '3:4',
    accent: 'burgundy',
    assetUrl: '/art/candidates/backdrop-cand-c.png',
    palette: { schema: 'FigurePalette/v1', primary: '#8A3449', secondary: '#2E5A78', opposite: '#C4933F', source: 'cover' },
    whenToUse: '专为右侧竖排大字与左侧胶囊副题设计的新中式纯画底图，零乱码隐患。',
    keywords: ['无字底图', '丹青朱砂', '竖排', '分层合成'],
  },
  {
    id: 'backdrop-cand-d',
    kind: 'backdrop',
    label: 'D 底图 · 深海靛蓝琥珀灯箱无字底图',
    badge: '纯画无字底图',
    subnote: '深海靛蓝暗底多层立体剪纸灯箱，适配暖金与象牙白矢量叠字',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/backdrop-cand-d.png',
    palette: { schema: 'FigurePalette/v1', primary: '#1E3A5F', secondary: '#D9822B', opposite: '#2A7B88', source: 'cover' },
    whenToUse: '暗底浅字专用纯画底图，建议搭配浅金色或象牙白矢量字层保证高可读性。',
    keywords: ['无字底图', '暗底', '剪纸灯箱', '浅金字'],
  },
  {
    id: 'backdrop-cand-e',
    kind: 'backdrop',
    label: 'E 底图 · 暖阳 35mm 胶片人文无字底图',
    badge: '纯画无字底图',
    subnote: '上部 38% 暖米杂志留白 + 暖阳胶片生活光影特写，适配错落大刊叠字',
    aspect: '3:4',
    accent: 'burgundy',
    assetUrl: '/art/candidates/backdrop-cand-e.png',
    palette: { schema: 'FigurePalette/v1', primary: '#8A3449', secondary: '#C48A3E', opposite: '#2B5B6C', source: 'cover' },
    whenToUse: '适用于消费民生与城市文化类杂志风叠字排版，底图颗粒温润自然。',
    keywords: ['无字底图', '胶片', '杂志风', '分层合成'],
  },
  {
    id: 'cover-teal-editorial',
    kind: 'backdrop',
    label: 'H 底图 · 林青医疗康养纸雕浮雕底图',
    badge: '顶部叠题底图',
    subnote: '博物馆级折纸浮雕医院、膳食与心率自行车意象 · 顶部 48% 米白叠题区',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/cover-teal-editorial.png',
    palette: { schema: 'FigurePalette/v1', primary: '#0F766E', secondary: '#5F8D7B', opposite: '#C99A3E', source: 'cover' },
    whenToUse: '医疗健康、公共卫生、体育康养、社区养老类报告的高对比顶部叠题纯画封面。',
    keywords: ['纯画底图', '纸雕', '医疗健康', '林青绿', '顶部叠题'],
  },
  {
    id: 'cover-blue-editorial',
    kind: 'backdrop',
    label: 'I 底图 · 靛蓝低空智联等轴白模底图',
    badge: '顶部叠题底图',
    subnote: '极简等轴空间无人机、信号塔与配送车沙盘 · 顶部 48% 浅灰白叠题区',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/cover-blue-editorial.png',
    palette: { schema: 'FigurePalette/v1', primary: '#234E80', secondary: '#64748B', opposite: '#C4933F', source: 'cover' },
    whenToUse: '适配低空经济、智慧物流、即时零售、数智治理与城市算力基础设施主题封面底图。',
    keywords: ['纯画底图', '白模', '低空经济', '无人机', '靛蓝'],
  },
  {
    id: 'cover-burgundy-editorial',
    kind: 'backdrop',
    label: 'J 底图 · 绛红铜版非遗工坊版画底图',
    badge: '顶部叠题底图',
    subnote: '学术孔版网点与铜版线描织机、宝塔、折扇与数据连接意象 · 顶部 45% 宣纸留白',
    aspect: '3:4',
    accent: 'burgundy',
    assetUrl: '/art/cover-burgundy-editorial.png',
    palette: { schema: 'FigurePalette/v1', primary: '#8A3449', secondary: '#2D3748', opposite: '#C4933F', source: 'cover' },
    whenToUse: '非遗数字化、老字号转型、文博旅游、乡村振兴与文化创意产业研究封面底图。',
    keywords: ['纯画底图', '版画', '非遗', '绛红', '文旅'],
  },

  // ───────── 4. Transparent A4 Academic Page Frames (5 verified PNGs) ─────────
  {
    id: 'frame-cand-a',
    kind: 'frame',
    label: 'A · 流动植物水彩金线页框',
    badge: '透明 A4 学术页框',
    subnote: '外缘 4%–6% 植物水彩丝带与暖金游丝，正文版心与页码区硬清空全透明',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/candidates/frame-cand-a.png',
    whenToUse: '适配全篇正文与附录统一页框，兼具人文柔和气质且不干扰任何表格与公式阅读。',
    keywords: ['页框', '水彩植物', '金线', 'A4透明', '全篇装饰'],
  },
  {
    id: 'frame-cand-b',
    kind: 'frame',
    label: 'B · 精密学院几何折线页框',
    badge: '透明 A4 学术页框',
    subnote: '对角建筑折线 + 暖金微菱锚点，线条锐利闭合，严守 88%×88% 正文净空区',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/candidates/frame-cand-b.png',
    whenToUse: '适配经管、工程、智能制造与定量计量色彩强烈的学术调查报告正文与附录页。',
    keywords: ['页框', '几何折线', '学院风', 'A4透明', '科技感'],
  },
  {
    id: 'frame-cand-c',
    kind: 'frame',
    label: 'C · 极简东方双线回纹角花页框',
    badge: '透明 A4 学术页框',
    subnote: '克制双细线框 + 淡墨传统回纹折角，严谨端庄且满足全盲审格式要求',
    aspect: '3:4',
    accent: 'burgundy',
    assetUrl: '/art/candidates/frame-cand-c.png',
    whenToUse: '适配文旅非遗、基层治理、社会保障及偏爱中式典雅三线书卷气质的竞赛作品。',
    keywords: ['页框', '东方回纹', '双细线', 'A4透明', '典雅'],
  },
  {
    id: 'frame-academic-a4',
    kind: 'frame',
    label: 'D · 青绿流线叶片水彩 A4 页框',
    badge: '透明 A4 学术页框',
    subnote: '右上与左下对称松石青绿叶片水彩丝带配暖金细线，中央正文完全透明',
    aspect: '3:4',
    accent: 'teal',
    assetUrl: '/art/frame-academic-a4.png',
    whenToUse: '生态环保、健康养老、民生福祉主题报告可直接一键套用的经典透明页框。',
    keywords: ['页框', '青绿', '叶片', '水彩', 'A4透明'],
  },
  {
    id: 'frame-blue-geometric-a4',
    kind: 'frame',
    label: 'E · 靛蓝几何角标平行线 A4 页框',
    badge: '透明 A4 学术页框',
    subnote: '学院靛蓝对角几何块面配暖金斜带与细轨双线，利落干净',
    aspect: '3:4',
    accent: 'blue',
    assetUrl: '/art/frame-blue-geometric-a4.png',
    whenToUse: '与钴蓝封面及经济/计算机实证色调完美联动，保持全篇内页统一学院风视觉秩序。',
    keywords: ['页框', '靛蓝', '几何角标', '平行线', 'A4透明'],
  },

  // ───────── 5. Track 2 Conceptual & Infographic Example Plates (8 verified PNGs + pure-vector Bento) ─────────
  {
    id: 'info-overview-instant-retail',
    kind: 'infographic',
    label: '即时零售与闪仓履约全景概念图',
    badge: '场景全景例图',
    subnote: '16:9 等轴空间白模风，具象展现前置仓分拣、骑手接驳到社区末梢履约全链条',
    aspect: '16:9',
    accent: 'blue',
    assetUrl: '/art/overview-instant-retail.png',
    bentoArchetype: 'instant_retail_darkstore',
    targetNode: 'intro.background',
    whenToUse: '置于第 1 章绪论或第 4 章场景界定，帮助评委一眼看懂服务供应链与多主体触点。',
    keywords: ['即时零售', '等轴白模', '全景图', '场景插画'],
  },
  {
    id: 'info-overview-silver-health',
    kind: 'infographic',
    label: '银发智能健康监测居家协防全景图',
    badge: '场景全景例图',
    subnote: '16:9 建筑纸雕风，描绘长者佩戴监测腕表、子女代际辅导与社区驿站联动情景',
    aspect: '16:9',
    accent: 'teal',
    assetUrl: '/art/overview-silver-health.png',
    bentoArchetype: 'silver_home_telehealth',
    targetNode: 'intro.background',
    whenToUse: '置于绪论研究界定节，直观呈现研究对象的多主体协同关系与现实使用痛点语境。',
    keywords: ['银发', '纸雕', '代际反哺', '场景插画'],
  },
  {
    id: 'info-demographic-retail-profile',
    kind: 'infographic',
    label: '即时零售客群构成与频次画像例图',
    badge: '人物画像例图',
    subnote: '10 格人物进度条卡片版式，一图总览客群构成、消费频次与年龄结构',
    aspect: '16:9',
    accent: 'blue',
    assetUrl: '/art/demographic-retail-profile.png',
    bentoArchetype: 'retail_cohort_frequency',
    targetNode: 'sample.profile',
    whenToUse: '用于第 4 章样本描述开篇主图参考，全部数值须由实测统计占比驱动映射，严禁凭空虚构读数。',
    keywords: ['人物画像', '小人进度条', '客群构成', '第4章'],
  },
  {
    id: 'info-demographic-silver-profile',
    kind: 'infographic',
    label: '银发康养受访长者与家属画像例图',
    badge: '人物画像例图',
    subnote: '受访长者与协同家属比例、使用状态与高龄分段 10 格小人进度条范式',
    aspect: '16:9',
    accent: 'teal',
    assetUrl: '/art/demographic-silver-profile.png',
    bentoArchetype: 'silver_caregiver_dyad',
    targetNode: 'sample.profile',
    whenToUse: '用于第 4 章人口学与使用状态画像示范呈现，支持按当前报告实测统计结果自动替换占比。',
    keywords: ['人物画像', '银发', '使用状态', '第4章'],
  },
  {
    id: 'info-roadmap-retail-action',
    kind: 'infographic',
    label: '即时零售协同治理与 30 天试点路径例图',
    badge: '实施路径例图',
    subnote: '第 9 章对策路径示范 · 实证痛点识别 → 基层制度协同 → 30 天试点 → 效果复测推广',
    aspect: '16:9',
    accent: 'blue',
    assetUrl: '/art/roadmap-retail-action.png',
    bentoArchetype: 'retail_30d_pilot_action',
    targetNode: 'plan.measures',
    whenToUse: '用于第 9 章对策建议收束，将抽象建议具象化为四阶段可核验的闭环推进场景。',
    keywords: ['实施路径', '图9-1', '协同治理', '第9章'],
  },
  {
    id: 'info-roadmap-silver-action',
    kind: 'infographic',
    label: '银发智守协同治理与社区试点路径例图',
    badge: '实施路径例图',
    subnote: '林青主色四场景叙事，串联入户诊断、驿站会商、医生协同试行与社区效果复测闭环',
    aspect: '16:9',
    accent: 'teal',
    assetUrl: '/art/roadmap-silver-action.png',
    bentoArchetype: 'silver_community_grid_action',
    targetNode: 'plan.measures',
    whenToUse: '适合健康管理、社区治理与适老化改造类课题的终章实施机制路径配图。',
    keywords: ['实施路径', '社区试点', '银发智守', '第9章'],
  },
  {
    id: 'info-summary-classification-support',
    kind: 'infographic',
    label: '受访群体四分群精准施策总结卡（仿图 29）',
    badge: '分类总结卡例图',
    subnote: '纯白四栏总结卡版式，并列高频自主、协助依赖、间歇低评与观望未用四类人群精准施策清单',
    aspect: '16:9',
    accent: 'teal',
    assetUrl: '/art/summary-classification-support.png',
    bentoArchetype: 'four_segment_precision_policy',
    targetNode: 'segments.cluster',
    whenToUse: '紧接 K-Means 聚类画像之后，一图收束不同细分人群的差异化产品与政策抓手。',
    keywords: ['分类总结卡', '仿图29', '四分群', '对策矩阵'],
  },
  {
    id: 'info-respondent-profile-concept',
    kind: 'infographic',
    label: '湖北地域文化嵌入型受访者构成概念图',
    badge: '地域画像例图',
    subnote: '顶部融入黄鹤楼、长江大桥与热干面风物符号，呈现 6 维人口学构成全景示例',
    aspect: '16:9',
    accent: 'teal',
    assetUrl: '/research-visuals/respondent-profile-concept.png',
    bentoArchetype: 'regional_respondent_portrait',
    targetNode: 'sample.profile',
    whenToUse: '地方特色鲜明的省市县调研作品可直接借鉴该版式，将区域风物与样本特征自然融合。',
    keywords: ['地域特色', '湖北', '受访者构成', '概念示例'],
  },

  // ───────── 6. 44 Pure-SVG Academic Discipline Semantic Palette & Specimen Boards ─────────
  {
    id: 'palette-lancet-nejm-clinical',
    kind: 'palette_board',
    label: '临床医学·柳叶刀/NEJM 克制深海蓝与暖陶红',
    badge: '学科配色样板 · 临床医学',
    subnote: '深海蓝 + 医用青碧 + 暖陶红警示，克制高信度',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#1D4E89', secondary: '#2A7B88', opposite: '#C05621', source: 'manual' },
    boardSpec: {
      disciplineTag: '临床医学',
      journalRef: 'The Lancet / NEJM · 临床实证专刊',
      paperHex: '#FAFBFD',
      inkHex: '#1E293B',
      mutedHex: '#64748B',
      tintHex: '#EBF2FA',
      ruleHex: '#CBD5E1',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [64, 88, 52, 94, 74],
      chartLine: [34, 48, 42, 66, 78],
      tableHeaders: ['干预与结局指标', 'OR (95% CI)', 'p 值'],
      tableRows: [
        ['规范随访依从组', '1.84 [1.26, 2.69]', '<0.001'],
        ['常规护理对照基线', '0.72 [0.51, 1.02]', '0.064'],
      ],
      tableNote: '双侧检验 α=0.05，稳健区间基于多因素 Logistic 估计。',
    },
    whenToUse: '适配智慧医疗、慢性病管理、居家健康监测、公共卫生与医药服务满意度调研。',
    keywords: ['配色样板', '临床医学', 'Lancet', 'NEJM', '深海蓝', '暖陶红'],
  },
  {
    id: 'palette-aer-qje-econometrics',
    kind: 'palette_board',
    label: '经济计量·AER/QJE 墨青金石与琥珀棕',
    badge: '学科配色样板 · 经济计量',
    subnote: '墨青金石 + 学院靛蓝 + 琥珀棕，经管回归标杆',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0F766E', secondary: '#234E80', opposite: '#B45309', source: 'manual' },
    boardSpec: {
      disciplineTag: '经济计量',
      journalRef: 'AER / QJE / 经济研究 · 截面识别',
      paperHex: '#FCFAF5',
      inkHex: '#212529',
      mutedHex: '#595959',
      tintHex: '#E7F3F1',
      ruleHex: '#D8D3C8',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [58, 76, 92, 68, 84],
      chartLine: [28, 44, 62, 54, 76],
      tableHeaders: ['解释变量 (HC3)', '回归系数 β', 'Adj R²'],
      tableRows: [
        ['数字触达强度 (X1)', '0.384*** (0.052)', '0.462'],
        ['交易成本感知 (X2)', '-0.214** (0.068)', '0.491'],
      ],
      tableNote: '括号内为 HC3 异方差稳健标准误，Max VIF = 1.52。',
    },
    whenToUse: '适配正大杯经管实证、消费弹性、城乡收入差异、政策效应与多阶段抽样报告。',
    keywords: ['配色样板', '经济计量', 'AER', 'QJE', '墨青', '琥珀棕'],
  },
  {
    id: 'palette-neurips-icml-ai',
    kind: 'palette_board',
    label: '计算机顶会·NeurIPS/ICML 靛紫星曜与青碧绿',
    badge: '学科配色样板 · 计算机顶会',
    subnote: '靛紫星曜 + 青碧绿 + 暖金标识，算法消融锐利清晰',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#3730A3', secondary: '#0D9488', opposite: '#D97706', source: 'manual' },
    boardSpec: {
      disciplineTag: '算法顶会',
      journalRef: 'NeurIPS / ICML · 消融与系统评估',
      paperHex: '#F9FAFC',
      inkHex: '#1E1B4B',
      mutedHex: '#5B6078',
      tintHex: '#ECEBFA',
      ruleHex: '#D5D9E7',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [52, 68, 82, 95, 88],
      chartLine: [72, 64, 52, 34, 28],
      tableHeaders: ['模型配置组', 'Macro-F1', '延迟 ms'],
      tableRows: [
        ['多特征融合模型', '0.914 ± 0.01', '12.4'],
        ['单模态基线组', '0.842 ± 0.02', '28.9'],
      ],
      tableNote: '五折分层交叉验证均值，置信水平 95%。',
    },
    whenToUse: '适配智能应用采纳、对话系统交互评估、推荐算法治理与数字平台用户画像调研。',
    keywords: ['配色样板', '计算机', 'NeurIPS', 'ICML', '靛紫', '青碧绿'],
  },
  {
    id: 'palette-nature-science-ecology',
    kind: 'palette_board',
    label: '自然生态·Nature/Science 松烟墨绿与丹霞金',
    badge: '学科配色样板 · 自然生态',
    subnote: '松烟墨绿 + 晴空群青 + 丹霞赤，环境与空间测度风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#14532D', secondary: '#1D4ED8', opposite: '#B91C1C', source: 'manual' },
    boardSpec: {
      disciplineTag: '自然生态',
      journalRef: 'Nature / Science · 双碳与空间生态',
      paperHex: '#FBFBF8',
      inkHex: '#1C241E',
      mutedHex: '#526056',
      tintHex: '#E8F0EB',
      ruleHex: '#D1DAD2',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [46, 62, 78, 90, 86],
      chartLine: [38, 52, 68, 72, 82],
      tableHeaders: ['空间生态分区', "Moran's I", '显著性 p'],
      tableRows: [
        ['核心绿楔试点区', '0.418***', '<0.001'],
        ['外围生态过渡带', '0.264**', '0.004'],
      ],
      tableNote: '基于 Queen 邻接权重矩阵测算空间自相关特征。',
    },
    whenToUse: '适配双碳低碳消费、新能源出行、绿色农业、生态旅游与空间地理差异研究。',
    keywords: ['配色样板', '自然生态', 'Nature', 'Science', '松烟绿', '丹霞'],
  },
  {
    id: 'palette-governance-law-crimson',
    kind: 'palette_board',
    label: '公共治理与法政·学院绛红与藏青墨',
    badge: '学科配色样板 · 公共治理',
    subnote: '学院绛红 + 藏青墨 + 典籍鎏金，厚重庄严社科风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#881337', secondary: '#1E3A5F', opposite: '#B5802A', source: 'manual' },
    boardSpec: {
      disciplineTag: '公共治理',
      journalRef: '中国社会科学 / APSR · 制度与治理',
      paperHex: '#FBF9F7',
      inkHex: '#261C20',
      mutedHex: '#64585D',
      tintHex: '#F6EBF0',
      ruleHex: '#E0D6D9',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [72, 84, 60, 88, 76],
      chartLine: [42, 58, 50, 74, 80],
      tableHeaders: ['治理效能维度', 'Welch F', '效应 η²'],
      tableRows: [
        ['网格协同响应度', '18.42***', '0.146'],
        ['政策知晓透明度', '9.18**', '0.082'],
      ],
      tableNote: '异方差下采用 Welch 方差分析与 Games-Howell 检验。',
    },
    whenToUse: '适配基层社区治理、政务服务评价、社会保障政策感知与城乡公共服务均等化调研。',
    keywords: ['配色样板', '公共治理', '法政', '绛红', '藏青墨', '社科'],
  },
  {
    id: 'palette-finance-wallstreet-graphite',
    kind: 'palette_board',
    label: '金融工程与商科·华尔街石墨金与孔雀蓝',
    badge: '学科配色样板 · 金融商科',
    subnote: '石墨深岩 + 孔雀蓝绿 + 华尔街金，克制权威商刊格调',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#1E293B', secondary: '#0F766E', opposite: '#C4933F', source: 'manual' },
    boardSpec: {
      disciplineTag: '金融商科',
      journalRef: 'JF / JFE / 管理世界 · 商业风险',
      paperHex: '#FAFAF8',
      inkHex: '#0F172A',
      mutedHex: '#475569',
      tintHex: '#ECEFF4',
      ruleHex: '#CBD5E1',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [68, 74, 86, 92, 80],
      chartLine: [30, 46, 58, 78, 84],
      tableHeaders: ['投资/消费组合', 'Sharpe / 均分', '最大回撤'],
      tableRows: [
        ['普惠稳健配置层', '1.68 / 4.24', '-8.4%'],
        ['高波动敏感群体', '1.12 / 3.41', '-14.7%'],
      ],
      tableNote: '已扣除无风险基准率并校验样本组间异质性边界。',
    },
    whenToUse: '适配普惠金融、消费信贷、数字支付安全、商业选址与企业服务满意度研究。',
    keywords: ['配色样板', '金融工程', '商科', '石墨金', '孔雀蓝'],
  },
  {
    id: 'palette-culture-tourism-celadon',
    kind: 'palette_board',
    label: '新消费与文旅调研·江南天青与胭脂朱',
    badge: '学科配色样板 · 文旅消费',
    subnote: '江南天青 + 靛蓝远山 + 胭脂朱砂，雅致人文国潮',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0E7490', secondary: '#3B4D7A', opposite: '#BE4B3B', source: 'manual' },
    boardSpec: {
      disciplineTag: '文旅消费',
      journalRef: '益普索杯国奖标杆 · 非遗文旅消费',
      paperHex: '#FCFAF6',
      inkHex: '#1F2933',
      mutedHex: '#5A6570',
      tintHex: '#E6F4F8',
      ruleHex: '#D8D4CA',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [78, 90, 66, 82, 72],
      chartLine: [44, 64, 58, 74, 86],
      tableHeaders: ['服务体验触点', 'IPA 表现均分', 'NPS 净值'],
      tableRows: [
        ['沉浸演艺互动性', '4.32 ± 0.58', '+38.4'],
        ['配套接驳便利度', '3.64 ± 0.81', '+14.2'],
      ],
      tableNote: 'NPS 由 0–10 分推荐者减去贬损者占比精确计得。',
    },
    whenToUse: '适配非遗文创、茶旅古镇、沉浸式文旅、老字号焕新与体验经济调查研究。',
    keywords: ['配色样板', '新消费', '文旅', '江南天青', '胭脂朱'],
  },
  {
    id: 'palette-cud-accessible-print',
    kind: 'palette_board',
    label: '高对比无障碍刊印·黑白友好色盲安全六阶板',
    badge: '学科配色样板 · 无障碍刊印',
    subnote: '晴空高辨识蓝 + 安全翠绿 + 朱砂暖橙，黑白打印与色盲零失真',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#0072B2', secondary: '#009E73', opposite: '#D55E00', source: 'manual' },
    boardSpec: {
      disciplineTag: '刊印安全',
      journalRef: 'Okabe-Ito CUD · 黑白/色觉安全规范',
      paperHex: '#FFFFFF',
      inkHex: '#111827',
      mutedHex: '#4B5563',
      tintHex: '#E6F2FA',
      ruleHex: '#D1D5DB',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [60, 84, 72, 92, 68],
      chartLine: [36, 54, 48, 76, 84],
      tableHeaders: ['图形通道校验项', 'WCAG 对比度', '灰度明度差'],
      tableRows: [
        ['主色晴空蓝对纸白', '5.04 : 1 (AA)', '32% 阶差'],
        ['对冲朱砂橙对纸白', '3.68 : 1 (图形)', '24% 阶差'],
      ],
      tableNote: '支持黑白激光盲审打印，各系列亮度单调递进不混叠。',
    },
    whenToUse: '竞赛盲审纸质印刷、严苛色觉无障碍要求或需要大面积灰度打印复核的实证报告。',
    keywords: ['配色样板', '无障碍', '黑白打印', '色盲安全', 'Okabe-Ito'],
  },
  {
    id: 'palette-ieee-aerospace-cyber',
    kind: 'palette_board',
    label: '航空与工控·IEEE Trans 航天普鲁士蓝与信号橙',
    badge: '学科配色样板 · 航空工控',
    subnote: '航天普鲁士蓝 + 遥测天青 + 信号橙，精密硬件测控风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#0B3C6D', secondary: '#2E86AB', opposite: '#D95F02', source: 'manual' },
    boardSpec: {
      disciplineTag: '航空工控',
      journalRef: 'IEEE Trans · 飞控与工业系统',
      paperHex: '#F8FAFC',
      inkHex: '#0F172A',
      mutedHex: '#475569',
      tintHex: '#E6EFF8',
      ruleHex: '#CBD5E1',
      typographyScale: '无衬线粗标 / 宋体正文 / 等宽数字',
      chartBars: [54, 72, 86, 94, 82],
      chartLine: [78, 66, 52, 36, 28],
      tableHeaders: ['飞控冗余模式', 'RMSE / 时延', '故障率'],
      tableRows: [
        ['双模容错闭环', '0.018 / 4.2ms', '0.12%'],
        ['单通道PID基准', '0.064 / 9.8ms', '1.45%'],
      ],
      tableNote: '500 次蒙特卡洛闭环仿真，满足实时界限。',
    },
    whenToUse: '适配低空无人机、工业机器人、智能装备运维、可靠性工程与系统控制实证调研。',
    keywords: ['配色样板', '航空航天', '工业控制', 'IEEE', '普鲁士蓝', '信号橙'],
  },
  {
    id: 'palette-acs-materials-chem',
    kind: 'palette_board',
    label: '材料与催化·ACS/JACS 晶格钴蓝与氧化赤铜',
    badge: '学科配色样板 · 材料化学',
    subnote: '晶格钴蓝 + 电解青翠 + 氧化赤铜，电化学与表征谱图风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#243B6B', secondary: '#1B8A7E', opposite: '#C84B31', source: 'manual' },
    boardSpec: {
      disciplineTag: '材料化学',
      journalRef: 'ACS / JACS · 催化与电池实证',
      paperHex: '#FAFBFD',
      inkHex: '#1A2233',
      mutedHex: '#526075',
      tintHex: '#EAEFF7',
      ruleHex: '#D0D7E3',
      typographyScale: '无衬线标题 / 宋体正文 / Times 数字',
      chartBars: [48, 66, 84, 96, 78],
      chartLine: [26, 44, 62, 82, 74],
      tableHeaders: ['催化体系样本', '法拉第效率', '过电位'],
      tableRows: [
        ['单原子掺杂组', '94.6% ± 1.2', '186 mV'],
        ['商业铂碳对照', '81.3% ± 1.8', '264 mV'],
      ],
      tableNote: '10 mA/cm² 下三组平行极化曲线均值。',
    },
    whenToUse: '适配动力电池材料、绿氢电解催化、新材料产业调研及实验室性能对照测试报告。',
    keywords: ['配色样板', '材料化学', '新能源催化', 'ACS', 'JACS', '钴蓝', '氧化赤铜'],
  },
  {
    id: 'palette-cell-genomics-bio',
    kind: 'palette_board',
    label: '生信与组学·Cell/Nat Biotech 基因翡翠与测序紫',
    badge: '学科配色样板 · 生物信息',
    subnote: '基因翡翠 + 测序鸢尾紫 + 上调珊瑚红，多组学聚类风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0B6E4F', secondary: '#6B3FA0', opposite: '#D64550', source: 'manual' },
    boardSpec: {
      disciplineTag: '生物信息',
      journalRef: 'Cell / Nat Biotech · 单细胞组学',
      paperHex: '#FAFDFB',
      inkHex: '#182620',
      mutedHex: '#4F6359',
      tintHex: '#E6F4EE',
      ruleHex: '#CDE0D6',
      typographyScale: '无衬线标题 / 宋体正文 / Times 数字',
      chartBars: [56, 78, 92, 68, 84],
      chartLine: [32, 58, 76, 64, 88],
      tableHeaders: ['差异基因通路', 'log2FC / FDR', '富集度'],
      tableRows: [
        ['免疫突触激活', '+2.48 / <1e-4', '3.62'],
        ['线粒体代谢轴', '-1.64 / 0.003', '2.18'],
      ],
      tableNote: 'BH 校正后 FDR < 0.05 为显著差异表达。',
    },
    whenToUse: '适配生物医药研发、基因检测认知调研、医疗器械创新及生命科学多组学可视化。',
    keywords: ['配色样板', '基因组学', '生物信息', 'Cell', 'Nature Biotech', '翡翠绿', '鸢尾紫'],
  },
  {
    id: 'palette-apa-psych-edu',
    kind: 'palette_board',
    label: '教育与心理·APA/Psychometrika 研习灰蓝与鼠尾草',
    badge: '学科配色样板 · 教育心理',
    subnote: '研习灰蓝 + 鼠尾草绿 + 暖杏陶，潜变量与信效度测量风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#335C81', secondary: '#4A7C59', opposite: '#C86D3B', source: 'manual' },
    boardSpec: {
      disciplineTag: '教育心理',
      journalRef: 'APA / Psychometrika · 认知测量',
      paperHex: '#FCFBF8',
      inkHex: '#1F2937',
      mutedHex: '#5A6472',
      tintHex: '#EBF1F6',
      ruleHex: '#D4DAE2',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [66, 82, 74, 90, 62],
      chartLine: [40, 56, 64, 78, 70],
      tableHeaders: ['潜变量测量项', '路径系数 β', 'AVE 值'],
      tableRows: [
        ['自主学习效能', '0.462*** (0.04)', '0.648'],
        ['认知负荷干扰', '-0.285** (0.06)', '0.574'],
      ],
      tableNote: 'CFA 拟合 CFI=0.954，RMSEA=0.048。',
    },
    whenToUse: '适配双减政策、智慧助学感知、青少年心理健康、高校育人评估与量表心理测量调研。',
    keywords: ['配色样板', '教育测量', '认知心理', 'APA', 'Psychometrika', '灰蓝', '鼠尾草'],
  },
  {
    id: 'palette-rural-agri-earth',
    kind: 'palette_board',
    label: '三农与粮食·中国农村经济 沃野青绿与麦浪金',
    badge: '学科配色样板 · 三农经济',
    subnote: '沃野青绿 + 麦浪丰金 + 红壤赤陶，乡土实证与稳产风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#285943', secondary: '#C58B2B', opposite: '#A63A2E', source: 'manual' },
    boardSpec: {
      disciplineTag: '三农经济',
      journalRef: '中国农村经济 · 农业全要素测度',
      paperHex: '#FDFBF5',
      inkHex: '#22261E',
      mutedHex: '#5D6356',
      tintHex: '#EAF2EC',
      ruleHex: '#D7DACD',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [52, 70, 84, 92, 80],
      chartLine: [34, 48, 66, 74, 86],
      tableHeaders: ['农户经营规模', '增收弹性 β', 'TFP 增幅'],
      tableRows: [
        ['合作社托管组', '0.312*** (0.04)', '+14.8%'],
        ['传统分散小农', '0.118* (0.05)', '+4.6%'],
      ],
      tableNote: 'PSM-DID 匹配平均处理效应，覆 12 县。',
    },
    whenToUse: '适配乡村振兴、数字助农直播、高标准农田、粮食安全意愿与县域特色农产品调研。',
    keywords: ['配色样板', '三农振兴', '粮食安全', '中国农村经济', '沃野绿', '麦浪金'],
  },
  {
    id: 'palette-urban-gis-transit',
    kind: 'palette_board',
    label: '城市与交通·空间计量/JAPA 空间深青与干道琥珀',
    badge: '学科配色样板 · 城市交通',
    subnote: '空间深青 + 干道琥珀 + 节点绛红，GIS 路网与通勤测度风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#1A535C', secondary: '#D48C2A', opposite: '#B23A48', source: 'manual' },
    boardSpec: {
      disciplineTag: '城市交通',
      journalRef: 'JAPA / 城市规划 · 空间与通勤',
      paperHex: '#F9FAFB',
      inkHex: '#1A242B',
      mutedHex: '#52626B',
      tintHex: '#E6F1F3',
      ruleHex: '#CCD7DC',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [60, 84, 92, 74, 68],
      chartLine: [46, 62, 58, 40, 32],
      tableHeaders: ['TOD 圈层分区', '可达性指数', '分担率'],
      tableRows: [
        ['轨交 500m 核区', '0.842***', '68.4%'],
        ['外围接驳盲区', '0.415**', '31.2%'],
      ],
      tableNote: '基于高德 OD 栅格与空间杜宾模型估算。',
    },
    whenToUse: '适配城市更新、15 分钟生活圈、智慧轨交接驳、微循环公交与低空城市路网规划调研。',
    keywords: ['配色样板', '城市规划', '智慧交通', '空间计量', 'JAPA', 'GIS', '深青'],
  },
  {
    id: 'palette-demography-aging-silver',
    kind: 'palette_board',
    label: '人口与康养·人口研究 暮山青黛与银杏暖杏',
    badge: '学科配色样板 · 人口康养',
    subnote: '暮山青黛 + 银杏暖杏 + 岁暖砖红，适老温情且高辨识度',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#2A5C6A', secondary: '#C27D38', opposite: '#9E4244', source: 'manual' },
    boardSpec: {
      disciplineTag: '人口康养',
      journalRef: '人口研究 / Demography · 银发',
      paperHex: '#FDFBF7',
      inkHex: '#23282B',
      mutedHex: '#5B6368',
      tintHex: '#EAF2F4',
      ruleHex: '#DBD7CE',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [44, 62, 78, 90, 86],
      chartLine: [28, 42, 60, 76, 84],
      tableHeaders: ['长者照护分层', '健康期望年', '满意度'],
      tableRows: [
        ['医养嵌入社区', '74.8 ± 2.1', '86.5%'],
        ['纯居家独居组', '69.2 ± 2.8', '61.4%'],
      ],
      tableNote: '基于多状态生命表与分层抽样测算。',
    },
    whenToUse: '适配银发经济、社区居家养老、长期护理保险、代际支持与适老化改造调研报告。',
    keywords: ['配色样板', '人口老龄化', '银发康养', '人口研究', '青黛', '银杏暖杏'],
  },
  {
    id: 'palette-esg-carbon-energy',
    kind: 'palette_board',
    label: '双碳与能源·Nature Energy 绿电碧青与氢能蓝',
    badge: '学科配色样板 · 双碳能源',
    subnote: '绿电碧青 + 氢能蔚蓝 + 碳耗橙，ESG 转型与能源替代风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0A6E69', secondary: '#2574A9', opposite: '#C85A17', source: 'manual' },
    boardSpec: {
      disciplineTag: '双碳能源',
      journalRef: 'Nature Energy · 绿电与减排实证',
      paperHex: '#F8FCFB',
      inkHex: '#142423',
      mutedHex: '#4D615F',
      tintHex: '#E6F4F3',
      ruleHex: '#CCE0DE',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [42, 58, 76, 88, 95],
      chartLine: [84, 72, 58, 42, 29],
      tableHeaders: ['能源替代情景', '减碳强度 %', 'LCOE'],
      tableRows: [
        ['风光储氢微网', '-46.8%***', '0.28元'],
        ['煤电调峰基准', '-12.4%*', '0.43元'],
      ],
      tableNote: 'LCOE 按度电平准化成本计，贴现率 6%。',
    },
    whenToUse: '适配零碳园区、ESG 企业披露、新能源汽车补能、分布式光伏与居民绿电意愿调研。',
    keywords: ['配色样板', '双碳转型', '绿电氢能', 'Nature Energy', 'ESG', '绿电碧青'],
  },
  {
    id: 'palette-supplychain-or-logistics',
    kind: 'palette_board',
    label: '运筹与供应链·Mgmt Sci 调度藏蓝与断链赤',
    badge: '学科配色样板 · 运筹物流',
    subnote: '调度藏蓝 + 履约松石 + 断链赤，帕累托前沿与调度风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#233D5B', secondary: '#3A868B', opposite: '#D1603D', source: 'manual' },
    boardSpec: {
      disciplineTag: '运筹物流',
      journalRef: 'Management Science · 供应链韧性',
      paperHex: '#F9FAFC',
      inkHex: '#1A2330',
      mutedHex: '#546070',
      tintHex: '#E9EFF5',
      ruleHex: '#CFD7E2',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [62, 78, 88, 94, 72],
      chartLine: [76, 62, 48, 34, 44],
      tableHeaders: ['动态调度策略', '履约总成本', '准时率'],
      tableRows: [
        ['鲁棒多仓协同', '128.4 万*', '97.2%'],
        ['静态安全库存', '156.9 万', '88.6%'],
      ],
      tableNote: '极端扰动下 MILP 求解器 Gap < 0.5%。',
    },
    whenToUse: '适配即时物流、冷链生鲜履约、低空无人机配送、制造业供应链韧性与选址优化调研。',
    keywords: ['配色样板', '运筹优化', '供应链', 'Management Science', '物流调度', '藏蓝'],
  },
  {
    id: 'palette-epi-public-health',
    kind: 'palette_board',
    label: '公卫与流调·BMJ/AJPH 卫生青绿与警戒珊瑚',
    badge: '学科配色样板 · 公共卫生',
    subnote: '卫生青绿 + 人群钢蓝 + 警戒珊瑚，流调归因与疾控风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#157A6E', secondary: '#3D5A80', opposite: '#D1495B', source: 'manual' },
    boardSpec: {
      disciplineTag: '公共卫生',
      journalRef: 'BMJ / AJPH · 流行病归因风险',
      paperHex: '#F9FCFC',
      inkHex: '#192729',
      mutedHex: '#526467',
      tintHex: '#E6F4F2',
      ruleHex: '#CDE0DF',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [50, 74, 88, 66, 92],
      chartLine: [68, 54, 42, 34, 24],
      tableHeaders: ['人群暴露分层', 'aHR (95% CI)', 'PAF 占比'],
      tableRows: [
        ['高频筛查覆盖', '0.64 [0.51, 0.80]', '24.6%'],
        ['基层随访薄弱', '1.48 [1.18, 1.85]', '18.2%'],
      ],
      tableNote: 'Cox 模型已控制年龄与城乡分层因素。',
    },
    whenToUse: '适配传染病防控认知、疫苗接种意愿、基层公卫均等化、医保支付改革与健康素养调研。',
    keywords: ['配色样板', '流行病学', '公共卫生', 'BMJ', 'AJPH', '青绿', '珊瑚红'],
  },
  {
    id: 'palette-digital-platform-comm',
    kind: 'palette_board',
    label: '数字传播·传播学刊 媒介绛紫与舆情橙',
    badge: '学科配色样板 · 数字传播',
    subnote: '媒介绛紫 + 算法钢蓝 + 舆情暖橙，极化网络与文本挖掘风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#7A2E58', secondary: '#2A6F97', opposite: '#D96B27', source: 'manual' },
    boardSpec: {
      disciplineTag: '数字传播',
      journalRef: '新闻与传播研究 · 平台舆情治理',
      paperHex: '#FCF9FB',
      inkHex: '#241B22',
      mutedHex: '#61545E',
      tintHex: '#F4EBF0',
      ruleHex: '#E0D4DC',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [58, 86, 94, 70, 64],
      chartLine: [36, 68, 84, 56, 48],
      tableHeaders: ['舆论传播主题', '中心度 / 情感', '扩散比'],
      tableRows: [
        ['算法透明度帖', '0.412 / -0.38', '3.45x'],
        ['事实核查辟谣', '0.286 / +0.52', '1.92x'],
      ],
      tableNote: 'BERTopic 聚类与有向转发网络测度结果。',
    },
    whenToUse: '适配短视频传播、算法推荐治理、网络舆情极化、数字鸿沟与数字内容可信度调研。',
    keywords: ['配色样板', '数字传播', '平台治理', '传播学刊', '舆情', '绛紫', '算法蓝'],
  },
  {
    id: 'palette-heritage-arch-museum',
    kind: 'palette_board',
    label: '文博与营建·建筑学报 榫卯朱褐与石绿矿彩',
    badge: '学科配色样板 · 文博建筑',
    subnote: '榫卯朱褐 + 石绿矿彩 + 泥金鎏铜，古建测绘与文博典雅风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#8C3B2B', secondary: '#2E6F6D', opposite: '#B8862D', source: 'manual' },
    boardSpec: {
      disciplineTag: '文博建筑',
      journalRef: '建筑学报 / 文博 · 古建与活化',
      paperHex: '#FAF6EE',
      inkHex: '#29211E',
      mutedHex: '#695E57',
      tintHex: '#F4EAE6',
      ruleHex: '#DFD6CA',
      typographyScale: '标题黑体 / 仿宋正文 / Times 数字',
      chartBars: [70, 88, 76, 94, 66],
      chartLine: [40, 58, 66, 82, 74],
      tableHeaders: ['遗存保护活化', '空间句法分', '复游率'],
      tableRows: [
        ['木构数字孪生', '4.56 ± 0.42', '64.2%'],
        ['传统静态陈列', '3.78 ± 0.65', '38.5%'],
      ],
      tableNote: '基于空间句法集成度与观众沉浸调查。',
    },
    whenToUse: '适配历史街区保护、博物馆数字化策展、传统村落营造、古建文旅活化与非遗技艺传承调研。',
    keywords: ['配色样板', '文博考古', '传统营建', '建筑学报', '朱褐', '石绿矿彩'],
  },
  {
    id: 'palette-semiconductor-eda-silicon',
    kind: 'palette_board',
    label: '集成电路与芯片·IEEE JSSC 晶圆深蓝与光刻金',
    badge: '学科配色样板 · 集成电路',
    subnote: '晶圆深蓝 + 光刻金 + 缺陷警示红，洁净室精密仪表风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#143A66', secondary: '#C48A21', opposite: '#B64232', source: 'manual' },
    boardSpec: {
      disciplineTag: '集成电路',
      journalRef: 'IEEE JSSC · 半导体工艺与 EDA',
      paperHex: '#F9FBFD',
      inkHex: '#182230',
      mutedHex: '#526275',
      tintHex: '#EBF2F8',
      ruleHex: '#D1DCE8',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [88, 94, 72, 96, 82],
      chartLine: [52, 64, 70, 86, 94],
      tableHeaders: ['制程节点评估', '均值 ± SD', '良率跃升'],
      tableRows: [
        ['智能布线优化', '94.6% ± 1.8', '+8.4%'],
        ['传统标准单元', '86.2% ± 2.9', '基准对照'],
      ],
      tableNote: '晶圆测试 Wafer-Sort 与 EDA 功耗收敛基线。',
    },
    whenToUse: '适配半导体制造、先进封装、EDA 软件国产化、算力芯片供应链与高新园区产线调研。',
    keywords: ['配色样板', '半导体', '集成电路', '光刻', '芯片', 'IEEE', 'JSSC'],
  },
  {
    id: 'palette-marine-oceanography-abyssal',
    kind: 'palette_board',
    label: '海洋科学与蓝碳·深海靛青与珊瑚橙',
    badge: '学科配色样板 · 海洋科学',
    subnote: '深海靛青 + 潮汐海绿 + 珊瑚生态橙，深远海牧场风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0F4C5C', secondary: '#2A8C82', opposite: '#D96B43', source: 'manual' },
    boardSpec: {
      disciplineTag: '海洋蓝碳',
      journalRef: 'Limnol. Oceanogr. · 海洋经济',
      paperHex: '#F8FBFB',
      inkHex: '#14262E',
      mutedHex: '#4E6770',
      tintHex: '#E7F3F4',
      ruleHex: '#CCE0E2',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [64, 82, 92, 74, 86],
      chartLine: [38, 54, 72, 68, 84],
      tableHeaders: ['海域生态指标', '估计系数 (SE)', '显著性'],
      tableRows: [
        ['红树林蓝碳汇', '0.412 (0.06)', 'p<0.001'],
        ['近海休渔增殖', '0.268 (0.07)', 'p=0.002'],
      ],
      tableNote: '沿海站位样方与渔民生态补偿意愿测度。',
    },
    whenToUse: '适配海洋牧场、红树林/海草床蓝碳交易、远洋渔业转型、海上风电融合与海岛振兴调研。',
    keywords: ['配色样板', '海洋', '蓝碳', '海洋牧场', '珊瑚', '渔业', '沿海'],
  },
  {
    id: 'palette-quantum-photonics-violet',
    kind: 'palette_board',
    label: '量子计算与光子学·PhysRev 量子深紫与激光青',
    badge: '学科配色样板 · 量子光子',
    subnote: '量子深紫 + 激光青 + 高能激发橙，硬核前沿光学风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#4A2C7A', secondary: '#1E7E8C', opposite: '#C85A32', source: 'manual' },
    boardSpec: {
      disciplineTag: '量子光子',
      journalRef: 'Phys. Rev. Applied · 前沿科技',
      paperHex: '#FBFAFE',
      inkHex: '#201B2E',
      mutedHex: '#5E5673',
      tintHex: '#EFEAF8',
      ruleHex: '#DDD5EC',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [56, 78, 90, 96, 84],
      chartLine: [30, 48, 70, 88, 92],
      tableHeaders: ['技术采纳构念', '路径 β (CR)', '效度检验'],
      tableRows: [
        ['相干保真度', '0.514 (7.82)', 'AVE=0.69'],
        ['产业生态协同', '0.326 (5.14)', 'HTMT<0.85'],
      ],
      tableNote: '面向超导量子、光通讯模块与科学仪器企业问卷。',
    },
    whenToUse: '适配量子信息产业化、激光精密加工、光电子器件、未来产业先导区与科研仪器国产替代调研。',
    keywords: ['配色样板', '量子', '光子', '激光', '光学', 'PhysRev', '未来产业'],
  },
  {
    id: 'palette-agri-seed-germplasm',
    kind: 'palette_board',
    label: '现代种业与育种·PlantCell 麦穗深绿与穗金',
    badge: '学科配色样板 · 现代种业',
    subnote: '麦穗深绿 + 丰收穗金 + 旱情红褐，南繁育种田野风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#245E3E', secondary: '#B88E28', opposite: '#A84432', source: 'manual' },
    boardSpec: {
      disciplineTag: '种业育种',
      journalRef: 'Plant Cell / 中国农业科学 · 种业安全',
      paperHex: '#FAFBF8',
      inkHex: '#1C2920',
      mutedHex: '#526356',
      tintHex: '#EAF3EC',
      ruleHex: '#D0E0D4',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [66, 84, 92, 78, 88],
      chartLine: [42, 60, 74, 80, 90],
      tableHeaders: ['良种推广维度', 'PSM 净效应', '稳健检验'],
      tableRows: [
        ['抗逆耐盐稻', '+14.8% (0.03)', 'p<0.001'],
        ['社会化繁育', '+9.2% (0.04)', 'p=0.008'],
      ],
      tableNote: '基于南繁制种基地与种植大户配对田野数据。',
    },
    whenToUse: '适配种质资源保护、生物育种商业化、南繁硅谷调研、盐碱地良种推广与农业科技特派员评估。',
    keywords: ['配色样板', '种业', '育种', '种质', '良种', '南繁', 'PlantCell'],
  },
  {
    id: 'palette-behavioral-nudge-amber',
    kind: 'palette_board',
    label: '行为经济与助推实验·QJE 决策琥珀与理性灰蓝',
    badge: '学科配色样板 · 行为助推',
    subnote: '决策琥珀 + 理性灰蓝 + 默认绿，随机对照田野实验风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#B85D19', secondary: '#2C5270', opposite: '#2B7A69', source: 'manual' },
    boardSpec: {
      disciplineTag: '行为助推',
      journalRef: 'QJE / 心理科学进展 · RCT 田野实验',
      paperHex: '#FCFBF8',
      inkHex: '#26211C',
      mutedHex: '#635A52',
      tintHex: '#F7EFE6',
      ruleHex: '#E4D8CA',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [48, 76, 88, 66, 82],
      chartLine: [34, 52, 68, 74, 86],
      tableHeaders: ['助推干预组别', 'LATE 估计值', '置换检验'],
      tableRows: [
        ['社会规范提示', '+0.284***', 'RI p=0.001'],
        ['默认选项框架', '+0.356***', 'RI p<0.001'],
      ],
      tableNote: '双盲随机实验 Randomization Inference 稳健输出。',
    },
    whenToUse: '适配行为助推 (Nudge)、信息框架效应实验、垃圾分类/光盘/绿色储蓄默认选项 RCT 田野实验研究。',
    keywords: ['配色样板', '行为经济', '助推', 'Nudge', 'RCT', '实验', 'QJE'],
  },
  {
    id: 'palette-demography-migration-ochre',
    kind: 'palette_board',
    label: '人口迁移与城镇化·人口研究 迁徙赭石与都市青灰',
    badge: '学科配色样板 · 人口迁徙',
    subnote: '迁徙赭石 + 都市青灰 + 回流绿，七普流动人口桑基风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#964728', secondary: '#3B6278', opposite: '#35785E', source: 'manual' },
    boardSpec: {
      disciplineTag: '人口迁徙',
      journalRef: '人口研究 / 地理学报 · 户籍与城镇化',
      paperHex: '#FCF9F6',
      inkHex: '#261E1B',
      mutedHex: '#655751',
      tintHex: '#F4EAE5',
      ruleHex: '#E1D4CD',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [60, 74, 90, 82, 68],
      chartLine: [44, 56, 70, 78, 66],
      tableHeaders: ['迁移居留意愿', 'Logit OR 值', '95% CI'],
      tableRows: [
        ['随迁子女入学', '2.18***', '[1.72, 2.76]'],
        ['县域就地城镇', '1.64**', '[1.24, 2.17]'],
      ],
      tableNote: '跨县流动人口市民化与青年返乡创业队列追踪。',
    },
    whenToUse: '适配农民工市民化、青年返乡入乡创业、都市圈人口虹吸与县城就地城镇化、落户积分政策调研。',
    keywords: ['配色样板', '人口迁移', '流动人口', '城镇化', '户籍', '返乡', '人口研究'],
  },
  {
    id: 'palette-sinology-archaeology-bronze',
    kind: 'palette_board',
    label: '考古简牍与古籍修复·考古学报 青铜黛绿与朱砂印红',
    badge: '学科配色样板 · 考古简牍',
    subnote: '青铜黛绿 + 朱砂印红 + 简牍熟宣金，金石典籍厚重风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#2E5955', secondary: '#9E3B2B', opposite: '#B88C32', source: 'manual' },
    boardSpec: {
      disciplineTag: '考古简牍',
      journalRef: '考古学报 / 文物 · 中华典籍与口述史',
      paperHex: '#FBF9F2',
      inkHex: '#232421',
      mutedHex: '#5C5B53',
      tintHex: '#EAEFEA',
      ruleHex: '#D6D8CE',
      typographyScale: '标题黑体 / 仿宋正文 / Times 数字',
      chartBars: [72, 86, 68, 92, 80],
      chartLine: [36, 54, 64, 78, 88],
      tableHeaders: ['典籍活化路径', '认知留存率', '传播增益'],
      tableRows: [
        ['智能多光谱缀合', '89.4% ± 3.1', '+42.6%'],
        ['田野考古研学', '76.8% ± 4.4', '+28.3%'],
      ],
      tableNote: '面向遗址公园研学、简帛数字化与古籍修复师调研。',
    },
    whenToUse: '适配遗址考古研学、地方志口述史抢救、古籍与简牍数字化活化、非遗传统工艺谱系调研。',
    keywords: ['配色样板', '考古', '简牍', '古籍', '青铜', '文物', '口述史'],
  },
  {
    id: 'palette-disaster-resilience-command',
    kind: 'palette_board',
    label: '应急管理与韧性城市·RiskAnalysis 预警砖红与指挥深蓝',
    badge: '学科配色样板 · 应急韧性',
    subnote: '预警砖红 + 指挥深蓝 + 冗余琥珀，全灾种响应仪表盘风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#A83232', secondary: '#1D4E78', opposite: '#C4821D', source: 'manual' },
    boardSpec: {
      disciplineTag: '应急韧性',
      journalRef: 'Risk Analysis / 中国减灾 · 灾害韧性',
      paperHex: '#FCF9F9',
      inkHex: '#241B1C',
      mutedHex: '#625355',
      tintHex: '#F6EBEB',
      ruleHex: '#E3D3D4',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [84, 62, 92, 76, 88],
      chartLine: [48, 70, 82, 78, 94],
      tableHeaders: ['基层防灾指标', '风险衰减 β', '95% CI'],
      tableRows: [
        ['5分钟避险圈', '-0.428***', '[-0.53,-0.32]'],
        ['网格预警直达', '-0.315***', '[-0.41,-0.22]'],
      ],
      tableNote: '基于极值天气社区避险演练与应急物资冗余评估。',
    },
    whenToUse: '适配洪涝地质灾害基层响应、城市生命线韧性评估、防灾减灾宣教演练与社区应急包普及调研。',
    keywords: ['配色样板', '应急管理', '韧性城市', '防灾', '减灾', '避险', 'RiskAnalysis'],
  },
  {
    id: 'palette-biomed-neuroscience-cobalt',
    kind: 'palette_board',
    label: '生物医学与神经影像钴蓝高对比色板',
    badge: '学科配色样板 · 神经影像',
    subnote: '深邃钴蓝 + 脑电青碧 + 激活赤橙，脑影像高对比刊印风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#1A438A', secondary: '#0E8A8D', opposite: '#D45B2C', source: 'manual' },
    boardSpec: {
      disciplineTag: '神经影像',
      journalRef: 'Brain / NeuroImage · 多模态脑影像',
      paperHex: '#F9FBFE',
      inkHex: '#142038',
      mutedHex: '#52627A',
      tintHex: '#E8EFFA',
      ruleHex: '#CFD9E8',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [54, 78, 92, 84, 68],
      chartLine: [30, 52, 74, 82, 64],
      tableHeaders: ['脑区功能连接', 't 统计量', 'FDR p'],
      tableRows: [
        ['前额叶—海马体', '4.86*** (0.14)', '<0.001'],
        ['默认网络静息态', '2.94** (0.18)', '0.004'],
      ],
      tableNote: '经头动回归与 FDR 多重比较校正，体素阈 p<0.001。',
    },
    whenToUse: '适配脑科学、认知神经成像、生物医学工程仪器、医疗影像辅助诊断及神经退行性慢病调研。',
    keywords: ['配色样板', '生物医学', '神经影像', 'Brain', 'NeuroImage', '钴蓝'],
  },
  {
    id: 'palette-aerospace-orbital-titanium',
    kind: 'palette_board',
    label: '航天遥感与轨道工程钛灰深空色板',
    badge: '学科配色样板 · 航天遥感',
    subnote: '钛灰深空 + 遥感青蓝 + 轨迹橙，卫星测控冷峻工程风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#2B3A4A', secondary: '#1F7A9E', opposite: '#D97228', source: 'manual' },
    boardSpec: {
      disciplineTag: '航天遥感',
      journalRef: 'JGCD / RSE · 卫星遥感与轨道',
      paperHex: '#F8FAFC',
      inkHex: '#16202A',
      mutedHex: '#52606D',
      tintHex: '#EBF0F4',
      ruleHex: '#CDD6DF',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [60, 82, 94, 88, 74],
      chartLine: [76, 62, 46, 32, 24],
      tableHeaders: ['轨道/遥感工况', 'RMS 误差', '信噪比'],
      tableRows: [
        ['多源SAR融合反演', '0.42 m ± 0.06', '28.4 dB'],
        ['单星光学推扫组', '1.18 m ± 0.14', '21.6 dB'],
      ],
      tableNote: '基于 J2000 惯性系轨道外推与地面定标场实测校验。',
    },
    whenToUse: '适配商业航天、卫星遥感测绘、低轨通信星座、农林灾情遥感反演与航空制造调研。',
    keywords: ['配色样板', '航天遥感', '轨道工程', '商业航天', '钛灰', '深空蓝'],
  },
  {
    id: 'palette-fintech-crypto-emerald',
    kind: 'palette_board',
    label: '金融科技与量化风控深祖母绿色板',
    badge: '学科配色样板 · 量化风控',
    subnote: '深祖母绿 + 清算钢青 + 欺诈告警橙，金融稳健风控风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0B5D4B', secondary: '#1F6E8C', opposite: '#C96A26', source: 'manual' },
    boardSpec: {
      disciplineTag: '量化风控',
      journalRef: 'J. FinTech / 金融研究 · 欺诈与信用',
      paperHex: '#F8FBF9',
      inkHex: '#142621',
      mutedHex: '#4D645D',
      tintHex: '#E6F3EE',
      ruleHex: '#C9DDD5',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [66, 84, 92, 76, 88],
      chartLine: [34, 52, 70, 84, 90],
      tableHeaders: ['风控识别模型', 'KS / AUC', '误杀率'],
      tableRows: [
        ['图神经网络联防', '0.68 / 0.942', '0.84%'],
        ['传统规则评分卡', '0.49 / 0.836', '2.65%'],
      ],
      tableNote: '跨时间样本外滚动回测 OOT 验证，置信水平 95%。',
    },
    whenToUse: '适配数字普惠金融、反洗钱与反欺诈风控、绿色供应链金融、数字人民币采纳及量化定价研究。',
    keywords: ['配色样板', '金融科技', '量化风控', '数字金融', '祖母绿', '反欺诈'],
  },
  {
    id: 'palette-law-antitrust-slate',
    kind: 'palette_board',
    label: '法学实证与反垄断规制石板金边色板',
    badge: '学科配色样板 · 法学实证',
    subnote: '法典石板灰 + 司法鎏金 + 违约警示红，庄重法政裁判风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#334155', secondary: '#8B5E2A', opposite: '#9E3232', source: 'manual' },
    boardSpec: {
      disciplineTag: '法学实证',
      journalRef: '法学研究 / JELS · 规制与裁判',
      paperHex: '#FCFAF6',
      inkHex: '#1E242B',
      mutedHex: '#5B636E',
      tintHex: '#ECEFF3',
      ruleHex: '#D4D8DF',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [58, 76, 86, 72, 90],
      chartLine: [36, 48, 64, 72, 80],
      tableHeaders: ['规制合规维度', 'DID 净效应', '稳健 p'],
      tableRows: [
        ['算法杀熟强规制', '-0.318*** (0.06)', '<0.001'],
        ['平台透明披露令', '-0.194** (0.07)', '0.006'],
      ],
      tableNote: '基于裁判文书文本编码与省份—年份双向固定效应。',
    },
    whenToUse: '适配法学实证、平台反垄断规制、数据要素确权、知识产权司法保护与合规营商环境调查。',
    keywords: ['配色样板', '法学实证', '反垄断', '平台规制', '石板灰', '鎏金'],
  },
  {
    id: 'palette-sports-biomech-vermilion',
    kind: 'palette_board',
    label: '体育运动生物力学与竞技遥测朱砂色板',
    badge: '学科配色样板 · 运动力学',
    subnote: '竞技朱砂 + 遥测深蓝 + 恢复翡翠，高张力动态测力风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#B83A2D', secondary: '#1D5C78', opposite: '#2A7F62', source: 'manual' },
    boardSpec: {
      disciplineTag: '运动力学',
      journalRef: 'J. Biomech. / 体育科学 · 竞技遥测',
      paperHex: '#FCF9F8',
      inkHex: '#241B1A',
      mutedHex: '#635553',
      tintHex: '#F8EAE8',
      ruleHex: '#E3D1CE',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [74, 88, 94, 68, 82],
      chartLine: [40, 66, 82, 76, 88],
      tableHeaders: ['步态/动作参数', 'ICC 组内相关', '损伤风险'],
      tableRows: [
        ['惯性传感协同纠', '0.924 [0.88,0.95]', '-34.2%'],
        ['常规目测动作组', '0.741 [0.64,0.82]', '-11.5%'],
      ],
      tableNote: '同步三维测力台 1000 Hz 采样与表面肌电信号标定。',
    },
    whenToUse: '适配体育产业消费、青少年体质监测、马拉松/冰雪运动伤害防护、智能穿戴健身与康复生物力学调研。',
    keywords: ['配色样板', '体育科学', '生物力学', '竞技遥测', '朱砂红', '运动康复'],
  },
  {
    id: 'palette-linguistics-corpus-indigo',
    kind: 'palette_board',
    label: '计算语言学与多语语料库靛青色板',
    badge: '学科配色样板 · 语料计算',
    subnote: '语料靛青 + 句法松青 + 歧义赤橙，多语对齐文本风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#2D3A8C', secondary: '#1B7F79', opposite: '#C75B2B', source: 'manual' },
    boardSpec: {
      disciplineTag: '语料计算',
      journalRef: 'ACL / CL / 中国语文 · 多语语料',
      paperHex: '#FAF9FD',
      inkHex: '#1B1E33',
      mutedHex: '#565C78',
      tintHex: '#EBEDF8',
      ruleHex: '#D2D6EB',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [62, 80, 90, 86, 74],
      chartLine: [38, 56, 74, 80, 86],
      tableHeaders: ['语料对齐模型', 'COMET / BLEU', '熵值 H'],
      tableRows: [
        ['方言语义桥接', '86.4 / 41.2', '1.42'],
        ['通用词表直译', '74.8 / 33.6', '2.18'],
      ],
      tableNote: '跨语种语料抽样配对与人工双盲流利度检验均值。',
    },
    whenToUse: '适配计算语言学、方言保护数字化、跨境多语机器翻译质量评估、社交媒体话语分析与古汉语语料库研究。',
    keywords: ['配色样板', '计算语言学', '多语语料', 'ACL', '方言数字化', '靛青'],
  },
  {
    id: 'palette-forestry-watershed-moss',
    kind: 'palette_board',
    label: '林学流域水土保持与林下经济苔藓绿板',
    badge: '学科配色样板 · 林学流域',
    subnote: '林冠苔藓绿 + 林下枯金 + 侵蚀赤褐，生态流域样方风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#2C5E3B', secondary: '#7A6832', opposite: '#B84A27', source: 'manual' },
    boardSpec: {
      disciplineTag: '林学流域',
      journalRef: 'For. Ecol. Mgmt. / 林业科学 · 流域',
      paperHex: '#FAFBF7',
      inkHex: '#1E2720',
      mutedHex: '#556157',
      tintHex: '#EAF2EC',
      ruleHex: '#D1DBD3',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [56, 74, 88, 92, 80],
      chartLine: [78, 66, 52, 38, 28],
      tableHeaders: ['流域林分模式', '径流泥沙降', '户均增收'],
      tableRows: [
        ['混交林+林下菌药', '-58.4%***', '+1.62 万'],
        ['纯人工经济林基', '-24.2%*', '+0.74 万'],
      ],
      tableNote: '基于小流域径流小区观测站与林农林改入户问卷。',
    },
    whenToUse: '适配集体林权改革、林下经济（菌药禽）、小流域水土保持、森林碳汇交易与竹木产业替代调研。',
    keywords: ['配色样板', '林学', '水土保持', '林下经济', '森林碳汇', '苔藓绿'],
  },
  {
    id: 'palette-logistics-maritime-navy',
    kind: 'palette_board',
    label: '航运港口与跨境多式联运深海藏青板',
    badge: '学科配色样板 · 航运联运',
    subnote: '深海藏青 + 航道青碧 + 滞港告警橙，海铁港口运筹风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#13315C', secondary: '#1B7B8C', opposite: '#C95A2B', source: 'manual' },
    boardSpec: {
      disciplineTag: '航运联运',
      journalRef: 'Transp. Res. E · 港口多式联运',
      paperHex: '#F8FAFC',
      inkHex: '#122033',
      mutedHex: '#4D5F75',
      tintHex: '#E6EEF7',
      ruleHex: '#CAD6E5',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [64, 80, 92, 86, 74],
      chartLine: [74, 58, 44, 34, 26],
      tableHeaders: ['集疏运路径组', '标准箱能耗', '准班率'],
      tableRows: [
        ['海铁水公联运链', '-34.6%***', '94.8%'],
        ['纯公路集卡直疏', '基线高位', '82.4%'],
      ],
      tableNote: '基于港口集装箱电子放行与内陆无水港班列运单。',
    },
    whenToUse: '适配海港与内河港口枢纽、中欧班列与西部陆海新通道、跨境多式联运降本及绿色低碳航运调查。',
    keywords: ['配色样板', '航运港口', '多式联运', '海铁联运', '深海藏青', '绿色航运'],
  },
  {
    id: 'palette-geology-mineral-terracotta',
    kind: 'palette_board',
    label: '地质矿产勘查与大地赤陶岩层色板',
    badge: '学科配色样板 · 地质矿产',
    subnote: '大地赤陶 + 岩层玄武灰 + 矿脉硫金，岩心剖面与地质勘查风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#9A3B26', secondary: '#364958', opposite: '#C48B28', source: 'manual' },
    boardSpec: {
      disciplineTag: '地质矿产',
      journalRef: 'Geology / 岩石学报 · 岩层勘查',
      paperHex: '#FCF9F6',
      inkHex: '#261D1A',
      mutedHex: '#665852',
      tintHex: '#F6EAE6',
      ruleHex: '#E2D4CE',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [54, 78, 92, 84, 68],
      chartLine: [32, 50, 74, 82, 66],
      tableHeaders: ['成矿地层单元', '品位 / 置信度', '异常 κ'],
      tableRows: [
        ['斑岩铜钼矿脉', '0.84% ± 0.09', '3.62***'],
        ['浅表氧化铁帽', '0.41% ± 0.06', '2.14**'],
      ],
      tableNote: '基于钻孔岩心 XRF 谱系与克里金空间插值估计。',
    },
    whenToUse: '适配地质矿产勘查、关键矿产供应链安全、矿山生态修复、地热资源开发及土壤重金属空间分布调研。',
    keywords: ['配色样板', '地质矿产', '岩层', '赤陶', '勘查', '矿产资源', 'Geology'],
  },
  {
    id: 'palette-astronomy-deepfield-obsidian',
    kind: 'palette_board',
    label: '深空天文观测与射电光谱曜石金色板',
    badge: '学科配色样板 · 深空天文',
    subnote: '曜石深玄 + 射电天青 + 星云琥珀金，深空光谱与天体物理风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#1B2336', secondary: '#2A7B9B', opposite: '#D49B35', source: 'manual' },
    boardSpec: {
      disciplineTag: '深空天文',
      journalRef: 'ApJ / MNRAS · 射电光谱观测',
      paperHex: '#F8FAFD',
      inkHex: '#141A29',
      mutedHex: '#525D73',
      tintHex: '#EAEFF7',
      ruleHex: '#CDD5E4',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [60, 82, 94, 86, 72],
      chartLine: [28, 48, 72, 86, 92],
      tableHeaders: ['射电波段通道', '信噪比 S/N', '红移 z'],
      tableRows: [
        ['FAST L波段巡天', '42.6 ± 2.4', '0.084'],
        ['毫米波阵干涉', '28.9 ± 1.9', '0.312'],
      ],
      tableNote: '脉冲星与中性氢流量定标已扣除银河前景辐射。',
    },
    whenToUse: '适配深空探测科普、天文馆数字研学、空间科学基础设施产出评估及高端光学/射电精密仪器调研。',
    keywords: ['配色样板', '深空天文', '射电光谱', '曜石金', 'ApJ', '天文观测'],
  },
  {
    id: 'palette-architecture-bauhaus-ochre',
    kind: 'palette_board',
    label: '建筑学城乡风貌与包豪斯赭石砖瓦色板',
    badge: '学科配色样板 · 建筑风貌',
    subnote: '包豪斯赭石 + 清水混凝土灰 + 砖瓦朱红，结构模数与更新风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#B36A2E', secondary: '#3B4A54', opposite: '#A63D33', source: 'manual' },
    boardSpec: {
      disciplineTag: '建筑风貌',
      journalRef: '建筑学报 / JSAH · 包豪斯与更新',
      paperHex: '#FCF9F4',
      inkHex: '#24201C',
      mutedHex: '#615A53',
      tintHex: '#F6ECE3',
      ruleHex: '#E0D5C8',
      typographyScale: '标题黑体 / 仿宋正文 / Times 数字',
      chartBars: [68, 86, 76, 92, 80],
      chartLine: [38, 56, 68, 80, 74],
      tableHeaders: ['街区更新模式', '空间活力分', '能耗降'],
      tableRows: [
        ['微更新+低能耗', '4.48 ± 0.44', '-31.6%'],
        ['常规立面整修', '3.72 ± 0.61', '-12.4%'],
      ],
      tableNote: '结合空间句法可达性与居民热舒适实测。',
    },
    whenToUse: '适配城市老旧小区微更新、历史风貌保护、绿色超低能耗建筑、乡村民居风貌营造与适老建筑调研。',
    keywords: ['配色样板', '建筑学', '城乡风貌', '包豪斯', '赭石', '城市更新'],
  },
  {
    id: 'palette-psychology-affect-plum',
    kind: 'palette_board',
    label: '实验心理学情感认知与梅紫对比色板',
    badge: '学科配色样板 · 实验心理',
    subnote: '沉思梅紫 + 稳健青石 + 唤醒珊瑚橙，情绪效价与认知负荷风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#6E2E68', secondary: '#2A6B78', opposite: '#D1643A', source: 'manual' },
    boardSpec: {
      disciplineTag: '实验心理',
      journalRef: 'Psych. Sci. / 心理学报 · 情感认知',
      paperHex: '#FCF9FC',
      inkHex: '#251924',
      mutedHex: '#635262',
      tintHex: '#F4EBF3',
      ruleHex: '#DFD1DF',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [56, 78, 90, 70, 84],
      chartLine: [34, 58, 76, 64, 82],
      tableHeaders: ['情感效价条件', '反应时 RT', "Cohen's d"],
      tableRows: [
        ['正向共情唤醒', '542 ms ± 48', '0.78***'],
        ['高认知负荷组', '718 ms ± 64', '0.52**'],
      ],
      tableNote: '2×2 被试内重复测量方差分析，偏 η²=0.24。',
    },
    whenToUse: '适配实验心理学行为范式、情绪消费唤醒、青少年心理健康筛查、人机交互认知负荷与眼动/量表调研。',
    keywords: ['配色样板', '实验心理学', '情感认知', '梅紫', '心理学报', '反应时'],
  },
  {
    id: 'palette-chemistry-catalysis-teal',
    kind: 'palette_board',
    label: '计算化学反应动力学与催化青碧色板',
    badge: '学科配色样板 · 计算化学',
    subnote: '催化青碧 + 轨道钴蓝 + 过渡态赤，势能面与反应能垒风',
    aspect: 'specimen',
    accent: 'teal',
    palette: { schema: 'FigurePalette/v1', primary: '#0E6B6B', secondary: '#28528C', opposite: '#C85232', source: 'manual' },
    boardSpec: {
      disciplineTag: '计算化学',
      journalRef: 'J. Catal. / 物理化学学报 · 动力学',
      paperHex: '#F8FCFC',
      inkHex: '#142426',
      mutedHex: '#4D6264',
      tintHex: '#E6F4F4',
      ruleHex: '#C9DFE0',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [50, 72, 90, 82, 94],
      chartLine: [80, 64, 48, 36, 26],
      tableHeaders: ['反应路径步骤', '能垒 ΔG (eV)', '转化 TOF'],
      tableRows: [
        ['双位点协同TS1', '0.42 ± 0.03', '184 /h'],
        ['单核常规过渡', '0.89 ± 0.05', '46 /h'],
      ],
      tableNote: 'DFT (PBE-D3) 自由能校正温度 298.15 K。',
    },
    whenToUse: '适配计算化学、绿色化工催化转化、精细化学品替代、碳捕集反应工程与实验室自动化研发效能调研。',
    keywords: ['配色样板', '计算化学', '反应动力学', '催化', '青碧', 'DFT'],
  },
  {
    id: 'palette-education-pedagogy-sky',
    kind: 'palette_board',
    label: '教育科学学业追踪与天青晴空色板',
    badge: '学科配色样板 · 教育追踪',
    subnote: '天青晴空 + 成长青绿 + 预警暖琥，学业增值与教育追踪风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#1B6CA8', secondary: '#2B8A6E', opposite: '#D47A2A', source: 'manual' },
    boardSpec: {
      disciplineTag: '教育追踪',
      journalRef: '教育研究 / Rev. Educ. Res. · 增值',
      paperHex: '#F8FBFE',
      inkHex: '#162433',
      mutedHex: '#526475',
      tintHex: '#E8F2FA',
      ruleHex: '#CDE0EE',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [58, 72, 84, 92, 86],
      chartLine: [36, 52, 66, 78, 88],
      tableHeaders: ['学业追踪层级', '增值斜率 β', 'ICC 占比'],
      tableRows: [
        ['智慧个性化导学', '0.418*** (0.04)', '0.164'],
        ['常规大班讲授', '0.184** (0.05)', '0.112'],
      ],
      tableNote: '三期纵向追踪跨层生长曲线模型 (HLM) 估计。',
    },
    whenToUse: '适配义务教育均衡、县域高中振兴、智慧课堂学业增值评估、职业教育产教融合与大学生就业追踪调研。',
    keywords: ['配色样板', '教育科学', '学业追踪', '天青晴空', '教育研究', '增值评估'],
  },
  {
    id: 'palette-history-chronicle-sepia',
    kind: 'palette_board',
    label: '历史档案计量与棕褐典籍活页色板',
    badge: '学科配色样板 · 历史档案',
    subnote: '典籍棕褐 + 档案墨青 + 朱批印红，近代史计量与活页方志风',
    aspect: 'specimen',
    accent: 'burgundy',
    palette: { schema: 'FigurePalette/v1', primary: '#6F4E37', secondary: '#2F5C66', opposite: '#A83C32', source: 'manual' },
    boardSpec: {
      disciplineTag: '历史档案',
      journalRef: '历史研究 / Cliometrica · 档案计量',
      paperHex: '#FBF8F1',
      inkHex: '#28211B',
      mutedHex: '#665B50',
      tintHex: '#F3ECE2',
      ruleHex: '#DFD5C5',
      typographyScale: '标题黑体 / 仿宋正文 / Times 数字',
      chartBars: [52, 70, 86, 90, 74],
      chartLine: [34, 48, 68, 78, 84],
      tableHeaders: ['方志档案分期', '事件频次比', '稳健 p'],
      tableRows: [
        ['数字索引全文库', '0.364*** (0.05)', '<0.001'],
        ['传统手工摘抄组', '0.148* (0.06)', '0.018'],
      ],
      tableNote: '基于地方志文本 OCR 校勘与百年长时段面板。',
    },
    whenToUse: '适配经济史长时段计量、红色档案与家书口述史整理、地方志数字化检索利用及文化遗产历史谱系调研。',
    keywords: ['配色样板', '历史档案', '档案计量', '棕褐', '典籍活页', '地方志'],
  },
  {
    id: 'palette-materials-polymer-steel',
    kind: 'palette_board',
    label: '材料科学高分子表征与冷钢靛蓝板',
    badge: '学科配色样板 · 高分子材',
    subnote: '冷钢靛蓝 + 聚合青灰 + 应力失效橙，流变曲线与扫描电镜风',
    aspect: 'specimen',
    accent: 'blue',
    palette: { schema: 'FigurePalette/v1', primary: '#2B4C7E', secondary: '#46828E', opposite: '#C95B2B', source: 'manual' },
    boardSpec: {
      disciplineTag: '高分子材',
      journalRef: 'Macromolecules / 高分子学报 · 表征',
      paperHex: '#F8FAFC',
      inkHex: '#17212E',
      mutedHex: '#526173',
      tintHex: '#EAEFF6',
      ruleHex: '#CED7E4',
      typographyScale: '标题黑体 / 正文宋体 / Times 数字',
      chartBars: [64, 80, 92, 86, 74],
      chartLine: [30, 52, 74, 88, 78],
      tableHeaders: ['改性共聚配方', '拉伸模量 GPa', '断裂伸长'],
      tableRows: [
        ['交联纳米复合膜', '4.82 ± 0.18', '146%'],
        ['常规均聚对照膜', '2.94 ± 0.22', '82%'],
      ],
      tableNote: '同步 DMA 动态热机械分析与 DSC 玻璃化转变测试。',
    },
    whenToUse: '适配生物基可降解高分子、碳纤维复合材料、固态电池隔膜、医用聚合物材料产业化与供应链替代调研。',
    keywords: ['配色样板', '材料科学', '高分子', '表征', '冷钢靛蓝', 'Macromolecules'],
  },

  // ───────── 7. 44 Pure-SVG Track 2 Bento Editorial Infographic Example Plates (52 Bento total) ─────────
  {
    id: 'info-bento-low-altitude',
    kind: 'infographic',
    label: '低空无人机末端配送空域剖面与降本时效信息图',
    badge: '专题矢量信息图 · 低空物流',
    subnote: '空域起降走廊 + 跨江时效 KPI + 航线场景对比，支持一键联动色板并写入报告正文',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'low_altitude_logistics',
    targetNode: 'intro.background',
    whenToUse: '用于第 1 章研究背景或第 4 章场景刻画，清晰对比无人机末端即时配送与传统地面路网的时效及成本差。',
    keywords: ['低空经济', '无人机', '冷链物流', '纯矢量'],
  },
  {
    id: 'info-bento-llm-rag',
    kind: 'infographic',
    label: '行业知识问答事实核验与多跳检索增强双盲评测看板',
    badge: '专题矢量信息图 · 检索评测',
    subnote: '检索-重排-验真三段流水线 + 幻觉降幅/忠实度 KPI + 消融对照三线表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'llm_rag_eval',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于数智治理与知识问答系统评估报告，直观呈现混合重排与事实校验门控对降低失真率的实证贡献。',
    keywords: ['知识问答', 'RAG', '事实核验', '检索评测'],
  },
  {
    id: 'info-bento-ev-charging',
    kind: 'infographic',
    label: '新能源车主潮汐补能焦虑与分时电价响应画像板',
    badge: '专题矢量信息图 · 新能源',
    subnote: '峰谷分时负荷曲线 + 充电价格弹性读数 + 家充/超充/服务区触点占比',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'ev_charging_profile',
    targetNode: 'sample.profile',
    whenToUse: '面向新能源汽车基础设施与双碳消费行为调研，统筹呈现补能排队时长痛点与分时电价错峰引导效果。',
    keywords: ['新能源汽车', '充电桩', '分时电价', '用户画像'],
  },
  {
    id: 'info-bento-county-medical',
    kind: 'infographic',
    label: '紧密型县域医共体双向转诊与基层首诊率图谱',
    badge: '专题矢量信息图 · 医疗卫健',
    subnote: '县总院-乡镇院-村卫生室三级协同拓扑 + 县域内就诊率/检查互认 KPI 看板',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'county_medical_referral',
    targetNode: 'intro.background',
    whenToUse: '面向医药卫生改革、无陪护病房试点、县域医共体及公共卫健调查，宏观锚定分级诊疗转诊通畅度。',
    keywords: ['县域医共体', '分级诊疗', '基层首诊', '医疗'],
  },
  {
    id: 'info-bento-crossborder-loss',
    kind: 'infographic',
    label: '跨境电商选品—集货—海外仓全链履约损耗拆解卡',
    badge: '专题矢量信息图 · 跨境贸易',
    subnote: '产业带直发→海外仓→退换妥投漏斗 + 周转天数与退货诱因对标卡',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'crossborder_supply_loss',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '面向跨境直播电商、外贸产业带出海与海外仓韧性调查，逐环拆解滞销、破损与退换合规成本。',
    keywords: ['跨境电商', '海外仓', '供应链损耗', '外贸'],
  },
  {
    id: 'info-bento-grad-mismatch',
    kind: 'infographic',
    label: '青年就业预期偏差与新兴岗位技能错配四维画像',
    badge: '专题矢量信息图 · 就业教育',
    subnote: '岗课供需五维双层雷达对比 + 微证书起薪溢价 KPI + 培养方式对比三线表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'grad_skill_mismatch',
    targetNode: 'sample.profile',
    whenToUse: '面向大学生高质量就业、产教融合与职业技能培训调研，直观揭示岗位需求与人才供给的结构性落差。',
    keywords: ['青年就业', '技能错配', '产教融合', '教育'],
  },
  {
    id: 'info-bento-pocket-park',
    kind: 'infographic',
    label: '城市微更新“口袋公园”全龄友好度实测信息板',
    badge: '专题矢量信息图 · 城市更新',
    subnote: '绿冠遮阴适老坐凳平面图解 + 5 分钟可达覆盖率 + 适老夜间安全评分表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'pocket_park_renewal',
    targetNode: 'sample.descriptive',
    whenToUse: '面向城市 15 分钟生活圈、公园绿地公平性与社区适老化改造调查，一图呈现设施配置与居民留驻实证。',
    keywords: ['口袋公园', '城市更新', '适老化', '生活圈'],
  },
  {
    id: 'info-bento-synbio-pilot',
    kind: 'infographic',
    label: '合成生物绿色制造中试放大良率与碳减排效益看板',
    badge: '专题矢量信息图 · 新质生产力',
    subnote: '生物反应器×收率环形进度仪表 + 吨产品碳水降幅 KPI + 生物酶法工艺对照',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'synbio_pilot_kpi',
    targetNode: 'intro.background',
    whenToUse: '面向专精特新企业、合成生物制造与绿色化工转型调研，量化酶法工艺相比传统石化路线的减碳节水收益。',
    keywords: ['合成生物', '新质生产力', '绿色制造', '双碳'],
  },
  {
    id: 'info-bento-heritage-twin',
    kind: 'infographic',
    label: '古建文博三维激光扫描—病害识别—活化闭环信息图',
    badge: '专题矢量信息图 · 文旅非遗',
    subnote: '激光点云扫描木构轮廓 + 0.8mm 变形预警精度 KPI + AR 叙事云游复购对照',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'heritage_digital_twin',
    targetNode: 'plan.measures',
    whenToUse: '面向文化遗产数字化保护、古镇文旅转型与博物馆数智体验课题，贯通病害监测到内容活化的完整闭环。',
    keywords: ['数字孪生', '古建保护', '文旅非遗', '文博'],
  },
  {
    id: 'info-bento-smart-farmland',
    kind: 'infographic',
    label: '粮食主产区高标准农田滴灌节水与亩均增收效益卡',
    badge: '专题矢量信息图 · 乡村振兴',
    subnote: '墒情传感阀与田埂滴灌管网图解 + 节水率/托管采纳意愿 + 漫灌对比表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'smart_farmland_water',
    targetNode: 'plan.measures',
    whenToUse: '三农调研、高标准农田建设、农业社会化托管与节水灌溉政策评估报告。',
    keywords: ['高标准农田', '智慧农业', '三农', '节水灌溉'],
  },
  {
    id: 'info-bento-livestream-return',
    kind: 'infographic',
    label: '直播电商情绪唤起、冲动下单与退货归因拆解图',
    badge: '专题矢量信息图 · 消费心理',
    subnote: '促单情绪脉冲与七日退货回流曲线 + 高透明慢直播降退实验机制表',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'livestream_impulse_return',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '直播电商治理、消费者心理契约失衡与逆向物流退货率拆解调研。',
    keywords: ['直播电商', '冲动消费', '退货率', '心理契约'],
  },
  {
    id: 'info-bento-childcare-radius',
    kind: 'infographic',
    label: '社区嵌入式普惠托育 15 分钟服务半径与定价测算板',
    badge: '专题矢量信息图 · 生育民生',
    subnote: '12–15 分钟步行等时圈图解 + 家庭支付意愿均值 + 延时托管/师生比关切排名',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'community_childcare_radius',
    targetNode: 'plan.measures',
    whenToUse: '生育支持体系、嵌入式社区托育服务与双职工育儿供给侧改革报告。',
    keywords: ['普惠托育', '15分钟圈', '民生调查', '生育支持'],
  },
  {
    id: 'info-bento-silver-antifraud',
    kind: 'infographic',
    label: '银发数字金融反诈防线与适老交互家庭协同响应图谱',
    badge: '专题矢量信息图 · 银发反诈',
    subnote: '适老手机防护盾 + 15 分钟冷静延迟窗 + 亲情协防拦截与误转对照表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'silver_fintech_antifraud',
    targetNode: 'plan.measures',
    whenToUse: '用于第 9 章对策建议或适老化金融服务调研，直观呈现大额转账冷静期、适老界面降槛与亲情协同拦截的降损效能。',
    keywords: ['银发金融', '反诈防骗', '适老支付', '亲情监护'],
  },
  {
    id: 'info-bento-campus-mental-triage',
    kind: 'infographic',
    label: '高校心理健康三级筛查分流、匿名求助可达性与学业干预效能板',
    badge: '专题矢量信息图 · 心理筛查',
    subnote: '宿舍-学院-心中心三级分流漏斗 + 候诊时长锐减对照 + 匿名触达 KPI',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'campus_mental_triage',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '面向高校育人、青少年心理健康与校园公共服务评价，对比传统排号与匿名轻咨询分流在缩短候诊及降低脱落上的效应。',
    keywords: ['高校心理', '三级筛查', '匿名求助', '绩效评价'],
  },
  {
    id: 'info-bento-zerowaste-community',
    kind: 'infographic',
    label: '城市“无废社区”源头减量、再生资源两网融合与碳普惠闭环图',
    badge: '专题矢量信息图 · 无废社区',
    subnote: '源头分类—两网交投—碳积分闭环 + 分拣纯度/户均碳积分 KPI + 激励对标',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'zerowaste_circular_community',
    targetNode: 'plan.feasibility',
    whenToUse: '面向垃圾分类长效治理、零碳社区建设与居民低碳行动评估，测算两网融合与碳普惠积分激励的可行性收益。',
    keywords: ['无废社区', '两网融合', '垃圾分类', '碳普惠'],
  },
  {
    id: 'info-bento-coldchain-precool',
    kind: 'infographic',
    label: '生鲜农产品“田头预冷最先一公里”损耗拆解与冷库共享经济图谱',
    badge: '专题矢量信息图 · 冷链预冷',
    subnote: '田头预冷→冷藏干线→销地冷仓温降梯度 + 腐损降幅 KPI + 共享租用对照',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'rural_coldchain_precool',
    targetNode: 'diagnosis.problems',
    whenToUse: '用于第 7 章现存问题诊断或农业供应链课题，拆解采后常温滞留引发的断链损耗并量化移动预冷与共享冷库降损潜力。',
    keywords: ['田头预冷', '冷链物流', '生鲜损耗', '共享冷库'],
  },
  {
    id: 'info-bento-smart-port-customs',
    kind: 'infographic',
    label: '智慧港口无纸化通关、泊位周转效率与多式联运集疏运效能面板',
    badge: '专题矢量信息图 · 智慧港口',
    subnote: '远控岸桥直提与海铁集装箱联运图解 + 泊位停时/无纸放行率实证读数',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'smart_port_customs',
    targetNode: 'sample.descriptive',
    whenToUse: '面向航运物流、跨境口岸营商环境与多式联运实证分析，集中呈报泊位周转时效、单一窗口无纸化放行及海铁分担水平。',
    keywords: ['智慧港口', '无纸化通关', '多式联运', '集装箱'],
  },
  {
    id: 'info-bento-raredisease-insurance',
    kind: 'infographic',
    label: '罕见病高值创新药“基本医保+惠民保+慈善赠药”三重共付减负测算板',
    badge: '专题矢量信息图 · 医疗保障',
    subnote: '单一自费 vs 三重梯次共付堆叠图解 + 灾难性自付降幅与 PAP 衔接读数',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'raredisease_multitier_ins',
    targetNode: 'plan.priority',
    whenToUse: '面向多层次医保体系、惠民保可持续发展与罕见病用药保障调研，直观量化三重梯次共付对家庭自付门槛的削减幅度。',
    keywords: ['罕见病', '惠民保', '三重共付', '高值创新药'],
  },
  {
    id: 'info-bento-ai-reskilling-voucher',
    kind: 'infographic',
    label: '数智转型期职业技能再培训券、人机协同收入平滑与就业恢复板',
    badge: '专题矢量信息图 · 职业转型',
    subnote: '技能跨沟桥与薪资恢复曲线 + 培训券核销转化率 + 转岗空窗期缩短测算',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'ai_vocational_reskilling',
    targetNode: 'demand.willingness',
    whenToUse: '面向劳动经济、岗位数智化转型与职业技能培训意愿调研，呈现培训券补贴对跨过转型谷底与平滑薪资恢复的催化作用。',
    keywords: ['技能转型', '再培训券', '职业技能', '人机协同'],
  },
  {
    id: 'info-bento-natpark-coexistence',
    kind: 'infographic',
    label: '国家公园周边社区生态补偿、人兽冲突保险兜底与生态特许经营图谱',
    badge: '专题矢量信息图 · 生态保护',
    subnote: '保护地山峰廊道与社区保险兜底图解 + 赔付覆盖率/特许增收与冲突降幅',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'natpark_wildlife_coexist',
    targetNode: 'plan.measures',
    whenToUse: '面向国家公园治理、生物多样性保护与周边社区生计协调课题，统筹呈现生态廊道连通、肇事险兜底与特许经营共赢机制。',
    keywords: ['国家公园', '生态补偿', '人兽冲突', '特许经营'],
  },
  {
    id: 'info-bento-grid-v2g-storage',
    kind: 'infographic',
    label: '车网互动 V2G 削峰填谷与车主放电激励响应看板',
    badge: '专题矢量信息图 · 能源电力',
    subnote: '虚拟电厂削峰曲线 + 放电补贴阈值 KPI + 车主参与顾虑对比三线表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'grid_v2g_peak_shaving',
    targetNode: 'plan.feasibility',
    whenToUse: '新能源汽车与新型电力系统、虚拟电厂聚合调控及分时电价激励可行性测算章节。',
    keywords: ['V2G', '车网互动', '虚拟电厂', '削峰填谷'],
  },
  {
    id: 'info-bento-county-ecomm-cold',
    kind: 'infographic',
    label: '县乡村三级客货邮融合与统仓共配降本路径板',
    badge: '专题矢量信息图 · 县域物流',
    subnote: '县共配—客货邮班线—驻村自提拓扑 + 单票降本 KPI + 分散自派对照表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'rural_express_co_delivery',
    targetNode: 'plan.measures',
    whenToUse: '县域商业基础设施、农村寄递物流体系与农产品上行提速对策方案设计章节。',
    keywords: ['客货邮', '统仓共配', '农村物流', '县域商业'],
  },
  {
    id: 'info-bento-youth-night-school',
    kind: 'infographic',
    label: '城市青年夜校公共文化供给与错峰复用偏好板',
    badge: '专题矢量信息图 · 青年文化',
    subnote: '错峰空间复用与非遗美育图标 + 满班率/接受价 KPI + 商业培训对比表',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'youth_night_school_public',
    targetNode: 'demand.preference',
    whenToUse: '青年发展型城市、公共文化设施夜间错峰活化与市民文化消费偏好调查报告。',
    keywords: ['青年夜校', '公共文化', '错峰复用', '非遗美育'],
  },
  {
    id: 'info-bento-hospital-drg-pathway',
    kind: 'infographic',
    label: '公立医院 DRG/DIP 病组控费与临床质量均衡看板',
    badge: '专题矢量信息图 · 医保支付',
    subnote: '临床路径流+质费天平图解 + 次均降费/再入院率 KPI + 付费方式对照表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'drg_clinical_pathway_cost',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '公立医院绩效考核、DRG/DIP 医保支付方式改革评估与医患满意度均衡诊断。',
    keywords: ['DRG', 'DIP', '公立医院', '病组控费'],
  },
  {
    id: 'info-bento-semiconductor-fab',
    kind: 'infographic',
    label: '晶圆代工良率与国产 EDA 供应链韧性看板',
    badge: '专题矢量信息图 · 集成电路',
    subnote: '晶圆网格×EDA验证闭环 + 28nm良率/替换率 KPI + 流片协同对比表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'semiconductor_fab_yield',
    targetNode: 'drivers.model',
    whenToUse: '用于第 6 章影响因素分析或硬科技产业调研，直观呈报国产 EDA 与工艺套件协同及关键备件替代对良率爬坡的促进效应。',
    keywords: ['半导体', '晶圆代工', '国产EDA', '良率'],
  },
  {
    id: 'info-bento-ocean-blue-carbon',
    kind: 'infographic',
    label: '海洋牧场与红树林蓝碳交易生态效益看板',
    badge: '专题矢量信息图 · 海洋蓝碳',
    subnote: '红树林×贝藻固碳剖面 + 年固碳增幅/蓝碳溢价 KPI + 混养效益对比表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'ocean_blue_carbon_ranch',
    targetNode: 'sample.descriptive',
    whenToUse: '用于第 4 章现状描述或生态经济效益评估，统筹呈现红树林修复、深远海贝藻混养固碳量与渔户增收实证。',
    keywords: ['海洋牧场', '红树林', '蓝碳交易', '生态效益'],
  },
  {
    id: 'info-bento-embodied-robotics',
    kind: 'infographic',
    label: '具身智能人形机器人产线协同与工人技能重构看板',
    badge: '专题矢量信息图 · 具身智能',
    subnote: '机器人×产线×示教运维图解 + 节拍/工伤降幅 KPI + 产线模式对比表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'embodied_humanoid_factory',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于第 7 章绩效评估或先进制造业调研，评估具身机器人接管高危工位及产业工人向示教运维岗位转型的成效。',
    keywords: ['具身智能', '人形机器人', '产线协同', '技能重构'],
  },
  {
    id: 'info-bento-rural-elder-canteen',
    kind: 'infographic',
    label: '县域农村互助幸福院与长者助餐点可持续运营看板',
    badge: '专题矢量信息图 · 农村养老',
    subnote: '幸福院堂食×邻里送餐×微菜园图解 + 餐费/覆盖率 KPI + 运营模式表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'county_rural_canteen_elder',
    targetNode: 'sample.profile',
    whenToUse: '用于第 4 章受访结构描述或农村养老调研，对比单一财政兜底与微菜园造血、低龄互助积分模式的长期收支平衡率。',
    keywords: ['幸福院', '长者助餐', '农村养老', '互助养老'],
  },
  {
    id: 'info-bento-sponge-city-flood',
    kind: 'infographic',
    label: '极端暴雨下海绵城市内涝预警与 5 分钟避险圈看板',
    badge: '专题矢量信息图 · 韧性防涝',
    subnote: '下凹蓄滞绿地×智能水尺×5分钟避险圈图解 + 预警提前时长 KPI 看板',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'urban_flood_sponge_grid',
    targetNode: 'plan.measures',
    whenToUse: '用于第 9 章改进对策或城市应急减灾调研，直观呈现海绵设施蓄滞与电子水尺预警联动压缩内涝退水时长的作用。',
    keywords: ['海绵城市', '内涝预警', '避险圈', '极端暴雨'],
  },
  {
    id: 'info-bento-nanfan-seed-tech',
    kind: 'infographic',
    label: '生物育种南繁基地推广与盐碱地良种增产看板',
    badge: '专题矢量信息图 · 现代种业',
    subnote: '南繁分子加代×盐碱地亩产对照图解 + 增产/周期缩减 KPI + 品种表',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'agri_seed_nanfan_breeding',
    targetNode: 'drivers.model',
    whenToUse: '用于第 6 章影响因素建模或现代种业调研，量化分子加代育种与农技托管服务对盐碱地良种采纳及亩均增产的贡献。',
    keywords: ['生物育种', '南繁基地', '盐碱地', '良种增产'],
  },
  {
    id: 'info-bento-gig-social-security',
    kind: 'infographic',
    label: '新就业形态骑手职业伤害保障与弹性参保看板',
    badge: '专题矢量信息图 · 灵工社保',
    subnote: '按单触发×职伤盾×异地续保图解 + 覆盖率/理赔时效 KPI + 参保对照表',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'youth_flexible_gig_social',
    targetNode: 'sample.profile',
    whenToUse: '用于第 4 章人群画像或新就业形态劳动保障调研，揭示即时配送与网约骑手按单职伤险覆盖及跨区医保接续痛点。',
    keywords: ['新就业形态', '骑手', '职业伤害保障', '弹性参保'],
  },
  {
    id: 'info-bento-cross-prov-med',
    kind: 'infographic',
    label: '跨省异地就医直接结算与基层双向转诊减负看板',
    badge: '专题矢量信息图 · 跨省医保',
    subnote: '线上备案—跨省直结—下转康复闭环 + 直结率/垫资降幅 KPI 看板',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'cross_province_medical_settle',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于第 7 章政策评估或医保公共服务调研，集中呈现线上免跑腿备案、跨省联网直结减垫资及基层下转康复衔接成效。',
    keywords: ['跨省异地就医', '直接结算', '双向转诊', '医保减负'],
  },
  {
    id: 'info-bento-cbam-export',
    kind: 'infographic',
    label: '欧盟 CBAM 碳边境关税应对与出口绿电溯源看板',
    badge: '专题矢量信息图 · 碳关税',
    subnote: '工序碳足迹溯源→绿电直供降碳→CBAM 税负压降链路 + 碳费降幅 KPI 看板',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'cbam_green_export_compliance',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于第 7 章政策效应评估或外贸绿色转型调研，拆解欧盟 CBAM 碳边境调节冲击并量化绿电直供与数字碳账本减负效应。',
    keywords: ['CBAM', '碳边境关税', '出口绿电', '碳溯源'],
  },
  {
    id: 'info-bento-silver-ltci',
    kind: 'infographic',
    label: '长护险居家失能照护等级与辅具租赁响应画像',
    badge: '专题矢量信息图 · 长护险',
    subnote: '失能评定分级×居家上门工时×辅具 24h 租赁响应拓扑 + 自付降幅 KPI',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'silver_ltci_home_care',
    targetNode: 'sample.profile',
    whenToUse: '用于第 4 章人群画像或长期护理保险政策调研，呈现失能等级评定、居家上门护理与辅具快捷租赁协同减负实效。',
    keywords: ['长护险', '居家失能', '辅具租赁', '照护等级'],
  },
  {
    id: 'info-bento-microgrid-storage',
    kind: 'infographic',
    label: '园区光储充微电网峰谷套利与需量响应调度板',
    badge: '专题矢量信息图 · 光储充微网',
    subnote: '屋顶光伏—储能柜—直流微网母线联动削峰 + 峰值需量压降与 IRR 看板',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'smart_grid_micro_storage',
    targetNode: 'plan.feasibility',
    whenToUse: '用于第 8 章经济可行性测算或园区能源调研，量化屋顶光伏、储能削峰填谷与需量电费管理的综合投资回报周期。',
    keywords: ['光储充', '微电网', '峰谷套利', '需量响应'],
  },
  {
    id: 'info-bento-rural-live-cluster',
    kind: 'infographic',
    label: '县域农产品直播选品池、品控溯源与云仓履约协同图',
    badge: '专题矢量信息图 · 县域电商',
    subnote: '分级选品池→一物一码品控→县域云仓统发履约链路 + 退赔降幅 KPI 看板',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'rural_ecomm_live_cluster',
    targetNode: 'plan.measures',
    whenToUse: '用于第 9 章改进举措或县域电商产业带调研，阐明选品标准化、一物一码溯源与云仓统配如何协同压降直播退赔率。',
    keywords: ['县域电商', '农产品直播', '品控溯源', '云仓履约'],
  },
  {
    id: 'info-bento-robotaxi-trust',
    kind: 'infographic',
    label: '自动驾驶 Robotaxi 接管焦虑、人机交互信任与出行意愿图谱',
    badge: '专题矢量信息图 · 自动驾驶',
    subnote: '感知透明 HMI 屏—云端安全员冗余—接管焦虑压降演化 + 复乘意愿 KPI 看板',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'autonomous_robotaxi_trust',
    targetNode: 'demand.willingness',
    whenToUse: '用于第 5 章乘车意愿分析或智慧出行调研，解析乘客在复杂路况下的接管焦虑及行程感知透明界面带来的信任补偿。',
    keywords: ['自动驾驶', 'Robotaxi', '接管焦虑', '人机信任'],
  },
  {
    id: 'info-bento-ai-triage-safety',
    kind: 'infographic',
    label: '急诊智能预检分诊准确度、医生双签复核闭环与患者容错画像',
    badge: '专题矢量信息图 · 智慧急诊',
    subnote: '急诊主诉多源采集—智能预检分流—医生双签复核闭环 + 患者信任 KPI',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'hospital_ai_triage_safety',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于第 7 章服务质量评估或智慧医疗调研，衡量急诊智能预检提速与主治医生双签复核在降低漏判及提升患者信任上的协同效应。',
    keywords: ['急诊分诊', '智能预检', '医生复核', '患者容错'],
  },
  {
    id: 'info-bento-quantum-supply',
    kind: 'infographic',
    label: '量子计算测控硬件国产替代与算力云接入画像',
    badge: '专题矢量信息图 · 量子计算',
    subnote: '10mK 稀释制冷×多通道测控机柜×量子算力云接入拓扑 + 国产率/保真度 KPI 看板',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'quantum_computing_supply_chain',
    targetNode: 'drivers.model',
    whenToUse: '用于第 6 章影响机制建模或前沿硬科技调研，解析极低温稀释制冷与测控硬件国产替代对算力云接入成本及研发效率的驱动效应。',
    keywords: ['量子计算', '测控硬件', '国产替代', '算力云', '稀释制冷'],
  },
  {
    id: 'info-bento-green-hydrogen-port',
    kind: 'infographic',
    label: '绿氢氨醇海上能源走廊与港口加注基础设施看板',
    badge: '专题矢量信息图 · 绿氢航运',
    subnote: '海上风电电解制氢—绿氨甲醇港口储运—船对船加注全链 + 减碳率/LCOH 看板',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'green_hydrogen_port_corridor',
    targetNode: 'plan.feasibility',
    whenToUse: '用于第 8 章可行性测算或绿色航运能源调研，评估深远海风电制氢氨醇全链经济性与远洋港口加注设施投建盈亏平衡点。',
    keywords: ['绿氢', '绿氨甲醇', '能源走廊', '港口加注', '绿色航运'],
  },
  {
    id: 'info-bento-smart-rail-tod',
    kind: 'infographic',
    label: '都市圈市域快轨 TOD 站城一体开发与换乘体验图',
    badge: '专题矢量信息图 · 市域轨交',
    subnote: '站城复合开发×立体同台换乘×500m 活力等时圈 + 换乘耗时/通勤分担 KPI 看板',
    aspect: '16:9',
    accent: 'blue',
    bentoArchetype: 'smart_rail_transit_tod',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于第 7 章绩效诊断或都市圈交通规划调研，评估市域快轨与城市地铁同台换乘效率及 TOD 站城融合开发对通勤分担率的拉动。',
    keywords: ['市域快轨', 'TOD', '站城一体', '换乘体验', '都市圈'],
  },
  {
    id: 'info-bento-ecny-crossborder',
    kind: 'infographic',
    label: '数字人民币 mBridge 跨境清算渗透率与外贸降本画像',
    badge: '专题矢量信息图 · 跨境数币',
    subnote: '多边央行货币桥 PvP 原子直清×跳过多级代理行链路 + 清算时延/汇兑降费 KPI',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'digital_renminbi_crossborder',
    targetNode: 'demand.willingness',
    whenToUse: '用于第 5 章采纳意愿分析或跨境金融外贸调研，测度中小外贸企业接入数字人民币多边货币桥 (mBridge) 的费率弹性与时效偏好。',
    keywords: ['数字人民币', 'e-CNY', 'mBridge', '跨境清算', '外贸降本'],
  },
  {
    id: 'info-bento-precision-oncology',
    kind: 'infographic',
    label: '肿瘤精准伴随诊断医保共付可达性与基层渗透看板',
    badge: '专题矢量信息图 · 精准医疗',
    subnote: 'NGS 多基因伴随分型—药诊捆绑医保共付—县域冷链送检网络 + 基层可达 KPI',
    aspect: '16:9',
    accent: 'burgundy',
    bentoArchetype: 'precision_oncology_companion',
    targetNode: 'diagnosis.evaluation',
    whenToUse: '用于第 7 章现状评估或精准医疗保障调研，评估基因伴随诊断纳入医保共付后县域医院送检渗透率与靶向用药精准度的提升幅度。',
    keywords: ['伴随诊断', '精准肿瘤', 'NGS', '医保共付', '基层渗透'],
  },
  {
    id: 'info-bento-rural-water-twin',
    kind: 'infographic',
    label: '数字孪生灌区智能闸门配水效能与农户节水回报率',
    badge: '专题矢量信息图 · 孪生灌区',
    subnote: '卫星墒情感知—孪生动态配水—太阳能智能闸门控流闭环 + 节水率/增收回报 KPI',
    aspect: '16:9',
    accent: 'teal',
    bentoArchetype: 'rural_water_conservancy_twin',
    targetNode: 'plan.measures',
    whenToUse: '用于第 9 章对策建议或智慧水利三农调研，呈报数字孪生灌区按需精准配水在压降渠系渗漏损失与提升农户节水回报上的实效。',
    keywords: ['数字孪生', '灌区', '智能闸门', '精准配水', '农业节水'],
  },
];

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, ch => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return ch;
    }
  });
}

const DEFAULT_BOARD_SPEC: PaletteBoardSpecimen = {
  disciplineTag: '学术刊印',
  journalRef: '国奖出版视觉规范 · 1+1+1 克制色板',
  paperHex: '#FCFAF5',
  inkHex: '#212529',
  mutedHex: '#595959',
  tintHex: '#E7F3F1',
  ruleHex: '#D8D3C8',
  typographyScale: '标题黑体 / 正文宋体 / Times 数字',
  chartBars: [62, 84, 70, 92, 76],
  chartLine: [32, 48, 56, 72, 82],
  tableHeaders: ['统计检验维度', '参数估计值', '判定结论'],
  tableRows: [
    ['核心构念正向影响', '0.384*** (0.052)', '显著支撑'],
    ['基线协变量对照', '0.112* (0.048)', '稳健通过'],
  ],
  tableNote: '*** p < 0.001；全篇图标遵循同一语义色板。',
};

function academicHexColorName(hex: string, slot: 'primary' | 'secondary' | 'opposite' | 'tint' | 'paper' | 'ink'): string {
  if (slot === 'paper') return '宣白纸基';
  if (slot === 'ink') return '深岩浓墨';
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex.trim());
  if (!m) return slot === 'tint' ? '浅调底衬' : '学术专色';
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (slot === 'tint') {
    if (d < 0.06) return '云灰底衬';
    const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    const hue = (h + 360) % 360;
    if (hue >= 150 && hue < 205) return '冰青底衬';
    if (hue >= 205 && hue < 265) return '冰蓝底衬';
    if (hue >= 20 && hue < 70) return '暖米底衬';
    return '柔雾底衬';
  }
  if (d < 0.08) return l < 0.3 ? '玄石墨黑' : '石板冷灰';
  const rawHue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  const hue = (rawHue + 360) % 360;
  if (hue < 18 || hue >= 342) return l < 0.36 ? '学院绛红' : '朱砂丹红';
  if (hue < 38) return l < 0.42 ? '赤陶赭石' : '珊瑚暖橙';
  if (hue < 65) return l < 0.44 ? '琥珀鎏金' : '暖杏穗金';
  if (hue < 155) return l < 0.34 ? '松烟墨绿' : '沃野翠绿';
  if (hue < 198) return l < 0.36 ? '松石墨青' : '青碧天青';
  if (hue < 252) return l < 0.34 ? '学院靛蓝' : '晴空钴蓝';
  if (hue < 300) return '星曜靛紫';
  return '沉思绛紫';
}

function extractSubnoteColorTriplet(subnote: string): readonly [string, string, string] | null {
  const head = subnote.split(/[，,。]/u)[0] ?? '';
  const parts = head.split(/\s*\+\s*/u).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3 && parts.every(p => p.length <= 7)) {
    return [parts[0], parts[1], parts[2]];
  }
  return null;
}

/**
 * Renders a pure-SVG `360x228` Academic Discipline Semantic Palette & Layout Specimen Board
 * (`assertTrueVector` safe: zero `<style>`, `<filter>`, `<image>`, `url(`, or external refs).
 */
export function renderPaletteBoardSvg(item: VisualCatalogItem): string {
  const palette: FigurePalette = item.palette ?? {
    schema: 'FigurePalette/v1',
    primary: item.accent === 'blue' ? '#234E80' : item.accent === 'burgundy' ? '#8A3449' : '#0F766E',
    secondary: '#C99A3E',
    opposite: '#A65A3A',
    source: 'manual',
  };
  const spec = item.boardSpec ?? DEFAULT_BOARD_SPEC;

  const { primary, secondary, opposite } = palette;
  const { paperHex, inkHex, mutedHex, tintHex, ruleHex } = spec;
  const customTriplet = extractSubnoteColorTriplet(item.subnote);

  const swatches: ReadonlyArray<{ role: string; hex: string; name: string }> = [
    { role: '核心主色', hex: primary, name: customTriplet?.[0] ?? academicHexColorName(primary, 'primary') },
    { role: '辅助配色', hex: secondary, name: customTriplet?.[1] ?? academicHexColorName(secondary, 'secondary') },
    { role: '对冲强调', hex: opposite, name: customTriplet?.[2] ?? academicHexColorName(opposite, 'opposite') },
    { role: '浅调底衬', hex: tintHex, name: academicHexColorName(tintHex, 'tint') },
    { role: '纸面基底', hex: paperHex, name: academicHexColorName(paperHex, 'paper') },
    { role: '正文墨色', hex: inkHex, name: academicHexColorName(inkHex, 'ink') },
  ];

  const swatchMarkup = swatches
    .map((sw, idx) => {
      const x = 14 + idx * 56;
      return (
        `<rect x="${x}" y="46" width="52" height="24" rx="4" fill="${escapeXml(sw.hex)}" stroke="${escapeXml(ruleHex)}" stroke-width="0.7"/>`
        + `<rect x="${x}" y="46" width="52" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.16"/>`
        + `<text x="${x + 26}" y="80" font-family="sans-serif" font-size="6.4" font-weight="600" text-anchor="middle" fill="${escapeXml(inkHex)}">${escapeXml(sw.role)}</text>`
        + `<text x="${x + 26}" y="91" font-family="sans-serif" font-size="6.6" font-weight="600" text-anchor="middle" fill="${escapeXml(mutedHex)}">${escapeXml(sw.name)}</text>`
      );
    })
    .join('');

  const barCoords = [30, 56, 82, 108, 134];
  const chartBottom = 174;
  const maxBarH = 38;
  const barsMarkup = spec.chartBars
    .map((pct, i) => {
      const x = barCoords[i];
      const h1 = Math.max(8, Math.round((pct / 100) * maxBarH));
      const h2 = Math.max(6, Math.round((Math.max(24, pct - 18) / 100) * maxBarH));
      const y1 = chartBottom - h1;
      const y2 = chartBottom - h2;
      return (
        `<rect x="${x}" y="${y1}" width="8.5" height="${h1}" rx="1.5" fill="${escapeXml(primary)}" fill-opacity="0.90"/>`
        + `<rect x="${x + 9.5}" y="${y2}" width="8.5" height="${h2}" rx="1.5" fill="${escapeXml(secondary)}" fill-opacity="0.78"/>`
        + `<text x="${x + 9}" y="183" font-family="sans-serif" font-size="6.5" text-anchor="middle" fill="${escapeXml(mutedHex)}">F${i + 1}</text>`
      );
    })
    .join('');

  const linePts = spec.chartLine.map((pct, i) => {
    const cx = barCoords[i] + 9;
    const cy = chartBottom - Math.max(6, Math.round((pct / 100) * maxBarH));
    return { cx, cy };
  });
  const polylinePoints = linePts.map(p => `${p.cx},${p.cy}`).join(' ');
  const lineDots = linePts
    .map(p => `<circle cx="${p.cx}" cy="${p.cy}" r="2.3" fill="#FFFFFF" stroke="${escapeXml(opposite)}" stroke-width="1.4"/>`)
    .join('');

  const tableHeaderMarkup =
    `<text x="180" y="137" font-family="sans-serif" font-size="6.8" font-weight="700" text-anchor="start" fill="${escapeXml(primary)}">${escapeXml(spec.tableHeaders[0])}</text>`
    + `<text x="300" y="137" font-family="sans-serif" font-size="6.8" font-weight="700" text-anchor="end" fill="${escapeXml(primary)}">${escapeXml(spec.tableHeaders[1])}</text>`
    + `<text x="339" y="137" font-family="sans-serif" font-size="6.8" font-weight="700" text-anchor="end" fill="${escapeXml(primary)}">${escapeXml(spec.tableHeaders[2])}</text>`;

  const tableRowsMarkup = spec.tableRows
    .map((row, ri) => {
      const yText = ri === 0 ? 153 : 168;
      const rowBg =
        ri === 0
          ? `<rect x="179" y="143" width="161" height="14" rx="2" fill="${escapeXml(primary)}" fill-opacity="0.06"/>`
          : '';
      const valColor = ri === 0 ? primary : inkHex;
      const pColor = ri === 0 ? opposite : mutedHex;
      return (
        rowBg
        + `<text x="180" y="${yText}" font-family="sans-serif" font-size="6.5" text-anchor="start" fill="${escapeXml(inkHex)}">${escapeXml(row[0])}</text>`
        + `<text x="300" y="${yText}" font-family="monospace" font-size="6.4" text-anchor="end" fill="${escapeXml(valColor)}">${escapeXml(row[1])}</text>`
        + `<text x="339" y="${yText}" font-family="monospace" font-size="6.4" text-anchor="end" fill="${escapeXml(pColor)}">${escapeXml(row[2])}</text>`
      );
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 228" width="360" height="228" fill="none">`
    + `<rect x="0" y="0" width="360" height="228" rx="10" fill="${escapeXml(paperHex)}"/>`
    + `<rect x="0.5" y="0.5" width="359" height="227" rx="10" stroke="${escapeXml(ruleHex)}" stroke-width="1"/>`
    + `<rect x="14" y="10" width="332" height="2.5" rx="1.25" fill="${escapeXml(primary)}"/>`
    // Header strip
    + `<rect x="14" y="18" width="52" height="15" rx="4" fill="${escapeXml(primary)}" fill-opacity="0.12" stroke="${escapeXml(primary)}" stroke-opacity="0.35" stroke-width="0.8"/>`
    + `<text x="40" y="28.5" font-family="sans-serif" font-size="8" font-weight="700" text-anchor="middle" fill="${escapeXml(primary)}">${escapeXml(spec.disciplineTag)}</text>`
    + `<text x="73" y="28.5" font-family="sans-serif" font-size="8.6" font-weight="700" text-anchor="start" fill="${escapeXml(inkHex)}">${escapeXml(spec.journalRef)}</text>`
    + `<text x="346" y="28.5" font-family="sans-serif" font-size="7.2" text-anchor="end" fill="${escapeXml(mutedHex)}">三色联动样张</text>`
    + `<line x1="14" y1="39" x2="346" y2="39" stroke="${escapeXml(ruleHex)}" stroke-width="0.8"/>`
    // 6-Swatch strip
    + swatchMarkup
    + `<line x1="14" y1="99" x2="346" y2="99" stroke="${escapeXml(ruleHex)}" stroke-width="0.7" stroke-dasharray="2 2"/>`
    // Left: Mini sample Bar + Line chart
    + `<rect x="14" y="106" width="152" height="84" rx="6" fill="#FFFFFF" stroke="${escapeXml(ruleHex)}" stroke-width="0.8"/>`
    + `<text x="22" y="118" font-family="sans-serif" font-size="7.2" font-weight="700" fill="${escapeXml(inkHex)}">实证样本双维示例</text>`
    + `<circle cx="132" cy="115.5" r="2.5" fill="${escapeXml(primary)}"/>`
    + `<circle cx="142" cy="115.5" r="2.5" fill="${escapeXml(secondary)}"/>`
    + `<circle cx="152" cy="115.5" r="2.5" fill="${escapeXml(opposite)}"/>`
    + `<line x1="24" y1="136" x2="156" y2="136" stroke="${escapeXml(ruleHex)}" stroke-width="0.6"/>`
    + `<line x1="24" y1="155" x2="156" y2="155" stroke="${escapeXml(ruleHex)}" stroke-width="0.6"/>`
    + `<line x1="24" y1="${chartBottom}" x2="156" y2="${chartBottom}" stroke="${escapeXml(inkHex)}" stroke-width="0.9"/>`
    + barsMarkup
    + `<polyline points="${polylinePoints}" fill="none" stroke="${escapeXml(opposite)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    + lineDots
    // Right: Mini Booktabs 2-row snippet
    + `<rect x="172" y="106" width="174" height="84" rx="6" fill="#FFFFFF" stroke="${escapeXml(ruleHex)}" stroke-width="0.8"/>`
    + `<text x="180" y="118" font-family="sans-serif" font-size="7.2" font-weight="700" fill="${escapeXml(inkHex)}">学术三线表排版范式</text>`
    + `<line x1="179" y1="125" x2="340" y2="125" stroke="${escapeXml(inkHex)}" stroke-width="1.5"/>`
    + tableHeaderMarkup
    + `<line x1="179" y1="141" x2="340" y2="141" stroke="${escapeXml(inkHex)}" stroke-width="0.7"/>`
    + tableRowsMarkup
    + `<line x1="179" y1="175" x2="340" y2="175" stroke="${escapeXml(inkHex)}" stroke-width="1.5"/>`
    + `<text x="180" y="185" font-family="sans-serif" font-size="6.1" fill="${escapeXml(mutedHex)}">${escapeXml(spec.tableNote)}</text>`
    // Footer: Typography scale & FigurePalette sync badge
    + `<rect x="14" y="196" width="332" height="22" rx="5" fill="${escapeXml(primary)}" fill-opacity="0.07" stroke="${escapeXml(ruleHex)}" stroke-width="0.6"/>`
    + `<text x="22" y="210" font-family="sans-serif" font-size="7.5" font-weight="700" fill="${escapeXml(primary)}">字阶配比</text>`
    + `<text x="64" y="210" font-family="sans-serif" font-size="7.5" fill="${escapeXml(inkHex)}">${escapeXml(spec.typographyScale)}</text>`
    + `<text x="338" y="210" font-family="monospace" font-size="7" font-weight="600" text-anchor="end" fill="${escapeXml(secondary)}">学术三色规范</text>`
    + `</svg>`;

  return assertStrictOfficeVector(assertTrueVector(svg));
}

function specimenFontSize(text: string, maxWidthPx: number, basePx: number, minPx: number): number {
  let units = 0;
  for (const ch of text.trim()) {
    units += ch.charCodeAt(0) > 127 ? 1 : 0.56;
  }
  if (units <= 0) return basePx;
  return Math.max(minPx, Math.min(basePx, Math.floor((maxWidthPx / units) * 10) / 10));
}

/**
 * Renders a deterministic pure-SVG layout/palette publication specimen (`360x228`, `assertTrueVector` safe)
 * for any `VisualCatalogItem`. Delegates directly to `renderPaletteBoardSvg` for `palette_board` items
 * and `renderBentoInfographicSvg` for `bentoArchetype` infographics.
 */
export function renderVisualSpecSvg(item: VisualCatalogItem, paletteInk?: FigureInk): string {
  if (item.kind === 'palette_board') {
    return renderPaletteBoardSvg(item);
  }
  if (item.bentoArchetype) {
    return renderBentoInfographicSvg(item.bentoArchetype, item.label, paletteInk ?? item.palette ?? '#0F766E');
  }
  const fallbackInk: FigureInk = item.palette
    ?? (item.accent === 'blue' ? '#234E80' : item.accent === 'burgundy' ? '#8A3449' : '#0F766E');
  const c = deriveInkPalette(paletteInk ?? fallbackInk);

  const marginSwatches = [
    { role: '核心主色', hex: c.primary, name: academicHexColorName(c.primary, 'primary') },
    { role: '辅助配色', hex: c.secondary, name: academicHexColorName(c.secondary, 'secondary') },
    { role: '对冲强调', hex: c.opposite, name: academicHexColorName(c.opposite, 'opposite') },
  ]
    .map((sw, idx) => {
      const sy = 50 + idx * 24;
      return (
        `<rect x="21" y="${sy}" width="14" height="11" rx="2.5" fill="${escapeXml(sw.hex)}" stroke="${escapeXml(c.border)}" stroke-width="0.6"/>`
        + `<text x="39" y="${sy + 5.2}" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">${escapeXml(sw.role)}</text>`
        + `<text x="39" y="${sy + 11.4}" font-family="sans-serif" font-size="5.1" fill="${escapeXml(c.muted)}">${escapeXml(sw.name)}</text>`
      );
    })
    .join('');

  let specimen = '';
  if (item.kind === 'frame') {
    const isBotanical = item.id === 'frame-cand-a' || item.id === 'frame-academic-a4';
    const isFretwork = item.id === 'frame-cand-c';

    let cornerOrnaments = '';
    if (isBotanical) {
      cornerOrnaments =
        `<path d="M121,29 Q124,14 139,13" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="1"/>`
        + `<path d="M121,22 Q128,15 133,21 Q126,25 121,22 Z" fill="${escapeXml(c.primary)}" fill-opacity="0.75"/>`
        + `<circle cx="137" cy="15.5" r="1.4" fill="${escapeXml(c.opposite)}"/>`
        + `<path d="M239,29 Q236,14 221,13" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="1"/>`
        + `<path d="M239,22 Q232,15 227,21 Q234,25 239,22 Z" fill="${escapeXml(c.primary)}" fill-opacity="0.75"/>`
        + `<circle cx="223" cy="15.5" r="1.4" fill="${escapeXml(c.opposite)}"/>`
        + `<path d="M121,157 Q124,172 139,173" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="1"/>`
        + `<path d="M121,164 Q128,171 133,165 Q126,161 121,164 Z" fill="${escapeXml(c.primary)}" fill-opacity="0.75"/>`
        + `<path d="M239,157 Q236,172 221,173" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="1"/>`
        + `<path d="M239,164 Q232,171 227,165 Q234,161 239,164 Z" fill="${escapeXml(c.primary)}" fill-opacity="0.75"/>`;
    } else if (isFretwork) {
      cornerOrnaments =
        `<polyline points="122,28 122,14 136,14 136,19 127,19 127,25" fill="none" stroke="${escapeXml(c.primary)}" stroke-width="1.1"/>`
        + `<polyline points="238,28 238,14 224,14 224,19 233,19 233,25" fill="none" stroke="${escapeXml(c.primary)}" stroke-width="1.1"/>`
        + `<polyline points="122,158 122,172 136,172 136,167 127,167 127,161" fill="none" stroke="${escapeXml(c.primary)}" stroke-width="1.1"/>`
        + `<polyline points="238,158 238,172 224,172 224,167 233,167 233,161" fill="none" stroke="${escapeXml(c.primary)}" stroke-width="1.1"/>`
        + `<rect x="125" y="17" width="3" height="3" fill="${escapeXml(c.opposite)}"/>`
        + `<rect x="232" y="17" width="3" height="3" fill="${escapeXml(c.opposite)}"/>`;
    } else {
      cornerOrnaments =
        `<polygon points="118,10 135,10 118,27" fill="${escapeXml(c.primary)}" fill-opacity="0.88"/>`
        + `<polygon points="124,10 138,10 118,30 118,26" fill="${escapeXml(c.secondary)}"/>`
        + `<polygon points="242,10 225,10 242,27" fill="${escapeXml(c.primary)}" fill-opacity="0.88"/>`
        + `<polygon points="242,176 225,176 242,159" fill="${escapeXml(c.primary)}" fill-opacity="0.88"/>`
        + `<polygon points="118,176 135,176 118,159" fill="${escapeXml(c.primary)}" fill-opacity="0.88"/>`
        + `<polygon points="227,16 230,13 233,16 230,19" fill="${escapeXml(c.opposite)}"/>`;
    }

    const miniBars = [18, 25, 14, 28, 21]
      .map((bh, idx) => {
        const bx = 138 + idx * 17;
        const bh2 = Math.max(8, bh - 6);
        return (
          `<rect x="${bx}" y="${83 - bh}" width="5.5" height="${bh}" rx="0.8" fill="${escapeXml(c.primary)}"/>`
          + `<rect x="${bx + 6.5}" y="${83 - bh2}" width="5.5" height="${bh2}" rx="0.8" fill="${escapeXml(c.secondary)}"/>`
        );
      })
      .join('');

    const tableSpecimenRows = [
      ['核心处理', '0.384***', 'p&lt;0.001'],
      ['交互调节', '0.142**', 'p=0.008'],
      ['协变控制', '0.068', 'p=0.214'],
    ]
      .map(([vName, coef, pVal], idx) => {
        const ry = 122 + idx * 10;
        const rowFill = idx === 0
          ? `<rect x="131" y="${ry - 6.5}" width="98" height="8.5" rx="1" fill="${escapeXml(c.primarySoft)}" fill-opacity="0.65"/>`
          : '';
        return (
          rowFill
          + `<text x="133" y="${ry}" font-family="sans-serif" font-size="4.3" fill="${escapeXml(c.text)}">${vName}</text>`
          + `<text x="197" y="${ry}" font-family="monospace" font-size="4.3" font-weight="700" text-anchor="end" fill="${idx === 0 ? escapeXml(c.primary) : escapeXml(c.text)}">${coef}</text>`
          + `<text x="227" y="${ry}" font-family="monospace" font-size="4.2" text-anchor="end" fill="${idx === 0 ? escapeXml(c.opposite) : escapeXml(c.muted)}">${pVal}</text>`
        );
      })
      .join('');

    specimen =
      // Left specimen card
      `<rect x="14" y="24" width="94" height="136" rx="6" fill="${escapeXml(c.surface)}" stroke="${escapeXml(c.border)}" stroke-width="0.8"/>`
      + `<rect x="20" y="31" width="82" height="12" rx="3" fill="${escapeXml(c.primarySoft)}"/>`
      + `<text x="61" y="39" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${escapeXml(c.primary)}">A4 页框联动色板</text>`
      + marginSwatches
      + `<line x1="20" y1="123" x2="102" y2="123" stroke="${escapeXml(c.border)}" stroke-width="0.7"/>`
      + `<text x="21" y="133" font-family="sans-serif" font-size="5.2" font-weight="700" fill="${escapeXml(c.text)}">版心安全净空区</text>`
      + `<text x="21" y="142.5" font-family="sans-serif" font-size="4.9" fill="${escapeXml(c.muted)}">外缘 4%–6% 装饰纹</text>`
      + `<text x="21" y="151" font-family="sans-serif" font-size="4.9" fill="${escapeXml(c.muted)}">正文阅读区零干扰</text>`
      // Center A4 Page Specimen
      + `<rect x="121" y="13" width="124" height="166" rx="3" fill="${escapeXml(c.border)}" fill-opacity="0.55"/>`
      + `<rect x="118" y="10" width="124" height="166" rx="2.5" fill="${escapeXml(c.surface)}" stroke="${escapeXml(c.primary)}" stroke-width="1.4"/>`
      + `<rect x="124" y="16" width="112" height="154" rx="1.5" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="0.7"/>`
      + cornerOrnaments
      // Running header
      + `<text x="180" y="24" font-family="sans-serif" font-size="4.5" font-weight="600" text-anchor="middle" fill="${escapeXml(c.muted)}">第 4 章 实证模型与稳健性检验</text>`
      + `<line x1="131" y1="26.5" x2="229" y2="26.5" stroke="${escapeXml(c.primary)}" stroke-width="0.5" stroke-opacity="0.5"/>`
      // Reading canvas content: mini section + chart + 3-row Booktabs table
      + `<text x="131" y="34" font-family="sans-serif" font-size="4.9" font-weight="700" fill="${escapeXml(c.text)}">4.2 异质性检验与参数估计</text>`
      + `<rect x="131" y="36.5" width="94" height="1.6" rx="0.8" fill="${escapeXml(c.muted)}" fill-opacity="0.32"/>`
      + `<rect x="131" y="39.5" width="76" height="1.6" rx="0.8" fill="${escapeXml(c.muted)}" fill-opacity="0.24"/>`
      + `<rect x="131" y="44" width="98" height="46" rx="2" fill="${escapeXml(c.canvas)}" stroke="${escapeXml(c.border)}" stroke-width="0.5"/>`
      + `<text x="135" y="50.5" font-family="sans-serif" font-size="4.3" font-weight="700" fill="${escapeXml(c.text)}">图 4-1 组间异质性边际效应</text>`
      + `<line x1="135" y1="83" x2="224" y2="83" stroke="${escapeXml(c.axis)}" stroke-width="0.6"/>`
      + miniBars
      + `<polyline points="144,73 161,66 178,76 195,60 212,68" fill="none" stroke="${escapeXml(c.opposite)}" stroke-width="1.1"/>`
      + `<circle cx="144" cy="73" r="1.4" fill="${escapeXml(c.opposite)}"/>`
      + `<circle cx="161" cy="66" r="1.4" fill="${escapeXml(c.opposite)}"/>`
      + `<circle cx="195" cy="60" r="1.4" fill="${escapeXml(c.opposite)}"/>`
      + `<circle cx="212" cy="68" r="1.4" fill="${escapeXml(c.opposite)}"/>`
      + `<text x="131" y="99" font-family="sans-serif" font-size="4.4" font-weight="700" fill="${escapeXml(c.text)}">表 4-1 基准模型回归摘要</text>`
      + `<line x1="131" y1="102" x2="229" y2="102" stroke="${escapeXml(c.axis)}" stroke-width="1.1"/>`
      + `<text x="133" y="109" font-family="sans-serif" font-size="4.3" font-weight="700" fill="${escapeXml(c.primary)}">解释变量</text>`
      + `<text x="197" y="109" font-family="sans-serif" font-size="4.3" font-weight="700" text-anchor="end" fill="${escapeXml(c.primary)}">估计系数</text>`
      + `<text x="227" y="109" font-family="sans-serif" font-size="4.3" font-weight="700" text-anchor="end" fill="${escapeXml(c.primary)}">显著性</text>`
      + `<line x1="131" y1="112" x2="229" y2="112" stroke="${escapeXml(c.axis)}" stroke-width="0.55"/>`
      + tableSpecimenRows
      + `<line x1="131" y1="146" x2="229" y2="146" stroke="${escapeXml(c.axis)}" stroke-width="1.1"/>`
      + `<text x="131" y="153" font-family="sans-serif" font-size="4" fill="${escapeXml(c.muted)}">*** p&lt;0.001, ** p&lt;0.01；全篇插图与页框同色。</text>`
      // Bottom folio
      + `<text x="180" y="165" font-family="monospace" font-size="4.8" text-anchor="middle" fill="${escapeXml(c.muted)}">- 12 -</text>`
      // Right specimen card
      + `<rect x="252" y="24" width="94" height="136" rx="6" fill="${escapeXml(c.surface)}" stroke="${escapeXml(c.border)}" stroke-width="0.8"/>`
      + `<rect x="258" y="31" width="82" height="12" rx="3" fill="${escapeXml(c.secondarySoft)}"/>`
      + `<text x="299" y="39" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${escapeXml(c.secondary)}">学术内页排版例图</text>`
      + `<text x="259" y="54" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">1. 运行页眉同步</text>`
      + `<text x="259" y="63" font-family="sans-serif" font-size="4.8" fill="${escapeXml(c.muted)}">章节名自动映射页眉</text>`
      + `<text x="259" y="77" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">2. 图表三线融合</text>`
      + `<text x="259" y="86" font-family="sans-serif" font-size="4.8" fill="${escapeXml(c.muted)}">三线表与矢量同色</text>`
      + `<text x="259" y="100" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">3. 居底标准页码</text>`
      + `<text x="259" y="109" font-family="sans-serif" font-size="4.8" fill="${escapeXml(c.muted)}">居中 - 12 - 盲审合规</text>`
      + `<rect x="259" y="121" width="80" height="29" rx="3.5" fill="${escapeXml(c.canvas)}" stroke="${escapeXml(c.border)}" stroke-width="0.6"/>`
      + `<rect x="264" y="126" width="38" height="4" rx="1.5" fill="${escapeXml(c.primary)}"/>`
      + `<rect x="305" y="126" width="18" height="4" rx="1.5" fill="${escapeXml(c.secondary)}"/>`
      + `<rect x="326" y="126" width="8" height="4" rx="1.5" fill="${escapeXml(c.opposite)}"/>`
      + `<text x="299" y="142" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${escapeXml(c.muted)}">双边框 · 出版级内页示范</text>`;
  } else {
    const isDarkCover = item.id === 'v3-nocturne' || item.id === 'cover-cand-d' || item.id === 'backdrop-cand-d';
    const isBackdrop = item.kind === 'backdrop';
    const isMode1 = item.kind === 'mode1_cover';
    const coverBg = isDarkCover ? '#15253B' : c.surface;
    const coverTitleCol = isDarkCover ? '#F8FAFC' : c.text;
    const coverMutedCol = isDarkCover ? '#CBD5E1' : c.muted;
    const coverPocketSky = isDarkCover ? '#1D3352' : c.primarySoft;
    const coverKickerCol = isDarkCover ? '#E8C574' : c.primary;
    const titleLine1 = item.kind === 'v3_cover' ? '城市生活与民生服务' : isMode1 ? '中国市场消费与公共' : '分层抽样与计量稳健';
    const titleLine2 = item.kind === 'v3_cover' ? '多维实证调查报告' : isMode1 ? '治理实证分析报告' : '统计分析专题总报告';
    const modeTag = item.kind === 'v3_cover' ? '艺术封面样板' : isMode1 ? '图文一体排版' : '分层留白底图';

    const skylineTowers = [
      [182, 114, 7, 22],
      [191, 106, 8, 30],
      [201, 118, 6, 18],
      [209, 102, 9, 34],
      [220, 112, 8, 24],
    ]
      .map(([tx, ty, tw, th]) => (
        `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="${escapeXml(isDarkCover ? c.secondary : c.primary)}" fill-opacity="0.82"/>`
        + `<rect x="${tx + 2}" y="${ty + 4}" width="1.8" height="2.2" fill="${escapeXml(isDarkCover ? '#FDE68A' : c.surface)}" fill-opacity="0.7"/>`
        + `<rect x="${tx + 2}" y="${ty + 9}" width="1.8" height="2.2" fill="${escapeXml(isDarkCover ? '#FDE68A' : c.surface)}" fill-opacity="0.5"/>`
      ))
      .join('');

    const mode1Halo = isMode1
      ? `<circle cx="180" cy="108" r="32" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="0.9" stroke-opacity="0.55"/>`
      : '';

    specimen =
      // Left margin card: 1+1+1 Swatches
      `<rect x="14" y="24" width="94" height="136" rx="6" fill="${escapeXml(c.surface)}" stroke="${escapeXml(c.border)}" stroke-width="0.8"/>`
      + `<rect x="20" y="31" width="82" height="12" rx="3" fill="${escapeXml(c.primarySoft)}"/>`
      + `<text x="61" y="39" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${escapeXml(c.primary)}">1+1+1 封面色板</text>`
      + marginSwatches
      + `<line x1="20" y1="123" x2="102" y2="123" stroke="${escapeXml(c.border)}" stroke-width="0.7"/>`
      + `<rect x="20" y="131" width="82" height="18" rx="4" fill="${escapeXml(c.secondarySoft)}"/>`
      + `<text x="61" y="142" font-family="sans-serif" font-size="5.4" font-weight="700" text-anchor="middle" fill="${escapeXml(c.secondary)}">${modeTag}</text>`
      // Center miniature editorial cover plate (3:4)
      + `<rect x="123" y="13" width="120" height="166" rx="3" fill="${escapeXml(c.border)}" fill-opacity="0.65"/>`
      + `<rect x="120" y="10" width="120" height="166" rx="3" fill="${escapeXml(coverBg)}" stroke="${escapeXml(c.primary)}" stroke-width="1.1"/>`
      + `<rect x="120" y="10" width="120" height="3" rx="1.5" fill="${escapeXml(c.primary)}"/>`
      // Editorial cover typography hierarchy
      + `<text x="128" y="22.5" font-family="sans-serif" font-size="4.1" font-weight="700" fill="${escapeXml(coverKickerCol)}">全国大学生市场调查与分析大赛 · 实证报告</text>`
      + `<line x1="128" y1="26.5" x2="232" y2="26.5" stroke="${escapeXml(c.secondary)}" stroke-width="0.7"/>`
      + `<rect x="128" y="25.7" width="22" height="1.6" fill="${escapeXml(c.opposite)}"/>`
      + `<text x="128" y="39.5" font-family="sans-serif" font-size="7.1" font-weight="700" fill="${escapeXml(coverTitleCol)}">${titleLine1}</text>`
      + `<text x="128" y="50" font-family="sans-serif" font-size="7.1" font-weight="700" fill="${escapeXml(coverTitleCol)}">${titleLine2}</text>`
      + `<text x="128" y="59.5" font-family="sans-serif" font-size="4.3" fill="${escapeXml(coverMutedCol)}">分层抽样设计 · 实证检验 · 治理闭环</text>`
      // Visual Pocket Artwork (sky + mountains + classical pavilion + skyline + arch bridge)
      + `<rect x="125" y="67" width="110" height="78" rx="3" fill="${escapeXml(coverPocketSky)}" fill-opacity="${isDarkCover ? '1' : '0.52'}"/>`
      + (isBackdrop
        ? `<rect x="128" y="70" width="104" height="16" rx="2" fill="${escapeXml(isDarkCover ? '#15253B' : c.surface)}" fill-opacity="0.55"/>`
        : '')
      + `<circle cx="212" cy="83" r="8" fill="${escapeXml(c.opposite)}" fill-opacity="0.88"/>`
      + `<circle cx="212" cy="83" r="11.5" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="0.7" stroke-opacity="0.6"/>`
      + `<polygon points="125,136 148,103 175,126 202,99 235,136" fill="${escapeXml(c.primaryMid)}" fill-opacity="0.55"/>`
      + `<polygon points="125,136 142,114 166,130 192,110 218,128 235,116 235,136" fill="${escapeXml(c.primary)}" fill-opacity="0.45"/>`
      // Architectural pavilion silhouette (left-center)
      + `<polygon points="136,115 151,105 166,115" fill="${escapeXml(isDarkCover ? c.secondary : c.primary)}"/>`
      + `<polygon points="140,108 151,100 162,108" fill="${escapeXml(c.opposite)}"/>`
      + `<rect x="142" y="115" width="18" height="15" fill="${escapeXml(isDarkCover ? '#0F172A' : c.surface)}" stroke="${escapeXml(c.primary)}" stroke-width="0.8"/>`
      + `<line x1="147" y1="115" x2="147" y2="130" stroke="${escapeXml(c.primary)}" stroke-width="0.8"/>`
      + `<line x1="155" y1="115" x2="155" y2="130" stroke="${escapeXml(c.primary)}" stroke-width="0.8"/>`
      + `<rect x="137" y="130" width="28" height="4" fill="${escapeXml(c.primary)}"/>`
      + skylineTowers
      + mode1Halo
      // Arch bridge & river reflection
      + `<path d="M125,136 Q180,126 235,136" fill="none" stroke="${escapeXml(c.secondary)}" stroke-width="1.3"/>`
      + `<rect x="125" y="136" width="110" height="9" fill="${escapeXml(c.primary)}" fill-opacity="0.22"/>`
      + `<line x1="136" y1="140" x2="168" y2="140" stroke="${escapeXml(c.surface)}" stroke-width="0.8" stroke-opacity="0.65"/>`
      + `<line x1="184" y1="142" x2="220" y2="142" stroke="${escapeXml(c.secondary)}" stroke-width="0.8" stroke-opacity="0.65"/>`
      // Bottom metadata strip
      + `<line x1="128" y1="151" x2="232" y2="151" stroke="${escapeXml(c.secondary)}" stroke-width="0.6" stroke-opacity="0.75"/>`
      + `<text x="128" y="159" font-family="sans-serif" font-size="4.1" font-weight="600" fill="${escapeXml(coverMutedCol)}">匿名评审规范 · 盲审合规</text>`
      + `<rect x="128" y="162.5" width="54" height="8.5" rx="2" fill="${escapeXml(c.primary)}" fill-opacity="${isDarkCover ? '0.45' : '0.12'}"/>`
      + `<text x="155" y="168.5" font-family="monospace" font-size="4.1" font-weight="700" text-anchor="middle" fill="${escapeXml(coverKickerCol)}">2025–2026 A4 封面</text>`
      + `<circle cx="218" cy="166.5" r="2.2" fill="${escapeXml(c.primary)}"/>`
      + `<circle cx="224" cy="166.5" r="2.2" fill="${escapeXml(c.secondary)}"/>`
      + `<circle cx="230" cy="166.5" r="2.2" fill="${escapeXml(c.opposite)}"/>`
      // Right margin card: Cover Editorial Spec
      + `<rect x="252" y="24" width="94" height="136" rx="6" fill="${escapeXml(c.surface)}" stroke="${escapeXml(c.border)}" stroke-width="0.8"/>`
      + `<rect x="258" y="31" width="82" height="12" rx="3" fill="${escapeXml(c.oppositeSoft)}"/>`
      + `<text x="299" y="39" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${escapeXml(c.opposite)}">封面构图例图规范</text>`
      + `<text x="259" y="54" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">赛事全称层级</text>`
      + `<text x="259" y="63" font-family="sans-serif" font-size="4.8" fill="${escapeXml(c.muted)}">主副题 + 水平强调线</text>`
      + `<text x="259" y="77" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">建筑山影口袋</text>`
      + `<text x="259" y="86" font-family="sans-serif" font-size="4.8" fill="${escapeXml(c.muted)}">亭台楼宇 × 天际线</text>`
      + `<text x="259" y="100" font-family="sans-serif" font-size="5.3" font-weight="700" fill="${escapeXml(c.text)}">盲审元数据带</text>`
      + `<text x="259" y="109" font-family="sans-serif" font-size="4.8" fill="${escapeXml(c.muted)}">无身份泄密纯净底栏</text>`
      + `<rect x="259" y="121" width="80" height="29" rx="3.5" fill="${escapeXml(c.canvas)}" stroke="${escapeXml(c.border)}" stroke-width="0.6"/>`
      + `<rect x="264" y="126" width="38" height="4" rx="1.5" fill="${escapeXml(c.primary)}"/>`
      + `<rect x="305" y="126" width="18" height="4" rx="1.5" fill="${escapeXml(c.secondary)}"/>`
      + `<rect x="326" y="126" width="8" height="4" rx="1.5" fill="${escapeXml(c.opposite)}"/>`
      + `<text x="299" y="142" font-family="sans-serif" font-size="4.8" text-anchor="middle" fill="${escapeXml(c.muted)}">全篇三色实时联动</text>`;
  }

  const labelFont = specimenFontSize(item.label, 224, 8.2, 6.4);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 228" width="360" height="228" fill="none">`
    + `<rect x="0" y="0" width="360" height="228" rx="10" fill="${escapeXml(c.canvas)}"/>`
    + `<rect x="0.5" y="0.5" width="359" height="227" rx="10" stroke="${escapeXml(c.border)}" stroke-width="1"/>`
    + specimen
    + `<rect x="14" y="182" width="332" height="34" rx="5" fill="${escapeXml(c.surface)}" stroke="${escapeXml(c.border)}" stroke-width="0.7"/>`
    + `<rect x="14" y="182" width="4" height="34" rx="2" fill="${escapeXml(c.primary)}"/>`
    + `<text x="24" y="197" font-family="sans-serif" font-size="${labelFont}" font-weight="700" fill="${escapeXml(c.text)}">${escapeXml(item.label)}</text>`
    + `<text x="24" y="209" font-family="sans-serif" font-size="6.6" fill="${escapeXml(c.muted)}">${escapeXml(item.badge)} · ${escapeXml(item.aspect === 'specimen' ? '色板样张' : item.aspect)}</text>`
    + `<rect x="266" y="191" width="72" height="16" rx="8" fill="${escapeXml(c.primarySoft)}"/>`
    + `<text x="302" y="201.5" font-family="sans-serif" font-size="5.6" font-weight="700" text-anchor="middle" fill="${escapeXml(c.primary)}">纯矢量出版例图</text>`
    + `</svg>`;

  return assertStrictOfficeVector(assertTrueVector(svg));
}

/** Package any pure-vector Track 2 `bentoArchetype` infographic as a ResultSnapshot ReportInsert. */
export async function buildInfographicInsert(item: VisualCatalogItem, topic?: string): Promise<ReportInsert> {
  if (!item.bentoArchetype) {
    throw Error(`“${item.label}”为版式参考图例，请在配图工作台按本课题内容重新绘制插图。`);
  }
  const meta = BENTO_PLATE_META[item.bentoArchetype];
  const cleanTopic = (topic ?? '').trim() || '调研课题';
  const id = `lib-info-${item.id}-${Date.now().toString(36)}`;
  const headers = ['关键评估维度', '参考样板读数', '诊断归因边界'];
  const rows: (string | number)[][] = [
    ...meta.rows.map(r => [...r]),
    ['核心摘要阈值', `${meta.kpis[0].label} ${meta.kpis[0].value}`, meta.waffleLabel],
  ];
  const rawMeta = { id, title: `${cleanTopic}·${item.label}（参考样板待替换）`, headers, rows };
  const hash = await digestText(JSON.stringify(rawMeta));
  const unsigned = parseResultSnapshot({
    id,
    title: `${cleanTopic}·${item.label}`,
    sourceName: `EVI-X 资料库“${item.label}”专题矢量信息图样板（正式提交前须替换为实测数据）`,
    sourceUrl: '',
    sourceHash: hash,
    resultHash: '0'.repeat(64),
    classification: 'simulated',
    method: 'infographic',
    n: 480,
    total: 480,
    headers,
    rows,
    metrics: meta.kpis.map(k => ({ label: `${k.label}(${k.value})`, value: meta.waffleRatio })),
    warnings: ['由资料库专题矢量信息图样板生成，正式提交前须替换为本课题实测调查结果。'],
    variables: [item.label, `resource-infographic:${item.id}`],
  });
  const result = { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
  return {
    id: `insert-${id}`,
    node: item.targetNode ?? 'sample.descriptive',
    source: `资料库 · ${item.label}`,
    items: [
      { kind: 'table', result, caption: `${cleanTopic} ${item.label}量化指标摘要台账（参考样板）` },
      { kind: 'figure', result, caption: `${cleanTopic} ${item.label}` },
      {
        kind: 'paragraph',
        text: `如[[图:@1]]与[[表:@0]]所示，本组矢量信息图参考结构适用于${item.whenToUse.replace(/^(?:适用于|适配于?|可用于|用于|面向)/u, '').replace(/。$/u, '')}；样板核心读数重点呈现${meta.kpis.map(k => `${k.label}（${k.value}）`).join('、')}与各触点权重分布（正式定稿前请替换为本课题实测调查数据）。`,
      },
    ],
  };
}
