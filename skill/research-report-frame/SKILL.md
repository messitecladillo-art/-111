---
name: research-report-frame
description: Design theme-specific report page frames with saved project palettes. Use image generation or controlled graphics as needed, choose clear PNG, SVG or native objects, and verify real document pages without changing the text area.
---

# 报告主题页框

Create a reusable visual frame whose theme and semantic colours belong to the research. Keep the report's editable text, figures and page geometry authoritative. A frame is optional: preserve `无边框`, free chapter structure and the user's chosen application scope.

## Intake

Read the research title/object, useful regional cues, **saved project palette and version**, paper/margins, header/footer/page-number positions, permitted scope, decorative strength and selected reference materials. Obtain sparse, medium and dense representative pages. When only the topic is known, propose a reversible candidate rather than declaring a theme approved.

For competition reports, use neutral `competition_submission` assets. Resolve applicable edition/group/region/stage rules before treating decoration as permitted; a profile that prohibits decoration exports no frame. Do not copy another team's page art or insert product/school/team logos. User references guide visual composition, not asset ownership.

## Make and test a direction

The full sequence below applies to a new theme that needs concept comparison and a complete set of page variants. For an approved theme or a local colour/line edit, retain the selected design, skip new image generation, and check only affected assets and used page classes. Do not create unwanted cover/chapter variants or unrelated trial topics; use [acceptance scope](references/acceptance.md).

1. Extract one or two abstract motifs. Use [concept prompts](references/concept-prompts.md) to generate two distinct directions with the **built-in image-generation tool**. Set a transparent background for a frame/cutout. Send theme, palette and layout geometry, not answer records or private report text. Do not use an API runner or require a user key for this development step.
2. Show the directions and select a candidate for layout testing. Save the prompt, source image, references, generation receipt and selection reason. Generation success is not approval; a generated PNG may become the final frame after its actual-page checks.
3. Choose PNG, SVG or native objects according to final-size clarity and editing needs. Do not vectorize merely to satisfy a format preference. For the optional SVG/native-primitive route use [the helper geometry contract](references/geometry-and-contract.md); its two original motifs are starting points, not a compulsory design vocabulary. For PNG, inspect actual alpha, pixel dimensions, effective resolution and ornament bounds independently; the SVG helper does not validate or export PNG. Never describe an embedded bitmap as true vector.
4. Render body, chapter and cover variants on the actual sparse/medium/dense pages. Keep identical body geometry before and after decoration. Adjust only perimeter position, stroke, motif size, density and opacity. Do not shrink fonts or move text margins to make ornament fit.
5. Preserve a draft until the user selects/applies its exact version. Hash-bound approval promotes the candidate; later palette/geometry changes create a new version and require visual review again.

The default A4 example is 210×297 mm with left/right 31.8 mm and top/bottom 25.4 mm margins: body 146.4×246.2 mm. This is an example configuration, not an official universal rule. Recalculate other paper sizes and margins. The body has a minimum 3 mm outward protection area; register extra header, footer, caption and footnote exclusions.

## Deterministic helpers

The standard-library Python helpers require no image service or downloaded packages:

```powershell
python -X utf8 scripts/frame_geometry.py build --spec assets/finance-body.json --out-dir <candidate-directory>
python -X utf8 scripts/frame_geometry.py validate --spec <style.json> --svg <frame.svg>
python -X utf8 scripts/frame_geometry.py build --spec <approved-style.json> --out-dir <export-directory> --require-approved
python -X utf8 -m unittest discover -s tests -p "test_*.py"
```

Run commands from this skill's folder, or resolve the script/fixture paths against it. This optional builder writes SVG, a reusable primitive definition and a validation receipt; it does not accept or export PNG. The output directory should be a new candidate/version directory. It never applies approval itself. Local draft generation is allowed, formal mode rejects unapproved hashes.

For a different topic, adapt or add a controlled primitive motif and independently test its geometry, rather than passing arbitrary SVG/TeX through the builder. The validator's narrow allowlist intentionally rejects scripts, raster content, external references, CSS, filters and unsupported geometry.

## Deliver

Deliver the selected source image or editable graphics, style/palette references, applied page variants, actual representative samples and a concise acceptance receipt. For a complete three-variant theme, include body/chapter/cover and sparse/medium/dense samples; a local revision keeps the existing scope. Use [the acceptance checklist](references/acceptance.md). Record which requested target applications were actually tested; unexecuted checks remain pending. No-frame and framed documents must retain the same text order, page count and table breaks. In the final PDF inspect clarity, transparency edges, clipping and placement for the chosen format. Vector-object preservation is checked only when that output is explicitly requested.

Keep candidate and reviewed assets distinct. The existing SVG helper's `concept`, `vector_draft` and `approved` are its contract states, not a required conversion path for every PNG frame. Record the selected asset's exact file hash, format and review separately. Installation/skill validation verifies packaging, not report quality, rights, native software compatibility or human approval.

## 全篇衔接与独立审查

本次任务涉及跨部分变化或定稿时，沿用项目当前已确认的题名、研究范围、事实/结果版本、格式与配色依据，将受影响位置和版本交给 `$research-report-consistency` 的独立审查agent。审查不以其他skill的默认值覆盖用户选择，也不把合法的角色差异当矛盾。

只做局部任务时按变化影响核对，不扩大为全篇重写。该审查技能或独立agent不可用时，保留本技能已有核对并如实说明自查范围，不声称已完成独立审查。修复由主agent或作者执行，新的实质变化需在相应范围重查；不因审查自动发布或推进赛事状态。

## 产品 Agent 运行配置

产品接入时按角色加载本技能及所需文本资源。先读 [运行边界](references/runtime-profile.md)。所引用原报告、概念稿或全量语料若登记为本地私有材料，不随服务端分发；没有实际读取时明确缺失，不能声称已核对。工具由服务端固定白名单提供，本文中的脚本或外部工具名称不自动授予执行权限。

## 细分工作模式与共享专项

依据当前任务读取 [工作模式](references/operating-modes.md)，选择所需子任务与共享专项。用户只修改局部时保留其余已确认内容；同一事实、图表、来源和配色继续引用同一版本。
