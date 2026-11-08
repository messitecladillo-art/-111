# 工作区素材架

素材架位于主 Agent 工作区的右侧，通过顶部的叠片按钮收拢或展开。它保留真实已生成或用户导入的对象，不用占位素材填充空项目。报告中删除、替换或撤销一个对象，不会删除它在素材架中的历史版本。

## 职责与调用方向

| 源文件 | 唯一职责 |
|---|---|
| `lib/agent/artifact-library.ts` | 对象契约、采集、不可变版本、内容指纹、IndexedDB 事务和纯报告放置 |
| `components/agent/useArtifactLibrary.tsx` | 账户/项目作用域、异步队列、预览、编辑、指令及编辑器采纳回执 |
| `components/agent/ArtifactShelf.tsx` / `.module.css` | 收拢入口、筛选、版本选择及独立对象操作；不访问模型或数据库 |
| `components/agent/AgentShell.tsx` | 宿主装配，传入当前身份、项目、真实编辑器快照和候选稿 |
| `components/EviXPlatform.tsx` → `components/editors/EditingStudio.tsx` | 检查新鲜身份并在原编辑器中执行放置；沿用编辑器撤销栈 |
| `components/agent/Composer.tsx` | 保留未发送内容，接收素材指令草稿；中文组合期间延迟插入，失效作用域撤销旧回调 |

调用为 `AgentShell → useArtifactLibrary → artifact-library`；实际放置通过宿主回到已挂载的 `EditingStudio`。素材架不再渲染一份报告编辑器，也不通过模拟 DOM 点击改稿。

## 对象与存储

`ArtifactLibrary/v1` 保存 `Artifact/v1` 记录。每条记录有稳定 family ID、独立版本/ID、内容 SHA-256、时间、来源、分类和状态。正文放置只引用一次具体版本。

- 采集报告中真实存在的封面文字、页框、图表、表格、公式和文字；默认模板提示不算生成成果。
- 已返回的整稿和章节修订候选单独收录，未采纳或关闭候选也不删除记录；流式半成品不按完整成果收录。
- 编辑另存新版本，不原地改旧对象。相同 family 与相同内容幂等；上限 240 版/45 MB，满额拒绝新增，保留旧记录。
- IndexedDB 库为 `evix-artifact-library-v1`，`libraries` 以账户和项目为键；访客采用标签页私有 ID。切换身份或项目后旧异步操作永久失效。
- 每次保存在同一个读写事务内读取最新记录再写回，避免跨标签页丢失更新；界面并不实时订阅其他标签页。刷新可读到最新库。
- 恢复先校验结构、大小和本地图片类型，再核对素材及分析结果指纹。损坏记录不会静默清空或假装恢复成功。
- 本版仅浏览器本地持久化，不具备跨设备云同步；清除站点数据会清除本地库。

## 复用与边界

图表保留原分析结果与配色版本；引用旧结果、悬空图表/文献或已删除目标章节时拒绝放置。页框应用需明确预览确认，项目配色冲突不自动改变全文。实际编辑器确认成功后才显示已采用。

封面文字可以应用到报告。PNG/JPG/WebP/SVG 图片可独立预览、替换、保存版本和下载原文件；当前报告模型尚没有自由图片块，按钮明确显示“下载原图”，不声称图片已经嵌入正文。表格导出为带依据的 JSON，图形与页框导出 SVG，文字/公式导出 TXT/TeX。

已支持的图表样式指令只修改选中图的副本；其他指令加入已有对话草稿，保留对象 ID、版本、指纹与用户实际要求，不自动发送模型请求，不把原始数据或图片字节塞入提示词。

## 信息图 Skill 与示例

规范源为 `skill/research-descriptive-infographics/`。属性、比较任务、定量编码、整体几何与项目主题决定构图，不固定人口字段、六行卡片或颜色。

`scripts/sync-descriptive-infographic-skill.py` 单向生成 Writing Agent 的只读 JSON 指导包和站内示例图片；`--check` 检测漂移。Writing 专属工具 `load_descriptive_infographic_guidance` 读取固定包，不接受文件路径或访问网络。该工具提供指导，不代表执行了统计、制图或生图。

内置信息图通过开发阶段真实调用 imagegen 生成和编辑。用户主动点击“添加信息图示例”才收录；其模拟来源、哈希和审阅记录在素材详情及 canonical provenance 中，不在图面堆叠说明条。网站尚未由此获得调用内置 imagegen 的能力。

## 验证入口

```powershell
node --experimental-strip-types --test apps/frontend/tests/artifact-library.test.mjs apps/frontend/tests/artifact-library-controller.test.mjs apps/frontend/tests/artifact-composer.test.mjs
python -X utf8 scripts/sync-descriptive-infographic-skill.py --check
apps/backend/.venv/Scripts/python.exe -m pytest apps/backend/tests/test_descriptive_infographic_guidance.py
npm run typecheck:web
npm run lint --workspace evi-x-zhengda-champion-platform
npm run build:web
```

模拟 API 的主工作区浏览器验收与真实供应商、PostgreSQL 或原生 Office 验收分别记录。测试模拟不能充当真实付费模型调用的证明。
