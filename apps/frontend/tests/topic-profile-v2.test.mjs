import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMPTY_TOPIC_PROFILE, EMPTY_TOPIC_CANDIDATE } from '../lib/topic-advisor/types.ts';
import { parseTopicProfile, parseExecutableTopicProfile, parseTopicDraft, exportTopicDraft, profileFingerprint, parseTopicBundle, parseTopicTraining } from '../lib/topic-advisor/parse.ts';
import { recommendTopics, assessTopicPattern, extractTopicFeatures, eventLeadsForProfile, evaluateCandidate } from '../lib/topic-advisor/core.ts';
import { buildTopicRefinementContext, nearestTrainingExamples } from '../lib/topic-advisor/prompt.ts';
import { TOPIC_REGION_CATALOG } from '../lib/topic-advisor/regions.ts';
import { emptyTopicProject, parseTopicProjectDocument, prepareTopicSave, withTopicProfile, topicWorkspace, recoverTopicProjectDraft, adoptTopicRecommendation, adoptTopicCandidate, canConfirmTopic, parseTopicHead } from '../lib/topic-project.ts';

const json = name => JSON.parse(fs.readFileSync(new URL(`../content/topic-advisor/${name}.json`, import.meta.url), 'utf8'));
const bundle = parseTopicBundle({ catalog: json('catalog'), sources: json('sources'), events: json('hotspot-events'), model: json('ranker') });
const training = parseTopicTraining(json('train'));
const ref = (code, catalogVersion = TOPIC_REGION_CATALOG.catalogVersion) => ({ code, catalogVersion });
const legacy = () => ({ ...structuredClone(EMPTY_TOPIC_PROFILE), region: '湖北', city: '武汉', referenceDate: '2026-10-15' });
const current = (code = '420106') => ({ ...legacy(), schemaVersion: 2, regionRef: ref(code) });
const localPattern = () => ({ ...structuredClone(bundle.catalog.patterns[0]), regionTags: ['湖北'], cityTags: ['武汉'] });
const vectors = JSON.parse(fs.readFileSync(new URL('../../../packages/evi-x-shared/fixtures/topic-project-v2.json', import.meta.url), 'utf8'));

for (const sample of vectors.cases) test(`profile v2 shared read/write contract: ${sample.id}`, () => {
  const before = structuredClone(sample.document);
  if (sample.readValid) assert.deepEqual(parseTopicProjectDocument(sample.document), before);
  else assert.throws(() => parseTopicProjectDocument(sample.document));
  if (sample.writeValid) assert.deepEqual(prepareTopicSave(sample.document, 0, 'request-v2').document, before);
  else assert.throws(() => prepareTopicSave(sample.document, 0, 'request-v2'));
  assert.deepEqual(sample.document, before);
});

test('legacy parse, default fields and exact v1 fingerprint retain their original bytes', () => {
  const p = legacy(); assert.deepEqual(parseTopicProfile(p), p); assert.ok(!Object.hasOwn(parseTopicProfile({}), 'schemaVersion'));
  assert.equal(profileFingerprint(p), '{"access":{},"budgetYuan":null,"city":"武汉","competitionWindow":null,"days":null,"discipline":"","domains":[],"interests":[],"referenceDate":"2026-10-15","region":"湖北","resources":{},"school":"","schoolContext":[],"sensitiveData":"avoid"}');
  const d = { schemaVersion: 1, profile: p, candidate: null }; assert.deepEqual(parseTopicDraft(exportTopicDraft(d)), d);
  assert.deepEqual(parseTopicDraft({ schemaVersion: 1, profile: {}, candidate: null }).profile, EMPTY_TOPIC_PROFILE);
});

test('v2 profile rejects one-sided/undefined fields and draft envelopes must match profile version', () => {
  for (const p of [{ ...legacy(), schemaVersion: 2 }, { ...legacy(), regionRef: null }, { ...legacy(), schemaVersion: undefined }, { ...legacy(), schemaVersion: 2, regionRef: undefined }, { ...legacy(), schemaVersion: 1, regionRef: null }]) assert.throws(() => parseTopicProfile(p));
  const v2 = current(), draft = { schemaVersion: 2, profile: v2, candidate: null }; assert.deepEqual(parseTopicDraft(exportTopicDraft(draft)), draft);
  assert.throws(() => parseTopicDraft({ ...draft, schemaVersion: 1 }), /版本不一致/);
  assert.throws(() => parseTopicDraft({ ...draft, profile: legacy() }), /版本不一致/);
  assert.notEqual(profileFingerprint(v2), profileFingerprint(legacy()));
});

test('historical refs remain byte-preserving in document/head/draft reads but cannot be saved or executed', () => {
  const stale = { ...current(), regionRef: ref('511402', 'cn-admin-1988-history') };
  assert.deepEqual(parseTopicProfile(stale), stale); assert.deepEqual(parseTopicDraft({ schemaVersion: 2, profile: stale, candidate: null }).profile, stale);
  const d = withTopicProfile(emptyTopicProject(), stale); assert.deepEqual(parseTopicProjectDocument(d), d); assert.deepEqual(recoverTopicProjectDraft(d), d);
  const head = { id: 'topic-version-1', revision: 1, contentHash: 'a'.repeat(64), createdAt: '2026-10-15T08:00:00Z', createdBy: 'account-a' }, decision = { revision: 1, status: 'confirmed', versionId: head.id, contentHash: head.contentHash };
  const response = parseTopicHead({ head, document: d, decision, canEdit: true }); assert.deepEqual(response.document, d); assert.deepEqual(response.decision, decision);
  assert.throws(() => prepareTopicSave(d, 1, 'write'), /确认迁移/); assert.throws(() => parseExecutableTopicProfile(stale), /确认迁移/);
  assert.ok(canConfirmTopic(d).includes('地区引用需要确认迁移'));
});

test('every profile-consuming model and prompt entry point guards old refs before use', () => {
  const p = { ...current(), regionRef: ref('999999') }, pattern = localPattern();
  for (const run of [
    () => recommendTopics(p, bundle), () => assessTopicPattern(pattern, p, bundle),
    () => extractTopicFeatures(pattern, p, bundle.events, bundle.sources), () => eventLeadsForProfile(p, bundle.events, bundle.sources),
    () => evaluateCandidate(EMPTY_TOPIC_CANDIDATE, p, bundle), () => nearestTrainingExamples(p, training, bundle.catalog, bundle.sources),
    () => buildTopicRefinementContext(p, bundle, training),
  ]) assert.throws(run, /确认迁移/);
});

test('current county ancestry earns only its exact local fit and empty v2 refs never use retained city text', () => {
  const pattern = localPattern(), blank = { ...current(), regionRef: null };
  assert.equal(extractTopicFeatures(pattern, current(), { schemaVersion: 1, events: [] }, bundle.sources).geographyFit, 1);
  assert.equal(extractTopicFeatures(pattern, blank, { schemaVersion: 1, events: [] }, bundle.sources).geographyFit, 0);
  assert.equal(assessTopicPattern(pattern, blank, bundle).blockers.some(s => s.includes('地域不一致')), false);
  assert.ok(assessTopicPattern(pattern, blank, bundle).unknowns.some(s => s.includes('模式限定了地域')));
  assert.equal(extractTopicFeatures({ ...pattern, regionTags: ['山西'], cityTags: ['阳城县'] }, current('140522'), { schemaVersion: 1, events: [] }, bundle.sources).geographyFit, 1);
  assert.equal(extractTopicFeatures({ ...pattern, regionTags: ['山西'], cityTags: ['阳城县'] }, current('140500'), { schemaVersion: 1, events: [] }, bundle.sources).geographyFit, 0);
});

test('event inclusion uses actual selected scope and null profiles retain only national events', () => {
  const p = current(), leads = eventLeadsForProfile(p, bundle.events, bundle.sources), blank = eventLeadsForProfile({ ...p, regionRef: null }, bundle.events, bundle.sources);
  assert.ok(leads.some(e => e.geography.level === 'city' && e.geography.city === '武汉'));
  assert.ok(blank.every(e => e.geography.level === 'national'));
  const county = eventLeadsForProfile(current('140522'), bundle.events, bundle.sources), parent = eventLeadsForProfile(current('140500'), bundle.events, bundle.sources);
  assert.ok(county.some(e => e.geography.city === '阳城县')); assert.equal(parent.some(e => e.geography.city === '阳城县'), false);
});

test('v2 municipality and direct-county scopes work without legacy display strings or fabricated ancestors', () => {
  const p = { ...current('110101'), region: '', city: '' }, pattern = { ...localPattern(), regionTags: ['北京'], cityTags: ['北京'] };
  assert.equal(extractTopicFeatures(pattern, p, { schemaVersion: 1, events: [] }, bundle.sources).geographyFit, 1);
  const direct = { ...current('429004'), region: '', city: '' };
  assert.equal(extractTopicFeatures({ ...pattern, regionTags: ['湖北'], cityTags: ['仙桃市'] }, direct, { schemaVersion: 1, events: [] }, bundle.sources).geographyFit, 1);
});

test('changing retained v2 display strings cannot affect recommendations, exemplar distances or geographic warnings', () => {
  const a = current(), b = { ...a, region: '', city: '苏州' };
  const first = recommendTopics(a, bundle), second = recommendTopics(b, bundle);
  assert.deepEqual(first.items, second.items); assert.deepEqual(first.excluded, second.excluded); assert.deepEqual(first.warnings, second.warnings);
  assert.deepEqual(nearestTrainingExamples(a, training, bundle.catalog, bundle.sources), nearestTrainingExamples(b, training, bundle.catalog, bundle.sources));
});

test('prompt adds canonical versioned ref and path only for v2, guards scope, and preserves source allowlists', () => {
  const p = { ...current(), region: '山西', city: '晋城' }, context = buildTopicRefinementContext(p, bundle, training);
  assert.deepEqual(context.data.regionResolution.ref, p.regionRef); assert.equal(context.data.regionResolution.classification, 'directory_only');
  assert.deepEqual(context.data.regionResolution.path.map(r => r.code), ['420000', '420100', '420106']);
  assert.match(context.system, /行政目录不证明/); assert.ok(context.data.sources.every(s => context.data.allowedSourceIds.includes(s.id)));
  const unset = buildTopicRefinementContext({ ...p, regionRef: null }, bundle, training); assert.deepEqual(unset.data.regionResolution.path, []); assert.equal(unset.data.regionResolution.status, 'unset');
  const old = buildTopicRefinementContext(legacy(), bundle, training); assert.ok(!Object.hasOwn(old.data, 'regionResolution')); assert.ok(!old.system.includes('regionResolution'));
});

test('profile upgrade is coherent and preserves every stable research ID and unfinished draft field', () => {
  const d = emptyTopicProject('2026-10-15'); d.brief.questions = [{ id: 'rq-first', text: '原研究问题' }, { id: 'rq-second', text: '另一个问题' }];
  d.brief.constructs = [{ id: 'construct-original', name: '原概念', questionIds: ['rq-second'] }];
  d.brief.sources = [{ id: 'unfinished-source', title: '尚在编辑', url: 'https://', locator: '', coverage: 'reference', publishedAt: '', retrievedAt: '' }];
  const before = structuredClone(d), next = withTopicProfile(d, current());
  assert.equal(next.schemaVersion, 2); assert.deepEqual(next.brief, d.brief); assert.deepEqual(d, before); assert.deepEqual(recoverTopicProjectDraft(next), next);
  assert.deepEqual(topicWorkspace(next).profile, current()); assert.equal(Object.hasOwn(next, 'decision'), false);
});

test('explicit recommendation and candidate adoption keep schema/profile versions coherent and reused IDs stable', () => {
  const p = current(), item = recommendTopics(p, bundle).items[0], first = adoptTopicRecommendation(emptyTopicProject(), item, p, bundle);
  assert.equal(first.schemaVersion, 2); assert.deepEqual(parseTopicProjectDocument(first), first); assert.equal(first.brief.geography, '湖北省 · 武汉市 · 武昌区');
  const id = first.brief.questions[0].id, second = adoptTopicRecommendation(first, item, p, bundle); assert.equal(second.brief.questions[0].id, id);
  const c = { ...structuredClone(EMPTY_TOPIC_CANDIDATE), title: '合成候选', geography: '武昌区' }, evaluation = evaluateCandidate(c, p, bundle);
  const custom = adoptTopicCandidate(first, c, evaluation, bundle), repeated = adoptTopicCandidate(custom, c, evaluation, bundle);
  assert.equal(custom.schemaVersion, 2); assert.equal(repeated.brief.questions[0].id, custom.brief.questions[0].id); assert.deepEqual(parseTopicProjectDocument(repeated), repeated);
  assert.ok(custom.verification.every(v => v.status === 'planned' && v.recordedAt === null));
});
