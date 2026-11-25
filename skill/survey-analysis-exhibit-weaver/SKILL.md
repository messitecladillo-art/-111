---
name: survey-analysis-exhibit-weaver
description: >-
  Directs the progressive statistical modeling ladder, minimum statistical reporting contracts for 15 analytical methods, strict Table-vs-Figure cognitive division, dual-track code-rendered vs AI-assisted visual exhibit taxonomy across 26+ analytical intents with flexible placement and context weaving, and Booktabs Three-Line Table structures for Chapters 4-6 of Chinese market survey reports.
---

# 实证分析阶梯与图表文织造师（Analysis & Exhibit Weaver）

负责实证建模递进链条与图表—正文协同，原则上**只锁死“统计真伪、口径对齐与零低质冗余”，选图、章位与行文节奏按数据结构与论证需要灵活配置**。

## 五阶渐进实证分析阶梯（按需取舍，不强凑全部阶层）

参考 2023–2025 国奖主干范式（`cronbach_kmo 95%`, `chi_square 88.3%`, `sem_cfa 78.3%`, `kmeans 73.3%`, `logit 65%`, `rf_xgb_shap 51.7%`），遵循“先看盘面→按需分群→结构/效度检验→机理/归因/优先级评估→定性三角互证”的实证推进逻辑：

1. **基线与差异检验**：样本结构与总体参照比对 + 描述分布 + 列联 `χ²`（报 `Cramér's V`）/ `ANOVA` / 非参数检验。
2. **客观分群定位**（可选）：`K-Means` / `K-Modes` / 潜剖面 `LPA`，报选 `K` 依据（轮廓系数/BIC/Entropy）并用**未参与聚类的外生指标**验证分群效度。
3. **测量与优先级评估**：`EFA/CFA`（AVE, CR, 区分效度）→ `SERVPERF` / 熵权-TOPSIS / 模糊评价 + **IPA / KANO / Pareto** 锁定优先改进区。
4. **非线性机理与预测**：`SEM`（横向只验协方差相容性，报拟合优度）/ `Logit`（区别 OR 与概率倍数）/ `XGBoost·LightGBM + SHAP·PDP`（严禁聚类后拿原特征跑分类自证）。
5. **田野定性互证**：深访与三阶扎根编码，补充或解释定量异常拐点。

各模型最小统计量清单见 [15类模型最小报告契约](references/analysis-ladder-and-reporting-contracts.md)。

## 图表双轨体系与灵活选型（代码图 vs 生图模型）

图表按**“是否承载真实量化数据与统计关系”**严格分为两条生产轨（完整图种库与上下文逻辑见 [双轨全谱系图表选型与上下文指南](references/exhibit-selection-matrix.md)）：

- **第一轨 · 代码确定性渲染（所有定量图、拓扑与统计地图）**：
  - **EVI-X 原生矢量已直出**：李克特发散堆叠条形图（`likert`）、回归/Logit `95% CI` 森林图（`forest`）、因子陡坡碎石图（`scree`）、修正 IPA 四象限散点（`quadrant`）、组均值哑铃点图（`dots`）、标准化聚类中心图（`profile`）、相关系数下三角热力图（`correlation`）、分组雨云/小提琴/箱线/点带图（`raincloud` / `violin` / `boxplot`）、马赛克/百分比堆叠/华夫格/棒棒糖（`mosaic` / `waffle` / `lollipop`）、删项 `α` 与校正题总相关图（`alpha_deleted` / `item_correlation`）、Dagre 技术路线图与矢量词云。
  - **Python / R 矢量补充高阶图**：`ForceAtlas2` 共现网、LDA `K` 拐点+气泡、多群轮廓雷达图、桑基流转图、`SHAP` 蜂群/瀑布、`PDP/ICE` 曲线、`SEM` 标准化路径图、`KANO` 四象限、帕累托、`Van Westendorp` / `Gabor-Granger` 定价曲线、`ISM-MICMAC` 递阶与四象限、双层嵌套环/旭日图、`NPS` 三段堆叠与双向镜像对标。
- **第二轨 · 生图模型辅助与混合信息图（非定量概念、美学底图与图标元素）**：
  - **严格限定职责**：仅用于封面底图、可选页框纹理、无虚构数据的田野/机制概念插画，以及“生图提供构图纹理/图标 + 代码叠加冻结数据面板”的**复合描述信息图**。生图阶段严禁伪造坐标刻度与样本数字，严禁冒充实地照片。
- **图与表的分工原则**：表格（[学术三线表 cookbook](references/three-line-tables-cookbook.md)）负责精密参数与可复现审计；图形负责分布形态、空间拓扑、群间对比、象限归位与非线性拐点。同组低维数字不原地“表+饼图”复读。

## 高密度双联与动态结构图表普适范式（跨行业通用，严禁过拟合单一题材）

以下四类高信息密度矢量版式适用于任意行业与受众课题，一律采用**纯白 `#FFFFFF` 无外框、无 SaaS 灰顶栏、100% 中文标签（严禁泄露英文原始字段名）**：

1. **主题剪影词云 × Top-N 高频词条形并排双联图（`pairedBar`）**：左栏（约 56%）呈现与课题受众或核心器物同构的高密度剪影词云，右栏（约 44%）并排绘制 Top-12 高频词横向渐变条形图与精确频次，在同一视觉单元内同时完成“直觉语义聚类”与“精确频数核验”。
2. **表现均值排序条形 × 非循环回归衍生隐性 IPA 四象限双联对照图**：左栏按各测量维度表现均值降序绘制水平条形（标总体均值参考线），右栏绘制“实际表现度 × 衍生隐性重要性”四象限散点（优势维持/优先改进/次要改进/过度投入）。**统计红线**：隐性重要性必须由各维度对**独立总体评价因变量**的非循环回归、偏相关或 Shapley 分解导出，**严禁将由分项自身加权或算术合成的总分 `Y` 再对同一批分项 `X` 回归**制造伪高 `R²` 循环论证。
3. **动态推导的无外框《问卷结构与路由树图》**：在调查设计章节，直接从当前课题的问卷模块列表、题项群与条件跳题规则动态生成纯白无外框横向拓扑树（左根节点→中列模块胶囊→右列具体测量指标与分流路径），零硬编码特定行业词。
4. **二元子群对称镜像水平对比条形图**：当恰为两组核心子群在 `>= 3` 个维度上对标时，优先采用中轴排布纯中文维度名、左右对称延展双群均值/比例并标注组间差值与显著性的镜像水平条形图，强化对标直觉。

## 上下文衔接原则（讲究自然互文，不写死机械公式）

分析段围绕图表的写作没有唯一模板句，只要自然闭合三件事即可：
1. **带出问题与指代**：先交代为何看这组证据，正文准确点出 `{图/表编号}` 与必要的口径/前提；
2. **抓住核心反差**：提炼最关键的极值、分布偏态、区间跨越或意外不显著结果，不逐格抄表念数字；
3. **顺势导引下文**：用这幅图暴露的局限或断点自然引向下一阶段检验、模型或田野解释（位置随报告母型与叙事张力自定，不硬锁死到特定章号）。
