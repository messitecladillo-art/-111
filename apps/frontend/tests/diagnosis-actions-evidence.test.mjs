import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDiagnosisBriefSource, prepareDiagnosisBrief, applyDiagnosisBrief } from '../lib/diagnosis-actions.ts';
import { newQuestionnaire } from '../lib/questionnaire.ts';
import { parseLiteratureEvidenceReference, literatureEvidenceReferencesEqual } from '../lib/topic-lab/evidence-reference.ts';

const reference = () => ({ schema: 'literature-evidence/v1', classification: 'metadata_analysis', corpusHash: 'a'.repeat(64), parameterHash: 'b'.repeat(64), snapshotHash: 'c'.repeat(64), sourceIds: ['p0', 'p1'], selectedTerms: ['公共服务', 'service access'] });
const v1 = () => ({ id: 'diagnosis-fixture', input: { title: '公共服务调研', problem: '比较待实施的公共服务配置方案，为负责人提供改进依据。', decisionOwner: '社区服务负责人', population: '本社区具有服务需求的成年居民', geography: '待实施社区', stage: 'intake', evidenceStatus: 'proposed' } });
const v2 = () => ({ schemaVersion: 2, ...v1(), literature: reference() });

test('v1 source stays exact and v2 adds only a metadata reference to the canonical source binding', () => {
  assert.deepEqual(parseDiagnosisBriefSource(v1()), v1());
  const source = v2(), design = newQuestionnaire(), plain = prepareDiagnosisBrief(v1(), design), bound = prepareDiagnosisBrief(source, design);
  assert.deepEqual(JSON.parse(bound.sourceKey), source);
  assert.deepEqual(bound.fields, plain.fields, 'provenance never rewrites human objective or questionnaire fields');
  assert.deepEqual(JSON.parse(bound.baseKey), JSON.parse(plain.baseKey));
  const next = applyDiagnosisBrief(bound, source, design, ['title', 'objective']);
  assert.equal(next.objective, plain.fields.find(field => field.key === 'objective').after);
  assert.equal(Object.hasOwn(next, 'literature'), false);
  assert.equal(next.classification, 'proposed');
  source.literature.sourceIds.push('p2');
  assert.deepEqual(JSON.parse(bound.sourceKey).literature.sourceIds, ['p0', 'p1']);
});

test('every evidence hash, source id and selected term participates in stale-proposal rejection', () => {
  const source = v2(), design = newQuestionnaire(), proposal = prepareDiagnosisBrief(source, design), before = JSON.stringify(design);
  for (const mutate of [
    value => value.literature.corpusHash = 'd'.repeat(64), value => value.literature.parameterHash = 'd'.repeat(64),
    value => value.literature.snapshotHash = 'd'.repeat(64), value => value.literature.sourceIds.push('p2'),
    value => value.literature.sourceIds.reverse(), value => value.literature.selectedTerms.push('new term'),
    value => value.literature.selectedTerms.reverse(), value => value.id = 'new-epoch',
  ]) {
    const changed = structuredClone(source); mutate(changed);
    assert.throws(() => applyDiagnosisBrief(proposal, changed, design, ['title']), /变化/);
    assert.equal(JSON.stringify(design), before);
  }
  assert.throws(() => applyDiagnosisBrief(proposal, v1(), design, ['title']), /变化/);
  assert.throws(() => applyDiagnosisBrief(prepareDiagnosisBrief(v1(), design), source, design, ['title']), /变化/);
});

test('strict source versions reject corpus leakage, unknown fields and false evidence classifications', () => {
  for (const source of [
    { ...v1(), schemaVersion: 1 }, { ...v2(), schemaVersion: 3 }, { ...v2(), extra: true }, { ...v2(), corpus: {} },
    { ...v1(), literature: reference() }, { ...v2(), literature: { ...reference(), rawCorpus: [] } },
    { ...v2(), literature: { ...reference(), classification: 'actual' } },
    { ...v2(), literature: { ...reference(), schema: 'literature-evidence/v2' } },
  ]) assert.throws(() => parseDiagnosisBriefSource(source));
});

test('reference parser rejects malformed hashes, duplicate or unbounded lists and accessors without executing them', () => {
  let calls = 0;
  const getter = reference(); Object.defineProperty(getter, 'corpusHash', { enumerable: true, get() { calls++; return 'a'.repeat(64); } });
  const itemGetter = reference(); Object.defineProperty(itemGetter.sourceIds, '0', { enumerable: true, get() { calls++; return 'p0'; } });
  for (const value of [getter, itemGetter, { ...reference(), corpusHash: 'A'.repeat(64) }, { ...reference(), sourceIds: ['p0', 'p0'] },
    { ...reference(), selectedTerms: ['term', 'term'] }, { ...reference(), selectedTerms: [''] }, { ...reference(), sourceIds: new Array(2) },
    { ...reference(), sourceIds: ['x'.repeat(161)] }, { ...reference(), selectedTerms: ['x'.repeat(241)] }]) assert.throws(() => parseLiteratureEvidenceReference(value));
  assert.equal(calls, 0);
  const source = v2(); Object.defineProperty(source, 'literature', { enumerable: true, get() { calls++; return reference(); } });
  assert.throws(() => parseDiagnosisBriefSource(source)); assert.equal(calls, 0);
});

test('a full 20000-record file can bind metadata without the old 2000-element source limit', () => {
  const source = v2(), design = newQuestionnaire();
  source.literature.sourceIds = Array.from({ length: 20000 }, (_, i) => `p${i}`);
  const proposal = prepareDiagnosisBrief(source, design);
  assert.equal(JSON.parse(proposal.sourceKey).literature.sourceIds.length, 20000);
  assert.equal(applyDiagnosisBrief(proposal, source, design, ['title']).title, source.input.title);
  const tooLarge = { ...reference(), sourceIds: Array.from({ length: 100001 }, (_, i) => `p${i}`) };
  assert.throws(() => parseLiteratureEvidenceReference(tooLarge));
});

test('reference equality checks the complete exact binding while ignoring object key order', () => {
  const original = reference(), reordered = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(literatureEvidenceReferencesEqual(original, reordered), true);
  for (const key of ['corpusHash', 'parameterHash', 'snapshotHash']) assert.equal(literatureEvidenceReferencesEqual(original, { ...original, [key]: 'd'.repeat(64) }), false);
  assert.equal(literatureEvidenceReferencesEqual(original, { ...original, sourceIds: ['p0'] }), false);
  assert.equal(literatureEvidenceReferencesEqual(original, { ...original, selectedTerms: [] }), false);
  assert.equal(literatureEvidenceReferencesEqual(original, { ...original, corpus: {} }), false);
});
