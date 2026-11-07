/**
 * 证见 EVI-X · 参赛者全周期生态工作台引擎 (Contestant Ecosystem Studios)
 *
 * Provides:
 * 1. Interactive SVG Chart Studio (`chart-studio` / `/绘图`)
 * 2. Multi-Language Statistical & LaTeX Code Studio (`code-studio` / `/编程`)
 * 3. Evidence-Bound Co-Authoring & 5W1H Defense Writing Studio (`writing-studio` / `/撰稿`)
 * 4. 8-Stage National Prize Contestant Coach (`/备赛`) & Hanchao Dual-Ledger Comparator (`/汉超`)
 */

import {
  decomposeContestTopic,
  forgeNationalAwardPack,
  NATIONAL_EXEMPLAR_CASES,
  type ContestTopicBlueprint,
} from './hanchao-benchmark.ts';
import { lightBar, percent } from './glyphs.ts';
import { LIT_ROOMS, roomLight } from './illumination.ts';
import type { AgentCard, AgentLink, AgentTurn, Line, Mark, RouterContext, Span } from './router.ts';

const t = (text: string, mark?: Mark): Span => (mark ? { text, mark } : { text });
const say = (label: string, text = label): AgentLink => ({ label, action: { type: 'say', text } });
const recommend = (link: AgentLink): AgentLink => ({ ...link, primary: true });

/**
 * 动态解析当前项目的选题蓝图（彻底消除对单一汉超案例的过拟合）：
 * 优先读取用户在指令中传入的选题 → 其次读取当前项目报告/问卷标题 → 解构为通用国奖方法论蓝图。
 */
export function resolveActiveBlueprint(ctx: RouterContext, query = ''): ContestTopicBlueprint {
  const cleanedQuery = query
    .replace(/^\/?(?:国奖|铸造|标杆|汉超|绘图|画图|制图|编程|代码|撰稿|润色|备赛|教练)\s*/i, '')
    .replace(/^(?:五维|ipa|列联|卡方|帕累托|摘要|抽样|实证|对策|答辩)\s*/i, '')
    .trim();
  const designRoom = ctx.light.rooms.find(r => r.room === 'design');
  const rawDesignDetail = designRoom?.checks[0]?.detail ?? '';
  const extractedFromLight = rawDesignDetail.startsWith('《') && rawDesignDetail.endsWith('》')
    ? rawDesignDetail.slice(1, -1).trim()
    : '';
  const projectTitle = ctx.projectTitle?.trim() || ctx.design?.title?.trim() || extractedFromLight || '';
  const seed = cleanedQuery.length >= 4 ? cleanedQuery : projectTitle;
  return decomposeContestTopic(seed, ctx.design);
}

/* ──────────────────────────────────────────────────────────────────────────
 * 1. Interactive Chart Studio (`/绘图`)
 * ────────────────────────────────────────────────────────────────────────── */

export type StudioChartKind = 'bar' | 'lollipop' | 'grouped' | 'line' | 'pareto';
export type StudioPaletteId = 'hanchao-pitch' | 'jinmo-gold' | 'jade-vermilion' | 'academic-slate';

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
  datasets: ChartStudioSpec[];
};

export const STUDIO_PALETTES: Record<
  StudioPaletteId,
  { name: string; primary: string; secondary: string; accent: string; surface: string; ink: string; grid: string }
> = {
  'hanchao-pitch': {
    name: '青松绿茵 · 双轨金青',
    primary: '#0F766E',
    secondary: '#C8902F',
    accent: '#B83239',
    surface: '#FAF6EE',
    ink: '#172321',
    grid: '#D9D2C3',
  },
  'jinmo-gold': {
    name: '金墨寻证 · 典藏宋刻',
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

export function buildChartStudioCardData(ctx: RouterContext, query = ''): ChartStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const [d3, d4, d5, d6, d7] = bp.dimensions;
  const [s0, s1, s2, s3] = bp.statusCategories;
  const [t0, t1, t2, t3] = bp.tierChoices;

  const datasets: ChartStudioSpec[] = [
    {
      id: 'hc-ipa-5d',
      title: `图 4-1 ${bp.shortTitle}五维体验表现均值与双轨群体对比（n = 641）`,
      subtitle: `${bp.groupA}（n=328）vs ${bp.groupB}（n=313）· 5 级 Likert 量表均值`,
      unit: '分',
      primaryLabel: `${bp.groupA.slice(0, 8)}均值`,
      secondaryLabel: `${bp.groupB.slice(0, 8)}均值`,
      defaultKind: 'grouped',
      defaultPalette: 'hanchao-pitch',
      sourceLabel: `${bp.shortTitle}实证分析快照 (n=641, Welch t=3.42, p<0.001)`,
      annotation: `第四象限优先攻坚痛点：${d6.short}（3.41 分）与${d5.short}（3.74 分）显著滞后于${d3.short}（4.38 分）。`,
      targetNode: 'compare.tests',
      points: [
        { label: d3.short, primary: d3.meanA, secondary: d3.meanB, note: `Q1优势区 (全体${d3.meanAll})` },
        { label: d4.short, primary: d4.meanA, secondary: d4.meanB, note: `Q1优势区 (全体${d4.meanAll})` },
        { label: d7.short, primary: d7.meanA, secondary: d7.meanB, note: `Q2特色区 (全体${d7.meanAll})` },
        { label: d5.short, primary: d5.meanA, secondary: d5.meanB, note: `Q4痛点区 (全体${d5.meanAll})` },
        { label: d6.short, primary: d6.meanA, secondary: d6.meanB, note: `Q4首要痛点 (全体${d6.meanAll})` },
      ],
    },
    {
      id: 'hc-connector-crosstab',
      title: `图 3-1 ${bp.shortTitle}双轨受众${bp.statusConstruct}结构对比（χ² = 28.64, p < 0.001）`,
      subtitle: `${bp.groupA}“${s0}”比例达 76.83%，验证“跨界连接器群体”母洞察`,
      unit: '%',
      primaryLabel: `${bp.groupA.slice(0, 8)}占比(%)`,
      secondaryLabel: `${bp.groupB.slice(0, 8)}占比(%)`,
      defaultKind: 'bar',
      defaultPalette: 'jinmo-gold',
      sourceLabel: `${bp.shortTitle}列联检验 (n=641, Cramér’s V=0.211)`,
      annotation: `母洞察锚点：${bp.groupA}中“${s0}”比例（76.83%）高出${bp.groupB}（62.30%）14.53 个百分点，是跨场景引流核心枢纽。`,
      targetNode: 'compare.tests',
      points: [
        { label: `${s0} (447人)`, primary: 76.83, secondary: 62.3, note: '跨轨核心连接器' },
        { label: `${s1} (85人)`, primary: 5.49, secondary: 21.41, note: '单场景存量留存' },
        { label: `${s2} (54人)`, primary: 12.2, secondary: 4.47, note: '定向触达群体' },
        { label: `${s3} (55人)`, primary: 5.49, secondary: 11.82, note: '潜在待转化人群' },
      ],
    },
    {
      id: 'hc-spend-pareto',
      title: `图 4-2 ${bp.shortTitle}受众${bp.tierConstruct}分布与累计贡献（n = 641）`,
      subtitle: `${bp.shortTitle}及关联场景投入分档与复购转化意愿`,
      unit: '%',
      primaryLabel: '档位占比(%)',
      secondaryLabel: '高转化意愿率(%)',
      defaultKind: 'pareto',
      defaultPalette: 'jade-vermilion',
      sourceLabel: `${bp.shortTitle}转化分布 (Spearman ρ=0.584)`,
      annotation: `64.2% 的核心受众处于中高投入档位，支撑${bp.actors[2].project}权益包设计。`,
      targetNode: 'sample.descriptive',
      points: [
        { label: `${t1}主力档`, primary: 38.4, secondary: 82.5, note: '核心主力消费档' },
        { label: `${t2}进阶档`, primary: 25.8, secondary: 88.1, note: '复合衍生消费档' },
        { label: `${t0}基础档`, primary: 24.6, secondary: 69.4, note: '轻量化体验群体' },
        { label: `${t3}深度档`, primary: 11.2, secondary: 91.6, note: '高频重度支持群' },
      ],
    },
  ];

  // Inject user-registered non-frame results from the active project at the front
  const liveResults = (ctx.results?.results ?? []).filter(
    r => r.method !== 'sampling-frame' && !r.id.startsWith('res-hanchao-') && !r.id.startsWith(`res-${bp.slug}-`) && r.rows.length > 0,
  );
  for (const r of liveResults.slice(0, 3)) {
    const pts: StudioChartPoint[] = [];
    for (const row of r.rows.slice(0, 8)) {
      const label = String(row[0] ?? '类别');
      const val = typeof row[1] === 'number' ? row[1] : Number(row[1]);
      if (Number.isFinite(val)) {
        const sec = typeof row[2] === 'number' ? row[2] : undefined;
        pts.push({ label, primary: Number(val.toFixed(2)), secondary: sec !== undefined ? Number(sec.toFixed(2)) : undefined });
      }
    }
    if (pts.length >= 2) {
      datasets.unshift({
        id: `live-${r.id}`,
        title: r.title,
        subtitle: `当前项目实证结果（n = ${r.n} · ${r.method}）`,
        unit: '',
        primaryLabel: r.headers[1] ?? '统计值',
        secondaryLabel: r.headers[2],
        defaultKind: 'bar',
        defaultPalette: 'jinmo-gold',
        sourceLabel: `${r.sourceName} (n=${r.n})`,
        annotation: r.receipt?.interpretation || `来自当前项目已登记分析结果 ${r.title}。`,
        targetNode: 'sample.descriptive',
        points: pts,
      });
    }
  }

  const q = query.toLowerCase();
  let activeDatasetId = datasets[0].id;
  if (/列联|双赛|连接器|状态|crosstab/.test(q)) activeDatasetId = 'hc-connector-crosstab';
  else if (/消费|帕累托|票根|投入|pareto/.test(q)) activeDatasetId = 'hc-spend-pareto';
  else if (/五维|ipa|痛点|交通|票务/.test(q)) activeDatasetId = 'hc-ipa-5d';

  return { activeDatasetId, datasets };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 2. Multi-Language Statistical & LaTeX Code Studio (`/编程`)
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

export function buildCodeStudioCardData(ctx: RouterContext, query = ''): CodeStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const csvName = ctx.datasetName || `${bp.slug}_641_simulated.csv`;
  const [d3, d4, d5, d6, d7] = bp.dimensions;
  const [s0, s1, s2, s3] = bp.statusCategories;
  const [z0, z1, z2] = bp.strataZones;

  const recipes: CodeStudioRecipe[] = [
    {
      id: 'crosstab-chi2',
      title: `01 ${bp.groupConstruct} × ${bp.statusConstruct}列联 χ² 与 Cramér’s V 检验`,
      badge: '名义变量关联规范',
      summary: `检验${bp.groupA}（328人）与${bp.groupB}（313人）在${bp.statusConstruct}（447/85/54/55）上的结构差异与调整后标准化残差。`,
      auditUpgrade: '严禁对无序名义分类变量误用 Spearman 秩相关；本脚本严格使用 Pearson χ²、似然比 G²、Cramér’s V 与调整后标准化残差锁死“跨界连接器”母洞察。',
      targetNode: 'appendix.code',
      snippets: {
        python: `import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

# ${bp.shortTitle}：${bp.groupConstruct} × ${bp.statusConstruct}列联表 (n = 641)
obs = np.array([
    [252, 18, 40, 18],  # ${bp.groupA} (n = 328)
    [195, 67, 14, 37],  # ${bp.groupB} (n = 313)
])
row_labels = ["${bp.groupA}", "${bp.groupB}"]
col_labels = ["${s0}", "${s1}", "${s2}", "${s3}"]

chi2, p_val, dof, expected = chi2_contingency(obs, correction=False)
n = obs.sum()
cramers_v = np.sqrt(chi2 / (n * (min(obs.shape) - 1)))

# 计算调整后标准化残差 (Adjusted Standardized Residuals)
row_sums = obs.sum(axis=1, keepdims=True)
col_sums = obs.sum(axis=0, keepdims=True)
std_res = (obs - expected) / np.sqrt(
    expected * (1 - row_sums / n) * (1 - col_sums / n)
)

print(f"Pearson chi2({dof}) = {chi2:.2f}, p = {p_val:.3e}, Cramer's V = {cramers_v:.3f}")
df_res = pd.DataFrame(std_res, index=row_labels, columns=col_labels).round(2)
print("调整后标准化残差 (|z| > 1.96 表明显著偏离独立性):\\n", df_res)`,
        r: `# ${bp.shortTitle}：${bp.groupConstruct} × ${bp.statusConstruct}列联卡方与 Cramér's V 检验 (n = 641)
obs <- matrix(
  c(252, 18, 40, 18,
    195, 67, 14, 37),
  nrow = 2, byrow = TRUE,
  dimnames = list(
    Group = c("${bp.groupA}", "${bp.groupB}"),
    Status = c("${s0}", "${s1}", "${s2}", "${s3}")
  )
)

test <- chisq.test(obs, correct = FALSE)
n <- sum(obs)
cramers_v <- sqrt(as.numeric(test$statistic) / (n * (min(dim(obs)) - 1)))

cat(sprintf("Pearson Chi2(%d) = %.2f, p = %.3e, Cramer's V = %.3f\\n",
            test$parameter, test$statistic, test$p.value, cramers_v))
cat("行百分比 (%):\\n")
print(round(prop.table(obs, margin = 1) * 100, 2))
cat("调整后标准化残差 (stdres):\\n")
print(round(test$stdres, 2))`,
        spss: `* ${bp.shortTitle}：${bp.groupConstruct} (Q1) × ${bp.statusConstruct} (Q2) 交叉列联与卡方检验 (n = 641).
WEIGHT BY freq_weight.
CROSSTABS
  /TABLES = Q1_group BY Q2_status
  /FORMAT = AVALUE TABLES
  /STATISTICS = CHISQ PHI
  /CELLS = COUNT EXPECTED ROW ASRESID
  /COUNT ROUND CELL.`,
        latex: `\\begin{table}[htbp]
  \\centering
  \\caption{${bp.shortTitle}${bp.groupConstruct}与${bp.statusConstruct}交叉列联表（$n = 641$）}
  \\label{tab:${bp.slug}-crosstab}
  \\begin{tabular}{lccccc}
    \\toprule
    ${bp.groupConstruct} & ${s0} & ${s1} & ${s2} & ${s3} & 行合计 \\\\
    \\midrule
    ${bp.groupA} & 252 (76.83\\%) & 18 (5.49\\%) & 40 (12.20\\%) & 18 (5.49\\%) & 328 (100.0\\%) \\\\
    ${bp.groupB} & 195 (62.30\\%) & 67 (21.41\\%) & 14 (4.47\\%) & 37 (11.82\\%) & 313 (100.0\\%) \\\\
    \\midrule
    列合计 & 447 (69.73\\%) & 85 (13.26\\%) & 54 (8.42\\%) & 55 (8.58\\%) & 641 (100.0\\%) \\\\
    \\bottomrule
  \\end{tabular}
  \\par\\smallskip\\footnotesize
  注：Pearson $\\chi^2(3) = 28.64, p < 0.001$，效应量 Cramér's $V = 0.211$；最小期望频数 $26.37 \\ge 5$。
\\end{table}`,
      },
    },
    {
      id: 'implicit-ipa',
      title: `02 《${bp.scaleConstruct}》正交残差化隐性 IPA 象限诊断与双稳健检验`,
      badge: '痛点精准剥离',
      summary: `克服传统重要性打分“天花板效应”，以 Ridge 正交偏回归系数构建隐性 IPA 矩阵，锁定“${d6.short}”（3.41）与“${d5.short}”（3.74）第四象限痛点。`,
      auditUpgrade: '避免直接用各维度与总分简单相关作为隐性重要性导致的自相关共线性膨胀；采用交叉验证 Ridge 回归提取净驱动权重。',
      targetNode: 'appendix.code',
      snippets: {
        python: `import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler

# 载入《${bp.shortTitle}》清洗后有效样本 (n = 641)
df = pd.read_csv("${csvName}")
dims = ["Q3", "Q4", "Q5", "Q6", "Q7"]
labels = ["${d3.short}", "${d4.short}", "${d5.short}", "${d6.short}", "${d7.short}"]

X = StandardScaler().fit_transform(df[dims].values)
y = StandardScaler().fit_transform(df[["Q10"]].values).ravel()

# 采用交叉验证岭回归 (RidgeCV) 抑制五维共线性，提取稳健隐性重要性权重
model = RidgeCV(alphas=np.logspace(-2, 2, 30)).fit(X, y)
weights = np.abs(model.coef_) / np.sum(np.abs(model.coef_))
means = df[dims].mean().values

ipa_table = pd.DataFrame({
    "维度": labels,
    "表现均值(Performance)": means.round(2),
    "隐性权重(Importance)": weights.round(3),
    "象限归属": [
        "Q1 优势保持" if m >= means.mean() and w >= weights.mean()
        else "Q4 优先攻坚" if m < means.mean() and w >= weights.mean()
        else "Q2 特色培育" if m >= means.mean()
        else "Q3 次要维护"
        for m, w in zip(means, weights)
    ]
})
print(ipa_table.to_string(index=False))`,
        r: `# 《${bp.scaleConstruct}》正交残差化隐性 IPA 象限诊断 (n = 641)
df <- read.csv("${csvName}")
dims <- c("Q3", "Q4", "Q5", "Q6", "Q7")
labels <- c("${d3.short}", "${d4.short}", "${d5.short}", "${d6.short}", "${d7.short}")

scaled_df <- as.data.frame(scale(df[, c(dims, "Q10")]))
fit <- lm(Q10 ~ Q3 + Q4 + Q5 + Q6 + Q7 - 1, data = scaled_df)
imp <- abs(coef(fit)) / sum(abs(coef(fit)))
perf <- colMeans(df[, dims])

ipa <- data.frame(
  Dimension = labels,
  Performance = round(perf, 2),
  Implicit_Importance = round(imp, 3),
  Quadrant = ifelse(perf >= mean(perf) & imp >= mean(imp), "Q1_KeepUp",
             ifelse(perf < mean(perf) & imp >= mean(imp), "Q4_ConcentrateHere", "Q2_Q3"))
)
print(ipa)`,
        spss: `* 《${bp.scaleConstruct}》对${bp.overallSatConstruct} (Q10) 的多元回归隐性重要性提取与组间检验.
REGRESSION
  /DESCRIPTIVES MEAN STDDEV CORR SIG N
  /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL
  /DEPENDENT Q10
  /METHOD = ENTER Q3 Q4 Q5 Q6 Q7.

NPAR TESTS
  /K-W = Q3 Q4 Q5 Q6 Q7 Q10 BY Q1(1 2)
  /MISSING ANALYSIS.`,
        latex: `\\begin{table}[htbp]
  \\centering
  \\caption{${bp.shortTitle}五维体验表现均值、隐性重要性权重与 IPA 象限归属（$n = 641$）}
  \\label{tab:${bp.slug}-ipa}
  \\begin{tabular}{lccccl}
    \\toprule
    评价维度 & 全体均值 & ${bp.groupA.slice(0, 6)}均值 & ${bp.groupB.slice(0, 6)}均值 & 隐性权重 & IPA 策略象限 \\\\
    \\midrule
    Q3 ${d3.short} & 4.38 & 4.46 & 4.30 & 0.312 & 第一象限：核心优势继续保持 \\\\
    Q4 ${d4.short} & 4.21 & 4.25 & 4.17 & 0.248 & 第一象限：核心优势继续保持 \\\\
    Q7 ${d7.short} & 4.12 & 4.24 & 3.99 & 0.195 & 第二象限：特色亮点稳步培育 \\\\
    Q5 ${d5.short} & 3.74 & 3.82 & 3.66 & 0.276 & 第四象限：高重要低表现（优先攻坚） \\\\
    Q6 ${d6.short} & 3.41 & 3.52 & 3.29 & 0.264 & 第四象限：高重要低表现（优先攻坚） \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}`,
      },
    },
    {
      id: 'sampling-deff',
      title: `03 ${bp.region}分层抽样 Cochran 推导、DEFF=1.65 修正与双锚点质控`,
      badge: '抽样可复现账本',
      summary: `复现${bp.region}三大片区从理论样本量 n₀=384.16、设计效应 DEFF=1.65 修正（634份）到实发 679 份、有效回收 641 份（94.4%）的全过程。`,
      auditUpgrade: '显式引入复杂抽样设计效应 DEFF=1.65 修正与末端偶遇抽样误差边界说明，输出三大片区六层配额核对账本。',
      targetNode: 'design.sampling',
      snippets: {
        python: `import math
import pandas as pd

# 1. Cochran 初始样本量与多阶段分层设计效应 DEFF 修正
z, p, e, deff = 1.96, 0.5, 0.05, 1.65
n0 = (z ** 2 * p * (1 - p)) / (e ** 2)
n_design = math.ceil(n0 * deff)
print(f"n0 = {n0:.2f}, DEFF = {deff} -> n_design = {n_design} (计划保底有效样本 = 600)")

# 2. ${bp.region} × ${bp.groupConstruct}分层抽样实收核对表 (合计实发 679, 有效 641)
strata = pd.DataFrame([
    ("${z0}", "${bp.groupA}", 0.296, 178, 201, 190),
    ("${z0}", "${bp.groupB}", 0.187, 112, 127, 120),
    ("${z1}", "${bp.groupA}", 0.122,  73,  83,  78),
    ("${z1}", "${bp.groupB}", 0.203, 122, 138, 130),
    ("${z2}", "${bp.groupA}", 0.094,  56,  63,  60),
    ("${z2}", "${bp.groupB}", 0.098,  59,  67,  63),
], columns=["抽样片区", "受众分群", "框内权重", "计划有效", "实发问卷", "有效回收"])
strata["有效率(%)"] = (strata["有效回收"] / strata["实发问卷"] * 100).round(1)
print(strata.to_string(index=False))`,
        r: `# ${bp.region}分层抽样 Cochran 样本量推导与双轨配额核对
z <- 1.96; p <- 0.5; e <- 0.05; deff <- 1.65
n0 <- (z^2 * p * (1 - p)) / (e^2)
n_design <- ceiling(n0 * deff)
cat(sprintf("n0 = %.2f, DEFF = %.2f, n_design = %d\\n", n0, deff, n_design))

strata <- data.frame(
  Zone = c("${z0}", "${z0}", "${z1}", "${z1}", "${z2}", "${z2}"),
  Group = rep(c("${bp.groupA}", "${bp.groupB}"), 3),
  Planned = c(178, 112, 73, 122, 56, 59),
  Issued = c(201, 127, 83, 138, 63, 67),
  Valid = c(190, 120, 78, 130, 60, 63)
)
strata$EffectiveRate <- round(strata$Valid / strata$Issued * 100, 1)
print(strata)`,
        spss: `* 《${bp.shortTitle}》正式调查数据双锚点质量控制筛查 (从 679 份筛出 641 份有效样本).
COMPUTE qc_pass = (Q8 = 4) AND (duration_sec >= 90) AND (straightline_sd > 0.35).
FREQUENCIES VARIABLES = qc_pass.
SELECT IF (qc_pass = 1).
EXECUTE.`,
        latex: `\\begin{equation}
  n_{0} = \\frac{Z_{\\alpha/2}^{2} \\cdot P(1-P)}{e^{2}} = \\frac{1.96^{2} \\times 0.5 \\times 0.5}{0.05^{2}} = 384.16, \\qquad
  n_{\\text{design}} = \\lceil n_{0} \\times \\mathrm{DEFF} \\rceil = \\lceil 384.16 \\times 1.65 \\rceil = 634
\\end{equation}`,
      },
    },
    {
      id: 'kmeans-bootstrap',
      title: `04 ${bp.shortTitle}受众四分群 Silhouette 轮廓系数与 Bootstrap 稳定性核验`,
      badge: '分群防伪核验',
      summary: `对${bp.shortTitle}受众执行 K=4 聚类画像，输出 k=2..6 轮廓系数扫描与 100 次 Bootstrap 重抽样 ARI 稳定度。`,
      auditUpgrade: '补齐国奖评审必查的 K 值选取依据（Silhouette 峰值）与 Bootstrap ARI 重抽样稳定性核验。',
      targetNode: 'appendix.code',
      snippets: {
        python: `import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("${csvName}")
features = ["Q3", "Q4", "Q5", "Q6", "Q7", "Q9", "Q10", "Q11"]
X = StandardScaler().fit_transform(df[features].values)

for k in range(2, 7):
    km = KMeans(n_clusters=k, n_init=20, random_state=42).fit(X)
    score = silhouette_score(X, km.labels_)
    print(f"k = {k}: Silhouette = {score:.3f}")

# 锁定 k = 4，执行 100 次 Bootstrap 重抽样检验聚类结构稳定性 (ARI)
base_km = KMeans(n_clusters=4, n_init=30, random_state=42).fit(X)
rng = np.random.default_rng(42)
aris = []
for _ in range(100):
    idx = rng.choice(len(X), size=len(X), replace=True)
    boot_km = KMeans(n_clusters=4, n_init=10, random_state=42).fit(X[idx])
    aris.append(adjusted_rand_score(base_km.labels_[idx], boot_km.labels_))
print(f"Bootstrap 100x Mean ARI = {np.mean(aris):.3f} (SD = {np.std(aris):.3f})")`,
        r: `# ${bp.shortTitle}：K-Means 聚类 K 值轮廓系数扫描与 Bootstrap 稳定性验证
library(cluster)
df <- read.csv("${csvName}")
X <- scale(df[, c("Q3", "Q4", "Q5", "Q6", "Q7", "Q9", "Q10", "Q11")])

set.seed(42)
for (k in 2:6) {
  km <- kmeans(X, centers = k, nstart = 25)
  sil <- summary(silhouette(km$cluster, dist(X)))$avg.width
  cat(sprintf("k = %d | Mean Silhouette = %.3f\\n", k, sil))
}`,
        spss: `* ${bp.shortTitle}：K-Means 四分群聚类分析与簇中心导出 (k = 4).
QUICK CLUSTER ZQ3 ZQ4 ZQ5 ZQ6 ZQ7 ZQ9 ZQ10 ZQ11
  /MISSING = LISTWISE
  /CRITERIA = CLUSTER(4) MXITER(50) CONVERGE(0)
  /METHOD = KMEANS(NOUPDATE)
  /SAVE CLUSTER(cluster_k4) DISTANCE(cluster_dist)
  /PRINT INITIAL ANOVA CLUSTER DISTAN.`,
        latex: `\\begin{table}[htbp]
  \\centering
  \\caption{${bp.shortTitle}受众 K-Means 四分群画像特征与精准转化策略（$n = 641$）}
  \\label{tab:${bp.slug}-clusters}
  \\begin{tabular}{lcccl}
    \\toprule
    受众分群名称 & 样本占比 & 满意度均值 & 转化意愿均值 & 核心触达与转化策略 \\\\
    \\midrule
    I. 跨界高频连接型 & 34.2\\% & 4.41 & 4.52 & ${bp.actors[0].project} \\\\
    II. 深度口碑铁杆型 & 28.5\\% & 4.48 & 4.61 & 核心权益深耕 + 社群裂变激励 \\\\
    III. 痛点敏感体验型 & 23.1\\% & 3.89 & 3.94 & ${bp.actors[1].project} \\\\
    IV. 潜在观望待促型 & 14.2\\% & 3.54 & 3.48 & ${bp.actors[2].project} \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}`,
      },
    },
    {
      id: 'logit-sem-topsis',
      title: `05 有序 Logistic 边际效应、SEM 中介路径与熵权 TOPSIS 综合评价`,
      badge: '九大典藏通用高阶模型',
      summary: `融合典藏库 9 篇国奖报告高频高阶模型：测度五维感知通过${bp.overallSatConstruct}向${bp.conversionConstruct}传导的中介效应及多方案 TOPSIS 排序。`,
      auditUpgrade: '打通从参数推断（有序 Logit 优势比 OR）到结构方程（Bootstrap 中介检验）再到多属性决策（熵权 TOPSIS）的完整建模闭环。',
      targetNode: 'appendix.code',
      snippets: {
        python: `import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.miscmodels.ordinal_model import OrderedModel

df = pd.read_csv("${csvName}")
X = df[["Q3", "Q4", "Q5", "Q6", "Q7", "Q9"]]
y = df["Q11"]  # ${bp.conversionConstruct} (1-5 有序等级)

# 1. 有序 Logistic 回归与优势比 (Odds Ratio)
ord_mod = OrderedModel(y, X, distr="logit").fit(method="bfgs", disp=False)
params = ord_mod.params[:6]
ors = np.exp(params)
print("有序 Logit 优势比 EXP(B):\\n", pd.DataFrame({"Coef": params.round(3), "OR": ors.round(3)}))

# 2. 熵权 TOPSIS 评估各片区综合服务表现
mat = df.groupby("Q1")[["Q3", "Q4", "Q5", "Q6", "Q7"]].mean().values
norm_mat = mat / np.sqrt((mat ** 2).sum(axis=0))
z_plus, z_minus = norm_mat.max(axis=0), norm_mat.min(axis=0)
d_plus = np.sqrt(((norm_mat - z_plus) ** 2).sum(axis=1))
d_minus = np.sqrt(((norm_mat - z_minus) ** 2).sum(axis=1))
c_score = d_minus / (d_plus + d_minus)
print("TOPSIS 综合贴近度 C_i:", np.round(c_score, 4))`,
        r: `# 有序 Logistic 回归 (MASS::polr) 与 lavaan 结构方程中介效应检验
library(MASS)
library(lavaan)

df <- read.csv("${csvName}")
df$Q11_ord <- factor(df$Q11, ordered = TRUE)
fit_polr <- polr(Q11_ord ~ Q3 + Q4 + Q5 + Q6 + Q7 + Q9, data = df, Hess = TRUE)
print(round(exp(coef(fit_polr)), 3))

# 结构方程模型 (SEM): 五维感知 -> 整体满意度(Q10) -> 转化意愿(Q11)
sem_model <- '
  Exp =~ Q3 + Q4 + Q5 + Q6 + Q7
  Q10 ~ a * Exp + Q9
  Q11 ~ b * Q10 + c * Exp
  indirect := a * b
'
fit_sem <- sem(sem_model, data = df, se = "bootstrap", bootstrap = 200)
summary(fit_sem, standardized = TRUE, fit.measures = TRUE)`,
        spss: `* 有序 Logistic 回归 (PLUM) 检验《${bp.scaleConstruct}》对${bp.conversionConstruct} (Q11) 的驱动效应.
PLUM Q11 WITH Q3 Q4 Q5 Q6 Q7 Q9
  /CRITERIA = CIN(95) DELTA(0) LCONVERGE(0) MXITER(100) MXSTEP(5) PCONVERGE(1.0E-6)
  /LINK = LOGIT
  /PRINT = FIT PARAMETER SUMMARY TPARALLEL.`,
        latex: `\\begin{table}[htbp]
  \\centering
  \\caption{${bp.shortTitle}${bp.conversionConstruct}有序 Logistic 回归与优势比估计（$n = 641$）}
  \\label{tab:${bp.slug}-ologit}
  \\begin{tabular}{lcccc}
    \\toprule
    解释变量 & 回归系数 $\\hat{\\beta}$ & 稳健标准误 & 优势比 $\\mathrm{OR}=e^{\\hat{\\beta}}$ & 95\\% 置信区间 \\\\
    \\midrule
    Q3 ${d3.short} & 0.612*** & 0.089 & 1.844 & [1.549, 2.195] \\\\
    Q4 ${d4.short} & 0.485*** & 0.084 & 1.624 & [1.378, 1.915] \\\\
    Q5 ${d5.short} & 0.538*** & 0.079 & 1.713 & [1.467, 2.000] \\\\
    Q6 ${d6.short} & 0.514*** & 0.076 & 1.672 & [1.441, 1.941] \\\\
    Q9 ${bp.mechanismConstruct} & 0.648*** & 0.082 & 1.912 & [1.628, 2.245] \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}`,
      },
    },
  ];

  const q = query.toLowerCase();
  let activeRecipeId = recipes[0].id;
  if (/ipa|痛点|象限|权重/.test(q)) activeRecipeId = 'implicit-ipa';
  else if (/抽样|deff|cochran|清洗/.test(q)) activeRecipeId = 'sampling-deff';
  else if (/聚类|分群|kmeans|bootstrap/.test(q)) activeRecipeId = 'kmeans-bootstrap';
  else if (/logit|logistic|sem|结构方程|topsis|回归/.test(q)) activeRecipeId = 'logit-sem-topsis';

  let activeLang: CodeStudioLang = 'python';
  if (/\br语言|\br\b|tidyverse/.test(q)) activeLang = 'r';
  else if (/spss/.test(q)) activeLang = 'spss';
  else if (/latex|三线表|booktabs/.test(q)) activeLang = 'latex';

  return { activeRecipeId, activeLang, recipes };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 3. Evidence-Bound Co-Authoring & Polishing Studio (`/撰稿`)
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
  const numMatches = clean.match(/\d+(?:\.\d+)?%?/g) ?? [];
  const hasStats = /(?:χ²|卡方|t\s*=|ρ\s*=|p\s*[<=>]|α\s*=|DEFF|641|94\.4%|OR\s*=)/i.test(clean);
  const causalOverclaim = /相关|关联/.test(clean) && /导致|决定了|必然引起/.test(clean);
  const hasActorAndKpi =
    /主办方|高校|运营方|部门|团委|商圈|委员会|平台|企业|中心|街道|协会/.test(clean) &&
    /KPI|目标值|指标|核销率|缩短|提升\s*\d+|复盘|留存率/.test(clean);
  const hasBoundary = /局限|边界|外推|非概率|陈述性偏好|面板|止损/.test(clean);
  const hasCliche = /众所周知|不言而喻|毫无疑问|填补了国内空白/.test(clean);

  const checks = [
    {
      id: 'evidence',
      label: '实证数字与检验量锚定',
      passed: numMatches.length >= 2 && hasStats,
      detail:
        numMatches.length >= 2 && hasStats
          ? `已嵌入 ${numMatches.length} 处定量读数与统计检验符号。`
          : '需嵌入具体有效样本量、均值/百分比或检验统计量（如 χ²=28.64, p<0.001）。',
    },
    {
      id: 'causal',
      label: '相关与因果措辞克制',
      passed: !causalOverclaim,
      detail: causalOverclaim
        ? '检测到在相关性表述旁使用了“导致/决定了”等绝对因果词，建议改为“显著正向伴随/驱动意愿”。'
        : '统计关联与因果推断边界表述严谨。',
    },
    {
      id: 'academic',
      label: '去套话与零武断修辞',
      passed: !hasCliche && wordCount >= 80,
      detail: hasCliche
        ? '含“众所周知/填补空白”等空泛套话，建议直接用数据事实说话。'
        : `学术语态稳健（当前 ${wordCount} 字）。`,
    },
    {
      id: 'action-boundary',
      label: '3W1H 落地指标或误差边界',
      passed: hasActorAndKpi || hasBoundary,
      detail:
        hasActorAndKpi || hasBoundary
          ? '已包含执行主体+量化 KPI 或方法论适用边界声明。'
          : '建议补充责任主体与可量化 KPI（如核销率≥25%）或外推适用边界。',
    },
  ];

  const passedCount = checks.filter(c => c.passed).length;
  return {
    score: Math.round((passedCount / checks.length) * 100),
    wordCount,
    factMentions: numMatches.length,
    checks,
  };
}

export function buildWritingStudioCardData(ctx: RouterContext, query = ''): WritingStudioCardData {
  const bp = resolveActiveBlueprint(ctx, query);
  const [d3, d4, d5, d6] = bp.dimensions;
  const [s0] = bp.statusCategories;
  const [a0, a1, a2] = bp.actors;

  const facts: WritingStudioFact[] = [
    {
      id: 'F1',
      token: `有效问卷 641 份（有效回收率 94.4%，${bp.groupA} 328 份 + ${bp.groupB} 313 份）`,
      label: '双轨样本底盘',
      value: 'n = 641 (94.4%)',
      origin: '表 2-1 分层抽样账本 (DEFF=1.65)',
    },
    {
      id: 'F2',
      token: `《${bp.scaleConstruct}》Cronbach α = 0.892（预调查 n = 68 时 α = 0.876）`,
      label: '量表信度检验',
      value: 'α = 0.892',
      origin: '表 3-1 内部一致性检验',
    },
    {
      id: 'F3',
      token: `${bp.groupA}“${s0}”比例达 76.83%（252/328），显著高于${bp.groupB}的 62.30%（χ² = 28.64, p < 0.001, Cramér’s V = 0.211）`,
      label: '跨界连接器母洞察',
      value: '76.83% (χ²=28.64)',
      origin: '表 4-1 交叉列联卡方检验',
    },
    {
      id: 'F4',
      token: `${d3.short}（4.38 分）位居第一象限优势区，${d6.short}（3.41 分）与${d5.short}（3.74 分）落入第四象限痛点区（Welch t = 3.42, p < 0.001）`,
      label: '隐性 IPA 痛点象限',
      value: `${d6.short.slice(0, 4)} 3.41 / ${d5.short.slice(0, 4)} 3.74`,
      origin: '图 4-1 正交残差化隐性 IPA',
    },
    {
      id: 'F5',
      token: `${bp.overallSatConstruct}与${bp.conversionConstruct}呈强正向单调相关（Spearman ρ = 0.584, p < 0.001），${bp.mechanismConstruct}与${bp.conversionConstruct}显著正相关（ρ = 0.468, p < 0.001）`,
      label: '转化弹性秩相关',
      value: 'ρ = 0.584 / 0.468',
      origin: '表 4-2 Spearman 等级相关',
    },
  ];

  // Append any custom registered results from the user's project
  const customResults = (ctx.results?.results ?? []).filter(
    r => !r.id.startsWith('res-hanchao-') && !r.id.startsWith(`res-${bp.slug}-`) && r.method !== 'sampling-frame',
  );
  customResults.slice(0, 3).forEach((r, idx) => {
    const m0 = r.metrics[0];
    const metricStr = m0 && m0.value !== null ? `${m0.label} = ${m0.value}` : `n = ${r.n}`;
    facts.push({
      id: `U${idx + 1}`,
      token: `${r.title}（有效样本 n = ${r.n}，${metricStr}）`,
      label: r.title.slice(0, 18),
      value: metricStr,
      origin: `当前项目登记结果 (${r.method})`,
    });
  });

  const templates: WritingTemplateSpec[] = [
    {
      id: 'abstract',
      title: `01 《${bp.shortTitle}》国奖一页式结构化摘要（首先—其次—随后—最后）`,
      nodeId: 'abstract',
      nodeLabel: '摘要',
      stageBadge: 'NAP-01 摘要范式',
      defaultDraft: `针对${bp.region}${bp.shortTitle}中${bp.groupA}与${bp.groupB}双轨并行下的触达分化、核心服务痛点与转化机制问题，本文基于${bp.region}分层多阶段抽样模拟调查数据，构建了“双轨抽样质控—列联破壁检验—正交隐性 IPA—Spearman 转化链路—3W1H 行动矩阵”的全链条循证分析框架。首先，基于 Cochran 公式与设计效应 DEFF = 1.65 推导抽样框，经预调查 68 份校准后正式发放问卷 679 份，双锚点质控剔除 38 份后获有效问卷 641 份（有效回收率 94.4%，${bp.groupA} 328 份、${bp.groupB} 313 份），《${bp.scaleConstruct}》Cronbach α = 0.892。其次，交叉列联卡方检验（χ² = 28.64, p < 0.001, Cramér’s V = 0.211）揭示核心母洞察：${bp.motherInsight}随后，正交隐性 IPA 表明${d3.short}（4.38 分）领跑优势区，而${d6.short}（3.41 分）与${d5.short}（3.74 分）落入第四象限亟待攻坚区；Spearman 秩相关证实${bp.mechanismConstruct}（ρ = 0.468）与${bp.overallSatConstruct}（ρ = 0.584）强烈驱动${bp.conversionConstruct}。最后，本文围绕三大执行主体提出${a0.project}、${a1.project}与${a2.project}可量化 KPI 行动包，并交代外推适用边界。\n关键词：${bp.keywords.join('；')}`,
      checklist: ['包含“针对问题…构建了…”破题句', '严守“首先—其次—随后—最后”四阶递进', '嵌入 641、94.4%、χ²=28.64、ρ=0.584 等硬核读数', '末尾独立成行配置 5–8 个关键词'],
    },
    {
      id: 'sampling-qc',
      title: `02 ${bp.region} Cochran + DEFF 抽样推导与双锚点数据清洗记录`,
      nodeId: 'design.sampling',
      nodeLabel: '2.3 抽样设计',
      stageBadge: 'NAP-04 抽样防线',
      defaultDraft: `为兼顾${bp.region}空间格局与“${bp.groupA}—${bp.groupB}”双轨受众特征，本研究采用“三大片区 × ${bp.groupConstruct}”分层多阶段抽样方案。在 95% 置信水平（z = 1.96）、最大允许误差 e = 5%、保守比例 p = 0.5 下，按样本量计算公式推导初始样本量 n0 = 384.16；考虑多阶段分层与场景聚类的设计效应 DEFF = 1.65，修正理论样本量为 634 份，设定计划有效样本底线为 600 份。结合预调查 68 份测得的有效率参数与题项校准结果，正式调查共发放问卷 679 份，严格执行 Q8 指定选项注意力核验与 90 秒最低作答时长双锚点清洗，剔除无效卷 38 份，最终获得有效问卷 641 份，有效回收率 94.4%（${bp.groupA} 328 份，${bp.groupB} 313 份）。同时需诚实说明研究局限：末端线下场景拦访含非概率偶遇成分，向总体外推时应结合置信区间与适用边界审慎解读。`,
      checklist: ['交代 Cochran 参数 z=1.96, p=0.5, e=0.05', '显式写入设计效应 DEFF=1.65 修正', '交代预调查 68 份与正式 679→38→641（94.4%）清洗链', '主动声明末端非概率偶遇抽样的外推边界'],
    },
    {
      id: 'empirical',
      title: `03 《${bp.shortTitle}》实证三段论读数（统计检验 → 效应量 → 母洞察）`,
      nodeId: 'compare.tests',
      nodeLabel: '4.1 差异检验与相关分析',
      stageBadge: 'NAP-07/08 实证收束',
      defaultDraft: `针对“${bp.groupConstruct}”与“${bp.statusConstruct}”两个名义分类变量，本文严格采用 Pearson 列联卡方检验与 Cramér’s V 效应量（避免对无序分类变量误用等级相关）。检验结果表明，二者存在高度显著的统计关联（χ² = 28.64, df = 3, p < 0.001, Cramér’s V = 0.211）：${bp.groupA}中“${s0}”比例高达 76.83%（252/328），较${bp.groupB}的 62.30%（195/313）高出 14.53 个百分点，且全部单元格期望频数均大于 26。这一实证证据直接确立了全篇的核心“母洞察”——${bp.motherInsight}在《${bp.scaleConstruct}》隐性 IPA 诊断中，${d3.short}（4.38 分）与${d4.short}（4.21 分）高居第一象限优势区，而${d6.short}（3.41 分）与${d5.short}（3.74 分）落入第四象限优先攻坚区（Welch t = 3.42, p < 0.001, Cohen’s d = 0.27；非参数 Kruskal-Wallis H = 11.48, p = 0.0007）。`,
      checklist: ['写明检验方法选择理由（名义用卡方，有序用秩相关）', '同时报告统计量、自由度、p 值与效应量（Cramér’s V / Cohen’s d）', '将统计数字升华为贯穿全篇的反常识母洞察'],
    },
    {
      id: 'mother-insight-3w1h',
      title: `04 《${bp.shortTitle}》分主体 3W1H 行动矩阵（Who-What-How-KPI-止损边界）`,
      nodeId: 'conclusion.suggestions',
      nodeLabel: '5.2 对策建议与行动矩阵',
      stageBadge: 'NAP-11 落地闭环',
      defaultDraft: `基于实证发现与研究局限边界，本文围绕三类核心执行主体，制定具备明确 KPI 目标值与止损复盘机制的 3W1H 行动方案：\n（1）【${a0.role}】实施${a0.project}（锚定跨界连接器深度参与率 76.83%）：${a0.action}。考核评估指标与 KPI 目标值：${a0.kpi}。\n（2）【${a1.role}】落地${a1.project}（锚定${d6.short} 3.41 分、${d5.short} 3.74 分第四象限痛点）：${a1.action}。考核评估指标与 KPI 目标值：${a1.kpi}。\n（3）【${a2.role}】打造${a2.project}（锚定转化意愿 ρ = 0.584）：${a2.action}。考核评估指标与 KPI 目标值：${a2.kpi}。`,
      checklist: ['每条对策明确点名执行主体（主管部门/运营方/协同平台）', '每条对策逆向绑定具体实证图表或检验发现', '给出可考核的定量 KPI 目标值与 4 周试点止损线'],
    },
    {
      id: 'defense-5w1h',
      title: `05 《${bp.shortTitle}》路演答辩 5W1H 评委追问防守手卡（含三姿应答）`,
      nodeId: 'conclusion.limits',
      nodeLabel: '5.1 研究结论与研究局限',
      stageBadge: 'NAP-12 答辩三姿',
      defaultDraft: `【评委高频追问一（How Many / Where）：你们末端在线下场景拦访，如何保证样本代表性？外推总体是否高估？】\n→ 站姿稳健应答：感谢评委老师直击抽样核心。我们在顶层严格按${bp.region}三大片区与“${bp.groupA} / ${bp.groupB}”双轨比例配置分层配额，并引入设计效应 DEFF = 1.65 将理论样本量从 385 份扩充至 634 份（实收有效 641 份，有效率 94.4%）。同时我们在报告 5.1 节主动交代了研究局限：末端定点拦访确实包含非概率偶遇成分，对高频活跃人群存在一定过代表性，因此本研究结论的适用边界聚焦于“${bp.shortTitle}核心辐射圈受众”，不盲目宣称代表全人口无偏普查。\n\n【评委高频追问二（Why / How）：为什么不用传统的直接打分重要性做 IPA，而要用正交残差化隐性 IPA？】\n→ 手势指向图 4-1 应答：预调查（n = 68）中我们发现受访者对《${bp.scaleConstruct}》五维度的直接重要性打分均在 4.6 分以上，呈现严重的“天花板效应”，且各维度与整体满意度存在自相关共线性。采用正交残差化回归权重作为隐性重要性后，成功剥离出“${d6.short}（3.41 分）”与“${d5.short}（3.74 分）”两个高隐性驱动但低满意度的第四象限真痛点，使 3W1H 对策真正靶向发力。`,
      checklist: ['预判抽样代表性（DEFF=1.65 + 末端偶遇边界）追问', '预判统计方法选择（卡方 vs 秩相关、正交隐性 IPA）追问', '结合答辩三姿（站姿稳、手势准、眼神定）给出 45 秒标准应答'],
    },
  ];

  const q = query.toLowerCase();
  let activeTemplateId = templates[0].id;
  if (/抽样|质控|deff|2\.3/.test(q)) activeTemplateId = 'sampling-qc';
  else if (/实证|卡方|ipa|4\.1|读数/.test(q)) activeTemplateId = 'empirical';
  else if (/对策|建议|3w1h|kpi|5\.2/.test(q)) activeTemplateId = 'mother-insight-3w1h';
  else if (/答辩|5w1h|路演|局限|评委/.test(q)) activeTemplateId = 'defense-5w1h';

  return { activeTemplateId, templates, facts };
}

/* ──────────────────────────────────────────────────────────────────────────
 * 4. Turn Builders for `/国奖` (`/铸造`, `/汉超`), `/备赛`, `/绘图`, `/编程`, `/撰稿`
 * ────────────────────────────────────────────────────────────────────────── */

export function buildHanchaoTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const pack = forgeNationalAwardPack(bp.title, ctx.design);
  const m = pack.meta;

  const exemplarLines: Line[] = NATIONAL_EXEMPLAR_CASES.map(item => [
    t(`${item.region} · ${item.pages}页`, 'teal'),
    t(item.title, 'strong'),
    t(item.methods, 'gold'),
    t(item.coreTakeaway, 'dim'),
  ]);

  const ledgerLines: Line[] = pack.dualLedger.map(row => [
    t(row.code, 'teal'),
    t(row.stage, 'strong'),
    t(row.cooccurrencePattern, 'gold'),
    t(row.reuseGuardrail, 'dim'),
  ]);

  const roomSummaryLines: Line[] = LIT_ROOMS.map(id => {
    const rl = roomLight(ctx.light, id);
    const sc = rl?.score ?? 0;
    return [
      t(id === 'design' ? '01 问卷映射' : id === 'sampling' ? '02 抽样与质控' : id === 'analysis' ? '03 五级统计梯子' : '04 报告与3W1H', 'strong'),
      t(lightBar(sc), sc >= 0.999 ? 'gold' : sc > 0 ? 'teal' : 'dim'),
      t(percent(sc), sc >= 0.999 ? 'gold' : 'dim'),
      t(rl?.summary ?? '待接入', 'dim'),
    ];
  });

  const cards: AgentCard[] = [
    {
      kind: 'tool',
      title: `当前解构靶心 · 《${bp.title}》`,
      columns: true,
      lines: [
        [t('工程编号', 'dim'), t(bp.id, 'teal'), t('研究领域', 'dim'), t(`${bp.domainLabel} (simulated · 无征不信)`, 'gold')],
        [
          t('抽样底盘', 'dim'),
          t(`预调 ${m.pilotCount} 份 · 实发 ${m.issuedCount} 份 · 剔除 ${m.excludedCount} 份 · 有效 ${m.validCount} 份 (${m.effectiveRatePct}%, DEFF=${m.deff})`, 'gold'),
          t('双轨分群', 'dim'),
          t(`${bp.groupA} (328人) vs ${bp.groupB} (313人)`, 'gold'),
        ],
        [
          t('五维量表', 'dim'),
          t(bp.dimensions.map(d => `${d.code}${d.short}(${d.meanAll})`).join(' · '), 'gold'),
          t('核心检验', 'dim'),
          t('α = 0.892 · χ² = 28.64 (V=0.211) · Welch t = 3.42 · ρ = 0.584', 'teal'),
        ],
      ],
      links: [
        say('切换题材：高校AIGC赋能治理', '/铸造 高校学生生成式AI辅助学习采纳机制与学术规范治理'),
        say('切换题材：毕业生新蓝领就业', '/铸造 高校毕业生新蓝领群体就业选择、分层画像与成长支持路径'),
        say('切换题材：银发族智慧助餐', '/铸造 城市社区银发族智慧助餐服务感知与政企可持续运营路径'),
        say('切换题材：武汉汉超双轨联赛', '/铸造 武汉城市足球超级联赛城区—高校双轨赛道赛事反馈与优化路径'),
      ],
    },
    {
      kind: 'confirm',
      title: `一键按《${bp.shortTitle}》铸造全链条国奖级工程（Q → D → I → A 四室 100% 满照度）`,
      lines: [
        [
          t('将按当前解构选题 '),
          t(`《${bp.title}》`, 'strong'),
          t(' 铸造完整国奖标准工程：含 12 题零阻断定制问卷、'),
          t('641 行', 'gold'),
          t(`双轨模拟样本（${bp.groupA} vs ${bp.groupB}）、`),
          t('6 项', 'gold'),
          t('带 SHA-256 凭证的分析快照、'),
          t('4 条', 'gold'),
          t('已锁定研究发现、100/100 基准分正文（含三大附录）与 '),
          t('8 页', 'gold'),
          t('路演分镜。您也可随时在聊天框输入 '),
          t('/铸造 您的任意参赛题目', 'teal'),
          t(' 定制生成！'),
        ],
      ],
      confirm: {
        label: `确认铸造《${bp.shortTitle}》全链条国奖工程`,
        action: { type: 'loadBenchmark', benchmarkId: bp.title },
        primary: true,
      },
      cancel: '先只看方法论对标，暂不覆盖当前工作区',
    },
    {
      kind: 'tool',
      title: '九大国奖典藏原案库 · 跨题材通用方法论矩阵（汉超等 9 篇真实报告提炼）',
      columns: true,
      lines: exemplarLines,
    },
    {
      kind: 'tool',
      title: '通用国奖共现法则 × 复用安全防线账本（NAP-01..NAP-12 · 学标准不抄袭）',
      columns: true,
      lines: ledgerLines,
    },
    {
      kind: 'tool',
      title: `当前工作区四室循证照度体检（总照度 ${percent(ctx.light.overall)}）`,
      columns: true,
      lines: roomSummaryLines,
    },
  ];

  return {
    lines: [
      [
        t('已启动'),
        t('证见 · 通用国奖全链条铸造引擎', 'strong'),
        t('（汲取汉超 308 页等 9 篇典藏原案方法论标准，支持'),
        t('任意参赛选题', 'teal'),
        t('动态铸造）。当前靶心母洞察：'),
        t(bp.motherInsight, 'gold'),
      ],
    ],
    cards,
    chips: [
      recommend(say('按当前选题定制绘图', `/绘图 ${bp.shortTitle}`)),
      say('按当前选题定制代码', `/编程 ${bp.shortTitle}`),
      say('按当前选题定制撰稿', `/撰稿 ${bp.shortTitle}`),
      say('/备赛'),
      say('/印鉴'),
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
    {
      code: 'Stage 01',
      name: '立题破题与双锚点耦合',
      done: dScore >= 0.5,
      standard: '宏观政策痛点 × 微观受众冲突，确立 Q→D→I→A 四元闭环研究问题',
      cmd: '/选题',
    },
    {
      code: 'Stage 02',
      name: '探索与零阻断问卷构建',
      done: dScore >= 0.999,
      standard: '跳题逻辑锁死目标人群 + 5 级量表构念映射 + 注意力质控题（0 阻断）',
      cmd: '/问卷',
    },
    {
      code: 'Stage 03',
      name: 'Cochran+DEFF 抽样与预调',
      done: sScore >= 0.66,
      standard: 'n₀=384.16 × DEFF 修正 + 预调查信度校准 + 分层入样分配表写入报告',
      cmd: '/抽样',
    },
    {
      code: 'Stage 04',
      name: '田野回收与双锚点清洗',
      done: sScore >= 0.999 && aScore >= 0.33,
      standard: '注意力题 + 作答时长双筛查，锁定有效样本与有效回收率（如 641/679=94.4%）',
      cmd: '/数据',
    },
    {
      code: 'Stage 05',
      name: '五级递进统计建模梯子',
      done: aScore >= 0.66,
      standard: 'L1 频数 → L2 信度 α → L3 列联 χ²(名义) → L4 隐性 IPA/t 检验 → L5 Logit/SEM/聚类',
      cmd: '/编程',
    },
    {
      code: 'Stage 06',
      name: '出版级统计制图与图说',
      done: eScore >= 0.6 && (ctx.results?.placed.length ?? 0) >= 2,
      standard: '一图一结论标题 + 样本口径与检验统计量尾注 + 正文显式引用解读',
      cmd: '/绘图',
    },
    {
      code: 'Stage 07',
      name: '反常识母洞察与 3W1H 撰稿',
      done: aScore >= 0.999 && eScore >= 0.9,
      standard: '4 条已确认发现收束为 1 条反直觉母洞察 + 分主体量化 KPI 对策 + 三大附录',
      cmd: '/撰稿',
    },
    {
      code: 'Stage 08',
      name: '8 页路演分镜与 5W1H 答辩',
      done: eScore >= 0.999,
      standard: '金墨棱镜母版 PPT + 评委 5W1H 追问防守卡 + 九门金石印鉴全满交卷',
      cmd: '/答辩',
    },
  ];

  const firstPending = stages.find(s => !s.done) ?? stages[stages.length - 1];
  const doneCount = stages.filter(s => s.done).length;

  return {
    lines: [
      [
        t(`参赛者全周期领航员（当前靶心：《${bp.shortTitle}》）· 已完成 `),
        t(`${doneCount} / 8`, 'gold'),
        t(' 阶备赛关卡（总照度 '),
        t(percent(ctx.light.overall), 'gold'),
        t('）。当前最优先动作：'),
        t(`${firstPending.code} ${firstPending.name}`, 'strong'),
        t('。'),
      ],
    ],
    cards: [
      {
        kind: 'tool',
        title: `正大杯国奖八阶全周期备赛路线图（当前选题：《${bp.shortTitle}》）`,
        columns: true,
        lines: stages.map(s => [
          t(s.done ? '● 已点亮' : '○ 待攻坚', s.done ? 'gold' : 'teal'),
          t(`${s.code} ${s.name}`, 'strong'),
          t(s.standard, 'dim'),
          t(s.cmd, 'teal'),
        ]),
        links: [
          recommend(say(`立即推进：${firstPending.name}`, firstPending.cmd)),
          say('打开通用国奖全链条铸造台', '/铸造'),
          say('打开交互绘图工坊', '/绘图'),
          say('打开多语言编程工坊', '/编程'),
          say('打开国奖撰稿工坊', '/撰稿'),
        ],
      },
    ],
    chips: [
      recommend(say('/铸造')),
      say('/绘图'),
      say('/编程'),
      say('/撰稿'),
      say('/印鉴'),
    ],
  };
}

export function buildChartStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildChartStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已开启'),
        t(`证见 · 交互统计制图工坊（已自适应绑定选题《${bp.shortTitle}》）`, 'strong'),
        t('。支持切换 '),
        t('5 类出版级图型', 'teal'),
        t('、实时增删改每个数据点数值与标签、导出纯矢量 SVG 或一键写入报告章节。'),
      ],
    ],
    cards: [
      {
        kind: 'chart-studio',
        title: `交互式出版级统计制图工坊 · 《${bp.shortTitle}》`,
        studio,
      },
    ],
    chips: [
      recommend(say('切换多语言编程工坊', `/编程 ${bp.shortTitle}`)),
      say('切换国奖撰稿工坊', `/撰稿 ${bp.shortTitle}`),
      say('通用国奖铸造台', '/铸造'),
    ],
  };
}

export function buildCodeStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildCodeStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已开启'),
        t(`证见 · 多语言统计编程与三线表工坊（已自适应绑定选题《${bp.shortTitle}》）`, 'strong'),
        t('。内置 '),
        t('Python / R / SPSS / LaTeX booktabs', 'teal'),
        t(' 五大核心建模脚本（列联 χ²、正交残差化隐性 IPA、DEFF=1.65 抽样推导、Bootstrap ARI 聚类、有序 Logit + SEM + TOPSIS），支持在线自由改写、下载源码或一键写入报告代码附录。'),
      ],
    ],
    cards: [
      {
        kind: 'code-studio',
        title: `多语言统计复现与 LaTeX 三线表工坊 · 《${bp.shortTitle}》`,
        studio,
      },
    ],
    chips: [
      recommend(say('切换国奖撰稿工坊', `/撰稿 ${bp.shortTitle}`)),
      say('切换交互绘图工坊', `/绘图 ${bp.shortTitle}`),
      say('通用国奖铸造台', '/铸造'),
    ],
  };
}

export function buildWritingStudioTurn(ctx: RouterContext, query = ''): AgentTurn {
  const bp = resolveActiveBlueprint(ctx, query);
  const studio = buildWritingStudioCardData(ctx, query);
  return {
    lines: [
      [
        t('已开启'),
        t(`证见 · 循证撰稿与 5W1H 答辩润色工坊（已自适应绑定选题《${bp.shortTitle}》）`, 'strong'),
        t('。提供 '),
        t('5 大国奖核心文体模板', 'teal'),
        t(' 与 '),
        t('金源事实胶囊 {F1..Fn}', 'gold'),
        t(' 一键注入，实时执行学术合规体检（定量锚定、反因果夸大、去套话、3W1H 指标完备度），支持直接写入报告对应章节。'),
      ],
    ],
    cards: [
      {
        kind: 'writing-studio',
        title: `国奖循证撰稿、事实注入与答辩手卡工坊 · 《${bp.shortTitle}》`,
        studio,
      },
    ],
    chips: [
      recommend(say('查看报告蓝图进度', '/写报告')),
      say('切换交互绘图工坊', `/绘图 ${bp.shortTitle}`),
      say('切换多语言编程工坊', `/编程 ${bp.shortTitle}`),
      say('通用国奖铸造台', '/铸造'),
    ],
  };
}
