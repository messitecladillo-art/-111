---
name: frontend-design-production
description: Design, implement, or audit frontend interfaces with a coherent visual system and purposeful interactions. Use for polished landing pages, portfolios, dashboards, component styling, scroll narratives, pointer or drag interactions, 3D presentation, and upload feedback. Also use when turning visual references into implementable rules; do not activate for backend-only work.
metadata:
  short-description: "Task-led frontend design, implementation, and evidence-based acceptance"
---

# Frontend Design Production

把审美要求转成可维护的界面与可验证的行为。沿用用户选定的产品、品牌、技术栈和范围；研究素材提供候选方法，具体设计由当前任务决定。

## 选择工作模式

| 用户任务 | 执行方式 |
|---|---|
| 局部视觉修改 | 读取相关组件与现有样式，限定修改范围，检查改变后的真实界面。无需建立新设计体系或新增测试框架。 |
| 新界面或较大改造 | 明确主任务与视觉方向，建立必要的布局、组件和状态规则，再实现并验证完整主流程。 |
| 动效或交互实现 | 定义触发、过程、终态、取消及替代操作；选择足够的实现方式，补齐生命周期和失败恢复。 |
| 设计审计 | 检查实际界面及实现，按问题、影响、证据、修复建议交付；用户只要求审计时不改代码。 |
| 参考研究或方案 | 区分可见内容、作者说法、技术核验与迁移推导。研究不自动授权安装组件、改项目或发布。 |

## 建立最小设计约定

在现有项目中先检查任务相关的代码、组件、样式变量、依赖和运行方式；有可运行界面时观察现状。新建项目才选择技术方案。缺少会改变结果的关键信息时提问，其余可以给出明确假设后推进。

设计约定可以是一段说明、任务内表格或项目已有设计文档，只需包含当前任务相关的内容：

- **主任务与信息顺序**：用户先判断什么、随后操作什么；真实内容、长标题和数据密度如何影响布局。
- **视觉规则**：网格、字号层级、行宽、间距、图片比例、强调色、表面与边界。让规则支持用户选择的风格，不将一个案例的数值固化为通用标准。
- **行为规则**：输入方式、触发、有效范围、终态、恢复、加载/空/错误状态，以及减少动态时的表现。
- **实现边界**：现有组件与依赖、可用服务、素材权利、浏览器/设备范围、项目已有的性能和可访问性要求。

对已有页面改造，先列出保留项，尤其是品牌、导航、业务接口和用户指定的布局。局部修改不应成为更换框架或重构全站的理由。

## 按任务读取参考

只加载与当前改动相关的文件。

| 需要解决的问题 | 参考 |
|---|---|
| 视觉风格、工作台信息架构、效果组件接入 | [visual-system.md](references/visual-system.md) |
| 时间轴、滚动、鼠标跟随、悬停、拖拽与手势 | [motion-interactions.md](references/motion-interactions.md) |
| 图层空间感、真实三维、文字避让 | [spatial-layout.md](references/spatial-layout.md) |
| 文件上传、批量导入与异步状态 | [upload-state.md](references/upload-state.md) |
| 实现验收、证据记录及可选检查脚本 | [acceptance.md](references/acceptance.md) |
| 灵感研究、具体工具身份、来源或许可核对 | [evidence-and-sources.md](references/evidence-and-sources.md)；需要原始索引时再读 [research-provenance.json](references/research-provenance.json) |

## 实现到真实行为

先让静态布局和主流程成立，再实现需要的动效。为效果说明职责，例如解释步骤、表达位置、提示结果或展示模型细节。用户要求视觉实验时可以放大装饰性，但仍保留主内容与操作的可用性。

复用现有代码和组件。简单过渡、局部追光或层叠位移通常可以从原生能力开始；复杂编排、约束拖动或三维场景才评估额外依赖。接入前核对实际 API、版本、许可和依赖；不会运行的示意代码不能当成实现。

把 UI 位置与业务状态分开：拖拽预览不等于数据已保存，传输结束不等于文件可用，视觉原型不等于真实服务已经接通。原型使用模拟数据或服务时，在交付说明中明确模拟范围，避免在产品界面填入无意义的技术提示。

处理生命周期：卸载、路由切换、离开有效范围、尺寸/字体变化和交互中断。清理事件、动画、计时器、观察器及图形资源；防止过期异步结果覆盖新状态。遵守选定框架的生命周期机制，不机械复制另一框架的清理代码。

## 验收与交付

按任务规模应用 [acceptance.md](references/acceptance.md)。局部改色不需要全套压力测试；上传、拖拽、长滚动、三维和工作台需要与其失败路径相称的验证。

使用项目实际可用的构建、测试和浏览器能力，验证关键结果并观察渲染界面。工具缺失时完成可做的检查，说明缺少哪项证据；不能把截图生成、构建成功或结构检查单独等同于整个产品生产可用。

交付实际代码或用户要求的设计产物，说明改变、理由、验证和未解决项。新界面/重大交互交付宜附代表性画面；实际验证过的浏览器、设备与流程才计为覆盖。部署、采购、上传用户文件或向外发送内容遵循本次任务已有授权，技能本身不增加权限。

多文件交付或团队交接需要可复核记录时，可使用 `scripts/audit_delivery.py` 检查记录完整性与文件指纹。它不会运行网页、判断视觉质量、核验业务服务或证明符合全部可访问性标准；其 `ready` 仅表示记录通过完整性检查。
