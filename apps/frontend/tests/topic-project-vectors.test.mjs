import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTopicProjectDocument } from '../lib/topic-project.ts';

const vectors = JSON.parse(readFileSync(new URL('../../../packages/evi-x-shared/fixtures/topic-project-v1.json', import.meta.url), 'utf8'));
for (const sample of vectors.cases) test(`shared topic contract: ${sample.id}`, () => {
  const original = structuredClone(sample.document);
  if (sample.valid) assert.deepEqual(parseTopicProjectDocument(sample.document), original);
  else assert.throws(() => parseTopicProjectDocument(sample.document));
  assert.deepEqual(sample.document, original);
});
