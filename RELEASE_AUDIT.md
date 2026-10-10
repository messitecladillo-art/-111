# 证见 EVI-X V2 发布审计

审计日期：2026-08-04  
审计对象：`zhengda-cup-champion` 垂直 Agent、可执行控制平面、专家协作协议、品牌系统、IP 与视觉衍生资产  
结论：**Go（适用于当前 Agent 源码、知识库、控制平面和安装包）。当前树已完成独立 P0/P1 复审、69/69 运行矩阵、六源固定哈希复扫及完整 clean-wheel 隔离安装。三件用户来源作品自身仍因隐藏身份/活动内容等问题不满足“匿名冻结提交物”标准；这是案例输入的 No-Go，不影响 Agent 发布包的 Go。**

> 证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。

## 需求—证据矩阵

| 原始目标 | 当前证据 | 判定 |
|---|---|---|
| Agent 具备实用性 | 完整 Skill 路由、12 状态工作流、9 Gate、6 份机器契约、统一 CLI、聚合审计、任务/阻塞/资产/评审/交接台账 | 通过 |
| Agent 可续作、可恢复 | 权威 state、status 镜像、revision、单写者锁、append-only event-WAL、checkpoint 产物哈希与 resume | 通过 |
| Agent 可协作 | 9 类 canonical 专家角色、producer/owner 与 reviewer 双分离、版本/哈希绑定的 `review approve → artifact finalize`、十字段 response envelope | 通过 |
| Agent 具备美观性 | 统一视觉令牌、精确 SVG Logo、横向字标、单色标、证据路径纹样、排版/图表/印刷/可访问性规范 | 通过 |
| IP 使用内置生图 | 全身生产锚点、头像、英雄图、八姿态贴纸和周边概念板均由 built-in `image_gen` 生成或校正，提示词与输入参考已归档 | 通过 |
| IP 身份稳定 | 完整角色严格保留四节点证据角、胸口棱镜、箭头尾与引号耳；三节点旧版全部退役且 `usage_modes=[]` | 通过 |
| 衍生资产可生产管理 | `brand-manifest.json` 记录 22 项资产的路径、尺寸、SHA-256、来源、状态、模式与例外；未登记视觉会使校验失败 | 通过 |
| 兼顾赛事合规 | `visual.mode` 只有三种 canonical 值；安全默认 `competition_submission`；初始化不复制 Logo、IP 或品牌图片 | 通过 |
| 视觉不伤害证据真实性 | AI 图限定为 `conceptual`；合成田野证据、Agent 品牌泄露、图表失真均进入自动失败或对抗测试 | 通过 |
| 可回归、可接手 | 根目录 README、资料交接清单、控制平面/品牌参考、提示词记录、静态/行为/恢复/并发/安装态评测入口 | 通过 |

## V2 控制平面判定

| 能力 | 机器证据 | 判定 |
|---|---|---|
| 状态唯一权威 | `.agent/state.json` 通过 Draft 2020-12 Schema；`project.status` 只作镜像 | 通过 |
| 禁止跳级 | 12 状态、11 条前向相邻转换；非法跳级返回 exit 2 且 revision 不变 | 通过 |
| Gate 证据约束 | `rule/problem/design/fieldwork/data/inference/action/visual/submission` 均要求当前证据指纹 | 通过 |
| 故障恢复 | event-WAL 可重放 Gate、checkpoint、transition 和确定性表格变更；第三状态拒绝覆盖；连续 3 次冲突进入 `exhausted` | 通过 |
| 并发与一致性 | 项目锁、期望 revision、状态镜像冲突检测；冲突返回 exit 5 | 通过 |
| 可观测性 | 事件包含 run、sequence、timestamp、attempt、causation、correlation、input fingerprint 与 hash chain | 通过 |
| 一键审计 | `audit --all` 聚合 Schema、台账、问卷、数据、追溯、报告和视觉检查，并回写失败 Gate | 通过 |
| 规则证据 | 五维规则快照、每条原子规则显式 scope/source、正式来源本地副本与 SHA-256 联动 Gate 指纹 | 通过 |
| 风险与 blocker 治理 | fatal 不得接受/waive；non-fatal 接受与 high waiver 需要结构化决策、范围、补偿控制及 `{path, sha256}` 证据引用 | 通过 |
| 最终 No-Go | Gate 输入与结果哈希、fatal/high blocker 与风险、互异 required final artifacts、聚合审计、授权、匿名、双分离复核、checkpoint 任一失败均拒绝 handoff | 通过 |
| 关闭防伪 | `closed` 仅做只读幂等 handoff；当前/sealed checkpoint、正式 Schema、自哈希、聚合审计、Gate 结果、控制指纹或 `handoff_completed` 事件任一漂移都拒绝 Go | 通过 |
| Windows 并发恢复 | 内核 mutex 作为写锁权威；进程崩溃自动释放，锁文件按 token 校验所有权并保留陈旧锁审计 | 通过 |
| 安装态可运行 | clean wheel 包含 Skill 入口、13 份参考、Agent 配置、30 项品牌资源、6 份 runtime 契约、18 个模板和审计脚本；CLI stdout/stderr 明确使用 UTF-8 | 通过 |

## 生产资产判定

| 资产 | 状态 | 目视验收重点 |
|---|---|---|
| `evi-x-character-anchor-v2.png` | 完整角色生产锚点 | 四节点、棱镜、引号耳、箭头尾全部可见 |
| `evi-x-avatar-v1.png` | 紧凑头像生产锚点 | 四节点、双耳、琥珀眼、胸口棱镜；尾部采用清单裁切例外 |
| `evi-x-hero-evidence-chain-v2.png` | 生产英雄图 | V1 三节点问题已校正；Q→D→I→A 路径完整 |
| `evi-x-sticker-pack-v2.png` | 八姿态生产源板 | 八个角色及八根独角逐一检查；单格裁切后仍需二次验收 |
| `mark.svg` / `lockup-horizontal.svg` | 生产矢量标志 | 精确四节点；浏览器渲染预览通过 |
| `evi-x-merchandise-concept-v1.png` | 仅概念 | 不作为结构、材质、量产、授权或已生产证据 |

以下旧版只作审计对照，禁止发布：

- `evi-x-character-master-v1.png`
- `evi-x-hero-evidence-chain-v1.png`
- `evi-x-sticker-pack-v1.png`
- `evi-x-avatar-rejected-three-node-v0.png`

## 自动验证结果（2026-08-04 当前冻结证据）

### 国奖案例知识增量复验

本轮新增/修订范围限于案例来源登记、国奖样本共现模式、工作流/评分参考、README、基准任务目录和用户报告；未修改运行时、Schema、Gate、模板或控制平面语义。证据口径固定为：报告 3/3、PPT 2/2、答辩材料 0/3；奖项 3/3 为 `user_attested`、0/3 为 `official_verified`，具体一/二等奖映射未知。所有候选机制均标为 `analyst_inference` 与 `descriptive_association_only`，不把三个正样本的共现解释为获奖因果。

增量复验结果：

- 三个相关 JSON 可解析；12/12 模式 ID 唯一且均包含证据状态、奖项来源和因果边界；26/26 基准任务 ID 唯一；
- Skill quick validate：通过；
- Static：27/27，通过；
- Behavior `--validate-only`：33/33 场景契约通过；本轮未重跑耗时型完整行为/恢复/并发矩阵，沿用下方未改运行时代码的冻结基线；
- clean wheel 构建、隔离虚拟环境安装和 13/13 references 逐文件 SHA-256 对比：通过；重点修订的 `case-corpus.md`、`winning-case-patterns.md`、`workflow.md`、`scoring-rubric.md` 均进入安装产物；
- 临时 wheel、虚拟环境、报告导出件与逐页渲染件已删除，未在仓库留下 `build/`、`dist/` 或 `*.egg-info`。

```text
wheel: zhengda_cup_champion_agent-2.0.0-py3-none-any.whl
bytes: 20007254
sha256: 247521638bbedd0591979de79b4ab3cd46c7985ca51b027e889dfaa63c757219
references_source_vs_installed: 13/13 exact SHA-256 match
```

### 最终运行矩阵

验证环境为 Python 3.9.7 64-bit（MSC v.1929）。当前树结果如下：

| 验证 | 结果 | 外层耗时 | 退出码 |
|---|---:|---:|---:|
| Skill quick validate | 通过 | 0.071 s | 0 |
| Static | 27/27 | 16.279 s | 0 |
| Behavior | 33/33 | 280.882 s | 0 |
| Recovery fault injection | 7/7 | 14.312 s | 0 |
| Windows lock concurrency | 1/1 | 3.928 s | 0 |
| `PYTHONUTF8=0` CLI round-trip | 1/1 | 1.274 s | 0 |

不含 quick validate 的可计数矩阵为 **69/69，0 失败**；含 quick validate 的总外层耗时为 316.746 秒。并发测试内部返回符合合同：活动竞争者 5、崩溃持锁进程 17、恢复 0、doctor 0，并归档 1 个陈旧锁记录。中文路径与含引号标题往返正确，测试环境已还原，临时目录残留为 0。

### 三案例攻防与独立复审

独立复核最终结论为 **P0 = 0、P1 = 0，无 open P0/P1**。重点实证关闭：

- OOXML 大小写/重复成员、改名 VBA/ActiveX、远程模板、关系/内容类型、ZIP 注释及前后附加数据；
- PDF 全 xref、不可达对象、非目录 XMP、图片 EXIF/XMP、页缩略图、关联文件、XFA、危险动作、增量历史和物理边界；
- 方法的参考文献/补充材料/既有研究/否定语境，远距离非概率外推，情景—实现误配，以及因果设计实际采用性；
- 标准 core-properties 关系不误报 active content，真实 OLE/package 关系仍被阻断。

冻结工具 `audit_submission_files.py` SHA-256 为 `c77acd91592f71933c668b3c57ba6cca82ebcfecc3994b5babf1607edee0ae05`。2026-08-04 02:55:51+08:00 对六个固定哈希原件的严格复扫得到 **37 个错误、2 个警告**：身份元数据 24、活动关系 4、嵌入对象 4、`customXml` 2、图片身份元数据 2、包缩略图 1；两条警告均为 PDF 软件属性。本次未提供权威禁用身份词表，因此仍是下界。六个原件的 SHA-256 与字节数均和 intake 一致，且未被修改。

### 完整 clean wheel 隔离安装

包装清单曾实证暴露“只有 CLI、缺少 Skill/参考库”的发布阻塞；已将 Skill 入口、参考库、Agent 元数据和品牌资源纳入分发，并新增静态回归防止复发。最终 wheel：

```text
wheel: zhengda_cup_champion_agent-2.0.0-py3-none-any.whl
bytes: 20001871
sha256: 5012f03b0100a2238b3fdca1c226d33b6cbffc33a9ab161b88de6a7ffc0ced53
python: 3.9.7
pypdf: 6.14.2
Pillow: 11.3.0
references: 13/13
brand_files: 30/30
top_level_scripts: 11/11
agent_runtime_python: 8/8
```

源码、staging 与安装态的 README、SKILL、13 份 references、Agent 配置、30 个品牌文件、顶层脚本、运行时模块和关键模板哈希一致。安装态 15 组提交攻击烟测全部命中预期阻断；`bootstrap/status/next/doctor/audit --all` 全部退出 0。wheel、staging、venv、测试项目与 fixture 已删除，仓库没有 `build/`、`dist/` 或 `*.egg-info` 残留。

## 自动验证结果（2026-08-03 历史基线，非当前发布证据）

以下结果均在 2026-08-03 对当前工作树重新执行；旧的 17 场景和 19 项静态基线不再作为发布依据。

### Skill 结构

```text
Skill is valid!
```

### 品牌清单

```text
asset_count: 22
errors: 0
warnings: 0
passed: true
```

### 全仓静态与功能评测

`python -X utf8 evals/run_static_evals.py`：**20/20 通过，0 失败**。

覆盖：

1. 15 个基准任务与视觉类别；
2. 评分权重总和 100；
3. 全部 Python 脚本语法；
4. canonical 模式、色彩及提示词记录；
5. Agent 元数据和 UI 资源路径；
6. 问卷缺陷检测；
7. 调查数据重复、直线作答与短时长检测；
8. 报告结构审计；
9. 主张—证据追溯；
10. 结构化规则快照比较，并检测 scope 与 source 变化；
11. 品牌资产哈希、尺寸、来源与清单闭环；
12. 18 个领域模板、3 个运行时文件与安全视觉默认值；
13. 空视觉台账的合理预警；
14. 合法竞赛视觉包放行；
15. 合成证据与品牌泄露拒绝；
16. 递归 Python 语法、Skill 目录卫生与行为场景契约。

### 控制平面黑盒行为评测

`python -X utf8 evals/run_behavior_evals.py`：**33/33 场景通过，0 失败，472.891 秒**。

覆盖原有安全初态、零写入查询、规则 Gate、相邻推进、checkpoint 恢复、fatal/high、合成证据、镜像冲突、伪造 Gate/manifest、审计漂移、最终产物审查和真实 Go → closed 闭环，并新增 7 个实证攻击回归：

1. high waiver 底层证据哈希漂移；
2. 字节相同文件冒充 report / presentation / defense；
3. 不同人员但相同 producer role 自批；
4. accepted Gate 结果文件删除；
5. accepted Gate 结果文件修改；
6. closed latest checkpoint 删除；
7. closed latest checkpoint 修改。

所有阻断场景同时验证 prior status/revision、事件 append-only 前缀和最终 manifest 不被错误改写。

### event-WAL 故障注入

`python -X utf8 evals/run_recovery_fault_tests.py`：**7/7 通过，0 失败**。

覆盖 bootstrap 可重入、无 checkpoint 的 Gate 恢复、表格 mutation exactly-once、第三状态拒绝覆盖与三次冲突 `exhausted`，以及 advance 三个崩溃窗口的单次提交、镜像一致和 doctor 健康。

### Windows 并发与 UTF-8

- `python -X utf8 evals/run_lock_concurrency_test.py`：通过；活动竞争者 exit 5，崩溃持锁进程 exit 17，恢复与 doctor 均 exit 0。
- `PYTHONUTF8=0; python evals/run_cli_utf8_test.py`：通过；中文路径和带空格/引号标题严格往返。

### 独立 P0/P1 复审

首次审查实证发现 5 个 P1：waiver 底层证据漂移、重复交付物、producer/owner 语义混淆、Gate 结果文件丢失、closed checkpoint 丢失。修复后由独立审查者重新运行原攻击探针及正常闭环：**5/5 P1 closed，聚焦场景 8/8，通过；无 P0/P1，建议 Go**。

### clean wheel 隔离安装

在仓库外临时虚拟环境中安装最新构建产物并执行完整 CLI 烟测，确认没有回退到源码树；测试结束后已删除 wheel、虚拟环境、临时项目和标记文件，仓库未残留 `build/`、`dist/` 或 `*.egg-info`。

```text
wheel: zhengda_cup_champion_agent-2.0.0-py3-none-any.whl
bytes: 104445
sha256: 988572b944e36a7ef1e850c35f501f0c9e6630519d5e6899da0a26ced49c291c
contracts: 6
states: 12
gates: 9
```

安装态验证覆盖：Gate `result_sha256` 写入与复算、final-handoff 的 checkpoint/Gate/产物快照字段、新旧 CLI 参数边界、canonical 专家角色、blocker 证据哈希绑定、仓库外端到端流程，以及 `PYTHONUTF8=0`、无 `PYTHONPATH/PYTHONHOME` 情况下的中文路径与引号标题往返。

### 初始化烟雾测试

```text
domain_template_files: 18
runtime_files: 3  # .agent/config.json, state.json, events.jsonl
required_files_present: 21
project.visual.mode: competition_submission
design/visual-tokens.json mode: competition_submission
copied_brand_visuals: 0
```

## 仍需外部决策的发布门槛

这些不是当前仓库缺陷，但在对应场景发生前必须完成：

- `EVI-X`、`证见`、`獬见` 的商标、字号、域名、应用商店和社交账号近似检索；
- 对外商业发布时的字体授权、平台条款和图片使用条件复核；
- 实物周边的外观专利、材料、结构、安全、色差、供应商打样与生产合规；
- 每一届赛事开始后的官方规则、AI 使用、匿名、页数、地图和提交格式刷新；
- 任何真实项目的原始数据、授权、知情同意和适用通知仍须由项目团队提供并核实。

## 复验命令

```powershell
python -X utf8 C:/Users/zyy20/.codex/skills/.system/skill-creator/scripts/quick_validate.py skill/zhengda-cup-champion
python -X utf8 skill/zhengda-cup-champion/scripts/validate_brand_assets.py
python -X utf8 evals/run_static_evals.py
python -X utf8 evals/run_behavior_evals.py
python -X utf8 evals/run_lock_concurrency_test.py
python -X utf8 evals/run_recovery_fault_tests.py
$env:PYTHONUTF8='0'
python evals/run_cli_utf8_test.py
```

以上入口及 clean wheel 隔离安装测试均已执行。发布 Go 的适用范围仅为当前源码/契约版本；代码、Schema、模板或 Gate 语义变化后，必须重新运行完整矩阵，不能沿用本页结论。
