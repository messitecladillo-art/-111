import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampKnowledgeWindow, contextFromLocation, emptyKnowledgeUserState, knowledgeUserStateKey, restoreKnowledgeUserState, selectedKnowledgeText, serializeKnowledgeUserState } from '../lib/knowledge/context.ts';
import { knowledgeLookupFromWire, knowledgeStateFromWire, knowledgeStateToWire, parseKnowledgeLookup, parseKnowledgeProjectReferences, parseKnowledgeUserState } from '../lib/knowledge/api-contracts.ts';

test('context derives registered module/project identity and does not read URL queries or form fields', () => {
  assert.equal(contextFromLocation('/workspace', '#design').module, 'design');
  assert.equal(contextFromLocation('/workspace', '#services').module, 'overview');
  const project = contextFromLocation('/projects/723f239f-6d4f-4a6e-88eb-a4370e44431b', '#sampling');
  assert.equal(project.module, 'sampling'); assert.equal(project.projectId, '723f239f-6d4f-4a6e-88eb-a4370e44431b');
  assert.equal(contextFromLocation('/examples/bank-marketing').module, 'analysis');
  assert.equal(contextFromLocation('/knowledge').module, 'knowledge');
  assert.deepEqual(contextFromLocation('/workspace', '#analysis', ['reliability', 'x'.repeat(101)]).helpTags, ['reliability']);
});
test('selection is explicit and bounded; blocked fields and intersecting private regions are excluded', () => {
  const element = { nodeType: 1, closest: () => null };
  const range = { startContainer: element, endContainer: element, commonAncestorContainer: element, intersectsNode: () => false };
  const selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range, toString: () => '置信区间'.repeat(100) };
  const doc = { getSelection: () => selection, querySelectorAll: () => [] };
  assert.equal(selectedKnowledgeText(doc).length, 300);
  element.closest = () => ({ private: true }); assert.equal(selectedKnowledgeText(doc), '');
  element.closest = () => null; range.intersectsNode = () => true; doc.querySelectorAll = () => [{}]; assert.equal(selectedKnowledgeText(doc), '');
  doc.querySelectorAll = () => []; selection.isCollapsed = true; assert.equal(selectedKnowledgeText(doc), '');
});
test('account-bound UI drafts cannot restore another user, forged version, malformed JSON or unbounded histories', () => {
  assert.notEqual(knowledgeUserStateKey('user-a'), knowledgeUserStateKey('user-b')); assert.equal(knowledgeUserStateKey(null), null);
  const original = { ...emptyKnowledgeUserState(), favorites: [{ entryId: 'cronbach-alpha', entryVersion: 1 }], recent: [{ entryId: 'confidence-interval', entryVersion: 1, visitedAt: '2026-10-14T00:00:00Z' }] };
  const serialized = serializeKnowledgeUserState('user-a', original);
  assert.deepEqual(restoreKnowledgeUserState(serialized, 'user-a'), original);
  assert.deepEqual(restoreKnowledgeUserState(serialized, 'user-b'), emptyKnowledgeUserState());
  assert.deepEqual(restoreKnowledgeUserState('{bad', 'user-a'), emptyKnowledgeUserState());
  assert.deepEqual(restoreKnowledgeUserState(JSON.stringify({ accountId: 'user-a', state: { ...original, version: -1 } }), 'user-a'), emptyKnowledgeUserState());
  const dirty = { ...original, favorites: [{ entryId: '../foreign', entryVersion: 1 }, { entryId: 'cronbach-alpha', entryVersion: 0 }] };
  assert.deepEqual(restoreKnowledgeUserState(serializeKnowledgeUserState('user-a', dirty), 'user-a').favorites, []);
});
test('window positions stay reachable at all supported desktop sizes and reject non-finite coordinates', () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const result = clampKnowledgeWindow({ mode: 'float', x: Infinity, y: 10000 }, viewport);
    assert.ok(result.x >= 8 && result.x + 400 <= viewport.width - 8);
    assert.ok(result.y >= 8 && result.y + 560 <= viewport.height - 8);
  }
});
test('personal wire adapters preserve revision and known visit times without inventing missing dates', () => {
  const wire = parseKnowledgeUserState({ revision: 2, favorites: [{ entryId: 'p-value', entryVersion: 1 }], recent: [{ entryId: 'p-value', entryVersion: 1 }], preferences: { mode: 'pinned', x: 0.5, y: 0.25 } });
  const local = knowledgeStateFromWire(wire, emptyKnowledgeUserState(), { width: 1440, height: 900 });
  assert.equal(local.version, 2); assert.equal(local.window.mode, 'dock'); assert.equal(local.window.x, 520);
  assert.equal(local.recent[0].visitedAt, undefined);
  const result = knowledgeStateToWire(local, { width: 1440, height: 900 });
  assert.deepEqual(result.favorites, wire.favorites); assert.deepEqual(result.recent, wire.recent);
  assert.equal(result.preferences.mode, 'pinned'); assert.equal(result.preferences.x, 0.5);
  for (const patch of [{ revision: -1 }, { rows: [] }, { favorites: [{ entryId: 'p-value', entryVersion: '1' }] }, { preferences: { x: Infinity } }, { preferences: { query: 'two\nlines' } }]) assert.throws(() => parseKnowledgeUserState({ ...wire, ...patch }));
});
test('unknown billing remains unknown and no raw answer fields enter lookup receipt adapters', () => {
  const raw = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'outcome_unknown', query: '抽样框', createdAt: '2026-10-14T00:00:00Z', finishedAt: '2026-10-14T00:00:01Z', results: [{ title: '来源', url: 'https://www.nist.gov/', snippet: '概念资料' }], credits: null, errorCode: 'lookup_usage_unknown', providerRequestId: null };
  const parsed = parseKnowledgeLookup(raw); const lookup = knowledgeLookupFromWire(parsed);
  assert.equal(lookup.status, 'outcome_unknown'); assert.equal(lookup.creditsUsed, undefined); assert.equal(lookup.creditsReserved, undefined);
  assert.throws(() => parseKnowledgeLookup({ ...raw, status: 'ready' }));
  assert.throws(() => parseKnowledgeLookup({ ...raw, rows: [] }));
  assert.throws(() => parseKnowledgeLookup({ ...raw, credits: false }));
  assert.throws(() => parseKnowledgeLookup({ ...raw, results: [{ ...raw.results[0], image: 'secret' }] }));
  assert.throws(() => parseKnowledgeLookup({ ...raw, results: [{ ...raw.results[0], url: 'javascript:alert(1)' }] }));
  assert.equal(parseKnowledgeLookup({ ...raw, status: 'ready', credits: 1, errorCode: null }).credits, 1);
});
test('project wire references bind stable entry/version, revision and creator and reject extra evidence fields', () => {
  const reference = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', entryId: 'p-value', entryVersion: 1, createdBy: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', createdAt: '2026-10-14T00:00:00Z' };
  assert.deepEqual(parseKnowledgeProjectReferences({ revision: 3, references: [reference] }), { revision: 3, references: [reference] });
  assert.throws(() => parseKnowledgeProjectReferences({ revision: 3, references: [{ ...reference, empiricalEvidence: true }] }));
  assert.throws(() => parseKnowledgeProjectReferences({ revision: 3, references: [reference, reference] }));
});
