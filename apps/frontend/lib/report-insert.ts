/**
 * Content a workbench module sends to the report — paragraphs, display formulas and tables — bound for one blueprint
 * section and applied in one undoable step. Tables travel as registered results, so the Word export numbers and
 * typesets them like every other table. Builders here turn the sampling tools' output into such inserts.
 */
import type { EditorContent } from './editor-model.ts';
import { texProblem } from './omml.ts';
import { appendQualityResult, withQuality } from './quality-layouts.ts';
import { digestText, snapshotRecipe, type ReportBlock, type ResultSnapshot } from './research-quality.ts';
import { appendBlocks, block, targetSection } from './report-placement.ts';
import { captionText, literalText } from './report-templates.ts';
import type { SizePlan, SizeResult } from './sampling.ts';
import { texNum } from './sampling-core.ts';
import { equalProbabilityInclusion, frameTable, groupIsProbability, type PlanGroup } from './sampling-selection.ts';

export type InsertItem =
  | { kind: 'paragraph'; text: string }
  | { kind: 'formula'; tex: string }
  | { kind: 'table'; result: ResultSnapshot; caption: string };
/** `source` names the module in the confirmation message; `id` lets the editor apply each insert once. */
export type ReportInsert = { id: string; node: string; source: string; items: InsertItem[] };
export type AppliedInsert = { content: EditorContent; sectionId: string; created: string[]; blocks: ReportBlock[] };

/** The report with an insert applied: its tables registered as results, its blocks appended to the target section. */
export function applyReportInsert(content: EditorContent, insert: ReportInsert, sectionId?: string): AppliedInsert {
  if (!insert.items.length) throw Error('没有可写入的内容。');
  let next = withQuality(content);
  for (const item of insert.items) {
    if (item.kind === 'formula' && texProblem(item.tex)) throw Error(`公式无法排版：${texProblem(item.tex)}`);
    // The same design inserted twice reuses its registered table rather than adding a duplicate.
    if (item.kind === 'table') next = appendQualityResult(next, item.result);
  }
  const target = targetSection(next, insert.node, sectionId);
  const blocks = insert.items.map(item => item.kind === 'paragraph' ? block('paragraph', item.text)
    : item.kind === 'formula' ? block('formula', item.tex)
      : block('table', item.caption, item.result.id, 1));
  return { content: appendBlocks(target.content, target.sectionId, blocks), sectionId: target.sectionId, created: target.created, blocks };
}

/** One summary line per kind, for the editor's confirmation message: "段落 3 段、表 2 张、公式 1 个". */
export function insertSummary(blocks: readonly ReportBlock[]): string {
  const count = (kind: ReportBlock['kind']) => blocks.filter(b => b.kind === kind).length;
  return [count('paragraph') && `段落 ${count('paragraph')} 段`, count('table') && `表 ${count('table')} 张`, count('chart') && `图 ${count('chart')} 幅`, count('formula') && `公式 ${count('formula')} 个`].filter(Boolean).join('、');
}

/**
 * The staged sampling design: its method paragraph, one frame table per group (parent units merge across their rows in
 * Word), and the inclusion probability. Names typed by the author are copied literally.
 */
export async function samplingDesignInsert(groups: readonly PlanGroup[], statement: string): Promise<ReportInsert> {
  const items: InsertItem[] = statement.split('\n').map(line => line.trim()).filter(Boolean).map(line => ({ kind: 'paragraph' as const, text: literalText(line) }));
  let generalFormula = false;
  for (const group of groups) {
    const name = group.name.trim() || '该群体', frame = frameTable(group);
    if (frame.rows.length) {
      const sourceHash = await digestText(JSON.stringify(group));
      const result = await snapshotRecipe({
        method: 'sampling-frame', n: 0, total: 0, excluded: 0, missingRows: 0, invalidRows: 0, headers: frame.headers, rows: frame.rows,
        metrics: [{ label: '计划有效样本', value: group.completes }], interpretation: '',
        warnings: groupIsProbability(group) ? [] : [`${name}含拦截、配额或方便抽样阶段，不是概率样本，不报告严格的抽样误差`],
      }, { title: `${name}抽样框`.slice(0, 150), sourceName: '本研究抽样设计', sourceUrl: '', sourceHash, classification: 'user_provided' }, `sampling-frame-${sourceHash.slice(0, 16)}`);
      items.push({ kind: 'table', result, caption: captionText(`${name}各阶段抽样框与入样单位`) });
    }
    const p = equalProbabilityInclusion(group);
    if (p !== null) {
      items.push({ kind: 'paragraph', text: `${literalText(name)}各阶段均为等概率抽样，最终单位的入样概率为` }, { kind: 'formula', tex: `\\pi=\\prod_{k}\\frac{n_k}{N_k}=${texNum(p, 4)}` });
    } else if (groupIsProbability(group) && !generalFormula) {
      generalFormula = true;
      items.push({ kind: 'paragraph', text: '多阶段概率抽样中，单位的入样概率为各阶段入样概率之积，设计权数为其倒数：' },
        { kind: 'formula', tex: '\\pi_i=\\prod_{k=1}^{K}\\pi_i^{(k)},\\qquad w_i=\\frac{1}{\\pi_i}' },
        { kind: 'paragraph', text: '式中，$\\pi_i^{(k)}$ 为单位 $i$ 在第 $k$ 阶段的入样概率，$K$ 为阶段数，$w_i$ 为设计权数。' });
    }
  }
  return { id: crypto.randomUUID(), node: 'design.sampling', source: '抽样设计', items };
}

/** The sample-size calculation: the methods sentence, each step as a numbered formula with its values, and the symbols. */
export function sampleSizeInsert(plan: SizePlan, result: SizeResult, statement: string): ReportInsert {
  const symbols = [
    '$z_{\\alpha/2}$ 为置信水平对应的标准正态分位数',
    plan.target === 'proportion' ? '$p$ 为预估比例' : '$\\sigma$ 为总体标准差的估计值',
    '$e$ 为允许误差',
    ...(plan.population !== null ? ['$N$ 为总体规模'] : []),
    ...(plan.designEffect !== 1 ? ['$\\mathrm{deff}$ 为设计效应'] : []),
    '$r$ 为预计有效回收率',
  ];
  return {
    id: crypto.randomUUID(), node: 'design.sampling', source: '样本量计算',
    items: [
      { kind: 'paragraph', text: literalText(statement) },
      { kind: 'paragraph', text: '样本量依次按下列公式确定：' },
      ...result.steps.map(step => ({ kind: 'formula' as const, tex: step.formula })),
      { kind: 'paragraph', text: `式中，${symbols.join('，')}。` },
      // The calculator's caveats (an infeasible size, an assumed proportion) travel with the numbers they qualify.
      ...(result.warnings.length ? [{ kind: 'paragraph' as const, text: `需要说明的是：${result.warnings.map(literalText).join('')}` }] : []),
    ],
  };
}
