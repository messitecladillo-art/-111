import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorContent } from '../lib/editor-model.ts';
import { blueprintSections } from '../lib/report-blueprint.ts';
import { draftableNode, draftFacts, draftLine, draftRequest, draftSection, draftText, parseDraftReceipt, sectionText } from '../lib/agent/draft.ts';
import { reportPlan, sectionState } from '../lib/agent/report-plan.ts';
import { illuminate } from '../lib/agent/illumination.ts';
import { route } from '../lib/agent/router.ts';

// Placeholder results in the shape the analysis module registers; teaching-simulation numbers, no respondents.
const result = (id, method, more = {}) => ({ id, title: id, sourceName: 's.csv', sourceUrl: '', sourceHash: 'h', resultHash: `r-${id}`, classification: 'simulated', method, n: 212, total: 240,
  headers: ['类别', '频数', '有效样本占比 (%)'], rows: [['女', 115, 54.245], ['男', 97, 45.755]], metrics: [{ label: '有效类别数', value: 2 }, { label: '缺失', value: null }], warnings: [], ...more });
const frame = { ...result('城区居民抽样框', 'sampling-frame', { n: 0, total: 0, rows: [['街道', '所有街道']], metrics: [{ label: '计划有效样本', value: 300 }] }) };
const held = { results: [result('受访者构成', 'frequency', { variables: ['性别'] }), result('年级差异', 'crosstab', { headers: ['行类别', '列类别', '频数', '行内占比 (%)'], rows: [['大一', '满意', 20, 40]] }), frame],
  findings: [{ id: 'f', title: '高年级满意度更低', status: 'confirmed', interpretation: '差异来自开放时间。', scope: '本校。', action: '延长开放。', evidenceIds: ['年级差异'], confirmedHashes: { 年级差异: 'r-年级差异' } }],
  pending: false, placed: [] };

test('facts carry the numbers of registered results, the section’s own first, each with the value its placeholder takes', () => {
  const facts = draftFacts(held, 'sample.profile');
  assert.deepEqual(facts[0], { id: 'F1', text: '「受访者构成」：频数分析，有效样本 212（共 240），教学模拟数据', value: '212' }, 'a result of this section comes first');
  assert.ok(facts.some(f => f.text === '「受访者构成」的有效类别数为 2' && f.value === '2'));
  assert.ok(facts.some(f => f.text === '「受访者构成」中「女」的有效样本占比为 54.24%' && f.value === '54.24%'), 'a share keeps its percent sign');
  assert.ok(facts.some(f => f.text === '「年级差异」中「大一·满意」的频数为 20'));
  assert.ok(facts.some(f => f.text === '「城区居民抽样框」的计划有效样本为 300'), 'a frame gives its planned sample');
  assert.ok(!facts.some(f => /缺失/.test(f.text)), 'a statistic without a value is not a fact');
  assert.ok(facts.every((f, i) => f.id === `F${i + 1}` && f.text.length <= 160));
  const many = { ...held, results: Array.from({ length: 30 }, (_, i) => result(`结果${i}`, 'frequency')) };
  assert.equal(draftFacts(many, 'sample.profile').length, 80, 'at most eighty');
});

test('the request names the section, the project, the facts and the findings, and never the data', () => {
  const content = { ...createEditorContent(), title: '社区体育设施满意度调查', report: blueprintSections(), quality: { version: 1, results: held.results, findings: held.findings } };
  const { request, facts } = draftRequest({ nodeId: 'intro.background', held, content, design: { objective: '找出改进的优先次序', population: '本市居民', title: '' }, service: { id: 's', revision: 2 } });
  assert.equal(request.section.node, 'intro.background');
  assert.equal(request.section.title, '研究背景');
  assert.ok(request.section.moves.length > 0 && request.section.purpose);
  assert.deepEqual(request.project, { title: '社区体育设施满意度调查', objective: '找出改进的优先次序', population: '本市居民' });
  assert.deepEqual(request.facts, facts.map(({ id, text }) => ({ id, text })), 'the model sees statements, not the values that replace placeholders');
  assert.deepEqual(request.findings.map(f => f.title), ['高年级满意度更低']);
  assert.ok(!JSON.stringify(request).includes('"rows"'));
  assert.equal(request.consent, true);
  assert.deepEqual([request.serviceId, request.serviceRevision], ['s', 2]);
});

test('a draft fills each placeholder with its fact’s value, keeps the model’s words literal, and drops paragraphs with numbers of their own', () => {
  const facts = [{ id: 'F1', text: '…', value: '212' }, { id: 'F2', text: '…', value: '54.25%' }];
  const receipt = parseDraftReceipt({ id: 'd', status: 'ready', node: 'sample.profile', droppedParagraphs: 1, errorCode: null, paragraphs: [
    { text: '有效样本为{F1}，女性占{F2}。' }, { text: '调查覆盖了 5 个街道。' }, { text: '引用{F9}。' }, { text: '公式 $x$ 与引用 [[图:abc]] 不应生效。' }] }, new Set(['F1', 'F2']));
  assert.equal(receipt.paragraphs.length, 2);
  assert.equal(receipt.droppedParagraphs, 3);
  assert.equal(draftText(receipt.paragraphs[0], facts), '有效样本为212，女性占54.25%。');
  assert.equal(draftText(receipt.paragraphs[1], facts), String.raw`公式 \$x\$ 与引用 ［［图:abc］］ 不应生效。`);
  assert.deepEqual(draftLine(receipt.paragraphs[0], facts), [{ text: '有效样本为', mark: 'cyan' }, { text: '212', mark: 'gold' }, { text: '，女性占', mark: 'cyan' }, { text: '54.25%', mark: 'gold' }, { text: '。', mark: 'cyan' }]);
  assert.throws(() => parseDraftReceipt({ id: 'd', status: 'done' }));
});

test('a section is named by its title or the words that recognise it; references and appendices are not drafted', () => {
  assert.equal(draftableNode('研究背景')?.id, 'intro.background');
  assert.equal(draftableNode('样本特征分析')?.id, 'sample.profile');
  assert.equal(draftableNode('研究项目简介'), null, 'a chapter heading is not drafted; its sections are');
  assert.equal(draftableNode('参考文献'), null);
  assert.equal(draftableNode('随便什么'), null);
  const section = draftSection('intro.background');
  assert.ok(section.length === null || (section.length.length === 2 && section.length[0] <= section.length[1]));
  assert.ok(section.moves.length <= 8 && section.needs.every(n => n.length <= 40));
});

test('the plan lays out the blueprint the project calls for, with what each section has and lacks', () => {
  const base = { ...createEditorContent(), report: blueprintSections({ nodes: [] }), quality: { version: 1, results: held.results, findings: [] } };
  const bodyOf = (content, nodeId, text) => ({ ...content, report: content.report.map(s => s.id === `bp-${nodeId}` ? { ...s, body: text } : s) });
  const written = bodyOf(base, 'intro.background', '研究背景写了一些。'.repeat(10));
  const plan = reportPlan(written, null, ['compare.tests']);
  const of = id => plan.sections.find(s => s.node === id);
  assert.equal(of('intro.background').present, true);
  assert.equal(sectionState(of('intro.background')), 'partial', 'started but short of its length');
  assert.ok(of('compare.tests') && !of('compare.tests').present && sectionState(of('compare.tests')) === 'missing', 'a registered result makes room for its section');
  assert.equal(of('compare.tests').draftable, false, 'analysis sections get their numbers by placing results');
  assert.equal(of('intro.background').draftable, true);
  assert.ok(!plan.sections.some(s => s.node === 'references'), 'back matter is not planned here');
  assert.equal(sectionText(written, 'intro.background'), '研究背景写了一些。'.repeat(10));
});

test('/写报告 shows the plan and the next step; /起草 and everyday phrasings name a section to draft', () => {
  const content = { ...createEditorContent(), report: blueprintSections({ nodes: [] }), quality: { version: 1, results: held.results, findings: [] } };
  const plan = reportPlan(content, null, held.results.map(() => 'sample.profile'));
  const ctx = { room: null, light: illuminate({ design: null, dataset: null, report: null, resultPending: false }), traces: [], results: held, plan };
  const turn = route('/写报告', ctx).turn, rows = turn.cards[0].lines.map(line => line.map(s => s.text).join(''));
  assert.ok(rows.includes('研究项目简介'), 'chapters are headings');
  assert.ok(rows.some(r => /^　○ 研究背景　已写 0 字/.test(r)));
  assert.equal(turn.chips[0].action.text, '/写入', 'registered results go in first');
  assert.deepEqual(route('写报告', ctx), route('/写报告', ctx));
  assert.deepEqual(route('/起草 研究背景', ctx), { draft: 'intro.background' });
  assert.deepEqual(route('帮我写研究背景', ctx), { draft: 'intro.background' });
  assert.deepEqual(route('起草「研究意义」', ctx), { draft: 'intro.significance' });
  assert.ok('generate' in route('帮我出一份社区体育设施满意度的问卷', ctx), 'a questionnaire is still drafted as one');
  assert.match(route('/起草 不存在的章节', ctx).turn.lines.flat().map(s => s.text).join(''), /报告蓝图里没有「不存在的章节」/);
  assert.ok(route('/起草', ctx).turn.chips.length > 0, 'without a section, the sections to choose from');
  assert.match(route('/写报告', { ...ctx, plan: null }).turn.lines.flat().map(s => s.text).join(''), /还没有打开报告与 PPT/);
});
