import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ahp } from '../lib/ahp.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('weights, λmax and CR agree with numpy.linalg.eig on a textbook-style judgement matrix', () => {
  const r = ahp([[1, 3, 5, 7], [1 / 3, 1, 3, 5], [1 / 5, 1 / 3, 1, 3], [1 / 7, 1 / 5, 1 / 3, 1]]);
  assert.ok(!('refused' in r));
  [0.5650090537990473, 0.26220120556087323, 0.11750425004139858, 0.05528549059868092].forEach((w, i) => near(r.weights[i], w, 1e-12, `w${i + 1}`));
  near(r.weights.reduce((s, v) => s + v, 0), 1, 1e-15, 'weights sum to one');
  near(r.lambdaMax, 4.116982443447268, 1e-12, 'λmax');
  near(r.ci, 0.03899414781575613, 1e-12, 'CI');
  near(r.cr, 0.0433268309063957, 1e-12, 'CR');
  assert.equal(r.ri, 0.9);
  assert.equal(r.consistent, true);
});

test('a cyclic set of judgements is flagged as inconsistent', () => {
  const r = ahp([[1, 9, 1 / 9], [1 / 9, 1, 9], [9, 1 / 9, 1]]);
  near(r.lambdaMax, 10.11111111111111, 1e-10, 'λmax');
  near(r.cr, 6.130268199233717, 1e-9, 'CR');
  assert.equal(r.consistent, false);
  r.weights.forEach(w => near(w, 1 / 3, 1e-12, 'symmetric weights'));
});

test('a perfectly consistent matrix has CI zero; two criteria need no consistency check', () => {
  const w = [0.5, 0.3, 0.2], m = w.map(a => w.map(b => a / b)), r = ahp(m);
  r.weights.forEach((v, i) => near(v, w[i], 1e-12, `w${i + 1}`));
  near(r.ci, 0, 1e-12, 'CI');
  const two = ahp([[1, 3], [1 / 3, 1]]);
  assert.deepEqual([two.cr, two.consistent], [null, true]);
  near(two.weights[0], 0.75, 1e-12, 'w1');
});

test('it refuses a matrix that is not a pairwise comparison matrix', () => {
  assert.deepEqual(ahp([[1]]), { refused: 'too-small' });
  assert.deepEqual(ahp([[1, 2, 3], [0.5, 1]]), { refused: 'not-square' });
  assert.deepEqual(ahp([[1, 0], [0, 1]]), { refused: 'not-positive' });
  assert.deepEqual(ahp([[1, 3], [0.5, 1]]), { refused: 'not-reciprocal' });
  assert.deepEqual(ahp(Array.from({ length: 16 }, () => new Array(16).fill(1))), { refused: 'too-large' });
});
