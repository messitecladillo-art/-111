# 五角色多智能体开发中心

HTTP 位于 `evix_api`，事务用例位于 `application/services`，通用设施位于
`infrastructure`。本包只负责角色能力和多角色协同，不声明 HTTP 路由或数据库表。

## 每个 Agent 的结构

五个目录为 `research_agent`、`survey_agent`、`data_agent`、`writing_agent`、
`reviewer_agent`；任务角色 ID 仍为 `research`、`survey` 等，不随目录改名。

```text
research_agent/
├── __init__.py             # 导出公共类和输入输出类型
├── research_agent.py       # ResearchAgent：对外运行入口
├── workflow.py             # 本角色的步骤顺序和输出检查
├── state.py                # 每次运行独立的 ResearchState
├── schemas.py              # ResearchInput / ResearchOutput / 交付物
├── role.py                 # 职责和交付物元信息
├── prompts/
│   ├── research.md         # 角色系统提示词，唯一源文件
│   ├── review_materials.md
│   ├── design_research.md
│   └── assess_feasibility.md
├── tools/                  # 专属工具注册和引用清点
├── services/               # 保留的选题、知识等领域实现，按需保留
├── topic_assets/           # 已有选题资源
└── knowledge-catalog.json
```

Data 尚无独立的真实统计服务，Reviewer 已有的文件预检位于自己的 `tools/`；
不为空目录凑结构。角色及步骤提示词已全部迁入各自 `prompts/`，不保留顶层副本。

## 两层工作流

外层 `workflow/` 使用 LangGraph，负责角色顺序、退回修改、重试上限、人工确认
和真实数据输入门禁。内层 `agents/<角色>_agent/workflow.py` 采用有界顺序执行，
负责本角色的步骤、工具回执和输出检查，不为简单流程重复搭建复杂图。

| Agent | 内部步骤 |
| --- | --- |
| Research | `review_materials` → `design_research` → `assess_feasibility` |
| Survey | `design_variables` → `design_questionnaire` → `design_sampling` |
| Data | `inspect_data` → `clean_data` → `analyze_data` |
| Writing | `outline_report` → `draft_report` |
| Reviewer | `check_evidence` → `check_consistency` → `review_deliverable` |

角色之间不互相导入内部实现。`agents/contracts.py` 只定义共享契约；
`agents/runtime.py` 只复用步骤执行、JSON 限额、工具记录、异常脱敏和引用校验，
不放角色算法。共用技术设施仍位于 `infrastructure`。

## 对外调用与接入

```python
from multi_agent.agents.research_agent import ResearchAgent, ResearchInput

# 下列变量须由集成方提供实际的同步执行函数，不能是模型生成的代码。
agent = ResearchAgent(executors={
    "review_materials": review_materials,
    "design_research": design_research,
    "assess_feasibility": assess_feasibility,
}, tools={"search_sources": search_sources})
result = agent.run(ResearchInput(
    task_id="task-1", project_id="project-1", task_type="topic_design",
    requirements={"goal": "团队确认的研究目标"},
))
```

执行函数接收 `StepRequest`：`task` 是隔离副本，`step` 是当前步骤，
`previous_results` 是中间结果，`messages` 是角色/步骤提示词与不可信任务数据包。
通过 `request.call_tool(name, **kwargs)` 只能调用本角色显式注册的工具。

中间步骤返回 JSON 对象；最后步骤返回完整的角色 `*Output`，由 Schema 校验。
工具返回 `ToolResult`，只包含必要摘要、实际产生/读取的引用及数据性质，
不要把密钥、完整数据集或个人信息塞入状态。执行器和工具目前均为同步函数。

`run()` 返回已校验输出；没有输出时抛出带安全状态副本的 `AgentExecutionError`。
需要检查过程时调用 `run_with_state()`，读取状态、已完成步骤、回执和错误码。
输出的 `errors`、`unresolved_questions` 仍须处理，待补充材料不是成功交付。

内部状态支持 `model_dump_json()` / `model_validate_json()`；内部 Workflow 的
`start()` / `advance()` 支持逐步执行，不修改传入检查点。失败不会自动重试，
运行中的检查点不会盲目重放，避免重复执行有副作用的工具。

外层接入使用 `workflow/handlers.py` 的
`create_agent_handlers({AgentRole.RESEARCH: agent, ...})`，把返回值传入
`create_app(workflow_handlers=...)`。适配器仅调用 Agent 的公共入口。
各角色最终输出保存在外层 `WorkflowState.agent_outputs`，下一角色通过
`task.context["upstream_outputs"]` 获取；Data 只接收显式输入的数据文件引用，
不会把生成的研究计划/报告当原始调查数据。

`0008_agent_tasks` 建立的表继续保存外层任务状态。部署当前版本前运行
`uv run alembic upgrade head`，应用 `0009_agent_task_collaboration`：
同队 owner/editor 可推进任务，创建者、项目归属、任务类型等身份字段保持不变。
迁移不重写已有任务内容，API 启动时校验数据库版本。
内部逐步检查点尚未持久化到数据库，不能宣称进程中断后能恢复到任意内部步骤。

## 修改入口与回归

| 要修改的行为 | 修改入口 | 应运行的回归 |
| --- | --- | --- |
| 哪些研究成果需要用户确认 | `workflow/orchestrator.py` 的 `_APPROVAL_AFTER_REVIEW`，按实际被审角色定义 | `test_multi_agent_workflow.py`，覆盖单任务和完整研究、拒绝返修、次数上限 |
| 批准后的继续执行 | `workflow/langgraph_runner.py` | 同上，覆盖 JSON 恢复、最终完成、已执行步骤不重复 |
| 团队任务读写、撤权、并发版本 | `application/services/agent_tasks.py` 与数据库迁移 | `test_agent_tasks_postgres.py`，必须使用真实 PostgreSQL 和普通应用角色 |
| 选题确认与历史版本 | `application/services/topic_projects.py` | `test_topic_projects_postgres.py`，覆盖新草稿、历史确认与撤销 |

研究设计和问卷在 Reviewer 通过后暂停，用户批准才继续；用户要求修改会返回对应
研究/问卷角色，再次审阅和确认。该流程不推进赛事 CLI 的阶段或 Gate。
历史上已被旧逻辑错误标为 `completed` 的问卷任务不会被迁移自动重开；
需要重新确认时新建任务，保留原记录。

## 真实性边界与未完成项

- 五个入口、内部步骤、状态、输入输出、角色及步骤提示词已实现并有测试。
- 原有业务能力仍保留在对应 `services/tools` 中，现有业务 API 不会被删除或悄悄改写。
- **真实模型执行函数尚未默认接入。** 未配置的步骤会明确阻塞，没有模拟成功兜底。
- Data 标为 `analyzed` 前必须有真实读取和分析工具回执，结果必须逐字段保留
  `analyze_dataset` 返回的 `data.deliverable`，模型不能改写数字。
  工具必须由后端验证文件和来源，注册引用不等于读取或核实了真实文件。
- Writing 不能在没有成功工具回执时声称已生成 Word/PDF 文件。
- Reviewer 有未解决的重要问题、证据缺口或未确定检查时不能同时给通过结论。
- 实际模型连接、真实文件存储、统计分析及导出服务仍须显式配置。
  单元测试的合成夹具不代表完成了真实调研或调用了真实模型。

完整文件定位见 [源码导览](../README.md)。
