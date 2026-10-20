import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { HANDBOOK, HANDBOOK_REFERENCES, numberedFormulas } from '../lib/sampling-handbook.ts';
import { sampleSize } from '../lib/sampling.ts';
import { auxiliaryEstimators, clusterSample, randomizedResponse, srsMean, stratifiedMean, twoPhaseStratified } from '../lib/sampling-estimators.ts';
import { cumRootF, stratifiedSampleSize, twoGroupPlan, twoStagePlan } from '../lib/sampling-planning.ts';

// Every formula shown in the product is TeX typeset by KaTeX; invalid TeX must fail here, not in the browser.
const compile = (tex, where) => {
  try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode: true }); }
  catch (e) { assert.fail(`${where}: ${e.message}\n${tex}`); }
};
const inline = (text, where) => text.split('$').forEach((part, i) => { if (i % 2) compile(part, where); });
const CALCULATORS = new Set(['size', 'builder', 'selection', 'srs', 'power', 'stratified', 'stratified-size', 'cumrootf', 'auxiliary', 'pps', 'cluster', 'two-stage', 'systematic', 'two-phase', 'nonresponse', 'complex', 'weighting', 'rr']);

test('every handbook formula and inline expression compiles with KaTeX', () => {
  let formulas = 0;
  for (const chapter of HANDBOOK) {
    inline(chapter.lede, chapter.id);
    for (const m of chapter.methods) {
      for (const text of [m.summary, ...(m.when ?? []), ...(m.procedure ?? []), ...(m.notes ?? [])]) {
        assert.equal(text.split('$').length % 2, 1, `${m.id}: unbalanced $ in “${text}”`);
        inline(text, m.id);
      }
      for (const f of m.formulas) { compile(f.tex, `${m.id} ${f.label}`); if (f.legend) inline(f.legend, `${m.id} legend`); inline(f.label, `${m.id} label`); formulas++; }
      if (m.calc) assert.ok(CALCULATORS.has(m.calc.id), `${m.id} links to unknown calculator ${m.calc.id}`);
    }
  }
  assert.ok(formulas > 100, `${formulas} formulas`);
  assert.equal(new Set(HANDBOOK.map(c => c.number)).size, HANDBOOK.length);
  assert.ok(HANDBOOK_REFERENCES.length >= 10);
});

test('equation numbers run within each chapter', () => {
  const numbers = numberedFormulas(HANDBOOK[2]);
  assert.equal(numbers.get(`${HANDBOOK[2].methods[0].id}:0`), '3.1');
  assert.equal([...numbers.values()].at(-1), `3.${numbers.size}`);
});

test('calculator steps are valid TeX, including the quick sample-size steps', () => {
  const plan = { target: 'proportion', confidence: '0.95', margin: 0.05, proportion: 0.5, sd: 1, population: 10000, designEffect: 1.5, validRate: 0.8, subgroups: 2 };
  for (const target of ['proportion', 'mean']) for (const s of sampleSize({ ...plan, target }).steps) compile(s.formula, `size ${s.label}`);
  const mean = sampleSize({ ...plan, target: 'mean', sd: 12, margin: 2, subgroups: 1, designEffect: 1 });
  const n0 = 1.959963984540054 ** 2 * 144 / 4;
  assert.ok(Math.abs(mean.steps[1].value - n0 / (1 + n0 / 10000)) < 1e-9, 'a mean uses n0/(1 + n0/N)');
  assert.match(sampleSize(plan).steps[0].formula, /\\frac\{z_\{\\alpha\/2\}\^\{2\}/);
  const steps = [
    ...srsMean([3, 5, 8, 13, 21], { N: 100, confidence: 0.95 }).steps,
    ...stratifiedMean([{ name: 'a', N: 100, n: 5, mean: 3, sd: 1 }, { name: 'b', N: 50, n: 4, mean: 5, sd: 2 }], { confidence: 0.95 }).steps,
    ...Object.values(auxiliaryEstimators([{ x: 1, y: 2 }, { x: 2, y: 4.1 }, { x: 3, y: 6.3 }, { x: 4, y: 7.9 }], { N: 50, Xbar: 2.6, confidence: 0.95 }).steps).flat(),
    ...clusterSample([{ cluster: 'a', y: 1 }, { cluster: 'a', y: 2 }, { cluster: 'b', y: 4 }, { cluster: 'b', y: 3 }, { cluster: 'c', y: 5 }], { N: 20, Mbar: null, confidence: 0.95 }).steps,
    ...randomizedResponse({ model: 'forced', truth: 4 / 6, forcedYes: 1 / 6 }, { n: 300, yes: 90, confidence: 0.95 }).steps,
    ...twoPhaseStratified([{ name: 'a', count: 60 }, { name: 'b', count: 40 }], [{ stratum: 'a', y: 1 }, { stratum: 'a', y: 2 }, { stratum: 'b', y: 5 }, { stratum: 'b', y: 7 }], { N: null, confidence: 0.95 }).steps,
    ...stratifiedSampleSize([{ id: 'a', name: 'a', size: 400, sd: 10, cost: 2 }, { id: 'b', name: 'b', size: 300, sd: 20, cost: 8 }], 'optimal', { kind: 'margin', margin: 2, confidence: 0.95 }).steps,
    ...cumRootF(Array.from({ length: 200 }, (_, i) => (i % 37) ** 1.5), 3).steps,
    ...twoStagePlan({ components: { S: 10, rho: 0.1 }, M: 40, N: 200, c1: 50, c2: 5, constraint: { kind: 'precision', target: { kind: 'margin', margin: 1, confidence: 0.95 } } }).steps,
    ...twoGroupPlan({ kind: 'mean', delta: 2, sd: 5, alpha: 0.05, power: 0.8, ratio: 1 }).steps,
  ];
  steps.forEach(s => compile(s.tex, s.label));
});
