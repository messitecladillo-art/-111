import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brailleBars, lightBar, percent } from '../lib/agent/glyphs.ts';
import { illuminate, reportWritten, roomLight } from '../lib/agent/illumination.ts';
import { exhibitKey, traceExhibits } from '../lib/agent/provenance.ts';
import { COMMANDS, lookupTurn, matchCommands, mentionedRooms, route } from '../lib/agent/router.ts';
import { ROOMS, isRoomId } from '../lib/agent/rooms.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { exampleQuestionnaire } from '../lib/questionnaire.ts';

const empty = { design: null, dataset: null, report: null, resultPending: false };
const ctx = (view = empty, room = 'overview', traces = []) => ({ room, light: illuminate(view), traces });
const result = (id, extra = {}) => ({ id, title: `结果${id}`, sourceName: '社区问卷.csv', sourceUrl: '', sourceHash: '3fa1'.repeat(16), resultHash: 'b'.repeat(64), classification: 'user_provided',
  method: 'groups', n: 400, total: 432, headers: ['设施', '均值'], rows: [['健身路径', 2.97]], metrics: [], warnings: [], ...extra });
const frame = (id, planned) => result(id, { title: '居民抽样框', sourceName: '本研究抽样设计', method: 'sampling-frame', n: 0, total: 0, metrics: [{ label: '计划有效样本', value: planned }] });
/** The starting template with blocks in its first chapter and the results they rest on. */
function reportWith(blocks, results) {
  const content = createEditorContent();
  content.report = content.report.map((s, i) => i === 1 ? { ...s, blocks } : s);
  content.quality = { version: 1, results, findings: [] };
  return content;
}
const text = turn => [...turn.lines, ...(turn.cards ?? []).flatMap(c => c.lines ?? [])].map(line => line.map(s => s.text).join('')).join('\n');

test('bars and braille draw the score they are given, and only a perfect score is drawn solid', () => {
  assert.equal(lightBar(0), '····');
  assert.equal(lightBar(0.1), '░···');
  assert.equal(lightBar(0.5), '▓▓··');
  assert.equal(lightBar(0.9), '▓▓▓▒');
  assert.equal(lightBar(0.999), '▓▓▓▓');
  assert.equal(lightBar(1), '████');
  assert.equal(lightBar(Number.NaN), '····');
  assert.equal(brailleBars([1, 0]), '⡇');
  assert.equal(brailleBars([0, 1]), '⢸');
  assert.equal(brailleBars([1, 1, 0.5]), '⣿⡄', 'half height is the two lowest dots');
  assert.equal(brailleBars([]), '');
  assert.equal(percent(0.384), '38%');
});

test('an empty project is dark everywhere, and its blind spots follow the research path', () => {
  const light = illuminate(empty);
  assert.equal(light.overall, 0);
  assert.deepEqual(light.rooms.map(r => r.room), ['rules', 'design', 'sampling', 'analysis', 'editor']);
  assert.deepEqual(light.blind.map(c => c.id), ['rules.scope', 'design.questions', 'sampling.frame', 'analysis.data', 'analysis.results', 'analysis.findings', 'report.body']);
  assert.equal(light.blind.find(c => c.id === 'analysis.findings').go, 'editor', 'findings are confirmed in the report room');
  assert.equal(light.benchmark, null);
});

test('the rules room lights only when scope, sources and unknowns are settled', () => {
  const parsed = { match: 'exact', blocking: false, rules: 10, unknowns: 0, sources: 1, sourceRawSha256: 'a'.repeat(64) };
  assert.equal(roomLight(illuminate({ ...empty, rule: parsed }), 'rules').score, 1);
  const missing = illuminate(empty);
  assert.equal(roomLight(missing, 'rules').score, 0);
  assert.equal(missing.blind[0].id, 'rules.scope');
  const unknown = illuminate({ ...empty, rule: { ...parsed, unknowns: 2 } });
  assert.equal(roomLight(unknown, 'rules').checks.find(c => c.id === 'rules.unknowns').passed, false);
  const unsourced = illuminate({ ...empty, rule: { ...parsed, sources: 0, sourceRawSha256: '' } });
  assert.equal(roomLight(unsourced, 'rules').checks.find(c => c.id === 'rules.sources').passed, false);
  const none = illuminate({ ...empty, rule: { ...parsed, match: 'none', blocking: true, rules: 0, sources: 0, unknowns: 1 } });
  assert.equal(roomLight(none, 'rules').score, 0);
  assert.match(text(route('下一步做什么？', ctx({ ...empty, rule: parsed })).turn), /下一步：问卷还没有题目/, 'with rules lit, the next blind spot is the questionnaire');
});

test('the questionnaire lights its room by its own checks, never by question count alone', () => {
  const design = exampleQuestionnaire(), light = illuminate({ ...empty, design });
  const room = roomLight(light, 'design');
  assert.equal(room.checks.length, 4);
  assert.ok(room.checks[0].passed && room.score > 0 && room.score <= 1);
  assert.match(room.summary, new RegExp(`${design.questions.length} 道题`));
  const blank = { ...design, questions: design.questions.map(q => ({ ...q, text: '' })) };
  assert.equal(roomLight(illuminate({ ...empty, design: blank }), 'design').score, 0, 'blank stems are a form, not evidence');
  const unmapped = { ...design, questions: design.questions.map(q => ({ ...q, analysis: 'undecided' })) };
  assert.equal(roomLight(illuminate({ ...empty, design: unmapped }), 'design').checks.find(c => c.id === 'design.mapped').passed, false);
});

test('the report room is dark until the template is written over, then scored by the benchmark', () => {
  const template = createEditorContent();
  assert.equal(reportWritten(template), false);
  assert.equal(roomLight(illuminate({ ...empty, report: template }), 'editor').score, 0);
  const written = { ...template, report: template.report.map((s, i) => i === 1 ? { ...s, body: '本研究关注社区体育设施的使用与满意度，调查对象为甲区常住居民。' } : s) };
  assert.equal(reportWritten(written), true);
  const light = illuminate({ ...empty, report: written });
  assert.ok(light.benchmark);
  const report = roomLight(light, 'editor');
  assert.equal(report.score, light.benchmark.score / 100, 'the benchmark totals out of 100; light is a share');
  assert.ok(report.score > 0 && report.score < 1);
  const failed = new Set(light.benchmark.checks.filter(c => c.status === 'fail').map(c => `report.${c.id}`));
  assert.deepEqual(light.blind.filter(c => c.room === 'editor').map(c => c.id), [...failed], 'only outright failures are blind spots');
  // Data and registered results light the analysis room.
  const lit = roomLight(illuminate({ ...empty, dataset: { name: '社区问卷', rows: 430, simulated: true, hash: 'a'.repeat(64) }, resultPending: true }), 'analysis');
  assert.equal(lit.score, 2 / 3);
  assert.match(lit.checks[0].detail, /430 行 · 教学模拟数据/);
});

test('slash commands, rooms and everyday phrasings route to what they name', () => {
  assert.ok(route('/帮助', ctx()).turn.cards.length >= 2);
  assert.deepEqual(route('打开问卷室', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.deepEqual(route('我想设计问卷', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.deepEqual(route('/design', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.equal(route('/问卷', ctx(empty, 'design')).turn.act, undefined, 'the room you are in is not entered again');
  // With only the conversation showing, no module is open, the overview included.
  assert.deepEqual(route('/全景', ctx(empty, null)).turn.act, { type: 'open', room: 'overview' });
  assert.deepEqual(route('打开项目全景', ctx(empty, null)).turn.act, { type: 'open', room: 'overview' });
  assert.equal(route('/全景', ctx(empty, 'overview')).turn.act, undefined);
  assert.match(text(route('当前模块', ctx(empty, null)).turn), /右侧没有打开模块/);
  assert.match(text(route('当前模块', ctx(empty, 'analysis')).turn), /右侧打开的是数据分析/);
  assert.deepEqual(route('/经典', ctx(empty, null)).turn.chips[0].action, { type: 'href', href: '/workspace' });
  assert.deepEqual(route('切换到浅色模式', ctx()).turn.act, { type: 'theme', theme: 'light' });
  assert.deepEqual(route('/夜', ctx()).turn.act, { type: 'theme', theme: 'dark' });
  assert.match(text(route('下一步做什么？', ctx()).turn), /下一步：还没有解析适用规则/);
  assert.match(text(route('查一下进度', ctx()).turn), /整体照度 0%/);
  const scoped = route('问卷还缺什么', ctx()).turn;
  assert.match(text(scoped), /问卷设计里光到不了的角落有 1 处/);
  assert.doesNotMatch(text(scoped), /数据分析/);
  assert.equal(route('/清空', ctx()).turn.cards[0].kind, 'confirm', 'clearing asks first');
  assert.match(text(route('/xyz', ctx()).turn), /没有 \/xyz 这个命令/);
});

test('a sentence naming two rooms asks which first; questions about terms go to the knowledge base', () => {
  const both = route('把抽样方案写进报告', ctx()).turn;
  assert.equal(both.act, undefined);
  assert.deepEqual(both.chips.map(c => c.action.text), ['/抽样', '/报告']);
  assert.deepEqual(route('什么是设计效应', ctx()), { lookup: '设计效应', explicit: true });
  assert.deepEqual(route('设计效应', ctx()), { lookup: '设计效应', explicit: false });
  assert.deepEqual(route('/查 设计效应', ctx()), { lookup: '设计效应', explicit: true });
  assert.match(text(route('请帮我把第三章的结论改得更有说服力一些然后发给老师', ctx()).turn), /听不懂这句话，也不会去猜/);
  assert.deepEqual(mentionedRooms('去问卷室看看数据').map(r => r.id), ['design', 'analysis'], 'the longer name ranks first');
});

test('knowledge answers are quoted from reviewed entries, and loose matches are not passed off as answers', () => {
  const entry = { id: 'design-effect', name: '设计效应', englishName: 'design effect', definition: '实际设计下的方差与简单随机抽样方差之比。', formula: { tex: '\\mathrm{DEFF}=\\frac{a}{b}' }, sources: [{ title: '统计手册' }], review: { status: 'reviewed' } };
  const answer = lookupTurn('设计效应', [{ entry, match: 'name', ambiguous: false }], true);
  assert.deepEqual(answer.cards[0], { kind: 'entry', id: 'design-effect', name: '设计效应', english: 'design effect', definition: entry.definition, formula: entry.formula.tex, sources: ['统计手册'], reviewed: true });
  assert.match(text(lookupTurn('无此词', [], true)), /知识镜里没有「无此词」/);
  assert.match(text(lookupTurn('随便说说', [{ entry, match: 'fuzzy', ambiguous: false }], false)), /听不懂/);
  const ambiguous = lookupTurn('效应', [{ entry, match: 'fuzzy', ambiguous: false }, { entry: { ...entry, id: 'x', name: '效应量' }, match: 'fuzzy', ambiguous: false }], true);
  assert.deepEqual(ambiguous.chips.map(c => c.action.text), ['/查 设计效应', '/查 效应量']);
});

test('drafting a questionnaire asks for consent rather than calling; designing alone still opens the room', () => {
  assert.deepEqual(route('/生成 甲区居民体育设施满意度', ctx()), { generate: '甲区居民体育设施满意度' });
  assert.deepEqual(route('/生成', ctx()), { generate: '' });
  const sentence = '帮我出一份关于社区体育设施满意度的问卷';
  assert.deepEqual(route(sentence, ctx()), { generate: sentence });
  assert.deepEqual(route('问卷初稿', ctx()), { generate: '问卷初稿' });
  assert.deepEqual(route('我想设计问卷', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.deepEqual(matchCommands('生').map(c => c.name), ['生成']);
});

test('every room has a unique command and glyph, and the command list completes by prefix', () => {
  assert.equal(new Set(ROOMS.map(r => r.command)).size, ROOMS.length);
  assert.equal(new Set(ROOMS.map(r => r.glyph)).size, ROOMS.length);
  assert.equal(new Set(COMMANDS.map(c => c.name)).size, COMMANDS.length);
  assert.ok(isRoomId('editor') && !isRoomId('lifecycle'));
  assert.equal(matchCommands('').length, COMMANDS.length);
  assert.deepEqual(matchCommands('问').map(c => c.name), ['问卷']);
  assert.deepEqual(matchCommands('des').map(c => c.name), ['问卷']);
});

test('a sampling plan lights its room once the report carries it, judged on effective responses and its latest revision', () => {
  const table = id => ({ id: `t-${id}`, kind: 'table', text: '', evidenceId: id, valueColumn: 1 });
  // Frame IDs carry a digest of the group's stable ID, then of the plan: sampling-frame-<group>-<content>.
  const frameId = (group, content) => `sampling-frame-${group.repeat(8)}-${content.repeat(16)}`;
  const report = reportWith([table('f1')], [frame('f1', 400)]);
  assert.equal(roomLight(illuminate({ ...empty, report: reportWith([], [frame('f1', 400)]) }), 'sampling').score, 0, 'a frame the report no longer carries is not evidence');
  const without = illuminate({ ...empty, report });
  assert.deepEqual(roomLight(without, 'sampling').checks.map(c => [c.id, c.passed]), [['sampling.frame', true], ['sampling.size', true], ['sampling.reach', false]]);
  assert.equal(without.blind.find(c => c.id === 'sampling.reach').go, 'analysis', 'data is loaded and screened in the analysis room');
  assert.equal(roomLight(without, 'analysis').checks.find(c => c.id === 'analysis.results').passed, false, 'a frame is not an analysis');
  const loaded = { name: '回收', rows: 452, simulated: false, hash: '3fa1'.repeat(16) };
  const reach = (view, content = report) => roomLight(illuminate({ ...empty, report: content, ...view }), 'sampling').checks[2];
  // Raw rows are not responses: the check stays open until quality control has spoken.
  assert.match(reach({ dataset: loaded }).label, /回收 452 行，有效份数待质量控制/);
  assert.equal(reach({ dataset: loaded }).passed, false);
  assert.equal(reach({ dataset: { ...loaded, screened: true } }).passed, true);
  // A screening counts only for the data it screened, and never once that data is gone.
  const screened = reportWith([table('f1')], [frame('f1', 400), result('qc', { method: 'quality-control', n: 380, total: 452 })]);
  const short = reach({ dataset: loaded }, screened);
  assert.equal(short.passed, false);
  assert.match(short.label, /有效 380 份，未达计划的 400 份/);
  assert.match(reach({ dataset: { ...loaded, hash: 'c'.repeat(64) } }, screened).label, /有效份数待质量控制/, 'switching data leaves the old screening behind');
  assert.match(reach({}, screened).label, /还没有回收数据可对照计划/);
  // A group revised and inserted again replaces its old frame, renamed or not; two groups sharing a name both count.
  const revised = reportWith([table(frameId('a', '1')), table(frameId('a', '2')), table(frameId('b', '3'))],
    [{ ...frame(frameId('a', '1'), 400), title: '居民抽样框' }, { ...frame(frameId('a', '2'), 500), title: '社区居民抽样框' }, { ...frame(frameId('b', '3'), 200), title: '社区居民抽样框' }]);
  assert.match(roomLight(illuminate({ ...empty, report: revised }), 'sampling').summary, /^2 个抽样框 · 计划 700 份/);
  // Frames saved before IDs carried a group each count on their own; a namesake is shown as a clash, never merged.
  const legacy = content => `sampling-frame-${content.repeat(16)}`;
  const named = (id, planned, title) => ({ ...frame(id, planned), title });
  const distinct = roomLight(illuminate({ ...empty, report: reportWith([table(legacy('1')), table(legacy('2'))], [named(legacy('1'), 400, '居民抽样框'), named(legacy('2'), 200, '学生抽样框')]) }), 'sampling');
  assert.match(distinct.summary, /^2 个抽样框 · 计划 600 份/);
  assert.equal(distinct.checks.some(c => c.id === 'sampling.distinct'), false, 'old frames with their own names are not in doubt');
  for (const report of [
    reportWith([table(legacy('1')), table(legacy('2'))], [frame(legacy('1'), 400), frame(legacy('2'), 450)]),
    reportWith([table(legacy('1')), table(frameId('a', '2'))], [frame(legacy('1'), 400), frame(frameId('a', '2'), 500)]),
  ]) {
    const clash = roomLight(illuminate({ ...empty, report, dataset: { ...loaded, screened: true } }), 'sampling');
    assert.match(clash.summary, /^2 个抽样框/, 'nothing is merged by name');
    assert.equal(clash.checks.find(c => c.id === 'sampling.distinct').passed, false);
    assert.match(clash.checks.find(c => c.id === 'sampling.reach').label, /同名抽样框待厘清/, 'a total in doubt is not checked against what was collected');
  }
  assert.equal(roomLight(illuminate({ ...empty, report: reportWith([table('f3')], [frame('f3', 0)]) }), 'sampling').checks[1].passed, false);
});

test('an exhibit traces back through its result, scope, quality control and data file to the questions it asked', () => {
  const design = exampleQuestionnaire(), asked = design.questions[0];
  const r = result('r1', { variables: [asked.variable, '不存在的列'], warnings: ['原表 452 行，筛选后 432 行，共同应答范围 432 行，有效计算 400 行。', '缺失编码：99', '质控：自「原始问卷」剔除 20 行（作答过快），剔除台账 SHA-256 0123456789abcdef…', '未加权、未插补。'] });
  const content = reportWith([{ id: 'b1', kind: 'chart', text: '各设施满意度', evidenceId: 'r1', valueColumn: 1 }, { id: 'b2', kind: 'table', text: '', evidenceId: 'gone', valueColumn: 1 }], [r]);
  const [trace, ...rest] = traceExhibits(content, design);
  assert.equal(rest.length, 0, 'a block whose result is gone has no path to show');
  assert.equal(trace.reference, '图 1-1');
  assert.equal(trace.title, '各设施满意度');
  assert.deepEqual(trace.steps.map(s => s.kind), ['result', 'scope', 'quality', 'source', 'question', 'question']);
  assert.equal(trace.steps[0].detail, '分组均值比较 · 有效样本 400（共 432）');
  assert.equal(trace.steps[2].detail, '自「原始问卷」剔除 20 行（作答过快），剔除台账 SHA-256 0123456789abcdef…');
  assert.match(trace.steps[3].detail, /^用户提供数据 · 指纹 SHA-256 3fa13fa13fa1…$/);
  assert.equal(trace.steps[4].text, `第 1 题「${asked.text.trim()}」`);
  assert.deepEqual([trace.steps[5].text, trace.steps[5].detail], ['变量「不存在的列」', '没有对应到问卷设计里的题目']);
  assert.equal(traceExhibits(content, null)[0].steps[4].detail, '问卷设计里还没有问卷，无法对应到题目');
  assert.equal(exhibitKey('图 1－1'), exhibitKey('图1.1'));
  // A sampling frame traces to the plan, keeping its recorded caveat.
  const caveat = '城区居民含拦截、配额或方便抽样阶段，不是概率样本，不报告严格的抽样误差';
  const planned = traceExhibits(reportWith([{ id: 'f', kind: 'table', text: '抽样框', evidenceId: 'f1', valueColumn: 1 }], [{ ...frame('f1', 300), warnings: [caveat] }]), design)[0];
  assert.deepEqual(planned.steps.map(s => [s.kind, s.text]), [['result', '结果「居民抽样框」'], ['scope', '抽样说明'], ['source', '抽样设计']]);
  assert.equal(planned.steps[0].detail, '抽样设计 · 计划有效样本 300');
  assert.equal(planned.steps[1].detail, caveat);
});

test('/来处 answers with the path of one exhibit, offers a choice among several, and says when there is none', () => {
  const design = exampleQuestionnaire();
  const chart = { id: 'b1', kind: 'chart', text: '各设施满意度', evidenceId: 'r1', valueColumn: 1 };
  const one = traceExhibits(reportWith([chart], [result('r1')]), design);
  assert.match(text(route('/来处', ctx()).turn), /报告里还没有来自登记结果的图表/);
  const card = route('/来处', ctx(empty, 'overview', one)).turn.cards[0];
  assert.equal(card.kind, 'trace');
  assert.equal(card.reference, '图 1-1');
  assert.equal(route('图 1－1 的数字从哪来？', ctx(empty, 'overview', one)).turn.cards[0].kind, 'trace');
  const two = traceExhibits(reportWith([chart, { id: 'b2', kind: 'table', text: '使用频次', evidenceId: 'r2', valueColumn: 1 }], [result('r1'), result('r2')]), design);
  assert.deepEqual(route('/来处', ctx(empty, 'overview', two)).turn.chips.map(c => c.action.text), ['/来处 图 1-1', '/来处 表 1-1']);
  assert.equal(route('/来处 使用频次', ctx(empty, 'overview', two)).turn.cards[0].reference, '表 1-1');
  assert.match(text(route('/来处 图 9-9', ctx(empty, 'overview', two)).turn), /报告里没有「图 9-9」/);
});
