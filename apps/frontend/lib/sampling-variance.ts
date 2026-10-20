/**
 * Variance estimation for weighted, stratified, clustered survey data: Taylor linearization (the default
 * of most survey software), the stratified jackknife (JKn), balanced repeated replication with Fay's
 * adjustment, the Rao–Wu rescaling bootstrap and random groups. All use the “ultimate cluster”
 * approximation: primary sampling units (PSUs) are treated as drawn with replacement within strata unless
 * the number of PSUs in each stratum's population is supplied. Reference: Wolter (2007) Introduction to
 * Variance Estimation, 2nd ed.; checked against R survey (Lumley) in tests.
 */
import { interval, seededRandom, randomInt, sum, tCriticalAt, type Interval } from './sampling-core.ts';

export type DesignRow = { y: number; w: number; stratum: string; psu: string; inDomain?: boolean };
export type Statistic = 'mean' | 'total';
export type VarianceMethod = 'linearization' | 'jackknife' | 'brr' | 'bootstrap' | 'random-groups';
export type DesignOptions = { statistic: Statistic; confidence: number; fpc?: Record<string, number> | null; fay?: number; replicates?: number; seed?: string; groups?: number };
export type DesignSummary = { n: number; domainN: number; strata: number; psus: number; df: number; sumWeights: number; nKish: number; kishDeff: number };
export type DesignEstimate = { method: VarianceMethod; estimate: number; variance: number; se: number; df: number; crit: number; ci: Interval; logitCi: Interval | null; deff: number | null; replicates: number; notes: string[] };

type Psu = { stratum: string; key: string; a: number; b: number };
type Layout = { strata: Map<string, Psu[]>; A: number; B: number; summary: DesignSummary };
function layout(rows: DesignRow[], statistic: Statistic): Layout {
  if (rows.length < 2) throw Error('至少需要 2 条记录。');
  for (const r of rows) {
    if (!Number.isFinite(r.y)) throw Error('结果变量含有非数值，请先剔除或设为缺失。');
    if (!(Number.isFinite(r.w) && r.w > 0)) throw Error('权数须为正数；权数为 0 或缺失的记录请先剔除。');
  }
  const strata = new Map<string, Map<string, Psu>>();
  let A = 0, B = 0, domainN = 0;
  for (const r of rows) {
    const d = r.inDomain === false ? 0 : 1;
    domainN += d;
    const a = r.w * d * r.y, b = statistic === 'mean' ? r.w * d : 0;
    A += a; B += b;
    let psus = strata.get(r.stratum);
    if (!psus) strata.set(r.stratum, psus = new Map());
    const psu = psus.get(r.psu);
    if (psu) { psu.a += a; psu.b += b; } else psus.set(r.psu, { stratum: r.stratum, key: r.psu, a, b });
  }
  if (statistic === 'mean' && !(B > 0)) throw Error('所选子总体中没有记录。');
  const lonely = [...strata].filter(([, psus]) => psus.size < 2).map(([name]) => name);
  if (lonely.length) throw Error(`层「${lonely.slice(0, 3).join('」「')}」只有 1 个初级单元，无法估计层内方差；请与相邻层合并后再计算。`);
  const weights = rows.map(r => r.w), sw = sum(weights), sw2 = sum(weights.map(w => w * w));
  const psus = sum([...strata.values()].map(m => m.size));
  const summary = { n: rows.length, domainN, strata: strata.size, psus, df: psus - strata.size, sumWeights: sw, nKish: sw * sw / sw2, kishDeff: rows.length * sw2 / (sw * sw) };
  return { strata: new Map([...strata].map(([k, m]) => [k, [...m.values()]])), A, B, summary };
}
const ratio = (statistic: Statistic, a: number, b: number) => statistic === 'mean' ? a / b : a;

/** Design summary only (strata, PSUs, degrees of freedom, Kish's weighting effect). */
export function describeDesign(rows: DesignRow[]): DesignSummary {
  return layout(rows, 'total').summary;
}

/** Sylvester Hadamard matrix entry: H[r][c] = (−1)^{popcount(r AND c)}. */
const hadamard = (r: number, c: number) => { let x = r & c, bits = 0; while (x) { bits += x & 1; x >>= 1; } return bits % 2 ? -1 : 1; };

/**
 * Estimate a weighted mean (ratio Σwy/Σw) or total with the chosen variance method. Domains (subgroups)
 * keep the full design: records outside the domain stay in their PSUs with zero contribution.
 */
export function designEstimate(rows: DesignRow[], options: DesignOptions & { method: VarianceMethod }): DesignEstimate {
  const { statistic, confidence, method } = options, { strata, A, B, summary } = layout(rows, statistic);
  const theta = ratio(statistic, A, B), notes: string[] = [];
  const fpc = options.fpc ?? null;
  const finite = (h: string, nh: number) => {
    if (!fpc || !(h in fpc)) return 1;
    const Nh = fpc[h];
    if (!(Number.isInteger(Nh) && Nh >= nh)) throw Error(`层「${h}」的总体初级单元数须为不小于样本初级单元数的整数。`);
    return 1 - nh / Nh;
  };
  let variance = 0, replicates = 0;
  if (method === 'linearization') {
    for (const [h, psus] of strata) {
      const nh = psus.length, z = psus.map(p => statistic === 'mean' ? (p.a - theta * p.b) / B : p.a), zbar = sum(z) / nh;
      variance += finite(h, nh) * nh / (nh - 1) * sum(z.map(v => (v - zbar) ** 2));
    }
  } else if (method === 'jackknife') {
    for (const [h, psus] of strata) {
      const nh = psus.length, c = nh / (nh - 1), Ah = sum(psus.map(p => p.a)), Bh = sum(psus.map(p => p.b));
      let s = 0;
      for (const p of psus) s += (ratio(statistic, A - Ah + c * (Ah - p.a), B - Bh + c * (Bh - p.b)) - theta) ** 2;
      variance += finite(h, nh) * (nh - 1) / nh * s;
      replicates += nh;
    }
  } else if (method === 'brr') {
    const list = [...strata.values()];
    if (list.some(p => p.length !== 2)) throw Error('平衡半样本法要求每层恰好 2 个初级单元；请改用刀切法或线性化。');
    const H = list.length, rho = options.fay ?? 0;
    if (!(rho >= 0 && rho < 1)) throw Error('Fay 系数须在 0 与 1 之间。');
    let R = 1; while (R < H + 1) R *= 2;
    let s = 0;
    for (let r = 0; r < R; r++) {
      let a = 0, b = 0;
      list.forEach((p, h) => { const first = hadamard(r, h + 1) > 0; const [x, y] = first ? [p[0], p[1]] : [p[1], p[0]]; a += (2 - rho) * x.a + rho * y.a; b += (2 - rho) * x.b + rho * y.b; });
      s += (ratio(statistic, a, b) - theta) ** 2;
    }
    variance = s / (R * (1 - rho) ** 2); replicates = R;
    if (fpc) notes.push('平衡半样本法不作有限总体校正。');
  } else if (method === 'bootstrap') {
    const B0 = options.replicates ?? 1000;
    if (!(Number.isInteger(B0) && B0 >= 50 && B0 <= 20000)) throw Error('自助法重复次数须为 50–20000 的整数。');
    const rand = seededRandom(options.seed ?? 'bootstrap'), list = [...strata.values()];
    let s = 0;
    for (let b = 0; b < B0; b++) {
      let num = 0, den = 0;
      for (const psus of list) {
        const nh = psus.length, counts = new Array<number>(nh).fill(0);
        for (let k = 0; k < nh - 1; k++) counts[randomInt(rand, nh)]++;
        const scale = nh / (nh - 1);
        psus.forEach((p, i) => { num += scale * counts[i] * p.a; den += scale * counts[i] * p.b; });
      }
      if (statistic === 'mean' && den <= 0) continue;
      s += (ratio(statistic, num, den) - theta) ** 2;
      replicates++;
    }
    variance = s / replicates;
    notes.push(`Rao–Wu 自助法 ${replicates} 次重复（随机种子 ${options.seed ?? 'bootstrap'}），每层有放回地重抽 $n_h-1$ 个初级单元；结果有随机波动，不作有限总体校正。`);
  } else {
    const all = [...strata.values()].flat(), G = options.groups ?? Math.min(10, all.length);
    if (!(Number.isInteger(G) && G >= 2 && G <= all.length)) throw Error('随机组数须为 2 到初级单元数之间的整数。');
    const rand = seededRandom(options.seed ?? 'groups'), order = all.map((p, i) => ({ p, k: rand(), i })).sort((x, y) => x.k - y.k);
    const parts = Array.from({ length: G }, () => ({ a: 0, b: 0 }));
    order.forEach((o, j) => { parts[j % G].a += G * o.p.a; parts[j % G].b += G * o.p.b; });
    const estimates = parts.filter(p => statistic === 'total' || p.b > 0).map(p => ratio(statistic, p.a, p.b)), mean = sum(estimates) / estimates.length;
    variance = sum(estimates.map(e => (e - mean) ** 2)) / (estimates.length * (estimates.length - 1));
    replicates = estimates.length;
    notes.push(`随机组法把 ${all.length} 个初级单元随机分为 ${G} 组，忽略分层，自由度只有组数减 1。`);
  }
  const df = method === 'random-groups' ? replicates - 1 : summary.df;
  const se = Math.sqrt(variance), crit = tCriticalAt(confidence, df > 0 ? df : null);
  let logitCi: Interval | null = null;
  if (statistic === 'mean' && rows.every(r => r.y === 0 || r.y === 1) && theta > 0 && theta < 1) {
    const l = Math.log(theta / (1 - theta)), half = crit * se / (theta * (1 - theta)), expit = (x: number) => 1 / (1 + Math.exp(-x));
    logitCi = { lower: expit(l - half), upper: expit(l + half) };
  }
  // Kish design effect for a mean: v / v_srs with Ŝ² = Σw(y−ȳ)²/Σw · n/(n−1) over the domain.
  let deff: number | null = null;
  if (statistic === 'mean' && summary.domainN > 1) {
    let num = 0;
    for (const r of rows) if (r.inDomain !== false) num += r.w * (r.y - theta) ** 2;
    const S2 = num / B * summary.domainN / (summary.domainN - 1), Nhat = B, n = summary.domainN;
    const vsrs = Nhat > n ? S2 * (Nhat - n) / (Nhat * n) : S2 / n;
    if (!(Nhat > n)) notes.push('权数之和不大于样本量（相对权数），设计效应按放回简单随机抽样计算。');
    deff = vsrs > 0 ? variance / vsrs : null;
  }
  return { method, estimate: theta, variance, se, df, crit, ci: interval(theta, se, crit), logitCi, deff, replicates, notes };
}
