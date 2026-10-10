# Control plane contract

本文件定义证见 EVI-X 项目控制面的权威边界、状态转换、Gate、事件、checkpoint、退出码与恢复语义。它描述机器执行契约，不替代赛事规则、研究判断或人工验收。

## 1. Contract files

控制面由以下版本化文件共同定义：

- `assets/runtime/workflow.json`：唯一合法的控制状态、顺序和相邻转换；
- `assets/runtime/gates.json`：九个 Gate 的前置、证据、失效条件与 fatal 边界；
- `assets/runtime/schemas/project.schema.json`：领域项目文件 `project.yaml` 的结构；
- `assets/runtime/schemas/agent-state.schema.json`：运行时状态、Gate 快照、事件游标和 checkpoint 的结构；
- `assets/runtime/schemas/rules.schema.json`：规则快照、适用范围、官方来源与硬规则的结构；
- `assets/runtime/schemas/final-handoff.schema.json`：最终交付清单、文件哈希、Gate 结论与控制面指纹的结构。

运行器必须在执行前验证六份契约可读取、版本兼容且内容通过 Schema 或内建结构检查，并核对状态、Gate 与各 Schema 枚举的一致性。未知主版本必须退出，不得按“尽力而为”继续推进。

## 2. Authority boundaries

| 信息 | 权威来源 | 说明 |
|---|---|---|
| 届次、组别、赛区、赛道、赛事阶段 | `project.yaml` 的 `project.*` | `project.stage` 始终表示赛事阶段，不得写入控制面阶段。 |
| 当前控制状态 | `agent-state.json` 的 `status` | 这是执行状态的唯一权威来源。 |
| 控制状态镜像 | `project.yaml` 的 `project.status` | 必须与 `agent-state.status` 相等，但不是恢复时的权威来源。 |
| 合法状态转换 | `workflow.json` | 只允许所列的前向相邻转换。 |
| Gate 语义与 fatal 边界 | `gates.json` | fatal 不允许人工 override，只能修复输入后重跑。 |
| 证据与研究事实 | 原始材料、规则快照及各 evidence ledger | Agent state 只记录引用、哈希和运行结论，不替代原始证据。 |
| 运行历史 | append-only 事件流与 checkpoint | 人工总结、终端输出和 `project.status` 都不能覆盖它。 |

若 `project.status` 与 `agent-state.status` 不一致，运行器必须停止状态推进并返回并发或一致性错误。恢复时以 `agent-state.status`、最后一个已提交 checkpoint 和事件流为依据；只有在确认 `project.yaml` 未发生未合并编辑后，才能修复镜像。

## 3. Canonical workflow

控制状态严格为：

```text
intake
  -> rule_lock
  -> problem_framing
  -> exploratory_research
  -> survey_design
  -> fieldwork
  -> data_analysis
  -> insight_action
  -> report_visual
  -> defense
  -> submission_ready
  -> closed
```

规则如下：

1. 只允许 `workflow.json` 中声明的前向相邻转换；禁止跳级、倒退和自转换。
2. 重试、恢复和重新评估保持当前 `status` 不变，不构成状态转换。
3. `closed` 是终态。重新打开项目必须由未来版本的显式迁移契约完成。
4. 每次推进必须持有单写者锁，并提交期望的 `status_revision`；revision 不匹配时拒绝覆盖。
5. 每次成功转换只增加一次 `status_revision`，并写入一条不可变的 transition history。

## 4. Gate contract

九个 Gate 固定为：

```text
rule, problem, design, fieldwork, data, inference, action, visual, submission
```

合法结果为 `not_run`、`running`、`pass`、`warning`、`fail`、`unknown`、`stale`。

- `pass`：当前输入指纹下不存在阻断项。
- `warning`：没有 fatal，但存在需跟踪的问题；必须记录 decision-log 条目、owner 和 deadline 后方可推进。
- `fail`：至少存在一个 fatal，立即阻断相关边界。
- `unknown`：缺少判断 fatal 边界所必需的证据，与 `fail` 一样阻断。
- `stale`：Gate 评估后其依赖输入发生变化，必须重跑。
- `not_run` 或 `running`：尚无可提交的 Gate 结论，同样阻断。

Fatal 边界不可跳过、不可通过人工签字覆盖、不可在恢复模式下降级。唯一解除方式是修复输入、产生新的输入指纹并重新运行 Gate。任何 Gate 依赖发生变化时，运行器必须把本 Gate 及其所有下游 Gate 标记为 `stale`。

每个已提交 Gate 记录必须同时保存不可变 `result_path` 和 `result_sha256`。运行器不仅重算输入指纹，还要验证结果文件存在、字节哈希未变，并与 gate ID、evaluation ID、status、输入指纹和证据引用一致；结果文件删除、修改或错配时 Gate 立即 `stale`。进入 `submission_ready` 和 `closed` 前，九个 Gate 必须全部是当前输入和当前结果文件下的 `pass`，或是带完整确认记录的 `warning`。

## 5. Status commit protocol

状态推进必须按以下顺序执行：

1. 验证 project 与 agent-state Schema、契约版本和状态镜像；
2. 获取项目级单写者锁并校验 expected revisions；
3. 追加 `transition_requested` 事件；
4. 刷新转换所需 Gate 的输入 SHA-256 指纹和 `result_path` 文件哈希；任一漂移先标成 `stale`；
5. 校验 required Gate 的当前结果、required artifacts、fatal/high 边界 blocker 与风险，以及 closed 边界的最终清单；
6. 若出现阻断结果，追加 `transition_blocked`，保留原状态并释放锁；
7. 对已存在的 required artifacts 计算路径、字节数和 SHA-256；`advance` 不代替上游节点生成产物；
8. 写入不可变 checkpoint 文件并追加 `checkpoint_committed`；
9. 原子更新 `agent-state.json`，增加 `status_revision` 并追加 transition history；
10. 更新 `project.status` 镜像和 `status_mirror_revision`；
11. 追加 `transition_committed` 事件并释放锁。

required artifacts 必须由对应生产步骤先原子发布并完成自身格式/内容验收，`advance` 只读取和快照这些现有文件。第 9 步之前不得推进控制状态。如果第 9 与第 10 步之间崩溃，恢复程序以 agent state 为准修复镜像，并记录 `mirror_reconciled` 事件。

任务、blocker、artifact 和 review 等 CSV 表格变更也采用 event-first：事件 payload 同时记录目标表、主键、变更前行哈希、变更后行哈希和完整目标行。只有事件追加成功后才原子发布表格。这样，事件已提交而表格尚未发布的中断可以确定性补齐一次。

## 6. Event contract

事件流采用 append-only JSON Lines。每条事件至少包含：

```json
{
  "event_id": "evt-...",
  "run_id": "run-...",
  "sequence": 1,
  "timestamp": "2026-08-03T08:00:00Z",
  "type": "gate_completed",
  "project_id": "project-...",
  "workflow_version": "1.0.0",
  "control_status": "rule_lock",
  "node_id": "rule-gate",
  "attempt": 1,
  "severity": "info",
  "checkpoint_id": null,
  "causation_id": "evt-...",
  "correlation_id": "run-...",
  "input_fingerprint": "64-lowercase-hex-sha256",
  "payload": {}
}
```

可重放的核心事件类型包括：

- `run_started`、`run_resumed`、`run_failed`、`run_completed`；
- `transition_requested`、`transition_blocked`、`transition_committed`；
- `gate_completed`、`gate_invalidated`；
- `task_added`、`task_status_changed`；
- `blocker_added`、`blocker_resolved`、`blocker_waived`；
- `artifact_registered`、`artifact_finalized`、`review_approved`；
- `checkpoint_committed`；
- `event_cursor_reconciled`、`mirror_reconciled`；
- `handoff_requested`、`handoff_blocked`、`handoff_completed`。

同一 run 内 `sequence` 必须严格递增。事件不得就地修改；更正通过新的补偿事件表达。终端文本不是事件源。

## 7. Checkpoint and idempotency

Checkpoint 必须记录：run、node、创建时间、状态 revision、项目 revision、输入指纹、已发布产物的路径/字节数/SHA-256，以及是否可恢复。

每次 run 都记录基于命令和输入指纹生成的幂等键：

```text
command + input_fingerprint
```

当前实现为每次显式 `checkpoint` 或成功状态转换创建新的不可变 checkpoint ID，不会就地覆盖旧 checkpoint。崩溃重试依靠 event-WAL 判断同一目标 mutation 或 transition 是否已经完成：已处于 after 状态时只补齐游标、镜像或缺失提交事件，不再重复逻辑变更。输入、契约版本或依赖 Gate 变化时必须重新评估，不能复用旧结论。

Checkpoint 只能在产物全部完成并验证后提交。半成品、临时文件和未验证输出不得进入 checkpoint artifact manifest。

## 8. Recovery contract

`resume` 使用事件流作为 write-ahead log，按以下顺序执行：

1. 验证契约版本和两个状态文件的 Schema；
2. 获取单写者锁并核对 revisions；
3. 校验 state 所记录事件游标对应的事件前缀；事件被截断、前缀哈希不符或游标包含非法值时立即拒绝恢复；
4. 读取游标之后的事件尾。事件尾必须属于同一个 run，且每种事件类型均在显式白名单中；未知或交错事件不得猜测执行；
5. 重放完整 Gate 记录、checkpoint、transition 和带 `table_mutation` 的表格变更；同一 mutation 已处于目标状态时直接复用，不重复写入；
6. 对表格 mutation，只允许“当前行哈希等于 before”时写入 after，或“当前行哈希等于 after”时视为已完成。若当前行已被人工或其他过程改成第三状态，必须返回冲突且绝不覆盖；
7. 以权威 state 修复较旧的 `project.status` 镜像；如果项目镜像 revision 更高，则拒绝自动覆盖；
8. 若选择了 checkpoint，校验其产物路径与 SHA-256。缺失或漂移时保持当前控制状态，把已接受 Gate 标成 `stale` 并返回阻断；
9. 成功后将 `recovery.status` 设为 `idle` 并把重试计数归零。每次恢复完整性冲突只增加一次计数；连续达到 3 次后设为 `exhausted`，后续自动恢复停止，保留失败证据供人工处理。

Bootstrap 在写入第一条事件前先持久化 `recovery=in_progress` 锚点；若初始化在事件发布边界中断，下一次 bootstrap 通过同一事件重放规则补齐缺失的启动/完成记录，避免重复初始化逻辑状态。

恢复不得自动跳过 Gate、降低 fatal、删除失败记录、用旧 checkpoint 覆盖用户在更高 project revision 上的有效编辑、覆盖第三状态，或把部分产物标为成功。

## 9. Exit codes

控制面 CLI 使用稳定退出码：

| Code | 含义 | 是否可直接重试 |
|---:|---|---|
| `0` | 请求完成；若请求含状态推进，则转换和镜像均已提交 | 不需要 |
| `1` | 领域 Gate 阻断，包括 fatal、unknown、stale 或未确认 warning | 修复输入后重跑 |
| `2` | CLI 参数、配置、Schema 或契约版本无效 | 修复配置后重跑 |
| `3` | 产物 I/O、哈希、格式或外部依赖失败；状态未推进 | 按 failure.retryable 决定 |
| `4` | 未分类的内部运行时错误 | 先检查事件与 checkpoint |
| `5` | revision、锁或状态镜像冲突 | 先 reconcile，不得盲目覆盖 |

CLI 必须同时输出 UTF-8 机器可读结果，其中至少含 `run_id`、`exit_code`、`status_before`、`status_after`、`status_revision`、Gate 摘要、checkpoint ID、事件流位置和失败分类。Windows 调用建议使用 `python -X utf8`；运行器也会显式把 stdout/stderr 配置为 UTF-8。

## 10. Review, blocker, and final handoff contracts

- `blocker resolve` 必须引用结构化 resolution evidence，并通过 unblock test；只改 CSV 状态不构成关闭。每个 `evidence_refs` 元素必须是精确的 `{path, sha256}` 对，路径只存在但哈希不符仍视为未关闭。
- `blocker waive` 仅允许非 fatal blocker，且 waiver JSON 必须绑定 blocker ID、决策人、理由、范围、补偿控制、批准时间和 `{path, sha256}` 证据引用。fatal 永远不可 waiver。
- 最终产物先以稳定 artifact ID、canonical `producer_role`、独立 `owner_name` 登记版本与文件哈希，再以 `review approve` 绑定不同 reviewer role/name 的结构化 JSON 证据。证据必须重复绑定 artifact type、producer/owner 和类型化 `acceptance_checks`；`artifact finalize` 只接受同一 artifact ID、版本和 SHA-256 的有效批准。
- 每个 required final artifact type 必须有独立路径、独立 SHA-256 和允许的文件格式；相同文件或字节相同副本不能重复满足多种必交类型。
- `project.yaml` 的 `deliverables.required_final_artifact_types` 必须是明确列表；handoff 必须覆盖列表中的每一类，`unknown` 不得通过。
- handoff 会先验证 latest checkpoint 的记录自哈希、提交事件和 checkpointed artifacts，再在同一锁内重跑聚合审计，并把 sealed checkpoint 文件 SHA-256、审计文件 SHA-256、Gate 结果路径/哈希、artifact/review 快照、`status_revision` 与控制指纹写入自哈希清单。
- 项目进入 `closed` 后，再次 handoff 仅执行只读 currentness 复验。只有当前 latest checkpoint、清单内 sealed checkpoint、审计、Gate 结果文件、blocker/risk 证据、artifact/review 与控制指纹全部未漂移时才返回幂等 Go；不得改写 state、events 或 manifest。

## 11. Versioning and migration

契约采用语义版本。补充可选字段可增加 minor；删除字段、改变状态/Gate 语义或修改退出码必须增加 major。运行状态必须固定其创建时使用的 workflow 和 Gate 版本。

迁移必须是显式、可审计、可回滚的节点：先备份并校验旧状态，再生成新状态和迁移事件，最后原子切换。运行器不得静默解释未知字段、未知状态或未知 Gate。
