# 验收与交付证据

## 与改动相称的检查

| 改动 | 有价值的检查 |
|---|---|
| 局部文案/颜色/间距 | 改后实际界面；相关长内容/布局；项目要求检查 |
| 新界面/结构改造 | 主流程、代表尺寸、内容压力、加载/空/错误、焦点/阅读顺序、实际构建 |
| 指针/拖拽/滚动 | 输入/取消、失败恢复、等价入口、减少动态、挂载/卸载与尺寸变化 |
| 上传/服务任务/三维 | 对应失败路径；真实与模拟边界；目标设备行为 |
| 研究/审计 | 来源/范围、事实/推导、问题证据和复现，不冒充执行实现 |

项目标准、设备范围与预算优先。没有既定尺寸时选择目标设备及一个能暴露布局压力的窄尺寸，说明条件；不把随意设定的 FPS、Lighthouse 分数或“所有设备兼容”当门槛。

使用环境支持的浏览器与测试能力，观察渲染内容和关键操作。截图不证明交互、声音、服务提交或完整视频已验证。不要为样式镜像增加测试；新增取消/异步竞争等状态逻辑验证有意义的转换。

## 完成状态

- **范围内已验证**：请求已实现，关键行为/画面通过，记录条件。
- **部分验证**：实现完成但缺具体设备、服务或运行证据，列出缺项。
- **受阻**：关键功能未成立或严重缺陷未解决，说明最小修复/所需输入。

“生产级”要有依据和边界，不能由用了库、构建退出 0 或截图存在推导生产部署已验收。方案可以完整交付，其建议不会因此成为运行事实。

## 可选交接检查器

多文件/团队交接需要复核记录时，使用 scripts/audit_delivery.py。从技能目录定位脚本，项目根目录由调用者指定，清单/输出路径相对该根目录。

```text
python <skill-root>/scripts/audit_delivery.py --root <project-root> --manifest delivery.json --out delivery-audit.json
```

脚本只检查结构、声明文件 SHA-256、证据与路径，以及声明覆盖；不执行清单命令、不联网、不判断视觉质量/服务真实性。ready 表示记录完整，不是产品认证。

| 字段 | 约定 |
|---|---|
| schema_version | 整数 1 |
| profile | minor、interface、interaction、research、audit |
| scope | 本次具体范围 |
| artifacts | {path, sha256}；相对路径、完整小写 SHA-256 |
| checks | {id, status, detail, evidence}，id 不重复 |
| status | pass、fail、not_run、not_applicable |
| detail | 执行条件/结果，或未运行/不适用原因 |
| evidence | {path, sha256, kind}；kind 为 screenshot/log/review/source/recording/artifact |
| limitations | 未验证的设备/服务/数据/使用边界，可为空列表 |

以下清单明确未执行检查，不能当作通过证据：

```json
{"schema_version":1,"profile":"minor","scope":"只调整提交按钮间距和文案","artifacts":[],"checks":[{"id":"requested_change","status":"not_run","detail":"实现后检查","evidence":[]},{"id":"visual_review","status":"not_run","detail":"观察渲染界面后记录","evidence":[]}],"limitations":[]}
```

必要 check id：

- minor：requested_change、visual_review。
- interface：build、primary_flow、responsive、visual_review。
- interaction：interface 项 + failure_recovery、input_alternatives、motion_preference。
- research：source_trace、scope_accuracy、technical_verification。
- audit：scope_accuracy、findings_evidence、reproducibility。

not_applicable 需具体原因，脚本不能代人工判断真不适用。pass 绑定现有证据；visual_review pass 至少一张有实际图片文件头的 screenshot。证据来自运行、浏览器或可复核观察记录，不能写“测试通过”来满足字段。

结果/退出码：ready/0（记录完整）；limited/1（无交付文件、缺必要检查、not_run 等）；blocked/1（检查 fail）；invalid/2（结构、指纹、路径或 I/O 不符）。不为得到 ready 把 not_run 改为 pass。

拒绝绝对路径、盘符、父目录跳转、链接/重解析点与文件硬链接；不会沿清单链接越界读取。相同输入下报告稳定，可比较前后指纹。结构检查的通过仍需结合实际任务评审。
