import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { correlationMatrix, invert, kmoBand, logDeterminant, samplingAdequacy } from '../lib/psychometrics.ts';

// Seeded teaching-simulation items: one common factor plus noise, five-point codes; no respondents.
const random = seededRandom('psychometrics-kmo');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const loadings = [0.8, 0.75, 0.7, 0.6, 0.5, 0.3];
const rows = Array.from({ length: 200 }, () => { const f = normal(); return loadings.map(l => Math.min(5, Math.max(1, Math.round(3 + l * f + Math.sqrt(1 - l * l) * normal())))); });
const columns = loadings.map((_, j) => rows.map(r => r[j]));
const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('KMO, per-item MSA and Bartlett agree with an independent NumPy / SciPy computation on the same data', () => {
  // Reference: numpy.corrcoef, numpy.linalg.inv / slogdet and scipy.stats.chi2.sf on these exact columns.
  const a = samplingAdequacy(columns);
  assert.ok(!('refused' in a));
  assert.deepEqual([a.n, a.items], [200, 6]);
  close(a.kmo, 0.7851034866128449, 1e-12, 'KMO');
  [0.777489, 0.774032, 0.815102, 0.787811, 0.747389, 0.841996].forEach((m, i) => close(a.msa[i], m, 5e-7, `MSA ${i + 1}`));
  close(a.bartlett.chi2, 234.27831302293842, 1e-9, 'Bartlett χ²');
  assert.equal(a.bartlett.df, 15);
  close(a.bartlett.p / 2.1188902968300747e-41, 1, 1e-9, 'Bartlett p (relative)');
  close(a.logDeterminant, -1.1942819695306972, 1e-12, 'ln|R|');
  assert.equal(kmoBand(a.kmo), '中等');
});

test('the matrix helpers are exact on small cases', () => {
  const r = correlationMatrix([[1, 2, 3, 4], [2, 4, 6, 8.5], [4, 3, 2, 1]]);
  assert.equal(r[0][0], 1);
  close(r[0][2], -1, 1e-15, 'a reversed column');
  assert.equal(correlationMatrix([[1, 2, 3], [5, 5, 5]]), null, 'no variance, no correlation');
  const m = [[4, 2, 0.6], [2, 2, 0.5], [0.6, 0.5, 3]], inv = invert(m);
  m.forEach((row, i) => row.forEach((_, j) => close(row.reduce((s, v, k) => s + v * inv[k][j], 0), i === j ? 1 : 0, 1e-12, `M·M⁻¹ ${i}${j}`)));
  close(logDeterminant(m), Math.log(4 * (2 * 3 - 0.25) - 2 * (2 * 3 - 0.3) + 0.6 * (1 - 1.2)), 1e-12, 'ln det');
  assert.equal(logDeterminant([[1, 1], [1, 1]]), null, 'singular is not positive definite');
  assert.equal(invert([[1, 2], [2, 4]]), null);
});

test('it refuses rather than guesses', () => {
  assert.deepEqual(samplingAdequacy(columns.slice(0, 2)), { refused: 'too-few-items' });
  assert.deepEqual(samplingAdequacy(columns.map(c => c.slice(0, 6))), { refused: 'too-few-cases' });
  assert.deepEqual(samplingAdequacy([...columns, columns[0].map(() => 3)]), { refused: 'constant-item' });
  assert.deepEqual(samplingAdequacy([...columns, columns[0]]), { refused: 'singular' }, 'a duplicated item');
  assert.deepEqual([0.95, 0.85, 0.75, 0.65, 0.55, 0.4].map(kmoBand), ['极好', '良好', '中等', '一般', '较差', '不可接受']);
});
