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
export const stat = (v: number) => sign(v.toFixed(2));
export const coef = (v: number) => sign(v.toFixed(3));
const plain = (v: number) => sign(Number.isInteger(v) ? String(v) : v.toFixed(2));
export const tex2 = (v: number) => v.toFixed(2), tex3 = (v: number) => v.toFixed(3);
export const dof = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);
/** A p value as it is set inside an inline formula. */
export const pMath = (p: number) => p < 0.001 ? 'p<0.001' : `p=${p.toFixed(3)}`;
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

const CONVERSATIONAL_STEM_RE =
  /(?:[吗呢]$|[？?]|^请问|^您(?:平时|目前|通常|日常|当前|现阶段|一般|在家|个人|家里|在|对|是否|认为|觉得|属于|处于)|^(?:说到|提到|谈到|说起)[^，,]{1,36}[，,]|^(?:若|如果)[^，,]{1,40}[，,]|(?:下面|以下)(?:哪|何)|哪种(?:情况|描述|说法|状态)|(?:是什么|是多少|有哪些|大约是|大概是|感受是)$)/u;

function condenseObjectNoun(phrase: string): string {
  const clean = phrase.trim().replace(/^[「“"']|[」”"']$/gu, '');
  return clean.replace(
    /^(?:能|能够|可以|可|用来|用于)([^的]{1,14})的(.{2,18})$/u,
    (_, mod: string, head: string) => (head.trim().length >= 4 ? head.trim() : `${mod.trim()}${head.trim()}`),
  );
}

function condenseConversationalStem(stem: string): string {
  let s = stem.trim();

  const constructSuffix = /^(?:请问\s*)?(?:您的?|受访者(?:的)?)?(?:平时|目前)?(?:属于|处于)?(?:以下|下面)?哪[^（(]*[？?]?\s*[（(]([^）)]{2,16})[）)]$/u.exec(s);
  if (constructSuffix) return constructSuffix[1].trim();

  const topicFraming = /^(?:说到|提到|谈到|说起|关于|围绕|针对)([^，,]{2,36})[，,]\s*(.+)$/u.exec(s);
  if (topicFraming) {
    const topicObj = condenseObjectNoun(topicFraming[1]);
    const rest = topicFraming[2].trim();
    if (
      /^(?:(?:下面|以下)?(?:哪(?:一?[种类个项])|何种)(?:情况|状态|描述|说法|选项|阶段)?(?:最(?:像|符合|贴近|接近|能代表)(?:您|受访者)(?:目前|当前|平时)?(?:的(?:实际|真实|目前|日常|个人)?(?:情况|实际|状况|状态|现状))?)?|您(?:目前|平时)?处于哪种(?:状态|阶段|情况))[吗呢]?$/u.test(
        rest,
      )
    ) {
      if (/(?:情况|状态|习惯|方式|态度|认知|意愿|频率|频次)$/u.test(topicObj)) return topicObj;
      const suffix = /(?:设备|工具|服务|产品|平台|系统|软件|小程序|应用|设施|食堂|手环|终端|助手|卡)$/u.test(topicObj)
        ? '使用情况'
        : '情况';
      return `${topicObj}${suffix}`;
    }
    return `${topicObj}${condenseConversationalStem(rest)}`;
  }

  const conditionalEval = /^(?:若|如果)([^，,]{2,40})[，,]\s*(?:您的?(?:感受|评价|态度|看法)是|您(支持|认可|认同|赞成|接受|满意|放心)吗)$/u.exec(s);
  if (conditionalEval) {
    const core = conditionalEval[1]
      .replace(/[（(](?:而非|不含|不包括)[^）)]*[）)]/gu, '')
      .trim();
    return `${condenseObjectNoun(core)}${conditionalEval[2] ? `${conditionalEval[2]}度` : '评价'}`;
  }

  const yesNo = /[吗呢]$|(?:^|您)(?:是否|能否|有无|有没有)/u.test(s);

  s = s
    .replace(/^请问\s*/u, '')
    .replace(/^(?:在[^，,]{1,16}|过去[^，,]{1,14}|未来[^，,]{1,14}|最近[^，,]{1,14}|近[^，,]{1,12}内|目前在[^，,]{1,14}|平时在[^，,]{1,14}|日常生活中|通常情况下|一般情况下)[，,]\s*/u, '')
    .replace(/^(?:您的?|受访者(?:的)?)(?:平时|目前|通常|日常|当前|现阶段|一般|在家|个人|家里|实际)?(?:的)?\s*/u, '')
    .replace(/^(?:平时|目前|通常|日常|当前|现阶段)\s*(?:您的?|受访者(?:的)?)?\s*/u, '');

  const evalMatch = /^(?:对(?:于)?)?(.+?)(?:程度|水平)?(满意|放心|信任|认可|认同|支持|了解|熟悉|习惯|方便|安心)吗$/u.exec(s);
  if (evalMatch) {
    const body = evalMatch[1].replace(/的$/u, '').trim();
    const adj = evalMatch[2];
    const noun = adj === '了解' || adj === '熟悉' ? `${adj}程度` : `${adj}度`;
    return `${body}${noun}`;
  }

  const willMatch = /^(?:是否|会否|愿不愿意)?(?:愿意|希望|打算|倾向于|考虑)(?:正式|继续)?(.+?)(?:吗|呢)?$/u.exec(s);
  if (willMatch) {
    return `${willMatch[1].replace(/[吗呢]$/u, '').trim()}意愿`;
  }

  const viaMatch = /^(?:主要|通常|一般)?(?:通过|采用|使用|利用|借助)(?:什么|何种|哪(?:一?[种类个项]|些)?)(渠道|方式|途径|形式|手段|工具|平台)(.{2,20}?)[吗呢]?$/u.exec(s);
  if (viaMatch) {
    return `${viaMatch[2].trim()}${viaMatch[1]}`;
  }

  s = s
    .replace(/(?:大约|大概)?(?:处于|属于|落在|位于)(?:以下|下面)?哪(?:一?[种个类项]|些)([^？?，,]*)$/u, '$1')
    .replace(/^(?:属于|处于)(?:以下|下面)?哪(?:一?[种个类项]|些)(.+)$/u, '$1')
    .replace(
      /[，,]?\s*(?:下面|以下)?(?:哪(?:一?[种类个项])|何种)(?:情况|状态|描述|说法|选项)?(?:最(?:像|符合|贴近|接近|能代表)(?:您|受访者)(?:目前|当前|平时)?(?:的(?:实际|真实|目前|日常|个人)?(?:情况|实际|状况|状态|现状))?)?[吗呢]?$/u,
      '情况',
    )
    .replace(/(?:大约|大概|通常|一般)?(?:是|为)(?:多少|什么|哪[一种个项类]*)?$/u, '')
    .replace(/(?:有|包括|是)?哪些$/u, '')
    .replace(/^(?:是否|有没有|有无)(?:曾经|实际)?/u, '')
    .replace(/[，,]?\s*(?:是吗|好吗|对吗|吗|呢)$/u, '');

  s = s
    .replace(/^跟(.+?)住在一起$/u, '与$1同住')
    .replace(/^(?:与|和)(.+?)住在一起$/u, '与$1同住')
    .replace(/^一个人(?:居住|住|生活)$/u, '独居')
    .replace(/^在?(.{2,16}?)过程中遇到的(?:主要)?(.{2,10})$/u, '$1$2')
    .replace(/[「」]/gu, '');

  if (
    yesNo &&
    s &&
    !/(?:情况|状态|意愿|态度|习惯|程度|频率|频次|经历|经验|行为|偏好|倾向|需求|认知|知晓度|满意度|信任度|认可度|认同度|支持度|放心度|安心度|便利度|方便度|可达性|评价)$/u.test(s)
  ) {
    s = `${s.replace(/过$/u, '')}情况`;
  }

  if (/(?:满意度|评价|看法|态度|信任度|放心度|认可度|认同度|支持度|感知|意愿|需求|偏好|程度|知晓度)$/u.test(s)) {
    s = s.replace(/^对(?:于)?/u, '');
  }

  return s.replace(/^[，,、：:；;\s]+|[，,、：:；;？?。．.\s]+$/gu, '').replace(/的$/u, '');
}

/** A question label as a variable name: "Q3. 您的年龄段（单选）：" → "年龄段". */
export function variableLabel(name: string): string {
  const label = name.trim()
    .replace(/^(?:[QqＱ]\s*\d+(?:[._\-－]\d+)*\s*[.．、:：_\-－)）]?|第\s*\d+\s*题\s*[.．、:：]?|\d+(?:[.．]\d+)*\s*[.．、:：_)）])\s*/u, '')
    .replace(/\s*[（(［[【](?:单选|多选|必答|选填|可多选|量表|填空)[^）)］\]】]*[）)］\]】]\s*$/u, '')
    .replace(/[：:？?。．.\s]+$/u, '')
    .replace(/^(?:您的|受访者(?:的)?)/u, '');
  if (!label) return name.trim();
  if (CONVERSATIONAL_STEM_RE.test(label) || (label.length > 18 && /(?:您|请问|哪|是否)/u.test(label))) {
    const condensed = condenseConversationalStem(label);
    if (condensed) return condensed;
  }
  return label;
}
/** A variable name for running text (literal; see `literal`). */
const variable = (r: ResultSnapshot, i: number) => r.variables?.[i] ? literal(variableLabel(r.variables[i])) : '';

/**
 * The project's naming of exhibits (research-chart-production, chosen by the user): a figure's name ends in "图" and a
 * table's in "表", never twice ("…流程图图"). A name that already ends so is kept as written.
 */
export function exhibitName(text: string, kind: 'chart' | 'table'): string {
  const t = text.trim(), suffix = kind === 'chart' ? '图' : '表';
  return !t || t.endsWith(suffix) ? t : `${t}${suffix}`;
}

/**
 * A caption in report style, from the analysed variables, named for what it is: 分布图, 对比图, 相关系数图 for figures;
 * 交叉表, 统计表, 信度分析表 for tables. The registered title, so named, when the variables are unknown.
 */
export function resultCaption(r: ResultSnapshot, kind: 'chart' | 'table' = 'table'): string {
  const [a, b] = [0, 1].map(i => r.variables?.[i] ? captionText(variableLabel(r.variables[i])) : '');
  const chart = kind === 'chart', title = exhibitName(captionText(r.title), kind);
  switch (r.method) {
    case 'frequency': return a ? `受访者${a}分布${chart ? '图' : '表'}` : title;
    case 'crosstab': return a && b ? (chart ? `不同${a}受访者的${b}分布图` : `${a}与${b}交叉表`) : title;
    case 'groups': return a && b ? (chart ? `不同${a}受访者的${b}对比图` : `不同${a}受访者的${b}统计表`) : title;
    case 'numeric': return a ? (chart ? `${a}的分布图` : `${a}描述统计表`) : title;
    case 'pearson': case 'spearman': return a && b ? (chart ? `${a}与${b}的相关系数图` : `${a}与${b}的相关分析表`) : title;
    case 'alpha': {
      const scaleName = captionText((r.receipt?.calculation?.scale?.construct || r.title || '').trim())
        .replace(/(?:信度(?:分析|检验)?表?|(?<!量)表)$/u, '')
        .trim();
      return scaleName ? `${scaleName}信度分析${chart ? '图' : '表'}` : title;
    }
    case 'quality-control': return '问卷有效性筛查表';
    default: return title;
  }
}

/** "由图 4-1 可知，" / "由图 4-1 和表 4-1 可知，" for the blocks placed with the result. */
export function lead(refs: ResultRefs): string {
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
  const name = rank ? 'Spearman 秩相关系数' : 'Pearson 相关系数', symbol = rank ? '\\rho' : 'r';
  if (r.headers[0] === '配对变量' && r.rows.length >= 2) {
    const maxAbs = metric(r, /最大\s*\|/u);
    const highCount = metric(r, /高相关变量对/u) ?? 0;
    const peak = maxAbs !== null ? `，配对最大绝对相关系数为 $|${symbol}|=${tex3(maxAbs)}$` : '';
    const collinear = highCount > 0 ? `（检出 ${Math.round(highCount)} 对 $|r|\\ge 0.80$ 潜在强共线变量对）` : '，未见 $\\ge 0.80$ 强共线风险对';
    return `${lead(refs)}基于 ${r.n} 个有效样本对 ${r.rows.length} 组核心变量计算 ${name}矩阵${peak}${collinear}。相关矩阵只描述双变量共变方向与共线性边界，不能据此直接推断因果关系。`;
  }
  const value = metric(r, rank ? 'Spearman ρ' : 'Pearson r'), p = metric(r, 'p 值（双侧）'), lo = metric(r, '95% CI 下限'), hi = metric(r, '95% CI 上限');
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
    // A sampling frame is part of the design, not a sample: it has units, not respondents.
    case 'sampling-frame': { const name = literal(r.title.replace(/抽样框$/u, ''));
      return refs.table ? `${referenceToken('table', refs.table)}列出了${name}各阶段的抽样框与入样单位。` : `${name}采用分阶段抽样，各阶段的抽样框与入样单位须以表格列出。`; }
    case 'macro-trend': {
      const first = r.rows[0];
      const last = r.rows[r.rows.length - 1];
      const span = first && last ? `${literal(String(first[0]))}—${literal(String(last[0]))}` : `${r.n} 个统计年度`;
      const barCol = literal(r.headers[1] ?? '基础规模指标');
      const lineCol = literal(r.headers[2] ?? '渗透率指标');
      const endBar = last && num(last[1]) !== null ? `${num(last[1])}` : '';
      const endLine = last && num(last[2]) !== null ? `${num(last[2])}` : '';
      return `${lead(refs)}刻画了 ${span} 期间${barCol}与${lineCol}的同步演进轨迹${endBar && endLine ? `（末期分别达 ${endBar} 与 ${endLine}）` : ''}，反映出宏观需求扩容与基层实际供给效率之间的结构性张力。`;
    }
    case 'summary-card': {
      const cols = r.rows.slice(0, 4).map(item => `“${literal(String(item[0]))}”`).join('、');
      const title = literal(r.title);
      if (/意义|价值/u.test(title) || /significance/u.test(r.id)) {
        return `${lead(refs)}围绕“${title}”梳理了${cols || '核心维度'}等 ${r.n} 项研究支撑，阐明设计在实践落地与方法校验层面的参照价值。`;
      }
      if (/创新|亮点/u.test(title) || /innovation/u.test(r.id)) {
        return `${lead(refs)}依托“${title}”归纳${cols || '创新点'}等 ${r.n} 类特色方法组合，展现框架构建、多维归因与场景隔离间的协同推进。`;
      }
      if (/对策|措施|路线|推进/u.test(title) || /measures|roadmap/u.test(r.id)) {
        return `${lead(refs)}聚焦“${title}”部署${cols || '行动单元'}等 ${r.n} 组分类联动抓手，界定责任主体、执行节点与试点考核口径。`;
      }
      return `${lead(refs)}立足“${title}”汇总${cols || '关键结论'}等 ${r.n} 条经验线索，呈现问题诊断向分群治理转化的闭环逻辑。`;
    }
    case 'cooccurrence': {
      const top = r.rows.slice(0, 4).map(item => `“${literal(String(item[0]))}”`).join('、');
      const edgeCount = metric(r, '共现连边数');
      const clusterCount = metric(r, '主题聚类数') ?? 4;
      return `${lead(refs)}围绕研究主题构建包含 ${r.n} 个高频构念节点${edgeCount !== null ? `与 ${Math.round(edgeCount)} 条加权共现连边` : ''}的文献关键词共现聚类网络，划分出 ${Math.round(clusterCount)} 个语义聚类社区，核心节点聚焦于${top || '关键研究维度'}，直观揭示了既有研究的概念耦合结构与跨簇桥接缺口。`;
    }
    case 'wordcloud': {
      const top = r.rows.slice(0, 4).map(item => `“${literal(String(item[0]))}”`).join('、');
      return `${lead(refs)}围绕核心语料共提取 ${r.n} 个高频语义词，显著聚焦于${top || '研究重点维度'}，直观映射出受访群体与文本语料的集中关切焦点。`;
    }
    case 'framework': case 'diagram':
      return `${lead(refs)}围绕“${literal(r.title.replace(/(?:调查研究|研究)?技术路线图$/u, '') || r.title)}”系统构建了贯穿全书十章的 ${r.n} 阶递进实证逻辑链与理论—方法双翼架构，将问题界定、抽样质控、多维归因分群与属地分类施策浑然衔接为一体。`;
    case 'infographic':
      return `${lead(refs)}以多面板复合信息图直观展示了“${literal(r.title)}”的核心样本分布与维度表现（涉及关键指标 ${r.rows.length} 项），所有数值均直接锁定自冻结分析快照。`;
    case 'cs-did': {
      const att = metric(r, /ATT/u);
      const negRisk = r.warnings?.some(w => w.includes('TWFE_NEGATIVE_WEIGHT'));
      return `${lead(refs)}基于 Callaway-Sant'Anna 交错多期 DID 识别策略对 ${r.n} 条观测实施组别—时期稳健估计${att !== null ? `，样本加权聚合平均处理效应为 $\\widehat{\\text{ATT}}=${stat(att)}$` : ''}${negRisk ? '（Goodman-Bacon 拆解提示静态 TWFE 受已处理控制组负权重扭曲，报告采信无污染对照组的动态 ATT 口径）' : '，并行趋势与组别对照均稳健'}。`;
    }
    case 'conformal': {
      const qHat = metric(r, /q̂|半宽/u);
      const cov = metric(r, /覆盖/u);
      const wide = r.warnings?.some(w => w.includes('CONFORMAL_WIDE_INTERVAL'));
      const covStr = cov !== null ? `，校准集实测覆盖率为 ${(cov <= 1 ? cov * 100 : cov).toFixed(1)}%` : '';
      return `${lead(refs)}采用分布自由 Split Conformal 有限样本校准（有效样本 ${r.n}）${qHat !== null ? `提取非一致残差分位半宽 $\\hat{q}=${coef(qHat)}$` : ''}${covStr}${wide ? '（带宽相对离散度较高，对高波动样本启用不确定性拒识预警）' : ''}。`;
    }
    case 'efa': {
      const kmo = metric(r, /KMO/u);
      return `${lead(refs)}对 ${r.n} 份有效样本开展 KMO 与因素适宜性检验${kmo !== null ? `（$\\text{KMO}=${coef(kmo)}$）` : ''}，评估测度题项聚敛结构与降维可行性。`;
    }
    case 'logit':
      return `${lead(refs)}基于 ${r.n} 份有效样本建立二元 Logistic 回归模型，评估各解释变量对目标事件发生比（$OR$）的条件边际关联（横截面观测结果不直接等同于实验因果效应）。`;
    case 'mediation':
      return `${lead(refs)}依托 Bootstrap 自举抽样（有效样本 ${r.n}）估计传导路径的总效应、直接效应与间接中介占比，在样本观测边界内分解条件传导机制。`;
    case 'interaction':
      return `${lead(refs)}针对关键分组特征开展子群异质性与方向分化扫描（样本 ${r.n}），识别条件关联幅值差异与潜在辛普森符号反转现象。`;
    case 'uplift':
      return `${lead(refs)}结合因果森林/增益模型（样本 ${r.n}）对预测条件平均处理效应（CATE）作十分位排序评估，支撑低预算精准干预优先级排序。`;
    case 'kano': {
      const avgBetter = metric(r, /Better/u);
      const avgWorse = metric(r, /Worse/u);
      const highRq = r.warnings?.some(w => w.includes('KANO_HIGH_REVERSE_OR_QUESTIONABLE'));
      const lowN = r.warnings?.some(w => w.includes('KANO_INSUFFICIENT_PAIRED_N'));
      const coefs = avgBetter !== null && avgWorse !== null ? `（均值 $\\text{Better}=${coef(avgBetter)}$、均值 $|\\text{Worse}|=${coef(Math.abs(avgWorse))}$）` : '';
      return `${lead(refs)}基于 Kano 正反配对矩阵对 ${r.rows.length} 项产品与服务特性实施 M/O/A/I/R/Q 属性分类与 Better-Worse 象限测度（配对样本 $n\\ge ${r.n}$）${coefs}${highRq ? '（检出部分题项反向/可疑作答比例超过 15%，优先剥离伪需求后再定开发序列）' : ''}${lowN ? '（局部配对样本偏少，建议增补样本核验稳健性）' : ''}。`;
    }
    case 'rdd': {
      const tau = metric(r, /效应\s*τ|τ/u);
      const pVal = metric(r, /p\s*值/u);
      const zDens = metric(r, /密度连续性/u);
      const manip = r.warnings?.some(w => w.includes('RDD_DENSITY_MANIPULATION'));
      const sens = r.warnings?.some(w => w.includes('RDD_BANDWIDTH_SENSITIVE'));
      const est = tau !== null ? `，主带宽三角核局部线性跳跃估计为 $\\hat{\\tau}=${stat(tau)}$${pVal !== null ? `（$${pMath(pVal)}$）` : ''}` : '';
      return `${lead(refs)}围绕制度断点开展 Sharp RDD 局部线性连续性识别（主带宽样本 ${r.n}）${est}${zDens !== null ? `，断点邻域 McCrary 密度连续性检验 $z=${stat(zDens)}$` : ''}${manip ? '（提示断点右侧存在显著堆积/操纵风险，需谨慎排查阈值人为调控）' : sens ? '（不同带宽下系数波动较大，已并列汇报 0.5× 至 1.5× 带宽敏感性区间）' : '（多带宽估计与驱动变量连续性均稳健）'}。`;
    }
    case 'psm': {
      const att = metric(r, /ATT/u);
      const pVal = metric(r, /p\s*值/u);
      const maxSmd = metric(r, /SMD/iu);
      const dropped = r.warnings?.some(w => w.includes('PSM_COMMON_SUPPORT_DROPPED'));
      const resid = r.warnings?.some(w => w.includes('PSM_RESIDUAL_IMBALANCE'));
      const est = att !== null ? `，匹配样本平均处理效应 $\\widehat{\\text{ATT}}=${stat(att)}$${pVal !== null ? `（$${pMath(pVal)}$）` : ''}` : '';
      return `${lead(refs)}采用 1:1 卡尺倾向得分匹配（有效配对观测 ${r.n} 条）${est}${maxSmd !== null ? `，匹配后最大协变量绝对标准化均值差 $|\\text{SMD}|_{\\max}=${coef(maxSmd)}$` : ''}${dropped ? '（提示部分处理组位于共同支撑域之外已剔除，结论限定在匹配重叠区）' : ''}${resid ? '（个别协变量仍存 $|\\text{SMD}|\\ge 0.10$ 残余不平衡，宜结合双重稳健回归复核）' : '（协变量均通过平衡性检验）'}。`;
    }
    case 'topsis': {
      const cMax = metric(r, /C_max|最高贴近度/iu);
      const cMin = metric(r, /C_min|最低贴近度/iu);
      const nObj = metric(r, /评价对象数/u);
      const lowDisp = r.warnings?.some(w => w.includes('TOPSIS_LOW_DISPERSION'));
      const span = cMax !== null && cMin !== null ? `，贴近度 $C_i$ 介于 ${coef(cMin)} 至 ${coef(cMax)} 之间` : '';
      return `${lead(refs)}依托客观信息熵赋权 TOPSIS 对 ${nObj !== null ? Math.round(nObj) : r.rows.length} 个评价对象实施多指标综合测度（累计观测 ${r.n} 份）${span}${lowDisp ? '（检出低离散度指标，熵权已自动下调冗余贡献）' : '（指标区分度与权重分布均稳健）'}。`;
    }
    case 'iv': {
      const betaIv = metric(r, /β_IV|局部效应/iu);
      const fsF = metric(r, /第一阶段\s*F/u);
      const pVal = metric(r, /双侧\s*p\s*值/u);
      const hausmanP = metric(r, /Hausman/iu);
      const weak = r.warnings?.some(w => w.includes('WEAK_INSTRUMENT'));
      const endo = r.warnings?.some(w => w.includes('IV_ENDOGENEITY_CONFIRMED'));
      const est = betaIv !== null ? `，两阶段最小二乘局部平均处理效应 $\\hat{\\beta}_{\\text{IV}}=${stat(betaIv)}$${pVal !== null ? `（$${pMath(pVal)}$）` : ''}` : '';
      const fStr = fsF !== null ? `，第一阶段偏 $F=${stat(fsF)}$` : '';
      const hStr = hausmanP !== null ? `、Wu-Hausman 内生性检验 $${pMath(hausmanP)}$` : '';
      return `${lead(refs)}采用工具变量两阶段最小二乘（IV-2SLS，有效样本 ${r.n}）克服未观测混杂内生性${est}${fStr}${hStr}${weak ? '（提示第一阶段 $F<10$ 存在弱工具偏误风险，解释限于单调依从子群并谨慎外推）' : endo ? '（内生性检验显著支持工具变量纠偏）' : '（工具变量强度稳健）'}。`;
    }
    case 'ab': {
      const delta = metric(r, /净提升|Δ/u);
      const rel = metric(r, /相对提升/u);
      const pVal = metric(r, /双侧\s*p\s*值/u);
      const srmP = metric(r, /SRM/iu);
      const srmBad = r.warnings?.some(w => w.includes('AB_SRM_DETECTED'));
      const guardBad = r.warnings?.some(w => w.includes('AB_GUARDRAIL_DEGRADATION'));
      const lift = delta !== null ? `，核心指标绝对提升 $\\Delta=${stat(delta)}$${rel !== null ? `（相对变化 ${coef(rel)}\\%）` : ''}${pVal !== null ? `、$${pMath(pVal)}$` : ''}` : '';
      return `${lead(refs)}围绕随机分流实验（有效观测 ${r.n} 条）执行 Welch 双样本与 O'Brien-Fleming 序贯显著性检核${lift}${srmP !== null ? `，样本比例失衡检验 $${pMath(srmP)}$` : ''}${srmBad ? '（触发 SRM 失衡预警，结果暂停全量推全需先核查分流正交性）' : guardBad ? '（触发护栏指标显著劣化预警，建议在收益与体验代价间权衡折中）' : '（分流比例均衡且安全护栏稳健）'}。`;
    }
    case 'survival': {
      const chi2 = metric(r, /Log-Rank|χ²/iu);
      const pVal = metric(r, /双侧\s*p\s*值/u);
      const rmstDiff = metric(r, /RMST/iu);
      const cens = metric(r, /删失率/u);
      const heavy = r.warnings?.some(w => w.includes('SURVIVAL_HEAVY_CENSORING'));
      const statPart = chi2 !== null ? `，Log-Rank $\\chi^2=${coef(chi2)}$${pVal !== null ? `（$${pMath(pVal)}$）` : ''}` : '';
      const rmstPart = rmstDiff !== null ? `、组间限制平均生存时间差 $\\Delta\\mathrm{RMST}=${stat(rmstDiff)}$` : '';
      return `${lead(refs)}对两组队列实施 Kaplan-Meier 乘积极限估计与 Log-Rank 时序检核（合计样本 ${r.n}）${statPart}${rmstPart}${cens !== null ? `（总右删失比例 ${cens.toFixed(1)}%）` : ''}${heavy ? '（右删失比例高于 50%，采信共同随访上限 RMST 替代未达中位期作为主比较指标）' : '（组间生存曲线差异清晰）'}。`;
    }
    case 'meta': {
      const thetaRe = metric(r, /合并效应|θ_RE/iu);
      const pVal = metric(r, /双侧\s*p\s*值/u);
      const i2 = metric(r, /异质性|I²/iu);
      const eggerP = metric(r, /Egger/iu);
      const highHet = r.warnings?.some(w => w.includes('META_HIGH_HETEROGENEITY'));
      const biasRisk = r.warnings?.some(w => w.includes('META_EGGER_BIAS'));
      const poolPart = thetaRe !== null ? `，DerSimonian-Laird 随机效应合并效应量 $\\hat{\\theta}_{\\mathrm{RE}}=${stat(thetaRe)}$${pVal !== null ? `（$${pMath(pVal)}$）` : ''}` : '';
      const hetPart = i2 !== null ? `，研究间异质性 $I^2=${coef(i2)}\\%$` : '';
      return `${lead(refs)}对 ${r.n} 项独立研究执行逆方差加权与随机效应 Meta 合成${poolPart}${hetPart}${eggerP !== null ? `（Egger 漏斗对称性检验 $${pMath(eggerP)}$）` : ''}${biasRisk ? '（Egger 检验提示潜在发表偏倚风险，宜补充剪补敏感性分析）' : highHet ? '（检出显著异质性，随机效应区间已纳入研究间方差 $\\hat{\\tau}^2$）' : '（研究间一致性与小样本对称性稳健）'}。`;
    }
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
      where: '式中，$O_{ij}$ 为第 $i$ 行第 $j$ 列的观测频数，$E_{ij}=n_{i\\cdot}n_{\\cdot j}/n$ 为相应的期望频数，$n_{i\\cdot}$、$n_{\\cdot j}$ 为行、列合计，$r$、$c$ 为行、列类别数，$n$ 为有效样本量。检验的适用条件是观测相互独立，期望频数小于 5 的单元格不超过 20%，且没有期望频数小于 1 的单元格。',
    };
    case 'groups': return r.rows.filter(x => num(x[2]) !== null).length === 2 ? {
      key: 't=\\frac{\\bar{x}_1-\\bar{x}_2}',
      text: '两组均值的比较不假定两组方差相等，采用 Welch $t$ 检验，统计量及其自由度为',
      formulas: ['t=\\frac{\\bar{x}_1-\\bar{x}_2}{\\sqrt{s_1^2/n_1+s_2^2/n_2}}', '\\nu=\\frac{\\left(s_1^2/n_1+s_2^2/n_2\\right)^2}{\\frac{(s_1^2/n_1)^2}{n_1-1}+\\frac{(s_2^2/n_2)^2}{n_2-1}}'],
      where: '式中，$\\bar{x}_k$、$s_k^2$ 与 $n_k$ 分别为第 $k$ 组的均值、方差与样本量；效应量采用 Hedges $g$。该检验不要求两组方差齐性，但要求两组观测相互独立。',
    } : {
      key: 'F^{*}=',
      text: '多组均值的比较不假定各组方差相等，采用 Welch 方差分析，其统计量为',
      formulas: ['F^{*}=\\frac{\\frac{1}{k-1}\\sum_{j=1}^{k}w_j(\\bar{x}_j-\\tilde{x})^2}{1+\\frac{2(k-2)}{k^2-1}\\sum_{j=1}^{k}\\frac{(1-w_j/W)^2}{n_j-1}}'],
      where: '式中，$w_j=n_j/s_j^2$，$W=\\sum_{j=1}^{k}w_j$，$\\tilde{x}=\\sum_{j=1}^{k}w_j\\bar{x}_j/W$，$\\bar{x}_j$、$s_j^2$ 与 $n_j$ 分别为第 $j$ 组的均值、方差与样本量，$k$ 为组数；效应量采用经典方差分析的 $\\eta^2$。该方法不要求各组方差齐性，但要求各组观测相互独立，组内样本过小或分布严重偏斜时应对照秩检验。',
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
    case 'kano': return {
      key: '\\mathrm{Better}=\\frac{A+O}',
      text: '为刻画产品或服务要素对受访者满意增益与不满预防的非对称敏感度，采用 KANO 正反配对分类矩阵测度满意系数（Better）与不满意系数（Worse）：',
      formulas: ['\\mathrm{Better}=\\frac{A+O}{A+O+M+I},\\qquad \\mathrm{Worse}=-\\frac{O+M}{A+O+M+I}'],
      where: '式中，$A$、$O$、$M$、$I$ 分别为归入魅力属性、期望属性、必备属性与无差异属性的有效配对频数；$\\mathrm{Better}\\in[0,1]$ 与 $\\mathrm{Worse}\\in[-1,0]$ 共同锚定优先改进象限。',
    };
    case 'rdd': return {
      key: '\\hat{\\tau}_{\\mathrm{SRD}}=',
      text: '针对存在明确制度阈值或分界线 $c$ 的自然分配机制，采用局部线性精确断点回归（Sharp RDD）结合三角核加权识别阈值处局域处理效应：',
      formulas: ['\\hat{\\tau}_{\\mathrm{SRD}}=\\hat{\\mu}_+(c)-\\hat{\\mu}_-(c)', '\\min\\sum_{i=1}^{n}K\\left(\\frac{X_i-c}{h}\\right)\\left(Y_i-\\alpha-\\tau D_i-\\beta(X_i-c)-\\gamma D_i(X_i-c)\\right)^2'],
      where: '式中，$X_i$ 为驱动变量，$c$ 为分配阈值，$D_i$ 为越过阈值的处置示性变量，$K(\\cdot)$ 为三角核权函数，$h$ 为带宽，并配合多带宽敏感性与驱动变量密度连续性检验。',
    };
    case 'cs-did': return {
      key: '\\mathrm{ATT}(g,t)=',
      text: '针对不同地区或个体分批进入试点的交错双重差分结构，静态双向固定效应可能受已处理组充当对照带来的负权重偏误，故改用 Callaway-Sant\'Anna 组别—时期动态估计量：',
      formulas: ['\\mathrm{ATT}(g,t)=E[Y_t-Y_{g-1}|G_g=1]-E[Y_t-Y_{g-1}|C=1]', '\\widehat{\\mathrm{ATT}}=\\sum_{g}\\sum_{t\\ge g}w_{g,t}\\mathrm{ATT}(g,t)'],
      where: '式中，$G_g=1$ 表示在第 $g$ 期首次接受试点的群组，$C=1$ 表示尚未接受处理或永不处理的干净对照组，$w_{g,t}$ 为样本占比权重。',
    };
    case 'psm': return {
      key: 'e(X_i)=P(',
      text: '在观察性调查样本存在选择性偏误时，先以协变量 $X_i$ 拟合处理概率（倾向得分）$e(X_i)$，再在共同支撑域内实施卡尺近邻匹配并以标准化均值差（SMD）检核平衡性：',
      formulas: ['e(X_i)=P(D_i=1|X_i)=\\frac{1}{1+\\exp(-X_i\\beta)}', '\\widehat{\\mathrm{ATT}}=\\frac{1}{n_1}\\sum_{i\\in T}(Y_i-Y_{j(i)}),\\qquad \\mathrm{SMD}=\\frac{\\bar{X}_1-\\bar{X}_0}{\\sqrt{(s_1^2+s_0^2)/2}}'],
      where: '式中，$T$ 为处于共同支撑域内的匹配处理组集合，$j(i)$ 为对照匹配单元；匹配后要求各协变量 $|\\mathrm{SMD}|<0.10$。',
    };
    case 'conformal': return {
      key: '\\hat{q}_{1-\\alpha}=',
      text: '为突破传统参数正态假设局限、提供具有有限样本分布自由覆盖保证的预测不确定性边界，采用 Split Conformal 校准算法计算非一致性残差分位半宽：',
      formulas: ['R_i=\\lvert Y_i-\\hat{f}(X_i)\\rvert,\\qquad \\hat{q}_{1-\\alpha}=Q_{1-\\alpha}(R_1,\\ldots,R_m)', 'C(X)=[\\hat{f}(X)-\\hat{q}_{1-\\alpha},\\hat{f}(X)+\\hat{q}_{1-\\alpha}],\\qquad P(Y\\in C(X))\\ge 1-\\alpha'],
      where: '式中，$R_i$ 为校准集绝对预测残差，$Q_{1-\\alpha}$ 为经有限样本修正的经验分位数，$C(X)$ 给出目标置信水平 $1-\\alpha$ 下的预测区间与高波动拒识界线。',
    };
    case 'topsis': return {
      key: 'e_j=-\\frac{1}{\\ln m}',
      text: '多评价单元综合排序采用客观信息熵赋权结合逼近理想解排序法（Entropy-TOPSIS），依据各指标离散度自动确定权重并计算至正负理想解的欧氏相对贴近度：',
      formulas: ['e_j=-\\frac{1}{\\ln m}\\sum_{i=1}^{m}p_{ij}\\ln p_{ij},\\qquad w_j=\\frac{1-e_j}{\\sum_{k=1}^{K}(1-e_k)}', 'C_i=\\frac{D_i^-}{D_i^++D_i^-},\\qquad D_i^\\pm=\\sqrt{\\sum_{j=1}^{K}(z_{ij}-z_j^\\pm)^2}'],
      where: '式中，$m$ 为评价对象数，$p_{ij}$ 为归一化指标比重，$e_j$ 与 $w_j$ 为第 $j$ 项指标的信息熵与客观权重，$D_i^+$、$D_i^-$ 分别为到最优与最劣理想解的加权距离。',
    };
    case 'iv': return {
      key: 'X_i=\\pi_0+\\pi_1Z_i',
      text: '面对未观测混杂因素导致解释变量与误差项相关的内生性偏误，引入兼具相关性与排他性约束的工具变量 $Z_i$ 实施两阶段最小二乘（IV-2SLS）与 HC1 稳健推断：',
      formulas: ['X_i=\\pi_0+\\pi_1 Z_i+\\gamma W_i+v_i,\\qquad Y_i=\\beta_0+\\beta_{\\mathrm{IV}}\\hat{X}_i+\\delta W_i+u_i', '\\hat{\\beta}_{\\mathrm{2SLS}}=(Z^T X)^{-1}Z^T Y'],
      where: '式中，$W_i$ 为外生控制变量，$\\hat{X}_i$ 为第一阶段拟合值；报告并列汇报第一阶段偏 $F$ 统计量（检验弱工具风险）与 Wu-Hausman 控制函数内生性检验 $p$ 值。',
    };
    case 'ab': return {
      key: 't_{\\mathrm{Welch}}=',
      text: '线上或田野随机分流实验同步检验分流样本比例失衡（SRM）、主指标 Welch 双样本差异及基于信息分数 $t$ 的 O\'Brien-Fleming 序贯 $\\alpha$ 消耗临界边界：',
      formulas: ['t_{\\mathrm{Welch}}=\\frac{\\bar{Y}_1-\\bar{Y}_0}{\\sqrt{s_1^2/n_1+s_0^2/n_0}},\\qquad z_{\\mathrm{OBF}}(t)=\\frac{z_{1-\\alpha/2}}{\\sqrt{t}}', '\\chi^2_{\\mathrm{SRM}}=\\sum_{k=0}^{1}\\frac{(n_k-E_k)^2}{E_k}'],
      where: '式中，$\\bar{Y}_k$、$s_k^2$、$n_k$ 分别为控制组与实验组均值、方差与样本量，$E_k$ 为期望分流数，$t\\in(0,1]$ 为累计信息比例，并同步监测安全护栏指标劣化风险。',
    };
    case 'survival': return {
      key: '\\hat{S}(t)=\\prod_',
      text: '针对存在右删失特征的留存时长与事件发生时间数据，采用非参数 Kaplan-Meier 乘积极限估计生存函数、共同随访上限限制平均生存时间（RMST）与 Mantel-Haenszel Log-Rank 检验：',
      formulas: ['\\hat{S}(t)=\\prod_{t_j\\le t}\\left(1-\\frac{d_j}{n_j}\\right),\\qquad \\mathrm{RMST}(\\tau)=\\int_0^\\tau \\hat{S}(u)du', '\\chi^2_{\\mathrm{LR}}=\\frac{\\left(\\sum_{j}(O_{1j}-E_{1j})\\right)^2}{\\sum_{j}V_{1j}}'],
      where: '式中，$n_j$ 与 $d_j$ 分别为事件时点 $t_j$ 的在险人数与事件发生数，$\\tau$ 为两队列共有最长随访上限，$O_{1j}$、$E_{1j}$、$V_{1j}$ 为各事件时刻的超几何期望与方差。',
    };
    case 'meta': return {
      key: '\\hat{\\theta}_{\\mathrm{RE}}=',
      text: '跨多项独立实证研究的效应量合成采用 DerSimonian-Laird 随机效应模型估算研究间异质方差 $\\hat{\\tau}^2$、$I^2$ 异质比例及 Egger 漏斗图对称性回归检验：',
      formulas: ['\\hat{\\theta}_{\\mathrm{RE}}=\\frac{\\sum_{i=1}^{k}w_i^*\\theta_i}{\\sum_{i=1}^{k}w_i^*},\\qquad w_i^*=\\frac{1}{s_i^2+\\hat{\\tau}^2}', 'I^2=\\max\\left(0,\\frac{Q-(k-1)}{Q}\\right)\\times 100'],
      where: '式中，$\\theta_i$ 与 $s_i$ 分别为第 $i$ 项研究的点估计与标准误，$Q$ 为 Cochran 异质性卡方统计量，$I^2$ 以百分比衡量无法由抽样误差解释的真实异质性占比。',
    };
    default: return null;
  }
}
