import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorContent, EDITOR_LIMITS, parseEditorContent } from '../lib/editor-model.ts';
import { blueprintSections, matchBlueprintNode } from '../lib/report-blueprint.ts';
import { aiAppendix, appendLines, dataAppendix, DEFAULT_AI_CHECKING, questionnaireAppendix, writeAppendix } from '../lib/report-appendices.ts';
import { splitInlineMath } from '../lib/inline-math.ts';

const question = (id, text, type, extra = {}) => ({ id, variable: id, text, type, required: true, purpose: 'research', researchQuestion: '', construct: '', analysis: 'description', decisionUse: '', source: '',
  choices: [], min: null, max: null, minLabel: '', maxLabel: '', reverse: false, condition: null, ...extra });
// A placeholder questionnaire written for the test.
const design = { schema: 'questionnaire-design/v1', classification: 'proposed', title: '社区体育设施使用调查问卷', objective: '', population: '', geography: '', period: '', recruitment: '',
  introduction: '您好！本问卷用于了解社区体育设施的使用情况，约需 5 分钟。\n所有回答仅用于统计分析。', pilotNotes: '',
  questions: [
    question('q1', '您的性别？', 'single', { choices: [{ code: '1', label: '男' }, { code: '2', label: '女' }] }),
    question('q2', '您最常使用哪些设施？', 'multi', { choices: ['健身路径', '篮球场', '羽毛球馆', '多功能运动场（含室内外）', '社区活动中心的乒乓球室', '其他'].map((label, i) => ({ code: String(i + 1), label })) }),
    question('q3', '您对设施的总体满意度？', 'likert', { min: 1, max: 5, minLabel: '非常不满意', maxLabel: '非常满意' }),
    question('q4', '您每次步行到设施需要多少分钟？', 'number', { condition: { questionId: 'q1', codes: ['2'] } }),
    question('q5', '您对设施还有哪些建议？', 'text'),
  ] };

test('the questionnaire appendix prints the introduction, every question, its options and its skip rule', () => {
  const lines = questionnaireAppendix(design);
  assert.equal(lines[0], '社区体育设施使用调查问卷');
  assert.deepEqual(lines.slice(1, 3), ['您好！本问卷用于了解社区体育设施的使用情况，约需 5 分钟。', '所有回答仅用于统计分析。']);
  assert.ok(lines.includes('1. 您的性别？（单选）'));
  assert.ok(lines.includes('○A. 男　○B. 女'), 'short options share a line');
  // Options are packed into lines that fit the page width; no option is split across two lines.
  const q2 = lines.slice(lines.indexOf('2. 您最常使用哪些设施？（多选）') + 1, lines.indexOf('3. 您对设施的总体满意度？（量表单题）（1 = 非常不满意，5 = 非常满意）'));
  assert.deepEqual(q2, ['□A. 健身路径　□B. 篮球场　□C. 羽毛球馆', '□D. 多功能运动场（含室内外）　□E. 社区活动中心的乒乓球室', '□F. 其他']);
  assert.ok(lines.includes('○1　○2　○3　○4　○5'));
  assert.ok(lines.includes('4. 您每次步行到设施需要多少分钟？（数值）（第 1 题选择“女”者回答）________'), 'the answer line stays with its question');
  assert.ok(lines.includes('5. 您对设施还有哪些建议？（开放题）__________________________'));
  // Thirty options keep distinct labels; a scale with an unusual range is described by its ends, never expanded.
  const thirty = questionnaireAppendix({ ...design, questions: [question('m', '多选', 'multi', { choices: Array.from({ length: 30 }, (_, i) => ({ code: String(i), label: `选项${i}` })) })] });
  const options = thirty.slice(thirty.indexOf('1. 多选（多选）') + 1), packed = options.join('　').split('　');
  assert.ok(packed.includes('□Z. 选项25') && packed.includes('□AA. 选项26') && packed.includes('□AD. 选项29'));
  assert.equal(packed.length, 30);
  assert.ok(options.every(line => [...line].reduce((w, c) => w + (c.codePointAt(0) >= 0x2000 ? 1 : 0.5), 0) <= 30), 'every option line fits the page');
  const wide = questionnaireAppendix({ ...design, questions: [question('w', '打分', 'likert', { min: 0, max: 1000000 })] });
  assert.ok(wide.includes('1. 打分（量表单题）在 0 到 1000000 之间作答：________'));
  const odd = questionnaireAppendix({ ...design, questions: [question('x', '月花费超过 $100 吗[[图:a]]？', 'text')] });
  assert.deepEqual(splitInlineMath(odd.join('\n')).filter(p => p.math), [], 'typed text never becomes a formula');
  assert.doesNotMatch(odd.join(''), /\[\[/);
});

test('the data appendix records every registered result with its source, sample, scope and quality control', () => {
  const result = (id, extra) => ({ id, title: `结果${id}`, sourceName: '社区问卷', sourceUrl: '', sourceHash: 'a'.repeat(64), resultHash: 'b'.repeat(64), classification: 'simulated', method: 'frequency',
    n: 400, total: 432, headers: ['类别', '频数'], rows: [['甲', 400]], metrics: [], warnings: ['原表 432 行，筛选后 432 行，共同应答范围 432 行，有效计算 400 行。', '缺失编码：99', '质控：自「原始问卷」剔除 32 行（作答过快、注意力题），剔除台账 SHA-256 0123456789abcdef…', '未加权、未插补。'], ...extra });
  const content = { ...createEditorContent(), version: 2, quality: { version: 1, results: [result('1'), result('2', { method: 'sampling-frame', n: 0, total: 0, warnings: [] })], findings: [] } };
  const lines = dataAppendix(content);
  assert.match(lines[0], /以下 2 项已登记的分析，按数据来源列出/);
  assert.equal(lines[1], '数据来源：社区问卷（模拟数据）');
  assert.equal(lines[2], '1. 结果1（频数分析）：有效样本 400（共 432）；原表 432 行，筛选后 432 行，共同应答范围 432 行，有效计算 400 行；缺失编码：99；质控：自「原始问卷」剔除 32 行（作答过快、注意力题），剔除台账 SHA-256 0123456789abcdef…。');
  assert.deepEqual(lines.slice(3, 5), ['抽样设计：', '2. 结果2（抽样设计）。'], 'a frame records no sample and closes the list');
  // One shared source is named once, in the opening sentence.
  const shared = dataAppendix({ ...content, quality: { ...content.quality, results: [result('1'), result('3', { method: 'numeric', warnings: [] })] } });
  assert.deepEqual(shared.slice(0, 3), ['本报告的统计结果来自以下 2 项已登记的分析，数据均来自社区问卷（模拟数据）：', lines[2], '2. 结果3（数值描述）：有效样本 400（共 432）。']);
  assert.deepEqual(dataAppendix(createEditorContent()), []);
});

test('the AI statement comes from the author\'s answers and names what the platform generated', () => {
  const content = { ...createEditorContent(), version: 2, report: [{ id: 's', title: '一、结果', body: '', source: '', blocks: [{ id: 'c', kind: 'chart', text: '', evidenceId: 'r', valueColumn: 1 }, { id: 'f', kind: 'formula', text: 'x', evidenceId: '', valueColumn: 1 }] }] };
  assert.deepEqual(aiAppendix({ used: false, tools: '', uses: [], sections: '', checking: '' }, content), [
    '本研究在选题、调查设计、数据处理、分析与报告撰写过程中未使用生成式人工智能工具。',
    '报告中的统计图 1 幅、公式 1 个及其读数段由研究平台根据登记的分析结果按固定规则生成，不涉及生成式人工智能。',
  ]);
  const used = aiAppendix({ used: true, tools: '某大模型 4.0', uses: ['文献检索与梳理', '文字润色与改写'], sections: '第一章、第四章', checking: '' }, content);
  assert.equal(used[0], '本研究在以下环节使用了生成式人工智能工具：某大模型 4.0。用途为文献检索与梳理、文字润色与改写，涉及第一章、第四章。');
  assert.equal(used[1], DEFAULT_AI_CHECKING);
  assert.throws(() => aiAppendix({ used: true, tools: '', uses: [], sections: '', checking: '' }, content), /请填写使用的工具与版本/);
  assert.equal(aiAppendix({ used: false, tools: '', uses: [], sections: '', checking: '' }, createEditorContent())[1], '报告中暂无由研究平台生成的统计图、表与公式。', 'a text-only report claims no generated exhibits');
});

test('appendix text lands in its blueprint appendix, after anything already written, within the body limit', () => {
  const content = parseEditorContent({ ...createEditorContent(), report: blueprintSections() });
  const written = writeAppendix(content, 'appendix.questionnaire', questionnaireAppendix(design));
  const section = written.content.report.find(s => s.id === written.sectionId);
  assert.equal(matchBlueprintNode(section.title).id, 'appendix.questionnaire');
  assert.ok(section.body.startsWith('社区体育设施使用调查问卷\n'));
  const again = writeAppendix(written.content, 'appendix.questionnaire', ['补充说明。']);
  assert.ok(again.content.report.find(s => s.id === written.sectionId).body.endsWith('\n补充说明。'), 'existing text is kept');
  assert.doesNotThrow(() => parseEditorContent(again.content));
  assert.throws(() => appendLines('甲'.repeat(EDITOR_LIMITS.body), ['乙'], '附录1 调查问卷'), /正文将超过/);
  assert.throws(() => writeAppendix(content, 'appendix.ai', []), /没有可写入的内容/);
});
