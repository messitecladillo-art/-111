/**
 * How a report presents the advanced methods, deterministically, with no model: the method paragraph (why this
 * method, ending on its formulas), the formulas in TeX, the "式中" paragraph defining every symbol and the method's
 * conditions, the result table (a noun-phrase caption, its header and rows, a note on how to read it), and the
 * reading paragraph. Readings state association, never cause, and say when a condition is not met. The same style as
 * lib/report-templates.ts, whose helpers they share; numbers come only from the computed result.
 */
import type { Adequacy } from './psychometrics.ts';
import { kmoBand } from './psychometrics.ts';
import type { FactorSolution } from './factor-analysis.ts';
import type { Regression } from './regression.ts';
import type { Logistic } from './logistic.ts';
import type { Ahp } from './ahp.ts';
import type { Ipa } from './ipa.ts';
import type { Clustering } from './kmeans.ts';
import type { GroupProfile, LikertDistribution, SpearmanMatrix } from './composite-analysis.ts';
import { coef as f3, dof, lead, literalText as literal, pMath, stat as f2, tex2, tex3, type ResultRefs } from './report-templates.ts';

export type MethodTable = { caption: string; headers: string[]; rows: string[][]; note: string };
export type MethodWriting = { text: string; formulas: string[]; where: string; table: MethodTable; reading: string };

const pCell = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));
const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const names = (list: readonly string[]) => list.map(n => `“${literal(n)}”`).join('、');

/** KMO and Bartlett, then the rotated factor structure: one write-up for a "效度检验" section. */
export function validityWriting(adequacy: Adequacy, solution: FactorSolution, items: readonly string[], refs: ResultRefs = {}): MethodWriting {
  const fit = adequacy.kmo >= 0.6 && adequacy.bartlett.p < 0.05;
  const cross = solution.loadings.flatMap((row, i) => (row.filter(v => Math.abs(v) >= 0.4).length > 1 ? [items[i]] : []));
  const weak = solution.loadings.flatMap((row, i) => (Math.max(...row.map(Math.abs)) < 0.4 ? [items[i]] : []));
  const groups = Array.from({ length: solution.factors }, (_, j) => {
    const members = solution.loadings.flatMap((row, i) => {
      const top = row.reduce((best, v, k) => (Math.abs(v) > Math.abs(row[best]) ? k : best), 0);
      return top === j && Math.abs(row[j]) >= 0.4 ? [[items[i], row[j]] as const] : [];
    });
    const values = members.map(([, v]) => Math.abs(v));
    return members.length ? `因子 ${j + 1} 主要由${names(members.map(([n]) => n))}构成（载荷 ${f2(Math.min(...values))}～${f2(Math.max(...values))}）` : `因子 ${j + 1} 没有载荷达到 0.40 的题项`;
  });
  return {
    text: '因子分析之前，先以 KMO 取样适切性量数与 Bartlett 球形检验判断题项是否适合提取公因子；随后采用主轴因子法提取公因子，并以 Kaiser 标准化的最大方差法（varimax）正交旋转。KMO 量数与 Bartlett 检验统计量分别为',
    formulas: ['\\mathrm{KMO}=\\frac{\\sum_{i\\neq j}r_{ij}^{2}}{\\sum_{i\\neq j}r_{ij}^{2}+\\sum_{i\\neq j}a_{ij}^{2}}', '\\chi^{2}=-\\left(n-1-\\frac{2p+5}{6}\\right)\\ln\\lvert R\\rvert'],
    where: '式中，$r_{ij}$ 为题项 $i$ 与 $j$ 的相关系数，$a_{ij}$ 为控制其余题项后的偏相关系数，$R$ 为题项相关矩阵，$n$ 为有效样本量，$p$ 为题项数，统计量服从自由度为 $p(p-1)/2$ 的 $\\chi^2$ 分布。KMO 越接近 1 越适合因子分析，一般以 0.6 为下限；公因子个数按特征值大于 1 的原则确定，载荷绝对值不低于 0.40 视为题项归属于该因子。',
    table: {
      caption: '题项旋转后因子载荷',
      headers: ['题项', ...Array.from({ length: solution.factors }, (_, j) => `因子 ${j + 1}`), '共同度'],
      rows: [
        ...solution.loadings.map((row, i) => [literal(items[i]), ...row.map(f3), f3(solution.communalities[i])]),
        ['旋转后方差贡献率', ...solution.variance.map(v => percent(v.share)), ''],
        ['累计方差贡献率', ...solution.variance.map(v => percent(v.cumulative)), ''],
      ],
      note: `注：主轴因子法提取，Kaiser 标准化的最大方差法旋转；$\\mathrm{KMO}=${tex3(adequacy.kmo)}$，Bartlett 球形检验 $\\chi^2(${adequacy.bartlett.df})=${tex2(adequacy.bartlett.chi2)}$，$${pMath(adequacy.bartlett.p)}$；$n=${adequacy.n}$。`,
    },
    reading: `${lead(refs)}KMO 值为 $${tex3(adequacy.kmo)}$（${kmoBand(adequacy.kmo)}），Bartlett 球形检验 $\\chi^2(${dof(adequacy.bartlett.df)})=${tex2(adequacy.bartlett.chi2)}$，$${pMath(adequacy.bartlett.p)}$，`
      + (fit ? '拒绝相关矩阵为单位矩阵的原假设，题项适合进行因子分析。' : '题项不满足因子分析的前提，以下因子结构仅供参考，需重新审视题项设计。')
      + `按特征值大于 1 提取 ${solution.factors} 个公因子，旋转后累计解释 ${percent(solution.variance.at(-1)!.cumulative)} 的方差；${groups.join('；')}。`
      + (cross.length ? `题项${names(cross)}在两个及以上因子上的载荷超过 0.40，存在交叉载荷，需结合题意判断其归属。` : '')
      + (weak.length ? `题项${names(weak)}在各因子上的载荷均低于 0.40，可考虑删除或改写。` : ''),
  };
}

/** Multiple linear regression for a "影响因素" section. */
export function regressionWriting(fit: Regression, outcome: string, refs: ResultRefs = {}): MethodWriting {
  const predictors = fit.coefficients.slice(1), significant = predictors.filter(c => c.p < 0.05), quiet = predictors.filter(c => c.p >= 0.05);
  const maxVif = Math.max(...predictors.map(c => c.vif ?? 1));
  const effect = (c: (typeof predictors)[number]) => `${literal(c.name)}与${literal(outcome)}${c.estimate > 0 ? '正' : '负'}相关（$B=${tex3(c.estimate)}$，$\\beta=${tex3(c.standardized ?? 0)}$，$${pMath(c.p)}$）`;
  return {
    text: `为考察多个因素与${literal(outcome)}的关联，在控制其他变量的条件下建立多元线性回归模型，以最小二乘法估计：`,
    formulas: ['Y=\\beta_0+\\sum_{k=1}^{K}\\beta_k X_k+\\varepsilon', '\\mathrm{VIF}_k=\\frac{1}{1-R_k^{2}}'],
    where: '式中，$Y$ 为因变量，$X_k$ 为第 $k$ 个自变量，$\\beta_k$ 为其回归系数，表示其他变量不变时 $X_k$ 每增加一个单位 $Y$ 的平均变化，$\\varepsilon$ 为随机误差项；$R_k^{2}$ 为 $X_k$ 对其余自变量回归的决定系数，方差膨胀因子 $\\mathrm{VIF}$ 大于 10（宽松标准为 5）提示多重共线性。模型要求误差相互独立、方差齐性，以 Breusch–Pagan 检验判断异方差。',
    table: {
      caption: `${literal(outcome)}影响因素的回归估计结果`,
      headers: ['变量', '非标准化系数 B', '标准误', '标准化系数 β', 't', 'p', 'VIF'],
      rows: fit.coefficients.map(c => [literal(c.name), f3(c.estimate), f3(c.se), c.standardized === null ? '—' : f3(c.standardized), f2(c.t), pCell(c.p), c.vif === null ? '—' : f2(c.vif)]),
      note: `注：$n=${fit.n}$；$R^2=${tex3(fit.r2)}$，调整 $R^2=${tex3(fit.adjustedR2)}$；$F(${fit.f.df[0]},${fit.f.df[1]})=${tex2(fit.f.value)}$，$${pMath(fit.f.p)}$。`,
    },
    reading: `${lead(refs)}模型${fit.f.p < 0.05 ? '整体显著' : '整体未达到显著水平'}，$F(${fit.f.df[0]},${fit.f.df[1]})=${tex2(fit.f.value)}$，$${pMath(fit.f.p)}$，调整后 $R^2=${tex3(fit.adjustedR2)}$，自变量共同解释了${literal(outcome)}约 ${percent(fit.adjustedR2)} 的变异。`
      + (significant.length ? `在控制其他变量后，${significant.map(effect).join('；')}。` : '在控制其他变量后，没有自变量与因变量的关联达到 0.05 的显著性水平。')
      + (quiet.length ? `${names(quiet.map(c => c.name))}的系数未达到 0.05 的显著性水平。` : '')
      + `各变量 VIF 最大为 ${f2(maxVif)}，${maxVif < 5 ? '不存在严重的多重共线性' : '存在较强的多重共线性，系数估计需谨慎解读'}；`
      + `Breusch–Pagan 检验 $\\chi^2(${fit.breuschPagan.df})=${tex2(fit.breuschPagan.lm)}$，$${pMath(fit.breuschPagan.p)}$，${fit.breuschPagan.p < 0.05 ? '存在异方差，系数的显著性应以稳健标准误复核' : '未发现明显的异方差'}。`
      + '上述关联不能直接解释为因果关系。',
  };
}

/** Binary logistic regression for a "影响因素" section whose outcome is a choice. */
export function logisticWriting(fit: Logistic, outcome: string, event: string, refs: ResultRefs = {}): MethodWriting {
  const predictors = fit.coefficients.slice(1), significant = predictors.filter(c => c.p < 0.05);
  const effect = (c: (typeof predictors)[number]) => `${literal(c.name)}每增加一个单位，${literal(event)}的发生比变为原来的 $${tex3(c.oddsRatio)}$ 倍（$OR$ 95% 置信区间 $[${tex3(c.oddsRatioCi[0])},${tex3(c.oddsRatioCi[1])}]$，$${pMath(c.p)}$），平均而言概率${c.ame!.value >= 0 ? '提高' : '降低'} ${Math.abs(c.ame!.value * 100).toFixed(1)} 个百分点`;
  return {
    text: `${literal(outcome)}是二分类变量，采用二元 Logistic 回归，以极大似然法估计各因素与${literal(event)}发生概率的关联：`,
    formulas: ['\\ln\\frac{P(Y=1)}{1-P(Y=1)}=\\beta_0+\\sum_{k=1}^{K}\\beta_k X_k', 'OR_k=e^{\\beta_k}'],
    where: `式中，$P(Y=1)$ 为${literal(event)}的概率，$\\beta_k$ 为第 $k$ 个自变量的回归系数，发生比比率 $OR_k$ 表示其他变量不变时 $X_k$ 每增加一个单位发生比的倍数；平均边际效应为样本中每个个体概率对 $X_k$ 的导数的平均值，以百分点表示。模型整体以似然比检验判断，拟合程度以 McFadden 伪 $R^2$ 衡量。`,
    table: {
      caption: `${literal(event)}影响因素的 Logistic 回归估计结果`,
      headers: ['变量', 'B', '标准误', 'Wald z', 'p', 'OR', 'OR 95% CI', '平均边际效应'],
      rows: fit.coefficients.map(c => [literal(c.name), f3(c.estimate), f3(c.se), f2(c.z), pCell(c.p), ...([c.oddsRatio, ...c.oddsRatioCi].every(Number.isFinite) ? [f3(c.oddsRatio), `[${f3(c.oddsRatioCi[0])}, ${f3(c.oddsRatioCi[1])}]`] : ['—', '—']), c.ame ? f3(c.ame.value) : '—']),
      note: `注：$n=${fit.n}$，${literal(event)} ${fit.events} 例；似然比检验 $\\chi^2(${fit.lr.df})=${tex2(fit.lr.chi2)}$，$${pMath(fit.lr.p)}$；McFadden 伪 $R^2=${tex3(fit.mcFaddenR2)}$。`,
    },
    reading: `${lead(refs)}模型的似然比检验 $\\chi^2(${fit.lr.df})=${tex2(fit.lr.chi2)}$，$${pMath(fit.lr.p)}$，${fit.lr.p < 0.05 ? '模型整体显著' : '模型整体未达到显著水平'}，McFadden 伪 $R^2=${tex3(fit.mcFaddenR2)}$。`
      + (significant.length ? `在控制其他变量后，${significant.map(effect).join('；')}。` : '没有自变量与因变量的关联达到 0.05 的显著性水平。')
      + '上述关联不能直接解释为因果关系。',
  };
}

/** AHP weights and consistency for a "方案优先级" section. */
export function ahpWriting(result: Ahp, criteria: readonly string[], refs: ResultRefs = {}): MethodWriting {
  const ranked = criteria.map((name, i) => [name, result.weights[i]] as const).sort((a, b) => b[1] - a[1]);
  return {
    text: '各评价准则的相对重要性由层次分析法确定：专家对准则两两比较，按 1～9 标度构造判断矩阵，以其最大特征值对应的特征向量（归一化）作为权重，并检验判断的一致性：',
    formulas: ['A\\mathbf{w}=\\lambda_{\\max}\\mathbf{w}', 'CI=\\frac{\\lambda_{\\max}-n}{n-1},\\qquad CR=\\frac{CI}{RI}'],
    where: '式中，$A$ 为判断矩阵，$\\mathbf{w}$ 为权重向量，$\\lambda_{\\max}$ 为最大特征值，$n$ 为准则数，$RI$ 为同阶平均随机一致性指标；$CR<0.1$ 时认为判断矩阵具有满意的一致性，否则需调整判断。',
    table: {
      caption: '评价准则权重与一致性检验',
      headers: ['准则', '权重', '排序'],
      rows: criteria.map((name, i) => [literal(name), f3(result.weights[i]), String(ranked.findIndex(([n]) => n === name) + 1)]),
      note: `注：$\\lambda_{\\max}=${tex3(result.lambdaMax)}$，$\\mathrm{CI}=${tex3(result.ci)}$，$\\mathrm{RI}=${tex2(result.ri)}$${result.cr === null ? '；两项准则无需一致性检验' : `，$\\mathrm{CR}=${tex3(result.cr)}$`}。`,
    },
    reading: `${lead(refs)}${result.cr === null ? '两项准则无需一致性检验。' : `判断矩阵的一致性比率 $CR=${tex3(result.cr)}$，${result.consistent ? '小于 0.1，判断具有满意的一致性' : '不小于 0.1，判断不一致，应请专家调整后重新计算，以下权重暂不宜采用'}。`}`
      + `各准则按权重从高到低依次为${ranked.map(([n, w]) => `${quote(n)}（$${tex3(w)}$）`).join('、')}，其中${quote(ranked[0][0])}的权重最高。`,
  };
}
const quote = (s: string) => `“${literal(s)}”`;

/** Importance–performance analysis for a "满意度与服务评价" section. */
export function ipaWriting(result: Ipa, refs: ResultRefs = {}): MethodWriting {
  const by = (q: string) => result.points.filter(p => p.quadrant === q).map(p => p.name);
  const importance = result.mode === 'stated' ? '受访者评定的重要性均值' : '以总体满意度对各属性表现回归所得的标准化系数（隐性重要性）';
  const quadrantText = (['重点改进', '继续保持', '过度投入', '低优先'] as const).map(q => [q, by(q)] as const).filter(([, list]) => list.length)
    .map(([q, list]) => `落在“${q}”象限的有${names(list)}`).join('；');
  return {
    text: `以${importance}为纵轴、表现评分均值为横轴，构建重要性—表现分析（IPA）矩阵，以两者的均值为分界将各属性划入四个象限：`,
    formulas: result.mode === 'derived' ? ['S=\\beta_0+\\sum_{k=1}^{K}\\beta_k P_k+\\varepsilon', 'I_k=\\beta_k^{*}=\\beta_k\\frac{s_{P_k}}{s_S}'] : ['I_k=\\frac{1}{n}\\sum_{i=1}^{n}I_{ik},\\qquad P_k=\\frac{1}{n}\\sum_{i=1}^{n}P_{ik}'],
    where: result.mode === 'derived'
      ? '式中，$S$ 为总体满意度，$P_k$ 为第 $k$ 个属性的表现评分，$\\beta_k^{*}$ 为标准化回归系数，$s$ 为标准差；隐性重要性反映属性与总体满意度的关联强度，而非受访者自述的重要程度。'
      : '式中，$I_{ik}$、$P_{ik}$ 分别为第 $i$ 位受访者对第 $k$ 个属性的重要性与表现评分，$n$ 为有效样本量。',
    table: {
      caption: '各属性重要性与表现评分及所属象限',
      headers: ['属性', result.mode === 'derived' ? '隐性重要性 β*' : '重要性均值', '表现均值', '象限'],
      rows: result.points.map(p => [literal(p.name), f3(p.importance), f3(p.performance), p.quadrant]),
      note: `注：$n=${result.n}$；分界线为重要性 $${tex3(result.lines.importance)}$、表现 $${tex3(result.lines.performance)}$${result.r2 === null ? '' : `；回归 $R^2=${tex3(result.r2)}$`}。`,
    },
    reading: `${lead(refs)}${quadrantText}。`
      + (by('重点改进').length ? `其中“重点改进”象限的属性重要但表现欠佳，是优先投入资源的方向。` : '没有属性落在“重点改进”象限。')
      + (by('过度投入').length ? `“过度投入”象限的属性表现较好但重要性较低，可适当调配资源。` : ''),
  };
}

/** K-means profiles for a "聚类与人群画像" section; `centers` are in the variables' standardized units. */
export function clusterWriting(result: Clustering, silhouetteMean: number, variables: readonly string[], refs: ResultRefs = {}): MethodWriting {
  const profile = result.centers.map((c, j) => {
    const high = variables.filter((_, d) => c[d] >= 0.5), low = variables.filter((_, d) => c[d] <= -0.5);
    return `第 ${j + 1} 类 ${result.sizes[j]} 人（${percent(result.sizes[j] / result.n)}）${high.length ? `，${names(high)}明显偏高` : ''}${low.length ? `，${names(low)}明显偏低` : ''}${!high.length && !low.length ? '，各变量接近总体平均' : ''}`;
  });
  return {
    text: '为识别受访者中特征相近的人群，对标准化后的变量进行 K-means 聚类：以 k-means++ 方法选取初始中心，多次随机起点取类内平方和最小的结果，并以平均轮廓系数评价所选聚类数下的类别结构：',
    formulas: ['\\min\\sum_{j=1}^{k}\\sum_{\\mathbf{x}_i\\in C_j}\\lVert\\mathbf{x}_i-\\mu_j\\rVert^{2}', 's(i)=\\frac{b(i)-a(i)}{\\max\\{a(i),\\,b(i)\\}}'],
    where: '式中，$C_j$ 为第 $j$ 类，$\\mu_j$ 为其中心，$a(i)$ 为个体 $i$ 与同类其他个体的平均距离，$b(i)$ 为其与最近的其他类的平均距离；平均轮廓系数越接近 1，类内越紧密、类间越分离，一般大于 0.5 认为结构合理，小于 0.25 认为聚类结构不明显。',
    table: {
      caption: '各类人群在聚类变量上的标准化中心',
      headers: ['类别', '人数', '占比', ...variables.map(literal)],
      rows: result.centers.map((c, j) => [`第 ${j + 1} 类`, String(result.sizes[j]), percent(result.sizes[j] / result.n), ...c.map(f2)]),
      note: `注：变量已标准化（均值 0、标准差 1），中心值为正表示高于总体平均；$k=${result.k}$，平均轮廓系数 $\\bar{s}=${tex3(silhouetteMean)}$，$n=${result.n}$。`,
    },
    reading: `${lead(refs)}将受访者分为 ${result.k} 类，平均轮廓系数为 $${tex3(silhouetteMean)}$，${silhouetteMean >= 0.5 ? '聚类结构合理' : silhouetteMean >= 0.25 ? '聚类结构一般，类别边界不够清晰' : '聚类结构不明显，以下画像仅供参考'}。${profile.join('；')}。各类的命名应结合变量含义与调查背景确定。`,
  };
}

const holmMath = (p: number) => (p < 0.001 ? 'p_{\\mathrm{Holm}}<0.001' : `p_{\\mathrm{Holm}}=${p.toFixed(3)}`);
/** Kruskal–Wallis ε²: about 0.01, 0.08 and 0.26 mark small, medium and large differences. */
const epsilonBand = (e: number) => (e >= 0.26 ? '差异较大' : e >= 0.08 ? '差异中等' : e >= 0.01 ? '差异较小' : '差异可忽略');
/** Spearman |ρ|: about 0.1, 0.3 and 0.5 mark weak, moderate and strong association. */
const rhoBand = (r: number) => (Math.abs(r) >= 0.5 ? '强' : Math.abs(r) >= 0.3 ? '中等' : Math.abs(r) >= 0.1 ? '弱' : '极弱');
const stars = (p: number) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '');

/** Several dimensions compared across the groups of one variable, for a "差异检验" section. */
export function profileWriting(result: GroupProfile, group: string, refs: ResultRefs = {}): MethodWriting {
  const d = result.dimensions.length, df = result.dimensions[0].df;
  const differing = result.dimensions.filter(x => x.pAdjusted < 0.05), similar = result.dimensions.filter(x => x.pAdjusted >= 0.05);
  const describe = (x: GroupProfile['dimensions'][number]) => {
    const order = x.means.map((m, g) => [g, m] as const).sort((a, b) => b[1] - a[1]), [hi, lo] = [order[0], order.at(-1)!];
    return `${quote(x.name)}（$H(${df})=${tex2(x.h)}$，$${holmMath(x.pAdjusted)}$，$\\varepsilon^2=${tex3(x.epsilonSquared)}$，${epsilonBand(x.epsilonSquared)}）上，${quote(result.groups[hi[0]].label)}均值最高（${f2(hi[1])}），${quote(result.groups[lo[0]].label)}最低（${f2(lo[1])}）`;
  };
  return {
    text: `为同时比较不同${literal(group)}受访者在 ${d} 个评价维度上的差异，对每个维度作 Kruskal–Wallis 秩和检验（不要求正态分布，含并列校正），以 $\\varepsilon^2$ 衡量差异大小，并以 Holm 法校正 ${d} 次检验带来的多重比较：`,
    formulas: ['H=\\frac{12}{N(N+1)}\\sum_{g=1}^{G}\\frac{R_g^{2}}{n_g}-3(N+1)', '\\varepsilon^{2}=\\frac{H}{N-1}', 'p_{(i)}^{\\mathrm{Holm}}=\\max_{j\\le i}\\min\\left\\{1,\\,(m-j+1)\\,p_{(j)}\\right\\}'],
    where: '式中，$N$ 为有效样本量，$G$ 为组数，$n_g$ 与 $R_g$ 分别为第 $g$ 组的人数与秩和，有并列值时 $H$ 再除以并列校正因子；$\\varepsilon^2$ 取值 0～1，约 0.01、0.08、0.26 分别对应较小、中等、较大的差异；$m$ 为检验次数，$p_{(j)}$ 为第 $j$ 小的原始 p 值。',
    table: {
      caption: `不同${literal(group)}受访者各评价维度均值与差异检验汇总表`,
      headers: ['评价维度', ...result.groups.map(g => `${literal(g.label)}（n = ${g.n}）`), 'H', 'p（Holm）', 'ε²'],
      rows: result.dimensions.map(x => [literal(x.name), ...x.means.map(f2), f2(x.h), pCell(x.pAdjusted), f3(x.epsilonSquared)]),
      note: `注：表中为各组均值；$H$ 的自由度为 ${df}，p 值经 Holm 法校正；$n=${result.n}$。`,
    },
    reading: `${lead(refs)}${differing.length ? `校正多重比较后，在${differing.map(describe).join('；')}` : `校正多重比较后，各评价维度在不同${literal(group)}之间的差异均未达到 0.05 的显著性水平`}。`
      + (differing.length && similar.length ? `${names(similar.map(x => x.name))}在各组之间没有显著差异。` : '')
      + '组间差异只说明不同人群的评价不同，不能据此认为分组本身是差异的原因。',
  };
}

/** Each rating item's whole answer distribution, for a "描述性统计" section. */
export function likertWriting(result: LikertDistribution, refs: ResultRefs = {}): MethodWriting {
  const L = result.levels.length, low = result.levels[0], high = result.levels.at(-1)!, mid = (low + high) / 2;
  const topLevels = result.levels.filter(l => l > mid), bottomLevels = result.levels.filter(l => l < mid);
  const bottom = (x: LikertDistribution['items'][number]) => x.shares.reduce((s, v, i) => s + (result.levels[i] < mid ? v : 0), 0);
  const ranked = [...result.items].sort((a, b) => b.top - a.top), weak = result.items.filter(x => bottom(x) >= 0.2);
  return {
    text: `为呈现各评价维度的作答全貌而不只看均值，统计每个题项在 ${L} 级量表各等级上的作答比例，并计算均值与高分占比：`,
    formulas: ['p_{kl}=\\frac{n_{kl}}{n_k},\\qquad \\bar{x}_k=\\sum_{l}l\\,p_{kl}', 'T_k=\\sum_{l>c}p_{kl}'],
    where: `式中，$n_{kl}$ 为第 $k$ 题选择第 $l$ 级的人数，$n_k$ 为该题有效作答数，$c$ 为量表中点（${mid}），$T_k$ 为高分（${topLevels.join('、')} 分）占比。`,
    table: {
      caption: '各评价维度作答分布表',
      headers: ['题项', ...result.levels.map(l => `${l} 分`), '均值', '高分占比'],
      rows: result.items.map(x => [literal(x.name), ...x.shares.map(percent), f2(x.mean), percent(x.top)]),
      note: `注：比例以各题有效作答为分母；高分指 ${topLevels.join('、')} 分；$n=${result.n}$。`,
    },
    reading: `${lead(refs)}高分占比最高的是${quote(ranked[0].name)}（${percent(ranked[0].top)}，均值 ${f2(ranked[0].mean)}），最低的是${quote(ranked.at(-1)!.name)}（${percent(ranked.at(-1)!.top)}，均值 ${f2(ranked.at(-1)!.mean)}）。`
      + (weak.length ? `${names(weak.map(x => x.name))}选择 ${bottomLevels.join('、')} 分的比例不低于 20%（${weak.map(x => percent(bottom(x))).join('、')}），评价分化较明显，是均值掩盖的薄弱处。` : `各题选择 ${bottomLevels.join('、')} 分的比例均低于 20%，低分评价较少。`),
  };
}

/** Spearman correlations between every pair of dimensions, for a "相关分析" section. */
export function correlationWriting(result: SpearmanMatrix, refs: ResultRefs = {}): MethodWriting {
  const m = result.variables.length, tests = result.pairs.length, label = (i: number) => `（${i + 1}）`;
  const ranked = [...result.pairs].sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)), significant = result.pairs.filter(p => p.pAdjusted < 0.05);
  const pair = (p: SpearmanMatrix['pairs'][number]) => `${quote(result.variables[p.a])}与${quote(result.variables[p.b])}（$\\rho=${tex3(p.rho)}$，$${holmMath(p.pAdjusted)}$）`;
  const cell = (a: number, b: number) => { const p = result.pairs.find(x => x.a === Math.min(a, b) && x.b === Math.max(a, b))!; return `${f3(p.rho)}${stars(p.pAdjusted)}`; };
  return {
    text: `为考察各评价维度之间的关联结构，计算两两之间的 Spearman 秩相关系数（以平均秩处理并列值），并以 Holm 法校正 ${tests} 次检验带来的多重比较：`,
    formulas: ['\\rho_{ab}=\\frac{\\sum_{i}(r_{ai}-\\bar{r}_a)(r_{bi}-\\bar{r}_b)}{\\sqrt{\\sum_{i}(r_{ai}-\\bar{r}_a)^{2}\\sum_{i}(r_{bi}-\\bar{r}_b)^{2}}}', 't=\\rho\\sqrt{\\frac{n-2}{1-\\rho^{2}}}'],
    where: '式中，$r_{ai}$ 为第 $i$ 位受访者在变量 $a$ 上的秩，$\\bar{r}_a$ 为平均秩；统计量 $t$ 近似服从自由度为 $n-2$ 的 $t$ 分布。$\\lvert\\rho\\rvert$ 约 0.1、0.3、0.5 分别对应弱、中等、强的关联；相关只说明两者同向或反向变化，不说明因果。',
    table: {
      caption: '各评价维度 Spearman 相关系数矩阵表',
      headers: ['变量', ...result.variables.slice(0, -1).map((_, i) => label(i))],
      rows: result.variables.map((v, i) => [`${label(i)}${literal(v)}`, ...result.variables.slice(0, -1).map((_, j) => (j < i ? cell(i, j) : j === i ? '1' : ''))]),
      note: `注：下三角为 Spearman 秩相关系数；*、**、*** 分别表示 Holm 校正后 $p<0.05$、$p<0.01$、$p<0.001$；$n=${result.n}$。`,
    },
    reading: `${lead(refs)}${m} 个维度两两之间的相关系数在 $${tex3(Math.min(...result.pairs.map(p => p.rho)))}$～$${tex3(Math.max(...result.pairs.map(p => p.rho)))}$ 之间，校正后 ${significant.length} / ${tests} 对达到 0.05 的显著性水平。`
      + `关联最强的是${ranked.slice(0, Math.min(3, ranked.length)).map(pair).join('、')}，属${rhoBand(ranked[0].rho)}关联；`
      + `最弱的是${pair(ranked.at(-1)!)}。`
      + (Math.abs(ranked[0].rho) < 0.5 ? '各维度之间至多为中等关联，说明它们反映服务的不同侧面，可以分别评估与改进。' : '关联较强的维度在受访者评价中相伴变化，改进时宜统筹考虑。'),
  };
}
