/**
 * 证见 EVI-X · the contestant's studios, opened from the agent:
 * 1. Chart studio (`/绘图`): the project's registered results as editable charts.
 * 2. Code studio (`/编程`): scripts that compute each analysis from the data file, and booktabs tables built from
 *    the project's registered results.
 * 3. Writing studio (`/撰稿`): section templates whose blanks the author fills from the registered facts.
 * 4. The teaching demo (`/铸造`, `/国奖`) and the preparation route (`/备赛`).
 *
 * No number is written in here: a figure, a table cell or a fact either comes from a result the project registered,
 * or is a blank for the author to fill. A project with nothing registered gets the empty forms, not an example's
 * numbers.
 */

import type { ResultSnapshot } from '../research-quality.ts';
import { presentResult } from '../report-tables.ts';
import { draftFacts } from './draft.ts';
import { decomposeTopic, type DemoBlueprint } from './demo-study.ts';
import { lightBar, percent } from './glyphs.ts';
import { LIT_ROOMS, roomLight } from './illumination.ts';
import type { AgentCard, AgentLink, AgentTurn, Line, Mark, RouterContext, Span } from './router.ts';

const t = (text: string, mark?: Mark): Span => (mark ? { text, mark } : { text });
const say = (label: string, text = label): AgentLink => ({ label, action: { type: 'say', text } });
const recommend = (link: AgentLink): AgentLink => ({ ...link, primary: true });

/**
 * The topic the studios work on: the topic named in the command, else the project's title or questionnaire, laid
 * out on the survey structure.
 */
export function resolveActiveBlueprint(ctx: RouterContext, query = ''): DemoBlueprint {
  const cleanedQuery = query
    .replace(/^\/?(?:国奖|铸造|标杆|绘图|画图|制图|编程|代码|撰稿|润色|备赛|教练)\s*/iu, '')
    .replace(/^(?:五维|ipa|列联|卡方|帕累托|摘要|抽样|实证|对策|答辩)\s*/iu, '')
    .trim();
  const designRoom = ctx.light.rooms.find(r => r.room === 'design');
  const rawDesignDetail = designRoom?.checks[0]?.detail ?? '';
  const extractedFromLight = rawDesignDetail.startsWith('《') && rawDesignDetail.endsWith('》') ? rawDesignDetail.slice(1, -1).trim() : '';
  const projectTitle = ctx.projectTitle?.trim() || ctx.design?.title?.trim() || extractedFromLight || '';
  return decomposeTopic(cleanedQuery.length >= 4 ? cleanedQuery : projectTitle, ctx.design);
}

/** The project's registered results, sampling frames aside. */
const registered = (ctx: RouterContext): ResultSnapshot[] => (ctx.results?.results ?? []).filter(r => r.method !== 'sampling-frame');

/* ──────────────────────────────────────────────────────────────────────────
 * 1. Chart studio (`/绘图`)
 * ────────────────────────────────────────────────────────────────────────── */

export type StudioChartKind = 'bar' | 'lollipop' | 'grouped' | 'line' | 'pareto';
export type StudioPaletteId = 'pitch-green' | 'jinmo-gold' | 'jade-vermilion' | 'academic-slate';

export type StudioChartPoint = {
  label: string;
  primary: number;
  secondary?: number;
  note?: string;
};

export type ChartStudioSpec = {
  id: string;
  title: string;
  subtitle: string;
  unit: string;
  primaryLabel: string;
  secondaryLabel?: string;
  defaultKind: StudioChartKind;
  defaultPalette: StudioPaletteId;
  sourceLabel: string;
  annotation: string;
  targetNode: string;
  points: StudioChartPoint[];
};

export type ChartStudioCardData = {
  activeDatasetId: string;
  /** Empty until the project registers a result: the studio then says where results come from. */
  datasets: ChartStudioSpec[];
};

export const STUDIO_PALETTES: Record<
  StudioPaletteId,
  { name: string; primary: string; secondary: string; accent: string; surface: string; ink: string; grid: string }
> = {
  'pitch-green': {
    name: '青松绿茵 · 金青',
    primary: '#0F766E',
    secondary: '#C8902F',
    accent: '#B83239',
    surface: '#FAF6EE',
    ink: '#172321',
    grid: '#D9D2C3',
  },
  'jinmo-gold': {
    name: '金墨寻证 · 宋刻',
    primary: '#85590A',
    secondary: '#00796F',
    accent: '#B83239',
    surface: '#FAF6EE',
    ink: '#1E1B16',
    grid: '#DED5C4',
  },
  'jade-vermilion': {
    name: '青玉朱砂 · 象限诊断',
    primary: '#00796F',
    secondary: '#B83239',
    accent: '#C8902F',
    surface: '#F7F9F8',
    ink: '#162422',
    grid: '#CFDAD7',
  },
  'academic-slate': {
    name: '学术岩灰 · 期刊印刷',
    primary: '#234E80',
    secondary: '#5B728A',
    accent: '#8A3449',
    surface: '#F9FAFB',
    ink: '#1A2330',
    grid: '#D5DCE4',
  },
};

const cellNumber = (cell: unknown): number | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== 'string') return null;
  const n = Number(cell.replace(/[−]/gu, '-').replace(/[%％]$/u, ''));
  return cell.trim() && Number.isFinite(n) ? n : null;
};

/** A registered result as a chart: each row a point, its first number the bar and its second the companion. */
function resultChart(r: ResultSnapshot): ChartStudioSpec | null {
  const numericColumns = r.headers.map((_, i) => i).filter(i => r.rows.some(row => cellNumber(row[i]) !== null));
  const [first, second] = numericColumns;
  if (first === undefined) return null;
  const points: StudioChartPoint[] = [];
  for (const row of r.rows.slice(0, 8)) {
    const value = cellNumber(row[first]);
    if (value === null) continue;
    const label = row.filter((cell, i) => !numericColumns.includes(i) && typeof cell === 'string' && cell.trim()).join('·') || `第 ${points.length + 1} 项`;
    const companion = second === undefined ? null : cellNumber(row[second]);
    points.push({ label: label.slice(0, 24), primary: Number(value.toFixed(3)), ...(companion === null ? {} : { secondary: Number(companion.toFixed(3)) }) });
  }
  if (points.length < 2) return null;
  return {
    id: `result-${r.id}`,
    title: r.title,
    subtitle: `已登记结果 · ${r.method} · 有效样本 ${r.n}${r.classification === 'simulated' ? ' · 教学模拟数据' : ''}`,
    unit: /%/u.test(r.headers[first] ?? '') ? '%' : '',
    primaryLabel: r.headers[first] ?? '统计值',
    ...(second === undefined ? {} : { secondaryLabel: r.headers[second] }),
    defaultKind: second === undefined ? 'bar' : 'grouped',
    defaultPalette: 'jinmo-gold',
    sourceLabel: `${r.sourceName}（n = ${r.n}）`,
    annotation: r.receipt?.interpretation || `来自已登记结果「${r.title}」。`,
    targetNode: 'sample.descriptive',
    points,
  };
}

export function buildChartStudioCardData(ctx: RouterContext, query = ''): ChartStudioCardData {
  const datasets = registered(ctx).map(resultChart).filter((d): d is ChartStudioSpec => !!d).slice(0, 12);
  const q = query.trim().toLowerCase();
  const asked = q ? datasets.find(d => d.title.toLowerCase().includes(q)) : undefined;
  return { activeDatasetId: (asked ?? datasets[0])?.id ?? '', datasets };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 2. Code studio (`/编程`)
 * ────────────────────────────────────────────────────────────────────────── */

export type CodeStudioLang = 'python' | 'r' | 'spss' | 'latex';

export type CodeStudioRecipe = {
  id: string;
  title: string;
  badge: string;
  summary: string;
  auditUpgrade: string;
  targetNode: string;
  snippets: Record<CodeStudioLang, string>;
};

export type CodeStudioCardData = {
  activeRecipeId: string;
  activeLang: CodeStudioLang;
  recipes: CodeStudioRecipe[];
};

const latexEscape = (text: string) => text.replace(/\\/gu, '\\textbackslash{}').replace(/([&%$#_{}])/gu, '\\$1').replace(/~/gu, '\\textasciitilde{}').replace(/\^/gu, '\\textasciicircum{}');

/**
 * A booktabs table: the registered result's own cells when the project has one, else the columns with a dash in every
 * cell and a note that the platform fills them once the analysis runs.
 */
function booktabs(caption: string, label: string, result: ResultSnapshot | undefined, skeleton: readonly string[]): string {
  const table = result ? presentResult(result) : null;
  const headers = table?.headers ?? [...skeleton];
  const rows = table ? table.rows.slice(0, 20) : [skeleton.map(() => '—')];
  const n = result ? `（$n = ${result.n}$）` : '';
  return [
    '\\begin{table}[htbp]',
    '  \\centering',
    `  \\caption{${latexEscape(caption)}${n}}`,
    `  \\label{${label}}`,
    `  \\begin{tabular}{${'l' + 'c'.repeat(Math.max(0, headers.length - 1))}}`,
    '    \\toprule',
    `    ${headers.map(latexEscape).join(' & ')} \\\\`,
    '    \\midrule',
    ...rows.map(row => `    ${row.map(cell => latexEscape(String(cell))).join(' & ')} \\\\`),
    '    \\bottomrule',
    '  \\end{tabular}',
    ...(result ? [] : ['  % 运行这项分析并登记后，平台按登记结果填入各单元格；在此之前不要手填数字。']),
    '\\end{table}',
  ].join('\n');
}

export function buildCodeStudioCardData(ctx: RouterContext, query = ''): CodeStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const csvName = ctx.datasetName || `${bp.slug}.csv`;
  const [d3, d4, d5, d6, d7] = bp.dimensions;
  const results = registered(ctx);
  const find = (method: string) => results.find(r => r.method === method);

  const recipes: CodeStudioRecipe[] = [
    {
      id: 'crosstab-chi2',
      title: `01 ${bp.groupConstruct} × ${bp.statusConstruct}：列联 χ² 与 Cramér’s V`,
      badge: '名义变量关联',
      summary: `检验${bp.groupA}与${bp.groupB}在${bp.statusConstruct}上的分布差异，并报告效应量与调整后标准化残差。`,
      auditUpgrade: '两个无序分类变量用 Pearson χ² 与 Cramér’s V，不用 Spearman 秩相关；期望频数过小时改用 Fisher 精确检验。',
      targetNode: 'compare.tests',
      snippets: {
        python: `import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

df = pd.read_csv("${csvName}")
obs = pd.crosstab(df["Q1"], df["Q2"])  # ${bp.groupConstruct} × ${bp.statusConstruct}
chi2, p_val, dof, expected = chi2_contingency(obs.values, correction=False)
n = obs.values.sum()
cramers_v = np.sqrt(chi2 / (n * (min(obs.shape) - 1)))

# 调整后标准化残差：|z| > 1.96 的单元格偏离独立性
rows = obs.values.sum(axis=1, keepdims=True)
cols = obs.values.sum(axis=0, keepdims=True)
adj = (obs.values - expected) / np.sqrt(expected * (1 - rows / n) * (1 - cols / n))
print(f"chi2({dof}) = {chi2:.2f}, p = {p_val:.3g}, Cramer's V = {cramers_v:.3f}, min expected = {expected.min():.2f}")
print(pd.DataFrame(adj, index=obs.index, columns=obs.columns).round(2))`,
        r: `df <- read.csv("${csvName}")
obs <- table(df$Q1, df$Q2)  # ${bp.groupConstruct} × ${bp.statusConstruct}
test <- chisq.test(obs, correct = FALSE)
cramers_v <- sqrt(as.numeric(test$statistic) / (sum(obs) * (min(dim(obs)) - 1)))
cat(sprintf("chi2(%d) = %.2f, p = %.3g, Cramer's V = %.3f\\n", test$parameter, test$statistic, test$p.value, cramers_v))
print(round(prop.table(obs, margin = 1) * 100, 2))
print(round(test$stdres, 2))`,
        spss: `* ${bp.groupConstruct} (Q1) × ${bp.statusConstruct} (Q2).
CROSSTABS
  /TABLES = Q1 BY Q2
  /FORMAT = AVALUE TABLES
  /STATISTICS = CHISQ PHI
  /CELLS = COUNT EXPECTED ROW ASRESID
  /COUNT ROUND CELL.`,
        latex: booktabs(`${bp.groupConstruct}与${bp.statusConstruct}的交叉分布`, `tab:${bp.slug}-crosstab`, find('crosstab'), [bp.groupConstruct, ...bp.statusCategories]),
      },
    },
    {
      id: 'implicit-ipa',
      title: `02 ${bp.scaleConstruct}：重要性—表现分析（IPA）`,
      badge: '短板定位',
      summary: `以各方面对${bp.overallSatConstruct}的标准化回归系数作为隐性重要性，与表现均值一起划分四个象限。`,
      auditUpgrade: '隐性重要性取标准化回归系数而非简单相关，并报告共线性诊断；象限分界用均值，结论只说关联不说因果。',
      targetNode: 'diagnosis.evaluation',
      snippets: {
        python: `import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("${csvName}")
dims = ["Q3", "Q4", "Q5", "Q6", "Q7"]
labels = ["${d3.short}", "${d4.short}", "${d5.short}", "${d6.short}", "${d7.short}"]
X = StandardScaler().fit_transform(df[dims])
y = StandardScaler().fit_transform(df[["Q10"]]).ravel()
importance = LinearRegression().fit(X, y).coef_
performance = df[dims].mean().values
cut_i, cut_p = importance.mean(), performance.mean()
quadrant = ["继续保持" if p >= cut_p and i >= cut_i else "重点改进" if i >= cut_i else "过度投入" if p >= cut_p else "次要改进"
            for p, i in zip(performance, importance)]
print(pd.DataFrame({"方面": labels, "表现": performance.round(2), "隐性重要性": importance.round(3), "象限": quadrant}))`,
        r: `df <- read.csv("${csvName}")
dims <- c("Q3", "Q4", "Q5", "Q6", "Q7")
z <- as.data.frame(scale(df[, c(dims, "Q10")]))
importance <- coef(lm(Q10 ~ Q3 + Q4 + Q5 + Q6 + Q7, data = z))[-1]
performance <- colMeans(df[, dims])
print(data.frame(Performance = round(performance, 2), Importance = round(importance, 3)))`,
        spss: `* ${bp.scaleConstruct} 对 ${bp.overallSatConstruct} (Q10) 的回归，取标准化系数作为隐性重要性.
REGRESSION
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL
  /DEPENDENT Q10
  /METHOD = ENTER Q3 Q4 Q5 Q6 Q7.`,
        latex: booktabs(`${bp.scaleConstruct}各方面的重要性与表现`, `tab:${bp.slug}-ipa`, find('ipa'), ['方面', '隐性重要性', '表现均值', '象限']),
      },
    },
    {
      id: 'sampling-size',
      title: '03 样本量：Cochran 公式与设计效应',
      badge: '抽样设计',
      summary: '按置信水平、允许误差和预估比例算出所需样本量；有抽样框的复杂抽样再乘设计效应，并按预估有效率放大发放量。',
      auditUpgrade: '设计效应与有效率是设计时的假设，须写明来源；便利样本没有抽样框，算出的样本量只服务估计精度，不能把便利样本说成概率样本。',
      targetNode: 'design.sampling',
      snippets: {
        python: `import math

z, p, e = 1.96, 0.5, 0.05   # 95% 置信水平、预估比例、允许误差
deff = 1.0                  # 设计效应：简单随机抽样为 1；分层或整群抽样按设计估计后填写
valid_rate = 0.9            # 预估有效率：按预调查结果填写

n0 = z ** 2 * p * (1 - p) / e ** 2
n_design = math.ceil(n0 * deff)
n_issue = math.ceil(n_design / valid_rate)
print(f"n0 = {n0:.2f}, 设计后 = {n_design}, 计划发放 = {n_issue}")`,
        r: `z <- 1.96; p <- 0.5; e <- 0.05
deff <- 1.0        # 设计效应，按抽样设计填写
valid_rate <- 0.9  # 预估有效率，按预调查填写
n0 <- z^2 * p * (1 - p) / e^2
cat(sprintf("n0 = %.2f, 设计后 = %d, 计划发放 = %d\\n", n0, ceiling(n0 * deff), ceiling(ceiling(n0 * deff) / valid_rate)))`,
        spss: `* 质量筛查：注意力题须选 4，并检查直线作答（五个方面答案完全相同）.
COMPUTE attention_ok = (Q8 = 4).
COMPUTE straight = (Q3 = Q4 AND Q4 = Q5 AND Q5 = Q6 AND Q6 = Q7).
FREQUENCIES VARIABLES = attention_ok straight.`,
        latex: `\\begin{equation}
  n_{0} = \\frac{Z_{\\alpha/2}^{2}\\,P(1-P)}{e^{2}}, \\qquad
  n_{\\text{设计}} = \\left\\lceil n_{0} \\times \\mathrm{DEFF} \\right\\rceil, \\qquad
  n_{\\text{发放}} = \\left\\lceil \\frac{n_{\\text{设计}}}{\\text{预估有效率}} \\right\\rceil
\\end{equation}`,
      },
    },
    {
      id: 'kmeans-silhouette',
      title: `04 受访者分群：K 均值与轮廓系数`,
      badge: '分群核验',
      summary: '在标准化后的五个方面上做 K 均值聚类，用轮廓系数比较不同的 k，并用重抽样检查分群是否稳定。',
      auditUpgrade: '参与聚类的变量不能再拿来做显著性检验来“证明”分群有效；k 的选择要写出依据。',
      targetNode: 'sample.profile',
      snippets: {
        python: `import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("${csvName}")
X = StandardScaler().fit_transform(df[["Q3", "Q4", "Q5", "Q6", "Q7"]])
for k in range(2, 7):
    labels = KMeans(n_clusters=k, n_init=20, random_state=42).fit_predict(X)
    print(f"k = {k}: silhouette = {silhouette_score(X, labels):.3f}")

k = 3  # 按上面的轮廓系数和解释性选择
base = KMeans(n_clusters=k, n_init=30, random_state=42).fit(X)
rng = np.random.default_rng(42)
aris = []
for _ in range(100):
    idx = rng.choice(len(X), size=len(X), replace=True)
    boot = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X[idx])
    aris.append(adjusted_rand_score(base.labels_[idx], boot.labels_))
print(f"bootstrap ARI = {np.mean(aris):.3f} (SD {np.std(aris):.3f})")`,
        r: `library(cluster)
df <- read.csv("${csvName}")
X <- scale(df[, c("Q3", "Q4", "Q5", "Q6", "Q7")])
set.seed(42)
for (k in 2:6) {
  km <- kmeans(X, centers = k, nstart = 25)
  cat(sprintf("k = %d: silhouette = %.3f\\n", k, summary(silhouette(km$cluster, dist(X)))$avg.width))
}`,
        spss: `* 先把 Q3–Q7 标准化为 ZQ3–ZQ7.
QUICK CLUSTER ZQ3 ZQ4 ZQ5 ZQ6 ZQ7
  /MISSING = LISTWISE
  /CRITERIA = CLUSTER(3) MXITER(50)
  /SAVE CLUSTER(cluster_k3)
  /PRINT INITIAL ANOVA CLUSTER.`,
        latex: booktabs('各类受访者在五个方面上的标准化中心', `tab:${bp.slug}-clusters`, find('cluster'), ['类别', '人数', d3.short, d4.short, d5.short, d6.short, d7.short]),
      },
    },
    {
      id: 'regression',
      title: `05 ${bp.conversionConstruct}的影响因素：多元回归`,
      badge: '关联建模',
      summary: `以五个方面、${bp.mechanismConstruct}和${bp.overallSatConstruct}预测${bp.conversionConstruct}，报告系数、置信区间与共线性诊断。`,
      auditUpgrade: '横截面回归只说明控制其他变量后的关联，不写成“导致”；同时报告 VIF 和异方差检验，必要时用稳健标准误。',
      targetNode: 'drivers.model',
      snippets: {
        python: `import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor

df = pd.read_csv("${csvName}")
X = sm.add_constant(df[["Q3", "Q4", "Q5", "Q6", "Q7", "Q9", "Q10"]])
model = sm.OLS(df["Q11"], X).fit(cov_type="HC3")  # 稳健标准误
print(model.summary())
print({c: round(variance_inflation_factor(X.values, i), 2) for i, c in enumerate(X.columns) if c != "const"})`,
        r: `df <- read.csv("${csvName}")
fit <- lm(Q11 ~ Q3 + Q4 + Q5 + Q6 + Q7 + Q9 + Q10, data = df)
summary(fit)
car::vif(fit)
lmtest::bptest(fit)`,
        spss: `REGRESSION
  /STATISTICS COEFF OUTS CI(95) R ANOVA COLLIN TOL
  /DEPENDENT Q11
  /METHOD = ENTER Q3 Q4 Q5 Q6 Q7 Q9 Q10.`,
        latex: booktabs(`${bp.conversionConstruct}影响因素的回归估计结果`, `tab:${bp.slug}-regression`, find('regression'), ['变量', '非标准化系数 B', '标准误', '标准化系数 β', 't', 'p', 'VIF']),
      },
    },
  ];

  const q = query.toLowerCase();
  let activeRecipeId = recipes[0].id;
  if (/ipa|痛点|象限|权重/u.test(q)) activeRecipeId = 'implicit-ipa';
  else if (/抽样|样本量|deff|cochran|清洗|质控/u.test(q)) activeRecipeId = 'sampling-size';
  else if (/聚类|分群|kmeans|轮廓/u.test(q)) activeRecipeId = 'kmeans-silhouette';
  else if (/回归|regression|影响因素/u.test(q)) activeRecipeId = 'regression';

  let activeLang: CodeStudioLang = 'python';
  if (/\br语言|\br\b|tidyverse/u.test(q)) activeLang = 'r';
  else if (/spss/u.test(q)) activeLang = 'spss';
  else if (/latex|三线表|booktabs/u.test(q)) activeLang = 'latex';

  return { activeRecipeId, activeLang, recipes };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3. Writing studio (`/撰稿`)
 * ────────────────────────────────────────────────────────────────────────── */

export type WritingTemplateSpec = {
  id: string;
  title: string;
  nodeId: string;
  nodeLabel: string;
  stageBadge: string;
  defaultDraft: string;
  checklist: string[];
};

export type WritingStudioFact = {
  id: string;
  token: string;
  label: string;
  value: string;
  origin: string;
};

export type WritingStudioCardData = {
  activeTemplateId: string;
  templates: WritingTemplateSpec[];
  /** The registered results' numbers, each with the statement it belongs to; empty until a result is registered. */
  facts: WritingStudioFact[];
};

export type WritingAuditReport = {
  score: number;
  wordCount: number;
  factMentions: number;
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
};

export function auditWritingDraft(text: string): WritingAuditReport {
  const clean = text.trim();
  const wordCount = clean.length;
  const numMatches = clean.match(/\d+(?:\.\d+)?%?/gu) ?? [];
  const hasStats = /(?:χ²|卡方|t\s*[=(]|F\s*[=(]|ρ\s*=|p\s*[<=>]|α\s*=|n\s*=|OR\s*=|有效样本)/iu.test(clean);
  const blanks = (clean.match(/【[^】]{1,24}】/gu) ?? []).length;
  const causalOverclaim = /相关|关联/u.test(clean) && /导致|决定了|必然引起/u.test(clean);
  const hasActor = /主办方|运营方|部门|政府|街道|社区|学校|学院|平台|企业|中心|协会|委员会/u.test(clean);
  const hasMeasure = /指标|评估|考核|复盘|跟踪|监测/u.test(clean);
  const hasBoundary = /局限|边界|外推|便利样本|非概率|意愿不等于|教学模拟/u.test(clean);
  const hasCliche = /众所周知|不言而喻|毫无疑问|填补了国内空白/u.test(clean);

  const checks = [
    {
      id: 'evidence',
      label: '数字来自登记结果',
      passed: blanks === 0 && numMatches.length >= 2 && hasStats,
      detail: blanks
        ? `还有 ${blanks} 处【】待填：从右侧事实胶囊注入已登记结果，不要手填。`
        : numMatches.length >= 2 && hasStats
          ? `已写入 ${numMatches.length} 处数字和检验量；请确认每个数字都来自已登记结果。`
          : '需写入样本量、比例或检验统计量，并且都来自已登记结果。',
    },
    {
      id: 'causal',
      label: '相关与因果措辞克制',
      passed: !causalOverclaim,
      detail: causalOverclaim ? '相关表述旁出现了“导致/决定了”等因果词，改为“与……相关/伴随”。' : '关联与因果的边界表述得当。',
    },
    {
      id: 'academic',
      label: '去套话',
      passed: !hasCliche && wordCount >= 80,
      detail: hasCliche ? '含“众所周知/填补空白”等空泛套话，直接用结果说话。' : `语体稳健（当前 ${wordCount} 字）。`,
    },
    {
      id: 'action-boundary',
      label: '执行主体、评估指标或适用边界',
      passed: (hasActor && hasMeasure) || hasBoundary,
      detail: (hasActor && hasMeasure) || hasBoundary ? '已写明执行主体与评估指标，或交代了适用边界。' : '补上由谁执行、用什么指标评估，或交代结论的适用边界。',
    },
  ];

  const passedCount = checks.filter(c => c.passed).length;
  return { score: Math.round((passedCount / checks.length) * 100), wordCount, factMentions: numMatches.length, checks };
}

export function buildWritingStudioCardData(ctx: RouterContext, query = ''): WritingStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const [d3, d4, d5, d6, d7] = bp.dimensions;
  const held = ctx.results;
  const facts: WritingStudioFact[] = held && held.results.length
    ? draftFacts(held, 'conclusion.findings').slice(0, 16).map(f => ({ id: f.id, token: f.text, label: f.text.replace(/^「([^」]+)」.*$/u, '$1').slice(0, 18), value: f.value, origin: '已登记结果' }))
    : [];
  const aspects = [d3, d4, d5, d6, d7].map(d => d.short).join('、');

  const templates: WritingTemplateSpec[] = [
    {
      id: 'abstract',
      title: `01 摘要：问题、方法、发现、建议`,
      nodeId: 'abstract',
      nodeLabel: '摘要',
      stageBadge: '结构化摘要',
      defaultDraft: `针对${bp.shortTitle}中${bp.groupA}与${bp.groupB}在参与方式、服务体验与持续使用意愿上的差异，本文以问卷调查收集数据（【样本来源与抽样方式】），有效样本【有效样本量】份。首先，以列联表卡方检验比较两类人群的${bp.statusConstruct}（【χ²、自由度、p 值与 Cramér’s V】）；其次，以信度检验与均值比较评价${aspects}五个方面（【α 系数与主要差异】）；随后，以重要性—表现分析定位需要优先改进的方面（【处于重点改进象限的方面】）；最后，以回归与秩相关考察${bp.overallSatConstruct}、${bp.mechanismConstruct}与${bp.conversionConstruct}的关联（【主要系数】），据此提出【对策要点】。\n关键词：${bp.keywords.join('；')}`,
      checklist: ['第一句点明研究问题', '方法与发现按“首先—其次—随后—最后”展开', '每个【】都换成已登记结果中的数字', '末行列出五到七个关键词'],
    },
    {
      id: 'sampling-qc',
      title: '02 抽样设计与数据清洗',
      nodeId: 'design.sampling',
      nodeLabel: '抽样设计',
      stageBadge: '抽样与质控',
      defaultDraft: `本研究以${bp.region}的${bp.groupA}与${bp.groupB}为调查对象，采用【抽样方式】获取样本。【若有抽样框：写明抽样框来源、各阶段抽样单位与样本量计算参数；若为便利样本：写明招募方式，并说明结论不外推到总体】。问卷回收后按注意力题、直线作答与重复提交三条规则筛查：回收【回收份数】份，剔除【剔除份数】份，有效【有效份数】份，有效率【有效率】；重复提交的答卷【处理方式】。`,
      checklist: ['抽样方式与实际做法一致，便利样本不借用概率抽样的名称', '样本量计算写明参数来源', '清洗规则、剔除数与有效率逐项交代', '交代结论的适用边界'],
    },
    {
      id: 'empirical',
      title: '03 结果解读：检验、效应量、含义',
      nodeId: 'compare.tests',
      nodeLabel: '差异检验与相关分析',
      stageBadge: '实证读数',
      defaultDraft: `${bp.groupConstruct}与${bp.statusConstruct}均为无序分类变量，故采用 Pearson 卡方检验并以 Cramér’s V 衡量关联强度。结果显示【χ²(自由度) = 数值，p 值，Cramér’s V = 数值】：${bp.groupA}中“${bp.statusCategories[0]}”的比例为【比例】，${bp.groupB}为【比例】。【若检验不显著：写“现有样本不足以表明二者存在关联”，不写“没有差异”】。这一结果【对决策的含义】，但横截面数据只反映分布上的关联，不能据此推断因果。`,
      checklist: ['写明为什么选这个检验', '统计量、自由度、p 值与效应量一起报告', '不显著时不写成“没有差异”', '交代关联不等于因果'],
    },
    {
      id: 'suggestions',
      title: '04 对策建议：主体、做法、指标',
      nodeId: 'conclusion.suggestions',
      nodeLabel: '对策建议',
      stageBadge: '对策落地',
      defaultDraft: `针对【重点改进象限中的方面】，建议【执行主体】【具体做法】，以【评估指标】跟踪效果。\n针对【第二项发现】，建议【执行主体】【具体做法】，以【评估指标】跟踪效果。\n针对【第三项发现】，建议【执行主体】【具体做法】，以【评估指标】跟踪效果。\n以上建议基于【数据性质与样本范围】，推广前应先在小范围试行。`,
      checklist: ['每条建议对应一项实证发现', '写明执行主体与具体做法', '评估指标写名称，不预设没有依据的目标值', '交代建议的适用范围'],
    },
    {
      id: 'defense',
      title: '05 答辩：评委常问的三个问题',
      nodeId: 'conclusion.limits',
      nodeLabel: '研究局限',
      stageBadge: '答辩准备',
      defaultDraft: `【问】样本能代表总体吗？\n【答】本研究的样本来自【抽样方式】，【有效样本量】份。【若为便利样本：坦白说明不代表总体，结论只适用于样本覆盖的人群；若为概率样本：说明抽样框与权重】。\n\n【问】为什么用这个方法？\n【答】【变量类型】决定了【方法】；我们同时报告了【效应量或稳健性检查】。\n\n【问】你们的建议有依据吗？\n【答】每条建议都对应【具体图表或检验结果】，并写明了执行主体和评估指标。`,
      checklist: ['如实回答样本的代表性', '方法选择说得出理由', '建议能指回具体结果'],
    },
  ];

  const q = query.toLowerCase();
  let activeTemplateId = templates[0].id;
  if (/抽样|质控|清洗/u.test(q)) activeTemplateId = 'sampling-qc';
  else if (/实证|卡方|检验|读数/u.test(q)) activeTemplateId = 'empirical';
  else if (/对策|建议/u.test(q)) activeTemplateId = 'suggestions';
  else if (/答辩|路演|局限|评委/u.test(q)) activeTemplateId = 'defense';

  return { activeTemplateId, templates, facts };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 4. Turns: the teaching demo (`/铸造`, `/国奖`), `/备赛`, `/绘图`, `/编程`, `/撰稿`
 * ────────────────────────────────────────────────────────────────────────── */

export function buildDemoTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const roomSummaryLines: Line[] = LIT_ROOMS.map(id => {
    const rl = roomLight(ctx.light, id);
    const sc = rl?.score ?? 0;
    return [
      t(id === 'design' ? '01 问卷映射' : id === 'sampling' ? '02 抽样与质控' : id === 'analysis' ? '03 统计分析' : '04 报告', 'strong'),
      t(lightBar(sc), sc >= 0.999 ? 'gold' : sc > 0 ? 'teal' : 'dim'),
      t(percent(sc), sc >= 0.999 ? 'gold' : 'dim'),
      t(rl?.summary ?? '待接入', 'dim'),
    ];
  });

  const cards: AgentCard[] = [
    {
      kind: 'tool',
      title: `选题结构 · 《${bp.title}》`,
      columns: true,
      lines: [
        [t('群际分组', 'dim'), t(`${bp.groupA} / ${bp.groupB}`, 'gold')],
        [t(bp.statusConstruct, 'dim'), t(bp.statusCategories.join(' / '), 'gold')],
        [t('核心维度', 'dim'), t(bp.dimensions.map(d => d.short).join(' · '), 'gold')],
        [t('结果变量', 'dim'), t(`${bp.overallSatConstruct} · ${bp.conversionConstruct}`, 'gold')],
      ],
      links: [
        say('换一个题目：社区助餐', '/铸造 城市社区助餐服务的使用体验、满意度与持续使用意愿调查'),
        say('换一个题目：大学生 AI 学习工具', '/铸造 大学生使用 AI 学习工具的体验、规范认知与持续使用意愿调查'),
        say('换一个题目：城市文体活动', '/铸造 城市文体活动的现场体验、满意度与重游意愿调查'),
      ],
    },
    {
      kind: 'confirm',
      title: `按《${bp.shortTitle}》生成一套教学模拟研究`,
      lines: [
        [
          t('将生成：按选题设计的 20 题多因子问卷与模拟作答（含少量会被质量筛查剔除的答卷），由分析引擎在清洗后的数据上'),
          t('实际计算', 'strong'),
          t('效度与信度（EFA / α）、列联表卡方、相关、多元回归、K-means 分群与 IPA 诊断，登记结果并自动装配十一类定量图表、结构化报告初稿、参考文献与四项可复现附录。全部标注'),
          t('教学模拟数据', 'gold'),
          t('；可在生成后直接查看论文与演示稿，或用全报告流水线逐章改写。会替换当前工作区内容。'),
        ],
      ],
      confirm: {
        label: `生成《${bp.shortTitle}》教学模拟研究`,
        action: { type: 'loadBenchmark', benchmarkId: bp.title },
        primary: true,
      },
      cancel: '先不替换当前工作区',
    },
    {
      kind: 'tool',
      title: `当前工作区证据完整度（总照度 ${percent(ctx.light.overall)}）`,
      columns: true,
      lines: roomSummaryLines,
    },
  ];

  return {
    lines: [
      [
        t('教学模拟研究：'),
        t(`《${bp.title}》`, 'strong'),
        t('。问卷与作答都是为演示平台全流程生成的，报告里的每个数字都由分析引擎在模拟数据上算出，不取自任何真实报告。'),
      ],
    ],
    cards,
    chips: [
      recommend(say('按当前选题看图表', `/绘图 ${bp.shortTitle}`)),
      say('按当前选题看代码', `/编程 ${bp.shortTitle}`),
      say('按当前选题看写作模板', `/撰稿 ${bp.shortTitle}`),
      say('/备赛'),
    ],
  };
}

export function buildCoachTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const dScore = roomLight(ctx.light, 'design')?.score ?? 0;
  const sScore = roomLight(ctx.light, 'sampling')?.score ?? 0;
  const aScore = roomLight(ctx.light, 'analysis')?.score ?? 0;
  const eScore = roomLight(ctx.light, 'editor')?.score ?? 0;

  const stages: Array<{ code: string; name: string; done: boolean; standard: string; cmd: string }> = [
    { code: 'Stage 01', name: '立题', done: dScore >= 0.5, standard: '从现实问题出发，写清研究问题、决策用途与可检验的问题', cmd: '/选题' },
    { code: 'Stage 02', name: '问卷', done: dScore >= 0.999, standard: '每题对应构念与分析方法，量表方向一致，设置注意力检查题', cmd: '/问卷' },
    { code: 'Stage 03', name: '抽样与预调查', done: sScore >= 0.66, standard: '样本量公式写明参数来源；有抽样框才谈设计效应；预调查校准题项', cmd: '/抽样' },
    { code: 'Stage 04', name: '回收与清洗', done: sScore >= 0.999 && aScore >= 0.33, standard: '按注意力题、作答时长、直线作答与重复提交筛查，逐项报告剔除数与有效率', cmd: '/数据' },
    { code: 'Stage 05', name: '统计分析', done: aScore >= 0.66, standard: '描述 → 信度 → 差异检验（名义变量用卡方）→ 关联与回归 → 分群，每步报告效应量', cmd: '/编程' },
    { code: 'Stage 06', name: '图表', done: eScore >= 0.6 && (ctx.results?.placed.length ?? 0) >= 2, standard: '一图一结论，标注样本口径与来源，正文引用并解读', cmd: '/绘图' },
    { code: 'Stage 07', name: '撰稿', done: aScore >= 0.999 && eScore >= 0.9, standard: '先结论后证据，数字来自登记结果，对策对应发现并写明执行主体与评估指标', cmd: '/撰稿' },
    { code: 'Stage 08', name: '答辩', done: eScore >= 0.999, standard: '路演页与报告一致，预先准备样本代表性、方法选择与建议依据三类追问', cmd: '/答辩' },
  ];

  const firstPending = stages.find(s => !s.done) ?? stages[stages.length - 1];
  const doneCount = stages.filter(s => s.done).length;

  return {
    lines: [
      [
        t(`备赛路线（当前选题：《${bp.shortTitle}》）· 已完成 `),
        t(`${doneCount} / 8`, 'gold'),
        t(' 个阶段（总照度 '),
        t(percent(ctx.light.overall), 'gold'),
        t('）。下一步：'),
        t(`${firstPending.code} ${firstPending.name}`, 'strong'),
        t('。'),
      ],
    ],
    cards: [
      {
        kind: 'tool',
        title: `正大杯备赛八个阶段（当前选题：《${bp.shortTitle}》）`,
        columns: true,
        lines: stages.map(s => [
          t(s.done ? '● 已完成' : '○ 待推进', s.done ? 'gold' : 'teal'),
          t(`${s.code} ${s.name}`, 'strong'),
          t(s.cmd, 'teal'),
          t(s.standard, 'dim'),
        ]),
        links: [
          recommend(say(`下一步：${firstPending.name}`, firstPending.cmd)),
          say('生成教学模拟研究', '/铸造'),
          say('打开图表工坊', '/绘图'),
          say('打开代码工坊', '/编程'),
          say('打开撰稿工坊', '/撰稿'),
        ],
      },
    ],
    chips: [recommend(say('/铸造')), say('/绘图'), say('/编程'), say('/撰稿'), say('/印鉴')],
  };
}

export function buildChartStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildChartStudioCardData(ctx, query);
  return {
    lines: [
      studio.datasets.length
        ? [t('已打开'), t('图表工坊', 'strong'), t(`：${studio.datasets.length} 项已登记结果可画成图，可切换图型与配色、编辑标签，导出 SVG 或写入报告。`)]
        : [t('图表工坊里还没有可画的结果：先在数据分析里运行并登记结果，或用 '), t('/铸造', 'teal'), t(' 生成一套教学模拟研究。')],
    ],
    cards: [{ kind: 'chart-studio', title: `图表工坊 · 《${bp.shortTitle}》`, studio }],
    chips: [recommend(say('打开代码工坊', `/编程 ${bp.shortTitle}`)), say('打开撰稿工坊', `/撰稿 ${bp.shortTitle}`), say('/铸造')],
  };
}

export function buildCodeStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildCodeStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已打开'),
        t('代码工坊', 'strong'),
        t('：五项分析的 '),
        t('Python / R / SPSS', 'teal'),
        t(' 脚本都从数据文件计算；LaTeX 三线表取自已登记结果，没有结果时只给出表格骨架。'),
      ],
    ],
    cards: [{ kind: 'code-studio', title: `代码工坊 · 《${bp.shortTitle}》`, studio }],
    chips: [recommend(say('打开撰稿工坊', `/撰稿 ${bp.shortTitle}`)), say('打开图表工坊', `/绘图 ${bp.shortTitle}`), say('/铸造')],
  };
}

export function buildWritingStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildWritingStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已打开'),
        t('撰稿工坊', 'strong'),
        t('：五个章节模板，【】处由你填写；'),
        t(studio.facts.length ? `${studio.facts.length} 条已登记结果` : '登记结果后', 'gold'),
        t(studio.facts.length ? '可一键注入，' : '可一键注入事实，'),
        t('写完做一次合规体检（数字来源、因果措辞、套话、执行主体与边界）。'),
      ],
    ],
    cards: [{ kind: 'writing-studio', title: `撰稿工坊 · 《${bp.shortTitle}》`, studio }],
    chips: [recommend(say('查看报告进度', '/写报告')), say('打开图表工坊', `/绘图 ${bp.shortTitle}`), say('打开代码工坊', `/编程 ${bp.shortTitle}`), say('/铸造')],
  };
}
