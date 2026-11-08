# 词云主题轮廓

词云使用 TopicLab 的术语结果；形状只改变排布。入口位于词云视图的图形设置。自由布局为默认；圆形、矩形、叶片、小龙虾及本地剪影由用户选择。方向旋转轮廓，文字保持水平。词频、分母、聚类与选题篮共用原有数据。

## 源码责任

- `lib/topic-lab/cloud-shapes.ts`：轮廓定义、配置与二值蒙版校验、同源的路径与包含判定。
- `lib/topic-lab/wordcloud.ts`：按冻结权重计算字号，检查完整文字包围盒与碰撞，返回实际放置和未放置的词。
- `lib/topic-lab/custom-cloud-mask.ts`：本地图片转为有限二值网格。
- `components/topic-lab/WordCloudAppearance.tsx`：形状、方向、间距、轮廓及剪影上传控件。
- `components/topic-lab/WordCloud.tsx`：真实文字测量、渲染和现有 SVG 导出。
- `components/topic-lab/TopicLab.tsx`：同一项目的恢复、更新和快照发布。
- `lib/topic-lab/workspace.ts`：可选 `settings.cloud` 的边界校验与哈希。

## 版本与证据

`literature-workspace/v1` 保持兼容，旧版九字段 settings 不注入默认字段，因此旧快照指纹可以原样验证。新增 `cloud` 配置进入 snapshotHash，术语结果、parameterHash 和 corpusHash 保持不变。解析器拒绝未知字段、访问器、不合法轮廓及超限网格。

剪影原图仅在浏览器内解码，保存有限二值网格及名称。切换项目复用既有账户与项目存储隔离；更换当前语料可以沿用视觉样式，点击清除会重置。旧项目未指定形状时显示自由布局。

## 输出与验证

图形与轮廓使用同一几何。字号按原有权重的平方根尺度产生；放不下的词保留在词频表中，界面显示实际展示数量。SVG 导出取自当前真实渲染。词云仅表示输入语料中的术语分布，形状为视觉样式。

在 `apps/frontend` 运行 `node --experimental-strip-types --test tests/topic-lab.test.mjs tests/wordcloud-shapes.test.mjs tests/custom-cloud-mask.test.mjs tests/literature-workspace.test.mjs tests/literature-workspace-ui.test.mjs`。浏览器验收覆盖选择、方向、间距、自定义剪影、快速切换、恢复与导出。
