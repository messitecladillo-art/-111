/**
 * Design-stage calculators: how many units to sample, where, and at what cost, before data exist.
 * Formulas: Cochran (1977) chs. 5, 9–13; Kish (1965); Eldridge, Ashby & Kerry (2006) for unequal
 * cluster sizes; Fleiss (1981) and Guenther (1981) for two-group comparisons.
 */
import { allocate, type AllocationMethod, type AllocationRow } from './sampling.ts';
import { meanOf, sum, texNum, varianceOf, zCritical, zOneSided } from './sampling-core.ts';
import type { Step } from './sampling-estimators.ts';

const tex = String.raw;
export type PrecisionTarget = { kind: 'margin'; margin: number; confidence: number } | { kind: 'variance'; V: number };
function targetVariance(target: PrecisionTarget): { V: number; z: number | null; step: Step } {
  if (target.kind === 'variance') {
    if (!(target.V > 0)) throw Error('目标方差须大于 0。');
    return { V: target.V, z: null, step: { label: '目标方差', tex: tex`V=${texNum(target.V, 5)}` } };
  }
  if (!(target.margin > 0)) throw Error('允许误差须大于 0。');
  const z = zCritical(target.confidence), V = (target.margin / z) ** 2;
  return { V, z, step: { label: '由允许误差换算目标方差', tex: tex`V=\left(\frac{e}{z_{${texNum((1 + target.confidence) / 2, 4)}}}\right)^{2}=\left(\frac{${texNum(target.margin, 5)}}{${texNum(z, 4)}}\right)^{2}=${texNum(V, 5)}` } };
}

/* ───────────── Stratified designs ───────────── */

export type PlanStratum = { id: string; name: string; size: number; sd: number; cost?: number | null; mean?: number | null };
export type StratifiedPlan = { nExact: number; n: number; rows: AllocationRow[]; census: string[]; V: number; achievedV: number; achievedMargin: number | null; cost: number | null; steps: Step[]; warnings: string[] };
/**
 * Sample size for a stratified design that reaches a precision target, with the matching allocation.
 * Strata whose optimal share would exceed their size are taken whole and the rest is re-solved.
 */
export function stratifiedSampleSize(strata: PlanStratum[], method: Exclude<AllocationMethod, 'equal'>, target: PrecisionTarget, fixedCost = 0): StratifiedPlan {
  if (strata.length < 2) throw Error('至少需要 2 层。');
  for (const s of strata) {
    if (!(Number.isInteger(s.size) && s.size >= 2)) throw Error(`「${s.name}」的层规模须为不小于 2 的整数。`);
    if (!(s.sd > 0)) throw Error(`「${s.name}」的标准差须大于 0。`);
    if (method === 'optimal' && !(s.cost && s.cost > 0)) throw Error(`「${s.name}」缺少每个样本的调查费用。`);
  }
  const { V, z, step } = targetVariance(target);
  const N = sum(strata.map(s => s.size)), W = strata.map(s => s.size / N), c = strata.map(s => s.cost ?? 1);
  const census = new Set<number>();
  let nFree = 0;
  for (let guard = 0; guard <= strata.length; guard++) {
    const free = strata.map((_, i) => i).filter(i => !census.has(i));
    const fpc = sum(free.map(i => W[i] * strata[i].sd ** 2)) / N;
    const numerator = method === 'proportional'
      ? sum(free.map(i => W[i] * strata[i].sd ** 2)) * sum(free.map(i => W[i])) // proportional within the remaining strata
      : method === 'neyman' ? sum(free.map(i => W[i] * strata[i].sd)) ** 2
        : sum(free.map(i => W[i] * strata[i].sd * Math.sqrt(c[i]))) * sum(free.map(i => W[i] * strata[i].sd / Math.sqrt(c[i])));
    nFree = numerator / (V + fpc);
    const score = free.map(i => method === 'proportional' ? strata[i].size : method === 'neyman' ? strata[i].size * strata[i].sd : strata[i].size * strata[i].sd / Math.sqrt(c[i]));
    const scoreSum = sum(score), over = free.filter((i, k) => nFree * score[k] / scoreSum > strata[i].size);
    if (!over.length) break;
    over.forEach(i => census.add(i));
  }
  const nExact = nFree + sum([...census].map(i => strata[i].size));
  if (nExact > N) throw Error('达到该精度需要普查全部单位；请放宽允许误差。');
  const n = Math.min(N, Math.max(strata.length * 2, Math.ceil(nExact - 1e-9)));
  // Each stratum keeps at least 2 units so that its variance can be estimated.
  const allocation = allocate(strata.map(s => ({ id: s.id, name: s.name, size: s.size, sd: s.sd, cost: s.cost ?? null })), n, method, 2);
  const achievedV = sum(allocation.rows.map((r, i) => r.allocation ? W[i] ** 2 * strata[i].sd ** 2 / r.allocation : Infinity)) - sum(strata.map((s, i) => W[i] * s.sd ** 2)) / N;
  const cost = strata.every(s => s.cost && s.cost > 0) ? fixedCost + sum(allocation.rows.map((r, i) => r.allocation * c[i])) : null;
  const formula = method === 'proportional'
    ? tex`n=\frac{\sum_h W_hS_h^{2}}{V+\frac{1}{N}\sum_h W_hS_h^{2}}`
    : method === 'neyman' ? tex`n=\frac{\left(\sum_h W_hS_h\right)^{2}}{V+\frac{1}{N}\sum_h W_hS_h^{2}}`
      : tex`n=\frac{\left(\sum_h W_hS_h\sqrt{c_h}\right)\left(\sum_h W_hS_h/\sqrt{c_h}\right)}{V+\frac{1}{N}\sum_h W_hS_h^{2}}`;
  const shares = method === 'proportional' ? tex`n_h=n\,\frac{N_h}{N}` : method === 'neyman' ? tex`n_h=n\,\frac{N_hS_h}{\sum_k N_kS_k}` : tex`n_h=n\,\frac{N_hS_h/\sqrt{c_h}}{\sum_k N_kS_k/\sqrt{c_k}}`;
  const steps: Step[] = [step,
    { label: '样本量公式', tex: tex`${formula}=${texNum(nExact, 6)}` },
    { label: '各层分配', tex: shares },
    { label: '取整后实际达到的方差', tex: tex`V(\bar{y}_{st})=\sum_h\frac{W_h^{2}S_h^{2}}{n_h}-\frac{1}{N}\sum_h W_hS_h^{2}=${texNum(achievedV, 5)}` },
  ];
  const warnings = [...allocation.warnings];
  if (census.size) warnings.push(`${[...census].map(i => `「${strata[i].name}」`).join('、')}按公式分配超过层规模，已普查该层后对其余各层重新求解。`);
  if (method === 'proportional' && census.size) warnings.push('比例分配下出现普查层，说明总体很小或精度要求很高。');
  return { nExact, n, rows: allocation.rows, census: [...census].map(i => strata[i].name), V, achievedV, achievedMargin: z === null ? null : z * Math.sqrt(Math.max(0, achievedV)), cost, steps, warnings };
}

export type AllocationGains = { S2: number; Vsrs: number; Vprop: number; Vneyman: number; steps: Step[] };
/** Variances of the mean under SRS, proportional and Neyman allocation for the same n (Cochran §5.6). */
export function allocationGains(strata: PlanStratum[], n: number): AllocationGains {
  if (strata.length < 2) throw Error('至少需要 2 层。');
  if (strata.some(s => s.mean === null || s.mean === undefined || !Number.isFinite(s.mean))) throw Error('比较分层收益需要各层的均值（或比例）。');
  const N = sum(strata.map(s => s.size));
  if (!(Number.isInteger(n) && n >= strata.length && n < N)) throw Error('样本量须为整数，不少于层数且小于总体规模。');
  const W = strata.map(s => s.size / N), Ybar = sum(strata.map((s, i) => W[i] * s.mean!));
  const S2 = (sum(strata.map(s => (s.size - 1) * s.sd ** 2)) + sum(strata.map(s => s.size * (s.mean! - Ybar) ** 2))) / (N - 1);
  const Vsrs = (1 / n - 1 / N) * S2, Vprop = (1 / n - 1 / N) * sum(strata.map((s, i) => W[i] * s.sd ** 2));
  const Vneyman = sum(strata.map((s, i) => W[i] * s.sd)) ** 2 / n - sum(strata.map((s, i) => W[i] * s.sd ** 2)) / N;
  return { S2, Vsrs, Vprop, Vneyman, steps: [
    { label: '简单随机抽样', tex: tex`V_{ran}=\Bigl(\frac{1}{n}-\frac{1}{N}\Bigr)S^{2}=${texNum(Vsrs, 5)},\quad S^{2}=\frac{\sum_h(N_h-1)S_h^{2}+\sum_h N_h(\bar{Y}_h-\bar{Y})^{2}}{N-1}=${texNum(S2, 5)}` },
    { label: '比例分配', tex: tex`V_{prop}=\Bigl(\frac{1}{n}-\frac{1}{N}\Bigr)\sum_h W_hS_h^{2}=${texNum(Vprop, 5)}` },
    { label: 'Neyman 分配', tex: tex`V_{opt}=\frac{\left(\sum_h W_hS_h\right)^{2}}{n}-\frac{1}{N}\sum_h W_hS_h^{2}=${texNum(Vneyman, 5)}` },
    { label: '增益来源', tex: tex`V_{ran}-V_{prop}\ \text{来自层间均值差异},\qquad V_{prop}-V_{opt}=\frac{1}{n}\sum_h W_h\bigl(S_h-\bar{S}\bigr)^{2}\ \text{来自层内标准差差异}` },
  ] };
}

export type CumRootStratum = { lower: number; upper: number; count: number; mean: number; sd: number };
export type CumRootResult = { boundaries: number[]; strata: CumRootStratum[]; objective: number; quantileObjective: number; classes: number; steps: Step[]; warnings: string[] };
/** Strata are half-open intervals [lower cut, next cut), matching the class counts. */
function stratumStats(values: number[], cuts: number[]): CumRootStratum[] {
  const sorted = [...values].sort((a, b) => a - b), edges = [-Infinity, ...cuts, Infinity];
  return edges.slice(0, -1).map((lo, k) => {
    const members = sorted.filter(v => v >= lo && v < edges[k + 1]);
    return { lower: members[0] ?? NaN, upper: members[members.length - 1] ?? NaN, count: members.length, mean: members.length ? meanOf(members) : NaN, sd: members.length > 1 ? Math.sqrt(varianceOf(members)) : 0 };
  });
}
const neymanObjective = (strata: CumRootStratum[]) => sum(strata.map(s => s.count * s.sd));
/**
 * Dalenius–Hodges cumulative √f rule: boundaries that equalise cumulative √(class frequency).
 * Returns the Neyman objective Σ N_h S_h (smaller is better) next to equal-count strata for comparison.
 */
export function cumRootF(values: number[], L: number, classes = 0): CumRootResult {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 4 * L) throw Error(`至少需要 ${4 * L} 个数值才能划分 ${L} 层。`);
  if (!(Number.isInteger(L) && L >= 2 && L <= 10)) throw Error('层数须为 2–10 的整数。');
  const min = Math.min(...finite), max = Math.max(...finite);
  if (min === max) throw Error('辅助变量没有变异，无法分层。');
  const J = classes > 0 ? classes : Math.min(60, Math.max(10, Math.round(Math.sqrt(finite.length) * 2)));
  const width = (max - min) / J, counts = new Array<number>(J).fill(0);
  for (const v of finite) counts[Math.min(J - 1, Math.floor((v - min) / width))]++;
  const cum: number[] = []; let running = 0;
  for (const c of counts) { running += Math.sqrt(c); cum.push(running); }
  const total = running, chosen: number[] = [];
  for (let k = 1; k < L; k++) {
    const targetValue = k * total / L, lower = (chosen[chosen.length - 1] ?? -1) + 1, upper = J - 1 - (L - 1 - k);
    let best = lower;
    for (let j = lower; j <= upper; j++) if (Math.abs(cum[j] - targetValue) < Math.abs(cum[best] - targetValue)) best = j;
    chosen.push(best);
  }
  const boundaries = chosen.map(j => min + (j + 1) * width);
  const strata = stratumStats(finite, boundaries);
  const sorted = [...finite].sort((a, b) => a - b), quantileCuts = Array.from({ length: L - 1 }, (_, k) => sorted[Math.floor((k + 1) * sorted.length / L)]);
  const quantileObjective = neymanObjective(stratumStats(finite, quantileCuts));
  const warnings: string[] = [];
  if (strata.some(s => s.count < 2)) warnings.push('有层的单位少于 2 个，请减少层数或调整分组数。');
  return { boundaries, strata, objective: neymanObjective(strata), quantileObjective, classes: J, warnings, steps: [
    { label: '分组与累积平方根', tex: tex`\text{将辅助变量等距分为 }J=${J}\text{ 组},\quad \operatorname{cum}\sqrt{f}_j=\sum_{i\le j}\sqrt{f_i},\quad \text{合计 }T=${texNum(total, 5)}` },
    { label: '分界点', tex: tex`\text{第 }k\text{ 个分界取累积值最接近 }\frac{kT}{L}\text{ 的组上限}:\ ${boundaries.map(b => texNum(b, 5)).join(',\\ ')}` },
    { label: 'Neyman 目标值（越小越好）', tex: tex`\sum_h N_hS_h=${texNum(neymanObjective(strata), 5)}\quad\text{（等分位数分层为 }${texNum(quantileObjective, 5)}\text{）}` },
  ] };
}

/* ───────────── Cluster, two-stage and two-phase designs ───────────── */

export type ClusterPlan = { deff: number; elements: number; clusters: number; sensitivity: { rho: number; deff: number; clusters: number }[]; steps: Step[] };
/** Clusters needed for the precision of an SRS of nSrs, with deff = 1 + ((1 + CV²)m̄ − 1)ρ. */
export function clusterPlan({ nSrs, rho, mbar, cv = 0 }: { nSrs: number; rho: number; mbar: number; cv?: number }): ClusterPlan {
  if (!(nSrs > 0)) throw Error('简单随机抽样所需样本量须大于 0。');
  if (!(rho >= 0 && rho < 1)) throw Error('群内相关系数须在 0 与 1 之间。');
  if (!(mbar >= 1)) throw Error('平均每群调查人数须不小于 1。');
  if (!(cv >= 0)) throw Error('群规模变异系数不能为负。');
  const deffOf = (r: number) => 1 + ((1 + cv * cv) * mbar - 1) * r;
  const deff = deffOf(rho), elements = Math.ceil(nSrs * deff - 1e-9), clusters = Math.ceil(elements / mbar - 1e-9);
  const sensitivity = [0.01, 0.02, 0.05, 0.1, 0.2].map(r => ({ rho: r, deff: deffOf(r), clusters: Math.ceil(Math.ceil(nSrs * deffOf(r) - 1e-9) / mbar - 1e-9) }));
  return { deff, elements, clusters, sensitivity, steps: [
    { label: '设计效应', tex: cv > 0 ? tex`\mathrm{deff}=1+\left[(1+CV^{2})\bar{m}-1\right]\rho=1+\left[(1+${texNum(cv, 3)}^{2})\times ${texNum(mbar, 4)}-1\right]\times ${texNum(rho, 4)}=${texNum(deff, 4)}` : tex`\mathrm{deff}=1+(\bar{m}-1)\rho=1+(${texNum(mbar, 4)}-1)\times ${texNum(rho, 4)}=${texNum(deff, 4)}` },
    { label: '所需调查人数', tex: tex`n=n_{srs}\times\mathrm{deff}=${texNum(nSrs, 6)}\times ${texNum(deff, 4)}\approx ${elements}` },
    { label: '所需群数', tex: tex`k=\left\lceil\frac{n}{\bar{m}}\right\rceil=\left\lceil\frac{${elements}}{${texNum(mbar, 4)}}\right\rceil=${clusters}` },
  ] };
}

export type TwoStageInput = { components: { S1: number; S2: number } | { S: number; rho: number }; M: number; N: number | null; c1: number; c2: number; constraint: { kind: 'budget'; budget: number } | { kind: 'precision'; target: PrecisionTarget } };
export type TwoStagePlan = { mExact: number; m: number; n: number; V: number; margin: number | null; cost: number; deff: number; steps: Step[]; warnings: string[] };
/** Optimal elements per primary unit and number of primary units under the cost C = c₁n + c₂nm. */
export function twoStagePlan({ components, M, N, c1, c2, constraint }: TwoStageInput): TwoStagePlan {
  if (!(Number.isInteger(M) && M >= 2)) throw Error('每个初级单元的二级单元数 M 须为不小于 2 的整数。');
  if (!(c1 > 0 && c2 > 0)) throw Error('两级费用 c₁、c₂ 须大于 0。');
  if (N !== null && !(Number.isInteger(N) && N >= 2)) throw Error('初级单元总数须为不小于 2 的整数，或留空。');
  let S1: number, S2: number;
  if ('rho' in components) {
    if (!(components.S > 0) || !(components.rho >= 0 && components.rho < 1)) throw Error('标准差须大于 0，群内相关系数须在 [0, 1)。');
    S2 = components.S ** 2 * (1 - components.rho); S1 = components.S ** 2 * (components.rho + (1 - components.rho) / M);
  } else {
    if (!(components.S1 >= 0 && components.S2 > 0)) throw Error('初级单元间方差 S₁² 不能为负，单元内方差 S₂² 须大于 0。');
    S1 = components.S1; S2 = components.S2;
  }
  const Su = S1 - S2 / M, warnings: string[] = [];
  let mExact: number;
  if (Su <= 0) { mExact = M; warnings.push('初级单元之间几乎没有差异（$S_u^2\\le 0$），每个单元内应尽量多抽，直至全部调查。'); }
  else mExact = Math.sqrt(c1 * S2 / (c2 * Su));
  const product = (m: number) => (Math.max(Su, 0) + S2 / m) * (c1 + c2 * m);
  const candidates = [Math.floor(mExact), Math.ceil(mExact)].map(m => Math.min(M, Math.max(2, m)));
  const m = candidates.reduce((best, x) => product(x) < product(best) ? x : best, candidates[0]);
  const inv = N === null ? 0 : 1 / N;
  let n: number, z: number | null = null, targetStep: Step | null = null;
  if (constraint.kind === 'budget') {
    if (!(constraint.budget > 0)) throw Error('总预算须大于 0。');
    n = Math.floor(constraint.budget / (c1 + c2 * m));
    if (n < 2) throw Error('预算不足以调查 2 个初级单元。');
  } else {
    const t = targetVariance(constraint.target); z = t.z; targetStep = t.step;
    n = Math.ceil((Math.max(Su, 0) + S2 / m) / (t.V + S1 * inv) - 1e-9);
    if (N !== null && n > N) throw Error('所需初级单元数超过总数，请放宽精度要求或增加每个单元的样本。');
  }
  const V = (Math.max(Su, 0) + S2 / m) / n - S1 * inv, cost = n * (c1 + c2 * m);
  // Against an SRS of the same n·m elements (finite-population terms left out of both): 1 + (m − 1)ρ.
  const deff = (Math.max(Su, 0) + S2 / m) / n / ((Math.max(Su, 0) + S2) / (n * m));
  if (m < mExact - 1e-9 && m === M) warnings.push('最优值超过 $M$，已取 $m=M$。');
  return { mExact, m, n, V, margin: z === null ? null : z * Math.sqrt(Math.max(0, V)), cost, deff, warnings, steps: [
    ...(targetStep ? [targetStep] : []),
    { label: '单元间方差的有效部分', tex: tex`S_u^{2}=S_1^{2}-\frac{S_2^{2}}{M}=${texNum(S1, 5)}-\frac{${texNum(S2, 5)}}{${M}}=${texNum(Su, 5)}` },
    { label: '每个初级单元的最优样本数', tex: Su > 0 ? tex`m_{opt}=\frac{S_2}{S_u}\sqrt{\frac{c_1}{c_2}}=\sqrt{\frac{${texNum(S2, 5)}}{${texNum(Su, 5)}}\times\frac{${texNum(c1, 5)}}{${texNum(c2, 5)}}}=${texNum(mExact, 4)}\ \Rightarrow\ m=${m}` : tex`S_u^{2}\le 0\ \Rightarrow\ m=M=${M}` },
    constraint.kind === 'budget'
      ? { label: '初级单元数（由预算）', tex: tex`n=\left\lfloor\frac{C}{c_1+c_2m}\right\rfloor=\left\lfloor\frac{${texNum(constraint.budget, 7)}}{${texNum(c1, 5)}+${texNum(c2, 5)}\times ${m}}\right\rfloor=${n}` }
      : { label: '初级单元数（由精度）', tex: tex`n=\frac{S_u^{2}+S_2^{2}/m}{V+S_1^{2}/N}\ \Rightarrow\ n=${n}` },
    { label: '达到的方差', tex: tex`V(\bar{\bar{y}})=\frac{1}{n}\Bigl(S_u^{2}+\frac{S_2^{2}}{m}\Bigr)-\frac{S_1^{2}}{N}=${texNum(V, 5)},\quad \text{费用 }C=n(c_1+c_2m)=${texNum(cost, 7)}` },
  ] };
}

export type TwoPhasePlan = { useful: boolean; n: number; n1: number; V: number; Vsrs: number; gain: number; condition: number; steps: Step[] };
/**
 * Two-phase regression design: phase one measures a cheap x on n′ units (cost c′ each), phase two
 * measures y on n of them (cost c each). Minimises S_y²(1 − ρ²)/n + S_y²ρ²/n′ under c·n + c′·n′ = C.
 */
export function twoPhasePlan({ rho, c, c1, Sy, budget }: { rho: number; c: number; c1: number; Sy: number; budget: number }): TwoPhasePlan {
  if (!(Math.abs(rho) < 1)) throw Error('相关系数的绝对值须小于 1。');
  if (!(c > 0 && c1 > 0 && Sy > 0 && budget > 0)) throw Error('费用、标准差与预算须大于 0。');
  const A = Sy * Sy * (1 - rho * rho), B = Sy * Sy * rho * rho, root = Math.sqrt(A * c) + Math.sqrt(B * c1);
  const nExact = budget * Math.sqrt(A / c) / root, n1Exact = budget * Math.sqrt(B / c1) / root;
  const condition = 4 * c * c1 / (c + c1) ** 2, useful = rho * rho > condition && n1Exact > nExact;
  const Vsrs = Sy * Sy * c / budget;
  let n: number, n1: number, V: number;
  if (useful) {
    n = Math.max(2, Math.floor(nExact)); n1 = Math.max(n + 1, Math.floor((budget - c * n) / c1));
    V = A / n + B / n1;
  } else { n = Math.floor(budget / c); n1 = n; V = Sy * Sy / n; }
  return { useful, n, n1, V, Vsrs, gain: Vsrs / V, condition, steps: [
    { label: '方差与费用', tex: tex`V(\bar{y}_{lrd})\approx\frac{S_y^{2}(1-\rho^{2})}{n}+\frac{S_y^{2}\rho^{2}}{n'},\qquad C=cn+c'n'` },
    { label: '最优分配', tex: tex`n=\frac{C\sqrt{(1-\rho^{2})/c}}{\sqrt{(1-\rho^{2})c}+|\rho|\sqrt{c'}}=${texNum(nExact, 5)},\qquad n'=\frac{C\,|\rho|/\sqrt{c'}}{\sqrt{(1-\rho^{2})c}+|\rho|\sqrt{c'}}=${texNum(n1Exact, 5)}` },
    { label: '何时值得做二重抽样', tex: tex`\rho^{2}>\frac{4cc'}{(c+c')^{2}}=${texNum(condition, 4)}\quad(\rho^{2}=${texNum(rho * rho, 4)})` },
  ] };
}

export type NonresponsePlan = { k: number; n: number; respondents: number; nonrespondents: number; followUp: number; cost: number; V: number; steps: Step[]; warnings: string[] };
/** Hansen–Hurwitz (1946) follow-up of a 1/k subsample of nonrespondents: optimal k and initial sample n. */
export function nonresponsePlan({ S2, S2nr, W2, c0, c1, c2, target, N }: { S2: number; S2nr: number; W2: number; c0: number; c1: number; c2: number; target: PrecisionTarget; N: number | null }): NonresponsePlan {
  if (!(S2 > 0 && S2nr > 0)) throw Error('方差须大于 0。');
  if (!(W2 > 0 && W2 < 1)) throw Error('预计无回答比例须在 0 与 1 之间。');
  if (!(c0 >= 0 && c1 >= 0 && c2 > 0)) throw Error('费用不能为负，追访费用须大于 0。');
  const W1 = 1 - W2, warnings: string[] = [];
  const inner = c2 * (S2 - W2 * S2nr) / (S2nr * (c0 + c1 * W1));
  let k = inner > 1 ? Math.sqrt(inner) : 1;
  if (inner <= 1) warnings.push('按公式应追访全部无回答者（$k=1$）。');
  k = Math.round(k * 100) / 100;
  const { V, step } = targetVariance(target), inv = N === null ? 0 : 1 / N;
  const n = Math.ceil((S2 + (k - 1) * W2 * S2nr) / (V + S2 * inv) - 1e-9);
  const respondents = n * W1, nonrespondents = n * W2, followUp = Math.ceil(nonrespondents / k - 1e-9);
  const cost = c0 * n + c1 * respondents + c2 * followUp;
  return { k, n, respondents, nonrespondents, followUp, cost, V: (S2 + (k - 1) * W2 * S2nr) / n - S2 * inv, warnings, steps: [step,
    { label: '估计量的方差', tex: tex`V(\bar{y})=\Bigl(\frac{1}{n}-\frac{1}{N}\Bigr)S^{2}+\frac{(k-1)W_2S_2^{2}}{n}` },
    { label: '最优追访比例', tex: tex`k_{opt}=\sqrt{\frac{c_2\left(S^{2}-W_2S_2^{2}\right)}{S_2^{2}\left(c_0+c_1W_1\right)}}=${texNum(k, 4)}` },
    { label: '初始样本量', tex: tex`n=\frac{S^{2}+(k-1)W_2S_2^{2}}{V+S^{2}/N}\Rightarrow n=${n},\quad \text{追访 }\frac{nW_2}{k}\approx ${followUp}\text{ 人}` },
  ] };
}

/* ───────────── Sensitive questions and group comparisons ───────────── */

export type RrPlanDesign = { model: 'warner'; p: number } | { model: 'unrelated'; p: number; piU: number } | { model: 'forced'; truth: number; forcedYes: number };
export type RrPlan = { n: number; nDirect: number; inflation: number; steps: Step[] };
/** Sample size for a randomized response survey compared with direct questioning. */
export function rrPlan(design: RrPlanDesign, { pi, margin, confidence }: { pi: number; margin: number; confidence: number }): RrPlan {
  if (!(pi > 0 && pi < 1)) throw Error('预估敏感比例须在 0 与 1 之间。');
  if (!(margin > 0 && margin < 0.5)) throw Error('允许误差须在 0 与 0.5 之间。');
  let slope: number, intercept: number;
  if (design.model === 'warner') { if (!(design.p > 0 && design.p < 1) || Math.abs(design.p - 0.5) < 1e-9) throw Error('p 须在 0 与 1 之间且不等于 0.5。'); slope = 2 * design.p - 1; intercept = 1 - design.p; }
  else if (design.model === 'unrelated') { if (!(design.p > 0 && design.p <= 1 && design.piU >= 0 && design.piU <= 1)) throw Error('参数须在 0 与 1 之间。'); slope = design.p; intercept = (1 - design.p) * design.piU; }
  else { if (!(design.truth > 0 && design.forcedYes >= 0 && design.truth + design.forcedYes <= 1)) throw Error('强制回答参数无效。'); slope = design.truth; intercept = design.forcedYes; }
  const z = zCritical(confidence), lambda = slope * pi + intercept;
  const nExact = z * z * lambda * (1 - lambda) / (margin * margin * slope * slope), nDirect = Math.ceil(z * z * pi * (1 - pi) / (margin * margin) - 1e-9);
  const n = Math.ceil(nExact - 1e-9);
  return { n, nDirect, inflation: n / nDirect, steps: [
    { label: '预期“是”的比例', tex: tex`\lambda=${texNum(slope, 4)}\times ${texNum(pi, 4)}+${texNum(intercept, 4)}=${texNum(lambda, 4)}` },
    { label: '所需样本量', tex: tex`n=\frac{z^{2}\lambda(1-\lambda)}{e^{2}\,a^{2}}=\frac{${texNum(z, 4)}^{2}\times ${texNum(lambda, 4)}\times ${texNum(1 - lambda, 4)}}{${texNum(margin, 4)}^{2}\times ${texNum(slope, 4)}^{2}}=${texNum(nExact, 5)}` },
    { label: '与直接提问比较', tex: tex`n_{direct}=\frac{z^{2}\pi(1-\pi)}{e^{2}}=${nDirect},\qquad \frac{n}{n_{direct}}=${texNum(n / nDirect, 3)}` },
  ] };
}

export type TwoGroupPlan = { n1: number; n2: number; total: number; steps: Step[]; warnings: string[] };
/** Per-group sample size to detect a difference between two groups (two-sided test, normal approximation). */
export function twoGroupPlan(input: { kind: 'proportion'; p1: number; p2: number; alpha: number; power: number; ratio: number } | { kind: 'mean'; delta: number; sd: number; alpha: number; power: number; ratio: number }): TwoGroupPlan {
  const { alpha, power, ratio: k } = input;
  if (!(alpha > 0 && alpha < 0.5) || !(power > 0.5 && power < 1)) throw Error('显著性水平须在 (0, 0.5)，检验功效须在 (0.5, 1)。');
  if (!(k > 0)) throw Error('两组样本量之比须大于 0。');
  const za = zCritical(1 - alpha), zb = zOneSided(power), warnings: string[] = [];
  let n1Exact: number, formula: string;
  if (input.kind === 'proportion') {
    const { p1, p2 } = input;
    if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1) || p1 === p2) throw Error('两组比例须在 0 与 1 之间且不相等。');
    const pbar = (p1 + k * p2) / (1 + k), qbar = 1 - pbar;
    n1Exact = (za * Math.sqrt((1 + 1 / k) * pbar * qbar) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2) / k)) ** 2 / (p1 - p2) ** 2;
    formula = tex`n_1=\frac{\left[z_{1-\alpha/2}\sqrt{\left(1+\frac{1}{k}\right)\bar{p}\bar{q}}+z_{1-\beta}\sqrt{p_1q_1+\frac{p_2q_2}{k}}\right]^{2}}{(p_1-p_2)^{2}}=${texNum(n1Exact, 5)}`;
  } else {
    const { delta, sd } = input;
    if (!(delta !== 0 && sd > 0)) throw Error('差值不能为 0，标准差须大于 0。');
    n1Exact = (za + zb) ** 2 * sd * sd * (1 + 1 / k) / (delta * delta);
    if (k === 1) n1Exact += za * za / 4; else warnings.push('两组不等时未加 t 分布校正，样本较小时可再多取 1–2 份。');
    formula = k === 1
      ? tex`n_1=\frac{2\left(z_{1-\alpha/2}+z_{1-\beta}\right)^{2}\sigma^{2}}{\Delta^{2}}+\frac{z_{1-\alpha/2}^{2}}{4}=${texNum(n1Exact, 5)}`
      : tex`n_1=\frac{\left(z_{1-\alpha/2}+z_{1-\beta}\right)^{2}\sigma^{2}\left(1+\frac{1}{k}\right)}{\Delta^{2}}=${texNum(n1Exact, 5)}`;
  }
  const n1 = Math.ceil(n1Exact - 1e-9), n2 = Math.ceil(k * n1 - 1e-9);
  warnings.push('这是检验两组差异所需的样本量，与“估计比例达到某精度”的样本量回答不同问题；两者都需要时取较大者。');
  return { n1, n2, total: n1 + n2, warnings, steps: [
    { label: '临界值', tex: tex`z_{1-\alpha/2}=${texNum(za, 4)},\qquad z_{1-\beta}=${texNum(zb, 4)},\qquad k=\frac{n_2}{n_1}=${texNum(k, 4)}` },
    { label: '第一组样本量', tex: formula },
    { label: '两组合计', tex: tex`n_1=${n1},\quad n_2=${n2},\quad n_1+n_2=${n1 + n2}` },
  ] };
}

export type SystematicPlan = { interval: number; integer: boolean; steps: Step[] };
export function systematicPlan(N: number, n: number): SystematicPlan {
  if (!(Number.isInteger(N) && Number.isInteger(n) && n >= 1 && n <= N)) throw Error('总体与样本量须为整数，且 1 ≤ n ≤ N。');
  const k = N / n, integer = Number.isInteger(k);
  return { interval: k, integer, steps: [
    { label: '抽样间距', tex: tex`k=\frac{N}{n}=\frac{${N}}{${n}}=${texNum(k, 6)}` },
    integer
      ? { label: '入样位置', tex: tex`r,\ r+k,\ r+2k,\ \dots,\ r+(n-1)k,\qquad r\in\{1,\dots,${k}\}` }
      : { label: '入样位置（分数间距法）', tex: tex`\lceil r+jk\rceil,\ j=0,1,\dots,n-1,\qquad r\sim U(0,k]` },
  ] };
}
