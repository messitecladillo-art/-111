# 知识内容包 03：计算机与数据工程

## 协作封包

- 协议：`agent-collab/v1`；nonce：`content-pack03-20261015`。
- 生产者：`/root/knowledge_content`；接收者：`/root`、`/root/knowledge_core`。
- 输入基线：`abe5752e03dd872437d42551dc8d57028f2fc33c`；首 60 条与 Pack 01 作为只读概念排重输入。
- 任务收到：2026-10-15 00:05 +08:00；3 小时租约截至 03:05 +08:00；不再委派。
- 唯一写入边界：`pack-03-computing-data.json`、`production-notes-pack03.md`。
- 文件包版本：`2026.10.15-b03`；条目版本：整数 `1`。
- 内容冻结：2026-10-15 00:26 +08:00；输入 SHA-256：`a7b76ddec02318f8ebadaa81ddba01a8ca03f0216ccacc37bc9cf19f5532c222`。
- 数据分类：原创教学内容和公开技术主来源；未读取/复制答卷、密钥、私人教材全文或题库全文。
- 能力使用：已授权范围的文件写入、官方文档/作者技术文章在线读取、本地结构与算例检查。
- 观察到的数量：100 个独立新概念；28 深入、72 简释；97 computing、3 ml；76 个来源 URL；3 个公式。
- 全部状态为 `draft`。内容已冻结交给独立复核，生产者不标自己为已审校。
- 当前文件哈希是生产输入；独立来源修订或 review 元数据批准后应以新的审阅记录与哈希为准。

## 设计依据

优先收录会影响研究工具正确使用的计算概念：类型与精度、文件结构、连接基数、状态持久化、并发版本、调用未知、权限和溯源。术语解释供研究理解，不承担项目实证证据或赛事 Gate 的职能。

原始定义与教学例子均为原创。示例明确以“示例：”标记，不声称来自受访者、团队实验或产品测量。标准公式给出符号与适用条件；不把技术词条的存在当作产品已实现该功能。所有方法、材料、工具链接数组保留为空，没有虚构执行器入口。

与 Pack 02 的社会/地理/哲学内容负责人协调：空间连接、地理拓扑、栅格/空间向量数据等保留给其包。本包的普通关系表连接、计算图、SVG向量图与这些空间概念含义不同。已核对 core60 与 Pack01 的160个概念，合并后共260个唯一ID；本包交叉引用只使用 core60 与本包ID，不依赖其他扩充包或未来词条。

## 高风险解释边界

- 数据类型与研究测量含义分开。数字编码不自动产生数量、距离或顺序。
- Unicode规范化与UTF编码分开；NFKC可能合并有意保留的差别。
- JSON Schema的结构通过不证明真实性；空键、null、空字符串、有效0分别处理。
- XLSX的公式、缓存值与可见格式分开；SVG/PDF可包含位图，扩展名不构成全矢量证明。
- 表连接先核对唯一键和匹配基数；统计行数可能不是应答者人数。
- 数据库隔离与版本冲突分开。可重复读不能普遍当作可串行化；版本比较须原子执行。
- MVCC、锁、租约不等于没有竞争。租约过期后旧执行者的写回需要再次校验。
- Outbox只原子登记业务状态与交付意图；发送可重复，外部收费不受本地事务完整覆盖。
- 超时不表示未执行，取消本地等待不表示供应商停止。恰好一次保证必须说明可见效果与系统边界。
- 认证、授权与CORS各自说明。TLS保护通道，不代替静态加密、权限和日志管理。
- 加密与哈希分开；密码慢哈希与API Key可恢复加密分开；AEAD强调关联数据及nonce使用要求。
- 假名化保留可链接路径；匿名化仍需重识别风险评估。美国技术文献背景不作为中国法律或本届比赛要求。
- 差分隐私公式仅为纯epsilon定义，列明相邻单位、组合预算和信任边界；不宣传系统已实现。
- 拓扑顺序不代表赛事阶段，合法顺序可不唯一；算法增长阶不等于真实延时。
- 复现声明需说明独立者与结果范围；ACM约定不强制其他学科用同一术语。
- 数值误差度量不是算法稳定性证明，接近零时不得只看相对误差。

## 实际核验记录

2026-10-15 00:27 +08:00，Node结构检查 exit 0：

- 100/28/72 数量与全部必备数组；
- ID排重、core60/本包范围内全部关联存在；
- 76来源ID的元信息一致、HTTPS、定位和适用范围不空；
- 示例、整数版本与draft/producer元数据；
- 首60、Pack01与本包合并排重后共260个唯一概念。

首次校验发现两条引用指向Pack01的DAG概念，超过本次允许依赖边界；已改为本包算法关联。最终校验无缺失引用。

KaTeX三个公式以 `trust:false`、严格错误模式解析，exit 0。六个教学算例/表示检查通过：100条记录有4950个无序对、常见浮点0.1+0.2与0.3不严格相等、大数相减损失、NFC组合重音归一、null与缺键区别、10万×10万中间数组的元素量。

结构与算例自查不代替独立语义审校。此子任务未运行界面、搜索准确率、联网、OCR、数据库或服务端安全测试，也未声明相关生产实现已通过。未提交Git、PR或合并。

## 来源读取与权限记录

下面76个URL已实际打开并读取相关页面、文档段落或PDF页。来源以技术规范、官方项目文档、NIST技术报告和作者原论述为主，不引入OpenStax材料，不复制规范全文、原图或程序长片段。

公开阅读不等同于允许任意再分发；当前只保存出处、标准概念与原创说明。若未来加入原图、整章译文或代码，应单独核验对应许可。当前动态文档URL的库版本不表示证见已安装该版本。

读取失败或过浅的地址未作为最终来源：RFC9110入口读取失败后改为HTTPWG实际规范；Kafka总文档重定向改到实际4.1 Design章；NIST哈希表的错误路径改为hashtab；Streams改到WHATWG标准；ACM主政策页读取失败后用实际可读的SIGIR采用说明；SQL目录页改为实际SELECT教程。

- [Python：内置类型](https://docs.python.org/3/builtins/stdtypes.html)；定位：Numeric Types / Boolean Type / Text Sequence Type；概念：data-type、integer、boolean、string。
- [JSON Schema：类型](https://json-schema.org/understanding-json-schema/reference/type)；定位：Type-specific Keywords / type 的字符串或数组值；概念：data-type、boolean、serialization、json-schema、nullable-type。
- [Python：浮点误差](https://docs.python.org/3.14/tutorial/floatingpoint.html)；定位：15.1 Representation Error / math.isclose；概念：integer、floating-point、numerical-stability。
- [Goldberg：浮点运算分析](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html)；定位：Rounding Error / Cancellation / Exactly Rounded Operations；概念：floating-point、numerical-stability。
- [Unicode：UTF 与 BOM](https://www.unicode.org/faq/utf_bom.html)；定位：Byte Order Mark FAQ / UTF Encoding Forms；概念：string、unicode-codepoint、byte-order-mark。
- [scikit-learn：类别特征编码](https://scikit-learn.org/stable/modules/preprocessing.html)；定位：Encoding categorical features / OrdinalEncoder / OneHotEncoder；概念：categorical-encoding、one-hot-encoding、ordinal-encoding。
- [Unicode UAX #15](https://www.unicode.org/reports/tr15/)；定位：Introduction / Canonical and Compatibility Equivalence / Normalization Forms；概念：unicode-normalization。
- [Python：表格文本方言](https://docs.python.org/3.14/library/csv.html)；定位：Dialects and Formatting Parameters / excel_tab / reader；概念：delimiter、tsv。
- [Python：Decimal](https://docs.python.org/3.14/library/decimal.html)；定位：Introduction / Context objects；概念：decimal-precision。
- [Python：序列化](https://docs.python.org/3.14/library/pickle.html)；定位：Python object serialization / Relationship to other modules / 安全警告；概念：serialization。
- [JSON Schema：对象约束](https://json-schema.org/understanding-json-schema/reference/object)；定位：Properties / Required Properties / Additional Properties；概念：json-schema、data-validation、schema-evolution。
- [W3C：XML 1.0](https://www.w3.org/TR/xml/)；定位：1 Introduction / 2 Documents / Well-Formed XML Documents；概念：xml。
- [Microsoft：SpreadsheetML 结构](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document)；定位：Important Spreadsheet Parts / Generated SpreadsheetML；概念：xlsx。
- [Apache Parquet：概览](https://parquet.apache.org/docs/overview/)；定位：Overview / parquet-format specification；概念：parquet。
- [Apache Arrow：列式布局](https://arrow.apache.org/docs/format/Columnar.html)；定位：Format / Null bitmaps / Serialization and Interprocess Communication；概念：arrow。
- [W3C：SVG 2](https://www.w3.org/TR/SVG2/intro.html)；定位：1 Introduction / SVG 概念与向量、图像能力；概念：svg。
- [IETF RFC 8118：PDF](https://www.rfc-editor.org/info/rfc8118/)；定位：1 Introduction / 7 Security Considerations / 8 IANA Considerations；概念：pdf、file-signature。
- [Python：ZIP 文件](https://docs.python.org/3.14/library/zipfile.html)；定位：ZIP archive format / decompression pitfalls / extraction；概念：compression、zip-archive、file-signature。
- [Python：gzip](https://docs.python.org/3.14/library/gzip.html)；定位：Support for gzip files / GzipFile；概念：compression、gzip。
- [IETF RFC 9110：HTTP 语义](https://httpwg.org/specs/rfc9110.html)；定位：3 Terminology / 8.3 Content-Type / 9 Methods / 13 Conditional Requests / 15 Status Codes；概念：content-type、optimistic-concurrency、http、status-code。
- [OWASP：输入校验](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)；定位：Goals of Input Validation / Syntactic and Semantic Validation / Allowlist；概念：data-validation。
- [PostgreSQL：结构变更](https://www.postgresql.org/docs/current/ddl-alter.html)；定位：Modifying Tables / Adding, removing and changing columns；概念：schema-evolution。
- [PostgreSQL：关系模型](https://www.postgresql.org/docs/current/tutorial-concepts.html)；定位：2.2 Concepts；概念：relational-database。
- [PostgreSQL：SQL 教程](https://www.postgresql.org/docs/current/tutorial-select.html)；定位：2.5 Querying a Table / SELECT / WHERE / ORDER BY；概念：sql。
- [PostgreSQL：表表达式](https://www.postgresql.org/docs/current/queries-table-expressions.html)；定位：Joined Tables / GROUP BY and HAVING；概念：sql、null-sql、join、aggregation。
- [PostgreSQL：约束](https://www.postgresql.org/docs/current/ddl-constraints.html)；定位：Check / Not-Null / Unique / Primary Keys / Foreign Keys；概念：primary-key、foreign-key、unique-constraint、check-constraint、null-sql。
- [PostgreSQL：窗口函数](https://www.postgresql.org/docs/current/tutorial-window.html)；定位：3.5 Window Functions；概念：window-function。
- [PostgreSQL：索引](https://www.postgresql.org/docs/current/indexes-intro.html)；定位：11.1 Introduction / 维护成本；概念：database-index。
- [PostgreSQL：EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)；定位：EXPLAIN Basics / EXPLAIN ANALYZE / 估计成本不是毫秒；概念：database-index、query-plan。
- [PostgreSQL：隔离级别](https://www.postgresql.org/docs/current/transaction-iso.html)；定位：Table 13.1 / Read Committed / Repeatable Read / Serializable；概念：transaction-isolation、mvcc。
- [PostgreSQL：MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html)；定位：13.1 Introduction / 数据快照；概念：mvcc。
- [SQLAlchemy：版本计数](https://docs.sqlalchemy.org/en/20/orm/versioning.html)；定位：Simple Version Counting / UPDATE with expected version / StaleDataError；概念：optimistic-concurrency。
- [PostgreSQL：显式锁](https://www.postgresql.org/docs/current/explicit-locking.html)；定位：Row-Level Locks / Deadlocks；概念：pessimistic-lock、deadlock。
- [PostgreSQL：INSERT](https://www.postgresql.org/docs/current/sql-insert.html)；定位：ON CONFLICT Clause / conflict target；概念：upsert。
- [PostgreSQL：预写日志](https://www.postgresql.org/docs/current/wal-intro.html)；定位：28.3 Write-Ahead Logging；概念：write-ahead-log、backup-recovery、checkpoint。
- [PostgreSQL：备份恢复](https://www.postgresql.org/docs/current/backup.html)；定位：Chapter 25 / SQL Dump / File System / Continuous Archiving；概念：backup-recovery。
- [Apache Kafka：交付语义](https://kafka.apache.org/41/design/design/)；定位：Persistence / Consumer Position / Message Delivery Semantics / Using Transactions；概念：event-log、exactly-once、checkpoint。
- [W3C：PROV](https://www.w3.org/TR/prov-overview/)；定位：PROV family / entities, activities, agents / derivation；概念：event-log、provenance。
- [AWS：事务 Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)；定位：Intent / Issues and considerations / duplicate handling；概念：outbox、task-queue、exactly-once。
- [AWS SQS：可见性超时](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)；定位：Visibility timeout / processing / visibility management；作为有限任务占用的实例；概念：lease、task-queue。
- [AWS SQS：至少一次](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)；定位：At-least-once delivery / 重复副本与幂等应用；概念：task-queue、at-least-once。
- [AWS：超时与退避](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)；定位：Timeouts / Retries and backoff / Jitter；概念：retry-backoff、timeout、cancellation。
- [Python：协程任务](https://docs.python.org/3.14/library/asyncio-task.html)；定位：Task Cancellation / Timeouts / Shielding From Cancellation；概念：timeout、cancellation。
- [Fielding：REST 原始论述](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)；定位：5.1.2—5.1.6 / Uniform Interface；概念：rest。
- [PostgreSQL：分页顺序](https://www.postgresql.org/docs/current/queries-limit.html)；定位：7.6 LIMIT and OFFSET / predictable order；概念：pagination。
- [WHATWG：服务端事件](https://html.spec.whatwg.org/multipage/server-sent-events.html)；定位：Server-sent events / EventSource / Last-Event-ID；概念：sse。
- [IETF RFC 6455：WebSocket](https://www.rfc-editor.org/rfc/rfc6455.txt)；定位：1 Introduction / Opening Handshake / Data Framing；概念：websocket。
- [WHATWG：Fetch CORS](https://fetch.spec.whatwg.org/)；定位：3.3 CORS protocol / credentials / preflight；概念：cors。
- [IETF RFC 8446：TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.txt)；定位：1 Introduction / 2 Protocol Overview / 8 0-RTT and Anti-Replay；概念：tls。
- [NIST：身份认证](https://csrc.nist.gov/glossary/term/authentication)；定位：Definitions / 验证用户、进程或设备身份；概念：authentication。
- [NIST：授权](https://csrc.nist.gov/glossary/term/authorization)；定位：Definitions / 访问资源的权限与审批；概念：authorization。
- [OWASP：授权检查](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)；定位：Introduction / Least Privileges / Deny by Default / Every Request；概念：authorization、least-privilege。
- [NIST：加密](https://csrc.nist.gov/glossary/term/encryption)；定位：Definitions / plaintext to ciphertext；概念：encryption。
- [PyCA cryptography：AEAD](https://cryptography.io/en/latest/hazmat/primitives/aead/)；定位：Authenticated encryption / AESGCM / nonce / associated_data / InvalidTag；概念：encryption、aead。
- [OWASP：密码保存](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)；定位：Hashing vs Encryption / Salting / Argon2id；概念：password-hashing。
- [OWASP：密钥管理](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)；定位：Secret Lifecycle / Rotation / Access control / Logging；概念：secret-management。
- [OWASP：SQL 注入](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)；定位：What Is SQL Injection / Parameterized Queries / Allow-list；概念：sql-injection。
- [OWASP：跨站脚本](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)；定位：Output Encoding / HTML Sanitization / Safe Sinks；概念：cross-site-scripting。
- [OWASP：请求伪造](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)；定位：Introduction / Token-Based Mitigation / SameSite Cookie；概念：csrf。
- [NISTIR 8053：去标识化](https://nvlpubs.nist.gov/nistpubs/ir/2015/NIST.IR.8053.pdf)；定位：正文1.4.1、3.2 Pseudonymization、3.3 Linkage attacks；概念：pseudonymization、anonymization。
- [NIST SP 800-226：差分隐私](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-226.pdf)；定位：2.1.1 Pure epsilon differential privacy / 2.2 budget / 2.4 privacy unit；概念：differential-privacy。
- [NIST DADS：算法](https://xlinux.nist.gov/dads/HTML/algorithm.html)；定位：Definition；概念：algorithm。
- [NIST DADS：复杂度](https://xlinux.nist.gov/dads/HTML/complexity.html)；定位：Definition / resources as a function of problem size；概念：time-complexity、space-complexity。
- [NIST DADS：大 O](https://xlinux.nist.gov/dads/HTML/bigOnotation.html)；定位：Formal Definition / Note / computation model；概念：time-complexity、space-complexity、big-o。
- [NIST DADS：哈希表](https://xlinux.nist.gov/dads/HTML/hashtab.html)；定位：Definition / collision / complexity conditions；概念：hash-table。
- [NIST DADS：二分搜索](https://xlinux.nist.gov/dads/HTML/binarySearch.html)；定位：Definition / sorted array / Note；概念：binary-search。
- [Python：排序](https://docs.python.org/3.14/howto/sorting.html)；定位：Key Functions / Sort Stability / Ascending and Descending；概念：sorting。
- [NetworkX：图对象](https://networkx.org/documentation/stable/reference/classes/graph.html)；定位：Graph / nodes / edges / self loops / directed counterparts；概念：graph。
- [NetworkX：图遍历](https://networkx.org/documentation/stable/reference/algorithms/traversal.html)；定位：Depth First Search / Breadth First Search；概念：breadth-first-search、depth-first-search。
- [NetworkX：拓扑排序](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.dag.topological_sort.html)；定位：Description / Exceptions / DAG prerequisite；概念：topological-sort。
- [Python：函数缓存](https://docs.python.org/3.14/library/functools.html)；定位：lru_cache / cache / arguments / cache invalidation considerations；概念：cache。
- [WHATWG：Web Worker](https://html.spec.whatwg.org/multipage/workers.html)；定位：10.1 Introduction / dedicated workers / communication；概念：worker-thread。
- [WHATWG：Streams](https://streams.spec.whatwg.org/)；定位：Readable streams / Writable streams / backpressure；概念：streaming。
- [NumPy：广播](https://numpy.org/doc/stable/user/basics.broadcasting.html)；定位：Broadcasting / array operations / memory caveats；概念：vectorization。
- [ACM SIGIR：成果复现](https://sigir.org/general-information/acm-sigir-artifact-badging/)；定位：Results Reproduced v1.1 / artifacts / independent team；概念：reproducibility。
- [PyPA：可重复安装](https://pip.pypa.io/en/stable/topics/repeatable-installs/)；定位：Pinning versions / Hash-checking / Installation bundles；概念：reproducibility、environment-lock。

## 全局概念登记

下面ID与名称用于后续包做语义排重，别名不另计概念。

| ID | 名称 | 深度 |
|---|---|---|
| `data-type` | 数据类型 | 深入 |
| `integer` | 整数类型 | 简释 |
| `floating-point` | 浮点数与舍入误差 | 深入 |
| `boolean` | 布尔类型 | 简释 |
| `string` | 字符串 | 简释 |
| `categorical-encoding` | 类别特征编码 | 深入 |
| `one-hot-encoding` | 独热编码 | 简释 |
| `ordinal-encoding` | 类别整数编码 | 简释 |
| `unicode-normalization` | Unicode 规范化 | 深入 |
| `unicode-codepoint` | Unicode 码点 | 简释 |
| `byte-order-mark` | 字节顺序标记 | 简释 |
| `delimiter` | 字段分隔符 | 简释 |
| `decimal-precision` | 十进制精度与舍入 | 简释 |
| `serialization` | 序列化 | 深入 |
| `json-schema` | JSON Schema 数据约束 | 深入 |
| `xml` | XML 标记格式 | 简释 |
| `xlsx` | XLSX 工作簿结构 | 深入 |
| `tsv` | TSV 表格文本 | 简释 |
| `parquet` | Parquet 列式文件 | 深入 |
| `arrow` | Arrow 列式内存格式 | 简释 |
| `svg` | SVG 矢量图 | 深入 |
| `pdf` | PDF 页面文档 | 简释 |
| `compression` | 无损数据压缩 | 简释 |
| `gzip` | gzip 压缩流 | 简释 |
| `zip-archive` | ZIP 归档 | 简释 |
| `file-signature` | 文件格式签名 | 简释 |
| `content-type` | 媒体类型声明 | 简释 |
| `nullable-type` | 可空类型 | 简释 |
| `data-validation` | 数据结构与语义校验 | 深入 |
| `schema-evolution` | 数据结构演进 | 简释 |
| `relational-database` | 关系型数据库 | 深入 |
| `sql` | SQL 查询语言 | 简释 |
| `primary-key` | 主键 | 简释 |
| `foreign-key` | 外键 | 简释 |
| `unique-constraint` | 唯一约束 | 简释 |
| `check-constraint` | 检查约束 | 简释 |
| `null-sql` | SQL 空值与三值逻辑 | 简释 |
| `join` | 表连接与行数变化 | 深入 |
| `aggregation` | 分组聚合 | 简释 |
| `window-function` | 窗口函数 | 简释 |
| `database-index` | 数据库索引 | 深入 |
| `query-plan` | 查询执行计划 | 简释 |
| `transaction-isolation` | 事务隔离级别 | 深入 |
| `mvcc` | 多版本并发控制 | 简释 |
| `optimistic-concurrency` | 乐观并发与版本冲突 | 深入 |
| `pessimistic-lock` | 悲观锁 | 简释 |
| `deadlock` | 数据库死锁 | 简释 |
| `upsert` | 冲突时插入或更新 | 简释 |
| `write-ahead-log` | 预写日志 | 简释 |
| `backup-recovery` | 备份、恢复与验证 | 深入 |
| `event-log` | 追加式事件记录 | 简释 |
| `outbox` | 事务发件箱模式 | 深入 |
| `lease` | 任务租约 | 简释 |
| `task-queue` | 持久任务队列 | 简释 |
| `at-least-once` | 至少一次交付 | 简释 |
| `exactly-once` | 恰好一次语义的边界 | 深入 |
| `checkpoint` | 任务检查点 | 简释 |
| `retry-backoff` | 重试退避与抖动 | 简释 |
| `timeout` | 超时与结果未知 | 简释 |
| `cancellation` | 协作式取消 | 简释 |
| `http` | HTTP 请求与回执 | 深入 |
| `status-code` | HTTP 状态码 | 简释 |
| `rest` | REST 架构约束 | 简释 |
| `pagination` | 分页与稳定顺序 | 简释 |
| `sse` | 服务端发送事件 | 简释 |
| `websocket` | WebSocket 双向连接 | 简释 |
| `cors` | 跨源资源共享 | 简释 |
| `tls` | TLS 安全传输 | 深入 |
| `authentication` | 身份认证 | 简释 |
| `authorization` | 授权与访问控制 | 深入 |
| `encryption` | 加密与密钥边界 | 深入 |
| `aead` | 认证加密与关联数据 | 简释 |
| `password-hashing` | 密码慢哈希与盐 | 简释 |
| `secret-management` | 密钥生命周期管理 | 简释 |
| `least-privilege` | 最小权限原则 | 简释 |
| `sql-injection` | SQL 注入 | 简释 |
| `cross-site-scripting` | 跨站脚本注入 | 简释 |
| `csrf` | 跨站请求伪造 | 简释 |
| `pseudonymization` | 假名化 | 简释 |
| `anonymization` | 匿名化与重识别风险 | 深入 |
| `differential-privacy` | 差分隐私 | 深入 |
| `algorithm` | 算法 | 简释 |
| `time-complexity` | 时间复杂度 | 深入 |
| `space-complexity` | 空间复杂度 | 简释 |
| `big-o` | 大 O 渐近上界 | 简释 |
| `hash-table` | 哈希表 | 简释 |
| `binary-search` | 二分搜索 | 简释 |
| `sorting` | 稳定排序与比较规则 | 简释 |
| `graph` | 图结构 | 简释 |
| `breadth-first-search` | 广度优先遍历 | 简释 |
| `depth-first-search` | 深度优先遍历 | 简释 |
| `topological-sort` | 拓扑排序 | 深入 |
| `cache` | 缓存与失效 | 简释 |
| `worker-thread` | Web Worker 后台脚本 | 简释 |
| `streaming` | 流式处理与背压 | 简释 |
| `vectorization` | 数组向量化运算 | 简释 |
| `numerical-stability` | 数值稳定性 | 深入 |
| `reproducibility` | 计算复现 | 深入 |
| `provenance` | 数据与成果溯源 | 简释 |
| `environment-lock` | 依赖锁定与执行环境 | 简释 |

## 下一步与未完成项

本包的定义、公式、适用条件和来源定位需要独立逐条审校；所有draft只在审校批准后进入正式索引。发现来源或含义问题时，由协调者分配限定修订边界，重算哈希后再验收。

1,000 个独立概念、300 深入＋700 简释仍是总建设目标。当前本包只交付100个生产稿，不将计划量写成已审阅或已上线数量。

## 独立审校后的有限修订记录

2026-10-15：协调者授权后，将7个来源ID改为小写kebab，生产 `validateKnowledgePack(core60+pack03)` 检查160条返回exit 0。之后按独立审校提出的两项P2修订：移除compression的“压缩率”别名；将encryption教学例明确为界面不回显原文、授权服务仍可解密。未改变来源URL、公式、其他定义或数量。修订后仍为draft，等待独立复核者批准；开头哈希保留为原生产输入。

