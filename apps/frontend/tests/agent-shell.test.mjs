import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brailleBars, lightBar, percent } from '../lib/agent/glyphs.ts';
import { illuminate, reportWritten } from '../lib/agent/illumination.ts';
import { COMMANDS, lookupTurn, matchCommands, mentionedRooms, route } from '../lib/agent/router.ts';
import { ROOMS, isRoomId } from '../lib/agent/rooms.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { exampleQuestionnaire } from '../lib/questionnaire.ts';

const empty = { design: null, dataset: null, report: null, resultPending: false };
const ctx = (view = empty, room = 'overview') => ({ room, light: illuminate(view) });
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
  assert.deepEqual(light.rooms.map(r => r.room), ['design', 'analysis', 'editor']);
  assert.deepEqual(light.blind.map(c => c.id), ['design.questions', 'analysis.data', 'analysis.results', 'analysis.findings', 'report.body']);
  assert.equal(light.blind.find(c => c.id === 'analysis.findings').go, 'editor', 'findings are confirmed in the report room');
  assert.equal(light.benchmark, null);
});

test('the questionnaire lights its room by its own checks, never by question count alone', () => {
  const design = exampleQuestionnaire(), light = illuminate({ ...empty, design });
  const room = light.rooms[0];
  assert.equal(room.checks.length, 4);
  assert.ok(room.checks[0].passed && room.score > 0 && room.score <= 1);
  assert.match(room.summary, new RegExp(`${design.questions.length} 道题`));
  const blank = { ...design, questions: design.questions.map(q => ({ ...q, text: '' })) };
  assert.equal(illuminate({ ...empty, design: blank }).rooms[0].score, 0, 'blank stems are a form, not evidence');
  const unmapped = { ...design, questions: design.questions.map(q => ({ ...q, analysis: 'undecided' })) };
  assert.equal(illuminate({ ...empty, design: unmapped }).rooms[0].checks.find(c => c.id === 'design.mapped').passed, false);
});

test('the report room is dark until the template is written over, then scored by the benchmark', () => {
  const template = createEditorContent();
  assert.equal(reportWritten(template), false);
  assert.equal(illuminate({ ...empty, report: template }).rooms[2].score, 0);
  const written = { ...template, report: template.report.map((s, i) => i === 1 ? { ...s, body: '本研究关注社区体育设施的使用与满意度，调查对象为甲区常住居民。' } : s) };
  assert.equal(reportWritten(written), true);
  const light = illuminate({ ...empty, report: written });
  assert.ok(light.benchmark);
  assert.equal(light.rooms[2].score, light.benchmark.score / 100, 'the benchmark totals out of 100; light is a share');
  assert.ok(light.rooms[2].score > 0 && light.rooms[2].score < 1);
  const failed = new Set(light.benchmark.checks.filter(c => c.status === 'fail').map(c => `report.${c.id}`));
  assert.deepEqual(light.blind.filter(c => c.room === 'editor').map(c => c.id), [...failed], 'only outright failures are blind spots');
  // Data and registered results light the analysis room.
  const lit = illuminate({ ...empty, dataset: { name: '社区问卷', rows: 430, simulated: true }, resultPending: true }).rooms[1];
  assert.equal(lit.score, 2 / 3);
  assert.match(lit.checks[0].detail, /430 行 · 教学模拟数据/);
});

test('slash commands, rooms and everyday phrasings route to what they name', () => {
  assert.ok(route('/帮助', ctx()).turn.cards.length >= 2);
  assert.deepEqual(route('打开问卷室', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.deepEqual(route('我想设计问卷', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.deepEqual(route('/design', ctx()).turn.act, { type: 'open', room: 'design' });
  assert.equal(route('/问卷', ctx(empty, 'design')).turn.act, undefined, 'the room you are in is not entered again');
  assert.deepEqual(route('切换到浅色模式', ctx()).turn.act, { type: 'theme', theme: 'light' });
  assert.deepEqual(route('/夜', ctx()).turn.act, { type: 'theme', theme: 'dark' });
  assert.match(text(route('下一步做什么？', ctx()).turn), /下一步：问卷还没有题目/);
  assert.match(text(route('查一下进度', ctx()).turn), /整体照度 0%/);
  const scoped = route('问卷还缺什么', ctx()).turn;
  assert.match(text(scoped), /问卷室里光到不了的角落有 1 处/);
  assert.doesNotMatch(text(scoped), /分析室/);
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

test('every room has a unique command and glyph, and the command list completes by prefix', () => {
  assert.equal(new Set(ROOMS.map(r => r.command)).size, ROOMS.length);
  assert.equal(new Set(ROOMS.map(r => r.glyph)).size, ROOMS.length);
  assert.equal(new Set(COMMANDS.map(c => c.name)).size, COMMANDS.length);
  assert.ok(isRoomId('editor') && !isRoomId('lifecycle'));
  assert.equal(matchCommands('').length, COMMANDS.length);
  assert.deepEqual(matchCommands('问').map(c => c.name), ['问卷']);
  assert.deepEqual(matchCommands('des').map(c => c.name), ['问卷']);
});
