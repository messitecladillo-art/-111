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
export function suggestedNode(r: ResultSnapshot): string {
  switch (r.method) {
    case 'frequency': case 'numeric': return DEMOGRAPHIC.test(r.variables?.[0] ?? '') ? 'sample.profile' : 'sample.descriptive';
    case 'crosstab': case 'groups': case 'pearson': case 'spearman': return 'drivers.tests';
    case 'alpha': return 'data.testing';
    case 'quality-control': return 'data.cleaning';
    case 'sampling-frame': return 'design.sampling';
    default: return 'sample.descriptive';
  }
}

/** The exhibit that suits a result: distributions and comparisons as figures, item and rule lists as tables, a single coefficient in the text. */
export function suggestedExhibits(r: ResultSnapshot): ExhibitKind[] {
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
const block = (kind: ReportBlock['kind'], text: string, evidenceId = '', valueColumn = 1): ReportBlock => ({ id: crypto.randomUUID(), kind, text, evidenceId, valueColumn });

/**
 * The report with a result written into it. Without a section, the result goes to its blueprint section, which is
 * created (with its chapter) when the report has none. Throws with a reason when the target cannot take it.
 */
export function placeResult(content: EditorContent, resultId: string, options: { sectionId?: string; exhibits?: ExhibitKind[] } = {}): Placement {
  const r = resultFor(content.quality, resultId);
  let next = content, created: string[] = [], sectionId = options.sectionId;
  if (sectionId !== undefined) {
    if (!content.report.some(s => s.id === sectionId)) throw Error('目标章节不存在，请重新选择。');
  } else {
    const node = suggestedNode(r), existing = sectionForNode(content, node);
    if (existing) sectionId = existing.id;
    else {
      const inserted = insertBlueprintNode(content, node);
      if (inserted.content.report.length > EDITOR_LIMITS.sections) throw Error(`章节已满（${EDITOR_LIMITS.sections} 个），请先整理目录，或选择已有章节写入。`);
      next = inserted.content; created = inserted.inserted;
      sectionId = next.report.find(s => created.includes(s.id) && matchBlueprintNode(s.title)?.id === node)?.id;
      if (!sectionId) throw Error('未能建立目标章节，请选择已有章节写入。');
    }
  }
  const blocks: ReportBlock[] = [];
  // The method paragraph and its formulas appear once per report; later results of the same method rely on them.
  const intro = methodIntro(r);
  const formulas = new Set(next.report.flatMap(s => (s.blocks ?? []).filter(b => b.kind === 'formula').map(b => b.text.trim())));
  if (intro && !intro.formulas.every(f => formulas.has(f))) blocks.push(block('paragraph', intro.text), ...intro.formulas.map(f => block('formula', f)), block('paragraph', intro.where));
  const refs: ResultRefs = {};
  for (const kind of options.exhibits ?? suggestedExhibits(r)) {
    const exhibit = block(kind, resultCaption(r), r.id, kind === 'chart' ? defaultColumn(r) : 1);
    blocks.push(exhibit);
    refs[kind === 'chart' ? 'figure' : 'table'] = exhibit.id;
  }
  blocks.push(block('paragraph', readingParagraph(r, refs)));
  const section = next.report.find(s => s.id === sectionId)!;
  if ((section.blocks?.length ?? 0) + blocks.length > MAX_BLOCKS) throw Error(`「${section.title}」的内容块将超过 ${MAX_BLOCKS} 个，请换一个章节或先整理。`);
  next = { ...next, report: next.report.map(s => s.id === sectionId ? { ...s, blocks: [...(s.blocks ?? []), ...blocks] } : s) };
  return { content: parseEditorContent(next), sectionId, created, blocks };
}

/** Method names as the result catalogue shows them. */
export const METHOD_LABELS: Record<string, string> = {
  frequency: '频数分析', crosstab: '交叉分析与卡方检验', groups: '分组均值比较', numeric: '数值描述', pearson: 'Pearson 相关', spearman: 'Spearman 相关',
  alpha: '信度分析', 'quality-control': '问卷质量筛查', 'sampling-frame': '抽样设计',
};
