---
prompt_id: evi-x-sticker-pack-v2
status: production
brand: "证见 / EVI-X"
character: "獬见"
use_case: stylized-concept
intended_tool: built-in-image-gen
target_ratio: "3:2 landscape"
applicable_modes: [agent_ui, public_promo]
excluded_modes: [competition_submission]
---

# 獬见循证动作表情包提示词

使用最新批准角色母版作为身份参考。先生成无文字动作母图，再确定性裁切、描边和排字。若一个动作的角色身份漂移，单独返修该动作，不接受用其他格遮掩。

## V1 初始提示词（已降级）

```text
Use case: stylized-concept
Asset type: eight-pose mascot sticker source sheet for research workflow communication
Primary request: Using Image 1 only as the exact identity reference, create eight clearly separated full-body Xiejian sticker poses. Each pose communicates one evidence-first behavior without text: 1 clarify the question with a magnifying glass and question aperture; 2 verify a source by inspecting one evidence card; 3 collect structured data points into a grid; 4 detect a broken assumption with a careful stop gesture; 5 refract data through the chest prism into an insight beam; 6 warn that two connected points do not automatically mean causality; 7 convert a finding into a forward action route; 8 protect research integrity with an open palm and a transparent evidence shield.
Input images: Image 1 is the approved Xiejian identity master; preserve identity, colors, materials, and proportions exactly
Scene/backdrop: clean warm-ivory background, no environment, no panel borders, ample empty spacing between poses for later cropping
Subject: exactly eight separate full-body poses of the same Xiejian character in a balanced 4-by-2 grid; no duplicates and no additional characters
Style/medium: polished stylized 3D mascot render with crisp silhouette, subtle soft grounding shadow, premium and expressive but not chibi or childish
Composition/framing: 3:2 landscape; equal cell scale and generous crop margins; props stay close to each figure and do not overlap adjacent cells
Lighting/mood: consistent soft studio light across all eight poses; alert, helpful, calm, ethically firm
Color palette: canonical ink navy #0A1F33, evidence teal #00B3A4, deep evidence teal #00796F, action gold #F4B942, warm ivory #F7F4ED
Text: no text, no letters, no speech balloons, no wordmark, no watermark
Identity invariants: Every one of the eight figures must visibly retain exactly one centered gold evidence horn with exactly four and only four linked luminous joints mapped base-to-tip as Q-D-I-A; exactly one vertical diamond-cut cyan-and-amber chest prism; exactly one long navy ribbon tail ending in one cyan-and-gold triangular arrowhead; and two large upright ears with mirrored gold quotation-mark/comma glyphs. Preserve warm amber eyes, compact four-legged xiezhi anatomy, matte navy body, and narrow gold trim.
Constraints: every figure is fully contained; identity features are not hidden by props, paws, pose, or crop; each gesture remains understandable without text; use simple abstract evidence props, not screenshots or official documents
Avoid: wrong number of horn joints in any cell, missing horn, hidden chest prism, ordinary tail, multiple tails, generic ear marks, extra mascot, costume changes, exaggerated baby proportions, trophy, medal, cup, crown, laurel, official seal, competition logo, readable document text, speech balloons, emojis, watermark
```

## 建议后配短句

后期可按顺序加入：`先问清楚`、`来源呢？`、`数据就位`、`先别下结论`、`洞察成形`、`相关不等于因果`、`落到行动`、`拒绝编造`。文字必须在排版阶段加入并人工校对。

## 验收条件

- 恰好八个动作，动作语义互不重复。
- 八个角色均保留四节点证据角、胸口棱镜、箭头尾和引号耳。
- 没有任何一格出现奖项、官方文件、赛事标志或乱码。
- 每格可独立裁切，背景简洁，角色与道具不越界。

## 生成记录

```yaml
generated_at: 2026-08-03
tool: built-in image_gen
input_references:
  - path: assets/brand/raster/evi-x-sticker-pack-v1.png
    role: composition reference; rejected for horn-node drift
  - path: assets/brand/raster/evi-x-avatar-v1.png
    role: approved four-node identity anchor
output_path: assets/brand/raster/evi-x-sticker-pack-v2.png
deprecated_output: assets/brand/raster/evi-x-sticker-pack-v1.png
cropped_outputs: []
reviewer: Codex visual QA
identity_gate: pass
pose_count_gate: pass
notes: Eight figures and eight horns were reviewed individually; per-sticker crops require a second review before release.
```

## V2 四节点整组校正提示词（最终实际执行）

```text
Edit the supplied EVI-X eight-pose sticker/contact sheet while preserving the same warm-ivory background, clean two-row grid, exactly eight distinct research-workflow poses, polished stylized 3D material, navy/teal/gold palette, quote-mark ears, chest prism, arrow tail, facial identity, props, spacing, and no-text layout. Use the supplied approved square avatar as the authoritative identity reference. Critical correction across EVERY ONE of the eight characters: each single gold forehead evidence horn must contain exactly FOUR and only four clearly separated luminous circular nodes, all visible and evenly spaced from horn base to tip, matching the approved avatar and representing Q-D-I-A. Count and verify all eight horns individually; no character may have three, five, hidden, merged, or extra nodes. Preserve exactly eight poses, no additional characters or partial duplicates. Do not add text, letters, numbers, logos, watermarks, trophies, crowns, laurels, medals, or official competition symbols. Output one polished production-ready landscape contact sheet.
```
