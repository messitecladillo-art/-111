# 选题与文献研究

在 Agent 的研究路线中填写方向，展开「选题与文献研究」。选择领域后导入带文字层的 PDF。每篇最多保留 50 个物理页，较长的资料可指定页码。证据由用户确认，系统按文件指纹、页码与文本匹配核对摘录。

运行后，五个岗位展示对应的规则分析结果。文献研究员交付原文证据，分析师整理对照表，撰稿人提出研究问题，审查员检查引用与页面是否对应。用户核对文献与方向的相关性，再采纳具体选题。文献矩阵中缺少摘录的单元格显示为待补。两项研究能否比较仍需按各自对象、测量口径和条件判断。

草稿使用既有的账号与项目 IndexedDB 检查点。浏览器仅保存已读取的页文字、文件指纹、证据及研究结果的输入。PDF 原件可在本次会话打开，刷新后可通过匹配相同文件指纹重新关联。选题确认保留当时的摘录和来源定位，撤回所用证据后需重新采纳才能向问卷传递研究简介。全文在浏览器内处理。

## 头像资产

- 资产 AGUI-literature-team-v1，模式 agent_ui，内容分类为概念插画。
- 2026-11-10 使用内置 imagegen 生成一张五列头像图集。生产文件为 `public/agent-assets/AGUI-literature-team-v1.webp`，由原图等比例缩至宽 1,250 px 并压缩。SHA-256 为 `294289e6e7150fc1f376377b75d2ff4d953a2e60022047d61a8aef38f63b20f3`。
- 五列对应研究负责人、文献研究员、领域与方法分析师、研究撰稿人、证据审查员。领域徽章和任务状态由界面渲染。

生成提示词

> Use case: stylized-concept. Create ONE production avatar sprite atlas for a serious Chinese academic research web app named EVI-X (do not draw the name). A perfectly regular 5-column by 1-row landscape grid with five equal-width cells. Each cell contains a distinct original fictional East Asian research team member in a clean circular bust portrait centered on that cell, same scale and eye height across cells, generous margins. From left to right: composed female research lead in deep navy blazer with subtle warm amber accent, observant male literature researcher with round glasses in muted sage jacket, thoughtful female methods analyst with short hair in slate blue, warm male research writer in dark burgundy, precise mature female evidence reviewer with silver streak and muted teal. Contemporary editorial vector-like illustration, restrained elegant flat shapes, subtle paper texture, clear facial silhouettes at 32 pixels, consistent studio lighting, warm ivory circular medallion grounds with different subtle colors. Uniform ivory background. Each cell self-contained, with portrait contained within the middle 76 percent of its cell width. No dividers, no overlapping, no text, no numbers, no letters, no logos, no badges, no watermark, no mascot, no university or official insignia. Panoramic 5:1 visual arrangement, one row only. Product UI portrait atlas, fictional role imagery.
