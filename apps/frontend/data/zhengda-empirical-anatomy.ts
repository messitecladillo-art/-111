/**
 * Empirical anatomy mined from the 2014–2025 Zhengda Cup National Award report archive
 * (N = 204 deduplicated PDFs, 18,234 total pages, 59 deep-sampled full-text structure PDFs)
 * and the 16-folder / 176-file questionnaire library, alongside the 17th-edition rubric.
 *
 * Strictly zero local filesystem paths (`C:\Users\...`), zero fabricated official claims,
 * and zero bare digits inside reusable narrative phrasing templates so LLM drafts remain
 * 100% compatible with `{F..}` / `{G..}` / `{R..}` factual placeholder gating.
 */

export interface CorpusReserveSummary {
  totalReports: number;
  rawPdfFiles: number;
  totalPages: number;
  avgPages: number;
  medianPages: number;
  minPages: number;
  maxPages: number;
  nationalFirstCount: number;
  cpPropositionCount: number;
  deepSampledDocs: number;
  surveyCategories: number;
  surveyFiles: number;
  topics2027: number;
  rubricTotalPoints: number;
  provenanceLabel: string;
}

export const CORPUS_RESERVE_SUMMARY: CorpusReserveSummary = {
  totalReports: 204,
  rawPdfFiles: 264,
  totalPages: 18234,
  avgPages: 89.4,
  medianPages: 86,
  minPages: 18,
  maxPages: 206,
  nationalFirstCount: 115,
  cpPropositionCount: 7,
  deepSampledDocs: 59,
  surveyCategories: 16,
  surveyFiles: 176,
  topics2027: 50,
  rubricTotalPoints: 100,
  provenanceLabel: '2014–2025 本地国奖 PDF 档案实证统计（N=204，可解析全文结构抽样 n=59）',
};

export interface ArchiveYearStat {
  year: number;
  count: number;
  eraTag: string;
}

export const ARCHIVE_YEAR_DISTRIBUTION: readonly ArchiveYearStat[] = [
  { year: 2014, count: 5, eraTag: '传统实地问卷期' },
  { year: 2015, count: 17, eraTag: '早期国一标杆库' },
  { year: 2016, count: 6, eraTag: '消费升级调研期' },
  { year: 2017, count: 8, eraTag: '共享经济兴起期' },
  { year: 2018, count: 3, eraTag: '多阶段抽样规范化' },
  { year: 2019, count: 8, eraTag: 'SEM 与回归普及期' },
  { year: 2020, count: 14, eraTag: '疫情线上混合调查期' },
  { year: 2021, count: 37, eraTag: '正大杯高峰扩容期' },
  { year: 2022, count: 40, eraTag: '文本挖掘与 ML 爆发' },
  { year: 2023, count: 23, eraTag: '因果推断与精致排版' },
  { year: 2024, count: 26, eraTag: '大模型与绿色转型期' },
  { year: 2025, count: 17, eraTag: '最新国奖前沿范式' },
];

export interface RubricDimension {
  id: string;
  label: string;
  points: number;
  color: string;
  keyFocus: string;
  redline: string;
}

export const OFFICIAL_RUBRIC_WEIGHTS: readonly RubricDimension[] = [
  {
    id: 'analysis',
    label: '统计分析与计量建模',
    points: 35,
    color: '#f4b942',
    keyFocus: '方法适配性（先检验假定后建模）、稳健性与异质性分组对照、统计量完备度',
    redline: '严禁无假设检验直接上复杂模型，严禁只报显著性不报效应量或边际解释',
  },
  {
    id: 'design',
    label: '调查方案与抽样设计',
    points: 28,
    color: '#4fd1c1',
    keyFocus: '目标总体与抽样框匹配、PPS/分层配额推导、设计效应 DEFF、样本量公式',
    redline: '严禁缺失抽样误差控制说明，或方便抽样冒充概率分层抽样',
  },
  {
    id: 'structure',
    label: '结构排版与对策落地',
    points: 20,
    color: '#7fb6ff',
    keyFocus: '三线表规范、图文互文严密性、痛点—实证—主体—分阶段 KPI 闭环',
    redline: '严禁假大空对策（“加强宣传、完善法规”），每条措施必须可回溯前文统计断点',
  },
  {
    id: 'execution',
    label: '调查执行、清洗与附录',
    points: 17,
    color: '#c084fc',
    keyFocus: '预调查信效度修正记录、四维清洗漏斗明细、AI 工具使用合规声明、可复现附录',
    redline: '严禁有效回收率与原始样本量前后矛盾，附件必须含完整问卷与清洗规则',
  },
];

export interface EmpiricalModelStat {
  id: string;
  name: string;
  shortName: string;
  sampleHits: number;
  sampleTotal: number;
  ratePct: number;
  tier: '基础必考' | '核心主力' | '高分进阶';
  eraTrend: '基石常青' | '稳定主力' | '近年飙升';
  primaryNode: string;
  pairedWith: string;
  antiPenaltyChecklist: readonly string[];
  reportSentenceFormula: string;
}

export const EMPIRICAL_MODEL_STATS: readonly EmpiricalModelStat[] = [
  {
    id: 'cronbach_kmo',
    name: '信效度检验 (Cronbach α · KMO · AVE/CR)',
    shortName: '信效度 α / KMO',
    sampleHits: 49,
    sampleTotal: 59,
    ratePct: 83.1,
    tier: '基础必考',
    eraTrend: '基石常青',
    primaryNode: 'data.testing',
    pairedWith: '预调研修订 + 正式量表验证',
    antiPenaltyChecklist: [
      '分别报告总表与各潜变量维度的 Cronbach α 系数与题项数',
      'KMO 取样适切性量数与 Bartlett 球形度检验显著性缺一不可',
      '删除题项必须给出删除前后的信度对比与理论依据',
    ],
    reportSentenceFormula: '量表信效度检验表明，各维度内部一致性系数处于稳健区间，取样适切性量数满足因子抽取前置条件（见{G1}）。',
  },
  {
    id: 'pps_sampling',
    name: '多阶段分层 PPS 抽样与设计效应校准',
    shortName: '分层 PPS 抽样',
    sampleHits: 41,
    sampleTotal: 59,
    ratePct: 69.5,
    tier: '基础必考',
    eraTrend: '基石常青',
    primaryNode: 'design.sampling',
    pairedWith: 'Cochran/Deff 公式 + 事后加权校准',
    antiPenaltyChecklist: [
      '写明置信度、容许误差与设计效应 DEFF 对初始样本量的放大倍数',
      '区分总体分布与目标配额，给出各层样本分配依据与实地抽样框',
      '附带预调查调整比例与最终有效回收率的闭环核算',
    ],
    reportSentenceFormula: '本研究采用多阶段分层按规模成比例抽样架构，经设计效应修正后确定目标样本规模（详见{G1}）。',
  },
  {
    id: 'text_nlp',
    name: '网络文本挖掘 (语义造型词云 · LDA · 情感分析)',
    shortName: '文本挖掘 / NLP',
    sampleHits: 40,
    sampleTotal: 59,
    ratePct: 67.8,
    tier: '核心主力',
    eraTrend: '近年飙升',
    primaryNode: 'intro.literature',
    pairedWith: '政策/社媒语料 + 开放题文本印证',
    antiPenaltyChecklist: [
      '说明分词词典（自定义领域停用词表）与主题数 k 确定依据（困惑度/一致性）',
      '文本情绪与后续问卷实证痛点相互印证，避免“为画词云而画词云”',
      '报告核心主题权重与典型关键词簇命名',
    ],
    reportSentenceFormula: '高频主题聚类与共现语义网络揭示了研究域内的核心痛点聚焦与政策关注迁徙（见{G1}）。',
  },
  {
    id: 'regression_logit',
    name: '多元线性回归 / 有序与二元 Logit 回归',
    shortName: '回归与 Logit 建模',
    sampleHits: 39,
    sampleTotal: 59,
    ratePct: 66.1,
    tier: '核心主力',
    eraTrend: '稳定主力',
    primaryNode: 'drivers.model',
    pairedWith: 'VIF 共线性诊断 + 稳健标准误 + 边际效应',
    antiPenaltyChecklist: [
      '因变量为有序量表（如愿意度 1–5 分）优先有序 Logit 并检验平行线假定',
      '同步汇报系数、稳健标准误、优势比 (OR) 与方差膨胀因子 (VIF)',
      '按核心人口/场景变量做分样本异质性回归对照，防止平均效应掩盖结构分化',
    ],
    reportSentenceFormula: '控制人口统计学协变量并采用稳健标准误估计后，核心驱动因子呈现显著正向边际贡献，共线性诊断未见异常（见{G1}）。',
  },
  {
    id: 'chi_square',
    name: '列联交叉分析与卡方独立性 / 非参数检验',
    shortName: '交叉卡方检验',
    sampleHits: 31,
    sampleTotal: 59,
    ratePct: 52.5,
    tier: '基础必考',
    eraTrend: '基石常青',
    primaryNode: 'compare.tests',
    pairedWith: 'Cramér’s V 效应量 + Kruskal-Wallis / Mann-Whitney U',
    antiPenaltyChecklist: [
      '列联表期望频数不足时自动切换 Fisher 精确检验并明确标注',
      '不仅报告 χ² 与 p 值，必须同步汇报 Cramér’s V / ε² 等效应量避免大样本假显著',
      '对正态性未满足的量表对比补充非参数 Kruskal-Wallis 检验与组间两两校正',
    ],
    reportSentenceFormula: '列联独立性检验结合效应量测度表明，不同特征群体在核心行为状态上的分布存在显著结构性分化（见{G1}）。',
  },
  {
    id: 'kmeans_cluster',
    name: 'K-means / 二阶聚类与群体精准画像',
    shortName: 'K-means 聚类画像',
    sampleHits: 23,
    sampleTotal: 59,
    ratePct: 39.0,
    tier: '核心主力',
    eraTrend: '稳定主力',
    primaryNode: 'segments.cluster',
    pairedWith: '肘部法则 / 轮廓系数 + ANOVA 类间检验 + 雷达图',
    antiPenaltyChecklist: [
      '说明聚类数 K 的选择依据（轮廓系数或 SSE 拐点）与变量标准化处理',
      '用单因素方差分析验证各簇在聚类变量上的区分效度，并赋予具象化群体命名',
      '结合人口分布列联表给出每一类人群在后续对策章节的差异化触达路径',
    ],
    reportSentenceFormula: '基于轮廓系数优选聚类数并将受访群体划分为差异显著的典型簇群，雷达图进一步刻画了各群体的诉求梯度（见{G1}）。',
  },
  {
    id: 'sem',
    name: '结构方程模型 (SEM · CFA · Bootstrap 中介调节)',
    shortName: '结构方程 SEM',
    sampleHits: 20,
    sampleTotal: 59,
    ratePct: 33.9,
    tier: '高分进阶',
    eraTrend: '稳定主力',
    primaryNode: 'drivers.model',
    pairedWith: 'CMIN/DF · CFI · RMSEA 拟合优度 + Bootstrap 路径检验',
    antiPenaltyChecklist: [
      '先做验证性因子分析 (CFA) 汇报聚合效度 (AVE, CR) 与区分效度 (Fornell-Larcker)',
      '完整列出 CMIN/DF、RMSEA、GFI、CFI、TLI 绝对与增值拟合指标',
      '中介检验采用偏差校正百分位 Bootstrap 法报告置信区间是否跨零',
    ],
    reportSentenceFormula: '结构方程模型整体拟合指标均达到适配标准，中介路径检验揭示了感知维度经由总体评价传导至行为意愿的作用链条（见{G1}）。',
  },
  {
    id: 'rf_ml',
    name: '随机森林 / XGBoost 与 SHAP 可解释性归因',
    shortName: '随机森林 / SHAP',
    sampleHits: 16,
    sampleTotal: 59,
    ratePct: 27.1,
    tier: '高分进阶',
    eraTrend: '近年飙升',
    primaryNode: 'drivers.model',
    pairedWith: '传统回归基准对照 + 特征重要性排序 + AUC/F1 交叉验证',
    antiPenaltyChecklist: [
      '明确汇报训练集/测试集划分比例、交叉验证折数与 OOB/AUC 性能指标',
      '用特征重要性图或 SHAP 蜂群图解释非线性阈值，而非仅堆砌黑箱准确率',
      '与传统 Logit 回归相互印证特征排序一致性',
    ],
    reportSentenceFormula: '非线性特征重要性排序在验证集上印证了核心体验因子对持续行为的高贡献度，并揭示出边际效应的非线性拐点（见{G1}）。',
  },
  {
    id: 'efa_pca',
    name: '探索性因子分析 (EFA) 与主成分降维 (PCA)',
    shortName: '因子/主成分降维',
    sampleHits: 14,
    sampleTotal: 59,
    ratePct: 23.7,
    tier: '核心主力',
    eraTrend: '基石常青',
    primaryNode: 'data.testing',
    pairedWith: '碎石图 + 方差最大化正交旋转 + 累计方差贡献率',
    antiPenaltyChecklist: [
      '说明因子抽取准则（特征根大于 1 或平行分析）及旋转方法（Varimax 正交或 Promax 斜交）',
      '剔除双载荷过重或共同度低于阈值的题项并给出解释',
      '使用公因子命名直接驱动后文线性回归或聚类输入变量',
    ],
    reportSentenceFormula: '经方差最大化正交旋转抽取公共因子后，旋转因子载荷矩阵结构清晰，构念收敛性与结构效度得到确认（见{G1}）。',
  },
  {
    id: 'conjoint_psm',
    name: '联合分析 (Conjoint) / 倾向得分匹配 (PSM) / 对应分析',
    shortName: 'Conjoint / PSM',
    sampleHits: 14,
    sampleTotal: 59,
    ratePct: 23.7,
    tier: '高分进阶',
    eraTrend: '近年飙升',
    primaryNode: 'drivers.model',
    pairedWith: '正交试验轮廓设计 + 属性相对重要性 + 支付意愿测算',
    antiPenaltyChecklist: [
      '联合分析必须说明正交实验缩减的全轮廓卡片数量与被试负担控制',
      'PSM 需汇报匹配前后的标准化偏差降幅与共同支撑域检验',
      '将分群效用值直接转化为产品定价、套餐组合或公共服务优先排序建议',
    ],
    reportSentenceFormula: '基于属性效用拆解与市场模拟预测，明确了不同定价与服务组合配置对目标群体选择概率的相对贡献权重（见{G1}）。',
  },
  {
    id: 'ipa_kano',
    name: '修正 IPA 四象限诊断与 KANO 需求分级模型',
    shortName: '修正 IPA / KANO',
    sampleHits: 6,
    sampleTotal: 59,
    ratePct: 10.2,
    tier: '高分进阶',
    eraTrend: '近年飙升',
    primaryNode: 'diagnosis.evaluation',
    pairedWith: '隐含重要性(相关/回归权重替代自评) + Better-Worse 系数',
    antiPenaltyChecklist: [
      '优先使用“衍生/隐含重要性”（如偏相关或标准化回归权重）替代受访者主观自评重要性，避免天花板效应',
      '清晰标出“优势保持区、重点改进区、低优先区、过度投入区”四象限均值十字线',
      '直接将“重要度高而表现度低”象限指标点名移交至第九章对策首要抓手',
    ],
    reportSentenceFormula: '将衍生重要性与实际感知表现映射至四象限诊断矩阵，精准锁定了处于高权重低表现象限的核心改进短板（见{G1}）。',
  },
  {
    id: 'ahp_topsis',
    name: '层次分析 (AHP) · 熵权 TOPSIS · 模糊综合评价',
    shortName: 'AHP / 熵权 TOPSIS',
    sampleHits: 6,
    sampleTotal: 59,
    ratePct: 10.2,
    tier: '核心主力',
    eraTrend: '稳定主力',
    primaryNode: 'plan.priority',
    pairedWith: '主观专家权重 + 客观熵权组合 + 方案优劣排序',
    antiPenaltyChecklist: [
      'AHP 判定矩阵必须给出一致性比率 CR 检验结果，确保逻辑自洽',
      '主客观组合赋权需写明综合权重公式及敏感性波动检视',
      'TOPSIS 贴近度排名需落实到具体对策项目或改进事项优先级列表',
    ],
    reportSentenceFormula: '经由一致性检验确认判断矩阵有效后，综合权重测算为后续分阶段治理方案确立了清晰资源分配序列（见{G1}）。',
  },
];

export interface VisualExhibitStat {
  id: string;
  name: string;
  sampleHits: number;
  ratePct: number;
  targetNode: string;
  targetSectionLabel: string;
  upgradeTip: string;
  commonMistake: string;
  svgKind:
    | 'action_loop'
    | 'likert_diverging'
    | 'wordcloud'
    | 'sem_forest'
    | 'tech_roadmap'
    | 'sampling_flow'
    | 'heatmap_scree'
    | 'radar_boxplot'
    | 'donut_pareto'
    | 'ipa_quadrant';
}

export const VISUAL_EXHIBIT_STATS: readonly VisualExhibitStat[] = [
  {
    id: 'action_loop',
    name: '痛点锚定—责任主体—分期 KPI 对策闭环图',
    sampleHits: 58,
    ratePct: 98.3,
    targetNode: 'plan.measures',
    targetSectionLabel: '第九章 具体可操作措施',
    upgradeTip: '用实线串联“实证断点→对策抓手→责任部门→短期/中长期核验指标”，彻底告别口号式建议',
    commonMistake: '仅罗列一二三点文字对策，未标注前文对应统计缺陷与落地验证周期',
    svgKind: 'action_loop',
  },
  {
    id: 'likert_diverging',
    name: '李克特量表发散堆叠条形图 / 均值误差棒图',
    sampleHits: 43,
    ratePct: 72.9,
    targetNode: 'sample.descriptive',
    targetSectionLabel: '第四章 核心指标分布与描述',
    upgradeTip: '按中立选项中心对齐（1–2分向左负向、4–5分向右正向），一眼识别两极分化题项',
    commonMistake: '把 12 道李克特题拆成 12 个雷同柱状图占用十页版面',
    svgKind: 'likert_diverging',
  },
  {
    id: 'wordcloud',
    name: 'Agent 语义造型文献/开放题高清矢量词云',
    sampleHits: 37,
    ratePct: 62.7,
    targetNode: 'intro.literature',
    targetSectionLabel: '第一章 国内外研究现状与主题谱系',
    upgradeTip: '贴合课题意象的矢量语义轮廓（非低端生硬矩形）+ 按政策/痛点/机制分类着色',
    commonMistake: '插入低分辨率截图词云或堆满“研究、调查、分析、发现”等未清洗停用词',
    svgKind: 'wordcloud',
  },
  {
    id: 'sem_forest',
    name: '回归森林图 / SEM 标准化路径效应图',
    sampleHits: 26,
    ratePct: 44.1,
    targetNode: 'drivers.model',
    targetSectionLabel: '第六章 影响机制与计量建模',
    upgradeTip: '用森林图直观呈现各因子的 OR/回归系数及 95% 置信区间横线与星号显著性',
    commonMistake: '只贴 SPSS/Stata 原始黑白截图，缺少标准化系数方向与边界标注',
    svgKind: 'sem_forest',
  },
  {
    id: 'tech_roadmap',
    name: '五阶段实证研究技术路线图 (Dagre 自动布局)',
    sampleHits: 23,
    ratePct: 39.0,
    targetNode: 'design.content',
    targetSectionLabel: '第二章 研究内容与技术路线',
    upgradeTip: '明确画出各阶段的输入物、统计方法工具与“模型反推修订”虚线反馈闭环',
    commonMistake: '方框箭头文字挤出边界、层次混乱、与正文实际分析步骤脱节',
    svgKind: 'tech_roadmap',
  },
  {
    id: 'sampling_flow',
    name: '多阶段 PPS 抽样与四重清洗漏斗流程图',
    sampleHits: 22,
    ratePct: 37.3,
    targetNode: 'design.sampling',
    targetSectionLabel: '第二章 抽样框、分层配额与样本清洗',
    upgradeTip: '从总体边界→PPS抽样框→配额入户→时长/注意力/直线作答剔除→有效入库全程量化',
    commonMistake: '只写抽样文字不配流程框图，或回收率与清洗剔除数无法加总闭环',
    svgKind: 'sampling_flow',
  },
  {
    id: 'heatmap_scree',
    name: '变量相关矩阵热力图 / 因子分析碎石图',
    sampleHits: 21,
    ratePct: 35.6,
    targetNode: 'compare.tests',
    targetSectionLabel: '第五章 差异检验与相关热力诊断',
    upgradeTip: '下三角展示 Pearson/Spearman 相关系数色块与显著性星号，上三角配对散点或斜率趋势',
    commonMistake: '变量过多导致字体重叠糊成一片，缺少正负相关图例色阶',
    svgKind: 'heatmap_scree',
  },
  {
    id: 'radar_boxplot',
    name: 'K-means 聚类人群多维画像雷达图 / 组间箱线图',
    sampleHits: 16,
    ratePct: 27.1,
    targetNode: 'segments.cluster',
    targetSectionLabel: '第八章 受访者分群与精准画像',
    upgradeTip: '在同一五维/六维极坐标系叠加 3 类人群均值包络线，直观对比各自长短板与决策阈值',
    commonMistake: '每个群单独画一张柱状图，评委无法横向对比簇间特征差异',
    svgKind: 'radar_boxplot',
  },
  {
    id: 'donut_pareto',
    name: '人口学双层嵌套环形图 / 痛点帕累托累计占比图',
    sampleHits: 15,
    ratePct: 25.4,
    targetNode: 'sample.profile',
    targetSectionLabel: '第四章 样本人口学结构与代表性',
    upgradeTip: '内环放核心分层（如区域/组别）、外环放细分特征，或者用帕累托图突出“二八关键痛点”',
    commonMistake: '超过 6 个分类仍用单层饼图且切片角度极细，标签重叠错位',
    svgKind: 'donut_pareto',
  },
  {
    id: 'ipa_quadrant',
    name: '修正 IPA 四象限散点诊断图',
    sampleHits: 4,
    ratePct: 6.8,
    targetNode: 'diagnosis.evaluation',
    targetSectionLabel: '第七章 绩效诊断与短板锁定',
    upgradeTip: '用回归/相关权重作 Y 轴隐含重要性，实际得分作 X 轴，虚线均值划分优先改进区与保持区',
    commonMistake: '十字阈值线随意设在量表物理中值 3.0 而非样本实测均值的“总均值交点”',
    svgKind: 'ipa_quadrant',
  },
];

export interface CanonicalThreeLineTable {
  id: string;
  title: string;
  sampleHits: number;
  ratePct: number;
  chapter: string;
  mandatoryStats: readonly string[];
  headers: readonly string[];
  sampleRows: readonly (readonly string[])[];
  tableNote: string;
  judgeRedline: string;
}

export const CANONICAL_THREE_LINE_TABLES: readonly CanonicalThreeLineTable[] = [
  {
    id: 'reliability_table',
    title: '表 3-2 预调查与正式量表信效度综合检验三线表',
    sampleHits: 49,
    ratePct: 83.1,
    chapter: '第三章 数据清洗与质量检验',
    mandatoryStats: ['题项数 (k)', 'Cronbach α', 'KMO 值', 'Bartlett χ² (p)', '组合信度 CR', '平均方差抽取 AVE'],
    headers: ['潜变量维度', '题项数', 'Cronbach α', 'KMO', 'CR', 'AVE'],
    sampleRows: [
      ['功能可达性 (F1)', '4', '0.864', '0.821', '0.872', '0.631'],
      ['交互体验度 (F2)', '5', '0.891', '0.854', '0.896', '0.634'],
      ['价值认同感 (F3)', '4', '0.842', '0.808', '0.851', '0.589'],
      ['总体量表汇总', '13', '0.918', '0.887', '—', '—'],
    ],
    tableNote: '注：Bartlett 球形度检验近似卡方值 p < 0.001；AVE 均大于 0.50、CR 均大于 0.80，收敛效度良好（示例结构）。',
    judgeRedline: '预调查删题前后必须分别汇报 α 变化，切忌“一次检验跳过修订过程”。',
  },
  {
    id: 'crosstab_table',
    title: '表 5-1 分群交叉列联与 χ² 独立性及效应量检验表',
    sampleHits: 42,
    ratePct: 71.2,
    chapter: '第五章 差异检验与相关性分析',
    mandatoryStats: ['各格频数与行百分比', 'Pearson χ² / Fisher 精确值', '自由度 df', 'p 值', 'Cramér’s V 效应量'],
    headers: ['背景分层变量', '高活跃组 n(%)', '观望体验组 n(%)', '低频潜在组 n(%)', 'χ² (p 值)', 'Cramér’s V'],
    sampleRows: [
      ['核心城市城区', '186 (41.2%)', '172 (38.1%)', '93 (20.6%)', '24.63***', '0.168'],
      ['近郊与高校片区', '98 (29.4%)', '139 (41.7%)', '96 (28.8%)', '(df=4)', '(中等效应)'],
      ['远郊县域片区', '44 (21.5%)', '76 (37.1%)', '85 (41.5%)', 'p < 0.001', '—'],
    ],
    tableNote: '注：*** 表示 p < 0.001；期望频数 <5 的单元格占比为 0%，满足 Pearson χ² 渐近适用前提（示例结构）。',
    judgeRedline: '大样本下即使微弱差异也会出现 p<0.05，必须同表附带 Cramér’s V 效应量解释实际差异强度。',
  },
  {
    id: 'regression_table',
    title: '表 6-1 核心驱动因素多元 / 有序 Logit 回归与共线性诊断表',
    sampleHits: 39,
    ratePct: 66.1,
    chapter: '第六章 影响机制与模型建构',
    mandatoryStats: ['估计系数 β', '稳健标准误 SE', 't / z 检验值', '显著性 p / 星号', 'OR 优势比', 'VIF 共线性诊断'],
    headers: ['解释变量', 'β 系数', '稳健 SE', 'z 值', 'OR (优势比)', 'VIF'],
    sampleRows: [
      ['F1 核心供给便利性', '0.418***', '0.072', '5.81', '1.519', '1.42'],
      ['F2 情绪感知质量', '0.536***', '0.081', '6.62', '1.709', '1.68'],
      ['F3 价格合理性感知', '0.214**', '0.069', '3.10', '1.239', '1.29'],
      ['控制变量 & 截距', '已控制', 'Pseudo R² = 0.312', 'LR χ² = 189.4***', 'n = 641', 'Max VIF=1.68'],
    ],
    tableNote: '注：已控制性别、年龄层、月均支出等人口学协变量；所有解释变量 VIF 均远低于 5，不存在严重多重共线性（示例结构）。',
    judgeRedline: '回归表格只给系数与 p 值不给 VIF 或稳健标准误是国二、国三常见失分点。',
  },
  {
    id: 'goodness_fit_table',
    title: '表 4-1 样本人口学结构与目标总体代表性 χ² 拟合优度表',
    sampleHits: 25,
    ratePct: 42.4,
    chapter: '第四章 样本特征与结构描述',
    mandatoryStats: ['有效样本频数与构成比', '统计年鉴/总框参照占比', 'χ² 拟合优度 p 值', '事后加权声明'],
    headers: ['人口学维度', '类别分组', '样本数 (n)', '样本占比', '总体参照占比', '拟合优度 p'],
    sampleRows: [
      ['性别结构', '女性 / 男性', '334 / 307', '52.1% / 47.9%', '51.4% / 48.6%', 'p = 0.722'],
      ['年龄分层', 'Z 世代 / 中青年 / 银发', '218 / 289 / 134', '34.0% / 45.1% / 20.9%', '32.8% / 45.5% / 21.7%', 'p = 0.648'],
    ],
    tableNote: '注：样本分布与市统计年鉴目标总体比例的拟合优度检验 p > 0.05，说明抽样无明显系统覆盖偏差（示例结构）。',
    judgeRedline: '仅仅列出男女/年龄频数不够，对照官方统计口径做一次代表性 χ² 检验可直接拉满“科学抽样”印象分。',
  },
  {
    id: 'factor_loading_table',
    title: '表 3-4 方差最大化正交旋转因子载荷矩阵与共同度表',
    sampleHits: 8,
    ratePct: 13.6,
    chapter: '第三章 数据清洗与质量检验',
    mandatoryStats: ['旋转后主因子载荷', '交叉载荷隐匿阈值 (<0.4)', '题项共同度 (h²)', '特征根与累计方差贡献率'],
    headers: ['测量题项编码', '因子 1（效能）', '因子 2（信任）', '因子 3（氛围）', '共同度 h²'],
    sampleRows: [
      ['Q3 响应速度满足预期', '0.812', '—', '—', '0.741'],
      ['Q4 服务流程直观清晰', '0.784', '—', '—', '0.692'],
      ['Q5 售后与权益透明可信', '—', '0.835', '—', '0.758'],
      ['特征值 / 方差贡献率', '3.42 (28.5%)', '2.89 (24.1%)', '2.41 (20.1%)', '累计 72.7%'],
    ],
    tableNote: '注：采用主成分抽取结合 Varimax 正交旋转，绝对值小于 0.40 的交叉载荷用 “—” 隐藏以便阅读（示例结构）。',
    judgeRedline: '切勿把原始 SPSS 所有小数值全堆上表格，载荷 < 0.40 应当置空或以横线替代以突出清晰构念归属。',
  },
  {
    id: 'cluster_table',
    title: '表 8-1 K-means 最终聚类中心、方差检验与人群命名画像表',
    sampleHits: 3,
    ratePct: 5.1,
    chapter: '第八章 聚类分群与群体画像',
    mandatoryStats: ['各簇样本数及占比', '核心维度聚类中心均值', '单因素方差分析 F 值与 p 值', '簇群策略标签'],
    headers: ['评价维度 / 簇群特征', '簇 A 深度忠实派', '簇 B 性价比观望派', '簇 C 痛点敏感流失派', 'ANOVA F (p)'],
    sampleRows: [
      ['簇内有效样本量 n(%)', '224 (34.9%)', '268 (41.8%)', '149 (23.2%)', '轮廓系数 0.46'],
      ['核心功能满意度', '4.38', '3.62', '2.41', 'F = 184.2***'],
      ['服务透明度满意度', '4.21', '3.18', '2.09', 'F = 162.7***'],
      ['高频行为复访率', '89.3%', '54.1%', '16.8%', 'χ² = 201.4***'],
    ],
    tableNote: '注：所有聚类输入维度在簇间 ANOVA 检验均达到 p < 0.001 显著分化水平，轮廓系数验证三分群结构稳定（示例结构）。',
    judgeRedline: '聚完类如果不报告类间 ANOVA F 检验并命名每个群的商业/治理策略画像，聚类就沦为形式主义。',
  },
  {
    id: 'pps_table',
    title: '表 2-1 多阶段分层 PPS 抽样配额分配与实施核算表',
    sampleHits: 2,
    ratePct: 3.4,
    chapter: '第二章 调查设计与抽样方法',
    mandatoryStats: ['总体单元规模 (N_h)', 'PPS 初级抽样单位 (PSU)', '设计样本配额 (n_h)', '实收/有效回收率'],
    headers: ['一级分层区域', '总体规模占比', '入选 PSU 单元', '计划样本配额', '有效回收数 (有效率)'],
    sampleRows: [
      ['核心区第一层', '42.0%', '4 个街道/高校', '280', '264 (94.3%)'],
      ['成长区第二层', '35.0%', '3 个街道/园区', '235', '219 (93.2%)'],
      ['辐射区第三层', '23.0%', '3 个社区/镇域', '155', '143 (92.3%)'],
    ],
    tableNote: '注：总样本量按置信水平 95%、绝对误差上限 4%、设计效应 DEFF=1.35 并预留 10% 无效冗余确定（示例结构）。',
    judgeRedline: '抽样配额表的合计数必须与第三章“回收数—清洗剔除数—最终入模数”完全一分不差！',
  },
  {
    id: 'action_kpi_table',
    title: '表 9-1 实证痛点锚定—责任主体—分阶段 KPI 核验对策矩阵',
    sampleHits: 52,
    ratePct: 88.1,
    chapter: '第九章 对策建议与实施落地',
    mandatoryStats: ['前文对应统计断点', '靶向改进动作', '协同责任主体', '短期/中期核验 KPI'],
    headers: ['靶向群体/实证痛点', '关键改进举措', '主责/协同方', '分期里程碑 KPI'],
    sampleRows: [
      ['重点改进区：等待与接驳断点', '增设错峰动态调度与实时看板', '运营中心 / 属地街道', '高峰等候降 30%；复访 +12%'],
      ['簇 B 观望派：信任感偏低', '公示全流程合规溯源与先行赔付', '质检督察 / 平台客服', '信任评分升至 4.1+'],
    ],
    tableNote: '注：每一项对策均直接回溯前文 IPA 重点改进象限、Logit 显著负向因子或簇 C 敏感人群痛点（示例结构）。',
    judgeRedline: '评委最反感“放之四海而皆准”的对策。矩阵能迫使每条建议绑死责任主体与可量化考核标尺。',
  },
];

export interface TitleRhetoricPattern {
  id: string;
  formulaName: string;
  formulaPattern: string;
  countIn204: number;
  sharePct: number;
  strengthNote: string;
  bestForTracks: string;
  archiveExamples: readonly string[];
}

export const TITLE_RHETORIC_PATTERNS: readonly TitleRhetoricPattern[] = [
  {
    id: 'region_method_subtitle',
    formulaName: '现象聚焦 + “——基于[区域/人群/方法]的调查研究”',
    formulaPattern: '《核心对象与现实议题——基于[样本场域/计量工具]的实证调查》',
    countIn204: 100,
    sharePct: 49.0,
    strengthNote: '占比近半壁江山。副标题在 1 秒内向评委交代调查边界与抽样方法，稳重严谨、零歧义，最适合一线赛区冲刺国奖。',
    bestForTracks: '民生公共服务、银发经济、社区治理、地方政策落地评估',
    archiveExamples: [
      '余额宝使用现状及产品发展分析报告——基于武汉市七大城区抽样调查',
      '“双减”政策下中小学生校外研学供需失衡分析——基于南京市三圈层多阶段抽样实证',
    ],
  },
  {
    id: 'dual_narrative_subtitle',
    formulaName: '四字对仗双元主标题 + 实证定调副标题',
    formulaPattern: '《“[意象词A]·[机制词B]”还是“[张力词C]·[破局词D]”？——[对象]研究》',
    countIn204: 56,
    sharePct: 27.5,
    strengthNote: '国一大热门结构！主标题用对称工整的八字或两段对仗拎出研究核心矛盾，副标题交代研究主体与科学方法，兼顾文采与学理。',
    bestForTracks: '数字经济、AIGC 应用、新消费品牌、文化传承与文旅融合',
    archiveExamples: [
      '“云端伴游”与“沉浸驻足”：数字文旅何以赋能Z世代体验重构——基于机器学习与SEM的双向验证',
      '是“悦己刚需”还是“颜值泡沫”？——新中式茶饮品牌复购意愿的影响机制与市场细分研究',
    ],
  },
  {
    id: 'metaphor_problem_subtitle',
    formulaName: '高感知隐喻 / 设问式痛点主标题 + 破局导向副标题',
    formulaPattern: '《谁在[核心困境/新兴现象]？——[主体]采纳障碍与提升路径调查》',
    countIn204: 48,
    sharePct: 23.5,
    strengthNote: '极具故事感与新闻张力，常见于全国十强或答辩现场高分作品。用反问、矛盾隐喻或接地气的本土方言意象开篇抓人眼球。',
    bestForTracks: '银发数字鸿沟、新能源基建痛点、绿色低碳习惯养成、新业态就业权益',
    archiveExamples: [
      '困在“一键适老”里的晚年——智能居家养老设备持续使用阻塞机制研究',
      '“风吹绿电”遇上“里程焦虑”：高速公路超充网络用户偏好与支付意愿联合分析',
    ],
  },
  {
    id: 'cp_corporate_pro',
    formulaName: '企业命题专场：“[企业品牌/业务线] + 增长诊断与人群洞察”',
    formulaPattern: '《[命题品牌][场景产品]精准营销与留存提升调查报告（附可落地执行方案）》',
    countIn204: 7,
    sharePct: 3.4,
    strengthNote: '虽在往届总库仅占 3.4%，但命题赛道竞争格局独特：核心讲究“商业转化 ROI、竞品心智差距、会员分级运营可行性”。',
    bestForTracks: '企业命题专场（乳业/健康/美妆/本地生活/智慧零售等专项赛题）',
    archiveExamples: [
      '正大厨易预制菜年轻家庭消费心智重塑与渠道渗透路径研究',
    ],
  },
];

export interface SectionRhetoricalBlueprint {
  nodeId: string;
  chapterGroup: string;
  sectionName: string;
  structuralArc: string;
  openingMove: string;
  exhibitBridge: string;
  judgeCheckpoint: string;
  recommendedNotes: string;
}

/**
 * 覆盖全部 26 个自动化生成节点（22 个 Wave-1 主体节 + 4 个 Wave-2 综合节）的国奖写作范式蓝图。
 * 重要规范：本字典所有字符串中严禁出现阿拉伯数字或中文数量词（如“三成/百分之十/一点五倍”），
 * 以保证 LLM 注入后输出 100% 通过 `parseAndHydrateSectionDraft` 与 `full-report-honesty.test.mjs`。
 */
export const SECTION_RHETORICAL_BLUEPRINTS: Readonly<Record<string, SectionRhetoricalBlueprint>> = {
  'intro.background': {
    nodeId: 'intro.background',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '研究背景与问题提出',
    structuralArc: '宏观政策风向标 → 行业供需真实错位 → 从文献泛谈聚焦至具体调研痛点与研究问题。',
    openingMove: '伴随产业数字化转型与消费结构深刻重塑，目标领域的服务供给与用户真实期望之间正逐步显现结构性张力，构成本文实地调研的现实起点。',
    exhibitBridge: '结合宏观语料演进趋势与既有政策文本脉络{R1}，有必要从微观受访者感知切口重新审视当前实践瓶颈。',
    judgeCheckpoint: '评委关注“为什么选这个题、为什么选在当前节点与调研区域开展实证”，切忌全篇空洞摘抄新闻联播式宏大叙事。',
    recommendedNotes: '开篇遵循“政策背景+微观供给痛点+清晰研究边界”三段式推进，凸显本课题的现实紧迫性与区域切口价值。',
  },
  'intro.significance': {
    nodeId: 'intro.significance',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '理论与实践意义',
    structuralArc: '理论缺口填补（测量构念/异质性边界） → 实践应用价值（经营决策/公共服务微调）。',
    openingMove: '本研究试图在既有宏观叙事与微观个案之间搭建可量化的实证桥梁，兼具方法论操作示范与地方实践参考价值。',
    exhibitBridge: '区别于纯思辨讨论，本文构建的多维测量与交叉检验框架可直接回应既有文献{R1}尚未充分覆盖的群体分化议题。',
    judgeCheckpoint: '避免“促进经济发展、推动社会和谐”式套话，把实践意义精准对应到运营主体（政府部门、企业或社区运营方）的可控抓手。',
    recommendedNotes: '理论意义重在界定变量关系与测量适配，实践意义需直接指向责任主体的决策落地情景。',
  },
  'intro.literature': {
    nodeId: 'intro.literature',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '文献综述与研究缺口',
    structuralArc: '主题演化高频词云聚类 → 国外理论机制引介 → 国内本土化研究脉络 → 明晰本文待检验之缺口。',
    openingMove: '围绕核心议题对既有实证文献开展关键词共现梳理（见{G1}），可见学界关注焦点正由宏观概念界定加速转向微观感知评价与行为转化。',
    exhibitBridge: '如{G1}文献高频词云所示，核心评价维度与行为意愿的联动受到广泛关注，然而针对细分人群结构性差异与薄弱环节优先排序的系统检验仍显不足{R1}。',
    judgeCheckpoint: '做到“述评结合”，既引述既有文献成果，又顺理成章导出后文自设量表维度与研究假设。',
    recommendedNotes: '综述结构按“主题词云聚类→机制脉络述评→本文研究切入点”组织，确保词云图标号与下文维度设计严格呼应。',
  },
  'intro.roadmap': {
    nodeId: 'intro.roadmap',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '研究思路与总体框架',
    structuralArc: '文献建构 → 工具预试 → 抽样实施 → 计量建模 → 对策闭环的五阶推进说明。',
    openingMove: '全篇遵循“现象锚定—实证检验—差异归因—对策落地”的闭环研究逻辑，确保前序调查设计与后序量化结论环环相扣。',
    exhibitBridge: '后续章节严格按照研究路线推进，从问卷构念操作化逐步过渡至多维统计检验与治理对策推导。',
    judgeCheckpoint: '思路叙述须清晰说明每个分析方法在整篇研究中的角色定位，不可孤立堆砌方法名词。',
    recommendedNotes: '强调章节之间的数据传递链路（设计引导采集、清洗校准入模、实证结果锁死对策）。',
  },
  'intro.innovation': {
    nodeId: 'intro.innovation',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '主要创新与特色',
    structuralArc: '视角创新（交叉场景切口） → 方法创新（主客观组合/稳健核验） → 应用创新（颗粒度可落地矩阵）。',
    openingMove: '立足目标场景的现实复杂性，本文在调研视角整合与证据链交叉检验层面形成了差异化研究探索。',
    exhibitBridge: '在研究方法组织上，本设计兼顾统计分布刻画与结构关联挖掘，使最终得出的提升策略具备明确的人群瞄准指向。',
    judgeCheckpoint: '谨防自吹“填补国内外空白”，应写实“调研视角的交叉整合”与“多种统计检验交叉印证的稳健性”。',
    recommendedNotes: '创新点紧扣视角微创新、检验组合互补与方案颗粒度落地三个维度客观凝练陈述。',
  },
  'design.purpose': {
    nodeId: 'design.purpose',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '调查目的与核心研究问题',
    structuralArc: '总调查目标界定 → 拆解为递进的实证子问题（现状如何—为何分化—什么在驱动—如何改进）。',
    openingMove: '围绕调研核心命题，本调查将研究总目标分解为相互递进的子研究问题，对应后文逐章开展量化检验。',
    exhibitBridge: '各核心子问题与问卷题项模块一一映射，保障调查工具设计不偏离核心论证主线。',
    judgeCheckpoint: '子研究问题需与后文第六、第七、第八章结果标题相照应，体现严谨课题闭环。',
    recommendedNotes: '按“现状测度→差异识别→机制拆解→优先施策”的顺序分解调查目的与核心问题清单。',
  },
  'design.population': {
    nodeId: 'design.population',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '目标总体、调查对象与地理范围',
    structuralArc: '界定目标总体准入与排除口径 → 抽样总体地理边界与时间窗口 → 现场受访者甄别规则。',
    openingMove: '为规避调研主体边界模糊带来的涵盖误差，本研究对目标总体的纳入条件、时空跨度及受访资格进行了严格操作性界定。',
    exhibitBridge: '上述总体边界界定直接指导了现场配额抽样框建立及筛选甄别题项的设置。',
    judgeCheckpoint: '明确区分“目标总体”与“抽样总体”，写出具体的排除条件（如常住年限、使用频率或年龄准入门槛）。',
    recommendedNotes: '详细阐明准入条件、排除规则以及调研区域分层依据，防范涵括偏差。',
  },
  'design.content': {
    nodeId: 'design.content',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '调查内容体系与技术路线',
    structuralArc: '问卷模块化结构拆解（人口基线—参与行为—多维感知量表—结果意愿） → 总体技术路线图解读。',
    openingMove: '在综合文献回顾与现实痛点梳理的基础上，本研究将抽象理论构念操作化为层层递进的问卷测量体系（见{G1}）。',
    exhibitBridge: '技术路线图{G1}直观展示了各阶段方法模块之间的前后衔接与数据闭环校准关系。',
    judgeCheckpoint: '保证技术路线图内文字、方法名词与真实登记结果及后文执行计划完全一致。',
    recommendedNotes: '将问卷模块结构与研究技术路线图深度互文解读，明确构念操作化落点。',
  },
  'design.methods': {
    nodeId: 'design.methods',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '调研与数据分析方法选择',
    structuralArc: '文献分析+实地拦截访谈结合的采集方法 → 按照“先检验假定后建模解释”排序拟用定量分析体系。',
    openingMove: '考虑到单一资料采集手段难以兼顾覆盖广度与归因深度，本研究设计了定量抽样为主、辅助核验并行的组合方法路径。',
    exhibitBridge: '在拟用的数据分析序列中，拟先通过信效度与清洗环节验证数据质量，再顺次展开组间检验与关联机制剖析。',
    judgeCheckpoint: '设计节只能说明“拟采用的方法与检验假定逻辑”，绝不能提前透露或伪造实际运行后的显著性结论。',
    recommendedNotes: '系统阐述数据采集方式与拟采用统计方法矩阵，明确只写拟定设计而不剧透计算结果。',
  },
  'design.sampling': {
    nodeId: 'design.sampling',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '抽样设计与样本量计算',
    structuralArc: '样本量公式与设计效应逻辑 → 多阶段分层 PPS 配额执行路径 → 实际发放与有效回收核算。',
    openingMove: '为同时保障样本对各区域及核心群体的代表性并兼顾调研实施可行性，本研究采用多阶段分层配额抽样架构。',
    exhibitBridge: '具体层级单位划分、样本分配额度及实际回收情况详见{G1}，设计总问卷题量及回收水平则与数据质控台账对齐。',
    judgeCheckpoint: '如果登记了抽样框，必须紧扣有效样本、实际发放问卷及有效回收率做闭环汇报，严禁脱离计算口径瞎编样本数。',
    recommendedNotes: '聚焦分层逻辑、抽样单位抽取方式、样本冗余考虑以及回收闭环核算，确保抽样框数值零误差。',
  },
  'design.schedule': {
    nodeId: 'design.schedule',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '问卷测量逻辑与进度安排',
    structuralArc: '量表级次与题项顺序设计逻辑（从易到难、防首因效应） → 筹备、预试、正调、归档阶段协同甘特安排。',
    openingMove: '问卷编制在结构排序上遵循由浅入深、客观行为先于主观评价的心理测验原则，以有效缓解受访者作答疲劳。',
    exhibitBridge: '整个调研工作按阶段里程碑严格管控，确保问卷定稿前完成预调查收敛与试答复盘。',
    judgeCheckpoint: '重点说明如何通过题序、引导语和注意力核验题降低共同方法偏差与社会赞许偏差。',
    recommendedNotes: '交代问卷顺序防偏机制及预调查、正式采集与复核阶段的推进节奏控制。',
  },
  'design.qc': {
    nodeId: 'design.qc',
    chapterGroup: '一、绪论与研究设计',
    sectionName: '全流程质量控制方案',
    structuralArc: '事前防偏（访员培训与逻辑跳转测试） → 事中督查（现场抽查与定位追踪） → 事后剔除规则预设。',
    openingMove: '调查数据的公信力取决于事前防范与事中监管，而非仅依赖事后统计剔除。本研究制定了覆盖全周期的四维质量控制规则。',
    exhibitBridge: '后续数据清洗与筛选规则表将严格依据此处设定的注意力检验与作答规范阈值自动化执行。',
    judgeCheckpoint: '明确列出至少包含最短作答时间异常、直线作答检验、注意力指定题误答等硬性质量门禁。',
    recommendedNotes: '从事前访员模拟测试、事中双人复核、事后逻辑筛查三维度呈现严密质控闭环。',
  },
  'data.pilot': {
    nodeId: 'data.pilot',
    chapterGroup: '二、数据清洗与质量检验',
    sectionName: '预调查检验与量表修订',
    structuralArc: '预测试目的与边界声明 → 歧义措辞微调与选项完整性校验 → 对接正式施测与清洗流程。',
    openingMove: '在正式大规模施测之前，开展预测试与作答排查是保障量表词义清晰、跳转顺畅及逻辑闭合的关键校验门槛。',
    exhibitBridge: '结合预调查反馈，本课题对部分易致理解偏差的提示语进行了微调优化（参见{G1}），以保障正式采集效度。',
    judgeCheckpoint: '如果使用平台仿真或预试记录，须如实说明其核查范围与限定边界，严禁将小规模预试冒充正式全样本推论。',
    recommendedNotes: '清晰交代预试检验的核心问题排查、题项语意修正与转入正式调查的衔接说明。',
  },
  'data.cleaning': {
    nodeId: 'data.cleaning',
    chapterGroup: '二、数据清洗与质量检验',
    sectionName: '数据清洗、异常筛查与编码规则',
    structuralArc: '原始回收规模 → 逐条筛查规则剔除人数解析（注意力失败/直线作答/重复等） → 清洗后有效样本入库。',
    openingMove: '高质量统计建模建立在洁净原始数据之上。本研究采用逐级漏斗筛选规则对回收问卷开展一致性复核（见{G1}）。',
    exhibitBridge: '如{G1}清洗筛查结果所示，分别清除了未通过指定注意力题、极端直线作答及逻辑矛盾记录，最终保留洁净样本纳入后文分析。',
    judgeCheckpoint: '初始样本数减去各类异常剔除合计数必须严格等于有效保留样本数，杜绝加总对不上的硬伤。',
    recommendedNotes: '严格照着清洗筛查结果展示剔除流向、有效留存规模与编码标准化处理。',
  },
  'data.testing': {
    nodeId: 'data.testing',
    chapterGroup: '二、数据清洗与质量检验',
    sectionName: '量表信度、效度与因子结构检验',
    structuralArc: '内部一致性系数 Cronbach α 汇报 → KMO 与 Bartlett 球形度前提判定 → 构念因子结构与区分特征总结。',
    openingMove: '在展开关联分析与回归识别之前，须先对多维核心量表的信度稳健性与结构效度进行严格统计学检验。',
    exhibitBridge: '量表信度测度及取样适切性参数汇总见{G1}，整体内部一致性与因子载荷结构支撑后续降维及得分聚合。',
    judgeCheckpoint: '仅汇报已真实登记的信度系数和效度因子结果，不得在未注册因子分析结果时硬编 AVE、CR 或拟合指数。',
    recommendedNotes: '严格对齐登记的信度/效度输出表格，给出统计门槛判别结论及量表稳健定性评价。',
  },
  'sample.profile': {
    nodeId: 'sample.profile',
    chapterGroup: '三、样本特征与描述分析',
    sectionName: '样本人口统计学结构分布',
    structuralArc: '核心受访人群构成特征（核心背景变量分布） → 代表性与分布均衡度定性评估 → 为后文分群对比定基调。',
    openingMove: '梳理入模有效样本的人口学基线特征，有助于明确本次调查所刻画的核心受访群体画像与推论适用边界（见{G1}）。',
    exhibitBridge: '从{G1}呈现的多重分布占比可见，不同人群特征呈现出了清晰的样本层次结构，为下一章开展分群对比提供了基数保障。',
    judgeCheckpoint: '描述结构比重严禁手工加减推算差异倍数或“约占多少成”，全部采用占位符直连统计值并加以现实解释。',
    recommendedNotes: '结合占比分布图表剖析主要受众群体分布结构，交代各分层样本量对后续列联对比的支撑性。',
  },
  'sample.descriptive': {
    nodeId: 'sample.descriptive',
    chapterGroup: '三、样本特征与描述分析',
    sectionName: '核心评价指标与量表分布特征',
    structuralArc: '宏观认知与行为总体参与特征 → 李克特多维度量表集中与离散对比 → 锁定表现突出项与感知洼地项。',
    openingMove: '针对问卷核准的核心行为状态与各评价维度，本节进一步刻画受访群体的整体态度倾向及评分分布区间（见{G1}）。',
    exhibitBridge: '对比各题项的均值水平与分位离散度（见{G1}），能够清晰甄别出当前体验中的相对强势维度与亟待补强的短板指标。',
    judgeCheckpoint: '从均值排序、两极离散对比出真实痛点排序，把高分项与低分项对比写成下一步分析问题的先声。',
    recommendedNotes: '突出李克特维度或发散堆叠结构的高低对比排序，挖掘总体平均评价背后隐藏的具体体验弱项。',
  },
  'compare.tests': {
    nodeId: 'compare.tests',
    chapterGroup: '四、多维建模与诊断分析',
    sectionName: '群体差异检验与变量相关性诊断',
    structuralArc: '类别特征列联交叉 χ² 检验与效应量解读 → 多维感知变量在不同群体间的均值分化 → 维度间相关热力关联剖析。',
    openingMove: '为探明总体平均水平背后是否隐藏显著的群体间异质性分化，本研究按主要人口特征与参与状态展开逐项假设检验（见{G1}）。',
    exhibitBridge: '交叉独立性检验与相关矩阵结果（见{G1}）同时验证了结构分群分化显著性以及核心自变量与总体评价之间的协同方向。',
    judgeCheckpoint: '区分统计学显著 (p值) 与效应量强弱（如 Cramér’s V 或相关系数大小），不盲目将微弱相关吹成强因果决定关系。',
    recommendedNotes: '严谨串联交叉卡方、分组差异比较与相关矩阵结论，严守相关不等于因果的表述红线。',
  },
  'drivers.model': {
    nodeId: 'drivers.model',
    chapterGroup: '四、多维建模与诊断分析',
    sectionName: '核心驱动因素与计量归因模型',
    structuralArc: '计量回归模型设定与控制变量声明 → 回归系数、显著性与拟合表现解读 → 异质性边际机理总结。',
    openingMove: '在控制主要背景人口特征基础上，本节构建量化解释模型以识别影响核心结果意愿与满意度的关键边际驱动因子（见{G1}）。',
    exhibitBridge: '模型估计参数表及系数组图（见{G1}）揭示了各维度因子对目标结果变量的净边际影响排序与统计学意义。',
    judgeCheckpoint: '只谈资料 `analyses` 中实际登记过的模型结果（如线性回归或已跑出的 Logit），绝不虚构任何未运行的指标（例如未测算却胡写 VIF 或 SEM 拟合指标）。',
    recommendedNotes: '按“模型设定与控制变量说明→显著解释因子排序→稳健性与解释边界交代”三层逻辑规范汇报。',
  },
  'diagnosis.evaluation': {
    nodeId: 'diagnosis.evaluation',
    chapterGroup: '四、多维建模与诊断分析',
    sectionName: 'IPA 四象限绩效诊断与短板判定',
    structuralArc: '重要性—表现力坐标系构成（隐含权重 vs 实测均值） → 四象限分布逐一归位 → 明确首要高权重低表现痛点项。',
    openingMove: '为防止优化资源盲目分散，本节借助满意度—重要性四象限矩阵（见{G1}），对各核心服务维度实施精准优先序诊断。',
    exhibitBridge: '如{G1}象限诊断图所呈现，落入重点改进区的指标因兼具高驱动权重与低实际表现度，构成了牵制整体满意度跃升的关键瓶颈。',
    judgeCheckpoint: '紧扣象限分界线与实测坐标位置做解释，高表现区谈“巩固长板防滑坡”，高权重低表现区谈“首要抓手攻坚”。',
    recommendedNotes: '强调从“影响权重×实际表现”双维交集提炼出最紧迫改进维度，为第九章施策确立优先级序列表。',
  },
  'diagnosis.problems': {
    nodeId: 'diagnosis.problems',
    chapterGroup: '四、多维建模与诊断分析',
    sectionName: '核心短板症结凝练与痛点总汇',
    structuralArc: '供给便利与流程体验瓶颈 → 群体差异分化与触达断层 → 机制信任与服务稳定性障碍的系统汇总。',
    openingMove: '贯通前序描述性测度、群体对比与归因诊断的交叉证据，当前实践痛点可收敛为相互交织的多重现实症结。',
    exhibitBridge: '前述模型结果与差异检验一致表明，体验短板往往并非孤立环节失灵，而是特定人群诉求与标准化供给错配所引致的系统断点。',
    judgeCheckpoint: '每一个凝练出的问题必须能直接回溯到前文某个已登记图表或统计检验结果，拒绝空降脱节“伪问题”。',
    recommendedNotes: '梳理“统计症状→深层成因→受影响典型簇群”逻辑链条，确保后文对策一条一针见血。',
  },
  'plan.measures': {
    nodeId: 'plan.measures',
    chapterGroup: '五、对策闭环与总结展望',
    sectionName: '具体可操作措施与闭环落地路径',
    structuralArc: '前文痛点精准锚定 → 对策矩阵图谱解读（举措+主责协同主体） → 面向分群受众的差异化推进节奏与核验标尺。',
    openingMove: '针对前述统计诊断所锁定的首要短板与不同簇群需求梯度，本节构建“痛点锚定—责任归属—分期落地”的可操作治理闭环（见{G1}）。',
    exhibitBridge: '如对策闭环路线{G1}所示，建议路径直接呼应关键驱动因子与高敏感人群痛点，确保整改行动兼具方向靶向性与过程可核验性。',
    judgeCheckpoint: '彻底杜绝泛泛而谈“加强监管、扩大宣传”，明确写出针对哪一个统计短板、对应哪一类分化群体、由谁主责协调落实。',
    recommendedNotes: '对策书写严格对照“统计证据起点—目标干预人群—执行举措主体—验收跟踪抓手”闭环框架推进，强化图谱互文。',
  },
  'conclusion.findings': {
    nodeId: 'conclusion.findings',
    chapterGroup: '五、对策闭环与总结展望',
    sectionName: '主要研究结论汇总',
    structuralArc: '群体结构特征定调 → 核心驱动机理与重点短板验证 → 高区分度群体画像概览的四位一体总括。',
    openingMove: '综合全篇抽样调查、质量筛查与逐层量化检验的实证链条，本文围绕调研目标凝练得出以下相互支撑的核心研究结论。',
    exhibitBridge: '全部分群差异趋势、模型参数显著性与评价诊断结果均保持一致逻辑指向，支撑从数据实证向落地建言的严谨推理跨度。',
    judgeCheckpoint: '只做高位实证精炼汇总，不引入全篇从未出现过的新分析结果或新观点。',
    recommendedNotes: '分条目凝练响应第一章研究问题，保持“结论句+对应证据归因”的严谨学术总结体例。',
  },
  'conclusion.suggestions': {
    nodeId: 'conclusion.suggestions',
    chapterGroup: '五、对策闭环与总结展望',
    sectionName: '宏观政策与行业综合建言',
    structuralArc: '微观具体整改上升至协同治理制度建议 → 标准体系完善 → 长效监测反馈机制建立。',
    openingMove: '立足实证发现的供给侧断点与群体长尾分化态势，除运营层面的即时微调外，仍需依托中观协同与长效评价制度巩固改进成效。',
    exhibitBridge: '建议围绕核心短板维度推动多方数据贯通与动态绩效评价，使后续改进动作实现从被动响应向事前预警演化。',
    judgeCheckpoint: '突出政策或行业层面的宏观制度协同价值，与前面 `plan.measures` 形成“微观抓手+宏观保障”互补结构。',
    recommendedNotes: '从标准共建、信息互通、分层激励及定期追踪调查四大抓手升华整体治理建言。',
  },
  'conclusion.limits': {
    nodeId: 'conclusion.limits',
    chapterGroup: '五、对策闭环与总结展望',
    sectionName: '研究局限与未来研究展望',
    structuralArc: '横截面时点局限 / 抽样涵盖范围边界 / 数据分类边界诚实声明 → 后续追踪调查与因果深化方向。',
    openingMove: '受限于调研周期、调查手段与资源承载条件，本研究在样本外推边界与动态因果识别方面仍存在客观完善空间。',
    exhibitBridge: '若未来结合长期追踪面板设计与更广泛的跨区域准自然实验校验，将有助于进一步验证核心作用机制的时间稳健性。',
    judgeCheckpoint: '主动且诚实地交代横截面调查局限（如非因果推断与区域范围界限），是评委眼里极其重要的学术诚信加分点。',
    recommendedNotes: '坦诚指出横截面时效限制、抽样覆盖范围及未来多源数据交叉纵深拓展方向。',
  },
  abstract: {
    nodeId: 'abstract',
    chapterGroup: '摘要',
    sectionName: '报告核心摘要（全篇浓缩闭环）',
    structuralArc: '研究缘起与痛点 → 抽样与数据质控 → 实证模型核心发现（差异、驱动、诊断） → 靶向对策收束。',
    openingMove: '针对当前调研领域中突出的体验错配与可持续增长挑战，本文通过规范化抽样设计获取有效调查样本，系统建构了多维实证检验框架。',
    exhibitBridge: '整体实证检验清晰揭示了现状特征分布、核心驱动边际与高优先级短板所在，据此提出的差异化改进路径对实践升级具有重要借鉴价值。',
    judgeCheckpoint: '评委初审必看单页！严禁在摘要中使用任何未在正文登记确认过的新统计指标或新方法名称，保持高度学术凝练。',
    recommendedNotes: '按“研究缘起—抽样质控—核心实证发现—对策闭环”四句段结构一页精炼收束，严守事实边界。',
  },
};

export function getSectionRhetoricalBlueprint(nodeId: string): SectionRhetoricalBlueprint | null {
  return SECTION_RHETORICAL_BLUEPRINTS[nodeId] ?? null;
}
