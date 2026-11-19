---
name: survey-visual-layout-typesetting
description: >-
  Enforces the 17th-edition official formatting specification (A4 geometry, <=65 combined frontmatter+body pages, SimSun/SimHei/TimesNewRoman typography hierarchy, above-table/below-figure captions, right-aligned equations, GB/T 7714-2015 references, blind anonymity) plus 2023-2025 National First-Prize visual aesthetics (monochrome neutral + 1 domain accent palette, running headers, vector chart hygiene).
---

# 官方版式与国奖视觉美学规范（Visual Layout & Typesetting）

合并第 17 届正大杯《报告排版格式要求》与 2023–2025 届全量国奖 PDF 字体（SimSun 703k+、Times New Roman 556k+、12pt 小四 1224k+）、色彩及页面渲染视觉抽检实证规则，构建零扣分印刷与数字双栖排版准则。

## 一、17 届官方硬核版式与页数几何底线

违反此区任一条均可能面临系统拒收或初审直接扣分，详规查 [官方排版与字体几何基准](references/typography-and-page-geometry.md)：

1. **合并 <= 65 页死线**：**标题页 + 摘要页 + 目录页 + 正文（含参考文献）总页数 <= 65 页**；调查问卷、访谈提纲、核心代码与 AI 披露表**必须拆分为独立《附录》文件提交**，严禁并入正文拉爆页数。
2. **A4 页面与 Word 默认边距**：A4 纵向，上/下 `2.54 cm`、左/右 `3.18 cm`。
3. **严格字体与字号谱系**：
   - 总标题：`宋体 三号（16pt）加粗`，单倍行距，段前/后自动；
   - 一级标题（`一、`）：`黑体 小三（15pt）`；二级标题（`（一）`）：`黑体 四号（14pt）`；
   - 摘要/参考文献标题：`黑体 四号`；正文、图表标题与其他低级标题（`1. / （1） / 1)`）：`宋体 小四（12pt）`（西文与数字配 `Times New Roman`，公式用 `Cambria Math`）；
   - 段落与表格：`1.25 倍行距`、段前 `0.5 行`；表格内文字用 `宋体 小四或五号（10.5pt）`，单倍行距。
4. **题注与公式定位铁律**：**表序表题置表上方居中，图序图题置图下方居中**，序号与题名之间严格空两格（如 `图 1  样本年龄分布`）；公式右端对齐圆括号编号 `(1)`，中间不加虚线。
5. **参考文献与脚注统一**：执行 `GB/T 7714—2015` 标注体系（`[M]/[C]/[J]/[N]/[D]/[R]/[S]/[P]/[EB/OL]`），**同篇文献全文共用一个序号，文内相应序号后标注具体页码**；脚注采用圆圈数字 `①②③...`。

## 二、2023–2025 国一视觉美学与“代码 × 生图”双轨防线

不把版面写成死板单一模板，视觉选型可按报告气质适度灵活，但真伪、洁净度与盲审边界不可退让（详规见 [中性克制配色与科研制图美学](references/color-and-chart-aesthetics.md)）：

1. **中性深墨 + 语义强调色（克制用色法则）**：
   - 正文与坐标轴采用中性深墨（`#333333` / `#212529` / `#595959`），围绕行业语义选定 `1` 种主强调色（例：茶农生态 `#12a152`、科技数字 `#0070c0`、海军深蓝 `#000080`、暖橙消费 `#ff9800`），警示点缀严格克制，杜绝刺眼高饱和彩虹配盘。
2. **跑眉微徽标（可选增强，守盲审红线）**：正文字页顶部可设细双横线与凝练主题口号，角落点缀极简行业矢量小徽标；严禁校名、院系、团队标识或导师暗示。
3. **代码制图 vs AI 生图边界分轨**：
   - **代码确定性图（统计图、拓扑、信息图数值部分）**：统一走 EVI-X 原生矢量渲染或 Python (`matplotlib`/`seaborn`) / R (`ggplot2`) / SVG 导出高清图（中文宋体+西文 Times New Roman）；拒绝带 `VOSviewer` 等水印截屏、Excel 三维畸变图与 `聚类类别_1` 类裸字段。
   - **生图模型资产（封面底图、可选页框、概念场景插画、信息图辅助图标）**：只承担构图美学、抽象隐喻与非定量场景展示；严禁图内捏造统计数字或冒充实地摄影，若用于信息图须将真实数据面板交回代码层合成。
