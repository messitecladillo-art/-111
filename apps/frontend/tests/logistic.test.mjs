import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { logisticRegression } from '../lib/logistic.ts';

// Seeded teaching-simulation data: a 0/1 choice driven by two numbers and a dummy; no respondents.
const random = seededRandom('logistic-test');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const n = 300, x1 = [], x2 = [], x3 = [], y = [];
for (let i = 0; i < n; i++) {
  const a = normal(), b = 2 + normal(), c = random() < 0.5 ? 1 : 0;
  const p = 1 / (1 + Math.exp(-(-1 + 0.9 * a + 0.4 * (b - 2) + 0.7 * c)));
  x1.push(a); x2.push(b); x3.push(c); y.push(random() < p ? 1 : 0);
}
const predictors = [{ name: 'x1', values: x1 }, { name: 'x2', values: x2 }, { name: 'x3', values: x3 }];
const near = (actual, expected, relative, label) => assert.ok(Math.abs(actual - expected) <= relative * Math.abs(expected), `${label}: ${actual} vs ${expected}`);

// Reference: statsmodels Logit(...).fit(tol=1e-14) and get_margeff(at='overall', method='dydx') on these exact data.
// statsmodels fits the null model iteratively; ours is the closed form, so the LR test agrees to about 1e-9.
const REF = {
  beta: [-1.3417457839239564, 0.8990674475326944, 0.18058091957674496, 0.9914734549865494],
  se: [0.3408960857337353, 0.14915605306419671, 0.13664040952965967, 0.26593564195114133],
  p: [8.287244272333652e-05, 1.6631278875916524e-09, 0.18630880971065833, 0.00019281722457804233],
  lo: [-2.009889834432756, 0.6067269554507237, -0.08722936193419159, 0.4702491745567733],
  hi: [-0.6736017334151566, 1.191407939614665, 0.4483912010876815, 1.5126977354163254],
  llf: -175.95328446181853, llnull: -203.05756404868367, llr: 54.20855917373029, llrP: 1.0128280451285632e-11, r2: 0.13348076794798347,
  ame: [0.18068010011279798, 0.03629024576201322, 0.19925037170210427], ameSe: [0.022716075747382172, 0.027192521194004914, 0.048821050225072396],
};

test('logit agrees with statsmodels: coefficients, tests, intervals, odds ratios and average marginal effects', () => {
  const r = logisticRegression(y, predictors);
  assert.ok(!('refused' in r));
  assert.equal(r.events, y.reduce((s, v) => s + v, 0));
  r.coefficients.forEach((c, i) => {
    near(c.estimate, REF.beta[i], 1e-12, `b${i}`);
    near(c.se, REF.se[i], 1e-12, `se${i}`);
    near(c.p, REF.p[i], 1e-10, `p${i}`);
    near(c.ci[0], REF.lo[i], 1e-12, `ci low ${i}`);
    near(c.ci[1], REF.hi[i], 1e-12, `ci high ${i}`);
    near(c.oddsRatio, Math.exp(REF.beta[i]), 1e-12, `OR ${i}`);
    near(c.oddsRatioCi[0], Math.exp(REF.lo[i]), 1e-12, `OR low ${i}`);
  });
  assert.equal(r.coefficients[0].ame, null);
  r.coefficients.slice(1).forEach((c, j) => { near(c.ame.value, REF.ame[j], 1e-12, `AME ${j}`); near(c.ame.se, REF.ameSe[j], 1e-12, `AME se ${j}`); });
  near(r.logLikelihood, REF.llf, 1e-12, 'log-likelihood');
  near(r.nullLogLikelihood, REF.llnull, 1e-9, 'null log-likelihood');
  near(r.lr.chi2, REF.llr, 1e-8, 'LR χ²');
  assert.equal(r.lr.df, 3);
  near(r.lr.p, REF.llrP, 1e-6, 'LR p');
  near(r.mcFaddenR2, REF.r2, 1e-8, 'McFadden R²');
});

test('it refuses rather than guesses, separation included', () => {
  assert.deepEqual(logisticRegression(y, []), { refused: 'no-predictors' });
  assert.deepEqual(logisticRegression(y.map(v => v * 2), predictors), { refused: 'not-binary' });
  assert.deepEqual(logisticRegression(y.map(() => 1), predictors), { refused: 'one-class' });
  assert.deepEqual(logisticRegression([0, 1, 0, 1], [{ name: 'a', values: [1, 2, 3, 4] }, { name: 'b', values: [4, 3, 2, 1] }, { name: 'c', values: [1, 1, 2, 2] }]), { refused: 'too-few-cases' });
  assert.deepEqual(logisticRegression(y, [...predictors, { name: 'x1 的两倍', values: x1.map(v => 2 * v) }]), { refused: 'collinear' });
  // x perfectly splits the outcome: the maximum-likelihood estimate does not exist.
  const xs = Array.from({ length: 40 }, (_, i) => i), split = xs.map(v => (v >= 20 ? 1 : 0));
  assert.deepEqual(logisticRegression(split, [{ name: 'x', values: xs }]), { refused: 'separation' });
});

test('a predictor in small units is not mistaken for separation', () => {
  // x1 in tenths: its coefficient is about 9, the same effect per standard deviation as before.
  const fit = logisticRegression(y, [{ name: 'x1', values: x1.map(v => v / 10) }, ...predictors.slice(1)]);
  assert.ok(!('refused' in fit), 'fitted, not refused');
  near(fit.coefficients[1].estimate, REF.beta[1] * 10, 1e-8, 'rescaled slope');
  // In thousandths the coefficient is about 900: e^β overflows, and the refusal names the units, not separation.
  assert.deepEqual(logisticRegression(y, [{ name: 'x1', values: x1.map(v => v / 1000) }, ...predictors.slice(1)]), { refused: 'extreme-units' });
});
