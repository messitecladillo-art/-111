import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { kmeans, silhouette, standardize } from '../lib/kmeans.ts';

// Seeded teaching-simulation data: three groups in three variables, on different scales; no respondents.
const random = seededRandom('kmeans-test');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const centres = [[2, 30, 1], [4, 60, 3], [3, 45, 5]];
const raw = Array.from({ length: 180 }, (_, i) => centres[i % 3].map((c, j) => c + normal() * [0.4, 6, 0.5][j]));
const rows = standardize(raw);
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

test('the clustering is the optimum scikit-learn finds, and its silhouette is scikit-learn’s', () => {
  // Reference on these exact standardized rows: sklearn KMeans (best of 50 starts, and our centres fed back in, which
  // keep every label and the inertia) and sklearn.metrics.silhouette_score / silhouette_samples.
  const fit = kmeans(rows, 3, { seed: 'demo' });
  assert.ok(!('refused' in fit));
  near(fit.inertia, 80.78603635476263, 1e-9, 'inertia');
  assert.deepEqual(fit.sizes, [60, 60, 60]);
  assert.ok(raw.every((_, i) => fit.assignments[i] === fit.assignments[i % 3]), 'each simulated group is one cluster');
  const s = silhouette(rows, fit.assignments);
  near(s.mean, 0.6111460956967544, 1e-12, 'mean silhouette');
  [0.6908598483149833, 0.5120321108731188, 0.6106320171983256, 0.7448987315008762, 0.5404878824680295].forEach((v, i) => near(s.perRow[i], v, 1e-12, `silhouette ${i}`));
});

test('the same seed gives the same clusters; clusters are numbered by size', () => {
  const a = kmeans(rows, 4, { seed: 'x' }), b = kmeans(rows, 4, { seed: 'x' });
  assert.deepEqual(a, b);
  assert.ok(a.sizes.every((s, i) => i === 0 || a.sizes[i - 1] >= s));
  assert.equal(a.sizes.reduce((s, v) => s + v, 0), 180);
  assert.ok(silhouette(rows, kmeans(rows, 3, { seed: 'x' }).assignments).mean > silhouette(rows, a.assignments).mean, 'the true k scores higher');
});

test('standardizing puts every column on one scale; refusals', () => {
  const z = standardize([[1, 100], [2, 200], [3, 300]]);
  assert.deepEqual(z.map(r => r.map(v => Math.round(v * 1e12) / 1e12)), [[-1, -1], [0, 0], [1, 1]]);
  assert.deepEqual(standardize([[5, 1], [5, 2]]).map(r => r[0]), [0, 0], 'a constant column becomes zeros');
  assert.deepEqual(kmeans([[1], [2]], 2), { refused: 'too-few-rows' });
  assert.deepEqual(kmeans(rows, 1), { refused: 'bad-k' });
  assert.deepEqual(kmeans(rows, 180), { refused: 'bad-k' });
  assert.deepEqual(kmeans([[1, 2], [1], [3, 4]], 2), { refused: 'uneven-rows' });
  assert.deepEqual(kmeans([[1, 1], [1, 1], [1, 1], [2, 2]], 3), { refused: 'too-few-distinct' });
  assert.deepEqual(silhouette([[0], [1], [5]], [0, 0, 1]).perRow[2], 0, 'a row alone in its cluster scores 0');
});
