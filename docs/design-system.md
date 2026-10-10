# 证见界面系统：典藏金墨

`visual.mode = agent_ui`（工作台、项目与服务页）与 `public_promo`（首页、了解证见）。竞赛提交物不继承本系统的品牌元素。

## 一套框架覆盖所有登录后页面

| 页面 | 外壳 | 说明 |
| --- | --- | --- |
| `/workspace` | `WorkbenchShell` | 研究工具各分区为 hash 路由 |
| `/projects`、`/projects/[id]`、`/services` | `HostedFrame` | 与工作台共用同一侧栏、页头与页脚 |
| `/login` | `HostedFrame variant="auth"` | 独立的居中登录卡，不显示侧栏 |
| `/`、`/explore` | 首页组件 | 公开叙事页，见 [首页说明](landing-page.md) |

共用部件位于 `components/workbench/shell-kit.tsx`：导航清单 `NAV_ITEMS`、侧栏 `WorkbenchSidebar`、页头 `PageHeading`、页脚、主题存储与 `ThemeToggle`。研究工具内的分区用 `#hash`，从项目或服务页进入时链接到 `/workspace#…`，所以从任何页面都能到达任何分区。品牌标志统一使用 `components/brand/BrandMark.tsx`（取自批准母版 `logo/mark.svg` 的几何）。账号状态从内容区移入页头操作区。

## 令牌

令牌定义在 `app/workbench.css` 的 `.workbench` 上，`hosted.css` 与各模块 CSS 只引用令牌：

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--wb-bg` | `#f3efe5` 暖纸 | `#07111c` 墨 | 页面底色 |
| `--wb-surface` | `#fffdf8` 象牙 | `#0d1c2c` | 卡片 |
| `--wb-text` | `#0a1f33` 墨证蓝 | `#f1ece0` | 正文 |
| `--wb-muted` | `#55687a` | `#a3b2bf` | 次级文字 |
| `--wb-accent` | `#00796f` 深洞见青 | `#4fd1c1` | 链接、焦点与主要交互 |
| `--wb-gold-text` | `#8a5a0b` | `#f4c766` | 金色文字（标注、计数） |
| `--wb-risk` | `#b83239` | `#ff8a8e` | 风险与错误 |

证据金 `#f4b942` 只用于决策点与标记：侧栏当前项的金线、面包屑菱形、Q-D-I-A 节点、页头「开始诊断」主按钮、标签页下划线。所有文字配色组合已按 WCAG AA 复核，最低为深洞见青在暖纸上的 4.61:1。

侧栏在两种主题下都是墨蓝底，配细金线纹理；页面标题、分区标题和卡片标题使用宋体系，界面文字使用黑体系，数字与代码使用等宽字体。圆角统一为 7px（控件）与 12px（卡片）。

## 动效

| 场景 | 效果 |
| --- | --- |
| 切换工作台分区 | 面板上浮淡入；页面标题随分区重新入场 |
| 打开项目、服务页 | 页头与内容块依次上浮 |
| 侧栏 | 当前项金线伸展，悬停时图标轻移 |
| 卡片 | 悬停抬升，出现金色描边与更深的投影；项目卡顶部金青渐变线展开 |
| 快速导航（Ctrl/⌘ K） | 弹出缩放，背景模糊；选中项显示金色箭头 |
| 主题切换 | 支持 View Transitions 的浏览器以按钮为圆心圆形展开新主题，其余直接切换 |
| 加载中 | 金色流光扫过占位 |

所有动效在 `prefers-reduced-motion: reduce` 下关闭，强制色彩模式下回退为系统色。

## 维护规则

- 新模块使用 `--wb-*` 令牌，不写死浅色色值；报告预览纸面这类本应固定为白纸的区域除外。
- 不要把品牌标志、獬见或金色纹样带入导出的报告、PPT 与提交文件。
- 托管页的通用按钮样式不作用于嵌入的问卷编辑器（`.hosted-editor-fieldset`），编辑器保留自身模块样式。

## 硅基样本、概览与质量基线（2026-10-10）

- **硅基样本实验室**（`#silicon`，项目页「硅基样本」标签）：深色“剧场”始终保持墨色背景，3D 人物的光环颜色与图表共用一套经 dataviz 校验器验证的色板（8 色分类 + 5 级顺序色阶，明暗各一套），见 `lib/silicon/palette.ts` 与 `components/silicon/SiliconLab.module.css` 顶部变量。详细说明见 `apps/evi-x-platform/docs/silicon-samples.md`。
- **自带设计的模块**在容器上加 `data-self-styled`，`hosted.css` 的通用表单与按钮规则会用 `:where()` 跳过它们，不改变其他规则的优先级。
- **概览页**新增第十七届赛程（`data/edition17-calendar.ts`，逐条标注总通知页码，11 月 17 日实践赛文件发布后须重新核验）与研究流水线。“今天”标记只在浏览器端渲染，服务端 HTML 不猜测日期。
- **质量基线**（每次大改后复跑）：
  - axe-core（WCAG 2.1 A/AA + best practice）：14 个路由 × 明暗主题，加上实验室的全部状态，严重 / 关键问题为 0；
  - 14 个路由 × 明暗 × 390 / 768 / 1366 宽度：无横向溢出、无控制台错误；
  - CI（`.github/workflows/ci.yml`）：前端单元测试、类型检查、lint、生产构建；API 在 PostgreSQL 16 上用非特权角色跑 pytest。
