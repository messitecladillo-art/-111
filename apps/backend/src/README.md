# 后端源码导览

后端采用 Python `src` 布局。入口是 `evix_api/app.py`；它只创建应用和装配模块。
现有业务用例、五角色能力与技术设施各自有固定位置。

```text
src/
├── evix_api/                     # HTTP 边界
│   ├── app.py                    # 应用工厂与路由装配
│   ├── runtime.py                # 连接和后台资源的生命周期
│   ├── dependencies.py           # 会话、Origin/CSRF 和授权适配
│   ├── requests.py               # 有大小限制的 HTTP 请求解析
│   ├── errors.py                 # 异常转 HTTP 响应与安全响应头
│   ├── routes/                   # 按业务分组的薄接口
│   └── uploads/                  # SAV/投稿文件的流式上传适配
├── application/                  # 业务用例与事务编排
│   ├── services/                 # 用户、项目、问卷、选题、报告、Agent 任务等
│   ├── access.py                 # 项目、团队与模型配置的访问策略
│   ├── idempotency.py            # 幂等操作预约
│   ├── model_services.py         # 模型连接配置校验
│   ├── providers.py              # 业务层模型调用适配与合成测试 Provider
│   └── presenters.py             # 结果转为普通数据对象
├── multi_agent/                  # 五角色开发中心
│   ├── agents/
│   │   ├── contracts.py          # 角色共享任务/结果契约
│   │   ├── runtime.py            # 共用执行机制，不放角色业务逻辑
│   │   ├── research_agent/       # 选题、研究设计、知识资料能力
│   │   ├── survey_agent/         # 问卷、抽样、调查与导入能力
│   │   ├── data_agent/           # 数据分析角色；算法尚待实现
│   │   ├── writing_agent/        # 报告内容与导出能力
│   │   └── reviewer_agent/       # 审核与提交材料检查能力
│   ├── workflow/                 # 角色顺序、审核、人工确认和 LangGraph
│   ├── roles.py                  # 角色发现注册表
│   └── prompt_registry.py        # 加载提示词并封装模型消息
├── infrastructure/               # 通用技术设施
│   ├── database/
│   │   ├── models/               # 按身份、项目、问卷、调查、知识等拆分的数据表
│   │   └── security.py           # 数据库权限策略辅助
│   ├── llm.py                    # 模型 HTTP 连接、超时与响应边界
│   ├── settings.py               # 环境配置
│   ├── security.py               # 会话令牌、密钥加密等
│   ├── mail.py                   # 邮件连接
│   └── scratch.py                # 共用的临时目录、进程与租约设施
├── features/net_exam.py           # 与五角色独立的网考功能
└── shared/                       # 纯数据契约、校验与错误类型
```

## 每个角色怎么开发

五个角色都有 `<角色>_agent.py` 对外入口、`workflow.py` 内部步骤、`state.py`
内部状态、`schemas.py` 输入输出契约和 `role.py` 元信息。已有领域能力进入自己的
`services/`，专属工具进入自己的 `tools/`。
角色和步骤提示词位于 `multi_agent/agents/<角色>_agent/prompts/`，不再放共享提示词目录。
完整结构、调用方式与当前运行边界见 [多 Agent 开发说明](multi_agent/README.md)。

- Research：`services/` 中是选题、会话、研究项目、知识资料与地域相关能力；
  `topic_assets/` 和 `knowledge-catalog.json` 保留在角色根目录供资源同步使用。
- Survey：`services/` 中是问卷发布/答卷校验与模拟预测试；`tools/survey_import.py`
  负责真实 SAV 文件解析。模拟预测试输出始终属于模拟数据。
- Data：有内部检查、清洗、分析步骤与工具回执校验；实际统计工具和存储尚须接入。
- Writing：`services/reports.py` 处理报告结构；`tools/latex.py` 处理受限编译。
- Reviewer：`tools/submission_preflight.py` 检查提交文件；共用进程设施来自
  `infrastructure/scratch.py`，不再调用 Survey Agent 的内部工具。

## 修改任务应该去哪里

| 想改什么 | 入口 |
| --- | --- |
| HTTP 路径、参数、状态码 | `evix_api/routes/<业务>.py` |
| 保存、版本冲突、幂等、业务事务 | `application/services/<业务>.py` |
| 角色自己的规则、研究方法或业务能力 | `multi_agent/agents/<角色>_agent/services/` |
| 单个角色的运行入口、步骤和状态 | `multi_agent/agents/<角色>_agent/` |
| 文件解析、编译、审核等角色工具 | `multi_agent/agents/<角色>_agent/tools/` |
| 协作顺序、退回修改、人工确认 | `multi_agent/workflow/` |
| 角色和内部步骤提示词 | `multi_agent/agents/<角色>_agent/prompts/` |
| 数据表定义 | `infrastructure/database/models/`，配套 `../migrations/` |
| 模型 HTTP 连接、邮件、加密、临时进程 | `infrastructure/` |

## 依赖约定

HTTP 调用应用服务；应用服务调用角色能力、独立功能与技术设施。角色可以使用
技术设施和共享契约；技术设施不会反过来导入角色。角色之间通过工作流协调，
不直接导入另一角色的内部模块。数据表只在 `infrastructure/database/models/`
定义，并共用一个 `Base`；角色目录不再注册 HTTP 路由或声明数据表。

`tests/test_architecture.py` 会检查层级依赖、跨角色引用与显式循环导入。
运行方式和配置见上一级 [README](../README.md)。
