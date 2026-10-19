/**
 * Reproducible sample selection. Every draw takes a text seed, so the same seed reproduces the same
 * sample and the selection record can be placed in an appendix and checked by others.
 */
import { randomInt, seededRandom, sum } from './sampling-core.ts';

export type FrameUnit = { name: string; size: number };

/** SRS without replacement of n from 1..N (Floyd's algorithm); returns sorted positions. */
export function selectSrs(N: number, n: number, seed: string): number[] {
  if (!(Number.isInteger(N) && Number.isInteger(n) && n >= 1 && n <= N)) throw Error('须满足 1 ≤ n ≤ N 且均为整数。');
  const rand = seededRandom(seed), chosen = new Set<number>();
  for (let j = N - n + 1; j <= N; j++) {
    const t = 1 + randomInt(rand, j);
    chosen.add(chosen.has(t) ? j : t);
  }
  return [...chosen].sort((a, b) => a - b);
}

export type SystematicDraw = { interval: number; start: number; positions: number[] };
/**
 * Systematic selection with a fractional interval k = N/n: positions ⌈r + jk⌉ with r uniform on (0, k].
 * Every unit has inclusion probability n/N exactly and the sample size is always n; with an integer k
 * this is the classic random start r ∈ {1, …, k}.
 */
export function selectSystematic(N: number, n: number, seed: string): SystematicDraw {
  if (!(Number.isInteger(N) && Number.isInteger(n) && n >= 1 && n <= N)) throw Error('须满足 1 ≤ n ≤ N 且均为整数。');
  const k = N / n, rand = seededRandom(seed), r = (1 - rand()) * k;
  const positions = Array.from({ length: n }, (_, j) => Math.min(N, Math.ceil(r + j * k - 1e-9)));
  return { interval: k, start: Number.isInteger(k) ? Math.ceil(r - 1e-9) : r, positions };
}

function validateSizes(units: FrameUnit[]) {
  if (units.length < 2) throw Error('抽样框至少需要 2 个单位。');
  for (const u of units) if (!(Number.isFinite(u.size) && u.size > 0)) throw Error(`「${u.name}」的规模须为正数。`);
}
export type PpsDraw = { order: number; index: number; name: string; random: number; p: number };
export type PpsWithReplacement = { draws: PpsDraw[]; total: number; attempts: number; method: 'cumulative' | 'lahiri' };
/**
 * PPS with replacement. “cumulative” is the cumulative-total (代码法) method: a random number in (0, M₀]
 * picks the unit whose cumulative range contains it. “lahiri” picks a unit at random and accepts it when a
 * second random number in (0, M_max] does not exceed its size (Lahiri 1951). Both give p_i = M_i/M₀ per draw.
 */
export function selectPpsWithReplacement(units: FrameUnit[], n: number, seed: string, method: 'cumulative' | 'lahiri' = 'cumulative'): PpsWithReplacement {
  validateSizes(units);
  if (!(Number.isInteger(n) && n >= 1 && n <= 100000)) throw Error('抽取次数须为 1–100000 的整数。');
  const rand = seededRandom(seed), total = sum(units.map(u => u.size)), integer = units.every(u => Number.isInteger(u.size));
  const cum: number[] = []; let running = 0;
  for (const u of units) { running += u.size; cum.push(running); }
  const draws: PpsDraw[] = []; let attempts = 0;
  const maxSize = Math.max(...units.map(u => u.size));
  for (let d = 0; d < n; d++) {
    if (method === 'cumulative') {
      const r = integer ? 1 + randomInt(rand, total) : (1 - rand()) * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] >= r) hi = mid; else lo = mid + 1; }
      draws.push({ order: d + 1, index: lo, name: units[lo].name, random: r, p: units[lo].size / total });
      attempts++;
    } else {
      for (let guard = 0; guard < 100000; guard++) {
        attempts++;
        const i = randomInt(rand, units.length), r = integer ? 1 + randomInt(rand, maxSize) : (1 - rand()) * maxSize;
        if (r <= units[i].size) { draws.push({ order: d + 1, index: i, name: units[i].name, random: r, p: units[i].size / total }); break; }
      }
    }
  }
  return { draws, total, attempts, method };
}

export type PpsSystematicUnit = { index: number; name: string; size: number; pi: number; certainty: boolean };
export type PpsSystematic = { selected: PpsSystematicUnit[]; interval: number; start: number; certainty: number; inclusion: number[] };
/**
 * Systematic πps without replacement (Madow 1949). Units at least as large as the interval are taken with
 * certainty (π = 1) and removed until none remain; the rest get π_i = n′M_i/M′ < 1. Frame order matters:
 * sorting by a meaningful variable gives implicit stratification.
 */
export function selectPpsSystematic(units: FrameUnit[], n: number, seed: string): PpsSystematic {
  validateSizes(units);
  if (!(Number.isInteger(n) && n >= 1 && n < units.length)) throw Error('入样单位数须为整数，且小于抽样框单位数。');
  const certain = new Set<number>();
  for (let changed = true; changed;) {
    changed = false;
    const rest = units.map((_, i) => i).filter(i => !certain.has(i)), m = n - certain.size;
    if (m <= 0) break;
    const restTotal = sum(rest.map(i => units[i].size));
    for (const i of rest) if (units[i].size * m >= restTotal) { certain.add(i); changed = true; }
  }
  const rest = units.map((_, i) => i).filter(i => !certain.has(i)), m = n - certain.size;
  const restTotal = sum(rest.map(i => units[i].size)), interval = m > 0 ? restTotal / m : 0;
  const inclusion = units.map((u, i) => certain.has(i) ? 1 : m > 0 ? m * u.size / restTotal : 0);
  const selected: PpsSystematicUnit[] = [...certain].sort((a, b) => a - b).map(i => ({ index: i, name: units[i].name, size: units[i].size, pi: 1, certainty: true }));
  let start = 0;
  if (m > 0) {
    const rand = seededRandom(seed);
    start = (1 - rand()) * interval;
    let cumulative = 0, j = 0;
    for (const i of rest) {
      const lower = cumulative; cumulative += units[i].size;
      while (j < m && start + j * interval <= cumulative + 1e-9 && start + j * interval > lower) {
        selected.push({ index: i, name: units[i].name, size: units[i].size, pi: inclusion[i], certainty: false });
        j++;
      }
    }
  }
  selected.sort((a, b) => a.index - b.index);
  return { selected, interval, start, certainty: certain.size, inclusion };
}

export type StratifiedDraw = { name: string; N: number; n: number; positions: number[] };
/** Independent SRS in each stratum; each stratum gets its own derived seed. */
export function selectStratified(strata: { name: string; N: number; n: number }[], seed: string): StratifiedDraw[] {
  if (strata.length < 2) throw Error('至少需要 2 层。');
  return strata.map((s, h) => ({ ...s, positions: selectSrs(s.N, s.n, `${seed}/${h + 1}`) }));
}

/* ───────────── Multi-stage design description ───────────── */

export type StageMethod = 'srs' | 'systematic' | 'pps' | 'stratified' | 'census' | 'intercept' | 'quota' | 'convenience';
export const STAGE_METHODS: Record<StageMethod, { label: string; probability: boolean; hint: string }> = {
  srs: { label: '简单随机抽样', probability: true, hint: '名单完整、单位规模相近时使用' },
  systematic: { label: '系统抽样（等距）', probability: true, hint: '按名单顺序等距抽取，名单不能有与间距重合的周期' },
  pps: { label: 'PPS 抽样（按规模大小成比例）', probability: true, hint: '单位规模差异大时使用，后续阶段每个单位抽相同人数可得自加权样本' },
  stratified: { label: '分层随机抽样', probability: true, hint: '先按已知特征分层，层内随机抽取' },
  census: { label: '全部入样（整群）', probability: true, hint: '入样单位内的所有下级单位都调查' },
  intercept: { label: '拦截式抽样（非概率）', probability: false, hint: '在现场拦截访问，入样概率未知' },
  quota: { label: '配额抽样（非概率）', probability: false, hint: '按控制特征的配额招募，层内不随机' },
  convenience: { label: '方便 / 网络招募（非概率）', probability: false, hint: '自愿参与或渠道触达，入样概率未知' },
};
export type PlanStage = { id: string; unit: string; frame: string; method: StageMethod; frameSize: number | null; take: number | null; sizeMeasure: string; strata: string };
export type SelectedNode = { name: string; frame?: string; children: SelectedNode[] };
export type PlanGroup = { id: string; name: string; population: string; completes: number | null; stages: PlanStage[]; tree: SelectedNode[] };

export function groupIsProbability(group: PlanGroup): boolean {
  return group.stages.length > 0 && group.stages.every(s => STAGE_METHODS[s.method].probability);
}
/** Inclusion probability of an element when every stage is an equal-probability draw, or null otherwise. */
export function equalProbabilityInclusion(group: PlanGroup): number | null {
  if (!groupIsProbability(group)) return null;
  let p = 1;
  for (const s of group.stages) {
    if (s.method === 'census') continue;
    if (s.method === 'pps' || s.frameSize === null || s.take === null || !(s.frameSize > 0)) return null;
    p *= Math.min(1, s.take / s.frameSize);
  }
  return p;
}
const stageNames = ['第一阶段', '第二阶段', '第三阶段', '第四阶段', '第五阶段'];
const levelNames = ['初级', '二级', '三级', '四级', '五级'];
/** Small counts in words, as Chinese methods sections write them. */
export const countWord = (n: number) => ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'][n] ?? String(n);
function stageSentence(stage: PlanStage, index: number, stages: PlanStage[]): string {
  const meta = STAGE_METHODS[stage.method], frame = stage.frame.trim() || `〔第${index + 1}级抽样框〕`, unit = stage.unit.trim() || '单位';
  const count = stage.take ? ` ${stage.take} 个${unit}` : unit;
  // Later stages are drawn inside every unit selected at the previous stage.
  const within = index > 0 ? `在每个入样${stages[index - 1].unit.trim() || '单位'}内，` : '';
  switch (stage.method) {
    case 'pps': return `${stageNames[index]}${within}以${frame}为抽样框，按${stage.sizeMeasure.trim() || '规模'}采用 PPS 抽样抽取${count}`;
    case 'stratified': return `${stageNames[index]}${within}以${frame}为抽样框，${stage.strata.trim() ? `按${stage.strata.trim()}分层，` : ''}层内随机抽取${count}`;
    case 'census': return `${stageNames[index]}${within}对全部${unit}进行调查`;
    case 'intercept': return `${stageNames[index]}${within || `在${frame}中`}对${unit}进行拦截式访问`;
    case 'quota': return `${stageNames[index]}${within || `在${frame}中`}按配额招募${unit}`;
    case 'convenience': return `${stageNames[index]}${within}通过${frame}招募${unit}`;
    default: return `${stageNames[index]}${within}以${frame}为抽样框，采用${meta.label}抽取${count}`;
  }
}
/** A methods paragraph for one target group, worded by whether every stage is a probability draw. */
export function groupStatement(group: PlanGroup): string {
  if (!group.stages.length) return '';
  const probability = groupIsProbability(group), name = group.name.trim() || '该群体';
  const stages = group.stages.map((s, i) => stageSentence(s, i, group.stages)).join('；');
  const scheme = group.stages.length === 1 ? '单阶段抽样' : `${countWord(group.stages.length)}阶段抽样`;
  const base = `对${name}${group.population.trim() ? `（${group.population.trim()}）` : ''}采用${scheme}：${stages}${group.completes ? `，计划获得有效样本 ${group.completes} 份` : ''}。`;
  if (probability) {
    const p = equalProbabilityInclusion(group);
    return base + (p !== null ? `各阶段均为等概率抽样，每个最终单位的入样概率约为 ${(p * 100).toPrecision(3)}%，样本自加权。` : '各阶段均为概率抽样，分析时按各阶段入样概率之积的倒数加权，并按多阶段设计计算抽样误差。');
  }
  const nonProb = group.stages.filter(s => !STAGE_METHODS[s.method].probability).map(s => STAGE_METHODS[s.method].label.replace('（非概率）', '')).join('、');
  return base + `由于${nonProb}阶段的入样概率未知，样本整体不是概率样本：前几阶段的随机抽取使样本分布到不同地域与类型的单位，但不能据此计算严格的抽样误差；报告中按样本量公式给出的精度仅作规模参照，并说明样本结构与总体的差异。`;
}
/**
 * Selected units written as an indented outline, one unit per line; two spaces or a tab per level.
 * “名称｜抽样框” attaches a frame label to a unit (e.g. the stratum it was drawn from).
 */
export function parseSelectionTree(text: string): SelectedNode[] {
  const roots: SelectedNode[] = [], stack: { depth: number; node: SelectedNode }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^[\t ]*/)![0].replace(/\t/g, '  ').length, depth = Math.floor(indent / 2);
    const [name, frame] = raw.trim().split(/[|｜]/).map(x => x.trim());
    const node: SelectedNode = { name, ...(frame ? { frame } : {}), children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node); else roots.push(node);
    stack.push({ depth, node });
  }
  return roots;
}
/** Row spans for a hierarchical table: a cell merges with the cells below while it and every cell to its left repeat. */
export function mergeSpans(rows: string[][]): number[][] {
  const spans = rows.map(r => r.map(() => 1));
  for (let c = 0; c < (rows[0]?.length ?? 0); c++) {
    for (let r = 0; r < rows.length;) {
      let end = r + 1;
      while (end < rows.length && rows[end].slice(0, c + 1).every((v, k) => v === rows[r][k])) end++;
      spans[r][c] = end - r;
      for (let k = r + 1; k < end; k++) spans[k][c] = 0;
      r = end;
    }
  }
  return spans;
}

/**
 * The multi-level frame table used in survey reports: frame → selected unit → next frame … → final frame.
 * Later-stage frames are written relative to their parent (“青山区所有街道”, “该街道所有居民”); a node may
 * override its frame cell, e.g. with the stratum it was drawn from (“武汉所有本科学校”).
 */
export function frameTable(group: PlanGroup): { headers: string[]; rows: string[][] } {
  const L = group.stages.length;
  if (!L) return { headers: [], rows: [] };
  const headers: string[] = [];
  group.stages.forEach((s, k) => { headers.push(`${levelNames[k] ?? `${k + 1}级`}单元抽样框`); if (k < L - 1) headers.push(`入样${s.unit.trim() || '单位'}`); });
  const frameCell = (k: number, parent: SelectedNode | null, node?: SelectedNode) => {
    if (node?.frame?.trim()) return node.frame.trim();
    const stage = group.stages[k], within = stage.frame.trim() || `所有${stage.unit.trim() || '单位'}`;
    if (k === 0) return within;
    return k === L - 1 ? `该${group.stages[k - 1].unit.trim() || '单位'}${within}` : `${parent?.name ?? ''}${within}`;
  };
  const rows: string[][] = [];
  const walk = (nodes: SelectedNode[], k: number, prefix: string[], parent: SelectedNode | null) => {
    for (const node of nodes) {
      const row = [...prefix, frameCell(k, parent, node), node.name];
      if (k + 1 === L - 1) rows.push([...row, frameCell(L - 1, node)]);
      else if (node.children.length) walk(node.children, k + 1, row, node);
      else rows.push([...row, ...Array(headers.length - row.length).fill('（待抽取）')]);
    }
  };
  if (L === 1) rows.push([frameCell(0, null)]);
  else if (group.tree.length) walk(group.tree, 0, [], null);
  else rows.push(headers.map((_, i) => i % 2 === 0 ? frameCell(i / 2, null) : '（待抽取）'));
  return { headers, rows };
}
