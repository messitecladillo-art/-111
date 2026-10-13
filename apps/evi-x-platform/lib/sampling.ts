/**
 * Sample size and allocation for survey design.
 * Formulas follow Cochran (1977) Sampling Techniques and Kish (1965) Survey Sampling.
 * Precision statements are valid only under probability sampling; callers must say so.
 */

export const Z_BY_CONFIDENCE = { '0.9': 1.6448536269514722, '0.95': 1.959963984540054, '0.99': 2.5758293035489004 } as const;
export type Confidence = keyof typeof Z_BY_CONFIDENCE;

export type SizePlan = {
  target: 'proportion' | 'mean';
  confidence: Confidence;
  /** Allowed error: a proportion (0.05 = ±5 points) or a value in the outcome's own unit. */
  margin: number;
  /** Anticipated proportion for proportion targets; 0.5 is the conservative choice. */
  proportion: number;
  /** Standard deviation for mean targets, from a pilot or published study. */
  sd: number;
  /** Population size; null means effectively infinite. */
  population: number | null;
  designEffect: number;
  /** Expected share of contacts that become valid completes. */
  validRate: number;
  /** Subgroups that each need this precision on their own. */
  subgroups: number;
};
export type SizeStep = { label: string; formula: string; value: number };
export type SizeResult = { steps: SizeStep[]; perGroup: number; completes: number; contacts: number; warnings: string[] };

export function validateSizePlan(plan: SizePlan): string[] {
  const issues: string[] = [];
  if (!(plan.margin > 0)) issues.push('允许误差须大于 0。');
  if (plan.target === 'proportion' && !(plan.margin < 0.5)) issues.push('比例的允许误差须小于 50 个百分点。');
  if (plan.target === 'proportion' && !(plan.proportion > 0 && plan.proportion < 1)) issues.push('预估比例须在 0 与 100% 之间（不含端点）；不确定时用 50%。');
  if (plan.target === 'mean' && !(plan.sd > 0)) issues.push('标准差须大于 0，可来自预调查或已发表研究。');
  if (plan.population !== null && !(Number.isInteger(plan.population) && plan.population >= 2)) issues.push('总体规模须为不小于 2 的整数，或留空表示总体很大。');
  if (!(plan.designEffect >= 1)) issues.push('设计效应不小于 1；简单随机抽样取 1，整群抽样通常更大。');
  if (!(plan.validRate > 0 && plan.validRate <= 1)) issues.push('有效回收率须在 0 与 100% 之间。');
  if (!(Number.isInteger(plan.subgroups) && plan.subgroups >= 1 && plan.subgroups <= 50)) issues.push('需要单独估计的子群数为 1–50 的整数。');
  return issues;
}

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
export function sampleSize(plan: SizePlan): SizeResult {
  const issues = validateSizePlan(plan);
  if (issues.length) throw Error(issues.join(''));
  const z = Z_BY_CONFIDENCE[plan.confidence], steps: SizeStep[] = [], warnings: string[] = [];
  const n0 = plan.target === 'proportion'
    ? z * z * plan.proportion * (1 - plan.proportion) / plan.margin ** 2
    : z * z * plan.sd ** 2 / plan.margin ** 2;
  steps.push(plan.target === 'proportion'
    ? { label: '基础样本量（简单随机抽样）', formula: `n₀ = z²·p(1−p)/e² = ${round(z, 4)}² × ${plan.proportion} × ${round(1 - plan.proportion, 4)} ÷ ${plan.margin}²`, value: n0 }
    : { label: '基础样本量（简单随机抽样）', formula: `n₀ = z²·σ²/e² = ${round(z, 4)}² × ${plan.sd}² ÷ ${plan.margin}²`, value: n0 });
  let n = n0;
  const groupPopulation = plan.population === null ? null : plan.population / plan.subgroups;
  if (groupPopulation !== null) {
    n = n0 / (1 + (n0 - 1) / groupPopulation);
    steps.push({ label: plan.subgroups > 1 ? '有限总体校正（按子群规模近似相等）' : '有限总体校正', formula: `n₁ = n₀ ÷ [1 + (n₀ − 1)/N] = ${round(n0)} ÷ [1 + ${round(n0 - 1)} / ${round(groupPopulation)}]`, value: n });
  }
  if (plan.designEffect !== 1) {
    steps.push({ label: '乘以设计效应', formula: `n₂ = n₁ × deff = ${round(n)} × ${plan.designEffect}`, value: n * plan.designEffect });
    n *= plan.designEffect;
  }
  const perGroup = Math.ceil(n - 1e-9);
  if (groupPopulation !== null && perGroup > groupPopulation) warnings.push('所需样本超过总体规模，应考虑普查或放宽允许误差。');
  const completes = perGroup * plan.subgroups;
  if (plan.subgroups > 1) steps.push({ label: '各子群分别达到精度', formula: `每组 ${perGroup} × ${plan.subgroups} 组`, value: completes });
  const contacts = Math.ceil(completes / plan.validRate - 1e-9);
  steps.push({ label: '按有效回收率换算发放量', formula: `${completes} ÷ ${round(plan.validRate * 100, 1)}%`, value: contacts });
  if (plan.target === 'proportion' && plan.proportion !== 0.5) warnings.push('预估比例不是 50%：若真实比例更接近 50%，实际误差会大于设定值。');
  if (plan.designEffect === 1) warnings.push('设计效应取 1 即假定简单随机抽样；分层可能小于 1 的情形此处不计，整群或多阶段抽样通常大于 1。');
  return { steps, perGroup, completes, contacts, warnings };
}

/** Margin of error reached by n completes under the same probability-sampling assumptions. */
export function achievedMargin({ n, confidence, proportion, population, designEffect }: { n: number; confidence: Confidence; proportion: number; population: number | null; designEffect: number }): number | null {
  if (!(n >= 2) || !(proportion > 0 && proportion < 1) || !(designEffect >= 1)) return null;
  if (population !== null && !(population > n)) return population === n ? 0 : null;
  const fpc = population === null ? 1 : Math.sqrt((population - n) / (population - 1));
  return Z_BY_CONFIDENCE[confidence] * Math.sqrt(designEffect * proportion * (1 - proportion) / n) * fpc;
}

export type Stratum = { id: string; name: string; size: number; sd: number | null };
export type AllocationMethod = 'proportional' | 'neyman' | 'equal';
export type AllocationRow = { id: string; name: string; size: number; share: number; allocation: number; fraction: number; weight: number; relativeWeight: number };
export type Allocation = { rows: AllocationRow[]; total: number; warnings: string[] };

/** Largest-remainder rounding that keeps the exact total and never exceeds per-row caps. */
function roundToTotal(exact: number[], total: number, caps: number[]): number[] {
  const out = exact.map((v, i) => Math.min(caps[i], Math.floor(v + 1e-9)));
  let left = total - out.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => ({ i, r: v - Math.floor(v + 1e-9) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let pass = 0; left > 0 && pass < 2; pass++) for (const { i } of order) { if (left <= 0) break; if (out[i] < caps[i]) { out[i]++; left--; } }
  return out;
}
export function allocate(strata: Stratum[], total: number, method: AllocationMethod, minimum = 0): Allocation {
  if (strata.length < 2 || strata.length > 30) throw Error('分层数为 2–30。');
  if (strata.some(s => !(Number.isFinite(s.size) && s.size > 0))) throw Error('每层规模须为正数，可来自统计年鉴、普查或学校名册。');
  if (method === 'neyman' && strata.some(s => !(s.sd !== null && s.sd > 0))) throw Error('Neyman 分配需要每层的标准差（比例可用 √(p(1−p))）。');
  if (!(Number.isInteger(total) && total >= strata.length)) throw Error('总样本量须为整数，且不少于层数。');
  if (!(Number.isInteger(minimum) && minimum >= 0 && minimum * strata.length <= total)) throw Error('每层最少样本须为非负整数，且总和不超过总样本量。');
  const counts = strata.every(s => Number.isInteger(s.size)), caps = strata.map(s => counts ? s.size : Infinity);
  if (counts && total > caps.reduce((s, v) => s + v, 0)) throw Error('总样本量超过各层规模之和。');
  const score = strata.map(s => method === 'proportional' ? s.size : method === 'neyman' ? s.size * s.sd! : 1);
  // Fix strata that hit the minimum or their own size, then share the rest by score.
  const fixed = new Map<number, number>(), warnings: string[] = [];
  for (let guard = 0; guard <= strata.length; guard++) {
    const free = strata.map((_, i) => i).filter(i => !fixed.has(i)), remaining = total - [...fixed.values()].reduce((s, v) => s + v, 0);
    const weight = free.reduce((s, i) => s + score[i], 0);
    const exact = free.map(i => remaining * score[i] / weight);
    const low = free.filter((i, k) => exact[k] < minimum), high = free.filter((i, k) => exact[k] > caps[i]);
    if (!low.length && !high.length) {
      const rounded = roundToTotal(exact, remaining, free.map(i => caps[i]));
      free.forEach((i, k) => fixed.set(i, rounded[k]));
      break;
    }
    low.forEach(i => fixed.set(i, minimum));
    high.forEach(i => { fixed.set(i, caps[i]); warnings.push(`「${strata[i].name}」按公式分配超过该层规模，已全部纳入（普查该层）。`); });
  }
  const population = strata.reduce((s, v) => s + v.size, 0);
  if (minimum > 0 && method !== 'equal') warnings.push(`为保证每层至少 ${minimum} 份，部分层偏离${method === 'neyman' ? 'Neyman' : '比例'}分配，分析时须用设计权数加权。`);
  if (method !== 'proportional') warnings.push('非比例分配下各层抽样比不同，汇总全体时必须使用设计权数，否则结构失衡。');
  const rows = strata.map((s, i) => {
    const allocation = fixed.get(i)!;
    return { id: s.id, name: s.name, size: s.size, share: s.size / population, allocation, fraction: allocation / s.size, weight: allocation ? s.size / allocation : 0, relativeWeight: allocation ? (s.size / population) / (allocation / total) : 0 };
  });
  return { rows, total: rows.reduce((s, r) => s + r.allocation, 0), warnings };
}

export type SamplingKind = 'srs' | 'stratified' | 'cluster' | 'quota' | 'convenience';
export const SAMPLING_KINDS: Record<SamplingKind, { label: string; probability: boolean; note: string }> = {
  srs: { label: '简单随机抽样', probability: true, note: '需要完整抽样框，每个单位入样概率相等。' },
  stratified: { label: '分层随机抽样', probability: true, note: '按已知结构分层后在层内随机抽取，可用设计权数恢复总体结构。' },
  cluster: { label: '整群 / 多阶段抽样', probability: true, note: '先抽群（学校、社区、门店）再抽个体；群内相似使设计效应通常大于 1。' },
  quota: { label: '配额抽样（非概率）', probability: false, note: '按控制变量配额招募，层内不是随机抽取，样本结构可控但不能计算抽样误差。' },
  convenience: { label: '便利 / 网络招募（非概率）', probability: false, note: '受访者自愿或经渠道触达，入样概率未知，只能描述样本。' },
};

const pctText = (v: number) => `${round(v * 100, 1)}%`;
/** A neutral methods paragraph built only from the user's own inputs. */
export function methodsStatement({ kind, population, frame, plan, result }: { kind: SamplingKind; population: string; frame: string; plan: SizePlan; result: SizeResult }): string {
  const meta = SAMPLING_KINDS[kind], conf = `${Number(plan.confidence) * 100}%`;
  const precision = plan.target === 'proportion' ? `±${round(plan.margin * 100, 1)} 个百分点的允许误差、预估比例 ${pctText(plan.proportion)}` : `±${plan.margin} 的允许误差、标准差 ${plan.sd}`;
  const adjustments = [plan.population !== null ? `有限总体规模 ${plan.population.toLocaleString('zh-CN')}` : '', plan.designEffect !== 1 ? `设计效应 ${plan.designEffect}` : '', plan.subgroups > 1 ? `${plan.subgroups} 个子群分别达到该精度` : ''].filter(Boolean).join('、');
  const base = `本研究的目标总体为${population || '〔请填写目标总体〕'}，抽样框为${frame || '〔请填写抽样框及其覆盖情况〕'}，采用${meta.label}。按 ${conf} 置信水平、${precision}计算${adjustments ? `，并考虑${adjustments}` : ''}，所需有效样本为 ${result.completes} 份；按预计有效回收率 ${pctText(plan.validRate)}，计划发放 ${result.contacts} 份。`;
  return meta.probability
    ? `${base}在上述抽样设计得到执行的前提下，比例估计的抽样误差不超过设定的允许误差；实际回收后按实际有效样本量重新计算精度，并报告无应答情况。`
    : `${base}由于${meta.label.replace('（非概率）', '')}不满足随机抽样前提，样本量仅作为规模参照，报告中不计算抽样误差，结论限于样本内的分布与差异；对目标总体的推广需结合配额变量与总体结构的对照论证。`;
}
