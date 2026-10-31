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
const DEMOGRAPHIC = /性别|年龄|年级|学历|受教育|收入|职业|身份|专业|户籍|居住|婚姻|家庭|地区|城市|民族|政治面貌/u;
const MAX_BLOCKS = 60;

/** The blueprint section a result belongs in. */
/** The blueprint section each advanced method writes into (lib/advanced-analysis.ts). */
export const ADVANCED_NODES: Readonly<Record<string, string>> = { validity: 'data.testing', regression: 'drivers.model', logistic: 'drivers.model', ipa: 'diagnosis.evaluation', cluster: 'segments.cluster', ahp: 'plan.priority' };

export function suggestedNode(r: ResultSnapshot): string {
  if (ADVANCED_NODES[r.method]) return ADVANCED_NODES[r.method];
  switch (r.method) {
    case 'frequency': case 'numeric': return DEMOGRAPHIC.test(r.variables?.[0] ?? '') ? 'sample.profile' : 'sample.descriptive';
    case 'crosstab': case 'groups': case 'pearson': case 'spearman': return 'compare.tests';
    case 'alpha': return 'data.testing';
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
    case 'frequency': case 'crosstab': case 'groups': case 'numeric': return ['chart'];
    case 'pearson': case 'spearman': return [];
    default: return ['table'];
  }
}

/** The value column a figure of this result shows unless the author picks another. */
export function defaultColumn(r: ResultSnapshot): number {
  switch (r.method) {
    case 'frequency': return /%|％/.test(r.headers[2] ?? '') ? 2 : 1;
    case 'crosstab': return 3;
    case 'groups': case 'quality-control': return 2;
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
  if ((section.blocks?.length ?? 0) + blocks.length > MAX_BLOCKS) throw Error(`「${section.title}」的内容块将超过 ${MAX_BLOCKS} 个，请换一个章节或先整理。`);
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
    const exhibit = block(kind, resultCaption(r), r.id, kind === 'chart' ? defaultColumn(r) : 1);
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
  frequency: '频数分析', crosstab: '交叉分析与卡方检验', groups: '分组均值比较', numeric: '数值描述', pearson: 'Pearson 相关', spearman: 'Spearman 相关',
  alpha: '信度分析', 'quality-control': '问卷质量筛查', 'sampling-frame': '抽样设计',
};
