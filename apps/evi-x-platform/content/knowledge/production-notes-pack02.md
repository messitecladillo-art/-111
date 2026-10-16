# 知识内容包 02：经济社会、空间研究与哲学论证

## 生产范围与交接

- 协议：agent-collab/v1；任务 nonce：content-pack02-20261014。
- 发送者 / 生产者：/root/knowledge_api；接收者：/root 与独立内容复核者。
- 输入基线：abe5752e03dd872437d42551dc8d57028f2fc33c；实际文件位于 knowledge-mirror 管理工作树。
- 生产租约：3 小时；无再委派、无用户答卷、无密钥访问、无 Git 提交或外部发布。
- 目标文件：pack-02-social-spatial.json；包版本 2026.10.15-b02；每个独立概念版本均为整数 1。
- 完成时间：2026-10-14 16:41 UTC（北京时间 2026-10-15 00:41）；本记录不是语义接受或发布批准。
- 已观察数量：100 个独立概念，28 个深入条目、72 个简释条目；经济社会管理 50、地理空间 30、哲学论证 20；6 个公式；76 个不同来源 URL。
- 文件 SHA-256：22b8e19278f19f0c8b68c91f9927d8d17a7879f5944bca3e6ee3c769be664798。任何修订或审核元数据变化之后须重新计算。
- 全部条目为 draft，生产者未将自己的内容标成 reviewed。发布由不同身份的复核者或协调者处理。

## 原创解释、权限与内容边界

定义、用途、辨析、追问和例子是针对研究任务重新组织的原创短解释。所有例子都以“示例：”开头，用于教学，不是问卷回答、项目观察或真实效果。没有引入私有教材、完整题库、获奖作品全文、第三方图片或图表。来源不属于项目实证证据。

来源以框架提出者、原论文公开摘要、作者机构、官方技术文档与独立署名百科条目为主。每个来源保存具体定位与解释范围。商业指标提出方的宣传效果不作为事实，例如 NPS 的增长承诺未进入条目。

公开可读不等于可复制全文。本包没有导入教材长段落或原图。生产中发现 OpenStax 2026 年版权页存在额外使用条件，因此本包没有采用 OpenStax 的正文或素材；后续若将长引文、教材或图形放入可再分发库，应独立核查许可。本包也没有把所有 source URL 的网页或 PDF 全文存入库。

## 重点语义边界

- 弹性：保留价格弹性符号；点弹性与区间近似分开；问卷意向不能直接当作真实价格变化识别。
- WTP/WTA：明确交易和初始权益；陈述意愿、实际付款和接受补偿不是同一记录。
- 消费者剩余：单单位差额公式不能无条件替代总体福利计算；消费者剩余、感知价值和满意度区分。
- 沉没成本：不可收回的过去费用与可出售资源的机会成本区分。
- 公共物品：以非竞争与非排他属性判断，不按免费或政府提供判断；公共池资源单独解释。
- 信息问题：逆向选择的隐藏类型、道德风险的隐藏行动和样本选择偏差分开。
- NPS：7–8 分中立者仍进入分母；净值不是推荐人数比例；不承诺普遍业务预测效果。
- 顾客旅程：允许跨渠道、循环与多方触点；旅程图是过程组织，不能替代过程证据。
- 行动评价：投入、活动、产出与结果分开；逻辑模型与变革理论是待检验路径，不是已确认效果。
- 空间权重：权重定义、ID 顺序、标准化、孤立单元和合理尺度须记录。
- 空间滞后：Wy 是变换，只有行和为 1 才可称邻居加权平均；不由关联直接主张溢出因果。
- 局部统计：Local Moran、Gi*、核密度不是同一对象；显著性、多重比较与平滑尺度分开。
- 空间异质性：位置数值不同不自动说明关系非平稳；生态推断和聚合边界限制保留。
- 距离与服务：测地距离、网络阻抗、几何缓冲与实际可达性分别解释；不可达不记为零。
- 地理数据：栅格重采样不新增观测；地理矢量不与机器学习向量混为同义。
- 克里金：所列约束对应普通克里金；权重可为负，预测方差依赖模型且不包含全部模型不确定性。
- 哲学：科学实在论不是保证模型真实；实用主义不是“有用即真”；逻辑经验主义不与一般实证研究合并计数。
- 论证：论证有效性和量表效度分开；有效结构不保证前提真实；未反驳不等于证实。
- 反事实：未发生情境的推理与真实结果分开；不把另一个群体直接视作同一对象的反事实。
- 方法论个体主义：方法立场不等于自利伦理；结构与个体解释可以相互关联。

## 计数与接口

别名、缩写不重复计数。没有新增 core-60 已收录的 Euclidean distance、CRS/WGS84/Moran I 等作为新概念。空间异质性与空间非平稳性按“总体差异 / 关系参数随位置变化”区分；地理配准与地址编码按输入和输出区分。

cross-reference 只指向 core-60 与本包 ID。methodIds、materialIds 和 toolLinks 保留空数组；本包没有将理论、GIS 或未实现的统计方法伪装成现有执行能力。后续编辑位置可以关联这些说明，工具链接需核实实际实现后再加入。

## 实际验证与结果

1. 使用现有 lib/knowledge/types.ts 的 validateKnowledgePack，合并 core-60 与本包后通过，exit 0。
2. 在当前 core-60、pack01、pack02、pack03 360 条中检查唯一 ID，通过，exit 0。此时 pack03 存在大写 source.id 导致其单独 schema 不通过，已交给生产者和协调者，未擅自修改。
3. 100/28/72、整数版本、draft / producer、深入条目的辨析和追问、所有示例标记、HTTPS 与关联存在检查通过，exit 0。
4. 6 个公式通过 KaTeX renderToString 的 throwOnError=true、trust=false、strict=error，exit 0。
5. 自查五个教学算例：单笔剩余 80−50=30；NPS 40%−30%=10；邻居加权平均 15；四倍面积对应两倍半径；15 分钟阈值内 3+4=7 个机会，exit 0。

实际运行使用 Node v24.15.0，工作目录 apps/evi-x-platform，命令入口为 node --experimental-strip-types --input-type=module -e，读取本包与 core-60，调用上述生产校验函数。公式检查使用真实已安装 katex，未采用公式占位器。

这些结构、渲染和算例自查不替代独立语义与来源核对。未在本子任务测试 UI、OCR、搜索召回、联网预算、PostgreSQL、教师权限或生产构建；协调者负责相关验收。

## 来源访问证据范围

- 原论文公开摘要或作者机构摘要：Teas/Agarwal、Oliver、Singh/Sirdeshmukh、Iyengar/Lepper、Bojanic/Rosen、Barreto、Keller、GWmodel。摘要只支持摘要中的概念，不声称已读付费全文或复核量表全部条目。
- 已读取相关正文而未声称通读：Lemon/Verhoef 作者机构 PDF 的旅程与触点段落；Farrell/Klemperer 作者机构工作论文的转换成本与网络效应部分；MIT 2023 讲义的弹性与消费概念部分；官方 GIS/软件文档和 SEP 相关章节。
- 公开主来源的检索缓存可读、直连曾失败：诺奖 2001 信息不对称、Thaler 2017 PDF、IMF 环境估值、Laibson 原稿 PDF。相应内容仅在已返回段落的范围使用，未隐瞒 403 / timeout。Laibson 作者主页与机构仓储也核实了文献身份。
- 已排除失败路径：旧 Esri Kriging 文档和技工演讲 PDF 失效 / 重定向到活动索引；错误 CDC step-2 路径；不存在的 SEP naturalism-social / collective-action 路径；仅收录元数据的 Zeithaml DOI 不作为感知价值正文来源。已改为实际可读的官方文档或原论文摘要。
- 无主来源网页被当作执行指令；文档条目仅承载研究概念和出处。

## 条目 ID 清单

```text
price-elasticity-demand
income-elasticity-demand
cross-price-elasticity
willingness-to-pay
willingness-to-accept
consumer-surplus
marginal-utility
diminishing-marginal-utility
marginal-cost
sunk-cost
externality
public-good
common-pool-resource
information-asymmetry
adverse-selection
moral-hazard
transaction-cost
bounded-rationality
loss-aversion
reference-dependence
framing-effect
present-bias
nudge
default-effect
choice-overload
value-proposition
perceived-value
customer-satisfaction
customer-loyalty
net-promoter-score
customer-journey
touchpoint
service-quality
perceived-risk
switching-cost
network-effects
word-of-mouth
brand-equity
positioning
target-market
stakeholder-analysis
logic-model
theory-of-change
key-performance-indicator
input-output-outcome
cost-benefit-analysis
cost-effectiveness-analysis
social-capital
social-norms
collective-action
spatial-weights
spatial-lag
spatial-nonstationarity
spatial-heterogeneity
local-morans-i
getis-ord-gi-star
spatial-join
buffer-analysis
spatial-kernel-density
nearest-neighbor-index
geocoding
georeferencing
projection-distortion
geographic-coordinate-system
projected-coordinate-system
geodesic-distance
spatial-boundary-effect
network-distance
accessibility
catchment-area
location-allocation
choropleth-map
proportional-symbol-map
spatial-resolution
raster-data
vector-geodata
topology-geographic
spatial-interpolation
kriging
spatial-mismatch
ontology
logical-empiricism
interpretivism
scientific-realism
pragmatism
argument-validity
argument-soundness
explanatory-mechanism
necessary-condition
sufficient-condition
counterexample
counterfactual-reasoning
underdetermination
theory-ladenness
circular-reasoning
straw-man
appeal-to-authority
burden-of-proof
value-judgment
methodological-individualism
```

## 实际采用来源清单

以下为本包内的 76 个 URL；完整阅读范围以每条 locator / scope 和上述访问证据范围为准，列表长度不代表全文复核数量。

- MIT 14.01 2023 Lecture Summaries：https://ocw.mit.edu/courses/14-01-principles-of-microeconomics-fall-2023/mit14_01_f23_full.pdf — 2.1 Demand；PDF 第 6–8 页
- MIT: Deriving Demand Curves：https://ocw.mit.edu/courses/14-01sc-principles-of-microeconomics-fall-2011/pages/unit-2-consumer-theory/deriving-demand-curves/ — Concept Quiz, Question 1 的解答；cross-price elasticity
- MIT Lecture 13: Welfare Economics：https://ocw.mit.edu/courses/14-01sc-principles-of-microeconomics-fall-2011/resources/lecture-13-welfare-economics/ — Lecture 13；支付意愿与消费者剩余
- HM Treasury: The Green Book 2026：https://www.gov.uk/government/publications/the-green-book--2/the-green-book-2026 — Appraising options；6.32 sunk costs；cost-benefit and cost-effectiveness
- IMF: The Economist’s Approach to Sustainable Development：https://www.elibrary.imf.org/view/journals/022/0030/004/article-A006-en.xml — Environmental valuation：willingness to pay and willingness to accept compensation
- Daniel Kahneman: Maps of Bounded Rationality：https://www.nobelprize.org/uploads/2018/06/kahnemann-lecture.pdf — Reference dependence、loss aversion 与 framing 段落
- MIT Preferences and Utility：https://ocw.mit.edu/courses/14-01sc-principles-of-microeconomics-fall-2011/pages/unit-2-consumer-theory/preferences-and-utility/ — Preferences and Utility 单元及边际效用说明
- IMF Back to Basics: Supply and Demand：https://www.imf.org/en/publications/fandd/issues/series/back-to-basics/supply-and-demand — What determines supply and demand；marginal cost and utility
- IMF Back to Basics: Externalities：https://www.imf.org/en/publications/fandd/issues/series/back-to-basics/externalities — Externalities；positive and negative effects；private and social costs
- IMF Back to Basics: What Are Global Public Goods?：https://www.imf.org/en/Publications/fandd/issues/2021/12/global-public-goods-chin-basics — Public goods；nonrivalry and nonexcludability
- Elinor Ostrom: Nobel interview transcript, 2009：https://www.nobelprize.org/prizes/economic-sciences/2009/ostrom/164465-ostrom-williamson-interview-transcript/ — 作者关于公共池资源与共同治理的访谈
- Nobel Prize 2001: Markets with Asymmetric Information：https://www.nobelprize.org/prizes/economic-sciences/2001/press-release/ — Information asymmetry；Akerlof、Spence、Stiglitz 的贡献
- Roger Myerson: Biographical：https://www.nobelprize.org/prizes/economic-sciences/2007/myerson/biographical/ — 作者关于 hidden actions、moral hazard 与 adverse selection 的段落
- Ronald Coase: The Institutional Structure of Production：https://www.nobelprize.org/prizes/economic-sciences/1991/coase/lecture/ — Transaction costs；information、negotiation、contracts、enforcement
- Herbert Simon: Rational Decision-Making in Business Organizations：https://www.nobelprize.org/uploads/2018/06/simon-lecture.pdf — Bounded rationality 与组织决策段落
- David Laibson: Golden Eggs and Hyperbolic Discounting：https://scholar.harvard.edu/files/laibson/files/golden_eggs_and_hyperbolic_discounting.pdf — Abstract and Introduction；dynamic inconsistency and commitment
- Richard Thaler: From Cashews to Nudges：https://www.nobelprize.org/uploads/2018/01/thaler-lecture.pdf — Nudges、choice architecture、default pension plans；印刷页 510
- Iyengar and Lepper: When Choice Is Demotivating：https://business.columbia.edu/faculty/research/when-choice-demotivating-can-one-desire-too-much-good-thing — 作者机构公开 Abstract；2000
- Strategyzer: The Value Proposition Canvas：https://www.strategyzer.com/library/the-value-proposition-canvas — Customer jobs、pains、gains 与价值主张匹配
- Teas and Agarwal: Extrinsic Product Cues, Quality, Sacrifice, and Value：https://journals.sagepub.com/doi/10.1177/0092070300282008 — Abstract；Journal of the Academy of Marketing Science 28(2), 2000
- Oliver: A Cognitive Model of Satisfaction Decisions：https://journals.sagepub.com/doi/10.1177/002224378001700405 — Abstract；Journal of Marketing Research 17(4), 1980
- Singh and Sirdeshmukh: Agency and Trust Mechanisms：https://journals.sagepub.com/doi/10.1177/0092070300281014 — Abstract；Journal of the Academy of Marketing Science 28(1), 2000
- Bain: Measuring Your Net Promoter Score：https://www.netpromotersystem.com/about/measuring-your-net-promoter-score/ — Promoters 9–10；Passives 7–8；Detractors 0–6；NPS calculation
- Lemon and Verhoef: Understanding Customer Experience Throughout the Customer Journey：https://pure.rug.nl/ws/files/81733365/Understanding_Customer_Experience_Throughout_the_Customer_Journey.pdf — Customer Journey and Touch Points；正文页 76–78；Figure 1
- Bojanic and Rosen: Measuring Service Quality in Restaurants：https://scholarsmine.mst.edu/bio_inftec_facwork/566/ — 作者机构公开 Abstract；Journal of Hospitality & Tourism Research 18(1), 1994
- Online customer behavior: perceptions of risks incurred through online purchases：https://www.nature.com/articles/s41599-020-0389-4 — Perceived risk；风险维度与研究设计段落
- Farrell and Klemperer: Coordination and Lock-In：https://www.nuff.ox.ac.uk/economics/papers/2006/w7/Farrell_KlempererWP.pdf — Abstract；2 Switching Costs；3 Network Effects
- Barreto: The Word-of-Mouth Phenomenon in the Social Media Era：https://journals.sagepub.com/doi/abs/10.2501/IJMR-2014-043 — Abstract；International Journal of Market Research 56(5), 2014
- Keller: Customer-Based Brand Equity：https://journals.sagepub.com/doi/10.1177/002224299305700101 — Abstract；Journal of Marketing 57(1), 1993
- AMA Marketing Competency Model：https://www.ama.org/ama-marketing-competency-model/ — Strategy & Planning；Positioning & Targeting
- AMA: Better Segmentation for Better Insights：https://www.ama.org/marketing-news/better-segmentation-for-better-insights/ — Segmentation Overview 与优先细分群体
- Government Analysis Function: Stakeholder Mapping：https://analysisfunction.civilservice.gov.uk/policy-store/stakeholder-mapping/ — How to map stakeholders；Assessing power and interest
- CDC: Step 2 Describe the Program：https://www.cdc.gov/evaluation/php/evaluation-framework-action-guide/step-2-describe-the-program.html — Logic models；inputs、activities、outputs、outcomes
- CDC Program Evaluation Framework, 2024：https://www.cdc.gov/mmwr/volumes/73/rr/rr7306a1.htm — Describe the Program；logic model assumptions and contextual factors
- GOV.UK Service Manual: Using performance data to improve your service：https://www.gov.uk/service-manual/measuring-success/using-data-to-improve-your-service-an-introduction — Metrics and measurements；Choosing KPIs
- OECD: Applying Evaluation Criteria Thoughtfully：https://www.oecd.org/en/publications/applying-evaluation-criteria-thoughtfully_543e84ed-en/full-report/understanding-the-six-criteria-definitions-elements-for-analysis-and-key-challenges_2843ff7d.html — Efficiency；effectiveness；results chain
- OECD: Four Interpretations of Social Capital：https://www.oecd.org/en/publications/four-interpretations-of-social-capital_5jzbcx010wmt-en.html — Abstract；relationships、support、civic engagement、trust
- Stanford Encyclopedia of Philosophy: Social Norms：https://plato.stanford.edu/entries/social-norms/ — 3–5；Empirical and normative expectations
- Luc Anselin: Spatial Weights, GeoDa Workbook：https://geodacenter.github.io/workbook/4a_contig_weights/lab4a.html — Spatial weights basic concepts；Queen and Rook contiguity
- PySAL: W to Graph Migration Guide：https://pysal.org/libpysal/stable/user-guide/graph/w_g_migration.html — Spatial Lag；weighted sum and row-standardized weighted average
- Esri: Geographically Weighted Regression：https://pro.arcgis.com/en/pro-app/3.3/tool-reference/spatial-statistics/geographicallyweightedregression.htm — Summary；spatially varying relationships
- Gollini et al.: GWmodel Further Topics for Spatial Heterogeneity：https://arxiv.org/abs/1312.2753 — 作者原稿 Abstract；局部统计与非平稳性
- Esri: How Cluster and Outlier Analysis Works：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-statistics/h-how-cluster-and-outlier-analysis-anselin-local-m.html — Local Moran I；HH/LL/HL/LH；permutation and FDR
- Esri: How Hot Spot Analysis Getis-Ord Gi* Works：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-statistics/h-how-hot-spot-analysis-getis-ord-gi-spatial-stati.html — Gi* statistic；spatial weights；FDR correction
- Esri: Spatial Join：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/analysis/spatial-join.html — Join operation；Match option；Join_Count
- Esri: Buffer：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/analysis/buffer.html — Distance；Planar and Geodesic methods
- Esri: How Kernel Density Works：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-analyst/how-kernel-density-works.html — Point features；Search radius；Population field；Barriers
- spatstat: K-function and Edge Corrections：https://search.r-project.org/CRAN/refmans/spatstat.explore/html/Kest.html — Details；unobserved neighbours and border/translation/isotropic corrections
- Esri: How Average Nearest Neighbor Works：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-statistics/h-how-average-nearest-neighbor-distance-spatial-st.html — Average nearest neighbor ratio；Study area and independence
- Esri: Locator geocode Method：https://doc.esri.com/en/arcgis-pro/latest/arcpy/geocoding/locator-class.html — geocode(searchText, ...)：candidate points and score
- Esri: Overview of Georeferencing：https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/overview-of-georeferencing.html — Control points；transformations；RMS error
- Esri: Choose the Right Projection：https://learn.arcgis.com/en/projects/choose-the-right-projection/ — Conformal、equal-area、equidistant 与任务选择
- ArcGIS: Coordinate Systems：https://developers.arcgis.com/geoanalytics-fabric/core-concepts/coordinate-systems/ — Geographic and projected coordinates；planar and geodesic measurements
- Esri: Service Area Analysis Layer：https://doc.esri.com/en/arcgis-pro/latest/help/analysis/networks/service-area-analysis-layer.html — Polygons and Lines；Travel Settings；Cutoffs
- FHWA: Freight Performance Measure Primer, Chapter 4：https://ops.fhwa.dot.gov/publications/fhwahop16089/chp4.htm — Accessibility；contour/cumulative opportunities and gravity measures
- Esri: Location-Allocation Analysis Layer：https://doc.esri.com/en/arcgis-pro/latest/help/analysis/networks/location-allocation-analysis-layer.html — Facilities；Demand Points；Problem Type
- Esri: Normalization for Choropleth Maps：https://www.esri.com/arcgis-blog/products/arcgis-online/mapping/normalization-for-choropleth-maps — Choropleth maps versus graduated/proportional symbols
- Esri: Proportional Symbols：https://doc.esri.com/en/arcgis-pro/latest/help/mapping/layer-properties/proportional-symbology.html — Relative Size；unclassed symbols；appearance compensation
- QGIS 3.40: Raster Data：https://docs.qgis.org/3.40/en/docs/gentle_gis_introduction/raster_data.html — 6.1–6.5；cells、bands、Spatial Resolution
- QGIS 3.40: Vector Data：https://docs.qgis.org/3.40/en/docs/gentle_gis_introduction/vector_data.html — Points、Polylines、Polygons 与属性
- QGIS 3.40: Topology：https://docs.qgis.org/3.40/en/docs/gentle_gis_introduction/topology.html — 7.1–7.3；adjacency、connectivity、topology rules
- Esri: How Kriging Works：https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-analyst/how-kriging-works.html — Kriging formula；Variography；prediction and variance
- Michael Stoll: Job Sprawl and Spatial Mismatch：https://www.brookings.edu/articles/job-sprawl-and-the-spatial-mismatch-between-blacks-and-jobs/ — 作者原创研究摘要；位置、就业与通达障碍
- Stanford Encyclopedia of Philosophy: Logic and Ontology：https://plato.stanford.edu/entries/logic-ontology/ — 3 Ontology；objects、properties、relations
- Stanford Encyclopedia of Philosophy: Logical Empiricism：https://plato.stanford.edu/entries/logical-empiricism/ — Logical empiricism and verification；历史流派内部差异
- Stanford Encyclopedia of Philosophy: Methodological Individualism：https://plato.stanford.edu/entries/methodological-individualism/ — 1–2；individual actions、Weber and interpretation
- Stanford Encyclopedia of Philosophy: Scientific Realism：https://plato.stanford.edu/entries/scientific-realism/ — 1.1；Metaphysical、semantic、epistemic commitments
- Stanford Encyclopedia of Philosophy: Pragmatism：https://plato.stanford.edu/entries/pragmatism/ — The Pragmatic Maxim；practical consequences
- Stanford Encyclopedia of Philosophy: Logical Consequence：https://plato.stanford.edu/entries/logical-consequence/ — Truth preservation；validity and form
- Stanford Encyclopedia of Philosophy: Mechanisms in Science：https://plato.stanford.edu/entries/science-mechanisms/ — Entities、activities、organization；how-possibly and how-actually
- Stanford Encyclopedia of Philosophy: Necessary and Sufficient Conditions：https://plato.stanford.edu/entries/necessary-sufficient/ — Standard theory；material implication and converse
- Stanford Encyclopedia of Philosophy: Counterfactuals：https://plato.stanford.edu/entries/counterfactuals/ — Counterfactual conditionals；possible situations and causal reasoning
- Stanford Encyclopedia of Philosophy: Scientific Underdetermination：https://plato.stanford.edu/entries/scientific-underdetermination/ — Evidence and competing explanations
- Stanford Encyclopedia of Philosophy: Theory and Observation in Science：https://plato.stanford.edu/entries/science-theory-observation/ — Theory-ladenness and observation
- Stanford Encyclopedia of Philosophy: Fallacies：https://plato.stanford.edu/entries/fallacies/ — Begging the question；straw man；appeal to authority；burden of proof
- Stanford Encyclopedia of Philosophy: Value Theory：https://plato.stanford.edu/entries/value-theory/ — 1 Basic Questions；good、better、good for

## 独立复核与下一步

接收者应复核全部概念是否独立、别名是否准确、定义与出处是否一致，重点抽查 NPS 分母、价格弹性、空间统计、普通克里金约束与反事实因果边界。若发现正文问题，应先形成定位，再由生产者做版本内修订，重新生成哈希。保持旧引用精确版本与此内容包发布状态分离。

本次 outcome：done（生产与自查完成）；内容语义接受及公开发布：pending independent review。

## 独立复核后的生产者修订（2026-10-15）

以上记录保留初次冻结的历史。/root/knowledge_core 独立复核指出以下具体问题，生产者已按限定边界修复，尚未自行批准：

- 2026 Green Book 的实际 HTML 使用 Sunk costs 标题，旧定位中的 6.32 编号不准确；所有相关来源定位改为 Appraising options → Sunk costs / cost-benefit and cost-effectiveness。
- MIT 福利视频入口不能在本轮证明可读讲稿；WTP 与消费者剩余改为已经读取的 MIT 2023 讲义 4.1.2 Consumer Surplus，PDF 第 17 页，明确对应边际支付意愿与价格。
- arXiv 1312.2753 的作者是 Lu、Harris、Charlton 与 Brunsdon，旧来源标题错写 Gollini；已更正为 Lu et al. 的实际论文题名。
- 投入/产出/结果例子改为：组织培训是活动，完成培训人数与提供引导次数是产出，迷路比例变化是结果。

修订后仍为 100 个概念、28 深入 / 72 简释、6 个公式、全部 draft。不同来源 URL 为 75 个（合并复用了同一份 MIT 2023 讲义）；上面的 76 URL 数量与旧来源清单属于初次冻结历史，不能作为当前发布清单。

新冻结内容 SHA-256：28d521c900d32c9f741da6054208c10df011a413ea330a65e3f1b2508d2ad206。生产 schema 与 6 个公式的严格 KaTeX 渲染再次通过，exit 0；原算例数值未改变。独立审校者将在该修订上重新核对并单独登记审核结果。

最终来源定位修订：论证健全性改引实际支持“有效论证且前提为真”的 SEP Informal Logic §4.1 AV Criteria，避免与逻辑证明系统的 soundness 定义混淆。正文定义不变。最终来源为 76 个 URL；冻结内容 SHA-256：cfc3a03671bafeb7182158df4f54b0b6e5514d11db41b50e1a2e11bc741a96ec。此前哈希仅保留为修订历史。

科学实在论的来源段落定位补全为 SEP §1.1–1.2，明确认识态度及实在论的三个维度，定义未改。最终交给审校者的输入 SHA-256：7c0f10ceeba87f834d564cff966b6a4af1ce3d52c8a6764917c5d1983a8e0323。审校者已独立通过内容、来源、6公式、7算例与查询回归后，仍需将该准确定位修订绑定到最终审核记录。
