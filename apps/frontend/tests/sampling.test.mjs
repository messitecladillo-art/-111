import test from 'node:test';
import assert from 'node:assert/strict';
import { achievedMargin, allocate, methodsStatement, sampleSize, validateSizePlan } from '../lib/sampling.ts';

const base = { target: 'proportion', confidence: '0.95', margin: 0.05, proportion: 0.5, sd: 1, population: null, designEffect: 1, validRate: 1, subgroups: 1 };
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('Cochran sample sizes for a proportion, with and without the finite population correction', () => {
  let r = sampleSize(base);
  close(r.steps[0].value, 1.959963984540054 ** 2 * 0.25 / 0.0025);
  assert.equal(r.completes, 385);
  r = sampleSize({ ...base, population: 10000 });
  close(r.steps[1].value, r.steps[0].value / (1 + (r.steps[0].value - 1) / 10000));
  assert.equal(r.completes, 370);
  assert.equal(sampleSize({ ...base, population: 1000 }).completes, 278);
  assert.equal(sampleSize({ ...base, confidence: '0.99' }).completes, 664);
  assert.equal(sampleSize({ ...base, confidence: '0.9' }).completes, 271);
});

test('design effect, valid rate and subgroups compound in the documented order', () => {
  const r = sampleSize({ ...base, designEffect: 1.5, validRate: 0.8 });
  assert.equal(r.completes, 577);
  assert.equal(r.contacts, 722);
  const g = sampleSize({ ...base, subgroups: 3, population: 3000 });
  const n0 = 1.959963984540054 ** 2 * 0.25 / 0.0025, per = Math.ceil(n0 / (1 + (n0 - 1) / 1000));
  assert.equal(g.perGroup, per);
  assert.equal(g.completes, per * 3);
});

test('mean targets use the outcome standard deviation', () => {
  const r = sampleSize({ ...base, target: 'mean', sd: 12, margin: 2 });
  close(r.steps[0].value, 1.959963984540054 ** 2 * 144 / 4);
  assert.equal(r.completes, 139);
});

test('invalid plans are refused with specific reasons', () => {
  assert.ok(validateSizePlan({ ...base, margin: 0 }).length);
  assert.ok(validateSizePlan({ ...base, proportion: 1 }).length);
  assert.ok(validateSizePlan({ ...base, designEffect: 0.8 }).length);
  assert.ok(validateSizePlan({ ...base, population: 1.5 }).length);
  assert.throws(() => sampleSize({ ...base, validRate: 0 }), /有效回收率/);
});

test('achieved margin inverts the size calculation', () => {
  close(achievedMargin({ n: 385, confidence: '0.95', proportion: 0.5, population: null, designEffect: 1 }), 1.959963984540054 * Math.sqrt(0.25 / 385));
  assert.ok(achievedMargin({ n: 385, confidence: '0.95', proportion: 0.5, population: null, designEffect: 1 }) < 0.05);
  const fpc = achievedMargin({ n: 370, confidence: '0.95', proportion: 0.5, population: 10000, designEffect: 1 });
  close(fpc, 1.959963984540054 * Math.sqrt(0.25 / 370) * Math.sqrt(9630 / 9999));
  assert.equal(achievedMargin({ n: 10, confidence: '0.95', proportion: 0.5, population: 10, designEffect: 1 }), 0);
  assert.equal(achievedMargin({ n: 1, confidence: '0.95', proportion: 0.5, population: null, designEffect: 1 }), null);
});

test('proportional, Neyman and equal allocation keep the exact total', () => {
  const strata = [{ id: 'a', name: '甲', size: 400, sd: 10 }, { id: 'b', name: '乙', size: 300, sd: 20 }, { id: 'c', name: '丙', size: 300, sd: 30 }];
  assert.deepEqual(allocate(strata, 100, 'proportional').rows.map(r => r.allocation), [40, 30, 30]);
  assert.deepEqual(allocate(strata, 100, 'neyman').rows.map(r => r.allocation), [21, 32, 47]);
  assert.deepEqual(allocate(strata, 100, 'equal').rows.map(r => r.allocation), [34, 33, 33]);
  const p = allocate(strata, 100, 'proportional');
  p.rows.forEach(r => { close(r.weight, r.size / r.allocation); close(r.relativeWeight, 1); });
  const ny = allocate(strata, 100, 'neyman');
  close(ny.rows.reduce((s, r) => s + r.allocation * r.relativeWeight, 0), 100, 1e-9);
});

test('minimum per stratum and stratum size caps are respected', () => {
  const strata = [{ id: 'a', name: '大', size: 9000, sd: 1 }, { id: 'b', name: '中', size: 900, sd: 1 }, { id: 'c', name: '小', size: 100, sd: 1 }];
  const r = allocate(strata, 200, 'proportional', 30);
  // Proportional shares are 180 / 18 / 2; both small strata are lifted to the minimum and the rest goes to the largest.
  assert.deepEqual(r.rows.map(x => x.allocation), [140, 30, 30]);
  assert.equal(r.total, 200);
  const capped = allocate([{ id: 'a', name: '少数层', size: 5, sd: 50 }, { id: 'b', name: '多数层', size: 500, sd: 1 }], 50, 'neyman');
  assert.equal(capped.rows[0].allocation, 5);
  assert.equal(capped.total, 50);
  assert.ok(capped.warnings.some(w => w.includes('少数层')));
  assert.throws(() => allocate(strata, 2, 'proportional'), /不少于层数/);
  assert.throws(() => allocate(strata.map(s => ({ ...s, sd: null })), 100, 'neyman'), /标准差/);
});

test('methods paragraph states precision only for probability designs', () => {
  const plan = { ...base, designEffect: 1.5, validRate: 0.8 }, result = sampleSize(plan);
  const probability = methodsStatement({ kind: 'stratified', population: '武汉市在校本科生', frame: '各校学生名册', plan, result });
  assert.match(probability, /577 份/); assert.match(probability, /722 份/); assert.match(probability, /抽样误差不超过/);
  const quota = methodsStatement({ kind: 'quota', population: '', frame: '', plan, result });
  assert.match(quota, /不计算抽样误差/); assert.doesNotMatch(quota, /抽样误差不超过/); assert.match(quota, /请填写目标总体/);
});

test('a minimum larger than a stratum takes that stratum whole and never breaks the total', () => {
  const r = allocate([{ id: 'a', name: '小层', size: 5, sd: 1 }, { id: 'b', name: '大层', size: 100, sd: 1 }], 20, 'proportional', 10);
  assert.deepEqual(r.rows.map(x => x.allocation), [5, 15]);
  assert.equal(r.total, 20);
  assert.ok(r.warnings.some(w => w.includes('全部纳入')));
  assert.throws(() => allocate([{ id: 'a', name: '甲', size: 50, sd: 1 }, { id: 'b', name: '乙', size: 50, sd: 1 }], 30, 'proportional', 20), /最少样本之和/);
});

test('random allocations always respect caps, floors and the exact total', () => {
  let seed = 7; const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let trial = 0; trial < 300; trial++) {
    const k = 2 + Math.floor(rand() * 6), strata = Array.from({ length: k }, (_, i) => ({ id: String(i), name: `层${i}`, size: 1 + Math.floor(rand() * 200), sd: 0.5 + rand() * 20 }));
    const capacity = strata.reduce((s, x) => s + x.size, 0), minimum = Math.floor(rand() * 15);
    const floors = strata.reduce((s, x) => s + Math.min(minimum, x.size), 0);
    const total = Math.max(k, floors) + Math.floor(rand() * Math.max(0, capacity - Math.max(k, floors)));
    for (const method of ['proportional', 'neyman', 'equal']) {
      const r = allocate(strata, total, method, minimum);
      assert.equal(r.total, total, `${method} total`);
      r.rows.forEach((row, i) => { assert.ok(row.allocation <= strata[i].size, `${method} cap`); assert.ok(row.allocation >= Math.min(minimum, strata[i].size), `${method} floor`); });
    }
  }
});

test('mean plans report mean precision and mean wording', () => {
  const plan = { ...base, target: 'mean', sd: 12, margin: 2 };
  const e = achievedMargin({ n: 139, confidence: '0.95', sd: 12, population: null, designEffect: 1 });
  close(e, 1.959963984540054 * 12 / Math.sqrt(139));
  assert.ok(e < 2);
  const text = methodsStatement({ kind: 'srs', population: '某市居民', frame: '户籍名册', plan, result: sampleSize(plan) });
  assert.match(text, /均值估计的抽样误差/); assert.doesNotMatch(text, /比例估计/);
});
