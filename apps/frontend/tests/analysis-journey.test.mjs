import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleJourneyStatus, currentJourneyModules, journeyScope } from '../lib/analysis-journey.ts';

test('empty, failed, stale and degenerate calculations never become usable results', () => {
  const valid = { hasResult: true, current: true, error: false, n: 12, estimate: 0.8 };
  assert.equal(moduleJourneyStatus(valid), 'ready');
  assert.equal(moduleJourneyStatus({ ...valid, hasResult: false }), 'draft');
  assert.equal(moduleJourneyStatus({ ...valid, error: true }), 'error');
  assert.equal(moduleJourneyStatus({ ...valid, current: false }), 'stale');
  assert.equal(moduleJourneyStatus({ ...valid, n: 0 }), 'diagnostic');
  assert.equal(moduleJourneyStatus({ ...valid, estimate: null }), 'diagnostic');
  assert.equal(moduleJourneyStatus({ ...valid, estimate: Number.NaN }), 'diagnostic');
  assert.equal(moduleJourneyStatus({ ...valid, estimate: 0 }), 'ready');
});

test('progress cannot carry results across datasets or missing-value contexts', () => {
  const modules = [{ id: 'one', title: '分组描述', status: 'ready', n: 12, computedAt: '2026-10-11T00:00:00Z' }];
  const snapshot = { scope: journeyScope('dataset-A', ['NA']), activeId: 'one', modules };
  assert.deepEqual(currentJourneyModules(snapshot, journeyScope('dataset-A', ['NA'])), modules);
  assert.deepEqual(currentJourneyModules(snapshot, journeyScope('dataset-B', ['NA'])), []);
  assert.deepEqual(currentJourneyModules(snapshot, journeyScope('dataset-A', ['999'])), []);
  assert.deepEqual(currentJourneyModules(null, snapshot.scope), []);
});
