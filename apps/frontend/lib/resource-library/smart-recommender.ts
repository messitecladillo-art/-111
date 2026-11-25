/**
 * Context- and snapshot-aware recommendation engine for the Resource Library.
 *
 * Scores charts, Booktabs tables, framework diagrams, and county fieldwork
 * landmarks against:
 *  1) Active report `quality.results` methods & diagnostic flags (VIF/HC3/skew/reversal),
 *  2) Domain & modeling keywords extracted from title, subtitle, and section text,
 *  3) Chinese administrative place names referenced in title/subtitle.
 */
import type { EditorContent } from '../editor-model.ts';
import type { ResultSnapshot } from '../research-quality.ts';
import { CHART_CATALOG, type ResourceChartItem } from './chart-catalog.ts';
import {
  getAllCuratedProfiles,
  getCountyProfile,
  searchCountyGazetteer,
  type CountyGazetteerProfile,
} from './china-county-gazetteer.ts';
import { DIAGRAM_CATALOG, type ResourceDiagramItem } from './diagram-catalog.ts';
import { COUNTY_EXACT_LANDMARKS } from './landmark-illustrations.ts';
import { TABLE_CATALOG, type ResourceTableTemplate } from './table-catalog.ts';
import { VISUAL_CATALOG, type VisualCatalogItem } from './visual-catalog.ts';

export interface RecommendedEntry<T> {
  item: T;
  score: number;
  reasonBadge: string;
}

export interface SmartRecommendationBundle {
  charts: RecommendedEntry<ResourceChartItem>[];
  tables: RecommendedEntry<ResourceTableTemplate>[];
  diagrams: RecommendedEntry<ResourceDiagramItem>[];
  infographics: RecommendedEntry<VisualCatalogItem>[];
  palettes: RecommendedEntry<VisualCatalogItem>[];
  counties: RecommendedEntry<CountyGazetteerProfile>[];
}

function collectCorpusText(content: EditorContent): string {
  const secParts = content.report.map(sec => {
    const blockText = (sec.blocks ?? [])
      .slice(0, 6)
      .map(b => b.text)
      .join(' ');
    return `${sec.title} ${blockText}`;
  });
  return `${content.title} ${content.subtitle} ${secParts.join(' ')}`.toLowerCase();
}

function addBoost(
  map: Map<string, { score: number; reason: string }>,
  ids: readonly string[],
  score: number,
  reason: string,
): void {
  for (const id of ids) {
    const prev = map.get(id);
    if (!prev || score > prev.score) {
      map.set(id, { score: (prev?.score ?? 0) + score, reason });
    } else {
      map.set(id, { score: prev.score + Math.round(score * 0.4), reason: prev.reason });
    }
  }
}

function buildSnapshotBoosts(results: readonly ResultSnapshot[]): {
  charts: Map<string, { score: number; reason: string }>;
  tables: Map<string, { score: number; reason: string }>;
  diagrams: Map<string, { score: number; reason: string }>;
} {
  const charts = new Map<string, { score: number; reason: string }>();
  const tables = new Map<string, { score: number; reason: string }>();
  const diagrams = new Map<string, { score: number; reason: string }>();

  for (const r of results) {
    const warns = (r.warnings ?? []).join(' ').toUpperCase();
    const method = (r.method ?? '').toLowerCase();

    if (warns.includes('NONPARAMETRIC') || warns.includes('SKEWED')) {
      addBoost(charts, ['chart-raincloud', 'chart-violin', 'chart-boxplot'], 42, '偏态诊断 · 非参稳健');
      addBoost(tables, ['tbl-nonparam-rank'], 45, '偏态诊断 · 非参秩检验');
    }
    if (warns.includes('HETEROSCEDASTICITY') || warns.includes('HIGH_VIF')) {
      addBoost(charts, ['chart-scatter-ci', 'chart-quantile-reg', 'chart-perm-importance'], 40, '回归诊断 · 异方差/共线性');
      addBoost(tables, ['tbl-ols-robust', 'tbl-corr-collinearity', 'tbl-robustness-matrix'], 44, '回归诊断 · 稳健标准误与岭回归');
    }
    if (warns.includes('COMMON_METHOD_BIAS')) {
      addBoost(charts, ['chart-efa-scree'], 46, '同源偏差 · Harman 检验');
      addBoost(tables, ['tbl-efa-loadings'], 46, '同源偏差 · 单因子检定');
      addBoost(diagrams, ['diag-pilot-scale-purification'], 40, '同源偏差 · 量表净化');
    }
    if (warns.includes('NON_RANDOM_RUNS')) {
      addBoost(charts, ['chart-raincloud'], 44, '游程警告 · 非随机聚集');
      addBoost(tables, ['tbl-nonparam-rank'], 44, '游程警告 · 序列稳健');
    }
    if (warns.includes('HIGH_PAIRWISE_CORRELATION')) {
      addBoost(charts, ['chart-corr-heatmap', 'chart-ale-accumulated-local'], 45, '相关矩阵 · 强共线与累积局部效应');
      addBoost(tables, ['tbl-corr-collinearity', 'tbl-robustness-matrix'], 45, '相关矩阵 · 共线排查');
    }
    if (warns.includes('SUBGROUP_SIGN_REVERSAL') || warns.includes('SIGN_REVERSAL')) {
      addBoost(charts, ['chart-subgroup-forest', 'chart-simple-slope', 'chart-split-violin'], 46, '异质性诊断 · 辛普森反转');
      addBoost(tables, ['tbl-heterogeneity-subgroup'], 46, '异质性诊断 · 子群反转');
      addBoost(diagrams, ['diag-process-serial-mod'], 42, '异质性诊断 · 调节机制');
    }

    if (method === 'spearman' || method === 'pearson') {
      addBoost(charts, ['chart-corr-heatmap', 'chart-scatter-ci'], 36, '实测匹配 · 双变量相关矩阵');
      addBoost(tables, ['tbl-corr-collinearity'], 36, '实测匹配 · 相关系数矩阵');
    } else if (method === 'logit') {
      addBoost(charts, ['chart-forest-or', 'chart-roc-auc', 'chart-calibration-curve', 'chart-calibration-belt', 'chart-decision-curve-dca'], 34, '实测匹配 · Logistic');
      addBoost(tables, ['tbl-logit-or', 'tbl-mlogit-ame'], 36, '实测匹配 · OR 优势比');
    } else if (method === 'regression') {
      addBoost(charts, ['chart-scatter-ci', 'chart-waterfall', 'chart-quantile-reg'], 30, '实测匹配 · 回归归因');
      addBoost(tables, ['tbl-ols-robust', 'tbl-robustness-matrix'], 32, '实测匹配 · 回归系数');
    } else if (method === 'alpha' || method === 'efa' || method === 'irt' || method === 'rasch') {
      addBoost(charts, ['chart-item-diag', 'chart-efa-scree', 'chart-corr-heatmap', 'chart-irt-icc', 'chart-wright-map'], 32, '实测匹配 · 信效度与IRT');
      addBoost(tables, ['tbl-reliability-citc', 'tbl-efa-loadings', 'tbl-cfa-ave-cr', 'tbl-irt-2pl-params'], 34, '实测匹配 · 信效度台账');
      addBoost(diagrams, ['diag-pilot-scale-purification', 'diag-irt-calibration'], 30, '实测匹配 · 量表净化与IRT');
    } else if (method === 'mediation' || method === 'interaction') {
      addBoost(charts, ['chart-mediation-boot', 'chart-simple-slope'], 34, '实测匹配 · 中介/调节');
      addBoost(tables, ['tbl-moderated-mediation'], 36, '实测匹配 · Bootstrap');
      addBoost(diagrams, ['diag-mediation-moderation'], 36, '实测匹配 · 路径框架');
    } else if (method === 'cluster' || method === 'ml') {
      addBoost(charts, ['chart-radar-profile', 'chart-silhouette-elbow', 'chart-lca-profile', 'chart-shapley-owen', 'chart-decision-curve-dca'], 32, '实测匹配 · 聚类与可解释建模');
      addBoost(tables, ['tbl-cluster-profile', 'tbl-lca-fit'], 32, '实测匹配 · 分群轮廓');
    } else if (method === 'groups') {
      addBoost(charts, ['chart-bar-vertical', 'chart-raincloud', 'chart-bland-altman'], 24, '实测匹配 · 组间与一致性');
      addBoost(tables, ['tbl-anova-welch', 'tbl-bland-altman-icc'], 26, '实测匹配 · 差异与ICC');
    } else if (method === 'ipa' || method === 'kano') {
      addBoost(charts, ['chart-kano-better-worse-scatter', 'chart-ipa-quadrant', 'chart-kano-quadrant'], 36, '实测匹配 · IPA/Kano');
      addBoost(tables, ['tbl-kano-better-worse-matrix', 'tbl-ipa-quadrant', 'tbl-kano-better-worse'], 36, '实测匹配 · 需求象限');
      addBoost(diagrams, ['diag-kano-ipa-priority-matrix', 'diag-kano-ipa-bridge'], 36, '实测匹配 · 优先级映射');
    } else if (method === 'rdd') {
      addBoost(charts, ['chart-rdd-local-poly', 'chart-diff-in-disc'], 40, '实测匹配 · Sharp RDD 断点识别');
      addBoost(tables, ['tbl-rdd-bandwidth-sensitivity'], 40, '实测匹配 · RDD 带宽敏感性');
      addBoost(diagrams, ['diag-rdd-manipulation-workflow'], 40, '实测匹配 · 断点密度连续检验');
    } else if (method === 'psm') {
      addBoost(charts, ['chart-psm-love-smd-panel', 'chart-psm-kde'], 40, '实测匹配 · PSM 倾向得分匹配与平衡');
      addBoost(tables, ['tbl-psm-covariate-smd', 'tbl-psm-balance'], 40, '实测匹配 · 匹配前后 SMD 检验');
      addBoost(diagrams, ['diag-psm-caliper-balance'], 40, '实测匹配 · 卡尺与共同支撑闭环');
    } else if (method === 'topsis' || method === 'entropy') {
      addBoost(charts, ['chart-topsis-closeness-rank', 'chart-ahp-consistency-radar'], 40, '实测匹配 · 熵权 TOPSIS 综合排序');
      addBoost(tables, ['tbl-entropy-topsis-weights'], 40, '实测匹配 · 信息熵权与贴近度表');
      addBoost(diagrams, ['diag-entropy-topsis-pipeline'], 40, '实测匹配 · 多指标赋权评价链路');
    } else if (method === 'iv' || method === '2sls') {
      addBoost(charts, ['chart-iv-2sls-first-stage'], 40, '实测匹配 · IV-2SLS 弱工具检验');
      addBoost(tables, ['tbl-iv-2sls-weak-inst'], 40, '实测匹配 · Kleibergen-Paap F 诊断');
      addBoost(diagrams, ['diag-iv-2sls-exclusion'], 40, '实测匹配 · 工具变量排他性识别');
    } else if (method === 'ab' || method === 'experiment' || method === 'sequential') {
      addBoost(charts, ['chart-ab-sequential-pvalue'], 40, '实测匹配 · 序贯 A/B 实验监控');
      addBoost(tables, ['tbl-ab-test-sequential-lift'], 40, '实测匹配 · 分层转化率与护栏表');
      addBoost(diagrams, ['diag-ab-testing-guardrails'], 40, '实测匹配 · 正交分流与 SRM 熔断');
    } else if (method === 'garch' || method === 'volatility') {
      addBoost(charts, ['chart-garch-volatility-cone'], 40, '实测匹配 · GARCH 条件波动率锥');
      addBoost(tables, ['tbl-garch-vol-persistence'], 40, '实测匹配 · 波动持续性与 LM 检验');
    } else if (method === 'cbam' || method === 'tariff') {
      addBoost(tables, ['tbl-carbon-cbam-tariff-sim'], 40, '实测匹配 · CBAM 隐含碳税模拟');
      addBoost(diagrams, ['diag-cbam-carbon-border'], 40, '实测匹配 · 绿电认证与碳边境传导');
    } else if (method === 'scm' || method === 'synth') {
      addBoost(charts, ['chart-counterfactual-synthetic-ctrl'], 40, '实测匹配 · SCM 合成控制反事实');
      addBoost(tables, ['tbl-synthetic-control-weights'], 40, '实测匹配 · 供体权重与安慰剂检验');
      addBoost(diagrams, ['diag-synthetic-control-donor'], 40, '实测匹配 · 合成控制供体优化路径');
    } else if (method === 'gwr' || method === 'mgwr') {
      addBoost(charts, ['chart-spatial-gwr-coef-surface'], 40, '实测匹配 · 空间 GWR 局域非平稳');
      addBoost(tables, ['tbl-spatial-gwr-diagnostics'], 40, '实测匹配 · OLS vs GWR AICc 诊断');
      addBoost(diagrams, ['diag-gwr-spatial-nonstationarity'], 40, '实测匹配 · 多尺度空间带宽映射');
    } else if (method === 'markov') {
      addBoost(charts, ['chart-markov-state-transition'], 40, '实测匹配 · 马尔可夫链状态转移');
      addBoost(tables, ['tbl-markov-transition-matrix'], 40, '实测匹配 · 转移概率与稳态分布表');
    } else if (method === 'lasso' || method === 'ridge') {
      addBoost(charts, ['chart-ridge-lasso-path'], 40, '实测匹配 · Lasso/Ridge 正则化路径');
      addBoost(tables, ['tbl-lasso-cv-feature-select'], 40, '实测匹配 · 交叉验证稀疏筛选表');
    } else if (method === 'moderation') {
      addBoost(charts, ['chart-moderated-slopes-jn'], 40, '实测匹配 · Johnson-Neyman 调节斜率');
      addBoost(tables, ['tbl-moderation-simple-slopes'], 40, '实测匹配 · 简单斜率分化三线表');
      addBoost(diagrams, ['diag-mediation-moderation-sem'], 40, '实测匹配 · 中介与调节交互框架');
    } else if (method === 'cs-did' || method === 'staggered' || method === 'bacon') {
      addBoost(charts, ['chart-cs-group-time-att', 'chart-bacon-decomp-2x2'], 40, '实测匹配 · 交错多期 DID');
      addBoost(tables, ['tbl-cs-staggered-did', 'tbl-cs-did-group-time'], 40, '实测匹配 · 组别—时期 ATT');
      addBoost(diagrams, ['diag-staggered-did-cs'], 40, '实测匹配 · 交错试点因果路径');
    } else if (method === 'sdid') {
      addBoost(charts, ['chart-sdid-weights', 'chart-synthetic-did-unit-weights'], 38, '实测匹配 · 合成双重差分');
      addBoost(tables, ['tbl-sdid-weights'], 38, '实测匹配 · 单位—时期权重');
      addBoost(diagrams, ['diag-sdid-identification'], 38, '实测匹配 · SDID 识别逻辑');
    } else if (method === 'causal' || method === 'did' || method === 'its' || method === 'oster') {
      addBoost(charts, ['chart-did-event', 'chart-dag-backdoor', 'chart-its-interrupted-ts', 'chart-psm-kde', 'chart-oster-delta-bounds'], 34, '实测匹配 · 因果推断');
      addBoost(tables, ['tbl-did-parallel', 'tbl-its-segmented', 'tbl-esg-green-did', 'tbl-psm-balance', 'tbl-oster-coefficient-stability'], 34, '实测匹配 · 准实验');
      addBoost(diagrams, ['diag-did-quasi-experiment', 'diag-psm-iv-endogeneity'], 34, '实测匹配 · 因果识别');
    } else if (method === 'hlm' || method === 'multilevel') {
      addBoost(charts, ['chart-hlm-random-slopes'], 36, '实测匹配 · 跨层 HLM');
      addBoost(tables, ['tbl-hlm-multilevel'], 36, '实测匹配 · 多层线性模型');
      addBoost(diagrams, ['diag-hlm-nested-mech'], 36, '实测匹配 · 跨层次机理');
    } else if (method === 'portfolio' || method === 'finance' || method === 'risk') {
      addBoost(charts, ['chart-markowitz-frontier', 'chart-cvar-tail-loss', 'chart-decision-curve-dca'], 36, '实测匹配 · 组合与尾部风险');
      addBoost(diagrams, ['diag-quant-portfolio-risk'], 34, '实测匹配 · 量化风控闭环');
    } else if (method === 'reliability' || method === 'queue' || method === 'weibull') {
      addBoost(charts, ['chart-weibull-bathtub', 'chart-mm-c-queue-latency'], 34, '实测匹配 · 可靠性与排队');
      addBoost(tables, ['tbl-weibull-aft'], 34, '实测匹配 · 寿命与失效');
    } else if (method === 'competing' || method === 'cif' || method === 'survival') {
      addBoost(charts, ['chart-kaplan-competing-risk', 'chart-competing-cif', 'chart-rmst-survival-diff', 'chart-swimmer-clinical-lane'], 36, '实测匹配 · 生存/竞争风险');
      addBoost(tables, ['tbl-competing-risk-shr', 'tbl-competing-risks'], 36, '实测匹配 · Fine-Gray sHR');
      addBoost(diagrams, ['diag-competing-cohort'], 34, '实测匹配 · 多结局队列');
    } else if (method === 'spatial' || method === 'sdm' || method === 'sar' || method === 'lisa') {
      addBoost(charts, ['chart-spatial-lisa-quadrant', 'chart-spatial-sar-impacts', 'chart-moran-scatter', 'chart-lisa-cluster'], 36, '实测匹配 · 空间溢出与 LISA');
      addBoost(tables, ['tbl-spatial-lisa-quadrants', 'tbl-spatial-durbin'], 36, '实测匹配 · 空间计量与聚类');
      addBoost(diagrams, ['diag-spatial-w-spillover', 'diag-spatial-spillover'], 34, '实测匹配 · 空间溢出矩阵');
    } else if (method === 'var' || method === 'irf' || method === 'timeseries') {
      addBoost(charts, ['chart-var-irf'], 36, '实测匹配 · VAR 脉冲响应');
      addBoost(tables, ['tbl-var-granger'], 34, '实测匹配 · Granger 因果');
    } else if (method === 'pareto' || method === 'optimization' || method === 'control') {
      addBoost(charts, ['chart-pareto-front-3d-proj', 'chart-pareto-parallel', 'chart-bode-dual', 'chart-smith-impedance-chart'], 36, '实测匹配 · 多目标与控制');
      addBoost(tables, ['tbl-pareto-multiobj-ablation', 'tbl-pareto-knees'], 36, '实测匹配 · Pareto 前沿消融');
      addBoost(diagrams, ['diag-closedloop-control'], 34, '实测匹配 · 闭环控制系统');
    } else if (method === 'dea' || method === 'tfp') {
      addBoost(tables, ['tbl-dea-malmquist-tfp'], 36, '实测匹配 · 全要素生产率');
    } else if (method === 'wtp' || method === 'dce' || method === 'choice' || method === 'cvm' || method === 'turnbull') {
      addBoost(tables, ['tbl-choice-wtp', 'tbl-cvm-turnbull-wtp'], 36, '实测匹配 · 选择与双界 WTP');
      addBoost(diagrams, ['diag-cvm-double-bounded-routing'], 36, '实测匹配 · 双界二分投标路由');
    } else if (method === 'epidemic' || method === 'sir' || method === 'seir') {
      addBoost(charts, ['chart-seir-compartment', 'chart-lexis-diagram', 'chart-phase-portrait'], 34, '实测匹配 · 传染病动力学');
    } else if (method === 'fsqca' || method === 'qca') {
      addBoost(tables, ['tbl-fsqca-truth-configurations'], 36, '实测匹配 · fsQCA 真值表');
      addBoost(diagrams, ['diag-grounded-fsqca'], 36, '实测匹配 · fsQCA 组态并发');
    } else if (method === 'conformal') {
      addBoost(charts, ['chart-conformal-interval-fan', 'chart-conformal-interval-band'], 40, '实测匹配 · 共形预测区间');
      addBoost(tables, ['tbl-conformal-coverage-band'], 40, '实测匹配 · 共形覆盖率审计');
      addBoost(diagrams, ['diag-conformal-uncertainty-gate'], 40, '实测匹配 · 不确定性拒识门控');
    } else if (method === 'uplift' || method === 'cate' || method === 'ale') {
      addBoost(charts, ['chart-uplift-qini-curve', 'chart-ale-accumulated-local'], 40, '实测匹配 · Uplift/可解释效应');
      addBoost(tables, ['tbl-uplift-cate-deciles'], 40, '实测匹配 · CATE 十分位增益');
      addBoost(diagrams, ['diag-causal-forest-uplift'], 40, '实测匹配 · 因果森林干预分层');
    } else if (method === 'rcs' || method === 'spline' || method === 'rmst') {
      addBoost(charts, ['chart-restricted-cubic-spline', 'chart-rmst-survival-diff'], 36, '实测匹配 · RCS 样条/RMST');
    } else if (method === 'lgmm' || method === 'growth') {
      addBoost(charts, ['chart-latent-growth-trajectory'], 36, '实测匹配 · LGMM 纵向轨迹');
      addBoost(tables, ['tbl-lgmm-class-enumeration'], 36, '实测匹配 · LGMM 类别枚举');
      addBoost(diagrams, ['diag-lgmm-longitudinal-panel'], 36, '实测匹配 · 纵向潜增长机制');
    } else if (method === 'spc' || method === 'cusum' || method === 'ewma' || method === 'qc') {
      addBoost(charts, ['chart-cusum-ewma-control'], 36, '实测匹配 · CUSUM/EWMA 质控');
      addBoost(tables, ['tbl-cusum-spc-audit'], 36, '实测匹配 · 统计过程控制台账');
      addBoost(diagrams, ['diag-spc-cusum-telemetry'], 36, '实测匹配 · 现场漂移预警链路');
    } else if (method === 'sfa' || method === 'frontier') {
      addBoost(tables, ['tbl-stochastic-frontier-sfa'], 36, '实测匹配 · 随机前沿 SFA');
    } else if (method === 'meta' || method === 'sucra' || method === 'nma') {
      addBoost(tables, ['tbl-network-meta-sucra'], 36, '实测匹配 · 网状 Meta SUCRA');
      addBoost(diagrams, ['diag-network-meta-evidence'], 36, '实测匹配 · 循证合成路线');
    } else if (method === 'nyquist' || method === 'mpc') {
      addBoost(charts, ['chart-nyquist-stability-locus'], 36, '实测匹配 · Nyquist/MPC 控制');
      addBoost(diagrams, ['diag-mpc-receding-horizon'], 36, '实测匹配 · 滚动时域闭环');
    } else if (method === 'inequality' || method === 'gini') {
      addBoost(charts, ['chart-lorenz-gini'], 34, '实测匹配 · 分布公平性');
      addBoost(tables, ['tbl-gini-theil-decomp'], 34, '实测匹配 · 基尼与泰尔分解');
    } else if (method === 'carbon' || method === 'esg' || method === 'v2g' || method === 'energy') {
      addBoost(charts, ['chart-kuznets-ekc', 'chart-kaya-carbon-bridge', 'chart-taylor-diagram', 'chart-duck-curve-dispatch'], 34, '实测匹配 · 双碳/V2G 负荷');
      addBoost(tables, ['tbl-esg-green-did', 'tbl-v2g-storage-lcoe'], 34, '实测匹配 · ESG 与储能 LCOS');
      addBoost(diagrams, ['diag-carbon-lca-boundary', 'diag-v2g-virtual-powerplant'], 34, '实测匹配 · 碳核算与虚拟电厂');
    } else if (method === 'bayesian' || method === 'mcmc') {
      addBoost(charts, ['chart-mcmc-trace-rhat'], 36, '实测匹配 · MCMC 收敛诊断');
      addBoost(tables, ['tbl-bayesian-mcmc-rhat'], 36, '实测匹配 · 贝叶斯 CrI/R̂');
      addBoost(diagrams, ['diag-bayesian-hierarchical-workflow'], 36, '实测匹配 · 贝叶斯多层框架');
    } else if (method === 'quantile' || method === 'qreg') {
      addBoost(charts, ['chart-quantile-process-band', 'chart-quantile-reg'], 36, '实测匹配 · 分位数回归过程');
      addBoost(tables, ['tbl-quantile-process-tau', 'tbl-quantile-reg'], 36, '实测匹配 · 分位点系数矩阵');
    } else if (method === 'tsa' || method === 'sequential') {
      addBoost(charts, ['chart-trial-sequential-tsa'], 36, '实测匹配 · TSA 序贯界值');
      addBoost(tables, ['tbl-tsa-ris-sequential'], 36, '实测匹配 · 期望样本 RIS');
      addBoost(diagrams, ['diag-tsa-sequential-boundary'], 36, '实测匹配 · 停试门控流程');
    } else if (method === 'bertopic' || method === 'nlp' || method === 'rag' || method === 'graphrag') {
      addBoost(charts, ['chart-prompt-eval-radar-diff', 'chart-bertopic-intertopic', 'chart-rag-latency-pareto'], 38, '实测匹配 · 语义检索多维评测');
      addBoost(tables, ['tbl-bertopic-ctfidf-coherence', 'tbl-ragas-eval-ablation'], 36, '实测匹配 · 主题一致性与检索消融');
      addBoost(diagrams, ['diag-multiagent-critic-loop', 'diag-graphrag-community-pipeline', 'diag-llm-bertopic-dual'], 38, '实测匹配 · 多跳检索与文本挖掘');
    } else if (method === 'markov' || method === 'transition' || method === 'schedule' || method === 'cpm') {
      addBoost(charts, ['chart-markov-transition-chord', 'chart-gantt-critical-path'], 36, '实测匹配 · 状态转移与关键路径');
    } else if (method === 'quantum' || method === 'bloch') {
      addBoost(charts, ['chart-bloch-quantum-fidelity'], 36, '实测匹配 · 量子保真与退相干');
    } else if (method === 'orderbook' || method === 'microstructure') {
      addBoost(charts, ['chart-order-book-depth'], 36, '实测匹配 · 限价订单簿微结构');
      addBoost(diagrams, ['diag-quant-microstructure-backtest'], 36, '实测匹配 · 高频微观回测框架');
    } else if (method === 'actuarial' || method === 'gig') {
      addBoost(tables, ['tbl-gig-worker-social-actuarial'], 36, '实测匹配 · 灵工社保精算平衡');
    } else if (method === 'bullwhip' || method === 'inventory' || method === 'supply') {
      addBoost(charts, ['chart-bullwhip-echelon-var'], 36, '实测匹配 · 牛鞭效应放大比');
      addBoost(tables, ['tbl-bullwhip-inventory-sim'], 36, '实测匹配 · 多级库存仿真');
      addBoost(diagrams, ['diag-bullwhip-twin-damping'], 36, '实测匹配 · 数字孪生平抑');
    } else if (method === 'bridge' || method === 'network') {
      addBoost(charts, ['chart-symptom-bridge-ei', 'chart-psych-network'], 36, '实测匹配 · 构念桥接网络');
    } else if (method === 'sc' || method === 'synthetic') {
      addBoost(charts, ['chart-sc-donor-convex', 'chart-synthetic-control'], 36, '实测匹配 · 合成控制凸包');
    } else if (method === 'par') {
      addBoost(diagrams, ['diag-par-community-codesign'], 36, '实测匹配 · 参与式行动研究');
    }
  }
  return { charts, tables, diagrams };
}

interface VisualDomainRule {
  re: RegExp;
  ids: readonly string[];
  score: number;
  reason: string;
}

const PALETTE_DOMAIN_RULES: readonly VisualDomainRule[] = [
  { re: /医院|临床|患者|病房|护理|医疗|卫健|诊疗/u, ids: ['palette-lancet-nejm-clinical', 'palette-epi-public-health'], score: 42, reason: '领域配色 · 临床与公共卫生' },
  { re: /养老|银发|老龄|康养|独居|陪护/u, ids: ['palette-demography-aging-silver', 'palette-lancet-nejm-clinical'], score: 34, reason: '领域配色 · 银发康养调研' },
  { re: /金融|信贷|投资|组合|夏普|风险|银行|保险|VaR/iu, ids: ['palette-finance-wallstreet-graphite', 'palette-aer-qje-econometrics'], score: 42, reason: '领域配色 · 金融与量化风控' },
  { re: /双碳|碳排|新能源|绿电|光伏|氢能|环保|生态|污染/u, ids: ['palette-esg-carbon-energy', 'palette-nature-science-ecology'], score: 42, reason: '领域配色 · 双碳能源与生态' },
  { re: /经济|消费|商业|电商|市场|贸易|回归|计量/u, ids: ['palette-aer-qje-econometrics', 'palette-finance-wallstreet-graphite'], score: 32, reason: '领域配色 · 经管计量期刊' },
  { re: /乡村|三农|农户|粮食|农业|振兴/u, ids: ['palette-rural-agri-earth', 'palette-culture-tourism-celadon'], score: 38, reason: '领域配色 · 三农与县域经济' },
  { re: /人工智能|大模型|算法|神经网络|RAG|SHAP|机器学习|NLP/iu, ids: ['palette-neurips-icml-ai', 'palette-ieee-aerospace-cyber'], score: 40, reason: '领域配色 · 计算科学与智能系统' },
  { re: /供应链|物流|排队|配送|低空|运筹/u, ids: ['palette-supplychain-or-logistics', 'palette-ieee-aerospace-cyber'], score: 38, reason: '领域配色 · 运筹与韧性供应链' },
  { re: /文旅|非遗|景区|文创|茶旅|博物馆|古镇|建筑/u, ids: ['palette-culture-tourism-celadon', 'palette-heritage-arch-museum'], score: 40, reason: '领域配色 · 文旅非遗与文博' },
  { re: /城市|交通|地铁|公交|规划|空间/u, ids: ['palette-urban-gis-transit', 'palette-supplychain-or-logistics'], score: 38, reason: '领域配色 · 城市空间与交通' },
  { re: /政务|基层治理|法律|政策|公众|舆情|传播/u, ids: ['palette-governance-law-crimson', 'palette-digital-platform-comm'], score: 36, reason: '领域配色 · 公共治理与传播' },
  { re: /盲审|色盲|黑白|无障碍|CUD/iu, ids: ['palette-cud-accessible-print'], score: 44, reason: '印前校色 · 无障碍安全色板' },
  { re: /半导体|芯片|光刻|晶圆|集成电路|EDA/iu, ids: ['palette-semiconductor-eda-silicon'], score: 46, reason: '领域配色 · 集成电路与硬科技' },
  { re: /海洋|蓝碳|渔业|红树林|海岛|远洋/u, ids: ['palette-marine-oceanography-abyssal'], score: 44, reason: '领域配色 · 海洋科学与蓝碳' },
  { re: /量子|光子|激光|光电子|科学仪器/u, ids: ['palette-quantum-photonics-violet'], score: 44, reason: '领域配色 · 量子计算与光子学' },
  { re: /种业|育种|种质|良种|南繁|盐碱地/u, ids: ['palette-agri-seed-germplasm', 'palette-rural-agri-earth'], score: 44, reason: '领域配色 · 现代种业与生物育种' },
  { re: /助推|行为经济|Nudge|RCT|默认选项|框架效应/iu, ids: ['palette-behavioral-nudge-amber'], score: 44, reason: '领域配色 · 行为助推与田野实验' },
  { re: /人口迁移|流动人口|城镇化|返乡|市民化|落户/u, ids: ['palette-demography-migration-ochre', 'palette-urban-gis-transit'], score: 44, reason: '领域配色 · 人口迁徙与城镇化' },
  { re: /考古|简牍|古籍|遗址|口述史|金石/u, ids: ['palette-sinology-archaeology-bronze', 'palette-heritage-arch-museum'], score: 44, reason: '领域配色 · 考古简牍与古籍活化' },
  { re: /应急|防灾|减灾|韧性城市|避险|灾害/u, ids: ['palette-disaster-resilience-command'], score: 46, reason: '领域配色 · 应急管理与韧性城市' },
  { re: /脑科学|神经影像|磁共振|fMRI|神经元|脑电/iu, ids: ['palette-biomed-neuroscience-cobalt'], score: 48, reason: '领域配色 · 生物医学与神经影像' },
  { re: /航天|卫星|遥感|近地轨道|运载火箭|深空/u, ids: ['palette-aerospace-orbital-titanium'], score: 48, reason: '领域配色 · 航天遥感与轨道工程' },
  { re: /金融科技|加密货币|区块链|高频量化|DeFi|数字货币/iu, ids: ['palette-fintech-crypto-emerald'], score: 48, reason: '领域配色 · 金融科技与量化风控' },
  { re: /反垄断|司法裁判|知识产权|行政诉讼|规制经济学|合规审计/u, ids: ['palette-law-antitrust-slate'], score: 48, reason: '领域配色 · 法学实证与反垄断规制' },
  { re: /运动生物力学|体能遥测|马拉松|竞技训练|步态|肌电/u, ids: ['palette-sports-biomech-vermilion'], score: 48, reason: '领域配色 · 运动生物力学与竞技遥测' },
  { re: /语料库|计算语言学|句法依存|多语种|词向量|翻译学/u, ids: ['palette-linguistics-corpus-indigo'], score: 48, reason: '领域配色 · 计算语言学与语料库' },
  { re: /流域水土|林下经济|林业生态|森林碳汇|护林/u, ids: ['palette-forestry-watershed-moss'], score: 48, reason: '领域配色 · 林学流域水土保持' },
  { re: /海运|班轮航线|集装箱航运|跨境港口|远洋航运/u, ids: ['palette-logistics-maritime-navy'], score: 48, reason: '领域配色 · 航运港口与跨境多式联运' },
  { re: /地质|矿产|勘查|岩层|稀土|页岩/u, ids: ['palette-geology-mineral-terracotta'], score: 48, reason: '领域配色 · 地质矿产勘查与岩层' },
  { re: /天文|射电望远镜|FAST|星系|深空探测/iu, ids: ['palette-astronomy-deepfield-obsidian'], score: 48, reason: '领域配色 · 深空天文与射电观测' },
  { re: /建筑学|风貌营造|包豪斯|历史街区|城市更新/u, ids: ['palette-architecture-bauhaus-ochre'], score: 48, reason: '领域配色 · 建筑学与城乡风貌营造' },
  { re: /实验心理|认知实验|情绪诱发|眼动|量表心理/u, ids: ['palette-psychology-affect-plum'], score: 48, reason: '领域配色 · 实验心理学与情感认知' },
  { re: /计算化学|催化|反应动力学|分子模拟|电化学/u, ids: ['palette-chemistry-catalysis-teal'], score: 48, reason: '领域配色 · 计算化学与催化动力学' },
  { re: /教育科学|学业追踪|义务教育|素养测评|教学改革/u, ids: ['palette-education-pedagogy-sky'], score: 48, reason: '领域配色 · 教育科学与学业追踪' },
  { re: /历史档案|方志|近代史|史料|典籍整理/u, ids: ['palette-history-chronicle-sepia'], score: 48, reason: '领域配色 · 历史档案与方志计量' },
  { re: /材料科学|高分子|复合材料|纳米材料|合金表征/u, ids: ['palette-materials-polymer-steel'], score: 48, reason: '领域配色 · 材料科学与高分子表征' },
];

const BENTO_DOMAIN_RULES: readonly VisualDomainRule[] = [
  { re: /低空|无人机|空域|即时配送|冷链/u, ids: ['info-bento-low-altitude'], score: 44, reason: '专题信息图 · 低空物流场景' },
  { re: /大模型|RAG|幻觉|人工智能|LLM|智能体/iu, ids: ['info-bento-llm-rag'], score: 44, reason: '专题信息图 · 知识问答与检索评测' },
  { re: /新能源|充电|电价|电动车|补能/u, ids: ['info-bento-ev-charging'], score: 44, reason: '专题信息图 · 潮汐补能画像' },
  { re: /医院|医共体|患者|病房|护理|医疗|卫健|诊疗|分级/u, ids: ['info-bento-county-medical'], score: 46, reason: '专题信息图 · 县域医共体对照' },
  { re: /跨境|海外仓|外贸|出海|关税/u, ids: ['info-bento-crossborder-loss'], score: 44, reason: '专题信息图 · 跨境履约拆解' },
  { re: /就业|高校|毕业生|技能|产教|职业培训/u, ids: ['info-bento-grad-mismatch'], score: 44, reason: '专题信息图 · 青年技能错配' },
  { re: /口袋公园|微更新|适老|绿地|养老|社区改造/u, ids: ['info-bento-pocket-park'], score: 40, reason: '专题信息图 · 社区适老微更新' },
  { re: /合成生物|新质生产力|绿电|碳排|化工|发酵/u, ids: ['info-bento-synbio-pilot'], score: 42, reason: '专题信息图 · 绿色中试效能' },
  { re: /非遗|古建|博物馆|文物|文旅|传统村落/u, ids: ['info-bento-heritage-twin'], score: 44, reason: '专题信息图 · 文博数字孪生' },
  { re: /农田|三农|灌溉|粮食|农业|托管|县域/u, ids: ['info-bento-smart-farmland'], score: 40, reason: '专题信息图 · 高标准农田效益' },
  { re: /直播|带货|退货|冲动消费|电商|心理契约/u, ids: ['info-bento-livestream-return'], score: 42, reason: '专题信息图 · 直播退货归因' },
  { re: /托育|生育|婴幼儿|育儿|家政|双职工/u, ids: ['info-bento-childcare-radius'], score: 44, reason: '专题信息图 · 15分钟托育圈' },
  { re: /反诈|防骗|银发金融|适老支付|电信诈骗|老年手机/u, ids: ['info-bento-silver-antifraud'], score: 46, reason: '专题信息图 · 银发金融反诈' },
  { re: /心理健康|高校心理|抑郁|焦虑筛查|辅导员|匿名求助/u, ids: ['info-bento-campus-mental-triage'], score: 46, reason: '专题信息图 · 高校心理分级分流' },
  { re: /无废社区|垃圾分类|再生资源|两网融合|碳普惠|循环社区/u, ids: ['info-bento-zerowaste-community'], score: 44, reason: '专题信息图 · 无废循环社区' },
  { re: /田头预冷|冷链|生鲜损耗|果蔬|冷库|农产品流通/u, ids: ['info-bento-coldchain-precool'], score: 46, reason: '专题信息图 · 田头预冷降损' },
  { re: /智慧港口|通关|口岸|多式联运|集装箱|海运/u, ids: ['info-bento-smart-port-customs'], score: 44, reason: '专题信息图 · 智慧港口通关' },
  { re: /罕见病|惠民保|高值创新药|共付|重疾险|医保报销/u, ids: ['info-bento-raredisease-insurance'], score: 46, reason: '专题信息图 · 罕见病三重共付' },
  { re: /再培训|职业技能|培训券|AIGC|转岗|人机协同/iu, ids: ['info-bento-ai-reskilling-voucher'], score: 44, reason: '专题信息图 · 技能转型培训券' },
  { re: /国家公园|生态补偿|野生动物|人兽冲突|自然保护区|特许经营/u, ids: ['info-bento-natpark-coexistence'], score: 46, reason: '专题信息图 · 国家公园人兽共生' },
  { re: /即时零售|闪电仓|骑手|前置仓|分钟送达/u, ids: ['info-overview-instant-retail', 'info-demographic-retail-profile', 'info-roadmap-retail-action'], score: 46, reason: '专题信息图 · 即时零售全景例图' },
  { re: /银发.*监测|居家.*照护|失能|护工|康养.*监测/u, ids: ['info-overview-silver-health', 'info-demographic-silver-profile', 'info-roadmap-silver-action'], score: 46, reason: '专题信息图 · 银发健康协防例图' },
  { re: /分群.*施策|四分群|人群分类/u, ids: ['info-summary-classification-support'], score: 44, reason: '专题信息图 · 四分群精准施策卡' },
  { re: /车网互动|V2G|虚拟电厂|峰谷放电|有序充电/iu, ids: ['info-bento-grid-v2g-storage'], score: 46, reason: '专题信息图 · 车网互动 V2G 看板' },
  { re: /客货邮|统仓共配|村级快递|乡村快递|进村/u, ids: ['info-bento-county-ecomm-cold'], score: 46, reason: '专题信息图 · 客货邮共配履约' },
  { re: /青年夜校|公共文化|非遗夜校|美育|市民艺术夜校/u, ids: ['info-bento-youth-night-school'], score: 46, reason: '专题信息图 · 城市青年夜校供给' },
  { re: /DRG|DIP|病组|药耗|平均住院日|公立医院控费/iu, ids: ['info-bento-hospital-drg-pathway'], score: 46, reason: '专题信息图 · DRG/DIP 临床控费' },
  { re: /半导体|晶圆|光刻|国产\s*EDA|EDA|集成电路|流片良率/iu, ids: ['info-bento-semiconductor-fab'], score: 48, reason: '专题信息图 · 晶圆代工与国产EDA' },
  { re: /海洋牧场|蓝碳|红树林|海洋碳汇|贝藻|深远海/u, ids: ['info-bento-ocean-blue-carbon'], score: 48, reason: '专题信息图 · 海洋牧场与蓝碳交易' },
  { re: /具身智能|人形机器人|产线协同|工人技能重构|工位替代/u, ids: ['info-bento-embodied-robotics'], score: 48, reason: '专题信息图 · 具身智能产线协同' },
  { re: /幸福院|长者助餐|助餐点|农村互助|农村养老|老年食堂/u, ids: ['info-bento-rural-elder-canteen'], score: 48, reason: '专题信息图 · 农村长者助餐点' },
  { re: /海绵城市|内涝|暴雨|避险圈|防涝|透水绿地/u, ids: ['info-bento-sponge-city-flood'], score: 48, reason: '专题信息图 · 海绵城市内涝避险' },
  { re: /南繁|生物育种|盐碱地|良种|种业|种质/u, ids: ['info-bento-nanfan-seed-tech'], score: 48, reason: '专题信息图 · 南繁生物育种' },
  { re: /新就业|职业伤害|弹性参保|骑手.*(?:参保|保障|社保)|灵活就业.*(?:社保|参保)/u, ids: ['info-bento-gig-social-security'], score: 48, reason: '专题信息图 · 新就业弹性参保' },
  { re: /跨省异地|异地就医|直接结算|双向转诊|异地医保|跨省结算/u, ids: ['info-bento-cross-prov-med'], score: 48, reason: '专题信息图 · 跨省异地就医直结' },
  { re: /CBAM|碳关税|欧盟碳边境|隐含碳|绿电溯源/iu, ids: ['info-bento-cbam-export'], score: 50, reason: '专题信息图 · CBAM 碳关税与绿电溯源' },
  { re: /长护险|长期护理|失能照护|辅具租赁|失能评级/u, ids: ['info-bento-silver-ltci'], score: 50, reason: '专题信息图 · 长护险居家照护响应' },
  { re: /微电网|光储充|需量响应|工商业储能|峰谷套利/u, ids: ['info-bento-microgrid-storage'], score: 50, reason: '专题信息图 · 园区光储充微电网调度' },
  { re: /农村直播|农产品直播|云仓履约|直播选品池|县域电商集群/u, ids: ['info-bento-rural-live-cluster'], score: 50, reason: '专题信息图 · 县域农产品直播与云仓协同' },
  { re: /Robotaxi|自动驾驶.*信任|接管焦虑|智驾|无人出租/iu, ids: ['info-bento-robotaxi-trust'], score: 50, reason: '专题信息图 · 自动驾驶接管焦虑与人机信任' },
  { re: /急诊.*分诊|大模型.*预检|医生复核|AI.*分诊|临床容错/iu, ids: ['info-bento-ai-triage-safety'], score: 50, reason: '专题信息图 · 急诊智能预检与医生复核闭环' },
  { re: /量子计算|测控硬件|稀释制冷机|量子芯片|算力云接入/u, ids: ['info-bento-quantum-supply'], score: 50, reason: '专题信息图 · 量子计算测控与算力云协同' },
  { re: /绿氢|绿氨|绿醇|海上能源走廊|港口加注|氢能船舶/u, ids: ['info-bento-green-hydrogen-port'], score: 50, reason: '专题信息图 · 绿氢氨醇海上走廊与港口加注' },
  { re: /市域快轨|TOD.*站城|轨道.*TOD|站城一体/iu, ids: ['info-bento-smart-rail-tod'], score: 50, reason: '专题信息图 · 市域快轨 TOD 站城一体开发' },
  { re: /数字人民币|mBridge|跨境清算|e-CNY|多边央行数字货币/iu, ids: ['info-bento-ecny-crossborder'], score: 50, reason: '专题信息图 · 数字人民币 mBridge 跨境清算' },
  { re: /伴随诊断|肿瘤精准|靶向测序|基因检测共付|抗肿瘤精准医疗/u, ids: ['info-bento-precision-oncology'], score: 50, reason: '专题信息图 · 肿瘤精准伴随诊断医保共付' },
  { re: /数字孪生灌区|灌区.*闸门|农业节水.*孪生|灌区水网/u, ids: ['info-bento-rural-water-twin'], score: 50, reason: '专题信息图 · 数字孪生灌区节水配水效能' },
];

function rankVisualSubset(
  items: readonly VisualCatalogItem[],
  corpusText: string,
  rules: readonly VisualDomainRule[],
  extraBoosts: ReadonlyArray<{ ids: readonly string[]; score: number; reason: string }>,
  defaultReason: (item: VisualCatalogItem) => string,
  fallbackLabel: string,
): RecommendedEntry<VisualCatalogItem>[] {
  const boosts = new Map<string, { score: number; reason: string }>();
  for (const rule of rules) {
    if (rule.re.test(corpusText)) {
      addBoost(boosts, rule.ids, rule.score, rule.reason);
    }
  }
  for (const b of extraBoosts) {
    addBoost(boosts, b.ids, b.score, b.reason);
  }
  return items
    .map((item, idx) => {
      const boost = boosts.get(item.id);
      const kwHits = item.keywords.filter(k => corpusText.includes(k.toLowerCase())).length;
      const specText = `${item.label} ${item.boardSpec?.disciplineTag ?? ''} ${item.subnote} ${item.whenToUse}`.toLowerCase();
      const domainHits = specText
        .split(/[\s·、/（）()]+/u)
        .filter(tok => tok.length >= 2 && corpusText.includes(tok)).length;
      const total = (boost?.score ?? 0) + kwHits * 7 + Math.min(domainHits, 4) * 2 - idx * 0.01;
      const reasonBadge = boost?.reason ?? (kwHits > 0 ? defaultReason(item) : fallbackLabel);
      return { item, score: total, reasonBadge };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

function rankPaletteBoards(corpusText: string, results: readonly ResultSnapshot[]): RecommendedEntry<VisualCatalogItem>[] {
  const extraBoosts: { ids: readonly string[]; score: number; reason: string }[] = [];
  for (const r of results) {
    const m = (r.method ?? '').toLowerCase();
    if (m === 'logit' || m === 'regression') {
      extraBoosts.push({ ids: ['palette-aer-qje-econometrics'], score: 8, reason: '实测适配 · 计量汇报' });
    } else if (m === 'cluster' || m === 'ml') {
      extraBoosts.push({ ids: ['palette-neurips-icml-ai'], score: 8, reason: '实测适配 · 算法画像' });
    }
  }
  return rankVisualSubset(
    VISUAL_CATALOG.filter(v => v.kind === 'palette_board'),
    corpusText,
    PALETTE_DOMAIN_RULES,
    extraBoosts,
    item => `主题配色 (${item.boardSpec?.disciplineTag ?? item.badge})`,
    '期刊标杆 · 1+1+1 克制色板',
  );
}

function rankBentoInfographics(corpusText: string): RecommendedEntry<VisualCatalogItem>[] {
  return rankVisualSubset(
    VISUAL_CATALOG.filter(v => v.kind === 'infographic' && Boolean(v.bentoArchetype)),
    corpusText,
    BENTO_DOMAIN_RULES,
    [],
    item => `场景图谱 (${item.keywords[2] ?? item.badge})`,
    '专题矢量信息图样板',
  );
}

function rankCatalogItems<T extends { id: string; title: string; keywords: readonly string[]; targetNode: string }>(
  catalog: readonly T[],
  corpusText: string,
  boosts: Map<string, { score: number; reason: string }>,
  limit: number,
  fallbackReason: string,
  extraSearchText: (item: T) => string,
): RecommendedEntry<T>[] {
  return catalog
    .map((item, idx) => {
      const boost = boosts.get(item.id);
      const kwHits = item.keywords.filter(k => corpusText.includes(k.toLowerCase())).length;
      const domainHits = extraSearchText(item)
        .toLowerCase()
        .split(/[\s·、/（）()]+/u)
        .filter(tok => tok.length >= 2 && corpusText.includes(tok)).length;
      const total = (boost?.score ?? 0) + kwHits * 8 + Math.min(domainHits, 4) * 2 - idx * 0.01;
      const reasonBadge =
        boost?.reason ?? (kwHits > 0 ? `主题匹配 (${item.keywords.find(k => corpusText.includes(k.toLowerCase())) ?? ''})` : fallbackReason);
      return { item, score: total, reasonBadge };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function matchGeographyCounties(content: EditorContent): RecommendedEntry<CountyGazetteerProfile>[] {
  const geoSurface = `${content.title} ${content.subtitle}`.trim();
  if (!geoSurface) return [];

  const picked = new Map<string, RecommendedEntry<CountyGazetteerProfile>>();
  const candidateCodes = new Set<string>(Object.keys(COUNTY_EXACT_LANDMARKS));
  for (const curated of getAllCuratedProfiles()) {
    candidateCodes.add(curated.code);
  }

  for (const code of candidateCodes) {
    const prof = getCountyProfile(code);
    if (!prof) continue;
    const countyShort = prof.name.replace(/(?:自治[区县旗]|县级市|新区|市|区|县|旗)$/u, '');
    const prefShort = prof.prefectureName.replace(/(?:自治州|地区|盟|市|直辖单元)$/u, '');
    if (countyShort.length >= 2 && geoSurface.includes(countyShort)) {
      picked.set(prof.code, { item: prof, score: 100, reasonBadge: `区县精准命中 · ${prof.name}` });
    } else if (prefShort.length >= 2 && geoSurface.includes(prefShort)) {
      if (!picked.has(prof.code)) {
        picked.set(prof.code, { item: prof, score: 70, reasonBadge: `所属地市命中 · ${prof.prefectureName}` });
      }
    }
  }

  if (picked.size === 0) {
    const tokens = geoSurface.match(/[\u4e00-\u9fa5]{2,4}/gu) ?? [];
    for (const tok of tokens) {
      if (/^(调研|报告|试点|影响|因素|机制|分析|满意度|路径|质量)$/.test(tok)) continue;
      for (const hit of searchCountyGazetteer(tok, { limit: 2 })) {
        if (!picked.has(hit.code)) {
          picked.set(hit.code, { item: hit, score: 50, reasonBadge: `地名联想 · ${hit.provinceName}` });
        }
      }
      if (picked.size >= 3) break;
    }
  }

  return [...picked.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}

export function buildSmartRecommendations(content: EditorContent): SmartRecommendationBundle {
  const results = content.quality?.results ?? [];
  const corpusText = collectCorpusText(content);
  const boosts = buildSnapshotBoosts(results);

  const charts = rankCatalogItems(
    CHART_CATALOG,
    corpusText,
    boosts.charts,
    8,
    '大赛高频标配例图',
    c => `${c.title} ${c.methodFit}`,
  );

  const tables = rankCatalogItems(
    TABLE_CATALOG,
    corpusText,
    boosts.tables,
    4,
    '国奖规范三线表骨架',
    t => `${t.title} ${t.chapterHint}`,
  );

  const diagrams = rankCatalogItems(
    DIAGRAM_CATALOG,
    corpusText,
    boosts.diagrams,
    4,
    '研究方法框架配图',
    d => `${d.title} ${d.usageSummary}`,
  );

  const infographics = rankBentoInfographics(corpusText);
  const palettes = rankPaletteBoards(corpusText, results);
  const counties = matchGeographyCounties(content);
  return { charts, tables, diagrams, infographics, palettes, counties };
}
