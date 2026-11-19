---
name: survey-topic-and-design-craft
description: >-
  Guides Chapters 1-3 of competitive survey reports: dual-segment hook-and-subtitle titling, macro-to-micro decision tension framing, literature knowledge-graph linkage, exploratory web NLP / grounded-interview pre-research that directly feeds questionnaire constructs, white-box multistage stratified/PPS sampling tables, design-effect (Deff) sample sizing, pilot purification, and 4-stage data cleaning with Runs Test.
---

# 破题设计与调查方案工艺（Ch 1–3 Craft）

负责定题破题、文献机制梳理、网络舆情/预访谈“前哨战”以及无懈可击的抽样质控方案，解决“破题像政策文件、文献像报菜名、抽样公式乱套、前哨与问卷脱节”四大评审扣分点。

## 第 1 章：破题与文献工艺

1. **双段式标题配方（语料命中率 86.8%，178/205）**
   - 架构：`[具象场景/核心矛盾/微诗意主钩子]——[时间/空间范围 + 研究客体 + 核心研究变量与方法后缀]`。
   - 正面范式：`"“莓”问题！——丹东九九草莓消费者需求调查及市场机会挖掘分析报告"`、`"小智在线，烦恼不见——AI客服对消费者在线购买意愿的影响及其服务优化调查研究"`。
   - **黑名单**：四字成语堆砌、无后缀单句口号、刻意拗口谐音梗（如常见国三病句式拟题）或遗漏核心调查客体/区域界定。
2. **三拍决策张力开篇**：宏观行业/政策大盘（精准数据源） → **“然而”转折下的结构性反差痛点**（供需错配、满意度裂谷） → 收束为 **3–4 个可测量研究子问题**，直接绑定后文各章方法。
3. **文献综述构念化**：拒绝流水账罗列学者人名。必须输出**高频关键词共现/演化梳理 + 理论模型维度对照表**，证明本文的问卷维度与待检假设（H1–Hn）有严谨学理继承。详见 [破题与文献图谱配方](references/title-and-tension-formulas.md)。

## 第 2 章：预探索“前哨战”向问卷焊接

2023–2025 届样本中 `text_nlp` 命中率高达 **96.7% (58/60)**，但最致命低级错误是“爬虫词云、SnowNLP 情感饼图放在第2章当花瓶，第3章问卷题目完全拍脑袋设定”。
- **强制焊接规则**：网络评论挖掘（TF-IDF / ForceAtlas2 / LDA 主题）与预调研深度访谈（扎根理论开放/主轴/选择性编码）的产出，必须汇总成一张 **《前哨发现→正式问卷构念与题项映射表》**，写明哪几条高频痛点催生了哪几个新增观测题项或量表维度修正。详见 [预探索向问卷转化指南](references/exploratory-to-survey-bridge.md)。

## 第 3 章：白盒抽样与四级质控防线

1. **诚实分类与级联表**：
   - 若采用**多阶段分层/PPS 抽样**：必出《多阶段抽样框级联与配额分配表》，逐级写清辅助变量（如统计年鉴常住人口）、抽样概率、入样单元及编码。
   - 样本量计算明确列出精度 `e`、置信度 `Z`、预调查方差 `p(1-p)`、设计效应 `Deff`（多阶段通常取 `1.2–1.6`）与预计回收率调整。
   - **红线隔离**：若实际执行为线上滚雪球、拦截偶遇或配额便利抽样，**严禁伪装套用简单随机抽样（SRS）误差公式冒充严格概率抽样**；应坦诚界定抽样性质，并采用人口结构配额约束或事后权重校准（Post-stratification）交代代表性边界。
2. **预调查双重净化**：汇报预调查样本（通常 `N=100–200`）后具体删改了哪几道冗余、双管齐下或诱导性题项，并用“净化前 vs 正式调查”信效度对比表展现 Cronbach's α 与 KMO 阶梯跃升。
3. **四级数据清洗漏斗 + 游程检验（Runs Test）**：依次呈现 `原始回收 N → 剔除甄别不合格 → 剔除极短作答时长（如 <P10 或 <60~120s） → 剔除注意力/测谎题失败与零方差“一条龙”作答 → 最终有效 N 及有效率`，附统计随机性游程检验 `Z / p` 值；**严禁使用邻近均值填充有序李克特缺失项**。详见 [白盒抽样与四级清洗协议](references/sampling-and-cleaning-protocols.md)。
