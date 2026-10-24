# 证见 EVI-X｜正大杯循证研策 Agent

证见是一套面向“正大杯”全国大学生市场调查与分析大赛的垂直 Agent：从规则锁定、选题、研究设计、问卷、抽样、数据审计、方法选择，到报告、答辩、视觉交付和赛前红队审查，始终维护同一条可追溯证据链。

> 证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。

![证见 EVI-X：从问题、数据、洞察到行动](skill/zhengda-cup-champion/assets/brand/raster/evi-x-hero-evidence-chain-v2.png)

## 它解决什么

- **规则不串台**：先锁定届次、组别、赛区、赛道和阶段，再应用硬规则。
- **证据不断链**：维护 `claim → source/data → transformation → method → result → limitation → recommendation → output`。
- **口径不漂移**：标题数字统一登记总体、分析样本、单位、内容类别和所有报告/PPT/答辩位置；比例/比率及具备双基线的百分点变化自动复算，其余均值、金额、系数、样本加总和模型结果绑定来源与转换，由可复现脚本和人工复核验算。
- **方法不炫技**：问题、抽样、变量、问卷、数据与模型必须对齐，不用复杂度替代有效性。
- **国奖不盲抄**：对用户确认的国家一/二等奖案例同时维护“国奖样本共现机制”和“复用安全”两本账，标明证据基数与推断属性，学习决策张力、分群、母洞察、报告—PPT转化与行动闭环，同时独立拦截方法、数字、代码和匿名风险。
- **交付可直接用**：项目模板、证据台账、AI 使用台账、视觉台账、预检表和确定性审计脚本同步生成。
- **视觉不粉饰**：图表真实、可访问、可印刷；AI 图只可标为概念性视觉，不能冒充调研或数据证据。
- **匿名不泄露**：竞赛提交默认关闭 Agent Logo、IP、品牌纹样和宣传语。
- **隐藏层也匿名**：冻结提交物会检查作者属性、ZIP 物理边界/注释、包缩略图、批注修订、自定义 XML、隐藏页、备注、宏/远程模板/嵌入关系、图片 EXIF/XMP/GPS，以及 PDF 全 xref 元数据、图片、缩略图、书签、动作、表单、图层和附件。
- **冻结版不留备注**：最终提交 PPTX 的隐藏页和非空演讲者备注一律阻断；答辩提示另存为独立 `defense` 工件。
- **进度不失忆**：权威状态、事件链、checkpoint 和 revision 让“继续做”从上次断点接续。
- **规则可举证**：规则快照同时锁定届次、组别、赛区、赛道和阶段；每个本地来源文件都绑定 SHA-256。
- **交付不放水**：九道 Gate 结果文件及哈希、结构化 blocker、制作人—复核人双分离、互异的必交产物和 checkpoint 共同决定 Go / No-Go。

## 一分钟开始

网页内测改造直接在现有 `apps/frontend` 中进行。新的 Next + FastAPI + PostgreSQL 启动、测试、原工程保留方式及部署配置见 [P0 运行说明](docs/p0-running.md)。下面的 CLI 仍用于研究项目的阶段与证据管理。

GitHub 克隆后的依赖安装、源码范围与本地资料保留说明见 [GitHub 源码与首次运行](docs/github-publishing.md)；公开「循证三千年」首页与独立演示页见 [首页说明](docs/landing-page.md)；工作台、项目与服务页的统一界面见 [界面系统](docs/design-system.md)。

从仓库根目录运行：

```powershell
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" bootstrap --title "项目名称"
```

初始化会创建 18 个领域模板，并建立 `.agent/state.json`、不可变事件链、审计目录与 checkpoint 目录。安全默认模式是 `competition_submission`，且不会把证见 Logo 或獬见 IP 自动复制进参赛项目。

首次初始化后可直接查询：

```powershell
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" status
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" next
```

`status` 会返回当前阶段、九 Gate、阻塞项、缺少资料和下一动作；它是只读的，不会偷偷推进项目。

## V2 可执行控制平面

```text
intake → rule_lock → problem_framing → exploratory_research
       → survey_design → fieldwork → data_analysis → insight_action
       → report_visual → defense → submission_ready → closed
```

- 仅允许前向相邻推进，禁止跳级和倒退覆盖。
- 运行前同时校验 6 份机器契约：workflow、gates、project state、agent state、rules 与 final handoff。
- Gate 的 `pass` 必须绑定当前证据；输入哈希变化后自动失效。
- `project.stage` 始终表示赛事阶段，`project.status` 只是权威运行状态的镜像。
- 状态写入使用单写者锁、revision、原子文件和 append-only 事件 hash chain。
- checkpoint 会记录产物路径、字节数和 SHA-256；每个 Gate 也绑定其结果文件 SHA-256。事件流同时承担可重放 WAL。中断恢复只重放已知事件和确定性表格变更，若目标行已进入预期前后状态之外的“第三状态”则拒绝覆盖；连续 3 次恢复冲突后进入 `exhausted`。
- AI 合成材料若冒充真实田野或数据证据，会触发 fatal 审计；未解决的 fatal/high blocker 会拒绝最终 handoff。
- `closed` 状态再次执行 `handoff` 是只读幂等检查：清单、Gate、审计或控制指纹漂移时拒绝返回 Go，不会重写清单。

CLI 会把标准输出和错误输出显式配置为 UTF-8；在 Windows PowerShell 中仍建议统一使用 `python -X utf8`，避免中文项目名和证据路径受系统代码页影响。

## 三种视觉模式

| `visual.mode` | 典型场景 | 品牌状态 |
|---|---|---|
| `agent_ui` | Agent 界面、内部工作台、教程 | 可使用完整品牌 |
| `public_promo` | 官网、社媒、公开路演、周边概念 | 可使用品牌，必须显示非官方声明 |
| `competition_submission` | 报告、附录、答辩 PPT、讲稿、提交物 | 默认中性，禁止 Agent 身份泄露 |

机器字段只使用以上三个值，不创建同义别名。

## IP：獬见

完整角色生产锚点是 `evi-x-character-anchor-v2.png`。四项不可漂移的身份特征为：

1. 一根且仅一根金色证据角，严格四节点，对应 Q–D–I–A；
2. 青绿到琥珀金的胸口洞察棱镜；
3. 末端为行动箭头的深蓝缎带尾；
4. 双耳内侧的镜像金色引号。

生产资产、退役版本、尺寸、SHA-256、生成方式与允许模式见 [品牌系统规范](skill/zhengda-cup-champion/references/brand-system.md) 和 [资产清单](skill/zhengda-cup-champion/assets/brand/brand-manifest.json)。

## 常用命令

```powershell
# 查看状态与下一动作
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" status
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" next

# 一键聚合审计、运行时体检、最终交付判定
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" audit --all
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" doctor

# 先在 project.yaml 中明确本项目最终必须交付的类型，例如：
# deliverables.required_final_artifact_types: [report, presentation, defense]
# 同时明确匿名要求；unknown 在最终阶段 fail closed，yes 时禁用身份词表不得为空：
# competition.anonymity_required: yes
# competition.forbidden_identity_terms: ["学校全名", "团队名称", "成员姓名", "指导教师"]

# 1. 以 draft 登记固定版本和哈希；显式 ID 便于后续评审闭环
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" artifact register "deliverables/report/report.pdf" `
  --id ART-REPORT-001 --title "参赛报告" --type report --classification derived `
  --stage submission_ready --gate submission --provenance "team-authored" `
  --status draft --producer-role narrative_strategist --owner-name "报告负责人"

# 2. 独立复核；证据 JSON 必须绑定 artifact_id、version、sha256、artifact_type、
#    producer_role、owner_name、reviewer_role/name、decision=approved、
#    type-specific acceptance_checks、acceptance_test 和含时区 completed_at
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" review approve ART-REPORT-001 `
  --review-id REV-REPORT-001 --evidence "reviews/evidence/report-review.json" `
  --reviewer-role red_team_judge --reviewer-name "独立复核人"

# 3. 只有当前版本及哈希的批准仍有效时，才可完成 final 化
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" artifact finalize ART-REPORT-001 `
  --review-id REV-REPORT-001 --rights-status cleared --anonymity-status pass

# report / presentation / defense 等必交类型必须分别对应不同路径和不同 SHA-256；
# 不能把同一文件复制或重复登记来凑齐类型。

# high blocker 的 waiver 需要结构化 JSON 决策证据；其中每个 evidence_refs 元素必须为
# {"path":"evidence/...","sha256":"64位小写哈希"}；fatal 永远不可 waiver
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" blocker waive BLK-001 `
  --evidence "evidence/governance/BLK-001-waiver.json" --decision-owner "项目负责人"

# handoff 还会核对 required_final_artifact_types；closed 后重复执行只读复验
python -X utf8 skill/zhengda-cup-champion/scripts/agentctl.py "projects/项目代号" handoff

# 问卷审计
python -X utf8 skill/zhengda-cup-champion/scripts/audit_questionnaire.py questionnaire.csv

# 数据质量审计
python -X utf8 skill/zhengda-cup-champion/scripts/audit_dataset.py survey.csv --id-column response_id

# 报告审计；最终阶段把实际使用方法的最低契约提升为错误
python -X utf8 skill/zhengda-cup-champion/scripts/audit_report.py report.md --strict-methods

# 冻结提交物二进制预检；匿名项目按需重复传入所有禁用身份词
python -X utf8 skill/zhengda-cup-champion/scripts/audit_submission_files.py report.docx deck.pptx report.pdf `
  --strict --forbidden-term "学校全名" --forbidden-term "团队名称"

# 主张—证据追溯审计；最终输出中的每一条主张必须 status=verified
python -X utf8 skill/zhengda-cup-champion/scripts/check_traceability.py evidence/evidence-ledger.csv --strict

# 品牌资产完整性与哈希审计
python -X utf8 skill/zhengda-cup-champion/scripts/validate_brand_assets.py

# 项目视觉台账、证据边界与匿名隔离审计
python -X utf8 skill/zhengda-cup-champion/scripts/audit_visual_package.py "projects/项目代号" --strict

# 全仓静态评测
python -X utf8 evals/run_static_evals.py

# 控制平面黑盒行为评测
python -X utf8 evals/run_behavior_evals.py

# Windows 单写者冲突与进程崩溃恢复评测
python -X utf8 evals/run_lock_concurrency_test.py

# event-WAL 故障注入：bootstrap、Gate、表格 mutation、三类 advance 崩溃窗口
python -X utf8 evals/run_recovery_fault_tests.py

# 关闭 Python UTF-8 mode 后复测中文路径、标题和机器 JSON
$env:PYTHONUTF8='0'
python evals/run_cli_utf8_test.py
```

最终评审 JSON 的 `acceptance_checks` 至少包含以下机器码：

| artifact type | 必需检查 |
|---|---|
| `report` | `file_hash_current`, `content_type_match`, `report_structure_reviewed`, `cross_file_consistency` |
| `presentation` | `file_hash_current`, `content_type_match`, `slide_render_inspected`, `cross_file_consistency` |
| `defense` | `file_hash_current`, `content_type_match`, `defense_timing_checked`, `cross_file_consistency` |
| `appendix` | `file_hash_current`, `content_type_match`, `appendix_traceability_checked` |
| `data_package` | `file_hash_current`, `content_type_match`, `data_package_reproducibility_checked` |
| `code_package` | `file_hash_current`, `content_type_match`, `code_package_reproducibility_checked` |

检查码是审计声明，不替代真实渲染、复算或答辩演练；没有实际执行时不得写入“已通过”。

## 核心结构

```text
skill/zhengda-cup-champion/
├─ SKILL.md                    Agent 路由与不可妥协规则
├─ agents/openai.yaml         展示名、描述、图标和默认提示
├─ references/                控制平面、专家角色、工作流、方法、合规、评分与视觉规范
├─ assets/runtime/            状态机、九 Gate 与 JSON Schema 机器契约
├─ assets/templates/          项目、任务、阻塞、资产、评审、交接与视觉模板
├─ assets/brand/              Logo、IP、图标、提示词、令牌与资产清单
└─ scripts/                   agentctl 运行时、确定性审计与构建工具

corpus-source/                官方规则快照、来源清单与用户案例的最小化溯源记录
evals/                        基准任务、对抗案例、静态与行为评测
三件国奖作品共性提炼与Agent升级-2026-08-04.md
                              三案共性、作品书流程、PPT压缩规律与Agent升级记录
```

## 关键边界

- 不生成或补写虚假受访者、访谈、原始数据、引用、模型结果、奖项或评委意见。
- 不把跨截面相关性包装成因果。
- 不把 AI 概念图当作田野、受访者、数据、地图边界或已实施效果证据。
- 不在未核实规则时套用旧届、异组或异阶段要求。
- `EVI-X` 是工作名；商业发布、域名注册或批量周边生产前仍需完成商标、字号、域名、字体授权和生产合规审查。

完整行为规范见 [SKILL.md](skill/zhengda-cup-champion/SKILL.md)。
