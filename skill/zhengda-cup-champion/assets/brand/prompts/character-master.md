---
prompt_id: evi-x-character-anchor-v2
status: production
brand: "证见 / EVI-X"
character: "獬见"
use_case: stylized-concept
intended_tool: built-in-image-gen
target_ratio: "3:2 landscape"
applicable_modes: [agent_ui, public_promo]
excluded_modes: [competition_submission]
---

# 獬见角色母版提示词

V2 全身角色锚点是后续英雄图、表情包和完整角色衍生物的生产基准。V1 多视图板因跨视图节点漂移被降级为探索参考，不得直接发布。若修改已批准锚点，先把当前锚点作为身份参考，只改变明确指定的单一问题。

## V1 多视图探索提示词（已降级）

```text
Use case: stylized-concept
Asset type: premium character identity master sheet for a research-intelligence brand
Primary request: Create the canonical character sheet for Xiejian, the mascot of the independent evidence-first brand EVI-X. Xiejian is a friendly young modernized xiezhi, a compact four-legged East Asian truth-guardian creature. Make the design distinctive, intelligent, calm, premium, and reproducible across future assets.
Scene/backdrop: warm ivory studio character-sheet background with extremely subtle geometric construction lines; no environment, no floor clutter, no labels
Subject: one and only one consistent Xiejian character shown as a large three-quarter hero view, plus smaller front, side, and back turnarounds and four simple expression/gesture studies
Style/medium: polished stylized 3D animation maquette and collectible-design render; matte midnight-navy ceramic/resin body with subtle microtexture, narrow brushed-gold trim, restrained cyan energy accents, warm amber eyes; premium rather than toy-like
Composition/framing: 3:2 landscape; large hero figure on the left, clean turnarounds on the upper right, expressions on the lower right; generous separation and margins; every view anatomically consistent
Lighting/mood: soft neutral studio light with restrained amber rim light; lucid, trustworthy, precise, warm but not childish
Color palette: canonical ink navy #0A1F33, evidence teal #00B3A4, deep evidence teal #00796F, action gold #F4B942, warm ivory #F7F4ED, mist gray #E7EEF3
Materials/textures: matte ceramic/resin body, brushed-gold single horn and fine trim, clear faceted glass chest prism, satin-ribbon tail with metallic arrow tip
Text: no text, no letters, no wordmark, no watermark
Identity invariants: Keep all four invariants visible and identical in every view. (1) Exactly one centered gold evidence horn, angled slightly forward, with exactly four and only four clearly countable linked luminous joints mapped from base to tip as Q-D-I-A; do not print the letters. (2) Exactly one vertical diamond-cut chest prism with a cyan core, amber-gold refraction, and a thin gold frame. (3) Exactly one long midnight-navy ribbon tail ending in one clean cyan-and-gold triangular arrowhead. (4) Two large upright navy ears, each containing one mirrored gold quotation-mark/comma glyph so the pair reads as listening to human voices.
Character anatomy: juvenile xiezhi, four legs, short muzzle, compact agile body, small cheek fins, warm amber eyes, poised and observant expression; clearly not a unicorn, deer, dragon, cat, or dog
Constraints: exactly the same horn node count, chest prism geometry, ear glyphs, tail shape, eye color, proportions, materials, and palette in all views; the back view must still show the single arrow tail and one horn; no hidden or cropped identity feature
Avoid: a second horn, fewer or more than four horn joints, a normal furry tail, multiple tails, ordinary inner ears, missing chest prism, wings, antlers, mane, clothes, cape, crown, armor, weapon, trophy, medal, cup, official seal, competition logo, red-and-gold award aesthetic, photoreal fur, plush-toy softness, generic anime pet, text, watermark
```

## 验收条件

- 所有视图均为同一角色，且证据角都恰好四节点。
- 主视图和转面图完整显示胸口棱镜、箭头尾与引号耳。
- 只有一根角、一个棱镜、一条尾巴；无奖项或官方元素。
- 小图缩至头像尺寸后，角、耳纹、棱镜和尾箭仍可辨认。
- 角色不是“蓝色独角兽／猫／鹿”的泛化造型。

若任一身份不变量失败，不得把该图作为母版；不要通过文字说明弥补画面缺失。

## 生成记录

```yaml
generated_at: 2026-08-03
tool: built-in image_gen
input_references:
  - path: assets/brand/raster/evi-x-avatar-v1.png
    role: approved compact head and four-node identity anchor
  - path: assets/brand/raster/evi-x-hero-evidence-chain-v2.png
    role: approved full-body proportion and arrow-tail reference
output_path: assets/brand/raster/evi-x-character-anchor-v2.png
deprecated_output: assets/brand/raster/evi-x-character-master-v1.png
reviewer: Codex visual QA
identity_gate: pass
notes: V2 is the sole approved full-body production anchor; V1 remains reference-only for audit.
```

## V2 全身生产锚点提示词（最终实际执行）

```text
Use the two supplied approved EVI-X images as identity references: Image 1 is the authoritative head, ears, eyes, horn-node, and chest-prism reference; Image 2 is the authoritative full-body proportion, ribbon-tail, arrowhead, material, and color reference. Create one production-grade canonical full-body identity anchor of Xiejian, the independent evidence-first research assistant mascot. Show exactly one character in a calm three-quarter standing pose on a clean warm-ivory studio background, with no props and no environment. The entire character, horn tip, all four feet, and tail arrow must be fully inside the frame with generous margins. Preserve a compact juvenile modern xiezhi body, matte deep navy ceramic/resin surface, narrow gold trim, warm amber eyes, small cheek fins, and restrained teal energy accents. Mandatory identity invariants, all fully visible: exactly one centered gold forehead horn with exactly FOUR and only four clearly separated luminous circular nodes evenly spaced base-to-tip; exactly one vertical faceted teal-to-amber chest prism in a gold frame; exactly one long navy ribbon tail ending in one teal-and-gold triangular action arrowhead; both large upright ears, each with a mirrored gold quotation-mark/comma glyph. No second horn, antlers, wings, clothes, armor, medal, trophy, crown, laurel, official competition element, text, letters, logo, label, watermark, extra view, extra character, prop, or cast shadow that hides details. Polished stylized 3D character-design render, neutral soft studio lighting, faithful colors #0A1F33, #00B3A4, #00796F, #F4B942, and #F7F4ED. Output one crisp landscape character anchor suitable as the reference image for all future derivatives.
```
