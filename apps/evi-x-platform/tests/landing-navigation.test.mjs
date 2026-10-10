import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyLandingDestination } from '../lib/landing-navigation.ts';

test('all previous public workbench bookmarks reach an existing destination', () => {
  for (const id of ['overview','cases','diagnose','lifecycle','rules','editor','analysis','design','defense']) assert.equal(legacyLandingDestination(`#${id}`), `/workspace#${id}`);
  assert.equal(legacyLandingDestination('#workspace'), '/projects');
  assert.equal(legacyLandingDestination('#services'), '/services');
});
test('moved product bookmarks resolve while narrative and untrusted fragments stay local', () => {
  assert.equal(legacyLandingDestination('#product'), '/explore');
  assert.equal(legacyLandingDestination('#questions'), '/explore#questions');
  for (const id of ['#journey','#prologue','#era-oracle','#era-now','#begin','', '#//example.com', '#editor?next=https://example.com', '#%65ditor']) assert.equal(legacyLandingDestination(id), null);
});
