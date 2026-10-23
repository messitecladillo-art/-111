# 知识镜业务接口

知识词条是概念与方法依据，不属于项目实证结果；本模块不更新赛事控制状态或 Gate。原有问卷、报告及团队权限接口保持独立。

## 接入

在 `create_app` 定义身份与项目辅助函数之后调用：

```python
from .knowledge import register_knowledge
register_knowledge(app, settings, db, session_user, owned_project, lock_user, operation)
```

迁移头更新为 `0005_knowledge`。七张新表使用 PostgreSQL RLS；用户私有数据只能由对应账户访问，项目词条引用由现有团队成员权限控制。所有修改沿用本站 Origin、会话及 CSRF 校验。

发布时生成 `multi_agent/agents/research_agent/knowledge-catalog.json`，结构为 `{schemaVersion:1,entries:[{id,version,review}]}`。词条版本是正整数。仅 `review.status=reviewed`、作者与审阅者不同、含审阅日期的词条进入可引用目录。目录应同时保留已发布的历史版本。无目录时不能创建未知引用；目录不携带教材全文。

## 个人与项目状态

- `GET /api/me/knowledge-state` → `{revision,favorites,recent,preferences}`。首次读取 revision 为 0。
- `PUT /api/me/knowledge-state` 请求 `{expectedRevision,idempotencyKey,state:{favorites,recent,preferences}}`。收藏最多 500 项，最近访问最多 50 项；每项为 `{entryId,entryVersion}`。修订冲突返回 409，同一操作标识重放返回原回执。
- `preferences` 允许 `mode`（`float`/`pinned`）、归一化位置 `x/y`（0–1）、`width/height`、`query`、`scrollEntryId`、`scrollTop`。查询与阅读位置是账户私有偏好，不作为使用事件日志。
- `GET /api/projects/{projectId}/knowledge-references` → `{revision,references:[{id,entryId,entryVersion,createdAt,createdBy}]}`。owner/editor/reviewer/viewer 均可读取自己团队的项目。
- `POST` 相同路径请求 `{expectedRevision,idempotencyKey,entryId,entryVersion}`，仅 owner/editor 可添加。
- `DELETE /api/projects/{projectId}/knowledge-references/{id}` 请求 `{expectedRevision,idempotencyKey}`，仅 owner/editor 可移除。移除保留精确版本记录，不删除原词条；重新添加恢复原引用 ID。
- `POST /api/knowledge/term-requests` 请求 `{idempotencyKey,term,domain,note}` → `{id,status,createdAt}`。每天每账户最多五次，重放不重复计数；note 最多 500 字符。

## 显式联网查证

运营者设置 `EVIX_KNOWLEDGE_TAVILY_API_KEY`。该密钥只读取于生产模式，`repr`、回执及错误均不含密钥。本地测试只能通过显式注入的合成 Provider 运行，不读取真实环境密钥。

- `POST /api/knowledge/lookups` 请求仅含 `{query,idempotencyKey}`，返回 202 及完整回执。query 是用户确认的单行短检索词，最多 120 UTF-16 单元；未知字段、多行及控制字符均拒绝。
- `GET /api/knowledge/lookups/{id}` 只能由发起账户读取，不会重发调用。
- 回执为 `{id,status,query,createdAt,finishedAt,results,credits,errorCode,providerRequestId}`。status 为 `running/ready/failed/outcome_unknown`；credits 不明时是 null，绝不以 0 代替。
- `results` 只含最多五条 `{url,title,snippet}`；仅 http/https 链接，文本移除标记并限制长度。它们是未审校的外部资料，不能自动加入固定词库。

服务使用固定 Tavily 地址、basic 搜索、最多五条、关闭自动参数/答案/原始页面，并要求 usage。统计、机器学习、空间、哲学、数学、计算机与调查关键词使用固定权威资料域名；无法归类的生僻词保持普通基础检索。无跳转、无环境代理、15 秒超时、响应解压后最多 128KB。页面全文、答卷、OCR 图像和运营密钥都不会作为查询字段外发。

账户每日最多 20 次，网站每月最多预留 1,000 credits，日期按 UTC。预留与操作回执同事务提交后才发出请求；月总账与个人日总账通过行锁串行结算。结果未知保留预留，429/已知请求拒绝释放月预留，日次数仍计入请求。重复幂等标识不二次调用；同标识不同载荷返回 409。

缺失或异常 usage、网络中断、超时、5xx 和取消都保留 `outcome_unknown`。失去进程的 `running` 回执超过超时加 30 秒后在再次读取时转为未知，预留仍保留。已知返回费用超出 basic 预留时记录实际费用并封锁该月后续调用。这里不能替代供应商账户的禁止付费超额设置：运营者须在真实验收时核对账户额度与账单，再配置 Key。无 Key 时仅联网接口返回明确未配置，自有搜索不受影响。

## 验证边界

纯函数与 MockTransport 测试覆盖中文/Unicode、私有偏好校验、精确版本、独立审阅目录、短查询外发、HTML/URL 清理、usage 未知和供应商错误分类。

PostgreSQL 集成测试使用现有临时 schema 和非特权应用角色，验证 CAS、重放、CSRF、跨账户/团队、viewer 与撤权、日/月预算、重复并发、进程中断恢复和补词限额。未配置真实 PostgreSQL 的本地环境会明确跳过这些测试，不用 SQLite 代替。

真实 Tavily 连通与计费需要运营 Key，在此之前所有 Provider 测试均为合成回执，不代表已完成线上验收。

2026-10-14 的本机定向验证：新建隔离环境运行 `pytest tests/test_knowledge.py tests/test_knowledge_postgres.py -q`，26 项通过，9 项因未设置实际 PostgreSQL 测试地址而跳过；另有现有 Starlette/TestClient 的 httpx 弃用提示。真实 PostgreSQL 的迁移、RLS 和预算并发仍须通过 CI 或配置后的数据库验收。
