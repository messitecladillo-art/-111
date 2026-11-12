import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteratureWorkspaceSnapshot, verifyLiteratureWorkspaceSnapshot, parseLiteratureWorkspaceSnapshot, literatureWorkspaceReceipt, literatureEvidenceReference, DEFAULT_LITERATURE_SETTINGS, MAX_LITERATURE_WORKSPACE_BYTES } from '../lib/topic-lab/workspace.ts';
import { buildTermIndex, parseThesaurus } from '../lib/topic-lab/terms.ts';
import { buildTermMap } from '../lib/topic-lab/network.ts';
import { mergeRecords } from '../lib/topic-lab/parse.ts';
import { DEFAULT_CLOUD_APPEARANCE } from '../lib/topic-lab/cloud-shapes.ts';

export const record = (id = 'synthetic-original-id') => ({ id, title: `Synthetic ${id} literature`, authors: ['Synthetic Author'], year: 2024, source: 'Synthetic Journal', keywords: ['EVs', 'charging'], keywordsPlus: [], abstract: 'Synthetic metadata only, never a real source.', citations: 0, doi: `10.0000/${id}`, refs: ['doi:10.0000/base'], refLabels: ['Synthetic Foundation, 2020, DOI 10.0000/base'], format: 'wos' });
export const corpus = () => ({ kind: 'import', lists: [[record(), record('second')]], files: [{ name: 'synthetic.wos.txt', format: 'wos', records: 2, skipped: 1, warnings: ['Synthetic skipped record warning'] }] });
const settings = () => ({ ...DEFAULT_LITERATURE_SETTINGS, source: 'keywords', thesaurus: 'EVs => electric vehicle', basket: ['electric vehicle'], view: 'studio' });

test('snapshot roundtrip preserves original source records, reference labels, warnings and selected terms', async () => {
  const input = corpus(), original = structuredClone(input), snapshot = await createLiteratureWorkspaceSnapshot(input, settings());
  const restored = await verifyLiteratureWorkspaceSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored, snapshot); assert.deepEqual(restored.corpus, original);
  input.lists[0][0].abstract = 'changed after capture';
  assert.equal(restored.corpus.lists[0][0].abstract, original.lists[0][0].abstract);
  assert.deepEqual(literatureEvidenceReference(restored).selectedTerms, ['electric vehicle']);
  assert.equal(literatureEvidenceReference(restored).classification, 'metadata_analysis');
});

test('hashes bind corpus and parameters while retaining separate view and term selection state', async () => {
  const a = await createLiteratureWorkspaceSnapshot(corpus(), settings());
  const b = await createLiteratureWorkspaceSnapshot(corpus(), { ...settings(), basket: ['charging'], colorBy: 'year' });
  assert.equal(a.corpusHash, b.corpusHash); assert.equal(a.parameterHash, b.parameterHash); assert.notEqual(a.snapshotHash, b.snapshotHash);
  const c = await createLiteratureWorkspaceSnapshot(corpus(), { ...settings(), thesaurus: '' });
  assert.notEqual(a.parameterHash, c.parameterHash);
  const changed = corpus(); changed.files[0].name = 'different-origin.txt';
  assert.notEqual(a.corpusHash, (await createLiteratureWorkspaceSnapshot(changed, settings())).corpusHash);
  const forged = structuredClone(a); forged.corpus.lists[0][0].source = 'tampered source';
  await assert.rejects(verifyLiteratureWorkspaceSnapshot(forged), /指纹不一致/);
});

test('legacy v1 fingerprints remain valid without injecting appearance defaults', async () => {
  // Captured from the integration baseline before appearance was introduced.
  const legacy = { schema: 'literature-workspace/v1', corpus: null, settings: { ...DEFAULT_LITERATURE_SETTINGS }, corpusHash: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b', parameterHash: 'fee6c41657f2b1a9131958292fe1787280669e009a02d68b9af56ea3eaf95054', snapshotHash: '128045de35675ca57bc52953f3b72a0844e92e7a0257b3ce48f3c6d4b11b8f22' };
  assert.equal(Object.hasOwn(legacy.settings, 'cloud'), false);
  assert.deepEqual(await verifyLiteratureWorkspaceSnapshot(legacy), legacy);
});

test('cloud appearance persists without changing the term map or analysis parameter identity', async () => {
  const a = await createLiteratureWorkspaceSnapshot(corpus(), settings());
  const cloud = { ...DEFAULT_CLOUD_APPEARANCE, shape: 'crayfish', orientation: 'vertical', spacing: 'relaxed' };
  const b = await createLiteratureWorkspaceSnapshot(corpus(), { ...settings(), cloud });
  assert.deepEqual((await verifyLiteratureWorkspaceSnapshot(JSON.parse(JSON.stringify(b)))).settings.cloud, cloud);
  assert.equal(a.corpusHash, b.corpusHash); assert.equal(a.parameterHash, b.parameterHash); assert.notEqual(a.snapshotHash, b.snapshotHash);
  const ar = await literatureWorkspaceReceipt(a), br = await literatureWorkspaceReceipt(b);
  assert.deepEqual(ar.map, br.map); assert.deepEqual(ar.parameters, br.parameters);
  const forged = structuredClone(b); forged.settings.cloud.shape = 'leaf';
  await assert.rejects(verifyLiteratureWorkspaceSnapshot(forged), /指纹不一致/);
  await assert.rejects(createLiteratureWorkspaceSnapshot(corpus(), { ...settings(), cloud: { ...cloud, unsafe: true } }));
  const accessor = { ...settings() }; Object.defineProperty(accessor, 'cloud', { enumerable: true, get() { throw Error('do not execute'); } });
  await assert.rejects(createLiteratureWorkspaceSnapshot(corpus(), accessor), /访问器/);
  await assert.rejects(createLiteratureWorkspaceSnapshot(corpus(), { ...settings(), unknownAppearance: cloud }), /未知字段/);
});

test('receipt reproduces the existing map with actual normalization and never claims full-text review', async () => {
  const snapshot = await createLiteratureWorkspaceSnapshot(corpus(), settings());
  const a = await literatureWorkspaceReceipt(snapshot), b = await literatureWorkspaceReceipt(snapshot);
  assert.deepEqual(a, b); assert.equal(a.status, 'ready'); assert.equal(a.schema, 'literature-workspace-run/v1');
  const thes = parseThesaurus(settings().thesaurus), records = mergeRecords(snapshot.corpus.lists).records;
  const expected = buildTermMap(buildTermIndex(records, { source: 'keywords', synonyms: thes.synonyms, exclude: thes.exclude }), settings());
  assert.deepEqual(a.map, expected); assert.ok(a.map.nodes.some(n => n.key === 'electric vehicle'));
  assert.deepEqual(a.sourceIds, ['p0', 'p1']); assert.match(a.limitations.join(''), /不代表联网检索、全文核读/);
});

test('invalid sources, accessors, sparse records and size limits reject visibly without truncating input', async () => {
  const snapshot = await createLiteratureWorkspaceSnapshot(corpus(), settings());
  const missing = structuredClone(snapshot); missing.corpus.files[0].records = 1;
  assert.throws(() => parseLiteratureWorkspaceSnapshot(missing), /不一致/);
  const sparse = corpus(); sparse.lists[0] = Array(2);
  await assert.rejects(createLiteratureWorkspaceSnapshot(sparse, settings()), /空项或访问器/);
  const excess = corpus(); excess.lists[0] = Array(20001).fill(record());
  await assert.rejects(createLiteratureWorkspaceSnapshot(excess, settings()), /20000/); assert.equal(excess.lists[0].length, 20001);
  const huge = corpus(); huge.lists[0][0].title = 'x'.repeat(MAX_LITERATURE_WORKSPACE_BYTES + 1);
  await assert.rejects(createLiteratureWorkspaceSnapshot(huge, settings()), /大小无效/);
  const accessor = { ...snapshot }; Object.defineProperty(accessor, 'corpus', { get() { throw Error('must not execute'); }, enumerable: true });
  assert.throws(() => parseLiteratureWorkspaceSnapshot(accessor), /访问器/);
});
