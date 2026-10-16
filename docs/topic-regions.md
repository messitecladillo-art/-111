# 选题顾问：版本化地区目录

本批只提供地区选择、搜索和旧输入迁移候选。地区节点不表示已具备当地热点、特色资料包、样本渠道或进入许可。

## 固定来源与覆盖

- 来源：[yescallop/areacodes](https://github.com/yescallop/areacodes)，CC0-1.0。
- 固定提交：`e2c2b2e1fb4ce1fb76e879aa0b80e229adaf950c`，上游提交时间 `2026-02-01T17:03:25Z`。
- 目录版本：`cn-admin-2025-e2c2b2e1fb4c`；数据年度边界：`2025-12-31`。
- 原始JSON、许可和README在 `corpus-source/topic-advisor/regions/` 保留原始字节，`source.json` 记录来源、读取时间、大小与SHA-256。
- 原始JSON：2,552,540 bytes，SHA-256 `8c4e8afc5dfc16b77d34cf39b2547d07ab6a46e46b414679d494e50353970edc`。
- 原始历史节点6,824个；按2025有效区间筛选后3,212个：省级34、地级333、县级2,845。保留3,612条历史名称记录。
- 台湾省、香港特别行政区、澳门特别行政区在该数据源中各只有省级节点，没有下级明细。不能将34个省级节点解释为所有地区县区明细均完整。
- 来源状态为 `community_compilation_official_full_recheck_pending`。上游声明依据国家地名信息库、民政部历史资料及国务院公报；本次[官方发布入口](https://dmfw.mca.gov.cn/XzqhVersionPublish.html)不可达，未完成2026现势全量核验。

上游年份表示年度记录边界。`start <= 2025 && (end === undefined || end > 2025)` 为本批筛选条件，`end` 为排他边界；这些年份不能用于断言某次调整的精确生效日，也不能当作行政区成立时间。

## 生成与检查

在 `apps/evi-x-platform` 执行：

```powershell
node scripts/sync-topic-regions.mjs --write
node scripts/sync-topic-regions.mjs
node --experimental-strip-types --test tests/topic-regions.test.mjs
```

同步脚本完全离线，默认仅检查。它校验固定提交、原始JSON、LICENSE、README指纹，并重建目录；不会自动下载新版本。升级需要保留旧来源与目录版本，明确核实变化后单独提交。

节点根据6位代码判断省、地、县，不按树深度判断。北京和重庆的县区可以直接属于省级；仙桃、神农架、石河子等没有虚构地级父节点。任何有效父链缺失、重复代码或来源指纹变化都会使生成失败。

## 前端接口

`lib/topic-advisor/regions.ts` 导出以下纯函数，无网络、存储和研究阶段副作用：

| 接口 | 行为 |
|---|---|
| `TOPIC_REGION_CATALOG` | 严格解析并深度冻结的目录，含来源、覆盖和历史名称 |
| `parseRegionCatalog(input)` | 校验JSON/对象、计数、级别、父链和历史候选；拒绝重复字段、动态属性及不支持字段 |
| `searchRegions(query, parent?, limit?, catalog?)` | 按代码、名称、短名和历史候选搜索；`parent`可为代码或精确版本引用；上限100 |
| `regionPath(codeOrRef, catalog?)` | 从省级到目标的实际父链；未知代码返回空列表，版本引用不匹配则抛错 |
| `getRegionByCode(code, catalog?)` | 读取当前目录有效节点 |
| `validateRegionRef(input, catalog?)` | 返回 `{code, catalogVersion}`；不存在、旧版本及额外字段均拒绝 |
| `resolveLegacyRegion(region, city, catalog?)` | 返回 `empty/unmatched/candidates/ambiguous` 与候选、说明；所有结果均需用户确认 |

空搜索词列出指定父节点的直接子节点；非空搜索词覆盖其所有后代。无父节点时空搜索列出省级节点。结果包含节点字段及 `match/matchedName/requiresConfirmation`，历史名称匹配必须确认。

旧输入“湖北/武汉”只提出武汉市候选，绝不猜测洪山区或其他县区。省市矛盾时不跨省兜底。同名区县保留多个带父链的候选。

历史名称和 `succ` 只生成可能的现行位置：撤并、区域分割、代码再使用均不能直接等同于身份替换。例如旧石家庄桥东区存在两个现行候选。对于仍有效的代码，搜索保留当前含义，不把其过去转出的辖区加入结果。

## 功能区与资料缺口

`FunctionalArea` 采用独立字符串ID，包含类型、关联行政区代码、来源和 `curated/user_defined` 分类。它不进入行政区节点及县级计数，不能作为 `RegionRef.code`。审校功能区需要来源；用户自定义区域仍需明确关联到现有行政区。

当前发布包的功能区列表为空：没有根据名称推测园区、景区或校园边界。后续经核实后可以单独添加。`countyContent: directory_only` 保留地区目录与地方资料覆盖之间的区别。

项目保存选中的代码和目录版本；新资料发布不改写旧项目。目录升级时展示差异及迁移候选，用户确认前继续保留原引用和原始输入。UI应展示“2025年末目录”，覆盖缺口放在具体地区详情，不以全局阻断提示打断研究操作。

本批回归覆盖来源重建、同名、县改区、分割、直辖县、旗、林区、省级明细缺口、功能区隔离、旧输入及版本冲突。地区目录通过不代表选题质量、真实取数或全流程验收通过。
