---
prompt_id: evi-x-hero-evidence-chain-v2
status: production
brand: "证见 / EVI-X"
character: "獬见"
use_case: ads-marketing
intended_tool: built-in-image-gen
target_ratio: "16:9 landscape"
applicable_modes: [public_promo]
excluded_modes: [competition_submission]
---

# 问题—数据—洞察—行动英雄图提示词

执行时使用最新批准角色母版作为 `Image 1: identity reference`。此图面向官网、路演封面与公开传播；最终发布时在后期排版中加入品牌名、口号及非官方声明，不让生图模型生成文字。

## 最终提示词

```text
Use case: ads-marketing
Asset type: cinematic brand hero image with a rigorous evidence-chain narrative
Primary request: Using Image 1 only as the exact identity reference for Xiejian, create a premium widescreen hero visual that tells one unbroken left-to-right story: Question -> Data -> Insight -> Action. The character is a guide and verifier, not a magical source of answers.
Input images: Image 1 is the approved Xiejian identity master; preserve the character exactly and do not copy the sheet layout or background
Scene/backdrop: refined midnight-navy research studio with subtle analytical grids, sparse desk evidence, and deep negative space; no recognizable competition venue or official ceremony
Subject: Xiejian stands confidently on the right, pointing toward a single continuous luminous evidence path across the center-left
Evidence path: exactly four large stages in order from left to right: an open luminous question aperture for Q, a structured cyan sample-and-data point network for D, one faceted cyan-and-gold prism for I, and one clear forward/upward arrow path for A. Connect the four stages with one thin gold-cyan trace. Keep the stages visually distinct and never imply that the data network alone proves causality.
Style/medium: cinematic stylized 3D brand illustration, premium consulting and research-technology aesthetic, precise geometry, controlled detail, no fantasy battle scene
Composition/framing: 16:9 landscape; left 60 percent contains the four-stage story and usable copy space; Xiejian occupies the right 30 percent; keep safe margins for later typography and a small disclaimer line
Lighting/mood: deep navy ambient light, warm insight-gold highlights, restrained cyan evidence glow; lucid, ambitious, trustworthy
Color palette: canonical ink navy #0A1F33, evidence teal #00B3A4, deep evidence teal #00796F, action gold #F4B942, small warm-ivory #F7F4ED highlights
Text: no generated text, no letters, no wordmark, no logo, no watermark; Q-D-I-A labels, slogan, and disclaimer will be typeset later
Identity invariants: Xiejian has exactly one centered gold evidence horn with exactly four and only four linked luminous joints mapped base-to-tip as Q-D-I-A; one vertical diamond-cut cyan-and-amber chest prism; one long midnight-navy ribbon tail ending in one cyan-and-gold triangular arrowhead; two large upright ears with mirrored gold quotation-mark/comma glyphs. Preserve the approved amber eyes, compact four-legged proportions, matte navy body, and narrow gold trim.
Constraints: all four identity invariants are fully visible; the evidence path contains exactly four stages in the correct order; the final action arrow points forward, not backward; character and path remain legible at slide-cover size
Avoid: extra characters, extra horn, wrong horn-node count, hidden chest prism, ordinary tail, missing arrowhead, generic ear markings, trophy, cup, medal, crown, laurel, official logo, competition badge, award-stage lighting, red-and-gold official aesthetic, fake charts with unreadable text, equations, busy dashboards, magical oracle imagery, text, watermark
```

## 后期排版

- 主标题建议：`让每个问题，都循证抵达行动。`
- 四节点标签：`Q 问题 / D 数据 / I 洞察 / A 行动`，由排版工具添加。
- 公开发布时添加：`证见 EVI-X 为独立研究辅助工具，非“正大杯”赛事官方产品，与赛事主办方、承办方及冠名单位无隶属、授权或合作关系。`
- `competition_submission` 模式默认不得使用该品牌英雄图。

## 验收条件

- 主证据链正好四段，顺序正确且连接连续。
- 角色四项身份不变量全部可见；证据角正好四节点。
- 画面有足够标题与免责声明安全区，且无模型生成乱码。
- 无奖杯、桂冠、官方标识或“保证获奖”的视觉暗示。

## 生成记录

```yaml
generated_at: 2026-08-03
tool: built-in image_gen
input_references:
  - path: assets/brand/raster/evi-x-hero-evidence-chain-v1.png
    role: composition reference; rejected for three-node horn drift
  - path: assets/brand/raster/evi-x-avatar-v1.png
    role: approved four-node identity anchor
output_path: assets/brand/raster/evi-x-hero-evidence-chain-v2.png
reviewer: Codex visual QA
identity_gate: pass
evidence_chain_gate: pass
notes: v1 was retained for audit but removed from production use; v2 has exactly four visible horn nodes.
```

## V2 身份校正提示词（最终实际执行）

```text
Edit the supplied EVI-X hero image while preserving its exact wide 16:9 composition, cinematic navy research observatory, left-to-right evidence chain (question mark, data network, insight prism, action arrow), lighting, materials, colors, desk objects, pose, face, quote-mark ears, chest prism, and arrow tail. Use the supplied approved square avatar as the authoritative identity reference. The ONLY essential character correction: the mascot's single gold forehead evidence horn must show exactly FOUR and only four clearly separated luminous circular nodes, all fully visible and evenly spaced from base to tip, matching the approved avatar and representing Q-D-I-A. No hidden node, no extra node, no merged node. Keep the horn elegant and proportional. Do not add any text, letters, numbers, logos, watermarks, trophies, crowns, laurels, official competition symbols, or extra characters. This is an independent non-official research-assistant brand hero. Output one polished production-ready landscape image.
```
