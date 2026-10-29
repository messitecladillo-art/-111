import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTENT_FIELDS, parseMemorySnapshot } from '../src/project-memory.ts';

const emptyIntent = () => Object.fromEntries(INTENT_FIELDS.map(field => [field, { value: '', status: 'unknown' }]));
const snapshot = {
  schemaVersion: 1, projectId: 'p-1', revision: 2, contentHash: 'a'.repeat(64),
  document: { schemaVersion: 1, intent: emptyIntent(), decisions: [], openQuestions: [] },
  permissions: { role: 'editor', canEdit: true }, seed: null,
};

test('a memory snapshot parses and keeps its revision and permissions', () => {
  const parsed = parseMemorySnapshot(snapshot);
  assert.equal(parsed.revision, 2);
  assert.equal(parsed.permissions.canEdit, true);
  assert.equal(parsed.document.intent.title.status, 'unknown');
});

test('a memory document rejects unknown fields, bad statuses and long text', () => {
  assert.throws(() => parseMemorySnapshot({ ...snapshot, extra: true }));
  assert.throws(() => parseMemorySnapshot({
    ...snapshot,
    document: { ...snapshot.document, intent: { ...emptyIntent(), title: { value: 'x', status: 'proposed' } } },
  }));
  assert.throws(() => parseMemorySnapshot({
    ...snapshot,
    document: { ...snapshot.document, intent: { ...emptyIntent(), title: { value: 'x'.repeat(601), status: 'confirmed' } } },
  }));
});
