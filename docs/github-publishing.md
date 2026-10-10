# GitHub 源码范围与首次运行

仓库保存证见 EVI-X 的前端、FastAPI 后端、共享契约、部署模板、CLI、规则与方法库、测试、品牌资源及运行文档。当前网页入口包括寻证首页 `/`、产品演示 `/explore`、研究工作台 `/workspace`、托管项目 `/projects` 与模型服务 `/services`。

## 从源码运行

使用 Node.js 22.13 或更新版本；后端使用独立 Python 3.12 环境及 PostgreSQL。根目录执行 `npm ci` 安装已锁定的工作区依赖，再按 [P0 运行说明](p0-running.md) 配置数据库、后端环境和前端代理。部署参数模板见 `deploy/api.env.example`。

```powershell
npm run typecheck:web
npm run test:unit --workspace evi-x-zhengda-champion-platform
npm run build:web
npm run start --workspace evi-x-zhengda-champion-platform
```

生产构建和开发服务器共用 `.next`，构建前停止开发服务器。首页视觉与路由说明见 [landing-page.md](landing-page.md)。本地合成验收环境只使用测试邮件和模型适配器；接入真实服务需自行配置密钥。

## 本地保留的资料

以下内容由 `.gitignore` 排除，仅在原电脑保留：

- `.env` 及环境文件、本地数据库与文件存储、Python/Node 依赖、构建缓存。
- `.collab/` 中的协作记录、浏览器截图、测试运行产物与改造前完整源码快照。
- `.openai/` 中的旧托管绑定信息。
- `research/xhs-direct-20261007/` 的原始研究截图、摘录及压缩包。
- `outputs/`、`exports/` 的生成结果和交付包，以及独立前端 Skill 评估产物。

这些排除不会删除本机文件。仓库包含可复用的方法与规则、必要构建资源和合成测试夹具；真实 API Key、受访者数据与账号会话不应提交到 Git。

`scripts/check-p0-preservation.py` 用于原电脑上的历史工程保全检查，依赖未上传的 `.collab` 基线快照，不是新克隆项目的安装或运行前置条件。文档中的历史验收路径也指向原电脑证据，不代表 GitHub 内附全部运行记录。

## 本次上传前的验证

2026-10-10 首页精简版本已通过生产构建、466 项单元测试（另有 7 项跳过）、6 条页面路由检查和独立代码复核，并检查了桌面、手机纵屏与横屏布局。具体适用范围见首页运行说明；这些记录不替代部署环境验收。
