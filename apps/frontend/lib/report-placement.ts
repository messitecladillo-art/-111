/**
 * Puts a registered result into the report where the blueprint says it belongs: the matching section (created with
 * its chapter when missing), the method paragraph and formulas the first time a method appears in the report, the
 * one figure or table that suits the result, and a reading paragraph that cites it. One result adds one exhibit by
 * default, so a report does not fill up with a chart and a table repeating the same numbers.
 */
import { EDITOR_LIMITS, parseEditorContent, type EditorContent, type ReportSection } from './editor-model.ts';
import { insertBlueprintNode, matchBlueprintNode } from './report-blueprint.ts';
import { resultFor, type ReportBlock, type ResultSnapshot } from './research-quality.ts';
import { methodIntro, readingParagraph, resultCaption, type ResultRefs } from './report-templates.ts';

export type ExhibitKind = 'chart' | 'table';
const DEMOGRAPHIC = /性别|年龄|代际|世代|年级|学历|受教育|收入|职业|身份|专业|户籍|居住|婚姻|家庭|地区|城市|民族|政治面貌/u;
const MAX_BLOCKS = 60;

/** The blueprint section a result belongs in. */
/** The blueprint section each advanced method writes into (lib/advanced-analysis.ts). */
/** Why an advanced result is not placed from its table alone: its write-up comes from the calculation. */
export const ADVANCED_PLACEMENT = '高级方法的结果请在“数据分析 · 高级方法”中写进报告：方法说明、公式与读数来自计算过程，不能只凭结果表重写。';
export const ADVANCED_NODES: Readonly<Record<string, string>> = { validity: 'data.testing', regression: 'drivers.model', logistic: 'drivers.model', ipa: 'diagnosis.evaluation', cluster: 'segments.cluster', ahp: 'plan.priority', profile: 'compare.tests', likert: 'sample.descriptive', correlation: 'compare.tests' };

export function suggestedNode(r: ResultSnapshot): string {
  if (ADVANCED_NODES[r.method]) return ADVANCED_NODES[r.method];
  switch (r.method) {
    case 'macro-trend': return 'intro.background';
    case 'summary-card': {
      const tag = `${r.id} ${r.title}`;
      if (/innovation|创新/iu.test(tag)) return 'intro.innovation';
      if (/measure|action|路径|对策|支持|干预/iu.test(tag)) return 'plan.measures';
      if (/conclusion|finding|发现|结论/iu.test(tag)) return 'conclusion.findings';
      return 'intro.significance';
    }
    case 'cooccurrence': case 'wordcloud': return 'intro.literature';
    case 'meta': return 'intro.literature';
    case 'framework': case 'diagram': return 'design.content';
    case 'infographic': return 'sample.descriptive';
    case 'frequency': case 'numeric': return DEMOGRAPHIC.test(r.variables?.[0] ?? '') ? 'sample.profile' : 'sample.descriptive';
    case 'crosstab': case 'groups': case 'pearson': case 'spearman': case 'spearman-matrix': case 'mann-whitney': case 'interaction': case 'ab': return 'compare.tests';
    case 'bootstrap-ci': return 'sample.descriptive';
    case 'alpha': case 'efa': return 'data.testing';
    case 'logit': case 'mediation': case 'cs-did': case 'did': case 'sdid': case 'rdd': case 'psm': case 'iv': case 'conformal': case 'hlm': case 'survival': return 'drivers.model';
    case 'kano': case 'topsis': return 'diagnosis.evaluation';
    case 'uplift': return 'plan.priority';
    case 'quality-control': return 'data.cleaning';
    case 'sampling-frame': return 'design.sampling';
    default: return 'sample.descriptive';
  }
}

/** The exhibit that suits a result: distributions and comparisons as figures, item and rule lists as tables, a single coefficient in the text. */
export function suggestedExhibits(r: ResultSnapshot): ExhibitKind[] {
  // An advanced result is its table, and its own figure when the result carries one (lib/method-figures.ts).
  if (ADVANCED_NODES[r.method]) return r.metrics.length && r.metrics.every(m => m.label.includes('｜')) ? ['table', 'chart'] : ['table'];
  switch (r.method) {
    case 'macro-trend': case 'summary-card':
    case 'cooccurrence': case 'wordcloud': case 'framework': case 'diagram': case 'infographic':
    case 'frequency': case 'crosstab': case 'groups': case 'numeric': return ['chart'];
    case 'kano': return r.rows.length >= 2 ? ['table', 'chart'] : ['table'];
    case 'topsis': return r.rows.length >= 2 ? ['table', 'chart'] : ['table'];
    case 'survival': case 'meta': return r.rows.length >= 2 ? ['table', 'chart'] : ['table'];
    case 'rdd': case 'cs-did': case 'psm': case 'iv': case 'ab': return r.rows.length >= 1 ? ['table', 'chart'] : ['table'];
    case 'conformal': return r.metrics.some(m => typeof m.value === 'number' && Number.isFinite(m.value)) ? ['table', 'chart'] : ['table'];
    case 'pearson': case 'spearman': return r.headers[0] === '配对变量' && r.rows.length >= 2 ? ['table'] : [];
    default: return ['table'];
  }
}

/** The value column a figure of this result shows unless the author picks another. */
export function defaultColumn(r: ResultSnapshot): number {
  switch (r.method) {
    case 'frequency': return /%|％/.test(r.headers[2] ?? '') ? 2 : 1;
    case 'crosstab': case 'ab': return 3;
    case 'groups': case 'quality-control': case 'rdd': case 'psm': return 2;
    case 'iv': case 'meta': return 1;
    case 'cs-did': return /ATT/i.test(r.headers[2] ?? '') ? 2 : 1;
    case 'kano': return 3;
    case 'topsis': return 4;
    case 'survival': return 5;
    default: return 1;
  }
}

/** The section of this report that a blueprint node maps to, judged from section titles. */
export function sectionForNode(content: EditorContent, nodeId: string): ReportSection | undefined {
  return content.report.find(s => matchBlueprintNode(s.title)?.id === nodeId);
}

export type Placement = { content: EditorContent; sectionId: string; created: string[]; blocks: ReportBlock[] };
export const block = (kind: ReportBlock['kind'], text: string, evidenceId = '', valueColumn = 1): ReportBlock => ({ id: crypto.randomUUID(), kind, text, evidenceId, valueColumn });

/**
 * The section that takes new content: the chosen one, or the one the blueprint node maps to, created with its chapter
 * where the blueprint puts it when the report has none.
 */
export function targetSection(content: EditorContent, node: string, sectionId?: string): { content: EditorContent; sectionId: string; created: string[] } {
  if (sectionId !== undefined) {
    if (!content.report.some(s => s.id === sectionId)) throw Error('目标章节不存在，请重新选择。');
    return { content, sectionId, created: [] };
  }
  const existing = sectionForNode(content, node);
  if (existing) return { content, sectionId: existing.id, created: [] };
  const inserted = insertBlueprintNode(content, node);
  if (inserted.content.report.length > EDITOR_LIMITS.sections) throw Error(`章节已满（${EDITOR_LIMITS.sections} 个），请先整理目录，或选择已有章节写入。`);
  const id = inserted.content.report.find(s => inserted.inserted.includes(s.id) && matchBlueprintNode(s.title)?.id === node)?.id;
  if (!id) throw Error('未能建立目标章节，请选择已有章节写入。');
  return { content: inserted.content, sectionId: id, created: inserted.inserted };
}

/** The report with blocks appended to one section, validated as a whole. */
export function appendBlocks(content: EditorContent, sectionId: string, blocks: ReportBlock[]): EditorContent {
  const section = content.report.find(s => s.id === sectionId)!;
  if ((section.blocks?.length ?? 0) + blocks.length > MAX_BLOCKS) throw Error(`“${section.title}”的内容块将超过 ${MAX_BLOCKS} 个，请换一个章节或先整理。`);
  return parseEditorContent({ ...content, report: content.report.map(s => s.id === sectionId ? { ...s, blocks: [...(s.blocks ?? []), ...blocks] } : s) });
}

/**
 * The report with a result written into it. Without a section, the result goes to its blueprint section, which is
 * created (with its chapter) when the report has none. Throws with a reason when the target cannot take it.
 */
/** The declaration a section carries when it shows numbers from the teaching simulation (lib/research-flow.ts writes the same). */
export const SIMULATED_MARK = '【教学模拟数据，不能作为实际调查结果】';
const SIMULATED = /【教学模拟数据/u;

export function placeResult(content: EditorContent, resultId: string, options: { sectionId?: string; exhibits?: ExhibitKind[] } = {}): Placement {
  const r = resultFor(content.quality, resultId);
  if (ADVANCED_NODES[r.method]) throw Error(ADVANCED_PLACEMENT);
  // A sampling frame is only legible as a table of its stages and units.
  if (r.method === 'sampling-frame' && options.exhibits && !options.exhibits.includes('table')) throw Error('抽样框需要以表格呈现，请勾选“表”。');
  const { content: next, sectionId, created } = targetSection(content, suggestedNode(r), options.sectionId);
  const blocks: ReportBlock[] = [];
  // The method paragraph and its formulas appear once per report; later results of the same method rely on them.
  const intro = methodIntro(r);
  const shown = intro && next.report.some(s => (s.blocks ?? []).some(b => b.kind === 'formula' && b.text.replace(/\s+/g, '').startsWith(intro.key)));
  if (intro && !shown) blocks.push(block('paragraph', intro.text), ...intro.formulas.map(f => block('formula', f)), block('paragraph', intro.where));
  const refs: ResultRefs = {};
  for (const kind of options.exhibits ?? suggestedExhibits(r)) {
    const exhibit = block(kind, resultCaption(r, kind), r.id, kind === 'chart' ? defaultColumn(r) : 1);
    blocks.push(exhibit);
    refs[kind === 'chart' ? 'figure' : 'table'] = exhibit.id;
  }
  blocks.push(block('paragraph', readingParagraph(r, refs)));
  // Numbers from the teaching simulation are declared in the section that shows them, as the analysis flow declares them.
  const declared = r.classification !== 'simulated' || next.report.some(s => s.id === sectionId && SIMULATED.test(s.body + s.source));
  const marked = declared ? next : { ...next, report: next.report.map(s => s.id === sectionId ? { ...s, body: s.body.trim() ? `${SIMULATED_MARK}\n${s.body}` : SIMULATED_MARK } : s) };
  return { content: appendBlocks(marked, sectionId, blocks), sectionId, created, blocks };
}

/**
 * Whether the report already shows this result: an exhibit of it, or, for a result written only in words, its
 * reading paragraph as placement wrote it. A paragraph the author has since rewritten no longer counts.
 */
export function resultPlaced(content: EditorContent, r: ResultSnapshot): boolean {
  const blocks = content.report.flatMap(s => s.blocks ?? []);
  // A result whose reading cannot be written (a stored snapshot without rows) is known by its exhibits alone.
  let words: string | null;
  try { words = readingParagraph(r); } catch { words = null; }
  return blocks.some(b => ((b.kind === 'chart' || b.kind === 'table') && b.evidenceId === r.id) || (b.kind === 'paragraph' && b.text === words));
}

/** Method names as the result catalogue shows them. */
export const METHOD_LABELS: Record<string, string> = {
  'macro-trend': '宏观背景双轴趋势图', 'summary-card': '结构化路径与总结框架图',
  cooccurrence: '文献关键词共现聚类网络', wordcloud: '文献与语料关键词词云', framework: '研究技术路线图', diagram: '研究结构流程图', infographic: '描述性统计复合信息图',
  frequency: '频数分析', crosstab: '交叉分析与卡方检验', groups: '分组均值比较', numeric: '数值描述', pearson: 'Pearson 相关', spearman: 'Spearman 相关',
  'bootstrap-ci': 'Bootstrap 95% 置信区间', 'spearman-matrix': 'Spearman 秩相关稳健矩阵', 'mann-whitney': "Mann-Whitney U 与 Cliff's δ 非参数检验",
  alpha: '信度分析', efa: 'KMO 与因子适宜性', 'quality-control': '问卷质量筛查', 'sampling-frame': '抽样设计',
  validity: '因子分析（效度）', regression: '线性回归', logistic: 'Logistic 回归', logit: '二元 Logistic 回归',
  mediation: 'Bootstrap 中介效应', interaction: '子群异质性与调节检验', 'cs-did': '交错多期 DID (CS-ATT)',
  conformal: 'Split Conformal 预测带', did: '双重差分 (DID)', sdid: '合成双重差分 (SDID)', rdd: '断点回归 (RDD)',
  hlm: '多层线性模型 (HLM)', uplift: '因果森林增益 (Uplift)',
  kano: 'Kano 需求属性与 Better-Worse 象限', psm: '倾向得分匹配 (PSM)', topsis: '熵权 TOPSIS 综合评价',
  iv: '工具变量二阶段最小二乘 (IV-2SLS)', ab: '在线/田野序贯 A/B 实验检验',
  survival: 'Kaplan-Meier 生存分析与 Log-Rank 检验', meta: '随机效应 Meta 合成与异质性检验',
  ipa: '重要性—表现分析（IPA）', cluster: '聚类分析', ahp: '层次分析（AHP）',
};
