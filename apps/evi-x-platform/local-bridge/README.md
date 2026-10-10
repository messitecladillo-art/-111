# EVI-X 本机只读桥接

这个小程序让本地运行的 EVI-X 页面读取真实 `agentctl` 状态。它不会修改 Gate、推进阶段、运行审计、创建项目或签发交接。

## 使用边界

- 仅监听 `127.0.0.1:8765`，不向局域网或互联网开放。
- 仅执行 `status`、`next`、`doctor` 三条只读命令。
- 网页只能提交预先登记的项目别名，不能提交路径或命令。
- 原始命令输出不会传给网页；绝对路径、事件标识、命令文本、阻塞详情和材料哈希会被删除。
- 本次启动临时口令在桥接进程存续期间有效，只保存在桥接进程和当前页面内存中；不要把它写入配置、Git、网址、Cookie 或浏览器存储。
- 托管在 Sites/Cloudflare 的页面不会连接本机桥接；请使用本地运行的页面。

## 配置

1. 复制 `bridge.config.example.json` 为 `bridge.config.json`。
2. 将 `projectsRoot` 改为存放项目的共同根目录。
3. 在 `projects` 中添加小写英文别名与根目录内的相对路径，例如：

```json
{
  "schemaVersion": "1.0.0",
  "projectsRoot": "D:/ZhengdaProjects",
  "projects": {
    "wuhan-football": "wuhan-football"
  },
  "allowedOrigins": [
    "http://127.0.0.1:3001",
    "http://localhost:3001"
  ]
}
```

项目必须已经通过冠军 Agent 的 `bootstrap` 初始化。桥接不会替用户初始化任何目录。

## 启动

在仓库根目录使用能运行冠军 Agent 的 Python 环境执行：

```powershell
python -X utf8 apps/evi-x-platform/local-bridge/agentctl_read_bridge.py --config apps/evi-x-platform/local-bridge/bridge.config.json
```

终端只会显示一次本次启动的连接口令。保持该窗口运行，在本地网页的“生命周期作战室”中粘贴口令并读取授权项目。

## 已知边界

- 当前版本默认信任启动桥接的 Windows 用户；对同一账户下持续进行目录替换的恶意进程不提供强隔离。
- 项目树超过 50,000 个目录项或状态锚点文件超过安全上限时会拒绝读取。
- 若项目在三次只读命令之间被其他程序修改，桥接会重试一次，仍不一致则返回冲突，不拼接新旧结果。
- 正式生产使用建议放入独立虚拟环境，并继续增加受限进程令牌和 Windows Job Object。
