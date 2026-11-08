import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareResearchIntake, adoptIntakeCandidate, analyzeResearchLiterature } from '../lib/agent/research-intake.ts';
import { EMPTY_TOPIC_PROFILE } from '../lib/topic-advisor/types.ts';
import { parseTopicProjectDocument } from '../lib/topic-project.ts';
import { mergeRecords, parseLiterature } from '../lib/topic-lab/parse.ts';
import { buildTermIndex } from '../lib/topic-lab/terms.ts';
import { buildTermMap } from '../lib/topic-lab/network.ts';
import { paperGraph } from '../lib/topic-lab/papers.ts';
import { keywordBursts } from '../lib/topic-lab/burst.ts';
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('intake executes the existing local tool and prepares source-bound proposals without guessing region or access', async () => {
  const profile = structuredClone(EMPTY_TOPIC_PROFILE);
  const result = await prepareResearchIntake('大学生校园公共服务满意度', profile, PROJECT);
  assert.equal(result.status, 'ready');
  assert.equal(result.classification, 'proposed');
  assert.equal(result.turn.projectId, PROJECT);
  assert.equal(result.turn.modelCalled, false);
  assert.equal(result.turn.providerMode, 'local');
  assert.match(result.inputHash, /^[a-f0-9]{64}$/);
  assert.ok(result.missing.some(question => question.includes('城市')));
  assert.deepEqual(profile, EMPTY_TOPIC_PROFILE);
  for (const candidate of result.candidates) {
    assert.deepEqual(parseTopicProjectDocument(candidate.document), candidate.document);
    assert.equal(candidate.document.brief.geography, '');
    assert.deepEqual(candidate.document.profile.access, {});
    assert.equal(candidate.document.selected.id, candidate.patternId);
    const item = result.turn.assistant.items.find(item => item.patternId === candidate.patternId);
    assert.equal(candidate.document.brief.title, item.title);
    assert.deepEqual(candidate.document.provenance.sourceIds, item.sourceIds);
    assert.ok(candidate.document.brief.population.trim(), 'population originates in the registered ranked pattern');
    assert.ok(candidate.document.verification.every(check => check.status === 'planned' && check.recordedAt === null));
  }
});

test('adoption rejects foreign candidates, stale sources and incomplete receipts', async () => {
  const { turn } = await prepareResearchIntake('校园公共服务');
  const id = turn.assistant.items[0].patternId;
  assert.throws(() => adoptIntakeCandidate(turn, 'invented-pattern'), /候选/);
  assert.throws(() => adoptIntakeCandidate({ ...turn, status: 'running', assistant: null }, id), /回执|记录/);
  assert.throws(() => adoptIntakeCandidate({ ...turn, sourceVersions: { ...turn.sourceVersions, topicDigest: '0'.repeat(64) } }, id), /来源版本/);
  assert.throws(() => adoptIntakeCandidate({ ...turn, sources: [] }, id), /来源|记录/);
});

test('unrelated or missing direction never produces a fake successful topic', async () => {
  await assert.rejects(() => prepareResearchIntake(''), /方向/);
  await assert.rejects(() => prepareResearchIntake('题'.repeat(1201)), /方向/);
  const result = await prepareResearchIntake('请证明黎曼猜想');
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.candidates, []);
  assert.ok(result.missing.length > 0);
});

const record = (i, extra = {}) => ({ id: `import${i}`, title: `Community health access ${i}`, authors: ['A Author'],
  year: 2020 + i % 3, source: 'Imported journal metadata', keywords: ['health access', i % 2 ? 'public service' : 'digital service'],
  keywordsPlus: [], abstract: '', citations: null, doi: `10.1234/example${i}`, refs: [], refLabels: [], format: 'ris', ...extra });

test('literature receipt reproduces actual existing index/map/paper/burst computations and hashes', async () => {
  const input = Array.from({ length: 8 }, (_, i) => record(i));
  const options = { source: 'keywords', minDf: 2, maxTerms: 20, maxPapers: 10, topTerms: 8, resolution: 1, seed: 7, gamma: 1 };
  const result = await analyzeResearchLiterature(input, options);
  const records = mergeRecords([input]).records, index = buildTermIndex(records, { source: options.source });
  assert.equal(result.status, 'ready');
  assert.equal(result.summary.records, 8);
  assert.equal(result.summary.withCitations, 0);
  assert.deepEqual(result.summary.yearRange, [2020, 2022]);
  assert.equal(result.topTerms.find(term => term.key === 'health access').df, 8);
  assert.deepEqual(result.map, buildTermMap(index, options));
  assert.deepEqual(result.papers, paperGraph(records, index.docs, { max: options.maxPapers }));
  assert.deepEqual(result.bursts, keywordBursts(index, { gamma: options.gamma, maxTerms: options.maxTerms, limit: 25 }));
  const repeated = await analyzeResearchLiterature(input, options);
  assert.equal(result.corpusHash, repeated.corpusHash);
  assert.equal(result.parameterHash, repeated.parameterHash);
  assert.equal(result.resultHash, repeated.resultHash);
  const changed = await analyzeResearchLiterature(input, { ...options, seed: 8 });
  assert.equal(changed.corpusHash, result.corpusHash);
  assert.notEqual(changed.parameterHash, result.parameterHash);
  for (const key of ['corpusHash', 'parameterHash', 'resultHash']) assert.match(result[key], /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'the receipt has no Maps, Sets or hidden nonserializable values');
  assert.ok(result.limitations.some(limit => limit.includes('未联网检索或核读全文')));
});

test('export text uses existing parser and deduplicator, retaining missing metadata', async () => {
  const text = 'TY  - JOUR\nTI  - Local literature export\nKW  - access\nER  - \n\nTY  - JOUR\nTI  - Local literature export\nKW  - access\nER  - ';
  assert.equal(parseLiterature(text).records.length, 2);
  const result = await analyzeResearchLiterature(text);
  assert.equal(result.summary.inputRecords, 2);
  assert.equal(result.summary.records, 1);
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.summary.withYear, 0);
  assert.equal(result.summary.yearRange, null);
  assert.equal(result.summary.withCitations, 0);
  assert.equal(result.papers.mode, 'keywords');
});

test('missing/unrecognized literature blocks instead of manufacturing an empty analysis', async () => {
  for (const input of [undefined, null, [], '', 'not an export']) {
    const result = await analyzeResearchLiterature(input);
    assert.equal(result.status, 'blocked');
    assert.equal(result.summary, null);
    assert.equal(result.map, null);
    assert.equal(result.papers, null);
    assert.equal(result.bursts, null);
    assert.ok(result.missing.length);
  }
});

test('invalid or unbounded corpus/options are rejected before computation, without invoking accessors', async () => {
  let read = false;
  const accessor = Object.defineProperty(record(1), 'title', { get() { read = true; return 'unsafe'; } });
  for (const input of [[accessor], [record(1, { year: NaN })], [record(1, { citations: -1 })], Array.from({ length: 2001 }, (_, i) => record(i))]) {
    await assert.rejects(() => analyzeResearchLiterature(input), /研究入口/);
  }
  assert.equal(read, false);
  for (const options of [{ maxTerms: 10000 }, { source: 'invented' }, { seed: NaN }, { maxPapers: 0 }, { apiKey: 'secret' }]) {
    await assert.rejects(() => analyzeResearchLiterature([record(1)], options), /研究入口/);
  }
});
