# 首页证据弹道互动

版本：2026-09-22 / agent_ui / 本地 UI 演示。

## 使用

首页右侧拖住发光节点，拉动蓄力后松手发射；虚线预览与实际飞行共用同一个弹道函数。也可点击“发射到…”逐段前进，或“一键演示”串起问题 → 数据 → 洞察 → 行动。自动演示可暂停，随时可重置。键盘聚焦节点后，用方向键调整、Enter/Space 发射、Esc 取消蓄力。

系统开启“减少动态效果”时直接点亮下一节点；隐藏页面时暂停，组件卸载时取消回调。拖动只拦截节点上的触摸，不拦截整页滚动。

所有节点仅为教学演示，不调用 API，不写入 Gate、项目进度或竞争阶段。完成动画不代表真实证据链已满足审查要求。

## 来源与实现边界

- 交互参考：用户提供的小红书视频 https://www.xiaohongshu.com/discovery/item/6aaa2317000000002a00778a 。借鉴“拉伸—瞄准—弹出—落点”的通用交互机制。
- 视觉与代码由本项目重新实现，使用 React、SVG、CSS；未复制视频图片、品牌标识、音乐或源码，无新增运行依赖。
- 使用证见 EVI-X 独立非官方身份的既有深蓝、金色、青绿配色；不作为匿名参赛稿资产。
- source class：reference；内容：simulated；human review：待用户体验确认。不是参赛获奖依据。

## 实现入口

- `components/EvidenceFlight.tsx`：拖拽、键盘、取消和降动效状态机。
- `components/EvidenceFlight.module.css`：响应式呈现。
- `lib/evidence-flight.ts`：有界弹道与轨迹采样。
- `tests/evidence-flight.test.mjs`：端点、越界、极端输入回归；`npm run test:flight`。

本轮验收证据与限制见仓库根目录 `.collab/runs/20260922-evidence-flight/`，不以此替代真实比赛项目的 agentctl Gate / handoff 验收。
