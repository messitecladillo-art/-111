# 证见 EVI-X 项目记忆系统规格书

- 状态：Proposed（待审）
- 日期：2026-10-29
- 范围：项目记忆 v1（研究意图、已确认决策、证据索引、开放问题）
- 相关文档：[Agent 对话外壳](../../agent-shell.md)、[项目框架](../../../PROJECT_FRAMEWORK.md)、[选题云端简报](../../topic-cloud-brief.md)
- 规范性用语：**必须**（must）、**应该**（should）、**可以**（may）

---

## 1. 摘要

证见 Agent 的记忆不是更长的聊天记录，而是一份**随托管项目版本化、可读、可审、可纠正的项目档案**。它回答四个问题：这个项目在研究什么、已经确认了什么、依据是什么、还缺什么。

v1 只做项目级记忆。已确认文字由 owner/editor 写入；证据索引由浏览器从当前项目状态派生，服务端能核对的标 `server`，只能由浏览器核对的标 `client`；模型只能**提议**记忆条目，不能直接写入。每轮模型请求只带一份约 2k 字的 `ProjectBrief`，细节通过只读工具 `memory.read` 按需读取。会话摘要只留在本地、会过期，不升级为项目事实；个人偏好单独按用户存，不进入团队共享档案。

长期记忆存放在云端项目；浏览器保留只读工作副本。没有项目、未登录或离线时，Agent 明确说“没有项目记忆”，不拿聊天摘要冒充。

---

## 2. 背景与现状

### 2.1 当前上下文通路

| 位置 | 现在提供什么 | 边界 |
|---|---|---|
| `lib/agent/chat.ts` 的 `chatContext` | 各模块照度、盲区、可回溯图表、当前面板、已登记结果/抽样框/已确认发现的数量 | 只有“证据状态”，没有研究意图、决策理由、历史讨论 |
| `lib/agent/chat.ts` 的 `chatHistory` | 最近 12 条对话 | 每段对话独立；刷新/换对话不继承 |
| `ProjectView` | 问卷、数据集、报告、结果等待状态 | 选题/诊断表单不在其中 |
| 后端 `agent_chat.py` | 接收 `history` 与 `context`，调用模型，保存回执 | 不保存项目记忆；`Operation` 只是调用审计 |
| `topic_project_versions` / `topic_project_decisions` | 选题文档的版本与确认记录 | 只在选题模块使用，没有进入 Agent 上下文 |
| 项目成员 | owner/editor/reviewer/viewer | 记忆需要沿用同一套项目权限 |

### 2.2 缺口

1. 新开一段对话后，模型只知道项目“亮不亮”，不知道研究问题、对象、地区、决策目标和已确认的方法选择。
2. 选题、诊断、规则解析里的结论只存在于各模块的局部状态或独立的选题表，Agent 不会引用。
3. 对话之间的“为什么这样定”只留在人的记忆里；队员换设备或接手时没有可读的项目上下文。
4. 如果直接把对话摘要当记忆，模型会把自己上一轮的猜测当成事实，且无法指出来源。这与证见“每个数字有来处”的产品前提冲突。

### 2.3 为什么不直接做“更长上下文”

- 12 条历史扩到 100 条并不能让模型知道“这个项目的决策是什么”，只会增加噪声和费用。
- 摘要会漂移，且无法区分“用户确认过”和“模型说过”。
- 正大杯项目需要的是可审计的研究档案，不是聊天回忆录。
- 原始数据、问卷全文和报告正文不应进入长期记忆；只存索引和摘要。

---

## 3. 目标与非目标

### 3.1 目标

- 同一项目新开对话，模型能说清：研究什么、已确认什么、依据哪一版、下一步最该做什么。
- 项目档案在云端项目内版本化，队友换设备可见，可追溯谁在何时确认了什么。
- 模型不能静默写入记忆；所有文字记忆经 owner/editor 确认。
- 证据变化时，旧决策显示“依据已变化”，不被悄悄改写或继续当作有效结论。
- 每轮上下文有硬上限；没有项目记忆时行为与现在一致。
- 复用现有项目权限、选题版本、问卷/报告版本、规则快照和 Agent 对话外壳。

### 3.2 非目标（v1 明确不做）

- 个人偏好记忆（第二期，按用户存，不共享）。
- 会话摘要作为项目事实；会话摘要只允许本地、短期、可丢弃。
- 向量检索或全文索引作为记忆底座。
- 原始数据行、问卷全文、报告正文进入记忆或模型上下文。
- 模型自动确认文字记忆；低风险索引可以自动同步，但文字必须确认。
- 离线确认写入。
- 跨项目检索或“全站记忆”。
- 在 Agent 内新增一个独立的项目档案面板（原因见 §12.1；编辑入口在托管项目页）。

---

## 4. 术语

| 术语 | 定义 |
|---|---|
| **ProjectMemory** | 一个托管项目的一份已确认记忆文档；只含研究意图、决策、开放问题，不含证据索引 |
| **MemoryVersion** | ProjectMemory 的一次不可变版本；当前记忆是最新版本 |
| **EvidenceIndex** | 从当前项目状态派生的证据索引；有独立的 `evidenceRevision`，不改变文字版本 |
| **ProjectBrief** | 每轮注入模型的压缩摘要，约 2k 字，只含当前有效内容与过时提示 |
| **Proposal** | 模型或人提出、尚未写入记忆的一条变更；确认前不影响 ProjectMemory |
| **Basis** | 这份记忆基于哪一版项目、选题、问卷、数据、报告、规则 |
| **Stale** | 已确认条目的依赖证据发生变化；只标记，不自动改写 |
| **Seed** | 空记忆时从已确认选题/项目标题派生出的“建议带入”内容；未确认，不持久化 |
| **Truth hierarchy** | 项目当前模块版本 > 已确认记忆 > 提议 > 本地会话摘要 |

---

## 5. 核心原则

1. **文件式、可审查**：记忆是一份结构化文档，不是黑箱向量库；人可以直接读、改、回溯版本。
2. **无静默写入**：模型只能提议；已确认文字只能由 owner/editor 写入。证据索引是派生数据，可自动同步，但明确标注来源与核验方式。
3. **证据先于文字**：能用版本、哈希、编号表达的，不写成长句；长句只用于意图、决策理由和开放问题。
4. **当前模块说了算**：记忆与当前问卷/报告/数据冲突时，以模块当前版本为准；记忆必须显示过时，而不是覆盖。
5. **不可变历史，当前投影**：每次确认生成不可变版本；当前视图是投影，可回看谁改了什么。
6. **最小数据**：不存原始数据行、问卷全文、报告正文、模型密钥；只存索引、摘要、引用。
7. **有界上下文**：简报有硬上限；细节按需读取；不因记忆让每轮请求无限增长。
8. **分层隔离**：项目记忆、个人偏好、会话摘要三者分开存储、分开授权、分开失效。

---

## 6. 数据模型

### 6.1 ProjectMemoryDocument（已确认内容）

只包含已确认或明确标记为未知的内容；待确认内容在 Proposal 中，不进入本文档。

```json
{
  "schemaVersion": 1,
  "intent": {
    "title": {
      "value": "社区体育设施使用与满意度研究",
      "status": "confirmed",
      "source": { "kind": "topic", "ref": "topic-version-id", "revision": 3, "hash": "sha256..." },
      "confirmedBy": "user-id",
      "confirmedAt": "2026-10-29T08:00:00Z"
    },
    "researchQuestion": { "value": "", "status": "unknown" },
    "decisionGoal": { "value": "为甲区体育局优化设施布局提供依据", "status": "confirmed", "source": { "kind": "user" }, "confirmedBy": "user-id", "confirmedAt": "2026-10-29T08:00:00Z" },
    "population": { "value": "甲区 18 岁以上常住居民", "status": "confirmed", "source": { "kind": "diagnosis", "ref": "diagnosis-id" }, "confirmedBy": "user-id", "confirmedAt": "2026-10-29T08:05:00Z" },
    "geography": { "value": "甲区", "status": "confirmed", "source": { "kind": "diagnosis", "ref": "diagnosis-id" }, "confirmedBy": "user-id", "confirmedAt": "2026-10-29T08:05:00Z" },
    "stage": { "value": "问卷设计", "status": "confirmed", "source": { "kind": "user" }, "confirmedBy": "user-id", "confirmedAt": "2026-10-29T08:05:00Z" }
  },
  "decisions": [
    {
      "id": "decision-uuid",
      "statement": "采用分层随机抽样，按街道分层",
      "rationale": "甲区街道间设施密度差异大，分层可降低估计方差",
      "scope": "sampling",
      "status": "confirmed",
      "dependsOn": [
        { "kind": "questionnaire", "revision": 4, "hash": "sha256..." },
        { "kind": "rules", "hash": "sha256..." }
      ],
      "source": {
        "kind": "agent",
        "conversationId": "thread-id",
        "turnId": "turn-receipt-id",
        "serviceId": "service-id"
      },
      "confirmedBy": "editor-user-id",
      "confirmedAt": "2026-10-29T09:00:00Z",
      "supersedes": null
    }
  ],
  "openQuestions": [
    {
      "id": "question-uuid",
      "question": "是否需要按年龄配额补样？",
      "why": "老年样本可能不足，影响分组比较",
      "next": "检查回收样本的年龄分布后再定",
      "status": "open",
      "source": { "kind": "agent", "conversationId": "thread-id", "turnId": "turn-receipt-id" },
      "createdAt": "2026-10-29T09:10:00Z"
    }
  ]
}
```

**Intent 字段固定为六个**：`title`、`researchQuestion`、`decisionGoal`、`population`、`geography`、`stage`。每个字段只能是 `confirmed` 或 `unknown`；提议中的值不写入这里。

**Source 结构**：

```json
{ "kind": "user|topic|diagnosis|rules|agent|import", "ref": "可选，版本/记录 id", "revision": 0, "hash": "可选", "conversationId": "可选", "turnId": "可选", "serviceId": "可选" }
```

**Decision 状态**：`confirmed`、`superseded`、`revoked`。被取代的条目保留，`supersedes` 指向旧 id；不在当前有效列表中出现。

**OpenQuestion 状态**：`open`、`resolved`；`resolvedBy` 指向解决它的 decision id。

**文本上限**（服务端校验）：

| 字段 | 上限 |
|---|---|
| intent 单字段 | 600 字 |
| decision.statement | 1,200 字 |
| decision.rationale | 2,000 字 |
| openQuestion.question | 1,200 字 |
| openQuestion.why / next | 1,000 字 |
| 单个 Source.ref | 120 字 |
| 当前有效 decisions | 200 条 |
| 当前 open questions | 100 条 |
| 整个 document | 48,000 UTF-8 字节 |

未知字段必须拒绝；不允许在 document 中出现 `data`、`rows`、`raw`、`questionnaireBody`、`reportBody` 等原始数据字段名。

### 6.2 EvidenceIndex（派生索引）

```json
{
  "schemaVersion": 1,
  "revision": 7,
  "basis": {
    "projectRevision": 12,
    "topicVersionId": "topic-version-id",
    "topicHash": "sha256...",
    "questionnaireRevision": 4,
    "questionnaireHash": "sha256...",
    "datasetHash": "sha256...",
    "datasetRows": 430,
    "reportRevision": 9,
    "reportHash": "sha256...",
    "rulesSnapshotHash": "sha256..."
  },
  "entries": [
    {
      "key": "questionnaire",
      "kind": "questionnaire",
      "ref": "questionnaire:4",
      "revision": 4,
      "hash": "sha256...",
      "summary": "12 题 · 每题已映射分析计划",
      "verifiedBy": "server",
      "capturedAt": "2026-10-29T09:20:00Z"
    },
    {
      "key": "dataset",
      "kind": "dataset",
      "ref": "dataset:sha256...",
      "hash": "sha256...",
      "summary": "430 行 · 教学模拟数据",
      "verifiedBy": "client",
      "capturedAt": "2026-10-29T09:20:00Z"
    }
  ]
}
```

**条目键**：`topic`、`questionnaire`、`dataset`、`rules`、`report`，以及每个登记结果的 `result:<id>`。

**核验方式**：

- `server`：服务端能通过数据库核对的项目、选题、问卷、报告、规则条目。
- `client`：只能在浏览器里核对的数据集哈希/行数。简报和界面必须显示“浏览器上报”，模型不得把它当作已核验事实。

EvidenceIndex 只保留**当前**索引；历史由项目自身的版本表承担。证据索引可以独立于文字记忆存在。

### 6.3 ProjectBrief（每轮注入）

```json
{
  "schemaVersion": 1,
  "available": true,
  "revision": 3,
  "evidenceRevision": 7,
  "intent": {
    "title": "社区体育设施使用与满意度研究",
    "researchQuestion": null,
    "decisionGoal": "为甲区体育局优化设施布局提供依据",
    "population": "甲区 18 岁以上常住居民",
    "geography": "甲区",
    "stage": "问卷设计"
  },
  "decisions": [
    { "id": "decision-uuid", "statement": "采用分层随机抽样，按街道分层", "rationale": "街道间设施密度差异大" }
  ],
  "openQuestions": [
    { "id": "question-uuid", "question": "是否需要按年龄配额补样？", "next": "检查回收样本的年龄分布" }
  ],
  "evidence": {
    "questionnaire": "v4 · 12 题",
    "dataset": "430 行 · 浏览器上报",
    "results": 3,
    "report": "v9 · 体检 78/100",
    "rules": "已锁定 · 快照 sha256…"
  },
  "stale": [
    { "decisionId": "decision-uuid", "reasons": ["问卷从 v4 变为 v5"] }
  ],
  "canPropose": true
}
```

**构建规则**：

1. 只放 `confirmed` 的 intent、`confirmed` 且未 superseded/revoked 的 decisions、`open` 的 openQuestions。
2. decisions 最多 8 条：先按 `confirmedAt` 倒序，再按 scope 排序；stale 的只进入 `stale`，不进入有效 decisions。
3. openQuestions 最多 5 条。
4. 整个 brief 上限 2,000 字；超出时按 `stale > intent > decisions > openQuestions > evidence` 的顺序截断，并写明“已截断”。
5. 没有项目或没有记忆时 `available: false`，不生成空壳。

### 6.4 Proposal（待确认变更）

```json
{
  "schemaVersion": 1,
  "id": "proposal-uuid",
  "projectId": "project-id",
  "baseRevision": 3,
  "status": "pending",
  "operation": {
    "kind": "decision",
    "action": "add",
    "entry": {
      "statement": "采用分层随机抽样，按街道分层",
      "rationale": "街道间设施密度差异大",
      "scope": "sampling",
      "dependsOn": [{ "kind": "questionnaire", "revision": 4, "hash": "sha256..." }]
    }
  },
  "reason": "对话中已确认抽样方案",
  "sourceRefs": [
    { "kind": "turn", "conversationId": "thread-id", "turnId": "turn-receipt-id", "serviceId": "service-id" }
  ],
  "proposedBy": "user-id",
  "proposedVia": "agent",
  "createdAt": "2026-10-29T09:00:00Z"
}
```

**v1 只允许单条操作**：

| operation.kind | action | 作用 |
|---|---|---|
| `intent` | `set` | 设置一个 intent 字段（必须来自 owner/editor 的确认） |
| `decision` | `add` | 新增决策 |
| `decision` | `supersede` | 用新决策取代指定 id 的旧决策 |
| `decision` | `revoke` | 撤销指定 id 的决策，保留历史 |
| `question` | `add` | 新增开放问题 |
| `question` | `resolve` | 关闭开放问题，可关联 decision id |

- 不允许通过 proposal 写 EvidenceIndex；证据只能走证据同步。
- 一次提议只影响一条记录；批量确认不属于 v1。
- 服务端分配新条目的 id；`supersede`/`revoke`/`resolve` 使用已有 id。
- 提议状态：`pending`、`confirmed`、`ignored`、`conflict`。

### 6.5 MemoryVersion（不可变版本）

| 字段 | 说明 |
|---|---|
| `id` | 版本 id |
| `projectId` | 所属项目 |
| `revision` | 从 1 递增，项目内唯一 |
| `document` | ProjectMemoryDocument |
| `contentHash` | document 的规范化 SHA-256 |
| `basis` | 确认时的项目/选题/问卷/数据/报告/规则快照 |
| `source` | `human` 或 `agent` |
| `proposalId` | 由提议确认时记录 |
| `createdBy` / `createdAt` | 确认人/时间 |
| `changeNote` | 可选说明 |

当前 ProjectMemory = 最新 revision。历史版本只读，不能修改或删除。

---

## 7. 写入路径

### 7.1 证据索引同步（自动、派生）

**触发**：问卷保存、数据导入/质控、结果登记、报告保存、规则解析完成后。浏览器 debounce 1.5 秒，合并同类变更。

**请求**：`PUT /api/projects/{project_id}/memory/evidence`

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "uuid",
  "expectedEvidenceRevision": 6,
  "entries": [ ... ],
  "basis": { ... }
}
```

**服务端规则**：

1. 调用者必须是 owner/editor；viewer/reviewer 不可同步。
2. 校验条目数量、键、文本长度和已知字段；未知字段拒绝。
3. 能通过数据库核对的 `topic/questionnaire/report/rules` 必须核对；与当前版本不一致返回 `409 memory_evidence_conflict`，客户端刷新后重试。若某类数据尚未托管到服务端（例如报告只在浏览器里），该条必须标 `verifiedBy: "client"`；客户端不能把可核对的数据标成 `server`。
4. `dataset` 始终只能标 `verifiedBy: "client"`；服务端不声称已核验哈希或行数，也不把客户端索引升级为 `server`。
5. 只有 `entries` 或 `basis` 有变化时才递增 `evidenceRevision`；成功后返回最新索引。
6. 证据同步**不改变** ProjectMemory 的文字 revision，不触发文字确认。

**失败**：网络/服务错误时保留本地“待同步”状态，重试；对话不阻塞。简报中保留上次索引并标 `evidenceStale: true`。

### 7.2 模型提议（必须确认）

**工具**：`memory_propose`，由模型请求，浏览器执行；它是写入型动作，不自动执行。

**请求**：`POST /api/projects/{project_id}/memory/proposals`

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "uuid",
  "baseRevision": 3,
  "operation": { "kind": "decision", "action": "add", "entry": { ... } },
  "reason": "对话中已确认抽样方案",
  "sourceRefs": [{ "kind": "turn", "conversationId": "thread-id", "turnId": "turn-receipt-id", "serviceId": "service-id" }]
}
```

**流程**：

1. 模型在回复中请求 `memory_propose`，最多带一个操作。
2. 浏览器检查当前对话已归入项目、当前用户是 owner/editor、记忆已加载。
3. 浏览器调用提议接口；服务端校验角色、`baseRevision`、operation 形状和来源引用，保存为 `pending`。
4. 浏览器把返回的 proposal 渲染成对话里的“记忆提议”卡，显示 diff、理由、来源和“确认/忽略”。
5. 用户确认或忽略；确认后服务端生成新的 MemoryVersion，提议变 `confirmed`，对话追加“已写入项目档案 · 第 N 版”。
6. 用户忽略则提议 `ignored`，记忆不变。

**模型工具参数（v1）**：

```json
{
  "tool": "memory_propose",
  "args": {
    "kind": "intent|decision|question",
    "action": "set|add|supersede|revoke|resolve",
    "field": "intent 字段，可选",
    "targetId": "现有条目 id，可选",
    "scope": "rules|design|sampling|analysis|report|general，可选",
    "text": "结论、字段值或问题",
    "detail": "决策理由，可选",
    "why": "问题的 why，可选",
    "next": "问题的下一步，可选",
    "reason": "为什么现在写入记忆"
  }
}
```

- `text` ≤ 1,200 字，`detail` ≤ 2,000 字，`why` ≤ 1,000 字，`next` ≤ 1,000 字，`reason` ≤ 600 字。
- `intent` 必须带 `field`；`supersede/revoke/resolve` 必须带 `targetId`；`add/set` 不带目标 id。新增 decision 必须有 `text` 和 `detail`（理由），新增 question 必须有 `text` 和 `why`。
- **模型不提供哈希或 revision**。浏览器按 `scope` 把当前相关证据引用补进 `dependsOn`；服务端校验这些引用确实存在于当前 EvidenceIndex，且数量/长度合法。模型不能自造依据。
- 浏览器把当前对话 id、轮次 id、模型服务 id 补进 `sourceRefs`；模型不负责来源字段。
- 浏览器按 `scope` 附加 `dependsOn`，默认 `general`：

| scope | 默认依赖 |
|---|---|
| `rules` | `rules` |
| `design` | `topic`、`questionnaire`、`rules` |
| `sampling` | `questionnaire`、`rules` |
| `analysis` | `questionnaire`、`dataset` |
| `report` | `report`、`result:*` |
| `general` | `topic` |

浏览器只附加当前 EvidenceIndex 中实际存在的条目；没有就不附加。服务端只接受存在的依赖；不存在或超限返回 `422 invalid_memory`。用户可在项目页调整依赖，模型不能自造。

**边界**：

- 没有项目、viewer/reviewer、或 memory 未启用：浏览器直接回复原因，不调用提议接口。
- 模型不能提议 EvidenceIndex，也不能一次改多条。
- 模型可以引用已有 decision id 做 supersede/revoke；id 必须出现在当前简报或 `memory.read` 结果里，服务端校验存在。
- 提议不因为时间自动确认；`pending` 可以一直保留到用户处理或项目关闭。

### 7.3 人工编辑（直接确认）

**入口**：托管项目页的“项目档案”标签。owner/editor 可以直接编辑完整 document。

**请求**：`POST /api/projects/{project_id}/memory/versions`

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "uuid",
  "expectedRevision": 3,
  "document": { ... },
  "changeNote": "补充抽样理由"
}
```

**规则**：

1. 校验完整 document、文本上限、id 唯一性、status 合法、引用存在。
2. `expectedRevision` 不等于当前 revision → `409 memory_revision_conflict`，返回当前文档和差异。
3. 通过后插入新 MemoryVersion，revision +1；记录 `createdBy` 和 `changeNote`。
4. 人工编辑可以清除 stale：更新 `dependsOn` 与 `basis` 后视为复核通过；也可以新增 superseding decision。
5. 人工编辑不可修改历史版本；只能生成新版本。

### 7.4 冷启动

- 项目没有 MemoryVersion 时，`GET /memory` 返回 `revision: 0`、空 document 和一个只读 `seed`。
- `seed` 来自：项目标题；最新已确认的选题版本（标题、决策目标、对象、地区、问题）；不来自模型猜测。
- `seed` 不持久化、不算记忆；项目页显示“从选题带入”，用户确认后才生成第一版。
- 没有已确认选题时，seed 只含项目标题，其余 intent 为 `unknown`。
- 不自动写入、不自动确认；Agent 在第一段对话可以提议带入，但仍走确认卡。

---

## 8. 确认与冲突

### 8.1 确认卡

对话内的“记忆提议”卡必须显示：

- 操作类型：新增 / 更新 / 取代 / 撤销 / 关闭问题；
- 目标条目与现有内容的 diff；
- 理由；
- 来源：哪段对话、哪一轮、哪个模型服务；
- 影响：将生成第几版、会取代哪条旧决策；
- 权限提示：只有 owner/editor 可以确认。

确认 / 忽略按钮必须可键盘操作；diff 不能只靠颜色区分，必须有文字标签（新增/删除/变更）。

### 8.2 版本冲突

- 提议使用 `baseRevision`；确认时再校验当前 revision。
- 不一致返回 `409 memory_revision_conflict`，提议标记 `conflict`，不自动 rebase。
- 客户端展示“队友刚更新了项目档案”，提供“查看当前版本 / 让 Agent 基于新版重新提议”；用户也可以直接忽略。
- 人工编辑同样使用 `expectedRevision`；冲突时不覆盖，保留本地编辑内容供重试。
- 确认与忽略使用幂等键；重复确认返回同一结果，不生成第二版。

### 8.3 条目冲突

- `supersede`/`revoke`/`resolve` 的目标 id 必须存在且状态允许；否则 `409 memory_entry_conflict`。
- 同一目标被两个提议同时取代：先确认者生效；后确认者冲突，需人工选择保留哪一条。
- 不允许两个有效 decision 使用同一 id；id 由服务端生成或由人工从现有条目引用。

### 8.4 审计

每个 MemoryVersion 必须记录：

- 确认人（`createdBy`）；
- 时间（`createdAt`）；
- 来源（human / agent proposal）；
- 提议 id、对话 id、轮次 id、模型服务 id（可用时）；
- 变更说明与 contentHash。

审计信息随项目记忆版本保存；导出 AI 使用记录时，可以附上“项目记忆写入”清单，但不把记忆正文塞进每段对话记录。

---

## 9. 失效机制

### 9.1 依赖声明

每条 decision 记录 `dependsOn`，每项是一个引用：

```json
{ "kind": "topic|questionnaire|dataset|report|rule|result", "id": "可选", "revision": 0, "hash": "可选" }
```

- `topic`：选题版本；
- `questionnaire`：问卷版本与哈希；
- `dataset`：数据哈希（client-reported）；
- `report`：报告版本与哈希；
- `rule`：规则快照哈希；
- `result`：登记结果 id 与结果版本/哈希（若结果被删除，标 missing）。

### 9.2 失效判定

读取时按当前 EvidenceIndex 计算，不持久化 stale 字段：

| 情况 | 标记 |
|---|---|
| 依赖条目仍存在，revision/hash 相同 | 有效 |
| 条目存在但 revision/hash 不同 | `changed`，写明从哪版到哪版 |
| 条目不存在 | `missing`，写明哪项证据已删除 |
| 索引没有同步过该条目 | `unknown`，不当作有效依据 |

Intent 的 `source.kind === "topic"` 且选题版本变化时：已确认字段标 stale；`unknown` 字段可以显示 seed 更新，但仍不自动写入。

### 9.3 处理方式

- stale 条目不删除、不改写，继续留在文档历史里。
- 简报把 stale 条目从“有效决策”移到“待复核”，模型必须说明旧依据。
- 用户可以在项目档案里“复核通过”（更新 `dependsOn`/basis，生成新版本）或新增 superseding decision。
- 不允许按时间自动过期；只有依据变化或人工复核会改变状态。
- 开放问题被决策解决时，人工或提议将其标为 `resolved`，并记录 `resolvedBy`。

### 9.4 当前模块优先

记忆与当前问卷/报告/数据冲突时：

- 当前模块版本为准；
- 简报和 `memory.read` 都显示冲突提示；
- 模型回答必须说“档案记录的是旧版，当前是……”，不能把旧记忆当现状；
- 记忆写入不会改动模块数据；模块数据也不会被记忆覆盖。

---

## 10. 读取路径

### 10.1 每轮简报（服务端构建）

Agent 每轮请求增加 `projectId`（当前对话归入的托管项目；未归入时为 `null`）。服务端必须：

1. 校验 `projectId` 是 UUID，且当前用户是项目成员；不是成员或没有项目时，不注入记忆，`memory.available: false`，继续用现有上下文回答，不泄露任何记忆。
2. 读取最新 MemoryVersion 与 EvidenceIndex，按 §6.3 构建 `ProjectBrief`。**服务端构建，不信任浏览器传来的记忆正文**；浏览器只提供当前的模块摘要（照度、盲区、图表、结果数量）。
3. 把记忆简报与模块摘要合并进提示词，并分别标明来源：记忆是团队确认的档案，模块摘要是当前浏览器项目状态。
4. `available: false` 时，模型必须知道“这次没有项目记忆”，不得编造项目意图。
5. 简报最多 2,000 字；`ChatContext` 仍受 `CONTEXT_BYTES`（16,000）限制。超出时按 §6.3 截断简报；仍超限时优先保留照度/盲区，再截断简报。
6. `ChatRequest` / 后端 `REQUEST_FIELDS` 增加 `projectId`（UUID 或 `null`）；现有 `context` 字段不变。服务端按当前用户重新校验成员身份，不沿用浏览器传来的权限结论。

服务端提示词材料中的记忆形态：

```json
"memory": {
  "available": true,
  "brief": { ...ProjectBrief },
  "revision": 3,
  "evidenceRevision": 7
}
```

简报中的每条 decision 带 id；模型可以用 `memory.read` 取详情。浏览器不得用本地缓存替代服务端简报注入模型。

### 10.2 memory.read 工具

新增只读工具：

```json
{ "tool": "memory", "args": { "section": "intent|decisions|evidence|open", "id": "可选条目 id" } }
```

- `section` 与 `id` 至少一个；同时存在时以 `id` 为准。
- 浏览器只读**当前项目**记忆；不能跨项目。
- 返回内容最多 1,200 字；超出截断并注明。
- 结果可回传给模型继续回答（加入 `RESULT_TOOLS`，不计为写操作）。
- 没有记忆或没有权限时返回明确说明，不返回空字符串。
- `memory.read` 不改变 revision，不触发确认。
- `memory_propose` 是写入型工具，不加入 `RESULT_TOOLS`，不触发自动续答；它只生成待确认提议。

### 10.3 提示词约束

后端 `_prompt` 必须加入：

- `context.memory` 是项目档案的压缩摘要，不是原始数据；`stale` 条目不是有效结论。
- 当前模块版本优先；记忆与现状冲突时指出冲突。
- `verifiedBy: "client"` 的证据是浏览器上报，不得说成已核验。
- 记忆不足时先问，不猜测研究意图、对象、地区或方法。
- 只有 `canPropose: true` 时才可请求 `memory_propose`；且必须说明“会生成待确认提议，不会直接写入”。

### 10.4 会话摘要的位置

v1 不把会话摘要放进项目记忆。当前 12 条历史保持不变；后续如需压缩，只允许：

- 存在浏览器本地、按对话、带 TTL；
- 标注“会话摘要，未经项目确认”；
- 不进入 `ProjectBrief` 的“有效决策”；
- 不参与 stale 判定。

---

## 11. 权限与安全

### 11.1 角色矩阵

| 操作 | owner | editor | reviewer | viewer |
|---|---|---|---|---|
| 读取项目记忆 | 允许 | 允许 | 允许 | 允许 |
| 读取历史版本 | 允许 | 允许 | 允许 | 允许 |
| 查看待确认提议 | 允许 | 允许 | 不允许 | 不允许 |
| 由 Agent 提议 | 允许 | 允许 | 不允许 | 不允许 |
| 确认/忽略提议 | 允许 | 允许 | 不允许 | 不允许 |
| 直接编辑文档 | 允许 | 允许 | 不允许 | 不允许 |
| 同步证据索引 | 允许 | 允许 | 不允许 | 不允许 |

reviewer 在本期仍为只读（与现有项目成员说明一致）；viewer 只读。两者可以使用 `memory.read` 和读取简报，但不能写入。

### 11.2 服务端强制

- 每个记忆接口先调用项目成员校验（`owned_project`/`membership`），不能只依赖前端按钮。
- RLS：读取按项目成员；写入限 owner/editor；记忆版本表不可更新/删除。
- proposal 的操作 JSON 不可被普通接口修改；确认/忽略只改状态和审计字段。
- 所有写接口要求 `idempotencyKey`，复用现有 `Operation` 幂等模式。
- 错误信息不泄露其他项目、成员或密钥。

### 11.3 数据边界

- 不存原始数据行、问卷全文、报告正文、模型密钥。
- EvidenceIndex 只存计数、版本、哈希和短摘要。
- 项目档案正文只存研究意图、决策、开放问题；decision 的 rationale 必须是人可读的解释，不是数据转储。
- 客户端上报的数据索引必须标 `verifiedBy: "client"`；服务端不得把它升级为 `server`。
- 模型只能看到当前项目的 brief 和 `memory.read` 结果；不能跨项目检索。
- 记忆正文不进入公开分享；`/s/{token}` 等公开路由不得暴露项目记忆。

### 11.4 访客与本地项目

- 未登录、访客、未归入托管项目的对话：`memory.available: false`。
- `memory_propose` 返回“先把这段对话归入一个托管项目”，不创建本地假记忆。
- 本地草稿可以继续保存对话，但不进入项目档案；登录后并入账号的对话如果归入项目，才可提议。
- 离线时只读缓存；确认/编辑/同步证据必须在线，失败要明确说明。

---

## 12. 界面

### 12.1 编辑入口：托管项目页的“项目档案”标签

v1 把**唯一完整编辑器**放在托管项目页（`/projects/{projectId}`）的“项目档案”标签，而不是 Agent 侧栏：

- 记忆是项目级、团队级、版本化的资产，不属于某一段对话；
- 经典工作台是全局的，没有“当前项目”上下文，新增项目记忆面板会引入一个需要项目选择器的全局页面；
- Agent 内保留摘要和确认卡，用户仍可在对话中一键确认，不必离开。

项目页新增标签 `memory`，包含：

- 顶部：项目名、当前 revision、evidenceRevision、basis、权限说明；
- 四个区块：研究意图、已确认决策、证据索引、开放问题；
- 待确认提议（owner/editor）：diff、确认、忽略；
- 历史：版本列表、确认人/时间、来源、变更说明；
- 空状态：seed 预览 + “从选题带入”；
- stale 条目：原因、去复核、被替代/撤销状态。

### 12.2 Agent 内

- **项目全景**：增加一行“项目档案”摘要：研究意图一句话、有效决策数、开放问题数、stale 数；点击打开项目页的记忆标签。没有项目记忆时显示“这段对话还没有归入项目档案”。
- **对话**：模型提议显示“记忆提议”卡，内含 diff、理由、来源、确认/忽略；确认后回执“已写入项目档案 · 第 N 版”，链接到项目页对应条目。
- **输入框**：不改现有交互；可以在项目菜单里说明“归入项目后可写入项目记忆”。
- **权限**：viewer/reviewer 看不到确认/忽略按钮；卡片显示“只读成员可查看，需 owner/editor 确认”。

### 12.3 可访问性

- diff 的每个变更都有文字标签（新增/删除/变更），不只靠颜色；
- 确认卡沿用现有双线框、`y/n` 键盘语义；
- 项目页标签可键盘切换，记忆条目可逐条聚焦；
- 长文本断行，不出现横向滚动；深色/浅色主题都检查。

---

## 13. 接口与契约

### 13.1 接口表

| 方法 | 路径 | 角色 | 作用 |
|---|---|---|---|
| GET | `/api/projects/{project_id}/memory` | 成员 | 当前 document、evidence、stale、权限、seed、pendingProposals |
| GET | `/api/projects/{project_id}/memory/versions?before=&limit=` | 成员 | 版本历史 |
| GET | `/api/projects/{project_id}/memory/versions/{version_id}` | 成员 | 某一版 document |
| POST | `/api/projects/{project_id}/memory/versions` | owner/editor | 人工编辑，生成新版本 |
| PUT | `/api/projects/{project_id}/memory/evidence` | owner/editor | 同步证据索引 |
| POST | `/api/projects/{project_id}/memory/proposals` | owner/editor | 创建 Agent/人工提议 |
| GET | `/api/projects/{project_id}/memory/proposals?status=pending` | owner/editor | 项目页待确认列表 |
| POST | `/api/projects/{project_id}/memory/proposals/{proposal_id}/decide` | owner/editor | 确认/忽略 |

所有写接口必须支持 `idempotencyKey`、`expectedRevision`/`expectedEvidenceRevision`（适用时）和统一错误结构。

### 13.2 GET /memory 返回

```json
{
  "schemaVersion": 1,
  "projectId": "project-id",
  "revision": 3,
  "contentHash": "sha256...",
  "document": { ...ProjectMemoryDocument },
  "evidenceRevision": 7,
  "evidence": { ...EvidenceIndex },
  "stale": [ { "kind": "decision", "id": "decision-uuid", "reasons": ["问卷从 v4 变为 v5"] } ],
  "seed": null,
  "pendingProposals": 1,
  "permissions": { "role": "editor", "canEdit": true, "canPropose": true, "canConfirm": true }
}
```

- 没有版本时 `revision: 0`、`document` 为空结构、`seed` 有值或为 null。
- `stale` 是派生结果，不写库。
- viewer/reviewer 的 `pendingProposals` 为 0，`canPropose/canConfirm` 为 false。

### 13.3 确认/忽略

`POST .../decide`

```json
{ "schemaVersion": 1, "idempotencyKey": "uuid", "action": "confirm|ignore", "expectedRevision": 3 }
```

- confirm：若 revision 不一致，`409 memory_revision_conflict`；否则应用操作，生成新版本，返回 `{ proposal, memory }`。
- ignore：不校验 revision（但仍校验提议属于该项目且 pending），返回 `{ proposal }`。
- 重复调用返回同一结果；已 confirmed 的提议不能再次 ignore。

### 13.4 错误码

| HTTP | code | 含义 |
|---|---|---|
| 403 | `role_forbidden` | 当前角色不能执行该操作 |
| 404 | `not_found` | 项目/版本/提议不存在，或不属于该用户 |
| 409 | `memory_revision_conflict` | 文字版本已被他人更新 |
| 409 | `memory_evidence_conflict` | 证据索引与当前项目版本不一致 |
| 409 | `memory_entry_conflict` | 目标决策/问题不存在或状态不允许 |
| 422 | `invalid_memory` | 形状、字段、状态或来源不合法 |
| 422 | `memory_too_large` | document 超限 |
| 429 | `memory_proposal_rate_limit` | 提议频率过高 |

---

## 14. 服务端架构

### 14.1 模块

- `apps/backend/src/multi_agent/agents/research_agent/services/project_memory.py`：纯域逻辑——document 校验、contentHash、stale 计算、seed 派生、ProjectBrief 构建、操作应用。
- `apps/backend/src/application/services/project_memory.py`：服务层——权限、Operation 幂等、版本插入、proposal 决策、evidence 同步，以及供 Agent 对话读取当前记忆与简报的只读入口。
- `apps/backend/src/evix_api/routes/project_memory.py`：路由。
- `apps/backend/src/infrastructure/database/models/project_memory.py`：SQLAlchemy 模型。
- `apps/backend/migrations/versions/0010_project_memory.py`：表、索引、RLS、不可变触发器（编号以实际迁移链为准）。
- `packages/evi-x-shared/src/project-memory.ts`（或仓库现有 shared 包）：前后端共享的 JSON 类型/解析器与上限常量。

### 14.2 表

`project_memory_versions`（不可变）：

- id, project_id, revision, document JSON, content_hash, basis JSON, source, proposal_id, created_by, created_at, change_note；
- `UNIQUE(project_id, revision)`；`UNIQUE(project_id, id, content_hash)`；
- RLS：成员读；owner/editor 插入；更新/删除禁止。

`project_memory_evidence`（当前投影）：

- project_id PK, revision, entries JSON, basis JSON, updated_by, updated_at；
- RLS：成员读；owner/editor 写；
- 不保留每次同步的历史；项目自身版本表是审计源。

`project_memory_proposals`：

- id, project_id, base_revision, operation JSON, reason, source_refs JSON, proposed_by, proposed_via, status, created_at, decided_by, decided_at, applied_revision；
- RLS：owner/editor 读/插入/决定；viewer/reviewer 不读（提议属于编辑过程）；
- 状态与审计字段可变，operation 不可经普通接口修改。

### 14.3 迁移与兼容

- 全部为新增表/路由，不修改现有项目、问卷、报告、选题表。
- 项目没有记忆记录时，GET 返回空状态，不报错。
- 现有 Agent 对话在无记忆项目上行为不变；`memory.available: false`。
- 数据库降级仍遵循仓库的“禁止破坏性 downgrade”约定；回滚通过关闭路由/UI 和恢复备份完成。

### 14.4 冷启动与 seed

- `GET /memory` 在 revision=0 时读取：项目标题、最新已确认选题版本及其确认记录。
- seed 只是响应字段；不写库、不影响 revision。
- 用户确认“从选题带入”时，走人工版本或 proposal；来源记为 `topic` + 版本/哈希。

### 14.5 Agent 对话接入

- `AgentChatService.create_turn` 接收 `projectId`，通过 `project_memory` 服务的只读入口检查成员身份并读取最新 MemoryVersion/EvidenceIndex；读取失败或非成员时 `memory.available: false`，不中断对话。
- 记忆简报由服务端构建并合并进提示词；服务端不把客户端 `context` 中的任何 `memory` 字段当作可信来源。
- `agent_chat.py` 的 `REQUEST_FIELDS` 增加 `projectId`；`_prompt` 说明记忆、stale、`verifiedBy: client` 和 `canPropose`。
- `TOOLS` 增加只读 `memory` 和写入型 `memory_propose`；`memory` 加入 `RESULT_TOOLS`，`memory_propose` 不加入，后者只生成待确认提议。

---

## 15. 客户端架构

### 15.1 模块

- `apps/frontend/lib/agent/memory.ts`：类型、UI 摘要（不是模型简报）、diff 展示辅助、stale 展示、上限常量；纯函数，可单测。模型简报由服务端构建。
- `apps/frontend/components/hosted/useProjectMemory.ts`：按 `projectId` 拉取、缓存、同步证据、刷新；没有项目时返回空状态。
- `apps/frontend/components/hosted/ProjectMemoryPanel.tsx`：项目页“项目档案”标签的编辑器/提议/历史。
- `apps/frontend/components/agent/MemorySummary.tsx`：项目全景里的摘要与入口。
- `apps/frontend/components/agent/MemoryProposalCard.tsx`：对话里的 diff 确认卡。
- `apps/frontend/components/hosted/api-client.ts` 或 `project-memory-client.ts`：接口封装、错误映射、幂等键。

### 15.2 AgentShell 接入

- 计算当前对话的 `projectId = thread?.projectId ?? book.draftProject`；
- `useProjectMemory(projectId)` 返回 `{ memory, canPropose, syncEvidence, refresh }`，供界面、记忆卡和 `memory.read` 使用；**不把 brief 传给模型**；
- 发送模型请求时把 `projectId` 放进 `ChatRequest`；服务端读取记忆并构建简报。没有项目时传 `null`；
- 每次模块保存/交接后触发 debounce 的证据同步（仅 owner/editor）；
- `memory_propose` 工具：检查项目/角色，调用提议接口，追加 `MemoryProposalCard`；
- 确认/忽略：调用 decide 接口，成功后追加回执并刷新 `useProjectMemory`；
- 切换对话/项目时取消旧请求，避免把 A 项目的记忆显示到 B 项目；
- 没有项目时 `memory_propose` 返回明确说明；服务端简报 `available: false`。

### 15.3 项目页接入

- `HostedProject` 的 `ProjectTab` 增加 `memory`；缓存里保存当前标签，刷新后回到记忆。
- 使用 `ProjectMemoryPanel`；与项目成员角色联动；viewer/reviewer 只读。
- 版本历史分页；确认/忽略提议后刷新当前 document 和待确认数。
- 证据索引只读；显示 `verifiedBy` 和 basis；不提供“手动编辑证据”的入口。

### 15.4 本地缓存

- 按 `identity + projectId` 缓存最近一次 GET 的成功响应，只读；
- 离线可显示“缓存于 …，可能已过期”，禁用确认/编辑/同步；
- 退出登录或切换项目时清除内存缓存；
- 不把项目记忆写进 `threads` 或 `drafts` 的存储键。

---

## 16. 失败处理

| 场景 | 行为 |
|---|---|
| 无项目 / 访客 | `memory.available: false`；不调用提议；不显示假档案 |
| 成员角色不足 | 只读；确认/编辑按钮禁用并说明 owner/editor 才能写 |
| 记忆 API 读失败 | 回退到当前模块状态；模型知道“这次没有项目记忆”，不阻塞对话 |
| 证据同步失败 | 保留上次索引并标 `evidenceStale`；自动重试；对话继续 |
| 文字版本冲突 | 409；展示当前版本与冲突，不覆盖；允许重新提议 |
| 提议已过期/已处理 | 显示状态；确认按钮禁用；不重复应用 |
| 离线 | 读缓存；确认/编辑/同步禁用；提示需要联网 |
| 项目被删除/权限被移除 | 下一次请求 404/403；清除页面上的记忆状态 |
| 简报超限 | 按优先级截断并标注；不影响照度/盲区等现有上下文 |
| 记忆条目引用的证据被删 | stale `missing`；不自动删除决策 |
| 模型提议包含原始数据或未知字段 | 422；不创建提议；对话显示原因 |

---

## 17. 测试

### 17.1 共享契约

- document/proposal/brief 的解析与序列化；
- 未知字段拒绝、文本上限、id 唯一、状态合法；
- contentHash 稳定性（键顺序无关）；
- 状态机：proposal pending/confirmed/ignored/conflict；decision confirmed/superseded/revoked。

### 17.2 后端单元

- 域逻辑：seed 派生、stale 计算（changed/missing/unknown）、应用操作、冲突检测、ProjectBrief 构建与截断；
- 服务层：角色矩阵、幂等、expectedRevision、证据核验、内容版本与 evidenceRevision 分离；
- 错误码与消息。

### 17.3 PostgreSQL / RLS

- owner/editor 可写，reviewer/viewer 不可写；
- 非成员不可读；
- 版本不可更新/删除；
- proposal 状态更新受控；
- 并发确认只成功一次；
- 证据同步与文字版本互不覆盖。

### 17.4 前端单元

- 前端 `ChatRequest` 带 `projectId`；界面摘要来自 GET；浏览器不把记忆正文当模型简报；
- stale 条目不进入有效决策；
- `memory.read` 工具参数与结果上限；
- 提议卡 diff、确认/忽略状态、权限禁用；
- 项目页空状态、seed、历史分页；
- 离线缓存与清除。

### 17.5 浏览器验收

- owner 在对话中让 Agent 提议一条决策 → 确认 → 新开对话，模型答出该决策与来源；
- editor 在项目页编辑 → 队友在另一浏览器登录看到同一版；
- viewer 收到只读提示，不能确认；
- 修改问卷版本 → 旧决策显示“依据已变化”，不再作为有效结论；
- 两个标签页同时确认 → 一个成功，一个冲突；
- 网络断开 → 可读缓存，确认被禁用；恢复后证据同步重试；
- 无项目/访客 → 无项目记忆提示；
- 简报不超预算、无原始数据行/问卷全文/报告正文。

### 17.6 CI

- 现有 Web（单测、类型、lint、build）、API（PostgreSQL pytest）、Repository layout 全部通过；
- 新增测试不降低断言；迁移在 PostgreSQL 16 上运行。

---

## 18. 里程碑与验收

### M1 契约、存储、权限

- 共享类型/校验、三张表、迁移、RLS、不可变版本；
- GET/POST 版本、GET/PUT 证据、proposal 创建/决定骨架；
- 角色矩阵与幂等；
- 验收：PostgreSQL 权限与并发测试通过，空项目返回空状态。

### M2 读取与简报

- 证据同步、seed、服务端 brief 构建、`ChatRequest.projectId`、`memory.read` 工具、提示词；
- 无项目/无记忆/滞后回退；
- 验收：新对话能读到已有人工记忆；`memory.read` 可取详情；简报上限与 truth hierarchy 测试通过。

### M3 提议与项目页

- `memory_propose` 工具、对话 diff 卡、确认/忽略、项目页“项目档案”标签、人工编辑、历史、冷启动带入；
- 验收：模型提议不直接落库；确认后生成版本；项目页可编辑/回看；刷新后待确认提议仍在。

### M4 团队、失效与验收

- 跨设备/队友读取、并发冲突、stale 计算与展示、审计导出、上限/归档；
- 验收：浏览器场景全部通过，CI 全绿。

### 总体验收标准

1. 同一项目新开对话，模型能答出“研究什么、已确认什么、依据哪版、下一步”，且每条能指回条目/版本。
2. 任何文字记忆写入都必须有确认记录；模型不能静默写入。
3. 队友换设备能看到同一份已确认记忆；viewer/reviewer 只读。
4. 底层证据变化后，旧决策显示 stale，不被当作有效结论，也不被自动改写。
5. brief ≤ 2,000 字，`context` 不超限，不含原始数据行、问卷全文、报告正文。
6. 无项目、未登录、离线时行为明确，不伪造记忆。

---

## 19. 未纳入本期与后续接口

| 工作 | 状态 | 预留接口/边界 |
|---|---|---|
| 个人偏好记忆 | 第二期 | 按 user 存储，独立权限；不进入 ProjectBrief 的“项目决策” |
| 会话摘要压缩 | 第二期 | 只在本浏览器、带 TTL、标“未经项目确认”；不进项目记忆 |
| 向量/全文检索 | 不做底座 | 最多作为 memory.read 之上的辅助；证据与决策仍以结构化条目为准 |
| Agent 内独立档案面板 | 后续 | 若做，必须解决全局工作台的项目选择；v1 用项目页标签 |
| 批量提议/逐条确认 | 后续 | v1 一次一条，降低冲突与审计复杂度 |
| 离线确认写入 | 后续 | v1 只读缓存，写入要求在线 |
| 跨项目记忆 | 不做 | 记忆严格按项目隔离 |

---

## 20. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 记忆形态 | 版本化项目档案，不是聊天摘要/向量库 | 可读、可审、可指回来源；符合证见证据链 |
| 存储 | 云端项目 + 浏览器只读缓存 | 团队/设备共享；原始数据仍留在浏览器 |
| 写入权 | owner/editor 确认；reviewer/viewer 只读 | 与现有成员权限一致，避免旁观者误改 |
| 模型权限 | 只能提议单条，不能写证据 | 防止模型把猜测变成事实 |
| 证据索引 | 自动派生；server/client 标明核验方式 | 保持新鲜度，同时不夸大验证范围 |
| 失效 | 依据变化标 stale，不自动改写 | 保留审计与人的判断 |
| 读取 | 2k 简报 + `memory.read` 按需 | 有界上下文，细节可查 |
| 编辑入口 | 托管项目页“项目档案”标签 | 项目级资产，避免全局工作台无项目上下文 |
| 冷启动 | seed + 确认带入 | 不自动写、不凭空造 |
| 个人偏好/会话摘要 | 第二期、独立层 | 避免三种记忆混在一起 |

---

## 21. 审批与下一步

- 本规格书为设计文档，不包含实现代码。
- 审阅通过后，进入实现计划（writing-plans），按 M1–M4 拆分垂直切片。
- 在实现前不得开始改数据库、路由或 Agent 提示词；任何设计变更先更新本文件。
