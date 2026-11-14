/**
 * Vector diagram, technical roadmap, draw.io XML interchange, and literature word-cloud
 * renderer shared across Browser Preview, Word DOCX, XeLaTeX PDF, and PPTX exports.
 *
 * Every emitted SVG is 100% self-contained vector markup (`assertTrueVector` safe) with explicit
 * `font-size` and `font-family` styles on `<text>` elements so Word/sharp rasterization stays exact.
 */
import dagre from '@dagrejs/dagre';
import type { FigureInk } from './figure-palette.ts';

function resolveInk(ink: FigureInk): { primary: string; secondary: string; opposite: string } {
  if (typeof ink !== 'string') return { primary: ink.primary, secondary: ink.secondary, opposite: ink.opposite };
  const primary = /^#[0-9A-Fa-f]{6}$/.test(ink) ? ink.toUpperCase() : '#0F766E';
  return {
    primary,
    secondary: mixHex(primary, '#2563EB', 0.45),
    opposite: '#B91C1C',
  };
}
import { digestText, parseResultSnapshot, resultPayload, type ResultSnapshot } from './research-quality.ts';
type DataClassification = ResultSnapshot['classification'];
import { layoutCloud, type CloudItem } from './topic-lab/wordcloud.ts';
import {
  CLOUD_SHAPES,
  cloudShapePath,
  inferAgentCloudShape,
  type CloudAppearance,
  type CloudShape,
} from './topic-lab/cloud-shapes.ts';

const CLOUD_SHAPE_CODES: Readonly<Record<CloudShape, number>> = {
  free: 0,
  circle: 1,
  rectangle: 2,
  leaf: 3,
  crayfish: 4,
  custom: 5,
  bag: 6,
  brain: 7,
  shield: 8,
  heart: 9,
  crown: 10,
};
const CODE_TO_CLOUD_SHAPE: Readonly<Record<number, CloudShape>> = {
  0: 'free',
  1: 'circle',
  2: 'rectangle',
  3: 'leaf',
  4: 'crayfish',
  5: 'custom',
  6: 'bag',
  7: 'brain',
  8: 'shield',
  9: 'heart',
  10: 'crown',
};

export type DiagramNodeRole = 'stage' | 'process' | 'method' | 'decision' | 'output';

export interface DiagramNodeSpec {
  id: string;
  label: string;
  sublabel?: string;
  stage?: string;
  role?: DiagramNodeRole;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface DiagramEdgeSpec {
  id: string;
  source: string;
  target: string;
  label?: string;
  dashed?: boolean;
}

export interface DiagramGraphSpec {
  direction?: 'TB' | 'LR';
  nodes: DiagramNodeSpec[];
  edges: DiagramEdgeSpec[];
}

export interface WordCloudEntry {
  word: string;
  weight: number;
  category?: string;
}

const FONT_SANS = `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif`;
const FONT_SERIF = `'Times New Roman', 'Noto Serif SC', 'SimSun', serif`;
const INK_DARK = '#111827';
const INK_MUTED = '#475569';
const RULE_LINE = '#CBD5E1';
const CARD_BG = '#FFFFFF';
const SUBTLE_BG = '#F8FAFC';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unesc(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const clean = /^#[0-9A-Fa-f]{6}$/.test(h) ? h : '#0F766E';
    return [1, 3, 5].map(i => parseInt(clean.slice(i, i + 2), 16));
  };
  const ca = parse(a);
  const cb = parse(b);
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export const isDiagramMethod = (method: string): boolean =>
  method === 'wordcloud' || method === 'framework' || method === 'diagram' || method === 'infographic';

/** Standard node presets usable both in DrawDiagramStudio and the automated full-report pipeline. */
export const DIAGRAM_PRESETS: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  spec: DiagramGraphSpec;
}> = [
  {
    id: 'roadmap',
    name: '国奖级实证研究技术路线图',
    description: '从问题提出、文献词云到抽样问卷、信效度核验及实证模型的完整闭环。',
    spec: {
      direction: 'TB',
      nodes: [
        { id: 'n1', label: '第一阶段：问题建构与文献脉络', sublabel: '政策梳理 · 高频主题词云 · 研究缺口', stage: '理论准备', role: 'stage' },
        { id: 'n2', label: '第二阶段：理论框架与测量工具设计', sublabel: '潜变量操作化 · 李克特量表 · 预调研修订', stage: '工具设计', role: 'process' },
        { id: 'n3', label: '第三阶段：分层多阶段抽样与质控回收', sublabel: 'PPS 配额抽样 · 逻辑甄别 · 注意力核查', stage: '数据采集', role: 'method' },
        { id: 'n4', label: '第四阶段：信效度检验与多维实证建模', sublabel: 'Cronbach α · KMO 效度 · 回归/IPA 象限', stage: '量化实证', role: 'decision' },
        { id: 'n5', label: '第五阶段：稳健性验证与分类治理对策', sublabel: '异质性分组对照 · 可落地决策方案', stage: '对策结论', role: 'output' },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', label: '界定核心维度' },
        { id: 'e2', source: 'n2', target: 'n3', label: '量表检验校准' },
        { id: 'e3', source: 'n3', target: 'n4', label: '有效样本入模' },
        { id: 'e4', source: 'n4', target: 'n5', label: '实证证据支撑' },
        { id: 'e5', source: 'n4', target: 'n2', label: '指标反馈优化', dashed: true },
      ],
    },
  },
  {
    id: 'sem',
    name: '结构方程与中介效应路径图',
    description: '呈现自变量、中介变量、调节边界与结果变量之间的因果假设路径。',
    spec: {
      direction: 'LR',
      nodes: [
        { id: 's1', label: '核心服务质量 (X1)', sublabel: '供给及时性 · 响应稳定度', stage: '前因变量', role: 'stage' },
        { id: 's2', label: '配套环境与可达性 (X2)', sublabel: '空间距离 · 信息透明度', stage: '前因变量', role: 'stage' },
        { id: 's3', label: '整体满意度评估 (M)', sublabel: '中介机制 · Bootstrap 检验', stage: '中介路径', role: 'decision' },
        { id: 's4', label: '政策规则认知 (W)', sublabel: '正向调节感知边界', stage: '调节边界', role: 'method' },
        { id: 's5', label: '持续参与与推荐意愿 (Y)', sublabel: '复购/重游 · 口碑扩散', stage: '结果变量', role: 'output' },
      ],
      edges: [
        { id: 'se1', source: 's1', target: 's3', label: 'H1 (+)' },
        { id: 'se2', source: 's2', target: 's3', label: 'H2 (+)' },
        { id: 'se3', source: 's3', target: 's5', label: 'H3 (+)' },
        { id: 'se4', source: 's4', target: 's5', label: '调节作用 H4', dashed: true },
      ],
    },
  },
  {
    id: 'sampling',
    name: '分层多阶段抽样与质控流程图',
    description: '适用于抽样调查竞赛方法章的标准抽样与样本清洗技术流程。',
    spec: {
      direction: 'LR',
      nodes: [
        { id: 'p1', label: '抽样框界定', sublabel: '目标总体与区域分层', stage: '阶段 I', role: 'stage' },
        { id: 'p2', label: 'PPS 概率抽样', sublabel: '按规模成比例抽取社区', stage: '阶段 II', role: 'process' },
        { id: 'p3', label: '配额入户/拦截', sublabel: '人口特征结构平衡', stage: '阶段 III', role: 'method' },
        { id: 'p4', label: '质控四重过滤', sublabel: '作答时长 · 甄别题 · 直线作答', stage: '质控关口', role: 'decision' },
        { id: 'p5', label: '事后加权与入库', sublabel: '设计效应校准', stage: '阶段 IV', role: 'output' },
      ],
      edges: [
        { id: 'pe1', source: 'p1', target: 'p2' },
        { id: 'pe2', source: 'p2', target: 'p3' },
        { id: 'pe3', source: 'p3', target: 'p4' },
        { id: 'pe4', source: 'p4', target: 'p5', label: '合格样本' },
      ],
    },
  },
  {
    id: 'ipa-kano',
    name: '修正 IPA—KANO 需求诊断与排序框架图',
    description: '结合衍生重要性权重与实际表现得分，输出四象限优先整改矩阵。',
    spec: {
      direction: 'TB',
      nodes: [
        { id: 'k1', label: '多维感知测量输入', sublabel: '李克特量表均值 + 回归衍生权重', stage: '指标提取', role: 'stage' },
        { id: 'k2', label: 'KANO 属性分层筛选', sublabel: '必备/期望/魅力维度属性归类', stage: '属性辨识', role: 'process' },
        { id: 'k3', label: '修正 IPA 四象限落位', sublabel: '高重要低表现 → 锁定优先突破口', stage: '重点改进区', role: 'decision' },
        { id: 'k4', label: '聚类人群差异化耦合', sublabel: '交叉核对各敏感簇群痛点权重', stage: '分群校验', role: 'method' },
        { id: 'k5', label: '分期行动矩阵与 KPI', sublabel: '短期补短板 · 中长期锻造长板', stage: '决策输出', role: 'output' },
      ],
      edges: [
        { id: 'ke1', source: 'k1', target: 'k2', label: 'Better-Worse 测算' },
        { id: 'ke2', source: 'k2', target: 'k3', label: '映射二维坐标' },
        { id: 'ke3', source: 'k3', target: 'k4', label: '匹配受众簇群' },
        { id: 'ke4', source: 'k4', target: 'k5', label: '转译落地举措' },
      ],
    },
  },
  {
    id: 'action-loop',
    name: '痛点锚定—责任主体—分期 KPI 对策闭环图',
    description: '国一标准第九章对策闭环框图，把每项建议锚回前文实证断点与考核节点。',
    spec: {
      direction: 'LR',
      nodes: [
        { id: 'a1', label: '实证短板与簇群断点', sublabel: 'IPA 优先改进项 · 显著回归因子', stage: '证据锚点', role: 'stage' },
        { id: 'a2', label: '靶向干预措施组合', sublabel: '流程重构 · 机制透明 · 分层触达', stage: '抓手设计', role: 'process' },
        { id: 'a3', label: '多方主体协同落责', sublabel: '运营方 · 属地社区 · 监管督察', stage: '责任主体', role: 'method' },
        { id: 'a4', label: '分阶段量化核验 KPI', sublabel: '短期响应阈值 · 中长期复访追踪', stage: '闭环评估', role: 'output' },
      ],
      edges: [
        { id: 'ae1', source: 'a1', target: 'a2', label: '对症施策' },
        { id: 'ae2', source: 'a2', target: 'a3', label: '权责落地' },
        { id: 'ae3', source: 'a3', target: 'a4', label: '绩效跟踪' },
      ],
    },
  },
];

/** Build a governance & action closed-loop diagram tailored to a research blueprint for the plan.measures chapter. */
export function buildTopicActionRoadmapSpec(params: {
  topic: string;
  dimensions?: readonly string[];
}): DiagramGraphSpec {
  const dims = (params.dimensions ?? []).slice(0, 3);
  const topPain = dims[0] ? `${dims[0]}短板攻坚` : '核心供给短板攻坚';
  const secPain = dims[1] ? `${dims[1]}体验优化` : '交互触达机制升级';
  const subject = (params.topic || '研究课题').slice(0, 16);
  return {
    direction: 'LR',
    nodes: [
      { id: 'm1', label: `实证痛点：${subject}`, sublabel: `${topPain} · ${secPain}`, stage: '① 统计锚点', role: 'stage' },
      { id: 'm2', label: '分群靶向施策抓手', sublabel: '巩固核心派 · 激活观望派 · 挽回敏感派', stage: '② 精准干预', role: 'process' },
      { id: 'm3', label: '跨主体协同机制', sublabel: '运营执行方 × 社区/校园节点 × 标准监督', stage: '③ 主体落责', role: 'method' },
      { id: 'm4', label: '周期跟踪与 KPI 复盘', sublabel: '短期试点排查 · 中期二次抽样回访验证', stage: '④ 闭环核验', role: 'output' },
    ],
    edges: [
      { id: 'me1', source: 'm1', target: 'm2', label: 'IPA/回归映射' },
      { id: 'me2', source: 'm2', target: 'm3', label: '清单派单' },
      { id: 'me3', source: 'm3', target: 'm4', label: '跟踪评估' },
    ],
  };
}

/** Customize a roadmap graph using topic & blueprint specifics. */
export function buildTopicFrameworkSpec(params: {
  topic: string;
  domainLabel?: string;
  dimensions?: readonly string[];
  methodNames?: readonly string[];
}): DiagramGraphSpec {
  const dims = (params.dimensions ?? []).slice(0, 3).join(' · ') || '多维体验量表与感知评价';
  const methods = (params.methodNames ?? []).slice(0, 3).join(' · ') || '交叉卡方 · 信效度 · 回归/IPA';
  const subject = (params.domainLabel || params.topic || '主题调研').slice(0, 18);
  return {
    direction: 'TB',
    nodes: [
      { id: 't1', label: `问题锚定：${subject}`, sublabel: '现实痛点识别 · 文献高频词云聚类', stage: '① 绪论建构', role: 'stage' },
      { id: 't2', label: '测量体系与问卷定稿', sublabel: dims.slice(0, 34), stage: '② 方案设计', role: 'process' },
      { id: 't3', label: '分层配额抽样与四维质控', sublabel: '有效样本清洗 · 代表性检验', stage: '③ 数据采集', role: 'method' },
      { id: 't4', label: '统计建模与机制检验', sublabel: methods.slice(0, 34), stage: '④ 量化实证', role: 'decision' },
      { id: 't5', label: '关键改进矩阵与决策落地', sublabel: '差异化分群策略 · 可视化汇报', stage: '⑤ 对策产出', role: 'output' },
    ],
    edges: [
      { id: 'e1', source: 't1', target: 't2', label: '凝练核心构念' },
      { id: 'e2', source: 't2', target: 't3', label: '预试校准题项' },
      { id: 'e3', source: 't3', target: 't4', label: '洁净数据入模' },
      { id: 'e4', source: 't4', target: 't5', label: '实证靶向建议' },
      { id: 'e5', source: 't4', target: 't2', label: '模型反推修订', dashed: true },
    ],
  };
}

/** Deterministic Dagre layout assigning center-less top-left coordinates to nodes. */
export function autoLayoutDiagram(spec: DiagramGraphSpec): DiagramGraphSpec {
  const dir = spec.direction === 'LR' ? 'LR' : 'TB';
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: dir,
    nodesep: dir === 'TB' ? 42 : 34,
    ranksep: dir === 'TB' ? 54 : 68,
    marginx: 24,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const defaultW = dir === 'TB' ? 300 : 210;
  const defaultH = dir === 'TB' ? 74 : 84;
  for (const node of spec.nodes) {
    const w = node.width && Number.isFinite(node.width) ? Math.max(140, node.width) : defaultW;
    const h = node.height && Number.isFinite(node.height) ? Math.max(54, node.height) : defaultH;
    g.setNode(node.id, { width: w, height: h });
  }
  const nodeIds = new Set(spec.nodes.map(n => n.id));
  for (const edge of spec.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);

  return {
    direction: dir,
    nodes: spec.nodes.map(node => {
      const laid = g.node(node.id);
      const w = laid?.width ?? defaultW;
      const h = laid?.height ?? defaultH;
      return {
        ...node,
        width: w,
        height: h,
        x: Math.round((laid?.x ?? 180) - w / 2),
        y: Math.round((laid?.y ?? 60) - h / 2),
      };
    }),
    edges: spec.edges.map(e => ({ ...e })),
  };
}

type ParsedNodeMeta = {
  x?: number; y?: number; w?: number; h?: number; role?: DiagramNodeRole; dir?: 'TB' | 'LR';
  edges?: { id?: string; target: string; label?: string; dashed?: boolean }[];
};

function parseDiagramSpec(r: ResultSnapshot): DiagramGraphSpec {
  const nodes: DiagramNodeSpec[] = [];
  const edges: DiagramEdgeSpec[] = [];
  let direction: 'TB' | 'LR' = 'TB';

  r.rows.forEach((row, index) => {
    const id = String(row[0] ?? `n${index + 1}`).trim() || `n${index + 1}`;
    const stage = String(row[1] ?? '').trim();
    const label = String(row[2] ?? id).trim();
    const targetsRaw = String(row[3] ?? '').trim();
    const sublabel = row[4] ? String(row[4]).trim() : undefined;
    let meta: ParsedNodeMeta | null = null;
    if (typeof row[5] === 'string' && row[5].trim().startsWith('{')) {
      try {
        meta = JSON.parse(row[5]) as ParsedNodeMeta;
      } catch {
        meta = null;
      }
    }
    if (meta?.dir === 'LR') direction = 'LR';
    nodes.push({
      id,
      stage: stage && stage !== '流程环节' ? stage : undefined,
      label,
      sublabel: sublabel || undefined,
      role: meta?.role ?? (index === 0 ? 'stage' : index === r.rows.length - 1 ? 'output' : 'process'),
      x: typeof meta?.x === 'number' && Number.isFinite(meta.x) ? meta.x : undefined,
      y: typeof meta?.y === 'number' && Number.isFinite(meta.y) ? meta.y : undefined,
      width: typeof meta?.w === 'number' && Number.isFinite(meta.w) ? meta.w : undefined,
      height: typeof meta?.h === 'number' && Number.isFinite(meta.h) ? meta.h : undefined,
    });
    if (Array.isArray(meta?.edges)) {
      meta.edges.forEach((edge, ei) => {
        if (!edge?.target) return;
        edges.push({
          id: edge.id || `${id}-${edge.target}-${ei}`,
          source: id,
          target: String(edge.target),
          label: edge.label ? String(edge.label) : undefined,
          dashed: Boolean(edge.dashed),
        });
      });
    } else if (targetsRaw && targetsRaw !== '终点闭环') {
      targetsRaw.split(/[,，;；]/).map(s => s.trim()).filter(Boolean).forEach((target, ti) => {
        edges.push({ id: `${id}-${target}-${ti}`, source: id, target });
      });
    }
  });
  return nodes.length ? { direction, nodes, edges } : DIAGRAM_PRESETS[0].spec;
}

function wrapLines(text: string, maxChars: number): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const out: string[] = [];
  let current = '';
  let count = 0;
  for (const ch of clean) {
    const w = ch.charCodeAt(0) > 127 ? 1 : 0.56;
    if (count + w > maxChars && current) {
      out.push(current);
      current = ch;
      count = w;
    } else {
      current += ch;
      count += w;
    }
  }
  if (current) out.push(current);
  return out.slice(0, 2);
}

/** Deterministic vector renderer for research framework / draw.io diagrams (SVG width=996). */
export function frameworkDiagramSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const rawSpec = parseDiagramSpec(r);
  const needsLayout = rawSpec.nodes.some(n => typeof n.x !== 'number' || typeof n.y !== 'number');
  const laid = needsLayout ? autoLayoutDiagram(rawSpec) : rawSpec;

  const width = 996;
  const minX = Math.min(...laid.nodes.map(n => n.x ?? 0));
  const minY = Math.min(...laid.nodes.map(n => n.y ?? 0));
  const maxX = Math.max(...laid.nodes.map(n => (n.x ?? 0) + (n.width ?? 220)));
  const maxY = Math.max(...laid.nodes.map(n => (n.y ?? 0) + (n.height ?? 72)));
  const spanX = Math.max(120, maxX - minX);
  const spanY = Math.max(100, maxY - minY);

  const headerH = 74;
  const padX = 56;
  const padBottom = 48;
  const availW = width - padX * 2;
  const scale = Math.min(1.22, availW / spanX);
  const contentW = spanX * scale;
  const contentH = Math.max(240, spanY * scale);
  const offsetX = padX + (availW - contentW) / 2 - minX * scale;
  const offsetY = headerH + 22 - minY * scale;
  const totalHeight = Math.round(headerH + 22 + contentH + padBottom);

  const roleStyle = (role: DiagramNodeRole | undefined) => {
    switch (role) {
      case 'stage':
        return { fill: mixHex(primary, '#FFFFFF', 0.9), stroke: primary, pillBg: primary, pillInk: '#FFFFFF' };
      case 'method':
        return { fill: mixHex(secondary, '#FFFFFF', 0.9), stroke: secondary, pillBg: secondary, pillInk: '#FFFFFF' };
      case 'decision':
        return { fill: mixHex(opposite, '#FFFFFF', 0.91), stroke: opposite, pillBg: opposite, pillInk: '#FFFFFF' };
      case 'output':
        return { fill: mixHex(primary, '#FFFFFF', 0.84), stroke: primary, pillBg: mixHex(primary, '#0F172A', 0.25), pillInk: '#FFFFFF' };
      default:
        return { fill: '#FFFFFF', stroke: mixHex(primary, '#94A3B8', 0.45), pillBg: mixHex(primary, '#FFFFFF', 0.88), pillInk: primary };
    }
  };

  const nodeBox = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const node of laid.nodes) {
    nodeBox.set(node.id, {
      x: offsetX + (node.x ?? 0) * scale,
      y: offsetY + (node.y ?? 0) * scale,
      w: (node.width ?? 220) * scale,
      h: (node.height ?? 74) * scale,
    });
  }

  const edgeSvg = laid.edges.map(edge => {
    const a = nodeBox.get(edge.source);
    const b = nodeBox.get(edge.target);
    if (!a || !b) return '';
    const isFeedback = b.y + b.h * 0.5 < a.y + a.h * 0.5 - 12 && laid.direction !== 'LR';
    let pathD = '';
    let ax = 0;
    let ay = 0;
    let arrowPts = '';
    let lx = 0;
    let ly = 0;

    if (isFeedback) {
      const startX = a.x + a.w;
      const startY = a.y + a.h / 2;
      const endX = b.x + b.w;
      const endY = b.y + b.h / 2;
      const railX = Math.max(startX, endX) + 34;
      pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${railX.toFixed(1)} ${startY.toFixed(1)} L ${railX.toFixed(1)} ${endY.toFixed(1)} L ${(endX + 6).toFixed(1)} ${endY.toFixed(1)}`;
      ax = endX;
      ay = endY;
      arrowPts = `${ax.toFixed(1)},${ay.toFixed(1)} ${(ax + 9).toFixed(1)},${(ay - 4.5).toFixed(1)} ${(ax + 9).toFixed(1)},${(ay + 4.5).toFixed(1)}`;
      lx = railX + 6;
      ly = (startY + endY) / 2;
    } else if (laid.direction === 'LR' || Math.abs((b.x + b.w / 2) - (a.x + a.w / 2)) > Math.abs((b.y + b.h / 2) - (a.y + a.h / 2)) * 1.1) {
      const sx = b.x >= a.x ? a.x + a.w : a.x;
      const sy = a.y + a.h / 2;
      const tx = b.x >= a.x ? b.x : b.x + b.w;
      const ty = b.y + b.h / 2;
      const mx = (sx + tx) / 2;
      const dirSign = b.x >= a.x ? 1 : -1;
      pathD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${mx.toFixed(1)} ${sy.toFixed(1)} ${mx.toFixed(1)} ${ty.toFixed(1)} ${(tx - 6 * dirSign).toFixed(1)} ${ty.toFixed(1)}`;
      ax = tx;
      ay = ty;
      arrowPts = `${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - 9 * dirSign).toFixed(1)},${(ay - 4.5).toFixed(1)} ${(ax - 9 * dirSign).toFixed(1)},${(ay + 4.5).toFixed(1)}`;
      lx = mx;
      ly = (sy + ty) / 2 - 8;
    } else {
      const sx = a.x + a.w / 2;
      const sy = a.y + a.h;
      const tx = b.x + b.w / 2;
      const ty = b.y;
      const my = (sy + ty) / 2;
      pathD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${(ty - 6).toFixed(1)}`;
      ax = tx;
      ay = ty;
      arrowPts = `${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - 4.5).toFixed(1)},${(ay - 9).toFixed(1)} ${(ax + 4.5).toFixed(1)},${(ay - 9).toFixed(1)}`;
      lx = (sx + tx) / 2 + (Math.abs(sx - tx) < 4 ? 12 : 0);
      ly = my;
    }

    const stroke = edge.dashed ? opposite : primary;
    const dashAttr = edge.dashed ? ` stroke-dasharray="6 4"` : '';
    const labelEl = edge.label
      ? `<rect x="${(lx - Math.min(72, edge.label.length * 6 + 12)).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="${Math.min(144, edge.label.length * 12 + 16)}" height="20" rx="10" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS};font-weight:600">${esc(edge.label)}</text>`
      : '';
    return `<g><path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2"${dashAttr}/><polygon points="${arrowPts}" fill="${stroke}"/>${labelEl}</g>`;
  }).join('');

  const nodeSvg = laid.nodes.map(node => {
    const box = nodeBox.get(node.id);
    if (!box) return '';
    const tone = roleStyle(node.role);
    const titleLines = wrapLines(node.label, Math.max(12, Math.floor((box.w - 28) / 14)));
    const subLines = node.sublabel ? wrapLines(node.sublabel, Math.max(14, Math.floor((box.w - 28) / 11))) : [];
    const pillText = node.stage || '';
    const pillW = pillText ? Math.min(box.w - 24, pillText.length * 11 + 20) : 0;
    const baseTextY = pillText ? box.y + 34 : box.y + (box.h - (titleLines.length * 18 + subLines.length * 14)) / 2 + 14;
    return `<g>
      <rect x="${(box.x + 2).toFixed(1)}" y="${(box.y + 3).toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="10" fill="#E2E8F0" fill-opacity="0.45"/>
      <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="10" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="1.8"/>
      <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="5" height="${box.h.toFixed(1)}" rx="2.5" fill="${tone.stroke}"/>
      ${pillText ? `<rect x="${(box.x + 14).toFixed(1)}" y="${(box.y + 8).toFixed(1)}" width="${pillW.toFixed(1)}" height="18" rx="9" fill="${tone.pillBg}"/><text x="${(box.x + 14 + pillW / 2).toFixed(1)}" y="${(box.y + 20.5).toFixed(1)}" text-anchor="middle" fill="${tone.pillInk}" style="font-size:10.5px;font-family:${FONT_SANS};font-weight:700">${esc(pillText)}</text>` : ''}
      ${titleLines.map((line, i) => `<text x="${(box.x + 16).toFixed(1)}" y="${(baseTextY + i * 17).toFixed(1)}" fill="${INK_DARK}" style="font-size:13.5px;font-family:${FONT_SANS};font-weight:700">${esc(line)}</text>`).join('')}
      ${subLines.map((line, i) => `<text x="${(box.x + 16).toFixed(1)}" y="${(baseTextY + titleLines.length * 17 + 3 + i * 14).toFixed(1)}" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS}">${esc(line)}</text>`).join('')}
    </g>`;
  }).join('');

  const subtitle = `${laid.nodes.length} 个核心环节 · ${laid.edges.length} 条逻辑路径 · ${laid.direction === 'LR' ? '横向流程布局' : '纵向分层演进'}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" rx="12" fill="${CARD_BG}" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="0" y="0" width="${width}" height="${headerH}" rx="12" fill="${SUBTLE_BG}"/>
    <rect x="0" y="${headerH - 12}" width="${width}" height="12" fill="${SUBTLE_BG}"/>
    <line x1="20" y1="${headerH}" x2="${width - 20}" y2="${headerH}" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="28" y="20" width="6" height="34" rx="3" fill="${primary}"/>
    <text x="44" y="36" fill="${INK_DARK}" style="font-size:16px;font-family:${FONT_SANS};font-weight:700">${esc(r.title || '研究技术路线图')}</text>
    <text x="44" y="56" fill="${INK_MUTED}" style="font-size:12px;font-family:${FONT_SANS}">${esc(subtitle)}</text>
    <text x="${width - 28}" y="42" text-anchor="end" fill="${primary}" style="font-size:11.5px;font-family:${FONT_SERIF};font-style:italic">Vector Architecture · ${r.classification === 'simulated' ? '框架推演' : '实证路径'}</text>
    ${edgeSvg}
    ${nodeSvg}
    <text x="28" y="${totalHeight - 16}" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS}">注：矢量化技术路径图可随研究推进在左侧「Draw.io 流程图」实时微调并同步更新至 Word / LaTeX 成稿。</text>
  </svg>`;
}

/** Deterministic literature/topic keyword word cloud SVG renderer (SVG width=996). */
export function wordcloudSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);

  const items: CloudItem[] = r.rows
    .map((row, idx) => {
      const label = String(row[0] ?? '').trim();
      const weight = typeof row[1] === 'number' && Number.isFinite(row[1]) ? Math.max(1, row[1]) : Number(row[1]) || 10;
      return { key: `${idx}-${label}`, label, weight };
    })
    .filter(w => w.label.length > 0)
    .slice(0, 40);

  if (!items.length) {
    items.push(
      { key: '0', label: '研究框架', weight: 28 },
      { key: '1', label: '抽样调查', weight: 24 },
      { key: '2', label: '满意度', weight: 20 },
    );
  }

  const shapeCode = r.metrics.find(m => m.label === '词云轮廓编号')?.value;
  const recognition = inferAgentCloudShape(items.map(i => ({ label: i.label, weight: i.weight })), r.title);
  const explicitShape = typeof shapeCode === 'number' ? CODE_TO_CLOUD_SHAPE[shapeCode] : undefined;
  const shape: CloudShape = explicitShape && explicitShape !== 'circle' && explicitShape !== 'free'
    ? explicitShape
    : recognition.shape;
  const shapeLabel = CLOUD_SHAPES.find(s => s.id === shape)?.label ?? recognition.label;
  const confidenceMetric = r.metrics.find(m => m.label === 'Agent识形置信度')?.value;
  const confidence = typeof confidenceMetric === 'number' && Number.isFinite(confidenceMetric)
    ? Math.round(confidenceMetric)
    : recognition.confidence;

  const width = 996;
  const headerH = 78;
  const cloudW = 890;
  const cloudH = 420;
  const padX = (width - cloudW) / 2;
  const padY = headerH + 20;
  const totalHeight = headerH + cloudH + 66;

  const appearance: CloudAppearance = {
    shape,
    orientation: 'horizontal',
    spacing: 'compact',
    outline: shape !== 'free',
  };
  const { placed } = layoutCloud(items, {
    width: cloudW,
    height: cloudH,
    minFont: 15,
    maxFont: 54,
    padding: 5,
    appearance,
    measure: (text, size) => {
      let w = 0;
      for (const ch of text) w += ch.charCodeAt(0) > 127 ? size * 1.04 : size * 0.58;
      return { w: Math.max(size, w + 8), h: size * 1.2 };
    },
  });

  const palette = [
    primary,
    mixHex(primary, '#0F172A', 0.22),
    secondary,
    opposite,
    mixHex(primary, secondary, 0.5),
    '#334155',
  ];

  const outline = cloudShapePath(appearance, cloudW, cloudH);
  const topWords = items.slice(0, 4).map(e => `${e.label}(${e.weight})`).join(' · ');
  const topThreshold = (items[0]?.weight ?? 1) * 0.72;
  const midThreshold = (items[0]?.weight ?? 1) * 0.45;

  const wordsMarkup = placed.map((item, idx) => {
    const color = palette[idx % palette.length];
    const x = padX + item.x;
    const y = padY + item.y + item.size * 0.34;
    const weight = item.weight >= topThreshold ? '800' : item.weight >= midThreshold ? '700' : '600';
    const opacity = item.weight >= topThreshold ? '1' : item.weight >= midThreshold ? '0.94' : '0.86';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" fill="${color}" fill-opacity="${opacity}" style="font-size:${item.size.toFixed(1)}px;font-family:${FONT_SANS};font-weight:${weight}">${esc(item.label)}</text>`;
  }).join('');

  const agentBadgeText = `Agent 语义识形：${shapeLabel}（${recognition.domain} · ${confidence}%）`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" rx="12" fill="${CARD_BG}" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="0" y="0" width="${width}" height="${headerH}" rx="12" fill="${SUBTLE_BG}"/>
    <rect x="0" y="${headerH - 12}" width="${width}" height="12" fill="${SUBTLE_BG}"/>
    <line x1="20" y1="${headerH}" x2="${width - 20}" y2="${headerH}" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="28" y="20" width="6" height="38" rx="3" fill="${primary}"/>
    <text x="44" y="37" fill="${INK_DARK}" style="font-size:16px;font-family:${FONT_SANS};font-weight:700">${esc(r.title || '研究主题高频词云分析')}</text>
    <text x="44" y="57" fill="${INK_MUTED}" style="font-size:12px;font-family:${FONT_SANS}">核心高频词：${esc(topWords)}</text>
    <rect x="${width - 332}" y="22" width="304" height="24" rx="12" fill="${mixHex(primary, '#FFFFFF', 0.88)}" stroke="${mixHex(primary, '#FFFFFF', 0.55)}" stroke-width="1"/>
    <text x="${width - 180}" y="38" text-anchor="middle" fill="${primary}" style="font-size:11px;font-family:${FONT_SANS};font-weight:700">${esc(agentBadgeText)}</text>
    <text x="${width - 28}" y="62" text-anchor="end" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SERIF};font-style:italic">Vector Semantic Cloud · n=${items.length}</text>
    <rect x="${padX}" y="${padY}" width="${cloudW}" height="${cloudH}" rx="14" fill="${mixHex(primary, '#FFFFFF', 0.965)}" stroke="${mixHex(primary, '#CBD5E1', 0.55)}" stroke-width="1" stroke-dasharray="4 4"/>
    ${outline ? `<g transform="translate(${padX},${padY})"><path d="${outline}" fill="${mixHex(primary, '#FFFFFF', 0.91)}" fill-rule="evenodd" stroke="${mixHex(primary, '#FFFFFF', 0.45)}" stroke-width="2"/><path d="${outline}" fill="none" stroke="${mixHex(secondary, '#FFFFFF', 0.62)}" stroke-width="1" stroke-dasharray="5 4"/></g>` : ''}
    ${wordsMarkup}
    <text x="28" y="${totalHeight - 16}" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS}">注：轮廓由 Agent 根据研究域与高频主题语义自动识别生成（${esc(shapeLabel)}），词频字号按权重平方根归一化映射。</text>
  </svg>`;
}

/** Deterministic Swiss Bento Descriptive Statistics Composite Infographic SVG renderer (SVG width=996). */
export function descriptiveInfographicSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const width = 996;
  const totalHeight = 560;
  const softPrimary = mixHex(primary, '#FFFFFF', 0.92);
  const softSecondary = mixHex(secondary, '#FFFFFF', 0.92);
  const softOpposite = mixHex(opposite, '#FFFFFF', 0.92);

  type PanelItem = { zone: string; label: string; value: number | null; unit: string };
  const items: PanelItem[] = r.rows.map(row => ({
    zone: String(row[0] ?? '指标').trim(),
    label: String(row[1] ?? '').trim(),
    value: typeof row[2] === 'number' && Number.isFinite(row[2]) ? row[2] : (Number.isFinite(Number(row[2])) ? Number(row[2]) : null),
    unit: String(row[3] ?? '').trim(),
  }));

  const kpis = items.filter(i => /KPI|样本|核心/u.test(i.zone)).slice(0, 4);
  const distBars = items.filter(i => /频数|分布|构成/u.test(i.zone)).slice(0, 6);
  const scoreBars = items.filter(i => /均值|评价|维度|得分/u.test(i.zone)).slice(0, 6);
  const takeaways = items.filter(i => /结论|摘要|发现/u.test(i.zone)).slice(0, 3);

  const displayKpis: PanelItem[] = kpis.length
    ? kpis
    : [
        { zone: 'KPI', label: '有效样本量 n', value: r.n || 0, unit: '份' },
        { zone: 'KPI', label: '原始总样本', value: r.total || r.n || 0, unit: '份' },
        { zone: 'KPI', label: '涵盖分析维度', value: distBars.length + scoreBars.length, unit: '项指标' },
      ];

  const kpiGap = 16;
  const kpiAreaW = width - 56;
  const kpiW = (kpiAreaW - kpiGap * (displayKpis.length - 1)) / Math.max(1, displayKpis.length);
  const kpiSvg = displayKpis
    .map((k, idx) => {
      const kx = 28 + idx * (kpiW + kpiGap);
      const valText = k.value === null ? (k.unit || '已锁定') : `${Number.isInteger(k.value) ? k.value : k.value.toFixed(2)}${k.unit && !k.unit.includes('·') ? ` ${k.unit}` : ''}`;
      const accentColor = idx === 0 ? primary : idx === 1 ? secondary : idx === 2 ? opposite : '#334155';
      return `<g>
        <rect x="${kx.toFixed(1)}" y="90" width="${kpiW.toFixed(1)}" height="74" rx="10" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
        <rect x="${kx.toFixed(1)}" y="90" width="4" height="74" rx="2" fill="${accentColor}"/>
        <text x="${(kx + 16).toFixed(1)}" y="114" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS};font-weight:600">${esc(k.label.slice(0, 18))}</text>
        <text x="${(kx + 16).toFixed(1)}" y="148" fill="${INK_DARK}" style="font-size:21px;font-family:${FONT_SANS};font-weight:700">${esc(valText)}</text>
      </g>`;
    })
    .join('');

  const leftRows = distBars.length
    ? distBars
    : [{ zone: '分布', label: '等待绑定频数分布结果', value: 100, unit: '%' }];
  const maxDist = Math.max(100, ...leftRows.map(d => Math.abs(d.value ?? 0)));
  const distSvg = leftRows
    .map((d, idx) => {
      const ry = 226 + idx * 42;
      const pct = d.value !== null ? Math.max(0, Math.min(1, d.value / maxDist)) : 0;
      const barW = Math.max(6, Math.round(pct * 270));
      const fill = idx === 0 ? primary : idx === 1 ? secondary : mixHex(primary, '#94A3B8', 0.45);
      const valLabel = d.value !== null ? `${Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}${d.unit || '%'}` : d.unit;
      return `<g>
        <text x="44" y="${ry}" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:600">${esc(d.label.slice(0, 16))}</text>
        <text x="464" y="${ry}" text-anchor="end" fill="${primary}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(valLabel)}</text>
        <rect x="44" y="${ry + 7}" width="420" height="10" rx="5" fill="${softPrimary}"/>
        <rect x="44" y="${ry + 7}" width="${Math.round(pct * 420)}" height="10" rx="5" fill="${fill}"/>
        <circle cx="${(44 + Math.max(8, Math.round(pct * 420))).toFixed(1)}" cy="${ry + 12}" r="4.5" fill="#FFFFFF" stroke="${fill}" stroke-width="2"/>
        ${barW ? '' : ''}
      </g>`;
    })
    .join('');

  const rightRows = scoreBars.length
    ? scoreBars
    : [{ zone: '维度', label: '等待绑定五维量表均分', value: 3.8, unit: '/ 5.0' }];
  const scoreSvg = rightRows
    .map((d, idx) => {
      const ry = 226 + idx * 42;
      const ratio = d.value !== null ? Math.max(0, Math.min(1, d.value / 5)) : 0.6;
      const barW = Math.max(8, Math.round(ratio * 260));
      const isWeak = (d.value ?? 5) < 3.6;
      const dotColor = isWeak ? opposite : primary;
      const valLabel = d.value !== null ? `${d.value.toFixed(2)} ${d.unit || '/ 5'}` : d.unit;
      return `<g>
        <text x="530" y="${ry}" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:600">${esc(d.label.slice(0, 15))}</text>
        <text x="950" y="${ry}" text-anchor="end" fill="${dotColor}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(valLabel)}</text>
        <line x1="530" y1="${ry + 12}" x2="950" y2="${ry + 12}" stroke="${RULE_LINE}" stroke-width="2" stroke-linecap="round"/>
        <line x1="530" y1="${ry + 12}" x2="${530 + Math.round(ratio * 420)}" y2="${ry + 12}" stroke="${dotColor}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${530 + Math.round(ratio * 420)}" cy="${ry + 12}" r="6" fill="${dotColor}" stroke="#FFFFFF" stroke-width="2"/>
        ${barW ? '' : ''}
      </g>`;
    })
    .join('');

  const takeawayText =
    takeaways.map(t => `${t.label}${t.unit ? `：${t.unit}` : ''}`).join(' ｜ ')
    || `基于当前已冻结统计结果（n = ${r.n}）自动合成：数据映射与图形几何经过确定性校验。`;
  const badgeText = r.classification === 'simulated' ? '教学模拟统计信息图' : '实证统计复合信息图';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" rx="14" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="0" y="0" width="${width}" height="74" rx="14" fill="${SUBTLE_BG}"/>
    <rect x="0" y="62" width="${width}" height="12" fill="${SUBTLE_BG}"/>
    <line x1="28" y1="74" x2="${width - 28}" y2="74" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="28" y="20" width="6" height="34" rx="3" fill="${primary}"/>
    <text x="44" y="36" fill="${INK_DARK}" style="font-size:16.5px;font-family:${FONT_SANS};font-weight:700">${esc(r.title || '描述性统计复合信息图')}</text>
    <text x="44" y="56" fill="${INK_MUTED}" style="font-size:11.5px;font-family:${FONT_SANS}">多面板数据映射 · Bento 版式结构 · 数据指纹 ${esc(r.sourceHash.slice(0, 12))}</text>
    <rect x="${width - 178}" y="22" width="150" height="26" rx="13" fill="${softSecondary}" stroke="${secondary}" stroke-opacity="0.35" stroke-width="1"/>
    <text x="${width - 103}" y="39" text-anchor="middle" fill="${secondary}" style="font-size:11px;font-family:${FONT_SANS};font-weight:700">${esc(badgeText)}</text>
    ${kpiSvg}
    <rect x="28" y="180" width="454" height="296" rx="12" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
    <text x="44" y="204" fill="${INK_DARK}" style="font-size:13px;font-family:${FONT_SANS};font-weight:700">面板 A · 样本结构与频数分布占比</text>
    ${distSvg}
    <rect x="514" y="180" width="454" height="296" rx="12" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
    <text x="530" y="204" fill="${INK_DARK}" style="font-size:13px;font-family:${FONT_SANS};font-weight:700">面板 B · 核心维度表现与薄弱项对比</text>
    ${rightRows.length ? scoreSvg : ''}
    <rect x="28" y="490" width="${width - 56}" height="52" rx="10" fill="${softOpposite}" stroke="${opposite}" stroke-opacity="0.25" stroke-width="1"/>
    <text x="44" y="512" fill="${opposite}" style="font-size:11px;font-family:${FONT_SANS};font-weight:700">核心统计读数（自动锁定冻结结果）</text>
    <text x="44" y="530" fill="${INK_DARK}" style="font-size:11.5px;font-family:${FONT_SANS}">${esc(takeawayText.slice(0, 74))}</text>
  </svg>`;
}

export function diagramSnapshotSVG(r: ResultSnapshot, ink: FigureInk): string {
  if (r.method === 'wordcloud') return wordcloudSVG(r, ink);
  if (r.method === 'infographic') return descriptiveInfographicSVG(r, ink);
  return frameworkDiagramSVG(r, ink);
}

/** Serialize a DiagramGraphSpec into draw.io / mxGraph XML for desktop & web interoperability. */
export function toDrawioXml(spec: DiagramGraphSpec, diagramName = 'EVI-X 研究流程图'): string {
  const laid = spec.nodes.some(n => typeof n.x !== 'number' || typeof n.y !== 'number') ? autoLayoutDiagram(spec) : spec;
  const cells: string[] = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
  ];
  for (const node of laid.nodes) {
    const label = node.sublabel ? `${node.label}\n(${node.sublabel})` : node.label;
    const fill = node.role === 'decision' ? '#fef2f2' : node.role === 'output' ? '#ecfdf5' : '#f8fafc';
    const stroke = node.role === 'decision' ? '#b91c1c' : '#0f766e';
    const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};strokeWidth=2;evixStage=${encodeURIComponent(node.stage ?? '')};evixRole=${node.role ?? 'process'};`;
    cells.push(
      `<mxCell id="${esc(node.id)}" value="${esc(label)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(node.x ?? 40)}" y="${Math.round(node.y ?? 40)}" width="${Math.round(node.width ?? 240)}" height="${Math.round(node.height ?? 72)}" as="geometry"/>` +
      `</mxCell>`,
    );
  }
  for (const edge of laid.edges) {
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;${edge.dashed ? 'dashed=1;' : ''}`;
    cells.push(
      `<mxCell id="${esc(edge.id)}" value="${esc(edge.label ?? '')}" style="${style}" edge="1" parent="1" source="${esc(edge.source)}" target="${esc(edge.target)}">` +
        `<mxGeometry relative="1" as="geometry"/>` +
      `</mxCell>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<mxfile host="EVI-X-DrawStudio" version="24.0">\n` +
    `  <diagram id="evix-diagram" name="${esc(diagramName)}">\n` +
    `    <mxGraphModel dx="1000" dy="760" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827">\n` +
    `      <root>\n        ${cells.join('\n        ')}\n      </root>\n` +
    `    </mxGraphModel>\n` +
    `  </diagram>\n</mxfile>`;
}

/** Parse standard .drawio / mxGraph XML into DiagramGraphSpec (handles both vertices and edges safely). */
export function fromDrawioXml(xml: string): DiagramGraphSpec {
  const nodes: DiagramNodeSpec[] = [];
  const edges: DiagramEdgeSpec[] = [];
  const cellRe = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  const attr = (attrs: string, name: string): string => {
    const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs);
    return m ? unesc(m[1]) : '';
  };

  for (const match of xml.matchAll(cellRe)) {
    const attrs = match[1];
    const inner = match[2] ?? '';
    const id = attr(attrs, 'id');
    if (!id || id === '0' || id === '1') continue;
    const isEdge = /\bedge="1"/.test(attrs) || (attr(attrs, 'source') && attr(attrs, 'target'));
    const rawValue = attr(attrs, 'value').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    const style = attr(attrs, 'style');

    if (isEdge) {
      const source = attr(attrs, 'source');
      const target = attr(attrs, 'target');
      if (source && target) {
        edges.push({
          id,
          source,
          target,
          label: rawValue || undefined,
          dashed: /dashed=1/.test(style),
        });
      }
      continue;
    }

    const lines = rawValue.split('\n').map(s => s.trim()).filter(Boolean);
    const label = lines[0] || `节点 ${nodes.length + 1}`;
    const sublabel = lines.length > 1 ? lines.slice(1).join(' · ').replace(/^\(|\)$/g, '') : undefined;
    const geom = /<mxGeometry\b([^>]*)/i.exec(inner)?.[1] ?? '';
    const num = (k: string) => {
      const v = Number(attr(geom, k));
      return Number.isFinite(v) ? v : undefined;
    };
    const stageMatch = /evixStage=([^;]+)/.exec(style);
    const roleMatch = /evixRole=(stage|process|method|decision|output)/.exec(style);

    nodes.push({
      id,
      label,
      sublabel,
      stage: stageMatch ? decodeURIComponent(stageMatch[1]) : undefined,
      role: (roleMatch?.[1] as DiagramNodeRole | undefined) ?? 'process',
      x: num('x'),
      y: num('y'),
      width: num('width'),
      height: num('height'),
    });
  }

  if (!nodes.length) throw new Error('未能从 .drawio 文件解析到有效图形节点。');
  return {
    direction: 'TB',
    nodes,
    edges,
  };
}

/** Package a DiagramGraphSpec as a provenance-hashed ResultSnapshot compatible with Word/LaTeX/Preview. */
export async function buildDiagramResultSnapshot(params: {
  id: string;
  title: string;
  spec: DiagramGraphSpec;
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}): Promise<ResultSnapshot> {
  const hasPositions = params.spec.nodes.every(n => typeof n.x === 'number' && typeof n.y === 'number');
  const laid = hasPositions ? params.spec : autoLayoutDiagram(params.spec);
  const edgesBySource = new Map<string, DiagramEdgeSpec[]>();
  for (const e of laid.edges) {
    edgesBySource.set(e.source, [...(edgesBySource.get(e.source) ?? []), e]);
  }
  const headers = ['节点编号', '研究阶段', '环节名称', '后续指向', '说明备注', '版式与坐标'];
  const rows = laid.nodes.map((n, index) => {
    const outEdges = edgesBySource.get(n.id) ?? [];
    const targetText = outEdges.map(e => (e.label ? `${e.target}(${e.label})` : e.target)).join(', ') || '终点闭环';
    const meta = JSON.stringify({
      x: n.x,
      y: n.y,
      w: n.width,
      h: n.height,
      role: n.role,
      ...(index === 0 ? { dir: laid.direction ?? 'TB' } : {}),
      ...(outEdges.length ? { edges: outEdges.map(e => ({ id: e.id, target: e.target, ...(e.label ? { label: e.label } : {}), ...(e.dashed ? { dashed: true } : {}) })) } : {}),
    });
    return [n.id, n.stage ?? '流程环节', n.label, targetText, n.sublabel ?? '', meta];
  });
  const metrics = [
    { label: '研究环节数', value: laid.nodes.length },
    { label: '逻辑路径数', value: laid.edges.length },
  ];
  const dataHash = params.sourceHash && /^[a-f0-9]{64}$/.test(params.sourceHash)
    ? params.sourceHash
    : await digestText(JSON.stringify(laid));
  const unsigned = parseResultSnapshot({
    id: params.id,
    title: params.title,
    sourceName: params.sourceName ?? 'EVI-X 本地流程图工作坊',
    sourceUrl: '',
    sourceHash: dataHash,
    resultHash: '0'.repeat(64),
    classification: params.classification ?? 'public',
    method: 'framework',
    n: laid.nodes.length,
    total: laid.nodes.length,
    headers,
    rows,
    metrics,
    warnings: [],
    variables: ['研究环节', '逻辑路径'],
  });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}

/** Package weighted topic/literature keywords as a deterministic vector word-cloud ResultSnapshot. */
export async function buildWordCloudResultSnapshot(params: {
  id: string;
  title: string;
  words: readonly WordCloudEntry[];
  shape?: CloudShape;
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}): Promise<ResultSnapshot> {
  const clean = params.words
    .filter(w => w.word.trim().length > 0 && Number.isFinite(w.weight) && w.weight > 0)
    .slice(0, 40);
  const totalWeight = clean.reduce((sum, w) => sum + w.weight, 0) || 1;
  const sorted = [...clean].sort((a, b) => b.weight - a.weight);
  const headers = ['高频关键词', '权重频次', '文献占比（%）', '主题归属'];
  const rows = sorted.map(item => [
    item.word.trim(),
    Math.round(item.weight),
    Number(((item.weight / totalWeight) * 100).toFixed(1)),
    item.category ?? '核心主题',
  ]);
  const recognition = inferAgentCloudShape(
    sorted.map(w => ({ label: w.word, weight: w.weight })),
    params.title,
  );
  const resolvedShape: CloudShape = params.shape && params.shape in CLOUD_SHAPE_CODES && params.shape !== 'circle'
    ? params.shape
    : recognition.shape;
  const metrics = [
    { label: '词云轮廓编号', value: CLOUD_SHAPE_CODES[resolvedShape] },
    { label: '关键词总数', value: sorted.length },
    { label: 'Agent识形置信度', value: recognition.confidence },
  ];
  const dataHash = params.sourceHash && /^[a-f0-9]{64}$/.test(params.sourceHash)
    ? params.sourceHash
    : await digestText(JSON.stringify({ rows, shape: resolvedShape }));
  const unsigned = parseResultSnapshot({
    id: params.id,
    title: params.title,
    sourceName: params.sourceName ?? 'EVI-X 文献词云引擎',
    sourceUrl: '',
    sourceHash: dataHash,
    resultHash: '0'.repeat(64),
    classification: params.classification ?? 'public',
    method: 'wordcloud',
    n: sorted.length,
    total: Math.round(totalWeight),
    headers,
    rows,
    metrics,
    warnings: [],
    variables: sorted.slice(0, 4).map(w => w.word),
  });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}
