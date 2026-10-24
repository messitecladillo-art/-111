/**
 * 回溯: the path an exhibit's numbers took into the report — the registered result, the rows it was computed on, the
 * quality control that removed answers, the data file, and the questions its variables came from. Every step is read
 * from what the platform recorded when the result was registered; nothing is reconstructed or guessed, and a variable
 * that matches no question says so.
 */
import type { EditorContent } from '../editor-model.ts';
import type { Questionnaire } from '../questionnaire.ts';
import { blockLabel, reportLabels } from '../report-numbering.ts';
import { METHOD_LABELS } from '../report-placement.ts';

export type TraceStep = { kind: 'result' | 'scope' | 'quality' | 'source' | 'question'; text: string; detail: string };
export type Trace = { id: string; reference: string; title: string; steps: TraceStep[] };

const SOURCE_KIND: Record<string, string> = { simulated: '教学模拟数据', public: '公开数据', user_provided: '用户提供数据' };
/** "图 3－1", "图3.1" and "图 3-1" name the same exhibit. */
export const exhibitKey = (text: string) => text.replace(/\s+/gu, '').replace(/[０-９]/gu, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[－—.．]/gu, '-');
const sentence = (text: string) => text.replace(/[。；]$/u, '');

function questionSteps(variables: readonly string[], design: Questionnaire | null): TraceStep[] {
  return variables.map(name => {
    const key = name.trim().toLowerCase();
    const index = design ? design.questions.findIndex(q => q.variable.trim().toLowerCase() === key || (!!q.text.trim() && q.text.trim() === name.trim())) : -1;
    if (!design || index < 0) return { kind: 'question', text: `变量「${name}」`, detail: design ? '没有对应到问卷设计里的题目' : '问卷设计里还没有问卷，无法对应到题目' };
    const q = design.questions[index];
    return { kind: 'question', text: `第 ${index + 1} 题「${q.text.trim() || '题干待填写'}」`, detail: `变量 ${q.variable}` };
  });
}

/** Every chart and table in the report that rests on a registered result, in reading order, with its path back. */
export function traceExhibits(content: EditorContent | null, design: Questionnaire | null): Trace[] {
  if (!content) return [];
  const results = new Map((content.quality?.results ?? []).map(r => [r.id, r]));
  const labels = reportLabels(content.report);
  const traces: Trace[] = [];
  for (const section of content.report) for (const block of section.blocks ?? []) {
    const r = (block.kind === 'chart' || block.kind === 'table') ? results.get(block.evidenceId) : undefined;
    if (!r) continue;
    const frame = r.method === 'sampling-frame', planned = r.metrics.find(m => m.label === '计划有效样本')?.value;
    const steps: TraceStep[] = [
      { kind: 'result', text: `结果「${r.title}」`, detail: `${METHOD_LABELS[r.method] ?? r.method}${frame ? (planned ? ` · 计划有效样本 ${planned}` : '') : ` · 有效样本 ${r.n}${r.total !== r.n ? `（共 ${r.total}）` : ''}`}` },
      ...r.warnings.filter(w => /^原表/u.test(w)).map((w): TraceStep => ({ kind: 'scope', text: '计算范围', detail: sentence(w) })),
      // A frame's recorded caveat (a non-probability stage) bounds what its numbers can claim, so it stays on the path.
      ...(frame ? r.warnings.map((w): TraceStep => ({ kind: 'scope', text: '抽样说明', detail: sentence(w) })) : []),
      ...r.warnings.filter(w => /^质控/u.test(w)).map((w): TraceStep => ({ kind: 'quality', text: '质量控制', detail: sentence(w.replace(/^质控：/u, '')) })),
      { kind: 'source', text: frame ? '抽样设计' : `数据「${r.sourceName}」`,
        detail: `${frame ? r.sourceName : SOURCE_KIND[r.classification] ?? r.classification} · 指纹 SHA-256 ${r.sourceHash.slice(0, 12)}…${r.sourceUrl ? ` · ${r.sourceUrl}` : ''}` },
      ...questionSteps(r.variables ?? [], design),
    ];
    traces.push({ id: `${section.id}:${block.id}`, reference: blockLabel(labels, section.id, block.id)?.reference ?? (block.kind === 'chart' ? '图' : '表'), title: block.text.trim() || r.title, steps });
  }
  return traces;
}
