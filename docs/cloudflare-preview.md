# Cloudflare 前端体验版

本部署提供公开首页、Agent界面、知识索引、案例元数据、规则诊断，以及浏览器内的问卷、分析和报告编辑工具。用户数据不自动上传；浏览器保存不等同于团队云端保存。

本版未部署 FastAPI、PostgreSQL、邮件或个人模型服务。登录、团队项目、调查回收、云端任务、私有题库、服务端SAV/提交体检、LaTeX编译和整篇报告生成返回明确的 `503 preview_backend_unavailable`，不会连接开发者本机或启用测试身份。模型大脑不接受公开收费调用；生图接口仅返回明确的本地复合图模式。

## 发布入口

在仓库根目录安装锁定依赖后：

```powershell
npm ci
npm run build:cloudflare:preview --workspace evi-x-zhengda-champion-platform
npm run preview:cloudflare --workspace evi-x-zhengda-champion-platform
```

需要发布时使用部署账号完成 `npx wrangler login`，再运行：

```powershell
npm run deploy:cloudflare:preview --workspace evi-x-zhengda-champion-platform
```

这条命令构建后发布 `dist/server/wrangler.json`，不要直接用历史 `vite.config.ts` 或 `worker/index.ts`。正式上传前核对 Worker名称和账号；公开资源仅来自 `dist/client`。不创建D1、R2、Images或模型密钥绑定，不更改账号套餐或启用额外付费服务。

## 文件分工

- `apps/frontend/vite.cloudflare.config.ts`：独立的 vinext/Cloudflare构建，清空本机后端转发。原来的 Next standalone 构建保持原入口。
- `apps/frontend/wrangler.cloudflare.jsonc`：`evix-research-preview` Worker及静态资源配置。兼容日期按锁定 workerd 实际支持的 `2026-08-06` 设置。
- `apps/frontend/worker/cloudflare.ts`、`lib/cloudflare-preview.ts`：静态资源与页面的响应安全头、OCR策略和API白名单。未知/托管API在调用应用前拒绝。
- `apps/frontend/tests/cloudflare-preview.test.mjs`：API拒绝、允许路由、编码路径与OCR策略回归。

`dist`、Wrangler状态和账号凭据不进入Git。vinext会生成框架类型，构建末尾运行 `next typegen` 恢复标准Next类型，避免两种构建的临时类型互相影响。

## 发布验收与后续接入

每次发布记录源码提交、Worker版本和实际网址，并检查页面、脚本、图片、知识资源、案例接口、诊断接口及托管API的明确拒绝。不能用构建成功代替线上检查，也不能把该版本称为完整云端研究系统。

接入正式后端须另批配置HTTPS来源、受限数据库、实际邮件、密钥保管、Cookie、撤权、预算回执和备份恢复；不得直接把API转发改成本地测试地址。当前Worker白名单默认阻止这类接入，需显式改造并验收。
