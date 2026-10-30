import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom } from '../lib/sampling-core.ts';
import { samplingAdequacy } from '../lib/psychometrics.ts';
import { exploratoryFactors } from '../lib/factor-analysis.ts';
import { linearRegression } from '../lib/regression.ts';
import { logisticRegression } from '../lib/logistic.ts';
import { ahp } from '../lib/ahp.ts';
import { ipa } from '../lib/ipa.ts';
import { kmeans, silhouette, standardize } from '../lib/kmeans.ts';
import { ahpWriting, clusterWriting, ipaWriting, logisticWriting, regressionWriting, validityWriting } from '../lib/method-writing.ts';
import { splitInlineMath } from '../lib/inline-math.ts';
import { texProblem } from '../lib/omml.ts';

// Seeded teaching-simulation data for every method; no respondents.
const random = seededRandom('method-writing');
const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const pattern = [[0.8, 0], [0.75, 0.1], [0.7, 0], [0, 0.8], [0.1, 0.7], [0, 0.65], [0.6, 0.6]];
const items = ['课程内容实用', '讲解清楚', '作业适量', '场地方便', '时间灵活', '报名简单', '总体推荐'];
const rows = Array.from({ length: 300 }, () => { const f = [normal(), normal()]; return pattern.map(([a, b]) => a * f[0] + b * f[1] + Math.sqrt(Math.max(0.05, 1 - a * a - b * b)) * normal()); });
const columns = pattern.map((_, j) => rows.map(r => r[j]));
const x1 = columns[0], x2 = columns[3], x3 = columns[0].map(() => (random() < 0.4 ? 1 : 0));
const y = x1.map((v, i) => 2 + 0.6 * v - 0.2 * x2[i] + 0.5 * x3[i] + normal());
const choice = x1.map((v, i) => (random() < 1 / (1 + Math.exp(-(0.8 * v + 0.6 * x3[i] - 0.3))) ? 1 : 0));

const writings = {
  validity: validityWriting(samplingAdequacy(columns), exploratoryFactors(columns), items, { table: 't1' }),
  regression: regressionWriting(linearRegression(y, [{ name: '课程评价', values: x1 }, { name: '场地评价', values: x2 }, { name: '是否会员', values: x3 }]), '满意度', { table: 't2' }),
  logistic: logisticWriting(logisticRegression(choice, [{ name: '课程评价', values: x1 }, { name: '是否会员', values: x3 }]), '是否续报', '续报'),
  ahp: ahpWriting(ahp([[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]]), ['安全', '便利', '价格']),
  ipa: ipaWriting(ipa([{ name: '开放时间', importance: [5, 5, 4], performance: [2, 3, 2] }, { name: '设施维护', importance: [4, 5, 5], performance: [4, 5, 4] }, { name: '停车', importance: [2, 3, 2], performance: [2, 2, 3] }, { name: '装饰', importance: [2, 2, 1], performance: [4, 5, 5] }])),
  cluster: (() => { const z = standardize(columns.slice(0, 3).map((_, d) => columns[d]).length ? rows.map(r => r.slice(0, 3)) : []); const fit = kmeans(z, 2, { seed: 'w' }); return clusterWriting(fit, silhouette(z, fit.assignments).mean, items.slice(0, 3)); })(),
};

test('every formula, inline or displayed, typesets; every table is rectangular; captions are noun phrases', () => {
  for (const [name, w] of Object.entries(writings)) {
    w.formulas.forEach(tex => assert.equal(texProblem(tex), null, `${name}: ${tex}`));
    for (const text of [w.text, w.where, w.reading, w.table.note]) {
      assert.equal((text.replace(/\\\$/g, '').match(/\$/g) ?? []).length % 2, 0, `${name}: balanced $ in ${text.slice(0, 30)}`);
      splitInlineMath(text).filter(part => part.math).forEach(part => assert.equal(texProblem(part.text), null, `${name}: $${part.text}$`));
    }
    assert.ok(w.table.rows.every(row => row.length === w.table.headers.length), `${name}: rectangular`);
    assert.ok(w.table.caption.length <= 30 && !/[。；，：]/u.test(w.table.caption), `${name}: caption “${w.table.caption}” is a noun phrase`);
    assert.ok(w.table.note.startsWith('注：'), `${name}: the note says how to read the table`);
    assert.ok(!/导致|造成|使得|决定了|引起/u.test(w.reading), `${name}: association, never cause`);
  }
});

test('the readings carry the computed numbers and say what holds', () => {
  const v = writings.validity;
  assert.match(v.reading, /^由\[\[表:t1\]\]可知，KMO 值为 \$0\.\d{3}\$（(极好|良好|中等|一般)），Bartlett 球形检验 \$\\chi\^2\(21\)=\d+\.\d{2}\$，\$p<0\.001\$，拒绝相关矩阵为单位矩阵的原假设/);
  assert.match(v.reading, /按特征值大于 1 提取 2 个公因子，旋转后累计解释 \d+\.\d% 的方差；因子 1 主要由/);
  assert.match(v.reading, /“总体推荐”在两个及以上因子上的载荷超过 0\.40，存在交叉载荷/);
  assert.deepEqual(v.table.headers, ['题项', '因子 1', '因子 2', '共同度']);
  assert.equal(v.table.rows.length, items.length + 2);
  const r = writings.regression;
  assert.match(r.reading, /模型整体显著，\$F\(3,296\)=\d+\.\d{2}\$，\$p<0\.001\$/);
  assert.match(r.reading, /“?课程评价与满意度正相关/);
  assert.match(r.reading, /上述关联不能直接解释为因果关系。$/);
  assert.equal(r.table.rows[0][0], '（截距）');
  const l = writings.logistic;
  assert.match(l.reading, /续报的发生比变为原来的 \$\d\.\d{3}\$ 倍/);
  assert.match(l.reading, /平均而言概率提高 \d+\.\d 个百分点/);
  assert.match(writings.ahp.reading, /\$CR=0\.\d{3}\$，小于 0\.1，判断具有满意的一致性。各准则按权重从高到低依次为“安全”/);
  assert.match(writings.ipa.reading, /落在“重点改进”象限的有“开放时间”/);
  assert.match(writings.cluster.reading, /^将受访者分为 2 类，平均轮廓系数为 \$0\.\d{3}\$/);
});

test('a failed condition is said plainly, never smoothed over', () => {
  const inconsistent = ahpWriting(ahp([[1, 9, 1 / 9], [1 / 9, 1, 9], [9, 1 / 9, 1]]), ['甲', '乙', '丙']);
  assert.match(inconsistent.reading, /不小于 0\.1，判断不一致，应请专家调整后重新计算，以下权重暂不宜采用/);
  // Items without shared variance: KMO near one half and Bartlett not significant.
  const unfitAdequacy = { ...samplingAdequacy(columns), kmo: 0.52, bartlett: { chi2: 4.1, df: 21, p: 0.99 } };
  const unfit = validityWriting(unfitAdequacy, exploratoryFactors(columns), items);
  assert.match(unfit.reading, /KMO 值为 \$0\.520\$（较差）.*题项不满足因子分析的前提，以下因子结构仅供参考/);
  // Pure noise does not even yield a factor structure: the extraction refuses instead of returning one.
  const noise = Array.from({ length: 4 }, () => Array.from({ length: 200 }, () => normal()));
  assert.ok('refused' in exploratoryFactors(noise, 1));
});
