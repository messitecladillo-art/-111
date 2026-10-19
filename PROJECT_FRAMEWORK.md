# 正大杯 AI 辅助参赛平台：项目框架说明

> 本文描述仓库当前真实结构，并区分已存在的能力与规划中的模块。`apps/backend/src/multi_agent` 是平台后端多智能体运行时的开发中心；仓库根目录的 `skill/zhengda-cup-champion` 则是独立的竞赛项目控制与审计工具，不要把两者混为一套运行程序。

## 1. 总体架构

项目采用前后端分离，并尽量按职责拆分：

```text
浏览器 / 用户
    │
    ▼
apps/frontend（Next.js 前端与平台界面）
    │ HTTP / JSON
    ▼
apps/backend/src/evix_api（FastAPI 对外接口）
    │
    ▼
apps/backend/src/application（业务用例、事务与权限策略）
    │
    ├── multi_agent（角色能力、提示词与工作流）
    ├── features（网考等独立功能）
    └── infrastructure（数据库、模型连接、邮件等技术设施）
            │
            └── PostgreSQL（Alembic 迁移管理）
```

调用方向为 `frontend → evix_api → application → multi_agent / infrastructure / features`。
角色能力可以使用通用设施；通用设施不反向导入角色。`shared` 提供纯数据契约和校验。
五个角色通过工作流、结构化状态和产物引用协作，架构测试检查反向依赖与循环导入。

## 2. 仓库根目录

```text
.
├── apps/                    # 可运行的前端与后端应用
├── packages/evi-x-shared/   # 前后端可复用的 TypeScript 契约/工具
├── scripts/                 # 仓库级检查、迁移和辅助脚本
├── docs/                    # 产品、技术与运行文档
├── deploy/                  # 部署相关配置
├── evals/                   # 评测、回归场景和测试数据
├── corpus-source/           # 规则、案例等来源材料及其溯源
├── skill/                   # 竞赛研究流程、审计 CLI、模板和规范
├── handoff/                 # 交接材料
├── media/                   # 演示及视觉素材
└── tools/                   # 辅助工具
```

根目录的 `package.json` 管理 npm workspace 和常用前端命令；Python 后端依赖与运行配置位于 `apps/backend/pyproject.toml`，精确解析结果记录在 `apps/backend/uv.lock`。

## 3. 前端：`apps/frontend/`

技术栈为 Next.js、React、TypeScript。`apps/frontend/package.json` 是前端依赖与脚本入口。

| 目录 | 职责 |
|---|---|
| `app/` | Next.js App Router 页面、布局和少量 Next 侧路由 |
| `components/` | 页面与业务 UI 组件 |
| `lib/` | 前端领域逻辑、适配器及共享辅助代码 |
| `data/`、`content/` | 前端使用的静态数据与内容 |
| `db/`、`drizzle/` | 前端本地数据访问和 Drizzle 迁移 |
| `public/` | 静态资源 |
| `worker/`、`workers/` | Worker 入口及浏览器后台任务 |
| `local-bridge/`、`native-shell/` | 本地桥接与桌面/本地服务外壳 |
| `scripts/` | 素材同步、校验、构建与开发脚本 |
| `tests/` | 前端及领域逻辑测试 |
| `legacy/` | 迁移期间保留的旧实现，修改前先确认仍在使用 |
| `docs/`、`build/` | 前端说明及构建期辅助代码 |

注意：前端的 Drizzle/本地数据层与后端 PostgreSQL 不是同一个数据库层；前后端应通过明确的 HTTP 契约交互，不能假设共享运行时数据库连接。

## 4. 后端：`apps/backend/`

技术栈为 Python 3.12、FastAPI、SQLAlchemy、PostgreSQL、Alembic 和 LangGraph。常用启动方式见 [后端 README](apps/backend/README.md)，数据库结构通过 `migrations/versions/` 管理，不应在应用启动时自动建表。

```text
apps/backend/
├── src/
│   ├── evix_api/            # FastAPI 应用及对外接口
│   ├── application/         # 业务用例、事务与权限策略
│   ├── multi_agent/         # 多智能体角色能力与协作编排
│   ├── infrastructure/      # 数据库、模型连接等技术设施
│   ├── features/            # 网考等独立功能
│   └── shared/              # 共享契约与校验
├── migrations/              # Alembic 环境和数据库迁移
├── tests/                   # 后端单元、接口和 PostgreSQL 集成测试
├── acceptance/              # 已有验收/交接记录
├── pyproject.toml
└── uv.lock
```

### `src/evix_api/`：对外接口层

`app.py` 只创建 FastAPI 应用和装配模块。`routes/` 按功能接收请求、检查授权、解析输入、调用应用服务并返回响应；`uploads/` 处理流式上传边界。运行资源的生命周期位于 `runtime.py`，会话和 Origin/CSRF 适配位于 `dependencies.py`。

### `src/application/`：业务用例层

`services/` 中的独立服务处理用户、团队、项目、模型配置、问卷、选题、报告、模拟调查和 Agent 任务等用例。这里负责事务、版本冲突、幂等与外部调用的先后顺序，不导入 FastAPI。权限策略、幂等预约、业务模型 Provider 和结果序列化也各自独立。

### `src/multi_agent/`：多智能体中心

```text
multi_agent/
├── agents/
│   ├── contracts.py         # 角色共享运行契约
│   ├── runtime.py           # 共用步骤执行与校验，不放角色业务算法
│   ├── research_agent/      # 定义/Schema + services/ 研究能力
│   ├── survey_agent/        # Survey 角色模块
│   ├── data_agent/          # Data 角色模块
│   ├── writing_agent/       # Writing 角色模块
│   └── reviewer_agent/      # Reviewer 角色模块
├── roles.py                 # 角色注册表/兼容入口，不实现角色逻辑
├── prompt_registry.py       # 加载和校验角色提示词，构造模型消息
└── workflow/                # LangGraph 和跨角色状态机
```

每个角色都有 `<角色>_agent.py` 对外入口、`workflow.py` 内部工作流、`state.py`
内部状态、`schemas.py` 输入输出、`prompts/` 专属系统/步骤提示词、`tools/`
专属工具和按需保留的 `services/`。`role.py` 只描述角色元信息。
角色目录不注册 HTTP 路由，也不声明数据库表。

以 Research 为例，内部结构为：

```text
research_agent/
├── __init__.py
├── research_agent.py
├── workflow.py
├── state.py
├── schemas.py
├── role.py
├── prompts/
├── tools/
└── services/                # 及已有 topic_assets/、knowledge-catalog.json
```

内部流程按步骤同步执行；跨角色协同仍使用外层 LangGraph。
公共入口的 `run()` 返回类型化结果，`run_with_state()` 便于检查内部运行过程。
完整接入和状态边界见 [多 Agent 开发说明](apps/backend/src/multi_agent/README.md)。

#### 五个角色

| 角色 | 主要职责 | 当前情况 |
|---|---|---|
| Research Agent | 选题、资料、可行性与研究设计 | 有选题顾问、知识资料、地域目录和项目相关模块 |
| Survey Agent | 问卷、变量、抽样和预测试 | 有问卷、调查收集和 SAV 导入；预测试输出属于模拟数据 |
| Data Agent | 数据检查、清洗、统计方法、分析与图表 | 已有内部步骤和真实工具回执校验；实际统计工具和文件存储尚须接入 |
| Writing Agent | 依据设计与真实分析结果撰写报告 | 有结构化报告与 LaTeX 相关功能 |
| Reviewer Agent | 检查逻辑、证据、前后一致性和竞赛要求 | 有提交文件预检能力；完整的 Agent 审核流程仍需整合 |

#### `workflow/`：跨角色协作

- `orchestrator.py` 定义任务类型、角色顺序、Reviewer 决策、重试上限及人工确认/补充输入状态。
- `langgraph_runner.py` 将 Research、Survey、Data、Writing、Reviewer 路由为 LangGraph 节点。
- `handlers.py` 通过各 Agent 的公共入口调用其内部流程，传递类型化输入输出。
- `WorkflowState.agent_outputs` 保存角色最终结构化输出，下一角色从输入上下文获取；内部逐步检查点尚未数据库持久化。
- `evix_api/routes/agent_tasks.py` 提供任务接口，`application/services/agent_tasks.py` 处理任务事务。
- `infrastructure/database/models/workflows.py` 中的 `AgentTask` 与 `0008_agent_tasks` 迁移保存任务状态；写操作受项目成员权限控制。

重要状态说明：五个公共入口和内部步骤、外层 LangGraph 路由和任务检查点已实现，
但 `create_app` 当前没有默认注册实际模型步骤执行器。未配置的步骤明确阻塞，
没有模拟成功兜底。Data 的真实文件校验/分析工具和产物存储仍须接入，不能把
“接口能创建任务”误认为“完整研究流程已经自动运行”。

### `src/infrastructure/`、`features/` 和 `shared/`

| 文件 | 当前用途 |
|---|---|
| `infrastructure/database/models/` | 数据模型按身份、项目、模型连接、问卷、调查、工作流、知识和报告分文件；共用一个 `Base` |
| `infrastructure/database/security.py` | 数据库权限和 PostgreSQL 行级安全辅助 |
| `settings.py` | 应用运行配置与校验 |
| `security.py` | 会话、令牌、加密和密钥操作 |
| `infrastructure/llm.py` | 通用模型 HTTP 连接；业务 Provider 与合成测试适配位于 `application/providers.py` |
| `mail.py` | 邮件发送设施 |
| `infrastructure/scratch.py` | 共用临时目录、进程状态与租约操作，消除 Reviewer 对 Survey 的内部引用 |
| `shared/` | 与 HTTP/数据库无关的错误、JSON 校验、哈希及问卷数据契约 |
| `features/net_exam.py` | 独立的网络考试题库功能 |

完整文件定位与调用约定见 [后端源码导览](apps/backend/src/README.md)。现有接口契约和数据表结构保持不变。

## 5. 其他重要模块

- `packages/evi-x-shared/`：前端 TypeScript 共用契约和工具；与 Python 后端类型并非自动同步，改契约时需运行对应校验。
- `skill/zhengda-cup-champion/`：竞赛规则溯源、项目控制面、证据台账、研究/交付模板及审计工具。它服务于实际竞赛研究项目，不是 `multi_agent` Python 包。
- `corpus-source/`：规则和案例的原始来源/整理资料；来源和版本需要可追溯。
- `evals/`：Agent、主题建议等评测及回归数据。
- `docs/`：仓库级产品与技术文档；应用专属说明也可能位于 `apps/*/docs/`。
- `scripts/`、`deploy/`、`handoff/`、`media/`、`tools/`：分别承担脚本、部署、交接、媒体资产和辅助工具职责。

## 6. 模块化约定

1. `infrastructure` 不导入角色、业务用例和 API；角色包可以依赖技术设施和 `shared`。
2. 一个 Agent 管理自己的公共入口、内部工作流、状态、输入输出、专属提示词与工具；角色提示词已迁入各自目录，只有一份源文件。角色不跨包直接调用对方内部函数。
3. 角色之间通过 workflow 传递有明确版本的结构化状态、证据 ID 和产物 ID；大型文件由受控产物存储管理，不放进任务状态或模型提示词。
4. `workflow` 负责顺序、分支、审核、重试、暂停和恢复，不实现统计、问卷或报告等领域算法。
5. `evix_api` 负责 HTTP 边界和授权适配；应用服务负责事务与业务用例，角色包负责自己的能力。
6. 新增模块时先确认其唯一职责和调用方，再创建目录；避免提前填充空 `schemas/`、`tools/` 目录或建立过多抽象层。
7. 对涉及数据的 Agent，区分真实、模拟、计划与推断内容；真实数据、引用和统计结论必须保留可审计来源。

## 7. 开发与验证入口

```powershell
# 前端开发服务器（从仓库根目录）
npm run dev:web

# 后端（在 apps/backend 下；需先配置本地 PostgreSQL 和应用设置）
uv sync --locked
uv run alembic upgrade head
uv run uvicorn evix_api.app:create_app --factory --host 127.0.0.1 --port 8180 --no-access-log
uv run pytest
```

PostgreSQL 集成测试需要显式配置合成测试数据库；未运行/跳过的集成测试不能记作已通过。根目录及各应用 README 是运行命令和测试细节的权威说明。
