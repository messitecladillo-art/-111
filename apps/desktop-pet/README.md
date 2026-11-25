# EVI-X Desktop Pet Kit

框架无关、可独立预览并无缝挂入桌面壳（Tauri v2 / Electron / PySide6 `QWebEngineView`）与 EVI-X 前端的交互式桌宠套件。

## 目录结构

- `src/pet-contract.js`：8 态状态机协议（`PET_STATES`）、皮肤配置校验（`validateSkinManifest` / `resolvePetSkin`）、研究流程事件映射（`mapAgentEventToPetState`）与斜杠指令字典（`SLASH_COMMANDS`）。
- `src/vector-rig.js`：分层 SVG 骨骼动画引擎（`[data-bone=...]` + `[data-hit="head" | "body" | "prop"]`），含呼吸、打字、警觉红队感叹号、待批举牌、干杯与拎起挣扎等 8 态动画，以及 `sprite-frames` 模式下的自动矢量兜底。
- `src/pet-widget.js`：交互控制器 `createDesktopPetWidget`，集成拖拽、摸头/戳身互动、文件拖入挂载、Floating 气泡快捷按钮、`Ctrl+Alt+B` Spotlight 指令栏、斜杠指令补全与帧动画播放器。
- `skins/evix-hound/`：随仓库发布的原装 2px 粗墨线原创学者猎犬皮肤（无版权风险）。
- `index.html`：独立调试试验台，可直接试玩 8 态动画、模拟证见审稿联动闭环，或导入本地外置皮肤包目录（如 `~/.evix/pet-skins/brian/`）。

## 本地预览

在仓库根目录执行：

```bash
python -m http.server 4173 --directory apps/desktop-pet
```

打开 `http://localhost:4173/index.html` 即可交互调试。

## 外置皮肤包规范（~/.evix/pet-skins/）

仓库只保留原创默认皮肤；个人二创或第三方皮肤（如《恶搞之家》布莱恩）统一放在用户主目录 `~/.evix/pet-skins/<skin-id>/` 下加载：

```text
~/.evix/pet-skins/brian/
├── skin.json        # renderer: "sprite-frames"，声明 8 态对应透明底 PNG/WebP 帧序列
├── persona.json     # 覆盖台词（headpat / poke / redteam_alert / awaiting_approval 等）
└── frames/          # 512x512 透明底序列帧；缺失任意状态自动回落到矢量骨架渲染
```

## 接入证见工作台与桌面壳（Tauri v2 / PySide6）

1. **状态同步**：将前端/后端 SSE 事件（`planning`、`drafting`、`redteam_alert`、`awaiting_approval`、`completed`、`error`）直接喂给 `widget.applyAgentEvent(event)`，自动驱动表情动作、台词与一键审批/审计胶囊按钮。
2. **指令回传**：在 `createDesktopPetWidget({ onCommand, onFilesDrop })` 中对接现有对话与报告生成接口；按 `Ctrl+Alt+B` 或双击桌宠随时唤出快捷指令栏。
3. **透明置顶窗口**：开启 `desktopMode: true`，并在 `onMove` 回调里桥接 Tauri 的 `appWindow.startDragging()` 或 PySide6 的窗口坐标移动，实现真正的桌面游走悬浮窗。
