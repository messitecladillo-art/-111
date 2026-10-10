import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyLandingDestination, timelineChapter, timelineProgress } from '../lib/landing-navigation.ts';

test('all previous public workbench bookmarks reach an existing destination', () => {
  for (const id of ['overview','cases','diagnose','lifecycle','rules','editor','analysis','design','defense']) assert.equal(legacyLandingDestination(`#${id}`), `/workspace#${id}`);
  assert.equal(legacyLandingDestination('#workspace'), '/projects');
  assert.equal(legacyLandingDestination('#services'), '/services');
});
test('moved product bookmarks resolve while narrative and untrusted fragments stay local', () => {
  assert.equal(legacyLandingDestination('#product'), '/explore');
  assert.equal(legacyLandingDestination('#questions'), '/explore#questions');
  for (const id of ['#journey','', '#//example.com', '#editor?next=https://example.com', '#%65ditor']) assert.equal(legacyLandingDestination(id), null);
});
test('scroll progress stays finite at overscroll, after the section and zero-size layouts', () => {
  assert.equal(timelineProgress(100, 4000, 1000), 0);
  assert.equal(timelineProgress(-1500, 4000, 1000), 1.5);
  assert.equal(timelineProgress(-5000, 4000, 1000), 3);
  for (const triple of [[0,0,0],[0,100,1000],[NaN,4000,1000],[-1,Infinity,100]]) assert.equal(timelineProgress(...triple),0);
});
test('timeline supports reversible traversal and invalid state recovery', () => {
  assert.deepEqual([0,1,2,3,2,1,0].map(timelineChapter), [0,1,2,3,2,1,0]);
  assert.equal(timelineChapter(-5),0); assert.equal(timelineChapter(9),3); assert.equal(timelineChapter(NaN),0);
});
