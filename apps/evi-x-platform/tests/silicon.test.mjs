import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleQuestionnaire, newQuestion } from '../lib/questionnaire.ts';
import { attributeIssues, fidelityRisk, generatePanel, panelMarginals, PANEL_TEMPLATES, quotaCounts, SILICON_LIMITS } from '../lib/silicon/persona.ts';
import { demoRun, estimateCalls, isShown, NO_SCENARIO, normalizeModelAnswer, placeholderIssues, renderQuestionText } from '../lib/silicon/run.ts';
import { cramersV, distribution, estimateMinutes, fidelityReport, pretestFindings, spearman } from '../lib/silicon/assess.ts';
import { disclosureText, isSiliconTable, SILICON_ORIGIN_COLUMN, SILICON_ORIGIN_VALUE, siliconCsv } from '../lib/silicon/export.ts';
import { clusterRadius, stageLayout } from '../lib/silicon/stage-layout.ts';
import { EXAMPLE_EXPECTATIONS, EXAMPLE_SCENARIOS, siliconExampleQuestionnaire } from '../lib/silicon/example.ts';
import { defaultConfig, parseConfig } from '../lib/silicon/config.ts';
import { questionnaireIssues } from '../lib/questionnaire.ts';
import { ordinalIndex, stageCategoryColor, CATEGORICAL_DARK, NEUTRAL_HALO, ORDINAL_DARK } from '../lib/silicon/palette.ts';

const clone = value => structuredClone(value);
const spec = (size = 24, allocation = 'quota') => ({ attributes: clone(PANEL_TEMPLATES.students.attributes), size, allocation, seed: 7, background: '' });
const settings = (over = {}) => ({ engine: 'demo', memory: 'carry', shuffleOptions: false, scenarios: [], models: [], ...over });

function design() {
  const d = exampleQuestionnaire();
  const s = newQuestion('q-scene', 'SCENE'); s.text = '如果在{情境}办理，上次你选择了{USED}，你会推荐吗？'; s.type = 'likert'; s.construct = '推荐'; s.minLabel = '不会'; s.maxLabel = '一定会';
  const r = newQuestion('q-rev', 'REV'); r.text = '我不会向朋友推荐这项服务。'; r.type = 'likert'; r.construct = '推荐'; r.reverse = true; r.minLabel = '不同意'; r.maxLabel = '同意';
  const t = newQuestion('q-third', 'MORE'); t.text = '这项服务值得推荐。'; t.type = 'likert'; t.construct = '推荐'; t.minLabel = '不同意'; t.maxLabel = '同意';
  d.questions.push(s, r, t);
  return d;
}

test('quota allocation sums exactly and follows weights by largest remainder', () => {
  assert.deepEqual(quotaCounts([1, 1, 1], 10), [4, 3, 3]);
  assert.deepEqual(quotaCounts([2, 1, 0], 9), [6, 3, 0]);
  assert.deepEqual(quotaCounts([0, 0], 5), [0, 0]);
  for (const size of [1, 7, 24, 120]) assert.equal(quotaCounts([3, 2, 5, 1], size).reduce((a, b) => a + b, 0), size);
});

test('quota panels match marginals exactly, are deterministic and bounded', () => {
  const panel = generatePanel(spec(24));
  assert.equal(panel.length, 24);
  assert.deepEqual(panel, generatePanel(spec(24)));
  for (const m of panelMarginals(panel, spec().attributes)) {
    const expected = quotaCounts(spec().attributes.find(a => a.key === m.key).levels.map(l => l.weight), 24);
    assert.deepEqual(m.levels.map(l => l.count), expected);
  }
  assert.equal(new Set(panel.map(p => p.code)).size, 24);
  assert.equal(generatePanel({ ...spec(), size: 10_000 }).length, SILICON_LIMITS.personas);
  assert.equal(generatePanel({ ...spec(), size: NaN }).length, 12);
  for (const p of panel) { assert.ok(p.appearance.hue >= 0 && p.appearance.hue < 8); assert.ok(p.appearance.height > 0.9 && p.appearance.height < 1.1); }
});

test('attribute validation catches blanks, duplicates and zero weights', () => {
  assert.deepEqual(attributeIssues(PANEL_TEMPLATES.residents.attributes), []);
  const bad = [{ key: 'a', label: '', levels: [{ value: 'x', label: 'x', weight: 0 }, { value: 'x', label: 'x', weight: 0 }] }, { key: 'a', label: '重复', levels: [{ value: 'y', label: 'y', weight: 1 }] }];
  const issues = attributeIssues(bad).join('\n');
  for (const word of ['缺少名称', '重复', '至少需要两个取值', '不能全为 0']) assert.match(issues, new RegExp(word));
});

test('fidelity risk flags lower-education, rural and minority-language personas', () => {
  const base = { id: 'x', code: 'S-001', background: '', appearance: { hue: 0, hat: 'none', accessory: 'none', hair: 0, height: 1 } };
  assert.equal(fidelityRisk({ ...base, traits: { e: '本科', a: '城市' } }).level, 'baseline');
  const risk = fidelityRisk({ ...base, traits: { e: '初中及以下', a: '农村' }, background: '日常使用方言' });
  assert.equal(risk.level, 'elevated');
  assert.deepEqual(risk.reasons, ['较低学历', '农村地区', '少数民族语言或方言']);
});

test('scenario substitution and piping render per persona; bad references are reported', () => {
  const d = design();
  const answers = new Map([['demo-screen', { questionId: 'demo-screen', value: '1', shown: true, refused: false, unclear: '' }]]);
  const text = renderQuestionText(d, d.questions[3], { id: 's1', label: '线上', text: '线上平台' }, answers);
  assert.equal(text, '如果在线上平台办理，上次你选择了使用过，你会推荐吗？');
  assert.match(renderQuestionText(d, d.questions[3], NO_SCENARIO, new Map()), /选择了（未作答）/);
  assert.deepEqual(placeholderIssues(d, [{ id: 's1', label: '线上', text: '线上平台' }]), []);
  const broken = clone(d); broken.questions[0].text = '回答 {MORE} 和 {NOPE}';
  const issues = placeholderIssues(broken, []).join('\n');
  assert.match(issues, /不在它之前/); assert.match(issues, /不存在的变量/); assert.match(issues, /尚未设置情境/);
});

test('routing hides conditional questions unless the visible parent chose a listed code', () => {
  const d = exampleQuestionnaire();
  const yes = new Map([['demo-screen', { questionId: 'demo-screen', value: '1', shown: true, refused: false, unclear: '' }]]);
  const no = new Map([['demo-screen', { questionId: 'demo-screen', value: '0', shown: true, refused: false, unclear: '' }]]);
  assert.equal(isShown(d.questions[1], yes), true);
  assert.equal(isShown(d.questions[1], no), false);
  assert.equal(isShown(d.questions[1], new Map()), false);
});

test('demo runs are deterministic, respect routing and cover every persona × scenario', () => {
  const d = design(), panel = generatePanel(spec(30));
  const scenarios = [{ id: 's1', label: '线上', text: '线上平台' }, { id: 's2', label: '窗口', text: '线下窗口' }];
  const at = new Date('2026-10-10T00:00:00Z');
  const run = demoRun(d, spec().attributes, panel, settings({ scenarios }), at);
  assert.deepEqual(run, demoRun(d, spec().attributes, panel, settings({ scenarios }), at));
  assert.equal(run.classification, 'simulated');
  assert.equal(run.responses.length, 60);
  for (const r of run.responses) {
    const screen = r.answers[0];
    for (const conditional of r.answers.slice(1, 3)) assert.equal(conditional.shown, screen.shown && screen.value === '1');
    for (const a of r.answers) if (!a.shown) assert.equal(a.value, null);
    const likert = r.answers[3];
    if (likert.value !== null) assert.ok(Number.isInteger(likert.value) && likert.value >= 1 && likert.value <= 5);
  }
});

test('model answers are normalized against each item; out-of-range values are rejected', () => {
  const d = design();
  assert.deepEqual(normalizeModelAnswer(d.questions[0], '1'), { value: '1', valid: true });
  assert.deepEqual(normalizeModelAnswer(d.questions[0], '9'), { value: null, valid: false });
  assert.deepEqual(normalizeModelAnswer(d.questions[1], 6), { value: null, valid: false });
  assert.deepEqual(normalizeModelAnswer(d.questions[1], '4'), { value: 4, valid: true });
  assert.deepEqual(normalizeModelAnswer(d.questions[1], 3.5), { value: null, valid: false });
  const multi = newQuestion('m', 'M'); multi.type = 'multi'; multi.choices = [{ code: '1', label: 'a' }, { code: '2', label: 'b' }];
  assert.deepEqual(normalizeModelAnswer(multi, ['2', '1', '7']), { value: ['1', '2'], valid: false });
  assert.deepEqual(normalizeModelAnswer(d.questions[2], null), { value: null, valid: true });
});

test('call estimates scale with personas, scenarios, models and memory mode', () => {
  const d = design();
  assert.equal(estimateCalls(d, 12, settings({ engine: 'model', models: ['a', 'b'] })), 24);
  assert.equal(estimateCalls(d, 12, settings({ engine: 'model', models: ['a'], memory: 'independent', scenarios: [{ id: 's', label: 's', text: 's' }] })), 12 * d.questions.length);
});

test('statistics: Cramér V and Spearman behave at the edges', () => {
  assert.equal(cramersV([['a', 'x'], ['a', 'x'], ['b', 'y'], ['b', 'y']]), 1);
  assert.equal(cramersV([['a', 'x'], ['a', 'x']]), 0);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9);
  assert.ok(Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-9);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), 0);
});

test('pretest findings surface unreachable items, concentration and static issues', () => {
  const d = design(), panel = generatePanel(spec(24));
  const run = demoRun(d, spec().attributes, panel, settings(), new Date('2026-10-10T00:00:00Z'));
  // Force everyone past the screen with code 0 so the conditional items are never shown.
  for (const r of run.responses) { r.answers[0].value = '0'; r.answers[1] = { ...r.answers[1], shown: false, value: null }; r.answers[2] = { ...r.answers[2], shown: false, value: null }; }
  const findings = pretestFindings(d, run);
  assert.ok(findings.some(f => f.kind === 'unreachable' && f.questionId === 'demo-experience'));
  assert.ok(findings.some(f => f.kind === 'concentrated' && f.questionId === 'demo-screen'));
  assert.ok(findings.some(f => f.kind === 'unused_choice' && f.questionId === 'demo-screen'));
  const levels = findings.map(f => ({ blocker: 0, warning: 1, info: 2 })[f.level]);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  const t = estimateMinutes(d); assert.ok(t.low >= 1 && t.high >= t.low);
});

test('fidelity report: forward continuity, expectations, diversity and agreement', () => {
  const d = design(), panel = generatePanel(spec(40));
  const run = demoRun(d, spec().attributes, panel, settings({ models: ['a'] }), new Date('2026-10-10T00:00:00Z'));
  const report = fidelityReport(d, run, [{ id: 'e1', a: { kind: 'question', id: 'q-scene' }, b: { kind: 'question', id: 'q-third' }, direction: 'positive', note: '' }]);
  assert.equal(report.turing.verdict, 'manual');
  assert.equal(report.backward.attributes.length, spec().attributes.length);
  assert.ok(report.forward.reversePairs === null || (report.forward.reversePairs >= 0 && report.forward.reversePairs <= 1));
  assert.equal(report.forward.routingViolations, 0);
  assert.equal(report.pattern.checks.length, 1);
  assert.ok(['match', 'mismatch', 'inconclusive'].includes(report.pattern.checks[0].result));
  assert.equal(report.agreement.rate, null);
  assert.ok(report.diversity.duplicateRate >= 0 && report.diversity.duplicateRate <= 1);
  // Two identical "models" agree perfectly.
  const twin = { ...run, responses: [...run.responses, ...run.responses.map(r => ({ ...r, model: '模型乙' }))] };
  assert.equal(fidelityReport(d, twin, []).agreement.rate, 1);
  // A hidden question with an answer is a routing violation.
  const broken = clone(run); broken.responses[0].answers[1] = { ...broken.responses[0].answers[1], shown: false, value: 3 };
  assert.equal(fidelityReport(d, broken, []).forward.routingViolations, 1);
});

test('distributions group by attribute in level order and by scenario', () => {
  const d = design(), panel = generatePanel(spec(24));
  const scenarios = [{ id: 's1', label: '线上', text: '线上' }, { id: 's2', label: '窗口', text: '窗口' }];
  const run = demoRun(d, spec().attributes, panel, settings({ scenarios }), new Date('2026-10-10T00:00:00Z'));
  const byGrade = distribution(d, run, 'demo-screen', 'attr:grade');
  assert.deepEqual(byGrade.groups.map(g => g.label), spec().attributes.find(a => a.key === 'grade').levels.map(l => l.label));
  const answered = run.responses.filter(r => r.answers.some(a => a.questionId === 'demo-screen' && a.shown && !a.refused && a.value !== null)).length;
  assert.equal(byGrade.groups.reduce((s, g) => s + g.n, 0), answered);
  assert.ok(answered > 40 && answered <= 48);
  assert.deepEqual(distribution(d, run, 'q-scene', 'scenario').groups.map(g => g.label), ['线上', '窗口']);
  assert.equal(distribution(d, run, 'demo-open', 'all'), null);
});

test('exports always carry the simulated origin and disclosure stays honest', () => {
  const d = design(), panel = generatePanel(spec(6));
  const run = demoRun(d, spec().attributes, panel, settings(), new Date('2026-10-10T00:00:00Z'));
  const csv = siliconCsv(d, run).replace(/^﻿/, '');
  const [header, ...rows] = csv.trim().split('\r\n').map(line => line.split(','));
  assert.equal(header[0], SILICON_ORIGIN_COLUMN);
  assert.ok(rows.every(r => r[0] === SILICON_ORIGIN_VALUE));
  assert.equal(rows.length, 6);
  assert.equal(isSiliconTable(header), true);
  assert.equal(isSiliconTable(['id', 'Q1']), false);
  const text = disclosureText(d, run);
  assert.match(text, /未进入正式样本/);
  assert.match(text, /请据实填写/);
  assert.doesNotMatch(text, /均经真实预调查复核/);
});

test('stage layout keeps clusters apart and places every figure', () => {
  for (const sizes of [[24], [10, 14], [5, 5, 5, 5, 4], [40, 1, 30, 2, 20, 3, 10, 9]]) {
    const keys = sizes.flatMap((n, g) => Array.from({ length: n }, () => `g${g}`));
    const order = sizes.map((_, g) => ({ key: `g${g}`, label: `组${g}` }));
    const layout = stageLayout(keys, order);
    assert.equal(layout.slots.length, keys.length);
    assert.equal(layout.groups.length, sizes.length);
    for (let i = 0; i < layout.groups.length; i++) for (let j = i + 1; j < layout.groups.length; j++) {
      const a = layout.groups[i], b = layout.groups[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= (a.radius + b.radius) * 0.98, `groups ${i} and ${j} overlap for ${sizes}`);
    }
    for (const s of layout.slots) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
  }
  for (const sizes of [[5, 5, 5, 5, 4], [40, 1, 30, 2, 20], [12, 12, 3]]) {
    const keys = sizes.flatMap((n, g) => Array.from({ length: n }, () => `g${g}`));
    const layout = stageLayout(keys, sizes.map((_, g) => ({ key: `g${g}`, label: `组${g}` })), { columns: 2 });
    for (let i = 0; i < layout.groups.length; i++) for (let j = i + 1; j < layout.groups.length; j++) {
      const a = layout.groups[i], b = layout.groups[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius, `grid groups ${i} and ${j} overlap for ${sizes}`);
    }
    assert.ok(Math.max(...layout.groups.map(g => Math.abs(g.x))) < Math.max(...layout.groups.map(g => Math.abs(g.z))) + 6);
  }
  assert.equal(clusterRadius(0), 0);
});

test('the teaching example exercises scenarios, piping and routing without structural blockers', () => {
  const d = siliconExampleQuestionnaire();
  assert.equal(questionnaireIssues(d).filter(i => i.level === 'blocker').length, 0);
  assert.deepEqual(placeholderIssues(d, EXAMPLE_SCENARIOS), []);
  const panel = generatePanel({ attributes: PANEL_TEMPLATES.students.attributes, size: 12, allocation: 'quota', seed: 7, background: '' });
  const run = demoRun(d, PANEL_TEMPLATES.students.attributes, panel, { engine: 'demo', memory: 'carry', shuffleOptions: false, scenarios: EXAMPLE_SCENARIOS, models: [] }, new Date('2026-10-10T00:00:00Z'));
  assert.equal(run.responses.length, 24);
  const wait = d.questions.find(q => q.variable === 'WAIT'), barrier = d.questions.find(q => q.variable === 'BARRIER');
  const peak = EXAMPLE_SCENARIOS.find(s => s.id === 'peak');
  assert.match(renderQuestionText(d, wait, peak, new Map()), /晚上 6–8 点的高峰时段/);
  const used = run.responses.find(r => r.answers.find(a => a.questionId === 'sx-use')?.value === '1');
  const answers = new Map(used.answers.map(a => [a.questionId, a]));
  assert.doesNotMatch(renderQuestionText(d, barrier, peak, answers), /\{FREQ\}/);
  for (const r of run.responses) if (r.answers.find(a => a.questionId === 'sx-use')?.value === '0') assert.ok(r.answers.filter(a => a.questionId !== 'sx-use').every(a => !a.shown));
  assert.ok(EXAMPLE_EXPECTATIONS.every(e => [e.a, e.b].every(ref => ref.kind !== 'question' || d.questions.some(q => q.id === ref.id))));
});

test('stored lab config restores field by field and rejects malformed values', () => {
  const base = defaultConfig();
  assert.deepEqual(parseConfig(JSON.stringify(base)), base);
  assert.deepEqual(parseConfig('not json'), base);
  assert.deepEqual(parseConfig(JSON.stringify({ version: 2 })), base);
  const restored = parseConfig(JSON.stringify({ ...base, size: 999, seed: -4, engine: 'model', models: ['a', 'b', 'c', 'd'], memory: 'independent', template: 'nope', attributes: [{ key: 'x', label: 'X', levels: 'bad' }],
    overrides: { ok: { appearance: { hue: 2, hat: 'top', accessory: 'scarf', hair: 1, height: 1.05 }, background: '住校外' }, bad: { appearance: { hue: 99, hat: 'crown', accessory: 'none', hair: 0, height: 1 } } } }));
  assert.equal(restored.size, SILICON_LIMITS.personas);
  assert.equal(restored.seed, base.seed);
  assert.equal(restored.engine, 'model');
  assert.equal(restored.models.length, SILICON_LIMITS.models);
  assert.equal(restored.memory, 'independent');
  assert.equal(restored.template, base.template);
  assert.deepEqual(restored.attributes, base.attributes);
  assert.deepEqual(Object.keys(restored.overrides), ['ok']);
  assert.equal(restored.overrides.ok.appearance.hat, 'top');
});

test('stage halo colours follow the validated ramps and never generate a ninth hue', () => {
  assert.deepEqual([0, 1, 2].map(i => ordinalIndex(i, 3)), [0, 2, 4]);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => stageCategoryColor(true, i, 5)), [...ORDINAL_DARK]);
  assert.equal(stageCategoryColor(false, 7, 9), CATEGORICAL_DARK[7]);
  assert.equal(stageCategoryColor(false, 8, 9), NEUTRAL_HALO);
  assert.equal(stageCategoryColor(true, 6, 7), CATEGORICAL_DARK[6]);
});

test('answer normalisation agrees with the server twin on the shared parity fixture', async () => {
  const { readFile } = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(new URL('../../evi-x-api/tests/fixtures/silicon-parity.json', import.meta.url), 'utf8'));
  for (const c of fixture.cases) {
    const q = { ...newQuestion(c.question.id, c.question.variable), ...c.question };
    assert.deepEqual(normalizeModelAnswer(q, c.raw), { value: c.value, valid: c.valid }, JSON.stringify(c.raw));
  }
});
