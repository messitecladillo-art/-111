# Office 原文件基础层（非完整编辑器）

此模块保留真正的 DOCX/PPTX 字节及不可变版本。另有[ONLYOFFICE 原生编辑适配层](onlyoffice-editor.md)，默认关闭，必须连接独立文档服务并完成真实编辑回合验收后才能称为可用；**尚未接入 Microsoft 网页版，也不承诺协同或编辑中自动入库。** 原有 `editor_drafts` JSON 文本草稿继续独立工作；两个模块不互相覆盖、不双向转换。

## 本机运行与数据位置

从应用目录执行 `npm run build`，再执行 `npm run dev:editor`。启动器先向本机 D1 应用迁移，随后在 `127.0.0.1:3001` 运行开发服务。D1 与 R2 本地模拟状态共同保存在 `.wrangler/editor-state/`（可用 `EVI_X_D1_PERSIST_PATH` 改变整个持久化目录）。这不是浏览器内存；**备份时必须同时备份此目录的 D1 和 R2，不能只备份数据库**。

`EVI_X_OFFICE_LOCAL_FILES=1` 仅在 Vite `serve` 模式注入本地模拟桶 `OFFICE_FILES`。启动器默认为 1；设置为 0 可禁用。生产构建不会添加这个桶，不会创建远程资源。没有明确配置的 `DB` 和 `OFFICE_FILES` 时返回 503，不退回内存、不声称已保存。本轮未改 `.openai/hosting.json`，未部署外部对象存储。

本地匿名会话沿用 HttpOnly/SameSite=Strict Cookie（30 天）。可提前在“身份与恢复”登记并自行保存恢复密钥，以便 Cookie 丢失后恢复同一文件库，详见 [身份恢复说明](editor-recovery.md)。**未提前保存密钥且 Cookie 丢失时仍无法找回；密钥不是文件备份。请始终保留本地原件/下载备份。** 这仍是本机验证版，不是完整账号系统，不适合直接开放为多人生产服务。

## API 与文件权威

所有接口在 `/api/drafts/files` 下，沿用 `/api/drafts` 会话路径；新增保存要求正确的 `x-editor-scope` 和同源请求。

- `GET /api/drafts/files`：当前身份的文件摘要、作用域与容量。
- `POST /api/drafts/files`：原始二进制 body；`application/octet-stream`；UUID `x-office-file-id` / `x-office-version-id`；URI 编码的 `x-office-name` / `x-office-label`。
- `GET /api/drafts/files/:id`：当前版本摘要和完整版本目录（最多 20）。
- `POST /api/drafts/files/:id`：增加不可变版本；还需 `x-office-base-revision`；同一文件类型不可改变。
- `GET /api/drafts/files/:id/versions/:versionId`：鉴权后下载该版本字节，下载前重新计算 SHA-256，固定 attachment 与 no-store。

浏览器先选文件、填写版本说明，再主动上传；选择本身不上传。服务端验证成功、对象写入成功且事务确认后才报告保存。旧版本不可修改，不提供覆盖或删除 API。恢复旧稿的当前操作是下载旧版本，在本机 Office 修改后上传为新版本或新文件。

幂等由身份、文件 ID、版本 ID、原基准版本、文件名、说明、大小与 SHA-256 共同约束。精确重试返回原保存版本，同时返回最新文件摘要；不同内容不能复用操作 ID。新版本以条件 INSERT 与同一对象键约束的 head 更新组成 D1 事务。并发只有一个基准版本的后继获胜，失败方不覆盖赢家。

## 容量、检查与异常恢复

- 每文件 20 MiB、每身份 20 个文件、每文件 20 个版本。
- ZIP 最多 4096 条目、声明/实际总解压预算 128 MiB、单项 32 MiB、控制 XML 2 MiB；具体支持范围以 `office-package.ts` 与测试为准。
- 校验 ZIP 目录/CRC、包类型、XML 与常见活动内容风险。**结构筛查不是病毒扫描，不是对任意 Office 文件的安全或渲染兼容性认证。** 不联网读取文档关系，不提取内容到文件系统，不执行文档内脚本。部分合法但当前不支持的文件会被拒绝，原件不改变。
- R2 每次尝试使用不同随机键；对象先保存，元数据后提交。D1/R2 并非跨系统原子事务。若提交结果不确定，保留该对象与 pending 记录并返回 503，避免误删已提交文件。
- 每身份最多 4 个 pending 尝试与 1024 条尝试记录；预留名额由原子 SQL 控制，防止无限失败对象积累。确定未被提交引用的本次对象才允许清理；清理失败继续占用 pending 名额。
- 维护者核对 `office_upload_attempts`、`office_file_versions.object_key` 与桶实际对象后才能对账。重试已提交操作会把其 reservation 标为 committed。**尚无自动垃圾回收或用户侧对账界面；不得仅凭超时删除 pending 对象。**

## 真实原生编辑验收前仍需完成

1. 用户已选择 ONLYOFFICE；仍须确认适用许可、部署范围和服务资源。适配层有签名取件/回调，不向服务提供当前用户 Cookie 或恢复密钥。
2. 部署实际文档服务与受限双向网络，核验签名、限源回调、时限/容量、会话版本、幂等与乱序防护。服务不可用时仍以原文件下载为退路。
3. 保存后的 OOXML 为权威；旧 JSON 草稿只另存导出，不能覆盖二进制文件。
4. 真文件打开→文本/图片/表格/图表/分页或母版编辑→关闭等待回调→重开→下载→本机 Office 对照；再验证断线重启、冲突和越权。未做这些不能写“原生编辑已完成”。
5. 生产级账号、组织权限、容量/速率限制、备份恢复、恶意文件处理与可观察性仍需独立交付。

## 验证与依据

`npm run test:office` 检查包结构；`npm test` 包含隔离 D1/R2 的 HTTP、所有者隔离、精确字节下载、并发/重试/容量、旧功能回归和重启持久化。独立故障注入、界面状态测试与实际浏览器观察单独记录在仓库 `.collab/runs/20260927-office-files/`，不把模拟 Hook 测试当成浏览器实测。

实现参考：Cloudflare [D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/) 与 [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)，核验日期 2026-09-27。
