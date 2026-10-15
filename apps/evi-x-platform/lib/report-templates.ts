/**
 * Deterministic writing for registered results: a caption, an optional method paragraph with its formulas, and a
 * reading paragraph in the order a reviewer reads a result — the main pattern with its numbers, then the test with
 * its statistic, degrees of freedom, p value and effect size, then what the test does not establish.
 *
 * Every number comes from the registered result, statistical symbols are inline formulas, figures and tables are
 * cited by reference token, and the wording never turns an association into a cause. No AI service is involved.
 */
import type { ResultSnapshot } from './research-quality.ts';
import { referenceToken } from './report-numbering.ts';
import { categoryOrder, crosstabOrder, groupRows, scaleOrder, scaleScores } from './report-tables.ts';

export type ResultRefs = { figure?: string; table?: string };
/**
 * `key` is how the method's defining formula begins (without spaces): a report that already shows a formula starting
 * this way — including the combined forms written by earlier versions — does not get the method paragraph again.
 */
export type MethodIntro = { key: string; text: string; formulas: string[]; where: string };

const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
// Running text sets negative numbers with a true minus sign; inside $…$ TeX does that itself.
const sign = (s: string) => s.replace(/^-(?=\d)/, '−');
const pct = (v: number) => `${sign(v.toFixed(1))}%`;
const stat = (v: number) => sign(v.toFixed(2));
const coef = (v: number) => sign(v.toFixed(3));
const plain = (v: number) => sign(Number.isInteger(v) ? String(v) : v.toFixed(2));
const tex2 = (v: number) => v.toFixed(2), tex3 = (v: number) => v.toFixed(3);
const dof = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);
/** A p value as it is set inside an inline formula. */
const pMath = (p: number) => p < 0.001 ? 'p<0.001' : `p=${p.toFixed(3)}`;
/**
 * Labels come from survey data and question wording, so they are copied as literal text: a "[[图:…]]" or "$…$"
 * inside a label must not turn into a reference or a formula.
 */
export const literalText = (s: string) => s.replace(/\[\[/g, '［［').replace(/\]\]/g, '］］').replace(/\$/g, '\\$');
const literal = literalText;
export const captionText = (s: string) => s.replace(/\[\[/g, '［［').replace(/\]\]/g, '］］').replace(/\$/g, '＄');
const quote = (s: string) => `“${literal(s)}”`;
const metric = (r: ResultSnapshot, label: string | RegExp) =>
  num(r.metrics.find(m => typeof label === 'string' ? m.label === label : label.test(m.label))?.value);
const row = (r: ResultSnapshot, label: string, column = 1) => num(r.rows.find(x => x[0] === label)?.[column]);
const range = (a: number, b: number, show: (v: number) => string) => `${show(a)}～${show(b)}`;

/** A question label as a variable name: "Q3. 您的年龄段（单选）：" → "年龄段". */
export function variableLabel(name: string): string {
  const label = name.trim()
    .replace(/^(?:[QqＱ]\s*\d+(?:[._\-－]\d+)*\s*[.．、:：_\-－)）]?|第\s*\d+\s*题\s*[.．、:：]?|\d+(?:[.．]\d+)*\s*[.．、:：_)）])\s*/u, '')
    .replace(/\s*[（(［[【](?:单选|多选|必答|选填|可多选|量表|填空)[^）)］\]】]*[）)］\]】]\s*$/u, '')
    .replace(/[：:？?。．.\s]+$/u, '')
    .replace(/^您的/u, '');
  return label || name.trim();
}
/** A variable name for running text (literal; see `literal`). */
const variable = (r: ResultSnapshot, i: number) => r.variables?.[i] ? literal(variableLabel(r.variables[i])) : '';

/** A caption in report style, from the analysed variables; the registered title when they are unknown. */
export function resultCaption(r: ResultSnapshot): string {
  const [a, b] = [0, 1].map(i => r.variables?.[i] ? captionText(variableLabel(r.variables[i])) : '');
  const title = captionText(r.title);
  switch (r.method) {
    case 'frequency': return a ? `受访者${a}分布` : title;
    case 'crosstab': return a && b ? `不同${a}受访者的${b}分布` : title;
    case 'groups': return a && b ? `不同${a}受访者的${b}比较` : title;
    case 'numeric': return a ? `${a}的分布` : title;
    case 'pearson': case 'spearman': return a && b ? `${a}与${b}的相关分析` : title;
    case 'alpha': return a ? `${a}量表信度分析` : title;
    case 'quality-control': return '问卷有效性筛查';
    default: return title;
  }
}

/** "由图 4-1 可知，" / "由图 4-1 和表 4-1 可知，" for the blocks placed with the result. */
function lead(refs: ResultRefs): string {
  const cited = [refs.figure && referenceToken('figure', refs.figure), refs.table && referenceToken('table', refs.table)].filter(Boolean);
  return cited.length ? `由${cited.join('和')}可知，` : '';
}
const significance = (p: number, yes: string, no: string) => p < 0.05 ? `，在 0.05 的显著性水平下，${yes}` : `，未达到 0.05 的显著性水平，${no}`;
const strengthV = (v: number) => v < 0.1 ? '很弱' : v < 0.3 ? '较弱' : v < 0.5 ? '中等' : '较强';
const strengthR = (v: number) => { const a = Math.abs(v); return a < 0.1 ? '极弱的' : a < 0.3 ? '弱' : a < 0.5 ? '中等程度的' : '较强的'; };
const effectEta = (v: number) => v < 0.01 ? '很小' : v < 0.06 ? '较小' : v < 0.14 ? '中等' : '较大';
const effectG = (v: number) => { const a = Math.abs(v); return a < 0.2 ? '很小' : a < 0.5 ? '较小' : a < 0.8 ? '中等' : '较大'; };

function frequency(r: ResultSnapshot, refs: ResultRefs): string {
  const labels = r.rows.map(x => String(x[0])), v = variable(r, 0);
  const share = (label: string) => row(r, label, 2) ?? ((row(r, label) ?? 0) / Math.max(1, r.n) * 100);
  const base = `${lead(refs)}${r.total > r.n ? `在 ${r.total} 份问卷中，${r.n} 份对${v ? `“${v}”` : '该题'}作出有效回答。` : `在 ${r.n} 名有效受访者中，`}`;
  const opening = r.total > r.n ? '其中，' : v ? `就${v}而言，` : '';
  if (labels.length === 1) return `${base}${opening}全部有效受访者均选择${quote(labels[0])}。`;
  const scores = scaleScores(labels);
  if (scores) {
    // Positive (or frequent) answers against negative (or rare) ones, each side named in scale order.
    const order = scaleOrder(labels)!, high = order.filter(l => scores.get(l)! > 3), low = order.filter(l => scores.get(l)! < 3);
    const sum = (ls: string[]) => ls.reduce((a, l) => a + share(l), 0);
    const top = [...labels].sort((a, b) => share(b) - share(a))[0];
    const side = (ls: string[]) => ls.length === 1 ? `选择${quote(ls[0])}的占 ${pct(sum(ls))}` : `选择${ls.map(quote).join('或')}的合计占 ${pct(sum(ls))}`;
    if (high.length && low.length) return `${base}${opening}${side([...high].reverse())}，${side(low)}；单项中${quote(top)}最多，占 ${pct(share(top))}。`;
  }
  const order = categoryOrder(labels);
  if (order.ordinal && labels.length <= 6) {
    const top = [...labels].sort((a, b) => share(b) - share(a))[0];
    return `${base}${opening}${order.labels.map(l => `${literal(l)}占 ${pct(share(l))}`).join('，')}，以${quote(top)}为主。`;
  }
  const sorted = [...labels].sort((a, b) => share(b) - share(a)), [top, second, third] = sorted, last = sorted.at(-1)!;
  const lo = row(r, top, 3), hi = row(r, top, 4);
  const interval = lo !== null && hi !== null ? `（95% 置信区间为 ${range(lo, hi, pct)}）` : '';
  const first = share(top) >= 50 ? `超过半数（${pct(share(top))}）的受访者选择${quote(top)}${interval}` : `选择${quote(top)}的受访者最多，占 ${pct(share(top))}${interval}`;
  const next = labels.length === 2 ? `；选择${quote(second)}的占 ${pct(share(second))}` : `；其次为${quote(second)}（${pct(share(second))}）${third && third !== last ? `和${quote(third)}（${pct(share(third))}）` : ''}`;
  const tail = labels.length >= 4 ? `；${quote(last)}最少，占 ${pct(share(last))}` : labels.length === 3 ? `；${quote(last)}占 ${pct(share(last))}` : '';
  return `${base}${opening}${first}${next}${tail}。`;
}

function crosstab(r: ResultSnapshot, refs: ResultRefs): string {
  const a = variable(r, 0) || '各组', b = variable(r, 1) || '回答';
  const { rows, cols } = crosstabOrder(r);
  const share = (x: string, y: string) => num(r.rows.find(c => String(c[0]) === x && String(c[1]) === y)?.[3]) ?? 0;
  // Describe the answer whose share differs most between groups: the most informative contrast in the table.
  const spread = (y: string) => Math.max(...rows.map(x => share(x, y))) - Math.min(...rows.map(x => share(x, y)));
  const col = [...cols].sort((p, q) => spread(q) - spread(p))[0];
  const byShare = [...rows].sort((p, q) => share(q, col) - share(p, col)), high = byShare[0], low = byShare.at(-1)!;
  const pattern = rows.length === 2
    ? `选择${quote(col)}的比例在${quote(rows[0])}组中为 ${pct(share(rows[0], col))}，在${quote(rows[1])}组中为 ${pct(share(rows[1], col))}`
    : `选择${quote(col)}的比例在${quote(high)}组中最高（${pct(share(high, col))}），在${quote(low)}组中最低（${pct(share(low, col))}）`;
  const opening = `${lead(refs)}从不同${a}受访者的${b}分布看，${pattern}`;
  const chi = metric(r, 'Pearson χ²'), df = metric(r, '自由度'), v = metric(r, 'Cramér V'), sparse = metric(r, '期望频数 <5 的单元格') ?? 0;
  const fisher = metric(r, 'p 值（Fisher 精确）'), asymptotic = metric(r, 'p 值（χ² 渐近）');
  if (chi === null || df === null || v === null) return `${opening}。由于至少一侧只有一个有效类别，未进行独立性检验。`;
  const conclusion = (p: number) => significance(p,
    `${a}与${b}之间存在统计学意义上的关联，关联强度${strengthV(v)}；这一关联不能直接解释为因果关系。`,
    `现有样本不足以表明${a}与${b}之间存在关联。`);
  if (fisher !== null) return `${opening}。由于存在期望频数小于 5 的单元格，采用 Fisher 精确检验，$${pMath(fisher)}$，Cramér $V=${tex3(v)}$${conclusion(fisher)}`;
  if (asymptotic === null) return `${opening}。Pearson $\\chi^2$ 检验结果为 $\\chi^2(${dof(df)})=${tex2(chi)}$，Cramér $V=${tex3(v)}$。`;
  const caveat = sparse > 0 ? `（有 ${sparse} 个单元格的期望频数小于 5，检验结果仅供参考）` : '';
  return `${opening}。Pearson $\\chi^2$ 检验结果为 $\\chi^2(${dof(df)})=${tex2(chi)}$，$${pMath(asymptotic)}$，Cramér $V=${tex3(v)}$${caveat}${conclusion(asymptotic)}`;
}

function groups(r: ResultSnapshot, refs: ResultRefs): string {
  const a = variable(r, 0) || '各组', b = variable(r, 1) || '得分';
  const rows = groupRows(r).filter(x => num(x[2]) !== null);
  if (rows.length < 2) return `${lead(refs)}有效分组不足两组，无法比较${b}均值。`;
  const describe = (x: (string | number | null)[]) => `均值 ${stat(num(x[2])!)}${num(x[3]) !== null ? `，标准差 ${stat(num(x[3])!)}` : ''}`;
  const mean = (x: (string | number | null)[]) => `${stat(num(x[2])!)}${num(x[3]) !== null ? `（标准差 ${stat(num(x[3])!)}）` : ''}`;
  const byMean = [...rows].sort((p, q) => num(q[2])! - num(p[2])!), high = byMean[0], low = byMean.at(-1)!;
  const pattern = rows.length === 2
    ? `${quote(String(rows[0][0]))}组的${b}均值为 ${mean(rows[0])}，${quote(String(rows[1][0]))}组为 ${mean(rows[1])}`
    : `不同${a}受访者的${b}均值介于 ${range(num(low[2])!, num(high[2])!, stat)} 之间，其中${quote(String(high[0]))}组最高（${describe(high)}），${quote(String(low[0]))}组最低（${describe(low)}）`;
  const opening = `${lead(refs)}${pattern}`;
  const two = rows.length === 2, p = metric(r, two ? 'p 值（Welch t）' : 'p 值（Welch F）');
  if (p === null) return `${opening}。至少一组有效数值不足或没有变异，未进行均值检验。`;
  const conclusion = significance(p, `${two ? '两组' : '各组'}${b}均值的差异具有统计学意义`, `现有样本不足以表明${two ? '两组' : '各组'}${b}均值存在差异`);
  if (two) {
    const t = metric(r, 'Welch t'), df = metric(r, '自由度'), g = metric(r, 'Hedges g');
    const test = t !== null && df !== null ? `$t(${dof(df)})=${tex2(Math.abs(t))}$，$${pMath(p)}$` : `$${pMath(p)}$`;
    const effect = g !== null ? `，Hedges $g=${tex2(Math.abs(g))}$，效应量${effectG(g)}` : '';
    return `${opening}。Welch $t$ 检验结果为 ${test}${effect}${conclusion}。`;
  }
  const f = metric(r, 'Welch F'), df1 = metric(r, '分子自由度'), df2 = metric(r, '分母自由度'), eta = metric(r, /^η²/);
  const test = f !== null && df1 !== null && df2 !== null ? `$F(${dof(df1)},\\,${dof(df2)})=${tex2(f)}$，$${pMath(p)}$` : `$${pMath(p)}$`;
  const effect = eta !== null ? `，$\\eta^2=${tex3(eta)}$，效应量${effectEta(eta)}` : '';
  return `${opening}。Welch 方差分析结果为 ${test}${effect}${conclusion}${p < 0.05 ? '；组间差异只说明分组与得分相关，不能据此推断因果' : ''}。`;
}

function numeric(r: ResultSnapshot, refs: ResultRefs): string {
  const v = variable(r, 0) || '该变量';
  const mean = row(r, '均值'), sd = row(r, '样本标准差'), median = row(r, '中位数'), q1 = row(r, 'Q1'), q3 = row(r, 'Q3'), min = row(r, '最小值'), max = row(r, '最大值');
  const lo = row(r, '均值 95% CI 下限'), hi = row(r, '均值 95% CI 上限');
  if (mean === null || sd === null || median === null) return `${lead(refs)}${v}没有足够的有效数值，无法描述其分布。`;
  const interval = lo !== null && hi !== null ? `（均值的 95% 置信区间为 ${range(lo, hi, stat)}）` : '';
  const quartiles = q1 !== null && q3 !== null ? `，下四分位数与上四分位数分别为 ${plain(q1)} 和 ${plain(q3)}` : '';
  const span = min !== null && max !== null ? `，取值范围为 ${range(min, max, plain)}` : '';
  // Pearson's second skewness coefficient, 3(mean − median)/sd, beyond ±0.3 marks a visible skew.
  const skew = sd > 0 ? 3 * (mean - median) / sd : 0;
  const shape = skew > 0.3 ? '均值高于中位数，分布呈右偏，少数较大取值拉高了均值。' : skew < -0.3 ? '均值低于中位数，分布呈左偏，少数较小取值拉低了均值。' : '均值与中位数接近，分布大致对称。';
  return `${lead(refs)}在 ${r.n} 个有效取值中，${v}的均值为 ${stat(mean)}，标准差为 ${stat(sd)}${interval}；中位数为 ${plain(median)}${quartiles}${span}。${shape}`;
}

function correlation(r: ResultSnapshot, refs: ResultRefs): string {
  const rank = r.method === 'spearman', a = variable(r, 0) || '两个变量中的前者', b = variable(r, 1) || '后者';
  const value = metric(r, rank ? 'Spearman ρ' : 'Pearson r'), p = metric(r, 'p 值（双侧）'), lo = metric(r, '95% CI 下限'), hi = metric(r, '95% CI 上限');
  const name = rank ? 'Spearman 秩相关系数' : 'Pearson 相关系数', symbol = rank ? '\\rho' : 'r';
  if (value === null) return `${lead(refs)}${a}与${b}的有效配对不足或至少一个变量没有变异，${name}不定义。`;
  const interval = lo !== null && hi !== null ? `（95% 置信区间为 ${range(lo, hi, coef)}）` : '';
  const head = `${lead(refs)}在 ${r.n} 对有效配对中，${a}与${b}的 ${name}为 $${symbol}=${tex3(value)}$${interval}`;
  if (p === null) return `${head}。`;
  const kind = rank ? '单调' : '线性';
  return `${head}，$${pMath(p)}$${significance(p, `二者呈${strengthR(value)}${value > 0 ? '正' : '负'}相关`, `现有样本不足以表明二者存在${kind}相关`)}。相关系数只描述关联，不能据此推断因果。`;
}

function alpha(r: ResultSnapshot, refs: ResultRefs): string {
  const construct = variable(r, 0), value = metric(r, 'Cronbach α'), k = metric(r, '题项数');
  if (value === null) return `${lead(refs)}${construct || '该'}量表的有效样本不足，无法计算 Cronbach's $\\alpha$ 系数。`;
  const level = value >= 0.9 ? '内部一致性很好' : value >= 0.8 ? '内部一致性较好' : value >= 0.7 ? '内部一致性可以接受' : value >= 0.6 ? '内部一致性偏弱，据此得出的结论需谨慎' : '内部一致性不足，量表需要修订';
  const items = r.rows.map(x => ({ name: String(x[0]), reversed: x[1] === '是', citc: num(x[4]), deleted: num(x[5]) }));
  const citc = items.map(i => i.citc).filter((v): v is number => v !== null), reversed = items.filter(i => i.reversed).length;
  const weak = items.filter(i => i.citc !== null && i.citc < 0.3).map(i => quote(i.name));
  const better = items.filter(i => i.deleted !== null && i.deleted > value + 0.01).sort((p, q) => q.deleted! - p.deleted!)[0];
  const scale = `${construct ? `${construct}量表` : '该量表'}共 ${k ?? items.length} 个题项${reversed ? `（其中 ${reversed} 个反向计分）` : ''}`;
  const spread = citc.length ? `。各题项的校正题总相关介于 ${range(Math.min(...citc), Math.max(...citc), coef)} 之间${weak.length ? `，其中${weak.join('、')}低于 0.3，宜检查措辞或计分方向` : ''}` : '';
  const deletion = better ? `；删除${quote(better.name)}后 $\\alpha$ 系数将升至 ${coef(better.deleted!)}，可结合理论判断是否保留` : citc.length ? '；删除任一题项均不能明显提高 $\\alpha$ 系数' : '';
  return `${lead(refs)}${scale}，Cronbach's $\\alpha$ 系数为 ${coef(value)}，${level}${spread}${deletion}。$\\alpha$ 系数只反映内部一致性，不能代替效度检验。`;
}

function qualityControl(r: ResultSnapshot, refs: ResultRefs): string {
  const cited = refs.table ? referenceToken('table', refs.table) : refs.figure ? referenceToken('figure', refs.figure) : '';
  // The 处理 column says whether a rule removes the responses it flags or only marks them.
  const flagged = r.rows.map(x => ({ rule: String(x[0]), count: num(x[2]) ?? 0, removes: x[3] !== '仅标记' })).filter(x => x.count > 0);
  const removing = flagged.filter(x => x.removes), marking = flagged.filter(x => !x.removes);
  const list = (xs: typeof flagged) => xs.map(x => `${literal(x.rule)} ${x.count} 份`).join('，');
  const screening = removing.length ? `${list(removing)}${removing.length > 1 ? '（同一份问卷可能触发多条规则）' : ''}` : '没有问卷触发剔除规则';
  const marked = marking.length ? `；${list(marking)}，仅作标记，未剔除` : '';
  const rate = r.total > 0 ? r.n / r.total * 100 : 0;
  return `本次调查共回收问卷 ${r.total} 份。按${cited || '预先设定的'}规则逐份筛查：${screening}${marked}。共剔除 ${r.total - r.n} 份，得到有效问卷 ${r.n} 份，问卷有效率为 ${pct(rate)}。`;
}

/** The reading paragraph for a result, citing the figure and table placed with it. */
export function readingParagraph(r: ResultSnapshot, refs: ResultRefs = {}): string {
  switch (r.method) {
    case 'frequency': return frequency(r, refs);
    case 'crosstab': return crosstab(r, refs);
    case 'groups': return groups(r, refs);
    case 'numeric': return numeric(r, refs);
    case 'pearson': case 'spearman': return correlation(r, refs);
    case 'alpha': return alpha(r, refs);
    case 'quality-control': return qualityControl(r, refs);
    default: return `${lead(refs)}${literal(r.title)}的有效样本为 ${r.n}${r.total !== r.n ? `（共 ${r.total}）` : ''}。`;
  }
}

/**
 * Why the method fits and how its statistic is defined, written once per report: later results of the same method
 * rely on it. Descriptive results need no method paragraph.
 */
export function methodIntro(r: ResultSnapshot): MethodIntro | null {
  switch (r.method) {
    case 'crosstab': return {
      key: '\\chi^2=\\sum',
      text: '两个分类变量之间是否存在关联，采用 Pearson $\\chi^2$ 独立性检验判断，并以 Cramér $V$ 系数衡量关联强度；2×2 表中有期望频数小于 5 的单元格时，改用 Fisher 精确检验。检验统计量与关联系数分别为',
      formulas: ['\\chi^2=\\sum_{i=1}^{r}\\sum_{j=1}^{c}\\frac{(O_{ij}-E_{ij})^2}{E_{ij}}', 'V=\\sqrt{\\frac{\\chi^2}{n\\,\\min(r-1,\\,c-1)}}'],
      where: '式中，$O_{ij}$ 为第 $i$ 行第 $j$ 列的观测频数，$E_{ij}=n_{i\\cdot}n_{\\cdot j}/n$ 为相应的期望频数，$n_{i\\cdot}$、$n_{\\cdot j}$ 为行、列合计，$r$、$c$ 为行、列类别数，$n$ 为有效样本量。',
    };
    case 'groups': return r.rows.filter(x => num(x[2]) !== null).length === 2 ? {
      key: 't=\\frac{\\bar{x}_1-\\bar{x}_2}',
      text: '两组均值的比较不假定两组方差相等，采用 Welch $t$ 检验，统计量及其自由度为',
      formulas: ['t=\\frac{\\bar{x}_1-\\bar{x}_2}{\\sqrt{s_1^2/n_1+s_2^2/n_2}}', '\\nu=\\frac{\\left(s_1^2/n_1+s_2^2/n_2\\right)^2}{\\frac{(s_1^2/n_1)^2}{n_1-1}+\\frac{(s_2^2/n_2)^2}{n_2-1}}'],
      where: '式中，$\\bar{x}_k$、$s_k^2$ 与 $n_k$ 分别为第 $k$ 组的均值、方差与样本量；效应量采用 Hedges $g$。',
    } : {
      key: 'F^{*}=',
      text: '多组均值的比较不假定各组方差相等，采用 Welch 方差分析，其统计量为',
      formulas: ['F^{*}=\\frac{\\frac{1}{k-1}\\sum_{j=1}^{k}w_j(\\bar{x}_j-\\tilde{x})^2}{1+\\frac{2(k-2)}{k^2-1}\\sum_{j=1}^{k}\\frac{(1-w_j/W)^2}{n_j-1}}'],
      where: '式中，$w_j=n_j/s_j^2$，$W=\\sum_{j=1}^{k}w_j$，$\\tilde{x}=\\sum_{j=1}^{k}w_j\\bar{x}_j/W$，$\\bar{x}_j$、$s_j^2$ 与 $n_j$ 分别为第 $j$ 组的均值、方差与样本量，$k$ 为组数；效应量采用经典方差分析的 $\\eta^2$。',
    };
    case 'pearson': return {
      key: 'r=\\frac{\\sum',
      text: '两个数值变量之间的线性关联采用 Pearson 相关系数衡量，其定义为',
      formulas: ['r=\\frac{\\sum_{i=1}^{n}(x_i-\\bar{x})(y_i-\\bar{y})}{\\sqrt{\\sum_{i=1}^{n}(x_i-\\bar{x})^2}\\sqrt{\\sum_{i=1}^{n}(y_i-\\bar{y})^2}}'],
      where: '式中，$x_i$、$y_i$ 为第 $i$ 对有效观测值，$\\bar{x}$、$\\bar{y}$ 为其均值，$n$ 为有效配对数；95% 置信区间由 Fisher $z$ 变换得到。',
    };
    case 'spearman': return {
      key: '\\rho=\\frac{\\sum',
      text: '有序变量或不满足正态假定的数值变量之间的单调关联采用 Spearman 秩相关系数衡量，即对两个变量的秩计算 Pearson 相关系数：',
      formulas: ['\\rho=\\frac{\\sum_{i=1}^{n}(R_i-\\bar{R})(S_i-\\bar{S})}{\\sqrt{\\sum_{i=1}^{n}(R_i-\\bar{R})^2}\\sqrt{\\sum_{i=1}^{n}(S_i-\\bar{S})^2}}'],
      where: '式中，$R_i$、$S_i$ 为第 $i$ 对观测值在各自变量中的秩（并列取平均秩），$\\bar{R}$、$\\bar{S}$ 为平均秩，$n$ 为有效配对数。',
    };
    case 'alpha': return {
      key: '\\alpha=\\frac{k}{k-1}',
      text: '量表的内部一致性采用 Cronbach\'s $\\alpha$ 系数检验，其计算公式为',
      formulas: ['\\alpha=\\frac{k}{k-1}\\left(1-\\frac{\\sum_{i=1}^{k}s_i^2}{s_T^2}\\right)'],
      where: '式中，$k$ 为题项数，$s_i^2$ 为第 $i$ 个题项得分的方差，$s_T^2$ 为量表总分的方差；反向题先按“下限 + 上限 − 原值”重新计分。',
    };
    default: return null;
  }
}
