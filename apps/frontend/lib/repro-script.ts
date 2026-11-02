import type { ResultSnapshot } from './research-quality.ts';
import type { AnalysisCalculationReceipt } from './analysis-result-receipt.ts';
import { METHOD_LABELS } from './report-placement.ts';

/**
 * A Python script that recomputes one registered result from its calculation receipt, for the code view and
 * the report's reproducibility appendix. Lines a beginner may safely change (colours, sizes) are marked `style`;
 * lines that decide the sample or the test, and so the conclusion, are marked `risk`. Each mark carries a
 * plain-language note.
 */
export type ScriptLine = { text: string; kind?: 'style' | 'risk'; note?: string };
export type ReproScript = {
  fileName: string; lines: ScriptLine[];
  /** False when the system did something the script cannot repeat; `gaps` says what. */
  exact: boolean; gaps: string[];
};

const plain = (text: string): ScriptLine => ({ text });
const style = (text: string, note: string): ScriptLine => ({ text, kind: 'style', note });
const risk = (text: string, note: string): ScriptLine => ({ text, kind: 'risk', note });
/** A JSON string is a valid Python string literal. */
const py = (value: string) => JSON.stringify(value);
const oneLine = (value: string) => value.replace(/[\r\n\t\u0085\p{Zl}\p{Zp}]+/gu, ' ').trim();
const list = (values: readonly (string | number)[]) => `[${values.map(v => typeof v === 'number' ? String(v) : py(v)).join(', ')}]`;


function reader(sourceName: string): ScriptLine[] {
  const excel = /\.xlsx?$/i.test(sourceName);
  // A source named for display (a pasted table, the teaching sample) has no file yet: it is saved as CSV first.
  const file = /\.(csv|tsv|txt|xlsx?)$/i.test(sourceName) ? sourceName : `${oneLine(sourceName).replace(/[\\/:*?"<>|]+/g, '_') || '数据'}.csv`;
  return [
    style(`DATA = ${py(file)}`, file === sourceName ? '数据文件：放在脚本旁边，或改成文件在你电脑上的完整路径' : '数据文件：先把这份数据另存为 CSV（UTF-8），放在脚本旁边；也可以改成完整路径'),
    excel ? plain('df = pd.read_excel(DATA, dtype=str, keep_default_na=False).fillna("")')
      : plain('df = pd.read_csv(DATA, dtype=str, keep_default_na=False, encoding="utf-8-sig")'),
  ];
}

function column(variable: { column: number; name: string }, name: string): ScriptLine {
  return plain(`${name} = df.iloc[:, ${variable.column}]  # 第 ${variable.column + 1} 列「${oneLine(variable.name)}」`);
}

/** The drawing constants every script opens its figure with, each one safe to change. */
function figureStyle(output: string, colour: ScriptLine): ScriptLine[] {
  return [
    plain(''),
    plain('# —— 作图：下面这几行可以放心改 ——'),
    colour,
    style('FIG_SIZE = (8, 4.5)', '图的宽和高（英寸）：想要更大，就把两个数一起调大'),
    style('FONT_SIZE = 12', '字号：答辩投影建议 14 以上'),
    style('plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC"]',
      '中文字体：按顺序找电脑上有的字体；一个都没有时，中文会显示成方框'),
    plain('plt.rcParams["axes.unicode_minus"] = False'),
    style('DPI = 300', '清晰度：打印用 300，放进 PPT 用 200 就够'),
    style(`OUTPUT = ${py(output)}`, '图片保存的文件名'),
    plain('fig, ax = plt.subplots(figsize=FIG_SIZE)'),
  ];
}
const save = [plain('ax.tick_params(labelsize=FONT_SIZE)'), plain('fig.tight_layout()'), plain('fig.savefig(OUTPUT, dpi=DPI)')];
const COLOUR = style('COLOR = "#2F6B4F"', '颜色：换成任意色号，例如红色 "#C0392B"、蓝色 "#2E6DB4"');

function sampleCheck(n: number, exact: boolean, expression: string): ScriptLine[] {
  return exact ? [plain(`assert ${expression} == ${n}, "有效样本与系统登记的 ${n} 不一致：请核对数据文件、缺失编码和筛选条件"`)] : [];
}

function body(method: string, c: AnalysisCalculationReceipt, n: number, exact: boolean, output: string): ScriptLine[] | null {
  const [first, second] = c.variables;
  switch (method) {
    case 'frequency': return [
      column(first, 'x'),
      plain('valid = x[~missing(x)].str.strip()'),
      ...sampleCheck(n, exact, 'len(valid)'),
      plain('counts = valid.value_counts()'),
      plain('low, high = proportion_confint(counts, counts.sum(), alpha=0.05, method="wilson")'),
      plain('table = pd.DataFrame({"频数": counts, "占比 (%)": counts / counts.sum() * 100,'),
      plain('                      "95% CI 下限 (%)": low * 100, "95% CI 上限 (%)": high * 100})'),
      plain('print(table.round(2))'),
      ...figureStyle(output, COLOUR),
      plain('share = (counts / counts.sum() * 100).sort_values()'),
      plain('ax.barh(share.index, share.values, color=COLOR)'),
      plain('ax.set_xlabel("占比 (%)", fontsize=FONT_SIZE)'),
      ...save,
    ];
    case 'numeric': return [
      column(first, 'x'),
      plain('v = number(x[~missing(x)]).dropna()'),
      ...sampleCheck(n, exact, 'len(v)'),
      plain('print(v.describe())  # 标准差用 n−1，四分位数与系统同为 Type 7'),
      plain('print("均值 95% CI:", stats.t.interval(0.95, len(v) - 1, loc=v.mean(), scale=stats.sem(v)))'),
      ...figureStyle(output, COLOUR),
      style('BINS = 10', '柱子个数：数据多时可以调大'),
      plain('ax.hist(v, bins=BINS, color=COLOR, edgecolor="white")'),
      plain(`ax.set_xlabel(${py(oneLine(first.name))}, fontsize=FONT_SIZE)`),
      ...save,
    ];
    case 'groups': return [
      column(first, 'g'),
      column(second, 'y'),
      risk('keep = ~missing(g) & ~missing(y) & number(y).notna()', '只用分组和数值都有效的行，不插补'),
      ...sampleCheck(n, exact, 'int(keep.sum())'),
      plain('order = list(g[~missing(g)].str.strip().unique())  # 组的顺序与系统一致：按首次出现'),
      plain('groups = {k: number(y)[keep & (g.str.strip() == k)].values for k in order}'),
      plain('print(pd.DataFrame({k: pd.Series(v).describe() for k, v in groups.items()}).T)'),
      plain('samples = [v for v in groups.values() if len(v) > 0]'),
      plain('if len(samples) == 2:'),
      risk('    print(stats.ttest_ind(samples[0], samples[1], equal_var=False))', '主要检验：Welch t，不假定两组方差相等'),
      plain('    a, b = samples'),
      plain('    exact = len(a) < 50 and len(b) < 50 and len(set(a) | set(b)) == len(a) + len(b)'),
      plain('    print(stats.mannwhitneyu(a, b, alternative="two-sided", method="exact" if exact else "asymptotic"))'),
      plain('else:'),
      risk('    print(anova_oneway(samples, use_var="unequal"))', '主要检验：Welch 方差分析，不假定各组方差相等'),
      plain('    print(stats.f_oneway(*samples))  # 经典方差分析，作对照'),
      plain('    print(stats.kruskal(*samples))  # 秩检验，作稳健性对照'),
      plain('    pairs = [(i, j) for i in range(len(samples)) for j in range(i + 1, len(samples))]'),
      plain('    p = [stats.ttest_ind(samples[i], samples[j], equal_var=False).pvalue for i, j in pairs]'),
      risk('    print(multipletests(p, method="holm")[1])', '两两比较的 p 值经 Holm 校正'),
      ...figureStyle(output, COLOUR),
      plain('ax.boxplot(samples, patch_artist=True, boxprops={"facecolor": COLOR, "alpha": 0.6})'),
      plain('ax.set_xticks(range(1, len(samples) + 1), [k for k, v in groups.items() if len(v) > 0])'),
      plain(`ax.set_ylabel(${py(oneLine(second.name))}, fontsize=FONT_SIZE)`),
      ...save,
    ];
    case 'crosstab': return [
      column(first, 'r'),
      column(second, 'c'),
      risk('keep = ~missing(r) & ~missing(c)', '只用两题都作答的行'),
      ...sampleCheck(n, exact, 'int(keep.sum())'),
      plain('table = pd.crosstab(r[keep].str.strip(), c[keep].str.strip())'),
      plain('print(table)'),
      plain('print((pd.crosstab(r[keep].str.strip(), c[keep].str.strip(), normalize="index") * 100).round(2))'),
      risk('chi2, p, dof, expected = stats.chi2_contingency(table, correction=False)', '不作连续性校正，与系统一致'),
      plain('v = (chi2 / (table.values.sum() * (min(table.shape) - 1))) ** 0.5'),
      plain('print(f"χ²({dof}) = {chi2:.2f}, p = {p:.4f}, Cramér V = {v:.3f}")'),
      plain('if table.shape == (2, 2):'),
      plain('    print("Fisher 精确检验:", stats.fisher_exact(table))'),
      ...figureStyle(output, style('COLORMAP = "Greens"', '配色方案：可换成 "Blues"、"Oranges"、"Purples" 等')),
      plain('(pd.crosstab(r[keep].str.strip(), c[keep].str.strip(), normalize="index") * 100).plot(kind="bar", stacked=True, colormap=COLORMAP, ax=ax)'),
      plain('ax.set_ylabel("行内占比 (%)", fontsize=FONT_SIZE)'),
      ...save,
    ];
    case 'pearson': case 'spearman': {
      const rank = method === 'spearman';
      return [
        column(first, 'x'),
        column(second, 'y'),
        risk('keep = ~missing(x) & ~missing(y) & number(x).notna() & number(y).notna()', '只用两题都是有效数值的配对'),
        ...sampleCheck(n, exact, 'int(keep.sum())'),
        plain('a, b = number(x)[keep], number(y)[keep]'),
        ...(rank ? [plain('print(stats.spearmanr(a, b))  # p 值为 t 近似，与系统一致')]
          : [plain('res = stats.pearsonr(a, b)'), plain('print(res, res.confidence_interval(0.95))  # 区间用 Fisher z')]),
        ...figureStyle(output, COLOUR),
        style('POINT_SIZE = 24', '点的大小'),
        plain('ax.scatter(a, b, s=POINT_SIZE, color=COLOR, alpha=0.7)'),
        plain(`ax.set_xlabel(${py(oneLine(first.name))}, fontsize=FONT_SIZE)`),
        plain(`ax.set_ylabel(${py(oneLine(second.name))}, fontsize=FONT_SIZE)`),
        ...save,
      ];
    }
    case 'alpha': {
      const s = c.scale!;
      return [
        plain(`COLS = ${list(s.columns)}  # 量表题项所在的列（从 0 数起）`),
        risk(`REVERSE = ${list(s.reverse)}`, '反向计分的题：按「下限 + 上限 − 原值」换算，与系统一致'),
        risk(`LOW, HIGH = ${s.min}, ${s.max}`, '计分范围：超出范围的行不参与计算'),
        plain('items = df.iloc[:, COLS].copy()'),
        plain('items.columns = COLS'),
        plain('scores = items.apply(number)'),
        risk('ok = ~items.apply(missing).any(axis=1) & scores.notna().all(axis=1) & scores.ge(LOW).all(axis=1) & scores.le(HIGH).all(axis=1)',
          '只用完整案例：任一题缺失、非数值或超出范围的行都不计入'),
        ...sampleCheck(n, exact, 'int(ok.sum())'),
        plain('x = scores[ok].copy()'),
        plain('x[REVERSE] = LOW + HIGH - x[REVERSE]'),
        plain('def cronbach(m):'),
        plain('    k = m.shape[1]'),
        plain('    return k / (k - 1) * (1 - m.var(ddof=1).sum() / m.sum(axis=1).var(ddof=1))'),
        plain('print("Cronbach α =", round(cronbach(x), 4))'),
        plain('rest = {c: x[c].corr(x.drop(columns=c).sum(axis=1)) for c in COLS}  # 校正题总相关'),
        plain('print(pd.DataFrame({"校正题总相关": rest, "删除后 α": {c: cronbach(x.drop(columns=c)) for c in COLS}}).round(3))'),
        ...figureStyle(output, COLOUR),
        plain('ax.barh([f"第 {c + 1} 列" for c in COLS], list(rest.values()), color=COLOR)'),
        plain('ax.set_xlabel("校正题总相关", fontsize=FONT_SIZE)'),
        ...save,
      ];
    }
    default: return null;
  }
}

const IMPORTS: Record<string, string[]> = {
  frequency: ['from statsmodels.stats.proportion import proportion_confint'],
  numeric: ['from scipy import stats'],
  groups: ['from scipy import stats', 'from statsmodels.stats.oneway import anova_oneway', 'from statsmodels.stats.multitest import multipletests'],
  crosstab: ['from scipy import stats'],
  pearson: ['from scipy import stats'], spearman: ['from scipy import stats'], alpha: [],
};

/** Null when the result carries no calculation receipt: legacy results and the advanced methods cannot be rebuilt. */
export function reproScript(result: ResultSnapshot): ReproScript | null {
  const c = result.receipt?.calculation;
  if (!c || !(result.method in IMPORTS)) return null;
  const gaps: string[] = [];
  if (c.routing.analysis || c.routing.filter) gaps.push(`系统还按问卷跳题逻辑排除了不该作答这道题的受访者，脚本没有重复这一步，算出的有效样本可能多于系统登记的 ${result.n}。`);
  if (/\.sav$/i.test(result.sourceName)) gaps.push('原始数据是 SPSS 文件：请先另存为 CSV，再把 DATA 改成 CSV 文件名。');
  const exact = !gaps.length;
  const output = `${oneLine(result.title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '图'}.png`;
  const steps = body(result.method, c, result.n, exact, output);
  if (!steps) return null;
  const filter = c.filter ? [
    plain(''),
    plain(`f = df.iloc[:, ${c.filter.column}]  # 第 ${c.filter.column + 1} 列`),
    risk(`FILTER = ${list(c.filter.values)}`, '只分析这一列为这些值的受访者；改动会换掉分析的人群'),
    plain('df = df[~missing(f) & f.str.strip().isin(FILTER)]'),
  ] : [];
  const lines: ScriptLine[] = [
    plain(`# 复现：${oneLine(result.title)}（${METHOD_LABELS[result.method] ?? result.method}）`),
    plain('# 由证见根据登记结果自动生成，数值应与系统一致。'),
    plain('# 需要：pip install pandas scipy statsmodels matplotlib openpyxl'),
    plain('import pandas as pd'),
    plain('import matplotlib.pyplot as plt'),
    ...IMPORTS[result.method].map(plain),
    plain(''),
    ...reader(result.sourceName),
    risk(`MISSING = ${list(c.missingCodes)}`, '缺失编码：空白和这些值都按缺失处理，与系统设置一致'),
    plain('def missing(s): return s.str.strip().eq("") | s.str.strip().isin(MISSING)'),
    plain('def number(s):'),
    plain('    t = s.str.strip()'),
    plain('    v = pd.to_numeric(t.where(t.str.fullmatch(r"[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?")), errors="coerce")'),
    plain('    return v.where(v.abs() <= 1e12)  # 与系统相同：只认普通数字写法'),
    ...filter,
    plain(''),
    ...steps,
  ];
  const stem = oneLine(result.title).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'analysis';
  return { fileName: `${stem}.py`, lines, exact, gaps };
}

/** The script as a file: each mark becomes a comment above its line, so the notes survive a copy or download. */
export function scriptText(script: ReproScript): string {
  const head = script.gaps.map(gap => `# 注意：${gap}`);
  const body = script.lines.flatMap(line => {
    if (!line.kind) return [line.text];
    const indent = line.text.match(/^\s*/)![0];
    return [`${indent}# ${line.kind === 'style' ? '✎ 可以放心改' : '▲ 改了会影响结论'}：${line.note}`, line.text];
  });
  return [...head, ...body].join('\n') + '\n';
}
