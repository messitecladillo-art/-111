import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { meanOf, seededRandom, randomNormal, texNum, varianceOf, zCritical } from '../lib/sampling-core.ts';
import { auxiliaryEstimators, clusterSample, hansenHurwitz, horvitzThompson, postStratified, randomizedResponse, ratioOfMeans, srsMean, srsProportion, stratifiedMean, stratifiedProportion, stratifiedRatio, systematicEstimate, twoPhaseAuxiliary, twoPhaseStratified, twoStage } from '../lib/sampling-estimators.ts';
import { allocationGains, clusterPlan, cumRootF, nonresponsePlan, rrPlan, stratifiedSampleSize, twoGroupPlan, twoPhasePlan, twoStagePlan } from '../lib/sampling-planning.ts';
import { equalProbabilityInclusion, frameTable, groupIsProbability, groupStatement, selectPpsSystematic, selectPpsWithReplacement, selectSrs, selectStratified, selectSystematic } from '../lib/sampling-selection.ts';
import { designEstimate, describeDesign } from '../lib/sampling-variance.ts';
import { classAdjust, kish, postStratify, rake, trimWeights } from '../lib/sampling-weights.ts';

// Reference values produced by R survey 4.5 and sampling 2.11 (tools/build-sampling-reference.R).
const ref = JSON.parse(readFileSync(new URL('./fixtures/sampling-reference.json', import.meta.url), 'utf8'));
const rel = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${label}: ${a} vs ${b}`);
const designRows = (rows, y = 'y') => rows.map(r => ({ y: r[y], w: r.w ?? 1, stratum: r.h ?? 'all', psu: r.psu, inDomain: r.dom === undefined ? true : r.dom === 1 }));
const combinations = (items, k) => k === 0 ? [[]] : items.flatMap((x, i) => combinations(items.slice(i + 1), k - 1).map(c => [x, ...c]));

test('critical values and TeX numbers', () => {
  rel(zCritical(0.95), 1.959963984540054, 1e-12, 'z 0.95');
  rel(zCritical(0.9), 1.6448536269514722, 1e-12, 'z 0.90');
  assert.equal(texNum(12000), '12{,}000');
  assert.equal(texNum(384.14588, 5), '384.15');
  assert.equal(texNum(0.05), '0.05');
  assert.equal(texNum(-1234.5), '-1{,}235');
  assert.equal(texNum(0.000001), '1\\times 10^{-6}');
});

test('weighted stratified cluster designs match R survey: linearization, deff, logit interval, domain, fpc', () => {
  const c = ref.complex, rows = designRows(c.rows);
  const all = rows.map(r => ({ ...r, inDomain: true }));
  const mean = designEstimate(all, { statistic: 'mean', confidence: 0.95, method: 'linearization' });
  rel(mean.estimate, c.mean.estimate, 1e-12, 'mean'); rel(mean.se, c.mean.se, 1e-10, 'mean se'); rel(mean.deff, c.mean.deff, 1e-9, 'mean deff');
  assert.equal(mean.df, c.df);
  const total = designEstimate(all, { statistic: 'total', confidence: 0.95, method: 'linearization' });
  rel(total.estimate, c.total.estimate, 1e-12, 'total'); rel(total.se, c.total.se, 1e-10, 'total se');
  const prop = designEstimate(designRows(c.rows, 'yb').map(r => ({ ...r, inDomain: true })), { statistic: 'mean', confidence: 0.95, method: 'linearization' });
  rel(prop.se, c.proportion.se, 1e-10, 'prop se'); rel(prop.deff, c.proportion.deff, 1e-9, 'prop deff');
  rel(prop.logitCi.lower, c.proportion.logit[0], 1e-8, 'logit lower'); rel(prop.logitCi.upper, c.proportion.logit[1], 1e-8, 'logit upper');
  const domain = designEstimate(rows, { statistic: 'mean', confidence: 0.95, method: 'linearization' });
  rel(domain.estimate, c.domain.estimate, 1e-12, 'domain'); rel(domain.se, c.domain.se, 1e-10, 'domain se'); rel(domain.deff, c.domain.deff, 1e-9, 'domain deff');
  const jk = designEstimate(all, { statistic: 'mean', confidence: 0.95, method: 'jackknife' });
  rel(jk.se, c.jackknife.mean, 1e-10, 'JKn mean'); rel(designEstimate(all, { statistic: 'total', confidence: 0.95, method: 'jackknife' }).se, c.jackknife.total, 1e-10, 'JKn total');
  rel(designEstimate(all, { statistic: 'mean', confidence: 0.95, method: 'linearization', fpc: c.fpc }).se, c.fpcMean, 1e-10, 'fpc');
  const summary = describeDesign(all);
  assert.equal(summary.strata, 4); assert.equal(summary.df, c.df);
});

test('BRR and Fay reproduce linearization exactly for totals and closely for means', () => {
  const b = ref.brr, rows = designRows(b.rows);
  for (const fay of [0, 0.5]) {
    const t = designEstimate(rows, { statistic: 'total', confidence: 0.95, method: 'brr', fay });
    rel(t.se, b.linearTotal, 1e-10, `fay ${fay} total`); rel(t.se, fay ? b.fayTotal : b.brrTotal, 1e-10, 'R total');
    const m = designEstimate(rows, { statistic: 'mean', confidence: 0.95, method: 'brr', fay });
    rel(m.se, fay ? b.fayMean : b.brrMean, 0.05, `fay ${fay} mean`);
    assert.equal(t.replicates, 8);
  }
  assert.throws(() => designEstimate(designRows(ref.complex.rows), { statistic: 'mean', confidence: 0.95, method: 'brr' }), /恰好 2 个/);
});

test('bootstrap and random groups agree with linearization within their Monte Carlo error', () => {
  const rows = designRows(ref.complex.rows).map(r => ({ ...r, inDomain: true }));
  const lin = designEstimate(rows, { statistic: 'mean', confidence: 0.95, method: 'linearization' }).se;
  const boot = designEstimate(rows, { statistic: 'mean', confidence: 0.95, method: 'bootstrap', replicates: 4000, seed: 'test' });
  rel(boot.se, lin, 0.08, 'bootstrap');
  assert.equal(boot.se, designEstimate(rows, { statistic: 'mean', confidence: 0.95, method: 'bootstrap', replicates: 4000, seed: 'test' }).se);
  const groups = designEstimate(rows, { statistic: 'mean', confidence: 0.95, method: 'random-groups', groups: 8, seed: 'g' });
  assert.ok(groups.se > lin / 3 && groups.se < lin * 3); assert.equal(groups.df, 7);
  assert.throws(() => designEstimate([{ y: 1, w: 1, stratum: 'a', psu: '1' }, { y: 2, w: 1, stratum: 'b', psu: '2' }], { statistic: 'mean', confidence: 0.95, method: 'linearization' }), /只有 1 个初级单元/);
});

test('cluster, two-stage, stratified, ratio and GREG estimators match R survey', () => {
  const cl = clusterSample(ref.cluster.rows.map(r => ({ cluster: r.cl, y: r.y })), { N: ref.cluster.N, Mbar: null, confidence: 0.95 });
  rel(cl.mean.value, ref.cluster.mean, 1e-12, 'cluster mean'); rel(cl.mean.se, ref.cluster.se, 1e-10, 'cluster se');
  const ts = twoStage(ref.twoStage.rows, { N: ref.twoStage.N, M: ref.twoStage.M, confidence: 0.95 });
  rel(ts.mean.value, ref.twoStage.mean, 1e-12, 'two-stage mean'); rel(ts.mean.se, ref.twoStage.se, 1e-10, 'two-stage se');
  const strata = [...new Set(ref.stratified.rows.map(r => r.h))].map(h => { const ys = ref.stratified.rows.filter(r => r.h === h).map(r => r.y); return { name: h, N: ref.stratified.rows.find(r => r.h === h).Nh, n: ys.length, mean: meanOf(ys), sd: Math.sqrt(varianceOf(ys)) }; });
  const st = stratifiedMean(strata, { confidence: 0.95 });
  rel(st.mean.value, ref.stratified.mean, 1e-12, 'st mean'); rel(st.mean.se, ref.stratified.se, 1e-10, 'st se');
  rel(st.total.value, ref.stratified.total, 1e-12, 'st total'); rel(st.total.se, ref.stratified.totalSe, 1e-10, 'st total se');
  const pairs = ref.ratio.rows;
  const r = ratioOfMeans(pairs, { N: ref.ratio.N, confidence: 0.95 });
  rel(r.R.value, ref.ratio.R, 1e-12, 'ratio'); rel(r.R.se, ref.ratio.seR, 1e-10, 'ratio se');
  const aux = auxiliaryEstimators(pairs, { N: ref.ratio.N, Xbar: ref.ratio.Xbar, confidence: 0.95 });
  rel(aux.regression.value, ref.ratio.greg, 1e-10, 'GREG = regression estimator');
  // R uses g-weighted residuals over n − 1 (Särndal, Swensson & Wretman 1989); the textbook formula divides
  // the plain residual sum of squares by n − 2. Both are consistent; at n = 25 they differ by about 2%.
  rel(aux.regression.se, ref.ratio.gregSe, 0.03, 'GREG se');
  assert.ok(aux.regression.se > ref.ratio.gregSe, 'the textbook divisor is the more conservative one');
});

test('raking, post-stratification and πps inclusion probabilities match R', () => {
  const w = ref.weights, base = w.rows.map(r => r.w);
  const raked = rake([{ name: '性别', values: w.rows.map(r => r.sex), targets: w.sexTargets }, { name: '年龄', values: w.rows.map(r => r.age), targets: w.ageTargets }], base, { tolerance: 1e-12, maxIterations: 500 });
  assert.ok(raked.converged);
  raked.weights.forEach((x, i) => rel(x, w.raked[i], 1e-8, `raked ${i}`));
  postStratify(w.rows.map(r => r.age), base, w.ageTargets).weights.forEach((x, i) => rel(x, w.post[i], 1e-12, `post ${i}`));
  const pps = selectPpsSystematic(ref.pips.sizes.map((size, i) => ({ name: `U${i}`, size })), ref.pips.n, 'seed');
  pps.inclusion.forEach((p, i) => rel(p, ref.pips.pik[i], 1e-12, `pik ${i}`));
  assert.equal(pps.selected.length, ref.pips.n); assert.equal(pps.certainty, 1);
});

test('two-group sample sizes agree with R power.prop.test and power.t.test', () => {
  assert.equal(twoGroupPlan({ kind: 'proportion', p1: 0.3, p2: 0.45, alpha: 0.05, power: 0.8, ratio: 1 }).n1, Math.ceil(ref.power.prop));
  assert.equal(twoGroupPlan({ kind: 'mean', delta: 0.5, sd: 1, alpha: 0.05, power: 0.8, ratio: 1 }).n1, Math.ceil(ref.power.mean));
});

test('SRS estimators are exactly unbiased over every possible sample', () => {
  const Y = [3, 7, 8, 12, 15, 21], N = Y.length, n = 3, Ybar = meanOf(Y), S2 = varianceOf(Y), V = (1 - n / N) * S2 / n;
  const samples = combinations(Y, n), results = samples.map(s => srsMean(s, { N, confidence: 0.95 }));
  rel(meanOf(results.map(r => r.mean.value)), Ybar, 1e-12, 'E(ȳ)');
  rel(meanOf(results.map(r => r.mean.variance)), V, 1e-12, 'E(v)');
  rel(meanOf(results.map(r => (r.mean.value - Ybar) ** 2)), V, 1e-12, 'V(ȳ)');
  const p = srsProportion({ a: 12, n: 40, N: 400, confidence: 0.95 });
  rel(p.p.variance, (1 - 0.1) * 0.3 * 0.7 / 39, 1e-12, 'v(p)');
  assert.ok(srsProportion({ a: 2, n: 30, N: null, confidence: 0.95 }).warnings.some(x => x.includes('Wilson')));
});

test('stratified estimators are exactly unbiased over every possible stratified sample', () => {
  const A = [2, 5, 9, 10], B = [20, 26, 31], all = [...A, ...B], Ybar = meanOf(all);
  const V = (4 / 7) ** 2 * (1 - 2 / 4) * varianceOf(A) / 2 + (3 / 7) ** 2 * (1 - 2 / 3) * varianceOf(B) / 2;
  const results = combinations(A, 2).flatMap(a => combinations(B, 2).map(b => stratifiedMean([
    { name: 'A', N: 4, n: 2, mean: meanOf(a), sd: Math.sqrt(varianceOf(a)) }, { name: 'B', N: 3, n: 2, mean: meanOf(b), sd: Math.sqrt(varianceOf(b)) },
  ], { confidence: 0.95 })));
  rel(meanOf(results.map(r => r.mean.value)), Ybar, 1e-12, 'E(ȳst)');
  rel(meanOf(results.map(r => r.mean.variance)), V, 1e-12, 'E(v)');
  const pr = stratifiedProportion([{ name: '男', N: 500, n: 50, p: 0.4 }, { name: '女', N: 700, n: 60, p: 0.55 }], { confidence: 0.95 });
  rel(pr.mean.value, (500 * 0.4 + 700 * 0.55) / 1200, 1e-12, 'p_st');
  rel(pr.mean.variance, (5 / 12) ** 2 * 0.9 * 0.24 / 49 + (7 / 12) ** 2 * (1 - 60 / 700) * 0.2475 / 59, 1e-12, 'v(p_st)');
  assert.match(pr.steps[1].tex, /^p_\{st\}/);
});

test('Hansen–Hurwitz is exactly unbiased with an unbiased variance estimator; systematic samples average to the mean', () => {
  const Y = [10, 30, 60], p = [0.2, 0.3, 0.5], total = 100;
  const V = p.reduce((s, pi, i) => s + pi * (Y[i] / pi - total) ** 2, 0) / 2;
  let e = 0, ev = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const r = hansenHurwitz([{ y: Y[i], p: p[i] }, { y: Y[j], p: p[j] }], { N: null, confidence: 0.95 });
    e += p[i] * p[j] * r.total.value; ev += p[i] * p[j] * r.total.variance;
  }
  rel(e, total, 1e-12, 'E(HH)'); rel(ev, V, 1e-12, 'E(v)');
  const pop = [4, 9, 2, 7, 5, 8, 1, 6, 3, 10, 12, 11], k = 4;
  rel(meanOf(Array.from({ length: k }, (_, r) => systematicEstimate(pop.filter((_, i) => i % k === r), { N: 12, confidence: 0.95 }).mean.value)), meanOf(pop), 1e-12, 'E(ȳsy)');
  const ht = horvitzThompson([{ y: 50, pi: 0.5 }, { y: 30, pi: 0.25 }, { y: 12, pi: 0.1 }], { N: null, confidence: 0.95 });
  rel(ht.total.value, 340, 1e-12, 'HT total');
});

test('ratio, regression and cluster estimators behave as the approximations promise (Monte Carlo)', () => {
  const rand = seededRandom('ratio-pop'), N = 2000;
  const X = Array.from({ length: N }, () => 20 + 60 * rand()), Y = X.map(x => 5 + 2 * x + 8 * randomNormal(rand));
  const Xbar = meanOf(X), Ybar = meanOf(Y), n = 60, reps = 3000, est = { ratio: [], reg: [] }, vs = { ratio: [], reg: [] };
  for (let r = 0; r < reps; r++) {
    const idx = selectSrs(N, n, `s${r}`), pairs = idx.map(i => ({ x: X[i - 1], y: Y[i - 1] }));
    const a = auxiliaryEstimators(pairs, { N, Xbar, confidence: 0.95 });
    est.ratio.push(a.ratio.value); est.reg.push(a.regression.value); vs.ratio.push(a.ratio.variance); vs.reg.push(a.regression.variance);
  }
  for (const k of ['ratio', 'reg']) {
    const empirical = varianceOf(est[k]);
    assert.ok(Math.abs(meanOf(est[k]) - Ybar) < 4 * Math.sqrt(empirical / reps), `${k} bias`);
    rel(meanOf(vs[k]), empirical, 0.12, `${k} variance`);
  }
});

test('two-phase estimators: variance estimators track the true variance (Monte Carlo)', () => {
  const rand = seededRandom('two-phase'), N = 4000;
  const X = Array.from({ length: N }, () => 10 + 40 * rand()), Y = X.map(x => 3 + 1.5 * x + 6 * randomNormal(rand)), cls = X.map(x => x < 25 ? 'low' : 'high');
  const Ybar = meanOf(Y), reps = 2500, n1 = 400, st = [], stV = [], ra = [], raV = [], rg = [], rgV = [];
  for (let r = 0; r < reps; r++) {
    const phase1 = selectSrs(N, n1, `p1-${r}`).map(i => i - 1);
    const counts = { low: phase1.filter(i => cls[i] === 'low').length, high: phase1.filter(i => cls[i] === 'high').length };
    const rows = [];
    for (const [h, rate] of [['low', 0.3], ['high', 0.5]]) {
      const members = phase1.filter(i => cls[i] === h), take = Math.max(2, Math.round(members.length * rate));
      selectSrs(members.length, take, `p2-${r}-${h}`).forEach(j => rows.push({ stratum: h, y: Y[members[j - 1]] }));
    }
    const ds = twoPhaseStratified([{ name: 'low', count: counts.low }, { name: 'high', count: counts.high }], rows, { N, confidence: 0.95 });
    st.push(ds.mean.value); stV.push(ds.mean.variance);
    const sub = selectSrs(n1, 80, `p3-${r}`).map(j => phase1[j - 1]);
    const aux = twoPhaseAuxiliary({ n1, xbar1: meanOf(phase1.map(i => X[i])) }, sub.map(i => ({ x: X[i], y: Y[i] })), { N, confidence: 0.95 });
    ra.push(aux.ratio.value); raV.push(aux.ratio.variance); rg.push(aux.regression.value); rgV.push(aux.regression.variance);
  }
  for (const [label, e, v, tol] of [['double stratification', st, stV, 0.1], ['double ratio', ra, raV, 0.15], ['double regression', rg, rgV, 0.15]]) {
    const empirical = varianceOf(e);
    assert.ok(Math.abs(meanOf(e) - Ybar) < 4 * Math.sqrt(empirical / reps), `${label} bias`);
    rel(meanOf(v), empirical, tol, `${label} variance`);
  }
});

test('randomized response designs recover the sensitive share with honest variances (Monte Carlo)', () => {
  const pi = 0.18, n = 400, reps = 3000;
  const designs = [{ model: 'warner', p: 0.75 }, { model: 'unrelated', p: 0.7, piU: 0.25 }, { model: 'forced', truth: 0.75, forcedYes: 1 / 6 }];
  for (const design of designs) {
    const rand = seededRandom(`rr-${design.model}`), est = [], vs = [];
    for (let r = 0; r < reps; r++) {
      let yes = 0;
      for (let i = 0; i < n; i++) {
        const sensitive = rand() < pi, u = rand();
        if (design.model === 'warner') yes += (u < design.p ? sensitive : !sensitive) ? 1 : 0;
        else if (design.model === 'unrelated') yes += (u < design.p ? sensitive : rand() < design.piU) ? 1 : 0;
        else yes += (u < design.truth ? sensitive : u < design.truth + design.forcedYes) ? 1 : 0;
      }
      const res = randomizedResponse(design, { n, yes, confidence: 0.95 });
      est.push(res.raw); vs.push(res.pi.variance);
    }
    const empirical = varianceOf(est);
    assert.ok(Math.abs(meanOf(est) - pi) < 4 * Math.sqrt(empirical / reps), `${design.model} bias`);
    rel(meanOf(vs), empirical, 0.1, `${design.model} variance`);
  }
  const warner = randomizedResponse({ model: 'warner', p: 0.7 }, { n: 500, yes: 190, confidence: 0.95 });
  rel(warner.lambda, 0.38, 1e-12, 'λ'); rel(warner.raw, (0.38 - 0.3) / 0.4, 1e-12, 'π̂');
  assert.ok(warner.jeopardy.yes > 0 && warner.jeopardy.yes < 1);
  assert.throws(() => randomizedResponse({ model: 'warner', p: 0.5 }, { n: 10, yes: 3, confidence: 0.95 }), /不等于 0.5/);
});

test('selection procedures give the stated inclusion probabilities', () => {
  const reps = 20000, srsHits = new Array(8).fill(0), sysHits = new Array(10).fill(0);
  for (let r = 0; r < reps; r++) {
    selectSrs(8, 3, `a${r}`).forEach(i => srsHits[i - 1]++);
    const s = selectSystematic(10, 3, `b${r}`);
    assert.equal(new Set(s.positions).size, 3);
    s.positions.forEach(i => sysHits[i - 1]++);
  }
  srsHits.forEach(h => assert.ok(Math.abs(h / reps - 3 / 8) < 0.015));
  sysHits.forEach(h => assert.ok(Math.abs(h / reps - 0.3) < 0.015));
  const integer = selectSystematic(12, 3, 'x');
  assert.ok(Number.isInteger(integer.start) && integer.start >= 1 && integer.start <= 4);
  assert.deepEqual(integer.positions, [integer.start, integer.start + 4, integer.start + 8]);
  const units = [{ name: 'a', size: 5 }, { name: 'b', size: 15 }, { name: 'c', size: 30 }, { name: 'd', size: 50 }];
  for (const method of ['cumulative', 'lahiri']) {
    const counts = [0, 0, 0, 0];
    selectPpsWithReplacement(units, reps, `pps-${method}`, method).draws.forEach(d => counts[d.index]++);
    counts.forEach((c, i) => assert.ok(Math.abs(c / reps - units[i].size / 100) < 0.012, `${method} ${i}`));
  }
  const sizes = [120, 40, 75, 30, 90, 55, 210, 65, 45, 100], hits = new Array(sizes.length).fill(0), frame = sizes.map((size, i) => ({ name: `U${i}`, size }));
  let pis;
  for (let r = 0; r < reps; r++) { const s = selectPpsSystematic(frame, 3, `c${r}`); pis = s.inclusion; s.selected.forEach(u => hits[u.index]++); }
  hits.forEach((h, i) => assert.ok(Math.abs(h / reps - pis[i]) < 0.015, `πps ${i}`));
  const strat = selectStratified([{ name: '甲', N: 50, n: 5 }, { name: '乙', N: 30, n: 4 }], 's');
  assert.deepEqual(strat.map(s => s.positions.length), [5, 4]);
  assert.deepEqual(selectSrs(100, 10, 'same'), selectSrs(100, 10, 'same'));
});

test('stratified sample size reaches the precision target; census strata and costs are handled', () => {
  const strata = [{ id: 'a', name: '甲', size: 400, sd: 10 }, { id: 'b', name: '乙', size: 300, sd: 20 }, { id: 'c', name: '丙', size: 300, sd: 30 }];
  const ney = stratifiedSampleSize(strata, 'neyman', { kind: 'margin', margin: 2, confidence: 0.95 });
  const V = (2 / zCritical(0.95)) ** 2;
  rel(ney.nExact, 19 ** 2 / (V + 430 / 1000), 1e-12, 'Neyman n');
  assert.equal(ney.rows.reduce((s, r) => s + r.allocation, 0), ney.n);
  assert.ok(ney.achievedMargin <= 2 * 1.01);
  const prop = stratifiedSampleSize(strata, 'proportional', { kind: 'margin', margin: 2, confidence: 0.95 });
  rel(prop.nExact, 430 / (V + 0.43), 1e-12, 'proportional n');
  assert.ok(prop.n > ney.n);
  const costly = strata.map((s, i) => ({ ...s, cost: [1, 4, 9][i] }));
  const opt = stratifiedSampleSize(costly, 'optimal', { kind: 'variance', V }), neyCost = stratifiedSampleSize(costly, 'neyman', { kind: 'variance', V });
  assert.ok(opt.cost < neyCost.cost, `optimal ${opt.cost} vs neyman ${neyCost.cost}`);
  const small = stratifiedSampleSize([{ id: 'a', name: '少数层', size: 20, sd: 100 }, { id: 'b', name: '多数层', size: 2000, sd: 5 }], 'neyman', { kind: 'margin', margin: 0.5, confidence: 0.95 });
  assert.deepEqual(small.census, ['少数层']); assert.equal(small.rows[0].allocation, 20);
  const gains = allocationGains([{ id: 'a', name: '甲', size: 400, sd: 10, mean: 50 }, { id: 'b', name: '乙', size: 300, sd: 20, mean: 60 }, { id: 'c', name: '丙', size: 300, sd: 30, mean: 80 }], 200);
  assert.ok(gains.Vsrs > gains.Vprop && gains.Vprop > gains.Vneyman);
});

test('cumulative √f boundaries beat equal-count strata on a skewed variable', () => {
  const rand = seededRandom('skew'), values = Array.from({ length: 3000 }, () => Math.exp(3 + 0.9 * randomNormal(rand)));
  const r = cumRootF(values, 4);
  assert.equal(r.boundaries.length, 3);
  assert.ok(r.boundaries.every((b, i) => i === 0 || b > r.boundaries[i - 1]));
  assert.equal(r.strata.reduce((s, x) => s + x.count, 0), 3000);
  assert.ok(r.objective < r.quantileObjective, `${r.objective} vs ${r.quantileObjective}`);
  assert.ok(r.objective < 3000 * Math.sqrt(varianceOf(values)));
});

test('cluster, two-stage, two-phase, nonresponse and randomized-response plans', () => {
  const c = clusterPlan({ nSrs: 385, rho: 0.05, mbar: 20 });
  rel(c.deff, 1.95, 1e-12, 'deff'); assert.equal(c.elements, 751); assert.equal(c.clusters, 38);
  rel(clusterPlan({ nSrs: 385, rho: 0.05, mbar: 20, cv: 0.5 }).deff, 1 + (1.25 * 20 - 1) * 0.05, 1e-12, 'unequal deff');
  const ts = twoStagePlan({ components: { S: 10, rho: 0.1 }, M: 50, N: null, c1: 100, c2: 10, constraint: { kind: 'budget', budget: 5000 } });
  rel(ts.mExact, Math.sqrt(90), 1e-12, 'm opt'); assert.equal(ts.m, 9); assert.equal(ts.n, 26);
  rel(ts.V, 20 / 26, 1e-12, 'V'); rel(ts.deff, 1 + 8 * 0.1, 1e-12, 'deff = 1 + (m−1)ρ');
  const tsp = twoStagePlan({ components: { S1: 11.8, S2: 90 }, M: 50, N: 400, c1: 100, c2: 10, constraint: { kind: 'precision', target: { kind: 'margin', margin: 1, confidence: 0.95 } } });
  assert.ok(tsp.margin <= 1 + 1e-9);
  const tp = twoPhasePlan({ rho: 0.8, c: 10, c1: 1, Sy: 1, budget: 1000 });
  assert.ok(tp.useful && tp.n1 > tp.n && tp.V < tp.Vsrs);
  rel(tp.condition, 40 / 121, 1e-12, 'condition');
  assert.equal(twoPhasePlan({ rho: 0.3, c: 10, c1: 5, Sy: 1, budget: 1000 }).useful, false);
  const nr = nonresponsePlan({ S2: 100, S2nr: 150, W2: 0.4, c0: 1, c1: 4, c2: 45, target: { kind: 'margin', margin: 1.5, confidence: 0.95 }, N: null });
  rel(nr.k, 1.88, 1e-12, 'k'); assert.equal(nr.n, Math.ceil((100 + 0.88 * 0.4 * 150) / (1.5 / zCritical(0.95)) ** 2 - 1e-9));
  const rr = rrPlan({ model: 'warner', p: 0.7 }, { pi: 0.2, margin: 0.05, confidence: 0.95 });
  assert.equal(rr.n, Math.ceil(zCritical(0.95) ** 2 * 0.38 * 0.62 / (0.0025 * 0.16) - 1e-9));
  assert.equal(rr.nDirect, Math.ceil(zCritical(0.95) ** 2 * 0.16 / 0.0025 - 1e-9));
});

test('weights: Kish effective size, class adjustment and trimming keep their invariants', () => {
  const k = kish([1, 1, 2, 4]);
  rel(k.nEff, 64 / 22, 1e-12, 'n_eff'); rel(k.deff, 4 * 22 / 64, 1e-12, 'deff');
  const adj = classAdjust(['a', 'a', 'a', 'b', 'b'], [true, false, true, true, true], [10, 10, 20, 5, 5]);
  [10 * (40 / 30), 0, 20 * (40 / 30), 5, 5].forEach((w, i) => rel(adj.weights[i], w, 1e-12, `class ${i}`));
  rel(adj.classes[0].rate, 30 / 40, 1e-12, 'response rate');
  const t = trimWeights([1, 1, 1, 1, 10], 3);
  rel(t.weights.reduce((s, w) => s + w, 0), 14, 1e-12, 'total kept');
  assert.ok(Math.max(...t.weights) <= 3 + 1e-12);
  assert.throws(() => rake([{ name: 'x', values: ['a', 'a'], targets: { a: 1, b: 1 } }], [1, 1]), /样本中没有/);
});

test('post-stratified and stratified ratio estimators, systematic variance and two-stage components', () => {
  const ps = postStratified([{ name: 'A', N: 600, n: 30, mean: 10, sd: 2 }, { name: 'B', N: 400, n: 20, mean: 20, sd: 4 }], { confidence: 0.95 });
  rel(ps.mean.value, 14, 1e-12, 'pst'); rel(ps.mean.variance, 0.36 * (1 - 30 / 600) * 4 / 30 + 0.16 * (1 - 20 / 400) * 16 / 20, 1e-12, 'pst v');
  const rows = [], strata = [{ name: '甲', N: 200, Xbar: 30 }, { name: '乙', N: 300, Xbar: 60 }], rand = seededRandom('sr');
  for (const s of strata) for (let i = 0; i < 25; i++) { const x = s.Xbar + 10 * randomNormal(rand); rows.push({ stratum: s.name, x, y: 2 * x + 5 * randomNormal(rand) }); }
  const sr = stratifiedRatio(rows, strata, { confidence: 0.95 });
  rel(sr.Xbar, 0.4 * 30 + 0.6 * 60, 1e-12, 'X̄');
  assert.ok(Math.abs(sr.separate.value - sr.combined.value) < 3 * sr.combined.se);
  const sys = systematicEstimate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { N: 100, confidence: 0.95 });
  assert.ok(sys.vDiff < sys.vSrs, 'a linear trend favours successive differences');
  assert.throws(() => twoStage([{ psu: 'a', y: 1 }, { psu: 'a', y: 2 }, { psu: 'b', y: 3 }], { N: 10, M: 5, confidence: 0.95 }), /须相等/);
});

test('multi-stage plans produce the frame table and an honest methods paragraph', () => {
  const residents = { id: 'g1', name: '城区居民', population: '全市常住居民', completes: 300, stages: [
    { id: 's1', unit: '行政区', frame: '全市所有行政区', method: 'pps', frameSize: 13, take: 2, sizeMeasure: '常住人口', strata: '' },
    { id: 's2', unit: '街道', frame: '所有街道', method: 'srs', frameSize: null, take: 2, sizeMeasure: '', strata: '' },
    { id: 's3', unit: '居民', frame: '所有居民', method: 'intercept', frameSize: null, take: null, sizeMeasure: '', strata: '' },
  ], tree: [{ name: '甲区', children: [{ name: '一街道', children: [] }, { name: '二街道', children: [] }] }, { name: '乙区', children: [{ name: '三街道', children: [] }] }] };
  const table = frameTable(residents);
  assert.deepEqual(table.headers, ['初级单元抽样框', '入样行政区', '二级单元抽样框', '入样街道', '三级单元抽样框']);
  assert.deepEqual(table.rows[0], ['全市所有行政区', '甲区', '甲区所有街道', '一街道', '该街道所有居民']);
  assert.deepEqual(table.rows[2], ['全市所有行政区', '乙区', '乙区所有街道', '三街道', '该街道所有居民']);
  assert.equal(groupIsProbability(residents), false);
  const text = groupStatement(residents);
  assert.match(text, /三阶段抽样/); assert.match(text, /PPS/); assert.match(text, /拦截式访问/); assert.match(text, /不是概率样本/);
  const students = { id: 'g2', name: '大学生', population: '', completes: null, stages: [
    { id: 't1', unit: '学校', frame: '全市高校名册', method: 'srs', frameSize: 80, take: 8, sizeMeasure: '', strata: '' },
    { id: 't2', unit: '学生', frame: '在校生名册', method: 'systematic', frameSize: 1000, take: 25, sizeMeasure: '', strata: '' },
  ], tree: [{ name: '某学院', frame: '全市本科院校', children: [] }] };
  rel(equalProbabilityInclusion(students), 0.0025, 1e-12, 'inclusion');
  assert.match(groupStatement(students), /自加权/);
  assert.deepEqual(frameTable(students).rows[0], ['全市本科院校', '某学院', '该学校在校生名册']);
});

test('selection outlines, merged frame-table cells and the dataset bridge', async () => {
  const { parseSelectionTree, mergeSpans } = await import('../lib/sampling-selection.ts');
  const tree = parseSelectionTree('甲区\n  一街道\n  二街道\n乙区\n\t三街道\n某学院｜全市本科院校');
  assert.deepEqual(tree.map(n => n.name), ['甲区', '乙区', '某学院']);
  assert.deepEqual(tree[0].children.map(n => n.name), ['一街道', '二街道']);
  assert.equal(tree[1].children[0].name, '三街道'); assert.equal(tree[2].frame, '全市本科院校');
  const spans = mergeSpans([['框', '甲', 'x'], ['框', '甲', 'y'], ['框', '乙', 'x']]);
  assert.deepEqual(spans, [[3, 2, 1], [0, 0, 1], [0, 1, 1]]);
  const { buildDesignRows, describeColumn, marginsFromShares, MISSING_CATEGORY } = await import('../lib/sampling-dataset.ts');
  const { parseSurveyCsv } = await import('../lib/survey-analysis.ts');
  const table = parseSurveyCsv('层,群,权数,满意,性别\nA,1,10,4,男\nA,1,10,99,女\nA,2,12,5,女\nB,3,8,3,男\nB,4,8,,女\nB,4,9,2,男');
  const built = buildDesignRows(table, { y: 3, category: null, weight: 2, stratum: 0, psu: 1, domain: null }, ['99']);
  assert.equal(built.rows.length, 6); assert.equal(built.excluded, 2);
  assert.deepEqual(built.rows.map(r => r.inDomain), [true, false, true, true, false, true]);
  assert.equal(new Set(built.rows.map(r => r.psu)).size, 4);
  const est = designEstimate(built.rows, { statistic: 'mean', confidence: 0.95, method: 'linearization' });
  rel(est.estimate, (10 * 4 + 12 * 5 + 8 * 3 + 9 * 2) / (10 + 12 + 8 + 9), 1e-12, 'weighted mean over answered rows');
  const female = buildDesignRows(table, { y: 4, category: '女', weight: null, stratum: null, psu: null, domain: null }, []);
  rel(designEstimate(female.rows, { statistic: 'mean', confidence: 0.95, method: 'linearization' }).estimate, 0.5, 1e-12, 'proportion');
  assert.deepEqual(describeColumn(table, 4, []).categories.sort(), ['女', '男']);
  const margins = marginsFromShares(table, [{ column: 4, shares: { 男: 40, 女: 60 } }], [], 6);
  rel(margins[0].targets['女'], 3.6, 1e-12, 'target total');
  assert.throws(() => marginsFromShares(table, [{ column: 4, shares: { 男: 100, 女: 0 } }], [], 6), /大于 0/);
  assert.equal(MISSING_CATEGORY, '（缺失）');
});

test('the sampling lab shows unbiased designs, honest coverage and the expected efficiency ordering', async () => {
  const { makePopulation, runLab } = await import('../lib/sampling-lab.ts');
  const pop = makePopulation();
  assert.equal(pop.units.length, 6000); assert.equal(pop.clusters, 240);
  assert.ok(pop.rho > 0.75 && pop.rho < 0.95, `rho ${pop.rho}`); assert.ok(pop.icc > 0.05 && pop.icc < 0.3, `icc ${pop.icc}`);
  const results = Object.fromEntries(runLab(pop, { n: 200, reps: 1500, seed: 'test' }).map(r => [r.design, r]));
  for (const d of ['srs', 'proportional', 'neyman', 'ratio', 'cluster', 'systematic']) {
    const r = results[d];
    assert.ok(Math.abs(r.bias) < 4 * r.empiricalSe / Math.sqrt(1500) + 2, `${d} bias ${r.bias}`);
    // A systematic sample with k = 30 has only 30 possible samples; its approximate variance is conservative.
    assert.ok(r.coverage > 0.92 && (d === 'systematic' || r.coverage < 0.98), `${d} coverage ${r.coverage}`);
  }
  assert.ok(results.systematic.efficiency > 2, 'a list sorted by a correlated variable stratifies implicitly');
  assert.ok(results.proportional.efficiency > results.srs.efficiency * 0.98, 'stratification does not lose');
  assert.ok(results.ratio.efficiency > 1.5, `ratio efficiency ${results.ratio.efficiency}`);
  assert.ok(results.cluster.efficiency < 0.6, `cluster efficiency ${results.cluster.efficiency}`);
  assert.equal(results.cluster.sampleSize, 200);
});

test('review fixes: budgets cannot buy more primary units than exist; weights bind to content; names stay literal', async () => {
  const capped = twoStagePlan({ components: { S: 10, rho: 0.1 }, M: 50, N: 10, c1: 100, c2: 10, constraint: { kind: 'budget', budget: 100000 } });
  assert.equal(capped.n, 10);
  assert.ok(capped.warnings.some(w => w.includes('$n=N$')));
  assert.ok(capped.V > 0 && capped.cost === 10 * (100 + 10 * capped.m));
  const { textHash, literal } = await import('../lib/sampling-core.ts');
  assert.equal(textHash('a,b\n1,2'), textHash('a,b\n1,2'));
  assert.notEqual(textHash('a,b\n1,2'), textHash('a,b\n1,3'));
  assert.equal(textHash('').length, 32);
  assert.equal(literal('收入($)'), '收入(＄)');
  const { allocate } = await import('../lib/sampling.ts');
  const warned = allocate([{ id: 'a', name: '高端$客户', size: 5, sd: 50 }, { id: 'b', name: '普通', size: 500, sd: 1 }], 50, 'neyman');
  assert.ok(warned.warnings.some(w => w.includes('高端＄客户')) && warned.warnings.every(w => !w.includes('$')));
});
