# 公开仓库经验如何进入证见

本轮新增只读方法库，供分析板块查阅。它把研究问题、适用条件、步骤、诊断、输出和解释边界放在一起；现有计算能力与计划能力分开标记。没有安装外部 Skill、复制算法代码、执行下载脚本或变更项目 Gate。

## 阅读范围与版本

核查日期：2026-10-10。阅读采用 README、目录树及少量代表文件，不是全仓库、全部案例或全部课程审阅。下列 revision 是 Git **tree** 标识，不冒充 commit。分支地址会变化；本地快照哈希和具体覆盖记录见本轮 `evidence/research-source-manifest.json`。

| 来源 | 核对版本与阅读覆盖 | 许可记录 |
|---|---|---|
| [YifeiWang2000/zhengda-market-research](https://github.com/YifeiWang2000/zhengda-market-research) | main tree `dd81888aaf5aca0f00a2c7d74b198701d4f134c4`；SKILL.md、references/data-analysis.md、references/report-writing-framework.md、references/project-state.md 四份文件 | 未核实明确许可；状态 unknown，不据此分发原文或案例 |
| [hi-weijun/PythonDataScience-Collections](https://github.com/hi-weijun/PythonDataScience-Collections) | master tree `38197d2d92d12e18716d1c26987cbe899832b9cc`；树内 README 和图片，本轮阅读 README 的分类目录及相关小节 | 未核实明确许可；外链资源各有权利条件 |
| [apachecn/ailearning](https://github.com/apachecn/ailearning) | master tree `26f415083e2354335a3fa9e8ba9d39d8d3ef9a7f`；README、src/py3.x/ml/10.kmeans/k-means.md、src/py3.x/ml/5.Logistic/sklearn_logisticRegression_demo.py | README 声明 CC BY-NC-SA 4.0；API 为 NOASSERTION，未完整复核文件适用许可，状态 unknown，不直接移植代码 |
| [TurboWay/bigdata_analyse](https://github.com/TurboWay/bigdata_analyse) | main tree `2babbf57f4ec56b8363806b5bf80e4c4858a7710`；README、AmoyJob/train.py；另抽样阅读用户行为案例与招聘案例的清洗、指标和预测章节 | GitHub 元数据报告 MIT；未逐字复核 LICENSE 或外部数据授权，复用权利仍待核实 |
| [fighting41love/funNLP](https://github.com/fighting41love/funNLP) | master tree `29f4ac896f11058e87e10968569f999c69679b6f`；仅 README 的词库、情感分析、文本标注索引；未阅读目录所链接的完整模型和语料 | 未核实明确许可；不能以目录公开推定外链语料可商用 |
| [7777777qqll/data-analytics-playbook-Youtube-Legends](https://github.com/7777777qqll/data-analytics-playbook-Youtube-Legends) | main tree `748ef0d5d01a9e67f77945184807942ec23c8bc1`，13 个路径；阅读当前 README 与 SKILL.md | GitHub 元数据报告 MIT；未逐字复核 LICENSE，状态仍待核实 |

无效快照已排除：最初未认证 API 限流后产生的 funNLP 单连字符 tree、第五仓库单连字符 README/tree 含陈旧变量值，不作为学习依据。修复后的双连字符文件以协调者重新采集的当前 API 证据为准。网页缓存中的第五仓库只显示简介和三文件，当前 API 已有实际 Skill；因此本轮不能称它为空仓库，也不声称读过其提及的六位博主课程。

三个前期 tree/README、修复后的两个 tree/README、外部市场研究 Skill 和补采文件分别保留来源哈希。网页阅读的 TurboWay 两个案例是缓存内容，未取得与当前 tree 完全一致的原始字节；本轮仅将其作为抽样案例观察，不能宣称这些网页章节已按 commit 固定。

## 提取结果与取舍

| 来源 | 有用的机制与代表证据 | 证见当前对应 | 取舍 |
|---|---|---|---|
| 市场研究流程 Skill | 数据分析参考强调先定义样本与变量；报告参考按决策组织论证；项目状态参考保存证据和修订依据 | 现有方法路由、分析计划和版本/证据结构可承接 | 增补研究价值、探索与验证、非显著结果诊断、证据到行动的方法卡。作者默认届次、固定页数及展示启动门槛不导入官方规则 |
| Python 资源目录 | 按数据处理、可视化、统计、机器学习组织学习材料 | 分析工作台已有路线和模块两个入口 | 吸收按任务分类的导航。目录外链只是候选资料，不安装所有依赖，不据收录推定正确性 |
| AiLearning | K-means 文件给出距离、初始中心、SSE 的关系；Logistic 文件演示正则化和决策边界，若干片段使用训练评分 | 当前只有描述、关联与 α，尚无聚类/Logistic 引擎 | 抽象成距离、标准化、种子、候选 K、稳定性和防泄漏的契约。教学图与训练分数不能替代研究验收；旧版依赖和示例代码不移植 |
| TurboWay 案例 | 用户行为案例区分事件次数与用户人数；招聘预测文件直接在拟合数据上 score；招聘文档还包含经验填值 | 现有模块已保留有效样本、排除原因和分母 | 保留业务指标层次与可追溯中间结果；拒绝训练评分充当泛化成绩、缺失工资填零、事件比率充当严格用户路径转化等推断 |
| funNLP | 索引分别列出否定词资源、情感分析、标注工具 | 当前没有文本验证流程 | 候选资源登记与独立领域验证分开。先建编码本、标注样本和误判检查，再选工具；不把词云或词典命中当作情感有效性 |
| YouTube Playbook | 当前 SKILL 定义问题、字段映射、原始数据保留、KPI/分层/明细层级与行数对账 | 现有分支计划和结果摘要已有部分基础 | 吸收清晰指标与结果优先的组织方式。ROI 定义需与具体项目核对，来源的默认公式和颜色不设为通用规则；写回外部表格的指令未执行 |

这些机制主要与证见已有 `methods-router.md`、`case-corpus.md` 和规则来源结构一致。本轮补齐用户能查阅的方法说明，保留已完成的计算和编辑工程进度。历史获奖案例只提供结构观察，不作为官方评分或模型有效性的证明。

## 方法库的十张卡

定义位于 `apps/evi-x-platform/lib/research-method-guide.ts`。每张卡都有稳定 ID、研究问题、适用条件、步骤、诊断、输出、限制、来源与能力范围。来源提供可回查链接；卡片文字按证见的问题组织重新表述。

| ID | 内容 | 状态与实际边界 |
|---|---|---|
| question-value | 决策用途、知识增量、探索与验证分工 | planned；只读指引，未实现自动研究价值审查或预注册 |
| sample-denominator | 分支资格、有效样本、重叠原因、比例分母 | implemented；现有口径能力，未自动去重、插补或加权 |
| descriptive-profile | 频数、数值分布、分组比较 | implemented；Welch t / Welch 方差分析、秩检验对照、效应量与 Holm 两两比较，检验以随机抽样为前提 |
| scale-consistency | α、修正题总相关、删项诊断 | implemented；内部一致性，不是效度或单维性验证 |
| categorical-association | 交叉频数、行比例、期望频数、χ²、Cramér V | implemented；未校正 χ² 与 p 值，2×2 稀疏表以 Fisher 精确检验为准 |
| paired-association | Pearson 与有效配对平均秩 Spearman | implemented；双侧 p，Pearson 附 Fisher z 区间，不推因果 |
| segment-stability | 聚类距离、候选 K、多初始值、稳定性、行动画像 | planned；无已接通 K-means 引擎 |
| prediction-validation | 分割、训练内预处理、基线、测试集与校准 | planned；OLS/Logistic/训练与泛化评估未接入 |
| text-coding | 编码本、否定/转折语境、人工标注与领域验证 | planned；模型、标注与验证流程未接入 |
| evidence-action | 发现、证据、行动、责任与评价；跨成果口径 | planned；此卡只提供论证结构，不宣称已有自动一致性核查 |

“implemented”仅描述列明的现有计算或口径范围，不是质量自动核验，不保证当前数据适用。当前计算注册范围以 `ANALYSIS_BLOCKS` 和 `PlanMethod` 为准；方法库不扩大可执行方法集合，也不触发任何模型、网络或付费调用。

## 推进方式及验收依据

第一步提供只读方法库，明确现有能力、准备条件和输出边界。这里不使用教学实现算数，也不由 LLM 编造统计结果。

第二步逐项实现计划能力，每个计算方法要有版本化输入、配置、固定程序、诊断和结果。聚类先验收距离/尺度、多种子稳定性和群人数；预测先验收切分、防泄漏、基线与留出评估；文本先验收标注定义、否定/转折误判和独立验证。没有通过计算验收的卡保持 planned。

第三步连接结论和成果：结果登记数据版本、分析样本、指标定义、计算版本、适用范围；报告、PPT、答辩引用同一记录。建议与可执行负责人、资源、评价基线相连。未知成本保留未知，情景假设标为模拟，拟议试点不冒充效果验证。

官方格式继续由适用届次、组别、地区、赛道和阶段的正式来源决定。外部 Skill 中正文 45–55 页、全册 60–80 页属于作者交付策略；本轮没有核实支持这些数值的官方规则，因此不设硬限制。报告与展示之间的确认流程也不被外部 Skill 自动替换。

本轮验证只覆盖静态数据完整性和 ESLint；未执行外部示例，未跑真实数据、模型或现场调查。独立复核与页面接入由协调者完成。
