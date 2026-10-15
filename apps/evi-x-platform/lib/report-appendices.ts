/**
 * Appendix drafts from what the platform already holds — the questionnaire design, the processing record of the
 * registered results, and the author's own statement of AI use — so each appendix describes what was actually done.
 * Text typed by the author is copied literally; nothing is invented.
 */
import { EDITOR_LIMITS, type EditorContent } from './editor-model.ts';
import { QUESTION_TYPES, type DesignQuestion, type Questionnaire } from './questionnaire.ts';
import { METHOD_LABELS, targetSection } from './report-placement.ts';
import { literalText } from './report-templates.ts';

/** Option labels A … Z, then AA, AB …, so up to thirty options stay distinct. */
const letter = (i: number): string => i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
function questionLines(q: DesignQuestion, index: number, all: readonly DesignQuestion[]): string[] {
  const parent = q.condition ? all.findIndex(x => x.id === q.condition!.questionId) : -1;
  const when = parent >= 0 ? `（第 ${parent + 1} 题选择${q.condition!.codes.map(code => `“${all[parent].choices.find(c => c.code === code)?.label ?? code}”`).join('或')}者回答）` : '';
  const head = `${index + 1}. ${q.text.trim()}（${QUESTION_TYPES[q.type]}）${when}`;
  if (q.type === 'single' || q.type === 'multi') {
    const options = q.choices.map((c, i) => `${q.type === 'single' ? '○' : '□'}${letter(i)}. ${c.label}`);
    // Short options share one line; long ones stand one per line.
    return options.join('　').length <= 60 ? [head, options.join('　')] : [head, ...options];
  }
  if (q.type === 'likert') {
    // Points are listed for an ordinary scale (up to eleven whole points); any other range is described by its ends.
    const min = q.min ?? 1, max = q.max ?? 5, listable = Number.isInteger(min) && Number.isInteger(max) && max >= min && max - min <= 10;
    const points = listable ? Array.from({ length: max - min + 1 }, (_, i) => `○${min + i}`) : [`在 ${min} 到 ${max} 之间作答：________`];
    const anchors = [q.minLabel && `${min} = ${q.minLabel}`, q.maxLabel && `${max} = ${q.maxLabel}`].filter(Boolean).join('，');
    return [head + (anchors ? `（${anchors}）` : ''), points.join('　')];
  }
  return [head, q.type === 'number' ? '________' : '__________________________'];
}

/** The full questionnaire as appendix lines: title, introduction, then every question with its options. */
export function questionnaireAppendix(q: Questionnaire): string[] {
  const lines = [q.title.trim(), ...q.introduction.split(/\r?\n/).map(l => l.trim()).filter(Boolean), ...q.questions.flatMap((x, i) => questionLines(x, i, q.questions))];
  return lines.filter(Boolean).map(literalText);
}

/** The processing record of every registered result: source, method, sample, filter scope, missing codes, quality control. */
export function dataAppendix(content: EditorContent): string[] {
  const results = content.quality?.results ?? [];
  if (!results.length) return [];
  const kind = (c: string) => c === 'simulated' ? '模拟数据' : c === 'public' ? '公开数据' : '用户提供数据';
  const record = (warnings: readonly string[]) => warnings.filter(w => /^原表|^缺失编码|^质控/.test(w)).map(w => w.replace(/[。；]$/u, ''));
  return [
    `本报告的统计结果来自以下 ${results.length} 项已登记的分析，每项均记录数据来源、计算口径与有效样本：`,
    ...results.map((r, i) => literalText(`${i + 1}. ${r.title}（${METHOD_LABELS[r.method] ?? r.method}）：数据来源为${r.sourceName}（${kind(r.classification)}）`
      + (r.method === 'sampling-frame' ? '。' : `；有效样本 ${r.n}${r.total !== r.n ? `（共 ${r.total}）` : ''}${record(r.warnings).map(w => `；${w}`).join('')}。`))),
    '各结果的计算前提（缺失处理、是否加权、检验的适用条件）见正文各节的注释。',
  ];
}

export type AiUse = { used: boolean; tools: string; uses: string[]; sections: string; checking: string };
export const AI_USES = ['文献检索与梳理', '问卷题目拟稿', '章节文字拟稿', '数据分析代码', '文字润色与改写', '翻译', '图表与排版建议'] as const;
export const DEFAULT_AI_CHECKING = '所有生成内容均由小组成员逐条核对并修改；报告中的数据、统计量、图表与公式均由登记的分析结果直接生成，未使用生成式人工智能产生任何数字。';
/** The AI-use statement from the author's own answers, plus what the platform generated without AI. */
export function aiAppendix(answer: AiUse, content: EditorContent): string[] {
  const blocks = content.report.flatMap(s => s.blocks ?? []);
  const count = (kind: string) => blocks.filter(b => b.kind === kind).length;
  const generated = [count('chart') && `统计图 ${count('chart')} 幅`, count('table') && `统计表 ${count('table')} 张`, count('formula') && `公式 ${count('formula')} 个`].filter(Boolean).join('、');
  const platform = generated ? `报告中的${generated}及其读数段由研究平台根据登记的分析结果按固定规则生成，不涉及生成式人工智能。` : '报告中暂无由研究平台生成的统计图、表与公式。';
  if (!answer.used) return ['本研究在选题、调查设计、数据处理、分析与报告撰写过程中未使用生成式人工智能工具。', platform];
  const tools = answer.tools.trim(), uses = answer.uses.filter(Boolean), sections = answer.sections.trim();
  if (!tools || !uses.length) throw Error('请填写使用的工具与版本，并至少选择一项用途。');
  return [
    literalText(`本研究在以下环节使用了生成式人工智能工具：${tools}。用途为${uses.join('、')}${sections ? `，涉及${sections}` : ''}。`),
    literalText(answer.checking.trim() || DEFAULT_AI_CHECKING),
    platform,
  ];
}

/**
 * The report with lines written into the body of a blueprint appendix (created where the blueprint puts it when
 * missing). Text already in that body is kept and the new lines follow it.
 */
export function writeAppendix(content: EditorContent, node: string, lines: readonly string[]): { content: EditorContent; sectionId: string; created: string[] } {
  if (!lines.length) throw Error('没有可写入的内容。');
  const target = targetSection(content, node);
  const section = target.content.report.find(s => s.id === target.sectionId)!;
  const body = [section.body.trim(), lines.join('\n')].filter(Boolean).join('\n');
  if (body.length > EDITOR_LIMITS.body) throw Error(`「${section.title}」的正文将超过 ${EDITOR_LIMITS.body.toLocaleString('zh-CN')} 字，请先删减或把内容分成两个附录。`);
  return { content: { ...target.content, report: target.content.report.map(s => s.id === target.sectionId ? { ...s, body } : s) }, sectionId: target.sectionId, created: target.created };
}

/** A section body with new lines after what is already there, within the body limit. */
export function appendLines(body: string, lines: readonly string[], title: string): string {
  const next = [body.trim(), lines.join('\n')].filter(Boolean).join('\n');
  if (next.length > EDITOR_LIMITS.body) throw Error(`「${title}」的正文将超过 ${EDITOR_LIMITS.body.toLocaleString('zh-CN')} 字，请先删减或把内容分成两个附录。`);
  return next;
}
