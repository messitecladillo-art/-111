# 知识镜合并前独立审阅

- 协议：agent-collab/v1；nonce：knowledge-final-review-20261015。
- 协调者 / 接收者：root；独立审阅者：knowledge_api。
- 输入：e10cf12 与当前 C/D 未提交文件；本审阅者不是 publication、知识路由、Provider 或 D 同步控制器的生产者。
- 租约：15 分钟；无子代理、网络、浏览器、Git、Key/env 或功能修改；唯一写边界为本审阅记录。
- 范围：publication.ts、publish-knowledge.mjs、knowledge-data 路由、release manifest / public catalog / API catalog，及 HostedSession、KnowledgeProvider、useKnowledgeAccount、KnowledgeProjectReferences、KnowledgeLookupPanel、account-sync 和相关回归测试。

## 审阅发现及状态

### P1：跨发布版本不可变与历史保留（已关闭）

原组装器只比较同一轮输入包内部的重复 id@version；发布脚本未加载既有 published.json。下一轮如果重新核准并更新源包哈希，可以改写同一个已公开版本；若仅纳入新版本，原版本也会消失。现有 immutable HTTP 缓存与精确历史引用因此可能不一致。

生产者已改为在组装前读入并校验 previous publication，旧版本先登记，新包同 id@version 内容不同就拒绝，旧版本和不再出现在新 manifest 中的概念继续保留。非法历史 JSON 不会被当成空历史。新增跨独立 release 的改写、只发布 v2 和重复归档检查。独立静态复核与更新后的实际测试通过。

### P2：精确版本路由校验与契约范围（已关闭）

原 route 仅接受连字符 ID 和最多九位版本，而公共契约允许点/下划线 ID 与正整数至 2147483647。生产者已经复用 isKnowledgeId，并使用相同版本上限，保留 canonical 无前导零规则。当前目录均为合法连字符 ID / v1，不存在已运行页面被此项改动破坏的证据。

### P2：同账户重新进入的旧代缓存（已关闭）

accountBoundRecoveryStorage 最初只比较当前账户 ID。若 A→B→A 在旧 Fragment 被清理前发生，旧 A 控制器的 dispose/persist 又看到当前账户 A，可以重新创建登出时已清除的恢复草稿。现有测试只覆盖 A→B，未覆盖返回 A 的新身份代。

使用实际 helper 的只读复现返回 oldGenerationWroteAgain=true，exit 0。该问题是同账户的旧草稿恢复，不是跨账户内容泄露；仍违反登出/账户切换清理语义。生产者已在账户变化时同步递增 identityGeneration，storage adapter 捕获账户和 generation，阻止旧代 get/set/remove；mutate 在回执到达时也核对同一 generation。独立复读生产代码并运行使用实际 HostedSession callbacks、实际 storage adapter 的三项新增回归：A→B→A 旧读取、写入、删除与清理全部失效，同账户 refresh 保留未对账 nonce 且不自动重发，同假 CSRF 的旧 HTTP 回执也被阻挡。联合 23/23 通过。

## 已确认的界限

- 发布组装拒绝 draft、生产者与审阅者相同的伪审核和非法条目；manifest 的源包哈希检查与生成结果检查实际通过。
- 当前 public 与 API catalog 完全一致：release 2026-10-15.1、60 条 reviewed 精确版本；没有将未纳入 manifest 的内容包直接发布。
- 旧版本读取验证 ID、整数版本、reviewed 与结构，并拒绝重复 JSON 成员、超大返回与不一致载荷；旧定义没有用最新文字替换。
- 项目引用按 project ID、账户、epoch 与精确内容版本保护；POST/DELETE 携带 expectedRevision 和独立幂等键，回执匹配后才显示成功。未知操作保留原意图，人工核对复用原键；撤权后清除私有结果。
- 用户选区识别进入浏览器内检索，changeQuery(text,false)不默认写入偏好。OCR候选仅把用户选择的词条ID交给知识层。联网由确认按钮提交可编辑120字单行查询，没有从 OCR 识别到外部检索的自动请求路径。
- 联网回执的 title/snippet 与页面解释由 React 文本节点呈现；URL只允许http/https并排除用户名密码；KaTeX使用trust=false。来源网页不会作为HTML执行。
- 账号身份变化清空旧账户的三种专用缓存，旧结果受到身份和请求代保护；普通 A→B 与 A→B→A 跨代流程均通过实际回归，不以账户 ID 相等作为旧 callback 重新有效的条件。

## 实际命令与退出码

工作目录为 apps/evi-x-platform：

- node --experimental-strip-types --test tests/knowledge-publication.test.mjs tests/knowledge-account.test.mjs tests/knowledge-project-references.test.mjs：20/20，通过，exit 0；receipt a0b988。
- npm run knowledge:check：60 concepts / 60 exact versions，check模式，无生成写入，exit 0；receipt a8290b。
- 独立核对 release manifest SHA、公用目录与 API 目录完全对应：exit 0，reviewedOnly=true，apiExactVersionMatch=true，manifestHashesMatch=true。
- npm run lint：exit 0；receipt724d2b。
- npm run typecheck 初次因管理工作树 tsbuildinfo 写权限失败（EPERM，exit 1），未将它记成通过。改用 npm run typecheck -- --incremental false 后 exit 0；receipt3ef551。
- 不运行 --write 发布、真实网络、浏览器或后台权限测试。本记录没有替代 root 的 C/D 实际联通与桌面验收。

当前判定：publication 和 D 同步逻辑通过本次独立静态审阅与实际回归；已发现的 P1/P2 均已关闭。此判定不替代 root 的桌面和服务端联通验收。未擅自改动任何生产代码。

## 最终冻结修复后的独立复验

- publication/account/project-references/generation 四组实际测试：23/23，exit 0；receipt 2adeec。
- npm run typecheck -- --incremental false：exit 0；receipt bc1682。
- npm run lint：exit 0；receipt 6bfc31。
- npm run knowledge:check：release 2026-10-15.1，60 concepts / 60 exact versions，exit 0；receipt 0fdb9e。
- 最终生产文件 SHA-256：publication.ts = 3c7b8236f340aed7c61c9af925eac1de8e6c69a1a3a33ac2740ac6aa456d5f2c；HostedSession.tsx = e4d7e86bc42255c09de197462ddaa7691b1d1e595f8cf83859a97baea58c2324；useKnowledgeAccount.ts = 72381dde4439580460274c951205fbdb026225b5494e2a7c2f59d950f1fab795；KnowledgeProvider.tsx = 7ace3f2cad5e527dbae97bb87c89731be34de8221035547afde260cb08490cac；KnowledgeProjectReferences.tsx = aa7accdf62388150587d26f7fb68b29e486a352c05548aca0496cd1c689751c8。
- 已停止审阅，不扩充新功能、内容包或外部发布。本审阅仅写入这一记录。