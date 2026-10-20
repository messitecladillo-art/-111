# ONLYOFFICE 原生编辑接入（部署闸门）

系统现有的结构化报告/PPT 草稿不是 Office 编辑器。这个适配层为真实 DOCX/PPTX 原文件提供独立的 ONLYOFFICE Docs 打开、关闭后保存回调及不可变版本接入；**缺少文档服务与安全配置时默认关闭**，原有上传、下载、版本和 JSON 草稿照常使用。页面显示“接口已配置”只代表配置齐全，不代表 Document Server 运行或保存成功。

## 工作方式与首版范围

1. 用户在原文件库选定**当前版本**，主动点击“使用 ONLYOFFICE 编辑”。系统核验当前浏览器身份、文件归属和版本后，在 D1 建立有限期编辑会话。文档内容仍由现有 D1/R2 文件库持有。
2. 服务端签发 ONLYOFFICE 配置；浏览器在与应用、Docs 均不同源的隔离页面内加载文档服务 UI。文档服务读取指定原版本时，使用自身的短期签名请求，不接触用户 Cookie、恢复密钥或通用文件下载接口。
3. 首版以编辑窗口关闭后的 `status=2` 回调为新版本提交点。服务端验证签名、会话、文件与基准版本，限源下载、限时限量并重新检查 OOXML，再按原文件库的 CAS 规则写入不可变版本。`status=4` 代表无修改关闭；首版**不承诺 force-save、协同或编辑中实时入库**。
4. 页面只在查询到服务器已确认的新版本后显示“已保存”。超时、冲突、回调失败或服务不可用均不当作成功；旧版本不会覆盖。若编辑回调与另一版本竞争失败，服务端必须先保存并校验一个归属原用户的限期冲突副本，再显示可下载的冲突状态；文件库提供刷新后找回入口。按用户选择，冲突副本保留 **7 天**，到期前 48 小时在文件库醒目提示，逾期不再下载，并在后续受限清理时移除对应副本对象；正式文件版本不受影响。冲突副本不是正式版本，需下载核对并人工合并。当前提醒是**打开本系统时的站内提示**，并非邮件/系统推送。JSON 草稿与原生文件不自动互转。

此处不是正大杯官方提交入口。结构检查不是病毒扫描或渲染兼容认证；提交前仍应在本机 Word/PowerPoint 核对排版、公式、图表与匿名要求。

## 本机环境与部署前置

ONLYOFFICE Docs 是**独立服务**，不是本应用的 npm 依赖。至少需要完成官方资源、许可和网络检查，再从官方来源部署。2026-09-27 本机只检测到 Docker Desktop 已安装但服务未运行，C 盘约 29.18 GB 可用，低于 [官方 Docker Community 的 40 GB 可用空间基线](https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker.aspx)；WSL 后端、内存和 swap 未确认。因而当前不能声称真实文档编辑回合已通过，也没有为了演示删除用户文件或擅自对外上传原稿。

部署至少要确保：

- 浏览器能访问 ONLYOFFICE `.../web-apps/apps/api/documents/api.js`；文档服务能访问本应用的专用取件和回调地址；本应用能从**固定的文档服务下载源**读取回调产物。`127.0.0.1` 在 Docker 容器里指容器自身，不能直接当作宿主机地址。不要为打通连接直接向整个局域网开放未加保护的开发服务。
- 文档服务浏览器端与服务出站请求均启用 JWT；三个方向使用与本应用一致的高强度服务端密钥，并明确出站 `Authorization: Bearer` 模式。密钥只作为服务端秘密配置，不进客户端 bundle、源码库或日志。[签名与请求模式](https://api.onlyoffice.com/docs/docs-api/additional-api/signature/)、[服务配置](https://api.onlyoffice.com/docs/docs-api/get-started/configuration/server-config/)。
- D1、Office R2 桶和迁移正确配置，必须一起备份。生产没有配置文件桶时不得自动退回内存或伪报保存成功。
- 明确 Community Edition 的并发、保留品牌与 AGPL 使用条件；超过许可范围或需闭源白标时评估商业版。[ONLYOFFICE 社区版 FAQ](https://helpcenter.onlyoffice.com/zh/docs/faq/docs-community.aspx)。

开发环境的 Worker 只在 `vite serve` 时读取以下 `EVI_X_ONLYOFFICE_*` 变量；缺少任一必要值则 `/api/drafts/native/status` 报未配置。浏览器应用与文档服务可见的应用地址不同时，必须分别提供 `BROWSER_APP_ORIGIN` 和 `APP_ORIGIN`；生产应全链路 HTTPS。`LOCAL_DEV=1` 仅供隔离网络和**合成文件**测试，不应作为生产绕过私网阻断的办法。编辑页必须位于第三个独立来源，否则带有 `allow-same-origin` 的 iframe 会把应用权限交给文档服务；去掉它又会破坏 ONLYOFFICE API 的消息来源校验。仅分端口也不安全：[RFC 6265 明确 Cookie 不按端口隔离](https://datatracker.ietf.org/doc/html/rfc6265#section-8.5)，所以浏览器应用、Docs 和隔离页必须使用**三个不同主机名**。内置 `npm run dev:native-shell` 只监听 `127.0.0.2:3002`，仅供本机合成测试；例如应用 `127.0.0.1`、Docs `localhost`、隔离页 `127.0.0.2`。生产须以独立 HTTPS 主机提供等价页面并单独做安全审查。

| 环境变量 | 用途 |
| --- | --- |
| `EVI_X_ONLYOFFICE_BROWSER_ORIGIN` | 浏览器可访问的 ONLYOFFICE Docs 源。 |
| `EVI_X_ONLYOFFICE_DOWNLOAD_ORIGIN` | 本应用读取回调产物时允许的唯一 Docs 下载源。 |
| `EVI_X_ONLYOFFICE_APP_ORIGIN` | Docs 能访问的本应用取件/回调源。 |
| `EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN` | 用户浏览器访问本应用的源；未设置时与 `APP_ORIGIN` 相同。 |
| `EVI_X_ONLYOFFICE_SHELL_ORIGIN` | 浏览器可访问的隔离编辑页来源，必须与应用、Docs 均不同源。 |
| `EVI_X_ONLYOFFICE_JWT_SECRET` | 与 Docs 配置一致的服务端 HMAC 密钥，至少 32 字节。 |
| `EVI_X_ONLYOFFICE_LOCAL_DEV` | 仅隔离本机合成测试允许的开发拓扑开关。 |

只把上述变量设好仍**不等于可用**：需要真实 Docs 实例、受限双向网络、实际浏览器加载、回调以及 DOCX/PPTX 保存重开验证。不要把公开 demo Docs 或未经批准的云实例用于真实参赛材料。

## 验收门槛

- 合成 DOCX 与 PPTX 分别完成上传 → ONLYOFFICE 内修改正文/表格/图片或母版 → 关闭 → `status=2` 回调 → 列表出现唯一新版本 → 重新打开 → 下载并用本机 Office 核对。
- 篡改/过期 JWT、跨 owner、错文件/错版本、任意回调 URL、302 重定向、超 20 MiB/伪装 ZIP、重复回调、并发版本冲突、Cookie 丢失恢复及重启后旧 key 均不能越权、覆盖或伪报成功；并发冲突的编辑后字节必须能由原 owner 在有效期内独立找回，不能只保留原件而丢弃本次改动。
- 编辑服务断线和浏览器关闭时，已确认旧版本保持可下载；未确认的编辑内容必须明确提示风险，不宣称自动恢复。
- 合规与上线还需账号/权限、速率限制、恶意文件处理、备份演练、监控和独立安全评审。

官方协议依据：[DocEditor 初始化](https://api.onlyoffice.com/docs/docs-api/usage-api/doceditor/)、[回调状态与响应](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/)、[document.key 生命周期](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/co-editing/)。
