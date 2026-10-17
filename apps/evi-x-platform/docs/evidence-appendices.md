# 证据附录提案与答辩引用

本批提供三类中性附录的本地整理，不调用模型，不上传答卷，不推进赛事阶段或 Gate。附录从当前作品的已登记结果与发现产生，生成后需预览确认。正式报告的结构、是否加入、加入后的修改和删除由用户决定。

## 现有记录与覆盖边界

1. **数据来源与计算记录**：转录 `ResultSnapshot` 来源分类、来源名、链接、来源与结果 SHA-256，以及已保存的计算凭据。保留原始记录→筛选分支→共同可应答→有效分析的分母链；缺失、无效、超量程原因允许重叠，不能相加冒充剔除量。现存推断、参数、量表反向列、映射与路由汇总按实际凭据整理。历史结果没有 receipt 时明确缺口，不补造剔除原因、时间或处理事件。登记来源指纹不证明原文件已重新核验。
2. **AI 使用记录**：本地模式默认 `coverage: unavailable`，不能由空列表推出“未使用 AI”。新增只读适配器读取**本人、当前项目、最近 200 条问卷提案**，返回 `coverage: partial` 与精确 scope；其他模块、队友及外部工具未覆盖。现有 SiliconRun 聚合不能反推每次供应商调用，本批不将其转成伪造的逐调用记录；不得把这个部分视为完整 AI 使用台账。
3. **主张与证据对照**：使用发现原文指纹、实际结果和数据来源指纹，区分确认与待复核。报告通过 findingIds / findingSnapshots 识别发现关联；内容块与幻灯片对象仅识别依据位置，不据此声称发现已写入页面。图形引用还绑定格式与项目配色。页码是当前 PPT 页序，报告使用章节序号，不虚构 Word/PDF 实际分页。

所有计算只整理汇总记录，不复算统计，也不持久化原始观测。来源、解释与参数可能本身需要用户审查；哈希仅保护所引用版本。

## 使用接口

```ts
const proposal = await createEvidenceAppendixProposal(content, {
  projectId,  // 可省略，未绑定项目时默认不接收部分 AI 日志
  aiLedger,   // 可省略；严格归一化的脱敏凭据，禁止直接传后台对象
});
// 用户预览并选择要加入的 section 后，父组件再次检查权限与精确 base：
if (JSON.stringify(currentContent) !== proposal.base || !canEdit) return false;
const next = appendEvidenceAppendixSections(currentContent, selectedSections);
// 通过现有编辑器更新/撤销入口写入 next。
```

`EvidenceAppendicesPanel` 的参数为 `content`、可选 `projectId/aiLedger/disabled/onRefreshAi/aiLoading` 与 `onApply(sections, base): boolean`。父组件必须在调用时检查当前项目、账户、权限和精确 base，然后使用现有撤销机制。面板生成过程中即保存输入快照；作品或日志变化后的旧预览不可应用。`onRefreshAi` 可刷新真实凭据，加载时暂缓生成与应用。面板不自行保存、不接触父编辑器挂载与光标。

每个章节最多 11,900 个 UTF-16 代码单元，超限分成多节；不截断文字或拆开 Unicode 代理对。稳定 ID 绑定 `JSON.stringify({kind,title,body})` 的 UTF-8 SHA-256。同一版本重复添加跳过；同 ID 已有人为修改则拒绝覆盖，保留原文。新增章节在报告末尾追加；不挪动原附录。总章节数与作品字节上限继续由现有 parser 检查。

## 可选 AI 凭据契约

`AiUsageLedger/v1` 仅允许 `coverage: unavailable | partial`；本批不提供 complete 状态。partial 必须与调用方 `projectId` 相等，最多 200 条不重复记录。可选 scope 仅接受 `own-questionnaire-proposals/latest-200`，且该 scope 内所有记录须为 questionnaire 用途。即使记录为零，仍不能声明未使用 AI。

每条记录的字段全部必填；不可得值用 null：

- `id`、`provider`、`model`、`purpose`、`status`；分类为受控枚举，ID 与已知模型名为有长度限制的 ASCII 标识。provider 接受 openai、deepseek、qwen、anthropic、compatible、other 或 null；model 也可为 null。历史服务配置无法对应时保留 null 并显示未登记。
- `requestedAt/finishedAt`：实际 UTC ISO 时间或 null，不自动生成；不接受结束早于请求。
- `inputHash/outputHash`：64 位小写十六进制 SHA-256 或 null，不接收原文。
- `usage: {inputTokens, outputTokens, cost, currency}`：实际回执数值或 null；已知费用必须有 USD/CNY 单位，缺失不改为零。

状态 `unknown` 保留为“调用结果未知，待对账”，不并入失败，不假定免费，不触发重试。严格 parser 拒绝多余字段、访问器、密钥形态标识、非有限数值、提示词、模型输出和答卷字段。后续其他模块适配器同样应从真实供应商回执取值、验证账户与项目权限，并说明覆盖来源；禁止将账单估计写作实际费用。

### 本人问卷提案适配器

`register_report_ai_usage(app, *, auth, db, owned_project)` 注册 `GET /api/projects/{project_id}/report/ai-usage`，直接返回 ledger。沿用真实 PostgreSQL RLS、会话与团队读取权限；查询同时限制当前用户与项目。只投影 Proposal 的 ID、状态、服务版本和真实 dispatched_at/finished_at，不加载 design、需求原文、payload_hash、幂等标识或服务密文。只有本人未删除 Service 的当前 revision 与提案 service_revision 相等，才读取 provider/model；不从新模型配置推测旧模型。非安全模型标识保留未登记。

`ready → succeeded`、`outcome_unknown → unknown`，其他已知状态按实际保存值映射；未认识的状态保留 unknown。未保存用量、费用和输入输出内容哈希时全部为 null。既有 payload_hash 属于 HMAC，不能冒充内容 SHA-256。缺少时区的时间不擅自补为 UTC。接口不更新历史状态、不产生外部调用，响应为 no-store。父级负责在账户/项目切换、撤权和刷新晚到时清除旧结果，才可传入面板。

## 答辩引用

`createDefenseEvidenceReference(content, findingId)` 返回精确的发现文字、结果、来源、图形及版面位置指纹；`formatDefenseEvidenceReference` 可生成附录和答辩准备中复用的中性说明。复用前调用 `verifyDefenseEvidenceReference`：返回 current、review、missing 或 invalid。当前版本一致仍不替代事实核验；未确认发现保持 review。上游数据、解释、图注、配色、报告或 PPT 变化时，旧引用要求重新核对。

引用仅在调用者当前内容内检查，不自行获取跨项目数据；跨账户与项目授权由现有父级内容容器负责。旧版本的引用可保留作历史记录，不能默认为当前成果。

## 验证

`node --experimental-strip-types --test tests/evidence-appendices.test.mjs` 覆盖真实构造的汇总计算、重叠剔除、历史缺口、未知调用、严格 AI 结构、范围与空记录、来源与成果漂移、重复追加、Unicode 分节与容量，以及生成中输入变动。API 的 `tests/test_report_ai_usage.py` 额外覆盖转换边界、浏览器跨语言接收与真实 PostgreSQL 路线的跨用户/项目隔离、撤权、200 条上限、旧服务版本及敏感字段投影。PG 测试必须使用显式合成库，不替换为 SQLite。浏览器应用、撤销与实际 Word/PDF 导出仍需父级集成后验收；单元测试不宣称完成原生软件验收。
