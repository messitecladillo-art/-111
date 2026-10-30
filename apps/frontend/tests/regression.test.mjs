import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { linearRegression } from '../lib/regression.ts';

// Seeded teaching-simulation data: three predictors (one a dummy), noise that grows with x1; no respondents.
const random = seededRandom('regression-ols');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const n = 150, x1 = [], x2 = [], x3 = [], y = [];
for (let i = 0; i < n; i++) {
  const a = 3 + normal(), b = 0.6 * a + normal() * 0.8, c = random() < 0.4 ? 1 : 0;
  x1.push(a); x2.push(b); x3.push(c); y.push(1 + 0.5 * a - 0.3 * b + 0.8 * c + normal() * (0.4 + 0.25 * Math.abs(a)));
}
const predictors = [{ name: 'x1', values: x1 }, { name: 'x2', values: x2 }, { name: 'x3', values: x3 }];
const near = (actual, expected, relative, label) => assert.ok(Math.abs(actual - expected) <= relative * Math.max(1e-300, Math.abs(expected)), `${label}: ${actual} vs ${expected}`);

// Reference: numpy.linalg.lstsq on the raw design, SEs from inv(XᵀX), scipy.stats t / F / χ² tails, VIF from
// auxiliary regressions and β from sample standard deviations, all on these exact data.
const REF = {
  beta: [-0.10406257655761247, 0.8635750758929482, -0.3502591125588102, 0.7146511517302805],
  se: [0.34061783085651154, 0.13216028856776063, 0.12810454154164014, 0.20184867645825333],
  p: [0.7604119579690061, 9.978934807162695e-10, 0.00702820192328639, 0.000536210478640865],
  lo: [-0.7772411464442643, 0.6023806638736589, -0.6034379665669397, 0.3157283971287421],
  hi: [0.5691159933290393, 1.1247694879122376, -0.0970802585506807, 1.1135739063318189],
  r2: 0.2839565356448479, adj: 0.2692433137745366, F: 19.29941233454934, fp: 1.3513224034341587e-10,
  vif: [1.855760118368742, 1.86718569781406, 1.016163356576899], std: [0.6233806313008202, -0.26164469714078437, 0.24994429105840557],
  lm: 7.059561536910519, bp: 0.07002338010889897, rse: 1.1771478343594706,
};

test('OLS agrees with an independent NumPy / SciPy computation on the same data', () => {
  const r = linearRegression(y, predictors);
  assert.ok(!('refused' in r));
  assert.deepEqual(r.coefficients.map(c => c.name), ['（截距）', 'x1', 'x2', 'x3']);
  r.coefficients.forEach((c, i) => {
    near(c.estimate, REF.beta[i], 1e-12, `b${i}`);
    near(c.se, REF.se[i], 1e-12, `se${i}`);
    near(c.p, REF.p[i], 1e-9, `p${i}`);
    near(c.ci[0], REF.lo[i], 1e-9, `ci low ${i}`);
    near(c.ci[1], REF.hi[i], 1e-9, `ci high ${i}`);
  });
  r.coefficients.slice(1).forEach((c, j) => { near(c.vif, REF.vif[j], 1e-12, `VIF ${j}`); near(c.standardized, REF.std[j], 1e-12, `β ${j}`); });
  assert.equal(r.coefficients[0].vif, null);
  near(r.r2, REF.r2, 1e-12, 'R²');
  near(r.adjustedR2, REF.adj, 1e-12, 'adjusted R²');
  near(r.f.value, REF.F, 1e-12, 'F');
  assert.deepEqual(r.f.df, [3, 146]);
  near(r.f.p, REF.fp, 1e-9, 'F p');
  near(r.residualSe, REF.rse, 1e-12, 'residual SE');
  near(r.breuschPagan.lm, REF.lm, 1e-12, 'Breusch–Pagan LM');
  near(r.breuschPagan.p, REF.bp, 1e-9, 'Breusch–Pagan p');
});

test('an exact line is recovered, and a single predictor matches the textbook slope', () => {
  const x = [1, 2, 3, 4, 5, 6], line = x.map(v => 2 + 3 * v + (v % 2 ? 0.01 : -0.01));
  const r = linearRegression(line, [{ name: 'x', values: x }]);
  near(r.coefficients[1].estimate, 3 - 0.03 / 17.5, 1e-12, 'slope: the alternating noise tilts it by Σ(x−x̄)e / Σ(x−x̄)²');
  near(r.coefficients[1].vif, 1, 1e-12, 'one predictor has VIF 1');
});

test('it refuses rather than guesses', () => {
  assert.deepEqual(linearRegression(y, []), { refused: 'no-predictors' });
  assert.deepEqual(linearRegression(y.slice(0, 5), predictors.map(p => ({ ...p, values: p.values.slice(0, 5) }))), { refused: 'too-few-cases' });
  assert.deepEqual(linearRegression(y.map(() => 4), predictors), { refused: 'constant-outcome' });
  assert.deepEqual(linearRegression(y, [...predictors, { name: '常数', values: y.map(() => 1) }]), { refused: 'constant-predictor' });
  assert.deepEqual(linearRegression(y, [...predictors, { name: 'x1 的两倍', values: x1.map(v => 2 * v) }]), { refused: 'collinear' });
});
