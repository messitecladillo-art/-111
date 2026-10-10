---
prompt_id: evi-x-merchandise-concept-v1
status: concept_only
brand: "证见 / EVI-X"
character: "獬见"
use_case: product-mockup
intended_tool: built-in-image-gen
target_ratio: "16:9 landscape"
applicable_modes: [public_promo]
excluded_modes: [competition_submission]
---

# 证见衍生物概念板提示词

此概念板用于评估衍生潜力，不是可直接下单生产的结构工程图。量产前需要另做尺寸、材料、色差、跌落、尖角、知识产权和供应商打样验证。

## 最终提示词

```text
Use case: product-mockup
Asset type: premium merchandise family concept board
Primary request: Using Image 1 only as the exact identity reference, create a coherent premium merchandise concept family for the independent evidence-first brand EVI-X and its mascot Xiejian. Show five coordinated objects: a 12 cm desk figurine, a hard-enamel pin, an acrylic standee, an A5 research notebook, and a fabric lanyard with a small arrow-tail charm. Make the family feel useful to student researchers and professional enough for a consulting studio.
Input images: Image 1 is the approved Xiejian identity master; preserve character identity exactly on every character-bearing object
Scene/backdrop: refined warm-ivory studio tabletop with a deep-navy inset surface; clean catalog arrangement, no event venue, no ceremony, no retail packaging text
Subject: five merchandise concepts arranged as a single coordinated product family. The desk figurine is the hero object and displays the full Xiejian character. The pin uses a simplified head-horn-prism-arrow silhouette while keeping all identity signals. The acrylic standee shows the full character beside a four-node evidence path. The notebook uses an abstract four-node path and prism motif, not an official-looking crest. The lanyard uses small quotation and four-node patterns with one arrow-tail charm.
Style/medium: photorealistic high-end product mockup of stylized character merchandise; sophisticated museum-shop and research-studio aesthetic, not a children’s toy display
Composition/framing: 16:9 landscape, three-quarter tabletop view, five products clearly separated, desk figurine near center, generous negative space for later annotations
Lighting/mood: soft premium catalog lighting with subtle cyan and amber reflections; calm, tactile, collectible, credible
Color palette: canonical ink navy #0A1F33, evidence teal #00B3A4, deep evidence teal #00796F, action gold #F4B942, warm ivory #F7F4ED
Materials/textures: matte resin figurine, brushed and hard-enamel gold pin, clear edge-lit acrylic, clothbound notebook with foil-free geometric deboss, woven lanyard and a rounded safe metal charm
Text: no generated text, no letters, no price tags, no wordmark, no watermark; all labels and non-official disclaimer will be typeset later
Identity invariants: The full figurine and full-character standee must show exactly one centered gold evidence horn with exactly four and only four linked luminous joints mapped base-to-tip as Q-D-I-A; exactly one vertical diamond-cut cyan-and-amber chest prism; exactly one navy ribbon tail ending in one cyan-and-gold triangular arrowhead; and two upright ears with mirrored gold quotation-mark/comma glyphs. Simplified small marks must still encode four horn nodes, the prism, paired quotation ears, and one arrow tail without resembling a medal or official crest.
Constraints: products share one coherent design system; the figurine has a stable neutral base rather than a podium; arrow tips are visually rounded for merchandise safety; notebook and lanyard patterns preserve the four-node order; leave a clean area for later disclaimer and specifications
Avoid: trophy-shaped figurine, medal, cup, crown, laurel, podium, certificate, official seal, competition logo, sponsor logo, event color scheme, award packaging, counterfeit endorsement, sharp weapon-like horn, generic unicorn merchandise, wrong horn-node count, missing prism, ordinary tail, generic ear marks, unreadable text, watermark
```

## 后期与公开发布

- 仅将此图标注为“概念效果图”，不得暗示已经量产或获得官方授权。
- 公开展示时加入品牌系统中的完整非官方声明。
- 任何带 `EVI-X` 或“证见”字样的实物打样，必须先完成商标与域名／账号近似检索；`EVI-X` 当前仅为工作名。
- 实际生产前，将证据角与箭头尾进行圆角、拉力和小零件安全评估。

## 验收条件

- 恰好五类衍生物，材质和配色属于同一品牌系统。
- 完整角色衍生物保留四个身份不变量；简化标识仍可读出四节点、棱镜、引号耳和箭头尾。
- 没有奖杯、奖牌、桂冠、官方徽章或赛事／冠名方元素。
- 无模型生成文字；有后期说明和免责声明的安全区。

## 生成记录

```yaml
generated_at: 2026-08-03
tool: built-in image_gen
input_references:
  - path: assets/brand/raster/evi-x-avatar-v1.png
    role: approved identity reference
output_path: assets/brand/raster/evi-x-merchandise-concept-v1.png
reviewer: Codex visual QA
identity_gate: conditional_concept_only
merch_count_gate: fail_extra_collector_card
non_official_gate: pass
notes: The image is a six-object ideation board rather than the requested five-object production family. Some miniature horn nodes are not manufacturing-accurate. Keep labeled as a concept effect only; do not use for tooling or claims of production.
```
