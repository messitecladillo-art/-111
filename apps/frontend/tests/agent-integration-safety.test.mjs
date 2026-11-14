import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { transform } from 'esbuild';
import * as safety from '../lib/agent/integration-safety.ts';
import * as studioTools from '../lib/agent/studio-tools.ts';
import { createEditorContent } from '../lib/editor-model.ts';
import { buildInfographicResultSnapshot, extractDescriptivePanelsFromReport } from '../lib/agent/image-gen-engine.ts';
import { descriptiveInfographicSVG } from '../lib/diagram-figures.ts';
import { digestText, parseResultSnapshot, resultPayload, verifyResearchQuality } from '../lib/research-quality.ts';

// Synthetic source records only; this suite never fetches or invokes a provider.
const identity = () => ({ owner: 'synthetic-account', epoch: 3, thread: 'synthetic-thread', project: 'synthetic-project' });
const publication = () => ({ ...identity(), sourceKey: 'source-v1', previewKey: 'preview-v1', pending: false });
test('a late brain result cannot dispatch tools after changing thread, project, account or account epoch', async () => {
  for (const change of [{ thread: 'other-thread' }, { project: 'other-project' }, { owner: 'other-account' }, { epoch: 4 }, { owner: null }]) {
    const captured = identity(); let current = identity(), release, actions = 0;
    const modelReply = new Promise(resolve => { release = resolve; });
    const pending = (async () => { await modelReply; if (safety.sameWorkspaceIdentity(captured, current)) actions++; })();
    current = { ...current, ...change }; release(); await pending;
    assert.equal(actions, 0);
  }
  assert.equal(safety.sameWorkspaceIdentity(identity(), identity()), true);
});

test('studio publication requires the original scope, report, candidate and settled input', async () => {
  const captured = publication();
  assert.equal(safety.canPublishStudioResult(captured, publication()), true);
  for (const change of [{ sourceKey: 'edited-report' }, { previewKey: 'edited-candidate' }, { pending: true }, { thread: 'other' }, { project: 'other' }, { epoch: 4 }]) {
    let resolve, writes = 0, current = publication();
    const renderWork = new Promise(done => { resolve = done; });
    const work = (async () => { await renderWork; if (safety.canPublishStudioResult(captured, current)) writes++; })();
    current = { ...current, ...change }; resolve(); await work;
    assert.equal(writes, 0, JSON.stringify(change));
  }
});

test('the current guest workspace can use deterministic studios without accepting results from a signed-out account', () => {
  const guest = { ...publication(), owner: 'guest', project: null };
  assert.equal(safety.canPublishStudioResult(guest, { ...guest }), true);
  assert.equal(safety.canPublishStudioResult(publication(), guest), false);
  assert.equal(safety.sameWorkspaceIdentity({ ...identity(), owner: null }, { ...identity(), owner: null }), false);
});

const walk = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : !node ? '' : React.Children.toArray(node.props?.children).map(text).join('');
const citationSource = fs.readFileSync(new URL('../components/agent/studios/CrossRefStudio.tsx', import.meta.url), 'utf8');
const { code: citationCode } = await transform(citationSource, { loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2022' });
function citationHarness() {
  const events = [], cells = []; let cursor = 0, tree;
  const box = { exports: {} }, content = createEditorContent();
  vm.runInNewContext(citationCode, { module: box, exports: box.exports, require(name) {
    if (name === 'react') return { useMemo: fn => fn(), useState(initial) { const i = cursor++; cells[i] ??= { value: initial }; return [cells[i].value, value => { cells[i].value = typeof value === 'function' ? value(cells[i].value) : value; }]; } };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === '@/lib/agent/studio-tools') return studioTools;
    if (name === '@/lib/agent/integration-safety') return safety;
    if (name.endsWith('.module.css')) return { __esModule: true, default: {} };
    throw Error(`Unexpected citation dependency ${name}`);
  } });
  const render = () => { cursor = 0; tree = box.exports.default({ content, onUpdateReport: value => events.push(value) }); };
  const input = label => walk(tree).find(node => node.type === 'label' && text(node).startsWith(label))?.props.children;
  render();
  return { events, render, text: () => text(tree), nodes: () => walk(tree),
    fill(label, value) { const field = walk({ props: { children: input(label) } }).find(node => node.type === 'input' || node.type === 'textarea'); assert.ok(field, label); field.props.onChange({ target: { value } }); render(); },
    button: () => walk(tree).find(node => node.type === 'button' && text(node).includes('插入交叉引用')),
    accept() { walk(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } }); render(); },
  };
}

test('citation studio starts empty and only inserts a manually checked original source with a locator', () => {
  const h = citationHarness();
  assert.equal(h.button(), undefined);
  assert.doesNotMatch(h.text(), /精选核心文献|张明远|国奖理论范式组/);
  h.fill('文献题名', 'Synthetic source title'); h.fill('作者', 'Synthetic Author'); h.fill('年份', '2025');
  h.fill('期刊/来源', 'Synthetic Journal'); h.fill('原文链接', 'https://source.invalid/paper'); h.fill('支持位置', 'Page 3, Table 2');
  assert.equal(h.button().props.disabled, true);
  h.button().props.onClick(); assert.equal(h.events.length, 0, 'invoking a disabled handler cannot insert a source');
  h.accept(); assert.equal(h.button().props.disabled, false); h.button().props.onClick();
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].references[0].url, 'https://source.invalid/paper');
  assert.equal(h.events[0].references[0].locator, 'Page 3, Table 2');
  assert.equal(h.events[0].references[0].verification, 'verified');
  h.fill('文献题名', 'Changed source'); assert.equal(h.button().props.disabled, true, 'source edits invalidate the content confirmation');
});

test('a link alone cannot verify a citation, and missing locators or active URL schemes are refused', () => {
  const input = { title: 'Synthetic source', authors: 'Author', year: '2025', source: 'Journal', url: 'https://source.invalid/paper', locator: 'Page 3', checked: true };
  assert.equal(safety.citationEvidenceReady(input), true);
  for (const change of [{ checked: false }, { locator: '' }, { title: '' }, { url: 'javascript:alert(1)' }, { url: 'https://user:key@source.invalid/' }]) {
    assert.equal(safety.citationEvidenceReady({ ...input, ...change }), false);
  }
});

async function result(overrides = {}) {
  const unsigned = parseResultSnapshot({ id: 'synthetic-frequency', title: 'Synthetic frequency', sourceName: 'Synthetic source', sourceUrl: '', sourceHash: 'a'.repeat(64),
    resultHash: '0'.repeat(64), classification: 'user_provided', method: 'frequency', n: 100, total: 110,
    headers: ['类别', '频数', '占比%'], rows: [['A', 40, 40], ['B', 60, 60]], metrics: [], warnings: [], ...overrides });
  return { ...unsigned, resultHash: await digestText(JSON.stringify(resultPayload(unsigned))) };
}
function report(results, findings = []) { return { ...createEditorContent(), quality: { version: 1, results, findings } }; }

test('infographics keep dataset, classification and denominator boundaries and never average subgroup means', async () => {
  const a = await result(), b = await result({ id: 'other-source', sourceHash: 'b'.repeat(64), rows: [['Foreign category', 100, 100]] });
  const alpha = await result({ id: 'different-denominator', method: 'alpha', n: 90, total: 110, metrics: [{ label: 'Cronbach α', value: .9 }] });
  const profile = await result({ id: 'same-source-profile', method: 'profile', rows: [], metrics: [{ label: '指标｜组一', value: 2 }, { label: '指标｜组二', value: 4 }] });
  const simulated = await result({ id: 'different-classification', classification: 'simulated' });
  const content = report([a, b, alpha, profile, simulated]), panels = extractDescriptivePanelsFromReport(content);
  assert.equal(panels.resultCount, 2); assert.equal(panels.sampleN, 100); assert.equal(panels.reliabilityAlpha, null);
  assert.equal(panels.distributions.some(item => item.label.includes('Foreign')), false);
  assert.deepEqual(panels.dimensionMeans.map(item => item.value), [2, 4]);
  const snapshot = await buildInfographicResultSnapshot({ content });
  assert.equal(snapshot.n, 100); assert.equal(snapshot.total, 110); assert.equal(snapshot.classification, 'user_provided');
  assert.deepEqual(snapshot.rows.filter(row => row[0] === '来源快照').map(row => row[1]), [a.id, profile.id]);
  assert.notEqual(snapshot.sourceHash, a.sourceHash, 'the derived source hash binds its exact upstream result versions');
  assert.doesNotMatch(JSON.stringify(snapshot.rows), /已质控|有效样本量/);
  await verifyResearchQuality({ version: 1, results: [snapshot], findings: [] });
});

test('empty report renders missing data without invented respondents, 100 percent or 3.8 point bars', async () => {
  const snapshot = await buildInfographicResultSnapshot({ content: createEditorContent() });
  assert.equal(snapshot.n, 0); assert.equal(snapshot.total, 0); assert.equal(snapshot.classification, 'simulated');
  const svg = descriptiveInfographicSVG(snapshot, '#0F766E');
  assert.match(svg, /无调查数据/); assert.match(svg, /尚无同源频数分布结果/); assert.match(svg, /尚无同源维度均值结果/);
  assert.doesNotMatch(svg, /100%|3\.80|<circle\b|有效样本量/);
});

test('null panel cells remain missing while a measured zero is shown as zero', async () => {
  const base = await buildInfographicResultSnapshot({ content: createEditorContent() });
  const missing = descriptiveInfographicSVG({ ...base, rows: [['均值评价', 'No observation', null, '未登记']] }, '#0F766E');
  assert.match(missing, /未登记/); assert.doesNotMatch(missing, /<circle\b|0\.00/);
  const zero = descriptiveInfographicSVG({ ...base, n: 100, total: 100, rows: [['均值评价', 'Observed zero', 0, '原量纲']] }, '#0F766E');
  assert.match(zero, /0\.00 原量纲/);
});

test('tampered source hashes and classification laundering fail before a derived result is created', async () => {
  const a = await result();
  await assert.rejects(buildInfographicResultSnapshot({ content: report([{ ...a, rows: [['A', 99, 99]] }]) }), /指纹/);
  await assert.rejects(buildInfographicResultSnapshot({ content: report([await result({ classification: 'simulated' })]), classification: 'public' }), /数据分类/);
});

test('unconfirmed and stale findings cannot become infographic headline conclusions', async () => {
  const a = await result(), finding = { id: 'synthetic-finding', title: 'Synthetic finding', question: '', evidenceIds: [a.id], interpretation: 'Unverified headline',
    alternatives: '', scope: '', action: '', status: 'draft', confirmedHashes: {} };
  assert.doesNotMatch(extractDescriptivePanelsFromReport(report([a], [finding])).highlightFinding, /Unverified/);
  assert.doesNotMatch(extractDescriptivePanelsFromReport(report([a], [{ ...finding, status: 'confirmed', confirmedHashes: { [a.id]: 'b'.repeat(64) } }])).highlightFinding, /Unverified/);
  assert.match(extractDescriptivePanelsFromReport(report([a], [{ ...finding, status: 'confirmed', confirmedHashes: { [a.id]: a.resultHash } }])).highlightFinding, /Unverified/);
});
