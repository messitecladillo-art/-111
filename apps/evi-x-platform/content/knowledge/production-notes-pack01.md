# 知识内容包 01：统计、研究、机器学习与数学

## 交付范围与状态

- 协议：`agent-collab/v1`；任务 nonce：`content-pack01-20261014`。
- 生产者：`/root/knowledge_content`；接收者：`/root`、`/root/knowledge_core`。
- 输入基线：`abe5752e03dd872437d42551dc8d57028f2fc33c`。
- 文件：`pack-01-stats-research.json`；包版本：`2026.10.14-b01`；单条内容版本：整数 `1`。
- 生成日期：2026-10-14；结构复核时间：2026-10-14 15:59—16:02 UTC。
- 原始任务租约：3 小时；本包属于既定知识建设 B 批次的 100 条边界，不改动首 60 条。
- 数据分类：公开主来源与原创教学解释；无答卷、密钥、私有教材全文、完整试题或作品全文。
- 观察到的数量：100 个新概念，28 个深入条目、72 个简释条目；统计 45、研究 20、机器学习 15、数学 20；20 个公式；73 个实际浏览的来源 URL。
- 审校状态：全部 `draft`。结构通过不代表独立语义审校通过。复核人须与生产者不同，批准后的元数据由独立复核者或协调者写入。
- 本包 SHA-256：`6b451ad5a15593273c80538f16f0bf53ef9bb1abb1c8e65e3198b4043eaba430`。后续内容修订或审校元数据修改会改变哈希，验收时须重新计算。

## 原创与适用范围

每个定义和例子均为知识层的原创解释。例子以“示例：”开头，供理解概念，不属于项目实证结果。公式为标准数学关系，条件和符号逐条列明。来源保存到具体条目，不把网站主页、搜索页或只列书目的页面当作公式依据。

本包未存储公开教材长段落、第三方图形、题库题干或私人作品。开放阅读不等同于素材可任意再分发；如未来引入原图、长引文或教材整段，须另核复用许可。本包来源只承担概念与方法依据，不进入“研究发现”的数据证据链。

规范名称与别名分开管理；别名不计入 100 个独立概念。抽样误差没有使用“误差界”作为同义词，半正定没有使用“正定矩阵”作为同义词。

## 重点语义检查

- 检验：显著性、效应量、功效分别解释；功效依赖指定备择。单侧检验不能看到结果后随意改方向。
- 配对 t：计算配对差值；独立单位是配对对象，公式中的 n 是配对数。
- Fisher：二乘二表的条件概率与双侧 p 定义分开；仍需合适的独立观察单位。
- Cramér V：写出维度归一化公式，不把 V 当作正负方向、因果强度或偏差修正版本。
- OR/RR：事件编码、参照组与方向明确；风险较高时两者不互换。
- Bootstrap：抽样单位与原研究结构保持一致；增加重抽次数不能消除原始选择偏差。
- 置换：声明交换性与检验统计量；随机置换的加一 Monte Carlo 估计与穷举精确值区分。
- 抽样：简单随机抽样强调固定样本量下每个样本集合等可能；分层不是配额便利抽样；整群需要处理群内依赖。
- 缺失：MCAR/MAR/MNAR 是机制假设，不能仅靠缺失比例判定；MAR 不等于均值填补；成对删除的相关矩阵可能不半正定。
- 回归：线性参数不等于所有变量都只能直线进入；Logistic 的指数系数是优势比，不是概率比；不把观察关联升级为因果判断。
- 分类：精确率与召回率注明正类与零分母；校准和排序性能分开；R² 可在样本外为负。
- 数学：概率条件与样本空间明确；有限方差独立同分布为所写经典 CLT 的条件；矩阵秩区分理论与数值容差。
- DAG：是依赖结构，不替代因果识别，不推动赛事阶段或 Gate。

## 实际能力入口与相关内容

本包只加入已登记页面入口：数值描述、抽样设计、研究设计、变量映射。线性/Logistic 回归、校准和置换解释条目没有假装提供尚未实现的执行器。

`methodIds` 为方法参考关联；并非新的统计能力开关。材料关联仅使用实际存在的 `local-cluster-multistage`，没有编造案例页码或未创建材料 ID。全部关联词条限制在首 60 条与本包 100 条中。

## 已运行检查

本地 Node 结构核对返回 exit 0：

- 100/28/72 数量与全部必备数组字段；
- 合并首 60 条后 160 个唯一 ID，无重复；
- 全部 `relatedIds` 和混淆条目的 `entryId` 存在；
- 来源均使用 HTTPS，含定位和适用范围；
- 深入条目的用途、例子、追问和概念辨析不为空；
- 示例标记、整数条目版本与 draft/producer 元数据正确。

这些检查不评判引用是否支持全部含义；该项由独立复核承担。未在此子任务运行界面、搜索召回率、OCR、联网额度或生产构建。未提交 Git、PR 或合并。

生产者另外复算了八个简短教学算例，Node 返回 exit 0：均值 40、样本方差 1、优势比 4、相对风险 1.6、精确率 0.8、召回率 0.4、二项概率 0.375、向量 (3,4) 的欧氏范数 5。该算例自查不替代独立公式审校。方法 ID 与抽样页面在现有源码登记，材料 ID 在 `data/research-materials.json` 中核实存在。

## 来源读取记录与已排除路径

以下 73 个 URL 在内容生产中实际打开并阅读了相关段落或文档页；公开摘要只支持摘要呈现的内容，不冒充已读付费全文。读取时发现的错误路径与失败站点未作为最终来源：

- NIST 的 `eda331` 是自相关，不用于直方图；最终使用 `eda33e`。
- StatCan 抽样误差使用 `ch6/sampling-echantillonage/5214807-eng.htm`，不使用失效的简写路径。
- CDC 认知访谈使用 `/nchs/ccqder/question-evaluation/cognitive-interviewing.html`。
- 大数定律和中心极限定理采用已阅读的 MIT 实际课程 PDF，不用仅列下载链接的课程页代替。
- 主题分析站点读取失败；最终使用实际可读的 CDC Coding and Analysis，并保留公共卫生材料的来源范围。
- Rubin 原始条目的付费页面读取失败；缺失机制采用实际可读的 Seaman 等人论文，不声称读过无法获取的全文。

## 来源目录

- [NIST：位置统计量](https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm)；定位：Definition of Location / robustness；关联：mean、median。
- [NIST：离散程度](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm)；定位：Definitions of Variability；关联：variance、standard-deviation、interquartile-range。
- [NumPy：分位数](https://numpy.org/doc/stable/reference/generated/numpy.quantile.html)；定位：Notes，分位数定义与不同估计方法；关联：quantile、interquartile-range。
- [NIST：偏度与峰度](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35b.htm)；定位：Definition of Skewness / Kurtosis / excess kurtosis；关联：skewness、kurtosis。
- [NIST：离群值识别](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm)；定位：outliers / labeling / accommodation / identification；关联：outlier。
- [NIST：直方图](https://www.itl.nist.gov/div898/handbook/eda/section3/eda33e.htm)；定位：Definition，分箱与频数/密度归一化；关联：histogram。
- [SciPy：经验累积分布](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ecdf.html)；定位：Notes / empirical distribution function；关联：empirical-distribution。
- [NIST：正态分布](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3661.htm)；定位：Probability Density Function / Common Statistics；关联：normal-distribution。
- [SciPy：伯努利分布](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bernoulli.html)；定位：Notes，二点概率质量函数；关联：bernoulli-distribution。
- [SciPy：二项分布](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binom.html)；定位：Notes，n、p与概率质量函数；关联：binomial-distribution。
- [SciPy：泊松分布](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.poisson.html)；定位：Notes，μ与概率质量函数；关联：poisson-distribution。
- [MIT18.05：大数定律与中心极限定理](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/mit18_05_s22_lec06b.pdf)；定位：Law of Large Numbers / Central Limit Theorem；关联：central-limit-theorem、law-large-numbers。
- [NIST：检验样本量](https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm)；定位：Sample sizes required，差异、α、β与样本量；关联：statistical-power。
- [NIST：假设检验与推断](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35.htm)；定位：Hypothesis Tests，α、β及power；关联：statistical-power、type-two-error、null-hypothesis、alternative-hypothesis、one-sided-test、hypothesis。
- [SciPy：配对t检验](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_rel.html)；定位：Notes，差值的标准误与配对设计；关联：paired-t-test。
- [SciPy：Fisher精确检验](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.fisher_exact.html)；定位：Notes，2×2表条件分布及双侧p值定义；关联：fisher-exact。
- [SciPy：Cramér V](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.contingency.association.html)；定位：Cramér V / Notes；关联：cramers-v。
- [SciPy：优势比](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.contingency.odds_ratio.html)；定位：sample / conditional odds ratio区别；关联：odds-ratio。
- [SciPy：相对风险](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.contingency.relative_risk.html)；定位：病例人数/暴露组总数与风险比；关联：relative-risk。
- [SciPy：Bootstrap区间](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html)；定位：resampling / paired / BCa / DegenerateDataWarning；关联：bootstrap。
- [SciPy：置换检验](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.permutation_test.html)；定位：independent/samples/pairings / exact vs randomized；关联：permutation-test。
- [Statistics Canada：概率抽样](https://www150.statcan.gc.ca/n1/edu/power-pouvoir/ch13/prob/5214899-eng.htm)；定位：Simple random / systematic / stratified / cluster sampling；关联：simple-random-sampling、stratified-sampling、cluster-sampling、systematic-sampling。
- [Statistics Canada：抽样权重](https://www150.statcan.gc.ca/n1/edu/power-pouvoir/ch6/5214809-eng.htm)；定位：Design weight，入样概率倒数及权重调整；关联：inclusion-probability、sampling-weight。
- [Statistics Canada：非抽样误差](https://www150.statcan.gc.ca/n1/edu/power-pouvoir/ch6/nse-endae/5214806-eng.htm)；定位：Coverage / measurement / non-response error；关联：nonresponse-error、coverage-error、measurement-error、recall-bias。
- [Seaman等：What Is Meant by Missing at Random?](https://arxiv.org/pdf/1306.2812)；定位：PDF第2—3页，Definitions1—5；关联：missing-completely-at-random、missing-at-random、missing-not-at-random。
- [statsmodels：缺失数据处理](https://www.statsmodels.org/stable/missing.html)；定位：missing='drop' / 'raise'与结果影响；关联：listwise-deletion。
- [pandas：协方差及缺失范围](https://pandas.pydata.org/docs/user_guide/missing_data.html)；定位：Calculation with missing data；有效样本与缺失传播；关联：pairwise-deletion。
- [UCLA OARC：缺失与成对删除](https://stats.oarc.ucla.edu/sas/seminars/multiple-imputation-in-sas/mi_new_1/)；定位：Pairwise deletion / covariance matrix；关联：pairwise-deletion。
- [scikit-learn：缺失值插补](https://scikit-learn.org/stable/modules/impute.html)；定位：SimpleImputer，均值/中位数等策略；关联：mean-imputation。
- [Statistics Canada：抽样误差](https://www150.statcan.gc.ca/n1/edu/power-pouvoir/ch6/sampling-echantillonage/5214807-eng.htm)；定位：Estimating the sampling error / design properties；关联：sampling-error。
- [Statistics Canada：样本选择与研究目标](https://www150.statcan.gc.ca/n1/edu/power-pouvoir/ch13/sample-echantillon/5214900-eng.htm)；定位：Establish the survey's objectives / survey units；关联：research-question、unit-of-analysis。
- [OSF：Registrations & Preregistrations](https://help.osf.io/article/330-welcome-to-registrations)；定位：Overview / Effective Practices for a Rigorous Preregistration；关联：hypothesis、preregistration。
- [DDI Alliance：Variable](https://docs.ddialliance.org/DDI-Lifecycle/3.2/model/item-types/Variable/)；定位：name / label / analysis unit / representation；关联：unit-of-analysis、data-dictionary。
- [COSMIN Manual v2.0：构念与测量](https://www.cosmin.nl/wp-content/uploads/COSMIN-manual-V2_final.pdf)；定位：第3页preface，construct=what / instrument=how；关联：construct。
- [OpenStax：测量水平](https://openstax.org/books/introductory-statistics-2e/pages/1-3-frequency-frequency-tables-and-levels-of-measurement)；定位：Levels of Measurement；关联：measurement-level、nominal-scale、ordinal-scale。
- [Penn State：等距与等比测量](https://courses.ems.psu.edu/natureofgeoinfo/print/c3_p11.html)；定位：10. Interval and Ratio Levels；关联：measurement-level、interval-scale、ratio-scale。
- [CDC CCQDER：认知访谈](https://www.cdc.gov/nchs/ccqder/question-evaluation/cognitive-interviewing.html)；定位：Characteristics / Follow-up questions / Findings；关联：cognitive-interview、recall-bias。
- [英国Government Analysis Function：问卷设计](https://analysisfunction.civilservice.gov.uk/policy-store/questionnaire-design-guidance/)；定位：Avoid leading questions / ask one thing / time references；关联：double-barreled-question、leading-question。
- [CDC CCQDER：题目评估](https://www.cdc.gov/nchs/ccqder/question-evaluation/index.html)；定位：Difficulty answering / social desirability bias；关联：social-desirability-bias。
- [AAPOR：Standard Definitions](https://aapor.org/standards-and-ethics/standard-definitions/)；定位：response/ cooperation/ contact rates与不同分母；关联：response-rate。
- [HHS：Belmont Report](https://www.hhs.gov/ohrp/regulations-and-policy/belmont-report/read-the-belmont-report/index.html)；定位：PartC，Information / Comprehension / Voluntariness；关联：informed-consent。
- [CDC：定性资料收集与分析](https://www.cdc.gov/field-epi-manual/php/chapters/qualitative-data.html)；定位：Coding and Analysis / memos / verifying conclusions；关联：qualitative-coding、thematic-analysis。
- [DDI Alliance：VariableRepresentationType](https://docs.ddialliance.org/DDI-Lifecycle/3.3/model/composite-types/VariableRepresentationType/)；定位：valid/missing value representation及imputation reference；关联：data-dictionary。
- [NIST：线性最小二乘回归](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm)；定位：linear in parameters / least squares / limitations；关联：linear-regression。
- [scikit-learn：Logistic回归与正则](https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression)；定位：Logistic regression，二分类link与penalty；关联：logistic-regression、regularization。
- [statsmodels：方差膨胀因子](https://www.statsmodels.org/stable/generated/statsmodels.stats.outliers_influence.variance_inflation_factor.html)；定位：VIF / multicollinearity；关联：multicollinearity。
- [NIST：模型诊断与残差](https://www.itl.nist.gov/div898/handbook/pmd/section4/pmd44.htm)；定位：Residuals / R² Is Not Enough；关联：residual、r-squared。
- [scikit-learn：R²得分](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.r2_score.html)；定位：Definitions / negative score / force_finite；关联：r-squared。
- [scikit-learn：ROC AUC](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.roc_auc_score.html)；定位：binary score / average / multiclass configuration；关联：roc-auc。
- [scikit-learn：混淆矩阵](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.confusion_matrix.html)；定位：Cij，真实行与预测列；关联：confusion-matrix。
- [scikit-learn：查准率与查全率](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_recall_fscore_support.html)；定位：precision / recall / averaging / zero_division；关联：precision-recall。
- [scikit-learn：类别权重](https://scikit-learn.org/stable/modules/generated/sklearn.utils.class_weight.compute_class_weight.html)；定位：balanced / class labels；关联：class-imbalance。
- [scikit-learn：概率校准](https://scikit-learn.org/stable/modules/calibration.html)；定位：calibration curves / classifier calibration / proper scoring；关联：probability-calibration。
- [scikit-learn：控制随机性](https://scikit-learn.org/stable/common_pitfalls.html#controlling-randomness)；定位：Controlling randomness / random_state；关联：random-seed。
- [scikit-learn：特征选择](https://scikit-learn.org/stable/modules/feature_selection.html)；定位：univariate / recursive / pipeline warning；关联：feature-selection。
- [scikit-learn：轮廓系数](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.silhouette_score.html)；定位：a,b / labels2至n−1 / distance；关联：silhouette-score。
- [scikit-learn：调整兰德指数](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.adjusted_rand_score.html)；定位：label permutation invariant / chance adjustment；关联：adjusted-rand-index。
- [MIT18.05：概率术语](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/mit18_05_s22_class02-prep.pdf)；定位：第1—4页，sample space / events / probability rules；关联：probability。
- [MIT18.05：条件概率、独立与贝叶斯](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/mit18_05_s22_class03-prep.pdf)；定位：Conditional probability / independence / Bayes theorem；关联：conditional-probability、independence、bayes-theorem。
- [MIT18.05：离散变量期望](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/mit18_05_s22_class04-prep-b.pdf)；定位：第2页，期望定义；关联：expectation。
- [MIT18.05：协方差与相关](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/mit18_05_s22_class07-prep-b.pdf)；定位：第1—2页，covariance / correlation；关联：covariance。
- [MIT18.06SC：线性方程的几何](https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/6913aa2f37dada8fdda334168b30339b_MIT18_06SCF11_Ses1.1sum.pdf)；定位：第2—3页，Column Picture / Matrix Picture；关联：linear-combination。
- [NumPy：矩阵秩](https://numpy.org/doc/stable/reference/generated/numpy.linalg.matrix_rank.html)；定位：SVD方法 / tolerance / numerical rank；关联：matrix-rank。
- [NumPy：逆矩阵](https://numpy.org/doc/stable/reference/generated/numpy.linalg.inv.html)；定位：Notes，singular / ill-conditioned；关联：inverse-matrix。
- [Boyd与Vandenberghe：Convex Optimization](https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf)；定位：2.2.5正半定；3.1凸函数；4.2.2局部与全局最优；关联：positive-semidefinite、convexity、local-global-optimum。
- [NumPy：奇异值分解](https://numpy.org/doc/stable/reference/generated/numpy.linalg.svd.html)；定位：Notes，U S Vh因子与正交/酉性质；关联：singular-value-decomposition。
- [SciPy：一阶导数](https://docs.scipy.org/doc/scipy/reference/generated/scipy.differentiate.derivative.html)；定位：Description / finite difference / precision limitations；关联：derivative。
- [SciPy：Jacobian](https://docs.scipy.org/doc/scipy/reference/generated/scipy.differentiate.jacobian.html)；定位：偏导矩阵与数值估计；关联：partial-derivative。
- [SciPy：Hessian](https://docs.scipy.org/doc/scipy/reference/generated/scipy.differentiate.hessian.html)；定位：second partial derivatives / scalar-valued function；关联：hessian。
- [SciPy：优化问题](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize.html)；定位：bounds / constraints / local minimization；关联：constrained-optimization、local-global-optimum。
- [NumPy：向量与矩阵范数](https://numpy.org/doc/stable/reference/generated/numpy.linalg.norm.html)；定位：ord=2与向量范数；关联：euclidean-norm。
- [NetworkX：有向无环图](https://networkx.org/documentation/stable/reference/algorithms/dag.html)；定位：is_directed_acyclic_graph / topological_sort；关联：directed-acyclic-graph。
- [SciPy：熵](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.entropy.html)；定位：Shannon entropy / base / probability normalization；关联：entropy。

## 后续验收

独立复核以本包内容哈希为输入；发现问题由协调者重新分配有限修订租约。通过后才进入正式索引。后续各内容包不超过 100 条；1,000 个独立概念与 300 深入/700 简释仍是整体目标，当前只完成首 60 条加本包 100 条生产，不声称 1,000 条已审校或已上线。

