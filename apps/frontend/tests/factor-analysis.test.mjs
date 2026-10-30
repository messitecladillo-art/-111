import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { canonical, exploratoryFactors, principalAxis, symmetricEigen, varimax } from '../lib/factor-analysis.ts';
import { correlationMatrix } from '../lib/psychometrics.ts';

// Seeded teaching-simulation items: two factors, three items each, plus a cross-loading item; no respondents.
const random = seededRandom('efa-test');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const pattern = [[0.8, 0], [0.75, 0.1], [0.7, 0], [0, 0.8], [0.1, 0.7], [0, 0.65], [0.4, 0.4]];
const rows = Array.from({ length: 300 }, () => {
  const f = [normal(), normal()];
  return pattern.map(([a, b]) => a * f[0] + b * f[1] + Math.sqrt(Math.max(0.05, 1 - a * a - b * b)) * normal());
});
const columns = pattern.map((_, j) => rows.map(r => r[j]));
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

// Reference on these exact columns: numpy.linalg.eigvalsh for the scree; statsmodels Factor(method='pa', smc=True)
// for the extraction; statsmodels rotate_factors('varimax', tol=1e-15) on Kaiser-normalised loadings for the
// rotation, put in the same canonical form. The rotation agrees to about 1e-9, the limit of the reference's stop.
const REF = {
  eigen: [2.707196860384, 1.968809565307, 0.629354310806, 0.529489919764, 0.44097238238, 0.411794327846, 0.312382633513],
  loadings: [[0.831379006, -0.01241226], [0.773742667, 0.084403137], [0.709838128, -0.008476402], [0.032474661, 0.786087947], [0.102110517, 0.75236632], [-0.013494335, 0.633339835], [0.4826032, 0.400440267]],
  communalities: [0.691345116426, 0.605801604637, 0.503942017277, 0.61898886438, 0.576481636855, 0.401301443075, 0.393258255965],
  ss: [2.038308042, 1.752810897],
};

test('principal-axis factors with varimax agree with numpy and statsmodels', () => {
  const r = exploratoryFactors(columns);
  assert.ok(!('refused' in r));
  assert.equal(r.factors, 2, 'two eigenvalues above one');
  r.eigenvalues.forEach((v, i) => near(v, REF.eigen[i], 1e-11, `eigenvalue ${i + 1}`));
  r.loadings.forEach((row, i) => row.forEach((v, j) => near(v, REF.loadings[i][j], 1e-8, `loading ${i + 1},${j + 1}`)));
  r.communalities.forEach((v, i) => near(v, REF.communalities[i], 1e-11, `communality ${i + 1}`));
  r.variance.forEach((v, j) => near(v.ss, REF.ss[j], 1e-8, `SS ${j + 1}`));
  near(r.variance[1].cumulative, (REF.ss[0] + REF.ss[1]) / 7, 1e-8, 'cumulative share');
  assert.ok(r.loadings.slice(0, 3).every(row => row[0] > 0.6 && Math.abs(row[1]) < 0.2), 'the first three items load on factor 1');
  assert.ok(r.loadings.slice(3, 6).every(row => row[1] > 0.6 && Math.abs(row[0]) < 0.2), 'the next three on factor 2');
});

test('the eigen-solver, varimax and the canonical form hold their invariants', () => {
  const m = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]], { values, vectors } = symmetricEigen(m);
  values.forEach((value, j) => m.forEach((row, i) => near(row.reduce((s, v, k) => s + v * vectors[k][j], 0), value * vectors[i][j], 1e-12, `Av = λv ${j}`)));
  near(values.reduce((s, v) => s + v, 0), 9, 1e-12, 'trace');
  const l = [[0.7, 0.3], [0.6, 0.4], [0.2, 0.8], [0.3, 0.7]], rotated = varimax(l);
  l.forEach((row, i) => near(rotated[i].reduce((s, v) => s + v * v, 0), row.reduce((s, v) => s + v * v, 0), 1e-12, `communality kept ${i}`));
  assert.deepEqual(canonical([[-0.1, -0.9], [-0.2, -0.8]]), [[0.9, 0.1], [0.8, 0.2]]);
});

test('it refuses rather than guesses', () => {
  assert.deepEqual(exploratoryFactors(columns.slice(0, 2)), { refused: 'too-few-items' });
  assert.deepEqual(exploratoryFactors(columns.map(c => c.slice(0, 7))), { refused: 'too-few-cases' });
  assert.deepEqual(exploratoryFactors([...columns, columns[0].map(() => 1)]), { refused: 'constant-item' });
  assert.deepEqual(exploratoryFactors(columns, 7), { refused: 'bad-factor-count' });
  assert.deepEqual(exploratoryFactors(columns, 0), { refused: 'bad-factor-count' });
});

test('a fit still creeping when the iterations run out is kept once settled, refused when not', () => {
  const r = correlationMatrix(columns);
  const kept = principalAxis(r, 2, 1e-12, 40), strict = principalAxis(r, 2, 1e-12, 3, 0);
  assert.ok(!('refused' in kept) && kept.iterations === 40, 'stopped at the cap, settled to within 1e-6');
  assert.deepEqual(strict, { refused: 'not-converged' });
});
