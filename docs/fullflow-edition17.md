# 证见：调查回收到成果与答辩

本指南记录本轮新增的桌面端闭环，补充 [P0 运行指南](p0-running.md)。原指南中“调查发布回收、结构化成果尚未迁移”的范围以本文为准；原生 Office 服务仍在后续批次。

## 使用流程

1. 在 `/projects` 登录并进入项目，编辑问卷，取得“保存新版本”的服务器回执。
2. 进入“发布与回收”，发布该已保存版本。发布快照固定题目、选项、跳题和变量；后续编辑草稿不会改动已发出的问卷。
3. 分享 `/s/{token}`。填答者无需登录，支持单选、多选、量表、数值和文本题。前项改选会清除随之隐藏的答案，必答校验仅针对当前显示的题目。
4. 返回项目刷新回收数量，下载 CSV 或送入“数据分析”。分析使用该发布版本的变量映射；当前编辑中的其他问卷不能直接替换它。完整 CSV 保留答卷标识、提交时间及每题显示状态。
5. 在分析中完成变量与有效应答范围核对，运行支持的统计模块。可发送的有效结果先形成报告提案，预览并确认后追加到“报告与 PPT”，再保存成果版本。
6. 继续编辑报告和幻灯片，下载 Word/PPT；历史载入后保存会新增版本。答辩页读取已保存的报告版本，查阅章节依据、幻灯片和讲稿，并保留来源定位。练习笔记通过下载与导入保存恢复。

问卷、报告与 PPT 的云端保存各自以服务器回执为准。项目内已打开的编辑面板切换标签时保留挂载状态；刷新前应保存成果或下载练习笔记。分析运行状态和答辩笔记尚不是云端任务记录。

## 版本、权限与数据口径

- 发布与报告保存限项目负责人、编辑成员操作；查看者可读取所属项目的已保存内容。后端同时执行项目归属检查和 PostgreSQL RLS。
- 发布请求绑定当前问卷修订号。同一已保存问卷版本重复发布返回原发布记录；关闭后不能直接重开，需保存新问卷版本再发布。
- 发布、关闭、成果保存和答卷提交均使用幂等标识。报告保存带预期修订号，版本冲突不会覆盖云端新内容。
- 公共填答页仅取得填答所需字段，不返回项目内部研究映射、成员或模型配置。提交回执未明时保留原请求标识与原答案；浏览器允许会话存储时，刷新后可核对该原请求。普通未提交草稿仍只在页面内存中，当前没有离线后台发送队列。
- 回收 CSV 的空值保留为空；`__shown_{题目ID}` 区分隐藏题与已显示题。多选答案按问卷选项顺序用分号连接，当前不自动扩展为独热列。文本、多选列也不会自动改写成数值参与统计。
- 分析使用原始 `csv`；下载使用单独的 `downloadCsv`，对可能被表格软件作为公式执行的文本加转义。数字负值保持数值。数据快照 SHA-256 绑定发布版本、分类、列和原始行，与下载文件字节哈希不同。
- `local_test` 回收标记为 `synthetic`；生产填答标记为 `actual`。后者表示来自填答提交，样本质量与代表性仍由调查设计和分析判断。硅基样本保持模拟分类。
- 报告章节依据保留统计输入与口径。答辩引用绑定项目、报告版本及内容哈希，PPT 同步状态反映关联章节是否改变；没有自动把未保存编辑当作已保存依据。

## API 清单

所有项目接口使用既有会话认证；写入接口沿用同源与 CSRF 校验。公共提交独立校验允许的来源及发布令牌，不借用登录用户的项目权限。

| 方法与路径 | 行为 / 请求要点 |
| --- | --- |
| `GET /api/projects/{projectId}/surveys` | 项目发布记录、状态、回收量和容量 |
| `POST /api/projects/{projectId}/surveys` | `expectedQuestionnaireRevision`、`idempotencyKey`；冻结已保存问卷 |
| `POST /api/projects/{projectId}/surveys/{releaseId}/close` | `expectedRevision`、`idempotencyKey`；结束新答卷回收 |
| `GET /api/projects/{projectId}/surveys/{releaseId}/dataset` | 冻结设计、原始 CSV、下载 CSV、数据快照哈希 |
| `GET /api/surveys/{token}` | 公共填答所需的标题、说明、题目与发布状态 |
| `POST /api/surveys/{token}/responses` | `idempotencyKey`、以稳定题目 ID 为键的 `answers`；返回答卷回执 |
| `GET /api/projects/{projectId}/report` | 最新成果，未保存时为 `report: null`；答辩页也读取此接口 |
| `GET /api/projects/{projectId}/report/versions?beforeRevision=n` | 每页最多 30 条版本摘要及后续游标 |
| `GET /api/projects/{projectId}/report/versions/{versionId}` | 精确版本的完整内容 |
| `POST /api/projects/{projectId}/report/versions` | `content`、`expectedRevision`、`idempotencyKey`；追加不可变版本 |

报告版本保存一个结构化 `EditorContent`，包含报告、幻灯片和可选 `reportFormat`。这里保存的是编辑内容与设置，尚不保存协同编辑后的原生 Word/PPT 文件。相同答卷请求重试取得同一回执，即使调查后来关闭；同一标识换用其他答案会返回冲突。

## 当前容量

这些是实现中的内测边界，不是赛事规则。所有超限都应显示明确错误，不能静默抽样或删列。

| 对象 | 上限 |
| --- | --- |
| 每项目发布记录 | 50 个 |
| 单份问卷 | 80 题；每题最多 30 个选项；量表 2–15 个点 |
| 每个发布版本 | 5,000 份答卷，且规范化答案累计不超过 2 MiB（2,097,152 字节） |
| 单次答卷提交 | 请求体、规范化答案各不超过 64 KiB（65,536 字节） |
| 数据集 API 响应 | 16 MiB（16,777,216 字节） |
| 浏览器分析输入 | 2,000,000 字节、5,000 行、80 列、200,000 个单元格；单元格最多 2,000 字符 |
| 信度量表输入 | 最多 30 个量表项 |
| 单个报告版本 | 报告最多 40 章、PPT 最多 40 页；规范化内容 500,000 字节，保存请求体 600,000 字节 |
| 报告正文与来源 | 每章正文 12,000、来源 1,500 个 UTF-16 单元 |
| PPT 文本 | 每页正文、侧栏各 1,800，讲稿 6,000 个 UTF-16 单元 |

完整导出中包含元数据和显示状态列，进入分析时只投影原题变量。若原题数据仍超出分析容量，可保留完整 CSV 下载；当前没有自动拆批分析。提交计数与累计容量在数据库事务内检查，避免并发请求越过限额。

## 第十七届格式范围

当前已确认届次为**第十七届**；组别、赛区、赛道、阶段尚未确认。默认“研究文档标准排版”与赛事规则状态分开保存；不能把第十六届的页数或匿名要求自动应用于第十七届。

2026-10-11 的来源核验记录在 [官方来源记录](../corpus-source/official-rules/edition17-format-review-20261011.json)，它是来源复核记录，不是已绑定全部项目范围的规则快照：

- [全国第十七届总通知](http://www.china-cssc.org/show-304-2179-1.html)，中商统〔2026〕33号；[高校留存 PDF](https://stxy.btbu.edu.cn/docs/2026-10/1fcc2b9eccae40efad4f6e4903db2e3e.pdf) 与[本地原件](../corpus-source/official-rules/edition17-main-notice-20260921.pdf)。通知第 3 页安排实践赛文件与企业命题于 2026 年 11 月 17 日发布；第 5 页说明全国初赛评审报告和 PPT、决赛现场答辩。此次核验的总通知及通知列表，尚不足以确定本项目适用的完整排版细则。
- [北京工商大学校赛通知](https://stxy.btbu.edu.cn/tzgg/40e1699e94774c69b98ea3a94f2112a2.htm)及[附件 3：报告格式和封面参考](https://stxy.btbu.edu.cn/docs/2026-10/192853f81570400ab71938667499349a.doc)。这是衔接全国第十七届的**该校第十六届立丰杯校赛**，产品提供可选校级参考，不能作为全国统一格式规则。

校级参考包含 A4、上下 25.4 mm / 左右 31.8 mm 页边距、正文宋体 12 pt、1.25 倍行距等参数。旧第十六届参考也继续保留并明确届次。全国第十七届的适用报告页数、PPT 格式、具体匿名和 AI 使用细则，需要在确认组别等范围后绑定对应正式文件。

三线表首线 1.5 pt、表头线 0.75 pt、末线 1.5 pt，以及各列内容居中，是本项目已确定的用户排版要求，不标记为已证实的全国第十七届条款。导出后仍需用 Word 等目标阅读器检查分页、目录与图表位置。

## 本地运行

使用 Node.js 22.13+、Python 3.12、uv、PostgreSQL 17 和 PowerShell 7（`pwsh`）。以下均从仓库根目录运行；脚本放在子进程中执行，避免其切换目录影响后续命令。

```powershell
npm ci --ignore-scripts --no-audit --no-fund
uv sync --locked --project apps/evi-x-api --python 3.12
docker compose -f deploy/compose.dev.yaml up -d
pwsh -NoProfile -File .\scripts\migrate-p0.ps1
```

迁移目标为 **`0004_project_reports`**：`0003_survey_collection` 新增调查发布与答卷，`0004_project_reports` 新增不可变成果版本。API 启动检查要求数据库版本匹配，并使用非 owner、非 BYPASSRLS 的应用账户。

```powershell
# 终端 1：API，127.0.0.1:8180
pwsh -NoProfile -File .\scripts\start-p0-api.ps1
# 终端 2：网页，127.0.0.1:3180
npm run dev:web
```

Docker 不可用时可用 `apps/evi-x-api/.venv/Scripts/python.exe scripts/setup-local-postgres.py` 准备原生 PostgreSQL，再运行 `pwsh -NoProfile -File .\scripts\start-p0-postgres.ps1`。两种方式二选一，不能同时占用 55432。

本地脚本创建被 Git 忽略的 `.local/p0-env.json`。体验账户与验证码读取方式见 [P0 运行指南](p0-running.md#本地体验账户)，不要把该文件作为公开部署配置。生产环境由进程或容器注入配置，应用不自动读取 `.env`。

正式构建前停止共用 `.next` 的开发服务。API 地址变更后须重新构建：

```powershell
$env:EVIX_API_ORIGIN = 'http://127.0.0.1:8180'
npm run build:web
npm run start --workspace evi-x-zhengda-champion-platform
```

## 升级与恢复

1. 停止写入，记录当前应用版本与数据库迁移版本。对结果不明的付费调用保留待核对状态，不用重放调用来替代恢复。
2. 使用获授权的备份账户执行 PostgreSQL 完整备份，例如 `pg_dump` 的 custom 格式；把恢复需要的角色、认证及加密 key ID 资料分别保存到受控位置。凭据通过受控环境注入，不放进文档、命令历史或 Git。
3. 在独立空数据库实际恢复备份，核对项目归属、版本数量、答卷和权限。`pg_restore --list` 只能检查目录，不等于完成恢复验证。
4. 运行上面的迁移命令升级到 `0004_project_reports`，重启 API 和前端，再用独立验收项目检查发布、提交、历史读取及权限。保留迁移前备份。
5. 需要回退时恢复已验证的数据库备份，并配套原应用版本。本轮迁移禁止破坏性 downgrade；不要手删新表或改写不可变版本。轮换凭据加密密钥时保留旧 key ID，确保历史凭据仍可解密。

## 验证与交付记录

前端检查命令如下；执行构建时与开发服务分开：

```powershell
npm run test:shared
npm run test:unit --workspace evi-x-zhengda-champion-platform
npm run lint --workspace evi-x-zhengda-champion-platform
npm run typecheck:web
npm run build:web
```

后端测试需要单独配置 `EVIX_TEST_DATABASE_URL`，指向可创建隔离 schema 的合成测试数据库。不要使用真实业务数据库。每次为 `--basetemp` 选择新的目录：

```powershell
Push-Location apps/evi-x-api
try {
  .venv/Scripts/python.exe -m pytest -q -p no:cacheprovider --basetemp ../../.local/pytest-fullflow-01
} finally {
  Pop-Location
}
```

重点回归见 `test_surveys.py`、`test_surveys_postgres.py`、`test_reports.py`，以及前端 `survey-collection.test.mjs`、`project-report.test.mjs`、`project-defense.test.mjs` 和格式范围测试。数据库测试被跳过不能算通过 PostgreSQL 验收；保留的旧 Cloudflare/Office HTTP 套件也不能替代新 API 测试。

本次集成的最终验证记录由交付负责人补充，不沿用旧批次结果：

| 验收项 | 本次结果 |
| --- | --- |
| lint、类型检查、领域单测与生产构建 | 待填写执行命令、结果及代码版本 |
| PostgreSQL 迁移、跨团队访问、撤权、并发与幂等 | 待填写实际数据库测试结果 |
| 桌面浏览器：保存 → 发布 → 匿名填答 → 回收分析 → 报告保存 → 答辩引用 | 待填写完整路径与结果 |
| 保存冲突、晚到读取、刷新核对、关闭后原请求重试 | 待填写故障场景结果 |
| 本轮 Word/PPT 导出的打开、分页及内容核对 | 待填写文件级检查结果 |

## 后续范围

完整任务队列与检查点恢复、云端版本化清洗和跨批数据集管理、答卷撤回/删除接口、原生 Office 文件持久化与 ONLYOFFICE 协作仍未接入本闭环。关闭调查只停止新增答卷，不删除既有答卷。

公网部署还需完成域名与 HTTPS、真实邮件和模型联通、私有文件存储、监控告警、备份恢复演练与负载测试。合成适配器的本地验收不等于这些生产依赖已通过。本批按桌面端验收；移动端适配保留后续处理。
