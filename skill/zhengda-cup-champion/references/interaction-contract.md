# 交互与状态契约

## 目录

1. 契约目标
2. 标准 response envelope
3. outcome 状态语义
4. 角色选择与任务分派
5. 接管、续作与 checkpoint
6. blocker 反馈
7. 评审与交付闭环
8. 可测试验收行为

## 1. 契约目标

所有实质性响应必须让用户和下一角色立即知道：谁在负责、项目现在在哪里、哪些输入已验证、本轮做了什么、证据是什么、产物在哪里、还不知道什么、谁需要决策、下一步是什么，以及本轮究竟是完成、部分完成还是阻塞。

聊天回复可以使用自然中文，但必须保留本契约的语义字段。跨角色交接、自动评测和持久化 checkpoint 应使用下列字段名，不创建同义别名。

## 2. 标准 response envelope

顶层字段固定为：

```yaml
role:
  active_role: captain
  coordinator_role: captain
  reviewer_role: rule_gatekeeper
current_state:
  project_id: unknown
  project_status: intake
  current_stage: intake
  current_gate: rule
  checkpoint_id: unknown
  changed_since_checkpoint: []
  active_task_ids: []
  open_blocker_ids: []
verified_inputs: []
action: []
evidence: []
artifact_paths: []
unknowns: []
decisions: []
next_action:
  task_id: unknown
  owner_role: captain
  dependency_task_ids: []
  due_at: unknown
  definition_of_done: unknown
outcome:
  status: partial
  scope: current_response
  summary: unknown
  criteria_met: []
  criteria_unmet: []
```

### 字段要求

| 字段 | 必须表达的内容 |
|---|---|
| `role` | 当前主责、协调者、必要复核者；使用 `expert-roles.md` 的 canonical role ID |
| `current_state` | 项目、阶段、闸门、checkpoint、当前任务、开放 blocker 和本轮检测到的变更 |
| `verified_inputs` | 已实际读取或核验的文件/来源；每项包含 ID、类型、路径/来源、范围、验证方式和状态 |
| `action` | 本轮实际执行的动作、对应 task ID、执行角色和结果；计划动作不得写成已完成 |
| `evidence` | 支持判断的 evidence/claim/rule ID、来源位置、证据状态和限制 |
| `artifact_paths` | 新建、修改、复用或审核的产物 ID、绝对/项目相对路径、版本和状态 |
| `unknowns` | 未知事实、影响、所需输入、输入责任人和最迟解决时间；不得猜测或静默删除 |
| `decisions` | 需要人或指定角色决定的事项、决策人、备选项、影响和截止；Agent不得越权替用户决定重大范围 |
| `next_action` | 唯一首要下一任务及其负责人、依赖、截止和可验证完成标准；可另列安全并行工作 |
| `outcome` | 本轮范围、`done/partial/blocked`、摘要、已满足和未满足标准 |

数组项应使用稳定 ID，优先复用 `team-tasks.csv`、`blockers.csv`、`artifact-registry.csv`、`review-queue.csv` 和证据台账中的 ID。

## 3. outcome 状态语义

### `done`

只在当前声明的 `outcome.scope` 全部完成时使用。必须同时满足：

- 请求的产物已存在并登记，路径与版本明确；
- 当前范围的完成标准有证据；
- 必需复核已批准；
- 没有影响当前范围的开放 fatal/high blocker；
- 关键计算、规则和跨文件一致性已按风险复验；
- 下一动作仅为新的可选范围或项目下一阶段，不是本轮漏项。

子任务 `done` 不等于项目 `done`。必须明确 scope，例如 `questionnaire_audit`、`data_gate` 或 `final_submission_package`。

### `partial`

本轮已产生可验证进展，但请求范围尚未完全结束，且仍存在可以安全继续的工作。必须列出：

- 已完成部分及产物；
- 未完成标准；
- 未完成原因；
- 下一首要任务及安全并行任务；
- 是否存在不阻断当前并行工作的 unknown/blocker。

仅“写了计划”不能把执行型请求标为 `done`。

### `blocked`

缺少权限、真实输入、必要决策、适用规则或上游合格产物，导致当前请求无法安全继续时使用。必须在同轮创建或更新 blocker，并给出：

- 阻塞闸门和 source task；
- 具体原因与影响范围；
- 仍可继续的安全工作；
- 所需输入/决策、责任人和截止；
- 解锁测试；
- 恢复所用 checkpoint。

`blocked` 不等于停止所有工作。仅阻塞受影响任务；能安全推进的独立任务应继续并报告为 action。

## 4. 角色选择与任务分派

1. 根据请求和当前闸门选择一个 `active_role`；跨领域任务由 `captain` 协调，不允许九个角色同时无主次发言。
2. 在执行前查找 `team-tasks.csv`。任务不存在时创建稳定 task ID，再确定 owner、reviewer、依赖和完成标准。
3. 依赖任务未 `done` 或存在相关开放 blocker 时，不得把下游任务标记为 `in_progress`；应使用 `blocked` 或保持 `planned`。
4. fatal/high 风险、核心数据、主要模型、头条结论和最终提交不得由同一逻辑角色制作并批准。
5. 同一项目面向不同角色的响应可以改变细节层级，但样本数、规则、claim、artifact 和 blocker ID 必须一致。

任务状态只使用：`planned`、`in_progress`、`review`、`done`、`blocked`、`cancelled`。

## 5. 接管、续作与 checkpoint

### 首次接管

1. 读取项目状态和所有现有登记表。
2. 扫描已有资产，按 `source`、`draft`、`derived`、`submission_candidate`、`final` 分类。
3. 在 `artifact-registry.csv` 记录路径、版本、哈希、来源和可信状态；不覆盖未知来源的文件。
4. 识别重复、冲突、缺失和不可修复项。
5. 创建 checkpoint，格式建议 `CHK-YYYYMMDD-NNN`。
6. 返回复用/修复/替换/阻塞四类诊断和首轮任务图。

### “继续”或跨轮次恢复

1. 读取最近 checkpoint、task、blocker、artifact、review 和 decision 状态。
2. 比较文件哈希、版本和更新时间，生成 `changed_since_checkpoint`。
3. 只重做受变更影响的任务；不得重复已批准且输入未变的工作。
4. 若上游变更影响下游，列出影响传播并将相关产物退回 `draft` 或 `review`。
5. 响应结束时更新 checkpoint，并在 handoff 中写明恢复入口。

## 6. blocker 反馈

每个独立原因使用一个 blocker ID。严重度只使用 `fatal`、`high`、`medium`、`low`；状态只使用 `open`、`waiting_input`、`in_resolution`、`resolved`、`waived`。

规则：

- fatal blocker 不得 waiver；high blocker 只有明确决策人、理由、适用范围、补偿控制，以及哈希绑定的底层证据时才可 waiver。
- `unknown` 若影响资格、匿名、真实数据、核心推断或最终提交，应转为 fatal/high blocker。
- blocker 关闭必须填写 `resolution_evidence` 和 `unblock_test` 结果，不能只把状态改为 resolved。结构化记录中的每个 `evidence_refs` 元素严格使用 `{"path":"项目内相对路径","sha256":"64位小写十六进制"}`；引用文件丢失或哈希变化会重新打开 blocker。
- blocker 关闭后，重新激活受影响任务并运行规定回归检查。

用户可读格式：

```text
阻塞：BLK-...
闸门/影响：...
原因：...
仍可继续：...
需要谁提供什么：...
解锁标准：...
恢复检查点：CHK-...
```

## 7. 评审与交付闭环

### 评审

- 需要人工或跨角色复核的产物进入 `review-queue.csv`。
- 评审状态只使用 `queued`、`in_review`、`changes_requested`、`approved`、`rejected`。
- `changes_requested` 必须生成返修 task，并指向 acceptance test。
- 上游产物版本变化时，旧批准不得自动继承到新版本。
- 注册最终产物时必须把 canonical `producer_role` 与现实责任人 `owner_name` 分开记录；评审 JSON 同时绑定这两个字段。reviewer name 不得等于 owner name，reviewer role 不得等于 producer role。
- `acceptance_checks` 是机器可读数组，至少包含该 artifact type 的哈希、内容类型和专项检查；自由文本 `acceptance_test` 不能替代这些检查。

### 交接

每次角色交接或阶段结束，生成 `handoff-manifest.json` 的项目副本并填写：

- 当前 scope、stage、gate、checkpoint 和 outcome；
- 已验证输入、完成/开放任务、开放 blocker；
- 产物及其版本/哈希；
- 已批准和待评审项；
- 已决和待决事项、unknown；
- 下一动作、责任人和完成标准；
- Go/No-Go 与签署状态。

### 最终交付

最终 `GO` 需要：所有必需闸门的输入指纹与结果文件哈希均当前；提交候选产物已登记且每种必交类型对应不同路径和不同 SHA-256；制作人与复核人的姓名及 canonical 角色均分离；规则和匿名检查通过；核心数字跨报告/PPT/讲稿一致；AI/证据/视觉台账完整；无开放 fatal/high；latest checkpoint 与清单 sealed checkpoint 均完整；最终路径、哈希、页数或尺寸已登记。

任一条件不满足时返回 `NO-GO`，不得以“基本完成”替代。

## 8. 可测试验收行为

1. **Envelope 完整性**：任一实质响应均包含十个顶层字段，`outcome.status` 只能是 `done/partial/blocked`。
2. **未知规则**：输入旧届规则和当前未确认通知时，Agent不得下硬结论；unknown进入 blocker，输出所需正式来源。
3. **接管续作**：首次接管后修改一个数据文件；下一轮“继续”只重跑受影响的数据、方法、文稿任务，并列出哈希差异。
4. **依赖传播**：数据任务 blocked 时，确定性结果写作任务同步 blocked，但规则检索和报告空结构可以继续。
5. **制作复核分离**：方法作者不能批准同一高风险模型；评审队列必须指向另一角色。
6. **证据约束写作**：缺少 result/limitation 的 claim 不得写成事实，只能保留待验证占位并分配补证任务。
7. **交付 No-Go**：提交包含样本数冲突、身份泄露或未关闭 high blocker 时，`outcome` 不得为 done，handoff 的 `go_no_go` 必须为 `no_go`。
8. **闭环复验**：修复 blocker 后必须登记解决证据、重新运行解锁测试并更新受影响产物版本；不得只修改状态文本。
