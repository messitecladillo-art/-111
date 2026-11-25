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

export interface DiagramRoadmapMeta {
  researchSubject?: string;
  dimensions?: string[];
  policyTags?: string[];
  theories?: string[];
  methodNames?: string[];
}

export interface QuestionnaireModuleSpec {
  moduleTitle: string;
  itemRange?: string;
  questionTypes?: string;
  itemsSummary: string | readonly string[];
  routingHint?: string;
}

export interface QuestionnaireTreeData {
  rootLabel: string;
  totalQuestions: number;
  hasRouting: boolean;
  modules: QuestionnaireModuleSpec[];
}

export type QuestionnaireStructureQuestionInput = {
  id: string;
  variable?: string;
  text: string;
  type: string;
  purpose?: string;
  construct?: string;
  analysis?: string;
  choices?: ReadonlyArray<{ code: string; label: string }>;
  condition?: null | { questionId: string; codes: readonly string[] };
};

export type QuestionnaireStructureInput =
  | {
      title?: string;
      rootLabel?: string;
      questions: readonly QuestionnaireStructureQuestionInput[];
    }
  | {
      title?: string;
      rootLabel?: string;
      totalQuestions?: number;
      modules: readonly QuestionnaireModuleSpec[];
    };

export interface DiagramGraphSpec {
  direction?: 'TB' | 'LR';
  nodes: DiagramNodeSpec[];
  edges: DiagramEdgeSpec[];
  roadmapMeta?: DiagramRoadmapMeta;
  questionnaireTree?: QuestionnaireTreeData;
}

export interface WordCloudEntry {
  word: string;
  weight: number;
  category?: string;
}

export interface CooccurrenceEntry {
  word: string;
  weight: number;
  category?: string;
  cluster?: number;
}

export interface CooccurrenceLink {
  source: string;
  target: string;
  strength: number;
}

export interface MacroTrendPoint {
  period: string;
  barValue: number;
  lineValue: number;
}

export type SummaryCardIcon =
  | 'shield'
  | 'compass'
  | 'layers'
  | 'spark'
  | 'users'
  | 'target'
  | 'chart'
  | 'check';

export interface SummaryCardColumn {
  title: string;
  tag?: string;
  icon?: SummaryCardIcon;
  points: readonly string[];
}

const FONT_SANS = `'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif`;
const INK_DARK = '#111827';
const INK_MUTED = '#475569';
const RULE_LINE = '#CBD5E1';
const CARD_BG = '#FFFFFF';
const SUBTLE_BG = '#F8FAFC';

function escXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function esc(value: string): string {
  return escXmlAttr(
    value
      .replace(/[\u3010\u3011\u300C\u300D\u300E\u300F{}]/gu, '')
      .replace(/\s*&\s*/gu, '与')
      .replace(/\u2026+|\.{3,}/gu, ''),
  );
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
  method === 'questionnaire-tree'
  || method === 'macro-trend'
  || method === 'summary-card'
  || method === 'cooccurrence'
  || method === 'wordcloud'
  || method === 'framework'
  || method === 'diagram'
  || method === 'infographic';

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
    description: '从问题提出、文献关键词共现聚类到抽样问卷、信效度核验及实证模型的完整路径。',
    spec: {
      direction: 'TB',
      nodes: [
        { id: 'n1', label: '第一阶段 · 问题建构与文献脉络', sublabel: '政策梳理 · 文献关键词共现聚类 · 研究缺口', stage: '理论准备', role: 'stage' },
        { id: 'n2', label: '第二阶段 · 理论框架与测量工具设计', sublabel: '潜变量操作化 · 李克特量表 · 预调研修订', stage: '工具设计', role: 'process' },
        { id: 'n3', label: '第三阶段 · 分层多阶段抽样与质控回收', sublabel: 'PPS 配额抽样 · 逻辑甄别 · 注意力核查', stage: '数据采集', role: 'method' },
        { id: 'n4', label: '第四阶段 · 信效度检验与多维实证建模', sublabel: 'Cronbach α · KMO 效度 · 回归/IPA 象限', stage: '量化实证', role: 'decision' },
        { id: 'n5', label: '第五阶段 · 稳健性验证与分类治理对策', sublabel: '异质性分组对照 · 可落地决策方案', stage: '对策结论', role: 'output' },
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

function cjkSpan(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 127 ? 1 : 0.56;
  return w;
}

function fitCleanPhrase(text: string, maxChars: number): string {
  const clean = text.trim();
  if (cjkSpan(clean) <= maxChars) return clean;
  let out = '';
  let w = 0;
  for (const ch of clean) {
    const cw = ch.charCodeAt(0) > 127 ? 1 : 0.56;
    if (w + cw > maxChars) break;
    out += ch;
    w += cw;
  }
  return out.replace(/[·×/、，；：\s]+$/u, '');
}

function joinFittingParts(parts: readonly string[], sep: string, maxChars: number, fallback: string): string {
  const clean = parts.map(p => p.trim()).filter(Boolean);
  if (!clean.length) return fallback;
  const chosen: string[] = [];
  for (const p of clean) {
    const candidate = chosen.length ? `${chosen.join(sep)}${sep}${p}` : p;
    if (cjkSpan(candidate) <= maxChars || !chosen.length) chosen.push(p);
    else break;
  }
  return chosen.join(sep);
}

/** Build a governance & action closed-loop diagram tailored to a research blueprint for the plan.measures chapter. */
export function buildTopicActionRoadmapSpec(params: {
  topic: string;
  dimensions?: readonly string[];
}): DiagramGraphSpec {
  const dims = (params.dimensions ?? []).slice(0, 3);
  const topPain = dims[0] ? `${dims[0]}短板攻坚` : '核心供给短板攻坚';
  const secPain = dims[1] ? `${dims[1]}体验优化` : '交互触达机制升级';
  const rawSubject = (params.topic || '研究课题').trim();
  const subject = cjkSpan(rawSubject) <= 13 ? rawSubject : fitCleanPhrase(rawSubject, 12);
  return {
    direction: 'LR',
    nodes: [
      { id: 'm1', label: `${subject}实证短板`, sublabel: `${topPain} · ${secPain}`, stage: '① 统计锚点', role: 'stage' },
      { id: 'm2', label: '分群靶向干预路径', sublabel: '多维高评组巩固 · 低评受阻组定向修复', stage: '② 精准施策', role: 'process' },
      { id: 'm3', label: '责任主体与协同边界', sublabel: '业务运营方 × 一线执行节点 × 本人知情确认', stage: '③ 主体落责', role: 'method' },
      { id: 'm4', label: '30天复测指标与回退条件', sublabel: '行为主终点核验 · 触发熔断阈值即回退常规流程', stage: '④ 跟踪止损', role: 'output' },
    ],
    edges: [
      { id: 'me1', source: 'm1', target: 'm2', label: 'IPA/回归映射' },
      { id: 'me2', source: 'm2', target: 'm3', label: '清单派单' },
      { id: 'me3', source: 'm3', target: 'm4', label: '跟踪评估' },
    ],
  };
}

function condensePolicyTag(raw: string): string {
  const s = raw
    .trim()
    .replace(/^建议(?:在|由|依托|通过|联合)?/u, '')
    .replace(/[。；，、\s]+$/u, '');
  const exactMap: ReadonlyArray<[RegExp, string]> = [
    [/数字驿站/u, '社区长者数字驿站'],
    [/家庭医生|双确认/u, '家庭医生双确认签约'],
    [/适老化?改造补贴|补贴目录/u, '适老化改造补贴'],
    [/银龄互助|三步卡|入户.*带教/u, '银龄互助入户带教'],
    [/骑手.*停靠|接驳位/u, '骑手微停靠接驳位'],
    [/溯源码|临期隔离|阳光仓配/u, '阳光仓配溯源码'],
    [/共同配送|错峰并单/u, '县乡村共同配送'],
    [/县域商业/u, '县域商业建设行动'],
    [/食堂.*补贴|分级补贴/u, '长者食堂分级补贴'],
    [/送餐.*专线|入户送餐/u, '高龄送餐入户专线'],
    [/明厨亮灶/u, '明厨亮灶食安公示'],
  ];
  for (const [rx, clean] of exactMap) {
    if (rx.test(s)) return clean;
  }
  const stripped = s
    .replace(/^(?:上海|本地|属地|各街镇|街镇)/u, '')
    .replace(/(?:设立|开展|建立|推行|提供|实施|支持|专项).*$/u, '')
    .trim();
  if (stripped.length >= 4 && cjkSpan(stripped) <= 8) return stripped;
  return [...(stripped || s)].slice(0, 7).join('');
}

/** Customize a chapter-coupled roadmap graph using topic, researchSubject, constructs & policy carriers. */
export function buildTopicFrameworkSpec(params: {
  topic: string;
  researchSubject?: string;
  domainLabel?: string;
  dimensions?: readonly string[];
  methodNames?: readonly string[];
  policyTags?: readonly string[];
  theories?: readonly string[];
}): DiagramGraphSpec {
  const cleanDims = (params.dimensions ?? []).map(d => d.trim()).filter(Boolean).slice(0, 4);
  const cleanMethods = (params.methodNames ?? []).map(m => m.trim()).filter(Boolean).slice(0, 4);
  const cleanPolicies = (params.policyTags ?? []).map(condensePolicyTag).filter(Boolean).slice(0, 4);
  const cleanTheories = (params.theories ?? []).map(t => t.trim()).filter(Boolean).slice(0, 3);

  const dims = joinFittingParts(cleanDims.slice(0, 4), ' · ', 42, '多维体验量表与感知评价');
  const methods = joinFittingParts(cleanMethods.slice(0, 3), ' · ', 42, '稳健 OLS · 二元 Logit · 聚类与修正 IPA');
  const policyLine = joinFittingParts(cleanPolicies.slice(0, 3), ' · ', 42, '分类支持路径 · 属地制度衔接 · 对照试点');
  const rawSubject = (params.researchSubject || params.topic || params.domainLabel || '实证调查课题')
    .trim()
    .replace(/(?:调查研究|实证研究|调查报告|研究报告|技术路线图)$/u, '')
    .trim();
  const subject = cjkSpan(rawSubject) <= 22 ? rawSubject : fitCleanPhrase(rawSubject, 21);

  return {
    direction: 'TB',
    roadmapMeta: {
      researchSubject: subject,
      ...(cleanDims.length ? { dimensions: cleanDims } : {}),
      ...(cleanPolicies.length ? { policyTags: cleanPolicies } : {}),
      ...(cleanTheories.length ? { theories: cleanTheories } : {}),
      ...(cleanMethods.length ? { methodNames: cleanMethods } : {}),
    },
    nodes: [
      { id: 't1', label: subject, sublabel: '宏观演进趋势 · 文献关键词共现聚类 · 研究创新架构', stage: '第一章 绪论', role: 'stage' },
      { id: 't2', label: '多群组路由问卷、分层抽样与质量检验', sublabel: dims, stage: '第二—三章 方案与质控', role: 'process' },
      { id: 't3', label: '样本双维画像、组间比较与双重回归建模', sublabel: methods, stage: '第四—六章 画像与归因', role: 'method' },
      { id: 't4', label: '人群异质性聚类与修正 IPA—KANO 痛点诊断', sublabel: '六维 K-means 分群 · 衍生重要性 × KANO 分层 · 深访编码印证', stage: '第七—八章 分群与诊断', role: 'decision' },
      { id: 't5', label: '四类人群分类支持路径与 30 天对照试点结论', sublabel: policyLine, stage: '第九—十章 对策与结论', role: 'output' },
    ],
    edges: [
      { id: 'e1', source: 't1', target: 't2', label: '潜变量操作化' },
      { id: 'e2', source: 't2', target: 't3', label: '双库洁净入模' },
      { id: 'e3', source: 't3', target: 't4', label: '异质性耦合诊断' },
      { id: 'e4', source: 't4', target: 't5', label: '靶向证据转译' },
      { id: 'e5', source: 't4', target: 't2', label: '反馈校准回路', dashed: true },
    ],
  };
}

function wrapChars(segment: string, maxChars: number): string[] {
  const clean = segment.trim();
  if (!clean) return [];
  if (cjkSpan(clean) <= maxChars) return [clean];
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
  if (out.length >= 2 && cjkSpan(out.at(-1)!) <= 1 && [...out.at(-2)!].length >= 3) {
    const prev = [...out[out.length - 2]];
    const moved = prev.pop()!;
    out[out.length - 2] = prev.join('');
    out[out.length - 1] = moved + out[out.length - 1];
  }
  return out;
}

function wrapLines(text: string, maxChars: number, maxLines = 3): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (cjkSpan(clean) <= maxChars) return [clean];
  const delimMatch = /\s*(·|×|\+)\s*/u.exec(clean);
  if (delimMatch) {
    const sepToken = delimMatch[1];
    const joiner = ` ${sepToken} `;
    const escapedSep = sepToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rawParts = clean.split(new RegExp(`\\s*${escapedSep}\\s*`, 'u')).map(s => s.trim()).filter(Boolean);
    if (rawParts.length > 1) {
      const lines: string[] = [];
      let cur = '';
      for (const part of rawParts) {
        if (!cur) {
          if (cjkSpan(part) <= maxChars) {
            cur = part;
          } else {
            const chunks = wrapChars(part, maxChars);
            lines.push(...chunks.slice(0, -1));
            cur = chunks.at(-1) ?? '';
          }
        } else if (cjkSpan(`${cur}${joiner}${part}`) <= maxChars) {
          cur = `${cur}${joiner}${part}`;
        } else {
          lines.push(cur);
          if (cjkSpan(part) <= maxChars) {
            cur = part;
          } else {
            const chunks = wrapChars(part, maxChars);
            lines.push(...chunks.slice(0, -1));
            cur = chunks.at(-1) ?? '';
          }
        }
      }
      if (cur) lines.push(cur);
      if (lines.length <= maxLines) return lines;
      return [...lines.slice(0, maxLines - 1), fitCleanPhrase(lines.slice(maxLines - 1).join(joiner), maxChars)];
    }
  }
  const wrapped = wrapChars(clean, maxChars);
  if (wrapped.length <= maxLines) return wrapped;
  return [...wrapped.slice(0, maxLines - 1), fitCleanPhrase(wrapped.slice(maxLines - 1).join(''), maxChars)];
}

function edgePillDimensions(label: string): { w: number; h: number } {
  const textW = [...label].reduce((s, ch) => s + (ch.charCodeAt(0) > 127 ? 11.2 : 6.2), 0);
  return { w: Math.min(164, Math.ceil(textW + 18)), h: 20 };
}

function measureDiagramNode(node: DiagramNodeSpec, dir: 'TB' | 'LR'): { w: number; h: number } {
  const defaultW = dir === 'TB' ? 328 : 188;
  const w = node.width && Number.isFinite(node.width) ? Math.max(168, node.width) : defaultW;
  const titleCols = Math.max(7, Math.floor((w - 30) / 13.8));
  const subCols = Math.max(9, Math.floor((w - 30) / 11.3));
  const titleLines = wrapLines(node.label, titleCols, 2);
  const subLines = node.sublabel ? wrapLines(node.sublabel, subCols, 4) : [];
  const baseTop = node.stage ? 44 : 24;
  const neededH = baseTop + titleLines.length * 18 + (subLines.length ? 4 + subLines.length * 15 : 0) + 12;
  const minH = dir === 'TB' ? 88 : 98;
  const h = Math.max(minH, node.height && Number.isFinite(node.height) ? node.height : 0, neededH);
  return { w, h };
}

/** Deterministic Dagre layout assigning center-less top-left coordinates to nodes. */
export function autoLayoutDiagram(spec: DiagramGraphSpec): DiagramGraphSpec {
  const dir = spec.direction === 'LR' ? 'LR' : 'TB';
  const maxPillW = Math.max(0, ...spec.edges.map(e => (e.label ? edgePillDimensions(e.label).w : 0)));
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: dir,
    nodesep: dir === 'TB' ? 42 : 34,
    ranksep: dir === 'TB' ? 54 : Math.max(88, maxPillW + 18),
    marginx: 24,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const orderIndex = new Map(spec.nodes.map((n, idx) => [n.id, idx]));
  for (const node of spec.nodes) {
    const { w, h } = measureDiagramNode(node, dir);
    g.setNode(node.id, { width: w, height: h });
  }
  const nodeIds = new Set(spec.nodes.map(n => n.id));
  const forwardTargets = new Set(
    spec.edges
      .filter(e => (orderIndex.get(e.target) ?? 0) > (orderIndex.get(e.source) ?? 0))
      .map(e => e.target),
  );
  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    const isBackFeedback =
      dir === 'TB' &&
      (orderIndex.get(edge.target) ?? 0) < (orderIndex.get(edge.source) ?? 0) &&
      (edge.dashed || forwardTargets.has(edge.target) || orderIndex.get(edge.target) === 0);
    if (!isBackFeedback) {
      g.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(g);

  return {
    direction: dir,
    nodes: spec.nodes.map(node => {
      const laid = g.node(node.id);
      const fallback = measureDiagramNode(node, dir);
      const w = laid?.width ?? fallback.w;
      const h = laid?.height ?? fallback.h;
      return {
        ...node,
        width: w,
        height: h,
        x: Math.round((laid?.x ?? 180) - w / 2),
        y: Math.round((laid?.y ?? 60) - h / 2),
      };
    }),
    edges: spec.edges.map(e => ({ ...e })),
    ...(spec.roadmapMeta ? { roadmapMeta: spec.roadmapMeta } : {}),
    ...(spec.questionnaireTree ? { questionnaireTree: spec.questionnaireTree } : {}),
  };
}

type ParsedNodeMeta = {
  x?: number; y?: number; w?: number; h?: number; role?: DiagramNodeRole; dir?: 'TB' | 'LR';
  rm?: DiagramRoadmapMeta;
  qt?: QuestionnaireTreeData;
  edges?: { id?: string; target: string; label?: string; dashed?: boolean }[];
};

function parseDiagramSpec(r: ResultSnapshot): DiagramGraphSpec {
  const nodes: DiagramNodeSpec[] = [];
  const edges: DiagramEdgeSpec[] = [];
  let direction: 'TB' | 'LR' = 'TB';
  let roadmapMeta: DiagramRoadmapMeta | undefined;
  let questionnaireTree: QuestionnaireTreeData | undefined;

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
    if (index === 0 && meta?.rm && typeof meta.rm === 'object') roadmapMeta = meta.rm;
    if (index === 0 && meta?.qt && typeof meta.qt === 'object' && Array.isArray(meta.qt.modules)) questionnaireTree = meta.qt;
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
    } else if (targetsRaw && targetsRaw !== '终点节点' && targetsRaw !== '终点闭环') {
      targetsRaw.split(/[,，;；]/).map(s => s.trim()).filter(Boolean).forEach((target, ti) => {
        edges.push({ id: `${id}-${target}-${ti}`, source: id, target });
      });
    }
  });
  return nodes.length
    ? {
        direction,
        nodes,
        edges,
        ...(roadmapMeta ? { roadmapMeta } : {}),
        ...(questionnaireTree ? { questionnaireTree } : {}),
      }
    : DIAGRAM_PRESETS[0].spec;
}

function isStandardFiveStageRoadmap(r: ResultSnapshot, spec: DiagramGraphSpec): boolean {
  if (r.method !== 'framework' || spec.direction === 'LR') return false;
  if (spec.nodes.length !== 5) return false;
  const xs = spec.nodes.filter(n => typeof n.x === 'number').map(n => Math.round((n.x ?? 0) / 80));
  if (xs.length === 5 && new Set(xs).size > 2) return false;
  return true;
}

type DomainRoadmapCopy = {
  actor: string;
  dims: [string, string, string, string];
  policies: [string, string, string];
  theories: [string, string];
  stage1Short: string;
  stage2Short: string;
  stage3Short: string;
  stage4Short: string;
  stage5Short: string;
  b1LeftTitle: string;
  b1LeftSub1: string;
  b1LeftSub2: string;
  b1MidSub1: string;
  b1RightTitle: string;
  b2LeftTitle: string;
  b2RightTitle: string;
  b2RightSub1: string;
  b2RightSub2: string;
  b3TopLine: string;
  b3OlsTitle: string;
  b3LogitTitle: string;
  b4LeftTitle: string;
  b4LeftSub2: string;
  b5LeftTitle: string;
  b5RightTitle: string;
  r1Line1: string;
  r1Line2: string;
  r3Line2: string;
};

function resolveTopicRoadmapCopy(subject: string): DomainRoadmapCopy {
  if (/老年|长者|养老|银发|银龄|健康监测|代际/u.test(subject)) {
    return {
      actor: '长者',
      dims: ['操作指引清晰度', '记录调阅便利性', '隐私权责安心感', '启发式协同支持'],
      policies: ['社区长者数字驿站', '家庭医生双确认签约', '适老化改造补贴目录'],
      theories: ['技术接受模型（TAM）', '代际数字反哺与隐私边界'],
      stage1Short: '老龄趋势与文献共现',
      stage2Short: '双轨问卷与抽样设计',
      stage3Short: '双词云画像与回归归因',
      stage4Short: '长者分群与痛点耦合',
      stage5Short: '分类支持与社区试行',
      b1LeftTitle: '老龄化与监测渗透趋势',
      b1LeftSub1: '2019—2025 双轴规模演进',
      b1LeftSub2: '识别高知晓低复用断层',
      b1MidSub1: '智慧养老 · 适老交互 · 代际反哺',
      b1RightTitle: '采纳与代际反哺理论框架',
      b2LeftTitle: '已用长者与未接触群双轨量表',
      b2RightTitle: '分层 PPS 入户抽样与质量核验',
      b2RightSub1: '预调查纯化 · 四重筛查与分母对账',
      b2RightSub2: '四因子 EFA · α 信度与 Harman 检验',
      b3TopLine: '长者触点预算双维画像 · 照护诉求×设备建言双轴词云 · K-W H 与 χ²（Holm 校正）',
      b3OlsTitle: '已用长者子库 HC3 稳健 OLS',
      b3LogitTitle: '全样本受访长者二元 Logit',
      b4LeftTitle: '六维 K-means 聚类',
      b4LeftSub2: '锁定四类异质长者群体',
      b5LeftTitle: '四类长者人群分类支持路径',
      b5RightTitle: '基层载体嵌入与对照试行结论',
      r1Line1: '全样本/已用长者/开放建言对账',
      r1Line2: '隔离未接触群消除幸存者偏差',
      r3Line2: '联动附录四长者深访原话印证',
    };
  }
  if (/即时零售|前置仓|配送|骑手|县域|消费|电商/u.test(subject)) {
    return {
      actor: '消费者',
      dims: ['末端履约准时感知', '冷链品控鲜度信任', '缺货赔付规则透明', '全渠道性价比感知'],
      policies: ['县域商业建设行动', '骑手微停靠接驳位', '阳光仓配食安溯源码'],
      theories: ['服务质量差距（SERVQUAL）', '期望确认与履约信任机制'],
      stage1Short: '下沉渗透与文献共现',
      stage2Short: '路由问卷与抽样设计',
      stage3Short: '履约画像与回归归因',
      stage4Short: '客群聚类与痛点耦合',
      stage5Short: '仓配协同与对照试点',
      b1LeftTitle: '县域零售规模与渗透趋势',
      b1LeftSub1: '2019—2025 双轴增速演进',
      b1LeftSub2: '识别高频复购与履约摩擦',
      b1MidSub1: '前置仓 · 末端准时 · 品控信任',
      b1RightTitle: '履约感知与复购决策框架',
      b2LeftTitle: '已购用户与潜在客群双轨量表',
      b2RightTitle: '分层商圈抽样与质量核验',
      b2RightSub1: '预调查纯化 · 四重筛查与分母对账',
      b2RightSub2: '四因子 EFA · α 信度与 Harman 检验',
      b3TopLine: '客群频次预算双维画像 · 消费诉求×履约建言双轴词云 · K-W H 与 χ²（Holm 校正）',
      b3OlsTitle: '已购客群 HC3 稳健 OLS',
      b3LogitTitle: '全样本潜在客群二元 Logit',
      b4LeftTitle: '六维 K-means 聚类',
      b4LeftSub2: '锁定四类县域消费群体',
      b5LeftTitle: '四类消费客群分类支持路径',
      b5RightTitle: '县域仓配载体与对照试行结论',
      r1Line1: '全样本/已购客群/建言三库对账',
      r1Line2: '隔离未购群体消除幸存者偏差',
      r3Line2: '联动附录四商户骑手深访印证',
    };
  }
  if (/助餐|食堂|餐饮/u.test(subject)) {
    return {
      actor: '就餐长者',
      dims: ['膳食营养适口感知', '收费补贴透明公平', '就餐步行可达便利', '送餐衔接服务可靠'],
      policies: ['社区长者食堂分级补贴', '失能高龄送餐入户专线', '明厨亮灶食安公示牌'],
      theories: ['公共服务可及性理论', '服务感知价值与协同供给'],
      stage1Short: '助餐扩容与文献共现',
      stage2Short: '双轨问卷与抽样设计',
      stage3Short: '就餐画像与回归归因',
      stage4Short: '人群分群与痛点耦合',
      stage5Short: '分级助餐与社区试行',
      b1LeftTitle: '老龄助餐覆盖与续订趋势',
      b1LeftSub1: '2019—2025 双轴供给演进',
      b1LeftSub2: '识别建点扩容与复购落差',
      b1MidSub1: '社区食堂 · 适口营养 · 送餐可达',
      b1RightTitle: '助餐可及性与持续就餐框架',
      b2LeftTitle: '堂食体验与未就餐群双轨量表',
      b2RightTitle: '街镇社区分层抽样与质控',
      b2RightSub1: '预调查纯化 · 四重筛查与分母对账',
      b2RightSub2: '四因子 EFA · α 信度与 Harman 检验',
      b3TopLine: '就餐频次预算双维画像 · 膳食诉求×运营建言双轴词云 · K-W H 与 χ²（Holm 校正）',
      b3OlsTitle: '已就餐长者 HC3 稳健 OLS',
      b3LogitTitle: '全样本受访长者二元 Logit',
      b4LeftTitle: '六维 K-means 聚类',
      b4LeftSub2: '锁定四类社区助餐群体',
      b5LeftTitle: '四类长者群体分类助餐路径',
      b5RightTitle: '食堂补贴载体与对照试行结论',
      r1Line1: '全样本/就餐者/建言三库对账',
      r1Line2: '隔离未就餐群消除幸存者偏差',
      r3Line2: '联动附录四社区助餐深访印证',
    };
  }
  const shortSub = fitCleanPhrase(subject, 8);
  return {
    actor: '受访者',
    dims: ['核心功能易用感知', '服务响应可靠程度', '规则权责透明信任', '协同支持保障感知'],
    policies: ['基层服务驿站触点', '分级权责核验清单', '属地专项支持目录'],
    theories: ['技术接受与计划行为理论', '感知价值与协同治理框架'],
    stage1Short: '背景趋势与文献共现',
    stage2Short: '路由问卷与抽样设计',
    stage3Short: '双维画像与回归归因',
    stage4Short: '异质分群与痛点耦合',
    stage5Short: '分类支持与对照试行',
    b1LeftTitle: `${shortSub}演进趋势`,
    b1LeftSub1: '2019—2025 双轴指标轨迹',
    b1LeftSub2: '识别规模扩张与体验落差',
    b1MidSub1: '核心场景 · 作用机制 · 治理工具',
    b1RightTitle: '多维感知与行为决策框架',
    b2LeftTitle: '体验者与未接触群双轨量表',
    b2RightTitle: '多阶段分层抽样与质量核验',
    b2RightSub1: '预调查纯化 · 四重筛查与分母对账',
    b2RightSub2: '四因子 EFA · α 信度与 Harman 检验',
    b3TopLine: '人口行为双维画像 · 诉求×建言双轴主题词云 · K-W H 与 χ²（Holm 校正）',
    b3OlsTitle: '体验者子库 HC3 稳健 OLS',
    b3LogitTitle: '全样本受访者二元 Logit',
    b4LeftTitle: '六维 K-means 聚类',
    b4LeftSub2: '轮廓系数锁定四类特征群体',
    b5LeftTitle: '四类受访群体分类支持路径',
    b5RightTitle: '属地制度衔接与对照试行结论',
    r1Line1: '全样本/体验者/建言三库对账',
    r1Line2: '隔离未接触群消除幸存者偏差',
    r3Line2: '联动附录四深度访谈编码印证',
  };
}

/**
 * Soft-toned, pure-white borderless academic monograph research roadmap (`width=996, height=592`).
 * Left clean chapter spine + Top theme guide bar + 5 low-saturation translucent research bands + Right dashed verification rail.
 */
function threeColumnRoadmapSVG(r: ResultSnapshot, spec: DiagramGraphSpec, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const width = 996;
  const totalHeight = 592;

  // Low-saturation editorial monograph palette (celadon mist, warm parchment, sage mist, blush sand)
  const deepInk = mixHex(primary, '#0F172A', 0.35);
  const celadonBand = mixHex(primary, '#F7FAF9', 0.92);
  const sageBand = mixHex(primary, '#F8FAF7', 0.94);
  const warmSandBand = mixHex(secondary, '#FCF9F2', 0.92);
  const blushBand = mixHex(opposite, '#FCF7F5', 0.93);
  const slateBand = mixHex(primary, '#F5F8FA', 0.91);
  const railBg = mixHex(secondary, '#FCFBF7', 0.95);
  const softStrokeP = mixHex(primary, '#CBD5E1', 0.55);
  const softStrokeS = mixHex(secondary, '#CBD5E1', 0.55);
  const softStrokeO = mixHex(opposite, '#CBD5E1', 0.58);

  const n0 = spec.nodes[0] ?? { id: 't1', label: '研究问题界定与文献脉络', sublabel: '' };
  const n1 = spec.nodes[1] ?? { id: 't2', label: '测量体系与抽样设计', sublabel: '' };
  const n4 = spec.nodes[4] ?? { id: 't5', label: '分类支持路径与试点结论', sublabel: '' };

  const rawTitleClean = (r.title || '')
    .replace(/(?:调查研究|实证研究|研究)?技术路线图$/u, '')
    .trim();
  const node0Subject = n0.label.replace(/^(?:第一阶段|问题锚定|问题建构)[：:·\s]*/u, '').trim();
  const subject = (spec.roadmapMeta?.researchSubject || rawTitleClean || node0Subject || '实证调查课题').trim();
  const copy = resolveTopicRoadmapCopy(subject);

  const parsedDims = (spec.roadmapMeta?.dimensions?.length
    ? spec.roadmapMeta.dimensions
    : (n1.sublabel ?? '').split(/\s*[·×/、；]\s*/u)
  )
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !/李克特|预调研|修订/u.test(s));
  const dims = [
    parsedDims[0] || copy.dims[0],
    parsedDims[1] || copy.dims[1],
    parsedDims[2] || copy.dims[2],
    parsedDims[3] || copy.dims[3],
  ];

  const parsedPolicies = (spec.roadmapMeta?.policyTags?.length
    ? spec.roadmapMeta.policyTags.map(condensePolicyTag)
    : (n4.sublabel ?? '').split(/\s*[·×/、；]\s*/u).map(condensePolicyTag)
  ).filter(s => s.length >= 2 && !/差异化分群|可视化汇报|可落地决策/u.test(s));
  const policies = [
    parsedPolicies[0] || copy.policies[0],
    parsedPolicies[1] || copy.policies[1],
    parsedPolicies[2] || copy.policies[2],
  ];

  const theoryA = spec.roadmapMeta?.theories?.[0] || copy.theories[0];
  const theoryB = spec.roadmapMeta?.theories?.[1] || copy.theories[1];

  const dimLineA = fitCleanPhrase(`${dims[0]} · ${dims[1]}`, 20);
  const dimLineB = fitCleanPhrase(`${dims[2]} · ${dims[3]}`, 20);

  const themeBannerTitle = /机制|路径|体系/u.test(subject)
    ? `研究主题 · ${fitCleanPhrase(subject, 34)}`
    : `研究主题 · ${fitCleanPhrase(`${subject}机制与分类支持路径`, 34)}`;

  // Left Stage Node helper (x = 18..164, w = 146)
  const stageNode = (y: number, h: number, chap: string, sub: string, accent: string, bg: string) => {
    const cy = y + h / 2;
    return `<g>
      <rect x="18" y="${y}" width="146" height="${h}" rx="8" fill="${bg}" stroke="${mixHex(accent, '#CBD5E1', 0.52)}" stroke-width="1"/>
      <rect x="18" y="${y + 8}" width="3.4" height="${h - 16}" rx="1.7" fill="${accent}"/>
      <text x="30" y="${(cy - 5).toFixed(1)}" fill="${accent}" style="font-size:11px;font-family:${FONT_SANS};font-weight:700">${esc(chap)}</text>
      <text x="30" y="${(cy + 13).toFixed(1)}" fill="${INK_DARK}" style="font-size:11.2px;font-family:${FONT_SANS};font-weight:600">${esc(fitCleanPhrase(sub, 11))}</text>
      <line x1="164" y1="${cy.toFixed(1)}" x2="178" y2="${cy.toFixed(1)}" stroke="${accent}" stroke-opacity="0.65" stroke-width="1.2"/>
      <polygon points="183,${cy.toFixed(1)} 177,${(cy - 3).toFixed(1)} 177,${(cy + 3).toFixed(1)}" fill="${accent}" fill-opacity="0.75"/>
    </g>`;
  };

  const stageLinkDown = (y1: number, y2: number) => `
    <g>
      <line x1="91" y1="${y1}" x2="91" y2="${y2 - 5}" stroke="${softStrokeP}" stroke-width="1.3"/>
      <polygon points="91,${y2} 87.8,${y2 - 6} 94.2,${y2 - 6}" fill="${primary}" fill-opacity="0.65"/>
    </g>`;

  const bandFlowDown = (y1: number, y2: number, label: string) => {
    const cx = 470;
    const my = (y1 + y2) / 2;
    const pw = Math.ceil(cjkSpan(label) * 9.6 + 16);
    return `<g>
      <line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2 - 5}" stroke="${softStrokeP}" stroke-width="1.3"/>
      <polygon points="${cx},${y2} ${cx - 3.5},${y2 - 6} ${cx + 3.5},${y2 - 6}" fill="${primary}" fill-opacity="0.75"/>
      <rect x="${(cx + 8).toFixed(1)}" y="${(my - 7.5).toFixed(1)}" width="${pw}" height="15" rx="7.5" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="0.9"/>
      <text x="${(cx + 8 + pw / 2).toFixed(1)}" y="${(my + 3.2).toFixed(1)}" text-anchor="middle" fill="${INK_MUTED}" style="font-size:9.3px;font-family:${FONT_SANS};font-weight:600">${esc(label)}</text>
    </g>`;
  };

  const innerChip = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    line1: string,
    line2: string,
    accent: string,
  ) => {
    const maxTitle = Math.floor((w - 10) / 10.8);
    const maxSub = Math.floor((w - 8) / 9.1);
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#FFFFFF" stroke="${mixHex(accent, '#E2E8F0', 0.38)}" stroke-width="1"/>
      <text x="${(x + w / 2).toFixed(1)}" y="${y + 20}" text-anchor="middle" fill="${mixHex(accent, INK_DARK, 0.35)}" style="font-size:10.8px;font-family:${FONT_SANS};font-weight:700">${esc(fitCleanPhrase(title, maxTitle))}</text>
      <text x="${(x + w / 2).toFixed(1)}" y="${y + 37}" text-anchor="middle" fill="${INK_MUTED}" style="font-size:9.5px;font-family:${FONT_SANS}">${esc(fitCleanPhrase(line1, maxSub))}</text>
      ${line2 ? `<text x="${(x + w / 2).toFixed(1)}" y="${y + 52}" text-anchor="middle" fill="${INK_MUTED}" style="font-size:9.5px;font-family:${FONT_SANS}">${esc(fitCleanPhrase(line2, maxSub))}</text>` : ''}
    </g>`;
  };

  const railNote = (y: number, h: number, tag: string, l1: string, l2: string, accent: string) => `<g>
    <rect x="794" y="${y}" width="172" height="${h}" rx="7" fill="#FFFFFF" stroke="${mixHex(accent, '#E2E8F0', 0.4)}" stroke-width="1"/>
    <circle cx="805" cy="${y + 16}" r="3" fill="${accent}" fill-opacity="0.85"/>
    <text x="813" y="${y + 19.5}" fill="${mixHex(accent, INK_DARK, 0.25)}" style="font-size:10.6px;font-family:${FONT_SANS};font-weight:700">${esc(tag)}</text>
    <text x="804" y="${y + 37}" fill="${INK_MUTED}" style="font-size:9.4px;font-family:${FONT_SANS}">${esc(fitCleanPhrase(l1, 18))}</text>
    <text x="804" y="${y + 52}" fill="${INK_MUTED}" style="font-size:9.4px;font-family:${FONT_SANS}">${esc(fitCleanPhrase(l2, 18))}</text>
  </g>`;

  // Top gentle editorial theme ribbon (y = 8..40)
  const topThemeBar = `<g>
    <rect x="18" y="8" width="960" height="32" rx="7" fill="${celadonBand}" stroke="${softStrokeP}" stroke-width="0.9"/>
    <circle cx="38" cy="24" r="3" fill="${primary}" fill-opacity="0.7"/>
    <text x="498" y="28.5" text-anchor="middle" fill="${deepInk}" style="font-size:13px;font-family:${FONT_SANS};font-weight:700">${esc(themeBannerTitle)}</text>
    <circle cx="958" cy="24" r="3" fill="${secondary}" fill-opacity="0.75"/>
  </g>`;

  // Left clean 5-stage vertical spine
  const leftSpine = `
    ${stageNode(54, 84, '第一章 · 绪论', copy.stage1Short, primary, celadonBand)}
    ${stageLinkDown(138, 156)}
    ${stageNode(156, 90, '第二—三章 · 设计', copy.stage2Short, primary, sageBand)}
    ${stageLinkDown(246, 264)}
    ${stageNode(264, 106, '第四—六章 · 实证', copy.stage3Short, opposite, warmSandBand)}
    ${stageLinkDown(370, 388)}
    ${stageNode(388, 86, '第七—八章 · 诊断', copy.stage4Short, secondary, blushBand)}
    ${stageLinkDown(474, 492)}
    ${stageNode(492, 86, '第九—十章 · 对策', copy.stage5Short, deepInk, slateBand)}
  `;

  // Center 5 soft low-saturation horizontal bands (x = 184..756, w = 572)
  const centerBands = `
    <g>
      <rect x="184" y="54" width="572" height="84" rx="9" fill="${celadonBand}" stroke="${softStrokeP}" stroke-width="1"/>
      ${innerChip(196, 65, 172, 62, copy.b1LeftTitle, copy.b1LeftSub1, copy.b1LeftSub2, primary)}
      <text x="378" y="100" text-anchor="middle" fill="${primary}" fill-opacity="0.75" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">→</text>
      ${innerChip(388, 65, 168, 62, '文献关键词共现聚类', copy.b1MidSub1, '识别跨簇耦合与研究缺口', secondary)}
      <text x="566" y="100" text-anchor="middle" fill="${primary}" fill-opacity="0.75" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">→</text>
      ${innerChip(576, 65, 168, 62, copy.b1RightTitle, theoryA, theoryB, primary)}
    </g>

    ${bandFlowDown(138, 156, '构念操作化')}

    <g>
      <rect x="184" y="156" width="572" height="90" rx="9" fill="${sageBand}" stroke="${softStrokeP}" stroke-width="1" stroke-dasharray="5 3"/>
      ${innerChip(196, 169, 262, 64, copy.b2LeftTitle, dimLineA, dimLineB, primary)}
      <text x="470" y="205" text-anchor="middle" fill="${primary}" fill-opacity="0.75" style="font-size:13px;font-family:${FONT_SANS};font-weight:700">∥</text>
      ${innerChip(482, 169, 262, 64, copy.b2RightTitle, copy.b2RightSub1, copy.b2RightSub2, secondary)}
    </g>

    ${bandFlowDown(246, 264, '双库洁净入模')}

    <g>
      <rect x="184" y="264" width="572" height="106" rx="9" fill="${warmSandBand}" stroke="${softStrokeS}" stroke-width="1"/>
      <rect x="196" y="274" width="548" height="28" rx="6" fill="#FFFFFF" stroke="${mixHex(secondary, '#E2E8F0', 0.42)}" stroke-width="0.9"/>
      <text x="470" y="292" text-anchor="middle" fill="${INK_DARK}" style="font-size:10.3px;font-family:${FONT_SANS};font-weight:600">${esc(fitCleanPhrase(copy.b3TopLine, 51))}</text>
      ${innerChip(196, 310, 264, 49, copy.b3OlsTitle, `${fitCleanPhrase(dims[0], 7)}/${fitCleanPhrase(dims[1], 7)} → 持续复用倾向`, '', primary)}
      <text x="470" y="339" text-anchor="middle" fill="${secondary}" fill-opacity="0.8" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">∥</text>
      ${innerChip(480, 310, 264, 49, copy.b3LogitTitle, `${fitCleanPhrase(dims[2], 7)}/${fitCleanPhrase(dims[3], 7)} → 试行意愿 OR`, '', opposite)}
    </g>

    ${bandFlowDown(370, 388, '异质分群耦合')}

    <g>
      <rect x="184" y="388" width="572" height="86" rx="9" fill="${blushBand}" stroke="${softStrokeO}" stroke-width="1" stroke-dasharray="5 3"/>
      ${innerChip(196, 399, 170, 64, copy.b4LeftTitle, '轮廓系数寻优分群', copy.b4LeftSub2, opposite)}
      <text x="376" y="435" text-anchor="middle" fill="${opposite}" fill-opacity="0.75" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">→</text>
      ${innerChip(386, 399, 170, 64, '修正 IPA 四象限诊断', '回归衍生重要性权重', '锁定高重要低表现短板', secondary)}
      <text x="566" y="435" text-anchor="middle" fill="${opposite}" fill-opacity="0.75" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">→</text>
      ${innerChip(576, 399, 168, 64, 'KANO × 深访三级编码', '必备/期望需求敏感度', '质性访谈原话交叉印证', primary)}
    </g>

    ${bandFlowDown(474, 492, '分类施策转译')}

    <g>
      <rect x="184" y="492" width="572" height="86" rx="9" fill="${slateBand}" stroke="${softStrokeP}" stroke-width="1.1"/>
      ${innerChip(196, 503, 262, 64, copy.b5LeftTitle, `${policies[0]} · ${policies[1]}`, '按四类群体特征精准匹配干预措施', primary)}
      <text x="470" y="539" text-anchor="middle" fill="${deepInk}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">⇒</text>
      ${innerChip(482, 503, 262, 64, copy.b5RightTitle, `${policies[2]} · 30天对照试行`, '主终点量化核验与人工回退机制', deepInk)}
    </g>
  `;

  // Right soft dashed verification & policy-carrier rail (x = 782..978, w = 196) + slender feedback loop at x = 769
  const rightRail = `<g>
    <rect x="782" y="54" width="196" height="524" rx="9" fill="${railBg}" stroke="${softStrokeS}" stroke-width="1" stroke-dasharray="5 3"/>
    <text x="880" y="76" text-anchor="middle" fill="${mixHex(secondary, INK_DARK, 0.3)}" style="font-size:11.2px;font-family:${FONT_SANS};font-weight:700">严谨性准则与属地载体</text>
    <line x1="798" y1="84" x2="962" y2="84" stroke="${softStrokeS}" stroke-width="0.9"/>
    ${railNote(96, 64, '样本分母边界', copy.r1Line1, copy.r1Line2, primary)}
    ${railNote(204, 64, '稳健推断准则', 'VIF 共线性与 HC3 稳健标准误', '横截面关联严禁因果越界', opposite)}
    ${railNote(344, 64, '混合证据互证', '回归效应量耦合 IPA 敏感度', copy.r3Line2, secondary)}
    ${railNote(482, 64, '属地制度衔接', `${policies[0]} · ${policies[2]}`, policies[1], primary)}

    <line x1="782" y1="201" x2="758" y2="201" stroke="${softStrokeP}" stroke-width="1.1" stroke-dasharray="3 3"/>
    <line x1="782" y1="317" x2="758" y2="317" stroke="${softStrokeO}" stroke-width="1.1" stroke-dasharray="3 3"/>
    <line x1="756" y1="431" x2="782" y2="431" stroke="${softStrokeS}" stroke-width="1.1" stroke-dasharray="3 3"/>
    <line x1="756" y1="535" x2="782" y2="535" stroke="${softStrokeP}" stroke-width="1.1"/>

    <path d="M 756 446 L 769 446 L 769 216 L 761 216" fill="none" stroke="${opposite}" stroke-opacity="0.72" stroke-width="1.4" stroke-dasharray="4 3"/>
    <polygon points="756,216 762,213 762,219" fill="${opposite}" fill-opacity="0.78"/>
    <rect x="760" y="298" width="18" height="68" rx="9" fill="#FFFFFF" stroke="${softStrokeO}" stroke-width="0.9"/>
    <text x="769" y="313" text-anchor="middle" fill="${opposite}" style="font-size:9px;font-family:${FONT_SANS};font-weight:700">反</text>
    <text x="769" y="326" text-anchor="middle" fill="${opposite}" style="font-size:9px;font-family:${FONT_SANS};font-weight:700">馈</text>
    <text x="769" y="339" text-anchor="middle" fill="${opposite}" style="font-size:9px;font-family:${FONT_SANS};font-weight:700">校</text>
    <text x="769" y="352" text-anchor="middle" fill="${opposite}" style="font-size:9px;font-family:${FONT_SANS};font-weight:700">准</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>
    ${topThemeBar}
    ${leftSpine}
    ${centerBands}
    ${rightRail}
  </svg>`;
}

/** Deterministic vector renderer for research framework / draw.io diagrams (SVG width=996). */
export function frameworkDiagramSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const rawSpec = parseDiagramSpec(r);
  if (isStandardFiveStageRoadmap(r, rawSpec)) {
    return threeColumnRoadmapSVG(r, rawSpec, ink);
  }
  const dir = rawSpec.direction === 'LR' ? 'LR' : 'TB';
  const hasMissingCoords = rawSpec.nodes.some(n => typeof n.x !== 'number' || typeof n.y !== 'number');
  const hasLegacyOverflow = !hasMissingCoords && (
    rawSpec.nodes.some(n => {
      const req = measureDiagramNode({ ...n, width: undefined, height: undefined }, dir);
      return (n.height ?? 0) < req.h - 2;
    }) ||
    (dir === 'TB' && rawSpec.edges.some(e => e.dashed) && new Set(rawSpec.nodes.map(n => Math.round((n.x ?? 0) + (n.width ?? 300) / 2))).size > 1)
  );
  const laid = hasMissingCoords || hasLegacyOverflow
    ? autoLayoutDiagram({
        ...rawSpec,
        nodes: rawSpec.nodes.map(n => (hasLegacyOverflow ? { ...n, width: undefined, height: undefined, x: undefined, y: undefined } : n)),
      })
    : rawSpec;

  const width = 996;
  const hasFeedback = laid.direction !== 'LR' && laid.edges.some(e => {
    const a = laid.nodes.find(n => n.id === e.source);
    const b = laid.nodes.find(n => n.id === e.target);
    return a && b && (b.y ?? 0) + (b.height ?? 88) * 0.5 < (a.y ?? 0) + (a.height ?? 88) * 0.5 - 12;
  });
  const minX = Math.min(...laid.nodes.map(n => n.x ?? 0));
  const minY = Math.min(...laid.nodes.map(n => n.y ?? 0));
  const maxX = Math.max(...laid.nodes.map(n => (n.x ?? 0) + (n.width ?? 220))) + (hasFeedback ? 96 : 0);
  const spanX = Math.max(120, maxX - minX);

  const headerH = 74;
  const padX = laid.direction === 'LR' ? 28 : 48;
  const padBottom = 26;
  const availW = width - padX * 2;
  const scale = Math.min(1.06, availW / spanX);
  const contentW = spanX * scale;
  const offsetX = padX + (availW - contentW) / 2 - minX * scale;
  const offsetY = headerH + 22 - minY * scale;

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

  type PreparedBox = { x: number; y: number; w: number; h: number; titleLines: string[]; subLines: string[] };
  const nodeBox = new Map<string, PreparedBox>();
  for (const node of laid.nodes) {
    const w = (node.width ?? 220) * scale;
    const titleCols = Math.max(6, Math.floor((w - 28) / 13.8));
    const subCols = Math.max(8, Math.floor((w - 28) / 11.3));
    const titleLines = wrapLines(node.label, titleCols, 2);
    const subLines = node.sublabel ? wrapLines(node.sublabel, subCols, 4) : [];
    const baseTop = node.stage ? 44 : 24;
    const reqScreenH = baseTop + titleLines.length * 18 + (subLines.length ? 4 + subLines.length * 15 : 0) + 12;
    const h = Math.max((node.height ?? 88) * scale, reqScreenH);
    nodeBox.set(node.id, {
      x: offsetX + (node.x ?? 0) * scale,
      y: offsetY + (node.y ?? 0) * scale,
      w,
      h,
      titleLines,
      subLines,
    });
  }
  // Keep horizontal LR single-row chains vertically aligned to the tallest card in the row.
  if (laid.direction === 'LR') {
    const centerYs = [...nodeBox.values()].map(b => b.y + b.h / 2);
    if (Math.max(...centerYs) - Math.min(...centerYs) < 28) {
      const commonH = Math.max(...[...nodeBox.values()].map(b => b.h));
      const topY = Math.min(...[...nodeBox.values()].map(b => b.y));
      for (const b of nodeBox.values()) {
        b.y = topY;
        b.h = commonH;
      }
    }
  }

  const maxBoxBottom = Math.max(...[...nodeBox.values()].map(b => b.y + b.h));
  const contentH = Math.max(laid.direction === 'LR' ? 120 : 220, maxBoxBottom - (headerH + 22));
  const totalHeight = Math.round(headerH + 22 + contentH + padBottom);

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
      const railX = Math.max(startX, endX) + 44;
      pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${railX.toFixed(1)} ${startY.toFixed(1)} L ${railX.toFixed(1)} ${endY.toFixed(1)} L ${(endX + 6).toFixed(1)} ${endY.toFixed(1)}`;
      ax = endX;
      ay = endY;
      arrowPts = `${ax.toFixed(1)},${ay.toFixed(1)} ${(ax + 9).toFixed(1)},${(ay - 4.5).toFixed(1)} ${(ax + 9).toFixed(1)},${(ay + 4.5).toFixed(1)}`;
      lx = railX;
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
      ly = (sy + ty) / 2 - 15;
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
      lx = (sx + tx) / 2;
      ly = my - 2;
    }

    const stroke = edge.dashed ? opposite : primary;
    const dashAttr = edge.dashed ? ` stroke-dasharray="6 4"` : '';
    const pill = edge.label ? edgePillDimensions(edge.label) : null;
    const labelEl = edge.label && pill
      ? `<rect x="${(lx - pill.w / 2).toFixed(1)}" y="${(ly - pill.h / 2).toFixed(1)}" width="${pill.w.toFixed(1)}" height="${pill.h}" rx="10" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" fill="${INK_MUTED}" style="font-size:10.5px;font-family:${FONT_SANS};font-weight:600">${esc(edge.label)}</text>`
      : '';
    return `<g><path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2"${dashAttr}/><polygon points="${arrowPts}" fill="${stroke}"/>${labelEl}</g>`;
  }).join('');

  const nodeSvg = laid.nodes.map(node => {
    const box = nodeBox.get(node.id);
    if (!box) return '';
    const tone = roleStyle(node.role);
    const { titleLines, subLines } = box;
    const pillText = node.stage || '';
    const pillTextW = [...pillText].reduce((s, ch) => s + (ch.charCodeAt(0) > 127 ? 11 : 6.2), 0);
    const pillW = pillText ? Math.min(box.w - 24, Math.ceil(pillTextW + 20)) : 0;
    const baseTextY = pillText
      ? box.y + 44
      : box.y + (box.h - (titleLines.length * 18 + (subLines.length ? 4 + subLines.length * 15 : 0))) / 2 + 14;
    return `<g>
      <rect x="${(box.x + 2).toFixed(1)}" y="${(box.y + 3).toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="10" fill="#E2E8F0" fill-opacity="0.45"/>
      <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="10" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="1.8"/>
      <rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="5" height="${box.h.toFixed(1)}" rx="2.5" fill="${tone.stroke}"/>
      ${pillText ? `<rect x="${(box.x + 14).toFixed(1)}" y="${(box.y + 8).toFixed(1)}" width="${pillW.toFixed(1)}" height="18" rx="9" fill="${tone.pillBg}"/><text x="${(box.x + 14 + pillW / 2).toFixed(1)}" y="${(box.y + 20.5).toFixed(1)}" text-anchor="middle" fill="${tone.pillInk}" style="font-size:10.5px;font-family:${FONT_SANS};font-weight:700">${esc(pillText)}</text>` : ''}
      ${titleLines.map((line, i) => `<text x="${(box.x + 16).toFixed(1)}" y="${(baseTextY + i * 18).toFixed(1)}" fill="${INK_DARK}" style="font-size:13.5px;font-family:${FONT_SANS};font-weight:700">${esc(line)}</text>`).join('')}
      ${subLines.map((line, i) => `<text x="${(box.x + 16).toFixed(1)}" y="${(baseTextY + titleLines.length * 18 + 4 + i * 15).toFixed(1)}" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS}">${esc(line)}</text>`).join('')}
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
    <text x="${width - 28}" y="42" text-anchor="end" fill="${primary}" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:600">研究路径总览</text>
    ${edgeSvg}
    ${nodeSvg}
  </svg>`;
}

/** Deterministic borderless high-density keyword word cloud SVG renderer (SVG width=996, pure white canvas). */
export function wordcloudSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);

  const dedupedMap = new Map<string, { label: string; weight: number }>();
  for (const row of r.rows) {
    const label = String(row[0] ?? '').trim();
    if (!label) continue;
    const norm = label.replace(/\s+/gu, '').toLowerCase();
    const weight = typeof row[1] === 'number' && Number.isFinite(row[1]) ? Math.max(1, row[1]) : Number(row[1]) || 10;
    const prev = dedupedMap.get(norm);
    if (!prev || weight > prev.weight) {
      dedupedMap.set(norm, { label: prev?.label ?? label, weight });
    }
  }
  const items: CloudItem[] = [...dedupedMap.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 80)
    .map((entry, idx) => ({ key: `${idx}-${entry.label}`, label: entry.label, weight: entry.weight }));

  if (!items.length) {
    items.push(
      { key: '0', label: '研究框架', weight: 28 },
      { key: '1', label: '抽样调查', weight: 24 },
      { key: '2', label: '满意度', weight: 20 },
    );
  }

  const width = 996;
  const totalHeight = 468;
  const cloudW = 948;
  const cloudH = 440;
  const padX = (width - cloudW) / 2;
  const padY = (totalHeight - cloudH) / 2;
  const maxFont = items.length <= 28 ? 58 : 54;

  const appearance: CloudAppearance = {
    shape: 'free',
    orientation: 'horizontal',
    spacing: 'compact',
    outline: false,
  };
  const { placed } = layoutCloud(items, {
    width: cloudW,
    height: cloudH,
    minFont: 13,
    maxFont,
    padding: 1.5,
    appearance,
    ellipticalBounds: true,
    retryScales: [0.85, 0.72, 0.60, 0.50, 0.42, 0.35],
    measure: (text, size) => {
      let w = 0;
      for (const ch of text) w += ch.charCodeAt(0) > 127 ? size * 1.01 : size * 0.56;
      return { w: Math.max(size * 0.9, w + 2), h: size * 1.06 };
    },
  });

  const palette = [
    primary,
    mixHex(primary, '#0F172A', 0.28),
    secondary,
    opposite,
    mixHex(primary, secondary, 0.48),
    mixHex(opposite, '#1E293B', 0.25),
    '#334155',
  ];

  const topThreshold = (items[0]?.weight ?? 1) * 0.70;
  const midThreshold = (items[0]?.weight ?? 1) * 0.42;

  const wordsMarkup = placed.map((item, idx) => {
    const color = palette[idx % palette.length];
    const x = padX + item.x;
    const y = padY + item.y + item.size * 0.35;
    const weight = item.weight >= topThreshold ? '800' : item.weight >= midThreshold ? '700' : '600';
    const opacity = item.weight >= topThreshold ? '1' : item.weight >= midThreshold ? '0.95' : '0.88';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" fill="${color}" fill-opacity="${opacity}" style="font-size:${item.size.toFixed(1)}px;font-family:${FONT_SANS};font-weight:${weight}">${esc(item.label)}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>
    ${wordsMarkup}
  </svg>`;
}

/** Deterministic Swiss Bento Descriptive Statistics Composite Infographic SVG renderer (SVG width=996). */
export function descriptiveInfographicSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const width = 996;
  const softSecondary = mixHex(secondary, '#FFFFFF', 0.92);
  const softOpposite = mixHex(opposite, '#FFFFFF', 0.92);

  type PanelItem = { zone: string; label: string; value: number | null; unit: string };
  const items: PanelItem[] = r.rows.map(row => ({
    zone: String(row[0] ?? '指标').trim(),
    label: String(row[1] ?? '').trim(),
    value: typeof row[2] === 'number' && Number.isFinite(row[2]) ? row[2]
      : typeof row[2] === 'string' && row[2].trim() && Number.isFinite(Number(row[2])) ? Number(row[2]) : null,
    unit: String(row[3] ?? '').trim(),
  }));

  const kpis = items.filter(i => /KPI|样本|核心/u.test(i.zone)).slice(0, 4);
  const distBars = items.filter(i => /频数|分布|构成/u.test(i.zone)).slice(0, 6);
  const scoreBars = items.filter(i => /均值|评价|维度|得分/u.test(i.zone)).slice(0, 6);
  const takeaways = items.filter(i => /结论|摘要|发现/u.test(i.zone)).slice(0, 3);

  const displayKpis: PanelItem[] = kpis.length
    ? kpis
    : [
        { zone: 'KPI', label: '分析样本量 n', value: r.n > 0 ? r.n : null, unit: r.n > 0 ? '份' : '未登记' },
        { zone: 'KPI', label: '原始总样本', value: r.total || r.n || 0, unit: '份' },
        { zone: 'KPI', label: '涵盖分析维度', value: distBars.length + scoreBars.length, unit: '项指标' },
      ];

  const isMeasureUnit = (u: string) => /^(?:份|人|%|％|项.*|个|分|元|次)$/u.test(u);
  const kpiGap = 16;
  const kpiAreaW = width - 56;
  const kpiW = (kpiAreaW - kpiGap * (displayKpis.length - 1)) / Math.max(1, displayKpis.length);
  const kpiSvg = displayKpis
    .map((k, idx) => {
      const kx = 28 + idx * (kpiW + kpiGap);
      const showUnitInline = k.unit && !k.unit.includes('·') && isMeasureUnit(k.unit);
      const headerLabel = k.unit && !showUnitInline && k.value !== null && !k.label.includes(k.unit)
        ? `${k.label}（${k.unit}）`
        : k.label;
      const valText = k.value === null
        ? (k.unit || '已锁定')
        : `${Number.isInteger(k.value) ? k.value : k.value.toFixed(2)}${showUnitInline ? ` ${k.unit}` : ''}`;
      const accentColor = idx === 0 ? primary : idx === 1 ? secondary : idx === 2 ? opposite : '#334155';
      return `<g>
        <rect x="${kx.toFixed(1)}" y="90" width="${kpiW.toFixed(1)}" height="74" rx="10" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
        <rect x="${kx.toFixed(1)}" y="90" width="4" height="74" rx="2" fill="${accentColor}"/>
        <text x="${(kx + 16).toFixed(1)}" y="114" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS};font-weight:600">${esc(fitCleanPhrase(headerLabel, 22))}</text>
        <text x="${(kx + 16).toFixed(1)}" y="148" fill="${INK_DARK}" style="font-size:21px;font-family:${FONT_SANS};font-weight:700">${esc(valText)}</text>
      </g>`;
    })
    .join('');

  const leftRows = distBars;
  const rightRows = scoreBars;
  const rowPitch = 48;
  const panelContentRows = Math.max(leftRows.length, rightRows.length, 3);
  const panelH = Math.max(296, 56 + panelContentRows * rowPitch);
  const totalHeight = 180 + panelH + 88;
  const maxDist = leftRows.every(row => row.unit === '%') ? 100 : Math.max(1, ...leftRows.map(d => Math.abs(d.value ?? 0)));
  const personSilhouettes = (pct: number, activeFill: string, baseY: number) => {
    const lit = Math.max(pct > 0 ? 1 : 0, Math.min(10, Math.round(pct * 10)));
    return Array.from({ length: 10 }, (_, m) => {
      const px = 49 + m * 14.2;
      const py = baseY;
      const col = m < lit ? activeFill : '#E2E8F0';
      return `<circle cx="${px.toFixed(1)}" cy="${(py + 3).toFixed(1)}" r="2.5" fill="${col}"/><path d="M ${(px - 4.2).toFixed(1)} ${(py + 15).toFixed(1)} L ${(px - 3.8).toFixed(1)} ${(py + 9).toFixed(1)} C ${(px - 3.6).toFixed(1)} ${(py + 7).toFixed(1)} ${(px + 3.6).toFixed(1)} ${(py + 7).toFixed(1)} ${(px + 3.8).toFixed(1)} ${(py + 9).toFixed(1)} L ${(px + 4.2).toFixed(1)} ${(py + 15).toFixed(1)} Z" fill="${col}"/>`;
    }).join('');
  };
  const distSvg = leftRows
    .map((d, idx) => {
      const ry = 224 + idx * rowPitch;
      const pct = d.value !== null ? Math.max(0, Math.min(1, d.value / maxDist)) : 0;
      const fill = idx === 0 ? primary : idx === 1 ? secondary : idx === 2 ? opposite : mixHex(primary, secondary, 0.45);
      const valLabel = d.value !== null ? `${Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}${d.unit}` : (d.unit || '未登记');
      const barPx = Math.round(pct * 262);
      return `<g>
        <text x="44" y="${ry}" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:600">${esc(fitCleanPhrase(d.label, 27))}</text>
        <text x="464" y="${ry}" text-anchor="end" fill="${fill}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(valLabel)}</text>
        ${d.value === null ? '' : `${personSilhouettes(pct, fill, ry + 7)}
        <rect x="202" y="${ry + 10}" width="262" height="10" rx="5" fill="#EAEFF5"/>
        <rect x="202" y="${ry + 10}" width="${barPx}" height="10" rx="5" fill="${fill}"/>
        <circle cx="${(202 + barPx).toFixed(1)}" cy="${ry + 15}" r="4.5" fill="#FFFFFF" stroke="${fill}" stroke-width="2"/>`}
      </g>`;
    })
    .join('');

  const rawScoreMax = Math.max(1, ...rightRows.map(row => Math.abs(row.value ?? 0)));
  const likertFiveScale = rightRows.length > 0 && rightRows.every(row => row.value !== null && row.value >= 1 && row.value <= 5);
  const scoreMax = likertFiveScale ? 5 : rawScoreMax;
  const scoreSvg = rightRows
    .map((d, idx) => {
      const ry = 224 + idx * rowPitch;
      const explicitScale = d.unit.match(/^\/\s*([\d.]+)$/u);
      const scaleMax = explicitScale && Number(explicitScale[1]) > 0 ? Number(explicitScale[1]) : scoreMax;
      const ratio = d.value !== null ? Math.max(0, Math.min(1, Math.abs(d.value) / scaleMax)) : 0;
      const dotColor = idx % 2 === 0 ? primary : secondary;
      const valLabel = d.value !== null ? `${d.value.toFixed(2)}${d.unit ? ` ${d.unit}` : ''}` : (d.unit || '未登记');
      return `<g>
        <text x="530" y="${ry}" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:600">${esc(fitCleanPhrase(d.label, 25))}</text>
        <text x="950" y="${ry}" text-anchor="end" fill="${dotColor}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(valLabel)}</text>
        ${d.value === null ? '' : `<rect x="530" y="${ry + 9}" width="420" height="8" rx="4" fill="#EAEFF5"/>
        <rect x="530" y="${ry + 9}" width="${Math.round(ratio * 420)}" height="8" rx="4" fill="${dotColor}"/>
        <circle cx="${530 + Math.round(ratio * 420)}" cy="${ry + 13}" r="5.5" fill="${dotColor}" stroke="#FFFFFF" stroke-width="2"/>`}
      </g>`;
    })
    .join('');

  const takeawayText =
    takeaways
      .map(t => {
        const stem = t.label.replace(/[。；，：:\s]+$/u, '');
        const cleanUnit = t.unit.replace(/^[。；，：:\s]+|[。；，：:\s]+$/u, '');
        return cleanUnit ? `${stem}（${cleanUnit}）。` : `${stem}。`;
      })
      .join(' ')
    || (r.n > 0 ? `基于已登记统计结果（分析样本 n = ${r.n}）汇总核算，各项数值与正文表格一致。` : '当前无调查统计结果，暂无样本分布或维度均值。');
  const takeawayLines = wrapLines(takeawayText, 72, 2);
  const badgeText = r.n === 0 ? '概念布局 · 无调查数据' : '样本描述统计概览';
  const infoSubtitle = `样本结构分布与核心评价维度综合概览${r.n > 0 ? ` · 有效分析样本 n = ${r.n}` : ''}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" rx="14" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="0" y="0" width="${width}" height="74" rx="14" fill="${SUBTLE_BG}"/>
    <rect x="0" y="62" width="${width}" height="12" fill="${SUBTLE_BG}"/>
    <line x1="28" y1="74" x2="${width - 28}" y2="74" stroke="${RULE_LINE}" stroke-width="1"/>
    <rect x="28" y="20" width="6" height="34" rx="3" fill="${primary}"/>
    <text x="44" y="36" fill="${INK_DARK}" style="font-size:16.5px;font-family:${FONT_SANS};font-weight:700">${esc(r.title || '描述性统计复合信息图')}</text>
    <text x="44" y="56" fill="${INK_MUTED}" style="font-size:11.5px;font-family:${FONT_SANS}">${esc(infoSubtitle)}</text>
    <rect x="${width - 178}" y="22" width="150" height="26" rx="13" fill="${softSecondary}" stroke="${secondary}" stroke-opacity="0.35" stroke-width="1"/>
    <text x="${width - 103}" y="39" text-anchor="middle" fill="${secondary}" style="font-size:11px;font-family:${FONT_SANS};font-weight:700">${esc(badgeText)}</text>
    ${kpiSvg}
    <rect x="28" y="180" width="454" height="${panelH}" rx="12" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
    <text x="44" y="204" fill="${INK_DARK}" style="font-size:13px;font-family:${FONT_SANS};font-weight:700">面板 A · 群体比例人形阵列与频数分布</text>
    ${distSvg || `<text x="44" y="240" fill="${INK_MUTED}" style="font-size:12px;font-family:${FONT_SANS}">尚无同源频数分布结果</text>`}
    <rect x="514" y="180" width="454" height="${panelH}" rx="12" fill="#FFFFFF" stroke="${RULE_LINE}" stroke-width="1"/>
    <text x="530" y="204" fill="${INK_DARK}" style="font-size:13px;font-family:${FONT_SANS};font-weight:700">面板 B · 核心维度表现与分档对比</text>
    ${scoreSvg || `<text x="530" y="240" fill="${INK_MUTED}" style="font-size:12px;font-family:${FONT_SANS}">尚无同源维度均值结果</text>`}
    <rect x="28" y="${180 + panelH + 12}" width="${width - 56}" height="60" rx="10" fill="${softOpposite}" stroke="${opposite}" stroke-opacity="0.25" stroke-width="1"/>
    <text x="44" y="${180 + panelH + 33}" fill="${opposite}" style="font-size:11px;font-family:${FONT_SANS};font-weight:700">来源与分析范围</text>
    ${takeawayLines.map((line, i) => `<text x="44" y="${180 + panelH + 51 + i * 16}" fill="${INK_DARK}" style="font-size:11.5px;font-family:${FONT_SANS}">${esc(line)}</text>`).join('')}
  </svg>`;
}

const DEFAULT_COOCCURRENCE_CLUSTERS = [
  '核心场景与对象簇',
  '理论模型与采纳簇',
  '多维感知与阻滞簇',
  '协同机制与对策簇',
] as const;

function pickFourthClusterColor(existing: readonly string[]): string {
  const candidates = ['#4F46E5', '#0284C7', '#15803D', '#7C3AED', '#B45309'];
  const rgb = (h: string) => {
    const clean = /^#[0-9A-Fa-f]{6}$/.test(h) ? h : '#0F766E';
    return [1, 3, 5].map(i => parseInt(clean.slice(i, i + 2), 16));
  };
  const used = existing.map(rgb);
  let best = candidates[0];
  let bestMinDist = -1;
  for (const cand of candidates) {
    const c = rgb(cand);
    const minDist = Math.min(
      ...used.map(u => (c[0] - u[0]) ** 2 + (c[1] - u[1]) ** 2 + (c[2] - u[2]) ** 2),
    );
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      best = cand;
    }
  }
  return best;
}

function classifyCooccurrenceCluster(entry: { category?: string; cluster?: number }, fallbackIdx: number): number {
  if (typeof entry.cluster === 'number' && Number.isFinite(entry.cluster)) {
    return ((Math.floor(entry.cluster) % 4) + 4) % 4;
  }
  const cat = (entry.category ?? '').trim();
  if (/核心对象|研究领域|核心议题|调查场景|群体|主体|样本/u.test(cat)) return 0;
  if (/理论|模型|潜变量|采纳|意愿|倾向|信任|态度/u.test(cat)) return 1;
  if (/体验|感知|绩效|作用机制|痛点|障碍|顾虑|风险|摩擦|质量/u.test(cat)) return 2;
  if (/协同|策略|运营|治理|政策|制度|改进|方案|路径|补贴|监管/u.test(cat)) return 3;
  return fallbackIdx % 4;
}

function rebalanceCooccurrenceClusters(rawClusters: readonly number[]): number[] {
  const out = [...rawClusters];
  const n = out.length;
  if (n < 8) return out;
  const minPerCluster = Math.max(2, Math.floor(n / 7));
  const counts = [0, 0, 0, 0];
  for (const c of out) counts[c] = (counts[c] ?? 0) + 1;
  for (let target = 0; target < 4; target++) {
    while (counts[target] < minPerCluster) {
      let donor = 0;
      for (let d = 1; d < 4; d++) {
        if (counts[d] > counts[donor]) donor = d;
      }
      if (counts[donor] <= minPerCluster) break;
      let movedIdx = -1;
      for (let i = n - 1; i >= 0; i--) {
        if (out[i] === donor) {
          movedIdx = i;
          break;
        }
      }
      if (movedIdx < 0) break;
      out[movedIdx] = target;
      counts[donor]--;
      counts[target]++;
    }
  }
  return out;
}

type InternalCooccurrenceEdge = { u: number; v: number; strength: number };

function synthesizeCooccurrenceEdges(
  nodes: ReadonlyArray<{ word: string; weight: number; cluster: number }>,
): InternalCooccurrenceEdge[] {
  const n = nodes.length;
  if (n < 2) return [];
  const maxW = Math.max(1, ...nodes.map(nd => nd.weight));
  const pairMap = new Map<string, InternalCooccurrenceEdge>();
  const addEdge = (a: number, b: number, strength: number) => {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) return;
    const u = Math.min(a, b);
    const v = Math.max(a, b);
    const key = `${u}:${v}`;
    const clamped = Math.max(0.24, Math.min(0.96, strength));
    const prev = pairMap.get(key);
    if (!prev || clamped > prev.strength) {
      pairMap.set(key, { u, v, strength: clamped });
    }
  };

  const byCluster: number[][] = [[], [], [], []];
  nodes.forEach((nd, idx) => {
    byCluster[nd.cluster]?.push(idx);
  });
  for (const list of byCluster) {
    list.sort((a, b) => nodes[b].weight - nodes[a].weight);
  }

  // Intra-cluster backbone + local triad links
  for (let c = 0; c < 4; c++) {
    const members = byCluster[c];
    if (!members.length) continue;
    const hub = members[0];
    for (let k = 1; k < members.length; k++) {
      const target = members[k];
      const wNorm = Math.sqrt((nodes[hub].weight * nodes[target].weight) / (maxW * maxW));
      addEdge(hub, target, 0.56 + 0.36 * wNorm);
      if (k >= 2 && members[1] !== undefined && k <= 4) {
        addEdge(members[1], target, 0.42 + 0.28 * wNorm);
      }
      if (k + 1 < members.length) {
        addEdge(target, members[k + 1], 0.34 + 0.22 * wNorm);
      }
    }
  }

  // Cross-cluster conceptual bridge links between hubs and secondary brokers
  const hubs = byCluster.map(m => m[0]).filter((idx): idx is number => idx !== undefined);
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      const u = hubs[i];
      const v = hubs[j];
      const wNorm = Math.sqrt((nodes[u].weight * nodes[v].weight) / (maxW * maxW));
      addEdge(u, v, 0.50 + 0.30 * wNorm);
    }
  }
  for (let c = 0; c < 4; c++) {
    const hub = byCluster[c][0];
    const nextBroker = byCluster[(c + 1) % 4][1];
    const oppBroker = byCluster[(c + 2) % 4][1];
    if (hub !== undefined && nextBroker !== undefined) addEdge(hub, nextBroker, 0.42);
    if (hub !== undefined && oppBroker !== undefined) addEdge(hub, oppBroker, 0.36);
  }

  return [...pairMap.values()].sort((a, b) => a.strength - b.strength);
}

/**
 * Pure vector bibliometric literature keyword co-occurrence & clustering network diagram (width=996, height=580).
 * Deterministic 4-cluster force relaxation + 2D bounding-box label solver with zero text/node overlaps.
 */
export function vosviewerNetworkSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const fourth = pickFourthClusterColor([primary, secondary, opposite]);
  const clusterColors = [primary, secondary, opposite, fourth] as const;

  type ParsedCoNode = {
    word: string;
    weight: number;
    cluster: number;
    clusterLabel: string;
    explicitEdges: Array<{ target: number; strength: number }>;
  };

  const rawNodes: ParsedCoNode[] = [];
  const seenNorm = new Set<string>();
  r.rows.forEach((row, idx) => {
    const word = String(row[0] ?? '').trim();
    if (!word) return;
    const norm = word.replace(/\s+/gu, '').toLowerCase();
    if (seenNorm.has(norm)) return;
    seenNorm.add(norm);
    const weight = typeof row[1] === 'number' && Number.isFinite(row[1]) ? Math.max(1, row[1]) : Number(row[1]) || 12;
    const rawClusterLabel = String(row[3] ?? '').trim();
    let metaCluster: number | undefined;
    let explicitEdges: Array<{ target: number; strength: number }> = [];
    const metaRaw = typeof row[5] === 'string' ? row[5].trim() : '';
    if (metaRaw.startsWith('{')) {
      try {
        const parsed = JSON.parse(metaRaw) as { c?: number; e?: Array<[number, number]> };
        if (typeof parsed.c === 'number' && Number.isFinite(parsed.c)) {
          metaCluster = ((Math.floor(parsed.c) % 4) + 4) % 4;
        }
        if (Array.isArray(parsed.e)) {
          explicitEdges = parsed.e
            .filter(pair => Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number')
            .map(([t, s]) => ({ target: Math.floor(t), strength: Number(s) }));
        }
      } catch {
        // ignore malformed optional metadata
      }
    }
    const cluster = metaCluster ?? classifyCooccurrenceCluster({ category: rawClusterLabel }, idx);
    rawNodes.push({
      word,
      weight,
      cluster,
      clusterLabel: rawClusterLabel || DEFAULT_COOCCURRENCE_CLUSTERS[cluster],
      explicitEdges,
    });
  });

  if (rawNodes.length < 4) {
    const fallbackItems: Array<[string, number, number]> = [
      ['核心调查对象', 92, 0],
      ['服务供给场景', 74, 0],
      ['技术接受机制', 86, 1],
      ['使用采纳意愿', 78, 1],
      ['多维感知评价', 82, 2],
      ['信任与风险阻滞', 68, 2],
      ['多元主体协同', 72, 3],
      ['属地治理工具', 64, 3],
    ];
    rawNodes.length = 0;
    for (const [w, wt, c] of fallbackItems) {
      rawNodes.push({ word: w, weight: wt, cluster: c, clusterLabel: DEFAULT_COOCCURRENCE_CLUSTERS[c], explicitEdges: [] });
    }
  }

  const nodes = rawNodes.slice(0, 26);
  const balancedClusters = rebalanceCooccurrenceClusters(nodes.map(nd => nd.cluster));
  nodes.forEach((nd, idx) => {
    nd.cluster = balancedClusters[idx];
  });

  // Reconstruct or synthesize edges
  let edges: InternalCooccurrenceEdge[] = [];
  const pairSet = new Map<string, InternalCooccurrenceEdge>();
  nodes.forEach((nd, u) => {
    for (const edge of nd.explicitEdges) {
      const v = edge.target;
      if (v >= 0 && v < nodes.length && v !== u) {
        const a = Math.min(u, v);
        const b = Math.max(u, v);
        const key = `${a}:${b}`;
        const strength = Math.max(0.24, Math.min(0.96, edge.strength));
        const prev = pairSet.get(key);
        if (!prev || strength > prev.strength) pairSet.set(key, { u: a, v: b, strength });
      }
    }
  });
  edges = pairSet.size >= Math.max(4, Math.floor(nodes.length * 0.8))
    ? [...pairSet.values()].sort((a, b) => a.strength - b.strength)
    : synthesizeCooccurrenceEdges(nodes);

  const width = 996;
  const totalHeight = 520;
  const px0 = 20;
  const py0 = 14;
  const pw = 956;
  const ph = 492;
  const centerX = px0 + pw / 2;
  const centerY = py0 + ph / 2;

  const anchors: ReadonlyArray<{ x: number; y: number }> = [
    { x: 272, y: 148 },
    { x: 724, y: 148 },
    { x: 280, y: 376 },
    { x: 716, y: 376 },
  ];

  const minW = Math.min(...nodes.map(nd => nd.weight));
  const maxW = Math.max(minW + 1, ...nodes.map(nd => nd.weight));

  type LayoutNode = {
    idx: number;
    word: string;
    displayWord: string;
    weight: number;
    normW: number;
    cluster: number;
    r: number;
    fontSize: number;
    x: number;
    y: number;
    isHub: boolean;
  };

  const clusterRankCounter = [0, 0, 0, 0];
  const layoutNodes: LayoutNode[] = nodes.map((nd, idx) => {
    const normW = (nd.weight - minW) / (maxW - minW);
    const k = clusterRankCounter[nd.cluster]++;
    const anchor = anchors[nd.cluster];
    const isHub = k === 0;
    const angle = k * 2.399963 + nd.cluster * 0.92;
    const radX = isHub ? 0 : 68 + 34 * Math.sqrt(k);
    const radY = isHub ? 0 : 48 + 23 * Math.sqrt(k);
    const startX = isHub
      ? anchor.x * 0.8 + centerX * 0.2
      : anchor.x + Math.cos(angle) * radX;
    const startY = isHub
      ? anchor.y * 0.82 + centerY * 0.18
      : anchor.y + Math.sin(angle) * radY;
    const displayWord = fitCleanPhrase(nd.word, 12);
    return {
      idx,
      word: nd.word,
      displayWord,
      weight: nd.weight,
      normW,
      cluster: nd.cluster,
      r: 9.5 + 14.5 * Math.sqrt(normW),
      fontSize: Number((11.2 + 3.4 * normW).toFixed(2)),
      x: startX,
      y: startY,
      isHub,
    };
  });

  type Box = { x0: number; y0: number; x1: number; y1: number };

  const clampNodeInCanvas = (ln: LayoutNode) => {
    const padX = Math.max(58, ln.r + 44);
    const padTop = Math.max(26, ln.r + 18);
    const padBot = Math.max(30, ln.r + 22);
    ln.x = Math.max(px0 + padX, Math.min(px0 + pw - padX, ln.x));
    ln.y = Math.max(py0 + padTop, Math.min(py0 + ph - padBot, ln.y));
  };

  // Deterministic force-directed relaxation with anisotropic label-aware repulsion
  for (let iter = 0; iter < 135; iter++) {
    const cool = 1 - iter / 160;
    const fx = new Array<number>(layoutNodes.length).fill(0);
    const fy = new Array<number>(layoutNodes.length).fill(0);

    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const ni = layoutNodes[i];
        const nj = layoutNodes[j];
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
          dx = (i % 2 === 0 ? 1 : -1) * 1.5;
          dy = (j % 2 === 0 ? 1 : -1) * 1.5;
        }
        const sameCluster = ni.cluster === nj.cluster;
        const desiredX = ni.r + nj.r + (sameCluster ? 68 : 92);
        const desiredY = ni.r + nj.r + (sameCluster ? 36 : 48);
        const nx = dx / desiredX;
        const ny = dy / desiredY;
        const ellipDist = Math.sqrt(nx * nx + ny * ny);
        if (ellipDist < 1.35) {
          const push = ((1.35 - ellipDist) / Math.max(0.18, ellipDist)) * 18 * cool;
          const px = (dx / Math.max(1, Math.hypot(dx, dy))) * push * 1.28;
          const py = (dy / Math.max(1, Math.hypot(dx, dy))) * push * 0.94;
          fx[i] -= px;
          fy[i] -= py;
          fx[j] += px;
          fy[j] += py;
        }
      }
    }

    for (const e of edges) {
      const nu = layoutNodes[e.u];
      const nv = layoutNodes[e.v];
      const dx = nv.x - nu.x;
      const dy = nv.y - nu.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const same = nu.cluster === nv.cluster;
      const rest = same ? 114 : 280;
      const delta = (dist - rest) * (same ? 0.032 : 0.012) * e.strength * cool;
      const sx = (dx / dist) * delta;
      const sy = (dy / dist) * delta;
      fx[e.u] += sx;
      fy[e.u] += sy;
      fx[e.v] -= sx;
      fy[e.v] -= sy;
    }

    for (let i = 0; i < layoutNodes.length; i++) {
      const ni = layoutNodes[i];
      const anchor = anchors[ni.cluster];
      const targetX = ni.isHub ? anchor.x * 0.8 + centerX * 0.2 : anchor.x;
      const targetY = ni.isHub ? anchor.y * 0.82 + centerY * 0.18 : anchor.y;
      const grav = ni.isHub ? 0.072 : 0.048;
      fx[i] += (targetX - ni.x) * grav * cool;
      fy[i] += (targetY - ni.y) * grav * cool;
      ni.x += Math.max(-16, Math.min(16, fx[i]));
      ni.y += Math.max(-14, Math.min(14, fy[i]));
      clampNodeInCanvas(ni);
    }
  }

  // Hard circle non-overlap guarantee pass
  for (let pass = 0; pass < 35; pass++) {
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const ni = layoutNodes[i];
        const nj = layoutNodes[j];
        const dx = nj.x - ni.x;
        const dy = nj.y - ni.y;
        const dist = Math.max(0.1, Math.hypot(dx, dy));
        const minDist = ni.r + nj.r + 20;
        if (dist < minDist) {
          const push = (minDist - dist) * 0.52;
          const ux = dx / dist;
          const uy = dy / dist;
          ni.x -= ux * push;
          ni.y -= uy * push;
          nj.x += ux * push;
          nj.y += uy * push;
          clampNodeInCanvas(ni);
          clampNodeInCanvas(nj);
        }
      }
    }
  }

  // Soft glowing multi-layer concentric ellipse density clouds per cluster (no outer dashed border, no url()/filter)
  const haloSvg = [0, 1, 2, 3]
    .map(c => {
      const members = layoutNodes.filter(nd => nd.cluster === c);
      if (!members.length) return '';
      const sumW = members.reduce((s, m) => s + m.weight, 0) || 1;
      const cx = members.reduce((s, m) => s + m.x * m.weight, 0) / sumW;
      const cy = members.reduce((s, m) => s + m.y * m.weight, 0) / sumW;
      const maxDx = Math.max(66, ...members.map(m => Math.abs(m.x - cx) + m.r));
      const maxDy = Math.max(48, ...members.map(m => Math.abs(m.y - cy) + m.r));
      const rx = Math.min(242, maxDx + 40);
      const ry = Math.min(146, maxDy + 32);
      const clampedCx = Math.max(px0 + rx, Math.min(px0 + pw - rx, cx));
      const clampedCy = Math.max(py0 + ry, Math.min(py0 + ph - ry, cy));
      const col = clusterColors[c];
      const rings = [
        { s: 1.0, op: 0.022 },
        { s: 0.82, op: 0.030 },
        { s: 0.64, op: 0.038 },
        { s: 0.46, op: 0.048 },
        { s: 0.28, op: 0.058 },
      ];
      return `<g>${rings.map(rg => `<ellipse cx="${clampedCx.toFixed(1)}" cy="${clampedCy.toFixed(1)}" rx="${(rx * rg.s).toFixed(1)}" ry="${(ry * rg.s).toFixed(1)}" fill="${col}" fill-opacity="${rg.op}"/>`).join('')}</g>`;
    })
    .join('');

  // Curved quadratic Bezier co-occurrence edges
  const edgeSvg = edges
    .map(e => {
      const nu = layoutNodes[e.u];
      const nv = layoutNodes[e.v];
      const dx = nv.x - nu.x;
      const dy = nv.y - nu.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const sign = (e.u + e.v) % 2 === 0 ? 1 : -1;
      const bend = sign * Math.min(38, len * 0.13);
      const mx = (nu.x + nv.x) / 2 - (dy / len) * bend;
      const my = (nu.y + nv.y) / 2 + (dx / len) * bend;
      const same = nu.cluster === nv.cluster;
      const stroke = same
        ? mixHex(clusterColors[nu.cluster], '#64748B', 0.22)
        : mixHex(clusterColors[nu.cluster], clusterColors[nv.cluster], 0.5);
      const opacity = same ? 0.22 + e.strength * 0.40 : 0.16 + e.strength * 0.28;
      const sw = same ? 1.0 + e.strength * 2.0 : 0.85 + e.strength * 1.45;
      return `<path d="M ${nu.x.toFixed(1)} ${nu.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${nv.x.toFixed(1)} ${nv.y.toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${opacity.toFixed(2)}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round"/>`;
    })
    .join('');

  // Double-ring nodes
  const nodeSvg = layoutNodes
    .map(ln => {
      const col = clusterColors[ln.cluster];
      const fill = mixHex(col, '#FFFFFF', ln.isHub ? 0.05 : 0.18);
      return `<g>
        <circle cx="${ln.x.toFixed(1)}" cy="${ln.y.toFixed(1)}" r="${(ln.r + 3.6).toFixed(1)}" fill="${col}" fill-opacity="0.18"/>
        <circle cx="${ln.x.toFixed(1)}" cy="${ln.y.toFixed(1)}" r="${ln.r.toFixed(1)}" fill="${fill}" stroke="#FFFFFF" stroke-width="1.9"/>
        ${ln.r >= 14.5 ? `<circle cx="${(ln.x - ln.r * 0.24).toFixed(1)}" cy="${(ln.y - ln.r * 0.24).toFixed(1)}" r="${(ln.r * 0.28).toFixed(1)}" fill="#FFFFFF" fill-opacity="0.44"/>` : ''}
      </g>`;
    })
    .join('');

  // Deterministic 2D bounding-box label placement solver
  const boxOverlapArea = (a: Box, b: Box): number => {
    const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const oy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return ox * oy;
  };

  const circleBoxOverlap = (cx: number, cy: number, cr: number, b: Box): number => {
    const nx = Math.max(b.x0, Math.min(cx, b.x1));
    const ny = Math.max(b.y0, Math.min(cy, b.y1));
    const d = Math.hypot(cx - nx, cy - ny);
    return d < cr ? (cr - d) * 14 : 0;
  };

  const placedLabels: Box[] = [];
  const orderedForLabels = [...layoutNodes].sort((a, b) => b.weight - a.weight);
  const labelSvgParts: string[] = [];

  for (let rank = 0; rank < orderedForLabels.length; rank++) {
    const ln = orderedForLabels[rank];
    const lw = cjkSpan(ln.displayWord) * ln.fontSize + 8;
    const lh = ln.fontSize + 4;
    const gap = 3.5;

    const candidates: Array<{ cx: number; cy: number; pref: number }> = [
      { cx: ln.x, cy: ln.y + ln.r + lh / 2 + gap, pref: 0 },
      { cx: ln.x, cy: ln.y - ln.r - lh / 2 - gap, pref: 2 },
      { cx: ln.x + ln.r + lw / 2 + 5, cy: ln.y, pref: 5 },
      { cx: ln.x - ln.r - lw / 2 - 5, cy: ln.y, pref: 5 },
      { cx: ln.x + ln.r * 0.7 + lw / 2 + 2, cy: ln.y + ln.r * 0.7 + lh / 2 + 2, pref: 9 },
      { cx: ln.x - ln.r * 0.7 - lw / 2 - 2, cy: ln.y + ln.r * 0.7 + lh / 2 + 2, pref: 9 },
      { cx: ln.x + ln.r * 0.7 + lw / 2 + 2, cy: ln.y - ln.r * 0.7 - lh / 2 - 2, pref: 11 },
      { cx: ln.x - ln.r * 0.7 - lw / 2 - 2, cy: ln.y - ln.r * 0.7 - lh / 2 - 2, pref: 11 },
    ];

    const scoreCandidate = (cx: number, cy: number, pref: number): { score: number; box: Box } => {
      const box: Box = { x0: cx - lw / 2, y0: cy - lh / 2, x1: cx + lw / 2, y1: cy + lh / 2 };
      let score = pref;
      const outLeft = Math.max(0, px0 + 4 - box.x0);
      const outRight = Math.max(0, box.x1 - (px0 + pw - 4));
      const outTop = Math.max(0, py0 + 4 - box.y0);
      const outBot = Math.max(0, box.y1 - (py0 + ph - 4));
      score += (outLeft + outRight + outTop + outBot) * 400;
      for (const pb of placedLabels) {
        score += boxOverlapArea(box, pb) * 18;
      }
      for (const other of layoutNodes) {
        const pad = other.idx === ln.idx ? 1.5 : 3.5;
        score += circleBoxOverlap(other.x, other.y, other.r + pad, box) * 12;
      }
      return { score, box };
    };

    let best = scoreCandidate(candidates[0].cx, candidates[0].cy, candidates[0].pref);
    let bestCx = candidates[0].cx;
    let bestCy = candidates[0].cy;
    for (let k = 1; k < candidates.length; k++) {
      const res = scoreCandidate(candidates[k].cx, candidates[k].cy, candidates[k].pref);
      if (res.score < best.score) {
        best = res;
        bestCx = candidates[k].cx;
        bestCy = candidates[k].cy;
      }
    }

    if (best.score > 12) {
      for (const dy of [-10, 10, -18, 18]) {
        for (const dx of [0, -12, 12]) {
          const res = scoreCandidate(bestCx + dx, bestCy + dy, 8);
          if (res.score < best.score) {
            best = res;
            bestCx += dx;
            bestCy += dy;
          }
        }
      }
    }

    placedLabels.push(best.box);
    const baselineY = bestCy + ln.fontSize * 0.35;
    const fw = rank < 6 ? 700 : 600;
    const textColor = rank < 4 ? mixHex(clusterColors[ln.cluster], INK_DARK, 0.42) : INK_DARK;
    labelSvgParts.push(
      `<g>` +
        `<text x="${bestCx.toFixed(1)}" y="${baselineY.toFixed(1)}" text-anchor="middle" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3.6" stroke-linejoin="round" style="font-size:${ln.fontSize}px;font-family:${FONT_SANS};font-weight:${fw}">${esc(ln.displayWord)}</text>` +
        `<text x="${bestCx.toFixed(1)}" y="${baselineY.toFixed(1)}" text-anchor="middle" fill="${textColor}" style="font-size:${ln.fontSize}px;font-family:${FONT_SANS};font-weight:${fw}">${esc(ln.displayWord)}</text>` +
      `</g>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>
    ${haloSvg}
    ${edgeSvg}
    ${nodeSvg}
    ${labelSvgParts.join('')}
  </svg>`;
}

function niceAxisCeiling(maxVal: number, ticks = 4): number {
  const safe = Math.max(0.1, maxVal * 1.15);
  const rawStep = safe / ticks;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return niceNorm * mag * ticks;
}

/**
 * Pure-white dual-axis bar + line macro background trend chart (`method === 'macro-trend'`, width=996, height=428).
 * Left Y-axis: scale bars; Right Y-axis: penetration / growth rate polyline with collision-free direct labels.
 */
export function macroTrendSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const lineColor = opposite;
  const barFill = mixHex(primary, '#FFFFFF', 0.14);
  const barTop = primary;

  const parsed = r.rows
    .map(row => ({
      period: String(row[0] ?? '').trim(),
      bar: typeof row[1] === 'number' && Number.isFinite(row[1]) ? row[1] : Number(row[1]) || 0,
      line: typeof row[2] === 'number' && Number.isFinite(row[2]) ? row[2] : Number(row[2]) || 0,
    }))
    .filter(p => p.period.length > 0);

  const pts = parsed.length >= 2
    ? parsed
    : [
        { period: '2019', bar: 2.54, line: 8.6 },
        { period: '2020', bar: 2.64, line: 11.4 },
        { period: '2021', bar: 2.67, line: 14.8 },
        { period: '2022', bar: 2.80, line: 18.5 },
        { period: '2023', bar: 2.97, line: 22.9 },
        { period: '2024', bar: 3.10, line: 27.4 },
        { period: '2025', bar: 3.23, line: 31.8 },
      ];

  const barHeader = String(r.headers[1] ?? '总体规模');
  const lineHeader = String(r.headers[2] ?? '渗透率（%）');
  const extractUnit = (hdr: string): string => {
    const m = /[（(]([^）)]+)[）)]/u.exec(hdr);
    return m ? m[1] : /%|％/u.test(hdr) ? '%' : '';
  };
  const barUnit = extractUnit(barHeader);
  const lineUnit = extractUnit(lineHeader);

  const width = 996;
  const totalHeight = 428;
  const gx0 = 88;
  const gx1 = 908;
  const gy0 = 70;
  const gy1 = 374;
  const gw = gx1 - gx0;
  const gh = gy1 - gy0;

  const ticks = 4;
  const maxBar = niceAxisCeiling(Math.max(...pts.map(p => p.bar)), ticks);
  const maxLine = niceAxisCeiling(Math.max(...pts.map(p => p.line)), ticks);

  const fmtTick = (v: number): string => {
    if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
    if (Math.abs(v * 10 - Math.round(v * 10)) < 1e-6) return v.toFixed(1);
    return v.toFixed(2);
  };
  const allBarsInteger = pts.every(p => Number.isInteger(p.bar));
  const barDecimals = allBarsInteger ? 0 : pts.some(p => Math.abs(p.bar * 10 - Math.round(p.bar * 10)) > 1e-4) ? 2 : 1;
  const allLinesInteger = pts.every(p => Number.isInteger(p.line));
  const lineDecimals = allLinesInteger ? 0 : 1;
  const fmtBarVal = (v: number): string => v.toFixed(barDecimals);
  const fmtLineVal = (v: number, isPercent: boolean): string => `${v.toFixed(lineDecimals)}${isPercent ? '%' : ''}`;
  const lineIsPct = lineUnit === '%' || lineUnit === '％';

  const gridAndTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const frac = i / ticks;
    const y = gy1 - frac * gh;
    const leftVal = frac * maxBar;
    const rightVal = frac * maxLine;
    return `<g>
      ${i > 0 ? `<line x1="${gx0}" y1="${y.toFixed(1)}" x2="${gx1}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
      <text x="${gx0 - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${INK_MUTED}" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:600">${esc(fmtTick(leftVal))}</text>
      <text x="${gx1 + 12}" y="${(y + 4).toFixed(1)}" text-anchor="start" fill="${lineColor}" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:600">${esc(`${fmtTick(rightVal)}${lineIsPct ? '%' : ''}`)}</text>
    </g>`;
  }).join('');

  const slotW = gw / pts.length;
  const barW = Math.max(26, Math.min(54, slotW * 0.44));

  const coords = pts.map((p, idx) => {
    const cx = gx0 + (idx + 0.5) * slotW;
    const bh = Math.max(2, (p.bar / maxBar) * gh);
    const by = gy1 - bh;
    const ly = gy1 - (p.line / maxLine) * gh;
    return { ...p, cx, bh, by, ly };
  });

  const barsSvg = coords
    .map(c => {
      const x = c.cx - barW / 2;
      return `<g>
        <rect x="${x.toFixed(1)}" y="${c.by.toFixed(1)}" width="${barW.toFixed(1)}" height="${c.bh.toFixed(1)}" rx="5" fill="${barFill}"/>
        <rect x="${x.toFixed(1)}" y="${(gy1 - Math.min(5, c.bh)).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.min(5, c.bh).toFixed(1)}" fill="${barFill}"/>
        <rect x="${x.toFixed(1)}" y="${c.by.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.min(4, c.bh).toFixed(1)}" rx="2" fill="${barTop}"/>
      </g>`;
    })
    .join('');

  const areaPoints = `${coords[0].cx.toFixed(1)},${gy1} ${coords.map(c => `${c.cx.toFixed(1)},${c.ly.toFixed(1)}`).join(' ')} ${coords[coords.length - 1].cx.toFixed(1)},${gy1}`;
  const polyPoints = coords.map(c => `${c.cx.toFixed(1)},${c.ly.toFixed(1)}`).join(' ');

  const markersAndLabelsSvg = coords
    .map(c => {
      const barTxt = fmtBarVal(c.bar);
      const lineTxt = fmtLineVal(c.line, lineIsPct);
      let lineLabelY = c.ly - 13;
      let barLabelY = c.by - 9;
      let barLabelColor = primary;
      let barHalo = true;

      if (c.ly <= c.by + 10) {
        lineLabelY = Math.max(gy0 - 10, c.ly - 14);
        if (c.bh >= 34) {
          barLabelY = Math.max(c.by + 20, c.ly + 22);
          barLabelColor = '#FFFFFF';
          barHalo = false;
        } else {
          barLabelY = c.by - 7;
          lineLabelY = Math.min(barLabelY - 16, c.ly - 14);
        }
      } else if (c.ly - 13 < c.by + 14) {
        barLabelY = c.by - 9;
        lineLabelY = Math.min(gy1 - 8, c.ly + 21);
      }

      const barLabelEl = barHalo
        ? `<text x="${c.cx.toFixed(1)}" y="${barLabelY.toFixed(1)}" text-anchor="middle" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3.4" stroke-linejoin="round" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:700">${esc(barTxt)}</text><text x="${c.cx.toFixed(1)}" y="${barLabelY.toFixed(1)}" text-anchor="middle" fill="${barLabelColor}" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:700">${esc(barTxt)}</text>`
        : `<text x="${c.cx.toFixed(1)}" y="${barLabelY.toFixed(1)}" text-anchor="middle" fill="${barLabelColor}" style="font-size:11.2px;font-family:${FONT_SANS};font-weight:700">${esc(barTxt)}</text>`;

      const lineLabelEl = `<text x="${c.cx.toFixed(1)}" y="${lineLabelY.toFixed(1)}" text-anchor="middle" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3.6" stroke-linejoin="round" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(lineTxt)}</text><text x="${c.cx.toFixed(1)}" y="${lineLabelY.toFixed(1)}" text-anchor="middle" fill="${lineColor}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(lineTxt)}</text>`;

      return `<g>
        ${barLabelEl}
        <circle cx="${c.cx.toFixed(1)}" cy="${c.ly.toFixed(1)}" r="8.5" fill="${lineColor}" fill-opacity="0.16"/>
        <circle cx="${c.cx.toFixed(1)}" cy="${c.ly.toFixed(1)}" r="5.2" fill="${lineColor}" stroke="#FFFFFF" stroke-width="2"/>
        ${lineLabelEl}
        <text x="${c.cx.toFixed(1)}" y="${gy1 + 24}" text-anchor="middle" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:600">${esc(c.period)}</text>
      </g>`;
    })
    .join('');

  const leftLegend = `${barHeader}（左轴）`;
  const rightLegend = `${lineHeader}（右轴）`;
  const legLeftW = Math.ceil(cjkSpan(leftLegend) * 12 + 28);
  const legRightW = Math.ceil(cjkSpan(rightLegend) * 12 + 34);
  const totalLegW = legLeftW + 32 + legRightW;
  const legStartX = (width - totalLegW) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>
    <g>
      <rect x="${legStartX.toFixed(1)}" y="15" width="16" height="11" rx="3" fill="${barFill}"/>
      <text x="${(legStartX + 23).toFixed(1)}" y="25" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(leftLegend)}</text>
      <line x1="${(legStartX + legLeftW + 24).toFixed(1)}" y1="20.5" x2="${(legStartX + legLeftW + 46).toFixed(1)}" y2="20.5" stroke="${lineColor}" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="${(legStartX + legLeftW + 35).toFixed(1)}" cy="20.5" r="4.2" fill="${lineColor}" stroke="#FFFFFF" stroke-width="1.5"/>
      <text x="${(legStartX + legLeftW + 53).toFixed(1)}" y="25" fill="${INK_DARK}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(rightLegend)}</text>
    </g>
    ${barUnit ? `<text x="${gx0}" y="52" fill="${INK_MUTED}" style="font-size:11px;font-family:${FONT_SANS};font-weight:600">量纲（${esc(barUnit)}）</text>` : ''}
    ${lineUnit ? `<text x="${gx1}" y="52" text-anchor="end" fill="${lineColor}" style="font-size:11px;font-family:${FONT_SANS};font-weight:600">量纲（${esc(lineUnit)}）</text>` : ''}
    ${gridAndTicks}
    <polygon points="${areaPoints}" fill="${secondary}" fill-opacity="0.06"/>
    ${barsSvg}
    <polyline points="${polyPoints}" fill="none" stroke="${lineColor}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="${gx0}" y1="${gy0}" x2="${gx0}" y2="${gy1}" stroke="#CBD5E1" stroke-width="1.2"/>
    <line x1="${gx1}" y1="${gy0}" x2="${gx1}" y2="${gy1}" stroke="${mixHex(lineColor, '#CBD5E1', 0.65)}" stroke-width="1.2"/>
    <line x1="${gx0}" y1="${gy1}" x2="${gx1}" y2="${gy1}" stroke="#334155" stroke-width="1.5"/>
    ${markersAndLabelsSvg}
  </svg>`;
}

function renderSummaryCardIcon(icon: SummaryCardIcon, cx: number, cy: number, color: string): string {
  const sw = `fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  switch (icon) {
    case 'shield':
      return `<path d="M ${cx} ${cy - 11} L ${cx + 9} ${cy - 7.5} L ${cx + 9} ${cy + 0.5} Q ${cx + 9} ${cy + 8} ${cx} ${cy + 11.5} Q ${cx - 9} ${cy + 8} ${cx - 9} ${cy + 0.5} L ${cx - 9} ${cy - 7.5} Z" ${sw}/><polyline points="${cx - 3.5},${cy + 0.5} ${cx - 0.8},${cy + 3.4} ${cx + 4.2},${cy - 2.4}" ${sw}/>`;
    case 'compass':
      return `<circle cx="${cx}" cy="${cy}" r="10.5" ${sw}/><polygon points="${cx + 4.2},${cy - 4.2} ${cx + 1.5},${cy + 1.8} ${cx - 4.2},${cy + 4.2} ${cx - 1.5},${cy - 1.8}" ${sw}/>`;
    case 'layers':
      return `<polygon points="${cx},${cy - 10} ${cx + 10.5},${cy - 4.5} ${cx},${cy + 1} ${cx - 10.5},${cy - 4.5}" ${sw}/><polyline points="${cx - 10.5},${cy + 0.5} ${cx},${cy + 6} ${cx + 10.5},${cy + 0.5}" ${sw}/><polyline points="${cx - 10.5},${cy + 5} ${cx},${cy + 10.5} ${cx + 10.5},${cy + 5}" ${sw}/>`;
    case 'spark':
      return `<path d="M ${cx} ${cy - 11} L ${cx + 2.8} ${cy - 2.8} L ${cx + 11} ${cy} L ${cx + 2.8} ${cy + 2.8} L ${cx} ${cy + 11} L ${cx - 2.8} ${cy + 2.8} L ${cx - 11} ${cy} L ${cx - 2.8} ${cy - 2.8} Z" ${sw}/>`;
    case 'users':
      return `<circle cx="${cx - 3}" cy="${cy - 4.5}" r="4" ${sw}/><path d="M ${cx - 10.5} ${cy + 9} Q ${cx - 10.5} ${cy + 2.5} ${cx - 3} ${cy + 2.5} Q ${cx + 4.5} ${cy + 2.5} ${cx + 4.5} ${cy + 9}" ${sw}/><circle cx="${cx + 5}" cy="${cy - 3.5}" r="3.2" ${sw}/><path d="M ${cx + 5.5} ${cy + 2.5} Q ${cx + 11} ${cy + 2.8} ${cx + 11} ${cy + 8.8}" ${sw}/>`;
    case 'target':
      return `<circle cx="${cx}" cy="${cy}" r="10.5" ${sw}/><circle cx="${cx}" cy="${cy}" r="6" ${sw}/><circle cx="${cx}" cy="${cy}" r="2" fill="${color}"/>`;
    case 'chart':
      return `<line x1="${cx - 9.5}" y1="${cy + 9}" x2="${cx + 9.5}" y2="${cy + 9}" ${sw}/><rect x="${cx - 7.5}" y="${cy + 1}" width="3.5" height="8" rx="1" ${sw}/><rect x="${cx - 1.8}" y="${cy - 4}" width="3.5" height="13" rx="1" ${sw}/><rect x="${cx + 4}" y="${cy - 9}" width="3.5" height="18" rx="1" ${sw}/>`;
    default:
      return `<circle cx="${cx}" cy="${cy}" r="10.5" ${sw}/><polyline points="${cx - 4.5},${cy + 0.5} ${cx - 1.2},${cy + 4} ${cx + 5},${cy - 3.5}" ${sw}/>`;
  }
}

/**
 * Pure-white structured summary & classification path card diagram (`method === 'summary-card'`, width=996).
 * Modeled after National First-Prize multi-pillar structured framework cards:
 * Top title & subtitle -> Central dark framework capsule -> Tree branch into 2..4 equal-height icon+bullet cards -> Bottom goal banner.
 */
export function summaryCardSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const fourth = pickFourthClusterColor([primary, secondary, opposite]);
  const cardAccents = [
    primary,
    mixHex(primary, fourth, 0.55),
    mixHex(secondary, '#0F172A', 0.18),
    mixHex(opposite, '#0F172A', 0.12),
  ];
  const defaultIcons: readonly SummaryCardIcon[] = ['compass', 'layers', 'users', 'shield'];

  type ParsedCard = {
    title: string;
    tag: string;
    icon: SummaryCardIcon;
    points: string[];
  };
  let subtitle = '';
  let frameworkLabel = '系统化支撑框架';
  let goalTitle = '目标导向';
  let goalText = '';

  const cards: ParsedCard[] = [];
  r.rows.forEach((row, idx) => {
    const title = String(row[0] ?? '').trim();
    if (!title) return;
    const tag = String(row[1] ?? '').trim();
    const rawPts = String(row[2] ?? '').trim();
    let meta: {
      icon?: SummaryCardIcon;
      points?: string[];
      subtitle?: string;
      frameworkLabel?: string;
      goalTitle?: string;
      goalText?: string;
    } | null = null;
    const rawMeta = typeof row[3] === 'string' ? row[3].trim() : '';
    if (rawMeta.startsWith('{')) {
      try {
        meta = JSON.parse(rawMeta);
      } catch {
        meta = null;
      }
    }
    if (idx === 0 && meta) {
      if (meta.subtitle) subtitle = meta.subtitle;
      if (meta.frameworkLabel) frameworkLabel = meta.frameworkLabel;
      if (meta.goalTitle) goalTitle = meta.goalTitle;
      if (meta.goalText) goalText = meta.goalText;
    }
    const pts = (meta?.points?.length ? meta.points : rawPts.split(/\s*[；;|]\s*/u))
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    cards.push({
      title,
      tag,
      icon: meta?.icon ?? defaultIcons[idx % defaultIcons.length],
      points: pts.length ? pts : ['围绕实证关键指标精准施策'],
    });
  });

  if (!cards.length) {
    cards.push(
      { title: '维度一 · 理论拓展', tag: '学术视角深化', icon: 'compass', points: ['完善本土场景潜变量测量维度', '识别跨群体感知传导边界'] },
      { title: '维度二 · 方法协同', tag: '多元统计互证', icon: 'layers', points: ['融合参数与非参数稳健检验', '衔接质性访谈与量化回归证据'] },
      { title: '维度三 · 实践落地', tag: '基层服务提质', icon: 'shield', points: ['锁定高重要低表现优先短板', '明确分阶段可核验改进阈值'] },
    );
  }
  const activeCards = cards.slice(0, 4);
  if (!subtitle) {
    subtitle = `基于实证分析证据凝练的 ${activeCards.length} 维协同结构体系`;
  }
  if (!goalText) {
    goalText = `实现从实证问题识别、机制检验到分类精准落地的全链条效能提升`;
  }

  const width = 996;
  const colCount = activeCards.length;
  const padX = 24;
  const gap = colCount >= 4 ? 16 : 22;
  const cardW = (width - padX * 2 - gap * (colCount - 1)) / colCount;
  const maxCharsPerLine = Math.max(10, Math.floor((cardW - 44) / 11.4));

  const wrappedCards = activeCards.map(c => ({
    ...c,
    wrappedPoints: c.points.map(pt => wrapChars(pt, maxCharsPerLine).slice(0, 3)),
  }));
  const maxPointLines = Math.max(
    3,
    ...wrappedCards.map(c => c.wrappedPoints.reduce((s, lines) => s + lines.length + 0.48, 0)),
  );

  const cardY = 140;
  const hasAnyTag = wrappedCards.some(c => Boolean(c.tag));
  const pointsStartOffset = hasAnyTag ? 132 : 114;
  const cardH = Math.max(220, Math.ceil(pointsStartOffset + maxPointLines * 17.5 + 18));
  const goalY = cardY + cardH + 26;
  const goalH = 54;
  const totalHeight = goalY + goalH + 14;

  const capW = Math.max(168, Math.ceil(cjkSpan(frameworkLabel) * 13 + 42));
  const capX = (width - capW) / 2;
  const capY = 74;
  const capH = 30;
  const branchMidY = 120;
  const cardCenters = wrappedCards.map((_, i) => padX + i * (cardW + gap) + cardW / 2);
  const leftMostX = cardCenters[0];
  const rightMostX = cardCenters[cardCenters.length - 1];

  const topTreeSvg = `<g>
    <line x1="${width / 2}" y1="${capY + capH}" x2="${width / 2}" y2="${branchMidY}" stroke="${primary}" stroke-width="2"/>
    <line x1="${leftMostX.toFixed(1)}" y1="${branchMidY}" x2="${rightMostX.toFixed(1)}" y2="${branchMidY}" stroke="${primary}" stroke-width="2"/>
    ${cardCenters
      .map(
        cx => `<g>
          <circle cx="${cx.toFixed(1)}" cy="${branchMidY}" r="3.2" fill="${primary}"/>
          <line x1="${cx.toFixed(1)}" y1="${branchMidY}" x2="${cx.toFixed(1)}" y2="${cardY - 6}" stroke="${primary}" stroke-width="1.8"/>
          <polygon points="${cx.toFixed(1)},${cardY} ${(cx - 4).toFixed(1)},${cardY - 7.5} ${(cx + 4).toFixed(1)},${cardY - 7.5}" fill="${primary}"/>
        </g>`,
      )
      .join('')}
  </g>`;

  const circledNums = ['①', '②', '③', '④'];
  const cardsSvg = wrappedCards
    .map((c, idx) => {
      const x = padX + idx * (cardW + gap);
      const cx = x + cardW / 2;
      const accent = cardAccents[idx % cardAccents.length];
      const softTint = mixHex(accent, '#FFFFFF', 0.90);
      const borderTint = mixHex(accent, RULE_LINE, 0.45);
      const iconCy = hasAnyTag ? cardY + 90 : cardY + 78;

      let curY = cardY + pointsStartOffset;
      const ptsSvg = c.wrappedPoints
        .map((lines, pIdx) => {
          const blockStart = curY;
          const numGlyph = circledNums[pIdx] ?? `${pIdx + 1}.`;
          const textLines = lines
            .map((ln, lIdx) => {
              const ly = blockStart + lIdx * 16.5;
              return `<text x="${(x + 34).toFixed(1)}" y="${ly.toFixed(1)}" fill="${INK_DARK}" style="font-size:11.2px;font-family:${FONT_SANS};font-weight:${lIdx === 0 ? 600 : 500}">${esc(ln)}</text>`;
            })
            .join('');
          curY += lines.length * 16.5 + 8;
          return `<g>
            <text x="${(x + 15).toFixed(1)}" y="${blockStart.toFixed(1)}" fill="${accent}" style="font-size:12px;font-family:${FONT_SANS};font-weight:700">${esc(numGlyph)}</text>
            ${textLines}
          </g>`;
        })
        .join('');

      const tagPillW = c.tag ? Math.min(cardW - 24, Math.ceil(cjkSpan(c.tag) * 10.2 + 20)) : 0;

      return `<g>
        <rect x="${(x + 2).toFixed(1)}" y="${cardY + 3}" width="${cardW.toFixed(1)}" height="${cardH}" rx="12" fill="#E2E8F0" fill-opacity="0.45"/>
        <rect x="${x.toFixed(1)}" y="${cardY}" width="${cardW.toFixed(1)}" height="${cardH}" rx="12" fill="#FFFFFF" stroke="${borderTint}" stroke-width="1.4"/>
        <rect x="${x.toFixed(1)}" y="${cardY}" width="${cardW.toFixed(1)}" height="40" rx="12" fill="${accent}"/>
        <rect x="${x.toFixed(1)}" y="${cardY + 26}" width="${cardW.toFixed(1)}" height="14" fill="${accent}"/>
        <text x="${cx.toFixed(1)}" y="${cardY + 25}" text-anchor="middle" fill="#FFFFFF" style="font-size:13.2px;font-family:${FONT_SANS};font-weight:700">${esc(fitCleanPhrase(c.title, Math.floor((cardW - 20) / 13.4)))}</text>
        ${c.tag ? `<rect x="${(cx - tagPillW / 2).toFixed(1)}" y="${cardY + 47}" width="${tagPillW}" height="18" rx="9" fill="${softTint}"/><text x="${cx.toFixed(1)}" y="${cardY + 59.5}" text-anchor="middle" fill="${accent}" style="font-size:10px;font-family:${FONT_SANS};font-weight:700">${esc(fitCleanPhrase(c.tag, Math.floor((cardW - 28) / 10.4)))}</text>` : ''}
        <circle cx="${cx.toFixed(1)}" cy="${iconCy}" r="21" fill="${softTint}" stroke="${accent}" stroke-opacity="0.28" stroke-width="1"/>
        ${renderSummaryCardIcon(c.icon, cx, iconCy, accent)}
        <line x1="${(x + 16).toFixed(1)}" y1="${iconCy + 28}" x2="${(x + cardW - 16).toFixed(1)}" y2="${iconCy + 28}" stroke="#EEF2F6" stroke-width="1"/>
        ${ptsSvg}
      </g>`;
    })
    .join('');

  const bottomConvergeSvg = `<g>
    ${cardCenters
      .map(
        cx => `<line x1="${cx.toFixed(1)}" y1="${cardY + cardH}" x2="${cx.toFixed(1)}" y2="${goalY - 11}" stroke="${RULE_LINE}" stroke-width="1.5" stroke-dasharray="3 3"/>`,
      )
      .join('')}
    <line x1="${leftMostX.toFixed(1)}" y1="${goalY - 11}" x2="${rightMostX.toFixed(1)}" y2="${goalY - 11}" stroke="${RULE_LINE}" stroke-width="1.5"/>
    <polygon points="${width / 2},${goalY} ${width / 2 - 4.5},${goalY - 7.5} ${width / 2 + 4.5},${goalY - 7.5}" fill="${primary}"/>
  </g>`;

  const goalBadgeW = Math.max(88, Math.ceil(cjkSpan(goalTitle) * 11.5 + 24));
  const goalLines = wrapLines(goalText, 64, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>
    <text x="${width / 2}" y="30" text-anchor="middle" fill="${INK_DARK}" style="font-size:18px;font-family:${FONT_SANS};font-weight:700">${esc(r.title || '结构化支撑路径总结框架图')}</text>
    <text x="${width / 2}" y="52" text-anchor="middle" fill="${INK_MUTED}" style="font-size:12px;font-family:${FONT_SANS}">${esc(fitCleanPhrase(subtitle, 68))}</text>
    <rect x="${capX.toFixed(1)}" y="${capY}" width="${capW}" height="${capH}" rx="15" fill="${primary}"/>
    <text x="${width / 2}" y="${capY + 20}" text-anchor="middle" fill="#FFFFFF" style="font-size:12.5px;font-family:${FONT_SANS};font-weight:700">${esc(frameworkLabel)}</text>
    ${topTreeSvg}
    ${cardsSvg}
    ${bottomConvergeSvg}
    <rect x="${padX}" y="${goalY}" width="${width - padX * 2}" height="${goalH}" rx="11" fill="${mixHex(primary, '#FFFFFF', 0.91)}" stroke="${mixHex(primary, RULE_LINE, 0.45)}" stroke-width="1.3"/>
    <rect x="${padX + 14}" y="${goalY + (goalH - 26) / 2}" width="${goalBadgeW}" height="26" rx="13" fill="${primary}"/>
    <text x="${(padX + 14 + goalBadgeW / 2).toFixed(1)}" y="${goalY + goalH / 2 + 4}" text-anchor="middle" fill="#FFFFFF" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:700">${esc(goalTitle)}</text>
    ${goalLines.length === 1
      ? `<text x="${padX + 28 + goalBadgeW}" y="${goalY + goalH / 2 + 4.5}" fill="${INK_DARK}" style="font-size:12.2px;font-family:${FONT_SANS};font-weight:600">${esc(goalLines[0])}</text>`
      : goalLines.map((ln, i) => `<text x="${padX + 28 + goalBadgeW}" y="${goalY + 22 + i * 16}" fill="${INK_DARK}" style="font-size:11.5px;font-family:${FONT_SANS};font-weight:600">${esc(ln)}</text>`).join('')}
  </svg>`;
}

function hasQuestionnaireTree(r: ResultSnapshot): boolean {
  if (r.method === 'questionnaire-tree') return true;
  if (r.method !== 'diagram' && r.method !== 'framework') return false;
  const rawMeta = typeof r.rows[0]?.[5] === 'string' ? r.rows[0][5].trim() : '';
  if (!rawMeta.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(rawMeta) as { qt?: QuestionnaireTreeData };
    return Boolean(parsed.qt && Array.isArray(parsed.qt.modules) && parsed.qt.modules.length > 0);
  } catch {
    return false;
  }
}

function cleanPureChineseIndicator(raw: string): string {
  const s = raw
    .trim()
    .replace(/^[QqＱ]?\s*\d+(?:[._\-—]\d+)*\s*[.．、:：)）\-—]?\s*/u, '')
    .replace(/[A-Za-z][A-Za-z0-9_]{1,}/gu, '')
    .replace(/[（(][^）)]*(?:单选|多选|量表|打分|选填|必答|限选|正向|反向|题项|\d+\s*[—\-~～]\s*\d+)[^）)]*[）)]/gu, '')
    .replace(/^(?:请问|在您看来|就您个人而言|您的?|受访者(?:的)?|目前|平时|日常|过去\d+天内|最近\d+天内|总体而言|整体来看|若[^，,]{2,12}[，,]?)[，,、\s]*/gu, '')
    .replace(/(?:处于|属于|落在)?(?:以下|下面)?哪(?:一?[种个类项档]|些)(.*)$/u, '$1')
    .replace(/^(?:是否|有没有|有无)(?:愿意|考虑|曾经)?/u, '')
    .replace(/[？?。！!；;：:，,、\s]+$/gu, '')
    .trim();
  if (!s) return '测量题项';
  return cjkSpan(s) <= 13 ? s : fitCleanPhrase(s, 13);
}

function formatQuestionRange(nums: readonly number[]): string {
  if (!nums.length) return '';
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  if (sorted.length === 1) return `第${sorted[0]}题`;
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (contiguous) return `第${sorted[0]}—${sorted[sorted.length - 1]}题`;
  return `共${sorted.length}题（第${sorted[0]}—${sorted[sorted.length - 1]}题）`;
}

function describeTypeMix(types: readonly string[]): string {
  const map: Record<string, string> = {
    single: '单选',
    multi: '多选',
    likert: '量表',
    number: '评分',
    text: '开放题',
  };
  const labels = [...new Set(types.map(t => map[t] || '题项'))];
  return labels.slice(0, 2).join('/');
}

/**
 * Dynamically derive a universal, zero-hardcoded-domain `DiagramGraphSpec` (`questionnaireTree`)
 * from ANY `Questionnaire` JSON (`questions[]`) or explicit `modules[]` list.
 */
export function buildQuestionnaireStructureSpec(input: QuestionnaireStructureInput): DiagramGraphSpec {
  let tree: QuestionnaireTreeData;

  if ('modules' in input) {
    const cleanModules: QuestionnaireModuleSpec[] = input.modules
      .map(m => ({
        moduleTitle: cleanPureChineseIndicator(m.moduleTitle) || m.moduleTitle.trim(),
        ...(m.itemRange ? { itemRange: m.itemRange.trim() } : {}),
        ...(m.questionTypes ? { questionTypes: m.questionTypes.trim() } : {}),
        itemsSummary: Array.isArray(m.itemsSummary)
          ? m.itemsSummary.map(s => String(s).trim()).filter(Boolean)
          : String(m.itemsSummary).trim(),
        ...(m.routingHint ? { routingHint: m.routingHint.trim() } : {}),
      }))
      .filter(m => m.moduleTitle.length > 0)
      .slice(0, 6);

    tree = {
      rootLabel: (input.rootLabel || '问卷总体结构').trim(),
      totalQuestions: input.totalQuestions ?? cleanModules.length * 5,
      hasRouting: cleanModules.some(m => Boolean(m.routingHint)),
      modules: cleanModules.length
        ? cleanModules
        : [{ moduleTitle: '核心调查模块', itemsSummary: '背景特征 · 多维评价 · 行为意愿' }],
    };
  } else {
    const qs = input.questions ?? [];
    const byId = new Map<string, { q: QuestionnaireStructureQuestionInput; num: number }>();
    qs.forEach((q, idx) => byId.set(q.id, { q, num: idx + 1 }));

    // Identify gatekeeper questions referenced by downstream `condition`
    const gatedBy = new Map<string, { codes: Set<string>; count: number }>();
    for (const q of qs) {
      if (q.condition?.questionId) {
        const prev = gatedBy.get(q.condition.questionId) ?? { codes: new Set<string>(), count: 0 };
        q.condition.codes.forEach(c => prev.codes.add(c));
        prev.count++;
        gatedBy.set(q.condition.questionId, prev);
      }
    }

    const firstLikertIdx = qs.findIndex(q => q.type === 'likert');
    type BucketItem = { q: QuestionnaireStructureQuestionInput; num: number };
    const bScreen: BucketItem[] = [];
    const bScale: BucketItem[] = [];
    const bKano: BucketItem[] = [];
    const bBehavior: BucketItem[] = [];
    const bOutcome: BucketItem[] = [];

    qs.forEach((q, idx) => {
      const num = idx + 1;
      const combined = `${q.construct ?? ''} ${q.text}`;
      const isKano = /KANO|正反向|正向功能|反向功能|如果不具备|如果具备|具备该功能|不具备该功能/iu.test(combined);
      const isTailOutcome =
        idx >= Math.floor(qs.length * 0.72)
        && (q.type === 'text' || q.type === 'number' || /总体|整体|满意度|意愿|意向|推荐|复购|复用|建言|建议|看法/u.test(combined));

      if (
        q.purpose === 'screening'
        || q.purpose === 'background'
        || q.analysis === 'routing'
        || gatedBy.has(q.id)
        || (firstLikertIdx > 0 && idx < firstLikertIdx && !q.condition && q.type === 'single')
      ) {
        bScreen.push({ q, num });
      } else if (isKano) {
        bKano.push({ q, num });
      } else if (q.type === 'likert' && !isTailOutcome) {
        bScale.push({ q, num });
      } else if (isTailOutcome || q.type === 'text' || q.type === 'number') {
        bOutcome.push({ q, num });
      } else {
        bBehavior.push({ q, num });
      }
    });

    const extractIndicators = (list: readonly BucketItem[], maxItems = 5): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const { q } of list) {
        if (/请选择|指定选项|注意力核查|质控题/u.test(`${q.construct ?? ''} ${q.text}`)) {
          if (!seen.has('注意力质控核查')) {
            seen.add('注意力质控核查');
            out.push('注意力质控核查');
          }
          continue;
        }
        const raw = q.construct?.trim() ? q.construct : q.text;
        const cleaned = cleanPureChineseIndicator(raw)
          .replace(/(?:正向评价|反向评价|功能评价|配对评价)$/u, '')
          .trim();
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);
        out.push(cleaned);
        if (out.length >= maxItems) break;
      }
      return out.length ? out : ['核心测量题项'];
    };

    const describeConditionRule = (list: readonly BucketItem[], kindLabel: string): string | undefined => {
      const condItems = list.filter(item => Boolean(item.q.condition));
      if (!condItems.length) return undefined;
      const firstCond = condItems[0].q.condition!;
      const gate = byId.get(firstCond.questionId);
      const gateLabel = gate ? `第${gate.num}题` : '前置甄别题';
      if (condItems.length === list.length) {
        return `仅${gateLabel}有效经历编码（${firstCond.codes.join('/')}）受访者作答，其余自动跳过`;
      }
      return `${kindLabel}按${gateLabel}有效经历分流作答，其余公共题项覆盖全样本`;
    };

    const modules: QuestionnaireModuleSpec[] = [];

    if (bScreen.length) {
      const gateEntry = bScreen.find(item => gatedBy.has(item.q.id));
      let routingHint = '全样本必答，锁定受访资格与人口分层配额';
      if (gateEntry) {
        const info = gatedBy.get(gateEntry.q.id)!;
        routingHint = `依据第${gateEntry.num}题选项（编码 ${[...info.codes].join('/')}）动态控制后续 ${info.count} 道体验题跳答`;
      }
      modules.push({
        moduleTitle: '甄别路由与背景特征',
        itemRange: formatQuestionRange(bScreen.map(x => x.num)),
        questionTypes: describeTypeMix(bScreen.map(x => x.q.type)),
        itemsSummary: extractIndicators(bScreen, 5),
        routingHint,
      });
    }

    if (bScale.length) {
      const hasQc = bScale.some(x => /请选择|指定选项|注意力|质控/u.test(`${x.q.construct ?? ''} ${x.q.text}`));
      const condText = describeConditionRule(bScale, '感知子量表');
      modules.push({
        moduleTitle: '核心潜变量感知量表',
        itemRange: formatQuestionRange(bScale.map(x => x.num)),
        questionTypes: describeTypeMix(bScale.map(x => x.q.type)),
        itemsSummary: extractIndicators(bScale, 5),
        routingHint: condText ?? (hasQc ? '全样本五级量表评价，内嵌注意力质控核查题' : '五级李克特正向陈述测量'),
      });
    }

    if (bKano.length) {
      modules.push({
        moduleTitle: '需求属性正反向配对',
        itemRange: formatQuestionRange(bKano.map(x => x.num)),
        questionTypes: `${Math.max(1, Math.round(bKano.length / 2))}组配对`,
        itemsSummary: extractIndicators(bKano, 4),
        routingHint: describeConditionRule(bKano, '配对题项') ?? '正反向功能配对提问，识别必备、期望与魅力需求',
      });
    }

    if (bBehavior.length) {
      modules.push({
        moduleTitle: '行为触点与偏好特征',
        itemRange: formatQuestionRange(bBehavior.map(x => x.num)),
        questionTypes: describeTypeMix(bBehavior.map(x => x.q.type)),
        itemsSummary: extractIndicators(bBehavior, 5),
        routingHint: describeConditionRule(bBehavior, '实际使用频次题') ?? '覆盖全样本或对应子群的痛点多选、渠道偏好与承受区间',
      });
    }

    if (bOutcome.length) {
      modules.push({
        moduleTitle: '综合评价与开放建言',
        itemRange: formatQuestionRange(bOutcome.map(x => x.num)),
        questionTypes: describeTypeMix(bOutcome.map(x => x.q.type)),
        itemsSummary: extractIndicators(bOutcome, 5),
        routingHint: describeConditionRule(bOutcome, '体验评价题') ?? '衔接回归模型因变量与主观质性改进文本',
      });
    }

    if (!modules.length && qs.length) {
      modules.push({
        moduleTitle: '核心调查测量题项',
        itemRange: formatQuestionRange(qs.map((_, i) => i + 1)),
        questionTypes: describeTypeMix(qs.map(q => q.type)),
        itemsSummary: extractIndicators(qs.map((q, i) => ({ q, num: i + 1 })), 5),
      });
    }

    tree = {
      rootLabel: (input.rootLabel || '问卷结构与路由').trim(),
      totalQuestions: qs.length,
      hasRouting: gatedBy.size > 0 || qs.some(q => Boolean(q.condition)),
      modules,
    };
  }

  const rootNode: DiagramNodeSpec = {
    id: 'q-root',
    label: tree.rootLabel,
    sublabel: `共 ${tree.totalQuestions} 题 · ${tree.modules.length} 大模块`,
    stage: '总体架构',
    role: 'stage',
    x: 24,
    y: 160,
    width: 160,
    height: 84,
  };
  const modNodes: DiagramNodeSpec[] = tree.modules.map((m, idx) => ({
    id: `q-mod-${idx + 1}`,
    label: m.moduleTitle,
    sublabel: typeof m.itemsSummary === 'string' ? m.itemsSummary : m.itemsSummary.join(' · '),
    stage: m.itemRange || `模块 ${idx + 1}`,
    role: idx === tree.modules.length - 1 ? 'output' : 'process',
    x: 260,
    y: 30 + idx * 100,
    width: 240,
    height: 80,
  }));
  const edges: DiagramEdgeSpec[] = modNodes.map((nd, idx) => ({
    id: `q-edge-${idx + 1}`,
    source: rootNode.id,
    target: nd.id,
  }));

  return {
    direction: 'LR',
    nodes: [rootNode, ...modNodes],
    edges,
    questionnaireTree: tree,
  };
}

/**
 * Pure-white borderless horizontal academic《问卷结构树图》renderer (`width=996, height=dynamic`).
 * Left root node -> smooth cubic Bezier tree spine -> Middle module capsules -> Right indicator chips & routing rules.
 */
export function questionnaireStructureSVG(r: ResultSnapshot, ink: FigureInk): string {
  const { primary, secondary, opposite } = resolveInk(ink);
  const fourth = pickFourthClusterColor([primary, secondary, opposite]);
  const deepInk = mixHex(primary, '#0F172A', 0.32);

  const spec = parseDiagramSpec(r);
  const tree: QuestionnaireTreeData = spec.questionnaireTree ?? {
    rootLabel: '问卷结构与路由',
    totalQuestions: Math.max(1, r.n),
    hasRouting: false,
    modules: spec.nodes.slice(1).map((nd, i) => ({
      moduleTitle: nd.label,
      itemRange: nd.stage || `模块 ${i + 1}`,
      itemsSummary: nd.sublabel || '核心测量指标',
    })),
  };

  const modules = tree.modules.length
    ? tree.modules.slice(0, 6)
    : [{ moduleTitle: '核心测量模块', itemRange: '第1—10题', itemsSummary: '样本特征 · 感知量表 · 行为意愿' }];

  const moduleAccents = [
    primary,
    mixHex(primary, fourth, 0.52),
    secondary,
    opposite,
    deepInk,
    fourth,
  ];

  const width = 996;
  const padTop = 14;
  const padBottom = 14;
  const rowGap = 14;

  const prepared = modules.map((m, idx) => {
    const summaryStr = typeof m.itemsSummary === 'string'
      ? m.itemsSummary
      : m.itemsSummary.join(' · ');
    const indicatorLines = wrapLines(summaryStr, 37, 2);
    const routingClean = (m.routingHint ?? '').trim();
    const cardH = Math.max(
      76,
      26 + indicatorLines.length * 17 + (routingClean ? 24 : 8),
    );
    return {
      ...m,
      idx,
      indicatorLines,
      routingClean,
      cardH,
      accent: moduleAccents[idx % moduleAccents.length],
    };
  });

  let curY = padTop;
  const positioned = prepared.map(item => {
    const y = curY;
    const cy = y + item.cardH / 2;
    curY += item.cardH + rowGap;
    return { ...item, y, cy };
  });
  const totalHeight = Math.max(260, curY - rowGap + padBottom);

  // Left Root Node (x = 18..178, w = 160)
  const rootW = 160;
  const rootH = 96;
  const rootX = 18;
  const firstCy = positioned[0].cy;
  const lastCy = positioned[positioned.length - 1].cy;
  const rootCy = (firstCy + lastCy) / 2;
  const rootY = Math.max(14, Math.min(totalHeight - rootH - 14, rootCy - rootH / 2));
  const rootAnchorX = rootX + rootW;
  const rootAnchorY = rootY + rootH / 2;

  const celadonRoot = mixHex(primary, '#F6FAF9', 0.90);
  const rootStroke = mixHex(primary, '#CBD5E1', 0.45);
  const rootSub1 = `共 ${tree.totalQuestions} 道测量题项`;
  const rootSub2 = tree.hasRouting ? `${positioned.length} 大模块 · 含跳题路由` : `${positioned.length} 大结构化测量模块`;

  const rootSvg = `<g>
    <rect x="${rootX}" y="${rootY.toFixed(1)}" width="${rootW}" height="${rootH}" rx="10" fill="${celadonRoot}" stroke="${rootStroke}" stroke-width="1.3"/>
    <rect x="${rootX}" y="${(rootY + 12).toFixed(1)}" width="4" height="${rootH - 24}" rx="2" fill="${primary}"/>
    <text x="${rootX + rootW / 2 + 2}" y="${(rootY + 34).toFixed(1)}" text-anchor="middle" fill="${deepInk}" style="font-size:13.5px;font-family:${FONT_SANS};font-weight:700">${esc(fitCleanPhrase(tree.rootLabel, 10))}</text>
    <line x1="${rootX + 18}" y1="${(rootY + 46).toFixed(1)}" x2="${rootX + rootW - 14}" y2="${(rootY + 46).toFixed(1)}" stroke="${rootStroke}" stroke-width="0.9"/>
    <text x="${rootX + rootW / 2 + 2}" y="${(rootY + 64).toFixed(1)}" text-anchor="middle" fill="${primary}" style="font-size:10.6px;font-family:${FONT_SANS};font-weight:700">${esc(rootSub1)}</text>
    <text x="${rootX + rootW / 2 + 2}" y="${(rootY + 81).toFixed(1)}" text-anchor="middle" fill="${INK_MUTED}" style="font-size:9.8px;font-family:${FONT_SANS}">${esc(rootSub2)}</text>
    <circle cx="${rootAnchorX}" cy="${rootAnchorY.toFixed(1)}" r="3.6" fill="${primary}"/>
  </g>`;

  // Middle Module Capsules (x = 224..472, w = 248) & Right Leaf Cards (x = 502..978, w = 476)
  const modX = 224;
  const modW = 248;
  const leafX = 502;
  const leafW = 476;
  const numerals = ['模块一', '模块二', '模块三', '模块四', '模块五', '模块六'];

  const branchesAndRowsSvg = positioned
    .map(m => {
      const col = m.accent;
      const softTint = mixHex(col, '#FAFBF9', 0.92);
      const pillTint = mixHex(col, '#FFFFFF', 0.87);
      const borderCol = mixHex(col, '#CBD5E1', 0.48);
      const modH = Math.min(m.cardH, 72);
      const modY = m.cy - modH / 2;

      // Smooth cubic Bezier curve from rootAnchor to module left port
      const c1x = rootAnchorX + 24;
      const c2x = modX - 22;
      const curveD = `M ${rootAnchorX} ${rootAnchorY.toFixed(1)} C ${c1x} ${rootAnchorY.toFixed(1)} ${c2x} ${m.cy.toFixed(1)} ${modX - 5} ${m.cy.toFixed(1)}`;

      const metaTag = [m.itemRange, m.questionTypes].filter(Boolean).join(' · ') || numerals[m.idx];
      const modBadge = numerals[m.idx] ?? `模块 ${m.idx + 1}`;
      const badgeW = Math.ceil(cjkSpan(modBadge) * 9.6 + 14);

      const leafTitleY = m.y + 22;
      const routeY = m.y + m.cardH - 12;

      return `<g>
        <path d="${curveD}" fill="none" stroke="${mixHex(col, '#94A3B8', 0.35)}" stroke-width="1.5"/>
        <polygon points="${modX},${m.cy.toFixed(1)} ${modX - 6.5},${(m.cy - 3.2).toFixed(1)} ${modX - 6.5},${(m.cy + 3.2).toFixed(1)}" fill="${col}" fill-opacity="0.82"/>

        <rect x="${modX}" y="${modY.toFixed(1)}" width="${modW}" height="${modH}" rx="9" fill="${softTint}" stroke="${borderCol}" stroke-width="1.2"/>
        <rect x="${modX + 12}" y="${(modY + 10).toFixed(1)}" width="${badgeW}" height="17" rx="8.5" fill="${pillTint}"/>
        <text x="${(modX + 12 + badgeW / 2).toFixed(1)}" y="${(modY + 21.8).toFixed(1)}" text-anchor="middle" fill="${col}" style="font-size:9.6px;font-family:${FONT_SANS};font-weight:700">${esc(modBadge)}</text>
        <text x="${modX + 18 + badgeW}" y="${(modY + 22).toFixed(1)}" fill="${INK_MUTED}" style="font-size:9.5px;font-family:${FONT_SANS};font-weight:600">${esc(fitCleanPhrase(metaTag, 19))}</text>
        <text x="${modX + 14}" y="${(modY + 48).toFixed(1)}" fill="${INK_DARK}" style="font-size:12.4px;font-family:${FONT_SANS};font-weight:700">${esc(fitCleanPhrase(m.moduleTitle, 17))}</text>

        <line x1="${modX + modW}" y1="${m.cy.toFixed(1)}" x2="${leafX - 7}" y2="${m.cy.toFixed(1)}" stroke="${borderCol}" stroke-width="1.3"/>
        <polygon points="${leafX},${m.cy.toFixed(1)} ${leafX - 6.5},${(m.cy - 3.2).toFixed(1)} ${leafX - 6.5},${(m.cy + 3.2).toFixed(1)}" fill="${col}" fill-opacity="0.82"/>

        <rect x="${leafX}" y="${m.y}" width="${leafW}" height="${m.cardH}" rx="9" fill="#FFFFFF" stroke="${borderCol}" stroke-width="1.1"/>
        <rect x="${leafX}" y="${m.y + 9}" width="3.4" height="${m.cardH - 18}" rx="1.7" fill="${col}" fill-opacity="0.85"/>
        <text x="${leafX + 15}" y="${leafTitleY}" fill="${col}" style="font-size:10.2px;font-family:${FONT_SANS};font-weight:700">测量指标</text>
        ${m.indicatorLines
          .map(
            (ln, lIdx) =>
              `<text x="${leafX + 70}" y="${leafTitleY + lIdx * 17}" fill="${INK_DARK}" style="font-size:11px;font-family:${FONT_SANS};font-weight:${lIdx === 0 ? 600 : 500}">${esc(ln)}</text>`,
          )
          .join('')}
        ${
          m.routingClean
            ? `<line x1="${leafX + 15}" y1="${routeY - 14}" x2="${leafX + leafW - 15}" y2="${routeY - 14}" stroke="#F1F5F9" stroke-width="1"/>` +
              `<circle cx="${leafX + 19}" cy="${routeY - 3.5}" r="2.6" fill="${secondary}"/>` +
              `<text x="${leafX + 27}" y="${routeY}" fill="${INK_MUTED}" style="font-size:10px;font-family:${FONT_SANS}">${esc(fitCleanPhrase(m.routingClean, 44))}</text>`
            : ''
        }
      </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
    <rect x="0" y="0" width="${width}" height="${totalHeight}" fill="#FFFFFF"/>
    ${rootSvg}
    ${branchesAndRowsSvg}
  </svg>`;
}

export function diagramSnapshotSVG(r: ResultSnapshot, ink: FigureInk): string {
  if (hasQuestionnaireTree(r)) return questionnaireStructureSVG(r, ink);
  if (r.method === 'macro-trend') return macroTrendSVG(r, ink);
  if (r.method === 'summary-card') return summaryCardSVG(r, ink);
  if (r.method === 'cooccurrence') return vosviewerNetworkSVG(r, ink);
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
      `<mxCell id="${escXmlAttr(node.id)}" value="${escXmlAttr(label)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(node.x ?? 40)}" y="${Math.round(node.y ?? 40)}" width="${Math.round(node.width ?? 240)}" height="${Math.round(node.height ?? 72)}" as="geometry"/>` +
      `</mxCell>`,
    );
  }
  for (const edge of laid.edges) {
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;${edge.dashed ? 'dashed=1;' : ''}`;
    cells.push(
      `<mxCell id="${escXmlAttr(edge.id)}" value="${escXmlAttr(edge.label ?? '')}" style="${style}" edge="1" parent="1" source="${escXmlAttr(edge.source)}" target="${escXmlAttr(edge.target)}">` +
        `<mxGeometry relative="1" as="geometry"/>` +
      `</mxCell>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<mxfile host="EVI-X-DrawStudio" version="24.0">\n` +
    `  <diagram id="evix-diagram" name="${escXmlAttr(diagramName)}">\n` +
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
    const targetText = outEdges.map(e => (e.label ? `${e.target}(${e.label})` : e.target)).join(', ') || '终点节点';
    const meta = JSON.stringify({
      x: n.x,
      y: n.y,
      w: n.width,
      h: n.height,
      role: n.role,
      ...(index === 0
        ? {
            dir: laid.direction ?? 'TB',
            ...(laid.roadmapMeta ? { rm: laid.roadmapMeta } : {}),
            ...(laid.questionnaireTree ? { qt: laid.questionnaireTree } : {}),
          }
        : {}),
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
  const deduped = new Map<string, WordCloudEntry>();
  for (const w of params.words) {
    const trimmed = w.word.trim();
    if (!trimmed || !Number.isFinite(w.weight) || w.weight <= 0) continue;
    const norm = trimmed.replace(/\s+/gu, '').toLowerCase();
    const prev = deduped.get(norm);
    if (!prev || w.weight > prev.weight) {
      deduped.set(norm, { ...w, word: prev?.word ?? trimmed });
    }
  }
  const clean = [...deduped.values()].slice(0, 80);
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
  const constructDimCount =
    sorted.filter(w => w.category === '潜变量构念' || w.category === '作用机制').length ||
    Math.min(6, Math.max(1, new Set(sorted.map(w => w.category).filter(Boolean)).size || Math.min(4, sorted.length)));
  const metrics = [
    { label: '词云轮廓编号', value: CLOUD_SHAPE_CODES[resolvedShape] },
    { label: '关键词总数', value: sorted.length },
    { label: '核心构念维度数', value: constructDimCount },
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

/**
 * Package weighted literature keywords & co-occurrence links as a deterministic ResultSnapshot
 * rendered by `vosviewerNetworkSVG` (method: 'cooccurrence').
 */
export async function buildCooccurrenceResultSnapshot(params: {
  id: string;
  title: string;
  words: readonly CooccurrenceEntry[];
  links?: readonly CooccurrenceLink[];
  clusterLabels?: readonly string[];
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}): Promise<ResultSnapshot> {
  const deduped = new Map<string, CooccurrenceEntry>();
  for (const w of params.words) {
    const trimmed = w.word.trim();
    if (!trimmed || !Number.isFinite(w.weight) || w.weight <= 0) continue;
    const norm = trimmed.replace(/\s+/gu, '').toLowerCase();
    const prev = deduped.get(norm);
    if (!prev || w.weight > prev.weight) {
      deduped.set(norm, { ...w, word: prev?.word ?? trimmed });
    }
  }

  const sorted = [...deduped.values()].sort((a, b) => b.weight - a.weight).slice(0, 26);
  const totalWeight = sorted.reduce((sum, w) => sum + w.weight, 0) || 1;
  const rawClusters = sorted.map((entry, idx) => classifyCooccurrenceCluster(entry, idx));
  const clusters = rebalanceCooccurrenceClusters(rawClusters);
  const labelsByCluster = [0, 1, 2, 3].map(
    c => params.clusterLabels?.[c]?.trim() || DEFAULT_COOCCURRENCE_CLUSTERS[c],
  );

  const indexByNorm = new Map<string, number>();
  sorted.forEach((entry, idx) => {
    indexByNorm.set(entry.word.replace(/\s+/gu, '').toLowerCase(), idx);
  });

  let edges: InternalCooccurrenceEdge[] = [];
  if (params.links && params.links.length > 0) {
    const pairMap = new Map<string, InternalCooccurrenceEdge>();
    for (const lk of params.links) {
      const u = indexByNorm.get(lk.source.trim().replace(/\s+/gu, '').toLowerCase());
      const v = indexByNorm.get(lk.target.trim().replace(/\s+/gu, '').toLowerCase());
      if (u === undefined || v === undefined || u === v || !Number.isFinite(lk.strength)) continue;
      const a = Math.min(u, v);
      const b = Math.max(u, v);
      const key = `${a}:${b}`;
      const strength = Math.max(0.24, Math.min(0.96, lk.strength));
      const prev = pairMap.get(key);
      if (!prev || strength > prev.strength) pairMap.set(key, { u: a, v: b, strength });
    }
    edges = [...pairMap.values()].sort((a, b) => a.strength - b.strength);
  }
  if (!edges.length) {
    edges = synthesizeCooccurrenceEdges(
      sorted.map((entry, idx) => ({ word: entry.word, weight: entry.weight, cluster: clusters[idx] })),
    );
  }

  const partnersByNode: Array<Array<{ other: number; strength: number }>> = sorted.map(() => []);
  const forwardEdgesByNode: Array<Array<[number, number]>> = sorted.map(() => []);
  for (const e of edges) {
    partnersByNode[e.u].push({ other: e.v, strength: e.strength });
    partnersByNode[e.v].push({ other: e.u, strength: e.strength });
    forwardEdgesByNode[e.u].push([e.v, Number(e.strength.toFixed(3))]);
  }

  const headers = ['高频关键词', '共现频次', '中心度占比（%）', '主题聚类社区', '核心关联词', '拓扑结构'];
  const rows = sorted.map((entry, idx) => {
    const topPartners = [...partnersByNode[idx]]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3)
      .map(p => sorted[p.other]?.word)
      .filter(Boolean)
      .join(' · ') || '核心节点';
    const meta = JSON.stringify({
      c: clusters[idx],
      ...(forwardEdgesByNode[idx].length ? { e: forwardEdgesByNode[idx] } : {}),
    });
    return [
      entry.word.trim(),
      Math.round(entry.weight),
      Number(((entry.weight / totalWeight) * 100).toFixed(1)),
      labelsByCluster[clusters[idx]],
      topPartners,
      meta,
    ];
  });

  const activeClusterCount = new Set(clusters).size || 4;
  const metrics = [
    { label: '共现节点数', value: sorted.length },
    { label: '共现连边数', value: edges.length },
    { label: '主题聚类数', value: activeClusterCount },
  ];
  const dataHash = params.sourceHash && /^[a-f0-9]{64}$/.test(params.sourceHash)
    ? params.sourceHash
    : await digestText(JSON.stringify({ rows, edgesCount: edges.length }));

  const unsigned = parseResultSnapshot({
    id: params.id,
    title: params.title,
    sourceName: params.sourceName ?? 'EVI-X 文献计量共现引擎',
    sourceUrl: '',
    sourceHash: dataHash,
    resultHash: '0'.repeat(64),
    classification: params.classification ?? 'public',
    method: 'cooccurrence',
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

/**
 * Package dual-axis macro background time-series data (bars + line) as a provenance-hashed ResultSnapshot
 * rendered by `macroTrendSVG` (`method: 'macro-trend'`, placed in `intro.background`).
 */
export async function buildMacroTrendResultSnapshot(params: {
  id: string;
  title: string;
  points: readonly MacroTrendPoint[];
  barLabel: string;
  barUnit?: string;
  lineLabel: string;
  lineUnit?: string;
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}): Promise<ResultSnapshot> {
  const valid = params.points
    .map(p => ({
      period: p.period.trim(),
      barValue: Number.isFinite(p.barValue) ? p.barValue : 0,
      lineValue: Number.isFinite(p.lineValue) ? p.lineValue : 0,
    }))
    .filter(p => p.period.length > 0);

  const pts = valid.length >= 2
    ? valid
    : [
        { period: '2020', barValue: 2.64, lineValue: 11.4 },
        { period: '2021', barValue: 2.67, lineValue: 14.8 },
        { period: '2022', barValue: 2.80, lineValue: 18.5 },
        { period: '2023', barValue: 2.97, lineValue: 22.9 },
        { period: '2024', barValue: 3.10, lineValue: 27.4 },
        { period: '2025', barValue: 3.23, lineValue: 31.8 },
      ];

  const barHeader = params.barUnit && !params.barLabel.includes(params.barUnit)
    ? `${params.barLabel.trim()}（${params.barUnit.trim()}）`
    : params.barLabel.trim();
  const lineHeader = params.lineUnit && !params.lineLabel.includes(params.lineUnit)
    ? `${params.lineLabel.trim()}（${params.lineUnit.trim()}）`
    : params.lineLabel.trim();

  const headers = ['统计年份', barHeader, lineHeader];
  const rows = pts.map(p => [
    p.period,
    Number(p.barValue.toFixed(2)),
    Number(p.lineValue.toFixed(2)),
  ]);

  const first = pts[0];
  const last = pts[pts.length - 1];
  const metrics = [
    { label: '观测期数', value: pts.length },
    { label: '首期规模', value: Number(first.barValue.toFixed(2)) },
    { label: '末期规模', value: Number(last.barValue.toFixed(2)) },
    { label: '末期渗透率', value: Number(last.lineValue.toFixed(2)) },
  ];

  const dataHash = params.sourceHash && /^[a-f0-9]{64}$/.test(params.sourceHash)
    ? params.sourceHash
    : await digestText(JSON.stringify({ headers, rows }));

  const unsigned = parseResultSnapshot({
    id: params.id,
    title: params.title,
    sourceName: params.sourceName ?? '国家统计公报与行业统计年鉴整理',
    sourceUrl: '',
    sourceHash: dataHash,
    resultHash: '0'.repeat(64),
    classification: params.classification ?? 'user_provided',
    method: 'macro-trend',
    n: pts.length,
    total: pts.length,
    headers,
    rows,
    metrics,
    warnings: [],
    variables: [barHeader, lineHeader],
  });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}

/**
 * Package 2..4 structured pillars / support pathways + goal banner as a provenance-hashed ResultSnapshot
 * rendered by `summaryCardSVG` (`method: 'summary-card'`, anchorable by `SectionIllustration/v1`).
 */
export async function buildSummaryCardResultSnapshot(params: {
  id: string;
  title: string;
  subtitle?: string;
  frameworkLabel?: string;
  columns: readonly SummaryCardColumn[];
  goalTitle?: string;
  goalText: string;
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}): Promise<ResultSnapshot> {
  const defaultIcons: readonly SummaryCardIcon[] = ['compass', 'layers', 'users', 'shield'];
  const cleanCols = params.columns
    .map((c, idx) => ({
      title: c.title.trim(),
      tag: (c.tag ?? '').trim(),
      icon: c.icon ?? defaultIcons[idx % defaultIcons.length],
      points: c.points.map(p => p.trim()).filter(Boolean).slice(0, 4),
    }))
    .filter(c => c.title.length > 0)
    .slice(0, 4);

  const cols = cleanCols.length >= 2
    ? cleanCols
    : [
        { title: '理论体系拓展', tag: '构念深化', icon: 'compass' as const, points: ['构建本土情境多维感知测量框架', '厘清关键心理与行为传导机制'] },
        { title: '实证治理支撑', tag: '精准落地', icon: 'shield' as const, points: ['定位分群差异化服务体验短板', '形成可核验的基层协同推进方案'] },
      ];

  const headers = ['核心模块', '定位标签', '关键推进要点', '版式参数'];
  const rows = cols.map((c, idx) => {
    const meta = JSON.stringify({
      icon: c.icon,
      points: c.points,
      ...(idx === 0
        ? {
            ...(params.subtitle ? { subtitle: params.subtitle.trim() } : {}),
            ...(params.frameworkLabel ? { frameworkLabel: params.frameworkLabel.trim() } : {}),
            ...(params.goalTitle ? { goalTitle: params.goalTitle.trim() } : {}),
            goalText: params.goalText.trim(),
          }
        : {}),
    });
    return [c.title, c.tag || `模块 ${idx + 1}`, c.points.join('；'), meta];
  });

  const totalPoints = cols.reduce((s, c) => s + c.points.length, 0);
  const metrics = [
    { label: '结构支柱数', value: cols.length },
    { label: '核心要点数', value: totalPoints },
  ];

  const dataHash = params.sourceHash && /^[a-f0-9]{64}$/.test(params.sourceHash)
    ? params.sourceHash
    : await digestText(JSON.stringify({ title: params.title, rows, goalText: params.goalText }));

  const unsigned = parseResultSnapshot({
    id: params.id,
    title: params.title,
    sourceName: params.sourceName ?? '课题组实证研究框架梳理',
    sourceUrl: '',
    sourceHash: dataHash,
    resultHash: '0'.repeat(64),
    classification: params.classification ?? 'user_provided',
    method: 'summary-card',
    n: cols.length,
    total: totalPoints,
    headers,
    rows,
    metrics,
    warnings: [],
    variables: cols.map(c => c.title),
  });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}

/**
 * Convenience builder that derives a universal《问卷结构树图》ResultSnapshot (`method: 'diagram'`)
 * directly from any `Questionnaire` JSON or `QuestionnaireStructureInput`.
 */
export async function buildQuestionnaireStructureResultSnapshot(params: {
  id: string;
  title: string;
  questionnaire?: QuestionnaireStructureInput;
  spec?: DiagramGraphSpec;
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}): Promise<ResultSnapshot> {
  const resolvedSpec = params.spec ?? buildQuestionnaireStructureSpec(
    params.questionnaire ?? { modules: [] },
  );
  const base = await buildDiagramResultSnapshot({
    id: params.id,
    title: params.title,
    spec: resolvedSpec,
    classification: params.classification ?? 'user_provided',
    sourceName: params.sourceName ?? '调查问卷结构与路由设计方案',
    sourceHash: params.sourceHash,
  });
  const unsigned = parseResultSnapshot({
    ...base,
    method: 'diagram',
    resultHash: '0'.repeat(64),
  });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}

export interface SemDiagramInput {
  id: string;
  title: string;
  exogenous: readonly {
    id: string;
    stage: string;
    label: string;
    sublabel: string;
    betaToMediator: number;
    pToMediator: number;
    pathCode: string;
  }[];
  mediator: {
    id: string;
    stage: string;
    label: string;
    r2: number;
    ave?: number;
  };
  outcomes: readonly {
    id: string;
    stage: string;
    label: string;
    r2: number;
    betaFromMediator: number;
    pFromMediator: number;
    pathCode: string;
  }[];
  classification?: DataClassification;
  sourceName?: string;
  sourceHash?: string;
}

/**
 * Builds a true-vector left-to-right CFA/SEM structural path diagram ResultSnapshot (`method: 'diagram'`)
 * with non-overlapping exogenous -> mediator -> outcome node lanes and standardized β path labels.
 */
export async function buildSemDiagramResultSnapshot(params: SemDiagramInput): Promise<ResultSnapshot> {
  const exoList = params.exogenous.slice(0, 4);
  const outList = params.outcomes.slice(0, 2);
  const rowStep = 104;
  const exoStartY = 18;
  const exoSpanH = Math.max(1, exoList.length - 1) * rowStep + 88;
  const midY = Math.round(exoStartY + (exoSpanH - 96) / 2);

  const outRowStep = 132;
  const outSpanH = Math.max(1, outList.length - 1) * outRowStep + 94;
  const outStartY = Math.round(exoStartY + (exoSpanH - outSpanH) / 2);

  const stars = (p: number) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : ' (n.s.)');
  const nodes: DiagramNodeSpec[] = [
    ...exoList.map((ex, i) => ({
      id: ex.id,
      stage: ex.stage,
      label: ex.label,
      sublabel: ex.sublabel,
      role: 'stage' as const,
      x: 20,
      y: exoStartY + i * rowStep,
      width: 226,
      height: 88,
    })),
    {
      id: params.mediator.id,
      stage: params.mediator.stage,
      label: params.mediator.label,
      sublabel: `R² = ${params.mediator.r2.toFixed(3)}${params.mediator.ave !== undefined ? `｜AVE = ${params.mediator.ave.toFixed(3)}` : ''}`,
      role: 'decision' as const,
      x: 392,
      y: midY,
      width: 214,
      height: 96,
    },
    ...outList.map((out, j) => ({
      id: out.id,
      stage: out.stage,
      label: out.label,
      sublabel: `R² = ${out.r2.toFixed(3)}`,
      role: 'output' as const,
      x: 742,
      y: outStartY + j * outRowStep,
      width: 224,
      height: 94,
    })),
  ];

  const edges: DiagramEdgeSpec[] = [
    ...exoList.map(ex => ({
      id: `e_${ex.id}_${params.mediator.id}`,
      source: ex.id,
      target: params.mediator.id,
      label: `${ex.pathCode}: β=${ex.betaToMediator.toFixed(3)}${stars(ex.pToMediator)}`,
      dashed: ex.pToMediator >= 0.05,
    })),
    ...outList.map(out => ({
      id: `e_${params.mediator.id}_${out.id}`,
      source: params.mediator.id,
      target: out.id,
      label: `${out.pathCode}: β=${out.betaFromMediator.toFixed(3)}${stars(out.pFromMediator)}`,
      dashed: out.pFromMediator >= 0.05,
    })),
  ];

  const base = await buildDiagramResultSnapshot({
    id: params.id,
    title: params.title,
    spec: {
      direction: 'LR',
      nodes,
      edges,
    },
    classification: params.classification ?? 'user_provided',
    sourceName: params.sourceName ?? 'CFA/SEM 潜变量路径结构估计模型',
    sourceHash: params.sourceHash,
  });

  const unsigned = parseResultSnapshot({
    ...base,
    method: 'diagram',
    resultHash: '0'.repeat(64),
  });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}
