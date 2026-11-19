---
name: survey-report-architect
description: >-
  Master architect and orchestrator for national-award-caliber Chinese market survey and statistical analysis reports (正大杯全国大学生市场调查与分析大赛等一级赛事标准). Use when planning, scoping, outlining, restructuring, or orchestrating a full survey report from topic selection through final red-team gate, selecting structural archetypes, enforcing a single Mother Insight thread across chapters, and managing the strict 65-page combined submission budget.
---

# 调研报告总架构师（Master Architect）

基于全量 205 篇正大杯国奖报告（172 份可选中文本 + 33 份 OCR 扫描件，总计 18,148 页，其中 2023–2025 届 60 篇）及第 17 届官方竞赛规程，统筹整篇报告的**结构母型、单核主线与全流程技能调度**。

## 多技能协同调度路由（Pipeline Router）

按调研与成文阶段依次挂载子技能，避免单技能塞入全部细节导致上下文稀释：

1. **定题破题、文献图谱与抽样方案（第 1–3 章）** → 加载 `survey-topic-and-design-craft`
2. **调查问卷与核心量表构念工程（附录前置设计）** → 加载 `survey-questionnaire-architect`
3. **五阶实证建模与图文互文织造（第 4–6 章）** → 加载 `survey-analysis-exhibit-weaver`
4. **单页高密摘要、去AI行文、因果克制与对策闭环** → 加载 `survey-prose-abstract-action-forger`
5. **官方 A4 几何版式、中性克制配色与科研制图规范** → 加载 `survey-visual-layout-typesetting`
6. **对抗式红队质检、匿名清零与 AI 透明披露门禁** → 交付前必跑 `survey-report-redteam-auditor`

## 核心建筑铁律

### 1. 一条“母洞察（Mother Insight）”贯穿全篇
禁止出现“第2章爬虫分析一套主题、第3章问卷另问一套维度、第5章模型自说自话、第7章对策空喊政企协同”的四张皮割裂。动笔前先凝练 1 句**核心张力判断**（例：“高认知渗透与低复购转化之间的情绪—服务断点”），确保每一章仅作为该母洞察在不同方法论下的递进证明。

### 2. 六大结构母型择优锁定
根据研究客体（消费者 / 政策受众 / 产业多端 / 文旅空间 / AI 数字产品 / 舆论热点）匹配对应章节拓扑，严禁生搬硬套单一模板（如产品类报告硬塞无意义的五力模型）。具体架构序列、适用条件与反模式详见 [六大结构母型库](references/structural-archetypes.md)。

### 3. 17 届“合并 <= 65 页”硬顶篇幅预算
官方规程明确：**报告正文提交件 = 标题页 + 摘要页 + 目录页 + 正文（含参考文献），合计不得超过 65 页**，附录（问卷、访谈提纲、代码、AI 披露等）须单独分卷提交；2023–2025 年样本全文本层正文终止页中位数恰好为 `65.0` 页。
- 标题+摘要+目录：严格压缩在 **3–4 页**（摘要尽量锁死 1 页或 2 页整版，严禁尾部溢出 3–5 悬空行）。
- 第 1–3 章（破题+预探索+抽样设计）：控制在 **14–18 页**，绝不在二手政策复读上耗尽篇幅。
- 第 4–6 章（现状分群+评价/机理建模+质性互证）：占比 **30–35 页**（全篇重资产核心，2023–2025 年高水平作品中位含图 76–82.5 张、表 50.5–52 张，图表精简高密优先于盲目堆量）。
- 第 7 章（模型化对策与结语参考文献）：**6–9 页**，直接以“实证断点→主体→抓手→KPI”矩阵收束。

### 4. 章间无缝搭桥（严禁 AI 机械报幕）
绝不使用“本章对……进行了分析，下一章我们将继续探讨……”等空洞路牌。每章末尾必须**抛出本阶方法尚无法解释的统计悬念**，自然引出下一阶模型（如：“描述统计揭示 18–25 岁群体‘高关注却低支付’，但无法剥离交互体验与风险担忧的净效应，下文借助多群组 SEM 与有序 Logit 加以识别”）。具体句法库详见 [母洞察与跨章过渡桥](references/inter-chapter-bridges.md)。

## 深入参考手册

- [六大结构母型与分章预算矩阵](references/structural-archetypes.md)
- [母洞察统摄与跨章/跨节过渡桥模板](references/inter-chapter-bridges.md)
- [2014–2025 国奖报告量化演化与竞赛基准](references/era-evolution-and-stats.md)
