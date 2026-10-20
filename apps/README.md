# `apps/` 应用源码结构

`apps/` 里分为平台前端和 Python 后端两套应用，目录名统一为 `frontend` 和 `backend`。前后端共享契约、根目录启动脚本和运行文档仍位于 `apps/` 之外。

## 目录图

```text
apps/
├── frontend/                       # Next.js 平台应用：网页、交互和少量同源 API
│   ├── app/                        # App Router 页面、布局、路由
│   │   └── api/                    # 暂留在 Next 的少量无状态 API 路由
│   ├── components/                 # 页面组件，按分析、问卷、报告等功能分组
│   ├── lib/                        # 前端/Next 共用逻辑与适配器
│   ├── data/                       # 应用内静态数据和目录
│   ├── content/                    # 页面内容
│   ├── docs/                       # 平台自身技术说明
│   ├── db/                         # Next 侧本地编辑器等功能的数据访问
│   ├── drizzle/                    # 上述本地数据层的迁移
│   ├── build/                      # 构建期插件与适配
│   ├── worker/                     # Cloudflare Worker 入口/兼容层
│   ├── workers/                    # 浏览器 Web Worker
│   ├── public/                     # 静态资源
│   ├── scripts/                    # 前端构建、同步、检查脚本
│   ├── tests/                      # 前端和领域功能测试
│   ├── legacy/                     # 迁移期间保留的旧实现
│   ├── local-bridge/               # 本机 Agent 状态只读桥接器
│   └── native-shell/               # 本机桌面/服务壳
│
├── backend/                        # FastAPI 后端
│   ├── src/evix_api/               # 对外 FastAPI 接口
│   └── src/multi_agent/            # Agent 角色、共享基础服务与编排
│   ├── migrations/                 # Alembic 数据库迁移
│   ├── tests/                      # 后端测试
│   ├── pyproject.toml              # Python 项目与依赖定义
│   └── uv.lock                     # Python 依赖锁定文件
│
└── README.md                       # 本目录说明

packages/evi-x-shared/              # 前后端共享的 TypeScript 契约；位于 apps 外
scripts/start-p0-api.ps1            # 后端本机启动入口；位于 apps 外
docs/p0-running.md                  # 当前启动方式和迁移边界；位于 apps 外
```

## 请求和数据大致如何流动

```text
浏览器
  └─ Next.js：apps/frontend/app + components
       ├─ /api/* 大部分请求 ──重写──> FastAPI：apps/backend/src/evix_api
       │                                  └─ PostgreSQL（迁移由 Alembic 管理）
       ├─ 少量无状态规则/知识/诊断路由仍由 Next 处理
       └─ 本地报告/PPT 编辑等功能仍使用 Next 侧的本地数据层
```

目前主要的账号、团队项目、模型配置和问卷版本等托管操作由 FastAPI 负责。Next 中仍保留 cases、rules、control-contract、diagnose 等少量无状态路由；本地编辑器的数据层也仍在 Next 项目中。因此这是“主业务 API 与网页分开的架构”，但迁移尚未达到所有服务端逻辑都只在 Python 后端的完全分离状态。

## 入口与定位规则

- 改网页路由或页面布局：从 `frontend/app/` 找对应 `page.tsx` / `layout.tsx`。
- 改页面交互或功能面板：从 `frontend/components/` 找功能组件。
- 改外部 HTTP 接口：从 `backend/src/evix_api/app.py` 开始；改共享服务或角色业务：查看 `backend/src/multi_agent/`；表结构变更同时检查 `backend/migrations/`。
- 改前后端共享请求/响应契约：检查仓库根目录 `packages/evi-x-shared/`，并同步验证两侧调用。
- 改动本地报告/PPT 编辑器存储：先确认是否属于 Next 侧 `db/` 与 `drizzle/`，不要误改 FastAPI 的 PostgreSQL 模型。
- 改 API 地址或启动行为：查看 `frontend/next.config.ts`、根目录 `scripts/start-p0-api.ps1` 和 `docs/p0-running.md`。

## 运行入口

以仓库根目录的 [运行说明](../docs/p0-running.md) 为准：前端通过根目录 npm 脚本启动，后端通过 `scripts/start-p0-api.ps1` 启动。Next tracing root、npm workspace、CI 和后端启动脚本均已对应到 `apps/frontend` / `apps/backend`。
