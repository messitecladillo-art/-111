---
name: research-report-frame
description: Design theme-specific report page frames from research topics and saved project palettes. Use built-in image generation for concepts, rebuild approved directions as true vector primitives, and verify body/chapter/cover frames in real Word or LaTeX/PDF pages without changing the text area.
---

# 报告主题页框

Create a reusable visual frame whose theme and semantic colours belong to the research. Keep the report's editable text, figures and page geometry authoritative. A frame is optional: preserve `无边框`, free chapter structure and the user's chosen application scope.

## Intake

Read the research title/object, useful regional cues, **saved project palette and version**, paper/margins, header/footer/page-number positions, permitted scope, decorative strength and selected reference materials. Obtain sparse, medium and dense representative pages. When only the topic is known, propose a reversible candidate rather than declaring a theme approved.

For competition reports, use neutral `competition_submission` assets. Resolve applicable edition/group/region/stage rules before treating decoration as permitted; a profile that prohibits decoration exports no frame. Do not copy another team's page art or insert product/school/team logos. User references guide visual composition, not asset ownership.

## Make and test a direction

1. Extract one or two abstract motifs. Use [concept prompts](references/concept-prompts.md) to generate two distinct directions with the **built-in image-generation tool**. Set a transparent background for a frame/cutout. Send theme, palette and layout geometry, not answer records or private report text. Do not use an API runner or require a user key for this development step.
2. Show the directions and select a candidate for layout testing. Save the prompt, bitmap, source references, generation receipt and selection reason. Label generated images as **concepts**; generation success is not approval or vector export.
3. Reconstruct the chosen visual language using the controlled contract in [geometry and export rules](references/geometry-and-contract.md). The included builder supplies two original starting motifs, not a compulsory design vocabulary. Never place a PNG inside an SVG and call it vector.
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

Run commands from this skill's folder, or resolve the script/fixture paths against it. The builder writes SVG, a reusable primitive definition and a validation receipt; the output directory should be a new candidate/version directory. It never applies approval itself. Local draft generation is allowed, formal mode rejects unapproved hashes.

For a different topic, adapt or add a controlled primitive motif and independently test its geometry, rather than passing arbitrary SVG/TeX through the builder. The validator's narrow allowlist intentionally rejects scripts, raster content, external references, CSS, filters and unsupported geometry.

## Deliver

Deliver concept direction(s), editable vector source, style/palette references, three page variants, actual sparse/medium/dense samples and a concise acceptance receipt. Use [the acceptance checklist](references/acceptance.md). Record which target applications were actually tested; unavailable Word/WPS checks remain pending. No-frame and framed documents must retain the same text order, page count and table breaks. The final PDF's decorations must remain vector; a source SVG or native package check alone is insufficient.

Keep `concept`, `vector_draft` and `approved` distinct. Installation/skill validation verifies packaging, not report quality, rights, native software compatibility or human approval.
