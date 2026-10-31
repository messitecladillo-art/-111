# 证见 EVI-X P0 本地运行

本批直接升级 `apps/frontend`，保留原工作台、品牌、问卷设计、变量映射、统计、报告/PPT 本地导出和答辩工具。新增 `apps/backend` 和 `packages/evi-x-shared`。第一批的托管闭环是邮箱登录、团队项目、个人模型配置、问卷提案、确认应用、编辑、保存和历史载入。

## 安装与启动

要求 Node.js 22.13+、Python 3.12、uv 和 PostgreSQL 17。本机已用 Node 24.15、Python 3.12.14 验证。JS 依赖使用仓库根 `package-lock.json`；Python 使用 API 目录的 `uv.lock`。

本地启动脚本兼容 Windows PowerShell 5.1 和 PowerShell 7，无需为启动后端单独安装 PowerShell 7。

```powershell
# 仓库根目录
npm ci --ignore-scripts --no-audit --no-fund
uv sync --locked --project apps/backend --python 3.12

# 优先使用 Docker Linux 引擎。只映射本机端口 55432。
docker compose -f deploy/compose.dev.yaml up -d

# 初次创建随机的本地认证/加密材料，随后执行 Alembic。
.\scripts\migrate-p0.ps1

# 终端 1：FastAPI，127.0.0.1:8180
.\scripts\start-p0-api.ps1

# 终端 2：Next，127.0.0.1:3180
npm run dev:web
```

打开 `http://127.0.0.1:3180/` 查看公开首页；`/projects` 进入团队项目，`/workspace` 进入保留的研究工具。API 只通过同源 `/api` 访问；Next 的 `EVIX_API_ORIGIN` 在构建/启动前由运营方配置，默认 `http://127.0.0.1:8180`。

正式构建的本地启动方式如下。`EVIX_API_ORIGIN` 会写入构建期的转发配置，更换 API 地址后需重新构建。启动器复制静态资源后运行 Next standalone 服务，默认仍只监听本机。

```powershell
$env:EVIX_API_ORIGIN = 'http://127.0.0.1:8180'
npm run build:web
npm run start --workspace evi-x-zhengda-champion-platform
```

可通过 `PORT` 修改网页端口，`EVIX_WEB_HOST` 修改监听地址；公开部署应由 HTTPS 反向代理提供入口。开发服务与正式服务不能同时使用 3180；它们也共用 `.next`，构建与开发不要并发运行。

本机 Docker Desktop 的推理服务启动失败，因此实际验收使用独立原生 PostgreSQL。下载器使用 PostgreSQL 官网指向的 EDB 二进制发行包；未安装系统服务。已下载的包保存在 `.local/pgsql`，Windows 中文目录兼容所需的运行目录记录在 `.local/postgres-runtime.json`，数据仅用于合成验收。

```powershell
# Docker 不可用时的备选；与 Docker 实例二选一，不能同时占用 55432。
apps/backend/.venv/Scripts/python.exe scripts/setup-local-postgres.py
.\scripts\start-p0-postgres.ps1
.\scripts\migrate-p0.ps1
```

原生启动需要能够创建子进程的 Windows 用户会话。本批的沙箱限制了 PostgreSQL 创建受限令牌，已通过授权的项目专用本机进程完成运行验证。临时目录不是正式数据库存放位置。

## 本地体验账户

当前 `local_test` 环境仅接受合成邮箱，邮件与模型都是明确标识的本地测试适配器，不会发信或产生模型账单。

- 主账户：`owner@example.test`
- 队友：`teammate@example.test`
- 点击发送验证码后，在 `.local/mailbox` 对应 JSON 文件中读取本地验证码。
- 邀请码注册：用主账户在 `/invites` 生成邀请码，再用任意 `@example.test` 新邮箱在登录页填写邀请码注册（见 `docs/invite-codes.md`）。
- 模型配置可填模型 ID `synthetic-model`、测试 Key `synthetic-test-key-do-not-use`，选择 OpenAI 地址。
- 保存配置后，在项目内填写研究需求、确认发送内容、生成拟议问卷，再确认应用。
- 编辑并保存后刷新；历史载入先进入编辑区，再保存为新版本。旧版本不会被覆盖。

`.local/p0-env.json` 由启动脚本自动创建并被 Git 忽略。不要把其中的认证材料、加密材料和会话当作部署模板。项目源备份不包含这些内容。

## 独立构建与验收

```powershell
npm run test:shared
npm run test:unit --workspace evi-x-zhengda-champion-platform
npm run typecheck:web
npm run build:web

$env:EVIX_TEST_DATABASE_URL = 'postgresql+psycopg://evix_owner:local-p0-owner-only@127.0.0.1:55432/evix_p0_test'
Push-Location apps/backend
.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider --basetemp ../../.local/pytest-p0-rerun-01
Pop-Location
```

后端测试以专用合成数据库创建隔离 schema，实际跑 Alembic、非 owner 应用角色、RLS 与不可变版本触发器。没有数据库时跳过的结果不算 PostgreSQL 验收。

本机 Windows 默认临时目录存在 pytest 清理权限问题，因此验收指定项目内全新的 `--basetemp`；重复执行时换一个未使用的末尾编号。不要指向已有业务数据目录。

前端 `test:unit` 保留原领域算法与契约回归。六组旧 D1/Office HTTP 套件保留为后续迁移参考，不混入本批运行环境；原 `tests/run-tests.mjs` 需要旧 Cloudflare 应用，不能指向新 FastAPI。浏览器验收与独立挑战证据记录在 `.collab/runs/20261007-p0`。

## 保留与迁移边界

迁移前 452 文件已打包，并逐条核对源 manifest：`.collab/runs/20261007-p0/baseline-source.zip` 和 `baseline-receipt.json`。旧的 32 个业务 route 文件保存在 `apps/frontend/legacy/cloudflare-api`，新应用不会回退到旧身份或旧数据库。

本批所有账户、项目、凭据、模型及問卷版本操作进入 FastAPI/PostgreSQL。为继续提供现有工作台，五个纯知识/规则/诊断路由暂留 Next：cases、case detail、rules、control-contract、diagnose；它们不访问用户身份、凭据或数据库。P2 再统一领域服务。

本地统计和成果编辑仍可使用。云端数据集、调查发布回收、原生 Office 服务和完整任务调度按 [迁移表](p0-migration-matrix.md) 继续接入。

## 报告格式与文件验证

“报告与 PPT”中的 Word 正文导出已绑定[安徽工程大学第十六届实践赛暨省赛选拔通知附件](https://jwc.ahpu.edu.cn/2026/0317/c8503a265448/page.psp)的公开排版参数。原附件及其 SHA-256 存入 `corpus-source/official-rules`，前端配置保存在 `lib/report-format.ts`。附件适用第十六届；第十七届或其他阶段使用前应重新绑定对应通知。

导出包括 A4、指定页边距、宋体/黑体字号、1.25 倍行距、半行段前距、原生标题和目录域。摘要、正文、参考文献按类别排序；明确命名的附录单独导出，旧“参考文献与附录”合并章节仍完整保留。首行缩进和页码是可调版式选项。图表与参考文献条目保留实际录入内容，最终页数、著录和匿名需要文件级检查。

已用安装的 Microsoft Word 更新目录、分页并渲染合成样例（正文 15 页、附录 1 页），全部页面完成视觉检查。更换内容或版式后，用 `scripts/render-p0-word.ps1` 生成新的 PDF，核对目录、页码和图表位置。此脚本只读打开指定 DOCX，不保存回源文件；本批没有验证 WPS 或 ONLYOFFICE 渲染。详细结果见 [本批验收记录](p0-acceptance.md)。

## 上线前需要的配置

P4 集中收集域名/HTTPS、阿里云 Linux 部署权限、真实发信服务 Key 与已验证发件域、受邀邮箱名单、PostgreSQL、私有 OSS、备份目标及告警接收方。ONLYOFFICE 独立服务及生产许可在 P3/P4 接入。

生产必须使用 `EVIX_MODE=production`、真实邮件和模型适配器、HTTPS 同源站点、独立迁移账户与非 owner 的应用数据库账户。认证密钥和凭据加密密钥分开生成；轮换前保留旧 key ID，否则历史加密凭据无法解密。模型由各用户自行配置 Key。运营方只批准兼容供应商地址，不替用户填写个人密钥。

应用不自动读取 `.env`；由进程/容器注入环境变量。完整字段见 API README 和 `deploy/api.env.example`。本批未调用真实发信/模型服务，也未部署公网。
