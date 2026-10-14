import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { createKnowledgeSearch, normalizeKnowledgeText, tokenizeKnowledgeText } from '../lib/knowledge/search.ts';
import { createKnowledgeSearchClient } from '../lib/knowledge/worker-client.ts';
import { validateKnowledgePack } from '../lib/knowledge/types.ts';

const entry = (id, name, aliases = [], extra = {}) => ({ id, version: 1, name, aliases, domain: 'stats', depth: 'brief', definition: `教学概念：${name}。`, uses: [], examples: [], confusions: [], questions: [], relatedIds: [], methodIds: [], materialIds: [], toolLinks: [], sources: [{ id: 'source', title: '测试数据来源记录', url: 'https://www.nist.gov/', locator: 'synthetic fixture', scope: '仅用于程序测试，不发布解释' }], review: { status: 'reviewed', producer: 'test-author', reviewer: 'test-reviewer', checkedAt: '2026-10-14T00:00:00Z' }, updatedAt: '2026-10-14', ...extra });
const fixture = [
  entry('ci', '置信区间', ['CI', '95%CI'], { englishName: 'confidence interval', definition: '估计范围，反映区间估计的不确定性。' }),
  entry('alpha', 'Cronbach α', ['α', '克朗巴赫系数', 'Cronbach Alpha'], { englishName: "Cronbach's alpha" }),
  entry('significance', '显著性水平', ['α', 'alpha']),
  entry('sem-mean', '均值标准误', ['SEM'], { englishName: 'standard error of the mean' }),
  entry('sem-model', '结构方程模型', ['SEM'], { domain: 'ml', englishName: 'structural equation model' }),
  entry('reverse', '反向题', ['反向计分'], { domain: 'research' }),
  entry('effect', '效应量', ['effect size'], { questions: [{ question: 'p值小就说明影响很大吗？', answer: '应同时报告差异大小。' }] }),
];

test('NFKC, case, CJK segmentation, English names and symbols use one normalisation', () => {
  assert.equal(normalizeKnowledgeText('ＣＩ'), 'ci');
  assert.equal(normalizeKnowledgeText('Cronbach’s α'), 'cronbach alpha');
  assert.ok(tokenizeKnowledgeText('这个置信区间如何解释').includes('置信'));
  const search = createKnowledgeSearch(fixture);
  for (const query of ['CI', 'ＣＩ', 'confidence interval', '置信区间', '95%CI']) assert.equal(search.search(query)[0].entry.id, 'ci');
  assert.equal(search.search('Cronbach’s α')[0].entry.id, 'alpha');
  assert.equal(search.search('confidnce')[0].entry.id, 'ci');
  assert.equal(search.search('反向计')[0].entry.id, 'reverse');
});
test('canonical > alias > prefix > fuzzy > body, and auxiliary context does not erase ambiguity', () => {
  const search = createKnowledgeSearch([...fixture, entry('canonical', 'CI', []), entry('long', 'CI估计方法'), entry('body', '其他概念', [], { definition: '这篇解释包含CI这几个字。' })]);
  const hits = search.search('CI', { context: { module: 'analysis', label: '', helpTags: ['ci'] } });
  assert.equal(hits[0].entry.id, 'canonical'); assert.equal(hits[1].entry.id, 'ci');
  const sem = search.search('SEM', { context: { module: 'analysis', label: '', helpTags: [] } });
  assert.deepEqual(new Set(sem.slice(0, 2).map(hit => hit.entry.id)), new Set(['sem-mean', 'sem-model']));
  assert.ok(sem.slice(0, 2).every(hit => hit.ambiguous));
  assert.deepEqual(new Set(search.search('α').slice(0, 2).map(hit => hit.entry.id)), new Set(['alpha', 'significance']));
  assert.equal(search.search('不存在的紫色独角兽quuxxyz').length, 0);
  assert.equal(search.search('影响很大')[0].entry.id, 'effect');
});
test('drafts never enter public search and recognition uses English word boundaries', () => {
  const search = createKnowledgeSearch([...fixture, entry('draft', '未经审核', [], { review: { status: 'draft', producer: 'author' } })]);
  assert.equal(search.search('未经审核').length, 0);
  assert.equal(search.recognize('semantic alphabets confidence intervalued').length, 0);
  assert.deepEqual(new Set(search.recognize('SEM 和 Cronbach α 以及反向题').map(hit => hit.entry.id)), new Set(['sem-mean', 'sem-model', 'alpha', 'significance', 'reverse']));
  assert.throws(() => createKnowledgeSearch([fixture[0], fixture[0]]), /重复/);
});
test('public catalog rejects false independent review, foreign protocols, duplicate IDs and missing references', () => {
  const pack = { schemaVersion: 1, version: 'test', entries: [fixture[0]] };
  assert.equal(validateKnowledgePack(pack), pack);
  for (const patch of [
    { version: 0 }, { relatedIds: ['missing'] }, { rawAnswers: [] },
    { formula: { tex: 'x', symbols: [{ symbol: {}, meaning: 'x' }], conditions: [] } },
    { sources: [{ ...fixture[0].sources[0], url: 'javascript:alert(1)' }] },
    { toolLinks: [{ label: '跳转', href: 'https://example.com/' }] },
    { review: { status: 'reviewed', producer: 'same', reviewer: 'same', checkedAt: '2026-10-14' } },
  ]) assert.throws(() => validateKnowledgePack({ ...pack, entries: [{ ...fixture[0], ...patch }] }));
});
test('worker client fences late queries, supports AbortSignal, and terminates on dispose', async () => {
  const listeners = {}, requests = [];
  let terminated = 0;
  const worker = { addEventListener(type, listener) { listeners[type] = listener; }, terminate() { terminated++; }, postMessage(request) { if (request.kind === 'initialize') queueMicrotask(() => listeners.message({ data: { kind: 'initialized' } })); else requests.push(request); } };
  const client = createKnowledgeSearchClient(fixture, { workerFactory: () => worker });
  await client.ready;
  const first = client.search('CI').catch(error => error.name);
  await Promise.resolve();
  const second = client.search('SEM'); await Promise.resolve();
  assert.equal(await first, 'AbortError');
  listeners.message({ data: { kind: 'result', id: requests[0].id, hits: [] } });
  listeners.message({ data: { kind: 'result', id: requests[1].id, hits: [{ entry: fixture[3] }] } });
  assert.equal((await second)[0].entry.id, 'sem-mean');
  const controller = new AbortController(); const third = client.search('α', { signal: controller.signal }).catch(error => error.name);
  await Promise.resolve(); controller.abort(); assert.equal(await third, 'AbortError');
  const fourth = client.search('CI').catch(error => error.name); await Promise.resolve(); client.dispose(); assert.equal(await fourth, 'AbortError');
  assert.equal(terminated, 1); await assert.rejects(client.search('CI'), error => error.name === 'AbortError');
});
test('worker startup failure has a functional local fallback; disposal fences readiness', async () => {
  const client = createKnowledgeSearchClient(fixture, { workerFactory: () => { throw new Error('CSP worker unavailable'); } });
  assert.equal(client.mode, 'fallback'); assert.equal((await client.search('CI'))[0].entry.id, 'ci'); client.dispose();
  const silent = createKnowledgeSearchClient(fixture, { workerFactory: () => ({ addEventListener() {}, postMessage() {}, terminate() {} }) });
  const pending = silent.search('CI'); silent.dispose(); await assert.rejects(pending, error => error.name === 'AbortError');
});
test('5,000 concept hot queries report P95 and remain below the declared 100ms budget', () => {
  const entries = Array.from({ length: 5000 }, (_, i) => entry(`term-${i}`, `独立概念${i}`, [`fixture-${i}`], { definition: '性能测试合成文本，独立编号，不计入真实知识库。' }));
  const started = performance.now(); const search = createKnowledgeSearch(entries); const buildMs = performance.now() - started;
  for (let i = 0; i < 10; i++) search.search(`fixture-${i}`);
  const times = [];
  for (let i = 0; i < 100; i++) { const before = performance.now(); const hits = search.search(`fixture-${i * 47}`); assert.equal(hits[0].entry.id, `term-${i * 47}`); times.push(performance.now() - before); }
  times.sort((a, b) => a - b); const p95 = times[Math.ceil(times.length * 0.95) - 1];
  console.log(JSON.stringify({ metric: 'knowledge-search', engine: process.version, entries: 5000, queries: 100, buildMs: Math.round(buildMs), p95Ms: Number(p95.toFixed(2)), memoryHeapMiB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)) }));
  assert.ok(p95 < 100, `hot search P95 ${p95.toFixed(2)}ms exceeds 100ms`);
});
test('independently authored 200-query catalog benchmark is evaluated without training from its fixture', async context => {
  let pack, queries;
  try { pack = JSON.parse(await readFile(new URL('../content/knowledge/core-60.json', import.meta.url))); queries = JSON.parse(await readFile(new URL('./fixtures/knowledge-queries.json', import.meta.url))); }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Producer has not finalized the independent catalog checkpoint yet.'); return; } throw error; }
  validateKnowledgePack(pack);
  const gold = Array.isArray(queries) ? queries : queries.queries;
  assert.equal(gold.length, 200);
  const search = createKnowledgeSearch(pack.entries, { includeDrafts: true });
  let matched = 0; const failures = [];
  for (const item of gold) {
    const hits = search.search(item.query, { limit: 3 });
    const expected = item.expectedIds ?? item.expected ?? item.ids;
    const ids = Array.isArray(expected) ? expected : [expected];
    const good = ids.length === 0 ? hits.length === 0 : item.requireAll ? ids.every(id => hits.some(hit => hit.entry.id === id)) : ids.some(id => hits.some(hit => hit.entry.id === id));
    if (good) matched++; else failures.push({ query: item.query, expected: ids, actual: hits.map(hit => hit.entry.id) });
  }
  console.log(JSON.stringify({ metric: 'knowledge-gold-top3', matched, total: gold.length, rate: matched / gold.length, failures }));
  assert.ok(failures.every(failure => failure.expected.length > 0), 'Unrelated queries must produce a genuine zero-hit state.');
  assert.ok(matched / gold.length >= 0.95, `${matched}/${gold.length} Top3, see failures above`);
});
