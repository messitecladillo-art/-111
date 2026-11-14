/**
 * Report-Driven AI Image Generation & Descriptive Statistics Composite Infographic Engine
 *
 * Bridges:
 * 1. Real image generation APIs (Google Gemini Nano Banana 2.1 / Pro, Imagen 3, OpenAI GPT-Image-1, Compatible Flux/Kolors)
 * 2. Automated prompt synthesis grounded in the active report's frozen analysis snapshots (`content.quality.results`)
 *    per `skill/research-descriptive-infographics/references/imagegen-prompt-template.md`
 * 3. Deterministic Swiss Bento vector infographic snapshots (`method: 'infographic'`) that lock real numbers and
 *    insert cleanly into A4 Paper Preview, Word DOCX, XeLaTeX PDF, and PPTX.
 */

import type { EditorContent } from '../editor-model.ts';
import { descriptiveInfographicSVG } from '../diagram-figures.ts';
import { digestText, parseResultSnapshot, resultPayload, type ResultSnapshot } from '../research-quality.ts';

export type ImageModelProvider = 'gemini' | 'imagen' | 'openai_compatible';

export interface ImageGenModelSpec {
  id: string;
  label: string;
  shortLabel: string;
  provider: ImageModelProvider;
  apiModel: string;
  badge: string;
}

export const IMAGE_GEN_MODELS: readonly ImageGenModelSpec[] = [
  {
    id: 'gemini-nano-banana-2.1',
    label: 'Nano Banana 2.1（Gemini 原生生图）',
    shortLabel: 'Nano Banana 2.1',
    provider: 'gemini',
    apiModel: 'gemini-2.5-flash-image-preview',
    badge: '推荐 · 信息图/配图',
  },
  {
    id: 'gemini-3-pro-image',
    label: 'Nano Banana Pro（4K 高精构图）',
    shortLabel: 'Nano Banana Pro',
    provider: 'gemini',
    apiModel: 'gemini-2.5-pro-image-preview',
    badge: '4K · 封面/复杂版式',
  },
  {
    id: 'imagen-3.0-generate-002',
    label: 'Google Imagen 3（出版级插画与封面）',
    shortLabel: 'Imagen 3',
    provider: 'imagen',
    apiModel: 'imagen-3.0-generate-002',
    badge: '写实/编辑风',
  },
  {
    id: 'gpt-image-1',
    label: 'OpenAI GPT-Image-1（透明背景/海报）',
    shortLabel: 'GPT-Image-1',
    provider: 'openai_compatible',
    apiModel: 'gpt-image-1',
    badge: '透明底图支持',
  },
  {
    id: 'kolors-flux-compatible',
    label: '兼容 OpenAI 生图网关（Flux / Kolors / Seedream）',
    shortLabel: 'Flux / 兼容网关',
    provider: 'openai_compatible',
    apiModel: 'black-forest-labs/FLUX.1-schnell',
    badge: '自定义 BaseURL',
  },
];

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
  recommendedModelId: string;
  description: string;
}

export const REPORT_IMAGE_TASKS: readonly ReportImageTaskSpec[] = [
  {
    id: 'descriptive_infographic',
    label: '描述性统计复合信息图',
    shortLabel: '📊 描述统计复合图',
    aspect: '16:9',
    recommendedModelId: 'gemini-nano-banana-2.1',
    description: '基于已冻结样本分布与维度均分生成多面板信息图，支持一键插入报告章节。',
  },
  {
    id: 'section_illustration',
    label: '章节调研场景与机制配图',
    shortLabel: '🖼️ 章节概念配图',
    aspect: '16:9',
    recommendedModelId: 'gemini-nano-banana-2.1',
    description: '围绕当前报告章节生成研究场景或机制示意配图。',
  },
  {
    id: 'report_cover',
    label: 'A4 报告主题封面',
    shortLabel: '📕 A4 封面',
    aspect: '3:4',
    recommendedModelId: 'gemini-3-pro-image',
    description: '生成高质感 A4 整页主题封面图并直接写入报告封面。',
  },
  {
    id: 'report_frame',
    label: '报告学术页框',
    shortLabel: '📐 学术页框',
    aspect: '3:4',
    recommendedModelId: 'gpt-image-1',
    description: '围绕 A4 正文版心留白生成极简学术边框装饰并应用至正文页。',
  },
];

export interface ExtractedDescriptiveStats {
  sampleN: number;
  totalN: number;
  resultCount: number;
  distributions: Array<{ label: string; value: number; unit: string }>;
  dimensionMeans: Array<{ label: string; value: number; unit: string }>;
  reliabilityAlpha: number | null;
  highlightFinding: string;
}

/** 从当前报告已冻结的 ResultSnapshot 中无幻觉提取描述性统计摘要 */
export function extractDescriptivePanelsFromReport(content: EditorContent): ExtractedDescriptiveStats {
  const results = content.quality?.results ?? [];
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
      const pctRaw = pctCol >= 0 ? row[pctCol] : row[2] ?? row[1];
      const numVal =
        typeof pctRaw === 'number'
          ? pctRaw
          : Number(String(pctRaw ?? '').replace(/[%％]/gu, '').trim());
      if (Number.isFinite(numVal) && distributions.length < 5) {
        const prefix = fr.variables?.[0] ? `${fr.variables[0].slice(0, 5)}·` : '';
        distributions.push({
          label: `${prefix}${cat}`,
          value: Number(numVal.toFixed(1)),
          unit: pctCol >= 0 || String(pctRaw).includes('%') ? '%' : countCol >= 0 ? '份' : '%',
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
          dimensionMeans.push({ label: dimName, value: Number(m.value.toFixed(2)), unit: '/ 5.0' });
        }
      }
    }
  }
  if (!dimensionMeans.length) {
    const profile = results.find(r => r.method === 'profile');
    if (profile) {
      const byDim = new Map<string, number[]>();
      for (const m of profile.metrics) {
        if (!m.label.includes('｜') || m.label.startsWith('人数｜') || typeof m.value !== 'number') continue;
        const dim = m.label.slice(0, m.label.lastIndexOf('｜'));
        if (!byDim.has(dim)) byDim.set(dim, []);
        byDim.get(dim)!.push(m.value);
      }
      for (const [dim, vals] of byDim) {
        if (dimensionMeans.length >= 5) break;
        const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        dimensionMeans.push({ label: dim, value: Number(avg.toFixed(2)), unit: '/ 5.0' });
      }
    }
  }

  const alphaSnap = results.find(r => r.method === 'alpha');
  const alphaMetric = alphaSnap?.metrics.find(m => /alpha|α/iu.test(m.label) && typeof m.value === 'number');
  const reliabilityAlpha = typeof alphaMetric?.value === 'number' ? Number(alphaMetric.value.toFixed(3)) : null;

  const firstConfirmed = content.quality?.findings.find(f => f.status === 'confirmed') ?? content.quality?.findings[0];
  let highlightFinding = firstConfirmed?.interpretation?.split(/[。\n]/u)[0]?.trim() ?? '';
  if (!highlightFinding && dimensionMeans.length >= 2) {
    const sorted = [...dimensionMeans].sort((a, b) => a.value - b.value);
    highlightFinding = `最低表现项为「${sorted[0].label}」(${sorted[0].value})，最高为「${sorted[sorted.length - 1].label}」(${sorted[sorted.length - 1].value})。`;
  }
  if (!highlightFinding) {
    highlightFinding = results.length
      ? `已接入 ${results.length} 项冻结分析快照（样本 n = ${sampleN}），信息图面板实时绑定。`
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

/** 依照 skill/research-descriptive-infographics 规范自动提取当前报告上下文 Prompt */
export function buildReportDrivenImagePrompt(
  content: EditorContent,
  task: ReportImageTaskId,
  targetSectionId?: string,
): string {
  const title = content.title?.trim() || '市场调查与实证分析研究报告';
  const accentLabel =
    content.accent === 'blue' ? '学院靛蓝 (#234E80) + 温暖米白纸基'
      : content.accent === 'burgundy' ? '绛红人文 (#8A3449) + 浅暖灰底'
        : '林青学术绿 (#0F766E) + 极简中性灰 (#F8FAFC)';
  const sec = content.report.find(s => s.id === targetSectionId) ?? content.report.find(s => /描述|样本|现状/u.test(s.title)) ?? content.report[0];
  const stats = extractDescriptivePanelsFromReport(content);
  const dimSummary = stats.dimensionMeans.map(d => d.label).slice(0, 4).join('、') || '核心体验维度';
  const distSummary = stats.distributions.map(d => d.label.split('·').pop()).filter(Boolean).slice(0, 4).join('、') || '样本构成对比';

  switch (task) {
    case 'descriptive_infographic':
      return [
        `为「${title}」创作科研级描述性统计复合信息图（Descriptive Statistics Composite Infographic）视觉版式。`,
        `实际字段与关系：展示受访人群构成（${distSummary}）与关键维度均分表现（${dimSummary}）之间的结构对比。`,
        '构图几何：采用 16:9 瑞士 Bento 双栏编辑式网格（左栏人群结构分布区，右栏多维度均值棒棒糖图区，顶部 3 枚 KPI 摘要卡，底部结论呼出条）。',
        `色彩与质感：${accentLabel}，高对比度扁平矢量线条，留足数据标注洁净空白区，不绘制伪图表数值、不添加水印与免责微字。`,
      ].join('\n');
    case 'section_illustration':
      return [
        `为调查报告章节「${sec?.title || title}」创作 16:9 极简编辑风概念机制插画（Editorial Concept Visual）。`,
        `核心语境：${(sec?.body || title).replace(/\s+/gu, ' ').slice(0, 90)}`,
        `风格要求：${accentLabel}，干净的扁平几何插画与轻微纸纹肌理，无多余乱码文字、无Logo或机构水印，适合直接嵌入学术报告正文。`,
      ].join('\n');
    case 'report_cover':
      return [
        `为全国大学生市场调查与分析大赛作品《${title}》创作 3:4 竖版 A4 出版级学术封面底图。`,
        `视觉隐喻：结合研究对象与“${dimSummary}”的多维实证图谱，使用克制的抽象等高线、光学棱镜网格与极简建筑感构图。`,
        `色彩与留白：${accentLabel}，上部 40% 保留大面积干净浅色负空间用于叠放报告正副标题，无乱码文字、无商业水印。`,
      ].join('\n');
    case 'report_frame':
      return [
        `为学术研究报告《${title}》创作 3:4 竖版 A4 极简页框装饰纹理（Academic Page Frame）。`,
        `版式约束：中央 75% 版心保持纯白彻底留白，仅在四周边距与页角布置 1px 细线几何角标、微弱网格刻度与${accentLabel}细条饰纹，不可干扰正文可读性。`,
      ].join('\n');
  }
}

const PROMPT_INSTRUCTION_PATTERN = /^(?:为[「『《"].*?[」』》"]\s*(?:创作|生成|绘制)|(?:创作|生成|绘制)[^，。\n]*(?:信息图|插画|封面|页框))/u;

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

/** 构造已通过 SHA-256 校验的描述性统计复合信息图 ResultSnapshot，可直接通过 placeResult 嵌入报告 */
export async function buildInfographicResultSnapshot(params: {
  content: EditorContent;
  title?: string;
  prompt?: string;
  classification?: ResultSnapshot['classification'];
}): Promise<ResultSnapshot> {
  const stats = extractDescriptivePanelsFromReport(params.content);
  const existing = params.content.quality?.results ?? [];
  const classification =
    params.classification
    ?? (existing.some(r => r.classification === 'simulated')
      ? 'simulated'
      : existing.some(r => r.classification === 'user_provided')
        ? 'user_provided'
        : 'public');
  const resolvedTitle = cleanInfographicTitle(params.title, params.content.title, '描述性统计复合信息图');
  const sourceHash =
    existing.find(r => /^[a-f0-9]{64}$/.test(r.sourceHash))?.sourceHash
    ?? (await digestText(JSON.stringify({ title: resolvedTitle, prompt: params.prompt ?? '' })));

  const rows: (string | number | null)[][] = [
    ['KPI', '有效样本量 n', stats.sampleN, '份 · 已质控'],
    ['KPI', '已冻结分析结果', stats.resultCount, '项快照'],
    ...(stats.reliabilityAlpha !== null ? [['KPI', '量表 Cronbach α', stats.reliabilityAlpha, '内部一致性']] : []),
    ...stats.distributions.map(d => ['频数分布', d.label, d.value, d.unit]),
    ...stats.dimensionMeans.map(d => ['均值评价', d.label, d.value, d.unit]),
    ['结论摘要', stats.highlightFinding.slice(0, 64), 1, '已锁定冻结数据'],
  ];

  const metrics = [
    { label: '有效样本量', value: stats.sampleN },
    { label: '涵盖分布与维度指标数', value: stats.distributions.length + stats.dimensionMeans.length },
  ];

  const unsigned = parseResultSnapshot({
    id: `infographic-${Date.now().toString(36)}`,
    title: resolvedTitle,
    sourceName: 'EVI-X AI 生图与统计信息图工坊',
    sourceUrl: '',
    sourceHash,
    resultHash: '0'.repeat(64),
    classification,
    method: 'infographic',
    n: stats.sampleN || rows.length,
    total: Math.max(stats.sampleN, stats.totalN, rows.length),
    headers: ['面板区域', '指标项', '数值', '单位/说明'],
    rows,
    metrics,
    warnings: stats.resultCount ? [] : ['当前报告尚未登记定量统计结果，仅展示框架占位结构。'],
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
