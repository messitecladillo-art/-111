# 协作开发与交接

本文件是 Codex、Claude 和人工维护者共同遵循的开发入口。源码职责以 [项目框架](../PROJECT_FRAMEWORK.md) 为准，Agent 内部约定以 [多 Agent 开发说明](../apps/backend/src/multi_agent/README.md) 为准。不要另建一套平行的架构规则。

## 开始任务

1. `git fetch origin`，读取待合并 PR 和当前任务交接。默认集成分支为 `codex/initial-evix`；开工时用 `git remote show origin` 确认，不能假设叫 main。
2. 从确认的集成提交创建独立分支和 worktree。记录 base SHA、负责模块、允许修改的路径、验证命令和共享文件的整合人。不要在用户预览进程或协作者的脏 checkout 中 pull、reset 或切分支。
3. 先读根 `AGENTS.md`、`PROJECT_FRAMEWORK.md` 和当前目录 README。继续旧任务时先查看已有改动，不把未提交内容当作废弃文件。

例如，从根目录执行：

```powershell
git fetch origin
git worktree add -b codex/my-task ../evix-my-task origin/codex/initial-evix
```

每个任务一个负责人、一条分支、一处工作目录。分支前缀可以用 `codex/` 或既有的 `claude/`；这不表示永久按工具分配模块。任务交接可按下面的字段填写在 PR 草稿或本地协调记录中：

```yaml
task: brief-name
base_sha: exact-commit
owner: assigned-maintainer
write_paths: [apps/frontend/components/example/]
shared_files_integrator: assigned-maintainer
verification: [exact-command]
state: in-progress
next: concrete-next-action
```

任务记录不是文件锁。若另一任务正在改相同路径，先转交写权或拆分路径；不要同时写同一个文件，再依赖 Git 判断业务意图。

## 模块边界

| 范围 | 唯一职责 | 跨界时必须带上 |
|---|---|---|
| `apps/frontend` | 页面、交互、浏览器本地处理、展示和前端领域逻辑 | API 输入输出及错误样例 |
| `apps/backend/src/evix_api` | HTTP 校验、授权适配、响应和应用装配 | 对应 application 服务，不放统计公式和事务实现 |
| `apps/backend/src/application` | 权限策略、事务、版本、幂等和业务编排 | 对 Agent/设施的明确调用和失败处理 |
| `apps/backend/src/multi_agent/agents/<role>` | 角色 Schema、提示词、步骤、工具和领域能力 | 类型化结果、版本及证据引用；不直连别的角色内部函数 |
| `multi_agent/workflow` | 跨角色顺序、审核、暂停和恢复 | 不实现角色算法，不代替赛事 CLI Gate |
| `infrastructure` / `shared` | 数据库与外部连接设施 / 纯契约与校验 | 调用方清单、权限及兼容性检查 |
| `packages/evi-x-shared` | TypeScript 共享契约 | Python 对应实现与跨语言样例 |
| `skill` | 研究规范、模板与确定性工具源 | 版本、来源和对应验收；个人安装副本不是生产源码 |
| `corpus-source` / `evals` | 来源溯源 / 回归与评测 | 来源及适用范围；不把原报告和真实答卷放进公开静态目录 |

`apps/frontend/legacy` 是保全区，不是新功能入口。`apps/evi-x-platform`、`apps/evi-x-api` 已退役，不能从旧 PR 把它们恢复成运行目录。不要为了整理再次整体重命名前后端。

## 共享文件实行单写整合

以下接缝改动容易互相覆盖，应在任务开始时指定一位整合者，领域作者提交精确片段、契约样例和测试：

- 工作台与项目宿主：`EviXPlatform.tsx`、`HostedProject.tsx`、`useWorkbenchModules` 及 handoff/ack 契约。
- 成果契约：`editor-model.ts`、`research-quality.ts`、`analysis-result-receipt.ts`、`report-storyboard.ts`。
- 后端装配与导出：`evix_api/app.py`、报告/LaTeX 路由、对应 application 适配器。
- 根 workspace、依赖锁、数据库迁移、Next 配置和 CI。

共享字段变更同时说明：谁产生、谁校验、谁持久化、谁消费、谁确认；至少提供一个有效样例及一个拒绝样例。不能删字段或减少断言来适配旧测试。迁移后新文件按职责落位，不直接接受 Git 对重命名目录的猜测。

## 验证与合并

从根目录运行：

```powershell
python -X utf8 scripts/check-repo-layout.py
python -X utf8 -m unittest discover -s tests -p test_repo_layout.py
npm ci
uv sync --locked --project apps/backend
npm run test:shared
npm run test:unit --workspace evi-x-zhengda-champion-platform
npm run typecheck:web
npm run lint --workspace evi-x-zhengda-champion-platform
npm run build:web
```

前端图表/TeX 契约测试会真实调用 Python Writing 模块，因此完整前端单测也需要后端锁定依赖。`EVIX_PYTHON` 可以显式选择该环境；默认发现 `apps/backend/.venv`。后端 `uv run pytest -q` 在 `apps/backend` 下运行。PostgreSQL 集成测试需专用合成测试数据库；CI 配置 PostgreSQL 16 并执行真实迁移/RLS。跳过项必须单独登记，不算通过。

前后端结构防线各有分工：仓库布局检查防止旧应用目录与活动配置回流；现有 `test_architecture.py`、`test_agent_modularity.py` 检查后端分层、角色边界和循环导入。它们不能证明真实模型调用或完整研究任务成功。

先解决冲突、审查当前 diff、执行适用检查，再提交 PR。重基或更新提交后，复核新的 head SHA；旧 head 的绿色检查不能给新提交背书。堆叠 PR 必须确认最终根 PR 已进入集成分支，叶子 PR 的 merged 状态不代表功能已在主干。

合并后记录实际 merge commit，在明确绑定该提交的工作目录验证启动及关键交互。预览地址要同时写明工作目录、提交和端口，不覆盖另一维护者的进程。静态资源退役还要验证生产 URL 不再可读，不能只检查源码文件已删除。

## Skill 与资料

Skill 的规范源保存在仓库 `skill/`；个人 `.codex/skills`、桌面归档、私有阅读缓存和 `.collab` 是安装或研究位置，不是新克隆的运行依赖。Skill 分支若引入 catalog/生成包，必须连同唯一生成器、版本及 `--check` 验收一起接入；禁止两份源各改一次，也不要把尚未合并的生成器写成主干已有能力。

原报告、原始答卷、Key 和私有证据不得进入 Git、`public/`、Docker 公开层或公共运行包。公开案例目录可以保存来源与定位；本地合法原文保留在浏览器私有存储。资料包、二进制和冻结规则按原有哈希策略保全，不做全仓换行归一化。

## 完成状态与交接

明确区分：**已产出 → 已提交 → 已建 PR → 已合并 → 已验证预览**。交接至少给出 commit/PR、改动范围、实际验证、未测环境、预览位置、遗留项与下一动作。未经复核的本地候选保留为候选；不要为让 Git 看起来干净而清理别人的工作目录。
