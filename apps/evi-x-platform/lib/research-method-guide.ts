/** Read-only guidance. Availability describes the stated scope, never execution approval. */
export type ResearchMethodCard = {
  id: string;
  title: string;
  researchQuestion: string;
  availability: 'implemented' | 'planned';
  implementationScope: string;
  preconditions: readonly string[];
  steps: readonly string[];
  diagnostics: readonly string[];
  outputs: readonly string[];
  limits: readonly string[];
  sourceRefs: readonly string[];
};

export type ResearchGuideSource = {
  id: string;
  title: string;
  url: string;
  revision: string;
  coverage: string;
};

export const RESEARCH_GUIDE_VERSION = 'research-method-guide/v1';

export const RESEARCH_GUIDE_SOURCES: readonly ResearchGuideSource[] = [
  { id: 'evix-router', title: '证见方法选择与证据契约', url: 'skill/zhengda-cup-champion/references/methods-router.md', revision: 'working-source:b6c4e3db53f5fcef89bd003910b24198b2a098ef26fc84025449ddec781329f1', coverage: '方法适配、样本口径、模型诊断和结论边界' },
  { id: 'evix-analysis', title: '证见现有分析程序', url: 'apps/evi-x-platform/lib/analysis-recipes.ts', revision: 'working-source:b6c4e3db53f5fcef89bd003910b24198b2a098ef26fc84025449ddec781329f1', coverage: '描述、分组描述、交叉表、Pearson 与 Spearman；另核对 survey-analysis、analysis-plan 和 row-eligibility' },
  { id: 'market-coach', title: '市场研究流程资料', url: 'https://github.com/YifeiWang2000/zhengda-market-research', revision: 'tree:dd81888aaf5aca0f00a2c7d74b198701d4f134c4', coverage: 'SKILL 与数据分析、报告论证、项目状态三份参考文件；仅抽样阅读' },
  { id: 'python-index', title: 'Python 数据分析资源目录', url: 'https://github.com/hi-weijun/PythonDataScience-Collections', revision: 'tree:38197d2d92d12e18716d1c26987cbe899832b9cc', coverage: 'README 分类目录；未审阅外链课程和数据集' },
  { id: 'ailearning-cluster', title: 'K-means 教学说明', url: 'https://github.com/apachecn/ailearning/blob/master/src/py3.x/ml/10.kmeans/k-means.md', revision: 'tree:26f415083e2354335a3fa9e8ba9d39d8d3ef9a7f', coverage: '距离、初始化和 SSE；不复制示例算法' },
  { id: 'ailearning-predict', title: 'Logistic 教学示例', url: 'https://github.com/apachecn/ailearning/blob/master/src/py3.x/ml/5.Logistic/sklearn_logisticRegression_demo.py', revision: 'tree:26f415083e2354335a3fa9e8ba9d39d8d3ef9a7f', coverage: '正则化与决策边界示例；训练评分不充当泛化验收' },
  { id: 'business-case', title: '用户行为分析案例', url: 'https://github.com/TurboWay/bigdata_analyse/blob/main/UserBehaviorFromTaobao_Batch/用户行为数据分析.md', revision: 'tree:2babbf57f4ec56b8363806b5bf80e4c4858a7710', coverage: '时间范围、行为次数与用户人数、业务分层；网页案例抽样' },
  { id: 'business-predict', title: '招聘分析预测示例', url: 'https://github.com/TurboWay/bigdata_analyse/blob/main/AmoyJob/train.py', revision: 'tree:2babbf57f4ec56b8363806b5bf80e4c4858a7710', coverage: '读取完整小文件；另抽样核对招聘案例清洗与预测章节' },
  { id: 'nlp-index', title: '中文 NLP 资源目录', url: 'https://github.com/fighting41love/funNLP', revision: 'tree:29f4ac896f11058e87e10968569f999c69679b6f', coverage: 'README 的词库、情感分析、文本标注部分；外链工具未验证' },
  { id: 'business-playbook', title: '业务数据分析工作流', url: 'https://github.com/7777777qqll/data-analytics-playbook-Youtube-Legends', revision: 'tree:748ef0d5d01a9e67f77945184807942ec23c8bc1', coverage: '当前 README 与 SKILL；未审阅其提及的博主课程' },
];

export const RESEARCH_METHOD_CARDS: readonly ResearchMethodCard[] = [
  {
    id: 'question-value', title: '研究价值与分析目的', availability: 'planned',
    implementationScope: '方法指引；尚未实现自动研究价值审查、预注册或验证样本管理。',
    researchQuestion: '这项调查将改变谁的哪一个决定，新增什么证据？',
    preconditions: ['明确对象、地区、时间和决策负责人。', '整理已有知识、现实约束与可获得的样本。'],
    steps: ['列出现有判断与证据缺口，提出可被数据支持或推翻的问题。', '把问题对应到变量、调查对象和可执行行动。', '在分析前区分预先提出的检验与事后探索，记录版本和日期。', '探索中发现的关系留待新样本或明确的验证方案复核。'],
    diagnostics: ['问题是否只是重复常识，或仅替换地区名称？', '同一批数据是否既用于发现模式，又被包装成独立验证？', '预期结果不显著时，是否仍能形成有用的决策判断？'],
    outputs: ['问题—知识基线—证据增量—决策用途表', '探索与验证分工及分析版本记录'],
    limits: ['研究价值需要领域判断，不能用模型数量或显著性替代。', '可信的无明显差异结果可以保留；补收数据应针对可说明的测量或设计问题。'],
    sourceRefs: ['market-coach', 'evix-router', 'business-playbook'],
  },
  {
    id: 'sample-denominator', title: '样本口径与缺失流转', availability: 'implemented',
    implementationScope: '现有跳题资格评估、分支筛选、模块有效样本与排除计数；未实现自动去重、插补和复杂抽样加权。',
    researchQuestion: '每个结果究竟描述哪些记录，比例以谁为分母？',
    preconditions: ['核对问卷版本、题目对应、编码、缺失代码与跳题条件。', '区分受访者、答卷、行为记录等分析单位。'],
    steps: ['保留原始数据，记录总行数和字段含义。', '先判定分支资格，再按该模块的有效值规则计算。', '分别记录资格未知、缺失、不可解析和越界原因。', '给每个比例附上分子、分母、单位与范围；汇总率按对应总数重算。'],
    diagnostics: ['分支资格与回答完整性是否被混为一谈？', '缺失与无效原因可重叠，是否被重复相加？', '行为次数是否被误称为人数？条件比例是否倒置？'],
    outputs: ['总量—分支—有效分析样本记录', '各模块 n、排除原因和比例分母'],
    limits: ['缺失不是零；当前计算不插补。', '同一份问卷的不同模块可以有不同 n。', '便利或配额样本不能直接声称总体代表性。'],
    sourceRefs: ['evix-analysis', 'evix-router', 'market-coach', 'business-case', 'business-playbook'],
  },
  {
    id: 'descriptive-profile', title: '描述分布与人群比较', availability: 'implemented',
    implementationScope: '频数与 Wilson 95% 区间、均值与 t 区间、样本标准差、中位数、Type 7 四分位数；分组比较附 Welch t / Welch 方差分析、秩检验对照、效应量与 Holm 两两比较。',
    researchQuestion: '当前样本的结构、水平和差异集中在哪里？',
    preconditions: ['分类、顺序和数值变量含义明确，单位一致。', '多选题按选项处理；标识列完成审查。'],
    steps: ['先看样本结构与缺失，再选择频数或数值分布。', '偏态分布同时查看中位数与四分位数。', '按研究依据分组，对照 n、水平和离散程度。', '把异常值核查结果与业务解释一起记录。'],
    diagnostics: ['数字类别码是否被当作连续值？', '少数极端值是否支配均值？', '组规模和招募渠道是否足以解释表面差异？'],
    outputs: ['样本分布表', '分组数值摘要与口径说明'],
    limits: ['检验与区间以随机抽样为前提；便利或配额样本的 p 值只作参考。', '小组结果可能不稳定，也需考虑重识别风险。', '描述记录中的差异不能单独解释其原因。'],
    sourceRefs: ['evix-analysis', 'evix-router', 'business-playbook', 'python-index'],
  },
  {
    id: 'scale-consistency', title: '量表内部一致性', availability: 'implemented',
    implementationScope: '原始 Cronbach α、修正题总相关、删除题项后 α；同构念 2–30 项，完整案例与反向计分。',
    researchQuestion: '同一构念的题项是否共同反映一致的回答趋势？',
    preconditions: ['题项确属同一拟测构念，计分范围与反向题已核对。', '确认量表来源、改编内容和完整案例口径。'],
    steps: ['选择同构念题项，设置计分上下限和反向项。', '核对完整案例数及缺失、不可解析、越界原因。', '共同查看 α、题项变异、修正题总相关和删项结果。', '根据内容覆盖与测量目的解释问题，保留修订依据。'],
    diagnostics: ['负 α 是否来自反向编码错误或混合维度？', '零方差题项或题项冗余是否影响解释？', '删项是否仅为抬高系数，损失了构念内容？'],
    outputs: ['内部一致性摘要', '题项诊断表与版本修订理由'],
    limits: ['α 不证明单维性、效度或代表性。', 'EFA、CFA、KMO 与 Bartlett 尚未在当前分析模块实现。', '总分无变异时 α 不定义；样本量阈值不是通用合格线。'],
    sourceRefs: ['evix-analysis', 'evix-router', 'market-coach'],
  },
  {
    id: 'categorical-association', title: '交叉表与分类关联', availability: 'implemented',
    implementationScope: '交叉频数、行内比例、期望频数、Pearson χ² 与未偏差校正 Cramér V；不输出 p 值。',
    researchQuestion: '不同人群的选择结构有什么联系？',
    preconditions: ['两个不同分类变量，明确哪个变量作为行分母。', '确认有效配对和分支范围；每侧不超过当前 20 类限制。'],
    steps: ['先查看频数与行内比例，核对分母方向。', '查看期望频数、χ² 与关联强度。', '用具体行列说明差异，并检查组规模和混杂解释。'],
    diagnostics: ['是否把某类人的构成比写成该人群的选择概率？', '是否存在期望频数低于 5 或 1 的单元格？', '是否至少两侧都有两个有效类别？'],
    outputs: ['带期望频数的交叉表', 'χ²、自由度与 Cramér V 摘要'],
    limits: ['稀疏表需要另行选择合适的检验。', 'χ² 未作连续性校正；当前没有显著性结论。', '分类关联不证明因果。'],
    sourceRefs: ['evix-analysis', 'evix-router', 'market-coach'],
  },
  {
    id: 'paired-association', title: '线性与单调关联', availability: 'implemented',
    implementationScope: '有效配对上的 Pearson r 与平均秩 Spearman ρ；不输出 p 值或置信区间。',
    researchQuestion: '两个数值或有序变量在当前配对样本中如何共同变化？',
    preconditions: ['两个不同变量，有序编码保持真实顺序。', '先核对配对缺失、异常值、变量变异与研究范围。'],
    steps: ['线性问题选择 Pearson，单调或有序问题考虑 Spearman。', '先筛有效配对，再计算；Spearman 在有效配对内重排平均秩。', '对照原始关系形状与分组背景，记录替代解释。'],
    diagnostics: ['异常值、非线性或组间混合是否改变关联？', '至少一个变量是否恒定？', '是否只有两个有效配对而得到 ±1？'],
    outputs: ['相关系数和有效配对数', '关系解释与需要补查的条件'],
    limits: ['无序类别不能直接做秩相关。', '系数不定义与零关联含义不同。', '当前不作显著性或因果判断。'],
    sourceRefs: ['evix-analysis', 'evix-router', 'market-coach'],
  },
  {
    id: 'segment-stability', title: '聚类与稳定人群画像', availability: 'planned',
    implementationScope: '尚未接入 K-means 计算、聚类稳定性评估或画像结果登记。',
    researchQuestion: '是否存在可以指导不同服务方案的稳定人群组合？',
    preconditions: ['选定与行为或需求有关的特征，排除身份标识。', '变量类型、尺度、缺失规则与距离选择有研究依据。'],
    steps: ['记录特征、变换、标准化和距离，谨慎处理混合类别。', '比较候选 K，多次初始化并保存随机种子。', '结合轮廓、SSE、组大小与重采样稳定性选择方案。', '用未参与聚类的结果变量描述差异，并检验行动价值。'],
    diagnostics: ['不同种子或重采样后分群是否大幅改变？', '某个大尺度变量是否主导距离？', '群人数之和、有效样本和标签是否一致？'],
    outputs: ['可复算配置与候选方案比较', '群规模、稳定性和差异画像'],
    limits: ['SSE 随 K 增加通常下降，不能单靠最小 SSE 定群数。', '类别编码不是天然欧氏距离。', '簇名称是解释标签，不是客观存在的人格分类。'],
    sourceRefs: ['evix-router', 'ailearning-cluster'],
  },
  {
    id: 'prediction-validation', title: '预测、基线与防泄漏', availability: 'planned',
    implementationScope: '尚未实现 OLS、Logistic 或机器学习训练、数据切分和泛化评估。',
    researchQuestion: '在真实可用信息下，能否比简单基线更好地预测新对象？',
    preconditions: ['预测目标、可用时点、业务损失和评估人群明确。', '同一对象、重复记录与时间关系可用于设计切分。'],
    steps: ['按对象或时间划分训练、验证、测试集，保存划分记录。', '清洗、插补、标准化和特征选择仅在训练集拟合。', '先建立多数类、均值等与任务一致的简单基线。', '在验证集调参，最终报告未参与选模测试集的性能与校准。'],
    diagnostics: ['同一对象是否跨集合，或特征是否包含结果发生后的信息？', '指标是否覆盖类别不平衡、误差成本和关键子群？', '是否存在不收敛、完全分离或外推到训练范围之外？'],
    outputs: ['切分、预处理、基线及模型版本记录', '测试集性能、误差分析与使用范围'],
    limits: ['训练集评分不能作为新样本预测能力。', '预测贡献不等于因果影响。', '未验证的模型不用于承诺收益或政策效果。'],
    sourceRefs: ['evix-router', 'ailearning-predict', 'business-predict'],
  },
  {
    id: 'text-coding', title: '文本编码与语义验证', availability: 'planned',
    implementationScope: '尚未接入中文文本编码、情感模型或标注一致性评估；资源目录仅作为候选索引。',
    researchQuestion: '开放回答反映哪些问题、评价对象和语境？',
    preconditions: ['记录平台或调查来源、检索条件、时间范围及使用授权。', '确定编码单元、标签定义和去标识规则。'],
    steps: ['保存原文版本与去重、纳入规则，保留可回查定位。', '人工标注领域样例，说明多标签和无法判断的处理。', '覆盖否定、转折、反讽、对象不同等语境后，再比较工具。', '用独立标注样本检查一致性、分类表现和典型误判。'],
    diagnostics: ['“不满意”是否被当作“满意”，转折前后对象是否混淆？', '词云高频是否被误解释为问题重要性或情感比例？', '模型误判是否集中在特定人群、平台或表达方式？'],
    outputs: ['编码本、标注与工具版本', '验证结果、误判示例和主题证据'],
    limits: ['词典或开源模型不能直接保证本领域有效。', '外链工具、语料权利和隐私要求须在使用前单独核对。', '公开文本与问卷样本不能自动合并为同一受访群体。'],
    sourceRefs: ['evix-router', 'nlp-index', 'market-coach'],
  },
  {
    id: 'evidence-action', title: '从结论到行动方案', availability: 'planned',
    implementationScope: '本卡提供论证结构；跨成果统一结论登记、自动数字核对与行动追踪尚需完善。',
    researchQuestion: '证据支持优先改变什么，谁来做，如何判断有效？',
    preconditions: ['主要结论有数据版本、样本口径和可定位结果。', '行动对象、资源约束与可比较基线明确。'],
    steps: ['先陈述影响决策的发现，再展示证据与替代解释。', '按研究问题组织报告，避免逐题或逐模型堆叠。', '将结论对应到行动、负责人、资源、条件和评价指标。', '报告、PPT 与答辩沿用同一结论版本；上游改变后重新核对。'],
    diagnostics: ['是否有未连接到证据的建议，或没有行动用途的关键结果？', '未知成本是否被填成零，情景假设是否被写成实际收益？', '比例、提升率与百分点变化的基线和单位是否一致？'],
    outputs: ['发现—证据—行动—负责人—评价表', '报告与展示材料的结论口径清单'],
    limits: ['模拟、推断和拟议行动应分别标识。', 'ROI 等指标先核对定义，再登记公式与假设。', '报告页数和排版按适用官方规则核对；案例建议不自动成为硬规则。'],
    sourceRefs: ['evix-router', 'market-coach', 'business-playbook'],
  },
];
