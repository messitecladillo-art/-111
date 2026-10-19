# P0 本批验收记录

2026-10-07。本批在原 `apps/frontend` 上交付 P0-A 至 P0-D，以及官方来源报告排版和前端技能审查后的局部优化。运行方式见 [本地启动](p0-running.md)，后续能力位置见 [迁移表](p0-migration-matrix.md)。

## 已实现与验证

| 范围 | 实际结果 | 证据（相对 `.collab/runs/20261007-p0/`） |
|---|---|---|
| 工程保留 | 452 原文件均可找回；398 原位不变、32 旧路由原样归档、22 已修改文件有完整原件备份 | `preservation-report.json`、`review/preservation-independent-epoch3.json` |
| 独立构建 | 标准 Next standalone 构建和启动成功；92 项构建文件检查无 Cloudflare 运行依赖 | `build-frontend-skill-final.log`、`review/startup-review-addendum.json` |
| 后端与数据库 | 34 项通过；真实 PostgreSQL 迁移、非 owner 角色、行级权限、撤权、凭据隔离及版本保存 | `api-final-pagination-tests.log` |
| 独立挑战 | 16 组实际 PostgreSQL 检查通过；201 版本分页、并发插入和大提案摘要等问题关闭 | `review/final-review-epoch3.json` |
| 原领域回归 | 465 项中 458 通过、7 跳过；共享契约 24 项通过；Python 原领域评测 27 组通过 | `unit-final-tests.log`、`shared-final-tests.log`、`domain-static-evals.log` |
| 浏览器闭环 | 合成邮箱登录、建项目、存模型配置、生成提案、确认应用、保存、刷新、撤销、历史载入、重新登录恢复、双标签版本冲突保留编辑 | `evidence/browser-p0.json` |
| 正式产物再检查 | 当前 v4 和四条历史可读；模型摘要可打开完整提案；旧 v0 提案应用按钮禁用 | `evidence/browser-final.json` |
| Word 排版 | 报告/编辑 10 项通过，独立 DOCX 2 项通过；实际浏览器下载文件 ZIP、页边距、目录域、匿名元数据检查通过 | `evidence/report-tests-final.log`、`review/report-independent-epoch3-final.log`、`evidence/browser-docx-final.json` |
| 文档渲染 | Microsoft Word 渲染合成正文 15 页、附录 1 页，全页视觉检查；最终元数据修正后 16 页像素与已检查版相同 | `evidence/report-render-acceptance.json` |
| 前端技能 | 导航当前位置、键盘跳到正文、可见焦点、长内容断行、窄屏网格、报告格式面板修复；桌面 1182×1404、报告 390×844、项目 320×844 实际检查无横向溢出 | `review/frontend-skill-audit.md`、`review/report-format-ui-addendum.json`、`evidence/browser-final.json` |

最后两次界面修订仅改变呈现与导航语义，导出、数据和任务逻辑未变；重新执行完整生产构建，并在该正式服务上检查页面。旧 `project-desktop.jpg` 与早期手机图相同，不作为桌面证据；桌面证据使用 `projects-desktop-final.jpg` 与 `report-format-desktop-final.jpg`。

## 报告来源与适用范围

采用[安徽工程大学第十六届实践赛暨省赛选拔通知](https://jwc.ahpu.edu.cn/2026/0317/c8503a265448/page.psp)公开附件，已保存原件、提取文本和哈希。它是可核对的官方公开范本；并未认定为第十七届或所有阶段通用规则。具体参赛项目需要按当届、组别、赛区、赛道、阶段绑定要求。

当前导出器应用排版样式、目录、分页和独立附录，保留录入的图表及引用文字。正文页数、图表位置、文献著录和内容合规还需最终文件检查。模板渲染验收不等于真实参赛报告获准提交。

## 接续边界

当前运行 `local_test`：邮件和模型为合成适配器，无真实邮件、付费模型或受访者数据。浏览器中的返回后草稿恢复已验证，原生确认框的“取消”分支未完成实际点击验证；相关分支经过源码复核。减少动态 CSS 分支经独立源码复核，本机未切换系统设置实测。移动检查是 Chromium 调整视口，不等于原生手机跨浏览器覆盖。

P1 的调查发布回收、P2 的持久任务与完整统计服务、P3 的云端报告/ONLYOFFICE、P4 的部署内测继续按计划迁移。真实发信、域名/HTTPS、云主机、OSS、邀请名单、备份监控与文档许可按阶段配置。历史用户数据尚未导入。

用户追加的登录前产品首页目前进入构思阶段，尚未更换 `/` 路由；这与已实现的 P0 业务闭环分别验收。
