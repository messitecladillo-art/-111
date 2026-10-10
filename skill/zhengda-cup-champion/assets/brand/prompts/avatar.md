---
prompt_id: evi-x-avatar-v1
status: production
brand: "证见 / EVI-X"
character: "獬见"
use_case: logo-brand
intended_tool: built-in-image-gen
target_ratio: "1:1 square"
applicable_modes: [agent_ui, public_promo]
excluded_modes: [competition_submission]
---

# 獬见头像提示词

头像用于账号、智能体卡片和应用图标。它采用已登记的紧凑裁切例外：四节点证据角、胸口棱镜、琥珀眼和引号耳必须进入画面；尾部可以在画框外，但若出现就必须保持唯一箭头尾。不要把头像简化成只剩一张兽脸。

## 最终提示词

```text
Use case: logo-brand
Asset type: square mascot avatar and app-profile image
Primary request: Using Image 1 only as the exact identity reference, create a minimal, instantly recognizable square avatar of Xiejian for the independent evidence-first brand EVI-X. Preserve the character rather than inventing a new logo.
Input images: Image 1 is the approved Xiejian identity master; preserve identity exactly
Scene/backdrop: simple deep-night circular field with one restrained cyan-to-gold halo and no environmental objects
Subject: Xiejian in a close upper-body pose, looking calmly toward the viewer; include the complete horn and both ears plus enough upper chest for the prism to remain identifiable; the approved compact crop may place the tail outside the frame
Style/medium: polished stylized 3D brand icon, simplified high-contrast surfaces, crisp silhouette, premium research-technology character
Composition/framing: 1:1 square; centered optical balance; all critical features inside a 76 percent circular safe zone; at least 10 percent outer padding for circular platform crops; no feature touches the edge
Lighting/mood: calm amber key light, restrained cyan rim light, trustworthy and intelligent
Color palette: canonical ink navy #0A1F33, evidence teal #00B3A4, deep evidence teal #00796F, action gold #F4B942, warm amber eyes, warm ivory #F7F4ED background
Text: no text, no letters, no wordmark, no watermark
Identity invariants: exactly one centered gold evidence horn with exactly four and only four clearly separated luminous joints mapped base-to-tip as Q-D-I-A; exactly one identifiable vertical diamond-cut cyan-and-amber chest prism; both upright ears visible with mirrored gold quotation-mark/comma glyphs; warm amber eyes, matte navy body, narrow gold trim, and juvenile xiezhi identity. The compact-avatar exception permits the tail to be outside the crop; if any tail is visible, it must remain a single navy ribbon ending in one cyan-and-gold arrowhead.
Constraints: readable at 32 pixels; horn-node count remains visibly four; quotation glyphs do not resemble logos; chest prism is not a medal; the crop stays inside the circular safe zone
Avoid: face-only crop, clipped horn, fewer or more horn nodes, second horn, antlers, hidden prism, incorrect visible tail, generic ear decoration, excessive detail, letter E or X as a fake logo, trophy, cup, medal, crown, laurel, official badge, competition logo, red official background, text, watermark
```

## 发布边界

头像本身不生成免责声明。用于 `public_promo` 公开账号时，必须在账号名称、简介或同屏落地页展示品牌系统规定的非官方声明。`competition_submission` 默认不使用该头像。

## 验收条件

- 32×32 像素预览仍可识别单角、四节点、双耳金色引号与胸口棱镜；紧凑裁切不强制显示尾部。
- 圆形裁切不切角、不切耳、不切尾箭。
- 无文字、奖项、赛事或冠名方元素。

## 生成记录

```yaml
generated_at: 2026-08-03
tool: built-in image_gen
input_references:
  - path: assets/brand/raster/evi-x-avatar-rejected-three-node-v0.png
    role: rejected composition reference requiring node correction
output_path: assets/brand/raster/evi-x-avatar-v1.png
deprecated_output: assets/brand/raster/evi-x-avatar-rejected-three-node-v0.png
preview_checks:
  256px: pass
  64px: pass
  32px: pass
reviewer: Codex visual QA
identity_gate: pass_compact_avatar
notes: V0 had three horn nodes and was rejected. V1 has exactly four visible nodes and is the approved compact UI anchor.
```
