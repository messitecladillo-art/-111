# Rule data schema

规则文件采用“快照—来源—范围—原子规则”四层结构，并由 `assets/runtime/schemas/rules.schema.json` 校验。不要把规则写成没有适用边界的一组句子，也不要只保存网页 URL 而不保存可复验的本地来源。

## 1. Five-dimensional snapshot

每个快照必须同时锁定：

```text
edition + group + region + track + stage
```

五个字段都必须是已核实的非空值，不能使用 `unknown`、`tbd`、`未确认` 等占位。`snapshot.source_ids` 只引用本文件 `sources` 中实际存在的 source ID。项目执行 rule Gate 时，快照五维值必须与 `project.yaml` 的对应五维完全一致；任意一维不一致均阻断，不得用三维或模糊范围替代。

## 2. Local source provenance

每个来源必须同时保存：

- 稳定 `id`、标题和 HTTPS 原始地址；
- `authority_level` 与具体 `authority_name`；
- 官方状态、发布日期和本次核验日期；
- 项目内相对路径 `local_path`；
- 本地文件的 64 位小写 SHA-256。

来源文件放在项目 `evidence/rule-sources/`。rule Gate 会核对文件存在性和当前哈希；文件缺失、为空或内容漂移时，已记录的规则不能继续视为当前证据。对 hard、fatal、disqualifying 等实质规则，来源必须属于 Schema 允许的正式权威层级；博客、经验帖和记忆只能作为检索线索，不能直接支撑硬规则。

## 3. Explicit scopes

每个 scope 对五个维度分别使用以下二选一结构：

```json
{"mode": "all"}
```

或：

```json
{"mode": "values", "values": ["第十六届"]}
```

`all` 只表示该正式来源明确覆盖该维度的全部合法值，不表示“我们不知道”。只要来源限定了组别、地区、赛道或阶段，就必须使用 `values` 明列。每条原子规则通过 `scope_id` 引用一个 scope；包括 advisory/soft 在内的每条规则都要通过五维适用性检查。

## 4. Atomic rules and source linkage

一条记录只表达一个可判断要求。规则必须同时引用 `scope_id` 与 `source_id`，并复制来源标题、URL、发布日期、核验日期和权威级别；这些复制字段必须与 `sources` 中对应记录一致，防止换源或串届后仍沿用旧结论。

`severity` 只使用：`advisory`、`soft`、`hard`、`fatal`、`disqualifying`。`status` 只使用：`active`、`active-for-edition`、`superseded`、`provisional`。进入适用规则 Gate 的规则必须处于当前可用状态；已取代和待核实规则不能冒充当前硬约束。

下面是结构示例；它是一个已归档届次的机器快照片段，不代表未来届次或其他赛区、赛道、阶段的现行要求：

```json
{
  "snapshot": {
    "edition": "第十六届",
    "group": "本科组",
    "region": "全国",
    "track": "自主选题",
    "stage": "校赛及企业命题赛",
    "verified_at": "2026-08-02",
    "source_ids": ["edition16-undergrad-practice"]
  },
  "sources": [
    {
      "id": "edition16-undergrad-practice",
      "title": "第十六届本科组校赛及企业命题赛通知",
      "url": "https://som.bit.edu.cn/docs/2026-02/f49cf03dad0840688f9565acd3a70bb6.pdf",
      "authority_level": "national-organizing-committee",
      "authority_name": "中国商业统计学会全国大学生市场调查与分析大赛组委会",
      "official_status": "official-republication",
      "published_date": "2025-11-15",
      "verified_at": "2026-08-02",
      "local_path": "evidence/rule-sources/edition16-undergrad-practice-source.txt",
      "sha256": "7bca601071854c06ca74a50ce7f1a20bd3208c735f662e51792aeb71fc054196"
    }
  ],
  "scopes": [
    {
      "id": "edition16-undergrad-practice-current-stage",
      "edition": {"mode": "values", "values": ["第十六届"]},
      "group": {"mode": "values", "values": ["本科组"]},
      "region": {"mode": "all"},
      "track": {"mode": "all"},
      "stage": {"mode": "values", "values": ["校赛及企业命题赛"]}
    }
  ],
  "rules": [
    {
      "id": "undergrad-report-anonymity",
      "scope_id": "edition16-undergrad-practice-current-stage",
      "rule_type": "anonymity",
      "rule": "参赛报告任何一页不得出现参赛校及指导教师相关信息",
      "severity": "disqualifying",
      "source_id": "edition16-undergrad-practice",
      "source_title": "第十六届本科组校赛及企业命题赛通知",
      "source_url": "https://som.bit.edu.cn/docs/2026-02/f49cf03dad0840688f9565acd3a70bb6.pdf",
      "published_date": "2025-11-15",
      "verified_at": "2026-08-02",
      "authority": "national-organizing-committee",
      "status": "active-for-edition"
    }
  ]
}
```

## 5. Version comparison and refresh

使用稳定语义 ID，让 `scripts/compare_rules.py` 能检测新增、删除和变化。若新届规则实质变化，应建立新快照并保留旧版本，不得用同一 ID 静默改写历史。每次真实项目开始、适用通知更新或五维范围变化时，重新获取正式来源、保存本地副本、计算 SHA-256、更新 `verified_at`，再重跑 rule Gate。
