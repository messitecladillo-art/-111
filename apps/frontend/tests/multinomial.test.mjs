import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { multinomialRegression } from '../lib/multinomial.ts';

// Seeded teaching-simulation data: a three-way choice driven by two numbers and a dummy; no respondents.
const random = seededRandom('multinomial-test');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const n = 400, x1 = [], x2 = [], x3 = [], y = [];
for (let i = 0; i < n; i++) {
  const a = normal(), b = 3 + normal(), c = random() < 0.4 ? 1 : 0;
  const e1 = Math.exp(-0.3 + 0.8 * a + 0.2 * (b - 3)), e2 = Math.exp(0.2 - 0.6 * a + 0.9 * c), u = random() * (1 + e1 + e2);
  y.push(u < 1 ? 1 : u < 1 + e1 ? 2 : 3); x1.push(a); x2.push(b); x3.push(c);
}
const predictors = [{ name: 'x1', values: x1 }, { name: 'x2', values: x2 }, { name: 'x3', values: x3 }];
const near = (actual, expected, relative, label) => assert.ok(Math.abs(actual - expected) <= relative * Math.abs(expected), `${label}: ${actual} vs ${expected}`);

// Reference: statsmodels MNLogit(...).fit(method='newton', tol=1e-14) on these exact data (outcome codes 1, 2, 3).
// statsmodels fits the null model iteratively; ours is the closed form, so the null fit and LR test agree to about 1e-9.
const REF = {
  beta: [[-1.4182436406784282, 0.8678414865681895, 0.3868106163041475, 0.20443598911549996], [0.3316871605714609, -0.5655733019305561, 0.021428002439998955, 0.7552443117446872]],
  se: [[0.4951771109970276, 0.17949076386137605, 0.147786148178863, 0.3125443959456672], [0.39373708252254314, 0.15260967690178023, 0.12609071673464062, 0.26979485920357593]],
  p: [[0.004181776287613313, 1.3313204983570327e-06, 0.00886109616559431, 0.513045939206862], [0.3995597695578059, 0.00021054828399543014, 0.8650564123115368, 0.005120908564475031]],
  llf: -360.29239334111395, llnull: -414.624297990266, llr: 108.66380929830405, llrP: 3.881652844811151e-21, r2: 0.13103888245938633, counts: [92, 107, 201],
};

test('multinomial logit agrees with statsmodels: coefficients, standard errors, tests and fit', () => {
  const fit = multinomialRegression(y, predictors);
  assert.ok(!('refused' in fit), JSON.stringify(fit));
  assert.equal(fit.reference, 1, 'the lowest code is the reference');
  assert.deepEqual(fit.categories, [{ code: 1, count: 92 }, { code: 2, count: 107 }, { code: 3, count: 201 }]);
  assert.deepEqual(fit.equations.map(e => e.code), [2, 3]);
  fit.equations.forEach((equation, j) => equation.coefficients.forEach((c, a) => {
    near(c.estimate, REF.beta[j][a], 1e-9, `β ${j},${a}`);
    near(c.se, REF.se[j][a], 1e-8, `SE ${j},${a}`);
    near(c.p, REF.p[j][a], 1e-6, `p ${j},${a}`);
    near(c.rrr, Math.exp(REF.beta[j][a]), 1e-9, `RRR ${j},${a}`);
    assert.ok(c.rrrCi[0] < c.rrr && c.rrr < c.rrrCi[1]);
  }));
  near(fit.logLikelihood, REF.llf, 1e-12, 'log-likelihood');
  near(fit.nullLogLikelihood, REF.llnull, 1e-9, 'null log-likelihood');
  near(fit.lr.chi2, REF.llr, 1e-9, 'LR χ²');
  assert.equal(fit.lr.df, 6);
  near(fit.lr.p, REF.llrP, 1e-6, 'LR p');
  near(fit.mcFaddenR2, REF.r2, 1e-9, 'McFadden R²');
});

test('it refuses rather than guesses', () => {
  assert.deepEqual(multinomialRegression(y, []), { refused: 'no-predictors' });
  assert.deepEqual(multinomialRegression(y.map(v => (v === 3 ? 2 : v)), predictors), { refused: 'two-classes' });
  assert.deepEqual(multinomialRegression(y.map((_, i) => i % 9), predictors), { refused: 'too-many-categories' });
  assert.deepEqual(multinomialRegression(y.slice(0, 10), predictors.map(p => ({ ...p, values: p.values.slice(0, 10) }))), { refused: 'too-few-cases' });
  assert.deepEqual(multinomialRegression(y, [...predictors, { name: 'copy', values: x1.map(v => 2 * v) }]), { refused: 'collinear' });
  // x1 decides the category outright: the estimates would run off to infinity.
  assert.deepEqual(multinomialRegression(x1.map(v => (v < -0.5 ? 1 : v < 0.5 ? 2 : 3)), predictors), { refused: 'separation' });
});

test('a predictor in small units is not mistaken for separation', () => {
  const fit = multinomialRegression(y, [{ name: 'x1', values: x1.map(v => v / 1000) }, ...predictors.slice(1)]);
  assert.ok(!('refused' in fit));
  near(fit.equations[0].coefficients[1].estimate, REF.beta[0][1] * 1000, 1e-8, 'rescaled slope');
});

test('a predictor with a large offset is solved as well as a centred one, not refused as collinear', () => {
  const fit = multinomialRegression(y, [predictors[0], { name: 'x2', values: x2.map(v => 1e6 + v) }, predictors[2]]);
  assert.ok(!('refused' in fit), JSON.stringify(fit));
  fit.equations.forEach((equation, j) => [1, 2, 3].forEach(a => {
    near(equation.coefficients[a].estimate, REF.beta[j][a], 1e-6, `β ${j},${a}`);
    near(equation.coefficients[a].se, REF.se[j][a], 1e-6, `SE ${j},${a}`);
  }));
  assert.deepEqual(multinomialRegression(y, [...predictors, { name: 'constant', values: y.map(() => 4) }]), { refused: 'collinear' });
});
