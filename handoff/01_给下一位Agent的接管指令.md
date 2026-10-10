# 给下一位 Agent 的接管指令

下面这段可以直接作为新 Agent 的首条任务指令：

---

你正在接管“正大杯 EVI-X 冠军级 Agent”私有制作包。你的目标不是做一个写作机器人，而是继续建设覆盖选题、研究设计、田野执行、数据治理、分析建模、报告、PPT、答辩、合规和交付的全生命周期系统。

开始工作前必须：

1. 完整阅读 `workspace/AGENTS.md` 与 `workspace/skill/zhengda-cup-champion/SKILL.md`，再按 Skill 路由读取当前任务需要的 references；不要跳过规范直接改代码或内容。
2. 阅读包根目录的 `00_先读我_交接说明.md`、`02_交接范围与已知边界.md`、`03_验收与复现记录.md`，并用 `CHECKSUMS.sha256` 抽查关键文件。
3. 在 `workspace/apps/evi-x-platform` 执行 `npm ci`，再运行统一发布检查 `npm run verify`；不要把缺失的 `node_modules` 当成项目不完整，也不要用单项检查替代整套发布回归。
4. 在应用任何赛事硬规则前，先解析并确认届次、组别、赛区、赛道和阶段。优先使用 `workspace/corpus-source` 中的官方原文/快照，若规则可能已更新则查验最新官方通知。
5. 严格区分四类信息：官方已证、用户自述、分析推断、模拟建议。不得虚构调研、受访者、样本、数据、引用、模型结果、奖项或评委反馈。

当前可依赖的技术基线：

- 网站仓基线 commit 为 `8f129ef130f08205324173dbbd336c283c8edec1`，分支为 `codex/unify-control-contract`；Git 历史另存于 `git-bundles/evi-x-platform.git.bundle`。
- 案例库共 32 条：29 条 `official_verified` 只展示公告可证字段；3 条 `user_attested` 可用于结构学习，但不得升级为官方证据。
- 网站包含案例检索/筛选/证据详情、五维规则解析、QDIA 诊断与下一阶段材料清单、项目创建/读取、控制契约等 7 个 API 路由，以及 canonical 12 阶段 / 11 transitions / 9 Gate、fail-closed 权威与完整性状态、匿名能力密钥隔离、登录用户隔离和 D1/Drizzle 数据层。浏览器仍不能判 Gate、推进阶段或签发 handoff。
- 2026-08-26 `npm run verify` 已通过：规则语料漂移检查、3 个控制契约变异守卫、55 个资产输入扫描、9/9 网站与 API 测试、D1 旧迁移/owner partition/重启持久化和 `npm audit` 0 漏洞均有本地回归证据。这仍只是本地快照，不等于生产 D1、身份头或托管权限验证。
- 诊断现为完全不持久化；项目每个所有者上限 20 个；匿名密钥只接受页面生成的新格式或兼容旧版 48 位十六进制格式。全局 IP/主体限流、严格 CSP 和真实 Sites 身份头清洗仍未在线验证。
- 正式安全扫描工具因中文路径触发 GBK 解码失败，且未产生 scan ID；不得把工具失败写成代码安全通过。`.openai/hosting.json` 中的 Sites 项目当前返回 `project_not_found`，未经用户明确授权不得新建替代 Sites 项目或改写项目标识。

接管后请先输出一份简洁的接管报告，至少包含：

- 你实际读过和验证过的文件；
- 当前可运行功能、失败项与复现证据；
- 规则、版权、部署、数据真实性方面的未决问题；
- 下一轮最多 5 个高价值改进，按影响/成本/风险排序；
- 你将使用哪些 eval 防止升级后能力回退。

除非用户明确指定一个真实参赛项目，否则不要假造项目状态，也不要手改 `.agent/state.json`。创建真实项目时，使用：

```powershell
python -X utf8 .\workspace\skill\zhengda-cup-champion\scripts\agentctl.py "<project>" bootstrap --title "<title>"
```

若继续网站开发，保留来源分层、隐私隔离和“不保证获奖”的产品边界。若处理竞赛提交物，先解析 `visual.mode`；匿名提交默认使用 `competition_submission` 中性模式。

六份参考作品仅限私有分析，版权状态未知，不得公开发布。线上 Sites 项目、D1 数据和账号权限没有随 ZIP 转移；不得把 `.openai/hosting.json` 中的项目标识误认成访问凭据。当前 Sites 项目为 `project_not_found`，除非用户明确授权，否则不得新建项目、替换项目 ID 或宣称已完成生产部署。当前没有初始化真实参赛项目，接手者必须等用户提供真实项目标题/范围后再 bootstrap。

---

建议接手者先复现，再改动；先建立证据，再下结论。
