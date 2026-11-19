---
name: survey-report-redteam-auditor
description: >-
  Independent adversarial Red-Team quality gate for market survey reports before submission. Runs both a deterministic audit script (scripts/audit_report_draft.py) and corpus-grounded diagnostic checklists catching fatal flaws found even inside national-award PDFs: cross-sectional causal overreach, SRS formulas on convenience samples, Complete Separation SE explosions, micro-sample EFA, over-threshold SEM spin, circular KMeans+GBDT validation, orphan NLP sections, blind-review leaks, and AI-disclosure violations.
---

# 调研报告红队审稿门禁（Red-Team Auditor）

以**独立对抗审稿人（统计学评委 + 业态专家 + 格式合规官）**立场执行终审门禁。即便是正大杯国奖原文，在全量 205 篇语料与视觉抽检中也暴露出高达 **1,083 次截面强因果僭越、伪随机公式混用、原始变量名入图** 等硬伤——**绝不向“带病获奖作”抄缺点**。

## 第一步：必跑确定性脚本扫描

任何报告定稿（`.md` / `.txt` / `.docx` / `.pdf`）先执行内置确定性脚本扫描，拿到精确量化仪表盘（页数/字符容量、摘要溢出区间、句长爆发度标准差、De-AI 套话频率、因果僭越词比、原始字段残留、重复重字拼写错误、首部高校名称泄露）：

```bash
python scripts/audit_report_draft.py <报告路径>
```

需机器集成时加 `--json`。详细脚本逻辑见 [audit_report_draft.py](scripts/audit_report_draft.py)。

## 第二步：十一大核心方法与逻辑红队隔离审查

脚本之外，逐项核查并拦截以下 **致命硬伤**（详细判例、评委攻击话术与纠偏模板见 [十一大方法论陷阱隔离百科](references/method-and-logic-pitfalls.md)）：

1. **截面问卷伪因果僭越**：未用 IV/PSM/DID 却在结论大谈“X 导致/决定了 Y”，必须全量降级为“统计显著预测 / 正向关联”。
2. **便利抽样冒充概率抽样**：线下偶遇/线上链接截获样本却套用 SRS 样本量与精度误差公式并闭口不谈覆盖偏差。
3. **Logit 完全分离失明**：参数表出现天文数字 `SE`（如上千上万）仍照抄显著性解读，未做 Firth 惩罚似然或类别合并。
4. **微样本 EFA / 强跑重维度**：样本量未满足题项数 `5:1–10:1` 最低阈值即强跑探索性因子分析。
5. **SEM 拟合超标硬洗地**：报告出超阈值指标（如明显高于推荐截断值的 `χ²/df` 或 `RMSEA`）却照搬模板句宣称“模型拟合极其良好”。
6. **K-Means + GBDT 循环自证**：把用于聚类的同一组打分题反过来喂给分类器预测该聚类标签并吹嘘 98% 准确率（数学同义反复）。
7. **装饰性 NLP 孤岛**：第 2 章爬取海量评论画了词云与主题图，后续问卷与建议毫无引用接口。
8. **有序李克特邻近均值填补**：违背定序量表性质强行填补缺失值压缩方差，须改用合规剔除或多重插补。
9. **图表复读与别字污染**：同数据表后再挂饼图；直接贴出 `聚类类别_1` 或带 `VOSviewer` 水印截屏；路径图/柱图标签出现明显错字。
10. **无数据锚点的商科套娃**：对策层套用五力/QFD 空心打分矩阵，沦为“前硬后软”。
11. **四字成语幼稚拟题与标点空格混乱**：缺失描述性副标题或正文中序号后空格时有时无、出现 `"旅游旅游"` 类双字连打笔误。

## 第三步：盲审零泄露、<=65 页拆包与 AI 合规披露

最后逐项核对一票否决级合规项，具体核查表与声明模板见 [匿名盲审与AI工具透明披露规范](references/compliance-and-ai-disclosure.md)：
- 封面、页眉页脚、**附录问卷卷首语（极高发泄露点！）**、访谈照片背景、图表文件及文档作者属性元数据均无学校/导师实名。
- 合并提交件（标题+摘要+目录+正文+文献）严格 **`<= 65` 页**，附录分离打包。
- **AI 工具使用红线**：严禁将“与 DeepSeek/ChatGPT 对话结果”或“AI 视觉洞察”充当实地调研与一手样本来源；仅允许将大模型用于文本清洗代码辅助、语法润色与预分类核对，并在附录规范提交《生成式 AI 辅助使用透明声明表》。
