import { averageRanks } from './analysis-recipes.ts';
import type { PlanNode, PlanResult } from './analysis-plan.ts';
import type { ChartDistribution, ChartSnapshot } from './chart-types.ts';
import { describeNumbers, finiteNumber, isMissing, type NumericSummary, type SurveyTable } from './survey-analysis.ts';

const MISMATCH = '图表样本与计算结果不一致，请重新计算当前模块。';
const categoryKey = (variable: string, label: string) => JSON.stringify([variable, label]);
const check = (condition: boolean) => { if (!condition) throw Error(MISMATCH); };
const textCell = (value: string | number | null): string => { check(typeof value === 'string'); return value as string; };
const numberCell = (value: string | number | null): number => { check(typeof value === 'number' && Number.isFinite(value)); return value as number; };

/** Sturges equal-width bins; [start,end), except the last closed bin. Constant values use one closed bin. */
function histogram(sorted: number[]): ChartDistribution['bins'] {
  const min = sorted[0], max = sorted[sorted.length - 1];
  if (min === max) return [{ start: min, end: max, count: sorted.length }];
  const k = Math.min(40, Math.max(1, Math.ceil(Math.log2(sorted.length) + 1)));
  // IEEE-754 rounding can collapse nearby edges at a large origin. Keep only representable distinct edges.
  const edges = [...new Set(Array.from({ length: k + 1 }, (_, i) => i === k ? max : min + (max - min) * i / k))];
  const bins = edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1], count: 0 }));
  let index = 0;
  for (const value of sorted) {
    while (index < bins.length - 1 && value >= bins[index].end) index++;
    bins[index].count++;
  }
  return bins;
}

/** Gaussian KDE: robust Silverman h=0.9 min(sd,IQR/1.34)n^-1/5, positive sd fallback, 128 points, ±3h. */
function density(sorted: number[], summary: NumericSummary): ChartDistribution['density'] {
  if (sorted.length < 2 || summary.min === summary.max || summary.sd === null || summary.sd <= 0) return null;
  const iqrScale = (summary.q3 - summary.q1) / 1.34;
  const scale = iqrScale > 0 ? Math.min(summary.sd, iqrScale) : summary.sd;
  const bandwidth = .9 * scale * sorted.length ** (-.2);
  const low = summary.min - 3 * bandwidth, high = summary.max + 3 * bandwidth;
  const normalizer = sorted.length * bandwidth * Math.sqrt(2 * Math.PI);
  if (!(bandwidth > 0) || !Number.isFinite(normalizer) || normalizer === 0 || !Number.isFinite(low) || !Number.isFinite(high) || low >= high) return null;
  const xs = [...new Set(Array.from({ length: 128 }, (_, i) => i === 127 ? high : low + (high - low) * i / 127))];
  const points: [number, number][] = xs.map(x => {
    let sum = 0;
    for (const value of sorted) { const z = (x - value) / bandwidth; sum += Math.exp(-.5 * z * z); }
    return [x, sum / normalizer];
  });
  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  return { bandwidth, points, method: 'Gaussian KDE; Silverman robust 0.9·min(sd,IQR/1.34)·n^(-1/5), sd fallback when IQR=0; extent=min/max±3h; grid=128 (duplicate floating-point coordinates removed)' };
}

function distribution(variable: string, label: string, values: number[]): ChartDistribution | null {
  const summary = describeNumbers(values);
  if (!summary) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = summary.q3 - summary.q1, lowerFence = summary.q1 - 1.5 * iqr, upperFence = summary.q3 + 1.5 * iqr;
  const inside = sorted.filter(value => value >= lowerFence && value <= upperFence);
  const ecdf: [number, number][] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j] === sorted[i]) j++;
    ecdf.push([sorted[i], j / sorted.length]); i = j;
  }
  return {
    key: categoryKey(variable, label), label, values: [...values], summary,
    bins: histogram(sorted),
    box: { low: inside[0], q1: summary.q1, median: summary.median, q3: summary.q3, high: inside[inside.length - 1], outliers: sorted.filter(value => value < lowerFence || value > upperFence) },
    density: density(sorted, summary), ecdf,
  };
}

/**
 * The caller supplies the same effective branch/routing table used by runPlanNode.
 * No second filter, storage, I/O, inference or renderer-default statistics are applied.
 * Raw numeric projections exist only in this in-memory snapshot; saved styles never contain this object.
 */
export function buildChartSnapshot(table: SurveyTable, node: PlanNode, result: PlanResult, missingCodes: string[], binding: ChartSnapshot['binding']): ChartSnapshot {
  check(result.method === node.method && result.total === table.rows.length && Number.isSafeInteger(result.n) && result.n >= 0 && result.n <= result.total);
  const snapshot: ChartSnapshot = {
    schema: 'analysis-chart-data/v1', method: result.method, n: result.n, binding: { ...binding },
    xLabel: node.x === null ? '' : table.headers[node.x], yLabel: node.y === null ? '' : table.headers[node.y],
    categories: [], distributions: [], cross: null, pairs: null, reliability: [],
    table: { headers: [...result.headers], rows: result.rows.map(row => [...row]) }, statistics: [],
  };
  const column = (index: number | null) => { check(index !== null && Number.isInteger(index) && index >= 0 && index < table.headers.length); return index as number; };
  if (node.method === 'frequency') {
    const x = column(node.x);
    check(table.rows.filter(row => !isMissing(row[x], missingCodes)).length === result.n);
    snapshot.categories = result.rows.map(row => ({ key: categoryKey(table.headers[x], textCell(row[0])), label: textCell(row[0]), count: numberCell(row[1]), percent: numberCell(row[2]) }));
    check(snapshot.categories.reduce((sum, item) => sum + item.count, 0) === result.n);
    snapshot.yLabel = '频数'; snapshot.statistics = ['比例分母为当前变量的有效样本数。'];
  } else if (node.method === 'crosstab') {
    const x = column(node.x), y = column(node.y);
    check(table.rows.filter(row => !isMissing(row[x], missingCodes) && !isMissing(row[y], missingCodes)).length === result.n);
    const cells = result.rows.map(row => ({ row: textCell(row[0]), column: textCell(row[1]), count: numberCell(row[2]), rowPercent: numberCell(row[3]) }));
    check(cells.reduce((sum, cell) => sum + cell.count, 0) === result.n);
    snapshot.cross = { rows: [...new Set(cells.map(cell => cell.row))], columns: [...new Set(cells.map(cell => cell.column))], cells };
    snapshot.statistics = ['频数与行内比例沿用当前交叉分析结果。'];
  } else if (node.method === 'alpha') {
    const scale = node.scale;
    check(scale !== null && result.reliability !== undefined);
    const options = scale!, reliability = result.reliability!;
    const n = table.rows.filter(row => options.columns.every(c => {
      if (isMissing(row[c], missingCodes)) return false;
      const value = finiteNumber(row[c]); return value !== null && value >= options.min && value <= options.max;
    })).length;
    check(n === result.n && reliability.n === result.n && reliability.items.length === options.columns.length);
    check(reliability.items.every((item, i) => item.index === options.columns[i] && item.name === table.headers[item.index] && item.reversed === options.reverse.includes(item.index)));
    snapshot.reliability = reliability.items.map(item => ({ key: categoryKey(item.name, item.name), label: item.name, mean: item.mean, sd: item.sd, correctedItemTotal: item.correctedItemTotal, alphaIfDeleted: item.alphaIfDeleted }));
    snapshot.xLabel = '题项'; snapshot.yLabel = '指标值';
    snapshot.statistics = ['沿用完整案例与反向计分后的题项均值、标准差、校正题总相关及删除后 α。'];
  } else if (node.method === 'groups') {
    const x = column(node.x), y = column(node.y), groups = new Map<string, number[]>();
    for (const row of table.rows) {
      if (isMissing(row[x], missingCodes)) continue;
      const label = row[x].trim(); if (!groups.has(label)) groups.set(label, []);
      if (isMissing(row[y], missingCodes)) continue;
      const value = finiteNumber(row[y]); if (value !== null) groups.get(label)!.push(value);
    }
    check([...groups.values()].reduce((sum, values) => sum + values.length, 0) === result.n && groups.size === result.rows.length);
    snapshot.distributions = result.rows.flatMap(row => {
      const label = textCell(row[0]), values = groups.get(label); check(values !== undefined && values.length === numberCell(row[1]));
      const d = distribution(table.headers[x], label, values!); return d ? [d] : [];
    });
    snapshot.statistics = ['各组只使用当前配对范围内的有效数值；误差线为样本标准差。', '四分位数：Type 7；箱线须：Tukey 1.5 IQR 范围内的最远观测值。', '直方图：Sturges 等宽箱；KDE：Gaussian / Silverman robust；ECDF：并列值合并。'];
  } else if (node.method === 'numeric') {
    const x = column(node.x), values = table.rows.flatMap(row => { if (isMissing(row[x], missingCodes)) return []; const value = finiteNumber(row[x]); return value === null ? [] : [value]; });
    check(values.length === result.n);
    const d = distribution(table.headers[x], table.headers[x], values); snapshot.distributions = d ? [d] : [];
    snapshot.yLabel = '频数';
    snapshot.statistics = ['四分位数：Type 7；箱线须：Tukey 1.5 IQR 范围内的最远观测值。', '直方图：Sturges 等宽箱，左闭右开，末箱右闭；常量单箱。', 'KDE：Gaussian / Silverman robust；ECDF：并列值合并。'];
  } else {
    check(node.method === 'pearson' || node.method === 'spearman');
    const x = column(node.x), y = column(node.y), values: [number, number][] = [];
    for (const row of table.rows) {
      if (isMissing(row[x], missingCodes) || isMissing(row[y], missingCodes)) continue;
      const a = finiteNumber(row[x]), b = finiteNumber(row[y]); if (a !== null && b !== null) values.push([a, b]);
    }
    check(values.length === result.n);
    const a = averageRanks(values.map(pair => pair[0])), b = averageRanks(values.map(pair => pair[1]));
    snapshot.pairs = { values, ranks: a.map((rank, i) => [rank, b[i]]) };
    snapshot.statistics = ['散点保留当前有效数值配对；秩散点在有效配对内重新取平均秩，不增加随机抖动。'];
  }
  return snapshot;
}
